/* やることの空の画面（docs/roadmap-3.2.md の H1）。用事が一つも無いとき、`.empty` は紙（`.tl-sheet`）の
   中・紙は画面の残りまで届く・説明の一文は出さない。足すと消え、消すとまた紙の中に戻る。
   空でも「今日｜週｜月」と一日の帯は出る。用事のある日の隣の空の日も同じ絵と題（2026年11月25日の点検1・11）。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("todo-empty");
  const { browser, page, errors } = await open();
  await page.evaluate(() => { location.hash = "todo"; });
  await page.waitForTimeout(400);

  const look = () => page.evaluate(() => {
    const scr = document.getElementById("screen-todo");
    const sheet = scr.querySelector(".tl-sheet");
    const empty = scr.querySelector(".empty");
    const sr = sheet && sheet.getBoundingClientRect();
    const er = empty && empty.getBoundingClientRect();
    return {
      sheet: !!sheet, empty: !!empty,
      inSheet: !!(sheet && empty && sheet.contains(empty)),
      inside: !!(sr && er && er.top >= sr.top && er.bottom <= sr.bottom + 1),
      tall: sr ? sr.height >= innerHeight * 0.62 - 1 : false, h: sr && Math.round(sr.height),
      text: !!scr.querySelector(".empty-text"),
      title: empty ? empty.querySelector(".empty-title").textContent.trim() : "",
      art: !!(empty && empty.querySelector(".empty-art")),
      faces: !!scr.querySelector(".wk-faces .seg-btn[data-face='week']"),
      strip: !!scr.querySelector(".day-strip"),
    };
  });

  const r = await look();
  c.check("空のとき紙がある", r.sheet);
  c.check("空の画面は紙の中", r.inSheet && r.inside, JSON.stringify(r));
  c.check("紙は画面の残りまで（62vh）", r.tall, r.h);
  c.check("題は「やることはありません」", r.title === "やることはありません", r.title);
  c.check("説明の一文は出さない", !r.text);
  c.check("空でも今日｜週｜月がある", r.faces);
  c.check("空でも一日の帯がある", r.strip);

  const id = await page.evaluate(() => KN.store.addTodo({ title: "牛乳", due: KN.util.todayKey() }).id);
  await page.waitForTimeout(300);
  c.check("足すと空の画面は消える", !(await look()).empty);

  /* 用事のある今日から、空のあしたへ：同じ絵と題（左端の小さな字ではない）。 */
  await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); KN.screens.todo.goDay(KN.util.dayKey(d)); });
  await page.waitForTimeout(400);
  const r1 = await look();
  c.check("空の日も絵と題", r1.empty && r1.art && r1.title === "やることはありません", JSON.stringify(r1));
  await page.evaluate(() => KN.screens.todo.goDay(KN.util.todayKey()));
  await page.waitForTimeout(300);

  await page.evaluate((id) => KN.store.removeTodo(id), id);
  await page.waitForTimeout(300);
  const r2 = await look();
  c.check("消すとまた紙の中に", r2.inSheet && r2.inside, JSON.stringify(r2));

  c.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
