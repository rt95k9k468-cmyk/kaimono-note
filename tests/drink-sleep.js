/* 気づいたことの「飲んだ晩の睡眠」（docs/health.md）。

   時計を 2026年9月29日に止め、30日の窓（8月31日〜）で。前半と後半の境は 9月15日。
   睡眠は起きた日に付くので、d の日に飲んだ晩は d+1 の睡眠と組む。
   基本の形：日付が 3 の倍数の日に飲む（窓の中の飲んだ晩は 10回、そうでない晩は 20回）。
   後半は画面：絵は bed・絵文字なし・警告の色なし。記録は変えない（読むだけ）。 */
const { open, checker } = require("./lib");

const t = checker("drink-sleep");
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 8, 29, 10, 0)); },
  });

  /* spec.drink(day, late) … その日に飲んだか。late は 9月15日以降。
     spec.sleep(wake, drank, late) … 起きた日の睡眠（分）。drank は前の晩に飲んだか。
     spec.stage(wake, drank, late) … 型 { deep, rem, provisional? }。無ければ型を書かない。
     spec.weights … 毎日 70kg を書く。 */
  const run = (spec) => page.evaluate((spec) => {
    const U = KN.util, S = KN.store, D = KN.diet;
    const fn = (src) => (src ? new Function("a", "b", "c", src) : null);
    const drinkOf = fn(spec.drink) || ((day) => Number(day.slice(8)) % 3 === 0);
    const sleepOf = fn(spec.sleep);
    const stageOf = fn(spec.stage);
    S.update((s) => {
      s.diet.weights = []; s.diet.meals = []; s.diet.drinks = []; s.diet.health = [];
      s.archive.days = [];
    });
    const LATE = "2026-09-15";
    for (let d = "2026-08-24"; d <= "2026-09-29"; d = U.shiftDay(d, 1)) {
      if (drinkOf(d, d >= LATE)) {
        S.addDrink({ day: d, time: "20:00", kind: "beer", volumeMl: 500, abv: 5, alcoholG: 20, kcal: 200 });
      }
    }
    for (let d = "2026-08-24"; d <= "2026-09-29"; d = U.shiftDay(d, 1)) {
      const drank = !!S.drinkTotals(U.shiftDay(d, -1));
      const late = d >= LATE;
      const m = sleepOf(d, drank, late);
      S.setHealth(d, "sleep", m);
      const stg = stageOf && stageOf(d, drank, late);
      if (stg) {
        S.setDayLog(d, {
          wake: "07:00",
          sleepStages: {
            core: 200, awake: 20, asleepMin: m, inBedMin: m + 20,
            bedDay: U.shiftDay(d, -1), bedTime: "23:30", wakeTime: "07:00",
            endAt: new Date().toISOString(), provisional: false, ...stg,
          },
        }, { source: "health" });
      }
      if (spec.weights) S.addWeight({ day: d, time: "07:00", kg: 70 });
    }
    const before = JSON.stringify(S.get());
    const found = D.analyze(30);
    const same = before === JSON.stringify(S.get());
    return {
      f: found.find((x) => x.id === "drink-sleep") || null,
      ids: found.map((x) => x.id),
      same,
    };
  }, spec);

  /* ---- A：どちらの半分でも短い・型もある ---- */
  const SLEEP_A = "return b ? 380 : 420;";
  const STAGE_A = "return { deep: 50, rem: b ? 60 : 85 };";
  const a = await run({ sleep: SLEEP_A, stage: STAGE_A });
  const f = a.f;
  t.check("飲んだ晩は平均 -40分（d に飲んだ晩 ＝ d+1 の睡眠）", f && f.value === -40, JSON.stringify(f));
  t.check("回数を添える（飲んだ晩 10回 / そうでない晩 20回）",
    f && /睡眠が平均 -40分/.test(f.text) && /飲んだ晩 10回 \/ そうでない晩 20回/.test(f.text), f && f.text);
  t.check("純アルコールの平均", f && /純アルコール 平均20g/.test(f.text), f && f.text);
  t.check("型の分かる晩：レムの差", f && /レム -25分/.test(f.text), f && f.text);
  t.check("言い切っても原因とは言わない", f && f.steady === true && /飲酒が原因だとは言えません/.test(f.text)
    && !/傾向とまでは言えません/.test(f.text), f && f.text);
  t.check("色を付けない（tone は info）・n は 30", f && f.tone === "info" && f.n === 30, f && `${f.tone} ${f.n}`);
  t.check("記録を変えない（読むだけ）", a.same);

  /* ---- B：組み方（同じ日の睡眠と組めば -40、翌日と組めば +） ---- */
  const b = await run({ sleep: "return Number(a.slice(8)) % 3 === 0 ? 380 : 420;" });
  t.check("飲んだ日の当日ではなく、翌日に起きた睡眠と組む", b.f && b.f.value > 0, JSON.stringify(b.f));

  /* ---- C：前半と後半で向きが逆 ---- */
  const c = await run({ sleep: "return b ? (c ? 460 : 340) : 420;" });
  t.check("向きが逆なら数は残して「向きがそろわない」", c.f && c.f.steady === false
    && /平均 -20分/.test(c.f.text) && /前半と後半に分けると向きがそろわない/.test(c.f.text), c.f && c.f.text);
  t.check("型の無い晩ばかりなら型の一文は無い", c.f && !/型の分かる晩/.test(c.f.text));

  /* ---- D：飲んだ晩が後半だけ ---- */
  const dd = await run({ drink: "return b && Number(a.slice(8)) % 3 === 0;", sleep: SLEEP_A });
  t.check("片方の半分に飲んだ晩が無ければ「確かめられない」", dd.f && dd.f.steady === false
    && /確かめられない/.test(dd.f.text), dd.f && dd.f.text);

  /* ---- E：差が無い ---- */
  const e = await run({ sleep: "return 420;", stage: "return { deep: 50, rem: 80 };" });
  t.check("差が無ければ「目立った差はありません」（steady は null）", e.f && e.f.steady === null
    && /睡眠の長さに目立った差はありません/.test(e.f.text)
    && /深い睡眠とレムに目立った差はありません/.test(e.f.text), e.f && e.f.text);
  t.check("差が無いときは前半後半も原因も言わない", e.f && !/前半と後半|原因/.test(e.f.text));

  /* ---- F：飲んだ晩が少ない ---- */
  const few = await run({ drink: "return a === '2026-09-10' || a === '2026-09-20';", sleep: SLEEP_A });
  t.check("片側3晩未満は出さない", few.f === null, JSON.stringify(few.f));

  /* ---- G：寝ている途中に取った晩（今日だけ見る） ---- */
  const g = await run({ sleep: SLEEP_A,
    stage: "return { deep: 50, rem: b ? 60 : 85, provisional: a === '2026-09-29' };" });
  t.check("今日起きた晩を寝ている途中に取ったなら数えない", g.f && /そうでない晩 19回/.test(g.f.text) && g.f.n === 29,
    g.f && `${g.f.n} ${g.f.text}`);
  const g2 = await run({ sleep: SLEEP_A,
    stage: "return { deep: 50, rem: b ? 60 : 85, provisional: a === '2026-09-28' };" });
  t.check("前の日に残った印では落とさない（取り込みは同じ晩を書き直さない）",
    g2.f && /飲んだ晩 10回/.test(g2.f.text) && g2.f.n === 30, g2.f && `${g2.f.n} ${g2.f.text}`);

  /* ---- H：型だけの差も前半後半で確かめる ---- */
  const h = await run({ sleep: "return 420;", stage: "return { deep: 50, rem: b ? (c ? 95 : 35) : 80 };" });
  t.check("型だけの差も、向きがそろわなければ言い切らない", h.f && h.f.steady === false
    && /睡眠の長さに目立った差はありません/.test(h.f.text) && /レム -15分/.test(h.f.text)
    && /向きがそろわない/.test(h.f.text), h.f && h.f.text);

  /* ---- I：並び ---- */
  const i = await run({ sleep: SLEEP_A, stage: STAGE_A, weights: true });
  t.check("「飲んだ翌日の体重」のすぐ下", i.ids.includes("drink")
    && i.ids.indexOf("drink-sleep") === i.ids.indexOf("drink") + 1, i.ids.join(","));

  /* ---- 画面 ---- */
  await run({ sleep: SLEEP_A, stage: STAGE_A });
  await page.evaluate(() => KN.store.update((s) => { s.settings.showInsight = true; }));
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForFunction(() => document.querySelector(".diet-findings"), null, { timeout: 5000 }).catch(() => {});
  const ui = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".diet-finding")]
      .find((el) => (el.querySelector("b") || {}).textContent === "飲んだ晩の睡眠");
    return row ? {
      text: row.innerText,
      ico: (row.querySelector("[data-ico]") || {}).dataset.ico || "",
      warn: row.classList.contains("is-warn"),
    } : null;
  });
  t.check("気づいたことに出る（題と一文）", ui && /睡眠が平均 -40分/.test(ui.text), JSON.stringify(ui));
  t.check("絵は bed", ui && ui.ico === "bed", ui && ui.ico);
  t.check("警告の色なし", ui && !ui.warn);
  t.check("絵文字なし", ui && !EMOJI.test(ui.text));
  t.check("ページのエラーなし", errors.length === 0, errors.join("\n"));

  await browser.close();
  t.done();
})();
