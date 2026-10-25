/* 仕事の予定とやること・段3（docs/todo-items.md「仕事の予定とやること」）。

   やることの紙の頭に「今日｜週」。開いたときは週。週の面は上の暦が見ている週の中身で、
   期限（今週と過ぎたもの・赤くしない）→ 今週（今週の印・5行まで・ほかは畳む）→ 七日の行
   （予定とやることの時刻と名前・またがる予定は帯・毎日のくり返しは出さない・過ぎた日は予定だけ薄く）→ 来週の七日 →
   これから（畳む・開くと 待つ・いつか も）。頭の右に「仕事だけ」（端末ごと＝localStorage・記録に書かない）。
   席をもう一度押しても行き来。日を押せばその日の面。払えば次の週。頭の札（期限切れ）はどちらの面にも出さない。
   日の過ぎたまだのやることは、書き換えずに今週へ（七日の行の過ぎた日には出さない・決めごと1）。
   右下の＋は一行（キーボードは勝手に出さない・R4 の札。時刻があれば予定、日が今週なら今週の印、無ければこれから）。
   七日は一日一枚の札（見本の週・10月19日）：週の幅（› で次の週）・締切もその日の札に・予定の数と作業時間のまとめ。
   10月25日（利用者「週が本当に見づらい」）：大きな見出しは 今週・来週・これから だけ（期限・やること＝今週の印は今週の中の
   小見出し）。まとめは見出しのすぐ下の一行（色の見方を兼ねる）。今週の過ぎた日は送って隠さず畳む（押せば開く）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/work-week-face.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("work-week-face");
  const { browser, ctx, page, errors } = await open({
    weekFirst: true,
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); },   // 水曜
  });
  const W = await page.evaluate(() => {
    const U = KN.util, S = KN.store, w = U.weekOf("2026-10-21");
    const at = (k) => w.from <= k && k <= w.to;
    S.addTodo({ title: "打ち合わせ", due: "2026-10-19", time: "15:00", kind: "event", side: "work" });
    S.addTodo({ title: "定例", due: "2026-10-22", time: "09:30", repeat: "weekly", kind: "event", side: "work" });
    S.addTodo({ title: "出張", due: "2026-10-22", endDay: "2026-10-23", kind: "event", side: "work" });
    S.addTodo({ title: "電球を替える", due: "2026-10-22" });
    S.addTodo({ title: "朝の体操", due: "2026-10-21", repeat: "daily" });
    S.addTodo({ title: "経費の精算", deadline: "2026-10-23", side: "work" });
    S.addTodo({ title: "昨日の用事", due: "2026-10-20" });
    for (let i = 1; i <= 7; i++) S.addTodo({ title: "今週の" + i, weekMark: "2026-10-21" });
    S.addTodo({ title: "来週の歯医者", due: "2026-10-28", time: "11:00", kind: "event" });
    S.addTodo({ title: "棚の掃除" });
    S.addTodo({ title: "来月の用事", due: "2026-11-20" });
    S.addTodo({ title: "仕事の書類", side: "work" });
    S.setShelf(S.addTodo({ title: "返事を待つ件" }).id, "wait", "返事");
    S.setShelf(S.addTodo({ title: "いつか読む本" }).id, "someday");
    return { from: w.from, to: w.to, inWeek: at("2026-10-19") && at("2026-10-23") };
  });
  await page.waitForTimeout(400);
  const look = () => page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const wk = scr.querySelector(".wk");
    const txt = (s) => [...scr.querySelectorAll(s)].map((e) => e.textContent.trim());
    return {
      pressed: (scr.querySelector('.wk-faces .seg-btn[aria-pressed="true"]') || {}).textContent,
      week: wk ? wk.dataset.week : null,
      heads: txt(".wk-h"),
      rows: txt(".wk > .wk-list .wk-row .wk-name"),
      later: txt(".wk-later .wk-row .wk-name"),
      laterFacts: txt(".wk-later .wk-row .wk-fact"),
      work: (scr.querySelector(".wk-work") || {}).ariaPressed || null,
      facts: txt(".wk-row .wk-fact"),
      more: txt(".wk-more"),
      days: scr.querySelectorAll(".wk-day").length,
      allNames: [...scr.querySelectorAll(".wk .js-open")].map((e) => e.getAttribute("aria-label") || e.textContent.trim()),
      evs: [...scr.querySelectorAll(".wk-evs")].map((e) => ({ day: e.dataset.day, past: e.classList.contains("is-past"),
        names: [...e.querySelectorAll(".wk-n")].map((n) => n.textContent) })),
      bands: [...scr.querySelectorAll(".wk-band")].map((b) => ({ t: b.getAttribute("aria-label"), row: b.style.gridRow })),
      big: [...scr.querySelectorAll(".wk .wk-h:not(.is-sub)")].map((e) => e.firstChild.textContent.trim()),
      sum: txt(".wk-sum"), sumAt: !!scr.querySelector(".wk > .wk-h + .wk-sum"),
      past: (scr.querySelector(".wk-past") || {}).textContent || "", pastOpen: (scr.querySelector(".wk-past") || { getAttribute: () => null }).getAttribute("aria-expanded"),
      dues: [...scr.querySelectorAll(".wk-ev.is-due")].map((e) => e.closest(".wk-evs").dataset.day + ":" + e.querySelector(".wk-n").textContent),
      road: !!scr.querySelector(".todo-day"),
      dayOf: (scr.querySelector(".todo-day") || {}).dataset ? scr.querySelector(".todo-day")?.dataset.day : null,
      late: scr.querySelectorAll(".tl-late").length,
      red: [...scr.querySelectorAll(".wk")].some((w) => w.querySelector(".is-late")),
    };
  });

  let a = await look();
  c.check("開いたときは週", a.pressed === "週" && !!a.week && !a.road, JSON.stringify(a));
  c.check("見出しは 今週 → 期限 → やること → 来週 → これから（数は出さない）",
    JSON.stringify(a.heads.map((h) => h.replace(/\d.*$|選ぶ$/, ""))) === JSON.stringify(["今週", "期限", "やること", "来週", "これから"])
    && /10月19日〜25日/.test(a.heads[0]) && /10月26日〜11月1日/.test(a.heads[3]), JSON.stringify(a.heads));
  c.check("大きな見出しは 今週・来週・これから だけ（期限・やることは今週の中の小見出し）",
    JSON.stringify(a.big) === JSON.stringify(["今週", "来週", "これから"]), JSON.stringify(a.big));
  c.check("期限は日まで（赤くしない）", a.rows[0] === "経費の精算" && /23日（金）まで/.test(a.facts[0]) && !a.red, JSON.stringify(a.facts));
  c.check("今週のやることは5行まで・ほかは畳む", a.rows.length === 6 && a.more[0] === "ほか 3", JSON.stringify([a.rows, a.more]));
  c.check("今週の過ぎた日は畳む（今日からの五日と来週の七日・畳みに日付の幅）",
    a.days === 12 && a.past === "過ぎた日19日〜20日" && a.pastOpen === "false" && !a.evs.some((e) => e.day < "2026-10-21"), JSON.stringify([a.days, a.past]));
  c.check("まとめは見出しのすぐ下の一行（予定の数・締切の数。長さが無ければ作業時間は出さない。畳んだ日も数える）",
    a.sumAt && a.sum[0] === "予定 3件締切 1件", JSON.stringify(a.sum));
  await page.click(".wk-past");
  await page.waitForTimeout(300);
  a = await look();
  c.check("過ぎた日を押すと開く（七日の行と来週の七日）", a.days === 14 && a.pastOpen === "true", JSON.stringify([a.days, a.pastOpen]));
  const ev = (k) => (a.evs.find((e) => e.day === k) || { names: [] });
  c.check("予定とやることが日の行に（時刻の順）", JSON.stringify(ev("2026-10-22").names) === JSON.stringify(["定例", "電球を替える"]), JSON.stringify(ev("2026-10-22")));
  c.check("締切はその日の札にも（橙・期限の欄にも残る）", a.dues.join() === "2026-10-23:経費の精算", JSON.stringify(a.dues));
  c.check("毎日のくり返しは出さない", !a.evs.some((e) => e.names.includes("朝の体操")));
  c.check("過ぎた日にまだのやることは出さない（今週へ戻る）", !a.evs.some((e) => e.names.includes("昨日の用事")), JSON.stringify(ev("2026-10-20")));
  c.check("過ぎた日の予定は残る（薄く）", W.inWeek ? ev("2026-10-19").past && ev("2026-10-19").names.includes("打ち合わせ") : true, JSON.stringify(ev("2026-10-19")));
  c.check("またがる予定は帯（二日ぶん）", a.bands.length === 1 && a.bands[0].t === "出張" && /\/\s*span 2|\d+ \/ \d+/.test(a.bands[0].row), JSON.stringify(a.bands));
  c.check("頭の札は週の面に出さない", a.late === 0, String(a.late));
  c.check("来週の行に来週の予定・くり返し", ev("2026-10-28").names.includes("来週の歯医者") && ev("2026-10-29").names.includes("定例"),
    JSON.stringify([ev("2026-10-28"), ev("2026-10-29")]));
  c.check("これからは畳んである", a.later.length === 0 && !a.allNames.includes("棚の掃除"), JSON.stringify(a.later));

  await page.click(".wk-later-h");
  await page.waitForTimeout(300);
  a = await look();
  c.check("これからを開くと 日の無いもの・先のもの → 待つ → いつか",
    a.later[0] === "来月の用事" && a.later.slice(1, 3).sort().join() === ["仕事の書類", "棚の掃除"].sort().join()
    && JSON.stringify(a.later.slice(3)) === JSON.stringify(["返事を待つ件", "いつか読む本"]), JSON.stringify(a.later));
  c.check("これからに今週・期限・二週の行のものは出さない",
    !a.later.some((n) => /今週の|経費|電球|昨日/.test(n)), JSON.stringify(a.later));
  c.check("見出しは 待つ・いつか", a.heads.includes("待つ") && a.heads.includes("いつか"), JSON.stringify(a.heads));
  c.check("先の日と待つものを小さく", a.laterFacts.includes("11月20日") && a.laterFacts.includes("返事"), JSON.stringify(a.laterFacts));

  await page.click(".wk-work");
  await page.waitForTimeout(400);
  a = await look();
  const keep = await page.evaluate(() => [localStorage.getItem("kaimono-note-todo-work"),
    JSON.stringify(KN.store.get()).includes("todo-work")]);
  c.check("仕事だけ：仕事のものだけ", a.work === "true" && a.rows.join() === "経費の精算"
    && JSON.stringify(a.later) === JSON.stringify(["仕事の書類"])
    && !a.allNames.some((n) => /電球|歯医者/.test(n)) && a.allNames.some((n) => n.includes("定例")) && a.allNames.includes("出張"), JSON.stringify(a));
  c.check("仕事だけは端末に（記録に書かない）", keep[0] === "1" && keep[1] === false, JSON.stringify(keep));
  await page.click(".wk-work");
  await page.waitForTimeout(400);
  a = await look();
  c.check("もう一度押すと全部", a.work === "false" && a.later.length === 5, JSON.stringify([a.work, a.later]));
  await page.click(".wk-later-h");
  await page.waitForTimeout(300);

  await page.click(".wk-more");
  await page.waitForTimeout(300);
  a = await look();
  c.check("ほかを開くと全部", a.rows.length === 9 && a.more[0] === "畳む", JSON.stringify(a.rows));
  c.check("昨日のまだのやることは今週に（日は書き換えない）", a.rows.includes("昨日の用事")
    && await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "昨日の用事").due === "2026-10-20"), JSON.stringify(a.rows));

  await page.click('.wk-faces .seg-btn[data-face="today"]');
  await page.waitForTimeout(500);
  a = await look();
  c.check("今日を押すと今日の面", a.pressed === "今日" && a.road && !a.week && a.dayOf === "2026-10-21", JSON.stringify(a));
  c.check("頭の札は今日の面にも出さない", a.late === 0, String(a.late));

  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(500);
  a = await look();
  c.check("席をもう一度押すと週へ", a.pressed === "週" && !!a.week, JSON.stringify(a.pressed));

  await page.click('.wk-day[data-day="2026-10-22"]');
  await page.waitForTimeout(500);
  a = await look();
  c.check("日を押すとその日の面", a.pressed === "今日" && a.dayOf === "2026-10-22", JSON.stringify([a.pressed, a.dayOf]));
  await page.click('.wk-faces .seg-btn[data-face="week"]');
  await page.waitForTimeout(500);

  // 払えば次の週（本物のタッチ。tests/day-swipe.js と同じ）
  const box = { y: 520 };
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(330, box.y) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(330 - 24 * i, box.y) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(900);
  a = await look();
  const next = await page.evaluate((f) => KN.util.shiftDay(f, 7), W.from);
  c.check("払えば次の週（見出しは来週だけ・期限・やることは今週だけ）", a.week === next
    && JSON.stringify(a.heads) === JSON.stringify(["来週10月26日〜11月1日"]) && !a.past, JSON.stringify([a.week, next, a.heads]));

  // 済ませる
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(300);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(500);
  await page.click('.wk-row[data-id] .check');
  await page.waitForTimeout(600);
  const done = await page.evaluate(() => KN.store.get().todos.find((t) => t.title === "経費の精算").done);
  c.check("期限の行から済ませられる", done === true);

  // 右下の＋は、どの面でも紙（一行の小窓は 2026年10月20日にやめた——利用者「無駄なステップ」）
  await page.click(".add-fab.js-open-add");
  await page.waitForTimeout(500);
  const pop = await page.evaluate(() => ({ quick: !!document.querySelector(".note-pop.is-quick"), sheet: !!document.querySelector(".sheet.is-open") }));
  c.check("＋：週の面でも紙（一行の小窓は出ない）", !pop.quick && pop.sheet, JSON.stringify(pop));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  // 一行の読み（weekAdd）は受け箱の取り込みが使う。時刻があれば予定、日が今週なら今週の印、日が無ければこれから
  await page.evaluate(() => ["資料を作る 金曜", "歯医者 明日 15時", "棚を拭く", "今日 書類を出す"].forEach((x) => KN.screens.todo.weekAdd(x, { quiet: true })));
  await page.waitForTimeout(300);
  const got = await page.evaluate(() => ["資料を作る", "歯医者", "棚を拭く", "書類を出す"].map((n) => {
    const t = KN.store.get().todos.find((x) => x.title === n);
    return t ? [t.due || "", t.weekMark || "", t.kind || "", t.time || ""].join("/") : null;
  }));
  c.check("一行の読み：日が今週なら今週の印・時刻があれば予定・日が無ければこれから・今日なら今日も",
    JSON.stringify(got) === JSON.stringify(["2026-10-23/2026-10-23//", "2026-10-22//event/15:00", "///", "2026-10-21/2026-10-21//"]),
    JSON.stringify(got));

  /* 今日の面から週へ移ると頭から：今週の見出しが見え、過ぎた日（月・火）は畳まれて今日の行が最初（開いていても畳み直す）。 */
  await page.click(".wk-past"); await page.waitForTimeout(300);
  await page.click('#screen-todo .wk-faces [data-face="today"]'); await page.waitForTimeout(500);
  await page.click('#screen-todo .wk-faces [data-face="week"]'); await page.waitForTimeout(600);
  const hid = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const sc = KN.app.scrollerOf(scr), first = scr.querySelector(".wk .wk-week .wk-day");
    const now = scr.querySelector(".wk-day.is-today"), bar = scr.querySelector(".wk-faces").getBoundingClientRect().bottom;
    return { top: sc.scrollTop, first: first === now, fold: scr.querySelector(".wk-past").getAttribute("aria-expanded"),
      head: Math.round(scr.querySelector(".wk > .wk-h").getBoundingClientRect().top - bar), seen: now.getBoundingClientRect().bottom <= sc.getBoundingClientRect().bottom };
  });
  c.check("週へ移ると頭から：今週の見出しが帯のすぐ下・過ぎた日は畳んで今日の行が最初",
    hid.top === 0 && hid.first && hid.fold === "false" && Math.abs(hid.head) <= 2 && hid.seen, JSON.stringify(hid));

  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
