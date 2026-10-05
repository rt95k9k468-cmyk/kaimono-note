/* からだは一枚（2026年10月5日。V24 の「今日・記録・推移」の区画はやめた）。docs/health.md の末の節。

   - 区画の帯（.seg）は無い。今日（からだの輪）・記録（食事）・推移（体重の数とグラフ）が同じ紙に、この順で
   - 三つはそれぞれ丸角のカード（地と色が違い、角が丸い）
   - グラフの「並べて」の札は無い。グラフは幅いっぱい
   - AI推計の枠は暗くない（地が明るい）。分析の文はその枠の中、コピー・貼り付けと一緒
   - 「お酒を足すと」・PFC の数・熱量比は出さない
   - 輪の枠の地は灰ではなく、それぞれの指標の色をごく薄く（四つとも別の色・明るい・くり抜きも同じ色）。
     「飲みたくなった」は淡いクリーム

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diet-panes.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("diet-panes");
  const { browser, page, errors } = await open();

  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    [6, 4, 2, 0].forEach((n, i) => S.addWeight({ day: U.shiftDay(today, -n), kg: 68 - i * 0.3 }));
    S.addDrink({ day: today, time: "19:00", kind: "beer", name: "ビール", ml: 350, count: 1, abv: 5, volumeMl: 350, alcoholG: 14 });
    S.addMeal({ day: today, time: "12:00", slot: "memo", memo: "試験", items: [{ name: "試験" }],
      ai: { kcal: 1800, p: 90, f: 70, c: 190, fiber: 12, raw: "r", analysis: "試験の分析の文" } });
    KN.app.showScreen("diet");
  });
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const day = document.querySelector("#screen-diet .js-day-card");
    const box = (sel) => {
      const e = day.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { top: b.top, w: b.width, h: b.height, radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor };
    };
    const lum = (c) => {
      const x = document.createElement("canvas").getContext("2d");
      x.fillStyle = c; x.fillRect(0, 0, 1, 1);
      const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
      return (r + g + b) / 3;
    };
    const memo = day.querySelector(".diet-memo");
    return {
      seg: !!document.querySelector("#screen-diet .diet-panes, #screen-diet .js-pane"),
      today: box(".diet-card.is-body"), meal: box(".diet-card.is-meal"), trend: box(".diet-card.is-trend"),
      sheetBg: getComputedStyle(day).backgroundColor,
      inToday: !!day.querySelector(".diet-card.is-body .diet-ring") && !day.querySelector(".diet-card.is-body .diet-hero-top"),
      weightInTrend: !!day.querySelector(".diet-card.is-trend .diet-hero-top"),
      cells: [...day.querySelectorAll(".diet-cell")].map((c) => {
        const ring = c.querySelector(".diet-ring");
        return { bg: getComputedStyle(c).backgroundColor, lum: lum(getComputedStyle(c).backgroundColor),
                 hole: ring ? getComputedStyle(ring, "::after").backgroundColor : "" };
      }),
      urge: (() => { const b = day.querySelector(".js-urge"); if (!b) return null;
        const x = document.createElement("canvas").getContext("2d");
        x.fillStyle = getComputedStyle(b).backgroundColor; x.fillRect(0, 0, 1, 1);
        const [r, g, bl] = x.getImageData(0, 0, 1, 1).data; return { r, g, b: bl }; })(),
      inTrend: !!day.querySelector(".diet-card.is-trend .diet-chart"),
      withCol: !!day.querySelector(".diet-with, .js-series"),
      chartW: (day.querySelector(".diet-chart") || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width,
      trendInner: day.querySelector(".diet-card.is-trend").clientWidth,
      memoLum: memo ? lum(getComputedStyle(memo).backgroundColor) : 0,
      noteIn: !!(memo && memo.querySelector(".diet-ai-note") && memo.querySelector(".js-ai-paste")),
      text: day.textContent,
    };
  });
  t.check("区画の帯は無い", !r.seg);
  t.check("今日・記録・推移が上から順に", r.today && r.meal && r.trend && r.today.top < r.meal.top && r.meal.top < r.trend.top, JSON.stringify([r.today, r.meal, r.trend]));
  t.check("三つとも丸角", [r.today, r.meal, r.trend].every((x) => x && x.radius >= 12), JSON.stringify([r.today, r.meal, r.trend]));
  t.check("カードの地は紙の地と違う（境目が見える）", [r.today, r.meal, r.trend].every((x) => x.bg !== r.sheetBg), r.sheetBg + " " + r.today.bg);
  t.check("今日のカードに輪、推移のカードに体重の数とグラフ", r.inToday && r.weightInTrend && r.inTrend);
  t.check("輪の枠は四つとも別の色で明るい", r.cells.length === 4 && new Set(r.cells.map((c) => c.bg)).size === 4 && r.cells.every((c) => c.lum > 225), JSON.stringify(r.cells));
  t.check("輪のくり抜きは枠と同じ色", r.cells.every((c) => c.hole === c.bg), JSON.stringify(r.cells));
  t.check("「飲みたくなった」は淡いクリーム（明るく、赤・緑が青より強い）", r.urge && r.urge.b > 220 && r.urge.r > r.urge.b && r.urge.g > r.urge.b, JSON.stringify(r.urge));
  t.check("「並べて」の札なし・グラフは幅いっぱい", !r.withCol && r.chartW > r.trendInner - 40, `${r.chartW} / ${r.trendInner}`);
  t.check("AI推計の地は明るい", r.memoLum > 235, String(r.memoLum));
  t.check("分析の文はAI推計の枠の中", r.noteIn);
  t.check("お酒を足した合計・PFC・熱量比は出さない", !/お酒を足すと|熱量比|繊維/.test(r.text) && !r.text.includes("diet-pfc"));
  t.check("評価の言葉・絵文字なし", !/\p{Extended_Pictographic}/u.test(r.text));

  t.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
