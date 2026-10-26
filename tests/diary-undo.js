/* 日記の紙の ↶ ↷（2026年10月26日・利用者「貼ったのを戻したい」。docs/daily.md の「取り消す・やり直す」）。
   - 紙の底に ↶ ↷ と閉じるが一列。開いたばかりは押せない
   - 貼ったのは一手：↶ で貼る前へ、↷ で貼ったあとへ。押しても欄からカーソルが外れない
   - 戻した字も保存される（打ったときと同じ道）
   日記の本文は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-undo.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("diary-undo");
  const { browser, page, errors } = await open({ viewport: { width: 390, height: 844 } });

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);
  const day = await page.evaluate(() => KN.util.todayKey());
  const memo = () => page.evaluate((d) => (KN.store.dayLog(d) || {}).memo || "", day);
  const val = () => page.evaluate(() => document.querySelector(".sheet.is-card .js-memo").value);
  const off = (k) => page.evaluate((k) => document.querySelector(`.sheet .js-hist[data-k="${k}"]`).getAttribute("aria-disabled"), k);

  await page.click("#screen-archive .arc-log-row");
  await page.waitForTimeout(700);
  const row = await page.evaluate(() => {
    const t = (s) => { const el = document.querySelector(s); return el ? Math.round(el.getBoundingClientRect().top) : null; };
    return [t('.sheet .js-hist[data-k="undo"]'), t('.sheet .js-hist[data-k="redo"]'), t(".sheet .js-ok")];
  });
  c.check("紙の底に ↶ ↷ と閉じるが一列", row[0] != null && row[0] === row[1] && Math.abs(row[0] - row[2]) < 12, JSON.stringify(row));
  c.check("開いたばかりは ↶ を押せない", (await off("undo")) === "true");

  await page.focus(".sheet.is-card .js-memo");
  await page.keyboard.press("End");
  await page.keyboard.insertText(" あさ");
  await page.waitForTimeout(1100);
  const typed = await val();
  // 貼る（beforeinput の insertFromPaste → 字が入る → input）
  await page.evaluate(() => {
    const ta = document.querySelector(".sheet.is-card .js-memo");
    ta.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromPaste", data: " はりつけたながいもじ", bubbles: true, cancelable: true }));
    ta.setRangeText(" はりつけたながいもじ", ta.value.length, ta.value.length, "end");
    ta.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste", bubbles: true }));
  });
  const pasted = await val();
  c.check("貼ったら ↶ を押せる", (await off("undo")) === "false");

  await page.click('.sheet .js-hist[data-k="undo"]');
  c.check("↶ で貼る前へ（打った字は残る）", (await val()) === typed, JSON.stringify(await val()));
  c.check("押しても欄からカーソルが外れない",
    await page.evaluate(() => document.activeElement === document.querySelector(".sheet.is-card .js-memo")));
  c.check("↷ を押せる", (await off("redo")) === "false");
  await page.waitForTimeout(3500);
  c.check("戻した字が保存される", !(await memo()).includes("はりつけた") && (await memo()).includes("あさ"));

  await page.click('.sheet .js-hist[data-k="redo"]');
  c.check("↷ で貼ったあとへ", (await val()) === pasted);
  await page.click(".sheet .js-ok");
  await page.waitForTimeout(500);
  c.check("閉じると貼ったあとの字が残る", (await memo()).includes("はりつけた"));

  c.check("エラー0", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
