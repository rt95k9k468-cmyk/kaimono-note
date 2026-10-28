/* 書いているあいだは画面を消さない（js/app.js の watchWriting。docs/thinking.md の「書いているあいだ」）。
   - 欄に入ると Screen Wake Lock を持つ。字が増える（音声入力も input）たびに5分を数え直す
   - 欄を出る・最後に字が増えてから5分・隠れると手放す。戻って欄にいれば持ち直す
   - 欄にいないときは持たない
   机の上の Chromium では、偽の `navigator.wakeLock` と進める時計で試す。日記の字は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/write-awake.js */
const { open, checker } = require("./lib");

const t = checker("write-awake");

(async () => {
  const { browser, page, errors } = await open({
    before: async (cx, p) => {
      await p.clock.install({ time: new Date(2026, 9, 6, 12, 0) });
      await cx.addInitScript(() => {
        const w = window.__wl = { held: 0, req: 0, last: null };
        const wl = {
          request() {
            w.req++;
            const fns = new Set();
            const s = {
              released: false,
              release() {
                if (!s.released) { s.released = true; w.held--; fns.forEach((f) => f()); }
                return Promise.resolve();
              },
              addEventListener(type, f) { if (type === "release") fns.add(f); },
            };
            w.held++;
            w.last = s;
            return Promise.resolve(s);
          },
        };
        Object.defineProperty(navigator, "wakeLock", { value: wl, configurable: true });
      });
    },
  });
  const wl = () => page.evaluate(() => ({ held: window.__wl.held, req: window.__wl.req }));
  const tick = () => page.waitForTimeout(150);
  /* 隠れる・戻る（ブラウザは隠れると自分で手放す）。 */
  const setVis = (v) => page.evaluate((vis) => {
    Object.defineProperty(document, "visibilityState", { value: vis, configurable: true });
    if (vis === "hidden" && window.__wl.last) window.__wl.last.release();
    document.dispatchEvent(new Event("visibilitychange"));
  }, v);

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);
  t.check("欄にいないときは持たない", (await wl()).held === 0, JSON.stringify(await wl()));

  await page.click("#screen-archive .js-think-write");
  await page.waitForSelector(".sheet.is-open.is-card .js-memo", { timeout: 4000 });
  await tick();
  t.check("日記の書く紙の欄に入ると持つ", (await wl()).held === 1, JSON.stringify(await wl()));

  await page.keyboard.type("試験の字");
  await tick();
  t.check("打っても二つ目は取らない", (await wl()).held === 1 && (await wl()).req === 1, JSON.stringify(await wl()));

  /* 音声入力：手は触れず、字だけが増えつづける。4分ごとに字が来れば、10分たっても持ったまま。 */
  for (let i = 0; i < 3; i++) {
    await page.clock.runFor(4 * 60 * 1000);
    await page.evaluate(() => {
      const m = document.querySelector(".sheet.is-open .js-memo");
      m.value += "話した字";
      m.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await tick();
  t.check("字が増えつづけるあいだは持ったまま（音声入力）", (await wl()).held === 1, JSON.stringify(await wl()));

  await page.clock.runFor(5 * 60 * 1000 + 1000);
  await tick();
  t.check("最後に字が増えてから5分で手放す", (await wl()).held === 0, JSON.stringify(await wl()));

  await page.keyboard.type("続き");
  await tick();
  t.check("また打てば持ち直す", (await wl()).held === 1, JSON.stringify(await wl()));

  await setVis("hidden");
  await tick();
  t.check("隠れると手放す", (await wl()).held === 0, JSON.stringify(await wl()));
  await setVis("visible");
  await tick();
  t.check("戻って欄にいれば持ち直す", (await wl()).held === 1, JSON.stringify(await wl()));

  await page.click(".sheet.is-open .js-ok");
  await page.waitForFunction(() => !document.querySelector("#sheet-root .sheet"), null, { timeout: 4000 }).catch(() => {});
  await tick();
  t.check("紙を閉じて欄を出ると手放す", (await wl()).held === 0, JSON.stringify(await wl()));

  t.check("頁のエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
