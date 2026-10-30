/* ノートの表（読むときに表の形）と、広い画面の「画面いっぱい」。決めごとは docs/notes.md「表と画面いっぱい」。

   表：「| … |」と区切りの行 → 表。Notion から来た、マスの中の改行で切れた行は区切りの列の数までつなぐ（空の行を
   挟んでも）／閉じない行で表は終わり、後ろは素の行／「\|」は字／マスは本文の位置を持ち、押すとそのマスへ
   カーソル／本文は変えない。画面いっぱい：広い画面だけ「⋯」に出る・端末に覚える（記録には入れない）・電話の幅では出ない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-table.js */
const { open, checker } = require("./lib");

const BODY = [
  "前の段落",
  "",
  "| 名前 | 金額・",
  "目安 | 期間 |",
  "| --- | --- | --- |",
  "| りんご",
  "（赤） | 100 | 1年 |",
  "| みかん | ①200",
  "",
  "②300",
  "",
  " | 終身 |",
  "| a\\|b | **太** |  |",
  "あとの段落",
  "",
  "| ひとつ | ふたつ |",
  "| --- | --- |",
  "| 閉じない",
  "まま",
].join("\n");

(async () => {
  const t = checker("note-table");
  const { browser, page, errors } = await open({ viewport: { width: 1280, height: 900 } });
  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on" && KN.screens && KN.screens.notes, null, { timeout: 8000 });

  /* ---- 読み方（文字列と、離れた箱へ描く） ---- */
  const u = await page.evaluate((body) => {
    const F = KN.noteFormat;
    const tabs = [...F.tablesOf(body.split("\n")).entries()];
    const box = F.render(body, document.createElement("div"));
    const tbs = [...box.querySelectorAll(".nv-table")];
    const cells = tbs.map((tb) => [...tb.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => c.textContent)));
    const spans = [...box.querySelectorAll("td[data-at], th[data-at]")].map((c) => body.slice(+c.dataset.at, +c.dataset.end));
    return { heads: tabs.map(([h, x]) => [h, x.end, x.n]), cells, spans,
      after: [...box.children].map((e) => e.className + ":" + e.textContent.trim()).filter((s) => /段落|閉じない|まま/.test(s)),
      bold: !!box.querySelector(".nv-table strong.nv-b") };
  }, BODY);
  t.check("切れた行をつないで一つの表（頭の行・区切りの列の数）", JSON.stringify(u.heads.slice(0, 1)) === JSON.stringify([[2, 13, 3]]), JSON.stringify(u.heads));
  t.check("マスの中の改行・空の行はマスの中に残る", JSON.stringify(u.cells[0]) === JSON.stringify([
    ["名前", "金額・\n目安", "期間"], ["りんご\n（赤）", "100", "1年"], ["みかん", "①200\n\n②300", "終身"], ["a|b", "太", ""]]), JSON.stringify(u.cells[0]));
  t.check("マスの太字は太字のまま", u.bold);
  t.check("閉じない行で表は終わり、後ろは素の行", u.cells.length === 2 && u.cells[1].length === 1
    && u.after.some((s) => s.includes("閉じない")) && u.after.some((s) => s.includes("まま")) && u.after.some((s) => s.includes("あとの段落")), JSON.stringify(u));
  t.check("マスは本文の位置を持つ", u.spans.includes("①200\n\n②300") && u.spans.includes("りんご\n（赤）"), JSON.stringify(u.spans));

  /* ---- 紙で開く ---- */
  const id = await page.evaluate((body) => {
    const n = Object.assign(KN.notes.draft(), { notebook: "家", title: "表の試し", body });
    KN.notes.put(n);
    return n.id;
  }, BODY);
  const ls0 = await page.evaluate(() => localStorage.getItem("kaimono-note-v2"));
  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open .note-view .nv-table");
  await page.waitForTimeout(500);
  const look = await page.$eval(".sheet.is-note .nv-table", (el) => ({
    rows: el.querySelectorAll("tr").length, th: el.querySelectorAll("th").length,
    border: getComputedStyle(el.querySelector("td")).borderTopStyle, pre: getComputedStyle(el.querySelector("td")).whiteSpace }));
  t.check("紙では表の形（頭の行・枠・マスの中の改行）", look.rows === 4 && look.th === 3 && look.border === "solid" && look.pre === "pre-wrap", JSON.stringify(look));

  /* マスを押すと、そのマスへカーソル。 */
  const cell = page.locator(".sheet.is-note .nv-table td", { hasText: "100" });
  await cell.click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-text"));
  const caret = await page.$eval(".sheet.is-note .js-text", (e) => e.value.slice(e.selectionStart - 3, e.selectionStart + 3));
  t.check("マスを押すとそのマスへカーソル", /100|10|00/.test(caret), JSON.stringify(caret));
  await page.evaluate(() => document.querySelector(".sheet.is-note .js-text").blur());
  await page.waitForTimeout(300);

  /* ---- 画面いっぱい ---- */
  const width = () => page.$eval(".sheet.is-note", (s) => Math.round(s.getBoundingClientRect().width));
  const w0 = await width();
  const pick = async (label) => {
    await page.click(".sheet.is-note .js-note-more");
    const item = page.locator(".note-pop-item", { hasText: label });
    await item.waitFor({ timeout: 2000 });
    await item.click();
    await page.waitForTimeout(600);
  };
  await pick("画面いっぱい");
  const w1 = await width();
  const box = await page.$eval(".sheet.is-note", (s) => { const r = s.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(innerHeight - r.bottom) }; });
  /* 元の大きさは、広い画面（840px〜）では読む幅の一枚（docs/desk.md）。 */
  t.check("「画面いっぱい」で四方を空けた一枚に", w0 <= 760 && w0 < w1 && w1 === 1280 - 32 && box.t >= 16 && box.b >= 16, JSON.stringify({ w0, w1, box }));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });
  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(600);
  t.check("開き直しても画面いっぱいのまま（端末に覚える）", (await width()) === 1280 - 32);
  await pick("元の大きさ");
  t.check("「元の大きさ」で戻る", (await width()) === w0);
  t.check("記録には入れない（本文も変えない）", await page.evaluate((b) => localStorage.getItem("kaimono-note-v2") === b, ls0)
    && await page.evaluate((i) => KN.notes.get(i).body, id) === BODY);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.click(".sheet.is-note .js-note-more");
  await page.waitForSelector(".note-pop-item");
  t.check("電話の幅では出ない", !(await page.locator(".note-pop-item", { hasText: "画面いっぱい" }).count()));
  await page.keyboard.press("Escape");

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
