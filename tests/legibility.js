/* 読みやすさ（roadmap-seamless の N15）。門の外。
   明暗×文字の大きさ（標準・特大）×7画面で、出ている字を一つずつ数える：
   - コントラスト：字の色と後ろの塗りを重ねて WCAG の比。小さい字（24px 未満・太字は 18.66px 未満）は 4.5:1
     （後ろが写真・ガラス・模様のものは数えない——塗りが一色に決まらない）
   - 大きさ：11px 未満の字が無い（HIG の iOS の最小 11pt）
   - 潰れ：字のある箱の幅が 4px 未満になっていない（特大の「kg/週」が 1px になっていた）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/legibility.js
   VIEW=375 で幅を変える（既定 375×667、10月10日の総点検と同じ）。 */
const { open, checker } = require("./lib");

const SCREENS = ["todo", "list", "archive", "diet", "notes", "prices", "settings"];

/* 頁の中で走る。見えている字の要素を集めて、だめなものだけ返す。 */
function measure() {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  /* color-mix() は color(srgb …)・oklab() などで返るので、書き方を問わず canvas に塗って読む。 */
  const cx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgba = (s) => {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "rgba(0,0,0,0)"; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3]));
  /* 後ろの塗り。上から下へ重ねていき、ガラス・絵・模様に当たったら「決まらない」。 */
  function backOf(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none" || (cs.backdropFilter && cs.backdropFilter !== "none")
        || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none")) return null;
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255];
    if (!layers.length || layers[layers.length - 1][3] < 1) {
      base = rgba(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
    }
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const roots = [document.querySelector(".screen.is-active"), document.querySelector(".tabbar")].filter(Boolean);
  const bad = [];
  const seen = new Set();
  for (const root of roots) for (const el of root.querySelectorAll("*")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || el.closest("svg, .sr-only")) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= 0 || r.left >= innerWidth) continue; // 横は隣の紙。縦は送れば出るので数える
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
    /* 祖先のどれかが見えていなければ数えない（畳んだもの・隣の紙）。 */
    if (!el.checkVisibility || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const name = "." + String(el.className && el.className.baseVal != null ? el.className.baseVal : el.className).trim().split(/\s+/).join(".");
    const text = el.textContent.trim().slice(0, 12);
    const px = parseFloat(cs.fontSize);
    const push = (kind, v) => { const k = kind + name; if (seen.has(k)) return; seen.add(k); bad.push({ kind, name, text, v }); };
    if (px < 10.95) push("small", `${px.toFixed(1)}px`);
    if (r.width < 4 && r.height > 0 && text.length > 1) push("squash", `${r.width.toFixed(1)}px`);
    const back = backOf(el);
    if (!back) continue;
    const fg = rgba(cs.color);
    const ink = over(fg, back);
    const a = lum(ink), b = lum(back);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5) - 0.005) push("contrast", `${ratio.toFixed(2)}:1 ${hex(ink)} on ${hex(back)}`);
  }
  return bad;
}

(async () => {
  const t = checker("legibility");
  const w = +(process.env.VIEW || 375);
  const { browser, page, errors } = await open({ viewport: { width: w, height: w === 375 ? 667 : 844 } });

  /* 3週間ぶんの試しの記録。買うもの3つ（帯の数の札）・体重・お酒・時刻のある用事（道の端）。 */
  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return U.dayKey(d); };
    ["牛乳", "卵", "食パン"].forEach((name) => { const p = S.addProduct({ name }); if (p) S.addItem(p.id); });
    for (let i = 20; i >= 0; i--) {
      S.addWeight({ day: day(i), time: "07:00", kg: 64 + Math.sin(i) * 0.6 - i * 0.03 });
      if (i % 3 === 0) S.addDrink({ day: day(i), time: "20:00", kind: "beer", ml: 350, abv: 5 });
    }
    S.addTodo({ title: "病院の予約", due: day(0), time: "10:00", minutes: 30 });
    S.addTodo({ title: "買いもの", due: day(0), time: "17:00", minutes: 30 });
  });

  for (const theme of ["light", "dark"]) {
    for (const size of ["std", "xl"]) {
      await page.evaluate(({ theme, size }) => {
        if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
        else document.documentElement.removeAttribute("data-theme");
        KN.store.update((st) => { st.settings.textSize = size; });
      }, { theme, size });
      await page.waitForTimeout(1500); // 色の移り変わりが終わるまで
      for (const id of SCREENS) {
        await page.evaluate((id) => KN.app.showScreen(id), id);
        await page.waitForTimeout(500);
        const bad = await page.evaluate(measure);
        for (const kind of ["contrast", "small", "squash"]) {
          const hit = bad.filter((b) => b.kind === kind);
          t.check(`${theme}・${size}・${id}：${{ contrast: "コントラスト不足", small: "11px 未満", squash: "潰れ" }[kind]}が0`,
            !hit.length, hit.map((b) => `${b.name}「${b.text}」${b.v}`).join(" / "));
        }
      }
    }
  }
  /* iPhone の「コントラストを上げる」（N15 (b)）。オフでは既定のまま、オンではガラスが塞がり灰の字が濃くなり、
     同じ数え方で0。ガラスの地は帯の中に置いた札で読む（`--glass-base` は帯の上で解決される）。 */
  const probe = () => {
    const bar = document.querySelector(".tabbar");
    const p = document.createElement("i");
    p.style.cssText = "position:absolute;width:1px;height:1px;background:var(--glass-base)";
    bar.appendChild(p);
    const glass = getComputedStyle(p).backgroundColor;
    p.remove();
    const root = getComputedStyle(document.documentElement);
    return { glass, t2: root.getPropertyValue("--c-text-2").trim(), t3: root.getPropertyValue("--c-text-3").trim() };
  };
  await page.evaluate(() => KN.store.update((st) => { st.settings.textSize = "std"; }));
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
      else document.documentElement.removeAttribute("data-theme");
    }, theme);
    await page.emulateMedia({ contrast: "no-preference" });
    await page.waitForTimeout(800);
    const off = await page.evaluate(probe);
    await page.emulateMedia({ contrast: "more" });
    await page.waitForTimeout(1500);
    const on = await page.evaluate(probe);
    const opaque = (s) => !/rgba|\/ ?0?\.\d|transparent/.test(s) || /\/ ?1\)/.test(s);
    t.check(`${theme}：オフの灰の字は既定（${theme === "dark" ? "#a6a6ab・#92929a" : "#636363・#686870"}）`,
      off.t2 === (theme === "dark" ? "#a6a6ab" : "#636363") && off.t3 === (theme === "dark" ? "#92929a" : "#686870"), JSON.stringify(off));
    t.check(`${theme}：オフのガラスは透けている`, !opaque(off.glass), off.glass);
    t.check(`${theme}：オンでガラスが塞がる`, opaque(on.glass), on.glass);
    t.check(`${theme}：オンで灰の字が変わる`, on.t2 !== off.t2 && on.t3 !== off.t3, JSON.stringify(on));
    for (const id of SCREENS) {
      await page.evaluate((id) => KN.app.showScreen(id), id);
      await page.waitForTimeout(500);
      const hit = (await page.evaluate(measure)).filter((b) => b.kind === "contrast");
      t.check(`コントラストを上げる・${theme}・${id}：コントラスト不足が0`, !hit.length,
        hit.map((b) => `${b.name}「${b.text}」${b.v}`).join(" / "));
    }
    await page.emulateMedia({ contrast: "no-preference" });
  }
  t.check("頁のエラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})();
