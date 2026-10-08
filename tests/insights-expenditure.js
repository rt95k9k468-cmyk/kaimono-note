/* 記録から逆算した消費（H2、docs/health.md）。

   時計を 2026年9月29日に止め、30日の窓（8月31日〜）で：食事の数がそろった日の
   摂取（朝400・昼600・夜840＝1,840kcal）と、7日平均の傾き（毎日 -0.05kg ＝週 -0.35kg）
   から「1日およそ 2,200kcal 使っている計算」（1,840 + 0.35/7×7,200 = 2,200）。
   体重は 8月18日から（7日平均の助走）。数えない日・出さないときを一つずつ。
   後半は画面：気づいたことに題と炎の絵・絵文字なし。記録は変えない（読むだけ）。 */
const { open, checker } = require("./lib");

const t = checker("insights-expenditure");
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 8, 29, 10, 0)); },
  });

  /* spec.meal(day, i) … その日の { b, l, n, write, noSlot }。null なら書かない。
     write は枠に書く文（既定は朝・昼・夜に「ごはん」）。 */
  const run = (spec) => page.evaluate((spec) => {
    const U = KN.util, S = KN.store, D = KN.diet;
    const mealOf = spec.meal ? new Function("day", "i", spec.meal) : () => ({ b: 400, l: 600, n: 840 });
    S.update((s) => { s.diet.weights = []; s.diet.meals = []; s.diet.drinks = []; s.diet.health = []; });
    let d = "2026-08-18", i = 0;
    while (d <= "2026-09-29") {
      if (!spec.weightFrom || d >= spec.weightFrom) {
        S.addWeight({ day: d, time: "07:00", kg: spec.flat ? 70 : 80 - 0.05 * i });
      }
      if (d >= "2026-08-31") {
        const p = mealOf(d, i);
        if (p) {
          const it = (name, kcal, slot) => ({ name, kcal, slot: p.noSlot ? null : slot, from: "ai", estimated: true });
          const items = [];
          if (p.b) items.push(it("朝", p.b, "breakfast"));
          if (p.l) items.push(it("昼", p.l, "lunch"));
          if (p.n) items.push(it("夜", p.n, "dinner"));
          const write = p.write || { breakfast: "ごはん", lunch: "ごはん", dinner: "ごはん" };
          Object.keys(write).forEach((k) => S.setSlotMemo(d, k, write[k]));
          S.setDayMemo(d, "", items, { kcal: items.reduce((a, x) => a + x.kcal, 0), raw: "x" });
        }
        if (spec.burned && d < "2026-09-29") {
          S.setHealth(d, "restingEnergy", 1500);
          S.setHealth(d, "activeEnergy", 800);
        }
      }
      d = U.shiftDay(d, 1); i++;
    }
    const before = JSON.stringify(S.get().diet);
    const pick = (win) => D.analyze(win).find((f) => f.id === "expenditure") || null;
    const f30 = pick(30), f14 = pick(14), f90 = pick(90);
    return { f30, f14, f90, same: before === JSON.stringify(S.get().diet) };
  }, spec);

  /* ---- そろった記録：出る ---- */
  const base = await run({
    burned: true,
    // 今日は朝だけ書いてある（書きかけ）。数えれば平均が下がる。
    meal: "return day === '2026-09-29' ? { b: 400, write: { breakfast: 'パン' } } : { b: 400, l: 600, n: 840 };",
  });
  const f = base.f30;
  t.check("30日の窓：1日およそ 2,200kcal 使っている計算",
    f && f.value === 2200 && /1日およそ 2,200kcal 使っている計算になります。/.test(f.text), JSON.stringify(f));
  t.check("日数を添える（そろった日・体重の日）",
    f && /食事の数がそろった 29日/.test(f.text) && /体重 30日ぶん/.test(f.text), f && f.text);
  t.check("摂取と傾きの数を出す",
    f && /平均 1日 1,840kcal/.test(f.text) && /7日平均で週 -0\.35kg/.test(f.text), f && f.text);
  t.check("今日の書きかけは数えない（29日・1,840kcal のまま）", f && f.n === 29 && f.intake === 1840);
  t.check("端末の総消費を隣に（同じ期間の日数と平均）",
    f && f.burned === 2300 && /端末の総消費は、同じ期間の 29日の平均で 2,300kcal です。/.test(f.text), f && f.text);
  t.check("色を付けない（tone は info）・前半後半の確かめは無い", f && f.tone === "info" && f.steady === undefined);
  t.check("原因と言わない", f && !/原因|せい|ため、/.test(f.text) && /計算/.test(f.text));
  t.check("14日の窓では出さない（傾きが三週間に満たない）", base.f14 === null, JSON.stringify(base.f14));
  t.check("90日の窓でも同じ期間の話（記録のある期間に寄せる）", base.f90 && base.f90.value === 2200 && base.f90.n === 29,
    JSON.stringify(base.f90));
  t.check("記録を変えない（読むだけ）", base.same);

  /* ---- 端末が無い：総消費の一文を出さない ---- */
  const noDev = await run({});
  t.check("端末の総消費が無ければ、その一文は無い",
    noDev.f30 && noDev.f30.burned === null && !/端末/.test(noDev.f30.text), JSON.stringify(noDev.f30));

  /* ---- 書いた夜に数が無い日（推計のあとに書き足した）：数えない ---- */
  const late = await run({ meal: "return i % 3 === 0 ? { b: 400, l: 600 } : { b: 400, l: 600, n: 840 };" });
  t.check("書いた枠に数の無い日は数えない（値は 2,200 のまま、日数が減る）",
    late.f30 && late.f30.value === 2200 && late.f30.n === 20, JSON.stringify(late.f30));

  /* ---- 夜を書いていない日：数えない ---- */
  const noDinner = await run({
    meal: "return i % 3 === 0 ? { b: 400, l: 600, write: { breakfast: 'パン', lunch: 'そば' } } : { b: 400, l: 600, n: 840 };",
  });
  t.check("夜の無い日は数えない", noDinner.f30 && noDinner.f30.value === 2200 && noDinner.f30.n === 20,
    JSON.stringify(noDinner.f30));

  /* ---- 「なし」と書いた枠：書いていない枠として読む ---- */
  const skip = await run({
    meal: "return { l: 700, n: 1140, write: { breakfast: 'なし', lunch: 'そば', dinner: '定食' } };",
  });
  t.check("朝に「なし」と書いた日も数える", skip.f30 && skip.f30.n === 29 && skip.f30.value === 2200,
    JSON.stringify(skip.f30));

  /* ---- 前の作りの「一日ぶんのメモ」（枠も区分も無い）：数える ---- */
  const legacy = await run({ meal: "return { b: 400, l: 600, n: 840, noSlot: true, write: {} };" });
  t.check("枠も区分も無い日は、数があれば数える", legacy.f30 && legacy.f30.n === 29, JSON.stringify(legacy.f30));

  /* ---- 枠に書いたのに区分が分からない：確かめられないので数えない ---- */
  const unsorted = await run({ meal: "return { b: 400, l: 600, n: 840, noSlot: true };" });
  t.check("書いた枠の区分が分からない日は数えない（出さない）", unsorted.f30 === null, JSON.stringify(unsorted.f30));

  /* ---- 出さないとき ---- */
  const few = await run({ meal: "return day >= '2026-09-16' ? { b: 400, l: 600, n: 840 } : null;" });
  t.check("そろった日が14日に満たない：出さない", few.f30 === null, JSON.stringify(few.f30));

  const ends = await run({ meal: "return (day <= '2026-09-06' || day >= '2026-09-22') ? { b: 400, l: 600, n: 840 } : null;" });
  t.check("そろった日が期間の半分に満たない：出さない", ends.f30 === null, JSON.stringify(ends.f30));

  const shortW = await run({ weightFrom: "2026-09-12" });
  t.check("体重の傾きが三週間に満たない：出さない", shortW.f30 === null, JSON.stringify(shortW.f30));

  const low = await run({ flat: true, meal: "return { b: 100, l: 200, n: 300 };" });
  t.check("1,000kcal を下回る計算は出さない", low.f30 === null, JSON.stringify(low.f30));

  /* ---- 画面 ---- */
  await run({ burned: true });
  await page.evaluate(() => KN.store.update((s) => { s.settings.showInsight = true; }));
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForFunction(() => document.querySelector(".diet-findings"), null, { timeout: 5000 }).catch(() => {});
  const ui = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".diet-finding")]
      .find((el) => (el.querySelector("b") || {}).textContent === "記録から逆算した消費");
    return row ? { text: row.innerText, ico: (row.querySelector("[data-ico]") || {}).dataset.ico || "" } : null;
  });
  t.check("気づいたことに出る（題と一文）", ui && /1日およそ 2,200kcal 使っている計算になります/.test(ui.text), JSON.stringify(ui));
  t.check("絵は炎", ui && ui.ico === "flame", ui && ui.ico);
  t.check("絵文字なし", ui && !EMOJI.test(ui.text));
  t.check("ページのエラーなし", errors.length === 0, errors.join("\n"));

  await browser.close();
  t.done();
})();
