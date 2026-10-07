/* 日記の紙の自動保存（2026年10月7日・利用者「運転しながら音声入力で書く。落ちても消えないように」）。
   - 手が止まらずに字が増え続けても（音声入力）、3 秒おきには保存される
   - 保存待ちの途中で裏へ回る（visibilitychange）・閉じられる（pagehide）と、その場で保存される
   - 何も打たずに裏へ回っても、記録はできない
   日記の本文は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-autosave.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("diary-autosave");
  const { browser, page, errors } = await open({ viewport: { width: 390, height: 844 } });

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);
  const day = await page.evaluate(() => KN.util.todayKey());
  const memo = () => page.evaluate((d) => (KN.store.dayLog(d) || {}).memo || "", day);
  const raw = () => page.evaluate(() => localStorage.getItem("kaimono-note-v2") || "");
  const hidden = (on) => page.evaluate((v) => {
    Object.defineProperty(document, "visibilityState", { get: () => (v ? "hidden" : "visible"), configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }, on);

  // 何も打たずに裏へ回っても記録はできない
  await page.click("#screen-archive .arc-log-row");
  await page.waitForTimeout(700);
  const before = await page.evaluate((d) => KN.store.dayLog(d), day);
  await hidden(true); await hidden(false);
  c.check("開いて裏へ回っただけでは記録しない",
    JSON.stringify(await page.evaluate((d) => KN.store.dayLog(d), day)) === JSON.stringify(before));

  // 話し続ける：200ms おきに一語ずつ。手が 500ms 止まることはない
  await page.focus(".sheet.is-card .js-memo");
  await page.keyboard.press("End");
  const t0 = Date.now();
  let savedAt = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.insertText(` さんぽ${i}`);
    await page.waitForTimeout(200);
    if (!savedAt && (await memo()).includes("さんぽ0")) savedAt = Date.now() - t0;
  }
  c.check("話し続けていても数秒のうちに保存される", savedAt > 0 && savedAt < 4000, `${savedAt}ms`);

  // 保存待ちのうちに裏へ回る → その場で保存・書き出し
  await page.keyboard.insertText(" うらへ");
  await hidden(true);
  c.check("裏へ回った瞬間に保存される", (await memo()).includes("うらへ"));
  c.check("…端末にも書き出される", (await raw()).includes("うらへ"));
  await hidden(false);

  // 保存待ちのうちに閉じられる（pagehide）
  await page.keyboard.insertText(" とじる");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  c.check("pagehide の瞬間に保存される", (await memo()).includes("とじる"));

  // 閉じたあとは、裏へ回っても何も起きない（聞き手は外れている）
  await page.click(".sheet .js-ok");
  await page.waitForTimeout(500);
  const after = await memo();
  await hidden(true); await hidden(false);
  c.check("閉じたあとは書き換えない", (await memo()) === after);

  c.check("エラー0", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
