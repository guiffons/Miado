import fs from "fs";
import path from "path";

let firebaseProjectId = "axiomatic-electron-sbcxw";
let firestoreDatabaseId = "(default)";

try {
  const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    if (cfg.projectId) firebaseProjectId = String(cfg.projectId);
    if (cfg.firestoreDatabaseId) firestoreDatabaseId = String(cfg.firestoreDatabaseId);
  }
} catch {}

function getBaseFirestoreUrl(): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseProjectId
  )}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents`;
}

export function fromFirestoreFields(fields: Record<string, any> | undefined): Record<string, any> {
  if (!fields || typeof fields !== "object") return {};
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    result[k] = decodeFirestoreValue(v);
  }
  return result;
}

function decodeFirestoreValue(v: any): any {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return String(v.stringValue);
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return Boolean(v.booleanValue);
  if ("timestampValue" in v) return String(v.timestampValue);
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) {
    const vals = v.arrayValue?.values;
    return Array.isArray(vals) ? vals.map(decodeFirestoreValue) : [];
  }
  if ("mapValue" in v) {
    return fromFirestoreFields(v.mapValue?.fields);
  }
  return null;
}

export function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = encodeFirestoreValue(v);
  }
  return fields;
}

function encodeFirestoreValue(v: any): any {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(encodeFirestoreValue) } };
  }
  if (typeof v === "object") {
    return { mapValue: { fields: toFirestoreFields(v) } };
  }
  return { stringValue: String(v) };
}

export async function getFirestoreDocument(
  docPath: string,
  idToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ status: number; data: Record<string, any> | null }> {
  const cleanPath = docPath.replace(/^\/+/, "");
  const url = `${getBaseFirestoreUrl()}/${cleanPath}`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    return { status: res.status, data: null };
  }
  const body: any = await res.json();
  return { status: 200, data: fromFirestoreFields(body?.fields) };
}

export async function commitPlaylistTrackWrite(
  playlistId: string,
  trackKey: string,
  trackData: {
    trackKey: string;
    title: string;
    artist: string;
    albumTitle?: string;
    coverUrl?: string;
    durationSec: number;
    addedBy: string;
  },
  idToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ status: number }> {
  const baseDocPrefix = `projects/${firebaseProjectId}/databases/${firestoreDatabaseId}/documents`;
  const trackDocName = `${baseDocPrefix}/playlists/${playlistId}/tracks/${trackKey}`;
  const playlistDocName = `${baseDocPrefix}/playlists/${playlistId}`;
  const commitUrl = `https://firestore.googleapis.com/v1/${baseDocPrefix}:commit`;

  const res = await fetchImpl(commitUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: trackDocName,
            fields: toFirestoreFields(trackData)
          },
          updateTransforms: [
            {
              fieldPath: "addedAt",
              setToServerValue: "REQUEST_TIME"
            }
          ]
        },
        {
          transform: {
            document: playlistDocName,
            fieldTransforms: [
              {
                fieldPath: "updatedAt",
                setToServerValue: "REQUEST_TIME"
              }
            ]
          }
        }
      ]
    })
  });

  return { status: res.status };
}

export async function deleteFirestoreDocument(
  docPath: string,
  idToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ status: number }> {
  const cleanPath = docPath.replace(/^\/+/, "");
  const url = `${getBaseFirestoreUrl()}/${cleanPath}`;
  const res = await fetchImpl(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });
  return { status: res.status };
}
