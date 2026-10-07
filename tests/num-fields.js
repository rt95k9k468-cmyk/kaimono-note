/* 数の欄は type="text"（roadmap-unify の U9）。

   一、JS・index.html に `type="number"` の欄が無い（iOS の number は「e」や桁区切りを受け、空と 0 の区別が崩れる）。
   二、`inputmode="decimal|numeric"` の欄が四つより多くある（数の欄はこちらで書く）。
   三、daily の記録の紙は数を `U.parseNum` で読む。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/num-fields.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("num-fields");
const dir = path.join(ROOT, "js");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")]));
src["index.html"] = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
t.check("js を二十本より多く読めた", files.length > 20, `${files.length} 本`);

const bad = [];
for (const [f, s] of Object.entries(src)) {
  for (const m of s.matchAll(/type\s*=\s*\\?["']number\\?["']|\.type\s*=\s*["']number["']/g)) bad.push(`${f}: ${m[0]}`);
}
t.check("type=\"number\" の欄が無い", !bad.length, bad.join("\n      "));

let modes = 0;
for (const s of Object.values(src)) modes += (s.match(/inputmode="(decimal|numeric)"/g) || []).length;
t.check("inputmode=\"decimal|numeric\" の欄が四つより多い", modes > 4, `${modes} 個`);

t.check("daily の記録の紙は数を U.parseNum で読む", /U\.parseNum\(/.test(src["screen-archive.js"]));

t.done();
