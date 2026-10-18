/* 仕事の予定とやること・段3の続き：月の紙（docs/todo-items.md「仕事の予定とやること」の画面）。

   月の紙は作らず、上の帯の暦の月の段で見る。印は点・帯（またがる予定）・期限の縁だけ。升目に名前は入れない
   （読み上げにだけ）。帯と縁でマスの高さは変わらない。週の面で月の段の日を押せばその週（暦は週へ畳む）、
   週の段で押せばその日の面（前のまま）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/work-month.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("work-month");
  const { browser, page, errors } = await open({
    weekFirst: true,
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); },   // 水曜
  });
  const h0 = await page.evaluate(async () => {
    KN.store.setCalPref("todo", { open: true, shown: true });
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('#head .cal-day[data-day="2026-10-23"]').getBoundingClientRect().height;
  });
  await page.evaluate(() => {
    const S = KN.store;
    S.addTodo({ title: "出張", due: "2026-10-22", endDay: "2026-10-24", kind: "event", side: "work" });
    S.addTodo({ title: "研修", due: "2026-10-23", endDay: "2026-10-27", kind: "event" });
    S.addTodo({ title: "経費の精算", deadline: "2026-10-23", side: "work" });
    S.addTodo({ title: "電球を替える", due: "2026-10-22" });
  });
  await page.waitForTimeout(400);
  const look = () => page.evaluate(() => {
    const cal = document.querySelector("#head .cal");
    const cell = (k) => cal.querySelector(`.cal-day[data-day="${k}"]:not(.is-out)`) || cal.querySelector(`.cal-day[data-day="${k}"]`);
    const spans = (k) => [...cell(k).querySelectorAll(".cal-span")].map((s) =>
      [s.style.getPropertyValue("--lane"), s.classList.contains("is-s") ? "s" : "", s.classList.contains("is-e") ? "e" : ""].join(""));
    const due = (k) => !!cell(k).querySelector(".cal-due");
    const span = cal.querySelector(".cal-span");
    return {
      s22: spans("2026-10-22"), s23: spans("2026-10-23"), s24: spans("2026-10-24"), s27: spans("2026-10-27"), s21: spans("2026-10-21"),
      d23: due("2026-10-23"), d22: due("2026-10-22"),
      h: cell("2026-10-23").getBoundingClientRect().height,
      names: /出張|研修|経費/.test(cal.textContent),
      label: cell("2026-10-23").getAttribute("aria-label"),
      color: span ? getComputedStyle(span).backgroundColor : "",
      dueRing: getComputedStyle(cell("2026-10-23").querySelector(".cal-due")).boxShadow,
      week: (document.querySelector("#screen-todo .wk") || {}).dataset?.week || null,
      open: KN.store.calPrefs("todo").open,
      face: (document.querySelector('#screen-todo .wk-faces .seg-btn[aria-pressed="true"]') || {}).textContent,
      dayOf: document.querySelector("#screen-todo .todo-day")?.dataset.day || null,
    };
  });

  let a = await look();
  c.check("帯：始まりと終わりの日に端", a.s22.join() === "0s" && a.s23.includes("0") && a.s24.includes("0e"), JSON.stringify(a));
  c.check("重なる帯は次の筋", a.s23.includes("1s") && a.s27.join() === "1e" && a.s21.length === 0, JSON.stringify([a.s23, a.s27, a.s21]));
  c.check("期限は縁だけ", a.d23 && !a.d22 && !/none/.test(a.dueRing), a.dueRing);
  c.check("帯の色が解ける（暦は帯の中）", !!a.color && !/rgba\(0, 0, 0, 0\)|^$/.test(a.color), a.color);
  c.check("升目に名前は入れない（読み上げにだけ）", !a.names && /出張/.test(a.label) && /経費の精算の期限/.test(a.label), a.label);
  c.check("帯と縁でマスの高さは変わらない", Math.abs(a.h - h0) < 0.5, `${h0} → ${a.h}`);

  // 週の面で、月の段の日を押すとその週（暦は週へ畳む）
  await page.click('#head .cal-day[data-day="2026-10-29"]');
  await page.waitForTimeout(700);
  a = await look();
  c.check("月の段で押すとその週・暦は週へ", a.face === "週" && a.week === "2026-10-26" && a.open === false, JSON.stringify([a.face, a.week, a.open]));

  // 週の段で押せばその日の面（前のまま）
  await page.click('#head .cal-day[data-day="2026-10-27"]');
  await page.waitForTimeout(700);
  a = await look();
  c.check("週の段で押すとその日の面", a.face === "今日" && a.dayOf === "2026-10-27", JSON.stringify([a.face, a.dayOf]));

  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
