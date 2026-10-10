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
   * 「前に◯分」（`lead`、段7）を持つものは、出る時刻の一件も足します。
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
        /* 出る時刻（段7）。「前に30分」なら、その時刻にも一度。回は別の名前
           （`… 出る`）にして、absorb が本体の回と取り違えないように——出る時刻に
           鳴っても、時刻そのものはまだ知らせていないので。sw.js は「時刻 題」を
           出すので、題の側に「出る時刻 · 13:00 病院」と書いておきます（sw.js は
           変えずに済み、古い Service Worker でも同じ字になる）。 */
        const lead = Number(t.lead) > 0 ? Number(t.lead) : 0;
        const leave = at - lead * 60000;
        if (lead && leave > at0) {
          const d = new Date(leave);
          const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          out.push({ at: leave, time: hm, title: `出る時刻 · ${t.time} ${String(t.title || "")}`,
                     id: t.id, occ: `${o} 出る` });
        }
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

  /* keepalive … アプリが隠れたあとも送り終える（閉じる瞬間の flush 用。本文は小さい）。 */
  async function post(what, body, keepalive) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT) : null;
    try {
      /* text/plain の POST は「単純な要求」なので、事前問い合わせが挟まりません。 */
      return await fetch(bellUrl(what), {
        method: "POST",
        body: body == null ? "" : body,
        cache: "no-store",
        keepalive: !!keepalive,
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

  /* ---------------- 鳴らなかった回に気づく（roadmap-seamless の N14） ----------------

     iOS は押し先が替わっても知らせず（pushsubscriptionchange が無い）、無効な押し先にも
     成功を返すことがある。だから中継所も端末も気づかないまま鳴らなくなりうる。
     戻ってきたら、閉じていたあいだに時刻の来た回（写しの列）と、鳴った控え（rung）を
     照らす。鳴っていない回があれば、困ったときの記録に件数だけ書き、次に画面を
     押したとき（iPhone は押した流れの中でないと作らせないことがある）押し先を作り
     直して送り直す。一日に一度まで。画面には何も出さない。
     控えは記録の外（localStorage の kaimono-note-bell-*。書き出しにも乗らない）。
     **作り直しは古い押し先を捨ててから**なので、作れなかったら押し先が無いまま残る。だから
     許しの無いときは捨てず、作れなかった日は「作り直した日」にせず（次に戻って鳴らなかった回が
     あれば、また押したときに）、困ったときの記録に一行残す（2026年10月10日）。 */
  const AWAY = "kaimono-note-bell-away";     // 隠れた時刻（ミリ秒）
  const RENEW = "kaimono-note-bell-renew";   // 押し先を作り直せた日
  const GRACE = 3 * 60000;                   // 押しは分の頭に届く。来たばかりの回は数えない
  let back = true;                           // 戻ってきてから、まだ照らしていない
  let armed = false;
  let renewing = false;

  const lsGet = (k) => { try { return localStorage.getItem(k) || ""; } catch (err) { return ""; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (err) { /* 次に */ } };

  const readList = () => tx(["plan"], "readonly", (t) => {
    const req = t.objectStore("plan").get("list");
    return () => (req.result && req.result.list) || [];
  });

  function markAway() {
    back = true;
    if (active()) lsSet(AWAY, String(Date.now()));
  }

  /** 閉じていたあいだの回を照らす。鳴っていない回の数を返す。 */
  async function lookBack(rows) {
    back = false;
    const away = Number(lsGet(AWAY));
    const now = Date.now();
    if (!active() || !(away > 0)) return 0;
    lsSet(AWAY, String(now));
    let list;
    try {
      list = await readList();
      if (!rows) rows = await readRung();
    } catch (err) { return 0; }
    const said = new Set(rows.map((r) => r.key));
    const miss = list.filter((x) => x.at > away && x.at <= now - GRACE && x.at > now - 86400 * 1000
      && !said.has(`${x.id} ${x.occ}`)).length;
    if (!miss) return 0;
    if (KN.errlog) KN.errlog.note("notice", `閉じていても鳴らす：鳴らなかった回 ${miss}件`, { file: "bell.js" });
    if (lsGet(RENEW) !== KN.util.todayKey() && !armed && !renewing) {
      let key = null;
      try { key = await relayKey(); } catch (err) { /* 次に戻ったとき */ }
      if (key) arm(key);
    }
    return miss;
  }

  /* 押した流れ：click とキー。iPhone が「押した」と認めるのは指を離したときで、置いたとき（pointerdown・
     touchstart）ではない。離したときでも送り終わり（touchend）は確かでないので、捨ててから作るここは click で。 */
  const GESTURE = ["click", "keydown"];
  function arm(key) {
    armed = true;
    const go = () => {
      GESTURE.forEach((t) => document.removeEventListener(t, go, true));
      renew(key);
    };
    GESTURE.forEach((t) => document.addEventListener(t, go, true));
  }

  /** 押し先を捨てて作り直し、中継所へ送り直す（中継所は一つしか持たないので二重には鳴らない）。 */
  async function renew(key) {
    armed = false;
    const day = KN.util.todayKey();
    if (!active() || renewing || lsGet(RENEW) === day) return;
    /* 許しが無ければ作れない。作れないのに捨てると、押し先が無くなるだけ。 */
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") return;
    renewing = true;
    try {
      const reg = await navigator.serviceWorker.ready;
      const old = await reg.pushManager.getSubscription();
      if (old) { try { await old.unsubscribe(); } catch (err) { /* 作り直すので構わない */ } }
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
      await writeUsedKey(key);
    } catch (err) {
      /* 捨てたのに作れなかった。作り直した日にはしない——開いているあいだの sync も作り直しを試み、
         次に戻って鳴らなかった回があれば、また押したときに。 */
      if (KN.errlog) KN.errlog.note("notice", "閉じていても鳴らす：押し先を作り直せなかった", { file: "bell.js" });
      lastSub = null;
      return;
    } finally {
      renewing = false;
    }
    lsSet(RENEW, day);
    lastSig = null;
    lastSub = null;
    await sync({ force: true });
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
    /* 古い控えを捨てる前に、鳴らなかった回を照らす（戻ってきて一度だけ）。 */
    if (back) await lookBack(rows);
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
      if (document.visibilityState === "hidden") { markAway(); flush(); }
    });
    window.addEventListener("pagehide", () => { markAway(); flush(); });
    if (active()) sync({ force: true });
  }

  /* 閉じる瞬間（2026年9月29日、iPhone で「閉じていたら通知が来なかった」）。用事を
     作ってすぐ閉じると、上の3秒待ちのうちにアプリが止まり、中継所が新しい時刻を
     知らないままだった。待っている送りがあれば**その場で**：この開いているあいだに
     押し先を送れていれば、鍵の往復を飛ばして時刻の列だけを keepalive で。まだなら
     ふつうの sync（間に合えば届く）。写し（題）も書き始める。 */
  function flush() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    if (!active()) return;
    const list = plan();
    const sig = list.map((x) => x.at).join(",");
    writePlan(list).catch(() => {});
    if (!lastSub) { sync(); return; }
    if (sig === lastSig) return;
    post("times", JSON.stringify(list.map((x) => x.at)), true)
      .then((r) => { if (r.ok) lastSig = sig; }, () => {});
  }

  KN.bell = { supported, available, active, plan, sync, flush, start, stop, absorb, noteRung, lookBack, init, DB };
})();
