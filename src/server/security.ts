import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { TtlLruCache } from "./storage/ttlLruCache.ts";

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
  emailVerified: boolean;
  provider: string;
  name?: string;
}

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCerts: Record<string, string> | null = null;
let certsExpiresAt = 0;

export function setMockGoogleCertsForTest(certs: Record<string, string>, ttlMs = 3600_000): void {
  cachedCerts = certs;
  certsExpiresAt = Date.now() + ttlMs;
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < certsExpiresAt) {
    return cachedCerts;
  }
  const res = await fetch(GOOGLE_CERTS_URL, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error("failed_to_fetch_certs");
  }
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
  const certs = (await res.json()) as Record<string, string>;
  cachedCerts = certs;
  certsExpiresAt = now + Math.max(60, maxAgeSec) * 1000;
  return certs;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  expectedProjectId = firebaseProjectId
): Promise<VerifiedFirebaseUser | null> {
  const cleanToken = String(idToken || "").trim();
  if (!cleanToken || cleanToken.length < 30 || cleanToken.length > 4096) return null;

  const parts = cleanToken.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

    if (header.alg !== "RS256" || !header.kid || typeof header.kid !== "string") {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || typeof payload.exp !== "number" || payload.exp <= nowSec) {
      return null;
    }
    if (!payload.iat || typeof payload.iat !== "number" || payload.iat > nowSec + 60) {
      return null;
    }
    if (payload.auth_time !== undefined && payload.auth_time > nowSec + 60) {
      return null;
    }
    if (payload.aud !== expectedProjectId) {
      return null;
    }
    if (payload.iss !== `https://securetoken.google.com/${expectedProjectId}`) {
      return null;
    }
    if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) {
      return null;
    }

    // 1. Cryptographic RSA-SHA256 verification against Google X.509 certificates
    try {
      const certs = await getGooglePublicCerts();
      const certPem = certs[header.kid];
      if (!certPem) return null;

      const verify = crypto.createVerify("RSA-SHA256");
      verify.update(`${parts[0]}.${parts[1]}`);
      verify.end();
      const sigBuf = Buffer.from(parts[2], "base64url");
      const validSig = verify.verify(certPem, sigBuf);
      if (!validSig) return null;

      const provider = String(payload.firebase?.sign_in_provider || "custom");
      if (provider === "anonymous") return null;

      return {
        uid: payload.sub,
        email: String(payload.email || "").toLowerCase().trim(),
        emailVerified: payload.email_verified === true || provider === "google.com",
        provider,
        name: payload.name || undefined
      };
    } catch {
      // Fallback to IdentityToolkit lookup if X.509 endpoint is unreachable in restricted network
      if (firebaseWebApiKey) {
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
          if (u && u.localId && u.localId === payload.sub) {
            const provider = String(payload.firebase?.sign_in_provider || "password");
            if (provider === "anonymous") return null;
            return {
              uid: String(u.localId),
              email: String(u.email || payload.email || "").toLowerCase().trim(),
              emailVerified: u.emailVerified === true || payload.email_verified === true || provider === "google.com",
              provider,
              name: u.displayName || payload.name || undefined
            };
          }
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: VerifiedFirebaseUser | null;
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = crypto.randomBytes(8).toString("hex");
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "autoplay=(self), microphone=(), camera=(), geolocation=()"
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.removeHeader("X-XSS-Protection");
  next();
}

export async function attachAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    req.authUser = await verifyFirebaseIdToken(token);
  } else {
    req.authUser = null;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser || !req.authUser.uid) {
    res.status(401).json({ error: "unauthorized", requestId: req.requestId });
    return;
  }
  next();
}

export function requireVerifiedUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser || !req.authUser.uid) {
    res.status(401).json({ error: "unauthorized", requestId: req.requestId });
    return;
  }
  if (!req.authUser.emailVerified || req.authUser.provider === "anonymous") {
    res.status(403).json({ error: "email_not_verified", requestId: req.requestId });
    return;
  }
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new TtlLruCache<string, RateBucket>({
  maxEntries: 50_000,
  maxBytes: 4 * 1024 * 1024,
  ttlMs: 5 * 60_000,
  sizeOf: () => 64
});

export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  keyFn?: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const callerKey = keyFn ? keyFn(req) : String(req.ip || req.socket?.remoteAddress || "local");
    const routePath =
      req.baseUrl && req.baseUrl !== "/api"
        ? `${req.baseUrl}${req.path || ""}`
        : `${req.baseUrl || ""}${req.path || ""}`;
    const key = `${callerKey}:${routePath}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs }, windowMs);
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limit_exceeded",
        requestId: req.requestId
      });
      return;
    }
    next();
  };
}

export const UserProfileSchema = z
  .object({
    name: z.string().min(1).max(80).trim(),
    username: z
      .string()
      .min(2)
      .max(40)
      .trim()
      .transform((v) => (v.startsWith("@") ? v : `@${v}`)),
    bio: z.string().max(300).optional().default(""),
    avatarId: z.string().max(40).optional().default("cat_1"),
    avatarUrl: z.string().max(100000).optional().default(""),
    bannerUrl: z.string().max(150000).optional().default(""),
    currentTrack: z.string().max(200).optional().default(""),
    favoriteArtists: z.array(z.string().max(100)).max(60).optional().default([]),
    favoriteGenres: z.array(z.string().max(60)).max(30).optional().default([])
  })
  .strict();

export const PreferencesSchema = z
  .object({
    favoriteArtists: z.array(z.string().min(1).max(100)).max(60)
  })
  .strict();
