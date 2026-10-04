/* 暦の「済んだ印」：過去の済んだやること（単発）は出す／繰り返しは出さない。

   時計は木曜（2026年10月1日）に止める。前は本当の今日の2日前を見ていたので、
   日曜・月曜に回すと、その日が週の暦の外（前の週）になって落ちていた（R19）。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("cal-done-repeat");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 1, 10, 0)); },
  });
  await page.evaluate(() => {
    const k = KN.util.shiftDay(KN.util.todayKey(), -2);
    const a = KN.store.addTodo({ title: "単発", due: k });
    const b = KN.store.addTodo({ title: "くり返し", due: k, repeat: "weekly" });
    KN.store.toggleTodo(a.id); KN.store.toggleTodo(b.id);
    KN.store.flush();
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForFunction(() => KN.app.activeScreen() === "todo" && document.querySelector(".cal-day[data-day]"));
  const r = await page.evaluate(() => {
    const k = KN.util.shiftDay(KN.util.todayKey(), -2);
    const cells = [...document.querySelectorAll(`.cal-day[data-day="${k}"]`)];
    return cells.map((c) => `${(c.closest(".screen") || {}).id}:${c.querySelectorAll(".cal-mark").length}`);
  });
  t.check("済んだ単発だけ出る／繰り返しの控えは出ない", r.length === 1 && r[0].endsWith(":1"), JSON.stringify(r));
  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
