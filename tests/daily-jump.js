/* daily の題から、どの年月日へも飛ぶ（2026年10月26日）と、育休の行の期間。
   - 題を押すと、題からふくらむ小窓。開いたときは見ている日の月の日の面（今日・見ている日・log の点）
   - 頭の字を押すと一段引く（日 → 月 → 年）、升目を押すと一段寄る。‹ › は面ごとに月・年・12年送る
   - 面を替えても小窓の大きさは変わらない
   - 日を押すと閉じて、その日へ（先の日へも）
   - 空の日の頭の「育休完了まであと◯日」は 2026.04.01〜2027.03.31 の日にだけ出る
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/daily-jump.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("daily-jump");
  const { browser, page, errors } = await open({
    before: (cx, p) => p.clock.setFixedTime(new Date(2026, 9, 26, 10, 0)),
  });

  await page.evaluate(() => {
    KN.store.setDayLog("2026-10-03", { memo: "x" });
    KN.app.showScreen("archive");
  });
  await page.waitForTimeout(800);

  const POP = ".note-pop.is-month";
  const face = () => page.evaluate((sel) => {
    const p = document.querySelector(sel);
    if (!p) return null;
    const grid = p.querySelector(".js-pane .mp-grid:not(.mp-wds)");
    return {
      head: p.querySelector(".js-up").textContent.trim(),
      upOff: p.querySelector(".js-up").disabled,
      day: !!p.querySelector(".mp-grid.is-day"),
      cells: grid ? grid.querySelectorAll(".mp-cell").length : 0,
      here: (p.querySelector(".mp-cell.is-here") || {}).textContent || "",
      now: (p.querySelector(".mp-cell.is-now") || {}).textContent || "",
      log: [...p.querySelectorAll(".mp-cell.is-log")].map((c) => c.textContent.trim()),
      h: Math.round(p.getBoundingClientRect().height),
    };
  }, POP);
  const press = async (sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(250); };
  const cellOf = (label) => `${POP} .js-pane .mp-cell:text-is("${label}")`;

  await press("#head .js-day-title");
  await page.waitForTimeout(250);
  const f0 = await face();
  t.check("開くと日の面：見ている月の日が並び、今日と見ている日に印", !!f0 && f0.day && f0.head === "2026年10月"
    && f0.cells === 31 && f0.here === "26" && f0.now === "26", JSON.stringify(f0));
  t.check("書いた日に点", !!f0 && f0.log.includes("3") && !f0.log.includes("4"), JSON.stringify(f0 && f0.log));

  await press(`${POP} .js-prev`);
  const f1 = await face();
  t.check("‹ で前の月", !!f1 && f1.head === "2026年9月" && f1.cells === 30, JSON.stringify(f1));

  await press(`${POP} .js-up`);
  const f2 = await face();
  t.check("頭を押すと月の面", !!f2 && !f2.day && f2.head === "2026年" && f2.cells === 12, JSON.stringify(f2));
  await press(`${POP} .js-up`);
  const f3 = await face();
  t.check("もう一度押すと年の面（それより上は無い）", !!f3 && f3.cells === 12 && f3.upOff && /2016.2027/.test(f3.head), JSON.stringify(f3));
  t.check("面を替えても小窓の大きさは同じ", !!f0 && f0.h === f1.h && f1.h === f2.h && f2.h === f3.h,
    JSON.stringify([f0, f1, f2, f3].map((f) => f && f.h)));

  await press(cellOf("2025"));
  await press(cellOf("3月"));
  const f4 = await face();
  t.check("年 → 月を押すと、その月の日の面", !!f4 && f4.day && f4.head === "2025年3月" && f4.cells === 31, JSON.stringify(f4));
  await press(cellOf("15"));
  await page.waitForTimeout(400);
  t.check("日を押すと閉じて、その日へ", await page.evaluate((sel) => !document.querySelector(sel)
    && document.querySelector("#head .topbar-dayrow").dataset.dayKey === "2025-03-15", POP));

  /* 頭の字（空の日に出す日付と育休の行）。 */
  const stampAt = async (y, m, d) => {
    await press("#head .js-day-title");
    await press(`${POP} .js-up`);
    await press(`${POP} .js-up`);
    await press(cellOf(String(y)));
    await press(cellOf(`${m}月`));
    await press(cellOf(String(d)));
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const s = document.querySelector(".screen.is-active .arc-log-stamp");
      return s ? s.textContent : null;
    });
  };
  const s1 = await stampAt(2026, 3, 31);
  t.check("2026.03.31：育休の行は出ない", s1 !== null && !/育休/.test(s1), s1);
  const s2 = await stampAt(2026, 4, 1);
  t.check("2026.04.01：出る（数え方は前のまま）", s2 !== null && /育休完了まであと366日/.test(s2), s2);
  const s3 = await stampAt(2027, 3, 31);
  t.check("2027.03.31（先の日へも飛べる）：出る", s3 !== null && /育休完了まであと\d+日/.test(s3), s3);
  const s4 = await stampAt(2027, 4, 1);
  t.check("2027.04.01：育休の行は出ない", s4 !== null && !/育休/.test(s4), s4);

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
