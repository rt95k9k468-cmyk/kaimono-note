/* 仕事の予定とやること・段1（docs/todo-items.md「仕事の予定とやること」の足す欄）。
   - reconcile：欄を持たない古い記録は形も変えない（null を足さない）。持つものは読み直しても残り、
     成り立たないもの（due より前の終わりの日・毎週でない◯週ごと・知らない種類）は落ちる。
   - 予定もやることも運ばない：過ぎた予定・やること（くり返さない）はその日のまま（決めごと1）、くり返す予定は次の日へ。
     時刻を過ぎた予定は置き直し（passedToday）に出ない。
   - ◯週ごと（隔週）と毎年：fallsOn と nextDue。今週の印は週が変われば外れたと読む（inWeek）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/work-plan-fields.js */
const { open, checker } = require("./lib");

const t = checker("work-plan-fields");

(async () => {
  const { browser, page, errors } = await open();

  const st = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    S.update((s) => { s.todos = []; });
    const today = U.todayKey();
    const out = {};
    const PLAN = ["kind", "side", "endDay", "repeatWeeks", "weekMark"];
    // 足さないときは欄が無い
    const plain = S.addTodo({ title: "ふつう", due: today });
    out.plainKeys = PLAN.filter((k) => k in S.getTodo(plain.id));
    // 予定もやることも運ばない／くり返す予定は次の日へ
    const ev = S.addTodo({ title: "会議", due: U.shiftDay(today, -2), time: "10:00", kind: "event", side: "work" });
    const task = S.addTodo({ title: "書類", due: U.shiftDay(today, -2) });
    const rep = S.addTodo({ title: "定例", due: U.shiftDay(today, -3), repeat: "daily", kind: "event" });
    S.rescheduleOverdue();
    out.evDue = S.getTodo(ev.id).due;
    out.evTime = S.getTodo(ev.id).time;
    out.evCarried = !!S.getTodo(ev.id).carried;
    out.taskDue = S.getTodo(task.id).due;
    out.taskWas = U.shiftDay(today, -2);
    out.today = today;
    out.repDue = S.getTodo(rep.id).due;
    // 時刻を過ぎた今日の予定は置き直しに出ない（00:00 の30分は、00:30 を過ぎればいつも過ぎている）
    const evToday = S.addTodo({ title: "朝会", due: today, time: "00:00", kind: "event" });
    const taskToday = S.addTodo({ title: "電話", due: today, time: "00:00" });
    const passed = S.passedToday().map((x) => x.id);
    out.passedEv = passed.includes(evToday.id);
    out.passedTask = passed.includes(taskToday.id);
    out.late = U.nowTime() >= "00:30";
    // 隔週（due の週から数える）
    const bi = { repeat: "weekly", repeatWeeks: 2, repeatDays: [], due: "2026-10-05", skipDays: [] };
    out.bi = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"].map((d) => S.fallsOn(bi, d));
    out.biNext = S.nextDue({ ...bi, due: "2030-01-07" });
    // 毎年。2月29日はうるう年まで飛ぶ
    const yr = { repeat: "yearly", due: "2026-03-10", skipDays: [] };
    out.yr = [S.fallsOn(yr, "2027-03-10"), S.fallsOn(yr, "2027-03-11"), S.fallsOn(yr, "2026-04-10")];
    out.yrNext = S.nextDue({ ...yr, due: "2030-03-10" });
    out.leapNext = S.nextDue({ ...yr, due: "2032-02-29" });
    // 今週の印
    out.inWeek = S.inWeek({ weekMark: today });
    out.lastWeek = S.inWeek({ weekMark: U.shiftDay(today, -14) });
    // updateTodo：入れ替え・成り立たなくなれば落ちる・null で欄ごと消える
    const w = S.addTodo({ title: "1on1", due: today, repeat: "weekly", repeatWeeks: 2, endDay: U.shiftDay(today, 1) });
    out.wAdd = [S.getTodo(w.id).repeatWeeks, S.getTodo(w.id).endDay];
    S.updateTodo(w.id, { repeat: "monthly" });
    out.wMonthly = "repeatWeeks" in S.getTodo(w.id);
    S.updateTodo(w.id, { kind: "event", side: "work", weekMark: today });
    S.updateTodo(w.id, { due: U.shiftDay(today, 3) });
    out.wEndGone = "endDay" in S.getTodo(w.id);
    S.updateTodo(w.id, { kind: null });
    const wt = S.getTodo(w.id);
    out.wAfter = ["kind" in wt, wt.side, wt.weekMark === today];
    return out;
  });
  t.check("足さなければ欄は無い", st.plainKeys.length === 0, st.plainKeys.join());
  t.check("過ぎた予定は運ばない（日も時刻もそのまま）", st.evDue === st.taskWas && st.evTime === "10:00" && !st.evCarried,
    JSON.stringify([st.evDue, st.evTime, st.evCarried]));
  t.check("過ぎたやることも運ばない（元の日のまま）", st.taskDue === st.taskWas, st.taskDue);
  t.check("くり返す予定は次の日へ（ルーティンと同じ）", st.repDue === st.today, st.repDue);
  if (st.late) {
    t.check("時刻を過ぎた予定は置き直しに出ない", !st.passedEv && st.passedTask, JSON.stringify([st.passedEv, st.passedTask]));
  }
  t.check("隔週は休みの週に立たない", JSON.stringify(st.bi) === "[true,false,true,false,true]", JSON.stringify(st.bi));
  t.check("隔週の次は二週あと", st.biNext === "2030-01-21", st.biNext);
  t.check("毎年は同じ月日だけ", JSON.stringify(st.yr) === "[true,false,false]", JSON.stringify(st.yr));
  t.check("毎年の次は一年あと", st.yrNext === "2031-03-10", st.yrNext);
  t.check("2月29日はうるう年まで飛ぶ", st.leapNext === "2036-02-29", st.leapNext);
  t.check("今週の印は今週だけ", st.inWeek && !st.lastWeek);
  t.check("addTodo が◯週ごと・終わりの日を持つ", st.wAdd[0] === 2 && !!st.wAdd[1], JSON.stringify(st.wAdd));
  t.check("毎週でなくなれば◯週ごとは落ちる", st.wMonthly === false);
  t.check("due が終わりの日を越えたら終わりの日は落ちる", st.wEndGone === false);
  t.check("kind を外すと欄ごと消え、ほかは残る", JSON.stringify(st.wAfter) === '[false,"work",true]', JSON.stringify(st.wAfter));

  /* ---- 読み込み（reconcile） ---- */
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    KN.store.flush();
    const raw = JSON.parse(localStorage.getItem("kaimono-note-v2"));
    const today = KN.util.todayKey();
    const next = KN.util.shiftDay(today, 2);
    raw.todos = [
      { id: "old", title: "古い", due: today, repeat: "weekly", repeatDays: [1] },
      { id: "neu", title: "新しい", due: today, repeat: "weekly", kind: "event", side: "work",
        endDay: next, repeatWeeks: 3, weekMark: today },
      { id: "bad", title: "崩れた", due: today, repeat: "monthly", kind: "meeting", side: "home",
        endDay: today, repeatWeeks: 2, weekMark: "先週" },
      { id: "yr", title: "誕生日", due: today, repeat: "yearly" },
    ];
    localStorage.setItem("kaimono-note-v2", JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const rc = await page.evaluate(() => {
    const PLAN = ["kind", "side", "endDay", "repeatWeeks", "weekMark"];
    const g = (id) => KN.store.getTodo(id);
    const pick = (t) => PLAN.filter((k) => k in t).map((k) => `${k}=${t[k]}`).join(" ");
    return { old: pick(g("old")), neu: pick(g("neu")), bad: pick(g("bad")), yr: g("yr").repeat, today: KN.util.todayKey() };
  });
  t.check("古い記録には欄を足さない", rc.old === "", rc.old);
  t.check("持つ欄は読み直しても残る", rc.neu.startsWith("kind=event side=work endDay=") && rc.neu.includes("repeatWeeks=3")
    && rc.neu.endsWith(`weekMark=${rc.today}`), rc.neu);
  t.check("成り立たない欄は落ちる", rc.bad === "", rc.bad);
  t.check("毎年は読み直しても毎年", rc.yr === "yearly", rc.yr);

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
