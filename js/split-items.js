/* js/split-items.js — 一行に並べたものを、分けて入れる（docs/roadmap.md の R1）
 *
 * 「牛乳、卵、パン」と打ったら、三つの品物として入る。それだけの一枚です。
 *
 * **ここは純粋な部品です。** DOM も store も触らず、字を受け取って
 * 「いくつに分けるか」を返すだけ。画面の側（screen-list.js・screen-todo.js）が
 * 分けたものを入れ、トーストに「ひとつにする」を置きます——読むことと入れる
 * ことを分けておくと、分け違いを表で追い込めます（when-parse.js と同じ考えかた。
 * 表は tests/split-items.js）。
 *
 * ## 分けかたの決めごと
 *
 * - **買うもの**は、読点（、）・カンマ（, ，）・改行で分ける。
 * - **やること**は、**改行だけ**で分ける。「銀行、郵便局に寄る」は一件の用事。
 * - **「・」では分けない。** 「ハム・ソーセージ」は一つの品物の名前として
 *   打たれることが多い。
 * - **数字に挟まれたカンマは区切りではない**（「1,000円」）。
 * - **登録済みの品物の名前に読点が入っていれば、その名前は分けない**
 *   （`known` に名前を渡す）。いちばん長く合うものを先に取る。
 * - 分けても一つにしかならないなら、分けない（一つだけ返す。画面の側は二つ以上の
 *   ときだけ分けて入れる）。
 */
(function () {
  const KN = (window.KN = window.KN || {});

  // 区切りそのものも残す（登録済みの名前を、元の区切りで組み直して照らすため）。
  const SHOP_SEP = /(\s*(?:[、，,､]|\r?\n|\r)+\s*)/;
  const LINE_SEP = /\r?\n|\r/;
  const DIGIT_COMMA = /(\d)([,，])(?=\d)/g;
  // 私用の字（打たれることはない）。半角と全角で分けて、元の字へ戻す。
  const HOLD = { ",": "\uE000", "，": "\uE001" };

  /* 名前の照らし方は store.findProductByName と同じ（前後の空きを落として、
     小文字にそろえる）。ここで違う照らし方をすると、分けないはずの名前を分ける。 */
  const norm = (s) => String(s).trim().toLowerCase();

  /**
   * 買うもの。@param {string} text @param {Iterable<string>} [known] 登録済みの名前
   * @returns {string[]} 分けた名前（二つ以上のときだけ分けてある）
   */
  function shop(text, known) {
    const raw = String(text || "");
    const whole = raw.trim();
    if (!whole) return [];
    const names = new Set();
    for (const n of known || []) {
      const k = norm(n);
      if (k) names.add(k);
    }
    /* 登録済みの名前と丸ごと同じなら、そもそも分けない。 */
    if (names.has(norm(whole))) return [whole];

    const held = raw.replace(DIGIT_COMMA, (m, d, c) => d + HOLD[c]);
    const bits = held.split(SHOP_SEP);          // [字, 区切り, 字, 区切り, 字 …]
    const toks = [];
    const seps = [];
    bits.forEach((b, i) => (i % 2 ? seps : toks).push(b));

    const back = (s) => s.split(HOLD[","]).join(",").split(HOLD["，"]).join("，");
    const out = [];
    let i = 0;
    while (i < toks.length) {
      let take = i;
      /* いちばん長く合う登録済みの名前を先に取る（区切りも元のまま組み直す）。 */
      if (names.size) {
        for (let j = toks.length - 1; j > i; j--) {
          let cand = toks[i];
          for (let k = i + 1; k <= j; k++) cand += seps[k - 1] + toks[k];
          if (names.has(norm(back(cand)))) { take = j; break; }
        }
      }
      let piece = toks[i];
      for (let k = i + 1; k <= take; k++) piece += seps[k - 1] + toks[k];
      piece = back(piece).trim();
      if (piece) out.push(piece);
      i = take + 1;
    }
    return out.length ? out : [whole];
  }

  /**
   * やること。改行だけで分ける。@returns {string[]}
   */
  function todo(text) {
    const whole = String(text || "").trim();
    if (!whole) return [];
    const lines = whole.split(LINE_SEP).map((s) => s.trim()).filter(Boolean);
    return lines.length >= 2 ? lines : [lines.join(" ")];
  }

  KN.splitItems = { shop, todo };
})();
