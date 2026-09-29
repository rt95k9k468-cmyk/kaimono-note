/* 一日の道：過ぎても済んでいない区間が延びる・長いほうが中心・分が変わると歩く
   （2026年9月30日、docs/todo-timeline.md の「一日の道」）。
   時計を 7:33 に止め、利用者の画面と同じ一日（6:00〜7:00 の朝のルーティン・
   11:50〜17:50 の散歩・12:00〜12:30 のジモティー）を置く。
   - 7:00 を過ぎてまだの朝のルーティンは、人の足もと（7:33）まで延び、色が変わる（is-late）
   - 分が変わる（7:34）と、延びも 7:34 へ、人は歩いて次の足もとへ
   - 済ませると（7:40）、その時刻で止まり、色は戻る
   - 重なった二つは、長い散歩が道の中心・短いジモティーがその外にくっつく
   - 評価の言葉を出さない */
const { open, checker } = require("./lib");

const DAY = "2026-09-30";

(async () => {
  const c = checker("road-late");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 30, 7, 33)); },
  });

  const ids = await page.evaluate((day) => {
    const s = KN.store;
    return {
      routine: s.addTodo({ title: "朝のルーティン", due: day, time: "06:00", minutes: 60, repeat: "daily" }).id,
      walk: s.addTodo({ title: "散歩へ", due: day, time: "11:50", minutes: 360 }).id,
      jimoty: s.addTodo({ title: "ジモティー受け渡し", due: day, time: "12:00", minutes: 30 }).id,
    };
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);

  const read = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road, g = st.g;
    const k = st.stops.findIndex((s) => s.t.title === "朝のルーティン");
    const grp = road.querySelector(`.road-stop[data-s="${k}"]`);
    const y0 = (title) => {
      const i = st.stops.findIndex((s) => s.t.title === title);
      const d = road.querySelector(`.road-stop[data-s="${i}"] .road-stop-edge`).getAttribute("d");
      return Number((d.match(/^M[-\d.]+ ([-\d.]+)/) || [])[1]);
    };
    const me = road.querySelector(".road-me");
    const m = (me.getAttribute("transform") || "").match(/translate\(([-\d.]+) ([-\d.]+)\)/);
    const s = st.stops[k];
    return {
      late: grp.classList.contains("is-late"), eu: s.eu, d1: s.d1,
      d1Now: g.dist(st.last, true),
      went: grp.querySelector(".road-stop-went").getAttribute("d"),
      edgeColor: getComputedStyle(grp.querySelector(".road-stop-edge")).stroke,
      me: m ? { x: Number(m[1]), y: Number(m[2]) } : null,
      walking: !!me.__walk,
      row: g.rowY(g.point(g.dist(720)).row),
      walkY: y0("散歩へ"), jimY: y0("ジモティー受け渡し"),
      lanes: st.stops.map((x) => [x.t.title, x.lanes]),
      text: road.textContent,
    };
  });

  let r = await read();
  c.check("7:00 を過ぎてまだの区間は延びる（is-late・終わりが 7:33）", r.late && r.eu === 7 * 60 + 33,
    JSON.stringify([r.late, r.eu]));
  c.check("延びた終わりは人の足もと", Math.abs(r.d1 - r.d1Now) < 0.01, JSON.stringify([r.d1, r.d1Now]));
  c.check("延びた区間は色が変わる（塗りの色ではない橙）", /rgb\(240, 163, 94\)/.test(r.edgeColor), r.edgeColor);
  c.check("延びた区間は塗りきられている", !!r.went, String(r.went));

  /* 重なり：長いほうが中心、短いほうは外にくっつく（右へ進む段：下） */
  c.check("長い散歩が道の中心、短いジモティーはその外（下）にくっつく",
    Math.abs(r.walkY - r.row) < 0.2 && Math.abs(r.jimY - (r.row + 10.5)) < 0.2,
    JSON.stringify([r.row, r.walkY, r.jimY, r.lanes]));

  /* 分が変わる → 延びも人も進む。人は歩く。 */
  const me733 = r.me;
  await page.clock.setFixedTime(new Date(2026, 8, 30, 7, 34));
  await page.evaluate(() => KN.dayRoad.paintAll(document.querySelector("#screen-todo")));
  r = await read();
  c.check("分が変わると、人が歩きだす", r.walking, JSON.stringify(r.walking));
  c.check("分が変わると、延びた区間も 7:34 へ", r.eu === 7 * 60 + 34, String(r.eu));
  await page.waitForTimeout(2600);
  r = await read();
  c.check("歩き終わると、人は 7:34 の足もとに（前より先）", !r.walking && r.me && r.me.x > me733.x + 0.5,
    JSON.stringify([me733, r.me]));

  /* 済ませる（7:40）→ そこで止まり、色は戻る */
  await page.clock.setFixedTime(new Date(2026, 8, 30, 7, 40));
  await page.evaluate((id) => KN.store.toggleTodo(id), ids.routine);
  await page.waitForTimeout(600);
  const done = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road;
    const k = st.stops.findIndex((s) => s.t.title === "朝のルーティン");
    const grp = road.querySelector(`.road-stop[data-s="${k}"]`);
    return { k, eu: k >= 0 ? st.stops[k].eu : null, late: grp && grp.classList.contains("is-late"),
             done: grp && grp.classList.contains("is-done") };
  });
  c.check("済ませたら、その時刻（7:40）で止まり、色は戻る",
    done.k >= 0 && done.eu === 7 * 60 + 40 && !done.late && done.done, JSON.stringify(done));
  await page.clock.setFixedTime(new Date(2026, 8, 30, 8, 10));
  await page.evaluate(() => KN.dayRoad.paintAll(document.querySelector("#screen-todo")));
  const later = await page.evaluate(() => {
    const st = document.querySelector("#screen-todo .day-road").__road;
    return st.stops.find((s) => s.t.title === "朝のルーティン").eu;
  });
  c.check("済ませたあとは、時計が進んでも延びない", later === 7 * 60 + 40, String(later));

  c.check("評価の言葉を出さない", !/遅れ|予定通り|達成|未達|できなかった|超過/.test(r.text), r.text);
  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
