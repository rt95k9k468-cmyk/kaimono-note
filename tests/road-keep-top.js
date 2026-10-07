/* 組み直しで紙が替わっても、読んでいた場所に居る（2026年10月7日）。iPhone は差しこんだ
   ばかりの器への scrollTop を落とすことがあるので、それを真似て頭へ落とし、一拍あとに
   戻るかを見る。日を替えた（goDay）ときは頭のまま。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("road-keep-top");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 9, 40)); },
  });
  await page.evaluate(() => {
    for (let h = 7; h < 21; h++) KN.store.addTodo({ title: "用事" + h, due: "2026-10-06", time: `${String(h).padStart(2, "0")}:00`, minutes: 30 });
  });
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(600);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);
  const top = () => page.evaluate(() => KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop);
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 700; });
  await page.waitForTimeout(200);
  await page.clock.setFixedTime(new Date(2026, 9, 6, 9, 41));
  const fell = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const old = KN.app.scrollerOf(scr);
    KN.screens.todo.render();
    const sc = KN.app.scrollerOf(scr);
    sc.scrollTop = 0;   // WebKit が落とした形
    return { swapped: sc !== old, now: sc.scrollTop };
  });
  c.check("分が変わると紙が替わる（前提）", fell.swapped, JSON.stringify(fell));
  await page.waitForTimeout(200);
  const a = await top();
  c.check("一拍あとに読んでいた場所へ戻る", Math.abs(a - 700) <= 2, String(a));
  await page.evaluate(() => {
    KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 700;
    KN.screens.todo.goDay("2026-10-07");
  });
  await page.waitForTimeout(400);
  c.check("日を替えたら頭のまま", (await top()) === 0, String(await top()));
  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
