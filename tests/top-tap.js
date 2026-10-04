/* 上のきわ（状態バー）を押すと上へ。iOS は文書を上へ送るので、1px 送って待ち、0 に
   なったら送る器を上へ戻す（app.js の watchTopTap）。紙が開いていれば紙の本体を送る
   （長いノート。2026年10月4日）。タッチの端末としてだけ働くので touch で開く。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/top-tap.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("top-tap");
  const { browser, page, errors } = await open({ touch: true });
  /* 状態バーを押したときの iOS の動き：文書を 0 へ。 */
  const tapBar = () => page.evaluate(() => window.scrollTo(0, 0));

  t.check("タッチの端末では文書が 1px 送られて待つ",
    await page.evaluate(() => document.documentElement.classList.contains("has-top-tap") && window.scrollY >= 1));

  /* 画面：送る器を上へ。 */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(400);
  const scr = await page.evaluate(() => {
    const el = KN.app.scrollerOf(document.querySelector(".screen.is-active"));
    el.style.paddingBottom = "3000px";
    el.scrollTop = 600;
    return el.scrollTop;
  });
  await tapBar();
  await page.waitForTimeout(900);
  const scrAfter = await page.evaluate(() => KN.app.scrollerOf(document.querySelector(".screen.is-active")).scrollTop);
  t.check("画面：きわを押すと上へ", scr > 0 && scrAfter === 0, `${scr} → ${scrAfter}`);

  /* ノートの紙：紙の本体を上へ（後ろの画面は動かさない）。 */
  await page.evaluate(() => KN.app.showScreen("notes"));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector("#dock .add-fab").click());
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.fill(".sheet.is-note .js-text", Array.from({ length: 120 }, (_, i) => `行${i}`).join("\n"));
  await page.evaluate(() => document.querySelector(".sheet.is-note .js-text").blur());
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note .note-view").hidden);
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    const b = document.querySelector(".sheet.is-note .sheet-body");
    b.scrollTop = 1500;
    return b.scrollTop;
  });
  await tapBar();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    sheet: document.querySelector(".sheet.is-note .sheet-body").scrollTop,
    parked: window.scrollY >= 1,
  }));
  t.check("ノート：きわを押すと紙が上へ", before > 0 && after.sheet === 0, `${before} → ${JSON.stringify(after)}`);
  t.check("押したあとも、次の一押しのために 1px 待つ", after.parked);

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
