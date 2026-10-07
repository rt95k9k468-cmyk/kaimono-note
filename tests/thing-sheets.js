/* 物から生まれる紙の残り（roadmap-unify の U15）。
   - 買うものの行・価格の行を押すと、行の絵の写し（.sheet-morph）が紙の頭の絵へ伸び、
     閉じると行の絵へ帰る。着いたら行の絵は見えている
   - daily の題を押すと、月を選ぶのは小窓（大きな紙ではない）。題からふくらみ、月を押せば閉じてその月へ
   - アイコンを選ぶは大きな紙のまま、押した絵の点から育つ
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/thing-sheets.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("thing-sheets");
  const { browser, page, errors } = await open();

  await page.evaluate(() => {
    const p = KN.store.addProduct({ name: "牛乳", categoryId: KN.store.guessCategory("牛乳") });
    KN.store.addItem(p.id);
    KN.app.showScreen("list");
  });
  await page.waitForTimeout(600);

  /* 写しが出たか・出ているあいだ本物の行の絵が隠れていたかを、消えるまで控える。 */
  const watch = () => page.evaluate(() => new Promise((ok) => {
    const out = { seen: 0, hidden: false };
    const t0 = performance.now();
    const tick = () => {
      const g = document.querySelector(".sheet-morph");
      if (g) {
        out.seen++;
        if (document.querySelector(".screen.is-active [style*='visibility: hidden']")) out.hidden = true;
      }
      if (!g && out.seen) ok(out);
      else if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      else ok(out);
    };
    tick();
  }));
  const visible = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    return !!el && getComputedStyle(el).visibility === "visible" && !document.querySelector(".sheet-morph");
  }, sel);

  async function roundTrip(name, rowSel, markSel) {
    let w = watch();
    await page.locator(rowSel).first().click();
    const go = await w;
    t.check(`${name}：行の絵が紙の頭の絵へ伸びる`, go.seen > 3 && go.hidden, JSON.stringify(go));
    await page.waitForTimeout(300);
    t.check(`${name}：開いた紙の頭の絵が見えている`,
      await visible(".sheet .hero-node.js-icon-pick"));
    w = watch();
    await page.locator(".sheet .js-close").last().click();
    const back = await w;
    t.check(`${name}：閉じると頭の絵が行の絵へ帰る`, back.seen > 3, JSON.stringify(back));
    await page.waitForTimeout(300);
    t.check(`${name}：帰ったあと行の絵が見えている`, await visible(markSel));
  }

  await roundTrip("買うもの", ".screen.is-active .item-body", ".screen.is-active .item-emoji");

  /* アイコンを選ぶは大きな紙のまま、押した絵から育つ。 */
  await page.locator(".screen.is-active .js-emoji").first().click();
  await page.waitForTimeout(100);
  t.check("アイコンを選ぶ：大きな紙が押した絵の点から育つ", await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet")].pop();
    return !!s && s.getAttribute("aria-label") === "アイコンを選ぶ" && s.classList.contains("is-from-origin");
  }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  await page.evaluate(() => KN.app.showScreen("prices"));
  await page.waitForTimeout(800);
  await roundTrip("価格", ".screen.is-active .product-wrap .js-open", ".screen.is-active .product-emoji");

  /* 月を選ぶは小窓。 */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(800);
  await page.locator("#head .js-day-title").click();
  await page.waitForTimeout(500);
  const pop = await page.evaluate(() => {
    const p = document.querySelector(".note-pop.is-month");
    const title = document.querySelector("#head .js-day-title").getBoundingClientRect();
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const [ox, oy] = getComputedStyle(p).transformOrigin.split(" ").map(parseFloat);
    return { sheet: !!document.querySelector(".sheet.is-open"), cells: p.querySelectorAll(".mp-cell").length,
      ox: r.left + ox - (title.left + title.width / 2), oy: r.top + oy - (title.top + title.height / 2),
      onTop: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).closest(".note-pop") === p };
  });
  t.check("月を選ぶ：大きな紙ではなく小窓", !!pop && !pop.sheet && pop.cells === 12, JSON.stringify(pop));
  t.check("月を選ぶ：題のまん中からふくらむ", !!pop && Math.abs(pop.ox) < 2 && Math.abs(pop.oy) < 2, JSON.stringify(pop));
  t.check("月を選ぶ：帯の暦より上に出る", !!pop && pop.onTop);
  const before = await page.evaluate(() => document.querySelector("#head .topbar-dayrow").dataset.dayKey);
  await page.locator(".note-pop.is-month .mp-cell:not([disabled]):not(.is-here)").first().click();
  await page.waitForTimeout(600);
  t.check("月を選ぶ：月を押すと閉じて、その月へ", await page.evaluate((b) =>
    !document.querySelector(".note-pop.is-month")
    && document.querySelector("#head .topbar-dayrow").dataset.dayKey !== b, before));

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
