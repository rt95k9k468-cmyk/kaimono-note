/* main へ push する前に、門のうち画面を開かない検査（tests/run-all.js --quick、1秒ほど）を回す。
   落ちたら push を止め、NG の行を返す（Claude Code の PreToolUse。.claude/settings.json）。
   門の失敗のほとんどは、押す前に回していなかったこの検査だった（docs/dev.md「テストの回し方」）。
   作業ブランチへの push と、ほかのコマンドは素通し。この台本が壊れても止めない（止めるのは検査が落ちたときだけ）。 */
const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
/* 一つのコマンドの中の git push のうち、行き先が main のもの（x:main・HEAD:refs/heads/main・origin main）。 */
const pushesMain = (cmd) => cmd.split(/&&|\|\||[;|\n]/).some((s) =>
  /\bgit\b(?:\s+-C\s+\S+)?\s+push\b/.test(s) && /[\s:](?:refs\/heads\/)?main(?![\w/.-])/.test(s));

let input = "";
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", () => {
  try {
    const cmd = String((JSON.parse(input).tool_input || {}).command || "");
    if (!pushesMain(cmd)) return;
    const r = spawnSync(process.execPath, [path.join(ROOT, "tests", "run-all.js"), "--quick"],
      { cwd: ROOT, encoding: "utf8", timeout: 50000 });
    if (r.status === 0 || r.status === null) return;
    process.stderr.write("main への push を止めた：門の検査（node tests/run-all.js --quick）が落ちる。直してから流す。"
      + "自分の変更でなくても、赤い main に積まずに先に直す（docs/dev.md「main を分け合う」）。\n"
      + `${r.stdout || ""}${r.stderr || ""}`.trim() + "\n");
    process.exitCode = 2;
  } catch (e) { /* 読めない入力は素通し */ }
});
