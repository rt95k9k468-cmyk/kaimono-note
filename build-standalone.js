#!/usr/bin/env node
/* =========================================================
   かいものノート — single-file build

   Inlines every stylesheet, script and icon into one .html
   file that runs straight from disk (no server, no network).

     node build-standalone.js

   Writes:
     dist/kaimono-note.html            full document, save & open anywhere
     dist/kaimono-note.fragment.html   body-only, for hosts that supply <head>
     dist/web/index.html               same app, but registers the worker below
     dist/web/sw.js                    offline cache for the two-file deploy

   The dist/web pair is the whole app in two files — drop them at the root of
   any static host for an installable, offline-capable PWA.
   ========================================================= */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "dist");

const CSS = ["css/base.css", "css/components.css", "css/screens.css"];

// Load order matters: utilities, then state, then UI, then screens, then boot.
const JS = [
  "js/util.js",
  "js/product-icons.js",
  "js/store.js",
  "js/ui.js",
  "js/reorder.js",
  "js/backup.js",
  "js/insights.js",
  "js/pull-refresh.js",
  "js/product-sheet.js",
  "js/screen-list.js",
  "js/screen-prices.js",
  "js/screen-compare.js",
  "js/screen-settings.js",
  "js/app.js",
];

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const readB64 = (p) => fs.readFileSync(path.join(ROOT, p)).toString("base64");

/** Keep a literal "</script>" inside JS from closing the tag it lives in. */
const safeForScriptTag = (js) => js.replace(/<\/(script)/gi, "<\\/$1");

const css = CSS.map((f) => `/* ---- ${f} ---- */\n${read(f)}`).join("\n");
const js = JS.map((f) => `/* ---- ${f} ---- */\n${safeForScriptTag(read(f))}`).join("\n");

const iconSvg = `data:image/svg+xml;base64,${readB64("icons/icon.svg")}`;
const iconPng = `data:image/png;base64,${readB64("icons/apple-touch-icon.png")}`;

// The app shell, lifted from index.html so the two cannot drift apart.
const indexHtml = read("index.html");
const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<script/i);
if (!bodyMatch) throw new Error("could not locate the app shell in index.html");
const shell = bodyMatch[1].trim();

const manifest = {
  name: "かいものノート",
  short_name: "かいもの",
  start_url: ".",
  scope: ".",
  display: "standalone",
  background_color: "#f4f6f3",
  theme_color: "#2f8f5b",
  icons: [{ src: iconPng, sizes: "180x180", type: "image/png" }],
};
const manifestUri =
  "data:application/manifest+json;base64," +
  Buffer.from(JSON.stringify(manifest), "utf8").toString("base64");

const head = `
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>かいものノート</title>
<meta name="description" content="買い物リストと、店ごとの値段くらべ。どのお店が一番安いかがすぐ分かる買い物メモアプリ。">
<meta name="theme-color" content="#2f8f5b">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="かいものノート">
<link rel="manifest" href="${manifestUri}">
<link rel="icon" href="${iconSvg}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${iconPng}">
<style>
${css}
</style>`.trim();

const bodyContent = `
${shell}

<script>window.KN_STANDALONE = true;</script>
<script>
${js}
</script>`.trim();

const fullDoc = `<!DOCTYPE html>
<html lang="ja">
<head>
${head}
</head>
<body>
${bodyContent}
</body>
</html>
`;

// Fragment build: no <head>, so carry the title and styles inline instead.
const fragment = `<title>かいものノート</title>
<style>
${css}
</style>

${bodyContent}
`;

/* ---- two-file deploy: index.html + sw.js ---- */

// Same document, minus the standalone flag, so app.js registers ./sw.js.
const webIndex = fullDoc.replace(
  '<script>window.KN_STANDALONE = true;</script>\n',
  ""
);

const webSw = `/* かいものノート — offline cache for the two-file deploy. */
const CACHE = "kaimono-note-inline-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(["./", "./index.html"]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Everything the app needs is inside index.html, so serve that for any
  // navigation and fall back to the cached copy when the network is gone.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  e.respondWith(caches.match(req).then((c) => c || fetch(req)));
});
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, "web"), { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "kaimono-note.html"), fullDoc);
fs.writeFileSync(path.join(OUT_DIR, "kaimono-note.fragment.html"), fragment);
fs.writeFileSync(path.join(OUT_DIR, "web", "index.html"), webIndex);
fs.writeFileSync(path.join(OUT_DIR, "web", "sw.js"), webSw);

const kb = (s) => (Buffer.byteLength(s, "utf8") / 1024).toFixed(0) + " KB";
console.log("dist/kaimono-note.html          ", kb(fullDoc));
console.log("dist/kaimono-note.fragment.html ", kb(fragment));
console.log("dist/web/index.html             ", kb(webIndex));
console.log("dist/web/sw.js                  ", kb(webSw));
