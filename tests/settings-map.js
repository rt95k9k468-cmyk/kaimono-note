/* 設定の 入口 → 中身（2026年11月5日の作り直し。docs/settings.md「設定は 入口 → 中身 の二段」）。

   - 根っこは九つの入口で、どの歯車から開いても同じ並び。
   - 前から持っている設定の値（既定でない値）が、移した先の一枚でそのまま読める（鍵は一つも変えていない）。
   - 「›」の先の一枚が全部組める（エラーなし・帯に題）。見て回るだけでは記録を書き換えない。
   - 開いて閉じる・潜って戻るを繰り返しても、紙が残らない・行が二重にならない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/settings-map.js */
const { open, checker } = require("./lib");

const ENTRIES = ["表示・操作", "通知・プライバシー", "daily", "notes", "tasks", "shopping", "health", "データ・同期", "連携・ヘルプ"];

(async () => {
  const t = checker("settings-map");
  const { browser, page, errors } = await open();
  const top = ".set-layer:last-child";
  const still = () => page.waitForFunction(() => !document.querySelector(".set-layer.is-edge-lift"));
  const openSettings = async (from) => {
    await page.evaluate((x) => KN.app.showScreen(x), from);
    await page.waitForFunction((x) => KN.app.activeScreen() === x, from);
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
    await page.waitForTimeout(200);
  };
  const entries = () => page.$$eval(`${top} .set-row.has-lead .set-title`, (ts) => ts.map((x) => x.firstChild.textContent.trim()).join());
  const go = async (id) => {
    const n = await page.locator(".set-layer").count();
    await page.evaluate((x) => KN.settingsParts.go(x), id);
    await page.waitForFunction((k) => document.querySelectorAll(".set-layer").length > k, n);
    await still();
    await page.waitForTimeout(150);
  };
  const back = async () => {
    const n = await page.locator(".set-layer").count();
    await still();
    await page.locator(`${top} .set-back`).click();
    await page.waitForFunction((k) => document.querySelectorAll(".set-layer").length < k, n);
    await still();
    await page.waitForTimeout(150);
  };
  /** 一枚の中の行：題 → 値（スイッチは "on"/"off"）。 */
  const rows = () => page.$$eval(`${top} .set-row`, (rs) => Object.fromEntries(rs.map((r) => {
    const title = r.querySelector(".set-title");
    const name = title ? (title.firstChild ? title.firstChild.textContent : title.textContent).trim() : "";
    const sw = r.getAttribute("aria-checked");
    const val = r.querySelector(".set-val, .set-time");
    return [name, sw !== null ? (sw === "true" ? "on" : "off") : (val ? val.textContent.trim() : "")];
  })));

  /* ---- 根っこ ---- */
  for (const from of ["todo", "archive", "notes", "list", "prices", "diet"]) {
    await openSettings(from);
    t.check(`${from} の歯車：入口は九つで同じ並び`, (await entries()) === ENTRIES.join(), await entries());
  }

  /* ---- 既定でない値を置いて、読み直してから見る ---- */
  await page.evaluate(() => KN.store.update((s) => {
    Object.assign(s.settings, {
      diaryView: "page", dailyScope: "month", logFull: false, logLines: 3, showThen: false, showDayTimes: false,
      showSeason: false, seasonArt: false, showDigest: true, digestPos: "top",
      notesOrder: "created", notesSeasonArt: false, noteRoad: true,
      todoTimeline: true, todoRoadAt: "below", dayStart: "06:30", dayEnd: "22:00",
      reviewDays: { next: 7, wait: 14, someday: 90 },
      showLow: true, showInsight: true, dietAutoSync: false,
    });
  }));
  await page.evaluate(() => KN.store.flush());
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => JSON.stringify(KN.store.get().settings));

  await openSettings("todo");
  await go("daily");
  const d = await rows();
  t.check("daily：日記は一枚・出す範囲は月ぜんぶ・行数は3行", d["日記"] === "一枚" && d["出す範囲"] === "月ぜんぶ" && d["行数"] === "3行", JSON.stringify(d));
  t.check("daily：あの日・起床就寝・ひとこと・季節の絵は切、まとめは上",
    d["「あの日」を出す"] === "off" && d["起床・就寝の時刻"] === "off" && d["季節のひとこと"] === "off" && d["季節の絵"] === "off"
      && d["月のまとめ"] === "on" && d["まとめの位置"] === "上", JSON.stringify(d));
  await back();
  await go("notes");
  const n = await rows();
  t.check("notes：並びは作った日・季節の絵は切・「道に置く」の行は無い", n["並び"] === "作った日" && n["季節の絵"] === "off" && !("「道に置く」を出す" in n),
    JSON.stringify(n));
  await back();
  await go("tasks");
  const k = await rows();
  t.check("tasks：一日の道は下・始まり 6:30・終わり 22:00", k["一日の道"] === "時間割の下" && k["一日の始まり"] === "6:30" && k["一日の終わり"] === "22:00",
    JSON.stringify(k));
  t.check("tasks：見直す間隔は 1週・2週・3か月（その場で選ぶ行）", k["これから"] === "1週" && k["待つ"] === "2週" && k["いつか"] === "3か月", JSON.stringify(k));
  await back();
  await go("shopping");
  t.check("shopping：「そろそろ切れそう」は入", (await rows())["「そろそろ切れそう」を出す"] === "on");
  await back();
  await go("health");
  const h = await rows();
  t.check("health：「気づいたこと」は入・自動で取り込むは切", h["「気づいたこと」を出す"] === "on" && h["開いたら自動で取り込む"] === "off", JSON.stringify(h));
  await back();

  /* ---- 「›」の先の一枚が全部組める ---- */
  /* 一つのノートブック・タグ（noteLabel）は選んでから。タグの一覧は、タグが一つも無いと入口の行ごと出ない（空の一枚には行けない）。 */
  const ids = await page.evaluate(() => Object.keys(KN.settingsParts.PAGES).filter((x) => x !== "noteLabel" && x !== "notesTags"));
  const bad = [];
  for (const id of ids) {
    await go(id);
    const title = (await page.locator(`${top} .js-nav-title`).innerText()).trim();
    const body = await page.locator(`${top} .js-body`).evaluate((b) => b.children.length);
    if (!title || !body) bad.push(`${id}:${title}:${body}`);
    await back();
  }
  t.check(`「›」の先は ${ids.length} 枚とも組める（帯に題・中身がある）`, !bad.length, bad.join(" "));
  t.check("見て回るだけでは設定を書き換えない", (await page.evaluate(() => JSON.stringify(KN.store.get().settings))) === before);

  /* ---- 開いて閉じる・潜って戻るを繰り返す ---- */
  for (let i = 0; i < 6; i++) {
    await openSettings(["todo", "notes", "diet"][i % 3]);
    await go(["daily", "data", "privacy"][i % 3]);
    await page.evaluate(() => KN.store.update((s) => { s.settings.showThen = !s.settings.showThen; }));   // 組み直しを起こす
    await page.waitForTimeout(100);
    await page.evaluate(() => KN.app.backScreen());
    await page.waitForTimeout(400);
  }
  await openSettings("todo");
  const after = await page.evaluate(() => ({
    layers: document.querySelectorAll("#screen-settings .set-layer").length,
    entries: document.querySelectorAll("#screen-settings .set-layer .set-row.has-lead").length,
  }));
  t.check("繰り返しても、開けば根っこ一枚・入口は九つのまま", after.layers === 1 && after.entries === 9, JSON.stringify(after));

  /* X4：連携・ヘルプにショートカットの作り方（Apple の端末だけ・畳んで三つ・中継所のURLは出さない）。 */
  await page.evaluate(() => { KN.ics.apple = () => true; KN.app.showScreen("settings"); KN.screens.settings.goTo([{ id: "" }, { id: "help" }]); });
  await page.waitForTimeout(500);
  const rec = await page.evaluate(() => {
    const L = [...document.querySelectorAll("#screen-settings .set-layer")].pop();
    const m = [...L.querySelectorAll("details.set-more")];
    return { sums: m.map((d) => d.querySelector("summary").textContent.trim()), open: m.some((d) => d.open), text: L.textContent };
  });
  t.check("ショートカットの作り方は畳んで三つ", rec.sums.join() === "店に着いたら買うもの,寝る前に日記,Apple Watch から足す" && !rec.open, rec.sums.join());
  t.check("作り方に中継所のURLは出さない", !/workers\.dev|https?:\/\//.test(rec.text));

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
