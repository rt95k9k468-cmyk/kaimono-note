/* 字を選んでいる指は送らない（KN.util.selecting、docs/traps.md「選んでいる指は送らない」）。どれも本物のタッチ。

   時計を 2026年10月6日(火) 12:34 に止め、daily に時刻ごとの日記の一件（吹き出し）を置く。
   - 吹き出しの字を選んだまま払っても日は動かない（選択も残る）
   - 払いの途中で選びはじめたら、紙は元の位置へ戻り、日は動かない
   - カーソルを持った打つ欄の上から払っても日は動かない
   - 選択を解けば、ふだんどおり払える
   - 暦（週）も同じ：選んだまま払っても週は動かず、解けば動く */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("select-no-swipe");
  const { browser, ctx, page, errors } = await open({
    before: async (cx, pg) => { await pg.clock.setFixedTime(new Date(2026, 9, 6, 12, 34)); },
  });
  await page.evaluate(() => {
    const P = KN.diaryPosts, d = KN.util.todayKey();
    KN.store.setDayLog(d, { memo: P.add("", "選ぶ字のための一件です。", P.mark(new Date(2026, 9, 6, 9, 5), d)).memo });
    KN.store.setCalPref(null, { shown: true, open: false });
    KN.app.showScreen("archive");
  });
  await page.waitForTimeout(900);

  const title = () => page.evaluate(() =>
    document.querySelector("#head .js-day-title").textContent.replace(/\s+/g, ""));
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent",
    { type, touchPoints: type === "touchEnd" ? [] : pts(x, y) });
  /** 本物のタッチで横へなぞる。mid … 途中（半分）で一度呼ぶ。 */
  const swipe = async (p, dx, mid) => {
    await touch("touchStart", p.x, p.y);
    for (let i = 1; i <= 12; i++) {
      await touch("touchMove", p.x + dx * i / 12, p.y + i % 2);
      await page.waitForTimeout(16);
      if (i === 6 && mid) await mid();
    }
    await touch("touchEnd");
    await page.waitForTimeout(800);
  };
  const selectIn = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    getSelection().selectAllChildren(el);
    return !getSelection().isCollapsed;
  }, sel);
  const unselect = () => page.evaluate(() => getSelection().removeAllRanges());
  const BUBBLE = "#screen-archive .arc-post .arc-post-text";
  const at = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);

  c.check("吹き出しがある", !!(await page.$(BUBBLE)));
  const day0 = await title();
  let p = await at(BUBBLE);

  c.check("吹き出しの字を選べる", await selectIn(BUBBLE));
  await swipe(p, -200);
  c.check("選んだまま払っても日は動かない", (await title()) === day0, await title());
  c.check("選択は残る", await page.evaluate(() => !getSelection().isCollapsed));

  await unselect();
  let moved = 0;
  await swipe(p, -220, async () => {
    moved = await page.evaluate(() => {
      const t = document.querySelector("#screen-archive .day-track");
      return t ? Math.abs(new DOMMatrix(getComputedStyle(t).transform).m41) : 0;
    });
    await selectIn(BUBBLE);
  });
  c.check("払いは動きだしていた", moved > 20, moved);
  c.check("途中で選びはじめたら日は動かない", (await title()) === day0, await title());
  const rest = await page.evaluate(() => {
    const t = document.querySelector("#screen-archive .day-track");
    return { x: t ? new DOMMatrix(getComputedStyle(t).transform).m41 : 0,
      peeks: document.querySelectorAll("#screen-archive .day-slide.is-peek").length };
  });
  c.check("紙は元の位置へ戻る", Math.abs(rest.x) < 1 && rest.peeks === 0, JSON.stringify(rest));

  await unselect();
  await page.evaluate((s) => {
    const f = document.createElement("textarea");
    f.className = "js-test-field";
    f.value = "カーソルの欄";
    f.style.cssText = "display:block;width:100%;height:60px";
    document.querySelector(s).closest(".arc-post").after(f);
    f.focus();
    f.setSelectionRange(2, 2);
  }, BUBBLE);
  await swipe(await at(".js-test-field"), -200);
  c.check("カーソルを持った欄の上から払っても日は動かない", (await title()) === day0, await title());
  await page.evaluate(() => { const f = document.querySelector(".js-test-field"); f.blur(); f.remove(); });

  p = await at(BUBBLE);
  await swipe(p, -200);
  const day1 = await title();
  c.check("選択を解けば払える（次の日）", day1 !== day0 && day1.includes("7日"), day1);

  await swipe(p, 200);                     // 吹き出しのある日へ戻る
  c.check("前の日へ戻れる", (await title()) === day0, await title());

  /* ---- 暦（週） ---- */
  const week = () => page.evaluate(() => [...document.querySelectorAll("#head .cal-day, #screen-archive .cal-day")]
    .filter((d) => d.offsetParent).map((d) => d.dataset.date || d.textContent.trim()).join(","));
  const calAt = await page.evaluate(() => {
    const g = [...document.querySelectorAll(".cal-grid, .cal-week")].find((x) => x.offsetParent);
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  c.check("週の暦が出ている", !!calAt);
  if (calAt) {
    const w0 = await week();
    c.check("暦：吹き出しの字を選べる", await selectIn(BUBBLE));
    await swipe(calAt, -220);
    c.check("暦：選んだまま払っても週は動かない", (await week()) === w0);
    await unselect();
    await swipe(calAt, -220);
    c.check("暦：選択を解けば週が動く", (await week()) !== w0);
  }

  c.check("頁のエラーなし", errors.length === 0, errors.join(" / "));
  c.done();
  await browser.close();
})();
