/* 試験をまとめて回す（R19）。台本を並べて（既定はコアの1.5倍・門は3本）走らせ、要約だけ出す。

     NODE_PATH=/opt/node22/lib/node_modules node tests/run-all.js
     … tests/run-all.js day-road carry     名前で絞る（.js は要らない）
     … tests/run-all.js --gate             門（GATE）に入れたものだけ（R22）
     … tests/run-all.js --quick            門のうち画面を開かないものだけ（数秒。main への push の前）
     … tests/run-all.js -j 4               並べる数（既定：全部はコアの1.5倍、門・名前で絞ったときは 3）
     … tests/run-all.js --verbose          通った台本の出力も出す
     KN_TIMES=ファイル                       一本ごとの秒を JSON に（長い順）

   落ちた台本は NG の行（と、数えずに落ちたら出力の終わり）を出す。一本でも
   落ちれば終了コード 1。やり直しはしない——揺れた試験は揺れた、と出す。
   通った台本の一本一行（秒と数）は GitHub（CI）と --verbose だけ。手元では落ちたものと
   最後の一行だけ（全部で約150行が会話に載らないように。2026年10月10日、制限の節約）。

   サーバーは先に一つだけ立ち上げる（三本が同時に立てようとしてぶつからないように）。
   それぞれの台本は自分のブラウザを持つので、並べても互いの記録は混ざらない。 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ensureServer } = require("./lib");

const DIR = __dirname;
/* frame-pace・heavy-pace は測るだけで、手で回す（docs/roadmap-2.0.md の V2・docs/log/inspection.md。機械の揺れで止めないため）。 */
const NOT_SCRIPTS = new Set(["lib.js", "run-all.js", "frame-pace.js", "heavy-pace.js"]);

/* 門：速くて揺れないものだけ（docs/roadmap.md の R22）。一度でも揺れたら、ここから
   外して手元の一覧へ戻し、直してから戻す。 */
const GATE = ["registry", "traps", "unknown-keep", "live-slim", "todo-past", "todo-out", "press-dict", "split-items", "capture", "daily-rules", "restore-practice", "restore-drill", "startup", "offline", "audit", "csp", "break", "backup-budget",
  "desk-replica",  // パソコン段15：写しの端末のあいだ、記録・控え・日記の写しを動かさない・Dropbox に控えを置かない
  "desk-inbox",    // パソコン段15③：受け箱の取り込みで iPhone の記録が消えない・二度当てない・読めないものは動かさない
  "season-art",    // 3.0 の E1：季節の絵の大きさ（1枚25KB・合計2MB）と字の濃さの比を門で見張る
  "one-screen",    // design-review 12節：一度だけ描く決まり三つ（最初の一画面・帯と＋のかぶり・空のまとめ）
  "sky",           // 帯の空：時間帯の区切りと、空の上の字の濃さの比（画素で）を門で見張る
  "motion-dict", "look-tokens",
  "shape-tokens",                  // 総点検 Y1〜Y3：見出しは墨・選ぶ札の形・紙の頭は一つの顔（画面を開かない）    // roadmap-unify の U1・U3：長さの直書き・暗い面の二度書き（画面を開かない）
  "one-part",                      // roadmap-unify の U2：暦の盤・アイコンを選ぶ紙・写すが一本のまま（画面を開かない）
  "gesture-dict",                  // roadmap-unify の U4：指の重さの直書きが KN.gesture の外に無い（画面を開かない）
  "keyframes-one",                 // roadmap-unify の U5：同じ中身の @keyframes が二つ無い・共通の動きは scale:/translate:（画面を開かない）
  "pop-grow",                      // roadmap-unify の U7：小窓はみな押したものから出る（画面を開かない）
  "when-dict",                     // roadmap-unify の U8：端末の日付欄・時刻欄が JS に無い（画面を開かない）
  "words",                         // roadmap-unify の U10：表に無い言い方（削除・〜の編集・AIと など）が無い（画面を開かない）
  "del-rule",                      // roadmap-unify の U11：一件の記録は ⋯ から確かめずに消す（画面を開かない）
  "num-fields",                    // roadmap-unify の U9：type="number" の欄が無い（画面を開かない）
  "row-heights",                   // roadmap-unify の U12：行の背丈は三つの札（画面を開かない）
  "inline-style",                  // roadmap-unify の U13：値の決まった style= が増えない・小見出しの字（画面を開かない）
  "chip-icon-size",                // roadmap-unify の U14：札の高さは二つ・絵の直書きは入れものだけ（画面を開かない）
  "smooth",                        // なめらかさ（2026年10月9日）：二度組み・毎フレームの当て・動きの最中の保存が戻らない（数で見る）
  "update-path",                   // roadmap-seamless の N1・N2・N4：版の入れ替えで読み直すのは要るときだけ（見えないとき）・入口は1.5秒で控えへ・控えは揃ってから
  "ime-enter",                     // roadmap-seamless の N5：改行は KN.util.isEnter だけ・変換を決める改行で手順が増えない
  "security-gate",                 // 配信の守り（セキュリティ S1）：CSP の形・外のスクリプト・eval・外への通信（docs/dev.md）
  "xss-probe",                     // 画面の中の守り（セキュリティ S2）：記録の字が要素にならない（docs/dev.md）
  "relay-worker",                  // 外との口の守り（セキュリティ S3）：中継所のふるまいと埋めた写し（docs/dev.md）
  "sync-room",                     // 3台の同期 段1：同期の部屋のふるまい（偽の部屋。docs/sync.md）
  "sync-device",                   // 3台の同期 段2：端末の側（比べる・鍵・送り待ち。偽の部屋）
  "desk"];                         // パソコン・幅の広い画面：左の帯・読む幅・ノートの三列（ほかの台本はみな電話の幅。docs/desk.md）

/* --quick：門のうち画面を開かないもの（決まりの見張り。全部で数秒）。main への push の前に
   .claude/hooks/push-gate.js が回す。10月9〜26日に門で落ちた21回のうち19回は、これだけで落ちていた（docs/dev.md）。 */
const opensPage = (name) => /\bopen\(|chromium|launch\(|newContext/.test(fs.readFileSync(path.join(DIR, `${name}.js`), "utf8"));

/* 長くかかるものから始める（並べたときに、最後に一本だけ長いのが残らないように）。
   測った秒（2026年11月7日、6本並べて。KN_TIMES で測り直す）。載っていないものは短いとみなす。 */
const SLOW = { "scroll-anchor": 110, "head-still": 80, legibility: 76, "update-path": 70, "desk-edges": 59, widths: 57,
  "notes-labels": 56, sky: 56, "diary-idb": 50, "notes-format": 50, "settings-map": 49, "desk-hand": 48, desk: 44,
  "work-week-face": 43, "desk-windows": 42, arrive: 39, sideways: 39, break: 38, "diary-out": 38, "shop-add-v27": 37,
  "then-years": 37, settings: 35, "diary-chat": 35, notes: 33, "road-labels-clear": 33, asks: 33 };

/* 並べる数の既定（2026年11月7日、M4）。待ちの多い台本ばかりなので、コアの1.5倍まで並べても揺れず、
   全部は 4コアで 16.3分 → 9.7分（3本→6本）。門・名前で絞ったとき（WebKit の列など）は3本のまま——
   門は落ちると配信が止まり、WebKit の top-tap は時間に敏感なので、揺れの余地を足さない。 */
const JOBS = Math.max(3, Math.round(require("os").cpus().length * 1.5));

function parseArgs(argv) {
  const o = { jobs: 0, gate: false, quick: false, verbose: false, names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--gate") o.gate = true;
    else if (a === "--quick") o.quick = true;
    else if (a === "--verbose" || a === "-v") o.verbose = true;
    else if (a === "-j") o.jobs = Math.max(1, Number(argv[++i]) || 3);
    else o.names.push(a.replace(/\.js$/, "").replace(/^tests\//, ""));
  }
  if (!o.jobs) o.jobs = o.gate || o.quick || o.names.length ? 3 : JOBS;
  return o;
}

function listScripts(o) {
  const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".js") && !NOT_SCRIPTS.has(f))
    .map((f) => f.slice(0, -3));
  let pick = all;
  if (o.gate) pick = GATE;
  if (o.quick) pick = GATE.filter((n) => !opensPage(n));
  if (o.names.length) pick = o.names;
  const missing = pick.filter((n) => !all.includes(n));
  if (missing.length) throw new Error(`台本が無い：${missing.join(", ")}`);
  return pick.slice().sort((a, b) => (SLOW[b] || 0) - (SLOW[a] || 0));
}

/* 一本の上限（2026年10月8日）。台本が途中で投げると、多くは catch で exitCode を立てるだけで
   ブラウザを開いたまま終わらない——一本が固まると、全体も門も止まる。上限で切って NG にする。
   いちばん長い台本でも並べて80秒ほど（9月29日・10月8日に測った）。 */
const LIMIT_SEC = Number(process.env.KN_LIMIT) || 240;  // KN_LIMIT=秒 で変えられる

function runOne(name) {
  return new Promise((done) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(DIR, `${name}.js`)],
      { cwd: path.resolve(DIR, ".."), env: process.env });
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, LIMIT_SEC * 1000);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ name, code, out, timedOut, sec: (Date.now() - t0) / 1000 });
    });
  });
}

/** 出力から「題: 通った/数えた」の行と NG の行を拾う。 */
function summarize(r) {
  const lines = r.out.split("\n");
  const tally = lines.filter((l) => /^\S.*: \d+\/\d+\s*$/.test(l));
  const ng = [];
  lines.forEach((l, i) => {
    if (/^\s+NG\s/.test(l)) {
      ng.push(l);
      if (lines[i + 1] && /^\s{6}\S/.test(lines[i + 1])) ng.push(lines[i + 1]);
    }
  });
  return { tally, ng };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.gate || o.quick) process.env.KN_GATE = "1";  // 大きさの上限は門では警報だけ（registry.js）
  if (o.verbose) process.env.KN_VERBOSE = "1";  // 台本の ok の行も出す（lib.js の checker）
  const names = listScripts(o);
  if (!o.quick) await ensureServer();
  const t0 = Date.now();
  const queue = names.slice();
  const results = [];
  async function worker() {
    while (queue.length) {
      const name = queue.shift();
      const r = await runOne(name);
      const s = summarize(r);
      const ok = r.code === 0;
      const tallies = s.tally.map((l) => l.replace(/^.*: /, "")).join(" ");
      if (!ok || o.verbose || process.env.CI) console.log(`${ok ? "ok" : "NG"}  ${name.padEnd(18)} ${r.sec.toFixed(1).padStart(5)}s  ${tallies}`);
      if (!ok) {
        if (r.timedOut) console.log(`      時間切れ（${LIMIT_SEC}秒）で止めた。終わりの出力：`);
        if (s.ng.length && !r.timedOut) console.log(s.ng.map((l) => `      ${l.trim()}`).join("\n"));
        else console.log(r.out.trim().split("\n").slice(-15).map((l) => `      ${l}`).join("\n"));
      } else if (o.verbose) console.log(r.out);
      results.push({ ...r, ok });
    }
  }
  await Promise.all(Array.from({ length: Math.min(o.jobs, names.length) }, worker));
  const bad = results.filter((r) => !r.ok).map((r) => r.name);
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nrun-all: ${results.length - bad.length}/${results.length} 通った（${min}分、${o.jobs}本ずつ）`);
  /* KN_TIMES=ファイル で一本ごとの秒を JSON に（長い順）。SLOW の表を測り直すときに。 */
  if (process.env.KN_TIMES) {
    const times = Object.fromEntries(results.slice().sort((a, b) => b.sec - a.sec).map((r) => [r.name, Math.round(r.sec)]));
    fs.writeFileSync(process.env.KN_TIMES, JSON.stringify(times, null, 1));
  }
  if (bad.length) {
    console.log(`落ちた：${bad.join(" ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
