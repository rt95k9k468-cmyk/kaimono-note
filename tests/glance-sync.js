/* ショートカットの小窓へ写す glance.json（docs/todo-items.md 段4・X29 の①）。

   Dropbox は page.route で偽に。既定は切・書くのは今日の予定と今週の印だけ・「仕事だけ」が既定・
   いつも上書き・kurashi-latest.json とは別。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("glance.json を写す");
  const { browser, page, errors } = await open();
  const files = new Map();
  const calls = [];
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (route, status, obj) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) });
  await page.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const u = new URL(req.url());
    if (u.pathname === "/oauth2/token") return json(route, 200, { access_token: "acc", expires_in: 14400, token_type: "bearer", refresh_token: "ref" });
    if (u.pathname === "/2/files/upload") {
      const arg = JSON.parse(req.headers()["dropbox-api-arg"]);
      calls.push({ arg, body: req.postData() });
      files.set(arg.path, req.postData());
      return json(route, 200, { name: arg.path.slice(1), rev: "r" + calls.length });
    }
    if (u.pathname === "/2/files/get_metadata") return json(route, 409, { error_summary: "path/not_found/.." });
    return json(route, 200, { entries: [], has_more: false, cursor: "c" });
  });
  const glanceCalls = () => calls.filter((c) => c.arg.path === "/glance.json");

  await page.evaluate(() => {
    const S = KN.store, d = KN.util.todayKey();
    S.addTodo({ title: "会議", due: d, time: "10:00", kind: "event", side: "work" });
    S.addTodo({ title: "歯医者", due: d, time: "15:00", kind: "event" });
    S.addTodo({ title: "資料を直す", due: d, side: "work", weekMark: d });
    S.addTodo({ title: "洗濯", due: d, weekMark: d });
    S.addTodo({ title: "印の無い用事", due: d, side: "work" });
    KN.dropbox.setAppKey("testkey123");
  });
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.dropbox.finish("the-code"));

  const st = await page.evaluate(() => KN.store.get().settings);
  t.check("既定は切、仕事だけは入", st.glance === false && st.glanceWork === true, JSON.stringify([st.glance, st.glanceWork]));
  t.check("切のあいだは glance.json を書かない", (await page.evaluate(() => KN.dropbox.glance(true))) === "off" && glanceCalls().length === 0);

  await page.evaluate(() => KN.store.update((x) => { x.settings.glance = true; }));
  t.check("入にすると書く", (await page.evaluate(() => KN.dropbox.glance(true))) === "sent" && glanceCalls().length === 1);
  const a = JSON.parse(files.get("/glance.json"));
  t.check("フォルダ直下・上書き", glanceCalls()[0].arg.path === "/glance.json" && glanceCalls()[0].arg.mode === "overwrite");
  t.check("仕事の予定だけ（時刻・名前・side）", a.events.length === 1 && a.events[0].name === "会議" && a.events[0].time === "10:00" && a.events[0].side === "work", JSON.stringify(a));
  t.check("今週の印は名前だけ・仕事だけ", a.marks.length === 1 && a.marks[0] === "資料を直す" && !!a.at && a.workOnly === true, JSON.stringify(a));
  t.check("期限・数は入れない", !/deadline|count|slips/.test(files.get("/glance.json")));
  t.check("kurashi-latest.json には書かない（別のファイル）", !files.has("/kurashi-latest.json") || !files.get("/kurashi-latest.json").includes('"marks"'));

  await page.evaluate(() => KN.store.update((x) => { x.settings.glanceWork = false; }));
  await page.evaluate(() => KN.dropbox.glance(true));
  const b = JSON.parse(files.get("/glance.json"));
  t.check("仕事だけを切ると、くらしも写す", b.events.length === 2 && b.events[1].side === "life" && b.marks.length === 2 && b.workOnly === false, JSON.stringify(b));

  t.check("変わらず間もなければ送り直さない", (await page.evaluate(() => KN.dropbox.glance(true))) === "same");
  t.check("JS のエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
