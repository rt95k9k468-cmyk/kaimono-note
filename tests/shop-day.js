/* 買うもの：暦で過去の日に合わせると、その日に買ったもの・価格から戻る紙
   （2026年9月28日、docs/shopping.md の「その日に買ったもの」「価格から戻る」）。

   - 今日は「その日に買ったもの」を出さない。昨日へ送ると（shopGo＝払いの道）
     昨日買った二品だけが、買ったものの姿（is-checked）で紙の頭に出る。
     同じ行は下のアーカイブにも残る。data-flip は取り違えないよう別の名。
   - 押す道（暦の日を押す）でも組み直る・今日へ戻ると消える。
   - 帯の「今日へ戻る」ボタンでも消える（前は日だけ戻って紙が前日のまま）。
   - 行の上を本物のタッチで横に払うと日が動く。★もアーカイブも起きない
     （行ごとの払いは外した。行に払いの裏地も無い）。
   - 価格から戻る：戻りきる直前（p≈0）には紙の影も価格の札の帯も薄れきっている
     （前は影 .14 と札の帯が居残って「一瞬暗くなる」）。滑りは --m-swipe より長い。 */
const { open, checker } = require("./lib.js");
const touch = (cdp) => async (x, y, dx) => {
  const pts = (px) => [{ x: px, y, radiusX: 12, radiusY: 12, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(x) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(x + dx * i / 12) });
    await new Promise((ok) => setTimeout(ok, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

(async () => {
  const c = checker("shop-day");
  const { browser, ctx, page, errors } = await open();
  await page.evaluate(() => {
    KN.store.loadSample();
    const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(15, 0, 0, 0);
    const z = new Date(); z.setDate(z.getDate() - 3); z.setHours(10, 0, 0, 0);
    KN.store.update((s) => {
      s.items[0].checked = true; s.items[0].checkedAt = y.toISOString();
      s.items[1].checked = true; s.items[1].checkedAt = y.toISOString();
      s.items[2].checked = true; s.items[2].checkedAt = z.toISOString();
    });
  });
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(700);

  const dayRows = () => page.$$eval("#screen-list .day-bought .item", (xs) =>
    xs.map((x) => ({ name: x.querySelector(".item-name").textContent.trim(), checked: x.classList.contains("is-checked") })));
  const names = await page.evaluate(() => KN.store.get().items.slice(0, 3)
    .map((i) => KN.store.getProduct(i.productId).name));

  c.check("今日は「その日に買ったもの」を出さない", (await dayRows()).length === 0);

  const yk = await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), -1));
  await page.evaluate((k) => KN.head.shopGo(k), yk);
  await page.waitForTimeout(400);
  let rows = await dayRows();
  c.check("昨日へ送ると、昨日買った二品だけが出る",
    rows.length === 2 && rows.every((r) => names.slice(0, 2).includes(r.name)), JSON.stringify(rows));
  c.check("買ったものの姿（線と薄さ）で出る", rows.every((r) => r.checked));
  const head = await page.$eval("#screen-list .day-bought-head", (e) => e.textContent.replace(/\s+/g, ""));
  const d = new Date(); d.setDate(d.getDate() - 1);
  c.check("見出しは「◯月◯日に買ったもの」と数", head === `${d.getMonth() + 1}月${d.getDate()}日に買ったもの2`, head);
  c.check("紙のいちばん上に出る", await page.$eval("#screen-list .js-body", (b) =>
    b.firstElementChild && b.firstElementChild.classList.contains("day-bought")));
  const flips = await page.$$eval("#screen-list .js-body [data-flip]", (xs) => xs.map((x) => x.dataset.flip));
  c.check("data-flip が重ならない（アーカイブの同じ行と取り違えない）",
    new Set(flips).size === flips.length, flips.join(","));
  c.check("下のアーカイブにも残る", await page.$$eval("#screen-list .js-done .item-name",
    (xs, n) => n.slice(0, 2).every((x) => xs.some((e) => e.textContent.trim() === x)), names));

  // 押す道：暦の日を押す（3日前）。週の外なら月で開いて押す。
  const zk = await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), -3));
  await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: true }));
  await page.waitForTimeout(400);
  await page.click(`#head .cal-day[data-day="${zk}"]`);
  await page.waitForTimeout(400);
  rows = await dayRows();
  c.check("暦の日を押しても組み直る（3日前の一品）",
    rows.length === 1 && rows[0].name === names[2], JSON.stringify(rows));

  await page.evaluate(() => KN.head.shopGo(KN.util.todayKey()));
  await page.waitForTimeout(400);
  c.check("今日へ戻ると消える", (await dayRows()).length === 0);

  // 帯の「今日へ戻る」ボタン（実機で前日のままになっていた道）
  await page.evaluate((k) => KN.head.shopGo(k), yk);
  await page.waitForTimeout(400);
  c.check("（前提）昨日に居て、頭に二品", (await dayRows()).length === 2);
  await page.click("#head .js-go-today");
  await page.waitForTimeout(500);
  c.check("「今日へ戻る」ボタンで、その日に買ったものが消える", (await dayRows()).length === 0);
  c.check("「今日へ戻る」ボタンで、日が今日に", await page.evaluate(() =>
    KN.head.shopDay() === KN.util.todayKey()));

  // 行の上を横に払う：日が動く・★もアーカイブも起きない
  c.check("行に払いの裏地（今回買う／アーカイブ）が無い",
    await page.$$eval("#screen-list .swipe-yes, #screen-list .swipe-arch", (xs) => xs.length === 0));
  const row = await page.evaluate(() => {
    const w = [...document.querySelectorAll("#screen-list .js-body .item-wrap")]
      .find((e) => !e.querySelector(".is-checked"));
    const r = w.querySelector(".item-body").getBoundingClientRect();
    const it = KN.store.get().items.find((i) => i.id === w.dataset.itemId);
    return { id: w.dataset.itemId, x: r.left + r.width / 2, y: r.top + r.height / 2, fav: !!it.fav };
  });
  const flick = touch(await ctx.newCDPSession(page));
  await flick(row.x - 60, row.y, 160);
  await page.waitForTimeout(800);
  c.check("行の上を右へ払うと、日が一日戻る", await page.evaluate((k) => KN.head.shopDay() === k, yk));
  const after = await page.evaluate((id) => {
    const it = KN.store.get().items.find((i) => i.id === id);
    return { fav: !!it.fav, archived: !!KN.store.getProduct(it.productId).archived };
  }, row.id);
  c.check("払っても★は変わらない・アーカイブされない",
    after.fav === row.fav && !after.archived, JSON.stringify(after));
  await page.click("#head .js-go-today");
  await page.waitForTimeout(500);

  await page.evaluate((k) => KN.head.shopGo(k), yk);
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: false }));
  await page.waitForTimeout(300);

  // 価格から戻る：戻りきる直前の姿
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(1200);
  c.check("帯の shopping で価格へ", await page.evaluate(() => KN.app.faceAt() === 1));
  const t0 = Date.now();
  await page.click('.tab[data-tab="list"]');
  const frames = [];
  while (Date.now() - t0 < 900) {
    frames.push(await page.evaluate(() => {
      const s = document.querySelector("#screen-list .tl-sheet");
      const f = document.querySelector("#screen-prices .js-filter");
      const scr = document.getElementById("screens");
      const p = parseFloat(scr.style.getPropertyValue("--face-p"));
      const sh = getComputedStyle(s).boxShadow;
      const a = sh === "none" ? 0 : parseFloat((sh.match(/rgba\([^)]*,\s*([\d.]+)\)/) || [0, 1])[1]);
      const back = document.getElementById("screen-prices");
      return { t: performance.now(), top: s.getBoundingClientRect().top, a,
        op: f && back.classList.contains("is-face-back") && !back.hidden ? parseFloat(getComputedStyle(f).opacity) : 0,
        settling: s.closest(".screen").classList.contains("is-face-settle") };
    }));
    await page.waitForTimeout(16);
  }
  const moving = frames.filter((f) => f.settling);
  const rest = frames[frames.length - 1].top;
  const near = moving.filter((f) => f.top - rest < 12);
  c.check("戻りきる直前（頭が家から 12px 以内）では影が薄れている",
    near.length > 0 && near.every((f) => f.a < 0.04), JSON.stringify(near.map((f) => [Math.round(f.top - rest), f.a])));
  c.check("戻りきる直前では価格の札の帯も薄れている",
    near.every((f) => f.op < 0.15), JSON.stringify(near.map((f) => f.op)));
  const ms = moving.length ? moving[moving.length - 1].t - moving[0].t : 0;
  const swipe = await page.evaluate(() => KN.motion.ms("--m-swipe"));
  c.check("帯で戻る滑りは --m-swipe より長い", ms > swipe, `${Math.round(ms)}ms（--m-swipe ${swipe}ms）`);
  c.check("戻ると買うもの・頭の「その日に買ったもの」は残る",
    await page.evaluate(() => KN.app.faceAt() === 0) && (await dayRows()).length === 2);

  c.check("ページのエラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
