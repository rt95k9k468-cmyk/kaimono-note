/* 組み直し（入りきらないとき。3.0 の B3、docs/roadmap-3.0.md・docs/todo-timeline.md の「組み直し」。2026年10月6日）。
   時計を 20:00 に止める（一日の終わりは 23:00）。21:00 病院（60分、動かさない）・毎晩の歯みがき（10分、くり返し）と、
   時刻なし・時刻を過ぎたもの。
   - 「寝る時刻を ◯ すぎます」が押せて、組み直しの紙が開く（今日だけ）
   - 残り＝23:00−20:00−病院60−歯みがき10＝1時間50分。期限の近いもの → 並び順で、入るところまで
   - 入らないものの既定は明日、3回以上置き直したものは「これから」。45分以上は「今日は半分」
   - 紙を閉じれば何も変わらない。「この形にする」で全部書き、元に戻す一回で全部戻る
   - 時刻の決まったもの・くり返しは動かない
   - 時刻を過ぎたものが2件以上なら、入りきっていても「組み直す」の口
   - 評価の言葉を出さない

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/refit.js */
const { open, checker } = require("./lib");

const TODAY = "2026-10-06";

(async () => {
  const c = checker("refit");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 20, 0)); },
  });
  const wait = (ms) => page.waitForTimeout(ms);
  const ids = await page.evaluate((d) => {
    const S = KN.store;
    const mk = (o) => S.addTodo({ due: d, ...o }).id;
    const r = {
      hosp: mk({ title: "病院", time: "21:00", minutes: 60 }),
      brush: mk({ title: "歯みがき", repeat: "daily", part: "dusk", minutes: 10 }),
      app: mk({ title: "申込書", minutes: 45, deadline: "2026-10-08" }),
      mail: mk({ title: "メール", time: "09:00", minutes: 15 }),
      doc: mk({ title: "書類", minutes: 30 }),
      tidy: mk({ title: "片付け", minutes: 60 }),
      wash: mk({ title: "洗車", minutes: 30 }),
    };
    S.update((s) => {
      const o = { [r.doc]: 1, [r.tidy]: 2, [r.wash]: 3, [r.app]: 4 };
      s.todos.forEach((t) => { if (o[t.id]) t.order = o[t.id]; });
      s.todos.find((t) => t.id === r.tidy).slips = ["2026-09-01", "2026-09-08", "2026-09-15"]
        .map((x) => ({ on: x, from: x, time: null, how: "hand" }));
    });
    return r;
  }, TODAY);
  const snap = () => page.evaluate(() => JSON.stringify(KN.store.get().todos.map((t) => [t.id, t.due, t.time, t.minutes, t.shelf || null])));

  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  const btn = await page.evaluate(() => {
    const b = document.querySelector("#screen-todo .js-refit");
    return b ? b.textContent.trim() : null;
  });
  c.check("「寝る時刻を ◯ すぎます」が押せる", !!btn && /^寝る時刻を .+ すぎます$/.test(btn), String(btn));
  const before = await snap();
  await page.locator("#screen-todo .js-refit").first().click();
  await wait(600);
  const read = () => page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    return {
      title: s.querySelector(".sheet-title").textContent.trim(),
      left: (s.querySelector(".refit-left b") || {}).textContent,
      fit: [...s.querySelectorAll(".refit-fit .refit-t")].map((x) => x.textContent.trim()),
      out: [...s.querySelectorAll(".refit-row")].map((row) => ({
        title: row.querySelector(".carry-title").textContent.trim(),
        on: (row.querySelector('.chip[aria-pressed="true"]') || {}).textContent,
        chips: [...row.querySelectorAll(".chip")].map((x) => x.textContent.trim()),
      })),
      text: s.textContent,
    };
  });
  let r = await read();
  c.check("組み直しの紙・残り1時間50分", r.title === "組み直す" && r.left === "1時間50分", JSON.stringify([r.title, r.left]));
  c.check("入るもの：期限の近い申込書 → 並び順（メール・書類）", JSON.stringify(r.fit) === '["申込書","メール","書類"]', JSON.stringify(r.fit));
  c.check("入らないもの：片付けから後ろ（洗車）", JSON.stringify(r.out.map((x) => x.title)) === '["片付け","洗車"]', JSON.stringify(r.out));
  c.check("動かさないもの（病院・歯みがき）は出ない", !/病院|歯みがき/.test(r.text));
  const tidy = r.out.find((x) => x.title === "片付け"), wash = r.out.find((x) => x.title === "洗車");
  c.check("3回以上置き直したものの既定は「これから」、ほかは「明日」",
    String(tidy.on).trim() === "これから" && String(wash.on).trim() === "明日", JSON.stringify([tidy.on, wash.on]));
  c.check("45分以上には「今日は半分」", tidy.chips.includes("今日は半分") && !wash.chips.includes("今日は半分"), JSON.stringify([tidy.chips, wash.chips]));
  c.check("評価の言葉を出さない", !/遅れ|失敗|先送り|詰め込み|無理|!|！/.test(r.text), r.text);
  await page.keyboard.press("Escape");
  await wait(500);
  c.check("紙を閉じれば何も変わらない", (await snap()) === before);

  /* 片付けは今日は半分、洗車は明日のまま → この形にする */
  await page.locator("#screen-todo .js-refit").first().click();
  await wait(600);
  await page.locator(".sheet.is-open .refit-row", { hasText: "片付け" }).locator(".chip", { hasText: "今日は半分" }).click();
  await wait(200);
  await page.locator(".sheet.is-open .js-apply").click();
  await wait(600);
  let t = await page.evaluate((i) => ({ tidy: KN.store.getTodo(i.tidy), wash: KN.store.getTodo(i.wash),
    hosp: KN.store.getTodo(i.hosp), brush: KN.store.getTodo(i.brush) }), ids);
  c.check("今日は半分：片付けは今日・30分", t.tidy.due === TODAY && t.tidy.minutes === 30, JSON.stringify(t.tidy));
  c.check("明日：洗車は明日へ・控え（hand）", t.wash.due === "2026-10-07" && t.wash.slips.length === 1 && t.wash.slips[0].how === "hand", JSON.stringify(t.wash));
  c.check("時刻の決まったもの・くり返しは動かない", t.hosp.time === "21:00" && t.hosp.due === TODAY && t.brush.due === TODAY);
  const toast = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("知らせ「2件を組み直しました」と元に戻す", /2件を組み直しました/.test(toast) && /元に戻す/.test(toast), toast);
  await page.locator(".toast-action", { hasText: "元に戻す" }).click();
  await wait(500);
  c.check("元に戻す一回で全部戻る", (await snap()) === before);

  /* これから・後日 */
  await page.locator("#screen-todo .js-refit").first().click();
  await wait(600);
  await page.locator(".sheet.is-open .refit-row", { hasText: "洗車" }).locator(".chip", { hasText: "後日" }).click();
  await wait(400);
  await page.locator(".pop-cal button", { hasText: /^10$/ }).first().click();
  await wait(300);
  r = await read();
  const wash2 = r.out.find((x) => x.title === "洗車");
  c.check("後日：暦で選んだ日が札に", /10\/10/.test(String(wash2.on)), JSON.stringify(wash2));
  await page.locator(".sheet.is-open .js-apply").click();
  await wait(600);
  t = await page.evaluate((i) => ({ tidy: KN.store.getTodo(i.tidy), wash: KN.store.getTodo(i.wash) }), ids);
  c.check("これから：片付けは日なし（見直す日つき）・後日：洗車は 10/10",
    !t.tidy.due && !t.tidy.shelf && t.tidy.review === "2026-10-20" && t.wash.due === "2026-10-10", JSON.stringify(t));

  /* 入りきっていても、時刻を過ぎたものが2件以上なら「組み直す」 */
  const pure = await page.evaluate((d) => {
    const P = KN.plan;
    const a = { id: "a", title: "a", due: d, time: "08:00", minutes: 30, order: 1 };
    const b = { id: "b", title: "b", due: d, time: "09:00", minutes: 30, order: 2 };
    const r1 = P.refit(d, [a, b], { now: "20:00", end: "23:00" });
    return { fit: r1.fit.map((f) => f.todo.id), out: r1.out.length, avail: r1.avail };
  }, TODAY);
  c.check("plan.refit：時刻を過ぎたものは入れるほうに数える", JSON.stringify(pure.fit) === '["a","b"]' && pure.out === 0 && pure.avail === 180,
    JSON.stringify(pure));
  await page.evaluate((d) => {
    const S = KN.store;
    S.get().todos.filter((t) => t.due === d && !t.repeat && t.title !== "病院").forEach((t) => S.removeTodo(t.id));
    S.addTodo({ title: "朝の電話", due: d, time: "08:00", minutes: 15 });
    S.addTodo({ title: "昼の買い物", due: d, time: "12:00", minutes: 30 });
  }, TODAY);
  await page.click('.tab[data-tab="archive"]');
  await wait(300);
  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  const btn2 = await page.evaluate(() => {
    const b = document.querySelector("#screen-todo .js-refit");
    return b ? b.textContent.trim() : null;
  });
  c.check("時刻を過ぎたもの2件・入りきる日は「組み直す」", btn2 === "組み直す", String(btn2));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
