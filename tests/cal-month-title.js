/* 暦を月でめくると、題もその月へ動く（2026年10月25日・利用者「何月なのかも分からない」）。

   時計を 2026年9月15日(火) 10:00 に止め、暦を月ぜんぶで開く。四タブそれぞれで
   - 右へ払う（先月）→ 題が 8月1日
   - 左へ払う（今月へ戻る）→ 題が 9月15日（今日） */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("cal-month-title");
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 8, 15, 10, 0)); },
  });
  await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: true }));

  const title = () => page.evaluate(() =>
    document.querySelector("#head .js-day-title").textContent.replace(/\s+/g, ""));
  const swipe = async (dx) => {
    const b = await page.$eval("#head .cal .cal-grid", (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + dx * i / 8, b.y);
    await page.mouse.up();
    await page.waitForTimeout(700);
  };

  for (const id of ["todo", "archive", "diet", "list"]) {
    await page.evaluate((i) => KN.app.showScreen(i), id);
    await page.waitForTimeout(700);
    await swipe(160);
    c.check(`${id}: 先月へめくると題が 8月1日`, (await title()).includes("8月1日"), await title());
    await swipe(-160);
    c.check(`${id}: 今月へ戻ると題が今日`, (await title()).includes("9月15日"), await title());
  }

  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
