/* 今日の面の物差し・段3の操作（docs/timeline-scale-design.md の §5・§6-3(a)）。
   - 手順はその場の小窓に出る（2026年10月21日）。札は動かない・下の札も押し下げない。組み直しても小窓は残る。
   - 長押しで動かす：指の高さ → 時刻（5分きざみ）を y の逆で引く。
   - 時刻が変わって並びが動いた札は、もといた場所から滑る（flipRows の translate）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/tl-ops.js */
const { open, checker } = require("./lib");

const DAY = "2026-10-20";

(async () => {
  const c = checker("tl-ops");
  const { browser, page, errors } = await open({
    before: async (ctx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 20, 7, 0)); },
  });
  await page.evaluate((day) => {
    const s = KN.store;
    s.addTodo({ title: "朝のしたく", due: day, time: "09:00", minutes: 60,
                subs: ["顔", "着替え", "朝ごはん", "歯", "鞄"].map((x) => ({ title: x })) });
    s.addTodo({ title: "会議", due: day, time: "10:00", minutes: 60 });
    s.addTodo({ title: "昼ごはん", due: day, time: "12:00", minutes: 30 });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(600);

  const box = (w) => page.evaluate((w) => {
    const li = [...document.querySelectorAll("#screen-todo .tl-list > li.tl-row")].find((x) => x.textContent.includes(w));
    if (!li) return null;
    // 一覧の頭からの位置で比べる（ひらく押しで画面が送られても揺れない）。
    const o = li.parentElement.getBoundingClientRect().top;
    const r = li.getBoundingClientRect();
    const wrap = li.querySelector(".tl-sub-wrap");
    const wr = wrap && getComputedStyle(wrap).display !== "none" ? wrap.getBoundingClientRect() : null;
    return { top: r.top - o, bottom: r.bottom - o, left: r.left, y: r.top, wrapBottom: wr ? wr.bottom - o : null, time: li.dataset.at };
  }, w);

  const a0 = await box("朝のしたく"), b0 = await box("会議");
  c.check("閉じているとき：9時の札の下端＝10時の札の頭", a0 && b0 && Math.abs(a0.bottom - b0.top) < 3, JSON.stringify([a0, b0]));

  await page.click('#screen-todo .tl-row:has-text("朝のしたく") .tl-subs-chip');
  await page.waitForTimeout(800);
  const a1 = await box("朝のしたく"), b1 = await box("会議");
  const pop1 = await page.evaluate(() => document.querySelectorAll(".note-pop.is-subs.is-open .tl-sub").length);
  c.check("ひらくと手順は小窓に出る（5件）・札の下には広げない", pop1 === 5 && a1.wrapBottom == null, JSON.stringify({ pop1, a1 }));
  c.check("札も下の札も動かない", Math.abs(a1.bottom - a0.bottom) < 1 && Math.abs(b1.top - b0.top) < 1,
    JSON.stringify([a0, a1, b0, b1]));

  // 手順を一つ済ませる → 組み直し。押し下げたままで、跳ねない。
  await page.evaluate((day) => {
    const t = KN.store.get().todos.find((x) => x.title === "朝のしたく");
    KN.store.toggleSub(t.id, t.subs[0].id, day);
  }, DAY);
  await page.waitForTimeout(80);
  const a2 = await box("朝のしたく"), b2 = await box("会議");
  const pop2 = await page.evaluate(() => !!document.querySelector(".note-pop.is-subs.is-open"));
  c.check("組み直しても小窓は残り、札は動かない", pop2 && Math.abs(b2.top - b1.top) < 1 && Math.abs(a2.bottom - a1.bottom) < 1, JSON.stringify([a2, b2, b1]));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const a2b = await box("朝のしたく");
  c.check("閉じると手順は札へ戻る（畳んだまま）・小窓は消える",
    a2b.wrapBottom == null && await page.evaluate(() => !document.querySelector(".note-pop.is-subs")
      && !!document.querySelector("#screen-todo .tl-sub-list[hidden]")), JSON.stringify(a2b));

  /* 長押しで動かす。会議（いま押し下がっている）を、指の高さ＝12:35 あたりへ。
     端で送らないよう、先に一覧の頭を画面の上のほうへ。 */
  await page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
    const list = document.querySelector("#screen-todo .tl-list");
    sc.scrollTop += list.getBoundingClientRect().top - 140;
  });
  await page.waitForTimeout(100);
  const target = await page.evaluate(() => {
    const list = document.querySelector("#screen-todo .tl-list");
    const L = list.__tl, r = list.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(list).paddingTop);
    return { x: r.left + 200, y: r.top + pad + L.y(12 * 60 + 36) };
  });
  const sc = await page.evaluate(() => KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop);
  const g = await box("会議");
  await page.mouse.move(g.left + 60, g.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(520);
  const lifted = await page.evaluate(() => !!document.querySelector("#screen-todo .tl-row.is-lifted"));
  c.check("長押しで持ち上がる", lifted);
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(target.x, g.y + 20 + (target.y - (g.y + 20)) * k / 8);
    await page.waitForTimeout(30);
  }
  const label = await page.evaluate(() => (document.querySelector(".tl-aim .tl-band-time") || {}).textContent || "");
  const sc2 = await page.evaluate(() => KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop);
  c.check("狙いの札は5分きざみで、指の高さの時刻（12:35）", sc === sc2 && label === "12:35", `${label} scroll ${sc}→${sc2}`);
  // 滑りの印：並びが変わった札に translate が入るかを見張る。
  await page.evaluate(() => {
    window.__flip = [];
    const mo = new MutationObserver((ms) => ms.forEach((m) => {
      const el = m.target;
      if (el.classList && el.classList.contains("tl-row") && /translateY\((?!0)/.test(el.style.transform)) window.__flip.push(el.textContent.slice(0, 8));
    }));
    mo.observe(document.querySelector("#screen-todo .tl-list").closest(".screen") || document.body, { attributes: true, attributeFilter: ["style"], subtree: true });
  });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const moved = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "会議").time);
  c.check("離すと、狙いの時刻に置く（5分きざみ）", moved === "12:35", String(moved));
  const flips = await page.evaluate(() => window.__flip);
  c.check("置き直した札は、もといた場所から滑る（flipRows）", flips.length > 0, JSON.stringify(flips));

  const a3 = await box("朝のしたく");
  c.check("札は時間どおりの高さのまま（1時間＝72px）", Math.abs((a3.bottom - a3.top) - (a0.bottom - a0.top)) < 2, JSON.stringify([a0, a3]));

  c.check("ページのエラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
