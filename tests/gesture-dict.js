/* 指の重さの見張り（roadmap-unify の U4、docs/motion.md の「指の重さは一か所」）。

   持ち上げる長押し・払いの速さ・向きを決める動き・車輪の一行は `KN.gesture`（motion.js）に
   一つずつ。motion.js の外に `const HOLD = 400` の形（前後に名前が付いた `DRAG_HOLD`・
   `FACE_FLING_V`・`AXIS_LOCK` も）が戻ってきたら落とす。車輪の一行 `ROW = 40` も。
   別の意味で同じ名前を使うものだけ、下の EXEMPT に理由つきで置く。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/gesture-dict.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("gesture-dict");

/* 註は外すが、行の数は残す（落ちた場所を行で言うため）。 */
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))
  .replace(/\/\/.*$/gm, "");

const motion = read("js/motion.js");
const dict = (motion.match(/KN\.gesture\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/) || [])[1] || "";
const val = (k) => { const m = dict.match(new RegExp(`\\b${k}:\\s*([\\d.]+)`)); return m ? Number(m[1]) : NaN; };
t.check("motion.js に KN.gesture がある", !!dict);
t.check("持ち上げる長押しは 380", val("HOLD") === 380, String(val("HOLD")));
t.check("払いは二つ：行き先へ送る・閉じる戻る（送るほうが軽い）",
  val("FLING_V") > 0 && val("BACK_FLING_V") > val("FLING_V") && val("FLING_MIN") > 0 && val("BACK_FLING_MIN") > 0,
  dict.replace(/\s+/g, " "));
t.check("向きを決める動き・車輪の一行がある", val("AXIS") > 0 && val("WHEEL_ROW") > 0);

/* 車輪の一行は CSS の行の高さと同じでないと、回した位置と選ばれた行がずれる。 */
const css = fs.readFileSync(path.join(ROOT, "css/screens.css"), "utf8");
const rowH = ((css.match(/\.note-wheel-row\s*\{[^}]*?height:\s*(\d+)px/) || [])[1]);
t.check("WHEEL_ROW は .note-wheel-row の高さと同じ", Number(rowH) === val("WHEEL_ROW"), `css ${rowH} / js ${val("WHEEL_ROW")}`);

/* 別の意味で同じ名前を使うもの（file:名前）。 */
const EXEMPT = {
  "js/app.js:HOLD": "キーボードを下げる払いと文字選びの見分け（じっとしていた時間）。持ち上げではない",
  "js/screen-todo.js:HOLD_MS": "手順の丸の長押し 500（roadmap-unify の 7節：別の意味）",
  "js/day-swipe.js:AXIS_Y": "縦と決めるのを急がない 10（calendar-swipe の「向き」）",
  "js/pull-refresh.js:FLING_MIN": "端の帯の勢い（身ぶりを決める数ではない）",
  "js/pull-refresh.js:FLING_GAIN": "同上",
  "js/pull-refresh.js:FLING_MAX": "同上",
  "js/pull-refresh.js:FLING_OUT": "同上",
};
const NAME = /\b(?:const|let|var)\s+(\w*?(?:HOLD|FLING_V|FLING_MIN|FLING|AXIS|WHEEL_ROW)\w*)\s*=\s*[-\d.(]/g;
const files = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js") && f !== "motion.js")
  .map((f) => `js/${f}`);
const hits = [], used = new Set();
for (const f of files) {
  read(f).split("\n").forEach((l, i) => {
    for (const m of l.matchAll(NAME)) {
      const key = `${f}:${m[1]}`;
      if (EXEMPT[key]) { used.add(key); continue; }
      hits.push(`${f}:${i + 1} ${m[1]}`);
    }
    if (/\b(?:const|let|var)\s+\w*ROW\s*=\s*40\b/.test(l)) hits.push(`${f}:${i + 1} ROW = 40`);
  });
}
t.check("指の重さの直書きが motion.js の外に無い（KN.gesture から読む）", !hits.length, hits.slice(0, 6).join(" "));
const stale = Object.keys(EXEMPT).filter((k) => !used.has(k));
t.check("EXEMPT に、もう無いものが残っていない", !stale.length, stale.join(" "));

/* motion.js は読む側より先に読み込む（モジュールの頭で KN.gesture を読むので）。 */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const at = (f) => html.indexOf(`js/${f}"`);
const readers = files.filter((f) => /KN\.gesture/.test(read(f))).map((f) => f.slice(3));
const early = readers.filter((f) => at(f) >= 0 && at(f) < at("motion.js"));
t.check("KN.gesture を読むファイルが十本ほどある", readers.length >= 8, readers.join(" "));
t.check("どれも index.html で motion.js より後に読み込む", at("motion.js") >= 0 && !early.length, early.join(" "));

t.done();
