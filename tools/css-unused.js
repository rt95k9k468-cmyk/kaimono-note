/* 使われていない CSS の候補表（docs/roadmap-2.0.md の V3。V25 でも使う）。

     NODE_PATH=/opt/node22/lib/node_modules node tools/css-unused.js
     … tools/css-unused.js day-road carry    試験を名前で絞る（run-all.js に渡す）
     … tools/css-unused.js --from <dir>      集めた当たりから表だけ作り直す

   全試験を tests/run-all.js で走らせ、tests/lib.js の open() が Chromium の CSS の当たり
   （coverage）を一本ごとに JSON で置く。それを足し合わせ、一度も当たらなかった規則を
   docs/css-unused.md に書く。

   当たらない＝要らない、ではない。試験が通らない状態・iOS だけの @supports・
   動きを減らす設定・ぼかしの効かない受け皿などは、当たらなくても要る。だから候補表。
   消すのは V25 で、一つずつ試験つき。 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "css-unused.md");
const FILES = ["base.css", "components.css", "screens.css"];

/** 規則を拾う。コメントと文字列を飛ばし、波かっこで入れ子を追う。
    返すのは書式の規則だけ（@keyframes・@font-face・@property の中は数えない）。 */
function parseRules(text) {
  const rules = [];
  const stack = [];  // { at, skip, rule }
  let preludeAt = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const e = text.indexOf("*/", i + 2);
      i = e < 0 ? text.length : e + 1;
      if (!text.slice(preludeAt, i + 1).replace(/\/\*[\s\S]*?\*\//g, "").trim()) preludeAt = i + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
      continue;
    }
    if (c === "{") {
      const raw = text.slice(preludeAt, i);
      const lead = raw.length - raw.replace(/^(\s|\/\*[\s\S]*?\*\/)*/, "").length;
      const start = preludeAt + lead;
      const head = text.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
      const parentSkip = stack.length && stack[stack.length - 1].skip;
      if (head.startsWith("@")) {
        stack.push({ at: head, skip: parentSkip || /^@(-webkit-)?(keyframes|font-face|property|page)\b/.test(head) });
      } else {
        stack.push({ rule: { start, brace: i, head, ctx: stack.filter((s) => s.at).map((s) => s.at) }, skip: parentSkip });
      }
      preludeAt = i + 1;
    } else if (c === "}") {
      const top = stack.pop();
      if (top && top.rule && !top.skip) rules.push({ ...top.rule, end: i + 1 });
      preludeAt = i + 1;
    } else if (c === ";") {
      preludeAt = i + 1;
    }
  }
  return rules.sort((a, b) => a.start - b.start);
}

function lineOf(text, at) {
  let n = 1;
  for (let i = 0; i < at; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** 集めた JSON を、ファイルの名前ごとの当たった範囲に足し合わせる。 */
function gather(dir) {
  const used = Object.fromEntries(FILES.map((f) => [f, []]));
  let runs = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    runs++;
    for (const e of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) {
      const name = path.basename(new URL(e.url).pathname);
      if (used[name]) used[name].push(...e.ranges);
    }
  }
  return { used, runs };
}

/** 規則の頭（選ぶ字から { まで）に当たりが重なれば、当たった。入れ子の親が
    子の当たりで「当たった」にならないよう、本体ではなく頭で見る。 */
function unusedRules(text, ranges) {
  return parseRules(text).filter((r) => !ranges.some((g) => g.start <= r.brace && g.end > r.start));
}

function report(dir, names) {
  const { used, runs } = gather(dir);
  if (!runs) throw new Error(`当たりが一つも無い：${dir}`);
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    "# 使われていない CSS の候補表",
    "",
    `\`tools/css-unused.js\` が作る（docs/roadmap-2.0.md の V3）。${date}、` +
      `${names.length ? `試験 ${names.join(" ")}` : "全試験"}の \`open()\` ${runs}回ぶんの当たりを足した。`,
    "**当たらない＝要らない、ではない**（試験が通らない状態・iOS だけの `@supports`・動きを減らす設定・",
    "ぼかしの効かない受け皿など）。消すのは V25 で、一つずつ試験つき。手で書き足さない——作り直すと消える。",
    "",
  ];
  const sum = [];
  const body = [];
  for (const f of FILES) {
    const text = fs.readFileSync(path.join(ROOT, "css", f), "utf8");
    const all = parseRules(text).length;
    const un = unusedRules(text, used[f]);
    sum.push(`| ${f} | ${all} | ${un.length} |`);
    body.push("", `## ${f}（${un.length}）`, "", "| 行 | 規則 | 中 |", "|---|---|---|");
    for (const r of un) {
      const head = r.head.length > 90 ? `${r.head.slice(0, 89)}…` : r.head;
      const ctx = r.ctx.join(" › ");
      body.push(`| ${lineOf(text, r.start)} | \`${head.replace(/\|/g, "\\|")}\` | ${ctx.replace(/\|/g, "\\|")} |`);
    }
  }
  lines.push("| ファイル | 規則 | 当たらない |", "|---|---|---|", ...sum, ...body, "");
  fs.writeFileSync(OUT, lines.join("\n"));
  console.log(`css-unused: ${sum.map((s) => s.replace(/^\| | \|$/g, "").replace(/ \| /g, " ")).join(" / ")}（規則 当たらない）→ docs/css-unused.md`);
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--from");
  if (i >= 0) return report(argv[i + 1], []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kn-css-"));
  const r = spawnSync(process.execPath, [path.join(ROOT, "tests", "run-all.js"), ...argv],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, KN_CSS_COVER: dir } });
  if (r.status) console.log("（落ちた試験がある——その台本の当たりは途中まで）");
  report(dir, argv.filter((a) => !a.startsWith("-")));
  console.log(`当たりの置き場：${dir}`);
}

if (require.main === module) main();
module.exports = { parseRules, unusedRules };
