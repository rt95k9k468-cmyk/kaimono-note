/* 畳んだ長い空きは字なしの点線・背 18px（磨4・2026年11月25日。前は 44px に「〜 まで予定なし 〜」）。
   「いま」の線が畳みの中を通っても、線と点線だけ（よける字が無い）。
   夜のルーティンと燃えるゴミを済ませ、21:36 に見る（あとは 22:30 まで予定なし）。 */
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
  c.done();
})();
