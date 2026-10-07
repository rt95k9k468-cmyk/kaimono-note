/* ＋から出た紙は、＋へ縮んで帰る（docs/roadmap-2.0.md の V16、ui.js の aimHome）。
   - やること：＋で開いた紙を閉じると、縮みながら＋の真ん中へ向かう。前半は薄れきらない
   - ダイエット：＋の上に立ち上がる札から開いた紙も、閉じると札のあった所ではなく＋へ向かう
   - 閉じ終えたら紙は片づく・＋は残る
   - V26：帰りは --m-sheet-close より長く（一瞬で閉じない）、＋の大きさ近くまで縮む
   - U17：＋の紙は四隅の丸いカード（is-fab-card）
   - U17：打っているあいだ（＋が下へ引っ込んでいる）に閉じても、開いたときの＋へ縮んで帰る
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/fab-home.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("fab-home");
  let { browser, page, errors } = await open();

  const center = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  /* 閉じてから片づくまで、紙の真ん中・幅・濃さ・置き場所を毎フレーム控える。コマはページの中に
     溜め、あとで読む——閉じるあいだ一つの evaluate で待ち続けると、まれに「文脈が壊れた」で
     切られた（読み直しは起きていない。timeOrigin も同じ）。 */
  const recordClose = async () => {
    await page.evaluate(() => {
      const el = document.querySelector(".sheet.is-open");
      const out = window.__rec = [];
      const t0 = performance.now();
      const tick = () => {
        if (el.isConnected) {
          const r = el.getBoundingClientRect();
          out.push({ t: performance.now() - t0, x: r.left + r.width / 2, y: r.top + r.height / 2,
            w: r.width, o: Number(getComputedStyle(el).opacity), top: el.offsetTop });
        }
        if (el.isConnected && performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else out.done = true;
      };
      requestAnimationFrame(tick);
    });
    return async () => {
      await page.waitForFunction(() => window.__rec && window.__rec.done, null, { timeout: 4000 });
      return page.evaluate(() => window.__rec.slice());
    };
  };
  /* 帰りの終わり（片づく直前の姿）が＋に寄っているか。薄れきる前の姿で測ると、
     フレームが飛んだとき途中の姿になる（曲線が --ease-in で、終わりほど速い）。 */
  const judge = (label, rec, fab, w0) => {
    const last = rec[rec.length - 1];
    const mid = rec.find((f) => f.t > 60);
    t.check(`${label}：縮む`, !!last && last.w < w0 * 0.7, JSON.stringify(last));
    t.check(`${label}：＋へ向かう`, !!last && Math.hypot(last.x - fab.x, last.y - fab.y) < 140,
      JSON.stringify({ last, fab }));
    t.check(`${label}：前半は薄れきらない`, !!mid && mid.o > 0.5, JSON.stringify(mid));
    const long = rec.filter((f) => f.o > 0.05).pop();
    t.check(`${label}：帰りは一瞬で終わらない（見えているのが 0.25 秒より長い）`, !!long && long.t > 250, JSON.stringify(long));
    const small = rec.filter((f) => f.o > 0.05).reduce((m, f) => Math.min(m, f.w), Infinity);
    t.check(`${label}：見えたまま＋の近くの大きさまで縮む`, small < w0 * 0.35, String(small));
  };

  const isCard = () => page.evaluate(() => {
    const el = document.querySelector(".sheet.is-open"), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return el.classList.contains("is-fab-card") && r.left >= 6 && innerHeight - r.bottom >= 6
      && parseFloat(cs.borderBottomLeftRadius) > 10;
  });

  /* ---- やること：＋から ---- */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(700);
  const fab = await center("#dock .add-fab");
  await page.mouse.click(fab.x, fab.y);
  await page.waitForTimeout(900);
  t.check("やること：＋で紙が開く", await page.evaluate(() => !!document.querySelector(".sheet.is-open.is-from-origin")));
  t.check("やること：四隅の丸いカード（U17）", await isCard());
  const w0 = await page.evaluate(() => document.querySelector(".sheet.is-open").getBoundingClientRect().width);
  const rec = await recordClose();
  await page.keyboard.press("Escape");
  judge("やること", await rec(), fab, w0);
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
    t.check("ダイエット：四隅の丸いカード（U17）", opened && await isCard());
    if (opened) {
      const w1 = await page.evaluate(() => document.querySelector(".sheet.is-open").getBoundingClientRect().width);
      const rec2 = await recordClose();
      await page.keyboard.press("Escape");
      const r2 = await rec2();
      judge("ダイエットの札", r2, fab2, w1);
      const last = r2[r2.length - 1];
      t.check("ダイエットの札：札のあった所より＋に近い", !!last
        && Math.hypot(last.x - fab2.x, last.y - fab2.y) < Math.hypot(last.x - chip.x, last.y - chip.y),
        JSON.stringify({ last, fab2, chip }));
    }
  }

  /* ---- 打っているあいだ（＋が下へ引っ込んでいる）に閉じても、開いたときの＋へ帰る（U17） ---- */
  /* 画面の大きさを途中で変えるので、別に開いたページで最後に（同じページで続けると、
     あとの段の evaluate がまれに「文脈が壊れた」で落ちた。読み直しは起きていない）。 */
  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  ({ browser, page, errors } = await open());
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(700);
  const fabK = await center("#dock .add-fab");
  await page.mouse.click(fabK.x, fabK.y);
  await page.waitForTimeout(900);
  /* 欄に焦点があれば打っている（app.js の fit）。iOS はキーボードのぶん画面の高さごと
     縮めるので、465 に縮めて真似る（閉じたら 844 へ戻す）。 */
  await page.evaluate(() => {
    document.querySelector(".sheet.is-open input:not([type=hidden]), .sheet.is-open textarea").focus();
  });
  await page.setViewportSize({ width: 390, height: 465 });
  await page.evaluate(() => visualViewport.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(500);
  t.check("打っているあいだ：kb-open", await page.evaluate(() =>
    document.documentElement.classList.contains("kb-open")));
  t.check("打っているあいだ：＋は引っ込む", await page.evaluate(() =>
    getComputedStyle(document.querySelector("#dock")).opacity === "0"));
  const w2 = await page.evaluate(() => document.querySelector(".sheet.is-open").getBoundingClientRect().width);
  const rec3 = await recordClose();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => visualViewport.dispatchEvent(new Event("resize")));
  const r3 = await rec3();
  judge("打っているあいだ", r3, fabK, w2);
  /* キーボードが下りて画面が伸びても、縮む途中で下へ跳ばない（利用者「ショッピングの戻り方がダメ」）。
     一コマの動きはコマの詰まりで揺れるので、動きを除いた置き場所（offsetTop）が動かないかで見る。 */
  const tops = r3.map((f) => f.top);
  const drift = Math.max(...tops) - Math.min(...tops);
  t.check("打っているあいだ：画面が伸びても紙の置き場所は動かない", drift < 2, String(drift));
  t.check("打っているあいだ：＋の真ん中に着く", Math.hypot(r3[r3.length - 1].x - fabK.x, r3[r3.length - 1].y - fabK.y) < 20,
    JSON.stringify(r3[r3.length - 1]));
  /* 引っ込んだ＋の箱へ向かうと、真ん中が画面の下の外（iPhone ではキーボードの裏）へ消える。 */
  const end3 = r3[r3.length - 1];
  t.check("打っているあいだ：画面の下の外へ縮まない", !!end3 && end3.y <= fabK.y + 12,
    JSON.stringify({ end3, fabK }));
  await page.waitForTimeout(500);
  t.check("打っているあいだ：紙は片づく", await page.evaluate(() => !document.querySelector(".sheet")));

  t.check("エラーなし（打っているあいだ）", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
