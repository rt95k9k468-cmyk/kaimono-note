/* マウスの「戻る」ボタン（button 3。Edge・Chrome。js/keys.js、2026年11月1日に利用者）：Esc と同じ一歩。
   - やることの紙が開いていれば閉じる
   - 設定は一枚もどり、根でもう一度押せば前の席へ
   - 何も開いていなくても、ブラウザの戻る（頁の外へ出る）は止める・席はそのまま
   - 「進む」（button 4）は設定の中だけ：戻るでめくった一枚を開き直す（二枚めくれば二枚）。ほかへ進んだら忘れる・
     入り直したら忘れる。進む先が無いとき・設定の外ではブラウザに任せる（止めない）
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

  /* 設定の外の進むは取らない。 */
  await page.evaluate(() => KN.screens.todo.open());
  await page.waitForTimeout(800);
  const fwd = await side(4);
  await page.waitForTimeout(600);
  t.check("設定の外の進むは取らない：止めず、紙も閉じない", !fwd.down && !fwd.up && await sheets() === 1, JSON.stringify(fwd));
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
  const title = () => page.evaluate(() => {
    const ls = [...document.querySelectorAll("#screen-settings .set-layer")].filter((e) => e.getClientRects().length);
    return ls.length ? ls[ls.length - 1].querySelector(".js-nav-title").textContent : "";
  });
  const deep = await layers();
  const name = await title();
  await side(3);
  await page.waitForTimeout(800);
  const one = await layers();
  const still = await screen();
  t.check("設定：戻るで一枚もどる", deep === 2 && one === 1 && still === "settings", JSON.stringify({ deep, one, still }));

  const f1 = await side(4);
  await page.waitForTimeout(800);
  const again = { n: await layers(), name: await title() };
  t.check("設定：進むで、戻った一枚を開き直す（ブラウザの進むは止める）", f1.down && f1.up && again.n === 2 && again.name === name, JSON.stringify({ f1, again, name }));
  const f2 = await side(4);
  await page.waitForTimeout(600);
  t.check("進む先が無ければブラウザに任せる", !f2.down && !f2.up && await layers() === 2, JSON.stringify(f2));

  /* 二枚めくれば二枚進む（バックアップ → Dropbox へ送る）。 */
  await side(3); await page.waitForTimeout(800);
  await page.evaluate(() => KN.settingsParts.go("data")); await page.waitForTimeout(800);
  await page.evaluate(() => KN.settingsParts.go("dropbox")); await page.waitForTimeout(800);
  const deep3 = { n: await layers(), name: await title() };
  await side(3); await page.waitForTimeout(800);
  await side(3); await page.waitForTimeout(800);
  const at1 = await layers();
  await side(4); await page.waitForTimeout(800);
  await side(4); await page.waitForTimeout(800);
  const two = { n: await layers(), name: await title() };
  t.check("二枚戻って二枚進む", deep3.n === 3 && at1 === 1 && two.n === 3 && two.name === deep3.name, JSON.stringify({ deep3, at1, two }));
  await side(3); await page.waitForTimeout(800);
  await side(3); await page.waitForTimeout(800);

  /* ほかへ進んだら忘れる。 */
  const rows = page.locator("#screen-settings .set-layer:last-child .set-row.is-nav:visible");
  await rows.nth(1).click();
  await page.waitForTimeout(800);
  const other = await title();
  await side(3);
  await page.waitForTimeout(800);
  await side(4);
  await page.waitForTimeout(800);
  const fo = await title();
  t.check("ほかの一枚へ進んだら、進む先はその一枚", fo === other && fo !== name, JSON.stringify({ fo, other, name }));
  await side(3);
  await page.waitForTimeout(800);

  await side(3);
  await page.waitForTimeout(800);
  const out = await screen();
  t.check("設定の根で戻る：前の席へ", out === "list", out);
  await page.keyboard.press(",");
  await page.waitForTimeout(700);
  const f3 = await side(4);
  await page.waitForTimeout(600);
  t.check("設定に入り直したら進む先は忘れる", !f3.down && !f3.up && await layers() === 1, JSON.stringify(f3));

  t.check("頁のエラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
