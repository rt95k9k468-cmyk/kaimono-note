/* 仕事の予定とやること・段2（docs/todo-items.md「仕事の予定とやること」）。

   前半は表：js/when-parse.js を node で読み、「隔週」「◯週ごと」「毎年」を測る。
   ◯週ごとは曜日か時刻もいっしょなら暦の◯週ごと（weekly＋repeatWeeks）、どちらも無ければ
   済ませてから◯×7日のまま（10月18日、利用者）。
   後半は紙：頭に やること｜予定・仕事｜くらし の札。既定はやること・くらしで、欄を足さない。
   打った字に時刻があれば予定（札を押したら替えない）。くりかえしに「毎年」、毎週に「隔週」ほか。
   直す紙で札を戻せば欄は消える。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/work-plan-sheet.js */
const path = require("path");
const { open, checker } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "util.js"));
require(path.join(__dirname, "..", "js", "when-parse.js"));
const W = global.KN.whenParse;

const t = checker("work-plan-sheet");

/* [打った字, 題, repeat, repeatWeeks, repeatDays, repeatEvery, due] 。repeat が "" なら読まない。 */
const TODAY = "2026-10-18"; // 日曜
const TABLE = [
  ["隔週月曜 定例", "定例", "weekly", 2, [1], 0, "2026-10-19"],
  ["隔週 定例", "定例", "weekly", 2, [], 0, ""],
  ["2週ごと月曜 会議", "会議", "weekly", 2, [1], 0, "2026-10-19"],
  ["2週ごと 月曜 会議", "会議", "weekly", 2, [1], 0, "2026-10-19"],
  ["月曜 2週ごと 会議", "会議", "weekly", 2, [1], 0, "2026-10-19"],
  ["会議 3週間ごとの火曜", "会議", "weekly", 3, [2], 0, "2026-10-20"],
  ["10:00 2週ごと 定例", "定例", "weekly", 2, [], 0, ""],
  ["2週間に1回 金曜 面談", "面談", "weekly", 2, [5], 0, "2026-10-23"],
  ["1週ごと月曜 掃除", "掃除", "weekly", 0, [1], 0, "2026-10-19"],
  // 曜日も時刻も無ければ、済ませてから
  ["シーツ 2週間ごと", "シーツ", "after", 0, null, 14, ""],
  ["2週ごと 定例", "定例", "after", 0, null, 14, ""],
  ["1週ごと 掃除", "掃除", "after", 0, null, 7, ""],
  // 毎年
  ["毎年10月18日 誕生日", "誕生日", "yearly", 0, null, 0, "2026-10-18"],
  ["毎年9/1 更新", "更新", "yearly", 0, null, 0, "2027-09-01"],
  ["毎年2/29 記念", "記念", "yearly", 0, null, 0, "2028-02-29"],
  ["毎年 健康診断", "健康診断", "yearly", 0, null, 0, ""],
  // 読まない・食べない
  ["毎週水やり", "水やり", "weekly", 0, [], 0, ""],
  ["2週ごとの記録をつける", "2週ごとの記録をつける", "", 0, null, 0, ""],
  ["隔週", "隔週", "", 0, null, 0, ""],
  ["毎年", "毎年", "", 0, null, 0, ""],
];
TABLE.forEach(([text, title, rep, weeks, days, every, due]) => {
  const r = W.parse(text, { today: TODAY });
  const ok = r.title === title && (r.repeat || "") === rep && (r.repeatWeeks || 0) === weeks
    && (days ? JSON.stringify(r.repeatDays) === JSON.stringify(days) : !r.repeatDays)
    && (r.repeatEvery || 0) === every && (r.due || "") === due && !("weeks" in r);
  t.check(`「${text}」→ ${rep || "読まない"}${weeks ? " " + weeks + "週" : ""}${every ? " " + every + "日" : ""}`, ok,
    JSON.stringify(r));
});
t.check("describe は「隔週 月」", W.describe(W.parse("隔週月曜 定例", { today: TODAY })).startsWith("隔週 月"));
t.check("describe は「毎年」", W.describe(W.parse("毎年 健康診断", { today: TODAY })).startsWith("毎年"));

(async () => {
  const { browser, page, errors } = await open();
  const PLAN = ["kind", "side", "repeatWeeks"];
  const addOpen = async () => {
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('button[aria-label="やることを追加"]').click());
    await page.waitForSelector(".js-title");
    await page.waitForTimeout(300);
  };
  const save = async () => {
    await page.evaluate(() => document.querySelector(".js-save").click());
    await page.waitForTimeout(400);
  };
  const rec = (title) => page.evaluate(([ti, keys]) => {
    const x = KN.store.get().todos.find((y) => y.title === ti && !y.trace);
    if (!x) return null;
    const o = { repeat: x.repeat || null, every: x.repeatEvery || null, days: x.repeatDays || [] };
    keys.forEach((k) => { o[k] = k in x ? x[k] : "-"; });
    return o;
  }, [title, PLAN]);
  const pressed = () => page.evaluate(() =>
    [...document.querySelectorAll(".d-segs .seg-btn[aria-pressed=true]")].map((b) => b.dataset.v).join(","));

  await page.evaluate(() => { KN.store.update((s) => { s.todos = []; }); KN.app.showScreen("todo"); });

  /* 既定：やること・くらし。しまっても欄を足さない。 */
  await addOpen();
  t.check("紙の頭に札が二組", await page.evaluate(() =>
    document.querySelectorAll(".d-segs .js-kind .seg-btn").length === 2 && document.querySelectorAll(".d-segs .js-side .seg-btn").length === 2));
  t.check("既定はやること・くらし", await pressed() === "task,life", await pressed());
  await page.fill(".js-title", "書類");
  await save();
  const plain = await rec("書類");
  t.check("既定のままなら欄を足さない", plain && plain.kind === "-" && plain.side === "-" && plain.repeatWeeks === "-", JSON.stringify(plain));

  /* 打った字に時刻と◯週ごと → 予定・隔週。 */
  await addOpen();
  await page.fill(".js-title", "10:00 2週ごと 定例");
  await page.evaluate(() => document.querySelector(".js-side [data-v=work]").click());
  await save();
  const ev = await rec("定例");
  t.check("時刻があれば予定・仕事・毎週の2週ごと", ev && ev.kind === "event" && ev.side === "work"
    && ev.repeat === "weekly" && ev.repeatWeeks === 2, JSON.stringify(ev));

  /* 札を押したら、時刻があっても替えない。曜日も時刻も無い◯週ごとは済ませてから。 */
  await addOpen();
  await page.evaluate(() => document.querySelector(".js-kind [data-v=task]").click());
  await page.fill(".js-title", "9:00 電話");
  await save();
  const hand = await rec("電話");
  t.check("札を押したら時刻があってもやること", hand && hand.kind === "-", JSON.stringify(hand));
  await addOpen();
  await page.fill(".js-title", "シーツ 2週間ごと");
  await save();
  const sheets = await rec("シーツ");
  t.check("シーツ 2週間ごと は済ませてから14日", sheets && sheets.repeat === "after" && sheets.every === 14
    && sheets.repeatWeeks === "-" && sheets.kind === "-", JSON.stringify(sheets));

  /* くりかえしの紙：毎年と、毎週の◯週ごと。 */
  await addOpen();
  await page.fill(".js-title", "面談");
  await page.evaluate(() => document.querySelector(".js-row-repeat").click());
  await page.waitForTimeout(300);
  const labels = await page.evaluate(() => [...document.querySelectorAll(".js-repeat button")].map((b) => b.textContent.trim()));
  t.check("くりかえしに「毎年」", labels.includes("毎年"), labels.join(","));
  await page.evaluate(() => [...document.querySelectorAll(".js-repeat button")].find((b) => b.textContent.trim() === "毎週").click());
  await page.waitForTimeout(200);
  const weeks = await page.evaluate(() => [...document.querySelectorAll(".js-weeks button")].map((b) => b.textContent.trim()).join(","));
  t.check("毎週に 毎週・隔週・3週ごと・4週ごと", weeks === "毎週,隔週,3週ごと,4週ごと", weeks);
  await page.evaluate(() => [...document.querySelectorAll(".js-weeks button")].find((b) => b.textContent.trim() === "隔週").click());
  await page.waitForTimeout(150);
  const row = await page.evaluate(() => document.querySelector(".js-row-repeat").textContent.replace(/\s+/g, " ").trim());
  t.check("詳細の行に「隔週」", row.includes("隔週"), row);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await save();
  const bi = await rec("面談");
  t.check("しまえば weekly・2週ごと", bi && bi.repeat === "weekly" && bi.repeatWeeks === 2, JSON.stringify(bi));

  await addOpen();
  await page.fill(".js-title", "毎年 健康診断");
  await save();
  const yr = await rec("健康診断");
  t.check("題の「毎年」から yearly", yr && yr.repeat === "yearly", JSON.stringify(yr));

  /* 直す紙：予定を やること・くらし に戻せば欄は消える。 */
  const id = await page.evaluate(() => KN.store.get().todos.find((y) => y.title === "定例" && !y.trace).id);
  await page.waitForTimeout(300);
  await page.evaluate((x) => KN.screens.todo.open(x), id);
  await page.waitForSelector(".js-title");
  await page.waitForTimeout(300);
  t.check("直す紙は記録の札を点ける", await pressed() === "event,work", await pressed());
  await page.evaluate(() => { document.querySelector(".js-kind [data-v=task]").click(); document.querySelector(".js-side [data-v=life]").click(); });
  await save();
  // くり返しなので「どこまで直す」が出る
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("以後すべて")); if (b) b.click(); });
  await page.waitForTimeout(400);
  const back = await rec("定例");
  t.check("戻せば kind・side は消え、隔週は残る", back && back.kind === "-" && back.side === "-" && back.repeatWeeks === 2, JSON.stringify(back));

  t.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
