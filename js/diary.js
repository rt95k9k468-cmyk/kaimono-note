/* =========================================================
   くらしノート — 日記の置き場所（IndexedDB ＋ 暗号）
   =========================================================

   なぜ、ほかの記録と同じところに置かないのか
   ------------------------------------------

   買うもの・やること・からだは、ぜんぶ localStorage の一本（kaimono-note-v2）に
   入っています。数百件で数十KB。一件変わるたびに state を丸ごと文字列にして
   書き直しても、2ms で終わります。

   日記は桁が違います。数年ぶんを実際に積んで測りました。

     2151日 × 1日600字 →  4.1MB
     2151日 × 1日900字 →  5.8MB（書き込みに 215ms）
     3000日 × 1日900字 →  8.2MB（書き込みに 308ms）

   **iOS Safari の localStorage は、原点あたり 5MB** です。入りません。
   仮に入ったとしても、backup.js が同じ localStorage に丸ごとの控えを最大7世代
   持っているので、一世代すら並びません。そして何より、**一文字打つたびに
   数MBを書き直す**ことになります。

   だから本文は state に入れません。IndexedDB に、日付をキーにして一日ずつ。
   WebKit の IndexedDB は「空きが1GB以上なら既定500MB、以下なら空きの半分」で、
   桁が二つ違います。読むのは開いている月のぶんだけ。

   なぜ、暗号化するのか
   --------------------

   ここに書かれるのは心の中です。いまのアプリには鍵も暗号もなく、iPhone の
   ロックを解いた人はそのまま全部読めますし、Safari のストレージを直接
   読める相手にも見えます。そして日記を端末の外へ（バックアップへ）出すなら、
   出る前に暗号化されていなければ意味がありません。

   本文は一日ずつ AES-GCM で包みます。鍵はパスフレーズから PBKDF2 で導き、
   **どこにも保存しません**（記憶の上だけ）。保存するのは塩と、鍵が合っている
   ことを確かめるための小さな封だけ——どちらも秘密ではありません。

   **鍵をなくすと、二度と戻りません。** 復旧できる仕組みを作れば、その仕組み
   自体が抜け道になります。ここは持ち主が選んだ約束で、コードの側で
   こっそり緩めてはいけないところです。

   何を隠して、何を隠さないか
   --------------------------

   隠すのは**本文だけ**です。「その日に何か書いたか」（＝レコードの有無）は
   隠しません——暦に印を出すために要りますし、隠すには全部を復号して数える
   ことになります。字数も保存しません。長さそのものが手がかりになるので、
   要らないものは持たない。 */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const DB_NAME = "kaimono-diary";
  const DB_VER = 1;
  const STORE = "days";
  /* 塩と封は localStorage に置きます。どちらも秘密ではなく、無くすと
     読めなくなるので、日記本体（IndexedDB）とは別の場所に置いて、
     片方が消えたときにもう片方だけでも残るようにします。 */
  const LOCK_KEY = "kaimono-diary-lock";

  /* PBKDF2 の回数。OWASP が SHA-256 に対して挙げている 600,000 回。
     iPhone で 0.3〜1秒ほどかかります——**遅いことが目的**です。ここが速いと、
     総当たりも速くなります。開くときに一度だけ払う代金なので、体感には
     出ません（鍵は記憶の上に置いたまま使い回します）。 */
  const ITER = 600000;
  const SALT_LEN = 16;
  const IV_LEN = 12;                 // AES-GCM の推奨長
  const CHECK_TEXT = "kaimono-note-diary-v1";

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const subtle = () => (window.crypto && window.crypto.subtle) || null;

  /* 記憶の上だけの鍵。ここに入っているあいだが「開いている」状態です。 */
  let key = null;

  /* ---------------- IndexedDB ---------------- */

  let dbPromise = null;

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("この端末は IndexedDB を持っていません"));
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          /* キーは日付（YYYY-MM-DD）そのもの。文字列のキーは辞書順に並ぶので、
             「この月ぶん」は範囲で取れます——別に索引を持つ必要がありません。 */
          d.createObjectStore(STORE, { keyPath: "date" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(mode, run) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const s = t.objectStore(STORE);
      let out;
      try { out = run(s); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && out.__req ? out.__req.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const wrap = (req) => ({ __req: req });

  /* その月のキーの範囲。"2026-08-01" から "2026-08-99" まで——日は最大でも
     31なので、上端は実在しない値で構いません。キーが文字列なので、これで
     ちょうどその月ぶんが取れます。 */
  const monthRange = (ym) => IDBKeyRange.bound(`${ym}-00`, `${ym}-99`);

  /* ---------------- 鍵 ---------------- */

  function lockRecord() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(passphrase, salt) {
    const s = subtle();
    if (!s) throw new Error("この端末は WebCrypto を持っていません");
    const material = await s.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return s.deriveKey(
      { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,                                  // 取り出せない鍵。書き出す用は無い
      ["encrypt", "decrypt"]
    );
  }

  async function seal(k, text) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const ct = await subtle().encrypt({ name: "AES-GCM", iv }, k, enc.encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function open_(k, blob) {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: unb64(blob.iv) }, k, unb64(blob.ct));
    return dec.decode(plain);
  }

  /** まだ一度も鍵を決めていないか。 */
  const isNew = () => !lockRecord();

  /** いま開いているか。 */
  const isOpen = () => !!key;

  /**
   * 鍵をはじめて決めます。すでに決まっているときは何もしません
   * （上書きすると、そこまでの日記が全部読めなくなるので）。
   */
  async function createKey(passphrase) {
    if (lockRecord()) throw new Error("鍵はもう決まっています");
    if (!passphrase || String(passphrase).length < 4) throw new Error("短すぎます");
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const k = await deriveKey(passphrase, salt);
    /* 封。決まった文を包んだものです。開くときにこれが開ければ、
       パスフレーズが合っています——本文で試すと、間違ったパスフレーズで
       中身が壊れたのか鍵が違うのかが区別できません。 */
    const check = await seal(k, CHECK_TEXT);
    localStorage.setItem(LOCK_KEY, JSON.stringify({ v: 1, salt: b64(salt), iter: ITER, check }));
    key = k;
    return true;
  }

  /**
   * 開けます。合っていなければ false（例外ではありません——間違いは
   * 事故ではなく、ふつうに起きることなので）。
   */
  async function unlock(passphrase) {
    const rec = lockRecord();
    if (!rec) return false;
    const k = await deriveKey(passphrase, unb64(rec.salt));
    try {
      const got = await open_(k, rec.check);
      if (got !== CHECK_TEXT) return false;
    } catch (e) {
      return false;             // AES-GCM は鍵が違えば必ずここで落ちます
    }
    key = k;
    return true;
  }

  /** 閉じます。鍵は記憶の上にしか無いので、捨てれば閉じたことになります。 */
  function lock() { key = null; }

  const need = () => { if (!key) throw new Error("日記は閉じています"); };

  /* ---------------- 読み書き ---------------- */

  /** 一日ぶん書きます。空文字を渡すと、その日の記録ごと消します。 */
  async function put(date, body) {
    need();
    const d = String(date).slice(0, 10);
    const text = String(body == null ? "" : body);
    if (!text.trim()) return remove(d);
    const blob = await seal(key, text);
    const at = new Date().toISOString();
    await tx("readwrite", (s) => s.put({ date: d, iv: blob.iv, ct: blob.ct, at }));
    return true;
  }

  async function remove(date) {
    await tx("readwrite", (s) => s.delete(String(date).slice(0, 10)));
    return true;
  }

  /** 一日ぶん読みます。無ければ null。 */
  async function get(date) {
    need();
    const rec = await tx("readonly", (s) => wrap(s.get(String(date).slice(0, 10))));
    if (!rec) return null;
    return { date: rec.date, body: await open_(key, rec), at: rec.at };
  }

  /** その月ぶん、日付の新しい順。 */
  async function month(ym) {
    need();
    const rows = await tx("readonly", (s) => wrap(s.getAll(monthRange(ym))));
    const out = [];
    for (const rec of rows) out.push({ date: rec.date, body: await open_(key, rec), at: rec.at });
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /**
   * その月に記録のある日付だけ。**復号しません**——暦の印を出すのに
   * 中身は要らないので、開いていなくても答えられます。
   */
  async function datesOfMonth(ym) {
    return tx("readonly", (s) => wrap(s.getAllKeys(monthRange(ym))));
  }

  /** 何日ぶんあるか。中身は読みません。 */
  function count() {
    return tx("readonly", (s) => wrap(s.count()));
  }

  /** いちばん古い日と新しい日。暦をどこまで遡れるかを出すために使います。 */
  async function span() {
    const keys = await tx("readonly", (s) => wrap(s.getAllKeys()));
    if (!keys.length) return null;
    return { from: keys[0], to: keys[keys.length - 1], days: keys.length };
  }

  /**
   * 文字でさがす。
   *
   * 暗号のまま探すことはできないので、**全部を復号して**見ます。数年ぶんでも
   * 一秒かからないことを測って確かめてありますが、それでも一件ずつではなく
   * まとめて読むこと、そして途中でやめられることが大事です（打つたびに
   * 走るので）。signal を渡すと、次の一件へ進む前に中断します。
   */
  async function search(query, opts) {
    need();
    const q = KN.util.foldKana(String(query || "").trim().toLowerCase());
    if (!q) return [];
    const signal = opts && opts.signal;
    const limit = (opts && opts.limit) || 200;
    const rows = await tx("readonly", (s) => wrap(s.getAll()));
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));      // 新しい順に見る
    const hits = [];
    for (const rec of rows) {
      if (signal && signal.aborted) break;
      let body;
      try { body = await open_(key, rec); } catch (e) { continue; }
      if (KN.util.foldKana(body.toLowerCase()).indexOf(q) < 0) continue;
      hits.push({ date: rec.date, body, at: rec.at });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  /**
   * まとめて入れます（移行のため）。
   *
   * 一件ずつ put すると、2000件で2000回の取引になります。ここは一つの
   * 取引でまとめて書きます——途中で落ちたら**全部**戻るので、半分だけ
   * 入った状態を作りません。
   */
  async function putMany(rows, onProgress) {
    need();
    const clean = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const text = String((r && r.body) || "");
      if (!text.trim()) continue;
      const blob = await seal(key, text);
      clean.push({ date: String(r.date).slice(0, 10), iv: blob.iv, ct: blob.ct,
                   at: r.at || new Date().toISOString() });
      if (onProgress && (i % 50 === 0)) onProgress(i, rows.length);
    }
    await tx("readwrite", (s) => { clean.forEach((rec) => s.put(rec)); });
    return clean.length;
  }

  /**
   * 暗号のまま、まるごと持ち出します。バックアップの中身はこれです
   * ——**開いていなくても呼べます**。鍵を持たない者には、日付の一覧
   * 以外の何も読めません。
   */
  async function exportSealed() {
    const rows = await tx("readonly", (s) => wrap(s.getAll()));
    return { app: "kaimono-note", kind: "diary-sealed", v: 1,
             lock: lockRecord(), days: rows, at: new Date().toISOString() };
  }

  /**
   * 持ち帰します。**塩と封も一緒に戻します**——別の端末では、そこで
   * 作った鍵と塩が違うので、封だけ残すと自分の日記が開けません。
   * すでに日記がある端末では拒みます（上書きは取り返しがつかないので）。
   */
  async function importSealed(data, opts) {
    if (!data || data.kind !== "diary-sealed" || !Array.isArray(data.days)) {
      throw new Error("日記の控えではありません");
    }
    const here = await count();
    if (here && !(opts && opts.replace)) {
      throw new Error(`この端末にはすでに ${here} 日ぶんあります`);
    }
    if (data.lock) localStorage.setItem(LOCK_KEY, JSON.stringify(data.lock));
    lock();                                   // 塩が変わったので、開き直してもらう
    await tx("readwrite", (s) => {
      if (opts && opts.replace) s.clear();
      data.days.forEach((rec) => {
        if (rec && rec.date && rec.iv && rec.ct) s.put(rec);
      });
    });
    return data.days.length;
  }

  /** 置き場所の空き具合。「入るのか」に、推測ではなく数で答えるため。 */
  async function room() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const e = await navigator.storage.estimate();
    return { quota: e.quota, usage: e.usage,
             persisted: navigator.storage.persisted ? await navigator.storage.persisted() : null };
  }

  /** すべて消します。鍵ごと。戻せません。 */
  async function wipe() {
    await tx("readwrite", (s) => s.clear());
    localStorage.removeItem(LOCK_KEY);
    lock();
    return true;
  }

  KN.diary = {
    isNew, isOpen, createKey, unlock, lock,
    get, put, remove, month, datesOfMonth, count, span, search, putMany,
    exportSealed, importSealed, room, wipe,
    ITER,
  };
})();
