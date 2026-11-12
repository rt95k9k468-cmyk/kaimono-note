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
    /* 頭は 名前・色の点・品数（R5。品数は .shelf-n）。 */
    const n = h && h.querySelector(".shelf-n");
    return { r: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, head: h && h.textContent.replace(n ? n.textContent : "", "").trim(), n: n && n.textContent,
      dot: !!(h && h.querySelector(".chip-dot")), rows: g.querySelectorAll(".item-wrap").length };
  }));
  t.check("棚は二つ（野菜・冷蔵）、どちらも丸い角と面を持つ",
    shelf.length === 2 && shelf.every((g) => g.r > 0 && g.bg !== "rgba(0, 0, 0, 0)"), JSON.stringify(shelf));
  t.check("棚の頭に名前と色の点と品数", shelf.length === 2 && shelf[0].head === "野菜・くだもの" && shelf[1].head === "冷蔵・冷凍"
    && shelf.every((g) => g.dot && g.n === String(g.rows)), JSON.stringify(shelf));
  t.check("二つ目の行から細い線（R5 から端から端まで）", await page.$eval("#screen-list .cat-group.is-run:nth-child(n) .item-wrap + .item-wrap",
    (w) => getComputedStyle(w).backgroundImage.includes("gradient")));

  // health：数字は丸い字。帯の日付は見出しの明朝（2026年11月10日、docs/redesign.md 4節。前は丸い字）
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(500);
  const fam = () => page.evaluate(() => [".diet-hero-value b", ".topbar-title"].map((q) => {
    const el = document.querySelector(q); return el ? getComputedStyle(el).fontFamily : "";
  }));
  const f1 = await fam();
  t.check("体重の数は ui-rounded が先頭・帯の日付は明朝", /^ui-rounded/.test(f1[0]) && /Mincho/.test(f1[1]), f1.join(" / "));
  await page.evaluate(() => document.documentElement.setAttribute("data-font", "mincho"));
  const f2 = await fam();
  t.check("明朝を選ぶと丸い字は外れる", f2.every((f) => !/ui-rounded/.test(f)), f2.join(" / "));
  await page.evaluate(() => document.documentElement.removeAttribute("data-font"));

  // daily：あの日は塗った札（2026年11月10日。前は後ろをぼかすガラス）。R6 から季節の写真は候の札の額の中だけ
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);
  const glass = await page.$eval("#screen-archive .arc-then", (el) => {
    const cs = getComputedStyle(el);
    return { bf: cs.backdropFilter || cs.webkitBackdropFilter || "none", bg: cs.backgroundColor, r: parseFloat(cs.borderTopLeftRadius),
      left: cs.borderLeftColor === cs.borderRightColor, x: el.getBoundingClientRect().left };
  });
  t.check("あの日は塗った札（ぼかさない・透かさない）・丸い角・左の柱は無い・端から離れる",
    !/blur/.test(glass.bf) && /^rgb\(/.test(glass.bg) && glass.r > 0 && glass.left && glass.x >= 12, JSON.stringify(glass));
  const photo = await page.waitForSelector("#screen-archive[data-season-img]", { timeout: 8000 }).then(() => true).catch(() => false);
  if (photo) {
    const where = await page.evaluate(() => ({
      sheet: getComputedStyle(document.querySelector("#screen-archive .tl-sheet.is-daily")).backgroundImage,
      art: getComputedStyle(document.querySelector("#screen-archive .arc-season-art")).backgroundImage }));
    t.check("写真は候の札の額の中だけ（紙の地・あの日の後ろには敷かない）", where.sheet === "none" && /url\(/.test(where.art), JSON.stringify(where).slice(0, 200));
  } else t.check("写真が読めた（img/season-photo）", false);

  t.check("エラーが無い", errors.length === 0, errors.join("\n"));
  t.done();
  await browser.close();
})();
