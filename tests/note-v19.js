/* ノートの開き閉じ・戻り方（docs/roadmap-2.0.md の V19・docs/notes.md の「2.0：四隅の丸いカード」）。
   2.0 の切り替え（.is-v2）の中だけ：
   - 書く紙は四隅の丸いカード・左右の空きが同じ・上下も空く
   - カードから膨らみきった窓も四隅が丸い
   - 左の端から右へ少し払って離すと戻る／大きく払うと、その場所からカードへ縮んで閉じる
   - 端でない所からの払いは取らない
   - 一番上まで送ってあれば、中身を下へ引いて閉じる（カードへ縮む）
   - 途中まで送ってあれば、下へ引いても中身が送られるだけ
   オフ（前の見た目）では、形は上だけ丸い幅いっぱい・左端の払いも中身の引きも閉じない。
   localStorage は変わらない。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-v19.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("note-v19");
  const { browser, ctx, page, errors } = await open();

  const active = () => page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  if ((await active()) !== "archive") {
    await page.evaluate(() => KN.app.showScreen("archive"));
    await settled("archive");
  }
  await page.click('.tab[data-tab="archive"]');
  await settled("notes");

  const gone = () => page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });
  const isOpen = () => page.evaluate(() => !!document.querySelector(".sheet.is-note.is-open"));
  const write = async (text) => {
    await page.click("#dock .add-fab");
    await page.waitForSelector(".sheet.is-note.is-open");
    await page.waitForTimeout(600);
    await page.keyboard.insertText(text);
    await page.click(".sheet.is-note .js-close");
    await gone();
  };
  await write("V19 長い\n" + Array.from({ length: 80 }, (_, i) => `行 ${i + 1}`).join("\n"));
  await write("V19 短い");
  const lsBefore = await page.evaluate(() => (localStorage.getItem("kaimono-note-v2") || "").length);

  const first = ".notes-list .note-row";
  const second = ".notes-list .note-row:nth-child(2)";
  const openCard = async (sel) => {
    await page.evaluate((s) => document.querySelector(`${s} .js-open`).click(), sel);
    await page.waitForSelector(".sheet.is-note.is-open");
    await page.waitForTimeout(700);
  };
  const box = () => page.$eval(".sheet.is-note", (s) => {
    const r = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    return { top: r.top, left: r.left, right: innerWidth - r.right, bottom: innerHeight - r.bottom,
      tl: parseFloat(cs.borderTopLeftRadius), br: parseFloat(cs.borderBottomRightRadius),
      bl: parseFloat(cs.borderBottomLeftRadius) };
  });

  /* 本物の指（CDP のタッチ）。 */
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 4, radiusY: 4, force: 1 }];
  const swipe = async (x, y, mx, my, steps, ms) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(x, y) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(x + (mx * i) / steps, y + (my * i) / steps) });
      await page.waitForTimeout(ms);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const fromEdge = async (mx, steps, ms) => {
    const b = await box();
    await swipe(b.left + 6, 420, mx, 0, steps, ms);
  };
  const pullBody = async (my, steps, ms) => {
    const r = await page.$eval(".sheet.is-note .sheet-body", (e) => { const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + 120 }; });
    await swipe(r.x, r.y, 0, my, steps, ms);
  };
  /* 閉じる動きの終わりの窓（clip-path）を画面の箱に直す。 */
  const clipEnd = () => page.evaluate(() => {
    const s = document.querySelector(".sheet.is-note");
    const a = s && s.getAnimations().find((x) => x.effect.getKeyframes().some((k) => k.clipPath));
    if (!a) return null;
    a.pause();
    a.currentTime = a.effect.getComputedTiming().duration;
    const cs = getComputedStyle(s);
    /* inset() は同じ数を畳んで書く（左右が同じなら三つ）ので、四つに広げる。 */
    const v = (cs.clipPath.split("round")[0].match(/-?[\d.]+px/g) || []).map(parseFloat);
    const n = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]];
    const r = s.getBoundingClientRect();
    const out = { top: r.top + n[0], right: r.right - n[1], bottom: r.bottom - n[2], left: r.left + n[3] };
    a.play();
    return out;
  });
  const cardBox = (sel) => page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  });
  const near = (b, r) => !!b && !!r && ["top", "right", "bottom", "left"].every((k) => Math.abs(b[k] - r[k]) < 1.5);
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  /* ---- オフ：前のまま ---- */
  await openCard(first);
  const off = await box();
  t.check("オフ：上だけ丸い・幅いっぱい", off.tl > 0 && off.bl === 0 && off.left === 0 && off.right === 0, JSON.stringify(off));
  await fromEdge(260, 10, 16);
  await page.waitForTimeout(500);
  t.check("オフ：左端から払っても閉じない", await isOpen());
  await page.$eval(".sheet.is-note .sheet-body", (e) => { e.scrollTop = 0; });
  await pullBody(300, 10, 16);
  await page.waitForTimeout(500);
  t.check("オフ：中身を下へ引いても閉じない", await isOpen());
  await page.keyboard.press("Escape");
  await gone();

  /* ---- オン ---- */
  await page.evaluate(() => KN.app.applyV2(true));
  const c2 = await cardBox(second);
  await page.evaluate((s) => document.querySelector(`${s} .js-open`).click(), second);
  await page.waitForSelector(".sheet.is-note.is-open");
  const grownTo = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-note");
    const a = s.getAnimations().find((x) => x.effect.getKeyframes().some((k) => k.clipPath));
    return a ? a.effect.getKeyframes().slice(-1)[0].clipPath : "";
  });
  t.check("オン：膨らみきった窓は四隅が丸い", /round 22px( 22px)*\)$/.test(grownTo), grownTo);
  await page.waitForTimeout(700);
  const on = await box();
  t.check("オン：四隅の丸いカード", on.tl > 0 && on.br > 0 && on.bl > 0, JSON.stringify(on));
  t.check("オン：左右の空きが同じ（0 より大きい）", on.left > 0 && Math.abs(on.left - on.right) < 0.5, JSON.stringify(on));
  t.check("オン：上下も空く", on.top >= on.left - 0.5 && Math.abs(on.bottom - on.left) < 0.5, JSON.stringify(on));

  await fromEdge(40, 5, 30);
  await page.waitForTimeout(600);
  const back = await box();
  t.check("左端から少し払って離すと戻る", (await isOpen()) && Math.abs(back.left - on.left) < 0.5, JSON.stringify(back));
  const mid = await box();
  await swipe(mid.left + 120, 420, 220, 0, 10, 16);
  await page.waitForTimeout(500);
  t.check("端でない所からの払いは取らない", (await isOpen()) && Math.abs((await box()).left - on.left) < 0.5);

  await fromEdge(200, 10, 16);
  await frames();
  const edgeEnd = await clipEnd();
  const c2now = await cardBox(second);
  t.check("左端から払うと、その場所からカードへ縮んで閉じる", near(edgeEnd, c2now) && near(c2now, c2), JSON.stringify({ edgeEnd, c2now }));
  await gone();

  /* 一番上で中身を下へ引く。 */
  const c1 = await cardBox(second);   // 長いノート（先に書いたので二番目）
  await openCard(second);
  await page.$eval(".sheet.is-note .sheet-body", (e) => { e.scrollTop = 300; });
  await pullBody(200, 10, 16);
  await page.waitForTimeout(500);
  const sc = await page.$eval(".sheet.is-note .sheet-body", (e) => e.scrollTop);
  t.check("途中まで送ってあれば、下へ引いても中身が送られるだけ", (await isOpen()) && sc < 300, String(sc));
  await page.$eval(".sheet.is-note .sheet-body", (e) => { e.scrollTop = 0; });
  await pullBody(30, 5, 30);
  await page.waitForTimeout(600);
  t.check("一番上で少し引いて離すと戻る", (await isOpen()) && Math.abs((await box()).top - on.top) < 0.5);
  await pullBody(300, 10, 16);
  await frames();
  const pullEnd = await clipEnd();
  t.check("一番上で下へ引くと、カードへ縮んで閉じる", near(pullEnd, await cardBox(second)) && near(c1, await cardBox(second)), JSON.stringify({ pullEnd, c1 }));
  await gone();

  await page.evaluate(() => KN.app.applyV2(false));
  t.check("localStorage は変わらない", (await page.evaluate(() => (localStorage.getItem("kaimono-note-v2") || "").length)) === lsBefore);
  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
