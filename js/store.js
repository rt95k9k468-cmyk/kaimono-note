/* =========================================================
   くらしノート — state, persistence, selectors
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { uid, today } = KN.util;

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
      // layout: "rows" | "tiles" — one setting for both lists, because a
      // person who wants square tiles wants them on the screen they are
      // looking at, not on one of the two.
      settings: { theme: "auto", showChecked: true, layout: "rows" },
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
    out.todos    = Array.isArray(s.todos)    ? s.todos    : [];
    out.learned  = (s.learned && typeof s.learned === "object" && !Array.isArray(s.learned)) ? s.learned : {};
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
      // 朝 / 午後 / 夜。日のなかのどのあたりか、というだけで、時刻ではない。
      part: ["am", "pm", "night"].includes(t.part) ? t.part : null,
      memo: typeof t.memo === "string" ? t.memo : "",
      flagged: t.flagged === true,
      done: t.done === true,
      doneAt: t.doneAt || null,
      archived: t.archived === true,
      archivedAt: t.archivedAt || null,
      createdAt: t.createdAt || today(),
      order: typeof t.order === "number" ? t.order : i,
    })).filter((t) => t.title);

    out.schema = SCHEMA;
    return out;
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

  function addTodo({ title, due = null, part = null, repeat = null, repeatDays = [], repeatNth = null,
                     memo = "", flagged = false } = {}) {
    const name = String(title || "").trim();
    if (!name) return null;
    const rec = {
      id: uid("t"),
      title: name,
      due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
      repeat: ["daily", "weekly", "monthly"].includes(repeat) ? repeat : null,
      repeatDays: cleanDays(repeatDays),
      repeatNth: cleanNth(repeatNth),
      part: ["am", "pm", "night"].includes(part) ? part : null,
      memo: String(memo || ""),
      flagged: !!flagged,
      done: false,
      doneAt: null,
      archived: false,
      archivedAt: null,
      createdAt: today(),
      order: 0,
    };
    update((s) => {
      s.todos.forEach((t) => { t.order = (t.order || 0) + 1; });
      s.todos.unshift(rec);
    });
    return rec;
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
      if ("part" in patch) t.part = ["am", "pm", "night"].includes(patch.part) ? patch.part : null;
      if ("repeatDays" in patch) t.repeatDays = cleanDays(patch.repeatDays);
      if ("repeatNth" in patch) t.repeatNth = cleanNth(patch.repeatNth);
      if ("memo" in patch) t.memo = String(patch.memo || "");
      if ("flagged" in patch) t.flagged = !!patch.flagged;
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

    update((s) => {
      const t = s.todos.find((x) => x.id === id);
      if (!t) return;
      if (repeating) {
        t.due = due;
        t.done = false;
        t.doneAt = null;
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
      }),
    };
  }

  /* Overdue first, then by day, then by hand-order. Undated ones come last:
     they are things to do, not things due, and a list that mixed them in
     would bury the ones with a day on them. */
  const PART_ORDER = { am: 0, pm: 1, night: 2 };

  function sortedTodos() {
    const rank = (t) => (t.due ? KN.util.daysUntil(t.due) : Number.MAX_SAFE_INTEGER);
    // Within a day, 朝 before 午後 before 夜 — the order the day happens in.
    // Something with no part is not 「早い」, it is 「いつでも」, so it sits first
    // where nothing competes with it.
    const part = (t) => (t.part ? PART_ORDER[t.part] + 1 : 0);
    return get().todos.slice().sort((a, b) =>
      rank(a) - rank(b)
      || part(a) - part(b)
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

  /** Not done, not put away, and wanted today or already late — the badge. */
  function todosDue() {
    return openTodos().filter((t) => t.due && KN.util.daysUntil(t.due) <= 0);
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
    get, update, subscribe, reload,
    getProduct, getStore, getCategory,
    sortedCategories, sortedStores,
    findProductByName, findStoreByName, guessCategory,
    learnCategory, forgetCategory, forgetAllCategories, learnedList,
    productMark, autoMark, productColor,
    currentPrices, bestPrice, priceAt,
    addStore, addProduct, addItem, addPrice, setArchived,
    addTodo, getTodo, updateTodo, removeTodo, toggleTodo, sortedTodos, todosDue, nextDue, snapToRule,
    archiveTodo, openTodos, closedTodos, todoClosedAt,
    exportJSON, importJSON, reset, loadSample,
  };
})();
