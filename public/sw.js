const CACHE_NAME = "miado-v6";
const ASSETS_TO_CACHE = [
  "/app-logo.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Only handle same-origin static requests; let cross-origin, API, streaming, audio/video, and Range requests go directly to network
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/stream") ||
    url.pathname.startsWith("/assets/") ||
    event.request.headers.has("range") ||
    event.request.destination === "audio" ||
    event.request.destination === "video"
  ) {
    return;
  }

  const isHtmlNavigation =
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    (event.request.headers.get("accept") || "").includes("text/html");

  if (isHtmlNavigation) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(event.request);
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put("/index.html", clone)).catch(() => {});
          }
          return res;
        } catch {
          const cachedPage =
            (await caches.match(event.request)) ||
            (await caches.match("/index.html")) ||
            (await caches.match("/"));
          return (
            cachedPage ||
            new Response("<!doctype html><title>Miado</title>", {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" }
            })
          );
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cached = await caches.match(event.request);
        return cached || new Response("", { status: 504, statusText: "Gateway Timeout" });
      }
    })()
  );
});

