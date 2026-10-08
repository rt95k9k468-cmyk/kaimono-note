/* 札の高さは二つ・絵は二段の見張り（roadmap-unify の U14、docs/look.md の「札の高さと絵の大きさ」）。

   一、札（.chip・.btn-sm・.seg-btn・.dest-chip ほか）の背丈は 40（ふつう）か 32（行の中の小さい札）。
   二、.seg-btn の角は --r-sm。
   三、絵（svg・.p-icon・.ui-ico・.empty-svg）の大きさを px で直に書くのは「入れもの」だけ——
      その行に /* 入れもの：… *\/ と理由を書く。ほかは var(--ico) か var(--ico-sm)。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/chip-icon-size.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("chip-icon-size");
const FILES = ["css/base.css", "css/components.css", "css/screens.css"];
const raw = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = FILES.flatMap((f) => [...strip(raw[f]).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] })));
const prop = (r, p) => ((r.body.match(new RegExp(`(?:^|[;\\s])${p}\\s*:\\s*([^;]+)`)) || [])[1] || "").trim();

/* 一・二 */
const CHIPS = [[".chip", "height", "40px"], [".btn-sm", "height", "40px"], [".seg-btn", "min-height", "40px"],
  [".dest-chip", "min-height", "40px"], [".time-row .chip", "height", "32px"], [".note-labels .chip", "height", "32px"],
  [".sa-link", "min-height", "32px"], [".tl-done-toggle", "min-height", "32px"]];
for (const [s, p, v] of CHIPS) {
  const r = rules.find((x) => x.sel === s && prop(x, p));
  t.check(`${s} の ${p} は ${v}`, r && prop(r, p) === v, r ? prop(r, p) : "規則が無い");
}
const seg = rules.find((x) => x.sel === ".seg-btn" && prop(x, "border-radius"));
t.check(".seg-btn の角は --r-sm", seg && prop(seg, "border-radius") === "var(--r-sm)");

/* 三：行ごとに見る（理由のコメントがその行にあるか） */
const ICON = /(svg|\.p-icon|\.ui-ico|\.empty-svg)\b[^,{]*$/;
const bad = [];
for (const f of FILES) {
  let sel = "";
  raw[f].split("\n").forEach((line, i) => {
    const open = line.indexOf("{");
    if (open >= 0) sel = line.slice(0, open).trim();
    if (!sel.split(",").some((s) => ICON.test(s.trim()))) return;
    if (/(^|[\s;{])width\s*:\s*\d+px/.test(line) && !/入れもの/.test(line)) bad.push(`${f}:${i + 1}  ${line.trim()}`);
    if (line.includes("}")) sel = "";
  });
}
t.check("絵の px の直書きは入れものだけ（理由つき）", !bad.length, bad.join("\n      "));

/* 四：絵の表（js/icons*.js）で同じ鍵を一つの { } に二度書かない（docs/log/inspection.md の「絵の二重定義」）。
   同じ鍵は後が勝つので、前の絵が黙って消える。字・コメントを読み飛ばし、{ ごとに鍵を数える。 */
const dupKeys = (src) => {
  const out = [], stack = [];
  let i = 0, line = 1, prev = "{";
  const push = () => stack.push({ brace: true, keys: new Set() });
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith("//", i)) { i = src.indexOf("\n", i); if (i < 0) break; continue; }
    if (src.startsWith("/*", i)) { const e = src.indexOf("*/", i + 2); line += src.slice(i, e).split("\n").length - 1; i = e + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === "\\") j++; if (src[j] === "\n") line++; j++; }
      const word = src.slice(i + 1, j);
      i = j + 1;
      if (c !== "`" && (prev === "{" || prev === ",") && /^\s*:/.test(src.slice(i, i + 4))) prev = "key:" + word;
      else prev = "str";
      if (prev.startsWith("key:")) { const top = stack[stack.length - 1]; const k = prev.slice(4); if (top && top.brace) { if (top.keys.has(k)) out.push(`${k}（${line}行）`); top.keys.add(k); } }
      continue;
    }
    const w = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80));
    if (w) {
      i += w[0].length;
      const top = stack[stack.length - 1];
      if ((prev === "{" || prev === ",") && top && top.brace && /^\s*:/.test(src.slice(i, i + 4))) {
        if (top.keys.has(w[0])) out.push(`${w[0]}（${line}行）`);
        top.keys.add(w[0]);
      }
      prev = "id";
      continue;
    }
    if (c === "{") push();
    else if (c === "(" || c === "[") stack.push({ brace: false });
    else if (c === "}" || c === ")" || c === "]") stack.pop();
    prev = c;
    i++;
  }
  return out;
};
const ICON_FILES = fs.readdirSync(path.join(ROOT, "js")).filter((f) => /^icons.*\.js$/.test(f));
t.check("絵の表が五つより多い", ICON_FILES.length > 5, ICON_FILES.join(" "));
for (const f of ICON_FILES) {
  const d = dupKeys(fs.readFileSync(path.join(ROOT, "js", f), "utf8"));
  t.check(`js/${f} に同じ鍵の二度書きが無い`, !d.length, d.join(" "));
}

t.done();
