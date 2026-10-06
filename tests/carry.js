/* 段3：崩れたときの置き直し（docs/todo-timeline.md の「崩れたときの置き直し」・
   docs/todo-items.md の「期限切れは作らない」）。2026年9月29日。

   - store：くり返しでない用事が過ぎたら今日へ運ぶ（前のまま）。そのとき**時刻を
     外して**、印 `carried = { on: 今日, time: 元の時刻 }` を付ける。期限の過ぎた
     長期タスクにも印。ルーティン・買い物の一件には付けない。二日続けて運べば、
     最初の時刻を持ち続ける。
   - settleCarried：今日のどこか（今日のまま印だけ外す）・明日・今週（長期タスクに
     して期限を週の終わりへ。週末なら来週）・長期タスクへ（過ぎた期限は外す）・
     やめる（アーカイブ。消さない）。どれも元に戻せる。日か時刻を自分で直しても印は外れる。
   - 画面：今日の頭に「前の日から運んだもの · 置き直す」。押すと紙、選べば行が消え、
     片づけ終えたら紙が閉じ、頭の一行も消える。評価の言葉を出さない。

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
    S.rescheduleOverdue();
    const g = (id) => ({ ...S.getTodo(id) });
    const out = {
      today, a: g(a.id), b: g(b.id), c: g(c.id), r: g(r.id), f: g(f.id),
      list: S.carriedToday().map((x) => x.title).sort(),
    };
    // 二日続けて：昨日の印のまま、また過ぎた
    S.update((s) => { const x = s.todos.find((q) => q.id === a.id); x.due = y; x.carried = { on: y, time: "13:00" }; });
    S.rescheduleOverdue();
    out.a2 = g(a.id);
    // 何も動かさないときは書かない
    const before = JSON.stringify(S.get().todos);
    S.rescheduleOverdue();
    out.idle = JSON.stringify(S.get().todos) === before;
    return out;
  });
  t.check("過ぎた用事は今日へ（前のまま）", st.a.due === st.today && st.b.due === st.today);
  t.check("運んだら時刻を外す", st.a.time == null, JSON.stringify(st.a));
  t.check("外した時刻は印に控える", st.a.carried && st.a.carried.on === st.today && st.a.carried.time === "13:00");
  t.check("時刻の無いものは印の時刻が null", st.b.carried && st.b.carried.time === null);
  t.check("期限の過ぎた長期タスクも今日へ・印", st.c.due === st.today && st.c.carried && st.c.carried.on === st.today);
  t.check("ルーティンは印を付けず時刻も持ったまま", !st.r.carried && st.r.time === "08:00" && st.r.due === st.today);
  t.check("先の用事には触れない", !st.f.carried && st.f.time === "10:00");
  t.check("carriedToday は運んだ三件", JSON.stringify(st.list) === JSON.stringify(["書類", "申し込み", "病院"]), JSON.stringify(st.list));
  t.check("二日続けて運ぶと最初の時刻を持ち続ける", st.a2.carried.time === "13:00" && st.a2.carried.on === st.today && st.a2.time == null);
  t.check("何も動かさないときは書かない", st.idle);

  const se = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    const y = U.shiftDay(today, -1);
    const mk = (title, extra) => {
      const x = S.addTodo({ title, due: y, ...extra });
      return x.id;
    };
    S.update((s) => { s.todos = []; });
    const ids = {
      today: mk("今日"), tomorrow: mk("明日"), week: mk("今週"), someday: mk("長期"), stop: mk("やめる"),
      lapsed: S.addTodo({ title: "期限切れ長期", deadline: y }).id,
      edit: mk("直す", { time: "09:00" }),
    };
    S.rescheduleOverdue();
    const out = { day: today, wk: S.carryWeek(), n0: S.carriedToday().length };
    const undo = {};
    ["today", "tomorrow", "week", "someday", "stop"].forEach((k) => { undo[k] = S.settleCarried(ids[k], k); });
    undo.lapsed = S.settleCarried(ids.lapsed, "someday");
    const g = (id) => ({ ...S.getTodo(id) });
    Object.keys(ids).forEach((k) => { out[k] = g(ids[k]); });
    S.updateTodo(ids.edit, { time: "15:00" });
    out.edited = g(ids.edit);
    out.n1 = S.carriedToday().length;
    // 見回りが運び返さない
    S.rescheduleOverdue();
    out.lapsedAfter = g(ids.lapsed);
    out.somedayAfter = g(ids.someday);
    // 元に戻す
    undo.stop(); undo.week();
    out.stopBack = g(ids.stop);
    out.weekBack = g(ids.week);
    out.n2 = S.carriedToday().length;
    // 週の終わり
    const end = U.weekOf(today).to;
    out.weekOk = out.wk.next ? end <= U.shiftDay(today, 1) && out.wk.day === U.weekOf(U.shiftDay(end, 1)).to
      : out.wk.day === end && end > U.shiftDay(today, 1);
    return out;
  });
  t.check("置き直す前は七件", se.n0 === 7, String(se.n0));
  t.check("今日のどこか：今日のまま、印だけ外す", se.today.due === se.day && !se.today.carried && se.today.time == null);
  t.check("明日：やる日が明日", se.tomorrow.due > se.day && !se.tomorrow.carried);
  t.check("今週：長期タスク・期限は週の終わり", se.week.due == null && se.week.deadline === se.wk.day && !se.week.carried && se.weekOk,
    JSON.stringify({ deadline: se.week.deadline, wk: se.wk }));
  t.check("長期タスクへ：やる日を外す", se.someday.due == null && !se.someday.carried);
  t.check("やめる：アーカイブ（消さない）", se.stop.archived === true && se.stop.title === "やめる");
  t.check("過ぎた期限は外して長期タスクへ", se.lapsed.due == null && se.lapsed.deadline == null);
  t.check("見回りが運び返さない", se.lapsedAfter.due == null && se.somedayAfter.due == null);
  t.check("時刻を自分で決めたら印が外れる", !se.edited.carried && se.edited.time === "15:00");
  t.check("選んだぶん carriedToday から消える", se.n1 === 0, String(se.n1));
  t.check("元に戻す：やめる", !se.stopBack.archived && se.stopBack.carried && se.stopBack.due === se.day);
  t.check("元に戻す：今週", se.weekBack.due === se.day && se.weekBack.carried && !se.weekBack.deadline);
  t.check("戻したぶん carriedToday に戻る", se.n2 === 2, String(se.n2));

  /* ---- 画面 ---- */
  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const y = U.shiftDay(U.todayKey(), -1);
    S.update((s) => { s.todos = []; s.settings.todoTimeline = true; });
    S.addTodo({ title: "病院", due: y, time: "13:00" });
    S.addTodo({ title: "書類", due: y });
    S.rescheduleOverdue();
    KN.app.showScreen("todo");
  });
  await page.waitForTimeout(500);
  const bar = await page.evaluate(() => {
    const b = document.querySelector("#screen-todo .tl-carry");
    return b ? { text: b.textContent.replace(/\s+/g, " ").trim(), color: getComputedStyle(b).color } : null;
  });
  t.check("頭に「前の日から運んだもの」", bar && /2\s*前の日から運んだもの\s*置き直す/.test(bar.text), JSON.stringify(bar));
  const lateBar = await page.evaluate(() => !!document.querySelector("#screen-todo .tl-late:not(.tl-carry)"));
  t.check("期限切れの札は出ない（運んだので）", !lateBar);
  const roadStop = await page.evaluate(() => [...document.querySelectorAll("#screen-todo .day-road .road-marks button")]
    .some((b) => /13:00/.test(b.textContent) && /病院/.test(b.textContent)));
  t.check("道に「13:00 病院」の停留所が立たない", !roadStop);

  await page.click("#screen-todo .tl-carry");
  await page.waitForTimeout(500);
  const sheet = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".carry-row")];
    return {
      n: rows.length,
      labels: rows[0] ? [...rows[0].querySelectorAll(".js-carry")].map((b) => b.textContent.trim()) : [],
      was: [...document.querySelectorAll(".carry-was")].map((x) => x.textContent.trim()),
      text: (document.querySelector(".carry-list") || {}).textContent || "",
    };
  });
  t.check("紙に二件", sheet.n === 2, JSON.stringify(sheet));
  t.check("五つの選択肢", sheet.labels.length === 5 && sheet.labels[0] === "今日のどこか" && sheet.labels[1] === "明日"
    && /^(今週|来週)$/.test(sheet.labels[2]) && sheet.labels[3] === "これからへ" && sheet.labels[4] === "やめる", JSON.stringify(sheet.labels));
  t.check("外した時刻を「前は」で言う", JSON.stringify(sheet.was) === JSON.stringify(["前は 13:00"]), JSON.stringify(sheet.was));
  t.check("評価の言葉を出さない", !/できなかった|遅れ|失敗|未達|持ち越し|期限切れ/.test(sheet.text + bar.text));
  t.check("絵文字を出さない", !/\p{Extended_Pictographic}/u.test(sheet.text + bar.text));

  // 一件目「明日」、二件目「今日のどこか」。
  // 「明日」は行の写し（.carry-row のまま body に出る）が暦へ飛ぶので、紙の中だけを数える。
  await page.evaluate(() => document.querySelectorAll(".carry-row")[0].querySelector('.js-carry[data-key="tomorrow"]').click());
  await page.waitForTimeout(300);
  const mid = await page.evaluate(() => ({
    rows: document.querySelectorAll(".sheet.is-open .carry-row").length,
    toast: [...document.querySelectorAll(".toast")].map((x) => x.textContent).join(" "),
  }));
  t.check("選んだ行は消える", mid.rows === 1, JSON.stringify(mid));
  t.check("報せに「元に戻す」", /明日へ/.test(mid.toast) && /元に戻す/.test(mid.toast), mid.toast);
  await page.evaluate(() => document.querySelector('.carry-row .js-carry[data-key="today"]').click());
  await page.waitForTimeout(700);
  const end = await page.evaluate(() => ({
    rows: document.querySelectorAll(".carry-row").length,
    bar: !!document.querySelector("#screen-todo .tl-carry"),
    left: KN.store.carriedToday().length,
  }));
  t.check("片づけ終えたら紙が閉じる", end.rows === 0, JSON.stringify(end));
  t.check("頭の一行も消える", !end.bar && end.left === 0, JSON.stringify(end));

  /* ---- 同じ日に二回目に開く（読み直し）：印が reconcile を通って残る ----
     一回目に開いたとき運んで印が付き、二回目は due が今日なのでもう運ばない。
     印が読み直しで落ちると、頭の一行が黙って消える。 */
  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const y = U.shiftDay(U.todayKey(), -1);
    S.update((s) => { s.todos = []; s.settings.todoTimeline = true; });
    S.addTodo({ title: "病院", due: y, time: "13:00" });
    S.addTodo({ title: "書類", due: y });
    S.rescheduleOverdue();
    S.flush();
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(500);
  const again = await page.evaluate(() => {
    const b = document.querySelector("#screen-todo .tl-carry");
    const S = KN.store;
    return {
      bar: b ? b.textContent.replace(/\s+/g, " ").trim() : null,
      list: S.carriedToday().map((x) => x.title).sort(),
      was: (S.get().todos.find((x) => x.title === "病院") || {}).carried || null,
    };
  });
  t.check("二回目に開いても印が残る", JSON.stringify(again.list) === JSON.stringify(["書類", "病院"]), JSON.stringify(again));
  t.check("二回目に開いても「前は」の時刻が残る", again.was && again.was.time === "13:00", JSON.stringify(again.was));
  t.check("二回目に開いても頭の一行が出る", again.bar && /2\s*前の日から運んだもの\s*置き直す/.test(again.bar), JSON.stringify(again.bar));

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
