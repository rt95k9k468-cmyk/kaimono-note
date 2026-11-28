/* =========================================================
   くらしノート — 3台の同期・端末の側（docs/sync.md 段2）
   =========================================================

   段2は**影の運用**：部屋につないだ一台（iPhone）だけが送る。段3：写しの端末（js/replica.js）は部屋から読める
   （下の「読む」。印 kn-replica-from が "room" のときだけ。書くのは受け箱か、開けた棚は部屋へ＝下の「書く」）。
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
  /** 鍵の元。この端末に無ければ Dropbox から。どちらにも無ければ作る（Dropbox へは keyOut で）。
      make が false（読む端末）なら作らず null。 */
  async function ensureKey(make = true) {
    if (keys) return keys;
    if (!meta.key) {
      let got;
      try { got = KN.dropbox ? await KN.dropbox.syncKeyGet() : undefined; }
      catch (_) { throw new Error("Dropbox から鍵を読めませんでした"); }
      const there = got ? keyOf(got) : null;
      if (got && !there) throw new Error("Dropbox の鍵が読めない形です");
      if (!there && !make) return null;
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
  /** 三方（docs/sync.md「書く」）。元・自分・部屋の一件（null＝無い・消した）。欄ごとに変えたほうを取り、両方が違う値なら部屋
      （先に着いたほう）。消すと直すは直すが勝つ。欄の中（配列・入れ子）は分けない。 */
  function merge3(b, mine, room) {
    const same = (x, y) => canon(x) === canon(y);
    if (mine == null || room == null) {
      const left = mine == null ? room : mine;
      return left == null || (b != null && same(left, b)) ? null : left;
    }
    const obj = (x) => x && typeof x === "object" && !Array.isArray(x);
    if (!obj(mine) || !obj(room)) return same(mine, b) || !same(room, b) ? room : mine;
    const o = {}, bo = obj(b) ? b : {};
    for (const k of new Set([...Object.keys(room), ...Object.keys(mine), ...Object.keys(bo)])) {
      const v = same(mine[k], bo[k]) || !same(room[k], bo[k]) ? room[k] : mine[k];
      if (v !== undefined) o[k] = v;
    }
    return o;
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
    if (ok !== "room") allow = null;
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
    if (!meta.token || meta.trouble || !out.size || !(await ensureKey(!reader))) return;
    for (let guard = 0; guard < 200; guard++) {
      const open = takes(), ready = [...out.values()].filter((e) => !e.bad && !(e.wait > e.base && open.has(e.shelf)));
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
        batch.push([e, c, e.json]);
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
  /** 返事を当てる。受け取った → 前に合わせた中身へ（送るあいだに直した分は続けて）。版が違った → 写しの端末は部屋の版と三方で、
      取りこむ棚なら取りこんでから三方で（wait）、ほかの棚は書くのはこの一台なので、今の版の上に送り直す。 */
  async function took(batch, results) {
    const byOp = new Map(results.map((r) => [r.op, r]));
    const done = [], redo = [];
    const fix = (e, c, ver, json, next) => {
      const b = { ...base.get(e.k), k: e.k, ver, json };
      if (reader) b.h = c.shelf + "." + c.item;
      base.set(e.k, b); done.push(b);
      if (next === json) out.delete(e.k);
      else { Object.assign(e, { base: ver, from: json, json: next, op: newOp(), tried: false }); redo.push(e); }
    };
    for (const [e, c, j] of batch) {
      const r = byOp.get(e.op);
      if (!r) continue;
      if (r.ok) fix(e, c, r.ver, j, e.json);
      else if (r.why === "ver" && r.cur) {
        if (e.json === null && r.cur.del) fix(e, c, r.cur.ver, null, null);
        else if (reader) {
          let d = null;
          if (r.cur.body) { try { d = (await unseal(r.cur.body, c.shelf, c.item)).d; } catch (_) { continue; } }
          const p = (x) => (x == null ? null : JSON.parse(x)), v = merge3(p(e.from), p(e.json), d);
          fix(e, c, r.cur.ver, d === null ? null : canon(d), v === null ? null : canon(v));
        } else if (takes().has(e.shelf)) {
          Object.assign(e, { wait: r.cur.ver, op: newOp(), tried: false });
          redo.push(e);
          again = true;
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

  /* ---------------- 取りこむ（段4。iPhone） ----------------
     開けた棚（meta.take。既定は無い）の、ほかの端末の版を merge3(元, 今, 部屋) で記録へ。受け箱と同じ時だけ・先に控え・
     20件か1/5（5件より多い）を越えて変わるなら訊く。無い品物を指す一件は持ち越す（held）。送りの 409 は取りこんでから（wait）。 */
  const TAKE = new Set(["items"]);
  const takes = () => new Set((meta.take || []).filter((x) => TAKE.has(x)));
  function putRec(s, shelf, key, v) {
    const l = s[shelf] = Array.isArray(s[shelf]) ? s[shelf] : [], i = l.findIndex((y) => y && "id:" + y.id === key);
    if (v === null) { if (i >= 0) l.splice(i, 1); } else if (i >= 0) l[i] = v; else l.unshift(v);
  }
  const busy = () => !!(KN.ui && KN.ui.sheetsOpen && KN.ui.sheetsOpen() > 0);
  function plan(s, recs) {
    const cur = shelvesOf(s), prods = new Set((s.products || []).map((p) => p.id)), res = [], held = [];
    for (const r of recs) {
      const b = base.get(r.k), [shelf, key] = splitK(r.k), mine = (cur.get(shelf) || new Map()).get(key);
      const v = merge3(b && b.json !== null ? JSON.parse(b.json) : null, mine === undefined ? null : mine, r.d);
      if (v && v.productId != null && !prods.has(v.productId)) held.push(r.x);
      else res.push({ ...r, shelf, key, v, json: v === null ? null : canon(v), was: mine === undefined ? null : canon(mine) });
    }
    return { res, held, n: res.filter((c) => c.json !== c.was).length };
  }
  async function take() {
    const open = takes();
    if (!open.size || !meta.firstDone || !settled() || [...out.values()].some((e) => e.tried && open.has(e.shelf))) return true;
    if (busy()) { soon(15000); return true; }
    if (KN.diaryIdb && KN.diaryIdb.body() !== "ok") return true;
    await ensureKey();
    const sh = new Map(), byH = new Map();
    for (const x of open) sh.set(await hmac("s\n" + x), x);
    const add = (x) => { const h = x.shelf + "." + x.item; if (!((byH.get(h) || {}).ver >= x.ver)) byH.set(h, x); };
    (meta.held || []).forEach(add);
    let since = meta.takeSeq || 0;
    for (let guard = 0; guard < 1000; guard++) {
      let r;
      try { r = await call("GET", `/pull?since=${since}&limit=1000`); } catch (_) { return true; }
      if (r.status === 409 && r.body.why === "ahead") { await putMeta({ takeSeq: 0, held: [] }); return true; }
      if (r.status !== 200 || !Array.isArray(r.body.items) || r.body.schema > SCHEMA) return true;
      r.body.items.filter((x) => sh.has(x.shelf)).forEach(add);
      since = Number.isInteger(r.body.next) ? r.body.next : since;
      if (!r.body.more) break;
    }
    const ih = new Map(), recs = [];
    for (const b of base.values()) { const [s0, k0] = splitK(b.k); if (open.has(s0)) ih.set((await nameOf(s0, k0))[1], b.k); }
    for (const x of byH.values()) {
      let k = ih.get(x.item), d = null;
      if (!x.del) {
        let o;
        try { o = await unseal(x.body, x.shelf, x.item); } catch (_) { return true; }
        if (!o || o.s !== sh.get(x.shelf) || !/^id:[^#]*$/.test(o.i)) continue;
        k = o.s + "\n" + o.i; d = o.d;
      }
      const b = k && base.get(k);
      if (k && !(b && b.ver >= x.ver)) recs.push({ k, x, d, room: d === null ? null : canon(d) });
    }
    let p = plan(store.get(), recs);
    const ok = allow === "room";
    if (ok) allow = null;
    if (p.n) {
      let live = 0;
      open.forEach((x) => { live += (store.get()[x] || []).length; });
      if (!ok && (p.n > 20 || (p.n > 5 && p.n * 5 > live))) return hold({ kind: "room", n: p.n });
      if (KN.backup && KN.backup.take) {
        const r = await KN.backup.take("部屋からの取りこみ前", { force: true });
        if (r !== "taken" && r !== "same") return true;
      }
      if (busy() || !settled()) { soon(15000); return true; }
      p = plan(store.get(), recs);
      store.update((s) => p.res.forEach((c) => { if (c.json !== c.was) putRec(s, c.shelf, c.key, c.v); }));
      if (store.saveNow() === false) return true;
    }
    const ups = [];
    p.res.forEach((c) => {
      base.set(c.k, { k: c.k, ver: c.x.ver, json: c.room });
      const e = out.get(c.k);
      if (e) { Object.assign(e, { base: c.x.ver, op: newOp() }); ups.push(e); }
      viewSet(c.k, e ? e.json : c.room);
      shown.delete(c.shelf);
    });
    await run(["base", "out", "meta"], "readwrite", (t) => {
      p.res.forEach((c) => t.objectStore("base").put(base.get(c.k)));
      ups.forEach((e) => t.objectStore("out").put(e));
      t.objectStore("meta").put({ k: "takeSeq", v: since });
      t.objectStore("meta").put({ k: "held", v: p.held });
    });
    Object.assign(meta, { takeSeq: since, held: p.held });
    if (ask && ask.kind === "room") setAsk(null);
    return true;
  }
  /** 取りこむ棚を決める（既定は切る）。開け直すと頭から読む（自分の送った版は飛ばす）。 */
  async function takeFrom(list) {
    await putMeta({ take: (list || []).filter((x) => TAKE.has(x)), takeSeq: 0, held: [] });
    tell();
    soon(0);
  }

  /* ---------------- 書く（段4の③。写しの端末） ----------------
     開けた棚（meta.write。既定は無い）の直しを、受け箱の依頼の代わりに一件ずつ送り待ちへ（from＝そのときの部屋の版）。
     写しに重ねて見せ（lay）、409 は部屋の版と三方（took）。印を切れば送り待ちを依頼に作り直す（作れなければ切らない）。 */
  const writes = (x) => phase === "on" && reader && !!meta.token && !meta.trouble && (meta.write || []).includes(x)
    && !!(KN.replica && KN.replica.from().want);
  /** js/desk-inbox.js の edit から：前と後の items を一件ずつ。 */
  function write(b, a) {
    const m = (l) => new Map((l || []).map((x) => ["items\nid:" + x.id, canon(x)]));
    const was = m(b), now = m(a), es = [];
    for (const k of new Set([...was.keys(), ...now.keys()])) {
      const j = now.has(k) ? now.get(k) : null, bb = base.get(k);
      if (j === (was.has(k) ? was.get(k) : null)) continue;
      const e = out.get(k) || { k, shelf: "items", key: k.slice(6), op: newOp(), base: bb ? bb.ver : 0, from: bb && bb.json !== null ? canon(JSON.parse(bb.json)) : null, tried: false };
      Object.assign(e, { json: j, at: Date.now() });
      out.set(k, e); es.push(e);
    }
    run(["out"], "readwrite", (t) => es.forEach((e) => t.objectStore("out").put(e))).catch(() => {});
    if (KN.replica) KN.replica.redraw();
    soon(0);
  }
  function lay(s) {
    if (reader) out.forEach((e) => { if (e.shelf === "items") putRec(s, "items", e.key, e.json === null ? null : JSON.parse(e.json)); });
  }
  async function writeTo(list) {
    while (running) await new Promise((r) => setTimeout(r, 30));
    const next = (list || []).filter((x) => TAKE.has(x)), es = [...out.values()].filter((e) => !next.includes(e.shelf)), was = meta.write;
    const a = JSON.parse(JSON.stringify(store.get())), b = JSON.parse(JSON.stringify(a)), p = (x) => (x == null ? null : JSON.parse(x));
    es.forEach((e) => { putRec(a, "items", e.key, p(e.json)); putRec(b, "items", e.key, p(e.from)); });
    meta.write = next;
    if (es.length && canon(a.items) !== canon(b.items) && !(KN.deskInbox && KN.deskInbox.edit(b, a))) { meta.write = was; return false; }
    es.forEach((e) => out.delete(e.k));
    await run(["out", "meta"], "readwrite", (t) => { es.forEach((e) => t.objectStore("out").delete(e.k)); t.objectStore("meta").put({ k: "write", v: next }); });
    if (KN.replica) KN.replica.redraw();
    tell();
    return true;
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
    if (phase !== "on" || !meta.token || !(lockHeld || reader)) return;
    if (running) { again = true; return; }
    running = true;
    try {
      if (reader) await push();
      else if ((await keyOut(), await take()) && await compare()) {
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
    if (!window.indexedDB || !window.crypto || !crypto.subtle) { phase = "off"; return; }
    reader = store.replica();
    phase = "loading";
    try { await load(); phase = "on"; } catch (_) { phase = "off"; tell(); return; }
    if (!reader) begin();
    else if (out.size) soon(0);
    tell();
  }

  /* ---------------- 読む（段3。写しの端末だけ） ----------------
     照らすと同じ部品（鍵・名前のハッシュ・番号の続き）で、読んだ番号の続きだけを取り、base に置く
     （記録ではない。部屋から作り直せる写し）。比べない・送らない。並びは Dropbox の写し（ref）に合わせ、
     そこに無いものは届いた順。取れない・鍵が無い・作り直された（ahead）・部屋の約束が上なら state なし
     （js/replica.js が Dropbox の写しへ黙って戻る）。切られた（401）だけは歯車の点。 */
  let reader = false;
  const lockRead = (fn) => (navigator.locks && navigator.locks.request
    ? navigator.locks.request("kaimono-note-sync-read", fn) : fn());
  async function read(ref) {
    if (phase !== "on" || !reader || !meta.token || meta.trouble) return { why: "off" };
    return lockRead(async () => {
      await load();   // ほかの窓が進めた分
      if (meta.trouble) return { why: "off" };
      try { if (!(await ensureKey(false))) return { why: "key" }; } catch (_) { return { why: "key" }; }
      const items = [];
      let since = meta.seq || 0, room = "";
      for (let guard = 0; guard < 1000; guard++) {
        let r;
        try { r = await call("GET", `/pull?since=${since}&limit=1000`); } catch (_) { return { why: "far" }; }
        if (r.status === 401) { await putMeta({ trouble: "who" }); tell(); return { why: "who" }; }
        if (r.status === 409 && r.body.why === "ahead") { await forget(); return { why: "ahead" }; }
        if (r.status !== 200 || !Array.isArray(r.body.items)) return { why: "far" };
        if (r.body.schema > SCHEMA) return { why: "old" };
        room = r.body.room || "";
        if (meta.readRoom && room && room !== meta.readRoom) { await forget(); return { why: "ahead" }; }
        items.push(...r.body.items);
        since = Number.isInteger(r.body.next) ? r.body.next : since;
        if (!r.body.more) break;
      }
      const byHash = new Map();
      base.forEach((b) => { if (b.h) byHash.set(b.h, b); });
      const put = new Map();
      let n = meta.n || 0;
      for (const x of items) {
        const h = x.shelf + "." + x.item;
        const was = put.get(h) || byHash.get(h);
        if (x.del) { if (was) put.set(h, { ...was, ver: x.ver, json: null }); continue; }
        let o;
        try { o = await unseal(x.body, x.shelf, x.item); } catch (_) { return { why: "key" }; }
        if (!o || typeof o.s !== "string" || typeof o.i !== "string") return { why: "key" };
        put.set(h, { k: o.s + "\n" + o.i, ver: x.ver, json: JSON.stringify(o.d), h, n: was ? was.n : ++n });
      }
      if (put.size || since !== meta.seq || room !== meta.readRoom) {
        await run(["base", "meta"], "readwrite", (t) => {
          const s = t.objectStore("base");
          put.forEach((b) => { if (b.json === null) s.delete(b.k); else s.put(b); });
          const m = t.objectStore("meta");
          m.put({ k: "seq", v: since }); m.put({ k: "n", v: n }); m.put({ k: "readRoom", v: room }); m.put({ k: "readAt", v: Date.now() });
        });
        put.forEach((b) => { if (b.json === null) base.delete(b.k); else base.set(b.k, b); });
        Object.assign(meta, { seq: since, n, readRoom: room, readAt: Date.now() });
      }
      const live = [...base.values()].filter((b) => b.json !== null);
      if (!live.length) return { why: "empty" };
      tell();
      return { state: stateOf(live, ref), seq: since };
    });
  }
  /** 作り直された部屋：読んだ覚えを捨てる（次は頭から読む）。 */
  async function forget() {
    await run(["base", "meta"], "readwrite", (t) => {
      t.objectStore("base").clear();
      ["seq", "n", "readRoom", "readAt"].forEach((k) => t.objectStore("meta").delete(k));
    });
    base = new Map();
    ["seq", "n", "readRoom", "readAt"].forEach((k) => { delete meta[k]; });
  }
  /** 一件ずつを記録の形へ戻す（shelvesOf の逆）。並びは ref（Dropbox の写し）の中の位置、無ければ届いた順。 */
  function stateOf(recs, ref) {
    const rank = new Map();
    if (ref && typeof ref === "object") {
      let i = 0;
      const keep = unknown;
      shelvesOf(ref).forEach((m, shelf) => m.forEach((_, key) => rank.set(shelf + "\n" + key, i++)));
      unknown = keep;
    }
    const at = (b) => (rank.has(b.k) ? rank.get(b.k) : Infinity);
    const list = recs.slice().sort((a, b) => (at(a) - at(b)) || ((a.n || 0) - (b.n || 0)));
    const s = { schema: (store.get() && store.get().schema) || 2 };
    for (const b of list) {
      const [shelf, key] = splitK(b.k);
      const path = shelf.replace(/:\d{4}$/, "");
      const dot = path.indexOf(".");
      const box = dot < 0 ? s : (s[path.slice(0, dot)] = s[path.slice(0, dot)] || {});
      const f = dot < 0 ? path : path.slice(dot + 1);
      const v = JSON.parse(b.json);
      if (key === "_") box[f] = v;
      else if (key.startsWith("k:") && MAPS.has(path)) (box[f] = box[f] && !Array.isArray(box[f]) ? box[f] : {})[key.slice(2)] = v;
      else (box[f] = Array.isArray(box[f]) ? box[f] : []).push(v);
    }
    return s;
  }

  /* 開いているあいだは WebSocket で知らせを受ける（{"head":N} だけ）。読んだ番号より先なら fn。
     閉じたら、見えているときに間をあけてつなぎ直す（つないだら一度読む＝閉じていたあいだの分）。 */
  let ws = null, wsFn = null, wsTimer = 0, wsTries = 0;
  function watch(fn) {
    wsFn = fn;
    if (!fn) { clearTimeout(wsTimer); if (ws) { const w = ws; ws = null; try { w.close(); } catch (_) { /* もう閉じている */ } } return; }
    connect();
  }
  function connect() {
    clearTimeout(wsTimer);
    if (ws || !wsFn || !reader || !meta.token || !meta.url || meta.trouble || typeof WebSocket !== "function") return;
    if (document.visibilityState === "hidden") return;
    let w;
    try { w = new WebSocket(meta.url.replace(/^http/, "ws") + "/ws", ["kn-sync", meta.token]); } catch (_) { return; }
    ws = w;
    w.onopen = () => { wsTries = 0; if (wsFn) wsFn(); };
    w.onmessage = (e) => {
      let m = null;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m && Number.isInteger(m.head) && m.head > (meta.seq || 0) && wsFn) wsFn();
    };
    w.onclose = () => {
      if (ws !== w) return;
      ws = null;
      if (wsFn) wsTimer = setTimeout(connect, Math.min(5000 * 2 ** Math.min(wsTries++, 6), 10 * 60000));
    };
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") connect(); });
  window.addEventListener("online", () => { wsTries = 0; connect(); });

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
    if (!reader) await ensureKey();
    else { try { await ensureKey(false); } catch (_) { /* 鍵はあとで（読むときに Dropbox から） */ } }
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
    if (reader) { tell(); return true; }
    begin();
    soon(0);
    tell();
    return true;
  }
  /** 二台めをつなぐ合言葉（/pair。10字・10分・一回だけ）。つないである端末で。 */
  async function pair() {
    if (phase !== "on" || !meta.token) throw new Error("先にこの端末をつないでください");
    let r;
    try { r = await call("POST", "/pair"); } catch (_) { throw new Error("部屋に届きませんでした"); }
    if (r.status !== 200 || !r.body.code) throw new Error("合言葉を出せませんでした");
    return r.body.code;
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
    watch(null);
    if (meta.token) { try { await call("DELETE", `/devices/${encodeURIComponent(meta.device || "")}`); } catch (_) { /* 部屋に届かなくても、こちらは忘れる */ } }
    await run(["meta", "base", "out"], "readwrite", (t) => {
      ["url", "token", "device", "room", "joinedAt", "firstDone", "sentAt", "failSince", "checkDay", "checks", "trouble", "redo",
        "seq", "n", "readRoom", "readAt", "take", "takeSeq", "held", "write"]
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
      phase, reader, joined: !!meta.token, seq: meta.seq || 0, lock: lockHeld, ask, trouble: trouble(), out: out.size, bad: [...out.values()].filter((e) => e.bad).length,
      live, sentAt: meta.sentAt || 0, checks: (meta.checks || []).slice(), keyOut: !!meta.keyOut, firstDone: !!meta.firstDone,
      redo: meta.redo || 0, take: [...takes()], held: (meta.held || []).length, write: (meta.write || []).slice(),
    };
  }
  function tell() { listeners.forEach((fn) => { try { fn(); } catch (_) { /* 聞き手の失敗は回すほうへ持ちこまない */ } }); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  KN.sync = {
    start, status, trouble, onChange, setupCode, join, go, leave, pair, read, watch, takeFrom, writes, write, lay, writeTo, SCHEMA,
    /* 試験と門のため（棚の分け方・送らない欄・知らない欄）。 */
    shelvesOf, merge3, unknown: () => unknown.slice(), SEND, LOCAL, now: async () => {
      clearTimeout(timer);
      while (running) await new Promise((r) => setTimeout(r, 30));
      return round();
    },
  };
})();
