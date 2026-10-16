/* 話題を立てる道（docs/notes-structure.md の段2）。

   「⋯」の束ねる：同じ段のノートから選ぶ（このノートは選んだまま）／題が空なら押せない／新しい話題は一番前のノートの
   場所に・選んだものは並びの順にその下へ（子孫ごと）／本文・更新日は動かない／控えを取ってから／元に戻す（話題は
   最近削除へ）。ノートへ移す紙（topics）：さがす前は thinking の束と問いの形の話題を最近足した順で先に、さがせば今までどおり。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-bundle.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-bundle");
  const { browser, page, errors } = await open();

  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on");
  await page.evaluate(async () => {
    const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
    let i = 0;
    const mk = (id, title, notebook, at, extra) => {
      i += 1;
      return Object.assign({ id, title, body: "x", notebook, tags: [], fav: false, pos: `a${i}`,
        createdAt: ago(400 - i), updatedAt: at, deletedAt: null }, extra || {});
    };
    await KN.notes.addMany([
      mk("b-a", "一", "thinking", ago(1)),
      mk("b-b", "二", "thinking", ago(2)),
      mk("b-c", "三", "thinking", ago(3)),
      mk("b-c1", "三の子", "thinking", ago(9), { parent: "b-c" }),
      mk("b-d", "四", "thinking", ago(4)),
      mk("b-r", "読む", "reading", ago(1)),
      mk("b-t", "古い束", "thinking", ago(50)),
      mk("b-t1", "古い束の子", "thinking", ago(5), { parent: "b-t" }),
      mk("b-q", "", "", ago(6), { body: "？なぜ書くのか\n答え" }),
      mk("b-q0", "", "", ago(1), { body: "？まだの問い" }),
    ]);
    KN.notes.setBooks(["thinking", "reading", "teaching", "learning", "living", "archive"]);
  });
  const snap = () => page.evaluate(() => ["b-a", "b-b", "b-c", "b-c1", "b-d"].map((id) => {
    const n = KN.notes.get(id); return `${id}:${n.body}:${n.updatedAt}`; }).join());
  const s0 = await snap();
  await page.evaluate(() => { const take = KN.backup.take; window.__took = []; KN.backup.take = (r, o) => { window.__took.push(r); return take(r, o); }; });

  await page.evaluate(() => KN.screens.notes.open("b-b"));
  await page.waitForSelector(".sheet.is-note.is-open .js-note-more");
  await page.click(".sheet.is-note.is-open .js-note-more");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "束ねる" }).click();
  await page.waitForSelector(".sheet.is-open .note-bundle-row");
  const rows = () => page.$$eval(".sheet.is-open .note-bundle-row", (xs) => xs.map((x) => `${x.dataset.id}${x.getAttribute("aria-pressed") === "true" ? "*" : ""}`).join());
  t.check("同じ段のノートを並びの順に・このノートは選んだまま（ほかの冊・中のノートは出ない）", (await rows()) === "b-a,b-b*,b-c,b-d,b-t", await rows());
  const ok = ".sheet.is-open .js-ok";
  t.check("題が空なら押せない", await page.$eval(ok, (b) => b.disabled));
  await page.click('.sheet.is-open .note-bundle-row[data-id="b-d"]');
  await page.click('.sheet.is-open .note-bundle-row[data-id="b-c"]');
  await page.fill(".sheet.is-open .js-topic", "書くこと");
  t.check("題と選んだものがあれば押せる", !(await page.$eval(ok, (b) => b.disabled)));
  await page.fill(".sheet.is-open .js-q", "四");
  t.check("さがしても選んだものは残る", (await rows()) === "b-b*,b-c*,b-d*", await rows());
  await page.click(ok);
  await page.waitForFunction(() => KN.notes.list().some((n) => n.title === "書くこと" && KN.notes.tree().kids(n.id).length === 3), null, { timeout: 4000 }).catch(() => {});
  const shape = () => page.evaluate(() => {
    const N = KN.notes, tr = N.tree();
    const top = tr.tops("thinking").map((n) => n.title || n.id).join();
    const p = N.list().find((n) => n.title === "書くこと");
    return { top, kids: p ? tr.kids(p.id).map((n) => n.id).join() : "", pid: p ? p.id : "", gone: p ? !!p.deletedAt : null };
  });
  let s = await shape();
  t.check("話題は一番前のノートの場所に", s.top === "一,書くこと,古い束", s.top);
  t.check("選んだものは並びの順にその下へ", s.kids === "b-b,b-c,b-d", s.kids);
  t.check("子孫ごと", await page.evaluate(() => KN.notes.get("b-c1").parent === "b-c"));
  t.check("本文・更新日は動かない", (await snap()) === s0);
  t.check("控えを取ってから", await page.evaluate(() => window.__took.includes("束ねる前")));
  await page.click(".toast .toast-action");
  await page.waitForTimeout(200);
  const pid = s.pid;
  s = await shape();
  t.check("元に戻す：並びが元へ", s.top === "一,二,三,四,古い束" && !s.kids, JSON.stringify(s));
  t.check("元に戻す：話題は最近削除へ", await page.evaluate((id) => { const n = KN.notes.get(id); return !!n && !!n.deletedAt; }, pid));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  /* ノートへ移す紙：さがす前は話題を最近足した順に先に。 */
  await page.evaluate(() => KN.screens.notes.pick(() => {}, { title: "ノートへ移す", fresh: "新しいノート", topics: "thinking" }));
  await page.waitForSelector(".sheet.is-open .note-ver[data-id]");
  const pick = () => page.evaluate(() => {
    const box = document.querySelector(".sheet.is-open .js-rows");
    return [...box.children].map((x) => (x.classList.contains("notes-sec") ? `[${x.innerText.trim()}]` : x.dataset.id)).join();
  });
  let p = await pick();
  t.check("話題が先に（中のノートも含めた最近の順・問いの形も・まだの問いは入らない）",
    p.startsWith("[話題],b-c,b-t,b-q,[すべて],") && !p.slice(p.indexOf("[すべて]")).includes("b-t,") && p.includes("b-q0"), p);
  await page.fill(".sheet.is-open .js-q", "束");
  await page.waitForTimeout(100);
  p = await pick();
  t.check("さがせば今までどおり（見出しなし）", !p.includes("[") && p.includes("b-t"), p);
  await page.keyboard.press("Escape");

  t.check("落ちずに", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
