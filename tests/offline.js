/* 電波なしで開けるか（R21）。

   ほかの台本はどれも Service Worker を止めて開く（lib.js）。だから「電波の無いときに
   開けるか」は、どれも見ていなかった。ここだけ止めずに開く。

   **アプリを開かずに Service Worker だけを入れる**（manifest の頁から register する）。
   アプリを先に開くと、Service Worker が「ネットで取ったものも控えに足す」ので、
   ASSETS に足し忘れたファイルも最初の読み直しで埋まり、足し忘れが見えなくなる
   （一度そうして通ってしまった）。入れたばかりの控え＝ ASSETS ぶんだけで、
   ctx.setOffline(true) → アプリを開く → js・css がどれも控えから・4タブが出る・
   エラー0・書いて読み直しても残る。

   sw.js の install は `Promise.allSettled` で入れるので、ASSETS に在るのに取れない
   ファイルがあっても黙って飛ばす。控えの中身も一つずつ突き合わせる。

   電波の切り方：ctx.setOffline(true) だけでは、Service Worker 自身の fetch は外へ出て
   しまう（足し忘れのファイルを、電波なしのはずがネットから取ってきて通った）。だから
   この台本だけ**自分のサーバー**（8767、ほかの台本と別の origin）を立て、切るときは
   サーバーごと落とす。 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { checker, ROOT } = require("./lib");

const PORT = 8767;
const APP = `http://localhost:${PORT}/index.html`;
function alive() {
  return new Promise((ok) => {
    const req = http.get(APP, (res) => { res.resume(); ok(res.statusCode === 200); });
    req.on("error", () => ok(false));
    req.setTimeout(1000, () => { req.destroy(); ok(false); });
  });
}
async function startServer() {
  const srv = spawn("python3", ["-m", "http.server", String(PORT), "--directory", ROOT], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await alive()) return srv;
  }
  srv.kill();
  throw new Error(`サーバーが立ち上がらない（${PORT}）`);
}

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const assets = [...read("sw.js").match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
const index = read("index.html");
/* index.html が開くときに読むもの（apple-touch-icon はホーム画面に置くときだけ）。 */
const needs = [
  ...[...index.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]),
  ...[...index.matchAll(/<link rel="(?:stylesheet|icon|manifest)" href="([^"]+)"/g)].map((m) => m[1]),
];

const TABS = ["archive", "todo", "list", "diet"];

(async () => {
  if (await alive()) throw new Error(`${PORT} がもう使われている（前の試験の残り？）`);
  const server = await startServer();
  const t = checker("offline");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // 週に一度の控えのトーストは止める（lib.js の open() と同じ）
  await ctx.addInitScript(() => { try { localStorage.setItem("kn-export-nudge", "9999-12-31"); } catch (_) {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push(`CSP: ${m.text().slice(0, 200)}`);
  });

  /* ---- Service Worker だけを入れる（アプリの頁は開かない） ---- */
  await page.goto(new URL("manifest.webmanifest", APP).href);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
  });
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith("kaimono-note-"));
    const out = [];
    for (const n of names) {
      (await (await caches.open(n)).keys()).forEach((r) => out.push(new URL(r.url).pathname.replace(/^\//, "") || "./"));
    }
    return { names, paths: out };
  });
  t.check("控えは一つ（kaimono-note-…）", cached.names.length === 1, cached.names.join(", "));
  const notCached = assets.filter((a) => !cached.paths.includes(a));
  t.check(`ASSETS（${assets.length}）がどれも控えに入った`, !notCached.length, notCached.join(", "));
  const notNeeded = needs.filter((a) => !cached.paths.includes(a));
  t.check(`index.html が読むもの（${needs.length}）がどれも入れたばかりの控えにある`, !notNeeded.length,
    notNeeded.join(", "));

  /* ---- 電波を切って、初めてアプリを開く ---- */
  server.kill();
  for (let i = 0; i < 30 && await alive(); i++) await new Promise((r) => setTimeout(r, 100));
  await ctx.setOffline(true);
  const served = new Map();
  page.on("response", (r) => {
    const p = new URL(r.url()).pathname.replace(/^\//, "");
    if (/^(js|css)\//.test(p)) served.set(p, `${r.status()}${r.fromServiceWorker() ? "" : " ネットから"}`);
  });
  await page.goto(APP);
  const booted = await page.waitForFunction(() => window.KN && KN.store && KN.app,
    null, { timeout: 15000 }).then(() => true, () => false);
  t.check("電波なしで KN が立ち上がる", booted);
  if (!booted) { t.check("エラー0", !errors.length, errors.join(" / ")); await browser.close(); t.done(); return; }
  await page.waitForTimeout(300);
  t.check("電波が切れている（navigator.onLine が false）", !(await page.evaluate(() => navigator.onLine)));
  t.check("Service Worker の控えから開いた（controller あり）",
    await page.evaluate(() => !!navigator.serviceWorker.controller));
  const need = needs.filter((a) => /^(js|css)\//.test(a));
  const bad = need.filter((a) => served.get(a) !== "200").map((a) => `${a}（${served.get(a) || "来ない"}）`);
  t.check(`js・css（${need.length}）がどれも控えから 200`, !bad.length, bad.join(", "));

  for (const id of TABS) {
    await page.evaluate((x) => KN.app.showScreen(x), id);
    await page.waitForFunction((x) => {
      const s = document.getElementById(`screen-${x}`);
      return s && !s.hidden && s.classList.contains("is-active");
    }, id, { timeout: 5000 }).catch(() => {});
    const r = await page.evaluate((x) => {
      const s = document.getElementById(`screen-${x}`);
      const box = s.getBoundingClientRect();
      return { shown: !s.hidden, kids: s.querySelectorAll("*").length, w: box.width, h: box.height };
    }, id);
    t.check(`電波なしで ${id} が描ける`, r.shown && r.kids > 10 && r.w > 300 && r.h > 300, JSON.stringify(r));
  }

  /* 書いて、電波なしのまま読み直しても残る。 */
  const title = "電波なしの試験の用事";
  await page.evaluate((x) => { KN.store.addTodo({ title: x, due: KN.util.todayKey() }); KN.store.flush(); }, title);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  t.check("電波なしで書いたものが読み直しても残る",
    await page.evaluate((x) => KN.store.get().todos.some((d) => d.title === x), title));

  t.check("エラー0", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => { try { spawn("pkill", ["-f", `http.server ${PORT}`]); } catch (_) {} });
