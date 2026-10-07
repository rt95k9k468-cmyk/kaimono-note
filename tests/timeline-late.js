/* 時間割の丸薬が伸びる（2026年10月6日、docs/todo-timeline.md の「伸びる丸薬」）。
   時計を 7:33 に止める。
   - 6:00〜7:00 の、まだの朝のルーティンは丸薬が「いま」まで下へ伸びる（色は変えない。橙は道だけ）。
     上端は動かず、下の行（7:20 の用事）はずらさない
   - 済ませると色は戻り、伸びも消える
   - 手順をひらくと、丸薬が手順の段の下まで伸びる（線ではなく）。たたむと戻る
   - 運ぶときの目盛りは伸ばす前の丸薬で読む（いまの札が丸薬の中に正しく出る） */
const { open, checker } = require("./lib");

const DAY = "2026-09-30";

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
  await page.waitForTimeout(800);

  const read = () => page.evaluate((ids) => {
    const scr = document.querySelector("#screen-todo");
    const row = (id) => scr.querySelector(`.tl-row[data-todo-id="${id}"]`);
    const box = (id) => {
      const li = row(id), nd = li.querySelector(".tl-node"), r = nd.getBoundingClientRect();
      const rail = li.querySelector(".tl-rail").getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: r.height, railTop: rail.top,
        late: li.classList.contains("is-late"), grown: li.classList.contains("is-grown"),
        bg: getComputedStyle(nd).backgroundImage };
    };
    const now = scr.querySelector(".tl-now");
    const nr = now ? now.getBoundingClientRect() : null;
    const subs = row(ids.prep).querySelector(".tl-sub-list");
    const sr = subs.getBoundingClientRect();
    return { routine: box(ids.routine), mail: box(ids.mail), prep: box(ids.prep),
      nowMid: nr ? nr.top + nr.height / 2 : null, subsBottom: sr.bottom, subsHidden: subs.hidden,
      text: scr.querySelector(".tl").textContent };
  }, ids);

  let r = await read();
  c.check("過ぎてもまだの区間は is-late、色は橙にしない", r.routine.late && !/240, 163, 94|f0a35e/i.test(r.routine.bg),
    JSON.stringify([r.routine.late, r.routine.bg]));
  /* 「いま」の札は 7:20 の時刻から逃げるので、札ではなく 7:20〜7:50 の丸薬の中の 7:33 の高さと比べる。 */
  const want = r.mail.top + r.mail.h * (13 / 30);
  c.check("過ぎてもまだの丸薬は「いま」まで伸びる", Math.abs(r.routine.bottom - want) < 2,
    JSON.stringify([r.routine.bottom, want, r.nowMid]));
  c.check("伸びても上端は行の中（50px の丸から下へだけ）",
    Math.abs(r.routine.top - (r.routine.railTop + 5)) < 2, JSON.stringify([r.routine.top, r.routine.railTop]));
  c.check("次の用事（7:20〜7:50）は伸びた丸薬の下に重なり、ずれない・伸びない",
    !r.mail.late && r.routine.bottom > r.mail.top && Math.abs(r.mail.top - (r.mail.railTop + 5)) < 2,
    JSON.stringify([r.mail, r.routine.bottom]));
  c.check("まだ終わっていない用事は伸びない", !r.prep.grown && !r.mail.grown, JSON.stringify([r.prep, r.mail]));

  /* 手順をひらく。 */
  await page.click(`#screen-todo .tl-row[data-todo-id="${ids.prep}"] .tl-subs-chip`);
  await page.waitForTimeout(900);
  r = await read();
  c.check("手順をひらくと、丸薬が手順の段の下まで伸びる",
    !r.subsHidden && r.prep.grown && Math.abs(r.prep.bottom - r.subsBottom) < 2,
    JSON.stringify([r.prep, r.subsBottom]));
  c.check("ひらいても丸薬の上端は動かない", Math.abs(r.prep.top - (r.prep.railTop + 5)) < 2,
    JSON.stringify(r.prep));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.click(`#screen-todo .tl-row[data-todo-id="${ids.prep}"] .tl-subs-chip`);
  await page.waitForTimeout(900);
  r = await read();
  c.check("たたむと戻る", !r.prep.grown && Math.abs(r.prep.h - 62) < 2, JSON.stringify(r.prep));

  /* 済ませると、伸びが消える。 */
  await page.click(`#screen-todo .tl-row[data-todo-id="${ids.routine}"] button.check`);
  await page.waitForTimeout(1500);
  r = await read();
  c.check("済ませると色が戻り、伸びも消える", !r.routine.late && !r.routine.grown && r.routine.h < 140,
    JSON.stringify(r.routine));

  c.check("評価の言葉を出さない", !/遅れ|予定通り|達成|未達|超過/.test(r.text), r.text);
  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
