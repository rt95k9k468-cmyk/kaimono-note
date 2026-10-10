/* 通知を押したら、その用事が開く＋「あとで」（R3・js/due-sheet.js）。

   - `#due=id` で開くと（起動でも、開いたままでも）やることが出て、その用事の紙。
     印は `#todo` に戻る。
   - 大きな二つ：済ませた／あとで。あとでは四択（15分・1時間・3時間・明日）。
   - あとでは時刻を直すだけ（ふつうの編集）。閉じていても鳴る列（bell.plan）に
     新しい時刻が入り、古い時刻は消える。直したその拍で bell.sync を呼ぶ。
   - くり返す用事には「あとで」を出さない（記録は一件なので次の回まで動く）。
   - 同じ時刻に何件もあれば、一枚に並ぶ。片づけ終えたら紙は閉じる。
   - 開いているときの通知（notify.js の tick()）も、用事の id を持つ。
   Service Worker 側（push の data・notificationclick の行き先）は tests/bell.js。 */
const { open, checker, URL: APP } = require("./lib");

(async () => {
  const t = checker("due-sheet");
  /* 時計は昼に止める：「いま」「15分あと」を壁の時計で作ると、0:00 をまたいで落ちる（roadmap-seamless の N10）。 */
  const NOW = new Date(2026, 9, 1, 12, 0);
  const { browser, ctx, page, errors } = await open({ before: async (cx, p) => { await p.clock.setFixedTime(NOW); } });

  /* 表：あとでの計算。 */
  const calc = await page.evaluate(() => {
    const D = KN.dueSheet;
    const now = new Date(2026, 8, 28, 23, 50).getTime();
    const one = { id: "x", due: "2026-09-28", time: "23:50", repeat: null };
    return {
      ids: D.idsFromHash("#due=a-1,b-2"),
      notDue: D.idsFromHash("#todo"),
      m15: D.later(one, "15m", now),
      h1: D.later(one, "1h", now),
      h3: D.later(one, "3h", now),
      tomorrow: D.later(one, "tomorrow", now),
      today: KN.util.todayKey(),
      tomorrowKey: KN.util.shiftDay(KN.util.todayKey(), 1),
      rep: D.later({ ...one, repeat: "daily" }, "15m", now),
      labels: D.LATER.map((x) => x.label).join(","),
    };
  });
  t.check("#due= から id を読む", JSON.stringify(calc.ids) === '["a-1","b-2"]' && calc.notDue === null);
  t.check("四択は 15分・1時間・3時間・明日", calc.labels === "15分,1時間,3時間,明日", calc.labels);
  t.check("15分：日をまたげば日も進む", calc.m15.due === "2026-09-29" && calc.m15.time === "00:05", JSON.stringify(calc.m15));
  t.check("1時間・3時間", calc.h1.time === "00:50" && calc.h3.time === "02:50" && calc.h3.due === "2026-09-29");
  t.check("明日：同じ時刻で明日", calc.tomorrow.due === calc.tomorrowKey && calc.tomorrow.time === "23:50");
  t.check("くり返す用事はあとでにしない", calc.rep === null);

  /* 材料。いまの分の一回きり二件と、毎日の一件。bell は数えるだけの偽物にする
     （列そのものは本物の plan を読む）。 */
  const ids = await page.evaluate(() => {
    const U = KN.util;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const day = U.dayKey(d);
    const a = KN.store.addTodo({ title: "用事A", due: day, time });
    const b = KN.store.addTodo({ title: "毎日の用事B", due: day, time, repeat: "daily" });
    const c = KN.store.addTodo({ title: "用事C", due: day, time });
    window.__syncs = 0;
    KN.bell.active = () => true;
    KN.bell.sync = () => { window.__syncs++; return Promise.resolve({ ok: true }); };
    return { a: a.id, b: b.id, c: c.id, day, time };
  });

  const sheetText = () => page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet")].pop();
    return s && s.querySelector(".due-list") ? s.innerText : "";
  });

  /* 開いたまま、ほかの画面にいるところへ通知が来た。 */
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(300);
  await page.evaluate((id) => { location.hash = "due=" + id; }, ids.a);
  await page.waitForTimeout(700);
  let txt = await sheetText();
  t.check("開いたままでも、その用事の紙が開く", txt.includes("用事A") && txt.includes("済ませた") && txt.includes("あとで"), txt);
  t.check("やることが出て、印は #todo に戻る",
    await page.evaluate(() => location.hash === "#todo" && !document.getElementById("screen-todo").hidden));
  t.check("四択はまだ出ていない", await page.evaluate(() => document.querySelector(".due-later").hidden));

  /* あとで → 15分。 */
  await page.click(".due-row .js-later");
  t.check("あとでで四択が出る", await page.evaluate(() => !document.querySelector(".due-later").hidden));
  const before = NOW.getTime();
  await page.click('.due-row .js-pick[data-key="15m"]');
  await page.waitForTimeout(400);
  const after = await page.evaluate((id) => {
    const x = KN.store.getTodo(id);
    const plan = KN.bell.plan().filter((p) => p.id === id);
    return { due: x.due, time: x.time, plan, syncs: window.__syncs, toast: (document.querySelector(".toast") || {}).innerText || "",
      sheet: !!document.querySelector(".sheet .due-list") };
  }, ids.a);
  const want = new Date(before + 15 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const wantTime = `${pad(want.getHours())}:${pad(want.getMinutes())}`;
  t.check("15分あとの時刻に直る（ふつうの編集）", after.time === wantTime, JSON.stringify(after));
  t.check("閉じていても鳴る列に新しい時刻が入り、古い時刻は無い",
    after.plan.length === 1 && after.plan[0].occ === `${after.due} ${wantTime}`, JSON.stringify(after.plan));
  t.check("直した拍で bell.sync を呼ぶ", after.syncs >= 1, String(after.syncs));
  t.check("トーストに新しい時刻と「元に戻す」", after.toast.includes(wantTime) && after.toast.includes("元に戻す"), after.toast);
  t.check("一件だけなら、片づけたら紙は閉じる", !after.sheet);
  await page.click(".toast-action");
  await page.waitForTimeout(200);
  t.check("元に戻すで時刻が戻る", await page.evaluate((o) => KN.store.getTodo(o.a).time === o.time, ids));

  /* 同じ時刻に三件（くり返し一つ）。 */
  await page.waitForTimeout(400);
  await page.evaluate((o) => { location.hash = `due=${o.a},${o.b},${o.c}`; }, ids);
  await page.waitForTimeout(700);
  txt = await sheetText();
  const rows = await page.evaluate(() => [...document.querySelectorAll(".due-row")].map((r) => ({
    id: r.dataset.id, later: !!r.querySelector(".js-later"), note: !!r.querySelector(".due-note") })));
  t.check("何件もあれば一枚に並ぶ", rows.length === 3 && txt.includes(`${ids.time} の用事`), txt);
  const rb = rows.find((r) => r.id === ids.b) || {};
  t.check("くり返す用事には「あとで」が無く、わけを一行", !rb.later && rb.note, JSON.stringify(rows));
  t.check("一回きりには「あとで」がある", rows.filter((r) => r.id !== ids.b).every((r) => r.later));

  await page.click(`.due-row[data-id="${ids.a}"] .js-done`);
  await page.waitForTimeout(300);
  t.check("済ませた → 済む", await page.evaluate((id) => KN.store.getTodo(id).done, ids.a));
  t.check("紙は残りを並べたまま", (await page.evaluate(() => document.querySelectorAll(".due-row").length)) === 2);
  await page.click(`.due-row[data-id="${ids.b}"] .js-done`);
  await page.waitForTimeout(300);
  const rb2 = await page.evaluate((o) => KN.store.getTodo(o.b).due, ids);
  t.check("くり返しを済ませると次の日へ", rb2 === (await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), 1))), rb2);
  await page.click(`.due-row[data-id="${ids.c}"] .js-later`);
  await page.click(`.due-row[data-id="${ids.c}"] .js-pick[data-key="tomorrow"]`);
  await page.waitForTimeout(400);
  const cc = await page.evaluate((o) => KN.store.getTodo(o.c), ids);
  t.check("明日 → 明日の同じ時刻", cc.due === (await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), 1))) && cc.time === ids.time,
    JSON.stringify({ due: cc.due, time: cc.time }));
  t.check("ぜんぶ片づけたら紙は閉じる", !(await page.evaluate(() => !!document.querySelector(".sheet .due-list"))));

  /* もう片づいた用事の通知を、あとから押した。 */
  await page.waitForTimeout(3800);   // トーストが引くのを待つ
  await page.evaluate((id) => { location.hash = "due=" + id; }, ids.a);
  await page.waitForTimeout(600);
  t.check("済んだ用事なら紙は出さず、ひとこと",
    !(await page.evaluate(() => !!document.querySelector(".sheet .due-list")))
    && (await page.evaluate(() => (document.querySelector(".toast") || {}).innerText || "")).includes("もう片づいています"));

  /* 閉じていたところを通知が起こした（起動の道）。 */
  const d = await page.evaluate(() => {
    const x = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return KN.store.addTodo({ title: "用事D", due: KN.util.dayKey(x), time: `${pad(x.getHours())}:${pad(x.getMinutes())}` }).id;
  });
  await page.waitForTimeout(400);     // 保存（120ms）を待つ
  await page.goto(APP + "#due=" + d);
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(900);
  txt = await sheetText();
  t.check("起動でも、その用事の紙が開く", txt.includes("用事D") && txt.includes("時刻になりました"), txt);
  t.check("起動の道でも印は #todo", await page.evaluate(() => location.hash === "#todo"));
  await page.click(".due-row .js-open");
  await page.waitForTimeout(700);
  t.check("「用事の紙を開く」でいつもの紙へ",
    await page.evaluate(() => !document.querySelector(".sheet .due-list") && !!document.querySelector(".sheet")));

  /* 開いているときの通知（tick）も、用事の id を持つ。 */
  const shown = await page.evaluate(async () => {
    const got = [];
    // 試験のブラウザは Service Worker を止めているので、許しと登録を偽物に。
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
    Object.defineProperty(navigator.serviceWorker, "ready", {
      configurable: true,
      value: Promise.resolve({ showNotification: (title, o) => { got.push(o); return Promise.resolve(); } }),
    });
    KN.store.update((s) => { s.settings.todoNotify = true; });
    const x = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const e = KN.store.addTodo({ title: "用事E", due: KN.util.dayKey(x), time: `${pad(x.getHours())}:${pad(x.getMinutes())}` });
    await KN.notify.tick();
    return { got, id: e.id };
  });
  const tickData = shown.got.map((o) => o.data)[0] || {};
  t.check("tick() の通知も用事の id を持つ", Array.isArray(tickData.due) && tickData.due.includes(shown.id), JSON.stringify(shown.got));

  /* 押したことの控え（2026年9月29日、iPhone で「通知は来るけど、押しても何も」）。
     `#due=` が届かなくても、sw.js が置いた控えを開いたとき・戻ったときに読む。
     試験では控えを直に置く（sw.js と同じ箱と鍵）。 */
  const putNote = (due, ago = 0) => page.evaluate(async ([d, a]) => {
    const c = await caches.open(KN.dueSheet.BOX);
    await c.put(KN.dueSheet.KEY, new Response(JSON.stringify({ at: Date.now() - a, due: d })));
  }, [due, ago]);
  const closeSheets = () => page.evaluate(() => document.querySelectorAll(".sheet .js-close, .sheet [aria-label='閉じる']").forEach((b) => b.click()));
  const f = await page.evaluate(() => {
    const x = new Date(Date.now() - 2 * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    return KN.store.addTodo({ title: "用事F", due: KN.util.dayKey(x), time: `${pad(x.getHours())}:${pad(x.getMinutes())}` }).id;
  });
  await page.waitForTimeout(400);
  await closeSheets();
  await putNote([f]);
  await page.goto(APP);                 // 印（#due=）を落とした起動
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(900);
  txt = await sheetText();
  t.check("印が落ちても、控えから用事の紙が開く", txt.includes("用事F") && txt.includes("時刻になりました"), txt);
  t.check("読んだ控えは消える", await page.evaluate(async () => !(await (await caches.open(KN.dueSheet.BOX)).match(KN.dueSheet.KEY))));

  await closeSheets();
  await page.waitForTimeout(400);
  await putNote([]);                    // id の無い控え（写しに見つからなかった押し）
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(900);
  txt = await sheetText();
  t.check("id の無い控えでも、戻ったときに時刻の来た用事を探して開く", txt.includes("用事F"), txt);

  await closeSheets();
  await page.waitForTimeout(400);
  await putNote([f], 11 * 60000);       // 11分前の控え
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(900);
  t.check("10分より古い控えは使わない", !(await page.evaluate(() => !!document.querySelector(".sheet .due-list"))));

  t.check("頁の誤りが無い", !errors.length, errors.join("\n"));
  await ctx.close();
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
