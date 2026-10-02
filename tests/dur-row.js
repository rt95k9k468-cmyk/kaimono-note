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

  /* 新しく足す紙。10月2日から、時刻・時間・期限は「時刻」の一枚（時刻欄・−／＋・期限のスイッチ）。 */
  await page.evaluate(() => { KN.app.show && KN.app.show("todo"); KN.screens.todo.open(null); });
  await page.waitForTimeout(800);
  const rows = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return [...sh.querySelectorAll(".d-row")].map((r) => r.className);
  });
  c.check("時間・期限の札は別に無い（日付・時刻・くりかえし・通知・カレンダー）",
    rows.length === 5 && !rows.some((x) => /js-row-dur|js-row-limit/.test(x)), JSON.stringify(rows));
  c.check("決めていなければ「時刻なし」で、長さは言わない", /^時刻なし$/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));
  c.check("くりかえしの札は「くりかえし なし」", /くりかえし\s*なし/.test(await rowText(".js-row-repeat")), await rowText(".js-row-repeat"));

  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  const sheet = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return { dur: sh.querySelector(".js-dur-v").textContent.trim(), down: sh.querySelector(".js-dur-down").disabled,
      empty: !sh.querySelector(".js-time-empty").hidden, limit: !sh.querySelector(".js-limit-cell").hidden,
      chips: sh.querySelectorAll(".chip").length, step: sh.querySelector(".js-time").getAttribute("step") };
  });
  let sh = await sheet();
  c.check("時刻は「なし」、時間も「なし」（短い側の端）、札は並べない", sh.empty && sh.dur === "なし" && sh.down && sh.chips === 0, JSON.stringify(sh));
  c.check("時刻欄は端末の時刻欄（5分きざみ）", sh.step === "300", JSON.stringify(sh));
  await page.locator(".sheet.is-open .js-time").last().fill("09:00");
  await page.locator(".sheet.is-open .js-time").last().dispatchEvent("change");
  await page.waitForTimeout(200);
  c.check("時刻だけ決めると札は「9:00」", /^9:00$/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));
  for (let i = 0; i < 4; i++) await page.locator(".sheet.is-open .js-dur-up").last().click();
  sh = await sheet();
  c.check("＋で なし → 15分 → 30分 → 45分 → 1時間", sh.dur === "1時間", JSON.stringify(sh));
  c.check("期限は切ってあり、日付欄は畳まれている", !sh.limit);
  await page.locator(".sheet.is-open .js-limit-sw").last().click();
  sh = await sheet();
  c.check("スイッチで日付欄が同じ行に出る", sh.limit);
  await page.locator(".sheet.is-open .js-limit-sw").last().click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const t2 = await rowText(".js-row-time");
  c.check("札は「9:00 〜 10:00　1時間」", /9:00 〜 10:00/.test(t2) && /1時間/.test(t2), t2);

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
  c.check("「なし」のまま追加すると保存は null、組み立ては30分", !!bare && bare.m === null && bare.plan === 30, JSON.stringify(bare));

  c.check("絵文字なし", await page.evaluate(() =>
    !/\p{Extended_Pictographic}/u.test(document.body.innerText)));
  c.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
