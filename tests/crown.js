/* 最安の王冠は比べたときだけ（docs/log/design-review.md の Y8。2026年10月21日）。
   - 値段が一つの店だけの品物：買うものの行・価格の行と升に王冠は無く、店の名前だけ。紙の頭に「最安」と言わない
   - 二つの店に値段がある品物：安いほうの店に王冠。紙の頭は「最安 店 値段」
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/crown.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("crown");
  const { browser, page, errors } = await open();
  const ids = await page.evaluate(() => {
    const S = KN.store;
    const [a, b] = ["試しの店A", "試しの店B"].map((n) => S.addStore(n));
    const one = S.addProduct({ name: "食パン" });
    const two = S.addProduct({ name: "牛乳" });
    S.addPrice(one.id, { storeId: a.id, price: 158, amount: 1 });
    S.addPrice(two.id, { storeId: a.id, price: 215, amount: 1 });
    S.addPrice(two.id, { storeId: b.id, price: 198, amount: 1 });
    S.addItem(one.id); S.addItem(two.id);
    return { one: one.id, two: two.id };
  });
  /* 行・升の中の店の名前と王冠。名前で行を探す。 */
  const rows = (sel) => page.evaluate((sel) => [...document.querySelectorAll(`.screen.is-active ${sel}`)].map((r) => ({
    text: r.textContent.replace(/\s+/g, " ").trim(),
    crown: !!r.querySelector(".crown"),
  })), sel);
  const find = (list, name) => list.find((r) => r.text.includes(name));

  /* 買うものの升は店の名前を出さない（値段だけ）ので、行だけ見る。 */
  for (const [layout, screen, sel] of [["rows", "list", ".item"], ["rows", "prices", ".product"], ["tiles", "prices", ".product"]]) {
    await page.evaluate((l) => KN.store.update((st) => { st.settings.layout = l; }), layout);
    await page.evaluate((id) => KN.app.showScreen(id), screen);
    await page.waitForTimeout(600);
    const list = await rows(sel);
    const one = find(list, "食パン"), two = find(list, "牛乳");
    t.check(`${layout}・${screen}：一つの店の品物に王冠が無い`, !!one && !one.crown && one.text.includes("試しの店A"), JSON.stringify(one));
    t.check(`${layout}・${screen}：二つの店の品物は安いほうに王冠`, !!two && two.crown && two.text.includes("試しの店B"), JSON.stringify(two));
  }
  const cap = async (id) => {
    await page.evaluate((id) => { KN.productSheet.open(id); }, id);
    await page.waitForTimeout(700);
    const c = await page.evaluate(() => {
      const s = [...document.querySelectorAll(".sheet.is-open")].pop();
      return {
        known: s && (s.querySelector(".pd-hero .js-cap") || {}).textContent || "",
        crowns: s ? s.querySelectorAll(".price-row .crown").length : -1,
      };
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    return c;
  };
  const c1 = await cap(ids.one);
  t.check("紙：一つの店なら「最安」と言わず、王冠も無い", !/最安/.test(c1.known) && /試しの店A/.test(c1.known) && c1.crowns === 0, JSON.stringify(c1));
  const c2 = await cap(ids.two);
  t.check("紙：二つの店なら「最安 試しの店B」と王冠が一つ", /^最安 試しの店B/.test(c2.known) && c2.crowns === 1, JSON.stringify(c2));
  t.check("頁のエラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})();
