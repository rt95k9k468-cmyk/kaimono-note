/* ノートの見たまま（docs/notes-unify.md「書き方：見たまま」の段A・js/note-live.js）。

   往復で一字も違わない（取り込みで来る表・コード・HTML・\r も）／行をまたぐ手（改行の続き・太字の中で切る・
   見出しの頭・⌫で印を外す・つなぐ・画像を消す・Delete）／読む姿と書く姿で行の高さが揃う（閉じても同じ姿）／
   打つ・行頭の「# 」「- 」「1. 」「[] 」「> 」「---」で形が変わる・「**…**」で太字、そのあとは細い／道具の帯・
   取り消す・貼り付け・四角／変換中は行の要素を作り直さない・確定の改行で行が増えない／往復しないノートと
   「印で書く」端末は今の書く欄／パソコンの Tab・Ctrl+B。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-live.js */
const { open, checker } = require("./lib");

const IMG = "![](img:0123456789abcdef)";
const BODY = [
  "# 大きな見出し",
  "ふつうの段落。**太字**と[リンク](https://example.com)。",
  "",
  "## 小さな見出し",
  "- 点",
  "  - 下の点",
  "1. 一つめ",
  "2. 二つめ",
  "- [ ] まだ",
  "- [x] 済み",
  "> 引用の行",
  "---",
  "？問いの行",
  "おわり",
].join("\n");

(async () => {
  const t = checker("note-live");
  const { browser, page, errors } = await open({ live: true });
  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on" && KN.screens && KN.screens.notes, null, { timeout: 8000 });

  /* ---- 往復（並べて戻すと一字も違わない） ---- */
  const rt = await page.evaluate(([body, img]) => {
    const S = [body, "", "\n", "a\n\n\nb\n", "  字下げ\n\t字", "末尾の空白  ", "****", "***a***", "**a**b**", "2 ** 3 ** 4",
      "[](https://x.jp)", "![絵](https://x.jp/a.png)", "[字](note:abc)と**[太](https://x.jp)**", "<b>html</b>", "```\ncode\n```",
      "| a | b |\n| --- | --- |\n| 1 | 2 |", "*斜め*", "行\r\n次\r\n", "#### 四つ", " - 一つの空白", "- [ ]", "- [X] 大文字",
      ">", "> ", "1.", "10. 十", `${img}\n[a.jpg](file:${"a".repeat(64)}.jpg)`, `[書類](file:${"b".repeat(64)}.pdf)`,
      "​ゼロ幅", "* * *", "- **太字の点**"];
    return S.filter((s) => !KN.noteLive.fits(s));
  }, [BODY, IMG]);
  t.check("並べて戻すと一字も違わない（表・コード・HTML・\\r・画像も）", !rt.length, JSON.stringify(rt));

  /* ---- 行をまたぐ手（字だけ） ---- */
  const ops = await page.evaluate((img) => {
    const L = KN.noteLive;
    const ap = (v, r) => (r ? [v.slice(0, r.from) + r.text + v.slice(r.to), r.s] : null);
    const at = (v, mark) => v.indexOf(mark);
    return {
      bullet: ap("- 牛乳", L.enter("- 牛乳", 4, 4)),
      endList: ap("- 一\n- ", L.enter("- 一\n- ", 6, 6)),
      bold: ap("**太字**", L.enter("**太字**", 3, 3)),
      head: ap("# 見出し", L.enter("# 見出し", 2, 2)),
      link: ap("[リンク](https://a.jp)後", L.enter("[リンク](https://a.jp)後", 2, 2)),
      sel: ap("ab\ncd", L.enter("ab\ncd", 1, 4)),
      backList: ap("- 一", L.back("- 一", 2)),
      backDeep: ap("  - 一", L.back("  - 一", 4)),
      backHead: ap("## 二", L.back("## 二", 3)),
      backJoin: ap("a\nb", L.back("a\nb", 2)),
      backImg: ap(`${img}\nb`, L.back(`${img}\nb`, img.length + 1)),
      backMid: L.back("ab", 1),
      fwJoin: ap("a\n- b", L.forward("a\n- b", 1)),
      fwBlank: ap("\n# 題", L.forward("\n# 題", 0)),
      fwRule: ap("a\n---\nb", L.forward("a\n---\nb", 1)),
      fwMid: L.forward("ab", 1),
      at: at("x", "x"),
    };
  }, IMG);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  t.check("改行：箇条は続く・空の項目で終わる", eq(ops.bullet, ["- 牛乳\n- ", 7]) && eq(ops.endList, ["- 一\n", 4]), JSON.stringify([ops.bullet, ops.endList]));
  t.check("改行：太字の中で切ると両方太字・リンクの中ならリンクの後ろ", eq(ops.bold, ["**太**\n**字**", 8]) && eq(ops.link, ["[リンク](https://a.jp)\n後", 20]), JSON.stringify([ops.bold, ops.link]));
  t.check("改行：見出しの頭なら上に空の行・選んだ字は消える", eq(ops.head, ["\n# 見出し", 3]) && eq(ops.sel, ["a\nd", 2]), JSON.stringify([ops.head, ops.sel]));
  t.check("⌫：印を外す・段は一段上げる・見出しも", eq(ops.backList, ["一", 0]) && eq(ops.backDeep, ["- 一", 2]) && eq(ops.backHead, ["二", 0]), JSON.stringify([ops.backList, ops.backDeep, ops.backHead]));
  t.check("⌫：上の行とつなぐ・上の画像は消す・行の途中はブラウザ", eq(ops.backJoin, ["ab", 1]) && eq(ops.backImg, ["b", 0]) && ops.backMid === null, JSON.stringify([ops.backJoin, ops.backImg, ops.backMid]));
  t.check("Delete：下の行の中身をつなぐ・空の行は自分が消える・線は消す", eq(ops.fwJoin, ["ab", 1]) && eq(ops.fwBlank, ["# 題", 2]) && eq(ops.fwRule, ["a\nb", 1]) && ops.fwMid === null,
    JSON.stringify([ops.fwJoin, ops.fwBlank, ops.fwRule, ops.fwMid]));

  /* ---- 紙で開く ---- */
  const id = await page.evaluate((body) => {
    const n = Object.assign(KN.notes.draft(), { notebook: "家", title: "見たまま", body });
    KN.notes.put(n);
    return n.id;
  }, BODY);
  const ls0 = await page.evaluate(() => localStorage.getItem("kaimono-note-v2"));
  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open .note-view.js-view:not([hidden]) .nv-h1");
  await page.waitForTimeout(600);

  /* 行の高さ（紙の本体の上端から）。読む姿と書く姿で揃う＝閉じても同じ姿。 */
  const tops = (sel) => page.evaluate((s) => {
    const box = document.querySelector(s);
    const sc = document.querySelector(".sheet.is-note .sheet-body");
    const o = sc.getBoundingClientRect().top - sc.scrollTop;
    return [...box.children].filter((el) => el.className !== "nv-orig").map((el) => Math.round(el.getBoundingClientRect().top - o));
  }, sel);
  const view0 = await tops(".sheet.is-note .js-view");
  /* 字の始まり（行ごと。中身の無い行・線は数えない）。 */
  const leftsOf = (sel) => page.evaluate((s) => [...document.querySelector(s).children].filter((el) => el.className !== "nv-orig").map((el) => {
    const x = el.querySelector(".nv-t");
    return x && el.textContent.trim() ? Math.round(x.getBoundingClientRect().left) : null;
  }), sel);
  const viewL = await leftsOf(".sheet.is-note .js-view");

  /* 段落の「段落。」の字を押す。 */
  const para = page.locator(".sheet.is-note .js-view .nv-p", { hasText: "ふつうの段落" });
  const pb = await para.boundingBox();
  await page.mouse.click(pb.x + 30, pb.y + pb.height / 2);
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-live"));
  const state = await page.evaluate(() => ({
    live: !document.querySelector(".sheet.is-note .js-live").hidden,
    text: document.querySelector(".sheet.is-note .js-text").hidden,
    view: document.querySelector(".sheet.is-note .js-view").hidden,
    tools: !!document.querySelector(".sheet.is-note.is-writing"),
    lines: document.querySelector(".sheet.is-note .js-live").children.length,
  }));
  t.check("押すと見たままの欄へ（印の欄・読む姿は隠れる・帯が出る）", state.live && state.text && state.view && state.tools && state.lines === BODY.split("\n").length, JSON.stringify(state));
  const live0 = await tops(".sheet.is-note .js-live");
  const liveL = await leftsOf(".sheet.is-note .js-live");
  const shift = live0[0] - view0[0];
  const off = live0.map((y, i) => y - shift - view0[i]).filter((d) => Math.abs(d) > 1);
  t.check("書く姿は読む姿と行の高さが同じ", live0.length === view0.length && !off.length, JSON.stringify({ view0, live0 }));
  t.check("字の始まり（印のあと）も同じ", eq(viewL, liveL), JSON.stringify({ viewL, liveL }));
  const looks = await page.evaluate(() => {
    const L = document.querySelector(".sheet.is-note .js-live");
    const cs = (el, p) => getComputedStyle(el, p);
    const li = L.querySelector(".nv-li.is-bullet");
    const box = L.querySelector(".nv-li.is-task");
    const done = L.querySelector(".nv-li.is-done");
    return {
      h1: parseFloat(cs(L.querySelector(".nv-h1")).fontSize) / parseFloat(cs(L.querySelector(".nv-p")).fontSize), bold: cs(L.querySelector("strong.nv-b")).fontWeight,
      link: cs(L.querySelector("a.nv-link")).textDecorationLine, dot: cs(li, "::before").content,
      num: cs(L.querySelector(".nv-li.is-num"), "::before").content, box: cs(box, "::before").borderTopWidth,
      check: cs(done, "::after").maskImage || cs(done, "::after").webkitMaskImage, strike: cs(done.querySelector(".nv-t")).textDecorationLine,
      hr: !!L.querySelector(".nv-hr[contenteditable=false] hr"), ask: L.querySelector(".is-ask") != null,
      marks: L.textContent.includes("**") || L.textContent.includes("](") || L.textContent.includes("# "),
    };
  });
  t.check("見出し・太字・リンク・点・番号・四角・済み・線・問いが整った姿", looks.h1 > 1.4 && looks.bold === "700" && looks.link.includes("underline")
    && looks.dot.includes("•") && looks.num.includes("1.") && looks.box === "2px" && /url/.test(looks.check) && looks.strike.includes("line-through")
    && looks.hr && looks.ask && !looks.marks, JSON.stringify(looks));
  const caret0 = await page.evaluate(() => getSelection().focusNode.textContent);
  t.check("押した字にカーソル", caret0.includes("ふつうの段落"), caret0);

  /* ---- 打つ ---- */
  const md = () => page.$eval(".sheet.is-note .js-text", (e) => e.value);
  const lastLine = async () => (await md()).split("\n").pop();
  const endOf = async (text) => {
    await page.evaluate((x) => {
      const L = document.querySelector(".sheet.is-note .js-live");
      const w = document.createTreeWalker(L, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) if (n.data.includes(x)) { const at = n.data.indexOf(x) + x.length; getSelection().setBaseAndExtent(n, at, n, at); return; }
    }, text);
    await page.waitForTimeout(50);
  };
  await endOf("おわり");
  await page.keyboard.type("です");
  t.check("打った字は本文へ（印の形のまま）", (await md()).endsWith("おわりです") && (await page.evaluate((i) => KN.notes.get(i).body, id)).endsWith("おわりです"));
  const kinds = [];
  const lineKind = () => page.evaluate(() => {
    const n = getSelection().focusNode;
    const el = (n.nodeType === 3 ? n.parentNode : n).closest(".js-live > *");
    return el ? el.className : null;
  });
  await page.keyboard.press("Enter");
  await page.keyboard.type("# ");
  kinds.push(await lineKind());
  await page.keyboard.type("新しい見出し");
  const h = await lastLine();
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  kinds.push(await lineKind());
  await page.keyboard.type("牛乳");
  await page.keyboard.press("Enter");
  const cont = await lastLine();
  await page.keyboard.press("Enter");
  const ended = await lastLine();
  await page.keyboard.type("[] ");
  kinds.push(await lineKind());
  const task = await lastLine();
  await page.keyboard.type("やる");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. ");
  kinds.push(await lineKind());
  await page.keyboard.type("一");
  await page.keyboard.press("Enter");
  const num = await lastLine();
  await page.keyboard.press("Enter");
  await page.keyboard.type("> ");
  kinds.push(await lineKind());
  await page.keyboard.type("引く");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("---");
  const afterRule = await page.evaluate(() => {
    const n = getSelection().focusNode;
    const el = (n.nodeType === 3 ? n.parentNode : n).closest(".js-live > *");
    return { cls: el && el.className, prev: el && el.previousElementSibling && el.previousElementSibling.className };
  });
  t.check("行頭の「# 」「- 」「[] 」「1. 」「> 」でその形に",
    eq(kinds, ["nv-h nv-h1", "nv-li is-bullet", "nv-li is-task", "nv-li is-num", "nv-q"]) && h === "# 新しい見出し" && task === "- [ ] ", JSON.stringify({ kinds, h, task }));
  t.check("改行の続き（箇条は続く・空で終わる・番号は進む）", cont === "- " && ended === "" && num === "2. ", JSON.stringify({ cont, ended, num }));
  t.check("「---」で線になり、下の空の行で続けて打てる", afterRule.cls === "nv-blank" && afterRule.prev === "nv-hr" && (await md()).endsWith("> 引く\n---\n"), JSON.stringify(afterRule));
  await page.keyboard.type("**太**");
  const strong = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-note .js-live strong")].map((s) => s.textContent));
  await page.keyboard.type("細");
  t.check("「**…**」で太字、続けて打つ字は細い", strong.includes("太") && (await lastLine()) === "**太**細", JSON.stringify({ strong, last: await lastLine() }));

  /* ---- ⌫・取り消す ---- */
  await endOf("新しい見出し");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  const unhead = (await md()).includes("\n新しい見出し\n");
  await page.keyboard.press("Backspace");
  const joined = (await md()).includes("おわりです新しい見出し");
  t.check("⌫：見出しの頭で印が外れ、もう一度で上の行とつながる", unhead && joined, JSON.stringify((await md()).slice(-80)));
  await page.click(".sheet.is-note .note-tool[data-k=\"undo\"]");
  await page.click(".sheet.is-note .note-tool[data-k=\"undo\"]");
  t.check("取り消すで戻る（見たままの欄のまま）", (await md()).includes("おわりです\n# 新しい見出し") && await page.evaluate(() => !!document.querySelector(".sheet.is-note .js-live h1, .sheet.is-note .js-live .nv-h1")));
  await page.click(".sheet.is-note .note-tool[data-k=\"redo\"]");
  t.check("やり直す", (await md()).includes("おわりです\n新しい見出し"));

  /* ---- 道具の帯 ---- */
  await endOf("ふつうの段落");
  await page.click(".sheet.is-note .note-tool[data-k=\"head\"]");
  const toolHead = (await md()).split("\n")[1];
  const pressed = await page.$eval(".sheet.is-note .note-tool[data-k=\"head\"]", (b) => b.getAttribute("aria-pressed"));
  await page.click(".sheet.is-note .note-tool[data-k=\"head\"]");
  t.check("道具の帯の見出し：付けて光り、もう一度で外れる", toolHead.startsWith("# ふつうの段落") && pressed === "true" && (await md()).split("\n")[1].startsWith("ふつうの段落"), JSON.stringify({ toolHead, pressed }));
  await page.evaluate(() => {
    const L = document.querySelector(".sheet.is-note .js-live");
    const w = document.createTreeWalker(L, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) if (n.data.includes("引用の行")) { getSelection().setBaseAndExtent(n, 0, n, 2); return; }
  });
  await page.click(".sheet.is-note .note-tool[data-k=\"bold\"]");
  t.check("選んで B で太字", (await md()).includes("> **引用**の行"));

  /* ---- 四角 ---- */
  const boxAt = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".sheet.is-note .js-live .nv-li.is-task")].find((x) => x.textContent === "まだ");
    const r = el.querySelector(".nv-t").getBoundingClientRect();
    return { x: r.left - 12, y: r.top + r.height / 2 };
  });
  await page.mouse.click(boxAt.x, boxAt.y);
  await page.waitForTimeout(100);
  t.check("四角を押すと済みに（見たままの欄のまま）", (await md()).includes("- [x] まだ") && await page.evaluate(() => [...document.querySelectorAll(".sheet.is-note .js-live .nv-li.is-done")].some((x) => x.textContent === "まだ")));

  /* ---- 貼り付け ---- */
  await endOf("新しい見出し");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "\n- 貼った一\n- 貼った二");
    document.querySelector(".sheet.is-note .js-live").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const pasted = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-note .js-live .nv-li.is-bullet")].map((x) => x.textContent));
  t.check("貼った Markdown は整った姿に", (await md()).includes("新しい見出し\n- 貼った一\n- 貼った二") && pasted.includes("貼った二"), JSON.stringify(pasted));

  /* ---- 日本語の変換（CDP の IME） ---- */
  const cdp = await page.context().newCDPSession(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const mark = () => page.evaluate(() => {
    const n = getSelection().focusNode;
    const el = (n.nodeType === 3 ? n.parentNode : n).closest(".js-live > *");
    el._probe = (el._probe || 0) + 1;
    return el.className;
  });
  const probe = () => page.evaluate(() => {
    const n = getSelection().focusNode;
    const el = (n.nodeType === 3 ? n.parentNode : n).closest(".js-live > *");
    return { same: !!(el && el._probe), cls: el && el.className, text: el && el.textContent };
  });
  const cls0 = await mark();
  await cdp.send("Input.imeSetComposition", { text: "に", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.imeSetComposition", { text: "にほん", selectionStart: 3, selectionEnd: 3 });
  const mid = await probe();
  await cdp.send("Input.insertText", { text: "日本" });
  await page.waitForTimeout(50);
  const fin = await probe();
  t.check("変換中は行を作り直さない（空の行のまま）・決めたら同じ要素のまま段落に", cls0 === "nv-blank" && mid.same && mid.cls === "nv-blank" && mid.text === "にほん"
    && fin.same && fin.cls === "nv-p" && (await md()).split("\n").includes("日本"), JSON.stringify({ cls0, mid, fin }));
  const fake = (composing) => page.evaluate((c) => {
    const L = document.querySelector(".sheet.is-note .js-live");
    const e = new InputEvent("beforeinput", { inputType: "insertParagraph", isComposing: c, bubbles: true, cancelable: true });
    L.dispatchEvent(e);
    return e.defaultPrevented;
  }, composing);
  const n0 = (await md()).split("\n").length;
  const keep = await fake(true);
  const n1 = (await md()).split("\n").length;
  const take = await fake(false);
  const n2 = (await md()).split("\n").length;
  t.check("確定の改行（isComposing）では行が増えない・ただの改行で一行", !keep && n1 === n0 && take && n2 === n0 + 1, JSON.stringify({ keep, take, n0, n1, n2 }));
  await page.keyboard.press("Backspace");
  /* 太字の中で変換しても、太字のまま。 */
  await endOf("引用");
  await cdp.send("Input.imeSetComposition", { text: "か", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.insertText", { text: "家" });
  await page.waitForTimeout(50);
  t.check("太字の中で変換して決めても太字のまま", (await md()).includes("> **引用家**の行"));

  /* ---- 閉じる：読む姿へ、同じ高さ ---- */
  const before = await page.evaluate(() => {
    const n = getSelection().focusNode;
    const el = (n.nodeType === 3 ? n.parentNode : n).closest(".js-live > *");
    return Math.round(el.getBoundingClientRect().top);
  });
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".sheet.is-note .js-view > *")].find((x) => x.textContent.includes("引用家"));
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  });
  t.check("欄を出ると読む姿、カーソルの行は同じ高さ", Math.abs(after - before) <= 1 && await page.evaluate(() => document.querySelector(".sheet.is-note .js-live").hidden), JSON.stringify({ before, after }));
  const v1 = await tops(".sheet.is-note .js-view");
  await page.locator(".sheet.is-note .js-view .nv-p", { hasText: "日本" }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-live"));
  const l1 = await tops(".sheet.is-note .js-live");
  const d1 = l1[0] - v1[0];
  const off1 = l1.map((y, i) => y - d1 - v1[i]).filter((d) => Math.abs(d) > 1);
  t.check("直したあとも書く姿と読む姿は同じ高さ", l1.length === v1.length && !off1.length, JSON.stringify({ v1, l1 }));
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(200);

  /* ---- 印で書く（⋯）・往復しないノート ---- */
  const pick = async (label) => {
    await page.click(".sheet.is-note .js-note-more");
    const item = page.locator(".note-pop-item", { hasText: label });
    await item.waitFor({ timeout: 2000 });
    await item.click();
    await page.waitForTimeout(300);
  };
  await pick("印で書く");
  await page.locator(".sheet.is-note .js-view .nv-p", { hasText: "日本" }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-text"));
  t.check("「印で書く」で今の書く欄（端末に覚える・記録には入れない）", await page.evaluate(() => localStorage.getItem("kn-note-marks") === "1" && document.querySelector(".sheet.is-note .js-live").hidden));
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(200);
  await pick("見たままで書く");
  await page.locator(".sheet.is-note .js-view .nv-p", { hasText: "日本" }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-live"));
  t.check("「見たままで書く」で戻る", await page.evaluate(() => !localStorage.getItem("kn-note-marks")));
  const bodyNow = await md();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });
  t.check("閉じても本文はそのまま（保存も印の形）", await page.evaluate((i) => KN.notes.get(i).body, id) === bodyNow);

  await page.evaluate(() => {
    const c = KN.noteLive.create;
    window.__liveCreate = c;
    KN.noteLive.create = (r, o) => { const x = c(r, o); x.load = () => false; return x; };
  });
  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open .js-view:not([hidden])");
  await page.waitForTimeout(500);
  await page.locator(".sheet.is-note .js-view .nv-p", { hasText: "日本" }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-text"));
  t.check("戻すと違うノートは、黙って印の欄で開く", await page.evaluate(() => document.querySelector(".sheet.is-note .js-live").hidden && !document.querySelector(".sheet.is-note .js-live").childNodes.length));
  await page.evaluate(() => { KN.noteLive.create = window.__liveCreate; document.activeElement.blur(); });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });

  /* ---- ＋から：見たままで打ち始める ---- */
  await page.evaluate(() => KN.screens.notes.open(null));
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-live"), null, { timeout: 3000 });
  await page.keyboard.type("# 新しいノート");
  await page.keyboard.press("Enter");
  await page.keyboard.type("中身");
  const freshMd = await md();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });
  const saved = await page.evaluate(() => KN.notes.list().some((n) => n.body === "# 新しいノート\n中身"));
  t.check("＋からは見たままの欄で打ち始め、印の形で残る", freshMd === "# 新しいノート\n中身" && saved, JSON.stringify(freshMd));

  /* ---- パソコン：Tab・Ctrl+B ---- */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open .js-view:not([hidden])");
  await page.waitForTimeout(500);
  await page.locator(".sheet.is-note .js-view .nv-li", { hasText: "下の点" }).click();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("js-live"));
  await page.keyboard.press("Tab");
  const tab = (await md()).includes("\n    - 下の点");
  await page.keyboard.press("Shift+Tab");
  const untab = (await md()).includes("\n  - 下の点");
  await endOf("おわりです");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Control+b");
  t.check("Tab で段を下げ・Shift+Tab で上げる・Ctrl+B で太字", tab && untab && (await md()).includes("**おわりです**"), JSON.stringify((await md()).slice(0, 400)));
  await page.keyboard.press("Control+z");
  t.check("Ctrl+Z は自前の取り消す", (await md()).includes("\nおわりです"));
  /* 書くあいだの空の行は一行ぶん（読む姿は .7em。底で改行しても少しずつしか下がらなかった）。 */
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const blankH = await page.$eval(".sheet.is-note .js-live", (l) => {
    const b = [...l.querySelectorAll(".nv-blank")].pop();
    return { h: b && b.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(l).lineHeight) };
  });
  t.check("書くあいだの空の行は一行ぶんの高さ", blankH.h >= blankH.lh - 1, JSON.stringify(blankH));
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });

  t.check("記録本体（localStorage）は変わらない", await page.evaluate((b) => localStorage.getItem("kaimono-note-v2") === b, ls0));
  t.check("エラーなし", !errors.length, errors.join("\n"));
  t.done();
  await browser.close();
})();
