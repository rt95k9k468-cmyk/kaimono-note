/* 3.0 の手触り（F1、docs/roadmap-3.0.md・docs/iphone-check.md の「3.0」。2026年10月6日）。
   iPhone の幅（390×844 と 375×667）で、利用者の一日に活動を5件足した日を描き、撮る（SHOTS=<置き場>）。
   - 道：札どうし・札と「いま」の時刻が重ならない。活動は5件とも縁取り（塗らない）で、用事より控えめ
   - 活動を済ませるのは一押し（時間割の丸）
   - 3.0 の紙に打ちこむ欄は「困っていること」と「AI の答え」だけ（ほかは札・車輪・チェック）
   評価の言葉と絵文字を出さない。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/feel-3.js */
const { open, checker } = require("./lib");

const VIEWS = [{ width: 390, height: 844 }, { width: 375, height: 667 }];

(async () => {
  const c = checker("feel-3");
  for (const vp of VIEWS) {
    const tag = `${vp.width}×${vp.height}`;
    const { browser, page, errors } = await open({
      viewport: vp,
      before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 13, 10)); },
    });
    const wait = (ms) => page.waitForTimeout(ms);
    await page.evaluate(() => {
      const S = KN.store, A = KN.activity, d = KN.util.todayKey();
      const done = (t) => S.toggleTodo(t.id);
      done(S.addTodo({ title: "朝のルーティン", due: d, time: "07:00", minutes: 45 }));
      done(S.addTodo({ title: "病院", due: d, time: "10:00", minutes: 60 }));
      S.addTodo({ title: "夕食", due: d, time: "18:30", minutes: 60 });
      done(A.plant({ type: "reading", title: "坊っちゃん", day: d, at: "08:00", minutes: 30 }));
      done(A.plant({ type: "study", title: "英単語", day: d, at: "11:30", minutes: 25 }));
      A.plant({ type: "reading", title: "こころ", day: d, at: "15:00", minutes: 45 });
      A.plant({ type: "study", title: "簿記", day: d, at: "16:30", minutes: 30 });
      A.plant({ type: "reading", title: "論文を読む", day: d, at: "20:30", minutes: 45 });
      S.addTodo({ title: "メール" , due: d });
    });
    await page.click('.tab[data-tab="todo"]');
    await wait(900);
    await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
    await wait(300);
    const r = await page.evaluate(() => {
      const road = document.querySelector("#screen-todo .day-road");
      const boxes = [...road.querySelectorAll(".road-marks .road-label, .road-marks .road-now")]
        .filter((x) => x.offsetParent).map((x) => { const b = x.getBoundingClientRect(); return { t: x.textContent.trim(), l: b.left, r: b.right, top: b.top, bot: b.bottom }; });
      const hits = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.l < b.r - 1 && b.l < a.r - 1 && a.top < b.bot - 1 && b.top < a.bot - 1) hits.push(`${a.t} × ${b.t}`);
      }
      const acts = [...road.querySelectorAll(".road-stop.is-act")];
      return { n: boxes.length, hits, acts: acts.length, filled: acts.filter((g) => g.querySelector(".road-stop-went").getAttribute("d")).length,
               text: road.textContent };
    });
    c.check(`${tag}：道の札どうし・いまの時刻と重ならない`, r.hits.length === 0 && r.n > 3, JSON.stringify(r.hits));
    c.check(`${tag}：活動は5件とも縁取りで塗らない`, r.acts === 5 && r.filled === 0, JSON.stringify([r.acts, r.filled]));
    c.check(`${tag}：評価の言葉・絵文字なし`, !/遅れ|達成率|予定通り|%|％/.test(r.text) && !/\p{Extended_Pictographic}/u.test(r.text), r.text);
    /* J2：和文と数字のあいだは全体で空け、幅の決まった道の札だけ詰める */
    const sp = await page.evaluate(() => CSS.supports("text-autospace", "normal") &&
      [getComputedStyle(document.body).textAutospace, getComputedStyle(document.querySelector("#screen-todo .road-label")).textAutospace]);
    c.check(`${tag}：和文と数字のあいだ（全体は空け、道の札は詰める）`, !sp || (sp[0] === "normal" && sp[1] === "no-autospace"), JSON.stringify(sp));
    if (process.env.SHOTS) await page.locator("#screen-todo .day-road").first().screenshot({ path: `${process.env.SHOTS}/feel3-road-${vp.width}.png` });

    /* 活動を済ませるのは一押し */
    const one = await page.evaluate(() => KN.store.get().todos.find((t) => t.title === "読書『こころ』").id);
    await page.locator(`.tl-row[data-todo-id="${one}"] button.check:visible`).first().click();
    await wait(1200);
    const got = await page.evaluate((i) => !!KN.store.actEntry(KN.store.getTodo(i)), one);
    c.check(`${tag}：活動を済ませるのは一押し（積み上げが生まれる）`, got);

    /* 3.0 の紙の打ちこむ欄 */
    const fields = await page.evaluate(async () => {
      const S = KN.store, out = {};
      const count = () => { const s = [...document.querySelectorAll(".sheet.is-open")].pop();
        return s ? [...s.querySelectorAll("input:not([type=checkbox]), textarea")].filter((x) => x.offsetParent).length : -1; };
      const close = async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); await new Promise((r) => setTimeout(r, 450)); };
      KN.activity.askSpan({ title: "道に置く", ok: "道に置く", onPick: () => {} });
      await new Promise((r) => setTimeout(r, 500)); out.span = count(); await close();
      const t = S.addTodo({ title: "大きな用事", minutes: 120 });
      KN.unfold.open(t.id);
      await new Promise((r) => setTimeout(r, 500)); out.unfold = count(); await close();
      return out;
    });
    c.check(`${tag}：時刻と長さの紙に打つ欄は無い`, fields.span === 0, JSON.stringify(fields));
    c.check(`${tag}：AIとほどくで打つのは「困っていること」と「答え」だけ`, fields.unfold === 2, JSON.stringify(fields));
    c.check(`${tag}：ページのエラーが無い`, errors.length === 0, errors.join(" / "));
    await browser.close();
  }
  c.done();
})();
