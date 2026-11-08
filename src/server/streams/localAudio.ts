import path from "path";
import fs from "fs";

const AUDIO_ROOT = path.resolve(process.cwd(), "public", "audio");

export const LOCAL_AUDIO_MAP: Readonly<Record<string, string>> = Object.freeze({});

export function resolveSafeLocalAudioPath(localId: string): string | null {
  const cleanId = String(localId || "").trim();
  if (!Object.prototype.hasOwnProperty.call(LOCAL_AUDIO_MAP, cleanId)) {
    return null;
  }
  const resolved = LOCAL_AUDIO_MAP[cleanId];
  if (!resolved) return null;
  const rel = path.relative(AUDIO_ROOT, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel) || !resolved.endsWith(".m4a")) {
    return null;
  }
  if (!fs.existsSync(resolved)) {
    return null;
  }
  return resolved;
}
