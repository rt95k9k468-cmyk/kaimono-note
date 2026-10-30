/* パソコン・幅の広い画面（docs/desk.md）。ほかの台本はみな電話の幅で開くので、広い幅の崩れはここだけが見る。
   - 電話の幅：帯は下（変えていない）
   - 840px〜：帯は左の縦の列（幅 --rail-w）、席は縦に並び、印は縦に滑る。中身は帯の右から窓の右端まで
   - 読む幅：買うものの棚は 760px まで
   - 1200px〜：やることの今日は道が時間割の左、週の面は日の行が左・これからが右、からだのカードは二段以上に並ぶ
   - ノートの左の木は帯の右（840px でも出る）
   - 1280px〜：ノートの席で開いたノートは右の段（木と一覧の右・上の帯の下・窓の右端まで）。覆いは無く、
     一覧のほかのノートを押せば入れ替わる（開いているのは一枚）。＋は一覧の右下。ほかの席へ移ると閉じる
   - 書く紙（日記）は読む幅（760px）・窓のほぼいっぱいの背
   - 買うもの ⇄ 価格（席の二度押し）は広い幅でも行き来する
   - 広い幅から電話の幅へ縮めると、帯と印は下へ戻る
   - 段3（js/keys.js）：1〜5 で席・→ で次の日・t で今日・Shift+→ で次の週・, で設定・/ でさがす欄（欄で打つ字は席を動かさない）。
     トラックパッドの横払い（wheel の deltaX）は紙の上で日、暦の上で週を送る
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
  t.check("広い幅：帯は左の縦の列（幅 96px）、席は縦に並ぶ", bar.l === 0 && bar.w === 96 && bar.t < 40 && d1.l === d2.l && d2.t > d1.t,
    JSON.stringify({ bar, d1, d2 }));
  const app = await box("#app"), scr = await box("#screens");
  t.check("中身は帯の右から窓の右端まで", app.w === 1440 && scr.l === 96 && scr.r === 1440, JSON.stringify({ app, scr }));

  const lensAt = async (id) => {
    await page.click(`.tab-${id}`);
    await page.waitForFunction((i) => document.documentElement.dataset.screen === i, id);
    await wait(700);
    const l = await box(".tab-lens"), tab = await box(`.tab-${id}`);
    return Math.abs((l.t + l.b) / 2 - (tab.t + tab.b) / 2) <= 2 && l.l >= tab.l && l.r <= tab.r;
  };
  t.check("印は席から席へ縦に滑る（いつも押した席の上）", (await lensAt("list")) && (await lensAt("diet")) && (await lensAt("todo")));

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

  /* 買うもの：読む幅。価格へ行き来する。 */
  await page.click(".tab-list");
  await wait(700);
  const shelf = await box("#screen-list .cat-group");
  t.check("買うもの：棚は読む幅（760px）まで、真ん中に", shelf && shelf.w <= 760 && Math.abs((shelf.l + shelf.r) / 2 - (96 + 1440) / 2) <= 2,
    JSON.stringify(shelf));
  await page.click(".tab-list");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "prices", null, { timeout: 3000 }).catch(() => {});
  t.check("買うもの → 価格（席の二度押し）", await page.evaluate(() => document.documentElement.dataset.screen === "prices"));
  await page.click(".tab-list");
  await page.waitForFunction(() => document.documentElement.dataset.screen === "list", null, { timeout: 3000 }).catch(() => {});
  t.check("価格 → 買うもの", await page.evaluate(() => document.documentElement.dataset.screen === "list"));

  /* ノート：左の木は帯の右。 */
  await page.click(".tab-notes");
  await wait(800);
  const tree = await box(".notes-tree");
  t.check("ノート：左の木は帯の右", tree && tree.l === 96 && tree.w > 200, JSON.stringify(tree));

  /* 三列：開いたノートは右の段。 */
  const openRow = async (title) => {
    await page.evaluate((s) => {
      const r = [...document.querySelectorAll("#screen-notes .nt-row, #screen-notes .note-row .note-open")].find((e) => e.textContent.includes(s));
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

  t.check("エラーなし", !errors.length, errors.join(" | "));
  t.done();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
