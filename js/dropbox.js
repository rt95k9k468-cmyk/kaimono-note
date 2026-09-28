/* =========================================================
   くらしノート — Dropbox へ自動で送る（2026年9月28日）

   端末が壊れた・なくした日のための、端末の外の控えです。自動の控え
   （backup.js）は端末の中にしか無いので、そこは守れません。

   - 送り先は Dropbox の「アプリ/<アプリ名>」フォルダだけ（App folder の
     権限）。昔の日記の PDF など、ほかのファイルは見えないし触れません。
   - 中身は「バックアップを保存」と同じもの（store.exportJSON）。そのまま
     「バックアップから復元」で読めます。暗号にはしません（利用者が決めた）。
   - `kurashi-latest.json` … 送るたびに**上書き**。いつも一つ。
   - `daily/kurashi-YYYY-MM-DD.json` … その日**はじめて**送った中身。
     あとから上書きしません（mode "add"）——その日に何かを消しても、日付の
     控えまで道連れにしないため。新しいほうから KEEP 個だけ残して、古いものは
     消します。消すのはこの名前の形のものだけ。
   - いつ送るか：開いたとき・前に出てきたとき・書き換えてから SOON のあと・
     隠れるとき。中身が前回送ったものと同じなら送りません。閉じているあいだは
     動けません（iPhone のホーム画面アプリに、その仕組みが無い）——が、記録が
     変わるのも開いているあいだだけです。

   鍵（refresh token）は store の外、自分の localStorage のキーに置きます。
   書き出し・自動の控え・「すべて削除」のどれにも乗りません。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;
  const { dayKey } = KN.util;

  const KEY = "kaimono-note-dropbox";
  const LATEST = "/kurashi-latest.json";
  const DAILY_DIR = "/daily";
  const DAILY_RE = /^kurashi-(\d{4}-\d{2}-\d{2})\.json$/;
  const KEEP = 30;
  const SOON = 2 * 60 * 1000;        // 書き換えてから送るまで（その間の書き換えはまとめて一度）
  const FIRST = 8 * 1000;            // 開いてすぐは起動の邪魔をしない

  const API = "https://api.dropboxapi.com";
  const CONTENT = "https://content.dropboxapi.com";
  const AUTH = "https://www.dropbox.com/oauth2/authorize";

  /* ---- 置き場（store の外） ---- */

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch (err) { return {}; }
  }
  let cfg = read();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (err) { /* 次に送ったときにまた書く */ }
    listeners.forEach((fn) => { try { fn(); } catch (err) { /* 見せる側の都合 */ } });
  }
  const listeners = new Set();
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  const connected = () => !!cfg.refresh;

  /* ---- つなぐ（PKCE・コードを貼る形） ----

     Dropbox の画面へ出ていって戻ってくる形（redirect）は使いません。
     iPhone のホーム画面アプリは、外へ出た先から戻ってくるときに Safari の
     ほうで開くことがあり、置き場（localStorage）が別になります。コードを
     貼る形なら、アプリは一度も離れません。

     押した流れの中で window.open を呼ぶために、合言葉（verifier）と、その
     指紋（challenge）は**先に**作っておきます（crypto.subtle は約束で返る
     ので、押してから作ると「人が押した」流れから外れます）。 */

  function b64url(bytes) {
    let s = "";
    bytes.forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function prepare() {
    if (!cfg.appKey || connected() || (cfg.pending && cfg.pending.challenge)) return;
    if (!(window.crypto && crypto.subtle)) return;
    const raw = new Uint8Array(48);
    crypto.getRandomValues(raw);
    const verifier = b64url(raw);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    cfg.pending = { verifier, challenge: b64url(new Uint8Array(digest)) };
    save();
  }

  function setAppKey(v) {
    const key = String(v || "").trim();
    if (key === (cfg.appKey || "")) return;
    cfg.appKey = key;
    delete cfg.pending;
    save();
    prepare();
  }

  /** ゆるす画面の URL。用意ができていなければ null。 */
  function authUrl() {
    if (!cfg.appKey || !cfg.pending) return null;
    const q = new URLSearchParams({
      client_id: cfg.appKey,
      response_type: "code",
      code_challenge: cfg.pending.challenge,
      code_challenge_method: "S256",
      token_access_type: "offline",
    });
    return `${AUTH}?${q}`;
  }

  async function form(path, fields) {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    let body = null;
    try { body = await res.json(); } catch (err) { body = null; }
    return { res, body };
  }

  /** Dropbox の画面に出たコードで、鍵を受け取る。 */
  async function finish(code) {
    const c = String(code || "").trim();
    if (!c) throw new Error("コードが空です");
    if (!cfg.appKey || !cfg.pending) throw new Error("先に App key を入れてください");
    const { res, body } = await form("/oauth2/token", {
      code: c,
      grant_type: "authorization_code",
      code_verifier: cfg.pending.verifier,
      client_id: cfg.appKey,
    });
    if (!res.ok || !body || !body.refresh_token) {
      throw new Error((body && (body.error_description || body.error)) || `Dropbox が ${res.status} を返しました`);
    }
    cfg.refresh = body.refresh_token;
    cfg.access = body.access_token;
    cfg.expires = Date.now() + (Number(body.expires_in) || 0) * 1000;
    delete cfg.pending;
    delete cfg.error;
    delete cfg.needsAuth;
    /* 前につないでいた口の覚えは捨てます（別のフォルダかもしれないので）。 */
    delete cfg.lastHash;
    delete cfg.lastDay;
    save();
    return sync({ now: true });
  }

  async function disconnect() {
    const token = cfg.access;
    ["refresh", "access", "expires", "lastHash", "lastDay", "lastAt", "error", "errorAt", "needsAuth", "pending"]
      .forEach((k) => { delete cfg[k]; });
    save();
    prepare();
    /* 鍵を Dropbox 側でも無効に。届かなくても、こちらはもう持っていない。 */
    if (token) {
      try {
        await fetch(API + "/2/auth/token/revoke", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      } catch (err) { /* 届かなくてよい */ }
    }
  }

  /* ---- 呼ぶ ---- */

  async function accessToken(force) {
    if (!force && cfg.access && Date.now() < (cfg.expires || 0) - 60 * 1000) return cfg.access;
    const { res, body } = await form("/oauth2/token", {
      grant_type: "refresh_token",
      refresh_token: cfg.refresh,
      client_id: cfg.appKey,
    });
    if (!res.ok || !body || !body.access_token) {
      /* 鍵そのものが効かない（利用者が Dropbox の側で外した等）。持っていても
         二度と通らないので捨てて、つなぎ直しを頼みます。 */
      if (body && body.error === "invalid_grant") {
        delete cfg.refresh; delete cfg.access; delete cfg.expires;
        cfg.needsAuth = true;
        save();
        prepare();
        throw new Error("Dropbox とのつながりが切れました。つなぎ直してください");
      }
      throw new Error((body && (body.error_description || body.error)) || `Dropbox が ${res.status} を返しました`);
    }
    cfg.access = body.access_token;
    cfg.expires = Date.now() + (Number(body.expires_in) || 0) * 1000;
    save();
    return cfg.access;
  }

  /** 一度呼んで、鍵が古いと言われたら取り直してもう一度。 */
  async function call(host, path, { arg, body, json } = {}) {
    for (let tries = 0; tries < 2; tries++) {
      const token = await accessToken(tries > 0);
      const headers = { Authorization: `Bearer ${token}` };
      if (arg) {
        headers["Dropbox-API-Arg"] = JSON.stringify(arg);
        headers["Content-Type"] = "application/octet-stream";
      } else if (json) {
        headers["Content-Type"] = "application/json";
      }
      const res = await fetch(host + path, {
        method: "POST", headers,
        body: arg ? body : json ? JSON.stringify(json) : undefined,
      });
      if (res.status === 401 && tries === 0) continue;
      let out = null;
      try { out = await res.json(); } catch (err) { out = null; }
      return { res, body: out };
    }
    return { res: { ok: false, status: 401 }, body: null };
  }

  const summary = (r) => (r.body && (r.body.error_summary || r.body.error)) || `Dropbox が ${r.res.status} を返しました`;

  async function upload(path, text, mode) {
    const r = await call(CONTENT, "/2/files/upload", {
      arg: { path, mode, autorename: false, mute: true },
      body: new Blob([text], { type: "application/octet-stream" }),
    });
    if (r.res.ok) return "ok";
    /* 日付の控えがもう在る（同じ日にほかの端末・前の版が置いた）。上書き
       しないのが決まりなので、それでよい。 */
    if (mode === "add" && r.res.status === 409 && /conflict/.test(summary(r))) return "exists";
    throw new Error(summary(r));
  }

  /** 日付の控えを、新しいほうから KEEP 個だけ残す。 */
  async function prune() {
    const names = [];
    let r = await call(API, "/2/files/list_folder", { json: { path: DAILY_DIR, limit: 2000 } });
    for (let guard = 0; guard < 20; guard++) {
      if (!r.res.ok) throw new Error(summary(r));
      (r.body.entries || []).forEach((e) => {
        if (e[".tag"] === "file" && DAILY_RE.test(e.name)) names.push(e.name);
      });
      if (!r.body.has_more) break;
      r = await call(API, "/2/files/list_folder/continue", { json: { cursor: r.body.cursor } });
    }
    names.sort();
    const old = names.slice(0, Math.max(0, names.length - KEEP));
    for (const name of old) {
      const d = await call(API, "/2/files/delete_v2", { json: { path: `${DAILY_DIR}/${name}` } });
      if (!d.res.ok && d.res.status !== 409) throw new Error(summary(d));
    }
    return old.length;
  }

  async function sha(text) {
    if (!(window.crypto && crypto.subtle)) return "";
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return b64url(new Uint8Array(d));
  }

  /* ---- 送る ---- */

  let running = null;
  let again = false;
  let timer = null;
  let dirty = false;

  /** 送るべきなら送る。重なったら、いま走っているのが済んでからもう一度。 */
  function sync(opts) {
    if (running) { again = true; return running; }
    running = run(opts || {}).finally(() => {
      running = null;
      if (again) { again = false; sync(); }
    });
    return running;
  }

  async function run() {
    if (!connected() || !cfg.appKey) return "off";
    clearTimeout(timer);
    timer = null;
    /* 日記の写しの突き合わせが済む前は、写しから戻るはずの本文がまだ記録に
       入っていないことがあります（「バックアップを保存」が断るのと同じ門）。 */
    if (KN.diaryIdb && KN.diaryIdb.ready) {
      try { await KN.diaryIdb.ready(); } catch (err) { /* 読めない日でも、下の門で見る */ }
    }
    /* 本文を記録から外した日（memoOut）が残っているのは、写しから本文を
       戻せなかったとき。そのまま送ると、本文の無い中身で上書きしてしまう。 */
    const days = ((store.get().archive || {}).days || []);
    if (store.memoOut && days.some(store.memoOut)) {
      cfg.error = "日記の本文を読めていないので、上書きを見合わせています";
      cfg.errorAt = new Date().toISOString();
      save();
      return "held";
    }
    dirty = false;
    const hash = await sha(JSON.stringify(store.get()));
    const day = dayKey(new Date());
    const same = hash && hash === cfg.lastHash;
    if (same && cfg.lastDay === day) return "same";

    const at = new Date().toISOString();
    const text = store.exportJSON(at);
    try {
      if (!same) await upload(LATEST, text, "overwrite");
      if (cfg.lastDay !== day) {
        await upload(`${DAILY_DIR}/kurashi-${day}.json`, text, "add");
        cfg.lastDay = day;
        save();
        await prune();
      }
      cfg.lastHash = hash;
      cfg.lastAt = at;
      delete cfg.error;
      delete cfg.errorAt;
      save();
      return "sent";
    } catch (err) {
      dirty = true;
      cfg.error = String((err && err.message) || err);
      cfg.errorAt = new Date().toISOString();
      save();
      return "failed";
    }
  }

  /** 書き換えがあった。SOON のあとに一度だけ送る（その間の書き換えはまとめる）。 */
  function soon() {
    if (!connected()) return;
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; sync(); }, SOON);
  }

  function status() {
    return {
      appKey: cfg.appKey || "",
      connected: connected(),
      ready: !!cfg.pending,
      needsAuth: !!cfg.needsAuth,
      lastAt: cfg.lastAt || "",
      error: cfg.error || "",
      errorAt: cfg.errorAt || "",
      keep: KEEP,
    };
  }

  store.subscribe(soon);
  document.addEventListener("visibilitychange", () => {
    if (!connected()) return;
    /* 隠れるときは書き換えの残りだけ（途中で切られることがある）。前に出て
       きたときは、ほかで変わっていないかも含めて見る。 */
    if (document.visibilityState === "hidden") { if (dirty) sync(); }
    else sync();
  });
  setTimeout(() => { prepare(); sync(); }, FIRST);

  KN.dropbox = { status, setAppKey, authUrl, prepare, finish, disconnect, sync, onChange, KEEP };
})();
