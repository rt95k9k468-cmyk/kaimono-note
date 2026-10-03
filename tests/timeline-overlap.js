/* 時刻を決めた用事どうしの重なり（2026年9月29日の画面）。
   - 20:00〜22:00 の「夜のルーティン」（毎晩）の途中、20:55 に「テスト」。
     組み立ては毎朝→あいだ→毎晩の順に置くので、前は**早いほうの**ルーティンに
     「前と重なっています」が付き、上の行（空きの点線）とのあいだに白い抜きが
     出て、丸薬がそちらへ伸びていた。「前」は時刻の順の前。
   - 20:57 には、上のルーティンは下のテストが始まるところまで塗り切り、「いま」は
     テストの丸薬にいる。前はルーティン自身の進み具合（47%）で塗っていて、
     「20:57」がルーティンのまん中に出て、その下のもう始まったテストが灰色だった。
   `SHOTS=<置き場>` で時間割を撮る。 */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";

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
  await page.waitForTimeout(600);

  const rows = await page.evaluate(() => {
    const list = document.querySelector("#screen-todo .tl-list");
    return [...list.children].filter((li) => li.classList.contains("tl-row")).map((li) => ({
      title: (li.querySelector(".tl-open, .tl-title") || {}).textContent || "",
      clash: li.classList.contains("is-clash"),
      above: li.classList.contains("is-clash-above"),
      note: !!li.querySelector(".tl-clash"),
      pass: parseFloat(getComputedStyle(li).getPropertyValue("--pass")),
      live: li.classList.contains("is-live"),
      node: (({ top, bottom }) => ({ top, bottom }))(li.querySelector(".tl-node").getBoundingClientRect()),
    }));
  });
  const nowTop = await page.evaluate(() => {
    const el = document.querySelector("#screen-todo .tl-now");
    return el ? el.getBoundingClientRect().top : null;
  });
  const find = (w) => rows.find((r) => r.title.includes(w)) || {};
  const night = find("夜のルーティン"), test = find("テスト");

  c.check("並びは時刻の順（ルーティンが上、テストが下）",
    rows.indexOf(night) >= 0 && rows.indexOf(night) < rows.indexOf(test), JSON.stringify(rows));
  c.check("「前と重なっています」は、あとから始まるテストのほうに出る",
    test.note && !night.note, JSON.stringify({ night, test }));
  c.check("ルーティンは下とだけぶつかる（頭に白い抜きを持たない）",
    night.above && !night.clash, JSON.stringify(night));
  c.check("テストは上とぶつかる", test.clash && !test.above, JSON.stringify(test));

  c.check("ルーティンの丸薬は、テストが始まるところまで塗り切る", night.pass === 1, JSON.stringify(night));
  c.check("テストの丸薬は、始まったばかり（0 < pass < 1）", test.pass > 0 && test.pass < 1, JSON.stringify(test));
  c.check("二つとも、いま進んでいる（うすい地）", night.live && test.live, JSON.stringify({ night, test }));
  c.check("「いま」はテストの丸薬の中（ルーティンのまん中ではない）",
    nowTop != null && nowTop >= test.node.top - 1 && nowTop <= test.node.bottom,
    JSON.stringify({ nowTop, night: night.node, test: test.node }));

  if (process.env.SHOTS) {
    const el = await page.$("#screen-todo .tl");
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: `${process.env.SHOTS}/overlap.png` });
  }
  c.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
