/* 下の帯とキーボード（2026年9月27日）。
   - 紙が開いて足もとの主色のボタンが帯の上に来ても、帯は「後ろが暗い」と読まない
     （帯より手前のものは数えない）。本当に帯の後ろが暗いときは夜になる。
   - 席の印（.tab-lens）は縁の屈折（.tab-edge）のあとに居る（ぼかされない）。
   - キーボード：fixed の床が画面の底に残る端末（iOS 26 のホーム画面アプリ。
     innerHeight と可視は縮むのに床は動かない）でも、紙の底はキーボードの上端に来る。
     床も一緒に上がる端末・innerHeight が縮まない端末（Android）も前と同じ。
   visualViewport は偽物に差し替えて、キーボードの高さを外から決める。 */
const { open, checker } = require("./lib");

const H = 844;

(async () => {
  const c = checker("tabbar-kb");
  const { browser, page, errors } = await open({
    viewport: { width: 390, height: H },
    before: async (ctx) => {
      await ctx.addInitScript(() => {
        const real = window.visualViewport;
        let fake = null;          // { h, inner }：可視の高さ・innerHeight
        const vv = new Proxy(real, {
          get(t, k) {
            if (fake && k === "height") return fake.h;
            if (fake && k === "offsetTop") return 0;
            const v = Reflect.get(t, k);
            return typeof v === "function" ? v.bind(t) : v;
          },
        });
        Object.defineProperty(window, "visualViewport", { get: () => vv, configurable: true });
        const ih = window.innerHeight;
        Object.defineProperty(window, "innerHeight", {
          get: () => (fake ? fake.inner : ih), configurable: true,
        });
        window.__kb = (f) => { fake = f; real.dispatchEvent(new Event("resize")); };
      });
    },
  });

  const bar = () => page.evaluate(() => document.getElementById("tabbar").classList.contains("is-on-dark"));

  /* ---- 帯：紙の足もとを「後ろ」と読まない ---- */
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const { node, html } = KN.util;
    const body = node(html`<div class="stack"><p>試験</p></div>`);
    const foot = node(html`<button class="btn btn-primary btn-block js-save">保存</button>`);
    window.__h = KN.ui.sheet({ title: "試験の紙", content: body, footer: foot });
  });
  await page.waitForTimeout(700);
  const footOverBar = await page.evaluate(() => {
    const r = document.getElementById("tabbar").getBoundingClientRect();
    const els = document.elementsFromPoint(r.left + r.width * .5, r.top + 14);
    return els.some((e) => e.classList.contains("js-save"));
  });
  await page.evaluate(() => KN.app.paintGlass());
  c.check("紙の「保存」が帯の真上に来ている（試験の前提）", footOverBar);
  c.check("…それでも帯は夜にならない", !(await bar()));
  await page.evaluate(() => window.__h.close());
  await page.waitForTimeout(600);
  await page.evaluate(() => KN.app.paintGlass());
  c.check("紙を閉じたあとも帯は昼のまま", !(await bar()));

  const darkBehind = await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "darkprobe";
    d.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:140px;background:#123;z-index:5";
    document.getElementById("app").append(d);
    KN.app.paintGlass();
    const on = document.getElementById("tabbar").classList.contains("is-on-dark");
    d.remove();
    KN.app.paintGlass();
    return on;
  });
  c.check("帯の後ろが本当に暗いときは夜になる（仕掛けは生きている）", darkBehind);
  c.check("暗いものが去れば昼へ戻る", !(await bar()));

  /* ---- 帯：印は縁の屈折のあと ---- */
  const order = await page.evaluate(() => {
    const kids = [...document.getElementById("tabbar").children];
    return { edge: kids.findIndex((k) => k.classList.contains("tab-edge")),
             lens: kids.findIndex((k) => k.classList.contains("tab-lens")),
             hold: kids.findIndex((k) => k.classList.contains("tab-hold")) };
  });
  c.check("印（.tab-lens）は縁の屈折（.tab-edge）より後・押した光より前",
    order.edge >= 0 && order.lens > order.edge && order.hold > order.lens, JSON.stringify(order));
  const lensFitsSeat = await page.evaluate(() => {
    const l = document.querySelector(".tab-lens").getBoundingClientRect();
    const t = document.querySelector('.tab[data-tab="list"]').getBoundingClientRect();
    return Math.abs((l.left + l.width / 2) - (t.left + t.width / 2)) < 2;
  });
  c.check("印は、いま居る席（買うもの）の真ん中", lensFitsSeat);

  /* ---- キーボード ---- */
  async function sheetWithField() {
    await page.evaluate(() => {
      const { node, html } = KN.util;
      const body = node(html`<div class="stack"><textarea class="js-t" rows="3"></textarea>
        <div style="height:600px"></div></div>`);
      const foot = node(html`<button class="btn btn-primary btn-block">保存</button>`);
      window.__h = KN.ui.sheet({ title: "打つ紙", content: body, footer: foot });
    });
    await page.waitForTimeout(500);
    await page.focus(".sheet .js-t");
  }
  async function measure(f) {
    await page.evaluate((x) => window.__kb(x), f);
    await page.waitForTimeout(700);   // settle は 600ms まで読み直す
    return page.evaluate(() => {
      const s = document.querySelector(".sheet.is-open").getBoundingClientRect();
      const root = document.documentElement;
      return { bottom: Math.round(s.bottom), top: Math.round(s.top),
               kb: root.style.getPropertyValue("--kb"),
               open: root.classList.contains("kb-open"),
               barShown: getComputedStyle(document.getElementById("tabbar")).display !== "none" };
    });
  }
  async function closeSheet() {
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__h.close(); });
    await page.evaluate(() => window.__kb(null));
    await page.waitForTimeout(800);
  }

  // iOS 26 のホーム画面アプリ：innerHeight も可視も縮む、fixed の床は底のまま。
  await sheetWithField();
  const ios26 = await measure({ h: 470, inner: 470 });
  c.check("iOS 26 型：紙の底がキーボードの上端（470px）に来る", Math.abs(ios26.bottom - 470) <= 1, JSON.stringify(ios26));
  c.check("iOS 26 型：紙の頭が画面の中", ios26.top >= 0, JSON.stringify(ios26));
  c.check("打っているあいだ帯は引っ込む", ios26.open && !ios26.barShown, JSON.stringify(ios26));
  await closeSheet();

  // Android 型：innerHeight は縮まない、可視だけ縮む（前と同じ答え）。
  await sheetWithField();
  const android = await measure({ h: 470, inner: H });
  c.check("Android 型：紙の底がキーボードの上端", Math.abs(android.bottom - 470) <= 1, JSON.stringify(android));
  await closeSheet();

  const after = await page.evaluate(() => ({
    kb: document.documentElement.style.getPropertyValue("--kb"),
    open: document.documentElement.classList.contains("kb-open"),
    barShown: getComputedStyle(document.getElementById("tabbar")).display !== "none",
  }));
  c.check("閉じたら --kb は 0・帯が戻る", after.kb === "0px" && !after.open && after.barShown, JSON.stringify(after));

  c.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
