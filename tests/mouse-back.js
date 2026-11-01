/* マウスの「戻る」ボタン（button 3。Edge・Chrome。js/keys.js、2026年11月1日に利用者）：Esc と同じ一歩。
   - やることの紙が開いていれば閉じる
   - 設定は一枚もどり、根でもう一度押せば前の席へ
   - 何も開いていなくても、ブラウザの戻る（頁の外へ出る）は止める・席はそのまま
   - 「進む」（button 4）は取らない
   Playwright の mouse は 3・4 を押せないので、本物と同じ形の mousedown／mouseup を投げる。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/mouse-back.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("mouse-back");
  const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
  /* 押して離す。離したほうが止められたか（＝ブラウザの戻るが起きない）を返す。 */
  const side = (button) => page.evaluate((button) => {
    const at = document.elementFromPoint(720, 450) || document.body;
    const o = { bubbles: true, cancelable: true, button, buttons: 0, clientX: 720, clientY: 450 };
    const down = new MouseEvent("mousedown", o);
    at.dispatchEvent(down);
    const up = new MouseEvent("mouseup", o);
    at.dispatchEvent(up);
    return { down: down.defaultPrevented, up: up.defaultPrevented };
  }, button);
  const sheets = () => page.evaluate(() => document.querySelectorAll(".sheet.is-open").length);
  const screen = () => page.evaluate(() => document.documentElement.dataset.screen);

  /* 何も開いていない：止めるだけ、席は動かない。 */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(600);
  const idle = await side(3);
  await page.waitForTimeout(400);
  t.check("何も開いていない：ブラウザの戻るを止め、席はそのまま", idle.down && idle.up && await screen() === "todo", JSON.stringify(idle));

  /* やることの紙。 */
  await page.evaluate(() => KN.screens.todo.open());
  await page.waitForTimeout(800);
  const opened = await sheets();
  await side(3);
  await page.waitForTimeout(800);
  t.check("やることの紙：戻るで閉じる", opened === 1 && await sheets() === 0, JSON.stringify({ opened, after: await sheets() }));

  /* 進むは取らない。 */
  await page.evaluate(() => KN.screens.todo.open());
  await page.waitForTimeout(800);
  const fwd = await side(4);
  await page.waitForTimeout(600);
  t.check("進む（4）は取らない：止めず、紙も閉じない", !fwd.down && !fwd.up && await sheets() === 1, JSON.stringify(fwd));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  /* 設定：一枚ずつ戻り、根で前の席へ。 */
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(600);
  await page.keyboard.press(",");
  await page.waitForTimeout(700);
  await page.locator("#screen-settings .set-row.is-nav").first().click();
  await page.waitForTimeout(800);
  const layers = () => page.evaluate(() => [...document.querySelectorAll("#screen-settings .set-layer")].filter((e) => e.getClientRects().length).length);
  const deep = await layers();
  await side(3);
  await page.waitForTimeout(800);
  const one = await layers();
  const still = await screen();
  await side(3);
  await page.waitForTimeout(800);
  const out = await screen();
  t.check("設定：戻るで一枚もどる", deep === 2 && one === 1 && still === "settings", JSON.stringify({ deep, one, still }));
  t.check("設定の根で戻る：前の席へ", out === "list", out);

  t.check("頁のエラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
