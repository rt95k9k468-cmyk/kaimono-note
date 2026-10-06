/* 活動（3.0 の A1、docs/roadmap-3.0.md・docs/todo-timeline.md の「活動」。2026年10月6日）。
   一つの活動を、予定（act 付きのやること）と実績（minutes・at 付きの積み上げ）で持つ。
   - 時間割で済ませると、予定の長さで積み上げが一件生まれ、互いの id で結ばれる。題・種類・
     本の著者は予定から。知らせは「45分で残しました」と「直す」「元に戻す」。「直す」は長さだけ
   - 元に戻すと積み上げも消える。外してまた済ませても二件目は作らない
   - 道は実績を引く：結んだ積み上げの時刻と長さで描く。縁取りの丸薬（is-act・種類の色・塗らない）
   - 詳細の紙の頭に「積み上げ『…』」の札。押せば記録の紙
   - 記録の紙：新しく書くときは「道に置く」（時刻と長さ → その日に act 付きの用事、記録は作らない）、
     前の記録は「道に記録する」（at・minutes を書くだけ、用事は作らない）→ その日の道に描く
   - 道の空きを押すと「活動」の行（覚えている本）。選べばその時刻に置く
   - 片方を消しても、もう片方は残る（ふつうの用事・ふつうの記録に戻る）
   - daily：積み上げの行に「50分」、枠の頭にその日の合計。結んだ用事は二度並べない
   - 読み直しても欄が残る

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/activity.js */
const { open, checker } = require("./lib");

const TODAY = "2026-10-06";
const NEXT = "2026-10-07";

(async () => {
  const c = checker("activity");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 10, 0)); },
  });
  const wait = (ms) => page.waitForTimeout(ms);
  const topSheet = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh ? { title: (sh.querySelector(".sheet-title") || { textContent: "" }).textContent.trim(), text: sh.textContent } : null;
  });
  const entries = () => page.evaluate(() => KN.store.get().archive.entries.map((e) => ({ ...e })));
  const todo = (id) => page.evaluate((i) => KN.store.getTodo(i), id);

  /* 前に読んだ本（著者を写すため） */
  await page.evaluate(() => KN.store.addEntry({ type: "reading", title: "坊っちゃん", author: "夏目漱石", kind: "book", date: "2026-10-05" }));

  /* ---------------- 予定 → 済ませる → 実績 ---------------- */
  const id = await page.evaluate((d) => KN.activity.plant({ type: "reading", title: "坊っちゃん", day: d, at: "08:00", minutes: 45 }).id, TODAY);
  let t = await todo(id);
  c.check("予定の題は「読書『坊っちゃん』」・act は読書・結びはまだ",
    t.title === "読書『坊っちゃん』" && t.act && t.act.type === "reading" && t.act.entry === null
    && t.due === TODAY && t.time === "08:00" && t.minutes === 45, JSON.stringify(t));

  await page.click('.tab[data-tab="todo"]');
  await wait(600);
  await page.locator(`.tl-row[data-todo-id="${id}"] button.check:visible`).first().click();
  await wait(1200);
  const msg = await page.evaluate(() => (document.querySelector(".toast-msg") || {}).textContent || "");
  const acts = await page.evaluate(() => [...document.querySelectorAll(".toast-action")].map((b) => b.textContent.trim()));
  c.check("知らせは「45分で残しました」", msg === "45分で残しました", msg);
  c.check("知らせに「直す」「元に戻す」", acts.join(",") === "直す,元に戻す", acts.join(","));
  t = await todo(id);
  let es = await entries();
  let e = es.find((x) => x.todo === id);
  c.check("積み上げが一件生まれ、互いの id で結ばれる", !!e && t.act.entry === e.id, JSON.stringify([t.act, e]));
  c.check("題・種類・著者は予定から、長さは予定の長さ、始まりは決めた時刻",
    !!e && e.type === "reading" && e.title === "坊っちゃん" && e.author === "夏目漱石" && e.kind === "book"
    && e.minutes === 45 && e.at === "08:00" && e.date === TODAY && e.memo === "", JSON.stringify(e));

  /* 直す：長さだけ（札と ±5分） */
  await page.locator(".toast-action", { hasText: "直す" }).click();
  await wait(500);
  let sh = await topSheet();
  c.check("「直す」で長さの紙", !!sh && sh.title === "長さ", JSON.stringify(sh));
  c.check("長さの紙に札（15分〜1時間）と ±5分",
    await page.evaluate(() => {
      const s = [...document.querySelectorAll(".sheet.is-open")].pop();
      const chips = [...s.querySelectorAll(".chip")].map((x) => x.textContent.trim());
      return ["15分", "25分", "30分", "45分", "1時間"].every((w) => chips.includes(w)) && !!s.querySelector(".js-more") && !s.querySelector("input");
    }));
  await page.locator(".sheet.is-open .js-more").click();
  await page.locator(".sheet.is-open .sheet-footer .btn-primary, .sheet.is-open .btn-primary").last().click();
  await wait(500);
  e = (await entries()).find((x) => x.todo === id);
  c.check("＋5分で 50分に直る", e.minutes === 50, String(e.minutes));

  /* 道は実績を引く */
  const road = () => page.evaluate((i) => {
    const el = document.querySelector("#screen-todo .day-road");
    const st = el.__road;
    const k = st.stops.findIndex((s) => s.t.id === i);
    const g = el.querySelector(`.road-stop[data-s="${k}"]`);
    return k < 0 ? null : {
      at: st.stops[k].at, until: st.stops[k].until, cls: g.getAttribute("class"),
      c: g.style.getPropertyValue("--act-c"), went: g.querySelector(".road-stop-went").getAttribute("d"),
      edge: getComputedStyle(g.querySelector(".road-stop-edge")).stroke,
    };
  }, id);
  await wait(400);
  let r = await road();
  c.check("道の丸薬は記録の長さ（8:00〜8:50）", !!r && r.at === 480 && r.until === 530, JSON.stringify(r));
  c.check("活動は縁取りの丸薬（is-act・種類の色・塗らない）",
    !!r && /is-act/.test(r.cls) && r.c.trim() === "#5b9bd5" && !r.went, JSON.stringify(r));
  c.check("縁は種類の色", !!r && /91, 155, 213/.test(r.edge), r && r.edge);
  await page.evaluate((x) => KN.store.updateEntry(x, { at: "07:00" }), e.id);
  await wait(500);
  r = await road();
  c.check("記録の時刻を直すと、道もそこに描く（記録から引く）", !!r && r.at === 420 && r.until === 470, JSON.stringify(r));
  t = await todo(id);
  c.check("予定の時刻と長さは書き換えない", t.time === "08:00" && t.minutes === 45, JSON.stringify([t.time, t.minutes]));

  /* 詳細の紙の頭の札 */
  await page.evaluate((i) => KN.screens.todo.open(i), id);
  await wait(600);
  const chip = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".sheet.is-open .js-act-src")].pop();
    return b && !b.hidden ? b.textContent.trim() : null;
  });
  c.check("詳細の紙の頭に「積み上げ『坊っちゃん』」", chip === "積み上げ『坊っちゃん』", String(chip));
  await page.locator(".sheet.is-open .js-act-src").last().click();
  await wait(700);
  sh = await topSheet();
  c.check("札を押すと記録の紙", !!sh && sh.title === "記録を直す" && /坊っちゃん/.test(await page.evaluate(() =>
    [...document.querySelectorAll(".sheet.is-open .js-title")].pop().value)), JSON.stringify(sh && sh.title));
  await page.keyboard.press("Escape");
  await wait(500);

  /* 元に戻す・二度作らない（store） */
  const u = await page.evaluate((d) => {
    const S = KN.store;
    const x = KN.activity.plant({ type: "study", title: "英単語", day: d, at: "09:00", minutes: 25 });
    const n0 = S.get().archive.entries.length;
    const res = S.toggleTodo(x.id);
    const born = res.entry;
    const n1 = S.get().archive.entries.length;
    res.undo();
    const after = { ...S.getTodo(x.id), act: { ...S.getTodo(x.id).act } };   // 生きた記録は後で変わるので写す
    const n2 = S.get().archive.entries.length;
    S.toggleTodo(x.id);                      // 済ませる
    S.toggleTodo(x.id);                      // 外す
    S.toggleTodo(x.id);                      // また済ませる
    const linked = S.get().archive.entries.filter((y) => y.todo === x.id).length;
    return { born: !!born, n0, n1, n2, done: after.done, entry: after.act.entry, linked, xid: x.id };
  }, TODAY);
  c.check("元に戻すと、生まれた積み上げも消え、結びも外れる",
    u.born && u.n1 === u.n0 + 1 && u.n2 === u.n0 && !u.done && u.entry === null, JSON.stringify(u));
  c.check("外してまた済ませても、積み上げは一件のまま", u.linked === 1, JSON.stringify(u));

  /* ---------------- 記録の紙：道に置く ---------------- */
  await page.click('.tab[data-tab="archive"]');
  await wait(600);
  const nTodos = await page.evaluate(() => KN.store.get().todos.length);
  const nEnt = (await entries()).length;
  await page.evaluate(() => KN.screens.archive.dockButton().querySelector(".js-open-add").click());
  await wait(600);
  const roadBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".sheet.is-open .js-road")].pop();
    return b && !b.hidden ? b.textContent.trim() : null;
  });
  c.check("新しく書く紙に「道に置く」", roadBtn === "道に置く", String(roadBtn));
  await page.locator(".sheet.is-open .js-title").last().fill("こころ");
  await page.locator(".sheet.is-open .js-road").last().click();
  await wait(600);
  sh = await topSheet();
  c.check("時刻と長さの紙（車輪二つ・長さの札）", !!sh && sh.title === "道に置く" && await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    return s.querySelectorAll(".note-wheel").length === 2 && s.querySelectorAll(".tw-mins .chip").length === 5;
  }), JSON.stringify(sh && sh.title));
  const def = await page.evaluate(() => [...[...document.querySelectorAll(".sheet.is-open")].pop()
    .querySelectorAll("[aria-selected=true]")].map((r) => r.textContent.trim()));
  c.check("車輪ははじめ今の時刻（10:00）・長さは30分", def.join() === "10時,00分", def.join());
  await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    const [h, m] = s.querySelectorAll(".note-wheel");
    h.scrollTop = 20 * 40; m.scrollTop = 6 * 40;     // 20:30
    [...s.querySelectorAll(".tw-mins .chip")].find((x) => x.textContent.trim() === "25分").click();
  });
  await wait(250);
  await page.locator(".sheet.is-open .js-ok").last().click();
  await wait(600);
  const placed = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "読書『こころ』"));
  c.check("その日に act 付きの用事（20:30・25分）",
    !!placed && placed.act && placed.act.type === "reading" && placed.due === "2026-10-06"
    && placed.time === "20:30" && placed.minutes === 25, JSON.stringify(placed));
  c.check("道に置いても記録は作らない", (await entries()).length === nEnt
    && await page.evaluate(() => KN.store.get().todos.length) === nTodos + 1);
  const toast1 = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("知らせに「元に戻す」", /20:30/.test(toast1) && /元に戻す/.test(toast1), toast1);

  /* ---------------- 前の記録：道に記録する ---------------- */
  const past = await page.evaluate(() => KN.store.get().archive.entries.find((x) => x.title === "坊っちゃん" && !x.todo).id);
  await page.evaluate((x) => KN.screens.archive.openEntry(x), past);
  await wait(600);
  const rec = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".sheet.is-open .js-road")].pop();
    return b && !b.hidden ? b.textContent.trim() : null;
  });
  c.check("前の記録の紙に「道に記録する」", rec === "道に記録する", String(rec));
  await page.locator(".sheet.is-open .js-road").last().click();
  await wait(700);
  sh = await topSheet();
  c.check("道に記録する紙", !!sh && sh.title === "道に記録する", JSON.stringify(sh && sh.title));
  await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    const [h, m] = s.querySelectorAll(".note-wheel");
    h.scrollTop = 21 * 40; m.scrollTop = 0;          // 21:00
    [...s.querySelectorAll(".tw-mins .chip")].find((x) => x.textContent.trim() === "30分").click();
  });
  await wait(250);
  await page.locator(".sheet.is-open .js-ok").last().click();
  await wait(600);
  const pe = (await entries()).find((x) => x.id === past);
  c.check("その記録に at・minutes を書く", pe.at === "21:00" && pe.minutes === 30 && !pe.todo, JSON.stringify(pe));
  c.check("用事は作らない", await page.evaluate(() => KN.store.get().todos.length) === nTodos + 1);

  /* daily：長さと合計 */
  await page.evaluate((d) => KN.screens.archive && KN.store.updateEntry(
    KN.store.get().archive.entries.find((x) => x.title === "坊っちゃん" && !x.todo).id, { date: d }), TODAY);
  await page.click('.tab[data-tab="todo"]');
  await wait(300);
  await page.click('.tab[data-tab="archive"]');
  await wait(700);
  const feed = await page.evaluate(() => {
    const box = document.querySelector('#screen-archive .arc-feed-box[data-src="entry"]');
    const todoBox = document.querySelector('#screen-archive .arc-feed-box[data-src="todo"]');
    return {
      sum: box && (box.querySelector(".arc-feed-sum") || {}).textContent,
      lens: box ? [...box.querySelectorAll(".arc-feed-len")].map((x) => x.textContent.trim()) : [],
      todoText: todoBox ? todoBox.textContent : "",
      text: document.querySelector("#screen-archive").textContent,
    };
  });
  /* 今日の積み上げ：坊っちゃん 50分（結んだもの）・英単語 25分（結んだもの）・坊っちゃん 30分（道に記録した） */
  c.check("積み上げの行に長さ", ["50分", "25分", "30分"].every((w) => feed.lens.includes(w)), JSON.stringify(feed.lens));
  c.check("枠の頭にその日の合計（1時間45分）", feed.sum === "1時間45分", String(feed.sum));
  c.check("結んだ用事は、やることの枠に二度並べない", !/読書『坊っちゃん』|学習『英単語』/.test(feed.todoText), feed.todoText);
  c.check("daily に平均・比べる言葉を出さない", !/平均|先月|前月|目標|連続|割合/.test(feed.text));

  /* 道：結ばれていない記録も、その日の道に（押せば記録の紙） */
  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  const lone = await page.evaluate((x) => {
    const el = document.querySelector("#screen-todo .day-road");
    const k = el.__road.stops.findIndex((s) => s.t.id === `arc:${x}`);
    const g = el.querySelector(`.road-stop[data-s="${k}"]`);
    return k < 0 ? null : { k, at: el.__road.stops[k].at, until: el.__road.stops[k].until, cls: g.getAttribute("class") };
  }, past);
  c.check("道に記録した積み上げは、その日の道に活動の丸薬（21:00〜21:30）",
    !!lone && lone.at === 21 * 60 && lone.until === 21 * 60 + 30 && /is-act/.test(lone.cls), JSON.stringify(lone));
  await page.evaluate((k) => {
    const el = document.querySelector("#screen-todo .day-road");
    el.querySelector(`.road-hit[data-k="${k}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, lone ? lone.k : -1);
  await wait(700);
  sh = await topSheet();
  c.check("道の記録を押すと記録の紙", !!sh && sh.title === "記録を直す", JSON.stringify(sh && sh.title));
  await page.keyboard.press("Escape");
  await wait(500);

  /* ---------------- 道の空きから「活動」 ---------------- */
  await page.evaluate((d) => KN.screens.todo.goDay(d), NEXT);
  await wait(900);
  const xy = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const G = road.__road.g, p = G.point(G.dist(15 * 60));
    const r = road.querySelector(".road-map").getBoundingClientRect();
    const k = r.width / KN.dayRoad.W;
    return { x: r.left + p.x * k, y: r.top + p.y * k };
  });
  await page.mouse.click(xy.x, xy.y);
  await wait(700);
  const picks = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    return s ? {
      heads: [...s.querySelectorAll(".road-decide-head")].map((x) => x.textContent.trim()),
      acts: [...s.querySelectorAll(".js-acts .act-label")].map((x) => x.textContent.trim()),
      text: s.textContent,
    } : null;
  });
  c.check("空いた道の紙に「活動」の行（覚えている本）",
    !!picks && picks.heads.includes("活動") && picks.acts.includes("読書『坊っちゃん』"), JSON.stringify(picks));
  c.check("活動の行に評価の言葉・絵文字なし", !!picks && !/達成|遅れ|%|％/.test(picks.text)
    && !/\p{Extended_Pictographic}/u.test(picks.text), picks && picks.text);
  await page.locator(".sheet.is-open .js-acts .road-pick", { hasText: "読書『坊っちゃん』" }).click();
  await wait(700);
  const fromRoad = await page.evaluate((d) => KN.store.get().todos.find((x) => x.due === d && x.title === "読書『坊っちゃん』"), NEXT);
  c.check("選べばその時刻（15:00）に活動の予定。長さは前の長さ",
    !!fromRoad && fromRoad.time === "15:00" && fromRoad.act && fromRoad.act.type === "reading" && fromRoad.minutes === 30,
    JSON.stringify(fromRoad));

  /* ---------------- 片方を消しても、もう片方は残る ---------------- */
  const cut = await page.evaluate(([i, d]) => {
    const S = KN.store;
    const e0 = S.actEntry(S.getTodo(i));
    S.removeTodo(i);
    const kept = S.get().archive.entries.find((x) => x.id === e0.id);
    const lone = KN.activity.forRoad(d, []).some((x) => x.id === `arc:${e0.id}`);
    /* 記録を消したほう：英単語の予定は、ふつうの予定に戻る */
    const t2 = S.get().todos.find((x) => x.title === "学習『英単語』");
    const e2 = S.actEntry(t2);
    S.removeEntry(e2.id);
    const t2b = S.getTodo(t2.id);
    const drawn = KN.activity.forRoad(d, [t2b])[0];
    return { kept: !!kept, lone, t2: !!t2b, drawnTime: drawn.time, linked: !!S.actEntry(t2b) };
  }, [id, TODAY]);
  c.check("予定を消しても積み上げは残り、ふつうの記録として道に描く", cut.kept && cut.lone, JSON.stringify(cut));
  c.check("記録を消しても予定は残り、予定の時刻で描く", cut.t2 && !cut.linked && cut.drawnTime === "09:00", JSON.stringify(cut));

  /* ---------------- 読み直しても残る ---------------- */
  await wait(400);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await wait(300);
  const kept = await page.evaluate(() => {
    const S = KN.store.get();
    const p = S.todos.find((x) => x.title === "読書『こころ』");
    const e2 = S.archive.entries.find((x) => x.title === "坊っちゃん" && x.at === "21:00");
    return { act: p && p.act, at: e2 && e2.at, min: e2 && e2.minutes };
  });
  c.check("読み直しても act・at・minutes が残る",
    !!kept.act && kept.act.type === "reading" && kept.at === "21:00" && kept.min === 30, JSON.stringify(kept));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
