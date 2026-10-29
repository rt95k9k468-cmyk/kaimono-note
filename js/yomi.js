/* js/yomi.js — 変換前の平仮名で、漢字の言葉を引く
 *
 * 「なっと」と打っている途中（下線が出ている、まだ変換していない字）でも、
 * 前に書いた「納豆」を候補に出すための一枚。読みの辞書は持たず、**この端末で
 * 打ったときの変換を覚える**：変換の途中の平仮名（compositionupdate）と、
 * 決まった字（compositionend）の組を控える。覚えるのは `data-yomi` の付いた
 * 欄（候補を出す欄）だけ——日記や手紙の字は覚えない。
 *
 * 控えは記録の外（`kaimono-note-yomi`。書き出し・自動の控えに乗せない）。
 * 消えても候補が漢字に当たりにくくなるだけで、何も失わない。
 */
(function () {
  "use strict";
  const KEY = "kaimono-note-yomi", MAX = 800;
  const fold = (s) => KN.util.foldKana(s);
  const KANA = /^[ぁ-ゖァ-ヺー・\s]+$/;
  const KANJI = /[㐀-鿿々〆ヶ]/;

  let map = null;     // 決まった字 → 読み（ひらがな）。古いものから並ぶ
  let byHead = null;  // 頭の一字 → その字で始まる言葉（長い順）
  const cache = new Map();

  function load() {
    if (map) return map;
    map = new Map();
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (o && typeof o === "object") Object.keys(o).forEach((w) => { if (typeof o[w] === "string") map.set(w, o[w]); });
    } catch (e) { /* 読めなければ空から */ }
    return map;
  }
  function index() {
    if (byHead) return byHead;
    byHead = new Map();
    load().forEach((r, w) => {
      const a = byHead.get(w[0]) || [];
      a.push(w);
      byHead.set(w[0], a);
    });
    byHead.forEach((a) => a.sort((x, y) => y.length - x.length));
    return byHead;
  }

  function learn(word, kana) {
    word = String(word || "").trim();
    kana = fold(kana);
    if (!word || !kana || word.length > 16 || kana.length > 32 || !KANJI.test(word)) return;
    const m = load();
    if (m.get(word) === kana) return;
    m.delete(word);
    m.set(word, kana);
    while (m.size > MAX) m.delete(m.keys().next().value);
    byHead = null;
    cache.clear();
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(m))); } catch (e) { /* 満杯なら覚えない */ }
  }

  /** 覚えた変換で、言葉を読みに直す（知らない字はそのまま）。折った形で返す。 */
  function reading(s) {
    s = String(s || "");
    if (!s || !KANJI.test(s)) return fold(s);
    if (cache.has(s)) return cache.get(s);
    const ix = index(), m = load();
    let out = "", i = 0;
    while (i < s.length) {
      const hit = (ix.get(s[i]) || []).find((w) => s.startsWith(w, i));
      if (hit) { out += m.get(hit); i += hit.length; } else { out += s[i]; i++; }
    }
    const r = fold(out);
    if (cache.size > 2000) cache.clear();
    cache.set(s, r);
    return r;
  }

  /** 打ちかけの q で word が引けるか。0＝頭が合う・1＝中に含む・-1＝当たらない。 */
  function hit(word, q) {
    const fq = fold(q);
    if (!fq) return -1;
    const k = fold(word);
    if (k.startsWith(fq)) return 0;
    const r = reading(word), rq = reading(q);
    if (r.startsWith(rq)) return 0;
    return k.includes(fq) || r.includes(rq) ? 1 : -1;
  }

  /* 覚えるのは data-yomi の付いた欄だけ。変換の途中の平仮名のうち、最後のもの
     （ライブ変換で途中から漢字になる手では、その手前まで）を読みとする。 */
  let kana = "";
  const mine = (e) => e.target && e.target.closest && e.target.closest("[data-yomi]");
  document.addEventListener("compositionstart", (e) => { if (mine(e)) kana = ""; }, true);
  document.addEventListener("compositionupdate", (e) => {
    if (mine(e) && e.data && KANA.test(e.data)) kana = e.data;
  }, true);
  document.addEventListener("compositionend", (e) => {
    if (!mine(e)) return;
    if (e.data && kana && e.data !== kana) learn(e.data, kana);
    kana = "";
  }, true);

  KN.yomi = { hit, reading, learn };
})();
