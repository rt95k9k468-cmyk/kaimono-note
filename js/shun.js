/* =========================================================
   くらしノート — 旬の表（roadmap-3.1 の K4）

   品物の紙の頭に「旬 9〜10月」と事実を一行出すための、小さな表。
   鍵は絵の辞書の鍵（`product-icons.js` の KEYS）。月は**概数**——旬は地域と
   年で揺れるので、公の案内（農林水産省ほか）と照らして、店に多く並ぶ月を持つ。
   通年並ぶもの（玉ねぎ・キャベツ・バナナほか）と、輸入の多いものは持たない。

   一つの鍵に旬の違うものが束ねてあるもの（`fish` の さんま と ぶり）は、
   鍵ではなく**名前の言葉**で引く（`BY_WORD`）。束の名だけ（「魚」）なら出さない。

   借りない：「旬だから買いましょう」の提案・献立。行の絵には印を付けない。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  /* [始まりの月, 終わりの月]。年をまたぐときは 始まり > 終わり（11〜2月）。
     二つの季節があるものは二組。 */
  const BY_KEY = {
    /* 野菜 */
    tomato: [[6, 8]], cucumber: [[6, 8]], sweetPotato: [[9, 11]], corn: [[6, 9]],
    eggplant: [[6, 9]], pepper: [[6, 9]], broccoli: [[11, 3]], chineseCabbage: [[11, 2]],
    spinach: [[11, 2]], springOnion: [[11, 2]], asparagus: [[4, 6]], daikon: [[11, 2]],
    burdock: [[11, 1]], turnip: [[3, 5], [10, 12]], lotusRoot: [[11, 2]], pumpkin: [[7, 9]],
    zucchini: [[6, 8]], okra: [[7, 9]], bambooShoot: [[3, 5]], yam: [[11, 2]],
    peas: [[4, 6]], cauliflower: [[11, 3]], bittergourd: [[7, 9]], edamame: [[7, 9]],
    shiso: [[6, 9]], myoga: [[7, 9]], snapPeas: [[4, 6]], winterMelon: [[7, 9]],
    /* 果物 */
    apple: [[9, 11]], strawberry: [[12, 4]], grape: [[8, 10]], peach: [[7, 8]],
    watermelon: [[7, 8]], melon: [[6, 8]], cherry: [[6, 7]], blueberry: [[6, 8]],
    mango: [[6, 8]], persimmon: [[10, 11]], fig: [[8, 10]], chestnut: [[9, 10]],
    loquat: [[5, 6]], apricot: [[6, 7]], kumquat: [[1, 3]],
    /* 魚・貝 */
    crab: [[11, 2]], shirasu: [[3, 5], [9, 10]],
  };

  /* 束ねた鍵は言葉で。言葉は畳んだ形（ひらがな）で比べる。 */
  const BY_WORD = {
    fish: [
      [["鮭", "しゃけ", "さけ"], [[9, 11]]],
      [["さば", "鯖"], [[10, 1]]],
      [["鰺", "あじ"], [[5, 7]]],
      [["ぶり", "鰤"], [[12, 2]]],
      [["鱈", "たら"], [[12, 2]]],
      [["ひらめ"], [[12, 2]]],
      [["ししゃも"], [[10, 11]]],
      [["さんま", "秋刀魚"], [[9, 10]]],
      [["鯛", "まだい"], [[3, 5]]],
      [["いわし"], [[6, 9]]],
      [["かつお"], [[4, 5], [9, 10]]],
    ],
    shellfish: [
      [["あさり"], [[3, 5]]],
      [["しじみ"], [[7, 8]]],
      [["牡蠣"], [[11, 2]]],
    ],
    orange: [[["みかん", "蜜柑"], [[11, 1]]]],
    pear: [
      [["らふらんす"], [[10, 12]]],
      [["梨"], [[8, 10]]],
    ],
  };

  /** 品物の旬の月（[[始, 終], …]）。分からなければ null。
      絵を手で選んでいればその鍵、無ければ名前から引いた鍵（カテゴリの名前には寄らない）。 */
  function months(product) {
    if (!product || !KN.productIcons) return null;
    const name = product.name || "";
    const key = (product.icon && (BY_KEY[product.icon] || BY_WORD[product.icon]))
      ? product.icon : KN.productIcons.findKey(name);
    if (!key) return null;
    if (BY_KEY[key]) return BY_KEY[key];
    const words = BY_WORD[key];
    if (!words) return null;
    const f = KN.util.foldRuns(name);
    for (const [ws, m] of words) {
      if (ws.some((w) => KN.util.wordAt(f, KN.util.foldKana(w)) >= 0)) return m;
    }
    return null;
  }

  /** 「旬 9〜10月」「旬 4〜5月・9〜10月」。無ければ ""。 */
  function label(product) {
    const m = months(product);
    if (!m) return "";
    return "旬 " + m.map(([a, b]) => (a === b ? `${a}月` : `${a}〜${b}月`)).join("・");
  }

  KN.shun = { months, label, BY_KEY, BY_WORD };
})();
