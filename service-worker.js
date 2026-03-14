// ============================================================
// BabyTracker Service Worker
//
// Update strategy:
// - App shell files use Network First so new deployments reach
//   installed users automatically when they reopen the app online.
// - Cached responses remain available as an offline fallback.
// ============================================================

const CACHE_VERSION = "v2";
const CACHE_NAME = `eitan-or-pwa-shell-${CACHE_VERSION}`;

const APP_SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/app-core.mjs",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("eitan-or-pwa-shell-") && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName)),
    ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith("http")) return;

  const isAppShellRequest = APP_SHELL_ASSETS.some((asset) => {
    const assetUrl = new URL(asset, self.location.origin);
    return assetUrl.pathname === url.pathname;
  });

  event.respondWith(
    isAppShellRequest
      ? networkFirst(request)
      : staleWhileRevalidate(request),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request, { cache: "no-store" });
    if (networkResponse && networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    return offlineFallback();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) return cachedResponse;

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  return offlineFallback();
}

function offlineFallback() {
  return new Response(
    `<!doctype html>
     <html lang="he" dir="rtl">
       <head><meta charset="UTF-8"><title>מצב לא מקוון</title></head>
       <body style="font-family:sans-serif;text-align:center;padding:40px;">
         <h1>📵 אין חיבור לאינטרנט</h1>
         <p>האפליקציה תחזור לפעול ברגע שהחיבור יחודש.</p>
       </body>
     </html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
