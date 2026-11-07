import { z } from "zod";

const DEFAULT_INSTANCES = [
  { type: "piped" as const, url: "https://pipedapi.ducks.party" },
  { type: "piped" as const, url: "https://api.piped.private.coffee" },
  { type: "piped" as const, url: "https://pipedapi.tokhmi.xyz" },
  { type: "piped" as const, url: "https://pipedapi.r4fo.com" },
  { type: "piped" as const, url: "https://pipedapi.kavin.rocks" },
  { type: "invidious" as const, url: "https://inv.tux.pizza/api/v1" },
  { type: "invidious" as const, url: "https://iv.melmac.space/api/v1" },
  { type: "invidious" as const, url: "https://invidious.nerdvpn.de/api/v1" }
];

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  FRAME_ANCESTORS: z.string().default("'self' https://*.google.com https://*.run.app"),
  PIPED_INVIDIOUS_INSTANCES: z.string().optional()
});

function parseConfig() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    if (process.env.NODE_ENV === "production") {
      console.error("Invalid environment configuration");
      process.exit(1);
    }
    return {
      PORT: 3000,
      NODE_ENV: "development" as const,
      APP_URL: undefined,
      TRUST_PROXY_HOPS: 1,
      FRAME_ANCESTORS: "'self' https://*.google.com https://*.run.app",
      instances: DEFAULT_INSTANCES
    };
  }

  let instances = DEFAULT_INSTANCES;
  if (parsed.data.PIPED_INVIDIOUS_INSTANCES) {
    try {
      const custom = JSON.parse(parsed.data.PIPED_INVIDIOUS_INSTANCES);
      if (Array.isArray(custom) && custom.length > 0) {
        instances = custom;
      }
    } catch {
      // keep defaults
    }
  }

  return Object.freeze({
    ...parsed.data,
    instances
  });
}

export const appConfig = parseConfig();
