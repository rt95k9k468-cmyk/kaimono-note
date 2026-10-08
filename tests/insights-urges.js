/* 気づいたことの「飲みたくなったとき」（docs/health.md の D9）。

   時計を 2026年10月8日に止め、30日の窓で。記録が少ないうちは何も出さない・
   数えるのは場面・気持ち・試したことと強さだけで、「どうしたか」は数えない・
   並べる順は回数・色を付けない・記録を変えない。後半は画面：絵・絵文字なし。 */
const { open, checker } = require("./lib");

const t = checker("insights-urges");
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => { await pg.clock.setFixedTime(new Date(2026, 9, 8, 21, 0)); },
  });

  // recs … addUrge にそのまま渡す。day が無ければ 10月1日から一日ずつ。
  const run = (recs) => page.evaluate((recs) => {
    const S = KN.store, U = KN.util;
    S.update((s) => {
      s.diet.weights = []; s.diet.meals = []; s.diet.drinks = []; s.diet.health = []; s.diet.urges = [];
    });
    recs.forEach((r, i) => S.addUrge({ day: U.shiftDay("2026-10-01", i % 8), ...r }));
    const before = JSON.stringify(S.get());
    const found = KN.diet.analyze(30);
    const pick = (id) => found.find((x) => x.id === id) || null;
    return {
      cause: pick("urge-cause"), shift: pick("urge-shift"), tried: pick("urge-tried"),
      same: before === JSON.stringify(S.get()),
    };
  }, recs);

  /* ---- A：4件では何も出さない ---- */
  const four = Array.from({ length: 4 }, () => ({
    before: 4, after: 2, outcome: "none", scene: ["帰宅後"], trigger: ["疲れた"], tried: ["水を飲む"],
  }));
  const a = await run(four);
  t.check("欄を書いた記録が5件未満なら、どれも出さない", !a.cause && !a.shift && !a.tried, JSON.stringify(a));

  /* ---- B：たまった ---- */
  const recs = [
    { before: 5, after: 2, outcome: "none",  scene: ["帰宅後"],      trigger: ["疲れた"],  tried: ["水を飲む"] },
    { before: 4, after: 2, outcome: "wait",  scene: ["帰宅後"],      trigger: ["疲れた"],  tried: ["水を飲む", "散歩"] },
    { before: 3, after: 3, outcome: "drank", scene: ["帰宅後"],      trigger: ["習慣"],    tried: ["水を飲む"] },
    { before: 4, after: 5, outcome: "drank", scene: ["仕事終わり"],  trigger: ["疲れた"],  tried: ["散歩"] },
    { before: 2, after: 1, outcome: "none",  scene: ["仕事終わり"],  trigger: ["習慣"],    tried: ["散歩", "お茶"] },
    { before: 3, after: null, outcome: null, scene: ["寝る前"],      trigger: ["さみしい"], tried: ["お茶"] },
    { before: 5 },
    // 窓の外（31日前）は数えない
    { day: "2026-09-07", before: 5, after: 5, scene: ["寝る前"], trigger: ["さみしい"], tried: ["お茶"] },
    { day: "2026-09-07", before: 5, after: 5, scene: ["寝る前"], trigger: ["さみしい"], tried: ["お茶"] },
  ];
  const b = await run(recs);
  const c = b.cause;
  t.check("場面：書いた6件・多い順に2回以上だけ", c && /場面を書いた 6件で多かったのは 「帰宅後」3回・「仕事終わり」2回。/.test(c.text)
    && !/寝る前/.test(c.text), c && c.text);
  t.check("気持ち：書いた6件", c && /気持ちを書いた 6件では 「疲れた」3回・「習慣」2回でした。/.test(c.text), c && c.text);
  const s = b.shift;
  t.check("強さ：あとまで書いた5件の平均と動き", s && /あとの強さまで書いた 5件の平均は 3\.6 → 2\.6（下がった 3件・変わらない 1件・上がった 1件）。/.test(s.text), s && s.text);
  t.check("「どうしたか」は数えない（飲んだ・飲まなかったの回数を出さない）",
    [c, s, b.tried].every((f) => f && !/飲んだ|飲まなかった|待った/.test(f.text)), [c, s, b.tried].map((f) => f && f.text).join(" / "));
  const tr = b.tried;
  t.check("試したこと：あとまで書いた3回以上・回数順", tr && /^「水を飲む」3回 平均 4\.0 → 2\.3・「散歩」3回 平均 3\.3 → 2\.7。/.test(tr.text)
    && !/お茶/.test(tr.text), tr && tr.text);
  t.check("効いたとは言わない", tr && /どれが効いたかまでは言えません/.test(tr.text), tr && tr.text);
  t.check("色を付けない（tone は info）", [c, s, tr].every((f) => f && f.tone === "info"));
  t.check("記録を変えない（読むだけ）", b.same);

  /* ---- 画面 ---- */
  await page.evaluate(() => KN.store.update((s) => { s.settings.showInsight = true; }));
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForFunction(() => document.querySelector(".diet-findings"), null, { timeout: 5000 }).catch(() => {});
  const ui = await page.evaluate(() => {
    const TITLES = { "飲みたくなったとき": "clock", "飲みたさの強さ、そのあと": "trend", "試したことと、そのあと": "sprout" };
    const rows = [...document.querySelectorAll(".diet-finding")]
      .filter((el) => (el.querySelector("b") || {}).textContent in TITLES);
    return {
      n: rows.length,
      icoOk: rows.every((el) => ((el.querySelector("[data-ico]") || {}).dataset || {}).ico === TITLES[el.querySelector("b").textContent]),
      warn: rows.some((el) => el.classList.contains("is-warn") || el.classList.contains("is-good")),
      text: rows.map((el) => el.innerText).join(" / "),
    };
  });
  t.check("気づいたことに三つとも出る", ui.n === 3, ui.text);
  t.check("絵は clock・trend・sprout", ui.icoOk);
  t.check("色を付けない", !ui.warn);
  t.check("絵文字なし", !EMOJI.test(ui.text));

  t.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
