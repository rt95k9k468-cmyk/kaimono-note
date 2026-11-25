/* 手順の小窓で手順をぜんぶ済ませて親（くり返し）が済んだら、親を押したときと同じトーストを出し、
   「元に戻す」で親も最後に押した手順も押す前へ戻る（2026年10月26日、利用者「元に戻すのトーストが出ない」）。
   詳細の紙の中で済ませたときも同じ。元に戻すと紙の印も記録に合わせて戻る。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/subs-done-undo.js */
const { open, checker } = require("./lib");

const DAY = "2026-10-20";

(async () => {
  const c = checker("subs-done-undo");
  const { browser, page, errors } = await open({
    before: async (ctx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 20, 7, 0)); },
  });
  const id = await page.evaluate((day) => KN.store.addTodo({ title: "朝のしたく", due: day, time: "09:00", minutes: 30,
    repeat: "daily", subs: ["顔", "歯"].map((x) => ({ title: x })) }).id, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(600);
  await page.click(`#screen-todo .tl-row[data-todo-id="${id}"] .tl-subs-chip`);
  await page.waitForSelector(".note-pop.is-subs.is-open .tl-sub", { timeout: 5000 });
  const tap = async (i) => {
    await page.click(`.note-pop.is-subs.is-open .tl-sub:nth-child(${i}) button.check`);
    await page.waitForTimeout(150);
  };
  await tap(1);
  c.check("一つ目だけではトーストを出さない", !(await page.$(".toast")));
  await tap(2);
  const toast = await page.evaluate(() => {
    const el = document.querySelector(".toast");
    return el && { msg: el.querySelector(".toast-msg").textContent, acts: [...el.querySelectorAll(".toast-action")].map((b) => b.textContent) };
  });
  const done = await page.evaluate((id) => {
    const t = KN.store.getTodo(id);
    return { due: t.due, traces: KN.store.get().todos.filter((x) => x.trace).length };
  }, id);
  c.check("ぜんぶ済ませると親は次の日へ・跡が一件", done.due === "2026-10-21" && done.traces === 1, JSON.stringify(done));
  c.check("親を押したときと同じトースト（元に戻すつき）", toast && toast.msg.includes("朝のしたく") && toast.acts.includes("元に戻す"),
    JSON.stringify(toast));

  await page.evaluate(() => [...document.querySelectorAll(".toast-action")].find((b) => b.textContent === "元に戻す").click());
  await page.waitForTimeout(300);
  const back = await page.evaluate(([id, day]) => {
    const t = KN.store.getTodo(id);
    const st = t.subs.map((x) => KN.store.subStatus(t, x, day).done);
    return { due: t.due, done: t.done, st, traces: KN.store.get().todos.filter((x) => x.trace).length };
  }, [id, DAY]);
  c.check("元に戻すと親はその日・未完了、跡も消える", back.due === DAY && !back.done && back.traces === 0, JSON.stringify(back));
  c.check("最後に押した手順だけ戻り、先に押した手順は済んだまま", back.st[0] === true && back.st[1] === false, JSON.stringify(back.st));

  /* 詳細の紙の中で済ませたときも同じ。元に戻すと紙の印も戻る。 */
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((x) => x.remove()));
  await page.evaluate((id) => KN.screens.todo.open(id), id);
  await page.waitForSelector(".sheet.is-open .js-sub-check", { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.click(".sheet.is-open .sub-line:nth-child(2) .js-sub-check");
  await page.waitForTimeout(200);
  const sheetToast = await page.evaluate(() => {
    const el = document.querySelector(".toast");
    return el && [...el.querySelectorAll(".toast-action")].map((b) => b.textContent);
  });
  const sDue = await page.evaluate((id) => KN.store.getTodo(id).due, id);
  c.check("紙の中で済ませても親は次の日へ・元に戻すつきのトースト", sDue === "2026-10-21" && sheetToast && sheetToast.includes("元に戻す"),
    JSON.stringify({ sDue, sheetToast }));
  await page.evaluate(() => [...document.querySelectorAll(".toast-action")].find((b) => b.textContent === "元に戻す").click());
  await page.waitForTimeout(300);
  const sBack = await page.evaluate((id) => ({
    due: KN.store.getTodo(id).due,
    on: [...document.querySelectorAll(".sheet.is-open .js-sub-check")].map((b) => b.getAttribute("aria-checked")),
  }), id);
  c.check("元に戻すと親はその日へ・紙の印も最後の一つだけ外れる", sBack.due === DAY && sBack.on.join() === "true,false", JSON.stringify(sBack));

  /* 点検26：手順の丸（見た目 24px）の当たりは行の背（44px 以上）と左右の隙間まで。 */
  const sub = await page.evaluate(() => {
    const el = document.querySelector(".sheet.is-open .sub-check");
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const on = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
    const reach = (dx, dy) => { let n = 0; while (n < 40 && on(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    return { w: reach(-1, 0) + reach(1, 0) + 1, h: reach(0, -1) + reach(0, 1) + 1 };
  });
  c.check("点検26：手順の丸の当たりは縦 44px 以上・横 30px 以上", sub.h >= 43 && sub.w >= 30, JSON.stringify(sub));
  /* 点検31：手順を足して改行せずに打つだけで、頭の「☑ n/m」が増える。 */
  const subN = () => page.evaluate(() => { const f = document.querySelector(".sheet.is-open .hero-fact.is-subs i"); return f ? f.textContent : ""; });
  const before = await subN();
  await page.click(".sheet.is-open .js-sub-add");
  await page.waitForTimeout(200);
  await page.keyboard.type("爪");
  const after = await subN();
  c.check("点検31：手順を打つだけで頭の数が増える（改行しなくても）", +before.split("/")[1] === 2 && +after.split("/")[1] === 3, JSON.stringify({ before, after }));

  c.check("ページのエラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})().catch((e) => { console.error(e); process.exit(1); });
