/* AIの窓口と食事の推計（2026年9月30日、docs/health.md の「AIの窓口の見本」）。

   窓口に推計を代わりにやってもらうボタンは、料金が割に合わないので外した（同日）。
   - 窓口があっても、食事の画面に「AIに推計してもらう」は出ない。コピーと貼り付けは出る
   - 前に窓口で推計した記録の料金（ai.cost）は、読み直しても落ちず、帯に出る
   - 貼り付けた推計には cost が付かない
   - 相談の紙：最初は「合計だけ」、「今日の食事の中身も」で meals を足す、返事の下に料金
   本物の窓口には繋がない（`ai.invalid` を `page.route` で受ける）。 */
const { open, checker } = require("./lib");

const ANSWER = [
  "食品: 卵", "量: 1個", "カロリー: 80", "タンパク質: 6", "脂質: 5", "炭水化物: 0", "食物繊維: 0",
  "区分: 朝", "根拠: 標準的な食品成分データ", "情報源: AIの推定", "確度: 中",
  "食品: 納豆", "量: 1パック", "カロリー: 90", "タンパク質: 7", "脂質: 5", "炭水化物: 5", "食物繊維: 3",
  "区分: 朝", "根拠: 標準的な食品成分データ", "情報源: AIの推定", "確度: 中",
  "朝合計: 170", "昼合計: 0", "夜合計: 0", "間食合計: 0",
  "摂取カロリー: 170", "タンパク質: 13", "脂質: 10", "炭水化物: 5", "食物繊維: 3",
  "推定下限: 150", "推定上限: 200",
  "評価: この時点までの摂取は170kcalです。",
].join("\n");
const COST = { model: "claude-opus-5", inputTokens: 4000, outputTokens: 1500, searches: 2, usd: 0.0775 };

(async () => {
  const t = checker("diet-ai-estimate");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 30, 10, 8)); },
  });

  const posted = [];
  await page.route("https://ai.invalid/**", async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || "{}");
    posted.push(body);
    const head = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    if (body.kind === "coach") {
      return route.fulfill({ status: 200, headers: head,
        body: JSON.stringify({ text: "ふつうです（試験）", cost: { ...COST, searches: 0, usd: 0.02 } }) });
    }
    return route.fulfill({ status: 400, headers: head, body: JSON.stringify({ error: "coach だけ（試験）" }) });
  });

  await page.evaluate(() => {
    const S = KN.store;
    S.setDayMemo(KN.util.todayKey(), "【朝】卵、納豆");
    S.addTodo({ title: "歯医者を予約する試験用" });
  });
  const show = async (pane = "log") => {
    await page.evaluate(() => KN.app.showScreen("todo"));
    await page.waitForTimeout(250);
    await page.evaluate(() => KN.app.showScreen("diet"));
    await page.waitForFunction(() => KN.app.activeScreen() === "diet" && document.querySelector("#screen-diet .js-meals .diet-memo"));
    /* 食事は「記録」、気づいたことは「推移」の区画（V24、V26 で既定）。 */
    await page.click(`#screen-diet .js-pane[data-pane="${pane}"]`);
    await page.waitForTimeout(300);
  };

  // 1. 窓口があっても推計のボタンは出ない
  await page.evaluate(() => KN.dietAI.setUrl("https://ai.invalid/kn-test"));
  await show();
  t.check("窓口があっても「AIに推計してもらう」なし", (await page.locator("#screen-diet .js-ai-run").count()) === 0
    && !/AIに推計してもらう/.test(await page.locator("#screen-diet").textContent()));
  t.check("コピーと貼り付けはそのまま", (await page.locator("#screen-diet .js-ai-prompt:visible").count()) >= 1
    && (await page.locator("#screen-diet .js-ai-paste:visible").count()) >= 1);

  // 2. 前に窓口で推計した記録の料金は落ちない
  await page.evaluate(([text, cost]) => {
    KN.store.setDayMemo(KN.util.todayKey(), "【朝】卵、納豆", [], { raw: text, kcal: 170, at: new Date().toISOString(), cost });
  }, [ANSWER, COST]);
  await page.waitForFunction(() => KN.store);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => KN.store);
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => ((KN.store.dayMemo(KN.util.todayKey()) || {}).ai || {}).cost || null);
  t.check("読み直しても料金が残る", kept && kept.usd === 0.0775 && kept.searches === 2, JSON.stringify(kept));
  await show();
  const strip = await page.locator("#screen-diet .diet-memo-body:visible").first().textContent().catch(() => "");
  t.check("帯に料金「約$0.077（約12円）・検索2回」", /約\$0\.077（約12円）・検索2回/.test(strip || ""), strip);

  // 5. 貼り付けた推計には料金が付かない
  const pasted = await page.evaluate((text) => {
    KN.store.setDayMemo(KN.util.shiftDay(KN.util.todayKey(), -1), "【朝】パン", [], { raw: text, kcal: 100 });
    return (KN.store.dayMemo(KN.util.shiftDay(KN.util.todayKey(), -1)) || {}).ai;
  }, ANSWER);
  t.check("料金の無い推計は cost を持たない", pasted && !("cost" in pasted));

  // 6. 相談の紙（「気づいたこと」は設定で出すときだけの欄）
  await page.evaluate(() => KN.store.update((st) => { st.settings.showInsight = true; }));
  await show("trend");
  const hasAsk = (await page.locator("#screen-diet .js-ai").count()) > 0;
  if (hasAsk) {
    await page.locator("#screen-diet .js-ai").first().click();
    await page.waitForSelector(".sheet.is-open .js-what");
    const sheet = page.locator(".sheet.is-open");
    const what = (await sheet.locator(".js-what").textContent()).trim();
    t.check("相談は「合計だけ」から始まる", !/食事の中身/.test(what), what);
    t.check("送らないものを言う", /買い物リスト・やること・日記は送りません/.test(what), what);
    await sheet.locator(".chip", { hasText: "今日の食事の中身も" }).first().click();
    await sheet.locator(".js-go").click();
    await sheet.locator(".js-cost").waitFor({ timeout: 5000 }).catch(() => {});
    const c = posted.filter((b) => b.kind === "coach").pop() || { data: {} };
    t.check("中身もにすると meals を足す", c.data.meals && c.data.meals.day === "2026-09-30"
      && JSON.stringify(c.data.meals).includes("卵、納豆"));
    t.check("材料の欄はダイエットのものだけ", Object.keys(c.data).sort().join(",") === "days,goal,meals,note,summary,today");
    const cl = (await sheet.locator(".js-cost").textContent().catch(() => "")) || "";
    t.check("相談の返事の下に料金", /この相談：約\$0\.020（約3円）/.test(cl), cl);
  } else {
    t.check("「AIに相談する」がある", false);
  }

  t.check("推計を窓口へ送らない", !posted.some((b) => b.kind === "estimate"));
  const emoji = await page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.querySelector("#screen-diet").textContent));
  t.check("絵文字なし", !emoji);
  t.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
