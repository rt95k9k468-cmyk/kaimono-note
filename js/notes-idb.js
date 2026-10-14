/* =========================================================
   くらしノート — ノートの入れ物（IndexedDB `kaimono-note-notes`）

   決めごとは docs/notes.md。ここは「書けて、残る」（段1）の土台です。

   - **日記の入った `kaimono-note` とは別の入れ物。** 版は 1 の決め打ち。
     棚は `notes {keyPath:"id"}` と `meta {keyPath:"k"}`。idb.js・diary-idb.js・
     backup.js には触れません（あちらの版も上げない）。
   - 開いたら全件を記憶に読み、一覧・検索は記憶の上でします（`KN.notes`）。
   - 書くのは打ち終わりの少しあと、直したノートだけ。隠れるとき（pagehide /
     visibilitychange）にも書き切ります。記憶は打つたびに直します。
   - **記録（store）にも localStorage にも書きません。** 本文は大きくなるので、
     localStorage に流れ込むと容量からあふれて、全部の保存が止まります。
   - 開けない日は「off」。localStorage へは退きません——ノートの面に一言出して、
     書かせません。
   - 段2：前の版（meta の `ver:<id>`）と、復元で合わせる（`merge`）。
   - 段3：ノートブックとタグ（`setLabels`）。欄は段1から一件ずつにあるので、
     入れ物の版も形も変えていません。
   - 同期（notes-unify.md 段2。js/notes-sync.js）：覚えた版は meta の `sync:*`。外から来た中身
     （`absorb`）は、その覚えと**同じ取引で**書き、送り返しの合図を出しません。
     色は meta の `labels`（はじめて開いたとき `settings.noteColors` から写す。元は残す）。
   - 並び（notes-unify.md「並び」）：兄弟の順はノートの `pos`（無ければ作った日時）。ノートブックの順と
     空のノートブックは meta の `books`。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const U = KN.util;

  const DB = "kaimono-note-notes";
  const SOON = 600;                       // 打ち終わりから書くまで（ms）
  const OPEN_WAIT = 8000;                 // これだけ待って開かなければ off
  const KEEP_DELETED = 30 * 864e5;        // 最近削除した項目に置いておく長さ
  const KEEP_VERS = 30;                   // 一つのノートに残す前の版の数

  /* idle → loading → on / off。off から遅れて開けたら on へ。 */
  let phase = "idle";
  let db = null;
  const byId = new Map();
  const dirty = new Set();
  /* 前の版（段2）。棚は meta の `ver:<id>`（版1の入れ物のまま。棚を足さない）。
     書く前の版は、ノートと**同じ取引で**書きます——直した中身だけが残って、
     前の中身がどこにも無い、という瞬間を作らないため。 */
  const pendVer = new Map();              // id → まだ書いていない前の版
  const verCache = new Map();             // id → 読んだ版の並び（新しい順）
  const kept = new Set();                 // この書く回で、もう前の版を取ったノート
  let timer = null;
  let readyP = null;
  let settle = null;
  let failAt = 0;
  const listeners = new Set();
  const pendMeta = new Map();             // k → まだ書いていない meta（null は消す）
  const quiet = new Set();                // 外から来た中身（書いても同期へ合図しない）
  const opened = new Set();               // いま紙で開いているノート（同期は閉じてから合わせる）
  let labels = null;                      // { nb: {名前: 色}, tag: {名前: 色} }
  let quietLab = false;
  let books = null;                       // 並べた・作ったノートブックの名前（順に。meta の `books`）
  let holding = false;                    // 木の行を運んでいるあいだ、知らせは運び終えてから一度（js/note-drag.js）
  let owed = false;

  const emit = () => {
    if (holding) { owed = true; return; }
    listeners.forEach((fn) => { try { fn(); } catch (_) { /* 一つ落ちても続けます */ } });
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB, 1); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("notes")) d.createObjectStore("notes", { keyPath: "id" });
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "k" });
      };
      req.onsuccess = () => {
        const d = req.result;
        /* 別の版で開こうとする者が来たら、こちらが退きます（次に書くときに
           開き直します）。iOS が裏で閉じたときも同じ。 */
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

  const BASE = { id: 1, title: 1, body: 1, notebook: 1, tags: 1, fav: 1, createdAt: 1, updatedAt: 1, deletedAt: 1 };

  /** 読み込んだ一件を、いまの形にそろえます（足りない欄は既定値。知らない欄は
      そのまま持つ——あとの段で足した欄を、前の版が消さないように）。 */
  function shape(n) {
    return {
      id: String(n.id),
      title: typeof n.title === "string" ? n.title : "",
      body: typeof n.body === "string" ? n.body : "",
      notebook: typeof n.notebook === "string" ? n.notebook : "",
      tags: Array.isArray(n.tags) ? n.tags.slice() : [],
      fav: !!n.fav,
      createdAt: n.createdAt || n.updatedAt || U.today(),
      updatedAt: n.updatedAt || n.createdAt || U.today(),
      deletedAt: n.deletedAt || null,
      ...Object.fromEntries(Object.entries(n).filter(([k]) => !(k in BASE))),
    };
  }

  function readAll() {
    return conn().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(["notes", "meta"], "readonly");
      const req = t.objectStore("notes").getAll();
      const lab = t.objectStore("meta").get("labels");
      const bk = t.objectStore("meta").get("books");
      t.oncomplete = () => resolve({ rows: req.result || [], labels: lab.result || null, books: bk.result || null });
      t.onerror = t.onabort = () => reject(t.error || new Error("読めませんでした"));
    }));
  }

  const mapOf = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const colorsIn = (v) => ({ nb: { ...mapOf(mapOf(v).nb) }, tag: { ...mapOf(mapOf(v).tag) } });

  function start() {
    if (phase !== "idle") return readyP;
    phase = "loading";
    readyP = new Promise((r) => { settle = r; });
    if (typeof indexedDB === "undefined" || !indexedDB) {
      phase = "off";
      settle();
      return readyP;
    }
    /* 開くのが止まったまま（iOS でまれに）なら、待ち切りで off にします。
       遅れて開けたら、そのとき on へ。 */
    const wait = setTimeout(() => {
      if (phase !== "loading") return;
      phase = "off";
      settle();
      emit();
    }, OPEN_WAIT);
    readAll().then(({ rows, labels: lab, books: bk }) => {
      byId.clear();
      rows.forEach((n) => { if (n && n.id) byId.set(String(n.id), shape(n)); });
      books = cleanBooks(bk && bk.list);
      phase = "on";
      /* 色は入れ物へ写す（はじめて開いたときだけ。記録の settings.noteColors は消さない）。 */
      if (lab) labels = colorsIn(lab);
      else {
        labels = colorsIn(KN.store && (KN.store.get().settings || {}).noteColors);
        pendMeta.set("labels", { k: "labels", ...labels });
        dirty.add("");
      }
      purge();
    }).catch(() => {
      phase = "off";
    }).finally(() => {
      clearTimeout(wait);
      settle();
      emit();
    });
    return readyP;
  }

  /** 最近削除した項目のうち、30日を過ぎたものを本当に消します（開いたとき）。 */
  function purge(hold) {
    const now = Date.now();
    byId.forEach((n, id) => {
      if (!n.deletedAt) return;
      const at = Date.parse(n.deletedAt);
      if (isFinite(at) && now - at > KEEP_DELETED) { byId.delete(id); dirty.add(id); }
    });
    if (dirty.size && !hold) writeNow();
  }

  /* ---------------- 書く ---------------- */

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(writeNow, SOON);
  }

  function failed() {
    emit();
    /* 黙って保存し、失敗したときだけ一言。続けて落ちても一度だけ言います。 */
    if (Date.now() - failAt > 10000 && KN.ui && KN.ui.toast) KN.ui.toast("ノートを保存できませんでした");
    failAt = Date.now();
  }

  /** 直したノートだけを、いま書きます。 */
  function writeNow(retried) {
    clearTimeout(timer);
    timer = null;
    if (!(dirty.size || pendMeta.size) || phase !== "on") return Promise.resolve();
    const ids = [...dirty].filter(Boolean);
    dirty.clear();
    const metas = new Map(pendMeta);
    pendMeta.clear();
    const loud = ids.some((id) => !quiet.has(id)) || ((metas.has("labels") || metas.has("books")) && !quietLab);
    quietLab = false;
    ids.forEach((id) => quiet.delete(id));
    const vers = new Map();
    ids.forEach((id) => { if (pendVer.has(id)) { vers.set(id, pendVer.get(id)); pendVer.delete(id); } });
    const wrote = new Map();
    return conn().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(["notes", "meta"], "readwrite");
      const st = t.objectStore("notes");
      const meta = t.objectStore("meta");
      ids.forEach((id) => {
        const n = byId.get(id);
        if (n) st.put(n); else { st.delete(id); meta.delete(`ver:${id}`); }
      });
      metas.forEach((rec, k) => { if (rec) meta.put(rec); else meta.delete(k); });
      vers.forEach((add, id) => {
        if (!byId.has(id)) return;
        const req = meta.get(`ver:${id}`);
        req.onsuccess = () => {
          const list = mergeVers(add, (req.result && req.result.list) || []);
          meta.put({ k: `ver:${id}`, list });
          wrote.set(id, list);
        };
      });
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () => reject(t.error || new Error("書けませんでした"));
    })).then(() => {
      wrote.forEach((list, id) => verCache.set(id, list));
      ids.forEach((id) => { if (!byId.has(id)) verCache.delete(id); });
      if (KN.dropbox && KN.dropbox.soon) KN.dropbox.soon();
      if (loud && KN.notesSync) KN.notesSync.soon();
    }, (err) => {
      ids.forEach((id) => dirty.add(id));
      metas.forEach((rec, k) => { if (!pendMeta.has(k)) pendMeta.set(k, rec); });
      vers.forEach((add, id) => pendVer.set(id, add.concat(pendVer.get(id) || [])));
      /* つなぎが裏で切れていた（iOS が閉じた）なら、開き直して一度だけ。 */
      if (!retried) {
        if (db) { try { db.close(); } catch (_) { /* もう閉じている */ } }
        db = null;
        return writeNow(true);
      }
      failed(err);
      return undefined;
    });
  }

  const touch = (id) => { quiet.delete(id); dirty.add(id); schedule(); };

  /* ---------------- 前の版 ---------------- */

  const same = (a, b) => a.title === b.title && a.body === b.body;
  const blankOf = (n) => !String(n.title || "").trim() && !String(n.body || "").trim();

  /** 新しく足す版と、すでにある版を一つの並びに（新しい順・同じ中身は一つ・
      KEEP_VERS まで）。 */
  function mergeVers(add, old) {
    const out = [];
    add.concat(old)
      .filter((v) => v && typeof v.body === "string" && typeof v.title === "string")
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .forEach((v) => {
        if (!out.some((o) => same(o, v))) out.push({ at: v.at || "", title: v.title, body: v.body, ...(v.two ? { two: true } : {}) });
      });
    return out.slice(0, KEEP_VERS);
  }

  /** いまの中身を、次に書くときに前の版として残します。空なら残しません。 */
  function keepNow(n) {
    if (blankOf(n)) return;
    const v = { at: n.updatedAt, title: n.title, body: n.body };
    pendVer.set(n.id, [v].concat(pendVer.get(n.id) || []));
  }

  /** 書く紙を開いたとき。この回で最初に直したときに、直す前を版に残します。 */
  function begin(id) { kept.delete(id); opened.add(id); }

  /** 書く紙を閉じたとき。開いているあいだに来た変更を、ここで合わせる。 */
  function end(id) {
    opened.delete(id);
    if (KN.notesSync) KN.notesSync.soon();
  }

  /** 前の版（新しい順）。入れ物から読むので約束で返ります。 */
  function versions(id) {
    if (phase !== "on") return Promise.resolve([]);
    const pend = pendVer.get(id) || [];
    if (verCache.has(id)) return Promise.resolve(mergeVers(pend, verCache.get(id)));
    return conn().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(["meta"], "readonly");
      const req = t.objectStore("meta").get(`ver:${id}`);
      t.oncomplete = () => resolve((req.result && req.result.list) || []);
      t.onerror = t.onabort = () => reject(t.error || new Error("読めませんでした"));
    })).then((list) => {
      verCache.set(id, list);
      return mergeVers(pendVer.get(id) || [], list);
    });
  }

  /** すべてのノートの前の版の本文（画像の掃除が参照を数える。js/note-img.js）。読むだけ。
      読めなければ断ります——数えそこねた参照を「無い」と読まないため。 */
  function versionBodies() {
    if (phase !== "on") return Promise.reject(new Error("ノートを読めていません"));
    return conn().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(["meta"], "readonly");
      const req = t.objectStore("meta").getAll();
      t.oncomplete = () => resolve(req.result || []);
      t.onerror = t.onabort = () => reject(t.error || new Error("読めませんでした"));
    })).then((rows) => {
      const out = [];
      rows.forEach((r) => {
        if (r && String(r.k).startsWith("ver:") && Array.isArray(r.list)) r.list.forEach((v) => { if (v) out.push(String(v.body || "")); });
      });
      pendVer.forEach((list) => list.forEach((v) => out.push(String(v.body || ""))));
      return out;
    });
  }

  /** 前の版へ戻します。いまの中身は、戻す前に版へ残します（戻したことも
      戻せるように）。 */
  function revert(id, v) {
    const n = byId.get(id);
    if (!n || phase !== "on" || !v) return false;
    if (same(n, v)) return true;
    keepNow(n);
    n.title = v.title;
    n.body = v.body;
    n.updatedAt = U.today();
    kept.add(id);
    dirty.add(id);
    writeNow();
    emit();
    return true;
  }

  /* ---------------- 復元で合わせる ----------------

     「バックアップを保存」・Dropbox の中身の `noteBook` を、いまのノートに
     **合わせます**（置き換えません。いまあるノートは一つも消しません）。
       - こちらに無いノート → 足す。
       - 同じノートで中身が違う → 新しく直したほうを本文に。もう片方は
         前の版に残す（どちらの中身も、どこかに残る）。
       - ★・消した印はこちらのまま（こちらに無いノートはファイルのまま）。 */
  function merge(book) {
    return start().then(() => {
      if (phase !== "on") return null;
      const res = { added: 0, changed: 0 };
      if (!book || book.v !== 1 || !Array.isArray(book.notes)) return res;
      book.notes.forEach((raw) => {
        if (!raw || typeof raw !== "object" || raw.id == null || raw.id === "") return;
        const inc = shape(raw);
        const mine = byId.get(inc.id);
        if (!mine) {
          byId.set(inc.id, inc);
          dirty.add(inc.id);
          res.added++;
          return;
        }
        if (same(mine, inc)) return;
        if (String(inc.updatedAt) > String(mine.updatedAt)) {
          keepNow(mine);
          mine.title = inc.title;
          mine.body = inc.body;
          mine.updatedAt = inc.updatedAt;
        } else {
          keepNow(inc);
        }
        dirty.add(inc.id);
        res.changed++;
      });
      if (book.colors && labels) {
        const inc = colorsIn(book.colors);
        setColors((all) => ["nb", "tag"].forEach((kind) => Object.keys(inc[kind]).forEach((name) => {
          if (!Object.prototype.hasOwnProperty.call(all[kind], name)) all[kind][name] = inc[kind][name];
        })), true);
        quietLab = false;
      }
      /* ノートブックの並び：こちらの順のまま、こちらに無い名前だけ終わりに足す（色と同じ考え）。 */
      if (Array.isArray(book.books) && books) {
        const add = cleanBooks(book.books).filter((nb) => !books.includes(nb));
        if (add.length) { books = books.concat(add); pendMeta.set("books", { k: "books", list: books.slice() }); }
      }
      purge(true);
      return writeNow().then(() => { emit(); return res; });
    });
  }

  /* ---------------- 同期（js/notes-sync.js） ---------------- */

  /** 外から来た中身を書きます。notes … [id, patch|null, 前の版?]（patch の undefined は欄を外す。
      null は本当に消す）。meta … [k, 記録|null]。どれも同じ取引で書き、送り返しの合図は出しません。
      ノートは置きかえず、同じ入れ物の欄を直します（開いている紙が同じ一件を持っている）。 */
  function absorb(notes, meta) {
    if (phase !== "on") return Promise.reject(new Error("ノートを読めていません"));
    (notes || []).forEach(([id, patch, ver]) => {
      const n = byId.get(id);
      if (!patch) { byId.delete(id); verCache.delete(id); }
      else if (!n) byId.set(id, shape(Object.fromEntries(Object.entries({ id, ...patch }).filter(([, v]) => v !== undefined))));
      else Object.entries(patch).forEach(([k, v]) => { if (v === undefined) delete n[k]; else n[k] = v; });
      if (ver && patch) pendVer.set(id, [ver].concat(pendVer.get(id) || []));
      quiet.add(id);
      dirty.add(id);
    });
    (meta || []).forEach(([k, rec]) => pendMeta.set(k, rec));
    return writeNow().then(() => {
      if ((notes || []).some(([id]) => dirty.has(id)) || (meta || []).some(([k]) => pendMeta.has(k))) throw new Error("書けませんでした");
      if (notes && notes.length) emit();
    });
  }

  /* ---------------- 取り込み（js/note-import.js。notes-unify.md「取り込み」） ---------------- */

  /** 新しいノートをまとめて足します（一つの取引。ほかの端末へも行く）。書けなければ断る。 */
  function addMany(list) {
    if (phase !== "on") return Promise.reject(new Error("ノートを読めていません"));
    const ids = list.map((raw) => { const n = shape(raw); byId.set(n.id, n); quiet.delete(n.id); dirty.add(n.id); return n.id; });
    return writeNow().then(() => {
      if (ids.some((id) => dirty.has(id))) throw new Error("書けませんでした");
      emit();
    });
  }

  /** 取り込みを取り消す → 消した印（最近削除・30日）。取り込んだあと直したノート（更新日が取り込みより
      あと）と、ほかのノートを中に持つノートは残します。二度目に取り込めるよう `src.undone` を付ける。 */
  function unimport(batch) {
    if (phase !== "on" || !batch) return 0;
    const at = U.today();
    const hit = [...byId.values()].filter((n) => !n.deletedAt && n.src && n.src.batch === batch && String(n.updatedAt) <= batch);
    const set = new Set(hit.map((n) => n.id));
    const out = hit.filter((n) => !under(n.id).some((k) => !k.deletedAt && !set.has(k.id)));
    out.forEach((n) => { n.deletedAt = at; n.src = { ...n.src, undone: at }; dirty.add(n.id); });
    if (out.length) { writeNow(); emit(); }
    return out.length;
  }

  /** 整理（js/note-organize.js）：新しいノート（made）と、欄の直し（patches … [id, patch]。undefined は欄を外す）を
      一つの取引で。移すと同じく、更新日は動かさず、前の版も取りません。書けなければ断る。 */
  function reshape(made, patches) {
    if (phase !== "on") return Promise.reject(new Error("ノートを読めていません"));
    const ids = [];
    (made || []).forEach((raw) => { const n = shape(raw); byId.set(n.id, n); ids.push(n.id); });
    (patches || []).forEach(([id, patch]) => {
      const n = byId.get(id);
      if (!n) return;
      Object.entries(patch).forEach(([k, v]) => { if (v === undefined) delete n[k]; else n[k] = v; });
      ids.push(id);
    });
    ids.forEach((id) => { quiet.delete(id); dirty.add(id); });
    return writeNow().then(() => {
      if (ids.some((id) => dirty.has(id))) throw new Error("書けませんでした");
      emit();
    });
  }

  /** meta の記録を、頭の字で（`sync:` など）。 */
  function metaAll(prefix) {
    if (phase !== "on") return Promise.reject(new Error("ノートを読めていません"));
    return conn().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(["meta"], "readonly");
      const req = t.objectStore("meta").getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      t.oncomplete = () => resolve(req.result || []);
      t.onerror = t.onabort = () => reject(t.error || new Error("読めませんでした"));
    })).then((rows) => {
      const out = new Map(rows.map((r) => [r.k, r]));
      pendMeta.forEach((rec, k) => { if (k.startsWith(prefix)) { if (rec) out.set(k, rec); else out.delete(k); } });
      return [...out.values()];
    });
  }

  /** 色。読めない日は記録の settings.noteColors（前のまま）。 */
  function colors() {
    return labels || colorsIn(KN.store && (KN.store.get().settings || {}).noteColors);
  }

  /** 色を直します。fn(all) … all.nb・all.tag をその場で直す。外から（同期）なら quietly。 */
  function setColors(fn, quietly) {
    if (phase !== "on" || !labels) return false;
    const next = colorsIn(labels);
    fn(next);
    labels = colorsIn(next);
    pendMeta.set("labels", { k: "labels", ...labels });
    if (quietly) { quietLab = true; return true; }
    writeNow();
    emit();
    return true;
  }

  /* ---------------- 外から ---------------- */

  /** まだ置いていない、新しい一件。置くのは `put` してから。 */
  function draft() {
    const at = U.today();
    return { id: U.uid("n"), title: "", body: "", notebook: "", tags: [], fav: false,
             createdAt: at, updatedAt: at, deletedAt: null };
  }

  function put(n) {
    if (phase !== "on") return false;
    byId.set(n.id, n);
    touch(n.id);
    return true;
  }

  /** 題・本文を直します。変わっていなければ何もしません（更新日も動かさない）。 */
  function edit(id, patch) {
    const n = byId.get(id);
    if (!n || phase !== "on") return false;
    const changed = Object.keys(patch).some((k) => n[k] !== patch[k]);
    if (!changed) return true;
    /* この回で最初に直すときは、直す前を前の版へ。 */
    if (!kept.has(id)) { kept.add(id); keepNow(n); }
    Object.assign(n, patch);
    n.updatedAt = U.today();
    touch(id);
    return true;
  }

  /** ★。並びも更新日も動かしません。 */
  function setFav(id, on) {
    const n = byId.get(id);
    if (!n || phase !== "on") return;
    n.fav = !!on;
    touch(id);
    emit();
  }

  /** タグの並びをそろえます（前後の空白を落とし、空と重なりを捨てる）。 */
  function cleanTags(tags) {
    const out = [];
    (Array.isArray(tags) ? tags : []).forEach((t) => {
      const s = String(t == null ? "" : t).trim();
      if (s && !out.includes(s)) out.push(s);
    });
    return out;
  }

  /** ノートブックとタグ（段3）。★と同じく、並びも更新日も動かしません
      ——中身を直したのではないので。前の版も取りません。 */
  function setLabels(id, patch) {
    const n = byId.get(id);
    if (!n || phase !== "on") return;
    if ("notebook" in patch) {
      const nb = String(patch.notebook || "").trim();
      /* ノートブックを替える＝そのノートブックの一番上へ移す。子孫も同じ札に（段1）。並びは作った順へ
         （前の兄弟のあいだの `pos` は、移った先では意味が無い）。 */
      if (nb !== n.notebook) { delete n.parent; delete n.pos; unhead(n); under(id).forEach((k) => { k.notebook = nb; dirty.add(k.id); }); }
      n.notebook = nb;
    }
    if ("tags" in patch) n.tags = cleanTags(patch.tags);
    touch(id);
    emit();
  }

  /* ---------------- 階層（段1。docs/notes-unify.md「形」） ----------------
     `parent` は親のノートの id。欄が無い・親が見つからない・親を消した → 一番上に並べるだけで、
     書き換えません。子は親と同じ `notebook` を持つ（読む側は今のまま `notebook` だけ見ればよい）。 */

  /** 子孫（消したものも）。親の欄をそのままたどる。輪があっても一度ずつ。 */
  function under(id) {
    const out = [];
    const seen = new Set([id]);
    for (let i = -1; i < out.length; i++) {
      const at = i < 0 ? id : out[i].id;
      byId.forEach((n) => {
        if (String(n.parent || "") === at && !seen.has(n.id)) { seen.add(n.id); out.push(n); }
      });
    }
    return out;
  }

  /* 表のノートの一行め：CSV の原本への参照（js/note-notion.js の build）。 */
  const TABLE = /^\[[^\]\n]*\]\(file:[0-9a-f]{64}\.csv\)$/;
  /** 表のノート（Notion のデータベース）か。 */
  const isTable = (n) => !!n && TABLE.test(String(n.body || "").split("\n", 1)[0]);
  /** 頭（ノートブックの頭）を別の場所へ移したら、もう頭ではない。整理の「頭が落ちたら戻す」も外す（notes-unify.md「整理」）。 */
  function unhead(n) {
    if (n.head !== true) return;
    delete n.head;
    if (n.org && n.org.h) { const r = { ...n.org }; delete r.h; n.org = r; }
  }

  /** 消していないノートの木を、その時の一枚で（画面を組むたびに一度）。
      二台が同時に移して輪になったら、輪の中で id の一番小さいノートを一番上へ（どの端末でも同じ答え。
      データは書き換えない）。 */
  function tree() {
    const live = [...byId.values()].filter((n) => !n.deletedAt);
    const up = new Map();
    live.forEach((n) => {
      const p = n.parent ? byId.get(String(n.parent)) : null;
      up.set(n.id, p && !p.deletedAt && p.id !== n.id ? p.id : null);
    });
    const seen = new Map();          // id → 1 たどっている途中・2 済み
    live.forEach((n) => {
      const chain = [];
      let at = n.id;
      while (at != null && !seen.has(at)) { seen.set(at, 1); chain.push(at); at = up.get(at); }
      if (at != null && seen.get(at) === 1) {
        const ring = chain.slice(chain.indexOf(at));
        up.set(ring.reduce((a, b) => (a < b ? a : b)), null);
      }
      chain.forEach((c) => seen.set(c, 2));
    });
    const kids = new Map();
    live.forEach((n) => {
      const p = up.get(n.id);
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(n);
    });
    kids.forEach((l) => l.sort(byPos));
    const parentOf = (id) => { const p = up.get(id); return p ? byId.get(p) : null; };
    /* ノートブックの頭（notes-unify.md「整理」）：`head` の印を持つ一番上のノート（二つあれば古いほう）。
       頭の中のノートは、そのノートブックの一番上として並べる（頭そのものは並べない）。 */
    const heads = new Map();
    (kids.get(null) || []).forEach((n) => { if (n.head === true && !heads.has(n.notebook)) heads.set(n.notebook, n); });
    return {
      parentOf,
      /** 中のノート（並びの順。`pos` が無ければ作った順）。 */
      kids: (id) => kids.get(id) || [],
      /** 木に並べる中のノート。表のノート（Notion のデータベース）の行は並べない（表の中で見る）。 */
      branch: (id) => (isTable(byId.get(id)) ? [] : kids.get(id) || []),
      /** ノートブックの一番上のノート（並びの順）。頭があれば、頭の中のノートと、頭の外の一番上のノート。 */
      tops: (nb) => {
        const h = heads.get(nb);
        const list = (kids.get(null) || []).filter((n) => n.notebook === nb && n !== h);
        return h ? (kids.get(h.id) || []).concat(list).sort(byPos) : list;
      },
      /** ノートブックの頭（無ければ null）。 */
      head: (nb) => heads.get(nb) || null,
      isHead: (id) => { const n = byId.get(id); return !!n && heads.get(n.notebook) === n; },
      /** 親たち（一番上から）。 */
      path(id) {
        const a = [];
        for (let p = parentOf(id); p; p = parentOf(p.id)) a.unshift(p);
        return a;
      },
    };
  }

  /** 移す。to … 親にするノートの id、null なら nb の一番上へ。自分・自分の子孫の下へは移さない。
      子孫まで同じノートブックに。★・ラベルと同じく、更新日も並びも動かさず、前の版も取りません。 */
  function move(id, to, nb) {
    const n = byId.get(id);
    if (!n || phase !== "on") return false;
    const p = to ? byId.get(to) : null;
    if (to && (!p || p.deletedAt || to === id || under(id).some((k) => k.id === to))) return false;
    const book = p ? p.notebook : String(nb == null ? n.notebook : nb).trim();
    if (p || book !== n.notebook) unhead(n);
    if (p) n.parent = p.id; else delete n.parent;
    n.notebook = book;
    /* 移った先では作った順に（`pos` は前の兄弟のあいだの字）。手で置くのは place。 */
    delete n.pos;
    under(id).forEach((k) => { k.notebook = book; dirty.add(k.id); });
    touch(id);
    emit();
    return true;
  }

  /* ---------------- 並び（docs/notes-unify.md「並び」） ----------------
     同じ親の中（ノートブックの一番上も）は `pos` の字の順。`pos` の無いノートは作った日時の字を代わりに使う
     ——前からのノートは作った順のまま（移行なし）。`pos` も作った日時も同じ物差し（字のコードの順）で比べるので、
     有るものと無いものが混ざっても一本の順になる（同じ字なら今までどおり入れ物の順＝並べ替えない）。
     動かすと、前後のあいだの字を一つ作って**動かしたノートだけ**に書く。終わりへ置く字は「いま」より前に作る
     ——あとから書いた新しいノートが、その下に来るように。あいだが無い（同じ字が並んだ・字が長くなりすぎた）
     ときだけ、その兄弟をまとめて振り直す（"0" で始まる字。どの作った日時よりも前）。 */
  const POS = /^[\x21-\x7e]{1,200}$/;
  const posOf = (n) => (typeof n.pos === "string" && POS.test(n.pos) ? n.pos : null);
  const keyOf = (n) => posOf(n) || String(n.createdAt || "");
  function byPos(a, b) {
    const x = keyOf(a), y = keyOf(b);
    return x === y ? 0 : x < y ? -1 : 1;
  }
  /* あいだに置く字。"0" は終わりに置かない（その前に入る字が無くなる）。 */
  const DIG = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const B62 = "0" + DIG;

  /** a と b のあいだの字（a は "" で頭の前、b は null で終わりの先）。作れなければ null。 */
  function between(a, b) {
    let s = "";
    for (let i = 0; i < 240; i++) {
      const ca = i < a.length ? a.charCodeAt(i) : -1;
      const cb = b == null ? 0x7f : i < b.length ? b.charCodeAt(i) : -1;
      if (ca === cb) { if (ca < 0) return null; s += a[i]; continue; }
      if (ca > cb) return null;
      const mid = [...DIG].filter((c) => c.charCodeAt(0) > ca && c.charCodeAt(0) < cb);
      if (mid.length) return s + mid[mid.length >> 1];
      if (ca >= 0) { s += a[i]; b = null; }            // a の字を写し、あとは a の残りより上なら何でも
      else if (cb > 48) { s += "0"; b = null; }         // a は尽きた。"0" は b の字より下
      else s += b[i];                                   // b の字が "0" 以下：b について降りる
    }
    return null;
  }

  /** 振り直しの字（count 個、間を空けて）。どれも "0" で始まり、"0" で終わらない。 */
  function spaced(count) {
    let w = 1;
    while (62 ** w < (count + 1) * 2) w++;
    const step = Math.floor(62 ** w / (count + 1));
    const out = [];
    for (let i = 1; i <= count; i++) {
      let v = i * step + (i * step % 62 === 0 ? 1 : 0);
      let s = "";
      for (let k = 0; k < w; k++) { s = B62[v % 62] + s; v = Math.floor(v / 62); }
      out.push("0" + s);
    }
    return out;
  }

  /* 置いた場所の欄（戻すための控えに取るもの）。 */
  const PLACE = ["parent", "notebook", "pos", "head", "org"];
  const snapOf = (list) => list.map((k) => [k.id, Object.fromEntries(PLACE.map((f) => [f, k[f]]))]);

  /** 置く（木の行をつまんで運んだ・Tab・Alt+↑↓。js/note-drag.js）。
      to … { parent: 親のノートの id（無ければ nb の一番上）, nb, after / before: 隣に来る兄弟の id（無ければ終わり） }。
      親とノートブックは移すと同じ（自分・子孫の下へは置かない・子孫まで同じノートブック・頭は外れる）。
      頭のある冊の一番上＝頭の中。★と同じく更新日は動かさず、前の版も取りません。
      戻すための控え（unplace へ）を返す。置けない・動かないなら null。 */
  function place(id, to) {
    const n = byId.get(id);
    if (!n || n.deletedAt || phase !== "on" || !to) return null;
    const t = tree();
    let p = to.parent ? byId.get(String(to.parent)) : null;
    if (to.parent && (!p || p.deletedAt || p.id === id || under(id).some((k) => k.id === p.id))) return null;
    const nb = p ? p.notebook : String(to.nb == null ? n.notebook : to.nb).trim();
    if (!p && nb) { const h = t.head(nb); if (h && h.id !== id) p = h; }
    const top = !p || t.isHead(p.id);
    const all = top ? t.tops(nb) : t.kids(p.id);
    const group = all.filter((k) => k.id !== id);
    let at = group.length;
    const i = (x) => group.findIndex((k) => k.id === x);
    if (to.after && i(to.after) >= 0) at = i(to.after) + 1;
    else if (to.before && i(to.before) >= 0) at = i(to.before);
    /* 同じ群の同じ場所なら動かさない。 */
    if (n.notebook === nb && all.includes(n) && all.indexOf(n) === at) return null;
    const prev = group[at - 1], next = group[at];
    let key = null;
    const renum = [];
    if (prev || next) {
      if (next) key = between(prev ? keyOf(prev) : "", keyOf(next));
      else { const a = keyOf(prev), now = U.today(); key = between(a, a < now ? now : null); }
      if (key == null || key.length > 120) {
        const order = group.slice(0, at).concat(n, group.slice(at));
        const keys = spaced(order.length);
        order.forEach((k, j) => { if (k === n) key = keys[j]; else if (k.pos !== keys[j]) renum.push([k, keys[j]]); });
      }
    }
    const subtree = under(id);
    const was = snapOf([n].concat(subtree, renum.map(([k]) => k)));
    if (p || nb !== n.notebook) unhead(n);
    if (p) n.parent = p.id; else delete n.parent;
    n.notebook = nb;
    if (key) n.pos = key; else delete n.pos;
    subtree.forEach((k) => { if (k.notebook !== nb) { k.notebook = nb; quiet.delete(k.id); dirty.add(k.id); } });
    renum.forEach(([k, v]) => { k.pos = v; quiet.delete(k.id); dirty.add(k.id); });
    touch(id);
    emit();
    return was;
  }

  /** place の控えのとおりに戻します（「元に戻す」）。 */
  function unplace(was) {
    if (phase !== "on" || !Array.isArray(was)) return false;
    let any = false;
    was.forEach(([id, f]) => {
      const k = byId.get(id);
      if (!k || !f) return;
      PLACE.forEach((x) => { if (f[x] === undefined) delete k[x]; else k[x] = f[x]; });
      quiet.delete(id);
      dirty.add(id);
      any = true;
    });
    if (any) { schedule(); emit(); }
    return any;
  }

  /** 木の順（ノートブックの並び → 一番上から深さ順。ノートブックの無いノートは終わり）。書き出しの並び。 */
  function inOrder(list) {
    const t = tree();
    const rank = new Map();
    const walk = (ns) => ns.forEach((n) => { if (!rank.has(n.id)) { rank.set(n.id, rank.size); walk(t.kids(n.id)); } });
    notebooks().concat("").forEach((nb) => {
      const h = nb ? t.head(nb) : null;
      if (h) rank.set(h.id, rank.size);
      walk(t.tops(nb));
    });
    const r = (n) => (rank.has(n.id) ? rank.get(n.id) : rank.size);
    return list.slice().sort((a, b) => r(a) - r(b));
  }

  /** 兄弟の中で何番目か（1から。書き出しの `order`）。 */
  function orderOf(id) {
    const n = byId.get(id);
    if (!n || n.deletedAt) return 0;
    const t = tree();
    const up = t.parentOf(id);
    const list = !up || t.isHead(up.id) ? t.tops(n.notebook) : t.kids(up.id);
    return list.indexOf(n) + 1;
  }

  /* ---------------- ノートブックの並び・空のノートブック（docs/notes-unify.md「並び」） ----------------
     ノートブックは名前の札のまま。並べた・作った名前を meta の `books`（{k, list}）に順に持つ。一覧はその順の
     あとに、そこに無い使われている名前（名前の順）。`books` に居る名前は、中のノートが無くても残る（空の
     ノートブック）。外すのは設定（renameLabel で ""）。 */
  function cleanBooks(v) {
    const out = [];
    (Array.isArray(v) ? v : []).forEach((x) => {
      const s = String(x == null ? "" : x).trim();
      if (s && !out.includes(s)) out.push(s);
    });
    return out;
  }

  /** 並びを書きます。外から（同期）なら quietly。 */
  function setBooks(list, quietly) {
    if (phase !== "on") return false;
    books = cleanBooks(list);
    pendMeta.set("books", { k: "books", list: books.slice() });
    if (quietly) { quietLab = true; return true; }
    writeNow();
    emit();
    return true;
  }

  /** ノートブックを before の前へ（null なら終わりへ）。戻すための前の並びを返す（動かなければ null）。 */
  function moveBook(nb, before) {
    const was = notebooks();
    if (phase !== "on" || !was.includes(nb) || nb === before) return null;
    const list = was.filter((x) => x !== nb);
    const at = before ? list.indexOf(before) : -1;
    list.splice(at < 0 ? list.length : at, 0, nb);
    if (list.join("\n") === was.join("\n")) return null;
    setBooks(list);
    return was;
  }

  /** 空のノートブックを作ります（終わりに）。もうある名前なら何もしない。 */
  function addBook(name) {
    const s = String(name == null ? "" : name).trim();
    if (!s || phase !== "on") return false;
    const all = notebooks();
    if (!all.includes(s)) setBooks(all.concat(s));
    return true;
  }

  /** 作った日時を差し替えます（Evernote から移した過去のノート）。★と
      同じく、並びも更新日も動かさず、前の版も取りません。
      noTime … 日だけ選んだ印（`noTime: true`）。時刻は出しません（段4.5）。
      欄が無いノートは時刻ありのまま——前からのノートは何も変わりません。 */
  function setCreated(id, iso, noTime) {
    const n = byId.get(id);
    if (!n || phase !== "on" || isNaN(new Date(iso).getTime())) return;
    n.createdAt = iso;
    if (noTime) n.noTime = true;
    else delete n.noTime;
    touch(id);
    emit();
  }

  /** ノートブック・タグの名前を付け替えます（設定の notes →「ノートブック」
      「タグ」）。to が空なら外します（ノートは消えません）。もうある名前へ
      付け替えれば一つにまとまります（タグの重なりは cleanTags が捨てる）。
      最近削除したノートも同じにします——戻したときに古い名前がよみがえら
      ないように。★・ラベルと同じく、更新日も並びも動かさず、前の版も取りません。
      付け替えたノートの数を返します。 */
  function renameLabel(kind, from, to) {
    if (phase !== "on") return 0;
    from = String(from == null ? "" : from).trim();
    to = String(to == null ? "" : to).trim();
    if (!from || from === to) return 0;
    let count = 0;
    byId.forEach((n) => {
      if (kind === "nb") {
        if (n.notebook !== from) return;
        n.notebook = to;
      } else {
        if (!n.tags.includes(from)) return;
        n.tags = cleanTags(n.tags.map((t) => (t === from ? to : t)));
      }
      dirty.add(n.id);
      count++;
    });
    /* ノートブックの並びも（空のノートブックは、ここでだけ名前が変わる・外れる）。 */
    let moved = false;
    if (kind === "nb" && books && books.includes(from)) {
      books = cleanBooks(books.map((x) => (x === from ? to : x)));
      pendMeta.set("books", { k: "books", list: books.slice() });
      moved = true;
    }
    if (count || moved) { writeNow(); emit(); }
    return count;
  }

  /** いま使われているノートブック・タグの名前（消していないノートから、
      そのつど組み立てます）。名前の順。 */
  function namesOf(pick) {
    const set = new Set();
    byId.forEach((n) => { if (!n.deletedAt) pick(n).forEach((x) => { if (x) set.add(x); }); });
    return [...set].sort((a, b) => a.localeCompare(b, "ja"));
  }
  /** ノートブック：並べた・作った順（`books`）のあとに、そこに無い使われている名前（名前の順）。
      o.used … 中にノートのあるものだけ（絞り込み・書き出しのチップ）。 */
  function notebooks(o) {
    const used = namesOf((n) => [n.notebook]);
    const out = (books || []).slice();
    used.forEach((nb) => { if (!out.includes(nb)) out.push(nb); });
    return o && o.used ? out.filter((nb) => used.includes(nb)) : out;
  }
  const tagNames = () => namesOf((n) => n.tags);

  /** 題。無ければ本文の一行目（一覧と、ぜんぶをさがすの行に）。 */
  function headOf(n) {
    if (String(n.title || "").trim()) return n.title.trim();
    /* 本文から借りるときは、行頭の印（# - 1. - [ ] > ---）を外した字で
       （段4。js/note-format.js）。 */
    const plain = KN.noteFormat ? KN.noteFormat.plain : (l) => l.trim();
    const line = String(n.body || "").split("\n").map(plain).find(Boolean);
    return line || "";
  }

  /** 消す → 最近削除した項目へ。中のノートも同じ時刻の印で（先に消してあったものはそのまま）。 */
  function remove(id) {
    const n = byId.get(id);
    if (!n || phase !== "on") return;
    const at = U.today();
    [n].concat(under(id).filter((k) => !k.deletedAt)).forEach((k) => { k.deletedAt = at; dirty.add(k.id); });
    writeNow();
    emit();
  }

  /** 戻す。一緒に消した（同じ時刻の印の）中のノートも一緒に。 */
  function restore(id) {
    const n = byId.get(id);
    if (!n || phase !== "on") return;
    const at = n.deletedAt;
    const along = at ? under(id).filter((k) => k.deletedAt === at) : [];
    [n].concat(along).forEach((k) => { k.deletedAt = null; dirty.add(k.id); });
    writeNow();
    emit();
  }

  /** 本当に消します。使うのは、何も書かずに閉じた新しいノートだけ。中にノートがあれば消しません
      （中のノートが親を失う）。 */
  function drop(id) {
    if (!byId.has(id) || phase !== "on") return;
    if (under(id).length) return;
    byId.delete(id);
    dirty.add(id);
    writeNow();
  }

  const byNew = (k) => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));

  /** 一覧（消していないもの）。新しく直した順。 */
  function list() {
    return [...byId.values()].filter((n) => !n.deletedAt).sort(byNew("updatedAt"));
  }

  /** 最近削除した項目。新しく消した順。 */
  function trash() {
    return [...byId.values()].filter((n) => n.deletedAt).sort(byNew("deletedAt"));
  }

  /** 書き出し・Dropbox に足す一番上の鍵（最近削除も含める）。読めていない
      日は何も足しません——空の noteBook は「ノートは0件」と言ってしまうので。 */
  function forExport() {
    if (phase !== "on") return {};
    const notes = [...byId.values()].sort(byNew("updatedAt")).map((n) => ({ ...n, tags: n.tags.slice() }));
    /* 色も（同期で入れ物へ写した。控えから戻すとき、こちらに無い名前だけ足す） */
    return { noteBook: { v: 1, notes, ...(labels ? { colors: colorsIn(labels) } : {}),
      ...(books && books.length ? { books: books.slice() } : {}) } };
  }

  const flush = () => writeNow();

  window.addEventListener("pagehide", () => { flush(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    flush();
    /* 戻ってきて直したら、別の回として前の版を取ります。 */
    kept.clear();
  });

  KN.notes = {
    ready: () => start(),
    state: () => phase,
    settled: () => phase === "on" || phase === "off",
    get: (id) => byId.get(id) || null,
    draft, put, edit, setFav, remove, restore, drop, list, trash, forExport, flush,
    /** まだ入れ物に書けていないか（flush のあとに見る。日記の一件をノートへ移すとき、
        書けたと確かめてから日記から外すため。docs/thinking.md）。 */
    pending: (id) => dirty.has(id),
    begin, end, versions, versionBodies, revert, merge,
    absorb, addMany, unimport, reshape, metaAll, colors, setColors, isOpen: (id) => opened.has(id), shape,
    setLabels, setCreated, cleanTags, notebooks, tagNames, headOf, renameLabel, tree, move, isTable,
    place, unplace, inOrder, orderOf, setBooks, moveBook, addBook,
    /** 並べた・作ったノートブック（`books` そのもの。同期が運ぶ）。 */
    books: () => (books || []).slice(),
    /** 木の行を運んでいるあいだ、知らせ（onChange）を待たせる。離したら一度だけ。 */
    hold(on) { holding = !!on; if (!holding && owed) { owed = false; emit(); } },
    /** 試験の口 */
    _: { between, spaced, keyOf },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  /* 読み始めるのは起動のとき（ノートの面を開いたときではありません）
     ——書き出しと Dropbox が中身を待つので。 */
  start();
})();
