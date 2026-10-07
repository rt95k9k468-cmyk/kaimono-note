/* ホーム画面のアプリの高さ（2026年10月7日。docs/sky.md の「時計の帯」）。
   時計の帯の下まで描く版（black-translucent）で、iOS 26 が可視も innerHeight も時計の帯ぶん
   短く返し、タブ欄と紙の底が浮いていた。見るのは：
   - 帯が 47px・可視と innerHeight が 47px 短いとき、シェルは本当の底まで（fixed の床が底に
     ある端末／床も短く、画面そのもので知る端末の両方）。タブ欄は画面の底、文書は動かない
   - 打っているあいだは可視のまま（キーボードの扱いは前と同じ）
   - 帯が 0（「default」で入れた古いアプリ）・ホーム画面のアプリでない（ブラウザ）は前と同じ
   visualViewport・innerHeight・screen・navigator.standalone は偽物に差し替える。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/home-app-height.js */
const { open, checker } = require("./lib");

const H = 844;
const BAND = 47;

async function run(c, name, { viewportH, screenH, standalone, band }) {
  const { browser, page, errors } = await open({
    viewport: { width: 390, height: viewportH },
    before: async (ctx) => {
      await ctx.addInitScript(([short, sh, sa]) => {
        const real = window.visualViewport;
        const vv = new Proxy(real, {
          get(t, k) {
            if (k === "height") return short;
            if (k === "offsetTop") return 0;
            const v = Reflect.get(t, k);
            return typeof v === "function" ? v.bind(t) : v;
          },
        });
        Object.defineProperty(window, "visualViewport", { get: () => vv, configurable: true });
        Object.defineProperty(window, "innerHeight", { get: () => short, configurable: true });
        Object.defineProperty(window.screen, "height", { get: () => sh, configurable: true });
        Object.defineProperty(window.screen, "width", { get: () => 390, configurable: true });
        if (sa) Object.defineProperty(navigator, "standalone", { get: () => true, configurable: true });
        window.__fit = () => real.dispatchEvent(new Event("resize"));
      }, [H - BAND, screenH, standalone]);
    },
  });
  await page.addStyleTag({ content: `:root { --safe-t: ${band}px !important; }` });
  await page.evaluate(() => window.__fit());
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => {
    const app = document.getElementById("app");
    const bar = document.getElementById("tabbar");
    return {
      app: Math.round(app.getBoundingClientRect().height),
      appTop: Math.round(app.getBoundingClientRect().top),
      bar: Math.round(bar.getBoundingClientRect().bottom),
      pinned: document.documentElement.classList.contains("is-pinned"),
      pos: getComputedStyle(app).position,
      scroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
  const typed = await page.evaluate(async () => {
    const f = document.createElement("input");
    document.body.append(f);
    f.focus();
    window.__fit();
    await new Promise((r) => setTimeout(r, 100));
    const out = { app: Math.round(document.getElementById("app").getBoundingClientRect().height),
                  pinned: document.documentElement.classList.contains("is-pinned") };
    f.blur(); f.remove();
    window.__fit();
    return out;
  });
  await browser.close();
  return { m, typed, errors };
}

(async () => {
  const c = checker("home-app-height");

  for (const [label, viewportH] of [["fixed の床が底にある", H], ["床も短い（画面で知る）", H - BAND]]) {
    const { m, typed, errors } = await run(c, label, { viewportH, screenH: H, standalone: true, band: BAND });
    c.check(`${label}：シェルは画面の底まで（${H}px）`, m.app === H && m.appTop === 0, JSON.stringify(m));
    c.check(`${label}：タブ欄の下の端が画面の底`, Math.abs(m.bar - H) <= 1, JSON.stringify(m));
    c.check(`${label}：シェルは画面に貼りつく（文書は 1px より動かない）`, m.pinned && m.pos === "fixed" && m.scroll <= 1, JSON.stringify(m));
    c.check(`${label}：打っているあいだは可視の高さのまま`, typed.app === H - BAND && !typed.pinned, JSON.stringify(typed));
    c.check(`${label}：ページのエラーが無い`, errors.length === 0, errors.join(" / "));
  }

  const old = await run(c, "古いアプリ", { viewportH: H - BAND, screenH: H, standalone: true, band: 0 });
  c.check("帯が 0（default で入れた古いアプリ）は前と同じ（可視の高さ・貼りつけない）", old.m.app === H - BAND && !old.m.pinned, JSON.stringify(old.m));
  const web = await run(c, "ブラウザ", { viewportH: H - BAND, screenH: H, standalone: false, band: BAND });
  c.check("ホーム画面のアプリでなければ前と同じ", web.m.app === H - BAND && !web.m.pinned, JSON.stringify(web.m));
  c.done();
})();
