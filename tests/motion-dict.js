/* 動きの辞書の見張り（V4、docs/motion.md の「動きの辞書」）。

   base.css が持つ `--m-*` の名前が、どれも辞書の表に一行ずつ載っているか。
   載っていない名前がある＝表に行を足さずに動きを作った。逆に、表にあって
   base.css に無い名前も落とす（名前を消したのに表が残っている）。
   そして、長さの直書きが戻っていないか（roadmap-unify の U1）——CSS の transition / animation に
   秒の数、JS の動きに ms の数（`FLIP_MS` の形）、`duration:` に数（トーストは `long` / `until`）。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/motion-dict.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("motion-dict");

const css = fs.readFileSync(path.join(ROOT, "css/base.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const defined = new Set([...css.matchAll(/(--m-[a-z-]+)\s*:/g)].map((m) => m[1]));

const doc = fs.readFileSync(path.join(ROOT, "docs/motion.md"), "utf8");
const from = doc.indexOf("### 動きの辞書");
const to = doc.indexOf("\n### ", from + 1);
const dict = from < 0 ? "" : doc.slice(from, to < 0 ? undefined : to);
t.check("docs/motion.md に「動きの辞書」の節がある", !!dict);

/* 表の行の一列目に書いた名前だけを拾う（本文で触れただけの名前は数えない）。 */
const listed = new Set();
dict.split("\n").filter((l) => l.startsWith("| `--m-"))
  .forEach((l) => l.split("|")[1].replace(/[^`]*`(--m-[a-z-]+)`/g, (_, n) => listed.add(n)));

t.check("名前が三十個より多い", defined.size > 30, `base.css から ${defined.size} 個`);
const missing = [...defined].filter((n) => !listed.has(n));
t.check("base.css の名前がどれも表にある", !missing.length, missing.join(" "));
const stale = [...listed].filter((n) => !defined.has(n));
t.check("表の名前がどれも base.css にある", !stale.length, stale.join(" "));

/* 直書きの見張り。.01ms・.001ms は「瞬時」（動きを減らす設定）なので数えない。 */
/* 註は外すが、行の数は残す（落ちた場所を行で言うため）。 */
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""));
const scan = (files, test) => {
  const hits = [];
  for (const f of files) read(f).split("\n").forEach((l, i) => { if (test(l)) hits.push(`${f}:${i + 1}`); });
  return hits;
};
const TIME = /(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g;
const cssHits = scan(["css/base.css", "css/components.css", "css/screens.css"], (l) =>
  [...l.matchAll(/(?:transition|animation)[a-z-]*\s*:([^;}]*)/g)].some((d) =>
    [...d[1].matchAll(TIME)].some((m) => m[2] === "s" || Number(m[1]) >= 1)));
t.check("CSS の transition / animation に秒の直書きが無い", !cssHits.length, cssHits.slice(0, 5).join(" "));

const js = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => `js/${f}`);
const jsMs = scan(js, (l) => /(?:transition|animation)/.test(l) &&
  /(\$\{[A-Z][A-Z0-9_]*\}m?s\b|[\s"'`(,]\d*\.?\d+m?s\b)/.test(l));
t.check("JS の動きに ms の直書きが無い（KN.motion.ms か var(--m-*)）", !jsMs.length, jsMs.slice(0, 5).join(" "));
const jsDur = scan(js, (l) => /\bduration:[^,}]*\d{3,}/.test(l));
t.check("JS の duration: に数の直書きが無い", !jsDur.length, jsDur.slice(0, 5).join(" "));

t.done();
