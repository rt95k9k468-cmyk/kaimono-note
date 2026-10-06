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
        let best = null;
        st.stops.forEach((s) => {
          for (let d = s.d0; d <= s.d1; d += 0.5) {
            const p = st.g.point(d), e = Math.hypot(p.x - x, p.y - y);
            if (!best || e < best.e) best = { e, t: s.t.title, arc: !!p.arc };
          }
        });
        return best && best.e < 12 ? (best.arc ? "角:" : "") + best.t : `?${x},${y}`;
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
  c.check("曲がり角の上の丸薬からは引き出し線を引かない（7:39 の夜のルーティンも札は出る）",
    !r.ties.some((t) => /^角:|^\?/.test(t)) && r.labels.includes("夜のルーティン"), JSON.stringify([r.ties, r.labels]));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/road-done.png`,
    clip: await page.evaluate(() => { const b = document.querySelector("#screen-todo .day-road").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }) });
  c.check("評価の言葉を出さない", !/遅れ|超過|予定通り|達成|早い|前倒し/.test(r.text), r.text);
  c.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();

  /* 同じ時刻に始まる二つは短いほうを斜線・曲がり角の札は線なし（2026年10月5日）。
     7:30〜9:30 の朝のルーティンを 8:00 に、7:30〜8:30 の朝のBaby を 8:20 に済ませた（前の用事の
     あいだに済ませたので押さずに 7:30 から二つ）。11:50〜12:10 の杏へ電話（12:10）はまん中が 12:00 の角。
     13:15〜14:15 の保育園（14:15）の途中に 13:30〜13:45 の電話（13:45）。 */
  const b2 = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 1, 19, 39)); },
  });
  await b2.page.evaluate((day) => {
    const s = KN.store;
    s.update((x) => { x.settings.dayStart = "05:30"; x.settings.dayEnd = "22:30"; });
    const mk = (title, time, minutes, h, m) => {
      const t = s.addTodo({ title, due: day, time, minutes });
      s.toggleTodo(t.id);
      s.update((x) => { x.todos.find((y) => y.id === t.id).doneAt = new Date(2026, 9, 1, h, m).toISOString(); });
    };
    mk("朝のルーティン", "07:30", 120, 8, 0);
    mk("朝のBaby", "07:30", 60, 8, 20);
    mk("杏へ電話", "11:50", 20, 12, 10);
    mk("保育園", "13:15", 60, 14, 15);
    mk("電話", "13:30", 15, 13, 45);
  }, DAY);
  await b2.page.click('.tab[data-tab="todo"]');
  await b2.page.waitForTimeout(800);
  const q = await b2.page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road;
    const k = (t) => st.stops.findIndex((s) => s.t.title === t);
    const grp = (t) => road.querySelector(`.road-stop[data-s="${k(t)}"]`);
    const s = st.stops[k("杏へ電話")];
    const m = (s.d0 + s.d1) / 2, a = Math.max(s.d0, m - 8);   // capIn（短い丸薬は前寄り）のまん中
    const p = st.g.point(s.d1 - s.d0 <= 16 ? (a + m) / 2 : m);
    const rt = st.stops[k("保育園")];
    const lab = road.querySelector(`.road-label[data-k="${k("杏へ電話")}"]`);
    return {
      over: Object.fromEntries(st.stops.map((x) => [x.t.title, { ga: x.ga, eu: x.eu, over: x.over, isOver: grp(x.t.title).classList.contains("is-over") }])),
      onTop: !!(grp("朝のBaby").compareDocumentPosition(grp("朝のルーティン")) & 4),
      // 済ませた（塗った）斜線の丸薬にも、塗りの上に斜線が見える
      wentHatch: ["朝のルーティン", "朝のBaby"].map((t) => {
        const w = grp(t).querySelector(".road-stop-went"), h = grp(t).querySelector(".road-stop-went-hatch");
        return !!w.getAttribute("d") && h.getAttribute("d") === w.getAttribute("d") && getComputedStyle(h).display !== "none";
      }),
      arc: p.arc, lab: lab && lab.textContent.trim(),
      dy: lab && Math.abs(parseFloat(lab.style.top) / 100 * st.g.H - p.y),
      ties: [...road.querySelectorAll(".road-ties line")].map((l) => Math.hypot(+l.getAttribute("x1") - p.x, +l.getAttribute("y1") - p.y)),
      // 電話と重なる保育園（まっすぐの上）からは線が出る
      rtTie: [...road.querySelectorAll(".road-ties line")].some((l) => {
        for (let d = rt.d0; d <= rt.d1; d += 0.5) {
          const q2 = st.g.point(d);
          if (!q2.arc && Math.hypot(+l.getAttribute("x1") - q2.x, +l.getAttribute("y1") - q2.y) < 12) return true;
        }
        return false;
      }),
    };
  });
  const O = q.over;
  c.check("同じ 7:30 に始まる二つ：短いほう（朝のルーティン、8:00 まで）が斜線、長いほうは塗り",
    O["朝のルーティン"].ga === O["朝のBaby"].ga && O["朝のルーティン"].isOver && !O["朝のBaby"].isOver, JSON.stringify(O));
  c.check("斜線のほうが上に描かれる", q.onTop, String(q.onTop));
  c.check("済ませて塗ったあとも斜線が見える（塗りの上に白の斜線）、塗りのほうは無地",
    q.wentHatch[0] && !q.wentHatch[1], JSON.stringify(q.wentHatch));
  c.check("まっすぐの上で重なる保育園には引き出し線", q.rtTie, JSON.stringify(q));
  c.check("まん中が角の済んだ札：角の内側の同じ高さ（一行ぶんまで）に置き、線は引かない",
    q.arc && q.lab === "杏へ電話" && q.dy <= 14 + 2 && !q.ties.some((d) => d < 16), JSON.stringify(q));
  if (process.env.SHOTS) await b2.page.screenshot({ path: `${process.env.SHOTS}/road-done-2.png`,
    clip: await b2.page.evaluate(() => { const b = document.querySelector("#screen-todo .day-road").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }) });
  c.check("ページのエラーなし（二つめ）", !b2.errors.length, b2.errors.join("\n"));
  await b2.browser.close();
  c.done();
})();
