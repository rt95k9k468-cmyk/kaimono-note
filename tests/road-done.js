/* 一日の道：済ませた停留所の描き方（2026年10月1日、docs/todo-timeline.md の「一日の道」）。
   時計を 19:39 に止め、利用者の画面と同じ一日を置く（起きる 5:30・寝る 22:30）：
   6:00〜7:00 の朝のルーティン（10:49 に済ませた）・8:00〜11:00 の朝のBaby（13:17）・
   13:45〜17:45 の用事（17:29）・20:00 の分別ごみ（長さなし、19:30）・
   20:00〜21:00 の夜のルーティン（19:39）。
   - 遅れて押した区間は、次の停留所の始まりまでしか延びない（車線に割れない）
   - 次の停留所が無ければ、押した時刻まで延びる（前のまま）
   - 始まりより前に済ませたものは、済ませた時刻に置き、札の時刻もその時刻
   - 評価の言葉を出さない */
const { open, checker } = require("./lib");

const DAY = "2026-10-01";

(async () => {
  const c = checker("road-done");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 1, 19, 39)); },
  });
  await page.evaluate((day) => {
    const s = KN.store;
    s.update((x) => { x.settings.dayStart = "05:30"; x.settings.dayEnd = "22:30"; });
    const mk = (title, time, minutes, h, m) => {
      const t = s.addTodo({ title, due: day, time, minutes });
      s.toggleTodo(t.id);
      s.update((x) => { x.todos.find((y) => y.id === t.id).doneAt = new Date(2026, 9, 1, h, m).toISOString(); });
    };
    mk("朝のルーティン", "06:00", 60, 10, 49);
    mk("朝のBaby", "08:00", 180, 13, 17);
    mk("晴菜", "13:45", 240, 17, 29);
    mk("分別ごみ", "20:00", 0, 19, 30);
    mk("夜のルーティン", "20:00", 60, 19, 39);
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road;
    const by = (t) => st.stops.find((s) => s.t.title === t);
    const labels = [...road.querySelectorAll(".road-label")].map((b) => b.textContent.replace(/\s+/g, " ").trim());
    return {
      stops: Object.fromEntries(st.stops.map((s) => [s.t.title, { at: s.at, eu: s.eu, lanes: s.lanes, d0: s.d0 }])),
      dNow: st.g.dist(st.last),
      d2000: st.g.dist(20 * 60),
      labels, text: road.textContent,
      /* 引き出し線の根もとが、どの停留所のまん中のそばか */
      ties: [...road.querySelectorAll(".road-ties line")].map((l) => {
        const x = +l.getAttribute("x1"), y = +l.getAttribute("y1");
        const near = st.stops.find((s) => {
          const p = st.g.point((s.d0 + s.d1) / 2);
          return Math.hypot(p.x - x, p.y - y) < 16;
        });
        return near ? near.t.title : `?${x},${y}`;
      }),
    };
  });
  const S = r.stops;
  c.check("10:49 に押した朝のルーティンは、朝のBaby の始まり 8:00 で止まる", S["朝のルーティン"].eu === 8 * 60,
    JSON.stringify(S["朝のルーティン"]));
  c.check("13:17 に押した朝のBaby は、次（13:45）より前なので 13:17 まで", S["朝のBaby"].eu === 13 * 60 + 17,
    JSON.stringify(S["朝のBaby"]));
  c.check("どれも車線に割れない", Object.values(S).every((s) => s.lanes === 1), JSON.stringify(S));
  c.check("19:39 に済ませた夜のルーティンは 19:39 に置く（20:00 ではない）",
    S["夜のルーティン"].at === 19 * 60 + 39 && S["夜のルーティン"].d0 <= r.dNow + 0.01 && S["夜のルーティン"].d0 < r.d2000,
    JSON.stringify([S["夜のルーティン"], r.dNow, r.d2000]));
  c.check("19:30 に済ませた分別ごみ（長さなし）は 19:30 に置く", S["分別ごみ"].at === 19 * 60 + 30,
    JSON.stringify(S["分別ごみ"]));
  /* 済んだものの札は名前だけ（2026年10月5日。時刻は丸薬の位置で読む）。 */
  c.check("済んだものの札は名前だけ（時刻を出さない）",
    r.labels.includes("夜のルーティン") && !r.labels.some((t) => /\d:\d\d/.test(t)),
    JSON.stringify(r.labels));
  /* 引き出し線は、その時間帯に丸薬がほかにもあるときだけ（2026年10月5日）。 */
  c.check("ひとりの丸薬（朝のルーティン・朝のBaby・晴菜）には引き出し線を引かない",
    !r.ties.some((t) => ["朝のルーティン", "朝のBaby", "晴菜"].includes(t)), JSON.stringify(r.ties));
  c.check("触れ合う分別ごみと夜のルーティンには引き出し線",
    r.ties.length >= 1 && r.ties.every((t) => t === "分別ごみ" || t === "夜のルーティン"), JSON.stringify(r.ties));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/road-done.png`,
    clip: await page.evaluate(() => { const b = document.querySelector("#screen-todo .day-road").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }) });
  c.check("評価の言葉を出さない", !/遅れ|超過|予定通り|達成|早い|前倒し/.test(r.text), r.text);
  c.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
