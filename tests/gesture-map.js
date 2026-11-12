/* 身ぶりの表（roadmap-2.0 の V13、docs/screens-nav.md の「身ぶりと紙の表」）。

   紙の横払いは、どの画面でも「日を移る」。やることを一覧で見ているとき
   （時間割オフ・タイル）だけ、行の横払いが「右で今日に・左でアーカイブ」
   だったのを揃えた（2026年10月4日）。

   - 一覧で見ているやことに、行の払いの裏地が無い。棚は紙の中の一枚（.tl-shelves）。
   - 行の上を本物のタッチで右へ払うと、題の日が一日戻る。用事の日付も
     アーカイブも変わらない。左へ払うと戻る。中身にずれ（transform）が残らない。
   - アーカイブは用事の紙の ⋯ に：「アーカイブする」→ しまわれる、
     もう一度開くと「アーカイブから戻す」→ 戻る。
   - 行の払いが残るのは価格だけ（日を持たない地。表の「例外」）。 */
const { open, checker } = require("./lib.js");
const touch = (cdp) => async (x, y, dx) => {
  const pts = (px) => [{ x: px, y, radiusX: 12, radiusY: 12, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(x) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(x + dx * i / 12) });
    await new Promise((ok) => setTimeout(ok, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

(async () => {
  const c = checker("gesture-map");
  const { browser, ctx, page, errors } = await open();
  const id = await page.evaluate(() => {
    KN.store.loadSample();
    KN.store.update((s) => { s.settings.todoTimeline = false; });
    return KN.store.addTodo({ title: "払いの試し", due: KN.util.todayKey() }).id;
  });
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);

  c.check("一覧で見ているとき、棚は紙の中の一枚に入る",
    await page.evaluate(() => !!document.querySelector("#screen-todo .tl-sheet > .tl-shelves .todo-group")));
  c.check("やることの行に払いの裏地（今日にする／アーカイブ）が無い",
    await page.$$eval("#screen-todo .swipe-yes, #screen-todo .swipe-arch", (xs) => xs.length === 0));

  const today = await page.evaluate(() => KN.util.todayKey());
  const yk = await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), -1));
  const before = await page.evaluate((id) => {
    const t = KN.store.getTodo(id);
    return { due: t.due, archived: !!t.archived, done: !!t.done };
  }, id);
  const at = async () => page.evaluate((id) => {
    const w = document.querySelector(`#screen-todo .item-wrap[data-todo-id="${id}"]`);
    const r = w.querySelector(".item-body").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  const flick = touch(await ctx.newCDPSession(page));

  let p = await at();
  await flick(p.x - 60, p.y, 160);
  await page.waitForTimeout(800);
  c.check("行の上を右へ払うと、題の日が一日戻る",
    await page.evaluate((k) => KN.screens.todo.day() === k, yk),
    await page.evaluate(() => KN.screens.todo.day()));
  const after = await page.evaluate((id) => {
    const t = KN.store.getTodo(id);
    return { due: t.due, archived: !!t.archived, done: !!t.done };
  }, id);
  c.check("払っても用事の日付もアーカイブも変わらない",
    JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
  c.check("払ったあと、中身にずれが残らない", await page.evaluate(() => {
    const s = document.querySelector("#screen-todo .tl-shelves");
    return !!s && !s.style.transform && getComputedStyle(s).transform === "none";
  }));
  c.check("紙そのものには横の transform を書かない", await page.evaluate(() => {
    const s = document.querySelector("#screen-todo .tl-sheet");
    return !/translate3d\((?!0px)/.test(s.style.transform || "");
  }));

  p = await at();
  await flick(p.x + 60, p.y, -160);
  await page.waitForTimeout(800);
  c.check("左へ払うと、今日へ戻る",
    await page.evaluate((k) => KN.screens.todo.day() === k, today));

  // アーカイブは用事の紙の ⋯ に
  const pick = async (label) => {
    await page.evaluate((id) => KN.screens.todo.open(id), id);
    await page.waitForTimeout(500);
    await page.click(".sheet .js-menu");
    await page.waitForTimeout(300);
    const items = await page.$$eval(".note-pop-item", (xs) => xs.map((x) => x.textContent.trim()));
    const ok = items.includes(label);
    if (ok) {
      await page.click(`.note-pop-item:has-text("${label}")`);
      await page.waitForTimeout(700);
    }
    return { ok, items };
  };
  const a1 = await pick("アーカイブする");
  c.check("用事の紙の ⋯ に「アーカイブする」", a1.ok, JSON.stringify(a1.items));
  c.check("押すとしまわれる", await page.evaluate((id) => !!KN.store.getTodo(id).archived, id));
  const a2 = await pick("アーカイブから戻す");
  c.check("しまったものの ⋯ には「アーカイブから戻す」", a2.ok, JSON.stringify(a2.items));
  c.check("押すと戻る", await page.evaluate((id) => !KN.store.getTodo(id).archived, id));

  // 行の払いが残るのは価格だけ
  c.check("行の払いの裏地は、価格のほかに無い", await page.evaluate(() =>
    [...document.querySelectorAll(".swipe-yes, .swipe-arch")].every((e) => e.closest("#screen-prices"))));

  /* X3：長押しで持ち上げて、その場で離す＝行の小窓（本物のタッチ）。動かせば運ぶのは今まで。一覧と時間割の両方。 */
  const cdp = await ctx.newCDPSession(page);
  const holdAt = async (sel) => {
    const b = await page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + Math.min(60, r.width / 2), y: r.top + Math.min(14, r.height / 2) }; });
    const pts = [{ x: b.x, y: b.y, radiusX: 12, radiusY: 12, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts });
    await page.waitForTimeout(await page.evaluate(() => KN.gesture.HOLD) + 150);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(450);
    return page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].filter((e) => e.offsetWidth).map((e) => e.textContent.trim()));
  };
  const m1 = await holdAt(`#screen-todo .item-wrap[data-todo-id="${id}"] .item-body`);
  c.check("一覧：長押しで小窓（明日へ・日を選ぶ・写す・アーカイブ・消す）", m1.join() === "明日へ,日を選ぶ,写す,アーカイブする,このやることを消す", m1.join());
  c.check("小窓が出ても用事の紙は開かない", !(await page.$(".sheet.is-open")));
  await page.locator(".note-pop-item", { hasText: "明日へ" }).click();
  await page.waitForTimeout(400);
  c.check("「明日へ」で日が明日に", await page.evaluate((i) => KN.store.getTodo(i).due === KN.util.shiftDay(KN.util.todayKey(), 1), id));
  const t2 = await page.evaluate(() => {
    KN.store.update((s) => { s.settings.todoTimeline = true; });
    return KN.store.addTodo({ title: "時間割の試し", due: KN.util.todayKey(), time: "10:00" }).id;
  });
  await page.waitForTimeout(700);
  const m2 = await holdAt(`#screen-todo .tl-row[data-todo-id="${t2}"] .tl-open`);
  c.check("時間割：長押しで同じ小窓", m2.includes("写す") && m2.includes("明日へ"), m2.join());
  const n0 = await page.evaluate(() => KN.store.get().todos.length);
  await page.locator(".note-pop-item", { hasText: "写す" }).click();
  await page.waitForTimeout(400);
  c.check("「写す」で同じ題がもう一つ", await page.evaluate((n) => KN.store.get().todos.length === n + 1
    && KN.store.get().todos.filter((x) => x.title === "時間割の試し").length === 2, n0));

  c.check("ページのエラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
