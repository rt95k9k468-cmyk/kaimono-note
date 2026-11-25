/* 畳んだ長い空きは字なしの点線・背 18px（磨4・2026年11月25日。前は 44px に「〜 まで予定なし 〜」）。
   「いま」の線が畳みの中を通っても、線と点線だけ（よける字が無い）。
   夜のルーティンと燃えるゴミを済ませ、21:36 に見る（あとは 22:30 まで予定なし）。
   点検6（2026年11月25日）：10:30 に、10:00〜10:30 の用事・時刻なし（10:30 ごろ）・14:00 の日を開く——いまの札は
   どの行の時刻の字にも重ならない（行が浮かぶ動きの途中で測っていて、着いた字に乗っていた）。 */
const { open, checker } = require("./lib");

const DAY = "2026-10-25";

(async () => {
  const c = checker("timeline-fold-now");
  const { browser, page, errors } = await open({
    before: async (ctx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 25, 21, 36)); },
  });
  await page.evaluate((day) => {
    const s = KN.store;
    const at = (h, m) => new Date(2026, 9, 25, h, m).toISOString();
    const done = (t, h, m) => s.update((st) => {
      const x = st.todos.find((y) => y.id === t.id);
      x.done = true; x.doneAt = at(h, m);
    });
    done(s.addTodo({ title: "夜のルーティン", due: day, time: "19:00", minutes: 60 }), 20, 57);
    done(s.addTodo({ title: "燃えるゴミ", due: day, time: "20:30", minutes: 30 }), 20, 24);
    s.addTodo({ title: "夜の用事", due: day, time: "23:00", minutes: 30 });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const now = document.querySelector("#screen-todo .tl-now");
    const f = [...document.querySelectorAll("#screen-todo .tl-fold")].find((el) => {
      const q = el.getBoundingClientRect(), n = now && now.getBoundingClientRect();
      return n && n.top > q.top && n.top < q.bottom;
    });
    const all = [...document.querySelectorAll("#screen-todo .day-slide:not(.is-peek) .tl-fold")];
    return {
      found: !!f, n: all.length,
      heights: all.map((x) => Math.round(x.getBoundingClientRect().height)),
      text: all.map((x) => x.textContent.trim()).join(""),
      rail: all.every((x) => !!x.querySelector(".tl-fold-rail")),
    };
  });
  c.check("線が畳んだ空きの中にある場面", r.found, JSON.stringify(r));
  c.check("畳みは字なし・点線あり・背 18px", r.n > 0 && r.text === "" && r.rail && r.heights.every((h) => h === 18), JSON.stringify(r));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  c.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();

  /* 点検6：いまの札と行の時刻の字。席へ入る動き（行が浮かぶ）のあいだに置いても、着いた字に乗らない。 */
  const b = await open({ before: async (ctx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 25, 10, 30)); } });
  await b.page.evaluate((day) => {
    const s = KN.store;
    s.addTodo({ title: "病院の予約", due: day, time: "10:00", minutes: 30 });
    s.addTodo({ title: "電球を替える", due: day });
    s.addTodo({ title: "資料をまとめる", due: day, time: "14:00", minutes: 60 });
  }, DAY);
  await b.page.click('.tab[data-tab="todo"]');
  await b.page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });
  await b.page.waitForTimeout(600);
  const hit = await b.page.evaluate(() => {
    const n = document.querySelector("#screen-todo .tl-now .tl-time");
    if (!n) return { none: true };
    const a = n.getBoundingClientRect();
    const rows = [...document.querySelectorAll("#screen-todo .day-slide:not(.is-peek) .tl-row > .tl-time")].filter((e) => e.textContent.trim());
    return { n: rows.length, over: rows.filter((e) => { const r = e.getBoundingClientRect(); return r.top < a.bottom - 1 && a.top < r.bottom - 1; })
      .map((e) => e.textContent.trim()) };
  });
  c.check("点検6：いまの札は行の時刻の字に重ならない", hit.n >= 3 && hit.over && !hit.over.length, JSON.stringify(hit));
  /* 点検26：いまの筆（見た目 26px）の当たりは 44×44。 */
  const pen = await b.page.evaluate(() => {
    const el = document.querySelector("#screen-todo .tl-now-pen");
    if (!el) return null;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const on = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
    const reach = (dx, dy) => { let n = 0; while (n < 40 && on(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    return { w: reach(-1, 0) + reach(1, 0) + 1, h: reach(0, -1) + reach(0, 1) + 1 };
  });
  c.check("点検26：いまの筆の当たりは 44×44", !!pen && pen.w >= 43 && pen.h >= 43, JSON.stringify(pen));
  c.check("点検6：エラーなし", !b.errors.length, b.errors.join("\n"));
  await b.browser.close();
  c.done();
})();
