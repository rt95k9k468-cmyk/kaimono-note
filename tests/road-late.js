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
    Math.abs(r.walkY - r.row) < 0.2 && Math.abs(r.jimY - (r.row + 13.5)) < 0.2,
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
  /* 過ぎた日で見る用に、7:00〜7:20 の書類を 7:40 に済ませる（今日は 7:40 まで延びる）。 */
  const paper = await page.evaluate((day) => {
    const t = KN.store.addTodo({ title: "書類を出す", due: day, time: "07:00", minutes: 20 });
    KN.store.toggleTodo(t.id);
    return t.id;
  }, DAY);
  await page.waitForTimeout(400);
  c.check("済ませたら、その時刻（7:40）で止まり、色は戻る",
    done.k >= 0 && done.eu === 7 * 60 + 40 && !done.late && done.done, JSON.stringify(done));
  await page.clock.setFixedTime(new Date(2026, 8, 30, 8, 10));
  await page.evaluate(() => KN.dayRoad.paintAll(document.querySelector("#screen-todo")));
  const later = await page.evaluate(() => {
    const st = document.querySelector("#screen-todo .day-road").__road;
    return st.stops.find((s) => s.t.title === "朝のルーティン").eu;
  });
  c.check("済ませたあとは、時計が進んでも延びない", later === 7 * 60 + 40, String(later));

  const paperEu = await page.evaluate(() =>
    document.querySelector("#screen-todo .day-road").__road.stops.find((s) => s.t.title === "書類を出す").eu);
  c.check("今日は、決めた終わりより後に済ませると押した時刻まで延びる（変えない）", paperEu === 7 * 60 + 40, String(paperEu));

  /* 決めた終わりより前に済ませたら縮む（2026年9月30日・12:00〜12:30 を 12:02 に）。
     いまの時刻は人の頭の上。札の題は見積もりで切り、時刻とのあいだに空白を残さない。 */
  await page.clock.setFixedTime(new Date(2026, 8, 30, 12, 2));
  await page.evaluate((id) => KN.store.toggleTodo(id), ids.jimoty);
  await page.clock.setFixedTime(new Date(2026, 8, 30, 12, 20));
  await page.evaluate(() => KN.dayRoad.paintAll(document.querySelector("#screen-todo")));
  await page.waitForTimeout(600);
  const noon = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const s = road.__road.stops.find((x) => x.t.title === "ジモティー受け渡し");
    const me = road.querySelector(".road-me").getBoundingClientRect();
    const now = road.querySelector(".road-now");
    const nr = now && now.getBoundingClientRect();
    const labels = [...road.querySelectorAll(".road-label span")].map((x) => [x.textContent, x.scrollWidth - x.clientWidth]);
    return { eu: s.eu, now: now && now.textContent, above: nr && nr.bottom <= me.top + 1,
             across: nr && nr.left < me.right && nr.right > me.left, labels };
  });
  c.check("決めた終わりより前に済ませると、押した時刻（12:02）で縮む", noon.eu === 12 * 60 + 2, String(noon.eu));
  c.check("いまの時刻は人の頭の上", noon.now === "12:20" && noon.above && noon.across, JSON.stringify(noon));
  c.check("札の題は CSS の省略に頼らない（時刻とのあいだに空白が残らない）",
    noon.labels.every(([, over]) => over <= 1), JSON.stringify(noon.labels));

  /* 過ぎた日（2026年9月29日・A＋C）：次の日の時計にして、この日を開く。
     道は薄いまま停留所だけ塗る。区間は押した時刻まで延ばさず、押した時刻に白い粒。 */
  await page.clock.setFixedTime(new Date(2026, 9, 1, 9, 0));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(400);
  await page.evaluate((d) => KN.screens.todo.goDay(d), DAY);
  await page.waitForTimeout(900);
  const past = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road, g = st.g;
    const k = st.stops.findIndex((s) => s.t.title === "書類を出す");
    const s = st.stops[k];
    const grp = road.querySelector(`.road-stop[data-s="${k}"]`);
    const want = g.point(g.dist(7 * 60 + 40));
    const dots = [...road.querySelectorAll(".road-steps.is-stops circle")]
      .map((c) => ({ x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) }));
    return {
      cls: road.className, went: road.querySelector(".road-went").getAttribute("d"),
      eu: s.eu, d1: s.d1, d1Want: g.dist(7 * 60 + 20, true),
      stopWent: !!grp.querySelector(".road-stop-went").getAttribute("d"),
      late: grp.classList.contains("is-late"),
      fill: getComputedStyle(road.querySelector(".road-steps.is-stops circle") || road).fill,
      dots, want: { x: want.x, y: want.y },
    };
  });
  c.check("過ぎた日：道は塗らない（これからの薄い色のまま）", /is-past/.test(past.cls) && !past.went,
    JSON.stringify([past.cls, past.went]));
  c.check("過ぎた日：停留所は塗る", past.stopWent && !past.late, JSON.stringify([past.stopWent, past.late]));
  c.check("過ぎた日：区間は押した時刻（7:40）まで延ばさず、決めた 7:20 のまま",
    past.eu === 7 * 60 + 20 && Math.abs(past.d1 - past.d1Want) < 0.01, JSON.stringify([past.eu, past.d1, past.d1Want]));
  c.check("過ぎた日：押した時刻（7:40）の道の上に白い粒",
    past.dots.some((d) => Math.abs(d.x - past.want.x) < 0.2 && Math.abs(d.y - past.want.y) < 0.2)
      && /rgb\(255, 255, 255\)/.test(past.fill),
    JSON.stringify([past.dots, past.want, past.fill]));

  c.check("評価の言葉を出さない", !/遅れ|予定通り|達成|未達|できなかった|超過/.test(r.text), r.text);
  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
