/* 棚の札（docs/notes.md「6つの棚」）。ホームの最近直したと棚のあいだに、棚の絵を一列に並べた札。

   札は棚の数だけ・字と数は出さない（aria-label に棚の名前）・一つ 44px 以上／留まる前は灯らない／
   押すとその棚の見出しが札のすぐ下へ（札は上の帯のすぐ下に留まる）・その札が灯る／閉じた棚（archive）は
   先に開いてから送る（notesShelfOpen に残る）／組み直しても押せて灯る／手で送っても札のすぐ下の棚が灯る／
   運ぶあいだは押せない・札は留まらず押せない／降りた面・棚の無いホームには出ない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-shelf-tabs.js */
const { open, checker } = require("./lib");

const SIX = ["thinking", "reading", "teaching", "learning", "living", "archive"];
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

(async () => {
  const t = checker("notes-shelf-tabs");
  const { browser, page, errors } = await open();
  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on");

  /* 棚の無いホームには出ない */
  await page.evaluate(() => KN.notes.addMany([{ id: "z-0", title: "ひとつ", body: "本文", notebook: "家", tags: [], fav: false,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null }]));
  await page.click('.tab[data-tab="notes"]');
  await page.waitForSelector("#screen-notes .notes-books .js-all");
  t.check("棚が無ければ札は出ない", !(await page.$("#screen-notes .nt-tabs")));

  await page.evaluate((six) => {
    const L = [];
    six.forEach((nb, k) => {
      for (let i = 0; i < 8; i++) {
        const at = `2026-0${k + 1}-0${i + 1}T00:00:00.000Z`;
        L.push({ id: `s-${nb}-${i}`, title: `${nb} の ${i}`, body: "本文", notebook: nb, tags: [], fav: false, createdAt: at, updatedAt: at, deletedAt: null });
      }
    });
    return KN.notes.addMany(L);
  }, SIX);
  await page.waitForSelector("#screen-notes .nt-tabs .nt-tab");
  await frames(page);

  const look = await page.evaluate(() => {
    const bar = document.querySelector("#screen-notes .nt-tabs");
    const tabs = [...bar.querySelectorAll(".nt-tab")];
    const flat = document.querySelector("#screen-notes .notes-flat");
    const tree = document.querySelector('#screen-notes .notes-books[role="tree"]');
    return { names: tabs.map((b) => b.getAttribute("aria-label")).join(), text: bar.innerText.trim(),
      small: tabs.filter((b) => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length,
      icons: tabs.every((b) => b.querySelector("svg")),
      between: !!flat && !!(flat.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING)
        && !!(bar.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING),
      lit: bar.querySelectorAll(".is-lit").length, count: document.querySelectorAll(".nt-tabs").length };
  });
  t.check("札は棚の数だけ・aria-label に棚の名前", look.names.split(",").sort().join() === SIX.slice().sort().join(), look.names);
  t.check("字と数は出さない（絵だけ）", look.text === "" && look.icons, look.text);
  t.check("一つ 44px 以上", look.small === 0, String(look.small));
  t.check("最近直したと棚のあいだ", look.between);
  t.check("留まる前は灯らない", look.lit === 0, String(look.lit));
  t.check("札は一つだけ", look.count === 1, String(look.count));

  /** 札・その棚の見出し・送る器の上端の位置。 */
  const where = (nb) => page.evaluate((x) => {
    const sc = KN.app.scrollerOf(document.getElementById("screen-notes"));
    const bar = document.querySelector("#screen-notes .nt-tabs").getBoundingClientRect();
    const head = document.querySelector(`.nt-shelf[data-shelf="${x}"] > .nt-row`);
    const lit = [...document.querySelectorAll(".nt-tab.is-lit")].map((b) => b.dataset.shelf).join();
    return { top: sc.getBoundingClientRect().top, barTop: bar.top, barBottom: bar.bottom, head: head.getBoundingClientRect().top,
      open: head.getAttribute("aria-expanded"), lit, y: sc.scrollTop };
  }, nb);
  const press = async (nb) => {
    await page.click(`#screen-notes .nt-tab[data-shelf="${nb}"]`);
    await page.waitForTimeout(900);   // 滑らかに送り終わるまで
    await frames(page);
  };
  /* 見出しは棚のカードの上の余白（--sp-2）ぶん下。札のすぐ下＝その余白のうち。 */
  const below = (w) => w.head - w.barBottom >= -1 && w.head - w.barBottom <= 12;

  await press("teaching");
  let w = await where("teaching");
  t.check("押すと札は上の帯のすぐ下に留まる", Math.abs(w.barTop - w.top) <= 1, JSON.stringify(w));
  t.check("押すとその棚の見出しが札のすぐ下へ", below(w), JSON.stringify(w));
  t.check("送ると、その棚の札が灯る", w.lit === "teaching", w.lit);

  w = await where("archive");
  t.check("archive は閉じて始まる", w.open === "false", w.open);
  await press("archive");
  w = await where("archive");
  t.check("閉じた棚は開いてから送る", w.open === "true" && below(w), JSON.stringify(w));
  t.check("開けたのは覚える（notesShelfOpen）", await page.evaluate(() => KN.store.get().settings.notesShelfOpen.archive === true));
  t.check("archive の札が灯る", w.lit === "archive", w.lit);

  /* 一番上へ戻すと灯らない */
  await page.evaluate(() => { KN.app.scrollerOf(document.getElementById("screen-notes")).scrollTop = 0; });
  await page.waitForTimeout(200);
  w = await where("thinking");
  t.check("留まる前に戻ると灯らない", w.lit === "", w.lit);

  /* 組み直しても効く */
  await page.evaluate(() => KN.screens.notes.render());
  await frames(page);
  await press("reading");
  w = await where("reading");
  t.check("組み直したあとも押すと送る", below(w), JSON.stringify(w));
  t.check("組み直したあとも灯る", w.lit === "reading", w.lit);

  /* 手で送っても、札のすぐ下の棚が灯る */
  await page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.getElementById("screen-notes"));
    const bar = document.querySelector("#screen-notes .nt-tabs");
    const g = document.querySelector('.nt-shelf[data-shelf="living"]');
    sc.scrollTop += g.getBoundingClientRect().top - bar.getBoundingClientRect().bottom + 40;
  });
  await page.waitForTimeout(200);
  w = await where("living");
  t.check("手で送ると、札のすぐ下の棚が灯る", w.lit === "living", w.lit);

  /* 運ぶあいだは押せない */
  const y0 = (await where("living")).y;
  await page.evaluate(() => KN.reorder.hold(true));
  await page.click('#screen-notes .nt-tab[data-shelf="thinking"]', { force: true });
  await page.waitForTimeout(500);
  t.check("運ぶあいだ（reorder）は押しても送らない", (await where("living")).y === y0);
  await page.evaluate(() => KN.reorder.hold(false));

  /* 長押しで運ぶ：札は留まらず、押せない（上端の自動送りと行き先をふさがない） */
  await page.evaluate(() => { KN.app.scrollerOf(document.getElementById("screen-notes")).scrollTop = 0; });
  await press("learning");
  const sel = '.js-tree-note[data-id="s-learning-3"]';
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 10, { steps: 3 });
  await page.waitForTimeout(700);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 14, { steps: 2 });
  await frames(page);
  const mid = await page.evaluate(() => {
    const bar = document.querySelector("#screen-notes .nt-tabs");
    const cs = getComputedStyle(bar);
    return { carrying: !!document.querySelector("#screen-notes .is-carrying"), pos: cs.position, pe: cs.pointerEvents };
  });
  t.check("運ぶあいだ札は留まらず押せない", mid.carrying && mid.pos !== "sticky" && mid.pe === "none", JSON.stringify(mid));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await frames(page);
  t.check("運ぶのをやめれば札はまた留まる", await page.evaluate(() => getComputedStyle(document.querySelector("#screen-notes .nt-tabs")).position === "sticky"));
  t.check("運ぶのをやめても並びは変わらない", await page.evaluate(() => KN.notes.tree().tops("learning").map((n) => n.id).join()
    === [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `s-learning-${i}`).join()));

  /* 降りた面には出ない */
  await page.evaluate(() => { KN.app.scrollerOf(document.getElementById("screen-notes")).scrollTop = 0; });
  await page.click("#screen-notes .notes-books .js-all");
  await page.waitForTimeout(300);
  t.check("降りた面には札が無い", !(await page.$("#screen-notes .nt-tabs")));

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
