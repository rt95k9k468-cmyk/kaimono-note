/* 日付と時刻の入れ方は一つ（roadmap-unify の U8・docs/todo-items.md の「日付と時刻の欄」）。

   一、JS に端末の日付欄・時刻欄（`type="date"`・`type="time"`・`datetime-local`）が無い。
   二、`data-when` を書いた欄は隠した <input>（`type="hidden"`）——書きかけの保存（makeGuard）が value を数えるので。
   三、`data-when` を書いたファイルは `KN.ui.whenFields` を呼ぶ（呼ばないと欄が見えない）。
   四、ui.js が `popTime`・`whenFields` を出している。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/when-dict.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("when-dict");
const dir = path.join(ROOT, "js");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")]));
t.check("js を二十本より多く読めた", files.length > 20, `${files.length} 本`);

const native = [];
for (const [f, s] of Object.entries(src)) {
  for (const m of s.matchAll(/type\s*=\s*\\?["'](date|time|datetime-local)\\?["']|\.type\s*=\s*["'](date|time)["']/g)) native.push(`${f}: ${m[0]}`);
}
t.check("端末の日付欄・時刻欄が JS に無い", !native.length, native.join("\n      "));

const tags = [];
for (const [f, s] of Object.entries(src)) {
  for (const m of s.matchAll(/<input\b[^>]*\bdata-when="(day|far|time)"[^>]*>/g)) tags.push({ f, tag: m[0] });
}
t.check("data-when の欄が十四より多くある", tags.length >= 14, `${tags.length} 個`);
const notHidden = tags.filter((x) => !/type="hidden"/.test(x.tag));
t.check("data-when の欄はみな type=\"hidden\"", !notHidden.length, notHidden.map((x) => `${x.f}: ${x.tag}`).join("\n      "));
const noCall = [...new Set(tags.map((x) => x.f))].filter((f) => !/KN\.ui\.whenFields\(/.test(src[f]));
t.check("data-when を書いたファイルは KN.ui.whenFields を呼ぶ", !noCall.length, noCall.join(", "));

const ex = src["ui.js"].slice(src["ui.js"].lastIndexOf("return {"));
t.check("ui.js が popTime・whenFields を出す", /\bpopTime\b/.test(ex) && /\bwhenFields\b/.test(ex));

t.done();
