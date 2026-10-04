/* どの＋からでも、行き先を言い直せる（R4）・Siri の受け箱を「なんでも」に（R5）・
   daily の＋は記録の紙から（2026年9月28日）。

   前半は表：言葉と行き先（js/capture.js の guess。絵の辞書を使うので画面の中で
   測る。icon-eval.json と同じく、外れてほしい言葉＝null の列が本体）と、声の
   「と」切り（voiceSplit）。後半は画面：買うものの＋で「明日 19:00 歯医者」に札が
   出て、押すとやることへ・やることの＋で「牛乳」に札が出て買うものへ・用事の形には
   出さない・覚えた言葉・reconcile（鍵の無い保存）・受け箱の @ 印・daily の＋。

   中継所には繋がない（relay.invalid を page.route で受ける）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/capture.js */
const path = require("path");
const { open, checker } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "capture.js"));
const C = global.KN.capture;

const t = checker("capture");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- 表：声の「と」（純粋） ---- */
const ITEMS = new Set(["牛乳", "卵", "洗剤", "とうもろこし", "さといも", "トマト", "パン"]);
const isItem = (n) => ITEMS.has(n);
[
  ["牛乳と卵と洗剤", ["牛乳", "卵", "洗剤"]],
  ["とうもろこし", ["とうもろこし"]],
  ["さといもと卵", ["さといも", "卵"]],
  ["とうもろこしとパン", ["とうもろこし", "パン"]],
  ["トマト", ["トマト"]],
  ["田中さんと電話", ["田中さんと電話"]],   // 片が品物でない → 切らない
  ["牛乳と田中", ["牛乳と田中"]],
].forEach(([s, want]) => {
  const got = C.voiceSplit(s, isItem);
  t.check(`と切り「${s}」`, same(got, want), JSON.stringify(got));
});

const FAKE = "https://relay.invalid/kn-testonlypath0000";
const SEP = "\u001E";

(async () => {
  const { browser, page, errors } = await open();

  /* ---- 表：行き先（画面の中の本物の辞書で） ---- */
  const TABLE = [
    // 日付・時刻・くり返し・期限 → やること
    ["明日 19:00 歯医者", "todo"],
    ["10:00 病院", "todo"],
    ["毎週月曜 ゴミ出し", "todo"],
    ["9/15まで 書類", "todo"],
    ["明日 牛乳", "todo"],
    // 買う → 買うもの
    ["牛乳", "list"],
    ["卵", "list"],
    ["食器用洗剤", "list"],
    ["トイレットペーパー", "list"],
    ["電池を買う", "list"],
    ["卵も買っておく", "list"],
    ["ぶどう", "list"],
    // 用事の形・知らない字 → 出さない
    ["電球を替える", null],
    ["洗濯物を干す", null],
    ["部屋を掃除する", null],
    ["田中さんに電話", null],
    ["振込", null],
    ["病院", null],
    ["ゴミ出し", null],
    ["洗濯", null],
    ["郵便局", null],
    ["駅で待ち合わせ", null],
    ["洗濯洗剤", "list"],
    ["にんじん", "list"],
    ["電池", "list"],
    ["猫砂", "list"],
    ["明日", null],          // 題が空になるものは読まない（when-parse）
    ["", null],
  ];
  const got = await page.evaluate((rows) => rows.map(([s]) => {
    const g = KN.capture.guess(s, KN.capture.ctx());
    return g ? g.dest : null;
  }), TABLE);
  let hit = 0;
  TABLE.forEach(([s, want], i) => {
    if (got[i] === want) hit++;
    else t.check(`行き先「${s}」`, false, `want ${want} got ${got[i]}`);
  });
  t.check(`行き先の表 ${hit}/${TABLE.length}`, hit === TABLE.length);

  const buy = await page.evaluate(() => KN.capture.guess("電池を買う", KN.capture.ctx()).title);
  t.check("「電池を買う」の名前は「電池」", buy === "電池", buy);

  /* ---- 画面：買うものの＋ → やること ---- */
  const plus = async (label, field) => {
    await page.evaluate((l) => document.querySelector(`button[aria-label="${l}"]`).click(), label);
    await page.waitForSelector(field);
    await page.waitForTimeout(300);
  };
  const tab = async (id) => {
    await page.evaluate((x) => KN.app.showScreen(x), id);
    await page.waitForTimeout(400);
  };
  await tab("list");
  await plus("買うものを追加", ".sheet .js-name");
  await page.fill(".sheet .js-name", "牛乳");
  const chipList0 = await page.evaluate(() => document.querySelector(".sheet .js-dest").hidden);
  t.check("買うもので「牛乳」には札が出ない", chipList0 === true);
  await page.fill(".sheet .js-name", "明日 19:00 歯医者");
  await page.waitForTimeout(100);
  const chip = await page.evaluate(() => {
    const c = document.querySelector(".sheet .js-dest");
    return { hidden: c.hidden, text: c.textContent };
  });
  t.check("買うもので「明日 19:00 歯医者」に札", !chip.hidden && /やること/.test(chip.text) && /19:00/.test(chip.text), JSON.stringify(chip));
  await page.click(".sheet .js-dest");
  await page.waitForTimeout(500);
  const todo = await page.evaluate(() => {
    const tomorrow = KN.util.dayKey(new Date(Date.now() + 86400000));
    const r = KN.store.get().todos.find((x) => x.title === "歯医者");
    return r ? { due: r.due === tomorrow, time: r.time } : null;
  });
  t.check("押すとやることへ（明日 19:00）", todo && todo.due && todo.time === "19:00", JSON.stringify(todo));
  const items0 = await page.evaluate(() => KN.store.get().items.length);
  t.check("買うものには入らない", items0 === 0, String(items0));
  const learned = await page.evaluate(() => KN.store.get().settings.captureDest);
  t.check("押した言葉を覚える", learned && Object.values(learned).includes("todo"), JSON.stringify(learned));
  t.check("紙は閉じた", !(await page.evaluate(() => !!document.querySelector(".sheet .js-name"))));

  /* ---- 画面：やることの＋ → 買うもの ---- */
  await tab("todo");
  const addTodo = await page.evaluate(() => {
    const b = document.querySelector("#dock .add-fab");
    return b ? b.getAttribute("aria-label") : "";
  });
  await plus(addTodo, ".sheet .js-title");
  await page.fill(".sheet .js-title", "電球を替える");
  await page.waitForTimeout(100);
  t.check("やることで「電球を替える」には札が出ない",
    await page.evaluate(() => document.querySelector(".sheet .js-dest").hidden));
  await page.fill(".sheet .js-title", "牛乳");
  await page.waitForTimeout(100);
  const chip2 = await page.evaluate(() => {
    const c = document.querySelector(".sheet .js-dest");
    return { hidden: c.hidden, text: c.textContent };
  });
  t.check("やることで「牛乳」に札「→ 買うもの」", !chip2.hidden && /買うもの/.test(chip2.text), JSON.stringify(chip2));
  await page.click(".sheet .js-dest");
  await page.waitForTimeout(500);
  const shop = await page.evaluate(() => {
    const s = KN.store.get();
    return s.items.map((i) => (s.products.find((p) => p.id === i.productId) || {}).name);
  });
  t.check("押すと買うものへ", same(shop, ["牛乳"]), JSON.stringify(shop));
  t.check("やることには入らない",
    !(await page.evaluate(() => KN.store.get().todos.some((x) => x.title === "牛乳"))));
  // 戻す：トーストの押し口
  await page.evaluate(() => {
    const b = [...document.querySelectorAll(".toast button")].find((x) => /戻す/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(200);
  t.check("「戻す」で買うものから片づく（作った品物も）",
    await page.evaluate(() => KN.store.get().items.length === 0 && !KN.store.findProductByName("牛乳")));

  /* 同じ行き先の字には札を出さない */
  await plus(addTodo, ".sheet .js-title");
  await page.fill(".sheet .js-title", "10:00 病院");
  await page.waitForTimeout(100);
  t.check("やることで「10:00 病院」には札が出ない",
    await page.evaluate(() => document.querySelector(".sheet .js-dest").hidden));
  await page.evaluate(() => { const b = document.querySelector(".sheet .js-close"); if (b) b.click(); });
  await page.waitForTimeout(400);

  /* ---- 覚え：鍵の無い保存でも空の表から（reconcile） ---- */
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("kaimono-note-v2"));
    delete raw.settings.captureDest;
    localStorage.setItem("kaimono-note-v2", JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  t.check("鍵の無い保存は空の表（reconcile）",
    same(await page.evaluate(() => KN.store.get().settings.captureDest), {}));
  await page.evaluate(() => KN.capture.learn("ナンプラー", "list"));
  t.check("覚えた言葉は、その行き先",
    await page.evaluate(() => KN.capture.guess("ナンプラー", KN.capture.ctx()).dest === "list"));

  /* ---- 受け箱：@ 印は行き先を推す・印なしは買うもの・「と」 ---- */
  let box = [];
  let ver = 1;
  await page.route("https://relay.invalid/**", (route) => {
    const u = new URL(route.request().url());
    const head = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "X-Kn-Ver, X-Kn-Parts, X-Kn-Inbox",
      "X-Kn-Ver": String(ver), "X-Kn-Inbox": "1",
    };
    if (u.searchParams.get("since") === String(ver)) return route.fulfill({ status: 204, headers: head, body: "" });
    const parts = ["steps=1"];
    if (box.length) parts.push(["kn-inbox"].concat(box.map((b) => JSON.stringify(b))).join("\n"));
    return route.fulfill({ status: 200, headers: head, body: parts.join(SEP) });
  });
  box = [
    { at: 2000, text: "@明日10時 歯医者の予約" },
    { at: 2001, text: "@卵を買う" },
    { at: 2002, text: "牛乳と洗剤" },
    { at: 2003, text: "とうもろこし" },
    { at: 2004, text: "@田中さんに電話" },
  ];
  ver = 2004;
  await page.evaluate((u) => KN.healthRelay.setUrl(u), FAKE);
  await page.waitForFunction(() => Number(KN.store.get().settings.relayInboxAt) === 2004, null, { timeout: 5000 })
    .catch(() => {});
  const after = await page.evaluate(() => {
    const s = KN.store.get();
    return {
      items: s.items.filter((i) => !i.checked).map((i) => (s.products.find((p) => p.id === i.productId) || {}).name),
      todos: s.todos.map((x) => ({ title: x.title, time: x.time, due: x.due })),
      today: KN.util.todayKey(),
    };
  });
  const names = after.items;
  t.check("印なし「牛乳と洗剤」は二つ、「とうもろこし」は一つ",
    ["牛乳", "洗剤", "とうもろこし"].every((n) => names.includes(n)) && !names.includes("牛乳と洗剤"), JSON.stringify(names));
  t.check("@「卵を買う」は買うものの「卵」", names.includes("卵"), JSON.stringify(names));
  const yoyaku = after.todos.find((x) => /歯医者/.test(x.title));
  t.check("@「明日10時 歯医者の予約」はやること 10:00", yoyaku && yoyaku.time === "10:00", JSON.stringify(after.todos));
  const tel = after.todos.find((x) => /田中/.test(x.title));
  t.check("@ で推せない字は、今日のやること", tel && tel.due === after.today, JSON.stringify(after.todos));

  /* ---- daily の＋：記録の紙から、日記の札は先頭で一回り大きい ---- */
  await tab("archive");
  await page.evaluate(() => document.querySelector('#dock button[aria-label="書く"]').click());
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => {
    const menu = !!document.querySelector(".fab-menu");
    const sheet = document.querySelector(".sheet");
    const title = sheet ? sheet.textContent : "";
    const pick = document.querySelector(".sheet .js-pick");
    const first = pick && pick.firstElementChild;
    const other = pick && pick.querySelector(".arc-pick-b");
    const on = pick && pick.querySelector(".arc-pick-b.is-on");
    return {
      menu, rec: /記録を書く/.test(title),
      first: first ? first.className : "",
      bigger: first && other ? first.getBoundingClientRect().height > other.getBoundingClientRect().height : false,
      on: on ? on.dataset.t : "",
    };
  });
  t.check("＋で二択は出ない", !d.menu);
  t.check("＋で記録の紙が開く", d.rec);
  t.check("日記の札が先頭", /arc-pick-diary/.test(d.first), d.first);
  t.check("日記の札はほかより大きい", d.bigger);
  t.check("種類は読書から", d.on === "reading", d.on);
  await page.click(".sheet .js-to-diary");
  await page.waitForTimeout(700);
  const log = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet")].pop();
    return { n: document.querySelectorAll(".sheet").length, text: s ? s.textContent : "",
      entries: KN.store.get().archive.entries.length };
  });
  t.check("日記の札で日記の紙へ（記録の紙は閉じる）", log.n === 1 && !/記録を書く/.test(log.text), JSON.stringify({ n: log.n }));
  t.check("記録は勝手に増えない", log.entries === 0, String(log.entries));

  t.check("ページのエラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
