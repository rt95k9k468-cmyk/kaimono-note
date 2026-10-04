/* 気づいたことに「前半と後半」の確かめ（docs/roadmap.md の R13）。

   時計を 2026年9月29日に止め、30日の窓（8月31日〜、後半は 9月15日から）で：
   前半・後半とも同じ向きなら今までどおり言う（休日・食後）／向きが逆なら数は
   残して「傾向とまでは言えません」／片方に記録が無ければ「確かめられない」／
   差の小さい項目には何も足さない。後半は画面：ダイエットの「気づいたこと」に
   その一文が出る・絵文字なし。記録の形は変えない（weights の欄が同じ）。 */
const { open, checker } = require("./lib");

const t = checker("insights-halves");
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 8, 29, 10, 0)); },
  });

  /* days: 8月24日〜9月29日の毎日。kgOf(day, i) で体重、metaOf で量る条件。 */
  const run = (spec) => page.evaluate((spec) => {
    const U = KN.util, S = KN.store;
    const kgOf = new Function("day", "dow", "late", spec.kg);
    const metaOf = spec.meta ? new Function("day", "i", "late", spec.meta) : () => ({});
    S.update((s) => { s.diet.weights = []; s.diet.meals = []; s.diet.drinks = []; s.diet.health = []; });
    let d = "2026-08-24", i = 0;
    while (d <= "2026-09-29") {
      const late = d >= "2026-09-15";
      S.addWeight({ day: d, time: "07:00", kg: kgOf(d, U.dayOfWeek(d), late), ...metaOf(d, i, late) });
      d = U.shiftDay(d, 1); i++;
    }
    const found = KN.diet.analyze(30);
    return {
      found: found.map((f) => ({ id: f.id, text: f.text, steady: f.steady })),
      keys: Object.keys(S.get().diet.weights[0]).sort(),
    };
  }, spec);
  const pick = (r, id) => r.found.find((f) => f.id === id);

  /* ---- 休日：前半も後半も重い → 言う ---- */
  const wkSame = await run({ kg: "return 70 + ((dow === 0 || dow === 6) ? 1 : 0);" });
  const ws = pick(wkSame, "weekend");
  t.check("休日がどちらの半分でも重い：数を言い、但し書きなし",
    ws && ws.steady === true && /休日は平日より平均 \+/.test(ws.text) && !/言えません/.test(ws.text),
    JSON.stringify(ws));

  /* ---- 休日：前半は重く、後半は軽い → 言わない ---- */
  const wkFlip = await run({ kg: "return 70 + ((dow === 0 || dow === 6) ? (late ? -0.5 : 1.2) : 0);" });
  const wf = pick(wkFlip, "weekend");
  t.check("休日の向きが前半と後半で逆：数は残し「向きがそろわない」",
    wf && wf.steady === false && /休日は平日より平均/.test(wf.text)
      && /前半と後半に分けると向きがそろわない/.test(wf.text),
    JSON.stringify(wf));

  /* ---- 食後：どちらでも重い → 量り方の差と言う ---- */
  const mSame = await run({
    kg: "return 70 + (Number(day.slice(8)) % 2 ? 0.8 : 0);",
    meta: "return { meal: Number(day.slice(8)) % 2 ? 'after' : 'before' };",
  });
  const ms = pick(mSame, "meal");
  t.check("食後がどちらの半分でも重い：「量り方の差として読めます」",
    ms && ms.steady === true && /量り方の差として読めます/.test(ms.text), JSON.stringify(ms));

  /* ---- 食後：後半は軽い → 言わない ---- */
  const mFlip = await run({
    kg: "return 70 + (Number(day.slice(8)) % 2 ? (late ? -0.4 : 0.9) : 0);",
    meta: "return { meal: Number(day.slice(8)) % 2 ? 'after' : 'before' };",
  });
  const mf = pick(mFlip, "meal");
  t.check("食後の向きが逆：「量り方の差」とは言わず、向きがそろわないと言う",
    mf && mf.steady === false && !/量り方の差として読めます/.test(mf.text) && /向きがそろわない/.test(mf.text),
    JSON.stringify(mf));

  /* ---- 食後の記録が後半にしか無い → 確かめられない ---- */
  const mShort = await run({
    kg: "return 70 + (late && Number(day.slice(8)) % 2 ? 0.8 : 0);",
    meta: "return { meal: late && Number(day.slice(8)) % 2 ? 'after' : 'before' };",
  });
  const mh = pick(mShort, "meal");
  t.check("片方の半分に食後が無い：「確かめられない」",
    mh && mh.steady === false && /確かめられない/.test(mh.text), JSON.stringify(mh));

  /* ---- 差が小さい項目には何も足さない ---- */
  const flat = await run({
    kg: "return 70;",
    meta: "return { meal: Number(day.slice(8)) % 2 ? 'after' : 'before' };",
  });
  const fm = pick(flat, "meal"), fw = pick(flat, "weekend");
  t.check("差の無い項目は「目立った差はありません」だけ（steady は null）",
    fm && fm.steady === null && !/前半と後半/.test(fm.text)
      && fw && fw.steady === null && !/前半と後半/.test(fw.text),
    JSON.stringify([fm, fw]));

  t.check("記録の形は変わらない（体重の欄）",
    JSON.stringify(flat.keys) === JSON.stringify(wkSame.keys) && !flat.keys.includes("steady"),
    JSON.stringify(flat.keys));

  /* ---- 画面 ---- */
  await run({ kg: "return 70 + ((dow === 0 || dow === 6) ? (late ? -0.5 : 1.2) : 0);" });
  // 「気づいたこと」は設定で出すと決めた人にだけ出る（settings.showInsight）
  await page.evaluate(() => KN.store.update((s) => { s.settings.showInsight = true; }));
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(600);
  const ui = await page.evaluate(() => {
    const scr = document.querySelector(".diet-findings");
    return scr ? scr.innerText : "";
  });
  t.check("ダイエットの「気づいたこと」に、向きがそろわない一文が出る",
    /休日は平日より平均/.test(ui) && /前半と後半に分けると向きがそろわない/.test(ui), ui.slice(0, 300));
  t.check("絵文字なし", ui && !EMOJI.test(ui));
  t.check("ページのエラーなし", errors.length === 0, errors.join("\n"));

  await browser.close();
  t.done();
})();
