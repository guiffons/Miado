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

async function fetchFreshCharts(): Promise<RealTimeChartsPayload> {
  const [
    dzGlobalChart,
    dzBrazilPlaylist,
    dzGlobalTopPlaylist,
    dzEditorialReleases,
    appleBrSongs
  ] = await Promise.all([
    fetchJsonSafe("https://api.deezer.com/chart/0?limit=100", 5000),
    fetchJsonSafe("https://api.deezer.com/playlist/1111141961/tracks?limit=60", 5000),
    fetchJsonSafe("https://api.deezer.com/playlist/3155776842/tracks?limit=100", 5000),
    fetchJsonSafe("https://api.deezer.com/editorial/0/releases?limit=30", 5000),
    fetchJsonSafe("https://rss.applemarketingtools.com/api/v2/br/music/most-played/50/songs.json", 4500)
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
  const trendingBrazil = deduplicateCanonicalTracks(brRaw).slice(0, 50);

  const globalRaw: ChartTrackItem[] = [];
  const globalChartTracks = dzGlobalChart?.tracks?.data || [];
  const globalPlaylistTracks = dzGlobalTopPlaylist?.data || [];
  for (const item of [...globalChartTracks, ...globalPlaylistTracks]) {
    const mapped = mapDeezerTrack(item, globalRaw.length);
    if (mapped) globalRaw.push(mapped);
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
    const norm = normalizeCatalogText(art.name);
    if (!norm || seenArtists.has(norm)) continue;
    seenArtists.add(norm);
    topArtists100.push({
      id: art.id ? `dz_art_${art.id}` : `art_${topArtists100.length + 1}`,
      name: art.name,
      role: `Top #${topArtists100.length + 1} Global`,
      coverUrl: `/api/artist-image?name=${encodeURIComponent(art.name)}&url=${encodeURIComponent(
        art.picture_xl || art.picture_big || ""
      )}`,
      rank: topArtists100.length + 1
    });
  }

  for (const tr of [...trendingBrazil, ...globalTop100]) {
    if (topArtists100.length >= 100) break;
    const primaryName = String(tr.artist || "")
      .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b)\s*/i)[0]
      .trim();
    const norm = normalizeCatalogText(primaryName);
    if (!norm || seenArtists.has(norm)) continue;
    seenArtists.add(norm);
    topArtists100.push({
      id: tr.artistId ? `dz_art_${tr.artistId}` : `art_${topArtists100.length + 1}`,
      name: primaryName,
      role: `Em Alta - #${topArtists100.length + 1}`,
      coverUrl: `/api/artist-image?name=${encodeURIComponent(primaryName)}`,
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

export async function getRealTimeCharts(forceRefresh = false): Promise<RealTimeChartsPayload> {
  const now = Date.now();
  const state = chartsStore.get();
  const cached = state.entry;

  const canForce = forceRefresh && now - lastForcedRefreshAt >= 5 * 60_000;
  if (canForce) {
    lastForcedRefreshAt = now;
  }

  const isFresh = cached && now < cached.expiresAt;

  if (cached && !canForce) {
    if (!isFresh && !isRevalidating) {
      isRevalidating = true;
      fetchFreshCharts()
        .then((fresh) => {
          if (fresh.globalTop100.length > 0 || fresh.trendingBrazil.length > 0) {
            const ts = Date.now();
            return chartsStore.update((draft) => {
              draft.entry = {
                payload: fresh,
                fetchedAt: ts,
                expiresAt: ts + CHARTS_TTL_MS
              };
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          isRevalidating = false;
        });
    }
    return cached.payload;
  }

  const fresh = await fetchFreshCharts();
  if (fresh.globalTop100.length > 0 || fresh.trendingBrazil.length > 0 || !cached) {
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

  return cached.payload;
}
