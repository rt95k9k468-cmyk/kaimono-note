/* 仕事の予定とやること・段3（docs/todo-items.md「仕事の予定とやること」）。

   やることの紙の頭に「今日｜週」。開いたときは週。週の面は上の暦が見ている週の中身で、
   期限（今週と過ぎたもの・赤くしない）→ 今週（今週の印・5行まで・ほかは畳む）→ 七日の行
   （予定とやることの時刻と名前・またがる予定は帯・毎日のくり返しは出さない・過ぎた日は予定だけ薄く）。
   席をもう一度押しても行き来。日を押せばその日の面。払えば次の週。頭の札（期限切れほか）は今日の面だけ。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/work-week-face.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("work-week-face");
  const { browser, ctx, page, errors } = await open({
    weekFirst: true,
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); },   // 水曜
  });
  const W = await page.evaluate(() => {
    const U = KN.util, S = KN.store, w = U.weekOf("2026-10-21");
    const at = (k) => w.from <= k && k <= w.to;
    S.addTodo({ title: "打ち合わせ", due: "2026-10-19", time: "15:00", kind: "event", side: "work" });
    S.addTodo({ title: "定例", due: "2026-10-22", time: "09:30", repeat: "weekly", kind: "event", side: "work" });
    S.addTodo({ title: "出張", due: "2026-10-22", endDay: "2026-10-23", kind: "event", side: "work" });
    S.addTodo({ title: "電球を替える", due: "2026-10-22" });
    S.addTodo({ title: "朝の体操", due: "2026-10-21", repeat: "daily" });
    S.addTodo({ title: "経費の精算", deadline: "2026-10-23", side: "work" });
    S.addTodo({ title: "昨日の用事", due: "2026-10-20" });
    for (let i = 1; i <= 7; i++) S.addTodo({ title: "今週の" + i, weekMark: "2026-10-21" });
    return { from: w.from, to: w.to, inWeek: at("2026-10-19") && at("2026-10-23") };
  });
  await page.waitForTimeout(400);
  const look = () => page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const wk = scr.querySelector(".wk");
    const txt = (s) => [...scr.querySelectorAll(s)].map((e) => e.textContent.trim());
    return {
      pressed: (scr.querySelector('.wk-faces .seg-btn[aria-pressed="true"]') || {}).textContent,
      week: wk ? wk.dataset.week : null,
      heads: txt(".wk-h"),
      rows: txt(".wk-row .wk-name"),
      facts: txt(".wk-row .wk-fact"),
      more: txt(".wk-more"),
      days: scr.querySelectorAll(".wk-day").length,
      evs: [...scr.querySelectorAll(".wk-evs")].map((e) => ({ day: e.dataset.day, past: e.classList.contains("is-past"),
        names: [...e.querySelectorAll(".wk-n")].map((n) => n.textContent) })),
      bands: [...scr.querySelectorAll(".wk-band")].map((b) => ({ t: b.getAttribute("aria-label"), row: b.style.gridRow })),
      road: !!scr.querySelector(".todo-day"),
      dayOf: (scr.querySelector(".todo-day") || {}).dataset ? scr.querySelector(".todo-day")?.dataset.day : null,
      late: scr.querySelectorAll(".tl-late").length,
      red: [...scr.querySelectorAll(".wk")].some((w) => w.querySelector(".is-late")),
    };
  });

  let a = await look();
  c.check("開いたときは週", a.pressed === "週" && !!a.week && !a.road, JSON.stringify(a));
  c.check("見出しは 期限 → 今週（数は出さない）", JSON.stringify(a.heads) === JSON.stringify(["期限", "今週"]), JSON.stringify(a.heads));
  c.check("期限は日まで（赤くしない）", a.rows[0] === "経費の精算" && /23日（金）まで/.test(a.facts[0]) && !a.red, JSON.stringify(a.facts));
  c.check("今週は5行まで・ほかは畳む", a.rows.length === 6 && a.more[0] === "ほか 2", JSON.stringify([a.rows, a.more]));
  c.check("七日の行", a.days === 7);
  const ev = (k) => (a.evs.find((e) => e.day === k) || { names: [] });
  c.check("予定とやることが日の行に（時刻の順）", JSON.stringify(ev("2026-10-22").names) === JSON.stringify(["定例", "電球を替える"]), JSON.stringify(ev("2026-10-22")));
  c.check("毎日のくり返しは出さない", !a.evs.some((e) => e.names.includes("朝の体操")));
  c.check("過ぎた日の予定は残る（薄く）", W.inWeek ? ev("2026-10-19").past && ev("2026-10-19").names.includes("打ち合わせ") : true, JSON.stringify(ev("2026-10-19")));
  c.check("またがる予定は帯（二日ぶん）", a.bands.length === 1 && a.bands[0].t === "出張" && /\/\s*span 2|\d+ \/ \d+/.test(a.bands[0].row), JSON.stringify(a.bands));
  c.check("頭の札は週の面に出さない", a.late === 0, String(a.late));

  await page.click(".wk-more");
  await page.waitForTimeout(300);
  a = await look();
  c.check("ほかを開くと全部", a.rows.length === 8 && a.more[0] === "畳む", JSON.stringify(a.rows));

  await page.click('.wk-faces .seg-btn[data-face="today"]');
  await page.waitForTimeout(500);
  a = await look();
  c.check("今日を押すと今日の面", a.pressed === "今日" && a.road && !a.week && a.dayOf === "2026-10-21", JSON.stringify(a));
  c.check("頭の札は今日の面に", a.late >= 1, String(a.late));

  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(500);
  a = await look();
  c.check("席をもう一度押すと週へ", a.pressed === "週" && !!a.week, JSON.stringify(a.pressed));

  await page.click('.wk-day[data-day="2026-10-22"]');
  await page.waitForTimeout(500);
  a = await look();
  c.check("日を押すとその日の面", a.pressed === "今日" && a.dayOf === "2026-10-22", JSON.stringify([a.pressed, a.dayOf]));
  await page.click('.wk-faces .seg-btn[data-face="week"]');
  await page.waitForTimeout(500);

  // 払えば次の週（本物のタッチ。tests/day-swipe.js と同じ）
  const box = { y: 520 };
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(330, box.y) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(330 - 24 * i, box.y) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(900);
  a = await look();
  const next = await page.evaluate((f) => KN.util.shiftDay(f, 7), W.from);
  c.check("払えば次の週（期限・今週は今週だけ）", a.week === next && a.heads.length === 0, JSON.stringify([a.week, next, a.heads]));

  // 済ませる
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(500);
  await page.click('.wk-row[data-id] .check');
  await page.waitForTimeout(600);
  const done = await page.evaluate(() => KN.store.get().todos.find((t) => t.title === "経費の精算").done);
  c.check("期限の行から済ませられる", done === true);

  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
