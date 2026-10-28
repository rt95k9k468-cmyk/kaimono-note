/* 今日の済ませたものの一覧は、開くと帯の裏（2026年10月28日、利用者「タスクが多い日には圧迫する」「ただ畳むというのもな」）。
   一覧は紙のいちばん上（前の日から・道・物差しより上）。開いたら一覧の下のきわが「今日｜週｜月」の帯の下のきわに来るまで
   送る（screen-todo.js の doneRest・toNow。最後の行の下のきわ＝帯の下のきわ、一覧の下の余白＝帯の溶かしの高さなので、物差しの
   頭の字は溶かしにかからない）。畳まない——上へ戻せば出る。時計を 16:53 に止める。
   - 席に入ると、一覧は帯の裏・物差しの頭は帯のすぐ下（道を出さない・下・上の三つ。前は道が下でも頭へ戻していた）
   - 帯の裏のまま物差しの用事を済ませると、物差しは動かず、一覧は一件伸びて帯の裏のまま
   - 上へ戻すと一覧の頭から見える。そこで ✓ を外しても、上の行は動かない（送らない）
   - 帯で 週 → 今日 と戻ると、帯の裏へ
   - 道が上なら、道が帯のすぐ下。「前の日から」があれば、それが帯のすぐ下（一覧より下にある）

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
    return {
      top: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight,
      band: box(".wk-faces").bottom,
      done: box(".tl-done"),
      pad: (() => { const d = scr.querySelector(".tl-done"); return d ? parseFloat(getComputedStyle(d).paddingBottom) : null; })(),
      edge: parseFloat(getComputedStyle(scr.querySelector(".wk-faces"), "::after").height) || 0,
      tl: box(".todo-day > .tl"), list: box(".tl-list"), road: box(".day-road"), prev: box(".tl-prev-sec"),
      rows: scr.querySelectorAll(".tl-done-row").length,
      order: [...scr.querySelector(".day-slide").children]
        .map((x) => ["tl-done", "tl-prev-sec", "todo-day", "tl-someday-sec"].find((k) => x.classList.contains(k)) || "?").join(">"),
    };
  });
  const near = (a, b, tol = 1.5) => a != null && b != null && Math.abs(a - b) <= tol;
  /* 行の滑り（FLIP）が終わるまで——終わると行の style の transition が空に戻る（ui.js の flipRows）。 */
  const still = () => page.waitForFunction(() => ![...document.querySelectorAll("#screen-todo .tl-row, #screen-todo .tl-done-row")]
    .some((el) => el.style.transition || el.style.transform), null, { timeout: 5000 });
  /* 帯の裏：一覧の下の余白＝帯の溶かしの高さで、その余白だけが帯の下に残る（＝最後の行の下のきわが帯の下のきわ）。
     行は測らない——済ませた行は滑っている途中（FLIP）で、開いた一拍も下から滑ってくる。 */
  const tucked = (r) => r.edge > 0 && near(r.pad, r.edge, 0.5) && near(r.done.bottom, r.band + r.edge);
  /* 帯のすぐ下：溶かしの下から始まる（字が溶かしにかからない）。 */
  const under = (r, top) => top != null && top >= r.band + r.edge - 1 && top - r.band < r.edge + 24;

  /* ---- 道を出さない ---- */
  await enter();
  let r = await read();
  c.check("一覧は紙のいちばん上（前の日から・道・物差しより上）", r.order.startsWith("tl-done>"), r.order);
  c.check("入ると一覧は帯の裏、物差しの囲いは帯のすぐ下",
    r.max > r.top && r.top > 0 && tucked(r) && under(r, r.tl.top), JSON.stringify(r));

  /* 帯の裏のまま物差しの用事を済ませる → 物差しは動かず、一覧は一件伸びて帯の裏のまま。 */
  const was = r;
  await page.click(`#screen-todo .tl-list > .tl-row[data-todo-id="${ids.e}"] button.check`);
  await page.waitForFunction((id) => !!document.querySelector(`#screen-todo .tl-done-row[data-todo-id="${id}"]`), ids.e, { timeout: 5000 });
  await still();
  r = await read();
  c.check("済ませても物差しは動かず、一覧は伸びて帯の裏のまま",
    r.rows === was.rows + 1 && near(r.list.top, was.list.top) && tucked(r) && r.top > was.top, JSON.stringify({ was, r }));

  /* 上へ戻すと一覧の頭から見える。そこで ✓ を外しても、上の行は動かない（送らない）。 */
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await page.waitForTimeout(150);
  r = await read();
  c.check("上へ戻すと一覧の頭から見える", r.top === 0 && r.done.top >= r.band - 1, JSON.stringify(r));
  const head = r.done.top;
  await page.click(`#screen-todo .tl-done-row[data-todo-id="${ids.c}"] button.check`);
  await page.waitForFunction((id) => !!document.querySelector(`#screen-todo .tl-list > .tl-row[data-todo-id="${id}"]`), ids.c, { timeout: 5000 });
  await still();
  r = await read();
  c.check("一覧を見ながら ✓ を外すと、物差しへ帰り、上の行は動かない（送らない）", r.top === 0 && near(r.done.top, head), JSON.stringify(r));

  /* 帯で 週 → 今日 と戻ると、帯の裏へ。 */
  await page.click('#screen-todo .wk-faces .seg-btn[data-face="week"]');
  await page.waitForFunction(() => !!document.querySelector("#screen-todo .day-slide.wk"), null, { timeout: 5000 });
  await page.click('#screen-todo .wk-faces .seg-btn[data-face="today"]');
  await page.waitForFunction(() => !!document.querySelector("#screen-todo .day-slide > .tl-done"), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  r = await read();
  c.check("週から今日へ戻ると、一覧は帯の裏", r.top > 0 && tucked(r), JSON.stringify(r));

  /* ---- 道が下 ---- */
  await page.evaluate(() => KN.store.update((st) => { st.settings.todoRoad = true; st.settings.todoRoadAt = "below"; }));
  await enter();
  r = await read();
  c.check("道が下でも、入ると一覧は帯の裏（頭へ戻さない）",
    !!r.road && r.road.top > r.list.top && tucked(r) && under(r, r.tl.top), JSON.stringify(r));

  /* ---- 道が上 ---- */
  await page.evaluate(() => KN.store.update((st) => { delete st.settings.todoRoadAt; }));
  await enter();
  r = await read();
  c.check("道が上なら、一覧は帯の裏・道が帯のすぐ下",
    !!r.road && r.road.top < r.list.top && tucked(r) && under(r, r.road.top), JSON.stringify(r));

  /* ---- 前の日から ---- */
  await page.evaluate(() => KN.store.update((st) => { st.settings.todoRoad = false; }));
  await page.evaluate(() => KN.store.addTodo({ title: "書類を出す", due: "2026-10-27", minutes: 15 }));
  await enter();
  r = await read();
  c.check("「前の日から」は一覧の下で、入ると帯のすぐ下（一覧は帯の裏）",
    r.order.startsWith("tl-done>tl-prev-sec") && tucked(r) && under(r, r.prev.top),
    JSON.stringify(r));

  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
