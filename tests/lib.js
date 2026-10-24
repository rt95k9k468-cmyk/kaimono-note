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

/** 頁の中で走る：押しても欄からカーソルが動かない（iOS の Safari。ボタン・行を押しても、打っている欄は
    フォーカスを持ったまま——キーボードも上がったまま）。Chromium は押したボタンへフォーカスを移すので、
    「押した瞬間にはもう打っていない」を前提にした書き方が、ここでは通ってしまう。 */
function iosFocus() {
  const typing = (el) => el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
    || (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|file|range|color)$/.test(el.type)));
  document.addEventListener("mousedown", (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t || typing(t) || t.closest("label")) return;
    if (typing(document.activeElement)) e.preventDefault();
  }, true);
}

/** "HH:MM[:SS]" → 今日のその時刻（手元の時間帯）。一つの台本の頁はみな一本の時計に：最初に決めた時刻から、そのあと
    経った時間だけ進めて始める（あとで開いた二台めの時計が一台めより遅れて、「あと」の直しが古く見えた。
    10月17日、T1 の notes-sync）。 */
let clock0 = null;
function clockAt(hms) {
  if (!clock0) {
    const [h, m, s] = hms.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m || 0, s || 0, 0);
    clock0 = { at: d.getTime(), real: Date.now() };
  }
  return new Date(clock0.at + (Date.now() - clock0.real));
}

/** 新しい文脈で開いて、立ち上がるまで待つ。{ browser, ctx, page, errors }
    before(ctx, page) は開く前に呼ぶ（CPU を遅くする・見張りを仕込む、など）。
    unfold：畳んだ面（js/util.js の FOLDED）のうち、開いて確かめるものの名前。読み直しても開いたまま。 */
async function open({ viewport = { width: 390, height: 844 }, before, touch = false, timezoneId, nudge = false, bookFirst = false, weekFirst = false, live = false, unfold = [] } = {}) {
  await ensureServer();
  /* playwright はここで読む——ブラウザの要らない台本（registry）が、playwright の
     無いところでも走れるように。 */
  /* KN_BROWSER=webkit：WebKit で開く（毎朝の全部の二つ目の列。roadmap-3.2 の G3）。CDP・page.coverage は Chromium だけ。 */
  const browser = await require("playwright")[process.env.KN_BROWSER === "webkit" ? "webkit" : "chromium"].launch();
  /* KN_TZ=Asia/Tokyo：頁の時間帯（台本が timezoneId を渡していれば、そちらが勝つ）。機械と門は UTC なので、
     日本の朝（0〜9時。UTC ではまだ前の日）にだけ出る取り違えは、ふだんの回し方では見えない。
     台本の側の日付も揃えるなら、node にも同じ TZ を渡す（`TZ=Asia/Tokyo KN_TZ=Asia/Tokyo KN_CLOCK=07:30`）。 */
  const tz = timezoneId || process.env.KN_TZ;
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}),
    ...(tz ? { timezoneId: tz } : {}) });
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
  /* ＋の新しいノートは先にノートブックの小窓（2026年10月15日）。確かめる台本だけ `bookFirst: true`。 */
  if (!bookFirst) await ctx.addInitScript(() => { try { sessionStorage.setItem("kn-book-first", "off"); } catch (_) {} });
  /* ノートの本文は、ほかの台本では印の書く欄（.js-text）で打つ（見たままは 2026年10月21日から既定。js/note-live.js）。
     見たままを確かめる台本だけ `live: true`（tests/note-live.js）。 */
  if (!live) await ctx.addInitScript(() => { try { localStorage.setItem("kn-note-marks", "1"); } catch (_) {} });
  /* やることは開いたときは今日の面（2026年10月20日。以前は週）。ほかの台本は席の二度押しが何もしない。週の面から始める台本だけ `weekFirst: true`。 */
  await ctx.addInitScript((f) => { try { sessionStorage.setItem("kn-todo-face", f); } catch (_) {} }, weekFirst ? "week" : "today");
  /* 畳んだ面を開く：util.js が KN.util を置いた瞬間に、その名前を FOLDED から外す（アプリに試験の口を作らない）。 */
  if (unfold.length) await ctx.addInitScript((names) => {
    const KN = (window.KN = window.KN || {});
    let u;
    Object.defineProperty(KN, "util", { configurable: true, enumerable: true, get: () => u,
      set: (v) => { u = v; if (v && v.FOLDED) names.forEach((n) => v.FOLDED.delete(n)); } });
  }, unfold);
  /* KN_NO_FIT=1：伸びる欄を、field-sizing の効かない端末の道（JS が測る）で回す（roadmap-3.1 の S2）。 */
  if (process.env.KN_NO_FIT) await ctx.addInitScript(noFit);
  /* KN_NO_ANCHOR=1：スクロールの錨の無い端末（iOS 26 まで）の道で回す（roadmap-3.1 の S1）。 */
  if (process.env.KN_NO_ANCHOR) await ctx.addInitScript(noAnchor);
  /* KN_IOS_FOCUS=1：押しても欄からカーソルが動かない端末（iOS の Safari）の道で回す（iosFocus）。 */
  if (process.env.KN_IOS_FOCUS) await ctx.addInitScript(iosFocus);
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

/* 試験用の問いの元（store.asks）。本物は利用者の端末にだけあり、配る器には無い（docs/thinking.md）。
   page.evaluate((a) => KN.store.setAsks(a), ASKS) で入れる。字は無難なものだけ。 */
const ASKS = [
  ["考える", 1, "試験の出典A", "試験の文脈A", "いま気になっている本の一文を一つ。"],
  ["考える", 2, "試験の出典B", "試験の文脈B", "最近、考えが変わったことは何か？"],
  ["考える", 3, "試験の出典C", "試験の文脈C", "十年後に読み返したい問いは何か？"],
  ["暮らし", 1, "試験の出典D", "試験の文脈D", "今週いちばん静かだった時間はいつか？"],
  ["暮らし", 2, "試験の出典E", "試験の文脈E", "部屋の中で手放せるものは何か？"],
  ["暮らし", 3, "試験の出典F", "試験の文脈F", "暮らしの中で守りたい決まりは何か？"],
  ["働く", 1, "試験の出典G", "試験の文脈G", "今日の仕事で楽しかった場面は？"],
  ["働く", 2, "試験の出典H", "試験の文脈H", "人に教えるとき大事にしていることは？"],
  ["働く", 3, "試験の出典I", "試験の文脈I", "仕事は人生の中の何なのか？"],
].map(([g, w, from, hint, q]) => ({ g, w, from, hint, q }));

/* 見直しの小窓を開く。頭の一行は週の面の選ぶ紙へ移った（docs/todo-items.md の段3）：週 → 選ぶ → 一件ずつ。
   見直すものが無ければ false（開いた小窓は閉じる）。 */
async function openReview(page) {
  await page.locator('#screen-todo .wk-faces .seg-btn[data-face="week"]').first().click();
  await page.waitForTimeout(500);
  const pick = page.locator("#screen-todo .wk-pick");
  if (!(await pick.count())) return false;
  await pick.first().click();
  await page.waitForTimeout(600);
  const one = page.locator(".note-pop.is-choose.is-open .pk-review");
  if (!(await one.count())) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); return false; }
  await one.click();
  await page.waitForTimeout(700);
  return true;
}

module.exports = { open, checker, ensureServer, noFit, noAnchor, openReview, URL, ROOT, ASKS };
