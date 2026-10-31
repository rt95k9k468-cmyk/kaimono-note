/* パソコンの境目（docs/desk.md の段12）。desk.js は 390・1100・1440px だけを見るので、形が切り替わる幅の両側と、
   背の低い窓・大きな窓はここが見る。
   - 839｜840：帯は下｜窓の背いっぱいの左の列
   - 中身の幅（P3a。窓から左の列を引いた幅）791｜792＝窓 1023｜1024：やることの今日は道と時間割を並べない｜並べる。
     からだのカードは一列｜段組み。左の列を畳めば同じ窓でも並ぶ（900px：中身 668 → 836）
   - 1279｜1280：買うものは一枚｜買うもの｜価格を左右
   - ノートの席で開いたノート（P3b。中身の幅で）：839 は紙（覆いあり）、840 から右の段（覆いなし）。「すべてのノート」は
     中身 859｜860＝窓 1091｜1092 で、段が器いっぱい（一覧の上）｜一覧の右。畳めば窓 923｜924 で同じ
   - どの幅でも、どの席も頁が横に伸びない（はみ出して横に送れる頁にならない）
   - 背の低い窓（1024×768・1280×720）：日記の書く紙は窓に収まり、ボタンが窓の外に出ない
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-edges.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("desk-edges");
  const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
  const wait = (ms) => page.waitForTimeout(ms);
  const box = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e || !e.getClientRects().length) return null;
    const r = e.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

  await page.evaluate(async () => {
    const S = KN.store;
    const a = S.addStore("スーパー");
    ["牛乳", "卵", "食パン"].forEach((name) => { const p = S.addProduct({ name }); if (p) { S.addItem(p.id); S.addPrice(p.id, { storeId: a.id, price: 100, amount: 1, date: KN.util.todayKey() }); } });
    S.addTodo({ title: "試しの予定", due: KN.util.todayKey(), time: "10:00", minutes: 30 });
    S.addWeight({ day: KN.util.todayKey(), time: "07:00", kg: 60 });
    const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
    await KN.notes.addMany(["一つめ", "二つめ"].map((title, i) => ({ id: `n-edge${i}`, title, body: "試しの本文",
      notebook: "private", tags: [], fav: false, createdAt: at(i), updatedAt: at(i), deletedAt: null })));
  });

  const SEATS = ["archive", "notes", "todo", "list", "diet"];
  const go = async (seat) => { await page.click(`.tab-${seat}`); await wait(450); };
  /** 頁が横に伸びていない（どこかがはみ出すと、窓より広い頁になって横に送れてしまう）。 */
  const flat = () => page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return { ok: document.scrollingElement.scrollWidth <= w + 1 && document.body.scrollWidth <= w + 1,
      sw: document.scrollingElement.scrollWidth, bw: document.body.scrollWidth, w };
  });
  /** 道と時間割が左右に並んでいる。 */
  const roadBeside = async () => {
    await page.evaluate(() => { const b = document.querySelector('#screen-todo .wk-faces .seg-btn[data-face="today"]'); if (b) b.click(); });
    await wait(450);
    const road = await box("#screen-todo .day-road"), tl = await box("#screen-todo .todo-day.is-tl > .tl");
    return { on: !!(road && tl && road.r <= tl.l && Math.abs(road.t - tl.t) < 40), road, tl };
  };
  /** からだのカードが同じ高さに二枚以上（段組み）。 */
  const dietCols = () => page.evaluate(() => {
    const tops = [...document.querySelectorAll("#screen-diet .diet-day.is-here > .diet-card, #screen-diet .day-slide > .diet-card")]
      .filter((c) => c.getClientRects().length).map((c) => Math.round(c.getBoundingClientRect().top));
    return { on: tops.length >= 2 && new Set(tops).size < tops.length, tops };
  });
  /** ノートの席で「すべてのノート」から一つめを開き、開いた紙の箱と覆いを見て閉じる。 */
  const notePane = async () => {
    await page.evaluate(() => { const a = document.querySelector(".notes-tree .js-tree-all"); if (a) a.click(); });
    await wait(500);
    await page.evaluate(() => {
      const r = [...document.querySelectorAll("#screen-notes .note-row .note-open")].find((e) => e.textContent.includes("一つめ"));
      if (r) r.click();
      else KN.screens.notes.open("n-edge0", null, {});    // 木の無い幅（電話の形）のホームには「すべて」が無い
    });
    await page.waitForSelector(".sheet.is-note.is-open", { timeout: 4000 }).catch(() => {});
    await wait(500);
    const pane = await box(".sheet.is-note.is-open");
    const cover = await page.evaluate(() => [...document.querySelectorAll(".sheet-backdrop.is-note-cover")]
      .some((b) => getComputedStyle(b).display !== "none" && b.getClientRects().length > 0));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-note.is-open"), null, { timeout: 3000 }).catch(() => {});
    await wait(300);
    return { pane, cover };
  };

  for (const [w, h] of [[839, 900], [840, 900], [1023, 768], [1024, 768], [1199, 900], [1200, 900], [1279, 900], [1280, 900], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(500);
    const desk = w >= 840;
    const bar = await box("#tabbar");
    t.check(`${w}px：帯は${desk ? "窓の背いっぱいの左の列" : "下"}`,
      !!bar && (desk ? bar.l === 0 && bar.t === 0 && bar.b === h && bar.w <= 240 : bar.t > h / 2), JSON.stringify(bar));

    const wide = [];
    for (const s of SEATS) {
      await go(s);
      const f = await flat();
      if (!f.ok) wide.push(`${s} ${f.sw}/${f.bw}>${f.w}`);
      if (s === "todo" && (w === 1023 || w === 1024)) {
        const r = await roadBeside();
        t.check(`${w}px：やることの今日は道と時間割を${w >= 1024 ? "左右に並べる" : "並べない"}`, r.on === (w >= 1024), JSON.stringify(r));
      }
      if (s === "diet" && (w === 1023 || w === 1024)) {
        const c = await dietCols();
        t.check(`${w}px：からだのカードは${w >= 1024 ? "段組み" : "一列"}`, c.on === (w >= 1024), JSON.stringify(c.tops));
      }
      if (s === "list" && (w === 1279 || w === 1280)) {
        const duo = await page.evaluate(() => document.getElementById("screen-prices").classList.contains("is-duo-r"));
        t.check(`${w}px：買うもの｜価格を${w >= 1280 ? "左右に並べる" : "並べない（めくる）"}`, duo === (w >= 1280));
      }
      if (s === "notes" && (w === 839 || w === 840)) {
        const n = await notePane();
        const docked = !!n.pane && n.pane.l === 232 && n.pane.r === w && !n.cover;
        t.check(`${w}px：ノートの席で開いたノートは${w >= 840 ? "右の段（木の右・覆いなし）" : "紙（覆いあり）"}`,
          !!n.pane && (w >= 840 ? docked : n.cover && !docked), JSON.stringify(n));
      }
    }
    t.check(`${w}px：どの席も頁が横に伸びない`, !wide.length, wide.join(" | "));
  }

  /* P3a：窓の幅でなく中身の幅で。900px の窓は列を開けば一列、畳めば（中身が 836px に広がって）道｜時間割・からだ二段。 */
  await page.setViewportSize({ width: 900, height: 900 });
  await wait(500);
  const seatForm = async () => { await go("todo"); const r = await roadBeside(); await go("diet"); return { road: r.on, diet: (await dietCols()).on }; };
  const open900 = await seatForm();
  await page.keyboard.press("Control+Backslash");
  await wait(600);
  const fold900 = await seatForm();
  await page.keyboard.press("Control+Backslash");
  await wait(600);
  t.check("900px：列を開けば一列、畳めば道｜時間割・からだ二段（中身の幅で決まる）",
    !open900.road && !open900.diet && fold900.road && fold900.diet, JSON.stringify({ open900, fold900 }));

  /* P3b：「すべてのノート」で開いたノートは、中身が 860px（一覧 380＋本文 480）からは一覧の右、狭いと器いっぱい（一覧の上）。
     左の列を畳めば同じことが窓 924px から。 */
  const paneAt = async (w, fold) => {
    await page.setViewportSize({ width: w, height: 900 });
    await wait(400);
    if (fold) { await page.keyboard.press("Control+Backslash"); await wait(600); }
    await go("notes");
    const n = await notePane();
    if (fold) { await page.keyboard.press("Control+Backslash"); await wait(400); }
    return n;
  };
  for (const [w, fold, rail] of [[1091, false, 232], [1092, false, 232], [923, true, 64], [924, true, 64]]) {
    const n = await paneAt(w, fold);
    const three = w === 1092 || w === 924;
    t.check(`${w}px${fold ? "（畳んだ列）" : ""}：すべてのノートで開いたノートは${three ? "一覧の右" : "器いっぱい（一覧の上）"}・覆いなし`,
      !!n.pane && !n.cover && n.pane.r === w && n.pane.l === rail + (three ? 380 : 0), JSON.stringify(n));
  }

  /* 背の低い窓：日記の書く紙は窓に収まり、押すところが窓の外に出ない。 */
  for (const [w, h] of [[1024, 768], [1280, 720]]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(500);
    await go("archive");
    await page.evaluate(() => document.querySelector(".js-think-write").click());
    await page.waitForSelector(".sheet.is-card.is-open", { timeout: 4000 }).catch(() => {});
    await wait(600);
    const fit = await page.evaluate(() => {
      const s = document.querySelector(".sheet.is-card.is-open");
      if (!s) return null;
      const r = s.getBoundingClientRect();
      const out = [...s.querySelectorAll("button, [role=button], textarea, input")]
        .filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== "hidden")
        .map((b) => b.getBoundingClientRect()).filter((q) => q.top < -1 || q.bottom > innerHeight + 1);
      return { t: Math.round(r.top), b: Math.round(r.bottom), out: out.length, h: innerHeight };
    });
    t.check(`${w}×${h}：日記の書く紙は窓に収まり、ボタンも欄も窓の中`, !!fit && fit.t >= 0 && fit.b <= h && fit.out === 0, JSON.stringify(fit));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-card"), null, { timeout: 3000 }).catch(() => {});
  }

  t.check("エラーなし", !errors.length, errors.join(" | "));
  t.done();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
