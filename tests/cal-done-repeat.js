/* 暦の「済んだ印」：過去の済んだやること（単発）は出す／繰り返しは出さない。 */
const { open } = require("./lib");
(async () => {
  const { browser, page, errors } = await open();
  await page.evaluate(() => {
    const k = KN.util.shiftDay(KN.util.todayKey(), -2);
    const a = KN.store.addTodo({ title: "単発", due: k });
    const b = KN.store.addTodo({ title: "くり返し", due: k, repeat: "weekly" });
    KN.store.toggleTodo(a.id); KN.store.toggleTodo(b.id);
  });
  await page.evaluate(() => KN.store.flush());
  await page.reload();
  await page.waitForFunction(() => KN.store);
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = [...document.querySelectorAll("[data-tab]")].find((x) => x.dataset.tab === "todo"); b && b.click(); });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const k = KN.util.shiftDay(KN.util.todayKey(), -2);
    const cells = [...document.querySelectorAll(`.cal-day[data-day="${k}"]`)];
    return cells.map((c) => (c.closest(".screen")||{}).id + ":" + c.querySelectorAll(".cal-mark").length);
  });
  const ok = r.length === 1 && r[0].endsWith(":1") && !errors.length;
  console.log(ok ? "ok  済んだ単発だけ出る／繰り返しの控えは出ない" : "NG " + JSON.stringify(r), errors);
  process.exitCode = ok ? 0 : 1;
  await browser.close();
})();
