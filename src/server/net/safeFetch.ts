import dns from "dns";
import net from "net";
import { isHostAllowed } from "./allowlists.ts";

export type SafeFetchErrorCode =
  | "invalid_url"
  | "host_not_allowed"
  | "private_address"
  | "too_many_redirects"
  | "timeout"
  | "body_too_large"
  | "bad_content_type"
  | "upstream_status";

export class SafeFetchError extends Error {
  public readonly code: SafeFetchErrorCode;
  constructor(code: SafeFetchErrorCode, message?: string) {
    super(message || code);
    this.name = "SafeFetchError";
    this.code = code;
  }
}

export function isPrivateIpAddress(ipRaw: string): boolean {
  const ip = String(ipRaw || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!ip) return true;

  if (ip.startsWith("::ffff:")) {
    const mappedV4 = ip.slice(7);
    if (net.isIPv4(mappedV4)) {
      return isPrivateIpAddress(mappedV4);
    }
  }

  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((n) => parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
    if (a >= 224) return true; // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    if (ip === "::" || ip === "::1" || ip === "0:0:0:0:0:0:0:1" || ip === "0:0:0:0:0:0:0:0") {
      return true;
    }
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7 unique local
    if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) {
      return true; // fe80::/10 link-local
    }
    if (ip.startsWith("ff")) return true; // ff00::/8 multicast
    if (ip.startsWith("64:ff9b:")) return true; // 64:ff9b::/96 NAT64
    return false;
  }

  return true;
}

export interface SafeFetchOptions {
  allowHosts: readonly (string | RegExp)[];
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  acceptContentType?: RegExp;
  signal?: AbortSignal;
  lookupFn?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

const dnsLookupCache = new Map<
  string,
  { records: Array<{ address: string; family: number }>; expiresAt: number }
>();
const DNS_CACHE_TTL_MS = 10 * 60_000;

async function defaultLookup(hostname: string): Promise<Array<{ address: string; family: number }>> {
  const key = hostname.toLowerCase();
  const now = Date.now();
  const cached = dnsLookupCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.records;
  }
  const records = await dns.promises.lookup(key, { all: true });
  if (records && records.length > 0) {
    dnsLookupCache.set(key, { records, expiresAt: now + DNS_CACHE_TTL_MS });
  }
  return records;
}

export async function validateOutboundUrl(
  rawUrl: string,
  allowHosts: readonly (string | RegExp)[],
  lookupFn: (hostname: string) => Promise<Array<{ address: string; family: number }>> = defaultLookup
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("invalid_url", "Invalid URL syntax");
  }

  if (parsed.username || parsed.password) {
    throw new SafeFetchError("invalid_url", "Credentials in URL are forbidden");
  }

  if (parsed.protocol !== "https:") {
    throw new SafeFetchError("invalid_url", "Only HTTPS URLs are permitted");
  }

  if (parsed.port && parsed.port !== "443" && parsed.port !== "80") {
    throw new SafeFetchError("invalid_url", "Non-standard port forbidden");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    net.isIP(host) !== 0 ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    throw new SafeFetchError("private_address", "Literal IP or private address forbidden");
  }

  if (!isHostAllowed(host, allowHosts)) {
    throw new SafeFetchError("host_not_allowed", `Host not allowed: ${host}`);
  }

  const records = await lookupFn(host);
  if (!records || records.length === 0) {
    throw new SafeFetchError("private_address", "Unable to resolve hostname");
  }
  for (const rec of records) {
    if (isPrivateIpAddress(rec.address)) {
      throw new SafeFetchError("private_address", `Resolved to private IP: ${rec.address}`);
    }
  }

  return parsed;
}

export function detectImageMimeType(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: GIF87a or GIF89a
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return "image/gif";
  }
  // WEBP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function safeFetchBuffer(
  url: string,
  options: SafeFetchOptions
): Promise<{ status: number; headers: Headers; body: Buffer; finalUrl: string }> {
  const maxRedirects = options.maxRedirects ?? 3;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new SafeFetchError("timeout")), options.timeoutMs);

  const onExternalAbort = () => controller.abort(new SafeFetchError("timeout"));
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      throw new SafeFetchError("timeout");
    }
    options.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    let currentUrl = url;
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
      const validated = await validateOutboundUrl(
        currentUrl,
        options.allowHosts,
        options.lookupFn
      );

      const res = await fetch(validated.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
          ...(options.headers || {})
        }
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          throw new SafeFetchError("upstream_status", `Redirect without location`);
        }
        if (redirectCount === maxRedirects) {
          throw new SafeFetchError("too_many_redirects");
        }
        currentUrl = new URL(location, validated).toString();
        continue;
      }

      if (!res.ok && res.status !== 206) {
        throw new SafeFetchError("upstream_status", `Upstream returned ${res.status}`);
      }

      if (options.acceptContentType) {
        const ct = res.headers.get("content-type") || "";
        if (!options.acceptContentType.test(ct)) {
          throw new SafeFetchError("bad_content_type", `Rejected content-type: ${ct}`);
        }
      }

      const contentLengthHeader = res.headers.get("content-length");
      if (contentLengthHeader) {
        const declaredBytes = parseInt(contentLengthHeader, 10);
        if (!isNaN(declaredBytes) && declaredBytes > options.maxBytes) {
          throw new SafeFetchError("body_too_large");
        }
      }

      if (!res.body) {
        return {
          status: res.status,
          headers: res.headers,
          body: Buffer.alloc(0),
          finalUrl: validated.toString()
        };
      }

      const reader = res.body.getReader();
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > options.maxBytes) {
            await reader.cancel();
            throw new SafeFetchError("body_too_large");
          }
          chunks.push(Buffer.from(value));
        }
      }

      return {
        status: res.status,
        headers: res.headers,
        body: Buffer.concat(chunks, totalBytes),
        finalUrl: validated.toString()
      };
    }

    throw new SafeFetchError("too_many_redirects");
  } catch (err: any) {
    if (err instanceof SafeFetchError) throw err;
    if (controller.signal.aborted || err?.name === "AbortError") {
      throw new SafeFetchError("timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener("abort", onExternalAbort);
    }
  }
}
