/* daily（日記）は評価しない——その見張り。

   CLAUDE.md の「最優先の約束事」と docs/daily.md。目標・連続記録・月比較・
   達成率・空白日の警告色を、画面にも器（store）にも持たない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/daily-rules.js */
const { open, checker } = require("./lib");

/* 画面に出てはいけない言葉。日記の本文は試験用の無難な字だけにしてあるので、
   ここに掛かるのはアプリが出した字だけ。 */
const FORBIDDEN = [
  "目標", "連続", "達成", "割合", "先月", "前月", "平均", "記録更新", "ストリーク",
  "サボ", "がんば", "頑張", "未記入", "書いていない", "空白", "できなかった",
];

(async () => {
  const t = checker("daily-rules");
  const { browser, page, errors } = await open();

  /* 材料：先月は10日書いた、今月は昨日だけ書いた、今日は何も書いていない。
     やることを一つ今日済ませる（まとめに数が出るように）。
     月の頭の日に走らせても「昨日」が今月に入るよう、昨日が先月なら今日を使わず
     一昨日…ではなく、単に先月へ落ちるのを許す（下の試験はどちらでも通る）。 */
  const days = await page.evaluate(() => {
    const U = KN.util, S = KN.store;
    const today = U.todayKey();
    const base = U.dayDate(today);
    const key = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const yest = key(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1));
    for (let d = 1; d <= 10; d++) {
      S.setDayLog(key(new Date(base.getFullYear(), base.getMonth() - 1, d)), { memo: "試験の一行" });
    }
    S.setDayLog(yest, { memo: "試験の一行" });
    const todo = S.addTodo({ title: "試験のやること", due: today });
    if (todo) S.toggleTodo(todo.id);
    KN.app.showScreen("archive");
    return { today, yest, ym: today.slice(0, 7) };
  });
  await page.waitForTimeout(400);

  /* ---- 器：評価のための入れ物を持っていない ---- */
  const shape = await page.evaluate((ym) => {
    const s = KN.store.get();
    const dg = KN.store.monthDigest(ym);
    return {
      archive: Object.keys(s.archive).sort(),
      digest: Object.keys(dg).sort(),
      bySrc: Object.keys(dg.bySrc).sort(),
      settings: Object.keys(s.settings),
    };
  }, days.ym);
  t.check("archive の器は entries と days だけ",
    JSON.stringify(shape.archive) === JSON.stringify(["days", "entries"]), shape.archive.join(","));
  t.check("monthDigest は daysWith・bySrc・total だけ（割合・連続・比較を持たない）",
    JSON.stringify(shape.digest) === JSON.stringify(["bySrc", "daysWith", "total"]), shape.digest.join(","));
  t.check("monthDigest.bySrc は todo・entry・item だけ",
    JSON.stringify(shape.bySrc) === JSON.stringify(["entry", "item", "todo"]), shape.bySrc.join(","));
  const bad = shape.settings.filter((k) => /streak|goal|target|rate|compare/i.test(k));
  t.check("設定に daily の目標・連続・比較の鍵が無い", !bad.length, bad.join(","));

  /* ---- 画面：一日ぶん（既定）で、今日は空 ---- */
  const scr = await page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const log = root.querySelector(".arc-log");
    const dg = root.querySelector(".arc-counts");
    const blank = root.querySelector(".arc-log-row.is-today .arc-log-memo");
    const row = blank && blank.closest(".arc-log-row");
    const probe = document.createElement("span");
    probe.style.color = "var(--c-text-3)";
    root.append(probe);
    const text3 = getComputedStyle(probe).color;
    probe.remove();
    return {
      visible: !root.hidden,
      text: root.innerText,
      hasLog: !!log,
      hasDigest: !!dg,
      digestNextToLog: !!(dg && log && (log.nextElementSibling === dg || log.previousElementSibling === dg)),
      digestInsideLog: !!(dg && log && log.contains(dg)),
      blankText: blank ? blank.textContent.trim() : null,
      blankIsBlank: !!(blank && blank.classList.contains("is-blank")),
      blankColor: blank ? getComputedStyle(blank).color : null,
      text3,
      blankTimes: !!(row && row.querySelector(".arc-log-times, .arc-log-meta")),
    };
  });
  t.check("daily の画面が出ている", scr.visible && scr.hasLog);
  const hits = FORBIDDEN.filter((w) => scr.text.includes(w));
  t.check("評価の言葉が出ない（先月に10日・今月に1日でも比べない）", !hits.length, hits.join(","));
  t.check("割合（%）が出ない", !/\d\s*[%％]/.test(scr.text));
  t.check("月のまとめは出ている", scr.hasDigest);
  t.check("まとめは Daily Log のすぐ隣（日の間に挟まない）", scr.digestNextToLog && !scr.digestInsideLog);
  t.check("今日の空の一行は「この日のことを書く」", scr.blankText === "この日のことを書く", scr.blankText);
  t.check("空の一行は薄い字（is-blank ＝ --c-text-3）で、責める色を当てない",
    scr.blankIsBlank && scr.blankColor === scr.text3, `${scr.blankColor} / ${scr.text3}`);
  t.check("空の日は起床・就寝も帳簿も出さない", !scr.blankTimes);

  /* ---- まとめを上に置いても、Daily Log の隣 ---- */
  await page.evaluate(() => KN.store.update((s) => { s.settings.digestPos = "top"; }));
  await page.waitForTimeout(300);
  const top = await page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const log = root.querySelector(".arc-log"), dg = root.querySelector(".arc-counts");
    return !!(dg && log && log.previousElementSibling === dg);
  });
  t.check("まとめを上にすると Daily Log のすぐ上", top);

  /* ---- 月ぜんぶ：書いていない日を並べない。開いて閉じただけの日は「—」 ---- */
  await page.evaluate((d) => {
    KN.store.ensureDayLog(d.today);   // 紙を開いて何も書かずに閉じた跡
    KN.store.update((s) => { s.settings.dailyScope = "month"; s.settings.digestPos = "bottom"; });
  }, days);
  await page.waitForTimeout(300);
  const month = await page.evaluate((d) => {
    const root = document.getElementById("screen-archive");
    const rows = [...root.querySelectorAll(".arc-log-row")].map((r) => r.dataset.day);
    const todayMemo = root.querySelector(`.arc-log-row[data-day="${d.today}"] .arc-log-memo`);
    const want = KN.store.daysOfMonth(d.ym).map((x) => x.date);
    return {
      rows, want, text: root.innerText,
      todayText: todayMemo ? todayMemo.textContent.trim() : null,
    };
  }, days);
  t.check("月ぜんぶでも、行は記録のある日だけ（書かなかった日の一覧を作らない）",
    JSON.stringify([...month.rows].sort()) === JSON.stringify([...month.want].sort()),
    `${month.rows.length} 行 / 記録 ${month.want.length} 日`);
  t.check("月ぜんぶの空の一行は「—」（同じ字を並べない）", month.todayText === "—", month.todayText);
  const hits2 = FORBIDDEN.filter((w) => month.text.includes(w));
  t.check("月ぜんぶでも評価の言葉が出ない", !hits2.length, hits2.join(","));

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
