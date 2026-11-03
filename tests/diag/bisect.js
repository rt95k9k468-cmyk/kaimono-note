/* DIAG（一時）：WebKit 26.6 の ThreadedCompositor の segfault（「暦を払う」）の引き金の CSS を絞る。
   アプリは変えない。頁に <style> を足して一つずつ外し、落ちるか見る（外して落ちなくなれば、それが引き金の側）。
   repro-* はアプリを使わない最小の頁（tests/diag/repro.html）。
   走らせ方：KN_BROWSER=webkit node tests/diag/bisect.js [名前…]（既定は全部・各 KN_TRIES 回） */
const { open, URL } = require("../lib");

/* 1回目（run #2）：見た目の CSS をどれ外しても落ち、動き（transition・animation）を全部止めたときだけ落ちない。
   指を離さなければ落ちない。→ 離したあと（月の組み直し）に走る動きを一つずつ外す／一つだけ残す。 */
const OFF = "*,*::before,*::after{transition:none!important;animation:none!important}";
const SDA = ".tl-sheet:not(.is-bare)>.tl-grip::after,.wk-faces::after{animation:edge-in linear both!important;animation-timeline:scroll(nearest block)!important;animation-range:0 var(--sp-6)!important}";
const V = [
  ["base", ""],
  ["no-anim", OFF],
  ["no-sda", ".tl-grip::after,.wk-faces::after{animation:none!important}"],
  ["no-roll", ".topbar-title .roll>.roll-in,.topbar-title .roll::before{animation:none!important}"],
  ["no-sheet", ".tl-sheet{transition:none!important}"],
  ["no-row", ".tl-row{transition:none!important}"],
  ["no-ring", ".cal-ring{transition:none!important}"],
  ["no-road", ".road-bead{animation:none!important}"],
  ["no-color", ".day-d,.cal-day{transition:none!important}"],
  ["only-sda", OFF + SDA],
  ["only-roll", OFF + ".topbar-title .roll>.roll-in{animation:roll-in var(--m-roll) var(--ease-out) var(--roll-d) both!important}.topbar-title .roll::before{animation:roll-out var(--m-roll) var(--ease-out) var(--roll-d) both!important}"],
  ["only-sheet", OFF + ".tl-sheet{transition:transform var(--dur) var(--ease-out),opacity var(--dur) var(--ease-out)!important}.tl-sheet.is-from-left,.tl-sheet.is-from-right{transition:none!important}"],
  ["repro-sda", "sda=1&sheet=1"],
  ["repro-sda-nosheet", "sda=1&sheet=0"],
  ["repro-sda-off", "sda=0&sheet=1"],
];

const T0 = Date.now();
const log = (s) => console.log(`[+${((Date.now() - T0) / 1000).toFixed(1)}s] ${s}`);
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function alive(page) {
  return Promise.race([page.evaluate(() => 1).then(() => true, () => false), wait(4000).then(() => false)]);
}

async function app(page, css, mode) {
  await page.evaluate(() => {
    const S = KN.store;
    for (let h = 6; h < 22; h++) S.addTodo({ title: `予定 ${h}`, due: "2026-09-15", time: `${String(h).padStart(2, "0")}:00`, minutes: 30 });
    for (let i = 0; i < 6; i++) S.addTodo({ title: `これから ${i}` });
    S.setCalPref(null, { shown: true, open: true });
  });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(2500);
  if (!(await alive(page))) return "setup";
  // 試験の台本と同じく、毎フレーム行の位置を読む
  await page.evaluate(() => {
    const tick = () => { const e = document.querySelector("#screen-todo .item-name"); if (e) e.getBoundingClientRect(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const b = await page.$eval("#head .cal .cal-grid", (g) => { const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  for (const [i, dx] of [220, -220, 220, -220].entries()) {
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) { await page.mouse.move(b.x + dx * k / 10, b.y); await page.waitForTimeout(16); }
    await page.waitForTimeout(600);
    if (!(await alive(page))) return `drag${i + 1}`;
    if (mode === "drag") { await page.mouse.move(b.x, b.y); await page.mouse.up(); await page.waitForTimeout(1500); return (await alive(page)) ? "OK" : "drag-back"; }
    await page.mouse.up();
    await page.waitForTimeout(1500);
    if (!(await alive(page))) return `release${i + 1}`;
  }
  return "OK";
}

async function attempt([name, arg, mode]) {
  const repro = name.startsWith("repro");
  const r = await open({
    before: async (cx, p) => {
      await p.clock.setFixedTime(new Date(2026, 8, 15, 10, 0));
      if (!repro && arg) await cx.addInitScript((css) => {
        document.addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
        });
      }, arg);
    },
  });
  const { browser, page } = r;
  let crashed = false;
  page.on("crash", () => { crashed = true; });
  let res;
  try {
    if (repro) {
      await page.goto(URL.replace("index.html", `tests/diag/${name.startsWith("repro-sda") ? "repro-sda" : "repro"}.html?${arg}`));
      const t = Date.now();
      res = "OK";
      while (Date.now() - t < 20000) {
        await wait(1000);
        if (!(await alive(page))) { res = "died"; break; }
        if (await page.evaluate(() => window.__done).catch(() => false)) break;
      }
    } else {
      res = await Promise.race([app(page, arg, mode), wait(60000).then(() => "timeout")]);
    }
  } catch (e) { res = "error:" + String(e).split("\n")[0].slice(0, 120); }
  if (crashed && res === "OK") res = "crash-late";
  await Promise.race([browser.close().catch(() => {}), wait(5000)]);
  return res + (crashed ? " [crash]" : "");
}

(async () => {
  const want = process.argv.slice(2);
  const tries = Number(process.env.KN_TRIES || 3);
  const rows = [];
  for (const v of V) {
    if (want.length && !want.includes(v[0])) continue;
    const got = [];
    for (let i = 0; i < tries; i++) { const g = await attempt(v); got.push(g); log(`${v[0]} #${i + 1}: ${g}`); }
    rows.push(`${v[0].padEnd(15)} ${got.join(" | ")}`);
  }
  console.log("##### SUMMARY（OK=落ちない。drag/release の番号は何回目の払いで止まったか）");
  rows.forEach((r) => console.log(r));
  process.exit(0);
})();
