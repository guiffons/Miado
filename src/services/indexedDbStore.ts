/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Instant Local Persistence Layer via IndexedDB for Miado.
 * Persists playback history, user libraries (liked tracks, followed artists, playlists, friends),
 * and user profile metadata instantaneously (<5ms) while synchronizing with Firestore in the background.
 */

const DB_NAME = "miado_local_db_v1";
const DB_VERSION = 1;

const STORE_PROFILE = "user_profile";
const STORE_HISTORY = "playback_history";
const STORE_LIBRARY = "user_library";
const STORE_OUTBOX = "sync_outbox";

export interface IndexedDbOutboxItem {
  id: string;
  op: "updateProfile" | "saveUserLibrary" | "recordHistoryEvent" | "saveUserState";
  userKey: string;
  payload: any;
  createdAt: number;
  attempts: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openMiadoDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PROFILE)) {
          db.createObjectStore(STORE_PROFILE, { keyPath: "userKey" });
        }
        if (!db.objectStoreNames.contains(STORE_HISTORY)) {
          db.createObjectStore(STORE_HISTORY, { keyPath: "userKey" });
        }
        if (!db.objectStoreNames.contains(STORE_LIBRARY)) {
          db.createObjectStore(STORE_LIBRARY, { keyPath: "userKey" });
        }
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[Miado IndexedDB] Failed to open IndexedDB:", req.error);
        resolve(null);
      };
    } catch (err) {
      console.warn("[Miado IndexedDB] Exception opening IndexedDB:", err);
      resolve(null);
    }
  });

  return dbPromise;
}

async function putRecord(storeName: string, record: any): Promise<boolean> {
  const db = await openMiadoDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function getRecord<T = any>(storeName: string, key: string): Promise<T | null> {
  const db = await openMiadoDb();
  if (!db || !key) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function deleteRecord(storeName: string, key: string): Promise<boolean> {
  const db = await openMiadoDb();
  if (!db || !key) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function getAllRecords<T = any>(storeName: string): Promise<T[]> {
  const db = await openMiadoDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as T[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export function resolveActiveUserKey(stateOrUser?: any): string {
  const w = window as any;
  const st = stateOrUser || w.miadoState;
  const email = String(st?.user?.email || st?.email || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const uid = String(st?.user?.uid || st?.uid || "").trim();
  if (uid) return `uid:${uid}`;
  const handle = String(st?.user?.handle || st?.handle || "").trim().toLowerCase().replace(/^@+/, "");
  if (handle) return `handle:${handle}`;
  return "default_local_user";
}

export async function saveProfileInstant(userKey: string, profile: any): Promise<boolean> {
  const key = userKey || resolveActiveUserKey(profile);
  const now = Date.now();
  return putRecord(STORE_PROFILE, {
    userKey: key,
    profile: { ...(profile || {}), updatedAt: now },
    updatedAt: now,
  });
}

export async function getProfileInstant(userKey?: string): Promise<any | null> {
  const key = userKey || resolveActiveUserKey();
  const rec = await getRecord<{ userKey: string; profile: any; updatedAt: number }>(STORE_PROFILE, key);
  return rec?.profile || null;
}

export async function saveHistoryInstant(userKey: string, historyList: any[]): Promise<boolean> {
  const key = userKey || resolveActiveUserKey();
  const safeList = Array.isArray(historyList) ? historyList.slice(0, 120) : [];
  const now = Date.now();
  return putRecord(STORE_HISTORY, {
    userKey: key,
    history: safeList,
    updatedAt: now,
  });
}

export async function getHistoryInstant(userKey?: string): Promise<any[] | null> {
  const key = userKey || resolveActiveUserKey();
  const rec = await getRecord<{ userKey: string; history: any[]; updatedAt: number }>(STORE_HISTORY, key);
  return Array.isArray(rec?.history) ? rec!.history : null;
}

export async function saveLibraryInstant(
  userKey: string,
  library: {
    likedTracks?: any[];
    followedArtists?: any[];
    playlists?: any[];
    friends?: any[];
  }
): Promise<boolean> {
  const key = userKey || resolveActiveUserKey();
  const existing = await getRecord<{ userKey: string; library: any; updatedAt: number }>(STORE_LIBRARY, key);
  const prev = existing?.library || {};
  const merged = {
    likedTracks: Array.isArray(library.likedTracks) ? library.likedTracks : Array.isArray(prev.likedTracks) ? prev.likedTracks : [],
    followedArtists: Array.isArray(library.followedArtists) ? library.followedArtists : Array.isArray(prev.followedArtists) ? prev.followedArtists : [],
    playlists: Array.isArray(library.playlists) ? library.playlists : Array.isArray(prev.playlists) ? prev.playlists : [],
    friends: Array.isArray(library.friends) ? library.friends : Array.isArray(prev.friends) ? prev.friends : [],
  };
  const now = Date.now();
  return putRecord(STORE_LIBRARY, {
    userKey: key,
    library: merged,
    updatedAt: now,
  });
}

export async function getLibraryInstant(userKey?: string): Promise<{
  likedTracks: any[];
  followedArtists: any[];
  playlists: any[];
  friends: any[];
  updatedAt?: number;
} | null> {
  const key = userKey || resolveActiveUserKey();
  const rec = await getRecord<{ userKey: string; library: any; updatedAt: number }>(STORE_LIBRARY, key);
  if (!rec || !rec.library) return null;
  return {
    likedTracks: Array.isArray(rec.library.likedTracks) ? rec.library.likedTracks : [],
    followedArtists: Array.isArray(rec.library.followedArtists) ? rec.library.followedArtists : [],
    playlists: Array.isArray(rec.library.playlists) ? rec.library.playlists : [],
    friends: Array.isArray(rec.library.friends) ? rec.library.friends : [],
    updatedAt: rec.updatedAt,
  };
}

export async function enqueueOutbox(
  op: IndexedDbOutboxItem["op"],
  payload: any,
  userKey?: string
): Promise<boolean> {
  const key = userKey || resolveActiveUserKey();
  const id = `${op}:${key}`;
  return putRecord(STORE_OUTBOX, {
    id,
    op,
    userKey: key,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  } satisfies IndexedDbOutboxItem);
}

export async function getOutbox(): Promise<IndexedDbOutboxItem[]> {
  return getAllRecords<IndexedDbOutboxItem>(STORE_OUTBOX);
}

export async function removeOutbox(id: string): Promise<boolean> {
  return deleteRecord(STORE_OUTBOX, id);
}

export async function persistFromMiadoState(state?: any): Promise<void> {
  const w = window as any;
  const st = state || w.miadoState;
  if (!st) return;

  const keysToWrite = new Set<string>();
  keysToWrite.add(resolveActiveUserKey(st));
  keysToWrite.add("default_local_user");
  if (st.user?.email) keysToWrite.add(`email:${String(st.user.email).trim().toLowerCase()}`);
  if (st.user?.uid) keysToWrite.add(`uid:${String(st.user.uid).trim()}`);

  const profilePayload = st.user ? { ...st.user } : null;
  const historyPayload = Array.isArray(st.history) ? st.history.slice(0, 100) : [];
  const libraryPayload = {
    likedTracks: Array.isArray(st.likedTracks) ? st.likedTracks : [],
    followedArtists: Array.isArray(st.followedArtists) ? st.followedArtists : [],
    playlists: Array.isArray(st.playlists) ? st.playlists : [],
    friends: Array.isArray(st.friends) ? st.friends : [],
  };

  await Promise.all(
    Array.from(keysToWrite).map(async (key) => {
      if (profilePayload) await saveProfileInstant(key, profilePayload);
      await saveHistoryInstant(key, historyPayload);
      await saveLibraryInstant(key, libraryPayload);
    })
  );
}

export async function hydrateIntoMiadoState(state?: any): Promise<boolean> {
  const w = window as any;
  const st = state || w.miadoState;
  if (!st) return false;

  const primaryKey = resolveActiveUserKey(st);
  const fallbackKey = "default_local_user";

  const [profPrimary, profFallback, histPrimary, histFallback, libPrimary, libFallback] = await Promise.all([
    getProfileInstant(primaryKey),
    primaryKey !== fallbackKey ? getProfileInstant(fallbackKey) : Promise.resolve(null),
    getHistoryInstant(primaryKey),
    primaryKey !== fallbackKey ? getHistoryInstant(fallbackKey) : Promise.resolve(null),
    getLibraryInstant(primaryKey),
    primaryKey !== fallbackKey ? getLibraryInstant(fallbackKey) : Promise.resolve(null),
  ]);

  let hydrated = false;
  const prof = profPrimary || profFallback;
  if (prof && st.user) {
    if (prof.bio !== undefined && !st.user.bio) st.user.bio = prof.bio;
    if (prof.name && (!st.user.name || st.user.name === "Gato Miau")) st.user.name = prof.name;
    if (prof.handle && (!st.user.handle || st.user.handle === "@gatomiau")) st.user.handle = prof.handle;
    if (prof.avatar && !st.user.avatar) st.user.avatar = prof.avatar;
    if (prof.banner && !st.user.banner) st.user.banner = prof.banner;
    hydrated = true;
  }

  const hist = (Array.isArray(histPrimary) && histPrimary.length > 0)
    ? histPrimary
    : (Array.isArray(histFallback) && histFallback.length > 0 ? histFallback : null);

  if (hist && hist.length > 0) {
    const existingIds = new Set(
      (Array.isArray(st.history) ? st.history : []).map((t: any) =>
        `${String(t?.id || "")}|${String(t?.title || "").toLowerCase()}|${String(t?.artist || "").toLowerCase()}`
      )
    );
    const mergedHistory = [...(Array.isArray(st.history) ? st.history : [])];
    for (const item of hist) {
      const k = `${String(item?.id || "")}|${String(item?.title || "").toLowerCase()}|${String(item?.artist || "").toLowerCase()}`;
      if (!existingIds.has(k)) {
        mergedHistory.push(item);
        existingIds.add(k);
      }
    }
    st.history = mergedHistory.slice(0, 100);
    hydrated = true;
  }

  const lib = (libPrimary && (libPrimary.likedTracks.length || libPrimary.followedArtists.length || libPrimary.playlists.length))
    ? libPrimary
    : libFallback;

  if (lib) {
    if (Array.isArray(lib.likedTracks) && lib.likedTracks.length > 0 && (!Array.isArray(st.likedTracks) || st.likedTracks.length === 0)) {
      st.likedTracks = lib.likedTracks;
      hydrated = true;
    }
    if (Array.isArray(lib.followedArtists) && lib.followedArtists.length > 0 && (!Array.isArray(st.followedArtists) || st.followedArtists.length === 0)) {
      st.followedArtists = lib.followedArtists;
      hydrated = true;
    }
    if (Array.isArray(lib.playlists) && lib.playlists.length > 0 && (!Array.isArray(st.playlists) || st.playlists.length <= 2)) {
      st.playlists = lib.playlists;
      hydrated = true;
    }
    if (Array.isArray(lib.friends) && lib.friends.length > 0 && (!Array.isArray(st.friends) || st.friends.length === 0)) {
      st.friends = lib.friends;
      hydrated = true;
    }
  }

  return hydrated;
}

export function initIndexedDbStore(): void {
  if (typeof window === "undefined") return;
  const w = window as any;
  openMiadoDb().catch(() => {});

  const api = {
    openMiadoDb,
    resolveActiveUserKey,
    saveProfileInstant,
    getProfileInstant,
    saveHistoryInstant,
    getHistoryInstant,
    saveLibraryInstant,
    getLibraryInstant,
    enqueueOutbox,
    getOutbox,
    removeOutbox,
    persistFromMiadoState,
    hydrateIntoMiadoState,
  };

  w.miadoIndexedDb = api;

  // Hydrate immediately if miadoState is already mounted, and also shortly after boot
  if (w.miadoState) {
    void hydrateIntoMiadoState(w.miadoState);
  } else {
    setTimeout(() => {
      if (w.miadoState) {
        void hydrateIntoMiadoState(w.miadoState);
      }
    }, 120);
  }
}
