/* PC で iPhone の写し glance.json を見る（docs/todo-items.md 段4の④）。Dropbox は page.route で偽に。
   受け箱へ置く端末（inboxPost 入）だけが読む・読むだけ（書かない・消さない）。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("glance.json を PC で見る");
  const { browser, page, errors } = await open({ weekFirst: true });
  const calls = [];
  const body = JSON.stringify({ v: 1, day: "2026-10-18", at: "2026-10-18T01:05:00Z", workOnly: true,
    events: [{ time: "10:00", name: "写しの会議", side: "work", id: "t-ev", due: "2026-10-18" }], marks: ["写しの資料"],
    todo: [{ name: "写しの資料", id: "t-mk", due: null }], later: [{ name: "写しのこれから", id: "t-lt", due: null }] });
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (route, status, obj) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) });
  await page.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const u = new URL(req.url());
    calls.push(u.pathname);
    if (u.pathname === "/2/files/upload" || u.pathname.includes("delete")) calls.push("W:" + (req.headers()["dropbox-api-arg"] || req.postData() || ""));
    if (u.pathname === "/oauth2/token") return json(route, 200, { access_token: "acc", expires_in: 14400, token_type: "bearer", refresh_token: "ref" });
    if (u.pathname === "/2/files/download") return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "text/plain" }, body });
    if (u.pathname === "/2/files/get_metadata") return json(route, 409, { error_summary: "path/not_found/.." });
    return json(route, 200, { entries: [], has_more: false, cursor: "c" });
  });
  await page.evaluate(() => KN.store.addTodo({ title: "ふつうの用事" }));
  await page.evaluate(() => KN.dropbox.setAppKey("testkey123"));
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.dropbox.finish("the-code"));

  t.check("受け箱を使わない端末は読まない", (await page.evaluate(() => KN.dropbox.glanceRead(true))) === null && !calls.includes("/2/files/download"));
  await page.evaluate(() => KN.store.update((x) => { x.settings.inboxPost = true; }));
  const d = await page.evaluate(() => KN.dropbox.glanceRead(true));
  t.check("入なら写しを読む", !!d && d.events[0].name === "写しの会議" && d.marks[0] === "写しの資料", JSON.stringify(d));
  t.check("読むだけ（upload・delete をしない）", !calls.some((p) => /^W:.*(glance|inbox)/.test(p) || /delete/.test(p)), calls.join());

  await page.waitForTimeout(500);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(600);
  if (!(await page.locator(".day-slide.wk").count())) { await page.click('.wk-faces .seg-btn[data-face="week"]'); await page.waitForTimeout(600); }
  await page.waitForTimeout(800);
  await page.waitForSelector(".wk-copy", { timeout: 5000 }).catch(() => {});
  const txt = await page.evaluate(() => (document.querySelector(".wk-copy") || {}).textContent || "");
  t.check("週の面に写しが出る（予定・印・何時の写しか）", /写しの会議/.test(txt) && /写しの資料/.test(txt) && /の写し/.test(txt), txt);

  /* 戻す道（段4の②）：丸は済ませる、これからの名前は 今週へ。どちらも受け箱に op- を一件置く。 */
  const ops = () => calls.filter((c) => /^W:.*\/inbox\/op-/.test(c));
  await page.click('.wk-copy .wk-row:has-text("写しの資料") .check');
  await page.waitForTimeout(600);
  const dimmed = await page.evaluate(() => !!document.querySelector(".wk-copy .wk-row.is-sent"));
  t.check("丸で済ませる命令を置き、行は薄く", ops().length === 1 && dimmed, calls.join());
  await page.click(".wk-copy .wk-later-h");
  await page.waitForTimeout(400);
  await page.click('.wk-copy .wk-name:has-text("写しのこれから")');
  await page.waitForTimeout(400);
  const chips = await page.evaluate(() => [...document.querySelectorAll(".note-pop .pk-acts .chip")].map((b) => b.textContent.trim() || b.type));
  t.check("これからの小窓に 今週へ・今日・明日・日を選ぶ", /今週へ/.test(chips.join()) && /明日/.test(chips.join()) && chips.includes("date"), chips.join());
  await page.click('.note-pop .chip[data-op="week"]');
  await page.waitForTimeout(600);
  t.check("今週へで命令をもう一件", ops().length === 2, calls.join());
  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
