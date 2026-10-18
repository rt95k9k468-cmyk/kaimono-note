/* 元の場所へ戻るだけ（docs/todo-items.md の X25〜X30 の決めごと1・「期限切れは作らない」。2026年10月18日）。
   前は 段3（9月29日）で、過ぎた用事を今日へ運び、時刻を外して印 `carried` を付けていた。

   - store：くり返しでない用事・期限の過ぎた長期タスクは**書き換えない**（日も時刻も、印も控えも足さない）。
     ルーティンだけ次に当たる日へ（時刻は持ったまま）。何も動かさないときは書かない。
   - 前の版が付けた印 `carried` は消さない。settleCarried は印の付いた記録をいままでどおり選び直せる。
   - 数（todosDue＝バッジ）は過ぎた日のものを数えない。
   - 画面：頭に札を出さない。昨日の用事は道に立たない。週の面では、今週の過ぎた日のものは今週に、
     先週より前のものはこれからに。七日の行の過ぎた日にはやることを出さない。過ぎた買い物の一件はどこにも出さない。
   - 形の崩れた印は読み直しで落とす。印の無い記録に欄を足さない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/carry.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("carry");
  const { browser, page, errors } = await open();

  /* ---- store ---- */
  const st = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    const y = U.shiftDay(today, -1);
    S.update((s) => { s.todos = []; });
    const a = S.addTodo({ title: "病院", due: y, time: "13:00" });
    const b = S.addTodo({ title: "書類", due: y });
    const c = S.addTodo({ title: "申し込み", deadline: y });
    const r = S.addTodo({ title: "薬", due: y, time: "08:00", repeat: "daily" });
    const f = S.addTodo({ title: "先の用事", due: U.shiftDay(today, 2), time: "10:00" });
    const sh = S.addTodo({ title: "買い物へ行く", due: y, shop: true });
    const before = JSON.stringify(S.get().todos.filter((x) => x.id !== r.id));
    S.rescheduleOverdue();
    const g = (id) => ({ ...S.getTodo(id) });
    const out = {
      today, y, a: g(a.id), b: g(b.id), c: g(c.id), r: g(r.id), f: g(f.id), sh: g(sh.id),
      untouched: JSON.stringify(S.get().todos.filter((x) => x.id !== r.id)) === before,
      list: S.carriedToday().length,
      due: S.todosDue().map((x) => x.title),
    };
    // 何も動かさないときは書かない
    const all = JSON.stringify(S.get().todos);
    S.rescheduleOverdue();
    out.idle = JSON.stringify(S.get().todos) === all;
    return out;
  });
  t.check("過ぎた用事は元の日のまま（時刻も）", st.a.due === st.y && st.a.time === "13:00" && st.b.due === st.y, JSON.stringify(st.a));
  t.check("印も控えも足さない", !st.a.carried && !st.b.carried && !(st.a.slips || []).length && st.list === 0);
  t.check("期限の過ぎた長期タスクも動かさない", !st.c.due && st.c.deadline === st.y && !st.c.carried);
  t.check("過ぎた買い物の一件も動かさない", st.sh.due === st.y);
  t.check("ほかの記録は一字も変わらない", st.untouched);
  t.check("ルーティンは次の日へ・時刻は持ったまま", st.r.due === st.today && st.r.time === "08:00" && !st.r.carried);
  t.check("先の用事には触れない", st.f.due !== st.today && st.f.time === "10:00");
  t.check("過ぎた日のものはバッジに数えない", !st.due.some((n) => /病院|書類|申し込み|買い物/.test(n)), JSON.stringify(st.due));
  t.check("何も動かさないときは書かない", st.idle);

  /* ---- 前の版が付けた印：消さず、選び直せる ---- */
  const se = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    S.update((s) => { s.todos = []; });
    const mk = (title) => S.addTodo({ title, due: today }).id;
    const ids = { today: mk("今日"), tomorrow: mk("明日"), week: mk("今週"), keep: mk("残す") };
    S.update((s) => s.todos.forEach((x) => { x.carried = { on: today, time: "09:00" }; }));
    S.rescheduleOverdue();
    const out = { day: today, wk: S.carryWeek(), n0: S.carriedToday().length };
    const undo = {};
    ["today", "tomorrow", "week"].forEach((k) => { undo[k] = S.settleCarried(ids[k], k); });
    const g = (id) => ({ ...S.getTodo(id) });
    Object.keys(ids).forEach((k) => { out[k] = g(ids[k]); });
    undo.week();
    out.weekBack = g(ids.week);
    return out;
  });
  t.check("前の版の印は残る", se.n0 === 4 && se.keep.carried && se.keep.carried.time === "09:00", JSON.stringify(se.keep));
  t.check("今日のどこか：今日のまま、印だけ外す", se.today.due === se.day && !se.today.carried);
  t.check("明日：やる日が明日", se.tomorrow.due > se.day && !se.tomorrow.carried);
  t.check("今週：長期タスク・期限は週の終わり", se.week.due == null && se.week.deadline === se.wk.day && !se.week.carried);
  t.check("元に戻す：今週", se.weekBack.due === se.day && se.weekBack.carried && !se.weekBack.deadline);

  /* ---- 画面 ---- */
  const scr = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    const y = U.shiftDay(today, -1);
    const w = U.weekOf(today);
    const old = U.shiftDay(w.from, -3);
    S.update((s) => { s.todos = []; s.settings.todoTimeline = true; });
    S.addTodo({ title: "病院", due: y, time: "13:00" });
    S.addTodo({ title: "先週の書類", due: old });
    S.addTodo({ title: "買い物へ行く", due: y, shop: true });
    S.rescheduleOverdue();
    return { y, sameWeek: y >= w.from };
  });
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('.wk-faces .seg-btn[data-face="week"]');
    if (b && b.getAttribute("aria-pressed") !== "true") b.click(); });
  await page.waitForTimeout(400);
  const later = await page.$(".wk-later-h");
  if (later && (await later.getAttribute("aria-expanded")) !== "true") { await later.click(); await page.waitForTimeout(300); }
  const wk = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const names = (sel) => [...scr.querySelectorAll(sel)].map((e) => e.textContent.trim());
    return {
      late: scr.querySelectorAll(".tl-late").length,
      week: names(".wk > .wk-list .wk-row .wk-name"),
      later: names(".wk-later .wk-row .wk-name"),
      evs: names(".wk-evs .wk-n"),
      all: names(".wk .js-open"),
    };
  });
  t.check("頭に札は出ない", wk.late === 0);
  t.check(scr.sameWeek ? "昨日の用事は今週に" : "昨日の用事は（週の頭なので）これからに",
    scr.sameWeek ? wk.week.includes("病院") : wk.later.includes("病院"), JSON.stringify(wk));
  t.check("先週より前のものはこれからに", wk.later.includes("先週の書類"), JSON.stringify(wk.later));
  t.check("七日の行の過ぎた日にやることを出さない", !wk.evs.some((n) => /病院|書類/.test(n)), JSON.stringify(wk.evs));
  t.check("過ぎた買い物の一件はどこにも出さない", !wk.all.some((n) => /買い物へ行く/.test(n)), JSON.stringify(wk.all));
  await page.evaluate(() => { const b = document.querySelector('.wk-faces .seg-btn[data-face="today"]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  const day = await page.evaluate(() => ({
    late: document.querySelectorAll("#screen-todo .tl-late").length,
    stop: [...document.querySelectorAll("#screen-todo .day-road .road-marks button")].some((b) => /病院/.test(b.textContent)),
  }));
  t.check("今日の面にも札は出ない・昨日の用事は道に立たない", day.late === 0 && !day.stop, JSON.stringify(day));

  /* 形の崩れた印は落とす。印の無い記録に欄を足さない（既存の記録は書き換えない）。 */
  await page.evaluate(() => {
    const K = "kaimono-note-v2";
    const s = JSON.parse(localStorage.getItem(K));
    const today = KN.util.todayKey();
    const base = { due: today, done: false, archived: false, createdAt: today };
    s.todos = [
      { ...base, id: "c1", title: "よい印", carried: { on: today, time: "09:30" }, order: 0 },
      { ...base, id: "c2", title: "時刻なしの印", carried: { on: today, time: null }, order: 1 },
      { ...base, id: "c3", title: "日の崩れた印", carried: { on: "昨日", time: "09:30" }, order: 2 },
      { ...base, id: "c4", title: "文字の印", carried: "yes", order: 3 },
      { ...base, id: "c5", title: "時刻の崩れた印", carried: { on: today, time: "25時" }, order: 4 },
      { ...base, id: "c6", title: "印なし", order: 5 },
    ];
    delete s.lsSeq;
    localStorage.setItem(K, JSON.stringify(s));
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store);
  await page.waitForTimeout(300);
  const shape = await page.evaluate(() => {
    const o = {};
    KN.store.get().todos.forEach((x) => { o[x.id] = "carried" in x ? x.carried : "(なし)"; });
    return { o, today: KN.util.todayKey() };
  });
  const c = shape.o;
  t.check("形の正しい印は残る", c.c1 && c.c1.on === shape.today && c.c1.time === "09:30" && c.c2 && c.c2.time === null, JSON.stringify(c));
  t.check("日の崩れた・文字の印は落とす", c.c3 === "(なし)" && c.c4 === "(なし)", JSON.stringify(c));
  t.check("時刻だけ崩れた印は時刻を null に", c.c5 && c.c5.on === shape.today && c.c5.time === null, JSON.stringify(c.c5));
  t.check("印の無い記録に欄を足さない", c.c6 === "(なし)", JSON.stringify(c.c6));

  t.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
