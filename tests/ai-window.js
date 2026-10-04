/* AIの窓口（D8）。設定の紙で道を作り、WorkerのURLに継いで保存し、「確かめる」が
   通る。窓口が { error } を返したら、その文が画面に出る。

   本物の窓口には繋がない（URLは資格情報で、呼べば料金もかかる）。
   `https://ai.invalid/…` を page.route で受けて、窓口のふりをする。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("AIの窓口");
  const { browser, page, errors } = await open();

  const seen = [];
  await page.route("https://ai.invalid/**", (route) => {
    const req = route.request();
    seen.push(req.method() + " " + req.url());
    const head = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    if (req.method() === "GET") {
      return route.fulfill({ status: 200, headers: head,
        body: JSON.stringify({ ok: true, kind: "kurashi-ai", model: "claude-opus-5" }) });
    }
    return route.fulfill({ status: 502, headers: head,
      body: JSON.stringify({ error: "鍵が通りませんでした（試験）" }) });
  });
  // { error } を返さない、昔ながらの窓口
  await page.route("https://old.invalid/**", (route) =>
    route.fulfill({ status: 500, headers: { "Access-Control-Allow-Origin": "*" }, body: "oops" }));

  // 設定の中身は歯車を押した画面で決まる（ダイエットから開くと health の設定）
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(400);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  const openSheet = async () => {
    await page.locator(".set-layer:last-child .set-row", { hasText: "AIの窓口" }).first().click();
    await page.waitForTimeout(500);
  };
  // AIの窓口は health の「取り込み ›」の先（docs/settings.md の「二段の一覧」）
  await page.locator(".set-layer:last-child .set-row", { hasText: "取り込み" }).first().click();
  await page.waitForTimeout(500);
  await openSheet();

  t.check("紙に「Cloudflareに置く」があり、ai/ を指す",
    (await page.locator('a[href*="kaimono-note/tree/main/ai"]', { hasText: "Cloudflareに置く" }).count()) === 1);

  // 1. 道をつくる
  await page.locator(".js-newpath").click();
  const path = (await page.locator(".js-path").textContent()).trim();
  t.check("道は /kn- と16文字", /^\/kn-[a-km-z2-9]{16}$/.test(path), path);

  // 2. WorkerのURLだけを貼って確かめる → 道が継がれて GET される
  await page.locator(".js-url").fill("https://ai.invalid");
  await page.locator(".js-check").click();
  await page.waitForFunction(() => /通り/.test(document.querySelector(".js-check-out").textContent), null, { timeout: 5000 })
    .catch(() => {});
  const out = (await page.locator(".js-check-out").textContent()).trim();
  t.check("確かめると「通りました」とモデルが出る", /通りました（claude-opus-5）/.test(out), out);
  t.check("確かめる GET は道を継いだURLへ", seen.includes("GET https://ai.invalid" + path), seen.join(" | "));

  // 3. 保存 → 道を継いだURLが残る
  await page.locator(".js-save").click();
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => KN.store.get().settings.dietAiUrl);
  t.check("保存すると道が継がれる", saved === "https://ai.invalid" + path, saved);
  t.check("窓口が設定されたことになる", await page.evaluate(() => KN.dietAI.configured()));

  // 4. 窓口の { error } が、そのまま理由として出る
  const why = await page.evaluate(() => KN.dietAI.coach("最近どう？", 7).then(() => "", (e) => e.message));
  t.check("窓口の { error } を理由として出す", why === "鍵が通りませんでした（試験）", why);
  const posted = seen.filter((s) => s.startsWith("POST ")).length;
  t.check("相談は保存したURLへ POST", posted === 1 && seen.includes("POST https://ai.invalid" + path), seen.join(" | "));

  // 5. 道が付いたURLは、そのまま（自分で建てた別の窓口も入れられる）
  await openSheet();
  await page.locator(".js-url").fill("https://old.invalid/mine");
  await page.locator(".js-save").click();
  await page.waitForTimeout(400);
  const kept = await page.evaluate(() => KN.store.get().settings.dietAiUrl);
  t.check("道が付いたURLには継ぎ足さない", kept === "https://old.invalid/mine", kept);

  // 6. { error } を返さない窓口は、前と同じ文に落ちる
  const old = await page.evaluate(() => KN.dietAI.coach("x", 7).then(() => "", (e) => e.message));
  t.check("{ error } が無ければ「窓口が 500 を返しました」", old === "窓口が 500 を返しました", old);
  const oldCheck = await page.evaluate(() => KN.dietAI.check().then(() => "", (e) => e.message));
  t.check("確かめるも同じ文に落ちる", oldCheck === "窓口が 500 を返しました", oldCheck);

  // 7. 外す
  await openSheet();
  await page.locator(".js-clear").click();
  await page.waitForTimeout(400);
  t.check("外すと空に戻る", (await page.evaluate(() => KN.store.get().settings.dietAiUrl)) === "");

  t.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
