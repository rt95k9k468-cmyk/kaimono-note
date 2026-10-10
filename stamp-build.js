#!/usr/bin/env node
/* =========================================================
   くらしノート — stamp the build id into the deployed files

     GITHUB_SHA=<sha> node stamp-build.js

   Run against the files being published, never committed back.

   Three jobs:

   1. sw.js gets the build id as its cache name. Browsers only reinstall a
      service worker when its bytes change, so a fixed name would freeze the
      cache and installed apps would never see another update.

   2. Every css/js URL gets a ?v=<その中身の印> query (sha-256 の頭), in
      index.html and in the worker's precache list alike. A file that did not
      change keeps its URL, so the worker's install copies it from the previous
      cache instead of fetching it again (roadmap-seamless の N3). A file that
      did change gets a new URL, which misses an older worker's cache-first
      lookup and falls through to the network — that is what still rescues an
      app carrying an older worker.

   3. index.html gets the build id in <meta name="kn-build">. That is the
      版の札 (errlog.js・app.js の runningVersion) now that ?v= is per file.
   ========================================================= */

const fs = require("fs");
const crypto = require("crypto");

const VERSION = process.env.GITHUB_SHA || process.argv[2] || "dev";

/* すでに ?v=… が付いているものも拾って、**付け替えます**。

   ここは一度こわしました。刻印は「配るファイルに対してだけ走らせて、
   commit には戻さない」約束でしたが、手元で走らせた結果をそのまま
   commit してしまい、次に CI が走ったときには全部の URL がもう
   ?v=dev を持っていて、一つも見つからず落ちました。

   「何も刻印できなかった」を失敗と見るのは正しい——名前を変えたのに
   一覧を直し忘れた、を捕まえるための番人です。ただ、**もう刻印されて
   いる**のは「見つからない」ではありません。番人はそのままに、二度目も
   通るようにします。 */
const ASSET_URL = /((?:src|href)=")((?:css|js)\/[A-Za-z0-9._-]+)(?:\?v=[^"]*)?(")/g;
const PRECACHE_URL = /"((?:css|js)\/[A-Za-z0-9._-]+)(?:\?v=[^"]*)?"/g;
const VERSION_LINE = /^const VERSION = .*$/m;
const BUILD_META = /(<meta name="kn-build" content=")[^"]*(">)/g;

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

/* 中身の印：sha-256 の頭12桁（sw.js の sound() が同じ求め方で確かめる）。 */
const marks = new Map();
function mark(url) {
  if (!marks.has(url)) {
    if (!fs.existsSync(url)) fail(`${url}: 参照されているのにファイルが無い`);
    marks.set(url, crypto.createHash("sha256").update(fs.readFileSync(url)).digest("hex").slice(0, 12));
  }
  return marks.get(url);
}

/* ---- sw.js: cache name + precache URLs ---- */
let sw = fs.readFileSync("sw.js", "utf8");

if (!VERSION_LINE.test(sw)) fail("sw.js: VERSION 行が見つからない（キャッシュ名が固定のままになる）");
sw = sw.replace(VERSION_LINE, `const VERSION = "${VERSION}";`);
if (!sw.includes(`const VERSION = "${VERSION}";`)) fail("sw.js: VERSION の置換結果が一致しない");

const swMarks = new Map();
sw = sw.replace(PRECACHE_URL, (m, url) => { swMarks.set(url, mark(url)); return `"${url}?v=${mark(url)}"`; });
if (!swMarks.size) fail("sw.js: プリキャッシュ対象の css/js が見つからない");
fs.writeFileSync("sw.js", sw);

/* ---- index.html: script and stylesheet URLs + 版の札 ---- */
let html = fs.readFileSync("index.html", "utf8");
const htmlMarks = new Map();
html = html.replace(ASSET_URL, (m, pre, url, post) => { htmlMarks.set(url, mark(url)); return `${pre}${url}?v=${mark(url)}${post}`; });
if (!htmlMarks.size) fail("index.html: 印を付ける css/js の参照が見つからない");
let metas = 0;
html = html.replace(BUILD_META, (m, pre, post) => { metas++; return `${pre}${VERSION}${post}`; });
if (metas !== 1) fail(`index.html: 版の札 <meta name="kn-build"> が ${metas} 個（1個のはず）`);
fs.writeFileSync("index.html", html);

/* The two lists have to agree, or the worker precaches URLs the page never
   asks for and the page fetches URLs the worker never stored. */
if (swMarks.size !== htmlMarks.size) {
  fail(`刻印数が一致しない: sw.js=${swMarks.size} index.html=${htmlMarks.size}`);
}
/* 印が二つで食い違う（片方にしか無い・違う印）も落とす。 */
for (const [url, v] of htmlMarks) {
  if (swMarks.get(url) !== v) fail(`印が一致しない: ${url} index.html=${v} sw.js=${swMarks.get(url) || "なし"}`);
}

console.log(`stamped ${VERSION}: sw.js ${swMarks.size}件 / index.html ${htmlMarks.size}件（中身の印）`);
