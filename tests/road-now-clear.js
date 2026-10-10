/* いまの時刻は道に重ならない（2026年10月6日、docs/todo-timeline.md の「一日の道」）。
   利用者の声「現在時刻、常に人の真上にあるけど、道と被ってしまう時はずらして」。
   起きる 6:39・寝る 22:30 の一日を 6:40〜22:28 まで 4 分刻みで回し、
   - いまの時刻の箱（ふち 12 点）が道・停留所と isPointInStroke で重ならない
   - 箱は人のそば（横に人の幅＋箱の幅より離れない）・人より上
   - まっすぐな段のなかではずらさない（人の真上） */
const { open, checker } = require("./lib");

const DAY = "2026-10-06";

(async () => {
  const c = checker("road-now-clear");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 6, 40)); },
  });
  await page.evaluate((d) => {
    const s = KN.store;
    s.update((st) => { st.settings.dayStart = "06:39"; st.settings.dayEnd = "22:30"; });
    s.addTodo({ title: "朝のルーティン", due: d, time: "06:39", minutes: 80 });
    s.addTodo({ title: "撮影", due: d, time: "13:30", minutes: 60 });
    s.addTodo({ title: "夜のルーティン", due: d, time: "19:00", minutes: 210 });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);

  const read = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const svg = road.querySelector(".road-svg");
    const box = road.querySelector(".road-map").getBoundingClientRect();
    const k = box.width / KN.dayRoad.W;
    const strokes = [...svg.querySelectorAll(".road-base, .road-stop-edge")].filter((p) => p.getAttribute("d"));
    const now = road.querySelector(".road-now");
    if (!now) return { missing: true };
    /* 人は歩いている途中のことがあるので、箱ではなく「いま」の点（足もと）で測る */
    const g = road.__road.g, q = g.point(g.dist(KN.plan.toMin(KN.util.nowTime())));
    const r = now.getBoundingClientRect();
    const m = { left: box.left + (q.x - 9) * k, right: box.left + (q.x + 9) * k, top: box.top + q.y * k };
    const x0 = (r.left - box.left) / k, x1 = (r.right - box.left) / k;
    const y0 = (r.top - box.top) / k, y1 = (r.bottom - box.top) / k;
    let hit = false;
    for (let i = 0; i <= 3 && !hit; i++) {
      for (const [x, y] of [[x0 + (x1 - x0) * i / 3, y0], [x0 + (x1 - x0) * i / 3, y1], [x0, y0 + (y1 - y0) * i / 3], [x1, y0 + (y1 - y0) * i / 3]]) {
        const p = svg.createSVGPoint(); p.x = x; p.y = y;
        if (strokes.some((s) => s.isPointInStroke(p))) { hit = true; break; }
      }
    }
    const mx = (m.left + m.right) / 2;
    /* 「そば」の箱の幅は、描いた幅ではなくアプリが置くときの見積もり（day-road.js の textW）で測る。
       描いた幅は機械の字で変わる——GitHub は数字が細く、置き場所は同じ（曲がり角で 39）なのに
       「離れすぎ」で落ちた（2026年10月10日、毎日の全部回しの #1）。 */
    const fsK = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fs-k")) || 1;
    const est = ([...now.textContent].reduce((w, ch) => w + (/[0-9]/.test(ch) ? 0.6 : /[:.\s]/.test(ch) ? 0.3 : 1), 0)
      * 11 * fsK + 2) * k;
    return { text: now.textContent, hit, dx: Math.round((r.left + r.right) / 2 - mx),
             near: Math.abs((r.left + r.right) / 2 - mx) <= est + (m.right - m.left) / 2 + 1,
             above: r.bottom <= m.top, arc: !!q.arc, qx: Math.round(q.x), row: q.row };
  });

  const bad = [], flat = [];
  let n = 0;
  for (let t = 6 * 60 + 40; t <= 22 * 60 + 28; t += 4) {
    await page.clock.setFixedTime(new Date(2026, 9, 6, Math.floor(t / 60), t % 60));
    await page.evaluate(() => KN.dayRoad.paintAll(document.querySelector("#screen-todo")));
    const r = await read();
    n++;
    if (r.missing || r.hit || !r.near || !r.above) bad.push(r);
    else if (!r.arc && Math.abs(r.qx - 180) < 60) flat.push(r);
  }
  c.check(`いまの時刻は道に重ならず、人のそばの上（${n} 通り）`, n > 200 && !bad.length, JSON.stringify(bad.slice(0, 5)));

  /* まっすぐな段のなか（両端から離れた所）では、ずらさない */
  c.check("まっすぐな段のなかでは人の真上（ずらさない）", flat.length > 40 && flat.every((r) => Math.abs(r.dx) <= 1),
    JSON.stringify(flat.filter((r) => Math.abs(r.dx) > 1).slice(0, 5)));

  c.check("エラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  c.done();
})();
