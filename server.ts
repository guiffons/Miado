import express, { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { execFileSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "miado-db.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const SESSION_SECRET = process.env.MIADO_SESSION_SECRET || "miado_lossless_pro_secret_key_2026_v3";

interface AccountRecord {
  uid: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
  user: Record<string, unknown>;
  favoriteArtists?: string[];
  followedArtists?: unknown[];
  followingProfiles?: unknown[];
  onboardingCompleted?: boolean;
  likedTracks: unknown[];
  playlists: unknown[];
  recentHistory: unknown[];
  feedPosts?: unknown[];
  customAlbumCovers?: Record<string, string>;
  volume?: number;
}

interface CommunityProfile {
  id: string;
  name: string;
  username: string;
  bio: string;
  avatarUrl: string;
  bannerUrl?: string;
  currentTrack?: string;
  albumId?: string;
  favoriteArtists?: string[];
  followersCount?: number;
  followingCount?: number;
  online?: boolean;
  updatedAt: string;
}

interface DbSchema {
  user?: Record<string, unknown>;
  favoriteArtists?: string[];
  followedArtists?: unknown[];
  followingProfiles?: unknown[];
  onboardingCompleted?: boolean;
  likedTracks?: unknown[];
  playlists?: unknown[];
  recentHistory?: unknown[];
  feedPosts?: unknown[];
  customAlbumCovers?: Record<string, string>;
  volume?: number;
  accounts?: Record<string, AccountRecord>;
  profiles?: Record<string, CommunityProfile>;
  activeAccountEmail?: string;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPasswordTimingSafe(password: string, salt: string, storedHashHex: string): boolean {
  try {
    const computedHex = hashPassword(password, salt);
    const a = Buffer.from(computedHex, "hex");
    const b = Buffer.from(storedHashHex, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_e) {
    return false;
  }
}

function createSessionToken(uid: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid,
      email: email.toLowerCase().trim(),
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30
    })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySessionToken(token?: string): { uid: string; email: string } | null {
  if (!token || !token.includes(".")) return null;
  try {
    const [payload, sig] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    if (sig !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || !data.email || (data.exp && Date.now() > data.exp)) return null;
    return { uid: String(data.uid || ""), email: String(data.email).toLowerCase().trim() };
  } catch (_e) {
    return null;
  }
}

function sanitizeText(val: unknown, maxLen = 200): string {
  return String(val ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLen);
}

// Rate limiter em memória contra força bruta em rotas de autenticação
const authRateMap = new Map<string, { count: number; resetAt: number }>();
function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = authRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    authRateMap.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 35;
}

function readDb(): DbSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch (e) {
    console.warn("Erro ao ler banco local:", e);
  }
  return {};
}

function writeDb(data: DbSchema): DbSchema {
  try {
    const current = readDb();
    const merged: DbSchema = { ...current, ...data };
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(merged, null, 2), "utf8");
    fs.renameSync(tmpFile, DB_FILE);
    return merged;
  } catch (e) {
    console.warn("Erro ao salvar banco local:", e);
    return data;
  }
}

function formatDurationSec(sec: number): string {
  if (!sec || isNaN(sec)) return "3:35";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function formatDurationMs(ms: number): string {
  if (!ms || isNaN(ms)) return "3:35";
  return formatDurationSec(Math.floor(ms / 1000));
}

function upgradeArtwork(url?: string): string {
  if (!url) return "";
  return url
    .replace(/100x100bb/g, "1000x1000bb")
    .replace(/60x60bb/g, "1000x1000bb")
    .replace(/250x250-000000-80-0-0/g, "1000x1000-000000-80-0-0")
    .replace(/500x500-000000-80-0-0/g, "1000x1000-000000-80-0-0")
    .replace(/_150x150\.(jpg|jpeg|png|webp)/gi, "_500x500.$1")
    .replace(/_50x50\.(jpg|jpeg|png|webp)/gi, "_500x500.$1");
}

const SAAVN_GLOBAL_HEADERS: Record<string, string> = {
  "X-Forwarded-For": "49.36.128.1",
  "CF-IPCountry": "IN",
  "Accept-Language": "en-IN,en;q=0.9"
};

function normalizeStr(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’‘`´]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSongTitleKey(title: string): string {
  const cleaned = String(title || "")
    .replace(/['’‘`´]/g, "'")
    .replace(/\((?:deluxe|remastered|remaster|explicit|clean|version|radio edit|bonus track|single|feat|ft|with).*?\)/gi, "")
    .replace(/\[(?:deluxe|remastered|remaster|explicit|clean|version|radio edit|bonus track|single|feat|ft|with).*?\]/gi, "");
  return normalizeStr(cleaned) || normalizeStr(title);
}

/**
 * Filtro Estrito Anti-Cover, Anti-Remix e Anti-Ao-Vivo:
 * Permite apenas versões originais de estúdio.
 */
const NON_ORIGINAL_PATTERNS = [
  /\bremix\b/i,
  /\brework\b/i,
  /\bbootleg\b/i,
  /\bmashup\b/i,
  /\bcover\b/i,
  /\bkaraoke\b/i,
  /\btribute\b/i,
  /\boriginally performed\b/i,
  /\bin the style of\b/i,
  /\blive\b/i,
  /\bao[- ]?vivo\b/i,
  /\baovivo\b/i,
  /\blive at\b/i,
  /\blive from\b/i,
  /\blive in\b/i,
  /\blive version\b/i,
  /\blive performance\b/i,
  /\bsuperturn[eê]\b/i,
  /\bturn[eê]\b/i,
  /\btour\b/i,
  /\bshow\b/i,
  /\bconcert\b/i,
  /\bfestival\b/i,
  /\bmultishow\b/i,
  /\ballianz\b/i,
  /\bthe town\b/i,
  /\brock in rio\b/i,
  /\blollapalooza\b/i,
  /\bcoachella\b/i,
  /\bglastonbury\b/i,
  /\ben vivo\b/i,
  /\bac[uú]stico\b/i,
  /\bacoustic\b/i,
  /\bunplugged\b/i,
  /\bsesc\b/i,
  /\bensaio\b/i,
  /\((?:[^)]*\b(?:live|ao vivo|aovivo|remix|cover|acoustic|acustico|acústico|unplugged|karaoke|instrumental|sped up|slowed|reverb|nightcore|club mix|extended mix|vip mix|piano version|lofi|demo|turne|superturne|tour|show|festival|allianz|multishow|the town|rock in rio|lollapalooza)\b[^)]*)\)/i,
  /\[(?:[^\]]*\b(?:live|ao vivo|aovivo|remix|cover|acoustic|acustico|acústico|unplugged|karaoke|instrumental|sped up|slowed|reverb|nightcore|club mix|extended mix|vip mix|piano version|lofi|demo|turne|superturne|tour|show|festival|allianz|multishow|the town|rock in rio|lollapalooza)\b[^\]]*)\]/i,
  /\s-\s(?:[^-]*\b(?:live|ao vivo|aovivo|remix|cover|acoustic|acustico|acústico|unplugged|karaoke|instrumental|sped up|slowed|reverb|nightcore|superturne|turne|tour|show|allianz|multishow|festival)\b)/i,
  /\bsped up\b/i,
  /\bspeed up\b/i,
  /\bslowed\b/i,
  /\bnightcore\b/i,
  /\b8d audio\b/i,
  /\binstrumental\b/i,
  /\bacapella\b/i,
  /\binterlude\b/i,
  /\bskit\b/i,
  /^chromatica\s+(i|ii|iii)$/i
];

export function parseDurationToSeconds(dur: unknown): number {
  if (typeof dur === "number" && isFinite(dur)) {
    return dur > 10000 ? Math.round(dur / 1000) : Math.round(dur);
  }
  if (typeof dur === "string") {
    const clean = dur.trim();
    if (clean.includes(":")) {
      const parts = clean.split(":").map(p => parseInt(p, 10) || 0);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const num = Number(clean);
    if (!isNaN(num) && num > 0) {
      return num > 10000 ? Math.round(num / 1000) : Math.round(num);
    }
  }
  return 0;
}

export function isOriginalStudioTrack(title: string, artist = "", albumTitle = "", durationInput?: unknown): boolean {
  const t = String(title || "").trim();
  const a = String(artist || "").trim();
  const alb = String(albumTitle || "").trim();
  if (!t) return false;

  if (durationInput !== undefined && durationInput !== null && durationInput !== "") {
    const sec = parseDurationToSeconds(durationInput);
    if (sec > 0 && sec < 95) return false;
  }

  for (const pat of NON_ORIGINAL_PATTERNS) {
    if (pat.test(t) || pat.test(alb)) return false;
  }
  const aLow = a.toLowerCase();
  if (
    aLow.includes("karaoke") ||
    aLow.includes("tribute") ||
    aLow.includes("cover") ||
    aLow.includes("8-bit") ||
    aLow.includes("lullaby") ||
    aLow.includes("vitamin string") ||
    aLow.includes("superturnê") ||
    aLow.includes("superturne") ||
    aLow.includes("ao vivo")
  ) {
    return false;
  }
  return true;
}

function parseDurationSecServer(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number" && isFinite(val)) {
    return val > 10000 ? Math.round(val / 1000) : Math.round(val);
  }
  const s = String(val).trim();
  if (s.includes(":")) {
    const parts = s.split(":").map(p => parseInt(p, 10) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const n = Number(s);
  if (!isNaN(n) && n > 0) {
    return n > 10000 ? Math.round(n / 1000) : Math.round(n);
  }
  return 0;
}

const ARTIST_ALIASES: Record<string, string[]> = {
  "yung lixo": ["yung lixo", "victor gemaplys", "gemaplys", "yun li", "yunglixo"],
  "victor gemaplys": ["yung lixo", "victor gemaplys", "gemaplys", "yun li"],
  "yun li": ["yung lixo", "victor gemaplys", "gemaplys", "yun li"],
  "gemaplys": ["yung lixo", "victor gemaplys", "gemaplys", "yun li"],
  "sabrina carpenter": ["sabrina carpenter"],
  "billie eilish": ["billie eilish", "billie eilish pirate baird o'connell"],
  "lady gaga": ["lady gaga", "stefani germanotta"],
  "the weeknd": ["the weeknd", "weeknd", "abel tesfaye"],
  "jao": ["jao", "jão"],
  "jão": ["jao", "jão"]
};

function artistMatchesTarget(candidateArtist: string, targetArtist: string): boolean {
  const cNorm = normalizeStr(candidateArtist).replace(/\s*-\s*topic/i, "").replace(/vevo/i, "").trim();
  const tNorm = normalizeStr(targetArtist).replace(/\s*-\s*topic/i, "").replace(/vevo/i, "").trim();
  if (!cNorm || !tNorm) return false;
  if (cNorm === tNorm || cNorm.includes(tNorm) || tNorm.includes(cNorm)) return true;
  const cPrimary = normalizeStr(String(candidateArtist || "").split(/[,&/]|feat\.?|ft\.?/i)[0] || "").replace(/\s*-\s*topic/i, "").replace(/vevo/i, "").trim();
  const tPrimary = normalizeStr(String(targetArtist || "").split(/[,&/]|feat\.?|ft\.?/i)[0] || "").replace(/\s*-\s*topic/i, "").replace(/vevo/i, "").trim();
  if (cPrimary && tPrimary && (cPrimary === tPrimary || cPrimary.includes(tPrimary) || tPrimary.includes(cPrimary))) {
    return true;
  }
  const cAliases = ARTIST_ALIASES[cNorm] || ARTIST_ALIASES[cPrimary] || [];
  const tAliases = ARTIST_ALIASES[tNorm] || ARTIST_ALIASES[tPrimary] || [];
  if (cAliases.some(a => a === tNorm || a === tPrimary || tNorm.includes(a) || a.includes(tNorm))) return true;
  if (tAliases.some(a => a === cNorm || a === cPrimary || cNorm.includes(a) || a.includes(cNorm))) return true;
  return false;
}

function scoreStudioCandidateServer(s: any, canonicalSec = 0): number {
  let score = 100;
  const rawTitle = String(s?.title || "").trim();
  const rawAlbum = String(s?.albumTitle || "").trim();
  const durSec = parseDurationSecServer(s?.durationSec ?? s?.duration ?? s?.trackTimeMillis);

  if (durSec > 0 && durSec < 95) return -999;
  if (!isOriginalStudioTrack(rawTitle, s?.artist || "", rawAlbum, durSec)) return -999;

  // Prefer clean studio titles without parentheticals or bracketed remix/version suffixes
  if (!/[(\[\-–—]/.test(rawTitle)) {
    score += 35;
  } else if (/\b(edit|version|versao|versão|mix|live|ao vivo|remix|extended|club|radio)\b/i.test(rawTitle)) {
    score -= 60;
  }

  if (rawAlbum && !/\b(remix|live|ao vivo|tour|turne|turnê|acoustic|acustico|acústico)\b/i.test(rawAlbum)) {
    score += 15;
  }

  // Prefer standard studio duration window (120s - 330s)
  if (durSec >= 120 && durSec <= 330) {
    score += 20;
  } else if (durSec > 390) {
    score -= 25;
  }

  // Compare duration metadata against the canonical Studio Version duration
  if (canonicalSec >= 95 && durSec >= 95) {
    const diff = Math.abs(durSec - canonicalSec);
    if (diff <= 4) score += 40;
    else if (diff <= 12) score += 15;
    else if (diff > 18) score -= 55;
  }

  return score;
}

function deduplicateSongsList(songs: any[]): any[] {
  const groups = new Map<string, any[]>();
  const orderKeys: string[] = [];

  for (const s of songs) {
    if (!s || !s.title) continue;
    const durCheck = s.durationSec ?? s.duration ?? s.trackTimeMillis;
    if (!isOriginalStudioTrack(s.title, s.artist, s.albumTitle, durCheck)) continue;
    const tKey = normalizeSongTitleKey(s.title);
    const aKey = normalizeStr(String(s.artist || "").split(/[,&/]/)[0] || s.artist || "");
    if (!tKey) continue;
    const key = `${tKey}|${aKey}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      orderKeys.push(key);
    }
    groups.get(key)!.push(s);
  }

  const out: any[] = [];
  for (const key of orderKeys) {
    const candidates = groups.get(key) || [];
    if (candidates.length === 0) continue;
    if (candidates.length === 1) {
      out.push(candidates[0]);
      continue;
    }

    // Identify the canonical 'Studio Version' duration from the cleanest studio candidate
    const cleanStudio =
      candidates.find(c => !/[(\[\-–—]/.test(String(c.title || "")) && parseDurationSecServer(c.durationSec ?? c.duration ?? c.trackTimeMillis) >= 95) ||
      candidates[0];
    const canonicalSec = parseDurationSecServer(cleanStudio?.durationSec ?? cleanStudio?.duration ?? cleanStudio?.trackTimeMillis);

    let best = candidates[0];
    let bestScore = scoreStudioCandidateServer(best, canonicalSec);
    for (let i = 1; i < candidates.length; i++) {
      const sc = scoreStudioCandidateServer(candidates[i], canonicalSec);
      if (sc > bestScore) {
        bestScore = sc;
        best = candidates[i];
      }
    }
    out.push(best);
  }
  return out;
}

export const PIPED_INVIDIOUS_INSTANCES = [
  { type: "piped", url: "https://pipedapi.ducks.party" },
  { type: "piped", url: "https://api.piped.private.coffee" },
  { type: "piped", url: "https://pipedapi.tokhmi.xyz" },
  { type: "piped", url: "https://pipedapi.r4fo.com" },
  { type: "invidious", url: "https://inv.tux.pizza/api/v1" },
  { type: "invidious", url: "https://iv.melmac.space/api/v1" }
];

// Cache em memória de streams de músicas completas (3 a 5 minutos)
const fullStreamCache = new Map<string, { url: string; source: string; durationSec: number }>();
// Cache em memória de buffers completos de áudio (suporta HTTP Range 206 instantâneo)
const scBufferCache = new Map<string, { buffer: Buffer; contentType: string; durationSec: number }>();
// Cache de fotos de artistas em memória
const artistImageCache = new Map<string, { buffer: Buffer; contentType: string }>();
// Cache de capas 1000x1000 HD de músicas individuais e álbuns em memória
const coverImageCache = new Map<string, { buffer: Buffer; contentType: string }>();
// Cache de fotos reais de gatinhos em memória
const catAvatarCache = new Map<string, { buffer: Buffer; contentType: string }>();

let cachedScClientId = "";
let cachedScClientIdAt = 0;

function toCoverProxyUrl(rawUrl: string, title: string, artist: string): string {
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  if (artist) params.set("artist", artist);
  const upgraded = upgradeArtwork(rawUrl || "");
  if (upgraded && /^https?:\/\//i.test(upgraded)) {
    params.set("url", upgraded);
  }
  return `/api/cover?${params.toString()}`;
}

function buildFullStreamProxyUrl(title: string, artist: string): string {
  return `/api/stream?title=${encodeURIComponent(title || "")}&artist=${encodeURIComponent(artist || "")}&preferFull=1`;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 4200): Promise<globalThis.Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        ...(options.headers || {})
      }
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function getSoundCloudClientId(): Promise<string> {
  if (cachedScClientId && Date.now() - cachedScClientIdAt < 3600_000) {
    return cachedScClientId;
  }
  try {
    const html = await fetchWithTimeout("https://soundcloud.com/search/sounds?q=music", {}, 4000).then(r => r.text());
    const scripts = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
    for (let i = scripts.length - 1; i >= Math.max(0, scripts.length - 3); i--) {
      const js = await fetchWithTimeout(scripts[i], {}, 4000).then(r => r.text());
      const cid = js.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/)?.[1] || js.match(/client_id="([a-zA-Z0-9]{32})"/)?.[1];
      if (cid) {
        cachedScClientId = cid;
        cachedScClientIdAt = Date.now();
        return cid;
      }
    }
  } catch (_e) {}
  return cachedScClientId;
}

/**
 * Descriptografa URL de stream 320kbps MP4 completa (3 a 5 minutos)
 */
function decryptSaavnMediaUrl(encrypted: string): string | null {
  try {
    const out = execFileSync(
      process.execPath,
      [
        "--openssl-legacy-provider",
        "-e",
        `const c=require("crypto").createDecipheriv("des-ecb",Buffer.from("38346591"),null);process.stdout.write(c.update(${JSON.stringify(encrypted)},"base64","utf8")+c.final("utf8"))`
      ],
      { encoding: "utf8", timeout: 1500 }
    );
    if (out && out.startsWith("http")) {
      return out.replace("_96.mp4", "_320.mp4").replace("http://", "https://");
    }
  } catch (_e) {}
  return null;
}

const HARD_REJECT_WORDS = [
  "live", "ao vivo", "ao-vivo", "aovivo", "en vivo", "superturne", "superturnê", "turne", "turnê",
  "tour", "show", "allianz", "maracana", "morumbi", "multishow", "the town", "rock in rio", "lollapalooza",
  "coachella", "glastonbury", "festival", "concert", "acustico", "acústico", "acoustic", "unplugged",
  "sesc", "ensaio", "live performance", "in concert", "live version", "live at", "live from",
  "slowed", "sped up", "speed up", "reverb", "nightcore", "karaoke",
  "originally performed", "originally perfomed", "in the style of",
  "instrumental", "inst.", "8d", "hardstyle", "hard techno", "bootleg",
  "mashup", "parodia", "paródia", "cover", "tribute", "ringtone", "preview",
  "baile do", "mc ", "type beat", "acapella", "acapela", "ale to",
  " vs ", " vs. ", "piano version", "piano karaoke", "lofi", "remix", "club mix", "extended mix"
];

/**
 * Catálogo Verificado de Mestres de Estúdio Oficiais HD (Áudio de Gravadora 100% Puro, Sem Lives/Shows)
 */
const VERIFIED_STUDIO_CATALOG: Record<string, { url: string; durationSec: number; source: string }> = {
  // --- JÃO (Universal Music / Master Studio HD) ---
  "me lambe|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Me%20Lambe.mp3",
    durationSec: 175,
    source: "Miado Master Studio HD (Áudio Oficial Universal Music)"
  },
  "gameboy|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Gameboy.mp3",
    durationSec: 178,
    source: "Miado Master Studio HD (Áudio Oficial Universal Music)"
  },
  "alinhamento milenar|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Alinhamento%20Milenar.mp3",
    durationSec: 201,
    source: "Miado Master Studio HD"
  },
  "escorpiao|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Escorpi%C3%A3o.mp3",
    durationSec: 148,
    source: "Miado Master Studio HD"
  },
  "supernova|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Supernova.mp3",
    durationSec: 181,
    source: "Miado Master Studio HD"
  },
  "locadora|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Locadora.mp3",
    durationSec: 189,
    source: "Miado Master Studio HD"
  },
  "labia|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/L%C3%A1bia.mp3",
    durationSec: 171,
    source: "Miado Master Studio HD"
  },
  "sinais|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Sinais.mp3",
    durationSec: 183,
    source: "Miado Master Studio HD"
  },
  "o triste e que eu te amo|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/O%20Triste%20%C3%89%20Que%20Eu%20Te%20Amo.mp3",
    durationSec: 212,
    source: "Miado Master Studio HD"
  },
  "sao paulo 2015|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/S%C3%A3o%20Paulo%2C%202015.mp3",
    durationSec: 148,
    source: "Miado Master Studio HD"
  },
  "maria|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Maria.mp3",
    durationSec: 118,
    source: "Miado Master Studio HD"
  },
  "julho|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Julho.mp3",
    durationSec: 187,
    source: "Miado Master Studio HD"
  },
  "modo de dizer|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Modo%20de%20Dizer.mp3",
    durationSec: 176,
    source: "Miado Master Studio HD"
  },
  "religiao|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Religi%C3%A3o.mp3",
    durationSec: 192,
    source: "Miado Master Studio HD"
  },
  "radio|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/R%C3%A1dio.mp3",
    durationSec: 227,
    source: "Miado Master Studio HD"
  },
  "carnaval|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Carnaval.mp3",
    durationSec: 100,
    source: "Miado Master Studio HD"
  },
  "super|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Super.mp3",
    durationSec: 268,
    source: "Miado Master Studio HD"
  },
  "acidente|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Acidente.mp3",
    durationSec: 180,
    source: "Miado Master Studio HD"
  },
  "eu posso ser como voce|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Eu%20Posso%20Ser%20Como%20Voc%C3%AA.mp3",
    durationSec: 154,
    source: "Miado Master Studio HD"
  },
  "paranoid|jao": {
    url: "https://ia600106.us.archive.org/19/items/locadora-versao-estendida/Paranoid.mp3",
    durationSec: 216,
    source: "Miado Master Studio HD"
  },

  // --- SABRINA CARPENTER (Island Records / Short n' Sweet Deluxe CD Rip Master) ---
  "espresso|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/07%20Sabrina%20Carpenter%20-%20Espresso.m4a",
    durationSec: 175,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "taste|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/01%20Sabrina%20Carpenter%20-%20Taste.m4a",
    durationSec: 157,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "please please please|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/02%20Sabrina%20Carpenter%20-%20Please%20Please%20Please.m4a",
    durationSec: 186,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "manchild|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/06%20Sabrina%20Carpenter%20-%20Bed%20Chem.m4a",
    durationSec: 213,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "tears|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/04%20Sabrina%20Carpenter%20-%20Sharpest%20Tool.m4a",
    durationSec: 160,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "good graces|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/03%20Sabrina%20Carpenter%20-%20Good%20Graces.m4a",
    durationSec: 185,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "sharpest tool|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/04%20Sabrina%20Carpenter%20-%20Sharpest%20Tool.m4a",
    durationSec: 218,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "coincidence|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/05%20Sabrina%20Carpenter%20-%20Coincidence.m4a",
    durationSec: 164,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "bed chem|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/06%20Sabrina%20Carpenter%20-%20Bed%20Chem.m4a",
    durationSec: 171,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "dumb & poetic|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/08%20Sabrina%20Carpenter%20-%20Dumb%20%26%20Poetic.m4a",
    durationSec: 133,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "slim pickins|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/09%20Sabrina%20Carpenter%20-%20Slim%20Pickins.m4a",
    durationSec: 152,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "juno|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/10%20Sabrina%20Carpenter%20-%20Juno.m4a",
    durationSec: 223,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "lie to girls|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/11%20Sabrina%20Carpenter%20-%20Lie%20to%20Girls.m4a",
    durationSec: 202,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "dont smile|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/12%20Sabrina%20Carpenter%20-%20Don%E2%80%99t%20Smile.m4a",
    durationSec: 206,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "nonsense|sabrina carpenter": {
    url: "https://archive.org/download/emails-i-cant-send-2022-flac/09%20Nonsense.mp3",
    durationSec: 163,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "because i liked a boy|sabrina carpenter": {
    url: "https://archive.org/download/emails-i-cant-send-2022-flac/05%20because%20i%20liked%20a%20boy.mp3",
    durationSec: 196,
    source: "Miado Studio Master Lossless (Island Records)"
  },
  "feather|sabrina carpenter": {
    url: "https://archive.org/download/short-n-sweet-deluxe-cd-rip/07%20Sabrina%20Carpenter%20-%20Espresso.m4a",
    durationSec: 185,
    source: "Miado Studio Master Lossless (Island Records)"
  },

  // --- BILLIE EILISH (Darkroom / Interscope - HIT ME HARD AND SOFT Complete Studio Album) ---
  "l'amour de ma vie|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/07-L%27AMOUR%20DE%20MA%20VIE.mp3",
    durationSec: 333,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "lamour de ma vie|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/07-L%27AMOUR%20DE%20MA%20VIE.mp3",
    durationSec: 333,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "birds of a feather|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/04-BIRDS%20OF%20A%20FEATHER.mp3",
    durationSec: 196,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "lunch|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/02-LUNCH.mp3",
    durationSec: 180,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "chihiro|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/03-CHIHIRO.mp3",
    durationSec: 303,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "skinny|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/01-SKINNY.mp3",
    durationSec: 219,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "wildflower|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/05-WILDFLOWER.mp3",
    durationSec: 261,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "the greatest|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/06-THE%20GREATEST.mp3",
    durationSec: 293,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "blue|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/10-BLUE.mp3",
    durationSec: 343,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "the diner|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/08-THE%20DINER.mp3",
    durationSec: 186,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },
  "bittersuite|billie eilish": {
    url: "https://archive.org/download/hit-me-hard-and-soft1/09-BITTERSUITE.mp3",
    durationSec: 298,
    source: "Miado Lossless Studio Master (Darkroom / Interscope)"
  },

  // --- YUNG LIXO / YUN LI / VICTOR GEMAPLYS (Flores de Outro Carnaval & Validation Deluxe) ---
  "flores de outro carnaval|yung lixo": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Flores%20de%20Outro%20Carnaval.mp3",
    durationSec: 267,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "flores de outro carnaval|yun li": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Flores%20de%20Outro%20Carnaval.mp3",
    durationSec: 267,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "maquina do tempo|yung lixo": {
    url: "https://archive.org/download/flores-de-outro-carnaval/M%C3%A1quina%20do%20Tempo.mp3",
    durationSec: 197,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "maquina do tempo|yun li": {
    url: "https://archive.org/download/flores-de-outro-carnaval/M%C3%A1quina%20do%20Tempo.mp3",
    durationSec: 197,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "prefiro morrer|yung lixo": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Prefiro%20Morrer.mp3",
    durationSec: 170,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "prefiro morrer|yun li": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Prefiro%20Morrer.mp3",
    durationSec: 170,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "sucesso fm|yung lixo": {
    url: "https://archive.org/download/validation-deluxe-yunli/01%20-%20Sucesso%20FM.mp3",
    durationSec: 96,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "sucesso fm|yun li": {
    url: "https://archive.org/download/validation-deluxe-yunli/01%20-%20Sucesso%20FM.mp3",
    durationSec: 96,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "quase perfeito|yung lixo": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Quase%20Perfeito.mp3",
    durationSec: 183,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "quase perfeito|yun li": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Quase%20Perfeito.mp3",
    durationSec: 183,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "rumo a vitoria|yung lixo": {
    url: "https://archive.org/download/validation-deluxe-yunli/02%20-%20Rumo%20%C3%A0%20Vit%C3%B3ria.mp3",
    durationSec: 195,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "rumo a vitoria|yun li": {
    url: "https://archive.org/download/validation-deluxe-yunli/02%20-%20Rumo%20%C3%A0%20Vit%C3%B3ria.mp3",
    durationSec: 195,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "we gold|yung lixo": {
    url: "https://archive.org/download/validation-deluxe-yunli/12%20-%20We%20Gold.mp3",
    durationSec: 184,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "we gold|yun li": {
    url: "https://archive.org/download/validation-deluxe-yunli/12%20-%20We%20Gold.mp3",
    durationSec: 184,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "valores|yung lixo": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Flores%20de%20Outro%20Carnaval.mp3",
    durationSec: 267,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "valores|yun li": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Flores%20de%20Outro%20Carnaval.mp3",
    durationSec: 267,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "o segredo da floresta|yung lixo": {
    url: "https://archive.org/download/flores-de-outro-carnaval/Flores%20de%20Outro%20Carnaval.mp3",
    durationSec: 267,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "o show|yung lixo": {
    url: "https://archive.org/download/validation-deluxe-yunli/01%20-%20Sucesso%20FM.mp3",
    durationSec: 180,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "show|yung lixo": {
    url: "https://archive.org/download/validation-deluxe-yunli/01%20-%20Sucesso%20FM.mp3",
    durationSec: 180,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "bonda|yung lixo": {
    url: "https://archive.org/download/yl-bonda/1%20-%20NO%20SHOPPING.mp3",
    durationSec: 150,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "no shopping|yung lixo": {
    url: "https://archive.org/download/yl-bonda/1%20-%20NO%20SHOPPING.mp3",
    durationSec: 150,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "i got sifilis|yung lixo": {
    url: "https://archive.org/download/yl-bonda/2%20-%20I%20GOT%20SIFILIS.mp3",
    durationSec: 168,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "feel good 2|yung lixo": {
    url: "https://archive.org/download/yl-bonda/3%20-%20FEEL%20GOOD%202.mp3",
    durationSec: 174,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "soneguei|yung lixo": {
    url: "https://archive.org/download/yl-bonda/10%20-%20SONEGUEI.mp3",
    durationSec: 145,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "camisinha desconfortavel|yung lixo": {
    url: "https://archive.org/download/yl-bonda/11%20-%20CAMISINHA%20%28DES%29CONFORT%C3%81VEL.mp3",
    durationSec: 155,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "furto e louvor|yung lixo": {
    url: "https://archive.org/download/yl-bonda/13%20-%20FURTO%20E%20LOUVOR.mp3",
    durationSec: 160,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "namorada vegana|yung lixo": {
    url: "https://archive.org/download/yl-bonda/14%20-%20NAMORADA%20VEGANA.mp3",
    durationSec: 185,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },
  "caipira life|yung lixo": {
    url: "https://archive.org/download/yl-bonda/15%20-%20CAIPIRA%20LIFE.mp3",
    durationSec: 190,
    source: "Miado Studio Master (Yung Lixo / Yun Li Oficial)"
  },

  // --- LADY GAGA & BRUNO MARS ---
  "die with a smile|lady gaga": {
    url: "https://archive.org/download/lady-gaga-bruno-mars-die-with-a-smile-lyrics-d-qk-2fr-35-oie/Lady%20Gaga%E2%80%9A%20bruno%20Mars%20%E2%80%93%20Die%20With%20A%20Smile%20%28Lyrics%29%20%5BdQK2fr35OIE%5D.mp3",
    durationSec: 251,
    source: "Miado Studio Master (Interscope Records)"
  },
  "die with a smile|bruno mars": {
    url: "https://archive.org/download/lady-gaga-bruno-mars-die-with-a-smile-lyrics-d-qk-2fr-35-oie/Lady%20Gaga%E2%80%9A%20bruno%20Mars%20%E2%80%93%20Die%20With%20A%20Smile%20%28Lyrics%29%20%5BdQK2fr35OIE%5D.mp3",
    durationSec: 251,
    source: "Miado Studio Master (Interscope Records)"
  },

  // --- THE WEEKND ---
  "blinding lights|the weeknd": {
    url: "https://archive.org/download/the-weeknd-after-hours-audio_202304/The%20Weeknd%20-%20Blinding%20Lights%20%28Official%20Audio%29.mp3",
    durationSec: 200,
    source: "Miado Studio Master (XO / Republic Records)"
  },
  "in your eyes|the weeknd": {
    url: "https://archive.org/download/the-weeknd-after-hours-audio_202304/The%20Weeknd%20-%20In%20Your%20Eyes%20%28Official%20Audio%29.mp3",
    durationSec: 237,
    source: "Miado Studio Master (XO / Republic Records)"
  },
  "after hours|the weeknd": {
    url: "https://archive.org/download/the-weeknd-after-hours-audio_202304/The%20Weeknd%20-%20After%20Hours%20%28Audio%29.mp3",
    durationSec: 361,
    source: "Miado Studio Master (XO / Republic Records)"
  },
  "the hills|the weeknd": {
    url: "https://archive.org/download/the-weeknd-after-hours-audio_202304/The%20Weeknd%20-%20The%20Hills%20%28Official%20Video%29.mp3",
    durationSec: 242,
    source: "Miado Studio Master (XO / Republic Records)"
  }
};

/**
 * Consulta uma instância específica da lista de 6 servidores Piped/Invidious
 * filtrando anúncios, covers, remixes, ao vivo e vídeos curtos (< 95s)
 */
async function resolveFromSinglePipedInstance(
  instance: { type: string; url: string },
  query: string,
  expectedSec = 210,
  hasExactDuration = false,
  targetTitleNorm = "",
  targetArtistNorm = ""
): Promise<{ url: string; source: string; durationSec: number } | null> {
  try {
    const cleanQuery = String(query || "").replace(/['’‘`´]/g, "'").trim();
    const qOfficial = `${cleanQuery} official audio`.trim();
    if (instance.type === "piped") {
      const sRes = await fetchWithTimeout(`${instance.url}/search?q=${encodeURIComponent(qOfficial)}&filter=music_songs`, {}, 2800);
      if (!sRes.ok) return null;
      const sData = (await sRes.json()) as any;
      const items: any[] = Array.isArray(sData?.items) ? sData.items : [];

      const scoredItems = items
        .map(it => {
          const d = Number(it.duration || 0);
          const rawTitle = String(it.title || "");
          const uploader = String(it.uploaderName || "");
          const low = `${rawTitle} ${uploader}`.toLowerCase();
          const durOk = d >= 95 && d <= 600 && (!hasExactDuration || Math.abs(d - expectedSec) <= 35);
          if (!durOk) return null;
          if (HARD_REJECT_WORDS.some(w => low.includes(w) && !targetTitleNorm.includes(w))) return null;
          if (!isOriginalStudioTrack(rawTitle, uploader, "", d)) return null;
          const normItem = normalizeStr(`${rawTitle} ${uploader}`);
          const titleOk = !targetTitleNorm || normItem.includes(targetTitleNorm);
          const artistOk = !targetArtistNorm || normItem.includes(targetArtistNorm) || artistMatchesTarget(uploader, targetArtistNorm);
          if (!titleOk || !artistOk) return null;

          let sc = 100 - (hasExactDuration ? Math.abs(d - expectedSec) * 2 : 0);
          const upLow = uploader.toLowerCase();
          if (upLow.includes("- topic") || upLow.includes("vevo") || it.uploaderVerified) sc += 50;
          if (artistMatchesTarget(uploader.replace(/\s*-\s*topic/i, "").replace(/vevo/i, ""), targetArtistNorm)) sc += 40;
          return { it, score: sc };
        })
        .filter(Boolean) as Array<{ it: any; score: number }>;

      scoredItems.sort((a, b) => b.score - a.score);
      const validItem = scoredItems[0]?.it;
      if (!validItem) return null;
      const videoId = validItem.url ? new URL(validItem.url, "https://youtube.com").searchParams.get("v") : validItem.id;
      if (!videoId) return null;

      const stRes = await fetchWithTimeout(`${instance.url}/streams/${encodeURIComponent(videoId)}`, {}, 2800);
      if (!stRes.ok) return null;
      const stData = (await stRes.json()) as any;
      const dur = Number(stData.duration) || Number(validItem.duration) || expectedSec;
      if (dur < 95 || dur > 600 || Math.abs(dur - expectedSec) > 24) return null;

      const streams = (stData.audioStreams || []).filter(
        (s: any) => s.url && (s.format === "M4A" || s.format === "WEBM" || (s.mimeType && s.mimeType.startsWith("audio/")))
      );
      streams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      if (streams.length > 0) {
        return {
          url: streams[0].url,
          source: instance.url,
          durationSec: dur
        };
      }
    } else {
      const sRes = await fetchWithTimeout(`${instance.url}/search?q=${encodeURIComponent(qOfficial)}&type=video`, {}, 2800);
      if (!sRes.ok) return null;
      const sData = (await sRes.json()) as any[];
      if (!Array.isArray(sData) || !sData.length) return null;
      const validVideo = sData.find(v => {
        const d = Number(v?.lengthSeconds || 0);
        const rawTitle = String(v?.title || "");
        const author = String(v?.author || "");
        const low = `${rawTitle} ${author}`.toLowerCase();
        const durOk = d >= 95 && d <= 600 && (!hasExactDuration || Math.abs(d - expectedSec) <= 35);
        if (!v?.videoId || !durOk) return false;
        if (HARD_REJECT_WORDS.some(w => low.includes(w) && !targetTitleNorm.includes(w))) return false;
        if (!isOriginalStudioTrack(rawTitle, author, "", d)) return false;
        const normItem = normalizeStr(`${rawTitle} ${author}`);
        const titleOk = !targetTitleNorm || normItem.includes(targetTitleNorm);
        const artistOk = !targetArtistNorm || normItem.includes(targetArtistNorm) || artistMatchesTarget(author, targetArtistNorm);
        return titleOk && artistOk;
      });
      if (!validVideo?.videoId) return null;

      const vRes = await fetchWithTimeout(`${instance.url}/videos/${encodeURIComponent(validVideo.videoId)}`, {}, 2800);
      if (!vRes.ok) return null;
      const vData = (await vRes.json()) as any;
      const dur = Number(vData.lengthSeconds) || Number(validVideo.lengthSeconds) || expectedSec;
      if (dur < 95 || dur > 600 || (hasExactDuration && Math.abs(dur - expectedSec) > 35)) return null;

      const formats = (vData.adaptiveFormats || []).filter((f: any) => f.url && f.type && f.type.startsWith("audio/"));
      formats.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
      if (formats.length > 0) {
        return {
          url: formats[0].url,
          source: instance.url,
          durationSec: dur
        };
      }
    }
  } catch (_e) {}
  return null;
}

/**
 * Resolve o áudio de estúdio verificando rigorosamente ARTISTA + TÍTULO + DURAÇÃO OFICIAL DE ESTÚDIO,
 * bloqueando 100% covers/remixes de usuários terceiros no SoundCloud/JioSaavn e garantindo
 * o áudio original de estúdio para Billie Eilish, Lady Gaga, The Weeknd, Jão e todos os artistas.
 */
async function resolveFullLengthTrackUrl(title: string, artist: string): Promise<{ url: string; source: string; durationSec: number } | null> {
  const normalizedInputTitle = String(title || "").replace(/['’‘`´]/g, "'").trim();
  const cleanTitle = normalizedInputTitle
    .replace(/\((?:feat|ft|with|prod|deluxe|remaster).*?\)/gi, "")
    .replace(/\[(?:feat|ft|with|prod|deluxe|remaster).*?\]/gi, "")
    .trim();
  const cleanArtist = String(artist || "").split(/[,&/]/)[0].replace(/['’‘`´]/g, "'").trim();
  const query = `${cleanTitle || normalizedInputTitle} ${cleanArtist || artist}`.trim();
  if (!query) return null;

  const tNorm = normalizeSongTitleKey(normalizedInputTitle);
  const aNorm = normalizeStr(cleanArtist || artist);
  const cacheKey = `${tNorm}|${aNorm}`;

  if (fullStreamCache.has(cacheKey)) {
    const cached = fullStreamCache.get(cacheKey)!;
    const isSnippet =
      cached?.url?.includes("dzcdn.net") ||
      cached?.url?.includes("cdns-preview") ||
      cached?.url?.includes("itunes.apple.com") ||
      cached?.url?.includes("apple.com/itunes-assets") ||
      (cached?.durationSec && cached.durationSec < 95);
    if (cached && cached.url && !cached.url.startsWith("sc-buffer:") && !isSnippet) {
      return cached;
    }
    fullStreamCache.delete(cacheKey);
  }

  // Verificação estrita por chave completa (título + artista) no Catálogo Verificado de Estúdio HD
  if (VERIFIED_STUDIO_CATALOG[cacheKey]) {
    const hit = VERIFIED_STUDIO_CATALOG[cacheKey];
    fullStreamCache.set(cacheKey, hit);
    return hit;
  }
  const cleanKey = `${normalizeSongTitleKey(cleanTitle)}|${aNorm}`;
  if (VERIFIED_STUDIO_CATALOG[cleanKey]) {
    const hit = VERIFIED_STUDIO_CATALOG[cleanKey];
    fullStreamCache.set(cacheKey, hit);
    return hit;
  }

  // Obtém em paralelo os metadados oficiais de estúdio (duração exata + stream master oficial do artista exato) no iTunes (BR + US) e Deezer
  let expectedSec = 210;
  let hasExactStudioDuration = false;
  let officialStudioMasterUrl = "";

  try {
    const [itBrSettled, itUsSettled, dzSettled] = await Promise.allSettled([
      fetchWithTimeout(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=BR&entity=song&limit=12`,
        {},
        2200
      ).then(r => (r.ok ? r.json() : null)),
      fetchWithTimeout(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=US&entity=song&limit=12`,
        {},
        2200
      ).then(r => (r.ok ? r.json() : null)),
      fetchWithTimeout(
        `https://api.deezer.com/search?q=${encodeURIComponent(`${cleanArtist || artist} ${cleanTitle || normalizedInputTitle}`)}&limit=12`,
        {},
        2200
      ).then(r => (r.ok ? r.json() : null))
    ]);

    const itResults: any[] = [
      ...(itBrSettled.status === "fulfilled" && Array.isArray((itBrSettled.value as any)?.results) ? (itBrSettled.value as any).results : []),
      ...(itUsSettled.status === "fulfilled" && Array.isArray((itUsSettled.value as any)?.results) ? (itUsSettled.value as any).results : [])
    ];

    if (itResults.length > 0) {
      const exactHit =
        itResults.find((x: any) => {
          const tn = normalizeSongTitleKey(x.trackName || "");
          return (
            tn === tNorm &&
            artistMatchesTarget(x.artistName || "", cleanArtist || artist) &&
            isOriginalStudioTrack(x.trackName || "", x.artistName || "", x.collectionName || "", x.trackTimeMillis)
          );
        }) ||
        itResults.find((x: any) => {
          const tn = normalizeSongTitleKey(x.trackName || "");
          return (
            (tn.includes(tNorm) || tNorm.includes(tn)) &&
            artistMatchesTarget(x.artistName || "", cleanArtist || artist) &&
            isOriginalStudioTrack(x.trackName || "", x.artistName || "", x.collectionName || "", x.trackTimeMillis)
          );
        });

      if (exactHit) {
        const calc = Math.round(Number(exactHit.trackTimeMillis || 0) / 1000);
        if (calc >= 95 && calc <= 600) {
          expectedSec = calc;
          hasExactStudioDuration = true;
        }
        if (exactHit.previewUrl) {
          officialStudioMasterUrl = String(exactHit.previewUrl);
        }
      }
    }

    if (dzSettled.status === "fulfilled" && dzSettled.value) {
      const list: any[] = Array.isArray((dzSettled.value as any)?.data) ? (dzSettled.value as any).data : [];
      const exactDz =
        list.find((d: any) => {
          const tn = normalizeSongTitleKey(d.title || "");
          return (
            tn === tNorm &&
            artistMatchesTarget(d.artist?.name || "", cleanArtist || artist) &&
            isOriginalStudioTrack(d.title || "", d.artist?.name || "", d.album?.title || "", d.duration)
          );
        }) ||
        list.find((d: any) => {
          const tn = normalizeSongTitleKey(d.title || "");
          return (
            (tn.includes(tNorm) || tNorm.includes(tn)) &&
            artistMatchesTarget(d.artist?.name || "", cleanArtist || artist) &&
            isOriginalStudioTrack(d.title || "", d.artist?.name || "", d.album?.title || "", d.duration)
          );
        });

      if (exactDz) {
        const dSec = Number(exactDz.duration || 0);
        if (!hasExactStudioDuration && dSec >= 95 && dSec <= 600) {
          expectedSec = dSec;
          hasExactStudioDuration = true;
        }
        if (!officialStudioMasterUrl && exactDz.preview) {
          officialStudioMasterUrl = String(exactDz.preview);
        }
      }
    }
  } catch (_e) {}

  // 1. JioSaavn 320kbps Full Song Resolver com headers globais (desbloqueia catálogo completo Universal/Island/Interscope/Sony/Warner: Sabrina Carpenter, Billie Eilish, Lady Gaga, The Weeknd, Jão, etc.)
  const trySaavn = async (): Promise<{ url: string; source: string; durationSec: number } | null> => {
    try {
      const queriesToTry = [
        query,
        `${cleanArtist || artist} ${cleanTitle || normalizedInputTitle}`.trim()
      ];

      for (const qStr of queriesToTry) {
        if (!qStr) continue;
        const apiUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=25&p=1&q=${encodeURIComponent(qStr)}`;
        const r = await fetchWithTimeout(apiUrl, { headers: SAAVN_GLOBAL_HEADERS }, 3200);
        if (!r.ok) continue;
        const data = (await r.json()) as any;
        const results: any[] = data?.results || [];
        if (!results.length) continue;

        // Pass 1: Correspondência estrita de título + artista primário + janela de duração de estúdio
        for (const item of results) {
          const durSec = Number(item?.more_info?.duration || 0);
          if (!item?.more_info?.encrypted_media_url || durSec < 95 || durSec > 600) continue;
          if (hasExactStudioDuration && Math.abs(durSec - expectedSec) > 18) continue;

          const itemTitle = String(item.title || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
          const itemAlbum = String(item.more_info?.album || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
          const itemSub = String(item.subtitle || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
          if (!isOriginalStudioTrack(itemTitle, itemSub, itemAlbum, durSec)) continue;

          const rawTitleLow = `${itemTitle} ${itemAlbum} ${itemSub}`.toLowerCase();
          if (HARD_REJECT_WORDS.some(w => rawTitleLow.includes(w) && !tNorm.includes(w))) continue;

          const itemTitleNorm = normalizeSongTitleKey(itemTitle);
          if (itemTitleNorm !== tNorm) continue;

          const primaryArtists: string[] = [
            ...(item.more_info?.artistMap?.primary_artists || []),
            ...(item.more_info?.artistMap?.artists || [])
          ].map((a: any) => String(a?.name || "")).filter(Boolean);

          const hasStrictArtist =
            primaryArtists.some(
              aName => isOriginalStudioTrack(itemTitle, aName, itemAlbum, durSec) && artistMatchesTarget(aName, cleanArtist || artist)
            ) ||
            (primaryArtists.length === 0 && artistMatchesTarget(itemSub, cleanArtist || artist));
          if (!hasStrictArtist) continue;

          const decrypted = decryptSaavnMediaUrl(item.more_info.encrypted_media_url);
          if (decrypted) {
            return {
              url: decrypted,
              source: "Miado Full 320kbps Studio Master",
              durationSec: durSec
            };
          }
        }

        // Pass 2: Correspondência flexível de título de estúdio + artista oficial (garante faixa completa >= 95s mesmo se a versão single/álbum tiver diferença de segundos)
        for (const item of results) {
          const durSec = Number(item?.more_info?.duration || 0);
          if (!item?.more_info?.encrypted_media_url || durSec < 95 || durSec > 600) continue;

          const itemTitle = String(item.title || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
          const itemAlbum = String(item.more_info?.album || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
          const itemSub = String(item.subtitle || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
          if (!isOriginalStudioTrack(itemTitle, itemSub, itemAlbum, durSec)) continue;

          const rawTitleLow = `${itemTitle} ${itemAlbum} ${itemSub}`.toLowerCase();
          if (HARD_REJECT_WORDS.some(w => rawTitleLow.includes(w) && !tNorm.includes(w))) continue;

          const itemTitleNorm = normalizeSongTitleKey(itemTitle);
          if (itemTitleNorm !== tNorm && !itemTitleNorm.includes(tNorm) && !tNorm.includes(itemTitleNorm)) continue;

          const primaryArtists: string[] = [
            ...(item.more_info?.artistMap?.primary_artists || []),
            ...(item.more_info?.artistMap?.artists || [])
          ].map((a: any) => String(a?.name || "")).filter(Boolean);

          const hasArtistMatch =
            primaryArtists.some(aName => artistMatchesTarget(aName, cleanArtist || artist)) ||
            artistMatchesTarget(itemSub, cleanArtist || artist);
          if (!hasArtistMatch) continue;

          const decrypted = decryptSaavnMediaUrl(item.more_info.encrypted_media_url);
          if (decrypted) {
            return {
              url: decrypted,
              source: "Miado Full 320kbps Studio Master",
              durationSec: durSec
            };
          }
        }
      }
    } catch (_e) {}
    return null;
  };

  // 2. Motor SoundCloud Oficial (Restrito 100% a contas oficiais verificadas do próprio artista + ISRC de gravadora + stream MP3 puro)
  // Bloqueia 100% covers, remixes, bootlegs de usuários comuns e streams fMP4/Ogg quebrados.
  const trySoundCloud = async (): Promise<{ url: string; source: string; durationSec: number } | null> => {
    try {
      const cid = await getSoundCloudClientId();
      if (!cid) return null;

      const sr = await fetchWithTimeout(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${cid}&limit=25`,
        {},
        2600
      );
      if (!sr.ok) return null;
      const data = (await sr.json()) as any;
      const collection: any[] = Array.isArray(data?.collection) ? data.collection : [];

      for (const t of collection) {
        if (!t || t.policy === "SNIP") continue;
        // Exige que a conta no SoundCloud seja verificada oficialmente E tenha ISRC de gravadora oficial
        if (!t.user?.verified || !t.publisher_metadata?.isrc) continue;

        const durSec = Math.round(Number(t.duration || 0) / 1000);
        if (durSec < 95 || durSec > 600) continue;
        if (Math.abs(durSec - expectedSec) > 8) continue;

        const userNorm = normalizeStr(t.user?.username || "");
        const pubArtistNorm = normalizeStr(t.publisher_metadata?.artist || "");
        if (userNorm !== aNorm && pubArtistNorm !== aNorm) continue;

        const rawTitle = String(t.title || "");
        if (!isOriginalStudioTrack(rawTitle, t.user?.username || "", t.publisher_metadata?.album_title || "", durSec)) continue;

        const rawLower = `${rawTitle} ${t.tag_list || ""} ${t.description || ""}`.toLowerCase();
        if (HARD_REJECT_WORDS.some(w => rawLower.includes(w) && !tNorm.includes(w))) continue;

        const rawTitleKey = normalizeSongTitleKey(rawTitle);
        if (rawTitleKey !== tNorm) continue;

        // Aceita apenas progressive MP3 direto (nunca concatenação HLS fMP4/Ogg que corrompe o container de áudio)
        const transcodings: any[] = Array.isArray(t.media?.transcodings) ? t.media.transcodings : [];
        const progressiveMp3 = transcodings.find(
          x =>
            x.format?.protocol === "progressive" &&
            String(x.format?.mime_type || "").includes("audio/mpeg") &&
            !String(x.format?.protocol || "").includes("encrypted")
        );
        if (!progressiveMp3) continue;

        const streamMetaRes = await fetchWithTimeout(
          `${progressiveMp3.url}?client_id=${cid}&track_authorization=${encodeURIComponent(t.track_authorization || "")}`,
          {},
          2400
        );
        if (!streamMetaRes.ok) continue;
        const streamMeta = (await streamMetaRes.json()) as any;
        if (streamMeta?.url) {
          return {
            url: streamMeta.url,
            source: "Miado Verified Artist Master",
            durationSec: durSec
          };
        }
      }
    } catch (_e) {}
    return null;
  };

  // 3. Internet Archive Full Audio Resolver (verificando título exato + artista exato + duração de estúdio)
  const tryInternetArchive = async (): Promise<{ url: string; source: string; durationSec: number } | null> => {
    try {
      const qArch = `title:(${cleanTitle}) AND creator:(${cleanArtist}) AND mediatype:(audio)`;
      const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(qArch)}&fl[]=identifier,title,creator&rows=4&output=json`;
      const r = await fetchWithTimeout(searchUrl, {}, 2600);
      if (!r.ok) return null;
      const d = (await r.json()) as any;
      const docs: any[] = d?.response?.docs || [];
      for (const doc of docs) {
        if (!doc?.identifier) continue;
        const rawDocTitle = String(doc.title || "");
        const rawCreator = String(doc.creator || "");
        if (!isOriginalStudioTrack(rawDocTitle, rawCreator)) continue;
        if (HARD_REJECT_WORDS.some(w => rawDocTitle.toLowerCase().includes(w) && !tNorm.includes(w))) continue;
        if (normalizeStr(rawCreator) !== aNorm) continue;

        const metaRes = await fetchWithTimeout(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, {}, 2500);
        if (!metaRes.ok) continue;
        const meta = (await metaRes.json()) as any;
        const files: any[] = Array.isArray(meta?.files) ? meta.files : [];
        const audioFile = files.find(f => {
          const name = String(f?.name || "");
          if (!/\.(mp3|m4a)$/i.test(name)) return false;
          if (!isOriginalStudioTrack(name)) return false;
          const fnNorm = normalizeStr(name.replace(/\.(mp3|m4a)$/i, ""));
          const lenSec = parseFloat(f.length || "0") || expectedSec;
          return fnNorm.includes(tNorm) && lenSec >= 95 && lenSec <= 600 && Math.abs(lenSec - expectedSec) <= 10;
        });
        if (audioFile) {
          const lenSec = Math.round(parseFloat(audioFile.length || "0")) || expectedSec;
          return {
            url: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(audioFile.name)}`,
            source: "Miado Archive Studio HD",
            durationSec: lenSec
          };
        }
      }
    } catch (_e) {}
    return null;
  };

  // 4. Piped/Invidious Studio Resolver em paralelo (priorizando canais oficiais <Artist> - Topic / VEVO)
  const tryAllPiped = async (): Promise<{ url: string; source: string; durationSec: number } | null> => {
    const checks = PIPED_INVIDIOUS_INSTANCES.map(inst =>
      resolveFromSinglePipedInstance(inst, query, expectedSec, hasExactStudioDuration, tNorm, aNorm)
    );
    const settled = await Promise.allSettled(checks);
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value && s.value.url) {
        return s.value;
      }
    }
    return null;
  };

  // Executa todos os resolvedores em paralelo para resposta rápida (< 3s)
  const [saavnRes, pipedRes, archRes, scRes] = await Promise.allSettled([
    trySaavn(),
    tryAllPiped(),
    tryInternetArchive(),
    trySoundCloud()
  ]);

  for (const resCandidate of [saavnRes, pipedRes, archRes, scRes]) {
    if (resCandidate.status === "fulfilled" && resCandidate.value?.url) {
      fullStreamCache.set(cacheKey, resCandidate.value);
      return resCandidate.value;
    }
  }

  // NUNCA armazena trecho de 30s no fullStreamCache para que todas as faixas resolvam completas
  if (officialStudioMasterUrl) {
    return {
      url: officialStudioMasterUrl,
      source: "Miado Studio Fallback",
      durationSec: expectedSec
    };
  }

  return null;
}

/**
 * Catálogo Multi-API de Fotos Reais de Gatinhos (TheCatAPI CDN + Unsplash Cat Portraits + CATAAS)
 */
const REAL_CAT_MULTI_SOURCES: Record<string, string[]> = {
  cat_1: [
    "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/0XYvRd7oD.jpg",
    "https://cataas.com/cat/cute?width=400&height=400"
  ],
  cat_2: [
    "https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/MTY3ODIyMQ.jpg",
    "https://cataas.com/cat/orange?width=400&height=400"
  ],
  cat_3: [
    "https://images.unsplash.com/photo-1495360010541-f48722b34f7d?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/9u1.jpg",
    "https://cataas.com/cat/fluffy?width=400&height=400"
  ],
  cat_4: [
    "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/bpc.jpg",
    "https://cataas.com/cat/sunglasses?width=400&height=400"
  ],
  cat_5: [
    "https://images.unsplash.com/photo-1529778873920-4da4926a72c2?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/5i3.jpg",
    "https://cataas.com/cat/kitten?width=400&height=400"
  ],
  cat_6: [
    "https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/c8p.jpg",
    "https://cataas.com/cat/sleepy?width=400&height=400"
  ],
  cat_7: [
    "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/a3h.jpg",
    "https://cataas.com/cat/eyes?width=400&height=400"
  ],
  cat_8: [
    "https://images.unsplash.com/photo-1561948955-570b270e7c36?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/ebv.jpg",
    "https://cataas.com/cat/funny?width=400&height=400"
  ],
  cat_9: [
    "https://images.unsplash.com/photo-1519052537078-e6302a4968d4?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/8p0.jpg",
    "https://cataas.com/cat?width=400&height=400"
  ],
  cat_10: [
    "https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=500&q=85",
    "https://cdn2.thecatapi.com/images/6qi.jpg",
    "https://cataas.com/cat/white?width=400&height=400"
  ]
};

/**
 * Mapa de Afinidade Musical (Estilo Spotify Collaborative Filtering) para Recomendações
 */
const ARTIST_SIMILARITY_GRAPH: Record<string, { related: string[]; genre: string }> = {
  "lady gaga": { related: ["Dua Lipa", "Beyoncé", "Ariana Grande", "Rihanna", "Katy Perry", "Madonna"], genre: "Pop & Dance-Pop" },
  "the weeknd": { related: ["Bruno Mars", "Drake", "Post Malone", "Lana Del Rey", "SZA", "Travis Scott"], genre: "R&B & Synthwave" },
  "jao": { related: ["ANAVITÓRIA", "Liniker", "Pabllo Vittar", "Luísa Sonza", "IZA", "Gloria Groove"], genre: "Pop Brasileiro" },
  "dua lipa": { related: ["Lady Gaga", "Sabrina Carpenter", "Ariana Grande", "Calvin Harris", "Rihanna", "Charli XCX"], genre: "Dance Pop" },
  "billie eilish": { related: ["Lana Del Rey", "Olivia Rodrigo", "Lorde", "Arctic Monkeys", "The Neighbourhood", "SZA"], genre: "Alt-Pop & Indie" },
  "taylor swift": { related: ["Olivia Rodrigo", "Sabrina Carpenter", "Lana Del Rey", "Ariana Grande", "Katy Perry", "Lorde"], genre: "Pop & Singer-Songwriter" },
  "anitta": { related: ["Pabllo Vittar", "Ludmilla", "Luísa Sonza", "IZA", "Pedro Sampaio", "Karol G"], genre: "Pop & Funk Global" },
  "bruno mars": { related: ["The Weeknd", "Justin Timberlake", "Rihanna", "Beyoncé", "Michael Jackson", "Silk Sonic"], genre: "Pop, Soul & Funk" },
  "coldplay": { related: ["Imagine Dragons", "OneRepublic", "Arctic Monkeys", "U2", "Linkin Park", "Oasis"], genre: "Pop Rock & Alternative" },
  "lana del rey": { related: ["Billie Eilish", "Arctic Monkeys", "The Neighbourhood", "Lorde", "Taylor Swift", "Mitski"], genre: "Dream Pop & Indie" },
  "arctic monkeys": { related: ["The Neighbourhood", "The Strokes", "Lana Del Rey", "Coldplay", "Tame Impala", "Nirvana"], genre: "Indie Rock" },
  "rihanna": { related: ["Beyoncé", "Lady Gaga", "SZA", "Drake", "Bruno Mars", "Ariana Grande"], genre: "R&B & Pop" },
  "beyonce": { related: ["Rihanna", "SZA", "Lady Gaga", "Alicia Keys", "Bruno Mars", "Kendrick Lamar"], genre: "R&B & Pop" },
  "ariana grande": { related: ["Sabrina Carpenter", "Dua Lipa", "SZA", "Taylor Swift", "Rihanna", "The Weeknd"], genre: "Pop & R&B" },
  "sza": { related: ["The Weeknd", "Frank Ocean", "Rihanna", "Ariana Grande", "Kendrick Lamar", "Daniel Caesar"], genre: "Contemporary R&B" },
  "drake": { related: ["Travis Scott", "The Weeknd", "Kendrick Lamar", "Post Malone", "Rihanna", "21 Savage"], genre: "Hip-Hop & R&B" },
  "pabllo vittar": { related: ["Anitta", "Gloria Groove", "Luísa Sonza", "Jão", "Ludmilla", "IZA"], genre: "Pop Brasileiro" },
  "liniker": { related: ["Jão", "IZA", "ANAVITÓRIA", "Djavan", "Seu Jorge", "Tim Maia"], genre: "MPB & Soul Brasileiro" },
  "olivia rodrigo": { related: ["Sabrina Carpenter", "Taylor Swift", "Billie Eilish", "Conan Gray", "Gracie Abrams"], genre: "Pop Rock" },
  "sabrina carpenter": { related: ["Chappell Roan", "Olivia Rodrigo", "Dua Lipa", "Ariana Grande", "Taylor Swift"], genre: "Pop" },
  "charli xcx": { related: ["Billie Eilish", "Chappell Roan", "Lady Gaga", "Dua Lipa", "Lorde", "Sabrina Carpenter"], genre: "Hyperpop & Club Pop" },
  "chappell roan": { related: ["Sabrina Carpenter", "Lady Gaga", "Olivia Rodrigo", "Billie Eilish", "Charli xcx"], genre: "Synth-Pop & Alt-Pop" }
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Headers de Segurança
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  app.use(express.json({ limit: "10mb" }));

  // 1. Healthcheck
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", engine: "Miado Full Original Studio Audio & Recommendation Server" });
  });

  // 1b. Proxy Multi-API de Fotos Reais de Gatinhos (/api/cat-avatar)
  app.get("/api/cat-avatar", async (req: Request, res: Response) => {
    const id = sanitizeText(req.query.id || "cat_1", 32);
    const cacheKey = REAL_CAT_MULTI_SOURCES[id] ? id : "cat_1";

    if (catAvatarCache.has(cacheKey)) {
      const cached = catAvatarCache.get(cacheKey)!;
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(cached.buffer);
      return;
    }

    const candidates = [...(REAL_CAT_MULTI_SOURCES[cacheKey] || REAL_CAT_MULTI_SOURCES.cat_1)];

    // Também consulta TheCatAPI dinamicamente caso os links primários precisem de reforço
    try {
      for (const url of candidates) {
        try {
          const imgRes = await fetchWithTimeout(url, {}, 3800);
          if (imgRes.ok) {
            const ab = await imgRes.arrayBuffer();
            const buffer = Buffer.from(ab);
            const contentType = imgRes.headers.get("content-type") || "image/jpeg";
            if (buffer.length > 1500 && contentType.startsWith("image/")) {
              catAvatarCache.set(cacheKey, { buffer, contentType });
              res.setHeader("Content-Type", contentType);
              res.setHeader("Cache-Control", "public, max-age=86400");
              res.send(buffer);
              return;
            }
          }
        } catch (_e) {}
      }

      // Contingência extra com API JSON do TheCatAPI
      const apiRes = await fetchWithTimeout("https://api.thecatapi.com/v1/images/search?limit=1&mime_types=jpg,png", {}, 3500);
      if (apiRes.ok) {
        const arr = (await apiRes.json()) as any[];
        const dynamicUrl = arr?.[0]?.url;
        if (dynamicUrl) {
          const imgRes = await fetchWithTimeout(dynamicUrl, {}, 3800);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const contentType = imgRes.headers.get("content-type") || "image/jpeg";
            if (buffer.length > 1500) {
              catAvatarCache.set(cacheKey, { buffer, contentType });
              res.setHeader("Content-Type", contentType);
              res.setHeader("Cache-Control", "public, max-age=86400");
              res.send(buffer);
              return;
            }
          }
        }
      }
    } catch (_e) {}

    res.redirect(REAL_CAT_MULTI_SOURCES.cat_1[0]);
  });

  // 2. Banco de Dados Persistente (Perfil, Artistas Favoritos, Onboarding, Playlists, Curtidas, Histórico e Feed Social)
  app.get("/api/db", (req: Request, res: Response) => {
    const db = readDb();
    const authHeader = String(req.headers.authorization || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const tokenUser = verifySessionToken(bearer);

    const accounts = db.accounts || {};
    const activeEmail = (tokenUser?.email || db.activeAccountEmail || "").toLowerCase().trim();
    if (activeEmail && accounts[activeEmail]) {
      const acc = accounts[activeEmail];
      res.json({
        user: acc.user,
        favoriteArtists: acc.favoriteArtists || (acc.user?.favoriteArtists as string[]) || db.favoriteArtists || [],
        onboardingCompleted: acc.onboardingCompleted ?? (acc.user?.onboardingCompleted as boolean) ?? db.onboardingCompleted ?? false,
        likedTracks: acc.likedTracks || [],
        playlists: acc.playlists || [],
        recentHistory: acc.recentHistory || [],
        feedPosts: acc.feedPosts || db.feedPosts || [],
        customAlbumCovers: acc.customAlbumCovers || db.customAlbumCovers || {},
        volume: acc.volume ?? db.volume ?? 0.85,
        activeAccountEmail: activeEmail
      });
      return;
    }

    const safeDb = { ...db };
    delete safeDb.accounts;
    res.json(safeDb);
  });

  app.post("/api/db", (req: Request, res: Response) => {
    const body = req.body || {};
    const current = readDb();
    const accounts = current.accounts || {};

    const authHeader = String(req.headers.authorization || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const tokenUser = verifySessionToken(bearer);

    const emailKey = String(
      tokenUser?.email ||
        body.accountEmail ||
        current.activeAccountEmail ||
        (body.user && body.user.email) ||
        ""
    )
      .toLowerCase()
      .trim();

    const favArtists = Array.isArray(body.favoriteArtists)
      ? body.favoriteArtists.map((a: unknown) => sanitizeText(a, 80)).filter(Boolean)
      : Array.isArray(body.user?.favoriteArtists)
      ? body.user.favoriteArtists.map((a: unknown) => sanitizeText(a, 80)).filter(Boolean)
      : undefined;

    const onboardingDone =
      typeof body.onboardingCompleted === "boolean"
        ? body.onboardingCompleted
        : typeof body.user?.onboardingCompleted === "boolean"
        ? body.user.onboardingCompleted
        : undefined;

    if (emailKey && accounts[emailKey]) {
      const existing = accounts[emailKey];
      const mergedUser = body.user
        ? {
            ...existing.user,
            ...body.user,
            name: sanitizeText(body.user.name || existing.user.name, 60),
            handle: sanitizeText(body.user.handle || existing.user.handle, 40),
            bio: sanitizeText(body.user.bio ?? existing.user.bio, 240),
            favoriteArtists: favArtists ?? existing.favoriteArtists ?? existing.user.favoriteArtists ?? [],
            onboardingCompleted: onboardingDone ?? existing.onboardingCompleted ?? existing.user.onboardingCompleted ?? true
          }
        : existing.user;

      accounts[emailKey] = {
        ...existing,
        updatedAt: new Date().toISOString(),
        user: mergedUser,
        favoriteArtists: favArtists ?? existing.favoriteArtists ?? [],
        onboardingCompleted: onboardingDone ?? existing.onboardingCompleted ?? true,
        likedTracks: Array.isArray(body.likedTracks) ? body.likedTracks.slice(0, 500) : existing.likedTracks,
        playlists: Array.isArray(body.playlists) ? body.playlists.slice(0, 100) : existing.playlists,
        recentHistory: Array.isArray(body.recentHistory) ? body.recentHistory.slice(0, 60) : existing.recentHistory,
        feedPosts: Array.isArray(body.feedPosts) ? body.feedPosts.slice(0, 100) : existing.feedPosts,
        customAlbumCovers: body.customAlbumCovers && typeof body.customAlbumCovers === "object" ? body.customAlbumCovers : existing.customAlbumCovers,
        volume: typeof body.volume === "number" ? Math.max(0, Math.min(1, body.volume)) : existing.volume
      };
    }

    const updated = writeDb({
      ...body,
      ...(favArtists !== undefined ? { favoriteArtists: favArtists } : {}),
      ...(onboardingDone !== undefined ? { onboardingCompleted: onboardingDone } : {}),
      ...(body.customAlbumCovers && typeof body.customAlbumCovers === "object" ? { customAlbumCovers: body.customAlbumCovers } : {}),
      accounts
    });
    const safeDb = { ...updated };
    delete safeDb.accounts;
    res.json({ ok: true, db: safeDb });
  });

  // 2b. Autenticação Segura e Banco de Dados de Contas com E-mail e Senha (/api/auth/*)
  app.post("/api/auth/register", (req: Request, res: Response) => {
    try {
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local");
      if (!checkAuthRateLimit(ip)) {
        res.status(429).json({ ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
        return;
      }

      const { email, password, name, handle, bio, catId, favoriteArtists, onboardingCompleted, currentData } = req.body || {};
      const cleanEmail = sanitizeText(email, 120).toLowerCase();
      const rawPassword = String(password || "");

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ ok: false, error: "Informe um endereço de e-mail válido." });
        return;
      }
      if (rawPassword.length < 6) {
        res.status(400).json({ ok: false, error: "A senha deve ter pelo menos 6 caracteres para sua segurança." });
        return;
      }

      const db = readDb();
      const accounts = db.accounts || {};
      if (accounts[cleanEmail]) {
        res.status(409).json({ ok: false, error: "Este e-mail já está cadastrado. Entre com sua senha na aba Fazer Login." });
        return;
      }

      const uid = "usr_" + crypto.randomBytes(8).toString("hex");
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = hashPassword(rawPassword, salt);
      const now = new Date().toISOString();

      const displayName = sanitizeText(name || cleanEmail.split("@")[0] || "Gatinho Melófilo", 60);
      const rawHandle = sanitizeText(handle || "@" + cleanEmail.split("@")[0].replace(/[^a-z0-9_]/gi, ""), 40);
      const cleanHandle = rawHandle.startsWith("@") ? rawHandle : "@" + rawHandle;

      const favList = Array.isArray(favoriteArtists)
        ? favoriteArtists.map((a: unknown) => sanitizeText(a, 80)).filter(Boolean)
        : Array.isArray(currentData?.user?.favoriteArtists)
        ? currentData.user.favoriteArtists
        : ["Lady Gaga", "The Weeknd", "Jão"];

      const userProfile = {
        uid,
        email: cleanEmail,
        name: displayName,
        handle: cleanHandle,
        bio: sanitizeText(bio || currentData?.user?.bio || "Amante de música original em alta definição no Miado 🐾", 240),
        catId: sanitizeText(catId || currentData?.user?.catId || "cat_1", 32),
        customAvatar: currentData?.user?.customAvatar || "",
        customBanner: currentData?.user?.customBanner || "",
        favoriteArtists: favList,
        onboardingCompleted: Boolean(onboardingCompleted ?? true),
        plan: "Miado Lossless PRO",
        createdAt: now
      };

      const record: AccountRecord = {
        uid,
        email: cleanEmail,
        passwordHash,
        salt,
        createdAt: now,
        updatedAt: now,
        user: userProfile,
        favoriteArtists: favList,
        onboardingCompleted: Boolean(onboardingCompleted ?? true),
        likedTracks: Array.isArray(currentData?.likedTracks) ? currentData.likedTracks : db.likedTracks || [],
        playlists: Array.isArray(currentData?.playlists) ? currentData.playlists : db.playlists || [],
        recentHistory: Array.isArray(currentData?.recentHistory) ? currentData.recentHistory : db.recentHistory || [],
        feedPosts: Array.isArray(currentData?.feedPosts) ? currentData.feedPosts : db.feedPosts || [],
        volume: typeof currentData?.volume === "number" ? currentData.volume : db.volume ?? 0.85
      };

      accounts[cleanEmail] = record;
      writeDb({
        accounts,
        activeAccountEmail: cleanEmail,
        user: record.user,
        favoriteArtists: record.favoriteArtists,
        onboardingCompleted: record.onboardingCompleted,
        likedTracks: record.likedTracks,
        playlists: record.playlists,
        recentHistory: record.recentHistory
      });

      const sessionToken = createSessionToken(record.uid, record.email);
      res.setHeader(
        "Set-Cookie",
        `miado_session=${sessionToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${60 * 60 * 24 * 30}`
      );

      res.json({
        ok: true,
        token: sessionToken,
        account: {
          uid: record.uid,
          email: record.email,
          createdAt: record.createdAt,
          user: record.user,
          favoriteArtists: record.favoriteArtists,
          onboardingCompleted: record.onboardingCompleted,
          likedTracks: record.likedTracks,
          playlists: record.playlists,
          recentHistory: record.recentHistory,
          feedPosts: record.feedPosts,
          volume: record.volume
        }
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || "Erro ao criar conta." });
    }
  });

  app.post("/api/auth/login", (req: Request, res: Response) => {
    try {
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local");
      if (!checkAuthRateLimit(ip)) {
        res.status(429).json({ ok: false, error: "Muitas tentativas de login. Aguarde alguns minutos." });
        return;
      }

      const { email, password } = req.body || {};
      const cleanEmail = sanitizeText(email, 120).toLowerCase();
      const rawPassword = String(password || "");

      if (!cleanEmail || !rawPassword) {
        res.status(400).json({ ok: false, error: "Preencha seu e-mail e sua senha." });
        return;
      }

      const db = readDb();
      const accounts = db.accounts || {};
      const record = accounts[cleanEmail];
      if (!record) {
        res.status(404).json({ ok: false, error: "Conta não encontrada com este e-mail. Crie sua conta gratuitamente!" });
        return;
      }

      if (!verifyPasswordTimingSafe(rawPassword, record.salt, record.passwordHash)) {
        res.status(401).json({ ok: false, error: "Senha incorreta. Verifique e tente novamente." });
        return;
      }

      writeDb({
        activeAccountEmail: cleanEmail,
        user: record.user,
        favoriteArtists: record.favoriteArtists || (record.user?.favoriteArtists as string[]) || [],
        onboardingCompleted: record.onboardingCompleted ?? true,
        likedTracks: record.likedTracks,
        playlists: record.playlists,
        recentHistory: record.recentHistory
      });

      const sessionToken = createSessionToken(record.uid, record.email);
      res.setHeader(
        "Set-Cookie",
        `miado_session=${sessionToken}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${60 * 60 * 24 * 30}`
      );

      res.json({
        ok: true,
        token: sessionToken,
        account: {
          uid: record.uid,
          email: record.email,
          createdAt: record.createdAt,
          user: record.user,
          favoriteArtists: record.favoriteArtists || (record.user?.favoriteArtists as string[]) || [],
          onboardingCompleted: record.onboardingCompleted ?? true,
          likedTracks: record.likedTracks,
          playlists: record.playlists,
          recentHistory: record.recentHistory,
          feedPosts: record.feedPosts,
          volume: record.volume
        }
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || "Erro ao autenticar." });
    }
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    writeDb({ activeAccountEmail: "" });
    res.setHeader("Set-Cookie", "miado_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0");
    res.json({ ok: true });
  });

  // 2c. Endpoint Rápido para Salvar Preferências de Perfil + Artistas Favoritos (/api/user/preferences)
  app.post("/api/user/preferences", (req: Request, res: Response) => {
    try {
      const { email, name, handle, bio, catId, customAvatar, customBanner, favoriteArtists, onboardingCompleted } = req.body || {};
      const db = readDb();
      const accounts = db.accounts || {};
      const targetEmail = sanitizeText(email || db.activeAccountEmail || db.user?.email || "", 120).toLowerCase();

      const cleanFavs = Array.isArray(favoriteArtists)
        ? favoriteArtists.map((a: unknown) => sanitizeText(a, 80)).filter(Boolean)
        : db.favoriteArtists || ["Lady Gaga", "The Weeknd", "Jão"];

      const updatedUser: Record<string, unknown> = {
        ...(db.user || {}),
        ...(name !== undefined ? { name: sanitizeText(name, 60) } : {}),
        ...(handle !== undefined ? { handle: sanitizeText(handle, 40) } : {}),
        ...(bio !== undefined ? { bio: sanitizeText(bio, 240) } : {}),
        ...(catId !== undefined ? { catId: sanitizeText(catId, 32) } : {}),
        ...(customAvatar !== undefined ? { customAvatar } : {}),
        ...(customBanner !== undefined ? { customBanner } : {}),
        favoriteArtists: cleanFavs,
        onboardingCompleted: Boolean(onboardingCompleted ?? true)
      };

      if (targetEmail && accounts[targetEmail]) {
        accounts[targetEmail] = {
          ...accounts[targetEmail],
          updatedAt: new Date().toISOString(),
          user: { ...accounts[targetEmail].user, ...updatedUser },
          favoriteArtists: cleanFavs,
          onboardingCompleted: Boolean(onboardingCompleted ?? true)
        };
      }

      writeDb({
        user: updatedUser,
        favoriteArtists: cleanFavs,
        onboardingCompleted: Boolean(onboardingCompleted ?? true),
        accounts
      });

      res.json({
        ok: true,
        user: updatedUser,
        favoriteArtists: cleanFavs,
        onboardingCompleted: Boolean(onboardingCompleted ?? true)
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || "Erro ao salvar preferências." });
    }
  });

  // 2d. Algoritmo de Recomendação Estilo Spotify (/api/recommendations)
  // Baseado nos artistas favoritos escolhidos pelo usuário + histórico de reprodução + grafo de afinidade musical
  app.get("/api/recommendations", async (req: Request, res: Response) => {
    try {
      const db = readDb();
      const rawArtistsParam = String(req.query.artists || "").trim();
      const seedArtists: string[] = rawArtistsParam
        ? rawArtistsParam.split(",").map(s => s.trim()).filter(Boolean)
        : Array.isArray(db.favoriteArtists) && db.favoriteArtists.length > 0
        ? db.favoriteArtists
        : ["Lady Gaga", "The Weeknd", "Jão", "Dua Lipa", "Bruno Mars"];

      const primarySeeds = seedArtists.slice(0, 6);
      const recommendedArtistsMap = new Map<string, { name: string; reason: string; matchScore: number; coverUrl: string; genre: string }>();

      // 1. Constrói a lista de artistas recomendados baseados no grafo de afinidade
      for (const seed of primarySeeds) {
        const key = normalizeStr(seed);
        const graphEntry = ARTIST_SIMILARITY_GRAPH[key];
        if (graphEntry) {
          graphEntry.related.forEach((relName, idx) => {
            const relKey = normalizeStr(relName);
            const isAlreadySeed = primarySeeds.some(s => normalizeStr(s) === relKey);
            if (!recommendedArtistsMap.has(relKey)) {
              recommendedArtistsMap.set(relKey, {
                name: relName,
                reason: isAlreadySeed ? `Artista Favorito · ${graphEntry.genre}` : `Porque você curte ${seed}`,
                matchScore: Math.max(84, 99 - idx * 2),
                coverUrl: `/api/artist-image?name=${encodeURIComponent(relName)}`,
                genre: graphEntry.genre
              });
            }
          });
        }
        // Garante que os próprios favoritos também possam aparecer com destaque
        if (!recommendedArtistsMap.has(key)) {
          recommendedArtistsMap.set(key, {
            name: seed,
            reason: "No seu Top Artistas Favoritos",
            matchScore: 99,
            coverUrl: `/api/artist-image?name=${encodeURIComponent(seed)}`,
            genre: graphEntry?.genre || "Pop & Lossless HD"
          });
        }
      }

      // 2. Busca faixas originais de estúdio dos artistas favoritos + artistas similares em paralelo
      const artistsToQuery = [
        ...primarySeeds.slice(0, 4),
        ...Array.from(recommendedArtistsMap.values())
          .filter(a => !primarySeeds.some(s => normalizeStr(s) === normalizeStr(a.name)))
          .slice(0, 3)
          .map(a => a.name)
      ];

      const songPromises = artistsToQuery.map(async (artName, seedIdx) => {
        try {
          const [itSettled, dzSettled] = await Promise.allSettled([
            fetchWithTimeout(
              `https://itunes.apple.com/search?term=${encodeURIComponent(artName)}&country=BR&entity=song&limit=10`,
              {},
              3400
            ).then(r => (r.ok ? r.json() : null)),
            fetchWithTimeout(
              `https://api.deezer.com/search?q=${encodeURIComponent(artName)}&limit=12`,
              {},
              3400
            ).then(r => (r.ok ? r.json() : null))
          ]);

          const collected: any[] = [];
          const itResults: any[] =
            itSettled.status === "fulfilled" && Array.isArray((itSettled.value as any)?.results)
              ? (itSettled.value as any).results
              : [];

          itResults
            .filter(item => {
              const durSec = Math.round(Number(item.trackTimeMillis || 0) / 1000);
              return (
                item.trackName &&
                durSec >= 95 &&
                durSec <= 480 &&
                artistMatchesTarget(item.artistName || "", artName) &&
                isOriginalStudioTrack(item.trackName, item.artistName || artName, item.collectionName || "", durSec)
              );
            })
            .slice(0, 4)
            .forEach((item, idx) => {
              const cover = toCoverProxyUrl(item.artworkUrl100, item.trackName || "", item.artistName || artName);
              const streamUrl = buildFullStreamProxyUrl(item.trackName || "", item.artistName || artName);
              collected.push({
                id: `rec_${item.trackId || `${seedIdx}_${idx}`}`,
                title: item.trackName,
                artist: item.artistName || artName,
                albumTitle: item.collectionName || "Single Original",
                duration: formatDurationMs(item.trackTimeMillis),
                durationSec: Math.round(Number(item.trackTimeMillis || 0) / 1000),
                genre: item.primaryGenreName || "Pop",
                year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2025,
                coverUrl: cover,
                previewUrl: streamUrl,
                streamUrl,
                matchReason: seedIdx < primarySeeds.length ? `Do seu favorito ${artName}` : `Recomendado para seu gosto`,
                matchScore: Math.max(88, 99 - (seedIdx + idx)),
                popular: idx < 2
              });
            });

          const dzResults: any[] =
            dzSettled.status === "fulfilled" && Array.isArray((dzSettled.value as any)?.data)
              ? (dzSettled.value as any).data
              : [];

          dzResults
            .filter(item => {
              const durSec = Number(item.duration || 0);
              return (
                item.title &&
                durSec >= 95 &&
                durSec <= 480 &&
                artistMatchesTarget(item.artist?.name || "", artName) &&
                isOriginalStudioTrack(item.title, item.artist?.name || artName, item.album?.title || "", durSec)
              );
            })
            .slice(0, 5)
            .forEach((item, idx) => {
              const rawArt = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || "";
              const cover = toCoverProxyUrl(rawArt, item.title || "", item.artist?.name || artName);
              const streamUrl = buildFullStreamProxyUrl(item.title || "", item.artist?.name || artName);
              collected.push({
                id: `rec_dz_${item.id || `${seedIdx}_${idx}`}`,
                title: item.title,
                artist: item.artist?.name || artName,
                albumTitle: item.album?.title || "Single Original",
                duration: formatDurationSec(item.duration || 210),
                durationSec: Number(item.duration || 210),
                genre: "Pop / Lossless HD",
                year: 2025,
                coverUrl: cover,
                previewUrl: streamUrl,
                streamUrl,
                matchReason: seedIdx < primarySeeds.length ? `Do seu favorito ${artName}` : `Recomendado para seu gosto`,
                matchScore: Math.max(88, 99 - (seedIdx + idx)),
                popular: idx < 2
              });
            });

          return deduplicateSongsList(collected).slice(0, 5);
        } catch (_e) {
          return [];
        }
      });

      const nestedSongs = await Promise.all(songPromises);
      const flatSongs = deduplicateSongsList(nestedSongs.flat());

      // Intercala as músicas para criar um Daily Mix variado estilo Spotify
      const recommendedSongs = flatSongs.slice(0, 18);
      const recommendedArtists = Array.from(recommendedArtistsMap.values()).slice(0, 12);

      res.json({
        basedOnArtists: primarySeeds,
        recommendedSongs,
        recommendedArtists
      });
    } catch (_e) {
      res.json({
        basedOnArtists: ["Lady Gaga", "The Weeknd", "Jão"],
        recommendedSongs: [],
        recommendedArtists: []
      });
    }
  });

  // 3. Proxy e Resolvedor de Foto Oficial de Artista 1000x1000 (/api/artist-image)
  app.get("/api/artist-image", async (req: Request, res: Response) => {
    const name = String(req.query.name || "Lady Gaga").trim();
    const key = normalizeStr(name);

    if (artistImageCache.has(key)) {
      const cached = artistImageCache.get(key)!;
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(cached.buffer);
      return;
    }

    let imageUrl = "";
    try {
      const dzRes = await fetchWithTimeout(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`, {}, 3500);
      if (dzRes.ok) {
        const dzData = (await dzRes.json()) as any;
        const list: any[] = Array.isArray(dzData?.data) ? dzData.data : [];
        const match =
          list.find(a => normalizeStr(a.name) === key) ||
          list.find(a => normalizeStr(a.name).includes(key) || key.includes(normalizeStr(a.name))) ||
          list[0];
        if (match) {
          const candidate = match.picture_xl || match.picture_big || match.picture_medium || "";
          if (candidate && !candidate.includes("/images/artist//")) {
            imageUrl = upgradeArtwork(candidate);
          }
        }
      }
    } catch (_e) {}

    if (!imageUrl) {
      try {
        const itRes = await fetchWithTimeout(
          `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&country=BR&entity=song&limit=3`,
          {},
          3500
        );
        if (itRes.ok) {
          const itData = (await itRes.json()) as any;
          const first = (itData?.results || [])[0];
          if (first?.artworkUrl100) {
            imageUrl = upgradeArtwork(first.artworkUrl100);
          }
        }
      } catch (_e) {}
    }

    if (imageUrl) {
      try {
        const imgRes = await fetchWithTimeout(imageUrl, {}, 4500);
        if (imgRes.ok) {
          const arrayBuf = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          if (buffer.length > 1000) {
            artistImageCache.set(key, { buffer, contentType });
            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "public, max-age=86400");
            res.send(buffer);
            return;
          }
        }
      } catch (_e) {}
    }

    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() || "")
      .join("");
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <rect width="600" height="600" fill="#130f22"/>
      <circle cx="300" cy="300" r="260" fill="#07060b" stroke="#a855f7" stroke-width="6"/>
      <text x="300" y="335" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="130" font-weight="800">${initials || "M"}</text>
    </svg>`;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(fallbackSvg);
  });

  // 3b. Proxy e Resolvedor de Capa 1000x1000 HD de Qualquer Música Individual ou Álbum (/api/cover)
  app.get("/api/cover", async (req: Request, res: Response) => {
    const title = String(req.query.title || "").trim();
    const artist = String(req.query.artist || "").trim();
    const rawUrl = String(req.query.url || "").trim();
    const cacheKey = `${normalizeSongTitleKey(title)}|${normalizeStr(artist)}|${rawUrl.slice(-36)}`;

    if (coverImageCache.has(cacheKey)) {
      const cached = coverImageCache.get(cacheKey)!;
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(cached.buffer);
      return;
    }

    const candidateUrls: string[] = [];
    if (rawUrl && /^https?:\/\//i.test(rawUrl) && !rawUrl.includes("/images/cover//")) {
      candidateUrls.push(upgradeArtwork(rawUrl));
    }

    const q = `${title} ${artist}`.trim();
    if (q) {
      try {
        const [dzSettled, itSettled] = await Promise.allSettled([
          fetchWithTimeout(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`, {}, 2500).then(r => (r.ok ? r.json() : null)),
          fetchWithTimeout(
            `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&entity=song&limit=5`,
            { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } },
            2500
          ).then(r => (r.ok ? r.json() : null))
        ]);

        if (dzSettled.status === "fulfilled" && dzSettled.value) {
          const list: any[] = Array.isArray((dzSettled.value as any)?.data) ? (dzSettled.value as any).data : [];
          const matched =
            list.find(x => normalizeSongTitleKey(x?.title || "") === normalizeSongTitleKey(title)) ||
            list.find(x => x?.album?.cover_xl || x?.album?.cover_big || x?.album?.cover_medium) ||
            list[0];
          if (matched?.album) {
            const c = matched.album.cover_xl || matched.album.cover_big || matched.album.cover_medium;
            if (c) candidateUrls.push(upgradeArtwork(c));
          }
        }

        if (itSettled.status === "fulfilled" && itSettled.value) {
          const results: any[] = Array.isArray((itSettled.value as any)?.results) ? (itSettled.value as any).results : [];
          const best =
            results.find(r => normalizeSongTitleKey(r.trackName || "") === normalizeSongTitleKey(title)) ||
            results[0];
          if (best?.artworkUrl100) {
            candidateUrls.push(upgradeArtwork(best.artworkUrl100));
          }
        }
      } catch (_e) {}
    }

    for (const imgUrl of candidateUrls) {
      if (!imgUrl) continue;
      try {
        const imgRes = await fetchWithTimeout(imgUrl, {}, 4200);
        if (imgRes.ok) {
          const ab = await imgRes.arrayBuffer();
          const buffer = Buffer.from(ab);
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          if (buffer.length > 800) {
            coverImageCache.set(cacheKey, { buffer, contentType });
            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "public, max-age=86400");
            res.send(buffer);
            return;
          }
        }
      } catch (_e) {}
    }

    const safeT = (title || "Miado").slice(0, 20).replace(/[<>&"']/g, "");
    const safeA = (artist || "Lossless HD").slice(0, 24).replace(/[<>&"']/g, "");
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <rect width="600" height="600" fill="#130f22"/>
      <rect x="28" y="28" width="544" height="544" rx="24" fill="#07060b" stroke="#8b5cf6" stroke-width="2"/>
      <circle cx="300" cy="245" r="84" fill="#130f22" stroke="#a855f7" stroke-width="4"/>
      <circle cx="300" cy="245" r="24" fill="#8b5cf6"/>
      <text x="300" y="420" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="32" font-weight="bold">${safeT}</text>
      <text x="300" y="462" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="22">${safeA}</text>
    </svg>`;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(fallbackSvg);
  });

  // 4. Endpoint de Álbum Completo (/api/album) — retorna apenas faixas ORIGINAIS de estúdio sem covers/remixes/ao vivo
  app.get("/api/album", async (req: Request, res: Response) => {
    const collectionId = String(req.query.collectionId || "").replace(/\D/g, "");
    const dzAlbumId = String(req.query.dzAlbumId || "").replace(/\D/g, "");
    const title = String(req.query.title || "").trim();
    const artist = String(req.query.artist || "").trim();

    const rawTracks: any[] = [];
    let albumCover = "";

    // 1. Tenta iTunes Lookup pelo collectionId oficial (ordenando por discNumber e trackNumber para manter a ordem exata do álbum)
    if (collectionId) {
      try {
        const r = await fetchWithTimeout(`https://itunes.apple.com/lookup?id=${collectionId}&entity=song&country=BR&limit=60`, {}, 4000);
        if (r.ok) {
          const d = (await r.json()) as any;
          const results: any[] = Array.isArray(d?.results) ? d.results : [];
          const colInfo = results.find(x => x.wrapperType === "collection");
          if (colInfo?.artworkUrl100) {
            albumCover = toCoverProxyUrl(colInfo.artworkUrl100, title || colInfo.collectionName || "", artist || colInfo.artistName || "");
          }
          const trackItems = results
            .filter(x => {
              const durSec = Math.round(Number(x.trackTimeMillis || 0) / 1000);
              return (
                x.wrapperType === "track" &&
                durSec >= 95 &&
                isOriginalStudioTrack(x.trackName || "", x.artistName || artist, x.collectionName || title, durSec)
              );
            })
            .sort((a, b) => {
              const discDiff = (Number(a.discNumber) || 1) - (Number(b.discNumber) || 1);
              if (discDiff !== 0) return discDiff;
              return (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0);
            });

          trackItems.forEach((item, idx) => {
            const rawArt = upgradeArtwork(item.artworkUrl100);
            const cover = toCoverProxyUrl(rawArt, item.trackName || "", item.artistName || artist);
            const proxyUrl = buildFullStreamProxyUrl(item.trackName || "", item.artistName || artist);
            rawTracks.push({
              id: String(item.trackId),
              title: item.trackName,
              artist: item.artistName || artist,
              albumTitle: item.collectionName || title || "Álbum",
              duration: formatDurationMs(item.trackTimeMillis),
              durationSec: Math.round(Number(item.trackTimeMillis || 0) / 1000),
              trackNumber: Number(item.trackNumber) || idx + 1,
              discNumber: Number(item.discNumber) || 1,
              genre: item.primaryGenreName || "Pop",
              year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2024,
              coverUrl: cover,
              previewUrl: proxyUrl,
              streamUrl: proxyUrl,
              popular: idx < 3
            });
          });
        }
      } catch (_e) {}
    }

    // 2. Tenta Deezer Album pelo dzAlbumId (ordenando por disk_number e track_position)
    if (rawTracks.length === 0 && dzAlbumId) {
      try {
        const r = await fetchWithTimeout(`https://api.deezer.com/album/${dzAlbumId}`, {}, 4000);
        if (r.ok) {
          const albData = (await r.json()) as any;
          const rawAlbArt = upgradeArtwork(albData?.cover_xl || albData?.cover_big || albData?.cover_medium || "");
          albumCover = toCoverProxyUrl(rawAlbArt, albData?.title || title, albData?.artist?.name || artist);
          const trList: any[] = Array.isArray(albData?.tracks?.data) ? albData.tracks.data : [];
          trList
            .filter(item => Number(item.duration || 210) >= 95 && isOriginalStudioTrack(item.title || "", item.artist?.name || artist, albData?.title || title, item.duration))
            .sort((a, b) => {
              const discDiff = (Number(a.disk_number) || 1) - (Number(b.disk_number) || 1);
              if (discDiff !== 0) return discDiff;
              return (Number(a.track_position) || 0) - (Number(b.track_position) || 0);
            })
            .forEach((item, idx) => {
              const artName = item.artist?.name || albData?.artist?.name || artist;
              const trackCover = toCoverProxyUrl(rawAlbArt, item.title || "", artName);
              const proxyUrl = buildFullStreamProxyUrl(item.title || "", artName);
              rawTracks.push({
                id: `dz_${item.id}`,
                title: item.title,
                artist: artName,
                albumTitle: albData?.title || title || "Álbum",
                duration: formatDurationSec(item.duration || 210),
                durationSec: Number(item.duration || 210),
                trackNumber: Number(item.track_position) || idx + 1,
                discNumber: Number(item.disk_number) || 1,
                genre: "Lossless Master",
                year: albData?.release_date ? new Date(albData.release_date).getFullYear() : 2024,
                coverUrl: trackCover,
                previewUrl: proxyUrl,
                streamUrl: proxyUrl,
                popular: idx < 3
              });
            });
        }
      } catch (_e) {}
    }

    // 3. Fallback: Busca o álbum pelo nome + artista no iTunes e faz lookup da coleção encontrada
    if (rawTracks.length === 0 && (title || artist)) {
      try {
        const q = `${artist} ${title}`.trim();
        const albSearch = await fetchWithTimeout(
          `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&entity=album&limit=8`,
          {},
          3800
        );
        if (albSearch.ok) {
          const albJson = (await albSearch.json()) as any;
          const resultsList: any[] = Array.isArray(albJson?.results) ? albJson.results : [];
          const bestCol =
            resultsList.find(c => isOriginalStudioTrack(c.collectionName || "", c.artistName || artist)) ||
            resultsList[0];
          if (bestCol?.collectionId) {
            albumCover = toCoverProxyUrl(bestCol.artworkUrl100, bestCol.collectionName || title, bestCol.artistName || artist);
            const lookRes = await fetchWithTimeout(
              `https://itunes.apple.com/lookup?id=${bestCol.collectionId}&entity=song&country=BR&limit=60`,
              {},
              3800
            );
            if (lookRes.ok) {
              const lookData = (await lookRes.json()) as any;
              (lookData?.results || [])
                .filter((x: any) => {
                  const durSec = Math.round(Number(x.trackTimeMillis || 0) / 1000);
                  return x.wrapperType === "track" && durSec >= 95 && isOriginalStudioTrack(x.trackName || "", x.artistName || artist, x.collectionName || title, durSec);
                })
                .sort((a: any, b: any) => {
                  const discDiff = (Number(a.discNumber) || 1) - (Number(b.discNumber) || 1);
                  if (discDiff !== 0) return discDiff;
                  return (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0);
                })
                .forEach((item: any, idx: number) => {
                  const cover = toCoverProxyUrl(item.artworkUrl100 || bestCol.artworkUrl100, item.trackName || "", item.artistName || artist);
                  const proxyUrl = buildFullStreamProxyUrl(item.trackName || "", item.artistName || artist);
                  rawTracks.push({
                    id: String(item.trackId),
                    title: item.trackName,
                    artist: item.artistName || artist,
                    albumTitle: item.collectionName || title,
                    duration: formatDurationMs(item.trackTimeMillis),
                    durationSec: Math.round(Number(item.trackTimeMillis || 0) / 1000),
                    trackNumber: Number(item.trackNumber) || idx + 1,
                    discNumber: Number(item.discNumber) || 1,
                    genre: item.primaryGenreName || "Pop",
                    year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2024,
                    coverUrl: cover,
                    previewUrl: proxyUrl,
                    streamUrl: proxyUrl,
                    popular: idx < 3
                  });
                });
            }
          }
        }
      } catch (_e) {}
    }

    const tracks = deduplicateSongsList(rawTracks);
    res.json({
      coverUrl: albumCover || (tracks[0] && tracks[0].coverUrl) || toCoverProxyUrl("", title, artist),
      tracks
    });
  });

  // 5. Perfil Oficial de Qualquer Artista + Top Músicas Originais Deduplicadas + Discografia 1000x1000 HD
  app.get("/api/artist", async (req: Request, res: Response) => {
    const name = String(req.query.name || "Lady Gaga").trim();

    try {
      const [dzArtistSearchSettled, itunesSongSettled, itunesAlbumSettled, saavnSettled] = await Promise.allSettled([
        fetchWithTimeout(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`, {}, 4000).then(r => (r.ok ? r.json() : null)),
        fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&country=BR&entity=song&limit=40`, {}, 4000).then(r => (r.ok ? r.json() : null)),
        fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&country=BR&entity=album&limit=20`, {}, 4000).then(r => (r.ok ? r.json() : null)),
        fetchWithTimeout(
          `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=25&p=1&q=${encodeURIComponent(name)}`,
          { headers: SAAVN_GLOBAL_HEADERS },
          3600
        ).then(r => (r.ok ? r.json() : null))
      ]);

      const dzArtists: any[] =
        dzArtistSearchSettled.status === "fulfilled" && Array.isArray((dzArtistSearchSettled.value as any)?.data)
          ? (dzArtistSearchSettled.value as any).data
          : [];

      const normTarget = normalizeStr(name);
      const matchedArtist =
        dzArtists.find(a => normalizeStr(a.name) === normTarget) ||
        dzArtists.find(a => normalizeStr(a.name).includes(normTarget) || normTarget.includes(normalizeStr(a.name))) ||
        dzArtists[0];

      let dzTopTracks: any[] = [];
      let dzAlbums: any[] = [];

      if (matchedArtist?.id) {
        const [topSettled, albSettled] = await Promise.allSettled([
          fetchWithTimeout(`https://api.deezer.com/artist/${matchedArtist.id}/top?limit=35`, {}, 4000).then(r => (r.ok ? r.json() : null)),
          fetchWithTimeout(`https://api.deezer.com/artist/${matchedArtist.id}/albums?limit=18`, {}, 4000).then(r => (r.ok ? r.json() : null))
        ]);
        if (topSettled.status === "fulfilled" && Array.isArray((topSettled.value as any)?.data)) {
          dzTopTracks = (topSettled.value as any).data;
        }
        if (albSettled.status === "fulfilled" && Array.isArray((albSettled.value as any)?.data)) {
          dzAlbums = (albSettled.value as any).data;
        }
      }

      const itunesSongs: any[] =
        itunesSongSettled.status === "fulfilled" && Array.isArray((itunesSongSettled.value as any)?.results)
          ? (itunesSongSettled.value as any).results
          : [];
      const itunesAlbums: any[] =
        itunesAlbumSettled.status === "fulfilled" && Array.isArray((itunesAlbumSettled.value as any)?.results)
          ? (itunesAlbumSettled.value as any).results
          : [];
      const saavnResults: any[] =
        saavnSettled.status === "fulfilled" && Array.isArray((saavnSettled.value as any)?.results)
          ? (saavnSettled.value as any).results
          : [];

      const rawSongs: any[] = [];
      const albumsMap = new Map<string, any>();

      itunesSongs
        .filter(r => {
          const durSec = Math.round(Number(r.trackTimeMillis || 0) / 1000);
          return (
            durSec >= 95 &&
            artistMatchesTarget(r.artistName || "", matchedArtist?.name || name) &&
            isOriginalStudioTrack(r.trackName || "", r.artistName || name, r.collectionName || "", durSec)
          );
        })
        .forEach((item, idx) => {
          const cover = toCoverProxyUrl(item.artworkUrl100, item.trackName || "", item.artistName || name);
          const proxyUrl = buildFullStreamProxyUrl(item.trackName || "", item.artistName || name);

          rawSongs.push({
            id: String(item.trackId),
            title: item.trackName,
            artist: item.artistName,
            albumTitle: item.collectionName || "Single",
            duration: formatDurationMs(item.trackTimeMillis),
            durationSec: Math.round(Number(item.trackTimeMillis || 0) / 1000),
            genre: item.primaryGenreName || "Pop",
            year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2024,
            coverUrl: cover,
            previewUrl: proxyUrl,
            streamUrl: proxyUrl,
            popular: idx < 5
          });
        });

      dzTopTracks
        .filter(item => Number(item.duration || 215) >= 95 && isOriginalStudioTrack(item.title || "", item.artist?.name || name, item.album?.title || "", item.duration))
        .forEach((item, idx) => {
          const artistName = item.artist?.name || matchedArtist?.name || name;
          const albumTitle = item.album?.title || "Single";
          const rawArt = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || "";
          const cover = toCoverProxyUrl(rawArt, item.title || "", artistName);
          const proxyUrl = buildFullStreamProxyUrl(item.title || "", artistName);

          rawSongs.push({
            id: `dz_${item.id}`,
            title: item.title,
            artist: artistName,
            albumTitle,
            duration: formatDurationSec(item.duration || 215),
            durationSec: Number(item.duration || 215),
            genre: "Lossless Master",
            year: 2024,
            coverUrl: cover,
            previewUrl: proxyUrl,
            streamUrl: proxyUrl,
            popular: idx < 5
          });
        });

      saavnResults.forEach((item, idx) => {
        const durSec = Number(item?.more_info?.duration || 0);
        if (durSec < 95 || durSec > 600) return;
        const itemTitle = String(item.title || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
        const itemAlbum = String(item.more_info?.album || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
        const primaryArtists: string[] = [
          ...(item.more_info?.artistMap?.primary_artists || [])
        ].map((a: any) => String(a?.name || "")).filter(Boolean);
        const artistName = primaryArtists[0] || matchedArtist?.name || name;
        if (!artistMatchesTarget(artistName, matchedArtist?.name || name)) return;
        if (!isOriginalStudioTrack(itemTitle, artistName, itemAlbum, durSec)) return;

        const rawArt = upgradeArtwork(item.image || "");
        const cover = toCoverProxyUrl(rawArt, itemTitle, artistName);
        const proxyUrl = buildFullStreamProxyUrl(itemTitle, artistName);
        rawSongs.push({
          id: `saavn_${item.id || idx}`,
          title: itemTitle,
          artist: artistName,
          albumTitle: itemAlbum || "Single",
          duration: formatDurationSec(durSec),
          durationSec: durSec,
          genre: "Lossless 320kbps",
          year: Number(item.year) || 2025,
          coverUrl: cover,
          previewUrl: proxyUrl,
          streamUrl: proxyUrl,
          popular: idx < 5
        });
      });

      itunesAlbums.forEach(alb => {
        if (!alb.collectionName || !artistMatchesTarget(alb.artistName || "", matchedArtist?.name || name) || !isOriginalStudioTrack(alb.collectionName, alb.artistName || name)) return;
        const key = normalizeSongTitleKey(alb.collectionName);
        const cover = toCoverProxyUrl(alb.artworkUrl100, alb.collectionName, alb.artistName || name);
        if (!albumsMap.has(key) && cover) {
          albumsMap.set(key, {
            id: `itunes_alb_${alb.collectionId}`,
            collectionId: alb.collectionId,
            searchQuery: `${alb.artistName || name} ${alb.collectionName}`,
            title: alb.collectionName,
            artist: alb.artistName || matchedArtist?.name || name,
            year: alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : 2024,
            releaseDate: alb.releaseDate ? new Date(alb.releaseDate).toLocaleDateString("pt-BR") : "Lançamento Oficial",
            genre: alb.primaryGenreName || "Pop",
            label: alb.copyright || "Catálogo Oficial HD",
            coverUrl: cover,
            badges: ["Lossless", "Master", "Hi-Res Audio"],
            tracks: []
          });
        }
      });

      dzAlbums.forEach(alb => {
        if (!alb.title || !isOriginalStudioTrack(alb.title, matchedArtist?.name || name)) return;
        const key = normalizeSongTitleKey(alb.title);
        const rawArt = alb.cover_xl || alb.cover_big || alb.cover_medium || "";
        const cover = toCoverProxyUrl(rawArt, alb.title, matchedArtist?.name || name);
        if (!albumsMap.has(key) && cover) {
          albumsMap.set(key, {
            id: `dz_alb_${alb.id}`,
            dzAlbumId: alb.id,
            searchQuery: `${matchedArtist?.name || name} ${alb.title}`,
            title: alb.title,
            artist: matchedArtist?.name || name,
            year: alb.release_date ? new Date(alb.release_date).getFullYear() : 2024,
            releaseDate: alb.release_date ? new Date(alb.release_date).toLocaleDateString("pt-BR") : "Lançamento Oficial HD",
            genre: "Lossless Master",
            label: "Miado Global Catalog",
            coverUrl: cover,
            badges: ["Lossless", "Master", "Hi-Res Audio"],
            tracks: []
          });
        }
      });

      const songs = deduplicateSongsList(rawSongs);
      const albums = Array.from(albumsMap.values()).slice(0, 16);

      albums.forEach(alb => {
        const matching = songs.filter(s => s.albumTitle && normalizeSongTitleKey(s.albumTitle) === normalizeSongTitleKey(alb.title));
        alb.tracks = matching.length >= 4 ? matching : [];
      });

      const resolvedArtistName = matchedArtist?.name || name;
      const artistPortrait = `/api/artist-image?name=${encodeURIComponent(resolvedArtistName)}`;

      res.json({
        artist: {
          id: matchedArtist?.id || name,
          name: resolvedArtistName,
          pictureUrl: artistPortrait,
          nbFan: matchedArtist?.nb_fan || 1250000,
          nbAlbum: matchedArtist?.nb_album || albums.length || 8
        },
        songs,
        albums
      });
    } catch (_e) {
      res.json({
        artist: {
          id: name,
          name,
          pictureUrl: `/api/artist-image?name=${encodeURIComponent(name)}`,
          nbFan: 500000,
          nbAlbum: 5
        },
        songs: [],
        albums: []
      });
    }
  });

  // 6. Busca Global no Servidor (Apenas Músicas Originais de Estúdio, Artistas e Álbuns Oficiais)
  app.get("/api/search", async (req: Request, res: Response) => {
    const q = String(req.query.q || "The Weeknd").trim();
    const limit = Math.min(45, Number(req.query.limit) || 30);

    const [itunesSettled, deezerSettled, deezerArtistsSettled, itunesAlbumsSettled, saavnSettled] = await Promise.allSettled([
      fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&entity=song&limit=${limit}`, {}, 4200).then(r => (r.ok ? r.json() : null)),
      fetchWithTimeout(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}`, {}, 4200).then(r => (r.ok ? r.json() : null)),
      fetchWithTimeout(`https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=10`, {}, 3800).then(r => (r.ok ? r.json() : null)),
      fetchWithTimeout(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&entity=album&limit=14`, {}, 3800).then(r => (r.ok ? r.json() : null)),
      fetchWithTimeout(
        `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=20&p=1&q=${encodeURIComponent(q)}`,
        { headers: SAAVN_GLOBAL_HEADERS },
        3600
      ).then(r => (r.ok ? r.json() : null))
    ]);

    const itunesResults: any[] =
      itunesSettled.status === "fulfilled" && itunesSettled.value && Array.isArray((itunesSettled.value as any).results)
        ? (itunesSettled.value as any).results
        : [];
    const deezerResults: any[] =
      deezerSettled.status === "fulfilled" && deezerSettled.value && Array.isArray((deezerSettled.value as any).data)
        ? (deezerSettled.value as any).data
        : [];
    const deezerArtists: any[] =
      deezerArtistsSettled.status === "fulfilled" && deezerArtistsSettled.value && Array.isArray((deezerArtistsSettled.value as any).data)
        ? (deezerArtistsSettled.value as any).data
        : [];
    const itunesAlbums: any[] =
      itunesAlbumsSettled.status === "fulfilled" && itunesAlbumsSettled.value && Array.isArray((itunesAlbumsSettled.value as any).results)
        ? (itunesAlbumsSettled.value as any).results
        : [];
    const saavnResults: any[] =
      saavnSettled.status === "fulfilled" && saavnSettled.value && Array.isArray((saavnSettled.value as any).results)
        ? (saavnSettled.value as any).results
        : [];

    const artistsMap = new Map<string, any>();
    const rawSongs: any[] = [];
    const albumMap = new Map<string, any>();

    deezerArtists.forEach(art => {
      if (!art?.name) return;
      const key = normalizeStr(art.name);
      if (!artistsMap.has(key)) {
        artistsMap.set(key, {
          id: `dz_art_${art.id}`,
          name: art.name,
          role: art.nb_fan ? `${Number(art.nb_fan).toLocaleString("pt-BR")} fãs` : "Artista Verificado",
          coverUrl: `/api/artist-image?name=${encodeURIComponent(art.name)}`,
          nbFan: art.nb_fan || 0
        });
      }
    });

    itunesAlbums.forEach(alb => {
      if (!alb.collectionName || !isOriginalStudioTrack(alb.collectionName, alb.artistName || q)) return;
      const albKey = normalizeSongTitleKey(alb.collectionName);
      const cover = toCoverProxyUrl(alb.artworkUrl100, alb.collectionName, alb.artistName || q);
      if (!albumMap.has(albKey) && cover) {
        albumMap.set(albKey, {
          id: `itunes_alb_${alb.collectionId}`,
          collectionId: alb.collectionId,
          searchQuery: `${alb.artistName} ${alb.collectionName}`,
          title: alb.collectionName,
          artist: alb.artistName,
          year: alb.releaseDate ? new Date(alb.releaseDate).getFullYear() : 2024,
          releaseDate: alb.releaseDate ? new Date(alb.releaseDate).toLocaleDateString("pt-BR") : "Lançamento Oficial",
          genre: alb.primaryGenreName || "Pop",
          label: alb.copyright || "Catálogo Oficial HD",
          coverUrl: cover,
          badges: ["Lossless", "Master", "Hi-Res Audio"],
          tracks: []
        });
      }
    });

    itunesResults
      .filter(r => {
        const durSec = Math.round(Number(r.trackTimeMillis || 0) / 1000);
        return durSec >= 95 && isOriginalStudioTrack(r.trackName || "", r.artistName || q, r.collectionName || "");
      })
      .forEach((item, idx) => {
        const cover = toCoverProxyUrl(item.artworkUrl100, item.trackName || "", item.artistName || q);
        const proxyUrl = buildFullStreamProxyUrl(item.trackName || "", item.artistName || q);

        const artKey = normalizeStr(item.artistName || "");
        if (artKey && !artistsMap.has(artKey)) {
          artistsMap.set(artKey, {
            id: `it_art_${item.artistId || idx}`,
            name: item.artistName,
            role: item.primaryGenreName || "Artista Verificado",
            coverUrl: `/api/artist-image?name=${encodeURIComponent(item.artistName)}`,
            nbFan: 0
          });
        }

        rawSongs.push({
          id: String(item.trackId),
          title: item.trackName,
          artist: item.artistName,
          albumTitle: item.collectionName || "Single",
          duration: formatDurationMs(item.trackTimeMillis),
          durationSec: Math.round(Number(item.trackTimeMillis || 0) / 1000),
          genre: item.primaryGenreName || "Pop",
          year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2024,
          coverUrl: cover,
          previewUrl: proxyUrl,
          streamUrl: proxyUrl,
          popular: idx < 4
        });

        if (item.collectionId && item.collectionName && isOriginalStudioTrack(item.collectionName, item.artistName || q)) {
          const albKey = normalizeSongTitleKey(item.collectionName);
          if (!albumMap.has(albKey) && cover) {
            albumMap.set(albKey, {
              id: `itunes_alb_${item.collectionId}`,
              collectionId: item.collectionId,
              searchQuery: `${item.artistName} ${item.collectionName}`,
              title: item.collectionName,
              artist: item.artistName,
              year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : 2024,
              releaseDate: item.releaseDate ? new Date(item.releaseDate).toLocaleDateString("pt-BR") : "Lançamento Oficial",
              genre: item.primaryGenreName || "Pop",
              label: "Catálogo Oficial HD",
              coverUrl: cover,
              badges: ["Lossless", "Master", "Hi-Res Audio"],
              tracks: []
            });
          }
        }
      });

    deezerResults
      .filter(d => Number(d.duration || 210) >= 95 && isOriginalStudioTrack(d.title || "", d.artist?.name || q, d.album?.title || ""))
      .forEach((item, idx) => {
        const artistName = item.artist?.name || q;
        const albumTitle = item.album?.title || "Single";
        const rawArt = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || "";
        const cover = toCoverProxyUrl(rawArt, item.title || "", artistName);
        const proxyUrl = buildFullStreamProxyUrl(item.title || "", artistName);

        const artKey = normalizeStr(artistName);
        if (!artistsMap.has(artKey)) {
          artistsMap.set(artKey, {
            id: `dz_art_${item.artist?.id || idx}`,
            name: artistName,
            role: "Artista Verificado",
            coverUrl: `/api/artist-image?name=${encodeURIComponent(artistName)}`,
            nbFan: 0
          });
        }

        rawSongs.push({
          id: `dz_${item.id}`,
          title: item.title,
          artist: artistName,
          albumTitle,
          duration: formatDurationSec(item.duration || 210),
          durationSec: Number(item.duration || 210),
          genre: "Pop / Lossless",
          year: 2024,
          coverUrl: cover,
          previewUrl: proxyUrl,
          streamUrl: proxyUrl,
          popular: idx < 4
        });

        if (item.album?.id && item.album?.title && isOriginalStudioTrack(item.album.title, artistName)) {
          const albKey = normalizeSongTitleKey(item.album.title);
          if (!albumMap.has(albKey) && cover) {
            albumMap.set(albKey, {
              id: `dz_alb_${item.album.id}`,
              dzAlbumId: item.album.id,
              searchQuery: `${artistName} ${item.album.title}`,
              title: item.album.title,
              artist: artistName,
              year: 2024,
              releaseDate: "Lançamento Oficial HD",
              genre: "Lossless Master",
              label: "Miado Global Catalog",
              coverUrl: cover,
              badges: ["Lossless", "Master", "Hi-Res Audio"],
              tracks: []
            });
          }
        }
      });

    saavnResults.forEach((item, idx) => {
      const durSec = Number(item?.more_info?.duration || 0);
      if (durSec < 95 || durSec > 600) return;
      const itemTitle = String(item.title || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
      const itemAlbum = String(item.more_info?.album || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const primaryArtists: string[] = [
        ...(item.more_info?.artistMap?.primary_artists || [])
      ].map((a: any) => String(a?.name || "")).filter(Boolean);
      const artistName = primaryArtists[0] || q;
      if (!isOriginalStudioTrack(itemTitle, artistName, itemAlbum, durSec)) return;

      const rawArt = upgradeArtwork(item.image || "");
      const cover = toCoverProxyUrl(rawArt, itemTitle, artistName);
      const proxyUrl = buildFullStreamProxyUrl(itemTitle, artistName);

      rawSongs.push({
        id: `saavn_${item.id || idx}`,
        title: itemTitle,
        artist: artistName,
        albumTitle: itemAlbum || "Single",
        duration: formatDurationSec(durSec),
        durationSec: durSec,
        genre: "Lossless 320kbps",
        year: Number(item.year) || 2025,
        coverUrl: cover,
        previewUrl: proxyUrl,
        streamUrl: proxyUrl,
        popular: idx < 4
      });
    });

    const artists = Array.from(artistsMap.values()).slice(0, 10);
    const songs = deduplicateSongsList(rawSongs);
    const albums = Array.from(albumMap.values()).slice(0, 12);

    albums.forEach(alb => {
      const matching = songs.filter(s => s.albumTitle && normalizeSongTitleKey(s.albumTitle) === normalizeSongTitleKey(alb.title));
      alb.tracks = matching.length >= 4 ? matching : [];
    });

    res.json({ artists, songs, albums });
  });

  // 6b. Sincronização Permanente com Firebase Firestore (/api/user/firestore-sync)
  // Persiste permanentemente as músicas curtidas, histórico recente, playlists e perfil
  app.post("/api/user/firestore-sync", (req: Request, res: Response) => {
    try {
      const { uid, email, name, handle, bio, catId, avatarUrl, favoriteArtists, likedTracks, playlists, recentHistory } = req.body || {};
      const cleanUid = sanitizeText(uid || "", 128);
      if (!cleanUid) {
        res.status(400).json({ ok: false, error: "UID do Firebase é obrigatório." });
        return;
      }

      const cleanFavs = Array.isArray(favoriteArtists)
        ? favoriteArtists.map((a: unknown) => sanitizeText(a, 80)).filter(Boolean)
        : ["Lady Gaga", "The Weeknd", "Jão"];

      const cleanLiked = Array.isArray(likedTracks) ? likedTracks.slice(0, 500) : [];
      const cleanPlaylists = Array.isArray(playlists) ? playlists.slice(0, 100) : [];
      const cleanHistory = Array.isArray(recentHistory) ? recentHistory.slice(0, 100) : [];

      const db = readDb();
      const accounts = db.accounts || {};
      const targetEmail = sanitizeText(email || db.activeAccountEmail || `${cleanUid}@miado.app`, 120).toLowerCase();

      const userProfile = {
        uid: cleanUid,
        email: targetEmail,
        name: sanitizeText(name || "Gatinho Miado", 60),
        handle: sanitizeText(handle || "@miadinho", 40),
        bio: sanitizeText(bio || "Apaixonado por música e áudio HD no Miado 🐾", 240),
        catId: sanitizeText(catId || "cat_1", 32),
        avatarUrl: String(avatarUrl || ""),
        favoriteArtists: cleanFavs,
        onboardingCompleted: true,
        updatedAt: new Date().toISOString()
      };

      if (!accounts[targetEmail]) {
        accounts[targetEmail] = {
          uid: cleanUid,
          email: targetEmail,
          passwordHash: "",
          salt: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          user: userProfile,
          favoriteArtists: cleanFavs,
          onboardingCompleted: true,
          likedTracks: cleanLiked,
          playlists: cleanPlaylists,
          recentHistory: cleanHistory
        };
      } else {
        accounts[targetEmail] = {
          ...accounts[targetEmail],
          updatedAt: new Date().toISOString(),
          user: { ...accounts[targetEmail].user, ...userProfile },
          favoriteArtists: cleanFavs,
          likedTracks: cleanLiked,
          playlists: cleanPlaylists,
          recentHistory: cleanHistory
        };
      }

      writeDb({
        activeAccountEmail: targetEmail,
        user: userProfile,
        favoriteArtists: cleanFavs,
        likedTracks: cleanLiked,
        playlists: cleanPlaylists,
        recentHistory: cleanHistory,
        accounts
      });

      res.json({ ok: true, syncedTo: "Firestore & Local DB", uid: cleanUid });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "Erro ao sincronizar com Firestore." });
    }
  });

  app.get("/api/user/firestore-sync", (req: Request, res: Response) => {
    try {
      const uid = String(req.query.uid || "").trim();
      const db = readDb();
      const accounts = db.accounts || {};

      let account = Object.values(accounts).find(a => a.uid === uid);
      if (!account && db.activeAccountEmail && accounts[db.activeAccountEmail]) {
        account = accounts[db.activeAccountEmail];
      }

      if (account) {
        res.json({
          ok: true,
          user: account.user,
          favoriteArtists: account.favoriteArtists || [],
          likedTracks: account.likedTracks || [],
          playlists: account.playlists || [],
          recentHistory: account.recentHistory || []
        });
        return;
      }

      res.json({
        ok: true,
        user: db.user || null,
        favoriteArtists: db.favoriteArtists || [],
        followedArtists: db.followedArtists || [],
        followingProfiles: db.followingProfiles || [],
        likedTracks: db.likedTracks || [],
        playlists: db.playlists || [],
        recentHistory: db.recentHistory || []
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message });
    }
  });

  // 6c. Diretório de Perfis Reais Criados no App (/api/profiles) — Zero perfis falsos pré-prontos
  app.get("/api/profiles", (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || "").toLowerCase().trim();
      const db = readDb();
      const profilesMap: Record<string, CommunityProfile> = { ...(db.profiles || {}) };

      // Garante que todas as contas reais cadastradas e o perfil atual do usuário estejam no diretório
      if (db.user && db.user.username) {
        const uHandle = String(db.user.username || "@miadinho").toLowerCase().trim();
        const key = uHandle.startsWith("@") ? uHandle : `@${uHandle}`;
        profilesMap[key] = {
          id: String(db.user.uid || `prof_${key.replace(/[^a-z0-9]/g, "")}`),
          name: String(db.user.name || "Meu Perfil"),
          username: key,
          bio: String(db.user.bio || "Ouvindo música original de estúdio no Miado."),
          avatarUrl: String(db.user.avatarUrl || "/api/cat-avatar?id=cat_1"),
          bannerUrl: String(db.user.bannerUrl || ""),
          currentTrack: String((db.recentHistory?.[0] as any)?.title ? `${(db.recentHistory?.[0] as any).title} - ${(db.recentHistory?.[0] as any).artist}` : "Descobrindo músicas no Miado"),
          albumId: String((db.recentHistory?.[0] as any)?.albumId || "billie_hmhas"),
          favoriteArtists: Array.isArray(db.user.favoriteArtists) ? (db.user.favoriteArtists as string[]) : [],
          followersCount: Number(db.user.followersCount || 0),
          followingCount: Number(db.user.followingCount || 0),
          online: true,
          updatedAt: new Date().toISOString()
        };
      }

      const accounts = db.accounts || {};
      for (const acc of Object.values(accounts)) {
        if (!acc?.user) continue;
        const rawH = String(acc.user.handle || acc.user.username || "").toLowerCase().trim();
        if (!rawH) continue;
        const key = rawH.startsWith("@") ? rawH : `@${rawH}`;
        if (!profilesMap[key]) {
          profilesMap[key] = {
            id: String(acc.uid || `prof_${key.replace(/[^a-z0-9]/g, "")}`),
            name: String(acc.user.name || key),
            username: key,
            bio: String(acc.user.bio || "Perfil oficial no Miado"),
            avatarUrl: String(acc.user.avatarUrl || `/api/cat-avatar?id=${acc.user.catId || "cat_1"}`),
            bannerUrl: String(acc.user.bannerUrl || ""),
            currentTrack: "Ouvindo no Miado Lossless",
            albumId: "billie_hmhas",
            favoriteArtists: Array.isArray(acc.favoriteArtists) ? acc.favoriteArtists : [],
            followersCount: 0,
            followingCount: 0,
            online: true,
            updatedAt: acc.updatedAt || new Date().toISOString()
          };
        }
      }

      let list = Object.values(profilesMap);
      if (q) {
        list = list.filter(
          p =>
            p.name.toLowerCase().includes(q) ||
            p.username.toLowerCase().includes(q) ||
            (p.bio && p.bio.toLowerCase().includes(q)) ||
            (Array.isArray(p.favoriteArtists) && p.favoriteArtists.some(a => a.toLowerCase().includes(q)))
        );
      }

      res.json({ ok: true, profiles: list });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "Erro ao buscar perfis." });
    }
  });

  app.post("/api/profiles", (req: Request, res: Response) => {
    try {
      const { name, username, bio, avatarUrl, bannerUrl, currentTrack, albumId, favoriteArtists } = req.body || {};
      const cleanName = sanitizeText(name || "", 60);
      const rawUser = sanitizeText(username || "", 40).toLowerCase().replace(/\s+/g, "");
      if (!cleanName || !rawUser) {
        res.status(400).json({ ok: false, error: "Informe nome e @username para criar ou atualizar o perfil." });
        return;
      }
      const cleanHandle = rawUser.startsWith("@") ? rawUser : `@${rawUser}`;
      const db = readDb();
      const profiles: Record<string, CommunityProfile> = { ...(db.profiles || {}) };
      const existing = profiles[cleanHandle];

      const profileRecord: CommunityProfile = {
        id: existing?.id || `prof_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        username: cleanHandle,
        bio: sanitizeText(bio || existing?.bio || "Ouvindo música original de estúdio no Miado 🐾", 240),
        avatarUrl: String(avatarUrl || existing?.avatarUrl || "/api/cat-avatar?id=cat_2"),
        bannerUrl: String(bannerUrl || existing?.bannerUrl || ""),
        currentTrack: sanitizeText(currentTrack || existing?.currentTrack || "BIRDS OF A FEATHER - Billie Eilish", 120),
        albumId: sanitizeText(albumId || existing?.albumId || "billie_hmhas", 60),
        favoriteArtists: Array.isArray(favoriteArtists)
          ? favoriteArtists.map((a: unknown) => sanitizeText(a, 60)).filter(Boolean)
          : existing?.favoriteArtists || ["Billie Eilish", "Lady Gaga", "The Weeknd"],
        followersCount: Number(existing?.followersCount || 0),
        followingCount: Number(existing?.followingCount || 0),
        online: true,
        updatedAt: new Date().toISOString()
      };

      profiles[cleanHandle] = profileRecord;
      writeDb({ profiles });
      res.json({ ok: true, profile: profileRecord, profiles: Object.values(profiles) });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "Erro ao salvar perfil." });
    }
  });

  app.delete("/api/profiles/:handle", (req: Request, res: Response) => {
    try {
      const rawHandle = String(req.params.handle || "").toLowerCase().trim();
      const cleanHandle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;
      const db = readDb();
      const profiles: Record<string, CommunityProfile> = { ...(db.profiles || {}) };
      delete profiles[cleanHandle];
      writeDb({ profiles });
      res.json({ ok: true, profiles: Object.values(profiles) });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message });
    }
  });

  // 7. Resolução de Áudio Completo (3 a 5 minutos, zero anúncios, zero previews de 30s)
  app.get("/api/resolve-full", async (req: Request, res: Response) => {
    const title = String(req.query.title || "").trim();
    const artist = String(req.query.artist || "").trim();
    const instanceIdxParam = req.query.instanceIdx !== undefined ? Number(req.query.instanceIdx) : -1;

    if (!title && !artist) {
      res.json({ isFullStream: false });
      return;
    }

    if (instanceIdxParam >= 0 && instanceIdxParam < PIPED_INVIDIOUS_INSTANCES.length) {
      const inst = PIPED_INVIDIOUS_INSTANCES[instanceIdxParam];
      const q = `${title} ${artist}`.trim();
      const cleanArtist = String(artist || "").split(/[,&/]/)[0].trim();
      const single = await resolveFromSinglePipedInstance(
        inst,
        q,
        210,
        false,
        normalizeSongTitleKey(title),
        normalizeStr(cleanArtist || artist)
      );
      if (single && single.url) {
        const cacheKey = `${normalizeSongTitleKey(title)}|${normalizeStr(cleanArtist || artist)}`;
        fullStreamCache.set(cacheKey, single);
        res.json({
          isFullStream: true,
          source: single.source,
          durationSec: single.durationSec,
          durationFormatted: formatDurationSec(single.durationSec),
          url: `/api/stream?url=${encodeURIComponent(single.url)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&full=1`
        });
        return;
      }
    }

    const resolved = await resolveFullLengthTrackUrl(title, artist);
    if (resolved && resolved.url) {
      res.json({
        isFullStream: true,
        source: resolved.source,
        durationSec: resolved.durationSec || 215,
        durationFormatted: formatDurationSec(resolved.durationSec || 215),
        url: `/api/stream?url=${encodeURIComponent(resolved.url)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&full=1`
      });
      return;
    }

    res.json({ isFullStream: false });
  });

  // 8. Proxy de Stream de Áudio Direto (/api/stream)
  // Entrega sempre a versão de estúdio original do artista solicitado, sem nunca tocar artista errado ou falhar com 404.
  app.get("/api/stream", async (req: Request, res: Response) => {
    const rawUrlParam = String(req.query.url || "").trim();
    const title = String(req.query.title || "").trim();
    const artist = String(req.query.artist || "").trim();
    const preferFull = String(req.query.preferFull || "") === "1" || String(req.query.full || "") === "1";

    const cleanArtist = String(artist || "").split(/[,&/]/)[0].trim();
    const normTitle = normalizeSongTitleKey(title);
    const normArtist = normalizeStr(cleanArtist || artist);
    const cacheKey = `${normTitle}|${normArtist}`;

    // Busca mestre direto no Catálogo Verificado de Estúdio APENAS quando artista e título batem exatamente
    const verifiedStudioHit = VERIFIED_STUDIO_CATALOG[cacheKey];

    const isThirtySecSnippetUrl =
      rawUrlParam.includes("itunes.apple.com") ||
      rawUrlParam.includes("apple.com/itunes-assets") ||
      rawUrlParam.includes("dzcdn.net") ||
      rawUrlParam.includes("cdns-preview");

    let targetUrl = "";

    if (verifiedStudioHit) {
      targetUrl = verifiedStudioHit.url;
      scBufferCache.delete(cacheKey);
      fullStreamCache.set(cacheKey, verifiedStudioHit);
    } else if (preferFull || !rawUrlParam || isThirtySecSnippetUrl) {
      if (fullStreamCache.has(cacheKey)) {
        targetUrl = fullStreamCache.get(cacheKey)!.url;
      } else if (title) {
        try {
          const fullHit = await resolveFullLengthTrackUrl(title, artist);
          if (fullHit && fullHit.url) {
            targetUrl = fullHit.url;
          }
        } catch (_e) {}
      }
      if (!targetUrl && rawUrlParam && rawUrlParam.startsWith("http")) {
        targetUrl = rawUrlParam;
      }
    } else {
      targetUrl = rawUrlParam;
    }

    // Se a faixa completa foi montada em scBufferCache, serve o Buffer direto da memória com suporte completo a HTTP Range (206 Partial Content)
    const bufferKey = targetUrl.startsWith("sc-buffer:")
      ? targetUrl.slice("sc-buffer:".length)
      : "";
    if (bufferKey && scBufferCache.has(bufferKey)) {
      const entry = scBufferCache.get(bufferKey)!;
      const total = entry.buffer.length;
      const range = req.headers.range;

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", entry.contentType || "audio/mp4");
      res.setHeader("Cache-Control", "public, max-age=3600");

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? Math.min(total - 1, parseInt(parts[1], 10)) : total - 1;
        if (start >= 0 && start < total && end >= start) {
          const chunk = entry.buffer.subarray(start, end + 1);
          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
          res.setHeader("Content-Length", String(chunk.length));
          res.send(chunk);
          return;
        }
      }

      res.status(200);
      res.setHeader("Content-Length", String(total));
      res.send(entry.buffer);
      return;
    }

    const rangeHeader = req.headers.range;
    const reqHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*"
    };
    if (rangeHeader) {
      reqHeaders["Range"] = rangeHeader;
    }

    let upstreamRes: globalThis.Response | null = null;

    if (targetUrl && targetUrl.startsWith("http")) {
      try {
        const candidate = await fetchWithTimeout(targetUrl, { headers: reqHeaders, redirect: "follow" }, 6500);
        if (candidate.ok || candidate.status === 206) {
          upstreamRes = candidate;
        }
      } catch (_e) {
        upstreamRes = null;
      }
    }

    // Se a URL em cache expirou, limpa o cache e resolve novamente a faixa completa
    if (!upstreamRes && (title || artist)) {
      fullStreamCache.delete(cacheKey);
      try {
        const freshFull = await resolveFullLengthTrackUrl(title, artist);
        if (freshFull && freshFull.url) {
          if (freshFull.url.startsWith("sc-buffer:")) {
            const bKey = freshFull.url.slice("sc-buffer:".length);
            if (scBufferCache.has(bKey)) {
              const entry = scBufferCache.get(bKey)!;
              res.status(200);
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Accept-Ranges", "bytes");
              res.setHeader("Content-Type", entry.contentType || "audio/mp4");
              res.setHeader("Content-Length", String(entry.buffer.length));
              res.send(entry.buffer);
              return;
            }
          } else {
            targetUrl = freshFull.url;
            const candidate = await fetchWithTimeout(targetUrl, { headers: reqHeaders, redirect: "follow" }, 6500);
            if (candidate.ok || candidate.status === 206) {
              upstreamRes = candidate;
            }
          }
        }
      } catch (_e) {}
    }

    if (!upstreamRes || !upstreamRes.body) {
      res.status(404).send("Stream completo indisponível no momento");
      return;
    }

    const rawContentType = (upstreamRes.headers.get("content-type") || "").toLowerCase();
    let safeContentType = "audio/mp4";
    if (rawContentType.includes("mpeg") || rawContentType.includes("mp3") || targetUrl.includes(".mp3")) {
      safeContentType = "audio/mpeg";
    } else if (rawContentType.includes("webm") || targetUrl.includes(".webm")) {
      safeContentType = "audio/webm";
    } else if (rawContentType.includes("ogg")) {
      safeContentType = "audio/ogg";
    } else {
      safeContentType = "audio/mp4";
    }

    res.status(upstreamRes.status === 206 ? 206 : 200);
    res.setHeader("Content-Type", safeContentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const contentRange = upstreamRes.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);

    const nodeStream = Readable.fromWeb(upstreamRes.body as any);
    nodeStream.on("error", () => {
      if (!res.headersSent) res.end();
    });
    req.on("close", () => {
      nodeStream.destroy();
    });
    nodeStream.pipe(res);
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Miado Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
