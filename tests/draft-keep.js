/* 書きかけを守る（roadmap-seamless の N8・X15。ui.js の keepDraft / takeDraft）。

   1. やることの紙（新しく）：題を打って隠れ、印なしで開き直す（閉じられたあと）→ 同じ紙に題が戻る。
      保存はされていない。閉じると今までどおり保存される。
   2. やることの紙（直す）：題を打ち替えて閉じられる → その用事の紙に打ち替えた題。記録は元のまま。
   3. 買うものを追加・体重・食事を書く：同じく戻る。体重・食事は記録に入っていない。
   4. 戻さないもの：何も変えていない紙は控えない／閉じられずに戻ってきたら控えを捨てる／16分たった控え。
   5. 控えは記録の外（書き出しに乗らない）。
   7. 閉じる守りの取り直し（makeGuard の settle）：60ms の時計より先の指でも、変えていなければ保存せず、先の一押しは呑まない。 */
const { open, checker, URL } = require("./lib");

(async () => {
  const t = checker("draft-keep");
  const { browser, page, errors } = await open({
    before: (cx, p) => p.clock.setFixedTime(new Date("2026-10-10T12:30:00")),
  });

  const KEY = "kaimono-note-draft";
  const booted = async () => {
    await page.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen && document.querySelector(".screen.is-active"));
    await page.waitForTimeout(300);
  };
  const goScreen = async (id) => {
    await page.evaluate((x) => KN.app.showScreen(x), id);
    await page.waitForFunction((x) => KN.app.activeScreen() === x, id);
    await page.waitForTimeout(450);
  };
  const hide = () => page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const show = () => page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const kept = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), KEY);
  /** 閉じられたあとに開き直す（印なし）。紙が開くなら、埋め直しまで待つ。 */
  const coldOpen = async (sel, want) => {
    await page.goto(URL);
    await booted();
    if (!sel) { await page.waitForTimeout(400); return null; }
    await page.waitForFunction(([s, w]) => {
      const f = document.querySelector(`.sheet ${s}`);
      return f && f.value === w;
    }, [sel, want], { timeout: 5000 }).catch(() => {});
    return page.evaluate((s) => {
      const f = document.querySelector(`.sheet ${s}`);
      return f ? f.value : null;
    }, sel);
  };
  const sheetOpen = (sel) => page.waitForSelector(`.sheet ${sel}`).then(() => page.waitForTimeout(400));

  /* 1. やること（新しく） */
  await goScreen("todo");
  await page.evaluate(() => KN.screens.todo.open(null));
  await sheetOpen(".js-title");
  await page.fill(".sheet .js-title", "電球を替える");
  await hide();
  const k1 = await kept();
  t.check("1 隠れると書きかけが控えられる", k1 && k1.kind === "todo" && k1.seat === "todo"
    && k1.vals.some((v) => v[1] === "電球を替える"), JSON.stringify(k1 && { kind: k1.kind, seat: k1.seat }));
  t.check("1 開き直すと、同じ紙に題が戻る", await coldOpen(".js-title", "電球を替える") === "電球を替える");
  t.check("1 戻しただけでは保存しない",
    !(await page.evaluate(() => KN.store.get().todos.some((x) => x.title === "電球を替える"))));
  t.check("1 控えは一度読んだら消える", (await kept()) === null);
  t.check("1 保存のボタンが押せる（打ったときと同じ道で埋めた）",
    await page.evaluate(() => !document.querySelector(".sheet .js-save").disabled));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).catch(() => {});
  t.check("1 閉じると今までどおり保存される",
    await page.evaluate(() => KN.store.get().todos.some((x) => x.title === "電球を替える")));

  /* 2. やること（直す） */
  const id2 = await page.evaluate(() => KN.store.get().todos.find((x) => x.title === "電球を替える").id);
  await page.waitForTimeout(400);
  await page.evaluate((id) => KN.screens.todo.open(id), id2);
  await sheetOpen(".js-title");
  await page.fill(".sheet .js-title", "電球を二つ替える");
  await hide();
  t.check("2 直す紙も、その用事の紙に打ち替えた題が戻る", await coldOpen(".js-title", "電球を二つ替える") === "電球を二つ替える");
  t.check("2 記録は元のまま", await page.evaluate((id) => KN.store.getTodo(id).title, id2) === "電球を替える");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);

  /* 3. 買うもの・体重・食事 */
  await goScreen("list");
  await page.evaluate(() => document.querySelector(".js-open-add").click());
  await sheetOpen(".js-name");
  await page.fill(".sheet .js-name", "食器用の洗剤");
  await hide();
  t.check("3 買うものを追加の書きかけが戻る", await coldOpen(".js-name", "食器用の洗剤") === "食器用の洗剤");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);

  await goScreen("diet");
  const w0 = await page.evaluate(() => KN.store.get().diet.weights.length);
  await page.evaluate(() => KN.screens.diet.openWeightSheet(null, "2026-10-10"));
  await sheetOpen(".js-kg");
  await page.fill(".sheet .js-kg", "68.4");
  await hide();
  t.check("3 体重の書きかけが戻る", await coldOpen(".js-kg", "68.4") === "68.4");
  t.check("3 体重は記録に入っていない", await page.evaluate(() => KN.store.get().diet.weights.length) === w0);
  /* 閉じると保存される（ここで見るのは戻ることだけ）。 */
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);

  await page.evaluate(() => KN.screens.diet.openMealMemoSheet("2026-10-10"));
  await sheetOpen(".diet-slot textarea");
  await page.fill(".sheet .diet-slot textarea", "おにぎり");
  await hide();
  t.check("3 食事を書くの書きかけが戻る", await coldOpen(".diet-slot textarea", "おにぎり") === "おにぎり");

  /* 4. 戻さないもの */
  await page.goto(URL); await booted();
  await goScreen("todo");
  await page.evaluate(() => KN.screens.todo.open(null));
  await sheetOpen(".js-title");
  await hide();
  t.check("4 何も変えていない紙は控えない", (await kept()) === null);
  await show();
  await page.fill(".sheet .js-title", "窓を拭く");
  await hide();
  t.check("4 支度：変えたら控える", !!(await kept()));
  await show();
  t.check("4 閉じられずに戻ってきたら控えを捨てる", (await kept()) === null);
  await hide();
  /* 古くするのはアプリの外の頁で（アプリの頁から離れると、隠れたときの控えが上書きする。resume の 4）。 */
  const d4 = await kept();
  d4.at -= 16 * 60e3;
  await page.goto(URL.replace("index.html", "manifest.webmanifest"));
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(d4)]);
  await coldOpen(null);
  t.check("4 16分たった控えは使わない", !(await page.$(".sheet")));

  /* 5. 記録の外 */
  await page.evaluate(() => KN.screens.todo.open(null));
  await sheetOpen(".js-title");
  await page.fill(".sheet .js-title", "窓を拭く");
  await hide();
  const ex = await page.evaluate(() => KN.store.exportJSON());
  t.check("5 控えは書き出しに乗らない", !!(await kept()) && !ex.includes(KEY) && !ex.includes("窓を拭く"));

  /* 6. 手順を一つ消して、残りを打ち替えた紙（2026年11月26日の点検）：打ち替えた字は、その手順の欄へ戻る。
     前は欄を「同じ名札の何番目か」で照らしたので、消した一つめの欄へ二つめの字が入り、閉じると一つめの題が書き換わった。 */
  await show();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).catch(() => {});
  const id6 = await page.evaluate(() => KN.store.addTodo({ title: "棚を組む", due: null,
    subs: [{ id: "s6a", title: "板を出す", done: false }, { id: "s6b", title: "ねじを留める", done: false }] }).id);
  await page.waitForTimeout(400);
  await page.evaluate((id) => KN.screens.todo.open(id), id6);
  await sheetOpen(".js-sub");
  await page.click(".sheet .sub-line .js-sub-del");
  await page.fill(".sheet .js-sub", "ねじを全部留める");
  await hide();
  await coldOpen(".js-title", "棚を組む");
  await page.waitForTimeout(300);
  const subs6 = await page.evaluate(() => [...document.querySelectorAll(".sheet .js-sub")].map((f) => f.value));
  t.check("6 打ち替えた字は、その手順の欄へ（消した手順の欄へ入らない）",
    subs6.length === 2 && subs6[0] === "板を出す" && subs6[1] === "ねじを全部留める", JSON.stringify(subs6));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).catch(() => {});
  const rec6 = await page.evaluate((id) => (KN.store.getTodo(id).subs || []).map((x) => `${x.id}:${x.title}`), id6);
  t.check("6 閉じても、ほかの手順の題は書き換わらない", rec6.includes("s6a:板を出す"), JSON.stringify(rec6));

  /* 7. 閉じる守りの取り直し（makeGuard の settle）は、60ms か最初の指の早いほう。混むと時計が遅れて指が先に通る：
     前は何も変えずに閉じても保存を押し（お酒の紙で「保存できませんでした」。urge-quick が10本並べで落ちた）、遅れた
     取り直しが先の一押しを呑んで黙って捨てた。作る一拍の 60ms の時計を止め、作ったあとに札を描く紙で見る。 */
  const guardSheet = () => page.evaluate(() => {
    const st = window.setTimeout;
    window.__held = [];
    window.__saved = 0;
    window.setTimeout = function (fn, ms, ...a) {
      if (ms === 60) { window.__held.push(fn); return st(() => {}, 2147483647); }
      return st.call(this, fn, ms, ...a);
    };
    const body = document.createElement("div");
    const foot = document.createElement("div");
    foot.innerHTML = '<button type="button" class="btn btn-primary js-save">保存</button>';
    let h;
    try { h = KN.ui.sheet({ title: "守りの試し", content: body, footer: foot, guard: true }); } finally { window.setTimeout = st; }
    foot.querySelector(".js-save").addEventListener("click", () => { window.__saved++; h.close(); });
    body.insertAdjacentHTML("beforeend", '<button type="button" class="chip js-k" aria-pressed="false">札</button>');
    const k = body.querySelector(".js-k");
    k.addEventListener("click", () => k.setAttribute("aria-pressed", String(k.getAttribute("aria-pressed") !== "true")));
  });
  const runHeld = () => page.evaluate(() => { (window.__held || []).forEach((fn) => fn()); window.__held = []; });
  const shut = () => page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
  await guardSheet();
  await page.click(".sheet.is-open .js-close");
  await shut();
  await runHeld();
  const g1 = await page.evaluate(() => ({ saved: window.__saved, open: document.querySelectorAll(".sheet.is-open").length }));
  t.check("7 時計の前に閉じても、何も変えていなければ保存を押さずに閉じる", g1.saved === 0 && g1.open === 0, JSON.stringify(g1));
  await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).catch(() => {});
  await guardSheet();
  await page.click(".sheet.is-open .js-k");
  await runHeld();
  await page.click(".sheet.is-open .js-close");
  await shut();
  const g2 = await page.evaluate(() => ({ saved: window.__saved, open: document.querySelectorAll(".sheet.is-open").length }));
  t.check("7 時計の前に押した一押しは、遅れた取り直しに呑まれない（閉じると保存）", g2.saved === 1 && g2.open === 0, JSON.stringify(g2));

  t.check("エラー0", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
