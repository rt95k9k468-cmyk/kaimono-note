/* 段5：その日のうちの置き直し（docs/todo-timeline.md の「その日のうちの置き直し」）。
   2026年9月29日。時計を 11:10 に止めて：

   - store：passedToday は、今日・時刻あり・まだ・くり返しでないもので、終わり（長さが
     無ければ30分後）を過ぎたものだけ。いま中に居るもの・時刻なし・済んだもの・
     ルーティン・先の日は入らない。時刻の早い順。
   - settlePassed の五つ（いまから・時刻を外す・明日（時刻も外す）・長期タスクへ・
     やめる＝アーカイブ）と元に戻す。
   - 画面：頭に「1 時刻を過ぎたもの · 置き直す」。押すと紙に「10:00 の予定」と五択、
     入力欄なし。「いまから（11:15）」で時刻が付き、行も頭の一行も消え、報せの
     元に戻すで戻る。見ているあいだに時刻が過ぎれば、30秒の見回りで一行が出る。
   - 評価の言葉・絵文字を出さない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/passed.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("passed");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 11, 10)); },
  });

  /* ---- store ---- */
  const st = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    S.update((s) => { s.todos = []; });
    const add = (title, extra) => S.addTodo({ title, due: today, ...extra }).id;
    add("書類整理", { time: "10:00" });                  // 10:30 に終わり → 過ぎた
    add("電話", { time: "09:00", minutes: 45 });         // 9:45 に終わり → 過ぎた
    add("病院", { time: "10:30", minutes: 60 });         // 11:30 まで → 中に居る
    add("買い物", { time: "10:50" });                    // 11:20 まで → まだ
    add("メール");                                       // 時刻なし
    add("薬", { time: "08:00", repeat: "daily" });       // ルーティン
    const done = add("手紙", { time: "08:30" });
    S.update((s) => { const x = s.todos.find((q) => q.id === done); x.done = true; x.doneAt = new Date().toISOString(); });
    S.addTodo({ title: "先の用事", due: U.shiftDay(today, 1), time: "09:00" });
    return { list: S.passedToday().map((x) => x.title) };
  });
  t.check("過ぎたのは、終わりを過ぎた二件だけ（時刻の早い順）",
    JSON.stringify(st.list) === JSON.stringify(["電話", "書類整理"]), JSON.stringify(st.list));

  const se = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    S.update((s) => { s.todos = []; });
    const mk = (title, extra) => S.addTodo({ title, due: today, time: "09:00", ...extra }).id;
    const ids = { now: mk("いま"), loose: mk("外す"), tomorrow: mk("明日"), someday: mk("長期", { deadline: U.shiftDay(today, -2) }), stop: mk("やめる") };
    const before = JSON.stringify(S.get().todos);
    const undo = {};
    undo.now = S.settlePassed(ids.now, "now", "11:15");
    ["loose", "tomorrow", "someday", "stop"].forEach((k) => { undo[k] = S.settlePassed(ids[k], k); });
    const g = (id) => ({ ...S.getTodo(id) });
    const out = { today, left: S.passedToday().length };
    Object.keys(ids).forEach((k) => { out[k] = g(ids[k]); });
    Object.keys(undo).reverse().forEach((k) => undo[k]());
    out.undone = JSON.stringify(S.get().todos) === before;
    return out;
  });
  t.check("いまから：時刻が 11:15 に、やる日は今日のまま", se.now.time === "11:15" && se.now.due === se.today, JSON.stringify(se.now));
  t.check("時刻を外す：今日のまま時刻なし（連れ）", se.loose.time == null && se.loose.due === se.today, JSON.stringify(se.loose));
  t.check("明日：やる日を明日にして、時刻も外す", se.tomorrow.due > se.today && se.tomorrow.time == null, JSON.stringify(se.tomorrow));
  t.check("長期タスクへ：やる日を外し、過ぎた期限も外す", !se.someday.due && !se.someday.time && !se.someday.deadline, JSON.stringify(se.someday));
  t.check("やめる：アーカイブ（消さない）", se.stop.archived === true, JSON.stringify(se.stop));
  t.check("選び直すと、もう過ぎたものに数えない", se.left === 0, String(se.left));
  t.check("どれも元に戻せる", se.undone);

  /* ---- 画面：頭の一行は出さない ---- */
  await page.evaluate(() => {
    const S = KN.store, today = KN.util.todayKey();
    S.update((s) => { s.todos = []; });
    S.addTodo({ title: "書類整理", due: today, time: "10:00" });
  });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  t.check("時刻を過ぎたものの札は出ない", await page.evaluate(() => !document.querySelector("#screen-todo .tl-passed")));

  t.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
