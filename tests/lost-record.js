/* 記録が見当たらない日（2026年10月6日、docs/storage.md）。

   iPhone が localStorage だけを丸ごと落とした日の再現。大きな保存場所（控え・
   Dropbox の設定の写し）は残っている。
   - 初めて開いた日（控えなし）は訊かない・印なし。
   - localStorage を消して開くと「記録が見当たりません」と訊く。印が立ち、
     時刻で取る控え（離れる前）は増えず、Dropbox は "held"（上書きしない）。
   - Dropbox の設定は写しから戻る（つなぎ直し不要）。
   - 「あとで」→「あとで」は印が残り、開き直すとまた訊く。
   - 「戻す」で記録が戻り、印が消え、開き直しても訊かない。Dropbox も見合わせない。
   Dropbox への通信は全部止めてある。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/lost-record.js */
const { open, checker, URL } = require("./lib");

(async () => {
  const t = checker("lost-record");
  const { browser, ctx, page, errors } = await open({
    before: async (c) => {
      await c.route(/dropbox(api)?\.com/, (r) => r.abort());
      await c.addInitScript(() => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        const d = "2026-10-06";
        localStorage.setItem("kaimono-note-v2", JSON.stringify({
          schema: 2,
          todos: Array.from({ length: 5 }, (_, i) => ({ id: "t" + i, title: "試験のやること" + i, due: d, done: false, archived: false, createdAt: d, order: i })),
        }));
        localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "試験の鍵", refresh: "試験の更新札" }));
      });
    },
  });

  const ready = async () => {
    await page.waitForFunction(() => window.KN && KN.store && KN.app);
    await page.waitForTimeout(300);
    await page.evaluate(() => KN.backup.checked());
  };
  const dialog = () => page.locator(".sheet-title, [class*=title]").filter({ hasText: "記録が見当たりません" });
  const press = (name) => page.getByRole("button", { name, exact: true }).last().click();
  /* 消す：アプリから離れて（離れる拍の書き出しを済ませて）から、同じ出どころの別の頁で消す。 */
  const wipe = async () => {
    await page.goto(URL + "manifest.webmanifest");
    await page.evaluate(() => localStorage.clear());
    await page.goto(URL);
    await ready();
  };

  await ready();
  t.check("初めての日は印なし", (await page.evaluate(() => KN.backup.lost())) === null);
  t.check("初めての日は訊かない", (await dialog().count()) === 0);
  await page.evaluate(() => KN.backup.snapshot("自動"));
  await page.waitForTimeout(500);   // Dropbox の設定の写しが書き終わるまで
  const snaps0 = await page.evaluate(() => KN.backup.list().length);
  t.check("控えが一つ以上ある", snaps0 >= 1, `snaps=${snaps0}`);

  await wipe();
  const s1 = await page.evaluate(async () => ({
    todos: KN.store.get().todos.length,
    lost: KN.backup.lost(),
    leave: await KN.backup.take("離れる前"),
    snaps: KN.backup.list().length,
    dbx: KN.dropbox.status(),
    sent: await KN.dropbox.sync(),
  }));
  t.check("消えた日は記録が空", s1.todos === 0, `todos=${s1.todos}`);
  t.check("消えた日は印が立つ", !!(s1.lost && s1.lost.at));
  t.check("時刻で取る控えは見合わせる", s1.leave === "held", s1.leave);
  t.check("控えの数は増えない", s1.snaps === snaps0, `${s1.snaps} / ${snaps0}`);
  t.check("Dropbox の設定は写しから戻る", s1.dbx.appKey === "試験の鍵" && s1.dbx.connected, JSON.stringify(s1.dbx));
  t.check("Dropbox は上書きを見合わせる", s1.sent === "held", s1.sent);
  await dialog().first().waitFor({ timeout: 3000 }).catch(() => {});
  t.check("消えた日は訊く", (await dialog().count()) > 0);

  await press("あとで");
  await page.waitForTimeout(600);
  await press("あとで");
  await page.waitForTimeout(600);
  t.check("あとで→あとで は印が残る", !!(await page.evaluate(() => KN.backup.lost())));

  await page.reload();
  await ready();
  await dialog().first().waitFor({ timeout: 3000 }).catch(() => {});
  t.check("開き直すとまた訊く", (await dialog().count()) > 0);
  if (process.env.KN_SHOT) await page.screenshot({ path: process.env.KN_SHOT });
  await press("戻す");
  await page.waitForFunction(() => KN.store.get().todos.length === 5, null, { timeout: 5000 }).catch(() => {});
  const s2 = await page.evaluate(async () => ({
    todos: KN.store.get().todos.length,
    lost: KN.backup.lost(),
  }));
  t.check("戻すと記録が戻る", s2.todos === 5, `todos=${s2.todos}`);
  t.check("戻すと印が消える", s2.lost === null);

  await page.reload();
  await ready();
  await page.waitForTimeout(800);
  const s3 = await page.evaluate(async () => ({ todos: KN.store.get().todos.length, lost: KN.backup.lost(), sent: await KN.dropbox.sync() }));
  t.check("開き直しても残る", s3.todos === 5);
  t.check("開き直しても訊かない", s3.lost === null && (await dialog().count()) === 0);
  t.check("Dropbox はもう見合わせない", s3.sent !== "held", s3.sent);

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
  void ctx;
})();
