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

/** 新しい文脈で開いて、立ち上がるまで待つ。{ browser, ctx, page, errors }
    before(ctx, page) は開く前に呼ぶ（CPU を遅くする・見張りを仕込む、など）。 */
async function open({ viewport = { width: 390, height: 844 }, before } = {}) {
  await ensureServer();
  /* playwright はここで読む——ブラウザの要らない台本（registry）が、playwright の
     無いところでも走れるように。 */
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (before) await before(ctx, page);
  await page.goto(URL);
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  return { browser, ctx, page, errors };
}

/** 数えるだけの小さな見張り。最後に done() で結果を出し、落ちたら終了コード 1。 */
function checker(title) {
  const fails = [];
  let n = 0;
  return {
    check(name, ok, detail) {
      n++;
      if (ok) console.log(`  ok  ${name}`);
      else { fails.push(name); console.log(`  NG  ${name}${detail ? `\n      ${detail}` : ""}`); }
    },
    done() {
      console.log(`${title}: ${n - fails.length}/${n}`);
      if (fails.length) process.exitCode = 1;
    },
  };
}

module.exports = { open, checker, ensureServer, URL, ROOT };
