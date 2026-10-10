/* 週に一度の控え（settings-backup.js の nudge、2026年10月8日）。

   記録が少ないうちは出さない・手の書き出しから7日で出す・押すまで残る・一日に一度・
   開いて待てばひとりでに出る・「保存」で共有シート（押した流れのまま）→ 前回の書き出しが今日に・
   Dropbox に届いていても手の書き出しが古ければ出す。記録の中身は書き換えない。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("export-nudge");
  const { browser, page, errors } = await open({
    nudge: true, touch: true,
    before: (ctx) => ctx.addInitScript(() => {
      navigator.canShare = () => true;
      navigator.share = async (d) => { window.__shared = d.files[0].name; };
    }),
  });
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const setExport = (iso) => page.evaluate((x) => KN.store.update((s) => { s.settings.lastExportAt = x; }), iso);
  const fresh = () => page.evaluate(() => {
    localStorage.removeItem("kn-export-nudge");
    document.getElementById("toast-root").innerHTML = "";
  });
  const nudge = () => page.evaluate(() => KN.settingsParts.nudge());
  const toastText = () => page.evaluate(() => (document.querySelector(".toast:not(.is-out)") || {}).innerText || "");
  const ready = () => page.waitForFunction(() => KN.diaryIdb.settled() && (!KN.notes || KN.notes.settled()));

  await ready();
  await fresh();
  await nudge();
  t.check("記録が少ないうちは出さない", !(await toastText()).includes("週に一度"));

  await page.evaluate(() => { for (let i = 0; i < 5; i++) KN.store.addTodo({ title: `控えの試し${i}` }); });
  await setExport(daysAgo(6));
  await fresh();
  await nudge();
  t.check("書き出しが6日前なら出さない", !(await toastText()).includes("週に一度"));

  await setExport(daysAgo(8));
  await nudge();
  const shown = await toastText();
  t.check("8日前なら「週に一度の控え」", shown.includes("週に一度の控え"), shown);
  t.check("押せるのは「あとで」と「保存」", await page.evaluate(() =>
    [...document.querySelectorAll(".toast .toast-action")].map((b) => b.textContent.trim()).join(",") === "あとで,保存"));
  await page.waitForTimeout(6000);
  t.check("押すまで残る（6秒たっても出ている）", (await toastText()).includes("週に一度"));
  t.check("出した日を覚える", await page.evaluate(() => localStorage.getItem("kn-export-nudge") === KN.util.todayKey()));

  await page.locator(".toast .toast-action", { hasText: "あとで" }).click();
  await page.waitForTimeout(400);
  t.check("「あとで」で消える", !(await toastText()).includes("週に一度"));
  await nudge();
  t.check("同じ日にはもう出さない", !(await toastText()).includes("週に一度"));

  /* Dropbox に昨日届いていても、手の書き出しが古ければ出す（Dropbox と別の場所へ置くため）。 */
  await fresh();
  const viaDropbox = await page.evaluate((iso) => {
    const real = KN.dropbox.status;
    KN.dropbox.status = () => ({ ...real(), connected: true, lastAt: iso, error: "" });
    const stale = KN.backup.offDeviceStale();
    KN.settingsParts.nudge();
    KN.dropbox.status = real;
    return { stale, text: (document.querySelector(".toast") || {}).innerText || "" };
  }, daysAgo(1));
  t.check("Dropbox に昨日届いていても出す（歯車の点は出ない）",
    viaDropbox.stale === null && viaDropbox.text.includes("週に一度"), JSON.stringify(viaDropbox));

  /* 開いて待てば、ひとりでに出る。 */
  await fresh();
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  let appeared = true;
  try {
    await page.waitForFunction(() => /週に一度/.test((document.querySelector(".toast") || {}).innerText || ""), null, { timeout: 12000 });
  } catch (_) { appeared = false; }
  t.check("開いて少し待つと出る", appeared);

  await page.locator(".toast .toast-action", { hasText: "保存" }).click();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    shared: window.__shared || "",
    last: KN.backup.lastExportAt() || "",
    /* 頁の「今」と比べる（KN_CLOCK で頁の時計だけ差し替えたときも、台本の時計とずれない）。 */
    now: Date.now(),
    today: KN.util.todayKey(),
    toast: (document.querySelector(".toast:not(.is-out)") || {}).innerText || "",
  }));
  t.check("「保存」で共有シートにバックアップを渡す", /^kaimono-note-\d{8}\.json$/.test(after.shared), after.shared);
  t.check("前回の書き出しが今になる", Math.abs(after.now - new Date(after.last).getTime()) < 60000, after.last);
  t.check("「バックアップを書き出しました」", after.toast.includes("バックアップを書き出しました"), after.toast);
  await fresh();
  await nudge();
  t.check("書き出したあとは出さない", !(await toastText()).includes("週に一度"));

  t.check("記録の中身は変えていない（やること5件のまま）", await page.evaluate(() => KN.store.get().todos.length === 5));
  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
