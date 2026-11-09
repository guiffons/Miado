/**
 * Firebase Auth & Firestore Client Service
 * Initialized with configuration from firebase-applet-config.json.
 * Enforces strict RBAC, atomic handle reservation via writeBatch,
 * serverTimestamp() compliance with firestore.rules, and scoped listener cleanup.
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  updatePassword,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { listenerRegistry } from "./listenerRegistry";
import { buildTrackKey } from "../shared/keys";
import type { Visibility, PresenceState } from "../shared/types";

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId || "ai-studio-miadostreamingde-0c57b5d9-b4bf-4817-81f3-2d65f4bd82b7"
);
export const auth = getAuth(app);

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface FirebaseAuthDebugEntry {
  timestamp: string;
  action: "login" | "register" | "forgot-password" | "reset-password";
  inputEmail: string;
  normalizedEmail: string;
  firebaseCurrentUserEmail: string | null;
  emailMatchesActiveSession: boolean;
  firebaseErrorCode: string;
  firebaseErrorMessage: string;
  backendHttpStatus: number | null;
  backendErrorCode: string | null;
  accountExistsOnServer: boolean;
  resolution: string;
}

export function logFirebaseAuthDebug(
  partial: Omit<FirebaseAuthDebugEntry, "timestamp" | "firebaseCurrentUserEmail" | "emailMatchesActiveSession">
): FirebaseAuthDebugEntry {
  const currentEmail = auth.currentUser?.email ? auth.currentUser.email.toLowerCase() : null;
  const entry: FirebaseAuthDebugEntry = {
    timestamp: new Date().toISOString(),
    firebaseCurrentUserEmail: currentEmail,
    emailMatchesActiveSession: Boolean(currentEmail && currentEmail === partial.normalizedEmail),
    ...partial,
  };
  const w = window as any;
  if (!Array.isArray(w.__miadoAuthDebugLogs)) {
    w.__miadoAuthDebugLogs = [];
  }
  w.__miadoAuthDebugLogs.unshift(entry);
  if (w.__miadoAuthDebugLogs.length > 40) {
    w.__miadoAuthDebugLogs.length = 40;
  }
  console.info("[MiadoAuthDebug]", JSON.stringify(entry));
  return entry;
}

export function normalizeBareHandle(raw: unknown, fallbackSeed = "user"): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 28);
  if (cleaned.length >= 2) return cleaned;
  const fallback = String(fallbackSeed)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12) || "user";
  const digits = Math.floor(10000 + Math.random() * 90000);
  return `${fallback}${digits}`.slice(0, 28);
}

export async function generateUniqueRandomHandle(prefix = "user"): Promise<string> {
  const cleanPrefix = String(prefix || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12) || "user";
  for (let attempt = 0; attempt < 4; attempt++) {
    const digits = Math.floor(10000 + Math.random() * 90000);
    const candidate = `${cleanPrefix}${digits}`;
    try {
      const snap = await getDoc(doc(db, "handles", candidate));
      if (!snap.exists()) {
        return candidate;
      }
    } catch {
      return candidate;
    }
  }
  return `${cleanPrefix}${Math.floor(100000 + Math.random() * 900000)}`;
}

export function sanitizeImageForRules(rawUrl: unknown, maxLen: number, fallback = ""): string {
  const s = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!s || s.length > maxLen) return fallback;
  if (/^\/api\/cat-avatar\?id=[a-z0-9_]{1,40}$/.test(s)) return s;
  if (/^https:\/\/[A-Za-z0-9._~:/?#@!$&()*+,;=%-]{4,2000}$/.test(s)) return s;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  return fallback;
}

function extractSafeFirestoreCoverUrl(rawUrl: unknown): string {
  const s = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!s) return "";
  if (s.startsWith("/api/cover?")) {
    try {
      const qs = s.slice(s.indexOf("?") + 1);
      const u = new URLSearchParams(qs).get("url");
      if (u) return sanitizeImageForRules(u, 2000, "");
    } catch {}
    return "";
  }
  return sanitizeImageForRules(s, 2000, "");
}

function isCustomAvatar(url: unknown): boolean {
  const s = typeof url === "string" ? url.trim() : "";
  return Boolean(
    s &&
      s !== "/api/cat-avatar?id=cat_1" &&
      !s.startsWith("data:image/svg") &&
      !s.includes("placeholder")
  );
}

function scoreCommunityProfile(p: any, selfUid: string): number {
  if (!p) return 0;
  let score = 0;
  if (selfUid && p.uid === selfUid) score += 500;
  if (isCustomAvatar(p.avatarUrl)) score += 150;
  if (p.online && p.currentTrack && p.currentTrack !== "Silencioso no momento" && p.currentTrack !== "Ouvindo no Miado") {
    score += 80;
  }
  if (p.uid && !String(p.uid).startsWith("prof_")) score += 40;
  if (Array.isArray(p.favoriteArtists) && p.favoriteArtists.length > 0) score += 20;
  if (p.bio && p.bio !== "Ouvindo som em alta definição no Miado") score += 10;
  return score;
}

function mergeTwoCommunityProfiles(primary: any, secondary: any, selfUid: string): any {
  const bestAv = isCustomAvatar(primary.avatarUrl)
    ? primary.avatarUrl
    : isCustomAvatar(secondary.avatarUrl)
    ? secondary.avatarUrl
    : primary.avatarUrl || secondary.avatarUrl || "/api/cat-avatar?id=cat_1";
  const primaryActive = Boolean(
    primary.online &&
      primary.currentTrack &&
      primary.currentTrack !== "Silencioso no momento" &&
      primary.currentTrack !== "Ouvindo no Miado"
  );
  const secondaryActive = Boolean(
    secondary.online &&
      secondary.currentTrack &&
      secondary.currentTrack !== "Silencioso no momento" &&
      secondary.currentTrack !== "Ouvindo no Miado"
  );
  const activeSrc = primaryActive ? primary : secondaryActive ? secondary : primary;
  const favs = Array.from(
    new Set([
      ...(Array.isArray(primary.favoriteArtists) ? primary.favoriteArtists : []),
      ...(Array.isArray(secondary.favoriteArtists) ? secondary.favoriteArtists : []),
    ])
  );
  const realUid =
    primary.uid && !String(primary.uid).startsWith("prof_")
      ? primary.uid
      : secondary.uid && !String(secondary.uid).startsWith("prof_")
      ? secondary.uid
      : primary.uid || secondary.uid;

  return {
    ...secondary,
    ...primary,
    uid: realUid,
    id: primary.id || secondary.id || `prof_${realUid}`,
    avatarUrl: bestAv,
    bannerUrl: primary.bannerUrl || secondary.bannerUrl || "",
    bio: primary.bio || secondary.bio || "",
    favoriteArtists: favs,
    followedArtists: favs.map((a: string) => ({
      name: a,
      role: "Artista Favorito",
      coverUrl: `/api/artist-image?name=${encodeURIComponent(a)}`,
    })),
    online: primaryActive || secondaryActive,
    currentTrack: activeSrc.currentTrack || "",
    trackObj: activeSrc.trackObj || null,
    isSelf: Boolean(selfUid && realUid === selfUid),
  };
}

export function deduplicateCommunityProfilesList(rawList: any[], selfUid = ""): any[] {
  const byHandle = new Map<string, any>();
  for (const item of rawList) {
    if (!item) continue;
    const rawH = String(item.username || item.handle || "").trim().toLowerCase();
    if (!rawH || rawH === "@visitante" || rawH === "visitante" || rawH === "@novo_usuario" || rawH === "novo_usuario") {
      continue;
    }
    const hKey = rawH.startsWith("@") ? rawH : `@${rawH}`;
    const normalized = { ...item, username: hKey, handle: hKey };
    const existing = byHandle.get(hKey);
    if (!existing) {
      byHandle.set(hKey, normalized);
    } else {
      const sNew = scoreCommunityProfile(normalized, selfUid);
      const sOld = scoreCommunityProfile(existing, selfUid);
      const merged =
        sNew >= sOld
          ? mergeTwoCommunityProfiles(normalized, existing, selfUid)
          : mergeTwoCommunityProfiles(existing, normalized, selfUid);
      byHandle.set(hKey, merged);
    }
  }

  // Secondary pass: if two different handles have the exact same display name and one is an empty shell with default cat_1 avatar, merge into the real profile
  const byName = new Map<string, string>();
  for (const [hKey, prof] of Array.from(byHandle.entries())) {
    const normName = String(prof.name || "").trim().toLowerCase();
    if (!normName || normName === "ouvinte miado" || normName === "ouvinte" || normName === "visitante") continue;
    const prevHKey = byName.get(normName);
    if (!prevHKey || prevHKey === hKey) {
      byName.set(normName, hKey);
      continue;
    }
    const prevProf = byHandle.get(prevHKey);
    if (!prevProf) continue;
    const prevIsShell = !isCustomAvatar(prevProf.avatarUrl) && !prevProf.online;
    const currIsShell = !isCustomAvatar(prof.avatarUrl) && !prof.online;
    if (prevIsShell && !currIsShell) {
      const merged = mergeTwoCommunityProfiles(prof, prevProf, selfUid);
      byHandle.set(hKey, merged);
      byHandle.delete(prevHKey);
      byName.set(normName, hKey);
    } else if (currIsShell && !prevIsShell) {
      const merged = mergeTwoCommunityProfiles(prevProf, prof, selfUid);
      byHandle.set(prevHKey, merged);
      byHandle.delete(hKey);
    }
  }

  return Array.from(byHandle.values());
}

export function initFirebaseClient(): void {
  const w = window as any;
  let lastPresenceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPresenceSentAt = 0;
  let lastPresenceFingerprint = "";
  const syncedLikesInSession = new Set<string>();

  const resetGuestStateInApp = () => {
    localStorage.removeItem("miado_auth_token");
    localStorage.removeItem("miado_user_uid");
    localStorage.removeItem("miado_active_session_v1");
    localStorage.removeItem("miado_user_onboarded_v1");
    if (w.miadoState) {
      w.miadoState.user = {
        uid: "",
        name: "Visitante",
        username: "@visitante",
        handle: "@visitante",
        email: "",
        bio: "",
        avatarId: "cat_1",
        avatarUrl: "/api/cat-avatar?id=cat_1",
        bannerUrl: "",
        favoriteArtists: [],
        favoriteGenres: [],
        followedArtists: [],
        followingProfiles: [],
        likedTracks: [],
        playlists: [],
        recentHistory: [],
        followingCount: 0,
        followersCount: 0,
        onboardingCompleted: false,
      };
      w.miadoState.playlists = [];
      localStorage.setItem("miado_user_v5", JSON.stringify(w.miadoState.user));
      localStorage.setItem("miado_playlists_v5", JSON.stringify([]));
      if (w.miadoUI) {
        w.miadoUI.syncHeaderUserUI();
        w.miadoUI.renderSidebarPlaylists();
        if (typeof w.miadoUI.syncAccountStateAcrossApp === "function") {
          w.miadoUI.syncAccountStateAcrossApp();
        }
      }
    }
  };

  const ensureAndHydrateUser = async (
    user: User,
    opts?: {
      isGoogle?: boolean;
      isExistingLogin?: boolean;
      preferredName?: string;
      preferredHandle?: string;
      forceCreateIfMissing?: boolean;
    }
  ) => {
    const prevUid = localStorage.getItem("miado_user_uid");
    if (prevUid && prevUid !== user.uid) {
      syncedLikesInSession.clear();
      [
        "miado_user_v5",
        "miado_followed_artists_v1",
        "miado_followed_artists_v5",
        "miado_real_friends_v1",
        "miado_friends_v5",
        "miado_playlists_v5",
        "miado_recent_history_50",
        "miado_recent_history_v5",
        "miado_feed_posts_v6",
        "miado_feed_v5",
        "miado_auth_user_cache",
      ].forEach((k) => localStorage.removeItem(k));
    }
    localStorage.setItem("miado_user_uid", user.uid);
    localStorage.setItem("miado_active_session_v1", "true");
    let idToken = "";
    try {
      idToken = await user.getIdToken();
      if (idToken) {
        localStorage.setItem("miado_auth_token", idToken);
      }
    } catch {}

    const userDocRef = doc(db, "users", user.uid);
    const profDocRef = doc(db, "profiles", user.uid);
    const likesQ = query(collection(db, "users", user.uid, "likes"), limit(200));
    const followsQ = query(collection(db, "follows"), where("followerId", "==", user.uid), limit(200));
    const playlistsQ = query(collection(db, "playlists"), where("ownerId", "==", user.uid), limit(50));
    const [snap, profSnap, likesSnap, followsSnap, playlistsSnap, serverSyncRes] = await Promise.all([
      getDoc(userDocRef).catch(() => null),
      getDoc(profDocRef).catch(() => null),
      getDocs(likesQ).catch(() => null),
      getDocs(followsQ).catch(() => null),
      getDocs(playlistsQ).catch(() => null),
      fetch(`/api/user/firestore-sync?uid=${encodeURIComponent(user.uid)}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const followingProfiles: any[] = [];
    if (followsSnap && !followsSnap.empty) {
      const followeeIds = followsSnap.docs
        .map((d) => String((d.data() || {}).followeeId || ""))
        .filter(Boolean);
      const profDocs = await Promise.all(
        followeeIds.map((fid) => getDoc(doc(db, "profiles", fid)).catch(() => null))
      );
      profDocs.forEach((ps, i) => {
        if (!ps || !ps.exists()) return;
        const pd: any = ps.data() || {};
        const bare = normalizeBareHandle(String(pd.handle || ""), "user");
        followingProfiles.push({
          uid: followeeIds[i],
          name: String(pd.name || bare),
          username: `@${bare}`,
          avatarUrl: pd.avatarUrl || "/api/cat-avatar?id=cat_1",
          bio: String(pd.bio || ""),
          favoriteArtists: Array.isArray(pd.favoriteArtists) ? pd.favoriteArtists : [],
        });
      });
    }

    const firestoreLikes: any[] = [];
    if (likesSnap && !likesSnap.empty) {
      const rawLikes = likesSnap.docs.map((d) => d.data() || {});
      rawLikes.sort((a: any, b: any) => {
        const msA = typeof a.likedAt?.toMillis === "function" ? a.likedAt.toMillis() : 0;
        const msB = typeof b.likedAt?.toMillis === "function" ? b.likedAt.toMillis() : 0;
        return msB - msA;
      });
      for (const lk of rawLikes) {
        if (!lk.title || !lk.artist) continue;
        const title = String(lk.title);
        const artist = String(lk.artist);
        const durSec = Number(lk.durationSec) || 210;
        const mins = Math.floor(durSec / 60);
        const secs = Math.floor(durSec % 60);
        const durFormatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
        const streamUrl = `/api/stream?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&preferFull=1`;
        const coverUrl = lk.coverUrl
          ? `/api/cover?url=${encodeURIComponent(String(lk.coverUrl))}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
          : `/api/cover?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
        const tKey = String(lk.trackKey || buildTrackKey(title, artist));
        syncedLikesInSession.add(`${user.uid}:${tKey}`);
        firestoreLikes.push({
          id: `like_${tKey}`,
          title,
          artist,
          albumTitle: String(lk.albumTitle || "Single"),
          duration: durFormatted,
          durationSec: durSec,
          coverUrl,
          previewUrl: streamUrl,
          streamUrl,
        });
      }
    }

    const serverUser = serverSyncRes?.user || null;
    const serverFavs = Array.isArray(serverSyncRes?.favoriteArtists) ? serverSyncRes.favoriteArtists : [];
    const serverFols = Array.isArray(serverSyncRes?.followedArtists) ? serverSyncRes.followedArtists : [];
    const serverPlaylists = Array.isArray(serverSyncRes?.playlists) ? serverSyncRes.playlists : [];
    const serverLikes = Array.isArray(serverSyncRes?.likedTracks) ? serverSyncRes.likedTracks : [];
    const serverHistory = Array.isArray(serverSyncRes?.recentHistory) ? serverSyncRes.recentHistory : [];

    const firestorePlaylists: any[] = [];
    if (playlistsSnap && !playlistsSnap.empty) {
      for (const pDoc of playlistsSnap.docs) {
        const pd = pDoc.data() || {};
        if (!pd.name) continue;
        firestorePlaylists.push({
          id: pDoc.id,
          name: String(pd.name),
          description: String(pd.description || ""),
          isCollaborative: Array.isArray(pd.collaboratorIds) && pd.collaboratorIds.length > 0,
          collaborators: Array.isArray(pd.collaboratorIds) ? pd.collaboratorIds : [],
          coverUrl: pd.coverUrl || undefined,
          tracks: [],
        });
      }
    }
    const mergedPlaylists =
      serverPlaylists.length > 0
        ? serverPlaylists
        : firestorePlaylists.length > 0
        ? firestorePlaylists
        : undefined;

    if ((snap && snap.exists()) || (profSnap && profSnap.exists()) || serverUser) {
      const data = (snap && snap.exists() ? snap.data() : null) || {};
      const profData = profSnap && profSnap.exists() ? profSnap.data() : null;
      const rawHandle =
        profData?.handle ||
        data.handle ||
        data.username ||
        serverUser?.handle ||
        serverUser?.username ||
        `user${Math.floor(10000 + Math.random() * 90000)}`;
      const bareH = normalizeBareHandle(String(rawHandle), "user");
      const displayHandle = `@${bareH}`;
      const rawFavs = [
        ...(Array.isArray(data.favoriteArtists) ? data.favoriteArtists : []),
        ...(Array.isArray(profData?.favoriteArtists) ? profData.favoriteArtists : []),
        ...serverFavs,
      ];
      const rawFols = [
        ...(Array.isArray(data.followedArtists) ? data.followedArtists : []),
        ...serverFols,
      ];
      const combinedArtistNames = Array.from(
        new Set(
          [...rawFols, ...rawFavs]
            .map((item: any) => (typeof item === "string" ? item.trim() : String(item?.name || "").trim()))
            .filter(Boolean)
        )
      );

      // Se o usuário já tem conta existente (documento no Firestore ou no servidor) ou já tem artistas/onboardingCompleted,
      // nunca obrigamos a refazer o onboarding ao logar com o Google ou e-mail!
      const isOnboardingDone = Boolean(
        data.onboardingCompleted === true ||
          serverUser?.onboardingCompleted === true ||
          combinedArtistNames.length > 0 ||
          Boolean(snap && snap.exists()) ||
          Boolean(profSnap && profSnap.exists())
      );

      if (isOnboardingDone) {
        localStorage.setItem("miado_user_onboarded_v1", "true");
      }

      if (!profSnap || !profSnap.exists() || (snap && snap.exists() && data.onboardingCompleted !== true && isOnboardingDone)) {
        try {
          const safeAvatar = sanitizeImageForRules(
            profData?.avatarUrl || data.avatarUrl || serverUser?.avatarUrl || user.photoURL,
            100000,
            "/api/cat-avatar?id=cat_1"
          );
          const handleRef = doc(db, "handles", bareH);
          const handleSnap = await getDoc(handleRef).catch(() => null);
          const batch = writeBatch(db);
          if (!handleSnap || !handleSnap.exists()) {
            batch.set(handleRef, {
              uid: user.uid,
              createdAt: serverTimestamp(),
            });
          }
          if (!profSnap || !profSnap.exists()) {
            batch.set(profDocRef, {
              uid: user.uid,
              name: String(profData?.name || data.name || serverUser?.name || user.displayName || "Ouvinte Miado").slice(0, 80),
              handle: bareH,
              bio: String(profData?.bio ?? data.bio ?? serverUser?.bio ?? "").slice(0, 300),
              avatarUrl: safeAvatar,
              bannerUrl: "",
              favoriteArtists: combinedArtistNames.slice(0, 60),
              updatedAt: serverTimestamp(),
            });
          }
          if (snap && snap.exists() && data.onboardingCompleted !== true && isOnboardingDone) {
            const cleanEmail = String(data.email || user.email || "").toLowerCase();
            const privacyObj =
              data.privacy &&
              typeof data.privacy.presence === "string" &&
              typeof data.privacy.activity === "string"
                ? data.privacy
                : { presence: "public", activity: "public" };
            batch.set(userDocRef, {
              uid: user.uid,
              email: cleanEmail,
              name: String(data.name || profData?.name || user.displayName || "Ouvinte Miado").slice(0, 80),
              handle: bareH,
              bio: String(data.bio || profData?.bio || "").slice(0, 300),
              catId: String(data.catId || "cat_1").slice(0, 40),
              avatarUrl: safeAvatar,
              bannerUrl: sanitizeImageForRules(data.bannerUrl, 150000, ""),
              favoriteArtists: combinedArtistNames.slice(0, 60),
              favoriteGenres: Array.isArray(data.favoriteGenres) ? data.favoriteGenres.slice(0, 30) : [],
              followedArtists: combinedArtistNames.slice(0, 200),
              privacy: privacyObj,
              onboardingCompleted: true,
              createdAt: data.createdAt || serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        } catch {}
      }

      const resolvedPrivacy =
        data.privacy &&
        typeof data.privacy.presence === "string" &&
        typeof data.privacy.activity === "string"
          ? data.privacy
          : { presence: "public", activity: "public" };

      const combinedLikes = firestoreLikes.length > 0 ? firestoreLikes : serverLikes;

      const hydrated: Record<string, any> = {
        ...data,
        uid: user.uid,
        email: (data.email || user.email || serverUser?.email || "").toLowerCase(),
        name: profData?.name || data.name || serverUser?.name || user.displayName || "Ouvinte Miado",
        bio: profData?.bio ?? data.bio ?? serverUser?.bio ?? "",
        avatarUrl: profData?.avatarUrl || data.avatarUrl || serverUser?.avatarUrl || "/api/cat-avatar?id=cat_1",
        handle: displayHandle,
        username: displayHandle,
        favoriteArtists: combinedArtistNames.slice(0, 60),
        followedArtists: combinedArtistNames,
        ...(combinedLikes.length > 0 ? { likedTracks: combinedLikes } : {}),
        ...(mergedPlaylists ? { playlists: mergedPlaylists } : {}),
        ...(serverHistory.length > 0 ? { recentHistory: serverHistory } : {}),
        ...(followingProfiles.length > 0 ? { followingProfiles } : {}),
        privacy: resolvedPrivacy,
        onboardingCompleted: isOnboardingDone,
      };
      if (w.miadoState) {
        w.miadoState.hydrateFromFirestore(hydrated);
      }
      return hydrated;
    }

    if (!opts?.forceCreateIfMissing) {
      return null;
    }

    const cleanEmail = (user.email || `user_${user.uid.slice(0, 8)}@miado.app`).toLowerCase();
    const cleanName = (
      opts?.preferredName ||
      user.displayName ||
      cleanEmail.split("@")[0] ||
      "Ouvinte Miado"
    ).slice(0, 80);

    const isGoogleProvider =
      Boolean(opts?.isGoogle) ||
      user.providerData?.some((p) => p.providerId === "google.com");

    let bareHandle = "";
    if (isGoogleProvider && !opts?.preferredHandle) {
      bareHandle = await generateUniqueRandomHandle("user");
    } else if (opts?.preferredHandle) {
      const candidate = normalizeBareHandle(opts.preferredHandle, "user");
      try {
        const hSnap = await getDoc(doc(db, "handles", candidate));
        if (!hSnap.exists() || hSnap.data()?.uid === user.uid) {
          bareHandle = candidate;
        } else {
          bareHandle = await generateUniqueRandomHandle(candidate.slice(0, 10) || "user");
        }
      } catch {
        bareHandle = candidate;
      }
    } else {
      bareHandle = await generateUniqueRandomHandle("user");
    }

    const safeAvatar = sanitizeImageForRules(
      user.photoURL,
      100000,
      "/api/cat-avatar?id=cat_1"
    );
    const privacy = { presence: "public" as Visibility, activity: "public" as Visibility };

    try {
      const batch = writeBatch(db);
      batch.set(userDocRef, {
        uid: user.uid,
        email: cleanEmail,
        name: cleanName,
        handle: bareHandle,
        bio: "",
        catId: "cat_1",
        avatarUrl: safeAvatar,
        bannerUrl: "",
        favoriteArtists: [],
        favoriteGenres: [],
        followedArtists: [],
        privacy,
        onboardingCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, "handles", bareHandle), {
        uid: user.uid,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, "profiles", user.uid), {
        uid: user.uid,
        name: cleanName,
        handle: bareHandle,
        bio: "",
        avatarUrl: safeAvatar,
        bannerUrl: "",
        favoriteArtists: [],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      console.warn("Firestore initial profile creation warning:", err);
    }

    const createdProfile = {
      uid: user.uid,
      email: cleanEmail,
      name: cleanName,
      handle: `@${bareHandle}`,
      username: `@${bareHandle}`,
      bio: "",
      catId: "cat_1",
      avatarUrl: safeAvatar,
      bannerUrl: "",
      favoriteArtists: [],
      favoriteGenres: [],
      followedArtists: [],
      privacy,
      onboardingCompleted: false,
    };

    if (w.miadoState) {
      w.miadoState.hydrateFromFirestore(createdProfile);
    }
    return createdProfile;
  };

  try {
    w.miadoFirestore = {
      app,
      db,
      auth,
      listenerRegistry,
      currentUser: null as User | null,

      async getIdToken(forceRefresh = false): Promise<string | null> {
        if (!auth.currentUser) return null;
        try {
          return await auth.currentUser.getIdToken(forceRefresh);
        } catch {
          return null;
        }
      },

      async hydrateCurrentUser() {
        const user = auth.currentUser || this.currentUser;
        if (!user) return null;
        this.currentUser = user;
        const hydrated = await ensureAndHydrateUser(user, { forceCreateIfMissing: false });
        this.subscribeLiveCommunity();
        return hydrated;
      },

      async init() {
        onAuthStateChanged(auth, async (user) => {
          const hadFirebaseUser = Boolean(this.currentUser);
          this.currentUser = user;
          if (user) {
            try {
              const token = await user.getIdToken();
              localStorage.setItem("miado_auth_token", token);
              localStorage.setItem("miado_user_uid", user.uid);
              localStorage.setItem("miado_active_session_v1", "true");
              const hydrated = await ensureAndHydrateUser(user, { forceCreateIfMissing: false });
              this.subscribeLiveCommunity();
              if (!hydrated || hydrated.onboardingCompleted !== true) {
                if (typeof w.miadoMountOnboarding === "function") {
                  w.miadoMountOnboarding();
                }
              }
            } catch (e) {
              console.warn("Firestore hydrate warning:", e);
            }
          } else {
            if (hadFirebaseUser) {
              listenerRegistry.disposeAll();
              resetGuestStateInApp();
            }
            const hasBackendSession = Boolean(
              localStorage.getItem("miado_active_session_v1") === "true" &&
                localStorage.getItem("miado_auth_token") &&
                (localStorage.getItem("miado_user_onboarded_v1") === "true" ||
                  (w.miadoState?.user?.email &&
                    w.miadoState.user.email !== "usr_guest@miado.app" &&
                    w.miadoState.user.onboardingCompleted !== false))
            );
            if (hasBackendSession) {
              this.subscribeLiveCommunity();
              return;
            }
            if (typeof w.miadoMountOnboarding === "function") {
              w.miadoMountOnboarding();
            }
          }
        });
      },

      async loginWithEmail(email: string, password: string) {
        const cleanEmail = email.trim().toLowerCase();
        // Caso 1: Usuário já está autenticado no Google com este mesmo e-mail e quer entrar/vincular senha
        if (
          auth.currentUser &&
          auth.currentUser.email &&
          auth.currentUser.email.toLowerCase() === cleanEmail
        ) {
          const hasPasswordProvider = auth.currentUser.providerData?.some(
            (p) => p.providerId === "password"
          );
          if (!hasPasswordProvider) {
            let linkStatus = "linked";
            try {
              const credential = EmailAuthProvider.credential(cleanEmail, password);
              await linkWithCredential(auth.currentUser, credential);
            } catch (linkErr: any) {
              const lCode = String(linkErr?.code || "").toLowerCase();
              linkStatus = lCode || "link_fallback";
              if (lCode.includes("provider-already-linked")) {
                await updatePassword(auth.currentUser, password).catch(() => {});
              }
            }
            const token = await auth.currentUser.getIdToken();
            localStorage.setItem("miado_auth_token", token);
            const linkRes = await fetch("/api/auth/link-password", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ email: cleanEmail, password }),
            }).catch(() => null);
            logFirebaseAuthDebug({
              action: "login",
              inputEmail: email,
              normalizedEmail: cleanEmail,
              firebaseErrorCode: linkStatus,
              firebaseErrorMessage: "Google active session password link",
              backendHttpStatus: linkRes?.status || 200,
              backendErrorCode: null,
              accountExistsOnServer: true,
              resolution: "google_session_password_linked",
            });
            const profile = await ensureAndHydrateUser(auth.currentUser, {
              isGoogle: true,
              isExistingLogin: true,
              forceCreateIfMissing: true,
            });
            this.subscribeLiveCommunity();
            return {
              ok: true,
              uid: auth.currentUser.uid,
              email: cleanEmail,
              user: auth.currentUser,
              token,
              profile,
              linkedToGoogleAccount: true,
            };
          }
        }

        // Busca metadados salvos localmente para envio ao servidor em caso de recuperação
        let cachedMeta: any = {};
        try {
          const savedList = JSON.parse(localStorage.getItem("miado_saved_accounts_v1") || "[]");
          if (Array.isArray(savedList)) {
            const match = savedList.find(
              (a: any) => a && String(a.email || "").toLowerCase().trim() === cleanEmail
            );
            if (match) cachedMeta = match;
          }
        } catch {}

        try {
          const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
          const token = await cred.user.getIdToken();
          localStorage.setItem("miado_auth_token", token);
          const srvLoginRes = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ email: cleanEmail, password, firebaseErrorCode: "OK" }),
          }).catch(() => null);
          const srvLoginData = srvLoginRes ? await srvLoginRes.json().catch(() => null) : null;
          if (srvLoginData && srvLoginData.ok && w.miadoState && typeof w.miadoState.applyAccountPayload === "function") {
            w.miadoState.applyAccountPayload(srvLoginData);
          }
          logFirebaseAuthDebug({
            action: "login",
            inputEmail: email,
            normalizedEmail: cleanEmail,
            firebaseErrorCode: "OK",
            firebaseErrorMessage: "Firebase signInWithEmailAndPassword succeeded",
            backendHttpStatus: srvLoginRes?.status || 200,
            backendErrorCode: null,
            accountExistsOnServer: true,
            resolution: "firebase_native_login_success",
          });
          const profile = await ensureAndHydrateUser(cred.user, {
            isGoogle: false,
            isExistingLogin: true,
            forceCreateIfMissing: true,
          });
          this.subscribeLiveCommunity();
          return {
            ok: true,
            uid: cred.user.uid,
            email: cleanEmail,
            user: cred.user,
            token,
            profile,
            linkedToGoogleAccount: false,
          };
        } catch (err: any) {
          const fbErrCode = String(err?.code || "auth/unknown");
          const fbErrMsg = String(err?.message || "");
          // Autentica diretamente no servidor (/api/auth/login) comparando o e-mail inserido e o status da API
          const srvRes = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: cleanEmail,
              password,
              firebaseErrorCode: fbErrCode,
              name: cachedMeta?.name || cachedMeta?.user?.name || "",
              username: cachedMeta?.username || cachedMeta?.user?.username || "",
              handle: cachedMeta?.username || cachedMeta?.user?.handle || "",
              avatarUrl: cachedMeta?.avatarUrl || cachedMeta?.user?.avatarUrl || "",
              favoriteArtists: cachedMeta?.user?.favoriteArtists || [],
            }),
          }).catch(() => null);
          const srvData = srvRes ? await srvRes.json().catch(() => null) : null;

          logFirebaseAuthDebug({
            action: "login",
            inputEmail: email,
            normalizedEmail: cleanEmail,
            firebaseErrorCode: fbErrCode,
            firebaseErrorMessage: fbErrMsg,
            backendHttpStatus: srvRes?.status || null,
            backendErrorCode: srvData?.errorCode || srvData?.error || null,
            accountExistsOnServer: Boolean(srvData?.accountExists ?? srvData?.ok),
            resolution: srvData?.ok
              ? srvData?.debug?.resolution || "backend_existing_account_authenticated"
              : srvData?.debug?.resolution || "login_rejected",
          });

          if (srvData && srvData.ok) {
            const resolvedUid = String(
              srvData.account?.uid || srvData.user?.uid || `usr_${Date.now()}`
            );
            const resolvedToken = String(srvData.token || "");
            if (resolvedToken) {
              localStorage.setItem("miado_auth_token", resolvedToken);
            }
            localStorage.setItem("miado_user_uid", resolvedUid);
            localStorage.setItem("miado_active_session_v1", "true");
            localStorage.setItem("miado_user_onboarded_v1", "true");

            if (w.miadoState && typeof w.miadoState.applyAccountPayload === "function") {
              w.miadoState.applyAccountPayload(srvData);
            }
            this.subscribeLiveCommunity();
            return {
              ok: true,
              uid: resolvedUid,
              email: cleanEmail,
              user: srvData.user,
              token: resolvedToken,
              profile: srvData.user,
              linkedToGoogleAccount: Boolean(srvData.linkedToGoogleAccount),
              isExistingAccount: true,
            };
          }

          const customErr: any = new Error(
            (srvData && srvData.error) || "E-mail ou senha incorretos."
          );
          customErr.code = (srvData && srvData.errorCode) || "auth/invalid-credential";
          throw customErr;
        }
      },

      async registerWithEmail(
        email: string,
        password: string,
        metaOrName?: { name?: string; handle?: string; avatarUrl?: string } | string,
        maybeHandle?: string
      ) {
        const cleanEmail = email.trim().toLowerCase();
        const meta: { name?: string; handle?: string; avatarUrl?: string } =
          typeof metaOrName === "string"
            ? { name: metaOrName, handle: maybeHandle }
            : metaOrName || {};

        // Se já estiver logado com Google no mesmo e-mail, apenas associa a senha à conta Google existente!
        if (
          auth.currentUser &&
          auth.currentUser.email &&
          auth.currentUser.email.toLowerCase() === cleanEmail
        ) {
          try {
            await linkWithCredential(
              auth.currentUser,
              EmailAuthProvider.credential(cleanEmail, password)
            );
          } catch (linkErr: any) {
            const lCode = String(linkErr?.code || "").toLowerCase();
            if (lCode.includes("provider-already-linked")) {
              await updatePassword(auth.currentUser, password).catch(() => {});
            }
          }
          const token = await auth.currentUser.getIdToken();
          localStorage.setItem("miado_auth_token", token);
          await fetch("/api/auth/link-password", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ email: cleanEmail, password }),
          }).catch(() => {});
          const profile = await ensureAndHydrateUser(auth.currentUser, {
            isGoogle: true,
            isExistingLogin: true,
            preferredName: meta?.name,
            preferredHandle: meta?.handle,
            forceCreateIfMissing: true,
          });
          this.subscribeLiveCommunity();
          return {
            ok: true,
            uid: auth.currentUser.uid,
            email: cleanEmail,
            user: auth.currentUser,
            token,
            profile,
            linkedToGoogleAccount: true,
            isExistingAccount: true,
          };
        }

        try {
          const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          try {
            await sendEmailVerification(cred.user);
          } catch {}
          const token = await cred.user.getIdToken();
          localStorage.setItem("miado_auth_token", token);
          const profile = await ensureAndHydrateUser(cred.user, {
            isGoogle: false,
            preferredName: meta?.name,
            preferredHandle: meta?.handle,
            forceCreateIfMissing: true,
          });
          this.subscribeLiveCommunity();
          return {
            ok: true,
            uid: cred.user.uid,
            email: cleanEmail,
            user: cred.user,
            token,
            profile,
            linkedToGoogleAccount: false,
          };
        } catch (regErr: any) {
          const regCode = String(regErr?.code || "").toLowerCase();
          if (regCode.includes("weak-password") || regCode.includes("invalid-email")) {
            throw regErr;
          }
          // Registra ou vincula diretamente no servidor (/api/auth/register)
          const cleanName = meta?.name || cleanEmail.split("@")[0] || "Ouvinte";
          const cleanHandle =
            meta?.handle || `@${cleanEmail.split("@")[0].replace(/[^a-z0-9_.]/gi, "") || "ouvinte"}`;
          const srvRes = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: cleanEmail,
              password,
              name: cleanName,
              username: cleanHandle,
              handle: cleanHandle,
            }),
          }).catch(() => null);
          const srvData = srvRes ? await srvRes.json().catch(() => null) : null;

          logFirebaseAuthDebug({
            action: "register",
            inputEmail: email,
            normalizedEmail: cleanEmail,
            firebaseErrorCode: String(regErr?.code || "auth/register-fallback"),
            firebaseErrorMessage: String(regErr?.message || ""),
            backendHttpStatus: srvRes?.status || null,
            backendErrorCode: srvData?.error || null,
            accountExistsOnServer: Boolean(srvData?.isExistingAccount || srvData?.error === "email_already_registered"),
            resolution: srvData?.ok ? "registered_on_backend" : srvData?.error || "register_failed",
          });

          if (srvData && srvData.ok) {
            const resolvedUid = String(
              srvData.account?.uid || srvData.user?.uid || `usr_${Date.now()}`
            );
            const resolvedToken = String(srvData.token || "");
            if (resolvedToken) {
              localStorage.setItem("miado_auth_token", resolvedToken);
            }
            localStorage.setItem("miado_user_uid", resolvedUid);
            localStorage.setItem("miado_active_session_v1", "true");
            if (w.miadoState && typeof w.miadoState.applyAccountPayload === "function") {
              w.miadoState.applyAccountPayload(srvData);
            }
            this.subscribeLiveCommunity();
            return {
              ok: true,
              uid: resolvedUid,
              email: cleanEmail,
              user: srvData.user,
              token: resolvedToken,
              profile: srvData.user,
              linkedToGoogleAccount: Boolean(srvData.linkedToGoogleAccount),
              isExistingAccount: Boolean(srvData.isExistingAccount || srvData.linkedToGoogleAccount),
            };
          }

          if (srvData && srvData.error === "email_already_registered") {
            // Se o usuário já tem conta e digitou a senha certa na aba Criar Conta, autentica direto!
            try {
              const loginFallback = await this.loginWithEmail(cleanEmail, password);
              if (loginFallback && loginFallback.ok) {
                return { ...loginFallback, isExistingAccount: true };
              }
            } catch {}
            const dupErr: any = new Error("Este e-mail já está cadastrado. Use a aba Entrar.");
            dupErr.code = "auth/email-already-in-use";
            throw dupErr;
          }

          throw regErr;
        }
      },

      async sendPasswordReset(email: string) {
        const cleanEmail = email.trim().toLowerCase();
        // 1. Valida primeiro no servidor se o e-mail pertence a uma conta existente antes de qualquer ação
        const srvRes = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail }),
        }).catch(() => null);
        const srvData = srvRes ? await srvRes.json().catch(() => null) : null;

        if (!srvRes || !srvRes.ok || !srvData?.ok) {
          const errCode = String(srvData?.errorCode || "auth/user-not-found");
          const errMsg = String(
            srvData?.error ||
              "Nenhuma conta cadastrada com este e-mail. Verifique o endereço digitado ou crie uma conta primeiro."
          );
          logFirebaseAuthDebug({
            action: "forgot-password",
            inputEmail: email,
            normalizedEmail: cleanEmail,
            firebaseErrorCode: errCode,
            firebaseErrorMessage: errMsg,
            backendHttpStatus: srvRes?.status || 404,
            backendErrorCode: errCode,
            accountExistsOnServer: false,
            resolution: "rejected_unregistered_email_before_reset",
          });
          const err: any = new Error(errMsg);
          err.code = errCode;
          throw err;
        }

        // 2. Com o e-mail validado no servidor, registra o log de depuração estruturado
        logFirebaseAuthDebug({
          action: "forgot-password",
          inputEmail: email,
          normalizedEmail: cleanEmail,
          firebaseErrorCode: "OK",
          firebaseErrorMessage: "Miado custom password reset email prepared (valid for 24h)",
          backendHttpStatus: srvRes.status,
          backendErrorCode: null,
          accountExistsOnServer: true,
          resolution: "password_reset_email_liquid_glass_prepared",
        });

        return {
          ok: true,
          accountExists: true,
          isEmailValidated: Boolean(srvData.isEmailValidated ?? true),
          email: cleanEmail,
          code: String(srvData.code || ""),
          resetLink: String(srvData.resetLink || ""),
          emailDispatched: Boolean(srvData.emailDispatched),
          emailPreviewUrl: String(srvData.emailPreviewUrl || ""),
          expiresInHours: Number(srvData.expiresInHours || 24),
          expiresInMinutes: Number(srvData.expiresInMinutes || 1440),
          message:
            srvData.message ||
            `Enviamos o e-mail no estilo Miado para ${cleanEmail} com validade de 24 horas e código de 6 dígitos! Verifique sua caixa de entrada.`,
        };
      },

      async openMiadoEmailModal(emailPreviewUrl: string, onSelectCode?: (code: string) => void) {
        if (!emailPreviewUrl) return;
        try {
          const jsonUrl = `${emailPreviewUrl}${emailPreviewUrl.includes("?") ? "&" : "?"}format=json`;
          const res = await fetch(jsonUrl);
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok) return;

          const existingModal = document.getElementById("miado-custom-email-viewer-modal");
          if (existingModal) existingModal.remove();

          const overlay = document.createElement("div");
          overlay.id = "miado-custom-email-viewer-modal";
          overlay.style.cssText =
            "position:fixed;inset:0;z-index:99999;background:rgba(4,2,10,0.86);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:16px;";

          const card = document.createElement("div");
          card.style.cssText =
            "width:100%;max-width:560px;max-height:92vh;background:#0f081d;border:1px solid rgba(192,132,252,0.42);border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 28px 80px rgba(0,0,0,0.8);";

          const topBar = document.createElement("div");
          topBar.style.cssText =
            "padding:14px 18px;background:rgba(24,14,42,0.95);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:12px;";
          topBar.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;min-width:0;">
              <img src="/assets/aistudio/thumbnail_7fd222f18747391112b3e415abb27c67a303376a_alpha_45d028e7.jpg" alt="Miado" style="width:32px;height:32px;border-radius:9px;object-fit:cover;border:1px solid rgba(192,132,252,0.5);" />
              <div style="min-width:0;">
                <div style="font-size:0.78rem;font-weight:800;color:#f3e8ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.subject || "Recuperação de Senha • Miado"}</div>
                <div style="font-size:0.7rem;color:#a78bfa;">De: ${data.from || "Miado <seguranca@miado.app>"} • Para: ${data.email}</div>
              </div>
            </div>
          `;

          const closeBtn = document.createElement("button");
          closeBtn.type = "button";
          closeBtn.textContent = "Fechar";
          closeBtn.style.cssText =
            "padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#e2e8f0;font-size:0.75rem;font-weight:700;cursor:pointer;";
          closeBtn.addEventListener("click", () => overlay.remove());
          topBar.appendChild(closeBtn);

          const iframe = document.createElement("iframe");
          iframe.style.cssText = "width:100%;height:470px;border:none;background:#090511;";
          iframe.srcdoc = String(data.html || "");

          const footerBar = document.createElement("div");
          footerBar.style.cssText =
            "padding:12px 18px;background:rgba(20,11,36,0.98);border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:10px;";

          const codeNote = document.createElement("div");
          codeNote.style.cssText = "font-size:0.76rem;color:#cbd5e1;font-weight:600;";
          codeNote.textContent = "E-mail autenticado pelo servidor Miado & Firebase";

          const useCodeBtn = document.createElement("button");
          useCodeBtn.type = "button";
          useCodeBtn.textContent = `Copiar código (${data.code}) para o formulário`;
          useCodeBtn.style.cssText =
            "padding:8px 14px;border-radius:10px;background:linear-gradient(135deg,#a855f7,#ec4899);border:none;color:#fff;font-size:0.78rem;font-weight:800;cursor:pointer;";
          useCodeBtn.addEventListener("click", () => {
            if (navigator.clipboard && data.code) {
              navigator.clipboard.writeText(String(data.code)).catch(() => {});
            }
            if (onSelectCode && data.code) {
              onSelectCode(String(data.code));
            }
            overlay.remove();
          });

          footerBar.appendChild(codeNote);
          footerBar.appendChild(useCodeBtn);
          card.appendChild(topBar);
          card.appendChild(iframe);
          card.appendChild(footerBar);
          overlay.appendChild(card);
          overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
          });
          document.body.appendChild(overlay);
        } catch {}
      },

      async resendVerificationEmail() {
        if (!auth.currentUser) return false;
        await sendEmailVerification(auth.currentUser);
        return true;
      },

      async loginWithGoogle() {
        const provider = new GoogleAuthProvider();
        let cred;
        if (
          auth.currentUser &&
          !auth.currentUser.isAnonymous &&
          !auth.currentUser.providerData?.some((p) => p.providerId === "google.com")
        ) {
          try {
            cred = await linkWithPopup(auth.currentUser, provider);
          } catch {
            cred = await signInWithPopup(auth, provider);
          }
        } else {
          cred = await signInWithPopup(auth, provider);
        }
        const token = await cred.user.getIdToken();
        localStorage.setItem("miado_auth_token", token);
        localStorage.setItem("miado_user_uid", cred.user.uid);
        localStorage.setItem("miado_active_session_v1", "true");

        let backendGoogle: any = null;
        try {
          const gRes = await fetch("/api/auth/google", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              uid: cred.user.uid,
              email: cred.user.email || "",
              name: cred.user.displayName || "",
              avatarUrl: cred.user.photoURL || "",
            }),
          });
          backendGoogle = await gRes.json().catch(() => null);
          if (backendGoogle && backendGoogle.ok && w.miadoState && typeof w.miadoState.applyAccountPayload === "function") {
            w.miadoState.applyAccountPayload(backendGoogle);
          }
        } catch {}

        const profile = await ensureAndHydrateUser(cred.user, {
          isGoogle: true,
          isExistingLogin: Boolean(backendGoogle?.isExistingAccount),
          forceCreateIfMissing: true,
        });
        this.subscribeLiveCommunity();
        return {
          user: cred.user,
          token,
          profile,
          isExistingAccount: Boolean(backendGoogle?.isExistingAccount || profile?.onboardingCompleted),
        };
      },

      async logout() {
        if (this.currentUser) {
          try {
            await setDoc(doc(db, "presence", this.currentUser.uid), {
              uid: this.currentUser.uid,
              visibility: "public",
              state: "idle",
              updatedAt: serverTimestamp(),
            });
          } catch {}
        }
        listenerRegistry.disposeAll();
        try {
          await signOut(auth);
        } catch {}
        this.currentUser = null;
        resetGuestStateInApp();
        if (typeof w.miadoMountOnboarding === "function") {
          w.miadoMountOnboarding();
        }
      },

      async deleteAccount() {
        const activeUser = auth.currentUser || this.currentUser;
        if (activeUser) {
          const uid = activeUser.uid;
          try {
            const profSnap = await getDoc(doc(db, "profiles", uid));
            const oldHandle = profSnap.exists() ? profSnap.data()?.handle : null;
            const batch = writeBatch(db);
            batch.delete(doc(db, "users", uid));
            batch.delete(doc(db, "profiles", uid));
            batch.delete(doc(db, "presence", uid));
            if (oldHandle && typeof oldHandle === "string") {
              batch.delete(doc(db, "handles", oldHandle.replace(/^@+/, "")));
            }
            await batch.commit();
          } catch (e) {
            console.warn("Error deleting user docs in Firestore:", e);
          }
          try {
            const token = await activeUser.getIdToken().catch(() => "");
            await fetch("/api/account", {
              method: "DELETE",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }).catch(() => {});
          } catch {}
          try {
            await activeUser.delete();
          } catch (e) {
            console.warn("Error deleting Firebase Auth user:", e);
          }
        }
        listenerRegistry.disposeAll();
        try {
          await signOut(auth);
        } catch {}
        this.currentUser = null;
        localStorage.clear();
        resetGuestStateInApp();
        if (typeof w.miadoMountOnboarding === "function") {
          w.miadoMountOnboarding();
        }
      },

      async syncProfileFollow(targetUid: string, isFollowing: boolean) {
        const activeUser = auth.currentUser || this.currentUser;
        const cleanTarget = String(targetUid || "").trim();
        if (!activeUser || !cleanTarget || cleanTarget === activeUser.uid) return;
        const followRef = doc(db, "follows", `${activeUser.uid}_${cleanTarget}`);
        try {
          if (isFollowing) {
            await setDoc(followRef, {
              followerId: activeUser.uid,
              followeeId: cleanTarget,
              createdAt: serverTimestamp(),
            });
          } else {
            await deleteDoc(followRef);
          }
        } catch (err) {
          console.warn("Firestore syncProfileFollow warning:", err);
        }
      },

      async syncTrackLike(track: any, isLiked: boolean) {
        const activeUser = auth.currentUser || this.currentUser;
        if (!activeUser || !track || !track.title) return;
        const uid = activeUser.uid;
        const title = String(track.title || "Faixa").trim().slice(0, 200);
        const artist = String(track.artist || "Artista").trim().slice(0, 200);
        if (!title || !artist) return;
        const trackKey = buildTrackKey(title, artist).slice(0, 150);
        if (!trackKey) return;
        const likeRef = doc(db, "users", uid, "likes", trackKey);

        try {
          if (isLiked) {
            const albumTitle = String(track.albumTitle || "Single").trim().slice(0, 200);
            const coverUrl = extractSafeFirestoreCoverUrl(track.coverUrl);
            let durSec = Number(track.durationSec) || 0;
            if (!durSec && typeof track.duration === "string" && track.duration.includes(":")) {
              const parts = track.duration.split(":");
              durSec = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
            }
            durSec = Math.max(0, Math.min(7200, Math.round(durSec || 210)));
            const likePayload: Record<string, any> = {
              trackKey,
              title,
              artist,
              albumTitle,
              durationSec: durSec,
              likedAt: serverTimestamp(),
            };
            // As regras do Firestore rejeitam coverUrl vazio; só envia quando houver uma URL válida
            if (coverUrl && coverUrl.length >= 10) {
              likePayload.coverUrl = coverUrl;
            }
            await setDoc(likeRef, likePayload);
            syncedLikesInSession.add(`${uid}:${trackKey}`);
          } else {
            await deleteDoc(likeRef);
            syncedLikesInSession.delete(`${uid}:${trackKey}`);
          }
        } catch (err) {
          console.warn("Firestore syncTrackLike warning:", err);
        }
      },

      async saveUserState(stateObj: any) {
        const activeUser = auth.currentUser || this.currentUser;
        if (!activeUser || !stateObj) return;
        const uid = activeUser.uid;
        try {
          const userDocRef = doc(db, "users", uid);
          const existingSnap = await getDoc(userDocRef);
          const existingData = existingSnap.exists() ? existingSnap.data() : null;

          const cleanEmail = (
            existingData?.email ||
            activeUser.email ||
            stateObj.user?.email ||
            `user_${uid.slice(0, 8)}@miado.app`
          ).toLowerCase();
          const cleanName = String(stateObj.user?.name || existingData?.name || "Ouvinte Miado")
            .trim()
            .slice(0, 80) || "Ouvinte Miado";
          const newBareHandle = normalizeBareHandle(
            stateObj.user?.username || stateObj.user?.handle || existingData?.handle || cleanName
          );
          const oldBareHandle = existingData?.handle ? normalizeBareHandle(existingData.handle) : null;

          let finalHandle = newBareHandle;
          const handleRef = doc(db, "handles", finalHandle);
          const handleSnap = await getDoc(handleRef).catch(() => null);
          if (handleSnap && handleSnap.exists() && handleSnap.data()?.uid !== uid) {
            if (oldBareHandle && oldBareHandle !== finalHandle) {
              const oldSnap = await getDoc(doc(db, "handles", oldBareHandle)).catch(() => null);
              if (!oldSnap || !oldSnap.exists() || oldSnap.data()?.uid === uid) {
                finalHandle = oldBareHandle;
              } else {
                finalHandle = await generateUniqueRandomHandle(newBareHandle.slice(0, 10) || "user");
              }
            } else {
              finalHandle = await generateUniqueRandomHandle(newBareHandle.slice(0, 10) || "user");
            }
          }

          const safeAvatar = sanitizeImageForRules(
            stateObj.user?.avatarUrl,
            100000,
            "/api/cat-avatar?id=cat_1"
          );
          const safeBanner = sanitizeImageForRules(stateObj.user?.bannerUrl, 150000, "");
          const privacy = {
            presence: (stateObj.user?.privacy?.presence || existingData?.privacy?.presence || "public") as Visibility,
            activity: (stateObj.user?.privacy?.activity || existingData?.privacy?.activity || "public") as Visibility,
          };

          const rawFollowedSource = Array.isArray(stateObj.followedArtists)
            ? stateObj.followedArtists
            : Array.isArray(stateObj.user?.followedArtists)
            ? stateObj.user.followedArtists
            : [];
          const cleanFollowedNames: string[] = Array.from(
            new Set<string>(
              rawFollowedSource
                .map((item: any): string =>
                  typeof item === "string" ? item.trim() : String(item?.name || "").trim()
                )
                .filter((s: string) => s.length > 0 && s.length <= 100)
            )
          ).slice(0, 200);

          const rawFavSource = Array.isArray(stateObj.user?.favoriteArtists)
            ? stateObj.user.favoriteArtists
            : [];
          const cleanFavNames: string[] =
            cleanFollowedNames.length > 0
              ? cleanFollowedNames.slice(0, 60)
              : Array.from(
                  new Set<string>(
                    rawFavSource
                      .map((item: any): string =>
                        typeof item === "string" ? item.trim() : String(item?.name || "").trim()
                      )
                      .filter((s: string) => s.length > 0 && s.length <= 100)
                  )
                ).slice(0, 60);

          const cleanGenres: string[] = Array.isArray(stateObj.user?.favoriteGenres)
            ? stateObj.user.favoriteGenres
                .map((g: any) => String(g || "").trim())
                .filter((g: string) => g.length > 0 && g.length <= 60)
                .slice(0, 30)
            : [];

          // 1. Save /users/{uid} independently so followedArtists & favoriteArtists always persist
          await setDoc(userDocRef, {
            uid,
            email: cleanEmail,
            name: cleanName,
            handle: finalHandle,
            bio: String(stateObj.user?.bio || "").slice(0, 300),
            catId: String(stateObj.user?.avatarId || "cat_1").slice(0, 40),
            avatarUrl: safeAvatar,
            bannerUrl: safeBanner,
            favoriteArtists: cleanFavNames,
            favoriteGenres: cleanGenres,
            followedArtists: cleanFollowedNames.length > 0 ? cleanFollowedNames : cleanFavNames,
            privacy,
            onboardingCompleted: Boolean(stateObj.user?.onboardingCompleted ?? true),
            createdAt: existingData?.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          // 2. Save /handles/{finalHandle} (only if not yet created!) and /profiles/{uid}
          try {
            const finalHandleRef = doc(db, "handles", finalHandle);
            const finalHandleSnap =
              finalHandle === newBareHandle && handleSnap
                ? handleSnap
                : await getDoc(finalHandleRef).catch(() => null);
            const batch = writeBatch(db);
            if (!finalHandleSnap || !finalHandleSnap.exists()) {
              batch.set(finalHandleRef, {
                uid,
                createdAt: serverTimestamp(),
              });
            }
            if (oldBareHandle && oldBareHandle !== finalHandle) {
              const oldSnap = await getDoc(doc(db, "handles", oldBareHandle)).catch(() => null);
              if (oldSnap && oldSnap.exists() && oldSnap.data()?.uid === uid) {
                batch.delete(doc(db, "handles", oldBareHandle));
              }
            }
            batch.set(doc(db, "profiles", uid), {
              uid,
              name: cleanName,
              handle: finalHandle,
              bio: String(stateObj.user?.bio || "").slice(0, 300),
              avatarUrl: safeAvatar,
              bannerUrl: safeBanner,
              favoriteArtists: cleanFavNames,
              updatedAt: serverTimestamp(),
            });
            await batch.commit();
          } catch (profErr) {
            console.warn("Firestore profile batch warning:", profErr);
          }

          // 3. Ensure any likedTracks in stateObj.user.likedTracks are persisted in /users/{uid}/likes
          const likedList = Array.isArray(stateObj.user?.likedTracks)
            ? stateObj.user.likedTracks.slice(0, 100)
            : [];
          for (const tr of likedList) {
            if (!tr || !tr.title || !tr.artist) continue;
            const tKey = buildTrackKey(String(tr.title), String(tr.artist)).slice(0, 150);
            if (!tKey || syncedLikesInSession.has(`${uid}:${tKey}`)) continue;
            void this.syncTrackLike(tr, true);
          }

          // 4. Persist user playlists to /playlists/{playlistId} in Firestore
          const playlistsList = Array.isArray(stateObj.playlists)
            ? stateObj.playlists.slice(0, 40)
            : [];
          for (const pl of playlistsList) {
            if (!pl || !pl.id || !pl.name) continue;
            const pid = String(pl.id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
            if (!pid) continue;
            try {
              const plRef = doc(db, "playlists", pid);
              const plSnap = await getDoc(plRef).catch(() => null);
              const safePlCover = sanitizeImageForRules(
                pl.customCoverUrl || pl.coverUrl,
                2000,
                ""
              );
              const plPayload: Record<string, any> = {
                ownerId: uid,
                collaboratorIds: [],
                visibility: "public",
                name: String(pl.name).trim().slice(0, 80) || "Minha Playlist",
                description: String(pl.description || "").trim().slice(0, 300),
                ...(safePlCover ? { coverUrl: safePlCover } : {}),
                createdAt: plSnap && plSnap.exists() && plSnap.data()?.createdAt ? plSnap.data()?.createdAt : serverTimestamp(),
                updatedAt: serverTimestamp(),
              };
              await setDoc(plRef, plPayload);
            } catch {}
          }
        } catch (e) {
          console.warn("Firestore saveUserState warning:", e);
        }
      },

      updatePresence(state: PresenceState, track?: { title: string; artist: string; coverUrl?: string; durationSec?: number }) {
        const activeUser = auth.currentUser || this.currentUser;
        if (!activeUser) return;
        if (lastPresenceTimer) clearTimeout(lastPresenceTimer);

        lastPresenceTimer = setTimeout(async () => {
          const curUser = auth.currentUser || this.currentUser;
          if (!curUser) return;
          const uid = curUser.uid;
          const visibility: Visibility = w.miadoState?.user?.privacy?.presence || "public";
          const trackKey = track ? buildTrackKey(track.title, track.artist) : "";
          const fp = `${state}|${trackKey}|${visibility}`;
          const now = Date.now();
          if (fp === lastPresenceFingerprint && now - lastPresenceSentAt < 8000) return;

          lastPresenceFingerprint = fp;
          lastPresenceSentAt = now;

          const buildPresencePayload = (vis: Visibility) => {
            const payload: Record<string, any> = {
              uid,
              visibility: vis,
              state,
              updatedAt: serverTimestamp(),
            };
            if (vis !== "private" && state !== "idle" && track && track.title && track.artist) {
              const dur = Math.max(0, Math.min(7200, Math.round(Number(track.durationSec) || 180)));
              const safeCover =
                typeof track.coverUrl === "string" &&
                (/^\/api\/cover\?.+$/.test(track.coverUrl) || /^https:\/\/.+$/.test(track.coverUrl)) &&
                track.coverUrl.length <= 2000
                  ? track.coverUrl
                  : undefined;
              payload.track = {
                trackKey,
                title: String(track.title).slice(0, 200),
                artist: String(track.artist).slice(0, 200),
                ...(safeCover ? { coverUrl: safeCover } : {}),
                durationSec: dur,
              };
            }
            return payload;
          };

          try {
            await setDoc(doc(db, "presence", uid), buildPresencePayload(visibility));
          } catch {
            try {
              const fallbackVis: Visibility = visibility === "public" ? "followers_only" : "public";
              await setDoc(doc(db, "presence", uid), buildPresencePayload(fallbackVis));
              if (w.miadoState?.user) {
                w.miadoState.user.privacy = { presence: fallbackVis, activity: fallbackVis };
              }
            } catch {}
          }
        }, 120);
      },

      subscribeLiveCommunity() {
        const activeUser = auth.currentUser || this.currentUser;
        if (!activeUser) return;
        const profilesByUid = new Map<string, any>();
        const handlesByUid = new Map<string, string>();
        const presenceByUid = new Map<string, any>();
        const watchedPresenceUids = new Set<string>();

        const isPresFresh = (pres: any, expectedUid: string): boolean => {
          if (!pres || pres.uid !== expectedUid) return false;
          if (pres.state !== "playing" || !pres.track || !pres.track.title) return false;
          const ts = pres.updatedAt;
          if (!ts) return false;
          let ms = 0;
          if (typeof ts.toMillis === "function") {
            ms = ts.toMillis();
          } else if (typeof ts.seconds === "number") {
            ms = ts.seconds * 1000;
          } else if (typeof ts === "string" || typeof ts === "number") {
            ms = new Date(ts).getTime();
          }
          if (!ms || Number.isNaN(ms)) return false;
          return Date.now() - ms < 180_000;
        };

        const ensurePresenceListenerForUid = (targetUid: string) => {
          if (!targetUid || watchedPresenceUids.has(targetUid)) return;
          watchedPresenceUids.add(targetUid);
          const presKey = `live_pres_${targetUid}`;
          const unsubSinglePres = onSnapshot(
            doc(db, "presence", targetUid),
            (presSnap) => {
              if (presSnap.exists()) {
                const data = presSnap.data() || {};
                if (!data.uid || data.uid === targetUid) {
                  presenceByUid.set(targetUid, { ...data, uid: targetUid });
                }
              } else {
                presenceByUid.delete(targetUid);
              }
              emitMerged();
            },
            () => {
              presenceByUid.delete(targetUid);
              emitMerged();
            }
          );
          listenerRegistry.register(presKey, unsubSinglePres);
        };

        const emitMerged = () => {
          const allUids = new Set<string>([
            ...profilesByUid.keys(),
            ...handlesByUid.keys(),
          ]);
          const merged: any[] = [];
          const selfUid = (auth.currentUser || this.currentUser)?.uid || "";

          for (const uid of allUids) {
            if (!uid) continue;
            const prof = profilesByUid.get(uid) || {};
            const rawHandle = prof.handle || prof.username || handlesByUid.get(uid) || "";
            if (!rawHandle) continue;
            const bare = String(rawHandle).replace(/^@+/, "").toLowerCase().trim();
            if (!bare || bare === "visitante" || bare === "novo_usuario") continue;
            const h = `@${bare}`;

            // Strict UID-based presence lookup: never collide between logged-in user and friends
            const pres = presenceByUid.get(uid);
            const hasLiveTrack = isPresFresh(pres, uid);
            const currentTrackStr = hasLiveTrack
              ? `${pres.track.title} - ${pres.track.artist || "Artista"}`
              : "";
            const trackObj = hasLiveTrack
              ? {
                  title: pres.track.title,
                  artist: pres.track.artist || "Artista",
                  coverUrl:
                    pres.track.coverUrl ||
                    `/api/cover?title=${encodeURIComponent(pres.track.title)}&artist=${encodeURIComponent(pres.track.artist || "")}`,
                  durationSec: pres.track.durationSec || 180,
                }
              : null;

            const favArtists = Array.isArray(prof.favoriteArtists) ? prof.favoriteArtists : [];

            merged.push({
              uid,
              id: `prof_${uid}`,
              name: prof.name || prof.displayName || bare || "Ouvinte Miado",
              username: h,
              handle: h,
              bio: prof.bio || "",
              avatarUrl: prof.avatarUrl || "/api/cat-avatar?id=cat_1",
              bannerUrl: prof.bannerUrl || "",
              favoriteArtists: favArtists,
              followedArtists: favArtists.map((a: string) => ({
                name: a,
                role: "Artista Favorito",
                coverUrl: `/api/artist-image?name=${encodeURIComponent(a)}`,
              })),
              currentTrack: currentTrackStr,
              trackObj,
              liveStateResolved: true,
              _fromFirestore: true,
              online: hasLiveTrack,
              isSelf: Boolean(selfUid && uid === selfUid),
            });
          }

          const deduped = deduplicateCommunityProfilesList(merged, selfUid);
          if (w.miadoState && typeof w.miadoState.applyLiveCommunityUpdate === "function") {
            w.miadoState.applyLiveCommunityUpdate(deduped);
          }
          if (deduped.length > 0) {
            fetch("/api/profiles/sync-community", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ profiles: deduped }),
            }).catch(() => {});
          }
        };

        try {
          // Query the full active profiles collection (up to Firestore security rule limit of 100)
          const profQ = query(collection(db, "profiles"), limit(100));
          const unsubProf = onSnapshot(
            profQ,
            (snap) => {
              profilesByUid.clear();
              snap.docs.forEach((d) => {
                const data = d.data() || {};
                const docUid = String(data.uid || d.id);
                profilesByUid.set(docUid, { ...data, uid: docUid });
                ensurePresenceListenerForUid(docUid);
              });
              emitMerged();
            },
            () => {}
          );
          listenerRegistry.register("live_community_profiles", unsubProf);

          // Cross-reference handles collection (limit 100) so no registered user is omitted
          const handlesQ = query(collection(db, "handles"), limit(100));
          const unsubHandles = onSnapshot(
            handlesQ,
            (snap) => {
              handlesByUid.clear();
              snap.docs.forEach((d) => {
                const data = d.data() || {};
                if (data.uid && typeof data.uid === "string") {
                  handlesByUid.set(data.uid, d.id);
                  ensurePresenceListenerForUid(data.uid);
                  if (!profilesByUid.has(data.uid)) {
                    getDoc(doc(db, "profiles", data.uid))
                      .then((pSnap) => {
                        if (pSnap.exists()) {
                          profilesByUid.set(data.uid, { ...pSnap.data(), uid: data.uid });
                          emitMerged();
                        }
                      })
                      .catch(() => {});
                  }
                }
              });
              emitMerged();
            },
            () => {}
          );
          listenerRegistry.register("live_community_handles", unsubHandles);

          // Real-time public presence collection listener keyed strictly by UID
          const presCollectionQ = query(
            collection(db, "presence"),
            where("visibility", "==", "public"),
            limit(100)
          );
          const unsubPublicPres = onSnapshot(
            presCollectionQ,
            (snap) => {
              snap.docs.forEach((d) => {
                const data = d.data() || {};
                const docUid = String(data.uid || d.id);
                if (docUid === d.id) {
                  presenceByUid.set(docUid, { ...data, uid: docUid });
                }
              });
              emitMerged();
            },
            () => {}
          );
          listenerRegistry.register("live_community_public_presence", unsubPublicPres);
        } catch {}
      },

      async fetchCommunityProfiles(maxItems = 100) {
        const activeUser = auth.currentUser || this.currentUser;
        if (!activeUser) return [];
        const safeLimit = Math.max(1, Math.min(100, Number(maxItems) || 100));
        try {
          const [profSnap, handlesSnap] = await Promise.all([
            getDocs(query(collection(db, "profiles"), limit(safeLimit))),
            getDocs(query(collection(db, "handles"), limit(safeLimit))).catch(() => null),
          ]);

          const profilesByUid = new Map<string, any>();
          profSnap.docs.forEach((d) => {
            const data = d.data() || {};
            const uid = String(data.uid || d.id);
            profilesByUid.set(uid, { ...data, uid });
          });

          if (handlesSnap) {
            for (const hDoc of handlesSnap.docs) {
              const hData = hDoc.data() || {};
              const uid = typeof hData.uid === "string" ? hData.uid : "";
              if (uid && !profilesByUid.has(uid)) {
                profilesByUid.set(uid, { uid, handle: hDoc.id, name: hDoc.id });
              }
            }
          }

          const selfUid = activeUser.uid;
          const list: any[] = [];

          await Promise.all(
            Array.from(profilesByUid.entries()).map(async ([uid, data]) => {
              const rawH = data.handle || data.username || "";
              if (!rawH) return;
              const bare = String(rawH).replace(/^@+/, "").toLowerCase().trim();
              if (!bare || bare === "visitante" || bare === "novo_usuario") return;
              const h = `@${bare}`;

              let presData: any = null;
              try {
                const pSnap = await getDoc(doc(db, "presence", uid));
                if (pSnap.exists()) {
                  const rawPres = pSnap.data() || {};
                  if (!rawPres.uid || rawPres.uid === uid) {
                    presData = { ...rawPres, uid };
                  }
                }
              } catch {}

              let isPlayingFresh = false;
              if (
                presData &&
                presData.uid === uid &&
                presData.state === "playing" &&
                presData.track &&
                presData.track.title &&
                presData.updatedAt
              ) {
                const ts = presData.updatedAt;
                const ms =
                  typeof ts.toMillis === "function"
                    ? ts.toMillis()
                    : typeof ts.seconds === "number"
                    ? ts.seconds * 1000
                    : new Date(ts).getTime();
                if (ms && !Number.isNaN(ms) && Date.now() - ms < 180_000) {
                  isPlayingFresh = true;
                }
              }

              const favs = Array.isArray(data.favoriteArtists) ? data.favoriteArtists : [];
              list.push({
                uid,
                id: `prof_${uid}`,
                name: data.name || data.displayName || bare || "Ouvinte Miado",
                username: h,
                handle: h,
                bio: data.bio || "",
                avatarUrl: data.avatarUrl || "/api/cat-avatar?id=cat_1",
                bannerUrl: data.bannerUrl || "",
                favoriteArtists: favs,
                followedArtists: favs.map((a: string) => ({
                  name: a,
                  role: "Artista Favorito",
                  coverUrl: `/api/artist-image?name=${encodeURIComponent(a)}`,
                })),
                currentTrack: isPlayingFresh
                  ? `${presData.track.title} - ${presData.track.artist || "Artista"}`
                  : "",
                trackObj: isPlayingFresh ? presData.track : null,
                liveStateResolved: true,
                _fromFirestore: true,
                online: isPlayingFresh,
                isSelf: uid === selfUid,
              });
            })
          );
          return deduplicateCommunityProfilesList(list, selfUid);
        } catch {
          return [];
        }
      },
    };

    w.miadoFirestore.init();
  } catch (err) {
    console.warn("Firebase initialization warning:", err);
  }
}
