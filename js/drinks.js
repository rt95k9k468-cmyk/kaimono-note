/* =========================================================
   くらしノート — お酒
   =========================================================

   「ビール350mlを2本」と書けば、それだけで済むようにします。
   毎晩のことなので、種類を選んで、量を選んで、本数を選んで……を
   三回繰り返させると、三日でやめます。

   書いたものは **そのまま残します**（raw）。読み取りはいつか直しますが、
   本人が書いた文はもう二度と手に入らないからです。読み違えていたときも、
   元の文が残っていれば後から直せます。

   ---- 純アルコール量 ----

     g = ml × 度数(%) ÷ 100 × 0.8

   0.8 はエタノールの比重です。厚生労働省の「節度ある適度な飲酒」の
   説明もこの式で、ビール500ml（5%）＝20g と数えます。

   ---- カロリー ----

   アルコールそのものは 1g あたり約7kcal。ただし飲みものはアルコール
   だけでできてはいません——ビールには糖質があり、蒸留酒にはほとんど
   ありません。だから「純アルコール×7」だけで済ませると、ビールは
   低めに出ます。種類ごとの 100ml あたりの目安を持っておいて、それが
   あるならそちらを使います。

   どちらにしても **推定です**。度数を書かなかったなら、なおさら
   推定です。estimated の印を付けて持ち、画面では「約」と書きます。
   量った値と推した値が同じ顔で並ぶと、記録全体の信頼度は低いほうへ
   揃ってしまうので。 */
(function () {
  "use strict";

  const KN = window.KN;

  /* 種類ごとの目安。度数は日本で売られているものの真ん中あたり、
     kcal100 は 100ml あたりのエネルギー（文部科学省の食品成分表の
     アルコール飲料の値をもとにした概数）。

     words は書き方のゆれ。長いものから当てるので、「黒ビール」は
     「ビール」より先に当たります。 */
  const KINDS = [
    { id: "beer",     label: "ビール",     abv: 5,    kcal100: 40,
      words: ["ビール", "びーる", "발포", "発泡酒", "第三のビール", "黒ビール", "エール", "ipa", "ラガー", "beer"] },
    { id: "highball", label: "ハイボール", abv: 7,    kcal100: 50,
      words: ["ハイボール", "はいぼーる", "highball"] },
    { id: "chuhai",   label: "チューハイ", abv: 6,    kcal100: 50,
      words: ["チューハイ", "酎ハイ", "ちゅーはい", "サワー", "さわー", "ストロング"] },
    { id: "wine",     label: "ワイン",     abv: 12,   kcal100: 73,
      words: ["ワイン", "わいん", "赤ワイン", "白ワイン", "ロゼ", "スパークリング", "シャンパン", "wine"] },
    { id: "sake",     label: "日本酒",     abv: 15,   kcal100: 103,
      words: ["日本酒", "にほんしゅ", "清酒", "純米", "吟醸", "sake"] },
    { id: "shochu",   label: "焼酎",       abv: 25,   kcal100: 144,
      words: ["焼酎", "しょうちゅう", "芋焼酎", "麦焼酎", "泡盛", "shochu"] },
    { id: "whisky",   label: "ウイスキー", abv: 40,   kcal100: 237,
      words: ["ウイスキー", "ウィスキー", "うぃすきー", "バーボン", "スコッチ", "whisky", "whiskey"] },
    { id: "plum",     label: "梅酒",       abv: 13,   kcal100: 156,
      words: ["梅酒", "うめしゅ"] },
    { id: "cocktail", label: "カクテル",   abv: 8,    kcal100: 70,
      words: ["カクテル", "モヒート", "ジントニック", "カシスオレンジ", "カシオレ", "サングリア"] },
    { id: "gin",      label: "ジン",       abv: 40,   kcal100: 284,
      words: ["ジン", "ウォッカ", "ウオッカ", "ラム", "テキーラ", "gin", "vodka"] },
    { id: "other",    label: "お酒",       abv: 8,    kcal100: 60, words: [] },
  ];

  const byId = (id) => KINDS.find((k) => k.id === id) || KINDS[KINDS.length - 1];

  /* 「一杯」がどれくらいか。種類で違います——ビールの一杯と
     ウイスキーの一杯（シングル）を同じ量で数えるわけにはいきません。 */
  const GLASS = {
    beer: 350, highball: 350, chuhai: 350, wine: 120, sake: 180,
    shochu: 90, whisky: 30, plum: 90, cocktail: 150, gin: 30, other: 200,
  };
  /* 「一本」も同じく。缶ビールは350、ワインの一本は750。 */
  const BOTTLE = {
    beer: 350, highball: 350, chuhai: 350, wine: 750, sake: 720,
    shochu: 720, whisky: 700, plum: 720, cocktail: 350, gin: 700, other: 350,
  };

  /* 頼み方が量を言っていることがあります。「ダブル」は60ml、「中ジョッキ」は
     500ml——ここを見ないと、「ウイスキーをダブルで」が一本ぶんになります。 */
  const SERVING = [
    [/大ジョッキ/, 700], [/中ジョッキ|ジョッキ/, 500], [/小ジョッキ/, 350],
    [/大瓶/, 633], [/中瓶/, 500], [/小瓶/, 334],
    [/ダブル|ダブ/, 60], [/シングル/, 30],
    [/ロング缶|500缶/, 500], [/ショート缶/, 350],
  ];

  /* 「ストロング系」は度数が倍近く違います。同じチューハイとして
     6%で数えると、純アルコール量が3割以上ずれます。 */
  const STRONG = /ストロング|strong|9%|９%/i;

  /* 頼み方や飲み方の言葉。銘柄として拾ってしまうと、記録が
     「ロック 梅酒」のような読みにくい名前になります。 */
  const SERVE_WORDS = /ロック|水割り|お湯割り|ソーダ割り|炭酸割り|ストレート|大ジョッキ|中ジョッキ|小ジョッキ|ジョッキ|大瓶|中瓶|小瓶|ダブル|シングル|生中|生|ハーフ/g;

  /* 飲んでいない、と書いたとき。ここを読み落として「お酒」として
     記録すると、飲んでいない日が飲んだ日になります。 */
  const NONE = /(飲|呑|の)(ん|ま|み)?(で|は)?(い)?な(い|かった)|飲まず|禁酒|休肝|抜き|ゼロ|0本|なし|無し|ノンアル|ノンアルコール/;

  const KANJI = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };

  const fold = (s) => KN.util.foldKana(String(s || ""));

  /* 長い言葉から先に当てます。「赤ワイン」を「ワイン」で切ってしまうと、
     銘柄として残るはずの「赤」が迷子になります。 */
  const WORDS = KINDS
    .flatMap((k) => k.words.map((w) => [fold(w), k]))
    .sort((a, b) => b[0].length - a[0].length);

  function kindOf(text) {
    const t = fold(text);
    for (const [w, k] of WORDS) if (t.includes(w)) return k;
    return null;
  }

  /* ---------------- 書いたものを読む ----------------

     一行に何種類も書けます（「ビール2本とワイン半分」）。
     区切りは「と」「、」「＋」「,」。ただし「と」は言葉の中にも出るので、
     酒の名前が二つ以上あるときだけ切ります。 */

  function splitParts(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    // まず、はっきりした区切りで。
    let parts = raw.split(/[、,，＋+]|\s＋\s|\n/).map((x) => x.trim()).filter(Boolean);
    // 「と」は、切った先の両方に酒の名前があるときだけ切ります。
    const out = [];
    parts.forEach((p) => {
      const pieces = p.split(/と(?=[^と]*$)|と/);
      if (pieces.length > 1 && pieces.every((x) => kindOf(x))) out.push(...pieces.map((x) => x.trim()));
      else out.push(p);
    });
    return out.filter(Boolean);
  }

  /** 数字。「2」「２」「二」「半」。 */
  function num(s) {
    if (s == null) return null;
    const t = String(s).trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    if (KANJI[t] != null) return KANJI[t];
    return null;
  }

  /**
   * 一つぶんを読みます。
   * @returns {object|null} 読めた一杯ぶん。何も分からなければ null。
   */
  function parseOne(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const t = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

    // 飲んでいない、と書いてあるなら、何も作りません。
    if (NONE.test(t) && !/\d/.test(t.replace(/0/g, ""))) return null;

    /* 銘柄だけを書くことがあります（「アサヒスーパードライ 350ml 2本」）。
       種類が分からなくても、量か数が書いてあるなら、それはお酒の話です。
       読めなかったことにして捨てるより、「お酒」として残すほうがいい——
       あとから種類を直せますが、捨てた記録は戻りません。 */
    const looksLikeDrink = /(\d|[一二三四五六七八九十半])\s*(ml|mL|cc|l|L|本|缶|杯|合|グラス)/.test(t);
    const kind = kindOf(t)
      || (/(酒|さけ|飲|呑|のん)/.test(fold(t)) || looksLikeDrink ? byId("other") : null);
    if (!kind) return null;

    let estimated = false;

    // 度数。「5%」「5度」「アルコール7」
    let abv = null;
    const mAbv = /(\d+(?:\.\d+)?)\s*(?:%|％|度(?!数)|パーセント)/.exec(t);
    if (mAbv) abv = Number(mAbv[1]);
    // ストロング系は度数が倍近く違う。同じ種類として数えるとずれます。
    if (abv == null && kind.id === "chuhai" && STRONG.test(t)) { abv = 9; estimated = true; }
    if (abv == null) { abv = kind.abv; estimated = true; }

    // 容量。「350ml」「500cc」「1.5L」「一合」
    let ml = null;
    const mMl = /(\d+(?:\.\d+)?)\s*(ml|mL|ｍｌ|cc|CC)/.exec(t);
    const mL = /(\d+(?:\.\d+)?)\s*(l|L|リットル|ℓ)(?![a-z])/.exec(t);
    const mGo = /([\d一二三四五六七八九十半]+)\s*合/.exec(t);
    if (mMl) ml = Number(mMl[1]);
    else if (mL) ml = Number(mL[1]) * 1000;
    else if (mGo) { const g = num(mGo[1]); if (g != null) ml = g * 180; }   // 一合＝180ml
    else {
      // 頼み方が量を言っていることがあります（ダブル、中ジョッキ）。
      for (const [re, v] of SERVING) if (re.test(t)) { ml = v; estimated = true; break; }
    }

    // 数。「2本」「3杯」「×2」「2缶」「グラス2」
    let count = null;
    let unit = null;
    const mCount = /([\d一二三四五六七八九十半]+(?:\.\d+)?)\s*(本|杯|缶|グラス|ぱい|ハイ)/.exec(t);
    const mTimes = /(?:×|x|✕|かける)\s*(\d+(?:\.\d+)?)/.exec(t);
    if (mCount) { count = num(mCount[1]); unit = mCount[2] === "缶" ? "本" : (mCount[2] === "グラス" ? "杯" : mCount[2]); }
    else if (mTimes) { count = Number(mTimes[1]); unit = "本"; }

    // 「半分」「半」。容量が書いてあれば半分に、無ければ本数を0.5に。
    const half = /半分|はんぶん|(?:^|[^一二三四五六七八九十])半(?![分合])/.test(t);
    if (half && count == null) count = 0.5;

    if (count == null) { count = 1; if (!mMl && !mL && !mGo) estimated = true; }

    /* 容量が書かれていないときは、種類と数え方から推します。

       「本」「缶」と書いてあるなら瓶や缶ぶん。「杯」ならグラスぶん。
       **何も書いていないなら、一杯ぶん**です——人は普通、一本ではなく
       一杯から飲みはじめます。ここを瓶ぶんにしていたせいで、
       「ウイスキー ダブル」が700ml（純アルコール224g）になっていました。
       「半分」だけは瓶ぶん——半分と言うからには、容器が一つあります。 */
    if (ml == null) {
      const wantsBottle = unit === "本" || (half && !unit);
      ml = (wantsBottle ? BOTTLE[kind.id] : GLASS[kind.id]) || GLASS.other;
      estimated = true;
    }
    if (!unit) unit = half ? "本" : "杯";

    const volume = Math.round(ml * count * 10) / 10;
    const alcoholG = Math.round(volume * (abv / 100) * 0.8 * 10) / 10;
    /* 種類ごとの目安があるならそちらを。ビールは糖質のぶん、
       純アルコール×7 より高くなります。 */
    const kcal = kind.kcal100
      ? Math.round(volume * kind.kcal100 / 100)
      : Math.round(alcoholG * 7);

    /* 銘柄。種類を表す言葉と、数や単位を取り除いて残ったもの。
       「アサヒスーパードライ 350ml」の「アサヒスーパードライ」。 */
    let name = text;
    kind.words.forEach((w) => { name = name.replace(new RegExp(w, "gi"), " "); });
    name = name
      .replace(SERVE_WORDS, " ")
      .replace(/[\d０-９.一二三四五六七八九十半]+\s*(ml|mL|ｍｌ|cc|CC|l|L|リットル|ℓ|本|杯|缶|グラス|合|%|％|度)/gi, " ")
      .replace(/[×x✕]\s*[\d０-９.]+/gi, " ")
      .replace(/半分|はんぶん|を|の|と|、|,|　/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length > 24) name = name.slice(0, 24);

    return {
      kind: kind.id,
      kindLabel: kind.label,
      name: name || "",
      ml: Math.round(ml * 10) / 10,
      count,
      unit,
      volumeMl: volume,
      abv,
      alcoholG,
      kcal,
      estimated,
      raw: text,
    };
  }

  /**
   * 一行ぜんぶ。「ビール2本とワイン半分」→ 二つ。
   * @returns {{items: Array, unknown: number}}
   */
  function parse(text) {
    const parts = splitParts(text);
    const items = [];
    let unknown = 0;
    parts.forEach((p) => {
      const one = parseOne(p);
      if (one) items.push(one); else if (p.trim()) unknown++;
    });
    // 何も切り出せなかったが、一行としてなら読めることがあります。
    if (!items.length) {
      const one = parseOne(text);
      if (one) { items.push(one); unknown = 0; }
    }
    return { items, unknown };
  }

  /** 一つぶんの、読んで分かる言い方。「ビール 350ml × 2本」 */
  function describeItem(it) {
    if (!it) return "";
    const head = [it.name, it.kindLabel].filter(Boolean).join(" ");
    const n = it.count === 1 ? "" : ` × ${trim(it.count)}${it.unit}`;
    /* 一杯ぶんの ml を持たない記録（外から入ったものなど）は、合計から
       割り戻します。そのまま書くと「0ml」の行が残って、何を飲んだのかが
       読めなくなります。 */
    const ml = it.ml || (it.count ? (it.volumeMl || 0) / it.count : it.volumeMl) || 0;
    return `${head} ${trim(ml)}ml${n}`;
  }

  const trim = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

  /** その日ぶんの合計。 */
  function totals(list) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) return null;
    const t = { volumeMl: 0, alcoholG: 0, kcal: 0, kinds: 0, estimated: false, count: rows.length };
    const kinds = new Set();
    rows.forEach((r) => {
      t.volumeMl += r.volumeMl || 0;
      t.alcoholG += r.alcoholG || 0;
      t.kcal += r.kcal || 0;
      kinds.add(r.kind);
      if (r.estimated) t.estimated = true;
    });
    t.volumeMl = Math.round(t.volumeMl);
    t.alcoholG = Math.round(t.alcoholG * 10) / 10;
    t.kcal = Math.round(t.kcal);
    t.kinds = kinds.size;
    return t;
  }

  /* 節度の目安。断定はしません——「純アルコール20g程度」は健康日本21の
     言い方で、個人差も体格差もあります。数を出すだけにして、良し悪しは
     言いません。 */
  const GUIDE_G = 20;

  /* ---------------- そのときの気分 ----------------

     何を飲んだかだけでは、なぜ飲んだかは分かりません。「疲れた」「付き合い」
     「うれしい」——そこに繰り返しがあるなら、それは量より先に見るべきものです。

     **選択肢は用意しません。** よくある言葉を五つ並べておくのは簡単ですが、
     並べた瞬間、人はその中から選びます。自分の言葉ではなく、こちらが用意した
     言葉で自分の飲み方を記録することになる。しかもそれは、たいてい少しずつ
     ずれています（「付き合い」と「断れなかった」は違う）。

     だから、はじめは空欄だけです。書いた言葉をそのまま覚えて、次からは
     それを押せるようにします。二度目からは、自分の言葉が並びます。 */

  const MOOD_MAX_LEN = 12;   // これより長いものは「文」で、札にはなりません

  /**
   * これまでに書いた言葉から、押せる札を作ります。
   * @param {Array} list これまでのお酒の記録
   * @param {number} [max] いくつまで
   * @returns {Array<{word:string, n:number}>} よく書いた順
   */
  function moodSuggestions(list, max) {
    const rows = Array.isArray(list) ? list : [];
    const count = new Map();
    const last = new Map();
    const bump = (w, at) => {
      const word = String(w || "").trim();
      if (!word || word.length > MOOD_MAX_LEN) return;
      count.set(word, (count.get(word) || 0) + 1);
      const t = String(at || "");
      if (!last.has(word) || t > last.get(word)) last.set(word, t);
    };
    rows.forEach((r) => {
      (Array.isArray(r.moodTags) ? r.moodTags : []).forEach((t) => bump(t, r.at));
      // 短く書いた自由入力は、それ自体が札の候補です。
      bump(r.mood, r.at);
    });
    return [...count.entries()]
      .map(([word, n]) => ({ word, n }))
      .sort((a, b) => b.n - a.n || String(last.get(b.word)).localeCompare(String(last.get(a.word))))
      .slice(0, max || 5);
  }

  KN.drinks = {
    KINDS, GLASS, BOTTLE, GUIDE_G, MOOD_MAX_LEN,
    kindOf, byId, parse, parseOne, describeItem, totals, moodSuggestions,
  };
})();
