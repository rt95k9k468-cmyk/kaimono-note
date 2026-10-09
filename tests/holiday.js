/* 祝日と雑節・五節句（docs/roadmap-3.1.md の K1・K2）。

   前半は表：js/season.js と js/holiday.js を node で読む。
   - 祝日：2025〜2027年の全部を内閣府の一覧と照らす。境目（国民の休日・日曜の春分の振替・
     2019年の即位・2020〜21年の五輪の移動・2007年からの振替の決まり・2000年より前は出さない）も。
   - 雑節：節気の日から数えて決まるもの（節分・彼岸・八十八夜・二百十日）は日付で照らす
     （もとの節気の日は tests/season.js が暦要項と照らしている）。黄経で決まるもの（入梅・半夏生・
     土用の入り）は、候の境目・四立との間で確かめる（暦要項の頁はこの環境から開けなかった。
     2026年10月9日）。
   後半は画面：暦の祝日のマスが日曜と同じ色（土曜の祝日も）・読み上げに名前・daily の
   季節のひとことに一行足される・ふつうの日は二行のまま・禁止語に当たらない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/holiday.js
   （日付は日本の暦。TZ を Asia/Tokyo にして測る） */
process.env.TZ = "Asia/Tokyo";
const path = require("path");
const { open, checker } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "season.js"));
require(path.join(__dirname, "..", "js", "holiday.js"));
const SE = global.KN.season;
const HO = global.KN.holiday;

const t = checker("holiday");

/* 禁止語は tests/daily-rules.js と同じもの。 */
const FORBIDDEN = [
  "目標", "連続", "達成", "割合", "先月", "前月", "平均", "記録更新", "ストリーク",
  "サボ", "がんば", "頑張", "未記入", "書いていない", "空白", "できなかった",
];

const pad = (n) => String(n).padStart(2, "0");
const shiftKey = (k, n) => {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
const daysOf = (y) => {
  const out = [];
  for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
    out.push(`${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
};

/* ---- 祝日：内閣府「国民の祝日について」の一覧 ---- */
const OFFICIAL = {
  2025: [
    ["2025-01-01", "元日"], ["2025-01-13", "成人の日"], ["2025-02-11", "建国記念の日"],
    ["2025-02-23", "天皇誕生日"], ["2025-02-24", "振替休日"], ["2025-03-20", "春分の日"],
    ["2025-04-29", "昭和の日"], ["2025-05-03", "憲法記念日"], ["2025-05-04", "みどりの日"],
    ["2025-05-05", "こどもの日"], ["2025-05-06", "振替休日"], ["2025-07-21", "海の日"],
    ["2025-08-11", "山の日"], ["2025-09-15", "敬老の日"], ["2025-09-23", "秋分の日"],
    ["2025-10-13", "スポーツの日"], ["2025-11-03", "文化の日"], ["2025-11-23", "勤労感謝の日"],
    ["2025-11-24", "振替休日"],
  ],
  2026: [
    ["2026-01-01", "元日"], ["2026-01-12", "成人の日"], ["2026-02-11", "建国記念の日"],
    ["2026-02-23", "天皇誕生日"], ["2026-03-20", "春分の日"], ["2026-04-29", "昭和の日"],
    ["2026-05-03", "憲法記念日"], ["2026-05-04", "みどりの日"], ["2026-05-05", "こどもの日"],
    ["2026-05-06", "振替休日"], ["2026-07-20", "海の日"], ["2026-08-11", "山の日"],
    ["2026-09-21", "敬老の日"], ["2026-09-22", "国民の休日"], ["2026-09-23", "秋分の日"],
    ["2026-10-12", "スポーツの日"], ["2026-11-03", "文化の日"], ["2026-11-23", "勤労感謝の日"],
  ],
  2027: [
    ["2027-01-01", "元日"], ["2027-01-11", "成人の日"], ["2027-02-11", "建国記念の日"],
    ["2027-02-23", "天皇誕生日"], ["2027-03-21", "春分の日"], ["2027-03-22", "振替休日"],
    ["2027-04-29", "昭和の日"], ["2027-05-03", "憲法記念日"], ["2027-05-04", "みどりの日"],
    ["2027-05-05", "こどもの日"], ["2027-07-19", "海の日"], ["2027-08-11", "山の日"],
    ["2027-09-20", "敬老の日"], ["2027-09-23", "秋分の日"], ["2027-10-11", "スポーツの日"],
    ["2027-11-03", "文化の日"], ["2027-11-23", "勤労感謝の日"],
  ],
};
Object.entries(OFFICIAL).forEach(([y, list]) => {
  const got = [...HO.year(+y)].map(([k, n]) => `${k} ${n}`);
  const want = list.map(([k, n]) => `${k} ${n}`);
  const miss = want.filter((x) => !got.includes(x));
  const extra = got.filter((x) => !want.includes(x));
  t.check(`${y}年の祝日が内閣府の一覧と同じ（${want.length}日）`, !miss.length && !extra.length,
    `足りない：${miss.join("、")} ／ 余計：${extra.join("、")}`);
});

/* 境目 */
[
  ["2026-09-22", "国民の休日"], ["2027-03-22", "振替休日"],
  ["2019-04-30", "国民の休日"], ["2019-05-01", "天皇の即位の日"], ["2019-05-02", "国民の休日"],
  ["2019-05-06", "振替休日"], ["2019-10-22", "即位礼正殿の儀"],
  ["2020-07-23", "海の日"], ["2020-07-24", "スポーツの日"], ["2020-08-10", "山の日"],
  ["2021-07-22", "海の日"], ["2021-07-23", "スポーツの日"], ["2021-08-08", "山の日"], ["2021-08-09", "振替休日"],
  ["2024-09-23", "振替休日"], ["2018-12-23", "天皇誕生日"], ["2018-12-24", "振替休日"],
  ["2008-05-06", "振替休日"], ["2009-09-22", "国民の休日"], ["2006-05-04", "国民の休日"],
  ["2022-03-21", "春分の日"], ["2023-03-21", "春分の日"], ["2024-03-20", "春分の日"],
  ["2020-09-22", "秋分の日"], ["2021-09-23", "秋分の日"], ["2024-09-22", "秋分の日"],
  ["2028-09-22", "秋分の日"], ["2029-09-23", "秋分の日"], ["2029-09-24", "振替休日"],
].forEach(([k, name]) => t.check(`${k} は${name}`, HO.of(k) === name, String(HO.of(k))));
[
  ["2019-02-23", "2019年は天皇誕生日が無い"], ["2019-12-23", "2019年は12月23日も祝日でない"],
  ["2020-10-12", "2020年の10月の第2月曜は祝日でない（7月へ移った）"],
  ["2021-10-11", "2021年の10月の第2月曜も祝日でない"],
  ["2003-05-04", "2006年までは、日曜の5月4日は国民の休日にしない"],
  ["2026-10-09", "ふつうの日は null"], ["1999-01-01", "2000年より前は出さない"],
].forEach(([k, why]) => t.check(why, HO.of(k) === null, String(HO.of(k))));
t.check("日付でないものには何も言わない", HO.of("") === null && HO.of("x") === null);
t.check("春分の日・秋分の日は、節気の春分・秋分の初日と同じ日（2000〜2040年）", (() => {
  for (let y = 2000; y <= 2040; y++) {
    for (const [k, n] of HO.year(y)) {
      if (n !== "春分の日" && n !== "秋分の日") continue;
      const r = SE.of(k);
      if (r.sekki !== n.slice(0, 2) || r.part !== 0 || !r.first) return false;
    }
    const names = [...HO.year(y).values()];
    if (!names.includes("春分の日") || !names.includes("秋分の日")) return false;
  }
  return true;
})());

/* ---- 雑節・五節句 ---- */
[
  ["2026-02-03", "雑節", "節分"], ["2027-02-03", "雑節", "節分"],
  ["2026-03-17", "雑節", "彼岸の入り"], ["2026-03-23", "雑節", "彼岸明け"],
  ["2026-09-20", "雑節", "彼岸の入り"], ["2026-09-26", "雑節", "彼岸明け"],
  ["2027-03-18", "雑節", "彼岸の入り"], ["2027-03-24", "雑節", "彼岸明け"],
  ["2027-09-20", "雑節", "彼岸の入り"], ["2027-09-26", "雑節", "彼岸明け"],
  ["2026-05-02", "雑節", "八十八夜"], ["2027-05-02", "雑節", "八十八夜"],
  ["2026-09-01", "雑節", "二百十日"], ["2027-09-01", "雑節", "二百十日"],
  ["2026-01-07", "五節句", "人日（七草）"], ["2026-03-03", "五節句", "上巳（桃の節句）"],
  ["2026-05-05", "五節句", "端午"], ["2026-07-07", "五節句", "七夕"], ["2026-09-09", "五節句", "重陽（菊の節句）"],
].forEach(([k, a, b]) => {
  const z = SE.zassetsu(k);
  t.check(`${k} は${a}「${b}」`, !!z && z[0] === a && z[1] === b, JSON.stringify(z));
});
const FOUR = ["立春", "立夏", "立秋", "立冬"];
[2026, 2027].forEach((y) => {
  const hits = daysOf(y).map((k) => [k, SE.zassetsu(k)]).filter(([, z]) => z);
  const count = (v) => hits.filter(([, z]) => z[1] === v).length;
  t.check(`${y}年：節分・八十八夜・入梅・半夏生・二百十日は一度ずつ、彼岸は入りと明けが二度ずつ、土用の入りは四度、五節句は五つ`,
    count("節分") === 1 && count("八十八夜") === 1 && count("入梅") === 1 && count("半夏生") === 1
      && count("二百十日") === 1 && count("彼岸の入り") === 2 && count("彼岸明け") === 2
      && count("土用の入り") === 4 && hits.filter(([, z]) => z[0] === "五節句").length === 5,
    hits.map(([k, z]) => `${k}${z[1]}`).join(" "));
  const dayOf = (v) => (hits.find(([, z]) => z[1] === v) || [])[0];
  const nyubai = dayOf("入梅"), hange = dayOf("半夏生");
  t.check(`${y}年：入梅（${nyubai}）は芒種の次候「腐草為螢」の初日`,
    !!nyubai && SE.of(nyubai).kou === "腐草為螢" && SE.of(nyubai).first);
  t.check(`${y}年：半夏生（${hange}）は夏至の末候「半夏生」の初日`,
    !!hange && SE.of(hange).kou === "半夏生" && SE.of(hange).first);
  const doyo = hits.filter(([, z]) => z[1] === "土用の入り").map(([k]) => k);
  const ahead = doyo.map((k) => {
    for (let n = 17; n <= 19; n++) {
      const r = SE.of(shiftKey(k, n));
      if (FOUR.includes(r.sekki) && r.part === 0 && r.first) return r.sekki;
    }
    return null;
  });
  t.check(`${y}年：土用の入り（${doyo.join("・")}）は、立春・立夏・立秋・立冬の17〜19日前`,
    ahead.every(Boolean) && new Set(ahead).size === 4, ahead.join(","));
});
{
  const words = new Set();
  [2026, 2027].forEach((y) => daysOf(y).forEach((k) => { const z = SE.zassetsu(k); if (z) z.forEach((w) => words.add(w)); }));
  for (let y = 2000; y <= 2030; y++) HO.year(y).forEach((n) => words.add(n));
  words.add("祝日");
  const hits = FORBIDDEN.filter((w) => [...words].some((x) => x.includes(w)));
  t.check("雑節・五節句・祝日の字が daily の禁止語に当たらない", !hits.length, hits.join(","));
}
t.check("季節のひとこと：祝日は最後の一行・期間は無い",
  JSON.stringify(SE.rows("2026-09-22").slice(2)) === JSON.stringify([["祝日", "国民の休日", ""]]),
  JSON.stringify(SE.rows("2026-09-22")));
t.check("季節のひとこと：こどもの日は五節句「端午」と祝日の二行が足される",
  JSON.stringify(SE.rows("2026-05-05").slice(2)) === JSON.stringify([["五節句", "端午", ""], ["祝日", "こどもの日", ""]]),
  JSON.stringify(SE.rows("2026-05-05")));
t.check("季節のひとこと：ふつうの日は今までどおり二行", SE.rows("2026-10-08").length === 2,
  JSON.stringify(SE.rows("2026-10-08")));

(async () => {
  const { browser, page, errors } = await open();

  /* 暦：2025年5月（3日が土曜の憲法記念日、4日が日曜のみどりの日、6日が振替休日）。 */
  const cal = await page.evaluate(() => {
    const sec = document.createElement("section");
    sec.className = "cal";
    KN.calPeek.mount(sec);
    document.body.append(sec);
    KN.calGrid.fill(sec, { year: 2025, month: 4, mark: () => null });
    const at = (k) => sec.querySelector(`.cal-day[data-day="${k}"]`);
    const col = (k) => getComputedStyle(at(k).querySelector(".cal-n")).color;
    const r = {
      sat: at("2025-05-03").className, sun: at("2025-05-04").className, sub: at("2025-05-06").className,
      plain: at("2025-05-07").className, label: at("2025-05-03").getAttribute("aria-label"),
      plainLabel: at("2025-05-07").getAttribute("aria-label"),
      cSun: col("2025-05-11"), cSatHol: col("2025-05-03"), cSunHol: col("2025-05-04"), cSub: col("2025-05-06"),
      cPlain: col("2025-05-07"), cSat: col("2025-05-10"),
    };
    sec.remove();
    return r;
  });
  t.check("暦：祝日のマスに is-hol（土曜の祝日に is-sat は付けない）",
    /\bis-hol\b/.test(cal.sat) && !/\bis-sat\b/.test(cal.sat) && /\bis-hol\b/.test(cal.sun) && /\bis-hol\b/.test(cal.sub)
      && !/\bis-hol\b/.test(cal.plain), `${cal.sat} / ${cal.sun} / ${cal.sub} / ${cal.plain}`);
  t.check("暦：祝日の数字は日曜と同じ色（土曜の祝日・日曜の祝日・振替休日も）",
    cal.cSatHol === cal.cSun && cal.cSunHol === cal.cSun && cal.cSub === cal.cSun,
    `${cal.cSatHol} / ${cal.cSunHol} / ${cal.cSub} / 日曜 ${cal.cSun}`);
  t.check("暦：ふつうの日・土曜は日曜の色にしない", cal.cPlain !== cal.cSun && cal.cSat !== cal.cSun,
    `${cal.cPlain} / ${cal.cSat} / 日曜 ${cal.cSun}`);
  t.check("暦：読み上げに祝日の名前", cal.label === "5月3日 憲法記念日" && cal.plainLabel === "5月7日",
    `${cal.label} / ${cal.plainLabel}`);

  /* daily：季節のひとことに一行足される（過ぎた日で見る）。 */
  await page.evaluate(() => KN.store.update((s) => { s.settings.dailyScope = "day"; s.settings.showSeason = true; }));
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(400);
  const rowsAt = async (d) => {
    await page.evaluate((x) => KN.screens.archive.goDay(x), d);
    await page.waitForTimeout(450);
    return page.evaluate(() => [...document.querySelectorAll("#screen-archive .arc-log .arc-season-row")]
      .map((r) => r.textContent.replace(/\s+/g, "")));
  };
  const kokumin = await rowsAt("2026-09-22");
  t.check("daily：国民の休日は季節のひとことの最後に「祝日 国民の休日」",
    kokumin.length === 3 && kokumin[2] === "祝日国民の休日", kokumin.join(" | "));
  const kodomo = await rowsAt("2026-05-05");
  t.check("daily：こどもの日は「五節句 端午」と「祝日 こどもの日」",
    kodomo.length === 4 && kodomo[2] === "五節句端午" && kodomo[3] === "祝日こどもの日", kodomo.join(" | "));
  const higan = await rowsAt("2026-09-20");
  t.check("daily：彼岸の入りは「雑節 彼岸の入り」", higan.length === 3 && higan[2] === "雑節彼岸の入り", higan.join(" | "));
  const plain = await rowsAt("2026-10-08");
  t.check("daily：ふつうの日は二行のまま", plain.length === 2, plain.join(" | "));
  await rowsAt("2026-05-05");
  const text = await page.evaluate(() => document.getElementById("screen-archive").innerText);
  const hits = FORBIDDEN.filter((w) => text.includes(w));
  t.check("daily の画面に評価の言葉が出ない", !hits.length, hits.join(","));

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
