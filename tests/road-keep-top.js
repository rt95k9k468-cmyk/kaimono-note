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
  /* 時刻なしを並べる「いま」は5分きざみ（screen-todo.js の planNow。2026年10月24日）。同じ5分のうちは紙をそのまま使い回す。 */
  await page.clock.setFixedTime(new Date(2026, 9, 6, 9, 43));
  const kept = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const old = KN.app.scrollerOf(scr);
    KN.screens.todo.render();
    return KN.app.scrollerOf(scr) === old;
  });
  c.check("同じ5分のうちは紙を組み直さない", kept);
  /* 暦の段（題を押して 週→月）は紙の中身を変えない（2026年11月26日：設定ごと見分けていて、伸ばすたびに紙を組み直した）。 */
  const calKept = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const old = KN.app.scrollerOf(scr);
    KN.store.setCalPref("todo", { open: !KN.store.calPrefs("todo").open });
    return KN.app.scrollerOf(scr) === old;
  });
  c.check("暦を伸ばす・畳むで紙を組み直さない", calKept);
  await page.evaluate(() => KN.store.setCalPref("todo", { open: !KN.store.calPrefs("todo").open }));
  await page.waitForTimeout(700);
  /* 題を押して暦を伸ばしても、時間割の行に FLIP が付かない（紙ごと下がるのは #panes の動きが補う）。前は画面の上から測って
     「355px 動いた」と読み、二重に補った行が一日の帯の上へ跳んでから違う速さで戻った（2026年11月26日、ui.js の flipRows）。 */
  const flipped = await page.evaluate(() => new Promise((ok) => {
    document.querySelector("#head .js-day-title").click();
    requestAnimationFrame(() => ok([...document.querySelectorAll("#screen-todo .tl-row")]
      .filter((r) => r.style.transform || r.getAnimations().some((a) => a.transitionProperty === "transform")).length));
  }));
  c.check("暦を伸ばしても時間割の行に FLIP が付かない（帯と札が一緒に下がる）", flipped === 0, `${flipped} 行`);
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector("#head .js-day-title").click());
  await page.waitForTimeout(700);
  await page.clock.setFixedTime(new Date(2026, 9, 6, 9, 45));
  const fell = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const old = KN.app.scrollerOf(scr);
    KN.screens.todo.render();
    const sc = KN.app.scrollerOf(scr);
    sc.scrollTop = 0;   // WebKit が落とした形
    return { swapped: sc !== old, now: sc.scrollTop };
  });
  c.check("5分の区切りを越えると紙が替わる（前提）", fell.swapped, JSON.stringify(fell));
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
