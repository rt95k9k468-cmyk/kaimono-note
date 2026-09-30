/* 食事の中身をAIの相談に足す（2026年9月30日、docs/health.md の「AIの窓口の見本」）。

   時計は 2026年9月30日 20:00 に止める。
   - payload：mealDay を渡さなければ meals を持たない（前と同じ形）・渡すとその日の
     書いた文・品名・量・数が入る・ほかの日の食事は入らない
   - 窓口が無ければ、食事の画面に入口は出ない
   - 窓口があれば「今日の食事についてAIに聞く」→ 紙は食事の中身も送る側から始まり、
     送ったものに meals（今日）が入る。「合計だけ」を選ぶと meals は入らない
   - 送るのはダイエットの記録だけ：やること・買うものの名前は本文に出ない、
     top-level の欄は決まったものだけ
   本物の窓口には繋がない（`ai.invalid` を `page.route` で受ける）。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("diet-ai-meals");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 30, 20, 0)); },
  });

  const posted = [];
  await page.route("https://ai.invalid/**", (route) => {
    const req = route.request();
    if (req.method() === "POST") posted.push(JSON.parse(req.postData()));
    return route.fulfill({ status: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "たんぱく質が少なめに見えます（試験）" }) });
  });

  await page.evaluate(() => {
    const S = KN.store;
    const today = KN.util.todayKey();
    const yest = KN.util.shiftDay(today, -1);
    S.setSlotMemo(today, "breakfast", "ご飯 茶碗1杯、納豆");
    S.addMeal({ day: today, slot: "lunch", items: [
      { name: "鶏むね肉のソテー", amount: "1枚", grams: 150, kcal: 180, p: 33, f: 3, c: 0, from: "ai", estimated: true },
    ] });
    S.setSlotMemo(yest, "dinner", "きのうのカレー");
    S.addTodo({ title: "歯医者を予約する試験用" });
  });

  // 1. payload
  const plain = await page.evaluate(() => KN.dietAI.payload(30));
  t.check("mealDay が無ければ meals を持たない", !("meals" in plain), Object.keys(plain).join(","));
  const withMeals = await page.evaluate(() => KN.dietAI.payload(30, { mealDay: KN.util.todayKey() }));
  const m = withMeals.meals || { entries: [] };
  t.check("meals は今日の日付", m.day === "2026-09-30", m.day);
  t.check("朝の書いた文が入る", m.entries.some((e) => e.slot === "breakfast" && e.memo === "ご飯 茶碗1杯、納豆"));
  const it = (m.entries.find((e) => e.slot === "lunch") || { items: [] }).items[0] || {};
  t.check("昼の品名・量・g・数・推定の印が入る",
    it.name === "鶏むね肉のソテー" && it.amount === "1枚" && it.grams === 150 && it.kcal === 180 && it.p === 33 && it.estimated === true,
    JSON.stringify(it));
  t.check("ほかの日の食事は入らない", !JSON.stringify(m).includes("きのうのカレー"));
  t.check("note に meals の読み方", /meals はその日の食事の中身/.test(withMeals.note));

  // 2. 窓口が無ければ入口は出ない
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForFunction(() => KN.app.activeScreen() === "diet" && document.querySelector("#screen-diet .js-meals .diet-memo"));
  await page.waitForTimeout(300);
  t.check("窓口が無ければ入口なし", (await page.locator("#screen-diet .js-ai-ask").count()) === 0);

  // 3. 窓口を置くと入口が出る
  await page.evaluate(() => KN.dietAI.setUrl("https://ai.invalid/kn-test"));
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(500);
  const btn = page.locator("#screen-diet .js-ai-ask", { hasText: "今日の食事についてAIに聞く" }).first();
  t.check("窓口があれば「今日の食事についてAIに聞く」", (await btn.count()) === 1);
  await btn.click();
  await page.waitForSelector(".sheet.is-open .js-go");
  await page.waitForTimeout(300);
  const sheet = page.locator(".sheet.is-open");
  const what = (await sheet.locator(".js-what").textContent()).trim();
  t.check("紙は食事の中身も送る側から始まる", /今日の食事の中身/.test(what), what);
  t.check("送らないものを言う", /買い物リスト・やること・日記は送りません/.test(what), what);

  await sheet.locator(".js-go").click();
  await page.waitForFunction(() => document.querySelector(".sheet.is-open .diet-ai-out"), null, { timeout: 5000 }).catch(() => {});
  const reply = await sheet.locator(".diet-ai-out").textContent().catch(() => "");
  t.check("返事が紙に出る", /たんぱく質が少なめ/.test(reply || ""), reply);
  const sent = posted[0] || { data: {} };
  t.check("相談の種類は coach", sent.kind === "coach");
  t.check("送った材料に今日の meals", sent.data.meals && sent.data.meals.day === "2026-09-30"
    && JSON.stringify(sent.data.meals).includes("鶏むね肉のソテー"));
  t.check("やることの題は送らない", !JSON.stringify(sent).includes("歯医者を予約する試験用"));
  const keys = Object.keys(sent.data).sort().join(",");
  t.check("材料の欄はダイエットのものだけ", keys === "days,goal,meals,note,summary,today", keys);

  // 4. 「合計だけ」を選ぶと meals を送らない
  await sheet.locator(".chip", { hasText: "合計だけ" }).first().click();
  const what2 = (await sheet.locator(".js-what").textContent()).trim();
  t.check("合計だけにすると文から中身が消える", !/食事の中身/.test(what2), what2);
  await sheet.locator(".js-go").click();
  await page.waitForTimeout(600);
  t.check("合計だけなら meals は入らない", posted.length === 2 && !("meals" in posted[1].data));

  // 5. 「気づいたこと」の相談は合計だけから始まる
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const general = await page.evaluate(() => {
    const b = document.querySelector("#screen-diet .js-ai");
    return !!b;
  });
  if (general) {
    await page.locator("#screen-diet .js-ai").first().click();
    await page.waitForSelector(".sheet.is-open .js-what");
    const what3 = (await page.locator(".sheet.is-open .js-what").textContent()).trim();
    t.check("「AIに相談する」は合計だけから始まる", !/食事の中身/.test(what3), what3);
  }

  // 6. 絵文字を出さない
  const emoji = await page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.querySelector(".sheet.is-open, #screen-diet").textContent));
  t.check("絵文字なし", !emoji);

  t.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
