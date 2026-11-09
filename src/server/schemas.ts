import { z } from "zod";
import { ALLOWED_IMAGE_HOSTS, isHostAllowed } from "./net/allowlists.ts";

export function isSafeImageUrl(val: string, maxLen = 250000): boolean {
  const s = String(val || "").trim();
  if (!s) return true;
  if (s.length > maxLen) return false;
  if (/^\/api\/cat-avatar\?id=[a-z0-9_]{1,40}$/.test(s)) return true;
  if (/^\/api\/cover\?[A-Za-z0-9._~:/?#@!$&()*+,;=%-]{1,1990}$/.test(s)) return true;
  if (/^\/api\/artist-image\?[A-Za-z0-9._~:/?#@!$&()*+,;=%-]{1,1990}$/.test(s)) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s)) return true;
  try {
    const parsed = new URL(s);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return isHostAllowed(parsed.hostname, ALLOWED_IMAGE_HOSTS);
  } catch {
    return false;
  }
}

export const SearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100),
    page: z.coerce.number().int().min(1).max(4).optional().default(1),
    limit: z.coerce.number().int().min(1).max(45).optional().default(30)
  })
  .strict();

export const AlbumQuerySchema = z
  .object({
    collectionId: z.string().regex(/^\d{1,20}$/).optional(),
    dzAlbumId: z.string().regex(/^\d{1,20}$/).optional(),
    title: z.string().trim().max(120).optional(),
    artist: z.string().trim().max(120).optional()
  })
  .strict();

export const ArtistQuerySchema = z
  .object({
    name: z.string().trim().min(1).max(120)
  })
  .strict();

export const DiscoverMoreQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(6).optional().default(1)
  })
  .strict();

export const RecommendationsQuerySchema = z
  .object({
    artists: z.string().max(600).optional().default("")
  })
  .strict();

export const CatAvatarQuerySchema = z
  .object({
    id: z
      .enum(["cat_1", "cat_2", "cat_3", "cat_4", "cat_5", "cat_6", "cat_7", "cat_8"])
      .optional()
      .default("cat_1")
  })
  .strict();

export const PlaylistTrackInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().min(1).max(200),
    albumTitle: z.string().trim().max(200).optional(),
    coverUrl: z
      .string()
      .max(2000)
      .refine((v) => !v || isSafeImageUrl(v, 2000), { message: "Invalid coverUrl" })
      .optional(),
    durationSec: z.number().int().min(0).max(7200)
  })
  .strict();
