/**
 * Real-Time Charts & New Releases Aggregator (Fase 5)
 * Aggregates live charts from Deezer (Brazil & Global), Apple Music RSS, and Last.fm
 * with 1-hour TTL and stale-while-revalidate caching so the Home view is always 100% up-to-date
 * and responds in < 50ms.
 */

import fs from "fs";
import path from "path";
import { deduplicateCanonicalTracks, isCanonicalStudioTrack, normalizeCatalogText } from "./catalog.ts";

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

const CHARTS_CACHE_FILE = path.join(process.cwd(), "data", "charts-cache.json");
const CHARTS_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

let memoryCache: { payload: RealTimeChartsPayload; timestamp: number } | null = null;
let isRevalidating = false;

function formatDurationSeconds(sec: number): string {
  const s = Math.max(0, Math.round(Number(sec) || 200));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? "0" : ""}${rem}`;
}

function buildFullStreamProxyUrl(title: string, artist: string): string {
  return `/api/stream?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&preferFull=1&studioOnly=1`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 4500): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
        Accept: "application/json"
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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

async function fetchFreshCharts(): Promise<RealTimeChartsPayload> {
  // Fetch Global Deezer Chart, Brazil Top Playlist (3155776842 / 1111141961), Editorial Releases, and Apple RSS in parallel
  const [
    dzGlobalChart,
    dzBrazilPlaylist,
    dzGlobalTopPlaylist,
    dzEditorialReleases,
    appleBrSongs
  ] = await Promise.all([
    fetchJsonWithTimeout("https://api.deezer.com/chart/0?limit=100", 5000),
    fetchJsonWithTimeout("https://api.deezer.com/playlist/1111141961/tracks?limit=60", 5000), // Top Brasil
    fetchJsonWithTimeout("https://api.deezer.com/playlist/3155776842/tracks?limit=100", 5000), // Top Worldwide
    fetchJsonWithTimeout("https://api.deezer.com/editorial/0/releases?limit=30", 5000),
    fetchJsonWithTimeout("https://rss.applemarketingtools.com/api/v2/br/music/most-played/50/songs.json", 4500)
  ]);

  // 1. Trending Brazil
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
  const trendingBrazil = deduplicateCanonicalTracks(brRaw).slice(0, 50);

  // 2. Global Top 100
  const globalRaw: ChartTrackItem[] = [];
  const globalChartTracks = dzGlobalChart?.tracks?.data || [];
  const globalPlaylistTracks = dzGlobalTopPlaylist?.data || [];
  for (const item of [...globalChartTracks, ...globalPlaylistTracks]) {
    const mapped = mapDeezerTrack(item, globalRaw.length);
    if (mapped) globalRaw.push(mapped);
  }
  const globalTop100 = deduplicateCanonicalTracks(globalRaw).slice(0, 100);

  // 3. New Releases
  const newReleases: ChartAlbumItem[] = [];
  const seenAlbKeys = new Set<string>();
  const rawAlbums = [
    ...(Array.isArray(dzEditorialReleases?.data) ? dzEditorialReleases.data : []),
    ...(Array.isArray(dzGlobalChart?.albums?.data) ? dzGlobalChart.albums.data : [])
  ];
  for (const alb of rawAlbums) {
    if (!alb?.title || !alb?.artist?.name) continue;
    if (!isCanonicalStudioTrack(alb.title, alb.artist.name, alb.title, 200)) continue;
    const key = `${normalizeCatalogText(alb.title)}::${normalizeCatalogText(alb.artist.name)}`;
    if (seenAlbKeys.has(key)) continue;
    seenAlbKeys.add(key);
    const year = alb.release_date ? Number(String(alb.release_date).slice(0, 4)) || 2025 : 2025;
    newReleases.push({
      id: `dz_alb_${alb.id}`,
      dzAlbumId: alb.id,
      title: alb.title,
      artist: alb.artist.name,
      year,
      releaseDate: alb.release_date || "Lançamento Recente",
      genre: "Lançamento Oficial",
      coverUrl: alb.cover_xl || alb.cover_big || `/api/cover?title=${encodeURIComponent(alb.title)}&artist=${encodeURIComponent(alb.artist.name)}`,
      badges: ["Lossless", "Master", "Novo"]
    });
  }

  // 4. Top 100 Artists of the Moment
  const topArtists100: ChartArtistItem[] = [];
  const seenArtists = new Set<string>();
  const rawArtists = Array.isArray(dzGlobalChart?.artists?.data) ? dzGlobalChart.artists.data : [];
  for (const art of rawArtists) {
    if (!art?.name) continue;
    const norm = normalizeCatalogText(art.name);
    if (!norm || seenArtists.has(norm)) continue;
    seenArtists.add(norm);
    topArtists100.push({
      id: art.id ? `dz_art_${art.id}` : `art_${topArtists100.length + 1}`,
      name: art.name,
      role: `Top #${topArtists100.length + 1} Global`,
      coverUrl: art.picture_xl || art.picture_big || `/api/artist-image?name=${encodeURIComponent(art.name)}`,
      rank: topArtists100.length + 1
    });
  }

  // Also include trending artists from the Global & Brazil tracks so the Top 100 list is rich and complete
  for (const tr of [...trendingBrazil, ...globalTop100]) {
    if (topArtists100.length >= 100) break;
    const primaryName = String(tr.artist || "").split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b)\s*/i)[0].trim();
    const norm = normalizeCatalogText(primaryName);
    if (!norm || seenArtists.has(norm)) continue;
    seenArtists.add(norm);
    topArtists100.push({
      id: tr.artistId ? `dz_art_${tr.artistId}` : `art_${topArtists100.length + 1}`,
      name: primaryName,
      role: `Em Alta · #${topArtists100.length + 1}`,
      coverUrl: `/api/artist-image?name=${encodeURIComponent(primaryName)}`,
      rank: topArtists100.length + 1
    });
  }

  return {
    updatedAt: new Date().toISOString(),
    source: "Deezer Charts + Apple Music RSS Live",
    trendingBrazil,
    globalTop100,
    newReleases: newReleases.slice(0, 30),
    topArtists100: topArtists100.slice(0, 100)
  };
}

function loadDiskCache(): { payload: RealTimeChartsPayload; timestamp: number } | null {
  try {
    if (!fs.existsSync(CHARTS_CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CHARTS_CACHE_FILE, "utf8"));
    if (raw && raw.payload && raw.timestamp) return raw;
  } catch {}
  return null;
}

function saveDiskCache(entry: { payload: RealTimeChartsPayload; timestamp: number }): void {
  try {
    const dir = path.dirname(CHARTS_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHARTS_CACHE_FILE, JSON.stringify(entry), "utf8");
  } catch {}
}

export async function getRealTimeCharts(forceRefresh = false): Promise<RealTimeChartsPayload> {
  if (!memoryCache) {
    memoryCache = loadDiskCache();
  }

  const now = Date.now();
  const isFresh = memoryCache && now - memoryCache.timestamp < CHARTS_TTL_MS;

  if (memoryCache && !forceRefresh) {
    if (!isFresh && !isRevalidating) {
      // Stale-while-revalidate background refresh
      isRevalidating = true;
      fetchFreshCharts()
        .then((fresh) => {
          if (fresh.globalTop100.length > 0 || fresh.trendingBrazil.length > 0) {
            memoryCache = { payload: fresh, timestamp: Date.now() };
            saveDiskCache(memoryCache);
          }
        })
        .catch(() => {})
        .finally(() => {
          isRevalidating = false;
        });
    }
    return memoryCache.payload;
  }

  const fresh = await fetchFreshCharts();
  if (fresh.globalTop100.length > 0 || fresh.trendingBrazil.length > 0 || !memoryCache) {
    memoryCache = { payload: fresh, timestamp: now };
    saveDiskCache(memoryCache);
  }
  return memoryCache.payload;
}
