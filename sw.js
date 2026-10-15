const CACHE_NAME = "private-itinerary-v41";
const APP_FILES = [
  "./", "./index.html", "./app.js?v=40", "./theme.js?v=40", "./data.enc.js",
  "./manifest.webmanifest", "./icon.svg", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_FILES);
    // Vite returns a JS module for a generic CSS fetch; ?direct requests the stylesheet.
    const css = await fetch("./styles.css?direct&v=41");
    if (!css.ok || !css.headers.get("content-type")?.startsWith("text/css"))
      throw new Error("Stylesheet unavailable for offline use");
    await cache.put("./styles.css?v=41",css);
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (request.mode === "navigate" || url.pathname.endsWith("/data.enc.js")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return await cache.match(request) || await cache.match("./index.html") ||
          new Response("離線內容尚未準備完成", {status:503});
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
