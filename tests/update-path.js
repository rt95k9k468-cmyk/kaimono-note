/* 版の入れ替えの道（roadmap-seamless の N1・N2・N3・3節の2）。

   作業用の写しに版を五つ（A〜E）刻印し、自前のサーバー（8768、ほかの台本と別の origin）で
   配る版を入れ替えながら、Service Worker を止めずに開く。サーバーは GitHub Pages と同じく
   どのファイルにも `max-age=600`（HTTP の10分の控え）を付ける。

   1. 初めて開く（A）：Service Worker が入っても読み直さない（読み込み1回）。
   2. B を配ってすぐ開く：10分の控えを越えて B で開き、B の Service Worker が入っても読み直さない。
   3. 入口だけ5秒黙る：2秒以内に控えから開く。
   4. C を配ったが入口は5秒・sw.js は届かない：控えの B で開き、後から来た C の入口は読むものを
      揃えてから控えに入る。電波を切っても C で開く。
   5. D を配ったが D の css・js が取れない：控えの入口は C のまま（揃わないうちは前の版）。D の Service Worker の
      install も失敗し、前の Service Worker のまま（N3）。
   6. D が届く（入口は5秒）：控えの C で開き、D の Service Worker が来たら一度だけ読み直して D。
   7. 1本だけ変えた E を配る：サーバーへ行く css・js はその1本だけ（N3。ほかは前の控えから写す）。

   A〜D は app.js と base.css の中身が版ごとに違う（`?v=` は中身の印なので、違わないと「新しい css・js」にならない）。

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
/** 写しの sw.js の頭に足す見張り（アプリの sw.js は変えない）。waitUntil と respondWith を数え、まだ決まらない約束を
    覚えておき、`kn-held` と訊かれたら答える——settle が届かないとき、古い Service Worker が何を抱えて居座るのかを
    書き出す（#809・#811：新しい版は install を済ませて待ち、古い版が30秒以上動いたまま。抱えていたのは試験の問い合わせ
    だけだった——settle の注）。文字にして写しに入れるので、
    外の名前は使わない。 */
function swWatch() {
  const born = Date.now();
  const calls = { waitUntil: 0, respondWith: 0 };
  const held = new Map();
  const seen = {};
  let id = 0;
  for (const [proto, kind] of [[ExtendableEvent.prototype, "waitUntil"], [FetchEvent.prototype, "respondWith"]]) {
    const orig = proto[kind];
    proto[kind] = function (p) {
      const r = orig.call(this, p);   // 投げたもの（遅すぎる・二度目）は数えない
      const k = ++id;
      calls[kind]++;
      const url = this.request ? this.request.url.replace(self.registration.scope, "").replace(/\?v=\w+/, "") : "";
      held.set(k, { kind, type: this.type, url, at: Date.now() });
      const off = () => held.delete(k);
      Promise.resolve(p).then(off, off);
      return r;
    };
  }
  for (const type of ["install", "activate", "fetch", "message"]) {
    self.addEventListener(type, () => { const s = seen[type] || (seen[type] = { n: 0, at: 0 }); s.n++; s.at = Date.now(); });
  }
  self.addEventListener("message", (e) => {
    if (!(e.data && e.data.type === "kn-held" && e.ports && e.ports[0])) return;
    const now = Date.now();
    e.ports[0].postMessage({ up: now - born, calls, held: [...held.values()].map((h) => ({ ...h, age: now - h.at })),
      seen: Object.entries(seen).map(([type, s]) => ({ type, n: s.n, ago: now - s.at })) });
  });
}
/** touch：{ ファイル: 札 } の末尾に札の注を足す（中身を変える）。 */
function stamped(ver, touch) {
  const dir = path.join(work, ver);
  fs.mkdirSync(dir);
  for (const f of ["index.html", "sw.js", "manifest.webmanifest", "stamp-build.js"]) {
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  for (const d of ["css", "js", "icons"]) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
  for (const [f, tag] of Object.entries(touch)) fs.appendFileSync(path.join(dir, f), `\n/* update-path ${tag} */\n`);
  const sw = path.join(dir, "sw.js");
  fs.writeFileSync(sw, `(${swWatch})();\n${fs.readFileSync(sw, "utf8")}`);
  // GITHUB_SHA が引数より先に効くので、CI でも版ごとに付け替える
  execFileSync(process.execPath, ["stamp-build.js"], { cwd: dir, stdio: "ignore", env: { ...process.env, GITHUB_SHA: ver } });
  return dir;
}
const V = { A: "aaaa0001", B: "bbbb0002", C: "cccc0003", D: "dddd0004", E: "eeee0005" };
const TOUCH = Object.fromEntries("ABCD".split("").map((k) => [k, { "js/app.js": k, "css/base.css": k }]));
TOUCH.E = { ...TOUCH.D, "js/util.js": "E" };
const DIR = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, stamped(v, TOUCH[k])]));

/* ---- 入れ替えのきくサーバー ---- */
const srv = { dir: DIR.A, shellDelay: 0, down: false, swBlocked: false, assetsFail: false, code: [] };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  if (srv.down) { req.socket.destroy(); return; }
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p === "/") p = "/index.html";
  const fail = (code) => { res.writeHead(code); res.end(); };
  if (/^\/(css|js)\//.test(p)) srv.code.push(p.slice(1));
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
/** 動いている版：index.html の版の札（N3。`?v=` は各ファイルの中身の印）。 */
const running = (page) => inPage(page, () => {
  const m = document.querySelector('meta[name="kn-build"]');
  return m ? m.content : "";
});
const workerVer = (page) => inPage(page, () => new Promise((resolve) => {
  const sw = navigator.serviceWorker.controller;
  if (!sw) return resolve("");
  const ch = new MessageChannel();
  setTimeout(() => resolve(""), 1000);
  ch.port1.onmessage = (e) => resolve((e.data && e.data.version) || "");
  sw.postMessage({ type: "kn-version" }, [ch.port2]);
}));
/** 登録の中の入りかけ・待ち・動いている Service Worker が、それぞれどの版か（門で落ちたとき、install が
    終わらないのか activate されないのかを分ける。run #809・#811）。 */
const swState = (page) => inPage(page, async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return "登録なし";
  const ask = (sw) => !sw ? "-" : new Promise((resolve) => {
    const ch = new MessageChannel();
    setTimeout(() => resolve(`?(${sw.state})`), 1000);
    ch.port1.onmessage = (e) => resolve(`${(e.data && e.data.version) || "?"}(${sw.state})`);
    sw.postMessage({ type: "kn-version" }, [ch.port2]);
  });
  return `入りかけ ${await ask(reg.installing)}・待ち ${await ask(reg.waiting)}・動く ${await ask(reg.active)}`;
});
/** 動いている Service Worker が抱えている処理と、起動してから数えたもの（写しの見張り swWatch に訊く）。 */
const heldState = (page) => inPage(page, async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!(reg && reg.active)) return "動くものなし";
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    setTimeout(() => resolve("答えなし"), 1000);
    ch.port1.onmessage = (e) => resolve(e.data);
    reg.active.postMessage({ type: "kn-held" }, [ch.port2]);
  });
}).then((h) => {
  if (typeof h === "string") return h;
  const sec = (ms) => `${(ms / 1000).toFixed(1)}秒`;
  const list = h.held.map((x) => `${x.kind} ${x.type}${x.url && ` ${x.url}`} ${sec(x.age)}`);
  return `起動から ${sec(h.up)}・抱えている ${list.length}${list.length ? `（${list.slice(0, 6).join("・")}${list.length > 6 ? "ほか" : ""}）` : ""}`
    + `・waitUntil ${h.calls.waitUntil}・respondWith ${h.calls.respondWith}`
    + h.seen.map((s) => `・${s.type} ${s.n}（最後 ${sec(s.ago)}前）`).join("");
});
/** 入りかけ・待ちの Service Worker があるか（訊くのは登録だけで、Service Worker には話しかけない）。 */
const swPending = (page) => inPage(page, async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(reg && (reg.installing || reg.waiting));
});
/** Service Worker が ver になるまで待ち、読み直しが起きるならそれも済ませる。
    ver になるまでの ms を返す（ならなければ -1 と、そのときの登録の様子と、動いている古い版が抱えている処理。
    黙って先へ進むと、門で揺れたときに何が遅れたか分からない）。
    新しい版が入りかけ・待ちのあいだは、動いている古い版に版を訊かない——250ms ごとの message が古い版を
    起こし続け、待ちが activate されない（#809・#811 と手元の重い CPU：「起動から 28.4秒・抱えている 0・message 114」）。 */
async function settle(page, ver) {
  const t0 = Date.now();
  let got = "";
  for (let i = 0; i < 120; i++) {
    if (!(await swPending(page).catch(() => false)) && (got = await workerVer(page).catch(() => "")) === ver) break;
    await wait(250);
  }
  const ms = got === ver ? Date.now() - t0 : -1;
  const state = ms < 0 ? `30秒待って ${got}。${await swState(page).catch((e) => String(e))}。`
    + `動く方：${await heldState(page).catch((e) => String(e))}` : "";
  await wait(2500);
  await ready(page);
  return { ms, state };
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
    const missing = [];
    for (const u of refs) if (!(await c.match(new URL(u, location.href).href))) missing.push(u);
    out.push({ n, ver: (/<meta name="kn-build" content="([^"]*)"/.exec(html) || [])[1] || "", missing });
  }
  return out;
});

let browser;
(async () => {
  await new Promise((ok, ng) => { server.once("error", ng); server.listen(PORT, "localhost", ok); });
  const t = checker("update-path");
  browser = await chromium.launch();
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
  /** settle して、その版の Service Worker が動くことも確かめる。 */
  async function settled(ver, label) {
    const { ms, state } = await settle(page, ver);
    t.check(`${label} ${ver} の Service Worker が動く`, ms >= 0, state);
    return ms;
  }

  /* 1. 初めて開く */
  await page.goto(APP);
  await ready(page);
  await settled(V.A, "1");
  t.check("1 初めて開いて Service Worker が入っても読み直さない（読み込み1回）", loads === 1, `読み込み ${loads}回`);
  t.check("1 動いているのは A", await running(page) === V.A);
  await shellIs(V.A, "1");

  /* 2. B を配ってすぐ（10分の控えの内） */
  srv.dir = DIR.B; loads = 0;
  await page.goto(APP);
  await ready(page);
  t.check("2 配ってすぐ開いても新しい版（B）", await running(page) === V.B, await running(page));
  await settled(V.B, "2");
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

  /* 5. D の css・js が取れない（sw.js は届く） */
  Object.assign(srv, { down: false, dir: DIR.D, assetsFail: true, swBlocked: false });
  await openTimed();
  await ready(page);
  t.check("5 控えの C で開く", await running(page) === V.C);
  await wait(6000);
  await shellIs(V.C, "5 揃わない入口は控えに入れない");
  t.check("5 css・js が取れない版の Service Worker は入らない（前の B のまま）", await workerVer(page) === V.B, await workerVer(page));

  /* 6. D が届く：古い版が動いているところへ新しい Service Worker */
  Object.assign(srv, { assetsFail: false }); loads = 0;
  ms = await openTimed();
  await ready(page);
  t.check("6 2秒以内に控えの C で開く", ms < 2000 && await running(page) === V.C, `${ms}ms`);
  const swMs = await settled(V.D, "6");
  // 読み直しは決め打ちで待たない（門の混んだ CPU で 2.5 秒を越え、7 の goto とぶつかった。run #802）
  for (const t0 = Date.now(); loads < 2 && Date.now() - t0 < 20000;) await wait(250);
  await wait(4000);   // 二度目が来ないことも見る
  await ready(page);
  t.check("6 新しい版の Service Worker が来たら一度だけ読み直して D", loads === 2 && await running(page) === V.D,
    `読み込み ${loads}回・${await running(page)}・SW ${swMs}ms`);
  await shellIs(V.D, "6");

  /* 7. 1本だけ変えた E を配る */
  Object.assign(srv, { dir: DIR.E, shellDelay: 0, code: [] }); loads = 0;
  await page.goto(APP);
  await ready(page);
  await settled(V.E, "7");
  await wait(2000);
  t.check("7 E で開き、E の Service Worker が入っても読み直さない", loads === 1 && await running(page) === V.E,
    `読み込み ${loads}回・${await running(page)}`);
  const went = [...new Set(srv.code)];
  t.check("7 1本変えて配ると、サーバーへ行く css・js はその1本", went.length === 1 && went[0] === "js/util.js",
    `${srv.code.length}回: ${went.slice(0, 5).join(", ")}`);
  await shellIs(V.E, "7");

  t.check("エラー0", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    // 投げてもブラウザを閉じる（開いたままだと 240 秒の時間切れまで門を止める。run #802）
    if (browser) await browser.close().catch(() => {});
    server.closeAllConnections();
    server.close();
    fs.rmSync(work, { recursive: true, force: true });
  });
