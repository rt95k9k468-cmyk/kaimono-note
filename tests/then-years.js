/* いまごろ・年々のつまみ（構2・shots/vision/README.md 6.1・8）と、出さない日（R9）・どこかの一日（F6 の D1）。

   時計を 2026年9月29日に止める。同じ月日の頁は 2024・2025（日記）、2022 は済ませた用事と買ったものだけ（同じ候の 9/30）、
   2023 は積み上げだけ（出ない）、2021 は体重だけ（からだは出ない）。
   - 年々のつまみ：頁の上の縁に、同じ月日に頁がある年だけ（2024・2025）。押すとその年の同じ日。
   - いまごろ：同じ候の、ほかの年の頁を年ごとに。日記の無い年は した／買った だけで出る。何も無い年・からだだけの年は出ない。
     同じ月日の頁に栞。数を言わない・禁止語に当たらない。空の升が無い。
   - 1月2日（2027年）：いまごろに前の年の12月31日が入る（年の札は続きが始まる年＝2025）。
   - 日記の鍵のあいだ：つまみもいまごろも組まない（DOM に本文が残らない）。
   - reconcile：鍵の無い保存は quiet が空（移行なし）。前に付いた印は効かない・データは残る。
   - 置き場（R6）と D1 偶然の一日。設定「いまごろ・年々」を切ると、どれも出ない。
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
          todos: [{ id: "t2022", title: "試験の用事", done: true, doneAt: "2022-09-30T03:00:00.000Z", createdAt: "2022-09-30T01:00:00.000Z" }],
          products: [{ id: "p1", name: "試験の品" }],
          items: [{ id: "i2022", productId: "p1", checked: true, checkedAt: "2022-09-30T04:00:00.000Z" }],
        }));
      });
    },
  });

  await page.evaluate(() => KN.store.addWeight({ day: "2021-09-29", time: "07:00", kg: 61.5 }));
  const base = await page.evaluate(() => ({
    quiet: KN.store.get().archive.quiet,
    tabs: KN.dayPage.yearTabs("2026-09-29", (d) => d === "2024-09-29" || d === "2025-09-29"),
  }));
  t.check("鍵の無い保存は quiet が空（reconcile・移行なし）",
    Array.isArray(base.quiet) && base.quiet.length === 0, JSON.stringify(base.quiet));
  t.check("yearTabs は古い順", JSON.stringify(base.tabs) === JSON.stringify(["2024-09-29", "2025-09-29"]), base.tabs.join(","));
  const leap = await page.evaluate(() => KN.dayPage.yearTabs("2028-02-29", () => true));
  t.check("2月29日のつまみは閏年だけ・三つまで", JSON.stringify(leap) === JSON.stringify(["2020-02-29", "2024-02-29"]), leap.join(","));

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(400);

  const card = () => page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const ima = root.querySelector(".arc-then.is-ima");
    const tabs = root.querySelector(".arc-tabs");
    const body = root.querySelector(".arc-log-body");
    return {
      ima: !!ima,
      years: ima ? [...ima.querySelectorAll(".ima-y")].map((e) => e.textContent) : [],
      pages: ima ? [...ima.querySelectorAll(".ima-page")].map((e) => e.dataset.day + (e.classList.contains("is-same") ? "*" : "")) : [],
      empty: ima ? [...ima.querySelectorAll(".ima-year")].filter((y) => !y.querySelector(".ima-page, .ima-line")).length : 0,
      text: ima ? ima.innerText : "",
      tabs: tabs ? [...tabs.querySelectorAll(".arc-tab")].map((e) => e.dataset.day) : [],
      onEdge: !!(tabs && body && tabs.nextElementSibling === body
        && Math.abs(tabs.getBoundingClientRect().bottom - body.getBoundingClientRect().top) < 2),
      html: root.innerHTML,
    };
  });
  let c = await card();
  t.check("つまみは頁の上の縁に、頁がある年だけ（2024・2025）", JSON.stringify(c.tabs) === JSON.stringify(["2024-09-29", "2025-09-29"]) && c.onEdge,
    JSON.stringify([c.tabs, c.onEdge]));
  t.check("いまごろが出る", c.ima);
  t.check("年は 2022・2024・2025（積み上げだけの 2023・からだだけの 2021 は出ない）",
    JSON.stringify(c.years) === JSON.stringify(["2022", "2024", "2025"]), c.years.join(","));
  t.check("同じ月日の頁に栞", c.pages.includes("2024-09-29*") && c.pages.includes("2025-09-29*"), c.pages.join(","));
  t.check("日記の無い年は した／買った だけで出る", /した\s*試験の用事/.test(c.text) && /買った\s*試験の品/.test(c.text), c.text);
  t.check("空の升が無い", c.empty === 0);
  t.check("からだ・食事は出ない・積み上げも出ない", !/61\.5|体重|試験の本/.test(c.text), c.text);
  t.check("数を言わない（◯年分・◯件・◯回）", !/年分|件|回/.test(c.text), c.text);
  const hits = FORBIDDEN.filter((w) => c.text.includes(w));
  t.check("daily の禁止語に当たらない", !hits.length, hits.join(","));
  t.check("月のまとめは出ない", !c.html.includes("arc-counts") && !/のまとめ/.test(c.html));

  /* つまみを押す → その年の同じ日。過ぎた日の紙にはつまみもいまごろも出さない。 */
  await page.click("#screen-archive .arc-tab[data-day='2024-09-29']");
  await page.waitForTimeout(500);
  const rowText = await page.evaluate(() => (document.querySelector("#screen-archive .arc-log") || {}).innerText || "");
  t.check("つまみを押すと、その年の同じ日の頁へ", rowText.includes("試験の一行（その一）"), rowText.slice(0, 60));
  t.check("過ぎた日の紙には、つまみもいまごろも出さない",
    await page.evaluate(() => !document.querySelector("#screen-archive .arc-then, #screen-archive .arc-tabs")));
  await page.evaluate(() => { KN.store.setQuietDay("2023-09-29", true); KN.store.setQuietDay("2024-09-29", true); });
  await page.evaluate(() => { KN.util.dayShare.set("2026-09-28"); KN.util.dayShare.set(KN.util.todayKey()); KN.app.showScreen("archive"); });
  await page.waitForTimeout(400);
  c = await card();
  t.check("前に付いた印は効かない", c.years.length === 3 && c.tabs.length === 2, c.years.join(","));
  t.check("isQuietDay はいつも出す", await page.evaluate(() => KN.store.isQuietDay("2024-09-29")) === false);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => KN.store.get().archive.quiet);
  t.check("印のデータは消さずに残る", JSON.stringify(kept) === JSON.stringify(["2023-09-29", "2024-09-29"]), JSON.stringify(kept));
  await page.evaluate(() => { KN.store.setQuietDay("2023-09-29", false); KN.store.setQuietDay("2024-09-29", false); });

  /* 日記の鍵のあいだ：組まない（覆うのではなく、DOM に無い）。 */
  await page.evaluate(() => { window.__hides = KN.lock.hides; KN.lock.hides = (w) => w === "diary"; KN.app.showScreen("archive"); });
  await page.waitForTimeout(400);
  c = await card();
  t.check("鍵のあいだ、つまみもいまごろも組まない", !c.ima && !c.tabs.length && !c.html.includes("試験の一行"), JSON.stringify(c.tabs));
  await page.evaluate(() => { KN.lock.hides = window.__hides; KN.app.showScreen("archive"); });
  await page.waitForTimeout(400);

  /* 置き場（R6）：電話は一列（Daily Log の下）。iPad の縦（820px）と広い幅（1440px）は二段——左に書く口と Daily Log、
     右に候の札といまごろ。右の段は左の背に引かれず、候の札のすぐ下にいまごろ。 */
  const place = () => page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const r = (q) => { const e = root.querySelector(q); return e ? e.getBoundingClientRect() : null; };
    const log = r(".arc-log"), then = r(".arc-then"), kou = r(".arc-season"), write = r(".think-cards");
    return { log, then, kou, write, slide: r(".day-slide"), any: r(".arc-any") };
  });
  let at = await place();
  t.check("電話：いまごろは Daily Log の下・同じ列", at.then && at.then.top > at.log.bottom && Math.abs(at.then.left - at.log.left) < 2, JSON.stringify(at));
  t.check("D1：いまごろの並びの端に「どこかの一日」", at.any && at.any.top >= at.then.bottom && Math.abs(at.any.left - at.then.left) < 2, JSON.stringify(at.any));
  for (const [w, h] of [[820, 1180], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    at = await place();
    t.check(`${w}px：二段（右に候の札といまごろ、左に書く口と Daily Log）`, at.kou && at.then && at.kou.left > at.log.right
      && at.then.left > at.log.right && at.write.left === at.log.left && Math.abs(at.kou.top - at.write.top) < 2
      && at.then.top - at.kou.bottom < 20, JSON.stringify(at));
    t.check(`${w}px：どこかの一日はいまごろのすぐ下（右の段）`, at.any && Math.abs(at.any.left - at.then.left) < 2
      && at.any.top - at.then.bottom < 20 && at.any.top > at.then.bottom, JSON.stringify(at.any));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  /* D1 偶然の一日：押すたびに書いてある過ぎた日のどれかへ（いまの日は除く）。数を言わない。行った先にも同じ札。 */
  const anyText = await page.evaluate(() => document.querySelector("#screen-archive .arc-any").innerText);
  t.check("D1：札は「どこかの一日」だけ（数・禁止語なし）", anyText.trim() === "どこかの一日"
    && !FORBIDDEN.some((w) => anyText.includes(w)), anyText);
  const shown = () => page.evaluate(() => document.querySelector("#screen-archive .day-slide").dataset.day
    || (document.querySelector("#screen-archive .arc-log-row") || {}).dataset.day);
  await page.click("#screen-archive .arc-any");
  await page.waitForTimeout(500);
  const first = await shown();
  t.check("D1：押すと書いてある過ぎた日へ", ["2024-09-29", "2025-09-29"].includes(first), first);
  await page.click("#screen-archive .arc-any");
  await page.waitForTimeout(500);
  const second = await shown();
  t.check("D1：行った先でもう一度押すと、別の書いてある日へ", ["2024-09-29", "2025-09-29"].includes(second) && second !== first, `${first} → ${second}`);
  await page.evaluate(() => { KN.util.dayShare.set(KN.util.todayKey()); KN.app.showScreen("archive"); });
  await page.waitForTimeout(400);

  /* 年をまたぐ候（雪下出麦）：2027年1月2日のいまごろに、前の年の12月31日が入る。年の札は続きが始まる年（2025）。 */
  await page.clock.setFixedTime(new Date(2027, 0, 2, 10, 0));
  await page.evaluate(() => {
    KN.store.update((s) => { s.archive.days.push(
      { date: "2025-12-31", memo: "試験の大晦日", createdAt: "2025-12-31" },
      { date: "2026-01-02", memo: "試験の正月", createdAt: "2026-01-02" }); });
    KN.util.dayShare.set("2027-01-01"); KN.util.dayShare.set(KN.util.todayKey()); KN.app.showScreen("archive");
  });
  await page.waitForTimeout(500);
  c = await card();
  t.check("1月2日：いまごろに前の年の12月31日が入り、年の札は 2025 の一つ",
    JSON.stringify(c.years) === JSON.stringify(["2025"]) && JSON.stringify(c.pages) === JSON.stringify(["2025-12-31", "2026-01-02*"]),
    JSON.stringify([c.years, c.pages]));
  t.check("1月2日：つまみは 2026 だけ", JSON.stringify(c.tabs) === JSON.stringify(["2026-01-02"]), c.tabs.join(","));

  /* 設定「いまごろ・年々」を切ると、どれも出ない。 */
  await page.evaluate(() => { KN.store.update((s) => { s.settings.showThen = false; }); });
  await page.waitForTimeout(400);
  c = await card();
  t.check("切ると、いまごろもつまみも出ない", !c.ima && !c.tabs.length);
  t.check("切ると、どこかの一日も出ない", await page.evaluate(() => !document.querySelector("#screen-archive .arc-any")));

  t.check("ページのエラーが無い", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
