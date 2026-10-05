/* 2.0 の見た目を既定にした（docs/roadmap-2.0.md の V26。前は V1 の切り替えの試験）。
   - 設定 → 外観に「試す」も「2.0 の見た目」も無い。html に .is-v2 は付かない
   - 記録に v2: true が残っていても読み込めて、鍵は消えない（後方互換）
   - 四つのタブが開いてエラーが出ない
   - daily の紙の下の角は丸い（V21）・日記の抜き出しは五行（V21）
   - ノートの道具の帯は白を少し透かした面（V10・V26。--glass-* は読まない）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/v2-switch.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("v2-switch");
  const { browser, page, errors } = await open();

  const mark = () => page.evaluate(() => document.documentElement.classList.contains("is-v2"));
  /* 道具の帯・抜き出しは開かないと無いので、同じ名前の器を一つ置いて測る。 */
  const probe = (cls, tag) => page.evaluate(([c, g]) => {
    const e = document.createElement(g);
    e.className = c;
    document.body.appendChild(e);
    const s = getComputedStyle(e);
    const v = { blur: s.backdropFilter || s.webkitBackdropFilter || "", bg: s.backgroundColor, img: s.backgroundImage, clamp: s.webkitLineClamp };
    e.remove();
    return v;
  }, [cls, tag]);

  t.check("印は付かない", !(await mark()));

  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "外観" }).first().click();
  await page.waitForTimeout(600);
  const look = await page.evaluate(() => document.querySelector(".set-layer:last-child").textContent);
  t.check("外観に「試す」も「2.0 の見た目」も無い", !/2\.0 の見た目/.test(look) && !/試す/.test(look));

  /* 前の版で切り替えをオンにしていた記録 */
  await page.evaluate(() => {
    KN.store.flush && KN.store.flush();
    const raw = JSON.parse(localStorage.getItem("kaimono-note-v2")) || JSON.parse(JSON.stringify(KN.store.get()));
    raw.settings.v2 = true;
    localStorage.setItem("kaimono-note-v2", JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  t.check("v2: true の記録も読み込め、鍵は残る", (await page.evaluate(() => KN.store.get().settings.v2)) === true);
  t.check("それでも印は付かない", !(await mark()));

  for (const id of ["archive", "todo", "list", "diet"]) {
    await page.locator(`.tab[data-tab="${id}"]`).click();
    await page.waitForTimeout(400);
    const ok = await page.evaluate((i) => {
      const s = document.getElementById(`screen-${i}`);
      return !!s && s.classList.contains("is-active") && s.getBoundingClientRect().height > 0;
    }, id);
    t.check(`${id} が開く`, ok);
  }

  await page.locator('.tab[data-tab="archive"]').click();
  await page.waitForTimeout(400);
  const corner = await page.evaluate(() => {
    const e = document.querySelector("#screen-archive .tl-sheet.is-daily");
    return e ? parseFloat(getComputedStyle(e).borderBottomLeftRadius) : -1;
  });
  t.check("daily の紙の下の角は丸い", corner > 0, String(corner));
  t.check("日記の抜き出しは五行", (await probe("arc-then-memo", "span")).clamp === "5");
  const clamped = await probe("arc-log-memo is-clamped", "span");
  t.check("切った Daily Log も五行", clamped.clamp === "5", JSON.stringify(clamped));
  const tools = await probe("note-tools", "div");
  t.check("道具の帯は白を少し透かした面（ガラスの重ねは読まない）",
    /blur/.test(tools.blur) && tools.img === "none" && /(rgba\(.*, 0\.\d+\)|\/ 0\.\d+\))$/.test(tools.bg), JSON.stringify(tools));

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
