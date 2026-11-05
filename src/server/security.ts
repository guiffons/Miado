/**
 * Security Hardening, Firebase Token Verification, Rate Limiting & Zod Schemas (Fase 6)
 * - Verifies Firebase Auth ID tokens (JWT signature & claims or IdentityToolkit lookup)
 * - Eliminates activeAccountEmail global leakage for unauthenticated guests
 * - Protects write/delete endpoints with strict authentication
 * - Adds security headers, CORS policy, IP rate limiting, and Zod payload validation
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";

let firebaseWebApiKey = "";
let firebaseProjectId = "axiomatic-electron-sbcxw";
try {
  const cfgPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    if (cfg.apiKey) firebaseWebApiKey = String(cfg.apiKey);
    if (cfg.projectId) firebaseProjectId = String(cfg.projectId);
  }
} catch {}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  name?: string;
}

const tokenVerificationCache = new Map<string, { user: VerifiedFirebaseUser; expiresAt: number }>();

/**
 * Verifies a Firebase ID Token using Google IdentityToolkit accounts:lookup endpoint
 * (works reliably in any Cloud Run / container environment using the project's Firebase API key)
 * and caches valid tokens until expiration.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  const cleanToken = String(idToken || "").trim();
  if (!cleanToken || cleanToken.length < 30) return null;

  const now = Date.now();
  const cached = tokenVerificationCache.get(cleanToken);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  // Decode JWT payload to check issuer, audience, and expiration first
  try {
    const parts = cleanToken.split(".");
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
      const payload = JSON.parse(payloadJson);
      if (payload.exp && payload.exp * 1000 < now) {
        return null;
      }
      if (
        firebaseWebApiKey &&
        payload.aud === firebaseProjectId &&
        payload.iss === `https://securetoken.google.com/${firebaseProjectId}`
      ) {
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseWebApiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: cleanToken })
          }
        );
        if (res.ok) {
          const data: any = await res.json();
          const u = data?.users?.[0];
          if (u && u.localId) {
            const verified: VerifiedFirebaseUser = {
              uid: String(u.localId),
              email: String(u.email || payload.email || `user_${u.localId.slice(0, 8)}@miado.app`).toLowerCase(),
              name: u.displayName || payload.name || undefined
            };
            const expMs = payload.exp ? payload.exp * 1000 : now + 15 * 60 * 1000;
            tokenVerificationCache.set(cleanToken, {
              user: verified,
              expiresAt: Math.min(expMs, now + 30 * 60 * 1000)
            });
            return verified;
          }
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Security Headers Middleware (Helmet-equivalent without breaking Vite dev or audio/image CDNs)
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader(
    "Permissions-Policy",
    "autoplay=(self), microphone=(), camera=(), geolocation=()"
  );
  next();
}

/**
 * Lightweight IP Rate Limiter (protects API endpoints against abuse)
 */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = String(req.ip || req.headers["x-forwarded-for"] || "local");
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({
        error: "Muitas requisições em sequência. Aguarde alguns segundos e tente novamente."
      });
      return;
    }
    next();
  };
}

/**
 * Zod Validation Schemas for User Data, Profiles & Preferences
 */
export const UserProfileSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  username: z
    .string()
    .min(2)
    .max(40)
    .trim()
    .transform((v) => (v.startsWith("@") ? v : `@${v}`)),
  bio: z.string().max(300).optional().default(""),
  avatarId: z.string().max(40).optional().default("cat_1"),
  avatarUrl: z.string().max(1500000).optional().default(""),
  bannerUrl: z.string().max(1500000).optional().default(""),
  currentTrack: z.string().max(200).optional().default("Explorando o Miado"),
  favoriteArtists: z.array(z.string().max(100)).max(60).optional().default([]),
  favoriteGenres: z.array(z.string().max(60)).max(30).optional().default([])
});

export const PreferencesSchema = z.object({
  favoriteArtists: z.array(z.string().min(1).max(100)).max(60)
});
