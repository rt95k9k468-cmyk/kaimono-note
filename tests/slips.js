/* 置き直しの回数と選択肢（3.0 の B2、docs/roadmap-3.0.md・docs/todo-timeline.md の「置き直しの回数」。2026年10月6日）。
   - 控え（slips）を書くのは：段3の紙で明日／今週（carry）・段5の紙で明日／時刻を外す（passed）・
     自分で due を後ろへ（hand）。日の変わり目はもう運ばないので書かない（決めごと1・10月18日）。
     くり返しには書かない。前へ動かしても書かない。20件まで
   - 元に戻すと控えも戻る
   - 段3・段5 の紙と頭の一行は出さない（10月18日）。控えは設定の奥と見直しの頭にだけ

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/slips.js */
const { open, checker, openReview } = require("./lib");

const TODAY = "2026-10-06";
const YEST = "2026-10-05";

(async () => {
  const c = checker("slips");
  const { browser, page, errors } = await open({ unfold: ["slips", "reviewFacts"],
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 11, 0)); },
  });
  const wait = (ms) => page.waitForTimeout(ms);

  /* ---------------- 書くところ ---------------- */
  let r = await page.evaluate(([today, yest]) => {
    const S = KN.store, U = KN.util;
    const a = S.addTodo({ title: "病院の予約", due: yest, time: "13:00" });
    const rep = S.addTodo({ title: "ゴミ出し", due: yest, repeat: "daily" });
    S.rescheduleOverdue();
    const a1 = JSON.parse(JSON.stringify(S.getTodo(a.id)));
    const undo = S.settleCarried(a.id, "tomorrow");
    const a2 = JSON.parse(JSON.stringify(S.getTodo(a.id)));
    undo();
    const a3 = JSON.parse(JSON.stringify(S.getTodo(a.id)));
    const b = S.addTodo({ title: "書類", due: today, time: "09:00" });
    S.settlePassed(b.id, "loose");
    const b1 = JSON.parse(JSON.stringify(S.getTodo(b.id)));
    const h = S.addTodo({ title: "手で動かす", due: U.shiftDay(today, 2) });
    S.updateTodo(h.id, { due: U.shiftDay(today, 5) });
    const h1 = (S.getTodo(h.id).slips || []).slice();
    S.updateTodo(h.id, { due: U.shiftDay(today, 1) });   // 前へ：書かない
    const h2 = (S.getTodo(h.id).slips || []).length;
    for (let i = 0; i < 25; i++) S.updateTodo(h.id, { due: U.shiftDay(today, 6 + i) });
    const h3 = (S.getTodo(h.id).slips || []).length;
    const rp = S.getTodo(rep.id);
    return { a1: a1.slips, a2: a2.slips, a3: a3.slips, b1: b1.slips, h1, h2, h3, rep: rp.slips || [], repDue: rp.due };
  }, [TODAY, YEST]);
  c.check("日の変わり目は運ばず、控えも書かない", (r.a1 || []).length === 0, JSON.stringify(r.a1));
  c.check("段3の紙で明日を選ぶと控え（前の日・前の時刻・carry）",
    r.a2.length === 1 && r.a2[0].on === TODAY && r.a2[0].from === YEST && r.a2[0].time === "13:00" && r.a2[0].how === "carry",
    JSON.stringify(r.a2));
  c.check("元に戻すと控えも戻る", (r.a3 || []).length === 0, JSON.stringify(r.a3));
  c.check("段5の紙で時刻を外すと passed（前の時刻）",
    r.b1.length === 1 && r.b1[0].how === "passed" && r.b1[0].time === "09:00", JSON.stringify(r.b1));
  c.check("自分で後ろへ動かすと hand", r.h1.length === 1 && r.h1[0].how === "hand", JSON.stringify(r.h1));
  c.check("前へ動かしても書かない", r.h2 === 1, String(r.h2));
  c.check("控えは20件まで", r.h3 === 20, String(r.h3));
  c.check("くり返しには書かない", r.rep.length === 0 && r.repDue === TODAY, JSON.stringify(r));

  /* ---------------- 3回目の控え：頭の一行も紙も出さない（置き直しの口は無い） ---------------- */
  await page.evaluate((today) => {
    const S = KN.store;
    const slip = (d) => ({ on: d, from: d, time: null, how: "carry" });
    const x = S.addTodo({ title: "確定申告の準備", due: today });
    S.update((s) => { s.todos.find((t) => t.id === x.id).slips = [slip("2026-09-20"), slip("2026-09-27"), slip("2026-10-05")]; });
  }, TODAY);
  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  c.check("頭に札は出ない", await page.evaluate(() => !document.querySelector("#screen-todo .tl-carry, #screen-todo .tl-passed")));

  /* 読み直しても残る */
  await wait(400);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await wait(300);
  const kept = await page.evaluate(() => (KN.store.get().todos.find((x) => x.title === "確定申告の準備").slips || []).length);
  c.check("読み直しても控えが残る", kept === 3, String(kept));

  /* ---------------- 崩れ方の事実（D1） ---------------- */
  const f = await page.evaluate(() => {
    const S = KN.store;
    const z = S.addTodo({ title: "D1 の材料", minutes: 90 });
    S.update((s) => { s.todos.find((t) => t.id === z.id).slips = [
      { on: "2026-08-01", from: "2026-08-01", time: "07:00", how: "hand" },   // 4週間より前：数えない
      { on: "2026-10-01", from: "2026-09-30", time: "07:30", how: "carry" },
      { on: "2026-10-02", from: "2026-10-01", time: "21:00", how: "carry" },
      { on: "2026-10-03", from: "2026-10-02", time: null, how: "hand" }]; });
    const all = S.slipFacts(28);
    const one = S.get().todos.find((t) => t.id === z.id);
    return { all, z: z.id };
  });
  c.check("この4週間の控えだけ数える（朝・夜・時刻なし・1時間より長い）",
    f.all.parts["朝"] >= 1 && f.all.parts["夜"] >= 1 && f.all.parts["時刻なし"] >= 1 && f.all.lens["1時間より長い"] === 1
    && f.all.todos >= 4, JSON.stringify(f.all));
  await page.evaluate(() => KN.app.showScreen("todo"));
  await wait(300);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await wait(300);
  await page.locator(".set-layer:last-child .set-row", { hasText: "置き直しの控え" }).first().click();
  await wait(600);
  const facts = await page.locator(".set-layer:last-child").innerText();
  c.check("設定の奥に「置き直しの控え」：件数・置いていた時刻・決めていた長さ",
    /この4週間に置き直したもの/.test(facts) && /置いていた時刻/.test(facts) && /決めていた長さ/.test(facts) && /朝/.test(facts), facts.slice(0, 200));
  c.check("並べるだけ（多い・少ない・原因・平均を言わない）", !/多い|少ない|原因|平均|傾向|改善|!|！/.test(facts), facts);
  c.check("表：3回以上・置き直し方・0 の行は出さない（昼・夕・15分まで は 0）",
    /3回以上\s*\d+件/.test(facts) && /置き直し方/.test(facts) && /前の日から運んだ/.test(facts) && /自分で日を後ろへ/.test(facts)
    && !/昼|夕/.test(facts) && !/15分まで/.test(facts), facts);

  /* 分け方を見直す材料（D1 の見直し・10月27日）：区切らない生の数。足すと全体に合う。 */
  const x = f.all.fine, sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  c.check("細かい数：時（7時台・21時台）・時刻なし・長さ 90分・足すと回と件に合う",
    x.hours[7] >= 1 && x.hours[21] >= 1 && x.noTime >= 1 && x.mins[90] === 1
    && sum(x.hours) + x.noTime === f.all.slips && sum(x.dows) === f.all.slips && sum(x.hows) === f.all.slips
    && sum(x.mins) === f.all.todos && sum(x.per) === f.all.todos && x.per[3] >= 1, JSON.stringify(x));
  await page.locator(".set-layer:last-child .set-row", { hasText: "細かく" }).first().click();
  await wait(600);
  const fine = await page.locator(".set-layer:last-child").innerText();
  c.check("「細かく」：時台・曜日・置き直し方・長さ・1件あたりの回数",
    /7時台/.test(fine) && /21時台/.test(fine) && /前に置いていた曜日/.test(fine) && /前の日から運んだ/.test(fine)
    && /90分/.test(fine) && /1件あたりの回数/.test(fine), fine.slice(0, 300));
  c.check("「細かく」も並べるだけ", !/多い|少ない|原因|平均|傾向|改善|!|！/.test(fine), fine);
  await page.evaluate(() => KN.app.showScreen("archive"));
  await wait(500);
  c.check("daily には出さない", await page.evaluate(() => !/置き直/.test(document.querySelector("#screen-archive").textContent)));
  const rv = await page.evaluate((id) => {
    const S = KN.store;
    S.update((s) => { const t = s.todos.find((x) => x.id === id); delete t.review; t.createdAt = "2026-08-01"; t.editedAt = "2026-08-01"; });
    return S.reviewDue().some((t) => t.id === id);
  }, f.z);
  await page.evaluate(() => KN.app.showScreen("todo"));
  await wait(600);
  if (rv) await openReview(page);
  const head = await page.evaluate(() => {
    const s = document.querySelector(".note-pop.is-review.is-open");
    const row = s && [...s.querySelectorAll(".review-row")].find((r) => /D1 の材料/.test(r.textContent));
    return row ? row.querySelector(".rv-facts").textContent : null;
  });
  c.check("見直しの紙の頭：最初に置いた日・回数・前に置いていた時刻",
    head === "8月1日から · 4回置き直し · 前は 21:00", String(head));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
