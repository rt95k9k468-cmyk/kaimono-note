/* 五つの状態と「見直す」（3.0 の B1、docs/roadmap-3.0.md・docs/todo-items.md の「五つの状態」。2026年10月6日）。
   - 状態は保存しない：due と shelf から読む（今日・予定あり・これから・待つ・いつか）
   - 今ある長期タスクは書き換えない（review を持たない）。読むときに作った日＋2週間で見直す
   - 新しく日の無いものを足す・日を外す → review が今日＋14。待つは＋7・いつかは＋30（設定で変わる）
   - 日を決めれば shelf は外れる。運ばれた（期限が過ぎた）待つ・いつかも外れる
   - 画面：欄は「これから」、下に「待つ n」「いつか n」を畳む。開けば待つものに「返事」
   - 道のくぼみは「これから」だけ
   - 頭に「見直す n」→ 一件ずつの紙：事実（◯月◯日から・期限）と選択肢。どれも元に戻せる
   - 詳細の紙の「⋯」から待つへ（何を待つかは札から）
   - 評価の言葉・赤・!を出さない

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/shelf.js */
const { open, checker } = require("./lib");

const TODAY = "2026-10-06";

(async () => {
  const c = checker("shelf");
  const { browser, page, errors } = await open({
    before: async (cx, p) => {
      await p.clock.setFixedTime(new Date(2026, 9, 6, 9, 0));
      /* 古い長期タスク（review なし・9月12日に作った）と、新しめの一件 */
      await cx.addInitScript(() => {
        if (localStorage.getItem("kaimono-note-v2")) return;
        localStorage.setItem("kaimono-note-v2", JSON.stringify({
          todos: [
            { id: "t-old", title: "押し入れの整理", due: null, createdAt: "2026-09-12", deadline: "2026-10-31" },
            { id: "t-young", title: "写真の整理", due: null, createdAt: "2026-10-01" },
          ],
        }));
      });
    },
  });
  const wait = (ms) => page.waitForTimeout(ms);
  const get = (id) => page.evaluate((i) => KN.store.getTodo(i), id);
  const topSheet = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh ? { title: (sh.querySelector(".sheet-title") || { textContent: "" }).textContent.trim(), text: sh.textContent } : null;
  });

  /* ---------------- 読み方（書き換えない） ---------------- */
  let r = await page.evaluate(() => {
    const S = KN.store;
    const o = S.getTodo("t-old"), y = S.getTodo("t-young");
    return { oldReview: o.review, oldOn: S.reviewOn(o), youngOn: S.reviewOn(y), due: S.reviewDue().map((t) => t.id),
             st: S.stateOf(o) };
  });
  c.check("今ある長期タスクは review を持たないまま（書き換えない）", r.oldReview === null || r.oldReview === undefined, JSON.stringify(r));
  c.check("読むときは作った日＋2週間（9/12 → 9/26）", r.oldOn === "2026-09-26" && r.youngOn === "2026-10-15", JSON.stringify(r));
  c.check("見直す日が来たのは古いほうだけ", JSON.stringify(r.due) === '["t-old"]', JSON.stringify(r.due));
  c.check("日の無いものは「これから」", r.st === "next");

  /* ---------------- 書くとき ---------------- */
  r = await page.evaluate((d) => {
    const S = KN.store, U = KN.util;
    const a = S.addTodo({ title: "新しいこれから" });
    const b = S.addTodo({ title: "今日の用事", due: d });
    const w = S.addTodo({ title: "見積もりの返事" });
    const undoW = S.setShelf(w.id, "wait", "返事");
    const w1 = { ...S.getTodo(w.id) };
    const s = S.addTodo({ title: "ギターを習う" });
    S.setShelf(s.id, "someday");
    const s1 = { ...S.getTodo(s.id) };
    S.updateTodo(b.id, { due: null });          // 日を外す → これから
    const b1 = { ...S.getTodo(b.id) };
    const x = S.addTodo({ title: "待っていたもの" });
    S.setShelf(x.id, "wait", "届く");
    S.updateTodo(x.id, { due: U.shiftDay(d, 2) });   // 日を決める → 待つから外れる
    const x1 = { ...S.getTodo(x.id) };
    undoW();
    const w2 = { ...S.getTodo(w.id) };
    return { a: S.getTodo(a.id).review, w1, s1, b1, x1, w2, st: [S.stateOf(w1), S.stateOf(s1), S.stateOf(x1), S.stateOf(S.getTodo(a.id))] };
  }, TODAY);
  c.check("新しく日の無いものを足すと review は今日＋14", r.a === "2026-10-20", r.a);
  c.check("待つへ：shelf wait・waitFor「返事」・review 今日＋7・日なし",
    r.w1.shelf === "wait" && r.w1.waitFor === "返事" && r.w1.review === "2026-10-13" && !r.w1.due, JSON.stringify(r.w1));
  c.check("いつかへ：review 今日＋30", r.s1.shelf === "someday" && r.s1.review === "2026-11-05", JSON.stringify(r.s1));
  c.check("日を外すと「これから」・review 今日＋14", !r.b1.due && !r.b1.shelf && r.b1.review === "2026-10-20", JSON.stringify(r.b1));
  c.check("日を決めると待つから外れる", r.x1.due === "2026-10-08" && r.x1.shelf === null && r.x1.waitFor === null, JSON.stringify(r.x1));
  c.check("状態は due と shelf から読む", JSON.stringify(r.st) === '["wait","someday","planned","next"]', JSON.stringify(r.st));
  c.check("元に戻すと棚も見直す日も戻る", !r.w2.shelf && !r.w2.waitFor && r.w2.review === "2026-10-20", JSON.stringify(r.w2));

  /* 設定で日数が変わる */
  r = await page.evaluate(() => {
    const S = KN.store;
    S.update((s) => { s.settings.reviewDays = { next: 7, wait: 3, someday: 90 }; });
    const t = S.addTodo({ title: "日数の試験" });
    S.setShelf(t.id, "someday");
    const v = S.getTodo(t.id).review;
    S.removeTodo(t.id);
    S.update((s) => { delete s.settings.reviewDays; });
    return { v, d: S.reviewDays() };
  });
  c.check("設定の日数で書く（いつか 90日）・消せば既定", r.v === "2027-01-04" && r.d.next === 14 && r.d.someday === 30, JSON.stringify(r));

  /* 節気に揃える（roadmap-3.1 の K3）。既定はオフ。オンなら新しく書く見直す日だけ、日数を過ぎた最初の節気の初日。 */
  r = await page.evaluate(() => {
    const S = KN.store, E = KN.season, U = KN.util;
    const first = (k) => { const o = E.of(k); return o.first && o.part === 0; };
    /* base から result まで、result のほかに節気の初日が無いか */
    const isFirstAfter = (base, res) => {
      if (!first(res) || res < base) return false;
      for (let k = base; k < res; k = U.shiftDay(k, 1)) if (first(k)) return false;
      return true;
    };
    const def = S.get().settings.reviewSekki;
    const keptBefore = S.get().todos.filter((t) => t.review).map((t) => [t.id, t.review]);
    const oldOn = S.reviewOn(S.getTodo("t-old"));
    S.update((s) => { s.settings.reviewSekki = true; });
    const a = S.addTodo({ title: "節気の試験" });
    const ra = S.getTodo(a.id).review;
    const undo = S.setShelf(a.id, "wait");
    const rw = S.getTodo(a.id).review;
    S.setShelf(a.id, "someday");
    const rs = S.getTodo(a.id).review;
    S.keepShelf(a.id, 10);                      // 暦で選んだ日（日数を渡す）は揃えない
    const rk = S.getTodo(a.id).review;
    S.keepShelf(a.id);                          // 棚の日数なら揃える
    const rk2 = S.getTodo(a.id).review;
    /* 日数を過ぎた日がちょうど節気の初日なら、その日（10/6＋2＝10/8 寒露） */
    S.update((s) => { s.settings.reviewDays = { next: 2, wait: 7, someday: 30 }; });
    const edge = S.reviewFrom(null);
    S.update((s) => { delete s.settings.reviewDays; });
    const keptAfter = S.get().todos.filter((t) => t.review && t.id !== a.id).map((t) => [t.id, t.review]);
    const oldOn2 = S.reviewOn(S.getTodo("t-old"));
    S.removeTodo(a.id);
    S.update((s) => { s.settings.reviewSekki = false; });
    const off = S.reviewFrom(null);
    return { def, ra, rw, rs, rk, rk2, edge, edgeName: E.of(edge).sekki, off, oldOn, oldOn2,
             kept: JSON.stringify(keptBefore) === JSON.stringify(keptAfter),
             ok: [isFirstAfter("2026-10-20", ra), isFirstAfter("2026-10-13", rw), isFirstAfter("2026-11-05", rs),
                  isFirstAfter("2026-11-05", rk2)],
             names: [E.of(ra).sekki, E.of(rw).sekki, E.of(rs).sekki] };
  });
  c.check("K3：設定の無い保存は既定オフ（今のまま 今日＋14）", r.def === false && r.off === "2026-10-20", JSON.stringify([r.def, r.off]));
  c.check("K3：オンなら これから・待つ・いつか とも、日数を過ぎた最初の節気の初日",
    r.ok.slice(0, 3).every(Boolean) && r.ra === "2026-10-23" && r.rw === "2026-10-23" && r.rs === "2026-11-07"
    && JSON.stringify(r.names) === '["霜降","霜降","立冬"]', JSON.stringify(r));
  c.check("K3：ちょうど節気の初日ならその日（寒露）", r.edge === "2026-10-08" && r.edgeName === "寒露", JSON.stringify([r.edge, r.edgeName]));
  c.check("K3：暦で選んだ日（日数を渡す）は揃えない・棚の日数なら揃える",
    r.rk === "2026-10-16" && r.ok[3] && r.rk2 === "2026-11-07", JSON.stringify([r.rk, r.rk2]));
  c.check("K3：付いている見直す日・読むときの日は動かさない", r.kept && r.oldOn === r.oldOn2, JSON.stringify([r.kept, r.oldOn, r.oldOn2]));

  /* ---------------- 画面 ---------------- */
  await page.evaluate(() => {
    const S = KN.store;
    const w = S.get().todos.find((t) => t.title === "見積もりの返事");
    S.setShelf(w.id, "wait", "返事");
  });
  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  const sec = () => page.evaluate(() => {
    const s = document.querySelector("#screen-todo .tl-someday-sec");
    return {
      head: s.querySelector(".tl-someday-head").textContent.replace(/\s+/g, " ").trim(),
      next: [...s.querySelectorAll(":scope > .tl-someday .item-name")].map((x) => x.textContent.trim()),
      folds: [...s.querySelectorAll(".tl-shelf-head")].map((x) => x.textContent.replace(/\s+/g, "").trim()),
      wait: [...s.querySelectorAll('.tl-shelf[data-shelf="wait"] .item-name')].map((x) => x.textContent.trim()),
      waitFor: [...s.querySelectorAll('.tl-shelf[data-shelf="wait"] .tl-wait')].map((x) => x.textContent.trim()),
      text: s.textContent,
    };
  });
  let s = await sec();
  c.check("欄の名は「これから」", /^これから/.test(s.head), s.head);
  c.check("待つ・いつかは畳んで「待つ1」「いつか1」", JSON.stringify(s.folds) === '["待つ1","いつか1"]' && !s.wait.length, JSON.stringify(s));
  c.check("これからの行に待つ・いつかは混ざらない", !s.next.includes("見積もりの返事") && !s.next.includes("ギターを習う")
    && s.next.includes("押し入れの整理"), JSON.stringify(s.next));
  await page.locator('#screen-todo .tl-shelf[data-shelf="wait"] .tl-shelf-head').click();
  await wait(500);
  s = await sec();
  c.check("押せば開き、待つものに「返事」", s.wait.includes("見積もりの返事") && s.waitFor.includes("返事"), JSON.stringify(s));
  const beads = await page.evaluate(() => [...document.querySelectorAll("#screen-todo .road-bead.is-someday")]
    .map((b) => b.getAttribute("aria-label")));
  c.check("道のくぼみは「これから」だけ", beads.length > 0 && beads.every((b) => /（これから）$/.test(b))
    && !beads.some((b) => /見積もりの返事|ギターを習う/.test(b)), JSON.stringify(beads));

  /* 見直す */
  const bar = await page.evaluate(() => {
    const b = document.querySelector("#screen-todo .tl-review");
    return b ? { text: b.textContent.replace(/\s+/g, ""), color: getComputedStyle(b).color } : null;
  });
  c.check("頭に「見直す 1」", !!bar && /^1見直す/.test(bar.text), JSON.stringify(bar));
  const rv = () => page.evaluate(() => {
    const p = document.querySelector(".note-pop.is-review.is-open");
    return p ? { text: p.textContent } : null;
  });
  await page.locator("#screen-todo .tl-review").click();
  await wait(700);
  let sh = await rv();
  c.check("頭の一行からふくらむ小窓（下から出る紙ではない）に事実（9月12日から · 期限 10月31日）",
    !!sh && /押し入れの整理/.test(sh.text) && /9月12日から · 期限 10月31日/.test(sh.text)
    && await page.evaluate(() => !document.querySelector(".sheet.is-open")), sh && sh.text);
  c.check("小窓は下の帯より上（紙の高さ）", await page.evaluate(() =>
    Number(getComputedStyle(document.querySelector(".note-pop.is-review")).zIndex) > 30));
  const labels = await page.evaluate(() => [...document.querySelectorAll(".note-pop.is-review .rv-day b, .note-pop.is-review .rv-go-t")]
    .map((b) => b.textContent.trim()));
  c.check("選択肢は行動で：今日・明日・明後日・別の日へ・後日計画する・小さく分ける・やめる",
    JSON.stringify(labels) === JSON.stringify(["今日", "明日", "明後日", "別の日へ", "後日計画する", "小さく分ける", "やめる"]), JSON.stringify(labels));
  c.check("状態名・抽象語を出さない（これから・待つへ・いつかへ）", !!sh && !/まだこれから|待つへ|いつかへ|これからへ/.test(sh.text), sh && sh.text);
  const notes = await page.evaluate(() => [...document.querySelectorAll(".note-pop.is-review .rv-sub, .note-pop.is-review .rv-go-n")]
    .map((b) => b.textContent.trim()));
  c.check("押したらどうなるかを添える（9:00から・7日（水）・8日（木）・暦から選ぶ・見直す日を選ぶ・やめるはアーカイブへ）",
    notes[0] === "9:00から" && notes[1] === "7日（水）" && notes[2] === "8日（木）" && notes[3] === "暦から選ぶ"
    && notes[4] === "見直す日を選ぶ" && /アーカイブへ/.test(notes[6]), JSON.stringify(notes));
  c.check("明後日の絵は明日の絵が二つ", await page.evaluate(() =>
    document.querySelectorAll('.note-pop.is-review [data-k="d2"] .rv-ic svg').length === 2));
  c.check("見直しの小窓に評価の言葉・!を出さない", !!sh && !/遅れ|期限切れ|先送り|放置|できなかった|!|！/.test(sh.text), sh && sh.text);
  /* 後日計画する：暦で次に見直す日を選ぶ。今日は字でも言う。今日より前（今日を含む）は選べない */
  await page.locator(".note-pop.is-review .rv-go", { hasText: "後日計画する" }).click();
  await wait(500);
  let t = await get("t-old");
  const cal = await page.evaluate(() => {
    const p = document.querySelector(".note-pop.is-cal.is-open");
    const td = p && p.querySelector(".pop-cal-day.is-today");
    return p ? { now: p.querySelector(".pop-cal-now").textContent.trim(), today: td && td.textContent.trim(), todayOff: td && td.disabled,
                 d5: p.querySelector('[data-day="2026-10-05"]').disabled, d7: p.querySelector('[data-day="2026-10-07"]').disabled } : null;
  });
  c.check("後日計画する：暦が開くだけ（まだ何も変わらない）", !!cal && t.review == null && !t.due, JSON.stringify([cal, t.review]));
  c.check("暦は今日を字で言う（頭に「今日は 10月6日（火）」・升に「今日」）",
    !!cal && cal.now === "今日は 10月6日（火）" && /今日/.test(cal.today), JSON.stringify(cal));
  c.check("次に見直す日は明日から（今日まで押せない）", !!cal && cal.d5 && cal.todayOff && !cal.d7, JSON.stringify(cal));
  await page.locator(".note-pop.is-cal .js-next").click();
  await wait(200);
  await page.locator('.note-pop.is-cal [data-day="2026-11-05"]').click();
  await wait(600);
  t = await get("t-old");
  c.check("11月5日：日は決めず、次の見直しを11月5日に（棚はそのまま）", t.review === "2026-11-05" && !t.due && !t.shelf, JSON.stringify(t));
  const toast = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("知らせに次に見直す日と「元に戻す」", /11月5日にまた見直します/.test(toast) && /元に戻す/.test(toast), toast);
  await page.locator(".toast-action", { hasText: "元に戻す" }).click();
  await wait(500);
  t = await get("t-old");
  c.check("元に戻すと見直す日も戻る（持っていなかった）", t.review == null, JSON.stringify(t.review));
  /* 明日：日だけ（時刻は道が空きに並べる） */
  r = await page.evaluate(() => {
    const S = KN.store;
    const u = S.planOn("t-old", "2026-10-07");
    const x = { ...S.getTodo("t-old") };
    u();
    return x;
  });
  c.check("明日：やる日だけ書き、時刻は持たない（道の「ごろ」に並ぶ）", r.due === "2026-10-07" && !r.time, JSON.stringify(r));
  /* 今日：空きの時刻へ */
  await page.keyboard.press("Escape");
  await wait(400);
  await page.locator("#screen-todo .tl-review").click();
  await wait(700);
  await page.locator(".note-pop.is-review .rv-day", { hasText: "今日" }).click();
  await wait(600);
  t = await get("t-old");
  c.check("今日：今日の空いた時刻（9:00）に置く", t.due === TODAY && t.time === "09:00", JSON.stringify([t.due, t.time]));
  c.check("見直すものが無くなれば頭の一行も消え、小窓も閉じる", await page.evaluate(() =>
    !document.querySelector("#screen-todo .tl-review") && !document.querySelector(".note-pop.is-review.is-open")));

  /* 詳細の紙の「⋯」から待つへ */
  const yid = "t-young";
  await page.evaluate((i) => KN.screens.todo.open(i), yid);
  await wait(600);
  await page.locator(".sheet.is-open .js-menu").last().click();
  await wait(300);
  const menu = await page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.textContent.trim()));
  c.check("詳細の紙の「⋯」に「待つへ」「いつかへ」", menu.includes("待つへ") && menu.includes("いつかへ") && !menu.includes("これからへ"), JSON.stringify(menu));
  await page.locator(".note-pop-item", { hasText: "待つへ" }).click();
  await wait(700);
  sh = await topSheet();
  c.check("何を待つかは札から（打つ欄なし）", !!sh && sh.title === "何を待つ" && await page.evaluate(() =>
    ![...document.querySelectorAll(".sheet.is-open")].pop().querySelector("input, textarea")), JSON.stringify(sh));
  await page.locator(".sheet.is-open .wait-for .chip", { hasText: "連絡" }).click();
  await wait(600);
  t = await get(yid);
  c.check("待つへ移り、何を待つかは「連絡」", t.shelf === "wait" && t.waitFor === "連絡" && t.review === "2026-10-13", JSON.stringify(t));

  /* 期限が過ぎた待つは、見回りで今日へ（待つから外れる） */
  r = await page.evaluate((d) => {
    const S = KN.store;
    const z = S.addTodo({ title: "期限の過ぎた待つ", deadline: KN.util.shiftDay(d, -1) });
    S.update((s) => { const x = s.todos.find((y) => y.id === z.id); x.shelf = "wait"; x.waitFor = "返事"; });
    S.rescheduleOverdue();
    return { ...S.getTodo(z.id) };
  }, TODAY);
  c.check("期限の過ぎた待つは今日へ運ばれ、待つから外れる", r.due === TODAY && r.shelf === null, JSON.stringify(r));

  /* 読み直しても残る */
  await wait(400);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await wait(300);
  t = await get(yid);
  c.check("読み直しても shelf・waitFor・review が残る", t.shelf === "wait" && t.waitFor === "連絡" && t.review === "2026-10-13", JSON.stringify(t));

  /* ---------------- 「これから」を押したら、日の無い用事をすぐ書ける ---------------- */
  await page.click('.tab[data-tab="todo"]');
  await wait(500);
  await page.click("#screen-todo .tl-someday-add");
  await wait(450);
  r = await page.evaluate(() => {
    const pop = document.querySelector(".note-pop.is-quick.is-open");
    return { pop: !!pop, sheet: !!document.querySelector(".sheet.is-open"),
             focused: !!(pop && pop.contains(document.activeElement)) };
  });
  c.check("「これから」を押すと角丸の小窓（下からの紙ではない）。キーボードは勝手に出さない",
    r.pop && !r.sheet && !r.focused, JSON.stringify(r));
  await page.click(".note-pop.is-quick .js-qa-title");
  await page.keyboard.type("棚の修理");
  await page.keyboard.press("Enter");
  await wait(500);
  r = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "棚の修理"));
  c.check("足したものは日を持たず「これから」に入る", r && !r.due && !r.shelf, JSON.stringify(r));
  /* トーストに「元に戻す」。押せば消え、もう一度足して先へ */
  r = await page.evaluate(() => [...document.querySelectorAll(".toast-action")].map((b) => b.textContent.trim()));
  c.check("足したトーストに「元に戻す」", r.includes("元に戻す"), JSON.stringify(r));
  await page.evaluate(() => [...document.querySelectorAll(".toast-action")].find((b) => b.textContent.trim() === "元に戻す").click());
  await wait(300);
  r = await page.evaluate(() => KN.store.get().todos.some((x) => x.title === "棚の修理"));
  c.check("「元に戻す」で足したものが消える", r === false);
  await page.evaluate(() => KN.store.addTodo({ title: "棚の修理" }));
  await wait(300);

  /* 欄の中のどこでも（下の余白）。行を押せば行の紙、動いた指（スクロール）では開かない */
  const openTitle = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh ? (sh.querySelector(".sheet-title") || { textContent: "" }).textContent.trim() : null;
  });
  const closeAll = async () => { for (let i = 0; i < 3 && await openTitle(); i++) { await page.keyboard.press("Escape"); await wait(400); } };
  await wait(300);
  await page.$eval("#screen-todo .tl-someday-sec", (s) => s.scrollIntoView({ block: "center" }));
  await wait(300);
  const box = await page.$eval("#screen-todo .tl-someday-sec", (s) => { const b = s.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.bottom - 8 }; });
  await page.mouse.click(box.x, box.y);
  await wait(450);
  c.check("欄の下の余白を押しても、足す小窓が開く", await page.$(".note-pop.is-quick.is-open") !== null);
  await page.click(".note-pop.is-quick .js-qa-title");
  await page.keyboard.type("窓ふき");
  await page.click(".note-pop.is-quick .js-qa-more");
  await wait(500);
  r = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh ? { v: sh.querySelector(".js-title").value, save: !sh.querySelector(".js-save").disabled,
                  card: sh.classList.contains("is-fab-card") } : null;
  });
  c.check("「詳しく」で、打った題ごと詳細の紙へ（紙もカード）", r && r.v === "窓ふき" && r.save && r.card, JSON.stringify(r));
  await closeAll();
  await page.keyboard.press("Escape"); await wait(300);

  /* 何も書かずにやめたら、「これから」の＋へ帰る（小窓も、詳しくの紙も） */
  const plusAt = () => page.$eval("#screen-todo .tl-someday-plus", (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.click("#screen-todo .tl-someday-add");
  await wait(450);
  await page.mouse.click(5, 5);   // 外を押す
  r = await page.evaluate(() => {
    const p = document.querySelector(".note-pop.is-quick");
    if (!p) return null;
    const [ox, oy] = p.style.transformOrigin.split(" ").map(parseFloat);
    return { x: parseFloat(p.style.left) + ox, y: parseFloat(p.style.top) + oy, open: p.classList.contains("is-open") };
  });
  let pa = await plusAt();
  c.check("小窓を外で閉じると、＋へ縮んで帰る", r && !r.open && Math.abs(r.x - pa.x) < 2 && Math.abs(r.y - pa.y) < 2, JSON.stringify({ r, pa }));
  await wait(500);
  await page.click("#screen-todo .tl-someday-add");
  await wait(450);
  await page.click(".note-pop.is-quick .js-qa-more");
  await wait(600);
  await page.click(".sheet.is-open .js-close");
  await wait(60);
  r = await page.evaluate(() => {
    const sh = document.querySelector(".sheet.is-homing");
    if (!sh) return null;
    const cs = getComputedStyle(sh);
    return { sx: parseFloat(cs.getPropertyValue("--sx")), sy: parseFloat(cs.getPropertyValue("--sy")) };
  });
  c.check("詳しくの紙を何も書かずに閉じると、＋へ帰る", !!r, JSON.stringify(r));
  await wait(700);
  await page.click("#screen-todo .tl-someday-sec > .tl-someday .tl-row .item-name");
  await wait(450);
  c.check("行を押せば、その行の紙（足す紙ではない）", (await openTitle()) === "やることを直す", await openTitle());
  await closeAll();
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x, box.y - 40, { steps: 5 });
  await page.mouse.up();
  await wait(450);
  c.check("指が動いた（スクロール）ときは開かない", (await openTitle()) === null && !(await page.$(".note-pop.is-quick.is-open")), await openTitle());

  /* K3 の設定：tasks の「見直す日」の下にスイッチ。オンで、いま入れたら付く日を一行。 */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await wait(500);
  const swRow = page.locator(".set-layer:last-child .set-row.is-sw", { hasText: "節気の初日に揃える" });
  const layerText = () => page.locator(".set-layer:last-child").innerText();
  c.check("K3：設定に「節気の初日に揃える」（オフ・日付の行なし）", (await swRow.count()) === 1
    && (await swRow.getAttribute("aria-checked")) === "false" && !/これから \d/.test(await layerText()));
  await swRow.click();
  await wait(400);
  const t2 = await layerText();
  c.check("K3：押すとオン・保存・いま入れたら付く日（これから 10/23・待つ 10/23・いつか 11/7）",
    (await page.evaluate(() => KN.store.get().settings.reviewSekki)) === true
    && (await swRow.getAttribute("aria-checked")) === "true" && t2.includes("これから 10/23・待つ 10/23・いつか 11/7"), t2.slice(0, 400));
  await swRow.click();
  await wait(400);
  c.check("K3：もう一度押すとオフに戻る", (await page.evaluate(() => KN.store.get().settings.reviewSekki)) === false
    && !/これから \d/.test(await layerText()));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
