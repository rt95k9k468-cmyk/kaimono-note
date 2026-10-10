/* =========================================================
   くらしノート — service worker (offline app shell)
   ========================================================= */

const VERSION = "v1.0.0";
const CACHE = `kaimono-note-${VERSION}`;
/* 季節の絵の置き場（版をまたいで残す。下の fetch）。絵を同じ名前のまま描き直したら名前の数を上げる——
   activate が前の置き場を丸ごと消し、端末は見たときに新しい絵を取り直す（v2：空と写真の画質を上げた 2026-10-08）。 */
const SEASON_CACHE = "kurashi-season-v2";

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
  "js/activity.js",
  "js/unfold.js",
  "js/when-parse.js",
  "js/split-items.js",
  "js/capture.js",
  "js/season.js",
  "js/holiday.js",
  "js/season-art.js",
  "js/icon-system.js",
  "js/icons-v2-keys.js",
  "js/product-icons.js",
  "js/shun.js",
  "js/icons-todo.js",
  "js/icons-food.js",
  "js/icons-goods.js",
  "js/empty-art.js",
  "js/diary-crypto.js",
  "js/diary.js",
  "js/idb.js",
  "js/drinks.js",
  "js/store.js",
  "js/live-idb.js",
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
  "js/cal-grid.js",
  "js/head.js",
  "js/sky.js",
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

/* 入口をネットで待つのはここまで。来なければ控えの入口で開く（roadmap-seamless の N2。
   店の中の、つながっているのに返事の来ない電波）。 */
const SHELL_WAIT = 1500;

/* 変わったファイルだけ取りに行く（roadmap-seamless の N3）。css・js の `?v=` は stamp-build.js が付ける中身の印
   （sha-256 の頭12桁）なので、同じ URL が前の控えにあれば中身も同じ——写すだけで、取りに行かない。
   **css・js が一つでも取れなければ install を失敗させる**（欠けた版で開かない＝3節の2。前の Service Worker の
   ままで、次の確かめでやり直す）。絵や manifest は欠けてよい。 */
const CODE = /^(?:css|js)\//;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((a) => keep(cache, a).catch((err) => { if (CODE.test(a)) throw err; }))))
      .then(() => self.skipWaiting(),
        (err) => caches.delete(CACHE).then(() => { throw err; }))   // 半分の控えを残さない（kept() が拾わないように）
  );
});

/** 中身の印（12桁の16進）。無ければ ""（手元の版・入口・絵）。 */
function markOf(url) {
  const v = new URL(url, self.location.href).searchParams.get("v") || "";
  return /^[0-9a-f]{12}$/.test(v) ? v : "";
}

/* 取ったものの中身が印と合うか（印の無いものは問わない）。配っている途中に前の中身を掴んだら控えない
   ——印の URL は裏で取り直さないので、控えたら残り続ける。 */
async function sound(url, res) {
  const v = markOf(url);
  if (!v) return true;
  const sum = new Uint8Array(await crypto.subtle.digest("SHA-256", await res.clone().arrayBuffer()));
  return [...sum.slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("") === v;
}

/** 控えに一つ入れる：印のある URL が前の控えにあれば写し、無ければ取りに行く。取れない・印が合わなければ投げる。
    `no-cache`：HTTP の10分の控え（GitHub Pages）から古い index.html を拾わない（N2）。 */
async function keep(cache, url) {
  const href = new URL(url, self.location.href).href;
  if (markOf(href)) {
    const hit = await caches.match(href);
    if (hit) return cache.put(href, hit);
  }
  const res = await fetch(new Request(href, { cache: "no-cache" }));
  if (!res.ok || !(await sound(href, res))) throw new Error(`${url} ${res.status}`);
  return cache.put(href, res);
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => (k.startsWith("kaimono-note-") && k !== CACHE) || (k.startsWith("kurashi-season-") && k !== SEASON_CACHE))
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
    if (!shell) {
      event.respondWith(fetch(req).catch(() => caches.match(req)));
      return;
    }
    /* 入口（N2）：ネットは `no-cache`（HTTP の10分の控えを越えて確かめ直す。変わっていなければ小さな返事）。
       SHELL_WAIT 待って来なければ控えの入口で開き、ネットの返事は後から控えに入れる（次に開くとき新しい版）。 */
    const net = fetch(new Request(req, { cache: "no-cache" }));
    const kept = () => caches.match("index.html").then((r) => r || caches.match("./"));
    event.waitUntil(net.then((res) => (res && res.ok ? keepShell(res.clone()) : null)).catch(() => {}));
    event.respondWith(new Promise((resolve) => {
      let done = false;
      const give = (r, from) => { if (r && !done) { done = true; openedAs(event.resultingClientId, from); resolve(r); } };
      const timer = setTimeout(() => kept().then((r) => give(r, "kept")), SHELL_WAIT);
      net.then((res) => { clearTimeout(timer); give(res, "net"); },
        () => { clearTimeout(timer); kept().then((r) => give(r || Response.error(), r ? "kept" : "net")); });
    }));
    return;
  }

  /* 季節の絵（3.0 の E1・js/season-art.js。daily の写真 img/season-photo/・ノートの広重 img/season/）と帯の空の写真（js/sky.js・img/sky/）。
     **別の名前のキャッシュ**に覚える（`kaimono-note-` で始めない）
     ——版のキャッシュに入れると、activate が古い版ごと消し、出すたびに見た絵が消えてオフラインで色だけに戻る。
     絵は変わらないので、先にキャッシュ、無ければ取りに行って覚える（裏で取り直さない）。 */
  if (url.pathname.includes("/img/season/") || url.pathname.includes("/img/season-photo/") || url.pathname.includes("/img/sky/")) {
    event.respondWith(
      caches.open(SEASON_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.status === 200) c.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  /* 中身の印のある URL（N3）は中身が変わらないので、裏で取り直さない。控えるのは印の合うものだけ。 */
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached && markOf(req.url)) return cached;
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            sound(req.url, copy).then((ok) => ok && caches.open(CACHE).then((c) => c.put(req, copy))).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* 控えの入口を差し替えるのは、その入口が読む css・js が全部この控えに揃ってから（roadmap-seamless の3節の2）。
   揃わないうちは前の入口のまま——電波の無いときに、半分しか無い版で開かないように。足りないものはここで取る。 */
async function keepShell(res) {
  const html = await res.clone().text();
  const cache = await caches.open(CACHE);
  const refs = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"]+)"/g)].map((m) => new URL(m[1], self.location.href).href);
  await Promise.all(refs.map((u) => cache.match(u).then((hit) => hit || keep(cache, u))));
  await cache.put("index.html", res);
}

/* いま控えを持っている版を訊かれたら答える（N1。app.js の controllerchange が、動いている版と比べる）。 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "kn-version" && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION });
  }
  /* 入口をネットと控えのどちらから出したか（N9。errlog.js が起動の控えに書く）。 */
  if (event.data && event.data.type === "kn-opened" && event.ports && event.ports[0]) {
    const id = event.source && event.source.id;
    event.ports[0].postMessage({ from: opened.get(id) || openedLast || "?" });
  }
});

/* 窓ごとに、入口の出どころを覚える（新しい3つだけ）。resultingClientId が無い端末は最後の一つで答える。 */
const opened = new Map();
let openedLast = "";
function openedAs(id, from) {
  openedLast = from;
  if (!id) return;
  opened.set(id, from);
  while (opened.size > 3) opened.delete(opened.keys().next().value);
}

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
