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
      /* ダイエット。買い物ともやることとも混ざらない、体の記録の置き場です。
         中身をひとつの入れ物にまとめてあるのは、「体重だけ消す」「食事だけ
         書き出す」がひとまとまりで済むから——そして、この機能を使わない人の
         保存データに、空の配列が五つも散らばらないためです。 */
      diet: emptyDiet(),
      // layout: "rows" | "tiles" — one setting for both lists, because a
      // person who wants square tiles wants them on the screen they are
      // looking at, not on one of the two.
      settings: { theme: "auto", showChecked: true, layout: "rows" },
    };
  }

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
      goal: {
        heightCm: null,
        targetKg: null,
        targetDay: null,
        // 一日の目安。null なら画面は「残り」を出しません——目標が無いのに
        // 「残り1800kcal」と出すのは、勝手に決めた線を事実のように言うことです。
        kcalTarget: null, pTarget: null, fTarget: null, cTarget: null,
      },
      // 最後にヘルスケアを取り込んだ時刻と、そのとき入った件数。
      sync: { lastAt: null, added: 0, updated: 0 },
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
      source: w.source === "health" ? "health" : "manual",
      externalId: typeof w.externalId === "string" ? w.externalId : null,
      importedAt: w.importedAt || null,
      createdAt: w.createdAt || new Date().toISOString(),
      order: typeof w.order === "number" ? w.order : i,
    };
  }

  const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];

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
      // どこから来た値か。base=成分表, user=自分で直した, product=市販品,
      // ai=写真からの推定。数字の重みが違うので、捨てずに持ちます。
      from: ["base", "user", "product", "ai", "manual"].includes(it.from) ? it.from : "manual",
      foodId: typeof it.foodId === "string" ? it.foodId : null,
      // 推定値かどうか。UIで「約」を付けるのはこの旗ひとつで決めます。
      estimated: it.estimated === true,
    };
  }

  function cleanMeal(m, i) {
    const items = (Array.isArray(m.items) ? m.items : []).map(cleanMealItem).filter(Boolean);
    if (!items.length && !String(m.memo || "").trim()) return null;
    return {
      id: m.id || uid("m"),
      day: dayStr(m.day) || today(),
      time: KN.util.isTime(m.time) ? m.time : null,
      slot: MEAL_SLOTS.includes(m.slot) ? m.slot : "snack",
      items,
      memo: typeof m.memo === "string" ? m.memo : "",
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
      goal: { ...base.goal, ...(src.goal && typeof src.goal === "object" ? src.goal : {}) },
      sync: { ...base.sync, ...(src.sync && typeof src.sync === "object" ? src.sync : {}) },
    };
    out.goal.heightCm = posNum(out.goal.heightCm);
    out.goal.targetKg = posNum(out.goal.targetKg);
    out.goal.targetDay = dayStr(out.goal.targetDay);
    ["kcalTarget", "pTarget", "fTarget", "cTarget"].forEach((k) => { out.goal[k] = posNum(out.goal[k]); });
    return out;
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
      // 毎朝 / 毎晩、または時刻そのもの。どちらか一方だけを持ちます——両方ある
      // と食い違えるので。日のなかの並びは todoPart() が時刻から読みます。
      part: cleanPart(t.part),
      time: KN.util.isTime(t.time) ? t.time : null,
      // 「YYYY-MM-DD HH:MM」 of the occurrence already announced, if any.
      notifiedFor: typeof t.notifiedFor === "string" ? t.notifiedFor : null,
      memo: typeof t.memo === "string" ? t.memo : "",
      flagged: t.flagged === true,
      done: t.done === true,
      doneAt: t.doneAt || null,
      archived: t.archived === true,
      archivedAt: t.archivedAt || null,
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

  /** Hold a 毎朝／毎晩 to what it says: every day, on a day, at no clock time. */
  function fixBookend(t) {
    if (!isBookendPart(t.part)) return t;
    t.repeat = "daily";
    t.repeatDays = [];
    t.repeatNth = null;
    t.time = null;
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

  function addTodo({ title, due = null, part = null, time = null, repeat = null, repeatDays = [],
                     repeatNth = null, memo = "", flagged = false } = {}) {
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
      part: at ? null : cleanPart(part),
      time: at,
      notifiedFor: null,
      memo: String(memo || ""),
      flagged: !!flagged,
      done: false,
      doneAt: null,
      archived: false,
      archivedAt: null,
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
      /* 時刻と 朝/午後/夜 は、どちらか一方だけ。決めたほうが残り、もう一方は
         降ります——「19:30」と「朝」を両方持たせると、どちらが本当かを毎回
         決めなおすことになるので。あとから来た指定が勝ちます。 */
      if ("time" in patch) {
        t.time = KN.util.isTime(patch.time) ? patch.time : null;
        if (t.time) t.part = null;
      }
      if ("part" in patch) {
        t.part = cleanPart(patch.part);
        if (t.part && !("time" in patch)) t.time = null;
      }
      if (!t.due) { t.part = null; t.time = null; }
      fixBookend(t);
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
  const todoPart = (t) => (t && t.time ? KN.util.partOfTime(t.time) : (t && t.part) || null);

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

  /* ---------------- ダイエットの出し入れ ---------------- */

  const diet = () => state.diet;

  /* --- 体重 --- */

  function addWeight({ day, time, kg, fat, memo, source, externalId } = {}) {
    const rec = cleanWeight({
      day: day || KN.util.todayKey(),
      time: time || KN.util.nowTime(),
      kg, fat, memo, source, externalId,
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
    const list = diet().weights.filter((w) => w.day === day)
      .sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00"));
    return list.length ? list[0] : null;
  }

  function latestWeight() {
    const list = sortedWeights();
    return list.length ? list[0] : null;
  }

  /* --- 食事 --- */

  function addMeal({ day, time, slot, items, memo } = {}) {
    const rec = cleanMeal({
      day: day || KN.util.todayKey(),
      time: time || KN.util.nowTime(),
      slot, items, memo,
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
    const order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
    return diet().meals.filter((m) => m.day === day)
      .sort((a, b) => (order[a.slot] - order[b.slot]) || String(a.time).localeCompare(String(b.time)));
  }

  /* --- その人の食品 --- */

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
    return diet().health.filter((h) => h.day === day && (!type || h.type === type));
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
      s.diet.sync = { lastAt: new Date().toISOString(), added: counts.added || 0, updated: counts.updated || 0 };
    });
  }

  /** ダイエットの記録だけを消す。買い物とやることには触れません。 */
  function clearDiet() {
    update((s) => { s.diet = emptyDiet(); });
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
    archiveTodo, openTodos, closedTodos, todoClosedAt, todoPart,
    todosWaiting, todosToAnnounce, markAnnounced,
    HEALTH_TYPES, DAILY_TYPES, MEAL_SLOTS,
    addWeight, updateWeight, removeWeight, sortedWeights, weightOfDay, latestWeight,
    addMeal, updateMeal, removeMeal, mealsOfDay,
    addUserFood, removeUserFood, findFood,
    putHealth, setHealth, clearHealth, removeHealth, healthOfDay, healthValue,
    setGoal, markSynced, clearDiet,
    exportJSON, importJSON, reset, loadSample,
  };
})();
