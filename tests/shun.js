/* 旬の印（docs/roadmap-3.1.md の K4。js/shun.js）。
   - 表：鍵はどれも絵の辞書にある・月は 1〜12・名前から引いた答え（年をまたぐ・二つの季節・
     束ねた鍵は言葉で・束の名だけや通年のものは出さない）
   - 画面：品物の紙の頭の一行に「旬 9〜10月」。値段があれば最安と並ぶ。名前を直すと引き直す。
     行には出さない
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/shun.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("shun");
  const { browser, page, errors } = await open();

  const table = await page.evaluate(() => {
    const keys = new Set([...KN.productIcons.list().map((x) => x.key), ...Object.keys(KN.productIcons.LABELS)]);
    const all = [...Object.keys(KN.shun.BY_KEY), ...Object.keys(KN.shun.BY_WORD)];
    const ranges = [...Object.values(KN.shun.BY_KEY),
      ...Object.values(KN.shun.BY_WORD).flatMap((ws) => ws.map(([, m]) => m))].flat();
    return {
      missing: all.filter((k) => !keys.has(k)),
      badMonth: ranges.filter(([a, b]) => !(a >= 1 && a <= 12 && b >= 1 && b <= 12)).length,
    };
  });
  t.check("表：鍵はどれも絵の辞書にある", table.missing.length === 0, table.missing.join(","));
  t.check("表：月は 1〜12", table.badMonth === 0);

  const L = await page.evaluate(() => Object.fromEntries(
    ["サンマ", "白菜", "カツオのたたき", "ラフランス", "梨", "みかん", "ミニトマト",
      "魚", "牛乳", "たい焼き", "ツナ缶", "グレープフルーツ", "バナナ", "かぶ"]
      .map((n) => [n, KN.shun.label({ name: n })])));
  const want = {
    "サンマ": "旬 9〜10月", "白菜": "旬 11〜2月", "カツオのたたき": "旬 4〜5月・9〜10月",
    "ラフランス": "旬 10〜12月", "梨": "旬 8〜10月", "みかん": "旬 11〜1月", "ミニトマト": "旬 6〜8月",
    "かぶ": "旬 3〜5月・10〜12月",
    "魚": "", "牛乳": "", "たい焼き": "", "ツナ缶": "", "グレープフルーツ": "", "バナナ": "",
  };
  for (const [n, w] of Object.entries(want)) t.check(`引く：${n} → ${w || "出さない"}`, L[n] === w, L[n]);
  t.check("引く：手で選んだ絵の鍵を先に見る",
    await page.evaluate(() => KN.shun.label({ name: "ばあちゃんの", icon: "persimmon" })) === "旬 10〜11月");

  /* 画面 */
  const ids = await page.evaluate(() => {
    const s = KN.store;
    const a = s.addProduct({ name: "サンマ", categoryId: s.guessCategory("サンマ") });
    const b = s.addProduct({ name: "牛乳", categoryId: s.guessCategory("牛乳") });
    const st = s.get().stores[0];
    if (st) s.addPrice(a.id, { storeId: st.id, price: 198 });
    s.addItem(a.id);
    KN.app.showScreen("list");
    return { a: a.id, b: b.id, store: !!st };
  });
  await page.waitForTimeout(600);
  t.check("行に旬を出さない", await page.evaluate(() =>
    !document.querySelector(".screen.is-active").textContent.includes("旬")));

  const cap = () => page.evaluate(() => {
    const c = document.querySelector(".pd-hero .js-cap");
    return c ? { hidden: c.hidden, text: c.textContent } : null;
  });
  await page.evaluate((id) => { window.__h = KN.productSheet.open(id); }, ids.a);
  await page.waitForTimeout(700);
  let c = await cap();
  t.check("紙：頭の一行に旬", !!c && !c.hidden && c.text.includes("旬 9〜10月"), JSON.stringify(c));
  if (ids.store) t.check("紙：最安と並ぶ", !!c && /^最安 .+　旬 9〜10月$/.test(c.text), JSON.stringify(c));

  await page.fill(".pd-hero .js-name", "白菜");
  await page.waitForTimeout(700);
  c = await cap();
  t.check("紙：名前を直すと引き直す", !!c && c.text.includes("旬 11〜2月") && !c.text.includes("9〜10"), JSON.stringify(c));
  await page.evaluate(() => window.__h.close());
  await page.waitForTimeout(700);

  await page.evaluate((id) => KN.productSheet.open(id), ids.b);
  await page.waitForTimeout(700);
  c = await cap();
  t.check("紙：旬の無いもの・値段も無いものは一行ごと出さない", !!c && c.hidden && c.text === "", JSON.stringify(c));

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
