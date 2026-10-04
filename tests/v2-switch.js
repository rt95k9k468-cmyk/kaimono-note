/* 2.0 の見た目を試す切り替え（docs/roadmap-2.0.md の V1）。設定 → 外観 → 「試す」の奥。
   - 既定はオフで、html に .is-v2 が無い
   - 「試す」は畳まれていて、開くとスイッチが一つ
   - 押すと .is-v2 が付く・押しても奥は畳まれない・読み直しても残る
   - オンでもオフでも、四つのタブが開いてエラーが出ない
   - もう一度押すと外れる。知らない値（"yes" など）はオフへ（reconcile）
   - daily の紙の下の角：オンなら丸い（V21）、オフなら角のまま
   - 日記の抜き出し：オンなら五行、オフなら三行（V21）
   - ノートの道具の帯：オンならぼかし無しの無地（V10）、オフならガラス
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/v2-switch.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("v2-switch");
  const { browser, page, errors } = await open();

  const mark = () => page.evaluate(() => document.documentElement.classList.contains("is-v2"));
  const saved = () => page.evaluate(() => KN.store.get().settings.v2);
  const dailyCorner = () => page.evaluate(() => {
    const e = document.querySelector("#screen-archive .tl-sheet.is-daily");
    return e ? getComputedStyle(e).borderBottomLeftRadius : "";
  });
  /* 道具の帯は書く紙の中にしか無いので、同じ名前の器を一つ置いて測る。 */
  const toolsBlur = () => page.evaluate(() => {
    const e = document.createElement("div");
    e.className = "note-tools";
    document.body.appendChild(e);
    const s = getComputedStyle(e);
    const v = s.backdropFilter || s.webkitBackdropFilter || "";
    e.remove();
    return v;
  });
  const clamp = () => page.evaluate(() => {
    const e = document.createElement("span");
    e.className = "arc-then-memo";
    document.body.appendChild(e);
    const v = getComputedStyle(e).webkitLineClamp;
    e.remove();
    return v;
  });
  const tabs = ["archive", "todo", "list", "diet"];
  const tabsOpen = async (label) => {
    for (const id of tabs) {
      await page.locator(`.tab[data-tab="${id}"]`).click();
      await page.waitForTimeout(400);
      const ok = await page.evaluate((i) => {
        const s = document.getElementById(`screen-${i}`);
        return !!s && s.classList.contains("is-active") && s.getBoundingClientRect().height > 0;
      }, id);
      t.check(`${label}：${id} が開く`, ok);
    }
  };

  t.check("既定はオフ", (await saved()) === false);
  t.check("既定では印が無い", !(await mark()));
  await tabsOpen("オフ");

  const openLook = async () => {
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForTimeout(500);
    await page.locator(".set-layer:last-child .set-row", { hasText: "外観" }).first().click();
    await page.waitForTimeout(600);
  };
  await openLook();
  const more = page.locator(".set-layer:last-child details.set-more", { hasText: "試す" });
  t.check("「試す」は畳まれている", (await more.count()) === 1 && !(await more.evaluate((d) => d.open)));
  await more.locator("summary").click();
  await page.waitForTimeout(200);
  const sw = more.locator(".set-row.is-sw", { hasText: "2.0 の見た目" });
  t.check("開くとスイッチが一つ", (await sw.count()) === 1);
  await sw.click();
  await page.waitForTimeout(300);
  t.check("押すと印が付く", await mark());
  t.check("記録にも残る", (await saved()) === true);
  const more2 = page.locator(".set-layer:last-child details.set-more", { hasText: "試す" });
  t.check("押しても奥は畳まれない", await more2.evaluate((d) => d.open));
  t.check("スイッチはオン", (await more2.locator(".set-row.is-sw").getAttribute("aria-checked")) === "true");

  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  t.check("読み直しても印が付いている", await mark());
  await tabsOpen("オン");
  t.check("オン：daily の紙は下の角も丸い", (await dailyCorner()) === "22px", await dailyCorner());
  t.check("オン：日記の抜き出しは五行", (await clamp()) === "5", await clamp());
  t.check("オン：ノートの道具の帯はぼかさない", (await toolsBlur()) === "none", await toolsBlur());

  await openLook();
  const more3 = page.locator(".set-layer:last-child details.set-more", { hasText: "試す" });
  await more3.locator("summary").click();
  await page.waitForTimeout(200);
  await more3.locator(".set-row.is-sw").click();
  await page.waitForTimeout(300);
  t.check("もう一度押すと外れる", !(await mark()) && (await saved()) === false);
  t.check("オフ：daily の紙の下は角のまま", (await dailyCorner()) === "0px", await dailyCorner());
  t.check("オフ：日記の抜き出しは三行", (await clamp()) === "3", await clamp());
  t.check("オフ：ノートの道具の帯はガラス", /blur/.test(await toolsBlur()), await toolsBlur());

  /* 知らない値はオフへ。直に書いた値が読み直しで届くことを、true で先に確かめる
     （届かなければ「オフ」が素通りで通ってしまう）。 */
  const inject = async (v) => {
    await page.evaluate((val) => {
      KN.store.flush && KN.store.flush();
      const raw = JSON.parse(localStorage.getItem("kaimono-note-v2"));
      raw.settings.v2 = val;
      localStorage.setItem("kaimono-note-v2", JSON.stringify(raw));
    }, v);
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app);
    await page.waitForTimeout(300);
  };
  await inject(true);
  t.check("直に書いた true は届く", (await saved()) === true && (await mark()));
  await inject("yes");
  t.check("知らない値はオフ", (await saved()) === false && !(await mark()));

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
