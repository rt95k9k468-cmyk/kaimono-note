/* 今日の済ませたものは紙のいちばん下（R3・2026年11月11日、docs/redesign.md 6節「時刻なし → 済ませたもの」）。
   前は紙のいちばん上で、開くと「今日｜週｜月」の帯の裏へ送っていた（2026年10月28日・doneRest）。いまは送らない。時計を 16:53 に止める。
   - 並びは 一日の帯（道）→ 時間割 → 時刻なし（前の日から・これから）→ 済ませたもの。入ると紙の頭から（道を出さない・下・上の三つ）
   - 物差しの用事を済ませると、物差しの頭は動かず、下の一覧が一件伸びる
   - 一覧で ✓ を外すと物差しへ帰る。送りは動かない
   - 帯で 週 → 今日 と戻っても紙の頭から
   - 「前の日から」は時刻なしのカードの頭

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/timeline-done-rest.js */
const { open, checker } = require("./lib");

const DAY = "2026-10-28";

(async () => {
  const c = checker("timeline-done-rest");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 28, 16, 53)); },
  });
  const ids = await page.evaluate((day) => {
    const s = KN.store;
    s.update((st) => { st.settings.todoRoad = false; });
    const at = (h, m) => new Date(2026, 9, 28, h, m).toISOString();
    const done = (t, h, m) => { s.update((st) => { const x = st.todos.find((y) => y.id === t.id); x.done = true; x.doneAt = at(h, m); }); return t.id; };
    const out = {
      a: done(s.addTodo({ title: "朝の支度", due: day, time: "08:30", minutes: 30 }), 9, 8),
      b: done(s.addTodo({ title: "見学", due: day, time: "10:30", minutes: 45 }), 11, 15),
      c: done(s.addTodo({ title: "下ごしらえ", due: day, minutes: 10 }), 12, 12),
      d: done(s.addTodo({ title: "洗濯", due: day, time: "13:17", minutes: 60 }), 14, 17),
      e: s.addTodo({ title: "片づけ", due: day, time: "17:00", minutes: 30 }).id,
      f: s.addTodo({ title: "夕ごはん", due: day, time: "19:00", minutes: 60 }).id,
      g: s.addTodo({ title: "ゴミ出し", due: day, time: "21:00", minutes: 30 }).id,
    };
    ["本棚の整理", "冬服を出す", "写真の整理"].forEach((t) => s.addTodo({ title: t }));
    return out;
  }, DAY);

  /** ほかの席から入り直す（onEnter → toNow）。 */
  const enter = async () => {
    await page.click('.tab[data-tab="list"]');
    await page.waitForFunction(() => document.querySelector("#screen-list.is-active"), null, { timeout: 5000 });
    await page.click('.tab[data-tab="todo"]');
    await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });
    await page.waitForTimeout(400);
  };
  /* 測る：帯の下のきわと、一覧・物差し・道・前の日からの上下（画面の y）。 */
  const read = () => page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const sc = KN.app.scrollerOf(scr);
    const box = (sel) => { const e = scr.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    const any = scr.querySelector(".tl-any");
    return {
      top: sc.scrollTop, band: box(".wk-faces").bottom,
      done: box(".tl-done"), list: box(".tl-list"), road: box(".day-strip"), prev: box(".tl-prev-sec"),
      rows: scr.querySelectorAll(".tl-done-row").length,
      prevFirst: !!(any && any.firstElementChild && any.firstElementChild.classList.contains("tl-prev-sec")),
      order: [...scr.querySelector(".day-slide").children]
        .map((x) => ["tl-done-sec", "todo-day", "tk-side"].find((k) => x.classList.contains(k)) || "?").join(">"),
    };
  });
  const near = (a, b, tol = 1.5) => a != null && b != null && Math.abs(a - b) <= tol;
  /* 行の滑り（FLIP）が終わるまで——終わると行の style の transition が空に戻る（ui.js の flipRows）。 */
  const still = () => page.waitForFunction(() => ![...document.querySelectorAll("#screen-todo .tl-row, #screen-todo .tl-done-row")]
    .some((el) => el.style.transition || el.style.transform), null, { timeout: 5000 });

  /* ---- 道を出さない ---- */
  await enter();
  let r = await read();
  c.check("並びは 時間割 → 時刻なし → 済ませたもの（一覧は紙のいちばん下）", r.order === "todo-day>tk-side>tl-done-sec" && r.done && r.done.top > r.list.bottom, JSON.stringify(r));
  c.check("入ると紙の頭から（一覧を帯の裏へ送らない）", r.top === 0 && r.list.top >= r.band - 1, JSON.stringify(r));

  const was = r;
  await page.click(`#screen-todo .tl-list > .tl-row[data-todo-id="${ids.e}"] button.check`);
  await page.waitForFunction((id) => !!document.querySelector(`#screen-todo .tl-done-row[data-todo-id="${id}"]`), ids.e, { timeout: 5000 });
  await still();
  r = await read();
  c.check("済ませても物差しの頭は動かず、下の一覧が一件伸びる", r.rows === was.rows + 1 && near(r.list.top, was.list.top) && r.top === 0, JSON.stringify({ was, r }));

  await page.locator(`#screen-todo .tl-done-row[data-todo-id="${ids.c}"] button.check`).scrollIntoViewIfNeeded();
  const top0 = (await read()).top;
  await page.click(`#screen-todo .tl-done-row[data-todo-id="${ids.c}"] button.check`);
  await page.waitForFunction((id) => !!document.querySelector(`#screen-todo .tl-list > .tl-row[data-todo-id="${id}"]`), ids.c, { timeout: 5000 });
  await still();
  r = await read();
  c.check("一覧で ✓ を外すと物差しへ帰り、送りは動かない", near(r.top, top0, 2) && r.rows === was.rows, JSON.stringify({ top0, r }));

  await page.click('#screen-todo .wk-faces .seg-btn[data-face="week"]');
  await page.waitForFunction(() => !!document.querySelector("#screen-todo .day-slide.wk"), null, { timeout: 5000 });
  await page.click('#screen-todo .wk-faces .seg-btn[data-face="today"]');
  await page.waitForFunction(() => !!document.querySelector("#screen-todo .day-slide .tl-done-sec"), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  r = await read();
  c.check("週から今日へ戻ると紙の頭から", r.top === 0, JSON.stringify(r));

  /* ---- 道が下 ---- */
  await page.evaluate(() => KN.store.update((st) => { st.settings.todoRoad = true; st.settings.todoRoadAt = "below"; }));
  await enter();
  r = await read();
  c.check("道が下：帯は時間割の下、入ると紙の頭から", !!r.road && r.road.top > r.list.top && r.top === 0, JSON.stringify(r));

  /* ---- 道が上 ---- */
  await page.evaluate(() => KN.store.update((st) => { delete st.settings.todoRoadAt; }));
  await enter();
  r = await read();
  c.check("道が上：帯が「今日｜週｜月」のすぐ下", !!r.road && r.road.top < r.list.top && r.top === 0 && r.road.top - r.band < 24, JSON.stringify(r));

  /* ---- 前の日から ---- */
  await page.evaluate(() => KN.store.update((st) => { st.settings.todoRoad = false; }));
  await page.evaluate(() => KN.store.addTodo({ title: "書類を出す", due: "2026-10-27", minutes: 15 }));
  await enter();
  r = await read();
  c.check("「前の日から」は時刻なしのカードの頭（時間割の下）", r.prevFirst && r.prev.top > r.list.bottom && r.top === 0, JSON.stringify(r));

  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
