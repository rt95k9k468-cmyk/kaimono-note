/* =========================================================
   かいものノート — service worker (offline app shell)
   ========================================================= */

const VERSION = "v1.0.0";
const CACHE = `kaimono-note-${VERSION}`;

const ASSETS = [
  "./",
  "index.html",
  "css/base.css",
  "css/components.css",
  "css/screens.css",
  "js/util.js",
  "js/product-icons.js",
  "js/store.js",
  "js/ui.js",
  "js/reorder.js",
  "js/backup.js",
  "js/insights.js",
  "js/pull-refresh.js",
  "js/product-sheet.js",
  "js/screen-list.js",
  "js/screen-prices.js",
  "js/screen-compare.js",
  "js/screen-settings.js",
  "js/app.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Individual failures (e.g. a missing icon) must not abort the install.
      .then((cache) => Promise.allSettled(ASSETS.map((a) => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("kaimono-note-") && k !== CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a deploy is picked up, cache as fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
