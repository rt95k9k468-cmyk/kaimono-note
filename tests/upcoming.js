/* これからの二週間（docs/roadmap.md の R7）。

   前半は数え方（KN.upcoming.days）：今日から14日ぶん、store.fallsOn が立つと
   答えた日にだけ並ぶ。毎日・週5日以上・毎朝毎晩の端は出さない（ルーティン）・曜日の毎週は2回・「済ませてから◯日」は次の
   一回だけ・毎月は範囲に入った日だけ・15日目より先は出ない・済ませたもの／棚の
   ものは出ない・期限は期限の日に「期限」として（やる日と同じなら一行にまとめる）・
   時刻の順・何も無い日は入れない。記録は一件も増えない。
   後半は画面：上の帯の暦の絵がどのタブにもある・押すと「これからの二週間」の
   紙・日ごとの見出し（今日／明日／日付）・日を押すとやることのその日へ（買うもの
   からでも・やることからでも）・紙は閉じる・空なら一言・絵文字なし。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/upcoming.js */
const { open, checker } = require("./lib");

const t = checker("upcoming");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

(async () => {
  const { browser, page, errors } = await open();

  /* ---- 数え方 ---- */
  const r = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    S.update((s) => { s.todos = []; });
    const today = U.todayKey();
    const d = (n) => U.shiftDay(today, n);
    const add = (o) => S.addTodo(o);
    add({ title: "歯医者", due: d(3), time: "19:00" });
    add({ title: "朝の薬", due: today, repeat: "daily", time: "08:00" });
    add({ title: "平日の支度", due: today, repeat: "weekly", repeatDays: [1, 2, 3, 4, 5] });
    add({ title: "今日の用事", due: today });
    const wd = U.dayOfWeek(d(2));
    add({ title: "ごみ出し", due: d(2), repeat: "weekly", repeatDays: [wd] });
    add({ title: "シーツ", due: d(5), repeat: "after", repeatEvery: 3 });
    add({ title: "家賃", due: d(4), repeat: "monthly" });
    add({ title: "遠い", due: d(14) });
    add({ title: "免許", due: null, deadline: d(6) });
    add({ title: "書類", due: d(7), deadline: d(7) });
    add({ title: "申し込み", due: d(1), deadline: d(9) });
    const done = add({ title: "済んだ", due: d(2) });
    S.toggleTodo(done.id);
    const arch = add({ title: "棚", due: d(2) });
    S.update((s) => { s.todos.find((x) => x.id === arch.id).archived = true; });
    add({ title: "朝の早い", due: d(3), time: "07:00" });
    const before = S.get().todos.length;
    const list = KN.upcoming.days(S.get().todos, today, 14);
    const on = (title) => list.filter((g) => g.rows.some((x) => x.t.title === title)).map((g) => g.day);
    return {
      today, days: list.map((g) => g.day), before, after: S.get().todos.length,
      dentist: on("歯医者"), pill: on("朝の薬"), weekday: on("平日の支度"), trash: on("ごみ出し"), sheets: on("シーツ"),
      rent: on("家賃"), far: on("遠い"), license: on("免許"), done: on("済んだ"), arch: on("棚"),
      docs: list.filter((g) => g.day === d(7)).map((g) => g.rows.filter((x) => x.t.title === "書類")
        .map((x) => ({ due: x.due, dl: x.deadline })))[0],
      apply: on("申し込み"),
      applyDl: (list.find((g) => g.day === d(9)) || { rows: [] }).rows
        .filter((x) => x.t.title === "申し込み").map((x) => ({ due: x.due, dl: x.deadline })),
      order3: (list.find((g) => g.day === d(3)) || { rows: [] }).rows.map((x) => x.t.title),
      expect: { d2: d(2), d9: d(2 + 7), d3: d(3), d4: d(4), d5: d(5), d6: d(6), d7: d(7), d1: d(1), d9b: d(9) },
    };
  });
  const E = r.expect;
  t.check("一回きりはその日にだけ", JSON.stringify(r.dentist) === JSON.stringify([E.d3]), JSON.stringify(r.dentist));
  t.check("毎日のくり返しは出ない", r.pill.length === 0, r.pill.length);
  t.check("週5日以上のくり返しも出ない", r.weekday.length === 0, r.weekday.length);
  t.check("曜日の毎週は2回", JSON.stringify(r.trash) === JSON.stringify([E.d2, E.d9]), JSON.stringify(r.trash));
  t.check("済ませてから◯日は次の一回だけ", JSON.stringify(r.sheets) === JSON.stringify([E.d5]), JSON.stringify(r.sheets));
  t.check("毎月は範囲に入った日だけ", JSON.stringify(r.rent) === JSON.stringify([E.d4]), JSON.stringify(r.rent));
  t.check("14日目（15日先）は出ない", r.far.length === 0, JSON.stringify(r.far));
  t.check("期限だけの長期タスクは期限の日に", JSON.stringify(r.license) === JSON.stringify([E.d6]), JSON.stringify(r.license));
  t.check("やる日と期限が同じなら一行に（期限の札つき）",
    Array.isArray(r.docs) && r.docs.length === 1 && r.docs[0].due && r.docs[0].dl, JSON.stringify(r.docs));
  t.check("やる日と期限が違えば、それぞれの日に", JSON.stringify(r.apply) === JSON.stringify([E.d1, E.d9b])
    && r.applyDl.length === 1 && !r.applyDl[0].due && r.applyDl[0].dl, JSON.stringify([r.apply, r.applyDl]));
  t.check("済ませたもの・棚のものは出ない", !r.done.length && !r.arch.length);
  t.check("時刻の順", JSON.stringify(r.order3) === JSON.stringify(["朝の早い", "歯医者"]), JSON.stringify(r.order3));
  t.check("記録は一件も増えない", r.before === r.after);
  t.check("何も無い日は入れない（9日ぶん）", r.days.length === 9, r.days.length);

  /* ---- 画面 ---- */
  const openSheet = async () => {
    await page.click("#head .js-upcoming");
    await page.waitForSelector(".sheet .up", { state: "visible" });
    await page.waitForTimeout(350);
  };
  /* 既定で畳んである（roadmap-3.1 の S4。畳み方は tests/fold.js）。ここでは出して見る。 */
  await page.evaluate(() => KN.store.update((s) => { s.settings.showUpcoming = true; }));
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(400);
  t.check("帯に「これからの二週間」の絵（買うもの）",
    await page.$eval("#head .js-upcoming", (b) => b.offsetWidth > 0 && b.getAttribute("aria-label") === "これからの二週間"));
  await openSheet();
  const s = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet")].pop();
    return {
      title: sh.querySelector(".sheet-title").textContent.trim(),
      heads: [...sh.querySelectorAll(".up-name")].slice(0, 2).map((e) => e.textContent.trim()),
      n: sh.querySelectorAll(".up-day").length,
      dl: sh.querySelectorAll(".up-dl").length,
      rep: sh.querySelectorAll(".up-rep").length,
      text: sh.textContent,
      note: !!sh.querySelector(".up-note"),
      wd: [...sh.querySelectorAll(".up-day")].every((e) => e.dataset.wd !== undefined),
      tint: getComputedStyle(sh.querySelector(".up-day")).backgroundColor,
    };
  });
  t.check("紙の題は「これからの二週間」", s.title === "これからの二週間", s.title);
  t.check("見出しは今日・明日から", s.heads[0] === "今日" && s.heads[1] === "明日", JSON.stringify(s.heads));
  t.check("9日ぶんの見出し", s.n === 9, s.n);
  t.check("毎日のくり返しは載せていない、の一言", s.note);
  t.check("日ごとに曜日の色", s.wd && s.tint !== "rgba(0, 0, 0, 0)", s.tint);
  t.check("期限の札が3つ", s.dl === 3, s.dl);
  t.check("くり返しの印（ごみ出し2・家賃・シーツ）", s.rep === 4, s.rep);
  t.check("絵文字なし", !EMOJI.test(s.text));
  // 買うものから、4日後を押す
  await page.click(`.sheet .js-up-day[data-day="${E.d4}"]`);
  await page.waitForTimeout(700);
  const g = await page.evaluate(() => ({
    active: KN.app.activeScreen(), day: KN.screens.todo.day(),
    sheets: [...document.querySelectorAll(".sheet")].filter((x) => x.isConnected && !x.closest("[hidden]")).length,
    rows: [...document.querySelectorAll('#screen-todo .tl-sheet .tl-row')].map((x) => x.textContent),
  }));
  t.check("買うものから押すと、やることへ", g.active === "todo", g.active);
  t.check("やることはその日（4日後）", g.day === E.d4, g.day);
  t.check("紙は閉じる", g.sheets === 0, g.sheets);
  t.check("その日の時間割に家賃がいる", g.rows.some((x) => x.includes("家賃")));
  // やることから、行を押して2日後へ
  await openSheet();
  await page.click(`.sheet .up-day:has(.js-up-day[data-day="${E.d2}"]) .up-row`);
  await page.waitForTimeout(700);
  t.check("やることの中で、行を押してもその日へ",
    await page.evaluate(() => KN.screens.todo.day()) === E.d2);
  t.check("題もその日", await page.evaluate((k) => {
    const d = KN.util.dayDate(k);
    return document.querySelector("#head .day-d").textContent === String(d.getDate());
  }, E.d2));
  // 今日へ戻ってから、空の一覧
  await page.evaluate(() => { KN.store.update((s) => { s.todos = []; }); });
  await page.waitForTimeout(200);
  await openSheet();
  t.check("空なら一言", await page.$eval(".sheet .up", (e) =>
    e.textContent.includes("この二週間に、日付の決まった用事はありません")));

  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
