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
   - 困ったときだけ歯車に点（trouble。設定の頭に一行）：読めない（fail）・届かないまま3日（far）・
     写しの元が置かれてから3日（old）。数は出さない。確かめた時刻は OK_KEY（印は store が書き直すので別）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;
  const LATEST = "/kurashi-latest.json";
  const META = "replica";
  const EVERY = 3 * 60 * 1000;
  const OK_KEY = "kn-replica-ok";
  const DAY = 86400000;
  const STUCK = 3;     // 送れないまま3日（backup.js の REMIND_STUCK_DAYS・notes-sync の STUCK）と同じ
  const on = store.replica();
  const listeners = new Set();
  let info = null;     // { rev, at }（at は Dropbox に置かれた時刻）
  let text0 = "";      // いま見せている控えの字（足した依頼を重ね直すため）
  let busy = null;
  let failed = "";     // "" | "far"（届かない）| "fail"（届いたが読めない）。いちばん新しい一回
  let need = false;    // Dropbox がつながっていない（待っても直らない）

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
    try { if (v) localStorage.setItem(OK_KEY, new Date().toISOString()); else localStorage.removeItem(OK_KEY); } catch (_) { /* 印が無くても動く */ }
    const gone = !v && KN.idb && KN.idb.available()
      ? KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").delete(META); }).catch(() => {})
      : null;
    const notes = KN.notes && KN.notes.flush ? KN.notes.flush() : null;
    Promise.race([Promise.all([gone, notes]).catch(() => {}), new Promise((ok) => setTimeout(ok, 1500))])
      .then(() => (KN.app && KN.app.reloadHere ? KN.app.reloadHere() : location.reload()));
  }

  /* 足した依頼（js/desk-inbox.js）を写しの上に重ねて見せる。 */
  function show(text) {
    store.showReplica(text, (s) => { if (KN.deskInbox) KN.deskInbox.lay(s); });
    text0 = text;
  }
  function redraw() { if (on && text0) { try { show(text0); } catch (err) { console.warn("replica redraw", err); } } }

  function changed() { listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } }); }

  /* 最後に Dropbox の今の控えと突き合わせられた時刻（入れたときから数える）。 */
  function okAt() { try { return localStorage.getItem(OK_KEY) || ""; } catch (_) { return ""; } }
  function seen() { try { localStorage.setItem(OK_KEY, new Date().toISOString()); } catch (_) { /* 次に */ } }
  const ago = (iso, now) => { const t = iso ? new Date(iso).getTime() : NaN; return isFinite(t) ? Math.floor((now - t) / DAY) : null; };

  /** 困ったときだけ "fail" | "far" | "old"、ふだんは null（歯車の点・設定の頭の一行）。 */
  function trouble(now) {
    if (!on) return null;
    const t = now || Date.now();
    if (failed === "fail") return "fail";
    if (need) return "far";
    if (failed === "far") { const d = ago(okAt(), t); if (d !== null && d >= STUCK) return "far"; }
    const d = ago(info && info.at, t);
    return d !== null && d >= STUCK ? "old" : null;
  }
  function ended(kind, lack) {
    const was = trouble();
    failed = kind;
    need = !!lack;
    if (!kind) seen();
    if (trouble() !== was) changed();
  }

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
    let text = null;
    try {
      if (!db || !(await db.ready())) { ended("far", true); return false; }
      const m = await db.call(db.API, "/2/files/get_metadata", { json: { path: LATEST } });
      const rev = m.res.ok && m.body && m.body.rev;
      if (!rev) { ended("far"); return false; }
      if (info && info.rev === rev) { ended(""); return false; }
      const d = await db.call(db.CONTENT, "/2/files/download", { arg: { path: LATEST }, raw: true });
      if (!d.res.ok) { ended("far"); return false; }
      text = await d.res.text();
      show(text);
      info = { rev, at: m.body.server_modified || "" };
      await keep({ ...info, text });
      failed = "";
      need = false;
      seen();
      changed();
      return true;
    } catch (err) {
      console.warn("replica not read", err);
      /* 字まで届いて写せなかった（壊れた控え）は待っても直らない。届かないのは3日待つ。 */
      ended(text === null ? "far" : "fail");
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
    /* この端末は控えを送らないので、端末の外の控えの見張り（歯車の点）は写しの trouble が受け持つ。 */
    put(KN.backup, {
      offDeviceStale: () => null, exportDue: () => false,
      init: nop, ready: done, snapshot: done, take: done, maybeDaily: done, maybeHourly: done, maybeEvery: done,
      prune: done, restore: no, clear: no, markExported: nop, settleLost: nop, mergeNotes: no,
      lost: () => null, doubt: () => null, checked: done,
    });
    const off = () => Promise.resolve({ ok: false, off: true, error: "iPhoneで操作できます", added: 0, updated: 0, skipped: 0 });
    put(KN.healthRelay, { watch: nop, pull: off, pullAndImport: off, pullNow: off, takeInbox: off });
    put(KN.bell, { init: nop, sync: done, flush: nop, start: done, absorb: nop, noteRung: nop, active: () => false });
    put(KN.notify, { init: nop, tick: nop });
  }

  /* iPhone だけの操作。薄くするのは css/screens.css の「写しの端末」（同じ並び）。
     やること・買うもの・daily の＋は薄くせず、受け箱へ足す紙を開く（js/desk-inbox.js）。 */
  const ADD = 'html:is([data-screen="todo"], [data-screen="list"], [data-screen="archive"]) #dock .add-fab';
  const ONLY = [
    '.screen:not(#screen-notes):not(#screen-settings) :is(.check, .sub-check, .tl-tick, .fav)',
    'html:not([data-screen="notes"]):not([data-screen="todo"]):not([data-screen="list"]):not([data-screen="archive"]) #dock .add-fab',
  ].join(", ");
  function guard() {
    const stop = (e) => {
      const t = e.target && e.target.closest ? e.target : null;
      const add = t && t.closest(ADD);
      if (!add && !(t && t.closest(ONLY))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type !== "click") return;
      const I = KN.deskInbox;
      if (add && I) {
        const scr = document.documentElement.dataset.screen;
        if (scr === "todo") I.addTodo();
        else if (scr === "list") I.addItem();
        else I.post(KN.util.todayKey(), null, "", "今日");
        return;
      }
      KN.ui.toast("iPhoneで操作できます");
    };
    ["pointerdown", "click"].forEach((t) => document.addEventListener(t, stop, true));
  }

  async function start() {
    document.documentElement.classList.add("is-replica");
    guard();
    if (!okAt()) seen();   // 前の版で入れた端末は、ここから数える
    try {
      const got = KN.idb && KN.idb.available()
        ? await KN.idb.run(["meta"], "readonly", (t) => { const r = t.objectStore("meta").get(META); return () => r.result; })
        : null;
      const v = got && got.v;
      if (v && typeof v.text === "string") {
        show(v.text);
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
    trouble,
    refresh, redraw, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    enable: () => setOn(true), disable: () => setOn(false),
  };
})();
