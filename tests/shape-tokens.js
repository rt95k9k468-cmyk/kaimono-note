/* 形の札の見張り（docs/look.md の「形の札」。総点検 Y1・Y2・Y3、2026年10月21日）。門。画面は開かない。

   - 見出しは墨（主色は押せる・選んでいる・いまの三つ）。頭の絵だけ主色
   - 見方の切り替え（`.seg`）の選んでいる札を、主色で塗り直さない
   - 体重の期間は `.seg`（丸札の chipRow に戻さない）
   - 紙の頭（`.sheet-hero`）は一つの顔：淡い地（--cat-fill）に墨の字。黒を混ぜた地・白い字に戻さない

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/shape-tokens.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("shape-tokens");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = ["css/base.css", "css/components.css", "css/screens.css"].map(read).join("\n");
/* 規則の一覧（@media の中も一段だけ平らに）。 */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
const has = (sel) => rules.filter((r) => r.sel.split(",").some((s) => s.trim() === sel));
const colorOf = (body) => ((/(?:^|[;\s])color:\s*([^;]+)/.exec(body) || [])[1] || "").trim();

const HEADS = [".section-title.is-block-head", ".diet-hero-label", ".arc-log-head h2", ".arc-stack-head h2",
  ".arc-counts-head", ".notes-tree .nt-row.is-head"];
const bad = HEADS.filter((h) => !has(h).length || has(h).some((r) => colorOf(r.body) && !/^var\(--c-text\)/.test(colorOf(r.body))));
t.check("見出しの字は墨（--c-text）", !bad.length, bad.join(" "));
t.check("見出しの頭の絵は主色", has(".section-title.is-block-head svg").some((r) => colorOf(r.body) === "var(--c-primary)"));

const fill = rules.filter((r) => /\.seg-btn\[aria-pressed="?true"?\]/.test(r.sel) && /background[^;]*--c-primary/.test(r.body));
t.check("選んでいる `.seg` の札を主色で塗らない", !fill.length, fill.map((r) => r.sel).join(" | "));

const diet = read("js/screen-diet.js");
t.check("体重の期間は `.seg`（丸札に戻さない）",
  /class="seg diet-range js-range"/.test(diet) && !/chipRow\([^)]*js-range/.test(diet));

const hero = has(".sheet-hero");
t.check("紙の頭は淡い地（--cat-fill）に墨の字",
  hero.some((r) => /background:[^;]*--cat-fill/.test(r.body) && colorOf(r.body) === "var(--c-text)")
    && !hero.some((r) => /#000/.test(r.body)), hero.map((r) => r.body.trim()).join(" | "));
const white = rules.filter((r) => /\.(sheet-hero|hero-cap|hero-title|hero-facts|hero-fact)\b/.test(r.sel)
  && !/hero-node|todo-dot/.test(r.sel) && /(?:^|[;\s])color:\s*#fff\b/.test(r.body));
t.check("紙の頭の字を白に戻さない（粒の中の絵だけ白）", !white.length, white.map((r) => r.sel).join(" | "));
t.check("品物の紙は頭の地を別に持たない（一つの顔）", !has(".sheet-hero.pd-hero").length);

t.done();
