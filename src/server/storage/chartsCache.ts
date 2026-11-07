import path from "path";
import { JsonStore } from "./jsonStore.ts";
import type { RealTimeChartsPayload } from "../charts.ts";

export interface ChartsCacheRecord {
  payload: RealTimeChartsPayload;
  fetchedAt: number;
  expiresAt: number;
}

interface ChartsCacheFileSchema {
  schemaVersion: number;
  entry: ChartsCacheRecord | null;
}

const CHARTS_CACHE_FILE = path.join(process.cwd(), "data", "charts-cache.json");
export const CHARTS_TTL_MS = 60 * 60 * 1000; // 1 hour

export const chartsStore = new JsonStore<ChartsCacheFileSchema>(CHARTS_CACHE_FILE, {
  schemaVersion: 2,
  defaults: { schemaVersion: 2, entry: null },
  maxBytes: 4 * 1024 * 1024,
  flushDebounceMs: 500,
  migrate: (raw: any) => {
    if (raw?.entry && raw.entry.payload) {
      return {
        schemaVersion: 2,
        entry: {
          payload: raw.entry.payload,
          fetchedAt: Number(raw.entry.fetchedAt) || Date.now(),
          expiresAt: Number(raw.entry.expiresAt) || Date.now() + CHARTS_TTL_MS
        }
      };
    }
    if (raw?.payload && raw?.timestamp) {
      const ts = Number(raw.timestamp) || Date.now();
      return {
        schemaVersion: 2,
        entry: {
          payload: raw.payload,
          fetchedAt: ts,
          expiresAt: ts + CHARTS_TTL_MS
        }
      };
    }
    return { schemaVersion: 2, entry: null };
  }
});
