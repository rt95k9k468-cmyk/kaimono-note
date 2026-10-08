/* 体重の線と「平均」（docs/health.md の「体重の線と平均は、古い日ほど軽く均す」）。

   時計を 2026年10月8日 10:00 に止める。trendLine は古い日ほど重みを減らす平均
   （7日なら一日ごとに 0.75 倍）。重みは日数で減り、測らなかった日は埋めない。
   値を出す・出さないと full は movingAverage と同じ。気づいたこと（analyze）は
   movingAverage のまま。記録は書き換えない。 */
const { open, checker } = require("./lib");

const t = checker("weight-trend");
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 9, 8, 10, 0)); },
  });

  /* rows: [[何日前, kg], ...]。窓の設定は既定（7日）に戻す。 */
  const seed = (rows, goal) => page.evaluate(({ rows, goal }) => {
    const U = KN.util, S = KN.store;
    S.update((s) => {
      s.diet.weights = [];
      s.diet.goal.avgWindowDays = null;
      s.diet.goal.trendWindowDays = null;
    });
    rows.forEach(([ago, kg]) => S.addWeight({ day: U.shiftDay(U.todayKey(), -ago), time: "07:00", kg }));
    if (goal) S.setGoal(goal);
  }, { rows, goal });
  const range = (days, n) => Array.from({ length: days }, (_, i) => [days - i + (n || 0), 70]);
  const hero = () => page.evaluate(() => {
    const el = document.querySelector("#screen-diet .js-avg");
    return el ? {
      label: el.querySelector(".diet-stat-label").textContent,
      value: el.querySelector(".diet-stat-value").textContent,
    } : null;
  });
  const show = async () => {
    await page.evaluate(() => KN.app.showScreen("diet"));
    await page.waitForTimeout(200);
  };

  /* ---- 段：30日 70.0 のあと、今日 69.0 ---- */
  await seed([...range(30), [0, 69]]);
  const step = await page.evaluate(() => KN.diet.weightSummary(30).ma7Now);
  t.check("今日の値は 1/4 効く（69.75。N日平均なら 69.86）", step === 69.75, step);
  await show();
  const h1 = await hero();
  t.check("画面の「7日平均」も 69.75", h1 && h1.value === "69.75" && /7日平均/.test(h1.label), JSON.stringify(h1));

  /* ---- 空いた日：日数で軽くなる（埋めない） ---- */
  await seed([...range(26, 4), [0, 69]]);
  const gap = await page.evaluate(() => KN.diet.weightSummary(30).ma7Now);
  t.check("五日ぶりの値は約半分効く（69.49。前の値で埋めれば 69.24）", gap === 69.49, gap);

  /* ---- 出す・出さないは movingAverage と同じ ---- */
  const parity = await page.evaluate(() => {
    const U = KN.util, D = KN.diet;
    const pts = [0, 1, 4, 5, 6, 13, 14, 20].map((o, i) => ({ day: U.shiftDay("2026-09-01", o), kg: 70 + (i % 3) * 0.4 }));
    const a = D.trendLine(pts, 7).map((m) => [m.value == null, m.full]);
    const b = D.movingAverage(pts, 7).map((m) => [m.value == null, m.full]);
    return JSON.stringify(a) === JSON.stringify(b);
  });
  t.check("値を出す・出さないと full は movingAverage と同じ", parity);
  await seed([[0, 70]]);
  const one = await page.evaluate(() => KN.diet.weightSummary(30).ma7Now);
  await show();
  const h2 = await hero();
  t.check("一点だけなら平均は無い（—）", one === null && h2 && h2.value === "—", JSON.stringify(h2));

  /* ---- 期間の札で数が変わらない ---- */
  await seed(Array.from({ length: 60 }, (_, i) => [60 - i, 70 + Math.sin(i) * 0.6]));
  const same = await page.evaluate(() => {
    const D = KN.diet, U = KN.util;
    const a = D.weightSummary(30).ma7Now, b = D.weightSummary(90).ma7Now, c = D.weightSummary(4000).ma7Now;
    const line = D.trendLine(D.weightPoints(null, U.todayKey()), 7).filter((m) => m.value != null);
    return { a, b, c, last: line[line.length - 1].value };
  });
  t.check("30日・90日・全部で「平均」が同じ", same.a === same.b && same.b === same.c && same.c === same.last,
    JSON.stringify(same));

  /* ---- 一定に減るとき：遅れは N日平均と同じ ---- */
  await seed(Array.from({ length: 61 }, (_, i) => [60 - i, Math.round((80 - 0.05 * i) * 100) / 100]));
  const lin = await page.evaluate(() => {
    const s = KN.diet.weightSummary(30);
    return { slope: s.trendPerWeek, now: s.ma7Now, kg: s.latest.kg };
  });
  t.check("傾きは週 -0.35kg", Math.abs(lin.slope + 0.35) < 0.005, JSON.stringify(lin));
  t.check("遅れは 3日ぶん（+0.15kg）", Math.abs(lin.now - (lin.kg + 0.15)) < 0.01, JSON.stringify(lin));

  /* ---- 設定の日数に従う ---- */
  await seed(Array.from({ length: 40 }, (_, i) => [40 - i, 70 + (i % 4) * 0.3]), { avgWindowDays: 14 });
  await show();
  const h3 = await hero();
  const want14 = await page.evaluate(() => {
    const D = KN.diet, U = KN.util;
    const line = D.trendLine(D.weightPoints(null, U.todayKey()), 14).filter((m) => m.value != null);
    return line[line.length - 1].value.toFixed(2);
  });
  t.check("14日にすれば「14日平均」とその数", h3 && /14日平均/.test(h3.label) && h3.value === want14,
    `${JSON.stringify(h3)} ${want14}`);

  /* ---- グラフ：7日の札で線が左端から ---- */
  await seed(Array.from({ length: 30 }, (_, i) => [30 - i, 70 + (i % 5) * 0.2]));
  await page.evaluate(() => KN.store.setDietRange(7));
  await show();
  const g = await page.evaluate(() => {
    const sc = document.querySelector("#screen-diet .js-day-card") || document.querySelector("#screen-diet");
    const path = sc.querySelector(".diet-ma7");
    const dots = [...sc.querySelectorAll(".diet-dot")].map((c) => Number(c.getAttribute("cx")));
    const m = path && /^M\s*([\d.]+)/.exec(path.getAttribute("d"));
    const leg = sc.querySelector(".diet-legend");
    return {
      x0: m ? Number(m[1]) : null, minDot: dots.length ? Math.min(...dots) : null,
      pathLength: path && path.getAttribute("pathLength"), legend: leg ? leg.textContent : "",
    };
  });
  t.check("7日の札でも線が左端の点から引かれる", g.x0 != null && g.minDot != null && Math.abs(g.x0 - g.minDot) < 0.5,
    JSON.stringify(g));
  t.check("線の動き（pathLength=1）と凡例はそのまま", g.pathLength === "1" && /7日平均/.test(g.legend), JSON.stringify(g));
  await page.evaluate(() => KN.store.setDietRange(30));

  /* ---- 凡例：線が無ければ出さない・印が無ければ「飲んだ日」も出さない ---- */
  const legend = () => page.evaluate(() => {
    const sc = document.querySelector("#screen-diet .js-day-card") || document.querySelector("#screen-diet");
    const leg = sc.querySelector(".diet-legend");
    return leg ? leg.textContent.replace(/\s+/g, "") : null;
  });
  await seed([]);
  await show();
  t.check("記録が無ければ凡例も無い", (await legend()) === null);
  await seed(Array.from({ length: 10 }, (_, i) => [10 - i, 70]));
  await page.evaluate(() => KN.store.update((s) => { s.diet.drinks = []; }));
  await show();
  const noBeer = await legend();
  t.check("飲んだ日の無い期間は「飲んだ日」を出さない", noBeer && /実測/.test(noBeer) && !/飲んだ日/.test(noBeer), noBeer);
  await page.evaluate(() => KN.store.addDrink({ day: KN.util.shiftDay(KN.util.todayKey(), -2), time: "20:00",
    kind: "beer", volumeMl: 350, abv: 5, alcoholG: 14, kcal: 140 }));
  await show();
  t.check("飲んだ日があれば「飲んだ日」", /飲んだ日/.test((await legend()) || ""));
  await page.evaluate(() => KN.store.update((s) => { s.diet.drinks = []; }));

  /* ---- 記録を変えない ---- */
  const safe = await page.evaluate(() => {
    const before = JSON.stringify(KN.store.get().diet.weights);
    KN.diet.weightSummary(30); KN.diet.weightSummary(4000);
    return before === JSON.stringify(KN.store.get().diet.weights);
  });
  t.check("記録を変えない（読むだけ）", safe);
  const txt = await page.evaluate(() => document.querySelector("#screen-diet").innerText);
  t.check("絵文字なし", !EMOJI.test(txt));
  t.check("ページのエラーなし", errors.length === 0, errors.join("\n"));

  await browser.close();
  t.done();
})();
