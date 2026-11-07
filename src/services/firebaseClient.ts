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
  GoogleAuthProvider,
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
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  return fallback;
}

export function initFirebaseClient(): void {
  const w = window as any;
  let lastPresenceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPresenceSentAt = 0;
  let lastPresenceFingerprint = "";

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
      preferredName?: string;
      preferredHandle?: string;
      forceCreateIfMissing?: boolean;
    }
  ) => {
    const prevUid = localStorage.getItem("miado_user_uid");
    if (prevUid && prevUid !== user.uid) {
      [
        "miado_user_v5",
        "miado_followed_artists_v5",
        "miado_friends_v5",
        "miado_playlists_v5",
        "miado_recent_history_v5",
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
    const [snap, profSnap] = await Promise.all([getDoc(userDocRef), getDoc(profDocRef)]);

    if (snap.exists()) {
      const data = snap.data();
      const profData = profSnap.exists() ? profSnap.data() : null;
      const rawHandle =
        profData?.handle ||
        data.handle ||
        data.username ||
        `user${Math.floor(10000 + Math.random() * 90000)}`;
      const bareH = normalizeBareHandle(String(rawHandle), "user");
      const displayHandle = `@${bareH}`;
      const favArtists = Array.isArray(data.favoriteArtists)
        ? data.favoriteArtists
        : Array.isArray(profData?.favoriteArtists)
        ? profData.favoriteArtists
        : [];
      const folArtists = Array.isArray(data.followedArtists) ? data.followedArtists : [];

      if (!profSnap.exists() && data.onboardingCompleted === true) {
        try {
          const safeAvatar = sanitizeImageForRules(
            data.avatarUrl || user.photoURL,
            100000,
            "/api/cat-avatar?id=cat_1"
          );
          const batch = writeBatch(db);
          batch.set(doc(db, "handles", bareH), {
            uid: user.uid,
            createdAt: serverTimestamp(),
          });
          batch.set(profDocRef, {
            uid: user.uid,
            name: String(data.name || user.displayName || "Ouvinte Miado").slice(0, 80),
            handle: bareH,
            bio: String(data.bio || "").slice(0, 300),
            avatarUrl: safeAvatar,
            bannerUrl: "",
            favoriteArtists: favArtists.slice(0, 60),
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } catch {}
      }

      const hydrated = {
        ...data,
        uid: user.uid,
        email: (data.email || user.email || "").toLowerCase(),
        name: profData?.name || data.name || user.displayName || "Ouvinte Miado",
        bio: profData?.bio ?? data.bio ?? "",
        avatarUrl: profData?.avatarUrl || data.avatarUrl || "/api/cat-avatar?id=cat_1",
        handle: displayHandle,
        username: displayHandle,
        favoriteArtists: favArtists,
        followedArtists: folArtists,
        onboardingCompleted: Boolean(data.onboardingCompleted),
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
            if (typeof w.miadoMountOnboarding === "function") {
              w.miadoMountOnboarding();
            }
          }
        });
      },

      async loginWithEmail(email: string, password: string) {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const token = await cred.user.getIdToken();
        localStorage.setItem("miado_auth_token", token);
        const profile = await ensureAndHydrateUser(cred.user, {
          isGoogle: false,
          forceCreateIfMissing: true,
        });
        this.subscribeLiveCommunity();
        return { user: cred.user, token, profile };
      },

      async registerWithEmail(
        email: string,
        password: string,
        meta?: { name?: string; handle?: string }
      ) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
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
        return { user: cred.user, token, profile };
      },

      async resendVerificationEmail() {
        if (!auth.currentUser) return false;
        await sendEmailVerification(auth.currentUser);
        return true;
      },

      async loginWithGoogle() {
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        const token = await cred.user.getIdToken();
        localStorage.setItem("miado_auth_token", token);
        const profile = await ensureAndHydrateUser(cred.user, {
          isGoogle: true,
          forceCreateIfMissing: true,
        });
        this.subscribeLiveCommunity();
        return { user: cred.user, token, profile };
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

      async saveUserState(stateObj: any) {
        if (!this.currentUser) return;
        const uid = this.currentUser.uid;
        try {
          const userDocRef = doc(db, "users", uid);
          const existingSnap = await getDoc(userDocRef);
          const existingData = existingSnap.exists() ? existingSnap.data() : null;

          const cleanEmail = (
            existingData?.email ||
            this.currentUser.email ||
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
          if (oldBareHandle !== newBareHandle) {
            const handleSnap = await getDoc(doc(db, "handles", newBareHandle));
            if (handleSnap.exists() && handleSnap.data()?.uid !== uid) {
              finalHandle = oldBareHandle || normalizeBareHandle(`${newBareHandle}${Math.floor(100 + Math.random() * 900)}`);
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

          const batch = writeBatch(db);
          batch.set(userDocRef, {
            uid,
            email: cleanEmail,
            name: cleanName,
            handle: finalHandle,
            bio: String(stateObj.user?.bio || "").slice(0, 300),
            catId: String(stateObj.user?.avatarId || "cat_1").slice(0, 40),
            avatarUrl: safeAvatar,
            bannerUrl: safeBanner,
            favoriteArtists: Array.isArray(stateObj.user?.favoriteArtists)
              ? stateObj.user.favoriteArtists.slice(0, 60)
              : [],
            favoriteGenres: Array.isArray(stateObj.user?.favoriteGenres)
              ? stateObj.user.favoriteGenres.slice(0, 30)
              : [],
            followedArtists: Array.isArray(stateObj.followedArtists)
              ? stateObj.followedArtists.slice(0, 200)
              : [],
            privacy,
            onboardingCompleted: Boolean(stateObj.user?.onboardingCompleted ?? true),
            createdAt: existingData?.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (!oldBareHandle || oldBareHandle !== finalHandle) {
            batch.set(doc(db, "handles", finalHandle), {
              uid,
              createdAt: serverTimestamp(),
            });
            if (oldBareHandle && oldBareHandle !== finalHandle) {
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
            favoriteArtists: Array.isArray(stateObj.user?.favoriteArtists)
              ? stateObj.user.favoriteArtists.slice(0, 60)
              : [],
            updatedAt: serverTimestamp(),
          });

          await batch.commit();
        } catch (e) {
          console.warn("Firestore saveUserState warning:", e);
        }
      },

      updatePresence(state: PresenceState, track?: { title: string; artist: string; coverUrl?: string; durationSec?: number }) {
        if (!this.currentUser) return;
        if (lastPresenceTimer) clearTimeout(lastPresenceTimer);

        lastPresenceTimer = setTimeout(async () => {
          if (!this.currentUser) return;
          const uid = this.currentUser.uid;
          const visibility: Visibility = w.miadoState?.user?.privacy?.presence || "public";
          const trackKey = track ? buildTrackKey(track.title, track.artist) : "";
          const fp = `${state}|${trackKey}|${visibility}`;
          const now = Date.now();
          if (fp === lastPresenceFingerprint && now - lastPresenceSentAt < 25000) return;

          lastPresenceFingerprint = fp;
          lastPresenceSentAt = now;

          try {
            const payload: Record<string, any> = {
              uid,
              visibility,
              state,
              updatedAt: serverTimestamp(),
            };
            if (visibility !== "private" && state !== "idle" && track && track.title && track.artist) {
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
            await setDoc(doc(db, "presence", uid), payload);
          } catch {}
        }, 300);
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
              online: hasLiveTrack,
              isSelf: Boolean(selfUid && uid === selfUid),
            });
          }

          if (w.miadoState && typeof w.miadoState.applyLiveCommunityUpdate === "function") {
            w.miadoState.applyLiveCommunityUpdate(merged);
          }
          if (merged.length > 0) {
            fetch("/api/profiles/sync-community", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ profiles: merged }),
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
                online: isPlayingFresh,
                isSelf: uid === selfUid,
              });
            })
          );
          return list;
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
