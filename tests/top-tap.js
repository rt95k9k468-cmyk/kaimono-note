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
    const pad = document.createElement("div");
    pad.className = "js-test-pad";
    pad.style.height = "6000px";
    el.append(pad);
    el.scrollTop = 600;
    return el.scrollTop;
  });
  await tapBar();
  await page.waitForTimeout(1600);
  const scrAfter = await page.evaluate(() => KN.app.scrollerOf(document.querySelector(".screen.is-active")).scrollTop);
  t.check("画面：きわを押すと上へ", scr > 0 && scrAfter === 0, `${scr} → ${scrAfter}`);

  /* 着き方：出だしは速く、終わりはゆっくり（ふわっと止まる）。 */
  await page.evaluate(() => { const el = KN.app.scrollerOf(document.querySelector(".screen.is-active")); el.scrollTop = 2400; });
  await page.waitForTimeout(300);
  const trace = await page.evaluate(() => new Promise((res) => {
    const el = KN.app.scrollerOf(document.querySelector(".screen.is-active"));
    const from = el.scrollTop, t0 = performance.now(), pts = [];
    window.scrollTo(0, 0);
    const tick = () => {
      pts.push([performance.now() - t0, el.scrollTop]);
      if (el.scrollTop > 0 && pts.length < 300) requestAnimationFrame(tick);
      else res({ from, pts });
    };
    requestAnimationFrame(tick);
  }));
  const total = trace.pts[trace.pts.length - 1][0];
  const at = (ms) => (trace.pts.find((p) => p[0] >= ms) || trace.pts[trace.pts.length - 1])[1];
  const firstQuarter = trace.from - at(total * 0.25);
  t.check("上へ：ひと息かけて着く（ぱっと飛ばない）", total >= 450 && total <= 1400, `${Math.round(total)}ms`);
  t.check("上へ：出だしは速く", firstQuarter > trace.from * 0.4, `始めの1/4で ${Math.round(firstQuarter)}px（全 ${trace.from}px）`);
  /* 上端を少し越えて跳ね返る：中身が下へずれ、戻って、何も残らない。 */
  const dip = await page.evaluate(() => new Promise((res) => {
    const el = KN.app.scrollerOf(document.querySelector(".screen.is-active"));
    const c = el.firstElementChild;
    const tops = [];
    const t0 = performance.now();
    const tick = () => {
      tops.push(c.getBoundingClientRect().top);
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
      else {
        const rest = tops[tops.length - 1];
        res({ max: Math.max(...tops.map((y) => y - rest)), left: c.getAnimations().length,
          still: Math.abs(tops[tops.length - 10] - rest) < 0.5 });
      }
    };
    tick();
  }));
  t.check("上へ：上端を少しだけ越えて、跳ね返る", dip.max >= 4 && dip.max <= 24, JSON.stringify(dip));
  t.check("上へ：跳ね返ったあとは元の位置で、動きが残らない", dip.still && dip.left === 0, JSON.stringify(dip));
  const mono = trace.pts.every((p, i) => !i || p[1] <= trace.pts[i - 1][1]);
  t.check("上へ：行きすぎて戻らない", mono, JSON.stringify(trace.pts.map((p) => [Math.round(p[0]), Math.round(p[1])])));

  /* ノートの紙：紙の本体を上へ（後ろの画面は動かさない）。 */
  await page.waitForTimeout(1200);
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
  await page.waitForTimeout(1600);
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
