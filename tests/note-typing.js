/* ノートの書く紙で打つあいだ（docs/notes.md の「打つあいだの送り・太字」、2026年10月7日）。

   打っても・道具を押しても送りが頭へ飛ばない／カーソルの行は帯の上に一行ぶん空けて
   見える（途中の行でも）／見えている行で打っても送りは動かない／キーボードを閉じても、
   書く欄に入っても、カーソルの行は同じ高さ／太字（B で挟む・外す・何も選ばずに押すと
   「****」の間・整えた姿は太く・一覧と題は印を外す・B が光る）／書いているあいだは
   一番上で引いても閉じない（キーボードが下りるだけ）／書いているあいだも色付け（写しが
   欄と同じ字・同じ高さ・欄の字は透ける・太字は太く・折り返しても揃う）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-typing.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("note-typing");
  const { browser, ctx, page, errors } = await open();

  const active = () => page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  if ((await active()) !== "archive") {
    await page.evaluate(() => KN.app.showScreen("archive"));
    await settled("archive");
  }
  await page.click('.tab[data-tab="archive"]');
  await settled("notes");
  const lsBefore = await page.evaluate(() => (localStorage.getItem("kaimono-note-v2") || "").length);
  const gone = () => page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });

  /* 折り返さない短い行だけ：N 行目の上下は「欄の上端 + (N-1) × 行の高さ」。 */
  await page.click("#dock .add-fab");
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(600);
  await page.keyboard.insertText(Array.from({ length: 80 }, (_, i) => `行${i + 1}`).join("\n"));
  await page.waitForTimeout(200);

  /* キーボードが出ている見え方（アプリ自身の測り方に通す。tests/notes-format.js と同じ）。 */
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, "height", { configurable: true, get: () => 464 });
    visualViewport.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(300);

  const at = (n) => page.$eval(".sheet.is-note", (s, k) => {
    const ta = s.querySelector(".js-text");
    const lh = parseFloat(getComputedStyle(ta).lineHeight);
    const top = ta.getBoundingClientRect().top + (k - 1) * lh;
    const sb = s.querySelector(".sheet-body").getBoundingClientRect();
    return { top, bottom: top + lh, lh, barTop: s.querySelector(".note-tools").getBoundingClientRect().top,
      sbTop: sb.top, scroll: s.querySelector(".sheet-body").scrollTop };
  }, n);
  /* n 行目の頭にカーソルを置き、その行が帯の裏に来るところまで送る。 */
  const caretTo = (n, under) => page.$eval(".sheet.is-note", (s, [k, u]) => {
    const ta = s.querySelector(".js-text");
    const lines = ta.value.split("\n");
    const pos = lines.slice(0, k - 1).join("\n").length + (k > 1 ? 1 : 0);
    ta.setSelectionRange(pos, pos);
    const sc = s.querySelector(".sheet-body");
    const lh = parseFloat(getComputedStyle(ta).lineHeight);
    const bar = s.querySelector(".note-tools").getBoundingClientRect();
    const lineTop = ta.getBoundingClientRect().top + (k - 1) * lh;
    /* u：帯の上端から何 px 下に行の上端を置くか（負なら帯より上）。 */
    sc.scrollTop += lineTop - (bar.top + u);
  }, [n, under]);

  /* ---- 途中の行が帯の裏で打つ：頭へ飛ばず、行は帯の上に一行ぶん空けて ---- */
  await caretTo(40, 4);
  const before = await at(40);
  await page.keyboard.insertText("あ");
  await page.waitForTimeout(150);
  const typed = await at(40);
  t.check("途中の行で打っても、送りは頭へ飛ばない", typed.scroll > before.scroll - 4 && typed.scroll > 300, JSON.stringify({ before, typed }));
  t.check("打った行は帯の上に、一行ぶん空けて見える",
    typed.bottom <= typed.barTop - typed.lh + 1 && typed.top >= typed.sbTop, JSON.stringify(typed));

  /* ---- 見えている行で打つなら、送りは動かない ---- */
  await caretTo(30, -200);
  const mid0 = await at(30);
  await page.keyboard.insertText("い");
  await page.waitForTimeout(150);
  const mid1 = await at(30);
  t.check("見えている行で打っても、送りは動かない", Math.abs(mid1.scroll - mid0.scroll) < 1, JSON.stringify({ mid0, mid1 }));

  /* ---- 道具を押しても頭へ飛ばない ---- */
  await caretTo(50, -150);
  const tool0 = await at(50);
  await page.click('.sheet.is-note .note-tool[data-k="bullet"]');
  await page.waitForTimeout(150);
  const tool1 = await at(50);
  const v50 = await page.$eval(".sheet.is-note .js-text", (e) => e.value.split("\n")[49]);
  t.check("道具（箇条書き）を押しても、送りは頭へ飛ばない",
    v50 === "- 行50" && Math.abs(tool1.scroll - tool0.scroll) < 1, JSON.stringify({ v50, tool0, tool1 }));
  await page.click('.sheet.is-note .note-tool[data-k="undo"]');
  await page.waitForTimeout(150);
  const undo1 = await at(50);
  t.check("取り消すを押しても、送りは頭へ飛ばない", Math.abs(undo1.scroll - tool0.scroll) < 1, JSON.stringify({ tool0, undo1 }));

  /* ---- 太字 ---- */
  await page.$eval(".sheet.is-note .js-text", (ta) => {
    const i = ta.value.indexOf("行60");
    ta.setSelectionRange(i, i + 2);
  });
  await page.click('.sheet.is-note .note-tool[data-k="bold"]');
  const b1 = await page.$eval(".sheet.is-note .js-text", (ta) => ({
    line: ta.value.split("\n")[59], sel: ta.value.slice(ta.selectionStart, ta.selectionEnd),
    pressed: document.querySelector('.note-tool[data-k="bold"]').getAttribute("aria-pressed") }));
  t.check("選んだ字を B で太字の印で挟む（選ぶのは中の字）", b1.line === "**行6**0" && b1.sel === "行6" && b1.pressed === "true", JSON.stringify(b1));
  await page.click('.sheet.is-note .note-tool[data-k="bold"]');
  const b2 = await page.$eval(".sheet.is-note .js-text", (ta) => ta.value.split("\n")[59]);
  t.check("もう一度 B で外す", b2 === "行60", b2);
  await page.$eval(".sheet.is-note .js-text", (ta) => {
    const i = ta.value.indexOf("行61") + 3;
    ta.setSelectionRange(i, i);
  });
  await page.click('.sheet.is-note .note-tool[data-k="bold"]');
  await page.keyboard.insertText("太い");
  const b3 = await page.$eval(".sheet.is-note .js-text", (ta) => ta.value.split("\n")[60]);
  t.check("何も選ばずに B を押すと「****」の間に打てる", b3 === "行61**太い**", b3);

  /* ---- 書いているあいだも色付け（写しを重ねる。10月7日） ---- */
  const inkOf = () => page.$eval(".sheet.is-note", (s) => {
    const ta = s.querySelector(".js-text");
    const hl = s.querySelector(".note-hl");
    return {
      plain: s.querySelector(".note-ink").classList.contains("is-plain"),
      shown: getComputedStyle(hl).display !== "none",
      same: hl.textContent.replace(/\u200b$/, "") === ta.value,
      tall: Math.abs(hl.offsetHeight - ta.offsetHeight),
      clear: getComputedStyle(ta).webkitTextFillColor,
      bold: [...hl.querySelectorAll(".nh-b")].map((e) => e.textContent).join(","),
      marks: hl.querySelectorAll(".nh-mark").length,
      left: Math.abs(hl.getBoundingClientRect().left - ta.getBoundingClientRect().left),
    };
  });
  const k1 = await inkOf();
  t.check("書いているあいだも太字は太く（字は欄と同じ・同じ高さ・欄の字は透ける）",
    !k1.plain && k1.shown && k1.same && k1.tall < 1 && k1.left < 1 && k1.clear === "rgba(0, 0, 0, 0)"
    && k1.bold === "太い" && k1.marks >= 2, JSON.stringify(k1));
  /* 折り返す長い行・英字・見出し・チェック済みが混ざっても、写しの高さは欄と同じ。 */
  await page.keyboard.press("End");
  await page.keyboard.insertText("\n# 見出し**強い**\nEnglish words **bold mixed** in a long line that wraps around the edge of the box and again.\n- [x] 済んだ\n長い日本語の段落で、折り返しがずれないかを確かめるための文です。**ここは太字**で、ここは普通の字。");
  const k2 = await inkOf();
  t.check("折り返す行・英字・見出しが混ざっても、写しは欄とずれない", !k2.plain && k2.same && k2.tall < 1, JSON.stringify(k2));

  /* ---- キーボードを閉じても、カーソルの行は同じ高さ ---- */
  await page.$eval(".sheet.is-note .js-text", (ta) => {
    ta.value = `# **大きな見出し**\n${ta.value}`;
    ta.dispatchEvent(new Event("input"));
  });
  await caretTo(45, -120);
  const w0 = await at(45);
  await page.$eval(".sheet.is-note .js-text", (ta) => ta.blur());
  await page.waitForTimeout(200);
  const v0 = await page.$eval(".sheet.is-note", (s) => {
    const el = s.querySelector('.note-view [data-line="44"]');
    return { top: el.getBoundingClientRect().top, strong: s.querySelector(".note-view .nv-h1 .nv-b")?.textContent || "",
      bold61: s.querySelector('.note-view [data-line="61"] .nv-b')?.textContent || "" };
  });
  t.check("キーボードを閉じても、読んでいた行は同じ高さ", Math.abs(v0.top - w0.top) < 3, JSON.stringify({ w0, v0 }));
  t.check("整えた姿では太字は太く、印は見せない", v0.strong === "大きな見出し" && v0.bold61 === "太い", JSON.stringify(v0));
  /* 押した行は、書く欄でも同じ高さ（見出しの大きさが変わっても）。 */
  await page.click('.sheet.is-note .note-view [data-line="44"]');
  await page.waitForTimeout(150);
  const w1 = await at(45);
  t.check("整えた姿の行を押すと、書く欄でもその行は同じ高さ", Math.abs(w1.top - v0.top) < 3, JSON.stringify({ v0, w1 }));

  /* ---- 書いているあいだは、一番上で引いても閉じない（本物の指） ---- */
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 4, radiusY: 4, force: 1 }];
  const pull = async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(200, 300) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(200, 300 + 30 * i) });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  /* 頭で引くには、カーソルも頭へ置いてから送る。カーソルが45行目のままだと、アプリはその行を見える所へ
     送り戻す（正しい動き）——前は決め打ちの 150ms で、追いが来る前に引けたときだけ通っていた。混んでいると
     追いが引くあいだに来て、指は「読み返し」になる（並べると12回中3回。N10）。 */
  const quiet = () => page.evaluate(() => new Promise((res) => {
    const b = document.querySelector(".sheet.is-note .sheet-body");
    let last = b.scrollTop, n = 0;
    const f = () => {
      if (b.scrollTop === last) n++; else { n = 0; last = b.scrollTop; }
      if (n >= 10) res(last); else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  await quiet();
  await page.$eval(".sheet.is-note .js-text", (ta) => ta.setSelectionRange(0, 0));
  await quiet();
  await page.$eval(".sheet.is-note .sheet-body", (e) => { e.scrollTop = 0; });
  const pre = await quiet();
  await pull();
  await page.waitForTimeout(600);
  const still = await page.evaluate(() => ({ open: !!document.querySelector(".sheet.is-note.is-open"),
    writing: document.activeElement === document.querySelector(".sheet.is-note .js-text") }));
  /* 引いた指はキーボードを下ろすだけ（app.js の「下へ払ってキーボードを閉じる」）。 */
  t.check("書いているあいだは、一番上で引いても閉じない（キーボードが下りるだけ）", still.open && !still.writing, JSON.stringify({ ...still, top: pre }));

  await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event("resize")); });
  await page.keyboard.press("Escape");
  await gone();
  const card = await page.$eval("#screen-notes .notes-list .note-row .note-t", (e) => e.textContent.trim());
  t.check("一覧の題は太字の印を外す", card === "大きな見出し", card);

  t.check("localStorage は変わらない", (await page.evaluate(() => (localStorage.getItem("kaimono-note-v2") || "").length)) === lsBefore);
  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
