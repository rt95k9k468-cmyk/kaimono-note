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
     控えまで道連れにしないため。新しいほうから KEEP 個と、月の背骨（各月で
     最初の一つを MONTHS か月ぶん）を残して、ほかの古いものは消します。消すのは
     この名前の形のものだけ。
   - 送るのは一台だけ（下の「控えを送る端末は一台だけ」）。ほかの端末はノートの画像だけ。
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
  /* ノートの画像（段5。docs/image-design.md）。一枚ずつ一度だけ、上書きしない形で。 */
  const IMG_DIR = "/images";
  const IMG_RE = /^([0-9a-f]{16})\.jpg$/;
  /* ノートのファイル（PDF。note-file.js）。名前＝中身なので、同じく上書きしない形で。 */
  const FILE_DIR = "/files";
  const FILE_RE = /^[0-9a-f]{64}\.[a-z0-9]{1,8}$/;
  const FT_RE = /^[0-9a-f]{64}\.pdf\.txt$/;     // PDF の字（note-file.js）
  const IMPORT_DIR = "/imports";                  // 取り込んだ元のファイル（note-import.js）
  const PART = 32 * 1024 * 1024;                  // 分けて送る一切れ（一度の upload は 150MB まで）
  const KEEP = 30;
  const MONTHS = 12;                 // 月の背骨（2026年10月8日、docs/log/data-check.md の案A）
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
    mirror();
    listeners.forEach((fn) => { try { fn(); } catch (err) { /* 見せる側の都合 */ } });
  }

  /* 設定の写しを大きな保存場所（meta の "dropbox"）にも置きます。iPhone が
     localStorage だけを落とした日に、ここも一緒に消えてつなぎ直しになったので
     （2026年10月6日）。localStorage が空で写しがあれば、写しから戻します。 */
  const MIRROR = "dropbox";
  function mirror() {
    if (!KN.idb || !KN.idb.available()) return;
    const v = JSON.parse(JSON.stringify(cfg));
    KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").put({ k: MIRROR, v }); })
      .catch(() => { /* 次に書いたときにまた写す */ });
  }
  const recovered = (!KN.idb || !KN.idb.available()) ? Promise.resolve()
    : KN.idb.run(["meta"], "readonly", (t) => {
      const r = t.objectStore("meta").get(MIRROR);
      return () => r.result;
    }).then((got) => {
      const v = got && got.v;
      if (!Object.keys(cfg).length && v && typeof v === "object" && Object.keys(v).length) { cfg = v; save(); }
      else if (Object.keys(cfg).length) mirror();   // 前からの設定も、まず一度写す
    }).catch(() => { /* 写しが読めない日は、localStorage のまま */ });
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
    ["refresh", "access", "expires", "lastHash", "lastDay", "lastAt", "error", "errorAt", "needsAuth", "pending", "sender", "latestRev"]
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

  /** 一度呼んで、鍵が古いと言われたら取り直してもう一度。`raw` は中身を読む呼び出し
      （download）：通れば res をそのまま返す（中身は呼ぶ側が text() で）。 */
  async function call(host, path, { arg, body, json, raw } = {}) {
    for (let tries = 0; tries < 2; tries++) {
      const token = await accessToken(tries > 0);
      const headers = { Authorization: `Bearer ${token}` };
      if (arg) {
        /* 頭書きは ASCII だけ（日本語の名前は \uXXXX に。Dropbox の決まり）。 */
        headers["Dropbox-API-Arg"] = JSON.stringify(arg).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
        if (!raw) headers["Content-Type"] = "application/octet-stream";
      } else if (json) {
        headers["Content-Type"] = "application/json";
      }
      const res = await fetch(host + path, {
        method: "POST", headers,
        body: arg ? body : json ? JSON.stringify(json) : undefined,
      });
      if (res.status === 401 && tries === 0) continue;
      if (raw && res.ok) return { res, body: null };
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
    if (r.res.ok) { lastRev = (r.body && r.body.rev) || ""; return "ok"; }
    /* 日付の控えがもう在る（同じ日にほかの端末・前の版が置いた）。上書き
       しないのが決まりなので、それでよい。 */
    if (mode === "add" && r.res.status === 409 && /conflict/.test(summary(r))) return "exists";
    throw new Error(summary(r));
  }

  /** 日付の控え（この名前の形のものだけ）。フォルダがまだ無ければ空。 */
  async function dailyFiles() {
    const out = [];
    let r = await call(API, "/2/files/list_folder", { json: { path: DAILY_DIR, limit: 2000 } });
    for (let guard = 0; guard < 20; guard++) {
      if (!r.res.ok) {
        if (r.res.status === 409 && /not_found/.test(summary(r))) break;
        throw new Error(summary(r));
      }
      (r.body.entries || []).forEach((e) => {
        if (e[".tag"] === "file" && DAILY_RE.test(e.name)) out.push(e);
      });
      if (!r.body.has_more) break;
      r = await call(API, "/2/files/list_folder/continue", { json: { cursor: r.body.cursor } });
    }
    return out;
  }

  /** 残す日付の控え（`names` は名前の順＝日付の順）。新しいほうから KEEP 個と、
      月の背骨：各月で最初の一つを、控えのある月の新しいほうから MONTHS か月ぶん。
      気づくのが KEEP 日より遅れた消失も戻せるように。月は時計ではなく控えで
      数える（時計が狂っても、開かない月があっても、背骨は減らない）。 */
  function keepers(names) {
    const keep = new Set(names.slice(Math.max(0, names.length - KEEP)));
    const firsts = new Map();        // "YYYY-MM" → その月で最初の名前
    names.forEach((n) => {
      const month = DAILY_RE.exec(n)[1].slice(0, 7);
      if (!firsts.has(month)) firsts.set(month, n);
    });
    [...firsts.values()].slice(-MONTHS).forEach((n) => keep.add(n));
    return keep;
  }

  /** 日付の控えを、keepers のほかは消す。 */
  async function prune() {
    const names = (await dailyFiles()).map((e) => e.name);
    names.sort();
    const keep = keepers(names);
    const old = names.filter((n) => !keep.has(n));
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

  /* 指紋用の書き出し。キーを並べてから——reconcile() は開くたびに欄を決まった順に
     並べ直すので、そのままだと同じ中身でも「変わった」と数えて送り直してしまう。 */
  function canon(v) {
    if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canon(x))).join(",")}]`;
    if (v && typeof v === "object") {
      return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  }

  /* ---- 送る ---- */

  let running = null;
  let again = false;
  let timer = null;
  let dirty = false;
  let lastRev = "";

  /* ---- 控えを送る端末は一台だけ（docs/notes-unify.md「守り」。ノートの同期の前に） ----

     ノートのために iPad・パソコンをつなぐと、記録の空に近い端末が kurashi-latest.json を
     上書きし、その日の daily/ を先取りしうる。送るのは `cfg.sender` の端末だけ。

     - 前から送っていた端末（lastAt がある＝今の iPhone）はそのまま送る。
     - はじめてつなぐ端末は、Dropbox に kurashi-latest.json が在れば送らない。無ければ
       "add" で置き、置けた端末が送る役（二台が同時でも一台だけ）。
     - 送る役は、最後に置いた版（rev）を覚えて `update` で上書きする。間にほかの端末が
       置いていたら断られる → 送る役を降りる（あとから「この端末から送る」と決めた端末が勝つ。
       古い端末が古い記録で上書きし続けない）。
     - 役を移すのは利用者が設定で押したときだけ（`claim`）。 */
  async function role() {
    if (cfg.sender === true || cfg.sender === false) return cfg.sender;
    if (cfg.lastAt) { cfg.sender = true; save(); return true; }
    const m = await call(API, "/2/files/get_metadata", { json: { path: LATEST } });
    if (m.res.ok) { cfg.sender = false; save(); return false; }
    if (/not_found/.test(summary(m))) return "first";
    throw new Error(summary(m));
  }

  /** 送る役を降りる（ほかの端末が kurashi-latest.json を置いた）。 */
  function stepDown() {
    cfg.sender = false;
    delete cfg.latestRev;
    delete cfg.error;
    delete cfg.errorAt;
    save();
    return "other";
  }

  /** 送る役として kurashi-latest.json を置く。ほかの端末が置いていたら false。 */
  async function putLatest(text, first) {
    const mode = first ? "add" : cfg.latestRev ? { ".tag": "update", update: cfg.latestRev } : "overwrite";
    try {
      if ((await upload(LATEST, text, mode)) === "exists") return false;
    } catch (err) {
      if (/conflict/.test(String(err && err.message))) return false;
      throw err;
    }
    cfg.sender = true;
    if (lastRev) cfg.latestRev = lastRev;
    save();
    return true;
  }

  /** 前と同じ中身で日だけ変わったとき。置かれている版が覚えたものか（ほかの端末が置いていないか）。 */
  async function stillMine() {
    if (!cfg.latestRev) return true;
    const m = await call(API, "/2/files/get_metadata", { json: { path: LATEST } });
    if (m.res.ok) return !!(m.body && m.body.rev === cfg.latestRev);
    if (/not_found/.test(summary(m))) return true;
    throw new Error(summary(m));
  }

  /** この端末から控えを送る（設定で押したとき）。次に送るとき上書きして役を取る。 */
  function claim() {
    cfg.sender = true;
    delete cfg.latestRev;
    delete cfg.lastHash;
    save();
    return sync();
  }

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
    await recovered;
    if (!connected() || !cfg.appKey) return "off";
    clearTimeout(timer);
    timer = null;
    /* 写しの端末（js/replica.js）は控えを送らない——記憶の state は iPhone の写し。ノートの画像だけ。 */
    if (store.replica()) { dirty = false; await sendImages(); return "other"; }
    /* 記録が見当たらない日（backup.js）は、空に近い中身で kurashi-latest.json を
       上書きしてしまうので、戻すか「このまま始める」まで送りません。 */
    if (KN.backup && KN.backup.lost) {
      await KN.backup.checked();
      if (KN.backup.lost()) {
        dirty = true;
        cfg.error = "記録が見当たらないので、上書きを見合わせています";
        cfg.errorAt = new Date().toISOString();
        save();
        await sendImages();   // 上書きしない形なので、送ってよい
        return "held";
      }
    }
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
    /* 元から外した過去のやること（印）が記録へ戻っていないうちも、送らない（R26 の罠b）。 */
    if (store.todoOut && store.todoOut().length) {
      if (KN.todoPast) { try { await KN.todoPast.ready(); } catch (err) { /* 下で見る */ } }
      if (store.todoOut().length) {
        cfg.error = "過去のやることを読めていないので、上書きを見合わせています";
        cfg.errorAt = new Date().toISOString();
        save();
        return "held";
      }
    }
    /* ノート（docs/notes.md）も読み終えるのを待ちます。中身は記録とは別の
       一番上の鍵 noteBook。「前と同じなら送らない」にも数えます。 */
    if (KN.notes) {
      try { await KN.notes.ready(); } catch (err) { /* 読めない日は noteBook を付けずに */ }
    }
    const extra = KN.notes ? KN.notes.forExport() : {};
    /* 記録もノートも空なら送らない（B2）。新しい端末でつないだ直後に、空の中身で
       kurashi-latest.json と今日の日付の控えを埋めないため——その端末へは、
       Dropbox の控えから戻す（下の backups / download）。 */
    if (store.isBlank(store.get()) && !(extra.noteBook && extra.noteBook.notes.length)) return "empty";
    let mine;
    try { mine = await role(); } catch (err) { return failed(err); }
    if (mine === false) { dirty = false; await sendImages(); return "other"; }
    dirty = false;
    const hash = await sha(canon(store.get())
      + (extra.noteBook ? canon(extra.noteBook) : ""));
    const day = dayKey(new Date());
    const same = hash && hash === cfg.lastHash;
    if (same && cfg.lastDay === day) { await sendImages(); return "same"; }

    const at = new Date().toISOString();
    const text = store.exportJSON(at, extra);
    try {
      const ok = same ? await stillMine() : await putLatest(text, mine === "first");
      if (!ok) { await sendImages(); return stepDown(); }
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
      await sendImages();
      return "sent";
    } catch (err) {
      return failed(err);
    }
  }

  function failed(err) {
    dirty = true;
    cfg.error = String((err && err.message) || err);
    cfg.errorAt = new Date().toISOString();
    save();
    return "failed";
  }

  /** JSON のあとに、まだ送っていない画像を一枚ずつ `images/<id>.jpg`（mode "add"）。同じ名前が
      もう在れば送れた扱い。落ちたら次の回（JSON の「前と同じなら送らない」には入れない）。
      ノートのファイル（PDF）も同じ形で `files/<id>`。 */
  async function sendImages() {
    for (const [M, path] of [[KN.noteImg, (id) => `${IMG_DIR}/${id}.jpg`], [KN.noteFile, (id) => `${FILE_DIR}/${id}`]]) {
      if (!M) continue;
      try {
        for (const id of await M.unsent()) {
          const rec = await M.get(id);
          if (!rec || !rec.bytes) continue;
          await upload(path(id), rec.bytes, "add");
          const ft = M.textOf && M.textOf(id);
          if (ft) await upload(`${path(id)}.txt`, ft, "add");
          await M.markSent(id);
        }
      } catch (err) {
        console.warn("images not sent", err);
      }
    }
  }

  /* ---- Dropbox の控えから戻す（B2、2026年10月6日） ----

     端末ごと失った日のために。前はファイル App で Dropbox から落としてきて
     「バックアップから復元」でした。読むのは送るときと同じ二つの名前の形だけ。 */

  /** 戻せる控え。最新（`latest: true`）が先、あとは日付の新しい順に
      `{ path, day, at, size }`。 */
  async function backups() {
    await recovered;
    if (!connected() || !cfg.appKey) throw new Error("Dropbox とつながっていません");
    const out = (await dailyFiles())
      .map((e) => ({ path: `${DAILY_DIR}/${e.name}`, day: DAILY_RE.exec(e.name)[1], at: e.server_modified || "", size: e.size || 0 }))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
    const m = await call(API, "/2/files/get_metadata", { json: { path: LATEST } });
    if (m.res.ok && m.body && m.body[".tag"] === "file") {
      out.unshift({ path: LATEST, latest: true, at: m.body.server_modified || "", size: m.body.size || 0 });
    } else if (!m.res.ok && !/not_found/.test(summary(m))) {
      throw new Error(summary(m));
    }
    return out;
  }

  /** 控えの中身（字）。上の二つの形の名前だけ読む。三つめの形 `images/<id>.jpg`（段5）と
      四つめの `files/<id>`（ノートのファイル）は中身を ArrayBuffer で。PDF の字 `files/<id>.txt` は字。 */
  async function download(path) {
    const p = String(path || "");
    const img = (p.startsWith(`${IMG_DIR}/`) && IMG_RE.test(p.slice(IMG_DIR.length + 1)))
      || (p.startsWith(`${FILE_DIR}/`) && FILE_RE.test(p.slice(FILE_DIR.length + 1)));
    const ft = p.startsWith(`${FILE_DIR}/`) && FT_RE.test(p.slice(FILE_DIR.length + 1));
    if (!img && !ft && p !== LATEST && !(p.startsWith(`${DAILY_DIR}/`) && DAILY_RE.test(p.slice(DAILY_DIR.length + 1)))) {
      throw new Error("戻せる控えの名前ではありません");
    }
    await recovered;
    if (!connected() || !cfg.appKey) throw new Error("Dropbox とつながっていません");
    const r = await call(CONTENT, "/2/files/download", { arg: { path: p }, raw: true });
    if (!r.res.ok) throw new Error(summary(r));
    return img ? r.res.arrayBuffer() : r.res.text();
  }

  /** 書き換えがあった。SOON のあとに一度だけ送る（その間の書き換えはまとめる）。 */
  function soon() {
    if (!connected()) return;
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; sync(); }, SOON);
  }

  /* ---- ショートカットの小窓へ写す glance.json（docs/todo-items.md 段4）----
     今日の予定と今週の印のやることだけ。フォルダ直下に一つ、いつも上書き。バックアップ（kurashi-latest.json）
     とは別で、復元・日付の控えには入らない。書けなくても控えの error には出さない（控えの邪魔をしない）。 */
  const GLANCE = "/glance.json";
  const GLANCE_GAP = 5 * 60 * 1000;   // 開き直すたびに書かない
  let glanceTimer = null, glanceBody = "", glanceAt = 0;

  function glanceData(now) {
    const s = store.get();
    const day = dayKey(now);
    const mine = (t) => s.settings.glanceWork === false || t.side === "work";
    const todos = s.todos.filter((t) => t && !t.archived && !t.trace && mine(t));
    const events = todos
      .filter((t) => t.kind === "event" && (t.endDay ? t.due <= day && day <= t.endDay : store.fallsOn(t, day)))
      .sort((a, b) => ((a.time || "99") < (b.time || "99") ? -1 : (a.time || "99") > (b.time || "99") ? 1 : 0))
      .map((t) => ({ time: t.time || "", name: t.title, side: t.side === "work" ? "work" : "life", ...ref(t) }));
    const marked = todos.filter((t) => t.kind !== "event" && !t.done && store.inWeek(t, day));
    /* PC から戻す道（段4の②）の宛先。marks は名前のまま（小窓が読む）、todo に id と見た日。
       later は今週の外のやること（棚の無いもの・くり返さないもの・日の早い順に 20 件まで）。 */
    const later = todos.filter((t) => t.kind !== "event" && !t.done && !t.repeat && !t.shelf && !store.inWeek(t, day))
      .sort((a, b) => ((a.due || "~") < (b.due || "~") ? -1 : (a.due || "~") > (b.due || "~") ? 1 : (a.order || 0) - (b.order || 0)))
      .slice(0, 20).map((t) => ({ name: t.title, ...ref(t) }));
    return { v: 1, day, workOnly: s.settings.glanceWork !== false, events, marks: marked.map((t) => t.title),
      todo: marked.map((t) => ({ name: t.title, ...ref(t) })), later };
  }
  /** 写しの一件の宛先。due は「見た日」（命令が当たるのは、iPhone の記録がまだこの日のときだけ）。 */
  function ref(t) {
    const r = { id: t.id, due: t.due || null };
    if (t.repeat || t.endDay) r.rep = true;
    return r;
  }

  async function glance(force) {
    await recovered;
    if (!connected() || !cfg.appKey || store.get().settings.glance !== true || store.replica()) return "off";
    if (store.isBlank(store.get())) return "empty";
    const now = new Date();
    const data = glanceData(now);
    const body = JSON.stringify(data);
    if (!force && body === glanceBody) return "same";
    if (force && body === glanceBody && Date.now() - glanceAt < GLANCE_GAP) return "same";
    try {
      await upload(GLANCE, JSON.stringify({ ...data, at: now.toISOString() }), "overwrite");
      glanceBody = body;
      glanceAt = Date.now();
      return "sent";
    } catch (err) { return "failed"; }
  }

  /** 用事を直した。SOON のあとに一度だけ（その間はまとめる）。 */
  function glanceSoon() {
    if (!connected() || store.get().settings.glance !== true || glanceTimer) return;
    glanceTimer = setTimeout(() => { glanceTimer = null; glance(); }, SOON);
  }

  /* ---- 職場の「足すだけ」受け箱 inbox/（docs/todo-items.md 段4の③）----
     PC が＋の一行を一件ずつ置き（inboxPut・mode "add"）、控えを送る端末（iPhone）が開いたとき取り込んで消す。
     取り込みは週の面の一行と同じ読み（weekAdd）で、仕事の用事として。PC は iPhone の記録を消せない。
     命令（段4の②）は op-<時刻>-<乱数>.json——古い版は名前の型が違うので触らない（読まずに消さない）。 */
  const INBOX = "/inbox";
  const INBOX_RE = /^\d{13}-[0-9a-f]{6}\.json$/;
  const OP_RE = /^op-\d{13}-[0-9a-f]{6}\.json$/;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const taken = new Set();
  let taking = false;
  const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}`;

  async function inboxPut(text) {
    text = String(text || "").trim().slice(0, 500);
    if (!text) return "empty";
    await recovered;
    if (!connected() || !cfg.appKey) throw new Error("Dropbox とつながっていません");
    return upload(`${INBOX}/${stamp()}.json`, JSON.stringify({ v: 1, text }), "add");
  }

  /** PC から写しの一件へ命令を置く（done・day・week）。返すのは置いた道（取り消しに使う）。 */
  async function inboxOp(op, item, day) {
    if (!item || typeof item.id !== "string" || !["done", "day", "week"].includes(op)) throw new Error("宛先がありません");
    if (op === "day" && !DAY_RE.test(day || "")) throw new Error("日がありません");
    await recovered;
    if (!connected() || !cfg.appKey) throw new Error("Dropbox とつながっていません");
    const path = `${INBOX}/op-${stamp()}.json`;
    const o = { v: 2, op, id: item.id, seen: item.due || null };
    if (op === "day") o.day = day;
    await upload(path, JSON.stringify(o), "add");
    return path;
  }
  /** 置いたばかりの命令を、iPhone が取り込む前に引っ込める。消せたら true（もう届いていれば false）。 */
  async function inboxDrop(path) {
    path = String(path || "");
    if (!path.startsWith(`${INBOX}/`) || !OP_RE.test(path.slice(INBOX.length + 1))) return false;
    try {
      const r = await call(API, "/2/files/delete_v2", { json: { path } });
      return r.res.ok;
    } catch (_) { return false; }
  }
  /* iPhone で命令を当てる。PC が見たときと記録が変わっていれば（日が違う・済んだ・無い）当てない——
     iPhone で直したほうが勝つ。済ませるは済ませるだけ（戻さない）。くり返し・またがる予定の日は動かさない。 */
  function applyOp(o) {
    const t = o && o.v === 2 && typeof o.id === "string" ? store.getTodo(o.id) : null;
    if (!t || t.archived || t.trace || t.done || (t.due || null) !== (o.seen || null)) return false;
    if (o.op === "done" && t.kind !== "event") { store.toggleTodo(t.id); return true; }
    if (o.op === "day" && DAY_RE.test(o.day || "") && !t.repeat && !t.endDay) { store.updateTodo(t.id, { due: o.day }); return true; }
    if (o.op === "week" && t.kind !== "event" && !t.repeat) { store.pickWeek(t.id, false); return true; }
    return false;
  }

  async function inboxTake() {
    if (taking) return 0;
    await recovered;
    if (!connected() || !cfg.appKey || store.get().settings.inboxPost === true || cfg.sender === false || store.replica()) return 0;
    const todo = KN.screens && KN.screens.todo;
    if (!todo || !todo.weekAdd) return 0;
    taking = true;
    let n = 0;
    try {
      const r = await call(API, "/2/files/list_folder", { json: { path: INBOX, limit: 200 } });
      if (!r.res.ok) return 0;
      // 足す一行と命令は、置いた時刻の順に（命令の頭の op- を外して並べる）。
      const when = (s) => s.replace(/^op-/, "");
      const names = (r.body.entries || []).filter((e) => e[".tag"] === "file" && (INBOX_RE.test(e.name) || OP_RE.test(e.name)))
        .map((e) => e.name).sort((a, b) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : 0));
      for (const name of names) {
        if (taken.has(name)) continue;
        const d = await call(CONTENT, "/2/files/download", { arg: { path: `${INBOX}/${name}` }, raw: true });
        if (!d.res.ok) continue;
        let o = null;
        try { o = JSON.parse(await d.res.text()); } catch (_) { o = null; }
        if (OP_RE.test(name)) { if (applyOp(o)) n++; }
        else {
          const text = String((o && o.text) || "").trim();
          if (text) { todo.weekAdd(text, { side: "work", quiet: true }); n++; }
        }
        taken.add(name);
        await call(API, "/2/files/delete_v2", { json: { path: `${INBOX}/${name}` } });
      }
    } catch (_) { /* 黙る。次に開いたとき */ } finally { taking = false; }
    return n;
  }

  /* PC で見る（段4の④）。iPhone が書いた glance.json を読むだけ（書かない・消さない）。
     受け箱へ置く端末（inboxPost 入）だけが読み、読めなければ null（黙る）。 */
  let seen = null, seenAt = 0;
  async function glanceRead(force) {
    if (!force && Date.now() - seenAt < 60000) return seen;
    await recovered;
    if (!connected() || !cfg.appKey || store.get().settings.inboxPost !== true) return null;
    seenAt = Date.now();
    try {
      const r = await call(CONTENT, "/2/files/download", { arg: { path: GLANCE }, raw: true });
      if (!r.res.ok) return (seen = null);
      const d = JSON.parse(await r.res.text());
      const ok = d && d.v === 1 && Array.isArray(d.events) && Array.isArray(d.marks);
      return (seen = ok ? d : null);
    } catch (_) { return (seen = null); }
  }

  function status() {
    return {
      appKey: cfg.appKey || "",
      connected: connected(),
      ready: !!cfg.pending,
      needsAuth: !!cfg.needsAuth,
      lastAt: cfg.lastAt || "",
      /* false … 控えはほかの端末が送っている（この端末はノートの画像だけ） */
      sender: cfg.sender !== false,
      error: cfg.error || "",
      errorAt: cfg.errorAt || "",
      keep: KEEP,
    };
  }

  store.subscribe(soon);
  store.subscribe(glanceSoon);
  document.addEventListener("visibilitychange", () => {
    if (!connected()) return;
    if (document.visibilityState === "visible") { glance(true); inboxTake(); }
    /* 隠れるときは書き換えの残りだけ（途中で切られることがある）。前に出て
       きたときは、ほかで変わっていないかも含めて見る。 */
    if (document.visibilityState === "hidden") { if (dirty) sync(); }
    else sync();
  });
  setTimeout(() => { prepare(); sync(); glance(true); inboxTake(); }, FIRST);

  /* `soon` はノートを書いたとき（js/notes-idb.js）。ノートは store を通らないので。 */
  /* `api` はノートの同期（js/notes-sync.js）が呼ぶ口。鍵の取り直しはこちらに任せる。 */
  const api = { call, summary, API, CONTENT, ready: () => recovered.then(() => connected() && !!cfg.appKey) };
  /** 取り込んだ元のファイル（.enex・zip）を `imports/<日>/<名前>` へそのまま。同じ名前で中身が違えば
      Dropbox が番号を足す（同じ中身なら置いた扱い）。大きいものは分けて送る。429 は retry_after だけ待つ。 */
  async function putImport(day, file) {
    await recovered;
    if (!connected() || !cfg.appKey) throw new Error("Dropbox とつながっていません");
    const name = String(file.name || "").normalize("NFC").replace(/[\\/:*?"<>|]/g, "_").replace(/^[\s.]+|[\s.]+$/g, "") || "file";
    const commit = { path: `${IMPORT_DIR}/${day}/${name}`, mode: "add", autorename: true, mute: true };
    const post = async (path, arg, body) => {
      for (let tries = 0; ; tries++) {
        const r = await call(CONTENT, path, { arg, body });
        if (r.res.ok) return r.body;
        const wait = r.res.status === 429 && r.body && r.body.error && r.body.error.retry_after;
        if (!wait || tries >= 3) throw new Error(summary(r));
        await new Promise((ok) => setTimeout(ok, wait * 1000));
      }
    };
    if (file.size <= PART) { await post("/2/files/upload", commit, file); return; }
    const { session_id } = await post("/2/files/upload_session/start", { close: false }, file.slice(0, PART));
    let at = PART;
    for (; at + PART < file.size; at += PART) {
      await post("/2/files/upload_session/append_v2", { cursor: { session_id, offset: at }, close: false }, file.slice(at, at + PART));
    }
    await post("/2/files/upload_session/finish", { cursor: { session_id, offset: at }, commit }, file.slice(at));
  }

  KN.dropbox = { status, putImport, setAppKey, authUrl, prepare, finish, disconnect, sync, soon, claim, onChange, backups, download, glance, glanceRead, inboxPut, inboxOp, inboxDrop, inboxTake, KEEP, api };
})();
