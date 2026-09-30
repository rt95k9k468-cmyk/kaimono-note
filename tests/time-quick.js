/* 時刻の紙の「よく使う時刻」と ±15分（2026年9月30日、docs/todo-items.md の「時刻の紙」）。

   - 時刻の紙のいちばん上に、よく使う時刻の札が8つ（履歴が無ければ 7:00〜21:00 の区切り）。
   - 札を押すと時刻が決まり、紙はひとりでに閉じる（札は「18:00 〜 18:30」）。
   - ±15分は15分の目へ寄せて動かし、紙は閉じない。時刻が無いときは押せない。
   - 日付の札（今日・明日）も、押せば紙が閉じる。
   - 二度以上使った時刻が、札に上がってくる。
   - 札も±15分も、指の的は44px以上。横にはみ出さない。
   - 絵文字なし・例外なし。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("time-quick");
  const { browser, page, errors } = await open();

  const sheets = () => page.locator(".sheet.is-open").count();
  const rowText = (sel) => page.evaluate((s) => {
    const r = [...document.querySelectorAll(`.sheet.is-open ${s}`)].pop();
    return r ? r.textContent.replace(/\s+/g, " ").trim() : "";
  }, sel);
  const quick = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return [...sh.querySelectorAll(".js-quick-times .chip")].map((b) => ({
      label: b.textContent.trim(), on: b.getAttribute("aria-pressed") === "true",
      h: b.getBoundingClientRect().height,
    }));
  });
  const clickChip = (host, label) => page.evaluate(([h, l]) => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    [...sh.querySelectorAll(`${h} .chip`)].find((b) => b.textContent.trim() === l).click();
  }, [host, label]);

  await page.evaluate(() => { KN.app.show && KN.app.show("todo"); KN.screens.todo.open(null); });
  await page.waitForTimeout(800);

  /* 時刻の紙 */
  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  let q = await quick();
  c.check("よく使う時刻が8つ", q.length === 8, JSON.stringify(q.map((x) => x.label)));
  c.check("履歴が無ければ 7:00〜21:00 の区切り",
    JSON.stringify(q.map((x) => x.label)) === JSON.stringify(["7:00", "8:00", "9:00", "12:00", "15:00", "18:00", "20:00", "21:00"]),
    JSON.stringify(q.map((x) => x.label)));
  c.check("札の的は44px以上", q.every((x) => x.h >= 44), JSON.stringify(q.map((x) => x.h)));
  const nud = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    const w = sh.getBoundingClientRect().right;
    return [".js-time-down", ".js-time-up", ".js-time"].map((s) => {
      const el = sh.querySelector(s); const r = el.getBoundingClientRect();
      return { s, h: r.height, right: r.right, w, disabled: !!el.disabled };
    });
  });
  c.check("±15分の的は44px以上", nud.slice(0, 2).every((x) => x.h >= 44), JSON.stringify(nud));
  c.check("時刻の欄の並びが横にはみ出さない", nud.every((x) => x.right <= x.w), JSON.stringify(nud));
  c.check("時刻が無いあいだ ±15分は押せない", nud[0].disabled && nud[1].disabled, JSON.stringify(nud));

  await clickChip(".js-quick-times", "18:00");
  await page.waitForTimeout(900);
  c.check("札を押すと時刻の紙が閉じる", (await sheets()) === 1, String(await sheets()));
  c.check("時刻の札は「18:00 〜 18:30」", /18:00 〜 18:30/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));

  /* ±15分 */
  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  q = await quick();
  c.check("決めた時刻の札が点いている", q.filter((x) => x.on).map((x) => x.label).join() === "18:00", JSON.stringify(q));
  await page.locator(".sheet.is-open .js-time-up").last().click();
  await page.waitForTimeout(200);
  const v1 = await page.locator(".sheet.is-open .js-time").last().inputValue();
  c.check("＋15分で 18:15、紙は閉じない", v1 === "18:15" && (await sheets()) === 2, `${v1} / ${await sheets()}`);
  q = await quick();
  c.check("札にない時刻では、どの札も点かない", !q.some((x) => x.on), JSON.stringify(q.filter((x) => x.on)));
  await page.locator(".sheet.is-open .js-time-down").last().click();
  await page.locator(".sheet.is-open .js-time-down").last().click();
  await page.waitForTimeout(200);
  const v2 = await page.locator(".sheet.is-open .js-time").last().inputValue();
  c.check("−15分を二度で 17:45", v2 === "17:45", v2);
  /* 半端な時刻からは、15分の目へ寄る */
  await page.locator(".sheet.is-open .js-time").last().fill("17:50");
  await page.locator(".sheet.is-open .js-time").last().dispatchEvent("change");
  await page.locator(".sheet.is-open .js-time-up").last().click();
  await page.waitForTimeout(200);
  const v3 = await page.locator(".sheet.is-open .js-time").last().inputValue();
  c.check("17:50 の＋15分は 18:00（目へ寄せる）", v3 === "18:00", v3);
  await page.locator(".sheet.is-open .js-time-down").last().click();
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  c.check("閉じると札は「17:45 〜 18:15」", /17:45 〜 18:15/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));

  /* 日付の札も押せば閉じる */
  await page.locator(".sheet.is-open .js-row-due").last().click();
  await page.waitForTimeout(700);
  await clickChip(".js-due-chips", "明日");
  await page.waitForTimeout(900);
  c.check("日付の札を押すと紙が閉じる", (await sheets()) === 1, String(await sheets()));
  c.check("日付の札は「明日」", /明日/.test(await rowText(".js-row-due")), await rowText(".js-row-due"));

  await page.locator(".sheet.is-open .js-title").last().fill("時刻の札の試し");
  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(700);
  const saved = await page.evaluate(() => {
    const t = KN.store.get().todos.find((x) => x.title === "時刻の札の試し");
    return t && { time: t.time, due: t.due, tomorrow: KN.util.shiftDay(KN.util.todayKey(), 1) };
  });
  c.check("保存は 17:45・明日", !!saved && saved.time === "17:45" && saved.due === saved.tomorrow, JSON.stringify(saved));

  /* 二度使った時刻は札に上がる */
  await page.evaluate(() => {
    KN.store.addTodo({ title: "早朝の試しA", due: KN.util.todayKey(), time: "06:30" });
    KN.store.addTodo({ title: "早朝の試しB", due: KN.util.todayKey(), time: "06:30" });
    KN.screens.todo.open(null);
  });
  await page.waitForTimeout(800);
  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  q = await quick();
  c.check("二度使った 6:30 が先頭に上がり、札は8つのまま",
    q.length === 8 && q[0].label === "6:30", JSON.stringify(q.map((x) => x.label)));

  c.check("絵文字なし", await page.evaluate(() =>
    !/\p{Extended_Pictographic}/u.test(document.body.innerText)));
  c.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
