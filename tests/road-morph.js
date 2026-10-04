/* 一日の道：連れ→停留所の変形（V8・docs/roadmap-2.0.md、docs/todo-timeline.md の「連れ→停留所（V8）」）。
   時計を 9:10 に止め、今日に時刻なしの用事（連れ）一つと 15:00 の停留所を置く。
   1. 時刻を決める：連れの位置から丸が飛び（.road-fly）、着く停留所は着くまで隠れる。終われば残らない
   2. 時刻を外す：前の停留所が頭へ縮み（.road-leave）、丸が連れの位置へ。終われば残らない
   3. 運んで離す：丸は離した写しの位置から飛ぶ
   4. 動きを減らす設定：その場で入れ替わる（飛ぶ丸も隠れたものも無い） */
const { open, checker } = require("./lib");

const DAY = "2026-09-30";

(async () => {
  const c = checker("road-morph");
  const { browser, ctx, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 30, 9, 10)); },
  });
  const id = await page.evaluate((day) => {
    KN.store.addTodo({ title: "病院", due: day, time: "15:00", minutes: 60 });
    return KN.store.addTodo({ title: "書類整理", due: day }).id;
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);
  const wait = (ms) => page.waitForTimeout(ms);

  /* 飛ぶ丸・隠れたもの・縮む停留所。位置は道の単位（.road-map の幅を 360 として）。 */
  const look = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const map = road.querySelector(".road-map").getBoundingClientRect();
    const k = map.width / KN.dayRoad.W;
    const f = road.querySelector(".road-fly");
    const r = f && f.getBoundingClientRect();
    return {
      fly: r ? { x: (r.left + r.width / 2 - map.left) / k, y: (r.top + r.height / 2 - map.top) / k } : null,
      left: f ? [parseFloat(f.style.left) / 100 * KN.dayRoad.W] : null,
      coming: road.querySelectorAll(".is-coming").length,
      leave: road.querySelectorAll(".road-leave").length,
      anims: road.getAnimations({ subtree: true }).filter((a) => a.playState === "running"
        && !(a.effect && a.effect.target && a.effect.target.classList.contains("is-someday"))).length,
    };
  });
  const where = () => page.evaluate((i) => {
    const st = document.querySelector("#screen-todo .day-road").__road;
    const s = st.stops.find((x) => x.t.id === i);
    const p = s ? st.g.point(s.len ? s.d0 + 8 : s.d0) : null;
    return { bead: st.beadAt[i] || null, head: p && { x: p.x, y: p.y } };
  }, id);
  const near = (a, b, r = 3) => !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) < r;

  /* ---- 1. 時刻を決める ---- */
  const b0 = (await where()).bead;
  c.check("連れの丸がある（前提）", !!b0, JSON.stringify(b0));
  await page.evaluate((i) => KN.store.updateTodo(i, { time: "13:00", minutes: 60 }), id);
  await wait(40);
  let s = await look();
  const h1 = (await where()).head;
  c.check("時刻を決めると丸が飛び、着く停留所は隠れる", !!s.fly && s.coming === 1, JSON.stringify(s));
  c.check("飛ぶ丸は連れのいた位置から", near({ x: s.left[0], y: b0.y }, b0, 1), JSON.stringify([s, b0]));
  await wait(140);
  s = await look();
  c.check("途中は連れと停留所の頭のあいだ", !!s.fly && !near(s.fly, b0, 2) && !near(s.fly, h1, 2), JSON.stringify([s.fly, b0, h1]));
  await wait(800);
  s = await look();
  c.check("終われば飛ぶ丸も隠れたものも残らない", !s.fly && !s.coming && !s.leave && !s.anims, JSON.stringify(s));

  /* ---- 2. 時刻を外す ---- */
  await page.evaluate((i) => KN.store.updateTodo(i, { time: null }), id);
  await wait(40);
  s = await look();
  c.check("時刻を外すと停留所が頭へ縮み、連れの丸は着くまで隠れる", s.leave === 1 && s.coming === 1 && !s.fly, JSON.stringify(s));
  await wait(330);
  s = await look();
  c.check("縮んだあと、丸が停留所の頭から飛ぶ", !!s.fly && !s.leave && near({ x: s.left[0], y: h1.y }, h1, 1),
    JSON.stringify([s, h1]));
  await wait(900);
  s = await look();
  const b1 = (await where()).bead;
  c.check("終われば連れに戻り、何も残らない", !!b1 && !s.fly && !s.coming && !s.leave && !s.anims, JSON.stringify([s, b1]));

  /* ---- 3. 運んで離す（本物のタッチ） ---- */
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] });
  const screenOf = (p) => page.evaluate((q) => {
    const box = document.querySelector("#screen-todo .road-map").getBoundingClientRect();
    const k = box.width / KN.dayRoad.W;
    return { x: box.left + q.x * k, y: box.top + q.y * k, k };
  }, p);
  const t13 = await page.evaluate(() => {
    const g = document.querySelector("#screen-todo .day-road").__road.g;
    const p = g.point(g.dist(13 * 60));
    return { x: p.x, y: p.y - 6 };
  });
  const from = await screenOf(b1);
  const to = await screenOf(t13);
  await touch("touchStart", from.x, from.y);
  await wait(460);
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", from.x + (to.x - from.x) * i / 8, from.y + (to.y + 40 - from.y) * i / 8);
    await wait(20);
  }
  await touch("touchEnd");
  await wait(40);
  s = await look();
  const t = await page.evaluate((i) => KN.store.get().todos.find((x) => x.id === i).time, id);
  c.check("運んで離すと 13:00 に", t === "13:00", String(t));
  c.check("丸は離した写しの位置から飛ぶ", !!s.fly && Math.abs(s.left[0] - t13.x) < 1.5, JSON.stringify([s, t13]));
  await wait(900);

  /* ---- 4. 動きを減らす設定 ---- */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate((i) => KN.store.updateTodo(i, { time: null }), id);
  await wait(40);
  s = await look();
  c.check("動きを減らす設定では、その場で入れ替わる（外す）", !s.fly && !s.coming && !s.leave, JSON.stringify(s));
  await page.evaluate((i) => KN.store.updateTodo(i, { time: "11:00" }), id);
  await wait(40);
  s = await look();
  c.check("動きを減らす設定では、その場で入れ替わる（決める）", !s.fly && !s.coming && !s.leave, JSON.stringify(s));

  c.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})().catch((e) => { console.error(e); process.exit(1); });
