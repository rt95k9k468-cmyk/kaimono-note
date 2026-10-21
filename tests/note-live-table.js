/* ノートの見たままの表（docs/notes-unify.md「書き方：見たまま」の段B・js/note-live.js）。

   書くあいだも表は読む姿と同じ表（触れない塊）・行の高さが読む姿と同じ／マスを押すとその表だけ素の行に開き、
   押したマスの終わりへカーソル／打てば本文へ／カーソルが別の行へ出たら表に畳む（打って作った表も）／
   表のすぐ下の頭の ⌫ は表を開くだけ（行を表へつながない）・空の行なら消す／往復で一字も違わない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-live-table.js */
const { open, checker } = require("./lib");

const BODY = [
  "前の段落",
  "",
  "| 名前 | 金額・",
  "目安 | 期間 |",
  "| --- | --- | --- |",
  "| りんご",
  "（赤） | 100 | 1年 |",
  "| みかん | 200 | 終身 |",
  "あとの段落",
  "",
  "| ひとつ | ふたつ |",
  "| --- | --- |",
  "おわり",
].join("\n");

(async () => {
  const t = checker("note-live-table");
  const { browser, page, errors } = await open({ live: true });
  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on" && KN.screens && KN.screens.notes, null, { timeout: 8000 });

  t.check("表のあるノートも往復で一字も違わない", await page.evaluate((b) => KN.noteLive.fits(b) && KN.noteLive.fits(b + "\n| a |\n| --- |"), BODY));

  const id = await page.evaluate((body) => {
    const n = Object.assign(KN.notes.draft(), { notebook: "家", title: "表を書く", body });
    KN.notes.put(n);
    return n.id;
  }, BODY);
  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open .note-view.js-view:not([hidden]) .nv-table");
  await page.waitForTimeout(600);
  const L = ".sheet.is-note .js-live";
  const tops = (sel) => page.evaluate((s) => {
    const sc = document.querySelector(".sheet.is-note .sheet-body");
    const o = sc.getBoundingClientRect().top - sc.scrollTop;
    return [...document.querySelector(s).children].map((el) => Math.round(el.getBoundingClientRect().top - o));
  }, sel);
  const view0 = await tops(".sheet.is-note .js-view");

  const para = page.locator(".sheet.is-note .js-view .nv-p", { hasText: "前の段落" });
  const pb = await para.boundingBox();
  await page.mouse.click(pb.x + 20, pb.y + pb.height / 2);
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-live"));
  await page.waitForTimeout(200);
  const folded = () => page.$$eval(`${L} > .nv-table[contenteditable=false]`, (x) => x.length);
  const live0 = await tops(L);
  const off = live0.map((y, i) => y - (live0[0] - view0[0]) - view0[i]).filter((d) => Math.abs(d) > 1);
  t.check("書くあいだも表は表（触れない塊）・行の高さは読む姿と同じ", (await folded()) === 2 && live0.length === view0.length && !off.length,
    JSON.stringify({ n: await folded(), view0, live0 }));

  const md = () => page.$eval(".sheet.is-note .js-text", (e) => e.value);
  const focusText = () => page.evaluate(() => { const n = getSelection().focusNode; return n ? n.textContent : ""; });
  /* マスを押す → その表だけ行に開き、マスの終わりへ。 */
  await page.locator(`${L} .nv-table td`, { hasText: "100" }).click();
  await page.waitForTimeout(150);
  const opened = await page.evaluate((sel) => ({ rows: [...document.querySelector(sel).children].filter((el) => /^\s*\|/.test(el.textContent)).length }), L);
  const caret = await page.evaluate(() => { const s = getSelection(); return s.focusNode.textContent.slice(0, s.focusOffset); });
  t.check("マスを押すとその表だけ行に開き、マスの終わりへ", (await folded()) === 1 && opened.rows >= 4 && caret.endsWith("100"), JSON.stringify({ opened, caret }));
  await page.keyboard.type("0");
  t.check("開いた表に打った字は本文へ", (await md()).includes("（赤） | 1000 | 1年 |"));

  /* 別の行へ出たら畳む。 */
  const endOf = (text) => page.evaluate((x) => {
    const w = document.createTreeWalker(document.querySelector(".sheet.is-note .js-live"), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.data.includes(x)) { const at = n.data.indexOf(x) + x.length; getSelection().setBaseAndExtent(n, at, n, at); return true; }
    return false;
  }, text);
  const headOf = (text) => page.evaluate((x) => {
    const w = document.createTreeWalker(document.querySelector(".sheet.is-note .js-live"), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.data.startsWith(x)) { getSelection().setBaseAndExtent(n, 0, n, 0); return true; }
    return false;
  }, text);
  await endOf("あとの段落");
  await page.waitForTimeout(150);
  const back = await page.$eval(`${L} > .nv-table`, (el) => el.textContent);
  t.check("カーソルが表から出たら表に畳む（打った字のまま）", (await folded()) === 2 && back.includes("1000") && (await focusText()).includes("あとの段落"),
    JSON.stringify({ n: await folded(), back }));

  /* 表のすぐ下の頭で ⌫：表を開くだけ。 */
  await headOf("あとの段落");
  await page.waitForTimeout(100);
  const before = await md();
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(150);
  t.check("表のすぐ下の頭の ⌫ は表を開くだけ（行をつながない）", (await md()) === before && (await folded()) === 1 && (await focusText()).includes("終身 |"),
    JSON.stringify({ md: (await md()).slice(0, 200), focus: await focusText() }));

  /* 打って作った表も、出たら畳む。 */
  await endOf("おわり");
  for (const l of ["", "| x | y |", "| --- | --- |", "| 1 | 2 |"]) { await page.keyboard.press("Enter"); if (l) await page.keyboard.type(l); }
  await page.waitForTimeout(150);
  const typedRaw = await folded();
  await endOf("前の段落");
  await page.waitForTimeout(150);
  t.check("打って作った表も、出たら表に", typedRaw === 2 && (await folded()) === 3 && (await md()).endsWith("おわり\n\n| x | y |\n| --- | --- |\n| 1 | 2 |"),
    JSON.stringify({ typedRaw, n: await folded(), tail: (await md()).slice(-60) }));

  /* 空の行なら ⌫ で消す。 */
  const before2 = await md();
  await headOf("おわり");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const blank = await page.evaluate((sel) => {
    const el = [...document.querySelector(sel).children].find((x) => x.classList.contains("nv-blank") && x.previousSibling && x.previousSibling._table);
    if (!el) return false;
    const t = el.querySelector(".nv-t");
    getSelection().setBaseAndExtent(t, 0, t, 0);
    return true;
  }, L);
  await page.waitForTimeout(100);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(150);
  t.check("表のすぐ下の空の行は ⌫ で消え、表の終わりへ", blank && (await md()) === before2 && (await focusText()).includes("| --- | --- |"),
    JSON.stringify({ blank, focus: await focusText(), md: (await md()).slice(-90) }));

  const saved = await page.evaluate((i) => KN.notes.get(i).body, id);
  t.check("保存した本文は表の字のまま（「1000」）", saved.includes("| 1000 |") && saved.startsWith("前の段落\n\n| 名前 | 金額・\n目安 | 期間 |"), saved.slice(0, 120));
  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
