export const ALLOWED_IMAGE_HOSTS: readonly (string | RegExp)[] = [
  "e-cdns-images.dzcdn.net",
  "cdns-images.dzcdn.net",
  /\.dzcdn\.net$/i,
  /\.mzstatic\.com$/i,
  /\.apple\.com$/i,
  /\.saavncdn\.com$/i,
  /\.jiosaavn\.com$/i,
  /\.sndcdn\.com$/i,
  /\.thecatapi\.com$/i,
  "images.unsplash.com",
  /\.unsplash\.com$/i,
  "cataas.com",
  /\.cataas\.com$/i,
  /\.wikimedia\.org$/i,
  /\.archive\.org$/i,
  /\.googleusercontent\.com$/i,
  /\.ggpht\.com$/i,
  /\.ytimg\.com$/i
];

export const ALLOWED_API_HOSTS: readonly (string | RegExp)[] = [
  "api.deezer.com",
  "itunes.apple.com",
  "rss.applemarketingtools.com",
  "www.jiosaavn.com",
  "jiosaavn.com",
  "api.thecatapi.com",
  "archive.org",
  /\.archive\.org$/i,
  "api-v2.soundcloud.com",
  "soundcloud.com",
  /\.sndcdn\.com$/i,
  /\.audius\.co$/i,
  /\.audius\.org$/i,
  /\.cultur3stake\.com$/i,
  /\.figment\.io$/i,
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firestore.googleapis.com",
  "www.googleapis.com",
  "pipedapi.ducks.party",
  "api.piped.private.coffee",
  "pipedapi.tokhmi.xyz",
  "pipedapi.r4fo.com",
  "pipedapi.kavin.rocks",
  "inv.tux.pizza",
  "iv.melmac.space",
  "invidious.nerdvpn.de"
];

export const ALLOWED_STREAM_HOSTS: readonly (string | RegExp)[] = [
  ...ALLOWED_API_HOSTS,
  ...ALLOWED_IMAGE_HOSTS,
  /\.googlevideo\.com$/i,
  /\.apple\.com$/i,
  /\.mzstatic\.com$/i,
  /\.dzcdn\.net$/i,
  /\.saavncdn\.com$/i,
  /\.sndcdn\.com$/i,
  /\.archive\.org$/i,
  /\.piped\.private\.coffee$/i,
  /\.ducks\.party$/i,
  /\.tokhmi\.xyz$/i,
  /\.r4fo\.com$/i,
  /\.kavin\.rocks$/i,
  /\.tux\.pizza$/i,
  /\.melmac\.space$/i,
  /\.nerdvpn\.de$/i
];

export function isHostAllowed(
  hostname: string,
  allowlist: readonly (string | RegExp)[]
): boolean {
  const cleanHost = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!cleanHost) return false;
  // Reject IPv4 or IPv6 literal hostnames
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanHost) || cleanHost.includes(":")) {
    return false;
  }
  for (const rule of allowlist) {
    if (typeof rule === "string") {
      const r = rule.toLowerCase();
      if (r.startsWith(".")) {
        if (cleanHost === r.slice(1) || cleanHost.endsWith(r)) return true;
      } else if (cleanHost === r) {
        return true;
      }
    } else if (rule instanceof RegExp) {
      if (rule.test(cleanHost)) return true;
    }
  }
  return false;
}
