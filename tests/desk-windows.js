/* 二つの窓（docs/desk.md の段10）。パソコンでは同じアプリをタブ二つ・入れた窓とタブで開ける。片方（B）が記録を書くと、
   もう片方（A）は頁ごと読み直す（app.js の storage → reloadHere）。そのとき失うものが無いかを見る。
   - 二つ開いて何もしなければ、どちらも読み直さない。B が書いて A が読み直したあと、往復しない
   - A でやることの紙に打ちかけ → B が書く → A は読み直し、同じ紙に打ちかけが戻る（ui.js の keepDraft）
   - A で日記の書く紙に打ちかけ → B が書く → A の打ちかけは消えない（紙に戻るか、記録に入る）
   - A でノートの本文を打った直後 → B が書く → A を読み直してもノートの本文が残る
   - 主の一台の窓二つがノートだけ直して Dropbox へ送り合っても、送る役を降りない（P6d）
   - 同じノートを窓二つで直す：書いた窓の合図でほかの窓が読み直し、両方の直しが残る・往復しない（P6d）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-windows.js */
const { open, checker, URL, fakeDropbox } = require("./lib");

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
  await browser.close();

  /* 主の一台の窓二つが、ノートだけ直して Dropbox へ送り合う（P6d）。ノートは記録の読み直しを起こさないので、
     片方の記憶の版が古いまま。前は断られて「ほかの端末」と取り違え、送る役を降りていた（js/dropbox.js の siblingRev）。 */
  {
    const files = new Map();
    const up = [];
    const W = await open({ viewport: { width: 1440, height: 900 }, before: (c) => fakeDropbox(c, files, up) });
    const ready = (p) => p.evaluate(() => Promise.all([KN.liveIdb.ready(), KN.diaryIdb.ready(), KN.notes.ready()]));
    await ready(W.page);
    await W.page.evaluate(async () => {
      KN.store.loadSample();
      KN.dropbox.setAppKey("testkey123");
      for (let i = 0; i < 50 && !KN.dropbox.authUrl(); i++) await new Promise((r) => setTimeout(r, 50));
      await KN.dropbox.finish("code-1");
    });
    const W2 = await W.ctx.newPage();
    W2.on("pageerror", (e) => W.errors.push("W2: " + e.message));
    await W2.goto(URL);
    await booted(W2);
    await ready(W2);
    /* 読み直し（ノートの合図）が追いつく前の形：両方の窓の読み直しを止め、記憶の版を古いままにする。 */
    await W.page.waitForTimeout(2500);   // W2 が開いたときの書き込みで W が読み直すなら、済ませてから
    await booted(W.page);
    await ready(W.page);
    for (const p of [W.page, W2]) await p.evaluate(() => { KN.app.reloadHere = () => {}; });
    const note = (p, id) => p.evaluate((i) => { KN.notes.put({ ...KN.notes.draft(), id: i, body: `${i} の本文` }); return KN.notes.flush().then(() => KN.dropbox.sync()); }, id);
    const r1 = await note(W.page, "n-w1");
    const r2 = await note(W2, "n-w2");
    const r3 = await note(W.page, "n-w3");
    const sender = await W2.evaluate(() => JSON.parse(localStorage.getItem("kaimono-note-dropbox")).sender);
    t.check("主の窓二つがノートだけ直して送り合っても、送る役を降りない", r1 === "sent" && r2 === "sent" && r3 === "sent" && sender === true,
      JSON.stringify({ r1, r2, r3, sender }));
    t.check("エラーなし（Dropbox の窓二つ）", !W.errors.length, W.errors.join(" | "));
    await W.browser.close();
  }

  /* 同じノートを窓二つで直す（P6d）。ノートを書いた窓は合図を出し（js/notes-idb.js の WROTE）、ほかの窓は読み直す。
     前は古い本文のまま直して、もう片方の直しを上書きしていた（前の版にも残らなかった）。 */
  {
    const P = await open({ viewport: { width: 1440, height: 900 } });
    const ready = (p) => p.evaluate(() => KN.notes.ready());
    await ready(P.page);
    await P.page.evaluate(() => { KN.notes.put({ ...KN.notes.draft(), id: "n-same", body: "はじめ" }); return KN.notes.flush(); });
    const Q = await P.ctx.newPage();
    Q.on("pageerror", (e) => P.errors.push("Q: " + e.message));
    await Q.goto(URL);
    await booted(Q);
    await ready(Q);
    const nav = { P: 0, Q: 0 };
    P.page.on("framenavigated", (f) => { if (f === P.page.mainFrame()) nav.P++; });
    Q.on("framenavigated", (f) => { if (f === Q.mainFrame()) nav.Q++; });
    await Q.evaluate(() => { KN.notes.put({ ...KN.notes.get("n-same"), body: "はじめ＋Q の追記", updatedAt: new Date().toISOString() }); return KN.notes.flush(); });
    for (let i = 0; i < 40 && !nav.P; i++) await P.page.waitForTimeout(100);
    await booted(P.page);
    await ready(P.page);
    const seen = await P.page.evaluate(() => KN.notes.get("n-same").body);
    t.check("ノートの窓：ほかの窓がノートを書くと読み直し、その本文が見える", nav.P === 1 && seen === "はじめ＋Q の追記", JSON.stringify({ nav, seen }));
    await P.page.evaluate(() => { const n = KN.notes.get("n-same"); KN.notes.put({ ...n, body: n.body + "＋P の追記", updatedAt: new Date().toISOString() }); return KN.notes.flush(); });
    for (let i = 0; i < 40 && !nav.Q; i++) await Q.waitForTimeout(100);
    await booted(Q);
    await ready(Q);
    const both = await Q.evaluate(() => KN.notes.get("n-same").body);
    t.check("ノートの窓：続けて直しても、両方の直しが残る", both === "はじめ＋Q の追記＋P の追記", both);
    const settledNav = { ...nav };
    await P.page.waitForTimeout(3000);
    t.check("ノートの窓：読み直したあと、往復しない", nav.P === settledNav.P && nav.Q === settledNav.Q, JSON.stringify({ settledNav, nav }));
    t.check("エラーなし（ノートの窓二つ）", !P.errors.length, P.errors.join(" | "));
    await P.browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
