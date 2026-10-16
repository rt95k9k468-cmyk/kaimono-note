/* 前のもの（docs/notes-structure.md の段1）。

   thinking の一段目で、★でも束でもなく30日触っていないノート（取り込んだまま触っていないものも）は、棚の終わりの
   「前のもの」一行に畳む／数は出さない／開けば月ごと（新しい月から）／ほかの棚は畳まない／
   Alt+↓ は畳んだ行を飛ばして、見えている次の行の後ろへ／直せば元の位置へ戻る／並び・データは動かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-fold.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-fold");
  const { browser, page, errors } = await open();

  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on");
  await page.evaluate(async () => {
    const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
    let i = 0;
    const mk = (id, title, notebook, at, extra) => {
      i += 1;
      return Object.assign({ id, title, body: "x", notebook, tags: [], fav: false, pos: `a${i}`,
        createdAt: ago(400 - i), updatedAt: at, deletedAt: null }, extra || {});
    };
    await KN.notes.addMany([
      mk("f-a", "いま", "thinking", ago(1)),
      mk("f-b", "前の一", "thinking", ago(45)),
      mk("f-c", "前の★", "thinking", ago(90), { fav: true }),
      mk("f-d", "前の束", "thinking", ago(90)),
      mk("f-e", "束の中", "thinking", ago(90), { parent: "f-d" }),
      mk("f-f", "もっと前", "thinking", ago(120)),
      mk("f-g", "取り込んだまま", "thinking", ago(2), { src: { from: "notion", key: "k1", batch: ago(1) } }),
      mk("f-h", "いまの二", "thinking", ago(3)),
      mk("f-r", "読んだ前", "reading", ago(90)),
    ]);
    KN.notes.setBooks(["thinking", "reading", "teaching", "learning", "living", "archive"]);
  });
  const pos = () => page.evaluate(() => KN.notes.list().map((n) => `${n.id}:${n.pos}:${n.updatedAt}`).sort().join());
  const pos0 = await pos();

  await page.click('.tab[data-tab="notes"]');
  await page.waitForFunction(() => document.querySelector('.nt-shelf[data-shelf="thinking"]'));
  const shelf = () => page.evaluate(() => {
    const g = document.querySelector('.nt-shelf[data-shelf="thinking"]');
    const fold = g.querySelector(":scope > .nt-grp > .nt-row.is-fold");
    return {
      shown: [...g.querySelectorAll(":scope > .nt-grp > .js-tree-note")].map((r) => r.dataset.id).join(),
      fold: fold ? fold.innerText.trim() : "", foldOpen: fold ? fold.getAttribute("aria-expanded") : "",
      last: !!fold && g.lastElementChild === fold.parentElement,
      months: [...g.querySelectorAll(".nt-row.is-month")].map((r) => r.innerText.trim()).join("|"),
      old: [...g.querySelectorAll(".js-old-note")].map((r) => r.dataset.id).join(),
      reading: [...document.querySelectorAll('.nt-shelf[data-shelf="reading"] .js-tree-note')].map((r) => r.dataset.id).join(),
      readingFold: !!document.querySelector('.nt-shelf[data-shelf="reading"] .is-fold'),
    };
  });
  let s = await shelf();
  t.check("見えるのは最近・★・束だけ（並びの順）", s.shown === "f-a,f-c,f-d,f-h", s.shown);
  t.check("棚の終わりに「前のもの」一行・閉じて始まる・数は出さない", s.fold === "前のもの" && s.foldOpen === "false" && s.last, JSON.stringify(s));
  t.check("ほかの棚は畳まない", s.reading === "f-r" && !s.readingFold, JSON.stringify(s));

  await page.click('.nt-shelf[data-shelf="thinking"] .nt-row.is-fold');
  await page.waitForTimeout(300);
  s = await shelf();
  const m = (d) => { const x = new Date(Date.now() - d * 86400000); const y = x.getFullYear(), k = x.getMonth() + 1;
    return y === new Date().getFullYear() ? `${k}月` : `${y}年${k}月`; };
  const want = [...new Set([m(2), m(45), m(120)])].join("|");
  t.check("開けば月ごと（新しい月から）", s.months === want && s.old === "", `${s.months} / ${want}`);
  const MONTH = '.nt-shelf[data-shelf="thinking"] .nt-row.is-month';
  for (let k = (await page.$$(MONTH)).length - 1; k >= 0; k--) { await page.locator(MONTH).nth(k).click(); await page.waitForTimeout(300); }
  s = await shelf();
  t.check("月を開くと畳んだノート", s.old.split(",").sort().join() === "f-b,f-f,f-g", s.old);
  t.check("畳んだ行は運ぶ的にならない", (await page.$$('.nt-shelf[data-shelf="thinking"] .js-old-note.js-tree-note')).length === 0);
  t.check("見せただけでは並び・日時は動かない", (await pos()) === pos0);

  /* Alt+↓：f-a の次の兄弟は（畳んだ f-b を飛ばして）f-c。 */
  await page.focus('.nt-shelf[data-shelf="thinking"] .js-tree-note[data-id="f-a"]');
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(300);
  s = await shelf();
  t.check("Alt+↓ は畳んだ行を飛ばす", s.shown === "f-c,f-a,f-d,f-h", s.shown);
  await page.evaluate(() => KN.notes.place("f-a", { parent: null, nb: "thinking", before: "f-b" }));
  await page.waitForTimeout(200);

  /* 直すと元の位置へ。 */
  /* 直したときは onChange が来ない（紙を閉じると組み直す）。ここでは面を移って戻る。 */
  await page.evaluate(() => KN.notes.edit("f-b", { body: "直した" }));
  await page.click('.tab[data-tab="todo"]');
  await page.click('.tab[data-tab="notes"]');
  await page.waitForTimeout(300);
  s = await shelf();
  t.check("直せば元の位置へ戻る", s.shown === "f-a,f-b,f-c,f-d,f-h", s.shown);

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
