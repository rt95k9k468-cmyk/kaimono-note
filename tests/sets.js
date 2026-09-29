/* いつもの組（docs/roadmap.md の R11）。

   前半は store：鍵の無い保存で sets が空（移行なし）・形の崩れた組は落ちる・
   保存・同じ名前は置き換え・入れるのはリストに無いものだけ・消えた品物は数えない・
   書き出し（exportJSON）に乗る。後半は画面：買うもののリストから「いつもの組に
   して残す」→ 名前と品物 → 組になる／＋で名前を打つと「組：カレー（N品）」→ 押すと
   無いものだけ入る・紙が閉じる・「戻す」／全部あれば一言／消す・戻す。絵文字なし。 */
const { open, checker } = require("./lib");

const t = checker("sets");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
  const { browser, page, errors } = await open();

  /* ---- 鍵の無い保存は空（reconcile。移行なし） ---- */
  const noKey = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(KN.store.KEY) || "{}");
    delete raw.sets;
    raw.lsSeq = 1e9;
    localStorage.setItem(KN.store.KEY, JSON.stringify(raw));
    return true;
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const empty = await page.evaluate(() => KN.store.get().sets);
  t.check("鍵の無い保存で sets は空の配列", noKey && Array.isArray(empty) && empty.length === 0, JSON.stringify(empty));

  /* ---- 崩れた組は読み込みで落ちる ---- */
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(KN.store.KEY));
    raw.sets = [
      { id: "g1", name: " 鍋 ", productIds: ["p1", "p1", 3, ""] },
      { id: "g2", name: "" },
      null,
      { name: "idなし", productIds: [] },
    ];
    raw.lsSeq = 1e9 + 1;
    localStorage.setItem(KN.store.KEY, JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const cleaned = await page.evaluate(() => KN.store.get().sets);
  t.check("崩れた組は落ち、名前は整え、品物の id は重ねない",
    cleaned.length === 1 && cleaned[0].name === "鍋" && same(cleaned[0].productIds, ["p1"]),
    JSON.stringify(cleaned));

  /* ---- store ---- */
  const st = await page.evaluate(() => {
    const S = KN.store;
    S.update((s) => { s.items = []; s.products = []; s.sets = []; });
    const names = ["にんじん", "玉ねぎ", "じゃがいも", "カレールウ", "豚肉"];
    const ps = names.map((n) => S.addProduct({ name: n }));
    S.addItem(ps[1].id);                       // 玉ねぎはもうリストに
    const r = S.saveSet("カレー", ps.map((p) => p.id));
    const found = S.findSetByName("かれー");
    const missing = S.setMissing(found).map((p) => p.name);
    const added = S.addSet(found.id);
    const items1 = S.get().items.length;
    const again = S.addSet(found.id);          // 二度目は何も足さない
    const r2 = S.saveSet("カレー", [ps[0].id, ps[3].id]);
    const afterReplace = S.get().sets.length;
    const replacedCount = S.setProducts(S.findSetByName("カレー")).length;
    r2.undo();
    const undone = S.setProducts(S.findSetByName("カレー")).length;
    // 消えた品物は数えない
    S.update((s) => { s.products = s.products.filter((p) => p.name !== "豚肉"); });
    const afterDrop = S.setProducts(S.findSetByName("カレー")).length;
    const json = JSON.parse(S.exportJSON());
    return { replaced: r.replaced, found: !!found, missing, added: added.length, items1,
      again: again.length, afterReplace, replacedCount, r2: r2.replaced, undone, afterDrop,
      exported: Array.isArray(json.sets) ? json.sets.length : (json.data && json.data.sets ? json.data.sets.length : -1) };
  });
  t.check("新しい組を保存", st.replaced === false && st.found);
  t.check("かなの違いでも名前で見つかる", st.found);
  t.check("リストに無いものだけが候補（玉ねぎは入れない）",
    same(st.missing, ["にんじん", "じゃがいも", "カレールウ", "豚肉"]), st.missing.join(" | "));
  t.check("入れると4品・リストは5行", st.added === 4 && st.items1 === 5, `${st.added} / ${st.items1}`);
  t.check("二度目は何も足さない（二重にしない）", st.again === 0, String(st.again));
  t.check("同じ名前は置き換え（組は一つのまま）", st.r2 && st.afterReplace === 1 && st.replacedCount === 2,
    `${st.afterReplace} / ${st.replacedCount}`);
  t.check("置き換えを戻すと元の5品", st.undone === 5, String(st.undone));
  t.check("消えた品物は数えない", st.afterDrop === 4, String(st.afterDrop));
  t.check("書き出しに組が乗る", st.exported === 1, String(st.exported));

  /* ---- 画面：リストから組にして残す ---- */
  await page.evaluate(() => {
    const S = KN.store;
    S.update((s) => { s.items = []; s.products = []; s.sets = []; });
    ["牛肉", "しらたき", "焼き豆腐"].forEach((n) => S.addItem(S.addProduct({ name: n }).id));
    KN.app.showScreen("list");
  });
  await page.waitForTimeout(400);
  const btn = await page.evaluate(() => {
    const b = document.querySelector("#screen-list .js-set-save");
    return b ? b.textContent.trim() : "";
  });
  t.check("リストの終わりに「いつもの組にして残す」", btn === "いつもの組にして残す", btn);
  await page.evaluate(() => document.querySelector("#screen-list .js-set-save").click());
  await page.waitForSelector(".js-set-name");
  await page.waitForTimeout(300);
  const sheet1 = await page.evaluate(() => ({
    chips: [...document.querySelectorAll(".js-set-items .chip")].map((c) => c.textContent.trim()),
    on: document.querySelectorAll(".js-set-items .chip.is-on").length,
    disabled: document.querySelector(".js-set-ok").disabled,
    listHidden: document.querySelector(".js-set-list-wrap").hidden,
  }));
  t.check("紙にリストの品物がすべて選ばれて並ぶ", sheet1.chips.length === 3 && sheet1.on === 3, sheet1.chips.join(" | "));
  t.check("名前が無いうちは押せない", sheet1.disabled);
  t.check("組がまだ無ければ「いまある組」は出ない", sheet1.listHidden);
  await page.evaluate(() => [...document.querySelectorAll(".js-set-items .chip")]
    .find((c) => c.textContent.trim() === "焼き豆腐").click());  // 焼き豆腐を外す
  await page.fill(".js-set-name", "すき焼き");
  const okLabel = await page.textContent(".js-set-ok");
  t.check("ボタンが「組にする（2品）」", okLabel.trim() === "組にする（2品）", okLabel);
  await page.click(".js-set-ok");
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => {
    const g = KN.store.findSetByName("すき焼き");
    return { names: g ? KN.store.setProducts(g).map((p) => p.name) : [],
      toast: (document.querySelector(".toast") || {}).textContent || "",
      sheet: !!document.querySelector(".js-set-name") };
  });
  t.check("選んだ品物だけで組になる", same(saved.names.slice().sort(), ["牛肉", "しらたき"].sort()), saved.names.join(" | "));
  t.check("紙が閉じ、トーストに「組にしました」", !saved.sheet && /組にしました/.test(saved.toast), saved.toast);

  /* ---- 画面：＋で組の名前 → 札 → 無いものだけ入る ---- */
  await page.evaluate(() => KN.store.update((s) => {
    const beef = s.products.find((p) => p.name === "牛肉");
    s.items = s.items.filter((i) => i.productId === beef.id);   // 牛肉だけ残す
  }));
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('button[aria-label="買うものを追加"]').click());
  await page.waitForSelector(".js-name");
  await page.waitForTimeout(300);
  await page.fill(".js-name", "スキ焼き");   // かなの違いは畳む
  const chip = await page.evaluate(() => {
    const c = document.querySelector(".js-set");
    return { hidden: c.hidden, text: c.textContent.trim() };
  });
  t.check("組の名前で札「組：すき焼き（2品）」", !chip.hidden && chip.text === "組：すき焼き（2品）", JSON.stringify(chip));
  await page.fill(".js-name", "すき");
  const chipGone = await page.evaluate(() => document.querySelector(".js-set").hidden);
  t.check("名前が合わなければ札は出ない", chipGone);
  await page.fill(".js-name", "すき焼き");
  await page.click(".js-set");
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const s = KN.store.get();
    const name = (i) => (s.products.find((p) => p.id === i.productId) || {}).name;
    return { names: s.items.filter((i) => !i.checked).map(name).sort(),
      toast: (document.querySelector(".toast") || {}).textContent || "",
      sheet: !!document.querySelector(".js-name") };
  });
  t.check("無いもの（しらたき）だけ入り、牛肉は二重にならない",
    same(after.names, ["しらたき", "牛肉"].sort()), after.names.join(" | "));
  t.check("紙が閉じ、トーストが「1品を入れました」と「戻す」",
    !after.sheet && /1品を入れました/.test(after.toast) && /戻す/.test(after.toast), after.toast);
  await page.click(".toast-action");
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => KN.store.get().items.length);
  t.check("「戻す」で入れた行だけ片づく", back === 1, String(back));

  /* 全部あるとき */
  await page.evaluate(() => KN.store.addSet(KN.store.findSetByName("すき焼き").id));
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('button[aria-label="買うものを追加"]').click());
  await page.waitForSelector(".js-name");
  await page.waitForTimeout(300);
  await page.fill(".js-name", "すき焼き");
  await page.click(".js-set");
  await page.waitForTimeout(300);
  const all = await page.evaluate(() => ({ n: KN.store.get().items.length,
    toast: (document.querySelector(".toast") || {}).textContent || "" }));
  t.check("全部あれば何も足さず一言", all.n === 2 && /もう全部リストにあります/.test(all.toast), all.toast);

  /* ---- 消す・戻す（組の紙の「いまある組」） ---- */
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector("#screen-list .js-set-save").click());
  await page.waitForSelector(".js-set-list .set-row");
  await page.waitForTimeout(300);
  const listed = await page.evaluate(() => [...document.querySelectorAll(".js-set-list .set-row")]
    .map((r) => r.textContent.replace(/\s+/g, "")));
  t.check("「いまある組」に名前と品数", same(listed, ["すき焼き2品"]), listed.join(" | "));
  const emojiFree = await page.evaluate((src) => {
    const re = new RegExp(src, "u");
    return !re.test(document.querySelector(".sheet").textContent);
  }, EMOJI.source);
  t.check("組の紙に絵文字が無い", emojiFree);
  await page.evaluate(() => document.querySelector(".js-set-del").click());
  await page.waitForTimeout(300);
  const del = await page.evaluate(() => ({ n: KN.store.get().sets.length,
    hidden: document.querySelector(".js-set-list-wrap").hidden }));
  t.check("消すと組が無くなり、欄も消える", del.n === 0 && del.hidden, JSON.stringify(del));
  await page.click(".toast-action");
  await page.waitForTimeout(300);
  const undel = await page.evaluate(() => ({ n: KN.store.get().sets.length,
    rows: document.querySelectorAll(".js-set-list .set-row").length }));
  t.check("「戻す」で組が戻り、紙の一覧も戻る", undel.n === 1 && undel.rows === 1, JSON.stringify(undel));

  /* 読み直しても残る */
  await page.evaluate(() => KN.store.flush());
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => KN.store.get().sets.map((g) => g.name));
  t.check("読み直しても組は残る", same(kept, ["すき焼き"]), kept.join(" | "));

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
