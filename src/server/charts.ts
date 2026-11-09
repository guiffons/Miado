/**
 * Real-Time Charts & New Releases Aggregator
 * Uses safeFetchBuffer and atomic chartsStore with 1-hour TTL and stale-while-revalidate caching.
 */

import { deduplicateCanonicalTracks, isCanonicalStudioTrack, normalizeCatalogText } from "./catalog.ts";
import { safeFetchBuffer } from "./net/safeFetch.ts";
import { ALLOWED_API_HOSTS } from "./net/allowlists.ts";
import { chartsStore, CHARTS_TTL_MS } from "./storage/chartsCache.ts";

export interface ChartTrackItem {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  albumTitle: string;
  albumId: string;
  duration: string;
  durationSec: number;
  coverUrl: string;
  streamUrl: string;
  rank: number;
  popular: boolean;
}

export interface ChartArtistItem {
  id: string;
  name: string;
  role: string;
  coverUrl: string;
  rank: number;
}

export interface ChartAlbumItem {
  id: string;
  dzAlbumId?: number | string;
  title: string;
  artist: string;
  year: number;
  releaseDate: string;
  genre: string;
  coverUrl: string;
  badges: string[];
}

export interface RealTimeChartsPayload {
  updatedAt: string;
  source: string;
  trendingBrazil: ChartTrackItem[];
  globalTop100: ChartTrackItem[];
  newReleases: ChartAlbumItem[];
  topArtists100: ChartArtistItem[];
}

let isRevalidating = false;
let lastForcedRefreshAt = 0;

function formatDurationSeconds(sec: number): string {
  const s = Math.max(0, Math.round(Number(sec) || 200));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? "0" : ""}${rem}`;
}

function buildFullStreamProxyUrl(title: string, artist: string): string {
  return `/api/stream?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&preferFull=1&studioOnly=1`;
}

async function fetchJsonSafe(url: string, timeoutMs = 4500): Promise<any> {
  try {
    const res = await safeFetchBuffer(url, {
      allowHosts: ALLOWED_API_HOSTS,
      timeoutMs,
      maxBytes: 2 * 1024 * 1024,
      headers: { Accept: "application/json" }
    });
    return JSON.parse(res.body.toString("utf8"));
  } catch {
    return null;
  }
}

function mapDeezerTrack(d: any, idx: number): ChartTrackItem | null {
  if (!d || !d.title || !d.artist?.name) return null;
  const durSec = Number(d.duration) || 205;
  if (!isCanonicalStudioTrack(d.title, d.artist.name, d.album?.title || "", durSec)) return null;
  const cover =
    d.album?.cover_xl ||
    d.album?.cover_big ||
    d.album?.cover_medium ||
    `/api/cover?title=${encodeURIComponent(d.title)}&artist=${encodeURIComponent(d.artist.name)}`;
  return {
    id: `dz_${d.id}`,
    title: String(d.title).trim(),
    artist: String(d.artist.name).trim(),
    artistId: d.artist?.id ? String(d.artist.id) : undefined,
    albumTitle: String(d.album?.title || "Single").trim(),
    albumId: d.album?.id ? `dz_alb_${d.album.id}` : `dz_alb_${d.id}`,
    duration: formatDurationSeconds(durSec),
    durationSec: durSec,
    coverUrl: cover,
    streamUrl: buildFullStreamProxyUrl(d.title, d.artist.name),
    rank: idx + 1,
    popular: idx < 15
  };
}

const GLOBAL_FALLBACK_TRACKS: Array<{ title: string; artist: string; albumTitle: string; duration: string; durationSec: number }> = [
  { title: "Die With A Smile", artist: "Lady Gaga & Bruno Mars", albumTitle: "MAYHEM", duration: "4:11", durationSec: 251 },
  { title: "BIRDS OF A FEATHER", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", duration: "3:30", durationSec: 210 },
  { title: "Espresso", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", duration: "2:55", durationSec: 175 },
  { title: "APT.", artist: "ROSÉ & Bruno Mars", albumTitle: "rosie", duration: "2:49", durationSec: 169 },
  { title: "Luther", artist: "Kendrick Lamar & SZA", albumTitle: "GNX", duration: "2:57", durationSec: 177 },
  { title: "Timeless", artist: "The Weeknd & Playboi Carti", albumTitle: "Hurry Up Tomorrow", duration: "4:16", durationSec: 256 },
  { title: "Abracadabra", artist: "Lady Gaga", albumTitle: "MAYHEM", duration: "3:43", durationSec: 223 },
  { title: "Good Luck, Babe!", artist: "Chappell Roan", albumTitle: "Good Luck, Babe!", duration: "3:38", durationSec: 218 },
  { title: "Taste", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", duration: "2:37", durationSec: 157 },
  { title: "WILDFLOWER", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", duration: "4:21", durationSec: 261 },
  { title: "Not Like Us", artist: "Kendrick Lamar", albumTitle: "Not Like Us", duration: "4:34", durationSec: 274 },
  { title: "Please Please Please", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", duration: "3:06", durationSec: 186 },
  { title: "CHIHIRO", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", duration: "5:03", durationSec: 303 },
  { title: "Cry For Me", artist: "The Weeknd", albumTitle: "Hurry Up Tomorrow", duration: "3:44", durationSec: 224 },
  { title: "Beautiful Things", artist: "Benson Boone", albumTitle: "Fireworks & Rollerblades", duration: "3:00", durationSec: 180 },
  { title: "Lose Control", artist: "Teddy Swims", albumTitle: "I've Tried Everything But Therapy", duration: "3:30", durationSec: 210 },
  { title: "L'AMOUR DE MA VIE", artist: "Billie Eilish", albumTitle: "HIT ME HARD AND SOFT", duration: "5:33", durationSec: 333 },
  { title: "Too Sweet", artist: "Hozier", albumTitle: "Unheard", duration: "4:11", durationSec: 251 },
  { title: "Fortnight", artist: "Taylor Swift", albumTitle: "THE TORTURED POETS DEPARTMENT", duration: "3:48", durationSec: 228 },
  { title: "Bed Chem", artist: "Sabrina Carpenter", albumTitle: "Short n' Sweet", duration: "2:51", durationSec: 171 },
  { title: "Disease", artist: "Lady Gaga", albumTitle: "MAYHEM", duration: "3:49", durationSec: 229 },
  { title: "Blinding Lights", artist: "The Weeknd", albumTitle: "After Hours", duration: "3:20", durationSec: 200 },
  { title: "Cruel Summer", artist: "Taylor Swift", albumTitle: "Lover", duration: "2:58", durationSec: 178 },
  { title: "Saturn", artist: "SZA", albumTitle: "LANA", duration: "3:06", durationSec: 186 }
];

function buildGlobalFallbackTracks(): ChartTrackItem[] {
  return GLOBAL_FALLBACK_TRACKS.map((t, idx) => ({
    id: `glb_hit_${idx + 1}`,
    title: t.title,
    artist: t.artist,
    albumTitle: t.albumTitle,
    albumId: `glb_alb_${idx + 1}`,
    duration: t.duration,
    durationSec: t.durationSec,
    coverUrl: `/api/cover?title=${encodeURIComponent(t.title)}&artist=${encodeURIComponent(t.artist)}`,
    streamUrl: buildFullStreamProxyUrl(t.title, t.artist),
    rank: idx + 1,
    popular: idx < 15
  }));
}

function mapItunesRssEntry(entry: any, idx: number, prefix: string): ChartTrackItem | null {
  const title = entry?.["im:name"]?.label;
  const artist = entry?.["im:artist"]?.label;
  if (!title || !artist) return null;
  const albumTitle = entry?.["im:collection"]?.["im:name"]?.label || "Single";
  if (!isCanonicalStudioTrack(title, artist, albumTitle, 205)) return null;
  const images = Array.isArray(entry?.["im:image"]) ? entry["im:image"] : [];
  const lastImg = images.length > 0 ? images[images.length - 1]?.label : "";
  const cover = lastImg
    ? String(lastImg).replace(/\d+x\d+bb\.(png|jpg)/i, "1000x1000bb.jpg")
    : `/api/cover?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
  const rawId = entry?.id?.attributes?.["im:id"] || `${idx + 1}`;
  return {
    id: `${prefix}_${rawId}`,
    title: String(title).trim(),
    artist: String(artist).trim(),
    albumTitle: String(albumTitle).trim(),
    albumId: `${prefix}_alb_${rawId}`,
    duration: "3:25",
    durationSec: 205,
    coverUrl: cover,
    streamUrl: buildFullStreamProxyUrl(title, artist),
    rank: idx + 1,
    popular: idx < 15
  };
}

function normalizeArtistDistinctKey(name: string): string {
  const nfc = String(name || "").normalize("NFC").trim().toLowerCase();
  if (nfc === "rosé") return "rosé_kr";
  if (nfc === "rose") return "rose_fr";
  return normalizeCatalogText(name);
}

function resolveCanonicalArtistChartEntry(
  rawName: string,
  rawId?: string | number,
  rawPic?: string
): { id: string; name: string; coverUrl: string } {
  const nfc = String(rawName || "").normalize("NFC").trim();
  const lower = nfc.toLowerCase();
  if (lower === "rosé" || String(rawId || "") === "126335112") {
    const roseKrPic = "https://cdn-images.dzcdn.net/images/artist/eefd9b0fc6d1cb51405e29009c0e44c0/1000x1000-000000-80-0-0.jpg";
    return {
      id: "dz_art_126335112",
      name: "ROSÉ",
      coverUrl: `/api/artist-image?name=${encodeURIComponent("ROSÉ")}&url=${encodeURIComponent(roseKrPic)}`
    };
  }
  const safePic =
    rawPic && !String(rawPic).includes("3acf41d6308b7e44fdbbe929d3ef0aef")
      ? String(rawPic)
      : "";
  return {
    id: rawId ? `dz_art_${rawId}` : `art_${normalizeArtistDistinctKey(nfc).replace(/\s+/g, "_")}`,
    name: nfc,
    coverUrl: safePic
      ? `/api/artist-image?name=${encodeURIComponent(nfc)}&url=${encodeURIComponent(safePic)}`
      : `/api/artist-image?name=${encodeURIComponent(nfc)}`
  };
}

async function fetchFreshCharts(): Promise<RealTimeChartsPayload> {
  const [
    dzGlobalChart,
    dzBrazilPlaylist,
    dzGlobalTopPlaylist,
    dzEditorialReleases,
    appleGlobalSongs,
    appleBrSongs,
    itunesGlobalRss,
    itunesBrRss
  ] = await Promise.all([
    fetchJsonSafe("https://api.deezer.com/chart/0?limit=100", 6000),
    fetchJsonSafe("https://api.deezer.com/playlist/1111141961/tracks?limit=60", 6000),
    fetchJsonSafe("https://api.deezer.com/playlist/3155776842/tracks?limit=100", 6000),
    fetchJsonSafe("https://api.deezer.com/editorial/0/releases?limit=30", 6000),
    fetchJsonSafe("https://rss.marketingtools.apple.com/api/v2/us/music/most-played/25/songs.json", 5500),
    fetchJsonSafe("https://rss.marketingtools.apple.com/api/v2/br/music/most-played/25/songs.json", 5500),
    fetchJsonSafe("https://itunes.apple.com/us/rss/topsongs/limit=50/json", 6000),
    fetchJsonSafe("https://itunes.apple.com/br/rss/topsongs/limit=50/json", 6000)
  ]);

  const brRaw: ChartTrackItem[] = [];
  if (Array.isArray(dzBrazilPlaylist?.data)) {
    for (let i = 0; i < dzBrazilPlaylist.data.length; i++) {
      const mapped = mapDeezerTrack(dzBrazilPlaylist.data[i], i);
      if (mapped) brRaw.push(mapped);
    }
  }
  if (Array.isArray(appleBrSongs?.feed?.results)) {
    appleBrSongs.feed.results.forEach((item: any, idx: number) => {
      if (!item?.name || !item?.artistName) return;
      if (!isCanonicalStudioTrack(item.name, item.artistName, "", 200)) return;
      const cover = item.artworkUrl100
        ? String(item.artworkUrl100).replace(/100x100bb|200x200bb/g, "1000x1000bb")
        : `/api/cover?title=${encodeURIComponent(item.name)}&artist=${encodeURIComponent(item.artistName)}`;
      brRaw.push({
        id: `ap_br_${item.id || idx}`,
        title: item.name,
        artist: item.artistName,
        albumTitle: item.Name || "Top Brasil",
        albumId: `ap_alb_${item.id || idx}`,
        duration: "3:20",
        durationSec: 200,
        coverUrl: cover,
        streamUrl: buildFullStreamProxyUrl(item.name, item.artistName),
        rank: brRaw.length + 1,
        popular: idx < 10
      });
    });
  }
  if (Array.isArray(itunesBrRss?.feed?.entry)) {
    itunesBrRss.feed.entry.forEach((entry: any, idx: number) => {
      const mapped = mapItunesRssEntry(entry, idx, "it_br");
      if (mapped) brRaw.push(mapped);
    });
  }
  const trendingBrazil = deduplicateCanonicalTracks(brRaw).slice(0, 60);

  const globalRaw: ChartTrackItem[] = [];
  const globalChartTracks = dzGlobalChart?.tracks?.data || [];
  const globalPlaylistTracks = dzGlobalTopPlaylist?.data || [];
  for (const item of [...globalChartTracks, ...globalPlaylistTracks]) {
    const mapped = mapDeezerTrack(item, globalRaw.length);
    if (mapped) globalRaw.push(mapped);
  }
  if (Array.isArray(appleGlobalSongs?.feed?.results)) {
    appleGlobalSongs.feed.results.forEach((item: any, idx: number) => {
      if (!item?.name || !item?.artistName) return;
      if (!isCanonicalStudioTrack(item.name, item.artistName, "", 200)) return;
      const cover = item.artworkUrl100
        ? String(item.artworkUrl100).replace(/100x100bb|200x200bb/g, "1000x1000bb")
        : `/api/cover?title=${encodeURIComponent(item.name)}&artist=${encodeURIComponent(item.artistName)}`;
      globalRaw.push({
        id: `ap_glb_${item.id || idx}`,
        title: item.name,
        artist: item.artistName,
        albumTitle: item.Name || "Global Top Hits",
        albumId: `ap_glb_alb_${item.id || idx}`,
        duration: "3:20",
        durationSec: 200,
        coverUrl: cover,
        streamUrl: buildFullStreamProxyUrl(item.name, item.artistName),
        rank: globalRaw.length + 1,
        popular: idx < 15
      });
    });
  }
  if (Array.isArray(itunesGlobalRss?.feed?.entry)) {
    itunesGlobalRss.feed.entry.forEach((entry: any, idx: number) => {
      const mapped = mapItunesRssEntry(entry, idx, "it_glb");
      if (mapped) globalRaw.push(mapped);
    });
  }

  // Only use fallback tracks if ALL live global and Brazil sources failed
  if (globalRaw.length === 0 && trendingBrazil.length === 0) {
    globalRaw.push(...buildGlobalFallbackTracks());
  } else if (globalRaw.length < 15 && trendingBrazil.length > 0) {
    globalRaw.push(...trendingBrazil.slice(0, 30));
  }
  const globalTop100 = deduplicateCanonicalTracks(globalRaw).slice(0, 100);

  const newReleases: ChartAlbumItem[] = [];
  const seenAlbKeys = new Set<string>();
  const rawAlbums = [
    ...(Array.isArray(dzEditorialReleases?.data) ? dzEditorialReleases.data : []),
    ...(Array.isArray(dzGlobalChart?.albums?.data) ? dzGlobalChart.albums.data : [])
  ];
  for (const alb of rawAlbums) {
    if (!alb?.title || !alb?.artist?.name) continue;
    if (!isCanonicalStudioTrack(alb.title, alb.artist.name, alb.title, 200)) continue;
    const key = `${normalizeCatalogText(alb.title)}::${normalizeArtistDistinctKey(alb.artist.name)}`;
    if (seenAlbKeys.has(key)) continue;
    seenAlbKeys.add(key);
    const year = alb.release_date ? Number(String(alb.release_date).slice(0, 4)) || 2026 : 2026;
    newReleases.push({
      id: `dz_alb_${alb.id}`,
      dzAlbumId: alb.id,
      title: alb.title,
      artist: alb.artist.name,
      year,
      releaseDate: alb.release_date || "Recente",
      genre: "Oficial",
      coverUrl:
        alb.cover_xl ||
        alb.cover_big ||
        `/api/cover?title=${encodeURIComponent(alb.title)}&artist=${encodeURIComponent(alb.artist.name)}`,
      badges: ["Lossless", "Master", "Novo"]
    });
  }

  const topArtists100: ChartArtistItem[] = [];
  const seenArtists = new Set<string>();
  const rawArtists = Array.isArray(dzGlobalChart?.artists?.data) ? dzGlobalChart.artists.data : [];
  for (const art of rawArtists) {
    if (!art?.name) continue;
    const norm = normalizeArtistDistinctKey(art.name);
    if (!norm || seenArtists.has(norm)) continue;
    seenArtists.add(norm);
    const resolved = resolveCanonicalArtistChartEntry(
      art.name,
      art.id,
      art.picture_xl || art.picture_big || ""
    );
    topArtists100.push({
      id: resolved.id,
      name: resolved.name,
      role: `Top #${topArtists100.length + 1} Global`,
      coverUrl: resolved.coverUrl,
      rank: topArtists100.length + 1
    });
  }

  for (const tr of [...globalTop100, ...trendingBrazil]) {
    if (topArtists100.length >= 100) break;
    const primaryName = String(tr.artist || "")
      .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b)\s*/i)[0]
      .trim();
    const norm = normalizeArtistDistinctKey(primaryName);
    if (!norm || seenArtists.has(norm)) continue;
    seenArtists.add(norm);
    const resolved = resolveCanonicalArtistChartEntry(primaryName, tr.artistId);
    topArtists100.push({
      id: resolved.id,
      name: resolved.name,
      role: `Em Alta - #${topArtists100.length + 1}`,
      coverUrl: resolved.coverUrl,
      rank: topArtists100.length + 1
    });
  }

  return {
    updatedAt: new Date().toISOString(),
    source: "Live Charts",
    trendingBrazil,
    globalTop100,
    newReleases: newReleases.slice(0, 30),
    topArtists100: topArtists100.slice(0, 100)
  };
}

function isPayloadContaminatedWithFallback(payload?: RealTimeChartsPayload | null): boolean {
  if (!payload) return true;
  const g = payload.globalTop100;
  if (!Array.isArray(g) || g.length < 10) return true;
  if (g.slice(0, 10).some((t) => String(t?.id || "").startsWith("glb_hit_"))) return true;
  if (
    g[0]?.title === "Die With A Smile" &&
    g[1]?.title === "BIRDS OF A FEATHER" &&
    g[2]?.title === "Espresso"
  ) {
    return true;
  }
  if (!Array.isArray(payload.topArtists100) || payload.topArtists100.length < 15) return true;
  return false;
}

export async function getRealTimeCharts(forceRefresh = false): Promise<RealTimeChartsPayload> {
  const now = Date.now();
  const state = chartsStore.get();
  const cached = state.entry;

  const canForce = forceRefresh && now - lastForcedRefreshAt >= 15_000;
  if (canForce) {
    lastForcedRefreshAt = now;
  }

  const isFresh = Boolean(cached && now < cached.expiresAt);
  const isContaminated = isPayloadContaminatedWithFallback(cached?.payload);

  if (cached && isFresh && !canForce && !isContaminated) {
    return cached.payload;
  }

  // If expired, forced, or contaminated with 2025 fallback tracks, fetch live charts synchronously
  if (!isRevalidating) {
    isRevalidating = true;
    try {
      const fresh = await fetchFreshCharts();
      const freshContaminated = isPayloadContaminatedWithFallback(fresh);
      if (
        (fresh.globalTop100.length > 0 || fresh.trendingBrazil.length > 0) &&
        (!freshContaminated || !cached || isContaminated)
      ) {
        await chartsStore
          .update((draft) => {
            draft.entry = {
              payload: fresh,
              fetchedAt: now,
              expiresAt: now + CHARTS_TTL_MS
            };
          })
          .catch(() => {});
        return fresh;
      }
    } catch {
      // fall through to cached if available
    } finally {
      isRevalidating = false;
    }
  }

  if (cached?.payload) {
    return cached.payload;
  }

  return await fetchFreshCharts();
}
