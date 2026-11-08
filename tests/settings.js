/* 設定の主な筋（R20）と、エラーの記録（R23。11月5日まで「困ったときの記録」）・使用量の内訳（R24）。

   主な筋：どの歯車からも全部の席が一枚に並ぶ（押した席 → general → 残り）・スイッチを切ると
   記録に入り読み直しても残る・外観で「ダーク」が効いて残る・「›」で潜って戻る。
   困ったときの記録：投げたエラー・約束の断り・保存の失敗が控えに入る（store の外の鍵）・
   続けて同じものは一件にまとめて数える・日記の道のものは種類だけ・50件まで・
   設定の一覧に出てコピーできる・書き出しに乗らない。「データを消す」の口は無い。
   使用量：日記と並べて AI の原文の字数・iPhone の枠の何割か・6割を越えたら一行（色は変えない）。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("settings");
  const { browser, ctx, page, errors } = await open({ unfold: ["monthExport", "calShortcut"] });
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
  /* 一枚が押し出し終わるまで待つ。動いているあいだの押しは、画面がわざと捨てる（二重に積まない。
     screen-settings.js の moving）。決め打ちの待ちは押し出し（2フレーム＋--m-push＋20ms）と競って、まれに捨てられていた。 */
  const layerStill = () => page.waitForFunction(() => !document.querySelector(".set-layer.is-edge-lift"));
  const back = async () => {
    const n = await page.locator(".set-layer").count();
    await layerStill();
    await page.locator(`${top} .set-back, ${top} [aria-label="戻る"]`).first().click();
    await page.waitForFunction((k) => document.querySelectorAll(".set-layer").length < k, n);
    await layerStill();
    await page.waitForTimeout(250);
  };

  /* ---------------- 主な筋 ---------------- */
  /* 根っこは入口だけの一枚（2026年11月5日）：表示・操作／通知・プライバシー／五つのタブ／データ・同期／連携・ヘルプ。
     どの歯車から開いても同じ並び。入口の先の一枚に中身が全部並ぶ。 */
  const into = async (title) => {
    const n = await page.locator(".set-layer").count();
    await rowOf(title).click();
    await page.waitForFunction((k) => document.querySelectorAll(".set-layer").length > k, n);
    await layerStill();
    await page.waitForTimeout(300);
    return page.locator(top).innerText();
  };
  const ENTRIES = ["表示・操作", "通知・プライバシー", "daily", "notes", "tasks", "shopping", "health", "データ・同期", "連携・ヘルプ"];
  const entries = () => page.$$eval(`${top} .set-row.has-lead .set-title`, (ts) => ts.map((x) => x.firstChild.textContent.trim()));
  await openSettings("todo");
  const rootText = await page.locator(top).innerText();
  t.check("根っこは入口だけの一枚（九つ）", (await entries()).join() === ENTRIES.join(), (await entries()).join());
  t.check("入口の下に中身の名前（一行）", rootText.includes("明るさ・基調色・文字・上の帯") && rootText.includes("時間割・一日の道・見直す間隔"),
    rootText.slice(0, 160));
  t.check("入口の絵は基調色の線の絵だけ（色の四角は無い）",
    (await page.locator(`${top} .set-tile`).count()) === 0 && (await page.locator(`${top} .set-row.has-lead .set-lead svg`).count()) === 9);
  await into("tasks");

  /* 一日の道は 上・下・出さない（2026年10月19日。前は「一日の道を出す」のスイッチ）。
     短い選択肢は一枚を重ねず、行の値のところに小窓（2026年10月24日。docs/settings.md の「その場で選ぶ」）。 */
  const menu = ".note-pop.set-menu.is-open";
  const pickIn = async (row, item) => {
    await rowOf(row).click();
    await page.waitForSelector(menu);
    const seen = await page.locator(`${menu} [role="menuitemradio"]`).evaluateAll((bs) =>
      bs.map((b) => b.textContent.trim() + (b.getAttribute("aria-checked") === "true" ? "✓" : "")));
    await page.locator(`${menu} [role="menuitemradio"]`, { hasText: item }).click();
    await page.waitForFunction(() => !document.querySelector(".note-pop.set-menu.is-open"));
    await page.waitForTimeout(250);
    return seen;
  };
  const roadRow = await rowOf("一日の道").innerText();
  const items = await pickIn("一日の道", "時間割の下");
  const below = await page.evaluate(() => KN.store.get().settings.todoRoadAt === "below");
  t.check("一日の道は行の値のところに小窓（三つ・いまのものに ✓・一枚は重ねない）",
    /時間割の上/.test(roadRow) && items.join() === "時間割の上✓,時間割の下,出さない"
      && (await page.locator(".set-layer").count()) === 2, `${roadRow} / ${items.join()}`);   // 根っこ・tasks の一枚
  await pickIn("一日の道", "出さない");
  t.check("押すと記録に入る（一日の道：既定は上 → 下 → 出さない）",
    below && await page.evaluate(() => KN.store.get().settings.todoRoad === false)
      && /出さない/.test(await rowOf("一日の道").innerText()));

  /* 一日の始まりと終わりは、行の値を押すと車輪（前は「›」の先の紙と「保存」）。決めればその場で預かる。 */
  const spin = async (title, h, m) => {
    await page.locator(`${top} .set-row.is-time`, { hasText: title }).locator(".set-time").click();
    await page.waitForSelector(".note-pop.is-wheel.is-open");
    await page.waitForTimeout(300);
    for (const [i, v] of [[0, h], [1, m]]) {
      await page.evaluate(([i, v]) => {
        const col = document.querySelectorAll(".note-pop.is-wheel .note-wheel")[i];
        const k = [...col.children].findIndex((r) => Number(r.dataset.v) === v);
        col.scrollTop = k * 40;
        col.dispatchEvent(new Event("scroll"));
      }, [i, v]);
      await page.waitForTimeout(250);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  };
  await spin("一日の始まり", 6, 30);
  const span1 = await page.evaluate(() => [KN.store.get().settings.dayStart, KN.store.get().settings.dayEnd]);
  t.check("一日の始まりを車輪で 6:30 に（その場で預かる・行の値も変わる）", span1[0] === "06:30"
    && /6:30/.test(await page.locator(`${top} .set-row.is-time`, { hasText: "一日の始まり" }).innerText()), JSON.stringify(span1));
  await spin("一日の終わり", 5, 0);
  t.check("終わりを始まりより前にはできない（記録は変わらない）",
    (await page.evaluate(() => KN.store.get().settings.dayEnd)) === span1[1]);
  await page.evaluate(() => KN.store.update((s) => { delete s.settings.dayStart; delete s.settings.dayEnd; }));

  await back();
  await into("表示・操作");
  t.check("明るさは三枚の絵（自動・ライト・ダーク。いまのものに印）",
    (await page.locator(`${top} .theme-pick[data-theme]`).count()) === 3
      && (await page.locator(`${top} .theme-pick[data-theme="auto"]`).getAttribute("aria-checked")) === "true");
  await page.locator(`${top} .theme-pick[data-theme="dark"]`).click();
  await page.waitForTimeout(200);
  t.check("外観で「ダーク」を押すと、その場で暗くなる",
    await page.evaluate(() => document.documentElement.dataset.theme === "dark" && KN.store.get().settings.theme === "dark"));
  await back();
  t.check("戻ると根っこの一枚", (await page.locator(".set-layer").count()) === 1);

  await page.evaluate(() => KN.store.flush());
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  t.check("読み直しても、出さないとダークが残る",
    await page.evaluate(() => KN.store.get().settings.todoRoad === false && KN.store.get().settings.theme === "dark"
      && document.documentElement.dataset.theme === "dark"));
  await page.evaluate(() => KN.store.update((s) => { delete s.settings.todoRoad; delete s.settings.todoRoadAt; s.settings.theme = "auto"; }));

  /* ---------------- 二段の一覧（2026年9月30日） ----------------
     根っこは一覧、長いものは「›」の先。行の置き場だけが変わり、鍵は変わらない。 */
  await openSettings("todo");
  const T0 = await page.locator(top).innerText();
  const notifyOn = await page.evaluate(() => KN.notify.enabled());
  t.check("通知・プライバシーの下の一行がいまの状態（通知・ロック）",
    new RegExp(`通知 ${notifyOn ? "オン" : "オフ"}・ロック オフ`).test(T0) && !T0.includes("やることの時刻を知らせる"), T0.slice(0, 200));
  const T1 = await into("通知・プライバシー");
  t.check("通知・プライバシーの一枚に、通知のスイッチとロックが並ぶ（前は一、二行ずつの二枚）",
    T1.includes("やることの時刻を知らせる") && /ロック/.test(T1), T1.slice(0, 200));
  await back();
  const TT = await into("tasks");
  t.check("tasks の一枚に時間割・見直す間隔（その場で選ぶ）・置き直しの記録・取り込み",
    ["今日を時間割で見る", "一日の道", "一日の始まり", "これから", "待つ", "いつか", "置き直しの記録", "外部アプリから取り込む"]
      .every((x) => TT.includes(x)) && (await page.locator(`${top} .set-row.is-pick`, { hasText: "これから" }).count()) === 1, TT.slice(0, 240));
  await back();
  const HP = await into("連携・ヘルプ");
  t.check("連携・ヘルプに中継所・誕生日・小窓・エラーの記録・アイコンの報告",
    ["中継所", "誕生日のショートカット", "小窓の組み方", "エラーの記録", "アイコンの報告"].every((x) => HP.includes(x)), HP.slice(0, 200));
  t.check("「カレンダー ›」はショートカット App のある端末だけ（連携の束）",
    HP.includes("カレンダー") === (await page.evaluate(() => !!(KN.ics && KN.ics.apple()))));
  await back();

  await openSettings("archive");
  t.check("daily の歯車からも同じ入口", (await entries()).join() === ENTRIES.join(), (await entries()).join());
  const D1 = await into("daily");
  t.check("daily の一枚に見え方の行（あの日・出す範囲・季節・月のまとめ）",
    ["「あの日」を出す", "日記", "出す範囲", "起床・就寝の時刻", "作成・更新の時刻", "季節のひとこと", "季節の絵", "月のまとめ"]
      .every((x) => D1.includes(x)) && !/積み上げ/.test(D1), D1.slice(0, 200));
  /* 「行数」（全文・3行・5行）は一枚の紙のときだけ効くので、時刻ごと（既定）では出さない（docs/thinking.md）。 */
  t.check("日記は時刻ごと（既定）・行数は一枚のときだけ", /日記\s*時刻ごと/.test(D1) && !D1.includes("行数"), D1.slice(0, 200));
  t.check("daily の一枚に書き出し（期間・年の本。月ぶんは外した）と取り込み（説明は置かない）",
    !D1.includes("月ぶんを書き出す") && D1.includes("期間を選んで書き出す") && D1.includes("年の本") && D1.includes("日記を取り込む") && !D1.includes("一年ぶんの積み上げ"), D1.slice(-200));
  await back();

  await openSettings("list");
  const SH = await into("shopping");
  t.check("shopping の一枚に お店・カテゴリ・おぼえた振り分け・「そろそろ切れそう」",
    ["お店", "カテゴリ", "おぼえた振り分け", "「そろそろ切れそう」を出す"].every((x) => SH.includes(x)), SH.slice(0, 200));
  /* 何も覚えていなくても「›」の先の一枚（前は知らせが出るだけだった）。 */
  const LR = await into("おぼえた振り分け");
  t.check("おぼえた振り分けは一枚（空なら「ありません」）", LR.includes("ありません"), LR.slice(0, 120));
  await back();
  await back();

  await openSettings("diet");
  const H1 = await into("health");
  t.check("health の一枚に目標・気づいたこと・取り込み（ヘルスケア・中継所）・書き出し（AIに分析も）",
    ["目標", "「気づいたこと」を出す", "開いたら自動で取り込む", "ヘルスケアから取り込む", "中継所", "記録を書き出す", "AIに分析してもらう"]
      .every((x) => H1.includes(x)) && !H1.includes("AIの窓口") && !H1.includes("日ごとの表"), H1.slice(0, 300));
  await back();
  const B0 = await into("データ・同期");
  t.check("データ・同期：バックアップ・復元・書き出しと取り込みが別の束（消す口は無い）",
    ["バックアップを保存", "バックアップを確かめる", "バックアップから復元", "自動バックアップから戻す", "書き出し", "取り込み", "この端末の中"]
      .every((x) => B0.includes(x)) && !B0.includes("データを消す"), B0.slice(0, 300));
  t.check("帯の題は「データ・同期」", (await page.locator(`${top} .js-nav-title`).innerText()).trim() === "データ・同期");
  const BO = await into("書き出し");
  t.check("書き出しの一枚はタブごと（daily・notes・health）。同じ行がタブの一枚にもある",
    ["バックアップを保存", "期間を選んで書き出す", "年の本", "ノートを書き出す", "目次をコピー", "記録を書き出す", "AIに分析してもらう"]
      .every((x) => BO.includes(x)), BO.slice(0, 300));
  await back();
  const BI = await into("取り込み");
  t.check("取り込みの一枚はタブごと（日記・問いの元・ノート・予定・ヘルスケア）",
    ["日記を取り込む", "問いの元を取り込む", "外部アプリから取り込む", "ヘルスケアから取り込む"].every((x) => BI.includes(x)), BI.slice(0, 300));
  await back();
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
  const parts = await page.evaluate(async () => {
    KN.store.update((s) => { s.todos.push({ id: "t-errlog", title: "大きさの試験の中身" }); });
    await new Promise((r) => setTimeout(r, 1200));
    return KN.errlog.text().split("\n").find((l) => l.startsWith("記録 ")) || "";
  });
  t.check("コピーに記録の大きさと大きい棚の字数（鍵の名前と数だけ・中身は出さない）",
    /^記録 \d+字 \| \w+ \d+/.test(parts) && !parts.includes("大きさの試験の中身"), parts);
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
  t.check("根っこの「連携・ヘルプ」の右にエラーの数", /連携・ヘルプ[\s\S]*2件/.test(await page.locator(top).innerText()));
  await into("連携・ヘルプ");
  const errRow = rowOf("エラーの記録");
  t.check("general に「エラーの記録」と件数", /2件/.test(await errRow.innerText()), await errRow.innerText());
  await errRow.click();
  await page.waitForSelector(`${top} .js-err-row`);
  const E2 = await page.locator(top).innerText();
  t.check("一覧に文・画面・ファイルと行が見える（コピーの前に中身が見える）",
    E2.includes("一覧に出るエラー") && E2.includes("screen-list.js:12"), E2.slice(0, 200));
  await rowOf("コピー").click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  t.check("コピーすると、一覧の中身が字になる", clip.includes("一覧に出るエラー") && clip.includes("screen-list.js:12"), clip.slice(0, 120));
  /* 端末の事実（roadmap-seamless の N9）：版・効く機能と最後の5回の起動。時間だけで、日付は残さない。 */
  t.check("コピーの頭に端末の事実（版・ホーム画面・persisted・field-sizing・text-autospace）",
    /^版 \S+ \| ホーム画面 [○×] \| persisted [○×?] \| field-sizing [○×] \| text-autospace [○×]/.test(clip), clip.split("\n")[0]);
  t.check("最後の起動（入口・組み終わりの時間）がコピーに出る", /起動 (ネット|控え|\?) \| 入口 \d+ms \| 組み終わり \d+ms/.test(clip),
    clip.split("\n").slice(0, 3).join(" / "));
  const L = await page.evaluate(() => {
    const a = KN.errlog.launches();
    for (let i = 0; i < 7; i++) a.push({ from: "net", entry: 1, built: 2, reload: false });
    localStorage.setItem(KN.errlog.LAUNCH_KEY, JSON.stringify(a));
    return { raw: localStorage.getItem(KN.errlog.LAUNCH_KEY) };
  });
  t.check("起動の控えは時間だけ（日付・画面を持たない）", !/"at"|"screen"|"day"/.test(L.raw), L.raw.slice(0, 120));
  await page.reload();
  await page.waitForFunction(() => KN.errlog && KN.errlog.launches().length === 5 && KN.errlog.launches()[4].entry !== 1, null, { timeout: 5000 }).catch(() => {});
  const L2 = await page.evaluate(() => ({ n: KN.errlog.launches().length, last: KN.errlog.launches()[4],
    ex: KN.store.exportJSON().includes("組み終わり") || KN.store.exportJSON().includes("kaimono-note-launches") }));
  t.check("起動の控えは最後の5回だけ・読み直しを覚える・書き出しに乗らない", L2.n === 5 && L2.last && L2.last.reload === true && !L2.ex,
    JSON.stringify(L2));
  await openSettings("list");
  await into("連携・ヘルプ");
  await rowOf("エラーの記録").click();
  await page.waitForSelector(`${top} .js-err-row`);
  t.check("上限（50件）だけを一行で言う", E2.includes("50件まで"));
  await back();

  /* ---------------- 使用量（R24） ---------------- */
  await page.evaluate(() => {
    KN.store.addMeal({ day: KN.util.todayKey(), time: "12:00", slot: "lunch", items: [{ name: "試験" }],
      ai: { kcal: 500, raw: "あ".repeat(3000), analysis: "い".repeat(1500) } });
  });
  await openSettings("list");
  await rowOf("データ・同期").click();
  await page.waitForFunction(() => /この端末の中/.test(document.querySelector(".set-layer:last-child").innerText));
  const U1 = await page.locator(top).innerText();
  t.check("使用量に AI の原文の字数が並ぶ", /AI の原文/.test(U1), (U1.match(/この端末の中[^\n]*/) || [""])[0]);
  t.check("iPhone の枠の何割か（目安）を言う", /iPhone の枠（約260万字）の(1割未満|約\d+割)/.test(U1));
  t.check("6割に届かなければ「大きくなってきました」は出ない", !U1.includes("記録が大きくなってきました"));
  await back();
  const big = await page.evaluate(() => {
    const real = KN.backup.usage;
    KN.backup.usage = () => ({ ...real(), liveChars: 1700000, where: "idb" });
    return true;
  });
  await rowOf("データ・同期").click();
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

  const bad = errors.filter((e) => !/試験のエラー|試験の断り/.test(e));
  t.check("（わざと投げたもののほか）ページのエラーなし", !bad.length, bad.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
