/* 読み直し・閉じられたあとも、居た場所へ（roadmap-seamless の N4・X14 の (b)。app.js の keepPlace）。

   1. やることで別の日を見て送ってから読み直す → 同じ席・日・送り位置。
   2. 買うものから設定の「外観」へ潜って送ってから読み直す → 同じ奥・送り位置・潜ってきたタブ。
   3. ダイエットで送って隠れ、印なしで開き直す（閉じられたあと）→ 同じ席・送り位置。控えは一度で消える。
   4. 31分たった控え → やることへ。daily・ノート・daily から潜った設定に居た控え（閉じられたあと）→ やることへ。
   5. 控えは記録の外（書き出しに乗らない）。

   紙が開いているあいだは読み直さない・見えているあいだは読み直さない、は update-path の 6
   （本物の Service Worker の入れ替わりで見る）。 */
const { open, checker, URL } = require("./lib");

(async () => {
  const t = checker("resume");
  const { browser, page, errors } = await open({
    /* 日は壁の時計で作らない（tests/README の「試験の罠」）。 */
    before: (cx, p) => p.clock.setFixedTime(new Date("2026-10-10T12:30:00")),
  });

  const frames = (n) => page.evaluate((k) => new Promise((ok) => {
    const go = () => (k-- > 0 ? requestAnimationFrame(go) : ok());
    go();
  }), n);
  const booted = async () => {
    await page.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen && document.querySelector(".screen.is-active"));
    await page.waitForTimeout(300);
    await frames(3);
  };
  const reload = async () => {
    const nav = page.waitForEvent("domcontentloaded");
    await page.evaluate(() => { setTimeout(() => KN.app.reloadHere(), 0); });
    await nav;
    await booted();
  };
  const goScreen = async (id) => {
    await page.evaluate((x) => KN.app.showScreen(x), id);
    await page.waitForFunction((x) => KN.app.activeScreen() === x, id);
    await page.waitForTimeout(450);    // 流れ終わるまで
  };
  /** 出ている画面の送る器を y へ。実際に入った値を返す。 */
  const scrollTo = (y) => page.evaluate((v) => {
    const sc = KN.app.scrollerOf(document.querySelector(".screen.is-active"));
    sc.scrollTop = v;
    return Math.round(sc.scrollTop);
  }, y);
  const scrollNow = () => page.evaluate(() =>
    Math.round(KN.app.scrollerOf(document.querySelector(".screen.is-active")).scrollTop));
  const hide = () => page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const kept = () => page.evaluate(() => localStorage.getItem("kaimono-note-resume"));

  /* 1. やること：別の日・送り位置（送れるだけの用事を、その日に） */
  const DAY = "2026-10-13";   // 先の日（過ぎた日の用事は、開くと今日へ運ばれる）
  await page.evaluate((d) => {
    for (let h = 6; h < 22; h++) KN.store.addTodo({ title: `用事${h}`, due: d, time: `${String(h).padStart(2, "0")}:00` });
    KN.util.dayShare.set(d);
    KN.screens.todo.render();
  }, DAY);
  await frames(2);
  const y1 = await scrollTo(400);
  t.check("1 支度：やることが送れる", y1 > 100, `送り ${y1}`);
  await reload();
  const s1 = await page.evaluate(() => ({ seat: KN.app.activeScreen(), day: KN.screens.todo.day() }));
  t.check("1 読み直しても、やることの同じ日", s1.seat === "todo" && s1.day === DAY, JSON.stringify(s1));
  const y1b = await scrollNow();
  t.check("1 読み直しても、同じ送り位置（「いま」へ送られない）", Math.abs(y1b - y1) <= 2, `${y1} → ${y1b}`);
  t.check("1 控えは一度読んだら消える", (await kept()) === null);

  /* 2. 設定の奥 */
  await goScreen("list");
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await page.waitForTimeout(250);
  await page.locator(".set-layer:last-child .set-row", { hasText: "外観" }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".set-layer").length === 2
    && !document.querySelector(".set-layer.is-edge-lift"));
  const y2 = await scrollTo(200);
  t.check("2 支度：外観の一枚が送れる", y2 > 50, `送り ${y2}`);
  await reload();
  const s2 = await page.evaluate(() => {
    const ls = [...document.querySelectorAll(".set-layer")];
    const top = ls[ls.length - 1];
    return {
      seat: KN.app.activeScreen(), n: ls.length,
      title: top && top.querySelector(".js-nav-title").textContent,
      under: ls[0] && ls[0].style.transform,
      from: KN.app.openedFrom(),
    };
  });
  t.check("2 読み直しても、設定の同じ奥（外観）", s2.seat === "settings" && s2.n === 2 && s2.title === "外観",
    JSON.stringify(s2));
  t.check("2 下の一枚は控えの位置に", /translate3d\(-/.test(s2.under || ""), s2.under);
  t.check("2 潜ってきたタブ（買うもの）も戻る", s2.from === "list", s2.from);
  const y2b = await scrollNow();
  t.check("2 奥の一枚の送り位置も同じ", Math.abs(y2b - y2) <= 2, `${y2} → ${y2b}`);

  /* 3. 閉じられたあと（印なしで開き直す） */
  await page.evaluate(() => KN.app.backScreen("settled"));
  await goScreen("diet");
  const y3 = await scrollTo(300);
  t.check("3 支度：ダイエットが送れる", y3 > 50, `送り ${y3}`);
  await hide();
  const k3 = JSON.parse((await kept()) || "{}");
  t.check("3 隠れると控えが置かれる（読み直しではない）", k3.seat === "diet" && k3.reload === false, JSON.stringify(k3));
  await page.goto(URL);
  await booted();
  t.check("3 30分以内に開き直すと、同じ席（ダイエット）", await page.evaluate(() => KN.app.activeScreen()) === "diet");
  const y3b = await scrollNow();
  t.check("3 同じ送り位置", Math.abs(y3b - y3) <= 2, `${y3} → ${y3b}`);

  /* 4. 戻さないもの。控えはアプリの外の頁で置く（アプリの頁から離れると、隠れたときの控えが上書きする）。 */
  const coldOpen = async (seat, ago, from = []) => {
    await page.goto(URL.replace("index.html", "manifest.webmanifest"));
    await page.evaluate(([s, a, f]) => localStorage.setItem("kaimono-note-resume",
      JSON.stringify({ at: Date.now() - a, seat: s, day: null, top: 120, from: f, set: null, reload: false })), [seat, ago, from]);
    await page.goto(URL);
    await booted();
    return page.evaluate(() => KN.app.activeScreen());
  };
  t.check("4 31分たった控えは使わない（やることへ）", await coldOpen("diet", 31 * 60e3) === "todo");
  t.check("4 daily に居た控え（閉じられたあと）は、やることへ（鍵のため）", await coldOpen("archive", 60e3) === "todo");
  t.check("4 ノートに居た控えも、やることへ", await coldOpen("notes", 60e3) === "todo");
  t.check("4 daily から潜った設定の控えも、やることへ", await coldOpen("settings", 60e3, ["archive"]) === "todo");
  t.check("4 買うものから潜った設定の控えは、設定へ", await coldOpen("settings", 60e3, ["list"]) === "settings");

  /* 5. 記録の外 */
  await hide();
  const ex = await page.evaluate(() => KN.store.exportJSON());
  t.check("5 控えは書き出しに乗らない", !!(await kept()) && !ex.includes("kaimono-note-resume") && !/"reload"\s*:/.test(ex));

  t.check("エラー0", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
