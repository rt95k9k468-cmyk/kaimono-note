/* 買った行を「今日買ったもの」の束へしまう（docs/roadmap-2.0.md の V17、docs/shopping.md）。
   - 束が開いているとき：✓した行は薄れて消えずに、束の中の席へ滑っていく
     （途中で一度も見えなくならない・束の中で動いている瞬間がある）
   - 束が閉じているとき：行が束の頭へ縮んで入り、数が一つ増える
   - 動きを減らす設定：その場で組み直す（買った印は付く）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/shop-tuck.js */
const { open, checker } = require("./lib.js");

(async () => {
  const t = checker("shop-tuck");
  const { browser, page, errors } = await open();
  await page.evaluate(() => KN.store.loadSample());
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(900);

  /* いちばん上の、まだ買っていない行の id。 */
  const firstId = () => page.evaluate(() => {
    const w = document.querySelector("#screen-list .item-wrap:not(.day-bought .item-wrap)");
    return w ? w.dataset.flip : null;
  });
  /* その行を毎フレーム見張る：いちばん薄かった濃さ、束の中で動いていたか。 */
  const watch = (id) => page.evaluate((i) => {
    window.__tuck = { min: 1, moving: false, on: true };
    const tick = () => {
      if (!window.__tuck.on) return;
      const w = document.querySelector(`#screen-list .item-wrap[data-flip="${i}"]`);
      if (w) {
        const it = w.querySelector(".item");
        const op = Number(getComputedStyle(w).opacity) * (it ? Number(getComputedStyle(it).opacity) : 1);
        window.__tuck.min = Math.min(window.__tuck.min, op);
        if (w.closest(".day-bought") && getComputedStyle(w).transform !== "none") window.__tuck.moving = true;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, id);
  const stop = () => page.evaluate(() => { window.__tuck.on = false; return window.__tuck; });
  const checked = (id) => page.evaluate((i) => !!(KN.store.get().items.find((x) => x.id === i) || {}).checked, id);
  const tapCheck = (id) => page.click(`#screen-list .item-wrap[data-flip="${id}"] .check`);

  /* ---- 開いた束へ ---- */
  const a = await firstId();
  t.check("買っていない行がある", !!a);
  await watch(a);
  await tapCheck(a);
  await page.waitForTimeout(1800);
  const ra = await stop();
  t.check("開いた束：買った印が付く", await checked(a));
  t.check("開いた束：行は束の中にある", await page.evaluate((i) =>
    !!document.querySelector(`#screen-list .day-bought .item-wrap[data-flip="${i}"]`), a));
  t.check("開いた束：途中で薄れて消えない", ra.min >= 0.3, String(ra.min));
  t.check("開いた束：束の中の席へ滑っていく", ra.moving);

  /* ---- 閉じた束へ ---- */
  await page.click("#screen-list .day-bought-toggle");
  await page.waitForTimeout(400);
  t.check("束を閉じた", await page.evaluate(() =>
    document.querySelector("#screen-list .day-bought-toggle").getAttribute("aria-expanded") === "false"));
  const count = () => page.evaluate(() =>
    Number(document.querySelector("#screen-list .day-bought-toggle .cat-head-count").textContent));
  const before = await count();
  const b = await firstId();
  await tapCheck(b);
  /* 線を引き終わって（最長 620ms）縮み始めたところで、行が頭のほうへ動いている。 */
  const shrink = await page.waitForFunction((i) => {
    const w = document.querySelector(`#screen-list .item-wrap[data-flip="${i}"]`);
    if (!w) return null;
    const an = w.getAnimations().find((x) => x.playState === "running");
    if (!an) return null;
    const head = document.querySelector("#screen-list .day-bought-toggle").getBoundingClientRect();
    const last = an.effect.getKeyframes().pop().transform || "";
    return { last, below: head.top > w.getBoundingClientRect().top };
  }, b, { timeout: 2000 }).then((h) => h.jsonValue()).catch(() => null);
  t.check("閉じた束：行が縮む", !!shrink && /scale\(0?\.2\)/.test(shrink.last), JSON.stringify(shrink));
  await page.waitForTimeout(1200);
  t.check("閉じた束：買った印が付く", await checked(b));
  t.check("閉じた束：数が一つ増える", (await count()) === before + 1, `${before} → ${await count()}`);
  t.check("閉じた束：行は描かれない", await page.evaluate((i) =>
    !document.querySelector(`#screen-list .item-wrap[data-flip="${i}"]`), b));

  /* ---- 動きを減らす設定 ---- */
  await page.click("#screen-list .day-bought-toggle");
  await page.waitForTimeout(400);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const c = await firstId();
  await tapCheck(c);
  await page.waitForTimeout(900);
  t.check("動きを減らす：買った印が付く", await checked(c));
  t.check("動きを減らす：束の中にある", await page.evaluate((i) =>
    !!document.querySelector(`#screen-list .day-bought .item-wrap[data-flip="${i}"]`), c));
  await page.emulateMedia({ reducedMotion: "no-preference" });

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
