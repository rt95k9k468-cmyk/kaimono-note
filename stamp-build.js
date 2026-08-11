#!/usr/bin/env node
/* =========================================================
   くらしノート — stamp the build id into the deployed files

     GITHUB_SHA=<sha> node stamp-build.js

   Run against the files being published, never committed back.

   Two jobs:

   1. sw.js gets the build id as its cache name. Browsers only reinstall a
      service worker when its bytes change, so a fixed name would freeze the
      cache and installed apps would never see another update.

   2. Every css/js URL gets a ?v=<build> query, in index.html and in the
      worker's precache list alike. This is what rescues an app already
      carrying an older worker: that worker serves navigations network-first,
      so it fetches the new index.html, and the versioned asset URLs then miss
      its cache-first lookup and fall through to the network. Without it, an
      installed app keeps running the JS it cached on the day it was added to
      the home screen.
   ========================================================= */

const fs = require("fs");

const VERSION = process.env.GITHUB_SHA || process.argv[2] || "dev";
const ASSET_URL = /((?:src|href)=")((?:css|js)\/[A-Za-z0-9._-]+)(")/g;
const PRECACHE_URL = /"((?:css|js)\/[A-Za-z0-9._-]+)"/g;

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

/* ---- sw.js: cache name + precache URLs ---- */
let sw = fs.readFileSync("sw.js", "utf8");

const stamped = sw.replace(/^const VERSION = .*$/m, `const VERSION = "${VERSION}";`);
if (stamped === sw) fail("sw.js: VERSION 行が見つからず刻印できなかった（キャッシュ名が固定のままになる）");
sw = stamped;
if (!sw.includes(`const VERSION = "${VERSION}";`)) fail("sw.js: VERSION の置換結果が一致しない");

let swCount = 0;
sw = sw.replace(PRECACHE_URL, (m, url) => { swCount++; return `"${url}?v=${VERSION}"`; });
if (!swCount) fail("sw.js: プリキャッシュ対象の css/js が見つからない");
fs.writeFileSync("sw.js", sw);

/* ---- index.html: script and stylesheet URLs ---- */
let html = fs.readFileSync("index.html", "utf8");
let htmlCount = 0;
html = html.replace(ASSET_URL, (m, pre, url, post) => { htmlCount++; return `${pre}${url}?v=${VERSION}${post}`; });
if (!htmlCount) fail("index.html: バージョンを付ける css/js の参照が見つからない");
fs.writeFileSync("index.html", html);

/* The two lists have to agree, or the worker precaches URLs the page never
   asks for and the page fetches URLs the worker never stored. */
if (swCount !== htmlCount) {
  fail(`刻印数が一致しない: sw.js=${swCount} index.html=${htmlCount}`);
}

console.log(`stamped ${VERSION}: sw.js ${swCount}件 / index.html ${htmlCount}件`);
