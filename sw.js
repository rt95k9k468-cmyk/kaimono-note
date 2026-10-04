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
  "js/errlog.js",
  "js/util.js",
  "js/icons.js",
  "js/icons-phosphor.js",
  "js/motion.js",
  "js/plan.js",
  "js/day-road.js",
  "js/when-parse.js",
  "js/split-items.js",
  "js/capture.js",
  "js/season.js",
  "js/icon-system.js",
  "js/icons-v2-keys.js",
  "js/product-icons.js",
  "js/icons-todo.js",
  "js/icons-food.js",
  "js/icons-goods.js",
  "js/empty-art.js",
  "js/diary-crypto.js",
  "js/diary.js",
  "js/idb.js",
  "js/drinks.js",
  "js/store.js",
  "js/diary-idb.js",
  "js/note-format.js",
  "js/notes-idb.js",
  "js/ui.js",
  "js/reorder.js",
  "js/keypad.js",
  "js/backup.js",
  "js/dropbox.js",
  "js/audit.js",
  "js/insights.js",
  "js/pull-refresh.js",
  "js/cal-peek.js",
  "js/edge-back.js",
  "js/day-swipe.js",
  "js/cal-swipe.js",
  "js/head.js",
  "js/upcoming.js",
  "js/search-all.js",
  "js/notify.js",
  "js/ics.js",
  "js/food-data.js",
  "js/diet.js",
  "js/diet-ai.js",
  "js/sleep-stages.js",
  "js/health-sync.js",
  "js/relay-code.js",
  "js/health-relay.js",
  "js/bell.js",
  "js/due-sheet.js",
  "js/product-sheet.js",
  "js/screen-archive.js",
  "js/screen-todo.js",
  "js/screen-diet.js",
  "js/screen-list.js",
  "js/screen-prices.js",
  "js/screen-notes.js",
  "js/yearbook.js",
  "js/screen-settings.js",
  "js/settings-look.js",
  "js/settings-todo.js",
  "js/settings-list.js",
  "js/settings-daily.js",
  "js/settings-notes.js",
  "js/settings-diet.js",
  "js/settings-relay.js",
  "js/settings-backup.js",
  "js/lock.js",
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

/* ---------------- 閉じていても鳴る通知（D1。js/bell.js） ----------------

   中継所は中身なしで押してきます。何の時刻かは知らせてこない——中継所に
   題を渡していないので（利用者が決めたこと）。だから、アプリが写しておいた
   {時刻, 題, id, 回} の列（IndexedDB `kaimono-note-bell`）から、いまの時刻に
   当たるものを探して題を出します。

   出す形は notify.js の tick() と同じ（「19:30 題 ほか◯件」）。見つからなければ
   「やることの時刻です」。**押されたら必ず何か出すこと**——出さない押しが
   続くと、iPhone は押し先を取り上げます（userVisibleOnly の約束）。

   開き方と棚の形は js/bell.js と同じ。変えるときは両方を。 */
const BELL_DB = "kaimono-note-bell";
/* 中継所は分の頭に、その分までの時刻を押します。だから先の側は時計のずれ
   ぶんだけ見ればよく、一分まで広げると隣の分の用事を早く鳴らします。 */
const BELL_EARLY = 40 * 1000;
const BELL_LATE = 11 * 60 * 1000;   // 押しの寿命（TTL）は10分

function bellDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BELL_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("plan")) db.createObjectStore("plan", { keyPath: "k" });
      if (!db.objectStoreNames.contains("rung")) db.createObjectStore("rung", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function bellRead(db) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(["plan", "rung"], "readonly");
    const p = t.objectStore("plan").get("list");
    const r = t.objectStore("rung").getAll();
    t.oncomplete = () => resolve({ list: (p.result && p.result.list) || [], rung: r.result || [] });
    t.onerror = t.onabort = () => reject(t.error);
  });
}

function bellMark(db, rows, now) {
  return new Promise((resolve) => {
    const t = db.transaction(["rung"], "readwrite");
    rows.forEach((x) => t.objectStore("rung").put({ key: `${x.id} ${x.occ}`, id: x.id, occ: x.occ, at: now }));
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => resolve();
  });
}

/** いまの押しで出すもの。{ title, body, renotify, ids }（ids は押したときに開く用事、R3） */
async function bellNotice(now) {
  const plain = { title: "やることの時刻です", body: "", renotify: true, ids: [] };
  let db;
  try { db = await bellDb(); } catch (err) { return plain; }
  try {
    const { list, rung } = await bellRead(db);
    const said = new Set(rung.map((r) => r.key));
    const hit = list.filter((x) => x.at <= now + BELL_EARLY && x.at >= now - BELL_LATE);
    if (!hit.length) return plain;
    const fresh = hit.filter((x) => !said.has(`${x.id} ${x.occ}`));
    /* ぜんぶ、もうアプリが鳴らしていた（開いていた）。同じ札を静かに
       出し直すだけにして、二度は震わせません。 */
    const show = fresh.length ? fresh : hit;
    const first = show[0];
    const title = show.length === 1
      ? `${first.time} ${first.title}`
      : `${first.time} ${first.title} ほか${show.length - 1}件`;
    const body = show.length === 1
      ? "やることの時刻です"
      : show.map((x) => `${x.time} ${x.title}`).join("\n");
    if (fresh.length) await bellMark(db, fresh, now);
    return { title, body, renotify: fresh.length > 0, ids: show.map((x) => x.id) };
  } catch (err) {
    return plain;
  } finally {
    try { db.close(); } catch (err) { /* もう閉じている */ }
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(bellNotice(Date.now()).then((n) => self.registration.showNotification(n.title, {
    body: n.body,
    tag: "kn-todo-time",          // notify.js の tick() と同じ札（重ねず差し替える）
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    lang: "ja",
    renotify: n.renotify,
    data: { screen: "todo", due: n.ids },   // 押したら、その用事の紙（js/due-sheet.js）
  })));
});

/* Tapping the notification should land in the app, on the screen the
   notification was about — and in the copy already running if there is one,
   rather than opening a second one beside it. */
/* 押したことの控え（2026年9月29日、iPhone で「通知は来るけど、押しても何も」）。
   iPhone では、眠っている窓への `navigate` が効かないことがあり、閉じていた
   ときの `openWindow` は `#due=` を落とすことがある。だから行き先とは別に、
   押した時刻と id を小さな控えに置く。アプリは開いたとき・戻ってきたときに
   これを読んで紙を開き、読んだら消す（js/due-sheet.js の take）。控えの箱の
   名前は `kaimono-note-` で始めない——版が替わる掃除（activate）で消えないように。 */
const DUE_BOX = "kn-due-click";
const DUE_KEY = "./__due-click";

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const screen = data.screen || "todo";
  /* 時刻の通知は、その時刻の用事の id を持っています（R3）。`#due=` で開くと
     app.js が js/due-sheet.js の紙を出します。id が無い（写しに見つからなかった）
     時刻の通知も、控えは置く——アプリの側で、いま時刻の来た用事を探す。 */
  const due = Array.isArray(data.due) ? data.due.filter((x) => typeof x === "string" && x) : [];
  const timed = screen === "todo" && event.notification.tag === "kn-todo-time";
  const hash = due.length ? "due=" + due.map(encodeURIComponent).join(",") : screen;
  const target = new URL("./#" + hash, self.location.href).href;
  /* 控えには、どの道で開こうとしたか（via）も書く——iPhone で「出ない」とき、
     アプリの「困ったときの記録」に足あととして残り、どこで途切れたかが分かる。 */
  const put = (via) => (timed
    ? caches.open(DUE_BOX).then((c) => c.put(DUE_KEY, new Response(JSON.stringify({ at: Date.now(), due, via, ver: VERSION }),
        { headers: { "content-type": "application/json" } }))).catch(() => {})
    : Promise.resolve());
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => c.url.startsWith(self.registration.scope) && "focus" in c);
      if (client) {
        const nav = "navigate" in client;
        return put(nav ? "focus+navigate" : "focus").then(() => {
          if (timed) client.postMessage({ type: "due-click" });
          if (nav) client.navigate(target).catch(() => {});
          return client.focus();
        });
      }
      return put(self.clients.openWindow ? "openWindow" : "none")
        .then(() => (self.clients.openWindow ? self.clients.openWindow(target) : undefined));
    })
  );
});
