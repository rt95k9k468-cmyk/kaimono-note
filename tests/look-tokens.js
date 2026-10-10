/* 見た目の札の見張り（V12、docs/look.md の「見た目の札の表」）。

   base.css の `:root` にある色・影・角・余白・字・太さ・行の高さの札が、どれも表に
   載っているか（逆に、表にあって :root に無い名前も落とす）。そして、札と同じ値の
   直書き（太さ・角・行の高さ・19/24px の字）が CSS と JS に戻っていないか。
   暗い面は二度書いてある（システムに従う `@media (prefers-color-scheme: dark)` の
   `:root:not([data-theme="light"])…` と、自分で選んだ `:root[data-theme="dark"]…`）。その組が
   一行も違わないか（roadmap-unify の U3。片方だけ直すと、片方の暗い面だけ色がずれる）。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/look-tokens.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("look-tokens");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const base = read("css/base.css");
const root = base.slice(base.indexOf(":root {"), base.indexOf("@media (prefers-color-scheme: dark)"));
const FAM = /(--(?:c|shadow|r|sp|fs|fw|lh|row)-[a-z0-9-]+)\s*:/g;
const defined = new Set([...root.matchAll(FAM)].map((m) => m[1]));

const doc = fs.readFileSync(path.join(ROOT, "docs/look.md"), "utf8");
const from = doc.indexOf("### 見た目の札の表");
const to = doc.indexOf("\n### ", from + 1);
const sec = from < 0 ? "" : doc.slice(from, to < 0 ? undefined : to);
t.check("docs/look.md に「見た目の札の表」の節がある", !!sec);
const listed = new Set();
sec.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| 種類"))
  .forEach((l) => l.split("|")[2].replace(/`(--[a-z0-9-]+)`/g, (_, n) => listed.add(n)));

t.check("札が六十個より多い", defined.size > 60, `:root から ${defined.size} 個`);
const missing = [...defined].filter((n) => !listed.has(n));
t.check(":root の札がどれも表にある", !missing.length, missing.join(" "));
const stale = [...listed].filter((n) => !defined.has(n));
t.check("表の札がどれも :root にある", !stale.length, stale.join(" "));

/* 直書きの見張り。札の定義の行（`--xx:`）は数えない。 */
const files = ["css/base.css", "css/components.css", "css/screens.css",
  ...fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => `js/${f}`)];
const RULES = [
  ["字の太さは札で（400/700 も直に書かない）", /font-weight:\s*\d/],
  ["角は札と同じ値を直に書かない", /border-radius:\s*(8|12|16|22|999)px\s*[;}!]/],
  ["行の高さは札と同じ値を直に書かない", /line-height:\s*(1\.2|1\.6|1\.75)\s*[;}!]/],
  ["19px・24px の字は札で", /calc\((19|24)px \* var\(--fs-k\)\)/],
];
for (const [name, re] of RULES) {
  const hits = [];
  for (const f of files) {
    read(f).split("\n").forEach((l, i) => {
      if (/^\s*--[a-z0-9-]+\s*:/.test(l)) return;
      if (re.test(l)) hits.push(`${f}:${i + 1}`);
    });
  }
  t.check(name, !hits.length, hits.slice(0, 5).join(" "));
}

/* 暗い面の二度書き。CSS を規則の木にして、@media の中の `:root:not([data-theme="light"])X` を
   `:root[data-theme="dark"]X` に読み替え、@media の外の同じ選択子と宣言を一つずつ照らす。 */
function rules(src, media = null, out = []) {
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    for (; j < src.length && depth; j++) depth += src[j] === "{" ? 1 : src[j] === "}" ? -1 : 0;
    const body = src.slice(open + 1, j - 1);
    if (head.startsWith("@media")) rules(body, head, out);
    else if (!head.startsWith("@")) out.push({ media, sels: head.split(",").map((x) => x.trim().replace(/\s+/g, " ")), body });
    i = j;
  }
  return out;
}
const decls = (body) => body.split(";").map((d) => d.trim().replace(/\s+/g, " ")).filter(Boolean);
const LIGHT = ':root:not([data-theme="light"])', DARK = ':root[data-theme="dark"]';
const sys = new Map(), own = new Map();
const put = (m, k, list) => { if (!m.has(k)) m.set(k, new Set()); list.forEach((d) => m.get(k).add(d)); };
for (const f of ["css/base.css", "css/components.css", "css/screens.css"]) {
  for (const r of rules(read(f))) {
    const dark = r.media && /prefers-color-scheme:\s*dark/.test(r.media);
    /* ほかの条件（`prefers-contrast: more` など）と並べた暗い面は、同じ条件の中の `[data-theme="dark"]` と組む。 */
    const rest = dark ? r.media.replace(/\s*and\s*\(prefers-color-scheme:\s*dark\)|\(prefers-color-scheme:\s*dark\)\s*(and\s*)?/, "").replace(/^@media\s*$/, "").trim() : r.media;
    const at = rest ? `${rest} ` : "";
    for (const sel of r.sels) {
      if (dark && sel.startsWith(LIGHT)) put(sys, `${f} ${at}${DARK}${sel.slice(LIGHT.length)}`, decls(r.body));
      else if (!dark && sel.startsWith(DARK)) put(own, `${f} ${at}${sel}`, decls(r.body));
    }
  }
}
t.check("暗い面の二度書きが十組より多い", sys.size > 10, `${sys.size} 組`);
const diff = [];
for (const k of new Set([...sys.keys(), ...own.keys()])) {
  const a = sys.get(k) || new Set(), b = own.get(k) || new Set();
  const onlyA = [...a].filter((d) => !b.has(d)), onlyB = [...b].filter((d) => !a.has(d));
  if (onlyA.length) diff.push(`${k} — @media にだけ: ${onlyA.join("; ")}`);
  if (onlyB.length) diff.push(`${k} — [data-theme="dark"] にだけ: ${onlyB.join("; ")}`);
}
t.check("暗い面の @media と [data-theme=\"dark\"] が一行も違わない", !diff.length, diff.slice(0, 5).join("\n      "));

t.done();
