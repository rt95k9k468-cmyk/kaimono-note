/* 取り込んだノートを整理する（js/note-organize.js・docs/notes-unify.md「整理」）。

   計画：Notion は中を持つ一番上のページごとに一冊（頭 `head`・名前が重なれば（2））、中の無いページ・表は残す・
   取り込んだ冊の外へ移したページは触らない／同じ親の中は親の本文のリンクの順（日時の組は同じ・表の行は動かさない）／
   Evernote は一冊「Evernote」に元の冊の入れ物（取り込みが半分以下の冊は触らない・自分のノートも入れ物へ）／
   更新日は動かない・自分のノートは変わらない・二度目は何もしない／同期のファイルに head・organized。
   戻す：前の冊・親・日時へ（整理のあと中に足したノートは親の冊へ・入れ物は消す／自分のノートが中にあれば残す）。
   取り消す（取り込み）・取り込みのあと（その取り込みの分だけ・整理した親の下の新しいページは親の冊へ）。
   画面：設定の「取り込む」→ 整理する（先に見せる・控え）→ 整理を戻す（訊く・控え）／ホームの木で冊を開くと頭の
   中が一番上（Notion の並び）・冊の名前で頭の紙・カードに頭の名前を重ねない／道すじに頭を出さない／最近直したに
   取り込んだまま触っていないノートを出さない。

   リンクのとおりに中へ（Notion 全体）：目次の行だけ・迷うもの・先に見せる・控え・並び・子孫ごと・更新日・元に戻す。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-organize.js */
const { open, checker } = require("./lib");

const B1 = "2026-10-12T12:00:00.000Z";   // Evernote の取り込み
const B2 = "2026-10-12T13:00:00.000Z";   // Notion の取り込み
const nt = (ms) => new Date(Date.parse(B2) - ms).toISOString();
const CSV = `[蔵書.csv](file:${"a".repeat(64)}.csv)`;

function seed() {
  const own = (id, title, notebook, extra) => ({ id, title, body: "本文", notebook, tags: [], fav: false,
    createdAt: "2026-10-12T20:00:00.000Z", updatedAt: "2026-10-12T20:00:00.000Z", deletedAt: null, ...extra });
  const en = (id, title, notebook, k) => ({ id, title, body: "本文", notebook, tags: [], fav: false,
    createdAt: `2019-0${k}-01T00:00:00.000Z`, updatedAt: `2019-0${k}-02T00:00:00.000Z`, deletedAt: null,
    src: { from: "evernote", key: `en:${id}`, batch: B1 } });
  const no = (id, title, ms, extra) => ({ id, title, body: "本文", notebook: "Notion", tags: [], fav: false,
    createdAt: nt(ms), updatedAt: nt(ms), deletedAt: null, src: { from: "notion", key: id.padEnd(32, "0"), batch: B2 }, ...extra });
  return [
    own("o-ie", "家", "暮らし"),
    own("o-daidokoro", "台所", "暮らし", { parent: "o-ie" }),
    own("o-ryori", "自分の料理", "料理"),
    en("e1", "肉じゃが", "レシピ", 1), en("e2", "照り焼き", "レシピ", 2), en("e3", "白和え", "レシピ", 3),
    own("o-myrecipe", "自分のレシピ", "レシピ"),
    en("e4", "金沢", "旅", 4), en("e5", "松本", "旅", 5),
    en("e6", "移したメモ", "暮らし", 6),
    no("n-shigoto", "仕事", 20, { body: "前書き\n\n[行事](note:n-gyoji)\n[授業](note:n-jugyo)\n\n- [来年](note:n-rainen)\n\n[授業](note:n-jugyo) をもう一度" }),
    no("n-ryori", "料理", 19, { body: "" }),
    no("n-soto", "外へ", 18, { notebook: "暮らし" }),
    no("n-tandoku", "単独", 17),
    no("n-zousho", "蔵書", 16, { body: `${CSV}\n| 名前 |\n| --- |\n| 本B |\n| 本A |\n\n[本B](note:n-hon-b)` }),
    no("n-jugyo", "授業", 15, { parent: "n-shigoto" }),
    no("n-rainen", "来年", 14, { parent: "n-shigoto" }),
    no("n-gyoji", "行事", 13, { parent: "n-shigoto" }),
    no("n-nimono", "煮物", 12, { parent: "n-ryori" }),
    no("n-soto-kid", "外の子", 11, { parent: "n-soto", notebook: "暮らし" }),
    no("n-hon-a", "本A", 10, { parent: "n-zousho" }),
    no("n-hon-b", "本B", 9, { parent: "n-zousho" }),
    no("n-kokugo", "国語", 8, { parent: "n-jugyo" }),
    own("o-memo", "授業のメモ", "Notion", { parent: "n-jugyo", createdAt: "2026-10-12T21:00:00.000Z", updatedAt: "2026-10-12T21:00:00.000Z" }),
  ];
}

/* 設定の「取り込む」は外した。押した流れ（ファイルを選ぶのに要る）を作るため、その場のボタンから開く。 */
const importBtn = (page) => page.evaluate(() => {
  let b = document.querySelector(".js-test-import");
  if (!b) {
    b = Object.assign(document.createElement("button"), { className: "js-test-import", textContent: "取り込む" });
    b.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647";
    b.addEventListener("click", () => { b.remove(); KN.noteImport.open(); });
    document.body.append(b);
  }
}).then(() => page.click(".js-test-import"));
(async () => {
  const t = checker("note-organize");
  const { browser, page, errors } = await open();
  await page.evaluate(() => KN.notes.ready());
  const SEED = seed();
  await page.evaluate((list) => KN.notes.addMany(list), SEED);

  const get = (id) => page.evaluate((i) => KN.notes.get(i), id);
  const pick = (n) => n && { notebook: n.notebook, parent: n.parent || "", createdAt: n.createdAt, updatedAt: n.updatedAt, head: n.head || false, org: n.org || null };
  const snap = () => page.evaluate((ids) => ids.map((i) => KN.notes.get(i)), SEED.map((n) => n.id));
  const before = (await snap()).map(pick);

  /* ---------------- 画面から整理する ---------------- */
  await page.click('.tab[data-tab="notes"]');
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await page.waitForTimeout(300);
  const takes = [];
  await page.exposeFunction("tookSnap", (r) => takes.push(r));
  await page.evaluate(() => { const was = KN.backup.take; KN.backup.take = (r, o) => { window.tookSnap(r); return was(r, o); }; });
  const rows = () => page.evaluate(() => [...document.querySelectorAll(".set-layer:last-child .set-row, .sheet.is-open .set-row")].map((r) => r.textContent.replace(/\s+/g, "")));
  t.check("設定に「取り込む」が出る（10月29日に戻した）", await page.$$eval(".set-layer .set-row", (xs) => xs.some((x) => x.textContent.trim() === "取り込む")));
  await importBtn(page);
  await page.waitForSelector('.set-layer:last-child .set-row:has-text("取り込んだノートを整理する")');
  await page.waitForTimeout(300);
  await page.click('.set-layer:last-child .set-row:has-text("取り込んだノートを整理する")');
  await page.waitForSelector(".js-tidy");
  await page.waitForTimeout(300);
  const shown = await rows();
  t.check("先に見せる：Notion 2冊・Evernote 2つ・並び3", shown.includes("Notion：ノートブックに2") && shown.includes("Evernote：一冊に2")
    && shown.includes("Notionの並びに3"), JSON.stringify(shown));
  await page.click(".js-tidy");
  await page.waitForFunction(() => KN.notes.get("n-shigoto").head === true, null, { timeout: 8000 });
  t.check("控え（整理する前）を先に", takes.includes("整理する前"), JSON.stringify(takes));

  const at = (await get("n-shigoto")).org.at;
  const s = await page.evaluate(() => {
    const tr = KN.notes.tree();
    const g = (i) => KN.notes.get(i);
    const boxes = KN.notes.list().filter((n) => n.org && n.org.made);
    return {
      tops: tr.tops("仕事").map((n) => n.title).join(),
      head: tr.head("仕事") && tr.head("仕事").id, isHead: tr.isHead("n-shigoto"),
      branch: tr.branch("n-zousho").length, kids: tr.kids("n-zousho").length,
      boxes: boxes.map((b) => ({ id: b.id, title: b.title, nb: b.notebook, key: b.src.key, batch: b.src.batch, c: b.createdAt, u: b.updatedAt })),
      inBox: Object.fromEntries(["e1", "e2", "e3", "o-myrecipe", "e4", "e5"].map((i) => [i, [g(i).parent, g(i).notebook]])),
    };
  });
  const sh = await get("n-shigoto");
  t.check("Notion：中を持つ一番上のページは一冊（頭）", sh.notebook === "仕事" && sh.head === true && sh.org.nb === "Notion" && sh.org.h === 1);
  const inside = await page.evaluate(() => ["n-jugyo", "n-gyoji", "n-rainen", "n-kokugo", "o-memo"].map((i) => KN.notes.get(i).notebook));
  t.check("中のページ（自分で足したノートも）は同じ冊", inside.every((x) => x === "仕事"), inside.join());
  t.check("頭の中が冊の一番上・Notion の並び（親の本文のリンクの順）", s.tops === "行事,授業,来年" && s.head === "n-shigoto" && s.isHead, JSON.stringify(s));
  const order = await page.evaluate(() => ["n-gyoji", "n-jugyo", "n-rainen"].map((i) => KN.notes.get(i).createdAt));
  t.check("並びは日時を入れ替えるだけ（組は同じ）", order.join() === [15, 14, 13].map(nt).join(), order.join());
  const ry = await get("n-ryori");
  t.check("名前が自分の冊と重なれば（2）", ry.notebook === "料理（2）" && ry.head === true && (await get("n-nimono")).notebook === "料理（2）", ry.notebook);
  const stay = await page.evaluate(() => ["n-tandoku", "n-zousho", "n-hon-a", "n-hon-b"].map((i) => KN.notes.get(i)));
  t.check("中の無いページ・表は取り込んだ冊のまま（表の行は並べ替えない）", stay.every((n) => n.notebook === "Notion" && !n.head && !n.org)
    && stay[2].createdAt === nt(10) && stay[3].createdAt === nt(9), JSON.stringify(stay.map(pick)));
  t.check("表の行は木に並べない（中のノートとしては在る）", s.branch === 0 && s.kids === 2);
  const box = (name) => s.boxes.find((b) => b.title === name) || {};
  t.check("Evernote：一冊に、元の冊は入れ物（その取り込みより前の日時）", s.boxes.length === 2 && ["レシピ", "旅"].every((n) => box(n).nb === "Evernote"
    && box(n).key === `enbook:${n}` && box(n).batch === B1 && box(n).c < B1 && box(n).u === box(n).c), JSON.stringify(s.boxes));
  t.check("元の冊のノートは入れ物の中（冊の自分のノートも）", ["e1", "e2", "e3", "o-myrecipe"].every((i) => s.inBox[i][0] === box("レシピ").id && s.inBox[i][1] === "Evernote")
    && ["e4", "e5"].every((i) => s.inBox[i][0] === box("旅").id), JSON.stringify(s.inBox));
  const after1 = (await snap()).map(pick);
  const same = (ids) => ids.every((id) => { const i = SEED.findIndex((n) => n.id === id); return JSON.stringify(after1[i]) === JSON.stringify(before[i]); });
  t.check("自分の冊へ移したもの・取り込んだ冊の外のページ・自分のノートは触らない", same(["e6", "n-soto", "n-soto-kid", "o-ie", "o-daidokoro", "o-ryori"]));
  t.check("更新日は動かない", after1.every((n, i) => n.updatedAt === before[i].updatedAt));
  t.check("二度目は何もしない", await page.evaluate(() => KN.noteOrganize.empty(KN.noteOrganize.plan())));
  const file = await page.evaluate(() => { const S = KN.notesSync._; const f = S.fileOf(KN.notes.get("n-shigoto")); return { f, back: S.parse(f) }; });
  t.check("同期のファイルに head・organized（読み戻せる）", /\nhead: true\n/.test(file.f) && /\norganized: \{/.test(file.f)
    && file.back.head === true && JSON.stringify(file.back.org) === JSON.stringify(sh.org), file.f.split("---")[1]);

  /* ---------------- 画面：ノートブックの頭・道すじ・最近直した ---------------- */
  await page.evaluate(() => KN.notes.edit("n-gyoji", { body: "直した" }));
  await page.evaluate(() => KN.app.showScreen("notes"));
  await page.waitForSelector("#screen-notes .notes-books");
  const recent = await page.evaluate(() => {
    const sec = [...document.querySelectorAll("#screen-notes .notes-sec")].find((e) => e.textContent.includes("最近直した"));
    return sec ? [...sec.nextElementSibling.querySelectorAll(".nt-name")].map((e) => e.textContent.trim()) : [];
  });
  t.check("最近直した：取り込んだまま触っていないものは出さない", recent.includes("行事") && !recent.includes("授業") && !recent.includes("肉じゃが"), recent.join());
  await page.click('#screen-notes .js-book[data-nb="仕事"] .nt-twist');
  await page.waitForSelector('#screen-notes .js-tree-note[data-id="n-gyoji"]');
  const inTree = await page.$$eval('#screen-notes .js-book[data-nb="仕事"] ~ .nt-grp > .js-tree-note .nt-name', (r) => r.map((e) => e.textContent.trim()));
  t.check("ホームの木：冊を開くと頭の中が一番上（Notion の並び・頭そのものは並べない）", inTree.join() === "行事,授業,来年", inTree.join());
  await page.click('#screen-notes .js-book[data-nb="仕事"] .nt-name');
  await page.waitForSelector(".sheet.is-note.is-open .note-kids .nt-row");
  const headSheet = await page.evaluate(() => ({
    title: document.querySelector(".sheet.is-note.is-open .js-title").value,
    kids: [...document.querySelectorAll(".sheet.is-note.is-open .note-kids .nt-grp > .nt-row .nt-name")].map((e) => e.textContent.trim()),
  }));
  t.check("冊の名前で頭の紙（中のノートは Notion の並び）", headSheet.title === "仕事" && headSheet.kids.join() === "行事,授業,来年", JSON.stringify(headSheet));
  await page.click(".sheet.is-note.is-open .js-close");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"));
  await page.click("#screen-notes .notes-book.js-all");
  await page.waitForSelector('#screen-notes .note-row[data-id="n-jugyo"]');
  const where = await page.$eval('#screen-notes .note-row[data-id="n-jugyo"] .note-nb', (e) => e.textContent.trim());
  t.check("カードに頭の名前を重ねない", where === "仕事", where);
  await page.click("#head .js-notes-back");
  await page.waitForFunction(() => !document.querySelector("#head .js-notes-back"));
  await page.evaluate(() => KN.screens.notes.open("n-kokugo"));
  await page.waitForSelector(".sheet.is-note.is-open .note-path button");
  const crumbs = await page.$$eval(".sheet.is-note .note-path button", (bs) => bs.map((b) => b.textContent.trim()));
  t.check("道すじに頭は出さない（ノートブック › 親）", crumbs.join("›") === "仕事›授業", crumbs.join("›"));
  await page.click(".sheet.is-note .js-close");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"));

  /* ---------------- 戻す（画面から） ---------------- */
  await page.evaluate(() => KN.notes.addMany([
    { id: "o-later", title: "あとで足した", body: "", notebook: "仕事", parent: "n-shigoto", tags: [], fav: false,
      createdAt: "2026-10-13T01:00:00.000Z", updatedAt: "2026-10-13T01:00:00.000Z", deletedAt: null },
  ]));
  const boxTabi = box("旅").id;
  await page.evaluate((b) => KN.notes.addMany([
    { id: "o-inbox", title: "旅の中に足した", body: "", notebook: "Evernote", parent: b, tags: [], fav: false,
      createdAt: "2026-10-13T01:00:00.000Z", updatedAt: "2026-10-13T01:00:00.000Z", deletedAt: null },
  ]), boxTabi);
  t.check("戻せる整理が一つ", JSON.stringify(await page.evaluate(() => KN.noteOrganize.runs())) === JSON.stringify([at]));
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings");
  await page.waitForTimeout(300);
  await importBtn(page);
  await page.waitForSelector('.set-layer:last-child .set-row:has-text("の整理を戻す")');
  await page.waitForTimeout(300);
  await page.click('.set-layer:last-child .set-row:has-text("の整理を戻す")');
  await page.waitForSelector(".js-ok");
  await page.waitForTimeout(200);
  await page.click(".js-ok");
  await page.waitForFunction(() => !KN.notes.get("n-shigoto").head, null, { timeout: 8000 });
  t.check("控え（整理を戻す前）を先に", takes.includes("整理を戻す前"), JSON.stringify(takes));
  const back = (await snap()).map(pick);
  const diff = SEED.map((n, i) => (JSON.stringify({ ...back[i], updatedAt: 0 }) === JSON.stringify({ ...before[i], updatedAt: 0 }) ? "" : n.id)).filter(Boolean);
  t.check("戻す：前の冊・親・日時に（頭・org も外れる）", !diff.length, diff.join());
  const later = await get("o-later");
  t.check("整理のあと中に足したノートは親と同じ冊へ", later.notebook === "Notion" && later.parent === "n-shigoto", JSON.stringify(pick(later)));
  const boxes2 = await page.evaluate((ids) => ids.map((i) => KN.notes.get(i)), [box("レシピ").id, boxTabi]);
  t.check("入れ物は消した印・自分のノートが中にあれば残す", !!boxes2[0].deletedAt && !boxes2[1].deletedAt && !boxes2[1].org
    && (await get("o-inbox")).parent === boxTabi, JSON.stringify(boxes2.map(pick)));
  t.check("戻したら戻せる整理は無い", (await page.evaluate(() => KN.noteOrganize.runs().length)) === 0);

  /* ---------------- 取り込みを取り消す・取り込みのあと ---------------- */
  await page.evaluate(() => KN.noteOrganize.apply(KN.noteOrganize.plan()));
  const reuse = await page.evaluate((b) => KN.notes.get("e4").parent === b, boxTabi);
  t.check("もう一度整理すると、残っていた入れ物を使う", reuse);
  const bs = await page.evaluate(() => KN.noteImport.batches());
  const enb = bs.find((b) => b.batch === B1) || { books: [] };
  t.check("取り込みの一覧：Evernote は元の冊の名前（入れ物は数えない）", enb.books.slice().sort().join() === ["レシピ", "旅", "暮らし"].sort().join(), JSON.stringify(bs));
  const gone = await page.evaluate((b) => KN.notes.unimport(b), B1);
  const live = await page.evaluate(() => KN.notes.list().map((n) => n.id));
  t.check("取り消す：Evernote のノートは最近削除へ・自分のノートの入った入れ物は残る", gone === 6
    && !["e1", "e2", "e3", "e4", "e5", "e6"].some((i) => live.includes(i)) && live.includes("o-myrecipe") && live.includes(boxTabi), String(gone));

  const B4 = "2026-10-13T02:00:00.000Z";
  const fresh = [
    { id: "n-new", title: "新しい", ms: 4 }, { id: "n-new-kid", title: "新しい子", ms: 3, parent: "n-new" },
    { id: "n-add", title: "追加", ms: 2, parent: "n-shigoto" },
  ].map((x) => ({ id: x.id, title: x.title, body: "", notebook: "Notion", tags: [], fav: false, deletedAt: null,
    createdAt: new Date(Date.parse(B4) - x.ms).toISOString(), updatedAt: new Date(Date.parse(B4) - x.ms).toISOString(),
    ...(x.parent ? { parent: x.parent } : {}), src: { from: "notion", key: x.id.padEnd(32, "0"), batch: B4 } }));
  await page.evaluate((list) => KN.notes.addMany(list), fresh);
  const tandoku0 = pick(await get("n-tandoku"));
  await page.evaluate((b) => KN.noteOrganize.after(b), B4);
  const nw = await page.evaluate(() => ["n-new", "n-new-kid", "n-add"].map((i) => KN.notes.get(i)));
  t.check("取り込みのあと：その取り込みの分だけ（新しい一冊・整理した親の下は親の冊）", nw[0].notebook === "新しい" && nw[0].head === true
    && nw[1].notebook === "新しい" && nw[2].notebook === "仕事" && JSON.stringify(pick(await get("n-tandoku"))) === JSON.stringify(tandoku0),
  JSON.stringify(nw.map(pick)));

  /* 名前を入れた Evernote の取り込み：archive › 名前 › 元の冊 › ノート（10月29日）。 */
  const B6 = "2026-10-29T11:00:00.000Z";
  const enNew = [["x1", "甲帳"], ["x2", "甲帳"], ["x3", "乙帳"]].map(([id, nb], i) => ({ id, title: id, body: "本文", notebook: nb,
    tags: [], fav: false, deletedAt: null, createdAt: `2018-0${i + 1}-01T00:00:00.000Z`, updatedAt: `2018-0${i + 1}-02T00:00:00.000Z`,
    src: { from: "evernote", key: `en:${id}`, batch: B6 } }));
  await page.evaluate((list) => KN.notes.addMany(list), enNew);
  await page.evaluate((b) => KN.noteOrganize.after(b, { into: "Evernote旧" }), B6);
  const ex = await page.evaluate(() => {
    const N = KN.notes;
    const root = N.list().find((n) => n.title === "Evernote旧");
    const kids = root ? N.tree().kids(root.id) : [];
    return { root: root && { nb: root.notebook, parent: root.parent || "", pos: !!root.pos }, kids: kids.map((n) => n.title).sort().join(),
      ok: ["x1", "x2", "x3"].every((i) => { const n = N.get(i); const b = N.get(n.parent); return n.notebook === "archive" && b && b.parent === root.id; }) };
  });
  t.check("名前を入れた Evernote：archive の一番上の入れ物の中に元の冊", !!ex.root && ex.root.nb === "archive" && !ex.root.parent && ex.root.pos
    && ex.kids === "乙帳,甲帳" && ex.ok, JSON.stringify(ex));
  const exb = (await page.evaluate(() => KN.noteImport.batches())).find((b) => b.batch === B6) || { books: [] };
  t.check("取り込みの一覧：入れ物は数えず元の冊の名前", exb.books.slice().sort().join() === "乙帳,甲帳", JSON.stringify(exb));
  const exGone = await page.evaluate(async (b) => { await KN.notes.unimport(b); return KN.notes.list().filter((n) => n.src && n.src.batch === b).length; }, B6);
  t.check("取り消すと入れ物ごと消える", exGone === 0, String(exGone));

  /* ---------------- リンクのとおりに中へ（Notion 全体。平らに来たページ） ---------------- */
  const B5 = "2026-10-14T02:00:00.000Z";
  const flat = [
    { id: "f-top", title: "目次", ms: 10, body: "- [甲](note:f-a)\n[乙](note:f-b)\n文の中の [丙](note:f-c) も\n[丁](note:f-d)" },
    { id: "f-b", title: "乙", ms: 9, body: "[丁](note:f-d)" },
    { id: "f-c", title: "丙", ms: 8 }, { id: "f-d", title: "丁", ms: 7 },
    { id: "f-x", title: "輪X", ms: 6, body: "[輪Y](note:f-y)" }, { id: "f-y", title: "輪Y", ms: 5, body: "[輪X](note:f-x)" },
    { id: "f-a", title: "甲", ms: 4, nb: "別" }, { id: "f-a1", title: "甲の子", ms: 3, nb: "別", parent: "f-a" },
  ].map((x) => ({ id: x.id, title: x.title, body: x.body || "", notebook: x.nb || "Notion", tags: [], fav: false, deletedAt: null,
    createdAt: new Date(Date.parse(B5) - x.ms).toISOString(), updatedAt: new Date(Date.parse(B5) - x.ms).toISOString(),
    ...(x.parent ? { parent: x.parent } : {}), src: { from: "notion", key: x.id.padEnd(32, "0"), batch: B5 } }));
  await page.evaluate((list) => KN.notes.addMany(list), flat);
  const lp = await page.evaluate(() => { const p = KN.noteOrganize.linkPlan(); return { moved: p.moved, unsure: p.unsure.slice().sort().join() }; });
  t.check("リンクのとおりに：目次の行だけ・二つから指されたものと輪の片方は迷う", lp.moved === 3 && lp.unsure === ["丁", "輪Y"].sort().join(), JSON.stringify(lp));
  const flat0 = (await page.evaluate((ids) => ids.map((i) => KN.notes.get(i)), flat.map((n) => n.id))).map(pick);
  await page.evaluate(() => KN.noteOrganize.linkPreview());
  await page.waitForSelector(".js-tidy");
  await page.waitForTimeout(300);
  const lshown = await rows();
  t.check("先に見せる：中へ移す3・迷う2", lshown.includes("中へ移す3") && lshown.includes("迷うのでそのまま2"), JSON.stringify(lshown));
  await page.click(".js-tidy");
  await page.waitForFunction(() => KN.notes.get("f-a").parent === "f-top", null, { timeout: 8000 });
  t.check("控え（リンクのとおりに中へ移す前）を先に", takes.includes("リンクのとおりに中へ移す前"), JSON.stringify(takes));
  const lk = await page.evaluate(() => {
    const N = KN.notes;
    return { kids: N.tree().kids("f-top").map((n) => n.title).join(), a1: N.get("f-a1").notebook, a: N.get("f-a").notebook,
      c: N.get("f-c").parent || "", d: N.get("f-d").parent || "", x: N.get("f-x").parent || "" };
  });
  t.check("目次の行の順に中へ・子孫ごと親の冊へ・文の中のリンクと迷うものはそのまま",
    lk.kids === "甲,乙" && lk.a === "Notion" && lk.a1 === "Notion" && !lk.c && !lk.d && lk.x === "f-y", JSON.stringify(lk));
  const flat1 = (await page.evaluate((ids) => ids.map((i) => KN.notes.get(i)), flat.map((n) => n.id)));
  t.check("更新日は動かない", flat1.every((n, i) => n.updatedAt === flat0[i].updatedAt));
  t.check("二度目は何もしない", await page.evaluate(() => KN.noteOrganize.empty(KN.noteOrganize.linkPlan())));
  await page.click(".toast .toast-action");
  await page.waitForSelector(".js-ok");
  await page.waitForTimeout(200);
  await page.click(".js-ok");
  await page.waitForFunction(() => !KN.notes.get("f-a").parent, null, { timeout: 8000 });
  const flat2 = (await page.evaluate((ids) => ids.map((i) => KN.notes.get(i)), flat.map((n) => n.id))).map(pick);
  t.check("元に戻す：冊・親・日時が前のとおり", JSON.stringify(flat2) === JSON.stringify(flat0), JSON.stringify(flat2));

  t.check("頁の誤りなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
