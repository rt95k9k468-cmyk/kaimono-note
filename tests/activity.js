/* 活動（3.0 の A1、docs/todo-timeline.md の「活動」。2026年10月6日。積み上げをやめた 10月12日に組み直し）。
   活動は act 付きのやること。済ませても積み上げは作らない（docs/thinking.md）。
   - 時間割で済ませると、ふつうの知らせ。記録は増えない。道は予定の時刻と長さで描く（縁取りの丸薬）
   - 詳細の紙の頭に「積み上げ『…』」の札は無い
   - 前からの結び（act.entry ⇄ entry.todo）は読むだけ：道はその記録の時刻と長さで描く
   - 前からの積み上げ（時刻と長さのあるもの）は道に描き、押せば積み上げをまとめたノート
   - 道の空きを押すと「活動」の行（前に置いた本）。選べばその時刻に置く
   - ノートから道へ（A2）
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
  const entries = () => page.evaluate(() => KN.store.get().archive.entries.map((e) => ({ ...e })));
  const todo = (id) => page.evaluate((i) => KN.store.getTodo(i), id);

  /* ---------------- 予定 → 済ませる（記録は作らない） ---------------- */
  const id = await page.evaluate((d) => KN.activity.plant({ type: "reading", title: "坊っちゃん", day: d, at: "08:00", minutes: 45 }).id, TODAY);
  let t = await todo(id);
  c.check("予定の題は「読書『坊っちゃん』」・act は読書",
    t.title === "読書『坊っちゃん』" && t.act && t.act.type === "reading" && t.act.entry === null
    && t.due === TODAY && t.time === "08:00" && t.minutes === 45, JSON.stringify(t));

  await page.click('.tab[data-tab="todo"]');
  await wait(600);
  await page.locator(`.tl-row[data-todo-id="${id}"] button.check:visible`).first().click();
  await wait(1200);
  const msg = await page.evaluate(() => (document.querySelector(".toast-msg") || {}).textContent || "");
  c.check("知らせはふつうの済ませた知らせ（「で残しました」ではない）", !/残しました/.test(msg) && /坊っちゃん/.test(msg), msg);
  t = await todo(id);
  c.check("済ませても積み上げは作らない", t.done && t.act.entry === null && (await entries()).length === 0,
    JSON.stringify([t.done, t.act]));

  const road = (i) => page.evaluate((x) => {
    const el = document.querySelector("#screen-todo .day-road");
    const st = el.__road;
    const k = st.stops.findIndex((s) => s.t.id === x);
    const g = el.querySelector(`.road-stop[data-s="${k}"]`);
    return k < 0 ? null : { k, at: st.stops[k].at, until: st.stops[k].until, cls: g.getAttribute("class"),
      c: g.style.getPropertyValue("--act-c"), went: g.querySelector(".road-stop-went").getAttribute("d") };
  }, i);
  await wait(400);
  let r = await road(id);
  c.check("道は予定の時刻と長さ（8:00〜8:45）", !!r && r.at === 480 && r.until === 525, JSON.stringify(r));
  c.check("活動は縁取りの丸薬（is-act・種類の色・塗らない）",
    !!r && /is-act/.test(r.cls) && r.c.trim() === "#5b9bd5" && !r.went, JSON.stringify(r));

  await page.evaluate((i) => KN.screens.todo.open(i), id);
  await wait(600);
  c.check("詳細の紙の頭に積み上げの札は無い", await page.evaluate(() =>
    !document.querySelector(".sheet.is-open .js-act-src") && !/積み上げ/.test([...document.querySelectorAll(".sheet.is-open")].pop().textContent)));
  await page.keyboard.press("Escape");
  await wait(500);

  /* ---------------- 前からの記録は読むだけ ---------------- */
  const old = await page.evaluate((d) => {
    const S = KN.store;
    const x = KN.activity.plant({ type: "study", title: "英単語", day: d, at: "09:00", minutes: 25 });
    const e = S.addEntry({ type: "study", title: "英単語", date: d, at: "09:30", minutes: 40, todo: x.id });
    S.update((s) => { s.todos.find((y) => y.id === x.id).act.entry = e.id; });
    const drawn = KN.activity.forRoad(d, [S.getTodo(x.id)])[0];
    const lone = S.addEntry({ type: "reading", title: "こころ", date: d, at: "21:00", minutes: 30 });
    return { drawn: [drawn.time, drawn.minutes], lone: lone.id };
  }, TODAY);
  c.check("前からの結びは、その記録の時刻と長さで描く", old.drawn.join() === "09:30,40", JSON.stringify(old));
  await page.evaluate(async () => { KN.store.update((s) => { delete s.settings.entriesNote; }); await KN.notes.ready(); await KN.entriesNote.run(); });
  await page.click('.tab[data-tab="archive"]');
  await wait(300);
  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  const lone = await road(`arc:${old.lone}`);
  c.check("前からの積み上げは、その日の道に活動の丸薬（21:00〜21:30）",
    !!lone && lone.at === 21 * 60 && lone.until === 21 * 60 + 30 && /is-act/.test(lone.cls), JSON.stringify(lone));
  await page.evaluate((k) => {
    const el = document.querySelector("#screen-todo .day-road");
    el.querySelector(`.road-hit[data-k="${k}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, lone ? lone.k : -1);
  await wait(900);
  c.check("押すと積み上げをまとめたノート", await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-note.is-open");
    return !!s && [...s.querySelectorAll("textarea, input")].some((x) => /^積み上げ（〜2026年10月）$/.test(x.value));
  }));
  await page.keyboard.press("Escape");
  await wait(600);
  c.check("前からの記録は書き換えない", (await entries()).length === 2);

  /* ---------------- 道の空きから「活動」 ---------------- */
  await page.evaluate((d) => KN.screens.todo.goDay(d), NEXT);
  await wait(900);
  const xy = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const G = road.__road.g, p = G.point(G.dist(15 * 60));
    const rc = road.querySelector(".road-map").getBoundingClientRect();
    const k = rc.width / KN.dayRoad.W;
    return { x: rc.left + p.x * k, y: rc.top + p.y * k };
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
  c.check("空いた道の紙に「活動」の行（前に置いた本）",
    !!picks && picks.heads.includes("活動") && picks.acts.includes("読書『坊っちゃん』"), JSON.stringify(picks));
  c.check("活動の行に評価の言葉・絵文字なし", !!picks && !/達成|遅れ|%|％/.test(picks.text)
    && !/\p{Extended_Pictographic}/u.test(picks.text), picks && picks.text);
  await page.locator(".sheet.is-open .js-acts .road-pick", { hasText: "読書『坊っちゃん』" }).click();
  await wait(700);
  const fromRoad = await page.evaluate((d) => KN.store.get().todos.find((x) => x.due === d && x.title === "読書『坊っちゃん』"), NEXT);
  c.check("選べばその時刻（15:00）に活動の予定。長さは前に置いた長さ（45分）",
    !!fromRoad && fromRoad.time === "15:00" && fromRoad.act && fromRoad.act.type === "reading" && fromRoad.minutes === 45,
    JSON.stringify(fromRoad));

  /* ---------------- ノートから道へ・道から元へ（A2） ---------------- */
  await page.evaluate(() => KN.notes.ready());
  const nid = await page.evaluate(() => {
    const n = KN.notes.draft();
    n.title = "引っ越しの段取り"; n.body = "箱の数を決める";
    KN.notes.put(n);
    return n.id;
  });
  await page.click('.tab[data-tab="archive"]');
  await wait(500);
  await page.evaluate((i) => KN.screens.notes.open(i), nid);
  await page.waitForSelector(".sheet.is-note.is-open");
  await wait(400);
  /* 「道に置く」は既定で畳んである（3.1 の S4。畳み方は tests/fold.js）。 */
  await page.evaluate(() => KN.store.update((s) => { s.settings.noteRoad = true; }));
  await page.click(".sheet.is-note .js-note-more");
  await wait(300);
  const items = await page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.textContent.trim()));
  c.check("ノートの「⋯」に「道に置く」", items.includes("道に置く"), JSON.stringify(items));
  await page.locator(".note-pop-item", { hasText: "道に置く" }).click();
  await wait(600);
  const nlens = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    return { title: s.querySelector(".sheet-title").textContent.trim(),
             chips: [...s.querySelectorAll(".tw-mins .chip")].map((x) => x.textContent.trim()),
             on: (s.querySelector(".tw-mins .chip[aria-pressed=true]") || {}).textContent };
  });
  c.check("長さの札は 15・20・25・45（既定25分）",
    nlens.title === "道に置く" && nlens.chips.join() === "15分,20分,25分,45分" && String(nlens.on).trim() === "25分", JSON.stringify(nlens));
  await page.locator(".sheet.is-open .js-ok").last().click();
  await wait(600);
  const nt = await page.evaluate((i) => KN.store.get().todos.find((x) => x.act && x.act.note === i), nid);
  c.check("「『引っ越しの段取り』について考える」が種の活動として今日に",
    !!nt && nt.title === "『引っ越しの段取り』について考える" && nt.act.type === "seed" && nt.minutes === 25
    && nt.due === TODAY && nt.time === "10:00", JSON.stringify(nt));
  await page.keyboard.press("Escape");
  await wait(600);
  await page.click('.tab[data-tab="todo"]');
  await wait(500);
  await page.evaluate((i) => KN.screens.todo.open(i), nt.id);
  await wait(600);
  const nchip = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".sheet.is-open .js-act-note")].pop();
    return b && !b.hidden ? b.textContent.trim() : null;
  });
  c.check("詳細の紙の頭に「ノート『引っ越しの段取り』」", nchip === "ノート『引っ越しの段取り』", String(nchip));
  await page.locator(".sheet.is-open .js-act-note").last().click();
  await wait(900);
  c.check("札を押すとノートが開く", await page.evaluate((i) => !!document.querySelector(".sheet.is-note.is-open")
    && [...document.querySelectorAll(".sheet.is-note.is-open .js-title, .sheet.is-note.is-open textarea, .sheet.is-note.is-open input")]
      .some((x) => x.value === "引っ越しの段取り"), nid));
  await page.keyboard.press("Escape");
  await wait(700);
  c.check("ノートを閉じれば、やることの画面のまま", await page.evaluate(() =>
    !document.querySelector(".sheet.is-note.is-open") && !document.querySelector("#screen-todo").hidden));
  await page.evaluate((i) => KN.notes.remove(i), nid);
  await wait(200);
  await page.evaluate((i) => KN.screens.todo.open(i), nt.id);
  await wait(600);
  c.check("ノートが消えていれば札を出さない", await page.evaluate(() => {
    const b = [...document.querySelectorAll(".sheet.is-open .js-act-note")].pop();
    return !b || b.hidden;
  }));
  await page.keyboard.press("Escape");
  await wait(500);

  /* ---------------- 読み直しても残る ---------------- */
  await wait(400);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await wait(300);
  const kept = await page.evaluate(() => {
    const p = KN.store.get().todos.find((x) => x.title === "読書『坊っちゃん』" && x.time === "15:00");
    return p && p.act;
  });
  c.check("読み直しても act が残る", !!kept && kept.type === "reading", JSON.stringify(kept));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
