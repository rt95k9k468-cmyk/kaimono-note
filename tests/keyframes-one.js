/* 同じ出来事の動きは一本の見張り（roadmap-unify の U5、docs/motion.md の「同じ出来事の動きは一本」）。

   一、中身（註と空白を外した文字列）が同じ @keyframes が二つ無い——別名で同じ動きを持たない。
   二、一本に寄せた別名（元の tl-pop・mark-pop・row-arrive ほか）が @keyframes として戻っていない。
   三、共通の動き（m-check・m-uncheck・m-add・m-delete・m-warn・m-glow）は `transform` に書かない
      ——位置を transform に持つ物（時間割の丸）や FLIP の行に重ねると、位置が飛ぶ。
   四、時間割の丸の位置は `translate:` にある（`transform` に戻すと、m-check の倍率で丸がずれる）。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/keyframes-one.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("keyframes-one");

const FILES = ["css/base.css", "css/components.css", "css/screens.css"];
const src = FILES.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");

/* @keyframes 名前 { … } を、括弧を数えて切り出す。 */
const frames = new Map();
const re = /@keyframes\s+([\w-]+)\s*\{/g;
let m;
while ((m = re.exec(src))) {
  let depth = 1, i = re.lastIndex;
  while (depth && i < src.length) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
  const body = src.slice(re.lastIndex, i - 1).replace(/\s+/g, "").replace(/;}/g, "}");
  if (frames.has(m[1])) t.check(`@keyframes ${m[1]} は一つだけ`, false, "同じ名前が二つ");
  frames.set(m[1], body);
}
t.check("@keyframes を三十個より多く読めた", frames.size > 30, `${frames.size} 個`);

const byBody = new Map();
for (const [name, body] of frames) byBody.set(body, [...(byBody.get(body) || []), name]);
const twins = [...byBody.values()].filter((n) => n.length > 1).map((n) => n.join("="));
t.check("中身が同じ @keyframes が二つ無い", !twins.length, twins.join(" "));

const RETIRED = ["tl-pop", "mark-pop", "tl-unpop", "row-arrive", "item-in", "ac-in", "note-fold-in",
  "todo-finish", "row-flash", "todo-glow", "lock-shake"];
const back = RETIRED.filter((n) => frames.has(n));
t.check("一本に寄せた別名が戻っていない", !back.length, back.join(" "));
const used = RETIRED.filter((n) => new RegExp(`animation(-name)?\\s*:[^;}]*\\b${n}\\b`).test(src));
t.check("別名を animation で呼んでいない", !used.length, used.join(" "));

const SHARED = ["m-check", "m-uncheck", "m-add", "m-delete", "m-warn", "m-glow"];
const lost = SHARED.filter((n) => !frames.has(n));
t.check("共通の動きがそろっている", !lost.length, lost.join(" "));
const tf = SHARED.filter((n) => /(^|[{;])transform:/.test(frames.get(n) || ""));
t.check("共通の動きは transform に書かない（scale: / translate:）", !tf.length, tf.join(" "));

const node = (src.match(/(?:^|\})\s*\.tl-node\s*\{([^}]*)\}/) || [])[1] || "";
t.check("時間割の丸の位置は translate: にある", /(^|;)\s*translate:\s*-50%/.test(node) &&
  !/(^|;)\s*transform:/.test(node), node.replace(/\s+/g, " ").slice(0, 120));

t.done();
