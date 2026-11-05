/**
 * Pure & Testable Signal-Driven Recommendation Engine (Fase 8)
 * Computes a time-decayed user affinity vector from real behavioral signals:
 * - Complete play (+3.0)
 * - Like (+4.0)
 * - Add to playlist (+3.5)
 * - Search (+1.5)
 * - Early skip < 30s (-2.5)
 * - Favorite artist (+5.0)
 * Applies 80% exploitation (highest affinity artists/genres) + 20% exploration (trending discoveries).
 */

import { buildCanonicalDedupKey, normalizeCatalogText } from "./catalog.ts";

export type SignalType =
  | "complete_play"
  | "partial_play"
  | "skip_early"
  | "like"
  | "playlist_add"
  | "search"
  | "favorite_artist";

export interface UserSignalEvent {
  type: SignalType;
  artist?: string;
  title?: string;
  genre?: string;
  year?: number;
  timestampMs?: number;
}

export interface RecommendableTrack {
  id: string;
  title: string;
  artist: string;
  albumTitle?: string;
  albumId?: string;
  genre?: string;
  year?: number;
  duration?: string;
  durationSec?: number;
  coverUrl?: string;
  streamUrl?: string;
  popular?: boolean;
  reason?: string;
  score?: number;
}

const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  favorite_artist: 5.0,
  like: 4.0,
  playlist_add: 3.5,
  complete_play: 3.0,
  partial_play: 1.2,
  search: 1.5,
  skip_early: -2.5
};

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14-day exponential decay half-life

export function computeTimeDecayFactor(eventTimestampMs: number | undefined, nowMs = Date.now()): number {
  if (!eventTimestampMs || !isFinite(eventTimestampMs) || eventTimestampMs <= 0) return 1.0;
  const ageMs = Math.max(0, nowMs - eventTimestampMs);
  return Math.pow(0.5, ageMs / HALF_LIFE_MS);
}

export interface AffinityProfile {
  artistScores: Map<string, number>;
  genreScores: Map<string, number>;
  seenTrackKeys: Set<string>;
}

export function buildUserAffinityProfile(
  signals: UserSignalEvent[],
  nowMs = Date.now()
): AffinityProfile {
  const artistScores = new Map<string, number>();
  const genreScores = new Map<string, number>();
  const seenTrackKeys = new Set<string>();

  for (const sig of signals || []) {
    if (!sig) continue;
    const baseWeight = SIGNAL_WEIGHTS[sig.type] ?? 1.0;
    const decay = computeTimeDecayFactor(sig.timestampMs, nowMs);
    const weight = baseWeight * decay;

    if (sig.artist) {
      const aNorm = normalizeCatalogText(sig.artist.split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b)\s*/i)[0]);
      if (aNorm) {
        artistScores.set(aNorm, (artistScores.get(aNorm) || 0) + weight);
      }
    }

    if (sig.genre) {
      const gNorm = normalizeCatalogText(sig.genre);
      if (gNorm) {
        genreScores.set(gNorm, (genreScores.get(gNorm) || 0) + weight * 0.6);
      }
    }

    if (sig.title && sig.artist && (sig.type === "complete_play" || sig.type === "skip_early")) {
      seenTrackKeys.add(buildCanonicalDedupKey({ title: sig.title, artist: sig.artist }));
    }
  }

  return { artistScores, genreScores, seenTrackKeys };
}

export function rankRecommendationsWithExploration(
  candidates: RecommendableTrack[],
  signals: UserSignalEvent[],
  limit = 24,
  nowMs = Date.now()
): RecommendableTrack[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const profile = buildUserAffinityProfile(signals, nowMs);

  const exploitationPool: Array<RecommendableTrack & { _score: number }> = [];
  const explorationPool: Array<RecommendableTrack & { _score: number }> = [];
  const dedupKeys = new Set<string>();

  for (const tr of candidates) {
    if (!tr || !tr.title || !tr.artist) continue;
    const key = buildCanonicalDedupKey(tr);
    if (dedupKeys.has(key)) continue;
    dedupKeys.add(key);

    const primaryArtistNorm = normalizeCatalogText(
      tr.artist.split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b)\s*/i)[0]
    );
    const genreNorm = normalizeCatalogText(tr.genre || "");

    const artistAffinity = profile.artistScores.get(primaryArtistNorm) || 0;
    const genreAffinity = genreNorm ? profile.genreScores.get(genreNorm) || 0 : 0;

    // Penalize tracks skipped early
    if (artistAffinity < -1.5) continue;

    // Novelty bonus for tracks not recently completed
    const noveltyBonus = profile.seenTrackKeys.has(key) ? -1.5 : 1.0;
    const popularityBonus = tr.popular ? 0.8 : 0.2;

    const totalScore = artistAffinity * 2.0 + genreAffinity + noveltyBonus + popularityBonus;

    if (artistAffinity > 0) {
      exploitationPool.push({
        ...tr,
        _score: totalScore,
        score: Number(totalScore.toFixed(2)),
        reason: tr.reason || `Porque você curte ${tr.artist}`
      });
    } else {
      explorationPool.push({
        ...tr,
        _score: totalScore + (tr.popular ? 1.5 : 0.5),
        score: Number(totalScore.toFixed(2)),
        reason: tr.reason || "Descoberta em Alta no Miado"
      });
    }
  }

  exploitationPool.sort((a, b) => b._score - a._score);
  explorationPool.sort((a, b) => b._score - a._score);

  const targetExploitationCount = Math.round(limit * 0.8);
  const targetExplorationCount = Math.max(1, limit - targetExploitationCount);

  const selectedExploitation = exploitationPool.slice(0, targetExploitationCount);
  const selectedExploration = explorationPool.slice(0, targetExplorationCount);

  const combined: Array<RecommendableTrack & { _score?: number }> = [...selectedExploitation, ...selectedExploration];

  // Fill remaining slots if either pool was smaller than its quota
  if (combined.length < limit) {
    const usedKeys = new Set(combined.map((c) => buildCanonicalDedupKey(c)));
    for (const extra of [...exploitationPool, ...explorationPool]) {
      if (combined.length >= limit) break;
      const k = buildCanonicalDedupKey(extra);
      if (!usedKeys.has(k)) {
        usedKeys.add(k);
        combined.push(extra);
      }
    }
  }

  return combined.slice(0, limit).map(({ _score, ...clean }) => clean);
}
