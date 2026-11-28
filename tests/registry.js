/* 3か所の登録（R21）。読むだけ・ブラウザは使わない。

   新しい .js は index.html（<script src>）・sw.js（ASSETS）・build-standalone.js（JS）の
   3か所に要る（CLAUDE.md）。一つだけ足し忘れると、電波のある試験では通り、iPhone で
   電波の無いときにだけ壊れる（sw.js の控えに無いので）。それを見る。

   厳密に言うと：三つが**同じ順で間違っている**もの（R15 の drinks.js の順）は、ここでは
   捕まらない。捕まえるのは restore-practice などの動かす試験。 */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/** `const NAME = [ ... ];` の中の字だけを順に拾う。 */
function arrayOf(src, name) {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`${name} が見つからない`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
function firstDiff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `${i + 1}番目：${a[i] || "（なし）"} ／ ${b[i] || "（なし）"}`;
  }
  return "";
}

const t = checker("registry");

const index = read("index.html");
const sw = read("sw.js");
const build = read("build-standalone.js");

const indexJs = [...index.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const indexCss = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
const indexLinks = [...index.matchAll(/<link rel="(icon|manifest|apple-touch-icon)" href="([^"]+)"/g)]
  .map((m) => ({ rel: m[1], href: m[2] }));
const assets = arrayOf(sw, "ASSETS");
const assetsJs = assets.filter((a) => a.startsWith("js/"));
const assetsCss = assets.filter((a) => a.startsWith("css/"));
const buildJs = arrayOf(build, "JS");
const buildCss = arrayOf(build, "CSS");
const files = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => `js/${f}`);

t.check(`index.html が読むスクリプトは js/ だけ（${indexJs.length}本）`,
  indexJs.length > 0 && indexJs.every((s) => s.startsWith("js/")),
  indexJs.filter((s) => !s.startsWith("js/")).join(", "));
t.check("sw.js の ASSETS の js が index.html と同じ並び", same(indexJs, assetsJs), firstDiff(indexJs, assetsJs));
t.check("build-standalone.js の JS が index.html と同じ並び", same(indexJs, buildJs), firstDiff(indexJs, buildJs));

const notLoaded = files.filter((f) => !indexJs.includes(f));
t.check("js/ のファイルがどれも index.html に載っている", !notLoaded.length, notLoaded.join(", "));
const missing = indexJs.filter((f) => !files.includes(f));
t.check("index.html の読むファイルがどれも js/ にある", !missing.length, missing.join(", "));
const dup = indexJs.filter((f, i) => indexJs.indexOf(f) !== i);
t.check("同じスクリプトを二度読まない", !dup.length, dup.join(", "));

t.check(`css が三つとも同じ並び（${indexCss.length}枚）`,
  indexCss.length > 0 && same(indexCss, assetsCss) && same(indexCss, buildCss),
  `index ${indexCss.join(",")} / sw ${assetsCss.join(",")} / build ${buildCss.join(",")}`);

/* 絵と manifest。apple-touch-icon は、ホーム画面に置くとき（電波のあるとき）にだけ
   読まれるので、控えに無くてよい。 */
const offlineLinks = indexLinks.filter((l) => l.rel !== "apple-touch-icon");
const linkMissing = offlineLinks.filter((l) => !assets.includes(l.href)).map((l) => l.href);
t.check("index.html の絵・manifest が ASSETS にある", offlineLinks.length >= 2 && !linkMissing.length,
  linkMissing.join(", "));
t.check("ASSETS に入口（./ と index.html）がある", assets.includes("./") && assets.includes("index.html"));

const absent = assets.filter((a) => a !== "./" && !fs.existsSync(path.join(ROOT, a)));
t.check("ASSETS のファイルがどれも在る（無いと、入れるときに黙って飛ばされる）", !absent.length, absent.join(", "));
const dupAssets = assets.filter((a, i) => assets.indexOf(a) !== i);
t.check("ASSETS に同じものが二度無い", !dupAssets.length, dupAssets.join(", "));

const testsIn = [...assets, ...buildJs].filter((a) => a.startsWith("tests/"));
t.check("試験の台本はサイトの登録に入っていない", !testsIn.length, testsIn.join(", "));

/* sw.js が文として読めるか（2026年9月29日、置き換えの残りで sw.js が壊れ、Service Worker
   ごと入らなくなった——手元の bell 試験で捕まえた）。門でも見る。 */
{
  let err = "";
  try { new (require("vm").Script)(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), { filename: "sw.js" }); }
  catch (e) { err = String(e); }
  t.check("sw.js が文として読める", !err, err);
}

/* Actions は SHA に留め、試験の道具は lock どおりに入れる（監-10、2026年11月23日）。動くタグは
   持ち主が差し替えれば黙って中身が変わる。上げるときは SHA と「# vX.Y.Z」を一緒に。 */
{
  const dir = path.join(ROOT, ".github/workflows");
  const wf = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  const loose = [], noLock = [];
  for (const f of wf) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/^\s*-?\s*uses:\s*(\S+)(.*)$/gm)) {
      if (!/@[0-9a-f]{40}$/.test(m[1]) || !/#\s*v\d+\.\d+\.\d+/.test(m[2])) loose.push(`${f}: ${m[1]}`);
    }
    if (/npm install\b/.test(src)) noLock.push(f);
  }
  t.check(`Actions がどれも SHA ＋「# vX.Y.Z」で留めてある（${wf.length}本）`, wf.length > 0 && !loose.length, loose.join(", "));
  t.check("workflow は npm ci で入れる（npm install は lock を書き換えうる）", !noLock.length, noLock.join(", "));
  let lockOk = "";
  try {
    const pkg = JSON.parse(read("tests/package.json"));
    const lock = JSON.parse(read("tests/package-lock.json"));
    const root = (lock.packages || {})[""] || {};
    for (const [k, v] of Object.entries(pkg.dependencies || {})) {
      if (!/^\d+\.\d+\.\d+$/.test(v)) lockOk += `${k} は版を一つに（${v}） `;
      if ((root.dependencies || {})[k] !== v) lockOk += `${k} が lock と違う `;
      if ((lock.packages[`node_modules/${k}`] || {}).version !== v) lockOk += `${k} の入る版が違う `;
    }
  } catch (e) { lockOk = String(e); }
  t.check("tests/package-lock.json が package.json と合う", !lockOk, lockOk.trim());
}

/* 大きさの上限（docs/dev.md「短く書く」の「一手を軽く」）。門でも落とす（2026年11月15日、利用者が決めた。
   門で警報だけだと、翌朝の全部で赤くなっていた）。
   数えるのは字（Array.from ではなく length。比べるだけなので足りる）。カテゴリの合計なので、
   ファイルどうしの移動・分割は増えない。生成物・外のもの（dist・node_modules・tools/season-src・
   tools/vendor）は数えない。上げるのは利用者の OK があるときだけ。 */
const CAP = { js: 3580000, css: 580000, tests: 245, docs: 900000, claude: 3450, indexRow: 60 };
{
  const SKIP = new Set([".git", "node_modules", "dist", "tools/season-src", "tools/vendor"]);
  const all = [];
  (function walk(rel) {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      /* node_modules はどの深さでも数えない：CI は tests/ に playwright を入れるので、その CSS で毎日の全部だけ赤くなった（#45）。 */
      if (SKIP.has(p) || e.name === "node_modules") continue;
      if (e.isDirectory()) walk(p); else all.push(p);
    }
  })("");
  const size = (list) => list.reduce((s, p) => s + read(p).length, 0);
  const got = {
    js: size(all.filter((p) => p.endsWith(".js") && !p.startsWith("tests/"))),
    css: size(all.filter((p) => p.endsWith(".css"))),
    tests: all.filter((p) => /^tests\/[^/]+\.js$/.test(p)).length,
    docs: size(all.filter((p) => p.startsWith("docs/"))),
    claude: read("CLAUDE.md").length,
    indexRow: Math.max(...read("tests/INDEX.md").split("\n").filter((l) => l.startsWith("| `"))
      .map((l) => Array.from(l.split("|").slice(2, -1).join("|").trim()).length)),
  };
  const label = { js: "JS（試験除く）の字", css: "CSS の字", tests: "試験の本数", docs: "docs の字",
    claude: "CLAUDE.md の字", indexRow: "tests/INDEX.md の一行の字" };
  for (const k of Object.keys(CAP)) {
    t.check(`大きさ：${label[k]} ${got[k].toLocaleString()} ≦ ${CAP[k].toLocaleString()}`,
      got[k] <= CAP[k], "減らすか、利用者の OK を得て CAP を上げる");
  }
}
t.done();
