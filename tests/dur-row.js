/* 詳細の紙の「時間」の札（2026年9月29日、docs/todo-items.md の「時間の札」）。

   - 時刻・時間・期限は「時刻」の一枚。時刻は車輪（5分きざみ）、時間は札、期限はスイッチ。
   - 時間は「なし」から（いつもの長さがある用事は「いつもの◯分」——tests/usual-pace.js）。
   - 新しい用事は1時間から（10月21日。10月16日の30分から変えた）。触らずに追加すると 60。
     くり返しは長さに触らなければ null（いつもの長さを殺さない）。
   - 新しい紙だけ「済ませた」のスイッチ。入れると今の時刻、追加すると済ませた用事に。
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
  c.check("札は日付・時刻・くりかえし・済ませたの4つ（通知・カレンダーは⋯の中）",
    rows.length === 4 && /js-row-done/.test(rows[3]) && !rows.some((x) => /js-row-dur|js-row-limit|js-row-notify|js-row-cal/.test(x)), JSON.stringify(rows));
  c.check("決めていなければ「時刻なし」、長さは1時間", /^時刻なし\s*1時間$/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));
  c.check("くりかえしの札は「くりかえし なし」", /くりかえし\s*なし/.test(await rowText(".js-row-repeat")), await rowText(".js-row-repeat"));
  await page.locator(".sheet.is-open .js-menu").last().click();
  await page.waitForTimeout(500);
  const menu = await page.evaluate(() => (document.querySelector(".note-pop[role='menu']") || {}).innerText || "");
  c.check("⋯は紙ではなく小窓で、「時刻に知らせる」と「カレンダーに入れる」", /時刻に知らせる/.test(menu) && /カレンダーに入れる/.test(menu)
    && await page.evaluate(() => document.querySelectorAll(".sheet.is-open").length === 1), menu);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  c.check("時刻は紙ではなく、押した札のそばの小窓", await page.evaluate(() =>
    !!document.querySelector(".note-pop.is-form.is-open .js-time-wheels") && document.querySelectorAll(".sheet.is-open").length === 1));
  const sheet = () => page.evaluate(() => {
    const sh = document.querySelector(".note-pop.is-form");   // 10月2日から押した札のそばの小窓
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
  c.check("時間は札で、「1時間」が点いている（なし＋14）", sh.dur === "1時間" && sh.chips === 15, JSON.stringify(sh));
  /* 車輪を 9時・00分 へ回す */
  await page.evaluate(() => {
    const sh = document.querySelector(".note-pop.is-form");
    const [h, m] = sh.querySelectorAll(".js-time-wheels .note-wheel");
    h.scrollTop = 9 * 40; m.scrollTop = 0;
  });
  await page.waitForTimeout(500);
  sh = await sheet();
  c.check("車輪を回すと時刻が決まる（まん中が9時00分）", sh.time === "9:00" && !sh.off && sh.mid === "9時00分", JSON.stringify(sh));
  c.check("時刻だけ決めると札は「9:00 〜 10:00」", /^9:00 〜 10:00\s*1時間$/.test(await rowText(".js-row-time")), await rowText(".js-row-time"));
  await page.evaluate(() => [...document.querySelector(".note-pop.is-form")
    .querySelectorAll(".js-mins .chip")].find((b) => b.textContent.trim() === "1時間").click());
  sh = await sheet();
  c.check("札で1時間", sh.dur === "1時間", JSON.stringify(sh));
  c.check("期限は切ってあり、日付欄は畳まれている", !sh.limit);
  await page.locator(".note-pop .js-limit-sw").click();
  await page.waitForTimeout(400);
  sh = await sheet();
  const cal = await page.evaluate(() => {
    const c = document.querySelector(".note-pop.is-cal");
    return c ? { days: c.querySelectorAll(".pop-cal-day").length, ym: c.querySelector(".js-ym").textContent } : null;
  });
  c.check("スイッチを入れると日付の札が出て、その場でアプリの暦（小窓）が開く", sh.limit && !!cal && cal.days >= 28, JSON.stringify(cal));
  c.check("期限の暦は端末の日付欄を使わない（画面がずれない）",
    await page.evaluate(() => !document.querySelector('.note-pop input[type="date"]')));
  await page.locator('.note-pop.is-cal .pop-cal-day').nth(19).click();
  await page.waitForTimeout(400);
  // 近い日は札が「明後日」などの呼び名になる（日付依存で落ちた：2026年10月18日）。
  c.check("日を押すと暦が閉じ、札に日付", await page.evaluate(() =>
    !document.querySelector(".note-pop.is-cal.is-open") && /\d+\/\d+|今日|明日|明後日|昨日|日[前後]/.test(document.querySelector(".note-pop .js-limit").textContent)),
    await page.evaluate(() => document.querySelector(".note-pop .js-limit").textContent));
  await page.locator(".note-pop .js-limit-sw").click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const t2 = await rowText(".js-row-time");
  c.check("札は「9:00 〜 10:00　1時間」", /9:00 〜 10:00/.test(t2) && /1時間/.test(t2), t2);

  await page.locator(".sheet.is-open .js-title").last().fill("時間の札の試し");
  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(700);
  const saved = await page.evaluate(() => KN.store.get().todos.find((t) => t.title === "時間の札の試し"));
  c.check("追加すると minutes は 60", !!saved && saved.minutes === 60, JSON.stringify(saved && { m: saved.minutes, t: saved.time }));

  /* 押さずに追加したら1時間 */
  await page.evaluate(() => KN.screens.todo.open(null));
  await page.waitForTimeout(800);
  await page.locator(".sheet.is-open .js-title").last().fill("長さを決めない試し");
  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(700);
  const bare = await page.evaluate(() => {
    const t = KN.store.get().todos.find((x) => x.title === "長さを決めない試し");
    return t ? { m: t.minutes == null ? null : t.minutes, plan: KN.plan.minutesOf(t) } : null;
  });
  c.check("触らずに追加すると保存は1時間", !!bare && bare.m === 60 && bare.plan === 60, JSON.stringify(bare));

  /* くり返しは長さに触らなければ null（いつもの長さを残す） */
  await page.evaluate(() => KN.screens.todo.open(null));
  await page.waitForTimeout(800);
  await page.locator(".sheet.is-open .js-title").last().fill("毎日 くり返しの長さの試し");
  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(700);
  const rep = await page.evaluate(() => {
    const t = KN.store.get().todos.find((x) => /くり返しの長さの試し/.test(x.title) && x.repeat);
    return t ? { m: t.minutes == null ? null : t.minutes, r: t.repeat } : null;
  });
  c.check("くり返しは長さに触らなければ null", !!rep && rep.m === null, JSON.stringify(rep));

  /* 作ってすぐ済ませる */
  await page.evaluate(() => KN.screens.todo.open(null));
  await page.waitForTimeout(800);
  c.check("済ませたは切ってあり、時刻は畳まれている", await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh.querySelector(".js-done-sw").getAttribute("aria-checked") === "false" && sh.querySelector(".js-done-cell").hidden;
  }));
  await page.locator(".sheet.is-open .js-done-sw").last().click();
  await page.waitForTimeout(300);
  const dn = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return { on: sh.querySelector(".js-done-sw").getAttribute("aria-checked"), at: sh.querySelector(".js-done-at").textContent.trim(),
      shown: !sh.querySelector(".js-done-cell").hidden };
  });
  c.check("入れると今の時刻が出る", dn.on === "true" && dn.shown && /^\d{1,2}:\d{2}$/.test(dn.at), JSON.stringify(dn));
  await page.locator(".sheet.is-open .js-done-at").last().click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const [h, m] = document.querySelectorAll(".note-pop.done-at-pop .note-wheel");
    h.scrollTop = 7 * 40; m.scrollTop = 15 * 40;
  });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  c.check("車輪で時刻を直せる（7:15）", await page.evaluate(() =>
    [...document.querySelectorAll(".sheet.is-open")].pop().querySelector(".js-done-at").textContent.trim()) === "7:15");
  await page.locator(".sheet.is-open .js-title").last().fill("作ってすぐ済ませた試し");
  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(700);
  const fin = await page.evaluate(() => {
    const t = KN.store.get().todos.find((x) => x.title === "作ってすぐ済ませた試し");
    const d = t && t.doneAt ? new Date(t.doneAt) : null;
    return t ? { done: t.done, at: d ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : null } : null;
  });
  c.check("追加すると済ませた用事に・時刻は 7:15", !!fin && fin.done === true && fin.at === "7:15", JSON.stringify(fin));

  /* 毎朝（毎日＋朝の端）で持っている用事も、くりかえしの札は「毎日」 */
  await page.evaluate(() => {
    const t = KN.store.addTodo({ title: "朝の決まりの試し", due: KN.util.todayKey(), repeat: "daily", part: "dawn" });
    KN.screens.todo.open(t.id);
  });
  await page.waitForTimeout(800);
  c.check("毎朝のものは「くりかえし 毎日」", /くりかえし\s*毎日/.test(await rowText(".js-row-repeat")), await rowText(".js-row-repeat"));
  await page.locator(".sheet.is-open .js-row-repeat").last().click();
  await page.waitForTimeout(600);
  c.check("くりかえしの小窓でも毎日が点く", await page.evaluate(() => {
    const on = document.querySelector(".note-pop .js-repeat .chip[aria-pressed='true']");
    return !!on && on.textContent.trim() === "毎日";
  }));

  c.check("絵文字なし", await page.evaluate(() =>
    !/\p{Extended_Pictographic}/u.test(document.body.innerText)));
  c.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
