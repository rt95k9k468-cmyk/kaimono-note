/* 暦に季節のひとこと（二十四節気・七十二候。docs/roadmap.md の R2）。

   前半は表：js/season.js を node で読み、節気の初日が暦（国立天文台の暦要項）と
   合うかを三年ぶん測る。後半は画面：daily の一日ぶんに一行出る・設定で消える・
   月ぜんぶでは出ない・前から使っている人（設定に鍵が無い）にも既定で出る・
   daily の禁止語に当たらない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/season.js
   （表の日付は日本の暦。TZ を Asia/Tokyo にして測る） */
process.env.TZ = "Asia/Tokyo";
const path = require("path");
const { open, checker } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "season.js"));
const SE = global.KN.season;

const t = checker("season");

/* 禁止語は tests/daily-rules.js と同じもの。 */
const FORBIDDEN = [
  "目標", "連続", "達成", "割合", "先月", "前月", "平均", "記録更新", "ストリーク",
  "サボ", "がんば", "頑張", "未記入", "書いていない", "空白", "できなかった",
];

/* ---- 表：節気の初日（暦要項） ---- */
const FIRST = [
  ["2025-02-03", "立春"], ["2025-03-20", "春分"], ["2025-06-21", "夏至"],
  ["2025-08-07", "立秋"], ["2025-09-23", "秋分"], ["2025-12-22", "冬至"],
  ["2026-01-05", "小寒"], ["2026-02-04", "立春"], ["2026-03-20", "春分"],
  ["2026-05-05", "立夏"], ["2026-06-21", "夏至"], ["2026-08-07", "立秋"],
  ["2026-09-23", "秋分"], ["2026-11-07", "立冬"], ["2026-12-22", "冬至"],
  ["2027-02-04", "立春"], ["2027-03-21", "春分"], ["2027-06-21", "夏至"],
  ["2027-08-08", "立秋"], ["2027-09-23", "秋分"], ["2027-12-22", "冬至"],
];
const prevDay = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
FIRST.forEach(([day, name]) => {
  const r = SE.of(day), p = SE.of(prevDay(day));
  t.check(`${day} から${name}（前の日はまだ違う）`,
    r.sekki === name && r.part === 0 && r.first && p.sekki !== name, `${p.sekki} → ${r.sekki}`);
});

t.check("2026-09-28 は秋分の次候「蟄虫坏戸」", SE.line("2026-09-28") === "秋分　蟄虫坏戸（むしかくれてとをふさぐ）", SE.line("2026-09-28"));
t.check("候は72・節気は24", SE.KOU.length === 72 && SE.SEKKI.length === 24);
t.check("候の名前はどれも違う", new Set(SE.KOU.map((k) => k[0])).size === 72);
t.check("どの年のどの日にも一行ある（2026年）", (() => {
  for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    const k = `2026-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!SE.line(k)) return false;
  }
  return true;
})());
/* 一年で候は72回替わる（毎年、どれも一度ずつ）。 */
const seen = new Set();
for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
  const k = `2026-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  seen.add(SE.of(k).kou);
}
t.check("2026年に72の候がどれも出る", seen.size === 72, String(seen.size));
const allText = SE.KOU.flat().concat(SE.SEKKI.flat()).join(" ");
const hits = FORBIDDEN.filter((w) => allText.includes(w));
t.check("節気・候の字が daily の禁止語に当たらない", !hits.length, hits.join(","));
{
  const r = (d) => SE.rows(d).map((x) => x.join(" ")).join(" / ");
  t.check("期間：2026-09-29 は秋分 9/23-10/7・候は 9/28-10/2",
    r("2026-09-29") === "二十四節気 秋分 9/23-10/7 / 七十二候 蟄虫坏戸（むしかくれてとをふさぐ） 9/28-10/2", r("2026-09-29"));
  t.check("期間：節気の初日と終日でも同じ期間（境目でずれない）",
    SE.span("2026-09-23", 3).from === "2026-09-23" && SE.span("2026-10-07", 3).to === "2026-10-07"
    && SE.span("2026-09-23", 3).to === SE.span("2026-10-07", 3).to);
  t.check("期間：年をまたぐ冬至も月日だけ", /冬至 12\/22-1\/4/.test(r("2026-12-25")), r("2026-12-25"));
  let ok = true;
  for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const a = SE.span(k, 3), b = SE.span(k, 1);
    if (!a || !b || a.days < 14 || a.days > 16 || b.days < 4 || b.days > 6 || k < a.from || k > a.to || k < b.from || k > b.to) { ok = false; break; }
  }
  t.check("期間：2026年の毎日で、節気は14〜16日・候は4〜6日・その日を含む", ok);
}
t.check("日付でないものには何も言わない", SE.of("") === null && SE.line("x") === "");

(async () => {
  /* 前から使っている人：保存に showSeason の鍵が無い。 */
  const { browser, page, errors } = await open({
    before: async (ctx) => {
      await ctx.addInitScript(() => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("kaimono-note-v2", JSON.stringify({
          schema: 2, settings: { theme: "auto", showDigest: true },
        }));
      });
    },
  });

  const base = await page.evaluate(() => ({
    on: KN.store.get().settings.showSeason,
    today: KN.util.todayKey(),
  }));
  t.check("設定に鍵が無い人も、既定で出す（reconcile）", base.on === true, String(base.on));

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(400);
  const scr = await page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const el = root.querySelector(".arc-log .arc-season");
    const head = root.querySelector(".arc-log-head");
    const row = root.querySelector(".arc-log-row");
    return {
      text: el ? [...el.querySelectorAll(".arc-season-row")].map((r) => r.textContent.replace(/\s+/g, "")).join(" | ") : null,
      want: KN.season.rows(KN.util.todayKey()).map((x) => x.join("").replace(/\s+/g, "")).join(" | "),
      afterHead: !!(el && head && el.previousElementSibling === head),
      aboveRow: !!(el && row && (el.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)),
      weight: el ? getComputedStyle(el).fontWeight : null,
      all: root.innerText,
    };
  });
  t.check("daily の一日ぶんに、二十四節気と七十二候が名前つきの二行", !!scr.text && scr.text === scr.want, `${scr.text} / ${scr.want}`);
  t.check("置き場所は Daily Log の見出しのすぐ下・日の行の上", scr.afterHead && scr.aboveRow);
  t.check("字の太さは 400", scr.weight === "400", scr.weight);
  const hits2 = FORBIDDEN.filter((w) => scr.all.includes(w));
  t.check("daily の画面に評価の言葉が出ない", !hits2.length, hits2.join(","));

  /* 月ぜんぶでは出さない（どの日の、が一つに決まらない） */
  await page.evaluate(() => KN.store.update((s) => { s.settings.dailyScope = "month"; }));
  await page.waitForTimeout(300);
  const month = await page.evaluate(() => !!document.querySelector("#screen-archive .arc-season"));
  t.check("月ぜんぶのときは出さない", !month);

  /* 設定で消せる */
  await page.evaluate(() => KN.store.update((s) => { s.settings.dailyScope = "day"; s.settings.showSeason = false; }));
  await page.waitForTimeout(300);
  const off = await page.evaluate(() => !!document.querySelector("#screen-archive .arc-season"));
  t.check("設定で消すと出ない", !off);
  await page.evaluate(() => KN.store.update((s) => { s.settings.showSeason = true; }));
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => !!document.querySelector("#screen-archive .arc-season"));
  t.check("戻すとまた出る", back);

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
