import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { JsonStore } from "../storage/jsonStore";

interface CounterState {
  schemaVersion: number;
  count: number;
  items: number[];
}

describe("JsonStore", () => {
  it("serializes concurrent updates atomically without data loss", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miado-jsonstore-"));
    const filePath = path.join(tmpDir, "counter.json");
    const store = new JsonStore<CounterState>(filePath, {
      schemaVersion: 1,
      defaults: { schemaVersion: 1, count: 0, items: [] }
    });

    await Promise.all(
      Array.from({ length: 15 }, (_, idx) =>
        store.update((draft) => {
          draft.count += 1;
          draft.items.push(idx);
        })
      )
    );

    const finalState = store.get();
    expect(finalState.count).toBe(15);
    expect(finalState.items).toHaveLength(15);

    const diskContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(diskContent.count).toBe(15);
    expect(fs.existsSync(`${filePath}.bak`)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("recovers from .bak if primary file is corrupted", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miado-jsonstore-bak-"));
    const filePath = path.join(tmpDir, "state.json");
    fs.writeFileSync(filePath, "{corrupted-json", "utf-8");
    fs.writeFileSync(
      `${filePath}.bak`,
      JSON.stringify({ schemaVersion: 1, ok: true, label: "backup" }),
      "utf-8"
    );

    const store = new JsonStore<{ schemaVersion: number; ok: boolean; label: string }>(filePath, {
      schemaVersion: 1,
      defaults: { schemaVersion: 1, ok: false, label: "fallback" }
    });

    expect(store.get()).toEqual({ schemaVersion: 1, ok: true, label: "backup" });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
