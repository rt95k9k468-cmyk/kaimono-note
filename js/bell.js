/* =========================================================
   くらしノート — 閉じていても鳴る通知（D1、2026年9月27日）

   notify.js の頭に書いてあるとおり、ページの中の時計はページと一緒に
   止まります。閉じているあいだに鳴らすには、外から押してもらうしか
   ありません。押す役は、もう建っている中継所（relay/worker.js の
   「鳴らす役」）に足しました。

   **中継所に渡すのは時刻だけです**（利用者が決めたこと）。
     - 中継所へ：押し先（pushManager の宛先）と、時刻（エポックのミリ秒）の列。
     - 端末の中へ：同じ列の {時刻, 題, id, 回}。Service Worker が押されたときに
       ここを読んで、題を出します（sw.js の push）。
   題もメモも、端末から出ません。

   端末の中の写しは**記録ではありません**。毎回まるごと書き直す控えで、
   消えても次に開いたときに作り直せます（docs/storage.md の「鳴らす役の写し」）。
   日記の入った `kaimono-note` とは別の入れ物にしてあるのは、Service Worker が
   開いたときに版の上げ下げで日記の側の接続を閉じさせないためです。

   動くのは三つが揃ったときだけ：時刻のお知らせ（notify）が入っている・
   設定の「閉じていても鳴らす」（todoBell）が入っている・中継所がつながっている。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const DB = "kaimono-note-bell";
  const DAYS = 7;                       // 今日から7日先まで
  const WAIT = 3000;                    // やることが変わってから送るまで
  const TIMEOUT = 8000;

  /* ---------------- 端末の中の写し（IndexedDB） ----------------

     sw.js にも同じ開き方がある（Service Worker は window を持たないので
     このファイルを読めない）。棚の名前と形を変えるときは両方を。 */
  function openDb() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("plan")) db.createObjectStore("plan", { keyPath: "k" });
        if (!db.objectStoreNames.contains("rung")) db.createObjectStore("rung", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("開けませんでした"));
    });
  }

  function tx(names, mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(names, mode);
      let out;
      try { out = fn(t); } catch (err) { reject(err); return; }
      t.oncomplete = () => { db.close(); resolve(typeof out === "function" ? out() : out); };
      t.onerror = t.onabort = () => { db.close(); reject(t.error || new Error("取り消されました")); };
    }));
  }

  const writePlan = (list) => tx(["plan"], "readwrite", (t) => {
    t.objectStore("plan").put({ k: "list", list, at: Date.now() });
  });

  function readRung() {
    return tx(["rung"], "readonly", (t) => {
      const req = t.objectStore("rung").getAll();
      return () => req.result || [];
    });
  }

  /* ---------------- 何を鳴らすか ---------------- */

  const occ = (day, time) => `${day} ${time}`;

  function epoch(day, time) {
    const d = KN.util.dayDate(day);
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ""));
    if (!d || !m) return NaN;
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d.getTime();
  }

  /**
   * 今日から7日先までの「時刻のあるやること」。くり返しは `fallsOn` で開く。
   * 返すのは {at, time, title, id, occ} の、時刻の早い順。
   * もう過ぎた時刻と、もう知らせた回（`notifiedFor`）は入れません。
   */
  function plan(now) {
    const U = KN.util;
    const at0 = now == null ? Date.now() : now;
    const today = U.todayKey();
    const out = [];
    store.openTodos().forEach((t) => {
      if (t.trace || !t.time || !U.isTime(t.time)) return;
      for (let i = 0; i <= DAYS; i++) {
        const day = U.shiftDay(today, i);
        if (!store.fallsOn(t, day)) continue;
        const at = epoch(day, t.time);
        if (!(at > at0)) continue;
        const o = occ(day, t.time);
        if (t.notifiedFor === o) continue;
        out.push({ at, time: t.time, title: String(t.title || ""), id: t.id, occ: o });
      }
    });
    return out.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  }

  /* ---------------- いつ動くか ---------------- */

  function supported() {
    try {
      return "serviceWorker" in navigator && "PushManager" in window && "indexedDB" in window;
    } catch (err) { return false; }
  }

  const relayUrl = () => (KN.healthRelay && KN.healthRelay.configured() ? KN.healthRelay.url() : "");

  /** 設定に行を出してよいか（時刻のお知らせが入っていて、中継所がある）。 */
  const available = () => supported() && !!relayUrl() && !!(KN.notify && KN.notify.enabled());

  const active = () => available() && store.get().settings.todoBell === true;

  /* ---------------- 中継所とのやりとり ---------------- */

  function bellUrl(what) {
    const u = new URL(relayUrl());
    u.searchParams.set("bell", what);
    return u.href;
  }

  async function post(what, body) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT) : null;
    try {
      /* text/plain の POST は「単純な要求」なので、事前問い合わせが挟まりません。 */
      return await fetch(bellUrl(what), {
        method: "POST",
        body: body == null ? "" : body,
        cache: "no-store",
        signal: ctl ? ctl.signal : undefined,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** 公開の鍵。鳴らす役を持たない（古い）中継所なら null。

      本文なしの POST にしてあるのは、古い中継所に届いても「空です」で
      断られるだけにするため（relay/worker.js の頭）。 */
  async function relayKey() {
    const res = await post("key");
    if (!res.ok || res.headers.get("X-Kn-Bell") !== "1") return null;
    const key = (await res.text()).trim();
    return /^[A-Za-z0-9_-]{80,90}$/.test(key) ? key : null;
  }

  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  function fromB64u(s) {
    const t = s.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(t + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
  }

  /* 押し先を作ったときの鍵。押し先が自分の鍵を答えない端末（`options` の
     無い版）でも、鍵が変わったかどうかが分かるように、写しの棚に覚えます。
     答えない端末で「分からないから作り直す」にすると、開くたびに押し先が
     変わって、中継所への書き込みが毎回起きます。 */
  const readUsedKey = () => tx(["plan"], "readonly", (t) => {
    const req = t.objectStore("plan").get("key");
    return () => (req.result && req.result.key) || "";
  }).catch(() => "");
  const writeUsedKey = (key) => tx(["plan"], "readwrite", (t) => {
    t.objectStore("plan").put({ k: "key", key });
  }).catch(() => {});

  /** 押し先。中継所の鍵と違う鍵で作ったものなら、作り直します。 */
  async function pushSub(key) {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const had = sub.options && sub.options.applicationServerKey;
      const used = had ? b64u(had) : await readUsedKey();
      if (used !== key) {
        try { await sub.unsubscribe(); } catch (err) { /* 作り直すので構わない */ }
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
      await writeUsedKey(key);
    }
    return sub;
  }

  /* ---------------- 送る ---------------- */

  let lastSig = null;      // 最後に中継所へ送った時刻の列
  let lastSub = null;      // 最後に中継所へ送った押し先
  let running = null;

  /**
   * いまの列を、端末の写しと中継所へ。{ ok, reason } を返す。
   * reason: "off"（揃っていない）・"old"（中継所が古い）・"push"（押し先が作れない）・"net"
   */
  function sync(opts) {
    if (running) return running.then(() => sync(opts));
    running = run(opts || {}).finally(() => { running = null; });
    return running;
  }

  async function run({ force } = {}) {
    if (!active()) return { ok: false, reason: "off" };
    const list = plan();
    const sig = list.map((x) => x.at).join(",");
    /* 題が変わっただけでも写しは書き直す（中継所へは時刻しか行かないので、
       そちらは時刻の列が変わったときだけ）。 */
    try { await writePlan(list); } catch (err) { /* 写せない端末は、題なしで鳴る */ }
    if (!force && sig === lastSig && lastSub) return { ok: true };

    let key;
    try { key = await relayKey(); } catch (err) { return { ok: false, reason: "net" }; }
    if (!key) return { ok: false, reason: "old" };

    let sub;
    try { sub = await pushSub(key); } catch (err) { return { ok: false, reason: "push" }; }
    const subText = JSON.stringify(sub);
    try {
      if (subText !== lastSub) {
        const r = await post("sub", subText);
        if (!r.ok) return { ok: false, reason: "net" };
        lastSub = subText;
      }
      const r = await post("times", JSON.stringify(list.map((x) => x.at)));
      if (!r.ok) return { ok: false, reason: "net" };
      lastSig = sig;
    } catch (err) {
      return { ok: false, reason: "net" };
    }
    return { ok: true };
  }

  /** 入れる（設定のスイッチから）。通ったときだけ todoBell を立てます。 */
  async function start() {
    if (!available()) return { ok: false, reason: "off" };
    store.update((s) => { s.settings.todoBell = true; });
    lastSig = null;
    lastSub = null;
    const res = await sync({ force: true });
    if (!res.ok) store.update((s) => { s.settings.todoBell = false; });
    return res;
  }

  /** 切る。中継所の押し先と時刻の列を捨て、端末の押し先も外します。 */
  async function stop() {
    const url = relayUrl();
    store.update((s) => { s.settings.todoBell = false; });
    lastSig = null;
    lastSub = null;
    try { await writePlan([]); } catch (err) { /* 無くても困らない */ }
    if (url) { try { await post("off"); } catch (err) { /* 次に入れたとき置き直す */ } }
    try {
      if (supported()) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
    } catch (err) { /* 押し先が残っても、中継所の列が空なので鳴らない */ }
  }

  /* ---------------- 鳴らした回を、アプリへ ----------------

     Service Worker が鳴らした {id, 回} を「もう言った」（`notifiedFor`）へ。
     これが無いと、開いた瞬間に notify.js の tick() が同じものをもう一度
     鳴らします。回が変わった用事（時刻を動かした・次の回へ進んだ）には
     当てません。 */
  async function absorb() {
    if (store.get().settings.todoBell !== true || !supported()) return 0;
    let rows;
    try { rows = await readRung(); } catch (err) { return 0; }
    if (!rows.length) return 0;
    const byId = new Map(store.openTodos().map((t) => [t.id, t]));
    const ids = rows.filter((r) => {
      const t = byId.get(r.id);
      return t && t.due && t.time && occ(t.due, t.time) === r.occ && t.notifiedFor !== r.occ;
    }).map((r) => r.id);
    if (ids.length) store.markAnnounced(ids);
    /* 一日より古い控えは捨てます（回は日付を含むので、もう当たらない）。 */
    const old = rows.filter((r) => !(r.at > Date.now() - 86400 * 1000));
    if (old.length) {
      try { await tx(["rung"], "readwrite", (t) => { old.forEach((r) => t.objectStore("rung").delete(r.key)); }); }
      catch (err) { /* 次に */ }
    }
    return ids.length;
  }

  /** アプリの側で鳴らした回を、Service Worker にも知らせる（二度鳴らさない）。 */
  function noteRung(todos) {
    if (store.get().settings.todoBell !== true || !supported() || !todos.length) return Promise.resolve();
    const now = Date.now();
    return tx(["rung"], "readwrite", (t) => {
      todos.forEach((x) => {
        if (!x.due || !x.time) return;
        const o = occ(x.due, x.time);
        t.objectStore("rung").put({ key: `${x.id} ${o}`, id: x.id, occ: o, at: now });
      });
    }).catch(() => {});
  }

  /* ---------------- 見張り ---------------- */

  let timer = null;

  function init() {
    if (!supported()) return;
    /* やることが変わったら、間を置いて。時刻の列が同じなら中継所へは
       何も送りません（run の lastSig）。 */
    store.subscribe(() => {
      if (!active()) return;
      clearTimeout(timer);
      timer = setTimeout(() => { sync(); }, WAIT);
    });
    /* 開くたび。7日の窓がずれて、新しい日の時刻が列に入ります。 */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && active()) sync();
    });
    if (active()) sync({ force: true });
  }

  KN.bell = { supported, available, active, plan, sync, start, stop, absorb, noteRung, init, DB };
})();
