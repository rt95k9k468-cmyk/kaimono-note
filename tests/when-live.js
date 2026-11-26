/* 打った字の「いつ」を、空きを打った時点で欄へ移す（screen-todo.js の input ハンドラ）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/when-live.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("when-live");
  const { browser, page, errors } = await open();
  await page.evaluate(() => { KN.store.update((s) => { s.todos = []; }); KN.app.showScreen("todo"); });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('button[aria-label="やることを追加"]').click());
  await page.waitForSelector(".js-title");
  await page.waitForTimeout(300);
  const title = page.locator(".js-title");
  await title.click();
  await page.keyboard.type("10:00");
  t.check("空きを打つ前は題のまま", await title.inputValue() === "10:00");
  await page.keyboard.type(" 病院");
  t.check("空きを打った時点で時刻が欄へ移り、題は病院", await title.inputValue() === "病院", await title.inputValue());
  await page.fill(".js-title", "");
  await page.keyboard.type("病院 明日");
  await page.waitForTimeout(1000);
  t.check("打つ手が止まれば、フォーカスしたままでも移る", await title.inputValue() === "病院", await title.inputValue());
  await page.fill(".js-title", "10:00 病院");
  await page.evaluate(() => document.querySelector(".js-save").click());
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "病院"));
  t.check("保存すると 10:00", r && r.time === "10:00", JSON.stringify(r));
  /* 週の語は暦と同じ月曜はじまりで読む（2026年11月26日、利用者が選んだ。前は日曜はじまり）。
     2026-11-28 は土曜・11-29 は日曜・11-30 は月曜。 */
  const weeks = await page.evaluate(() => {
    const W = KN.whenParse;
    const on = (today, s) => { const r = W.parse(`${s} 用事`, { today }); return r.due || r.deadline || "-"; };
    return [
      on("2026-11-29", "来週"), on("2026-11-29", "来週の日曜"), on("2026-11-29", "今週中"), on("2026-11-29", "今週末"),
      on("2026-11-28", "今週の金曜"), on("2026-11-28", "来週の日曜"), on("2026-11-30", "来週末"), on("2026-11-30", "今週の日曜"),
    ].join(" ");
  });
  t.check("週の語は月曜はじまり・過ぎた「今週の◯曜」は次のその曜日", weeks
    === "2026-11-30 2026-12-06 2026-11-29 2026-11-29 2026-12-04 2026-12-06 2026-12-12 2026-12-06", weeks);
  t.check("エラーなし", errors.length === 0, errors.join("|"));
  await browser.close();
  t.done();
})();
