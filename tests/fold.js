/* 使っていない面を畳む（roadmap-3.1 の S4、2026年10月10日、docs/settings.md の「畳んだ面」）。

   利用者が選んだ三つ——買うものの「そろそろ切れそう」・上の帯の「これからの二週間」・
   ノートの「⋯」の「道に置く」——が既定で出ない。鍵の無い古い記録でも出ない。設定の
   スイッチで戻る（買うものは設定の画面から押して確かめる）。データは消えない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/fold.js */
const { open, checker } = require("./lib");

const t = checker("fold");

(async () => {
  const { browser, page, errors } = await open();
  const wait = (ms) => page.waitForTimeout(ms);

  const def = await page.evaluate(() => {
    const s = KN.store.get().settings;
    return [s.showLow, s.showUpcoming, s.noteRoad];
  });
  t.check("三つとも既定は畳む", JSON.stringify(def) === "[false,false,false]", JSON.stringify(def));

  /* 「そろそろ切れそう」：中身があっても出ない（runningLow を差し替える）。 */
  await page.evaluate(() => {
    const p = KN.store.addProduct({ name: "牛乳" });
    KN.insights.runningLow = () => [{ product: p, every: 7, since: 8 }];
    KN.store.addItem(KN.store.addProduct({ name: "卵" }).id);   // 空のリストには出ない
    KN.app.showScreen("list");
  });
  await wait(500);
  t.check("買うものに「そろそろ切れそう」が出ない", !(await page.$("#screen-list .low")));
  t.check("帯に「これからの二週間」が出ない",
    await page.$eval("#head .js-upcoming", (b) => b.hidden && b.offsetWidth === 0));

  await page.evaluate(() => KN.app.showScreen("settings"));
  await wait(700);
  const row = page.locator("#screen-settings .set-row", { hasText: "そろそろ切れそう" });
  t.check("買うものの設定に戻すスイッチ", (await row.count()) === 1
    && (await row.getAttribute("aria-checked")) !== "true");
  await row.click();
  await wait(200);
  t.check("押すと戻る（鍵が入る）", await page.evaluate(() => KN.store.get().settings.showLow === true));
  await page.evaluate(() => KN.app.backScreen());
  await wait(700);
  t.check("買うものに「そろそろ切れそう」が戻る", !!(await page.$("#screen-list .low .low-row")));

  await page.evaluate(() => KN.store.update((s) => { s.settings.showUpcoming = true; }));
  await wait(200);
  t.check("鍵を入れると二週間の絵が戻る",
    await page.$eval("#head .js-upcoming", (b) => !b.hidden && b.offsetWidth > 0));

  /* 鍵の無い古い記録（S4 より前）を読んでも畳む。ほかの記録はそのまま。 */
  const old = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("kaimono-note-v2"));
    delete raw.settings.showLow; delete raw.settings.showUpcoming; delete raw.settings.noteRoad;
    return raw;
  });
  await page.evaluate((raw) => localStorage.setItem("kaimono-note-v2", JSON.stringify(raw)), old);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await wait(500);
  const after = await page.evaluate(() => {
    const s = KN.store.get();
    return { keys: [s.settings.showLow, s.settings.showUpcoming, s.settings.noteRoad], n: s.products.length };
  });
  t.check("鍵の無い記録でも畳む・品物は減らない",
    JSON.stringify(after.keys) === "[false,false,false]" && after.n === old.products.length, JSON.stringify(after));

  /* ノートの「⋯」 */
  await page.evaluate(() => KN.notes.ready());
  const nid = await page.evaluate(() => {
    const n = KN.notes.draft();
    n.title = "段取り"; n.body = "箱の数";
    KN.notes.put(n);
    return n.id;
  });
  const menuOf = async () => {
    await page.click('.tab[data-tab="archive"]');
    await wait(500);
    await page.evaluate((i) => KN.screens.notes.open(i), nid);
    await page.waitForSelector(".sheet.is-note.is-open");
    await wait(400);
    await page.click(".sheet.is-note .js-note-more");
    await wait(300);
    return page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.textContent.trim()));
  };
  const off = await menuOf();
  t.check("ノートの「⋯」に「道に置く」が出ない", off.length > 0 && !off.includes("道に置く"), JSON.stringify(off));
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.evaluate(() => KN.store.update((s) => { s.settings.noteRoad = true; }));
  await wait(300);
  const on = await menuOf();
  t.check("鍵を入れると「道に置く」が戻る", on.includes("道に置く"), JSON.stringify(on));

  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
