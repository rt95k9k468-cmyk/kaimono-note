/* 今日の済ませたものは物差しの上の一覧（2026年10月28日、利用者「終わったことなのに視界に出てきて邪魔」「一日が一目でわからない」）。
   時計を 16:53 に止める。
   - 済ませた二件は物差しに居ず、上の一覧（.tl-done）に済ませた順・済ませた時刻。物差しはまだの二件だけで、頭はいまの時（16:00）
   - 一覧の ✓ で元に戻すと物差しへ帰る。題を押すと詳細の紙
   - みな済ませたら、物差しは畳んだ空きと「いま」だけ
   - ほかの日（昨日）の済ませたものは、今までどおり物差しの上
   - 送っても掴み手は消えず、「今日｜週｜月」の帯は掴み手の下（帯が掴み手を覆っていた。同日） */
const { open, checker } = require("./lib");

const DAY = "2026-10-28";

(async () => {
  const c = checker("timeline-done-list");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 28, 16, 53)); },
  });
  const ids = await page.evaluate((day) => {
    const s = KN.store;
    s.update((st) => { st.settings.todoRoad = false; });
    const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();
    const done = (t, d, h, m) => { s.update((st) => { const x = st.todos.find((y) => y.id === t.id); x.done = true; x.doneAt = at(d, h, m); }); return t.id; };
    return {
      a: done(s.addTodo({ title: "見学", due: day, time: "10:30", minutes: 45 }), 28, 11, 15),
      b: done(s.addTodo({ title: "洗濯", due: day, time: "13:17", minutes: 60 }), 28, 14, 17),
      c: s.addTodo({ title: "夕ごはん", due: day, time: "19:00", minutes: 60 }).id,
      d: s.addTodo({ title: "ゴミ出し", due: day, time: "21:00", minutes: 30 }).id,
      y: done(s.addTodo({ title: "昨日の用事", due: "2026-10-27", time: "09:00", minutes: 30 }), 27, 9, 20),
    };
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });
  await page.waitForTimeout(300);

  const read = () => page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const list = scr.querySelector(".tl-list");
    return {
      done: [...scr.querySelectorAll(".tl-done > .tl-done-row")].map((li) =>
        `${li.querySelector(".tl-doneat").textContent.trim()} ${li.querySelector(".item-name").textContent.trim()}`),
      ruler: [...list.querySelectorAll(":scope > .tl-row .item-name")].map((x) => x.textContent.trim()),
      first: Math.min(...[...list.querySelectorAll(":scope > .tl-seg, :scope > .tl-fold")].map((x) => Number(x.dataset.at))),
      folds: list.querySelectorAll(":scope > .tl-fold").length,
      now: !!scr.querySelector(".tl-now"),
      above: (() => { const d = scr.querySelector(".tl-done"); return d ? d.getBoundingClientRect().bottom <= list.getBoundingClientRect().top + 1 : null; })(),
    };
  });
  let r = await read();
  c.check("済ませた二件は上の一覧に、済ませた順・済ませた時刻", r.done.join("/") === "11:15 見学/14:17 洗濯", JSON.stringify(r.done));
  c.check("一覧は物差しの上", r.above === true, String(r.above));
  c.check("物差しにはまだの二件だけ", r.ruler.join("/") === "夕ごはん/ゴミ出し", JSON.stringify(r.ruler));
  c.check("物差しの頭はいまの時（16:00）", Number(r.first) === 16 * 60 && r.now, JSON.stringify(r));

  /* 一覧の ✓ で元に戻す → 物差しへ帰る。 */
  await page.click(`#screen-todo .tl-done-row[data-todo-id="${ids.b}"] button.check`);
  await page.waitForFunction((id) => !!document.querySelector(`#screen-todo .tl-row[data-todo-id="${id}"]`), ids.b, { timeout: 5000 });
  r = await read();
  c.check("✓で元に戻すと物差しへ（一覧は一件）",
    r.done.join("/") === "11:15 見学" && r.ruler.includes("洗濯") && !(await page.evaluate((id) => KN.store.getTodo(id).done, ids.b)),
    JSON.stringify(r));

  /* 題を押すと詳細の紙。 */
  await page.click(`#screen-todo .tl-done-row[data-todo-id="${ids.a}"] .tl-open`);
  const sheet = await page.waitForSelector(".sheet", { timeout: 5000 }).then(() => true, () => false);
  c.check("題を押すと詳細の紙", sheet);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 5000 }).catch(() => {});

  /* みな済ませたら、物差しは畳んだ空きと「いま」だけ。 */
  await page.evaluate((list) => {
    KN.store.update((st) => list.forEach((id) => { const x = st.todos.find((y) => y.id === id); x.done = true; x.doneAt = new Date().toISOString(); }));
  }, [ids.b, ids.c, ids.d]);
  await page.waitForFunction(() => !document.querySelector("#screen-todo .tl-list > .tl-row"), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  r = await read();
  c.check("みな済ませたら、物差しは畳んだ空きと「いま」だけ（一覧は四件）",
    r.done.length === 4 && !r.ruler.length && r.folds === 1 && r.now, JSON.stringify(r));

  /* 送っても掴み手は消えず、帯は掴み手の下。 */
  await page.evaluate(() => {
    KN.store.update((st) => st.todos.forEach((x) => { if (x.due === "2026-10-28") { x.done = false; x.doneAt = null; } }));
    for (let i = 0; i < 6; i++) KN.store.addTodo({ title: `用事${i}`, due: "2026-10-28", time: `${17 + (i % 6)}:30`, minutes: 20 });
  });
  await page.waitForTimeout(400);
  const stick = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const sc = KN.app.scrollerOf(scr);
    sc.scrollTop = 300;
    const g = scr.querySelector(".tl-grip").getBoundingClientRect(), f = scr.querySelector(".wk-faces").getBoundingClientRect();
    const s = sc.getBoundingClientRect();
    const hit = document.elementFromPoint(s.left + s.width / 2, g.top + g.height / 2);
    return { scrolled: sc.scrollTop, gripTop: g.top - s.top, gap: f.top - g.bottom, grip: !!(hit && hit.closest(".tl-grip")) };
  });
  c.check("送っても掴み手は紙の頭に見え、帯は掴み手の下",
    stick.scrolled > 100 && stick.gripTop <= 2 && stick.grip && Math.abs(stick.gap + 1) <= 1, JSON.stringify(stick));

  /* ほかの日（昨日）の済ませたものは、物差しの上。 */
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await page.click('#head .cal-day[data-day="2026-10-27"]');
  await page.waitForFunction(() => document.querySelector('#screen-todo .todo-day[data-day="2026-10-27"]'), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const past = await page.evaluate((id) => ({
    ruler: !!document.querySelector(`#screen-todo .tl-list > .tl-row.is-done[data-todo-id="${id}"]`),
    list: !!document.querySelector("#screen-todo .tl-done"),
  }), ids.y);
  c.check("昨日の済ませたものは物差しの上（一覧は出さない）", past.ruler && !past.list, JSON.stringify(past));

  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
