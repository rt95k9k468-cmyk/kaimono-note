/* 記録の点検（R28）と、持ち主の無い品物（R18）。

   前半は KN.audit.check（読むだけ）：きれいな記録は0件・わざと入れた食い違い五種を
   それぞれ数える・受け取ったものに一字も書かない。
   後半は画面：
   - 買うもの：products に無い productId の品物が一つだけ → 空の案内が出る（前は真っ白）。
     描ける品物と混ざっていれば、描けるものだけ出る。**孤児は消さない**（記録に残る）
   - 設定 → バックアップと書き出し →「記録を点検する」：数の表・「記録は変えていません」
   - 復元でファイルを選ぶと、確認に「このファイルには食い違いが◯件」。確かめの紙にも。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("audit");
  const { browser, page, errors } = await open();

  /* ---------------- 前半：数える ---------------- */
  const A = await page.evaluate(() => {
    const S = KN.store;
    S.loadSample();
    const clean = KN.audit.check(S.get());
    const s = JSON.parse(JSON.stringify(S.get()));
    const p0 = s.products[0];
    s.items.push({ id: "it-orphan", productId: "p-nowhere", qty: 1, memo: "", checked: false, fav: false });
    p0.prices.push({ id: "pr-orphan", storeId: "s-nowhere", price: 100, amount: null, date: "2026-09-01T00:00:00.000Z" });
    s.todos.push({ id: "td-bad", title: "読めない日", due: "2026-02-30" });
    s.todos.push({ id: "td-bad", title: "同じ id", due: null });
    s.archive.days.push({ date: "2026-09-01", memo: "" }, { date: "2026-09-01", memo: "" }, { memo: "日付なし" });
    s.diet.weights.push({ id: "w-x", kg: 60, time: "07:00" });
    const before = JSON.stringify(s);
    const bad = KN.audit.check(s);
    return { clean, bad, untouched: JSON.stringify(s) === before };
  });
  t.check("きれいな記録（サンプル）は0件", A.clean.total === 0, JSON.stringify(A.clean));
  t.check("持ち主の無い品物を数える", A.bad.orphanItems === 1, JSON.stringify(A.bad));
  t.check("無い店を指す値段を数える", A.bad.orphanPrices === 1, JSON.stringify(A.bad));
  t.check("読めない日付（2月30日）を数える", A.bad.badDates === 1, JSON.stringify(A.bad));
  t.check("同じ id の二重（やること）・同じ日付の二重（daily）を数える", A.bad.dupIds === 2, JSON.stringify(A.bad));
  t.check("日付の欠けた記録（daily・体重）を数える", A.bad.noDate === 2, JSON.stringify(A.bad));
  t.check("合計が五種の和", A.bad.total === 7, JSON.stringify(A.bad));
  t.check("点検は受け取ったものに一字も書かない", A.untouched);

  /* ---------------- 後半：買うもの（R18） ---------------- */
  await page.evaluate(() => {
    KN.store.reset();
    KN.store.update((s) => {
      s.items.push({ id: "it-orphan", productId: "p-nowhere", qty: 1, memo: "", checked: false, fav: false });
    });
    KN.app.showScreen("list");
  });
  await page.waitForFunction(() => KN.app.activeScreen() === "list");
  await page.waitForTimeout(200);
  const L1 = await page.evaluate(() => {
    const sc = document.getElementById("screen-list");
    return { empty: !!sc.querySelector(".empty .empty-title"), rows: sc.querySelectorAll(".item-wrap").length,
      kept: KN.store.get().items.some((i) => i.id === "it-orphan") };
  });
  t.check("持ち主の無い品物が一つだけ：真っ白ではなく空の案内", L1.empty && L1.rows === 0, JSON.stringify(L1));
  t.check("持ち主の無い品物は消さない（記録に残る）", L1.kept);

  await page.evaluate(() => {
    const p = KN.store.addProduct({ name: "試験の牛乳" });
    KN.store.addItem(p.id);
  });
  await page.waitForTimeout(300);
  const L2 = await page.evaluate(() => {
    const sc = document.getElementById("screen-list");
    return { empty: !!sc.querySelector(".empty .empty-title"), text: sc.textContent,
      rows: sc.querySelectorAll(".item-wrap").length };
  });
  t.check("描ける品物と混ざれば、描けるものだけ出る", !L2.empty && L2.rows === 1 && L2.text.includes("試験の牛乳"),
    JSON.stringify({ ...L2, text: undefined }));

  /* ---------------- 後半：設定の「記録を点検する」 ---------------- */
  const before = await page.evaluate(() => JSON.stringify(KN.store.get()));
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings");
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップと書き出し" }).first().click();
  await page.locator(".set-layer:last-child .set-row", { hasText: "記録を点検する" }).first().click();
  await page.waitForSelector(".js-audit");
  const S1 = await page.evaluate(() => {
    const tb = document.querySelector(".js-audit");
    const box = tb.closest(".sheet, .dialog, .set-layer") || document.body;
    return { rows: [...tb.querySelectorAll("tr")].map((r) => r.textContent.replace(/\s+/g, " ").trim()),
      text: box.textContent };
  });
  t.check("点検の紙：五種の表で、持ち主の無い品物が1",
    S1.rows.length === 5 && S1.rows.some((r) => /持ち主の無い品物\s*1/.test(r)), JSON.stringify(S1.rows));
  t.check("点検の紙：「記録は変えていません」と言う・直すボタンは無い",
    S1.text.includes("記録は変えていません") && !/直す|消す/.test(S1.text.replace("記録は変えていません", "")),
    S1.text.slice(0, 120));
  t.check("点検しても記録は一字も変わらない", await page.evaluate((b) => JSON.stringify(KN.store.get()) === b, before));
  t.check("点検の紙に絵文字なし", !/\p{Extended_Pictographic}/u.test(S1.text));
  await page.locator("button", { hasText: "閉じる" }).last().click();
  await page.waitForTimeout(300);

  /* ---------------- 後半：復元・確かめで、ファイルの食い違い ---------------- */
  const fileText = await page.evaluate(() => {
    const raw = JSON.parse(KN.store.exportJSON("2026-09-29T00:00:00.000Z"));
    raw.archive.days.push({ memo: "日付なし" });
    return JSON.stringify(raw);
  });
  await page.locator(".js-verify").setInputFiles({ name: "kurashi.json", mimeType: "application/json", buffer: Buffer.from(fileText) });
  await page.waitForSelector(".js-audit-line");
  const V = await page.evaluate(() => document.querySelector(".js-audit-line").textContent);
  t.check("確かめの紙：「このファイルには食い違いが2件」（持ち主の無い品物・日付の欠け）",
    V.includes("食い違いが2件") && V.includes("持ち主の無い品物 1") && V.includes("日付の欠けた記録 1"), V);
  await page.locator("button", { hasText: "閉じる" }).last().click();
  await page.waitForTimeout(300);
  await page.locator(".js-file").setInputFiles({ name: "kurashi.json", mimeType: "application/json", buffer: Buffer.from(fileText) });
  await page.waitForSelector(".js-ok");
  const C = await page.evaluate(() => document.body.innerText);
  t.check("復元の確認：「このファイルには食い違いが2件」", C.includes("このファイルには食い違いが2件"), "");
  await page.locator("button", { hasText: "キャンセル" }).last().click().catch(() => {});
  await page.waitForTimeout(300);
  /* 確かめは、読めたファイルの日時を「前回の書き出し」にする決まり（docs/settings.md）。
     その一欄だけを除いて比べる。 */
  t.check("確かめ・取りやめた復元で記録は変わらない（前回の書き出しの日時のほかは）", await page.evaluate((b) => {
    const strip = (x) => { const y = JSON.parse(JSON.stringify(x)); delete y.settings.lastExportAt; return JSON.stringify(y); };
    return strip(KN.store.get()) === strip(JSON.parse(b));
  }, before));

  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
