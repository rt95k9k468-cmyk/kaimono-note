/* 指の重さ（roadmap-unify の U4、docs/motion.md の「指の重さは一か所」）。
   並べ替え（reorder.js）と左端から戻る（edge-back.js）には専用の試験が無かったので、ここで見る。
   どちらも試しの器に付けて、KN.gesture の数どおりに動くかを見る。

   - 並べ替え：HOLD より前に離せば持ち上がらない・HOLD 押さえれば持ち上がる・その前に
     HOLD_SLOP より動けば送り（持ち上がらない）・持ち上げて下へ運べば onDrop(0, 2)。
     買うものの行も HOLD で持ち上がる。
   - 左端から：EDGE より内側から始めた指は取らない・ゆっくり少し引いて離すと戻らない・
     同じ長さでも速く払えば戻る・速くても BACK_FLING_MIN に届かなければ戻らない・
     ゆっくりでも幅の 1/3 引けば戻る。 */
const { open, checker } = require("./lib.js");

(async () => {
  const c = checker("gesture-weight");
  const { browser, page, errors } = await open();
  await page.evaluate(() => KN.store.loadSample());
  await page.waitForTimeout(300);
  const G = await page.evaluate(() => ({ ...KN.gesture }));
  const wait = (ms) => page.waitForTimeout(ms);
  const active = () => page.evaluate(() => KN.reorder.isActive());

  /* ---------- 並べ替え ---------- */
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "t-reorder";
    box.style.cssText = "position:fixed;left:0;top:120px;width:300px;z-index:99999;background:#fff";
    for (let i = 0; i < 3; i++) {
      const r = document.createElement("div");
      r.className = "t-row"; r.dataset.i = i; r.textContent = "行" + i;
      r.style.cssText = "height:50px;user-select:none";
      box.append(r);
    }
    document.body.append(box);
    window.__drops = [];
    KN.reorder.attach(box, { item: ".t-row", onDrop: (f, t) => window.__drops.push([f, t]) });
  });
  const row0 = { x: 100, y: 145 };

  await page.mouse.move(row0.x, row0.y);
  await page.mouse.down();
  await wait(G.HOLD - 160);
  await page.mouse.up();
  await wait(200);
  c.check("HOLD より前に離せば持ち上がらない", !(await active()) && !(await page.evaluate(() => __drops.length)));

  await page.mouse.move(row0.x, row0.y);
  await page.mouse.down();
  await page.mouse.move(row0.x, row0.y + G.HOLD_SLOP + 4, { steps: 3 });
  await wait(G.HOLD + 150);
  c.check("その前に HOLD_SLOP より動けば、ただの送り", !(await active()));
  await page.mouse.up();
  await wait(100);

  await page.mouse.move(row0.x, row0.y);
  await page.mouse.down();
  await wait(G.HOLD + 120);
  c.check("HOLD 押さえれば持ち上がる", await active());
  await page.mouse.move(row0.x, row0.y + 110, { steps: 12 });
  await wait(120);
  await page.mouse.up();
  await page.waitForFunction(() => __drops.length, null, { timeout: 3000 }).catch(() => {});
  await wait(400);   // 離したあとのクリックを食べる間（350ms）が過ぎるまで
  c.check("持ち上げて下へ運ぶと onDrop(0, 2)",
    await page.evaluate(() => JSON.stringify(__drops) === "[[0,2]]"), await page.evaluate(() => JSON.stringify(__drops)));
  await page.evaluate(() => document.getElementById("t-reorder").remove());

  /* 買うものの行（本物の画面）。 */
  await page.click('.tab[data-tab="list"]');
  await wait(600);
  const item = await page.evaluate(() => {
    const w = [...document.querySelectorAll("#screen-list .item-wrap")]
      .find((x) => x.parentElement.querySelectorAll(":scope > .item-wrap").length > 1);
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  c.check("買うものに並べ替えられる行がある", !!item);
  if (item) {
    await page.mouse.move(item.x, item.y);
    await page.mouse.down();
    await wait(G.HOLD + 120);
    c.check("買うものの行も HOLD で持ち上がる", await active());
    await page.mouse.up();
    await page.waitForFunction(() => !KN.reorder.isActive(), null, { timeout: 3000 }).catch(() => {});
    await wait(300);
  }

  /* ---------- 左端から戻る ---------- */
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "t-edge";
    host.style.cssText = "position:fixed;inset:0;z-index:99999;background:#fff;touch-action:pan-y";
    const top = document.createElement("div");
    top.style.cssText = "position:absolute;inset:0";
    host.append(top);
    document.body.append(host);
    window.__edge = [];
    KN.edgeBack.wire({
      el: host,
      begin: () => {
        __edge.push("begin");
        return { top, under: null, commit: () => __edge.push("commit"), cancel: () => __edge.push("cancel") };
      },
    });
  });
  const W = 390, Y = 400;
  const ended = () => page.waitForFunction(() => /commit|cancel/.test(__edge[__edge.length - 1] || ""), null, { timeout: 3000 })
    .then(() => true).catch(() => false);
  const last = () => page.evaluate(() => { const l = __edge.slice(); __edge.length = 0; return l.join(","); });
  /* 引く：from から dx だけ、n 回に分けて、一回ごとに gap ms 置く。 */
  const pull = async (from, dx, n, gap) => {
    await page.mouse.move(from, Y);
    await page.mouse.down();
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(from + dx * i / n, Y);
      if (gap) await wait(gap);
    }
    await page.mouse.up();
  };

  await pull(40, 80, 8, 0);   // EDGE は 24
  await wait(300);
  c.check("端（EDGE）より内側から始めた指は取らない", (await last()) === "");

  await pull(4, 60, 10, 40);   // 60px を 400ms：0.15px/ms
  c.check("ゆっくり少し引いて離すと戻らない", (await ended()) && (await last()) === "begin,cancel");

  await pull(4, 60, 4, 4);     // 速く払う
  c.check("同じ長さでも速く払えば戻る", (await ended()) && (await last()) === "begin,commit");

  await pull(4, G.BACK_FLING_MIN - 2, 2, 2);
  c.check("速くても BACK_FLING_MIN に届かなければ戻らない", (await ended()) && (await last()) === "begin,cancel");

  await pull(4, Math.ceil(W / 3) + 12, 20, 40);
  c.check("ゆっくりでも幅の 1/3 引けば戻る", (await ended()) && (await last()) === "begin,commit");
  await page.evaluate(() => document.getElementById("t-edge").remove());

  c.check("エラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  c.done();
})();
