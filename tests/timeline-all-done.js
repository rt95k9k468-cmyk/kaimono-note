/* 今日の用事をみな済ませた日（2026年10月28日、利用者「全部終わらせても何もないのも寂しい」「時間の帯も無くなって」）。
   物差しは空にせず、いまの時から一日の終わりまでを一枚の札（screen-todo.js の restRow・.tl-rest）。時計を 22:20 に止める。
   - 札は物差しの中（まだの札・畳んだ空きは無い）。題「ぜんぶ済みました」と時間帯の絵・ひとこと（夜は月「おやすみなさい」）。
     数（件数・割合）は出さない
   - 「いま」の時刻の札が出て（前は出なかった）札の高さの中に居る。棒は時計が通ったところまで色（--pass＝1/3）。頭と下に 22:00・23:00
   - 昼は日「あとは、ごゆっくり」、夕方は日の入り「おつかれさまでした」（時計を替えて入り直す）
   - 開いただけでは咲かない。一覧の ✓ で一件戻すと札は消えて物差しに札が戻り、その札を済ませると札が咲く（is-fresh）・輪が一度
   - 長期タスクを札へ運ぶと、いまから一日の終わりのあいだの時刻（指の高さ）で今日に入り、札は消える
   - ほかの日（昨日）をみな済ませていても札は出ない。やめた（archived）だけの日も出ない

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/timeline-all-done.js */
const { open, checker } = require("./lib");

const DAY = "2026-10-28";

(async () => {
  const c = checker("timeline-all-done");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 28, 22, 20)); },
  });
  const ids = await page.evaluate((day) => {
    const s = KN.store;
    s.update((st) => { st.settings.todoRoad = false; });
    const done = (t, d, h, m) => {
      s.update((st) => { const x = st.todos.find((y) => y.id === t.id); x.done = true; x.doneAt = new Date(2026, 9, d, h, m).toISOString(); });
      return t.id;
    };
    return {
      a: done(s.addTodo({ title: "見学", due: day, time: "10:30", minutes: 45 }), 28, 11, 15),
      b: done(s.addTodo({ title: "洗濯", due: day, time: "13:17", minutes: 60 }), 28, 14, 17),
      c: done(s.addTodo({ title: "ゴミ出し", due: day, minutes: 10 }), 28, 20, 4),
      y: done(s.addTodo({ title: "昨日の用事", due: "2026-10-27", time: "09:00", minutes: 30 }), 27, 9, 20),
      s: s.addTodo({ title: "本棚の整理" }).id,
    };
  }, DAY);

  /** ほかの席から入り直す（組み直し）。 */
  const enter = async () => {
    await page.click('.tab[data-tab="list"]');
    await page.waitForFunction(() => document.querySelector("#screen-list.is-active"), null, { timeout: 5000 });
    await page.click('.tab[data-tab="todo"]');
    await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });
    await page.waitForTimeout(300);
  };
  const read = () => page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const slide = scr.querySelector(".day-slide:not(.is-peek)");
    const list = slide.querySelector(".todo-day .tl-list");
    const rest = list && list.querySelector(":scope > .tl-rest");
    const now = slide.querySelector(".todo-day .tl-now");
    const rb = rest && rest.getBoundingClientRect(), nb = now && now.getBoundingClientRect();
    const art = rest && rest.querySelector(".tl-rest-art svg");
    return {
      rest: !!rest, fresh: !!(rest && rest.classList.contains("is-fresh")), tl: !!slide.querySelector(".todo-day > .tl.is-rest"),
      title: rest ? rest.querySelector(".tl-rest-title").textContent.trim() : "",
      say: rest ? rest.querySelector(".tl-rest-say").textContent.trim() : "",
      art: art ? art.dataset.ico : "",
      digits: rest ? /[0-9０-９]/.test(rest.textContent) : null,
      pass: rest ? Number(rest.style.getPropertyValue("--pass")) : null,
      now: !!now, nowIn: !!(rb && nb && nb.top >= rb.top - 1 && nb.top <= rb.bottom + 1),
      hours: list ? [...list.querySelectorAll(":scope > .tl-tick:not(.is-quiet):not(.is-near-now) .tl-hour")].map((x) => x.textContent.trim()) : [],
      rows: list ? list.querySelectorAll(":scope > .tl-row").length : 0,
      folds: list ? list.querySelectorAll(":scope > .tl-fold").length : 0,
      done: scr.querySelectorAll(".day-slide:not(.is-peek) > .tl-done > .tl-done-row").length,
    };
  });

  await enter();
  let r = await read();
  c.check("みな済ませたら、物差しの中に一枚の札（まだの札・畳んだ空きは無い）", r.rest && r.tl && !r.rows && !r.folds && r.done === 3, JSON.stringify(r));
  c.check("札は「ぜんぶ済みました」と、夜は月「おやすみなさい」。数は出さない",
    r.title === "ぜんぶ済みました" && r.say === "おやすみなさい" && r.art === "moon" && r.digits === false, JSON.stringify(r));
  c.check("「いま」の時刻の札が出て、札の高さの中に居る", r.now && r.nowIn, JSON.stringify(r));
  c.check("棒は時計が通ったところまで色（22:00〜23:00 の 1/3）", Math.abs(r.pass - 1 / 3) < 0.01, String(r.pass));
  c.check("札の頭と下に時刻（22:00・23:00）", r.hours.join("/") === "22:00/23:00", JSON.stringify(r.hours));
  c.check("開いただけでは咲かない（咲くのは arrive）", !r.fresh, JSON.stringify(r));

  /* 時間帯のひとこと：昼・夕方。 */
  await page.clock.setFixedTime(new Date(2026, 9, 28, 14, 5));
  await enter();
  r = await read();
  c.check("昼は日「あとは、ごゆっくり」", r.rest && r.say === "あとは、ごゆっくり" && r.art === "sun" && r.nowIn, JSON.stringify(r));
  await page.clock.setFixedTime(new Date(2026, 9, 28, 18, 40));
  await enter();
  r = await read();
  c.check("夕方は日の入り「おつかれさまでした」", r.rest && r.say === "おつかれさまでした" && r.art === "sunrise" && r.nowIn, JSON.stringify(r));
  await page.clock.setFixedTime(new Date(2026, 9, 28, 22, 20));
  await enter();

  /* 一覧の ✓ で一件戻す → 札は消えて物差しに札。その札を済ませる → 札が咲いて、輪が一度。 */
  await page.click(`#screen-todo .tl-done-row[data-todo-id="${ids.c}"] button.check`);
  await page.waitForFunction((id) => !!document.querySelector(`#screen-todo .tl-list > .tl-row[data-todo-id="${id}"]`), ids.c, { timeout: 5000 });
  r = await read();
  c.check("一件戻すと札は消え、物差しにまだの札", !r.rest && r.rows === 1 && !r.tl, JSON.stringify(r));
  await page.evaluate(() => { window.__burst = 0; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains("kn-burst")) window.__burst++; }))).observe(document.body, { childList: true }); });
  await page.click(`#screen-todo .tl-list > .tl-row[data-todo-id="${ids.c}"] button.check`);
  await page.waitForFunction(() => !!document.querySelector("#screen-todo .tl-list > .tl-rest"), null, { timeout: 5000 });
  r = await read();
  const before = await page.evaluate(() => window.__burst);
  await page.waitForFunction((n) => window.__burst > n, before, { timeout: 3000 }).catch(() => {});
  const after = await page.evaluate(() => window.__burst);
  c.check("最後の一件を済ませると札が咲き（is-fresh）、絵から輪が一度", r.rest && r.fresh && after > before, JSON.stringify({ r, before, after }));

  /* 長期タスクを札へ運ぶ → 指の高さの時刻（いま〜一日の終わり）で今日に入り、札は消える。 */
  await page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
    const list = document.querySelector("#screen-todo .day-slide:not(.is-peek) .todo-day .tl-list");
    sc.scrollTop += list.getBoundingClientRect().top - 200;
  });
  await page.waitForTimeout(150);
  const g = await page.evaluate((id) => {
    const row = document.querySelector(`#screen-todo .tl-someday-sec .tl-row[data-todo-id="${id}"] .tl-open`);
    const b = row.getBoundingClientRect();
    const list = document.querySelector("#screen-todo .day-slide:not(.is-peek) .todo-day .tl-list");
    const L = list.__tl, r = list.getBoundingClientRect();
    return { x: b.left + 40, y: b.top + b.height / 2, tx: r.left + 200, ty: r.top + parseFloat(getComputedStyle(list).paddingTop) + L.y(22 * 60 + 41) };
  }, ids.s);
  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  await page.waitForTimeout(520);
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(g.tx, g.y + (g.ty - g.y) * k / 8);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  const moved = await page.evaluate((id) => { const t = KN.store.getTodo(id); return { due: t.due, time: t.time }; }, ids.s);
  r = await read();
  c.check("長期タスクを札へ運ぶと、指の高さの時刻で今日に入り、札は消える",
    moved.due === DAY && moved.time === "22:40" && !r.rest && r.rows === 1, JSON.stringify({ moved, r }));

  /* やめた（archived）だけの日は札を出さない。 */
  await page.evaluate((day) => KN.store.update((st) => st.todos.forEach((x) => {
    if (x.due === day) { x.done = false; x.doneAt = null; x.archived = true; }
  })), DAY);
  await page.waitForTimeout(400);
  r = await read();
  c.check("やめただけの日は札を出さない", !r.rest, JSON.stringify(r));

  /* ほかの日（昨日）をみな済ませていても、札は出ない（済ませたものは物差しの上）。 */
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await page.click('#head .cal-day[data-day="2026-10-27"]');
  await page.waitForFunction(() => document.querySelector('#screen-todo .todo-day[data-day="2026-10-27"]'), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const past = await page.evaluate((id) => ({
    rest: !!document.querySelector("#screen-todo .day-slide:not(.is-peek) .tl-rest"),
    card: !!document.querySelector(`#screen-todo .tl-list > .tl-row.is-done[data-todo-id="${id}"]`),
  }), ids.y);
  c.check("昨日をみな済ませていても札は出ない（済ませたものは物差しの上）", !past.rest && past.card, JSON.stringify(past));

  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
