/* 大きな記録での重さ（2026年10月8日の総点検。docs/log/inspection.md）。
   1年ぶんの記録（約183万字。いまの約3.5倍）を作って、保存一回・開く（CPU 4倍遅）・タブを替える・
   daily に初めて入るときの様式の計算・じっと5秒（人が歩き終わってから。昼の各タブと、夜の tasks。夜は寝ている人の z Z が
   出る。三回で止んだあとも）を測る。
   **門にも run-all にも入れない**（frame-pace.js と同じ。数字は機械で揺れる目安）。直す前と後で手で
   回し、数を inspection.md に書く。**前の点検の数と比べるときは、前の版も同じ機械で回す**（機械が違うと
   2倍以上ずれる。10月27日）。落とすのはエラーが出たときだけ。試験のブラウザ（Chromium）の
   数字で、iPhone の Safari とは違う。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/heavy-pace.js（約2分）
   **SWEEP=1 を付けると、押せるもの全部を一巡り**（約12分。2026年11月10日）：五つの席・価格・設定で、見えている押せるものを
   種類ごとに一つずつ本物の指で押し、開いた紙の中も一巡りして、押して絵まで（Event Timing）と、その一手で紙（`.tl-sheet`）を
   組んだ回数を出す。MINMS=100 より遅い手と、二度以上組んだ手だけを並べる（二度組みは docs/traps.md の「store を書いたあとに」）。
   消す・書き出す・つなぐ類は押さない。SCREENS=todo,diet で席を絞る。 */
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

/* 頁の中：見えている押せるものを、種類（タグと class。セグメント・席・札は名前も）ごとに一つずつ。 */
function targets(scopeSel) {
  const SEL = 'button, a[href], [role="button"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="radio"], [role="switch"], summary, select, input:not([type="hidden"]):not([type="file"]), textarea';
  const scope = scopeSel ? [...document.querySelectorAll(scopeSel)].pop() : document;
  const seen = new Map();
  for (const el of scope ? scope.querySelectorAll(SEL) : []) {
    if (el.disabled || el.closest("[inert]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter((k) => k && !/^(is|has)-/.test(k)).slice(0, 3).join(".") : "";
    const sig = `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
    const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 16);
    const key = /seg|tab|chip|menu|set-/.test(sig) ? `${sig}｜${name}` : sig;
    if (!seen.has(key)) seen.set(key, { key, name, x, y, text: /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/checkbox|radio|range|date|time|color/.test(el.type || "") });
  }
  return [...seen.values()];
}

async function sweep(c) {
  const MINMS = Number(process.env.MINMS) || 100;
  const SCREENS = (process.env.SCREENS || "todo,list,archive,diet,notes,prices,settings").split(",");
  const SKIP = /消す|削除|書き出|取り込|共有|Dropbox|バックアップ|復元|控え|リセット|カレンダーに入れる|ファイル|写真|画像|PDF|通知|鍵|ロック|合言葉|中継|同期|つなぐ|読み直/;
  const { browser, ctx, page, errors } = await open({ touch: true, timezoneId: dayZone() });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  ctx.on("page", (p) => { if (p !== page) p.close().catch(() => {}); });
  console.log(`  1年ぶんの記録：元の字数 ${await page.evaluate(fill)}`);
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.app && KN.app.showScreen);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__ev = []; window.__built = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ev.push({ n: e.name, d: e.duration, s: e.startTime })))
      .observe({ type: "event", durationThreshold: 16 });
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType === 1 && n.classList.contains("tl-sheet")) window.__built.push(1);
    }))).observe(document.getElementById("panes"), { childList: true, subtree: true });
  });
  const hands = [];
  const hand = async (where, t, act, wait = 550) => {
    const mark = await page.evaluate(() => { window.__built.length = 0; return performance.now(); });
    try { await act(); } catch (_) { return; }
    await page.waitForTimeout(wait);
    hands.push({ where, key: t.key, name: t.name, ...(await page.evaluate((m) => {
      const top = window.__ev.filter((e) => e.s >= m - 1).sort((a, b) => b.d - a.d)[0];
      return { d: top ? top.d : 0, n: top ? top.n : "", built: window.__built.length };
    }, mark)) });
  };
  const sheets = () => page.evaluate(() => document.querySelectorAll(".sheet.is-open").length);
  const shut = () => page.evaluate(() => { const b = [...document.querySelectorAll(".sheet-backdrop.is-open")].pop(); if (b) b.click(); });
  const reset = async (id) => {
    for (let i = 0; i < 5 && await sheets(); i++) { await shut(); await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(450); }
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate((x) => {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (KN.app.closeFabMenu) KN.app.closeFabMenu();
      KN.app.showScreen(x);
    }, id);
    await page.waitForTimeout(450);
  };
  const sendTo = (id, top) => page.evaluate(([i, y]) => { const sc = KN.app.scrollerOf(document.getElementById(`screen-${i}`)); if (sc) sc.scrollTop = y; }, [id, top]);
  const type = async () => { await page.keyboard.type("あ"); await page.waitForTimeout(150); await page.keyboard.type("い"); };

  for (const id of SCREENS) {
    const done = new Set();
    for (const top of id === "diet" ? [0, 600, 1200, 1800, 2400] : [0, 600, 1200]) {
      await reset(id); await sendTo(id, top); await page.waitForTimeout(300);
      for (const t0 of (await page.evaluate(targets, null)).filter((t) => !done.has(t.key) && !SKIP.test(t.name))) {
        done.add(t0.key);
        await sendTo(id, top); await page.waitForTimeout(120);
        const t = (await page.evaluate(targets, null)).find((x) => x.key === t0.key);
        if (!t) continue;
        const before = await sheets();
        await hand(id, t, () => page.touchscreen.tap(t.x, t.y));
        if (t.text) await hand(`${id} 打つ`, t, type, 500);
        const after = await sheets();
        /* 開いた紙の中も一巡り（紙が閉じたら終わり。重ねて開いた紙は一枚だけ戻す）。 */
        for (const s0 of after > before && id !== "settings" ? (await page.evaluate(targets, ".sheet.is-open")).filter((x) => !SKIP.test(x.name)).slice(0, 22) : []) {
          if ((await sheets()) !== after) break;
          const s = (await page.evaluate(targets, ".sheet.is-open")).find((x) => x.key === s0.key);
          if (!s) continue;
          await hand(`${id} › ${t.name}`, s, () => page.touchscreen.tap(s.x, s.y), 500);
          if (s.text) await hand(`${id} › ${t.name} 打つ`, s, type, 450);
          if ((await sheets()) > after) { await shut(); await page.waitForTimeout(450); }
          await page.keyboard.press("Escape").catch(() => {});
        }
        await reset(id);
      }
    }
    console.log(`  ${id}：${done.size} 種`);
  }
  const slow = hands.filter((h) => h.d >= MINMS).sort((a, b) => b.d - a.d);
  const twice = hands.filter((h) => h.built > 1);
  console.log(`  押して絵まで（CPU 1倍）：${hands.length} 手・${MINMS}ms 以上 ${slow.length} 手・いちばん遅い ${Math.round(Math.max(0, ...hands.map((h) => h.d)))}ms`);
  slow.slice(0, 40).forEach((h) => console.log(`    ${String(Math.round(h.d)).padStart(4)}ms ${h.n}  ${h.where}｜${h.key.slice(0, 60)}「${h.name}」`));
  console.log(`  一手で紙を二度以上組んだ手：${twice.length}`);
  twice.forEach((h) => console.log(`    ${h.built}回  ${h.where}｜${h.key.slice(0, 60)}「${h.name}」`));
  c.check("押せるものが集まった", hands.length > 30, String(hands.length));
  c.check("エラーなし", errors.length === 0, [...new Set(errors)].slice(0, 8).join("\n"));
  await browser.close();
  c.done();
}

(async () => {
  const c = checker("heavy-pace");
  if (process.env.SWEEP) return sweep(c);
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
  /* 測りはじめるのは、人が歩き終わってから（tasks を開くと「いま」まで約1.5秒歩く。day-road.js の walk）。
     決め打ちの待ちだと歩きの尾を拾い、じっとしていない数になった（2026年10月27日）。
     list・diet でときどき出る 200〜500ms はブラウザの GC（前の組み直しのゴミ）で、アプリの仕事ではない。 */
  const still = async () => {
    await page.waitForFunction(() => ![...document.querySelectorAll(".day-road .road-me")].some((m) => m.__walk),
      null, { timeout: 10000 });
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
  /* いびきは三回で止まる（10月8日・inspection.md の 2）。止んだあとのじっと5秒も。 */
  await page.waitForFunction(() => !document.getAnimations().some((x) => /^road-snore/.test(x.animationName)), null, { timeout: 15000 });
  console.log(`  じっと5秒 夜の todo（いびきが止んだあと）：${await still()}`);

  c.check("エラー0", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})().catch((e) => { console.error(e); process.exit(1); });
