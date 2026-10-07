/* 日付と時刻の欄（roadmap-unify の U8・ui.js の whenFields）。画面を開いて欄ごとに。

   端末の日付欄・時刻欄をやめ、見えるのはボタン、値は隠した <input> に持つ。紙を閉じたときの書きかけの
   保存（makeGuard）は欄の value しか見ないので、そこが落ちていないかを見る（roadmap-unify の 3節の罠）：
   - 体重・食事：日だけ変えて閉じる → 保存／時刻だけ変えて閉じる → 保存／何も変えずに閉じる → 聞かれない
   - お酒：時刻だけ変えて閉じる → 保存
   - 目標日（遠い日＝年月日のドラム）：回して閉じる → 保存／何も変えずに閉じる → 聞かれない／× で外す → 保存
   - daily の記録：日だけ変えて閉じる → 保存
   - 用事の「日付」：暦で選ぶ → 日付の紙が閉じ、保存すると その日
   - 見える字：今日は「今日 10/7(水)」、時刻は頭の0を落とす（7:05）。「なし」で空へ戻せる欄は「--:--」
   時計は 2026年10月7日 9:00 に止める。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/when-fields.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("when-fields");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 7, 9, 0)); },
  });
  const S = ".sheet.is-open";
  const wait = (ms = 300) => page.waitForTimeout(ms);
  const sheets = () => page.locator(S).count();
  const btnOf = (sel) => page.locator(`${S} ${sel} + .when-btn, .note-pop ${sel} + .when-btn`).last();
  const coverClose = async () => { await page.locator(".note-pop-cover").last().click({ position: { x: 5, y: 5 } }); await wait(250); };
  const closeSheet = async () => { await page.locator(`${S} .js-close`).last().click(); await wait(500); };
  const pickDay = async (sel, key) => {
    await btnOf(sel).click(); await wait(250);
    await page.locator(`.note-pop .pop-cal-day[data-day="${key}"]`).click(); await wait(250);
  };
  /* 車輪は行の高さで回す（止まった行で決まる）。閉じたときに読む。 */
  const spin = (idx) => page.evaluate((idx) => {
    const pop = [...document.querySelectorAll(".note-pop")].pop();
    const cols = pop.querySelectorAll(".note-wheel");
    idx.forEach((v, i) => { const el = cols[i]; const r = [...el.children].findIndex((x) => Number(x.dataset.v) === v); el.scrollTop = r * KN.gesture.WHEEL_ROW; });
  }, idx);
  const pickTime = async (sel, h, m) => { await btnOf(sel).click(); await wait(250); await spin([h, m]); await coverClose(); };

  await page.evaluate(() => KN.app.showScreen("diet"));
  await wait(400);

  /* ---- 体重 ---- */
  const wid = await page.evaluate(() => KN.store.addWeight({ day: "2026-10-07", time: "07:05", kg: 60.2, source: "manual" }).id);
  const weight = () => page.evaluate((id) => JSON.stringify(KN.store.get().diet.weights.find((w) => w.id === id)), wid);
  const openW = async () => {
    await page.evaluate((id) => KN.screens.diet.openWeightSheet(KN.store.get().diet.weights.find((w) => w.id === id)), wid);
    await page.waitForSelector(S); await wait(400);
  };
  await openW();
  const face = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open .when-btn")].map((b) => b.textContent));
  t.check("体重：日付は「今日 10/7(水)」、時刻は「7:05」", face[0] === "今日 10/7(水)" && face[1] === "7:05", JSON.stringify(face));
  t.check("体重：端末の日付欄・時刻欄が無い", await page.locator(`${S} input[type=date], ${S} input[type=time]`).count() === 0);
  const w0 = await weight();
  await closeSheet();
  t.check("体重：何も変えずに閉じる → 聞かれない・変わらない", (await sheets()) === 0 && (await weight()) === w0);

  await openW();
  await pickDay(".js-day", "2026-10-05");
  t.check("体重：暦で選ぶと字が変わる", (await btnOf(".js-day").textContent()) === "10/5(月)");
  await closeSheet();
  let w = JSON.parse(await weight());
  t.check("体重：日だけ変えて閉じる → 保存", (await sheets()) === 0 && w.day === "2026-10-05" && w.time === "07:05", JSON.stringify(w));

  await openW();
  await pickTime(".js-time", 6, 30);
  t.check("体重：車輪で選ぶと字が変わる", (await btnOf(".js-time").textContent()) === "6:30");
  await closeSheet();
  w = JSON.parse(await weight());
  t.check("体重：時刻だけ変えて閉じる → 保存", (await sheets()) === 0 && w.time === "06:30" && w.day === "2026-10-05", JSON.stringify(w));

  /* ---- 食事 ---- */
  const mid = await page.evaluate(() => KN.store.addMeal({ day: "2026-10-07", time: "12:00", slot: "lunch", items: [{ name: "おにぎり", kcal: 180 }] }).id);
  const meal = () => page.evaluate((id) => JSON.stringify(KN.store.get().diet.meals.find((m) => m.id === id)), mid);
  const openM = async () => {
    await page.evaluate((id) => KN.screens.diet.openMealSheet(KN.store.get().diet.meals.find((m) => m.id === id)), mid);
    await page.waitForSelector(S); await wait(400);
  };
  await openM();
  const m0 = await meal();
  await closeSheet();
  t.check("食事：何も変えずに閉じる → 聞かれない・変わらない", (await sheets()) === 0 && (await meal()) === m0);
  await openM();
  await pickDay(".js-day", "2026-10-06");
  await closeSheet();
  let m = JSON.parse(await meal());
  t.check("食事：日だけ変えて閉じる → 保存", m.day === "2026-10-06" && m.time === "12:00", JSON.stringify(m));
  await page.evaluate(() => KN.ui.toast(""));
  await openM();
  await pickTime(".js-time", 13, 15);
  await closeSheet();
  m = JSON.parse(await meal());
  t.check("食事：時刻だけ変えて閉じる → 保存", m.time === "13:15" && m.day === "2026-10-06", JSON.stringify(m));

  /* ---- お酒 ---- */
  const did = await page.evaluate(() => {
    const d = KN.store.addDrink({ ...KN.drinks.parse("ビール350ml").items[0], day: "2026-10-07", time: "20:00", raw: "ビール350ml" });
    return d && d.id;
  });
  if (did) {
    await page.evaluate((id) => KN.screens.diet.openDrinkSheet("2026-10-07", id), did);
    await page.waitForSelector(S); await wait(400);
    await pickTime(".js-time", 21, 40);
    await closeSheet();
    const d = await page.evaluate((id) => KN.store.get().diet.drinks.find((x) => x.id === id), did);
    t.check("お酒：時刻だけ変えて閉じる → 保存", (await sheets()) === 0 && d && d.time === "21:40", JSON.stringify(d));
  } else {
    t.check("お酒：記録を一件つくれた", false);
  }

  /* ---- 目標日（年月日のドラム） ---- */
  const goal = () => page.evaluate(() => KN.store.get().diet.goal.targetDay || null);
  const openG = async () => { await page.evaluate(() => KN.screens.diet.openGoalSheet()); await page.waitForSelector(S); await wait(400); };
  await openG();
  t.check("目標日：空は「--/--/--」", (await btnOf(".js-td").textContent()) === "--/--/--");
  await closeSheet();
  t.check("目標日：何も変えずに閉じる → 聞かれない", (await sheets()) === 0 && (await goal()) === null);
  await openG();
  await btnOf(".js-td").click(); await wait(250);
  t.check("目標日：年月日のドラムが出る", await page.locator(".note-pop .note-wheel").count() === 3);
  await spin([2027, 3, 31]);
  await coverClose();
  await closeSheet();
  t.check("目標日：回して閉じる → 保存", (await goal()) === "2027-03-31", String(await goal()));
  await openG();
  await page.locator(`${S} .js-td-clear`).click(); await wait(200);
  await closeSheet();
  t.check("目標日：× で外して閉じる → 保存", (await goal()) === null, String(await goal()));

  /* ---- daily の記録 ---- */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await wait(400);
  const eid = await page.evaluate(() => {
    const e = KN.store.addEntry({ type: "reading", date: "2026-10-07", title: "本", memo: "" });
    return e && e.id;
  });
  if (eid) {
    await page.evaluate((id) => KN.screens.archive.openEntry(id), eid);
    await page.waitForSelector(S); await wait(400);
    await pickDay(".js-date", "2026-10-04");
    await closeSheet();
    const e = await page.evaluate((id) => KN.store.get().archive.entries.find((x) => x.id === id), eid);
    t.check("daily の記録：日だけ変えて閉じる → 保存", (await sheets()) === 0 && e && e.date === "2026-10-04", JSON.stringify(e && e.date));
  } else {
    t.check("daily の記録：一件つくれた", false);
  }

  /* ---- 用事の「日付」 ---- */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await wait(400);
  const tid = await page.evaluate(() => KN.store.addTodo({ title: "日付の試し", due: "2026-10-07" }).id);
  await page.evaluate((id) => KN.screens.todo.open(id), tid);
  await page.waitForSelector(S); await wait(400);
  await page.locator(`${S} .js-row-due`).click(); await wait(300);
  await pickDay(".js-due", "2026-10-20");
  await wait(300);
  t.check("用事：暦で選ぶと日付の紙が閉じる", await page.locator(".note-pop.is-form").count() === 0);
  t.check("用事：札の行がその日になる", (await page.locator(`${S} .js-row-due .d-label`).textContent()).includes("10月20日"));
  await page.locator(`${S} .js-save`).last().click(); await wait(500);
  const td = await page.evaluate((id) => KN.store.getTodo(id).due, tid);
  t.check("用事：保存すると その日", td === "2026-10-20", td);

  /* ---- 空へ戻す（data-clear） ---- */
  await page.evaluate(() => KN.app.showScreen("diet"));
  await wait(300);
  await openW();
  await btnOf(".js-time").click(); await wait(250);
  t.check("「なし」の口がある", await page.locator(".note-pop .when-none").count() === 1);
  await page.locator(".note-pop .when-none").click(); await wait(250);
  t.check("「なし」で空は「--:--」", (await btnOf(".js-time").textContent()) === "--:--");
  await closeSheet();
  w = JSON.parse(await weight());
  t.check("体重：時刻を外して閉じる → 保存（時刻なし）", w.time == null, JSON.stringify(w));

  t.check("エラーが出ない", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
