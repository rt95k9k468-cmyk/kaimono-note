/* いまごろ・年々のつまみ（構2・shots/vision/README.md 6.1・8）と、出さない日（R9）・どこかの一日（F6 の D1）・章の扉と棚（構4b）。

   時計を 2026年9月29日に止める。同じ月日の頁は 2024・2025（日記）、2022 は済ませた用事と買ったものだけ（同じ候の 9/30）、
   2023 は積み上げだけ（出ない）、2021 は体重だけ（からだは出ない）。
   - 年々のつまみ：読む関数（KN.dayPage.yearTabs）だけ。席1 の今日は扉・棚・いまごろだけで、つまみは出さない（構4b の二つめ）。
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
    return {
      ima: !!ima,
      years: ima ? [...ima.querySelectorAll(".ima-y")].map((e) => e.textContent) : [],
      pages: ima ? [...ima.querySelectorAll(".ima-page")].map((e) => e.dataset.day + (e.classList.contains("is-same") ? "*" : "")) : [],
      empty: ima ? [...ima.querySelectorAll(".ima-year")].filter((y) => !y.querySelector(".ima-page, .ima-line")).length : 0,
      text: ima ? ima.innerText : "",
      log: !!root.querySelector(".arc-log"),
      html: root.innerHTML,
    };
  });
  let c = await card();
  t.check("席1 の今日に Daily Log もつまみも無い（構4b の二つめ）", !c.log && !c.html.includes("arc-tab"));
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

  /* いまごろの頁を押す → その日の頁（席1）。過ぎた日の紙にはいまごろを出さない。 */
  await page.click("#screen-archive .ima-page[data-day='2024-09-29']");
  await page.waitForTimeout(500);
  const rowText = await page.evaluate(() => (document.querySelector("#screen-archive .arc-log") || {}).innerText || "");
  t.check("いまごろの頁を押すと、その日の頁へ", rowText.includes("試験の一行（その一）"), rowText.slice(0, 60));
  t.check("過ぎた日の紙には、いまごろを出さない",
    await page.evaluate(() => !document.querySelector("#screen-archive .arc-then")));
  await page.evaluate(() => { KN.store.setQuietDay("2023-09-29", true); KN.store.setQuietDay("2024-09-29", true); });
  await page.evaluate(() => { KN.util.dayShare.set("2026-09-28"); KN.util.dayShare.set(KN.util.todayKey()); KN.app.showScreen("archive"); });
  await page.waitForTimeout(400);
  c = await card();
  t.check("前に付いた印は効かない", c.years.length === 3, c.years.join(","));
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
  t.check("鍵のあいだ、いまごろを組まない", !c.ima && !c.html.includes("試験の一行"));
  await page.evaluate(() => { KN.lock.hides = window.__hides; KN.app.showScreen("archive"); });
  await page.waitForTimeout(400);

  /* 置き場（構4b）：電話は一列（扉 → 棚 → いまごろ）。iPad の縦（820px）と広い幅（1440px）は二段——左に扉と棚、右にいまごろ。 */
  const place = () => page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const r = (q) => { const e = root.querySelector(q); return e ? e.getBoundingClientRect() : null; };
    const log = r(".arc-log"), then = r(".arc-then"), kou = r(".arc-season"), main = r(".day-main"), shelf = r(".arc-shelf");
    return { log, then, kou, main, shelf, slide: r(".day-slide"), any: r(".arc-any"), anyIn: !!root.querySelector(".arc-shelf .arc-any") };
  });
  let at = await place();
  t.check("電話：いまごろは棚の下・同じ列", at.then && at.shelf && at.then.top > at.shelf.bottom && Math.abs(at.then.left - at.kou.left) < 2, JSON.stringify(at));
  t.check("構4b：今日は扉 → 棚 → いまごろ（Daily Log は無い）。どこかの一日は棚の右の端", at.shelf && at.shelf.top >= at.kou.bottom && !at.log
    && at.anyIn && at.any.right > at.shelf.right - 40, JSON.stringify({ shelf: at.shelf, any: at.any }));
  for (const [w, h] of [[820, 1180], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    at = await place();
    t.check(`${w}px：二段（左に扉と棚、右にいまごろ。上を揃える）`, at.kou && at.then && at.then.left > at.kou.right
      && Math.abs(at.kou.top - at.then.top) < 2, JSON.stringify(at));
    t.check(`${w}px：棚は扉のすぐ下（左の段）`, at.shelf && Math.abs(at.shelf.left - at.kou.left) < 2
      && at.shelf.top >= at.kou.bottom && at.shelf.top - at.kou.bottom < 20, JSON.stringify(at.shelf));
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

  /* 構4b 棚と扉：背表紙は記録のある年と今年（新しい年から）・どれも同じ大きさ・今年に栞。押すと月ぜんぶ・年の本。扉を押すと季節のひとこと。 */
  await page.evaluate(() => KN.screens.archive.goDay(KN.util.todayKey()));
  await page.waitForTimeout(700);
  const shelf = await page.evaluate(() => {
    const sp = [...document.querySelectorAll("#screen-archive .arc-shelf .arc-spine")];
    const sz = sp.map((b) => { const r = b.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
    return { years: sp.map((b) => b.dataset.year), now: sp.filter((b) => b.classList.contains("is-now")).map((b) => b.dataset.year),
      same: new Set(sz).size === 1, text: document.querySelector("#screen-archive .arc-shelf").innerText, want: KN.yearbook.years() };
  });
  t.check("構4b：棚は記録のある年と今年の背表紙（新しい年から）・今年に栞", shelf.years.join() === [...new Set([String(new Date().getFullYear())].concat(shelf.want))].sort().reverse().join()
    && shelf.years.includes("2024") && shelf.now.join() === String(new Date().getFullYear()), JSON.stringify(shelf));
  t.check("構4b：背表紙はどの年も同じ大きさ（年を比べない）・禁止語なし", shelf.same && !FORBIDDEN.some((w) => shelf.text.includes(w)), JSON.stringify(shelf));
  await page.click('#screen-archive .arc-spine[data-year="2025"]');
  await page.waitForTimeout(300);
  const items = await page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.innerText.trim()));
  t.check("構4b：背表紙を押すと「月ぜんぶ」「年の本」", items.join("|") === "月ぜんぶ|年の本", items.join("|"));
  await page.locator(".note-pop-item", { hasText: "月ぜんぶ" }).click();
  await page.waitForTimeout(400);
  const pick = await page.evaluate(() => { const y = document.querySelector(".js-up-t"); return { y: y && y.textContent, cells: document.querySelectorAll(".mp-grid .mp-cell").length }; });
  t.check("構4b：月ぜんぶはその年の十二の月", pick.y === "2025年" && pick.cells === 12, JSON.stringify(pick));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const door = await page.evaluate(() => {
    const d = document.querySelector("#screen-archive .arc-door"), m = d && d.querySelector(".arc-season-main");
    if (!m) return null;
    const before = m.offsetHeight > 0;
    d.querySelector(".arc-door-face").click();
    return { before, after: m.offsetHeight > 0, exp: d.querySelector(".arc-door-face").getAttribute("aria-expanded"), past: !!document.querySelector("#screen-archive .think-cards") };
  });
  t.check("構4b：扉を押すと季節のひとことが開く・閉じる（ノート・思考の札は無い）", door && door.after !== door.before && door.exp === String(door.after) && !door.past, JSON.stringify(door));

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

  /* 設定「いまごろ・年々」を切ると、どれも出ない。 */
  await page.evaluate(() => { KN.store.update((s) => { s.settings.showThen = false; }); });
  await page.waitForTimeout(400);
  c = await card();
  t.check("切ると、いまごろは出ない", !c.ima);
  t.check("切ると、どこかの一日も出ない", await page.evaluate(() => !document.querySelector("#screen-archive .arc-any")));

  t.check("ページのエラーが無い", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
