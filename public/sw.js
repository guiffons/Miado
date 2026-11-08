const CACHE_NAME = "miado-v4";
const ASSETS_TO_CACHE = [
  "/app-logo.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => { });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const hadOldCache = keys.some((key) => key !== CACHE_NAME);
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
      if (hadOldCache) {
        const windowClients = await self.clients.matchAll({ type: "window" });
        for (const client of windowClients) {
          try {
            client.navigate(client.url);
          } catch { }
        }
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Let API, streaming, and hashed Vite assets go straight to network
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/stream") ||
    url.pathname.startsWith("/assets/")
  ) {
    return;
  }

  // Network-first for HTML navigations so new deployments never serve stale index.html
  const isHtmlNavigation =
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    (event.request.headers.get("accept") || "").includes("text/html");

  if (isHtmlNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => { });
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match("/index.html")))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
