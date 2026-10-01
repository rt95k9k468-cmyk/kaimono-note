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
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const U = KN.util;

  const DB = "kaimono-note-notes";
  const SOON = 600;                       // 打ち終わりから書くまで（ms）
  const OPEN_WAIT = 8000;                 // これだけ待って開かなければ off
  const KEEP_DELETED = 30 * 864e5;        // 最近削除した項目に置いておく長さ

  /* idle → loading → on / off。off から遅れて開けたら on へ。 */
  let phase = "idle";
  let db = null;
  const byId = new Map();
  const dirty = new Set();
  let timer = null;
  let readyP = null;
  let settle = null;
  let failAt = 0;
  const listeners = new Set();

  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* 一つ落ちても続けます */ } });

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
      const t = d.transaction(["notes"], "readonly");
      const req = t.objectStore("notes").getAll();
      t.oncomplete = () => resolve(req.result || []);
      t.onerror = t.onabort = () => reject(t.error || new Error("読めませんでした"));
    }));
  }

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
    readAll().then((rows) => {
      byId.clear();
      rows.forEach((n) => { if (n && n.id) byId.set(String(n.id), shape(n)); });
      phase = "on";
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
  function purge() {
    const now = Date.now();
    byId.forEach((n, id) => {
      if (!n.deletedAt) return;
      const at = Date.parse(n.deletedAt);
      if (isFinite(at) && now - at > KEEP_DELETED) { byId.delete(id); dirty.add(id); }
    });
    if (dirty.size) writeNow();
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
    if (!dirty.size || phase !== "on") return Promise.resolve();
    const ids = [...dirty];
    dirty.clear();
    return conn().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(["notes"], "readwrite");
      const st = t.objectStore("notes");
      ids.forEach((id) => {
        const n = byId.get(id);
        if (n) st.put(n); else st.delete(id);
      });
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () => reject(t.error || new Error("書けませんでした"));
    })).then(() => {
      if (KN.dropbox && KN.dropbox.soon) KN.dropbox.soon();
    }, (err) => {
      ids.forEach((id) => dirty.add(id));
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

  const touch = (id) => { dirty.add(id); schedule(); };

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
    let changed = false;
    Object.keys(patch).forEach((k) => { if (n[k] !== patch[k]) { n[k] = patch[k]; changed = true; } });
    if (!changed) return true;
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

  /** 消す → 最近削除した項目へ。 */
  function remove(id) {
    const n = byId.get(id);
    if (!n || phase !== "on") return;
    n.deletedAt = U.today();
    dirty.add(id);
    writeNow();
    emit();
  }

  function restore(id) {
    const n = byId.get(id);
    if (!n || phase !== "on") return;
    n.deletedAt = null;
    dirty.add(id);
    writeNow();
    emit();
  }

  /** 本当に消します。使うのは、何も書かずに閉じた新しいノートだけ。 */
  function drop(id) {
    if (!byId.has(id) || phase !== "on") return;
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
    return { noteBook: { v: 1, notes } };
  }

  const flush = () => writeNow();

  window.addEventListener("pagehide", () => { flush(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  KN.notes = {
    ready: () => start(),
    state: () => phase,
    settled: () => phase === "on" || phase === "off",
    get: (id) => byId.get(id) || null,
    draft, put, edit, setFav, remove, restore, drop, list, trash, forExport, flush,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  /* 読み始めるのは起動のとき（ノートの面を開いたときではありません）
     ——書き出しと Dropbox が中身を待つので。 */
  start();
})();
