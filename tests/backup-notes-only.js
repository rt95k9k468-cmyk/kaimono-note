/* 記録が空でノートだけある端末でも、控えを取る（backup.js の takeNow。docs/roadmap-3.2.md B1）。
   ノートも記録も無ければ今までどおり "empty"。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/backup-notes-only.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("backup-notes-only");
  const { browser, page, errors } = await open();
  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on");

  t.check("1 何も無ければ empty", (await page.evaluate(() => KN.backup.take("試験"))) === "empty");
  await page.evaluate(async () => {
    const at = "2024-01-01T00:00:00.000Z";
    await KN.notes.addMany([{ id: "n-b1", title: "題", body: "本文", notebook: "private", tags: [], fav: false,
      createdAt: at, updatedAt: at, deletedAt: null }]);
  });
  t.check("2 ノートだけでも取る", (await page.evaluate(() => KN.backup.take("試験"))) === "taken");
  t.check("3 同じなら取らない", (await page.evaluate(() => KN.backup.take("試験"))) === "same");

  t.check("4 コンソールのエラーなし", errors.length === 0);
  await browser.close();
  t.done();
})();
