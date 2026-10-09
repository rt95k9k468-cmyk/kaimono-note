/* 版の入れ替えの道（roadmap-seamless の N1・N2・3節の2）。

   作業用の写しに版を四つ（A〜D）刻印し、自前のサーバー（8768、ほかの台本と別の origin）で
   配る版を入れ替えながら、Service Worker を止めずに開く。サーバーは GitHub Pages と同じく
   どのファイルにも `max-age=600`（HTTP の10分の控え）を付ける。

   1. 初めて開く（A）：Service Worker が入っても読み直さない（読み込み1回）。
   2. B を配ってすぐ開く：10分の控えを越えて B で開き、B の Service Worker が入っても読み直さない。
   3. 入口だけ5秒黙る：2秒以内に控えから開く。
   4. C を配ったが入口は5秒・sw.js は届かない：控えの B で開き、後から来た C の入口は読むものを
      揃えてから控えに入る。電波を切っても C で開く。
   5. D を配ったが D の css・js が取れない：控えの入口は C のまま（揃わないうちは前の版）。
   6. D が届く（入口は5秒）：控えの C で開き、D の Service Worker が来たら一度だけ読み直して D。

   どの場面のあとも「控えの入口が読む css・js は全部同じ控えにある」を見る。
   刻印（stamp-build.js）は作業用の写しの中だけで走らせる（CLAUDE.md）。 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { checker, ROOT } = require("./lib");

const PORT = 8768;
const BASE = `http://localhost:${PORT}/`;
const APP = `${BASE}index.html`;

/* ---- 版の写し ---- */
const work = fs.mkdtempSync(path.join(os.tmpdir(), "kn-update-path-"));
function stamped(ver) {
  const dir = path.join(work, ver);
  fs.mkdirSync(dir);
  for (const f of ["index.html", "sw.js", "manifest.webmanifest", "stamp-build.js"]) {
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  for (const d of ["css", "js", "icons"]) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  // GITHUB_SHA が引数より先に効くので、CI でも版ごとに付け替える
  execFileSync(process.execPath, ["stamp-build.js"], { cwd: dir, stdio: "ignore", env: { ...process.env, GITHUB_SHA: ver } });
  return dir;
}
const V = { A: "aaaa0001", B: "bbbb0002", C: "cccc0003", D: "dddd0004" };
const DIR = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, stamped(v)]));

/* ---- 入れ替えのきくサーバー ---- */
const srv = { dir: DIR.A, shellDelay: 0, down: false, swBlocked: false, assetsFail: false };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  if (srv.down) { req.socket.destroy(); return; }
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p === "/") p = "/index.html";
  const fail = (code) => { res.writeHead(code); res.end(); };
  if (p === "/sw.js" && srv.swBlocked) return fail(503);
  if (/^\/(css|js)\//.test(p) && srv.assetsFail) return fail(503);
  const file = path.join(srv.dir, p);
  if (!file.startsWith(srv.dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(404);
  const body = fs.readFileSync(file);
  const send = () => {
    if (srv.down) { req.socket.destroy(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "max-age=600" });
    res.end(body);
  };
  if (p === "/index.html" && srv.shellDelay) setTimeout(send, srv.shellDelay); else send();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 読み直しをまたいでも答えが出るまで頁の中で走らせる。 */
async function inPage(page, fn, arg, tries = 40) {
  for (let i = 0; ; i++) {
    try { return await page.evaluate(fn, arg); } catch (e) {
      if (i >= tries) throw e;
      await wait(250);
    }
  }
}
const ready = (page) => inPage(page, () => {
  if (!(window.KN && KN.store && KN.app)) throw new Error("まだ");
  return true;
}, undefined, 80);
const running = (page) => inPage(page, () => {
  const s = document.querySelector('script[src*="js/app.js"]');
  const m = s && /[?&]v=([^&]+)/.exec(s.src);
  return m ? m[1] : "";
});
const workerVer = (page) => inPage(page, () => new Promise((resolve) => {
  const sw = navigator.serviceWorker.controller;
  if (!sw) return resolve("");
  const ch = new MessageChannel();
  setTimeout(() => resolve(""), 1000);
  ch.port1.onmessage = (e) => resolve((e.data && e.data.version) || "");
  sw.postMessage({ type: "kn-version" }, [ch.port2]);
}));
/** Service Worker が ver になるまで待ち、読み直しが起きるならそれも済ませる。 */
async function settle(page, ver) {
  for (let i = 0; i < 120 && await workerVer(page).catch(() => "") !== ver; i++) await wait(250);
  await wait(2500);
  await ready(page);
}
/** 控え（kaimono-note-…）の入口の版と、その入口が読むのに控えに無いもの。 */
const shellState = (page) => inPage(page, async () => {
  const names = (await caches.keys()).filter((n) => n.startsWith("kaimono-note-"));
  const out = [];
  for (const n of names) {
    const c = await caches.open(n);
    const r = await c.match("index.html");
    if (!r) { out.push({ n, ver: "", missing: ["index.html"] }); continue; }
    const html = await r.text();
    const refs = [...html.matchAll(/(?:src|href)="((?:css|js)\/[^"]+)"/g)].map((m) => m[1]);
    const app = refs.find((x) => x.startsWith("js/app.js"));
    const missing = [];
    for (const u of refs) if (!(await c.match(new URL(u, location.href).href))) missing.push(u);
    out.push({ n, ver: (/[?&]v=([^&]+)/.exec(app || "") || [])[1] || "", missing });
  }
  return out;
});

(async () => {
  await new Promise((ok, ng) => { server.once("error", ng); server.listen(PORT, "localhost", ok); });
  const t = checker("update-path");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("kn-export-nudge", "9999-12-31"); } catch (_) {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push(`CSP: ${m.text().slice(0, 200)}`);
  });
  let loads = 0;
  page.on("domcontentloaded", () => { loads++; });

  async function shellIs(ver, label) {
    const s = await shellState(page);
    t.check(`${label}：控えは一つで、入口は ${ver}`, s.length === 1 && s[0].ver === ver, JSON.stringify(s.map((x) => [x.n, x.ver])));
    const miss = s.flatMap((x) => x.missing);
    t.check(`${label}：控えの入口が読む css・js は全部控えにある`, !miss.length, miss.slice(0, 5).join(", "));
  }
  async function openTimed() {
    const t0 = Date.now();
    await page.goto(APP, { waitUntil: "commit" });
    return Date.now() - t0;
  }

  /* 1. 初めて開く */
  await page.goto(APP);
  await ready(page);
  await settle(page, V.A);
  t.check("1 初めて開いて Service Worker が入っても読み直さない（読み込み1回）", loads === 1, `読み込み ${loads}回`);
  t.check("1 動いているのは A", await running(page) === V.A);
  await shellIs(V.A, "1");

  /* 2. B を配ってすぐ（10分の控えの内） */
  srv.dir = DIR.B; loads = 0;
  await page.goto(APP);
  await ready(page);
  t.check("2 配ってすぐ開いても新しい版（B）", await running(page) === V.B, await running(page));
  await settle(page, V.B);
  t.check("2 新しい版で開いたら、その版の Service Worker が入っても読み直さない", loads === 1, `読み込み ${loads}回`);
  await shellIs(V.B, "2");

  /* 3. 入口だけ5秒黙る */
  srv.shellDelay = 5000; loads = 0;
  let ms = await openTimed();
  await ready(page);
  t.check("3 入口が5秒黙っても2秒以内に開く", ms < 2000, `${ms}ms`);
  t.check("3 控えの B で開く", await running(page) === V.B);
  await wait(5000);
  t.check("3 読み直さない", loads === 1, `読み込み ${loads}回`);
  await shellIs(V.B, "3");

  /* 4. C を配ったが入口は5秒・sw.js は届かない */
  srv.dir = DIR.C; srv.swBlocked = true; loads = 0;
  ms = await openTimed();
  await ready(page);
  t.check("4 2秒以内に控えの B で開く", ms < 2000 && await running(page) === V.B, `${ms}ms ${await running(page)}`);
  await wait(6000);
  await shellIs(V.C, "4 後から来た入口は揃えてから控えへ");
  srv.down = true; loads = 0;
  const served = new Map();
  const onRes = (r) => {
    const p = new URL(r.url()).pathname.replace(/^\//, "");
    if (/^(js|css)\//.test(p)) served.set(p, `${r.status()}${r.fromServiceWorker() ? "" : " ネットから"}`);
  };
  page.on("response", onRes);
  await page.goto(APP);
  await ready(page);
  page.off("response", onRes);
  t.check("4 電波なしでも、揃った一番新しい版（C）で開く", await running(page) === V.C, await running(page));
  const bad = [...served].filter(([, v]) => v !== "200").map(([k, v]) => `${k}（${v}）`);
  t.check(`4 電波なしの js・css（${served.size}）がどれも控えから 200`, served.size > 50 && !bad.length, bad.slice(0, 5).join(", "));

  /* 5. D の css・js が取れない */
  Object.assign(srv, { down: false, dir: DIR.D, assetsFail: true });
  await openTimed();
  await ready(page);
  t.check("5 控えの C で開く", await running(page) === V.C);
  await wait(6000);
  await shellIs(V.C, "5 揃わない入口は控えに入れない");

  /* 6. D が届く：古い版が動いているところへ新しい Service Worker */
  Object.assign(srv, { assetsFail: false, swBlocked: false }); loads = 0;
  ms = await openTimed();
  await ready(page);
  t.check("6 2秒以内に控えの C で開く", ms < 2000 && await running(page) === V.C, `${ms}ms`);
  await settle(page, V.D);
  t.check("6 新しい版の Service Worker が来たら一度だけ読み直して D", loads === 2 && await running(page) === V.D,
    `読み込み ${loads}回・${await running(page)}`);
  await wait(4000);
  await shellIs(V.D, "6");

  t.check("エラー0", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => {
    server.closeAllConnections();
    server.close();
    fs.rmSync(work, { recursive: true, force: true });
  });
