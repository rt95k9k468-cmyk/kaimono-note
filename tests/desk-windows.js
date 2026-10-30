/* 二つの窓（docs/desk.md の段10）。パソコンでは同じアプリをタブ二つ・入れた窓とタブで開ける。片方（B）が記録を書くと、
   もう片方（A）は頁ごと読み直す（app.js の storage → reloadHere）。そのとき失うものが無いかを見る。
   - 二つ開いて何もしなければ、どちらも読み直さない。B が書いて A が読み直したあと、往復しない
   - A でやることの紙に打ちかけ → B が書く → A は読み直し、同じ紙に打ちかけが戻る（ui.js の keepDraft）
   - A で日記の書く紙に打ちかけ → B が書く → A の打ちかけは消えない（紙に戻るか、記録に入る）
   - A でノートの本文を打った直後 → B が書く → A を読み直してもノートの本文が残る
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-windows.js */
const { open, checker, URL } = require("./lib");

(async () => {
  const t = checker("desk-windows");
  const { browser, ctx, page: A, errors } = await open({ viewport: { width: 1440, height: 900 } });
  const booted = async (p) => {
    await p.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen && document.querySelector(".screen.is-active"), null, { timeout: 15000 });
    await p.waitForTimeout(500);
  };
  await A.evaluate(async () => {
    await KN.notes.addMany([{ id: "n-win0", title: "窓のノート", body: "はじめの本文", notebook: "private", tags: [], fav: false,
      createdAt: new Date(Date.now() - 3600e3).toISOString(), updatedAt: new Date(Date.now() - 3600e3).toISOString(), deletedAt: null }]);
  });
  await A.waitForTimeout(400);
  const B = await ctx.newPage();
  B.on("pageerror", (e) => errors.push("B: " + e.message));
  await B.setViewportSize({ width: 1440, height: 900 });
  await B.goto(URL);
  await booted(B);

  const navs = { A: 0, B: 0 };
  A.on("framenavigated", (f) => { if (f === A.mainFrame()) navs.A++; });
  B.on("framenavigated", (f) => { if (f === B.mainFrame()) navs.B++; });
  await A.waitForTimeout(2500);
  t.check("二つ開いて何もしなければ、どちらも読み直さない", navs.A === 0 && navs.B === 0, JSON.stringify(navs));

  /** B が記録を書き、A が読み直し終えるまで待つ。 */
  let n = 0;
  const bWrites = async () => {
    const before = navs.A;
    await B.evaluate((i) => KN.store.addTodo({ title: `窓Bの用事${i}`, due: KN.util.todayKey() }), ++n);
    await A.waitForFunction(() => true).catch(() => {});
    for (let i = 0; i < 40 && navs.A === before; i++) await A.waitForTimeout(100);
    await booted(A);
    await A.waitForTimeout(700);
    return navs.A > before;
  };
  const fieldHas = (p, s) => p.evaluate((x) => [...document.querySelectorAll(".sheet.is-open input, .sheet.is-open textarea")].some((f) => f.value.includes(x)), s);

  /* やることの紙の打ちかけ。 */
  await A.click(".tab-todo");
  await A.waitForTimeout(500);
  await A.click("#dock .add-fab");
  await A.waitForSelector(".sheet.is-open", { timeout: 4000 });
  await A.waitForTimeout(400);
  await A.evaluate(() => {
    const f = [...document.querySelectorAll(".sheet.is-open input, .sheet.is-open textarea")]
      .find((e) => e.getClientRects().length && !/checkbox|radio|range|button/.test(e.type));
    f.focus();
  });
  await A.keyboard.type("窓Aの打ちかけ");
  await A.waitForTimeout(300);
  const r1 = await bWrites();
  const kept1 = await fieldHas(A, "窓Aの打ちかけ");
  t.check("B が書くと A は読み直す", r1, JSON.stringify(navs));
  t.check("やることの紙：A の打ちかけは同じ紙に戻る", kept1);
  const seatB = await B.evaluate(() => KN.app.activeScreen());
  await A.waitForTimeout(1500);
  const nav0 = { ...navs };
  await A.waitForTimeout(2000);
  t.check("A が読み直したあと、往復しない", navs.A === nav0.A && navs.B === nav0.B, JSON.stringify({ nav0, navs, seatB }));
  await A.keyboard.press("Escape");
  await A.waitForTimeout(800);

  /* 日記の書く紙の打ちかけ。 */
  await A.click(".tab-archive");
  await A.waitForTimeout(600);
  await A.evaluate(() => document.querySelector(".js-think-write").click());
  await A.waitForSelector(".sheet.is-card.is-open", { timeout: 4000 });
  await A.waitForTimeout(500);
  await A.evaluate(() => {
    const f = [...document.querySelectorAll(".sheet.is-card.is-open textarea")].filter((e) => e.getClientRects().length).pop();
    f.focus();
  });
  await A.keyboard.type("窓Aの日記の打ちかけ");
  await A.waitForTimeout(300);
  const r2 = await bWrites();
  const diary = await A.evaluate(() => ({
    field: [...document.querySelectorAll(".sheet.is-open textarea")].some((f) => f.value.includes("窓Aの日記の打ちかけ")),
    shown: document.body.innerText.includes("窓Aの日記の打ちかけ"),
    record: (localStorage.getItem("kaimono-note-v2") || "").includes("窓Aの日記の打ちかけ"),
  }));
  t.check("日記の書く紙：A の打ちかけは消えない（紙に戻るか、記録に入る）", r2 && (diary.field || diary.shown || diary.record), JSON.stringify({ r2, diary }));
  await A.keyboard.press("Escape");
  await A.waitForTimeout(800);

  /* ノートの本文を打った直後。 */
  await A.click(".tab-notes");
  await A.waitForTimeout(600);
  await A.evaluate(() => { const a = document.querySelector(".notes-tree .js-tree-all"); if (a) a.click(); });
  await A.waitForTimeout(500);
  await A.evaluate(() => [...document.querySelectorAll("#screen-notes .note-row .note-open")].find((e) => e.textContent.includes("窓のノート")).click());
  await A.waitForSelector(".sheet.is-note.is-open", { timeout: 4000 });
  await A.waitForTimeout(600);
  /* 本文は整えた姿（.note-view）で開く。押すと素の字の欄へ。 */
  const view = A.locator(".sheet.is-note.is-open .note-view").first();
  if (await view.count()) await view.click();
  await A.waitForTimeout(400);
  await A.evaluate(() => {
    const ta = document.querySelector(".sheet.is-note.is-open textarea.note-body-in");
    if (ta && document.activeElement !== ta) ta.focus();
    if (ta) ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  await A.keyboard.type("と窓Aの追記");
  const pre = await A.evaluate(() => ({ field: (document.querySelector(".sheet.is-note.is-open textarea.note-body-in") || {}).value || null,
    model: (KN.notes.get("n-win0") || {}).body || null }));
  t.check("ノート：打った字は本文の欄と手元のノートに入っている（前提）", !!pre.model && pre.model.includes("窓Aの追記"), JSON.stringify(pre));
  const r3 = await bWrites();
  const note = await A.evaluate(() => { const x = KN.notes.get("n-win0"); return x ? x.body : null; });
  t.check("ノート：本文を打った直後に読み直しても、本文が残る", r3 && !!note && note.includes("窓Aの追記"), JSON.stringify({ r3, note }));

  t.check("エラーなし", !errors.length, errors.join(" | "));
  t.done();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
