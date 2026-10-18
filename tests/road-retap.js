/* tasks の席をもう一度押すと 今日｜週 を行き来（2026年10月18日。前の「時間割 ⇄ 一日の道」を置き換えた）。
   今日へ戻ると道（いちばん上）から。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("road-retap");
  const { browser, page, errors } = await open({
    weekFirst: true,
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 9, 40)); },
  });
  await page.evaluate(() => {
    for (let h = 7; h < 21; h++) KN.store.addTodo({ title: "用事" + h, due: "2026-10-06", time: `${String(h).padStart(2, "0")}:00`, minutes: 30 });
  });
  /* 立ち上げがやることなら、先によそへ移ってから入る（入るときの一押しは「もう一度」ではない）。 */
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(600);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);
  const where = () => page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const sc = KN.app.scrollerOf(scr);
    return { top: sc.scrollTop, road: !!scr.querySelector(".day-road"), week: !!scr.querySelector(".wk") };
  });
  const a = await where();
  c.check("入ったときは週の面", a.week && !a.road, JSON.stringify(a));
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  const b = await where();
  c.check("もう一度押すと今日の面の道（いちばん上）", b.road && b.top === 0, JSON.stringify(b));
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 200; });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  const d = await where();
  c.check("また押すと週の面", d.week && !d.road, JSON.stringify(d));
  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
