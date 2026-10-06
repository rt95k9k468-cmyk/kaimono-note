/* 一日の道：10月2日の手直し（docs/todo-timeline.md の「10月2日の手直し」）。
   時計を 10/3 9:40 に止め、利用者の画面に近い一日（6:00〜7:00 の朝のルーティンがまだ・
   8:00〜11:00 の朝のBaby とテストが重なる）を置く。
   - まだのまま延びた区間は、尻の丸のまん中が延びた終わり（丸い端でくるむ）。次の停留所（朝のBaby 8:00）が
     始まっていても止めず、その上に重ねていま（9:40）まで。朝のBaby はずらさない（10月3日）
   - 同じ角で同じ時刻に始まる二つの札は、次の段の車線と同じ上下の順で、丸薬に重ならない
   - 起きた時刻（daily の起床）があっても、道の長さは設定の一日のまま（10月6日）。中身は実際に：
     起きる前・寝たあとは寝床の紫、起きる前の用事は起きた時刻から、寝床の下は実際の時刻 */
const { open, checker } = require("./lib");

const DAY = "2026-10-03";

(async () => {
  const c = checker("road-wake");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 3, 9, 40)); },
  });
  await page.evaluate((day) => {
    const s = KN.store;
    s.update((x) => { x.settings.dayStart = "05:30"; x.settings.dayEnd = "22:30"; });
    s.addTodo({ title: "朝のルーティン", due: day, time: "06:00", minutes: 60 });
    s.addTodo({ title: "朝のBaby", due: day, time: "08:00", minutes: 180 });
    s.addTodo({ title: "テスト", due: day, time: "08:00", minutes: 180 });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);

  const read = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road, g = st.g;
    const k = st.stops.findIndex((s) => s.late);
    const end = (d) => { const m = d.match(/([-\d.]+)[ ,]([-\d.]+)\s*$/); return m ? { x: +m[1], y: +m[2] } : null; };
    const late = k < 0 ? null : (() => {
      const s = st.stops[k];
      const d = road.querySelector(`.road-stop[data-s="${k}"] .road-stop-edge`).getAttribute("d");
      return { end: end(d), feet: g.point(g.dist(s.eu), s.off), eu: s.eu };
    })();
    const box = road.querySelector(".road-map").getBoundingClientRect();
    const kx = box.width / KN.dayRoad.W;
    const labels = [...road.querySelectorAll(".road-label")].map((b) => {
      const r = b.getBoundingClientRect(), sp = b.querySelector("span");
      return { title: sp ? sp.textContent.trim() : "", y: (r.top + r.height / 2 - box.top) / kx,
               top: (sp.getBoundingClientRect().top - box.top) / kx, bot: (sp.getBoundingClientRect().bottom - box.top) / kx };
    });
    const lanes = st.stops.filter((s) => s.at === 480).map((s) => {
      const p = g.point(g.dist(600), s.off);   // 10:00、次の段のまっすぐ
      return { title: s.t.title, y: p.y };
    });
    const slept = [...road.querySelectorAll(".road-slept")];
    const ink = road.querySelector(".road-bed-ink .bed-frame");
    return { late, labels, lanes, begin: g.begin, end: g.end, slept: slept.length,
             sleptStroke: slept[0] ? getComputedStyle(slept[0]).stroke : null, bedInk: ink ? getComputedStyle(ink).fill : null, edge: [...road.querySelectorAll(".road-edge")].map((e) => e.textContent.trim()) };
  });

  let r = await read();
  c.check("まだのまま延びた区間がある", !!r.late);
  /* 朝のBaby とテストは同じ 8:00 始まりなので、片方は 8:00・もう片方はその終わりから（始まりの重なり）。 */
  const wk = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road"), st = road.__road;
    const grps = [...road.querySelectorAll(".road-stop[data-s]")];
    return { ga: st.stops.filter((s) => s.at === 480).map((s) => s.ga),
             top: grps[grps.length - 1].getAttribute("data-s") === String(st.stops.findIndex((s) => s.late)) };
  });
  c.check("8:00 の用事は延びに押されない（8:00 から）・橙がいちばん上",
    Math.min(...wk.ga) === 8 * 60 && wk.top, JSON.stringify(wk));
  c.check("延びた区間は次の停留所（8:00）の上に重ねていま 9:40 まで、尻の丸のまん中がそこ",
    !!r.late && r.late.eu === 9 * 60 + 40 && Math.hypot(r.late.end.x - r.late.feet.x, r.late.end.y - r.late.feet.y) < 0.6, JSON.stringify(r.late));

  const lab = (t) => r.labels.find((l) => l.title === t);
  const lane = (t) => r.lanes.find((l) => l.title === t);
  c.check("重なった二つの札が両方出る", !!lab("朝のBaby") && !!lab("テスト"), JSON.stringify(r.labels));
  if (lab("朝のBaby") && lab("テスト")) {
    const upLab = lab("朝のBaby").y < lab("テスト").y ? "朝のBaby" : "テスト";
    const upLane = lane("朝のBaby").y < lane("テスト").y ? "朝のBaby" : "テスト";
    c.check("札の上下が、次の段の車線の上下と同じ", upLab === upLane, JSON.stringify({ upLab, upLane, l: r.labels, n: r.lanes }));
    const topLane = Math.min(lane("朝のBaby").y, lane("テスト").y);
    c.check("札の字が車線の丸薬に重ならない", Math.max(lab("朝のBaby").bot, lab("テスト").bot) <= topLane - 8 + 0.5,
      JSON.stringify({ l: r.labels, topLane }));
  }
  c.check("道は設定の起きる時刻 5:30 から", r.begin === 5 * 60 + 30, String(r.begin));

  c.check("起きた時刻が無ければ紫の区間は無い", r.slept === 0, String(r.slept));

  /* 起きた時刻（daily の起床）を入れても、道の長さは設定の一日のまま（10月6日・利用者の声
     「日によって動くのが分かりにくい」）。中身は実際に合わせる（同日・利用者の声「5:30 より
     長く寝ていたらそこを紫に・丸薬は起床以降・実際の時刻は寝る人の下に」）。 */
  await page.evaluate((day) => KN.store.setDayLog(day, { wake: "07:12", sleep: "22:05" }), DAY);
  await page.evaluate(() => KN.screens.todo.render && KN.screens.todo.render());
  await page.waitForTimeout(600);
  r = await read();
  c.check("起きた時刻 7:12 があっても、道は 5:30 から 22:30 まで", r.begin === 5 * 60 + 30 && r.end === 22 * 60 + 30, JSON.stringify([r.begin, r.end]));
  /* 紫は薄くなった寝床と同じ薄さ（濃い寝床の色そのものではない）。 */
  const rgb = (v) => { const n = (v || "").match(/[\d.]+/g).map(Number); return v.startsWith("rgb") ? n.map((x) => x / 255) : n; };
  const [sr, sg, sb] = rgb(r.sleptStroke);
  c.check("5:30〜7:12 と 22:05〜22:30 は薄い紫（寝ていたぶん）",
    r.slept === 2 && r.sleptStroke !== r.bedInk && sb > sr && sb > sg && Math.min(sr, sg, sb) > 0.8, JSON.stringify([r.slept, r.sleptStroke, r.bedInk]));
  c.check("寝床の下の時刻は実際の 7:12 と 22:05", JSON.stringify(r.edge) === JSON.stringify(["7:12", "22:05"]), JSON.stringify(r.edge));
  const early = await page.evaluate(() => {
    const st = document.querySelector("#screen-todo .day-road").__road;
    const s = st.stops.find((x) => x.t.title === "朝のルーティン");
    return s && { at: s.at, until: s.until, d0: s.d0, wake: st.g.dist(7 * 60 + 12) };
  });
  c.check("起きる前の用事は起きた時刻に始まったものとして、長さはそのまま（丸薬は 7:12 から）",
    !!early && early.at === 7 * 60 + 12 && early.until === 8 * 60 + 12 && Math.abs(early.d0 - early.wake) < 0.01, JSON.stringify(early));
  /* 済ませた時刻まで丸薬は延びる（ずらしたあとの終わり 8:12 より後に済ませたら、そこまで）。 */
  await page.evaluate(() => {
    KN.store.update((st) => {
      const x = st.todos.find((y) => y.title === "朝のルーティン");
      x.done = true; x.doneAt = new Date(2026, 9, 3, 8, 40).toISOString();
    });
  });
  await page.evaluate(() => KN.screens.todo.render && KN.screens.todo.render());
  await page.waitForTimeout(600);
  const done = await page.evaluate(() => {
    const st = document.querySelector("#screen-todo .day-road").__road;
    const s = st.stops.find((x) => x.t.title === "朝のルーティン");
    return s && { ga: s.ga, eu: s.eu };
  });
  c.check("済ませた 8:40 まで丸薬が延びる", !!done && done.ga === 7 * 60 + 12 && done.eu === 8 * 60 + 40, JSON.stringify(done));
  const wakeRec = await page.evaluate((day) => KN.store.dayLog(day).wake, DAY);
  c.check("記録は書き換えない", wakeRec === "07:12", wakeRec);

  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
