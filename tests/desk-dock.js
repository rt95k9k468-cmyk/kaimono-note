/* 右の段のノートが閉じるあいだ、段の形のまま（docs/log/design-review.md 10節の P7。docs/desk.md の P3b）。
   - ホームで開いたまま「すべてのノート」：一覧が左に入って段の左端が 380px 動くが、閉じる紙は跳ばずにその場で閉じる
   - 右の段に開いたまま席を移る：席の印が先に替わっても、閉じる紙が真ん中の大きな紙の姿にならない
   閉じる動きは今までの紙の閉じ方（右へ --desk-shift 滑って薄れる）。動きは足さない。
   - 段の紙がずれる幅は席の移り・「›」と同じ --desk-shift（P7）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-dock.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("desk-dock");
  const { browser, page, errors } = await open({ viewport: { width: 1180, height: 900 } });
  await page.evaluate(async () => {
    const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
    await KN.notes.addMany(["一つめ", "二つめ"].map((title, i) => ({ id: `n-k${i}`, title, body: "本文", notebook: "private",
      tags: [], fav: false, createdAt: at(i), updatedAt: at(i), deletedAt: null })));
  });
  await page.click(".tab-notes");
  await page.waitForTimeout(600);

  /** act の間、閉じていく紙の箱を毎コマ取る。 */
  const closing = async (act) => {
    await page.evaluate(() => {
      window.__f = [];
      const t0 = performance.now();
      const tick = () => {
        const e = document.querySelector(".sheet.is-note");
        if (e) { const r = e.getBoundingClientRect(); window.__f.push({ l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) }); }
        if (performance.now() - t0 < 600) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await act();
    await page.waitForTimeout(700);
    return page.evaluate(() => ({ f: window.__f, left: document.querySelectorAll(".sheet.is-note").length }));
  };
  const inPlace = (f, at) => f.length > 0 && f.every((r) => r.t === at.t && r.w === at.w && r.l >= at.l - 1 && r.l <= at.l + 33);

  /* 1. ホームの札から開いて、すべてのノートへ。 */
  await page.click(".nt-card >> nth=0");
  await page.waitForSelector(".sheet.is-note.is-open.is-docked");
  await page.waitForTimeout(500);
  const a = await page.evaluate(() => { const r = document.querySelector(".sheet.is-note").getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) }; });
  const r1 = await closing(() => page.click(".js-tree-all"));
  t.check("すべてのノートへ：閉じる紙は段の形のまま（一覧のぶん跳ばない）", inPlace(r1.f, a) && r1.left === 0,
    JSON.stringify({ a, f: r1.f.filter((x, i, s) => i === 0 || JSON.stringify(x) !== JSON.stringify(s[i - 1])).slice(0, 6), left: r1.left }));
  t.check("一覧が出ている", await page.evaluate(() => document.documentElement.classList.contains("notes-mid")));

  /* 2. 一覧から開いて、席を移る。 */
  await page.click("#screen-notes .note-row.is-card >> nth=0");
  await page.waitForSelector(".sheet.is-note.is-open.is-docked");
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => { const r = document.querySelector(".sheet.is-note").getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) }; });
  t.check("一覧から開いた段は一覧の右から", Math.abs(b.l - (232 + 380)) <= 1, JSON.stringify(b));
  const r2 = await closing(() => page.keyboard.press("3"));
  t.check("席を移る：閉じる紙は段の形のまま（真ん中の紙の姿にならない）", inPlace(r2.f, b) && r2.left === 0,
    JSON.stringify({ b, f: r2.f.filter((x, i, s) => i === 0 || JSON.stringify(x) !== JSON.stringify(s[i - 1])).slice(0, 6), left: r2.left }));
  t.check("席は移った", await page.evaluate(() => document.documentElement.dataset.screen === "todo"));

  /* 3. 段の紙が開く前のずれは desk のずらす幅（--desk-shift）と同じ。 */
  await page.click(".tab-notes");
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__x = null;
    const t0 = performance.now();
    const tick = () => {
      const e = document.querySelector(".sheet.is-note");
      if (e) window.__x = new DOMMatrix(getComputedStyle(e).transform).m41;
      else if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.click("#screen-notes :is(.note-row.is-card, .nt-card) >> nth=0");
  await page.waitForSelector(".sheet.is-note.is-open.is-docked");
  const shift = await page.evaluate(() => ({
    want: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--desk-shift")), first: window.__x }));
  t.check("段の紙は --desk-shift だけずれて入る（席の移り・「›」と揃う）", shift.want > 0 && Math.abs(shift.first - shift.want) < 0.5, JSON.stringify(shift));

  t.check("エラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
