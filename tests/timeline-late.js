/* 過ぎてもまだの棒が「いま」まで伸びる（2026年10月6日、物差しに合わせて書き直し 2026年10月20日。
   docs/timeline-scale-design.md の段2の決めごと）。時計を 7:33 に止める。
   - 6:00〜7:00 の、まだの朝のルーティンは**棒だけ**が y(いま) まで下へ伸びる（札は 72px のまま。
     色は変えない。橙は道だけ）。棒の上端は札の頭、下の札（7:20 の用事）は y(7:20) のまま動かない
   - 済ませると伸びが消える
   - 手順をひらくと札ごと伸び（継ぎ目）、棒は札の下端まで。上端は動かない。たたむと戻る */
const { open, checker } = require("./lib");

const DAY = "2026-09-30";
const PX_MIN = 1.2;

(async () => {
  const c = checker("timeline-late");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 30, 7, 33)); },
  });

  const ids = await page.evaluate((day) => {
    const s = KN.store;
    return {
      routine: s.addTodo({ title: "朝のルーティン", due: day, time: "06:00", minutes: 60 }).id,
      mail: s.addTodo({ title: "メール", due: day, time: "07:20", minutes: 30 }).id,
      prep: s.addTodo({ title: "したく", due: day, time: "09:00", minutes: 45,
        subs: [{ title: "着替え" }, { title: "かばん" }, { title: "鍵" }] }).id,
    };
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });

  /* 位置は一覧の頭から（ひらく押しで画面が送られても揺れない）。 */
  const read = () => page.evaluate((ids) => {
    const scr = document.querySelector("#screen-todo");
    const o = scr.querySelector(".tl-list").getBoundingClientRect().top;
    const row = (id) => scr.querySelector(`.tl-row[data-todo-id="${id}"]`);
    const box = (id) => {
      const li = row(id), nd = li.querySelector(".tl-node"), r = nd.getBoundingClientRect();
      const card = li.getBoundingClientRect();
      return { top: r.top - o, bottom: r.bottom - o, h: r.height, cardTop: card.top - o, cardH: card.height,
        grow: parseFloat(li.style.getPropertyValue("--grow")), dataH: Number(li.dataset.h),
        late: li.classList.contains("is-late"), grown: li.classList.contains("is-grown"),
        bg: getComputedStyle(nd).backgroundImage };
    };
    const now = scr.querySelector(".tl-now");
    const nr = now ? now.getBoundingClientRect() : null;
    const subs = row(ids.prep).querySelector(".tl-sub-list");
    const sr = subs.getBoundingClientRect();
    return { routine: box(ids.routine), mail: box(ids.mail), prep: box(ids.prep),
      now: nr ? nr.top - o : null, subsBottom: sr.bottom - o, subsHidden: subs.hidden,
      text: scr.querySelector(".tl").textContent };
  }, ids);

  let r = await read();
  c.check("過ぎてもまだの区間は is-late、色は橙にしない", r.routine.late && !/240, 163, 94|f0a35e/i.test(r.routine.bg),
    JSON.stringify([r.routine.late, r.routine.bg]));
  /* y(7:33)：6:00 の札の頭から 93分ぶん。「いま」の札は 7:20 の字から逃げるので、式で比べる。 */
  const want = r.routine.cardTop + 93 * PX_MIN;
  c.check("過ぎてもまだの棒は y(いま) まで伸びる", r.routine.grown && Math.abs(r.routine.bottom - want) < 2,
    JSON.stringify([r.routine.bottom, want, r.now]));
  c.check("伸ばすのは棒だけ：札は 60分ぶん（72px）のまま、棒の上端は札の頭",
    Math.abs(r.routine.cardH - 60 * PX_MIN) < 1 && Math.abs(r.routine.top - r.routine.cardTop) < 2,
    JSON.stringify(r.routine));
  c.check("次の札（7:20〜7:50）は y(7:20) のまま、伸びた棒の下に重なる・伸びない",
    !r.mail.late && r.routine.bottom > r.mail.cardTop
      && Math.abs(r.mail.cardTop - (r.routine.cardTop + 80 * PX_MIN)) < 1 && Math.abs(r.mail.cardH - 30 * PX_MIN) < 1,
    JSON.stringify([r.mail, r.routine.bottom]));
  c.check("まだ終わっていない用事は伸びない", !r.prep.grown && !r.mail.grown, JSON.stringify([r.prep, r.mail]));

  /* 手順をひらく（段3：札の下端に継ぎ目を入れて押し下げる）。 */
  const shut = r.prep;
  await page.click(`#screen-todo .tl-row[data-todo-id="${ids.prep}"] .tl-subs-chip`);
  await page.waitForFunction((id) => {
    const li = document.querySelector(`#screen-todo .tl-row[data-todo-id="${id}"]`);
    const l = li.parentElement;
    return !l.classList.contains("is-push-open") && !l.classList.contains("is-push-shut")
      && li.querySelector(".tl-node").getBoundingClientRect().bottom >= li.querySelector(".tl-sub-list").getBoundingClientRect().bottom - 1;
  }, ids.prep, { timeout: 5000 });
  r = await read();
  c.check("手順をひらくと、札ごと伸びて棒は手順の段の下まで",
    !r.subsHidden && r.prep.cardH > shut.cardH + 20 && r.prep.bottom >= r.subsBottom - 1
      && Math.abs(r.prep.bottom - (r.prep.cardTop + r.prep.cardH)) < 2,
    JSON.stringify([r.prep, r.subsBottom]));
  c.check("ひらいても札と棒の上端は動かない",
    Math.abs(r.prep.cardTop - shut.cardTop) < 1 && Math.abs(r.prep.top - shut.top) < 1, JSON.stringify([shut, r.prep]));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.click(`#screen-todo .tl-row[data-todo-id="${ids.prep}"] .tl-subs-chip`);
  await page.waitForFunction((id) => {
    const li = document.querySelector(`#screen-todo .tl-row[data-todo-id="${id}"]`);
    const l = li.parentElement;
    return !l.classList.contains("is-push-open") && !l.classList.contains("is-push-shut")
      && Math.abs(li.getBoundingClientRect().height - 45 * 1.2) < 1;
  }, ids.prep, { timeout: 5000 });
  r = await read();
  c.check("たたむと戻る（45分＝54px）", !r.prep.grown && Math.abs(r.prep.h - 45 * PX_MIN) < 2, JSON.stringify(r.prep));

  /* 済ませると、伸びが消える。 */
  await page.click(`#screen-todo .tl-row[data-todo-id="${ids.routine}"] button.check`);
  await page.waitForFunction((id) => {
    const li = document.querySelector(`#screen-todo .tl-row[data-todo-id="${id}"]`);
    return li && li.classList.contains("is-done");
  }, ids.routine, { timeout: 5000 });
  r = await read();
  /* 済んだ札は既定で畳まれる（軸はそのまま）ので、伸びは値で見る。 */
  c.check("済ませると伸びが消える（札は 72px のまま）",
    !r.routine.late && !r.routine.grown && r.routine.grow === 0 && Math.abs(r.routine.dataH - 60 * PX_MIN) < 1,
    JSON.stringify(r.routine));

  c.check("評価の言葉を出さない", !/遅れ|予定通り|達成|未達|超過/.test(r.text), r.text);
  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
