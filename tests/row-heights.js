/* 行の背丈は三つの見張り（roadmap-unify の U12、docs/look.md の「行の背丈は三つ」）。

   一、base.css の :root に --row-h-compact 44・--row-h 52・--row-h-two 64 がある。
   二、当て表の行は、どれも決めた段の札で min-height を持つ（数の直書きでなく）。
   三、名前が行（-row・.row・-item）の規則に、36〜72px の min-height の直書きが戻ってこない。
      時間割の行は道の目盛り（screen-todo.js の TL_FREE_H と組）なので外す。
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/row-heights.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("row-heights");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (f) => strip(fs.readFileSync(path.join(ROOT, f), "utf8"));

const base = read("css/base.css");
const root = base.slice(base.indexOf(":root {"), base.indexOf("}", base.indexOf(":root {")));
for (const [n, v] of [["--row-h-compact", 44], ["--row-h", 52], ["--row-h-two", 64]]) {
  t.check(`:root に ${n}: ${v}px`, new RegExp(`${n}\\s*:\\s*${v}px`).test(root));
}

const src = ["css/components.css", "css/screens.css"].map(read).join("\n");
const rules = [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
const minh = (r) => (r.body.match(/(?:^|[;\s])min-height\s*:\s*([^;]+)/) || [])[1];

/* 当て表（docs/look.md と同じ順）。選択子は、その行の背丈を決めている規則そのもの。 */
const TABLE = [
  ["二行", "--row-h-two", [".item-wrap:not(.is-tile-wrap) .item:not(.todo)", ".arc-row", ".arc-log-row", ".price-row"]],
  ["ふつう", "--row-h", [".row", ".set-row", "#screen-settings .row", "#screen-settings .manage-row", ".manage-row",
    ".d-row", ".act-row", ".tw-row", ".ac-item", ".notes-trash-row", ".log-row"]],
  ["詰めた", "--row-h-compact", [".urge-row", ".note-pop-item", ".low-row", ".up-row", ".sa-row"]],
];
for (const [name, tok, sels] of TABLE) {
  for (const s of sels) {
    const r = rules.find((x) => x.sel === s && minh(x));
    const v = r && minh(r).trim();
    t.check(`${s} は${name}の段（${tok}）`, v === `var(${tok})`, v || "min-height が無い");
  }
}
t.check("当て表は二十", TABLE.reduce((n, x) => n + x[2].length, 0) === 20);

/* 設定のスイッチ行だけ 56 だった——段の外の背丈を、別の名前で戻さない。 */
t.check(".set-row.is-sw に背丈を持たせない", !rules.some((r) => /\.set-row\.is-sw$/.test(r.sel) && minh(r)));

const ROW = /(-row|\.row|-item)(\b|$)/;
const EXEMPT = /\.tl-free-row|\.tl-rail/;
const loose = rules.filter((r) => r.sel.split(",").some((s) => ROW.test(s.trim().split(/[\s>+~]/).pop().replace(/:[a-z-]+(\(.*\))?/g, "")))
  && !EXEMPT.test(r.sel) && /^(3[6-9]|[4-6]\d|7[0-2])px$/.test((minh(r) || "").trim()));
t.check("行の規則に 36〜72px の min-height の直書きが無い", !loose.length,
  loose.map((r) => `${r.sel} { min-height: ${minh(r).trim()} }`).join("\n      "));

t.done();
