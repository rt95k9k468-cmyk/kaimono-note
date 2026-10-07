/* 試験をまとめて回す（R19）。台本を三本ずつ並べて走らせ、要約だけ出す。

     NODE_PATH=/opt/node22/lib/node_modules node tests/run-all.js
     … tests/run-all.js day-road carry     名前で絞る（.js は要らない）
     … tests/run-all.js --gate             門（GATE）に入れたものだけ（R22）
     … tests/run-all.js -j 4               並べる数（既定 3）
     … tests/run-all.js --verbose          通った台本の出力も出す

   落ちた台本は NG の行（と、数えずに落ちたら出力の終わり）を出す。一本でも
   落ちれば終了コード 1。やり直しはしない——揺れた試験は揺れた、と出す。

   サーバーは先に一つだけ立ち上げる（三本が同時に立てようとしてぶつからないように）。
   それぞれの台本は自分のブラウザを持つので、並べても互いの記録は混ざらない。 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ensureServer } = require("./lib");

const DIR = __dirname;
/* frame-pace は測るだけで、手で回す（docs/roadmap-2.0.md の V2。機械の揺れで止めないため）。 */
const NOT_SCRIPTS = new Set(["lib.js", "run-all.js", "frame-pace.js"]);

/* 門：速くて揺れないものだけ（docs/roadmap.md の R22）。一度でも揺れたら、ここから
   外して手元の一覧へ戻し、直してから戻す。 */
const GATE = ["registry", "press-dict", "split-items", "capture", "daily-rules", "restore-practice", "startup", "offline", "audit", "csp", "break",
  "season-art",    // 3.0 の E1：季節の絵の大きさ（1枚25KB・合計2MB）と字の濃さの比を門で見張る
  "sky",           // 帯の空：時間帯の区切りと、空の上の字の濃さの比（画素で）を門で見張る
  "motion-dict", "look-tokens",    // roadmap-unify の U1・U3：長さの直書き・暗い面の二度書き（画面を開かない）
  "one-part",                      // roadmap-unify の U2：暦の盤・アイコンを選ぶ紙・写すが一本のまま（画面を開かない）
  "gesture-dict",                  // roadmap-unify の U4：指の重さの直書きが KN.gesture の外に無い（画面を開かない）
  "keyframes-one",                 // roadmap-unify の U5：同じ中身の @keyframes が二つ無い・共通の動きは scale:/translate:（画面を開かない）
  "pop-grow",                      // roadmap-unify の U7：小窓はみな押したものから出る（画面を開かない）
  "when-dict",                     // roadmap-unify の U8：端末の日付欄・時刻欄が JS に無い（画面を開かない）
  "num-fields"];                   // roadmap-unify の U9：type="number" の欄が無い（画面を開かない）

/* 長くかかるものから始める（並べたときに、最後に一本だけ長いのが残らないように）。
   測った秒（2026年9月29日、3本並べて）。載っていないものは短いとみなす。 */
const SLOW = { passed: 60, "head-still": 55, "road-walk": 50, "diary-idb": 45, "day-road": 40,
  "pill-morph": 35, "shop-day": 30, "day-swipe": 30, "road-lead": 30, sets: 25, "due-sheet": 25 };

function parseArgs(argv) {
  const o = { jobs: 3, gate: false, verbose: false, names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--gate") o.gate = true;
    else if (a === "--verbose" || a === "-v") o.verbose = true;
    else if (a === "-j") o.jobs = Math.max(1, Number(argv[++i]) || 3);
    else o.names.push(a.replace(/\.js$/, "").replace(/^tests\//, ""));
  }
  return o;
}

function listScripts(o) {
  const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".js") && !NOT_SCRIPTS.has(f))
    .map((f) => f.slice(0, -3));
  let pick = all;
  if (o.gate) pick = GATE;
  if (o.names.length) pick = o.names;
  const missing = pick.filter((n) => !all.includes(n));
  if (missing.length) throw new Error(`台本が無い：${missing.join(", ")}`);
  return pick.slice().sort((a, b) => (SLOW[b] || 0) - (SLOW[a] || 0));
}

function runOne(name) {
  return new Promise((done) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(DIR, `${name}.js`)],
      { cwd: path.resolve(DIR, ".."), env: process.env });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => done({ name, code, out, sec: (Date.now() - t0) / 1000 }));
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
  if (o.verbose) process.env.KN_VERBOSE = "1";  // 台本の ok の行も出す（lib.js の checker）
  const names = listScripts(o);
  await ensureServer();
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
      console.log(`${ok ? "ok" : "NG"}  ${name.padEnd(18)} ${r.sec.toFixed(1).padStart(5)}s  ${tallies}`);
      if (!ok) {
        if (s.ng.length) console.log(s.ng.map((l) => `      ${l.trim()}`).join("\n"));
        else console.log(r.out.trim().split("\n").slice(-15).map((l) => `      ${l}`).join("\n"));
      } else if (o.verbose) console.log(r.out);
      results.push({ ...r, ok });
    }
  }
  await Promise.all(Array.from({ length: Math.min(o.jobs, names.length) }, worker));
  const bad = results.filter((r) => !r.ok).map((r) => r.name);
  const min = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nrun-all: ${results.length - bad.length}/${results.length} 通った（${min}分、${o.jobs}本ずつ）`);
  if (bad.length) {
    console.log(`落ちた：${bad.join(" ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
