/* 詳細の紙の「時間」の札（2026年9月29日、docs/todo-items.md の「時間の札」）。

   - 時刻・時間・期限は「時刻」の一枚。時刻は車輪（5分きざみ）、時間は札、期限はスイッチ。
   - 時間は「なし」から（いつもの長さがある用事は「いつもの◯分」——tests/usual-pace.js）。
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

  /* 新しく足す紙。10月2日から、時刻・時間・期限は「時刻」の一枚（車輪・札・期限のスイッチ）。
     通知とカレンダーは頭の「⋯」の中。 */
  await page.evaluate(() => { KN.app.show && KN.app.show("todo"); KN.screens.todo.open(null); });
  await page.waitForTimeout(800);
  const rows = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return [...sh.querySelectorAll(".d-row")].map((r) => r.className);
  });
  c.check("札は日付・時刻・くりかえしの3つ（通知・カレンダーは⋯の中）",
    rows.length === 3 && !rows.some((x) => /js-row-dur|js-row-limit|js-row-notify|js-row-cal/.test(x)), JSON.stringify(rows));
  c.check("決めていなければ「時刻なし」で、長さは言わない", /^時刻なし$/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));
  c.check("くりかえしの札は「くりかえし なし」", /くりかえし\s*なし/.test(await rowText(".js-row-repeat")), await rowText(".js-row-repeat"));
  await page.locator(".sheet.is-open .js-menu").last().click();
  await page.waitForTimeout(500);
  const menu = await page.evaluate(() => document.body.innerText);
  c.check("⋯の中に「時刻に知らせる」と「カレンダーに入れる」", /時刻に知らせる/.test(menu) && /カレンダーに入れる/.test(menu));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  const sheet = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    const on = sh.querySelector(".js-mins .chip.is-active, .js-mins .chip[aria-pressed='true']");
    const mid = (w) => w.querySelector('.note-wheel-row[aria-selected="true"]');
    const ws = sh.querySelectorAll(".js-time-wheels .note-wheel");
    return { time: sh.querySelector(".js-time-v").textContent.trim(), off: sh.querySelector(".js-time-wheels").classList.contains("is-off"),
      wheels: ws.length, mins: ws[1] ? ws[1].children.length : 0, mid: [...ws].map((w) => (mid(w) || {}).textContent).join(""),
      dur: on ? on.textContent.trim() : "", chips: sh.querySelectorAll(".js-mins .chip").length,
      limit: !sh.querySelector(".js-limit-cell").hidden, native: !!sh.querySelector('input[type="time"]') };
  });
  let sh = await sheet();
  c.check("時刻は「なし」で車輪は薄く、純正の時刻欄は無い", sh.time === "なし" && sh.off && sh.wheels === 2 && !sh.native, JSON.stringify(sh));
  c.check("分の車輪は5分きざみ（12行）", sh.mins === 12, JSON.stringify(sh));
  c.check("時間は札で、「なし」が点いている（なし＋14）", sh.dur === "なし" && sh.chips === 15, JSON.stringify(sh));
  /* 車輪を 9時・00分 へ回す */
  await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    const [h, m] = sh.querySelectorAll(".js-time-wheels .note-wheel");
    h.scrollTop = 9 * 40; m.scrollTop = 0;
  });
  await page.waitForTimeout(500);
  sh = await sheet();
  c.check("車輪を回すと時刻が決まる（まん中が9時00分）", sh.time === "9:00" && !sh.off && sh.mid === "9時00分", JSON.stringify(sh));
  c.check("時刻だけ決めると札は「9:00」", /^9:00$/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));
  await page.evaluate(() => [...[...document.querySelectorAll(".sheet.is-open")].pop()
    .querySelectorAll(".js-mins .chip")].find((b) => b.textContent.trim() === "1時間").click());
  sh = await sheet();
  c.check("札で1時間", sh.dur === "1時間", JSON.stringify(sh));
  c.check("期限は切ってあり、日付欄は畳まれている", !sh.limit);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll(".sheet.is-open .js-limit")].pop();
    window.__pick = 0;
    el.showPicker = () => { window.__pick++; };
  });
  await page.locator(".sheet.is-open .js-limit-sw").last().click();
  sh = await sheet();
  c.check("スイッチを入れると日付欄が出て、その場で暦を開く", sh.limit && await page.evaluate(() => window.__pick === 1));
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

  /* 毎朝（毎日＋朝の端）で持っている用事も、くりかえしの札は「毎日」 */
  await page.evaluate(() => {
    const t = KN.store.addTodo({ title: "朝の決まりの試し", due: KN.util.todayKey(), repeat: "daily", part: "dawn" });
    KN.screens.todo.open(t.id);
  });
  await page.waitForTimeout(800);
  c.check("毎朝のものは「くりかえし 毎日」", /くりかえし\s*毎日/.test(await rowText(".js-row-repeat")), await rowText(".js-row-repeat"));
  await page.locator(".sheet.is-open .js-row-repeat").last().click();
  await page.waitForTimeout(600);
  c.check("くりかえしの紙でも毎日が点く", await page.evaluate(() => {
    const on = [...document.querySelectorAll(".sheet.is-open .js-repeat .chip[aria-pressed='true']")].pop();
    return !!on && on.textContent.trim() === "毎日";
  }));

  c.check("絵文字なし", await page.evaluate(() =>
    !/\p{Extended_Pictographic}/u.test(document.body.innerText)));
  c.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
