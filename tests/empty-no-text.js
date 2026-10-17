/* 空の画面に説明の一文を置かない（roadmap-3.2 の H2。2026年10月17日）。買うもの・価格の二つ。
   題には text-wrap: balance（「す。」だけの行を作らない）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/empty-no-text.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("empty-no-text");
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const { browser, page, errors } = await open({ viewport: vp });
    for (const name of ["list", "prices"]) {
      await page.evaluate((n) => KN.app.showScreen(n), name);
      await page.waitForTimeout(700);
      const r = await page.evaluate((n) => {
        const scr = document.querySelector(`#screen-${n}`);
        const t = scr.querySelector(".empty .empty-title");
        return { empty: !!scr.querySelector(".empty"), text: !!scr.querySelector(".empty-text"),
          wrap: t ? getComputedStyle(t).textWrap : "" };
      }, name);
      c.check(`${name} ${vp.width}：空の画面が出る`, r.empty);
      c.check(`${name} ${vp.width}：説明の一文は出さない`, !r.text);
      c.check(`${name} ${vp.width}：題は balance`, r.wrap === "balance", r.wrap);
    }
    c.check(`エラーなし ${vp.width}`, errors.length === 0, errors.join("|"));
    await browser.close();
  }
  c.done();
})();
