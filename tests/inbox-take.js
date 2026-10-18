/* 職場の「足すだけ」受け箱 inbox/（docs/todo-items.md 段4・X29 の③）。

   Dropbox は page.route で偽に。PC は inboxPost 入で一件ずつ置く・iPhone（控えを送る端末）は開いたとき
   取り込んで消す。PC は取り込まない。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("受け箱 inbox/");
  const { browser, page, errors } = await open();
  const files = new Map();
  const deleted = [];
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (route, status, obj) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) });
  await page.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const u = new URL(req.url());
    if (u.pathname === "/oauth2/token") return json(route, 200, { access_token: "acc", expires_in: 14400, token_type: "bearer", refresh_token: "ref" });
    if (u.pathname === "/2/files/upload") {
      const arg = JSON.parse(req.headers()["dropbox-api-arg"]);
      files.set(arg.path, { mode: arg.mode, body: req.postData() });
      return json(route, 200, { name: arg.path.slice(1), rev: "r" });
    }
    if (u.pathname === "/2/files/list_folder") {
      const body = JSON.parse(req.postData() || "{}");
      if (body.path !== "/inbox") return json(route, 200, { entries: [], has_more: false, cursor: "c" });
      const entries = [...files.keys()].filter((k) => k.startsWith("/inbox/") && !deleted.includes(k))
        .map((k) => ({ ".tag": "file", name: k.slice(7) }));
      return json(route, 200, { entries, has_more: false, cursor: "c" });
    }
    if (u.pathname === "/2/files/download") {
      const arg = JSON.parse(req.headers()["dropbox-api-arg"]);
      const f = files.get(arg.path);
      return f ? route.fulfill({ status: 200, headers: cors, body: f.body }) : json(route, 409, { error_summary: "path/not_found/.." });
    }
    if (u.pathname === "/2/files/delete_v2") {
      deleted.push(JSON.parse(req.postData()).path);
      return json(route, 200, { metadata: {} });
    }
    if (u.pathname === "/2/files/get_metadata") return json(route, 409, { error_summary: "path/not_found/.." });
    return json(route, 200, { entries: [], has_more: false, cursor: "c" });
  });

  await page.evaluate(() => KN.dropbox.setAppKey("testkey123"));
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.dropbox.finish("the-code"));

  t.check("既定は切", (await page.evaluate(() => KN.store.get().settings.inboxPost)) === false);

  /* PC：入にして置く。 */
  await page.evaluate(() => KN.store.update((x) => { x.settings.inboxPost = true; }));
  await page.evaluate(() => KN.dropbox.inboxPut("請求書を送る"));
  await page.evaluate(() => KN.dropbox.inboxPut("会議 10時"));
  const keys = [...files.keys()].filter((k) => k.startsWith("/inbox/"));
  t.check("一件ずつ inbox/ に・上書きしない", keys.length === 2 && keys.every((k) => files.get(k).mode === "add"), keys.join());
  t.check("PC は取り込まない", (await page.evaluate(() => KN.dropbox.inboxTake())) === 0 && deleted.length === 0);

  /* iPhone：切にして取り込む。 */
  await page.evaluate(() => KN.store.update((x) => { x.settings.inboxPost = false; }));
  const n = await page.evaluate(() => KN.dropbox.inboxTake());
  const todos = await page.evaluate(() => KN.store.get().todos.map((x) => ({ title: x.title, side: x.side, kind: x.kind, time: x.time })));
  t.check("二件取り込み、受け箱から消す", n === 2 && deleted.length === 2, JSON.stringify([n, deleted]));
  t.check("仕事の用事として入る", todos.some((x) => x.title === "請求書を送る" && x.side === "work"), JSON.stringify(todos));
  t.check("時刻があれば予定", todos.some((x) => x.kind === "event" && x.time === "10:00" && x.side === "work"), JSON.stringify(todos));
  t.check("二度は取り込まない", (await page.evaluate(() => KN.dropbox.inboxTake())) === 0 && todos.length === (await page.evaluate(() => KN.store.get().todos.length)));

  t.check("JS のエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
