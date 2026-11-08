/* 暦の日の一度きり（js/moment.js・docs/motion.md の「暦の日の一度きり」）。
   - 節気の初日（2026年11月7日 立冬）は、帯に雪が一度だけ流れ、終われば外れる。読み直しても二度目は出ない
   - 祝日（2026年11月3日 文化の日）は光が一度渡る
   - ふつうの日（2026年11月10日）は何も出ない
   - 動きを減らす設定では出さない（見たことにはする）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/moment.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("moment");
  const at = (iso, extra = {}) => open({ moment: true, ...extra,
    before: async (ctx, page) => { await page.clock.install({ time: new Date(iso) }); } });
  const layer = (page) => page.evaluate(() => {
    const m = document.querySelector("#head > .moment");
    return m ? { cls: m.className, n: m.children.length, hidden: m.getAttribute("aria-hidden") } : null;
  });
  const seen = (page) => page.evaluate(() => localStorage.getItem("kn-moment-seen"));
  const all = [];

  {
    const { browser, page, errors } = await at("2026-11-07T12:00:00Z");
    await page.waitForTimeout(2200);
    const m = await layer(page);
    t.check("節気の初日（立冬）は、帯に雪が流れる", m && /is-snow/.test(m.cls) && m.n === 18 && m.hidden === "true", JSON.stringify(m));
    t.check("見た日を覚える", (await seen(page)) === "2026-11-07", await seen(page));
    t.check("動くのは transform と opacity だけ", await page.evaluate(() => [...document.querySelectorAll("#head > .moment > i")]
      .every((g) => g.getAnimations().every((a) => a.effect.getKeyframes().every((k) => Object.keys(k)
        .every((p) => ["transform", "opacity", "offset", "easing", "composite", "computedOffset"].includes(p)))))));
    await page.waitForTimeout(4600);
    t.check("終われば外れる", (await layer(page)) === null);
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.app);
    await page.waitForTimeout(2200);
    t.check("読み直しても二度目は出ない", (await layer(page)) === null);
    all.push(...errors);
    await browser.close();
  }
  {
    const { browser, page, errors } = await at("2026-11-03T12:00:00Z");
    await page.waitForSelector("#head > .moment", { state: "attached", timeout: 5000 }).catch(() => {});
    const m = await layer(page);
    t.check("祝日（文化の日）は光が一度渡る", m && /is-light/.test(m.cls) && m.n === 1, JSON.stringify(m));
    all.push(...errors);
    await browser.close();
  }
  {
    const { browser, page, errors } = await at("2026-11-10T12:00:00Z");
    await page.waitForTimeout(2000);
    t.check("ふつうの日は何も出ない", (await layer(page)) === null && (await seen(page)) === null);
    t.check("季節の粒の割り当て", await page.evaluate(() => ["petal", "petal", "leaf", "maple", "snow"].join() ===
      [0, 22, 5, 12, 18].map((s) => KN.moment.grainOf(s)).join()));
    all.push(...errors);
    await browser.close();
  }
  {
    const { browser, page, errors } = await at("2026-11-07T12:00:00Z", { moment: false });   // 開いたときには流さず、手で呼ぶ
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => localStorage.removeItem("kn-moment-seen"));
    await page.evaluate(() => KN.moment.maybe());
    t.check("動きを減らす設定では出さない（見たことにはする）", (await layer(page)) === null && (await seen(page)) === "2026-11-07");
    all.push(...errors);
    await browser.close();
  }
  t.check("エラーが出ない", !all.length, all.join(" / "));
  t.done();
})();
