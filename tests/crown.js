/* 最安の王冠は比べたときだけ（docs/log/design-review.md の Y8。2026年10月21日）。
   - 値段が一つの店だけの品物：買うものの行・価格の行と升に王冠は無く、店の名前だけ。紙の頭に「最安」と言わない
   - 二つの店に値段がある品物：安いほうの店に王冠。紙の頭は「最安 店 値段」
   F5（11月12日）：店で絞る札（S1）・鍵盤の税抜と率（S3）・前回との差とこれまでの最安（S4）も。
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
  for (const [layout, screen, sel] of [["rows", "list", ".item"], ["rows", "prices", ".product"]]) {
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

  /* ---- F5 の S1・S3・S4（docs/shopping.md「S1〜S4」） ---- */
  const wait = (ms) => page.waitForTimeout(ms);
  /* S3 税抜で打って税込で持つ：食パン（店A ¥158）の紙で、店B（まだ値段の無い店）に 100 を税抜で。率の札で 8%⇄10%。 */
  await page.evaluate((id) => { KN.productSheet.open(id); }, ids.one);
  await wait(700);
  const rate0 = await page.evaluate((id) => Math.round(KN.store.taxRate(KN.store.getProduct(id)) * 100), ids.one);
  await page.click(".sheet.is-open .price-add .js-price");
  await wait(400);
  const key = (k) => page.locator(".keypad .js-grid .key", { hasText: new RegExp(`^${k}$`) }).click();
  for (const k of ["1", "0", "0"]) await key(k);
  const padKeys = await page.$$eval(".keypad .keypad-actions .key", (x) => x.map((e) => e.textContent.trim()));
  t.check("S3：鍵盤に「税抜」と率の札（前の 税+8%・税+10% は無い）", padKeys[0] === "税抜" && padKeys[1] === `${rate0}%` && !padKeys.some((k) => /\+\d+%/.test(k)), JSON.stringify(padKeys));
  await page.click(".keypad .js-net");
  await wait(200);
  const out = () => page.$eval(".sheet.is-open .js-calc-out", (e) => e.textContent);
  const taxed = (r) => `税込 ¥${Math.floor(100 * (1 + r / 100))}`;
  const o1 = await out();
  t.check("S3：税抜を押すと読みは税込", o1.includes(taxed(rate0)), o1);
  t.check("S4：入れた値段が前回（店A ¥158）より安いと言う", /前回より ¥\d+ 安い/.test(o1), o1);
  await page.click(".keypad .js-rate");
  await wait(200);
  const rate1 = rate0 === 8 ? 10 : 8;
  const o2 = await out();
  t.check("S3：率の札で率が替わる", o2.includes(taxed(rate1)) && (await page.$eval(".keypad .js-rate", (e) => e.textContent.trim())) === `${rate1}%`, o2);
  await page.click(".sheet.is-open .price-add .js-add");
  await wait(600);
  const saved = await page.evaluate((id) => {
    const S = KN.store, p = S.getProduct(id), b = S.get().stores.find((x) => x.name === "試しの店B");
    const pr = S.priceAt(p, b.id);
    return { price: pr && pr.price, rate: Math.round(S.taxRate(p) * 100), keys: Object.keys(pr || {}).sort().join(",") };
  }, ids.one);
  t.check("S3：保存は税込の一つの数（記録の形は同じ）・品の率は直したほう", saved.price === Math.floor(100 * (1 + rate1 / 100))
    && saved.rate === rate1 && saved.keys === "amount,date,id,price,storeId", JSON.stringify(saved));
  await page.keyboard.press("Escape");
  await wait(600);
  /* S4 底値の一言：記録が二つ以上なら「これまでの最安 ¥◯（店・日）」。 */
  await page.evaluate((id) => { KN.productSheet.open(id); }, ids.one);
  await wait(700);
  const low = await page.$eval(".sheet.is-open .pd-low", (e) => e.textContent.replace(/\s+/g, " ")).catch(() => "");
  t.check("S4：これまでの最安（店・日）", low.includes(`これまでの最安 ¥${saved.price}`) && low.includes("試しの店B"), low);
  await page.keyboard.press("Escape");
  await wait(600);

  /* S1 店で絞る：紙の頭に すべて｜店…。店を押すと、その店が最安の品と値段の無い品だけ（数は旅ぜんぶのまま）。 */
  await page.evaluate(() => { const p = KN.store.addProduct({ name: "卵" }); KN.store.addItem(p.id); KN.app.showScreen("list"); });
  await wait(700);
  const names = () => page.$$eval("#screen-list .sh-main .item-wrap .item-name", (x) => x.map((e) => e.textContent.trim()).sort().join(","));
  const chips = await page.$$eval("#screen-list .shop-stores .chip", (x) => x.map((e) => e.textContent.trim()));
  t.check("S1：紙の頭に すべて｜店 の札", chips[0] === "すべて" && chips.includes("試しの店A") && chips.includes("試しの店B"), JSON.stringify(chips));
  const chip = async (l) => { await page.locator("#screen-list .shop-stores .chip", { hasText: l }).click(); await wait(500); };
  const n0 = await page.$eval("#screen-list .face-n", (e) => e.textContent);
  await chip("試しの店A");
  const atA = await names();
  await chip("試しの店B");
  const atB = await names();
  const all3 = ["牛乳", "卵", "食パン"].sort().join(",");   // 食パンの最安は上の S3 で店B へ移った
  t.check("S1：店ごとに、その店が最安の品と値段の無い品だけ", atA === "卵" && atB === all3, `${atA} | ${atB}`);
  t.check("S1：絞っても品数は旅ぜんぶ", (await page.$eval("#screen-list .face-n", (e) => e.textContent)) === n0);
  await chip("試しの店B");
  await chip("試しの店A");
  await chip("試しの店A");
  t.check("S1：同じ札をもう一度押すと すべて", (await names()) === all3
    && (await page.$eval("#screen-list .shop-stores .chip[aria-pressed=true]", (e) => e.textContent.trim())) === "すべて");
  t.check("頁のエラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})();
