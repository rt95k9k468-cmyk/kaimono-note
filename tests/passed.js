/* 段5：その日のうちの置き直し（docs/todo-timeline.md の「その日のうちの置き直し」）。
   2026年9月29日。時計を 11:10 に止めて：

   - store：passedToday は、今日・時刻あり・まだ・くり返しでないもので、終わり（長さが
     無ければ30分後）を過ぎたものだけ。いま中に居るもの・時刻なし・済んだもの・
     ルーティン・先の日は入らない。時刻の早い順。
   - settlePassed の五つ（いまから・時刻を外す・明日（時刻も外す）・長期タスクへ・
     やめる＝アーカイブ）と元に戻す。
   - 画面：頭に「1 時刻を過ぎたもの · 置き直す」。押すと紙に「10:00 の予定」と五択、
     入力欄なし。「いまから（11:15）」で時刻が付き、行も頭の一行も消え、報せの
     元に戻すで戻る。見ているあいだに時刻が過ぎれば、30秒の見回りで一行が出る。
   - 評価の言葉・絵文字を出さない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/passed.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("passed");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 11, 10)); },
  });

  /* ---- store ---- */
  const st = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    S.update((s) => { s.todos = []; });
    const add = (title, extra) => S.addTodo({ title, due: today, ...extra }).id;
    add("書類整理", { time: "10:00" });                  // 10:30 に終わり → 過ぎた
    add("電話", { time: "09:00", minutes: 45 });         // 9:45 に終わり → 過ぎた
    add("病院", { time: "10:30", minutes: 60 });         // 11:30 まで → 中に居る
    add("買い物", { time: "10:50" });                    // 11:20 まで → まだ
    add("メール");                                       // 時刻なし
    add("薬", { time: "08:00", repeat: "daily" });       // ルーティン
    const done = add("手紙", { time: "08:30" });
    S.update((s) => { const x = s.todos.find((q) => q.id === done); x.done = true; x.doneAt = new Date().toISOString(); });
    S.addTodo({ title: "先の用事", due: U.shiftDay(today, 1), time: "09:00" });
    return { list: S.passedToday().map((x) => x.title) };
  });
  t.check("過ぎたのは、終わりを過ぎた二件だけ（時刻の早い順）",
    JSON.stringify(st.list) === JSON.stringify(["電話", "書類整理"]), JSON.stringify(st.list));

  const se = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    S.update((s) => { s.todos = []; });
    const mk = (title, extra) => S.addTodo({ title, due: today, time: "09:00", ...extra }).id;
    const ids = { now: mk("いま"), loose: mk("外す"), tomorrow: mk("明日"), someday: mk("長期", { deadline: U.shiftDay(today, -2) }), stop: mk("やめる") };
    const before = JSON.stringify(S.get().todos);
    const undo = {};
    undo.now = S.settlePassed(ids.now, "now", "11:15");
    ["loose", "tomorrow", "someday", "stop"].forEach((k) => { undo[k] = S.settlePassed(ids[k], k); });
    const g = (id) => ({ ...S.getTodo(id) });
    const out = { today, left: S.passedToday().length };
    Object.keys(ids).forEach((k) => { out[k] = g(ids[k]); });
    Object.keys(undo).reverse().forEach((k) => undo[k]());
    out.undone = JSON.stringify(S.get().todos) === before;
    return out;
  });
  t.check("いまから：時刻が 11:15 に、やる日は今日のまま", se.now.time === "11:15" && se.now.due === se.today, JSON.stringify(se.now));
  t.check("時刻を外す：今日のまま時刻なし（連れ）", se.loose.time == null && se.loose.due === se.today, JSON.stringify(se.loose));
  t.check("明日：やる日を明日にして、時刻も外す", se.tomorrow.due > se.today && se.tomorrow.time == null, JSON.stringify(se.tomorrow));
  t.check("長期タスクへ：やる日を外し、過ぎた期限も外す", !se.someday.due && !se.someday.time && !se.someday.deadline, JSON.stringify(se.someday));
  t.check("やめる：アーカイブ（消さない）", se.stop.archived === true, JSON.stringify(se.stop));
  t.check("選び直すと、もう過ぎたものに数えない", se.left === 0, String(se.left));
  t.check("どれも元に戻せる", se.undone);

  /* ---- 画面 ---- */
  const ids = await page.evaluate(() => {
    const S = KN.store, today = KN.util.todayKey();
    S.update((s) => { s.todos = []; });
    return {
      doc: S.addTodo({ title: "書類整理", due: today, time: "10:00" }).id,
      shop: S.addTodo({ title: "買い物", due: today, time: "11:05" }).id,
      clinic: S.addTodo({ title: "病院", due: today, time: "13:00", minutes: 60 }).id,
    };
  });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  const bar = () => page.evaluate(() => {
    const b = document.querySelector("#screen-todo .tl-passed");
    return b ? b.textContent.replace(/\s+/g, " ").trim() : null;
  });
  let b = await bar();
  t.check("頭に「1 時刻を過ぎたもの · 置き直す」", !!b && /^1 時刻を過ぎたもの/.test(b) && /置き直す/.test(b), String(b));

  await page.click("#screen-todo .tl-passed");
  await page.waitForTimeout(700);
  const sheet = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    if (!sh) return null;
    return {
      title: sh.querySelector(".sheet-title").textContent.trim(),
      rows: [...sh.querySelectorAll(".carry-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()),
      picks: [...sh.querySelectorAll(".js-passed")].map((x) => x.textContent.trim()),
      inputs: sh.querySelectorAll("input, textarea, [contenteditable]").length,
      text: sh.textContent,
    };
  });
  t.check("紙の題は「時刻を過ぎたもの」、一件「書類整理 10:00 の予定」",
    !!sheet && sheet.title === "時刻を過ぎたもの" && sheet.rows.length === 1
    && /書類整理/.test(sheet.rows[0]) && /10:00 の予定/.test(sheet.rows[0]), JSON.stringify(sheet));
  t.check("五択（いまから（11:15）・時刻を外す・明日・これからへ・やめる）",
    !!sheet && JSON.stringify(sheet.picks) === JSON.stringify(["いまから（11:15）", "時刻を外す", "明日", "これからへ", "やめる"]),
    sheet && JSON.stringify(sheet.picks));
  t.check("紙に入力欄は無い", !!sheet && sheet.inputs === 0);
  t.check("紙も評価しない・絵文字なし",
    !!sheet && !/遅れ|予定通り|達成|未達|できなかった|%|％/.test(sheet.text) && !/\p{Extended_Pictographic}/u.test(sheet.text),
    sheet && sheet.text);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/passed-sheet.png` });

  await page.locator(".sheet.is-open .js-passed", { hasText: "いまから" }).click();
  await page.waitForTimeout(800);
  const doc = await page.evaluate((id) => KN.store.getTodo(id), ids.doc);
  t.check("いまから：11:15 が付く", doc.time === "11:15", JSON.stringify(doc));
  t.check("片づけ終えたら紙が閉じ、頭の一行も消える",
    await page.evaluate(() => !document.querySelector(".sheet.is-open .carry-row")) && (await bar()) === null, String(await bar()));
  const road = () => page.evaluate(() => [...document.querySelectorAll("#screen-todo .road-label")].map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  t.check("道の停留所も 11:15 に", (await road()).some((l) => l.includes("11:15") && l.includes("書類整理")), JSON.stringify(await road()));
  await page.locator(".toast button", { hasText: "元に戻す" }).click();
  await page.waitForTimeout(700);
  const doc2 = await page.evaluate((id) => KN.store.getTodo(id), ids.doc);
  b = await bar();
  t.check("元に戻すで 10:00 に戻り、頭の一行も戻る", doc2.time === "10:00" && !!b && /^1 /.test(b), JSON.stringify([doc2.time, b]));

  /* 見ているあいだに 11:05 の買い物が過ぎる（11:35）→ 30秒の見回りで「2」に */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 11, 36));
  await page.waitForTimeout(31500);
  b = await bar();
  t.check("見ているあいだに時刻が過ぎれば、見回りで数え直す（2件）", !!b && /^2 /.test(b), String(b));

  /* 先の日を見ているときは出さない */
  await page.evaluate(() => KN.screens.todo.goDay(KN.util.shiftDay(KN.util.todayKey(), 1)));
  await page.waitForTimeout(900);
  t.check("今日でない日を見ているときは出さない", (await bar()) === null, String(await bar()));
  await page.evaluate(() => KN.screens.todo.goDay(KN.util.todayKey()));
  await page.waitForTimeout(900);

  t.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
