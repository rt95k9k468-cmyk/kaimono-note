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

t.done();
