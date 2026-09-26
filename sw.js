/* =========================================================
   くらしノート — service worker (offline app shell)
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
  "js/icons.js",
  "js/icons-legacy.js",
  "js/icons-phosphor.js",
  "js/motion.js",
  "js/plan.js",
  "js/when-parse.js",
  "js/icon-system.js",
  "js/icons-v2.js",
  "js/product-icons.js",
  "js/icons-todo.js",
  "js/icons-todo-hand.js",
  "js/icons-food.js",
  "js/icons-goods.js",
  "js/empty-art.js",
  "js/diary-crypto.js",
  "js/diary.js",
  "js/idb.js",
  "js/store.js",
  "js/diary-idb.js",
  "js/ui.js",
  "js/reorder.js",
  "js/keypad.js",
  "js/backup.js",
  "js/insights.js",
  "js/pull-refresh.js",
  "js/cal-peek.js",
  "js/edge-back.js",
  "js/day-swipe.js",
  "js/cal-swipe.js",
  "js/notify.js",
  "js/ics.js",
  "js/food-data.js",
  "js/diet.js",
  "js/drinks.js",
  "js/diet-ai.js",
  "js/sleep-stages.js",
  "js/health-sync.js",
  "js/relay-code.js",
  "js/health-relay.js",
  "js/product-sheet.js",
  "js/screen-archive.js",
  "js/screen-todo.js",
  "js/screen-diet.js",
  "js/screen-list.js",
  "js/screen-prices.js",
  "js/screen-settings.js",
  "js/tab-lens.js",
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
  /* 「index.html」として控えるのは、**アプリの入口を開いたときだけ**。
     前はどのページを開いても控えていたので、tools/ の道具や受け渡しの
     ページ（tools/calendar.html）を一度開くと、それがアプリの入口として
     残り、電波の無いところで開いたときにアプリのかわりに出るところでした。
     入口以外は、ネットから取れなければそのページの控え（無ければ無し）。 */
  if (req.mode === "navigate") {
    const last = url.pathname.split("/").pop();
    const shell = last === "" || last === "index.html" || !last.includes(".");
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (shell && res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("index.html", copy));
          }
          return res;
        })
        .catch(() => (shell
          ? caches.match("index.html").then((r) => r || caches.match("./"))
          : caches.match(req)))
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

/* Tapping the notification should land in the app, on the screen the
   notification was about — and in the copy already running if there is one,
   rather than opening a second one beside it. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const screen = (event.notification.data && event.notification.data.screen) || "todo";
  const target = new URL("./#" + screen, self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && "focus" in client) {
          if ("navigate" in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
