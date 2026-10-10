/* 端末の外の控えの見張り（R25）。

   記録が少ないうちは点を出さない・外の控えが一つも無ければ点・書き出しが新しければ
   消える・14日たてば点・Dropbox をつないで送れないまま3日で点（14日より前でも）・
   点は歯車の ::before で赤ではない・設定の頭に一行が出て押すとバックアップへ・
   トーストは出さない。記録の中身は書き換えない（lastExportAt の日付だけ動かす）。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("offdevice-watch");
  /* 時計は昼に止め、「昨日」「15日前」もその時計から作る（壁の時計だと 0:00 の前後でずれる。roadmap-seamless の N10）。 */
  const NOW = new Date(2026, 9, 1, 12, 0).getTime();
  const { browser, page, errors } = await open({ before: async (cx, p) => { await p.clock.setFixedTime(NOW); } });
  const dot = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() =>
    r(document.querySelector("#head .js-settings").classList.contains("has-dot"))))));
  const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
  const setExport = (iso) => page.evaluate((x) => KN.store.update((s) => { s.settings.lastExportAt = x; }), iso);

  t.check("記録が少ないうちは点を出さない", !(await dot()));

  await page.evaluate(() => { for (let i = 0; i < 5; i++) KN.store.addTodo({ title: `控えの試し${i}` }); });
  t.check("記録が五つになって、外の控えが一つも無ければ点", await dot());
  t.check("点は赤ではない（塗りは --c-primary-fill）", await page.evaluate(() => {
    const bg = getComputedStyle(document.querySelector("#head .js-settings"), "::before").backgroundColor;
    const want = getComputedStyle(document.documentElement).getPropertyValue("--c-primary-fill").trim();
    const probe = document.createElement("i"); probe.style.color = want; document.body.append(probe);
    const ok = getComputedStyle(probe).color === bg; probe.remove(); return ok;
  }));
  t.check("歯車の読み上げも変わる", (await page.getAttribute("#head .js-settings", "aria-label")).includes("控え"));

  await setExport(daysAgo(1));
  t.check("書き出しが昨日なら点は消える", !(await dot()));
  await setExport(daysAgo(13));
  t.check("13日前ならまだ出さない", !(await dot()));
  await setExport(daysAgo(15));
  t.check("15日前なら点", await dot());

  /* 設定の頭に一行。 */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await page.waitForTimeout(250);
  const first = await page.locator(".set-layer:last-child .set-row").first().innerText();
  t.check("設定の頭に「端末の外の控えが15日前のままです」", first.includes("端末の外の控えが15日前のままです"), first);
  await page.locator(".set-layer:last-child .set-row").first().click();
  await page.waitForFunction(() => document.querySelectorAll(".set-layer").length >= 2);
  await page.waitForTimeout(300);
  t.check("押すとバックアップへ", (await page.locator(".set-layer:last-child").innerText()).includes("バックアップを保存"));
  t.check("トーストは出さない", (await page.locator(".toast").count()) === 0
    || !(await page.locator(".toast").allInnerTexts()).some((x) => x.includes("控え")));

  /* Dropbox：つないでいて、送れないまま3日。 */
  await setExport(daysAgo(20));
  const stuck = await page.evaluate((iso) => {
    const real = KN.dropbox.status;
    KN.dropbox.status = () => ({ ...real(), connected: true, lastAt: iso, error: "試験の失敗", errorAt: new Date().toISOString() });
    const x = KN.backup.offDeviceStale();
    KN.dropbox.status = () => ({ ...real(), connected: true, lastAt: new Date(Date.now() - 86400000).toISOString(), error: "" });
    const y = KN.backup.offDeviceStale();
    KN.dropbox.status = real;
    return { x, y };
  }, daysAgo(4));
  t.check("Dropbox が4日送れていなければ（14日より前でも）点、言い方は「送れていません」",
    !!stuck.x && stuck.x.stuck && stuck.x.days === 4, JSON.stringify(stuck.x));
  t.check("Dropbox に昨日届いていれば、手の書き出しが古くても出さない", stuck.y === null, JSON.stringify(stuck.y));

  t.check("記録の中身は変えていない（やること5件のまま）", await page.evaluate(() => KN.store.get().todos.length === 5));
  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
