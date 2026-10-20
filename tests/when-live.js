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
  t.check("エラーなし", errors.length === 0, errors.join("|"));
  await browser.close();
  t.done();
})();
