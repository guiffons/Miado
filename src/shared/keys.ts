export function normalizeStr(str: string): string {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSongTitleKey(title: string): string {
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*[\(\[]\s*(?:feat\.?|ft\.?|with|part\.?)\s+[^\)\]]+[\)\]]/gi, "")
    .replace(
      /\s*[\(\[]\s*[^\)\]]*\b(?:explicit|clean|deluxe|remaster(?:ed)?|bonus(?:\s+track)?|album\s+version|single\s+version|radio\s+edit|anniversary|edition)\b[^\)\]]*[\)\]]/gi,
      ""
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildTrackKey(title: string, artist: string): string {
  const cleanTitle = normalizeSongTitleKey(title).replace(/\s+/g, "_").slice(0, 65) || "track";
  const primaryArtist = String(artist || "")
    .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\/|;)\s*/i)[0]
    .trim();
  const cleanArtist = normalizeStr(primaryArtist || artist).replace(/\s+/g, "_").slice(0, 50) || "artist";
  const combined = `${cleanTitle}:${cleanArtist}`.replace(/[^a-z0-9_.:-]/g, "");
  return combined.slice(0, 120) || "track:artist";
}
