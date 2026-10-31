/* パソコン（Windows）の手ざわり（docs/log/design-review.md 10節の P4。点検して穴だった所）：
   - 紙を閉じたら、カーソルは押したものへ戻る（組み直しで入れ替わった行は同じ印の行の同じ口へ）。探す窓の Esc は虫めがねへ
   - 設定の画面は Esc で一枚ずつ戻り、出たら歯車へ
   - 強制配色（ハイコントラスト）で ＋・今日｜週｜月 に縁、選んでいる席と札は Highlight
   - 丸ゴの無い端末はゴシックの顔（sans-serif 任せにしない）・游ゴシックは 400＝Medium／700＝Bold の面を束ねる
   - 指の端末（電話）は今までどおり：閉じてもカーソルを置き直さない
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-hand.js */
const { open, checker } = require("./lib");

async function seed(page) {
  await page.evaluate(async () => {
    const S = KN.store;
    const a = S.addStore("スーパー");
    ["牛乳", "卵"].forEach((name) => { const p = S.addProduct({ name }); S.addItem(p.id); S.addPrice(p.id, { storeId: a.id, price: 100, amount: 1, date: KN.util.todayKey() }); });
    S.addTodo({ title: "試しの予定", due: KN.util.todayKey(), time: "10:00", minutes: 30 });
    S.addWeight({ day: KN.util.todayKey(), time: "07:00", kg: 60 });
    const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
    await KN.notes.addMany(["一つめ", "二つめ"].map((title, i) => ({ id: `n-hand${i}`, title, body: "試しの本文",
      notebook: "private", tags: [], fav: false, createdAt: at(i), updatedAt: at(i), deletedAt: null })));
  });
}

/* 開いて Esc で閉じ、カーソルがどこに居るか（押したものと同じ口か）。 */
async function roundTrip(page, sel, same) {
  const ok = await page.evaluate((sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.getClientRects().length); if (!e) return false; e.focus(); return document.activeElement === e; }, sel);
  if (!ok) return { ok: false };
  await page.keyboard.press("Enter");
  await page.waitForSelector(".sheet.is-open", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => !!document.querySelector(".sheet.is-open"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  const back = await page.evaluate(same);
  return { ok: true, opened, back };
}

(async () => {
  const t = checker("desk-hand");
  {
    const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
    await seed(page);
    await page.click(".tab-list");
    await page.waitForTimeout(600);

    let r = await roundTrip(page, "#screen-list .item-wrap .item-body",
      () => !!document.activeElement.closest("#screen-list .item-wrap") && document.activeElement.matches(".item-body"));
    t.check("品物の紙を Esc で閉じると、カーソルは押した行へ", r.ok && r.opened && r.back, JSON.stringify(r));
    r = await roundTrip(page, "#dock .add-fab", () => document.activeElement.matches("#dock .add-fab"));
    t.check("＋の紙を閉じると、カーソルは＋へ", r.ok && r.opened && r.back, JSON.stringify(r));

    await page.click(".tab-notes");
    await page.waitForTimeout(700);
    r = await roundTrip(page, "#screen-notes .nt-card", () => document.activeElement.matches("#screen-notes .nt-card"));
    t.check("ノートを閉じると、カーソルは組み直した一覧の同じ札へ", r.ok && r.opened && r.back, JSON.stringify(r));

    /* 探す窓：Esc で閉じたら虫めがねへ。 */
    await page.click(".tab-list");
    await page.waitForTimeout(500);
    await page.keyboard.press("/");
    await page.waitForTimeout(400);
    const inSearch = await page.evaluate(() => document.activeElement.matches(".js-search"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    t.check("探す窓の Esc は虫めがねへ", inSearch && await page.evaluate(() => document.activeElement.matches("#head .js-search-btn")));

    /* 設定：Esc で一枚ずつ戻り、出たら歯車へ。 */
    await page.keyboard.press(",");
    await page.waitForTimeout(700);
    await page.locator("#screen-settings .set-row.is-nav").first().click();
    await page.waitForTimeout(800);
    const layers = () => page.evaluate(() => [...document.querySelectorAll("#screen-settings .set-layer")].filter((e) => e.getClientRects().length).length);
    const deep = await layers();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const one = await layers();
    const still = await page.evaluate(() => document.documentElement.dataset.screen);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const out = await page.evaluate(() => ({ screen: document.documentElement.dataset.screen, gear: document.activeElement.matches("#head .js-settings") }));
    t.check("設定は Esc で一枚もどる", deep === 2 && one === 1 && still === "settings", JSON.stringify({ deep, one, still }));
    t.check("設定の根で Esc：前の席へ戻り、カーソルは歯車", out.screen === "list" && out.gear, JSON.stringify(out));

    /* 書体：丸ゴの無い端末はゴシックの顔へ。游ゴシックは面を束ねて呼ぶ。 */
    const fonts = await page.evaluate(() => {
      const f = (v) => { document.documentElement.toggleAttribute("data-font", !!v); if (v) document.documentElement.setAttribute("data-font", v);
        return getComputedStyle(document.documentElement).getPropertyValue("--font"); };
      const maru = f("maru"), goth = f("");
      const faces = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (_) { return []; } })
        .filter((r) => r instanceof CSSFontFaceRule && /KN Yu Gothic/.test(r.style.getPropertyValue("font-family")))
        .map((r) => `${r.style.getPropertyValue("font-weight")} ${r.style.getPropertyValue("src")}`);
      return { maru, goth, faces };
    });
    t.check("丸ゴの次はゴシック（sans-serif 任せにしない）", /Maru[^,]*,\s*"KN Yu Gothic"/.test(fonts.maru) && !/Maru Gothic ProN",\s*sans-serif/.test(fonts.maru), fonts.maru);
    t.check("游ゴシックは 400＝Medium・700＝Bold の面", fonts.faces.length === 2 && fonts.faces.some((x) => /^(400|normal) .*Medium/.test(x)) && fonts.faces.some((x) => /^(700|bold) .*Bold/.test(x))
      && /"KN Yu Gothic"/.test(fonts.goth), JSON.stringify(fonts));

    /* 強制配色。 */
    await page.emulateMedia({ forcedColors: "active" });
    await page.click(".tab-todo");
    await page.waitForTimeout(700);
    const fc = await page.evaluate(() => {
      const cs = (s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); return e && getComputedStyle(e); };
      const fab = cs("#dock .add-fab"), seg = cs("#screen-todo .seg-btn:not([aria-pressed='true'])"), on = cs("#screen-todo .seg-btn[aria-pressed='true']"), tab = cs(".tab[aria-selected='true']");
      const plain = cs(".tab:not([aria-selected='true'])");
      return { fab: fab && fab.outlineStyle, seg: seg && seg.outlineStyle, on: on && on.backgroundColor, tab: tab && tab.backgroundColor, plain: plain && plain.backgroundColor };
    });
    await page.emulateMedia({ forcedColors: "none" });
    t.check("強制配色：＋と今日｜週｜月 に縁", fc.fab === "solid" && fc.seg === "solid", JSON.stringify(fc));
    t.check("強制配色：選んでいる札と席は Highlight（ほかと違う地）", !!fc.on && !!fc.tab && fc.on === fc.tab && fc.tab !== fc.plain, JSON.stringify(fc));

    t.check("エラーなし", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* 指の端末（電話）は今までどおり：紙を閉じてもカーソルを置き直さない。 */
  {
    const { browser, page, errors } = await open({ viewport: { width: 393, height: 852 }, touch: true });
    await seed(page);
    await page.tap(".tab-list");
    await page.waitForTimeout(600);
    await page.tap("#dock .add-fab");
    await page.waitForSelector(".sheet.is-open", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    const inSheet = await page.evaluate(() => !!document.activeElement.closest(".sheet"));
    await page.tap(".sheet.is-open .js-close");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.activeElement === document.body);
    t.check("電話：閉じてもカーソルを＋へ置き直さない", inSheet && after, JSON.stringify({ inSheet, after }));
    t.check("電話：エラーなし", !errors.length, errors.join(" | "));
    await browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
