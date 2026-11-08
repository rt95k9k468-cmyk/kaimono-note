/* 装い（設定 → 外観 → 装い。css/attire.css・docs/look.md の「装い」）。
   - 既定は「いま」で、<html> に札（data-attire）を付けない
   - 押したその場で主色・地・見出しの書体が変わる・読み直しても残る・知らない値は「いま」へ（reconcile）
   - 和紙と墨・季節の手帳は自分の主色を持つので、そのあいだ基調色を出さない
   - 季節は今日の節気を data-sekki に。24の節気どれでも、字の主色が地の上で 4.5 以上
   - 色は明るい面だけ（暗い面の主色は「いま」と同じ）。カテゴリの色は見た目だけ読み替える
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/attire.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("attire");
  const { browser, page, errors } = await open();

  const attr = (n = "data-attire") => page.evaluate((n) => document.documentElement.getAttribute(n), n);
  const v = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const ratio = () => page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const lum = (h) => {
      const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const a = lum(cs.getPropertyValue("--c-primary").trim()), b = lum(cs.getPropertyValue("--c-bg").trim());
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  const btn = (id) => page.locator(`.set-layer:last-child .attire-pick[data-pick="${id}"]`);
  const hasAccents = () => page.locator(".set-layer:last-child .js-accents").count();
  const toSettings = async () => {
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForTimeout(500);
    await page.locator(".set-layer:last-child .set-row", { hasText: "表示・操作" }).first().click();
    await page.waitForTimeout(600);
  };
  const reload = async () => {
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app);
    await page.waitForTimeout(300);
  };

  const nowPrimary = await v("--c-primary");
  t.check("既定は「いま」", (await page.evaluate(() => KN.store.get().settings.attire)) === "now");
  t.check("「いま」では札を付けない", (await attr()) === null && (await attr("data-sekki")) === null);

  await toSettings();
  t.check("装いのボタンが五つ", (await page.locator(".set-layer:last-child .attire-pick[data-pick]").count()) === 5);
  t.check("「いま」が選ばれている", (await btn("now").getAttribute("aria-pressed")) === "true");
  t.check("「いま」では基調色が出る", (await hasAccents()) === 1);

  /* 朱を指で押す。 */
  await btn("washi-shu").click();
  await page.waitForTimeout(300);
  t.check("朱で札が付く", (await attr()) === "washi-shu");
  t.check("主色が朱になる", (await v("--c-primary")) === "#a93a24", await v("--c-primary"));
  t.check("地が和紙になる", (await v("--c-bg")) === "#f3efe5", await v("--c-bg"));
  t.check("朱の字は地の上で 4.5 以上", (await ratio()) >= 4.5, (await ratio()).toFixed(2));
  t.check("記録に残る", (await page.evaluate(() => KN.store.get().settings.attire)) === "washi-shu");
  t.check("押したボタンが選ばれている", (await btn("washi-shu").getAttribute("aria-pressed")) === "true");
  t.check("自分の主色を持つあいだ、基調色は出さない", (await hasAccents()) === 0);
  /* 選ぶところの絵（css/attire.css の「装いの絵」）：どれを着ていても、絵は自分の装いの色で描く。 */
  const shots = await page.evaluate(() => {
    const bg = (id) => {
      const el = document.querySelector(`.set-layer:last-child .attire-pick[data-pick="${id}"] .attire-shot`);
      return el ? getComputedStyle(el).backgroundColor : "";
    };
    const title = document.querySelector('.set-layer:last-child .attire-pick[data-pick="washi-shu"] .as-title');
    const nowTitle = document.querySelector('.set-layer:last-child .attire-pick[data-pick="now"] .as-title');
    return { now: bg("now"), shu: bg("washi-shu"), polish: bg("polish"), n: document.querySelectorAll(".set-layer:last-child .attire-shot").length,
      mincho: title ? /Mincho|明朝|serif/i.test(getComputedStyle(title).fontFamily) : false,
      nowGothic: nowTitle ? !/Mincho|明朝/i.test(getComputedStyle(nowTitle).fontFamily) : false };
  });
  t.check("五つの装いに絵がある", shots.n === 5, String(shots.n));
  t.check("朱を着ていても「いま」の絵は今の地、朱の絵は和紙", shots.now === "rgb(242, 242, 245)" && shots.shu === "rgb(243, 239, 229)", JSON.stringify(shots));
  t.check("絵の見出しは装いの書体（和紙は明朝・いまはゴシック）", shots.mincho && shots.nowGothic, JSON.stringify(shots));
  /* 筆の✓・墨の線（和紙と墨・季節の手帳だけ）。 */
  const ink = await page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = '<button class="check" aria-checked="true"><svg></svg></button><button class="check" aria-checked="mixed"><svg></svg></button>'
      + '<div class="item is-striking"><span class="item-name">あ</span></div>';
    document.body.append(host);
    const mask = (el) => { const cs = getComputedStyle(el); return cs.maskImage || cs.webkitMaskImage || "none"; };
    const out = { done: mask(host.querySelector('[aria-checked="true"] svg')), mixed: mask(host.querySelector('[aria-checked="mixed"] svg')),
      strike: getComputedStyle(host.querySelector(".item-name")).animationName };
    host.remove();
    return out;
  });
  t.check("和紙では✓を筆の形で抜く（できなかったの −は今のまま）", /^url/.test(ink.done) && ink.mixed === "none", JSON.stringify(ink));
  t.check("和紙では取り消し線を墨の一筆で引く", ink.strike === "ink-strike", ink.strike);
  const headFont = await page.evaluate(() => {
    const h = document.querySelector(".topbar-title") || document.querySelector("h1, h2");
    return h ? getComputedStyle(h).fontFamily.split(",")[0].replace(/"/g, "").trim() : "";
  });
  t.check("見出しが明朝になる", headFont === "Hiragino Mincho ProN", headFont);
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily.split(",")[0].trim());
  t.check("本文は今のまま", bodyFont === "-apple-system", bodyFont);
  const cat = await page.evaluate(() => {
    const el = document.createElement("i");
    el.setAttribute("style", "--cat:#5ea55a");
    document.body.append(el);
    const c = getComputedStyle(el).getPropertyValue("--cat").trim();
    el.remove();
    return c;
  });
  t.check("カテゴリの色を見た目だけ読み替える", cat === "#6b8f55", cat);

  await reload();
  t.check("読み直しても朱のまま", (await attr()) === "washi-shu" && (await v("--c-primary")) === "#a93a24");

  /* 暗い面の色は「いま」のまま。 */
  const darkNow = await page.evaluate(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", "dark");
    const withAttire = getComputedStyle(r).getPropertyValue("--c-primary").trim();
    r.removeAttribute("data-attire");
    const without = getComputedStyle(r).getPropertyValue("--c-primary").trim();
    r.setAttribute("data-attire", "washi-shu");
    r.removeAttribute("data-theme");
    return { withAttire, without };
  });
  t.check("暗い面の主色は「いま」と同じ", darkNow.withAttire === darkNow.without, JSON.stringify(darkNow));

  /* 季節の手帳。 */
  await toSettings();
  await btn("season").click();
  await page.waitForTimeout(300);
  const sekki = await page.evaluate(() => String(Math.floor(KN.season.of(KN.util.todayKey()).k / 3)));
  t.check("季節で札と今日の節気が付く", (await attr()) === "season" && (await attr("data-sekki")) === sekki, `${await attr("data-sekki")} / ${sekki}`);
  t.check("季節でも基調色は出さない", (await hasAccents()) === 0);
  const low = await page.evaluate(() => {
    const r = document.documentElement, was = r.getAttribute("data-sekki"), out = [];
    const lum = (h) => {
      const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    for (let i = 0; i < 24; i++) {
      r.setAttribute("data-sekki", String(i));
      const cs = getComputedStyle(r);
      const p = cs.getPropertyValue("--c-primary").trim(), b = cs.getPropertyValue("--c-bg").trim();
      if (!/^#[0-9a-f]{6}$/.test(p) || !/^#[0-9a-f]{6}$/.test(b)) { out.push(`${i}:${p}/${b}`); continue; }
      const k = (Math.max(lum(p), lum(b)) + 0.05) / (Math.min(lum(p), lum(b)) + 0.05);
      if (k < 4.5) out.push(`${i}:${k.toFixed(2)}`);
    }
    r.setAttribute("data-sekki", was);
    return out;
  });
  t.check("24の節気どれでも、字の主色が地の上で 4.5 以上", !low.length, low.join(" "));

  /* 今の磨き：色は今の主色のまま・基調色は出る。 */
  await btn("polish").click();
  await page.waitForTimeout(300);
  t.check("磨きで札が付き、節気の札は外れる", (await attr()) === "polish" && (await attr("data-sekki")) === null);
  t.check("磨きの主色は今のまま", (await v("--c-primary")) === nowPrimary, await v("--c-primary"));
  t.check("磨きでは基調色が出る", (await hasAccents()) === 1);

  await btn("now").click();
  await page.waitForTimeout(300);
  t.check("「いま」へ戻すと札が外れる", (await attr()) === null && (await v("--c-primary")) === nowPrimary);

  /* 知らない値は「いま」へ。 */
  await page.evaluate(() => KN.store.update((s) => { s.settings.attire = "fancy"; }));
  await reload();
  t.check("知らない値は「いま」へ戻る",
    (await page.evaluate(() => KN.store.get().settings.attire)) === "now" && (await attr()) === null);

  t.check("エラーが出ない", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
