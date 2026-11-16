/* 日記だけの鍵（js/lock.js の lockDiary・ask・diarySheet、docs/daily.md の「鍵」）。

   daily の鍵を切って日記の鍵を入れると：daily に覆いは出ない・本文は出さず「開ける」・
   検索は日記を探さない・コピーは開けてから・押せば覆いが出て、やめれば元のまま・番号で開けば
   本文が出る・開けた紙は鍵が閉じると閉じる（本文はそのまま）・書き出しの入口も開けてから・
   今日の頁は席3（頭の頁は組まず「いま」の筆は効く）、過ぎた日の頁は席1（構4b の二つめ。ここでは昨日）・
   設定に「日記」の入切・記録は一つも変わらない・絵文字なし。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-lock.js */
const { open, checker, pen } = require("./lib");

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

  /* 頁の事実（構1）：体重・食事。閉じているあいだは本文と同じく組まない。今日（席3）と昨日（席1）に同じものを。 */
  await page.evaluate((w) => [KN.util.todayKey(), KN.util.shiftDay(KN.util.todayKey(), -1)].forEach((d) => { KN.store.setDayLog(d, { memo: w });
    KN.store.addWeight({ day: d, time: "07:00", kg: 61.5 }); KN.store.addMeal({ day: d, time: "07:30", slot: "breakfast", items: [], memo: "はまなす" }); }), WORD);
  /* 見ている日は全部の席で一つ：席1 は昨日、席3 は今日へ合わせて開く。 */
  const arc = async () => { await show("archive"); await page.evaluate(() => KN.screens.archive.goDay(KN.util.shiftDay(KN.util.todayKey(), -1))); await page.waitForTimeout(300); };
  const mid3 = async () => { await page.evaluate(() => KN.screens.archive.goDay(KN.util.todayKey())); await show("todo"); };
  const before = await plain();

  /* ---- 番号を決めて、daily を切り、日記を入れる ---- */
  await show("archive");
  await show("settings");
  await page.waitForFunction(() => document.querySelector(".set-layer .set-row"));
  await page.locator(`${top} .set-row`, { hasText: "通知・プライバシー" }).first().click();
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
  await arc();
  t.check("daily に覆いは出ない", !(await veil()).on);
  t.check("本文は出さない", !(await logText()).includes(WORD));
  t.check("頁の行（本文・体重・食事）を組まない", await page.evaluate(() => !document.querySelector("#screen-archive .pg-row")
    && !/61\.5|はまなす/.test(document.querySelector("#screen-archive .arc-log").textContent)));
  t.check("代わりに「開ける」", await page.evaluate(() => !!document.querySelector("#screen-archive .arc-diary-shut")));
  t.check("検索は日記を探さない", await page.evaluate((w) =>
    !KN.searchAll.find(w, "todo").groups.some((g) => g.id === "daily"), WORD));
  t.check("hides は daily・diary とも true、notes は false", await page.evaluate(() =>
    KN.lock.hides("diary") && KN.lock.hides("daily") && !KN.lock.hides("notes")));
  /* まん中（tasks の今日の面）の頭の頁（構4a）：覆わず、頁と今日の問いを組まない。「いま」の筆は効く（README 6.6）。 */
  const mid = () => page.evaluate(() => { const r = document.getElementById("screen-todo"), p = r.querySelector(".tk-page");
    return { page: !!(p && p.querySelector(".arc-log-row, .think-home")), text: p ? p.textContent : "", face: !!r.querySelector(".tl-sheet"),
      pen: !!r.querySelector(".tl-now-pen"), all: r.textContent }; });
  await mid3();
  const m0 = await mid();
  t.check("まん中は覆わず、頭の頁を組まない・筆は出る", !(await veil()).on && m0.face && !m0.page && m0.pen && !/しおかぜ|61\.5|はまなす/.test(m0.all), JSON.stringify({ page: m0.page, face: m0.face, pen: m0.pen }));
  await arc();

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
  t.check("開けると頁の事実も出る", /61\.5kg/.test(await logText()) && (await logText()).includes("はまなす"));
  await mid3();
  const m1 = await mid();
  t.check("開けるとまん中の頭に頁（日記は「時刻 日記追記」の一行だけ・本文は出さない）", m1.text.includes("日記追記") && !m1.text.includes(WORD), m1.text);
  await arc();

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
  t.check("閉じても本文はそのまま", await page.evaluate((w) => (KN.store.dayLog(KN.util.shiftDay(KN.util.todayKey(), -1)) || {}).memo === w, WORD));
  t.check("閉じたら本文はまた隠れる", !(await logText()).includes(WORD));
  t.check("閉じたら頁の行も DOM から消える", await page.evaluate(() => !document.querySelector("#screen-archive .pg-row")));
  /* 閉じたまま書ける紙（構3）：席3 の「いま」の筆。直前の行（頁の写し）は組まない。開いて閉じただけでは何も書かない。 */
  await pen(page);
  await page.waitForTimeout(500);
  const shut = await page.evaluate(() => { const s = document.querySelector(".sheet.is-open"); return s && { memo: !!s.querySelector(".js-memo"), prev: !!s.querySelector(".wr-prev, .wr-page .pg-row:not(.wr-cur)"), text: s.textContent }; });
  t.check("閉じたままでも書く紙は開き、直前の行は組まない", !!shut && shut.memo && !shut.prev && !shut.text.includes(WORD), JSON.stringify(shut && { memo: shut.memo, prev: shut.prev }));
  await page.evaluate(() => { const b = document.querySelector(".sheet.is-open .js-close"); if (b) b.click(); });
  await page.waitForTimeout(500);

  /* 書き出しの入口も、開けてから。 */
  await show("settings");
  await page.waitForFunction(() => document.querySelector(".set-layer .set-row"));
  /* 書き出しの行は daily の一枚に（2026年11月5日。根っこは入口だけ）。 */
  await page.locator(`${top} .set-row`, { hasText: "daily" }).first().click();
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

  /* 構5：開いた一年の一冊・月の頁は、鍵が閉じたら閉じる。閉じているあいだに開けば、升の一行も頁の写しも組まない。 */
  await show("archive");   // 設定が出ているあいだ、紙は一枚として押しのけて出る（棚は archive にある）
  await page.evaluate(() => { KN.seasonBook.openBook(2025); });
  await page.waitForTimeout(400);
  t.check("構5：一年の一冊が開く", await page.evaluate(() => !!document.querySelector(".sb-sheet .sb-masu")));
  await page.evaluate(() => KN.lock.close());
  await page.waitForTimeout(600);
  t.check("構5：鍵が閉じたら一年の一冊も閉じる", await page.evaluate(() => !document.querySelector(".sb-sheet")));
  await page.evaluate(() => { KN.seasonBook.openBook(2025); });
  await page.waitForTimeout(400);
  t.check("構5：鍵のあいだは升の一行を組まない（写真と名だけ）", await page.evaluate(() =>
    document.querySelectorAll(".sb-masu").length > 0 && !document.querySelector(".sb-masu .ima-text")));
  await page.evaluate(() => { KN.seasonBook.openMonth(2025, 9); });
  await page.waitForTimeout(400);
  t.check("構5：鍵のあいだは月の頁の写しを組まない", await page.evaluate(() => !!document.querySelector(".sb-mpage") && !document.querySelector(".sb-mpage .ima-page")));

  t.check("記録は一つも変わらない", (await plain()) === before);
  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
