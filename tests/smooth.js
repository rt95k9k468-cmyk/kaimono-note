/* なめらかさの約束（2026年10月9日・docs/motion.md の「押した一拍を軽く」）。速さそのものは測らず、
   **余計な仕事をしていない**ことを数で見る（機械の揺れで落ちないように。速さは frame-pace.js・heavy-pace.js）。
   - 曲線に linear() を使わない（Safari は linear() の動きを合成に回さず、主の糸で動かす）
   - 開いて落ち着いたら、動きの長さはもう読んである（はじめての席移りで :root の長さを読みにいかない）
   - daily へ移ると、紙は一度だけ組む（前は二度。その日はじめてなら三度）
   - 送るあいだも止まったあとも帯の裏を当てない・帯と＋はぼかさない（塗った面。docs/redesign.md 2節）
   - 指で何かした直後の保存は、主の糸が描いている動きが終わるまで待つ（上限つき）。合成に乗る動き・
     くり返す動きは待たない・隠れる瞬間は待たずに書く・指の無い書き換えは待たない
   - daily は同じ日なら、組み直しても読んでいた位置のまま。別の日へ移れば頭から
   - 紙の中で打っているあいだ、後ろの画面は組み直さない。紙を閉じれば組み直す
   - 円の書式は前と同じ字
   - daily の探す窓で打っても、画面は組み直さない（打った字は「ぜんぶをさがす」へ渡すだけ）
   - からだの推移の期間を押すと、紙は一度だけ組む
   日記の本文は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/smooth.js */
const fs = require("fs");
const path = require("path");
const { open, checker, ROOT } = require("./lib");

const t = checker("smooth");

/* ---- 曲線に linear() を使わない（画面を開かない） ---- */
{
  const files = [
    ...fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css")).map((f) => path.join("css", f)),
    ...fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => path.join("js", f)),
  ];
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    src.split("\n").forEach((line, i) => {
      if (/(^|[^-\w])linear\(/.test(line.replace(/\/\/.*$/, ""))) bad.push(`${f}:${i + 1}`);
    });
  }
  t.check("曲線に linear() が無い（Safari では合成に乗らない）", bad.length === 0, bad.join(" "));
}

(async () => {
  /* 頁の時計は今日の昼（12:34）から流す。途中で日付が変わると「今日の行」の数えと買うものの紙が崩れる
     （2026年10月27日、KN_CLOCK=23:59:56 で落ちた）。コマを数えるので止めずに流す（tests/README.md の試験の罠）。 */
  const midday = new Date();
  midday.setHours(12, 34, 0, 0);
  const { browser, page, errors } = await open({ viewport: { width: 390, height: 700 },
    before: (c, p) => p.clock.install({ time: midday }) });
  const raw = () => page.evaluate(() => localStorage.getItem("kaimono-note-v2") || "");
  const today = await page.evaluate(() => KN.util.todayKey());
  const yesterday = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return KN.util.dayKey(d); });

  /* ---- 動きの長さは、開いて落ち着いたところで読んである ---- */
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__tokReads = 0;
    const orig = CSSStyleDeclaration.prototype.getPropertyValue;
    CSSStyleDeclaration.prototype.getPropertyValue = function (p) {
      if (/^--(m-|ease|spring|push-e)/.test(p)) window.__tokReads++;
      return orig.call(this, p);
    };
  });
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(500);
  t.check("はじめての席移りで、動きの長さを読みにいかない", await page.evaluate(() => window.__tokReads) === 0,
    String(await page.evaluate(() => window.__tokReads)));

  /* ---- daily へ移ると、紙は一度だけ組む ---- */
  const sheetsBuilt = async (act) => {
    await page.evaluate(() => {
      window.__built = 0;
      window.__mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && n.matches(".tl-sheet.is-daily")) window.__built++;
      })));
      window.__mo.observe(document.getElementById("screen-archive"), { childList: true, subtree: true });
    });
    await act();
    return page.evaluate(() => { window.__mo.disconnect(); return window.__built; });
  };
  t.check("（前提）今日の行はまだ無い", await page.evaluate((d) => !KN.store.dayLog(d), today));
  const first = await sheetsBuilt(async () => { await page.click('.tab[data-tab="archive"]'); await page.waitForTimeout(700); });
  t.check("その日はじめて daily を開いても、紙は一度だけ組む（今日の行は組む前に用意）", first === 1, String(first));
  t.check("…今日の行は用意されている", await page.evaluate((d) => !!KN.store.dayLog(d), today));
  await page.evaluate((d) => {
    const memo = "きょうは あさから あめ。えきまで あるいた。".repeat(40);
    KN.store.setDayLog(d.today, { memo });
    KN.store.setDayLog(d.yesterday, { memo });
  }, { today, yesterday });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  const built = await sheetsBuilt(async () => { await page.click('.tab[data-tab="archive"]'); await page.waitForTimeout(700); });
  t.check("daily へ移ると、紙は一度だけ組む", built === 1, String(built));

  /* ---- daily は同じ日なら、組み直しても読んでいた位置のまま ---- */
  const scroller = () => page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.getElementById("screen-archive"));
    return { top: Math.round(sc.scrollTop), max: sc.scrollHeight - sc.clientHeight };
  });
  const s0 = await scroller();
  t.check("（前提）daily の紙が送れる長さ", s0.max > 300, String(s0.max));
  await page.evaluate(() => { KN.app.scrollerOf(document.getElementById("screen-archive")).scrollTop = 200; });
  await page.waitForTimeout(150);
  await page.evaluate(() => KN.store.update(() => {}));
  await page.waitForTimeout(150);
  const s1 = await scroller();
  t.check("同じ日を組み直しても、読んでいた位置のまま", Math.abs(s1.top - 200) <= 2, String(s1.top));
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(600);
  await page.click('.tab[data-tab="archive"]');
  await page.waitForTimeout(600);
  const s2 = await scroller();
  t.check("よその席から戻っても、同じ日なら読んでいた位置のまま", Math.abs(s2.top - 200) <= 2, String(s2.top));
  await page.evaluate((d) => KN.screens.archive.goDay(d), yesterday);
  await page.waitForTimeout(250);
  const s3 = await scroller();
  /* 前提は「読んでいた位置（200）より先まで送れる」こと——それなら位置を持ち越したとき top が 200 になって見分けられる。
     前日の紙は短い（月のまとめの空のカードを外して 287px、＋が帯と同じ段になって底の余白が減り 237px。R2）。
     本文は Daily Log が終わりの数行しか出さないので、長くしても紙は伸びない。 */
  t.check("別の日へ移れば、その日の頭から", s3.top === 0 && s3.max > 200, JSON.stringify(s3));
  await page.evaluate((d) => KN.screens.archive.goDay(d), today);
  await page.waitForTimeout(400);

  /* ---- 紙の中で打っているあいだ、後ろは組み直さない ---- */
  /* 時刻ごとでは、一件を直す紙は左の余白の「直す」から（吹き出しを押すと伸び縮み）。 */
  await page.click("#screen-archive .arc-log-row .js-post-edit");
  await page.waitForSelector(".sheet.is-card .js-memo");
  await page.waitForTimeout(600);
  await page.focus(".sheet.is-card .js-memo");
  await page.keyboard.press("End");
  const typedBuilt = await sheetsBuilt(async () => {
    await page.keyboard.insertText(" さんぽ");
    await page.waitForTimeout(1000);   // 手が止まって 500ms で残る
  });
  const savedMemo = await page.evaluate((d) => (KN.store.dayLog(d) || {}).memo || "", today);
  t.check("（前提）打っているあいだに日記は残っている", savedMemo.endsWith(" さんぽ"));
  t.check("打っているあいだ、後ろの daily は組み直さない", typedBuilt === 0, String(typedBuilt));
  const closedBuilt = await sheetsBuilt(async () => { await page.click(".sheet .js-ok"); await page.waitForTimeout(600); });
  t.check("紙を閉じたら、後ろを組み直す", closedBuilt >= 1, String(closedBuilt));
  t.check("…組み直した daily に打った字が出る", await page.evaluate(() =>
    (document.querySelector("#screen-archive .arc-log-row.is-today") || {}).textContent || "").then((x) => x.includes("さんぽ")));

  /* ---- 送るあいだ、帯の裏を見張らない ---- */
  await page.evaluate(() => {
    const S = KN.store;
    for (let i = 0; i < 40; i++) { const p = S.addProduct({ name: `品物${i}` }); if (p) S.addItem(p.id); }
  });
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(700);
  const glide = (frames, probe) => page.evaluate(async ([n, dark]) => {
    const sc = KN.app.scrollerOf(document.getElementById("screen-list"));
    window.__hits = 0;
    const orig = document.elementsFromPoint.bind(document);
    document.elementsFromPoint = (x, y) => { window.__hits++; return orig(x, y); };
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (dark && i === n - 2) {
        const d = document.createElement("div");
        d.id = "darkprobe";
        d.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:140px;background:#123;z-index:5";
        document.getElementById("app").append(d);
      }
      sc.scrollTop += 6;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const during = window.__hits;
    const took = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 400));
    return { during, took, after: window.__hits - during, max: sc.scrollHeight - sc.clientHeight };
  }, [frames, !!probe]);
  const g = await glide(24);
  t.check("（前提）買うものの紙が送れる", g.max > 200, String(g.max));
  /* 帯・＋は塗った面（2026年11月10日、docs/redesign.md 2節）。送るあいだも止まったあとも、帯の裏を当てない・
     帯に何も書かない・暗いものが裏へ来ても帯は替わらない。前は間合い（120ms）に三点ずつ当てて、夜のガラスへ替えていた。 */
  t.check("送るあいだも止まったあとも、帯の裏を当てない", g.during === 0 && g.after === 0, JSON.stringify({ during: g.during, after: g.after, took: Math.round(g.took) }));
  const g2 = await glide(8, true);
  const bar = await page.evaluate(() => {
    const el = document.getElementById("tabbar"), fab = document.querySelector(".add-fab");
    const bf = (e, p) => { const c = getComputedStyle(e, p); return c.backdropFilter || c.webkitBackdropFilter || "none"; };
    const out = { dark: el.classList.contains("is-on-dark"), style: el.getAttribute("style") || "",
      blur: [bf(el, "::before"), fab ? bf(fab) : "none"].join(), bg: getComputedStyle(el, "::before").backgroundColor };
    document.getElementById("darkprobe").remove();
    return out;
  });
  t.check("帯の裏へ暗いものが来ても、帯は替わらない（印も書き込みも無い）", !bar.dark && !/--glass/.test(bar.style) && g2.during === 0, JSON.stringify({ bar, g2 }));
  t.check("帯と＋はぼかさない・帯の地は透けない", bar.blur === "none,none" && !/rgba\([^)]*,\s*0?\.\d+\)/.test(bar.bg) && bar.bg !== "rgba(0, 0, 0, 0)", JSON.stringify(bar));

  /* ---- 保存は、動きの外で ---- */
  const hand = () => page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerdown")));
  /* 動き：paint は主の糸が描く動き（地の色）、move は合成に乗る動き（transform だけ）。 */
  const probe = (n, ms, kind, opts) => page.evaluate(([v, dur, k, o]) => {
    let el = document.getElementById("__smoothdot");
    if (!el) {
      el = document.createElement("i");
      el.id = "__smoothdot";
      el.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;pointer-events:none";
      document.body.append(el);
    }
    const frames = k === "move" ? [{ transform: "none" }, { transform: "translateX(1px)" }]
      : [{ backgroundColor: "rgb(0, 0, 0)" }, { backgroundColor: "rgb(255, 255, 255)" }];
    window.__anim = el.animate(frames, Object.assign({ duration: dur }, o || {}));
    KN.store.update((s) => { s.__smooth = v; });
  }, [n, ms, kind, opts]);
  const has = async (n) => (await raw()).includes(`"__smooth":${n}`);
  await page.waitForTimeout(400);

  await hand(); await probe(1, 400, "paint");
  await page.waitForTimeout(240);
  const early = await has(1);
  await page.waitForTimeout(500);
  t.check("指の直後の保存は、主の糸が描いている動きが終わるまで待つ", !early && await has(1), `early=${early}`);

  await hand(); await probe(2, 400, "move");
  await page.waitForTimeout(300);
  t.check("合成に乗る動き（transform だけ）は待たない", await has(2));
  await page.evaluate(() => window.__anim.cancel());

  await hand(); await probe(3, 300, "paint", { iterations: Infinity });
  await page.waitForTimeout(450);
  t.check("くり返す動きは待たない", await has(3));
  await page.evaluate(() => window.__anim.cancel());

  await hand(); await probe(4, 6000, "paint");
  await page.waitForTimeout(300);
  const held = !(await has(4));
  await page.waitForTimeout(700);
  t.check("長い動きでも、待つのは上限まで（120ms＋450ms）", held && await has(4), `held=${held}`);
  await page.evaluate(() => window.__anim.cancel());

  await hand(); await probe(5, 3000, "paint");
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  t.check("待っているうちに裏へ回れば、その場で書く", await has(5));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.__anim.cancel();
  });

  await page.waitForTimeout(1200);   // 指から離れる
  await probe(6, 3000, "paint");
  await page.waitForTimeout(450);
  t.check("指の無い書き換え（届いた記録など）は、これまでどおりすぐ書く", await has(6));
  await page.evaluate(() => {
    window.__anim.cancel();
    document.getElementById("__smoothdot").remove();
    KN.store.update((s) => { delete s.__smooth; });
    KN.store.saveNow();
  });

  /* ---- 円の書式は前と同じ字 ---- */
  const yen = await page.evaluate(() => [0, 5, 98, 1280, 12345678, -300, 0.4, -0.4, 99.95, 0.66].map((v) => ({
    v, a: KN.util.yen(v), b: "¥" + Math.round(v).toLocaleString("ja-JP"),
    c: KN.util.yenFine(v),
    d: Math.abs(v) >= 100 ? "¥" + Math.round(v).toLocaleString("ja-JP")
      : "¥" + (Math.round(v * 10) / 10).toLocaleString("ja-JP", { maximumFractionDigits: 1 }),
  })));
  const off = yen.filter((y) => y.a !== y.b || y.c !== y.d);
  t.check("円の書式は前と同じ字", off.length === 0, JSON.stringify(off));

  /* ---- daily の探す窓で打っても、画面は組み直さない（絞らない窓。2026年11月10日） ---- */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(700);
  await page.click("#head .js-search-btn");
  await page.waitForTimeout(500);
  const typed = await sheetsBuilt(async () => {
    for (const ch of ["さ", "ん", "ぽ"]) { await page.keyboard.type(ch); await page.waitForTimeout(120); }
  });
  t.check("daily の探す窓で打っても、紙は組み直さない", typed === 0, String(typed));
  t.check("…打った字は欄に入っている", await page.evaluate(() => document.querySelector("#screen-archive .js-search").value) === "さんぽ");
  await page.evaluate(() => { const c = document.querySelector("#screen-archive .js-search-clear"); c && c.click(); });

  /* ---- からだの推移の期間を押すと、紙は一度だけ組む（前は二度。docs/traps.md の「store を書いたあとに」） ---- */
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      KN.store.addWeight({ day: KN.util.dayKey(d), time: "07:00", kg: 60 + i / 10 });
    }
    KN.app.showScreen("diet");
  });
  await page.waitForTimeout(700);
  const ranged = await page.evaluate(async () => {
    let n = 0;
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((x) => {
      if (x.nodeType === 1 && x.matches(".tl-sheet")) n++;
    })));
    mo.observe(document.getElementById("screen-diet"), { childList: true, subtree: true });
    const b = [...document.querySelectorAll("#screen-diet .js-range .seg-btn")].find((x) => x.dataset.id === "90");
    if (b) b.click();
    await new Promise((ok) => setTimeout(ok, 300));
    mo.disconnect();
    return { n, found: !!b, range: KN.store.dietRange() };
  });
  t.check("からだの推移の期間を押すと、紙は一度だけ組む", ranged.found && ranged.n === 1 && ranged.range === 90, JSON.stringify(ranged));

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
