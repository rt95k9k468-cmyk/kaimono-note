/* =========================================================
   くらしノート — ノートの画像（IndexedDB `kaimono-note-images`、段5）

   設計と壊れないことの確かめは docs/image-design.md。

   - **ノートの入れ物とは別の入れ物。** 版は 1 の決め打ち（idb.js は使わない）。
     棚は `img {keyPath:"id"}` と `meta {keyPath:"k"}`（`sent`・`orphan`）。
     ここが壊れても、落ちても、ノートの本文・記録・控えは道連れにしない。
   - 本文が持つのは参照の一行 `![](img:<id>)` だけ。id は縮めたあとの中身の
     SHA-256 の頭16字（同じ画像は同じ id・一件）。
   - 画像を先に書き、書けたと分かってから参照を入れる（screen-notes.js）。
   - 参照が無くなった画像は印を付け、さらに30日出てこなければ消す（sweep）。
     数えられない日・疑わしい日は掃除をしない。
   - 一覧・起動時に画像は読まない。読むのは開いたノートが参照するものだけ。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const DB = "kaimono-note-images";
  const OPEN_WAIT = 8000;                 // これだけ待って開かなければ off
  const SIDE = 1600;                      // 縮める長辺（px）
  const QUALITY = 0.8;                    // JPEG
  const KEEP_ORPHAN = 30 * 864e5;         // 参照が無くなってから消すまで
  const SWEEP_WAIT = 4000;                // 開いてから掃除まで（backup.js の点検が済むのを待つ）
  const REF = /^!\[\]\(img:([0-9a-f]{16})\)$/;
  const REFS = /^!\[\]\(img:([0-9a-f]{16})\)$/gm;

  /* idle → loading → on / off。 */
  let phase = "idle";
  let db = null;
  let readyP = null;
  let sweptP = null;
  const looks = new Map();                // id → { url, w, h }（読んだもの）
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* 一つ落ちても続けます */ } });

  function openDb() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("img")) d.createObjectStore("img", { keyPath: "id" });
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "k" });
      };
      req.onsuccess = () => {
        const d = req.result;
        d.onversionchange = () => { try { d.close(); } catch (_) { /* もう閉じている */ } if (db === d) db = null; };
        d.onclose = () => { if (db === d) db = null; };
        resolve(d);
      };
      req.onerror = () => reject(req.error || new Error("開けませんでした"));
      req.onblocked = () => reject(new Error("開けませんでした（ほかの窓が使っています）"));
    });
  }

  function conn() {
    if (db) return Promise.resolve(db);
    return openDb().then((d) => { db = d; return d; });
  }

  /** 一つの取引。fn は取引を受けて、終わったあとに答えを返す関数を返してよい。
      つなぎが裏で切れていた（iOS が閉じた）なら、開き直して一度だけ。 */
  function run(stores, mode, fn, retried) {
    return conn().then((d) => new Promise((resolve, reject) => {
      let t;
      try { t = d.transaction(stores, mode); } catch (err) {
        if (db === d) db = null;
        if (retried) reject(err);
        else run(stores, mode, fn, true).then(resolve, reject);
        return;
      }
      const out = fn(t);
      t.oncomplete = () => resolve(typeof out === "function" ? out() : out);
      t.onerror = t.onabort = () => reject(t.error || new Error("書けませんでした"));
    }));
  }

  function start() {
    if (phase !== "idle") return readyP;
    phase = "loading";
    if (typeof indexedDB === "undefined" || !indexedDB) {
      phase = "off";
      readyP = Promise.resolve();
      return readyP;
    }
    readyP = new Promise((settle) => {
      const wait = setTimeout(() => {
        if (phase !== "loading") return;
        phase = "off";
        settle();
        emit();
      }, OPEN_WAIT);
      conn().then(() => { phase = "on"; }, () => { phase = "off"; }).finally(() => {
        clearTimeout(wait);
        settle();
        emit();
      });
    });
    return readyP;
  }

  /* ---------------- 参照 ---------------- */

  /** 参照の一行なら id（行頭から `![](img:<16字>)`、ほかの字なし）。 */
  const refOf = (line) => { const m = REF.exec(String(line || "")); return m ? m[1] : null; };
  /** 本文の中の参照の id（出てきた順・重なりあり）。 */
  const idsIn = (body) => [...String(body || "").matchAll(REFS)].map((m) => m[1]);
  const refLine = (id) => `![](img:${id})`;

  /* ---------------- 縮める ---------------- */

  /** 写真を読んで、絵の元（drawImage に渡せるもの）と大きさ。向きは端末が直す。 */
  async function decode(file) {
    if (window.createImageBitmap) {
      try {
        const bm = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { src: bm, w: bm.width, h: bm.height, done: () => { try { bm.close(); } catch (_) { /* 閉じてある */ } } };
      } catch (_) { /* 下の Image で */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((resolve, reject) => {
        const x = new Image();
        x.onload = () => resolve(x);
        x.onerror = () => reject(new Error("画像を開けませんでした"));
        x.src = url;
      });
      return { src: im, w: im.naturalWidth, h: im.naturalHeight, done: () => URL.revokeObjectURL(url) };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  const bytesOf = (blob) => (blob.arrayBuffer ? blob.arrayBuffer() : new Response(blob).arrayBuffer());

  /** 長辺 SIDE・JPEG QUALITY に縮めた中身（ArrayBuffer）と大きさ。 */
  async function shrink(file) {
    const pic = await decode(file);
    try {
      if (!pic.w || !pic.h) throw new Error("画像を開けませんでした");
      const k = Math.min(1, SIDE / Math.max(pic.w, pic.h));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(pic.w * k));
      cv.height = Math.max(1, Math.round(pic.h * k));
      const g = cv.getContext("2d");
      /* 透ける画像（PNG）は白の上に（JPEG は透けを持てず、黒になる）。 */
      g.fillStyle = "#fff";
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(pic.src, 0, 0, cv.width, cv.height);
      const blob = await new Promise((resolve) => cv.toBlob(resolve, "image/jpeg", QUALITY));
      if (!blob) throw new Error("画像を縮められませんでした");
      return { bytes: await bytesOf(blob), w: cv.width, h: cv.height };
    } finally {
      pic.done();
    }
  }

  /** 中身の SHA-256 の頭16字。 */
  async function idOf(bytes) {
    const d = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** 読み戻した中身の大きさ（Dropbox から戻すとき）。 */
  async function sizeOf(bytes) {
    try {
      const pic = await decode(new Blob([bytes], { type: "image/jpeg" }));
      pic.done();
      return { w: pic.w, h: pic.h };
    } catch (_) {
      return { w: 0, h: 0 };
    }
  }

  /* ---------------- 容量の見張り ---------------- */

  /** 自動の控えの上限（backup.js）。同じ枠を控え・写しが分け合う。 */
  function budget() {
    const B = KN.backup;
    if (!B || !B.budgetIdb) return 0;
    try { return B.budgetIdb(B.list().filter((h) => !h.ls)); } catch (_) { return B.BUDGET_IDB_MAX || 0; }
  }

  /** 書く前に残りの枠を見ます。「画像＋控えの上限の2倍」より少なければ書かない。
      estimate の無い端末は、書いて落ちたら断る（呼ぶ側）。 */
  async function roomFor(n) {
    const st = navigator.storage;
    if (!st || !st.estimate) return true;
    let e = null;
    try { e = await st.estimate(); } catch (_) { return true; }
    if (!e || !isFinite(e.quota) || !isFinite(e.usage)) return true;
    return e.quota - e.usage >= n + 2 * budget();
  }

  /* ---------------- 書く・読む ---------------- */

  function get(id) {
    return run(["img"], "readonly", (t) => {
      const r = t.objectStore("img").get(id);
      return () => r.result || null;
    });
  }

  function put(rec) {
    return run(["img", "meta"], "readwrite", (t) => {
      t.objectStore("img").put(rec);
      dropMark(t, rec.id);
    });
  }

  /** 参照の印（orphan）から外します（同じ取引の中で）。 */
  function dropMark(t, id) {
    const meta = t.objectStore("meta");
    const r = meta.get("orphan");
    r.onsuccess = () => {
      const at = (r.result && r.result.at) || null;
      if (!at || !(id in at)) return;
      delete at[id];
      meta.put({ k: "orphan", at });
    };
  }

  const fail = () => Object.assign(new Error("画像を保存できませんでした"), { code: "img" });

  /** 写真を縮めて書き、id を返します。書けなければ断る（参照は呼ぶ側が入れない）。 */
  async function add(file) {
    await start();
    if (phase !== "on") throw fail();
    const pic = await shrink(file);
    const id = await idOf(pic.bytes);
    /* 同じ画像はもう在る（二度貼った・掃除の印が付いていた）。 */
    const had = await get(id).catch(() => null);
    if (had) {
      await run(["meta"], "readwrite", (t) => dropMark(t, id)).catch(() => {});
      return id;
    }
    if (!(await roomFor(pic.bytes.byteLength))) throw fail();
    try {
      await put({ id, type: "image/jpeg", w: pic.w, h: pic.h, at: new Date().toISOString(), bytes: pic.bytes });
    } catch (_) {
      throw fail();
    }
    return id;
  }

  /** 見せる口（object URL と大きさ）。無い・読めないなら null。 */
  function look(id) {
    if (looks.has(id)) return Promise.resolve(looks.get(id));
    return start().then(() => (phase === "on" ? get(id) : null)).then((r) => {
      if (!r || !r.bytes) return null;
      const v = { url: URL.createObjectURL(new Blob([r.bytes], { type: r.type || "image/jpeg" })), w: r.w, h: r.h };
      looks.set(id, v);
      return v;
    }).catch(() => null);
  }
  /** 読んだことのあるもの（その場で）。 */
  const known = (id) => looks.get(id) || null;

  /** 書き出し（zip）に詰める中身。id → { bytes: Uint8Array, at }。無いものは入れない。 */
  async function readMany(ids) {
    const out = new Map();
    await start();
    if (phase !== "on") return out;
    const want = [...new Set(ids)];
    if (!want.length) return out;
    await run(["img"], "readonly", (t) => {
      const st = t.objectStore("img");
      want.forEach((id) => {
        const r = st.get(id);
        r.onsuccess = () => { if (r.result && r.result.bytes) out.set(id, { bytes: new Uint8Array(r.result.bytes), at: r.result.at }); };
      });
    });
    return out;
  }

  /* ---------------- 掃除（開いたとき一度） ---------------- */

  /** 参照を数え、どこにも出てこない画像に印、印から30日たったら消す。また出てきたら印を外す。
      数えられない日・疑わしい日は何もしない（返すのは "skip"）。 */
  async function sweep() {
    await start();
    const N = KN.notes;
    const B = KN.backup;
    if (phase !== "on" || !N) return "skip";
    await N.ready();
    if (N.state() !== "on") return "skip";
    if (B) {
      if (B.checked) await B.checked().catch(() => {});
      if ((B.lost && B.lost()) || (B.doubt && B.doubt())) return "skip";
    }
    const notes = N.list().concat(N.trash());
    if (!notes.length) return "skip";
    let vers;
    try { vers = await N.versionBodies(); } catch (_) { return "skip"; }
    const used = new Set();
    notes.forEach((n) => idsIn(n.body).forEach((id) => used.add(id)));
    vers.forEach((b) => idsIn(b).forEach((id) => used.add(id)));
    const now = Date.now();
    const gone = [];
    await run(["img", "meta"], "readwrite", (t) => {
      const img = t.objectStore("img");
      const meta = t.objectStore("meta");
      const keys = img.getAllKeys();
      const om = meta.get("orphan");
      om.onsuccess = () => {
        const was = (om.result && om.result.at) || {};
        const at = {};
        (keys.result || []).forEach((id) => {
          if (used.has(id)) return;
          const t0 = Number(was[id]);
          if (!t0) at[id] = now;
          else if (now - t0 > KEEP_ORPHAN) { img.delete(id); gone.push(id); }
          else at[id] = t0;
        });
        meta.put({ k: "orphan", at });
      };
    });
    gone.forEach((id) => {
      const v = looks.get(id);
      if (v) { URL.revokeObjectURL(v.url); looks.delete(id); }
    });
    return { gone: gone.length };
  }

  /* ---------------- Dropbox（送る列・戻す） ---------------- */

  /** まだ Dropbox へ送れていない画像の id。 */
  async function unsent() {
    await start();
    if (phase !== "on") return [];
    const [keys, sent] = await run(["img", "meta"], "readonly", (t) => {
      const a = t.objectStore("img").getAllKeys();
      const b = t.objectStore("meta").get("sent");
      return () => [a.result || [], (b.result && b.result.ids) || []];
    });
    const s = new Set(sent);
    return keys.filter((k) => !s.has(k));
  }

  /** 送れた（同じ名前がもう在った）。 */
  function markSent(id) {
    return run(["meta"], "readwrite", (t) => {
      const meta = t.objectStore("meta");
      const r = meta.get("sent");
      r.onsuccess = () => {
        const ids = (r.result && r.result.ids) || [];
        if (!ids.includes(id)) meta.put({ k: "sent", ids: ids.concat(id) });
      };
    });
  }

  /** Dropbox の控えから戻したあと（settings-backup.js）。ノートが参照していて手元に無い画像だけ
      `images/<id>.jpg` を読み、中身の SHA-256 が名前と合うものだけ書きます。書けた数。 */
  async function pullMissing() {
    await start();
    const N = KN.notes;
    if (phase !== "on" || !N || N.state() !== "on" || !KN.dropbox) return 0;
    const want = new Set();
    N.list().concat(N.trash()).forEach((n) => idsIn(n.body).forEach((id) => want.add(id)));
    let n = 0;
    for (const id of want) {
      if (await get(id).catch(() => null)) continue;
      let buf = null;
      try { buf = await KN.dropbox.download(`/images/${id}.jpg`); } catch (_) { continue; }
      if (!buf || (await idOf(buf)) !== id) continue;
      if (!(await roomFor(buf.byteLength))) break;
      const { w, h } = await sizeOf(buf);
      try {
        await put({ id, type: "image/jpeg", w, h, at: new Date().toISOString(), bytes: buf });
        await markSent(id);
        n++;
      } catch (_) { /* 次の画像へ */ }
    }
    if (n) emit();
    return n;
  }

  KN.noteImg = {
    ready: () => start(),
    state: () => phase,
    refOf, idsIn, refLine, shrink, idOf, add, get, look, known, readMany,
    sweep, swept: () => sweptP, unsent, markSent, pullMissing,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  /* 起動時に開くのは入れ物だけ（画像は読まない）。掃除は開いたとき一度、点検（backup.js の
     doubt）が済むのを待ってから。 */
  start().then(() => {
    if (phase !== "on") return;
    setTimeout(() => { sweptP = sweep().catch(() => "skip"); }, SWEEP_WAIT);
  });
})();
