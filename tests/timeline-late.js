/* 過ぎてもまだは、背骨に一本だけ「いま」まで（2026年10月6日、物差しに合わせて書き直し・一本に 2026年10月20日。
   docs/todo-timeline.md の「過ぎてもまだは背骨に一本」）。時計を 7:33 に止める。
   - 5:00〜5:20 の水やりと 6:00〜7:00 の朝のルーティンがまだ。棒は札の高さのまま、線（.tl-late-line）は
     いちばん早く終わるはずだった水やりの下端から y(いま) まで一本（色は変えない。橙は道だけ）。押すと一覧の紙
   - 済ませると、その一件ぶん線が縮む／全部済ませると消える
   - 時刻は1時間ごとに振る。用事の時刻・「いま」と同じ高さの字は出さない
   - 手順は小窓に出す（札は伸びない・2026年10月21日）
   - 始まりより前に済ませた用事（9:00 のしたく）は、済ませた時刻（7:33）の札になる（2026年10月21日） */
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
      water: s.addTodo({ title: "水やり", due: day, time: "05:00", minutes: 20 }).id,
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
        dataH: Number(li.dataset.h), late: li.classList.contains("is-late"),
        bg: getComputedStyle(nd).backgroundImage };
    };
    const now = scr.querySelector(".tl-now");
    const nr = now ? now.getBoundingClientRect() : null;
    const subs = row(ids.prep).querySelector(".tl-sub-list");
    const sr = subs ? subs.getBoundingClientRect() : { bottom: 0 };   // 小窓が開いているあいだは札に居ない
    const ln = scr.querySelector(".tl-list > .tl-late-line");
    const lr = ln ? ln.getBoundingClientRect() : null;
    const hours = [...scr.querySelectorAll(".tl-tick")].filter((t) => getComputedStyle(t.querySelector(".tl-hour")).visibility !== "hidden")
      .map((t) => t.textContent.trim());
    return { line: lr ? { top: lr.top - o, bottom: lr.bottom - o, w: lr.width } : null, hours,
      water: box(ids.water), routine: box(ids.routine), mail: box(ids.mail), prep: box(ids.prep),
      now: nr ? nr.top - o : null, subsBottom: sr.bottom - o, subsHidden: subs ? subs.hidden : true,
      text: scr.querySelector(".tl").textContent };
  }, ids);

  let r = await read();
  c.check("過ぎてもまだの区間は is-late、色は橙にしない", r.routine.late && !/240, 163, 94|f0a35e/i.test(r.routine.bg),
    JSON.stringify([r.routine.late, r.routine.bg]));
  /* y(7:33)：6:00 の札の頭から 93分ぶん。「いま」の札は 7:20 の字から逃げるので、式で比べる。 */
  const want = r.routine.cardTop + 93 * PX_MIN;
  c.check("線は一本、水やりの棒の下端から y(いま) まで",
    (r.line && Math.abs(r.line.top - r.water.bottom) < 2 && Math.abs(r.line.bottom - want) < 2),
    JSON.stringify([r.line, r.water.bottom, want]));
  c.check("棒は伸ばさない：札の高さのまま（60分＝72px・短い札は最低の高さ）",
    Math.abs(r.routine.h - 60 * PX_MIN) < 2 && Math.abs(r.routine.cardH - 60 * PX_MIN) < 1 && Math.abs(r.water.h - r.water.dataH) < 2,
    JSON.stringify([r.routine, r.water]));
  c.check("次の札（7:20〜7:50）は y(7:20) のまま",
    !r.mail.late && Math.abs(r.mail.cardTop - (r.routine.cardTop + 80 * PX_MIN)) < 1 && Math.abs(r.mail.cardH - 30 * PX_MIN) < 1,
    JSON.stringify(r.mail));
  c.check("時刻は1時間ごと。用事の時刻（5:00・6:00・9:00）と「いま」のそばは出さない",
    r.hours.includes("8:00") && r.hours.includes("7:00") && !r.hours.includes("6:00") && !r.hours.includes("9:00") && !r.hours.includes("5:00"),
    JSON.stringify(r.hours));
  await page.click("#screen-todo .tl-late-line");
  await page.waitForSelector(".tl-more-row", { timeout: 3000 });
  const rows = await page.$$eval(".tl-more-row", (bs) => bs.map((b) => b.textContent));
  c.check("線を押すと、まだの二件の一覧", rows.length === 2 && /水やり/.test(rows[0]) && /朝のルーティン/.test(rows[1]), JSON.stringify(rows));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".tl-more-row"), null, { timeout: 3000 });
  c.check("まだ終わっていない用事は is-late にならない", !r.prep.late && !r.mail.late, JSON.stringify([r.prep, r.mail]));

  /* 手順は小窓に出す（2026年10月21日）。札は伸びず、上端も高さも動かない。閉じると畳んだまま。 */
  const shut = r.prep;
  await page.click(`#screen-todo .tl-row[data-todo-id="${ids.prep}"] .tl-subs-chip`);
  await page.waitForSelector(".note-pop.is-subs.is-open .tl-sub", { timeout: 5000 });
  r = await read();
  c.check("手順をひらいても札は伸びない（小窓に出る）",
    Math.abs(r.prep.h - shut.h) < 1 && Math.abs(r.prep.cardTop - shut.cardTop) < 1, JSON.stringify([shut, r.prep]));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  /* 他のタブへ移れば、手順の小窓は閉じる（帯は覆いより手前なので、覆いでは閉じない）。 */
  await page.evaluate(() => KN.app.showScreen("notes"));
  await page.waitForFunction(() => !document.querySelector(".note-pop.is-subs"), null, { timeout: 5000 });
  await page.evaluate(() => KN.app.showScreen("todo"));
  r = await read();
  c.check("閉じても45分＝54px のまま", Math.abs(r.prep.h - 45 * PX_MIN) < 2, JSON.stringify(r.prep));

  /* 済ませると、その一件ぶん線が縮み、全部済ませると消える。 */
  const done = async (id) => {
    await page.click(`#screen-todo .tl-row[data-todo-id="${id}"] button.check`);
    await page.waitForFunction((id) => {
      const li = document.querySelector(`#screen-todo .tl-row[data-todo-id="${id}"]`);
      return li && li.classList.contains("is-done");
    }, id, { timeout: 5000 });
    return read();
  };
  await done(ids.water);
  /* 組み直したあと、線は次の「いま」の描き直しで置き直される。 */
  await page.waitForFunction((id) => {
    const scr = document.querySelector("#screen-todo");
    const ln = scr.querySelector(".tl-list > .tl-late-line");
    const nd = scr.querySelector(`.tl-row[data-todo-id="${id}"] .tl-node`);
    return ln && nd && Math.abs(ln.getBoundingClientRect().top - nd.getBoundingClientRect().bottom) < 2;
  }, ids.routine, { timeout: 3000 }).catch(() => {});
  r = await read();
  c.check("水やりを済ませると、線はルーティンの下端から",
    !r.water.late && r.line && Math.abs(r.line.top - r.routine.bottom) < 2, JSON.stringify([r.line, r.routine]));
  r = await done(ids.routine);
  c.check("全部済ませると線が消える（札は 72px のまま）",
    !r.routine.late && !r.line && Math.abs(r.routine.dataH - 60 * PX_MIN) < 1, JSON.stringify([r.line, r.routine]));

  /* 9:00 のしたくを 7:33 に済ませる → 札は済ませた時刻へ、長さは付けない。記録は書き換えない。 */
  await done(ids.prep);
  const early = await page.evaluate((id) => {
    const li = document.querySelector(`#screen-todo .tl-row[data-todo-id="${id}"]`);
    const t = KN.store.get().todos.find((x) => x.id === id);
    return { at: Number(li.dataset.at), until: Number(li.dataset.until), time: li.querySelector(".tl-time").textContent.trim(),
      rec: t.time + "/" + t.minutes };
  }, ids.prep);
  c.check("始まりより前に済ませたら、札は済ませた時刻に（長さは付けない・記録はそのまま）",
    early.at === 7 * 60 + 33 && early.until === early.at + 1 && early.rec === "09:00/45", JSON.stringify(early));

  c.check("評価の言葉を出さない", !/遅れ|予定通り|達成|未達|超過/.test(r.text), r.text);
  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
