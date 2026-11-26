/* 書いた先から残す紙は、閉じたときに「更新しました」（2026年10月7日・利用者「daily log を閉じたら
   『更新しました』みたいなトーストは出てほしい。他のタブの全てにおいても」）。
   - daily の log の紙・ノート・買うものの品物の紙：変えて閉じたら「更新しました」、開いて閉じただけなら出さない
   - ノートを消したときは「最近削除した項目へ移しました」（元に戻す）を上書きしない
   日記の本文は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/close-toast.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("close-toast");
  const { browser, page, errors } = await open({ viewport: { width: 390, height: 844 } });

  const clear = () => page.evaluate(() => { document.getElementById("toast-root").innerHTML = ""; });
  const said = () => page.evaluate(() => {
    const m = document.querySelector("#toast-root .toast:not(.is-out) .toast-msg");
    return m ? m.textContent.trim() : "";
  });
  const gone = (sel) => page.waitForFunction((s) => !document.querySelector(s), sel, { timeout: 3000 });

  /* ---- daily の log（一枚の紙。時刻ごとの書く紙は tests/diary-chat.js） ---- */
  /* 席1 の今日は扉だけ（構4b）。書く紙は昨日の頁の行から。 */
  await page.evaluate(() => { KN.store.update((s) => { s.settings.diaryView = "page"; }); KN.app.showScreen("archive"); KN.screens.archive.goDay(KN.util.shiftDay(KN.util.todayKey(), -1)); });
  await page.waitForTimeout(600);
  await page.click("#screen-archive .arc-log-row");
  await page.waitForTimeout(600);
  await clear();
  await page.click(".sheet.is-card .js-ok");
  await gone(".sheet.is-card.is-open");
  c.check("log：開いて閉じただけでは出さない", (await said()) === "", await said());

  await page.click("#screen-archive .arc-log-row");
  await page.waitForTimeout(600);
  await page.focus(".sheet.is-card .js-memo");
  await page.keyboard.press("End");
  await page.keyboard.insertText(" さんぽ");
  await clear();
  await page.click(".sheet.is-card .js-ok");
  await gone(".sheet.is-card.is-open");
  c.check("log：書いて閉じたら「更新しました」", (await said()) === "更新しました", await said());

  /* ---- ノート ---- */
  await page.evaluate(() => KN.notes.ready());
  const id = await page.evaluate(() => {
    const n = KN.notes.draft();
    n.title = "かいもの";
    n.body = "たまご";
    KN.notes.put(n);
    return n.id;
  });
  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(400);
  await clear();
  await page.keyboard.press("Escape");
  await gone(".sheet.is-note.is-open");
  c.check("ノート：開いて閉じただけでは出さない", (await said()) === "", await said());

  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(400);
  await page.focus(".sheet.is-note .js-title");
  await page.keyboard.press("End");
  await page.keyboard.insertText("リスト");
  await clear();
  await page.keyboard.press("Escape");
  await gone(".sheet.is-note.is-open");
  c.check("ノート：直して閉じたら「更新しました」", (await said()) === "更新しました", await said());

  await page.evaluate(() => KN.screens.notes.open(null));
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(400);
  await page.focus(".sheet.is-note .js-title");
  await page.keyboard.insertText("あたらしい");
  await clear();
  await page.keyboard.press("Escape");
  await gone(".sheet.is-note.is-open");
  c.check("ノート：新しく書いて閉じたら「保存しました」", (await said()) === "保存しました", await said());

  await page.evaluate(() => KN.screens.notes.open(null));
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(400);
  await clear();
  await page.keyboard.press("Escape");
  await gone(".sheet.is-note.is-open");
  c.check("ノート：新しく開いて何も書かずに閉じたら出さない", (await said()) === "", await said());

  await page.evaluate((i) => KN.screens.notes.open(i), id);
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(400);
  await page.focus(".sheet.is-note .js-title");
  await page.keyboard.insertText("x");
  await clear();
  await page.click(".sheet.is-note .js-note-more");
  await page.waitForTimeout(300);
  await page.locator(".note-pop-item.is-danger").first().click();
  await gone(".sheet.is-note.is-open");
  c.check("ノート：消したときは「元に戻す」の知らせを残す", /最近削除/.test(await said()), await said());
  await page.evaluate((i) => KN.notes.restore(i), id);

  /* ---- 買うものの品物の紙 ---- */
  const pid = await page.evaluate(() => KN.store.addProduct({ name: "ぴよぴよ" }).id);
  const openProduct = async () => {
    await page.evaluate((p) => KN.productSheet.open(p), pid);
    await page.waitForTimeout(700);
  };
  await openProduct();
  await clear();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  c.check("品物：開いて閉じただけでは出さない", (await said()) === "", await said());

  await openProduct();
  const before = await page.evaluate((p) => KN.store.getProduct(p).name, pid);
  await page.focus(".sheet.is-open .js-name");
  await page.keyboard.press("End");
  await page.keyboard.insertText("2");
  await clear();
  // 名前は打ち終わりを待って書く（350ms）。待たずに閉じても、変わったと言う
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  c.check("品物：名前を直してすぐ閉じても「更新しました」", (await said()) === "更新しました", await said());
  c.check("…名前は残っている", (await page.evaluate((p) => KN.store.getProduct(p).name, pid)) === `${before}2`);

  /* 知らせのボタンは一度きり：フォーカスしたまま Enter を二度押しても、元に戻すは一度だけ走る（11月26日の点検）。 */
  await clear();
  await page.evaluate(() => { window.__undo = 0; KN.ui.toast("試しの知らせ", { action: { label: "元に戻す", onClick: () => { window.__undo++; } } }); });
  await page.focus("#toast-root .toast-action");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  c.check("知らせのボタンは Enter の二度押しでも一度だけ", (await page.evaluate(() => window.__undo)) === 1, String(await page.evaluate(() => window.__undo)));

  /* 紙が開いたら、帯の上に残った押せない一言は退く（11月26日の点検。書き終えてすぐ＋で次を書くと、前の「保存しました」が
     新しい紙の帯の上に乗っていた）：出ていたものは薄れ、同じ拍に出たものは画面の上へ。 */
  const aside = async (late) => { await clear(); return page.evaluate(async (late) => {
    const root = document.getElementById("toast-root");
    root.classList.remove("is-top");
    KN.ui.toast("試しの一言");
    if (late) await new Promise((r) => setTimeout(r, 700));
    const h = KN.ui.sheet({ title: "試し", content: document.createElement("div") });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t = root.querySelector(".toast");
    const r = { top: root.classList.contains("is-top"), out: !t || t.classList.contains("is-out") };
    h.close();
    return r;
  }, late); };
  const old = await aside(true);
  c.check("紙が開くと、出ていた一言は薄れて下がる", old.out && !old.top, JSON.stringify(old));
  await page.waitForTimeout(600);
  const young = await aside(false);
  c.check("同じ拍に出た一言は、画面の上へ（消さない）", !young.out && young.top, JSON.stringify(young));

  c.check("エラー0", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
