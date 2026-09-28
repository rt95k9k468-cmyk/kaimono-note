/* 済ませてから◯日のくり返し（docs/roadmap.md の R6）。

   前半は表：js/when-parse.js を node で読み、「◯日ごと」「◯週間ごと」「◯日に1回」を
   読む・「おき」「ごとの」「◯日ごと＋くっついた字」は読まない、を測る（誤読の表。
   決めた理由は docs/todo-items.md の「済ませてから◯日」）。
   後半は画面：
   - store：済ませると、**済ませた日（今日）から**◯日後に次が立つ。先の日を早めに
     済ませても今日から数え、跡も今日に付く。fallsOn は次の日（due）にだけ立つ。
     逃したら今日へ運ぶ。reconcile は古い記録をそのまま、知らない◯は 7 に。
   - 紙：くりかえしに「済ませてから」、◯の早見と −／＋、しまえば repeat "after"。
     題に「3日ごと」と打てば紙の側でも入る。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/repeat-after.js */
const path = require("path");
const { open, checker } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "util.js"));
require(path.join(__dirname, "..", "js", "when-parse.js"));
const W = global.KN.whenParse;

const t = checker("repeat-after");

/* ---- 表：読む言葉・読まない言葉 ----
   [打った字, 題, repeat, repeatEvery] 。repeat が "" なら読まない（題はそのまま）。 */
const TODAY = "2026-09-28";
const TABLE = [
  ["3日ごとに水やり", "水やり", "after", 3],
  ["水やり 3日ごと", "水やり", "after", 3],
  ["3日毎に水やり", "水やり", "after", 3],
  ["2週間ごと シーツを洗う", "シーツを洗う", "after", 14],
  ["シーツを洗う 2週間ごとに", "シーツを洗う", "after", 14],
  ["2週ごと 定例", "定例", "after", 14],
  ["1週間ごと 掃除", "掃除", "after", 7],
  ["10日に1回 排水口", "排水口", "after", 10],
  ["排水口の掃除 10日に一回", "排水口の掃除", "after", 10],
  ["1日ごと 日記", "日記", "daily", 0],                  // 1日ごとは毎日
  // 読まない
  ["10日おき 爪を切る", "10日おき 爪を切る", "", 0],      // 「おき」は隔日とも読める
  ["1日おきに薬", "1日おきに薬", "", 0],
  ["30日ごとチャレンジ", "30日ごとチャレンジ", "", 0],    // くっついた字は名前の一部
  ["3日ごとの記録をつける", "3日ごとの記録をつける", "", 0], // 「の」は中身の話かも
  ["日ごとに寒くなる", "日ごとに寒くなる", "", 0],        // 数が無い
  ["5分ごとに休憩", "5分ごとに休憩", "", 0],              // 日ではない
  ["2か月ごと 散髪", "2か月ごと 散髪", "", 0],            // 月は読まない
  ["400日ごと テスト", "400日ごと テスト", "", 0],        // 365日まで
  ["3日間ごとに", "3日間ごとに", "", 0],
  ["15日ごと", "15日ごと", "", 0],                        // 題が空になるなら取らない
  ["10日ごろ 病院", "10日ごろ 病院", "", 0],              // 前からの決めごとのまま
];
TABLE.forEach(([text, title, rep, every]) => {
  const r = W.parse(text, { today: TODAY });
  const ok = r.title === title && (r.repeat || "") === rep
    && (rep === "after" ? r.repeatEvery === every : !r.repeatEvery);
  t.check(`「${text}」→ ${rep ? `${rep}${every ? " " + every : ""}「${title}」` : "読まない"}`, ok,
    JSON.stringify({ title: r.title, repeat: r.repeat, every: r.repeatEvery, due: r.due }));
});
{
  const r = W.parse("明日 3日ごとに 水やり", { today: TODAY });
  t.check("日付といっしょにも読める（明日から3日ごと）",
    r.due === "2026-09-29" && r.repeat === "after" && r.repeatEvery === 3 && r.title === "水やり", JSON.stringify(r));
  t.check("describe は「済ませてから3日ごと」", W.describe(r).startsWith("済ませてから3日ごと"), W.describe(r));
}

(async () => {
  const { browser, page, errors } = await open();

  /* ---- store ---- */
  const st = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    S.update((s) => { s.todos = []; });
    const today = U.todayKey();
    const out = { today };
    // 今日の一件を済ませる → 今日から14日後。跡は今日。
    const a = S.addTodo({ title: "シーツ", due: today, repeat: "after", repeatEvery: 14 });
    out.addEvery = S.getTodo(a.id).repeatEvery;
    out.fallsToday = S.fallsOn(S.getTodo(a.id), today);
    out.fallsLater = [1, 7, 14, 28].some((n) => S.fallsOn(S.getTodo(a.id), U.shiftDay(today, n)));
    const r = S.toggleTodo(a.id);
    out.next = S.getTodo(a.id).due;
    out.repeated = r.repeated;
    const tr = S.get().todos.find((x) => x.trace && x.title === "シーツ");
    out.traceDay = tr && tr.due;
    out.traceRepeat = tr && (tr.repeat || null);
    out.traceEvery = tr && tr.repeatEvery;
    // 戻す
    r.undo();
    out.undone = S.getTodo(a.id).due === today && !S.get().todos.some((x) => x.trace);
    // 先の日（5日後）を早めに済ませる → 今日から数える。跡は今日。
    const b = S.addTodo({ title: "水やり", due: U.shiftDay(today, 5), repeat: "after", repeatEvery: 3 });
    S.toggleTodo(b.id);
    out.earlyNext = S.getTodo(b.id).due;
    const tb = S.get().todos.find((x) => x.trace && x.title === "水やり");
    out.earlyTrace = tb && tb.due;
    // 逃したら今日へ
    const c = S.addTodo({ title: "爪", due: U.shiftDay(today, -4), repeat: "after", repeatEvery: 10 });
    S.rescheduleOverdue();
    out.overdue = S.getTodo(c.id).due;
    // 種類を変えれば◯は落ちる・◯だけ直せる
    S.updateTodo(c.id, { repeatEvery: 21 });
    out.patched = S.getTodo(c.id).repeatEvery;
    S.updateTodo(c.id, { repeat: "weekly" });
    out.dropped = S.getTodo(c.id).repeatEvery;
    // 知らない◯は 7、暦どおりのくり返しは null
    const d = S.addTodo({ title: "変", due: today, repeat: "after", repeatEvery: "abc" });
    out.badEvery = S.getTodo(d.id).repeatEvery;
    const e = S.addTodo({ title: "毎日", due: today, repeat: "daily", repeatEvery: 5 });
    out.dailyEvery = S.getTodo(e.id).repeatEvery;
    return out;
  });
  const U = (n) => page.evaluate((k) => KN.util.shiftDay(KN.util.todayKey(), k), n);
  t.check("addTodo が◯を持つ", st.addEvery === 14);
  t.check("fallsOn は次の日（due）にだけ立つ", st.fallsToday && !st.fallsLater);
  t.check("済ませると、今日から14日後に次が立つ", st.repeated && st.next === await U(14), st.next);
  t.check("跡は今日に、くり返さない一件として", st.traceDay === st.today && st.traceRepeat === null && st.traceEvery === null,
    JSON.stringify([st.traceDay, st.traceRepeat, st.traceEvery]));
  t.check("元に戻すと、跡も消えて今日へ", st.undone);
  t.check("先の日を早めに済ませても、今日から数える", st.earlyNext === await U(3), st.earlyNext);
  t.check("早めに済ませた跡は今日に付く", st.earlyTrace === st.today, st.earlyTrace);
  t.check("逃したら今日へ運ぶ", st.overdue === st.today, st.overdue);
  t.check("◯だけ直せる", st.patched === 21);
  t.check("ほかの種類に変えると◯は落ちる", st.dropped === null);
  t.check("知らない◯は 7", st.badEvery === 7);
  t.check("暦どおりのくり返しは◯を持たない", st.dailyEvery === null);

  /* ---- 読み込み（reconcile）：古い記録はそのまま、新しい欄は残る ---- */
  /* 書きかけの保存を先に出してから（tests/README.md の「試験の罠」）。 */
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    KN.store.flush();
    const raw = JSON.parse(localStorage.getItem("kaimono-note-v2"));
    const today = KN.util.todayKey();
    raw.todos = [
      { id: "old-1", title: "古い毎週", due: today, repeat: "weekly", repeatDays: [1] },
      { id: "new-1", title: "新しい", due: today, repeat: "after", repeatEvery: 30 },
      { id: "new-2", title: "◯なし", due: today, repeat: "after" },
      { id: "bad-1", title: "知らない種類", due: today, repeat: "yearly", repeatEvery: 3 },
    ];
    localStorage.setItem("kaimono-note-v2", JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const rc = await page.evaluate(() => {
    const g = (id) => KN.store.getTodo(id);
    return {
      old: [g("old-1").repeat, g("old-1").repeatEvery, g("old-1").repeatDays.join()],
      neu: [g("new-1").repeat, g("new-1").repeatEvery],
      none: [g("new-2").repeat, g("new-2").repeatEvery],
      bad: [g("bad-1").repeat, g("bad-1").repeatEvery],
    };
  });
  t.check("古い毎週はそのまま（◯は null）", JSON.stringify(rc.old) === '["weekly",null,"1"]', JSON.stringify(rc.old));
  t.check("済ませてから30日は読み直しても残る", JSON.stringify(rc.neu) === '["after",30]', JSON.stringify(rc.neu));
  t.check("◯の無い after は 7", JSON.stringify(rc.none) === '["after",7]', JSON.stringify(rc.none));
  t.check("知らない種類はくり返さないに", JSON.stringify(rc.bad) === "[null,null]", JSON.stringify(rc.bad));

  /* ---- 紙：くりかえしで「済ませてから」を選び、14日にしてしまう ---- */
  await page.evaluate(() => {
    KN.store.update((s) => { s.todos = []; });
    KN.app.showScreen("todo");
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('button[aria-label="やることを追加"]').click());
  await page.waitForSelector(".js-title");
  await page.waitForTimeout(300);
  await page.fill(".js-title", "シーツを洗う");
  await page.evaluate(() => document.querySelector(".js-row-repeat").click());
  await page.waitForTimeout(300);
  const labels = await page.evaluate(() => [...document.querySelectorAll(".js-repeat button")].map((b) => b.textContent.trim()));
  t.check("くりかえしに「済ませてから」がある", labels.includes("済ませてから"), labels.join(","));
  await page.evaluate(() => [...document.querySelectorAll(".js-repeat button")].find((b) => b.textContent.trim() === "済ませてから").click());
  await page.waitForTimeout(200);
  const det = await page.evaluate(() => ({
    chips: [...document.querySelectorAll(".js-every [data-every]")].map((b) => b.textContent.trim()).join(","),
    on: (document.querySelector(".js-every .is-on") || {}).textContent,
    hint: document.querySelector(".js-repeat-hint").textContent,
    hintShown: !document.querySelector(".js-repeat-hint").hidden,
    input: !!document.querySelector(".js-repeat-detail input"),
  }));
  t.check("◯の早見が出る（既定は7日）", det.chips === "3日,7日,10日,14日,30日,60日,90日" && det.on && det.on.trim() === "7日", JSON.stringify(det));
  t.check("打ちこむ欄は置かない", !det.input);
  t.check("ヒントが「済ませた日から7日後に」", det.hintShown && det.hint.includes("済ませた日から7日後"), det.hint);
  await page.click('.js-every [data-every="14"]');
  await page.click(".js-every-plus");
  await page.click(".js-every-minus");
  await page.waitForTimeout(100);
  const after14 = await page.evaluate(() => ({
    on: document.querySelector(".js-every .is-on").textContent.trim(),
    row: document.querySelector(".js-row-repeat").textContent.replace(/\s+/g, " ").trim(),
  }));
  t.check("14日を選び、＋−で戻る", after14.on === "14日", after14.on);
  t.check("詳細の行に「済ませてから 14日ごと」", after14.row.includes("済ませてから") && after14.row.includes("14日ごと"), after14.row);
  await page.evaluate(() => document.querySelector(".js-save").click());
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => {
    const x = KN.store.get().todos.find((y) => y.title === "シーツを洗う");
    return x && { repeat: x.repeat, every: x.repeatEvery };
  });
  t.check("しまえば repeat after・14", saved && saved.repeat === "after" && saved.every === 14, JSON.stringify(saved));

  /* 題に「3日ごと」と打つ → 紙の側でも読む。 */
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('button[aria-label="やることを追加"]').click());
  await page.waitForSelector(".js-title");
  await page.waitForTimeout(300);
  await page.fill(".js-title", "水やり 3日ごと");
  await page.evaluate(() => document.querySelector(".js-save").click());
  await page.waitForTimeout(400);
  const typed = await page.evaluate(() => {
    const x = KN.store.get().todos.find((y) => y.title === "水やり");
    return x && { repeat: x.repeat, every: x.repeatEvery };
  });
  t.check("題の「3日ごと」から after・3 が入る", typed && typed.repeat === "after" && typed.every === 3, JSON.stringify(typed));

  t.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
