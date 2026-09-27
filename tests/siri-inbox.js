/* Siri から買うものへ（D2）。中継所の受け箱（?slot=add）から届いた名前が
   買うものに入る・二度足さない（読み直しても）・もう載っているものは足さない・
   済ませたあとでまた頼まれたら足す・健康データの便と混ぜない。

   中継所には繋がない（本物の中継所URLは資格情報で、GET も打たない）。
   `https://relay.invalid/…` を page.route で受けて、中継所のふりをする。 */
const { open, checker } = require("./lib");

const FAKE = "https://relay.invalid/kn-testonlypath0000";
const SEP = "\u001E";

(async () => {
  const t = checker("siri-inbox");
  const { browser, page, errors } = await open();

  /* 中継所のふり。box は受け箱の中身、ver はそのとき返す版。 */
  let box = [];
  let health = "steps=4321";
  let ver = 1;
  let gets = 0;
  await page.route("https://relay.invalid/**", (route) => {
    gets++;
    const u = new URL(route.request().url());
    const head = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "X-Kn-Ver, X-Kn-Parts, X-Kn-Inbox",
      "X-Kn-Ver": String(ver), "X-Kn-Inbox": "1",
    };
    if (u.searchParams.get("since") === String(ver)) {
      return route.fulfill({ status: 204, headers: head, body: "" });
    }
    const parts = [health];
    if (box.length) parts.push(["kn-inbox"].concat(box.map((b) => JSON.stringify(b))).join("\n"));
    return route.fulfill({ status: 200, headers: head, body: parts.join(SEP) });
  });

  const names = () => page.evaluate(() => {
    const s = KN.store.get();
    return s.items.filter((i) => !i.checked)
      .map((i) => (s.products.find((p) => p.id === i.productId) || {}).name);
  });
  const pull = () => page.evaluate(() => KN.healthRelay.pullNow({ force: true }));

  // 言い方から名前を取り出す
  const parsed = await page.evaluate(() => [
    KN.healthRelay.itemNames("牛乳を追加"),
    KN.healthRelay.itemNames("卵、パンも買って"),
    KN.healthRelay.itemNames("とうもろこし"),
    KN.healthRelay.itemNames("追加"),
  ]);
  t.check("「牛乳を追加」は牛乳", JSON.stringify(parsed[0]) === '["牛乳"]', JSON.stringify(parsed[0]));
  t.check("読点で二つに・「も買って」は落とす", JSON.stringify(parsed[1]) === '["卵","パン"]', JSON.stringify(parsed[1]));
  t.check("「と」では切らない", JSON.stringify(parsed[2]) === '["とうもろこし"]', JSON.stringify(parsed[2]));
  t.check("頼みの言葉だけなら何も足さない", parsed[3].length === 0, JSON.stringify(parsed[3]));

  // 設定していなければ置き先は無い
  t.check("未設定なら Siri 用のURLは空",
    (await page.evaluate(() => KN.healthRelay.inboxUrl())) === "");

  // 1. 届いた二通が入る
  box = [{ at: 1000, text: "牛乳を追加" }, { at: 1001, text: "卵、パン" }];
  ver = 1001;
  await page.evaluate((u) => KN.healthRelay.setUrl(u), FAKE);
  await page.waitForFunction(() => Number(KN.store.get().settings.relayInboxAt) === 1001, null, { timeout: 5000 })
    .catch(() => {});
  let now = await names();
  t.check("三つとも買うものに入った",
    ["牛乳", "卵", "パン"].every((n) => now.includes(n)), JSON.stringify(now));
  t.check("どこまで足したかを保存した",
    (await page.evaluate(() => KN.store.get().settings.relayInboxAt)) === 1001);
  t.check("Siri 用のURLは ?slot=add 付き",
    (await page.evaluate(() => KN.healthRelay.inboxUrl())) === FAKE + "?slot=add");

  // 2. 版だけ進んで（健康の便が新しくなって）同じ受け箱がまた渡っても、二度足さない
  const count = () => page.evaluate(() => KN.store.get().items.filter((i) => !i.checked).length);
  const before = await count();
  health = "steps=5000"; ver = 2000;
  await pull();
  t.check("同じ一通を二度足さない", (await count()) === before, `${before} → ${await count()}`);

  // 3. 読み直しても（セッションの覚えが消えても）二度足さない
  await page.evaluate(() => KN.store.flush && KN.store.flush());
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  ver = 2001;
  await pull();
  t.check("読み直したあとも二度足さない", (await count()) === before, `${before} → ${await count()}`);

  // 4. もう載っているものは足さない
  box.push({ at: 2002, text: "卵" }); ver = 2002;
  await pull();
  t.check("載っている卵は足さない", (await count()) === before);

  // 5. 済ませたあとでまた頼まれたら足す
  await page.evaluate(() => {
    const s = KN.store.get();
    const p = s.products.find((x) => x.name === "牛乳");
    KN.store.update((st) => { st.items.forEach((i) => { if (i.productId === p.id) i.checked = true; }); });
  });
  box.push({ at: 2003, text: "牛乳" }); ver = 2003;
  await pull();
  now = await names();
  t.check("済ませた牛乳をまた頼んだら足す", now.includes("牛乳"), JSON.stringify(now));

  // 6. 受け箱の一通は健康データの読み方に渡っていない（落ちない・字が混ざらない）
  t.check("中継所に何度か問い合わせた", gets >= 4, String(gets));
  const steps = await page.evaluate(() => KN.store.healthValue(KN.util.todayKey(), "steps"));
  t.check("健康の便はいつもどおり入る（受け箱と混ざらない）", Number(steps) === 5000, String(steps));

  // 7. 設定の中継所の紙に、Siri 用のURLの行がある
  // 設定の中身は歯車を押した画面で決まる（ダイエットから開くと health の設定）
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(400);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "中継所" }).first().click();
  await page.waitForTimeout(500);
  t.check("中継所の紙に「Siri 用のURLをコピー」がある",
    (await page.locator(".set-layer:last-child .set-row", { hasText: "Siri 用のURLをコピー" }).count()) === 1);

  t.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
