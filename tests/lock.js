/* daily・ノートの鍵（js/lock.js、docs/daily.md の「鍵」）。

   既定は鍵なし・覆いなし。設定（daily の歯車 → ロック ›）でパスコードを決めると、
   開き直したとき daily に覆いが出る・全体の検索は daily とノートを探さない・
   違う数字では開かない・正しい数字で開く・tasks へ移れば覆いは消える・裏へ回ると
   閉じる・ノートにも覆いが出る・Face ID（仮の認証器）で開く・外すときはパスコード・
   記録は一つも変わらない・絵文字なし。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/lock.js */
const { open, checker } = require("./lib");

const t = checker("lock");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

(async () => {
  let cdp, authId;
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => {
      cdp = await ctx.newCDPSession(pg);
      await cdp.send("WebAuthn.enable");
      ({ authenticatorId: authId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
        protocol: "ctap2", transport: "internal",
        hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      } }));
    },
  });

  const top = ".set-layer:last-child";
  const veilOn = () => page.evaluate(() => {
    const v = document.querySelector(".lock-veil");
    return !!v && !v.hidden && getComputedStyle(v).display !== "none";
  });
  const show = async (id) => {
    await page.evaluate((i) => KN.app.showScreen(i), id);
    await page.waitForTimeout(400);
  };
  const answer = async (code) => {
    await page.waitForSelector(".sheet.is-open .js-input");
    await page.fill(".sheet.is-open .js-input", code);
    await page.click(".sheet.is-open .js-ok");
    await page.waitForTimeout(350);
  };
  const type = async (code) => {
    for (const k of code) await page.click(`.lock-key[data-k="${k}"]`);
    await page.waitForTimeout(400);
  };
  const plain = () => page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(KN.store.get()));
    delete s.settings.lock;
    return JSON.stringify(s);
  });

  /* ---- 既定は鍵なし ---- */
  await show("archive");
  t.check("既定では覆いが出ない", !(await veilOn()));

  /* 試験用の無難な字 */
  await page.evaluate(() => KN.store.addEntry({ date: KN.util.todayKey(), title: "しおかぜ", memo: "" }));
  const before = await plain();

  /* ---- 設定でパスコードを決める ---- */
  await show("settings");
  await page.waitForFunction(() => document.querySelector(".set-layer .set-row"));
  const lockRow = page.locator(`${top} .set-row`, { hasText: "ロック" }).first();
  t.check("daily の設定に「ロック」が出る", (await lockRow.count()) === 1);
  t.check("「ロック」の右はオフ", (await lockRow.innerText()).includes("オフ"));
  await lockRow.click();
  await page.waitForTimeout(400);
  await page.locator(`${top} .set-row.is-sw`, { hasText: "ロック" }).click();
  await answer("1234");
  await answer("1234");
  t.check("決めると鍵がかかる設定になる", await page.evaluate(() => KN.lock.enabled()));
  const conf = await page.evaluate(() => KN.store.get().settings.lock);
  t.check("パスコードそのものは保存しない", !JSON.stringify(conf).includes("1234") && conf.len === 4);
  t.check("決めた直後は覆わない", !(await veilOn()));

  /* ---- Face ID を登録 ---- */
  const bioRow = page.locator(`${top} .set-row.is-sw`, { hasText: "Face ID" });
  await page.waitForTimeout(300);
  t.check("Face ID の行が出る", await bioRow.isVisible());
  await bioRow.click();
  await page.waitForFunction(() => KN.lock.hasBio(), null, { timeout: 5000 }).catch(() => {});
  t.check("Face ID を登録できる", await page.evaluate(() => KN.lock.hasBio()));

  /* 開くたびに Face ID を自分から試すので、ここからは顔が合わないことにする */
  await cdp.send("WebAuthn.setUserVerified", { authenticatorId: authId, isUserVerified: false });

  /* ---- 開き直す ---- */
  await page.evaluate(() => history.replaceState(null, "", location.pathname + "#archive"));
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(500);
  t.check("開き直すと daily に覆いが出る", await veilOn());
  t.check("覆いは画面ぜんぶ", await page.evaluate(() => {
    const r = document.querySelector(".lock-veil").getBoundingClientRect();
    return r.top <= 0 && r.left <= 0 && r.width >= innerWidth && r.height >= innerHeight;
  }));
  const groups = await page.evaluate(() => KN.searchAll.find("しおかぜ", "todo").groups.map((g) => g.id));
  t.check("閉じているあいだ検索は daily を探さない", !groups.includes("daily") && !groups.includes("notes"), groups.join(","));

  await type("0000");
  t.check("違う数字では開かない", await veilOn());
  await type("1234");
  t.check("正しい数字で開く", !(await veilOn()));
  const groups2 = await page.evaluate(() => KN.searchAll.find("しおかぜ", "todo").groups.map((g) => g.id));
  t.check("開いたあとは検索に daily が出る", groups2.includes("daily"), groups2.join(","));

  /* ---- 裏へ回ると閉じる ---- */
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  t.check("裏へ回ると閉じる", await veilOn());
  await page.click(".lock-away");
  await page.waitForTimeout(400);
  t.check("左上の絵で tasks へ・覆いは消える",
    (await page.evaluate(() => KN.app.activeScreen())) === "todo" && !(await veilOn()));
  await show("notes");
  t.check("ノートにも覆いが出る", await veilOn());

  /* ---- Face ID で開く ---- */
  await cdp.send("WebAuthn.setUserVerified", { authenticatorId: authId, isUserVerified: true });
  await page.click(".lock-key.is-bio");
  await page.waitForFunction(() => !KN.lock.isLocked(), null, { timeout: 5000 }).catch(() => {});
  t.check("Face ID で開く", !(await veilOn()));
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  t.check("裏へ回ると閉じる（ノート）", await veilOn());
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction(() => !KN.lock.isLocked(), null, { timeout: 5000 }).catch(() => {});
  t.check("表へ戻ると、押さなくても Face ID が出て開く", !(await veilOn()));

  t.check("覆いに絵文字なし", !EMOJI.test(await page.evaluate(() => document.querySelector(".lock-veil").textContent)));

  /* ---- 外す ---- */
  await show("archive");
  await show("settings");
  await page.locator(`${top} .set-row`, { hasText: "ロック" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(`${top} .set-row.is-sw`, { hasText: "ロック" }).click();
  await answer("9999");
  t.check("違うパスコードでは外れない", await page.evaluate(() => KN.lock.enabled()));
  await page.locator(`${top} .set-row.is-sw`, { hasText: "ロック" }).click();
  await answer("1234");
  t.check("パスコードで外れる", !(await page.evaluate(() => KN.lock.enabled())));
  t.check("外すと Face ID の鍵も忘れる", !(await page.evaluate(() => KN.lock.hasBio())));

  t.check("記録は一つも変わらない", (await plain()) === before);
  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
