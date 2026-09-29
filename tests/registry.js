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

t.done();
