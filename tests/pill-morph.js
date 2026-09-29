/* 押した行の丸薬が、紙の頭の丸薬へ伸びていく（C2・ui.js の morphPill）。
   - 題を押しても、丸薬を押しても、影武者（.sheet-morph）が行の丸薬の箱から
     出て、紙が開き終えたときの頭の丸薬の箱に着く
   - 飛んでいるあいだは本物の二つを隠し、着いたら戻して影武者を消す
   - 途中で閉じても、隠したものが残らない
   - 動きを減らす設定・広い画面（紙がダイアログ）・新しく足す紙では出さない
   - 飛んでいるあいだ絵は頭と同じ色（紙の外の黒を継がない）。出だしは行の
     丸薬の見た目の写しを重ね、薄めて消す（パッと色が変わらない）
   - 絵は 32〜38px のまま（膨らまない）
   - パレットの丸は無い。頭の粒を押すと絵選びが開く
   - 閉じると、頭の丸薬が行の丸薬へ帰る。保存で行が動いても（FLIP の最中でも）
     動いた先に着く。行が無くなったら帰らない。着いたら行の丸薬が見える
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/pill-morph.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("pill-morph");
  const { browser, page, errors } = await open();

  await page.evaluate(() => {
    KN.store.addTodo({ title: "試験の用事", due: KN.util.todayKey(), time: "09:00", minutes: 60 });
    KN.store.addTodo({ title: "間の用事", due: KN.util.todayKey(), time: "11:00", minutes: 30 });
    KN.app.showScreen("todo");
  });
  await page.waitForTimeout(600);

  const row = page.locator(".screen.is-active .tl-row", { hasText: "試験の用事" }).first();
  /* 行を画面のまん中へ。一日の道が高くなると（2026年9月30日、段の間 64 → 80）、
     行が下の帯の裏へ下がって、押しても紙が開かなかった。 */
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  const rectOf = (loc) => loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const near = (a, b, tol = 2) => ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
  const fmt = (r) => r && `${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.w.toFixed(1)}×${r.h.toFixed(1)}`;

  /* 影武者の箱を毎フレーム控える。消えたら止まる。 */
  const record = () => page.evaluate(() => new Promise((ok) => {
    const out = { frames: [], hidden: [], colors: [], under: [], marks: [] };
    const t0 = performance.now();
    const tick = () => {
      const g = document.querySelector(".sheet-morph");
      if (g) {
        const r = g.getBoundingClientRect();
        out.frames.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        out.colors.push(getComputedStyle(g).color);
        out.marks.push(g.firstElementChild ? g.firstElementChild.getBoundingClientRect().width : 0);
        const u = g.lastElementChild;
        out.under.push(u && u !== g.firstElementChild ? +getComputedStyle(u).opacity : -1);
        const hero = document.querySelector(".sheet .js-hero-node");
        const node = document.querySelector(".screen.is-active .tl-row .tl-node[style*='visibility']");
        out.hidden.push(!!(hero && hero.style.visibility === "hidden") && !!node);
      }
      /* 影武者が消えるまで（着いて片づくまで）。決め打ちの 900ms で切っていたときは、
         CPU が混むと動きの途中で記録が終わり、着いた箱が 2px ずれて落ちた（R19）。 */
      if (!g && out.frames.length) ok(out);
      else if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
      else ok(out);
    };
    requestAnimationFrame(tick);
  }));

  async function tryOpen(label, target) {
    const from = await rectOf(row.locator(".tl-node"));
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const rec = record();
    await page.mouse.down();
    await page.mouse.up();
    const { frames, hidden, colors, under, marks } = await rec;
    const hero = await rectOf(page.locator(".sheet.is-open .js-hero-node"));
    const heroColor = await page.locator(".sheet.is-open .js-hero-node")
      .evaluate((el) => getComputedStyle(el).color);
    t.check(`${label}：影武者が出る`, frames.length > 5, `frames=${frames.length}`);
    if (frames.length) {
      /* 最初に控えられるのは動き出して一コマ目。--push-e は出だしが速いので、
         道のりの1割までを「出たところ」と見る。 */
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h);
      t.check(`${label}：行の丸薬の箱から出る`, d(frames[0], from) < d(from, hero) * 0.1,
        `${fmt(frames[0])} / ${fmt(from)}`);
      t.check(`${label}：頭の丸薬の箱に着く`, near(frames[frames.length - 1], hero, 1.5),
        `${fmt(frames[frames.length - 1])} / ${fmt(hero)}`);
      t.check(`${label}：途中は間を通る`, frames.some((f) => !near(f, from, 3) && !near(f, hero, 3)));
      t.check(`${label}：飛んでいるあいだ本物の二つは隠れる`, hidden.every(Boolean));
      t.check(`${label}：絵は頭と同じ色のまま（黒くならない）`,
        colors.every((c) => c === heroColor), `${colors[0]} / ${heroColor}`);
      /* 絵は行の 32px から頭の 38px へ。縮んだ紙の中で測ると倍率が狂って
         2.4 倍に膨らんでいた（一瞬の大きな黒いシルエット）。 */
      t.check(`${label}：絵は膨らまない（32〜38px）`,
        marks.every((w) => w > 30 && w < 40), `${Math.min(...marks).toFixed(1)}〜${Math.max(...marks).toFixed(1)}`);
      t.check(`${label}：出だしは行の丸薬の写しが上にある`, under[0] > 0.8, `under=${under[0]}`);
      t.check(`${label}：写しは薄まっていく`, under[under.length - 1] < 0.1,
        `under=${under[under.length - 1]}`);
    }
    t.check(`${label}：着いたら影武者は消える`, (await page.locator(".sheet-morph").count()) === 0);
    t.check(`${label}：頭の丸薬が見えている`,
      await page.locator(".sheet.is-open .js-hero-node").evaluate((el) => el.style.visibility === "" && getComputedStyle(el).visibility === "visible"));
    t.check(`${label}：行の丸薬が見えている`,
      await row.locator(".tl-node").evaluate((el) => el.style.visibility === ""));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  }

  await tryOpen("題を押す", row.locator(".tl-open"));
  await tryOpen("丸薬を押す", row.locator(".tl-node"));

  /* ---- 閉じると、頭の丸薬が行の丸薬へ帰る ---- */
  const recordBack = () => page.evaluate(() => new Promise((ok) => {
    const out = { frames: [], under: [], rowHidden: [] };
    const t0 = performance.now();
    const tick = () => {
      const g = document.querySelector(".sheet-morph");
      if (g) {
        const r = g.getBoundingClientRect();
        out.frames.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        out.under.push(+getComputedStyle(g.lastElementChild).opacity);
        const n = document.querySelector(".screen.is-active .tl-row[data-todo-id] .tl-node[style*='hidden']");
        out.rowHidden.push(!!n);
      }
      /* 影武者が消えるまで（上限4秒）。決め打ちの 1100ms は、混むと途中で切れる（R19）。 */
      if (!g && out.frames.length) ok(out);
      else if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
      else ok(out);
    };
    requestAnimationFrame(tick);
  }));
  const idOf = await row.getAttribute("data-todo-id");
  const nodeOf = () => page.locator(`.screen.is-active .tl-row[data-todo-id="${idOf}"] .tl-node`);
  async function openAndSettle() {
    const box = await row.locator(".tl-open").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    /* 開き終わるまで：紙が開き、開く影武者が消えている。決め打ちの 700ms では、混むと
       開く影武者がまだ飛んでいるうちに閉じる記録が始まり、その一コマ目を「頭から出た」
       と測って落ちた（R19）。 */
    await page.waitForFunction(() => document.querySelector(".sheet.is-open .js-hero-node")
      && !document.querySelector(".sheet-morph"), null, { timeout: 4000 });
    await page.waitForTimeout(100);
  }
  async function tryBack(label, before) {
    await openAndSettle();
    const hero = await rectOf(page.locator(".sheet.is-open .js-hero-node"));
    const rec = recordBack();
    if (before) await page.evaluate(before, idOf);
    await page.keyboard.press("Escape");
    const { frames, under, rowHidden } = await rec;
    const home = await rectOf(nodeOf());
    t.check(`${label}：影武者が出る`, frames.length > 5, `frames=${frames.length}`);
    if (frames.length > 5) {
      const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h);
      t.check(`${label}：頭の丸薬の箱から出る`, d(frames[0], hero) < d(hero, home) * 0.15,
        `${fmt(frames[0])} / ${fmt(hero)}`);
      t.check(`${label}：行の丸薬の箱に着く`, near(frames[frames.length - 1], home, 1.5),
        `${fmt(frames[frames.length - 1])} / ${fmt(home)}`);
      t.check(`${label}：色は頭から行へ薄めて移る`, under[0] < 0.2 && under[under.length - 1] > 0.9,
        `${under[0]} → ${under[under.length - 1]}`);
      t.check(`${label}：飛んでいるあいだ行の丸薬は隠れる`, rowHidden.every(Boolean));
    }
    t.check(`${label}：着いたら影武者は消える`, (await page.locator(".sheet-morph").count()) === 0);
    t.check(`${label}：行の丸薬が見えている`,
      await nodeOf().evaluate((el) => el.style.visibility === ""));
    return home;
  }
  const stay = await tryBack("そのまま閉じる");
  /* 閉じる直前に時刻を動かす（保存で組み直されるのと同じ）。行は FLIP で
     滑ってくる最中で、影武者はそれを追いかけて、動いた先に着く。 */
  const moved = await tryBack("行が動く", (id) => {
    KN.store.updateTodo(id, { time: "14:00" });
  });
  t.check("行が動く：行き先は動いた先", Math.abs(moved.y - stay.y) > 20, `${stay.y} → ${moved.y}`);
  await page.evaluate((id) => KN.store.updateTodo(id, { time: "09:00" }), idOf);
  await page.waitForTimeout(700);
  /* 行が無くなったら（別の日へ移した）、帰らない。 */
  {
    await openAndSettle();
    await page.evaluate((id) => {
      const d = new Date(); d.setDate(d.getDate() + 1);
      KN.store.updateTodo(id, { due: KN.util.dayKey(d) });
    }, idOf);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(40);
    t.check("行が無くなったら帰らない", (await page.locator(".sheet-morph").count()) === 0);
    await page.waitForTimeout(400);
    await page.evaluate((id) => KN.store.updateTodo(id, { due: KN.util.todayKey() }), idOf);
    await page.waitForTimeout(700);
  }

  /* パレットの丸は無く、頭の粒そのものが絵選びを開く。 */
  {
    const box = await row.locator(".tl-open").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
    t.check("パレットの丸は無い", (await page.locator(".sheet.is-open .hero-paint").count()) === 0);
    const sheets = await page.locator(".sheet.is-open").count();
    await page.locator(".sheet.is-open .js-hero-node").click();
    await page.waitForTimeout(500);
    t.check("頭の粒を押すと絵選びが開く",
      (await page.locator(".sheet.is-open").count()) === sheets + 1);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  }

  /* 途中で閉じる。 */
  {
    const box = await row.locator(".tl-open").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(60);
    const flying = await page.locator(".sheet-morph").count();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    t.check("途中で閉じる：飛んでいた", flying === 1);
    t.check("途中で閉じる：影武者は消える", (await page.locator(".sheet-morph").count()) === 0);
    t.check("途中で閉じる：行の丸薬は戻る",
      await row.locator(".tl-node").evaluate((el) => el.style.visibility === ""));
    await page.waitForTimeout(500);
  }

  /* 新しく足す紙（＋）には、伸びてくる行が無い。 */
  {
    await page.locator(".screen.is-active .js-open-add, .js-open-add").first().click();
    await page.waitForTimeout(80);
    t.check("＋から足す紙では出ない", (await page.locator(".sheet-morph").count()) === 0);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  /* 動きを減らす設定。 */
  {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const box = await row.locator(".tl-open").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(60);
    t.check("動きを減らす設定では出ない", (await page.locator(".sheet-morph").count()) === 0);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }

  /* 広い画面では紙が真ん中のダイアログなので出さない。 */
  {
    await page.setViewportSize({ width: 900, height: 844 });
    await page.waitForTimeout(500);
    const box = await row.locator(".tl-open").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(60);
    t.check("広い画面では出ない", (await page.locator(".sheet-morph").count()) === 0);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }

  t.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
