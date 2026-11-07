import { describe, it, expect, vi } from "vitest";
import { TtlLruCache } from "../storage/ttlLruCache";

describe("TtlLruCache", () => {
  it("evicts least recently used entry when maxEntries is exceeded", () => {
    const cache = new TtlLruCache<string, number>({ maxEntries: 2, maxBytes: 1024, ttlMs: 60_000 });
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1); // "a" becomes most recently used
    cache.set("c", 3); // should evict "b"

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("evicts entries when maxBytes is exceeded", () => {
    const cache = new TtlLruCache<string, Uint8Array>({
      maxEntries: 10,
      maxBytes: 100,
      ttlMs: 60_000,
      sizeOf: (buf) => buf.byteLength
    });

    cache.set("buf1", new Uint8Array(60));
    cache.set("buf2", new Uint8Array(60));

    expect(cache.get("buf1")).toBeUndefined();
    expect(cache.get("buf2")?.byteLength).toBe(60);
    expect(cache.totalBytes).toBe(60);
  });

  it("expires entries after ttlMs", () => {
    vi.useFakeTimers();
    try {
      const cache = new TtlLruCache<string, string>({ maxEntries: 5, maxBytes: 1024, ttlMs: 1000 });
      cache.set("k", "val", 500);
      expect(cache.get("k")).toBe("val");

      vi.advanceTimersByTime(600);
      expect(cache.get("k")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
