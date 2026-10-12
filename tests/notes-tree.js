/* ノートの階層（docs/notes-unify.md の段1）。ノートの中にノート（何段でも）。

   データ：`parent` の無い・見つからない・消した親 → 一番上に並べるだけ（書き換えない）／輪は id の一番小さい
   ノートを一番上へ（データはそのまま）／移す（自分・子孫の下へは移さない・子孫まで同じノートブック・
   更新日は動かない）／ノートブックを替えると一番上へ／消すと子孫も同じ時刻の印・戻すと一緒に戻る
   （先に消した子はそのまま）／中にノートがあれば空でも drop しない／書き出しに parent・復元で合わせても
   今あるノートの親はこちらのまま／localStorage が変わらない。
   画面：最初の面はホーム（★・最近直した・ノートブックの行。頭に「すべてのノート」＝今の一覧）／ノートブックの面は
   一番上のノートだけ／帯に ‹ と面の名前／一覧の子のカードに親の題／書く紙の道すじ・中のノート・紙を重ねる／
   「⋯」の中にノートを足す・移す／席をもう一度押すとホーム／ホームで探すと一覧。
   段1b：帯の道すじ「Notes ›」／左端から引いて戻る／書き出しはフォルダの入れ子（頭に id・parent）／幅のある画面の木。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-tree.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-tree");
  const { browser, page, errors } = await open();

  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  const lsSize = () => page.evaluate(() => {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      n += k.length + (localStorage.getItem(k) || "").length;
    }
    return n;
  });
  const papers = () => page.$$eval(".sheet.is-note", (s) => s.length);
  const openPapers = (n) => page.waitForFunction((k) => document.querySelectorAll(".sheet.is-note.is-open").length === k
    && document.querySelectorAll(".sheet.is-note").length === k, n, { timeout: 4000 });
  const ground = (sel) => page.$$eval(`#screen-notes ${sel}`, (rs) => rs.map((r) => r.textContent.trim()));
  /* 面の名前（道すじ「Notes ›」は除く）。 */
  const headName = () => page.$eval("#head .head-name", (e) => [...e.querySelectorAll(".head-name-t > :not(.head-crumb, .head-crumb-sep)")]
    .map((x) => x.textContent).join("").trim() || e.textContent.trim());
  /* いちばん上に重なった紙の中。 */
  const top = (sel) => page.locator(".sheet.is-note.is-open").last().locator(sel);
  const texts = (sel) => top(sel).evaluateAll((r) => r.map((e) => e.textContent.trim()));
  const menu = async (word) => {
    await top(".js-note-more").click();
    await page.waitForSelector(".note-pop-item");
    await page.evaluate((w) => [...document.querySelectorAll(".note-pop-item")].find((b) => b.textContent.includes(w)).click(), word);
  };

  await page.evaluate(() => KN.notes.ready());
  const ls0 = await lsSize();

  /* ---------------- データ ---------------- */
  const d = await page.evaluate(() => {
    const N = KN.notes;
    const mk = (title, extra) => { const n = Object.assign(N.draft(), extra || {}); N.put(n); N.edit(n.id, { title, body: "本文" }); return n; };
    const top = mk("家", { notebook: "暮らし" });
    const kid = mk("台所", { notebook: "暮らし", parent: top.id });
    const grand = mk("鍋", { notebook: "暮らし", parent: kid.id });
    const lost = mk("迷子", { notebook: "暮らし", parent: "n-nowhere" });
    const tr = N.tree();
    const r = {};
    r.kids = tr.kids(top.id).map((n) => n.title).join();
    r.tops = tr.tops("暮らし").map((n) => n.title).join();
    r.path = tr.path(grand.id).map((n) => n.title).join("›");
    r.lostKept = N.get(lost.id).parent === "n-nowhere";
    /* 輪：二台が同時に移したつもりで、欄を直に。 */
    const a = mk("甲", { id: "n-ring-b" });
    const b = mk("乙", { id: "n-ring-a" });
    N.get(a.id).parent = b.id;
    N.get(b.id).parent = a.id;
    const tr2 = N.tree();
    r.ring = [tr2.parentOf("n-ring-a"), tr2.parentOf("n-ring-b") && tr2.parentOf("n-ring-b").id].join();
    r.ringKept = N.get("n-ring-a").parent === "n-ring-b";
    delete N.get(a.id).parent;
    delete N.get(b.id).parent;
    /* 移す */
    const upd = N.get(grand.id).updatedAt;
    r.noSelf = N.move(top.id, top.id) === false;
    r.noLoop = N.move(top.id, grand.id) === false;
    const other = mk("仕事の机", { notebook: "仕事" });
    r.moved = N.move(kid.id, other.id);
    r.cascade = [N.get(kid.id).notebook, N.get(grand.id).notebook].join();
    r.updKept = N.get(grand.id).updatedAt === upd;
    r.under = N.tree().kids(other.id).map((n) => n.title).join();
    /* ノートブックを替えると一番上へ */
    N.setLabels(kid.id, { notebook: "暮らし" });
    r.relabel = [N.get(kid.id).parent === undefined, N.get(grand.id).notebook, N.get(grand.id).parent === kid.id].join();
    /* 消す・戻す */
    const solo = mk("先に消す子", { notebook: "暮らし", parent: kid.id });
    N.remove(solo.id);
    /* 先に消した印（同じミリ秒に二つ消すと印が揃ってしまうので、時刻をずらす）。 */
    N.get(solo.id).deletedAt = new Date(Date.now() - 60000).toISOString();
    const soloAt = N.get(solo.id).deletedAt;
    N.remove(kid.id);
    r.gone = [N.get(grand.id).deletedAt === N.get(kid.id).deletedAt, N.get(solo.id).deletedAt === soloAt].join();
    N.restore(kid.id);
    r.back = [N.get(grand.id).deletedAt === null, !!N.get(solo.id).deletedAt].join();
    N.restore(solo.id);
    /* 中にノートがあれば drop しない */
    const shell = N.draft();
    N.put(shell);
    mk("中身", { parent: shell.id });
    N.drop(shell.id);
    r.shellKept = !!N.get(shell.id);
    /* 書き出しと復元 */
    const ex = N.forExport().noteBook.notes;
    r.export = ex.find((n) => n.id === grand.id).parent === kid.id;
    r.ids = { top: top.id, kid: kid.id, grand: grand.id, other: other.id };
    return r;
  });
  t.check("中のノート・一番上・道すじ", d.kids === "台所" && d.tops.startsWith("家") && d.tops.includes("迷子") && d.path === "家›台所", JSON.stringify(d));
  t.check("見つからない親は一番上に出すだけ（欄は書き換えない）", d.lostKept);
  t.check("輪は id の一番小さいノートを一番上へ（データはそのまま）", d.ring === ",n-ring-a" && d.ringKept, d.ring);
  t.check("自分・自分の子孫の下へは移さない", d.noSelf && d.noLoop);
  t.check("移すと子孫まで同じノートブック・更新日は動かない", d.moved && d.cascade === "仕事,仕事" && d.updKept && d.under === "台所", d.cascade);
  t.check("ノートブックを替えると一番上へ（子孫もついてくる）", d.relabel === "true,暮らし,true", d.relabel);
  t.check("消すと子孫も同じ時刻の印（先に消した子はそのまま）", d.gone === "true,true", d.gone);
  t.check("戻すと一緒に消した子孫だけ戻る", d.back === "true,true", d.back);
  t.check("中にノートがあれば、空でも捨てない", d.shellKept);
  t.check("書き出しに parent が入る", d.export);

  const ids = d.ids;
  const merged = await page.evaluate(async (i) => {
    const N = KN.notes;
    const mine = N.forExport().noteBook;
    const later = new Date(Date.now() + 1000).toISOString();
    const book = { v: 1, notes: mine.notes.map((n) => (n.id === i.kid ? { ...n, body: "控えで直した", updatedAt: later, parent: i.other } : n))
      .concat([{ id: "n-from-file", title: "控えの子", body: "x", parent: i.top, notebook: "暮らし",
        createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" }]) };
    await N.merge(book);
    const r = [N.get(i.kid).body === "控えで直した", N.get(i.kid).parent === undefined, N.get("n-from-file").parent === i.top].join();
    N.move(i.kid, i.top);
    return r;
  }, ids);
  t.check("復元で合わせても、今あるノートの親はこちらのまま・無いノートは控えの親で入る", merged === "true,true,true", merged);

  /* ---------------- 画面 ---------------- */
  await page.evaluate((i) => KN.notes.setFav(i.grand, true), ids);
  await page.click('.tab[data-tab="notes"]');
  await settled("notes");
  t.check("最初の面はホーム（チップは無い）", !(await page.$("#screen-notes .notes-chips")) && !!(await page.$("#screen-notes .notes-books .js-all")));
  t.check("帯はホームでは Notes だけ", (await headName()) === "Notes" && !(await page.$("#head .js-notes-back")));
  const secs = await ground(".notes-sec");
  t.check("ホームに★・最近直した・ノートブック", secs.join() === "★,最近直した,ノートブック", secs.join());
  const nRecent = await page.evaluate(() => document.querySelectorAll("#screen-notes .notes-sec")[1].nextElementSibling.children.length);
  t.check("最近直したは5件まで", nRecent === 5, String(nRecent));
  const books = await ground(".notes-book");
  t.check("ノートブックの行の頭に「すべてのノート」", books[0] === "すべてのノート" && books.includes("暮らし") && books.includes("仕事"), books.join());

  await page.click('#screen-notes .notes-book.js-book:has-text("暮らし")');
  await page.waitForFunction(() => document.querySelector("#head .js-notes-back"));
  const tops = await ground(".notes-list .note-t");
  t.check("ノートブックの面は一番上のノートだけ", tops.includes("家") && !tops.includes("台所") && !tops.includes("鍋"), tops.join());
  t.check("帯にノートブックの名前と ‹", (await headName()) === "暮らし");
  const crumb = await page.$eval("#head .head-name", (e) => e.textContent.replace(/\s+/g, ""));
  t.check("帯に道すじ「Notes › 暮らし」", crumb === "Notes›暮らし", crumb);
  /* 左端から引いて戻る（段1b。iPhone で「‹ しかない」） */
  const edge = await page.$eval("#screen-notes", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 6, y: r.top + r.height * 0.6 }; });
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 280, edge.y + 4, { steps: 14 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"), null, { timeout: 4000 });
  await page.waitForFunction(() => !document.querySelector("#screen-notes .js-body").style.transform, null, { timeout: 4000 });
  t.check("左端から引くと一つ上の面へ（面は元の位置に）", !!(await page.$("#screen-notes .notes-books")));
  await page.click('#screen-notes .notes-book.js-book:has-text("暮らし")');
  await page.waitForFunction(() => document.querySelector("#head .js-notes-back"));
  await page.mouse.move(edge.x + 120, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 400, edge.y + 4, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  t.check("左端でなければ引いても戻らない", !!(await page.$("#head .js-notes-back")));
  await page.click("#head .js-notes-back");
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"));
  t.check("‹ でホームへ", !!(await page.$("#screen-notes .notes-books")));

  await page.click("#screen-notes .notes-book.js-all");
  await page.waitForSelector("#screen-notes .notes-chips");
  const nbLine = await page.$eval(`#screen-notes .note-row[data-id="${ids.grand}"] .note-nb`, (e) => e.textContent.trim());
  t.check("すべてのノートは今の一覧（チップ・子のカードに親の題）", nbLine === "暮らし › 台所", nbLine);
  t.check("帯に「すべてのノート」", (await headName()) === "すべてのノート");
  await page.click("#head .js-notes-home");
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"));
  t.check("道すじの Notes を押すとホーム", !!(await page.$("#screen-notes .notes-books")));
  await page.click("#screen-notes .notes-book.js-all");
  await page.waitForSelector("#screen-notes .notes-chips");
  await page.click('.tab[data-tab="notes"]');
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"));
  t.check("席をもう一度押すとホーム", !!(await page.$("#screen-notes .notes-books")));

  /* 書く紙：道すじ・中のノート・重ねる */
  await page.evaluate((i) => KN.screens.notes.open(i.grand), ids);
  await openPapers(1);
  const crumbs = await page.$$eval(".sheet.is-note .note-path button", (bs) => bs.map((b) => b.textContent.trim()));
  t.check("道すじ：ノートブック › 親たち", crumbs.join("›") === "暮らし›家›台所", crumbs.join("›"));
  await page.click('.sheet.is-note .note-path button:has-text("台所")');
  await openPapers(2);
  const kids = await texts(".note-kids .note-t");
  t.check("親の紙が上に重なり、本文の下に中のノート", kids.includes("鍋"), kids.join());
  await top(".js-close").click();
  await openPapers(1);
  await page.click(".sheet.is-note .js-close");
  await openPapers(0);

  await page.evaluate((i) => KN.screens.notes.open(i.kid), ids);
  await openPapers(1);
  await top('.note-kids .note-row:has-text("鍋") .js-open').click();
  await openPapers(2);
  await top('.note-path button:has-text("家")').click();
  await openPapers(3);
  /* 重ねた紙にある親は、そこまで戻る */
  await top(".js-close").click();
  await openPapers(2);
  await top('.note-path button:has-text("台所")').click();
  await openPapers(1);
  t.check("道すじの親が重ねた紙にあれば、そこまで戻る", (await papers()) === 1);

  /* 中にノートを足す */
  await menu("中にノートを足す");
  await openPapers(2);
  await page.keyboard.type("フライパン");
  const fresh = (await texts(".note-path button")).join("›");
  t.check("足した紙にも道すじ", fresh === "暮らし›家›台所", fresh);
  await top(".js-close").click();
  await openPapers(1);
  const kids2 = await page.$$eval(".sheet.is-note .note-kids .note-t", (r) => r.map((e) => e.textContent.trim()));
  t.check("足したノートが親の中に（作った順）", kids2[0] === "鍋" && kids2[kids2.length - 1] === "フライパン", kids2.join());
  const pan = await page.evaluate((i) => { const n = KN.notes.tree().kids(i.kid).find((x) => x.body.includes("フライパン")); return n && n.notebook; }, ids);
  t.check("足したノートは親と同じノートブック", pan === "暮らし", String(pan));

  /* 移す：自分と自分の中は選べない */
  await menu("移す");
  await page.waitForSelector(".notes-place");
  const off = await page.$$eval(".notes-place-row[aria-disabled=true]", (r) => r.map((e) => e.textContent.trim()));
  t.check("移す先：自分と自分の中のノートは選べない", off.includes("台所") && off.includes("鍋") && !off.includes("家"), off.join());
  await page.click('.notes-place-row.is-book:has-text("仕事")');
  await page.waitForFunction(() => !document.querySelector(".notes-place"));
  const after = await page.evaluate((i) => [KN.notes.get(i.kid).parent === undefined, KN.notes.get(i.kid).notebook, KN.notes.get(i.grand).notebook].join(), ids);
  t.check("ノートブックの行を選ぶと、その一番上へ（子孫もついてくる）", after === "true,仕事,仕事", after);
  const pathNow = await page.$eval(".sheet.is-note .note-path", (e) => e.hidden);
  t.check("一番上へ移したら道すじは消える", pathNow);
  await page.click(".sheet.is-note .js-close");
  await openPapers(0);

  /* ホームで探すと一覧 */
  await page.click("#head .js-search-btn");
  await page.fill("#screen-notes .js-search", "鍋");
  await page.waitForFunction(() => document.querySelector("#screen-notes .notes-chips"));
  const hits = await ground(".notes-list .note-t");
  t.check("ホームで探すと、今の一覧で当たったもの", hits.length === 1 && hits[0] === "鍋", hits.join());
  await page.fill("#screen-notes .js-search", "");
  await page.waitForFunction(() => document.querySelector("#screen-notes .notes-books"));

  /* ---------------- 段1b：書き出しはフォルダの入れ子 ---------------- */
  const zipped = await page.evaluate(async (i) => {
    const names = async (blob) => {
      const b = new Uint8Array(await blob.arrayBuffer());
      const dv = new DataView(b.buffer);
      const out = {};
      for (let at = 0; at + 30 <= b.length && dv.getUint32(at, true) === 0x04034b50;) {
        const nl = dv.getUint16(at + 26, true), xl = dv.getUint16(at + 28, true), sz = dv.getUint32(at + 18, true);
        out[new TextDecoder().decode(b.subarray(at + 30, at + 30 + nl))] = new TextDecoder().decode(b.subarray(at + 30 + nl + xl, at + 30 + nl + xl + sz));
        at += 30 + nl + xl + sz;
      }
      return out;
    };
    const E = KN.notesExport;
    const all = await names(E.zipNotes(E.notesIn(null)));
    const star = await names(E.zipNotes(E.notesIn({ k: "fav" })));
    return { all: Object.keys(all), nabe: all["仕事/台所/鍋.md"] || "", star: Object.keys(star), kid: i.kid };
  }, ids);
  t.check("中のノートは親の名前のフォルダへ（親.md と 親/子.md）",
    ["仕事/", "仕事/台所.md", "仕事/台所/", "仕事/台所/鍋.md", "仕事/台所/フライパン.md"].every((n) => zipped.all.includes(n)), zipped.all.join(" | "));
  t.check("頭に id と parent", zipped.nabe.includes(`parent: "${zipped.kid}"`) && /\nid: "/.test(zipped.nabe), zipped.nabe.slice(0, 200));
  t.check("親を書き出さないときも親のフォルダに", zipped.star.join() === "仕事/,仕事/台所/,仕事/台所/鍋.md", zipped.star.join());

  /* ---------------- 段1b：幅のある画面の木 ---------------- */
  t.check("電話の幅では木を出さない", !(await page.isVisible(".notes-tree")));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForSelector(".notes-tree", { state: "visible", timeout: 4000 });
  const rows = await page.$$eval(".notes-tree-row", (r) => r.map((e) => e.textContent.trim()));
  t.check("木：Notes・すべてのノート・ノートブック", rows[0] === "Notes" && rows[1] === "すべてのノート" && rows.includes("暮らし") && rows.includes("仕事"), rows.join());
  t.check("木：ホームに印", await page.$eval(".notes-tree .js-tree-home", (e) => e.getAttribute("aria-current") === "true"));
  await page.click('.notes-tree .js-tree-book:has-text("仕事")');
  await page.waitForFunction(() => document.querySelector("#head .js-notes-back"));
  const rows2 = await page.$$eval(".notes-tree-row", (r) => r.map((e) => e.textContent.trim()));
  t.check("木のノートブックを押すとその面へ・枝が開く", rows2.includes("台所") && !rows2.includes("鍋")
    && await page.$eval('.notes-tree .js-tree-book[aria-current="true"]', (e) => e.textContent.trim() === "仕事"), rows2.join());
  await page.click('.notes-tree .js-tree-note:has-text("台所") .notes-tree-twist');
  await page.waitForSelector('.notes-tree .js-tree-note:has-text("鍋")');
  await page.click('.notes-tree .js-tree-note:has-text("鍋")');
  await openPapers(1);
  const cur = await page.$eval('.notes-tree [aria-current="true"]', (e) => e.textContent.trim());
  t.check("木のノートを押すと紙を開き、そこに印", cur === "鍋", cur);
  await page.click(".sheet.is-note .js-close");
  await openPapers(0);
  await page.setViewportSize({ width: 390, height: 844 });

  t.check("localStorage が変わらない", (await lsSize()) === ls0);
  t.check("落ちない", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
