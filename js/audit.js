/* =========================================================
   記録の点検（R28）——**読むだけ**
   =========================================================

   記録の中の食い違いを数えます。直しません（直すのは別の段で、先に利用者へ
   報告してから）。受け取ったものに一字も書きません。

   数えるもの：
   - 持ち主の無い品物   … items の productId が products に無い（R18 の真っ白の元）
   - 無い店を指す値段   … products[].prices[] の storeId が stores に無い
   - 読めない日付       … 日の欄（"2026-09-29"）・時刻の欄（ISO）が、日付として読めない
   - 同じ id の二重     … 一つの棚に同じ id が二つ（daily の日は、同じ日付が二つ）
   - 日付の欠けた記録   … 日を持つはずの記録（daily・積み上げ・ダイエット）に日が無い

   渡すのは、いまの記録（store.get()）でも、復元で選んだファイルの中身（reconcile を
   通す前）でもよい。ファイルのほうは、読み込むときに reconcile() が直すもの
   （持ち主の無い品物を外す、など）も数えます——「このファイルには食い違いが◯件」。 */
(function () {
  "use strict";
  window.KN = window.KN || {};

  const arr = (a) => (Array.isArray(a) ? a : []);
  const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

  /** "2026-09-29" として読めるか（2月30日のような、在りえない日も読めない）。 */
  function dayOk(v) {
    const m = DAY.exec(String(v));
    if (!m) return false;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
  }
  /** 時刻つきの日付（ISO）として読めるか。日だけの形も受ける。 */
  const stampOk = (v) => typeof v === "string" && (dayOk(v) || isFinite(Date.parse(v)));
  const has = (v) => v !== undefined && v !== null && v !== "";

  function check(src) {
    const s = src && typeof src === "object" ? src : {};
    const diet = (s.diet && typeof s.diet === "object") ? s.diet : {};
    const archive = (s.archive && typeof s.archive === "object") ? s.archive : {};
    const found = { orphanItems: 0, orphanPrices: 0, badDates: 0, dupIds: 0, noDate: 0 };

    /* 持ち主の無い品物・無い店を指す値段 */
    const products = arr(s.products).filter((p) => p && typeof p === "object");
    const productIds = new Set(products.map((p) => p.id));
    const storeIds = new Set(arr(s.stores).filter(Boolean).map((x) => x.id));
    arr(s.items).forEach((i) => { if (!i || !productIds.has(i.productId)) found.orphanItems++; });
    products.forEach((p) => arr(p.prices).forEach((pr) => {
      if (!pr || !storeIds.has(pr.storeId)) found.orphanPrices++;
    }));

    /* 同じ id の二重（棚ごと）。値段は品物ごとの棚。 */
    const shelves = [s.categories, s.stores, s.products, s.items, s.todos, s.sets,
      archive.entries, diet.weights, diet.meals, diet.health, diet.drinks, diet.urges, diet.foods,
      ...products.map((p) => p.prices)];
    shelves.forEach((shelf) => {
      const seen = new Set();
      arr(shelf).forEach((x) => {
        if (!x || !has(x.id)) return;
        if (seen.has(x.id)) found.dupIds++;
        else seen.add(x.id);
      });
    });
    const dates = new Set();
    arr(archive.days).forEach((d) => {
      if (!d || !has(d.date)) return;
      if (dates.has(d.date)) found.dupIds++;
      else dates.add(d.date);
    });

    /* 日付：日を持つはずの記録（欠けていれば「欠けた」、あれば読めるか） */
    const mustDay = [
      [archive.days, "date"], [archive.entries, "date"],
      [diet.weights, "day"], [diet.meals, "day"], [diet.health, "day"], [diet.drinks, "day"], [diet.urges, "day"],
    ];
    mustDay.forEach(([shelf, key]) => arr(shelf).forEach((x) => {
      if (!x || !has(x[key])) found.noDate++;
      else if (!dayOk(x[key])) found.badDates++;
    }));
    /* 日付：持たなくてよいが、あれば読めるはずのもの */
    arr(s.todos).forEach((x) => {
      if (!x) return;
      ["due", "deadline"].forEach((k) => { if (has(x[k]) && !dayOk(x[k])) found.badDates++; });
    });
    products.forEach((p) => arr(p.prices).forEach((pr) => {
      if (pr && has(pr.date) && !stampOk(pr.date)) found.badDates++;
    }));

    const total = Object.values(found).reduce((a, b) => a + b, 0);
    return { total, ...found };
  }

  /** 人に見せる並び。数が0のものも並べる（「無い」ことも答えなので）。 */
  const LABELS = [
    ["orphanItems", "持ち主の無い品物"],
    ["orphanPrices", "無い店を指す値段"],
    ["badDates", "読めない日付"],
    ["dupIds", "同じ id の二重"],
    ["noDate", "日付の欠けた記録"],
  ];

  KN.audit = { check, LABELS };
})();
