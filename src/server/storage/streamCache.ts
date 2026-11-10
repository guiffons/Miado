import path from "path";
import { JsonStore } from "./jsonStore.ts";
import { TtlLruCache } from "./ttlLruCache.ts";
import { isForbidden30sPreviewUrl } from "../catalog.ts";
import { getDataDir } from "./dataDir.ts";

export interface StreamCacheEntry {
  url: string;
  source: string;
  durationSec: number;
  host: string;
  resolvedAt: number;
  expiresAt: number;
}

interface StreamCacheFileSchema {
  schemaVersion: number;
  entries: Record<string, StreamCacheEntry>;
}

const STREAM_CACHE_FILE = path.join(getDataDir(), "resolved-streams-cache.json");

export function computeStreamExpiryMs(rawUrl: string): number {
  const now = Date.now();
  try {
    const parsed = new URL(rawUrl);
    const expireParam = parsed.searchParams.get("expire");
    if (expireParam) {
      const expEpochSec = parseInt(expireParam, 10);
      if (!isNaN(expEpochSec) && expEpochSec * 1000 > now + 60_000) {
        return expEpochSec * 1000 - 60_000;
      }
    }
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith("saavncdn.com")) {
      return now + 6 * 3600_000;
    }
    if (host.endsWith("archive.org")) {
      return now + 24 * 3600_000;
    }
  } catch {}
  return now + 2 * 3600_000;
}

const store = new JsonStore<StreamCacheFileSchema>(STREAM_CACHE_FILE, {
  schemaVersion: 3,
  defaults: { schemaVersion: 3, entries: {} },
  maxBytes: 4 * 1024 * 1024,
  flushDebounceMs: 2000,
  migrate: (raw: any) => {
    const now = Date.now();
    const migrated: Record<string, StreamCacheEntry> = {};
    const sourceEntries = raw?.entries && typeof raw.entries === "object" ? raw.entries : raw || {};
    let count = 0;
    for (const [k, v] of Object.entries(sourceEntries)) {
      if (count >= 2000) break;
      const keyLower = String(k || "").toLowerCase();
      if (
        keyLower.includes("bom gosto") ||
        keyLower.includes("rita lee") ||
        keyLower.includes("pitty") ||
        keyLower.includes("sophia")
      ) {
        continue;
      }
      const item = v as any;
      if (
        item &&
        typeof item.url === "string" &&
        !isForbidden30sPreviewUrl(item.url) &&
        !item.url.includes("discoveryprovider.audius.co") &&
        !item.url.startsWith("sc-buffer:") &&
        Number(item.durationSec) >= 60
      ) {
        let host = "unknown";
        try {
          host = new URL(item.url).hostname.toLowerCase();
        } catch {}
        const expiresAt =
          typeof item.expiresAt === "number" && item.expiresAt > now
            ? item.expiresAt
            : computeStreamExpiryMs(item.url);
        if (expiresAt > now) {
          migrated[k] = {
            url: item.url,
            source: String(item.source || "verified"),
            durationSec: Number(item.durationSec) || 200,
            host,
            resolvedAt: Number(item.resolvedAt) || now,
            expiresAt
          };
          count++;
        }
      }
    }
    return { schemaVersion: 3, entries: migrated };
  }
});

const memoryLru = new TtlLruCache<string, StreamCacheEntry>({
  maxEntries: 2000,
  maxBytes: 2 * 1024 * 1024,
  ttlMs: 24 * 3600_000,
  sizeOf: (e) => e.url.length + 128
});

// Hydrate memory LRU from store
try {
  const initial = store.get();
  const now = Date.now();
  for (const [k, entry] of Object.entries(initial.entries || {})) {
    if (
      entry &&
      entry.expiresAt > now &&
      !isForbidden30sPreviewUrl(entry.url) &&
      !entry.url.includes("discoveryprovider.audius.co")
    ) {
      memoryLru.set(k, entry, entry.expiresAt - now);
    }
  }
} catch {}

export function getStreamCacheEntry(key: string): StreamCacheEntry | undefined {
  const cleanKey = String(key || "").slice(0, 260);
  const entry = memoryLru.get(cleanKey);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    deleteStreamCacheEntry(cleanKey);
    return undefined;
  }
  return entry;
}

export function setStreamCacheEntry(
  key: string,
  input: { url: string; source: string; durationSec: number; expiresAt?: number }
): StreamCacheEntry | null {
  const cleanKey = String(key || "").slice(0, 260);
  if (
    !cleanKey ||
    !input?.url ||
    isForbidden30sPreviewUrl(input.url) ||
    input.url.includes("discoveryprovider.audius.co") ||
    input.url.startsWith("sc-buffer:")
  ) {
    return null;
  }
  const now = Date.now();
  const expiresAt =
    typeof input.expiresAt === "number" && input.expiresAt > now
      ? input.expiresAt
      : computeStreamExpiryMs(input.url);
  let host = "unknown";
  try {
    host = new URL(input.url).hostname.toLowerCase();
  } catch {}

  const entry: StreamCacheEntry = {
    url: input.url,
    source: input.source || "studio",
    durationSec: Number(input.durationSec) || 200,
    host,
    resolvedAt: now,
    expiresAt
  };

  memoryLru.set(cleanKey, entry, Math.max(1000, expiresAt - now));
  store
    .update((draft) => {
      draft.entries[cleanKey] = entry;
      const keys = Object.keys(draft.entries);
      if (keys.length > 2000) {
        const toDelete = keys.slice(0, keys.length - 2000);
        for (const oldKey of toDelete) {
          delete draft.entries[oldKey];
        }
      }
    })
    .catch(() => {});

  return entry;
}

export function deleteStreamCacheEntry(key: string): void {
  const cleanKey = String(key || "").slice(0, 260);
  memoryLru.delete(cleanKey);
  store
    .update((draft) => {
      delete draft.entries[cleanKey];
    })
    .catch(() => {});
}
