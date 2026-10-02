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

  /* 新しく足す紙。10月2日から、時刻・時間・期限は「時刻」の一枚（車輪・時間の札・期限）。 */
  await page.evaluate(() => { KN.app.show && KN.app.show("todo"); KN.screens.todo.open(null); });
  await page.waitForTimeout(800);
  const rows = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return [...sh.querySelectorAll(".d-row")].map((r) => r.className);
  });
  c.check("時間・期限の札は別に無い（日付・時刻・くりかえし・通知・カレンダー）",
    rows.length === 5 && !rows.some((x) => /js-row-dur|js-row-limit/.test(x)), JSON.stringify(rows));
  c.check("決めていなければ「時刻なし 30分」", /時刻なし\s*30分/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));

  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  c.check("時刻の紙に車輪（時・分）と時間の札", await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh.querySelectorAll(".note-wheel").length === 2 && !!sh.querySelector(".js-mins")
      && !sh.querySelector("input[type=time]");
  }));
  /* 分の車輪は5分きざみ（開いたときの時刻が5分の目に乗っていなければ、その分だけ足す） */
  c.check("分の車輪は5分きざみ", await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    const rows = [...sh.querySelectorAll(".note-wheel")][1].children.length;
    return rows === 12 || rows === 13;
  }));
  await page.locator(".sheet.is-open .js-time-set").last().click();
  await page.evaluate(() => {
    const w = [...document.querySelectorAll(".sheet.is-open .note-wheel")];
    w[0].scrollTop = 9 * 40;
    w[1].scrollTop = 0;
  });
  await page.waitForTimeout(600);
  const tt = await rowText(".js-row-time");
  c.check("時刻の札は「9:00 〜 9:30」", /9:00 〜 9:30/.test(tt), tt);
  const chips = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return [...sh.querySelectorAll(".js-mins button")].map((b) => ({
      label: b.textContent.trim(), on: b.classList.contains("is-active") || b.getAttribute("aria-pressed") === "true",
    }));
  });
  const on = chips.filter((x) => x.on).map((x) => x.label);
  c.check("30分が選ばれた姿", on.length === 1 && on[0] === "30分", JSON.stringify(on));
  c.check("「決めない」は無い", chips.length > 0 && !chips.some((x) => x.label === "決めない"), JSON.stringify(chips.map((x) => x.label)));
  c.check("札に1時間がある", chips.some((x) => x.label === "1時間"), JSON.stringify(chips.map((x) => x.label)));
  await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    [...sh.querySelectorAll(".js-mins button")].find((b) => b.textContent.trim() === "1時間").click();
  });
  await page.waitForTimeout(300);
  /* 期限：なし／ありを訊く。ありで日付が一行に出る */
  c.check("期限は「なし」から始まり、日付欄は畳まれている", await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh.querySelector(".js-limit-cell").hidden === true;
  }));
  await page.locator(".sheet.is-open .js-limit-yn button", { hasText: "あり" }).last().click();
  await page.waitForTimeout(200);
  c.check("「あり」で日付欄が出る", await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh.querySelector(".js-limit-cell").hidden === false;
  }));
  await page.locator(".sheet.is-open .js-limit-yn button", { hasText: "なし" }).last().click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const t2 = await rowText(".js-row-time");
  c.check("1時間を押すと札は「9:00 〜 10:00　1時間」", /9:00 〜 10:00/.test(t2) && /1時間/.test(t2), t2);

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
