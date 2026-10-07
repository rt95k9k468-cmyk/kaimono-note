/* 押したときの返事は三種の見張り（roadmap-unify の U6、docs/motion.md の「押したときの返事は三種」）。

   一、base.css の :root に名前が五つある（--press-wide・--press-dot・--press-sink・--press-fade・--press-off）。
   二、:active の中に数字の `scale`・`opacity` が無く、`transform` で縮めない（倍率は `scale:` で、名前で）。
      ＋だけは膨らむ（css/screens.css の .add-fab）ので外す。
   三、押せないときの薄さは --press-off 一つ。
   四、行と升の地は --press-sink へ沈む。主な行（買うもの・用事・ノート・アーカイブ）は一拍おいてから、
      用事の行は持ち上がったら・運んでいるあいだは沈まない。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/press-dict.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("press-dict");
const FILES = ["css/base.css", "css/components.css", "css/screens.css"];
const src = FILES.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");

/* いちばん内側の「選択子 { 宣言 }」を全部（@media の中も）。 */
const rules = [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] }));

const base = fs.readFileSync(path.join(ROOT, "css/base.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const root = base.slice(base.indexOf(":root {"), base.indexOf("}", base.indexOf(":root {")));
for (const n of ["--press-wide", "--press-dot", "--press-sink", "--press-fade", "--press-off"]) {
  t.check(`:root に ${n}`, new RegExp(`${n}\\s*:`).test(root));
}

const active = rules.filter((r) => r.sel.includes(":active"));
t.check(":active を三十個より多く読めた", active.length > 30, `${active.length} 個`);
const SWELL = /^\.add-fab(\.is-open)?:active$/;
const num = active.filter((r) => !SWELL.test(r.sel)
  && (/(^|[;\s])(scale|opacity)\s*:\s*[\d.]/.test(r.body) || /(^|[;\s])transform\s*:[^;]*scale\(/.test(r.body)));
t.check(":active の中に数字の scale・opacity・transform の縮みが無い", !num.length,
  num.map((r) => `${r.sel} { ${r.body.trim()} }`).join("\n      "));

const off = rules.filter((r) => /:disabled|\[disabled\]|\[aria-disabled="true"\]/.test(r.sel)
  && /(^|[;\s])opacity\s*:/.test(r.body) && !/opacity\s*:\s*var\(--press-off\)/.test(r.body));
t.check("押せないときの薄さは --press-off 一つ", !off.length, off.map((r) => r.sel).join(" / "));

const surf = active.filter((r) => /background\s*:\s*var\(--c-surface-2\)/.test(r.body) && !/is-years/.test(r.sel));
t.check(":active の地は --c-surface-2 でなく --press-sink", !surf.length, surf.map((r) => r.sel).join(" / "));

const ROWS = [
  ["買うもの", /\.item\b.*:has\(> \.item-body:active\)/],
  ["用事", /\.tl-row:not\(\.is-lifted\):not\(\.is-dragging \*\):has\(\.tl-open:active\)/],
  ["ノート", /\.note-row\.is-card:has\(> \.note-open:active\)/],
  ["アーカイブ", /\.arc-row:has\(> \.arc-row-body:active\)/],
  ["設定", /^\.set-row:active$/],
  ["暦の升", /^\.cal-day:active$/],
];
for (const [name, re] of ROWS) {
  const r = rules.find((x) => re.test(x.sel));
  t.check(`${name}の行は沈む（--press-sink）`, !!r && /var\(--press-sink\)/.test(r.body), r ? r.sel : "規則が無い");
  t.check(`${name}の行は一拍おいて沈む`, !!r && /transition(-delay)?\s*:[^;]*var\(--m-press\)/.test(r.body));
}

t.done();
