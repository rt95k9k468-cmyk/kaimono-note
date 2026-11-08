/* 詰める（Sorted のオートスケジュールに当たる。docs/todo-timeline.md の「詰める」。2026年11月8日）。
   時計を 11月11日（水）12:47 に止める（いま＝12:45）。一日の終わりは 16:00。
   会議（予定 14:00・30分）・薬（毎日 13:30・5分）は動かさない。お（10:00 を過ぎた・20分）・え（時刻なし・長さなし）・
   う（時刻なし・15分）・い（15:00・30分）・あ（時刻なし・60分）を動かす。
   - 時間割の頭に「詰める」（今日・先の日）。過ぎた日には出ない
   - 紙の既定：始める いま 12:45・ゆとり 5分・長さ未定 30分
   - 並びは時間割の上から：お 12:45 → え 14:35（薬・会議をゆとりごとよける）→ う 15:10 → い 15:30、あ は入らない（既定は明日）
   - 予定・くり返しは「動かさない」に。閉じれば何も変わらない
   - ゆとり なし・長さ 15分で数え直す。行を押して「予定にする」
   - 「この時刻にする」で一度に書く・控えは書かない・ゆとりと長さを覚える・元に戻す一回で全部戻る
   - 評価の言葉を出さない

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/fill.js */
const { open, checker } = require("./lib");

const TODAY = "2026-11-11";
const TOMORROW = "2026-11-12";
const YESTERDAY = "2026-11-10";

(async () => {
  const c = checker("fill");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 10, 11, 12, 47)); },
  });
  const wait = (ms) => page.waitForTimeout(ms);
  const ids = await page.evaluate(([d, tm, ye]) => {
    const S = KN.store;
    const mk = (o) => S.addTodo({ due: d, ...o }).id;
    S.update((s) => { s.settings.dayEnd = "16:00"; });
    const r = {
      meet: mk({ title: "会議", time: "14:00", minutes: 30, kind: "event" }),
      pill: mk({ title: "薬", time: "13:30", minutes: 5, repeat: "daily" }),
      o: mk({ title: "お", time: "10:00", minutes: 20 }),
      e: mk({ title: "え" }),
      u: mk({ title: "う", minutes: 15 }),
      i: mk({ title: "い", time: "15:00", minutes: 30 }),
      a: mk({ title: "あ", minutes: 60 }),
      ka: S.addTodo({ title: "か", due: tm, minutes: 30 }).id,
      ki: S.addTodo({ title: "き", due: ye, minutes: 30 }).id,
    };
    S.update((s) => {
      const o = { [r.e]: 1, [r.u]: 2, [r.a]: 3 };
      s.todos.forEach((t) => { if (o[t.id]) t.order = o[t.id]; });
    });
    return r;
  }, [TODAY, TOMORROW, YESTERDAY]);
  const snap = () => page.evaluate(() => JSON.stringify(KN.store.get().todos.map((t) =>
    [t.id, t.due, t.time, t.minutes, t.kind || null, t.shelf || null, (t.slips || []).length])));

  /* 純関数：既定の並びと時刻 */
  const pure = await page.evaluate((d) => {
    const P = KN.plan;
    const rows = KN.store.openTodos().filter((t) => KN.store.fallsOn(t, d));
    const r = P.fill(d, rows, { from: "12:45", gap: 5, guess: 30, now: "12:45", end: "16:00" });
    return {
      placed: r.placed.map((p) => `${p.at} ${p.todo.title}`),
      out: r.out.map((f) => f.todo.title),
      fixed: r.fixed.map((f) => `${f.at} ${f.todo.title}`),
      guess: r.placed.filter((p) => p.guess).map((p) => p.todo.title),
    };
  }, TODAY);
  c.check("plan.fill：時間割の上から、ゆとり5分で予定とくり返しをよける",
    JSON.stringify(pure.placed) === '["12:45 お","14:35 え","15:10 う","15:30 い"]' && JSON.stringify(pure.out) === '["あ"]',
    JSON.stringify(pure));
  c.check("plan.fill：予定・くり返しは動かさない", JSON.stringify(pure.fixed) === '["13:30 薬","14:00 会議"]', JSON.stringify(pure.fixed));
  c.check("plan.fill：長さを決めていないものに印", JSON.stringify(pure.guess) === '["え"]', JSON.stringify(pure.guess));

  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  const btn = await page.evaluate(() => {
    const b = document.querySelector("#screen-todo .js-fill");
    return b ? b.textContent.trim() : null;
  });
  c.check("時間割の頭に「詰める」", btn === "詰める", String(btn));
  const before = await snap();

  const read = () => page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    const on = (sel) => [...s.querySelectorAll(`${sel} .chip[aria-pressed="true"]`)].map((x) => x.textContent.trim());
    return {
      title: s.querySelector(".sheet-title").textContent.trim(),
      from: on(".js-from"), gap: on(".js-gap"), guess: on(".js-guess"),
      fromChips: [...s.querySelectorAll(".js-from .chip")].map((x) => x.textContent.trim()),
      rows: [...s.querySelectorAll(".fill-list .fill-row")].map((li) =>
        `${li.querySelector(".fill-at").textContent.trim()} ${li.querySelector(".fill-t").textContent.trim()}${li.classList.contains("is-out") ? "（入らない）" : ""}`),
      guessed: [...s.querySelectorAll(".fill-list .fill-m.is-guess")].map((x) => x.closest(".fill-row").querySelector(".fill-t").textContent.trim()),
      fixed: [...s.querySelectorAll(".fill-fixed .fill-row")].map((li) =>
        `${li.querySelector(".fill-at").textContent.trim()} ${li.querySelector(".fill-t").textContent.trim()}`),
      out: [...s.querySelectorAll(".refit-row")].map((row) =>
        `${row.querySelector(".carry-title").textContent.trim()}:${((row.querySelector('.chip[aria-pressed="true"]') || {}).textContent || "").trim()}`),
      text: s.textContent,
    };
  });
  const openFill = async () => {
    await page.locator("#screen-todo .js-fill").first().click();
    await page.waitForSelector(".sheet.is-open .fill-list .fill-row");
    await wait(300);
  };

  await openFill();
  let r = await read();
  c.check("紙「詰める」・既定は いま 12:45・ゆとり 5分・長さ未定 30分",
    r.title === "詰める" && JSON.stringify(r.from) === '["いま 12:45"]' && JSON.stringify(r.gap) === '["5分"]'
    && JSON.stringify(r.guess) === '["30分"]', JSON.stringify([r.title, r.from, r.gap, r.guess]));
  c.check("始めるの札：過ぎた 9:00 は出さない", JSON.stringify(r.fromChips) === '["いま 12:45","13:00","19:00","ほか"]',
    JSON.stringify(r.fromChips));
  c.check("並び：お 12:45 → え 14:35 → う 15:10 → い 15:30、あ は入らない",
    JSON.stringify(r.rows) === '["12:45 お","14:35 え","15:10 う","15:30 い"," あ（入らない）"]', JSON.stringify(r.rows));
  c.check("長さを決めていないものに印（え）", JSON.stringify(r.guessed) === '["え"]', JSON.stringify(r.guessed));
  c.check("動かさない：薬 13:30・会議 14:00", JSON.stringify(r.fixed) === '["13:30 薬","14:00 会議"]', JSON.stringify(r.fixed));
  c.check("入らないものの行き先は既定で明日", JSON.stringify(r.out) === '["あ:明日"]', JSON.stringify(r.out));
  c.check("評価の言葉を出さない", !/遅れ|失敗|先送り|詰め込み|無理|!|！/.test(r.text), r.text);
  await page.keyboard.press("Escape");
  await wait(500);
  c.check("紙を閉じれば何も変わらない", (await snap()) === before);

  /* ゆとり なし → 長さ未定 15分 → い を予定にする */
  await openFill();
  await page.locator(".sheet.is-open .js-gap .chip", { hasText: "なし" }).click();
  await wait(200);
  r = await read();
  c.check("ゆとり なし：お 12:45 → え 14:30 → う 15:00 → い 15:15",
    JSON.stringify(r.rows) === '["12:45 お","14:30 え","15:00 う","15:15 い"," あ（入らない）"]', JSON.stringify(r.rows));
  await page.locator(".sheet.is-open .js-guess .chip", { hasText: "15分" }).click();
  await wait(200);
  r = await read();
  c.check("長さ未定 15分：みな入る（え 13:05・う 13:35・い 14:30・あ 15:00）",
    JSON.stringify(r.rows) === '["12:45 お","13:05 え","13:35 う","14:30 い","15:00 あ"]' && !r.out.length,
    JSON.stringify([r.rows, r.out]));
  await page.locator(".sheet.is-open .fill-list .fill-row", { hasText: "い" }).click();
  await wait(300);
  const menu = await page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.textContent.trim()));
  c.check("行を押すと 今回は動かさない・予定にする", JSON.stringify(menu) === '["今回は動かさない","予定にする"]', JSON.stringify(menu));
  await page.locator(".note-pop-item", { hasText: "予定にする" }).click();
  await wait(300);
  r = await read();
  c.check("予定にした い は動かさないへ（15:00）・あ は入らない",
    JSON.stringify(r.rows) === '["12:45 お","13:05 え","13:35 う"," あ（入らない）"]'
    && JSON.stringify(r.fixed) === '["13:30 薬","14:00 会議","15:00 い"]', JSON.stringify([r.rows, r.fixed]));

  /* この時刻にする */
  await page.locator(".sheet.is-open .js-apply").click();
  await wait(600);
  const t = await page.evaluate((x) => {
    const g = (id) => KN.store.getTodo(id);
    return { o: g(x.o), e: g(x.e), u: g(x.u), i: g(x.i), a: g(x.a), meet: g(x.meet), pill: g(x.pill), s: KN.store.get().settings };
  }, ids);
  c.check("書いた：お 12:45・え 13:05・う 13:35（今日のまま）",
    t.o.time === "12:45" && t.e.time === "13:05" && t.u.time === "13:35" && [t.o, t.e, t.u].every((x) => x.due === TODAY),
    JSON.stringify([t.o.time, t.e.time, t.u.time]));
  c.check("詰めたものに控えは書かない", [t.o, t.e, t.u].every((x) => !(x.slips || []).length));
  c.check("い は予定に（時刻はそのまま）", t.i.kind === "event" && t.i.time === "15:00", JSON.stringify(t.i));
  c.check("あ は明日へ・時刻なし・控え（hand）", t.a.due === TOMORROW && !t.a.time && t.a.slips.length === 1 && t.a.slips[0].how === "hand",
    JSON.stringify(t.a));
  c.check("予定とくり返しは動かない", t.meet.time === "14:00" && t.pill.time === "13:30" && t.pill.repeat === "daily");
  c.check("ゆとりと長さを覚える", t.s.fillGap === 0 && t.s.fillGuess === 15, JSON.stringify([t.s.fillGap, t.s.fillGuess]));
  const toast = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("知らせ「3件を詰めました」と元に戻す", /3件を詰めました/.test(toast) && /元に戻す/.test(toast), toast);
  await page.locator(".toast-action", { hasText: "元に戻す" }).click();
  await wait(500);
  c.check("元に戻す一回で全部戻る", (await snap()) === before);

  await openFill();
  r = await read();
  c.check("次に開くと、覚えたゆとり（なし）と長さ（15分）", JSON.stringify(r.gap) === '["なし"]' && JSON.stringify(r.guess) === '["15分"]',
    JSON.stringify([r.gap, r.guess]));
  await page.keyboard.press("Escape");
  await wait(500);

  /* 先の日：いまは無く、9:00 から。過ぎた日：口が無い */
  const dayBtn = async (k) => {
    await page.evaluate((key) => {
      const b = [...document.querySelectorAll(`.cal-day[data-day="${key}"]`)].find((x) => x.getClientRects().length);
      b.click();
    }, k);
    await page.waitForFunction((key) => document.querySelector(`#screen-todo .todo-day[data-day="${key}"]`), k);
    await wait(500);
  };
  await dayBtn(TOMORROW);
  await openFill();
  r = await read();
  c.check("先の日：9:00 から（いまは無い）", JSON.stringify(r.from) === '["9:00"]' && !r.fromChips.some((x) => /いま/.test(x))
    && JSON.stringify(r.rows) === '["9:00 か"]', JSON.stringify([r.from, r.fromChips, r.rows]));
  await page.keyboard.press("Escape");
  await wait(500);
  await dayBtn(YESTERDAY);
  const pastBtn = await page.evaluate(() => !!document.querySelector("#screen-todo .js-fill"));
  c.check("過ぎた日には「詰める」を出さない", !pastBtn);

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
