/* くり返しを直すとき、どこまで効かせるか（この回だけ／以後すべて／これまでも含めて全部）。

   store.editRepeating：
   - この回だけ：その日の一件が単発の写しに分かれ（題・手順が新しい）、くり返しの側は
     その日を飛ばして題はそのまま。元に戻すで写しは消え、記録は元へ。
   - 以後すべて：記録の題・手順が変わり、過ぎた日の跡は触らない。
   - 全部：跡にも題・手順の字が移る（済みの印と日は触らない）。
   紙：保存を押すと三択が出る。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/repeat-scope.js */
const { open, checker } = require("./lib");
const t = checker("repeat-scope");

(async () => {
  const { browser, page, errors } = await open();
  const r = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    const mk = () => {
      const m = S.addTodo({ title: "薬", due: today, repeat: "daily", subs: [{ title: "朝" }, { title: "水" }] });
      S.toggleTodo(m.id);           // 今日ぶんの跡ができ、記録は明日へ
      return m.id;
    };
    const subsOf = (id) => S.getTodo(id).subs.map((x) => x.title).join(",");
    const traces = (title) => S.get().todos.filter((x) => x.trace && x.title === title);
    const out = {};

    let id = mk();
    const tomorrow = U.shiftDay(today, 1);
    const sub2 = S.getTodo(id).subs.map((x, i) => ({ ...x, title: i ? "水2" : x.title }));
    const undo = S.editRepeating(id, { title: "薬A" }, sub2, "this", tomorrow);
    out.thisFalls = [S.fallsOn(S.getTodo(id), tomorrow), S.fallsOn(S.getTodo(id), U.shiftDay(today, 2))];
    out.thisMaster = [S.getTodo(id).title, S.getTodo(id).due, subsOf(id)];
    const one = S.get().todos.find((x) => x.title === "薬A");
    out.thisOne = one && [one.repeat, one.due, subsOf(one.id)];
    undo();
    out.thisUndo = [S.get().todos.some((x) => x.title === "薬A"), S.getTodo(id).due, S.fallsOn(S.getTodo(id), tomorrow)];

    S.editRepeating(id, { title: "薬B" }, sub2, "future", tomorrow);
    out.future = [S.getTodo(id).title, subsOf(id), traces("薬").length, traces("薬B").length, subsOf(traces("薬")[0].id)];

    id = mk();
    const sub3 = S.getTodo(id).subs.map((x, i) => ({ ...x, title: i ? "水3" : x.title }));
    const t0 = traces("薬")[0];
    S.editRepeating(id, { title: "薬C" }, sub3, "all", tomorrow);
    const tr = traces("薬C");
    out.all = [S.getTodo(id).title, tr.length, tr.every((x) => x.done), tr.some((x) => x.due === t0.due), tr.map((x) => subsOf(x.id)).join("/")];
    return out;
  });
  t.check("この回だけ：明日は立たず、あさっては立つ", r.thisFalls[0] === false && r.thisFalls[1] === true, JSON.stringify(r.thisFalls));
  t.check("この回だけ：記録は題そのまま", r.thisMaster[0] === "薬" && r.thisMaster[2] === "朝,水", JSON.stringify(r.thisMaster));
  t.check("この回だけ：写しは単発で題・手順が新しい", r.thisOne && r.thisOne[0] === null && r.thisOne[2] === "朝,水2", JSON.stringify(r.thisOne));
  t.check("元に戻す", r.thisUndo[0] === false && r.thisUndo[2] === true, JSON.stringify(r.thisUndo));
  t.check("以後すべて：跡は触らない", r.future[0] === "薬B" && r.future[1] === "朝,水2" && r.future[2] === 1 && r.future[3] === 0 && r.future[4] === "朝,水", JSON.stringify(r.future));
  t.check("全部：跡にも移り、済みは保つ", r.all[0] === "薬C" && r.all[1] === 2 && r.all[2] === true && r.all[3] === true && r.all[4].includes("朝,水3"), JSON.stringify(r.all));

  // 紙：保存で三択
  await page.evaluate(() => {
    const m = KN.store.addTodo({ title: "紙の薬", due: KN.util.todayKey(), repeat: "daily" });
    window.__id = m.id;
  });
  await page.evaluate(() => { KN.app.show && KN.app.show("todo"); KN.screens.todo.open(window.__id); });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector(".sheet.is-open .js-save").click());
  await page.waitForTimeout(500);
  const labels = await page.evaluate(() => [...document.querySelectorAll(".act-label")].map((e) => e.textContent.trim()));
  t.check("保存で三択", labels.join("|") === "この回だけ|以後すべて|これまでも含めて全部", labels.join("|"));
  t.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
