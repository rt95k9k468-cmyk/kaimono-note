/* 写しの端末の印（docs/log/design-review.md 10節の P6c。js/replica.js の trouble）。Dropbox は台本が偽の返事をする。
   - ふだんは何も出さない（写しのあいだ、端末の外の控えの点も出ない）
   - 写しの元が置かれてから3日（old）・届かないまま3日（far）・字が壊れて読めない（fail、すぐ）だけ、歯車に点と設定の頭に一行
   - 一行に数を出さない。読めない控えが来ても見せている写しは変わらない。直れば消える
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/replica-mark.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("replica-mark");
  const { browser, ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
  const DAY = 86400000;
  let rev = "r1";
  let latest = "";
  let at = new Date().toISOString();
  let down = false;
  await ctx.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    const path = new (require("url").URL)(req.url()).pathname;
    const head = req.headers()["dropbox-api-arg"];
    const arg = head ? JSON.parse(head) : null;
    const body = !arg && req.postData() ? JSON.parse(req.postData()) : null;
    const where = (arg && arg.path) || (body && body.path) || "";
    const json = (status, v) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(v) });
    if (down) return json(500, { error_summary: "boom" });
    if (path === "/2/files/upload") return json(200, { rev: "x", name: where });
    if (where === "/kurashi-latest.json" && path === "/2/files/get_metadata") {
      return json(200, { ".tag": "file", rev, server_modified: at, size: latest.length });
    }
    if (where === "/kurashi-latest.json" && path === "/2/files/download") return route.fulfill({ status: 200, body: latest });
    if (path === "/2/files/list_folder") return json(200, { entries: [], cursor: "c", has_more: false });
    return json(409, { error_summary: "path/not_found/" });
  });

  /* 守るほどの記録（やること5件）。この端末は外へ控えを出したことがない＝写しでなければ控えの点が出る。 */
  const iphone = (title) => page.evaluate((title) => JSON.stringify({
    schema: KN.store.SCHEMA, app: "kaimono-note", exportedAt: new Date().toISOString(),
    todos: [1, 2, 3, 4, 5].map((i) => ({ id: "t-ip" + i, title: title + i, due: KN.util.todayKey(), createdAt: KN.util.todayKey() })),
    archive: { days: [], entries: [] }, settings: {},
  }), title);
  latest = await iphone("iPhoneの用事");
  await page.evaluate(() => {
    localStorage.setItem("kaimono-note-dropbox", JSON.stringify({
      appKey: "k", refresh: "r", access: "a", expires: Date.now() + 864e5, sender: false,
    }));
    localStorage.setItem("kn-replica", JSON.stringify({ on: true }));
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.replica && KN.replica.on() && KN.store.get().todos.length === 5, null, { timeout: 15000 });
  await page.waitForTimeout(500);

  const look = async () => page.evaluate(async () => {
    await KN.replica.refresh();
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    const btn = document.querySelector("#head .js-settings");
    return { trouble: KN.replica.trouble(), dot: btn.classList.contains("has-dot"), why: btn.dataset.dot,
      titles: KN.store.get().todos.map((x) => x.title).join() };
  });
  const head = async () => {
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForTimeout(500);
    const rows = await page.evaluate(() => [...document.querySelectorAll("#screen-settings .is-alert-row")]
      .map((e) => e.textContent.trim()).filter(Boolean));
    await page.evaluate(() => KN.app.showScreen("todo"));
    await page.waitForTimeout(300);
    return rows;
  };

  let s = await look();
  t.check("ふだんは歯車に点を出さない（写しのあいだ、端末の外の控えの点も黙る）", !s.trouble && !s.dot, JSON.stringify(s));
  t.check("ふだんは設定の頭に何も出さない", !(await head()).length);

  /* 古い：写しの元が置かれてから3日。 */
  rev = "r2";
  at = new Date(Date.now() - 4 * DAY).toISOString();
  latest = await iphone("古い用事");
  s = await look();
  t.check("写しの元が3日より前なら点（old）", s.trouble === "old" && s.dot && s.why === "replica-old", JSON.stringify(s));
  let rows = await head();
  t.check("設定の頭に一行「iPhone の写しが古いままです」（数は出さない）",
    rows.some((r) => r.includes("iPhone の写しが古いままです")) && !rows.some((r) => /[0-9０-９]/.test(r)), rows.join(" | "));
  const two = await page.evaluate(() => KN.replica.trouble(Date.now() - 2 * 86400000 + 3600000));
  t.check("2日ほどなら出さない（送れないまま3日に揃える）", two === null, String(two));

  /* 届かない：その場では黙り、3日届かなければ点。 */
  rev = "r3";
  at = new Date().toISOString();
  latest = await iphone("新しい用事");
  s = await look();
  t.check("新しい写しが来れば消える", !s.trouble && !s.dot, JSON.stringify(s));
  down = true;
  s = await look();
  t.check("届かなかった直後は黙る", !s.trouble && !s.dot, JSON.stringify(s));
  const far = await page.evaluate(() => KN.replica.trouble(Date.now() + 4 * 86400000));
  t.check("届かないまま3日なら far", far === "far", String(far));
  down = false;

  /* 読めない：字が壊れていたら、すぐ。見せている写しはそのまま。 */
  rev = "r4";
  latest = "{壊れた";
  s = await look();
  t.check("壊れた控えはすぐ点（fail）・写しはそのまま", s.trouble === "fail" && s.why === "replica-fail" && s.titles.startsWith("新しい用事"), JSON.stringify(s));
  rows = await head();
  t.check("設定の頭に一行「iPhone の写しを読めませんでした」", rows.some((r) => r.includes("iPhone の写しを読めませんでした")), rows.join(" | "));

  rev = "r5";
  latest = await iphone("直った用事");
  s = await look();
  t.check("読めれば消える", !s.trouble && !s.dot && s.titles.startsWith("直った用事"), JSON.stringify(s));

  t.check("エラーなし", !errors.length, errors.join(" | "));
  t.done();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
