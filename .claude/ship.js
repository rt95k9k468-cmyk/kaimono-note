/* 流す道を一本に（2026年11月15日、利用者が決めた）。作業ブランチで、コミットしてから：

     node .claude/ship.js [台本の名 …]

   origin/main を取りこむ → 門（run-all.js --gate。名があればその台本も）→ 枝へ push → main へ push。
   門が赤・取りこみが競合なら止まり、落ちた試験の名（競合ならファイルの名）だけ出す。
   main が先に進んで断られたら、取りこみからもう一度（2回まで）。
   置き場が .claude/ なのは、配る artifact に入らず（ドットのフォルダ）、試験の本数にも数えないため。 */
const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const env = { ...process.env, NODE_PATH: process.env.NODE_PATH || "/opt/node22/lib/node_modules" };
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, env, encoding: "utf8" });
const git = (...a) => sh("git", a);
const stop = (msg) => { console.log(msg); process.exit(1); };

const names = process.argv.slice(2);
const branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
if (!branch || branch === "main" || branch === "HEAD") stop(`止めた：作業ブランチで回す（今：${branch || "?"}）`);
if (git("status", "--porcelain", "--untracked-files=no").stdout.trim()) stop("止めた：コミットしていない変更がある");

/* 押す。網の揺れだけ 2・4・8・16秒おいてやり直す。断られた（先に進んでいる）ときは "behind" を返す。 */
function push(...ref) {
  for (let i = 0; i < 5; i++) {
    const r = git("push", "-q", ...ref);
    if (r.status === 0) return "ok";
    const err = `${r.stderr}`;
    if (/rejected|non-fast-forward|fetch first/.test(err)) return "behind";
    if (i === 4 || !/Could not resolve|timed out|Connection|unable to access|RPC failed|early EOF/i.test(err)) stop(`止めた：push ${ref.join(" ")}\n${err.trim().split("\n").slice(-3).join("\n")}`);
    spawnSync("sleep", [String(2 ** (i + 1))]);
  }
}

function gate() {
  const runs = [["--gate"]];
  if (names.length) runs.push(names);
  const bad = [];
  let done = "";
  for (const a of runs) {
    const r = sh(process.execPath, [path.join(ROOT, "tests", "run-all.js"), ...a]);
    const out = `${r.stdout}${r.stderr}`;
    const fell = (out.match(/^落ちた：(.*)$/m) || [])[1];
    if (r.status !== 0) bad.push(fell || `${a.join(" ")}（${out.trim().split("\n").pop()}）`);
    else done += (out.match(/^run-all: (\S+)/m) || [])[1] + " ";
  }
  if (bad.length) stop(`門が赤：${bad.join(" ")}\n取りこんだ人の変更で赤なら、自分の仕事より先に直す。直せなければ積まずに利用者へ伝える。`);
  return done.trim();
}

for (let round = 0; round < 3; round++) {
  if (git("fetch", "-q", "origin", "main").status !== 0) stop("止めた：origin main を取れない");
  const m = git("merge", "--no-stat", "--no-edit", "-q", "origin/main");
  if (m.status !== 0) {
    const files = git("diff", "--name-only", "--diff-filter=U").stdout.trim().split("\n").join(" ");
    stop(`取りこみが競合：${files || m.stderr.trim()}\n解いてコミットしてから、もう一度。`);
  }
  const passed = gate();
  if (push("-u", "origin", branch) === "behind") stop(`止めた：origin/${branch} が先に進んでいる`);
  if (push("origin", `${branch}:main`) === "ok") {
    console.log(`流した：${git("log", "--oneline", "-1").stdout.trim()}（門 ${passed}）`);
    process.exit(0);
  }
}
stop("止めた：main が先に進みつづけて押せない");
