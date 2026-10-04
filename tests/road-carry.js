/* 一日の道：つかんで道へ運び、時刻を決める（段8・2026年9月30日、docs/todo-timeline.md の
   「道へ運ぶ（段8）」）。時計を 9:10 に止め、今日に時刻なしの用事三つ（連れ）と、15:00 の
   停留所を一つ置く。指はどれも本物のタッチ（CDP の Input.dispatchTouchEvent）。
   1. 連れを長押し → 13:00 の位置へ数回に分けて運ぶ → 離す：time "13:00"・due が今日、
      紙は開かない、元に戻すで戻る
   2. 0.38秒より前に縦へ動かす：持ち上がらず、紙が送られる
   3. 運んでいる途中の横の動き：日が変わらない・送りの位置が変わらない・送る器に transform なし
   4. 歩いたぶん・道の外・動かさずに離す：何も書かれず、丸は元へ
   5. 短く押す：紙が開く
   6. 当たり判定：紙の本体を上端で下へ引くと、送る器に transform が付く */
const { open, checker } = require("./lib");

const DAY = "2026-09-30";

(async () => {
  const c = checker("road-carry");
  const { browser, ctx, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 30, 9, 10)); },
  });

  const ids = await page.evaluate((day) => {
    const s = KN.store;
    return {
      a: s.addTodo({ title: "書類整理", due: day }).id,
      b: s.addTodo({ title: "メールを返す", due: day }).id,
      c: s.addTodo({ title: "植木に水", due: day }).id,
      stop: s.addTodo({ title: "病院", due: day, time: "15:00", minutes: 60 }).id,
    };
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);

  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: type === "touchEnd" ? [] : pts(x, y) });
  const wait = (ms) => page.waitForTimeout(ms);

  const todo = (id) => page.evaluate((i) => {
    const t = KN.store.get().todos.find((x) => x.id === i);
    return t ? { time: t.time || null, due: t.due || null } : null;
  }, id);
  const scroller = () => page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
    return { top: sc.scrollTop, tf: sc.style.transform || "", h: sc.scrollHeight - sc.clientHeight };
  });
  const title = () => page.evaluate(() => document.querySelector("#head .js-day-title").textContent.replace(/\s+/g, ""));
  const sheetOpen = () => page.evaluate(() => !!document.querySelector(".sheet.is-open"));
  const closeSheets = async () => {
    await page.evaluate(() => KN.ui.closeAll && KN.ui.closeAll());
    await page.keyboard.press("Escape");
    await wait(600);
  };
  /* 連れの丸の真ん中（題で探す。並びは組み直しで変わりうるので毎回）。 */
  const beadAt = async (name) => {
    const b = await page.locator(`#screen-todo .road-bead[aria-label^="${name}"]`).boundingBox();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  };
  /* 道の上の時刻 min を狙う指の位置（画面の座標）。狙うのは指の上 40px に浮いた写しなので、
     指はその点の 40px 下。off は道の中心から上下へずらす px。 */
  const roadPoint = (min, off = 0) => page.evaluate(([m, o]) => {
    const road = document.querySelector("#screen-todo .day-road");
    const g = road.__road.g;
    const box = road.querySelector(".road-map").getBoundingClientRect();
    const k = box.width / KN.dayRoad.W;
    const p = g.point(g.dist(m));
    return { x: box.left + p.x * k, y: box.top + p.y * k + o + 40 };
  }, [min, off]);
  /* 道の外（右のくぼみ、1・2段のあいだ）を狙う指の位置。 */
  const outPoint = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const g = road.__road.g;
    const box = road.querySelector(".road-map").getBoundingClientRect();
    const k = box.width / KN.dayRoad.W;
    return { x: box.right - 14, y: box.top + (g.rowY(1) + 44) * k + 40 };
  });
  const state = () => page.evaluate(() => ({
    carrying: KN.dayRoad.carrying(),
    ghost: !!document.querySelector(".road-ghost"),
    lifted: !!document.querySelector("#screen-todo .road-bead.is-lifted"),
    aim: !!document.querySelector("#screen-todo .road-aim.is-on"),
    tag: (document.querySelector(".road-carry-time.is-on") || {}).textContent || null,
  }));
  /* from から to へ、steps 回に分けて。 */
  const glide = async (from, to, steps = 8) => {
    for (let i = 1; i <= steps; i++) {
      await touch("touchMove", from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
      await wait(20);
    }
  };

  const sc0 = await scroller();
  c.check("紙は送れる長さがある（2 の前提）", sc0.h > 40, JSON.stringify(sc0));

  /* ---- 1. 長押し → 13:00 へ運ぶ → 離す ---- */
  const before = await todo(ids.a);
  let from = await beadAt("書類整理");
  c.check("連れ「書類整理」が道の上にある", !!from, String(from));
  await touch("touchStart", from.x, from.y);
  await wait(200);
  let s = await state();
  c.check("0.2秒ではまだ持ち上がらない", !s.carrying && !s.ghost, JSON.stringify(s));
  await wait(260);
  s = await state();
  c.check("0.38秒で持ち上がる（写しが浮き、元の丸は薄く）", s.carrying && s.ghost && s.lifted, JSON.stringify(s));
  c.check("動かす前は狙いも時刻の札も出ない", !s.aim && !s.tag, JSON.stringify(s));
  const at13 = await roadPoint(13 * 60, -6);
  /* まず真下へ（紙は上端にいるので、pull-refresh が取れば送る器に transform が付く）。 */
  const down = { x: from.x, y: from.y + 110 };
  let tfDown = "";
  for (let i = 1; i <= 6; i++) {
    await touch("touchMove", from.x, from.y + 110 * i / 6);
    await wait(20);
    tfDown = tfDown || (await scroller()).tf;
  }
  c.check("運んでいるあいだ下へ動かしても、送る器に transform が付かない", !tfDown, tfDown);
  await glide(down, at13, 6);
  s = await state();
  c.check("13:00 の道の上で、狙いの点と時刻の札「13:00」", s.aim && s.tag === "13:00", JSON.stringify(s));
  const gh = await page.evaluate(() => {
    const r = document.querySelector(".road-ghost").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  c.check("写しは指の真上 40px（scale で移動量がずれない）",
    Math.abs(gh.x - at13.x) < 1.5 && Math.abs(gh.y - (at13.y - 40)) < 1.5, JSON.stringify([gh, at13]));
  await touch("touchEnd");
  await wait(700);
  let after = await todo(ids.a);
  c.check("離すと time が 13:00・due がその日", after.time === "13:00" && after.due === DAY,
    JSON.stringify([before, after]));
  s = await state();
  c.check("離したら写しも狙いも消える", !s.carrying && !s.ghost && !s.aim && !s.tag, JSON.stringify(s));
  c.check("運んで離しても紙は開かない", !(await sheetOpen()));
  const stopNow = await page.evaluate(() => {
    const st = document.querySelector("#screen-todo .day-road").__road;
    return { stops: st.stops.map((x) => x.t.title), loose: st.loose.map((x) => x.t.title) };
  });
  c.check("道の停留所になり、連れから外れる", stopNow.stops.includes("書類整理") && !stopNow.loose.includes("書類整理"),
    JSON.stringify(stopNow));
  const toast = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("報せ「13:00 に」と元に戻す", /13:00/.test(toast) && /元に戻す/.test(toast), toast);
  await page.locator(".toast button", { hasText: "元に戻す" }).click();
  await wait(500);
  after = await todo(ids.a);
  c.check("元に戻すで time と due が戻る", after.time === before.time && after.due === before.due,
    JSON.stringify([before, after]));

  /* ---- 2. 0.38秒より前に縦へ動かす：持ち上がらず、紙が送られる ---- */
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await wait(200);
  from = await beadAt("メールを返す");
  const top0 = (await scroller()).top;
  await touch("touchStart", from.x, from.y);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", from.x, from.y - i * 14); await wait(16); }
  await touch("touchEnd");
  await wait(500);
  s = await state();
  const top1 = (await scroller()).top;
  c.check("0.38秒より前に縦へ動かすと持ち上がらない", !s.carrying && !s.ghost && !s.lifted, JSON.stringify(s));
  c.check("そのまま紙が送られる", top1 > top0 + 20, JSON.stringify([top0, top1]));
  c.check("送っても何も書かれない", JSON.stringify(await todo(ids.b)) === JSON.stringify({ time: null, due: DAY }));
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await wait(300);

  /* ---- 3. 運んでいる途中の横の動き：日も送りも動かない ---- */
  const t0 = await title();
  const scA = await scroller();
  from = await beadAt("メールを返す");
  await touch("touchStart", from.x, from.y);
  await wait(460);
  let tfSeen = "", trackSeen = "";
  for (let i = 1; i <= 12; i++) {
    await touch("touchMove", from.x - i * 16, from.y + i);
    await wait(16);
    const w = await page.evaluate(() => {
      const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
      const tr = document.querySelector("#screen-todo .day-track, #screen-todo .is-dragging");
      return { tf: sc.style.transform || "", track: tr ? tr.style.transform || "" : "" };
    });
    if (w.tf && w.tf !== "none") tfSeen = w.tf;
    if (w.track && w.track !== "none") trackSeen = w.track;
  }
  s = await state();
  c.check("横に動かしているあいだも運んでいる", s.carrying, JSON.stringify(s));
  /* 道の外（上の段より上）へ逃がしてから離す——横の動きだけを見るため。 */
  await glide({ x: from.x - 192, y: from.y + 12 }, { x: from.x - 100, y: from.y - 160 }, 4);
  await touch("touchEnd");
  await wait(900);
  const scB = await scroller();
  c.check("運んでいる途中の横の動きで日が変わらない", (await title()) === t0, `${t0} → ${await title()}`);
  c.check("送りの位置が変わらない", Math.abs(scB.top - scA.top) < 1, JSON.stringify([scA.top, scB.top]));
  c.check("送る器にも日の帯にも transform が付かない", !tfSeen && !trackSeen, JSON.stringify([tfSeen, trackSeen]));
  c.check("道の外で離すと何も書かれない", JSON.stringify(await todo(ids.b)) === JSON.stringify({ time: null, due: DAY }));

  /* ---- 4. 歩いたぶん・動かさずに離す ---- */
  from = await beadAt("メールを返す");
  await touch("touchStart", from.x, from.y);
  await wait(460);
  const walked = await roadPoint(7 * 60);
  await glide(from, walked, 6);
  s = await state();
  c.check("歩いたぶん（7:00）の上では狙いも札も出ない", s.carrying && !s.aim && !s.tag, JSON.stringify(s));
  await touch("touchEnd");
  await wait(600);
  s = await state();
  c.check("歩いたぶんで離すと何も書かれず、丸は元へ",
    JSON.stringify(await todo(ids.b)) === JSON.stringify({ time: null, due: DAY }) && !s.lifted && !s.ghost,
    JSON.stringify([await todo(ids.b), s]));
  c.check("離しても紙は開かない", !(await sheetOpen()));

  from = await beadAt("メールを返す");
  await touch("touchStart", from.x, from.y);
  await wait(460);
  c.check("持ち上げて", (await state()).carrying);
  await touch("touchEnd");
  await wait(600);
  c.check("動かさずに離すと何も書かれず、紙も開かない",
    JSON.stringify(await todo(ids.b)) === JSON.stringify({ time: null, due: DAY }) && !(await sheetOpen()));

  /* ---- 5. 短く押す：紙が開く ---- */
  from = await beadAt("植木に水");
  await touch("touchStart", from.x, from.y);
  await wait(90);
  await touch("touchEnd");
  await wait(700);
  const opened = await page.evaluate(() => {
    const sh = document.querySelector(".sheet.is-open");
    if (!sh) return null;
    const f = sh.querySelector("textarea, input[type=text]");
    return f ? f.value : sh.textContent;
  });
  c.check("短く押すと、その用事の紙が開く", !!opened && opened.includes("植木に水"), String(opened).slice(0, 60));
  c.check("短く押しても持ち上がらない", !(await state()).carrying);
  await closeSheets();

  /* ---- 5b. 連れを道の外で離す：長期タスクへ戻る ---- */
  from = await beadAt("メールを返す");
  await touch("touchStart", from.x, from.y);
  await wait(460);
  const outAt = await outPoint();
  await glide(from, outAt, 8);
  s = await state();
  c.check("道の外では狙いの点は出ず、札「長期タスク」", s.carrying && !s.aim && s.tag === "長期タスク", JSON.stringify(s));
  await touch("touchEnd");
  await wait(700);
  c.check("道の外で離すと日も時刻も外れる", JSON.stringify(await todo(ids.b)) === JSON.stringify({ time: null, due: null }),
    JSON.stringify(await todo(ids.b)));
  const toastOut = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("報せ「長期タスクへ」と元に戻す", /長期タスクへ/.test(toastOut) && /元に戻す/.test(toastOut), toastOut);
  c.check("道の外で離しても紙は開かない", !(await sheetOpen()));
  await page.locator(".toast button", { hasText: "元に戻す" }).click();
  await wait(500);
  c.check("元に戻すで連れへ戻る", JSON.stringify(await todo(ids.b)) === JSON.stringify({ time: null, due: DAY }));

  /* ---- 6. 当たり判定：紙の本体を上端で下へ引くと、送る器に transform が付く ---- */
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await wait(200);
  const body = await page.evaluate(() => {
    const g = document.querySelector("#screen-todo .tl-grip").getBoundingClientRect();
    return { x: g.left + g.width / 2, y: g.bottom + 90 };
  });
  await touch("touchStart", body.x, body.y);
  let gave = false;
  for (let i = 1; i <= 10; i++) {
    await touch("touchMove", body.x, body.y + i * 14);
    await wait(16);
    gave = gave || !!(await scroller()).tf;
  }
  await touch("touchEnd");
  await wait(600);
  c.check("当たり判定：紙の本体を上端で引くと送る器に transform が付く", gave);

  /* ================= 段B：長期タスクをくぼみに浮かべて運ぶ ================= */
  const ids2 = await page.evaluate((day) => {
    const s = KN.store;
    const done = s.addTodo({ title: "済んだ長期" }).id;
    s.toggleTodo(done);
    const shelf = s.addTodo({ title: "しまった長期" }).id;
    s.archiveTodo(shelf, true);
    return {
      tax: s.addTodo({ title: "税の書類", deadline: "2026-10-20" }).id,
      card: s.addTodo({ title: "年賀状", deadline: "2026-10-05" }).id,
      shelf2: s.addTodo({ title: "本棚を組む" }).id,
      /* 右のくぼみ（1,2段のあいだ）へ札が入りこむ停留所（段の終わり近く・右向きの段）。 */
      pick: s.addTodo({ title: "受け取りに行く", due: day, time: "13:40" }).id,
    };
  }, DAY);
  await wait(600);
  const hollows = () => page.evaluate(() => [...document.querySelectorAll("#screen-todo .road-bead[data-h]")]
    .map((b) => b.getAttribute("aria-label").replace(/（長期タスク）$/, "")));
  c.check("長期タスクはくぼみに、期限の近い順（済み・アーカイブは出ない）",
    JSON.stringify(await hollows()) === JSON.stringify(["年賀状", "税の書類", "本棚を組む"]),
    JSON.stringify(await hollows()));
  const pad = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const pads = [...road.querySelectorAll(".road-hollow")].map((p) => p.getBoundingClientRect());
    const inside = [...road.querySelectorAll(".road-bead[data-h]")].every((b) => {
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return pads.some((p) => x > p.left && x < p.right && y > p.top && y < p.bottom);
    });
    const b = road.querySelector(".road-bead[data-h]");
    return { n: pads.length, inside, anim: getComputedStyle(b).animationName,
             bg: pads[0] ? getComputedStyle(road.querySelector(".road-hollow")).backgroundColor : "" };
  });
  c.check("くぼみの置き場は薄く塗られ、丸はその中に", pad.n > 0 && pad.inside && !/rgba\(0, 0, 0, 0\)/.test(pad.bg), JSON.stringify(pad));
  c.check("くぼみの丸はゆっくり浮き沈みする", pad.anim === "road-float", JSON.stringify(pad));

  /* くぼみの丸は道・停留所・札・人・連れ・時刻と重ならない。道と停留所は SVG の
     isPointInStroke で丸のふち16点を見る（太さは CSS のまま）。 */
  const overlap = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const svg = road.querySelector(".road-svg");
    const box = road.querySelector(".road-map").getBoundingClientRect();
    const k = box.width / KN.dayRoad.W;
    const strokes = [...svg.querySelectorAll(".road-base, .road-stop-edge, .road-lead")].filter((p) => p.getAttribute("d"));
    const others = [...road.querySelectorAll(".road-label b, .road-label span, .road-label em, .road-now, .road-edge, .road-turn, .road-bead[data-b], .road-more:not([data-more])")]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const bad = [];
    road.querySelectorAll(".road-bead[data-h], .road-more[data-more]").forEach((b) => {
      const r = b.getBoundingClientRect();
      if (others.some((o) => r.left < o.right - 0.5 && o.left < r.right - 0.5 && r.top < o.bottom - 0.5 && o.top < r.bottom - 0.5)) {
        bad.push(`${b.getAttribute("aria-label")} と札`);
      }
      const cx = (r.left + r.width / 2 - box.left) / k, cy = (r.top + r.height / 2 - box.top) / k;
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * 2 * i / 16;
        const p = svg.createSVGPoint();
        p.x = cx + 9 * Math.cos(a); p.y = cy + 9 * Math.sin(a);
        if (strokes.some((s) => s.isPointInStroke(p))) { bad.push(`${b.getAttribute("aria-label")} と道`); break; }
      }
    });
    /* 試験の歯：道のまん中の点は道の上と判る */
    const g = road.__road.g, q = g.point(g.total / 2), pp = svg.createSVGPoint();
    pp.x = q.x; pp.y = q.y;
    return { bad, n: road.querySelectorAll(".road-bead[data-h], .road-more[data-more]").length,
             sane: svg.querySelector(".road-base").isPointInStroke(pp) };
  });
  let ov = await overlap();
  c.check("くぼみの丸は道・札と重ならない（3件）", ov.sane && ov.n === 3 && !ov.bad.length, JSON.stringify(ov));

  /* 長期タスクを運ぶ：長押し → 16:00 → 離す：due がその日・time 16:00、元に戻すで戻る */
  const taxBefore = await todo(ids2.tax);
  from = await beadAt("税の書類");
  await touch("touchStart", from.x, from.y);
  await wait(460);
  s = await state();
  c.check("くぼみの丸も 0.38秒で持ち上がる", s.carrying && s.ghost && s.lifted, JSON.stringify(s));
  const at16 = await roadPoint(16 * 60, 5);
  await glide(from, at16, 8);
  s = await state();
  c.check("16:00 の道の上で札「16:00」", s.aim && s.tag === "16:00", JSON.stringify(s));
  await touch("touchEnd");
  await wait(700);
  let tax = await todo(ids2.tax);
  c.check("長期タスクを運ぶと due がその日・time 16:00", tax.due === DAY && tax.time === "16:00",
    JSON.stringify([taxBefore, tax]));
  c.check("くぼみから外れて停留所に", !(await hollows()).includes("税の書類")
    && await page.evaluate(() => document.querySelector("#screen-todo .day-road").__road.stops.some((x) => x.t.title === "税の書類")));
  c.check("運んで離しても紙は開かない（くぼみ）", !(await sheetOpen()));
  await page.locator(".toast button", { hasText: "元に戻す" }).click();
  await wait(500);
  tax = await todo(ids2.tax);
  c.check("元に戻すで長期タスクへ戻る（due・time なし）", !tax.due && !tax.time, JSON.stringify(tax));

  /* 短く押すと、その長期タスクの紙が開く */
  from = await beadAt("年賀状");
  await touch("touchStart", from.x, from.y);
  await wait(90);
  await touch("touchEnd");
  await wait(700);
  const opened2 = await page.evaluate(() => {
    const sh = document.querySelector(".sheet.is-open");
    if (!sh) return null;
    const f = sh.querySelector("textarea, input[type=text]");
    return f ? f.value : sh.textContent;
  });
  c.check("くぼみの丸を短く押すと、その紙が開く", !!opened2 && opened2.includes("年賀状"), String(opened2).slice(0, 60));
  await closeSheets();

  /* 入りきらなければ最後を「+n」、押すと長期タスクの欄へ */
  await page.evaluate(() => { for (let i = 0; i < 36; i++) KN.store.addTodo({ title: `いつかの用事${i}` }); });
  await wait(700);
  const more = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const m = road.querySelector(".road-more[data-more]");
    return { shown: road.querySelectorAll(".road-bead[data-h]").length, total: road.__road.someday.length,
             n: m ? Number(m.textContent.replace("+", "")) : null };
  });
  c.check("入りきらなければ最後の丸が「+n」（出た数＋n＝全部）", more.n > 0 && more.shown + more.n === more.total,
    JSON.stringify(more));
  ov = await overlap();
  c.check("くぼみの丸は道・札と重ならない（いっぱい）", !ov.bad.length && ov.n === more.shown + 1, JSON.stringify(ov));
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await wait(200);
  const mb = await page.locator("#screen-todo .road-more[data-more]").boundingBox();
  await touch("touchStart", mb.x + mb.width / 2, mb.y + mb.height / 2);
  await wait(80);
  await touch("touchEnd");
  await wait(1200);
  const went = await page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
    const sec = document.querySelector("#screen-todo .tl-someday-sec");
    return { top: sc.scrollTop, gap: sec.getBoundingClientRect().top - sc.getBoundingClientRect().top };
  });
  c.check("「+n」を押すと長期タスクの欄へ送る", went.top > 100 && Math.abs(went.gap) < 80, JSON.stringify(went));
  c.check("「+n」を押しても紙は開かない", !(await sheetOpen()));

  /* 過ぎた日には出さない・先の日には出る */
  await page.evaluate(() => KN.screens.todo.goDay("2026-09-29"));
  await wait(900);
  c.check("過ぎた日にはくぼみの丸を出さない", (await hollows()).length === 0);
  await page.evaluate(() => KN.screens.todo.goDay("2026-10-02"));
  await wait(900);
  c.check("先の日にはくぼみの丸が出る", (await hollows()).length > 0);
  await page.evaluate(() => KN.screens.todo.goDay("2026-09-30"));
  await wait(900);

  /* 評価の言葉・絵文字を出さない（道の字と時刻の札） */
  const text = await page.evaluate(() => document.querySelector("#screen-todo .day-road").textContent);
  c.check("評価の言葉なし", !/(遅れ|達成|予定通り|超過|できなかった|%)/.test(text), text.slice(0, 80));
  c.check("絵文字なし", !/\p{Extended_Pictographic}/u.test(text));

  c.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})().catch((e) => { console.error(e); process.exit(1); });
