import fs from "fs";
import path from "path";

export interface JsonStoreOptions<T extends { schemaVersion: number }> {
  defaults: T;
  schemaVersion: number;
  migrate?: (raw: any) => T;
  maxBytes?: number;
  flushDebounceMs?: number;
}

const activeStores = new Set<JsonStore<any>>();
let exitHandlersRegistered = false;

function registerExitHandlers() {
  if (exitHandlersRegistered) return;
  exitHandlersRegistered = true;
  const flushAll = () => {
    for (const store of activeStores) {
      store.flushSync();
    }
  };
  process.once("beforeExit", flushAll);
}

export class JsonStore<T extends { schemaVersion: number }> {
  private readonly filePath: string;
  private readonly defaults: T;
  private readonly schemaVersion: number;
  private readonly migrate?: (raw: any) => T;
  private readonly maxBytes: number;
  private readonly flushDebounceMs: number;
  private state: T;
  private queue: Promise<void> = Promise.resolve();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(filePath: string, options: JsonStoreOptions<T>) {
    this.filePath = path.resolve(filePath);
    this.defaults = structuredClone(options.defaults);
    this.schemaVersion = options.schemaVersion;
    this.migrate = options.migrate;
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    this.flushDebounceMs = options.flushDebounceMs ?? 0;

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.state = this.loadInitial();
    activeStores.add(this);
    registerExitHandlers();
  }

  private loadInitial(): T {
    if (!fs.existsSync(this.filePath)) {
      return structuredClone(this.defaults);
    }

    try {
      const rawText = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === "object") {
        if (parsed.schemaVersion === this.schemaVersion) {
          return parsed as T;
        }
        if (this.migrate) {
          return this.migrate(parsed);
        }
      }
    } catch {
      const corruptPath = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.filePath, corruptPath);
      } catch {}

      const bakPath = `${this.filePath}.bak`;
      if (fs.existsSync(bakPath)) {
        try {
          const bakParsed = JSON.parse(fs.readFileSync(bakPath, "utf8"));
          if (bakParsed && typeof bakParsed === "object") {
            return bakParsed.schemaVersion === this.schemaVersion
              ? (bakParsed as T)
              : this.migrate
              ? this.migrate(bakParsed)
              : structuredClone(this.defaults);
          }
        } catch {}
      }
    }

    return structuredClone(this.defaults);
  }

  public get(): T {
    return structuredClone(this.state);
  }

  public update(mutator: (draft: T) => void): Promise<void> {
    const nextOp = this.queue.then(async () => {
      const draft = structuredClone(this.state);
      mutator(draft);
      draft.schemaVersion = this.schemaVersion;
      const serialized = JSON.stringify(draft, null, 2);
      if (Buffer.byteLength(serialized, "utf8") > this.maxBytes) {
        throw new Error("store_max_bytes_exceeded");
      }
      this.state = draft;
      this.dirty = true;

      if (this.flushDebounceMs > 0) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.flush().catch(() => {});
        }, this.flushDebounceMs);
      } else {
        await this.writeAtomic(serialized);
        this.dirty = false;
      }
    });

    this.queue = nextOp.catch(() => {});
    return nextOp;
  }

  private async writeAtomic(serialized: string): Promise<void> {
    const tmpPath = `${this.filePath}.tmp`;
    const bakPath = `${this.filePath}.bak`;

    if (fs.existsSync(this.filePath)) {
      try {
        await fs.promises.copyFile(this.filePath, bakPath);
      } catch {}
    }

    const fh = await fs.promises.open(tmpPath, "w");
    try {
      await fh.writeFile(serialized, "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }

    await fs.promises.rename(tmpPath, this.filePath);
  }

  public async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.queue;
    if (this.dirty) {
      const serialized = JSON.stringify(this.state, null, 2);
      await this.writeAtomic(serialized);
      this.dirty = false;
    }
  }

  public flushSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (!this.dirty) return;
    try {
      const serialized = JSON.stringify(this.state, null, 2);
      const tmpPath = `${this.filePath}.tmp`;
      const bakPath = `${this.filePath}.bak`;
      if (fs.existsSync(this.filePath)) {
        try {
          fs.copyFileSync(this.filePath, bakPath);
        } catch {}
      }
      const fd = fs.openSync(tmpPath, "w");
      try {
        fs.writeFileSync(fd, serialized, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, this.filePath);
      this.dirty = false;
    } catch {}
  }
}
