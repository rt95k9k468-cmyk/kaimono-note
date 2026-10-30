/* 見比べの画像を撮る（docs/log/design-review.md の柱G）。配らない——sw.js の ASSETS にも build-standalone.js にも載せない。

     NODE_PATH=/opt/node22/lib/node_modules node tools/shots.js [選び]

     --screens todo,list      画面（todo・list・archive・diet・notes・prices・settings）。todo:week・todo:month で面も
     --theme light,dark       明暗（既定 light）
     --size std,xl            字の大きさ（既定 std。xl＝特大）
     --clock 21:30            その時刻から時計を進めて開く（既定は今）
     --sheet todo             紙を開く：todo（カテゴリの付いた用事）・todo-new・product・log（daily の記録）・cal（小窓の暦）
     --scroll 400             送る器を下へ（px）
     --css 'B=.x{…}'          差し替えの style。名前=中身、または 名前=ファイル。何度でも。A（今のまま）はいつも撮る
     --empty                  試しの記録を入れない
     --view 1440x900          窓の大きさ（既定 393x852）。--dpr 1 で倍率（既定 2）
     --out <dir>              置き場（既定 /tmp/kn-shots）

   一枚ずつの画像のほかに、差し替えを横・組み合わせを縦に並べ、番号を書いた compare.png を作る（393×852・2倍）。
   試しの記録は無難な字だけ。日記の本文は入れない（CLAUDE.md）。 */
const fs = require("fs");
const path = require("path");
const { ensureServer, URL } = require("../tests/lib");

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1];
};
const all = (name) => process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]] : []));
const list = (name, def) => String(arg(name, def)).split(",").map((s) => s.trim()).filter(Boolean);

const OUT = path.resolve(arg("out", "/tmp/kn-shots"));
const SCREENS = list("screens", "todo");
const THEMES = list("theme", "light");
const SIZES = list("size", "std");
const CLOCK = arg("clock", null);
const SHEET = arg("sheet", null);
const SCROLL = +arg("scroll", 0);
const EMPTY = process.argv.includes("--empty");
const [VW, VH] = String(arg("view", "393x852")).split("x").map(Number);
const VIEW = { width: VW, height: VH };
const DPR = +arg("dpr", 2);
const VARIANTS = [{ name: "A", css: "" }, ...all("css").map((s) => {
  const i = s.indexOf("=");
  const name = s.slice(0, i), body = s.slice(i + 1);
  return { name, css: fs.existsSync(body) ? fs.readFileSync(body, "utf8") : body };
})];

/* 頁の中で走る。3週間ぶんの体重とお酒・二つの店の値段・時刻のある用事・daily の記録・ノート。 */
async function seed() {
  const S = KN.store, U = KN.util;
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return U.dayKey(d); };
  const [a, b] = ["スーパー", "ドラッグストア"].map((n) => S.addStore(n));
  [["牛乳", 198, 215], ["卵", 248, null], ["食パン", 158, null], ["洗剤", 398, 348]].forEach(([name, pa, pb]) => {
    const p = S.addProduct({ name });
    if (!p) return;
    S.addItem(p.id);
    S.addPrice(p.id, { storeId: a.id, price: pa, amount: 1, date: day(3) });
    if (pb != null) S.addPrice(p.id, { storeId: b.id, price: pb, amount: 1, date: day(1) });
  });
  for (let i = 20; i >= 0; i--) {
    S.addWeight({ day: day(i), time: "07:00", kg: 64 + Math.sin(i) * 0.6 - i * 0.03 });
    if (i % 3 === 0) S.addDrink({ day: day(i), time: "20:00", kind: "beer", ml: 350, abv: 5 });
  }
  S.setGoal({ targetKg: 62 });
  S.addTodo({ title: "病院の予約", due: day(0), time: "10:00", minutes: 30 });
  S.addTodo({ title: "資料をまとめる", due: day(0), time: "14:00", minutes: 60 });
  S.addTodo({ title: "買い物へ行く", due: day(0), time: "17:00", minutes: 30 });
  S.addTodo({ title: "電球を替える", due: day(-1) });
  S.addEntry({ date: day(0), type: "reading", title: "試しの本", at: "21:00", minutes: 30 });
  S.addEntry({ date: day(1), type: "done", title: "散歩" });
  const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
  await KN.notes.addMany(["献立の案", "旅行の持ち物", "読みたい本", "部屋の片づけ", "電話のメモ", "庭の手入れ", "来月の予定", "レシピ"]
    .map((title, i) => ({ id: `n-shot${i}`, title, body: "試しの本文", notebook: "private", tags: [], fav: false,
      createdAt: at(i * 20), updatedAt: at(i * 20), deletedAt: null })));
}

/* 頁の中で走る。紙を開く。 */
async function openSheet(which) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = KN.store;
  if (which === "todo" || which === "todo-new") {
    KN.app.showScreen("todo");
    await wait(400);
    const t = S.get().todos.find((x) => x.time) || null;
    KN.screens.todo.open(which === "todo" && t ? t.id : null);
  } else if (which === "product") {
    KN.productSheet.open(S.get().products[0].id);
  } else if (which === "log") {
    KN.app.showScreen("archive");
    await wait(400);
    document.querySelector('.screen.is-active button[aria-label="書く"], button[aria-label="書く"]').click();
  } else if (which === "cal") {
    const at = document.querySelector(".screen.is-active button") || document.body;
    KN.ui.popCalendar(at, { value: KN.util.todayKey(), onPick() {} });
  }
}

async function shoot(browser, v, combo) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: VIEW, deviceScaleFactor: DPR });
  /* tests/lib.js の open() と同じ前置き：控えのトースト・ノートブックの小窓・やることの面。 */
  await ctx.addInitScript((face) => {
    try {
      localStorage.setItem("kn-export-nudge", "9999-12-31");
      sessionStorage.setItem("kn-book-first", "off");
      sessionStorage.setItem("kn-todo-face", face === "today" ? "today" : "week");
    } catch (_) {}
  }, combo.face || "today");
  const page = await ctx.newPage();
  if (CLOCK) {
    const [h, m] = CLOCK.split(":").map(Number);
    const d = new Date(); d.setHours(h, m || 0, 0, 0);
    await page.clock.install({ time: d });
  }
  await page.goto(URL);
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  if (!EMPTY) await page.evaluate(seed);
  await page.evaluate(({ theme, size }) => {
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    KN.store.update((st) => { st.settings.textSize = size; });
    KN.app.applyTextSize(size);
  }, combo);
  if (v.css) await page.addStyleTag({ content: v.css });
  await page.evaluate((id) => KN.app.showScreen(id), combo.screen);
  await page.waitForTimeout(600);
  if (combo.face && combo.face !== "today") {
    const b = page.locator(`#screen-todo .wk-faces .seg-btn[data-face="${combo.face}"]`).first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(600); }
  }
  if (SCROLL) {
    await page.evaluate((y) => { const s = KN.app.scrollerOf(document.querySelector(".screen.is-active")); if (s) s.scrollTop = y; }, SCROLL);
    await page.waitForTimeout(400);
  }
  if (SHEET) { await page.evaluate(openSheet, SHEET); await page.waitForTimeout(900); }
  await page.waitForTimeout(1200); // 色の移り変わり・開く動きが終わるまで
  const file = path.join(OUT, `${v.name}-${combo.key}.png`);
  await page.screenshot({ path: file });
  await ctx.close();
  return file;
}

/* 並べた一枚：列＝差し替え、行＝組み合わせ。番号は左上から右へ数える。 */
async function compare(browser, rows) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  let n = 0;
  const cell = (f, label) => `<figure><figcaption><b>${++n}</b> ${label}</figcaption>`
    + `<img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"></figure>`;
  const body = rows.map((r) => `<div class="row">${r.files.map((f, i) => cell(f, `${VARIANTS[i].name}・${r.key}`)).join("")}</div>`).join("");
  await page.setContent(`<style>
    body { margin: 0; padding: 16px; background: #ddd; font: 600 28px system-ui, sans-serif; width: max-content; }
    .row { display: flex; gap: 16px; margin-bottom: 16px; }
    figure { margin: 0; }
    figcaption { margin: 0 0 8px; } b { display: inline-block; min-width: 1.4em; padding: 0 .3em; background: #111; color: #fff; text-align: center; border-radius: 6px; }
    img { display: block; width: ${VIEW.width * 2 / 2.5}px; border: 1px solid #999; }
  </style>${body}`);
  await page.waitForTimeout(200);
  const file = path.join(OUT, "compare.png");
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
  return file;
}

(async () => {
  await ensureServer();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await require("playwright").chromium.launch();
  const combos = [];
  for (const s of SCREENS) for (const theme of THEMES) for (const size of SIZES) {
    const [screen, face] = s.split(":");
    combos.push({ screen, face, theme, size, key: [s.replace(":", "-"), theme, size, SHEET, CLOCK && CLOCK.replace(":", "")].filter(Boolean).join("-") });
  }
  const rows = [];
  for (const c of combos) {
    const files = [];
    for (const v of VARIANTS) files.push(await shoot(browser, v, c));
    rows.push({ key: c.key, files });
  }
  const sheet = await compare(browser, rows);
  await browser.close();
  console.log(`${rows.length * VARIANTS.length} 枚 → ${OUT}\n並べた一枚 → ${sheet}`);
})().catch((e) => { console.error(e); process.exit(1); });
