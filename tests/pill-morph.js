/* 押した行の丸薬が、紙の頭の丸薬へ伸びていく（C2・ui.js の morphPill）。
   - 題を押しても、丸薬を押しても、影武者（.sheet-morph）が行の丸薬の箱から
     出て、紙が開き終えたときの頭の丸薬の箱に着く
   - 飛んでいるあいだは本物の二つを隠し、着いたら戻して影武者を消す
   - 途中で閉じても、隠したものが残らない
   - 動きを減らす設定・広い画面（紙がダイアログ）・新しく足す紙では出さない
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/pill-morph.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("pill-morph");
  const { browser, page, errors } = await open();

  await page.evaluate(() => {
    KN.store.addTodo({ title: "試験の用事", due: KN.util.todayKey(), time: "09:00", minutes: 60 });
    KN.app.showScreen("todo");
  });
  await page.waitForTimeout(600);

  const row = page.locator(".screen.is-active .tl-row", { hasText: "試験の用事" }).first();
  const rectOf = (loc) => loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const near = (a, b, tol = 2) => ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);
  const fmt = (r) => r && `${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.w.toFixed(1)}×${r.h.toFixed(1)}`;

  /* 影武者の箱を毎フレーム控える。消えたら止まる。 */
  const record = () => page.evaluate(() => new Promise((ok) => {
    const out = { frames: [], hidden: [] };
    const t0 = performance.now();
    const tick = () => {
      const g = document.querySelector(".sheet-morph");
      if (g) {
        const r = g.getBoundingClientRect();
        out.frames.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        const hero = document.querySelector(".sheet .js-hero-node");
        const node = document.querySelector(".screen.is-active .tl-row .tl-node[style*='visibility']");
        out.hidden.push(!!(hero && hero.style.visibility === "hidden") && !!node);
      }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
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
    const { frames, hidden } = await rec;
    const hero = await rectOf(page.locator(".sheet.is-open .js-hero-node"));
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
    }
    t.check(`${label}：着いたら影武者は消える`, (await page.locator(".sheet-morph").count()) === 0);
    t.check(`${label}：頭の丸薬が見えている`,
      await page.locator(".sheet.is-open .js-hero-node").evaluate((el) => el.style.visibility === "" && getComputedStyle(el).visibility === "visible"));
    t.check(`${label}：行の丸薬が見えている`,
      await row.locator(".tl-node").evaluate((el) => el.style.visibility === ""));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  await tryOpen("題を押す", row.locator(".tl-open"));
  await tryOpen("丸薬を押す", row.locator(".tl-node"));

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
