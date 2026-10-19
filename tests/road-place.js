/* 今日の面の札の時間割と、一日の道の置き場（2026年10月19日、利用者。docs/todo-timeline.md「札の時間割」）。

   時間割は種類の色の札（予定は --kind-event、やることは --kind-task）。札の左上に用事の絵、題 → メモの順。
   道は設定で 上（既定・todoRoadAt を持たない）・下（todoRoadAt: "below"）・出さない（todoRoad: false）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/road-place.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("road-place");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); },
  });
  await page.evaluate(() => {
    const S = KN.store;
    S.addTodo({ title: "打ち合わせ", due: "2026-10-21", time: "13:00", minutes: 60, kind: "event", memo: "三階" });
    S.addTodo({ title: "書類を書く", due: "2026-10-21", time: "15:00", minutes: 90 });
  });
  await page.waitForTimeout(400);
  const look = () => page.evaluate(() => {
    const day = document.querySelector("#screen-todo .todo-day");
    const kids = day ? [...day.children].map((e) => (e.classList.contains("day-road") ? "road" : e.classList.contains("tl") ? "tl" : "")) : [];
    const row = (t) => [...document.querySelectorAll("#screen-todo .tl-row")].find((r) => r.textContent.includes(t));
    const ev = row("打ち合わせ"), td = row("書類を書く");
    const body = ev && ev.querySelector(".tl-body");
    return {
      order: kids.filter(Boolean).join(">"),
      ev: ev ? ev.getAttribute("style") : "", td: td ? td.getAttribute("style") : "",
      ico: !!(body && body.firstElementChild.classList.contains("tl-ico")),
      capAfter: !!(body && body.querySelector(".item-name + .tl-cap")),
      bg: ev ? getComputedStyle(ev.querySelector(".tl-item")).backgroundColor : "",
    };
  });
  let a = await look();
  c.check("既定は道が上（設定を持たない保存）", a.order === "road>tl", a.order);
  c.check("予定は青、やることは緑の札", /--kind-event/.test(a.ev) && /--kind-task/.test(a.td), JSON.stringify([a.ev, a.td]));
  c.check("札に地の色", a.bg && a.bg !== "rgba(0, 0, 0, 0)", a.bg);
  c.check("札の左上に用事の絵・題の下にメモ", a.ico && a.capAfter, JSON.stringify(a));

  await page.evaluate(() => KN.store.update((s) => { s.settings.todoRoadAt = "below"; }));
  await page.waitForTimeout(400);
  a = await look();
  c.check("下を選ぶと道は時間割の下", a.order === "tl>road", a.order);

  await page.evaluate(() => KN.store.update((s) => { s.settings.todoRoad = false; }));
  await page.waitForTimeout(400);
  a = await look();
  c.check("出さないなら道は無い", a.order === "tl", a.order);

  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
