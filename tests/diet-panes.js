/* からだの形（R4・2026年11月11日。docs/redesign.md 6節）。

   - 区画の帯（.seg）は無い。上から 四つの札 → 体重と食事（横に二つ）→ 今日の食事 → 飲みたくなった → 体重の推移
   - どれもカード（角が丸く、地が紙と違う）。輪は無い
   - 四つの札：歩数・総消費・睡眠・飲酒。名前は四つの別の色、値は太い丸い字で札からはみ出さない、下に7日ぶんの棒
     （その日だけ濃く、前の六日は薄い）
   - 体重は 36px の数と「7日平均・傾き」、食事は合計と入れた枠の色の帯。押すとそれぞれの紙
   - 今日の食事の行は 60px（--row-h-card）で、左に 46px の枠の色の台。AI推計のひと言と二つのボタンはカードの底
   - 「飲みたくなった」は山吹の淡い塗り。目標は藍の点線
   - 「お酒を足すと」・PFC の数・熱量比は出さない。絵文字なし
   - iPad 縦（820px）は二段：左に体重・食事と今日の食事、右に推移と飲みたくなった。体重の下は詰まる（隣の推移に引っぱられない）
   - 広い幅（1440px＝中身 1184px）は札の下に三段：体重・食事・飲みたくなった｜今日の食事｜推移

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diet-panes.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("diet-panes");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 10, 11, 21, 0)); },
  });

  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey(), ago = (n) => U.shiftDay(today, -n);
    for (let i = 20; i >= 0; i--) S.addWeight({ day: ago(i), kg: 68 - i * 0.05 + (i % 3) * 0.2 });
    for (let i = 6; i >= 0; i--) {
      S.setHealth(ago(i), "steps", 12000 + i * 900);   // 五桁の歩数でも札からはみ出さない
      S.setHealth(ago(i), "activeEnergy", 500);
      S.setHealth(ago(i), "restingEnergy", 1500);
      S.setHealth(ago(i), "sleep", 380);
    }
    S.setGoal({ targetKg: 67.2 });
    S.addDrink({ day: today, time: "19:00", kind: "beer", name: "ビール", ml: 350, count: 1, abv: 5, volumeMl: 350, alcoholG: 14 });
    S.setSlotMemo(today, "breakfast", "パン");
    S.addMeal({ day: today, time: "07:30", slot: "breakfast", items: [{ name: "パン", kcal: 400 }] });
    S.addMeal({ day: today, time: "12:00", slot: "memo", memo: "試験", items: [{ name: "試験" }],
      ai: { kcal: 1800, p: 90, f: 70, c: 190, fiber: 12, raw: "r", analysis: "試験の分析の文" } });
    KN.app.showScreen("diet");
  });
  await page.waitForTimeout(700);

  const read = () => page.evaluate(() => {
    const day = document.querySelector("#screen-diet .js-day-card");
    const box = (e) => {
      if (!e) return null;
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width),
               h: Math.round(b.height), radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor };
    };
    const rgb = (c) => {
      const x = document.createElement("canvas").getContext("2d");
      x.fillStyle = c; x.fillRect(0, 0, 1, 1);
      const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
      return { r, g, b };
    };
    const q = (s) => day.querySelector(s);
    const memo = q(".diet-memo");
    return {
      seg: !!document.querySelector("#screen-diet .diet-panes, #screen-diet .js-pane"),
      ring: !!document.querySelector("#screen-diet .diet-ring"),
      body: box(q(".hl-body")), kg: box(q(".hl-hero.is-kg")), kcal: box(q(".hl-hero.is-kcal")),
      list: box(q(".hl-list")), meals: box(q(".hl-meals")), urge: box(q(".hl-urge")), wk: box(q(".hl-drink-week")), chart: box(q(".hl-chart")),
      sheetBg: getComputedStyle(day.closest(".tl-sheet")).backgroundColor,
      mets: [...day.querySelectorAll(".hl-met")].map((m) => {
        const v = m.querySelector(".hl-met-v"), bars = [...m.querySelectorAll(".hl-bars i")];
        return { type: m.dataset.type, card: m.classList.contains("card"), ink: getComputedStyle(m.querySelector(".hl-met-h")).color,
                 fs: parseFloat(getComputedStyle(v).fontSize), fw: getComputedStyle(v).fontWeight, over: v.scrollWidth - v.clientWidth,
                 bars: bars.length, now: bars.length ? Number(getComputedStyle(bars[6]).opacity) : 0,
                 past: bars.slice(0, 6).filter((b) => !b.classList.contains("is-none")).map((b) => Number(getComputedStyle(b).opacity)) };
      }),
      kgFs: parseFloat(getComputedStyle(q(".hl-hero.is-kg .hl-hero-v")).fontSize),
      kgText: q(".hl-hero.is-kg").textContent.replace(/\s+/g, " "),
      stack: [...day.querySelectorAll(".hl-hero.is-kcal .hl-stack-fill > i")].map((i) => i.className),
      rows: [...day.querySelectorAll(".diet-slot-view")].map((r) => ({ h: Math.round(r.getBoundingClientRect().height),
        tile: Math.round(r.querySelector(".diet-slot-ico").getBoundingClientRect().width) })),
      urgeBg: q(".js-urge") ? rgb(getComputedStyle(q(".js-urge")).backgroundColor) : null,
      goalDash: q(".diet-goal-line") ? getComputedStyle(q(".diet-goal-line")).strokeDasharray : "",
      goalInk: q(".hl-goal") ? getComputedStyle(q(".hl-goal")).color : "",
      aiInk: q(".diet-goal-line") ? getComputedStyle(q(".diet-goal-line")).stroke : "",
      chartW: (q(".diet-chart") || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width,
      chartInner: q(".hl-chart").clientWidth,
      noteIn: !!(memo && memo.querySelector(".diet-ai-note") && memo.querySelector(".js-ai-paste") && memo.closest(".hl-list")),
      aiOpen: !!q(".hl-meals .hl-list .js-ai-open"),
      text: day.textContent,
    };
  });

  /* ---- 電話（390px） ---- */
  const r = await read();
  t.check("区画の帯も輪も無い", !r.seg && !r.ring);
  t.check("上から 札 → 体重と食事 → 今日の食事 → 飲みたくなった → 推移",
    r.body.b <= r.kg.t && r.kg.t === r.kcal.t && r.kg.r < r.kcal.l && r.kg.b <= r.meals.t && r.meals.b <= r.urge.t && r.urge.b <= r.chart.t,
    JSON.stringify([r.body, r.kg, r.kcal, r.meals, r.urge, r.chart].map((x) => x && [x.l, x.t, x.r, x.b])));
  t.check("どれも丸角のカードで、地は紙と違う", [r.kg, r.kcal, r.list, r.chart].every((x) => x.radius >= 12 && x.bg !== r.sheetBg),
    r.sheetBg + " " + JSON.stringify([r.kg, r.list, r.chart].map((x) => [x.radius, x.bg])));
  t.check("四つの札：歩数・総消費・睡眠・飲酒、名前は四つの別の色", r.mets.map((m) => m.type).join() === "steps,burned,sleep,drink"
    && r.mets.every((m) => m.card) && new Set(r.mets.map((m) => m.ink)).size === 4, JSON.stringify(r.mets.map((m) => [m.type, m.ink])));
  t.check("値は太い字（17px 以上）で札からはみ出さない（五桁の歩数も）",
    r.mets.every((m) => m.fs >= 17 && Number(m.fw) >= 700 && m.over <= 1), JSON.stringify(r.mets.map((m) => [m.fs, m.fw, m.over])));
  t.check("7日ぶんの棒：その日だけ濃く、前の日は薄い",
    r.mets.every((m) => m.bars === 7 && m.now === 1 && m.past.every((o) => o < 0.5)), JSON.stringify(r.mets.map((m) => [m.bars, m.now, m.past])));
  t.check("体重は 36px の数と「7日平均・傾き」", r.kgFs >= 35 && /7日平均 \d+\.\d・[+−-]?\d+\.\d \/週/.test(r.kgText), `${r.kgFs} ${r.kgText}`);
  t.check("食事のカードに入れた枠の色の帯", r.stack.length >= 1 && r.stack.every((c) => /is-(breakfast|lunch|dinner|snack|other|drink)/.test(c)), JSON.stringify(r.stack));
  t.check("今日の食事の行は 60px・左に 46px の台", r.rows.length === 4 && r.rows.every((x) => x.h >= 60 && x.tile === 46), JSON.stringify(r.rows));
  t.check("「飲みたくなった」は山吹の淡い塗り（明るく、赤・緑が青より強い）",
    r.urgeBg && r.urgeBg.b > 190 && r.urgeBg.r > r.urgeBg.b && r.urgeBg.g > r.urgeBg.b, JSON.stringify(r.urgeBg));
  t.check("目標は藍の点線（下の札も藍）", r.goalDash && r.goalDash !== "none" && r.goalInk === r.aiInk, `${r.goalDash} ${r.goalInk} ${r.aiInk}`);
  t.check("グラフはカードの幅いっぱい", r.chartW > r.chartInner - 40, `${r.chartW} / ${r.chartInner}`);
  t.check("AI推計のひと言と二つのボタンはカードの底、小見出しの右に AI推計", r.noteIn && r.aiOpen);
  t.check("お酒を足した合計・PFC・熱量比は出さない", !/お酒を足すと|熱量比|繊維/.test(r.text) && !r.text.includes("diet-pfc"));
  t.check("評価の言葉・絵文字なし", !/\p{Extended_Pictographic}/u.test(r.text));

  /* ---- iPad 縦（820px）：二段 ---- */
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(500);
  const m = await read();
  t.check("iPad 縦：左に体重・食事と今日の食事、右に推移", m.kg.r < m.kcal.l && m.kcal.r < m.chart.l && Math.abs(m.chart.t - m.kg.t) <= 2
    && m.meals.l === m.kg.l && m.meals.r === m.kcal.r && m.meals.r < m.chart.l, JSON.stringify([m.kg, m.kcal, m.meals, m.chart].map((x) => [x.l, x.t, x.r, x.b])));
  t.check("iPad 縦：体重の下はすぐ今日の食事（推移の背に引っぱられない）", m.meals.t - m.kg.b <= 24 && m.chart.b > m.kg.b + 30,
    `${m.kg.b} → ${m.meals.t}（推移 ${m.chart.b}）`);
  t.check("iPad 縦：飲みたくなったは推移のすぐ下", m.urge.l >= m.chart.l && m.urge.t - m.chart.b <= 24, `${m.chart.b} → ${m.urge.t}・週の一行 ${JSON.stringify(m.wk)}`);
  t.check("iPad 縦：札は一段（四つ横に）", new Set(m.mets.map((x) => x.type)).size === 4 && m.mets.every((x) => x.over <= 1));

  /* ---- 広い幅（1440px）：札の下に三段 ---- */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  const w = await read();
  t.check("広い幅：体重と食事は左に縦、今日の食事は真ん中、推移は右", w.kg.l === w.kcal.l && w.kcal.t > w.kg.b - 1
    && w.kg.r < w.meals.l && w.meals.r < w.chart.l && Math.abs(w.meals.t - w.kg.t) <= 2 && Math.abs(w.chart.t - w.kg.t) <= 2,
    JSON.stringify([w.kg, w.kcal, w.meals, w.chart].map((x) => [x.l, x.t, x.r, x.b])));
  t.check("広い幅：飲みたくなったは食事のすぐ下（左の段）", w.urge.l === w.kg.l && w.urge.t - w.kcal.b <= 24, `${w.kcal.b} → ${w.urge.t}`);

  t.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
