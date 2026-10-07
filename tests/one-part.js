/* 同じ部品が一本のままかの見張り（roadmap-unify の U2）。

   四つの暦（やること・daily・ダイエット・買うもの）の盤は `js/cal-grid.js`（KN.calGrid）が組む。
   日のマス（`class="cal-day`）・隣の月のマス（`outDays(`）・隣の月の盤（`function monthGridFor`）を
   ほかのファイルに書き写していないか。アイコンを選ぶ紙（`icon-grid` / `icon-cell`）は
   `js/ui.js` の KN.ui.iconPicker だけ。クリップボードへ写すのは `js/util.js` の KN.util.copy だけ
   （`writeText(` と `execCommand("copy")`）。新しい .js が三か所に載っているか。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/one-part.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("one-part");
/* 註は外すが、行の数は残す（落ちた場所を行で言うため）。 */
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))
  .replace(/^\s*\/\/.*$/gm, "");
const js = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => `js/${f}`);
const where = (re) => {
  const hits = [];
  for (const f of js) read(f).split("\n").forEach((l, i) => { if (re.test(l)) hits.push(`${f}:${i + 1}`); });
  return hits;
};
const only = (name, re, home) => {
  const hits = where(re);
  const stray = hits.filter((h) => !h.startsWith(`${home}:`));
  t.check(`${name}は ${home} だけ`, hits.length > 0 && !stray.length, stray.slice(0, 5).join(" ") || "見つからない");
};

only("暦の日のマスを組むの", /class="cal-day\b/, "js/cal-grid.js");
only("隣の月のマスを数えるの", /\.outDays\(/, "js/cal-grid.js");
only("隣の月の盤を組むの", /function monthGridFor\b|calPeek\.mount\(tmp\)/, "js/cal-grid.js");
t.check("outCell が残っていない", !where(/\boutCell\b/).length, where(/\boutCell\b/).join(" "));
only("アイコンを選ぶ紙の格子", /class="icon-(?:grid|cell)\b/, "js/ui.js");
only("クリップボードへ書くの", /\.writeText\(/, "js/util.js");
only("execCommand で写すの", /execCommand\(\s*["']copy/, "js/util.js");

const fourCals = ["js/screen-todo.js", "js/screen-diet.js", "js/screen-archive.js", "js/head.js"];
const using = fourCals.filter((f) => /KN\.calGrid\.fill\(/.test(read(f)) && /KN\.calGrid\.monthGridFor\(/.test(read(f)));
t.check("四つの暦がどれも KN.calGrid で組む", using.length === 4, fourCals.filter((f) => !using.includes(f)).join(" "));

const raw = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
["index.html", "sw.js", "build-standalone.js"].forEach((f) =>
  t.check(`${f} に js/cal-grid.js が載っている`, raw(f).includes("js/cal-grid.js")));

t.done();
