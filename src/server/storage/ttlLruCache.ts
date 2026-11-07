export interface TtlLruCacheOptions<V> {
  maxEntries: number;
  maxBytes: number;
  ttlMs: number;
  sizeOf?: (val: V) => number;
}

interface CacheEntry<V> {
  value: V;
  bytes: number;
  expiresAt: number;
}

export class TtlLruCache<K, V> {
  private readonly map = new Map<K, CacheEntry<V>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly sizeOf: (val: V) => number;
  private currentBytes = 0;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: TtlLruCacheOptions<V>) {
    this.maxEntries = Math.max(1, options.maxEntries);
    this.maxBytes = Math.max(1, options.maxBytes);
    this.ttlMs = Math.max(100, options.ttlMs);
    this.sizeOf = options.sizeOf || (() => 1);

    this.pruneTimer = setInterval(() => this.prune(), 60_000);
    if (this.pruneTimer && typeof this.pruneTimer.unref === "function") {
      this.pruneTimer.unref();
    }
  }

  public get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.delete(key);
      return undefined;
    }
    // Refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  public has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  public set(key: K, value: V, customTtlMs?: number): void {
    const bytes = Math.max(0, this.sizeOf(value));
    if (bytes > this.maxBytes) return;

    if (this.map.has(key)) {
      this.delete(key);
    }

    while (
      this.map.size >= this.maxEntries ||
      (this.currentBytes + bytes > this.maxBytes && this.map.size > 0)
    ) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }

    const ttl = customTtlMs !== undefined ? customTtlMs : this.ttlMs;
    this.map.set(key, {
      value,
      bytes,
      expiresAt: Date.now() + ttl
    });
    this.currentBytes += bytes;
  }

  public delete(key: K): boolean {
    const existing = this.map.get(key);
    if (!existing) return false;
    this.currentBytes = Math.max(0, this.currentBytes - existing.bytes);
    return this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
    this.currentBytes = 0;
  }

  public prune(): void {
    const now = Date.now();
    for (const [k, v] of this.map.entries()) {
      if (now >= v.expiresAt) {
        this.delete(k);
      }
    }
  }

  public entries(): IterableIterator<[K, V]> {
    this.prune();
    const out: Array<[K, V]> = [];
    for (const [k, v] of this.map.entries()) {
      out.push([k, v.value]);
    }
    return out[Symbol.iterator]();
  }

  public get size(): number {
    this.prune();
    return this.map.size;
  }

  public get totalBytes(): number {
    return this.currentBytes;
  }
}
