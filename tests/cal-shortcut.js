/* カレンダーのショートカットの戻り道（docs/todo-items.md の「カレンダーに入れる」）。
   渡す JSON に back が入る・#cal-back で開くとやることへ・開いたままなら紙も画面も
   そのまま・Safari のタブで開いたら「ここは Safari」と言う・ホーム画面では言わない。 */
const { open, checker } = require("./lib");

/* `#` の後ろだけ違う goto は読み直さないので、一度よそへ出てから開き直す。 */
async function fresh(page) {
  const base = page.url().split("#")[0];
  await page.goto("about:blank");
  await page.goto(base + "#cal-back");
  await page.waitForFunction(() => window.KN && KN.app);
  await page.waitForTimeout(400);
}

(async () => {
  const c = checker("cal-shortcut");

  // 1. 渡す中身
  {
    const { browser, page, errors } = await open();
    const j = await page.evaluate(() => JSON.parse(KN.ics.shortcutText({
      title: "歯医者", day: KN.util.todayKey(), time: "17:00", minutes: 30, memo: "",
    })));
    const href = await page.evaluate(() => location.href.split("#")[0]);
    c.check("back はこのページの #cal-back", j.back === href + "#cal-back", j.back);
    c.check("ほかのキーはそのまま", ["title", "start", "end", "allday", "memo"].every((k) => k in j));
    const url = await page.evaluate(() => KN.ics.shortcutURL({ title: "a", day: KN.util.todayKey(), time: "9:00" }));
    c.check("URL に back が載る", decodeURIComponent(url).includes('"back":'));

    // 2. 開いたままのところへ戻ってきた：画面も紙もそのまま、印だけ戻る
    await page.evaluate(() => { location.hash = "todo"; });
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => document.querySelectorAll(".sheet, .tl-sheet").length);
    await page.evaluate(() => { window.__alive = 1; location.hash = "cal-back"; });
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ alive: window.__alive, hash: location.hash,
      n: document.querySelectorAll(".sheet, .tl-sheet").length }));
    c.check("読み直さない", st.alive === 1);
    c.check("印はいまの画面へ戻る", st.hash === "#todo", st.hash);
    c.check("紙の数も変わらない", st.n === before);
    c.check("エラーなし", errors.length === 0, errors.join(" / "));
    await browser.close();
  }

  // 3. 閉じていたところへ #cal-back で開く（机の上：何も言わない）
  {
    const { browser, page, errors } = await open();
    await fresh(page);
    c.check("やることへ", await page.evaluate(() => location.hash) === "#todo");
    c.check("机の上では何も言わない",
      !(await page.evaluate(() => (document.getElementById("toast-root").textContent || "").includes("Safari"))));
    c.check("エラーなし（机）", errors.length === 0, errors.join(" / "));
    await browser.close();
  }

  // 4. iPhone の Safari のタブで開いてしまった / ホーム画面のアプリに戻れた
  for (const home of [false, true]) {
    const { browser, page } = await open({
      before: async (ctx) => {
        await ctx.addInitScript((home) => {
          Object.defineProperty(navigator, "userAgent", { get: () =>
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
          Object.defineProperty(navigator, "standalone", { get: () => home });
        }, home);
      },
    });
    await fresh(page);
    const said = await page.evaluate(() => (document.getElementById("toast-root").textContent || "").includes("ここは Safari"));
    if (home) c.check("ホーム画面のアプリでは言わない", !said);
    else c.check("Safari のタブでは「ここは Safari」", said);
    await browser.close();
  }

  c.done();
})();
