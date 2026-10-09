/* 気づいたことの「曜日の揺れ」（docs/roadmap-3.1.md の J1）。

   時計を 2026年10月9日（金）に止め、直近12週（7月18日〜、後半は 8月29日から）で：
   重い曜日と軽い曜日を7日平均からのずれで言う（減っている途中でも曜日を取り違えない）／
   朝の一回だけを見る／窓（14日）に関わらず12週で見る／差が小さい・向きがそろわない・
   どこかの曜日が3件未満なら何も出さない。画面に一文が出る・絵文字なし。記録の形は変えない。 */
const { open, checker } = require("./lib");

const t = checker("insights-weekday");
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 9, 9, 10, 0)); },
  });

  /* 7月1日〜10月9日の毎朝。kg が null の日は量らない。evening があれば夜にもう一回。 */
  const run = (spec) => page.evaluate((spec) => {
    const U = KN.util, S = KN.store;
    const kgOf = new Function("day", "dow", "late", "i", spec.kg);
    const eveOf = spec.evening ? new Function("day", "dow", spec.evening) : () => null;
    S.update((s) => { s.diet.weights = []; s.diet.meals = []; s.diet.drinks = []; s.diet.health = []; });
    let d = spec.from || "2026-07-01", i = 0;
    while (d <= "2026-10-09") {
      const dow = U.dayOfWeek(d);
      const kg = kgOf(d, dow, d >= "2026-08-29", i);
      if (kg != null) S.addWeight({ day: d, time: "07:00", kg });
      const eve = eveOf(d, dow);
      if (eve != null) S.addWeight({ day: d, time: "21:00", kg: eve });
      d = U.shiftDay(d, 1); i++;
    }
    const before = JSON.stringify(S.get().diet);
    const found = KN.diet.analyze(spec.win || 30);
    const f = found.find((x) => x.id === "weekday");
    return {
      f: f ? { text: f.text, steady: f.steady, n: f.n } : null,
      same: JSON.stringify(S.get().diet) === before,
      keys: Object.keys(S.get().diet.weights[0]).sort(),
    };
  }, spec);

  /* 月曜 +0.4・金曜 −0.2、全体は1日0.05kgずつ減る。金曜の夜だけ +2kg（朝でないので数えない）。 */
  const BASE = "return 75 - 0.05 * i + (dow === 1 ? 0.4 : dow === 5 ? -0.2 : 0);";
  const ok = await run({ kg: BASE, evening: "return dow === 5 ? 80 : null;" });
  t.check("月曜が重く金曜が軽い：差と日数を一行で言う",
    ok.f && /^月曜の朝は、金曜より 0\.6kg ほど重く出ます（直近12週の 84日）。$/.test(ok.f.text) && ok.f.steady === true,
    JSON.stringify(ok.f));
  t.check("原因（食べ・お酒）は言わない", ok.f && !/食|酒|せい|ため/.test(ok.f.text), ok.f && ok.f.text);
  t.check("読むだけ：記録は変わらない", ok.same);

  const w14 = await run({ kg: BASE, win: 14 });
  t.check("窓が14日でも12週で見る", w14.f && /直近12週の 84日/.test(w14.f.text), JSON.stringify(w14.f));

  const decline = await run({ kg: "return 80 - 0.1 * i;" });
  t.check("減っているだけ（曜日の差なし）：何も出さない", decline.f === null, JSON.stringify(decline.f));

  const small = await run({ kg: "return 70 + (dow === 1 ? 0.1 : dow === 5 ? -0.05 : 0);" });
  t.check("差が 0.2kg 未満：何も出さない", small.f === null, JSON.stringify(small.f));

  const flip = await run({ kg: "return 70 + (dow === 6 ? (late ? -0.4 : 1.0) : dow === 3 ? -0.1 : 0);" });
  t.check("前半と後半で向きが逆：何も出さない", flip.f === null, JSON.stringify(flip.f));

  const few = await run({ kg: BASE, from: "2026-09-27" });
  t.check("どの曜日も3件に届かない：何も出さない", few.f === null, JSON.stringify(few.f));

  const noSun = await run({ kg: "return dow === 0 ? null : " + BASE.slice(7) });
  t.check("日曜を一度も量っていない：何も出さない", noSun.f === null, JSON.stringify(noSun.f));

  t.check("記録の形は変わらない（体重の欄）",
    JSON.stringify(ok.keys) === JSON.stringify(decline.keys) && !ok.keys.includes("steady"),
    JSON.stringify(ok.keys));

  /* ---- 画面 ---- */
  await run({ kg: BASE });
  await page.evaluate(() => KN.store.update((s) => { s.settings.showInsight = true; }));
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(600);
  const ui = await page.evaluate(() => {
    const scr = document.querySelector(".diet-findings");
    return scr ? scr.innerText : "";
  });
  t.check("ダイエットの「気づいたこと」に「曜日の揺れ」が出る",
    /曜日の揺れ/.test(ui) && /月曜の朝は、金曜より/.test(ui), ui.slice(0, 400));
  t.check("絵文字なし", ui && !EMOJI.test(ui));
  t.check("ページのエラーなし", errors.length === 0, errors.join("\n"));

  await browser.close();
  t.done();
})();
