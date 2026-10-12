/* =========================================================
   くらしノート — ノートのファイル（PDF。IndexedDB `kaimono-note-files`）

   設計は docs/notes-unify.md「置き場」の `files/` と「files/ で決めたこと」。

   - **画像の入れ物（note-img.js）ともノートの入れ物とも別。** 版は 1 の決め打ち。
     棚は `file {keyPath:"id"}` と `meta {keyPath:"k"}`（`sent`・`orphan`）。
     ここが壊れても、ノートの本文・記録・控えは道連れにしない。
   - id は `<中身の SHA-256 の64字>.<拡張子>`＝Dropbox の `files/<id>`。名前＝中身なので
     上書きしない（送るのは add だけ）。原本のまま持つ（縮めない）。
   - 本文が持つのは参照の一行 `[名前](file:<id>)` だけ。名前は見せるためだけ。
   - ファイルを先に書き、書けたと分かってから参照を入れる（screen-notes.js）。
   - 手元に無いファイル（ほかの端末が貼った）は、開いたノートが参照したとき Dropbox から取る。
   - 参照が無くなったファイルは印を付け、さらに30日出てこなければ消す（sweep）。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const DB = "kaimono-note-files";
  const OPEN_WAIT = 8000;                 // これだけ待って開かなければ off
  const MAX = 50 * 1024 * 1024;           // 一つの大きさの上限（iPhone の記憶に一度に載せる）
  const KEEP_ORPHAN = 30 * 864e5;         // 参照が無くなってから消すまで
  const SWEEP_WAIT = 4500;                // 開いてから掃除まで（backup.js の点検が済むのを待つ）
  const ID = /^[0-9a-f]{64}\.[a-z0-9]{1,8}$/;
  const REF = /^\[([^\[\]\n]*)\]\(file:([0-9a-f]{64}\.[a-z0-9]{1,8})\)$/;
  const REFS = /^\[[^\[\]\n]*\]\(file:([0-9a-f]{64}\.[a-z0-9]{1,8})\)$/gm;
  const TYPES = { pdf: "application/pdf" };

  /* idle → loading → on / off。 */
  let phase = "idle";
  let db = null;
  let readyP = null;
  let sweptP = null;
  const looks = new Map();                // id → object URL（読んだもの）
  const pulls = new Map();                // id → 取っている途中の Promise
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* 一つ落ちても続けます */ } });

  function openDb() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("file")) d.createObjectStore("file", { keyPath: "id" });
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

  /** 一つの取引（note-img.js と同じ）。つなぎが裏で切れていたら、開き直して一度だけ。 */
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

  /** 参照の一行なら { id, name }（行頭から `[名前](file:<id>)`、ほかの字なし）。 */
  const refOf = (line) => { const m = REF.exec(String(line || "")); return m ? { id: m[2], name: m[1] } : null; };
  /** 本文の中の参照の id（出てきた順・重なりあり）。 */
  const idsIn = (body) => [...String(body || "").matchAll(REFS)].map((m) => m[1]);
  /** 名前は角かっこ・改行を抜き、80字まで（無ければ拡張子の大文字）。 */
  const nameOf = (name, id) => String(name || "").normalize("NFC").replace(/[\[\]\n\r]/g, " ").trim().slice(0, 80)
    || String(id || "").split(".").pop().toUpperCase();
  const refLine = (id, name) => `[${nameOf(name, id)}](file:${id})`;
  const typeOf = (id) => TYPES[String(id).split(".").pop()] || "application/octet-stream";

  /** 貼れるファイルか（いまは PDF だけ。画像は note-img.js が縮めて持つ）。 */
  const takes = (f) => !!f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name || ""));

  const bytesOf = (blob) => (blob.arrayBuffer ? blob.arrayBuffer() : new Response(blob).arrayBuffer());

  async function hex(bytes) {
    const d = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------------- 容量の見張り（note-img.js と同じ枠） ---------------- */

  function budget() {
    const B = KN.backup;
    if (!B || !B.budgetIdb) return 0;
    try { return B.budgetIdb(B.list().filter((h) => !h.ls)); } catch (_) { return B.BUDGET_IDB_MAX || 0; }
  }

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
    return run(["file"], "readonly", (t) => {
      const r = t.objectStore("file").get(id);
      return () => r.result || null;
    });
  }

  function put(rec) {
    return run(["file", "meta"], "readwrite", (t) => {
      t.objectStore("file").put(rec);
      dropMark(t, rec.id);
    });
  }

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

  const fail = () => Object.assign(new Error("ファイルを保存できませんでした"), { code: "file" });

  /** ファイルをそのまま書き、{ id, name } を返します。書けなければ断る（参照は呼ぶ側が入れない）。 */
  async function add(file) {
    await start();
    if (phase !== "on" || !takes(file) || !(file.size <= MAX)) throw fail();
    const bytes = await bytesOf(file);
    const id = `${await hex(bytes)}.pdf`;
    const name = nameOf(file.name, id);
    const had = await get(id).catch(() => null);
    if (had) {
      await run(["meta"], "readwrite", (t) => dropMark(t, id)).catch(() => {});
      return { id, name };
    }
    if (!(await roomFor(bytes.byteLength))) throw fail();
    try {
      await put({ id, type: typeOf(id), name, size: bytes.byteLength, at: new Date().toISOString(), bytes });
    } catch (_) {
      throw fail();
    }
    return { id, name };
  }

  /** 開く口（object URL）。手元に無い・読めないなら null。 */
  function look(id) {
    if (looks.has(id)) return Promise.resolve(looks.get(id));
    return start().then(() => (phase === "on" ? get(id) : null)).then((r) => {
      if (!r || !r.bytes) return null;
      const url = URL.createObjectURL(new Blob([r.bytes], { type: r.type || typeOf(id) }));
      looks.set(id, url);
      return url;
    }).catch(() => null);
  }
  const known = (id) => looks.get(id) || null;

  /** 手元に無いファイルを Dropbox の `files/<id>` から取ります。中身の SHA-256 が名前と合うものだけ
      書く。取れた → true。つながっていない・無い・合わない → false。同じ id は一本に。 */
  function pull(id, name) {
    if (!ID.test(String(id))) return Promise.resolve(false);
    if (pulls.has(id)) return pulls.get(id);
    const p = (async () => {
      await start();
      const D = KN.dropbox;
      if (phase !== "on" || !D || !D.status().connected) return false;
      if (await get(id).catch(() => null)) return true;
      let buf = null;
      try { buf = await D.download(`/files/${id}`); } catch (_) { return false; }
      if (!buf || `${await hex(buf)}.${id.split(".").pop()}` !== id) return false;
      if (!(await roomFor(buf.byteLength))) return false;
      try {
        await put({ id, type: typeOf(id), name: nameOf(name, id), size: buf.byteLength, at: new Date().toISOString(), bytes: buf });
        await markSent(id);
      } catch (_) { return false; }
      emit();
      return true;
    })().finally(() => pulls.delete(id));
    pulls.set(id, p);
    return p;
  }

  /** 書き出し（zip）に詰める中身。id → { bytes: Uint8Array, at }。無いものは入れない。 */
  async function readMany(ids) {
    const out = new Map();
    await start();
    if (phase !== "on") return out;
    const want = [...new Set(ids)];
    if (!want.length) return out;
    await run(["file"], "readonly", (t) => {
      const st = t.objectStore("file");
      want.forEach((id) => {
        const r = st.get(id);
        r.onsuccess = () => { if (r.result && r.result.bytes) out.set(id, { bytes: new Uint8Array(r.result.bytes), at: r.result.at }); };
      });
    });
    return out;
  }

  /* ---------------- 掃除（開いたとき一度。note-img.js と同じ門） ---------------- */

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
    await run(["file", "meta"], "readwrite", (t) => {
      const st = t.objectStore("file");
      const meta = t.objectStore("meta");
      const keys = st.getAllKeys();
      const om = meta.get("orphan");
      om.onsuccess = () => {
        const was = (om.result && om.result.at) || {};
        const at = {};
        (keys.result || []).forEach((id) => {
          if (used.has(id)) return;
          const t0 = Number(was[id]);
          if (!t0) at[id] = now;
          else if (now - t0 > KEEP_ORPHAN) { st.delete(id); gone.push(id); }
          else at[id] = t0;
        });
        meta.put({ k: "orphan", at });
      };
    });
    gone.forEach((id) => {
      const url = looks.get(id);
      if (url) { URL.revokeObjectURL(url); looks.delete(id); }
    });
    return { gone: gone.length };
  }

  /* ---------------- Dropbox（送る列） ---------------- */

  async function unsent() {
    await start();
    if (phase !== "on") return [];
    const [keys, sent] = await run(["file", "meta"], "readonly", (t) => {
      const a = t.objectStore("file").getAllKeys();
      const b = t.objectStore("meta").get("sent");
      return () => [a.result || [], (b.result && b.result.ids) || []];
    });
    const s = new Set(sent);
    return keys.filter((k) => !s.has(k));
  }

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

  KN.noteFile = {
    ready: () => start(),
    state: () => phase,
    DIR: "/files",
    refOf, idsIn, refLine, takes, add, get, look, known, pull, readMany,
    sweep, swept: () => sweptP, unsent, markSent,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  start().then(() => {
    if (phase !== "on") return;
    setTimeout(() => { sweptP = sweep().catch(() => "skip"); }, SWEEP_WAIT);
  });
})();
