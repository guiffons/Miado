import { describe, it, expect } from "vitest";
import {
  normalizeCatalogText,
  extractAllArtistNames,
  buildCanonicalDedupKey,
  isCanonicalStudioTrack,
  isForbidden30sPreviewUrl,
  deduplicateCanonicalTracks,
  belongsToTargetArtist
} from "../catalog";
import {
  computeTimeDecayFactor,
  buildUserAffinityProfile,
  rankRecommendationsWithExploration,
  type UserSignalEvent,
  type RecommendableTrack
} from "../recommendations";
import { decryptSaavnMediaUrl } from "../des";

describe("Catálogo Canônico & Erradicação de Previews de 30s (Fases 2 e 4)", () => {
  it("extrai todos os artistas principais e convidados sem descartar feats", () => {
    const artists1 = extractAllArtistNames("Lady Gaga & Bruno Mars", "Die With A Smile");
    expect(artists1).toEqual(["bruno mars", "lady gaga"]);

    const artists2 = extractAllArtistNames("The Weeknd", "São Paulo (feat. Anitta)");
    expect(artists2).toEqual(["anitta", "the weeknd"]);
  });

  it("gera chaves canônicas distintas para versões solo vs colaborações e prioriza ISRC", () => {
    const keySolo = buildCanonicalDedupKey({
      title: "Please Please Please",
      artist: "Sabrina Carpenter"
    });
    const keyFeat = buildCanonicalDedupKey({
      title: "Please Please Please (feat. Dolly Parton)",
      artist: "Sabrina Carpenter"
    });
    expect(keySolo).not.toEqual(keyFeat);

    const keyIsrc = buildCanonicalDedupKey({
      title: "Espresso",
      artist: "Sabrina Carpenter",
      isrc: "usum72403305"
    });
    expect(keyIsrc).toBe("isrc:USUM72403305");
  });

  it("permite títulos legítimos de estúdio ('O Show', 'Flores de Outro Carnaval', 'Tour', 'Interlude', 'Skit')", () => {
    expect(isCanonicalStudioTrack("O Show", "Yung Lixo", "Validation", 202)).toBe(true);
    expect(isCanonicalStudioTrack("Flores de Outro Carnaval", "Yung Lixo", "Flores de Outro Carnaval", 267)).toBe(true);
    expect(isCanonicalStudioTrack("Tour", "Artista Oficial", "Single", 185)).toBe(true);
    expect(isCanonicalStudioTrack("Chromatica I (Interlude)", "Lady Gaga", "Chromatica", 65)).toBe(true);
    expect(isCanonicalStudioTrack("Skit", "Kendrick Lamar", "GNX", 75)).toBe(true);
  });

  it("rejeita remixes, versões ao vivo, karaokê, sped up e faixas menores que 35s", () => {
    expect(isCanonicalStudioTrack("After Hours (The Blaze Remix)", "The Weeknd", "After Hours", 238)).toBe(false);
    expect(isCanonicalStudioTrack("Bad Romance (Live at Coachella)", "Lady Gaga", "Live", 290)).toBe(false);
    expect(isCanonicalStudioTrack("Espresso (Karaoke Version)", "Karaoke Hits", "Pop Karaoke", 175)).toBe(false);
    expect(isCanonicalStudioTrack("BIRDS OF A FEATHER (Sped Up)", "Billie Eilish", "Single", 150)).toBe(false);
    expect(isCanonicalStudioTrack("Manchild (30s Preview)", "Sabrina Carpenter", "Short n' Sweet", 30)).toBe(false);
  });

  it("identifica e bloqueia URLs de preview de 30 segundos (Deezer, iTunes, SoundCloud Snip)", () => {
    expect(isForbidden30sPreviewUrl("https://cdns-preview-d.dzcdn.net/stream/c-deda7fa9316d9e9e880d2c6207e92260-8.mp3")).toBe(true);
    expect(isForbidden30sPreviewUrl("https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/test.m4a")).toBe(true);
    expect(isForbidden30sPreviewUrl("https://cf-preview-media.sndcdn.com/preview/0/30/test.mp3")).toBe(true);
    expect(isForbidden30sPreviewUrl("https://aac.saavncdn.com/123/full_track_320.mp4")).toBe(false);
  });

  it("desduplica faixas preservando colaborações e erradicando URLs de 30s", () => {
    const raw = [
      {
        id: "1",
        title: "Espresso",
        artist: "Sabrina Carpenter",
        duration: "2:55",
        previewUrl: "https://cdns-preview-a.dzcdn.net/stream/c-123.mp3"
      },
      {
        id: "2",
        title: "Espresso (Explicit)",
        artist: "Sabrina Carpenter",
        duration: "2:55",
        previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview123.m4a"
      },
      {
        id: "3",
        title: "Die With A Smile",
        artist: "Lady Gaga & Bruno Mars",
        duration: "4:11"
      }
    ];
    const clean = deduplicateCanonicalTracks(raw);
    expect(clean.length).toBe(2);
    expect(clean[0].previewUrl).toContain("/api/stream?");
    expect(clean[0].previewUrl).not.toContain("dzcdn.net");
    expect(clean[1].artistIds).toEqual(["bruno mars", "lady gaga"]);
  });

  it("evita mistura de artistas homônimos ou parciais em belongsToTargetArtist", () => {
    expect(belongsToTargetArtist({ artist: "Sabrina Carpenter" }, "Sabrina Carpenter").matches).toBe(true);
    expect(belongsToTargetArtist({ artist: "MC Sabrina" }, "Sabrina Carpenter").matches).toBe(false);
    expect(belongsToTargetArtist({ artist: "Yun Li" }, "Yung Lixo").matches).toBe(true);
    expect(belongsToTargetArtist({ artist: "Yung Buda" }, "Yung Lixo").matches).toBe(false);
  });
});

describe("Motor de Recomendação Baseado em Sinais e Time-Decay (Fase 8)", () => {
  it("calcula decaimento temporal exponencial com meia-vida de 14 dias", () => {
    const now = Date.now();
    const factorNow = computeTimeDecayFactor(now, now);
    const factor14d = computeTimeDecayFactor(now - 14 * 24 * 60 * 60 * 1000, now);
    expect(factorNow).toBeCloseTo(1.0, 2);
    expect(factor14d).toBeCloseTo(0.5, 2);
  });

  it("pondera sinais positivos (complete_play, like, playlist_add) e penaliza skips (< 30s)", () => {
    const now = Date.now();
    const signals: UserSignalEvent[] = [
      { type: "favorite_artist", artist: "Billie Eilish", timestampMs: now },
      { type: "complete_play", artist: "Sabrina Carpenter", title: "Espresso", genre: "Pop", timestampMs: now },
      { type: "like", artist: "Sabrina Carpenter", title: "Espresso", genre: "Pop", timestampMs: now },
      { type: "skip_early", artist: "Artista Pulado", title: "Faixa Ruim", timestampMs: now },
      { type: "skip_early", artist: "Artista Pulado", title: "Outra Ruim", timestampMs: now }
    ];
    const profile = buildUserAffinityProfile(signals, now);

    expect(profile.artistScores.get(normalizeCatalogText("Sabrina Carpenter")) || 0).toBeGreaterThan(6);
    expect(profile.artistScores.get(normalizeCatalogText("Artista Pulado")) || 0).toBeLessThan(0);
  });

  it("combina 80% exploitation + 20% exploration e penaliza artistas com skip recorrente", () => {
    const now = Date.now();
    const signals: UserSignalEvent[] = [
      { type: "favorite_artist", artist: "Billie Eilish", timestampMs: now },
      { type: "favorite_artist", artist: "Lady Gaga", timestampMs: now },
      { type: "skip_early", artist: "Artista Ignorado", timestampMs: now }
    ];

    const candidates: RecommendableTrack[] = [
      { id: "c1", title: "BIRDS OF A FEATHER", artist: "Billie Eilish", genre: "Alt-Pop", popular: true },
      { id: "c2", title: "CHIHIRO", artist: "Billie Eilish", genre: "Alt-Pop", popular: true },
      { id: "c3", title: "Abracadabra", artist: "Lady Gaga", genre: "Pop", popular: true },
      { id: "c4", title: "Disease", artist: "Lady Gaga", genre: "Pop", popular: true },
      { id: "c5", title: "Descoberta Nova", artist: "Chappell Roan", genre: "Synth-Pop", popular: true },
      { id: "c6", title: "Faixa Ignorada", artist: "Artista Ignorado", genre: "Pop", popular: false }
    ];

    const ranked = rankRecommendationsWithExploration(candidates, signals, 5, now);

    expect(ranked.some(r => r.artist === "Artista Ignorado")).toBe(false);
    expect(ranked.length).toBe(5);
    expect(ranked.some(r => r.artist === "Billie Eilish")).toBe(true);
    expect(ranked.some(r => r.artist === "Chappell Roan")).toBe(true);
  });
});

describe("Decriptação DES-ECB Nativa em TypeScript para JioSaavn 320kbps (Fase 2)", () => {
  it("retorna null para entradas vazias ou inválidas sem lançar exceção", () => {
    expect(decryptSaavnMediaUrl("")).toBeNull();
  });
});
