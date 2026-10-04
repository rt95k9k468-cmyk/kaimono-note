/* いつもの組（R11）を外したあと（2026年9月29日、利用者が「要らない」と）。

   画面：買うものの終わりに「いつもの組にして残す」が無い・＋で組の名前を打っても
   「組：…」の札が出ない（ふつうの品物として入る）。
   データ：保存済みの `sets` は消えない——読み直しても・書き出しにも残る
   （CLAUDE.md の「保存済みの欄は消さない」。描かないだけ）。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("sets");
  const { browser, page, errors } = await open();
  const set = { id: "g-test", name: "カレー", productIds: [] };
  await page.evaluate((g) => {
    const p = KN.store.addProduct({ name: "たまねぎ" });
    KN.store.addItem(p.id);
    KN.store.update((s) => { s.sets = [{ ...g, productIds: [p.id] }]; });
    KN.store.flush();
  }, set);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(600);

  const text = await page.locator("#screen-list").innerText();
  t.check("買うものの終わりに「いつもの組にして残す」が無い", !text.includes("いつもの組"));
  t.check("読み直しても、保存済みの組は残っている", await page.evaluate(() => KN.store.get().sets.length === 1 && KN.store.get().sets[0].name === "カレー"));
  t.check("書き出しにも組が乗る", await page.evaluate(() => JSON.parse(KN.store.exportJSON()).sets.length === 1));

  await page.click(".add-fab");
  await page.waitForTimeout(500);
  const input = page.locator(".sheet input").first();
  await input.fill("カレー");
  await page.waitForTimeout(300);
  t.check("＋で組の名前を打っても「組：…」の札は出ない", !(await page.locator(".sheet").innerText()).includes("組："));

  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
