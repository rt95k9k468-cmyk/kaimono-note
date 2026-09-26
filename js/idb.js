/* =========================================================
   くらしノート — 大きな保存場所（IndexedDB）

   localStorage の一本（kaimono-note-v2）は、iPhone で原点あたり
   およそ5MB です。ここはそれとは桁の違う置き場で、いま入っているのは：

     diary       日記の本文の写し（js/diary-idb.js）。一日一件、キーは日付。
     snaps       自動バックアップの見出し（js/backup.js）。
     snapBodies  自動バックアップの中身。見出しと分けてあるのは、一覧を
                 出すたびに数MBの中身まで読まないため。
     meta        写し替えの記録と、突き合わせの印。

   経緯は docs/improvements.md の A1(b)、決めごとは docs/storage.md。

   **ここが使えない端末でも、アプリは前のまま動くこと。** 開けない・
   返事が来ないときは約束が失敗で返るので、呼ぶ側は localStorage だけの
   道へ戻ります（どちらも、失敗したら「前のまま」が行き先です）。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const NAME = "kaimono-note";
  const STORES = {
    diary: { keyPath: "date" },
    snaps: { keyPath: "id", autoIncrement: true },
    snapBodies: { keyPath: "id" },
    meta: { keyPath: "k" },
  };

  /* 開くのを待つ上限。WebKit には、開いたまま返事をしない時期が
     ありました。待ちつづけると、控えも日記の写しも「始まらないまま」に
     なるので、見切って localStorage だけの道へ戻ります。 */
  const OPEN_WAIT_MS = 8000;

  let dbp = null;

  function available() {
    try { return !!window.indexedDB; } catch (err) { return false; }
  }

  /* 版を決め打ちにしません。版を持たずに開き（無ければ版1で作られる）、
     棚が足りなければ、版を一つ上げて足りないものだけ作ります——同じ名前の
     入れ物が、棚の無いまま先にできていても開けるように。 */
  function openAt(version) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = version ? indexedDB.open(NAME, version) : indexedDB.open(NAME); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        Object.keys(STORES).forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, STORES[name]);
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("開けませんでした"));
    });
  }

  async function openDb() {
    let db = await openAt(0);
    if (Object.keys(STORES).some((name) => !db.objectStoreNames.contains(name))) {
      const next = db.version + 1;
      db.close();
      db = await openAt(next);
    }
    return db;
  }

  function open() {
    if (dbp) return dbp;
    const p = new Promise((resolve, reject) => {
      let late = false;
      const timer = setTimeout(() => { late = true; reject(new Error("大きな保存場所が返事をしません")); }, OPEN_WAIT_MS);
      openDb().then((db) => {
        clearTimeout(timer);
        // 見切ったあとで開けたものは、使わずに閉じます（次に呼ばれたとき開き直す）。
        if (late) { try { db.close(); } catch (err) { /* もう閉じている */ } return; }
        /* 別のタブが新しい版で開こうとしたら、こちらは退きます（退かないと、
           向こうが待たされつづける）。閉じられたら、次に使うときに開き直す。 */
        db.onversionchange = () => { try { db.close(); } catch (err) { /* もう閉じている */ } if (dbp === p) dbp = null; };
        db.onclose = () => { if (dbp === p) dbp = null; };
        resolve(db);
      }, (err) => { clearTimeout(timer); reject(err); });
    });
    dbp = p;
    // 開けなかったら、次に呼ばれたときにもう一度試します。
    p.catch(() => { if (dbp === p) dbp = null; });
    return p;
  }

  /* iOS では、しばらく裏に回ったあと「つながりが切れた」で取引が
     落ちることがあります。そのときは一度だけ開き直して、同じことを
     やり直します（put / delete / add は、落ちた取引では何も残らない
     ので、やり直しても二重にはなりません）。 */
  const lost = (err) => !!err && (err.name === "InvalidStateError" || err.name === "UnknownError");

  /**
   * 一つの取引で読み書きします。`fn(t)` の中で要求を出し、値か
   * 「終わったときに値を返す関数」を返すこと——取引が**書き終わってから**
   * 約束が果たされます（途中で落ちたら、全部が無かったことになります）。
   */
  function run(names, mode, fn, retried) {
    return open().then((db) => new Promise((resolve, reject) => {
      let t;
      try {
        /* 書くときは、書けたと言う前に確かに書き終えるように（strict）。
           知らない端末では、この三つ目は黙って無視されます。 */
        t = mode === "readwrite" ? db.transaction(names, mode, { durability: "strict" }) : db.transaction(names, mode);
      } catch (err) {
        if (dbp) dbp = null;
        if (!retried && lost(err)) { resolve(run(names, mode, fn, true)); return; }
        reject(err);
        return;
      }
      let out;
      try { out = fn(t); } catch (err) { try { t.abort(); } catch (_) { /* もう終わっている */ } reject(err); return; }
      let done = false;
      const fail = () => {
        if (done) return;
        done = true;
        const err = t.error || new Error("取引が取り消されました");
        if (!retried && lost(err)) { dbp = null; resolve(run(names, mode, fn, true)); return; }
        reject(err);
      };
      t.oncomplete = () => {
        if (done) return;
        done = true;
        try { resolve(typeof out === "function" ? out() : out); } catch (err) { reject(err); }
      };
      t.onerror = fail;
      t.onabort = fail;
    }));
  }

  /* 中身が変わったことを、見せている画面へ（設定の「バックアップと書き出し」）。
     store の subscribe とは別にしてあります——控えを取るたびに、いま出ている
     画面ぜんぶを描き直す理由は無いので。 */
  const listeners = new Set();
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function changed() { listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } }); }

  KN.idb = { NAME, available, run, onChange, changed };
})();
