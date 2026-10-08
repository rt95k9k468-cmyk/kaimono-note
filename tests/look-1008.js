/* 見た目の三つ（2026年10月8日、利用者が見比べの画像で選んだ）。

   - 数字は丸い字：体重の大きな数・帯の日付は --font-num（ui-rounded が先頭）。明朝を選ぶと外れる。
   - 買うものは棚ごとのカード：組は丸い角と面を持ち、頭に棚の名前（chip-dot つき）。
   - daily の「あの日」は写真の上のガラス：ぼかしが効き、角が丸く、主色の柱は無い。写真が読めた日は
     紙の地が写真の帯になる（薄い幕はほかの日と同じ）。
   日記の本文は試験用の無難な字だけ。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/look-1008.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("look-1008");
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => {
      await pg.clock.setFixedTime(new Date(2026, 9, 8, 10, 0));
      await ctx.addInitScript(() => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("kaimono-note-v2", JSON.stringify({
          schema: 2, settings: { theme: "light" },
          archive: { entries: [], days: [
            { date: "2024-10-08", memo: "試験の一行（その一）", createdAt: "2024-10-08" },
            { date: "2025-10-08", memo: "試験の一行（その二）", createdAt: "2025-10-08" },
          ] },
        }));
      });
    },
  });

  await page.evaluate(() => {
    const s = KN.store;
    [["試験の野菜", "c-veg"], ["試験の牛乳", "c-cold"], ["試験の卵", "c-cold"]].forEach(([name, categoryId]) => {
      const p = s.addProduct({ name, categoryId }); s.addItem(p.id || p);
    });
    s.addWeight({ day: "2026-10-08", time: "07:10", kg: 61.5 });
  });
  await page.waitForTimeout(400);

  // 買うもの：棚ごとのカード
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(500);
  const shelf = await page.$$eval("#screen-list .cat-group.is-run", (gs) => gs.map((g) => {
    const cs = getComputedStyle(g), h = g.querySelector(":scope > .shelf-head");
    return { r: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, head: h && h.textContent.trim(),
      dot: !!(h && h.querySelector(".chip-dot")), rows: g.querySelectorAll(".item-wrap").length };
  }));
  t.check("棚は二つ（野菜・冷蔵）、どちらも丸い角と面を持つ",
    shelf.length === 2 && shelf.every((g) => g.r > 0 && g.bg !== "rgba(0, 0, 0, 0)"), JSON.stringify(shelf));
  t.check("棚の頭に名前と色の点", shelf.length === 2 && shelf[0].head === "野菜・くだもの" && shelf[1].head === "冷蔵・冷凍"
    && shelf.every((g) => g.dot), JSON.stringify(shelf));
  t.check("二つ目の行から細い線（品名の頭から）", await page.$eval("#screen-list .cat-group.is-run:nth-child(n) .item-wrap + .item-wrap",
    (w) => getComputedStyle(w).backgroundImage.includes("gradient")));

  // health：数字は丸い字
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(500);
  const fam = () => page.evaluate(() => [".diet-hero-value b", ".topbar-title"].map((q) => {
    const el = document.querySelector(q); return el ? getComputedStyle(el).fontFamily : "";
  }));
  const f1 = await fam();
  t.check("体重の数・帯の日付は ui-rounded が先頭", f1.every((f) => /^ui-rounded/.test(f)), f1.join(" / "));
  await page.evaluate(() => document.documentElement.setAttribute("data-font", "mincho"));
  const f2 = await fam();
  t.check("明朝を選ぶと丸い字は外れる", f2.every((f) => !/ui-rounded/.test(f)), f2.join(" / "));
  await page.evaluate(() => document.documentElement.removeAttribute("data-font"));

  // daily：あの日はガラス
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);
  const glass = await page.$eval("#screen-archive .arc-then", (el) => {
    const cs = getComputedStyle(el);
    return { bf: cs.backdropFilter || cs.webkitBackdropFilter, r: parseFloat(cs.borderTopLeftRadius),
      left: cs.borderLeftColor === cs.borderRightColor, mx: parseFloat(cs.marginLeft) };
  });
  t.check("あの日は後ろをぼかすガラス・丸い角・左の柱は無い・端から離れる",
    /blur/.test(glass.bf) && glass.r > 0 && glass.left && glass.mx > 0, JSON.stringify(glass));
  const photo = await page.waitForSelector("#screen-archive[data-season-img]", { timeout: 8000 }).then(() => true).catch(() => false);
  if (photo) {
    const bg = await page.$eval("#screen-archive .tl-sheet.is-daily", (s) => getComputedStyle(s).backgroundImage);
    t.check("写真が読めた日は、あの日の後ろに写真の帯（候の色のぼかしは重ねない）",
      /url\(/.test(bg) && (bg.match(/gradient/g) || []).length === 1, bg.slice(0, 160));
    t.check("あの日の写真にも、ほかの日と同じ薄い幕（明るい色）",
      /^linear-gradient\((rgba|color)\([^)]*[,/] 0\.66\) 0px/.test(bg), bg.slice(0, 160));
  } else t.check("写真が読めた（img/season-photo）", false);

  t.check("エラーが無い", errors.length === 0, errors.join("\n"));
  t.done();
  await browser.close();
})();
