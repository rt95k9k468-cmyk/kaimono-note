/* tasks の席をもう一度押すと、時間割へ。また押すと一日の道へ（2026年10月6日）。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("road-retap");
  const { browser, page, errors } = await open({
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
    const sc = KN.app.scrollerOf(scr), box = sc.getBoundingClientRect();
    const road = scr.querySelector(".day-road"), tl = road.nextElementSibling;
    return { top: sc.scrollTop, tl: Math.round(tl.getBoundingClientRect().top - box.top) };
  });
  const a = await where();
  c.check("開いたときは道（いちばん上）", a.top === 0, JSON.stringify(a));
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(900);
  const b = await where();
  c.check("もう一度押すと時間割が紙の頭に", b.top > 0 && Math.abs(b.tl) <= 2, JSON.stringify(b));
  await page.screenshot({ path: "/tmp/claude-0/retap.png" });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(900);
  const d = await where();
  c.check("また押すと道へ戻る", d.top === 0, JSON.stringify(d));
  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
