/* Dropbox へ自動で送る（2026年9月28日、docs/storage.md の「Dropbox へ送る」）。

   本物の Dropbox には繋がない。api.dropboxapi.com / content.dropboxapi.com を
   page.route で受けて、Dropbox のふりをする。 */
const crypto = require("crypto");
const { open, checker } = require("./lib");

(async () => {
  const t = checker("Dropbox へ送る");
  const { browser, page, errors } = await open();

  const files = new Map();       // path → 中身
  const calls = [];              // { path, arg, body }
  let tokenBodies = [];
  let expireNext = false;        // 次の upload で 401 を返す
  let refreshDead = false;       // refresh を invalid_grant で断る
  let accessN = 0;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (route, status, obj) =>
    route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) });

  await page.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const u = new URL(req.url());
    const h = req.headers();
    if (u.pathname === "/oauth2/token") {
      const f = Object.fromEntries(new URLSearchParams(req.postData() || ""));
      tokenBodies.push(f);
      if (f.grant_type === "refresh_token" && refreshDead) return json(route, 400, { error: "invalid_grant" });
      accessN++;
      const out = { access_token: `acc-${accessN}`, expires_in: 14400, token_type: "bearer" };
      if (f.grant_type === "authorization_code") out.refresh_token = "ref-1";
      return json(route, 200, out);
    }
    calls.push({ path: u.pathname, auth: h.authorization, arg: h["dropbox-api-arg"] ? JSON.parse(h["dropbox-api-arg"]) : null, body: req.postData() });
    if (u.pathname === "/2/files/upload") {
      if (expireNext) { expireNext = false; return json(route, 401, { error_summary: "expired_access_token/" }); }
      const arg = JSON.parse(h["dropbox-api-arg"]);
      if (arg.mode === "add" && files.has(arg.path)) return json(route, 409, { error_summary: "path/conflict/file/.." });
      files.set(arg.path, req.postData());
      return json(route, 200, { name: arg.path.split("/").pop() });
    }
    if (u.pathname === "/2/files/list_folder") {
      const entries = [...files.keys()].filter((p) => p.startsWith("/daily/"))
        .map((p) => ({ ".tag": "file", name: p.slice(7), server_modified: "2026-10-05T03:00:00Z", size: files.get(p).length }));
      return json(route, 200, { entries, has_more: false, cursor: "c" });
    }
    if (u.pathname === "/2/files/get_metadata") {
      const { path } = JSON.parse(req.postData());
      if (!files.has(path)) return json(route, 409, { error_summary: "path/not_found/.." });
      return json(route, 200, { ".tag": "file", name: path.slice(1), server_modified: "2026-10-06T03:00:00Z", size: files.get(path).length });
    }
    if (u.pathname === "/2/files/download") {
      const arg = JSON.parse(h["dropbox-api-arg"]);
      if (!files.has(arg.path)) return json(route, 409, { error_summary: "path/not_found/.." });
      return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "application/octet-stream" }, body: files.get(arg.path) });
    }
    if (u.pathname === "/2/files/delete_v2") {
      const { path } = JSON.parse(req.postData());
      files.delete(path);
      return json(route, 200, {});
    }
    if (u.pathname === "/2/auth/token/revoke") return json(route, 200, {});
    return json(route, 404, { error_summary: "unknown" });
  });

  const uploads = () => calls.filter((c) => c.path === "/2/files/upload");

  // 1. つなぐ前は何も送らない・紙に三行
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップ" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".set-layer:last-child .set-row", { hasText: "Dropbox へ自動で送る" }).first().click();
  await page.waitForTimeout(400);
  const rows = await page.locator(".set-layer:last-child .set-row").allTextContents();
  t.check("つなぐ前の紙に「Dropbox でゆるす」「出てきたコードを貼る」",
    rows.some((r) => r.includes("Dropbox でゆるす")) && rows.some((r) => r.includes("出てきたコードを貼る")), rows.join(" / "));
  t.check("つなぐ前は送らない", (await page.evaluate(() => KN.dropbox.sync())) === "off" && calls.length === 0);

  // 2. App key を入れると、ゆるす URL（PKCE・offline）ができる
  await page.evaluate(() => KN.dropbox.setAppKey("testkey123"));
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  const auth = new URL(await page.evaluate(() => KN.dropbox.authUrl()));
  t.check("ゆるす URL は client_id・S256・offline・redirect なし",
    auth.origin === "https://www.dropbox.com" && auth.searchParams.get("client_id") === "testkey123"
      && auth.searchParams.get("code_challenge_method") === "S256"
      && auth.searchParams.get("token_access_type") === "offline"
      && !auth.searchParams.has("redirect_uri"), auth.toString());

  // 3. コードを貼る → 鍵を受け取る。記録が空なら送らない（B2：新しい端末で空の中身を送らない）
  const r0 = await page.evaluate(() => KN.dropbox.finish("  the-code  "));
  t.check("記録が空ならつないでも送らない", r0 === "empty" && uploads().length === 0, r0);
  // 中身ができたら、最初の控えを送る
  await page.evaluate(() => KN.store.addTodo({ title: "Dropbox の試験のやること" }));
  const r1 = await page.evaluate(() => KN.dropbox.sync());
  const tb = tokenBodies[0] || {};
  const want = crypto.createHash("sha256").update(tb.code_verifier || "").digest("base64url");
  t.check("コードの交換：合言葉の指紋が URL の challenge と合う",
    tb.code === "the-code" && tb.client_id === "testkey123" && want === auth.searchParams.get("code_challenge"));
  t.check("つないだら送る（sent）", r1 === "sent", r1);
  t.check("最新は上書き・日付は add で、同じ中身",
    uploads().length === 2 && uploads()[0].arg.path === "/kurashi-latest.json" && uploads()[0].arg.mode === "overwrite"
      && /^\/daily\/kurashi-\d{4}-\d{2}-\d{2}\.json$/.test(uploads()[1].arg.path) && uploads()[1].arg.mode === "add"
      && uploads()[0].body === uploads()[1].body, JSON.stringify(uploads().map((u) => u.arg)));
  const sent = JSON.parse(files.get("/kurashi-latest.json"));
  const inspect = await page.evaluate((txt) => { const r = KN.store.inspectBackup(txt); return !!(r && r.ok !== false); }, files.get("/kurashi-latest.json"));
  t.check("送った中身は「バックアップを保存」と同じ形（復元で読める）", sent.app === "kaimono-note" && !!sent.exportedAt && inspect);
  const leak = await page.evaluate(() => {
    const live = localStorage.getItem("kaimono-note-v2") || "";
    return live.includes("ref-1") || KN.store.exportJSON().includes("ref-1");
  });
  t.check("鍵は記録にも書き出しにも乗らない", !leak && !files.get("/kurashi-latest.json").includes("ref-1"));
  t.check("日付の名前はローカルの今日", uploads()[1].arg.path.includes(await page.evaluate(() => KN.util.todayKey())));

  // 4. 変わっていなければ送らない
  const r2 = await page.evaluate(() => KN.dropbox.sync());
  t.check("同じ中身なら送らない", r2 === "same" && uploads().length === 2, r2);

  // 5. 書き換えたら、最新だけ送る（日付の控えは上書きしない）
  const dayBody = files.get(uploads()[1].arg.path);
  await page.evaluate(() => KN.store.update((s) => { s.settings.dropboxTestMark = 1; }));
  const r3 = await page.evaluate(() => KN.dropbox.sync());
  t.check("書き換えたら最新だけ送る", r3 === "sent" && uploads().length === 3 && uploads()[2].arg.path === "/kurashi-latest.json", r3);
  t.check("日付の控えはその日はじめての中身のまま", files.get(uploads()[1].arg.path) === dayBody);

  // 6. 日が変わる：日付の控えを足し、新しい30個と月の背骨（各月で最初の一つを12か月）を残す（ほかの名前は消さない）
  for (let i = 0; i < 34; i++) {
    const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    files.set(`/daily/kurashi-${d}.json`, "{}");
  }
  // 背骨の試し：2023年12月〜2024年12月の13か月に、5日と20日の二つずつ
  const months = [];
  for (let i = 0; i < 13; i++) {
    const m = new Date(Date.UTC(2023, 11 + i, 1)).toISOString().slice(0, 7);
    months.push(m);
    files.set(`/daily/kurashi-${m}-05.json`, "{}");
    files.set(`/daily/kurashi-${m}-20.json`, "{}");
  }
  files.set("/daily/my-notes.json", "{}");
  await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem("kaimono-note-dropbox"));
    v.lastDay = "2000-01-01";
    localStorage.setItem("kaimono-note-dropbox", JSON.stringify(v));
  });
  // モジュールは置き場を開いたときに一度だけ読むので、読み直して覚えさせる
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.dropbox && KN.store);
  await page.waitForTimeout(300);
  const before = uploads().length;
  const r4 = await page.evaluate(() => KN.dropbox.sync());
  const dailyNames = [...files.keys()].filter((p) => /^\/daily\/kurashi-/.test(p)).sort();
  t.check("日が変わると日付の控えを足す（最新は同じなので送らない）",
    r4 === "sent" && uploads().length === before + 1 && uploads()[before].arg.mode === "add", `${r4} ${uploads().length - before}`);
  const has = (d) => files.has(`/daily/kurashi-${d}.json`);
  const recent = [];
  for (let i = 5; i < 34; i++) recent.push(new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
  t.check("新しい30個は残る（今日の控えがいちばん新しい）", recent.every(has)
    && dailyNames[dailyNames.length - 1].includes(await page.evaluate(() => KN.util.todayKey())), dailyNames.slice(-2).join(" "));
  // 控えのある月は 2023年12月〜2024年12月・2025年1〜2月・今日の月の16か月。新しい12か月は2024年4月から
  const spine = months.slice(4).map((m) => `${m}-05`).concat("2025-01-01");
  t.check("月の背骨：各月で最初の一つが、新しい12か月ぶん残る（30個の外でも）", spine.every(has),
    spine.filter((d) => !has(d)).join(" "));
  const gone = months.slice(4).map((m) => `${m}-20`)
    .concat(...months.slice(0, 4).map((m) => [`${m}-05`, `${m}-20`]))
    .concat(["2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05"]);
  t.check("ほかは消える：月の二つ目・12か月より前の月・30個の外", !gone.some(has), gone.filter(has).join(" "));
  t.check("日付の控えは30個＋背骨10個・ほかの名前は残る", dailyNames.length === 40 && files.has("/daily/my-notes.json"),
    dailyNames.length + " " + dailyNames[0]);

  // 7. 鍵が古い（401）→ 取り直してもう一度
  expireNext = true;
  await page.evaluate(() => KN.store.update((s) => { s.settings.dropboxTestMark = 2; }));
  const nTok = tokenBodies.length;
  const r5 = await page.evaluate(() => KN.dropbox.sync());
  t.check("401 なら鍵を取り直して送る", r5 === "sent" && tokenBodies.length === nTok + 1
    && tokenBodies[nTok].grant_type === "refresh_token" && tokenBodies[nTok].refresh_token === "ref-1", r5);

  // 8. 本文を外した日が残っているあいだは、上書きしない
  const n8 = uploads().length;
  const r6 = await page.evaluate(() => {
    const keep = KN.store.memoOut;
    KN.store.update((s) => { s.settings.dropboxTestMark = 3; });
    const days = KN.store.get().archive.days;
    days.push({ date: "2020-01-01", memo: "", memoOut: true });
    return KN.dropbox.sync().then((r) => { days.pop(); return r; });
  });
  t.check("本文の無い日が残っていれば送らない", r6 === "held" && uploads().length === n8, r6);

  // 9. Dropbox の側で外された（invalid_grant）→ 鍵を捨てて、つなぎ直しを頼む
  refreshDead = true;
  expireNext = true;
  const r7 = await page.evaluate(() => KN.dropbox.sync());
  const st = await page.evaluate(() => KN.dropbox.status());
  t.check("invalid_grant で鍵を捨て、つなぎ直しを頼む", r7 === "failed" && !st.connected && st.needsAuth,
    JSON.stringify(st));
  t.check("送れなかったあとも記録はそのまま", (await page.evaluate(() => KN.store.get().settings.dropboxTestMark)) === 3);

  // 10. つなぎ直して、切る：鍵を捨て、Dropbox のファイルは残す
  refreshDead = false;
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.dropbox.finish("code-2"));
  const kept = files.size;
  await page.evaluate(() => KN.dropbox.disconnect());
  const raw = await page.evaluate(() => localStorage.getItem("kaimono-note-dropbox"));
  t.check("切ると鍵は残らず、ファイルは消さない", !raw.includes("ref-1") && files.size === kept
    && calls.some((c) => c.path === "/2/auth/token/revoke"));
  t.check("切ったあとは送らない", (await page.evaluate(() => KN.dropbox.sync())) === "off");

  // 11. 「すべて削除」相当の reset でも、つながりの覚え（App key）は store の外
  t.check("App key は store の外に残る", (await page.evaluate(() => KN.dropbox.status().appKey)) === "testkey123");

  // 12. Dropbox の控えから戻す（B2）：並び（最新が先・日付は新しい順・ほかの名前は出ない）→ 読む → 確かめて戻す
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.dropbox.finish("code-3"));
  const list = await page.evaluate(() => KN.dropbox.backups());
  const nList = 1 + [...files.keys()].filter((p) => /^\/daily\/kurashi-/.test(p)).length;   // 最新＋日付の控え（背骨も）
  t.check("控えの並び：最新が先、日付の控えは新しい順、ほかの名前は出ない",
    list.length === nList && nList === 41 && list[0].latest && list[0].path === "/kurashi-latest.json"
      && list.slice(1).every((f, i, a) => !i || a[i - 1].day > f.day) && !list.some((f) => /my-notes/.test(f.path)),
    JSON.stringify(list.slice(0, 3)));
  const dl = await page.evaluate(() => KN.dropbox.download("/kurashi-latest.json"));
  t.check("控えを読める（送った中身のまま）", dl === files.get("/kurashi-latest.json"));
  const bad = await page.evaluate(() => KN.dropbox.download("/daily/my-notes.json").then(() => "ok", (e) => e.message));
  t.check("二つの形の名前のほかは読まない", bad !== "ok", bad);
  const before12 = await page.evaluate(() => KN.store.get().todos.length);
  await page.evaluate(() => KN.store.addTodo({ title: "戻すと消えるやること" }));
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(400);
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップ" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".set-layer:last-child .set-row", { hasText: "Dropbox へ自動で送る" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".set-layer:last-child .set-row", { hasText: "Dropbox の控えから戻す" }).first().click();
  await page.waitForTimeout(500);
  const sheetRows = await page.locator(".set-layer:last-child .row-title").allTextContents();
  t.check("紙に控えが並び、最新に（最新）", sheetRows.length === nList && /（最新）/.test(sheetRows[0]), sheetRows.slice(0, 2).join(" / "));
  await page.locator(".set-layer:last-child button.row").first().click();
  await page.waitForSelector(".js-ok", { timeout: 4000 });
  const ask = await page.evaluate(() => document.body.innerText);
  t.check("戻す前に中身を見せて訊く", /復元しますか/.test(ask) && /いまの記録/.test(ask), "");
  await page.locator(".js-ok").last().click();
  await page.waitForTimeout(800);
  const after12 = await page.evaluate(() => ({
    n: KN.store.get().todos.length,
    gone: !KN.store.get().todos.some((x) => x.title === "戻すと消えるやること"),
    kept: KN.backup.list().some((s) => s.reason === "復元前"),
  }));
  t.check("戻すと Dropbox の中身になり、戻す前は控えに", after12.n === before12 && after12.gone && after12.kept, JSON.stringify(after12));

  t.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
