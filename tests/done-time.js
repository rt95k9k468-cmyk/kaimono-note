/* 済ませた時刻を直す・食事の枠をその場の小窓で書く（2026年10月3日）。
   - 時間割で済ませると、トーストに押した時刻と「時刻」「元に戻す」
   - 「時刻」で車輪の小窓が出て、閉じると doneAt の時と分だけが変わる（日はそのまま）
   - 行の ✓ 時刻を押しても同じ小窓が出る
   - 食事の枠を押すと紙ではなく小窓。前に書いた言葉が候補に出て、押すと入る。閉じると保存 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("done-time");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 3, 14, 7)); },
  });
  const id = await page.evaluate(() => KN.store.addTodo({ title: "洗濯", due: KN.util.todayKey(), time: "09:00" }).id);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(600);
  await page.locator(`.tl-row[data-todo-id="${id}"] button.check:visible`).first().click();
  await page.waitForTimeout(900);
  const toast = await page.evaluate(() => [...document.querySelectorAll(".toast-action")].map((b) => b.textContent.trim()));
  const msg = await page.evaluate(() => (document.querySelector(".toast-msg") || {}).textContent || "");
  c.check("トーストに押した時刻", msg.includes("14:07"), msg);
  c.check("トーストに「時刻」と「元に戻す」", toast.join(",") === "時刻,元に戻す", toast.join(","));

  await page.click(".toast-action");
  await page.waitForTimeout(400);
  c.check("車輪の小窓が出る", await page.evaluate(() => document.querySelectorAll(".note-pop.done-at-pop .note-wheel").length === 2));
  await page.evaluate(() => {
    const [h, m] = document.querySelectorAll(".done-at-pop .note-wheel");
    h.scrollTop = 11 * 40; m.scrollTop = 30 * 40;
  });
  await page.waitForTimeout(100);
  await page.click(".note-pop-cover");
  await page.waitForTimeout(400);
  const d = await page.evaluate((i) => { const x = new Date(KN.store.getTodo(i).doneAt); return [x.getDate(), x.getHours(), x.getMinutes()]; }, id);
  c.check("閉じると 11:30 に直り、日はそのまま", d.join() === "3,11,30", d.join());
  const msg2 = await page.evaluate(() => (document.querySelector(".toast-msg") || {}).textContent || "");
  c.check("直したトーストに新しい時刻", msg2.includes("11:30"), msg2);

  await page.waitForTimeout(300);
  await page.locator(".tl-done-toggle:visible").first().click();
  await page.waitForTimeout(300);
  const chip = page.locator(`.tl-row[data-todo-id="${id}"] button.tl-doneat:visible`).first();
  c.check("行に押せる済ませた時刻", (await chip.textContent()).includes("11:30"));
  await chip.click();
  await page.waitForTimeout(400);
  const hm = await page.evaluate(() => [...document.querySelectorAll(".done-at-pop [aria-selected=true]")].map((r) => r.textContent));
  c.check("行から開いた小窓は今の時刻に合っている", hm.join() === "11時,30分", hm.join());
  await page.click(".note-pop-cover");
  await page.waitForTimeout(300);
  c.check("回さずに閉じれば変わらない", await page.evaluate((i) => new Date(KN.store.getTodo(i).doneAt).getMinutes() === 30, id));
  c.check("詳細の紙は開かない", !(await page.$(".sheet")));

  /* 食事の枠 */
  await page.evaluate(() => {
    const y = KN.util.shiftDay(KN.util.todayKey(), -1);
    KN.store.setSlotMemo(y, "breakfast", "納豆 ごはん 味噌汁");
    KN.store.setSlotMemo(KN.util.shiftDay(y, -1), "breakfast", "納豆、トースト");
    KN.app.showScreen("diet");
  });
  await page.waitForTimeout(700);
  await page.click('#screen-diet .diet-slot-view[data-slot="breakfast"]');
  await page.waitForTimeout(400);
  const pop = await page.evaluate(() => ({
    sheet: !!document.querySelector(".sheet"),
    ta: !!document.querySelector(".diet-slot-pop textarea"),
    focus: document.activeElement && document.activeElement.matches(".diet-slot-pop textarea"),
    cands: [...document.querySelectorAll(".diet-slot-cands .chip")].map((b) => b.textContent),
  }));
  c.check("紙ではなく小窓", !pop.sheet && pop.ta, JSON.stringify(pop));
  c.check("欄に focus", pop.focus);
  c.check("前に書いた言葉が候補に（多い順に納豆が先）", pop.cands[0] === "納豆" && pop.cands.includes("トースト"), pop.cands.join(","));
  await page.keyboard.type("と");
  await page.waitForTimeout(100);
  const narrowed = await page.evaluate(() => [...document.querySelectorAll(".diet-slot-cands .chip")].map((b) => b.textContent));
  c.check("打ちかけで絞る（と → トースト）", narrowed.join() === "トースト", narrowed.join());
  await page.click(".diet-slot-cands .chip");
  const val = await page.evaluate(() => document.querySelector(".diet-slot-pop textarea").value);
  c.check("押すと打ちかけが置き換わる", val === "トースト ", JSON.stringify(val));
  const after = await page.evaluate(() => [...document.querySelectorAll(".diet-slot-cands .chip")].map((b) => b.textContent));
  c.check("入れた言葉は候補から外れる", !after.includes("トースト") && after.includes("納豆"), after.join());
  await page.click(".note-pop-cover");
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => KN.store.slotMemo(KN.util.todayKey(), "breakfast"));
  c.check("閉じると保存", saved === "トースト", saved);
  const row = await page.evaluate(() => document.querySelector('#screen-diet .diet-slot-view[data-slot="breakfast"] .diet-slot-text').textContent);
  c.check("枠に書いたものが出る", row.includes("トースト"), row);

  c.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
