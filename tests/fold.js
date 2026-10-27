/* 使っていない面を畳む（roadmap-3.1 の S4、2026年10月10日、docs/settings.md の「畳んだ面」）。

   利用者が選んだ三つ——買うものの「そろそろ切れそう」・上の帯の「これからの二週間」・
   ノートの「⋯」の「道に置く」——が既定で出ない。鍵の無い古い記録でも出ない。設定の
   スイッチで戻る（買うものは設定の画面から押して確かめる）。データは消えない。
   二度め（2026年10月24日）：戻すスイッチは置かない（js/util.js の FOLDED）。月ぶんを書き出す・Google から取り込む・
   置き直しの控え・見直しの紙の頭の控え・行き先の札（買うもの）・読んだところ。スイッチのある四つ（カレンダー・
   節気・並べ方・探す窓）は、既定のままなら畳み、変えていれば出す。
   置き直しの控え（設定の奥）は 10月27日、D1 の見直しのため利用者が戻した（見直しの紙の頭は畳んだまま）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/fold.js */
const { open, checker } = require("./lib");

const t = checker("fold");

(async () => {
  const { browser, page, errors } = await open();
  const wait = (ms) => page.waitForTimeout(ms);

  const def = await page.evaluate(() => {
    const s = KN.store.get().settings;
    return [s.showLow, s.showUpcoming, s.noteRoad];
  });
  t.check("三つとも既定は畳む", JSON.stringify(def) === "[false,false,false]", JSON.stringify(def));

  /* 「そろそろ切れそう」：中身があっても出ない（runningLow を差し替える）。 */
  await page.evaluate(() => {
    const p = KN.store.addProduct({ name: "牛乳" });
    KN.insights.runningLow = () => [{ product: p, every: 7, since: 8 }];
    KN.store.addItem(KN.store.addProduct({ name: "卵" }).id);   // 空のリストには出ない
    KN.app.showScreen("list");
  });
  await wait(500);
  t.check("買うものに「そろそろ切れそう」が出ない", !(await page.$("#screen-list .low")));
  t.check("帯に「これからの二週間」が出ない",
    await page.$eval("#head .js-upcoming", (b) => b.hidden && b.offsetWidth === 0));

  await page.evaluate(() => KN.app.showScreen("settings"));
  await wait(700);
  const row = page.locator("#screen-settings .set-row", { hasText: "そろそろ切れそう" });
  t.check("買うものの設定に戻すスイッチ", (await row.count()) === 1
    && (await row.getAttribute("aria-checked")) !== "true");
  await row.click();
  await wait(200);
  t.check("押すと戻る（鍵が入る）", await page.evaluate(() => KN.store.get().settings.showLow === true));
  await page.evaluate(() => KN.app.backScreen());
  await wait(700);
  t.check("買うものに「そろそろ切れそう」が戻る", !!(await page.$("#screen-list .low .low-row")));

  await page.evaluate(() => KN.store.update((s) => { s.settings.showUpcoming = true; }));
  await wait(200);
  t.check("鍵を入れると二週間の絵が戻る",
    await page.$eval("#head .js-upcoming", (b) => !b.hidden && b.offsetWidth > 0));

  /* 鍵の無い古い記録（S4 より前）を読んでも畳む。ほかの記録はそのまま。 */
  const old = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("kaimono-note-v2"));
    delete raw.settings.showLow; delete raw.settings.showUpcoming; delete raw.settings.noteRoad;
    return raw;
  });
  await page.evaluate((raw) => localStorage.setItem("kaimono-note-v2", JSON.stringify(raw)), old);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await wait(500);
  const after = await page.evaluate(() => {
    const s = KN.store.get();
    return { keys: [s.settings.showLow, s.settings.showUpcoming, s.settings.noteRoad], n: s.products.length };
  });
  t.check("鍵の無い記録でも畳む・品物は減らない",
    JSON.stringify(after.keys) === "[false,false,false]" && after.n === old.products.length, JSON.stringify(after));

  /* ノートの「⋯」 */
  await page.evaluate(() => KN.notes.ready());
  const nid = await page.evaluate(() => {
    const n = KN.notes.draft();
    n.title = "段取り"; n.body = "箱の数";
    KN.notes.put(n);
    return n.id;
  });
  const menuOf = async () => {
    await page.click('.tab[data-tab="archive"]');
    await wait(500);
    await page.evaluate((i) => KN.screens.notes.open(i), nid);
    await page.waitForSelector(".sheet.is-note.is-open");
    await wait(400);
    await page.click(".sheet.is-note .js-note-more");
    await wait(300);
    return page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.textContent.trim()));
  };
  const off = await menuOf();
  t.check("ノートの「⋯」に「道に置く」が出ない", off.length > 0 && !off.includes("道に置く"), JSON.stringify(off));
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.evaluate(() => KN.store.update((s) => { s.settings.noteRoad = true; }));
  await wait(300);
  const on = await menuOf();
  t.check("鍵を入れると「道に置く」が戻る", on.includes("道に置く"), JSON.stringify(on));
  t.check("ノートの「⋯」に「読んだところ」が出ない", !on.includes("読んだところ"), JSON.stringify(on));
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await wait(500);

  /* 二度め（10月24日）：設定の行。行の組み立てを直に読む（どの一枚かは試験の外で変わりうる）。 */
  const textOf = (fn) => page.evaluate((f) => {
    if (KN.ics) KN.ics.apple = () => true;   // 「カレンダー」はショートカット App のある端末だけ
    const S = KN.settingsParts;
    return S[f]().flat().filter(Boolean).map((r) => r.textContent).join(" ");
  }, fn);
  const T = await textOf("todoRows");
  t.check("tasks に Google・誕生日・カレンダーが出ない（他は出る。置き直しの控えは D1 の見直しで戻した）",
    !/Google から取り込む|誕生日のショートカット|カレンダー/.test(T) && T.includes("通知") && T.includes("置き直しの控え"), T.slice(0, 200));
  const R = await textOf("reviewRows");
  t.check("見直すに「節気の初日に揃える」が出ない", !R.includes("節気") && R.includes("いつか"), R.slice(0, 120));
  const O = await textOf("dailyOutRows");
  t.check("書き出しに「月ぶんを書き出す」が出ない（期間・年の本は出る）",
    !O.includes("月ぶん") && O.includes("期間を選んで書き出す") && O.includes("年の本"), O);
  const L = await textOf("lookRows");
  t.check("外観に「並べ方」「探す窓」が出ない", !/並べ方|探す窓/.test(L) && L.includes("空の写真"), L.slice(-160));

  /* 既定から変えていれば、切れるように出す。鍵はどれも読めるまま。 */
  await page.evaluate(() => KN.store.update((s) => {
    s.settings.calShortcut = true; s.settings.reviewSekki = true; s.settings.layout = "tiles"; s.settings.searchBar = true;
  }));
  const T2 = await textOf("todoRows"), R2 = await textOf("reviewRows"), L2 = await textOf("lookRows");
  t.check("オンのあいだはカレンダー・節気・並べ方・探す窓が出る",
    T2.includes("カレンダー") && R2.includes("節気の初日に揃える") && L2.includes("並べ方") && L2.includes("探す窓"),
    [T2.slice(0, 80), R2.slice(0, 80), L2.slice(-80)].join(" | "));
  await page.evaluate(() => KN.store.update((s) => {
    s.settings.calShortcut = false; s.settings.reviewSekki = false; s.settings.layout = "rows"; s.settings.searchBar = false;
  }));

  /* 買うものの足す紙：やることらしい字でも行き先の札は出ない。押せば買うものへ入るまま。 */
  await page.evaluate(() => KN.app.showScreen("list"));
  await wait(400);
  await page.evaluate(() => document.querySelector('button[aria-label="買うものを追加"]').click());
  await page.waitForSelector(".sheet .js-name");
  await wait(300);
  await page.fill(".sheet .js-name", "明日 19:00 歯医者");
  await wait(150);
  t.check("買うものに行き先の札が出ない", await page.evaluate(() => document.querySelector(".sheet .js-dest").hidden));

  /* 見直しの紙の頭：置き直しの控えは言わず、期限は言う。控え（slips）は記録に残ったまま。 */
  const facts = await page.evaluate(() => {
    const t = KN.store.addTodo({ title: "棚の板", deadline: "2026-12-01" });
    KN.store.update((s) => { const x = s.todos.find((y) => y.id === t.id);
      x.slips = [{ from: "2026-09-01", to: "2026-09-02", how: "hand", time: "21:00" }]; });
    return KN.store.get().todos.find((y) => y.id === t.id).slips.length;
  });
  t.check("置き直しの控えは記録に残る", facts === 1, String(facts));

  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
