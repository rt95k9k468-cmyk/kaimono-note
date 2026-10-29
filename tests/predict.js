/* 打つときの予測：前に書いた題の札（やること）・変換前の平仮名で漢字の言葉を引く（js/yomi.js）・
   言い切った時刻は早く欄へ移す（screen-todo.js の liveWait）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/predict.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("predict");
  const { browser, page, errors } = await open();

  /* 覚える：data-yomi の欄で「びょういん」→「病院」と変換した、を出来事で再現。 */
  const learned = await page.evaluate(() => {
    const el = document.createElement("textarea");
    el.setAttribute("data-yomi", "");
    document.body.append(el);
    const fire = (type, data) => el.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }));
    fire("compositionstart", ""); fire("compositionupdate", "びょう"); fire("compositionupdate", "びょういん"); fire("compositionend", "病院");
    const other = document.createElement("textarea");
    document.body.append(other);
    other.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true }));
    other.dispatchEvent(new CompositionEvent("compositionupdate", { data: "ひみつ", bubbles: true }));
    other.dispatchEvent(new CompositionEvent("compositionend", { data: "秘密", bubbles: true }));
    el.remove(); other.remove();
    return {
      head: KN.yomi.hit("病院へ行く", "びょう"),
      none: KN.yomi.hit("病院へ行く", "かい"),
      mixed: KN.yomi.hit("病院へ行く", "びょういんへ"),
      notMine: KN.yomi.hit("秘密", "ひみ"),
      kept: JSON.parse(localStorage.getItem("kaimono-note-yomi") || "{}")["病院"],
    };
  });
  t.check("変換前の平仮名で頭が合う", learned.head === 0, JSON.stringify(learned));
  t.check("合わない言葉は出ない", learned.none === -1);
  t.check("覚えた漢字の先へ続けて打っても引ける", learned.mixed === 0);
  t.check("data-yomi の無い欄の変換は覚えない", learned.notMine === -1);
  t.check("読みは記録の外の控えに", learned.kept === "びょういん");

  /* やることの足す紙：前に書いた題の札。 */
  await page.evaluate(() => {
    const d = (n) => KN.util.shiftDay(KN.util.todayKey(), -n);
    KN.store.update((s) => {
      s.todos = [];
      [1, 3, 8].forEach((n, i) => s.todos.push({ id: "p" + i, title: "病院へ行く", due: d(n), done: true, minutes: 30, icon: null, repeat: null, subs: [] }));
      s.todos.push({ id: "q1", title: "ゴミ袋を買う", due: d(40), done: true, repeat: null, subs: [] });
      s.todos.push({ id: "r1", title: "ゴミ出し", due: KN.util.todayKey(), done: false, repeat: "daily", subs: [] });
      s.todos.push({ id: "r2", title: "ゴミ出し", due: d(1), done: true, trace: true, repeat: null, subs: [] });
    });
    KN.app.showScreen("todo");
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('button[aria-label="やることを追加"]').click());
  await page.waitForSelector(".js-title");
  await page.waitForTimeout(300);
  const chips = () => page.$$eval(".js-cands .chip", (bs) => bs.map((b) => b.textContent));
  const first = await chips();
  t.check("打つ前は、くり返し書く題だけ", first.length === 1 && first[0] === "病院へ行く", JSON.stringify(first));
  const title = page.locator(".js-title");
  await title.click();
  await page.keyboard.type("びょう");
  t.check("平仮名で打ちかけても漢字の題が出る", (await chips()).includes("病院へ行く"));
  await page.fill(".js-title", "");
  await page.keyboard.type("ごみ");
  const gomi = await chips();
  t.check("続いているくり返しは出さない", !gomi.includes("ゴミ出し"), JSON.stringify(gomi));
  t.check("めったに書かない題も、打てば出る（片仮名も平仮名で）", gomi.includes("ゴミ袋を買う"));
  await page.fill(".js-title", "");
  await page.keyboard.type("びょう");
  await page.click(".js-cands .chip");
  t.check("押すと題がその言葉に", await title.inputValue() === "病院へ行く", await title.inputValue());

  /* 言い切った時刻は早く移る。「10時」は少し待つ。 */
  await page.fill(".js-title", "");
  await page.keyboard.type("歯医者 10:30");
  await page.waitForTimeout(450);
  t.check("10:30 は 0.45 秒以内に移る", await title.inputValue() === "歯医者", await title.inputValue());
  await page.fill(".js-title", "");
  await page.keyboard.type("歯医者 10時");
  await page.waitForTimeout(300);
  t.check("「10時」はすぐには移さない（半が続きうる）", await title.inputValue() === "歯医者 10時", await title.inputValue());
  await page.waitForTimeout(400);
  t.check("「10時」も止まれば移る", await title.inputValue() === "歯医者", await title.inputValue());

  t.check("エラーなし", errors.length === 0, errors.join("|"));
  await browser.close();
  t.done();
})();
