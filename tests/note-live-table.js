/* ノートの見たままの表（docs/notes-unify.md「書き方：見たまま」の段B・段5・js/note-live.js）。

   書くあいだも表は読む姿と同じ表・行の高さが読む姿と同じ／マスを押すとそのマスに直に打てる（表は表のまま）／
   打てば本文へ・変換中も表のまま／マスの中の改行・「|」は表を崩さない／Tab で次のマス／取り消す／
   マスの中では行の形の道具が効かない／表のすぐ下の頭の ⌫ は表の終わりのマスへ・空の行なら消す／
   打って作った表は改行で表に／往復で一字も違わない／字の多い列は細く潰さない。

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
  const inCell = () => page.evaluate(() => { const a = document.activeElement; return !!(a && a.classList.contains("lv-cell")); });
  const writing = () => page.evaluate(() => !document.querySelector(".sheet.is-note .js-live").hidden);
  const tool = (k) => page.$eval(`.sheet.is-note .js-tool[data-k="${k}"]`, (b) => b.getAttribute("aria-disabled") === "true");

  /* マスを押す → そのマスに直に打てる（表は表のまま）。 */
  await page.locator(`${L} .nv-table td`, { hasText: "100" }).locator(".lv-cell").click();
  await page.waitForTimeout(150);
  t.check("マスを押すとそのマスの中へ（表は畳んだまま・書くまま）", (await folded()) === 2 && (await inCell()) && (await writing()),
    JSON.stringify({ n: await folded(), cell: await inCell() }));
  await page.keyboard.press("End");
  await page.keyboard.type("0");
  await page.waitForTimeout(100);
  t.check("マスに打った字は本文へ", (await md()).includes("（赤） | 1000 | 1年 |") && (await folded()) === 2, (await md()).slice(0, 160));
  t.check("マスの中では行の形の道具は効かない（太字は効く）", (await tool("head")) && (await tool("bullet")) && !(await tool("bold")));

  /* 変換中も表のまま、決めたらマスへ。 */
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "え", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.imeSetComposition", { text: "えん", selectionStart: 2, selectionEnd: 2 });
  const midN = await folded();
  await cdp.send("Input.insertText", { text: "円" });
  await page.waitForTimeout(100);
  t.check("変換して決めた字もマスへ（表は崩れない）", midN === 2 && (await folded()) === 2 && (await md()).includes("（赤） | 1000円 | 1年 |"), (await md()).slice(0, 160));

  /* マスの中の改行・「|」。 */
  await page.locator(`${L} .nv-table td`, { hasText: "みかん" }).locator(".lv-cell").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("小|大");
  await page.waitForTimeout(100);
  const cellNow = await page.evaluate(() => document.activeElement.textContent);
  t.check("マスの中の改行・「|」は表を崩さない（本文は改行と「\\|」）", (await folded()) === 2 && (await inCell()) && cellNow === "みかん\n小|大"
    && (await md()).includes("| みかん\n小\\|大 | 200 | 終身 |"), JSON.stringify({ cellNow, md: (await md()).slice(0, 200) }));

  /* Tab で次のマス。 */
  await page.keyboard.press("Tab");
  await page.waitForTimeout(1100);
  await page.keyboard.type("+");
  await page.waitForTimeout(100);
  t.check("Tab で次のマスへ", (await md()).includes("小\\|大 | 200+ | 終身 |"), (await md()).slice(0, 200));

  /* 取り消す（⌘Z）。 */
  const ctl = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${ctl}+z`);
  await page.waitForTimeout(150);
  t.check("マスで打ったものも取り消せる", (await md()).includes("小\\|大 | 200 | 終身 |") && (await folded()) === 2, (await md()).slice(0, 200));

  const endOf = (text) => page.evaluate((x) => {
    const live = document.querySelector(".sheet.is-note .js-live");
    const w = document.createTreeWalker(live, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (!n.parentNode.closest(".nv-table") && n.data.includes(x)) { live.focus(); const at = n.data.indexOf(x) + x.length; getSelection().setBaseAndExtent(n, at, n, at); return true; }
    return false;
  }, text);
  const headOf = (text) => page.evaluate((x) => {
    const live = document.querySelector(".sheet.is-note .js-live");
    const w = document.createTreeWalker(live, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (!n.parentNode.closest(".nv-table") && n.data.startsWith(x)) { live.focus(); getSelection().setBaseAndExtent(n, 0, n, 0); return true; }
    return false;
  }, text);
  await endOf("あとの段落");
  await page.waitForTimeout(150);
  t.check("マスから出たら道具が戻る・書くまま", !(await tool("head")) && (await writing()) && !(await inCell()));

  /* 表のすぐ下の頭で ⌫：表の終わりのマスへ（行をつながない）。 */
  await headOf("あとの段落");
  await page.waitForTimeout(100);
  const before = await md();
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(150);
  t.check("表のすぐ下の頭の ⌫ は表の終わりのマスへ（行をつながない）", (await md()) === before && (await folded()) === 2 && (await inCell()) && (await focusText()) === "終身",
    JSON.stringify({ md: (await md()).slice(0, 200), focus: await focusText() }));

  /* 打って作った表は、改行で表に（その下の行も改行で表へ）。 */
  await endOf("おわり");
  for (const l of ["", "| x | y |", "| --- | --- |", "| 1 | 2 |"]) { await page.keyboard.press("Enter"); if (l) await page.keyboard.type(l); }
  await page.keyboard.press("Enter");
  await page.waitForFunction((s) => document.querySelectorAll(`${s} > .nv-table`).length === 3, L, { timeout: 3000 }).catch(() => {});
  const tail = await page.$$eval(`${L} > .nv-table`, (x) => x[x.length - 1].querySelectorAll("tr").length).catch(() => 0);
  t.check("打って作った表も表に（行も足せる）", (await folded()) === 3 && tail === 2 && (await md()).endsWith("おわり\n\n| x | y |\n| --- | --- |\n| 1 | 2 |\n"),
    JSON.stringify({ n: await folded(), tail, md: (await md()).slice(-60) }));

  /* 空の行なら ⌫ で消す。 */
  const before2 = await md();
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(150);
  t.check("表のすぐ下の空の行は ⌫ で消え、表の終わりのマスへ", (await md()) === before2.slice(0, -1) && (await inCell()) && (await focusText()) === "2",
    JSON.stringify({ focus: await focusText(), md: (await md()).slice(-40) }));

  t.check("字の多い列は細く潰さない（数の列は詰めたまま）", await page.evaluate(() => {
    const F = KN.noteFormat;
    const el = F.tableEl(F.tablesOf(["| 契約 | 額 |", "| --- | --- |", "| 終身保険（有配当2012） | 3,632 |"]).get(0));
    const td = el.querySelectorAll("tr")[1].children;
    return td[0].style.getPropertyValue("--cw") === "7em" && !td[1].style.getPropertyValue("--cw");
  }));

  const saved = await page.evaluate((i) => KN.notes.get(i).body, id);
  t.check("保存した本文は表の字のまま（「1000円」）", saved.includes("| 1000円 |") && saved.startsWith("前の段落\n\n| 名前 | 金額・\n目安 | 期間 |"), saved.slice(0, 120));
  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
