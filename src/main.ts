import "./styles/base.css";
import "./styles/liquid-glass.css";
import "./styles/onboarding.css";
import { initFirebaseClient } from "./services/firebaseClient";
import { initMiadoClient } from "./app/miadoClient.js";
import { initEnhancements } from "./ui/ambientGlass";
import { createGlassPlaceholderDataUri } from "./shared/placeholder";
import { escapeHtml, safeUrl, h } from "./ui/dom";
import { bindImageFallback } from "./ui/images";
import { createCarousel } from "./ui/carousel";
import { mountOnboarding } from "./ui/onboarding";
import { initPwaInstall } from "./ui/pwaInstall";

import { buildTrackKey } from "./shared/keys";
import {
  initIndexedDbStore,
  resolveActiveUserKey,
  saveProfileInstant,
  saveLibraryInstant,
  saveHistoryInstant,
  enqueueOutbox,
  persistFromMiadoState,
} from "./services/indexedDbStore";

const CANONICAL_ARTIST_PROVIDER_IDS: Record<string, string> = {
  "the weeknd": "dz_art_4050205",
  "bruno mars": "dz_art_429675",
  "taylor swift": "dz_art_12246",
  "lady gaga": "dz_art_75491",
  "billie eilish": "dz_art_9635624",
  "rihanna": "dz_art_564",
  "sabrina carpenter": "dz_art_1176900",
  "ariana grande": "dz_art_1562681",
  "dua lipa": "dz_art_8706544",
  "lana del rey": "dz_art_1424821",
  "lana del ray": "dz_art_1424821",
  "sza": "dz_art_3978991",
  "travis scott": "dz_art_4495513",
  "kanye west": "dz_art_230",
  "kendrick lamar": "dz_art_525046",
  "drake": "dz_art_246791",
  "post malone": "dz_art_7463680",
  "eminem": "dz_art_13",
  "coldplay": "dz_art_892",
  "imagine dragons": "dz_art_416239",
  "linkin park": "dz_art_92",
  "queen": "dz_art_412",
  "arctic monkeys": "dz_art_1182",
  "anitta": "dz_art_4390053",
  "charlie brown jr": "dz_art_8691",
  "djavan": "dz_art_14687",
  "tim maia": "dz_art_13704",
  "racionais mcs": "dz_art_4488457",
  "ghost": "dz_art_8506054",
  "gost": "dz_art_8506054",
  "banda ghost": "dz_art_8506054",
  "banda gost": "dz_art_8506054",
  "ghost bc": "dz_art_8506054",
  "kali uchis": "dz_art_6043160",
  "joji": "dz_art_5078097",
  "fall out boy": "dz_art_1518",
  "fall out boys": "dz_art_1518",
  "paramore": "dz_art_4039",
  "deftones": "dz_art_579",
  "the marias": "dz_art_13825229",
  "marilia mendonca": "dz_art_8354140",
  "henrique e juliano": "dz_art_4962010",
  "jorge e mateus": "dz_art_1161686",
  "bruno e marrone": "dz_art_12217",
  "jao": "dz_art_9922090",
  "matue": "dz_art_11457878",
  "luisa sonza": "dz_art_12435862",
  "rita lee": "dz_art_13703",
  "pitty": "dz_art_12178",
  "bom gosto": "dz_art_381056",
  "grupo bom gosto": "dz_art_381056",
  "enzo yuki": "sc_art_enzo_yuki",
};

function normalizeArtistKeyForId(rawArtist: string): string {
  return String(rawArtist || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+(?:feat\.?|ft\.?|featuring|with|part\.?|x|vs\.?)\s+|\s*[&+,;/|]\s*/i)[0]
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveArtistProviderId(trackOrArtist: any): string {
  if (!trackOrArtist) return "art_unknown";
  if (typeof trackOrArtist === "string") {
    const norm = normalizeArtistKeyForId(trackOrArtist);
    if (!norm) return "art_unknown";
    if (CANONICAL_ARTIST_PROVIDER_IDS[norm]) {
      return CANONICAL_ARTIST_PROVIDER_IDS[norm];
    }
    return `art_${norm.replace(/\s+/g, "_")}`;
  }

  const rawArtist = String(
    trackOrArtist.artist || trackOrArtist.artistName || trackOrArtist.name || ""
  ).trim();
  const norm = normalizeArtistKeyForId(rawArtist);
  if (norm && CANONICAL_ARTIST_PROVIDER_IDS[norm]) {
    return CANONICAL_ARTIST_PROVIDER_IDS[norm];
  }

  const explicitArtistId = String(
    trackOrArtist.artistId ||
      trackOrArtist.dzArtistId ||
      trackOrArtist.itunesArtistId ||
      (trackOrArtist.artist && typeof trackOrArtist.artist === "object" ? trackOrArtist.artist.id : "") ||
      ""
  ).trim();

  if (explicitArtistId) {
    if (/^(dz_art_|it_art_|saavn_art_|sc_art_|art_)/.test(explicitArtistId)) {
      return explicitArtistId;
    }
    const prov = String(trackOrArtist.provider || "").toLowerCase();
    if (prov === "deezer" || String(trackOrArtist.id || "").startsWith("dz_")) {
      return `dz_art_${explicitArtistId}`;
    }
    if (prov === "itunes" || String(trackOrArtist.id || "").startsWith("it_")) {
      return `it_art_${explicitArtistId}`;
    }
    if (prov === "saavn" || String(trackOrArtist.id || "").startsWith("saavn_")) {
      return `saavn_art_${explicitArtistId}`;
    }
    return `art_${explicitArtistId}`;
  }

  if (!norm) return "art_unknown";
  return `art_${norm.replace(/\s+/g, "_")}`;
}

export function resolveUniqueTrackId(track: any): {
  id: string;
  trackUid: string;
  provider: string;
  artistId: string;
} {
  const rawId = String(track?.id || track?.trackId || "").trim();
  const title = String(track?.title || track?.trackName || "").trim();
  const artist = String(track?.artist || track?.artistName || "").trim();
  const key = buildTrackKey(title, artist) || "track";

  let provider = String(track?.provider || "").trim().toLowerCase();
  let normalizedId = rawId;

  if (rawId.startsWith("dz_")) {
    provider = "deezer";
  } else if (rawId.startsWith("it_")) {
    provider = "itunes";
  } else if (rawId.startsWith("saavn_")) {
    provider = "saavn";
  } else if (/^\d+$/.test(rawId)) {
    provider = provider || "itunes";
    normalizedId = `it_${rawId}`;
  } else {
    provider = provider || "catalog";
    let h = 2166136261;
    const seed = `${key}|${title.toLowerCase()}|${artist.toLowerCase()}`;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hex = (h >>> 0).toString(16).padStart(8, "0");
    normalizedId = rawId || `trk_${hex}_${key.slice(0, 24)}`;
  }

  const artistId = resolveArtistProviderId({
    ...track,
    id: normalizedId,
    provider,
    artist,
  });
  const trackUid = `${provider}:${normalizedId}:${artistId}:${key}`;
  return { id: normalizedId, trackUid, provider, artistId };
}

export interface TrackIntegrityReport {
  valid: boolean;
  repaired: boolean;
  reasons: string[];
  trackId: string;
  artistId: string;
  provider: string;
  trackUid: string;
  streamUrl: string;
}

/**
 * Valida e repara a integridade dos metadados, IDs de provedores de streaming (trackId, artistId, provider)
 * e garante que a URL de áudio aponte exatamente para o par (título, artista, trackId, artistId) correto.
 */
export function verifyTrackMetadataIntegrity(track: any): TrackIntegrityReport {
  const reasons: string[] = [];
  let repaired = false;

  if (!track || typeof track !== "object") {
    return {
      valid: false,
      repaired: false,
      reasons: ["invalid_track_object"],
      trackId: "",
      artistId: "art_unknown",
      provider: "unknown",
      trackUid: "",
      streamUrl: "",
    };
  }

  const title = String(track.title || track.trackName || "").trim();
  const artist = String(track.artist || track.artistName || "").trim();
  if (!title || !artist) {
    return {
      valid: false,
      repaired: false,
      reasons: ["missing_title_or_artist"],
      trackId: String(track.id || ""),
      artistId: "art_unknown",
      provider: String(track.provider || "unknown"),
      trackUid: "",
      streamUrl: "",
    };
  }

  const identity = resolveUniqueTrackId(track);
  if (track.id !== identity.id) {
    track.id = identity.id;
    repaired = true;
    reasons.push("normalized_track_id");
  }
  if (track.provider !== identity.provider) {
    track.provider = identity.provider;
    repaired = true;
    reasons.push("normalized_provider");
  }

  const expectedArtistNorm = normalizeArtistKeyForId(artist);
  const existingArtistId = String(track.artistId || "").trim();
  const canonicalArtistId = identity.artistId;

  if (!existingArtistId) {
    track.artistId = canonicalArtistId;
    repaired = true;
  } else if (
    CANONICAL_ARTIST_PROVIDER_IDS[expectedArtistNorm] &&
    existingArtistId !== CANONICAL_ARTIST_PROVIDER_IDS[expectedArtistNorm]
  ) {
    track.artistId = CANONICAL_ARTIST_PROVIDER_IDS[expectedArtistNorm];
    repaired = true;
    reasons.push("repaired_canonical_artist_id_mismatch");
  } else if (
    existingArtistId.startsWith("art_") &&
    existingArtistId !== `art_${expectedArtistNorm.replace(/\s+/g, "_")}`
  ) {
    track.artistId = canonicalArtistId;
    repaired = true;
    reasons.push("repaired_slug_artist_id_mismatch");
  }

  track.trackUid = `${track.provider}:${track.id}:${track.artistId}:${buildTrackKey(title, artist) || "track"}`;

  // Verifica se a streamUrl/previewUrl corresponde exatamente ao título, artista, trackId e artistId da faixa
  const currentStreamUrl = String(track.streamUrl || track.previewUrl || "").trim();
  let urlNeedsRebuild = !currentStreamUrl || !currentStreamUrl.startsWith("/api/stream");

  if (!urlNeedsRebuild) {
    try {
      const parsed = new URL(currentStreamUrl, window.location.origin);
      const urlTitle = String(parsed.searchParams.get("title") || "").trim();
      const urlArtist = String(parsed.searchParams.get("artist") || "").trim();
      const urlTrackId = String(parsed.searchParams.get("trackId") || "").trim();
      const urlArtistId = String(parsed.searchParams.get("artistId") || "").trim();

      const normTitleA = buildTrackKey(title, "");
      const normTitleB = buildTrackKey(urlTitle, "");
      const normArtA = normalizeArtistKeyForId(artist);
      const normArtB = normalizeArtistKeyForId(urlArtist);

      if (
        !urlTitle ||
        !urlArtist ||
        normTitleA !== normTitleB ||
        normArtA !== normArtB ||
        (urlTrackId && urlTrackId !== track.id) ||
        (urlArtistId && urlArtistId !== track.artistId) ||
        !urlTrackId ||
        !urlArtistId
      ) {
        urlNeedsRebuild = true;
        reasons.push("stream_url_metadata_mismatch_repaired");
      }
    } catch {
      urlNeedsRebuild = true;
      reasons.push("invalid_stream_url_repaired");
    }
  }

  if (urlNeedsRebuild) {
    const params = new URLSearchParams();
    params.set("title", title);
    params.set("artist", artist);
    params.set("artistId", track.artistId);
    params.set("trackId", track.id);
    params.set("provider", track.provider);
    const durSec = Number(track.durationSec) || 0;
    if (durSec > 0) {
      params.set("durationSec", String(Math.round(durSec)));
    }
    params.set("preferFull", "1");
    params.set("studioOnly", "1");
    const rebuiltUrl = `/api/stream?${params.toString()}`;
    track.streamUrl = rebuiltUrl;
    track.previewUrl = rebuiltUrl;
    repaired = true;
  }

  track.integrityVerified = true;

  return {
    valid: true,
    repaired,
    reasons,
    trackId: track.id,
    artistId: track.artistId,
    provider: track.provider,
    trackUid: track.trackUid,
    streamUrl: track.streamUrl,
  };
}

/**
 * Rotina de verificação do motor de busca: valida todos os resultados (faixas, artistas e álbuns),
 * assegura integridade dos IDs de provedores e descarta entradas corrompidas ou inconsistentes.
 */
export function validateSearchCatalogIntegrity(results: any, query = ""): any {
  if (!results || typeof results !== "object") return results;
  let verifiedCount = 0;
  let repairedCount = 0;
  let rejectedCount = 0;

  if (Array.isArray(results.songs)) {
    const validSongs: any[] = [];
    const seenTrackUids = new Set<string>();
    for (const song of results.songs) {
      const report = verifyTrackMetadataIntegrity(song);
      if (!report.valid) {
        rejectedCount++;
        continue;
      }
      if (report.repaired) repairedCount++;
      if (seenTrackUids.has(report.trackUid)) continue;
      seenTrackUids.add(report.trackUid);
      verifiedCount++;
      validSongs.push(song);
    }
    results.songs = validSongs;
  }

  if (Array.isArray(results.tracks)) {
    const validTracks: any[] = [];
    const seenTrackUids = new Set<string>();
    for (const tr of results.tracks) {
      const report = verifyTrackMetadataIntegrity(tr);
      if (!report.valid) {
        rejectedCount++;
        continue;
      }
      if (report.repaired) repairedCount++;
      if (seenTrackUids.has(report.trackUid)) continue;
      seenTrackUids.add(report.trackUid);
      verifiedCount++;
      validTracks.push(tr);
    }
    results.tracks = validTracks;
  }

  if (Array.isArray(results.artists)) {
    results.artists = results.artists
      .filter((art: any) => art && String(art.name || "").trim().length > 0)
      .map((art: any) => {
        const artistId = resolveArtistProviderId(art);
        return {
          ...art,
          id: art.id || artistId,
          artistId,
        };
      });
  }

  if (query && (verifiedCount > 0 || repairedCount > 0 || rejectedCount > 0)) {
    console.debug(
      `[MiadoSearchIntegrity] Query="${query}" | Faixas verificadas=${verifiedCount} | Reparadas=${repairedCount} | Rejeitadas=${rejectedCount}`
    );
  }

  return results;
}

export interface PlaybackMonitorLogEntry {
  timestamp: string;
  stage: string;
  artistId: string;
  artist: string;
  trackId: string;
  trackUid: string;
  provider: string;
  title: string;
  streamUrl: string;
  integrityValid: boolean;
}

const playbackLogHistory: PlaybackMonitorLogEntry[] = [];

/**
 * Sistema de monitoramento de log de console do Player:
 * Exibe o ID do artista (artistId), ID da faixa (trackId), provedor e a URL da faixa sendo requisitada
 * toda vez que uma música é iniciada no player.
 */
export function logTrackPlaybackStart(
  track: any,
  requestedUrl: string,
  stage = "PLAY_START",
  extra: Record<string, any> = {}
): PlaybackMonitorLogEntry {
  const report = verifyTrackMetadataIntegrity(track);
  const effectiveUrl = String(requestedUrl || report.streamUrl || track?.streamUrl || "").trim();
  const entry: PlaybackMonitorLogEntry = {
    timestamp: new Date().toISOString(),
    stage,
    artistId: report.artistId || resolveArtistProviderId(track),
    artist: String(track?.artist || track?.artistName || "Artista Desconhecido"),
    trackId: report.trackId || String(track?.id || ""),
    trackUid: report.trackUid || String(track?.trackUid || ""),
    provider: report.provider || String(track?.provider || "catalog"),
    title: String(track?.title || track?.trackName || "Faixa"),
    streamUrl: effectiveUrl,
    integrityValid: report.valid,
    ...extra,
  };

  playbackLogHistory.unshift(entry);
  if (playbackLogHistory.length > 60) {
    playbackLogHistory.length = 60;
  }

  console.info(
    `%c[MiadoPlayer][TrackMonitor] %c${stage}%c | ArtistID: %c${entry.artistId}%c (${entry.artist}) | TrackID: %c${entry.trackId}%c [${entry.provider}] | Faixa: "${entry.title}" | StreamURL: ${entry.streamUrl}`,
    "color:#a855f7;font-weight:700;",
    "color:#22c55e;font-weight:700;",
    "color:inherit;",
    "color:#38bdf8;font-weight:700;",
    "color:inherit;",
    "color:#f59e0b;font-weight:700;",
    "color:inherit;"
  );

  return entry;
}

export async function updateProfile(profileData?: any): Promise<boolean> {
  const w = window as any;
  const userKey = resolveActiveUserKey(profileData || w.miadoState);
  await saveProfileInstant(userKey, profileData || w.miadoState?.user || {});
  void persistFromMiadoState(w.miadoState);
  if (w.miadoFirestore && typeof w.miadoFirestore.updateProfile === "function") {
    const ok = await w.miadoFirestore.updateProfile(profileData);
    if (!ok) {
      await enqueueOutbox("updateProfile", profileData || w.miadoState?.user || {}, userKey);
    }
    return ok;
  }
  await enqueueOutbox("updateProfile", profileData || w.miadoState?.user || {}, userKey);
  return false;
}

export async function saveUserLibrary(libraryData?: any): Promise<boolean> {
  const w = window as any;
  const userKey = resolveActiveUserKey(w.miadoState);
  await saveLibraryInstant(userKey, {
    likedTracks: libraryData?.likedTracks ?? w.miadoState?.likedTracks,
    followedArtists: libraryData?.followedArtists ?? w.miadoState?.followedArtists,
    playlists: libraryData?.playlists ?? w.miadoState?.playlists,
    friends: libraryData?.friends ?? w.miadoState?.friends,
  });
  if (Array.isArray(libraryData?.recentHistory || w.miadoState?.history)) {
    await saveHistoryInstant(userKey, libraryData?.recentHistory || w.miadoState?.history || []);
  }
  void persistFromMiadoState(w.miadoState);
  if (w.miadoFirestore && typeof w.miadoFirestore.saveUserLibrary === "function") {
    const ok = await w.miadoFirestore.saveUserLibrary(libraryData);
    if (!ok) {
      await enqueueOutbox("saveUserLibrary", libraryData || {}, userKey);
    }
    return ok;
  }
  await enqueueOutbox("saveUserLibrary", libraryData || {}, userKey);
  return false;
}

function bootstrapMiadoApp() {
  const w = window as any;
  initIndexedDbStore();
  w.miadoPlaceholder = createGlassPlaceholderDataUri;
  w.miadoDom = { escapeHtml, safeUrl, h, bindImageFallback, createCarousel };
  w.miadoTrackIdentity = {
    resolveUniqueTrackId,
    resolveArtistProviderId,
    verifyTrackMetadataIntegrity,
    validateSearchCatalogIntegrity,
  };
  w.miadoTrackMonitor = {
    logTrackPlaybackStart,
    verifyTrackMetadataIntegrity,
    validateSearchCatalogIntegrity,
    getHistory: () => [...playbackLogHistory],
  };
  w.miadoPersistence = {
    updateProfile,
    saveUserLibrary,
    flushRetryQueue: async () => {
      if (w.miadoFirestore && typeof w.miadoFirestore.flushRetryQueue === "function") {
        await w.miadoFirestore.flushRetryQueue();
      }
    },
  };

  let activeOnboardingUnmount: (() => void) | null = null;

  const ensureOnboardingContainer = (): HTMLElement => {
    let el = document.getElementById("miado-onboarding-root");
    if (!el) {
      el = h("div", { id: "miado-onboarding-root" });
      document.body.appendChild(el);
    }
    return el;
  };

  w.miadoMountOnboarding = (forceRemount = false) => {
    const container = ensureOnboardingContainer();
    if (activeOnboardingUnmount) {
      if (!forceRemount && container.querySelector(".ob-root:not(.is-exiting)")) {
        return activeOnboardingUnmount;
      }
      try {
        activeOnboardingUnmount();
      } catch {
        // ignore unmount error
      }
      activeOnboardingUnmount = null;
    }
    container.style.display = "block";
    activeOnboardingUnmount = mountOnboarding(container, {
      onComplete: async () => {
        activeOnboardingUnmount = null;
        try {
          if (w.miadoFirestore && typeof w.miadoFirestore.hydrateCurrentUser === "function") {
            await w.miadoFirestore.hydrateCurrentUser();
          }
          if (w.miadoUI) {
            w.miadoUI.syncHeaderUserUI?.();
            w.miadoUI.renderSidebarPlaylists?.();
            w.miadoUI.syncAccountStateAcrossApp?.();
          }
        } catch {
          // ignore post-onboarding hydration warning
        }
      },
    });
    return activeOnboardingUnmount;
  };

  document.addEventListener("dragstart", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLImageElement ||
      target instanceof SVGElement ||
      target instanceof HTMLAnchorElement
    ) {
      event.preventDefault();
    }
  });

  initPwaInstall();
  initFirebaseClient();
  initMiadoClient();
  initEnhancements();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapMiadoApp, { once: true });
} else {
  bootstrapMiadoApp();
}
