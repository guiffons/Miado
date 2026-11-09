/**
 * Canonical Catalog Models, Normalization, Multi-Artist Deduplication & Studio Filtering (Fase 4)
 * Guarantees:
 * - Never collapses collaborations with .split(/[,&/]/)[0]
 * - Preserves all credited artists (artistIds[] & artists[]) including (feat. ...) in title
 * - Never blocks legitimate studio titles like "O Show" (Yung Lixo), "Interlude", "Skit", "Tour", "MC", "Carnaval"
 * - Rejects 30-second preview URLs at the catalog level
 */

export interface ArtistCredit {
  id: string;
  name: string;
  role: "primary" | "featured";
}

export interface CanonicalTrack {
  id: string;
  title: string;
  artist: string;
  artistIds: string[];
  artists: ArtistCredit[];
  albumTitle: string;
  albumId: string;
  duration: string;
  durationSec: number;
  isrc?: string;
  coverUrl: string;
  streamUrl: string;
  popular?: boolean;
  explicit?: boolean;
  year?: number;
  genre?: string;
}

export interface CanonicalAlbum {
  id: string;
  dzAlbumId?: number | string;
  collectionId?: number | string;
  title: string;
  artist: string;
  artistId?: string;
  artistIds: string[];
  recordType: "album" | "ep" | "single" | "appears_on";
  year: number;
  releaseDate: string;
  coverUrl: string;
  tracks: CanonicalTrack[];
}

const KNOWN_ARTIST_ALIASES: Record<string, string[]> = {
  "yung lixo": ["yung lixo", "yun li", "gemaplys", "mc vv", "tokyo marui"],
  "yun li": ["yung lixo", "yun li", "gemaplys", "mc vv", "tokyo marui"],
  "bruno marrone": ["bruno marrone", "bruno e marrone", "bruno and marrone", "bruno morrene", "bruno e morrene"],
  "bruno e marrone": ["bruno marrone", "bruno e marrone", "bruno and marrone", "bruno morrene", "bruno e morrene"],
  "bruno and marrone": ["bruno marrone", "bruno e marrone", "bruno and marrone", "bruno morrene", "bruno e morrene"],
  "bruno morrene": ["bruno marrone", "bruno e marrone", "bruno and marrone", "bruno morrene", "bruno e morrene"],
  "bruno e morrene": ["bruno marrone", "bruno e marrone", "bruno and marrone", "bruno morrene", "bruno e morrene"],
  "jorge mateus": ["jorge mateus", "jorge e mateus"],
  "jorge e mateus": ["jorge mateus", "jorge e mateus"],
  "henrique juliano": ["henrique juliano", "henrique e juliano"],
  "henrique e juliano": ["henrique juliano", "henrique e juliano"],
  "zeze di camargo luciano": ["zeze di camargo luciano", "zeze di camargo e luciano"],
  "zeze di camargo e luciano": ["zeze di camargo luciano", "zeze di camargo e luciano"],
  "chitaozinho xororo": ["chitaozinho xororo", "chitaozinho e xororo"],
  "chitaozinho e xororo": ["chitaozinho xororo", "chitaozinho e xororo"],
  "maiara maraisa": ["maiara maraisa", "maiara e maraisa"],
  "maiara e maraisa": ["maiara maraisa", "maiara e maraisa"],
  "ze neto cristiano": ["ze neto cristiano", "ze neto e cristiano"],
  "ze neto e cristiano": ["ze neto cristiano", "ze neto e cristiano"],
  "matheus kauan": ["matheus kauan", "matheus e kauan"],
  "matheus e kauan": ["matheus kauan", "matheus e kauan"],
  "simone simaria": ["simone simaria", "simone e simaria"],
  "simone e simaria": ["simone simaria", "simone e simaria"],
  "victor leo": ["victor leo", "victor e leo"],
  "victor e leo": ["victor leo", "victor e leo"]
};

const LIVE_ACOUSTIC_CATALOG_ARTIST_KEYS = new Set<string>([
  "bruno marrone",
  "bruno e marrone",
  "bruno and marrone",
  "bruno morrene",
  "bruno e morrene",
  "jorge mateus",
  "jorge e mateus",
  "henrique juliano",
  "henrique e juliano",
  "marilia mendonca",
  "zeze di camargo luciano",
  "zeze di camargo e luciano",
  "chitaozinho xororo",
  "chitaozinho e xororo",
  "gusttavo lima",
  "maiara maraisa",
  "maiara e maraisa",
  "ze neto cristiano",
  "ze neto e cristiano",
  "matheus kauan",
  "matheus e kauan",
  "luan santana",
  "simone simaria",
  "simone e simaria",
  "simone mendes",
  "victor leo",
  "victor e leo",
  "ana castela",
  "diego victor hugo",
  "diego e victor hugo",
  "hugo guilherme",
  "hugo e guilherme",
  "guilherme benuto",
  "guilherme e benuto",
  "israel rodolffo",
  "israel e rodolffo",
  "clayton romario",
  "clayton e romario",
  "fernando sorocaba",
  "fernando e sorocaba",
  "cesar menotti fabiano",
  "cesar menotti e fabiano",
  "marcos belutti",
  "marcos e belutti",
  "joao bosco vinicius",
  "joao bosco e vinicius",
  "edson hudson",
  "edson e hudson",
  "rick renner",
  "rick e renner"
]);

export function isLiveAcousticCatalogArtist(artistOrText: string): boolean {
  const norm = normalizeCatalogText(artistOrText);
  if (!norm) return false;
  if (LIVE_ACOUSTIC_CATALOG_ARTIST_KEYS.has(norm)) return true;
  for (const key of LIVE_ACOUSTIC_CATALOG_ARTIST_KEYS) {
    if (norm === key || norm.startsWith(`${key} `) || norm.endsWith(` ${key}`) || norm.includes(` ${key} `)) {
      return true;
    }
  }
  return false;
}

export function normalizeCatalogText(str: string): string {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractAllArtistNames(
  artistField: string,
  contributorsOrTitle?: Array<{ name?: string }> | string,
  optionalTitle?: string
): string[] {
  const names = new Set<string>();
  const splitAndAdd = (raw: string) => {
    const parts = String(raw || "")
      .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bx\b|\/|;)\s*/i)
      .map((p) => normalizeCatalogText(p))
      .filter(Boolean);
    for (const p of parts) {
      names.add(p);
    }
  };

  if (Array.isArray(contributorsOrTitle)) {
    for (const c of contributorsOrTitle) {
      splitAndAdd(c?.name || "");
    }
  }

  splitAndAdd(artistField || "");

  const titleStr = typeof contributorsOrTitle === "string" ? contributorsOrTitle : optionalTitle || "";
  if (titleStr) {
    const featRegex = /[\(\[]\s*(?:feat\.?|ft\.?|with|part\.?)\s+([^\)\]]+)[\)\]]/gi;
    let match: RegExpExecArray | null;
    while ((match = featRegex.exec(titleStr)) !== null) {
      if (match[1]) {
        splitAndAdd(match[1]);
      }
    }
  }

  return Array.from(names).sort();
}

export function buildCanonicalDedupKey(track: {
  isrc?: string;
  title?: string;
  artist?: string;
  artists?: Array<{ name?: string }>;
  albumTitle?: string;
}): string {
  if (track.isrc && String(track.isrc).trim().length >= 8) {
    return `isrc:${String(track.isrc).trim().toUpperCase()}`;
  }
  const cleanTitle = normalizeCatalogText(
    String(track.title || "")
      .replace(/\s*[\(\[]\s*(?:feat\.?|ft\.?|with|part\.?)\s+[^\)\]]+[\)\]]/gi, "")
      .replace(/\s*[\(\[]\s*[^\)\]]*\b(?:explicit|clean|deluxe|remaster(?:ed)?|bonus(?:\s+track)?|album\s+version|single\s+version|radio\s+edit|anniversary|edition|ao\s*vivo|ac[uú]stico|acoustic|live)\b[^\)\]]*[\)\]]/gi, "")
      .replace(/\s*-\s*(?:\d{4}\s+)?(?:remaster(?:ed)?|deluxe|bonus track|explicit|clean|single version|radio edit|ao\s*vivo|ac[uú]stico|live).*$/i, "")
  );
  const artistSet = extractAllArtistNames(track.artist || "", track.artists, track.title || "");
  return `meta:${cleanTitle}::${artistSet.join("+")}`;
}

/**
 * Contextual Studio Recording Filter:
 * Rejects genuine non-original / live concert bootlegs / karaoke / tribute / sped-up / 8D versions,
 * while NEVER rejecting legitimate studio songs whose titles contain words like "O Show", "Tour",
 * "Interlude", "Skit", "Carnaval", "MC", or "Ensaio".
 */
const STRICT_NON_STUDIO_PATTERNS: RegExp[] = [
  /\b(?:live\s+(?:at|from|in|on|session|version|performance)|ao\s+vivo\s+(?:em|no|na)|en\s+vivo)\b/i,
  /[\(\[\-]\s*(?:live|ao\s*vivo|ac[uú]stico|acoustic|unplugged|karaok[eê]|instrumental|acapella|a\s*cappella)\b/i,
  /\b(?:karaok[eê]|tribute\s+to|originally\s+performed\s+by|in\s+the\s+style\s+of|cover\s+version|8-bit\s+version|lullaby\s+version)\b/i,
  /\b(?:sped\s*up|speed\s*up|slowed(?:\s*(?:&|and)\s*reverb)?|nightcore|8d\s+audio|chopped\s+and\s+screwed)\b/i,
  /[\(\[\-]\s*(?:[^\)\]]*\bremix\b|rework|bootleg|mashup|extended\s+mix|club\s+mix)\b/i
];

const LIVE_CATALOG_REJECT_PATTERNS: RegExp[] = [
  /[\(\[\-]\s*(?:karaok[eê]|instrumental|acapella|a\s*cappella)\b/i,
  /\b(?:karaok[eê]|tribute\s+to|originally\s+performed\s+by|in\s+the\s+style\s+of|made\s+popular\s+by|no\s+estilo\s+de|cover\s+version|8-bit\s+version|lullaby\s+version)\b/i,
  /\b(?:sped\s*up|speed\s*up|slowed(?:\s*(?:&|and)\s*reverb)?|nightcore|8d\s+audio|chopped\s+and\s+screwed)\b/i,
  /[\(\[\-]\s*(?:[^\)\]]*\bremix\b|rework|bootleg|mashup|extended\s+mix|club\s+mix)\b/i
];

const NON_STUDIO_ARTIST_PATTERNS: RegExp[] = [
  /\b(?:karaoke|tribute|cover\s+band|8-bit\s+arcade|twinkle\s+twinkle\s+little\s+rock\s+star|rockabye\s+baby|piano\s+tribute|vitamin\s+string\s+quartet|kidz\s+bop|party\s+tyme|ameritz)\b/i
];

export function isCanonicalStudioTrack(
  title: string,
  artist: string,
  albumTitle = "",
  durationSec = 180
): boolean {
  const t = String(title || "").trim();
  const a = String(artist || "").trim();
  const alb = String(albumTitle || "").trim();
  if (!t || !a) return false;

  for (const pat of NON_STUDIO_ARTIST_PATTERNS) {
    if (pat.test(a)) return false;
  }

  const patternsToApply =
    isLiveAcousticCatalogArtist(a) || isLiveAcousticCatalogArtist(alb)
      ? LIVE_CATALOG_REJECT_PATTERNS
      : STRICT_NON_STUDIO_PATTERNS;

  for (const pat of patternsToApply) {
    if (pat.test(t) || pat.test(alb)) return false;
  }

  if (durationSec > 0 && (durationSec < 35 || durationSec > 900)) {
    return false;
  }

  return true;
}

export function isForbidden30sPreviewUrl(url: string): boolean {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return false;
  return (
    u.includes("audiopreview") ||
    u.includes("itunes-assets") ||
    u.includes("mzaf_") ||
    u.includes(".plus.aac.p.m4a") ||
    u.includes("cdns-preview") ||
    u.includes("dzcdn.net/stream") ||
    u.includes("cf-preview-media.sndcdn.com") ||
    u.includes("/preview/") ||
    /[\/?&=_-]preview[\/?&=_-]|\/preview$|\bpreview=/i.test(u)
  );
}

export function deduplicateCanonicalTracks<T extends {
  id?: string | number;
  isrc?: string;
  title?: string;
  artist?: string;
  artistIds?: string[];
  artists?: Array<{ name?: string }>;
  albumTitle?: string;
  durationSec?: number;
  previewUrl?: string;
  streamUrl?: string;
  rawPreviewUrl?: string;
}>(tracks: T[]): Array<T & { artistIds?: string[] }> {
  if (!Array.isArray(tracks)) return [];
  const seen = new Map<string, T & { artistIds?: string[] }>();
  for (const tr of tracks) {
    if (!tr || !tr.title) continue;
    const dur = Number(tr.durationSec) || 180;
    if (!isCanonicalStudioTrack(tr.title, tr.artist || "", tr.albumTitle || "", dur)) {
      continue;
    }
    const sanitized = { ...tr };
    const safeStream = `/api/stream?title=${encodeURIComponent(sanitized.title || "")}&artist=${encodeURIComponent(sanitized.artist || "")}&preferFull=1&studioOnly=1`;
    if (!sanitized.streamUrl || isForbidden30sPreviewUrl(sanitized.streamUrl)) {
      sanitized.streamUrl = safeStream;
    }
    if (!sanitized.previewUrl || isForbidden30sPreviewUrl(sanitized.previewUrl)) {
      sanitized.previewUrl = sanitized.streamUrl;
    }
    delete sanitized.rawPreviewUrl;
    if (!Array.isArray(sanitized.artistIds) || sanitized.artistIds.length === 0) {
      sanitized.artistIds = extractAllArtistNames(sanitized.artist || "", sanitized.artists, sanitized.title || "");
    }

    const key = buildCanonicalDedupKey(sanitized);
    if (!seen.has(key)) {
      seen.set(key, sanitized);
    } else {
      const existing = seen.get(key)!;
      const existingHasParens = /[\(\[]/.test(String(existing.title || ""));
      const candidateHasParens = /[\(\[]/.test(String(sanitized.title || ""));
      if ((sanitized.isrc && !existing.isrc) || (existingHasParens && !candidateHasParens)) {
        seen.set(key, sanitized);
      }
    }
  }
  return Array.from(seen.values());
}

/**
 * Checks whether a track or album genuinely belongs to the target artist
 * (either by exact Deezer artist ID, normalized exact artist name in credits, or known alias),
 * preventing homonyms or unrelated tracks containing the artist's name in their title.
 */
export function belongsToTargetArtist(
  item: {
    artistId?: string | number;
    artistIds?: Array<string | number>;
    artist?: string;
    artists?: Array<{ id?: string | number; name?: string }>;
  },
  targetArtistName: string,
  targetArtistId?: string | number
): { matches: boolean; role: "primary" | "featured" | "none" } {
  const targetNorm = normalizeCatalogText(targetArtistName);
  const targetIdStr = targetArtistId ? String(targetArtistId) : "";

  if (targetIdStr) {
    if (item.artistId && String(item.artistId) === targetIdStr) {
      return { matches: true, role: "primary" };
    }
    if (Array.isArray(item.artists) && item.artists.length > 0) {
      const idx = item.artists.findIndex((a) => String(a.id || "") === targetIdStr);
      if (idx === 0) return { matches: true, role: "primary" };
      if (idx > 0) return { matches: true, role: "featured" };
    }
  }

  const allowedNames = new Set<string>([targetNorm, ...(KNOWN_ARTIST_ALIASES[targetNorm] || [])]);
  const creditedNames = extractAllArtistNames(item.artist || "", item.artists);
  const hasMatch = creditedNames.some((c) => allowedNames.has(c));
  if (!hasMatch) {
    return { matches: false, role: "none" };
  }

  const primaryRaw = normalizeCatalogText(String(item.artist || "").split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b)\s*/i)[0]);
  return {
    matches: true,
    role: allowedNames.has(primaryRaw) ? "primary" : "featured"
  };
}
