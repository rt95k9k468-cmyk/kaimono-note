/* パソコン・幅の広い画面（docs/desk.md）。ほかの台本はみな電話の幅で開くので、広い幅の崩れはここだけが見る。
   - 電話の幅：帯は下（変えていない）
   - 840px〜：帯は窓の背いっぱいの平らな左の列（幅 --rail-w。段5）、席は絵の右に名前の横長の行で縦に並び、印は縦に滑る。
     中身は帯の右から窓の右端まで
   - 読む幅：買うものの棚は 760px まで
   - 1440px：やることの今日は道が時間割の左（中身の幅 768px〜）、週の面は日の行が左・これからが右（1200px〜）、からだのカードは二段以上に並ぶ
   - ノートの左の木は左の列の中、席の行の下（840px でも出る）
   - 1280px〜：ノートの席で開いたノートは右の段（木と一覧の右・上の帯の下・窓の右端まで）。覆いは無く、
     一覧のほかのノートを押せば入れ替わる（開いているのは一枚）。＋は一覧の右下。ほかの席へ移ると閉じる
   - 1280px〜（段7）：ホームは木｜本文の二列（真ん中の一覧なし、★・問い は木に、＋は木の右下）。
     P2：左の列に木があればホームは最近直したの札（題・頭・日付。1100px も）、列を畳むと木のホームへ
     すべてのノート・問い・さがすときだけ真ん中に一覧。さがしているあいだも左の列は残る
   - 書く紙（日記）は読む幅（760px）・窓のほぼいっぱいの背
   - 買うもの（R5・11月11日）：左にリスト、右に選んだ品の値段（押した行の品）。リスト｜価格 はどの幅もめくる（1280px〜の左右並びは外した）
   - 右クリック：買うもの・価格の行の払う操作を小窓で。⌘\\・Ctrl+\\ と列の下の口で左の列を畳む（段6）
   - 広い幅から電話の幅へ縮めると、帯と印は下へ戻る
   - 段3（js/keys.js）：1〜5 で席・→ で次の日・t で今日・Shift+→ で次の週・, で設定・/ と Ctrl+K（⌘K）でさがす欄（欄で打つ字は席を動かさない）。
     トラックパッドの横払い（wheel の deltaX）は紙の上で日、暦の上で週を送る
   - 段8：設定は 1280px〜 見出しごとに二段（電話・1280px 未満はまとめない）。「›」は 32px ずらして薄く入れ替える
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("desk");
  const { browser, page, errors } = await open({ viewport: { width: 390, height: 844 } });
  const wait = (ms) => page.waitForTimeout(ms);
  const box = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

  await page.evaluate(async () => {
    const S = KN.store;
    const a = S.addStore("スーパー");
    ["牛乳", "卵", "食パン"].forEach((name) => { const p = S.addProduct({ name }); if (p) { S.addItem(p.id); S.addPrice(p.id, { storeId: a.id, price: 100, amount: 1, date: KN.util.todayKey() }); } });
    S.addTodo({ title: "試しの予定", due: KN.util.todayKey(), time: "10:00", minutes: 30 });
    S.addWeight({ day: KN.util.todayKey(), time: "07:00", kg: 60 });
    const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
    await KN.notes.addMany(["一つめ", "二つめ", "三つめ"].map((title, i) => ({ id: `n-desk${i}`, title, body: "試しの本文",
      notebook: "private", tags: [], fav: false, createdAt: at(i), updatedAt: at(i), deletedAt: null })));
  });

  /* 電話の幅：帯は下の横一列。 */
  const phoneBar = await box("#tabbar");
  const a1 = await box(".tab-archive"), a2 = await box(".tab-notes");
  t.check("電話の幅：帯は下で、席は横に並ぶ", phoneBar.b >= 844 - 1 && a1.t === a2.t && a2.l > a1.l, JSON.stringify({ phoneBar, a1, a2 }));

  /* 広い幅。 */
  await page.setViewportSize({ width: 1440, height: 900 });
  await wait(400);
  const bar = await box("#tabbar");
  const d1 = await box(".tab-archive"), d2 = await box(".tab-notes");
  const ico = await box(".tab-archive .tab-ico"), lab = await box(".tab-archive .tab-label");
  t.check("広い幅：帯は窓の背いっぱいの左の列（幅 256px）、席は縦に並ぶ横長の行（絵の右に名前）",
    bar.l === 0 && bar.w === 256 && bar.t === 0 && bar.b === 900 && d1.l === d2.l && d2.t > d1.t && d1.w > 180 && d1.h <= 44
    && ico.r <= lab.l && Math.abs((ico.t + ico.b) / 2 - (lab.t + lab.b) / 2) <= 3, JSON.stringify({ bar, d1, d2, ico, lab }));
  const app = await box("#app"), scr = await box("#screens");
  t.check("中身は帯の右から窓の右端まで", app.w === 1440 && scr.l === 256 && scr.r === 1440, JSON.stringify({ app, scr }));
  const glass = await page.evaluate(() => getComputedStyle(document.getElementById("tabbar"), "::before").display);
  t.check("左の列はガラスのカプセルを持たない（平らな地）", glass === "none", glass);

  const lensAt = async (id) => {
    await page.click(`.tab-${id}`);
    await page.waitForFunction((i) => document.documentElement.dataset.screen === i, id);
    await wait(700);
    const l = await box(".tab-lens"), tab = await box(`.tab-${id}`);
    return Math.abs((l.t + l.b) / 2 - (tab.t + tab.b) / 2) <= 2 && l.l >= tab.l && l.r <= tab.r && l.h <= tab.h;
  };
  t.check("印は席から席へ縦に滑る（いつも押した席の上、行からはみ出さない）", (await lensAt("list")) && (await lensAt("diet")) && (await lensAt("todo")));

  /* 段3：キーボードとトラックパッド（js/keys.js）。打っていないときだけ。 */
  const scrId = () => page.evaluate(() => document.documentElement.dataset.screen);
  const todoDay = () => page.evaluate(() => KN.screens.todo.day());
  const today = await page.evaluate(() => KN.util.todayKey());
  const tomorrow = await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), 1));
  await page.keyboard.press("1");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "archive", null, { timeout: 3000 }).catch(() => {});
  const k1 = await scrId();
  await page.keyboard.press("3");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "todo", null, { timeout: 3000 }).catch(() => {});
  t.check("1〜5 で席を移る", k1 === "archive" && (await scrId()) === "todo", k1);
  await wait(600);
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((d) => KN.screens.todo.day() === d, tomorrow, { timeout: 3000 }).catch(() => {});
  const kr = await todoDay();
  await wait(400);
  await page.keyboard.press("t");
  await page.waitForFunction((d) => KN.screens.todo.day() === d, today, { timeout: 3000 }).catch(() => {});
  t.check("→ で次の日、t で今日へ", kr === tomorrow && (await todoDay()) === today, JSON.stringify({ kr, today: await todoDay() }));
  await wait(600);
  /* 週の頭＝選んだ日（.is-here）の行の先頭。盤は月ぶん並ぶので、先頭のマスでは同じ月の中の週送りが見えない。 */
  const weekOf = () => page.evaluate(() => {
    const cs = [...document.querySelectorAll("#head .cal-day[data-day]")], i = cs.findIndex((c) => c.classList.contains("is-here"));
    return i < 0 ? null : cs[i - (i % 7)].dataset.day;
  });
  const weekIs = (pred) => page.waitForFunction(([w, eq]) => {
    const cs = [...document.querySelectorAll("#head .cal-day[data-day]")], i = cs.findIndex((c) => c.classList.contains("is-here"));
    return i >= 0 && (cs[i - (i % 7)].dataset.day === w) === eq;
  }, pred, { timeout: 3000 }).catch(() => {});
  const w0 = await weekOf();
  await page.keyboard.press("Shift+ArrowRight");
  await weekIs([w0, false]);
  const w1 = await weekOf();
  t.check("Shift+→ で暦が次の週へ", !!w0 && !!w1 && w1 > w0, JSON.stringify({ w0, w1 }));
  await page.keyboard.press("Shift+ArrowLeft");
  await weekIs([w0, true]);
  await wait(500);
  /* トラックパッドの横払い：紙の上なら日、暦の上なら週。 */
  const paper = await box("#screen-todo .tl-sheet");
  await page.mouse.move(paper.l + 300, paper.t + 300);
  await page.mouse.wheel(120, 4);
  await page.waitForFunction((d) => KN.screens.todo.day() === d, tomorrow, { timeout: 3000 }).catch(() => {});
  const wr = await todoDay();
  await wait(500);
  await page.keyboard.press("t");
  await page.waitForFunction((d) => KN.screens.todo.day() === d, today, { timeout: 3000 }).catch(() => {});
  await wait(500);
  const calBox = await box("#head .head-cal");
  await page.mouse.move(calBox.l + 200, calBox.t + calBox.h / 2);
  await page.mouse.wheel(120, 0);
  await weekIs([w0, false]);
  const ww = await weekOf();
  t.check("トラックパッドの横払い：紙の上で次の日、暦の上で次の週", wr === tomorrow && ww > w0, JSON.stringify({ wr, ww, w0 }));
  await page.mouse.wheel(-120, 0);
  await weekIs([w0, true]);
  await wait(500);
  await page.keyboard.press(",");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "settings", null, { timeout: 3000 }).catch(() => {});
  const ks = await scrId();
  await page.keyboard.press("3");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "todo", null, { timeout: 3000 }).catch(() => {});
  t.check(", で設定、設定から 3 でやることへ", ks === "settings" && (await scrId()) === "todo", ks);
  await wait(600);
  await page.keyboard.press("/");
  await wait(500);
  const found = await page.evaluate(() => { const a = document.activeElement; return !!(a && a.matches("input")); });
  await page.keyboard.press("2");
  await wait(400);
  t.check("/ でさがす欄へ、欄で打つ字は席を動かさない", found && (await scrId()) === "todo");
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForFunction(() => !document.querySelector(".sheet-backdrop"), null, { timeout: 3000 }).catch(() => {});
  await wait(400);
  /* 段5：⌘K・Ctrl+K でもさがす欄へ。 */
  await page.keyboard.press("Control+k");
  await wait(500);
  t.check("Ctrl+K（⌘K）でさがす欄へ", await page.evaluate(() => { const a = document.activeElement; return !!(a && a.matches("input.js-search")); }));
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await wait(400);

  /* やることの今日：道が時間割の左。 */
  // R3：左に帯と時間割、右に時刻なしと今週（docs/redesign.md 6節）。
  const road = await box("#screen-todo .tk-day > .todo-day"), tl = await box("#screen-todo .tk-day > .tk-side");
  const face = await page.evaluate(() => document.getElementById("screen-todo").dataset.face);
  t.check("やることの今日：帯と時間割（左）の右に時刻なしと今週", face === "today" && road && tl && road.r <= tl.l && Math.abs(road.t - tl.t) < 40,
    JSON.stringify({ face, road, tl }));

  /* 週の面：左に日の行、右に期限・やること・これから（段4）。 */
  await page.click('#screen-todo .wk-faces .seg-btn[data-face="week"]');
  await page.waitForFunction(() => document.getElementById("screen-todo").dataset.face === "week", null, { timeout: 3000 }).catch(() => {});
  await wait(700);
  const wkMain = await box("#screen-todo .wk.is-two > .wk-main"), wkSide = await box("#screen-todo .wk.is-two > .wk-side");
  const later = await page.evaluate(() => !!document.querySelector("#screen-todo .wk-side .wk-later, #screen-todo .wk-side .wk-later-h, #screen-todo .wk-side [class*='later']"));
  t.check("週の面：日の行は左、これからは右に並ぶ", wkMain && wkSide && wkMain.r <= wkSide.l && Math.abs(wkMain.t - wkSide.t) < 30 && later,
    JSON.stringify({ wkMain, wkSide, later }));
  await page.click('#screen-todo .wk-faces .seg-btn[data-face="today"]');
  await page.waitForFunction(() => document.getElementById("screen-todo").dataset.face === "today", null, { timeout: 3000 }).catch(() => {});
  await wait(600);

  /* からだ：段組み（R4：推移のカードが体重の横に）。 */
  await page.click(".tab-diet");
  await wait(700);
  const tops = await page.evaluate(() => {
    const d = document.querySelector("#screen-diet .js-day-card"), kg = d.querySelector(".hl-hero.is-kg").getBoundingClientRect();
    const ch = d.querySelector(".hl-chart").getBoundingClientRect();
    return [Math.round(kg.top), Math.round(ch.top), ch.left > kg.right];
  });
  t.check("からだ：カードは横にも並ぶ（推移が体重の横）", tops[2] && Math.abs(tops[0] - tops[1]) < 2, JSON.stringify(tops));
  const dietPaper = await page.evaluate(() => { const s = document.querySelector("#screen-diet .tl-sheet"), r = s.getBoundingClientRect();
    return { bg: getComputedStyle(s).backgroundColor, b: Math.round(r.bottom) }; });
  t.check("からだ：紙は窓の底まで地を持つ（段に並んだカードの束の下で切れない）", dietPaper.bg !== "rgba(0, 0, 0, 0)" && dietPaper.b === 900,
    JSON.stringify(dietPaper));

  /* R5：左にリスト、右に選んだ品の値段（docs/redesign.md。前は 1280px〜で買うもの｜価格を左右に並べた）。 */
  await page.click(".tab-list");
  await wait(700);
  const two = await page.evaluate(() => {
    const m = document.querySelector("#screen-list .sh-main"), c = document.querySelector("#screen-list .sh-cmp");
    const r = (e) => e && e.getBoundingClientRect();
    return { m: m && Math.round(r(m).right), c: c && Math.round(r(c).left), shown: !!c && getComputedStyle(c).display !== "none",
      prices: document.getElementById("screen-prices").hidden !== false, fabs: document.querySelectorAll("#dock .add-fab").length };
  });
  t.check("買うもの：左にリスト、右に選んだ品の値段（価格は隠れたまま・＋は一つ）", two.shown && two.c >= two.m && two.prices && two.fabs === 1,
    JSON.stringify(two));
  await page.click("#screen-list .item-wrap:nth-child(2) .item-name");
  await wait(500);
  await page.keyboard.press("Escape");
  await wait(500);
  t.check("行を押すと、右の段はその品（紙を閉じても）", await page.evaluate(() => {
    const c = document.querySelector("#screen-list .sh-cmp"), w = document.querySelectorAll("#screen-list .item-wrap")[1];
    return !!c && c.dataset.productId === KN.store.get().items.find((i) => i.id === w.dataset.itemId).productId;
  }));
  await page.click(".tab-list");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "prices", null, { timeout: 3000 }).catch(() => {});
  t.check("広い幅でも席の二度押しで価格へめくる", await page.evaluate(() => document.documentElement.dataset.screen === "prices"));
  /* W3：価格も買うものと同じ棚のカードと棚の名前（R5 からどの幅も）。 */
  const shelf = await page.evaluate(() => {
    const R = document.querySelector("#screen-prices .cat-group.is-run");
    const c = R && getComputedStyle(R);
    return { r: c && [c.backgroundColor, c.borderTopWidth, c.borderTopLeftRadius].join(" "), head: !!(R && R.querySelector(".shelf-head .chip-dot")) };
  });
  t.check("価格も棚のカードと棚の名前（W3）", !!shelf.r && shelf.head, JSON.stringify(shelf));
  t.check("窓の題は prices", (await page.title()) === "prices — くらしノート", await page.title());
  await page.click(".tab-list");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "list", null, { timeout: 3000 }).catch(() => {});
  await wait(500);
  t.check("窓の題に席の名前（W4）", (await page.title()) === "shopping — くらしノート", await page.title());
  /* W4：マウスで指した行は薄く塗る（動きは足さない）。 */
  const tint = async () => page.evaluate(() => getComputedStyle(document.querySelector("#screen-list .item-wrap .item")).backgroundImage);
  const before = await tint();
  await page.hover("#screen-list .item-wrap .item-name");
  await wait(100);
  const over = await tint();
  await page.mouse.move(600, 880);
  await wait(100);
  t.check("指した行は薄く塗り、離れれば戻る（W4）", before === "none" && /gradient/.test(over) && (await tint()) === "none", JSON.stringify({ before, over }));

  /* 右クリック：行の払う操作を小窓で。 */
  await page.click("#screen-list .item-wrap .item-name", { button: "right" });
  await wait(300);
  const listMenu = await page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.textContent.trim()));
  t.check("右クリック（買うもの）：今回買う・買った・リストから外す・アーカイブ", JSON.stringify(listMenu) === JSON.stringify(["今回買う", "買った", "リストから外す", "アーカイブ"]),
    JSON.stringify(listMenu));
  await page.click(".note-pop-item >> text=今回買う");
  await wait(300);
  t.check("右クリック：今回買う で★が付く", await page.evaluate(() => KN.store.get().items.filter((i) => i.fav).length === 1));
  await page.click(".tab-list");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "prices", null, { timeout: 3000 }).catch(() => {});
  await wait(500);
  await page.click("#screen-prices .product-wrap .product-name", { button: "right" });
  await wait(300);
  const priceMenu = await page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.textContent.trim()));
  t.check("右クリック（価格）：リストから外す・アーカイブ", JSON.stringify(priceMenu) === JSON.stringify(["リストから外す", "アーカイブ"]), JSON.stringify(priceMenu));
  await page.keyboard.press("Escape");
  await wait(300);

  await page.click(".tab-list");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "list", null, { timeout: 3000 }).catch(() => {});
  await wait(500);

  /* 左の列を畳む（⌘\・Ctrl+\）。 */
  await page.keyboard.press("Control+Backslash");
  await wait(500);
  const folded = await page.evaluate(() => ({ bar: Math.round(document.getElementById("tabbar").getBoundingClientRect().width),
    scr: Math.round(document.getElementById("screen-list").getBoundingClientRect().left),
    label: getComputedStyle(document.querySelector(".tab-list .tab-label")).display,
    title: document.querySelector(".tab-list").title, saved: KN.store.get().settings.railFolded }));
  t.check("Ctrl+\\：列は絵だけの細い列に、中身はその右から", folded.bar === 64 && folded.scr === 64 && folded.label === "none"
    && folded.title === "shopping" && folded.saved === true, JSON.stringify(folded));
  await page.click("#rail-fold");
  await wait(500);
  t.check("列の下の口で開く", await page.evaluate(() => Math.round(document.getElementById("tabbar").getBoundingClientRect().width) === 256
    && !document.querySelector(".tab-list").title));

  /* ノート：左の木は左の列の中、席の行の下。 */
  await page.click(".tab-notes");
  await wait(800);
  const tree = await box(".notes-tree"), lastSeat = await box(".tab-diet"), notesScr = await box("#screen-notes");
  t.check("ノート：左の木は左の列の中（席の行の下）、ノートの画面は列の右から", tree && tree.l === 0 && tree.r <= 256 && tree.t >= lastSeat.b
    && tree.b < 900 && tree.b > 820 && notesScr.l === 256, JSON.stringify({ tree, lastSeat, notesScr }));

  /* 段7・P2 → R7：ホームは木｜本文（真ん中の一覧は出さない）。本文は二段——左に本棚、右に札と最近直したの一覧
     （題・頭の一行・日付・表紙の四角）。★・問い は木にも（最近直したは本文にあるので木には出さない）。 */
  const shown = (s) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== "none"; }, s);
  const homeLook = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll("#screen-notes .nt-home-r .note-row")];
    const bks = document.querySelector("#screen-notes .nt-home-l .nt-bks"), list = document.querySelector("#screen-notes .nt-home-r .notes-list");
    const b = bks && bks.getBoundingClientRect(), r = list && list.getBoundingClientRect();
    return {
      n: rows.length, l: b && Math.round(b.left), side: !!(b && r && r.left > b.right),
      parts: rows[0] ? [".note-t", ".note-x", ".note-d", ".nt-cv"].map((k) => (rows[0].querySelector(k) ? rows[0].querySelector(k).textContent.trim() || "□" : "")) : [],
      tree: document.querySelectorAll('#screen-notes .notes-books[role="tree"]').length,
      mid: document.documentElement.classList.contains("notes-mid"),
      quick: [...document.querySelectorAll(".notes-tree .nt-quick")].map((e) => e.getAttribute("aria-label")),
    };
  });
  const home = await homeLook();
  t.check("二列のホーム：左に本棚、右に最近直したの一覧（題・頭の一行・日付・表紙）、木は左の列だけ", home.n === 3 && home.side && home.l >= 256
    && home.parts[0] === "一つめ" && home.parts[1] === "試しの本文" && /\d+:\d\d$/.test(home.parts[2]) && home.parts[3] === "□" && home.tree === 0 && !home.mid
    && await shown(".notes-tree .js-tree-asks") && !home.quick.includes("最近直した"), JSON.stringify(home));
  await page.click('#screen-notes .note-row[data-id="n-desk0"] .js-open');
  await page.waitForSelector(".sheet.is-note.is-open");
  await wait(500);
  const pane0 = await box(".sheet.is-note.is-open"), fab0 = await box("#dock");
  const fabTop = await page.evaluate(() => { const r = document.getElementById("dock").getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && !!e.closest("#dock"); });
  t.check("二列のホーム：開いたノートは木のすぐ右から・＋は木の右下（隠れない）", pane0 && pane0.l === 256 && pane0.r === 1440 && fab0.r <= 256 && fabTop,
    JSON.stringify({ pane0, fab0, fabTop }));
  await page.keyboard.press("Control+k");
  await wait(500);
  t.check("さがすと真ん中の一覧が出る・左の列は残る", (await homeLook()).mid && await shown("#screen-notes .search-wrap") && await shown(".tab-archive")
    && Math.round((await box(".sheet.is-note.is-open")).l) >= 256 + 380);
  await page.evaluate(() => document.activeElement.blur());
  await wait(400);
  t.check("空のまま窓を離れると二列へ戻る", !(await homeLook()).mid && await shown("#screen-notes .nt-home-two"));
  await page.evaluate(() => document.querySelector(".notes-tree .js-tree-all").click());
  await wait(600);

  /* 三列（すべてのノート）：開いたノートは右の段。 */
  const openRow = async (title) => {
    await page.evaluate((s) => {
      const r = [...document.querySelectorAll("#screen-notes .note-row .note-open")].find((e) => e.textContent.includes(s));
      r.click();
    }, title);
    await page.waitForFunction((s) => [...document.querySelectorAll(".sheet.is-note.is-open")].some((e) => e.querySelector(".note-title-in") && e.querySelector(".note-title-in").value === s), title);
    await wait(500);
  };
  await openRow("一つめ");
  const pane = await box(".sheet.is-note.is-open");
  const list = await box("#screen-notes .notes-ground");
  const bd = await page.evaluate(() => { const b = document.querySelector(".sheet-backdrop.is-note-cover"); return b ? getComputedStyle(b).display : "none"; });
  t.check("三列：開いたノートは木と一覧の右・窓の右端まで（覆いなし）", pane && list && pane.l >= list.r && pane.r === 1440 && pane.t >= 40 && pane.b === 900 && bd === "none",
    JSON.stringify({ pane, list, bd }));
  const fab = await box("#dock");
  t.check("三列：＋は一覧の右下（右の段に隠れない）", fab && pane && fab.r <= pane.l && fab.r > list.r - 120, JSON.stringify({ fab, pane, list }));
  await openRow("二つめ");
  const n = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-note")].filter((e) => e.isConnected && e.classList.contains("is-open")).length);
  t.check("一覧のほかのノートを押すと入れ替わる（開いているのは一枚）", n === 1, `開いている紙 ${n}`);
  await page.click(".tab-todo");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note.is-open"), null, { timeout: 3000 }).catch(() => {});
  t.check("ほかの席へ移ると、開いていたノートは閉じる", await page.evaluate(() => !document.querySelector(".sheet.is-note.is-open")));

  /* 書く紙（日記）は広い幅では読む幅の大きな一枚。 */
  await page.click(".tab-archive");
  await wait(800);
  await page.evaluate(() => document.querySelector(".js-think-write").click());
  await page.waitForSelector(".sheet.is-card.is-open");
  await wait(600);
  const card = await box(".sheet.is-card.is-open");
  t.check("日記の書く紙は幅 760px・窓のほぼいっぱいの背", card && card.w === 760 && card.h >= 900 - 80, JSON.stringify(card));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-card"), null, { timeout: 3000 }).catch(() => {});

  /* 電話の幅へ戻す。 */
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(500);
  const back = await box("#tabbar"), lens = await box(".tab-lens"), todo = await box(".tab-todo");
  t.check("電話の幅へ縮めると、帯と印は下へ戻る", back.b >= 843 && back.w === 390 && Math.abs(lens.t - todo.t) < 20, JSON.stringify({ back, lens, todo }));

  /* 段8：設定。電話はまとめない。1280px からは見出しごとのまとまりを二段に（幅をまたげば組み直す）。
     「›」は一面ぶん滑らせず、32px だけずらして薄く入れ替える。 */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await wait(700);
  t.check("設定：電話の幅はまとめない（一列のまま）", await page.evaluate(() => !document.querySelector("#screen-settings .set-sec, #screen-settings .is-duo")));
  await page.setViewportSize({ width: 1440, height: 900 });
  await wait(500);
  /* 根っこも二段（R8、11月12日）：左に 表示・通知 と データ、右に タブごと。右の段の頭は左の段の頭に揃う。 */
  const rootLook = await page.evaluate(() => { const L = document.querySelector("#screen-settings .set-layer");
    const r = (s) => { const e = L.querySelector(s); return e && e.getBoundingClientRect(); };
    const a = r(".set-sec:nth-child(1)"), b = r(".set-sec:nth-child(2)"), c = r(".set-sec:nth-child(3)");
    return { duo: L.classList.contains("is-duo"), right: !!(a && b && c) && b.left > a.right - 1 && Math.abs(b.top - a.top) < 2 && Math.abs(c.left - a.left) < 2 && c.top > a.bottom - 1,
      tabs: (L.querySelector(".set-sec:nth-child(2) .set-head") || {}).textContent }; });
  t.check("設定：根っこは 1280px〜で二段（右にタブごと）", rootLook.duo && rootLook.right && /タブ/.test(rootLook.tabs), JSON.stringify(rootLook));
  await page.locator("#screen-settings .set-row", { hasText: "表示・操作" }).first().click();
  await wait(60);
  const mid = await page.evaluate(() => { const L = [...document.querySelectorAll("#screen-settings .set-layer")].pop();
    return { l: Math.round(L.getBoundingClientRect().left), o: +getComputedStyle(L).opacity, n: document.querySelectorAll("#screen-settings .set-layer").length }; });
  t.check("設定：「›」は一面ぶん滑らせず、少しずらして薄く入れ替える", mid.n === 2 && mid.l >= 256 && mid.l <= 256 + 32 && mid.o < 1, JSON.stringify(mid));
  await wait(600);
  const secs = await page.evaluate(() => [...document.querySelectorAll("#screen-settings .set-layer:last-child.is-duo .set-sec > .set-head")]
    .map((h) => { const r = h.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top) }; }));
  const rightSecs = secs.filter((x) => x.l > secs[0].l + 300);
  t.check("設定：1280px〜は入口の先の一枚を見出しごとに二段（右の段の頭の見出しは左の段の頭に揃う）",
    secs.length >= 2 && rightSecs.length >= 1 && rightSecs[0].t === secs[0].t
      && secs.every((x) => x.l === secs[0].l || x.l === rightSecs[0].l), JSON.stringify(secs));
  t.check("設定の表示・操作に「一文字の近道」（指の細かい端末）", await page.locator("#screen-settings .set-layer:last-child .set-row", { hasText: "一文字の近道" }).count() === 1);
  await page.locator("#screen-settings .set-layer:last-child .set-back").click();
  await wait(600);
  t.check("設定：戻ると根っこ一枚が素の姿で残る", await page.evaluate(() => { const L = document.querySelectorAll("#screen-settings .set-layer");
    return L.length === 1 && !L[0].style.transform && getComputedStyle(L[0]).opacity === "1"; }));
  await page.setViewportSize({ width: 1100, height: 800 });
  await wait(500);
  t.check("設定：1280px より狭い desk は一列", await page.evaluate(() => !document.querySelector("#screen-settings .is-duo")));

  /* P2：1280px より狭い desk でも、ホームは札（前は左の木と同じ木を二度出していた）。列を畳むと木のホームへ。 */
  await page.click(".tab-notes");
  await wait(700);
  await page.click(".tab-notes");    // 二度押しでホームへ（上で「すべてのノート」へ降りた）
  await wait(500);
  const home11 = await homeLook();
  t.check("1100px：ノートのホームは最近直したの札・木は左の列だけ", home11.n === 3 && home11.side && home11.tree === 0, JSON.stringify(home11));
  await page.keyboard.press("Control+Backslash");
  await wait(600);
  const homeF = await homeLook();
  t.check("列を畳んでも（木が無い）ホームは同じ二段（木は本棚の一冊の中）", homeF.n === 3 && homeF.side && homeF.tree === 0, JSON.stringify(homeF));
  await page.keyboard.press("Control+Backslash");
  await wait(400);

  /* X2：↑↓ で行・Space で済ませる・Enter で開く（広い幅）。 */
  const kx = await page.evaluate(() => {
    const U = KN.util;
    return [KN.store.addTodo({ title: "鍵盤の一", due: U.todayKey() }).id, KN.store.addTodo({ title: "鍵盤の二", due: U.todayKey() }).id];
  });
  await page.click(".tab-todo");
  await wait(600);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const at = () => page.evaluate(() => { const a = document.activeElement; const n = a && a.closest(".item"); return n ? n.textContent.replace(/\s+/g, "") : ""; });
  await page.keyboard.press("ArrowDown");
  const r1 = await at();
  await page.keyboard.press("ArrowDown");
  const r2 = await at();
  t.check("↓ で行へ、もう一度で次の行へ", !!r1 && !!r2 && r1 !== r2, `${r1} / ${r2}`);
  /* 頭で足した「試しの予定」（10:00）は、10時前だと鍵盤の二つより上に並ぶ——鍵盤の行まで↓で進めてから押す。 */
  let r3 = r2;
  for (let i = 0; i < 6 && !r3.includes("鍵盤の"); i++) { await page.keyboard.press("ArrowDown"); r3 = await at(); }
  const which = r3.includes("鍵盤の二") ? kx[1] : r3.includes("鍵盤の一") ? kx[0] : null;
  await page.keyboard.press("Space");
  await wait(500);
  t.check("Space でその行を済ませる", !!which && await page.evaluate((id) => !!KN.store.get().todos.find((x) => x.id === id).done, which), r3);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".sheet.is-open", { timeout: 3000 }).catch(() => {});
  t.check("Enter で行の紙が開く", !!(await page.$(".sheet.is-open")));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
  await wait(300);

  /* 段11：? で近道の一覧。一文字の近道は切れる（切っても ⌘K・⌘\\ は効く）。 */
  await page.click(".tab-todo");
  await wait(500);
  await page.keyboard.press("?");
  await page.waitForSelector(".sheet.is-open .keys-list", { timeout: 3000 }).catch(() => {});
  t.check("? で近道の一覧", await page.evaluate(() => document.querySelectorAll(".sheet.is-open .keys-list kbd").length >= 10));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
  await wait(300);
  await page.evaluate(() => KN.keys.setOn(false));
  await page.keyboard.press("2");
  await wait(400);
  const offSeat = await page.evaluate(() => KN.app.activeScreen());
  await page.evaluate(() => KN.keys.setOn(true));
  await page.keyboard.press("2");
  await wait(400);
  const onSeat = await page.evaluate(() => KN.app.activeScreen());
  t.check("一文字の近道を切ると 2 で席が移らない・入れると移る", offSeat === "todo" && onSeat === "notes", JSON.stringify({ offSeat, onSeat }));

  const rowH = () => page.evaluate(() => Math.round(document.querySelector(".tab-list").getBoundingClientRect().height));
  t.check("マウスの左の列の行は 42px", (await rowH()) === 42, String(await rowH()));
  t.check("エラーなし", !errors.length, errors.join(" | "));
  await browser.close();

  /* W6：指で触る広い画面（iPad の横）は、左の列の行と畳む口を 44px。 */
  {
    const c = await open({ viewport: { width: 1180, height: 820 }, touch: true });
    const h = await c.page.evaluate(() => ({ coarse: matchMedia("(pointer: coarse)").matches,
      tabs: [...document.querySelectorAll("#tabbar .tab")].map((b) => Math.round(b.getBoundingClientRect().height)),
      fold: Math.round(document.getElementById("rail-fold").getBoundingClientRect().height) }));
    t.check("指の 1180px：左の列の行と畳む口は 44px（W6）", h.coarse && h.tabs.length === 5 && h.tabs.every((x) => x === 44) && h.fold === 44, JSON.stringify(h));
    await c.page.click(".tab-notes");
    await c.page.waitForTimeout(600);
    const tree = await c.page.evaluate(() => {
      const last = [...document.querySelectorAll("#tabbar .tab")].pop().getBoundingClientRect();
      const t = [...document.querySelectorAll(".notes-tree")].find((e) => e.getClientRects().length);
      return { last: Math.round(last.bottom), tree: t ? Math.round(t.getBoundingClientRect().top) : null };
    });
    t.check("指の 1180px：ノートの木は席の行の下から（重ならない）", tree.tree != null && tree.tree >= tree.last, JSON.stringify(tree));
    t.check("指の 1180px：エラーなし", !c.errors.length, c.errors.join(" | "));
    await c.browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
