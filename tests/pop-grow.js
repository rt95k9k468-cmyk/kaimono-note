/* 小窓はみな、押したものから出て同じ点へ帰るの見張り（roadmap-unify の U7、docs/motion.md の
   「小窓は押したものから出る」）。

   一、`popOver` に grow の口が戻っていない（出方を選ばせると、角から出る小窓がまた生まれる）。
   二、`place()` は出る点（transform-origin）を毎回置く。小窓を作るのは `popOver` だけ。
   三、CSS の `.note-pop` は transform-origin を持たず（角から出る元）、`.is-grow` も無い。
      出る・帰るの速さは `--m-pop-grow` で、`--m-state` や素の倍率 `.92` は無い。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/pop-grow.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("pop-grow");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const ui = read("js/ui.js");
const sig = (ui.match(/function popOver\(anchor,\s*\{([^}]*)\}/) || [])[1] || "";
t.check("popOver を読めた", !!sig);
t.check("popOver に grow の口が無い", !/\bgrow\b/.test(sig), sig);

const JS = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js"));
const passing = JS.filter((f) => /popOver\([^)]*\bgrow\s*:/.test(read(`js/${f}`).replace(/\s+/g, " ")));
t.check("popOver に grow を渡すところが無い", !passing.length, passing.join(" "));
const makers = JS.filter((f) => /class="note-pop[\s"]/.test(read(`js/${f}`)));
t.check("小窓（.note-pop）を作るのは ui.js だけ", makers.join() === "ui.js", makers.join(" "));

const place = (ui.match(/const place = \(\) => \{([\s\S]*?)\n    \};/) || [])[1] || "";
t.check("place() は出る点を置く", /pop\.style\.transformOrigin\s*=/.test(place));
t.check("出る点は条件なしに置く", !/if\s*\(\s*grow\s*\)/.test(place) && !/is-grow/.test(ui));
const close = (ui.match(/const close = \(\) => \{([\s\S]*?)\n    \};/) || [])[1] || "";
t.check("閉じたあと消すまでの間は --m-pop-grow", /"--m-pop-grow"/.test(close) && !/--m-state/.test(close));

const css = ["css/base.css", "css/components.css", "css/screens.css"].map(read).join("\n");
const rules = [];
const re = /([^{}]*\.note-pop(?![\w-])[^{}]*)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css))) rules.push({ sel: m[1].trim(), body: m[2] });
t.check(".note-pop の決まりを読めた", rules.length > 3, `${rules.length}`);
const origin = rules.filter((r) => /transform-origin/.test(r.body)).map((r) => r.sel);
t.check("CSS に .note-pop の transform-origin が無い（角から出ない）", !origin.length, origin.join(" | "));
t.check(".is-grow の決まりが無い", !/\.note-pop[^{]*\.is-grow/.test(css));
const base = rules.find((r) => r.sel === ".note-pop");
t.check(".note-pop は点まで縮んだところから", base && /transform:\s*scale\(\.06\)/.test(base.body), base && base.body);
const slow = rules.filter((r) => /transition/.test(r.body) && (/--m-state/.test(r.body) || !/--m-pop-grow/.test(r.body))).map((r) => r.sel);
t.check(".note-pop の動きは --m-pop-grow", !slow.length, slow.join(" | "));
const old = rules.filter((r) => /scale\(\.92\)/.test(r.body)).map((r) => r.sel);
t.check("角から .92 で出る作りが戻っていない", !old.length, old.join(" | "));

t.done();
