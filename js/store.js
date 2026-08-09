/* =========================================================
   かいものノート — state, persistence, selectors
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { uid, today } = KN.util;

  const KEY = "kaimono-note-v2";
  const LEGACY_KEY = "kaimono-note-v1";
  const SCHEMA = 2;

  /* ---------------- defaults ---------------- */

  const DEFAULT_CATEGORIES = [
    { id: "c-veg",    name: "野菜・くだもの", emoji: "🥬" },
    { id: "c-meat",   name: "肉・魚",         emoji: "🐟" },
    { id: "c-food",   name: "食品",           emoji: "🍞" },
    { id: "c-cold",   name: "冷蔵・冷凍",     emoji: "🧊" },
    { id: "c-drink",  name: "飲みもの",       emoji: "🥤" },
    { id: "c-daily",  name: "日用品",         emoji: "🧴" },
    { id: "c-clean",  name: "掃除・洗剤",     emoji: "🧻" },
    { id: "c-health", name: "薬・衛生",       emoji: "💊" },
    { id: "c-other",  name: "その他",         emoji: "📦" },
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
      settings: { theme: "auto", showChecked: true },
    };
  }

  /* ---------------- persistence ---------------- */

  let migratedOnLoad = false;
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const rawV2 = localStorage.getItem(KEY);
      if (rawV2) return reconcile(JSON.parse(rawV2));

      const rawV1 = localStorage.getItem(LEGACY_KEY);
      if (rawV1) {
        migratedOnLoad = true;
        return migrateV1(JSON.parse(rawV1));
      }
    } catch (err) {
      console.warn("state load failed, starting fresh", err);
    }
    return emptyState();
  }

  /** Fill in anything a older/partial save is missing so the app never crashes. */
  function reconcile(s) {
    const base = emptyState();
    const out = { ...base, ...s };
    out.settings = { ...base.settings, ...(s.settings || {}) };
    out.categories = Array.isArray(s.categories) && s.categories.length ? s.categories : base.categories;
    out.stores   = Array.isArray(s.stores)   ? s.stores   : [];
    out.products = Array.isArray(s.products) ? s.products : [];
    out.items    = Array.isArray(s.items)    ? s.items    : [];

    out.categories.forEach((c, i) => { if (typeof c.order !== "number") c.order = i; });
    out.products.forEach((p) => {
      if (!Array.isArray(p.prices)) p.prices = [];
      if (!p.categoryId || !out.categories.some((c) => c.id === p.categoryId)) {
        p.categoryId = OTHER_CATEGORY;
      }
    });
    // Drop items whose product vanished.
    out.items = out.items.filter((i) => out.products.some((p) => p.id === i.productId));
    // Lists saved before favourites existed carry no flag; absent means off.
    out.items.forEach((i) => { i.fav = i.fav === true; });
    out.schema = SCHEMA;
    return out;
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

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (err) {
        console.error("save failed", err);
        KN.ui && KN.ui.toast("保存できませんでした（空き容量を確認してください）");
      }
    }, 120);
  }

  function emit() {
    listeners.forEach((fn) => fn(state));
  }

  /** Apply a mutation, persist, and notify. */
  function update(mutator) {
    mutator(state);
    persist();
    emit();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* Re-read what is actually on disk. Each tab — or the same installed app
     opened in two places — keeps its own copy in memory, and the `storage`
     event only reaches tabs that were already open. Pulling to refresh is how
     you ask for whatever the other one wrote. Our own pending save goes out
     first, so a refresh can never discard an edit that had not landed yet. */
  function reload() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* the next save reports it */ }
    }
    state = load();
    emit();
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
  ];

  /** Best-guess category id for a product name; falls back to その他.
   *  The longest matching keyword wins rather than the first category listed,
   *  so 「牛乳」beats 「牛」and 「化粧水」beats 「水」. */
  function guessCategory(name) {
    const n = String(name || "");
    if (!n.trim()) return OTHER_CATEGORY;

    let bestId = OTHER_CATEGORY;
    let bestLen = 0;
    for (const [catId, words] of CATEGORY_HINTS) {
      // A category the user deleted must not shadow a still-valid match.
      if (!state.categories.some((c) => c.id === catId)) continue;
      for (const w of words) {
        if (w.length > bestLen && n.includes(w)) {
          bestId = catId;
          bestLen = w.length;
        }
      }
    }
    return bestId;
  }

  /* A picture per product, without a product database.

     Real photographs would mean an outside API — a key that cannot be kept
     secret on a public static site, a network round trip per item, and a
     guess at which 「エマール」 the search meant. An emoji chosen from the name
     costs nothing, is right the moment the item is typed, and works on a
     train with no signal. It is not a photo, but on a list being scanned at
     arm's length in an aisle it does the job a photo would.

     Matched on the folded name, so each word is listed once in hiragana and
     カタカナ・全角 spellings all land on it. Kanji pass through folding
     unchanged, so they are listed as themselves. */
  const PRODUCT_EMOJI = [
    ["🥛", ["牛乳", "ぎゅうにゅう", "みるく", "豆乳", "とうにゅう"]],
    ["🥚", ["卵", "たまご", "玉子"]],
    ["🧀", ["ちーず", "とろけるちーず"]],
    ["🧈", ["ばたー", "まーがりん"]],
    ["🥣", ["よーぐると", "しりある", "ぐらのーら"]],
    ["🍨", ["あいす", "あいすくりーむ"]],
    ["🍮", ["ぷりん"]],

    ["🍅", ["とまと", "ぷちとまと", "みにとまと"]],
    ["🥒", ["きゅうり", "胡瓜"]],
    ["🥬", ["きゃべつ", "白菜", "はくさい", "れたす", "ほうれん草", "ほうれんそう", "小松菜", "こまつな", "水菜", "みずな", "にら", "春菊", "青梗菜", "ちんげん菜"]],
    ["🧅", ["玉ねぎ", "たまねぎ", "玉葱", "ねぎ", "長ねぎ", "長葱", "万能ねぎ"]],
    ["🥕", ["にんじん", "人参", "きゃろっと"]],
    ["🥔", ["じゃがいも", "馬鈴薯", "ぽてと", "里芋", "さといも"]],
    ["🍠", ["さつまいも", "薩摩芋", "焼き芋"]],
    ["🍄", ["きのこ", "しめじ", "えのき", "まいたけ", "舞茸", "しいたけ", "椎茸", "えりんぎ", "なめこ", "まっしゅるーむ"]],
    ["🌽", ["とうもろこし", "こーん"]],
    ["🍆", ["なす", "茄子"]],
    ["🫑", ["ぴーまん", "ぱぷりか"]],
    ["🥦", ["ぶろっこりー", "かりふらわー"]],
    ["🥗", ["さらだ", "かっとやさい"]],
    ["🧄", ["にんにく", "がーりっく"]],
    ["🥑", ["あぼかど"]],
    ["🫘", ["大豆", "だいず", "枝豆", "えだまめ", "もやし"]],

    ["🍎", ["りんご", "林檎", "あっぷる"]],
    ["🍌", ["ばなな"]],
    ["🍊", ["みかん", "蜜柑", "おれんじ"]],
    ["🍓", ["いちご", "苺", "すとろべりー"]],
    ["🍇", ["ぶどう", "葡萄", "ますかっと"]],
    ["🍑", ["桃", "ぴーち"]],
    ["🍉", ["すいか", "西瓜"]],
    ["🍐", ["梨"]],
    ["🍍", ["ぱいなっぷる"]],
    ["🥝", ["きうい"]],
    ["🍈", ["めろん"]],
    ["🍋", ["れもん"]],

    ["🥩", ["肉", "にく", "牛肉", "豚肉", "ぎゅうにく", "ぶたにく", "すてーき", "ひき肉", "みんち", "挽肉", "しゃぶしゃぶ", "焼肉"]],
    ["🍗", ["鶏", "鶏肉", "とり肉", "とりにく", "もも肉", "むね肉", "手羽", "からあげ", "唐揚げ", "ちきん", "ささみ"]],
    ["🥓", ["べーこん"]],
    ["🌭", ["そーせーじ", "ういんなー"]],
    ["🍖", ["はむ"]],
    ["🐟", ["魚", "さかな", "鮭", "しゃけ", "さば", "鯖", "鰺", "ぶり", "鰤", "鱈", "ひらめ", "白身魚", "切り身", "ししゃも", "干物"]],
    ["🍣", ["刺身", "さしみ", "寿司", "すし", "まぐろ", "鮪", "ねぎとろ", "サーモン"]],
    ["🍤", ["えび", "海老"]],
    ["🦑", ["いか", "烏賊"]],
    ["🐙", ["たこ", "蛸"]],
    ["🦪", ["あさり", "しじみ", "ほたて", "帆立", "牡蠣"]],

    ["🍚", ["米", "こめ", "ごはん", "ご飯", "らいす", "無洗米"]],
    ["🍞", ["ぱん", "食パン", "しょくぱん", "ぶれっど"]],
    ["🥐", ["くろわっさん", "でにっしゅ"]],
    ["🍜", ["らーめん", "中華麺", "かっぷ麺", "かっぷらーめん", "そば", "うどん", "そうめん", "焼きそば"]],
    ["🍝", ["ぱすた", "すぱげってぃ", "まかろに"]],
    ["🍲", ["鍋", "おでん", "しちゅー", "味噌", "みそ"]],
    ["🍛", ["かれー"]],
    ["🥟", ["餃子", "ぎょうざ", "しゅうまい", "焼売", "春巻"]],
    ["🍱", ["弁当", "べんとう", "惣菜", "そうざい", "おにぎり"]],
    ["🧊", ["冷凍", "れいとう", "氷", "こおり"]],

    ["🧂", ["塩", "しお", "胡椒", "こしょう", "砂糖", "さとう", "調味料", "だし", "出汁"]],
    ["🥫", ["缶詰", "かんづめ", "つな缶", "とまと缶", "れとると", "醤油", "しょうゆ", "そーす", "けちゃっぷ", "まよねーず", "どれっしんぐ", "ぽん酢", "酢", "みりん", "味醂"]],
    ["🫒", ["油", "あぶら", "さらだ油", "おりーぶおいる", "ごま油"]],
    ["🌾", ["小麦粉", "こむぎこ", "薄力粉", "強力粉", "片栗粉", "ぱん粉", "ほっとけーきみっくす"]],
    ["🍯", ["はちみつ", "蜂蜜", "じゃむ"]],

    ["🍫", ["ちょこ", "ちょこれーと"]],
    ["🍪", ["くっきー", "びすけっと", "お菓子", "おかし", "菓子"]],
    ["🍘", ["せんべい", "煎餅", "おかき"]],
    ["🍬", ["飴", "あめ", "きゃんでぃ", "ぐみ", "がむ"]],
    ["🍿", ["ぽっぷこーん", "すなっく", "ぽてとちっぷす", "ぽてち"]],
    ["🧁", ["けーき", "まふぃん", "どーなつ", "しゅーくりーむ"]],
    ["🥜", ["なっつ", "あーもんど", "ぴーなっつ"]],

    ["💧", ["水", "みず", "みねらるうぉーたー", "天然水", "炭酸水"]],
    ["🍵", ["お茶", "おちゃ", "茶", "緑茶", "麦茶", "紅茶", "ほうじ茶"]],
    ["☕", ["こーひー", "珈琲", "かふぇおれ"]],
    ["🧃", ["じゅーす", "おれんじじゅーす", "りんごじゅーす", "野菜じゅーす"]],
    ["🥤", ["こーら", "炭酸", "さいだー", "すぽーつどりんく", "清涼飲料"]],
    ["🍺", ["びーる", "発泡酒", "ちゅーはい", "はいぼーる"]],
    ["🍶", ["酒", "日本酒", "焼酎", "料理酒"]],
    ["🍷", ["わいん"]],

    ["🧻", ["といれっとぺーぱー", "てぃっしゅ", "きっちんぺーぱー", "ぺーぱー"]],
    ["🧴", ["洗剤", "せんざい", "しゃんぷー", "りんす", "こんでぃしょなー", "ぼでぃそーぷ", "柔軟剤", "はんどそーぷ", "化粧水", "乳液", "日焼け止め", "除菌"]],
    ["🧺", ["洗濯", "せんたく", "洗濯洗剤", "漂白剤", "はいたー"]],
    ["🧼", ["石鹸", "せっけん", "そーぷ", "洗顔"]],
    ["🧽", ["すぽんじ", "たわし"]],
    ["🧹", ["掃除", "そうじ", "ほうき", "わいぱー", "くいっくる"]],
    ["🗑️", ["ごみ袋", "ゴミ袋", "ごみぶくろ"]],
    ["🪥", ["歯ぶらし", "はぶらし", "歯磨き", "はみがき", "歯磨き粉"]],
    ["🪒", ["髭剃り", "ひげそり", "かみそり", "しぇーばー"]],
    ["🧷", ["おむつ", "紙おむつ", "おしりふき"]],
    ["📦", ["らっぷ", "あるみほいる", "ほいる", "じっぷろっく", "保存袋", "食品保存"]],
    ["🔋", ["電池", "でんち", "乾電池"]],
    ["💡", ["電球", "でんきゅう", "らいと"]],
    ["🧦", ["靴下", "くつした"]],

    ["💊", ["薬", "くすり", "さぷり", "びたみん", "錠剤", "風邪薬", "胃薬"]],
    ["😷", ["ますく"]],
    ["🩹", ["絆創膏", "ばんそうこう", "湿布", "しっぷ"]],
    ["🌡️", ["体温計", "たいおんけい"]],
    ["🐾", ["どっぐふーど", "きゃっとふーど", "ぺっとふーど", "猫砂", "ねこ砂"]],
  ];

  /* Flattened once and sorted longest first, so the first hit is the longest
     match: 「牛乳」 beats 「牛」, 「もも肉」 beats 「桃」, 「洗濯洗剤」 beats 「洗剤」. */
  const EMOJI_KEYS = PRODUCT_EMOJI
    .flatMap(([emoji, words]) => words.map((w) => [KN.util.foldKana(w), emoji]))
    .sort((a, b) => b[0].length - a[0].length);

  /** Emoji suggested by a product name alone, or "" when nothing fits. */
  function guessEmoji(name) {
    const n = KN.util.foldKana(String(name || ""));
    if (!n) return "";
    for (const [key, emoji] of EMOJI_KEYS) if (n.includes(key)) return emoji;
    return "";
  }

  /** The emoji standing in for a product: its own, else its category's. */
  function productEmoji(product) {
    if (!product) return "";
    return guessEmoji(product.name) || getCategory(product.categoryId).emoji;
  }

  /**
   * What to actually show beside a product. A drawn icon when there is one for
   * this kind of thing (see product-icons.js — emoji have no 洗剤), otherwise
   * the emoji. Drawn icons come first because they are the more specific of
   * the two: they exist precisely where the emoji set gives up and reuses one
   * picture for six products.
   * @returns raw HTML, ready to drop into an html`` template
   */
  function productMark(product) {
    if (!product) return "";
    const icon = KN.productIcons.find(product.name);
    return icon ? KN.util.raw(icon) : productEmoji(product);
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
      amount: isFinite(amount) && amount > 0 ? amount : null,
      unit: unit || "",
      note: note || "",
      prices: [],
    };
    update((s) => { s.products.push(rec); });
    return rec;
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
    update((s) => { s.items.unshift(rec); });
    return rec;
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
      s.settings = next.settings;
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

    update((s) => {
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, fresh);
    });
  }

  KN.store = {
    KEY, SCHEMA, STORE_COLORS, OTHER_CATEGORY,
    get, update, subscribe, reload,
    getProduct, getStore, getCategory,
    sortedCategories, sortedStores,
    findProductByName, findStoreByName, guessCategory,
    guessEmoji, productEmoji, productMark,
    currentPrices, bestPrice, priceAt,
    addStore, addProduct, addItem, addPrice,
    exportJSON, importJSON, reset, loadSample,
  };
})();
