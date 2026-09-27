/* 共通の日と、暦の段の同期（docs/shared-header.md の段1、2026年9月27日）。

   時計を 2026年9月15日(火) 10:00 に止めて開く（週は 13〜19日）。
   - やることで 18日（未来）を押す → daily・ダイエットの題も 18日。
     daily の紙は見るだけ（inert・.is-ahead）、ダイエットは押せない紙（.is-peek）。
   - 未来の日から、daily・ダイエットで一日戻れる（先へは行けない）。
   - ダイエットで 10日を押す → やることの題も 10日。
   - 買うものを挟んでも、日はそのまま。
   - 暦の段はどのタブで変えても全タブで同じ。calAll が無い保存はやることの
     見かたから始まる（calBy は残る）。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("shared-day");
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 8, 15, 10, 0)); },
  });
  const go = async (id) => {
    await page.evaluate((i) => KN.app.showScreen(i), id);
    await page.waitForTimeout(700);
  };
  const title = (id) => page.$eval(`#screen-${id} .js-day-title`, (e) => e.textContent.replace(/\s+/g, ""));
  const tap = async (id, day) => {
    await page.$eval(`#screen-${id} .cal-day[data-day="${day}"]`, (e) => e.click());
    await page.waitForTimeout(500);
  };

  await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: false }));
  await go("todo");
  await tap("todo", "2026-09-18");
  c.check("やることの題が 18日", (await title("todo")).includes("9月18日"), await title("todo"));

  await go("archive");
  c.check("daily の題も 18日", (await title("archive")).includes("9月18日"), await title("archive"));
  const ahead = await page.$eval("#screen-archive", (s) => {
    const sl = s.querySelector(".day-track .day-slide.is-ahead");
    return !!sl && sl.inert === true;
  });
  c.check("daily の未来の紙は見るだけ（inert）", ahead);
  const back = await page.evaluate(() => {
    // 一日戻る向きは通る（未来から今日へ戻る道）。
    const t = document.querySelector("#screen-archive .js-go-today");
    return !!t && !t.hidden;
  });
  c.check("daily に「今日へ戻る」が出ている", back);

  /* 紙を右へ払う（本物のタッチ）→ 17日へ戻れる。先（19日）へは行けない。 */
  const swipe = async (id, dx) => {
    const box = await page.$eval(`#screen-${id} .day-car`, (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(160, r.height / 2) };
    });
    const cdp = await page.context().newCDPSession(page);
    const pt = (x) => [{ x, y: box.y, radiusX: 12, radiusY: 12, force: 1 }];
    const x0 = box.x - dx / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(x0) });
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x0 + (dx * i) / 12) });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(800);
  };
  await swipe("archive", 220);
  c.check("daily：未来の日から一日戻れる（17日）", (await title("archive")).includes("9月17日"), await title("archive"));
  await swipe("archive", -220);
  c.check("daily：先へは行けない（17日のまま）", (await title("archive")).includes("9月17日"), await title("archive"));
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(700);
  await tap("todo", "2026-09-18");

  await go("diet");
  c.check("ダイエットの題も 18日", (await title("diet")).includes("9月18日"), await title("diet"));
  c.check("ダイエットの未来の紙は押せない（is-peek）",
    await page.$eval("#screen-diet", (s) => !!s.querySelector(".day-track .day-slide.is-peek.diet-day[data-day='2026-09-18']")));

  // 暦の段：ダイエットで月へ開く → やること・daily も月。
  await page.$eval("#screen-diet .js-day-title", (e) => e.click());
  await page.waitForTimeout(600);
  c.check("ダイエットで開いた段が札に入る", await page.evaluate(() => KN.store.calPrefs("todo").open === true));
  await tap("diet", "2026-09-10");
  c.check("ダイエットで 10日", (await title("diet")).includes("9月10日"), await title("diet"));

  await go("list");
  await go("todo");
  c.check("買うものを挟んでも、やることの題は 10日", (await title("todo")).includes("9月10日"), await title("todo"));
  c.check("やることの暦も月（is-week でない）",
    await page.$eval("#screen-todo .cal", (e) => !e.classList.contains("is-week")));

  // やることで週へ畳む → daily も週。
  await page.$eval("#screen-todo .js-day-title", (e) => e.click());
  await page.waitForTimeout(600);
  await go("archive");
  c.check("daily の暦も週", await page.$eval("#screen-archive .cal", (e) => e.classList.contains("is-week")));
  c.check("daily の題は 10日", (await title("archive")).includes("9月10日"), await title("archive"));

  // 今日へ戻る → 他のタブも今日。
  await page.$eval("#screen-archive .js-go-today", (e) => e.click());
  await page.waitForTimeout(500);
  await go("todo");
  c.check("daily で今日へ戻ると、やることも今日", (await title("todo")).includes("9月15日"), await title("todo"));

  // 古い保存：calAll が無ければ、やることの見かたから（calBy は消さない）。
  const legacy = await page.evaluate(() => {
    KN.store.update((s) => {
      delete s.settings.calAll;
      s.settings.calBy = { todo: { open: false }, diet: { open: true, shown: true } };
    });
    const a = KN.store.calPrefs("diet").open === false && KN.store.calPrefs("archive").open === false;
    KN.store.setCalPref("diet", { open: true });
    const s = KN.store.get().settings;
    return a && s.calAll.open === true && s.calBy.diet.open === true && s.calBy.todo.open === false;
  });
  c.check("calAll が無い保存はやることの見かたから・calBy は残る", legacy);

  c.check("ページのエラーなし", errors.length === 0, errors.join(" | "));

  await browser.close();
  c.done();
})();
