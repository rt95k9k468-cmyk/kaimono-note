/* ノートの木を手で組み替える（docs/notes-unify.md「並び」）。

   データ：`pos` の無いノートは作った順のまま／置くと動かしたノートだけに `pos`（ほかの欄・更新日は動かない）／
   有る無しが混ざっても一本の順・新しいノートは終わり／あいだが無ければ兄弟を振り直す／中へ・子孫ごと別の冊へ／
   自分・自分の中へは置かない／同じ場所なら何もしない／元に戻す／「⋯」の移すは作った順へ／ノートブックの並び・
   空のノートブック（作る・付け替える・外す・絞り込みには出さない）／読み直しても残る／控え（pos・books）と合わせ方／
   同期のファイルの pos・labels.json の books（古い版の books の無いファイルはこちらのまま）／書き出しは木の順・
   order・空のノートブックのフォルダ／localStorage が変わらない。
   画面（マウス・幅のある画面）：押すだけなら開く／行のあいだへ・行の上で中へ・右へずらして段を下げる／元に戻す／
   閉じた枝の上で待つと開く／ノートブックの行の並べ替え／左の木でも運べる／＋で空のノートブック／
   Tab・Shift+Tab・Alt+↑↓・↑↓／「⋯」のリンク先を中へ（目次の行だけ・行の順・子孫ごと・控え・元に戻す）。
   画面（指・電話の幅）：長押しで持ち上げて運ぶ／運んでいるあいだ器は送らない／紙の中のノートを右へずらしても紙は戻らない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-drag.js */
const { open, checker } = require("./lib");

const AT = (d, h) => `2026-10-0${d}T0${h}:00:00.000Z`;
const nb = (id, title, notebook, at, x) => ({ id, title, body: "本文", notebook, tags: [], fav: false, createdAt: at, updatedAt: at, deletedAt: null, ...x });
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

(async () => {
  const t = checker("notes-drag");

  /* ================= データ（幅のある画面で開いて、そのまま画面へ） ================= */
  const { browser, page, errors } = await open({ viewport: { width: 1280, height: 900 } });
  await page.evaluate(() => KN.notes.ready());
  const lsSize = () => page.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
    return JSON.stringify(o);
  });
  const ls0 = await lsSize();
  await page.evaluate((list) => KN.notes.addMany(list), [
    nb("n-a", "あ", "家", AT(1, 1)), nb("n-b", "い", "家", AT(1, 2)), nb("n-c", "う", "家", AT(1, 3)),
    nb("n-w", "机", "仕事", AT(2, 1)),
    nb("n-t1", "同1", "同じ", AT(3, 1)), nb("n-t2", "同2", "同じ", AT(3, 1)), nb("n-t3", "同3", "同じ", AT(3, 1)),
  ]);
  const order = (nbk) => page.evaluate((x) => KN.notes.tree().tops(x).map((n) => n.title).join(), nbk);
  t.check("pos の無いノートは作った順のまま", (await order("家")) === "あ,い,う");

  const r1 = await page.evaluate(() => {
    const N = KN.notes;
    const u0 = N.get("n-a").updatedAt;
    const was = N.place("n-c", { nb: "家", before: "n-a" });
    return { was: !!was, pos: ["n-a", "n-b", "n-c"].map((id) => ("pos" in N.get(id) ? "p" : "-")).join(""), upd: N.get("n-a").updatedAt === u0,
      cAt: N.get("n-c").createdAt, cUpd: N.get("n-c").updatedAt };
  });
  t.check("頭へ置く：動かしたノートだけに pos", r1.was && r1.pos === "--p" && (await order("家")) === "う,あ,い", JSON.stringify(r1));
  t.check("作った日時・更新日は動かない", r1.cAt === AT(1, 3) && r1.cUpd === AT(1, 3) && r1.upd);
  t.check("同じ場所なら何もしない", await page.evaluate(() => KN.notes.place("n-c", { nb: "家", before: "n-a" }) === null));
  await page.evaluate(() => KN.notes.place("n-a", { nb: "家" }));
  t.check("終わりへ置く", (await order("家")) === "う,い,あ");
  const fresh = await page.evaluate(() => { const n = Object.assign(KN.notes.draft(), { notebook: "家", title: "新" }); KN.notes.put(n); return n.id; });
  t.check("終わりへ置いたあとでも、新しいノートは終わり", (await order("家")) === "う,い,あ,新");
  await page.evaluate((id) => KN.notes.drop(id), fresh);

  const r2 = await page.evaluate(() => {
    const N = KN.notes;
    const u = N.get("n-b").updatedAt;
    const ok = !!N.place("n-b", { parent: "n-w" });
    return { ok, nb: N.get("n-b").notebook, kids: N.tree().kids("n-w").map((n) => n.title).join(), upd: N.get("n-b").updatedAt === u };
  });
  t.check("中へ：別の冊のノートの中（子孫の冊も替わる・更新日は動かない）", r2.ok && r2.nb === "仕事" && r2.kids === "い" && r2.upd, JSON.stringify(r2));
  t.check("自分・自分の中へは置かない", await page.evaluate(() => KN.notes.place("n-w", { parent: "n-b" }) === null && KN.notes.place("n-w", { parent: "n-w" }) === null));
  const r3 = await page.evaluate(() => {
    const N = KN.notes;
    const was = N.place("n-w", { nb: "家", after: "n-c" });
    const mid = [N.tree().tops("家").map((n) => n.title).join(), N.get("n-b").notebook].join("|");
    N.unplace(was);
    return { mid, back: [N.tree().tops("仕事").map((n) => n.title).join(), N.get("n-b").notebook, N.get("n-w").pos === undefined].join("|") };
  });
  t.check("子孫ごと別の冊のあいだへ", r3.mid === "う,机,あ|家", r3.mid);
  t.check("元に戻すと、前の冊・並び・欄のまま", r3.back === "机|仕事|true", r3.back);
  const r4 = await page.evaluate(() => {
    const N = KN.notes;
    N.place("n-t3", { nb: "同じ", after: "n-t1" });
    return { order: N.tree().tops("同じ").map((n) => n.title).join(), pos: ["n-t1", "n-t2", "n-t3"].map((id) => N.get(id).pos || "").join(",") };
  });
  t.check("あいだが無い（同じ作った日時）なら兄弟を振り直す", r4.order === "同1,同3,同2" && r4.pos.split(",").every((p) => /^0/.test(p)), JSON.stringify(r4));
  const r5 = await page.evaluate(() => {
    /* 置くを何度もくり返しても、並びが崩れず字が長くなりすぎない */
    const N = KN.notes;
    const ids = [];
    for (let i = 0; i < 12; i++) { const n = Object.assign(N.draft(), { notebook: "乱", title: `r${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }); N.put(n); ids.push(n.id); }
    let want = ids.slice();
    let seed = 7;
    const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
    let bad = 0, longest = 0;
    for (let s = 0; s < 300; s++) {
      const id = want[rnd(want.length)];
      const rest = want.filter((x) => x !== id);
      const at = rnd(rest.length + 1);
      const to = at < rest.length ? { nb: "乱", before: rest[at] } : { nb: "乱" };
      N.place(id, to);
      rest.splice(at, 0, id);
      want = rest;
      const got = N.tree().tops("乱").map((n) => n.id);
      if (got.join() !== want.join()) bad++;
      ids.forEach((x) => { longest = Math.max(longest, (N.get(x).pos || "").length); });
    }
    return { bad, longest };
  });
  t.check("300回置いても並びは思ったとおり・字は120字まで", r5.bad === 0 && r5.longest <= 120, JSON.stringify(r5));
  t.check("「⋯」の移すは、移った先で作った順", await page.evaluate(() => { KN.notes.move("n-c", null, "仕事"); return KN.notes.get("n-c").pos === undefined; }));
  await page.evaluate(() => KN.notes.place("n-c", { nb: "家", before: "n-a" }));

  /* ノートブックの並び・空のノートブック */
  const r6 = await page.evaluate(() => {
    const N = KN.notes;
    const first = N.notebooks().join();
    const byName = [...new Set(N.list().map((n) => n.notebook).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).join();
    N.moveBook("仕事", "家");
    const want = byName.split(",").filter((x) => x !== "仕事");
    want.splice(want.indexOf("家"), 0, "仕事");
    N.addBook("からっぽ");
    const after = N.notebooks().join();
    const wantAfter = want.concat("からっぽ").join();
    const used = N.notebooks({ used: true }).includes("からっぽ");
    N.renameLabel("nb", "からっぽ", "空の箱");
    const renamed = N.notebooks().includes("空の箱") && !N.notebooks().includes("からっぽ");
    return { first, byName, after, wantAfter, used, renamed };
  });
  t.check("ノートブックははじめ名前の順", r6.first === r6.byName, r6.first);
  t.check("ノートブックを並べ替え・空のノートブックは終わりに", r6.after === r6.wantAfter, `${r6.after} ／ ${r6.wantAfter}`);
  t.check("空のノートブックは絞り込み・書き出しのチップに出さない", !r6.used);
  t.check("空のノートブックも付け替えられる", r6.renamed);

  /* 読み直しても残る（書き終えてから読み直す。tests/README.md の罠） */
  const before = await page.evaluate(() => [KN.notes.notebooks().join(), KN.notes.tree().tops("家").map((n) => n.title).join()].join("|"));
  await page.evaluate(() => KN.notes.flush());
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.open("kaimono-note-notes"); q.onsuccess = () => { q.result.close(); r(); }; }));
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.notes && KN.notes.state() === "on");
  const again = await page.evaluate(() => [KN.notes.notebooks().join(), KN.notes.tree().tops("家").map((n) => n.title).join()].join("|"));
  t.check("読み直しても並び・空のノートブックが残る", again === before, `${before} → ${again}`);

  /* 控え・合わせ方・同期のファイル */
  const r7 = await page.evaluate(async () => {
    const N = KN.notes, Y = KN.notesSync._;
    const ex = N.forExport().noteBook;
    const c = ex.notes.find((n) => n.id === "n-c");
    const file = Y.fileOf(N.get("n-c"));
    const back = Y.parse(file);
    const junk = Y.parse(file.replace(/^pos: .*$/m, 'pos: "a b"'));
    /* 控えから：こちらに無い名前だけ終わりに */
    await N.merge({ v: 1, notes: [], books: ["控えの冊", "家"] });
    const merged = N.notebooks().join();
    const L = Y.mergeLabels;
    const m1 = L({ nb: {}, tag: {}, books: ["家", "仕事"] }, { nb: {}, tag: {}, books: ["仕事", "家"] }, { nb: {}, tag: {} }).books.join();
    const m2 = L({ nb: {}, tag: {}, books: ["家", "仕事"] }, { nb: {}, tag: {}, books: ["家", "仕事", "甲"] }, { nb: {}, tag: {}, books: ["仕事", "乙"] }).books.join();
    const m3 = L({ nb: {}, tag: {}, books: ["家"] }, { nb: {}, tag: {}, books: ["家"] }, { nb: {}, tag: {}, books: ["家", "丙"] }).books.join();
    return { books: (ex.books || []).join(), cpos: !!c.pos, file: /\npos: "/.test(file), round: back.pos === N.get("n-c").pos, junk: junk.pos === undefined,
      merged, m1, m2, m3 };
  });
  t.check("控えに pos と books が入る", r7.cpos && r7.books.includes("空の箱"), JSON.stringify(r7));
  t.check("同期のファイルに pos（読み戻して同じ・変な字は読まない）", r7.file && r7.round && r7.junk);
  t.check("控えから合わせる：こちらの順のまま、無い名前だけ終わりに", r7.merged.endsWith("控えの冊") && r7.merged.indexOf("家") < r7.merged.indexOf("控えの冊"), r7.merged);
  t.check("labels.json：books の無い（古い版の）ファイルはこちらのまま", r7.m1 === "仕事,家", r7.m1);
  t.check("labels.json：両方で変えたら、こちらの順に向こうで足した名前・どちらかで外した名前は外す", r7.m2 === "仕事,甲,乙", r7.m2);
  t.check("labels.json：こちらが変えていなければ向こう", r7.m3 === "家,丙", r7.m3);

  /* 書き出し */
  const r8 = await page.evaluate(async () => {
    const X = KN.notesExport;
    const list = X.notesIn(null);
    const tops = KN.notes.notebooks();
    const zip = await X.zipNotes(list, new Map(), new Map(), true).text();
    const f = X.noteFile(KN.notes.get("n-c"), null, KN.notes.orderOf("n-c"));
    const books = tops.concat("");
    const idx = list.map((n) => books.indexOf(n.notebook));
    const home = list.filter((n) => n.notebook === "家" && !n.parent).map((n) => n.id).join();
    return { byBook: idx.every((v, i) => !i || idx[i - 1] <= v), home: home === KN.notes.tree().tops("家").map((n) => n.id).join(),
      order: /\norder: 1\n/.test(f), empty: zip.includes("空の箱/") };
  });
  t.check("書き出しは木の順（ノートブックの並び → 一番上から深さ順）", r8.byBook && r8.home, JSON.stringify(r8));
  t.check("1件ずつの頭に order（兄弟の何番目）", r8.order);
  t.check("すべての zip に空のノートブックのフォルダ", r8.empty);
  { const ls1 = await lsSize(); const a = JSON.parse(ls0), b = JSON.parse(ls1);
    /* 立ち上げの記録（読み直した回数）はノートと関係ない */
    const diff = [...new Set(Object.keys(a).concat(Object.keys(b)))].filter((k) => k !== "kaimono-note-launches" && a[k] !== b[k]);
    t.check("localStorage が変わらない", !diff.length, diff.map((k) => `${k}: ${String(a[k]).slice(0, 80)} → ${String(b[k]).slice(0, 80)}`).join(" / ")); }

  /* ================= 画面：マウス ================= */
  await page.evaluate(() => KN.notes.addMany([
    { id: "n-x1", title: "一", body: "x", notebook: "庭", tags: [], fav: false, createdAt: "2026-09-01T01:00:00.000Z", updatedAt: "2026-09-01T01:00:00.000Z", deletedAt: null },
    { id: "n-x2", title: "二", body: "x", notebook: "庭", tags: [], fav: false, createdAt: "2026-09-01T02:00:00.000Z", updatedAt: "2026-09-01T02:00:00.000Z", deletedAt: null },
    { id: "n-x3", title: "三", body: "x", notebook: "庭", tags: [], fav: false, createdAt: "2026-09-01T03:00:00.000Z", updatedAt: "2026-09-01T03:00:00.000Z", deletedAt: null },
    { id: "n-x4", title: "四", body: "x", notebook: "庭", tags: [], fav: false, createdAt: "2026-09-01T04:00:00.000Z", updatedAt: "2026-09-01T04:00:00.000Z", deletedAt: null },
    { id: "n-x2k", title: "二の子", body: "x", notebook: "庭", parent: "n-x2", tags: [], fav: false, createdAt: "2026-09-01T05:00:00.000Z", updatedAt: "2026-09-01T05:00:00.000Z", deletedAt: null },
  ]));
  await page.click('.tab[data-tab="notes"]');
  await page.waitForSelector('#screen-notes .js-book[data-nb="庭"]');
  const book = (n) => `#screen-notes .js-book[data-nb="${n}"]`;
  const row = (id) => `#screen-notes .notes-books[role="tree"] .js-tree-note[data-id="${id}"]`;
  await page.click(`${book("庭")} .nt-twist`);
  await page.waitForSelector(row("n-x1"));
  await page.waitForTimeout(400);   // 枝が伸び終わるまで（--m-grow）
  const garden = () => page.evaluate(() => KN.notes.tree().tops("庭").map((n) => n.title).join());
  const box = async (sel) => page.locator(sel).first().boundingBox();
  /* マウスで運ぶ：押して少し動かすと持ち上がる。to(x, y) で離す。 */
  const carry = async (sel, to, wait) => {
    const b = await box(sel);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 8, { steps: 2 });
    const [tx, ty] = await to(x, y);
    await page.mouse.move(tx, ty, { steps: 10 });
    await frames(page);
    if (wait) await wait();
    await frames(page);
    await page.mouse.up();
    await frames(page);
  };
  const gapY = async (a, b) => { const A = await box(a), B = await box(b); return (A.y + A.height + B.y) / 2; };

  /* 押すだけなら開く */
  await page.click(`${row("n-x1")} .nt-name`);
  t.check("押すだけなら開く", await page.waitForSelector(".sheet.is-note.is-open", { timeout: 4000 }).then(() => true, () => false));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 4000 }).catch(() => {});

  const yGap = await gapY(row("n-x1"), row("n-x2"));
  await carry(row("n-x4"), (x) => [x, yGap]);
  t.check("行のあいだへ：一 と 二 のあいだ", (await garden()) === "一,四,二,三", await garden());
  t.check("落とすと「元に戻す」", await page.waitForSelector(".toast .toast-action", { timeout: 3000 }).then(() => true, () => false));
  await page.click(".toast .toast-action");
  t.check("元に戻す", (await garden()) === "一,二,三,四", await garden());

  await carry(row("n-x4"), async () => { const b = await box(row("n-x1")); return [b.x + b.width / 2, b.y + b.height / 2]; });
  t.check("行の上（まん中）へ：その中の終わり", await page.evaluate(() => KN.notes.tree().kids("n-x1").map((n) => n.title).join()) === "四");
  t.check("落とした先の枝は開かない", (await page.$eval(row("n-x1"), (e) => e.getAttribute("aria-expanded"))) === "false");

  /* 右へずらして段を下げる：三 を 三 の下の隙間で一段右へ → 二 の中（二の子の次） */
  await page.click(`${row("n-x2")} .nt-twist`);
  await page.waitForSelector(row("n-x2k"));
  await page.waitForTimeout(400);   // 枝が伸び終わるまで（--m-grow）
  const step = await page.$eval(row("n-x3"), (e) => parseFloat(getComputedStyle(e).getPropertyValue("--nt-step")));
  const yUnder = await gapY(row("n-x2k"), row("n-x3"));
  await carry(row("n-x3"), (x) => [x - step * 0.2, yUnder]);
  t.check("ずらさなければ同じ段（動かない）", (await garden()).includes("三"));
  const b3 = await box(row("n-x3"));
  await carry(row("n-x3"), (x) => [x + step * 1.2, b3.y - 1]);
  t.check("右へずらすと段が下がる（二の中、二の子の次）", await page.evaluate(() => KN.notes.tree().kids("n-x2").map((n) => n.title).join()) === "二の子,三",
    await page.evaluate(() => KN.notes.tree().kids("n-x2").map((n) => n.title).join()));
  await page.click(".toast .toast-action");

  /* 閉じた枝の上で待つと開く */
  await page.click(`${row("n-x2")} .nt-twist`);
  await page.waitForFunction((s) => document.querySelector(s).getAttribute("aria-expanded") === "false", row("n-x2"));
  await page.waitForTimeout(400);   // 枝が縮み終わるまで（--m-grow）
  let sprang = false;
  await carry(row("n-x3"), async () => { const b = await box(row("n-x2")); return [b.x + b.width / 2, b.y + b.height / 2]; }, async () => {
    sprang = await page.waitForFunction((s) => document.querySelector(s).getAttribute("aria-expanded") === "true", row("n-x2"), { timeout: 2000 }).then(() => true, () => false);
    const b = await box(row("n-x2"));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.5, { steps: 2 });
  });
  t.check("閉じた枝の上で待つと開く（運んでいるまま）", sprang && await page.evaluate(() => KN.notes.tree().kids("n-x2").map((n) => n.title).join()) === "二の子,三");
  await page.click(".toast .toast-action");

  /* ノートブックの行の並べ替え */
  const books0 = await page.evaluate(() => KN.notes.notebooks().join());
  const firstBook = await page.evaluate(() => KN.notes.notebooks()[0]);
  await carry(book("庭"), async (x) => { const b = await box(book(firstBook)); return [x, b.y + 2]; });
  t.check("ノートブックの行を一番上へ", await page.evaluate(() => KN.notes.notebooks()[0]) === "庭", `${books0} → ${await page.evaluate(() => KN.notes.notebooks().join())}`);

  /* 左の木でも運べる */
  const side = (id) => `.notes-tree .js-tree-note[data-id="${id}"]`;
  await page.waitForSelector(side("n-x1"));
  const sGap = await gapY(side("n-x2k"), side("n-x3"));     // 二 は開いている（ホームと一つ）
  await carry(side("n-x1"), (x) => [x, sGap]);
  t.check("左の木でも運べる", (await garden()) === "二,一,三", await garden());

  /* キー */
  await page.focus(row("n-x3"));
  await page.keyboard.press("Alt+ArrowUp");
  t.check("Alt+↑ で一つ上へ", (await garden()) === "二,三,一", await garden());
  t.check("動かした行にカーソルが戻る", await page.evaluate(() => document.activeElement && document.activeElement.dataset.id === "n-x3"));
  await page.keyboard.press("Tab");
  t.check("Tab で一つ上の兄弟の中へ", await page.evaluate(() => KN.notes.tree().parentOf("n-x3") && KN.notes.tree().parentOf("n-x3").id === "n-x2"));
  await page.keyboard.press("Shift+Tab");
  t.check("Shift+Tab で親の次へ", (await garden()) === "二,三,一", await garden());
  await page.keyboard.press("ArrowDown");
  t.check("↑↓ で行を移る", await page.evaluate(() => document.activeElement && document.activeElement.dataset.id === "n-x1"));
  await page.focus(book("庭"));
  await page.keyboard.press("Alt+ArrowDown");
  t.check("ノートブックの行は Alt+↓ で並び", await page.evaluate(() => KN.notes.notebooks()[1]) === "庭");

  /* 空のノートブック（ホームの＋は外した。設定と同じ口） */
  await page.evaluate(() => { KN.screens.notes.newBook(); });
  await page.waitForSelector(".sheet.is-open .js-input");
  await page.fill(".sheet.is-open .js-input", "新しい棚");
  await page.click(".sheet.is-open .js-ok");
  t.check("空のノートブック（木の終わりに）", await page.waitForSelector(book("新しい棚"), { timeout: 3000 }).then(() => true, () => false)
    && await page.evaluate(() => KN.notes.notebooks().slice(-1)[0]) === "新しい棚");

  /* リンク先を中へ（「⋯」）：目次の行（リンクだけの行）が指すノートを、行の順に中の頭へ。文の途中・上の段・消したものは外す */
  await page.evaluate((list) => KN.notes.addMany(list), [
    nb("m-p", "上", "棚", AT(4, 1)),
    nb("m-top", "目次", "棚", AT(4, 2), { parent: "m-p",
      body: "- [甲](note:m-a)\n文の中の [乙](note:m-b) は参照\n[丙](note:m-c)\n[消](note:m-gone)\n[上](note:m-p)\n- [甲](note:m-a)" }),
    nb("m-k", "前から中", "棚", AT(4, 3), { parent: "m-top" }),
    nb("m-a", "甲", "家", AT(4, 4)), nb("m-b", "乙", "棚", AT(4, 5)), nb("m-c", "丙", "棚", AT(4, 6)),
    nb("m-c1", "丙の子", "棚", AT(4, 7), { parent: "m-c" }), nb("m-gone", "消", "棚", AT(4, 8), { deletedAt: AT(4, 9) }),
  ]);
  t.check("目次の行だけ・一度ずつ・上の段と消したものは外す", await page.evaluate(() => KN.notes.linked("m-top").map((n) => n.id).join()) === "m-a,m-c");
  const u0 = await page.evaluate(() => KN.notes.get("m-a").updatedAt);
  await page.evaluate(() => { const take = KN.backup.take; window.__took = []; KN.backup.take = (r, o) => { window.__took.push(r); return take(r, o); }; });
  await page.evaluate(() => KN.screens.notes.open("m-top"));
  await page.waitForSelector(".sheet.is-note.is-open .js-note-more");
  await page.click(".sheet.is-note.is-open .js-note-more");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "リンク先を中へ" }).click();
  const kidsOf = () => page.evaluate(() => KN.notes.tree().kids("m-top").map((n) => n.title).join());
  await page.waitForFunction(() => KN.notes.tree().kids("m-top").length === 3, null, { timeout: 4000 }).catch(() => {});
  t.check("リンク先を中へ：行の順に頭へ、前からの中はそのあと", (await kidsOf()) === "甲,丙,前から中", await kidsOf());
  t.check("子孫ごと・冊もそろう・更新日は動かない", await page.evaluate((u) => {
    const N = KN.notes;
    return N.get("m-c1").parent === "m-c" && N.get("m-a").notebook === "棚" && N.get("m-a").updatedAt === u && N.get("m-b").parent == null;
  }, u0));
  t.check("紙の中のノートにも出る", await page.waitForSelector(".sheet.is-note.is-open .note-kids .js-tree-note[data-id='m-a']", { timeout: 3000 }).then(() => true, () => false));
  t.check("控えを取ってから", await page.evaluate(() => window.__took.includes("リンク先を中へ移す前")));
  await page.click(".toast .toast-action");
  t.check("元に戻す", (await kidsOf()) === "前から中" && await page.evaluate(() => KN.notes.get("m-a").notebook === "家" && !("pos" in KN.notes.get("m-a"))), await kidsOf());
  await page.evaluate(() => KN.notes.gather("m-top"));
  await page.click(".sheet.is-note.is-open .js-note-more");
  await page.waitForSelector(".note-pop.is-open .note-pop-item");
  t.check("みな中に居れば「⋯」に出さない", !(await page.$$eval(".note-pop.is-open .note-pop-item", (xs) => xs.some((x) => x.textContent.includes("リンク先を中へ")))));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  t.check("落ちずに", !errors.length, errors.join(" / "));
  await browser.close();

  /* ================= 画面：指（電話の幅） ================= */
  const m = await open({ touch: true });
  const P = m.page;
  await P.evaluate(() => KN.notes.ready());
  await P.evaluate(() => KN.notes.addMany(["1", "2", "3", "4"].map((k, i) => ({ id: `n-f${k}`, title: `指${k}`, body: "x", notebook: "指", tags: [], fav: false,
    createdAt: `2026-09-02T0${i}:00:00.000Z`, updatedAt: `2026-09-02T0${i}:00:00.000Z`, deletedAt: null }))
    .concat(["1", "2", "3"].map((k, i) => ({ id: `n-k${k}`, title: `中${k}`, body: "x", notebook: "指", parent: "n-f1", tags: [], fav: false,
      createdAt: `2026-09-03T0${i}:00:00.000Z`, updatedAt: `2026-09-03T0${i}:00:00.000Z`, deletedAt: null })))));
  await P.click('.tab[data-tab="notes"]');
  await P.waitForSelector('#screen-notes .js-book[data-nb="指"]');
  await P.tap('#screen-notes .js-book[data-nb="指"] .nt-twist');
  await P.waitForSelector('#screen-notes .js-tree-note[data-id="n-f4"]');
  await P.waitForTimeout(400);   // 枝が伸び終わるまで（--m-grow）
  const cdp = await m.ctx.newCDPSession(P);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 1 }] });
  const fbox = async (sel) => P.locator(sel).first().boundingBox();
  const hold = async (sel, to) => {
    const b = await fbox(sel);
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await touch("touchStart", x, y);
    await P.waitForTimeout(520);                       // 長押し（KN.gesture.HOLD）
    const [tx, ty] = await to(x, y);
    for (let i = 1; i <= 10; i++) { await touch("touchMove", x + ((tx - x) * i) / 10, y + ((ty - y) * i) / 10); await frames(P); }
    await frames(P);
    await touch("touchEnd");
    await frames(P);
  };
  const fingers = () => P.evaluate(() => KN.notes.tree().tops("指").map((n) => n.title).join());
  const sc0 = await P.evaluate(() => KN.app.scrollerOf(document.getElementById("screen-notes")).scrollTop);
  const fr = (id) => `#screen-notes .js-tree-note[data-id="${id}"]`;
  await hold(fr("n-f4"), async () => { const A = await fbox(fr("n-f1")), B = await fbox(fr("n-f2")); return [A.x + A.width / 2, (A.y + A.height + B.y) / 2]; });
  t.check("長押しで持ち上げて運ぶ（指）", (await fingers()) === "指1,指4,指2,指3", await fingers());
  const sc1 = await P.evaluate(() => KN.app.scrollerOf(document.getElementById("screen-notes")).scrollTop);
  t.check("運んでいるあいだ器は送らない", Math.abs(sc1 - sc0) < 2, `${sc0} → ${sc1}`);
  /* 横にずらして段を下げる（指3 を一つ右へ → 一つ上の兄弟 指2 の中）。面は替わらない */
  await hold(fr("n-f3"), async (x) => { const b = await fbox(fr("n-f3")); return [x + 70, b.y - 1]; });
  t.check("指で右へずらすと段が下がる（ホームの木）", await P.evaluate(() => (KN.notes.tree().parentOf("n-f3") || {}).id) === "n-f2"
    && await P.evaluate(() => document.querySelector(".screen.is-active").dataset.screen) === "notes");
  await P.click(".toast .toast-action");
  t.check("元に戻す（指）", (await fingers()) === "指1,指4,指2,指3", await fingers());
  /* 動かさずに離す＝何も変わらず、開きもしない */
  await hold(fr("n-f2"), async (x, y) => [x, y]);
  t.check("長押しして動かさずに離すと、何も変わらず開かない", (await fingers()) === "指1,指4,指2,指3" && !(await P.$(".sheet.is-note")));

  /* 紙の中の「中のノート」：右へずらして段を下げても紙は戻らない */
  await P.tap(`${fr("n-f1")} .nt-name`);
  await P.waitForSelector(".sheet.is-note.is-open .note-kids .js-tree-note[data-id='n-k3']");
  await P.waitForTimeout(500);
  const kid = (id) => `.sheet.is-note.is-open .note-kids .js-tree-note[data-id="${id}"]`;
  await P.locator(kid("n-k3")).scrollIntoViewIfNeeded();
  await hold(kid("n-k3"), async (x) => { const b = await fbox(kid("n-k3")); return [x + 70, b.y - 1]; });
  t.check("紙の中で右へずらすと、一つ上の兄弟の中へ", await P.evaluate(() => KN.notes.tree().parentOf("n-k3").id) === "n-k2",
    await P.evaluate(() => KN.notes.tree().parentOf("n-k3").id));
  t.check("運ぶ指で紙は戻らない（払って戻るが退く）", !!(await P.$(".sheet.is-note.is-open")));
  t.check("落ちずに（指）", !m.errors.length, m.errors.join(" / "));
  await m.browser.close();
  t.done();
})();
