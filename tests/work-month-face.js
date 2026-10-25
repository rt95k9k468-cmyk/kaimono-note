/* 月の面（2026年10月19日、利用者。docs/todo-items.md「仕事の予定とやること」の「見本に寄せた週」の続き）。

   面は 今日｜週｜月。「月」を押すと暦が月の段に開き、下はその月の予定・やること・締切を日ごとに（予定の無い日は出さない・
   時刻 → 名前・またがる予定は始まりの日に「〜終わりの日」・下に今月のまとめ）。暦の日を押すとその日の行へ送り、題もその日。
   紙を送ると暦の輪と題がついてくる。暦を畳めば週の面、「今日」「週」へ移れば暦は週へ畳む。
   暦の印は名前（代表は予定 → やること → 締切）。月の面は暦を画面の65%まで背高に、名前は入るだけ・あふれは「+n」。
   月の面の暦は全タブの暦の札に書かない（ほかのタブへ移っても暦は週。2026年10月25日）。一行は週の面と同じ（終わりは名前のあと）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/work-month-face.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("work-month-face");
  const { browser, page, errors } = await open({
    weekFirst: true,
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); },   // 水曜
  });
  const h0 = await page.evaluate(() => document.querySelector('#head .cal-day[data-day="2026-10-23"]').getBoundingClientRect().height);
  await page.evaluate(() => {
    const S = KN.store;
    S.addTodo({ title: "打ち合わせ", due: "2026-10-19", time: "15:00", kind: "event", side: "work" });
    S.addTodo({ title: "定例", due: "2026-10-22", time: "09:30", repeat: "weekly", kind: "event", side: "work" });
    S.addTodo({ title: "電球を替える", due: "2026-10-22" });
    S.addTodo({ title: "書類", due: "2026-10-22", time: "13:00", minutes: 90 });
    S.addTodo({ title: "出張", due: "2026-10-27", endDay: "2026-10-28", kind: "event", side: "work" });
    S.addTodo({ title: "経費の精算", deadline: "2026-10-23", side: "work" });
    S.addTodo({ title: "朝の体操", due: "2026-10-21", repeat: "daily" });
    for (let i = 0; i < 40; i++) S.addTodo({ title: "先の用事" + i, due: "2026-10-30" });
  });
  await page.waitForTimeout(300);
  await page.click('#screen-todo .wk-faces [data-face="month"]');
  await page.waitForTimeout(700);
  const mtop = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo"), sc = KN.app.scrollerOf(scr);
    const d = [...scr.querySelectorAll(".mo .mo-day")];
    return { top: sc.scrollTop, n: d.length, first: d[0] && d[0].dataset.day, hit: d.find((e) => e.dataset.day >= "2026-10-21").getBoundingClientRect().top - d[0].getBoundingClientRect().top };
  });
  c.check("月の面は今日以後が頭・過ぎた日は上へ隠れる", mtop.first < "2026-10-21" && mtop.top > 0, JSON.stringify(mtop));
  const look = () => page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const cal = document.querySelector("#head .cal");
    const cell = (k) => cal.querySelector(`.cal-day[data-day="${k}"]:not(.is-out)`);
    const name = (k) => { const n = cell(k).querySelector(".cal-name"); return n && getComputedStyle(n).display !== "none" ? n.textContent : ""; };
    const day = (k) => { const d = scr.querySelector(`.mo-day[data-day="${k}"]`); return d ? [...d.querySelectorAll(".wk-ev")].map((e) => e.textContent.trim()) : null; };
    return {
      face: (scr.querySelector('.wk-faces .seg-btn[aria-pressed="true"]') || {}).textContent,
      open: KN.store.calPrefs("todo").open, week: cal.classList.contains("is-week"),
      days: [...scr.querySelectorAll(".mo-day")].map((d) => d.dataset.day),
      d22: day("2026-10-22"), d27: day("2026-10-27"), d23: day("2026-10-23"), d19: day("2026-10-19"),
      sum: (scr.querySelector(".mo .wk-sum") || {}).textContent || "",
      n22: name("2026-10-22"), n23: name("2026-10-23"), n27: name("2026-10-27"), n24: name("2026-10-24"),
      h: cell("2026-10-23").getBoundingClientRect().height,
      bottom: cal.getBoundingClientRect().bottom, vh: innerHeight, tall: cal.classList.contains("is-tall"),
      d30: [...cell("2026-10-30").querySelectorAll(".cal-name")].filter((n) => getComputedStyle(n).display !== "none").length,
      more30: (cell("2026-10-30").querySelector(".cal-rest") || {}).textContent || "",
      title: document.querySelector("#head .js-day-title")?.textContent || "",
      here: cal.querySelector(".cal-day.is-here")?.dataset.day || null,
    };
  });
  let a = await look();
  /* 月の面の暦は月の面のもの。全タブの暦の札（open）は書かない（2026年10月25日。書いていたので、ほかのタブへ移ると暦が月で出ていた）。 */
  c.check("月を押すと月の面・暦は月の段（全タブの札は書かない）", a.face === "月" && !a.open && !a.week, JSON.stringify([a.face, a.open, a.week]));
  c.check("予定のある日だけ（過ぎた日は予定だけ・毎日のくり返しは出さない）",
    JSON.stringify(a.days) === JSON.stringify(["2026-10-19", "2026-10-22", "2026-10-23", "2026-10-27", "2026-10-29", "2026-10-30"]), JSON.stringify(a.days));
  // 終わりの時刻は名前のあとに薄く（週の面と同じ一行。2026年10月25日）
  c.check("時刻 → 名前の順（時刻の順）", JSON.stringify(a.d22) === JSON.stringify(["9:30定例", "13:00書類〜14:30", "電球を替える"]), JSON.stringify(a.d22));
  // またがる予定の終わりの日も名前のあと（時刻の列に入れると列からはみ出し、名前が右へずれていた）
  c.check("締切とまたがる予定", /締切経費の精算/.test(a.d23.join()) && /出張〜10\/28/.test(a.d27.join()), JSON.stringify([a.d23, a.d27]));
  const sumFirst = await page.evaluate(() => { const s = document.querySelector("#screen-todo .mo .wk-sum"); return !!s && s.previousElementSibling.matches(".wk-h") && s.nextElementSibling.matches(".mo-list"); });
  c.check("今月のまとめ（予定の数・作業時間・締切）は見出しのすぐ下の一行", sumFirst && /予定 4件/.test(a.sum) && /作業時間 1時間30分/.test(a.sum) && /締切 1件/.test(a.sum), a.sum);
  c.check("暦の月の段に名前（代表は予定）", a.n22 === "定例" && a.n23 === "経費の精算" && a.n27 === "出張" && a.n24 === "", JSON.stringify([a.n22, a.n23, a.n27, a.n24]));
  c.check("月の面は暦が画面の65%まで背高", a.tall && a.h > h0 + 20 && Math.abs(a.bottom - a.vh * 0.65) < 8, JSON.stringify([h0, a.h, a.bottom, a.vh]));
  c.check("入りきらない名前は最後の段を「+n」に", a.d30 >= 1 && a.more30 === `+${40 - a.d30}`, JSON.stringify([a.d30, a.more30]));

  // 月の面のまま買うものへ移っても、そちらの暦は週のまま。戻れば月の面（背の高い月）
  const calOf = () => page.evaluate(() => { const c = document.querySelector("#head .cal"); return { week: c.classList.contains("is-week"), tall: c.classList.contains("is-tall") }; });
  await page.click("#tabbar .tab-list"); await page.waitForTimeout(700);
  const shop = await calOf();
  await page.click("#tabbar .tab-todo"); await page.waitForTimeout(700);
  const back = await calOf();
  a = await look();
  c.check("月の面から買うものへ移っても暦は週・戻れば月の面", shop.week && !shop.tall && back.tall && a.face === "月", JSON.stringify([shop, back, a.face]));

  // 暦の日を押すと、その日の行へ送り、題と輪もその日
  await page.click('#head .cal-day[data-day="2026-10-30"]');
  await page.waitForTimeout(900);
  const pos = await page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
    const r = document.querySelector('#screen-todo .mo-day[data-day="2026-10-30"]').getBoundingClientRect();
    const bar = document.querySelector("#screen-todo .wk-faces").offsetHeight;   // 貼りつく「今日｜週｜月」の帯
    return { top: r.top - sc.getBoundingClientRect().top, scroll: sc.scrollTop, bar };
  });
  a = await look();
  /* 帯の下から 8px（帯の裏に隠れない。前は器の頭から 8px で、押した日の行が帯に隠れていた。2026年10月24日）。 */
  c.check("暦の日を押すと、その日の行へ（面は月のまま・帯に隠れない）", a.face === "月" && pos.scroll > 0 && pos.bar > 0
    && Math.abs(pos.top - pos.bar - 8) < 4, JSON.stringify(pos));
  c.check("輪と題もその日", a.here === "2026-10-30" && /30日/.test(a.title), JSON.stringify([a.here, a.title]));

  // 紙を頭へ送り戻すと、輪がついてくる
  await page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
    const r = document.querySelector('#screen-todo .mo-day[data-day="2026-10-22"]').getBoundingClientRect();
    sc.scrollTop += r.top - sc.getBoundingClientRect().top - 10;
    sc.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(400);
  a = await look();
  c.check("送ると暦の輪がついてくる", a.here === "2026-10-22", String(a.here));

  // 同じ日を続けて二度押すと、その日に足す紙（一度目は送るだけ）
  await page.click('#head .cal-day[data-day="2026-10-28"]'); await page.waitForTimeout(120);
  const once = await page.$(".sheet.is-open");
  await page.click('#head .cal-day[data-day="2026-10-28"]'); await page.waitForTimeout(600);
  const dbl = await page.evaluate(() => (document.querySelector(".sheet.is-open") || {}).textContent || "");
  c.check("月の面で日を二度押すと、その日に足す紙", !once && /10月28日/.test(dbl), dbl.replace(/\s+/g, " ").slice(0, 80));
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);

  // 週へ移ると暦は週へ畳む
  await page.click('#screen-todo .wk-faces [data-face="week"]');
  await page.waitForTimeout(700);
  a = await look();
  c.check("週へ移ると暦は週の段・名前は週の段にも出す", a.face === "週" && !a.open && a.week && !a.tall && a.n22 === "定例", JSON.stringify([a.face, a.open, a.week, a.n22]));

  // 月 → 題を押して暦を畳むと週の面
  await page.click('#screen-todo .wk-faces [data-face="month"]');
  await page.waitForTimeout(700);
  await page.click("#head .js-day-title");
  await page.waitForTimeout(700);
  a = await look();
  c.check("題を押して暦を畳むと週の面", a.face === "週" && !a.open && a.week && !a.tall, JSON.stringify([a.face, a.open, a.week, a.tall]));

  // 札が月を開いていたら、月の面を出るとき週へ畳む（docs/todo-items.md「今日・週へは暦を週へ畳む」）
  await page.evaluate(() => KN.store.setCalPref("todo", { open: true }));
  await page.waitForTimeout(300);
  await page.click('#screen-todo .wk-faces [data-face="month"]');
  await page.waitForTimeout(700);
  const opened = await calOf();
  await page.click('#screen-todo .wk-faces [data-face="today"]');
  await page.waitForTimeout(700);
  a = await look();
  c.check("札が月でも、月の面は背の高い月・出れば週へ畳む", opened.tall && !opened.week && a.face === "今日" && !a.open && a.week, JSON.stringify([opened, a.face, a.open, a.week]));

  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
