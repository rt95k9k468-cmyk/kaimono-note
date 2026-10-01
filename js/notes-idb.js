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
    if (!dirty.size || phase !== "on") return Promise.resolve();
    const ids = [...dirty];
    dirty.clear();
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
    }, (err) => {
      ids.forEach((id) => dirty.add(id));
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

  const touch = (id) => { dirty.add(id); schedule(); };

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
      .forEach((v) => { if (!out.some((o) => same(o, v))) out.push({ at: v.at || "", title: v.title, body: v.body }); });
    return out.slice(0, KEEP_VERS);
  }

  /** いまの中身を、次に書くときに前の版として残します。空なら残しません。 */
  function keepNow(n) {
    if (blankOf(n)) return;
    const v = { at: n.updatedAt, title: n.title, body: n.body };
    pendVer.set(n.id, [v].concat(pendVer.get(n.id) || []));
  }

  /** 書く紙を開いたとき。この回で最初に直したときに、直す前を版に残します。 */
  function begin(id) { kept.delete(id); }

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
      purge(true);
      return writeNow().then(() => { emit(); return res; });
    });
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
    if ("notebook" in patch) n.notebook = String(patch.notebook || "").trim();
    if ("tags" in patch) n.tags = cleanTags(patch.tags);
    touch(id);
    emit();
  }

  /** いま使われているノートブック・タグの名前（消していないノートから、
      そのつど組み立てます。入れ物は持ちません）。名前の順。 */
  function namesOf(pick) {
    const set = new Set();
    byId.forEach((n) => { if (!n.deletedAt) pick(n).forEach((x) => { if (x) set.add(x); }); });
    return [...set].sort((a, b) => a.localeCompare(b, "ja"));
  }
  const notebooks = () => namesOf((n) => [n.notebook]);
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
    begin, versions, revert, merge,
    setLabels, cleanTags, notebooks, tagNames, headOf,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  /* 読み始めるのは起動のとき（ノートの面を開いたときではありません）
     ——書き出しと Dropbox が中身を待つので。 */
  start();
})();
