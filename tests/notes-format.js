/* ノートの段4「装飾（整った表示・道具の帯・チェック・箇条書きの続き）」。決めごとは docs/notes.md。

   印の読み方（js/note-format.js）／改行の続き（番号は一つ進む・チェックは空で続く・
   空の項目で終わる・段のある空の項目は一段上がる・印の途中では素の改行）／道具の帯で
   付け外し・付け替え・複数行／書く紙は全画面・頭の行に戻る ‹ と ⋯・左上にノートブック・
   右上にタグ／＋から来たら書く欄と帯、開いたノートは整えた姿（キーボードを出さない）／
   取り消す・やり直す／キーボードを閉じると整えた姿／四角を押してチェック（書く欄へ
   入らない）／押した行の終わりにカーソル／本文は印のまま入れ物へ／一覧の冒頭と題は印を
   外す／「⋯」はその場の小窓（★・前の版・削除。紙を重ねない）／カードの★は縦の真ん中／
   localStorage は変わらない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-format.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-format");
  const { browser, page, errors } = await open();

  const active = () => page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  const toNotes = async () => {
    if ((await active()) === "notes") return;
    if ((await active()) !== "archive") {
      await page.evaluate(() => KN.app.showScreen("archive"));
      await settled("archive");
    }
    await page.click('.tab[data-tab="archive"]');
    await settled("notes");
  };
  const closeSheet = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-note.is-open"), null, { timeout: 3000 });
  };
  const field = () => page.$eval(".sheet.is-note .js-text", (e) => ({ v: e.value, s: e.selectionStart, e: e.selectionEnd }));
  const tool = (k) => page.click(`.sheet.is-note .note-tool[data-k="${k}"]`);

  await page.evaluate(() => KN.notes.ready());
  const lsBefore = await page.evaluate(() => (localStorage.getItem("kaimono-note-v2") || "").length);

  /* ---- 印の読み方・書く手伝い（文字列だけ） ---- */
  const unit = await page.evaluate(() => {
    const F = KN.noteFormat;
    const kinds = ["# 題", "## 小", "- 点", "* 点", "1. 一", "- [ ] 未", "- [x] 済", "> 引", "---", "", "ふつう", "-ふつう", "  - 下"]
      .map((l) => F.parse(l).kind + (F.parse(l).level ? F.parse(l).level : ""));
    const enter = (v, s = v.length) => F.onEnter(v, s, s);
    const ap = (v, r) => (r ? v.slice(0, r.from) + r.text + v.slice(r.to) : null);
    return {
      kinds: kinds.join(","),
      bullet: ap("- 牛乳", enter("- 牛乳")),
      num: ap("3. 三", enter("3. 三")),
      task: ap("- [x] 済み", enter("- [x] 済み")),
      quote: ap("> 引く", enter("> 引く")),
      endList: ap("- 一\n- ", enter("- 一\n- ")),
      outdent: ap("- 一\n  - ", enter("- 一\n  - ")),
      para: enter("ふつうの行"),
      inMark: enter("- 牛乳", 1),
      head: ap("見出し", F.setKind("見出し", 2, 2, "head")),
      headOff: ap("# 見出し", F.setKind("# 見出し", 3, 3, "head")),
      swap: ap("- 牛乳", F.setKind("- 牛乳", 3, 3, "task")),
      many: ap("a\n\nb", F.setKind("a\n\nb", 0, 4, "num")),
      caret: F.setKind("牛乳", 2, 2, "task").s,
      tick: F.toggleTask("a\n- [ ] b", 2),
      untick: F.toggleTask("- [x] b", 0),
      rule: ap("上", F.rule("上", 1)),
      indent: ap("- a", F.shift("- a", 2, 2, 1)),
      plain: ["# 題", "- [x] 済", "1. 一", "---", "> 引"].map(F.plain).join("|"),
    };
  });
  t.check("行の形を読む", unit.kinds === "head1,head2,bullet,bullet,num,task,task,quote,rule,blank,para,para,bullet1", unit.kinds);
  t.check("箇条書きで改行 → 次の行も「- 」", unit.bullet === "- 牛乳\n- ", JSON.stringify(unit.bullet));
  t.check("番号は一つ進む", unit.num === "3. 三\n4. ", JSON.stringify(unit.num));
  t.check("済みのチェックの次は、空のチェック", unit.task === "- [x] 済み\n- [ ] ", JSON.stringify(unit.task));
  t.check("引用も続く", unit.quote === "> 引く\n> ", JSON.stringify(unit.quote));
  t.check("空の項目で改行 → 印が外れて終わる", unit.endList === "- 一\n", JSON.stringify(unit.endList));
  t.check("段のある空の項目は、まず一段上がる", unit.outdent === "- 一\n- ", JSON.stringify(unit.outdent));
  t.check("ふつうの行・印の途中では素の改行", unit.para === null && unit.inMark === null);
  t.check("見出しを付けて、もう一度で外す", unit.head === "# 見出し" && unit.headOff === "見出し", `${unit.head} / ${unit.headOff}`);
  t.check("箇条書き → チェックへ付け替え", unit.swap === "- [ ] 牛乳", unit.swap);
  t.check("複数行の番号は 1. 2.（空の行はそのまま）", unit.many === "1. a\n\n2. b", JSON.stringify(unit.many));
  t.check("付けたあと、カーソルは中身の同じ場所", unit.caret === 8, String(unit.caret));
  t.check("チェックの付け外し", unit.tick === "a\n- [x] b" && unit.untick === "- [ ] b");
  t.check("区切りは行の下に", unit.rule === "上\n---\n", JSON.stringify(unit.rule));
  t.check("一段下げる", unit.indent === "  - a", JSON.stringify(unit.indent));
  t.check("印を外した字（一覧・題）", unit.plain === "題|済|一||引", unit.plain);

  /* ---- ＋：全画面・書く欄と道具の帯 ---- */
  await toNotes();
  await page.click("#dock .add-fab");
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(700);
  const box = await page.$eval(".sheet.is-note", (e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top, h: r.height / innerHeight, w: r.width / innerWidth };
  });
  t.check("書く紙は全画面", box.top <= 1 && box.h >= 0.98 && box.w >= 0.99, JSON.stringify(box));
  const head = await page.$eval(".sheet.is-note .sheet-head", (h) => {
    const b = h.querySelector(".js-close");
    const m = h.querySelector(".js-note-more");
    return { back: b.querySelector("[data-ico]").dataset.ico, label: b.getAttribute("aria-label"),
      order: m && b.getBoundingClientRect().left < m.getBoundingClientRect().left };
  });
  t.check("頭の行：左に戻る ‹、右に ⋯", head.back === "chevron-left" && head.label === "戻る" && head.order, JSON.stringify(head));
  const meta = await page.$eval(".sheet.is-note", (s) => {
    const head = s.querySelector(".sheet-head").getBoundingClientRect();
    const back = s.querySelector(".js-close").getBoundingClientRect();
    const nb = s.querySelector(".sheet-head .js-nb").getBoundingClientRect();
    const title = s.querySelector(".note-title-in").getBoundingClientRect();
    const when = s.querySelector(".note-sub .note-when").getBoundingClientRect();
    const tg = s.querySelector(".note-sub .note-tag-add").getBoundingClientRect();
    return { nbNextToBack: nb.left >= back.right && nb.left - back.right < 24 && nb.top >= head.top && nb.bottom <= head.bottom + 1,
      tagWithDate: Math.abs((tg.top + tg.bottom) / 2 - (when.top + when.bottom) / 2) < 4 && tg.left > when.right,
      below: when.top >= title.bottom - 1, gap: Math.round(title.top - head.bottom) };
  });
  t.check("頭の行：‹ の隣にノートブック。題の下の一行に日時とタグ", meta.nbNextToBack && meta.tagWithDate && meta.below && meta.gap < 16, JSON.stringify(meta));
  const start = await page.evaluate(() => ({
    focus: document.activeElement && document.activeElement.classList.contains("note-body-in"),
    tools: getComputedStyle(document.querySelector(".sheet.is-note .note-tools")).display !== "none",
  }));
  t.check("＋から来たら本文にカーソル・道具の帯が出る", start.focus && start.tools, JSON.stringify(start));

  /* ---- 道具の帯と改行の続き ---- */
  await page.keyboard.insertText("買うもの");
  await tool("head");
  t.check("見出しを押すと「# 」", (await field()).v === "# 買うもの");
  t.check("押した印が光る", (await page.$eval('.note-tool[data-k="head"]', (b) => b.getAttribute("aria-pressed"))) === "true");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("牛乳");
  await tool("task");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("卵");
  await page.keyboard.press("Enter");
  let f = await field();
  t.check("チェックの行で改行 → 次もチェック", f.v === "# 買うもの\n- [ ] 牛乳\n- [ ] 卵\n- [ ] ", JSON.stringify(f.v));
  t.check("帯を押してもカーソルは本文のまま", await page.evaluate(() => document.activeElement.classList.contains("note-body-in")));
  await page.keyboard.press("Enter");
  f = await field();
  t.check("空のチェックで改行 → 印が外れる", f.v === "# 買うもの\n- [ ] 牛乳\n- [ ] 卵\n", JSON.stringify(f.v));
  await tool("rule");
  await page.keyboard.insertText("おわり");
  f = await field();
  t.check("区切り", f.v.endsWith("\n---\nおわり"), JSON.stringify(f.v));

  /* 取り消す・やり直す */
  await tool("undo");
  const u1 = (await field()).v;
  t.check("取り消す（打った字）", u1.endsWith("\n---\n") && !u1.includes("おわり"), JSON.stringify(u1));
  await tool("undo");
  const u2 = (await field()).v;
  t.check("もう一度取り消す（区切り）", !u2.includes("---"), JSON.stringify(u2));
  await tool("redo");
  t.check("やり直す", (await field()).v.endsWith("\n---\n"));
  await page.keyboard.insertText("おわり");

  /* ---- 道具の帯：ぜんぶが一列に見える・閉じる口は無い・紙の底に貼りつく ---- */
  const bar = await page.$eval(".sheet.is-note", (s) => {
    const tb = s.querySelector(".note-tools").getBoundingClientRect();
    const bs = [...s.querySelectorAll(".note-tool")].map((b) => b.getBoundingClientRect());
    return { n: bs.length, inside: bs.every((r) => r.left >= tb.left - 0.5 && r.right <= tb.right + 0.5),
      oneRow: bs.every((r) => Math.abs(r.top - bs[0].top) < 1), done: !!s.querySelector('[data-k="done"]'),
      gap: Math.round(s.getBoundingClientRect().bottom - tb.bottom),
      side: Math.round(tb.left - s.getBoundingClientRect().left),
      round: parseFloat(getComputedStyle(s.querySelector(".note-tools")).borderTopLeftRadius) >= tb.height / 2 - 1,
      glass: getComputedStyle(s.querySelector(".note-tools")).backdropFilter.includes("blur"),
      over: getComputedStyle(s.querySelector(".note-tools")).position === "absolute" };
  });
  t.check("道具の帯はぜんぶ一列に見え、閉じる口は無い", bar.n === 10 && bar.inside && bar.oneRow && !bar.done, JSON.stringify(bar));
  t.check("道具の帯は底から少し浮く、丸いガラスの一本", bar.gap === 8 && bar.side === 8 && bar.round && bar.glass && bar.over, JSON.stringify(bar));
  t.check("開いているあいだ、ページの地も紙の白（上の帯の色）", await page.evaluate(() =>
    document.documentElement.classList.contains("is-note-full") && getComputedStyle(document.body).backgroundColor === "rgb(255, 255, 255)"));
  t.check("開いているあいだ、上の帯（theme-color）は紙の白", (await page.$$eval('meta[name="theme-color"]', (ms) => ms.map((m) => m.content))).every((c) => c === "#ffffff"));

  /* ---- 欄から出る（キーボードを閉じる）→ 整えた姿 ---- */
  await page.evaluate(() => document.querySelector(".sheet.is-note .js-text").blur());
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note .note-view").hidden);
  const view = await page.$eval(".sheet.is-note", (s) => ({
    h: s.querySelectorAll(".note-view .nv-h1").length,
    tasks: s.querySelectorAll(".note-view .nv-li.is-task").length,
    hr: s.querySelectorAll(".note-view .nv-hr").length,
    text: s.querySelector(".note-view").textContent,
    tools: getComputedStyle(s.querySelector(".note-tools")).display,
    area: s.querySelector(".js-text").hidden,
  }));
  t.check("整えた姿：見出し・チェック2つ・区切り", view.h === 1 && view.tasks === 2 && view.hr === 1, JSON.stringify(view));
  t.check("整えた姿に印の字は出ない", !/[#\[\]]|---|- /.test(view.text), view.text);
  t.check("読むあいだは帯も書く欄も隠れる", view.tools === "none" && view.area, JSON.stringify(view));

  /* 四角を押す → チェック（書く欄へは入らない） */
  await page.click(".sheet.is-note .nv-li.is-task .nv-box");
  await page.waitForTimeout(100);
  const ticked = await page.evaluate(() => ({
    v: document.querySelector(".sheet.is-note .js-text").value,
    done: document.querySelectorAll(".sheet.is-note .nv-li.is-done").length,
    writing: !document.querySelector(".sheet.is-note .js-text").hidden,
  }));
  t.check("四角を押すとチェック（本文は「- [x] 」）", ticked.v.includes("- [x] 牛乳") && ticked.done === 1 && !ticked.writing, JSON.stringify(ticked));

  /* 行を押す → その行の終わりにカーソル */
  await page.click(".sheet.is-note .nv-li.is-task:nth-of-type(3) .nv-t");
  f = await field();
  const egg = f.v.indexOf("卵") + 1;
  t.check("押した行の終わりにカーソル", f.s === egg && await page.evaluate(() => document.activeElement.classList.contains("note-body-in")), `${f.s} / ${egg}`);

  const id = await page.evaluate(() => KN.notes.list()[0].id);
  await closeSheet();
  const stored = await page.evaluate((i) => KN.notes.get(i), id);
  t.check("本文は印のまま入れ物へ", stored.body === "# 買うもの\n- [x] 牛乳\n- [ ] 卵\n---\nおわり", JSON.stringify(stored.body));

  /* ---- 一覧：題と冒頭は印を外す・★は縦の真ん中 ---- */
  const card = await page.$eval(`#screen-notes .note-row[data-id="${id}"]`, (r) => {
    const c = r.getBoundingClientRect();
    const s = r.querySelector(".fav").getBoundingClientRect();
    return { t: r.querySelector(".note-t").textContent, x: r.querySelector(".note-x").textContent,
      mid: Math.abs((s.top + s.bottom) / 2 - (c.top + c.bottom) / 2) };
  });
  t.check("一覧の題と冒頭は印を外す", card.t === "買うもの" && !/[#\[\]]|---/.test(card.x) && card.x.startsWith("牛乳"), JSON.stringify(card));
  t.check("カードの★は縦の真ん中", card.mid <= 3, String(card.mid));

  /* ---- 開いたノートは整えた姿・「⋯」はその場の小窓 ---- */
  await page.click(`#screen-notes .note-row[data-id="${id}"] .js-open`);
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() => ({
    view: !document.querySelector(".sheet.is-note .note-view").hidden,
    /* キーボードを出すのは字の欄だけ（パソコンでは紙が ⋯ に印を置くが、それは出さない）。 */
    focus: !!(document.activeElement && document.activeElement.closest(".sheet") && document.activeElement.matches("input, textarea")),
  }));
  t.check("開いたノートは整えた姿（キーボードを出さない）", opened.view && !opened.focus, JSON.stringify(opened));
  await page.click(".sheet.is-note .js-note-more");
  await page.waitForSelector(".note-pop.is-open");
  const pop = await page.evaluate(() => {
    const b = document.querySelector(".sheet.is-note .js-note-more").getBoundingClientRect();
    const p = document.querySelector(".note-pop").getBoundingClientRect();
    return { near: p.top >= b.bottom - 1 && p.top - b.bottom < 24 && Math.abs(p.right - b.right) < 24,
      sheets: document.querySelectorAll(".sheet.is-open").length,
      items: [...document.querySelectorAll(".note-pop-item")].map((x) => x.textContent.trim()).join(",") };
  });
  t.check("「⋯」は押したところの小窓（紙を重ねない）", pop.near && pop.sheets === 1 && pop.items === "★を付ける,前の版,削除", JSON.stringify(pop));
  await page.click(".note-pop-item:first-child");
  await page.waitForTimeout(200);
  t.check("小窓から★", (await page.evaluate((i) => KN.notes.get(i).fav, id)) && !(await page.$(".note-pop")));
  await closeSheet();

  /* ---- 短いノート：キーボードで見える高さが縮んでも、題は飛ばない（段4.2のあと） ----
     本文の欄は短くても 38vh ある。欄の底を「最後の行」と読んで見せようとすると、
     空いたところを押しただけで題ごと上へ送っていた（2026年10月1日、iPhone）。 */
  await page.click("#dock .add-fab");
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.keyboard.insertText("短い本文");
  await page.fill(".sheet.is-note .js-title", "短い題");
  await page.waitForTimeout(200);
  await closeSheet();
  const shortId = await page.evaluate(() => (KN.notes.list().find((n) => n.title === "短い題") || {}).id);
  await page.click(`#screen-notes .note-row[data-id="${shortId}"] .js-open`);
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(500);
  const blankAt = await page.$eval(".sheet.is-note .js-view", (v) => {
    const r = v.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom - 20 };
  });
  await page.mouse.click(blankAt.x, blankAt.y);
  /* キーボードが出て、見えている高さが縮んだ（iOS 26 のホーム画面アプリ：可視は
     縮み、fixed の床は底に残る）。アプリ自身の測り方（app.js の trackKeyboard）に
     通すため、visualViewport の高さを差し替えて resize を送る。 */
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 464 });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(800);
  const shortJump = async () => page.$eval(".sheet.is-note", (s) => ({
    top: s.querySelector(".sheet-body").scrollTop,
    writing: document.activeElement === s.querySelector(".js-text"),
    folded: s.classList.contains("is-folded"),
    vvh: document.documentElement.style.getPropertyValue("--vvh"),
  }));
  const sj1 = await shortJump();
  t.check("短い本文の空いたところを押しても、題は上へ飛ばない（見える高さが縮んでも）",
    sj1.writing && sj1.top < 4 && !sj1.folded && sj1.vvh === "464px", JSON.stringify(sj1));
  await page.keyboard.insertText("続き");
  await page.waitForTimeout(300);
  const sj2 = await shortJump();
  t.check("短い本文の最後の行で打っても、題は上へ飛ばない",
    sj2.writing && sj2.top < 4 && !sj2.folded && sj2.vvh === "464px", JSON.stringify(sj2));
  await page.evaluate(() => {
    delete visualViewport.height;
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await closeSheet();

  /* ---- 長いノート：押して書き始めても題は飛ばない・下へ送ると頭に題（段4.2） ---- */
  await page.click("#dock .add-fab");
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.keyboard.insertText(Array.from({ length: 60 }, (_, i) => `行${i + 1}`).join("\n"));
  await page.fill(".sheet.is-note .js-title", "長い題");
  await page.waitForTimeout(200);
  await closeSheet();
  const longId = await page.evaluate(() => (KN.notes.list().find((n) => n.title === "長い題") || {}).id);
  t.check("長いノートが残る", !!longId, await page.evaluate(() => JSON.stringify(KN.notes.list().map((n) => n.title))));
  await page.click(`#screen-notes .note-row[data-id="${longId}"] .js-open`);
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(500);
  await page.click(".sheet.is-note .note-view > :nth-child(2)");
  await page.waitForTimeout(800);
  const jump = await page.$eval(".sheet.is-note", (s) => ({
    top: s.querySelector(".sheet-body").scrollTop,
    writing: document.activeElement === s.querySelector(".js-text"),
    folded: s.classList.contains("is-folded"),
  }));
  t.check("長い本文の行を押しても、題は上へ飛ばない", jump.writing && jump.top < 4 && !jump.folded, JSON.stringify(jump));
  await page.$eval(".sheet.is-note .sheet-body", (sc) => { sc.scrollTop = sc.scrollHeight; });
  await page.waitForTimeout(300);
  const folded = await page.$eval(".sheet.is-note", (s) => {
    const ht = s.querySelector(".note-head-t");
    const head = s.querySelector(".sheet-head").getBoundingClientRect();
    const nb = s.querySelector(".sheet-head .js-nb").getBoundingClientRect();
    return { on: s.classList.contains("is-folded"), text: ht.textContent, shown: getComputedStyle(ht).display !== "none",
      inHead: nb.bottom <= head.bottom + 1 };
  });
  t.check("下へ送ると、頭の行に題が小さく（ノートブックはその下）", folded.on && folded.text === "長い題" && folded.shown && folded.inHead, JSON.stringify(folded));
  /* 長い本文の最後の行で打つと、その行は帯の上へ（followEnd）。 */
  await page.$eval(".sheet.is-note", (s) => {
    s.querySelector(".sheet-body").scrollTop = 0;
    const ta = s.querySelector(".js-text");
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  await page.keyboard.insertText("末");
  await page.waitForTimeout(300);
  const endLine = await page.$eval(".sheet.is-note", (s) => {
    const ta = s.querySelector(".js-text").getBoundingClientRect();
    const bar = s.querySelector(".note-tools").getBoundingClientRect();
    return { bottom: Math.round(ta.bottom), barTop: Math.round(bar.top), top: s.querySelector(".sheet-body").scrollTop };
  });
  t.check("長い本文の最後の行で打つと、その行は帯の上に見える",
    endLine.top > 0 && endLine.bottom <= endLine.barTop && endLine.bottom > endLine.barTop - 80, JSON.stringify(endLine));
  await closeSheet();
  t.check("閉じたらページの地は元へ", await page.evaluate(() => !document.documentElement.classList.contains("is-note-full")));

  t.check("localStorage は変わらない", (await page.evaluate(() => (localStorage.getItem("kaimono-note-v2") || "").length)) === lsBefore);
  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
