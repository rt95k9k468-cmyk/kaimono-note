/* ノートの階層（docs/notes-unify.md の段1）。ノートの中にノート（何段でも）。

   データ：`parent` の無い・見つからない・消した親 → 一番上に並べるだけ（書き換えない）／輪は id の一番小さい
   ノートを一番上へ（データはそのまま）／移す（自分・子孫の下へは移さない・子孫まで同じノートブック・
   更新日は動かない）／ノートブックを替えると一番上へ／消すと子孫も同じ時刻の印・戻すと一緒に戻る
   （先に消した子はそのまま）／中にノートがあれば空でも drop しない／書き出しに parent・復元で合わせても
   今あるノートの親はこちらのまま／localStorage が変わらない。
   画面：最初の面はホーム（★・最近直した（行）・ノートブックの木。頭に「すべてのノート」＝今の一覧と「問い」）／
   ③：ノートブックはその場に開く（面は移らない）・▸ で開け閉め・段の縦線・開いた枝の三段は上に留まる・5段目から
   字下げは半分ずつ・木から開いた紙を閉じるとその行に印（移したら移した先で）・頭のある冊は名前で頭の紙・＋はその冊に
   （頭の中に）・道すじの冊（頭なし）はホームの木に印／帯に ‹ と面の名前／一覧の子のカードに親の題（頭は重ねない）／
   書く紙の道すじ・中のノート（木の行）・紙を重ねる／「⋯」の中にノートを足す・移す／席をもう一度押すとホーム／
   ホームで探すと一覧。
   段1b：帯の道すじ「Notes ›」／右へ払って戻る（どこからでも）／書き出しはフォルダの入れ子（頭に id・parent）／幅のある画面の木。

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
  /* 頭のある冊（取り込んだ Notion の一番上のページ）と、深い枝（字下げを詰める） */
  await page.evaluate(() => {
    const at = "2026-10-01T00:00:00.000Z";
    const nb = (id, title, notebook, x) => ({ id, title, body: "本文", notebook, tags: [], fav: false, createdAt: at, updatedAt: at, deletedAt: null, ...x });
    const deep = [];
    for (let i = 1; i <= 6; i++) deep.push(nb(`n-deep-${i}`, `深さ${i}`, "深い", i > 1 ? { parent: `n-deep-${i - 1}` } : {}));
    return KN.notes.addMany([nb("n-head", "冊の頭", "冊", { head: true }), nb("n-head-kid", "冊の子", "冊", { parent: "n-head" }), ...deep]);
  });
  await page.evaluate((i) => KN.notes.setFav(i.grand, true), ids);
  await page.click('.tab[data-tab="notes"]');
  await settled("notes");
  t.check("最初の面はホーム（チップは無い）", !(await page.$("#screen-notes .notes-chips")) && !!(await page.$("#screen-notes .notes-books .js-all")));
  t.check("帯はホームでは Notes だけ", (await headName()) === "Notes" && !(await page.$("#head .js-notes-back")));
  const secs = await ground(".notes-sec");
  t.check("ホームに★・最近直した・ノートブック", secs.join() === "★,最近直した,ノートブック", secs.join());
  const nRecent = await page.evaluate(() => document.querySelectorAll("#screen-notes .notes-sec")[1].nextElementSibling.children.length);
  t.check("最近直したは5件まで（行。カードは「すべてのノート」だけ）", nRecent === 5 && !(await page.$("#screen-notes .notes-books .note-row")), String(nRecent));
  const treeTop = '.notes-books[role="tree"] > .nt-row, .notes-books[role="tree"] > .nt-grp > .nt-row';
  const heads = await ground(treeTop);
  t.check("ノートブックの木：頭に「すべてのノート」「問い」、続けてノートブック", heads[0] === "すべてのノート" && heads[1] === "問い"
    && heads.includes("暮らし") && heads.includes("仕事"), heads.join());
  const book = (nb) => `#screen-notes .js-book[data-nb="${nb}"]`;
  const note = (title) => `#screen-notes .notes-books[role="tree"] .js-tree-note:has(> .nt-name:text-is("${title}"))`;

  /* ③：ノートブックはその場に開く（面は移らない） */
  await page.click(`${book("暮らし")} .nt-name`);
  await page.waitForSelector(note("家"));
  t.check("頭の無いノートブックは名前でもその場に開く（面は移らない）", !(await page.$("#head .js-notes-back"))
    && (await page.$eval(book("暮らし"), (e) => e.getAttribute("aria-expanded"))) === "true");
  const tops = await ground('.notes-books[role="tree"] .js-tree-note .nt-name');
  t.check("開くと一番上のノートだけ（中は ▸ で）", tops.includes("家") && !tops.includes("台所") && !tops.includes("鍋"), tops.join());
  await page.click(`${note("家")} .nt-twist`);
  await page.waitForSelector(note("台所"));
  await page.click(`${note("台所")} .nt-twist`);
  await page.waitForSelector(note("鍋"));
  const look = await page.$eval(note("鍋"), (e) => ({ d: e.style.getPropertyValue("--d"), lines: (e.style.backgroundImage.match(/linear-gradient|var\(--nt-line\)/g) || []).length }));
  t.check("段ごとに縦の線（先祖の数だけ）", look.d === "3" && look.lines === 3, JSON.stringify(look));
  const stuck = await page.$$eval("#screen-notes .nt-row.is-stick", (r) => r.map((e) => e.textContent.trim()));
  t.check("開いた枝の行は上に留まる（三段まで）", stuck.join() === "暮らし,家,台所", stuck.join());
  const sticky = await page.$eval(note("台所"), (e) => getComputedStyle(e).position);
  t.check("留まる行は sticky（箱は送る器にしない）", sticky === "sticky"
    && (await page.$eval('#screen-notes .notes-books[role="tree"]', (e) => getComputedStyle(e).overflowY)) === "clip", sticky);
  /* 深い枝：5段目から字下げは半分ずつ */
  await page.click(`${book("深い")} .nt-name`);
  for (let i = 1; i <= 5; i++) {
    await page.waitForSelector(note(`深さ${i}`));
    await page.click(`${note(`深さ${i}`)} .nt-twist`);
  }
  await page.waitForSelector(note("深さ6"));
  const us = await page.$$eval('#screen-notes .js-tree-note', (r) => r.filter((e) => /^深さ\d$/.test(e.textContent.trim()))
    .map((e) => e.style.getPropertyValue("--u")));
  t.check("5段目から字下げは半分ずつ", us.join() === "1,2,3,4,4.5,5", us.join());
  await page.click(`${book("深い")} .nt-twist`);
  t.check("▸ で閉じる", await page.waitForFunction(() => !document.querySelector('#screen-notes .js-tree-note[data-id="n-deep-1"]'), null, { timeout: 3000 })
    .then(() => true, () => false));

  /* 木から開いた紙を閉じると、木のその行に印（移したら、移した先で） */
  await page.click(`${note("鍋")} .nt-name`);
  await openPapers(1);
  await top(".js-close").click();
  await openPapers(0);
  const cur1 = await page.$eval('#screen-notes .notes-books[role="tree"] [aria-current="true"]', (e) => e.textContent.trim());
  t.check("木から開いた紙を閉じると、その行に印", cur1 === "鍋", cur1);
  await page.click(`${note("鍋")} .nt-name`);
  await openPapers(1);
  await menu("移す");
  await page.waitForSelector(".notes-place");
  await page.click('.notes-place-row.is-book:has-text("仕事")');
  await page.waitForFunction(() => !document.querySelector(".notes-place"));
  await top(".js-close").click();
  await openPapers(0);
  const cur2 = await page.evaluate(() => {
    const r = document.querySelector('#screen-notes .notes-books[role="tree"] [aria-current="true"]');
    const g = r && r.closest('.nt-grp:has(> .js-book)');
    return [r ? r.textContent.trim() : "", g ? g.querySelector(".js-book").dataset.nb : ""].join("@");
  });
  t.check("移したノートは、閉じると移した先の枝を開いて印", cur2 === "鍋@仕事", cur2);
  await page.evaluate((i) => KN.notes.move(i.grand, i.kid), ids);

  /* 頭のある冊：名前で頭の紙（中のノートは木の行）、＋は頭の中に */
  await page.click(`${book("冊")} .nt-name`);
  await openPapers(1);
  const headKids = await texts(".note-kids .nt-name");
  t.check("頭のある冊は名前で頭の紙（中のノートは木の行）", (await top(".js-title").inputValue()) === "冊の頭" && headKids.join() === "冊の子", headKids.join());
  await top(".js-close").click();
  await openPapers(0);
  await page.click(`${book("冊")} .nt-add`);
  await openPapers(1);
  await page.keyboard.type("冊に足した");
  await top(".js-close").click();
  await openPapers(0);
  const added = await page.evaluate(() => { const n = KN.notes.list().find((x) => x.title === "冊に足した" || x.body.includes("冊に足した")); return n ? [n.parent, n.notebook].join() : ""; });
  t.check("頭のある冊の＋は頭の中に", added === "n-head,冊", added);
  await page.click(`${book("暮らし")} .nt-add`);
  await openPapers(1);
  await page.keyboard.type("暮らしに足した");
  await top(".js-close").click();
  await openPapers(0);
  const added2 = await page.evaluate(() => { const n = KN.notes.list().find((x) => x.title === "暮らしに足した" || x.body.includes("暮らしに足した")); return n ? [n.parent || "", n.notebook].join() : ""; });
  t.check("頭の無い冊の＋はその冊の一番上に", added2 === ",暮らし", added2);

  /* 道すじの冊：頭の無い冊は、紙を閉じてホームの木のその冊に印 */
  await page.evaluate((i) => KN.screens.notes.open(i.grand), ids);
  await openPapers(1);
  await page.click('.sheet.is-note .note-path button:has-text("暮らし")');
  await openPapers(0);
  t.check("道すじの冊（頭なし）→ ホームの木のその冊に印", (await page.$eval(book("暮らし"), (e) => e.getAttribute("aria-current"))) === "true");

  /* 降りた面（すべてのノート）は右へ払って戻る（段1b。左端でなくても、面のどこからでも） */
  await page.click("#screen-notes .notes-book.js-all");
  await page.waitForSelector("#screen-notes .notes-chips");
  t.check("帯に面の名前と ‹", (await headName()) === "すべてのノート" && !!(await page.$("#head .js-notes-back")));
  const crumb = await page.$eval("#head .head-name", (e) => e.textContent.replace(/\s+/g, ""));
  t.check("帯に道すじ「Notes › すべてのノート」", crumb === "Notes›すべてのノート", crumb);
  t.check("ノートの画面は縦だけブラウザに（横を取られない）",
    (await page.$eval("#screen-notes", (e) => getComputedStyle(e).touchAction)) === "pan-y");
  const mid = await page.$eval("#screen-notes", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width * 0.4, y: r.top + r.height * 0.6 }; });
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(mid.x + i * 15, mid.y + 2); await page.waitForTimeout(16); }
  await page.waitForTimeout(60);
  const half = await page.evaluate(() => {
    const u = document.querySelector("#screen-notes .notes-under");
    return { under: !!(u && u.querySelector(".notes-books")), moved: !!document.querySelector("#screen-notes .js-body").style.transform };
  });
  t.check("引くあいだ後ろに一つ上の面（ホーム）が見え、いまの面は指について動く", half.under && half.moved, JSON.stringify(half));
  for (let i = 9; i <= 20; i++) { await page.mouse.move(mid.x + i * 15, mid.y + 4); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"), null, { timeout: 4000 });
  await page.waitForFunction(() => !document.querySelector("#screen-notes .js-body").style.transform, null, { timeout: 4000 });
  t.check("真ん中から払っても一つ上の面へ（面は元の位置・写しは残らない）",
    !!(await page.$("#screen-notes .js-body .notes-books")) && !(await page.$("#screen-notes .notes-under")));
  await page.click("#screen-notes .notes-book.js-all");
  await page.waitForFunction(() => document.querySelector("#head .js-notes-back"));
  /* 少しだけ・ゆっくり引いて離す → 戻らない */
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(mid.x + i * 10, mid.y); await page.waitForTimeout(40); }
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(600);
  t.check("少し引いて離すと戻らない（写しは消える）", !!(await page.$("#head .js-notes-back")) && !(await page.$("#screen-notes .notes-under")));
  /* 縦に動かした指は取らない */
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 30, mid.y - 200, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  t.check("縦の指では戻らない", !!(await page.$("#head .js-notes-back")) && !(await page.$("#screen-notes .notes-under")));
  await page.click("#head .js-notes-back");
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"));
  t.check("‹ でホームへ", !!(await page.$("#screen-notes .notes-books")));

  await page.click("#screen-notes .notes-book.js-all");
  await page.waitForSelector("#screen-notes .notes-chips");
  const nbLine = await page.$eval(`#screen-notes .note-row[data-id="${ids.grand}"] .note-nb`, (e) => e.textContent.trim());
  t.check("すべてのノートは今の一覧（チップ・子のカードに親の題）", nbLine === "暮らし › 台所", nbLine);
  const headLine = await page.$eval('#screen-notes .note-row[data-id="n-head-kid"] .note-nb', (e) => e.textContent.trim());
  t.check("頭の中のノートのカードに頭の名前を重ねない", headLine === "冊", headLine);
  await page.click("#head .js-notes-home");
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"));
  t.check("道すじの Notes を押すとホーム", !!(await page.$("#screen-notes .notes-books")));
  await page.click("#screen-notes .notes-book.js-all");
  await page.waitForSelector("#screen-notes .notes-chips");
  await page.click('.tab[data-tab="notes"]');
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"));
  t.check("席をもう一度押すとホーム", !!(await page.$("#screen-notes .notes-books")));

  /* 書く紙：道すじ・中のノート（木の行）・重ねる */
  await page.evaluate((i) => KN.screens.notes.open(i.grand), ids);
  await openPapers(1);
  const crumbs = await page.$$eval(".sheet.is-note .note-path button", (bs) => bs.map((b) => b.textContent.trim()));
  t.check("道すじ：ノートブック › 親たち", crumbs.join("›") === "暮らし›家›台所", crumbs.join("›"));
  await page.click('.sheet.is-note .note-path button:has-text("台所")');
  await openPapers(2);
  const kids = await texts(".note-kids .nt-name");
  t.check("親の紙が上に重なり、本文の下に中のノート（木の行）", kids.includes("鍋") && !(await top(".note-kids .note-row").count()), kids.join());
  await top(".js-close").click();
  await openPapers(1);
  await page.click(".sheet.is-note .js-close");
  await openPapers(0);

  await page.evaluate((i) => KN.screens.notes.open(i.kid), ids);
  await openPapers(1);
  await top('.note-kids .nt-row:has-text("鍋")').click();
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
  const kids2 = await page.$$eval(".sheet.is-note .note-kids .nt-grp > .nt-row .nt-name", (r) => r.map((e) => e.textContent.trim()));
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

  /* ---------------- 段1b：幅のある画面の木（行はホームの木と同じ） ---------------- */
  t.check("電話の幅では木を出さない", !(await page.isVisible(".notes-tree")));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForSelector(".notes-tree", { state: "visible", timeout: 4000 });
  const rows = await page.$$eval(".notes-tree .nt-row", (r) => r.map((e) => e.textContent.trim()));
  t.check("木：Notes・すべてのノート・ノートブック", rows[0] === "Notes" && rows[1] === "すべてのノート" && rows.includes("暮らし") && rows.includes("仕事"), rows.join());
  t.check("木：ホームに印", await page.$eval(".notes-tree .js-tree-home", (e) => e.getAttribute("aria-current") === "true"));
  t.check("木の行は上に留めない", !(await page.$(".notes-tree .nt-row.is-stick")));
  const side = '.notes-tree .js-book[data-nb="仕事"]';
  const wasOpen = await page.$eval(side, (e) => e.getAttribute("aria-expanded"));
  await page.click(`${side} .nt-name`);
  await page.waitForFunction(([s, w]) => document.querySelector(s).getAttribute("aria-expanded") !== w, [side, wasOpen]);
  t.check("木の頭の無いノートブックは、名前でその場に開け閉め（面は移らない）", !(await page.$("#head .js-notes-back")));
  if ((await page.$eval(side, (e) => e.getAttribute("aria-expanded"))) !== "true") await page.click(`${side} .nt-name`);
  await page.waitForSelector('.notes-tree .js-tree-note:has(> .nt-name:text-is("台所"))');
  const kidOpen = await page.$eval('.notes-tree .js-tree-note:has(> .nt-name:text-is("台所"))', (e) => e.getAttribute("aria-expanded"));
  if (kidOpen !== "true") await page.click('.notes-tree .js-tree-note:has(> .nt-name:text-is("台所")) .nt-twist');
  await page.waitForSelector('.notes-tree .js-tree-note:has(> .nt-name:text-is("鍋"))');
  await page.click('.notes-tree .js-tree-note:has(> .nt-name:text-is("鍋"))');
  await openPapers(1);
  const curSide = await page.$eval('.notes-tree [aria-current="true"]', (e) => e.textContent.trim());
  t.check("木のノートを押すと紙を開き、そこに印", curSide === "鍋", curSide);
  await page.click(".sheet.is-note .js-close");
  await openPapers(0);
  await page.click('.notes-tree .js-book[data-nb="冊"] .nt-name');
  await openPapers(1);
  t.check("木の頭のある冊は、名前で頭の紙", (await page.$eval('.notes-tree [aria-current="true"]', (e) => e.dataset.nb || "")) === "冊");
  await page.click(".sheet.is-note .js-close");
  await openPapers(0);
  await page.setViewportSize({ width: 390, height: 844 });

  t.check("localStorage が変わらない", (await lsSize()) === ls0);
  t.check("落ちない", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
