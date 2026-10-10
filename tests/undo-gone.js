/* さっき消したもの（roadmap-seamless の N13 の X18 (c)。store の keepGone・ui.js の takeGone）。

   1. ⋯から消すと、記録の外（kaimono-note-gone）に控える。書き出しに乗らない。
   2. 消した知らせが出たまま閉じられる → 開き直すと「消しました」「元に戻す」がもう一度・押すと戻る。
   3. 閉じられずに戻ったら印は外れる／知らせを下げてから閉じられたら出し直さない。
   4. 知らせの「元に戻す」で戻したら控えからも消える。足したのを取り消すのは控えない。
   5. 設定 → バックアップの「さっき消したもの」：件数・押すと同じ場所へ戻る。最後の5件。16分たったら出ない。 */
const { open, checker, URL } = require("./lib");

(async () => {
  const t = checker("undo-gone");
  const { browser, page, errors } = await open({
    before: (cx, p) => p.clock.setFixedTime(new Date("2026-10-10T12:30:00")),
  });

  const KEY = "kaimono-note-gone";
  const booted = async () => {
    await page.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen && document.querySelector(".screen.is-active"));
    await page.waitForTimeout(300);
  };
  const vis = (v) => page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, v);
  const kept = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), KEY);
  const toastText = () => page.evaluate(() => [...document.querySelectorAll("#toast-root .toast:not(.is-out)")].map((x) => x.textContent.trim()).join("|"));
  /** 体重を一件足し、⋯の「消す」と同じ道（delMenu）で消す。 */
  const addAndDelete = (kg) => page.evaluate((v) => {
    const w = KN.store.addWeight({ day: KN.util.todayKey(), kg: v });
    const id = (w && w.id) || KN.store.get().diet.weights.find((x) => x.kg === v).id;
    KN.ui.delMenu(() => KN.store.removeWeight(id))[0].onPick();
    return id;
  }, kg);
  const hasWeight = (id) => page.evaluate((i) => KN.store.get().diet.weights.filter((x) => x.id === i).length, id);
  const clearToasts = () => page.evaluate(() => document.querySelectorAll("#toast-root .toast").forEach((x) => x.click()));

  await booted();

  /* 1 */
  const id1 = await addAndDelete(61.5);
  const k1 = await kept();
  t.check("1 消すと記録の外に控える", k1.length === 1 && k1[0].path === "diet.weights" && k1[0].item.id === id1, JSON.stringify(k1));
  const ex = await page.evaluate(() => KN.store.exportJSON());
  t.check("1 控えは書き出しに乗らない", !ex.includes(KEY));

  /* 2 */
  await vis(true);
  t.check("2 知らせが出たまま隠れると印", (await kept())[0].up === true);
  await page.goto(URL);
  await booted();
  await page.waitForTimeout(300);
  const msg = await toastText();
  t.check("2 開き直すと「消しました」「元に戻す」がもう一度", /消しました/.test(msg) && /元に戻す/.test(msg), msg);
  await page.click("#toast-root .toast-action");
  t.check("2 押すと同じものが一つ戻る", (await hasWeight(id1)) === 1);
  t.check("2 戻したら控えから消える", (await kept()).length === 0);

  /* 3 */
  const id3 = await addAndDelete(62.5);
  await vis(true);
  await vis(false);
  t.check("3 閉じられずに戻ったら印は外れる", !(await kept())[0].up);
  await clearToasts();
  await page.waitForTimeout(300);
  await page.goto(URL);
  await booted();
  await page.waitForTimeout(300);
  t.check("3 知らせを下げてから閉じられたら出し直さない", !/消しました/.test(await toastText()), await toastText());
  t.check("3 控えは残る", (await kept()).some((g) => g.item.id === id3));

  /* 4 */
  const id4 = await addAndDelete(63.5);
  await page.click("#toast-root .toast-action");
  t.check("4 知らせの「元に戻す」で戻すと控えから消える", (await hasWeight(id4)) === 1 && !(await kept()).some((g) => g.item.id === id4));
  const undoneAdd = await page.evaluate(() => {
    const r = KN.store.addTodo({ title: "足して取り消す" });
    KN.store.removeTodo((r && r.id) || KN.store.get().todos.find((x) => x.title === "足して取り消す").id);
    return JSON.parse(localStorage.getItem("kaimono-note-gone") || "[]").some((g) => g.item.title === "足して取り消す");
  });
  t.check("4 足したのを取り消すのは控えない", !undoneAdd);

  /* 5 */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll(".screen.is-active .set-row.is-nav")]
    .find((b) => b.textContent.trim() === "バックアップ").click());
  await page.waitForTimeout(500);
  const row = page.locator(".screen.is-active .set-row", { hasText: "さっき消したもの" });
  t.check("5 設定のバックアップに「さっき消したもの」と件数", (await row.count()) === 1 && /1件/.test(await row.first().textContent()));
  await row.first().click();
  await page.waitForSelector(".js-gone .row");
  const title = await page.textContent(".js-gone .row");
  t.check("5 一行は「体重・今日」", /体重・今日/.test(title), title);
  await page.click(".js-gone .row");
  await page.waitForTimeout(400);
  t.check("5 押すと同じ場所へ戻る", (await hasWeight(id3)) === 1 && (await kept()).length === 0);
  t.check("5 「戻しました」", /戻しました/.test(await toastText()));

  const many = [];
  for (let i = 0; i < 7; i++) many.push(await addAndDelete(70 + i));
  const k5 = await kept();
  t.check("5 控えるのは最後の5件（新しい順）", k5.length === 5 && k5[0].item.id === many[6] && k5[4].item.id === many[2],
    JSON.stringify(k5.map((g) => g.item.kg)));
  await page.clock.setFixedTime(new Date("2026-10-10T12:46:30"));
  t.check("5 16分たったら出ない", (await page.evaluate(() => KN.store.goneList().length)) === 0);

  t.check("エラー0", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
