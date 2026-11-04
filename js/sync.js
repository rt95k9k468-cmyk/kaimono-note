/* =========================================================
   くらしノート — 3台の同期・端末の側（docs/sync.md 段2）
   =========================================================

   段2は**影の運用**：部屋につないだ一台（iPhone）だけが送り、誰も読まない（取る・当てるは段3から）。
   記録の形・書く道（store.update ほか）には触れない。部屋の約束は sync/README.md「約束の形」。

   - 入れ物：IndexedDB `kaimono-note-sync`（版1の決め打ち。今の棚の版を上げない）。
     meta（鍵・部屋・番号）・base（部屋が受け取った一件ずつの中身と版）・out（送り待ち。一件に一つ）。
   - 比べる：保存のあと、記録を棚に分け、前に合わせた中身（base に送り待ちを重ねたもの）と一件ずつ。
     棚の字がそのままなら一件ずつは見ない（過去の年はめったに変わらない）。**起動の途中は比べない**
     （日記の写し・過去のやることが揃う前の記録は欠けて見える。欠けを消したと送らない）。
   - 送る前に訊く（設定の「同期の部屋」）：最初の中身／消しすぎ（部屋と同じ決まり）／丸ごと入れ替えたあと
     （復元・すべて削除・写しから戻す。store.replaced()。欄の既定が埋まって全部が変わって見えるのは訊かない）。
   - 鍵：32バイトの元から HKDF で二つ（中身の AES-GCM・名前の HMAC）。元はこの入れ物と Dropbox の
     `sync-key.json`（利用者に打たせない）。部屋に見えるのは版・順・消した印・大きさ・時刻だけ。
   - 照らす：一日に一度、部屋の版を全部と、一件の中身を開いて読み比べる（残すのは数だけ）。
   - 同期は一つの窓だけ（Web Locks）。本文・棚の名前・部屋の URL・鍵を書き出さない（console・errlog に出さない）。 */
(function () {
  "use strict";
  const KN = window.KN;
  const store = KN.store;

  const DB = "kaimono-note-sync";
  /* 約束の版（部屋に名乗る）。棚の分け方・中身の形を変えたら上げる（部屋は下げない＝古い端末は書けない）。 */
  const SCHEMA = 1;
  const WAIT = 4000;              // 保存のあと比べるまで
  const BATCH = 200;              // 一回の送りの件数（部屋は 500 まで）
  const BATCH_CHARS = 3000000;    // 一回の送りの字数（部屋は 4MB まで）
  const STALE = 3 * 86400000;     // 送れないままこれだけ経ったら歯車の点
  const CALL_WAIT = 30000;

  /* 棚：送るもの／この端末だけのもの。**記録に新しい欄を足したら、どちらかに書く**（tests/sync-device.js が
     見張る）。archive・diet は入れ物で、中の欄ごとに決める。設定は送らない（中継所の URL・鍵は特に）。 */
  const SEND = new Set([
    "categories", "stores", "products", "items", "sets", "todos", "learned", "asks", "iconOverrides", "iconReports",
    "archive.entries", "archive.days", "archive.quiet",
    "diet.weights", "diet.meals", "diet.foods", "diet.health", "diet.drinks", "diet.urges", "diet.goal",
  ]);
  const LOCAL = new Set(["schema", "settings", "inboxSeen", "todoOut", "diet.sync"]);
  const BOXES = new Set(["archive", "diet"]);
  const MAPS = new Set(["learned", "iconOverrides"]);   // 鍵ごとに一件

  const enc = new TextEncoder(), dec = new TextDecoder();

  let phase = "idle";             // idle → loading → on | off
  let meta = {};
  let base = new Map();           // k → { k, ver, json|null }
  let out = new Map();            // k → { k, shelf, key, op, base, json|null, tried, sure, bad }
  let view = new Map();           // shelf → Map key → json（base に送り待ちを重ねたもの。生きているものだけ）
  const shown = new Map();        // shelf → 前に比べた棚の字（同じなら一件ずつは見ない）
  let keys = null;
  const names = new Map();        // 名前のハッシュの覚え
  let ask = null;                 // { kind: "first"|"bulk"|"many", n }
  let allow = null;               // 訊いて「送る」と決まったもの（次の一回だけ）
  let replaced = null;            // 前に比べたときの store.replaced()（丸ごと入れ替わったら訊く）
  let lockHeld = false, begun = false;
  let timer = 0, running = false, again = false;
  let fails = 0;
  let unknown = [];
  const listeners = new Set();

  /* ---------------- 入れ物 ---------------- */

  let dbP = null;
  function openDb() {
    if (dbP) return dbP;
    dbP = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const n of ["meta", "base", "out"]) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: "k" });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbP = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error("開けませんでした"));
    });
    dbP.catch(() => { dbP = null; });
    return dbP;
  }
  function run(names2, mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(names2, mode);
      let res;
      try { res = fn(t); } catch (err) { reject(err); return; }
      t.oncomplete = () => resolve(typeof res === "function" ? res() : res);
      t.onerror = t.onabort = () => reject(t.error || new Error("取り消されました"));
    }));
  }
  const all = (t, n) => {
    const out2 = [];
    t.objectStore(n).openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) { out2.push(c.value); c.continue(); }
    };
    return () => out2;
  };
  async function load() {
    const got = await run(["meta", "base", "out"], "readonly", (t) => {
      const a = all(t, "meta"), b = all(t, "base"), c = all(t, "out");
      return () => ({ meta: a(), base: b(), out: c() });
    });
    meta = {};
    got.meta.forEach((r) => { meta[r.k] = r.v; });
    base = new Map(got.base.map((r) => [r.k, r]));
    out = new Map(got.out.map((r) => [r.k, r]));
    view = new Map();
    base.forEach((r) => { if (r.json !== null) viewSet(r.k, r.json); });
    out.forEach((e) => viewSet(e.k, e.json));
  }
  const putMeta = (patch) => {
    Object.assign(meta, patch);
    return run(["meta"], "readwrite", (t) => {
      const s = t.objectStore("meta");
      Object.keys(patch).forEach((k) => (patch[k] === undefined ? s.delete(k) : s.put({ k, v: patch[k] })));
    });
  };
  const splitK = (k) => { const i = k.indexOf("\n"); return [k.slice(0, i), k.slice(i + 1)]; };
  function viewSet(k, json) {
    const [shelf, key] = splitK(k);
    let m = view.get(shelf);
    if (json === null) { if (m) { m.delete(key); if (!m.size) view.delete(shelf); } return; }
    if (!m) view.set(shelf, m = new Map());
    m.set(key, json);
  }

  /* ---------------- 鍵 ---------------- */

  const random = (n) => crypto.getRandomValues(new Uint8Array(n));
  const b64 = (bytes) => { let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s); };
  const b64u = (bytes) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64 = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const newOp = () => b64u(random(12));

  function keyText(raw) {
    return JSON.stringify({ app: "kaimono-note", kind: "sync-key", v: 1, key: raw, at: new Date().toISOString() });
  }
  function keyOf(text) {
    try {
      const o = JSON.parse(text);
      return o && o.kind === "sync-key" && typeof o.key === "string" && unb64(o.key).length === 32 ? o.key : null;
    } catch (_) { return null; }
  }
  async function deriveKeys(raw) {
    const ikm = await crypto.subtle.importKey("raw", unb64(raw), "HKDF", false, ["deriveKey"]);
    const salt = enc.encode("kurashi-sync");
    const d = (info, alg, use) => crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode(info) }, ikm, alg, false, use);
    return {
      body: await d("body", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
      name: await d("name", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]),
    };
  }
  /** 鍵の元。この端末に無ければ Dropbox から。どちらにも無ければ作る（Dropbox へは keyOut で）。 */
  async function ensureKey() {
    if (keys) return keys;
    if (!meta.key) {
      let got;
      try { got = KN.dropbox ? await KN.dropbox.syncKeyGet() : undefined; }
      catch (_) { throw new Error("Dropbox から鍵を読めませんでした"); }
      const there = got ? keyOf(got) : null;
      if (got && !there) throw new Error("Dropbox の鍵が読めない形です");
      await putMeta({ key: there || b64u(random(32)), keyOut: !!there });
    }
    keys = await deriveKeys(meta.key);
    return keys;
  }
  /** 鍵を Dropbox へ（まだなら）。先に別の鍵が置かれていたら止める（二つの鍵で書かない）。 */
  async function keyOut() {
    if (meta.keyOut || !meta.key || !KN.dropbox) return;
    try {
      const r = await KN.dropbox.syncKeyPut(keyText(meta.key));
      if (r === "ok") await putMeta({ keyOut: true });
      else if (r === "exists") {
        const there = keyOf(await KN.dropbox.syncKeyGet());
        if (there === meta.key) await putMeta({ keyOut: true });
        else await putMeta({ trouble: "key" });
      }
    } catch (_) { /* 次の回で */ }
  }
  async function hmac(s) {
    const sig = await crypto.subtle.sign("HMAC", keys.name, enc.encode(s));
    return b64u(new Uint8Array(sig));
  }
  async function nameOf(shelf, key) {
    const k = shelf + "\n" + key;
    if (!names.has(k)) names.set(k, [await hmac("s\n" + shelf), await hmac("i\n" + k)]);
    return names.get(k);
  }
  /* 中身：版1の印・IV・暗号文。棚と鍵（素の名前）も中に入れる——部屋のハッシュからは戻せないので、
     新しい端末が読むときに要る。名前のハッシュを AAD にして、部屋が中身を入れ替えても開けないように。 */
  async function seal(shelf, key, json, sh, ih) {
    const iv = random(12);
    const pt = enc.encode(`{"s":${JSON.stringify(shelf)},"i":${JSON.stringify(key)},"d":${json}}`);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(sh + "." + ih) }, keys.body, pt));
    const o = new Uint8Array(13 + ct.length);
    o[0] = 1; o.set(iv, 1); o.set(ct, 13);
    return b64(o);
  }
  async function unseal(body, sh, ih) {
    const b = unb64(body);
    if (b[0] !== 1) throw new Error("form");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(1, 13), additionalData: enc.encode(sh + "." + ih) }, keys.body, b.slice(13));
    return JSON.parse(dec.decode(pt));
  }

  /* ---------------- 棚に分ける ---------------- */

  /* 一件の字は欄の名前の順に並べる（読み直すと reconcile が欄の順を変える＝中身は同じでも字が違って見える）。 */
  function canon(v) {
    if (v === null || typeof v !== "object") return v === undefined || typeof v === "function" ? "null" : JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    const ks = Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== "function").sort();
    return "{" + ks.map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }

  const yearOf = (x) => {
    const d = x && (x.date || x.day);
    return typeof d === "string" && /^\d{4}-/.test(d) ? d.slice(0, 4) : "";
  };
  /** 記録を棚へ。Map 棚 → Map 鍵 → 値。id か日付のある配列は一件ずつ・年で棚を分ける。 */
  function shelvesOf(s) {
    const res = new Map();
    const miss = [];
    const put = (shelf, key, v) => {
      let m = res.get(shelf);
      if (!m) res.set(shelf, m = new Map());
      let k = key, n = 1;
      while (m.has(k)) k = `${key}#${++n}`;
      m.set(k, v);
    };
    const split = (path, v) => {
      if (Array.isArray(v)) {
        v.forEach((x) => {
          const y = yearOf(x);
          const shelf = y ? `${path}:${y}` : path;
          if (x && typeof x === "object" && (typeof x.id === "string" || typeof x.id === "number")) put(shelf, "id:" + x.id, x);
          else if (x && typeof x === "object" && typeof x.date === "string") put(shelf, "date:" + x.date, x);
          else put(shelf, "v:" + JSON.stringify(x), x);
        });
      } else if (MAPS.has(path) && v && typeof v === "object") {
        Object.keys(v).forEach((k) => put(path, "k:" + k, v[k]));
      } else if (v !== undefined) put(path, "_", v);
    };
    for (const top of Object.keys(s || {})) {
      if (BOXES.has(top) && s[top] && typeof s[top] === "object") {
        for (const sub of Object.keys(s[top])) {
          const p = `${top}.${sub}`;
          if (SEND.has(p)) split(p, s[top][sub]);
          else if (!LOCAL.has(p)) miss.push(p);
        }
      } else if (SEND.has(top)) split(top, s[top]);
      else if (!LOCAL.has(top)) miss.push(top);
    }
    unknown = miss;
    return res;
  }

  /** 比べてよいか。起動の途中・読めなかった日・写しの端末・外した印が残っているあいだは比べない。 */
  function settled() {
    if (store.loadError() || store.replica()) return false;
    if (KN.diaryIdb && KN.diaryIdb.status().phase !== "on") return false;
    if (KN.todoPast && KN.todoPast.status().phase !== "on") return false;
    if (store.todoOut().length) return false;
    if (KN.backup && KN.backup.lost && KN.backup.lost()) return false;
    const days = (store.get().archive || {}).days || [];
    return !days.some((d) => store.memoOut(d));
  }

  /* ---------------- 比べる ---------------- */

  async function compare() {
    if (!settled()) return false;
    const cur = shelvesOf(store.get());
    const puts = [], dels = [], texts = new Map();
    const rep = store.replaced();
    if (replaced === null) replaced = rep;
    for (const shelf of new Set([...cur.keys(), ...view.keys()])) {
      const m = cur.get(shelf) || new Map();
      const text = JSON.stringify([...m]);
      if (shown.get(shelf) === text) continue;
      texts.set(shelf, text);
      const was = view.get(shelf) || new Map();
      for (const [key, v] of m) {
        const j = canon(v);
        if (was.get(key) !== j) puts.push({ shelf, key, json: j, fresh: !was.has(key) });
      }
      for (const key of was.keys()) if (!m.has(key)) dels.push({ shelf, key, json: null });
    }
    if (!puts.length && !dels.length) { texts.forEach((t, n) => shown.set(n, t)); replaced = rep; return true; }

    const ok = allow;
    allow = null;
    if (!meta.firstDone) {
      if (ok !== "first") return hold({ kind: "first", n: puts.length });
    } else {
      /* 復元・すべて削除・写しから戻す（利用者の選んだ入れ替え）のあとは、直した・消した分を送る前に訊く。 */
      const changed = puts.filter((p) => !p.fresh).length + dels.length;
      if (ok !== "bulk" && rep !== replaced && changed) return hold({ kind: "bulk", n: changed });
      if (ok !== "bulk" && ok !== "many") {
        const per = new Map();
        dels.forEach((d) => per.set(d.shelf, (per.get(d.shelf) || 0) + 1));
        for (const [shelf, n] of per) {
          const live = (view.get(shelf) || new Map()).size;
          if (n > 100 || (n > 10 && n * 5 > live)) return hold({ kind: "many", n: dels.length });
        }
      }
    }
    setAsk(null);
    replaced = rep;

    const sure = ok === "many" || ok === "bulk";
    const skipped = new Set(), puts2 = [], gone = [];
    for (const c of puts.concat(dels)) {
      const k = c.shelf + "\n" + c.key;
      const e = out.get(k);
      if (e && e.tried) { skipped.add(c.shelf); again = true; continue; }   // 送っている途中のものは、返事のあとで
      const b = base.get(k);
      viewSet(k, c.json);
      if (b ? b.json === c.json : c.json === null) { if (e) { out.delete(k); gone.push(k); } continue; }
      const n = e || { k, shelf: c.shelf, key: c.key, op: newOp(), base: b ? b.ver : 0, tried: false };
      n.json = c.json;
      n.sure = sure && c.json === null;
      n.at = Date.now();
      out.set(k, n);
      puts2.push(n);
    }
    await run(["out", "meta"], "readwrite", (t) => {
      const s = t.objectStore("out");
      puts2.forEach((e) => s.put(e));
      gone.forEach((k) => s.delete(k));
      if (!meta.firstDone) t.objectStore("meta").put({ k: "firstDone", v: Date.now() });
    });
    if (!meta.firstDone) meta.firstDone = Date.now();
    texts.forEach((t, n) => { if (!skipped.has(n)) shown.set(n, t); });
    tell();
    return true;
  }
  function hold(a) { setAsk(a); return false; }
  function setAsk(a) {
    if (JSON.stringify(a) === JSON.stringify(ask)) return;
    ask = a;
    tell();
  }

  /* ---------------- 部屋へ ---------------- */

  async function call(method, path, body) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const cut = ctl ? setTimeout(() => ctl.abort(), CALL_WAIT) : 0;
    try {
      const headers = {};
      if (meta.token) headers.Authorization = `Bearer ${meta.token}`;
      if (body) headers["Content-Type"] = "application/json";
      const res = await fetch(meta.url + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        signal: ctl ? ctl.signal : undefined, cache: "no-store", credentials: "omit",
      });
      let b = null;
      try { b = await res.json(); } catch (_) { b = null; }
      return { status: res.status, body: b || {} };
    } finally { clearTimeout(cut); }
  }

  async function push() {
    if (!meta.token || meta.trouble || !out.size) return;
    await ensureKey();
    for (let guard = 0; guard < 200; guard++) {
      const ready = [...out.values()].filter((e) => !e.bad);
      if (!ready.length) return;
      /* 訊いて決めた消し（sure）は、それだけで一回に（部屋は sure を消しの数ちょうどで受ける）。 */
      const sures = ready.filter((e) => e.sure);
      const pick = sures.length ? sures : ready;
      const batch = [];
      let chars = 0;
      for (const e of pick) {
        if (batch.length >= BATCH) break;
        const [sh, ih] = await nameOf(e.shelf, e.key);
        const c = { op: e.op, shelf: sh, item: ih, base: e.base };
        if (e.json === null) c.del = true;
        else c.body = await seal(e.shelf, e.key, e.json, sh, ih);
        const len = (c.body || "").length + 200;
        if (batch.length && chars + len > BATCH_CHARS) break;
        chars += len;
        batch.push([e, c]);
      }
      const marks = batch.filter(([e]) => !e.tried).map(([e]) => e);
      marks.forEach((e) => { e.tried = true; });
      if (marks.length) await run(["out"], "readwrite", (t) => { marks.forEach((e) => t.objectStore("out").put(e)); });
      const body = { schema: SCHEMA, changes: batch.map((x) => x[1]) };
      if (sures.length) body.sure = batch.filter(([e]) => e.json === null).length;
      let r;
      try { r = await call("POST", "/push", body); } catch (_) { failed(); return; }
      const why = r.body.why;
      if (r.status === 200 && Array.isArray(r.body.results)) { await took(batch, r.body.results); continue; }
      if (r.status === 409 && why === "many") { setAsk({ kind: "many", n: [...out.values()].filter((e) => e.json === null).length }); return; }
      if (r.status === 401) { await putMeta({ trouble: "who" }); tell(); return; }
      if (r.status === 426) { await putMeta({ trouble: "old" }); tell(); return; }
      if (r.status === 400 && why === "form" && Number.isInteger(r.body.at) && batch[r.body.at]) {
        const e = batch[r.body.at][0];   // 部屋が預かれない一件（大きすぎる）。数えて、ほかは送る
        e.bad = true;
        await run(["out"], "readwrite", (t) => { t.objectStore("out").put(e); });
        continue;
      }
      failed();
      return;
    }
  }
  /** 返事を当てる。受け取った → 前に合わせた中身へ。版が違った → 影のあいだは書くのはこの一台なので、
      今の版の上に送り直す（段4からは三方で合わせる）。 */
  async function took(batch, results) {
    const byOp = new Map(results.map((r) => [r.op, r]));
    const done = [], redo = [];
    for (const [e] of batch) {
      const r = byOp.get(e.op);
      if (!r) continue;
      if (r.ok) {
        const b = { k: e.k, ver: r.ver, json: e.json };
        base.set(e.k, b);
        out.delete(e.k);
        done.push(b);
      } else if (r.why === "ver" && r.cur) {
        if (e.json === null && r.cur.del) {
          const b = { k: e.k, ver: r.cur.ver, json: null };
          base.set(e.k, b); out.delete(e.k); done.push(b);
        } else {
          Object.assign(e, { base: r.cur.ver, op: newOp(), tried: false });
          redo.push(e);
        }
      }
    }
    await run(["base", "out", "meta"], "readwrite", (t) => {
      done.forEach((b) => { t.objectStore("base").put(b); t.objectStore("out").delete(b.k); });
      redo.forEach((e) => t.objectStore("out").put(e));
      t.objectStore("meta").put({ k: "sentAt", v: Date.now() });
      t.objectStore("meta").put({ k: "failSince", v: 0 });
    });
    meta.sentAt = Date.now();
    meta.failSince = 0;
    if (redo.length) await putMeta({ redo: (meta.redo || 0) + redo.length });
    fails = 0;
    tell();
  }
  function failed() {
    fails++;
    if (!meta.failSince) putMeta({ failSince: Date.now() }).catch(() => {});
    soon(Math.min(30000 * 2 ** Math.min(fails, 6), 30 * 60000));
    tell();
  }

  /* ---------------- 照らす（一日に一度） ---------------- */

  async function check() {
    const day = KN.util.todayKey();
    if (!meta.firstDone || out.size || meta.checkDay === day || meta.trouble) return;
    await ensureKey();
    const room = new Map();
    let since = 0;
    for (let guard = 0; guard < 1000; guard++) {
      let r;
      try { r = await call("GET", `/pull?since=${since}&limit=1000`); } catch (_) { return; }
      if (r.status === 409 && r.body.why === "ahead") break;   // 作り直された部屋：下で全部ずれとして数える
      if (r.status !== 200 || !Array.isArray(r.body.items)) return;
      r.body.items.forEach((x) => room.set(x.shelf + "." + x.item, x));
      if (!r.body.more) break;
      since = r.body.next;
    }
    let miss = 0, n = 0;
    const live = [];
    for (const b of base.values()) {
      const [shelf, key] = splitK(b.k);
      const [sh, ih] = await nameOf(shelf, key);
      const x = room.get(sh + "." + ih);
      room.delete(sh + "." + ih);
      n++;
      if (!x || x.ver !== b.ver || !!x.del !== (b.json === null)) miss++;
      else if (b.json !== null) live.push([b, x, sh, ih, shelf, key]);
    }
    /* 一件だけ開いて読み比べる（中身・棚・鍵が合うか）。 */
    let body = null;
    if (live.length) {
      const [b, x, sh, ih, shelf, key] = live[Math.floor(Math.random() * live.length)];
      try {
        const o = await unseal(x.body, sh, ih);
        body = o.s === shelf && o.i === key && JSON.stringify(o.d) === b.json;
      } catch (_) { body = false; }
    }
    const row = { day, n, miss, extra: room.size, body };
    await putMeta({ checkDay: day, checks: (meta.checks || []).concat([row]).slice(-30) });
    tell();
  }

  /* ---------------- 回す ---------------- */

  function soon(ms) {
    clearTimeout(timer);
    timer = setTimeout(round, ms === undefined ? WAIT : ms);
  }
  async function round() {
    if (phase !== "on" || !meta.token || !lockHeld) return;
    if (running) { again = true; return; }
    running = true;
    try {
      await keyOut();
      if (await compare()) {
        await push();
        await check();
      }
    } catch (err) {
      if (KN.errlog) KN.errlog.note("sync", new Error(String((err && err.name) || "error")), { file: "sync.js" });
    } finally {
      running = false;
      if (again) { again = false; soon(); }
    }
  }

  function begin() {
    if (begun || !meta.token) return;
    begun = true;
    store.subscribe(() => soon());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") soon(0);
      else soon(1000);
    });
    window.addEventListener("online", () => soon(0));
    const go = () => { lockHeld = true; soon(0); };
    /* 起動の途中は比べない：日記の写し・過去のやること・記録の点検が済んでから。 */
    const wait = [KN.diaryIdb && KN.diaryIdb.ready(), KN.todoPast && KN.todoPast.ready(),
      KN.backup && KN.backup.checked && KN.backup.checked()].filter(Boolean);
    Promise.all(wait).catch(() => {}).then(() => {
      if (navigator.locks && navigator.locks.request) {
        navigator.locks.request("kaimono-note-sync", () => { go(); return new Promise(() => {}); }).catch(() => {});
      } else go();
    });
  }

  async function start() {
    if (phase !== "idle") return;
    if (!window.indexedDB || !window.crypto || !crypto.subtle || store.replica()) { phase = "off"; return; }
    phase = "loading";
    try { await load(); phase = "on"; } catch (_) { phase = "off"; tell(); return; }
    begin();
    tell();
  }

  /* ---------------- 設定から ---------------- */

  function deviceName() {
    const ua = navigator.userAgent || "";
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
    if (/Windows/.test(ua)) return "Surface";
    return "端末";
  }
  /** 部屋の合言葉（ROOM_SETUP）。この端末が作り、つなぐまで持つ（Cloudflare へ貼るのは利用者）。 */
  async function setupCode() {
    if (phase !== "on") throw new Error("この端末では同期を使えません");
    if (!meta.setup) await putMeta({ setup: b64u(random(24)) });
    return meta.setup;
  }
  /** つなぐ。url は https の部屋。code は ROOM_SETUP（二台めからは /pair の合言葉。段3から）。 */
  async function join(url, code) {
    if (phase !== "on") throw new Error("この端末では同期を使えません");
    if (meta.token) throw new Error("もうつないであります");
    let u;
    try { u = new URL(String(url || "").trim()); } catch (_) { throw new Error("URL の形ではありません"); }
    if (u.protocol !== "https:") throw new Error("https:// で始まる URL にしてください");
    await ensureKey();
    const prev = meta.url;
    meta.url = u.origin;
    let r;
    try { r = await call("POST", "/join", { code: String(code || "").trim(), name: deviceName(), schema: SCHEMA }); }
    catch (_) { meta.url = prev; throw new Error("部屋に届きませんでした"); }
    if (r.status !== 200 || !r.body.token) {
      meta.url = prev;
      const why = r.body.why;
      throw new Error(why === "code" ? "合言葉が合いません" : why === "wait" ? "しばらく待ってから" : why === "old" ? "アプリが古い版です" : "つなげませんでした");
    }
    await putMeta({ url: u.origin, token: r.body.token, device: r.body.device, room: r.body.room, joinedAt: Date.now(), setup: undefined });
    begin();
    soon(0);
    tell();
    return true;
  }
  /** 訊いたことに「送る」。最初の中身・丸ごと・消しすぎ。 */
  async function go() {
    if (!ask) return;
    if (ask.kind === "many" && meta.firstDone) {
      /* 部屋が断った消し（送り待ちにある）にも印を付けて送り直す。 */
      const dels = [...out.values()].filter((e) => e.json === null);
      if (dels.length) {
        dels.forEach((e) => { e.sure = true; e.tried = false; e.op = newOp(); });
        await run(["out"], "readwrite", (t) => { dels.forEach((e) => t.objectStore("out").put(e)); });
      }
    }
    allow = ask.kind;
    setAsk(null);
    shown.clear();
    soon(0);
  }
  /** この端末を切る（部屋からも外してみる）。鍵の元は残す（Dropbox と同じ鍵のまま、つなぎ直せる）。 */
  async function leave() {
    if (meta.token) { try { await call("DELETE", `/devices/${encodeURIComponent(meta.device || "")}`); } catch (_) { /* 部屋に届かなくても、こちらは忘れる */ } }
    await run(["meta", "base", "out"], "readwrite", (t) => {
      ["url", "token", "device", "room", "joinedAt", "firstDone", "sentAt", "failSince", "checkDay", "checks", "trouble", "redo"]
        .forEach((k) => t.objectStore("meta").delete(k));
      t.objectStore("base").clear();
      t.objectStore("out").clear();
    });
    await load();
    shown.clear();
    ask = null;
    tell();
  }

  /** 困ったときだけ（歯車の点）：切られた who・古い版 old・鍵が二つ key・送れないまま stale・照らしてずれ far。 */
  function trouble() {
    if (phase !== "on" || !meta.token) return null;
    if (meta.trouble) return meta.trouble;
    if (meta.failSince && Date.now() - meta.failSince > STALE) return "stale";
    const last = (meta.checks || [])[(meta.checks || []).length - 1];
    if (last && (last.miss || last.extra || last.body === false)) return "far";
    return null;
  }
  function status() {
    let live = 0;
    view.forEach((m) => { live += m.size; });
    return {
      phase, joined: !!meta.token, lock: lockHeld, ask, trouble: trouble(), out: out.size, bad: [...out.values()].filter((e) => e.bad).length,
      live, sentAt: meta.sentAt || 0, checks: (meta.checks || []).slice(), keyOut: !!meta.keyOut, firstDone: !!meta.firstDone,
      redo: meta.redo || 0,
    };
  }
  function tell() { listeners.forEach((fn) => { try { fn(); } catch (_) { /* 聞き手の失敗は回すほうへ持ちこまない */ } }); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  KN.sync = {
    start, status, trouble, onChange, setupCode, join, go, leave, SCHEMA,
    /* 試験と門のため（棚の分け方・送らない欄・知らない欄）。 */
    shelvesOf, unknown: () => unknown.slice(), SEND, LOCAL, now: async () => {
      clearTimeout(timer);
      while (running) await new Promise((r) => setTimeout(r, 30));
      return round();
    },
  };
})();
