/* ノートの開き閉じ・戻り方（docs/roadmap-2.0.md の V19・docs/notes.md の「2.0：四隅の丸いカード」）。
   V26（10月5日）で既定に：
   - 書く紙は左右と底の端まで・上だけ空けて丸角（意3。前は四隅の丸いカード）
   - カードから膨らみきった窓も四隅が丸い
   - 右へ少し払って離すと戻る／大きく払うと、その場所からカードへ縮んで閉じる
   - 払うのは左端でなくてもよい（V26）。横に送れる中身の上で始まった指は取らない
   - 一番上まで送ってあれば、中身を下へ引いて閉じる（カードへ縮む）
   - 途中まで送ってあれば、下へ引いても中身が送られるだけ
   - 本文のリンクから重ねたノートは閉じると下へ帰る（下の紙に隠れた一覧の行へ縮まない）
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
  await page.click('.tab[data-tab="notes"]');
  await settled("notes");

  const gone = () => page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });
  const isOpen = () => page.evaluate(() => !!document.querySelector(".sheet.is-note.is-open"));
  const write = async (text) => {
    await page.click("#dock .add-fab"); await page.click('.fab-menu [data-k="note"]');
    await page.waitForSelector(".sheet.is-note.is-open");
    await page.waitForTimeout(600);
    await page.keyboard.insertText(text);
    await page.click(".sheet.is-note .js-close");
    await gone();
  };
  await write("V19 長い\n" + Array.from({ length: 80 }, (_, i) => `行 ${i + 1}`).join("\n"));
  await write("V19 短い");
  /* カードは「すべてのノート」に（③）。 */
  await page.click("#screen-notes .notes-books .js-all");
  await page.waitForSelector("#screen-notes .notes-list .note-row:nth-child(2)");
  /* 面が移る一拍（faceIn：寄って入る）が終わってから測る。 */
  await page.evaluate(() => Promise.all(document.querySelector("#screen-notes .js-body").getAnimations().map((a) => a.finished)));
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
  /* 閉じる動きの終わりの紙の箱（カードへ重ねる transform のかかった箱）。 */
  const clipEnd = () => page.evaluate(() => {
    const s = document.querySelector(".sheet.is-note");
    const a = s && s.getAnimations().find((x) => x.effect.getKeyframes().some((k) => /scale\(/.test(k.transform || "")));
    if (!a) return null;
    a.pause();
    a.currentTime = a.effect.getComputedTiming().duration;
    const r = s.getBoundingClientRect();
    const out = { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
    a.play();
    return out;
  });
  const cardBox = (sel) => page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
  });
  const near = (b, r) => !!b && !!r && ["top", "right", "bottom", "left"].every((k) => Math.abs(b[k] - r[k]) < 1.5);
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const c2 = await cardBox(second);
  await page.evaluate((s) => document.querySelector(`${s} .js-open`).click(), second);
  await page.waitForSelector(".sheet.is-note.is-open");
  const grownBy = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-note");
    const a = s.getAnimations().find((x) => x.effect.getKeyframes().some((k) => /scale\(/.test(k.transform || "")));
    return a ? a.effect.getKeyframes().map((k) => Object.keys(k).filter((n) => !["offset", "easing", "composite", "computedOffset"].includes(n)).join("+")) : null;
  });
  /* 膨らむのは transform と opacity だけ（clip-path の窓はやめた。docs/redesign.md 7節）。角は紙そのものが持つ（下）。 */
  t.check("膨らむ動きは transform と opacity だけ", !!grownBy && grownBy.every((k) => /^(transform\+opacity|opacity\+transform|opacity|transform)$/.test(k)), JSON.stringify(grownBy));
  await page.waitForTimeout(700);
  const on = await box();
  /* 意3（11月22日）：左右と底は端まで、上だけ空けて丸角（前は四隅の丸いカード）。 */
  t.check("上の角が丸く、底は角なし", on.tl > 0 && on.br === 0 && on.bl === 0, JSON.stringify(on));
  t.check("左右と底は端まで", on.left === 0 && on.right === 0 && on.bottom === 0, JSON.stringify(on));
  t.check("上だけ空く", on.top > 0, JSON.stringify(on));

  await fromEdge(40, 5, 30);
  await page.waitForTimeout(600);
  const back = await box();
  t.check("左端から少し払って離すと戻る", (await isOpen()) && Math.abs(back.left - on.left) < 0.5, JSON.stringify(back));
  const mid = await box();
  await swipe(mid.left + 120, 420, 40, 0, 5, 30);
  await page.waitForTimeout(600);
  t.check("真ん中から少し払って離しても戻る", (await isOpen()) && Math.abs((await box()).left - on.left) < 0.5);
  /* 横に送れる中身の上で始まった指は取らない。 */
  await page.$eval(".sheet.is-note .sheet-body", (b) => {
    const w = document.createElement("div");
    w.className = "js-wide";
    w.style.cssText = "overflow-x:auto;position:absolute;left:0;right:0;top:300px;height:200px;z-index:5";
    w.innerHTML = '<div style="width:2000px;height:200px"></div>';
    b.append(w);
  });
  await swipe(mid.left + 120, 400, 220, 0, 10, 16);
  await page.waitForTimeout(500);
  t.check("横に送れる中身の上の払いは取らない", await isOpen());
  await page.$eval(".sheet.is-note .js-wide", (w) => w.remove());

  await swipe(mid.left + 120, 420, 220, 0, 10, 16);
  await frames();
  const edgeEnd = await clipEnd();
  const c2now = await cardBox(second);
  t.check("真ん中から払っても、その場所からカードへ縮んで閉じる", near(edgeEnd, c2now) && near(c2now, c2), JSON.stringify({ edgeEnd, c2now }));
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

  /* 本文のリンクから重ねたノートは、閉じると来た道（下）へ帰る——下の紙に隠れた一覧の行へ縮まない（縮むと下の紙の本文の真ん中にカードの影が浮いた）。 */
  await page.evaluate(() => KN.notes.addMany([
    { id: "v19-b", title: "V19 行き先", body: "行き先の本文", notebook: "", tags: [], fav: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "v19-a", title: "V19 リンク", body: "[行き先](note:v19-b)\n本文", notebook: "", tags: [], fav: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]));
  await page.waitForSelector('.notes-list .note-row[data-id="v19-b"]');
  await openCard('.notes-list .note-row[data-id="v19-a"]');
  await page.click(".sheet.is-note .js-view [data-note]");
  await page.waitForFunction(() => document.querySelectorAll(".sheet.is-note.is-open").length === 2);
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    window.__w = [];
    const t0 = performance.now();
    const tick = () => {
      const a = document.querySelectorAll(".sheet.is-note");
      if (a.length > 1) window.__w.push(Math.round(a[a.length - 1].getBoundingClientRect().width));
      if (performance.now() - t0 < 700) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const a = document.querySelectorAll(".sheet.is-note .js-close");
    a[a.length - 1].click();
  });
  await page.waitForTimeout(900);
  const lw = await page.evaluate(() => ({ w: window.__w, n: document.querySelectorAll(".sheet.is-note").length }));
  t.check("リンクから重ねたノートは下へ帰る（隠れた行へ縮まない）・下の紙は開いたまま", lw.w.length > 3 && Math.min(...lw.w) >= 380 && lw.n === 1,
    JSON.stringify({ min: Math.min(...lw.w), n: lw.n }));
  await page.click(".sheet.is-note .js-close");
  await gone();

  t.check("localStorage は変わらない", (await page.evaluate(() => (localStorage.getItem("kaimono-note-v2") || "").length)) === lsBefore);
  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
