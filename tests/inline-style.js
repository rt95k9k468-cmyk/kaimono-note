/* インラインの style= を増やさない（roadmap-unify の U13）。

   一、JS・index.html の、値が決まった `style="…"`（`${…}` を含まないもの）が上限以下。上限は U13 を
       終えたときの数——一つ減らしたら下げる。色や位置のように中身で変わる `style="--cat:${…}"` は数えない。
   二、`flex:1`・足もとの並び・見つからないの三つは札のクラス（`.grow`・`.btn-row`・`.empty.is-quiet`）で書く。
   三、小見出しは `.section-title` の形（字間なし・`--c-text-3` の見出しを残さない）。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/inline-style.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const LIMIT = 23;

const ROOT = path.join(__dirname, "..");
const t = checker("inline-style");
const dir = path.join(ROOT, "js");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")]));
src["index.html"] = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
t.check("js を二十本より多く読めた", files.length > 20, `${files.length} 本`);

const fixed = [];
for (const [f, s] of Object.entries(src)) {
  for (const m of s.matchAll(/style="([^"$]*)"/g)) fixed.push(`${f}: ${m[1]}`);
}
t.check(`値の決まった style= が ${LIMIT} 以下`, fixed.length <= LIMIT, `${fixed.length} 個\n      ${fixed.join("\n      ")}`);

const old = [];
for (const [f, s] of Object.entries(src)) {
  for (const m of s.matchAll(/style="(flex:\s*1|display:\s*flex;\s*gap:\s*8px;\s*width:\s*100%|text-align:\s*center;[^"]*padding:\s*40px[^"]*)"/g)) old.push(`${f}: ${m[1]}`);
}
t.check("flex:1・足もとの並び・見つからないは札のクラスで", !old.length, old.join("\n      "));

const css = (f) => fs.readFileSync(path.join(ROOT, "css", f), "utf8");
const rule = (s, sel) => (s.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`)) || [])[1] || "";
const sec = rule(css("components.css"), ".section-title");
t.check(".section-title は字間なし・text-2", sec && !/letter-spacing/.test(sec) && /--c-text-2/.test(sec), sec);
for (const sel of [".day-bought-head", ".diet-got-head"]) {
  const r = rule(css("screens.css"), sel);
  t.check(`${sel} は .section-title と同じ字（fs-sm・太字・text-2）`,
    /--fs-sm/.test(r) && /--fw-bold/.test(r) && /--c-text-2/.test(r) && !/--c-text-3|letter-spacing/.test(r), r);
}

t.done();
