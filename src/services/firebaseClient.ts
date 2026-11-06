/**
 * Firebase Auth & Firestore Client Service
 * Initialized with configuration from firebase-applet-config.json.
 * Conforms strictly to Firebase Integration skill:
 * - Direct initialization with getFirestore(app, firebaseConfig.firestoreDatabaseId)
 * - Connection testing via getDocFromServer
 * - Structured error handling via handleFirestoreError
 * - 100% user account isolation (Guest Mode by default, per-UID Firestore data)
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocFromServer
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase App & Services
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "ai-studio-miadostreamingde-0c57b5d9-b4bf-4817-81f3-2d65f4bd82b7");
export const auth = getAuth(app);

// Validation Connection on initial boot as mandated by Firebase Skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Please check your Firebase configuration: client is offline.");
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
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function initFirebaseClient(): void {
  const w = window as any;
  try {
    w.miadoFirestore = {
      app,
      db,
      auth,
      currentUser: null as User | null,

      async init() {
        onAuthStateChanged(auth, async (user) => {
          this.currentUser = user;
          if (user) {
            localStorage.setItem("miado_user_uid", user.uid);
            localStorage.setItem("miado_active_session_v1", "true");
            try {
              const idToken = await user.getIdToken();
              if (idToken) {
                localStorage.setItem("miado_auth_token", idToken);
              }
            } catch {}

            try {
              const userDocRef = doc(db, "users", user.uid);
              const snap = await getDoc(userDocRef);
              if (snap.exists()) {
                const data = snap.data();
                if (w.miadoState) {
                  w.miadoState.hydrateFromFirestore(data);
                }
              } else {
                // Initialize clean default profile in Firestore for this new user
                const cleanEmail = (user.email || `user_${user.uid.slice(0, 8)}@miado.app`).toLowerCase();
                const cleanName = user.displayName || cleanEmail.split("@")[0] || "Ouvinte Miado";
                const baseSlug = (user.displayName || cleanEmail.split("@")[0] || "ouvinte")
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9]/g, "")
                  .slice(0, 14) || "ouvinte";
                const randomDigits = Math.floor(1000 + Math.random() * 9000);
                const cleanHandle = `@${baseSlug}${randomDigits}`;
                const initialDoc = {
                  uid: user.uid,
                  email: cleanEmail,
                  name: cleanName,
                  handle: cleanHandle,
                  bio: "Ouvindo som em alta definição no Miado",
                  catId: "cat_1",
                  avatarUrl: user.photoURL || "/api/cat-avatar?id=cat_1",
                  bannerUrl: "",
                  favoriteArtists: [],
                  favoriteGenres: [],
                  followedArtists: [],
                  followingProfiles: [],
                  likedTracks: [],
                  playlists: [],
                  recentHistory: [],
                  onboardingCompleted: false,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                };
                await setDoc(userDocRef, initialDoc);
                if (w.miadoState) {
                  w.miadoState.hydrateFromFirestore(initialDoc);
                }
              }
            } catch (e) {
              console.warn("Firestore hydrate warning:", e);
            }
          } else {
            // Modo Visitante puro: limpa tokens para garantir isolamento absoluto entre usuários
            localStorage.removeItem("miado_auth_token");
            localStorage.removeItem("miado_user_uid");
            localStorage.removeItem("miado_active_session_v1");
            if (w.miadoState && w.miadoState.user && w.miadoState.user.email) {
              w.miadoState.user = {
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
                onboardingCompleted: false
              };
              if (w.miadoUI) {
                w.miadoUI.syncHeaderUserUI();
              }
            }
          }
        });
      },

      async loginWithEmail(email: string, password: string) {
        try {
          const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
          const token = await cred.user.getIdToken();
          localStorage.setItem("miado_auth_token", token);
          return { user: cred.user, token };
        } catch (error) {
          throw error;
        }
      },

      async registerWithEmail(email: string, password: string) {
        try {
          const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
          const token = await cred.user.getIdToken();
          localStorage.setItem("miado_auth_token", token);
          return { user: cred.user, token };
        } catch (error) {
          throw error;
        }
      },

      async loginWithGoogle() {
        try {
          const provider = new GoogleAuthProvider();
          const cred = await signInWithPopup(auth, provider);
          const token = await cred.user.getIdToken();
          localStorage.setItem("miado_auth_token", token);
          return { user: cred.user, token };
        } catch (error) {
          throw error;
        }
      },

      async logout() {
        await signOut(auth);
        this.currentUser = null;
        localStorage.removeItem("miado_auth_token");
        localStorage.removeItem("miado_user_uid");
        localStorage.removeItem("miado_active_session_v1");
        if (w.miadoState) {
          w.miadoState.user = {
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
            onboardingCompleted: false
          };
          if (w.miadoUI) {
            w.miadoUI.syncHeaderUserUI();
            w.miadoUI.renderSidebarPlaylists();
          }
        }
      },

      async deleteAccount() {
        if (!auth.currentUser) return;
        const uid = auth.currentUser.uid;
        try {
          await deleteDoc(doc(db, "users", uid));
          await deleteDoc(doc(db, "profiles", uid));
        } catch (e) {
          console.warn("Error deleting user docs in Firestore:", e);
        }
        try {
          await auth.currentUser.delete();
        } catch (e) {
          console.warn("Error deleting Firebase Auth user:", e);
        }
        await signOut(auth);
        localStorage.clear();
        window.location.reload();
      },

      async saveUserState(stateObj: any) {
        if (!this.currentUser) return;
        try {
          const uid = this.currentUser.uid;
          const userDocRef = doc(db, "users", uid);
          const cleanEmail =
            stateObj.user?.email ||
            this.currentUser.email ||
            `user_${uid.slice(0, 8)}@miado.app`;
          const cleanName = stateObj.user?.name || "Ouvinte Miado";
          const cleanHandle = stateObj.user?.username || "@miadinho";

          await setDoc(
            userDocRef,
            {
              uid,
              email: cleanEmail,
              name: cleanName,
              handle: cleanHandle,
              bio: stateObj.user?.bio || "Ouvindo som em alta definição no Miado",
              catId: stateObj.user?.avatarId || "cat_1",
              avatarUrl: stateObj.user?.avatarUrl || "",
              bannerUrl: stateObj.user?.bannerUrl || "",
              favoriteArtists: (stateObj.user?.favoriteArtists || []).slice(0, 60),
              followedArtists: (stateObj.followedArtists || []).slice(0, 150),
              likedTracks: (stateObj.user?.likedTracks || []).slice(0, 300),
              playlists: (stateObj.playlists || []).slice(0, 50),
              recentHistory: (stateObj.recentHistory || []).slice(0, 50),
              onboardingCompleted: Boolean(stateObj.user?.onboardingCompleted ?? true),
              createdAt: stateObj.user?.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            },
            { merge: true }
          );

          // Sincroniza documento público de perfil da comunidade
          const profDocRef = doc(db, "profiles", uid);
          await setDoc(
            profDocRef,
            {
              uid,
              name: cleanName,
              username: cleanHandle,
              bio: stateObj.user?.bio || "",
              avatarUrl: stateObj.user?.avatarUrl || "/api/cat-avatar?id=cat_1",
              favoriteArtists: (stateObj.user?.favoriteArtists || []).slice(0, 20),
              updatedAt: new Date().toISOString()
            },
            { merge: true }
          );
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${this.currentUser.uid}`);
        }
      }
    };

    w.miadoFirestore.init();
  } catch (err) {
    console.warn("Firebase initialization warning:", err);
  }
}
