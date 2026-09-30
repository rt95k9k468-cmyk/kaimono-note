/* 同じ日の年々と、出さない日（R9）。

   時計を 2026年9月29日に止め、前から使っている人の保存（archive に quiet の鍵が
   無い）を置く。同じ月日の記録は 2023（積み上げだけ）・2024・2025（地の文）、
   2022 は何も無い。

   - reconcile：鍵の無い保存は quiet が空（どの日も今までどおり出る・移行なし）。
   - 二年以上あれば「あの日」は年ごとの一行（遠い年から）。記録の無い年は行ごと出ない。
     年の数を言わない・daily の禁止語に当たらない。
   - 年の行を押すとその日へ。その日の log の紙で「出さない」にすると、年々からも
     「あの日」からも消える。記録そのものは残る。読み直しても印は残る。戻せる。
   - 一年ぶんしか残らなければ、いつもの一枚。
   日記の本文は試験用の無難な字だけ。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/then-years.js */
const { open, checker } = require("./lib");

const FORBIDDEN = [
  "目標", "連続", "達成", "割合", "先月", "前月", "平均", "記録更新", "ストリーク",
  "サボ", "がんば", "頑張", "未記入", "書いていない", "空白", "できなかった",
];

(async () => {
  const t = checker("then-years");
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => {
      await pg.clock.setFixedTime(new Date(2026, 8, 29, 10, 0));
      await ctx.addInitScript(() => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("kaimono-note-v2", JSON.stringify({
          schema: 2, settings: { theme: "auto" },
          archive: {
            entries: [{ id: "e2023", type: "reading", title: "試験の本", date: "2023-09-29" }],
            days: [
              { date: "2024-09-29", memo: "試験の一行（その一）", createdAt: "2024-09-29" },
              { date: "2025-09-29", memo: "試験の一行（その二）", createdAt: "2025-09-29" },
            ],
          },
        }));
      });
    },
  });

  const base = await page.evaluate(() => ({
    quiet: KN.store.get().archive.quiet,
    years: (KN.store.archiveYears() || []).map((y) => y.date),
  }));
  t.check("鍵の無い保存は quiet が空（reconcile・移行なし）",
    Array.isArray(base.quiet) && base.quiet.length === 0, JSON.stringify(base.quiet));
  t.check("年々は 2023・2024・2025 の三つ、遠い年から（2022 は無い）",
    JSON.stringify(base.years) === JSON.stringify(["2023-09-29", "2024-09-29", "2025-09-29"]), base.years.join(","));

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(400);

  const card = () => page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const years = root.querySelector(".arc-then.is-years");
    const single = root.querySelector(".arc-then:not(.is-years)");
    return {
      years: !!years,
      single: !!single,
      singleDate: single ? single.dataset.day : null,
      rows: years ? [...years.querySelectorAll(".arc-year-y")].map((e) => e.firstChild.textContent) : [],
      text: years ? years.innerText : single ? single.innerText : "",
      isButton: years ? years.tagName : null,
    };
  });
  let c = await card();
  t.check("二年以上あるので、年ごとの一枚が出る（いつもの一枚は出ない）", c.years && !c.single);
  t.check("行は 2023年・2024年・2025年（記録の無い年は行ごと出ない）",
    JSON.stringify(c.rows) === JSON.stringify(["2023年", "2024年", "2025年"]), c.rows.join(","));
  t.check("枠はボタンではなく、行がボタン", c.isButton === "DIV");
  t.check("積み上げだけの年は、その題が出る", c.text.includes("試験の本"));
  t.check("年の数を言わない（◯年分・◯件・◯回）", !/年分|件|回/.test(c.text), c.text);
  const hits = FORBIDDEN.filter((w) => c.text.includes(w));
  t.check("daily の禁止語に当たらない", !hits.length, hits.join(","));

  /* 2024年の行を押す → その日へ。その日の行を押して log の紙を開き、「出さない」。 */
  await page.click(".arc-then.is-years .arc-year[data-day='2024-09-29']");
  await page.waitForTimeout(500);
  const went = await page.evaluate(() => KN.app.viewDay ? KN.app.viewDay() : null);
  const rowText = await page.evaluate(() => {
    const r = document.querySelector("#screen-archive .arc-log-row");
    return r ? r.innerText : "";
  });
  t.check("年の行を押すと、その日の Daily Log へ", rowText.includes("試験の一行（その一）"), `${went} / ${rowText.slice(0, 40)}`);
  await page.click("#screen-archive .arc-log-row");
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => {
    const b = document.querySelector(".js-quiet");
    const h = document.querySelector(".js-quiet-hint");
    return { btn: b ? b.textContent : null, hint: h ? !h.hidden : null };
  });
  t.check("log の紙に「この日を『あの日』に出さない」", before.btn === "この日を「あの日」に出さない", String(before.btn));
  t.check("ことわり書きは置かない", before.hint === null);
  await page.click(".js-quiet");
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    quiet: KN.store.isQuietDay("2024-09-29"),
    btn: document.querySelector(".js-quiet").textContent,
    hint: !!document.querySelector(".js-quiet-hint"),
    memo: (KN.store.dayLog("2024-09-29") || {}).memo,
  }));
  t.check("押すと出さない日になる", after.quiet === true);
  t.check("ボタンは「また出す」に（ことわり書きは出さない）", after.btn === "「あの日」にまた出す" && !after.hint);
  t.check("記録そのものは残る", after.memo === "試験の一行（その一）");
  await page.click(".sheet .js-ok").catch(() => {});
  await page.waitForTimeout(500);

  c = await card();
  t.check("年々から 2024年が消え、2023年・2025年が残る",
    c.years && JSON.stringify(c.rows) === JSON.stringify(["2023年", "2025年"]), c.rows.join(","));

  /* 2023 も出さない → 一年ぶんだけになり、いつもの一枚（1年前の今日）。 */
  await page.evaluate(() => KN.store.setQuietDay("2023-09-29", true));
  await page.waitForTimeout(400);
  c = await card();
  t.check("一年ぶんしか残らなければ、いつもの一枚（2025年）", !c.years && c.single && c.singleDate === "2025-09-29",
    `${c.years} ${c.single} ${c.singleDate}`);
  const pickNot = await page.evaluate(() => {
    const out = new Set();
    // 記念日の無い日でも、出さない日は選ばれない（過ぎた日のどれか一つ）。
    for (let d = 1; d <= 28; d++) {
      const k = `2027-02-${String(d).padStart(2, "0")}`;
      const r = KN.store.archiveThen(k);
      if (r) out.add(r.date);
    }
    return [...out];
  });
  t.check("記念日の無い日の「どれか一つ」にも、出さない日は選ばれない",
    !pickNot.includes("2024-09-29") && !pickNot.includes("2023-09-29"), pickNot.join(","));

  /* 読み直しても印は残る。 */
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => KN.store.get().archive.quiet);
  t.check("読み直しても印は残る", JSON.stringify(kept) === JSON.stringify(["2023-09-29", "2024-09-29"]), JSON.stringify(kept));

  /* 戻す。 */
  await page.evaluate(() => { KN.store.setQuietDay("2023-09-29", false); KN.store.setQuietDay("2024-09-29", false); });
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(400);
  c = await card();
  t.check("戻すと、また三年ぶん", c.years && c.rows.length === 3, c.rows.join(","));

  /* 設定で「あの日」を切ると、年々も出ない。 */
  await page.evaluate(() => { KN.store.update((s) => { s.settings.showThen = false; }); });
  await page.waitForTimeout(400);
  c = await card();
  t.check("「あの日」を切ると、年々も出ない", !c.years && !c.single);

  t.check("ページのエラーが無い", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
