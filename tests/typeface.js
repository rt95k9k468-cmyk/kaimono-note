/* 書体（設定 → 外観 → 書体。docs/look.md の「書体は三つ」）。
   - 既定はゴシックで、<html> に札（data-font）を付けない
   - 選ぶボタンは、画面がどの書体でも自分の書体で名前を出す
   - 押したその場で本文も打ちこむ欄も変わる・読み直しても残る
   - 知らない値はゴシックへ戻る（reconcile）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/typeface.js
   試験のブラウザにはヒラギノが無いので、見るのは字の形ではなく font-family の並び。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("typeface");
  const { browser, page, errors } = await open();

  const attr = () => page.evaluate(() => document.documentElement.getAttribute("data-font"));
  /* 本文と、打ちこむ欄（font: inherit）の先頭の書体。 */
  const heads = () => page.evaluate(() => {
    const first = (el) => getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/"/g, "");
    const inp = document.createElement("input");
    document.body.append(inp);
    const r = { body: first(document.body), input: first(inp) };
    inp.remove();
    return r;
  });
  const btn = (id) => page.locator(`.set-layer:last-child .seg-btn[data-font="${id}"]`);
  const btnHead = (id) => btn(id).evaluate((el) => getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/"/g, ""));
  const reload = async () => {
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app);
    await page.waitForTimeout(300);
  };

  t.check("既定はゴシック", (await page.evaluate(() => KN.store.get().settings.font)) === "gothic");
  t.check("ゴシックでは札を付けない", (await attr()) === null);
  t.check("ゴシックは端末の書体が先頭", (await heads()).body === "-apple-system", (await heads()).body);

  /* 設定 → 外観。 */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "外観" }).first().click();
  await page.waitForTimeout(600);
  t.check("書体のボタンが三つ", (await page.locator(".set-layer:last-child .seg-btn[data-font]").count()) === 3);
  t.check("ゴシックが選ばれている", (await btn("gothic").getAttribute("aria-pressed")) === "true");
  const own = { gothic: "-apple-system", maru: "Hiragino Maru Gothic ProN", mincho: "Hiragino Mincho ProN" };
  for (const id of Object.keys(own)) {
    t.check(`${id} のボタンは自分の書体で出る`, (await btnHead(id)) === own[id], await btnHead(id));
  }

  /* 明朝を指で押す。 */
  await btn("mincho").click();
  await page.waitForTimeout(200);
  t.check("明朝で札が付く", (await attr()) === "mincho");
  t.check("本文が明朝になる", (await heads()).body === own.mincho, (await heads()).body);
  t.check("打ちこむ欄も明朝になる", (await heads()).input === own.mincho, (await heads()).input);
  t.check("記録に残る", (await page.evaluate(() => KN.store.get().settings.font)) === "mincho");
  t.check("押したボタンが選ばれている", (await btn("mincho").getAttribute("aria-pressed")) === "true");
  t.check("明朝の画面でも、ゴシックのボタンはゴシックで出る", (await btnHead("gothic")) === own.gothic, await btnHead("gothic"));

  await reload();
  t.check("読み直しても明朝のまま", (await attr()) === "mincho" && (await heads()).body === own.mincho);

  /* 丸ゴ → ゴシックへ戻す（ボタンから）。 */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "外観" }).first().click();
  await page.waitForTimeout(600);
  await btn("maru").click();
  await page.waitForTimeout(200);
  t.check("丸ゴシックで札が付く", (await attr()) === "maru" && (await heads()).body === own.maru, (await heads()).body);
  await btn("gothic").click();
  await page.waitForTimeout(200);
  t.check("ゴシックへ戻すと札が外れる", (await attr()) === null && (await heads()).body === own.gothic);

  /* 知らない値はゴシックへ。 */
  await page.evaluate(() => KN.store.update((s) => { s.settings.font = "fancy"; }));
  await reload();
  t.check("知らない値はゴシックへ戻る",
    (await page.evaluate(() => KN.store.get().settings.font)) === "gothic" && (await attr()) === null);

  t.check("エラーが出ない", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
