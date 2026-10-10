/* =========================================================
   困ったときの記録（R23）——エラーの控え
   =========================================================

   iPhone だけで起きる不具合を、iPhone の上で拾う手が無かった（Mac のウェブ
   インスペクタが要った）。`window` の `error`・`unhandledrejection` と、保存の
   失敗（store.js の `save failed`）を、**store の外の鍵**に控えます。
   設定 → 一般 →「困ったときの記録」で一覧とコピー。次のセッションに貼るための控え。

   - 鍵は localStorage `kaimono-note-errors`（Dropbox の鍵と同じ置き方）。記録
     （`kaimono-note-v2`）の外なので、書き出し・自動の控え・Dropbox には乗らない。
     新しい50件だけ残り、古いものは押し出される。
   - 新しい50件まで。持つのは時刻・版・画面・短い文（200字まで）・ファイルと行だけ。
   - エラーの文に利用者の字が混ざることは理屈ではありうる（品名を含む例外など）。
     短く切り、コピーの前に一覧で見える形にする。**日記の保存の道**（diary の
     名のファイル）で起きたものは、文ではなく種類（TypeError など）だけ残す。
   - 同じものが続けて起きたら（毎フレーム投げる、など）一件にまとめて数を足す。
   - どの scripts より先に読む（index.html の先頭）。読み込みの途中で落ちたものも拾う。
     ここで何が起きても、アプリを止めない（どこも try で包む）。 */
(function () {
  "use strict";
  window.KN = window.KN || {};

  const KEY = "kaimono-note-errors";
  const MAX = 50;
  const TEXT_MAX = 200;
  const SAME_MS = 2000;

  /* 版：配るときに stamp-build.js が index.html の `<meta name="kn-build">` に commit を入れる
     （css/js の `?v=` は各ファイルの中身の印——roadmap-seamless の N3）。手元・単体版では "dev"。 */
  const version = (() => {
    try {
      const m = document.querySelector('meta[name="kn-build"]');
      return (m && m.content) ? m.content.slice(0, 12) : "dev";
    } catch (_) { return "dev"; }
  })();

  function read() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (_) { /* 枠がいっぱい：控えは諦める */ }
  }

  const baseName = (f) => String(f || "").split("?")[0].split("#")[0].split("/").pop();
  function screenNow() {
    try { return (KN.app && KN.app.activeScreen && KN.app.activeScreen()) || ""; } catch (_) { return ""; }
  }

  /** 控える。kind は "error" / "promise" / "save"。 */
  function note(kind, err, where) {
    try {
      const w = where || {};
      const file = baseName(w.file || (err && err.fileName));
      const name = (err && err.name) || (typeof err === "string" ? "Error" : "Error");
      let msg = err && err.message != null ? String(err.message) : String(err == null ? "" : err);
      if (err && err.name && msg && msg.indexOf(err.name) !== 0) msg = `${err.name}: ${msg}`;
      /* 日記の保存の道は、種類だけ（本文が文に混ざりうるので）。 */
      if (/diary/i.test(file) || w.diary) msg = name;
      msg = msg.replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
      const rec = { at: new Date().toISOString(), ver: version, screen: screenNow(), kind,
        msg, file, line: Number(w.line) || null };
      const list = read();
      const last = list[list.length - 1];
      if (last && last.msg === rec.msg && last.file === rec.file && last.line === rec.line
          && Date.now() - Date.parse(last.at) < SAME_MS) {
        last.n = (last.n || 1) + 1;
        last.at = rec.at;
      } else {
        list.push(rec);
      }
      write(list);
    } catch (_) { /* 控えで落ちない */ }
  }

  window.addEventListener("error", (e) => {
    /* 読み込めなかった絵などは ErrorEvent ではない（ここへは泡で来ない）。 */
    if (!e || !(e instanceof ErrorEvent)) return;
    /* ブラウザの無害な知らせ（ResizeObserver が一コマで追いつかなかった）。控えると、
       ほんとうのエラーが50件の枠から押し出される。 */
    if (/ResizeObserver loop/i.test(String(e.message || ""))) return;
    note("error", e.error || e.message, { file: e.filename, line: e.lineno });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e && e.reason;
    const stack = (r && r.stack) || "";
    const m = /([^\s/()]+\.js)(?:\?[^:\s)]*)?:(\d+)/.exec(stack);
    note("promise", r, m ? { file: m[1], line: m[2] } : {});
  });

  function list() { return read().slice().reverse(); }
  function clear() { try { localStorage.removeItem(KEY); } catch (_) { /* 読めない端末 */ } }

  /** コピーする字。いちばん新しいものから。 */
  function text() {
    return list().map((r) => [r.at, r.ver, r.screen || "-", r.kind, r.file ? `${r.file}:${r.line || "?"}` : "-",
      r.n ? `×${r.n}` : "", r.msg].filter(Boolean).join(" | ")).join("\n");
  }

  KN.errlog = { note, list, clear, text, KEY, version };
})();
