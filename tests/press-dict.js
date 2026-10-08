/* 押したときの返事は三種の見張り（roadmap-unify の U6、docs/motion.md の「押したときの返事は三種」）。

   一、base.css の :root に名前が五つある（--press-wide・--press-dot・--press-sink・--press-fade・--press-off）。
   二、:active の中に数字の `scale`・`opacity` が無く、`transform` で縮めない（倍率は `scale:` で、名前で）。
      ＋だけは膨らむ（css/screens.css の .add-fab）ので外す。
   三、押せないときの薄さは --press-off 一つ。
   四、行と升の地は --press-sink へ沈む。主な行（買うもの・用事・ノート・アーカイブ）は一拍おいてから、
      用事の行は持ち上がったら・運んでいるあいだは沈まない。
   五、押しても見た目が何も変わらなかったもの（2026年10月9日の実測の33種）も、名前で返事をする。
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

/* 五、押しても見た目が何も変わらなかったもの（2026年10月9日の実測）も、名前で返事をする。
   字だけの行は一拍おいて薄まる。道の空いたところは、透明な線の下の道が沈む。 */
const QUIET = [
  ["買うものの絵の丸", /\.item-emoji:active/], ["今日買ったものの開け閉め", /\.day-bought-toggle:active/],
  ["品物の紙の★", /\.pd-fav:active/], ["行く日を決める帯", /\.trip-plan-btn:active/],
  ["価格の行", /\.product:has\(> \.product-main:active\)/], ["価格のタイル", /\.product\.is-tile:has\(> \.product-main:active\)/],
  ["道の札", /\.road-label:active/], ["道具箱の丸", /\.road-tool:active/], ["連れの丸", /\.road-bead:active/],
  ["「これから」の行", /\.tl-someday \.tl-row.*:active/], ["「これから」の見出し", /\.tl-someday-add:active/],
  ["はみ出しの一行", /\.tl-over:active/], ["済んだものの開け閉め", /\.tl-done-toggle:active/],
  ["食事の枠", /\.diet-slot-view.*:active/], ["体重", /\.diet-hero-main:active/], ["体の数の三つ", /\.diet-stat:active/],
  ["AI推計の帯", /\.diet-memo-open:active/], ["日記の行", /\.arc-log-row:active/], ["積み上げの行", /\.arc-feed-row:active/],
  ["記録の種類の札", /\.arc-pick-b:active/], ["本／論文", /\.arc-kind-b:active/], ["ノートの道具", /\.note-tool.*:active/],
  ["ノートブック", /\.note-nb-btn:active/], ["書いた日時", /\.note-when:active/], ["月の升", /\.mp-cell:active/],
  ["これからの二週間の一枚", /\.up-day:active/], ["日付・時刻の欄", /\.when-btn:active/], ["ドラムの行", /\.note-wheel-row:active/],
  ["切り替え", /\.seg-btn:active/], ["色の丸", /\.accent-dot:active/], ["畳んだ説明の見出し", /\.set-more > summary:active/],
  ["トーストの「元に戻す」", /\.toast-action:active/],
];
for (const [name, re] of QUIET) {
  const r = rules.find((x) => re.test(x.sel));
  t.check(`${name}は押したら返事をする（--press-*）`, !!r && /var\(--press-(wide|dot|sink|fade)\)/.test(r.body), r ? r.sel : "規則が無い");
}
for (const [name, re] of [["日記の行", /\.arc-log-row:active/], ["積み上げの行", /\.arc-feed-row:active/],
  ["食事の枠", /\.diet-slot-view.*:active/], ["ドラムの行", /\.note-wheel-row:active/], ["「これから」の行", /\.tl-someday \.tl-row.*:active/]]) {
  const r = rules.find((x) => re.test(x.sel));
  t.check(`${name}は一拍おいて返事をする`, !!r && /transition(-delay)?\s*:[^;]*var\(--m-press\)/.test(r.body));
}
const road = rules.find((x) => /\.day-road:has\(\.road-free:active\) \.road-base/.test(x.sel));
t.check("道の空いたところを押したら、道が一拍おいて沈む", !!road && /stroke\s*:/.test(road.body)
  && /var\(--m-press\)/.test(road.body), road ? road.sel : "規則が無い");

t.done();
