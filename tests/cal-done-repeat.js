/* 暦の「済んだ印」（名前・灰色）：過去の済んだやること（単発）は出す／繰り返しは出さない。

   時計は木曜（2026年10月1日）に止める。前は本当の今日の2日前を見ていたので、
   日曜・月曜に回すと、その日が週の暦の外（前の週）になって落ちていた（R19）。
   点検8（2026年11月25日）：今日に5件なら、週の段は名前一つと「+4」（電話の幅。前は二つで黙って切れた）。 */
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
    return cells.map((c) => `${(c.closest(".screen") || {}).id}:${c.querySelectorAll(".cal-name.is-past").length}`);
  });
  t.check("済んだ単発だけ出る／繰り返しの控えは出ない", r.length === 1 && r[0].endsWith(":1"), JSON.stringify(r));
  /* 点検8：入りきらない名前は最後の札を「+n」に。 */
  const more = await page.evaluate(async () => {
    const d = KN.util.todayKey();
    ["病院の予約", "資料をまとめる", "買い物へ行く", "電話する", "洗濯"].forEach((title, i) => KN.store.addTodo({ title, due: d, time: `${11 + i}:00`, minutes: 30 }));
    await new Promise((r) => setTimeout(r, 500));
    const cell = document.querySelector(`#screen-todo .cal-day[data-day="${d}"], .cal-day[data-day="${d}"]`);
    const vis = (e) => getComputedStyle(e).display !== "none";
    const m = cell && cell.querySelector(".cal-more");
    const n0 = cell && cell.querySelector(".cal-name");
    return { names: cell ? [...cell.querySelectorAll(".cal-name")].filter(vis).length : -1, more: m && vis(m) ? getComputedStyle(m, "::before").content : null,
      fs: n0 ? parseFloat(getComputedStyle(n0).fontSize) : 0 };
  });
  t.check("点検8：5件の日は名前一つと「+4」・札の字は 11px", more.names === 1 && more.more === '"+4"' && more.fs >= 11, JSON.stringify(more));
  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
