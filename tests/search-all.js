/* ぜんぶをさがす（docs/roadmap.md の R8）。

   前半は表：過去の日付の言葉（pastWhen。9月28日に止めて読む。先の月は読まない）と、
   探し方（find：いまのタブの場所は数えない・やることは済んだものも・品物・日記の本文・
   積み上げ・食べたもの・本文が読めない日は本文を探さず一言・記録は増えない）。
   後半は画面：タブの中の絞り込みはそのまま・窓の下に「ほかの場所に◯件」・押すと紙・
   daily の行でその日へ・品物の行で買うものの窓に同じ字・日付の言葉で daily のその月へ・
   消すと一行も消える・絵文字なし。
   日記の本文は試験用の無難な字だけ（「しおかぜ」）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/search-all.js */
const { open, checker } = require("./lib");

const t = checker("search-all");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

(async () => {
  const { browser, page, errors } = await open();

  /* ---- 過去の日付の言葉 ---- */
  const w = await page.evaluate(() => {
    const now = new Date(2026, 8, 28);
    const cases = ["2025年9月", "2025/9", "２０２５年９月", "去年の夏", "去年の9月", "先月", "9月", "10月",
      "今年の冬", "去年の冬", "おととし", "2024年", "2027年1月", "今年の12月", "明日", "来週", "牛乳", "夏"];
    const o = {};
    cases.forEach((c) => { const r = KN.searchAll.pastWhen(c, now); o[c] = r ? r.ym : null; });
    return o;
  });
  const want = {
    "2025年9月": "2025-09", "2025/9": "2025-09", "２０２５年９月": "2025-09", "去年の夏": "2025-06",
    "去年の9月": "2025-09", "先月": "2026-08", "9月": "2026-09", "10月": "2025-10", "今年の冬": "2026-01",
    "去年の冬": "2025-12", "おととし": "2024-01", "2024年": "2024-01", "2027年1月": null, "今年の12月": null,
    "明日": null, "来週": null, "牛乳": null, "夏": null,
  };
  Object.keys(want).forEach((k) => t.check(`日付の言葉「${k}」→ ${want[k]}`, w[k] === want[k], w[k]));

  /* ---- 探し方 ---- */
  const setup = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    const past = U.shiftDay(today, -40);
    const done = S.addTodo({ title: "しおかぜの手紙を出す", due: U.shiftDay(today, -3) });
    S.toggleTodo(done.id);
    S.addTodo({ title: "しおかぜ公園", due: null });
    S.addTodo({ title: "関係ない用事", due: today });
    const p = S.addProduct({ name: "しおかぜ茶" });
    S.addItem(p.id);
    S.addProduct({ name: "しおかぜ塩" });
    S.setDayLog(past, { memo: "テスト用の一行。しおかぜの道を歩いた。" });
    S.addMeal({ day: U.shiftDay(today, -2), slot: "lunch", items: [{ name: "しおかぜ定食", kcal: 500 }] });
    return { today, past, meal: U.shiftDay(today, -2) };
  });
  const r = await page.evaluate(() => {
    const before = JSON.stringify(KN.store.get()).length;
    const pick = (res) => res.groups.map((g) => [g.id, g.rows.length]);
    const fromList = KN.searchAll.find("しおかぜ", "list");
    const fromTodo = KN.searchAll.find("シオカゼ", "todo");
    const none = KN.searchAll.find("ぜったいにない字", "todo");
    const real = KN.diaryIdb.body;
    KN.diaryIdb.body = () => "off";
    const off = KN.searchAll.find("しおかぜ", "todo");
    KN.diaryIdb.body = real;
    const daily = fromTodo.groups.find((g) => g.id === "daily");
    return {
      list: pick(fromList), todo: pick(fromTodo), none: none.total, off: pick(off), offNote: off.bodyNote,
      done: (fromList.groups.find((g) => g.id === "todo") || { rows: [] }).rows.map((x) => x.sub),
      dailyRow: daily && daily.rows[0].title,
      after: JSON.stringify(KN.store.get()).length, before,
    };
  });
  const has = (arr, id) => arr.some((x) => x[0] === id);
  t.check("買うものから：やること・daily・からだ（買うものは数えない）",
    has(r.list, "todo") && has(r.list, "daily") && has(r.list, "body") && !has(r.list, "shop"), JSON.stringify(r.list));
  t.check("やることは済んだものも（と日付の無いもの）", r.done.length === 2 && r.done.some((x) => x.includes("済"))
    && r.done.some((x) => x.includes("日付なし")), JSON.stringify(r.done));
  t.check("やることから：やることは数えない・品物は2つ・かなの違いも拾う",
    !has(r.todo, "todo") && r.todo.some((x) => x[0] === "shop" && x[1] === 2), JSON.stringify(r.todo));
  t.check("日記の本文の当たった前後", typeof r.dailyRow === "string" && r.dailyRow.includes("しおかぜ"), r.dailyRow);
  t.check("無ければ0件", r.none === 0);
  t.check("本文が読めない日は本文を探さず、一言", !has(r.off, "daily") && r.offNote === "off", JSON.stringify([r.off, r.offNote]));
  t.check("探しても記録は変わらない", r.before === r.after);

  /* ---- 画面 ---- */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(500);
  const typeIn = async (scr, text) => {
    const hidden = await page.$eval(`#screen-${scr} .js-search-wrap`, (e) => e.hidden);
    if (hidden) await page.click("#head .js-search-btn");
    await page.waitForTimeout(300);
    await page.fill(`#screen-${scr} .js-search`, text);
    await page.waitForTimeout(450);
  };
  await typeIn("todo", "しおかぜ");
  const h = await page.evaluate(() => {
    const b = document.querySelector("#screen-todo .sa-more");
    return { text: b && b.textContent.trim(), vis: !!(b && b.offsetWidth),
      rows: document.querySelectorAll("#screen-todo .tl-row, #screen-todo .item").length };
  });
  t.check("窓の下に「ほかの場所に4件」（品物2・daily1・からだ1）", h.vis && h.text === "ほかの場所に 4件", h.text);
  await page.click("#screen-todo .sa-more");
  await page.waitForSelector(".sheet .sa", { state: "visible" });
  await page.waitForTimeout(350);
  const sh = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet")].pop();
    return { title: s.querySelector(".sheet-title").textContent.trim(),
      heads: [...s.querySelectorAll(".sa-head")].map((e) => e.textContent.trim()), text: s.textContent };
  });
  t.check("紙の題", sh.title === "「しおかぜ」をぜんぶから", sh.title);
  t.check("場所ごとの見出し", JSON.stringify(sh.heads) === JSON.stringify(["買うもの・価格", "daily", "からだ"]), JSON.stringify(sh.heads));
  t.check("絵文字なし", !EMOJI.test(sh.text));
  await page.click('.sheet .sa-group[data-place="daily"] .sa-row');
  await page.waitForTimeout(700);
  const g1 = await page.evaluate(() => ({ active: KN.app.activeScreen(), day: KN.screens.archive.day() }));
  t.check("daily の行でその日の daily へ", g1.active === "archive" && g1.day === setup.past, JSON.stringify(g1));

  // daily から日付の言葉
  await typeIn("archive", "2025年9月");
  const when = await page.$eval("#screen-archive .sa-when", (b) => b.textContent.trim()).catch(() => null);
  t.check("日付の言葉で「2025年9月の daily へ」", when === "2025年9月の daily へ", when);
  await page.click("#screen-archive .sa-when");
  await page.waitForTimeout(600);
  t.check("daily のその月（1日）へ", await page.evaluate(() => KN.screens.archive.day()) === "2025-09-01");

  // daily から品物の行 → 買うものの窓に同じ字
  await typeIn("archive", "しおかぜ");
  await page.click("#screen-archive .sa-more");
  await page.waitForSelector(".sheet .sa", { state: "visible" });
  await page.waitForTimeout(350);
  await page.click('.sheet .sa-group[data-place="shop"] .sa-row');
  await page.waitForTimeout(700);
  const g2 = await page.evaluate(() => ({ active: KN.app.activeScreen(),
    q: document.querySelector("#screen-list .js-search").value,
    wrap: !document.querySelector("#screen-list .js-search-wrap").hidden }));
  t.check("品物の行で買うものへ、窓に同じ字", g2.active === "list" && g2.q === "しおかぜ" && g2.wrap, JSON.stringify(g2));

  // からだの行 → その日のダイエット
  await page.click("#screen-list .sa-more");
  await page.waitForSelector(".sheet .sa", { state: "visible" });
  await page.waitForTimeout(350);
  await page.click('.sheet .sa-group[data-place="body"] .sa-row');
  await page.waitForTimeout(700);
  const g3 = await page.evaluate(() => ({ active: KN.app.activeScreen(), day: KN.screens.diet.day() }));
  t.check("からだの行でその日のダイエットへ", g3.active === "diet" && g3.day === setup.meal, JSON.stringify(g3));

  // 消すと一行も消える
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(400);
  await page.click("#screen-list .js-search-clear");
  await page.waitForTimeout(300);
  t.check("窓を消すと一行も消える", !(await page.$("#screen-list .sa-hint")));

  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
