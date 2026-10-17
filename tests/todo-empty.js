/* やることの空の画面（docs/roadmap-3.2.md の H1）。用事が一つも無いとき、`.empty` は紙（`.tl-sheet`）の
   中・紙は画面の残りまで届く・説明の一文は出さない。足すと消え、消すとまた紙の中に戻る。 */
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
    };
  });

  const r = await look();
  c.check("空のとき紙がある", r.sheet);
  c.check("空の画面は紙の中", r.inSheet && r.inside, JSON.stringify(r));
  c.check("紙は画面の残りまで（62vh）", r.tall, r.h);
  c.check("題は「やることはありません」", r.title === "やることはありません", r.title);
  c.check("説明の一文は出さない", !r.text);

  const id = await page.evaluate(() => KN.store.addTodo({ title: "牛乳", due: KN.util.todayKey() }).id);
  await page.waitForTimeout(300);
  c.check("足すと空の画面は消える", !(await look()).empty);

  await page.evaluate((id) => KN.store.removeTodo(id), id);
  await page.waitForTimeout(300);
  const r2 = await look();
  c.check("消すとまた紙の中に", r2.inSheet && r2.inside, JSON.stringify(r2));

  c.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
