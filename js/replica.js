/* =========================================================
   くらしノート — 写しの端末（docs/desk.md「段15 の設計」。パソコン・iPad）

   主の一台（iPhone）が Dropbox に置く今の控え `kurashi-latest.json` を読み、
   データの欄だけを記憶の state に差し替えて見せます。入れるのは設定で
   （「iPhone の写しを見る」。この端末だけの印 store.REPLICA_KEY）。

   - 写しは記録にしない。字は大きな保存場所の meta の "replica" に置く（棚は足さない
     ＝版を上げない）。記録（kaimono-note-v2）は store が書かない。
   - 写しのあいだは、自動の控え・記録の写し・日記の写し・過去のやることの棚・
     中継所・鳴らす役・通知を動かさない（ここで口を差し替える。中身には触れない）。
     Dropbox へは控えを送らない（js/dropbox.js が store.replica() を見る）。ノートは今の同期。
   - 版（rev）が変わったときだけ読む：開いた・前に出た・見えているあいだ EVERY おき・引いて読み直す。
   - iPhone だけの操作（済み・★・＋）は薄く、押せば「iPhoneで操作できます」。
     ほかの道からの書き換えは store の update が写しへ戻す。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;
  const LATEST = "/kurashi-latest.json";
  const META = "replica";
  const EVERY = 3 * 60 * 1000;
  const on = store.replica();
  const listeners = new Set();
  let info = null;     // { rev, at }（at は Dropbox に置かれた時刻）
  let busy = null;

  function readMark() {
    try {
      const v = JSON.parse(localStorage.getItem(store.REPLICA_KEY) || "null");
      return v && typeof v === "object" ? v : null;
    } catch (_) { return null; }
  }

  /* 入れる・切る。どちらも読み直して始め直す（記録には触れない。切れば前からの記録のまま開く）。
     設定は印に残す（次に入れたときのため）。 */
  function setOn(v) {
    const cur = readMark();
    const settings = (cur && cur.settings) || store.get().settings;
    localStorage.setItem(store.REPLICA_KEY, JSON.stringify({ on: !!v, settings }));
    const gone = !v && KN.idb && KN.idb.available()
      ? KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").delete(META); }).catch(() => {})
      : null;
    const notes = KN.notes && KN.notes.flush ? KN.notes.flush() : null;
    Promise.race([Promise.all([gone, notes]).catch(() => {}), new Promise((ok) => setTimeout(ok, 1500))])
      .then(() => (KN.app && KN.app.reloadHere ? KN.app.reloadHere() : location.reload()));
  }

  function changed() { listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } }); }

  function keep(v) {
    if (!KN.idb || !KN.idb.available()) return Promise.resolve();
    return KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").put({ k: META, v }); })
      .catch((err) => console.warn("replica not kept", err));
  }

  /** 版が変わっていれば読む。読めたら true。 */
  function refresh() {
    if (!on) return Promise.resolve(false);
    if (busy) return busy;
    busy = look().finally(() => { busy = null; });
    return busy;
  }
  async function look() {
    const db = KN.dropbox && KN.dropbox.api;
    try {
      if (!db || !(await db.ready())) return false;
      const m = await db.call(db.API, "/2/files/get_metadata", { json: { path: LATEST } });
      const rev = m.res.ok && m.body && m.body.rev;
      if (!rev || (info && info.rev === rev)) return false;
      const d = await db.call(db.CONTENT, "/2/files/download", { arg: { path: LATEST }, raw: true });
      if (!d.res.ok) return false;
      const text = await d.res.text();
      store.showReplica(text);
      info = { rev, at: m.body.server_modified || "" };
      await keep({ ...info, text });
      changed();
      return true;
    } catch (err) {
      console.warn("replica not read", err);
      return false;
    }
  }

  /* ---- 写しのあいだ、記録まわりの口を動かないものに ---- */

  function hold() {
    const done = () => Promise.resolve();
    const nop = () => {};
    const no = () => Promise.reject(new Error("iPhoneで操作できます"));
    const put = (M, over) => { if (M) Object.assign(M, over); };
    put(KN.liveIdb, { start: done, ready: done, afterWrite: nop, note: nop, flush: done });
    const shelf = {
      start: done, ready: done, settled: () => true, retry: nop, afterWrite: nop, reloaded: nop,
      isOut: () => false, forLive: (s) => s, delivered: () => false,
      prepare: no, markOut: no, putBack: no, deliver: no,
    };
    put(KN.diaryIdb, { ...shelf, body: () => "ok" });
    put(KN.todoPast, shelf);
    put(KN.backup, {
      init: nop, ready: done, snapshot: done, take: done, maybeDaily: done, maybeHourly: done, maybeEvery: done,
      prune: done, restore: no, clear: no, markExported: nop, settleLost: nop, mergeNotes: no,
      lost: () => null, doubt: () => null, checked: done,
    });
    const off = () => Promise.resolve({ ok: false, off: true, error: "iPhoneで操作できます", added: 0, updated: 0, skipped: 0 });
    put(KN.healthRelay, { watch: nop, pull: off, pullAndImport: off, pullNow: off, takeInbox: off });
    put(KN.bell, { init: nop, sync: done, flush: nop, start: done, absorb: nop, noteRung: nop, active: () => false });
    put(KN.notify, { init: nop, tick: nop });
  }

  /* iPhone だけの操作。薄くするのは css/screens.css の「写しの端末」（同じ並び）。 */
  const ONLY = [
    '.screen:not(#screen-notes):not(#screen-settings) :is(.check, .sub-check, .tl-tick, .fav)',
    'html:not([data-screen="notes"]) #dock .add-fab',
  ].join(", ");
  function guard() {
    const stop = (e) => {
      const el = e.target && e.target.closest && e.target.closest(ONLY);
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "click") KN.ui.toast("iPhoneで操作できます");
    };
    ["pointerdown", "click"].forEach((t) => document.addEventListener(t, stop, true));
  }

  async function start() {
    document.documentElement.classList.add("is-replica");
    guard();
    try {
      const got = KN.idb && KN.idb.available()
        ? await KN.idb.run(["meta"], "readonly", (t) => { const r = t.objectStore("meta").get(META); return () => r.result; })
        : null;
      const v = got && got.v;
      if (v && typeof v.text === "string") {
        store.showReplica(v.text);
        info = { rev: v.rev || "", at: v.at || "" };
        changed();
      }
    } catch (err) { console.warn("replica not loaded", err); }
    refresh();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
    setInterval(() => { if (document.visibilityState === "visible") refresh(); }, EVERY);
  }

  if (on) { hold(); start(); }

  KN.replica = {
    on: () => on,
    /** 写しの元が Dropbox に置かれた時刻（ISO。まだ無ければ ""）。 */
    at: () => (info && info.at) || "",
    refresh, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    enable: () => setOn(true), disable: () => setOn(false),
  };
})();
