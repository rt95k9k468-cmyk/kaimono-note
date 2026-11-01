/* 問い・種・読んだところ（思考のホーム。docs/thinking.md）。
   - 問いは独り立ちの入力にしない：行の中身が「？」で始まるノートの行と、タグ「問い」のノート。日記の「？」の行は引かない
   - ノートのホームに「問い」の行 → 一覧（数は出さない）。押すと元のノートのその行へ／その日の daily へ
   - 読むときは「？」の行の字だけ主色（印は打ったまま。保存の形は変わらない）
   - タグの小窓に、まだ使っていなくても「種」「問い」
   - 「⋯」の「読んだところ」：終わりに「### 月日 p.」を足して書く欄へ（種をまくは外した）
   - ノートのホームの「問い」から問いの面へ（daily の札は「思考」に替えた。tests/diary-chat.js）
   - 問いの面の「まだの問い」（今日の問いの元のうち書いていないもの）→ 答える紙（問いは欄の外）→ 「？問い」を頭にした
     ノート（thinking へ）。同じ問いは同じノートの終わりに日付と時刻の行をはさんで。打たずに閉じれば書かない
   - 問いの面：続きから考える（最後に書いた順・前の答えを読んで続きを足す）・＋問いをつくる（同じ問いはつくらない）・
     一区切り（畳んだ段・消さない・読み込み直しても・再開）・空で閉じても変わらない
   - 今日の問い：前の日に書いた問いは引かない・一区切りは引かない・ノートに書いた「？」の問いが「あなたの問い」で混ざり、押すとそのノートへ。日記の「？」は混ざらない
   日記の本文は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/asks.js */
const { open, checker, ASKS } = require("./lib");

(async () => {
  const t = checker("asks");
  const { browser, page, errors } = await open({ unfold: ["readMark"],
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 12, 34)); },
  });
  await page.waitForFunction(() => KN.notes && KN.notes.state() === "on", null, { timeout: 5000 });
  /* 問いの元は端末の記録（store.asks）にだけある。初めて開いた端末では空。 */
  t.check("初めて開いた端末に問いの元は無い", await page.evaluate(() => KN.store.get().asks.length === 0 && !KN.askItems));
  /* 前の文の「？」が行頭に残っただけの段落（句読点で始まる・長い）は問いにしない。 */
  t.check("行頭に「？」が残った段落は問いにしない", await page.evaluate(() => {
    const F = KN.noteFormat;
    return F.askOf("？なぜ空は青いのか") === "なぜ空は青いのか" && F.askOf("？。それから駅まで歩いた") === null
      && F.askOf("？、そして") === null && F.askOf("？" + "あ".repeat(120)) === null;
  }));
  await page.evaluate((a) => KN.store.setAsks(a), ASKS);

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

  const asksText = () => page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-asks:not(.is-yet):not(.is-new) .note-row")]
    .map((r) => r.querySelector(".note-t").textContent.trim()));

  /* ---- ノートのホームの「問い」 → 問いの面 ---- */
  await page.evaluate(() => KN.app.showScreen("notes"));
  await page.waitForSelector("#screen-notes .js-asks", { timeout: 5000 });
  await page.click("#screen-notes .js-asks");
  await page.waitForSelector("#screen-notes .notes-asks", { timeout: 5000 });
  const shown = await asksText();
  t.check("問いの面：ノートの「？」の行・問いのタグのノート（日記の「？」の行は引かない）", shown.includes("なぜ字は右へ流れるのか")
    && shown.includes("考えごと") && !shown.includes("日記の問い") && shown.length === 2, JSON.stringify(shown));
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
      const I = KN.store.get().asks;
      return { n: I.length, same: I.length === 9,
        ok: I.every((a) => a.q && a.g && [1, 2, 3].includes(a.w) && typeof a.from === "string" && typeof a.hint === "string"),
        filled: I.every((a) => a.from.trim() && a.hint.trim()),
        uniq: new Set(I.map((a) => a.q)).size === I.length };
    });
    t.check("問いの元：分け・重さ・出典・文脈付き", shape.n > 0 && shape.same && shape.ok && shape.filled && shape.uniq, JSON.stringify(shape));
    const yetText = () => page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-asks.is-yet .note-t")].map((x) => x.textContent.trim()));
    await page.evaluate(() => { KN.app.showScreen("notes"); KN.screens.notes.asks(); });
    await page.waitForSelector("#screen-notes .notes-asks.is-yet", { timeout: 4000 });
    const q = await page.evaluate(() => KN.store.get().asks[0].q);
    const sec = await page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-sec")].map((x) => x.textContent.trim()));
    t.check("問いの面に「まだの問い」と「ノートに残した問い」", sec.includes("ノートに残した問い") && sec.includes("まだの問い") && (await yetText()).includes(q), JSON.stringify(sec));
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
      const c = el.querySelector(".ask-ctx"), it = KN.store.get().asks[0];
      return { q: el.querySelector(".ask-sheet-q").textContent.trim(), v: a.value, focus: document.activeElement === a, ok: el.querySelector(".js-ok").textContent.trim(),
        ctx: !!c && c.offsetHeight > 0 && c.querySelector(".ask-ctx-from").textContent === it.from && c.querySelector(".ask-ctx-t").textContent === it.hint }; });
    t.check("答える紙：問いは欄の外・欄は空・「保存する」", s.q === q && s.v === "" && s.focus && s.ok === "保存する", JSON.stringify(s));
    t.check("答える紙：問いの下に出典と文脈（畳まない）", s.ctx, JSON.stringify(s));
    await page.keyboard.insertText("答えの字");
    await ok();
    const b1 = await bodies();
    t.check("保存すると「？問い」を頭にしたノート", b1.length === 1 && b1[0] === `？${q}\n答えの字`, JSON.stringify(b1));
    const nb1 = await page.evaluate((q) => KN.notes.list().filter((n) => n.body.startsWith(`？${q}\n`)).map((n) => n.notebook), q);
    t.check("答えの新しいノートは thinking へ", nb1.join() === "thinking", JSON.stringify(nb1));
    const goText = () => page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-asks.is-go .note-t")].map((x) => x.textContent.trim()));
    t.check("答えた問いは「続きから考える」へ移る", (await goText())[0] === q && !(await yetText()).includes(q), JSON.stringify(await goText()));
    await page.evaluate((q) => KN.screens.notes.answer(q), q);
    await answerOpen();
    await page.keyboard.insertText("二度めの字");
    await ok();
    const b2 = await bodies();
    t.check("同じ問いは同じノートの終わりに、日付と時刻の行をはさんで", b2.length === 1
      && b2[0] === `？${q}\n答えの字\n\n10月6日(火) 12:34\n二度めの字`, JSON.stringify(b2));
    const n0 = await page.evaluate(() => KN.notes.list().length);
    await page.evaluate(() => KN.screens.notes.answer(KN.store.get().asks[1].q));
    await answerOpen();
    await ok();
    t.check("打たずに閉じれば書かない", (await page.evaluate(() => KN.notes.list().length)) === n0);

    /* ---- 続きから考える：開くと前の答え、続きは終わりに足す。最後に書いた問いが上 ---- */
    const q1 = await page.evaluate(() => KN.store.get().asks[1].q);
    await page.clock.setFixedTime(new Date(2026, 9, 6, 12, 35));
    await page.evaluate((x) => KN.screens.notes.answer(x), q1);
    await answerOpen();
    await page.keyboard.insertText("べつの答え");
    await ok();
    t.check("最後に書いた問いが「続きから考える」の一番上", (await goText()).slice(0, 2).join() === [q1, q].join(), JSON.stringify(await goText()));
    await page.locator("#screen-notes .notes-asks.is-go .note-row", { hasText: q }).locator(".js-open").click();
    await answerOpen();
    const pastIn = await page.evaluate(() => { const el = document.querySelector(".sheet.is-open"); const p = el.querySelector(".js-past");
      return { past: p ? p.textContent : null, v: el.querySelector(".js-a").value, rest: el.querySelector(".js-rest").textContent.trim() }; });
    t.check("続きから開くと前の答えが読める・欄は空・「一区切り」", pastIn.past === "答えの字\n\n10月6日(火) 12:34\n二度めの字" && pastIn.v === "" && pastIn.rest === "一区切り", JSON.stringify(pastIn));
    const upd0 = await page.evaluate((q) => KN.notes.list().find((n) => n.body.startsWith(`？${q}\n`)).updatedAt, q);
    await ok();
    t.check("空のまま閉じても変わらない（並び・本文）", (await page.evaluate((q) => KN.notes.list().find((n) => n.body.startsWith(`？${q}\n`)).updatedAt, q)) === upd0
      && (await goText())[0] === q1);

    /* ---- 一区切り → 畳んだ段・消さない → 再読み込みでも → 再開 ---- */
    const before = (await bodies())[0];
    await page.evaluate((x) => KN.screens.notes.answer(x), q);
    await answerOpen();
    await page.click(".sheet.is-open .js-rest");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 });
    await page.waitForTimeout(400);
    const restIn = () => page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-rest .note-t")].map((x) => x.textContent.trim()));
    t.check("一区切り：続きから外れ、畳んだ段へ", !(await goText()).includes(q) && (await restIn()).includes(q)
      && (await page.evaluate(() => !document.querySelector("#screen-notes .notes-rest").open)), JSON.stringify(await restIn()));
    t.check("一区切りでも答えは消えない・変わらない", (await bodies())[0] === before);
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.notes && KN.notes.state() === "on", null, { timeout: 5000 });
    await page.evaluate(() => { KN.app.showScreen("notes"); KN.screens.notes.asks(); });
    await page.waitForSelector("#screen-notes .notes-asks", { timeout: 4000 });
    t.check("一区切りは読み込み直しても残る", (await restIn()).includes(q) && !(await goText()).includes(q));
    await page.evaluate(() => { document.querySelector("#screen-notes .notes-rest").open = true; });
    await page.locator("#screen-notes .notes-rest .note-row", { hasText: q }).locator(".js-open").click();
    await answerOpen();
    t.check("一区切りの問いも開ける・「再開する」", (await page.textContent(".sheet.is-open .js-rest")).trim() === "再開する");
    await page.click(".sheet.is-open .js-rest");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 });
    await page.waitForTimeout(400);
    t.check("再開すると続きから考えるへ戻る", (await goText()).includes(q) && !(await restIn()).includes(q)
      && (await page.evaluate(() => Object.keys(KN.store.get().settings.askRest || {}).length)) === 0);

    /* ---- ＋問いをつくる：まだの問いの頭・同じ問いはつくらない・答えると続きへ ---- */
    const mk = async (text) => {
      await page.click("#screen-notes .js-ask-new");
      await page.waitForSelector(".sheet.is-open .js-q", { timeout: 4000 });
      await page.keyboard.insertText(text);
      await ok();
    };
    const n1 = await page.evaluate(() => KN.notes.list().length);
    await mk("試験でつくった問い");
    const madeNb = await page.evaluate(() => KN.notes.list().filter((n) => n.body === "？試験でつくった問い").map((n) => n.notebook));
    t.check("つくった問いのノートも thinking へ", madeNb.join() === "thinking", JSON.stringify(madeNb));
    const made = madeNb.length;
    const madeText = () => page.evaluate(() => [...document.querySelectorAll("#screen-notes .notes-asks.is-made .note-t")].map((x) => x.textContent.trim()));
    t.check("つくった問いは「？問い」だけのノート、まだの問いの頭", made === 1 && (await madeText())[0] === "試験でつくった問い"
      && (await page.evaluate(() => KN.notes.list().length)) === n1 + 1, JSON.stringify(await madeText()));
    await mk("？ 試験でつくった問い");
    await mk(q);
    t.check("同じ問い（今日の問いの元も）はつくらない", (await page.evaluate(() => KN.notes.list().length)) === n1 + 1);
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.notes && KN.notes.state() === "on", null, { timeout: 5000 });
    await page.evaluate(() => { KN.app.showScreen("notes"); KN.screens.notes.asks(); });
    await page.waitForSelector("#screen-notes .notes-asks", { timeout: 4000 });
    t.check("つくった問いは読み込み直しても残る", (await madeText())[0] === "試験でつくった問い");
    await page.clock.setFixedTime(new Date(2026, 9, 6, 12, 36));
    await page.locator("#screen-notes .notes-asks.is-made .note-row").first().locator(".js-open").click();
    await answerOpen();
    await page.keyboard.insertText("つくった問いの答え");
    await ok();
    const mb = await page.evaluate(() => KN.notes.list().filter((n) => n.body.startsWith("？試験でつくった問い")).map((n) => n.body));
    t.check("つくった問いに答えると同じノートの終わりへ・続きの一番上", mb.length === 1 && mb[0] === "？試験でつくった問い\n\n10月6日(火) 12:36\nつくった問いの答え"
      && (await goText())[0] === "試験でつくった問い" && !(await madeText()).length, JSON.stringify([mb, await goText(), await madeText()]));
  }

  /* ---- 今日の問い：前の日に「？問い」を書いた問いは引かない・自分で書いた問いも混ざる ---- */
  const yest = await page.evaluate(() => {
    const U = KN.util, b = U.dayDate(U.todayKey());
    const y = new Date(b.getFullYear(), b.getMonth(), b.getDate() - 1);
    return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  });
  const { left, past: pastNote } = await page.evaluate((y) => {
    const all = KN.store.get().asks.map((a) => a.q), N = KN.notes, n = N.draft(), at = `${y}T03:00:00.000Z`;
    n.title = "前の日の問い"; n.body = all.slice(1).map((q) => `？${q}`).join("\n"); n.createdAt = at; n.updatedAt = at; N.put(n);
    KN.app.showScreen("archive");
    return { left: all[0], past: n.id };
  }, yest);
  await page.waitForTimeout(500);
  const qs = [];
  for (let i = 0; i < 3; i++) {
    qs.push(await page.textContent("#screen-archive .js-think-q"));
    await page.click("#screen-archive .js-think-other");
  }
  t.check("前の日に書いた問いは引かず、残りの問いだけ", qs.every((x) => x === left), JSON.stringify(qs));
  await page.evaluate((q) => { const k = String(q).normalize("NFKC").replace(/\s+/g, ""); KN.store.update((s) => { s.settings.askRest = { [k]: "x" }; }); }, left);
  await page.waitForTimeout(400);
  const qr = [];
  for (let i = 0; i < 3; i++) {
    qr.push(await page.textContent("#screen-archive .js-think-q"));
    await page.click("#screen-archive .js-think-other");
  }
  t.check("一区切りの問いは今日の問いに引かない", !qr.includes(left), JSON.stringify(qr));
  await page.evaluate(() => KN.store.update((s) => { s.settings.askRest = {}; }));
  await page.waitForTimeout(400);
  const ctx = await page.evaluate(() => {
    const c = document.querySelector("#screen-archive .think-today .js-think-ctx"), it = KN.store.get().asks[0];
    return { shown: !!c && !c.hidden && c.offsetHeight > 0, from: c && c.querySelector(".js-think-from").textContent === it.from,
      hint: c && c.querySelector(".js-think-hint").textContent === it.hint,
      big: parseFloat(getComputedStyle(document.querySelector("#screen-archive .js-think-q")).fontWeight) >= 600 };
  });
  t.check("今日の問い：問いは太く、下に出典と文脈（畳まない）", ctx.shown && ctx.from && ctx.hint && ctx.big, JSON.stringify(ctx));

  /* 日記の「？」の行は「あなたの問い」に混ざらない。 */
  await page.evaluate((y) => { KN.store.setDayLog(y, { memo: "12:00\n？ 試験の日記の問い" }); }, yest);
  await page.waitForTimeout(500);
  const fromDiary = [];
  for (let i = 0; i < 9; i++) {
    fromDiary.push(await page.textContent("#screen-archive .js-think-q"));
    await page.click("#screen-archive .js-think-other");
  }
  t.check("日記の「？」の行は今日の問いに引かない", !fromDiary.includes("試験の日記の問い"), JSON.stringify(fromDiary));
  await page.evaluate((id) => { const n = KN.notes.get(id); KN.notes.edit(id, { body: `${n.body}\n？ 試験の自分の問い` }); }, pastNote);
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);
  let mine = null;
  for (let i = 0; i < 9 && !mine; i++) {
    const got = await page.evaluate(() => {
      const h = document.querySelector("#screen-archive .think-today");
      return { t: h.querySelector(".js-think-t").textContent, q: h.querySelector(".js-think-q").textContent, ctx: !h.querySelector(".js-think-ctx").hidden };
    });
    if (got.t === "あなたの問い") mine = got;
    else await page.click("#screen-archive .js-think-other");
  }
  t.check("自分で書いた問いが「あなたの問い」として出る（出典・文脈は無い）", !!mine && mine.q === "試験の自分の問い" && !mine.ctx, JSON.stringify(mine));
  const bodyBefore = await page.evaluate((id) => KN.notes.get(id).body, pastNote);
  await page.click("#screen-archive .js-think-today");
  await page.waitForTimeout(500);
  const after = await page.evaluate((id) => ({ body: KN.notes.get(id).body,
    screen: document.querySelector(".screen.is-active").dataset.screen }), pastNote);
  t.check("自分の問いは写さず、書いたノートへ", after.screen === "notes" && after.body === bodyBefore, after.screen);
  await page.evaluate(() => document.querySelectorAll(".sheet.is-open .js-close").forEach((b) => b.click()));
  await page.waitForTimeout(400);
  await page.evaluate((y) => { KN.app.showScreen("archive"); KN.screens.archive.goDay(y); }, yest);
  await page.waitForTimeout(600);
  const past = await page.evaluate(() => {
    const s = [...document.querySelectorAll("#screen-archive .day-slide")].find((x) => { const r = x.getBoundingClientRect(); return r.width && Math.abs(r.left) < 5; });
    return s ? { home: !!s.querySelector(".think-home"), ask: !!s.querySelector(".think-today") } : null;
  });
  t.check("前の日は三枚の札だけ（今日の問いは今日だけ）", !!past && past.home && !past.ask, JSON.stringify(past));

  /* ---- 設定 → バックアップ →「問いの元を取り込む」：違うファイルは何も変えない・入れ替える前に聞く ---- */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await page.waitForTimeout(250);
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップ" }).first().click();
  await page.waitForTimeout(400);
  const pick = (obj) => page.locator(".js-asks-file").setInputFiles({ name: "asks.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(obj)) });
  await pick({ app: "kaimono-note", days: [] });
  await page.waitForTimeout(400);
  t.check("問いの元でないファイルは何も変えない", (await page.evaluate(() => KN.store.get().asks.length)) === ASKS.length);
  await pick({ app: "kaimono-note", kind: "asks", asks: ASKS.slice(0, 3).concat([{ q: "" }, ASKS[0]]) });
  await page.locator(".sheet.is-open .js-ok, .js-ok").last().click();
  await page.waitForTimeout(600);
  const got = await page.evaluate(() => KN.store.get().asks.map((a) => a.q));
  t.check("取り込むと入れ替わる（空・同じ本文は落とす）", got.join("|") === ASKS.slice(0, 3).map((a) => a.q).join("|"), JSON.stringify(got));

  t.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
