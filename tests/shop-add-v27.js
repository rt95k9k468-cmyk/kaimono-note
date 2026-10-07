/* V27 買うものの＋の紙（docs/shopping.md の末の節）。2026年10月5日、利用者が選んだ六つ。

   - ＋を押すと、そのまま名前の欄（キーボード）。紙は＋から育ち、閉じれば＋へ帰る（fab-home と同じ）
   - 打つ前は、よく買う物（いまリストに無いもの）の札。押せばそのまま足し、紙は開いたまま
   - 打つと候補は名前の下に横一列の札。リストにあるものは薄い。押すと選ぶ
   - カテゴリとメモは札一列。メモは札を押すと欄が出る
   - 改行キー：足して紙は開いたまま空になる（次を打てる）
   - 「リストに追加」：閉じて、紙の頭がその行へ飛んで入り、行が光る。トーストは出さない。紙は＋へ帰る（U17）
   - 記録の形は変えない（足した行は前と同じ欄）

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/shop-add-v27.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("shop-add-v27");
  const { browser, page, errors } = await open();

  await page.evaluate(() => {
    const S = KN.store;
    S.update((s) => { s.items = []; });
    /* よく買う物：納豆（3日）・バナナ（2日）・卵（1日）。牛乳はリストにある。 */
    const buy = (name, n) => {
      const p = S.findProductByName(name) || S.addProduct({ name });
      for (let k = 0; k < n; k++) {
        const r = S.addItem(p.id);
        S.update((s) => {
          const it = s.items.find((x) => x.id === r.id);
          it.checked = true;
          it.checkedAt = new Date(Date.now() - (k + 1) * 3 * 86400000).toISOString();
        });
      }
      return p;
    };
    buy("納豆", 3); buy("バナナ", 2); buy("卵", 1);
    const milk = buy("牛乳", 2);
    S.addItem(milk.id);
    S.addProduct({ name: "牛すじ" });
    KN.app.showScreen("list");
  });
  await page.waitForTimeout(600);

  const sheet = () => page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    if (!s) return null;
    const chips = [...s.querySelectorAll(".ac-chips .ac-chip")];
    const tops = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top)));
    return {
      focus: document.activeElement === s.querySelector(".js-name"),
      name: s.querySelector(".js-name").value,
      often: !!s.querySelector(".ac-chips.is-often"),
      chips: chips.map((c) => c.textContent.trim()),
      listed: chips.filter((c) => c.classList.contains("is-listed")).map((c) => c.textContent.trim()),
      oneRow: tops.size <= 1,
      catChip: !!s.querySelector(".pd-chips .js-row-cat"),
      memoChip: !!s.querySelector(".pd-chips .js-memo-chip:not([hidden])"),
      memoShown: !s.querySelector(".js-memo").hidden,
      card: !!s.querySelector(".d-card"),
    };
  });
  const listNames = () => page.evaluate(() => KN.store.get().items.filter((i) => !i.checked)
    .map((i) => KN.store.getProduct(i.productId).name).sort());

  /* ---- 開く ---- */
  await page.click("#dock .add-fab");
  await page.waitForTimeout(150);
  t.check("＋の一拍で名前の欄に入る（キーボード）", (await sheet()).focus);
  t.check("紙は＋から育つ", await page.evaluate(() => document.querySelector(".sheet.is-open").classList.contains("is-from-origin")));
  t.check("＋の紙は四隅の丸いカード（U17）", await page.evaluate(() => {
    const el = document.querySelector(".sheet.is-open"), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return el.classList.contains("is-fab-card") && r.left >= 6 && innerHeight - r.bottom >= 6
      && parseFloat(cs.borderBottomLeftRadius) > 10;
  }));
  await page.waitForTimeout(600);
  const s0 = await sheet();
  t.check("打つ前は、よく買う物の札（多い順・リストにあるものは出さない）",
    s0.often && JSON.stringify(s0.chips) === JSON.stringify(["納豆", "バナナ", "卵"]), JSON.stringify(s0.chips));
  t.check("カテゴリとメモは札一列（枠の二段ではない）", s0.catChip && s0.memoChip && !s0.memoShown && !s0.card, JSON.stringify(s0));

  /* ---- よく買う物を一押し ---- */
  await page.locator(".sheet.is-open .ac-chip", { hasText: "納豆" }).click();
  await page.waitForTimeout(400);
  const s1 = await sheet();
  t.check("よく買う物の札を押すと、そのまま足して紙は開いたまま",
    s1 && (await listNames()).includes("納豆") && !s1.chips.includes("納豆"), JSON.stringify(s1 && s1.chips));

  /* ---- 打つと候補は横一列 ---- */
  await page.fill(".sheet.is-open .js-name", "牛");
  await page.waitForTimeout(300);
  const s2 = await sheet();
  t.check("打つと候補は名前の下に横一列の札", !s2.often && s2.chips.includes("牛すじ") && s2.chips.includes("牛乳") && s2.oneRow, JSON.stringify(s2));
  t.check("リストにあるものは薄い", JSON.stringify(s2.listed) === JSON.stringify(["牛乳"]), JSON.stringify(s2.listed));
  t.check("候補に「価格の記録なし」の段を出さない", await page.evaluate(() =>
    !/価格の記録なし/.test(document.querySelector(".sheet.is-open .ac-chips").textContent)));

  /* ---- メモの札 ---- */
  await page.click(".sheet.is-open .js-memo-chip");
  await page.waitForTimeout(200);
  const s3 = await sheet();
  t.check("メモの札を押すと欄が出る", s3.memoShown && !s3.memoChip && await page.evaluate(() =>
    document.activeElement === document.querySelector(".sheet.is-open .js-memo")));

  /* ---- 改行で足して続ける ---- */
  await page.fill(".sheet.is-open .js-name", "しょうゆ");
  await page.fill(".sheet.is-open .js-memo", "濃口");
  await page.focus(".sheet.is-open .js-name");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const s4 = await sheet();
  const soy = await page.evaluate(() => {
    const S = KN.store;
    const p = S.findProductByName("しょうゆ");
    const it = p && S.get().items.find((i) => i.productId === p.id && !i.checked);
    return it ? { memo: it.memo, keys: Object.keys(it).sort().join(",") } : null;
  });
  t.check("改行で足し、紙は開いたまま空になる", s4 && s4.name === "" && s4.focus && soy && soy.memo === "濃口", JSON.stringify({ s4, soy }));
  t.check("空に戻るとメモは札に戻り、よく買う物の札が出る", s4.memoChip && !s4.memoShown && s4.often, JSON.stringify(s4));

  /* ---- 「リストに追加」で行へ飛んで入る ---- */
  await page.evaluate(() => { document.querySelectorAll(".toast").forEach((x) => x.remove()); });
  await page.fill(".sheet.is-open .js-name", "みりん");
  await page.click(".sheet.is-open .js-add");
  await page.waitForTimeout(120);
  const fly = await page.evaluate(() => {
    const g = document.querySelector(".land-ghost");
    return { ghost: !!g, text: g ? g.textContent.trim() : "", homing: !!document.querySelector(".sheet.is-homing") };
  });
  t.check("閉じると紙の頭が飛び、紙は＋へ縮んで帰る（U17）", fly.ghost && fly.text === "みりん" && fly.homing, JSON.stringify(fly));
  await page.waitForTimeout(700);
  const landed = await page.evaluate(() => {
    const S = KN.store;
    const p = S.findProductByName("みりん");
    const it = p && S.get().items.find((i) => i.productId === p.id && !i.checked);
    const w = it && document.querySelector(`.item-wrap[data-item-id="${it.id}"]`);
    return {
      row: !!w, flash: !!w && w.classList.contains("is-flash"),
      visible: !!w && getComputedStyle(w.querySelector(".item") || w).visibility === "visible",
      ghost: !!document.querySelector(".land-ghost"),
      sheet: !!document.querySelector(".sheet.is-open"),
      toast: [...document.querySelectorAll(".toast")].map((x) => x.textContent).join(" "),
    };
  });
  t.check("着くと行が光り、写しは片づく", landed.row && landed.flash && landed.visible && !landed.ghost && !landed.sheet, JSON.stringify(landed));
  t.check("「リストに追加」ではトーストを出さない", !/追加しました/.test(landed.toast), landed.toast);

  /* ---- 動きを減らす ---- */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click("#dock .add-fab");
  await page.waitForTimeout(400);
  await page.fill(".sheet.is-open .js-name", "酢");
  await page.click(".sheet.is-open .js-add");
  await page.waitForTimeout(120);
  t.check("動きを減らす設定では飛ばない（光るだけ）", !(await page.evaluate(() => !!document.querySelector(".land-ghost"))));
  await page.emulateMedia({ reducedMotion: "no-preference" });

  t.check("足した行の欄は前と同じ（形を変えない）", soy && !/fly|land|often/.test(soy.keys), soy && soy.keys);
  t.check("絵文字なし", await page.evaluate(() => !/\p{Extended_Pictographic}/u.test(document.body.innerText)));
  t.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
