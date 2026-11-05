/**
 * Firebase Auth & Firestore Client Service (Fase 6)
 * Uses bundled npm 'firebase' SDK instead of external gstatic CDN scripts,
 * ensuring 100% parity between development and production Vite builds.
 * Supports free Guest Mode by default + optional Email/Password & Google Sign-In to sync across devices.
 */

import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc
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

export function initFirebaseClient(): void {
  const w = window as any;
  try {
    const app = initializeApp(firebaseConfig);
    const db = initializeFirestore(
      app,
      {},
      firebaseConfig.firestoreDatabaseId || "ai-studio-miadostreamingde-0c57b5d9-b4bf-4817-81f3-2d65f4bd82b7"
    );
    const auth = getAuth(app);

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
              }
            } catch (e) {
              console.warn("Firestore hydrate warning:", e);
            }
          }
        });
      },

      async loginWithEmail(email: string, password: string) {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const token = await cred.user.getIdToken();
        localStorage.setItem("miado_auth_token", token);
        return { user: cred.user, token };
      },

      async registerWithEmail(email: string, password: string) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const token = await cred.user.getIdToken();
        localStorage.setItem("miado_auth_token", token);
        return { user: cred.user, token };
      },

      async loginWithGoogle() {
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        const token = await cred.user.getIdToken();
        localStorage.setItem("miado_auth_token", token);
        return { user: cred.user, token };
      },

      async logout() {
        await signOut(auth);
        this.currentUser = null;
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

          // Also sync public profile document
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
          console.warn("Firestore save warning:", e);
        }
      }
    };

    w.miadoFirestore.init();
  } catch (err) {
    console.warn("Firebase initialization warning:", err);
  }
}
