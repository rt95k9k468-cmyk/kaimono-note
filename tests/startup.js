/* 起動の固まり（docs/improvements.md の C3）。

   CPU を4倍遅くして開き、起動のあいだの長い仕事（50ms を越えるもの）を数える。
   あわせて、消した昔の絵（色つきの icons-v2.js・手描きの「こと」・手描きの
   UIアイコン55個。2026年9月28日に削除）がどこにも残っていないこと、
   キーワード（`iconsV2Keys`。言葉だけで絵は無い）は変わらず引けることを見る。

   数字は機械で揺れるので、固まりの長さは「前より悪くなっていないか」の目安として
   出すだけ。落とすのは、昔の絵が残っているときと、絵が引けないとき。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("startup");
  const loaded = [];
  const { browser, page, errors } = await open({
    before: async (ctx, page) => {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      page.on("request", (r) => { if (r.url().includes("/js/")) loaded.push(r.url().split("/js/")[1].split("?")[0]); });
      await page.addInitScript(() => {
        window.__long = [];
        new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration))))
          .observe({ type: "longtask", buffered: true });
      });
    },
  });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    long: window.__long,
    fcp: Math.round((performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0),
    v2: !!KN.iconsV2,
    keys: (KN.iconsV2Keys || []).length,
    hospital: KN.productIcons.findKey("病院に行く"),
    milk: KN.productIcons.findKey("牛乳"),
    mark: !!KN.store.productMark({ name: "牛乳", categoryId: "" }),
    hand: !!(KN.iconsTodo && (KN.iconsTodo.use || KN.iconsTodo.register)),
    legacy: KN.icons.has("legacy", "gear") || KN.icons.has("legacy", "scale"),
    scale: KN.icons.has("phosphor", "scale") && KN.icons.svg("scale").includes('data-ico="scale"'),
    emptyArt: Object.keys(KN.emptyArt || {}).sort().join(","),
  }));
  const total = r.long.reduce((a, b) => a + b, 0);
  console.log(`  長い仕事: [${r.long.join(", ")}] ms（合計 ${total}・最大 ${Math.max(0, ...r.long)}）`);
  console.log(`  読んだ js: ${loaded.length} 本・最初に描けたのは ${r.fcp}ms`);

  c.check("起動でエラーが出ない", errors.length === 0, errors.join("\n"));
  c.check("色つきの絵（icons-v2.js）は無い", !loaded.includes("icons-v2.js") && !r.v2);
  c.check("手描きの「こと」（icons-todo-hand.js）と入れ替える口は無い", !loaded.includes("icons-todo-hand.js") && !r.hand);
  c.check("手描きのUIアイコン（icons-legacy.js）は無い", !loaded.includes("icons-legacy.js") && !r.legacy);
  c.check("キーワード（iconsV2Keys）は読んでいる", r.keys > 100, `${r.keys} 件`);
  c.check("新しい語で引ける（病院に行く → hospital）", r.hospital === "hospital", r.hospital);
  c.check("前からの語で引ける（牛乳）", !!r.milk, r.milk);
  c.check("品物の絵が出る", r.mark);
  c.check("体重計（Phosphor に無い一枚）は icons-phosphor.js から出る", r.scale);
  c.check("空の絵（icon-system.js を使う）は使っている4枚だけ", r.emptyArt === "basket,donePad,notebook,priceTag", r.emptyArt);
  await browser.close();
  c.done();
})();
