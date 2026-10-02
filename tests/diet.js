/* ダイエット（health）の主な筋（R20）。記録する・直す・消す・日をまたぐ、を画面から。

   時計は 2026年9月29日 21:00 に止める（あとで 9月30日 0:05 へ進める）。
   - ＋ →「体重」→ 紙「体重を記録」→ 打って「記録する」：その日の体重になり、頭の枠に出る
   - 読み直しても残る
   - 頭の数を押すと「体重を直す」：直すと一件のまま値が変わる（増えない）
   - 紙の屑かご → 確かめ →「消す」：記録が無くなり、頭は「—」
   - 日をまたぐ（時計を進めて、戻ってきた＝visibilitychange）：画面は新しい今日を向き、
     前の日の記録は前の日のまま（動かない・今日の枠に「今日」として出ない）。暦で
     前の日へ戻ると、その記録が出る
   - 食事：＋ →「今日の食事」で一行書くと、その日の食事の記録になる
   - 評価の色や言葉を足さない決まりは health の側には無いが、絵文字は出さない（CLAUDE.md） */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("diet");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 21, 0)); },
  });
  const sheet = ".sheet.is-open";
  const heroKg = () => page.evaluate(() => {
    const b = document.querySelector("#screen-diet .diet-hero-value b");
    const l = document.querySelector("#screen-diet .diet-hero-label");
    return { kg: b ? b.textContent.trim() : null, label: l ? l.textContent.trim() : null };
  });
  const plusPick = async (label) => {
    await page.locator(".js-open-add:visible").first().click();
    await page.locator("[role=menuitem], .fab-menu button, .menu-item", { hasText: label }).first().click();
    await page.waitForSelector(sheet);
    await page.waitForTimeout(250);
  };
  const saveSheet = async () => {
    await page.locator(`${sheet} .js-save`).click();
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  };

  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForFunction(() => KN.app.activeScreen() === "diet" && document.querySelector("#screen-diet .diet-hero-value"));
  await page.waitForTimeout(300);
  let h = await heroKg();
  t.check("記録の無い日の頭は「—」", h.kg === "—", JSON.stringify(h));

  /* ---- 記録する ---- */
  await plusPick("体重");
  t.check("＋ →「体重」で「体重を記録」の紙", (await page.locator(`${sheet} .sheet-title, ${sheet} h2`).first().innerText()).includes("体重を記録"));
  await page.locator(`${sheet} .js-kg`).fill("60.4");
  // 体脂肪を三桁打ち終えたら、鍵盤を閉じる（欄から focus が外れる）
  await page.locator(`${sheet} .js-fat`).focus();
  await page.keyboard.type("215");
  await page.waitForTimeout(200);
  const fatState = await page.evaluate((s) => {
    const el = document.querySelector(`${s} .js-fat`);
    return { v: el.value, focused: document.activeElement === el };
  }, sheet);
  t.check("体脂肪を三桁打つと 21.5 になり、鍵盤が閉じる", fatState.v === "21.5" && !fatState.focused, JSON.stringify(fatState));
  await saveSheet();
  let W = await page.evaluate(() => KN.store.get().diet.weights.map((w) => ({ day: w.day, kg: w.kg, fat: w.fat, source: w.source })));
  t.check("記録すると、その日の体重が一件入る", W.length === 1 && W[0].day === "2026-09-29" && W[0].kg === 60.4 && W[0].fat === 21.5
    && W[0].source === "manual", JSON.stringify(W));
  h = await heroKg();
  t.check("頭の枠に 60.4 と出る", h.kg === "60.4", JSON.stringify(h));

  await page.evaluate(() => KN.store.flush());
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForFunction(() => KN.app.activeScreen() === "diet" && document.querySelector("#screen-diet .diet-hero-value"));
  await page.waitForTimeout(300);
  h = await heroKg();
  t.check("読み直しても残る", h.kg === "60.4", JSON.stringify(h));

  /* ---- 直す ---- */
  await page.locator("#screen-diet .js-weight").click();
  await page.waitForSelector(sheet);
  await page.waitForTimeout(250);
  const title2 = await page.locator(`${sheet} .sheet-title, ${sheet} h2`).first().innerText();
  const prefilled = await page.locator(`${sheet} .js-kg`).inputValue();
  t.check("頭の数を押すと「体重を直す」（いまの値が入っている）", title2.includes("体重を直す") && prefilled === "60.4", `${title2} ${prefilled}`);
  await page.locator(`${sheet} .js-kg`).fill("60.1");
  await saveSheet();
  W = await page.evaluate(() => KN.store.get().diet.weights.map((w) => w.kg));
  h = await heroKg();
  t.check("直すと一件のまま値が変わる", W.length === 1 && W[0] === 60.1 && h.kg === "60.1", JSON.stringify({ W, h }));

  /* ---- 消す ---- */
  await page.locator("#screen-diet .js-weight").click();
  await page.waitForSelector(`${sheet} .js-del`);
  await page.waitForTimeout(250);
  await page.locator(`${sheet} .js-del`).click();
  await page.waitForSelector(".js-ok");
  const confirmText = await page.evaluate(() => document.body.innerText);
  t.check("消す前に確かめる（「この記録を消す」）", confirmText.includes("この記録を消す"));
  await page.locator(".js-ok").last().click();
  await page.waitForTimeout(500);
  W = await page.evaluate(() => KN.store.get().diet.weights.length);
  h = await heroKg();
  t.check("消すと記録が無くなり、頭は「—」", W === 0 && h.kg === "—", JSON.stringify({ W, h }));

  /* ---- 食事を一行 ---- */
  await plusPick("今日の食事");
  const mealInput = page.locator(`${sheet} textarea, ${sheet} input[type=text], ${sheet} .input`).first();
  await mealInput.fill("試験のおにぎり");
  await page.locator(`${sheet} .js-save`).first().click().catch(() => {});
  await page.waitForTimeout(500);
  if (await page.locator(sheet).count()) {
    await page.locator(`${sheet} button`, { hasText: /保存|記録|閉じる/ }).first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const meals = await page.evaluate(() => KN.store.get().diet.meals.map((m) => ({ day: m.day, memo: m.memo,
    items: (m.items || []).map((i) => i.name) })));
  t.check("＋ →「今日の食事」で書いた一行が、その日の食事になる",
    meals.some((m) => m.day === "2026-09-29" && (String(m.memo).includes("試験のおにぎり") || m.items.some((n) => String(n).includes("試験のおにぎり")))),
    JSON.stringify(meals));

  /* ---- 日をまたぐ ---- */
  await plusPick("体重");
  await page.locator(`${sheet} .js-kg`).fill("60.0");
  await saveSheet();
  await page.clock.setFixedTime(new Date(2026, 8, 30, 0, 5));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  const cross = await page.evaluate(() => ({
    day: KN.screens.diet.day(), today: KN.util.todayKey(),
    weights: KN.store.get().diet.weights.map((w) => w.day),
  }));
  h = await heroKg();
  t.check("日をまたぐと、画面は新しい今日（9月30日）を向く", cross.today === "2026-09-30" && cross.day === "2026-09-30", JSON.stringify(cross));
  t.check("前の日の記録は前の日のまま（動かない）", cross.weights.length === 1 && cross.weights[0] === "2026-09-29", JSON.stringify(cross));
  t.check("新しい今日の頭に、前の日の体重を「今日」として出さない", !(h.label || "").startsWith("今日") || h.kg === "—", JSON.stringify(h));
  /* 帯の暦で前の日を押す（shared-day.js と同じ手） */
  await page.evaluate(() => document.querySelector('#head .cal-day[data-day="2026-09-29"]').click());
  await page.waitForFunction(() => KN.screens.diet.day() === "2026-09-29", null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  h = await heroKg();
  const backDay = await page.evaluate(() => KN.screens.diet.day());
  t.check("暦で前の日へ戻ると、その記録が出る", backDay === "2026-09-29" && h.kg === "60.0", JSON.stringify({ backDay, h }));

  const txt = await page.locator("#screen-diet").innerText();
  t.check("絵文字を出さない", !/\p{Extended_Pictographic}/u.test(txt));
  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
