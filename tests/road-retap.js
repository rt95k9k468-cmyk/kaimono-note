/* daily（席3・id は todo）の席をもう一度押すと「いま」へ（構4c・README 6.3。2026年10月18日の「今日｜週 を行き来」を置き換えた）。
   週の面からは今日の面へ（道が上ならいちばん上）、今日の面では送った所から「いま」へ戻る。週へは 今日｜週｜月 の帯から。
   今日の「いま」の札の右に日記の筆（daily の線の筆と同じ書く紙）。帯の字は archive・notes・daily・shopping・health。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("road-retap");
  const { browser, page, errors } = await open({ road: true,
    weekFirst: true,
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 9, 40)); },
  });
  await page.evaluate(() => {
    for (let h = 7; h < 21; h++) KN.store.addTodo({ title: "用事" + h, due: "2026-10-06", time: `${String(h).padStart(2, "0")}:00`, minutes: 30 });
  });
  c.check("帯の字と読み上げ（id は変えない）", JSON.stringify(await page.evaluate(() => ({
    tabs: [...document.querySelectorAll("#tabbar .tab")].map((b) => b.dataset.tab + ":" + b.querySelector(".tab-label").textContent).join(","),
    a: document.getElementById("screen-archive").getAttribute("aria-label"), t: document.getElementById("screen-todo").getAttribute("aria-label") })))
    === JSON.stringify({ tabs: "archive:archive,notes:notes,todo:daily,list:shopping,diet:health", a: "archive", t: "daily" }));
  /* 立ち上げがやることなら、先によそへ移ってから入る（入るときの一押しは「もう一度」ではない）。 */
  await page.click('.tab[data-tab="list"]');
  await page.waitForTimeout(600);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);
  const where = () => page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const sc = KN.app.scrollerOf(scr);
    return { top: sc.scrollTop, road: !!scr.querySelector(".day-road"), week: !!scr.querySelector(".wk") };
  });
  const a = await where();
  c.check("入ったときは週の面", a.week && !a.road, JSON.stringify(a));
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  const b = await where();
  c.check("もう一度押すと今日の面の道（いちばん上）", b.road && b.top === 0, JSON.stringify(b));
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 200; });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  const d = await where();
  c.check("また押すと今日の面のまま「いま」へ戻る", !d.week && d.road && d.top === b.top, JSON.stringify(d));

  /* ---- 「いま」の筆 ---- */
  const pen = await page.evaluate(() => {
    const b = document.querySelector("#screen-todo .day-slide:not(.is-peek) .tl-now .tl-now-pen");
    if (!b) return null;
    b.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect(), t = b.parentElement.querySelector(".tl-time").getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { label: b.getAttribute("aria-label"), right: r.left >= t.right - 1, mid: Math.abs((r.top + r.bottom) / 2 - (t.top + t.bottom) / 2) <= 1,
      hit: !!hit && !!hit.closest(".tl-now-pen"), on: hit && hit.className };
  });
  c.check("今日の「いま」の札の右に筆（押せる）", !!pen && pen.label === "いまのことを書く" && pen.right && pen.mid && pen.hit, JSON.stringify(pen));
  await page.click("#screen-todo .day-slide:not(.is-peek) .tl-now-pen");
  await page.waitForSelector(".sheet.is-open .js-memo", { timeout: 3000 });
  const s = await page.evaluate(() => {
    const el = document.querySelector(".sheet.is-open");
    return { ok: el.querySelector(".js-ok").textContent.trim(), title: el.querySelector(".sheet-title").textContent.trim(), at: el.querySelector(".wr-cur .js-at").textContent };
  });
  c.check("筆は daily の線の筆と同じ書く紙（今日・いまの時刻）", s.ok === "書き終える" && /10月6日/.test(s.title) && s.at === "09:40", JSON.stringify(s));
  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
