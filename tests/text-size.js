/* 文字の大きさ（B11）。設定 → 外観 → 文字の大きさ。
   - 既定は「標準」で、いままでと同じ大きさ（--fs-k を書かない）
   - 押したその場で字が変わる・読み直しても残る
   - 知らない値は「標準」へ戻る（reconcile）
   - 特大でも、横にはみ出して読めなくなる字が増えない（四つの席と設定）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/text-size.js
   SHOTS=<置き場> を付けると、特大の各画面をそこへ撮る（リポジトリの外に）。 */
const path = require("path");
const { open, checker } = require("./lib");

(async () => {
  const t = checker("text-size");
  const { browser, page, errors } = await open();

  const k = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fs-k").trim());
  /* --fs-md は calc() のまま返るので、字を一つ置いて測る。 */
  const bodyPx = () => page.evaluate(() => {
    const p = document.createElement("span");
    p.style.fontSize = "var(--fs-md)"; p.textContent = "あ";
    document.body.append(p);
    const px = parseFloat(getComputedStyle(p).fontSize);
    p.remove();
    return px;
  });

  t.check("既定は標準", (await page.evaluate(() => KN.store.get().settings.textSize)) === "std");
  t.check("標準では倍率を書かない", !(await page.evaluate(() => document.documentElement.style.getPropertyValue("--fs-k"))));
  const base = await bodyPx();
  t.check("標準の本文は 14px", Math.abs(base - 14) < 0.01, String(base));

  /* 横にはみ出して切れている字の数（見えている画面の中だけ）。 */
  const clipped = () => page.evaluate(() => {
    const scr = document.querySelector(".screen.is-active") || document.body;
    let n = 0; const who = [];
    scr.querySelectorAll("*").forEach((el) => {
      if (!el.childNodes.length || el.children.length) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== "visible" && cs.textOverflow !== "ellipsis") {
        n++; who.push(el.className || el.tagName);
      }
    });
    return { n, who: who.slice(0, 5) };
  });

  const tabs = ["daily", "todo", "list", "diet"];
  const before = {};
  for (const id of tabs) {
    await page.evaluate((id) => KN.app.showScreen(id), id);
    await page.waitForTimeout(400);
    before[id] = await clipped();
  }

  /* 設定 → 外観 → 特大 を指で押す。 */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "外観" }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.set-layer:last-child .seg-btn[data-size="xl"]').click();
  await page.waitForTimeout(200);
  t.check("特大で倍率 1.25", (await k()) === "1.25", await k());
  t.check("特大の本文は 17.5px", Math.abs((await bodyPx()) - 17.5) < 0.01);
  t.check("押した札が選ばれている",
    (await page.locator('.set-layer:last-child .seg-btn[data-size="xl"]').getAttribute("aria-pressed")) === "true");
  const setFs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".set-layer:last-child .set-title")).fontSize));
  t.check("設定の字も大きくなる（17 → 21.25）", Math.abs(setFs - 21.25) < 0.01, String(setFs));
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, "text-size-settings.png") });

  for (const id of tabs) {
    await page.evaluate((id) => KN.app.showScreen(id), id);
    await page.waitForTimeout(400);
    const c = await clipped();
    t.check(`${id}：特大でも切れる字が増えない（${before[id].n} → ${c.n}）`, c.n <= before[id].n, c.who.join(", "));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `text-size-${id}.png`) });
  }

  /* 読み直しても残る。 */
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  t.check("読み直しても特大のまま", (await k()) === "1.25");

  /* 端末に合わせる：Chromium は -apple-system-body を知らないので 1。 */
  await page.evaluate(() => { KN.store.update((s) => { s.settings.textSize = "auto"; }); KN.app.applyTextSize("auto"); });
  t.check("端末（この試験のブラウザ）では標準と同じ", (await k()) === "1" && Math.abs((await bodyPx()) - 14) < 0.01, await k());

  /* 知らない値は標準へ。 */
  await page.evaluate(() => KN.store.update((s) => { s.settings.textSize = "huge"; }));
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  t.check("知らない値は標準へ戻る", (await page.evaluate(() => KN.store.get().settings.textSize)) === "std");

  t.check("エラーが出ない", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
