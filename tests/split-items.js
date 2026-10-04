/* 一行に並べたものを、分けて入れる（docs/roadmap.md の R1）。

   前半は表：js/split-items.js を node で読み、分ける・分けない言葉を測る
   （when-parse と同じく、読むことだけを表で）。後半は画面：買うもの・やることの
   紙で分けて入り、トーストの「ひとつにする」で一つに戻ること。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/split-items.js */
const path = require("path");
const { open, checker } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "split-items.js"));
const S = global.KN.splitItems;

const t = checker("split-items");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* 下の ＋ を押して、紙の欄が出るまで待つ。 */
async function plus(page, label, field) {
  await page.evaluate((l) => document.querySelector(`button[aria-label="${l}"]`).click(), label);
  await page.waitForSelector(field);
  await page.waitForTimeout(300);
}

/* ---- 表：買うもの ---- */
const SHOP = [
  ["牛乳、卵、パン", [], ["牛乳", "卵", "パン"]],
  ["牛乳,卵，パン", [], ["牛乳", "卵", "パン"]],
  ["牛乳\n卵\nパン", [], ["牛乳", "卵", "パン"]],
  ["牛乳 、 卵", [], ["牛乳", "卵"]],
  ["牛乳、、卵、", [], ["牛乳", "卵"]],
  ["ハム・ソーセージ", [], ["ハム・ソーセージ"]],          // 「・」では分けない
  ["牛乳", [], ["牛乳"]],
  ["牛乳、", [], ["牛乳"]],                                 // 分けても一つなら元の字
  ["トイレットペーパー 1,000円まで", [], ["トイレットペーパー 1,000円まで"]], // 数字のカンマ
  ["水 2,000ml、お茶", [], ["水 2,000ml", "お茶"]],
  ["米 5，000円、塩", [], ["米 5，000円", "塩"]],           // 全角のカンマも元の字のまま
  ["ハム、ソーセージ", ["ハム、ソーセージ"], ["ハム、ソーセージ"]],   // 登録済みの名前
  ["牛乳、ハム、ソーセージ、卵", ["ハム、ソーセージ"], ["牛乳", "ハム、ソーセージ", "卵"]],
  ["牛乳、ハム,ソーセージ", ["ハム,ソーセージ"], ["牛乳", "ハム,ソーセージ"]],
  ["ハム、ソーセージ", ["ハム"], ["ハム", "ソーセージ"]],   // 部分だけ登録なら分ける
  ["", [], []],
];
SHOP.forEach(([text, known, want]) => {
  const got = S.shop(text, known);
  t.check(`買うもの「${text.replace(/\n/g, "⏎")}」→ ${want.join(" | ") || "（なし）"}`, same(got, want), got.join(" | "));
});

/* ---- 表：やること（改行だけ） ---- */
const TODO = [
  ["銀行、郵便局に寄る", ["銀行、郵便局に寄る"]],
  ["牛乳を買う\n銀行\n10:00 病院", ["牛乳を買う", "銀行", "10:00 病院"]],
  ["牛乳を買う\r\n\r\n銀行", ["牛乳を買う", "銀行"]],
  ["ハム・ソーセージを買う", ["ハム・ソーセージを買う"]],
  ["一件だけ\n", ["一件だけ"]],
];
TODO.forEach(([text, want]) => {
  const got = S.todo(text);
  t.check(`やること「${text.replace(/\r?\n/g, "⏎")}」→ ${want.join(" | ")}`, same(got, want), got.join(" | "));
});

(async () => {
  const { browser, page, errors } = await open();

  /* ---- 画面：買うもの ---- */
  await page.evaluate(() => {
    KN.store.update((s) => { s.items = []; s.products = []; });
    KN.store.addProduct({ name: "ハム、ソーセージ" });
    KN.app.showScreen("list");
  });
  await page.waitForTimeout(300);
  await plus(page, "買うものを追加", ".js-name");
  await page.fill(".js-name", "牛乳、ハム、ソーセージ、卵");
  const label = await page.textContent(".js-add");
  t.check("ボタンが先に「3つに分けて追加」と言う", label.trim() === "3つに分けて追加", label);
  await page.click(".js-add");
  await page.waitForTimeout(400);
  const shop1 = await page.evaluate(() => {
    const s = KN.store.get();
    const name = (i) => (s.products.find((p) => p.id === i.productId) || {}).name;
    return { names: s.items.map(name).sort(), toast: (document.querySelector(".toast") || {}).textContent || "" };
  });
  t.check("三つに分かれて入る（登録済みの「ハム、ソーセージ」は分けない）",
    same(shop1.names, ["ハム、ソーセージ", "卵", "牛乳"].sort()), shop1.names.join(" | "));
  t.check("トーストが「3つに分けて入れました」と「ひとつにする」", /3つに分けて入れました/.test(shop1.toast) && /ひとつにする/.test(shop1.toast), shop1.toast);
  await page.click(".toast-action");
  await page.waitForTimeout(300);
  const shop2 = await page.evaluate(() => {
    const s = KN.store.get();
    const name = (i) => (s.products.find((p) => p.id === i.productId) || {}).name;
    return { names: s.items.map(name), prods: s.products.map((p) => p.name).sort() };
  });
  t.check("「ひとつにする」で打ったとおりの一件に", same(shop2.names, ["牛乳、ハム、ソーセージ、卵"]), shop2.names.join(" | "));
  t.check("分けたときに作った品物は片づく（前からある品物は残る）",
    same(shop2.prods, ["ハム、ソーセージ", "牛乳、ハム、ソーセージ、卵"].sort()), shop2.prods.join(" | "));

  /* 貼りつけた改行は読点になる（一行の欄は改行を持てない） */
  await page.evaluate(() => KN.store.update((s) => { s.items = []; }));
  await page.waitForTimeout(200);
  await plus(page, "買うものを追加", ".js-name");
  const pasted = await page.evaluate(() => {
    const el = document.querySelector(".js-name");
    el.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", "にんじん\nたまねぎ\n");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    return { value: el.value, label: document.querySelector(".js-add").textContent.trim() };
  });
  t.check("貼りつけた改行は「、」になって見える", pasted.value === "にんじん、たまねぎ", pasted.value);
  t.check("貼りつけたあともボタンが「2つに分けて追加」", pasted.label === "2つに分けて追加", pasted.label);
  await page.click(".js-add");
  await page.waitForTimeout(300);

  /* ---- 画面：やること ---- */
  await page.evaluate(() => {
    KN.store.update((s) => { s.todos = []; });
    KN.app.showScreen("todo");
  });
  await page.waitForTimeout(300);
  const today = await page.evaluate(() => KN.util.todayKey());
  await plus(page, "やることを追加", ".js-title");
  const tag = await page.evaluate(() => document.querySelector(".js-title").tagName);
  t.check("題の欄は一行の textarea（貼りつけた改行を持てる）", tag === "TEXTAREA", tag);
  await page.evaluate(() => {
    const el = document.querySelector(".js-title");
    el.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", "銀行、郵便局に寄る\n10:00 病院\n牛乳を買う");
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    if (el.dispatchEvent(ev)) {
      // 既定の貼りつけ（本物の貼りつけと同じ結果）
      el.setRangeText(dt.getData("text/plain"), el.selectionStart, el.selectionEnd, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const tl = await page.evaluate(() => ({
    value: document.querySelector(".js-title").value,
    rows: document.querySelector(".js-title").rows,
    label: document.querySelector(".js-save").textContent.trim(),
  }));
  t.check("新しい紙では改行が残る", tl.value.split("\n").length === 3, JSON.stringify(tl.value));
  t.check("欄が行の数だけ伸びる", tl.rows === 3, String(tl.rows));
  t.check("ボタンが「3件に分けて追加」", tl.label === "3件に分けて追加", tl.label);
  await page.click(".js-save");
  await page.waitForTimeout(400);
  const td1 = await page.evaluate(() => ({
    todos: KN.store.get().todos.map((x) => ({ title: x.title, due: x.due, time: x.time })),
    toast: (document.querySelector(".toast") || {}).textContent || "",
  }));
  const byTitle = Object.fromEntries(td1.todos.map((x) => [x.title, x]));
  t.check("改行だけで三件（読点では分けない）",
    td1.todos.length === 3 && !!byTitle["銀行、郵便局に寄る"] && !!byTitle["牛乳を買う"], td1.todos.map((x) => x.title).join(" | "));
  t.check("行ごとに「いつ」を読む（10:00 病院 → 病院・10:00）",
    !!byTitle["病院"] && byTitle["病院"].time === "10:00" && byTitle["病院"].due === today, JSON.stringify(byTitle["病院"]));
  t.check("トーストが「3件に分けて入れました」と「ひとつにする」", /3件に分けて入れました/.test(td1.toast) && /ひとつにする/.test(td1.toast), td1.toast);
  await page.click(".toast-action");
  await page.waitForTimeout(300);
  const td2 = await page.evaluate(() => KN.store.get().todos.map((x) => x.title));
  t.check("「ひとつにする」で打ったとおりの一件に（行は「、」でつなぐ）",
    same(td2, ["銀行、郵便局に寄る、10:00 病院、牛乳を買う"]), td2.join(" | "));

  /* 一行だけなら、これまでどおり（when-parse も効く） */
  await plus(page, "やることを追加", ".js-title");
  await page.fill(".js-title", "15:00 歯医者");
  const one = await page.evaluate(() => document.querySelector(".js-save").textContent.trim());
  t.check("一行のときのボタンは「追加」", one === "追加", one);
  await page.click(".js-save");
  await page.waitForTimeout(300);
  const td3 = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "歯医者"));
  t.check("一行は when-parse どおり一件（歯医者・15:00）", !!td3 && td3.time === "15:00", JSON.stringify(td3));

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
