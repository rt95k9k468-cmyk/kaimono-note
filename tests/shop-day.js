/* 買うもの：暦で過去の日に合わせると、その日に買ったもの・価格から戻る紙
   （2026年9月28日、docs/shopping.md の「その日に買ったもの」「価格から戻る」）。

   - 今日は「その日に買ったもの」を出さない。昨日へ送ると（shopGo＝払いの道）
     昨日買った二品だけが、買ったものの姿（is-checked）で紙の頭に出る。
     紙はそれだけ——まだ買っていないもの・「このリストを送る」・アーカイブは
     出ない（同じ夜）。何も買っていない日は「◯月◯日に買ったもの 0」だけ。
   - アーカイブの段は無い。今日買ったものはリストの終わりに「今日買ったもの」。
   - 押す道（暦の日を押す）でも組み直る・今日へ戻ると消える。
   - 帯の「今日へ戻る」ボタンでも消える（前は日だけ戻って紙が前日のまま）。
   - 行の上を本物のタッチで横に払うと日が動く。★もアーカイブも起きない
     （行ごとの払いは外した。行に払いの裏地も無い）。
   - 価格から戻る：買うもの ⇄ 価格は横に入れ替わる（紙を下げない。docs/redesign.md 5節）。戻りきったら
     紙に影も transform も残らず、頭の「その日に買ったもの」は残る。 */
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
  /* 時計は昼に止める：「昨日」「3日前」を壁の時計で作ると、0:00 をまたいで落ちる（roadmap-seamless の N10）。 */
  const NOW = new Date(2026, 9, 1, 12, 0);
  const daysAgo = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return d; };
  const { browser, ctx, page, errors } = await open({ before: async (cx, p) => { await p.clock.setFixedTime(NOW); } });
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
  /* 列：絵の丸の左・値段の右。買ったものの行も、リストの行と同じ列に並ぶ
     （★と丸を抜いて両端へ寄せない。同じ夜・五度目）。 */
  const cols = (sel) => page.$$eval(sel, (xs) => xs.map((x) => ({
    emoji: Math.round(x.querySelector(".item-emoji").getBoundingClientRect().left),
    price: Math.round(x.querySelector(".item-price").getBoundingClientRect().right) })));
  const listCol = (await cols("#screen-list .js-body .item:not(.is-checked)"))[0];
  const sameCols = (cs) => cs.length > 0 && cs.every((c) => c.emoji === listCol.emoji && c.price === listCol.price);
  const unseen = (sel) => page.$$eval(sel, (xs) =>
    xs.length > 0 && xs.every((b) => getComputedStyle(b).visibility === "hidden" && b.tabIndex === -1));

  const yk = await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), -1));
  await page.evaluate((k) => KN.head.shopGo(k), yk);
  await page.waitForTimeout(400);
  let rows = await dayRows();
  c.check("昨日へ送ると、昨日買った二品だけが出る",
    rows.length === 2 && rows.every((r) => names.slice(0, 2).includes(r.name)), JSON.stringify(rows));
  c.check("買ったものの姿（線と薄さ）で出る", rows.every((r) => r.checked));
  const head = await page.$eval("#screen-list .day-bought-head", (e) => e.textContent.replace(/\s+/g, ""));
  const d = daysAgo(1);
  c.check("見出しは「◯月◯日に買ったもの」と数", head === `${d.getMonth() + 1}月${d.getDate()}日に買ったもの2`, head);
  c.check("紙のいちばん上に出る", await page.$eval("#screen-list .js-body", (b) =>
    b.firstElementChild && b.firstElementChild.classList.contains("day-bought")));
  const flips = await page.$$eval("#screen-list .js-body [data-flip]", (xs) => xs.map((x) => x.dataset.flip));
  c.check("data-flip が重ならない", new Set(flips).size === flips.length, flips.join(","));
  c.check("過去の日の行に★も丸も見えない（押せない）", await unseen("#screen-list .day-bought .fav, #screen-list .day-bought .check"));
  const pastCols = await cols("#screen-list .day-bought .item");
  c.check("過去の日の行も、今日のリストの行と同じ列（両端へ寄せない）", sameCols(pastCols),
    JSON.stringify({ list: listCol, past: pastCols }));
  c.check("過去の日の紙は、その日に買ったものだけ（まだ買っていないもの・送る・アーカイブが無い）",
    await page.$eval("#screen-list .js-body", (b) => b.children.length === 1
      && !b.querySelector(".list-share, .done-head, .low, .trip")
      && [...b.querySelectorAll(".item")].every((x) => x.closest(".day-bought"))));

  // 何も買っていない日：「◯月◯日に買ったもの 0」だけ
  const nk = await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), -2));
  await page.evaluate((k) => KN.head.shopGo(k), nk);
  await page.waitForTimeout(400);
  const d2 = daysAgo(2);
  c.check("何も買っていない日は「◯月◯日に買ったもの 0」だけ", await page.$eval("#screen-list .js-body", (b, want) =>
    b.children.length === 1 && b.querySelector(".day-bought-head").textContent.replace(/\s+/g, "") === want
      && !b.querySelector(".item"), `${d2.getMonth() + 1}月${d2.getDate()}日に買ったもの0`));

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
  c.check("今日の紙にアーカイブの段が無い", !(await page.$("#screen-list .done-head")));
  c.check("今日の紙にはリストが戻る", await page.$$eval("#screen-list .js-body .item:not(.is-checked)", (xs) => xs.length > 0));

  // 今日買ったものは、リストの終わりに「今日買ったもの」
  await page.evaluate(() => KN.store.update((s) => {
    s.items[3].checked = true; s.items[3].checkedAt = new Date().toISOString();
  }));
  await page.waitForTimeout(400);
  c.check("今日買ったものの行は★が見えず、丸だけ残る（押しまちがいを戻せる）",
    await unseen("#screen-list .day-bought .fav") && await page.$$eval("#screen-list .day-bought .check",
      (xs) => xs.length === 1 && getComputedStyle(xs[0]).visibility === "visible"));
  const todayCols = await cols("#screen-list .day-bought .item");
  c.check("今日買ったものの行も、リストの行と同じ列", sameCols(todayCols),
    JSON.stringify({ list: listCol, today: todayCols }));
  await page.click("#screen-list .day-bought .check");
  await page.waitForTimeout(500);
  c.check("今日の丸を押すと買うものへ戻る", await page.evaluate(() => !KN.store.get().items[3].checked));
  await page.evaluate(() => KN.store.update((s) => {
    s.items[3].checked = true; s.items[3].checkedAt = new Date().toISOString();
  }));
  await page.waitForTimeout(400);
  c.check("今日買ったものがリストの終わりに出る", await page.$eval("#screen-list .js-body", (b) => {
    const last = b.lastElementChild;
    return last.classList.contains("day-bought")
      && last.querySelector(".day-bought-head").textContent.replace(/\s+/g, "") === "今日買ったもの1";
  }));
  // 見出しの ＞ で閉じる・開く（2026年9月29日）。開け閉めは showChecked に残る
  c.check("今日の紙に「このリストを送る」が無い", !(await page.$("#screen-list .list-share, #screen-list .js-share")));
  c.check("品目（カテゴリの組）の間に線が無い", await page.$$eval("#screen-list .cat-group",
    (xs) => xs.every((x) => getComputedStyle(x).backgroundImage === "none")));
  await page.click("#screen-list .day-bought-toggle");
  await page.waitForTimeout(400);
  c.check("＞ で閉じると行が消え、見出しは残る", (await dayRows()).length === 0
    && await page.$eval("#screen-list .day-bought-toggle", (b) => b.getAttribute("aria-expanded") === "false")
    && await page.evaluate(() => KN.store.get().settings.showChecked === false));
  await page.click("#screen-list .day-bought-toggle");
  await page.waitForTimeout(400);
  c.check("もう一度押すと開く", (await dayRows()).length === 1
    && await page.evaluate(() => KN.store.get().settings.showChecked === true));
  await page.evaluate(() => KN.store.update((s) => { s.items[3].checked = false; s.items[3].checkedAt = null; }));
  await page.waitForTimeout(400);
  c.check("今日何も買っていなければ出さない", (await dayRows()).length === 0
    && !(await page.$("#screen-list .day-bought")));

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
    /* 暦が月に開いていると紙の見える所は低い（帯が盆のぶん高い。R2）。前の手順で送られていても、行を見える所へ。 */
    w.scrollIntoView({ block: "center" });
    const r = w.querySelector(".item-body").getBoundingClientRect();
    const it = KN.store.get().items.find((i) => i.id === w.dataset.itemId);
    const at = document.elementFromPoint(r.left + r.width / 2 - 60, r.top + r.height / 2);
    return { id: w.dataset.itemId, x: r.left + r.width / 2, y: r.top + r.height / 2, fav: !!it.fav, hit: at ? String(at.className || at.tagName) : "" };
  });
  const flick = touch(await ctx.newCDPSession(page));
  await flick(row.x - 60, row.y, 160);
  await page.waitForTimeout(800);
  c.check("行の上を右へ払うと、日が一日戻る", await page.evaluate((k) => KN.head.shopDay() === k, yk), JSON.stringify(row));
  c.check("日が動いた紙は、ずれた層のまま残らない（transform も will-change も無い）", await page.evaluate(() => {
    const b = document.querySelector("#screen-list .js-body");
    return !b.style.transform && !b.style.willChange && getComputedStyle(b).transform === "none";
  }));
  const after = await page.evaluate((id) => {
    const it = KN.store.get().items.find((i) => i.id === id);
    return { fav: !!it.fav, archived: !!KN.store.getProduct(it.productId).archived };
  }, row.id);
  c.check("払っても★は変わらない・アーカイブされない",
    after.fav === row.fav && !after.archived, JSON.stringify(after));

  /* 最後の動きと同じ拍に離す。前は、動きが頼んだ描画（rAF）が離したあとに
     走って、素に戻した紙を指のぶん（44px まで）横へずらし直していた
     ——日が替わったあとも紙の中身が横にずれたまま・はみ出したまま
     （iPhone、同じ日の夜・五度目）。iPhone では離す知らせが最後の動きと
     同じ拍に来る。Chromium は動きを描画の拍に揃えて配るので、本物の
     タッチ（CDP）ではこの順が作れない——ここだけは一つの拍の中で
     pointer の down→move→up を投げる。行き・帰りの両方で見る。 */
  const bodyX = () => page.evaluate(() => {
    const b = document.querySelector("#screen-list .js-body");
    return { tf: b.style.transform || "", left: Math.round(b.getBoundingClientRect().left),
      sheet: Math.round(b.closest(".tl-sheet").getBoundingClientRect().left) };
  });
  for (const [dx, want] of [[-160, 1], [160, -1]]) {
    const from = await page.evaluate(() => KN.head.shopDay());
    await page.evaluate((dx) => {
      const s = document.querySelector("#screen-list .tl-sheet");
      const r = s.getBoundingClientRect();
      const x = r.left + r.width / 2 - dx / 2, y = r.top + r.height / 2;
      const ev = (type, px) => s.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerId: 7, pointerType: "touch", isPrimary: true, clientX: px, clientY: y }));
      ev("pointerdown", x);
      for (let i = 1; i <= 12; i++) ev("pointermove", x + dx * i / 12);
      ev("pointerup", x + dx);
    }, dx);
    await page.waitForTimeout(800);
    const moved = await page.evaluate(([f, w]) => KN.head.shopDay() === KN.util.shiftDay(f, w), [from, want]);
    const x = await bodyX();
    c.check(`すぐ離しても日が動く（${dx < 0 ? "次" : "前"}の日へ）`, moved);
    c.check(`すぐ離しても、紙の中身は横にずれたまま残らない（${dx < 0 ? "次" : "前"}の日へ）`,
      !x.tf && x.left === x.sheet, JSON.stringify(x));
  }

  await page.click("#head .js-go-today");
  await page.waitForTimeout(500);

  await page.evaluate((k) => KN.head.shopGo(k), yk);
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: false }));
  await page.waitForTimeout(300);

  // 価格へ行って戻る：横に入れ替わる（紙を下げて後ろの地を出す仕掛けはやめた）
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(1200);
  c.check("帯の shopping で価格へ", await page.evaluate(() => KN.app.faceAt() === 1));
  /* 毎コマ**頁の中で**控える（rAF。頁へ往復して控えると、混んだ CI でコマを拾い損ねる）。 */
  await page.evaluate(() => {
    const out = window.__frames = [];
    const t0 = performance.now();
    const tick = () => {
      const scr = document.getElementById("screen-list"), s = scr.querySelector(".tl-sheet");
      out.push({ t: performance.now(), x: scr.hidden ? null : Math.round(scr.getBoundingClientRect().left),
        y: Math.round(new DOMMatrix(getComputedStyle(s).transform).m42), sh: getComputedStyle(s).boxShadow });
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(1300);
  const frames = await page.evaluate(() => window.__frames);
  const xs = frames.filter((f) => f.x != null).map((f) => f.x);
  c.check("価格から戻るとき、買うものは横から入る（紙は下がらない・影を持たない）",
    Math.min(...xs) < -50 && frames.every((f) => f.y === 0 && f.sh === "none"), JSON.stringify([Math.min(...xs), frames.filter((f) => f.y || f.sh !== "none").length]));
  const lastF = frames[frames.length - 1];
  c.check("戻りきったら紙は元の所（ずれも影も残らない）", lastF.x === 0 && lastF.y === 0 && lastF.sh === "none", JSON.stringify(lastF));
  c.check("戻ると買うもの・頭の「その日に買ったもの」は残る",
    await page.evaluate(() => KN.app.faceAt() === 0) && (await dayRows()).length === 2);

  c.check("ページのエラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
