/* 写しの端末（docs/desk.md「段15 の設計」の②。js/replica.js）。Dropbox は台本が偽の返事をする。
   - 写しのあいだ、記録（kaimono-note-v2）・自動の控え（snaps）・日記の写し（diary）・過去のやることの棚（todoPast）・
     meta（写しの "replica" を除く）が、開く・押す・設定を変える・読み直す・閉じるをまたいで一字も変わらない
   - Dropbox へ kurashi-latest.json・daily/・glance.json・inbox/ を置かない
   - データは iPhone の控えの写し（ノートの noteBook は入れない）、設定はこの端末のもの。版が変われば読み直す
   - iPhone だけの操作（済み・＋）は薄く、押しても変わらず「iPhoneで操作できます」。ほかの道の書き換えも戻る
   - 切れば前からの記録のまま開く
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-replica.js */
const { open, checker, URL } = require("./lib");

(async () => {
  const t = checker("desk-replica");
  const { browser, ctx, page: A, errors } = await open({ viewport: { width: 1440, height: 900 } });
  const booted = async (p) => {
    await p.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen && document.querySelector(".screen.is-active"), null, { timeout: 15000 });
    await p.waitForTimeout(500);
  };

  /* ---- 偽の Dropbox ---- */
  const puts = [];
  let rev = "r1";
  let latest = "";
  await ctx.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    const path = new (require("url").URL)(req.url()).pathname;
    const head = req.headers()["dropbox-api-arg"];
    const arg = head ? JSON.parse(head) : null;
    const body = !arg && req.postData() ? JSON.parse(req.postData()) : null;
    const where = (arg && arg.path) || (body && body.path) || "";
    const json = (status, v) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(v) });
    if (path === "/2/files/upload") { puts.push(where); return json(200, { rev: "x", name: where }); }
    if (where === "/kurashi-latest.json" && path === "/2/files/get_metadata") {
      return json(200, { ".tag": "file", rev, server_modified: "2026-10-31T09:00:00Z", size: latest.length });
    }
    if (where === "/kurashi-latest.json" && path === "/2/files/download") return route.fulfill({ status: 200, body: latest });
    if (path === "/2/files/list_folder") return json(200, { entries: [], cursor: "c", has_more: false });
    return json(409, { error_summary: "path/not_found/" });
  });

  /* ---- この端末の前からの記録 ---- */
  await A.evaluate(() => {
    const day = KN.util.todayKey();
    KN.store.addTodo({ title: "端末の用事", due: day });
    KN.store.update((s) => { s.archive.days.push({ date: day, memo: "端末の日記" }); });
    localStorage.setItem("kaimono-note-dropbox", JSON.stringify({
      appKey: "k", refresh: "r", access: "a", expires: Date.now() + 864e5, sender: false,
    }));
  });
  await A.waitForTimeout(1500);
  await A.evaluate(async () => { await KN.diaryIdb.ready(); await KN.backup.snapshot("試験の前"); });
  await A.waitForTimeout(800);
  const iphone = (p, title, memo) => p.evaluate(([title, memo]) => JSON.stringify({
    schema: KN.store.SCHEMA, app: "kaimono-note", exportedAt: new Date().toISOString(),
    todos: [{ id: "t-ip1", title, due: KN.util.todayKey(), createdAt: KN.util.todayKey() }],
    archive: { days: [{ date: KN.util.todayKey(), memo }], entries: [] },
    noteBook: { notes: [{ id: "n-ip", title: "写しのノート", body: "" }] },
    settings: { theme: "dark", railFolded: true },
  }), [title, memo]);
  latest = await iphone(A, "iPhoneの用事", "写しの日記");

  /* 写しを入れる（印だけ書いて閉じる）。閉じる拍の控えが済んでから、ほかの頁で記録を写し取る。 */
  await A.evaluate(() => localStorage.setItem("kn-replica", JSON.stringify({ on: true })));
  await A.close({ runBeforeUnload: true });
  const B = await ctx.newPage();
  B.on("pageerror", (e) => errors.push("B: " + e.message));
  const plain = URL.replace(/index\.html$/, "css/base.css");
  const dump = (p) => p.evaluate(() => new Promise((ok, ng) => {
    const r = indexedDB.open("kaimono-note");
    r.onerror = () => ng(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const names = [...db.objectStoreNames];
      const tx = db.transaction(names, "readonly");
      const out = {};
      names.forEach((n) => { const g = tx.objectStore(n).getAll(); g.onsuccess = () => { out[n] = g.result; }; });
      tx.oncomplete = () => {
        db.close();
        /* 写しそのもの（replica）と Dropbox のつなぎの鍵の写し（dropbox。記録ではない）は比べない。 */
        if (out.meta) out.meta = out.meta.filter((m) => m.k !== "replica" && m.k !== "dropbox");
        ok({ live: localStorage.getItem("kaimono-note-v2"), idb: JSON.stringify(out), counts: { ...Object.fromEntries(names.map((n) => [n, out[n].length])), metaKeys: (out.meta || []).map((m) => m.k).join() } });
      };
    };
  }));
  await B.waitForTimeout(800);
  await B.goto(plain);
  const before = await dump(B);
  t.check("前提：記録と控え・日記の写しがある", before.live && before.live.includes("端末の用事") && before.counts.snaps > 0 && before.counts.diary > 0,
    JSON.stringify(before.counts));

  /* ---- 写しで開く ---- */
  await B.setViewportSize({ width: 1440, height: 900 });
  await B.goto(URL);
  await booted(B);
  await B.waitForFunction(() => KN.store.get().todos.some((x) => x.title === "iPhoneの用事"), null, { timeout: 8000 }).catch(() => {});
  const seen = await B.evaluate(() => {
    const s = KN.store.get();
    return { rep: KN.store.replica(), cls: document.documentElement.classList.contains("is-replica"),
      titles: s.todos.map((x) => x.title), memo: (s.archive.days[0] || {}).memo || null, note: "noteBook" in s,
      theme: s.settings.theme, body: KN.diaryIdb.body() };
  });
  t.check("写しのデータを見せる（この端末の記録は隠れる）", seen.rep && seen.cls && seen.titles.join() === "iPhoneの用事" && seen.memo === "写しの日記",
    JSON.stringify(seen));
  t.check("ノート（noteBook）は写しに入れない・設定はこの端末のもの", !seen.note && seen.theme !== "dark", JSON.stringify(seen));
  t.check("日記の本文は読める（日記の写しは動かさない）", seen.body === "ok", seen.body);

  /* 済みの丸は薄く、押しても変わらず言う。 */
  await B.click(".tab-todo");
  await B.waitForTimeout(700);
  const chk = B.locator("#screen-todo .check").first();
  const fade = await chk.evaluate((e) => Number(getComputedStyle(e).opacity)).catch(() => null);
  t.check("済みの丸は薄い", fade != null && fade < 0.5, String(fade));
  await chk.click().catch(() => {});
  await B.waitForTimeout(400);
  const after = await B.evaluate(() => ({ done: KN.store.get().todos.find((x) => x.id === "t-ip1").done,
    toast: [...document.querySelectorAll(".toast")].map((e) => e.textContent).join("|") }));
  t.check("済みの丸を押しても済まない・「iPhoneで操作できます」", !after.done && after.toast.includes("iPhoneで操作できます"), JSON.stringify(after));
  const fab = await B.evaluate(() => Number(getComputedStyle(document.querySelector("#dock .add-fab")).opacity));
  t.check("＋は薄い", fab < 0.5, String(fab));
  await B.click(".tab-notes");
  await B.waitForTimeout(600);
  const nfab = await B.evaluate(() => Number(getComputedStyle(document.querySelector("#dock .add-fab")).opacity));
  t.check("ノートの＋は薄くしない", nfab > 0.9, String(nfab));

  /* ほかの道の書き換えは戻る。設定は残る。引いて読み直しても写しのまま。 */
  const other = await B.evaluate(async () => {
    KN.store.addTodo({ title: "写しで足した", due: KN.util.todayKey() });
    KN.store.update((s) => { s.todos[0].title = "書き換えた"; s.archive.days[0].memo = "書き換えた"; });
    KN.store.update((s) => { s.settings.textSize = "l"; });
    KN.store.reload();
    KN.store.saveNow();
    await new Promise((ok) => setTimeout(ok, 300));
    const s = KN.store.get();
    return { titles: s.todos.map((x) => x.title), memo: s.archive.days[0].memo, size: s.settings.textSize,
      mark: JSON.parse(localStorage.getItem("kn-replica")).settings.textSize };
  });
  t.check("写しのデータは書き換わらない", other.titles.join() === "iPhoneの用事" && other.memo === "写しの日記", JSON.stringify(other));
  t.check("設定は残り、印に書く", other.size === "l" && other.mark === "l", JSON.stringify(other));

  /* 版が変われば読み直す。 */
  latest = await iphone(B, "iPhoneで直した", "写しの日記の続き");
  rev = "r2";
  const got = await B.evaluate(async () => [await KN.replica.refresh(), KN.store.get().todos.map((x) => x.title).join(), KN.store.get().settings.textSize]);
  t.check("版が変われば写しを読み直す（設定はそのまま）", got[0] === true && got[1] === "iPhoneで直した" && got[2] === "l", JSON.stringify(got));
  const same = await B.evaluate(() => KN.replica.refresh());
  t.check("版が同じなら読まない", same === false, String(same));

  /* 開き直しても写し（大きな保存場所の写しから、すぐ）。 */
  await B.reload();
  await booted(B);
  const again = await B.evaluate(() => KN.store.get().todos.map((x) => x.title).join());
  t.check("開き直しても写しのまま", again === "iPhoneで直した", again);
  await B.click(".tab-archive");
  await B.waitForTimeout(800);
  await B.evaluate(() => KN.dropbox.sync());
  await B.waitForTimeout(500);

  /* 閉じて、ほかの頁で比べる。 */
  await B.goto(plain);
  await B.waitForTimeout(800);
  const end = await dump(B);
  t.check("写しのあいだ、記録（kaimono-note-v2）は一字も変わらない", end.live === before.live);
  t.check("写しのあいだ、自動の控え・日記の写し・過去のやることの棚・meta は変わらない", end.idb === before.idb,
    JSON.stringify({ before: before.counts, end: end.counts }));
  const sent = puts.filter((p) => /^\/(kurashi-latest\.json|daily\/|glance\.json|inbox\/)/.test(p));
  t.check("Dropbox へ控え・小窓・受け箱を置かない", !sent.length, sent.join(" "));

  /* 切れば前からの記録のまま。 */
  await B.goto(URL);
  await booted(B);
  await B.evaluate(() => KN.replica.disable());
  await B.waitForTimeout(2500);
  await booted(B);
  const back = await B.evaluate(() => ({ rep: KN.store.replica(), cls: document.documentElement.classList.contains("is-replica"),
    titles: KN.store.get().todos.map((x) => x.title), memo: (KN.store.get().archive.days[0] || {}).memo || null }));
  t.check("切れば前からの記録のまま開く", !back.rep && !back.cls && back.titles.includes("端末の用事") && !back.titles.includes("iPhoneで直した")
    && back.memo === "端末の日記", JSON.stringify(back));

  t.check("エラーなし", !errors.length, errors.join(" | "));
  t.done();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
