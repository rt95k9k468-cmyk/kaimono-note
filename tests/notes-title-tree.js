/* 題の木をコピー（docs/notes.md「題の木」）。

   ノートの歯車の notes に「題の木をコピー」／木は ノートブック → 字下げで深さ・id の尻6字・
   本文が空なら □ ／本文は一字も入らない／最近削除したノートは入らない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-title-tree.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-title-tree");
  const { browser, page, errors } = await open();

  await page.evaluate(() => KN.notes.ready());
  const ids = await page.evaluate(() => {
    const mk = (p) => { const n = Object.assign(KN.notes.draft(), p); KN.notes.put(n); return n.id; };
    const f = mk({ title: "棚", body: "", notebook: "本" });
    const a = mk({ title: "読んだ本", body: "ひみつの本文", notebook: "本", parent: f });
    const b = mk({ title: "孫", body: "もうひとつの本文", notebook: "本", parent: a });
    const c = mk({ title: "消した", body: "x", notebook: "本" });
    const d = mk({ title: "ひとり", body: "y" });
    KN.notes.remove(c);
    return { f, a, b, c, d };
  });
  await page.evaluate(() => KN.notes.flush());

  const txt = await page.evaluate(() => KN.notesExport.titleTree());
  const lines = txt.split("\n");
  t.check("ノートブックの行", lines[0] === "[本]", lines[0]);
  t.check("一番上は字下げ一つ・空は □", lines[1] === `  棚 ·${ids.f.slice(-6)} □`, lines[1]);
  t.check("子は字下げ二つ", lines[2] === `    読んだ本 ·${ids.a.slice(-6)}`, lines[2]);
  t.check("孫は字下げ三つ", lines[3].startsWith("      孫 ·"), lines[3]);
  t.check("ノートブックなしは終わり", lines.includes("[ノートブックなし]") && lines.at(-1).startsWith("  ひとり ·"), txt);
  t.check("本文は入らない", !/本文|x$|y$/.test(txt.replace(/ ·\S+.*$/gm, "")) && !/ひみつ/.test(txt), txt);
  t.check("消したノートは入らない", !/消した/.test(txt), txt);

  await page.click('.tab[data-tab="notes"]');
  await page.waitForTimeout(600);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => document.querySelector(".set-layer .set-row"));
  const has = await page.locator(".set-layer:last-child .set-row", { hasText: "題の木をコピー" }).count();
  t.check("ノートの歯車に「題の木をコピー」", has === 1, String(has));

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
