/* 週の面の「選ぶ」（docs/todo-items.md「仕事の予定とやること」の段3）。

   今週の見出しの右に「選ぶ」。まだ何も選んでいない週は塗って促す（勝手には開かない）。選ぶ紙は
   期限の近いもの → 見直す日が来たもの → 先週選んだもの → 新しいもの。各行に 今週へ・今日へ・いつかへ（元に戻すつき）。
   見直すの頭の一行は今日の面から消え、選ぶ紙の見直すの組の「一件ずつ」へ移った。今週の上限は畳むだけ。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/week-pick.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("week-pick");
  const { browser, page, errors } = await open({
    weekFirst: true,
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 21, 10, 0)); },   // 水曜
  });
  const ID = await page.evaluate(() => {
    const S = KN.store;
    const old = S.addTodo({ title: "古い棚の件" }).id;
    S.update((s) => { const t = s.todos.find((x) => x.id === old); delete t.review; t.createdAt = "2026-08-01"; t.editedAt = "2026-08-01"; });
    return {
      due: S.addTodo({ title: "精算", deadline: "2026-10-30" }).id,
      old,
      last: S.addTodo({ title: "先週の件", weekMark: "2026-10-14" }).id,
      fresh: S.addTodo({ title: "新しい件" }).id,
      ev: S.addTodo({ title: "会議", due: "2026-10-22", time: "10:00", kind: "event" }).id,
    };
  });
  await page.waitForTimeout(500);
  const get = (id) => page.evaluate((i) => ({ ...KN.store.getTodo(i) }), id);
  const btn = () => page.evaluate(() => {
    const b = document.querySelector("#screen-todo .wk-pick");
    return b ? { ask: b.classList.contains("is-ask"), head: b.closest(".wk-h").firstChild.textContent.trim() } : null;
  });
  const sheet = () => page.evaluate(() => {
    const p = document.querySelector(".note-pop.is-choose.is-open");
    if (!p) return null;
    return {
      heads: [...p.querySelectorAll(".pk-h")].map((h) => h.firstChild.textContent.trim()),
      rows: [...p.querySelectorAll(".pk-row")].map((r) => ({ name: r.querySelector(".pk-name").textContent,
        acts: [...r.querySelectorAll("[data-to]")].map((b) => b.textContent.trim()) })),
      text: p.textContent,
    };
  });
  const act = async (name, to) => {
    await page.locator(".note-pop.is-choose .pk-row", { hasText: name }).locator(`[data-to="${to}"]`).click();
    await page.waitForTimeout(500);
  };

  let b = await btn();
  c.check("今週の右に「選ぶ」。まだ選んでいない週は塗って促す", !!b && b.head === "今週" && b.ask, JSON.stringify(b));
  c.check("促すだけで勝手には開かない", !(await sheet()));
  c.check("見直すの頭の一行は出さない", await page.evaluate(() => !document.querySelector("#screen-todo .tl-review")));

  await page.locator("#screen-todo .wk-pick").click();
  await page.waitForTimeout(700);
  let s = await sheet();
  c.check("並び：期限が近い → 見直す → 先週選んだ → 新しい",
    !!s && JSON.stringify(s.heads) === JSON.stringify(["期限が近い", "見直す", "先週選んだ", "新しい"]), JSON.stringify(s && s.heads));
  c.check("一件は一つの組にだけ・予定は出さない",
    !!s && JSON.stringify(s.rows.map((r) => r.name)) === JSON.stringify(["精算", "古い棚の件", "先週の件", "新しい件"]), JSON.stringify(s && s.rows));
  c.check("各行に 今週へ・今日へ・いつかへ", !!s && s.rows.every((r) => JSON.stringify(r.acts) === '["今週へ","今日へ","いつかへ"]'));
  c.check("数・評価の言葉を出さない", !!s && !/\d+件|遅れ|期限切れ|できなかった|!|！/.test(s.text), s && s.text);

  await act("新しい件", "week");
  let t = await get(ID.fresh);
  c.check("今週へ：今週の印（今日）・日は決めない・見直しは来週から",
    t.weekMark === "2026-10-21" && !t.due && t.review === "2026-10-26", JSON.stringify(t));
  s = await sheet();
  c.check("選んだ行は小窓から消える", !!s && !s.rows.some((r) => r.name === "新しい件"), JSON.stringify(s && s.rows));
  const toast = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("知らせに「元に戻す」", /新しい件/.test(toast) && /元に戻す/.test(toast), toast);

  await act("先週の件", "today");
  t = await get(ID.last);
  c.check("今日へ：今日の道へ・今週の印も", t.due === "2026-10-21" && t.weekMark === "2026-10-21", JSON.stringify(t));

  await act("精算", "someday");
  t = await get(ID.due);
  c.check("いつかへ：いつかの棚・今週の印なし", t.shelf === "someday" && !t.weekMark && t.deadline === "2026-10-30", JSON.stringify(t));
  await page.locator(".toast-action", { hasText: "元に戻す" }).click();
  await page.waitForTimeout(500);
  t = await get(ID.due);
  c.check("元に戻すと棚も戻る", !t.shelf && !t.weekMark, JSON.stringify(t));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  b = await btn();
  c.check("選んだあとは塗らない", !!b && !b.ask, JSON.stringify(b));
  const rows = await page.evaluate(() => [...document.querySelectorAll("#screen-todo .wk > .wk-list .wk-name")].map((e) => e.textContent));
  c.check("今週に選んだものが並ぶ", rows.includes("新しい件") && rows.includes("先週の件"), JSON.stringify(rows));

  /* 見直すの組の「一件ずつ」で、前の見直しの小窓 */
  await page.locator("#screen-todo .wk-pick").click();
  await page.waitForTimeout(700);
  await page.locator(".note-pop.is-choose .pk-review").click();
  await page.waitForTimeout(800);
  const rv = await page.evaluate(() => {
    const p = document.querySelector(".note-pop.is-review.is-open");
    return p ? p.querySelector(".rv-title").textContent : null;
  });
  c.check("一件ずつ → 見直しの小窓（選ぶ紙は閉じる）", rv === "古い棚の件"
    && await page.evaluate(() => !document.querySelector(".note-pop.is-choose.is-open")), String(rv));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
