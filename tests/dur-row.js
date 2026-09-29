/* 詳細の紙の「時間」の札（2026年9月29日、docs/todo-items.md の「時間の札」）。

   - 時刻の札とは別の一行（砂時計の絵）。時刻の紙には長さの札を置かない。
   - 決めていなければ「30分」。長さの紙では 30分 が選ばれた姿で、「決めない」は無い
     （いつもの長さがある用事だけ「決めない」「いつもの◯分」——tests/usual-pace.js）。
   - 押すまで保存しない（minutes は null のまま）。1時間を押して追加すると 60。
   - 時刻を決めると、時刻の札は「9:00 〜 9:30」（長さは言わない）。
   - 絵文字なし。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("dur-row");
  const { browser, page, errors } = await open();

  const openSheets = () => page.locator(".sheet.is-open");
  const rowText = (sel) => page.evaluate((s) => {
    const r = [...document.querySelectorAll(`.sheet.is-open ${s}`)].pop();
    return r ? r.textContent.replace(/\s+/g, " ").trim() : "";
  }, sel);

  /* 新しく足す紙 */
  await page.evaluate(() => { KN.app.show && KN.app.show("todo"); KN.screens.todo.open(null); });
  await page.waitForTimeout(800);
  const rows = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return [...sh.querySelectorAll(".d-row")].map((r) => r.className);
  });
  const ti = rows.findIndex((x) => /js-row-time/.test(x));
  const di = rows.findIndex((x) => /js-row-dur/.test(x));
  c.check("「時間」の札が時刻の札のすぐ下にある", ti >= 0 && di === ti + 1, JSON.stringify(rows));
  c.check("「時間」の札は砂時計の絵", await page.evaluate(() =>
    !![...document.querySelectorAll('.sheet.is-open .js-row-dur svg[data-ico="hourglass"] path')].length));
  c.check("決めていなければ「時間 30分」", /時間\s*30分/.test(await rowText(".js-row-dur")), await rowText(".js-row-dur"));

  /* 時刻の紙には長さの札が無い */
  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  c.check("時刻の紙に長さの札は無い", await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return !!sh.querySelector(".js-time") && !sh.querySelector(".js-mins");
  }));
  await page.locator(".sheet.is-open .js-time").last().fill("09:00");
  await page.locator(".sheet.is-open .js-time").last().dispatchEvent("change");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const tt = await rowText(".js-row-time");
  c.check("時刻の札は「9:00 〜 9:30」で、長さは言わない", /9:00 〜 9:30/.test(tt) && !/30分/.test(tt), tt);

  /* 長さの紙 */
  await page.locator(".sheet.is-open .js-row-dur").last().click();
  await page.waitForTimeout(700);
  const chips = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].reverse().find((x) => x.querySelector(".js-mins"));
    return sh ? [...sh.querySelectorAll(".js-mins button")].map((b) => ({
      label: b.textContent.trim(), on: b.classList.contains("is-active") || b.getAttribute("aria-pressed") === "true",
    })) : [];
  });
  const on = chips.filter((x) => x.on).map((x) => x.label);
  c.check("30分が選ばれた姿", on.length === 1 && on[0] === "30分", JSON.stringify(on));
  c.check("「決めない」は無い", chips.length > 0 && !chips.some((x) => x.label === "決めない"), JSON.stringify(chips.map((x) => x.label)));
  c.check("札に1時間がある", chips.some((x) => x.label === "1時間"), JSON.stringify(chips.map((x) => x.label)));
  await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].reverse().find((x) => x.querySelector(".js-mins"));
    [...sh.querySelectorAll(".js-mins button")].find((b) => b.textContent.trim() === "1時間").click();
  });
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  c.check("1時間を押すと札も「1時間」、終わりは 10:00",
    /1時間/.test(await rowText(".js-row-dur")) && /9:00 〜 10:00/.test(await rowText(".js-row-time")));

  await page.locator(".sheet.is-open .js-title").last().fill("時間の札の試し");
  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(700);
  const saved = await page.evaluate(() => KN.store.get().todos.find((t) => t.title === "時間の札の試し"));
  c.check("追加すると minutes は 60", !!saved && saved.minutes === 60, JSON.stringify(saved && { m: saved.minutes, t: saved.time }));

  /* 押さずに追加したら null のまま（組み立ては30分として扱う） */
  await page.evaluate(() => KN.screens.todo.open(null));
  await page.waitForTimeout(800);
  await page.locator(".sheet.is-open .js-title").last().fill("長さを決めない試し");
  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(700);
  const bare = await page.evaluate(() => {
    const t = KN.store.get().todos.find((x) => x.title === "長さを決めない試し");
    return t ? { m: t.minutes == null ? null : t.minutes, plan: KN.plan.minutesOf(t) } : null;
  });
  c.check("押さずに追加すると保存は null、組み立ては30分", !!bare && bare.m === null && bare.plan === 30, JSON.stringify(bare));

  c.check("絵文字なし", await page.evaluate(() =>
    !/\p{Extended_Pictographic}/u.test(document.body.innerText)));
  c.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
