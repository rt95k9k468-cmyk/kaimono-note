/* 日記だけの鍵（js/lock.js の lockDiary・ask・diarySheet、docs/daily.md の「鍵」）。

   daily の鍵を切って日記の鍵を入れると：daily に覆いは出ない・本文は出さず「開ける」・
   検索は日記を探さない・コピーは開けてから・押せば覆いが出て、やめれば元のまま・番号で開けば
   本文が出る・開けた紙は鍵が閉じると閉じる（本文はそのまま）・書き出しの入口も開けてから・
   設定に「日記」の入切・記録は一つも変わらない・絵文字なし。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-lock.js */
const { open, checker } = require("./lib");

const t = checker("diary-lock");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const WORD = "しおかぜ";

(async () => {
  const { browser, page, errors } = await open();

  const top = ".set-layer:last-child";
  const veil = () => page.evaluate(() => {
    const v = document.querySelector(".lock-veil");
    const on = !!v && !v.hidden && getComputedStyle(v).display !== "none";
    return { on, ask: on && v.classList.contains("is-ask") };
  });
  const show = async (id) => {
    await page.evaluate((i) => KN.app.showScreen(i), id);
    await page.waitForTimeout(400);
  };
  const answer = async (code) => {
    await page.waitForSelector(".sheet.is-open .js-input");
    await page.fill(".sheet.is-open .js-input", code);
    await page.click(".sheet.is-open .js-ok");
    await page.waitForTimeout(350);
  };
  const type = async (code) => {
    for (const k of code) await page.click(`.lock-key[data-k="${k}"]`);
    await page.waitForTimeout(400);
  };
  const plain = () => page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(KN.store.get()));
    ["lock", "lockDaily", "lockNotes", "lockDiary"].forEach((k) => delete s.settings[k]);
    return JSON.stringify(s);
  });
  const logText = () => page.evaluate(() => (document.querySelector("#screen-archive .arc-log") || {}).textContent || "");

  await page.evaluate((w) => KN.store.setDayLog(KN.util.todayKey(), { memo: w }), WORD);
  const before = await plain();

  /* ---- 番号を決めて、daily を切り、日記を入れる ---- */
  await show("archive");
  await show("settings");
  await page.waitForFunction(() => document.querySelector(".set-layer .set-row"));
  await page.locator(`${top} .set-row`, { hasText: "ロック" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(`${top} .set-row.is-sw`, { hasText: "ロック" }).click();
  await answer("1234");
  await answer("1234");
  await page.waitForTimeout(300);
  const diarySw = page.locator(`${top} .set-row.is-sw`, { hasText: "日記" });
  t.check("ロックの紙に「日記」の入切がある", (await diarySw.count()) === 1);
  t.check("日記の鍵は既定で切", !(await page.evaluate(() => KN.lock.covers("diary"))));
  await diarySw.click();
  await page.waitForTimeout(300);
  await page.locator(`${top} .set-row.is-sw`, { hasText: "daily" }).click();
  await page.waitForTimeout(300);
  t.check("日記は入・daily は切", await page.evaluate(() =>
    KN.store.get().settings.lockDiary === true && KN.store.get().settings.lockDaily === false));

  /* ---- 閉じたところから ---- */
  await page.evaluate(() => KN.lock.close());
  await show("archive");
  t.check("daily に覆いは出ない", !(await veil()).on);
  t.check("本文は出さない", !(await logText()).includes(WORD));
  t.check("代わりに「開ける」", await page.evaluate(() => !!document.querySelector("#screen-archive .arc-diary-shut")));
  t.check("検索は日記を探さない", await page.evaluate((w) =>
    !KN.searchAll.find(w, "todo").groups.some((g) => g.id === "daily"), WORD));
  t.check("hides は daily・diary とも true、notes は false", await page.evaluate(() =>
    KN.lock.hides("diary") && KN.lock.hides("daily") && !KN.lock.hides("notes")));

  /* コピーは開けてから。やめれば元のまま。 */
  await page.click("#screen-archive .js-log-copy");
  await page.waitForTimeout(300);
  t.check("コピーを押すと覆い（一度だけ開ける形）", (await veil()).ask);
  t.check("覆いに絵文字なし", !EMOJI.test(await page.evaluate(() => document.querySelector(".lock-veil").textContent)));
  await page.click(".lock-cancel");
  await page.waitForTimeout(300);
  t.check("やめると覆いが消える", !(await veil()).on);
  t.check("やめても本文は出ない", !(await logText()).includes(WORD));

  /* 違う番号では開かない・正しい番号で開く。 */
  await page.click("#screen-archive .arc-diary-shut");
  await page.waitForTimeout(300);
  t.check("「開ける」を押すと覆い", (await veil()).ask);
  await type("9999");
  t.check("違う番号では開かない", (await veil()).on && !(await logText()).includes(WORD));
  await type("1234");
  t.check("番号で開くと覆いが消える", !(await veil()).on);
  t.check("開けると本文が出る", (await logText()).includes(WORD));

  /* 開けた紙は、鍵が閉じると閉じる。本文はそのまま。 */
  await page.evaluate(() => {
    const b = document.querySelector("#screen-archive .js-post-edit");
    if (b) b.click(); else document.querySelector("#screen-archive .arc-log-row").click();
  });
  await page.waitForTimeout(500);
  t.check("日記の紙が開く", await page.evaluate(() => !!document.querySelector(".sheet.is-open .js-memo")));
  await page.evaluate(() => KN.lock.close());
  await page.waitForTimeout(600);
  t.check("鍵が閉じると紙も閉じる", await page.evaluate(() => !document.querySelector(".sheet.is-open .js-memo")));
  t.check("閉じても本文はそのまま", await page.evaluate((w) => (KN.store.dayLog(KN.util.todayKey()) || {}).memo === w, WORD));
  t.check("閉じたら本文はまた隠れる", !(await logText()).includes(WORD));

  /* 書き出しの入口も、開けてから。 */
  await show("settings");
  await page.waitForFunction(() => document.querySelector(".set-layer .set-row"));
  await page.locator(`${top} .set-row`, { hasText: "書き出し" }).first().click();
  await page.waitForTimeout(400);
  /* 設定の上では、紙は一枚として押しのけて出る（docs/traps.md）。 */
  const layers = () => page.evaluate(() => document.querySelectorAll(".set-layer, .sheet.is-open").length);
  const n0 = await layers();
  await page.locator(`${top} .set-row`, { hasText: "年の本" }).first().click();
  await page.waitForTimeout(300);
  t.check("年の本を押すと覆い", (await veil()).ask);
  t.check("年の本の紙はまだ出ない", (await layers()) === n0);
  await type("1234");
  await page.waitForTimeout(600);
  t.check("開けるとそのまま年の本の紙", (await layers()) > n0, `${n0} → ${await layers()}`);

  t.check("記録は一つも変わらない", (await plain()) === before);
  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
