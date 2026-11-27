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
  /* 体重のカードのひと言「7日平均 69.8・…」（R4。数は体重の目盛りと同じ小数一桁）。 */
  const hero = () => page.evaluate(() => {
    const el = document.querySelector("#screen-diet .js-day-card .hl-hero.is-kg .hl-hero-s > span");
    const m = el && /(\d+日平均)\s*(\S+)/.exec(el.textContent);
    return m ? { label: m[1], value: m[2] } : null;
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
  t.check("画面の「7日平均」も 69.75（一桁で 69.8）", h1 && h1.value === "69.8" && /7日平均/.test(h1.label), JSON.stringify(h1));

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
    return line[line.length - 1].value.toFixed(1);
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
    /* 目標の札（.hl-goal）は凡例の外。名前の並びだけを見る。 */
    const items = [...sc.querySelectorAll(".diet-legend .diet-legend-item")];
    return items.length ? items.map((e) => e.textContent).join("").replace(/\s+/g, "") : null;
  });
  await seed([]);
  await show();
  t.check("記録が無ければ凡例も無い", (await legend()) === null);
  await seed(Array.from({ length: 10 }, (_, i) => [10 - i, 70]));
  await page.evaluate(() => KN.store.update((s) => { s.diet.drinks = []; }));
  await show();
  const noBeer = await legend();
  t.check("飲んだ日の無い期間は「飲んだ日」を出さない", noBeer && /食前/.test(noBeer) && !/飲んだ日/.test(noBeer), noBeer);
  await page.evaluate(() => KN.store.addDrink({ day: KN.util.shiftDay(KN.util.todayKey(), -2), time: "20:00",
    kind: "beer", volumeMl: 350, abv: 5, alcoholG: 14, kcal: 140 }));
  await show();
  t.check("飲んだ日があれば「飲んだ日」", /飲んだ日/.test((await legend()) || ""));
  await page.evaluate(() => KN.store.update((s) => { s.diet.drinks = []; }));

  /* ---- H1 見通し：「この傾きなら ◯kg は◯月◯日ごろ」・目標日の下に「その日はおよそ◯kg」 ---- */
  const down = Array.from({ length: 21 }, (_, i) => [20 - i, Math.round((71 - i * 0.05) * 100) / 100]);
  const outlookLine = async () => {
    await show();
    return page.evaluate(() => {
      const el = document.querySelector("#screen-diet .js-day-card .hl-hero.is-kg .is-outlook");
      return el ? el.textContent.trim() : null;
    });
  };
  await seed(down, { targetKg: 68 });
  t.check("下る傾きでも体重のカードに「この傾きなら」は出さない", (await outlookLine()) === null);
  await seed(down, { targetKg: 68 });
  await outlookLine();
  const est = await page.evaluate(async () => {
    KN.screens.diet.openGoalSheet();
    await new Promise((r) => setTimeout(r, 300));
    const el = document.querySelector(".js-td-est"), td = document.querySelector(".js-td");
    const before = el.hidden;
    const day = KN.util.shiftDay(KN.util.todayKey(), 14);
    td.value = day; td.dispatchEvent(new Event("change", { bubbles: true }));
    const want = KN.diet.outlook(KN.diet.weightSummary(30)).kgOn(day);
    const out = { before, text: el.hidden ? null : el.textContent, want: `その日はおよそ ${want.toFixed(1)}kg` };
    td.value = KN.util.shiftDay(KN.util.todayKey(), -3); td.dispatchEvent(new Event("change", { bubbles: true }));
    out.past = el.hidden;
    /* 点検17：説明の文・「例：」の欄の字が無い・kcal・P・F・C は一行に四つ。 */
    const sh = document.querySelector(".sheet.is-open");
    const tops = [".js-kcal", ".js-p", ".js-f", ".js-c"].map((q) => Math.round(sh.querySelector(q).getBoundingClientRect().top));
    out.notes = sh.querySelectorAll(".diet-note").length;
    out.ex = [...sh.querySelectorAll("input")].filter((i) => /例/.test(i.placeholder)).length;
    out.row = new Set(tops).size;
    return out;
  });
  t.check("点検17：目標の紙に説明の文・「例：」が無い・kcal〜C は一行", est.notes === 0 && est.ex === 0 && est.row === 1, JSON.stringify(est));
  t.check("目標日を選ぶと「その日はおよそ◯kg」（選ぶ前・過ぎた日は出さない）",
    est.before && est.text === est.want && est.past, JSON.stringify(est));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  /* ---- 服を引く（2026年11月26日。層 wear と目標の紙の「服の重さ」。量った kg は動かさない） ---- */
  const wearOut = await page.evaluate(async () => {
    const U = KN.util, S = KN.store, D = KN.diet, day = (n) => U.shiftDay(U.todayKey(), -n);
    S.update((s) => { s.diet.weights = []; });
    S.setGoal({ wearUnderG: 100, wearInnerG: 200, wearPajamaG: 500, wearPajamaSummerG: 300 });
    S.addWeight({ day: day(2), time: "07:00", kg: 70, meal: "before", clothed: true, wear: ["under", "pajama"] });
    S.addWeight({ day: day(1), time: "07:00", kg: 70, meal: "after", clothed: true });              // 前からの「着衣あり」
    S.addWeight({ day: day(0), time: "07:00", kg: 70, meal: "before", clothed: false, wear: ["under"] }); // なしなら層は消える
    const pts = D.weightPoints(null, U.todayKey());
    const recs = S.get().diet.weights;
    const summer = D.wearKg({ day: "2026-07-01", clothed: true, wear: ["pajama"] });
    const thin = D.wearKg({ day: "2026-12-01", clothed: true, wear: ["pajamaThin"] });
    const thick = D.wearKg({ day: "2026-07-01", clothed: true, wear: ["pajamaThick"] });
    const noW = (S.setGoal({ wearInnerG: null }), D.wearKg({ day: day(0), clothed: true, wear: ["inner"] }));
    /* 推移の点：食前は白抜き、ほかは塗り。出どころの印（is-health）は無い。 */
    KN.screens.diet.render();
    await new Promise((r) => setTimeout(r, 200));
    const dots = [...document.querySelectorAll("#screen-diet .diet-dot")].map((c) => c.classList.contains("is-before"));
    return { kgs: pts.map((p) => p.kg), measured: pts.map((p) => p.measured), raw: recs.map((w) => w.kg),
      wear: recs.map((w) => w.wear), summer, thin, thick, noW, dots,
      health: document.querySelectorAll("#screen-diet .diet-dot.is-health").length };
  });
  t.check("服を引く：層と重さが分かる日だけ引く（前からの着衣ありは引かない）",
    JSON.stringify(wearOut.kgs) === "[69.4,70,70]" && JSON.stringify(wearOut.measured) === "[70,70,70]", JSON.stringify(wearOut));
  t.check("服を引く：記録の kg は量ったまま・着衣なしなら層は残らない",
    JSON.stringify(wearOut.raw) === "[70,70,70]" && JSON.stringify(wearOut.wear) === '[["under","pajama"],null,null]', JSON.stringify(wearOut));
  t.check("服を引く：前の「パジャマ」は6〜9月が薄・量っていない層は引かない", wearOut.summer === 0.3 && wearOut.noW === null, JSON.stringify(wearOut));
  t.check("服を引く：パジャマ（薄）（厚）は月によらない", wearOut.thin === 0.3 && wearOut.thick === 0.5, JSON.stringify(wearOut));
  t.check("推移の点：食前は白抜き・食後は塗り・出どころの印なし",
    JSON.stringify(wearOut.dots) === "[true,false,true]" && wearOut.health === 0, JSON.stringify(wearOut));

  /* 体重の紙：服装は「なし」と三つの層の札（絵つき）。押すと層が付き、引く重さがラベルの横に出て、保存される。 */
  const sheetOut = await page.evaluate(async () => {
    KN.store.setGoal({ wearInnerG: 200 });
    KN.screens.diet.openWeightSheet(null);
    await new Promise((r) => setTimeout(r, 300));
    const sh = document.querySelector(".sheet.is-open");
    const chips = [...sh.querySelectorAll(".js-wear .wear-tile")];
    const out = { ids: chips.map((c) => c.dataset.id), ico: chips.map((c) => !!c.querySelector("svg")),
      g: chips.map((c) => (c.querySelector(".js-g") || { textContent: "-" }).textContent), fold: !!sh.querySelector(".js-more, .js-rest") };
    /* 量ったとき：食前｜食後。選んだほうをもう一度押すと未記入。 */
    const seg = (id) => sh.querySelector(`.js-meal .seg-btn[data-id="${id}"]`);
    const segOn = () => [...sh.querySelectorAll(".js-meal .seg-btn")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.id).join();
    seg("after").click(); out.meal = [segOn()]; seg("after").click(); out.meal.push(segOn()); seg("before").click(); out.meal.push(segOn());
    sh.querySelector(".js-kg").value = "65.0";
    const press = (id) => sh.querySelector(`.js-wear .wear-tile[data-id="${id}"]`).click();
    press("none"); press("under"); press("inner");
    out.pressed = chips.map((c) => c.getAttribute("aria-pressed"));
    out.off = sh.querySelector(".js-wear-off").textContent.trim();
    sh.querySelector(".js-save").click();
    await new Promise((r) => setTimeout(r, 300));
    const w = KN.store.latestWeight();
    out.saved = { kg: w.kg, clothed: w.clothed, wear: w.wear, meal: w.meal };
    /* パジャマは薄・厚どちらか一つ。前の記録の「パジャマ」は開いたときだけ札に出て、薄・厚を押すと替わる。 */
    KN.store.update((s) => { s.diet.weights.push({ id: "old-pj", day: "2026-01-05", time: "07:00", kg: 66, clothed: true, wear: ["under", "pajama"], memo: "" }); });
    KN.screens.diet.openWeightSheet(KN.store.get().diet.weights.find((x) => x.id === "old-pj"));
    await new Promise((r) => setTimeout(r, 300));
    const s2 = document.querySelectorAll(".sheet.is-open");
    const sh2 = s2[s2.length - 1];
    const ids2 = () => [...sh2.querySelectorAll(".js-wear .wear-tile")].filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.dataset.id);
    out.oldOn = ids2();
    const p2 = (id) => sh2.querySelector(`.js-wear .wear-tile[data-id="${id}"]`).click();
    p2("pajamaThin"); out.thinOn = ids2(); p2("pajamaThick"); out.thickOn = ids2();
    return out;
  });
  t.check("体重の紙：畳まない・服装は 下着・下着（長袖）・パジャマ（薄）（厚）の板（絵と重さ）と「着ていない」",
    !sheetOut.fold && JSON.stringify(sheetOut.ids) === '["under","inner","pajamaThin","pajamaThick","none"]'
      && JSON.stringify(sheetOut.ico) === "[true,true,true,true,false]" && JSON.stringify(sheetOut.g) === '["100g","200g","300g","500g","-"]', JSON.stringify(sheetOut));
  t.check("体重の紙：量ったときは食前｜食後・もう一度押すと未記入", JSON.stringify(sheetOut.meal) === '["after","","before"]' && sheetOut.saved.meal === "before", JSON.stringify(sheetOut));
  t.check("体重の紙：パジャマは一つだけ・前の「パジャマ」は薄・厚に替わる",
    JSON.stringify(sheetOut.oldOn) === '["under","pajama"]' && JSON.stringify(sheetOut.thinOn) === '["under","pajamaThin"]'
      && JSON.stringify(sheetOut.thickOn) === '["under","pajamaThick"]', JSON.stringify(sheetOut));
  t.check("体重の紙：層を押すと「なし」が外れ、引く重さが出て、保存される",
    JSON.stringify(sheetOut.pressed) === '["true","true","false","false","false"]' && sheetOut.off === "−0.3kg"
      && sheetOut.saved.kg === 65 && sheetOut.saved.clothed === true && JSON.stringify(sheetOut.saved.wear) === '["under","inner"]',
    JSON.stringify(sheetOut));
  await page.waitForTimeout(300);

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
