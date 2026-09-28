/* 買うもの：暦で過去の日に合わせると、その日に買ったもの・価格から戻る紙
   （2026年9月28日、docs/shopping.md の「その日に買ったもの」「価格から戻る」）。

   - 今日は「その日に買ったもの」を出さない。昨日へ送ると（shopGo＝払いの道）
     昨日買った二品だけが、買ったものの姿（is-checked）で紙の頭に出る。
     同じ行は下のアーカイブにも残る。data-flip は取り違えないよう別の名。
   - 押す道（暦の日を押す）でも組み直る・今日へ戻ると消える。
   - 価格から戻る：戻りきる直前（p≈0）には紙の影も価格の札の帯も薄れきっている
     （前は影 .14 と札の帯が居残って「一瞬暗くなる」）。滑りは --m-swipe より長い。 */
const { open, checker } = require("./lib.js");

(async () => {
  const c = checker("shop-day");
  const { browser, page, errors } = await open();
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
