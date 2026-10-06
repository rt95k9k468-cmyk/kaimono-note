/* 置き直しの回数と選択肢（3.0 の B2、docs/roadmap-3.0.md・docs/todo-timeline.md の「置き直しの回数」。2026年10月6日）。
   - 控え（slips）を書くのは：日の変わり目に運んだ（carry）・段3の紙で明日／今週・段5の紙で明日／時刻を外す（passed）・
     自分で due を後ろへ（hand）。くり返しには書かない。前へ動かしても書かない。20件まで
   - 元に戻すと控えも戻る
   - 3回目から、段3・段5 の紙のその行に「3回目」と、選択肢（今日は15分だけ・時間を変える・待つへ・いつかへ）
   - 2回目までは何も足さない
   - 「先送り」「失敗」「原因」・!・赤を出さない

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/slips.js */
const { open, checker } = require("./lib");

const TODAY = "2026-10-06";
const YEST = "2026-10-05";

(async () => {
  const c = checker("slips");
  const { browser, page, errors } = await open({
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
  c.check("運んだら控え（前の日・前の時刻・carry）",
    r.a1.length === 1 && r.a1[0].on === TODAY && r.a1[0].from === YEST && r.a1[0].time === "13:00" && r.a1[0].how === "carry",
    JSON.stringify(r.a1));
  c.check("段3の紙で明日を選ぶと、もう一つ", r.a2.length === 2 && r.a2[1].from === TODAY && r.a2[1].how === "carry", JSON.stringify(r.a2));
  c.check("元に戻すと控えも戻る", r.a3.length === 1, JSON.stringify(r.a3));
  c.check("段5の紙で時刻を外すと passed（前の時刻）",
    r.b1.length === 1 && r.b1[0].how === "passed" && r.b1[0].time === "09:00", JSON.stringify(r.b1));
  c.check("自分で後ろへ動かすと hand", r.h1.length === 1 && r.h1[0].how === "hand", JSON.stringify(r.h1));
  c.check("前へ動かしても書かない", r.h2 === 1, String(r.h2));
  c.check("控えは20件まで", r.h3 === 20, String(r.h3));
  c.check("くり返しには書かない", r.rep.length === 0 && r.repDue === TODAY, JSON.stringify(r));

  /* ---------------- 段3の紙：3回目から ---------------- */
  await page.evaluate(([today, yest]) => {
    const S = KN.store;
    const slip = (d) => ({ on: d, from: d, time: null, how: "carry" });
    const x = S.addTodo({ title: "確定申告の準備", due: yest });
    S.update((s) => { s.todos.find((t) => t.id === x.id).slips = [slip("2026-09-20"), slip("2026-09-27")]; });
    S.addTodo({ title: "ふつうの用事", due: yest });
    S.rescheduleOverdue();
  }, [TODAY, YEST]);
  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  await page.locator("#screen-todo .tl-carry").click();
  await wait(600);
  const sheetRows = () => page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    return {
      text: s.textContent,
      rows: [...s.querySelectorAll(".carry-row")].map((row) => ({
        title: row.querySelector(".carry-title").textContent.trim(),
        n: (row.querySelector(".carry-n") || {}).textContent || null,
        acts: [...row.querySelectorAll("button")].map((b) => b.textContent.trim()),
        nColor: row.querySelector(".carry-n") ? getComputedStyle(row.querySelector(".carry-n")).color : null,
      })),
    };
  });
  let sr = await sheetRows();
  const big = sr.rows.find((x) => x.title === "確定申告の準備");
  const plain = sr.rows.find((x) => x.title === "ふつうの用事");
  c.check("3回目の行に「3回目」", !!big && big.n === "3回目", JSON.stringify(big));
  c.check("選択肢を足す（今日は15分だけ・時間を変える・待つへ・いつかへ）",
    !!big && ["今日は15分だけ", "時間を変える", "待つへ", "いつかへ"].every((w) => big.acts.includes(w)), JSON.stringify(big && big.acts));
  c.check("2回目までは何も足さない", !!plain && !plain.n && !plain.acts.includes("今日は15分だけ"), JSON.stringify(plain));
  c.check("責める言葉・!を出さない", !/先送り|失敗|原因|サボ|!|！/.test(sr.text), sr.text);
  c.check("回数の字は赤くしない", !!big && !/rgb\(2[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)/.test(big.nColor), big && big.nColor);
  await page.locator(".sheet.is-open .carry-row", { hasText: "確定申告の準備" }).locator(".js-slip", { hasText: "今日は15分だけ" }).click();
  await wait(500);
  let t = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "確定申告の準備"));
  c.check("今日は15分だけ：今日・15分・運んだ印は外れる", t.due === TODAY && t.minutes === 15 && !t.carried, JSON.stringify(t));
  const toast = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("知らせに「元に戻す」", /元に戻す/.test(toast), toast);
  await page.locator(".toast-action", { hasText: "元に戻す" }).click();
  await wait(400);
  t = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "確定申告の準備"));
  c.check("元に戻すと長さも印も戻る", t.minutes == null && !!t.carried, JSON.stringify(t));
  await page.keyboard.press("Escape");
  await wait(500);

  /* ---------------- 段5の紙：時間を変える ---------------- */
  await page.evaluate((today) => {
    const S = KN.store;
    const y = S.addTodo({ title: "見積もりを書く", due: today, time: "09:00", minutes: 60 });
    S.update((s) => { s.todos.find((t) => t.id === y.id).slips = [
      { on: "2026-10-01", from: "2026-10-01", time: "09:00", how: "passed" },
      { on: "2026-10-03", from: "2026-10-03", time: "09:00", how: "passed" }]; });
  }, TODAY);
  await page.click('.tab[data-tab="archive"]');
  await wait(300);
  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  await page.locator("#screen-todo .tl-passed").click();
  await wait(600);
  sr = await sheetRows();
  const pr = sr.rows.find((x) => x.title === "見積もりを書く");
  c.check("段5の紙：控え2件なら、いま選ぶのが3回目", !!pr && pr.n === "3回目", JSON.stringify(pr));
  await page.locator(".sheet.is-open .carry-row", { hasText: "見積もりを書く" }).locator(".js-slip", { hasText: "時間を変える" }).click();
  await wait(600);
  const ask = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open")].pop().querySelector(".sheet-title").textContent.trim());
  c.check("時間を変える：時刻と長さの紙", ask === "時間を変える", ask);
  await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    const [h, m] = s.querySelectorAll(".note-wheel");
    h.scrollTop = 15 * 40; m.scrollTop = 0;
    [...s.querySelectorAll(".tw-mins .chip")].find((x) => x.textContent.trim() === "30分").click();
  });
  await wait(250);
  await page.locator(".sheet.is-open .js-ok").last().click();
  await wait(600);
  t = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "見積もりを書く"));
  c.check("15:00・30分に置き直る（控えは増やさない）", t.time === "15:00" && t.minutes === 30 && t.slips.length === 2, JSON.stringify(t));

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
  if (rv) {
    await page.locator("#screen-todo .tl-review").click();
    await wait(600);
  }
  const head = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    const row = s && [...s.querySelectorAll(".review-row")].find((r) => /D1 の材料/.test(r.textContent));
    return row ? row.querySelector(".carry-was").textContent : null;
  });
  c.check("見直しの紙の頭：最初に置いた日・回数・前に置いていた時刻",
    head === "8月1日から · 4回置き直し · 前は 21:00", String(head));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
