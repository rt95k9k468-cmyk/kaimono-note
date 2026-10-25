/* 「いま」の線が畳んだ空きの中を通るとき、「〜 まで予定なし 〜」の字は線にかからない（2026年10月25日、利用者）。
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
    if (!f) return { found: false };
    const t = f.querySelector(".tl-fold-text").getBoundingClientRect();
    return { found: true, now: now.getBoundingClientRect().top, textTop: t.top, textBottom: t.bottom };
  });
  c.check("線が畳んだ空きの中にある場面", r.found, JSON.stringify(r));
  c.check("空きの字は線にかからない（上下どちらかへよける）",
    r.found && (r.textBottom <= r.now - 2 || r.textTop >= r.now + 2), JSON.stringify(r));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  c.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
