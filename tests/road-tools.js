/* 一日の道：右下の道具箱（3.0 の A3・docs/roadmap-3.0.md）。時計を 9:10 に止め、今日に 15:00 の停留所と、
   長期タスクを八つ置く。指はどれも本物のタッチ（CDP の Input.dispatchTouchEvent）。
   1. 道具箱：思考・ノート・読書の丸が、19時台と21時台の段のあいだの右（右下）に、薄い台と並ぶ
   2. 札・くぼみの長期タスクが道具箱をよける（重ならない・道具箱のくぼみに長期タスクが居ない）
   3. 思考を長押し → 歩いたぶん（7:00）へ：狙い・札「7:00から30分」・下書き → 離す：種の記録（題「思考」・
      7:00・30分）、用事は作らない、道に済んだ活動、知らせ「思考 7:00から30分」、元に戻すで消える
   4. 長さは「いま」で止まる（9:00 に置けば10分）
   5. 読書をこれから（13:00）へ：読書の予定（題「読書」・act 付き）、記録は作らない
   6. 長さは次の停留所の頭で止まる（14:45 なら15分）
   7. 道の外・動かさずに離す：何も書かない
   8. 短く押す：時刻と長さの紙
   9. 過ぎた日（前の日）に置く：記録 */
const { open, checker } = require("./lib");

const DAY = "2026-09-30";
const PREV = "2026-09-29";

(async () => {
  const c = checker("road-tools");
  const { browser, ctx, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 30, 9, 10)); },
  });

  await page.evaluate((day) => {
    const s = KN.store;
    s.addTodo({ title: "病院", due: day, time: "15:00", minutes: 60 });
    for (let i = 0; i < 8; i++) s.addTodo({ title: `いつか${i}` });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await page.waitForTimeout(300);

  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: type === "touchEnd" ? [] : pts(x, y) });
  const wait = (ms) => page.waitForTimeout(ms);
  const glide = async (from, to, steps = 8) => {
    for (let i = 1; i <= steps; i++) {
      await touch("touchMove", from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
      await wait(20);
    }
  };
  const closeSheets = async () => {
    await page.evaluate(() => KN.ui.closeAll && KN.ui.closeAll());
    await page.keyboard.press("Escape");
    await wait(600);
  };
  const toolAt = async (name) => {
    const b = await page.locator(`#screen-todo .road-tool[aria-label="${name}"]`).boundingBox();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  };
  /* 道の上の時刻 min を狙う指の位置（写しは指の 40px 上）。 */
  const roadPoint = (min) => page.evaluate((m) => {
    const road = document.querySelector("#screen-todo .day-road");
    const g = road.__road.g;
    const box = road.querySelector(".road-map").getBoundingClientRect();
    const k = box.width / KN.dayRoad.W;
    const p = g.point(g.dist(m));
    return { x: box.left + p.x * k, y: box.top + p.y * k + 40 };
  }, min);
  const counts = () => page.evaluate(() => ({
    todos: KN.store.get().todos.length, entries: KN.store.get().archive.entries.length,
  }));
  const lastEntry = () => page.evaluate(() => {
    const e = KN.store.get().archive.entries.slice(-1)[0];
    return e ? { id: e.id, type: e.type, title: e.title, at: e.at || null, minutes: e.minutes || null,
                 date: e.date, todo: e.todo || null } : null;
  });
  const state = () => page.evaluate(() => ({
    carrying: KN.dayRoad.carrying(),
    ghost: !!document.querySelector(".road-tool.road-ghost"),
    aim: !!document.querySelector("#screen-todo .road-aim.is-on"),
    tag: (document.querySelector(".road-carry-time.is-on") || {}).textContent || null,
    draft: !!document.querySelector("#screen-todo .road-draft[d]"),
  }));
  const toastText = () => page.evaluate(() => (document.querySelector(".toast-msg") || {}).textContent || "");
  /* 道具箱から長押しで持ち上げ、to へ運んで離す。 */
  const carryTo = async (name, to, peek) => {
    const from = await toolAt(name);
    await touch("touchStart", from.x, from.y);
    await wait(460);
    const lifted = await state();
    await glide(from, to, 10);
    const over = peek ? await state() : null;
    await touch("touchEnd");
    await wait(700);
    return { lifted, over };
  };

  /* ---- 1. 置き場所 ---- */
  const box = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road;
    const map = road.querySelector(".road-map").getBoundingClientRect();
    const k = map.width / KN.dayRoad.W;
    const tools = [...road.querySelectorAll(".road-tool")].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute("aria-label"), x: (r.left + r.width / 2 - map.left) / k, y: (r.top + r.height / 2 - map.top) / k, w: r.width };
    });
    const pad = road.querySelector(".road-tools-pad").getBoundingClientRect();
    return { rows: st.g.rows, row: st.tools && st.tools.row, right: st.tools && st.tools.right,
             y3: st.g.rowY(3), y4: st.g.rowY(4), tools,
             pad: [pad.left, pad.right, pad.top, pad.bottom], text: road.querySelector(".road-tools").textContent.trim() };
  });
  c.check("道具箱は思考・ノート・読書の三つ", box.tools.map((t) => t.label).join() === "思考,ノート,読書", JSON.stringify(box.tools));
  c.check("五段の道で、3・4段のあいだの右", box.rows === 5 && box.row === 3 && box.right, JSON.stringify(box));
  c.check("丸は24px、段と段のまん中の高さで、右詰め（右の丸の中心が 338）",
    box.tools.every((t) => Math.abs(t.w - 24) < 1.5 && Math.abs(t.y - (box.y3 + box.y4) / 2) < 3)
      && Math.abs(box.tools[2].x - 338) < 1.5 && Math.abs(box.tools[1].x - box.tools[0].x - 30) < 1.5, JSON.stringify(box));
  c.check("説明の字を出さない", box.text === "", box.text);

  /* ---- 2. 札・くぼみがよける ---- */
  const clash = await page.evaluate((pad) => {
    const road = document.querySelector("#screen-todo .day-road");
    const hit = (r) => r.left < pad[1] && r.right > pad[0] && r.top < pad[3] && r.bottom > pad[2];
    const labels = [...road.querySelectorAll(".road-label, .road-now, .road-edge, .road-bead")]
      .filter((x) => hit(x.getBoundingClientRect())).map((x) => x.className + ":" + x.textContent.trim());
    const st = road.__road;
    return { labels, someday: road.querySelectorAll(".road-bead.is-someday").length, rows: st.someday.length };
  }, box.pad);
  c.check("道具箱の台に、札・丸が重ならない", clash.labels.length === 0, JSON.stringify(clash.labels));
  c.check("長期タスクはほかのくぼみに出ている", clash.someday > 0, JSON.stringify(clash));

  /* ---- 3. 思考を歩いたぶんへ ---- */
  let n0 = await counts();
  const r3 = await carryTo("思考", await roadPoint(7 * 60), true);
  c.check("長押しで写しが浮く", r3.lifted.carrying && r3.lifted.ghost, JSON.stringify(r3.lifted));
  c.check("7:00 の上で、狙い・札「7:00から30分」・下書き",
    r3.over.aim && r3.over.tag === "7:00から30分" && r3.over.draft, JSON.stringify(r3.over));
  let n1 = await counts();
  let e = await lastEntry();
  c.check("離すと種の記録（思考・7:00・30分・その日）", n1.entries === n0.entries + 1 && e.type === "seed"
    && e.title === "思考" && e.at === "07:00" && e.minutes === 30 && e.date === DAY, JSON.stringify(e));
  c.check("歩いたぶんでは用事を作らない", n1.todos === n0.todos, JSON.stringify([n0, n1]));
  const s3 = await state();
  c.check("離したら写し・狙い・下書きが消える", !s3.carrying && !s3.ghost && !s3.aim && !s3.draft, JSON.stringify(s3));
  const onRoad = await page.evaluate((id) => {
    const st = document.querySelector("#screen-todo .day-road").__road;
    return st.stops.some((s) => s.t.id === `arc:${id}` && s.act);
  }, e.id);
  c.check("道に済んだ活動として描かれる（arc:）", onRoad);
  c.check("知らせ「思考 7:00から30分」", (await toastText()) === "思考 7:00から30分", await toastText());
  const acts = await page.evaluate(() => [...document.querySelectorAll(".toast-action")].map((b) => b.textContent));
  c.check("知らせに「直す」「元に戻す」", acts.join() === "直す,元に戻す", JSON.stringify(acts));
  c.check("紙は開かない", !(await page.evaluate(() => !!document.querySelector(".sheet.is-open"))));
  await page.evaluate(() => [...document.querySelectorAll(".toast-action")].find((b) => b.textContent === "元に戻す").click());
  await wait(300);
  c.check("元に戻すで記録が消える", (await counts()).entries === n0.entries);

  /* ---- 4. 「いま」で止める ---- */
  await carryTo("思考", await roadPoint(9 * 60));
  e = await lastEntry();
  c.check("9:00 に置けば、いま（9:10）までの10分", e.at === "09:00" && e.minutes === 10, JSON.stringify(e));

  /* ---- 5. 読書をこれからへ ---- */
  n0 = await counts();
  await carryTo("読書", await roadPoint(13 * 60));
  n1 = await counts();
  const t5 = await page.evaluate(() => {
    const t = KN.store.get().todos.filter((x) => x.act && x.time === "13:00")[0] || {};
    return { title: t.title, time: t.time, minutes: t.minutes, due: t.due, act: t.act && t.act.type };
  });
  c.check("これからの道では予定（読書・13:00・30分・act 付き）", n1.todos === n0.todos + 1 && t5.title === "読書"
    && t5.time === "13:00" && t5.minutes === 30 && t5.due === DAY && t5.act === "reading", JSON.stringify(t5));
  c.check("予定のときは記録を作らない", n1.entries === n0.entries, JSON.stringify([n0, n1]));

  /* ---- 6. 次の停留所で止める ---- */
  await carryTo("読書", await roadPoint(14 * 60 + 45));
  const t6 = await page.evaluate(() => { const t = KN.store.get().todos.filter((x) => x.act && x.time === "14:45")[0] || {}; return { time: t.time, minutes: t.minutes }; });
  c.check("14:45 なら、15:00 の停留所の頭までの15分", t6.time === "14:45" && t6.minutes === 15, JSON.stringify(t6));

  /* ---- 7. 道の外・動かさずに離す ---- */
  n0 = await counts();
  const from = await toolAt("ノート");
  /* 写しは指の 40px 上：段と段のまん中（道から 47）を狙う。 */
  await carryTo("ノート", { x: from.x - 60, y: from.y + 40 });
  c.check("道の外で離せば何も書かない", JSON.stringify(await counts()) === JSON.stringify(n0));
  await touch("touchStart", from.x, from.y);
  await wait(460);
  await touch("touchEnd");
  await wait(500);
  c.check("動かさずに離せば何も書かない・紙も開かない", JSON.stringify(await counts()) === JSON.stringify(n0)
    && !(await page.evaluate(() => !!document.querySelector(".sheet.is-open"))));

  /* ---- 8. 短く押す ---- */
  await page.locator('#screen-todo .road-tool[aria-label="思考"]').click();
  await wait(500);
  const sh = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    return s ? { title: (s.querySelector(".sheet-title, h2") || {}).textContent || "", span: !!s.querySelector(".act-span") } : null;
  });
  c.check("短く押すと時刻と長さの紙（題「思考」）", sh && sh.span && /思考/.test(sh.title), JSON.stringify(sh));
  await closeSheets();

  /* ---- 9. 過ぎた日 ---- */
  await page.evaluate((d) => KN.screens.todo.goDay(d), PREV);
  await wait(900);
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await wait(300);
  const pastOk = await page.evaluate((d) => {
    const road = document.querySelector("#screen-todo .day-road");
    return !!road && road.__road.day === d && road.__road.past && !!road.querySelector(".road-tool");
  }, PREV);
  c.check("過ぎた日にも道具箱", pastOk);
  if (pastOk) {
    n0 = await counts();
    await carryTo("読書", await roadPoint(20 * 60));
    n1 = await counts();
    e = await lastEntry();
    c.check("過ぎた日は記録（読書・20:00・題は空）", n1.entries === n0.entries + 1 && n1.todos === n0.todos
      && e.type === "reading" && e.title === "" && e.at === "20:00" && e.date === PREV, JSON.stringify(e));
  }

  c.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  c.done();
})().catch((err) => { console.error(err); process.exit(1); });
