/* パソコン・幅の広い画面（docs/desk.md）。ほかの台本はみな電話の幅で開くので、広い幅の崩れはここだけが見る。
   - 電話の幅：帯は下（変えていない）
   - 840px〜：帯は窓の背いっぱいの平らな左の列（幅 --rail-w。段5）、席は絵の右に名前の横長の行で縦に並び、印は縦に滑る。
     中身は帯の右から窓の右端まで
   - 読む幅：買うものの棚は 760px まで
   - 1440px：やることの今日は道が時間割の左（中身の幅 792px〜）、週の面は日の行が左・これからが右（1200px〜）、からだのカードは二段以上に並ぶ
   - ノートの左の木は左の列の中、席の行の下（840px でも出る）
   - 1280px〜：ノートの席で開いたノートは右の段（木と一覧の右・上の帯の下・窓の右端まで）。覆いは無く、
     一覧のほかのノートを押せば入れ替わる（開いているのは一枚）。＋は一覧の右下。ほかの席へ移ると閉じる
   - 1280px〜（段7）：ホームは木｜本文の二列（真ん中の一覧なし、★・問い は木に、＋は木の右下）。
     P2：左の列に木があればホームは最近直したの札（題・頭・日付。1100px も）、列を畳むと木のホームへ
     すべてのノート・問い・さがすときだけ真ん中に一覧。さがしているあいだも左の列は残る
   - 書く紙（日記）は読む幅（760px）・窓のほぼいっぱいの背
   - 1280px〜：買うもの｜価格は左右に並ぶ（席の二度押しでめくらない・＋は一枚ずつ・#prices でも並び）。1280px より狭い desk はめくる
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
  t.check("広い幅：帯は窓の背いっぱいの左の列（幅 232px）、席は縦に並ぶ横長の行（絵の右に名前）",
    bar.l === 0 && bar.w === 232 && bar.t === 0 && bar.b === 900 && d1.l === d2.l && d2.t > d1.t && d1.w > 180 && d1.h <= 40
    && ico.r <= lab.l && Math.abs((ico.t + ico.b) / 2 - (lab.t + lab.b) / 2) <= 3, JSON.stringify({ bar, d1, d2, ico, lab }));
  const app = await box("#app"), scr = await box("#screens");
  t.check("中身は帯の右から窓の右端まで", app.w === 1440 && scr.l === 232 && scr.r === 1440, JSON.stringify({ app, scr }));
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
  const weekOf = () => page.evaluate(() => { const c = document.querySelector("#head .cal-day[data-day]"); return c ? c.dataset.day : null; });
  const w0 = await weekOf();
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForFunction((w) => { const c = document.querySelector("#head .cal-day[data-day]"); return c && c.dataset.day !== w; }, w0, { timeout: 3000 }).catch(() => {});
  const w1 = await weekOf();
  t.check("Shift+→ で暦が次の週へ", !!w0 && !!w1 && w1 > w0, JSON.stringify({ w0, w1 }));
  await page.keyboard.press("Shift+ArrowLeft");
  await page.waitForFunction((w) => { const c = document.querySelector("#head .cal-day[data-day]"); return c && c.dataset.day === w; }, w0, { timeout: 3000 }).catch(() => {});
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
  await page.waitForFunction((w) => { const c = document.querySelector("#head .cal-day[data-day]"); return c && c.dataset.day !== w; }, w0, { timeout: 3000 }).catch(() => {});
  const ww = await weekOf();
  t.check("トラックパッドの横払い：紙の上で次の日、暦の上で次の週", wr === tomorrow && ww > w0, JSON.stringify({ wr, ww, w0 }));
  await page.mouse.wheel(-120, 0);
  await page.waitForFunction((w) => { const c = document.querySelector("#head .cal-day[data-day]"); return c && c.dataset.day === w; }, w0, { timeout: 3000 }).catch(() => {});
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
  const road = await box("#screen-todo .day-road"), tl = await box("#screen-todo .todo-day.is-tl > .tl");
  const face = await page.evaluate(() => document.getElementById("screen-todo").dataset.face);
  t.check("やることの今日：道は時間割の左に並ぶ", face === "today" && road && tl && road.r <= tl.l && Math.abs(road.t - tl.t) < 40,
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

  /* からだ：カードは段組み（同じ高さに二枚以上）。 */
  await page.click(".tab-diet");
  await wait(700);
  const tops = await page.evaluate(() => [...document.querySelectorAll("#screen-diet .diet-day.is-here > .diet-card, #screen-diet .day-slide > .diet-card")]
    .map((c) => Math.round(c.getBoundingClientRect().top)));
  t.check("からだ：カードは横にも並ぶ", tops.length >= 2 && new Set(tops).size < tops.length, JSON.stringify(tops));
  const dietPaper = await page.evaluate(() => { const s = document.querySelector("#screen-diet .tl-sheet"), r = s.getBoundingClientRect();
    return { bg: getComputedStyle(s).backgroundColor, b: Math.round(r.bottom) }; });
  t.check("からだ：紙は窓の底まで地を持つ（段に並んだカードの束の下で切れない）", dietPaper.bg !== "rgba(0, 0, 0, 0)" && dietPaper.b === 900,
    JSON.stringify(dietPaper));

  /* 1280px〜 買うもの｜価格を左右に（段6）。席の二度押しでもめくらない。＋は一枚ずつ。 */
  await page.click(".tab-list");
  await wait(700);
  const lst = await box("#screen-list"), prc = await box("#screen-prices");
  t.check("買うもの｜価格：左右に並ぶ（列の右から真ん中・真ん中から窓の右端）", lst && prc && lst.l === 232 && Math.abs(lst.r - 836) <= 1
    && Math.abs(prc.l - 836) <= 1 && prc.r === 1440 && prc.w > 0, JSON.stringify({ lst, prc }));
  t.check("並べても席は買うもの、価格の行も出ている", await page.evaluate(() => document.documentElement.dataset.screen === "list"
    && document.querySelectorAll("#screen-prices .product-wrap").length === 3));
  const fabs = await page.evaluate(() => [...document.querySelectorAll("#dock .add-fab")].map((b) => Math.round(b.getBoundingClientRect().right)));
  t.check("＋は一枚ずつ、その一枚の右下に", fabs.length === 2 && fabs[0] <= 836 && fabs[1] > 836, JSON.stringify(fabs));
  await page.click(".tab-list");
  await wait(700);
  t.check("並べているあいだ、席の二度押しはめくらない", await page.evaluate(() => document.documentElement.dataset.screen === "list"
    && !document.querySelector(".is-face-parked") && !document.getElementById("screen-prices").hidden));
  await page.goto(page.url().replace(/#.*$/, "") + "#prices");
  await page.waitForFunction(() => document.documentElement.dataset.screen, null, { timeout: 5000 });
  await wait(700);
  t.check("#prices で開いても二枚並び（席は買うもの）", await page.evaluate(() => document.documentElement.dataset.screen === "list"
    && document.getElementById("screen-prices").classList.contains("is-duo-r")));
  /* W3：並べた右の一枚（価格）も、左の買うものと同じ棚のカードと棚の名前。 */
  const shelf = await page.evaluate(() => {
    const L = document.querySelector("#screen-list .cat-group.is-run"), R = document.querySelector("#screen-prices .cat-group.is-run");
    const look = (e) => { if (!e) return null; const c = getComputedStyle(e); return [c.backgroundColor, c.borderTopWidth, c.borderTopColor, c.borderTopLeftRadius].join(" "); };
    return { l: look(L), r: look(R), head: !!(R && R.querySelector(".shelf-head .chip-dot")) };
  });
  t.check("並べた価格も棚のカードと棚の名前（W3）", !!shelf.r && shelf.r === shelf.l && shelf.head, JSON.stringify(shelf));
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
  await page.click("#screen-prices .product-wrap .product-name", { button: "right" });
  await wait(300);
  const priceMenu = await page.evaluate(() => [...document.querySelectorAll(".note-pop-item")].map((b) => b.textContent.trim()));
  t.check("右クリック（価格）：リストから外す・アーカイブ", JSON.stringify(priceMenu) === JSON.stringify(["リストから外す", "アーカイブ"]), JSON.stringify(priceMenu));
  await page.keyboard.press("Escape");
  await wait(300);

  /* 1280px より狭い desk は、これまでどおり紙をめくる。 */
  await page.setViewportSize({ width: 1100, height: 900 });
  await wait(500);
  t.check("1100px：価格は隠れ、買うものは全幅", await page.evaluate(() => document.getElementById("screen-prices").hidden
    && Math.round(document.getElementById("screen-list").getBoundingClientRect().right) === 1100));
  await page.click(".tab-list");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "prices", null, { timeout: 3000 }).catch(() => {});
  t.check("1100px：買うもの → 価格（席の二度押し）", await page.evaluate(() => document.documentElement.dataset.screen === "prices"));
  t.check("1100px：価格は棚のカードにしない（並べたときだけ）", await page.evaluate(() => !document.querySelector("#screen-prices .cat-group.is-run, #screen-prices .shelf-head")
    && document.querySelectorAll("#screen-prices .product-wrap").length === 3));
  t.check("1100px：窓の題は prices", (await page.title()) === "prices — くらしノート", await page.title());
  await page.setViewportSize({ width: 1440, height: 900 });
  await wait(700);
  t.check("価格を見たまま 1280px を越えたら、二枚並びへ", await page.evaluate(() => document.documentElement.dataset.screen === "list"
    && !document.getElementById("screen-prices").hidden && !document.querySelector(".is-face-parked")));

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
  t.check("列の下の口で開く", await page.evaluate(() => Math.round(document.getElementById("tabbar").getBoundingClientRect().width) === 232
    && !document.querySelector(".tab-list").title));

  /* ノート：左の木は左の列の中、席の行の下。 */
  await page.click(".tab-notes");
  await wait(800);
  const tree = await box(".notes-tree"), lastSeat = await box(".tab-diet"), notesScr = await box("#screen-notes");
  t.check("ノート：左の木は左の列の中（席の行の下）、ノートの画面は列の右から", tree && tree.l === 0 && tree.r <= 232 && tree.t >= lastSeat.b
    && tree.b < 900 && tree.b > 820 && notesScr.l === 232, JSON.stringify({ tree, lastSeat, notesScr }));

  /* 段7・P2：ホームは木｜本文の二列（真ん中の一覧は出さない）。本文の段は最近直したノートの札（題・頭の数行・日付）、
     ★・問い は木に（最近直したは札にあるので木には出さない）。 */
  const shown = (s) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && getComputedStyle(e).display !== "none"; }, s);
  const homeLook = () => page.evaluate(() => {
    const cards = [...document.querySelectorAll("#screen-notes .nt-card")];
    const r0 = cards[0] && cards[0].getBoundingClientRect(), r1 = cards[1] && cards[1].getBoundingClientRect();
    return {
      n: cards.length, l: r0 && Math.round(r0.left), side: !!(r0 && r1 && Math.abs(r0.top - r1.top) < 2 && r1.left > r0.right),
      parts: cards[0] ? ["title", "lead", "when"].map((k) => cards[0].querySelector(`.nt-card-${k}`).textContent.trim()) : [],
      tree: document.querySelectorAll('#screen-notes .notes-books[role="tree"], #screen-notes .nt-gates').length,
      mid: document.documentElement.classList.contains("notes-mid"),
      quick: [...document.querySelectorAll(".notes-tree .nt-quick")].map((e) => e.getAttribute("aria-label")),
    };
  });
  const home = await homeLook();
  t.check("二列のホーム：本文の段に最近直したの札が横に並ぶ（題・頭・日付）、木と同じものは出さない", home.n === 3 && home.side && home.l >= 232
    && home.parts[0] === "一つめ" && home.parts[1] === "試しの本文" && /^\d+:\d\d$/.test(home.parts[2]) && home.tree === 0 && !home.mid
    && await shown(".notes-tree .js-tree-asks") && !home.quick.includes("最近直した"), JSON.stringify(home));
  await page.click('#screen-notes .nt-card[data-id="n-desk0"]');
  await page.waitForSelector(".sheet.is-note.is-open");
  await wait(500);
  const pane0 = await box(".sheet.is-note.is-open"), fab0 = await box("#dock");
  const fabTop = await page.evaluate(() => { const r = document.getElementById("dock").getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && !!e.closest("#dock"); });
  t.check("二列のホーム：開いたノートは木のすぐ右から・＋は木の右下（隠れない）", pane0 && pane0.l === 232 && pane0.r === 1440 && fab0.r <= 232 && fabTop,
    JSON.stringify({ pane0, fab0, fabTop }));
  await page.keyboard.press("Control+k");
  await wait(500);
  t.check("さがすと真ん中の一覧が出る・左の列は残る", (await homeLook()).mid && await shown("#screen-notes .search-wrap") && await shown(".tab-archive")
    && Math.round((await box(".sheet.is-note.is-open")).l) >= 232 + 380);
  await page.evaluate(() => document.activeElement.blur());
  await wait(400);
  t.check("空のまま窓を離れると二列へ戻る", !(await homeLook()).mid && await shown("#screen-notes .nt-cards"));
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
  const secs = await page.evaluate(() => [...document.querySelectorAll("#screen-settings .set-layer.is-duo .set-sec > .set-head")]
    .map((h) => { const r = h.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top) }; }));
  t.check("設定：1280px〜は見出しごとに二段（二つ目の見出しは右の段の頭に揃う）", secs.length >= 2 && secs[1].l > secs[0].l + 300 && secs[1].t === secs[0].t,
    JSON.stringify(secs));
  await page.locator("#screen-settings .set-row", { hasText: "外観" }).first().click();
  await wait(60);
  const mid = await page.evaluate(() => { const L = [...document.querySelectorAll("#screen-settings .set-layer")].pop();
    return { l: Math.round(L.getBoundingClientRect().left), o: +getComputedStyle(L).opacity, n: document.querySelectorAll("#screen-settings .set-layer").length }; });
  t.check("設定：「›」は一面ぶん滑らせず、少しずらして薄く入れ替える", mid.n === 2 && mid.l >= 232 && mid.l <= 232 + 32 && mid.o < 1, JSON.stringify(mid));
  await wait(600);
  t.check("設定の外観に「一文字の近道」（指の細かい端末）", await page.locator("#screen-settings .set-layer:last-child .set-row", { hasText: "一文字の近道" }).count() === 1);
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
  t.check("列を畳むと（木が無い）ホームは木に戻る", homeF.n === 0 && homeF.tree > 0, JSON.stringify(homeF));
  await page.keyboard.press("Control+Backslash");
  await wait(400);

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
  t.check("マウスの左の列の行は 36px", (await rowH()) === 36, String(await rowH()));
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
      const t = [...document.querySelectorAll(".notes-tree, .notes-books")].find((e) => e.getClientRects().length);
      return { last: Math.round(last.bottom), tree: t ? Math.round(t.getBoundingClientRect().top) : null };
    });
    t.check("指の 1180px：ノートの木は席の行の下から（重ならない）", tree.tree != null && tree.tree >= tree.last, JSON.stringify(tree));
    t.check("指の 1180px：エラーなし", !c.errors.length, c.errors.join(" | "));
    await c.browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
