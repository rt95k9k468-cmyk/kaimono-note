/* 記録の紙でメモを打つときは、メモ欄だけ（2026年10月6日・利用者「メモ欄が狭すぎる」）。
   - 日付は一行（字と欄が横に並ぶ）
   - キーボードを出してメモを打つと、札・日付・「メモ」の字が畳まれ、メモ欄が大きくなる
   - キーボードを下げれば元に戻る
   visualViewport は偽物に差し替えて、キーボードの高さを外から決める（tabbar-kb と同じ）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/card-memo-kb.js */
const { open, checker } = require("./lib");

const H = 844;

(async () => {
  const c = checker("card-memo-kb");
  const { browser, page, errors } = await open({
    viewport: { width: 390, height: H },
    before: async (ctx) => {
      await ctx.addInitScript(() => {
        const real = window.visualViewport;
        let fake = null;
        const vv = new Proxy(real, {
          get(t, k) {
            if (fake && k === "height") return fake.h;
            if (fake && k === "offsetTop") return 0;
            const v = Reflect.get(t, k);
            return typeof v === "function" ? v.bind(t) : v;
          },
        });
        Object.defineProperty(window, "visualViewport", { get: () => vv, configurable: true });
        const ih = window.innerHeight;
        Object.defineProperty(window, "innerHeight", {
          get: () => (fake ? fake.inner : ih), configurable: true,
        });
        window.__kb = (f) => { fake = f; real.dispatchEvent(new Event("resize")); };
      });
    },
  });

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);
  await page.click("#screen-archive .js-open-add, .js-open-add");
  await page.waitForTimeout(700);
  await page.click('.sheet.is-card .arc-pick-b[data-t="seed"]');
  await page.waitForTimeout(200);

  const look = () => page.evaluate(() => {
    const s = document.querySelector(".sheet.is-card");
    const r = (q) => { const el = s.querySelector(q); return el ? el.getBoundingClientRect() : null; };
    const shown = (q) => { const el = s.querySelector(q); return !!el && el.getClientRects().length > 0; };
    return {
      label: r(".arc-date-field > .field-label"), date: r(".js-date"),
      pick: shown(".js-pick"), dateShown: shown(".js-date"),
      memoLabel: shown(".arc-memo-field > .field-label"),
      ta: r(".js-memo"), sheet: s.getBoundingClientRect(),
    };
  });

  const a = await look();
  c.check("日付は一行（字と欄が横に並ぶ）",
    Math.abs((a.label.top + a.label.bottom) / 2 - (a.date.top + a.date.bottom) / 2) < 4 && a.label.right <= a.date.left);

  // キーボード：可視 460（iOS 26 型、床は残る）
  await page.focus(".sheet.is-card .js-memo");
  await page.evaluate(() => window.__kb({ h: 460, inner: 460 }));
  await page.waitForTimeout(700);
  const b = await look();
  c.check("打っているあいだ札は畳まれる", !b.pick);
  c.check("…日付も畳まれる", !b.dateShown);
  c.check("…「メモ」の字も畳まれる", !b.memoLabel);
  c.check("…メモ欄は紙の半分より高い", b.ta.height > b.sheet.height * 0.5,
    `メモ ${Math.round(b.ta.height)} / 紙 ${Math.round(b.sheet.height)}`);
  c.check("…メモ欄はキーボードの上に収まる", b.ta.bottom <= 460 + 1, `底 ${Math.round(b.ta.bottom)}`);

  await page.evaluate(() => document.activeElement.blur());
  await page.evaluate(() => window.__kb(null));
  await page.waitForTimeout(700);
  const d = await look();
  c.check("キーボードを下げれば札と日付が戻る", d.pick && d.dateShown && d.memoLabel);

  c.check("エラー0", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
