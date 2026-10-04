/* V23 買うものの紙：足す紙と直す紙を、やることの紙と同じ形に（docs/roadmap-2.0.md の V23・
   docs/shopping.md の末の節）。2026年10月4日。2.0 の切り替えの中だけ。

   - オフ：前の紙のまま（足す紙に「今回買う」の段、直す紙に数量）
   - オン：足す紙も直す紙も、頭（絵・名前・名前の右に小さな★）＋カテゴリの札＋メモ
   - 足す紙：名前からカテゴリと絵を推す・★とメモを付けて足せる
   - 直す紙：★は行の★・カテゴリは小窓で選ぶ（手で選んだ印が付く）・名前を直せる・
     メモが残る・数量を出さない・⋯ の「リストから外す」（元に戻せる）・値段の欄は下に
   - 絵を押すと絵を選ぶ紙

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/shop-sheet-v2.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("shop-sheet-v2");
  const { browser, page, errors } = await open();

  const setV2 = (on) => page.evaluate((v) => {
    KN.store.update((s) => { s.settings.v2 = v; });
    KN.app.applyV2(v);
  }, on);
  const toList = async () => {
    await page.evaluate(() => KN.app.showScreen("todo"));
    await page.waitForTimeout(200);
    await page.evaluate(() => KN.app.showScreen("list"));
    await page.waitForTimeout(600);
  };
  const top = () => page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    if (!s) return null;
    return {
      hero: !!s.querySelector(".pd-hero"),
      name: !!s.querySelector(".pd-hero .js-name"),
      fav: !!s.querySelector(".pd-hero .pd-fav"),
      cat: !!s.querySelector(".js-row-cat"),
      memo: !!s.querySelector(".d-memo"),
      qty: !!s.querySelector(".js-minus"),
      oldFav: !!s.querySelector(".fav-toggle"),
      price: /値段を追加/.test(s.textContent),
    };
  });
  const closeTop = async () => {
    await page.evaluate(() => { const s = [...document.querySelectorAll(".sheet.is-open")].pop(); if (s) s.querySelector(".js-close").click(); });
    await page.waitForTimeout(500);
  };

  await page.evaluate(() => KN.store.loadSample());
  await toList();

  /* ---- オフ：前のまま ---- */
  await page.mouse.click(350, 805);
  await page.waitForTimeout(800);
  const a0 = await top();
  t.check("オフ：足す紙は前のまま（今回買うの段・頭なし）", a0 && a0.oldFav && !a0.hero, JSON.stringify(a0));
  await closeTop();
  await page.locator("#screen-list .item").first().click();
  await page.waitForTimeout(800);
  const e0 = await top();
  t.check("オフ：直す紙は前のまま（数量あり・頭なし）", e0 && e0.qty && !e0.hero, JSON.stringify(e0));
  await closeTop();

  /* ---- オン：足す紙 ---- */
  await setV2(true);
  await toList();
  await page.mouse.click(350, 805);
  await page.waitForTimeout(800);
  const a1 = await top();
  t.check("オン：足す紙は頭・名前・★・カテゴリ・メモ", a1 && a1.hero && a1.name && a1.fav && a1.cat && a1.memo && !a1.oldFav && !a1.qty, JSON.stringify(a1));
  const lay = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    const n = s.querySelector(".pd-hero .js-name").getBoundingClientRect();
    const f = s.querySelector(".pd-hero .pd-fav").getBoundingClientRect();
    return { right: f.left >= n.right - 1, same: Math.abs((f.top + f.bottom) / 2 - (n.top + n.bottom) / 2) < 12, w: f.width, focus: document.activeElement === s.querySelector(".js-name") };
  });
  t.check("★は名前の右に小さく", lay.right && lay.same && lay.w <= 40, JSON.stringify(lay));
  t.check("初めの欄は名前", lay.focus);
  await page.keyboard.type("詰め替え洗剤テスト");
  await page.waitForTimeout(400);
  const guess = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    return { cat: s.querySelector(".js-cat-v").textContent, mark: !!s.querySelector(".pd-hero .hero-node svg") };
  });
  t.check("名前からカテゴリと絵を推す", guess.cat === "掃除・洗剤" && guess.mark, JSON.stringify(guess));
  await page.click(".sheet.is-open .pd-fav");
  await page.fill(".sheet.is-open .js-memo", "大きいほう");
  await page.click(".sheet.is-open .js-add");
  await page.waitForTimeout(600);
  const added = await page.evaluate(() => {
    const S = KN.store;
    const p = S.get().products.find((x) => x.name === "詰め替え洗剤テスト");
    const it = p && S.get().items.find((i) => i.productId === p.id);
    return p && it ? { cat: S.getCategory(p.categoryId).name, fav: !!it.fav, memo: it.memo, id: it.id } : null;
  });
  t.check("★とメモを付けて足せる", added && added.fav && added.memo === "大きいほう" && added.cat === "掃除・洗剤", JSON.stringify(added));

  /* ---- オン：直す紙 ---- */
  await page.evaluate((id) => {
    const it = KN.store.get().items.find((i) => i.id === id);
    KN.productSheet.open(it.productId, { itemId: id });
  }, added.id);
  await page.waitForTimeout(800);
  const e1 = await top();
  t.check("オン：直す紙も同じ形（頭・名前・★・カテゴリ・メモ）", e1 && e1.hero && e1.name && e1.fav && e1.cat && e1.memo, JSON.stringify(e1));
  t.check("数量を出さない・値段の欄は下にある", !e1.qty && e1.price, JSON.stringify(e1));
  const favOn = await page.evaluate(() => document.querySelector(".sheet.is-open .pd-fav").getAttribute("aria-pressed"));
  t.check("★は行の★", favOn === "true");
  await page.click(".sheet.is-open .pd-fav");
  await page.waitForTimeout(200);
  t.check("★を外すと行の★も外れる", await page.evaluate((id) => !KN.store.get().items.find((i) => i.id === id).fav, added.id));

  await page.click(".sheet.is-open .js-row-cat");
  await page.waitForSelector(".note-pop.is-form .chip");
  await page.locator(".note-pop.is-form .chip", { hasText: "日用品" }).click();
  await page.waitForTimeout(500);
  const cat = await page.evaluate((id) => {
    const S = KN.store;
    const it = S.get().items.find((i) => i.id === id);
    const p = S.getProduct(it.productId);
    return { cat: S.getCategory(p.categoryId).name, manual: !!p.catManual, row: document.querySelector(".sheet.is-open .js-cat-v").textContent, pop: !!document.querySelector(".note-pop.is-open") };
  }, added.id);
  t.check("カテゴリは小窓で選び、手で選んだ印が付く", cat.cat === "日用品" && cat.manual && cat.row === "日用品" && !cat.pop, JSON.stringify(cat));

  await page.fill(".sheet.is-open .pd-hero .js-name", "詰め替え洗剤テスト2");
  await page.fill(".sheet.is-open .js-memo", "小さいほう");
  await page.waitForTimeout(600);
  const ed = await page.evaluate((id) => {
    const S = KN.store;
    const it = S.get().items.find((i) => i.id === id);
    return { name: S.getProduct(it.productId).name, memo: it.memo };
  }, added.id);
  t.check("名前とメモを直せる", ed.name === "詰め替え洗剤テスト2" && ed.memo === "小さいほう", JSON.stringify(ed));

  await page.click(".sheet.is-open .pd-hero .js-icon-pick");
  await page.waitForTimeout(700);
  t.check("絵を押すと絵を選ぶ紙", await page.evaluate(() => /絵をさがす/.test([...document.querySelectorAll(".sheet.is-open")].pop().innerHTML)));
  await closeTop();

  await page.click(".sheet.is-open .js-menu");
  await page.waitForTimeout(400);
  await page.locator(".pop-menu button, .note-pop button", { hasText: "リストから外す" }).first().click();
  await page.waitForTimeout(600);
  const gone = await page.evaluate((id) => ({
    gone: !KN.store.get().items.some((i) => i.id === id),
    toast: [...document.querySelectorAll(".toast")].map((x) => x.textContent).join(" "),
    open: document.querySelectorAll(".sheet.is-open").length,
  }), added.id);
  t.check("⋯ の「リストから外す」で外れ、元に戻せる", gone.gone && /元に戻す/.test(gone.toast) && gone.open === 0, JSON.stringify(gone));

  /* 価格から開いた（行の無い）紙は★を出さない */
  await page.evaluate(() => { const p = KN.store.get().products[0]; KN.productSheet.open(p.id); });
  await page.waitForTimeout(700);
  const e2 = await top();
  t.check("行の無い品物の紙は★を出さない", e2 && e2.hero && !e2.fav, JSON.stringify(e2));
  await closeTop();

  const txt = await page.evaluate(() => document.body.innerText);
  t.check("絵文字を出さない", !/\p{Extended_Pictographic}/u.test(txt));
  t.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
