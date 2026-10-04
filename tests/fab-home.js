/* ＋から出た紙は、＋へ縮んで帰る（docs/roadmap-2.0.md の V16、ui.js の aimHome）。
   - やること：＋で開いた紙を閉じると、縮みながら＋の真ん中へ向かう。前半は薄れきらない
   - ダイエット：＋の上に立ち上がる札から開いた紙も、閉じると札のあった所ではなく＋へ向かう
   - 閉じ終えたら紙は片づく・＋は残る
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/fab-home.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("fab-home");
  const { browser, page, errors } = await open();

  const center = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  /* 閉じてから片づくまで、紙の真ん中・幅・濃さを毎フレーム控える。 */
  const recordClose = () => page.evaluate(() => new Promise((ok) => {
    const el = document.querySelector(".sheet.is-open");
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      if (el.isConnected) {
        const r = el.getBoundingClientRect();
        out.push({ t: performance.now() - t0, x: r.left + r.width / 2, y: r.top + r.height / 2,
          w: r.width, o: Number(getComputedStyle(el).opacity) });
      }
      if (!el.isConnected || performance.now() - t0 > 2000) ok(out);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  /* 帰りの終わり（片づく直前の姿）が＋に寄っているか。薄れきる前の姿で測ると、
     フレームが飛んだとき途中の姿になる（曲線が --ease-in で、終わりほど速い）。 */
  const judge = (label, rec, fab, w0) => {
    const last = rec[rec.length - 1];
    const mid = rec.find((f) => f.t > 60);
    t.check(`${label}：縮む`, !!last && last.w < w0 * 0.7, JSON.stringify(last));
    t.check(`${label}：＋へ向かう`, !!last && Math.hypot(last.x - fab.x, last.y - fab.y) < 140,
      JSON.stringify({ last, fab }));
    t.check(`${label}：前半は薄れきらない`, !!mid && mid.o > 0.5, JSON.stringify(mid));
  };

  /* ---- やること：＋から ---- */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(700);
  const fab = await center("#dock .add-fab");
  await page.mouse.click(fab.x, fab.y);
  await page.waitForTimeout(900);
  t.check("やること：＋で紙が開く", await page.evaluate(() => !!document.querySelector(".sheet.is-open.is-from-origin")));
  const w0 = await page.evaluate(() => document.querySelector(".sheet.is-open").getBoundingClientRect().width);
  const rec = recordClose();
  await page.keyboard.press("Escape");
  judge("やること", await rec, fab, w0);
  await page.waitForTimeout(400);
  t.check("やること：紙は片づく", await page.evaluate(() => !document.querySelector(".sheet")));

  /* ---- ダイエット：＋の札から ---- */
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(800);
  const fab2 = await center("#dock .add-fab");
  await page.mouse.click(fab2.x, fab2.y);
  await page.waitForTimeout(500);
  const chip = await center("#dock .fab-menu-b");
  t.check("ダイエット：＋の上に札が立つ", !!chip);
  if (chip) {
    await page.mouse.click(chip.x, chip.y);
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => !!document.querySelector(".sheet.is-open.is-from-origin"));
    t.check("ダイエット：札から紙が育つ", opened);
    if (opened) {
      const w1 = await page.evaluate(() => document.querySelector(".sheet.is-open").getBoundingClientRect().width);
      const rec2 = recordClose();
      await page.keyboard.press("Escape");
      const r2 = await rec2;
      judge("ダイエットの札", r2, fab2, w1);
      const last = r2[r2.length - 1];
      t.check("ダイエットの札：札のあった所より＋に近い", !!last
        && Math.hypot(last.x - fab2.x, last.y - fab2.y) < Math.hypot(last.x - chip.x, last.y - chip.y),
        JSON.stringify({ last, fab2, chip }));
    }
  }

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
