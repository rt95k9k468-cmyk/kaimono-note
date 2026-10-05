/* 一日の道：過ぎても済んでいない区間が延びる・長いほうが中心・分が変わると歩く
   （2026年9月30日、docs/todo-timeline.md の「一日の道」）。
   時計を 7:33 に止め、利用者の画面と同じ一日（6:00〜7:00 の朝のルーティン・
   11:50〜17:50 の散歩・12:00〜12:30 のジモティー）を置く。
   - 7:00 を過ぎてまだの朝のルーティンは、人の足もと（7:33）まで延び、色が変わる（is-late）
   - 分が変わる（7:34）と、延びも 7:34 へ、人は歩いて次の足もとへ
   - 済ませると（7:40）、その時刻で止まり、色は戻る
   - 重なった二つは車線に割らず一本道：途中から重なるジモティーは押さず、散歩の上に重ねる
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
      offs: Object.fromEntries(st.stops.map((x) => [x.t.title, x.off])),
      lanes: st.stops.map((x) => [x.t.title, x.lanes]),
      jim: (({ at, until, ga, eu }) => ({ at, until, ga, eu }))(st.stops.find((x) => x.t.title === "ジモティー受け渡し")),
      text: road.textContent,
    };
  });

  let r = await read();
  c.check("7:00 を過ぎてまだの区間は延びる（is-late・終わりが 7:33）", r.late && r.eu === 7 * 60 + 33,
    JSON.stringify([r.late, r.eu]));
  c.check("延びた終わりは人の足もと", Math.abs(r.d1 - r.d1Now) < 0.01, JSON.stringify([r.d1, r.d1Now]));
  c.check("延びた区間は色が変わる（塗りの色ではない橙）", /rgb\(240, 163, 94\)/.test(r.edgeColor), r.edgeColor);
  c.check("延びた区間は塗りきられている", !!r.went, String(r.went));

  /* 重なり：道は一本（2026年10月3日・利用者の声「時間を超過した方が超過したところまで
     伸びて、次の予定がそこから始まった方がいい」）。車線に割らない。途中から重なるものは
     押さず上に重ねる（同日・「途中から途中まで…ならまだ判別できる」）。予定（at/until）と
     札の時刻は元のまま。 */
  c.check("重なっても車線に割らない（どれも off 0・一車線）",
    Object.values(r.offs).every((o) => o === 0) && r.lanes.every(([, n]) => n === 1),
    JSON.stringify([r.offs, r.lanes]));
  c.check("途中から重なるジモティーは押さず、予定どおり 12:00〜12:30 に重ねる",
    r.jim.ga === 12 * 60 && r.jim.eu === 12 * 60 + 30, JSON.stringify(r.jim));
  c.check("予定（12:00〜12:30）は書き換えず、札は予定の時刻",
    r.jim.at === 12 * 60 && r.jim.until === 12 * 60 + 30 && r.text.includes("12:00"), JSON.stringify(r.jim));

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
  /* 7:00 から書類が始まるので、7:40 に押した朝のルーティンは 7:00 で止まる
     （2026年10月1日。延びで重ねて車線を作らない）。時計が進んでも延びない。 */
  c.check("済ませたあとは、時計が進んでも延びない（次の停留所の始まり 7:00 で止まる）", later === 7 * 60, String(later));

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
  /* 分が変わると人は歩いて次の足もとへ進む（角の上では高さも変わる）。歩き終わってから測る。 */
  await page.waitForFunction(() => !document.querySelector("#screen-todo .road-me").__walk, null, { timeout: 4000 });
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

  /* 利用者の夜（2026年10月3日・「夜のオレンジ丸薬、道がおかしい」）：17:00〜21:00 の記念日を
     21:58 に済ませ、19:00〜22:00 の夜の用事はまだ、いま 22:37。夜の用事は予定どおり 19:00 から
     記念日の上に重なり、終わりは延びて道の終わり（寝る時刻）で止まる。予定は書き換えない。 */
  await page.clock.setFixedTime(new Date(2026, 8, 30, 17, 50));
  await page.evaluate((id) => KN.store.toggleTodo(id), ids.walk);
  const eve = await page.evaluate((day) => ({
    anniv: KN.store.addTodo({ title: "記念日", due: day, time: "17:00", minutes: 240 }).id,
    night: KN.store.addTodo({ title: "夜の用事", due: day, time: "19:00", minutes: 180 }).id,
  }), DAY);
  await page.clock.setFixedTime(new Date(2026, 8, 30, 21, 58));
  await page.evaluate((id) => KN.store.toggleTodo(id), eve.anniv);
  await page.clock.setFixedTime(new Date(2026, 8, 30, 22, 37));
  await page.evaluate(() => KN.dayRoad.paintAll(document.querySelector("#screen-todo")));
  await page.waitForTimeout(400);
  const night = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road;
    const pick = (t) => { const k = st.stops.findIndex((x) => x.t.title === t); const s = st.stops[k];
      return { at: s.at, until: s.until, ga: s.ga, eu: s.eu, off: s.off,
               late: road.querySelector(`.road-stop[data-s="${k}"]`).classList.contains("is-late") }; };
    return { anniv: pick("記念日"), night: pick("夜の用事"), end: st.g.end,
             labels: [...road.querySelectorAll(".road-label")].map((b) => b.textContent.replace(/\s+/g, " ").trim()) };
  });
  c.check("夜：記念日は予定どおり 17:00 から、済ませた 21:58 まで", night.anniv.ga === 17 * 60 && night.anniv.eu === 21 * 60 + 58, JSON.stringify(night.anniv));
  c.check("夜：まだの夜の用事は予定どおり 19:00 から重ね、道の終わり（寝る時刻）まで橙",
    night.night.ga === 19 * 60 && night.night.eu === Math.min(22 * 60 + 37, night.end) && night.night.late,
    JSON.stringify([night.night, night.end]));
  c.check("夜：二つとも道の中心（車線に割らない）", night.anniv.off === 0 && night.night.off === 0, JSON.stringify(night));
  c.check("夜：予定（19:00〜22:00）は書き換えず、札は 19:00",
    night.night.at === 19 * 60 && night.night.until === 22 * 60 && night.labels.some((l) => l.startsWith("19:00") && l.includes("夜の用事")),
    JSON.stringify([night.night, night.labels]));

  /* 過ぎた日（2026年9月29日・A＋C）：次の日の時計にして、この日を開く。
     道は薄いまま停留所だけ塗る。区間は押した時刻まで延ばさず、押した時刻に淡い丸薬（停留所と重なれば斜線）。 */
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
    const dots = [...road.querySelectorAll(".road-steps.is-stops .road-step")]
      .map((c) => ({ x: Number(c.dataset.cx), y: Number(c.dataset.cy) }));
    const pill = road.querySelector(".road-steps.is-stops .road-step");
    return {
      cls: road.className, went: road.querySelector(".road-went").getAttribute("d"),
      eu: s.eu, d1: s.d1, d1Want: g.dist(7 * 60 + 20, true),
      stopWent: !!grp.querySelector(".road-stop-went").getAttribute("d"),
      late: grp.classList.contains("is-late"),
      stopPale: getComputedStyle(grp.querySelector(".road-stop-went")).stroke
        === getComputedStyle(road.querySelector(".road-went")).stroke,
      hatch: !!pill && pill.classList.contains("is-over"),
      fill: pill ? getComputedStyle(pill.querySelector(".road-stop-in")).stroke : null,
      edge: pill ? getComputedStyle(pill.querySelector(".road-stop-edge")).stroke : null,
      pale: pill ? getComputedStyle(pill.querySelector(".road-stop-edge")).stroke
        === getComputedStyle(road.querySelector(".road-went") || road).stroke : false,
      dots, want: { x: want.x, y: want.y },
    };
  });
  c.check("過ぎた日：道は塗らない（これからの薄い色のまま）", /is-past/.test(past.cls) && !past.went,
    JSON.stringify([past.cls, past.went]));
  c.check("過ぎた日：停留所は過去の薄さで塗る", past.stopWent && !past.late && past.stopPale,
    JSON.stringify([past.stopWent, past.late, past.stopPale]));
  c.check("過ぎた日：区間は押した時刻（7:40）まで延ばさず、決めた 7:20 のまま",
    past.eu === 7 * 60 + 20 && Math.abs(past.d1 - past.d1Want) < 0.01, JSON.stringify([past.eu, past.d1, past.d1Want]));
  c.check("過ぎた日：押した時刻（7:40）の道の上に淡い丸薬。停留所（7:20 まで）と離れているので斜線でなく塗り",
    past.dots.some((d) => Math.abs(d.x - past.want.x) < 0.2 && Math.abs(d.y - past.want.y) < 0.2)
      && !past.hatch && past.pale && past.fill === past.edge,
    JSON.stringify([past.dots, past.want, past.hatch, past.pale, past.fill, past.edge]));

  c.check("評価の言葉を出さない", !/遅れ|予定通り|達成|未達|できなかった|超過/.test(r.text), r.text);
  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
