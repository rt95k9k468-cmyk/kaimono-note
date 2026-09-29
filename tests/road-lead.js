/* 段6・段7：明日の最初の停留所と、出る時刻（docs/todo-timeline.md の「一日の道」）。
   2026年9月29日。時計を 11:10 に止めて：

   - store：新しい欄 `lead`（前に◯分）。無い記録は null（前の時間なし）・時刻が無ければ
     持たない・時刻を外せば一緒に外れる・読み直しても残る。
   - bell：`lead` を持つ用事は、出る時刻の一件も鳴らす列に入る（回は「… 出る」で本体と
     別・題は「出る時刻 · 13:00 病院」）。出る時刻が過ぎていれば入れない。
   - 道：停留所の手前に点線の区間（`.road-lead`）・次の一行「次は 13:00 病院 · 12:30 に
     出る · あと1時間20分」。出る時刻を過ぎたら「出る」は言わず、あとは停留所まで。
   - 段6：今日の決まった予定が無くなったら「このあと、決まった予定はありません ·
     明日は 9:00 病院から」。明日に無ければ何も足さない。くり返しの用事も明日に立つ。
   - 編集の紙：「前に出る」は時刻を決めた用事にだけ。札は なし・15分・30分・1時間。
     選ぶと「12:30 に出る」、保存で `lead` に入る。
   - 評価の言葉・絵文字を出さない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/road-lead.js */
const { open, checker } = require("./lib");

const BAN = /遅れ|予定通り|達成|未達|できなかった|急い|%|％/;

(async () => {
  const c = checker("road-lead");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 11, 10)); },
  });

  /* ---- store ---- */
  const st = await page.evaluate(() => {
    const S = KN.store, today = KN.util.todayKey();
    S.update((s) => { s.todos = []; });
    const a = S.addTodo({ title: "病院", due: today, time: "13:00", lead: 30 });
    const b = S.addTodo({ title: "メール", due: today, lead: 30 });
    const d = S.addTodo({ title: "駅", due: today, time: "15:00" });
    const out = { a: a.lead, noTime: b.lead, none: d.lead };
    S.updateTodo(d.id, { lead: 60 });
    out.set = S.getTodo(d.id).lead;
    S.updateTodo(d.id, { time: null });
    out.cleared = S.getTodo(d.id).lead;
    S.updateTodo(d.id, { time: "16:00" });
    out.back = S.getTodo(d.id).lead;
    S.flush();
    return out;
  });
  c.check("前に30分を持てる", st.a === 30, String(st.a));
  c.check("時刻が無ければ持たない", st.noTime === null, String(st.noTime));
  c.check("決めていなければ null（前の時間なし）", st.none === null, String(st.none));
  c.check("直して付けられる", st.set === 60, String(st.set));
  c.check("時刻を外すと一緒に外れる・付け直しても黙って蘇らない",
    st.cleared === null && st.back === null, JSON.stringify(st));

  /* 古い保存（lead を持たない）と、lead を持つ保存を読み直す */
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("kaimono-note-v2"));
    raw.todos.forEach((t) => { if (t.title === "駅") delete t.lead; });
    localStorage.setItem("kaimono-note-v2", JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const rl = await page.evaluate(() => {
    const t = (n) => KN.store.get().todos.find((x) => x.title === n);
    return { a: t("病院").lead, old: t("駅").lead, hasOld: "lead" in t("駅") };
  });
  c.check("読み直しても前に30分が残る", rl.a === 30, String(rl.a));
  c.check("lead の無い古い記録は null に落ちる（移行なし）", rl.old === null && rl.hasOld, JSON.stringify(rl));

  /* ---- bell の列 ---- */
  const bl = await page.evaluate(() => {
    const now = new Date(2026, 8, 29, 11, 10).getTime();
    const list = KN.bell.plan(now).filter((x) => x.occ.startsWith("2026-09-29"));
    const late = KN.bell.plan(new Date(2026, 8, 29, 12, 40).getTime()).filter((x) => x.occ.startsWith("2026-09-29"));
    return { list, late };
  });
  const leave = bl.list.find((x) => / 出る$/.test(x.occ));
  c.check("出る時刻の一件が列に入る（12:30・回は「… 出る」）",
    !!leave && leave.time === "12:30" && leave.occ === "2026-09-29 13:00 出る"
    && leave.at === new Date(2026, 8, 29, 12, 30).getTime(), JSON.stringify(bl.list));
  c.check("題は「出る時刻 · 13:00 病院」", !!leave && leave.title === "出る時刻 · 13:00 病院", leave && leave.title);
  c.check("本体の 13:00 もそのまま", bl.list.some((x) => x.occ === "2026-09-29 13:00" && x.title === "病院"));
  c.check("前の時間の無い用事は一件だけ", bl.list.filter((x) => x.title.includes("駅")).length === 1,
    JSON.stringify(bl.list));
  c.check("出る時刻を過ぎていれば入れない（本体は残る）",
    !bl.late.some((x) => / 出る$/.test(x.occ)) && bl.late.some((x) => x.occ === "2026-09-29 13:00"),
    JSON.stringify(bl.late));

  /* ---- 道 ---- */
  await page.evaluate(() => {
    const S = KN.store, today = KN.util.todayKey();
    S.update((s) => { s.todos = []; });
    S.addTodo({ title: "病院", due: today, time: "13:00", minutes: 60, lead: 30 });
    S.addTodo({ title: "薬局", due: today, time: "16:00" });
  });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  const road = () => page.evaluate(() => {
    const r = document.querySelector("#screen-todo .day-road");
    if (!r || !r.__road) return null;
    const G = r.__road.g;
    const lead = [...r.querySelectorAll(".road-lead")].map((p) => p.getAttribute("d"));
    const next = r.querySelector(".road-next");
    return {
      lead, want: G.path(G.dist(12 * 60 + 30), G.dist(13 * 60)),
      /* 区切りの「·」は字の間を CSS の余白で空けるので、試験の側で空白に揃える。 */
      next: next ? next.textContent.replace(/\s+/g, " ").replace(/\s*·\s*/g, " · ").trim() : null,
      text: r.textContent,
    };
  });
  let r = await road();
  c.check("停留所の手前に点線の区間が一本（12:30〜13:00）",
    !!r && r.lead.length === 1 && r.lead[0] === r.want, r && JSON.stringify(r.lead));
  c.check("次の一行「次は 13:00 病院 · 12:30 に出る · あと1時間20分」",
    !!r && r.next === "次は 13:00 病院 · 12:30 に出る · あと1時間20分", r && r.next);
  if (process.env.SHOTS) await page.locator("#screen-todo .day-road").screenshot({ path: `${process.env.SHOTS}/road-lead.png` });

  /* 出る時刻を過ぎた（向かっている途中） */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 12, 40));
  await page.evaluate(() => KN.dayRoad.paintAll(document));
  r = await road();
  c.check("出る時刻を過ぎたら「出る」は言わず、あとは停留所まで（あと20分）",
    !!r && r.next === "次は 13:00 病院 · あと20分", r && r.next);

  /* 病院の中に居るあいだ：次の薬局には前の時間が無いので、そのまま */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 13, 20));
  await page.evaluate(() => KN.dayRoad.paintAll(document));
  r = await road();
  c.check("停留所の中では「いまは 病院（14:00まで）· 次は 16:00 薬局」",
    !!r && r.next === "いまは 病院（14:00まで） · 次は 16:00 薬局", r && r.next);

  /* ---- 段6：明日の最初の停留所 ---- */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 17, 0));
  await page.evaluate(() => {
    const S = KN.store, U = KN.util, today = U.todayKey(), tm = U.shiftDay(today, 1);
    S.update((s) => { s.todos = []; });
    S.addTodo({ title: "病院", due: tm, time: "09:00" });
    S.addTodo({ title: "買い物", due: tm, time: "15:00" });
    S.addTodo({ title: "書類", due: tm });                          // 時刻なしは停留所でない
    S.addTodo({ title: "来週", due: U.shiftDay(today, 2), time: "07:00" });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => KN.dayRoad.paintAll(document));
  r = await road();
  c.check("今日の予定が無くなったら「このあと、決まった予定はありません · 明日は 9:00 病院から」",
    !!r && r.next === "このあと、決まった予定はありません · 明日は 9:00 病院から", r && r.next);

  await page.evaluate(() => {
    const S = KN.store, today = KN.util.todayKey();
    S.addTodo({ title: "薬", due: today, time: "08:00", repeat: "daily" });
  });
  await page.waitForTimeout(500);
  r = await road();
  c.check("くり返しの用事も明日に立つ（明日は 8:00 薬から）",
    !!r && /明日は 8:00 薬から$/.test(r.next), r && r.next);

  /* 明日の用事を外す（一件も無いと空の画面になるので、長期タスクを一つ残す） */
  await page.evaluate(() => {
    KN.store.update((s) => { s.todos = []; });
    KN.store.addTodo({ title: "長期の用事" });
  });
  await page.waitForTimeout(500);
  r = await road();
  c.check("明日に無ければ何も足さない", !!r && r.next === "このあと、決まった予定はありません", r && JSON.stringify(r.next));

  /* 先の日を見ているときは、次の一行そのものが無い */
  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    S.addTodo({ title: "病院", due: U.shiftDay(U.todayKey(), 2), time: "09:00" });
    KN.screens.todo.goDay(U.shiftDay(U.todayKey(), 1));
  });
  await page.waitForTimeout(900);
  const ahead = await page.evaluate(() => {
    const r = [...document.querySelectorAll("#screen-todo .day-road")].find((x) => x.__road && !x.__road.today);
    return r ? { next: !!r.querySelector(".road-next"), tm: r.__road.tomorrow } : null;
  });
  c.check("今日でない日には、明日の一行を出さない", !!ahead && !ahead.next && ahead.tm === null, JSON.stringify(ahead));
  await page.evaluate(() => KN.screens.todo.goDay(KN.util.todayKey()));
  await page.waitForTimeout(900);

  /* ---- 編集の紙 ---- */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 11, 10));
  const ids = await page.evaluate(() => {
    const S = KN.store, today = KN.util.todayKey();
    S.update((s) => { s.todos = []; });
    return {
      timed: S.addTodo({ title: "病院", due: today, time: "13:00" }).id,
      loose: S.addTodo({ title: "メール", due: today }).id,
    };
  });
  await page.waitForTimeout(600);
  const sheetOf = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].reverse().find((x) => x.querySelector(".js-lead-field"));
    if (!sh) return null;
    const f = sh.querySelector(".js-lead-field");
    const note = sh.querySelector(".js-lead-note");
    return {
      hidden: f.hidden || f.closest("[hidden]") !== null,
      chips: [...f.querySelectorAll(".js-lead button")].map((b) => ({
        label: b.textContent.trim(), on: b.classList.contains("is-active") || b.getAttribute("aria-pressed") === "true",
      })),
      note: note && !note.hidden ? note.textContent.trim() : "",
      inputs: f.querySelectorAll("input, textarea, [contenteditable]").length,
      text: f.textContent,
    };
  });
  const closeAll = async () => {
    for (let i = 0; i < 4 && await page.locator(".sheet.is-open").count(); i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  };

  // 時刻の無い用事：欄は出ない
  await page.evaluate((id) => KN.screens.todo.openSheet ? KN.screens.todo.openSheet(id) : null, ids.loose);
  let opened = await page.locator(".sheet.is-open .js-row-time").count();
  if (!opened) {
    await page.locator("#screen-todo .tl-list .tl-item", { hasText: "メール" }).first().click();
    await page.waitForTimeout(700);
  }
  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  let ed = await sheetOf();
  c.check("時刻の無い用事には「前に出る」を出さない", !!ed && ed.hidden, JSON.stringify(ed));
  await closeAll();

  // 時刻のある用事
  await page.locator("#screen-todo .road-label", { hasText: "病院" }).first().click();
  await page.waitForTimeout(700);
  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  ed = await sheetOf();
  c.check("時刻を決めた用事には出る", !!ed && !ed.hidden, JSON.stringify(ed));
  c.check("札は なし・15分・30分・1時間（なしが選ばれたまま）",
    !!ed && JSON.stringify(ed.chips.map((x) => x.label)) === JSON.stringify(["なし", "15分", "30分", "1時間"])
    && ed.chips[0].on, ed && JSON.stringify(ed.chips));
  c.check("打ちこむ欄は無い", !!ed && ed.inputs === 0);
  await page.locator(".sheet.is-open .js-lead button", { hasText: "30分" }).last().click();
  await page.waitForTimeout(400);
  ed = await sheetOf();
  c.check("選ぶと「12:30 に出る」", !!ed && ed.note === "12:30 に出る", ed && ed.note);
  c.check("紙も評価しない・絵文字なし",
    !!ed && !BAN.test(ed.text) && !/\p{Extended_Pictographic}/u.test(ed.text), ed && ed.text);
  // 時刻の紙を閉じて、保存
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(800);
  const saved = await page.evaluate((id) => KN.store.getTodo(id).lead, ids.timed);
  c.check("保存すると lead に 30 が入る", saved === 30, String(saved));
  await closeAll();
  r = await road();
  c.check("保存すると道に点線の区間と「12:30 に出る」",
    !!r && r.lead.length === 1 && /12:30 に出る/.test(r.next), r && JSON.stringify([r.lead.length, r.next]));

  /* 評価しない・絵文字なし */
  c.check("道も評価しない", !!r && !BAN.test(r.text), r && r.text);
  c.check("絵文字を出さない", !!r && !/\p{Extended_Pictographic}/u.test(r.text));

  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
