/* 時刻を決めた用事どうしの重なり（2026年9月29日の画面、物差しに合わせて書き直し 2026年10月20日。
   docs/timeline-scale-design.md の §4）。
   - 20:00〜22:00 の「夜のルーティン」（毎晩）の途中、20:55 に「テスト」。重なりは列が言う：
     始まりの早いルーティンが左の列、テストが右の列。札の頭は始まりの時刻、高さは長さ（1分 1.2px、
     長さ未定は 44px）。札どうしは重ならない。ぶつかりの印（is-clash・白い抜き）は無い。
   - 20:57 には、それぞれの札が自分の時間の進み具合で塗られ、二つとも「いま」進んでいる。
     「いま」の札は y(20:57)。
   - 4件重なると3列まで、あふれた用事は「＋n」の札にまとまり、押すと一覧の紙。
   `SHOTS=<置き場>` で時間割を撮る。 */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";
const PX_MIN = 1.2;

(async () => {
  const c = checker("timeline-overlap");
  const { browser, page, errors } = await open({
    before: async (ctx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 20, 57)); },
  });

  /* 立ち上げは tasks（2026年10月3日〜）。この試験は daily から やること へ来る道で
     書いたので、その道のままにする。 */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(400);
  await page.evaluate((day) => {
    const s = KN.store;
    s.addTodo({ title: "夜のルーティン", due: day, part: "dusk", repeat: "daily",
                time: "20:00", minutes: 120 });
    s.addTodo({ title: "テスト", due: day, time: "20:55" });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  /* 開いた拍は過ぎたぶんの色が上から流れる（U16）。着いてから読む。 */
  await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });

  /* 位置は一覧の頭から（送られても揺れない）。 */
  const read = () => page.evaluate(() => {
    const list = document.querySelector("#screen-todo .tl-list");
    const o = list.getBoundingClientRect().top;
    const num = (li, k) => parseFloat(li.style.getPropertyValue(k));
    const rows = [...list.children].filter((li) => li.classList.contains("tl-row")).map((li) => {
      const r = li.getBoundingClientRect();
      return {
        title: (li.querySelector(".item-name") || {}).textContent || "",
        lane: num(li, "--lane"), lanes: num(li, "--lanes"), pass: num(li, "--pass"),
        live: li.classList.contains("is-live"), more: (li.querySelector(".tl-more") || {}).textContent || "",
        top: r.top - o, h: r.height, left: r.left, right: r.right,
      };
    });
    const now = document.querySelector("#screen-todo .tl-now");
    return { rows, now: now ? now.getBoundingClientRect().top - o : null,
      clash: document.querySelectorAll("#screen-todo .is-clash, #screen-todo .is-clash-above, #screen-todo .tl-clash").length };
  });
  let r = await read();
  const find = (w) => r.rows.find((x) => x.title.includes(w)) || {};
  const night = find("夜のルーティン"), test = find("テスト");

  c.check("重なった二件は2列：ルーティンが左、テストが右",
    night.lanes === 2 && test.lanes === 2 && night.lane === 0 && test.lane === 1
      && night.right <= test.left + 0.5, JSON.stringify({ night, test }));
  c.check("二つの列は同じ幅", Math.abs((night.right - night.left) - (test.right - test.left)) < 1,
    JSON.stringify({ night, test }));
  c.check("札の頭は始まりの時刻（55分ぶん下）", Math.abs(test.top - night.top - 55 * PX_MIN) < 1,
    JSON.stringify([night.top, test.top]));
  c.check("高さは長さ（120分＝144px、長さ未定は 44px）", Math.abs(night.h - 120 * PX_MIN) < 1 && Math.abs(test.h - 44) < 1,
    JSON.stringify([night.h, test.h]));
  c.check("ぶつかりの印（is-clash・白い抜き・「前と重なっています」）は無い", r.clash === 0, String(r.clash));

  c.check("ルーティンの色は自分の進み具合（57分/120分）", Math.abs(night.pass - 57 / 120) < 0.002, JSON.stringify(night));
  c.check("テストの色は、始まったばかり（0 < pass < 1）", test.pass > 0 && test.pass < 1, JSON.stringify(test));
  c.check("二つとも、いま進んでいる（うすい地）", night.live && test.live, JSON.stringify({ night, test }));
  /* 「いま」の札は 20:55 の時刻の字から逃げる（clearOfClocks、17px）ので、その幅で見る。 */
  const nowY = night.top + 57 * PX_MIN;
  c.check("「いま」の札は y(20:57) の近く", r.now != null && Math.abs(r.now - nowY) <= 18,
    JSON.stringify({ now: r.now, want: nowY }));

  if (process.env.SHOTS) {
    const el = await page.$("#screen-todo .tl");
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: `${process.env.SHOTS}/overlap.png` });
  }

  /* 4件目からは「＋n」。 */
  await page.evaluate((day) => {
    const s = KN.store;
    s.addTodo({ title: "電話", due: day, time: "21:00", minutes: 30 });
    s.addTodo({ title: "風呂", due: day, time: "21:10", minutes: 30 });
  }, DAY);
  await page.waitForFunction(() => document.querySelectorAll("#screen-todo .tl-list > .tl-row").length === 3
    && document.querySelector("#screen-todo .tl-more"), null, { timeout: 5000 });
  r = await read();
  c.check("列は3まで（札は3枚、どれも3列）",
    r.rows.length === 3 && r.rows.every((x) => x.lanes === 3) && new Set(r.rows.map((x) => x.lane)).size === 3,
    JSON.stringify(r.rows));
  const more = r.rows.find((x) => x.more);
  c.check("あふれた一件は、3列目の札の「＋1」", more && more.lane === 2 && more.more.trim() === "＋1", JSON.stringify(r.rows));
  await page.click("#screen-todo .tl-more");
  await page.waitForSelector(".sheet.is-open .tl-more-row", { timeout: 5000 });
  const listed = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open .tl-more-row .item-name")].map((x) => x.textContent));
  c.check("「＋n」を押すと、入りきらなかった用事の一覧の紙", listed.length === 1 && !r.rows.some((x) => x.title.includes(listed[0])),
    JSON.stringify({ listed, rows: r.rows.map((x) => x.title.trim()) }));

  c.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
