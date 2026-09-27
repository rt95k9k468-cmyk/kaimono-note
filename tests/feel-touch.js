/* iPhone の震えるつまみ（motion.js の FEEL・C1）と、本物の指（2026年9月27日）。
   - 手順の丸を押すと、指を受けたつまみが**DOM に居るまま** click を出す
     （前は pointerup で行ごと描き直され、震える前に外れていた）。一度だけ済む。
     すぐ押し直せば戻る・長押しは「できなかった」だけ（済みにならない）。
   - 丸（済ませる・手順）の上から指を滑らせて送ったら、離しても押したことに
     しない。iPhone のつまみは送ったあとも click を出すので、試験ではその
     click を手で出して真似る（Chromium のつまみは送ったら click を出さない）。
     当たり判定：その指で本当に送る器が動いたこと。
   - 見張りの三つの印のうち、指の動き（touchmove）だけでも止まる・指先の
     震え（SLOP 以内）なら押したことになる。
   iPhone の振りは UA と navigator.vibrate を消すことで。本物のタッチは CDP。 */
const { open, checker } = require("./lib");

const DAY = "2026-09-27";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

(async () => {
  const c = checker("feel-touch");
  const { browser, ctx, page, errors } = await open({
    before: async (ctx, p) => {
      await p.clock.setFixedTime(new Date(2026, 8, 27, 9, 4));
      await p.addInitScript((ua) => {
        Object.defineProperty(Navigator.prototype, "userAgent", { get: () => ua });
        delete Navigator.prototype.vibrate;
        /* 指を受けた要素と、click を受けた要素（とそのとき DOM に居たか）を控える。 */
        window.__feel = { starts: [], clicks: [] };
        addEventListener("touchstart", (e) => { __feel.starts.push(e.target); }, true);
        addEventListener("click", (e) => {
          __feel.clicks.push({ el: e.target, sw: e.target.classList.contains("feel-switch"),
                               live: e.target.isConnected });
        }, true);
      }, UA);
    },
  });

  const ids = await page.evaluate((day) => {
    const s = KN.store;
    const a = s.addTodo({ title: "朝のしたく", due: day, time: "07:00", minutes: 60,
                          subs: ["顔", "歯", "着替え", "水"].map((x) => ({ title: x })) });
    const rest = [];
    for (let i = 0; i < 18; i++) {
      const h = String(8 + Math.floor(i / 2)).padStart(2, "0");
      rest.push(s.addTodo({ title: `用事${i}`, due: day, time: `${h}:${i % 2 ? "30" : "00"}` }).id);
    }
    return { a: a.id, subs: a.subs.map((x) => x.id), rest };
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(600);
  await page.evaluate((id) => {
    const li = [...document.querySelectorAll("#screen-todo .tl-row")]
      .find((r) => r.querySelector(".tl-subs-chip") && r.textContent.includes("朝のしたく"));
    li.querySelector(".tl-subs-chip").click();
  }, ids.a);
  await page.waitForTimeout(700);

  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  const tap = async (x, y, hold = 60) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(x, y) });
    await page.waitForTimeout(hold);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(250);
  };
  const drag = async (x, y0, dy) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(x, y0) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(x, y0 + (dy * i) / 10) });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(250);
  };
  const subBox = (i) => page.evaluate((i) => {
    const b = document.querySelectorAll("#screen-todo .tl-sub .check.is-sub")[i];
    if (!b) return null;
    b.scrollIntoView({ block: "center" });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, i);
  const subSt = (i) => page.evaluate(([id, sid, day]) => {
    const t = KN.store.getTodo(id);
    const st = KN.store.subStatus(t, t.subs.find((x) => x.id === sid), day);
    return { done: !!st.done, skipped: !!st.skipped };
  }, [ids.a, ids.subs[i], DAY]);
  const reset = () => page.evaluate(() => { __feel.starts = []; __feel.clicks = []; });

  /* つまみが付いている */
  const has = await page.evaluate(() => ({
    sub: !!document.querySelector("#screen-todo .tl-sub .check.is-sub > .feel-switch"),
    main: !!document.querySelector("#screen-todo .tl-row .check:not(.is-sub) > .feel-switch"),
  }));
  c.check("iPhone の振り：手順の丸・済ませる丸につまみ", has.sub && has.main, JSON.stringify(has));

  /* 1. 手順の丸を押す：指を受けたつまみが、DOM に居るまま click を出す */
  await page.waitForTimeout(500);
  let p = await subBox(0);
  await reset();
  await tap(p.x, p.y);
  const tap1 = await page.evaluate(() => {
    const s0 = __feel.starts[0];
    const hit = __feel.clicks.find((k) => k.el === s0);
    return { startSw: !!s0 && s0.classList.contains("feel-switch"),
             clicked: !!hit, live: !!(hit && hit.live), n: __feel.clicks.length };
  });
  c.check("手順の丸：指はつまみに当たる", tap1.startSw, JSON.stringify(tap1));
  c.check("手順の丸：そのつまみが DOM に居るまま click を出す（＝iPhone で震える）",
    tap1.clicked && tap1.live, JSON.stringify(tap1));
  c.check("手順の丸：一度押して済む", (await subSt(0)).done === true, JSON.stringify(await subSt(0)));

  /* すぐ押し直せば戻る（新しい指は落とさない） */
  await page.waitForTimeout(150);
  p = await subBox(0);
  await tap(p.x, p.y);
  c.check("手順の丸：すぐ押し直すと戻る", (await subSt(0)).done === false, JSON.stringify(await subSt(0)));

  /* 長押しは「できなかった」だけ */
  await page.waitForTimeout(150);
  p = await subBox(1);
  await tap(p.x, p.y, 750);
  const held = await subSt(1);
  c.check("手順の丸：長押しは「できなかった」だけ（済みにならない）",
    held.skipped === true && held.done === false, JSON.stringify(held));

  /* 2. 丸の上から送る。iPhone のつまみの「離したら click」を手で真似る */
  const scrollFrom = async (sel, label, state) => {
    await page.evaluate(() => {
      const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
      sc.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    const box = await page.evaluate((sel) => {
      const b = [...document.querySelectorAll(sel)].find((x) => {
        const r = x.getBoundingClientRect();
        return r.top > 260 && r.bottom < 700;
      });
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, sel);
    if (!box) { c.check(`${label}：画面の中に丸がある`, false); return; }
    const before = await state();
    await reset();
    const top0 = await page.evaluate(() => KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop);
    await drag(box.x, box.y, -180);
    const r = await page.evaluate(() => {
      const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
      const sw = __feel.starts[0];
      const out = { top: sc.scrollTop, sw: !!sw && sw.classList.contains("feel-switch"),
                    live: !!sw && sw.isConnected };
      if (sw && sw.isConnected) sw.click();   // iPhone は送ったあとも click を出す
      return out;
    });
    await page.waitForTimeout(1500);   // 済ませる丸は線を引き終えてから store へ（tick）
    const after = await state();
    c.check(`${label}：当たり判定（指はつまみ・送る器が動いた）`, r.sw && r.top > top0 + 40,
      JSON.stringify({ ...r, top0 }));
    c.check(`${label}：送ったあとの click は押したことにしない`,
      JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
  };
  await scrollFrom("#screen-todo .tl-sub .check.is-sub", "手順の丸から送る",
    () => Promise.all([0, 1, 2, 3].map(subSt)));
  await scrollFrom("#screen-todo .tl-row .check:not(.is-sub)", "済ませる丸から送る",
    () => page.evaluate((rest) => rest.map((id) => !!KN.store.getTodo(id).done), ids.rest));

  /* 3. 見張りの印を一つずつ：指の動きだけ（pointercancel も scroll も無し）で止まる・
        SLOP 以内の震えなら押したことになる */
  const synth = (dy) => page.evaluate((dy) => {
    const b = [...document.querySelectorAll("#screen-todo .tl-row .check:not(.is-sub)")]
      .find((x) => x.getAttribute("aria-checked") === "false"
        && x.getBoundingClientRect().top > 100 && x.getBoundingClientRect().bottom < 700);
    const sw = b.querySelector(".feel-switch");
    const r = sw.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const t = (yy) => new Touch({ identifier: 7, target: sw, clientX: x, clientY: yy });
    sw.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 7 }));
    sw.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t(y)], changedTouches: [t(y)] }));
    sw.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, touches: [t(y + dy)], changedTouches: [t(y + dy)] }));
    sw.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [t(y + dy)] }));
    sw.click();
    return b.getAttribute("aria-label");
  }, dy);
  const doneCount = () => page.evaluate(() => KN.store.get().todos.filter((t) => t.done).length);
  await page.waitForTimeout(1500);   // 上の送りの惰性が止まるまで（止まらないと scroll の印が立つ）
  let n0 = await doneCount();
  await synth(40);
  await page.waitForTimeout(1500);
  c.check("指が 40px 動いたら（ほかの印なし）押したことにしない", (await doneCount()) === n0);
  n0 = await doneCount();
  await synth(4);
  await page.waitForTimeout(1500);
  c.check("指先の震え（4px）なら押したことになる", (await doneCount()) === n0 + 1);

  c.check("ページのエラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})().catch((e) => { console.error(e); process.exit(1); });
