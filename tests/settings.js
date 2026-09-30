/* 設定の主な筋（R20）と、困ったときの記録（R23）・使用量の内訳（R24）。

   主な筋：やることの歯車から開くとその画面の設定と「一般」が並ぶ・スイッチを切ると
   記録に入り読み直しても残る・外観で「ダーク」が効いて残る・「›」で潜って戻る。
   困ったときの記録：投げたエラー・約束の断り・保存の失敗が控えに入る（store の外の鍵）・
   続けて同じものは一件にまとめて数える・日記の道のものは種類だけ・50件まで・
   設定の一覧に出てコピーできる・書き出しに乗らない・「すべて削除」で消える。
   使用量：日記と並べて AI の原文の字数・iPhone の枠の何割か・6割を越えたら一行（色は変えない）。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("settings");
  const { browser, ctx, page, errors } = await open();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:8765" });
  const top = ".set-layer:last-child";
  const rowOf = (text) => page.locator(`${top} .set-row`, { hasText: text }).first();
  const openSettings = async (from) => {
    await page.evaluate((x) => KN.app.showScreen(x), from);
    await page.waitForFunction((x) => KN.app.activeScreen() === x, from);
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
    await page.waitForTimeout(250);
  };
  const back = async () => {
    const n = await page.locator(".set-layer").count();
    await page.locator(`${top} .set-back, ${top} [aria-label="戻る"]`).first().click();
    await page.waitForFunction((k) => document.querySelectorAll(".set-layer").length < k, n);
    await page.waitForTimeout(250);
  };

  /* ---------------- 主な筋 ---------------- */
  await openSettings("todo");
  const rootText = await page.locator(top).innerText();
  t.check("やることの歯車から：その画面の設定と「一般」が一枚に並ぶ",
    rootText.includes("一日の道を出す") && rootText.includes("外観") && rootText.includes("バックアップ"),
    rootText.slice(0, 120));

  const sw = page.locator(`${top} .set-row.is-sw`, { hasText: "一日の道を出す" }).first();
  const was = await sw.getAttribute("aria-checked");
  await sw.click();
  await page.waitForTimeout(250);
  t.check("スイッチを押すと記録に入る（一日の道を出す → 切る）",
    was === "true" && await page.evaluate(() => KN.store.get().settings.todoRoad === false));

  await rowOf("外観").click();
  await page.waitForFunction(() => document.querySelectorAll(".set-layer").length >= 2);
  await page.waitForTimeout(300);
  await page.locator(`${top} .seg-btn[data-theme="dark"]`).click();
  await page.waitForTimeout(200);
  t.check("外観で「ダーク」を押すと、その場で暗くなる",
    await page.evaluate(() => document.documentElement.dataset.theme === "dark" && KN.store.get().settings.theme === "dark"));
  await back();
  t.check("戻ると根っこの一枚", (await page.locator(".set-layer").count()) === 1);

  await page.evaluate(() => KN.store.flush());
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  t.check("読み直しても、切ったスイッチとダークが残る",
    await page.evaluate(() => KN.store.get().settings.todoRoad === false && KN.store.get().settings.theme === "dark"
      && document.documentElement.dataset.theme === "dark"));
  await page.evaluate(() => KN.store.update((s) => { delete s.settings.todoRoad; s.settings.theme = "auto"; }));

  /* ---------------- 二段の一覧（2026年9月30日） ----------------
     根っこは一覧、長いものは「›」の先。行の置き場だけが変わり、鍵は変わらない。 */
  const into = async (title) => {
    await rowOf(title).click();
    await page.waitForFunction(() => document.querySelectorAll(".set-layer").length >= 2);
    await page.waitForTimeout(300);
    return page.locator(top).innerText();
  };
  await openSettings("todo");
  const T0 = await page.locator(top).innerText();
  const notifyOn = await page.evaluate(() => KN.notify.enabled());
  t.check("tasks の根っこに「通知 ›」といまの状態、スイッチ二つは出ない",
    new RegExp(`通知\\s*${notifyOn ? "オン" : "オフ"}`).test(T0) && !T0.includes("やることの時刻を知らせる"), T0.slice(0, 200));
  t.check("「カレンダー ›」はショートカット App のある端末だけ",
    T0.includes("カレンダー") === (await page.evaluate(() => !!(KN.ics && KN.ics.apple()))));
  const T1 = await into("通知");
  t.check("通知の先に「やることの時刻を知らせる」", T1.includes("やることの時刻を知らせる"), T1.slice(0, 200));
  await back();

  await openSettings("archive");
  const D0 = await page.locator(top).innerText();
  t.check("daily の根っこは「あの日」・表示 ›・書き出し ›",
    D0.includes("「あの日」を出す") && /表示/.test(D0) && /書き出し/.test(D0)
      && !D0.includes("出す範囲") && !D0.includes("月ぶんを書き出す"), D0.slice(0, 200));
  const D1 = await into("表示");
  t.check("表示の先に見え方の行（出す範囲・季節のひとこと・月のまとめ）",
    ["出す範囲", "見せ方", "積み上げのメモ", "上に出すもの", "起床・就寝の時刻", "作成・更新の時刻", "季節のひとこと", "月のまとめを出す"]
      .every((x) => D1.includes(x)), D1.slice(0, 200));
  await back();
  const D2 = await into("書き出し");
  t.check("書き出しの先に「月ぶんを書き出す」「年の本」と年の本の説明",
    D2.includes("月ぶんを書き出す") && D2.includes("年の本") && D2.includes("一年ぶんの積み上げ"), D2.slice(0, 200));
  await back();

  await openSettings("list");
  t.check("shopping の根っこに「おぼえた振り分け」", (await page.locator(top).innerText()).includes("おぼえた振り分け"));

  await openSettings("diet");
  const H0 = await page.locator(top).innerText();
  t.check("health の根っこに「記録を書き出す」と説明・「取り込み ›」",
    H0.includes("記録を書き出す") && H0.includes("日ごとの表") && H0.includes("取り込み")
      && !H0.includes("ヘルスケアから取り込む") && !H0.includes("AIの窓口"), H0.slice(0, 300));
  const H1 = await into("取り込み");
  t.check("取り込みの先にヘルスケア・中継所・AIの窓口",
    H1.includes("ヘルスケアから取り込む") && H1.includes("中継所") && H1.includes("AIの窓口"), H1.slice(0, 200));
  await back();
  const B0 = await into("バックアップ");
  t.check("「バックアップ」の一枚から、移した三つが消えている",
    B0.includes("バックアップを保存") && B0.includes("データを消す")
      && !B0.includes("記録を書き出す") && !B0.includes("年の本") && !B0.includes("おぼえた振り分け"), B0.slice(0, 200));
  t.check("帯の題は「バックアップ」",
    (await page.locator(`${top} .js-nav-title`).innerText()).trim() === "バックアップ");
  await back();

  /* ---------------- 困ったときの記録（R23） ---------------- */
  await page.evaluate(() => KN.errlog.clear());
  await page.evaluate(() => {
    setTimeout(() => { throw new Error("試験のエラー"); }, 0);
    Promise.reject(new TypeError("試験の断り"));
  });
  await page.waitForFunction(() => KN.errlog.list().length >= 2);
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) KN.errlog.note("error", new Error("続けて同じ"), { file: "screen-todo.js", line: 7 });
    KN.errlog.note("error", new Error("日記の本文が混ざった文"), { file: "diary-idb.js", line: 3 });
  });
  const E1 = await page.evaluate(() => ({ list: KN.errlog.list(), raw: localStorage.getItem("kaimono-note-errors") }));
  const has = (m) => E1.list.find((r) => r.msg.includes(m));
  t.check("投げたエラーが控えに入る（時刻・版・画面・文・ファイルと行）",
    !!has("試験のエラー") && has("試験のエラー").ver && has("試験のエラー").at && "screen" in has("試験のエラー")
      && has("試験のエラー").kind === "error", JSON.stringify(has("試験のエラー")));
  t.check("約束の断り（unhandledrejection）も入る", !!has("試験の断り") && has("試験の断り").kind === "promise",
    JSON.stringify(has("試験の断り")));
  t.check("続けて同じものは一件にまとめて数える", E1.list.filter((r) => r.msg.includes("続けて同じ")).length === 1
    && has("続けて同じ").n === 3, JSON.stringify(E1.list.map((r) => [r.msg, r.n])));
  t.check("日記の道で起きたものは、文ではなく種類だけ", !E1.raw.includes("日記の本文") && E1.list.some((r) => r.file === "diary-idb.js" && r.msg === "Error"),
    JSON.stringify(E1.list.find((r) => r.file === "diary-idb.js")));
  t.check("控えは store の外の鍵（記録にも書き出しにも乗らない）",
    await page.evaluate(() => !JSON.stringify(KN.store.get()).includes("試験のエラー")
      && !KN.store.exportJSON().includes("試験のエラー") && !(localStorage.getItem("kaimono-note-v2") || "").includes("試験のエラー")));

  /* 保存の失敗：記録の鍵にだけ書けない端末を作る */
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    window.__origSet = orig;
    Storage.prototype.setItem = function (k, v) {
      if (k === "kaimono-note-v2") throw new DOMException("試験の枠あふれ", "QuotaExceededError");
      return orig.call(this, k, v);
    };
    KN.store.addTodo({ title: "保存できない用事" });
  });
  /* flush() は失敗を黙って次の保存へ回す（store.js の flushPending）。120ms の保存を待つ。 */
  await page.waitForFunction(() => KN.errlog.list().some((r) => r.kind === "save"), null, { timeout: 3000 }).catch(() => {});
  const saveRow = await page.evaluate(() => KN.errlog.list().find((r) => r.kind === "save"));
  t.check("保存の失敗も控えに入る", !!saveRow && /QuotaExceeded|枠あふれ/.test(saveRow.msg) && saveRow.file === "store.js",
    JSON.stringify(saveRow));
  await page.evaluate(() => { Storage.prototype.setItem = window.__origSet; KN.store.update(() => {}); KN.store.flush(); });
  await page.waitForTimeout(300);

  await page.evaluate(() => { for (let i = 0; i < 60; i++) KN.errlog.note("error", new Error(`数の試験 ${i}`), { file: "x.js", line: i }); });
  const n60 = await page.evaluate(() => KN.errlog.list());
  t.check("新しい50件まで", n60.length === 50 && n60[0].msg.includes("数の試験 59"), String(n60.length));
  await page.evaluate(() => {
    KN.errlog.clear();
    KN.errlog.note("error", new Error("一覧に出るエラー"), { file: "screen-list.js", line: 12 });
    KN.errlog.note("error", "x".repeat(500), { file: "screen-list.js", line: 13 });
  });
  t.check("文は200字で切る", await page.evaluate(() => KN.errlog.list()[0].msg.length === 200));

  await openSettings("list");
  const errRow = rowOf("困ったときの記録");
  t.check("一般に「困ったときの記録」と件数", /2件/.test(await errRow.innerText()), await errRow.innerText());
  await errRow.click();
  await page.waitForSelector(`${top} .js-err-row`);
  const E2 = await page.locator(top).innerText();
  t.check("一覧に文・画面・ファイルと行が見える（コピーの前に中身が見える）",
    E2.includes("一覧に出るエラー") && E2.includes("screen-list.js:12"), E2.slice(0, 200));
  await rowOf("コピー").click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  t.check("コピーすると、一覧の中身が字になる", clip.includes("一覧に出るエラー") && clip.includes("screen-list.js:12"), clip.slice(0, 120));
  t.check("書き出し・バックアップ・Dropbox に乗らないと言う", E2.includes("乗りません"));
  await back();

  /* ---------------- 使用量（R24） ---------------- */
  await page.evaluate(() => {
    KN.store.addMeal({ day: KN.util.todayKey(), time: "12:00", slot: "lunch", items: [{ name: "試験" }],
      ai: { kcal: 500, raw: "あ".repeat(3000), analysis: "い".repeat(1500) } });
  });
  await openSettings("list");
  await rowOf("バックアップ").click();
  await page.waitForFunction(() => /この端末の中/.test(document.querySelector(".set-layer:last-child").innerText));
  const U1 = await page.locator(top).innerText();
  t.check("使用量に AI の原文の字数が並ぶ", /AI の原文/.test(U1), (U1.match(/この端末の中[^\n]*/) || [""])[0]);
  t.check("iPhone の枠の何割か（目安）を言う", /iPhone の保存の枠（目安でおよそ260万字）の(1割未満|約\d+割)です/.test(U1));
  t.check("6割に届かなければ「大きくなってきました」は出ない", !U1.includes("記録が大きくなってきました"));
  await back();
  const big = await page.evaluate(() => {
    const real = KN.backup.usage;
    KN.backup.usage = () => ({ ...real(), liveChars: 1700000, where: "idb" });
    return true;
  });
  await rowOf("バックアップ").click();
  await page.waitForFunction(() => /この端末の中/.test(document.querySelector(".set-layer:last-child").innerText));
  const U2 = await page.locator(top).innerText();
  const warnColor = await page.evaluate(() => {
    const f = [...document.querySelectorAll(".set-layer:last-child .set-foot")].find((x) => x.textContent.includes("大きくなってきました"));
    return f ? getComputedStyle(f).color === getComputedStyle(document.querySelector(".set-layer:last-child .set-foot")).color : null;
  });
  t.check("6割を越えたら一行「記録が大きくなってきました」（約7割）", big && U2.includes("約7割") && U2.includes("記録が大きくなってきました"),
    (U2.match(/iPhone[^\n。]*。[^\n。]*。?/) || [""])[0]);
  t.check("その一行で色を変えない", warnColor === true, String(warnColor));
  await back();

  /* ---------------- すべて削除で、困ったときの記録も消える ---------------- */
  await rowOf("バックアップ").click();
  await page.waitForTimeout(300);
  await rowOf("データを消す").click();
  await page.waitForTimeout(300);
  await page.locator(`${top} .set-row`, { hasText: "すべて削除" }).last().click();
  await page.waitForSelector(".js-ok");
  await page.locator(".js-ok").last().click();
  await page.waitForFunction(() => KN.store.get().todos.length === 0);
  await page.waitForTimeout(300);
  t.check("「すべて削除」で困ったときの記録も消える", await page.evaluate(() => KN.errlog.list().length === 0));

  const bad = errors.filter((e) => !/試験のエラー|試験の断り/.test(e));
  t.check("（わざと投げたもののほか）ページのエラーなし", !bad.length, bad.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
