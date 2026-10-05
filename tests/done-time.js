/* 済ませた時刻を直す・食事の枠をその場の小窓で書く（2026年10月3日）。
   - 時間割で済ませると、トーストに押した時刻と「時刻」「元に戻す」
   - 「時刻」で車輪の小窓が出て、閉じると doneAt の時と分だけが変わる（日はそのまま）
   - 行の ✓ 時刻を押しても同じ小窓が出る
   - 食事の枠を押すと、紙でも浮いた小窓でもなく、その枠がその場で書く欄になる。前に書いた
     言葉が候補に出て、押すと入る。打っても枠の高さは揺れない。ほかのタブを押すと閉じて保存 */
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
    KN.store.setSlotMemo(KN.util.shiftDay(y, -2), "breakfast", "納豆 トースト");
    KN.store.setSlotMemo(KN.util.shiftDay(y, -3), "breakfast", "機内食");
    KN.store.setSlotMemo(y, "dinner", "カレー");
    KN.store.setSlotMemo(KN.util.shiftDay(y, -1), "dinner", "カレー");
    KN.store.setSlotMemo(KN.util.shiftDay(y, -2), "dinner", "カレー");
    KN.app.showScreen("diet");
  });
  await page.waitForTimeout(700);
  await page.click('#screen-diet .diet-slot-view[data-slot="breakfast"]');
  await page.waitForTimeout(400);
  const pop = await page.evaluate(() => ({
    sheet: !!document.querySelector(".sheet, .note-pop"),
    inPlace: !!document.querySelector('#screen-diet .diet-slots > .diet-slot-edit[data-slot="breakfast"]'),
    h: document.querySelector(".diet-slot-edit").offsetHeight,
    ta: !!document.querySelector(".diet-slot-edit textarea"),
    focus: document.activeElement && document.activeElement.matches(".diet-slot-edit textarea"),
    cands: [...document.querySelectorAll(".diet-slot-cands .chip")].map((b) => b.textContent),
  }));
  c.check("紙も小窓も出さず、その枠がその場で欄になる", !pop.sheet && pop.ta && pop.inPlace, JSON.stringify(pop));
  c.check("欄に focus", pop.focus);
  c.check("前に書いた言葉が候補に（多い順に納豆が先）", pop.cands[0] === "納豆" && pop.cands.includes("トースト"), pop.cands.join(","));
  c.check("一度きり・ほかの枠のものは何も打たなければ出ない", !pop.cands.includes("機内食") && !pop.cands.includes("カレー") && !pop.cands.includes("ごはん"), pop.cands.join(","));
  await page.keyboard.type("機");
  await page.waitForTimeout(100);
  const rare = await page.evaluate(() => [...document.querySelectorAll(".diet-slot-cands .chip")].map((b) => b.textContent));
  c.check("打てばまれなものも出る（機 → 機内食）", rare.join() === "機内食", rare.join());
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);
  await page.keyboard.type("と");
  await page.waitForTimeout(100);
  const narrowed = await page.evaluate(() => [...document.querySelectorAll(".diet-slot-cands .chip")].map((b) => b.textContent));
  c.check("打ちかけで絞る（と → トースト）", narrowed.join() === "トースト", narrowed.join());
  const h2 = await page.evaluate(() => document.querySelector(".diet-slot-edit").offsetHeight);
  c.check("候補の数が変わっても枠の高さは同じ", h2 === pop.h, `${pop.h} → ${h2}`);
  await page.click(".diet-slot-cands .chip");
  const val = await page.evaluate(() => document.querySelector(".diet-slot-edit textarea").value);
  c.check("押すと打ちかけが置き換わる", val === "トースト ", JSON.stringify(val));
  const after = await page.evaluate(() => [...document.querySelectorAll(".diet-slot-cands .chip")].map((b) => b.textContent));
  c.check("入れた言葉は候補から外れる", !after.includes("トースト") && after.includes("納豆"), after.join());
  await page.click('#screen-diet .diet-slot-view[data-slot="lunch"]');
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => ({
    saved: KN.store.slotMemo(KN.util.todayKey(), "breakfast"),
    row: (document.querySelector('#screen-diet .diet-slot-view[data-slot="breakfast"] .diet-slot-text') || {}).textContent || "",
    lunch: !!document.querySelector('#screen-diet .diet-slot-edit[data-slot="lunch"]'),
    n: document.querySelectorAll(".diet-slot-edit").length,
  }));
  c.check("別の枠を押すと、前の枠は保存して一行に戻り、押した枠が開く",
    sw.saved === "トースト" && sw.row.includes("トースト") && sw.lunch && sw.n === 1, JSON.stringify(sw));
  await page.keyboard.type("そば");
  /* 打っているあいだはタブの帯が隠れるので、キーボードを閉じて（blur）から。 */
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(300);
  const blurred = await page.evaluate(() => document.querySelectorAll(".diet-slot-edit").length);
  c.check("キーボードを閉じると枠は一行に戻る", blurred === 0, String(blurred));
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(500);
  const gone = await page.evaluate(() => ({
    edit: document.querySelectorAll(".diet-slot-edit").length,
    pop: document.querySelectorAll(".note-pop").length,
    lunch: KN.store.slotMemo(KN.util.todayKey(), "lunch"),
  }));
  c.check("タブを移ると閉じて保存し、何も残らない", !gone.edit && !gone.pop && gone.lunch === "そば", JSON.stringify(gone));

  /* キーボードの代わりに、見える高さを縮める（app.js の fit が殻を縮める）。 */
  await page.click('.tab[data-tab="diet"]');
  await page.waitForTimeout(600);
  await page.click('#screen-diet .diet-slot-view[data-slot="snack"]');
  await page.waitForTimeout(300);
  const sc0 = await page.evaluate(() => KN.app.scrollerOf(document.querySelector("#screen-diet")).scrollTop);
  await page.setViewportSize({ width: 390, height: 520 });
  await page.waitForTimeout(1200);
  const up = await page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.querySelector("#screen-diet"));
    const box = document.querySelector(".diet-slot-edit").getBoundingClientRect();
    const room = document.querySelector("#screen-diet .diet-kb-room");
    return { top: sc.scrollTop, room: room ? room.offsetHeight : 0, bottom: box.bottom, vh: document.getElementById("app").getBoundingClientRect().bottom };
  });
  c.check("縮んだら候補の列まで見えるところへ上へ送り、余白を残す",
    up.top > sc0 && up.room > 0 && up.bottom <= up.vh, JSON.stringify({ sc0, ...up }));
  await page.evaluate(() => document.activeElement.blur());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => KN.app.scrollerOf(document.querySelector("#screen-diet")).scrollTop);
  c.check("キーボードをしまっても紙は下がらない", back === up.top, `${up.top} → ${back}`);

  c.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
