/* =========================================================
   くらしノート — state, persistence, selectors
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { uid, today, todayKey, foldKana } = KN.util;

  const KEY = "kaimono-note-v2";
  const LEGACY_KEY = "kaimono-note-v1";
  const SCHEMA = 2;

  /* ---------------- defaults ---------------- */

  /* Each category carries a colour. It tints the rows of everything in it, so
     a glance down the list groups itself without reading a word. Mid-tone
     hues on purpose: they are mixed into the card surface at a low percentage,
     and a colour that is already pale has nothing left to give in light mode
     while a dark one goes muddy against the dark surface. */
  const CATEGORY_COLORS = [
    "#5ea55a", "#d4695f", "#d79a4a", "#5b9bd5", "#4fb3c4",
    "#9b7ede", "#48b39a", "#e07fa8", "#8d968f", "#c2853f", "#7a8fd4",
  ];

  const DEFAULT_CATEGORIES = [
    { id: "c-veg",    name: "野菜・くだもの", emoji: "🥬", color: "#5ea55a" },
    { id: "c-meat",   name: "肉・魚",         emoji: "🐟", color: "#d4695f" },
    { id: "c-food",   name: "食品",           emoji: "🍞", color: "#d79a4a" },
    { id: "c-cold",   name: "冷蔵・冷凍",     emoji: "🧊", color: "#5b9bd5" },
    { id: "c-drink",  name: "飲みもの",       emoji: "🥤", color: "#4fb3c4" },
    { id: "c-daily",  name: "日用品",         emoji: "🧴", color: "#9b7ede" },
    { id: "c-clean",  name: "掃除・洗剤",     emoji: "🧻", color: "#48b39a" },
    { id: "c-health", name: "薬・衛生",       emoji: "💊", color: "#e07fa8" },
    { id: "c-other",  name: "その他",         emoji: "📦", color: "#8d968f" },
  ];

  const STORE_COLORS = [
    "#3b82f6", "#f59e0b", "#10b981", "#ef4444",
    "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
    "#6366f1", "#84cc16",
  ];

  const OTHER_CATEGORY = "c-other";

  function emptyState() {
    return {
      schema: SCHEMA,
      categories: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })),
      stores: [],
      products: [],
      items: [],
      // やること。買い物とは別の暮らしの用事で、値段も店も持たない代わりに
      // 日付と繰り返しを持つ。
      todos: [],
      // Corrections the user has made by hand: folded product name → category.
      learned: {},
      /* ダイエット。買い物ともやることとも混ざらない、体の記録の置き場です。
         中身をひとつの入れ物にまとめてあるのは、「体重だけ消す」「食事だけ
         書き出す」がひとまとまりで済むから——そして、この機能を使わない人の
         保存データに、空の配列が五つも散らばらないためです。 */
      diet: emptyDiet(),
      /* daily。積み上がりと、その日の地の文の置き場です。ダイエットと同じく
         ひとつの入れ物にまとめてあります——「dailyだけ書き出す」がひとまとまりで
         済むのと、この機能を使わない人の保存データに空の配列が二つ散らばらない
         ようにするためです。 */
      archive: emptyArchive(),
      // layout: "rows" | "tiles" — one setting for both lists, because a
      // person who wants square tiles wants them on the screen they are
      // looking at, not on one of the two.
      /* showInsight は既定で false です。「気づいたこと」は、標本が足りない
         うちは当たり障りのないことしか言えません——出しておくと、画面の
         一等地を「大したことを言っていない枠」が占めます。要ると思ったときに
         設定から出せます。 */
      /* searchBar は既定で false です。探すのはたまにすることなのに、窓は
         いつも一等地に居座っていました。虫めがねを押せば出るので、置き
         っぱなしにする理由がありません。

         digest（daily の月のまとめ）は既定で true・下です——これまでも
         daily ログの下に出ていたので、いまお使いの方の画面が変わりません。
         要らない方は設定で消せます。 */
      settings: {
        theme: "auto", accent: "orange", showChecked: true, layout: "rows",
        showInsight: false, searchBar: false, showDigest: true, digestPos: "bottom",
      },
    };
  }

  /* ---------------- daily ----------------

     二つの入れ物に分けてあります。分けているのは **書く動機** です。

       entries … 積み上がるもの。読んだ・学んだ・考えた・した・変わった。
                 一つ一つが独立していて、日付は「いつのことか」でしかない。
       days    … その日の地の文。起きた時刻・寝た時刻と、一、二行の覚え書き。
                 一日に一つだけで、増えません。

     混ぜないのは、寿命が違うからです。entries は後から検索して掘り返す
     ものですが、days はその月を眺めるときの背景で、単独では読みません。

     **ここに goal も streak も置きません。** 目標値を持たせれば達成率が
     欲しくなり、連続日数を数えれば途切れが見えます。このアプリは積み上がりを
     残す場所で、達成度を測る場所ではないので、**そもそも型として持ちません**。
     後から足せてしまう形にしておくと、いつか足します。 */
  function emptyArchive() {
    return { entries: [], days: [] };
  }

  /* ---------------- 基調色 ----------------

     選べる基調色の一覧です。**実際の色は CSS が持ちます**（base.css の
     :root[data-accent="…"]）。ここにあるのは、id と名前と、設定画面の
     見本に出す一色だけ——同じ数値を二か所に書くと、片方だけ直したときに
     静かに食い違うので。

     id は data-accent の値になります。既定のオレンジだけは札を付けない
     ので（:root の素の値がそのまま効きます）、CSS 側に規則がありません。 */
  const ACCENTS = [
    { id: "orange", label: "オレンジ", swatch: "#d9662a" },
    { id: "green",  label: "みどり",   swatch: "#2f8f5b" },
    { id: "blue",   label: "あお",     swatch: "#2f72c4" },
    { id: "violet", label: "むらさき", swatch: "#7a5bd0" },
    { id: "rose",   label: "ももいろ", swatch: "#c8476f" },
  ];
  const cleanAccent = (v) => (ACCENTS.some((a) => a.id === v) ? v : "orange");

  /* 五つの種類。色は「意味」ではなく「見分け」のために持たせます——月の
     一覧で目が種類ごとにまとまるだけで、良し悪しは一切言いません。
     カテゴリの色（CATEGORY_COLORS）と同じ考え方で、同じ濃度で使います。 */
  const ARCHIVE_TYPES = [
    { id: "reading", label: "読書",   icon: "book",      color: "#5b9bd5", unit: "ページ" },
    { id: "study",   label: "学習",   icon: "edit",      color: "#48b39a", unit: "分" },
    { id: "seed",    label: "種",     icon: "sprout",    color: "#9b7ede", unit: "" },
    { id: "done",    label: "達成",   icon: "check",     color: "#5ea55a", unit: "" },
    { id: "change",  label: "変化",   icon: "trend",     color: "#c2853f", unit: "" },
  ];
  const archiveType = (id) => ARCHIVE_TYPES.find((t) => t.id === id) || ARCHIVE_TYPES[0];

  /* ---------------- ダイエット ----------------

     入れ物を四つに分けてあります。分けているのは種類ではなく **出どころ** です。

       weights  … 体重・体脂肪。手で書いたものと、ヘルスケアから来たものが
                  同じ並びに入りますが、source でどちらか分かります。
       meals    … 食事。人が書くものしかありません。
       foods    … その人だけの食品（表の値を直したもの、市販商品、AIの推定）。
       health   … 歩数・睡眠・運動など、機械が測ったもの。

     手で書いたものと機械が測ったものを、ひとつの配列に混ぜて後から
     見分けようとしないこと。混ぜると、取り込みのたびに「これは前に自分で
     書いたやつだろうか」を値で当てにいく羽目になり、いつか必ず外します。 */
  function emptyDiet() {
    return {
      weights: [],
      meals: [],
      foods: [],
      health: [],
      // お酒。食事とは別に持ちます——飲んだ量と純アルコール量は、
      // 食べたものの栄養とは別の軸で見るものなので。
      drinks: [],
      goal: {
        heightCm: null,
        targetKg: null,
        targetDay: null,
        // 一日の目安。null なら画面は「残り」を出しません——目標が無いのに
        // 「残り1800kcal」と出すのは、勝手に決めた線を事実のように言うことです。
        kcalTarget: null, pTarget: null, fTarget: null, cTarget: null,
        /* お酒の一日の目安（純アルコールg）。null なら 20g——厚生労働省の
           「節度ある適度な飲酒」の量です。40g（男性で生活習慣病のリスクを
           高めるとされる量）を目安に置きたい人もいるので、変えられます。 */
        alcoholG: null,
        /* からだの三つの目標（歩数・総消費kcal・睡眠分）。null なら
           5,000歩 / 1,600kcal / 5時間。

           ここは **届く高さ** に置いてあります。直近の平均を基準にすると、
           歩いた人ほど基準も上がって、いつまでも埋まらないリングになります
           ——頑張るほど遠のく目盛りは、目盛りとして間違っています。
           固定の線なら超えられますし、超えたぶんも見えます。 */
        stepsTarget: null, burnTarget: null, sleepTarget: null,
      },
      /* 最後にヘルスケアを取り込んだ時刻と、そのとき入った件数。
         lockedAt は「読めない便が届いた時刻」——iPhoneがロックされている
         あいだ、ショートカットは HealthKit を読めません。取り込めなかった
         ことを画面で言うために持ちます（入った時点で消えます）。 */
      sync: { lastAt: null, added: 0, updated: 0, lockedAt: null },
    };
  }

  const HEALTH_TYPES = [
    "steps", "distance", "activeEnergy", "restingEnergy",
    "workout", "sleep", "heartRate",
    /* 体脂肪率は、ふつうは体重の記録に寄り添って weights に入ります。
       ここにも居場所があるのは、体重を測らずに体脂肪だけ取れた日を
       捨てないためです。 */
    "bodyFat",
  ];
  /* 一日ぶんで一つに決まるもの。同じ日のぶんが二度来たら、後から来た
     ほうが正しい——朝7時に取り込んだ歩数より、夜に取り込んだ歩数の
     ほうが一日を写しています。逆にワークアウトは一日に何度もあるので、
     こちらは足していきます。 */
  const DAILY_TYPES = ["steps", "distance", "activeEnergy", "restingEnergy", "sleep", "heartRate", "bodyFat"];

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function posNum(v) { const n = num(v); return n != null && n > 0 ? n : null; }
  function dayStr(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }

  function cleanWeight(w, i) {
    const kg = posNum(w.kg);
    if (!kg || kg > 400) return null;
    return {
      id: w.id || uid("w"),
      day: dayStr(w.day) || today(),
      time: KN.util.isTime(w.time) ? w.time : null,
      kg: Math.round(kg * 100) / 100,
      // 体脂肪率。0 は「測れなかった」であって 0% ではないので、null に倒します。
      fat: (() => { const f = posNum(w.fat); return f != null && f < 80 ? Math.round(f * 10) / 10 : null; })(),
      memo: typeof w.memo === "string" ? w.memo : "",
      /* どんな条件で量ったか。体重は、食前か食後かで1kg近く、着ているか
         いないかで0.5kg以上ふつうに動きます。条件を書き留めておかないと、
         その差が「増えた」「減った」として並びに混ざります。

         書かなかったときは **null のまま** です——たいてい食前だろう、と
         こちらで埋めると、埋めた値がそのまま統計の材料になります。
         分からないものは分からないままにしておきます。 */
      meal: (w.meal === "before" || w.meal === "after") ? w.meal : null,
      clothed: w.clothed === true ? true : (w.clothed === false ? false : null),
      source: w.source === "health" ? "health" : "manual",
      externalId: typeof w.externalId === "string" ? w.externalId : null,
      importedAt: w.importedAt || null,
      createdAt: w.createdAt || new Date().toISOString(),
      order: typeof w.order === "number" ? w.order : i,
    };
  }

  /* "memo" は、朝昼夜間食に分けずに書き連ねる一日ぶんの控えです。
     前からある四つはそのまま残します——すでに書かれたものが、
     読めなくなったり別の時間帯に化けたりしないように。 */
  const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack", "memo"];

  function cleanMealItem(it) {
    const name = String(it && it.name || "").trim();
    if (!name) return null;
    return {
      name,
      grams: posNum(it.grams),
      kcal: Math.max(0, Math.round(num(it.kcal) || 0)),
      p: Math.max(0, Math.round((num(it.p) || 0) * 10) / 10),
      f: Math.max(0, Math.round((num(it.f) || 0) * 10) / 10),
      c: Math.max(0, Math.round((num(it.c) || 0) * 10) / 10),
      /* 食物繊維。前からある記録は持っていないので、null のままにします
         （0 と書くと「無かった」ではなく「0gだった」ことになります）。 */
      fiber: posNum(it.fiber),
      /* どの食事のぶんか。AIに食品ごとに推してもらうと、一日の合計だけでなく
         「朝がいくつ、夜がいくつ」まで数えられます。前からある明細は持って
         いないので null——区分の分からないものとして扱います。 */
      slot: MEAL_SLOTS.includes(it.slot) && it.slot !== "memo" ? it.slot : null,
      /* 「1パック」「茶碗1杯」のような、人が書いたままの量。g に直せない
         ことのほうが多いので、数にせず言葉のまま持ちます。 */
      amount: typeof it.amount === "string" ? it.amount.trim().slice(0, 40) : "",
      // どこから来た値か。base=成分表, user=自分で直した, product=市販品,
      // ai=写真からの推定。数字の重みが違うので、捨てずに持ちます。
      from: ["base", "user", "product", "ai", "manual"].includes(it.from) ? it.from : "manual",
      foodId: typeof it.foodId === "string" ? it.foodId : null,
      // 推定値かどうか。UIで「約」を付けるのはこの旗ひとつで決めます。
      estimated: it.estimated === true,
      /* 外部AIがWeb検索して確認した根拠・情報源（サイト名やURL）・確度。
         くらしノート自身は検索しません——ChatGPT等に貼って返ってきた
         行から、そのまま拾って残すだけです。無ければ空文字のまま
         （前からある記録もここは空文字になります）。 */
      basis: typeof it.basis === "string" ? it.basis.trim().slice(0, 200) : "",
      source: typeof it.source === "string" ? it.source.trim().slice(0, 300) : "",
      confidence: typeof it.confidence === "string" ? it.confidence.trim().slice(0, 20) : "",
    };
  }

  /* お酒の一杯。
     読み取りは直せますが、**本人が書いた文はもう手に入りません**。
     だから raw を必ず持ちます。あとで読み方を良くしたときに、
     古い記録も読み直せます。 */
  function cleanDrink(d) {
    if (!d || typeof d !== "object") return null;
    const kinds = (KN.drinks && KN.drinks.KINDS) || [];
    const kind = kinds.some((k) => k.id === d.kind) ? d.kind : "other";
    const label = String(d.kindLabel || "").trim()
      || ((kinds.find((k) => k.id === kind) || {}).label || "お酒");
    const volumeMl = Math.max(0, Math.round((num(d.volumeMl) || 0) * 10) / 10);
    if (!volumeMl) return null;
    return {
      id: d.id || uid("dr"),
      day: dayStr(d.day) || today(),
      time: KN.util.isTime(d.time) ? d.time : null,
      kind,
      kindLabel: label,
      name: String(d.name || "").trim().slice(0, 40),
      ml: Math.max(0, Math.round((num(d.ml) || 0) * 10) / 10),
      count: Math.max(0, Math.round((num(d.count) || 1) * 100) / 100) || 1,
      unit: ["本", "杯"].includes(d.unit) ? d.unit : "本",
      volumeMl,
      abv: Math.max(0, Math.round((num(d.abv) || 0) * 10) / 10),
      alcoholG: Math.max(0, Math.round((num(d.alcoholG) || 0) * 10) / 10),
      kcal: Math.max(0, Math.round(num(d.kcal) || 0)),
      // 推した値かどうか。画面で「約」を付けるのはこの旗ひとつで決めます。
      estimated: d.estimated !== false,
      /* そのときの気分。自由に書いたものと、押した札の両方を持ちます——
         自由入力だけでは数えられず、札だけでは実感が落ちるので。
         札の中身は、その人が書いた言葉から作られます（決め打ちしません）。 */
      mood: String(d.mood || "").trim().slice(0, 120),
      moodTags: (Array.isArray(d.moodTags) ? d.moodTags : [])
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .slice(0, 6),
      // 書いた文はそのまま残しますが、際限なく伸ばさないよう meal.ai.raw と
      // 同じ上限（4000字）で切ります。
      raw: typeof d.raw === "string" ? d.raw.slice(0, 4000) : "",
      at: d.at || new Date().toISOString(),
    };
  }

  /** AIの推計。何も無ければ null（「まだ聞いていない」と「0だった」は別）。 */
  function cleanMealAI(a) {
    if (!a || typeof a !== "object") return null;
    const raw = typeof a.raw === "string" ? a.raw.slice(0, 4000) : "";
    const out = {
      kcal: posNum(a.kcal), p: posNum(a.p), f: posNum(a.f), c: posNum(a.c),
      fiber: posNum(a.fiber), low: posNum(a.low), high: posNum(a.high),
      raw,
      at: a.at || new Date().toISOString(),
    };
    /* その日のエネルギー収支の評価・傾向分析など、外部AIが返した自由文。
       数とは別に持ちます——数は帯やグラフに使い、これは読みものとして
       そのまま出します。 */
    const analysis = typeof a.analysis === "string" ? a.analysis.trim().slice(0, 2000) : "";
    if (analysis) out.analysis = analysis;
    /* 区分ごとの合計。AIが「朝合計」まで書いてくれた日だけ入ります。
       食品ごとの区分が拾えなかった日でも、これがあれば帯を引けます。
       書かれていない区分は null のまま——0 にすると「食べなかった」に
       なってしまいます。 */
    const slots = {};
    let hasSlot = false;
    ["breakfast", "lunch", "dinner", "snack"].forEach((k) => {
      const v = posNum(a.slots ? a.slots[k] : null);
      slots[k] = v;
      if (v != null) hasSlot = true;
    });
    if (hasSlot) out.slots = slots;
    const anyNum = ["kcal", "p", "f", "c", "fiber", "low", "high"].some((k) => out[k] != null);
    return anyNum || hasSlot || raw || analysis ? out : null;
  }

  function cleanMeal(m, i) {
    const items = (Array.isArray(m.items) ? m.items : []).map(cleanMealItem).filter(Boolean);
    const ai = cleanMealAI(m.ai);
    if (!items.length && !ai && !String(m.memo || "").trim()) return null;
    return {
      id: m.id || uid("m"),
      day: dayStr(m.day) || today(),
      time: KN.util.isTime(m.time) ? m.time : null,
      slot: MEAL_SLOTS.includes(m.slot) ? m.slot : "snack",
      items,
      memo: typeof m.memo === "string" ? m.memo : "",
      /* AIに推してもらった結果。**返事の原文ごと**持ちます——数だけ残すと、
         あとで読み方を良くしたときに読み直せませんし、そもそもどんな聞き方に
         対する答えだったのかが分からなくなります。
         数のうち kcal/P/F/C は items にも一件だけ入れてあります（その日の
         合計や棒は items を数えているので、そこを作り替えずに済ませます）。 */
      ai,
      // 写真そのものは持ちません（localStorage に画像は入りません）。
      // 解析にかけたかどうかだけを覚えておきます。
      photoAnalyzed: m.photoAnalyzed === true,
      createdAt: m.createdAt || new Date().toISOString(),
      order: typeof m.order === "number" ? m.order : i,
    };
  }

  function cleanUserFood(f) {
    const name = String(f && f.name || "").trim();
    if (!name) return null;
    return {
      id: f.id || uid("uf"),
      name,
      kind: ["user", "product", "ai"].includes(f.kind) ? f.kind : "user",
      kcal: Math.max(0, num(f.kcal) || 0),
      p: Math.max(0, num(f.p) || 0),
      f: Math.max(0, num(f.f) || 0),
      c: Math.max(0, num(f.c) || 0),
      // 市販品はパッケージの表示が「1個あたり」のことも多いので、
      // 100g あたりか 1つあたりかを持ちます。
      per: f.per === "unit" ? "unit" : "100g",
      unitName: typeof f.unitName === "string" ? f.unitName : "個",
      unitGrams: posNum(f.unitGrams),
      barcode: typeof f.barcode === "string" ? f.barcode : null,
      // 表の値を直したものは、どれを直したのかを覚えておきます。
      basedOn: typeof f.basedOn === "string" ? f.basedOn : null,
      createdAt: f.createdAt || new Date().toISOString(),
    };
  }

  function cleanHealth(h) {
    if (!HEALTH_TYPES.includes(h && h.type)) return null;
    const value = num(h.value);
    if (value == null) return null;
    return {
      id: h.id || uid("h"),
      type: h.type,
      day: dayStr(h.day) || today(),
      time: KN.util.isTime(h.time) ? h.time : null,
      value,
      unit: typeof h.unit === "string" ? h.unit : "",
      // ワークアウトの種目名など、その一件にだけ付く名前。
      label: typeof h.label === "string" ? h.label : "",
      /* ワークアウトの消費カロリー。その一本に付いている数なので、ここに
         持ちます——一日のアクティブエネルギーの列に流し込むと、同じ熱量が
         二度数えられるか、その日の合計を上書きするかのどちらかになります。 */
      kcal: (() => { const n = num(h.kcal); return n != null && n >= 0 ? Math.round(n) : null; })(),
      // 何が測ったのか（Apple Watch、iPhone、手入力）。取り込み元の申告です。
      source: typeof h.source === "string" ? h.source : "health",
      // ヘルスケア側の一意な印。重複を弾く唯一まともな手がかりなので、
      // 来ていれば必ず残します。
      externalId: typeof h.externalId === "string" ? h.externalId : null,
      importedAt: h.importedAt || null,
    };
  }

  function reconcileDiet(d) {
    const base = emptyDiet();
    const src = (d && typeof d === "object") ? d : {};
    const out = {
      weights: (Array.isArray(src.weights) ? src.weights : []).map(cleanWeight).filter(Boolean),
      meals: (Array.isArray(src.meals) ? src.meals : []).map(cleanMeal).filter(Boolean),
      foods: (Array.isArray(src.foods) ? src.foods : []).map(cleanUserFood).filter(Boolean),
      health: (Array.isArray(src.health) ? src.health : []).map(cleanHealth).filter(Boolean),
      /* 前からある記録には drinks がありません。空で足すだけなので、
         入れ直しても既存のデータは何も動きません。 */
      drinks: (Array.isArray(src.drinks) ? src.drinks : []).map(cleanDrink).filter(Boolean),
      goal: { ...base.goal, ...(src.goal && typeof src.goal === "object" ? src.goal : {}) },
      sync: { ...base.sync, ...(src.sync && typeof src.sync === "object" ? src.sync : {}) },
    };
    out.goal.heightCm = posNum(out.goal.heightCm);
    out.goal.targetKg = posNum(out.goal.targetKg);
    out.goal.targetDay = dayStr(out.goal.targetDay);
    ["kcalTarget", "pTarget", "fTarget", "cTarget", "alcoholG",
     "stepsTarget", "burnTarget", "sleepTarget"].forEach((k) => { out.goal[k] = posNum(out.goal[k]); });
    return out;
  }

  /* ---------------- persistence ----------------

     **ここから下で使うものは、この行より上に置くこと。**

     `let state = load()` は module の評価の途中で走ります。つまり load() が
     触るものは、その時点で初期化済みでなければいけません。下に書いた
     const / let は「初期化前の参照」で落ち、しかも落ち方が静かです。

     この注意書きは二度書き直しました。一度目は所要時間の上限（const）で、
     人のデータを消しました。二度目は**その事故を塞ぐための退避先の鍵**を
     やはり下に置いて、今度は store ごと立ち上がらなくしました。
     関数宣言は巻き上がるので安全ですが、値は上に置くしかありません。 */

  // 読めなかった生の文字列の退避先。live のデータとは別の鍵にします。
  const RESCUE_KEY = KEY + "-rescue";
  let loadError = null;

  let migratedOnLoad = false;
  let state = load();
  const listeners = new Set();
  // update()/reload() のたびに上がる版数。ダイエットの日付索引（下の
  // dietIndex_）を、state が本当に動いたときだけ作り直すために使います。
  let version = 0;

  /* 保存してあるものが読めなかったとき。

     ここは**空のアプリで再開してはいけない**場所です。読めなかっただけで
     データは残っているのに、空で立ち上がってしまうと、次に何か触った瞬間の
     保存が本物を上書きします。読めなかったことが、消したことになる。

     実際にそれをやりました。reconcile の中で ReferenceError（初期化前の
     const 参照）が出て、この catch に静かに入り、空のアプリが立ち上がり、
     次の保存で人のデータが消えました。落ちた側のバグは直しましたが、
     **同じ形の事故がもう起きないように、ここを塞ぎます。**

     生の文字列を別の鍵へ退避し、保存そのものを止めます。書けないので、
     元の鍵に残っているものも無事です。 */
  function rescue(raw, err) {
    loadError = String((err && err.message) || err);
    console.error("state load failed — data left untouched", err);
    try {
      // 退避は一度だけ。二度目で、退避したものまで壊さないように。
      if (!localStorage.getItem(RESCUE_KEY)) localStorage.setItem(RESCUE_KEY, raw);
    } catch (_) { /* 書けなくても、元の鍵はそのままなので失われません */ }
  }

  function load() {
    let rawV2 = null;
    try { rawV2 = localStorage.getItem(KEY); } catch (_) { /* 読めない端末 */ }
    if (rawV2) {
      try { return reconcile(JSON.parse(rawV2)); }
      catch (err) { rescue(rawV2, err); return emptyState(); }
    }
    try {
      const rawV1 = localStorage.getItem(LEGACY_KEY);
      if (rawV1) {
        migratedOnLoad = true;
        return migrateV1(JSON.parse(rawV1));
      }
    } catch (err) {
      console.warn("legacy state unreadable", err);
    }
    return emptyState();
  }

  /** Fill in anything a older/partial save is missing so the app never crashes. */
  function reconcile(s) {
    const base = emptyState();
    const out = { ...base, ...s };
    out.settings = { ...base.settings, ...(s.settings || {}) };
    /* 知らない基調色は、既定へ戻します。色を減らした・名前を変えたときに、
       選んだ覚えのない色で画面が出てこないように。 */
    out.settings.accent = cleanAccent(out.settings.accent);
    out.settings.digestPos = out.settings.digestPos === "top" ? "top" : "bottom";
    out.categories = Array.isArray(s.categories) && s.categories.length ? s.categories : base.categories;
    out.stores   = Array.isArray(s.stores)   ? s.stores   : [];
    out.products = Array.isArray(s.products) ? s.products : [];
    out.items    = Array.isArray(s.items)    ? s.items    : [];
    out.todos    = Array.isArray(s.todos)    ? s.todos    : [];
    out.learned  = (s.learned && typeof s.learned === "object" && !Array.isArray(s.learned)) ? s.learned : {};

    /* daily。この機能より前に保存された人には、空の箱を渡します。 */
    const arc = (s.archive && typeof s.archive === "object") ? s.archive : {};
    out.archive = {
      entries: Array.isArray(arc.entries) ? arc.entries : [],
      days:    Array.isArray(arc.days)    ? arc.days    : [],
    };
    /* 書いた時刻・直した時刻。並び順がこれで決まるので、持っていないものが
       混ざると先頭に来たり最後に沈んだりします。日付しか無いものには、その日を
       充てておきます（嘘の時刻を作るより、粗いほうがまだ読めます）。 */
    out.archive.entries = out.archive.entries.filter((e) => e && e.id && e.type);
    out.archive.entries.forEach((e) => {
      e.date = String(e.date || "").slice(0, 10) || todayKey();
      if (!e.createdAt) e.createdAt = e.date;
      if (!e.updatedAt) e.updatedAt = e.createdAt;
      if (!Array.isArray(e.tags)) e.tags = [];
      if (!ARCHIVE_TYPES.some((t) => t.id === e.type)) e.type = "done";
      // この機能より前に保存された記録には、無かった項目を補います。
      if (typeof e.favorite !== "boolean") e.favorite = false;
      if (e.kind !== "book" && e.kind !== "paper") e.kind = e.type === "reading" ? "book" : null;
      if (e.author != null && typeof e.author !== "string") e.author = null;
      if (typeof e.pageFrom !== "number" || !isFinite(e.pageFrom)) e.pageFrom = null;
      if (typeof e.pageTo !== "number" || !isFinite(e.pageTo)) e.pageTo = null;
    });
    out.archive.days = out.archive.days.filter((d) => d && d.date);
    out.archive.days.forEach((d) => {
      /* 中身のある日だけ、持っていない時刻を日付で埋めます。空の行は
         「日が変わったので用意しただけ」の今日なので、null のまま——
         画面では「-」と出ます。ここで埋めると、書いてもいない日に
         作成時刻が付きます。 */
      const written = !!(String(d.memo || "").trim() || d.wake || d.sleep);
      if (written) {
        if (!d.updatedAt) d.updatedAt = d.date;
        if (!d.createdAt) d.createdAt = d.updatedAt;
      }
      /* この機能より前に書かれた時刻は、ぜんぶ人が打ったものです——
         取り込みに上書きさせないよう manual としておきます。 */
      if (d.wakeSource !== "health" && d.wakeSource !== "manual") d.wakeSource = "manual";
      if (d.sleepSource !== "health" && d.sleepSource !== "manual") d.sleepSource = "manual";
      delete d.timeSource;   // 起床・就寝で兼ねていた古い印
      if (d.sleepStages && typeof d.sleepStages !== "object") delete d.sleepStages;
    });
    // Each entry keeps the name as it was typed as well as the folded key it is
    // matched on, so 設定 can show 「コンソメ」 rather than 「こんそめ」.
    Object.keys(out.learned).forEach((k) => {
      const v = out.learned[k];
      if (typeof v === "string") out.learned[k] = { category: v, label: k };
      else if (!v || !v.category) delete out.learned[k];
    });

    out.categories.forEach((c, i) => {
      if (typeof c.order !== "number") c.order = i;
      // Lists saved before categories had colours, and any the user made by
      // hand, get one off the palette rather than none.
      if (!c.color) c.color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    });
    out.products.forEach((p) => {
      if (!Array.isArray(p.prices)) p.prices = [];
      /* 手で並べた順。触っていないカテゴリの商品は null のままで、
         そこは五十音のままです（並べた覚えのない棚が勝手に並び替わって
         いるほうが、よほど分からない）。 */
      if (typeof p.order !== "number" || !isFinite(p.order)) p.order = null;
      if (!p.categoryId || !out.categories.some((c) => c.id === p.categoryId)) {
        p.categoryId = OTHER_CATEGORY;
      }
    });
    // Drop items whose product vanished.
    out.items = out.items.filter((i) => out.products.some((p) => p.id === i.productId));
    // Lists saved before favourites existed carry no flag; absent means off.
    out.items.forEach((i) => { i.fav = i.fav === true; });

    /* Todos, filled in rather than trusted: this list is also what an imported
       backup lands in, and a half-written todo would take the screen down. A
       due date is either a 「YYYY-MM-DD」 day or nothing at all — anything
       else (an old ISO timestamp, a typo) is dropped rather than shown as
       「Invalid Date」. */
    out.todos = out.todos.filter((t) => t && typeof t === "object").map((t, i) => ({
      id: t.id || uid("t"),
      title: String(t.title || "").trim(),
      due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
      repeat: ["daily", "weekly", "monthly"].includes(t.repeat) ? t.repeat : null,
      // 毎週 on named days, and 毎月 on a 「第2火曜」 rather than a date.
      repeatDays: cleanDays(t.repeatDays),
      repeatNth: cleanNth(t.repeatNth),
      // 毎朝 / 毎晩、または時刻そのもの。どちらか一方だけを持ちます——両方ある
      // と食い違えるので。日のなかの並びは todoPart() が時刻から読みます。
      part: cleanPart(t.part),
      time: KN.util.isTime(t.time) ? t.time : null,
      /* かかる時間（分）。持たないものは null のままです——**0 ではなく**。
         0 と書くと「一瞬で終わる用事」になってしまいますが、実際には
         「まだ決めていない」がほとんどなので。時間軸はこれを読んで
         その用事の帯の長さを決め、持たないものには既定の長さを当てます。 */
      minutes: cleanMinutes(t.minutes),
      // 「YYYY-MM-DD HH:MM」 of the occurrence already announced, if any.
      notifiedFor: typeof t.notifiedFor === "string" ? t.notifiedFor : null,
      memo: typeof t.memo === "string" ? t.memo : "",
      flagged: t.flagged === true,
      done: t.done === true,
      doneAt: t.doneAt || null,
      archived: t.archived === true,
      archivedAt: t.archivedAt || null,
      /* 繰り返すものを済ませたときに残す「やった記録」。

         繰り返しは、済ませると次の日へ移ります。そのぶん**その日に
         やったこと自体が画面から消えて**いました。朝のルーティンや育児の
         ように毎日やるものほど、やった跡が残らないことになります。

         なので、済ませた日に一件だけ写しを置きます。写しは繰り返しません
         （もう終わったその日ぶんなので）。棚（アーカイブ）には入れません
         ——あそこは「やらずに片づけたもの」の置き場で、性格が違います。 */
      trace: t.trace === true,
      /* 「買い物へ行く」の一件。★を付けた買うものを、その日の予定に
         一件として置いたものです。中身（何を買うか）は買うもの側が持ち
         つづけるので、ここは**行くという用事**だけを持ちます。 */
      shop: t.shop === true,
      /* 中の段取り。「朝のしたく」のような一件は、それ自体がいくつかの
         手順です。手順を別々の用事に割ると一日が細切れに見え、一件に
         まとめると何が残っているか分かりません。中に持たせます。

         繰り返しと合わせると、そのままルーティンになります——毎朝の一件が、
         中に同じ手順を持って毎日戻ってくる。だから「ルーティン」という
         別の種類は作りません。同じものに名前を二つ付けることになるので。 */
      subs: cleanSubs(t.subs),
      /* 自分で選んだ絵。決めていなければ null——その場合は題から絵を
         推す（KN.productIcons.find）のを、時間割の側がやります。買うもの
         の商品アイコンと同じ選び方で、「迷ったときは丸のまま」ではなく、
         中身にいちばん近い絵を積極的に選ぶという方針もそちらと揃えます。 */
      icon: cleanIcon(t.icon),
      createdAt: t.createdAt || today(),
      order: typeof t.order === "number" ? t.order : i,
    })).filter((t) => t.title).map(fixBookend);

    out.diet = reconcileDiet(s.diet);

    out.schema = SCHEMA;
    return out;
  }

  /* 朝・午後・夜のほかに、日の両端に立つ二つ。「毎朝」と「毎晩」は、その日の
     どこかではなく、その日の *はじめ* と *おわり* — 起きてすること、寝る前に
     すること。だから同じ日のほかの用事は、この二つに挟まれて並びます。

     「毎」と名乗る以上くり返しなので、選べば毎日になります。そこを別々の欄に
     しておくと「毎朝だが一度きり」が作れてしまい、それは言葉と食い違います。 */
  /* Function declarations, not consts: reconcile() runs while this module is
     still being evaluated (`let state = load()` below the definitions), so a
     `const` down here would still be in its dead zone and every load would
     throw — quietly, into load()'s catch, and come back as an empty app. */
  function isBookendPart(p) { return p === "dawn" || p === "dusk"; }

  /* Only the two ends are stored any more. 朝・午後・夜 were a way of saying
     roughly when in the day something belonged, and a written clock time says
     it better; anything saved under the old names is dropped on load, because
     nothing shows it and nothing can set it. A *time* still reads as one of
     them for sorting (todoPart below) — that is arithmetic, not a stored
     choice. */
  function cleanPart(v) { return isBookendPart(v) ? v : null; }

  /* かかる時間（分）。5分から12時間まで。

     上を12時間で止めるのは、それより長いものは「用事」ではなく
     「その日の全部」だからです。一日を組み立てるための数なので、
     一日を食べ尽くす数は受け取りません。5分刻みに丸めるのは、
     人が見積もるときの粒がそれより細かくならないためです。

     **数は関数の中に置きます。** すぐ上の isBookendPart に書いてあるとおり、
     ここは reconcile() が module の評価中に呼ぶ場所です。const を外に
     置くと、読み込みのたびに「初期化前の参照」で落ちます——しかも
     load() の catch に静かに入って、空のアプリとして戻ってきます。

     私はその注意書きのすぐ下に const を置いて、**実際に人のデータを
     消しました。** 長さを決めていないもの（minutes が null）は最初の
     行で返るので落ちず、長さを決めた人だけが全部を失う、という形でした。 */
  function cleanMinutes(v) {
    const MIN = 5, MAX = 720;
    const n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return Math.min(MAX, Math.max(MIN, Math.round(n / 5) * 5));
  }

  /* 中の段取りを整えます。**function 宣言**であることが大事です
     ——読み込みは load() がこの下より前で走るので、const にすると
     読めない箱になり、読み込みごと落ちます（一度やりました）。
     数え上げの上限は、中に置いてあります。 */
  function cleanSubs(v) {
    const MAX = 50;
    if (!Array.isArray(v)) return [];
    return v.map((s, i) => ({
      id: (s && s.id) || ("s" + i + "-" + Math.random().toString(36).slice(2, 8)),
      title: String((s && s.title) || "").trim(),
      done: !!(s && s.done),
    })).filter((s) => s.title).slice(0, MAX);
  }

  /* **function 宣言**であることが大事です（cleanMinutes/cleanSubs と
     同じ理由——load() はこの下より前で走るので、const だと読めない箱に
     なります）。存在しない絵の鍵が紛れ込んでいたら、null に戻します
     （手描きの絵の数が減った・キーが変わった、といった将来の変更で
     用事が壊れて見えないように）。 */
  function cleanIcon(key) {
    if (!key) return null;
    return KN.productIcons.byKey(key) ? String(key) : null;
  }

  /**
   * 毎朝／毎晩は、言葉のとおり「毎日・ある日から」です。
   *
   * かつては時刻も落としていました（「朝」と「7:30」は同じ問いへの二つの
   * 答えだから）。いまは残します——**並び順と、報せる時刻は別のこと**だと
   * 分かったためです。毎朝は一日のいちばん上に居てほしい、でもバッジは
   * 7時に出てほしい。前者は part が、後者は time が決めます。
   * 並び順で time に負けないことは、下の todoPart() が受け持ちます。
   */
  function fixBookend(t) {
    if (!isBookendPart(t.part)) return t;
    t.repeat = "daily";
    t.repeatDays = [];
    t.repeatNth = null;
    if (!t.due) t.due = KN.util.todayKey();
    return t;
  }

  /** 0..6, no repeats, in week order — anything else is not a set of days. */
  function cleanDays(v) {
    if (!Array.isArray(v)) return [];
    const out = [...new Set(v.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
    return out.sort((a, b) => a - b);
  }

  /** 「第◯◯曜日」: nth is 1..5 or -1 for 最終. */
  function cleanNth(v) {
    if (!v || typeof v !== "object") return null;
    const nth = Number(v.nth), weekday = Number(v.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
    if (!(nth === -1 || (Number.isInteger(nth) && nth >= 1 && nth <= 5))) return null;
    return { nth, weekday };
  }

  /** v1 stored store names inline on each price; lift them into real store records. */
  function migrateV1(old) {
    const s = emptyState();
    const storeByName = new Map();
    const catByName = new Map(s.categories.map((c) => [c.name, c.id]));

    function storeIdFor(name) {
      const key = String(name).trim();
      if (!key) return null;
      if (storeByName.has(key)) return storeByName.get(key);
      const rec = {
        id: uid("s"),
        name: key,
        color: STORE_COLORS[storeByName.size % STORE_COLORS.length],
        order: storeByName.size,
      };
      s.stores.push(rec);
      storeByName.set(key, rec.id);
      return rec.id;
    }

    function categoryIdFor(name) {
      const key = String(name || "").trim();
      if (!key) return OTHER_CATEGORY;
      if (catByName.has(key)) return catByName.get(key);
      const rec = { id: uid("c"), name: key, emoji: "🏷️", order: s.categories.length };
      s.categories.push(rec);
      catByName.set(key, rec.id);
      return rec.id;
    }

    (old.products || []).forEach((p) => {
      s.products.push({
        id: p.id || uid("p"),
        name: p.name,
        categoryId: categoryIdFor(p.category),
        amount: null,
        unit: "",
        note: "",
        prices: (p.prices || []).map((pr) => ({
          id: pr.id || uid("pr"),
          storeId: storeIdFor(pr.store),
          price: Number(pr.price) || 0,
          amount: null,
          date: pr.date || today(),
        })).filter((pr) => pr.storeId),
      });
    });

    (old.listItems || []).forEach((i) => {
      if (!s.products.some((p) => p.id === i.productId)) return;
      s.items.push({
        id: i.id || uid("i"),
        productId: i.productId,
        qty: Number(i.qty) || 1,
        memo: i.memo || "",
        checked: !!i.checked,
        addedAt: i.addedAt || today(),
      });
    });

    return s;
  }

  /* 保存できなかった状態を覚えておきます。編集は画面には反映されますが、
     ディスクには書けていません——120msごとに黙って失敗し続けると
     トーストだけが鳴り続けるので、**状態が変わったとき**（失敗し始めた・
     戻った）だけ知らせます。設定画面はこれを見て、直っていないあいだ
     ずっと出る行を表示できます（一度きりのトーストは読み飛ばされるので）。 */
  let saveError = null;

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      /* 走り終えたら手を離します。ここを忘れていたので、saveTimer は
         一度でも保存すればずっと真のままでした。reload() は「書きかけが
         あるなら先に書き出す」ためにこの値を見るので、**いつでも
         書き出してから読み直す**ことになり、外から書き換えられた控えを
         毎回踏み潰していました（読み直す意味がありませんでした）。 */
      saveTimer = null;
      /* 読めなかった日は、書きません。空の state で上書きしてしまうので。
         直った版で開き直せば、そのまま元のデータが読めます。 */
      if (loadError) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        if (saveError) {
          saveError = null;
          KN.ui && KN.ui.toast("保存を再開しました");
          emit();   // 設定画面が出したままの警告行を、直った時点で引っ込めるため
        }
      } catch (err) {
        console.error("save failed", err);
        if (!saveError) {
          saveError = String((err && err.message) || err);
          KN.ui && KN.ui.toast("保存できませんでした（空き容量を確認してください）");
          emit();   // 開いている画面があれば、その場で警告行を出すため
        }
      }
    }, 120);
  }

  function emit() {
    listeners.forEach((fn) => fn(state));
  }

  /** Apply a mutation, persist, and notify. */
  function update(mutator) {
    mutator(state);
    version++;
    persist();
    emit();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // 120msの間だけ待っている保存があれば、いま書き出します。
  function flushPending() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* the next save reports it */ }
  }

  /* Re-read what is actually on disk. Each tab — or the same installed app
     opened in two places — keeps its own copy in memory, and the `storage`
     event only reaches tabs that were already open. Pulling to refresh is how
     you ask for whatever the other one wrote. Our own pending save goes out
     first, so a refresh can never discard an edit that had not landed yet. */
  function reload() {
    flushPending();
    state = load();
    version++;
    emit();
  }

  /* iOSでアプリを閉じる・タブを切り替えるとき、120msのデバウンス待ちの
     まっただ中だと、その一拍が保存されずに終わることがあります。
     pagehide／visibilitychange（隠れた瞬間）で呼び、待っている保存が
     あればその場で書き出します。 */
  function flush() {
    flushPending();
  }

  // A v1 upgrade only lived in memory until the first edit; write it out now so
  // the converted data survives even if the user just looks and leaves.
  if (migratedOnLoad) persist();

  /* ---------------- selectors ---------------- */

  const get = () => state;

  const getProduct  = (id) => state.products.find((p) => p.id === id) || null;
  const getStore    = (id) => state.stores.find((s) => s.id === id) || null;
  const getCategory = (id) => state.categories.find((c) => c.id === id)
                              || state.categories.find((c) => c.id === OTHER_CATEGORY)
                              || state.categories[0];

  function sortedCategories() {
    return [...state.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function sortedStores() {
    return [...state.stores].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /* Keyword hints so a freshly typed item lands in a sensible category. */
  const CATEGORY_HINTS = [
    ["c-veg",    ["野菜", "やさい", "トマト", "きゅうり", "キュウリ", "レタス", "キャベツ", "玉ねぎ", "たまねぎ", "じゃがいも", "ジャガイモ", "にんじん", "ニンジン", "人参", "ねぎ", "ネギ", "白菜", "もやし", "きのこ", "しめじ", "りんご", "リンゴ", "バナナ", "みかん", "いちご", "ぶどう", "果物", "フルーツ", "サラダ"]],
    ["c-meat",   ["肉", "にく", "牛", "豚", "鶏", "とり", "ひき肉", "ミンチ", "ハム", "ベーコン", "ソーセージ", "ウインナー", "魚", "さかな", "鮭", "さけ", "まぐろ", "マグロ", "刺身", "さしみ", "えび", "エビ", "いか", "イカ", "貝"]],
    ["c-cold",   ["牛乳", "ぎゅうにゅう", "ミルク", "卵", "たまご", "タマゴ", "ヨーグルト", "チーズ", "バター", "豆腐", "とうふ", "納豆", "なっとう", "アイス", "冷凍", "れいとう", "冷蔵", "プリン", "生クリーム"]],
    ["c-drink",  ["水", "みず", "お茶", "おちゃ", "茶", "コーヒー", "珈琲", "ジュース", "ビール", "酒", "さけ", "ワイン", "炭酸", "コーラ", "牛乳パック", "飲料", "ドリンク"]],
    ["c-clean",  ["洗剤", "せんざい", "掃除", "そうじ", "トイレットペーパー", "ティッシュ", "ゴミ袋", "ごみ袋", "漂白", "柔軟剤", "スポンジ", "ワイパー", "クリーナー", "キッチンペーパー"]],
    ["c-health", ["薬", "くすり", "マスク", "絆創膏", "ばんそうこう", "消毒", "サプリ", "ビタミン", "湿布", "体温計", "生理用品", "オムツ", "おむつ"]],
    ["c-daily",  ["シャンプー", "リンス", "石鹸", "せっけん", "ボディソープ", "歯ブラシ", "歯磨き", "はみがき", "タオル", "電池", "ラップ", "アルミホイル", "洗顔", "化粧", "髭剃り", "ひげそり", "カミソリ"]],
    ["c-food",   ["米", "こめ", "パン", "麺", "めん", "パスタ", "うどん", "そば", "ラーメン", "醤油", "しょうゆ", "味噌", "みそ", "砂糖", "塩", "しお", "油", "あぶら", "小麦粉", "サラダ油", "缶詰", "レトルト", "カレー", "お菓子", "おかし", "スナック", "調味料", "だし", "ソース", "マヨネーズ", "ケチャップ", "シリアル"]],
    /* 家具・文房具・台所道具・家電。買うものは食品と消耗品だけではないので、
       このあたりが揃って「その他」に落ちないように。いつもどおり、自分で
       選び直せばその振り分けを覚える。 */
    ["c-daily",  ["家具", "椅子", "いす", "机", "つくえ", "テーブル", "ソファ", "ベッド", "布団", "ふとん", "枕", "まくら",
                  "毛布", "シーツ", "マットレス", "カーテン", "カーペット", "ラグ", "収納", "本棚", "たんす",
                  "クッション", "座布団", "時計", "照明", "電球", "鏡", "花瓶",
                  "文房具", "ノート", "鉛筆", "えんぴつ", "ペン", "消しゴム", "ファイル", "封筒", "付箋", "ふせん",
                  "ホチキス", "テープ", "クリップ", "カレンダー", "手帳", "印鑑", "はんこ", "画用紙", "コピー用紙",
                  "フライパン", "包丁", "まな板", "弁当箱", "水筒", "タッパー", "保存容器", "やかん", "ざる",
                  "マグカップ", "コップ", "急須", "しゃもじ", "菜箸", "お玉",
                  "家電", "レンジ", "冷蔵庫", "洗濯機", "掃除機", "ドライヤー", "アイロン", "扇風機", "エアコン",
                  "加湿器", "テレビ", "パソコン", "スマホ", "充電", "ケーブル", "リモコン", "炊飯器", "トースター"]],
  ];

  /** Best-guess category id for a product name; falls back to その他.
   *  The longest matching keyword wins rather than the first category listed,
   *  so 「牛乳」beats 「牛」and 「化粧水」beats 「水」. */
  /* Corrections, longest key first — same rule as everything else here, so a
     learned 「コンソメ」 also catches 「味の素 コンソメ」. Entries pointing at a
     category that has since been deleted are skipped rather than dropped: the
     category might come back, and silently forgetting is worse than ignoring. */
  function learnedPairs() {
    return Object.entries(state.learned || {})
      .filter(([, v]) => v && state.categories.some((c) => c.id === v.category))
      .map(([key, v]) => [key, v.category])
      .sort((a, b) => b[0].length - a[0].length);
  }

  /** Everything learned, for showing in 設定. */
  function learnedList() {
    return Object.entries(state.learned || {}).map(([key, v]) => ({
      key,
      label: (v && v.label) || key,
      categoryId: v && v.category,
      category: state.categories.find((c) => c.id === (v && v.category)) || null,
    }));
  }

  /** Remember that this product belongs in this category, for next time. */
  function learnCategory(name, categoryId) {
    const label = String(name || "").trim();
    const key = KN.util.foldKana(label);
    if (!key || !categoryId) return;
    update((s) => {
      if (!s.learned) s.learned = {};
      s.learned[key] = { category: categoryId, label };
    });
  }

  function forgetCategory(key) {
    update((s) => { if (s.learned) delete s.learned[key]; });
  }

  function forgetAllCategories() {
    update((s) => { s.learned = {}; });
  }

  /**
   * Best-guess category id for a product name; falls back to その他.
   *
   * Three sources, in order of how much they know:
   *
   *  1. What the user corrected by hand. If they once moved 「コンソメ」 into
   *     調味料, that is not a guess any more, and nothing below may overrule it.
   *  2. The categories' own names. 「コンソメ(調味料)」 says where it goes, and
   *     this is what makes renaming work for someone who threw the built-in
   *     categories away and wrote their own — the keyword table below is keyed
   *     to the default ids and knows nothing about a category called 調味料.
   *  3. The built-in keyword table.
   *
   * Within each source the longest match wins rather than the first listed, so
   * 「牛乳」 beats 「牛」 and 「化粧水」 beats 「水」.
   */
  function guessCategory(name) {
    const raw = String(name || "");
    if (!raw.trim()) return OTHER_CATEGORY;
    const folded = KN.util.foldKana(raw);

    for (const [key, id] of learnedPairs()) {
      if (folded.includes(key)) return id;
    }

    let namedId = null, namedLen = 0;
    state.categories.forEach((c) => {
      const key = KN.util.foldKana(c.name);
      // One character is too little to go on — a category called 「肉」 would
      // claim 「肉まん」 and everything else that happens to contain it.
      if (key.length >= 2 && key.length > namedLen && folded.includes(key)) {
        namedId = c.id;
        namedLen = key.length;
      }
    });
    if (namedId) return namedId;

    let bestId = OTHER_CATEGORY;
    let bestLen = 0;
    for (const [catId, words] of CATEGORY_HINTS) {
      // A category the user deleted must not shadow a still-valid match.
      if (!state.categories.some((c) => c.id === catId)) continue;
      for (const w of words) {
        if (w.length > bestLen && raw.includes(w)) {
          bestId = catId;
          bestLen = w.length;
        }
      }
    }
    return bestId;
  }

  /** The colour a product's rows are tinted with — its category's. */
  function productColor(product) {
    if (!product) return "";
    return getCategory(product.categoryId).color || "";
  }

  /**
   * The picture beside a product — always a drawn one (see product-icons.js).
   *
   * Three tries, each less specific than the last. The name first. Then the
   * category's name, because a category is a thing with a picture too: once
   * 「コンソメ」 is known to be 調味料, a salt cellar says far more than a
   * blank carton did. Only when neither says anything does it fall back to a
   * plain package, painted in the category's colour so the row still belongs
   * to a group by sight.
   * @returns raw HTML, ready to drop into an html`` template
   */
  function productMark(product) {
    if (!product) return "";
    // Chosen by hand: nothing else gets to argue with it.
    const own = KN.productIcons.byKey(product.icon);
    return own ? KN.util.raw(own) : autoMark(product);
  }

  /** What the picture would be if nobody had chosen one. */
  function autoMark(product) {
    if (!product) return "";
    const cat = getCategory(product.categoryId);
    return KN.util.raw(
      KN.productIcons.find(product.name)
      || (cat && KN.productIcons.find(cat.name))
      || KN.productIcons.fallback(productColor(product))
    );
  }

  function findProductByName(name) {
    const n = String(name).trim().toLowerCase();
    return state.products.find((p) => p.name.trim().toLowerCase() === n) || null;
  }

  function findStoreByName(name) {
    const n = String(name).trim().toLowerCase();
    return state.stores.find((s) => s.name.trim().toLowerCase() === n) || null;
  }

  /**
   * Latest recorded price per store for a product, cheapest first.
   * Older entries for the same store are treated as history, not offers.
   */
  function currentPrices(product) {
    if (!product) return [];
    const latest = new Map();
    [...product.prices]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((pr) => latest.set(pr.storeId, pr));
    return [...latest.values()]
      .filter((pr) => getStore(pr.storeId))
      .sort((a, b) => a.price - b.price);
  }

  function bestPrice(product) {
    const list = currentPrices(product);
    return list.length ? list[0] : null;
  }

  /** Price of `product` at `storeId` right now, or null. */
  function priceAt(product, storeId) {
    return currentPrices(product).find((pr) => pr.storeId === storeId) || null;
  }

  /* ---------------- mutations ---------------- */

  function addStore(name, color) {
    const clean = String(name).trim();
    if (!clean) return null;
    const existing = findStoreByName(clean);
    if (existing) return existing;
    const rec = {
      id: uid("s"),
      name: clean,
      color: color || STORE_COLORS[state.stores.length % STORE_COLORS.length],
      order: state.stores.length,
    };
    update((s) => { s.stores.push(rec); });
    return rec;
  }

  function addProduct({ name, categoryId, amount, unit, note }) {
    const clean = String(name).trim();
    if (!clean) return null;
    const existing = findProductByName(clean);
    if (existing) return existing;
    const rec = {
      id: uid("p"),
      name: clean,
      categoryId: categoryId || OTHER_CATEGORY,
      // 並べたことのない商品。並べ替えた棚に入るときは、いちばん後ろへ。
      order: null,
      amount: isFinite(amount) && amount > 0 ? amount : null,
      unit: unit || "",
      note: note || "",
      prices: [],
    };
    update((s) => { s.products.push(rec); });
    return rec;
  }

  /* ---------------- やること ----------------

     A todo is a much smaller thing than a product: a line of text, and at most
     a day it is wanted by. Everything else here exists because of that day —
     what is overdue, what repeats, what the icon should count. */

  function addTodo({ title, due = null, part = null, time = null, repeat = null, repeatDays = [],
                     repeatNth = null, memo = "", flagged = false, minutes = null,
                     shop = false, subs = [], icon = null } = {}) {
    const name = String(title || "").trim();
    if (!name) return null;
    const at = KN.util.isTime(time) ? time : null;
    const rec = {
      id: uid("t"),
      title: name,
      due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
      repeat: ["daily", "weekly", "monthly"].includes(repeat) ? repeat : null,
      repeatDays: cleanDays(repeatDays),
      repeatNth: cleanNth(repeatNth),
      /* 時刻があっても part は落としません。毎朝・毎晩は「一日の端に置く」
         という並び順の指定で、時刻は「いつ報せるか」——別のことなので。
         （毎朝・毎晩でない part は、そもそも cleanPart が落とします。） */
      part: cleanPart(part),
      time: at,
      // かかる時間（分）。決めていなければ null。時間軸が読みます。
      minutes: cleanMinutes(minutes),
      notifiedFor: null,
      memo: String(memo || ""),
      flagged: !!flagged,
      done: false,
      doneAt: null,
      archived: false,
      archivedAt: null,
      trace: false,
      shop: shop === true,
      subs: cleanSubs(subs),
      icon: cleanIcon(icon),
      createdAt: today(),
      order: 0,
    };
    fixBookend(rec);
    update((s) => {
      s.todos.forEach((t) => { t.order = (t.order || 0) + 1; });
      s.todos.unshift(rec);
    });
    return rec;
  }

  /* ---------------- 暦の見かたは、タブごとに ----------------

     長らく settings.calOpen ひとつを三つの画面で分け合っていました。
     ところが見たい単位は画面ごとに違います——ダイエットは月ぜんぶを
     眺めたいが、やることは今週だけでいい、というように。一つの札を
     分け合っていると、片方を月にした瞬間もう片方も月になります。

     出す・しまうも同じで、画面ごとに持ちます。暦が無いほうが広く使える
     画面があるので。 */

  const CAL_TABS = ["todo", "diet", "archive"];

  function calPrefs(tab) {
    const s = get().settings;
    const key = CAL_TABS.includes(tab) ? tab : "todo";
    const by = (s.calBy && typeof s.calBy === "object") ? s.calBy : {};
    const one = (by[key] && typeof by[key] === "object") ? by[key] : {};
    return {
      /* 月ぜんぶを出すか（false なら今週だけ）。古い calOpen は、まだ
         自分の札を持っていない画面の初期値として使います——これまでの
         見かたが、いきなり変わらないように。 */
      open: one.open === undefined ? s.calOpen === true : one.open === true,
      // 暦そのものを出すか。既定は出す。
      shown: one.shown === undefined ? true : one.shown === true,
    };
  }

  function setCalPref(tab, patch) {
    const key = CAL_TABS.includes(tab) ? tab : "todo";
    update((s) => {
      if (!s.settings.calBy || typeof s.settings.calBy !== "object") s.settings.calBy = {};
      s.settings.calBy[key] = { ...(s.settings.calBy[key] || {}), ...patch };
    });
  }

  /* ---------------- 中の段取り ---------------- */

  /** 手順を丸ごと差し替えます（並べ替え・書き直し・足す・消すの全部）。 */
  function setSubs(id, subs) {
    update((s) => {
      const t = s.todos.find((x) => x.id === id);
      if (t) t.subs = cleanSubs(subs);
    });
  }

  /** 手順ひとつを、済んだ／まだに切り替えます。 */
  function toggleSub(id, subId) {
    update((s) => {
      const t = s.todos.find((x) => x.id === id);
      const sub = t && (t.subs || []).find((x) => x.id === subId);
      if (sub) sub.done = !sub.done;
    });
  }

  /** 残りいくつか。{done, total}。手順が無ければ total は 0。 */
  function subCount(t) {
    const subs = (t && t.subs) || [];
    return { done: subs.filter((s) => s.done).length, total: subs.length };
  }

  /* ---------------- その日にあったこと（Daily Log の材料） ----------------

     **写しません。引きます。**

     その日の Daily Log は、新しい入れものではありません。すでにどこかに
     ある記録を、その日ぶんだけ集めて並べた**眺め**です。だから、

       ・二重に出ることが構造上ありません（元をひとつずつ読むだけなので）
       ・Daily 側から元を壊せません（Daily は何も持っていないので）
       ・「どちらが本物か」が生まれません（本物はいつも元のほうです）

     写しを作る道を選ぶと、この三つを自分で守りつづけることになります。
     ——守れなかったときに、黙って壊れる種類の約束です。

     返すのは読み取り専用の並びで、id は**元のid**です。押したときに元へ
     辿れるように（消すのも直すのも、元の関数へ回します）。 */

  /* 時刻つきの記録が「何日のことか」。

     **dayKeyOf は使えません。** あれは文字列の頭10文字を切るだけで、
     doneAt / checkedAt は UTC の ISO（today() が toISOString を返す）です。
     一方その日を指す鍵（todayKey）はローカルの日付。日本時間だと9時間
     ずれるので、朝に済ませたものが前の日へ回り、時刻も9時間ずれて出て
     いました。時刻を持つ値は、いったんローカルの日時に直してから数えます。

     日付だけの値（積み上げの date は "YYYY-MM-DD"）はそのまま通します
     ——あれは初めからローカルの日付なので、Date に通すとかえってずれます。 */
  function dayOfStamp(v) {
    const str = String(v || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const key = KN.util.dayKey(new Date(str));
    return key || dayKeyOf(str);
  }

  function dayFeed(day) {
    const key = dayKeyOf(day);
    const s = get();
    const out = [];

    /* ① その日に済ませた「やること」。繰り返しの写し（trace）も入ります
       ——毎朝のものを今日やった、という記録はそちらが持っているので。
       元のほうは翌日へ移って done:false になっているため、同じ用事が
       二度出ることはありません。 */
    s.todos.forEach((t) => {
      if (!t.done && !t.archived) return;
      const at = todoClosedAt(t);
      if (!at || dayOfStamp(at) !== key) return;
      out.push({ src: "todo", id: t.id, at, title: t.title, icon: t.icon || null,
                 minutes: t.minutes || null, repeat: !!t.repeat, trace: !!t.trace });
    });

    /* ② その日の「積み上げ」。

       種はタイトルを持ちません（メモそのものが記録なので）。持っていない
       ものの題を空のまま出すと、種の行だけ名無しで並びます。書いた本人に
       とっては、そのメモが題です——一行目を借ります。 */
    (s.archive.entries || []).forEach((e) => {
      if (dayOfStamp(e.date) !== key) return;
      const memo = String(e.memo || "");
      const title = e.title || memo.split("\n")[0].trim();
      out.push({ src: "entry", id: e.id, at: e.createdAt || e.date,
                 title, type: e.type, memo,
                 amount: e.amount, unit: e.unit });
    });

    /* ③ その日に買ったもの。 */
    (s.items || []).forEach((i) => {
      if (!i.checked || !i.checkedAt) return;
      if (dayOfStamp(i.checkedAt) !== key) return;
      const p = s.products.find((x) => x.id === i.productId);
      out.push({ src: "item", id: i.id, at: i.checkedAt,
                 title: (p && p.name) || "", icon: (p && p.icon) || null });
    });

    /* 時刻の順に。時刻を持たないものは、その日の頭に来ます。 */
    return out.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  }

  /* ---------------- ひと月のまとめ ----------------

     Daily Log と**同じ材料**から作ります（dayFeed をその月ぶん回すだけ）。
     別の数え方を持たせると、まとめと日々の並びが食い違ったときに、
     どちらが本当か決められなくなります。

     数えるのは、あったことだけです。割合も、続いた日数も、先月との比べも
     出しません——この画面が答えるのは「あの月はどんな月だったか」で、
     良し悪しではないので（daily-rules.js が、その器を持っていないことを
     見張っています）。 */
  function monthDigest(ym) {
    const key = String(ym || "").slice(0, 7);
    const bySrc = { todo: 0, entry: 0, item: 0 };
    const daysWith = [];
    let total = 0;

    const [y, m] = key.split("-").map(Number);
    if (!y || !m) return { daysWith, bySrc, total };

    const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const day = `${key}-${String(d).padStart(2, "0")}`;
      const feed = dayFeed(day);
      if (!feed.length) continue;
      daysWith.push(day);
      total += feed.length;
      feed.forEach((f) => { if (bySrc[f.src] != null) bySrc[f.src] += 1; });
    }

    /* 地の文（日記）だけ書いた日も「記録のあった日」です。 */
    (get().archive.days || []).forEach((row) => {
      if (String(row.date || "").slice(0, 7) !== key) return;
      if (!String(row.memo || "").trim()) return;
      if (!daysWith.includes(row.date)) daysWith.push(row.date);
    });
    daysWith.sort();
    return { daysWith, bySrc, total };
  }

  /* ---------------- 買うものを、その日の予定に ----------------

     ★を付けたものは「今回の買い物」です。それは買うもの側の話で、
     **いつ行くか**は予定側の話——別のことなので、二重に持たせません。
     予定に置くのは「買い物へ行く」という一件だけで、何を買うかは
     買うもののほうがずっと持ちつづけます。数も、そちらを数えます
     （写しておくと、★を足した瞬間に古くなるので）。 */

  /** いま★が付いていて、まだ買っていないものの数。 */
  function tripCount() {
    return get().items.filter((i) => i.fav && !i.checked).length;
  }

  /** その日に置いた「買い物へ行く」。無ければ null。 */
  function tripTodo(day) {
    return get().todos.find((t) => t.shop && t.due === day && !t.archived && !t.trace) || null;
  }

  /** その日の予定に置きます。すでにあれば、そのまま返します。 */
  function planTrip(day, minutes = 60) {
    const had = tripTodo(day);
    if (had) return had;
    return addTodo({ title: "買い物へ行く", due: day, minutes, shop: true });
  }

  /** 予定から外します。外せたら true。 */
  function unplanTrip(day) {
    const t = tripTodo(day);
    if (!t) return false;
    update((s) => { s.todos = s.todos.filter((x) => x.id !== t.id); });
    return true;
  }

  function getTodo(id) { return get().todos.find((t) => t.id === id) || null; }

  function updateTodo(id, patch) {
    update((s) => {
      const t = s.todos.find((x) => x.id === id);
      if (!t) return;
      if ("title" in patch) t.title = String(patch.title || "").trim() || t.title;
      if ("due" in patch) t.due = /^\d{4}-\d{2}-\d{2}$/.test(patch.due) ? patch.due : null;
      if ("repeat" in patch) {
        t.repeat = ["daily", "weekly", "monthly"].includes(patch.repeat) ? patch.repeat : null;
      }
      /* 時刻と、毎朝・毎晩は**両立します**。
         かつては排他でした（「19:30」と「朝」のどちらが本当か決めなおす
         ことになるから）。ですが毎朝・毎晩は「一日の端に置く」という並び順の
         指定で、時刻は「いつ報せるか」——同じ問いへの二つの答えではありません。
         毎朝を一番上に置いたまま、バッジは7時に出す、が言えるようになります。
         （毎朝・毎晩でない part は cleanPart が落とすので、ここに残るのは
         その二つだけです。） */
      if ("time" in patch) {
        t.time = KN.util.isTime(patch.time) ? patch.time : null;
      }
      if ("part" in patch) t.part = cleanPart(patch.part);
      if (!t.due) { t.part = null; t.time = null; }
      fixBookend(t);
      if ("repeatDays" in patch) t.repeatDays = cleanDays(patch.repeatDays);
      if ("repeatNth" in patch) t.repeatNth = cleanNth(patch.repeatNth);
      if ("memo" in patch) t.memo = String(patch.memo || "");
      if ("flagged" in patch) t.flagged = !!patch.flagged;
      if ("minutes" in patch) t.minutes = cleanMinutes(patch.minutes);
      if ("icon" in patch) t.icon = cleanIcon(patch.icon);
    });
  }

  /** @returns {() => void} puts it back, in its place. */
  function removeTodo(id) {
    const at = get().todos.findIndex((t) => t.id === id);
    if (at < 0) return () => {};
    const snapshot = { ...get().todos[at] };
    update((s) => { s.todos = s.todos.filter((t) => t.id !== id); });
    return () => update((s) => {
      const next = s.todos.slice();
      next.splice(Math.min(at, next.length), 0, snapshot);
      s.todos = next;
    });
  }

  /** The day after this one for a repeating todo, counted from the due date. */
  function nextDue(todo) {
    const U = KN.util;
    const from = todo.due || U.todayKey();

    /* Counted from the due date, then walked forward past any dates already
       gone: ticking off a bin day three weeks late should set the next one to
       the coming week, not to a date still in the past. */
    let next = from;
    const step = () => {
      if (todo.repeat === "daily") { next = U.shiftDay(next, 1); return; }

      if (todo.repeat === "weekly") {
        const days = todo.repeatDays || [];
        // 「毎週 火・金」 is two bin days a week, not one every seven — so the
        // next one is the next named day, which may be two days away.
        if (days.length) {
          for (let i = 1; i <= 7; i++) {
            const cand = U.shiftDay(next, i);
            if (days.includes(U.dayOfWeek(cand))) { next = cand; return; }
          }
        }
        next = U.shiftDay(next, 7);
        return;
      }

      /* 「第2火曜」 is not a date: it moves every month, so the next one is
         worked out in the next month rather than added to this one. A month
         with no fifth Tuesday is skipped rather than rounded. */
      const nth = todo.repeatNth;
      if (nth) {
        const d = U.dayDate(next) || new Date();
        for (let m = 1; m <= 12; m++) {
          const probe = new Date(d.getFullYear(), d.getMonth() + m, 1);
          const key = U.nthWeekdayOf(probe.getFullYear(), probe.getMonth(), nth.nth, nth.weekday);
          if (key && key > next) { next = key; return; }
        }
      }
      next = U.shiftMonth(next, 1);
    };

    step();
    let guard = 0;
    while (U.daysUntil(next) < 0 && guard++ < 500) step();
    return next;
  }

  /** The first day on or after `from` that the repeat rule actually falls on. */
  function snapToRule(todo, from) {
    const U = KN.util;
    if (!from) return from;
    if (todo.repeat === "weekly" && (todo.repeatDays || []).length) {
      for (let i = 0; i <= 7; i++) {
        const cand = U.shiftDay(from, i);
        if (todo.repeatDays.includes(U.dayOfWeek(cand))) return cand;
      }
    }
    if (todo.repeat === "monthly" && todo.repeatNth) {
      const d = U.dayDate(from) || new Date();
      for (let m = 0; m <= 12; m++) {
        const probe = new Date(d.getFullYear(), d.getMonth() + m, 1);
        const key = U.nthWeekdayOf(probe.getFullYear(), probe.getMonth(),
          todo.repeatNth.nth, todo.repeatNth.weekday);
        if (key && key >= from) return key;
      }
    }
    return from;
  }

  /**
   * Tick a todo off, or put it back.
   *
   * A repeating one is never finished: ticking it moves it to its next day and
   * leaves it on the list, which is the whole point of 「毎週」. Undo has to
   * know which of the two happened, so it is handed back rather than guessed.
   *
   * @returns {{repeated: boolean, due: string|null, undo: () => void}}
   */
  function toggleTodo(id) {
    const before = getTodo(id);
    if (!before) return { repeated: false, due: null, undo: () => {} };
    const was = { done: before.done, doneAt: before.doneAt, due: before.due };
    const repeating = !before.done && !!before.repeat;
    const due = repeating ? nextDue(before) : before.due;

    /* 繰り返すものを済ませたとき、**その日に「やった」を一件残します**。

       前は次の日へ移すだけでした。毎朝の服薬も、離乳食も、済ませた
       とたんにその日から消えます。毎日やるものほど、やった跡が残らない。

       残すのは写しです（繰り返さない・その日ぶんの done 一件）。元の
       ほうは今までどおり次の日へ移ります。写しはアーカイブには入れません
       ——あそこは「やらずに片づけたもの」の置き場で、性格が違います。 */
    const traceId = repeating ? uid("t") : null;

    update((s) => {
      const t = s.todos.find((x) => x.id === id);
      if (!t) return;
      if (repeating) {
        if (t.due) {
          s.todos.push({
            ...t,
            id: traceId,
            due: t.due,          // 済ませた、その日のぶん
            repeat: null, repeatDays: [], repeatNth: null,
            notifiedFor: null,
            done: true,
            doneAt: today(),
            archived: false, archivedAt: null,
            trace: true,
            /* 記録のほうは、**その日ほんとうにどこまでやったか**を
               そのまま持ちます（写しなので、印もそのまま）。 */
            subs: (t.subs || []).map((x) => ({ ...x })),
            order: (t.order || 0),
          });
        }
        t.due = due;
        t.done = false;
        t.doneAt = null;
        /* 翌日へ行くほうは、手順の印を**まっさらに戻します**。
           きのう済ませた印が付いたまま朝を迎えると、まだ何もしていない
           のに半分終わっているように見えます。手順そのものは残ります
           ——毎日同じ順でやるから、まとめてあるので。 */
        t.subs = (t.subs || []).map((x) => ({ ...x, done: false }));
      } else {
        t.done = !t.done;
        t.doneAt = t.done ? today() : null;
        // Un-ticking is 「まだだった」, which also means it is back on the list.
        if (!t.done) { t.archived = false; t.archivedAt = null; }
      }
    });

    return {
      repeated: repeating,
      due: repeating ? due : null,
      undo: () => update((s) => {
        const t = s.todos.find((x) => x.id === id);
        if (!t) return;
        t.done = was.done;
        t.doneAt = was.doneAt;
        t.due = was.due;
        // 戻すなら、やった記録も一緒に取り消します。
        if (traceId) s.todos = s.todos.filter((x) => x.id !== traceId);
      }),
    };
  }

  /**
   * 「やった記録」を取り消します。
   *
   * 繰り返すものを済ませると、その日に写しが一件残り、元は次の日へ進みます。
   * うっかり押したとき、**今日から外す方法がありませんでした**——写しは
   * 押せない飾りで、元は明日に立っているので、今日の画面には何も無い。
   *
   * 写しを消して、元をその日へ戻します。返りは「元に戻す」の手です。
   */
  function undoTrace(traceId) {
    const trace = getTodo(traceId);
    if (!trace || !trace.trace) return null;
    /* 元は「同じ題で、繰り返しを持っていて、記録より先の日付」のもの。
       題で探すのは頼りないようですが、写しは元から作られるので、
       題・繰り返し・区分がそろっているものが元です。 */
    const origin = get().todos.find((t) => !t.trace && t.repeat
      && t.title === trace.title && t.part === trace.part);
    const wasDue = origin ? origin.due : null;
    update((s) => {
      s.todos = s.todos.filter((t) => t.id !== traceId);
      if (origin) {
        const o = s.todos.find((t) => t.id === origin.id);
        if (o) o.due = trace.due;
      }
    });
    return () => update((s) => {
      if (origin) {
        const o = s.todos.find((t) => t.id === origin.id);
        if (o) o.due = wasDue;
      }
      s.todos.push({ ...trace });
    });
  }

  /* Overdue first, then by day, then by hand-order. Undated ones come last:
     they are things to do, not things due, and a list that mixed them in
     would bury the ones with a day on them. */
  /* 毎朝 at one end of the day and 毎晩 at the other, with everything else
     between them — and inside that middle, whatever carries a clock sorts by
     it. The am/pm/night keys are never stored: they are what a *time* reads
     as, so 08:00 lands ahead of 14:30 ahead of 21:00 without a second field.
     「いつでも」 sits ahead of all of them: it is not early, it is unplaced,
     and unplaced things go where nothing is competing for the slot. */
  const PART_ORDER = { dawn: 0, am: 2, pm: 3, night: 4, dusk: 5 };
  const NO_PART_ORDER = 1;

  /** 朝 / 午後 / 夜 — from the clock when there is one, otherwise from what was
      chosen by hand. Which shelf a todo lands on is read from here, so a
      「19:30」 files itself under 夜 without anyone having said 夜. */
  /* 日のなかのどこに置くか。ふつうは時刻から読みますが、**毎朝・毎晩は
     時刻より part が勝ちます**——あれは「一日の端」という置き場所の指定で、
     時刻はいつ報せるかの指定です。7:30 の毎朝を「朝の部」に混ぜてしまうと、
     いちばん上に居るという約束が破れます。 */
  const todoPart = (t) => {
    if (!t) return null;
    if (isBookendPart(t.part)) return t.part;
    return t.time ? KN.util.partOfTime(t.time) : (t.part || null);
  };

  function sortedTodos() {
    const rank = (t) => (t.due ? KN.util.daysUntil(t.due) : Number.MAX_SAFE_INTEGER);
    // Within a day, 朝 before 午後 before 夜 — the order the day happens in.
    // Something with no part is not 「早い」, it is 「いつでも」, so it sits first
    // where nothing competes with it.
    const part = (t) => { const p = todoPart(t); return p ? PART_ORDER[p] : NO_PART_ORDER; };
    /* And within one part of a day, the clock decides. A row that says 19:30
       sits above one that says 21:00 whatever order they were typed in — that
       is what writing a time down was for. The ones with no time keep their
       hand-order and follow, since 「いつでも」 cannot be early. */
    const at = (t) => (t.time ? 0 : 1);
    return get().todos.slice().sort((a, b) =>
      rank(a) - rank(b)
      || part(a) - part(b)
      || at(a) - at(b)
      || String(a.time || "").localeCompare(String(b.time || ""))
      || (b.flagged === true) - (a.flagged === true)
      || (a.order || 0) - (b.order || 0));
  }

  /* Put away without doing it. 「もうやらない」 and 「やった」 are different
     things about the same line, so they are different flags — but they end in
     the same drawer, because what both mean to the list is 「片づいた」. */
  function archiveTodo(id, on) {
    const before = getTodo(id);
    if (!before) return () => {};
    const was = { archived: !!before.archived, archivedAt: before.archivedAt || null };
    update((s) => {
      const t = s.todos.find((x) => x.id === id);
      if (!t) return;
      t.archived = !!on;
      t.archivedAt = on ? today() : null;
    });
    return () => update((s) => {
      const t = s.todos.find((x) => x.id === id);
      if (!t) return;
      t.archived = was.archived;
      t.archivedAt = was.archivedAt;
    });
  }

  /** Still on the list: neither done nor put away. */
  const openTodos = () => get().todos.filter((t) => !t.done && !t.archived);

  /** Done or put away — the drawer at the bottom. */
  const closedTodos = () => get().todos.filter((t) => t.done || t.archived);

  /** The day a closed todo was closed, whichever way it closed. */
  const todoClosedAt = (t) => t.doneAt || t.archivedAt || null;

  /**
   * Not done, not put away, and wanted *now* — the badge.
   *
   * A time on a todo is a statement about when it starts being your problem.
   * 「19:30 に薬」 is not something the icon should be nagging about over
   * breakfast: a 1 sitting there all day for a thing that cannot be done yet
   * is the kind of number you learn to stop reading. So a timed todo joins the
   * count when its clock comes round, and yesterday's stays counted whatever
   * time it said — being late is not a thing that waits for an hour.
   */
  function todosDue() {
    const now = KN.util.nowTime();
    return openTodos().filter((t) => {
      if (!t.due) return false;
      const n = KN.util.daysUntil(t.due);
      if (n < 0) return true;
      if (n > 0) return false;
      return !t.time || t.time <= now;
    });
  }

  /** Today's timed todos whose time has not come round yet — waiting, not due. */
  function todosWaiting() {
    const now = KN.util.nowTime();
    return openTodos().filter((t) =>
      t.due && t.time && KN.util.daysUntil(t.due) === 0 && t.time > now);
  }

  /* ---- 「もう言った」 ----

     A todo is announced once per occurrence, and an occurrence is the day and
     the time it was for. Storing that pair rather than a flag means a repeating
     todo announces itself again next Tuesday, and moving 19:30 to 20:00 makes
     it a new thing to say — without anyone having to remember to clear a flag.
     Written into the record so a closed app does not forget and repeat itself
     on the way back in. */
  const occurrenceOf = (t) => (t.due && t.time ? `${t.due} ${t.time}` : null);

  /** Timed todos whose time has come and which have not been announced yet. */
  function todosToAnnounce() {
    const now = KN.util.nowTime();
    return openTodos().filter((t) => {
      if (!t.due || !t.time) return false;
      if (KN.util.daysUntil(t.due) !== 0) return false;   // 今日のぶんだけ
      if (t.time > now) return false;
      return t.notifiedFor !== occurrenceOf(t);
    });
  }

  /** Remember that these were announced, so they are not announced twice. */
  function markAnnounced(ids) {
    const want = new Set(ids);
    if (!want.size) return;
    update((s) => {
      s.todos.forEach((t) => {
        if (want.has(t.id)) t.notifiedFor = occurrenceOf(t);
      });
    });
  }

  function addItem(productId, { qty = 1, memo = "" } = {}) {
    const rec = {
      id: uid("i"),
      productId,
      qty: Math.max(1, Math.round(qty) || 1),
      memo,
      checked: false,
      // Marks the item as part of the trip being shopped right now.
      fav: false,
      addedAt: today(),
    };
    update((s) => {
      s.items.unshift(rec);
      // Putting something on the list is using it again, so it comes back out
      // of the archive. Otherwise it would sit on the list and be missing
      // from the price screen at the same time.
      const prod = s.products.find((x) => x.id === productId);
      if (prod && prod.archived) prod.archived = false;
    });
    return rec;
  }

  /**
   * Put a product away, or bring it back.
   *
   * Archived means "not in play", and that has to be true on both screens at
   * once: the card leaves the price list's main run, and the product also
   * comes off the shopping list, because something being bought today is not
   * something put away. (The reverse already holds — addItem un-archives.)
   *
   * @returns {() => void} undoes exactly this call, list rows and all.
   */
  function setArchived(productId, on) {
    const prev = getProduct(productId);
    const was = !!(prev && prev.archived);
    // The day it went in, so the drawer reads as a record of when rather than
    // an undated heap. Restored exactly on undo — an undone archiving never
    // happened, and should not leave a date behind saying it did.
    const wasAt = (prev && prev.archivedAt) || null;
    // Kept with their positions so an undo puts the rows back where they were,
    // not at the top of the list.
    const dropped = [];
    get().items.forEach((it, i) => { if (it.productId === productId) dropped.push({ at: i, item: it }); });

    update((s) => {
      const p = s.products.find((x) => x.id === productId);
      if (p) { p.archived = on; p.archivedAt = on ? today() : null; }
      if (on) s.items = s.items.filter((i) => i.productId !== productId);
    });

    return () => update((s) => {
      const p = s.products.find((x) => x.id === productId);
      if (p) { p.archived = was; p.archivedAt = wasAt; }
      if (!on) return;
      const next = s.items.slice();
      // Ascending, so each splice lands in the slot the one before it made.
      dropped.forEach(({ at, item }) => next.splice(Math.min(at, next.length), 0, item));
      s.items = next;
    });
  }

  function addPrice(productId, { storeId, price, amount, date }) {
    const rec = {
      id: uid("pr"),
      storeId,
      price: Number(price),
      amount: isFinite(amount) && amount > 0 ? amount : null,
      date: date || today(),
    };
    update((s) => {
      const p = s.products.find((x) => x.id === productId);
      if (p) p.prices.push(rec);
    });
    return rec;
  }

  /**
   * カテゴリの中の並び順。
   *
   * 触っていないうちは五十音のままです——並べた覚えのない棚が勝手に
   * 並び替わっているのは、便利ではなく不気味なので。一度でも持ち上げて
   * 動かしたら、その棚は **並べたとおり** になります。あとから増えた商品は
   * 順番を持たないので、いちばん後ろに付きます。
   */
  function productOrder(a, b) {
    const ao = typeof a.order === "number" ? a.order : Infinity;
    const bo = typeof b.order === "number" ? b.order : Infinity;
    if (ao !== bo) return ao - bo;
    return kanaOrder(a, b);
  }

  const kanaOrder = (a, b) =>
    KN.util.foldKana(a.name).localeCompare(KN.util.foldKana(b.name), "ja");

  /**
   * その商品の絵の名前。手で選んでいればそれ、選んでいなければ名前から、
   * 名前で当たらなければカテゴリの名前から。当たらなければ "" です。
   *
   * productMark() が絵を決める順番と、ここは同じでなければいけません。
   * 違うと「同じ絵に見えるのに離れて並ぶ」ことになります。
   */
  function iconKeyOf(p) {
    if (!p) return "";
    if (p.icon && KN.productIcons.byKey(p.icon)) return p.icon;
    const own = KN.productIcons.findKey(p.name);
    if (own) return own;
    const cat = getCategory(p.categoryId);
    return (cat && KN.productIcons.findKey(cat.name)) || "";
  }

  /**
   * ひとつのカテゴリの中を並べます。
   *
   * 手で並べた棚は、並べたとおり。触っていない棚は五十音——ただし
   * **同じ絵のものは寄せます**。「牛乳」と「低脂肪牛乳」が五十音の
   * 都合で棚の端と端に離れているのは、探すときの見え方と合いません。
   * 目は文字より先に絵を拾うので、絵が同じものは近くにあってほしい。
   *
   * 寄せ方は「グループごと動かす」のではなく、**そのグループでいちばん
   * 早い名前の場所へ、仲間を連れてくる** 形にします。こうすると全体は
   * 五十音のままに見えて、同じ絵だけが束になります。
   *
   * @param {Array} list ひとつのカテゴリの商品
   */
  function sortProductsInCategory(list) {
    const rows = [...list];
    // 手で並べた商品が一つでもあるなら、その棚は人の決めた順が全部に優先。
    if (rows.some((p) => typeof p.order === "number")) return rows.sort(productOrder);

    /* 絵の名前は、商品ひとつにつき一度だけ引きます。
       iconKeyOf() は当たるまでキーワード表（いま1,700語、絵を増やせば 3,000語）を
       上から舐めるので、比較関数の中から呼ぶと 1 回の並べ替えで数千回走ります。
       ここで一度引いて表にしておけば、比較は文字列の突き合わせだけになります。 */
    const keyOf = new Map();
    rows.forEach((p) => keyOf.set(p, iconKeyOf(p) || ("\u0000" + p.id)));

    const first = new Map();          // 絵の名前 → その絵でいちばん早い名前
    rows.forEach((p) => {
      const k = keyOf.get(p);                        // 絵の無いものは束ねない
      const cur = first.get(k);
      if (!cur || kanaOrder(p, cur) < 0) first.set(k, p);
    });

    return rows.sort((a, b) => {
      const ka = keyOf.get(a);
      const kb = keyOf.get(b);
      if (ka === kb) return kanaOrder(a, b);          // 同じ絵の中は五十音
      return kanaOrder(first.get(ka), first.get(kb))  // 束どうしは、先頭の名前で
        || ka.localeCompare(kb);
    });
  }

  /**
   * ひとつのカテゴリを、渡された並びに固定します。
   * そのカテゴリの商品を **ぜんぶ** 番号で振り直すので、一度並べれば
   * その棚は以後ずっと並べたとおり。ほかのカテゴリには触りません。
   * @returns 初めてその棚に手を入れたなら true
   */
  function reorderProducts(ids) {
    let first = false;
    update((s) => {
      const byId = new Map(s.products.map((p) => [p.id, p]));
      first = ids.every((id) => {
        const p = byId.get(id);
        return p && typeof p.order !== "number";
      });
      ids.forEach((id, i) => {
        const p = byId.get(id);
        if (p) p.order = i;
      });
    });
    return first;
  }

  /* ---------------- ダイエットの出し入れ ---------------- */

  const diet = () => state.diet;

  /* weights/meals/drinks/health は増える一方の配列で、weightOfDay 等は
     グラフの期間や分析の日数ぶん、日ごとに何度も呼ばれます。毎回
     ぜんぶを filter() すると、記録が長くなるほど遅くなるので、
     日付→その日の記録、という索引を作って使い回します。
     作り直すのは state が本当に動いたとき（version が変わったとき）
     だけです——読み出し用の索引なので、直接は書き換えません。 */
  let dietIndexVersion = -1;
  let dietIndex = null;

  function groupByDay(list) {
    const map = new Map();
    list.forEach((rec) => {
      let arr = map.get(rec.day);
      if (!arr) map.set(rec.day, arr = []);
      arr.push(rec);
    });
    return map;
  }

  function dietIndex_() {
    if (dietIndexVersion === version) return dietIndex;
    const d = diet();
    dietIndex = {
      weights: groupByDay(d.weights),
      meals: groupByDay(d.meals),
      drinks: groupByDay(d.drinks),
      health: groupByDay(d.health),
    };
    dietIndexVersion = version;
    return dietIndex;
  }

  /* --- 体重 --- */

  function addWeight({ day, time, kg, fat, memo, meal, clothed, source, externalId } = {}) {
    const rec = cleanWeight({
      day: day || KN.util.todayKey(),
      time: time || KN.util.nowTime(),
      kg, fat, memo, meal, clothed, source, externalId,
      importedAt: source === "health" ? new Date().toISOString() : null,
    }, 0);
    if (!rec) return null;
    update((s) => { s.diet.weights.push(rec); });
    return rec;
  }

  function updateWeight(id, patch) {
    update((s) => {
      const w = s.diet.weights.find((x) => x.id === id);
      if (!w) return;
      const next = cleanWeight({ ...w, ...patch }, 0);
      if (next) Object.assign(w, next, { id: w.id });
    });
  }

  function removeWeight(id) {
    update((s) => { s.diet.weights = s.diet.weights.filter((w) => w.id !== id); });
  }

  /** 新しい順。同じ日に何度も乗ることがあるので、日だけでなく時刻まで見ます。 */
  function sortedWeights() {
    return [...diet().weights].sort((a, b) =>
      (b.day + " " + (b.time || "00:00")).localeCompare(a.day + " " + (a.time || "00:00")));
  }

  /** その日の代表値。一日に何度も測った日は、最初の一回を採ります——
      起き抜けの体重がいちばん条件がそろっているので。 */
  function weightOfDay(day) {
    const list = (dietIndex_().weights.get(day) || []).slice()
      .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
    return list.length ? list[0] : null;
  }

  function latestWeight() {
    const list = sortedWeights();
    return list.length ? list[0] : null;
  }

  /**
   * 前回どんな条件で量ったか。次の一件にそのまま出しておくためのものです。
   * 量る条件はふつう毎日おなじなので、毎回二つ選ばせるのは手数の無駄。
   * それでも **既定では埋めません**——一度も選んでいない人に、こちらが
   * 決めた条件を書き込むのは、記録ではなく作り話なので。
   */
  function lastWeightCondition() {
    const found = sortedWeights().find((w) => w.meal != null || w.clothed != null);
    return found ? { meal: found.meal, clothed: found.clothed } : { meal: null, clothed: null };
  }

  /* --- 食事 --- */

  function addMeal({ day, time, slot, items, memo, ai } = {}) {
    const rec = cleanMeal({
      day: day || KN.util.todayKey(),
      // time: null は「時刻を持たない」です（区分だけで書く記録がこれ）。
      time: time === null ? null : (time || KN.util.nowTime()),
      slot, items, memo, ai,
    }, 0);
    if (!rec) return null;
    update((s) => { s.diet.meals.push(rec); });
    return rec;
  }

  function updateMeal(id, patch) {
    update((s) => {
      const m = s.diet.meals.find((x) => x.id === id);
      if (!m) return;
      const next = cleanMeal({ ...m, ...patch }, 0);
      if (next) Object.assign(m, next, { id: m.id });
    });
  }

  function removeMeal(id) {
    update((s) => { s.diet.meals = s.diet.meals.filter((m) => m.id !== id); });
  }

  function mealsOfDay(day) {
    const order = { memo: -1, breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
    return (dietIndex_().meals.get(day) || []).slice()
      .sort((a, b) => (order[a.slot] - order[b.slot]) || String(a.time).localeCompare(String(b.time)));
  }

  /* --- 区分ごとの食事メモ ---

     朝・昼・夜・間食の四つを、それぞれ一枚の紙として読み書きします。
     入れ物は前と同じ meals のままです（作り替えると、いままでの記録が
     読めなくなります）。同じ区分に何件も残っている古い記録は、読むときに
     つなげて一つの文として見せ、書くときに一件へまとめます——ただし、
     数（items）を持っている記録は消しません。文だけを預かります。 */

  /** その区分に書いてあることを、一本の文にして返します。 */
  function slotMemo(day, slot) {
    return mealsOfDay(day)
      .filter((m) => m.slot === slot && String(m.memo || "").trim())
      .map((m) => m.memo.trim())
      .join("\n");
  }

  /** その区分の文を書き換えます。空にすると、数を持たない記録は消えます。 */
  function setSlotMemo(day, slot, text) {
    if (!MEAL_SLOTS.includes(slot) || slot === "memo") return null;
    const list = mealsOfDay(day).filter((m) => m.slot === slot);
    const memo = String(text == null ? "" : text).trim();
    if (!list.length) return memo ? addMeal({ day, slot, time: null, memo }) : null;
    // 一件目に文をまとめ、残りからは文だけを外します（数は残します）。
    list.slice(1).forEach((m) => {
      if (m.items.length || m.ai) updateMeal(m.id, { memo: "" });
      else removeMeal(m.id);
    });
    const head = list[0];
    if (!memo && !head.items.length && !head.ai) { removeMeal(head.id); return null; }
    updateMeal(head.id, { memo });
    return diet().meals.find((m) => m.id === head.id) || null;
  }

  /**
   * 食べたもの・書いたことから、文字でさがします。
   *
   * 探す先は、人が**自分で書いた文**（各区分のメモと、その日の一言）と、
   * 数として並べた食品の名まえです。日ごとにまとめて、新しい順に返します。
   * 「あの日、何食べたっけ」に答えるためのものなので、日そのものが答え
   * ——画面はここから、その日へ跳びます。
   */
  function searchDietDays(q) {
    const needle = foldKana(String(q || "").trim().toLowerCase());
    if (!needle) return [];
    const hit = (s) => !!s && foldKana(String(s).toLowerCase()).indexOf(needle) >= 0;
    const byDay = new Map();
    diet().meals.forEach((m) => {
      const found = [];
      if (hit(m.memo)) found.push(String(m.memo).trim());
      m.items.forEach((it) => { if (hit(it.name)) found.push(it.name); });
      if (!found.length) return;
      const cur = byDay.get(m.day) || { day: m.day, slots: [], text: [] };
      if (!cur.slots.includes(m.slot)) cur.slots.push(m.slot);
      found.forEach((w) => { if (!cur.text.includes(w)) cur.text.push(w); });
      byDay.set(m.day, cur);
    });
    return [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  }

  /* --- 一日ぶんの食事メモ ---

     時間帯に分けて書くのは、続きません。書くのは一本の文で、
     あとから数を足したくなったらその同じ一件に足します
     （別の入れ物にすると、メモと数が離れて、どちらが本当か分からなく
     なります）。一日に一件だけです。 */
  function dayMemo(day) {
    return diet().meals.find((m) => m.day === day && m.slot === "memo") || null;
  }

  /**
   * メモを書き換えます。空にすると、数も持っていなければ消えます。
   * items と ai は、渡さなければ **いまのものを残します**（メモだけ直したい
   * ときに、AIの推計まで消えてしまわないように）。
   */
  function setDayMemo(day, text, items, ai) {
    const cur = dayMemo(day);
    const memo = String(text == null ? (cur ? cur.memo : "") : text);
    const next = items === undefined ? (cur ? cur.items : []) : items;
    const nextAi = ai === undefined ? (cur ? cur.ai : null) : ai;
    if (!memo.trim() && !(next || []).length && !nextAi) {
      if (cur) removeMeal(cur.id);
      return null;
    }
    if (cur) { updateMeal(cur.id, { memo, items: next, ai: nextAi }); return dayMemo(day); }
    return addMeal({ day, slot: "memo", memo, items: next, ai: nextAi });
  }

  /* --- お酒 --- */

  function addDrink(d) {
    const rec = cleanDrink(d);
    if (!rec) return null;
    update((st) => { st.diet.drinks.push(rec); });
    return rec;
  }

  function updateDrink(id, patch) {
    let out = null;
    update((st) => {
      const i = st.diet.drinks.findIndex((x) => x.id === id);
      if (i < 0) return;
      const merged = cleanDrink({ ...st.diet.drinks[i], ...patch, id });
      if (merged) { st.diet.drinks[i] = merged; out = merged; }
    });
    return out;
  }

  function removeDrink(id) {
    update((st) => { st.diet.drinks = st.diet.drinks.filter((x) => x.id !== id); });
  }

  function drinksOfDay(day) {
    return (dietIndex_().drinks.get(day) || []).slice()
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || ""))
                   || String(a.at).localeCompare(String(b.at)));
  }

  /** その日の合計。飲んでいない日は null（0 と「無い」は別のことです）。 */
  function drinkTotals(day) {
    return KN.drinks ? KN.drinks.totals(drinksOfDay(day)) : null;
  }

  /** --- その人の食品 --- */

  function addUserFood(food) {
    const rec = cleanUserFood(food);
    if (!rec) return null;
    update((s) => { s.diet.foods.push(rec); });
    return rec;
  }

  function removeUserFood(id) {
    update((s) => { s.diet.foods = s.diet.foods.filter((f) => f.id !== id); });
  }

  /** その人の食品を先に、無ければ成分表から。直した値のほうが本人には正しい。 */
  function findFood(name) {
    const key = KN.util.foldKana(String(name || "").trim());
    if (!key) return null;
    const mine = diet().foods.find((f) => KN.util.foldKana(f.name) === key);
    if (mine) return mine;
    return KN.foodData.lookup(name);
  }

  /* --- 機械が測ったもの --- */

  /**
   * ヘルスケアからの一件を入れる。同じものが二度入らないようにするのが
   * ここの仕事です。見分け方は二段構え——
   *   1. externalId が来ていれば、それが同じなら同じもの（上書き）
   *   2. 一日ぶんで一つに決まる種目（歩数など）は、その日のぶんを差し替え
   * どちらでもなければ新しい一件として足します。
   * @returns "added" | "updated" | null
   */
  function putHealth(sample) {
    const rec = cleanHealth({ ...sample, importedAt: new Date().toISOString() });
    if (!rec) return null;
    let result = "added";
    update((s) => {
      const list = s.diet.health;
      let at = -1;
      if (rec.externalId) {
        at = list.findIndex((h) => h.externalId && h.externalId === rec.externalId);
      }
      /* 日ごとに一つの種目でも、外の印を持っている一件は差し替えの相手に
         しません。印があるということは「その一件」を指しているので、
         その日ぜんぶの代表として上書きしてよいものではありません。 */
      if (at < 0 && !rec.externalId && DAILY_TYPES.includes(rec.type)) {
        at = list.findIndex((h) => h.type === rec.type && h.day === rec.day && !h.externalId);
      }
      /* 手で書いた値は、取り込みで消しません——体重と同じ扱いです。
         打ったということは、その人がその数を正しいと思ったということ。
         また機械に任せたくなったら、記録の画面でその値を消せば、次の
         取り込みからまた入ってくるようになります。 */
      if (at >= 0 && list[at].source === "manual" && rec.source !== "manual") {
        result = "kept";
        return;
      }
      if (at >= 0) {
        const keepId = list[at].id;
        list[at] = { ...rec, id: keepId };
        result = "updated";
      } else {
        list.push(rec);
      }
    });
    return result === "kept" ? null : result;
  }

  /** 手で書く／直す。取り込みとは別の入口です。 */
  function setHealth(day, type, value, extra) {
    const rec = cleanHealth({
      type, day, value,
      unit: (extra && extra.unit) || "",
      label: (extra && extra.label) || "",
      kcal: extra && extra.kcal,
      time: extra && extra.time,
      source: "manual",
    });
    if (!rec) return null;
    update((s) => {
      const at = s.diet.health.findIndex((h) => h.type === type && h.day === day && !h.externalId);
      if (at >= 0) s.diet.health[at] = { ...rec, id: s.diet.health[at].id };
      else s.diet.health.push(rec);
    });
    return rec;
  }

  /** その日のその種目を消す。消せば、次の取り込みでまた機械の値が入ります。 */
  function clearHealth(day, type) {
    update((s) => {
      s.diet.health = s.diet.health.filter((h) => !(h.day === day && h.type === type));
    });
  }

  function removeHealth(id) {
    update((s) => { s.diet.health = s.diet.health.filter((h) => h.id !== id); });
  }

  /** その日のその種目。日ごとに一つのものは一件、ワークアウトは全部。 */
  function healthOfDay(day, type) {
    const list = dietIndex_().health.get(day) || [];
    return type ? list.filter((h) => h.type === type) : list.slice();
  }

  /** その日のその種目の合計。無ければ null——0 と「測っていない」は違います。 */
  function healthValue(day, type) {
    const list = healthOfDay(day, type);
    if (!list.length) return null;
    if (DAILY_TYPES.includes(type)) {
      // 日ごとに一つのはずですが、外から入ったものが並んだときは最大を採ります
      // （一日の途中で取り込んだ半端な歩数が、夜のぶんを消さないように）。
      return list.reduce((max, h) => Math.max(max, h.value), 0);
    }
    return list.reduce((sum, h) => sum + h.value, 0);
  }

  function setGoal(patch) {
    update((s) => { s.diet.goal = { ...s.diet.goal, ...patch }; });
  }

  function markSynced(counts) {
    update((s) => {
      // 入ったのだから、読めなかった印はここで消えます。
      s.diet.sync = { lastAt: new Date().toISOString(), added: counts.added || 0,
                      updated: counts.updated || 0, lockedAt: null };
    });
  }

  /** 読めない便が届いた（ロック中のショートカット）。記録には触りません。 */
  function markSyncLocked() {
    update((s) => { s.diet.sync = { ...s.diet.sync, lockedAt: new Date().toISOString() }; });
  }

  /** ダイエットの記録だけを消す。買い物とやることには触れません。 */
  function clearDiet() {
    update((s) => { s.diet = emptyDiet(); });
  }

  /* ---------------- daily ---------------- */

  /* 日付は「日のかぎ」（YYYY-MM-DD）で持ちます。today() は時刻まで持つので、
     そのまま入れると こよみの粒も「その日だけ」の絞り込みも当たりません
     （月の絞り込みだけは先頭7文字で偶然当たるので、気づきにくい種類の食い違い
     です）。入口で一度だけ削ります。 */
  const dayKeyOf = (v) => String(v || todayKey()).slice(0, 10);

  const archive = () => state.archive || (state.archive = emptyArchive());
  const stamp = () => new Date().toISOString();

  /**
   * 積み上がりを一つ足します。
   *
   * **必須は type と title だけ**です。amount も unit も memo も、無いまま
   * 記録が成立します——「何ページ読んだか」を思い出せないと書けない仕組みは、
   * 書かない理由になります。ここで入力を止めないことのほうが、数の正確さより
   * ずっと大事です。
   */
  function addEntry(e) {
    const at = stamp();
    const row = {
      id: uid(),
      date: dayKeyOf(e.date),
      type: e.type || "done",
      title: String(e.title || "").trim(),
      amount: (e.amount === "" || e.amount == null) ? null : Number(e.amount),
      unit: e.unit || null,
      memo: e.memo ? String(e.memo) : "",
      tags: Array.isArray(e.tags) ? e.tags : [],
      favorite: false,
      // 読書だけが使います。他の種類では null のままです。
      kind: e.kind || null,
      author: e.author ? String(e.author).trim() : null,
      pageFrom: (e.pageFrom === "" || e.pageFrom == null) ? null : Number(e.pageFrom),
      pageTo: (e.pageTo === "" || e.pageTo == null) ? null : Number(e.pageTo),
      createdAt: at,
      updatedAt: at,
    };
    if (!isFinite(row.amount)) row.amount = null;
    if (!isFinite(row.pageFrom)) row.pageFrom = null;
    if (!isFinite(row.pageTo)) row.pageTo = null;
    applyReadingPages(row);
    update((s) => { s.archive.entries.push(row); });
    return row;
  }

  /* 開始・終了ページから、読んだページ数を出します。120→150 なら 31ページ。
     終了が開始より小さい・どちらか欠けている、のときは何も計算しません
     ——当てずっぽうの数を出すより、空のほうがまだ正直です。 */
  function applyReadingPages(row) {
    if (row.type !== "reading") return;
    if (row.pageFrom != null && row.pageTo != null && row.pageTo >= row.pageFrom) {
      // 開始・終了の両方を読んだページに数えます（120ページ目から150ページ目
      // までなら、両端を含めて31ページぶん読んだことになります）。
      row.amount = row.pageTo - row.pageFrom + 1;
      row.unit = "ページ";
    } else {
      row.amount = null;
    }
  }

  function updateEntry(id, patch) {
    update((s) => {
      const row = s.archive.entries.find((x) => x.id === id);
      if (!row) return;
      Object.assign(row, patch);
      if (patch.date !== undefined) row.date = dayKeyOf(patch.date);
      if (patch.pageFrom !== undefined) {
        row.pageFrom = (patch.pageFrom === "" || patch.pageFrom == null) ? null : Number(patch.pageFrom);
        if (!isFinite(row.pageFrom)) row.pageFrom = null;
      }
      if (patch.pageTo !== undefined) {
        row.pageTo = (patch.pageTo === "" || patch.pageTo == null) ? null : Number(patch.pageTo);
        if (!isFinite(row.pageTo)) row.pageTo = null;
      }
      if (row.type === "reading") {
        applyReadingPages(row);
      } else if (patch.amount === "" || patch.amount == null) {
        row.amount = null;
      } else if (!isFinite(Number(row.amount))) {
        row.amount = null;
      } else {
        row.amount = Number(row.amount);
      }
      // 直した時刻。並び順はこれで決まります。お気に入りの付け外しはここを
      // 通らないので（toggleFavorite）、中身を直したときだけ動きます。
      row.updatedAt = stamp();
    });
  }

  function removeEntry(id) {
    update((s) => { s.archive.entries = s.archive.entries.filter((x) => x.id !== id); });
  }

  /** 種を達成に変えます。書いた時刻は残し、種だった記憶だけ畳みます。 */
  function promoteSeed(id) {
    update((s) => {
      const row = s.archive.entries.find((x) => x.id === id);
      if (!row || row.type !== "seed") return;
      row.type = "done";
      row.updatedAt = stamp();
    });
  }

  /* お気に入りの付け外し。**直した時刻は動かしません**——星を付けることは
     中身の書き直しではないので、「直: 」の印がここでは出てほしくないのと、
     並び順（最後に触った順）が星ひとつで乱れてほしくないためです。 */
  function toggleFavorite(id) {
    update((s) => {
      const row = s.archive.entries.find((x) => x.id === id);
      if (row) row.favorite = !row.favorite;
    });
  }

  /* 並びは **最後に触った順**。書いた順ではありません——去年の本に一行
     足したなら、いまのあなたはその本のことを考えているので、上に来ます。 */
  const byRecent = (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  const byFavoriteThenRecent = (a, b) =>
    (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || byRecent(a, b);
  const byDateThenRecent = (a, b) => String(b.date).localeCompare(String(a.date)) || byRecent(a, b);

  const entriesOfMonth = (ym) =>
    archive().entries.filter((e) => String(e.date).slice(0, 7) === ym).slice().sort(byRecent);
  const entriesOfDay = (day) =>
    archive().entries.filter((e) => e.date === day).slice().sort(byRecent);
  const openSeeds = () =>
    archive().entries.filter((e) => e.type === "seed").slice().sort(byRecent);

  /** 種類ごとの数。**総数の比較には使いません**——内訳を並べるだけです。 */
  function monthCounts(ym) {
    const out = {};
    entriesOfMonth(ym).forEach((e) => { out[e.type] = (out[e.type] || 0) + 1; });
    return out;
  }

  /**
   * 読書・論文の、前に打った名前と著者。次に書くときの下敷きにします。
   *
   * 別に保存はしません——entries そのものが記録なので、そこから拾えば
   * 十分です。名前が同じもの（かなの揺れは吸います）は一つにまとめ、
   * いちばん新しく使ったものを残します。
   */
  function readingCandidates() {
    const seen = new Map();
    archive().entries
      .filter((e) => e.type === "reading" && e.title)
      .sort(byRecent)
      .forEach((e) => {
        const key = foldKana(e.title.trim());
        if (!seen.has(key)) {
          seen.set(key, { title: e.title, author: e.author || "", kind: e.kind || "book", at: e.updatedAt });
        }
      });
    return [...seen.values()];
  }

  /** いちばん最近書いた読書記録の名前・著者。新規シートの下敷きにします。 */
  function lastReading() {
    const list = readingCandidates();
    return list.length ? list[0] : null;
  }

  /* 文字でさがす。タイトル・メモ・タグを見ます。かなの揺れは foldKana が
     吸うので、「ぎんこう」でも「銀行」でも同じところに着きます。 */
  function searchEntries(q) {
    const needle = foldKana(String(q || "").trim().toLowerCase());
    if (!needle) return [];
    return archive().entries.filter((e) => {
      const hay = foldKana([e.title, e.memo, (e.tags || []).join(" ")].join(" ").toLowerCase());
      return hay.indexOf(needle) >= 0;
    }).slice().sort(byRecent);
  }

  /* ---- その日の地の文 ---- */

  const dayLog = (day) => archive().days.find((d) => d.date === day) || null;

  /**
   * その日の行を、無ければ用意します。
   *
   * 日が変わったら、その日の欄が**最初からそこにある**ようにするためです。
   * 前は何か書くまで行そのものが無く、書き始めるには「今日を書く」を押して
   * シートを開く必要がありました。日誌は、開いたら今日の欄が待っている
   * ほうが自然です。
   *
   * 中身は空のまま——内容も時刻も「-」で出ます。setDayLog の「空なら消す」
   * とは別の道を通します（あちらは人が消したときの話で、こちらは
   * 「まだ何も書いていない今日」を置く話なので）。
   */
  function ensureDayLog(day) {
    const d = dayKeyOf(day);
    if (dayLog(d)) return dayLog(d);
    update((s) => {
      if (s.archive.days.some((x) => x.date === d)) return;
      s.archive.days.push({
        date: d, memo: "", wake: null, sleep: null,
        wakeSource: "manual", sleepSource: "manual",
        createdAt: null,      // まだ人が書いていないので、作成時刻も持ちません（「-」で出ます）
        updatedAt: null,
      });
    });
    return dayLog(d);
  }

  /**
   * 一日ぶんを書き換えます。**空にしたら行ごと消えます**——書きかけの空行が
   * 溜まると、月を眺めたときに「何も書いていない日」と「空の行がある日」が
   * 見分けられなくなります（setDayMemo と同じ考え方）。
   */
  function setDayLog(day, patch, opts) {
    /* 誰が書いたか。人が打ったものは "manual"、ヘルスケアからの取り込みは
       "health"。**取り込みは手で打った時刻を上書きしません**——毎朝の便が
       黙って直しにくると、直したことのほうが消えるので（putHealth が体重で
       やっているのと同じ決めごとです）。 */
    const from = (opts && opts.source) || "manual";
    update((s) => {
      const cur = s.archive.days.find((d) => d.date === day);
      /* 印は**起床と就寝で別々に**持ちます。一つで兼ねると、取り込みが
         起床を書いた時点で印が health に変わり、その同じ便の次の一手で
         就寝の手入力保護が外れます（実データで踏みました）。 */
      const srcOf = (field) => {
        const k = field === "wake" ? "wakeSource" : "sleepSource";
        return (cur && cur[k]) ? cur[k] : "manual";
      };
      const keepTime = (field) => {
        const mine = cur ? cur[field] : null;
        // 取り込みは、人が入れた時刻には触れません。
        if (from !== "manual" && mine && srcOf(field) === "manual") return { v: mine, kept: true };
        if (patch[field] === undefined) return { v: mine, kept: true };
        return { v: patch[field] || null, kept: false };
      };
      const w = keepTime("wake"), sl = keepTime("sleep");
      const next = {
        date: day,
        memo: patch.memo === undefined ? (cur ? cur.memo : "") : String(patch.memo || ""),
        wake: w.v,
        sleep: sl.v,
        createdAt: cur ? cur.createdAt : stamp(),
      };
      /* 実際に書き替えた欄だけ、書き手の印を更新します（メモだけ直したときに
         時刻の出どころが人へ移ってしまわないように）。 */
      next.wakeSource = w.kept ? srcOf("wake") : from;
      next.sleepSource = sl.kept ? srcOf("sleep") : from;

      /* 睡眠の四つの型。持っていれば残し、渡されたら差し替えます。
         画面には出しません——月の書き出しに載せるためのものです。 */
      const stages = patch.sleepStages === undefined
        ? (cur ? cur.sleepStages : null)
        : (patch.sleepStages || null);
      if (stages) next.sleepStages = stages;

      const empty = !next.memo.trim() && !next.wake && !next.sleep && !next.sleepStages;
      s.archive.days = s.archive.days.filter((d) => d.date !== day);
      if (!empty) {
        /* 「更新」は**人が書き直したこと**を言う印です。毎朝の取り込みで
           動かすと、触ってもいない日が更新済みになり、何も言わなくなります。
           取り込みは更新日時に触れません。 */
        next.updatedAt = from === "manual" ? stamp() : (cur ? cur.updatedAt : stamp());
        s.archive.days.push(next);
      }
    });
    return dayLog(day);
  }

  /* 月ぶんの地の文。**日付の新しい順**です。
     いちどは「書いた・直した順」にしていましたが、これは日誌には向きません
     ——26日に一行足しただけで、26日が27日の上に来ます。暦の並びが崩れると、
     どこを読んでいるのか分からなくなる。積み上がり（entries）が更新順なのは
     一つ一つが独立しているからで、日誌は日付そのものが背骨です。 */
  const daysOfMonth = (ym) =>
    archive().days.filter((d) => String(d.date).slice(0, 7) === ym)
      .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));

  /* ---- あの日 ----

     貯めた記録を、**返す**ところです。

     ここまでで作ったのは貯める器だけでした。一年ぶん書けるようにしても、
     書いたものを自分から出してこなければ、そのうち開かれなくなります。
     日記アプリでいちばん人が戻ってくる仕掛けは、ずっと「同じ日付の過去を
     出す」ことでした——評価ではなく、**思い出させること**です。

     この機能に、守らなければならない線が一本あります。

       **無い過去のことは、何も言わない。**

     「去年の今日は書いていました」と出すのは思い出ですが、「去年は書いて
     いたのに今年は書いていません」は採点です。同じ仕組みが、出し方ひとつで
     どちらにもなる。だから **見つからなければカードごと出しません**
     ——「まだ記録がありません」も出しません。それも「無い」を数えた言葉です。

     出すのは一つだけです。並べると流れになり、流れは読み飛ばすものになります。

     選ぶ順は「遠い記念日から」。同じ月日の去年 → 一昨年 …→ ちょうど半年前
     → 三ヶ月前 → 一ヶ月前。どれも無ければ、**過ぎた日のどれか一つ**を、
     今日の日付から決まる決め方で選びます（同じ日のあいだは同じものが出て、
     明くる日には別のものになる——毎回変わると、目を離した隙に消える紙に
     なります）。 */

  /** 「あの日」の候補になる、過ぎた日の並び。近い順ではなく遠い順。 */
  function thenCandidates(day) {
    const base = KN.util.dayDate(day);
    if (!base) return [];
    const out = [];
    const y = base.getFullYear(), m = base.getMonth(), d = base.getDate();
    /* 同じ月日の、過ぎた年。10年ぶん見ます（それより前は、あっても
       「あの日」というより歴史です）。2月29日は、無い年には出ません
       ——Date が3月1日へ送るので、日が変わっていないかを確かめます。 */
    for (let back = 10; back >= 1; back--) {
      const t = new Date(y - back, m, d);
      if (t.getDate() !== d) continue;
      out.push({ date: KN.util.dayKey(t), label: `${back}年前の今日` });
    }
    // 年に届かないうちも使えるように、月でも刻みます。
    [[6, "半年前の今日"], [3, "3ヶ月前の今日"], [1, "1ヶ月前の今日"]].forEach(([back, label]) => {
      const t = new Date(y, m - back, d);
      if (t.getDate() !== d) return;   // 8月31日の1ヶ月前は「7月31日」だけ
      out.push({ date: KN.util.dayKey(t), label });
    });
    return out;
  }

  /** その日に何か書いてあるか（記録か、地の文か）。 */
  function thenOfDay(date, label) {
    const rows = entriesOfDay(date);
    const log = dayLog(date);
    const memo = log && String(log.memo || "").trim();
    if (!rows.length && !memo) return null;
    return { date, label, entries: rows, memo: memo || "" };
  }

  /**
   * 今日に返す「あの日」を一つ。無ければ null（カードごと出しません）。
   *
   * @param {string} [day] 今日として扱う日。試験のために外から渡せます。
   */
  function archiveThen(day) {
    const today = dayKeyOf(day || todayKey());
    for (const c of thenCandidates(today)) {
      const hit = thenOfDay(c.date, c.label);
      if (hit) return hit;
    }
    /* 記念日が無ければ、過ぎた日のどれか一つ。何日ぶんあるかは数えません
       ——数えると「◯日ぶん貯まりました」が書きたくなるので、並びから
       一つ取るだけにします。選ぶ位置は今日の日付から決めるので、同じ日の
       あいだは動かず、明くる日には別の日になります。 */
    const past = [...new Set([
      ...archive().entries.map((e) => e.date),
      ...archive().days.filter((d) => String(d.memo || "").trim()).map((d) => d.date),
    ])].filter((d) => d && d < today).sort();
    if (!past.length) return null;
    const seed = Number(String(today).replace(/-/g, "")) % past.length;
    const pick = past[seed];
    return thenOfDay(pick, null);
  }

  /**
   * 月ぶんを、まるごと一つの形にして返します。
   *
   * いまは書き出しにしか使いませんが、**後でこの月がどんな時間だったかを
   * 言葉にしてもらう**ときに、そのまま渡せる形にしてあります。数だけ渡すと
   * 数の話しか返ってきません。地の文（days）が一緒に入っているのはそのためです。
   */
  function exportMonth(ym) {
    return {
      app: "kaimono-note",
      kind: "daily-month",
      ym,
      exportedAt: stamp(),
      days: daysOfMonth(ym),
      entries: entriesOfMonth(ym),
      counts: monthCounts(ym),
    };
  }

  /* ---------------- import / export ---------------- */

  function exportJSON() {
    return JSON.stringify({ ...state, exportedAt: today(), app: "kaimono-note" }, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("形式が正しくありません");
    const next = parsed.schema >= 2 ? reconcile(parsed) : migrateV1(parsed);
    update((s) => {
      s.schema = SCHEMA;
      s.categories = next.categories;
      s.stores = next.stores;
      s.products = next.products;
      s.items = next.items;
      s.todos = next.todos;
      s.diet = next.diet;
      s.settings = next.settings;
      // おぼえた振り分け（商品名→カテゴリ）。書き出しには入っているのに
      // ここで戻し忘れていたので、復元すると学習だけが消えていました。
      s.learned = next.learned;
      // daily。上と同じ理由で、ここに書きます——この列挙は足し忘れると
      // 「書き出しには入っているのに、戻すと消える」を静かに起こします。
      s.archive = next.archive;
    });
  }

  function reset() {
    update((s) => {
      const fresh = emptyState();
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, fresh);
    });
  }

  /* ---------------- sample data ---------------- */

  function loadSample() {
    const fresh = emptyState();
    const mk = (name, color, order) => ({ id: uid("s"), name, color, order });
    const aeon   = mk("イオン",        STORE_COLORS[0], 0);
    const gyomu  = mk("業務スーパー",  STORE_COLORS[2], 1);
    const drug   = mk("ドラッグ100",   STORE_COLORS[1], 2);
    fresh.stores = [aeon, gyomu, drug];

    const P = (name, categoryId, amount, unit, prices) => {
      const p = {
        id: uid("p"), name, categoryId,
        amount: amount || null, unit: unit || "", note: "", prices: [],
      };
      prices.forEach(([store, price]) => {
        p.prices.push({ id: uid("pr"), storeId: store.id, price, amount: null, date: today() });
      });
      fresh.products.push(p);
      return p;
    };

    const soap  = P("食器用洗剤",         "c-clean", 500, "ml", [[aeon, 298], [drug, 258], [gyomu, 320]]);
    const paper = P("トイレットペーパー", "c-clean", 12,  "ロール", [[aeon, 398], [drug, 358]]);
    const milk  = P("牛乳",               "c-cold",  1,   "L",  [[aeon, 218], [gyomu, 188]]);
    const egg   = P("卵",                 "c-cold",  10,  "個", [[aeon, 268], [gyomu, 228]]);
    const rice  = P("お米",               "c-food",  5,   "kg", [[aeon, 2480], [gyomu, 2280]]);
    const onion = P("玉ねぎ",             "c-veg",   3,   "個", [[gyomu, 158]]);
    const tea   = P("お茶",               "c-drink", 2,   "L",  [[drug, 138], [aeon, 158]]);

    [[soap, 1, "詰め替え用"], [paper, 1, ""], [milk, 2, ""], [egg, 1, ""],
     [rice, 1, ""], [onion, 1, ""], [tea, 3, ""]].forEach(([p, qty, memo]) => {
      fresh.items.push({
        id: uid("i"), productId: p.id, qty, memo,
        checked: false, addedAt: today(),
      });
    });

    /* A few やること too, so the sample shows what the day-grouping is for:
       one for today that comes round every week, one already late, one with
       no day at all. */
    const T = (title, due, repeat) => fresh.todos.push({
      id: uid("t"), title, due: due || null, repeat: repeat || null,
      memo: "", flagged: false, done: false, doneAt: null,
      createdAt: today(), order: fresh.todos.length,
    });
    T("ゴミ出し", KN.util.todayKey(), "weekly");
    T("電球を買いに行く", KN.util.shiftDay(KN.util.todayKey(), -1), null);
    T("写真を整理する", null, null);

    update((s) => {
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, fresh);
    });
  }

  KN.store = {
    KEY, SCHEMA, STORE_COLORS, CATEGORY_COLORS, OTHER_CATEGORY,
    /* 読めなかったかどうか。画面はこれを見て「保存を止めています」と
       言えます（黙って動かないのが、いちばん困るので）。 */
    loadError: () => loadError,
    get, update, subscribe, reload, flush,
    saveError: () => saveError,
    getProduct, getStore, getCategory,
    sortedCategories, sortedStores,
    findProductByName, findStoreByName, guessCategory,
    learnCategory, forgetCategory, forgetAllCategories, learnedList,
    productMark, autoMark, productColor,
    currentPrices, bestPrice, priceAt,
    addStore, addProduct, addItem, addPrice, setArchived,
    productOrder, reorderProducts, sortProductsInCategory, iconKeyOf,
    addTodo, getTodo, updateTodo, removeTodo, toggleTodo, undoTrace, sortedTodos, todosDue, nextDue, snapToRule,
    tripCount, tripTodo, planTrip, unplanTrip,
    setSubs, toggleSub, subCount,
    dayFeed, monthDigest,
    calPrefs, setCalPref,
    archiveTodo, openTodos, closedTodos, todoClosedAt, todoPart,
    todosWaiting, todosToAnnounce, markAnnounced,
    HEALTH_TYPES, DAILY_TYPES, MEAL_SLOTS,
    addWeight, updateWeight, removeWeight, sortedWeights, weightOfDay, latestWeight,
    lastWeightCondition,
    addMeal, updateMeal, removeMeal, mealsOfDay, dayMemo, setDayMemo, searchDietDays,
    slotMemo, setSlotMemo,
    addDrink, updateDrink, removeDrink, drinksOfDay, drinkTotals,
    addUserFood, removeUserFood, findFood,
    putHealth, setHealth, clearHealth, removeHealth, healthOfDay, healthValue,
    setGoal, markSynced, markSyncLocked, clearDiet,
    ARCHIVE_TYPES, archiveType, ACCENTS,
    addEntry, updateEntry, removeEntry, promoteSeed, toggleFavorite,
    readingCandidates, lastReading,
    entriesOfMonth, entriesOfDay, openSeeds, monthCounts, searchEntries,
    dayLog, setDayLog, ensureDayLog, daysOfMonth, exportMonth, archiveThen,
    exportJSON, importJSON, reset, loadSample,
  };
})();
