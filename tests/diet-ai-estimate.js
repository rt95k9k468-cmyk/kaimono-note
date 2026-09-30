/* AI推計を窓口に代わりにやってもらう（2026年9月30日、docs/health.md の「AIの窓口の見本」）。

   時計は 2026年9月30日 10:08 に止める。
   - 窓口が無ければ「AIに推計してもらう」は出ない（コピーと貼り付けの二つはそのまま）
   - 窓口があれば出る。押すと、①「プロンプトをコピー」と同じ文を { kind: "estimate", prompt } で送る
     （文には食事メモ。やることの題は入らない。送る欄は kind と prompt だけ）
   - 返事は貼り付けと同じ読み取りで保存される（摂取・区分の合計・評価）。料金の目安
     （cost）も記録に残り、帯と報せに「約$…（約…円）・検索n回」
   - 押しているあいだは「推計しています…」で二度押ししない
   - 窓口の { error } はそのまま報せに出て、記録は変わらない
   - 相談の紙：最初は「合計だけ」、「今日の食事の中身も」で meals を足す、返事の下に料金
   - 読み直しても cost が残る。貼り付けた推計には cost が付かない
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
  let mode = "ok";
  await page.route("https://ai.invalid/**", async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() || "{}");
    posted.push(body);
    const head = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    if (body.kind === "coach") {
      return route.fulfill({ status: 200, headers: head,
        body: JSON.stringify({ text: "ふつうです（試験）", cost: { ...COST, searches: 0, usd: 0.02 } }) });
    }
    if (mode === "error") {
      return route.fulfill({ status: 502, headers: head, body: JSON.stringify({ error: "混んでいます（試験）" }) });
    }
    await new Promise((r) => setTimeout(r, 600));   // 押しているあいだを見るため
    return route.fulfill({ status: 200, headers: head, body: JSON.stringify({ text: ANSWER, cost: COST }) });
  });

  await page.evaluate(() => {
    const S = KN.store;
    S.setDayMemo(KN.util.todayKey(), "【朝】卵、納豆");
    S.addTodo({ title: "歯医者を予約する試験用" });
  });
  const show = async () => {
    await page.evaluate(() => KN.app.showScreen("todo"));
    await page.waitForTimeout(250);
    await page.evaluate(() => KN.app.showScreen("diet"));
    await page.waitForFunction(() => KN.app.activeScreen() === "diet" && document.querySelector("#screen-diet .js-meals .diet-memo"));
    await page.waitForTimeout(300);
  };
  const runBtn = () => page.locator("#screen-diet .js-ai-run:visible").first();

  // 1. 窓口が無ければ出ない
  await show();
  t.check("窓口が無ければ「AIに推計してもらう」なし", (await page.locator("#screen-diet .js-ai-run").count()) === 0);
  t.check("コピーと貼り付けはそのまま", (await page.locator("#screen-diet .js-ai-prompt:visible").count()) >= 1
    && (await page.locator("#screen-diet .js-ai-paste:visible").count()) >= 1);

  // 2. 窓口を置くと出る → 押す
  await page.evaluate(() => KN.dietAI.setUrl("https://ai.invalid/kn-test"));
  await show();
  t.check("窓口があれば「AIに推計してもらう」", (await runBtn().count()) === 1);
  await runBtn().click();
  await page.waitForTimeout(150);
  const busy = await page.evaluate(() => {
    const b = [...document.querySelectorAll("#screen-diet .js-ai-run")].find((x) => x.offsetParent);
    return b ? { dis: b.disabled, text: b.textContent.trim() } : null;
  });
  t.check("押しているあいだは「推計しています…」で押せない", busy && busy.dis && /推計しています/.test(busy.text), JSON.stringify(busy));
  await page.waitForFunction(() => { const m = KN.store.dayMemo(KN.util.todayKey()); return m && m.ai; }, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);

  const sent = posted.find((b) => b.kind === "estimate") || {};
  t.check("一度だけ送る", posted.filter((b) => b.kind === "estimate").length === 1);
  t.check("送る欄は kind と prompt だけ", Object.keys(sent).sort().join(",") === "kind,prompt", Object.keys(sent).join(","));
  t.check("文は「AI推計」の聞き方と食事メモ", /栄養を推定してください/.test(sent.prompt || "") && /卵、納豆/.test(sent.prompt || ""));
  t.check("やることの題は送らない", !/歯医者を予約する試験用/.test(sent.prompt || ""));

  const ai = await page.evaluate(() => (KN.store.dayMemo(KN.util.todayKey()) || {}).ai || null);
  t.check("摂取と区分の合計を保存", ai && ai.kcal === 170 && ai.slots && ai.slots.breakfast === 170, JSON.stringify(ai && { kcal: ai.kcal, slots: ai.slots }));
  t.check("評価を保存", ai && /170kcal/.test(ai.analysis || ""));
  t.check("料金の目安を記録に残す", ai && ai.cost && ai.cost.usd === 0.0775 && ai.cost.searches === 2, JSON.stringify(ai && ai.cost));
  const strip = await page.locator("#screen-diet .diet-memo-body:visible").first().textContent().catch(() => "");
  t.check("帯に料金「約$0.077（約12円）・検索2回」", /約\$0\.077（約12円）・検索2回/.test(strip || ""), strip);
  const toast = await page.evaluate(() => [...document.querySelectorAll(".toast, [role=status]")].map((x) => x.textContent).join(" "));
  t.check("報せに料金", /保存しました（約\$0\.077/.test(toast), toast);
  t.check("ボタンは元に戻る", /^AIに推計してもらう$/.test(((await runBtn().textContent()) || "").trim()));

  // 3. 読み直しても残る
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => KN.store);
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => ((KN.store.dayMemo(KN.util.todayKey()) || {}).ai || {}).cost || null);
  t.check("読み直しても料金が残る", kept && kept.usd === 0.0775, JSON.stringify(kept));

  // 4. 窓口の { error } は報せに出て、記録は変わらない
  mode = "error";
  await show();
  await runBtn().click();
  await page.waitForTimeout(800);
  const toast2 = await page.evaluate(() => [...document.querySelectorAll(".toast, [role=status]")].map((x) => x.textContent).join(" "));
  t.check("しくじったら窓口の文を出す", /混んでいます（試験）/.test(toast2), toast2);
  const same = await page.evaluate(() => ((KN.store.dayMemo(KN.util.todayKey()) || {}).ai || {}).kcal);
  t.check("しくじっても前の推計はそのまま", same === 170);
  t.check("しくじったらボタンが戻る", !(await runBtn().isDisabled()));

  // 5. 貼り付けた推計には料金が付かない
  const pasted = await page.evaluate((text) => {
    KN.store.setDayMemo(KN.util.shiftDay(KN.util.todayKey(), -1), "【朝】パン", [], { raw: text, kcal: 100 });
    return (KN.store.dayMemo(KN.util.shiftDay(KN.util.todayKey(), -1)) || {}).ai;
  }, ANSWER);
  t.check("料金の無い推計は cost を持たない", pasted && !("cost" in pasted));

  // 6. 相談の紙（「気づいたこと」は設定で出すときだけの欄）
  await page.evaluate(() => KN.store.update((st) => { st.settings.showInsight = true; }));
  await show();
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

  const emoji = await page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.querySelector("#screen-diet").textContent));
  t.check("絵文字なし", !emoji);
  t.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
