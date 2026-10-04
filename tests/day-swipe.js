/* 紙を横に払って日を送る（js/day-swipe.js、2026年9月28日）。どれも本物のタッチ。

   時計を 2026年9月15日(火) 10:00 に止め、やることに時間つきの用事と長期
   タスクを置く。
   - 長期タスクの下の空白（紙の中・器の外）から払っても日が動く（やること・daily）
   - 着地で親指が少し縦に転がってから横へ払っても取る（前は 5px で縦に決めきっていた）
   - 斜め（水平から40°ほど）の払いも取る。縦の送りは取らない
   - 短く速く弾けば行く。引いてから逆へ弾き返すと戻る
   - 滑っている最中に続けてもう一度払うと、二日進む（前は一日だった）
   - 着いた紙は押せる（inert・is-peek が残らない）。DOM の紙は一枚に戻る
   - 題の字は転がって入れ替わる（変わった字だけ・転がっているあいだも
     textContent は新しい日・終われば素の字）。席を移っても転がらない
   - 動きを減らす設定では転がらない
   - 週をまたぐと、週の帯が送った向きから滑り込む（Web Animations が一つ走る）
   - 滑っている途中の覗き見の紙を押しても、押したことにならない */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("day-swipe");
  const { browser, ctx, page, errors } = await open({
    before: async (cx, pg) => { await pg.clock.setFixedTime(new Date(2026, 8, 15, 10, 0)); },
  });
  await page.evaluate(() => {
    const S = KN.store;
    ["2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"].forEach((d) => {
      S.addTodo({ title: `朝 ${d.slice(8)}`, due: d, time: "08:00", minutes: 30 });
      S.addTodo({ title: `昼 ${d.slice(8)}`, due: d, time: "12:00", minutes: 60 });
    });
    for (let i = 0; i < 3; i++) S.addTodo({ title: `長期 ${i}` });
    S.setCalPref(null, { shown: true, open: false });
  });
  await page.waitForTimeout(300);
  const go = async (id) => {
    await page.evaluate((i) => KN.app.showScreen(i), id);
    await page.waitForTimeout(900);
  };
  const title = () => page.evaluate(() =>
    document.querySelector("#head .js-day-title").textContent.replace(/\s+/g, ""));
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  /** 本物のタッチで、点の列をなぞる。 [[dx, dy], ...] は始点からの位置。 */
  const trace = async (p, path, gap = 16, settle = 800) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(p.x, p.y) });
    for (const [dx, dy] of path) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(p.x + dx, p.y + dy) });
      await page.waitForTimeout(gap);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    if (settle) await page.waitForTimeout(settle);
  };
  const line = (dx, dy, n = 12) => Array.from({ length: n }, (_, i) => [dx * (i + 1) / n, dy * (i + 1) / n]);
  /** 紙の中で、器（.day-car）の外にある空白の一点。見つからなければ下まで送ってから探す。 */
  const blankIn = (id) => page.evaluate((sid) => {
    const sh = document.querySelector(`#screen-${sid} .tl-sheet`);
    sh.scrollTop = sh.scrollHeight;
    const r = sh.getBoundingClientRect();
    const bar = document.getElementById("tabbar");
    const floor = Math.min(r.bottom, bar.getBoundingClientRect().top) - 48;
    const x = r.left + r.width / 2;
    for (let y = floor; y > r.top + 40; y -= 6) {
      const el = document.elementFromPoint(x, y);
      if (el && sh.contains(el) && !el.closest(".day-car, .tl-grip")) return { x, y };
    }
    return null;
  }, id);
  /** 器の中身の上（行のあるところ）の一点。 */
  const onCar = (id) => page.evaluate((sid) => {
    const sh = document.querySelector(`#screen-${sid} .tl-sheet`);
    sh.scrollTop = 0;
    const r = document.querySelector(`#screen-${sid} .day-car`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: Math.max(r.top + 60, 0) + 60 };
  }, id);

  await go("todo");
  const b = await blankIn("todo");
  c.check("やること：長期タスクの下に空白がある", !!b);
  if (b) {
    await trace(b, line(200, 0));
    c.check("やること：長期タスクの下の空白を右へ払うと前の日", (await title()).includes("9月14日"), await title());
    await trace(b, line(-200, 0));
    c.check("やること：左へ払うと次の日（15日）", (await title()).includes("9月15日"), await title());
  }

  let p = await onCar("todo");
  /* 着地で親指が縦に 5px 転がってから、横へ。 */
  await trace(p, [[1, 3], [2, 5], ...line(180, 8).map(([x, y]) => [x + 2, y + 5])]);
  c.check("縦に少し転がってから横へ払っても取る", (await title()).includes("9月14日"), await title());
  /* 斜め（水平から40°ほど）。 */
  await trace(p, line(-170, -140));
  c.check("斜めの払いも取る（15日へ）", (await title()).includes("9月15日"), await title());
  /* 縦の送り。送ったぶんは戻しておく（惰性が残っていると、次の指がそれを止める
     だけの指になる）。 */
  await trace(p, line(30, -260));
  await page.waitForTimeout(600);
  p = await onCar("todo");
  await page.waitForTimeout(200);
  c.check("縦の送りは日を動かさない", (await title()).includes("9月15日"), await title());

  /* 短く速く弾く：置いて 40ms 留まってから、24px を続けざまの二回で。CDP の
     往復は一回ごとに数十msかかるので、二つの動きは待たずに続けて送る
     （待つと、試験の中だけ指が遅く読まれる）。 */
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(p.x, p.y) });
  await page.waitForTimeout(40);
  await Promise.all([
    cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(p.x + 8, p.y) }),
    cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(p.x + 24, p.y) }),
    cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
  ]);
  await page.waitForTimeout(800);
  c.check("短く速く弾けば行く", (await title()).includes("9月14日"), await title());
  /* 引いてから逆へ弾き返す：右へ 120px 引いて、最後に左へ速く戻す。 */
  await trace(p, [...line(120, 0, 8), [100, 0], [70, 0], [40, 0]], 16);
  c.check("引いてから逆へ弾き返すと戻る（14日のまま）", (await title()).includes("9月14日"), await title());

  /* 滑っている最中に、続けてもう一度払う → 二日。 */
  await trace(p, line(160, 0, 6), 16, 60);
  await trace(p, line(160, 0, 6), 16, 900);
  c.check("続けて二度払うと二日戻る（12日）", (await title()).includes("9月12日"), await title());
  const tidy = await page.evaluate(() => {
    const tr = document.querySelector("#screen-todo .day-track");
    const kids = [...tr.children];
    return { n: kids.length, inert: kids.some((k) => k.inert || k.classList.contains("is-peek")),
      tf: tr.style.transform, rows: tr.querySelectorAll(".tl-row").length };
  });
  c.check("着いた紙は一枚・押せる・位置は素", tidy.n === 1 && !tidy.inert && !tidy.tf && tidy.rows > 0,
    JSON.stringify(tidy));
  c.check("着いた紙は12日の中身", await page.evaluate(() =>
    document.querySelector("#screen-todo .day-track").textContent.includes("朝 12")));

  /* 題の字が転がる。 */
  await page.evaluate(() => document.querySelector("#head .js-go-today").click());
  await page.waitForTimeout(700);
  await trace(p, line(200, 0), 16, 0);
  const mid = await page.evaluate(() => new Promise((ok) => {
    const t0 = performance.now();
    const look = () => {
      const d = document.querySelector("#head .day-d");
      const r = d.querySelector(".roll");
      if (r || performance.now() - t0 > 900) {
        ok({ roll: !!r, old: r && r.dataset.old, txt: d.textContent,
          post: document.querySelector("#head .day-post").textContent,
          postRoll: !!document.querySelector("#head .day-post .roll") });
      } else requestAnimationFrame(look);
    };
    look();
  }));
  c.check("題：変わった字だけが転がる（15→14 は「5」→「4」）",
    mid.roll && mid.old === "5" && mid.txt === "14", JSON.stringify(mid));
  c.check("題：曜日の字も転がり、textContent は新しい日のまま", mid.postRoll && mid.post === "日(月)",
    JSON.stringify(mid));
  await page.waitForTimeout(900);
  c.check("題：転がり終わると素の字に戻る", await page.evaluate(() =>
    !document.querySelector("#head .topbar-title .roll")
    && document.querySelector("#head .day-d").textContent === "14"));
  await go("archive");
  c.check("題：席を移っても（同じ日なので）転がらない", await page.evaluate(() =>
    !document.querySelector("#head .topbar-title .roll")));

  /* 週をまたぐ：14日(月) → 13日(日) は前の週（週は月曜はじまりでなければ
     日曜はじまり。どちらでも、またぐ二日を weekOf で選ぶ）。 */
  await go("todo");
  const pair = await page.evaluate(() => {
    const U = KN.util;
    let d = "2026-09-14";
    for (let i = 0; i < 7; i++) {
      const prev = U.shiftDay(d, -1);
      if (U.otherWeek(d, prev)) return [d, prev];
      d = prev;
    }
    return null;
  });
  await page.evaluate((d) => document.querySelector(`#head .cal-day[data-day="${d}"]`).click(), pair[0]);
  await page.waitForTimeout(600);
  p = await onCar("todo");
  await page.evaluate(() => {
    window.__slid = 0;
    const g = document.querySelector("#head .cal .cal-grid");
    const orig = g.animate.bind(g);
    g.animate = (...a) => { window.__slid++; return orig(...a); };
  });
  await trace(p, line(200, 0), 16, 900);
  const wk = await page.evaluate(() => ({
    anims: window.__slid,
    here: (document.querySelector("#head .cal .cal-day.is-here") || {}).dataset,
  }));
  c.check("週をまたぐと、週の帯が滑り込む", wk.anims >= 1 && wk.here && wk.here.day === pair[1],
    JSON.stringify(wk));
  await page.waitForTimeout(600);

  /* 滑っている途中の覗き見の紙を押しても、押したことにならない。 */
  const tapped = await page.evaluate(() => new Promise((ok) => {
    const track = document.querySelector("#screen-todo .day-track");
    const peek = document.createElement("section");
    peek.className = "day-slide is-peek";
    const btn = document.createElement("button");
    let hit = false;
    btn.addEventListener("click", () => { hit = true; });
    peek.append(btn);
    track.append(peek);
    btn.click();
    peek.remove();
    ok(hit);
  }));
  c.check("覗き見の紙の click は止まる", tapped === false);

  /* daily：中身の下の空白から払う。 */
  await go("archive");
  const day0 = await page.evaluate(() => KN.util.dayShare.get());
  const bd = await blankIn("archive");
  c.check("daily：中身の下に空白がある", !!bd, await page.evaluate(() => {
    const sh = document.querySelector("#screen-archive .tl-sheet"), r = sh.getBoundingClientRect();
    const car = sh.querySelector(".day-car").getBoundingClientRect();
    return JSON.stringify({ top: r.top, bottom: r.bottom, carBottom: car.bottom, st: sh.scrollTop, sh: sh.scrollHeight, ch: sh.clientHeight,
      bar: document.getElementById("tabbar").getBoundingClientRect().top });
  }));
  if (bd) {
    await trace(bd, line(200, 0));
    const want = await page.evaluate((d) => {
      const x = KN.util.dayDate(KN.util.shiftDay(d, -1));
      return `${x.getMonth() + 1}月${x.getDate()}日`;
    }, day0);
    c.check("daily：空白を右へ払うと前の日", (await title()).includes(want), `${await title()} / ${want}`);
  }

  /* 動きを減らす設定では転がらない。 */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await go("todo");
  p = await onCar("todo");
  await trace(p, line(-200, 0), 16, 0);
  await page.waitForTimeout(50);
  c.check("動きを減らす設定では題が転がらない", await page.evaluate(() =>
    !document.querySelector("#head .topbar-title .roll")));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(800);

  c.check("ページのエラーが無い", !errors.length, errors.join("\n"));
  c.done();
  await browser.close();
})();
