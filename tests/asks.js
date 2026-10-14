/* 問い・種・読んだところ（思考のホーム。docs/thinking.md）。
   - 問いは独り立ちの入力にしない：行の中身が「？」で始まる行（ノートと日記）と、タグ「問い」のノート
   - ノートのホームに「問い」の行 → 一覧（数は出さない）。押すと元のノートのその行へ／その日の daily へ
   - 鍵で daily を伏せているあいだは、日記の問いを引かない
   - 読むときは「？」の行の字だけ主色（印は打ったまま。保存の形は変わらない）
   - タグの小窓に、まだ使っていなくても「種」「問い」
   - 「⋯」の「読んだところ」：終わりに「### 月日 p.」を足して書く欄へ（種をまくは外した）
   - daily の問いの札（問い一覧）からノートの問いの面へ
   - 問いの面の「まだの問い」（今日の問いの元のうち書いていないもの）→ 答える紙（問いは欄の外）→ 「？問い」を頭にした
     ノート。同じ問いは同じノートの終わりに日付と時刻の行をはさんで。打たずに閉じれば書かない
   - 今日の問い：前の日に書いた問いは引かない・自分で書いた「？」の問いが「あなたの問い」で混ざり、押すと書いた日へ
   日記の本文は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/asks.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("asks");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 12, 34)); },
  });
  await page.waitForFunction(() => KN.notes && KN.notes.state() === "on", null, { timeout: 5000 });

  const ids = await page.evaluate(() => {
    const N = KN.notes;
    const mk = (title, body, tags) => { const n = N.draft(); n.title = title; n.body = body; n.tags = tags || []; N.put(n); return n.id; };
    const a = mk("本のノート", "一行目\n？ なぜ字は右へ流れるのか\n- 箇条\n普通の行？", []);
    const b = mk("考えごと", "本文だけ", ["問い"]);
    const c = mk("問いの無いノート", "ふつうの本文", []);
    KN.store.setDayLog(KN.util.todayKey(), { memo: "2026.10.06（火）\n\n12:00\n？ 日記の問い" });
    return { a, b, c };
  });
  await page.evaluate(() => KN.notes.flush());

  const asksText = () => page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-asks:not(.is-yet) .note-row")]
    .map((r) => r.querySelector(".note-t").textContent.trim()));

  /* ---- daily の問いの札 → ノートの問いの面 ---- */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);
  await page.click("#screen-archive .js-think-ask");
  await page.waitForSelector("#screen-notes .notes-asks", { timeout: 5000 });
  const shown = await asksText();
  t.check("問いの面：ノートの「？」の行・問いのタグのノート・日記の「？」の行", shown.includes("なぜ字は右へ流れるのか")
    && shown.includes("考えごと") && shown.includes("日記の問い") && shown.length === 3, JSON.stringify(shown));
  t.check("「？」で終わる行・問いの無いノートは出ない", !shown.some((x) => /普通の行|ふつうの本文/.test(x)));
  const head = await page.evaluate(() => document.getElementById("head").innerText);
  t.check("帯の題は「問い」", /問い/.test(head), head.slice(0, 60));
  const text = await page.evaluate(() => document.getElementById("screen-notes").innerText);
  t.check("数・評価の言葉を出さない", !/\d\s*件|達成|連続|目標/.test(text));

  /* ---- 押すと元のノートのその行へ ---- */
  await page.locator("#screen-notes .notes-asks .note-row", { hasText: "なぜ字は右へ流れるのか" }).locator(".js-open").click();
  await page.waitForSelector(".sheet.is-note.is-open .note-view .is-ask", { timeout: 5000 });
  const view = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-note.is-open");
    const ask = s.querySelector(".note-view .is-ask");
    const plain = s.querySelector('.note-view [data-line="3"]');
    return { line: ask.dataset.line, color: getComputedStyle(ask.querySelector(".nv-t")).color,
      plainColor: getComputedStyle(plain.querySelector(".nv-t")).color, title: s.querySelector(".js-title").value };
  });
  t.check("元のノートが開く・問いの行に印", view.title === "本のノート" && view.line === "1", JSON.stringify(view));
  t.check("問いの行の字はほかと違う色（主色）", view.color !== view.plainColor, JSON.stringify(view));
  const body0 = await page.evaluate((id) => KN.notes.get(id).body, ids.a);
  t.check("開いても本文は変わらない", body0 === "一行目\n？ なぜ字は右へ流れるのか\n- 箇条\n普通の行？");

  /* ---- 「⋯」：種をまくは無く、読んだところ ---- */
  await page.click(".sheet.is-note.is-open .js-note-more");
  await page.waitForSelector(".note-pop.is-open .note-pop-item");
  const items = await page.$$eval(".note-pop.is-open .note-pop-item", (xs) => xs.map((x) => x.textContent.trim()));
  t.check("「⋯」に種をまくは無く、読んだところがある", !items.includes("種をまく") && items.includes("読んだところ"), items.join(","));
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "読んだところ" }).click();
  await page.waitForTimeout(300);
  const read = await page.evaluate((id) => {
    const s = document.querySelector(".sheet.is-note.is-open");
    const ta = s.querySelector(".js-text");
    return { v: ta.value, focused: document.activeElement === ta, caret: ta.selectionEnd === ta.value.length, body: KN.notes.get(id).body };
  }, ids.a);
  t.check("終わりに「### 10月6日 p.」を足して、その後ろにカーソル", read.v.endsWith("\n\n### 10月6日 p.") && read.focused && read.caret, JSON.stringify(read));
  t.check("ノートにも入る", read.body === read.v, JSON.stringify(read.body));
  await page.keyboard.insertText("12-30");
  await page.waitForTimeout(100);

  /* ---- タグの小窓：種・問いがまだ無くても並ぶ ---- */
  await page.click(".sheet.is-note.is-open .note-tag-add");
  await page.waitForSelector(".note-pop.is-pick.is-open .chip");
  const tags = await page.$$eval(".note-pop.is-pick.is-open .chip", (xs) => xs.map((x) => x.textContent.trim()));
  t.check("タグの小窓に「種」「問い」", tags.includes("種") && tags.includes("問い"), tags.join(","));
  await page.locator(".note-pop.is-pick.is-open .chip", { hasText: "種" }).click();
  await page.waitForTimeout(200);
  const tagged = await page.evaluate((id) => KN.notes.get(id).tags, ids.a);
  t.check("押せば「種」が付く", tagged.includes("種"), JSON.stringify(tagged));
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.querySelectorAll(".sheet.is-open .js-close").forEach((b) => b.click()));
  await page.waitForTimeout(600);
  const end = await page.evaluate((id) => KN.notes.get(id).body, ids.a);
  t.check("読んだところのあとに打った字も残る", end.endsWith("### 10月6日 p.12-30"), JSON.stringify(end));

  /* ---- 日記の問いを押すと、その日の daily ---- */
  await page.evaluate(() => KN.screens.notes.asks());
  await page.waitForSelector("#screen-notes .notes-asks");
  await page.locator("#screen-notes .notes-asks .note-row", { hasText: "日記の問い" }).locator(".js-open").click();
  await page.waitForFunction(() => document.querySelector(".screen.is-active").dataset.screen === "archive", null, { timeout: 4000 }).catch(() => {});
  const where = await page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  t.check("日記の問いは daily へ", where === "archive", where);

  /* ---- 鍵で daily を伏せているあいだは、日記の問いを引かない ---- */
  const hidden = await page.evaluate(async () => {
    const real = KN.lock.hides;
    KN.lock.hides = (p) => p === "daily";
    KN.app.showScreen("notes");
    KN.screens.notes.asks();
    await new Promise((r) => setTimeout(r, 400));
    const got = [...document.querySelectorAll("#screen-notes .notes-asks .note-t")].map((x) => x.textContent.trim());
    KN.lock.hides = real;
    return got;
  });
  t.check("daily を伏せているあいだは日記の問いを出さない", !hidden.includes("日記の問い") && hidden.includes("考えごと"), JSON.stringify(hidden));

  /* ---- ノートのホームに「問い」の行 ---- */
  const homeRow = await page.evaluate(async () => {
    KN.screens.notes.again();
    await new Promise((r) => setTimeout(r, 300));
    const b = document.querySelector("#screen-notes .notes-books .js-asks");
    return b ? b.textContent.trim() : null;
  });
  t.check("ノートのホームに「問い」の行", homeRow === "問い", String(homeRow));

  /* ---- まだの問い → 答える紙 → 「？問い」を頭にしたノート ---- */
  {
    const shape = await page.evaluate(() => {
      const I = KN.askItems || [];
      return { n: I.length, same: I.every((a, i) => a.q === KN.askList[i]) && I.length === KN.askList.length,
        ok: I.every((a) => a.q && a.g && [1, 2, 3].includes(a.w) && typeof a.from === "string" && typeof a.hint === "string"),
        uniq: new Set(I.map((a) => a.q)).size === I.length };
    });
    t.check("問いの元：分け・重さ・出典・ひとこと付き、askList は本文だけの写し", shape.n > 0 && shape.same && shape.ok && shape.uniq, JSON.stringify(shape));
    const yetText = () => page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-asks.is-yet .note-t")].map((x) => x.textContent.trim()));
    await page.evaluate(() => { KN.app.showScreen("notes"); KN.screens.notes.asks(); });
    await page.waitForSelector("#screen-notes .notes-asks.is-yet", { timeout: 4000 });
    const q = await page.evaluate(() => KN.askList[0]);
    const sec = await page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-sec")].map((x) => x.textContent.trim()));
    t.check("問いの面に「書いた問い」と「まだの問い」", sec.includes("書いた問い") && sec.includes("まだの問い") && (await yetText()).includes(q), JSON.stringify(sec));
    const answerOpen = () => page.waitForSelector(".sheet.is-open .ask-sheet-q", { timeout: 4000 });
    const ok = async () => {
      await page.click(".sheet.is-open .js-ok");
      await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
    };
    const bodies = () => page.evaluate((q) => KN.notes.list().filter((n) => n.body.startsWith(`？${q}\n`)).map((n) => n.body), q);
    await page.locator("#screen-notes .notes-asks.is-yet .note-row", { hasText: q }).first().locator(".js-answer").click();
    await answerOpen();
    const s = await page.evaluate(() => { const el = document.querySelector(".sheet.is-open"), a = el.querySelector(".js-a");
      return { q: el.querySelector(".ask-sheet-q").textContent.trim(), v: a.value, focus: document.activeElement === a, ok: el.querySelector(".js-ok").textContent.trim() }; });
    t.check("答える紙：問いは欄の外・欄は空・「保存する」", s.q === q && s.v === "" && s.focus && s.ok === "保存する", JSON.stringify(s));
    await page.keyboard.insertText("答えの字");
    await ok();
    const b1 = await bodies();
    t.check("保存すると「？問い」を頭にしたノート", b1.length === 1 && b1[0] === `？${q}\n答えの字`, JSON.stringify(b1));
    t.check("答えた問いは「書いた問い」へ移る", (await asksText()).includes(q) && !(await yetText()).includes(q));
    await page.evaluate((q) => KN.screens.notes.answer(q), q);
    await answerOpen();
    await page.keyboard.insertText("二度めの字");
    await ok();
    const b2 = await bodies();
    t.check("同じ問いは同じノートの終わりに、日付と時刻の行をはさんで", b2.length === 1
      && b2[0] === `？${q}\n答えの字\n\n10月6日(火) 12:34\n二度めの字`, JSON.stringify(b2));
    const n0 = await page.evaluate(() => KN.notes.list().length);
    await page.evaluate(() => KN.screens.notes.answer(KN.askList[1]));
    await answerOpen();
    await ok();
    t.check("打たずに閉じれば書かない", (await page.evaluate(() => KN.notes.list().length)) === n0);
  }

  /* ---- 今日の問い：前の日に「？問い」を書いた問いは引かない・自分で書いた問いも混ざる ---- */
  const yest = await page.evaluate(() => {
    const U = KN.util, b = U.dayDate(U.todayKey());
    const y = new Date(b.getFullYear(), b.getMonth(), b.getDate() - 1);
    return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  });
  const left = await page.evaluate((y) => {
    const all = KN.askList;
    KN.store.setDayLog(y, { memo: "12:00\n" + all.slice(1).map((q) => `？${q}`).join("\n") });
    KN.app.showScreen("archive");
    return all[0];
  }, yest);
  await page.waitForTimeout(500);
  const qs = [];
  for (let i = 0; i < 3; i++) {
    qs.push(await page.textContent("#screen-archive .js-think-q"));
    await page.click("#screen-archive .js-think-other");
  }
  t.check("前の日に書いた問いは引かず、残りの問いだけ", qs.every((x) => x === left), JSON.stringify(qs));

  await page.evaluate((y) => {
    const d = (KN.store.get().archive.days || []).find((x) => x.date === y);
    KN.store.setDayLog(y, { memo: `${d.memo}\n？ 試験の自分の問い` });
  }, yest);
  await page.waitForTimeout(500);
  let mine = null;
  for (let i = 0; i < 3 && !mine; i++) {
    const got = await page.evaluate(() => {
      const h = document.querySelector("#screen-archive .think-today");
      return { t: h.querySelector(".js-think-t").textContent, q: h.querySelector(".js-think-q").textContent };
    });
    if (got.t === "あなたの問い") mine = got;
    else await page.click("#screen-archive .js-think-other");
  }
  t.check("自分で書いた問いが「あなたの問い」として出る", !!mine && mine.q === "試験の自分の問い", JSON.stringify(mine));
  const memoBefore = await page.evaluate((y) => (KN.store.get().archive.days.find((x) => x.date === y) || {}).memo, yest);
  await page.click("#screen-archive .js-think-today");
  await page.waitForTimeout(500);
  const after = await page.evaluate((y) => ({ memo: (KN.store.get().archive.days.find((x) => x.date === y) || {}).memo,
    screen: document.querySelector(".screen.is-active").dataset.screen }), yest);
  t.check("自分の問いは写さず、書いた日へ", after.screen === "archive" && after.memo === memoBefore, after.screen);

  t.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
