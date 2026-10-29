/* 時間割の手順の小窓は札に付いて動く。後ろの紙が送られたら口（0/4 ›）といっしょに動き、口が見える範囲から
   出たら閉じる——宙に浮いたまま居座らない（2026年10月30日、利用者）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/subs-pop-follow.js */
const { open, checker } = require("./lib");

const DAY = "2026-10-20";

(async () => {
  const c = checker("subs-pop-follow");
  const { browser, page, errors } = await open({
    before: async (ctx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 20, 7, 0)); },
  });
  const id = await page.evaluate((day) => {
    const id = KN.store.addTodo({ title: "朝のしたく", due: day, time: "09:00", minutes: 30,
      subs: ["顔", "歯", "服", "髪"].map((x) => ({ title: x })) }).id;
    ["昼", "おやつ", "夕方", "夜"].forEach((x, i) => KN.store.addTodo({ title: x, due: day, time: `${12 + i * 3}:00`, minutes: 60 }));
    return id;
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(600);
  const chipSel = `#screen-todo .tl-row[data-todo-id="${id}"] .tl-subs-chip`;
  await page.click(chipSel);
  await page.waitForSelector(".note-pop.is-subs.is-open .tl-sub", { timeout: 5000 });
  await page.waitForTimeout(300);

  const gap = () => page.evaluate((sel) => {
    const pop = document.querySelector(".note-pop.is-subs");
    const chip = document.querySelector(sel);
    return pop && chip ? Math.round(pop.getBoundingClientRect().top - chip.getBoundingClientRect().top) : null;
  }, chipSel);
  const sendBy = (dy) => page.evaluate(([sel, dy]) => {
    const sc = KN.app.scrollerOf(document.getElementById("screen-todo"));
    sc.scrollTop += dy;
    return sc.scrollTop;
  }, [chipSel, dy]);

  const g0 = await gap();
  const before = await sendBy(0);
  const after = await sendBy(40);
  await page.waitForTimeout(120);
  const g1 = await gap();
  c.check("紙が送られた（試験の前提）", after !== before, `${before}→${after}`);
  c.check("送られても、小窓は口からの距離を保つ", g0 != null && g1 != null && Math.abs(g1 - g0) <= 1, `${g0} → ${g1}`);
  c.check("口が見えているあいだは開いたまま", !!(await page.$(".note-pop.is-subs.is-open")));

  await sendBy(4000);
  await page.waitForTimeout(400);
  c.check("口が見える範囲から出たら閉じる", !(await page.$(".note-pop.is-subs.is-open")));

  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})().catch((e) => { console.error(e); process.exit(1); });
