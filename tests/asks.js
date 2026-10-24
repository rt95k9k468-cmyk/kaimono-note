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
   - 問いの面：続きから考える（最後に書いた順・前の答えを読んで続きを足す）・＋問いをつくる（同じ問いはつくらない）・
     一区切り（畳んだ段・消さない・読み込み直しても・再開）・空で閉じても変わらない
   - 今日の問い：前の日に書いた問いは引かない・一区切りは引かない・自分で書いた「？」の問いが「あなたの問い」で混ざり、押すと書いた日へ
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
    t.check("問いの面に「まだの問い」と「ノート・日記に残した問い」", sec.includes("ノート・日記に残した問い") && sec.includes("まだの問い") && (await yetText()).includes(q), JSON.stringify(sec));
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
    const made = await page.evaluate(() => KN.notes.list().filter((n) => n.body === "？試験でつくった問い").length);
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
  const left = await page.evaluate((y) => {
    const all = KN.store.get().asks.map((a) => a.q);
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

  await page.evaluate((y) => {
    const d = (KN.store.get().archive.days || []).find((x) => x.date === y);
    KN.store.setDayLog(y, { memo: `${d.memo}\n？ 試験の自分の問い` });
  }, yest);
  await page.waitForTimeout(500);
  let mine = null;
  for (let i = 0; i < 3 && !mine; i++) {
    const got = await page.evaluate(() => {
      const h = document.querySelector("#screen-archive .think-today");
      return { t: h.querySelector(".js-think-t").textContent, q: h.querySelector(".js-think-q").textContent, ctx: !h.querySelector(".js-think-ctx").hidden };
    });
    if (got.t === "あなたの問い") mine = got;
    else await page.click("#screen-archive .js-think-other");
  }
  t.check("自分で書いた問いが「あなたの問い」として出る（出典・文脈は無い）", !!mine && mine.q === "試験の自分の問い" && !mine.ctx, JSON.stringify(mine));
  const memoBefore = await page.evaluate((y) => (KN.store.get().archive.days.find((x) => x.date === y) || {}).memo, yest);
  await page.click("#screen-archive .js-think-today");
  await page.waitForTimeout(500);
  const after = await page.evaluate((y) => ({ memo: (KN.store.get().archive.days.find((x) => x.date === y) || {}).memo,
    screen: document.querySelector(".screen.is-active").dataset.screen }), yest);
  t.check("自分の問いは写さず、書いた日へ", after.screen === "archive" && after.memo === memoBefore, after.screen);

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
