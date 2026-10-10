/* 試験の共通の手つき。台本はどれもこれを使う（tests/README.md）。

   - ローカルサーバー（8765）が落ちていたら、ここで立ち上げる。
   - 文脈は serviceWorkers: "block" で作る——初めて開くと Service Worker が
     入れ替わって一度読み直し、試験の途中で画面が組み直されるので。
   - 立ち上げを待ってから 300ms 置く（CLAUDE.md の「テストの回し方」）。 */
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 8765;
const ROOT = path.resolve(__dirname, "..");
const URL = `http://localhost:${PORT}/index.html`;

function alive() {
  return new Promise((ok) => {
    const req = http.get(URL, (res) => { res.resume(); ok(res.statusCode === 200); });
    req.on("error", () => ok(false));
    req.setTimeout(1000, () => { req.destroy(); ok(false); });
  });
}

async function ensureServer() {
  if (await alive()) return;
  spawn("python3", ["-m", "http.server", String(PORT), "--directory", ROOT],
    { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await alive()) return;
  }
  throw new Error(`サーバーが立ち上がらない（${PORT}）`);
}

/** 頁の中で走る：CSS.supports が field-sizing だけ偽を返す（KN.util.fitFields が偽になり、
    html に fit-fields が付かない＝伸びる欄の CSS も当たらない）。 */
function noFit() {
  const s = CSS.supports.bind(CSS);
  CSS.supports = (...a) => !/field-sizing/.test(a.join(" ")) && s(...a);
}

/** 頁の中で走る：どの器でもスクロールの錨を働かせない（iOS 26 までの Safari と同じ。roadmap-3.1 の S1）。 */
function noAnchor() {
  const sh = new CSSStyleSheet();
  sh.replaceSync("*, *::before, *::after { overflow-anchor: none !important; }");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
}

/** "HH:MM[:SS]" → 今日のその時刻（手元の時間帯）。 */
function clockAt(hms) {
  const [h, m, s] = hms.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m || 0, s || 0, 0);
  return d;
}

/** 新しい文脈で開いて、立ち上がるまで待つ。{ browser, ctx, page, errors }
    before(ctx, page) は開く前に呼ぶ（CPU を遅くする・見張りを仕込む、など）。 */
async function open({ viewport = { width: 390, height: 844 }, before, touch = false, timezoneId, nudge = false } = {}) {
  await ensureServer();
  /* playwright はここで読む——ブラウザの要らない台本（registry）が、playwright の
     無いところでも走れるように。 */
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}),
    ...(timezoneId ? { timezoneId } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  /* CSP（R29）が何かを止めたら、それもエラーとして数える——iPhone で黙って
     動かなくなる種類なので。 */
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push(`CSP: ${m.text().slice(0, 200)}`);
  });
  /* 週に一度の控えのトースト（settings-backup.js）は、ほかの台本の邪魔をしないよう
     止めておく。確かめる台本だけ `nudge: true`。 */
  if (!nudge) await ctx.addInitScript(() => { try { localStorage.setItem("kn-export-nudge", "9999-12-31"); } catch (_) {} });
  /* KN_NO_FIT=1：伸びる欄を、field-sizing の効かない端末の道（JS が測る）で回す（roadmap-3.1 の S2）。 */
  if (process.env.KN_NO_FIT) await ctx.addInitScript(noFit);
  /* KN_NO_ANCHOR=1：スクロールの錨の無い端末（iOS 26 まで）の道で回す（roadmap-3.1 の S1）。 */
  if (process.env.KN_NO_ANCHOR) await ctx.addInitScript(noAnchor);
  /* KN_CLOCK=23:59:55：今日のその時刻から時計を進めて回す（日付の境目で落ちる台本を洗う。
     roadmap-seamless の N10）。台本が自分で時計を止めていれば、そちらが勝つ。 */
  if (process.env.KN_CLOCK) await page.clock.install({ time: clockAt(process.env.KN_CLOCK) });
  if (before) await before(ctx, page);
  if (process.env.KN_CSS_COVER) await coverCSS(browser, page, process.env.KN_CSS_COVER);
  await page.goto(URL);
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  return { browser, ctx, page, errors };
}

/** CSS の当たりを集める（docs/roadmap-2.0.md の V3。tools/css-unused.js が KN_CSS_COVER に
    置き場を渡したときだけ）。読み直しをまたいで足し、browser.close() の前に一つの JSON に書く。
    見るのは open() の開いた頁だけ（台本があとで開く頁は数えない）。 */
let coverN = 0;
async function coverCSS(browser, page, dir) {
  const fs = require("fs");
  await page.coverage.startCSSCoverage({ resetOnNavigation: false });
  const close = browser.close.bind(browser);
  browser.close = async (...a) => {
    try {
      const out = (await page.coverage.stopCSSCoverage())
        .filter((e) => /\/css\/[^/]+\.css/.test(e.url))
        .map((e) => ({ url: e.url, ranges: e.ranges }));
      fs.mkdirSync(dir, { recursive: true });
      const name = path.basename(process.argv[1] || "x", ".js");
      fs.writeFileSync(path.join(dir, `${name}-${process.pid}-${coverN++}.json`), JSON.stringify(out));
    } catch (e) { /* 頁がもう閉じている——その回は数えない */ }
    return close(...a);
  };
}

/** 数えるだけの小さな見張り。最後に done() で結果を出し、落ちたら終了コード 1。
    通った行は KN_VERBOSE=1 のときだけ出す（2026年10月4日。出力は毎回の会話に載るので、
    ふだんは NG の行と「題: 通った/数えた」だけ）。 */
function checker(title) {
  const fails = [];
  const verbose = !!process.env.KN_VERBOSE;
  let n = 0;
  return {
    check(name, ok, detail) {
      n++;
      if (ok) { if (verbose) console.log(`  ok  ${name}`); }
      else { fails.push(name); console.log(`  NG  ${name}${detail ? `\n      ${detail}` : ""}`); }
    },
    done() {
      console.log(`${title}: ${n - fails.length}/${n}`);
      if (fails.length) process.exitCode = 1;
    },
  };
}

module.exports = { open, checker, ensureServer, noFit, noAnchor, URL, ROOT };
