/* やることを別の日へ移すと、暦のその日へ飛んでいく（docs/roadmap-2.0.md の V15、ui.js の sendToDay）。
   - 用事の紙で日を明日へ変えて閉じると、頭の丸薬の写し（.day-send）が上の帯へ飛び、
     着く先は暦の明日の丸（暦が出ていなければ頭の日付）。着いたら写しは消える
   - 日を変えずに閉じたときは飛ばない
   - 時刻を過ぎたものの紙で「明日」を押すと、その行の写しが飛ぶ
   - 動きを減らす設定では飛ばさない（日は移る）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/day-send.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("day-send");
  const { browser, page, errors } = await open();

  const ids = await page.evaluate(() => {
    const d = KN.util.todayKey();
    const a = KN.store.addTodo({ title: "移す用事", due: d, time: "09:00", minutes: 60 });
    const b = KN.store.addTodo({ title: "そのまま", due: d, time: "11:00", minutes: 30 });
    /* いまより前の時刻（時刻を過ぎたもの）。0:00 台に走らせたら作れないので、そのときは飛ばす。 */
    const now = new Date();
    const past = now.getHours() * 60 + now.getMinutes() >= 30
      ? KN.store.addTodo({ title: "過ぎた用事", due: d, time: "00:00", minutes: 15 }) : null;
    KN.app.showScreen("todo");
    return { a: a.id, b: b.id, past: past && past.id, tomorrow: KN.util.shiftDay(d, 1) };
  });
  await page.waitForTimeout(700);

  /* 写しを毎フレーム控える。最初の箱・最後の箱・行き先の箱。 */
  const record = () => page.evaluate((day) => new Promise((ok) => {
    const out = { first: null, last: null, n: 0, target: null };
    const t0 = performance.now();
    const tick = () => {
      const g = document.querySelector(".day-send");
      if (g) {
        const r = g.getBoundingClientRect();
        const box = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
        if (!out.first) out.first = box;
        out.last = box;
        out.n++;
        const head = document.getElementById("head");
        const cell = [...head.querySelectorAll(`.cal-day[data-day="${day}"]`)]
          .find((e) => { const b = e.getBoundingClientRect(); return b.width && b.left + b.width / 2 > 0 && b.left < innerWidth; });
        const tg = cell || head.querySelector(".js-day-title");
        const b = tg.getBoundingClientRect();
        out.target = { x: b.left + b.width / 2, y: b.top + b.height / 2, cell: !!cell };
      }
      if (!g && out.n) ok(out);
      else if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      else ok(out);
    };
    requestAnimationFrame(tick);
  }), ids.tomorrow);

  const openRow = async (title) => {
    const row = page.locator(".screen.is-active .tl-row", { hasText: title }).first();
    await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    const box = await row.locator(".tl-open").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
  };

  /* ---- 日を変えずに閉じる：飛ばない ---- */
  await openRow("そのまま");
  const quiet = record();
  await page.keyboard.press("Escape");
  const q = await quiet;
  t.check("日を変えずに閉じたら飛ばない", q.n === 0, String(q.n));
  await page.waitForTimeout(500);

  /* ---- 紙の中で明日へ移して閉じる ---- */
  await openRow("移す用事");
  await page.evaluate((x) => KN.store.updateTodo(x.a, { due: x.tomorrow }), ids);
  await page.waitForTimeout(200);
  const rec = record();
  await page.keyboard.press("Escape");
  const r = await rec;
  t.check("写しが飛ぶ", r.n > 3, String(r.n));
  t.check("写しは上の帯へ向かう", !!r.first && r.last.y < r.first.y - 40, JSON.stringify([r.first, r.last]));
  t.check("着くのは明日の丸（か頭の日付）", !!r.target
    && Math.abs(r.last.x - r.target.x) < 16 && Math.abs(r.last.y - r.target.y) < 16, JSON.stringify([r.last, r.target]));
  t.check("縮んでいく", !!r.first && r.last.w < r.first.w, JSON.stringify([r.first, r.last]));
  t.check("着いたら写しは消える", await page.evaluate(() => !document.querySelector(".day-send")));
  t.check("日は明日に移っている", await page.evaluate((x) => KN.store.getTodo(x.a).due === x.tomorrow, ids));

  /* ---- 時刻を過ぎたものの紙で「明日」 ---- */
  if (ids.past) {
    await page.waitForTimeout(400);
    const bar = page.locator(".screen.is-active .tl-passed");
    t.check("時刻を過ぎたものの札がある", (await bar.count()) === 1);
    await bar.click();
    await page.waitForTimeout(700);
    const rec2 = record();
    await page.locator(".sheet.is-open .carry-row .js-passed[data-key=\"tomorrow\"]").first().click();
    const r2 = await rec2;
    t.check("過ぎたものの「明日」：写しが飛ぶ", r2.n > 3 && r2.last.y < r2.first.y, JSON.stringify([r2.first, r2.last]));
    t.check("過ぎたものの「明日」：日が移る", await page.evaluate((x) => KN.store.getTodo(x.past).due === x.tomorrow, ids));
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
  }

  /* ---- 動きを減らす設定 ---- */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(500);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRow("そのまま");
  await page.evaluate((x) => KN.store.updateTodo(x.b, { due: x.tomorrow }), ids);
  const rec3 = record();
  await page.keyboard.press("Escape");
  const r3 = await rec3;
  t.check("動きを減らす：飛ばない", r3.n === 0, String(r3.n));
  t.check("動きを減らす：日は移る", await page.evaluate((x) => KN.store.getTodo(x.b).due === x.tomorrow, ids));

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
