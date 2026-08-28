/* =========================================================
   くらしノート — 日記の鍵と封

   ここだけを、アプリと**取り込みの道具**（tools/diary-import.html）の
   両方が読みます。

   分けた理由は一つです。道具のほうは、数年ぶんの日記を暗号化して控えを
   作ります。その控えをアプリが開けなければ意味がありません——つまり
   二か所が**まったく同じ作り**でなければならない。同じものを二度書けば、
   いつか片方だけ直します。回数を 600,000 から 210,000 に落とすような
   一行の差が、そのときは通って、数年後に「開かない控え」として出てきます。

   だからここは一枚。ここを直せば両方が同時に変わります。

   IndexedDB も画面も知りません。知っているのは
   「パスフレーズ → 鍵」「鍵 → 包む・開ける」だけです。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  /* PBKDF2 の回数。OWASP が SHA-256 に対して挙げている 600,000 回。
     iPhone で 0.3〜1秒ほどかかります——**遅いことが目的**です。ここが速いと
     総当たりも速くなります。開くときに一度だけ払う代金で、体感には出ません
     （導いた鍵は記憶の上に置いたまま使い回します）。

     控えの中にも回数を書き残します（lock.iter）。将来この数を増やしたとき、
     古い控えは古い回数で開けなければならないからです。 */
  const ITER = 600000;
  const SALT_LEN = 16;
  const IV_LEN = 12;                 // AES-GCM の推奨長
  /* 封に入れる決まり文句。鍵が合っているかを、本文ではなくこれで試します
     ——本文で試すと、「中身が壊れた」のか「鍵が違う」のかが区別できません。 */
  const CHECK_TEXT = "kaimono-note-diary-v1";

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const subtle = () => (window.crypto && window.crypto.subtle) || null;

  /* Uint8Array ↔ base64。JSON にそのまま入る形にします——控えは一つの
     テキストファイルとして持ち歩くので、途中でバイト列のままにできません
     （そのぶん 4/3 に膨らみます。13MB / 899MB なので払えます）。 */
  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    /* 一度に渡すと、大きい配列で「引数が多すぎる」と言われます。
       数万バイトずつに刻みます。 */
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(passphrase, salt, iter) {
    const s = subtle();
    if (!s) throw new Error("この端末は WebCrypto を持っていません");
    const material = await s.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return s.deriveKey(
      { name: "PBKDF2", salt, iterations: iter || ITER, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,                          // 取り出せない鍵。書き出す用途は無い
      ["encrypt", "decrypt"]
    );
  }

  async function seal(key, text) {
    /* iv は一件ごとに引き直します。AES-GCM で同じ鍵に同じ iv を二度使うと、
       二つの暗号文を並べただけで中身が漏れます。ここは「たまたま同じ」も
       起きないように、毎回 crypto.getRandomValues から取ります。 */
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function open(key, blob) {
    const plain = await subtle().decrypt(
      { name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct));
    return dec.decode(plain);
  }

  /**
   * 鍵をあたらしく作ります。
   * @returns {{lock: object, key: CryptoKey}} lock は保存してよいもの
   *   （塩と封と回数。どれも秘密ではありません）。key は保存してはいけません。
   */
  async function makeLock(passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const key = await deriveKey(passphrase, salt, ITER);
    const check = await seal(key, CHECK_TEXT);
    return { lock: { v: 1, salt: b64(salt), iter: ITER, check }, key };
  }

  /**
   * 合言葉で開けます。違えば null——例外にしないのは、**打ち間違いは事故
   * ではなく、ふつうに起きること**だからです。呼ぶ側が try で囲まずに
   * 「違いました」と出せるように。
   */
  async function openLock(lock, passphrase) {
    if (!lock || !lock.salt || !lock.check) return null;
    const key = await deriveKey(passphrase, unb64(lock.salt), lock.iter || ITER);
    try {
      if (await open(key, lock.check) !== CHECK_TEXT) return null;
    } catch (e) {
      return null;                    // AES-GCM は鍵が違えば必ずここで落ちます
    }
    return key;
  }

  KN.diaryCrypto = { ITER, CHECK_TEXT, b64, unb64, deriveKey, seal, open, makeLock, openLock };
})();
