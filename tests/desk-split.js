/* 境目を引いて幅を変える（docs/desk.md の「境目を引く」・design-review 10節の P5。js/desk-split.js）：
   - 左の列の右の線を引けば列の幅が変わり、中身はその右から。この端末だけ（localStorage `kn-split`、記録に入れない）・読み直しても残る
   - 二度押しで 232px へ。←→ で 16px・Home／End で端・Enter で元へ（日は送らない）
   - 窓が狭まれば中身に 600px を残す（窓 900px で 300px まで）・畳んだ列には口が無い
   - ノートの一覧（三列）の右の線も同じ。本文の段に 480px を残す
   - 指の端末（iPad の横）・電話には口が無く、残した幅も効かない
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-split.js */
const { open, checker } = require("./lib");

const look = (page) => page.evaluate(() => {
  const w = (q) => { const e = document.querySelector(q); return e ? Math.round(e.getBoundingClientRect().width) : null; };
  const s = document.querySelector(".split-rail"), l = document.querySelector(".split-list");
  const on = (e) => !!e && getComputedStyle(e).display !== "none";
  return {
    rail: w("#tabbar"), scr: Math.round(document.querySelector(".screen.is-active").getBoundingClientRect().left),
    split: on(s), splitL: on(l), now: s && s.getAttribute("aria-valuenow"),
    saved: localStorage.getItem("kn-split"),
  };
});

async function drag(page, sel, dx) {
  const b = await page.locator(sel).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(x + (dx * i) / 6, y); await page.waitForTimeout(20); }
  await page.mouse.up();
  await page.waitForTimeout(150);
}

(async () => {
  const t = checker("desk-split");
  {
    const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
    await page.evaluate(async () => {
      const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
      await KN.notes.addMany(["一つめ", "二つめ"].map((title, i) => ({ id: `n-split${i}`, title, body: "試しの本文",
        notebook: "private", tags: [], fav: false, createdAt: at(i), updatedAt: at(i), deletedAt: null })));
    });
    await page.waitForTimeout(500);
    let v = await look(page);
    t.check("口が線の上にある・引いていなければ 232px・何も残さない", v.split && v.rail === 232 && v.scr === 232 && v.now === "232" && v.saved === null, JSON.stringify(v));
    const before = await page.evaluate(() => JSON.stringify(KN.store.get().settings));

    await drag(page, ".split-rail", 68);
    v = await look(page);
    t.check("引くと列が広がり、中身はその右から・この端末に残す", v.rail === 300 && v.scr === 300 && v.now === "300"
      && JSON.parse(v.saved || "{}").rail === 300, JSON.stringify(v));
    const after = await page.evaluate(() => JSON.stringify(KN.store.get().settings));
    t.check("記録（設定）には入れない", before === after, `${before} → ${after}`);

    await page.reload();
    await page.waitForFunction(() => window.KN && KN.app);
    await page.waitForTimeout(600);
    v = await look(page);
    t.check("読み直しても同じ幅", v.rail === 300 && v.scr === 300, JSON.stringify(v));

    await drag(page, ".split-rail", 400);
    t.check("広げすぎても 360px まで", (await look(page)).rail === 360);
    await page.dblclick(".split-rail");
    await page.waitForTimeout(150);
    v = await look(page);
    t.check("二度押しで 232px へ・残したものも消える", v.rail === 232 && v.saved === null, JSON.stringify(v));

    /* キー：←→ は日を送らない。 */
    const day0 = await page.evaluate(() => document.querySelector(".screen.is-active").innerText.slice(0, 80));
    await page.focus(".split-rail");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    v = await look(page);
    const day1 = await page.evaluate(() => document.querySelector(".screen.is-active").innerText.slice(0, 80));
    t.check("→ で 16px ずつ・日は送らない・カーソルは口のまま", v.rail === 264 && day0 === day1
      && await page.evaluate(() => document.activeElement.matches(".split-rail")), JSON.stringify(v));
    await page.keyboard.press("Home");
    t.check("Home で 184px", (await look(page)).rail === 184);
    await page.keyboard.press("End");
    t.check("End で 360px", (await look(page)).rail === 360);
    await page.keyboard.press("Enter");
    v = await look(page);
    t.check("Enter で元へ", v.rail === 232 && v.saved === null, JSON.stringify(v));

    /* 窓が狭まれば中身に 600px を残す。 */
    await page.keyboard.press("End");
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(300);
    v = await look(page);
    t.check("窓 900px では 300px まで（中身 600px）・戻せば 360px", v.rail === 300 && v.now === "300", JSON.stringify(v));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    t.check("（戻した窓で）360px", (await look(page)).rail === 360);
    await page.keyboard.press("Enter");

    /* 畳んだ列には口が無い。 */
    await page.keyboard.press("Control+\\");
    await page.waitForTimeout(300);
    v = await look(page);
    t.check("畳んだ列は 64px・左の列の口は無い", v.rail === 64 && !v.split, JSON.stringify(v));

    /* ノートの一覧（三列。畳んだ列ではホームも一覧）。 */
    await page.click(".tab-notes");
    await page.waitForTimeout(800);
    const list = () => page.evaluate(() => {
      const g = document.querySelector("#screen-notes .notes-ground");
      const s = document.querySelector(".split-list");
      return { three: document.documentElement.classList.contains("notes-three"), g: Math.round(g.getBoundingClientRect().width),
        split: getComputedStyle(s).display !== "none", l: Math.round(s.getBoundingClientRect().right) };
    });
    let L = await list();
    t.check("ノートの三列：一覧は 380px・口は線のすぐ左", L.three && L.g === 380 && L.split && L.l === 64 + 380 + 1, JSON.stringify(L));
    await drag(page, ".split-list", 90);
    L = await list();
    t.check("一覧の線を引くと一覧が広がる", L.g === 470 && JSON.parse(await page.evaluate(() => localStorage.getItem("kn-split"))).list === 470, JSON.stringify(L));
    await page.click('#screen-notes [data-id="n-split0"]');
    await page.waitForSelector(".sheet.is-note.is-open");
    await page.waitForTimeout(500);
    const pane = await page.evaluate(() => Math.round(document.querySelector(".sheet.is-note.is-open").getBoundingClientRect().left));
    t.check("開いたノートの段は一覧の右から", pane === 64 + 470, String(pane));
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.waitForTimeout(400);
    L = await list();
    t.check("窓 1000px では本文の段に 480px を残す（一覧 456px）", L.three && L.g === 1000 - 64 - 480, JSON.stringify(L));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await page.dblclick(".split-list");
    await page.waitForTimeout(200);
    t.check("一覧も二度押しで 380px へ", (await list()).g === 380);
    t.check("エラーなし", !errors.length, errors.join(" | "));
    await browser.close();
  }
  {
    /* 指の端末（iPad の横）：口は無く、残した幅も効かない。 */
    const { browser, page, errors } = await open({ viewport: { width: 1180, height: 820 }, touch: true,
      before: (ctx) => ctx.addInitScript(() => localStorage.setItem("kn-split", JSON.stringify({ rail: 320, list: 500 }))) });
    await page.waitForTimeout(500);
    const v = await look(page);
    t.check("指の 1180px：口は無く 232px のまま", !v.split && v.rail === 232, JSON.stringify(v));
    t.check("指：エラーなし", !errors.length, errors.join(" | "));
    await browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
