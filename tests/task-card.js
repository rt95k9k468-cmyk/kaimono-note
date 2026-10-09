/* やることの紙は、四隅の丸いカード。既にある用事は、その行から広がって出て、その行へ縮んで戻る
   （2026年10月9日・利用者の希望。ui.js の growCard / shrinkCard / cardWindow、sheet の card）。
   - 行から開いても、＋なしで開いても（KN.screens.todo.open）、四隅の丸いカード（is-fab-card）
   - 開きはじめの見える窓（clip-path）は行の箱、開ききると窓は無い（紙ぜんぶ）
   - 行が紙より上にあっても（紙は中身ぶんの高さで下に浮く）、窓は行から出る（紙ごと寄せる）
   - 閉じると窓は行の箱へ縮み、片づく。行の中に隠したもの（行・丸薬）は残らない
   - 閉じてすぐ別の行を押せる（縮んで帰るあいだ、覆いが指を食べない）
   - 動きを減らす設定では窓を動かさない（カードのまま）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/task-card.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("task-card");
  const { browser, page, errors } = await open();

  await page.evaluate(() => {
    KN.store.addTodo({ title: "試験の用事", due: KN.util.todayKey(), time: "09:00", minutes: 60 });
    KN.store.addTodo({ title: "間の用事", due: KN.util.todayKey(), time: "11:00", minutes: 30 });
    /* 「これから」を長くして、時間割の行を紙の上端より上まで送れるように。 */
    for (let i = 0; i < 8; i++) KN.store.addTodo({ title: `先のこと${i}`, due: null });
    KN.app.showScreen("todo");
  });
  await page.waitForTimeout(700);

  const rowOf = (title) => page.locator(".screen.is-active .tl-row", { hasText: title }).first();
  const boxOf = (loc) => loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  });
  const isCard = () => page.evaluate(() => {
    const el = document.querySelector(".sheet.is-open"), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return el.classList.contains("is-fab-card") && r.left >= 6 && innerWidth - r.right >= 6
      && innerHeight - r.bottom >= 6 && parseFloat(cs.borderBottomLeftRadius) > 10
      && parseFloat(cs.borderTopLeftRadius) > 10;
  });
  /* 紙の見える窓（箱から clip-path の inset を引いたもの）を毎フレーム控える。紙が片づくまで、
     上限 3 秒。コマはページの中に溜めてあとで読む（fab-home と同じ）。 */
  const record = () => page.evaluate(() => {
    const out = window.__rec = [];
    const t0 = performance.now();
    let el = null;
    const tick = () => {
      el = el || document.querySelector(".sheet");
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        /* 算出値は短く書かれる（左右が同じなら三つ）。 */
        const m = /inset\(([^r)]+)/.exec(getComputedStyle(el).clipPath);
        const n = m ? m[1].trim().split(/\s+/).map(parseFloat) : [0];
        const [tp, rt, bt, lt] = [n[0], n[1] ?? n[0], n[2] ?? n[0], n[3] ?? n[1] ?? n[0]];
        const v = { l: r.left + lt, t: r.top + tp, r: r.right - rt, b: r.bottom - bt };
        out.push({ t: performance.now() - t0, x: (v.l + v.r) / 2, y: (v.t + v.b) / 2, w: v.r - v.l, h: v.b - v.t,
          clip: !!m, ghosts: document.querySelectorAll(".sheet-morph").length });
      }
      if ((!el || el.isConnected) && performance.now() - t0 < 3000) requestAnimationFrame(tick);
      else out.done = true;
    };
    requestAnimationFrame(tick);
  });
  const stopRec = async (ms) => {
    if (ms) await page.waitForTimeout(ms);
    else await page.waitForFunction(() => window.__rec && window.__rec.done, null, { timeout: 5000 });
    return page.evaluate(() => { const r = window.__rec.slice(); window.__rec.done = true; return r; });
  };
  const near = (f, b, tol) => !!f && Math.abs(f.x - b.x) < tol && Math.abs(f.y - b.y) < tol
    && Math.abs(f.h - b.h) < tol && f.w <= b.w + 1 && f.w > b.w - 40;
  const fmt = (f) => f && `${f.x.toFixed(0)},${f.y.toFixed(0)} ${f.w.toFixed(0)}×${f.h.toFixed(0)}`;
  const nothingHidden = () => page.evaluate(() =>
    [...document.querySelectorAll(".screen.is-active .tl-row, .screen.is-active .tl-row *")]
      .every((n) => n.style.visibility === ""));

  async function roundTrip(label, title, block) {
    const row = rowOf(title);
    await row.evaluate((el, b) => el.scrollIntoView({ block: b }), block);
    await page.waitForTimeout(400);
    const from = await boxOf(row);
    await record();
    await row.locator(".tl-open").click();
    const opened = await stopRec(900);
    t.check(`${label}：四隅の丸いカード`, await isCard());
    const rest = await page.evaluate(() => {
      const r = document.querySelector(".sheet.is-open").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    });
    /* 最初に控えられるのは動き出して一コマ目。--push-e は出だしが速いので、道のりの1割までを
       「出たところ」と見る（pill-morph と同じ）。 */
    const first = opened[0];
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h);
    t.check(`${label}：窓は行の箱から出る`, first && first.clip && d(first, from) < d(from, rest) * 0.1,
      `${fmt(first)} / ${fmt(from)}`);
    const last = opened[opened.length - 1];
    t.check(`${label}：開ききると窓は紙ぜんぶ`, last && !last.clip && Math.abs(last.y - rest.y) < 1, `${fmt(last)} / ${fmt(rest)}`);
    t.check(`${label}：途中は行と紙のあいだ`, opened.some((f) => f.h > from.h + 20 && f.h < rest.h - 20));
    t.check(`${label}：開いたら写しは残らない`, await page.evaluate(() => !document.querySelector(".sheet-morph")));

    await record();
    await page.keyboard.press("Escape");
    const closed = await stopRec();
    const home = await boxOf(rowOf(title));
    const end = closed.filter((f) => f.clip).pop();
    t.check(`${label}：閉じると窓は行の箱へ縮む`, near(end, home, 6), `${fmt(end)} / ${fmt(home)}`);
    t.check(`${label}：紙は片づく`, await page.evaluate(() => !document.querySelector(".sheet, .sheet-backdrop, .sheet-morph")));
    t.check(`${label}：行の中に隠したものが残らない`, await nothingHidden());
    return { from, rest };
  }

  /* 行が紙の箱の中（ふつう）。 */
  await roundTrip("真ん中の行", "試験の用事", "center");
  /* 行が紙より上：紙ごと寄せて、窓は行から出る。 */
  const top = await roundTrip("上の行", "試験の用事", "start");
  t.check("上の行：行は紙の上端より上にいた", top.from.y < top.rest.y - top.rest.h / 2,
    `${top.from.y} / ${top.rest.y - top.rest.h / 2}`);

  /* 閉じてすぐ別の行を押せる。 */
  {
    const a = rowOf("試験の用事");
    await a.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(400);
    await a.locator(".tl-open").click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    const b = await rowOf("間の用事").locator(".tl-open").boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(900);
    t.check("閉じてすぐ別の行を押せる", await page.evaluate(() => {
      const el = document.querySelector(".sheet.is-open .js-title, .sheet.is-open input");
      return !!el && el.value === "間の用事";
    }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
  }

  /* 行を押さずに開く（通知から・コピーのあと）も、カード。 */
  {
    const id = await rowOf("試験の用事").getAttribute("data-todo-id");
    await page.evaluate((i) => KN.screens.todo.open(i), id);
    await page.waitForTimeout(900);
    t.check("行を押さずに開いてもカード", await isCard());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  }

  /* 動きを減らす設定：窓は動かさず、カードのまま。 */
  {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    const row = rowOf("試験の用事");
    await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    await record();
    await row.locator(".tl-open").click();
    const f = await stopRec(500);
    t.check("動きを減らす設定：窓を動かさない", f.every((x) => !x.clip), String(f.filter((x) => x.clip).length));
    t.check("動きを減らす設定：カード", await isCard());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
