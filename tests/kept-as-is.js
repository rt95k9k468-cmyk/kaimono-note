/* 訊いて「今のまま」と決めたもの（docs/log/design-review.md 11節。2026年11月1日、利用者）。
   - 店の名前：買うもの・価格の行で一行・…で切れる（行は伸びない）。R5（11月11日、docs/redesign.md）で店は値段の下から
     品名の下の「店・いつ」へ移り、92px の枠は名前の段の幅に（王冠は値段の下に「最安」だけ）
   - 探した言葉：席を移っても、その席の窓に字が残る（戻れば虫めがねが光る。移った先の席には持ち込まない）
   - やることの紙の詳しい欄：畳まない。種類・日・時刻・くり返し・手順・メモが開いたときから見えている
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/kept-as-is.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("kept-as-is");
  const { browser, page, errors } = await open();

  /* ---- 店の名前の幅 ---- */
  const LONG = "とてもとてもながいなまえのおみせ";
  await page.evaluate((long) => {
    const S = KN.store;
    const [a, b] = [long, "近くの店"].map((n) => S.addStore(n));
    const p = S.addProduct({ name: "牛乳" });
    S.addPrice(p.id, { storeId: a.id, price: 180, amount: 1 });
    S.addPrice(p.id, { storeId: b.id, price: 215, amount: 1 });
    S.addItem(p.id);
    S.update((st) => { st.settings.layout = "rows"; });
  }, LONG);
  for (const scr of ["list", "prices"]) {
    await page.evaluate((id) => KN.app.showScreen(id), scr);
    await page.waitForTimeout(600);
    const m = await page.evaluate((long) => {
      const el = [...document.querySelectorAll(".screen.is-active .item-where")].find((e) => e.textContent.includes(long));
      if (!el) return null;
      const cs = getComputedStyle(el), row = el.closest(".item, .product"), main = el.closest(".item-body, .product-main");
      return { ws: cs.whiteSpace, to: cs.textOverflow, cut: el.scrollWidth > el.clientWidth,
        h: el.getBoundingClientRect().height, lh: parseFloat(cs.lineHeight) || 0,
        crown: !!row.querySelector(".item-price .crown"), mainH: Math.round(main.getBoundingClientRect().height) };
    }, LONG);
    t.check(`${scr}：長い店の名前は「店・いつ」の一行で…で切れる`, !!m && m.ws === "nowrap" && m.to === "ellipsis" && m.cut, JSON.stringify(m));
    t.check(`${scr}：王冠（値段の下）があっても一行・名前の段は二行のまま（60px の行に収まる）`, !!m && m.crown && (!m.lh || m.h < m.lh * 1.6) && m.mainH <= 48, JSON.stringify(m));
  }

  /* ---- 探した言葉は席を移っても残る ---- */
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(500);
  await page.click("#head .js-search-btn");
  await page.waitForTimeout(300);
  await page.fill(".screen.is-active .js-search", "牛乳");
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(600);
  const away = await page.evaluate(() => ({
    todo: (document.querySelector("#screen-todo .js-search") || {}).value || "",
    on: document.querySelector("#head .js-search-btn").classList.contains("is-on"),
  }));
  t.check("移った先の席には字を持ち込まない", away.todo === "" && !away.on, JSON.stringify(away));
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => {
    const el = document.querySelector("#screen-list .js-search");
    const wrap = el && el.closest(".js-search-wrap");
    return { v: el && el.value, shown: !!wrap && !wrap.hidden,
      on: document.querySelector("#head .js-search-btn").classList.contains("is-on") };
  });
  t.check("戻れば字が残り、窓も虫めがねもそのまま", back.v === "牛乳" && back.shown && back.on, JSON.stringify(back));

  /* ---- やることの紙の詳しい欄は畳まない ---- */
  const SEL = [".js-kind", ".js-side", ".js-row-due", ".js-row-time", ".js-row-repeat", ".js-sub-add", ".js-memo"];
  const look = () => page.evaluate((sel) => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    if (!s) return null;
    const o = {};
    sel.forEach((q) => {
      const el = s.querySelector(q);
      const r = el && el.getBoundingClientRect();
      o[q] = !!el && r.width > 0 && r.height > 0 && !el.closest("details:not([open]), [hidden]");
    });
    return o;
  }, SEL);
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(500);
  await page.evaluate(() => KN.screens.todo.open());
  await page.waitForTimeout(800);
  const fresh = await look();
  t.check("新しく足す紙：詳しい欄が開いたときから見えている", !!fresh && SEL.every((q) => fresh[q]), JSON.stringify(fresh));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const id = await page.evaluate(() => KN.store.addTodo({ title: "電球を替える", due: KN.util.todayKey() }).id);
  await page.evaluate((i) => KN.screens.todo.open(i), id);
  await page.waitForTimeout(800);
  const edit = await look();
  t.check("直す紙：詳しい欄が開いたときから見えている", !!edit && SEL.every((q) => edit[q]), JSON.stringify(edit));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  t.check("頁のエラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})();
