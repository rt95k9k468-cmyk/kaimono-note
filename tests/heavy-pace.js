/* 大きな記録での重さ（2026年10月8日の総点検。docs/log/inspection.md）。
   1年ぶんの記録（約183万字。いまの約3.5倍）を作って、保存一回・開く（CPU 4倍遅）・タブを替える・
   daily に初めて入るときの様式の計算・じっと5秒（昼の各タブと、夜の tasks。夜は寝ている人の z Z が
   出る）を測る。
   **門にも run-all にも入れない**（frame-pace.js と同じ。数字は機械で揺れる目安）。直す前と後で手で
   回し、数を inspection.md に書く。落とすのはエラーが出たときだけ。試験のブラウザ（Chromium）の
   数字で、iPhone の Safari とは違う。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/heavy-pace.js（約2分） */
const { open, checker } = require("./lib");

/* 昼は時計を止めず、いまが13時台になる時間帯で開く（止めた時計では performance.now と最初の描画が
   取れない）。夜は2時に止めて読み直す（道の外＝寝ている人が出る）。 */
function dayZone() {
  const off = ((13 - new Date().getUTCHours() + 36) % 24) - 12;
  return off === 0 ? "UTC" : `Etc/GMT${off > 0 ? "-" : "+"}${Math.abs(off)}`;
}

/* 1年ぶん：日記 1,500字・記録3件・体重・食事3つ／品物150・店3・値段180／用事400（360済み）／買うもの40 */
function fill() {
  const S = KN.store;
  const pad = (n) => String(n).padStart(2, "0");
  const dk = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const base = "今日は朝から雨で、駅まで歩くあいだに靴が濡れた。昼は同僚と蕎麦を食べ、午後は資料を直した。帰りに八百屋で大根と葱を買う。";
  const memo = base.repeat(Math.ceil(1500 / base.length)).slice(0, 1500);
  const start = new Date(); start.setDate(start.getDate() - 364);
  const st = ["スーパー", "ドラッグストア", "八百屋"].map((n) => S.addStore(n));
  const prods = Array.from({ length: 150 }, (_, i) => S.addProduct({ name: `品物${i}`, categoryId: "" }));
  for (let i = 0; i < 365; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const day = dk(d);
    S.setDayLog(day, { memo });
    for (let k = 0; k < 3; k++) S.addEntry({ date: day, type: "done", title: `散歩 ${k}` });
    S.addWeight({ day, time: "07:00", kg: 60 + (i % 7) / 10 });
    for (const slot of ["breakfast", "lunch", "dinner"]) {
      S.addMeal({ day, time: null, slot, items: [{ name: "ごはん", kcal: 250 }, { name: "味噌汁", kcal: 60 }] });
    }
    if (i % 2 === 0) S.addPrice(prods[(i * 7) % 150].id, { storeId: st[i % 3].id, price: 100 + (i % 50), amount: 1, date: day });
  }
  for (let i = 0; i < 400; i++) {
    const d = new Date(start); d.setDate(start.getDate() + Math.floor(i * 365 / 400) + 1);
    const t = S.addTodo({ title: `用事 ${i}`, due: dk(d) });
    if (t && i < 360) S.toggleTodo(t.id);
  }
  prods.slice(0, 40).forEach((p) => S.addItem(p.id));
  S.flush();
  return S.liveChars();
}

(async () => {
  const c = checker("heavy-pace");
  const { browser, ctx, page, errors } = await open({ timezoneId: dayZone() });
  const t0 = Date.now();
  const chars = await page.evaluate(fill);
  console.log(`  1年ぶんの記録：元の字数 ${chars}（作るのに ${((Date.now() - t0) / 1000).toFixed(1)}秒）`);

  // 保存一回（元へまるごと書く）。書き換えてから、書くところだけを測る
  const save = await page.evaluate(() => Array.from({ length: 5 }, (_, i) => {
    KN.store.update((s) => { s.archive.days[0].memo += String(i); });
    const a = performance.now();
    KN.store.saveNow();
    return Math.round(performance.now() - a);
  }));
  console.log(`  保存一回（CPU 1倍）：${save.join("・")} ms`);
  await page.waitForTimeout(1500);   // 写し（1秒に一度）を待つ

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const diff = (a, b, k) => Math.round((b[k] - a[k]) * (k.endsWith("Duration") ? 1000 : 1));

  // 開く（CPU 4倍遅）
  await page.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration))))
      .observe({ type: "longtask", buffered: true });
    const iv = setInterval(() => { if (window.KN && KN.app && KN.store) { window.__ready = performance.now(); clearInterval(iv); } }, 5);
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.reload();
  await page.waitForFunction(() => window.__ready);
  await page.waitForTimeout(2500);
  const boot = await page.evaluate(() => ({
    ready: Math.round(window.__ready), long: window.__long.slice(),
    fcp: Math.round((performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0),
  }));
  console.log(`  開く（CPU 4倍遅）：準備 ${boot.ready}ms・最初の絵 ${boot.fcp}ms・長い仕事 合計 ${boot.long.reduce((x, y) => x + y, 0)}ms（最大 ${Math.max(0, ...boot.long)}ms）`);

  // タブを替える（CPU 4倍遅）。押してから2フレームまで
  const tabs = [];
  for (const tab of ["list", "diet", "archive", "todo"]) {
    const ms = await page.evaluate(async (tab) => {
      const a = performance.now();
      document.querySelector(`#tabbar .tab-${tab}`).click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return Math.round(performance.now() - a);
    }, tab);
    tabs.push(`${tab} ${ms}ms`);
    await page.waitForTimeout(1200);
  }
  console.log(`  タブを替える（CPU 4倍遅・押して2フレーム）：${tabs.join("・")}`);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  // daily に初めて入る（CPU 1倍）。様式の計算の回数と、延べの要素（inspection.md の 1）
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.app);
  await page.waitForTimeout(1500);
  await page.click("#tabbar .tab-list");
  await page.waitForTimeout(1200);
  const m0 = await metrics();
  await browser.startTracing(page, { categories: ["devtools.timeline"] });
  await page.click("#tabbar .tab-archive");
  await page.waitForTimeout(1500);
  const trace = JSON.parse((await browser.stopTracing()).toString());
  const m1 = await metrics();
  const ult = (trace.traceEvents || trace).filter((e) => e.name === "UpdateLayoutTree" && e.ph === "X");
  const els = ult.reduce((s, e) => s + ((e.args && (e.args.elementCount || (e.args.endData && e.args.endData.elementCount))) || 0), 0);
  console.log(`  daily に初めて入る（CPU 1倍）：仕事 ${diff(m0, m1, "TaskDuration")}ms・様式の計算 ${ult.length}回（延べ ${els}要素・${diff(m0, m1, "RecalcStyleDuration")}ms）`);

  // じっと5秒（CPU 1倍）：昼の各タブ、夜の tasks（inspection.md の 2）
  const still = async () => {
    const a = await metrics();
    await page.waitForTimeout(5000);
    const b = await metrics();
    return `${diff(a, b, "TaskDuration")}ms（配置 ${diff(a, b, "LayoutCount")}回・様式 ${diff(a, b, "RecalcStyleCount")}回）`;
  };
  const day = [];
  for (const tab of ["todo", "list", "diet", "archive"]) {
    await page.click(`#tabbar .tab-${tab}`);
    await page.waitForTimeout(1500);
    day.push(`${tab} ${await still()}`);
  }
  console.log(`  じっと5秒 昼：${day.join("・")}`);
  await page.clock.setFixedTime(await page.evaluate(() => new Date().setHours(2, 0, 0, 0)));
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.app);
  await page.click("#tabbar .tab-todo");
  await page.waitForTimeout(1500);
  const snore = await page.evaluate(() => document.getAnimations()
    .filter((x) => x.animationName === "road-snore" && x.playState === "running").length);
  console.log(`  じっと5秒 夜の todo：${await still()}（いびきの動き ${snore} 本）`);

  c.check("エラー0", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})().catch((e) => { console.error(e); process.exit(1); });
