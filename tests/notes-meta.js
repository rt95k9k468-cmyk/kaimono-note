/* ノートの書く紙の頭まわり（2026年10月1日、iPhone で見た4つ）。決めごとは docs/notes.md。

   長い題は折り返して全部見える／日時を押すと年・月・日の回る列、回して閉じると
   作った日が変わる（時刻はそのまま・更新日と並びは動かない・読み直しても残る）／
   ノートブックの本の絵は名前から決まった色／タグの小窓は画面の中に収まる。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-meta.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-meta");
  const { browser, page, errors } = await open();

  const active = () => page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  const tab = (id) => page.click(`.tab[data-tab="${id}"]`);
  const toNotes = async () => {
    if ((await active()) === "notes") return;
    if ((await active()) !== "archive") { await tab("archive"); await settled("archive"); }
    await tab("archive");
    await settled("notes");
  };
  const openCard = async (id) => {
    await page.click(`#screen-notes .note-row[data-id="${id}"] .js-open`);
    await page.waitForSelector(".sheet.is-note.is-open");
    await page.waitForTimeout(500);
  };
  const closeNote = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-note.is-open"), null, { timeout: 4000 });
    await page.waitForTimeout(400);
  };
  const popEsc = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".note-pop-cover"), null, { timeout: 3000 });
    await page.waitForTimeout(150);
  };

  await page.evaluate(() => KN.notes.ready());
  await toNotes();

  const id = await page.evaluate(() => {
    const n = KN.notes.draft();
    KN.notes.put(n);
    KN.notes.edit(n.id, {
      title: "『見えない偏見の科学』栗田季佳 Kurita Kika 心の中に潜んでいるもの",
      body: "p17\n本文",
    });
    KN.notes.setLabels(n.id, { notebook: "学び", tags: ["Evernote"] });
    return n.id;
  });
  /* 二つめ（並びが動かないことを見る相手）。あとから置いたので、こちらが先頭。 */
  await page.evaluate(() => {
    const n = KN.notes.draft();
    KN.notes.put(n);
    KN.notes.edit(n.id, { title: "あとのノート", body: "x" });
  });
  await page.waitForTimeout(200);
  const before = await page.evaluate((i) => ({ ...KN.notes.get(i) }), id);

  /* ---- 一覧のノートブックの色 ---- */
  const cardNb = await page.$eval(`#screen-notes .note-row[data-id="${id}"] .note-nb .nb-ico`,
    (e) => ({ cat: e.style.getPropertyValue("--cat"), color: getComputedStyle(e).color }));
  t.check("カードの本の絵に名前の色", /^#/.test(cardNb.cat) && cardNb.color !== "", JSON.stringify(cardNb));
  const chipNb = await page.$eval("#screen-notes .notes-chips .js-pick[data-k=nb] .nb-ico",
    (e) => e.style.getPropertyValue("--cat"));
  t.check("チップの本の絵も同じ色", chipNb === cardNb.cat, chipNb);

  await openCard(id);

  /* ---- 長い題は折り返す ---- */
  const tt = await page.$eval(".sheet.is-note .note-title-in", (e) => {
    const lh = parseFloat(getComputedStyle(e).lineHeight) || 30;
    return { h: e.getBoundingClientRect().height, lh, sw: e.scrollWidth, cw: e.clientWidth, tag: e.tagName, val: e.value };
  });
  t.check("長い題は二行以上に折り返す", tt.tag === "TEXTAREA" && tt.h > tt.lh * 1.5, JSON.stringify(tt));
  t.check("題が横へはみ出さない", tt.sw <= tt.cw + 1, JSON.stringify(tt));
  /* 貼った改行は空白に（題は一行のもの）。 */
  await page.$eval(".sheet.is-note .js-title", (e) => {
    e.value = "改行\nのある題";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  t.check("題の改行は空白になる", await page.$eval(".sheet.is-note .js-title", (e) => e.value) === "改行 のある題");
  await page.$eval(".sheet.is-note .js-title", (e, v) => {
    e.value = v;
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, before.title);

  /* ---- 頭のノートブックも色 ---- */
  const headNb = await page.$eval(".sheet.is-note .js-nb", (e) => e.style.getPropertyValue("--cat"));
  t.check("頭の行のノートブックも同じ色", headNb === cardNb.cat, headNb);

  /* ---- タグの小窓は画面の中 ---- */
  await page.click(".sheet.is-note .note-tag-add");
  await page.waitForSelector(".note-pop.is-pick.is-open");
  await page.waitForTimeout(300);
  const pr = await page.$eval(".note-pop.is-pick", (e) => {
    const r = e.getBoundingClientRect();
    return { l: r.left, r: r.right, vw: document.documentElement.clientWidth };
  });
  t.check("タグの小窓が画面の左右に収まる", pr.l >= 0 && pr.r <= pr.vw, JSON.stringify(pr));
  await popEsc();

  /* 題を直したので、ここで測り直す（以下は日を変えても動かないことを見る）。 */
  const upd0 = await page.evaluate((i) => KN.notes.get(i).updatedAt, id);
  const ord0 = await page.evaluate(() => KN.notes.list().map((n) => n.id));
  /* ---- 日時を押すと回る列。回して閉じると作った日が変わる ---- */
  await page.click(".sheet.is-note .js-when");
  await page.waitForSelector(".note-pop.is-wheel.is-open");
  await page.waitForTimeout(300);
  const wr = await page.$eval(".note-pop.is-wheel", (e) => {
    const r = e.getBoundingClientRect();
    return { l: r.left, r: r.right, vw: document.documentElement.clientWidth, cols: e.querySelectorAll(".note-wheel").length };
  });
  t.check("年・月・日の三列が画面の中に出る", wr.cols === 3 && wr.l >= 0 && wr.r <= wr.vw, JSON.stringify(wr));
  const sel0 = await page.$$eval(".note-wheel [aria-selected=true]", (rs) => rs.map((r) => r.textContent));
  const b = new Date(before.createdAt);
  t.check("はじめはいまの作った日が真ん中", sel0.join("") === `${b.getFullYear()}年${b.getMonth() + 1}月${b.getDate()}日`, sel0.join(""));

  /* 2019年3月31日へ。月を2月へ回すと日は28日へ詰まる。 */
  const spin = (i, v) => page.evaluate(([i2, v2]) => {
    const w = document.querySelectorAll(".note-wheel")[i2];
    const k = [...w.children].findIndex((r) => r.dataset.v === String(v2));
    w.scrollTop = k * 40;
    return k;
  }, [i, v]);
  await spin(0, 2019); await page.waitForTimeout(300);
  await spin(1, 3); await page.waitForTimeout(300);
  await spin(2, 31); await page.waitForTimeout(300);
  await spin(1, 2); await page.waitForTimeout(300);
  const sel1 = await page.$$eval(".note-wheel [aria-selected=true]", (rs) => rs.map((r) => r.textContent));
  t.check("2月に回すと31日は28日へ", sel1.join("") === "2019年2月28日", sel1.join(""));
  const days = await page.$$eval(".note-wheel:nth-child(3) .note-wheel-row", (rs) => rs.length);
  t.check("2019年2月の日は28まで", days === 28, String(days));
  /* 行を押しても回る。 */
  await page.evaluate(() => {
    const w = document.querySelectorAll(".note-wheel")[2];
    [...w.children].find((r) => r.dataset.v === "14").click();
  });
  await page.waitForTimeout(700);
  await popEsc();

  const after = await page.evaluate((i) => ({ ...KN.notes.get(i) }), id);
  const a = new Date(after.createdAt);
  t.check("作った日が 2019年2月14日 に", a.getFullYear() === 2019 && a.getMonth() === 1 && a.getDate() === 14, after.createdAt);
  t.check("時刻はそのまま", a.getHours() === b.getHours() && a.getMinutes() === b.getMinutes(), `${a.getHours()}:${a.getMinutes()}`);
  t.check("更新日は動かない", after.updatedAt === upd0, after.updatedAt);
  const shown = await page.$eval(".sheet.is-note .js-when", (e) => e.textContent);
  t.check("日時の字が変わる", shown.startsWith("2019年2月14日(木)"), shown);

  await closeNote();
  const order1 = await page.$$eval("#screen-notes .notes-list .note-row", (rs) => rs.map((r) => r.dataset.id));
  t.check("一覧の並びは動かない", JSON.stringify(ord0) === JSON.stringify(order1), JSON.stringify(order1));

  /* ---- 読み直しても残る ---- */
  await page.evaluate(() => KN.notes.flush());
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.notes);
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.notes.ready());
  const kept = await page.evaluate((i) => KN.notes.get(i).createdAt, id);
  t.check("読み直しても作った日が残る", kept === after.createdAt, kept);

  t.check("ページのエラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
