/* 季節の絵を加工する（3.0 の E1。docs/roadmap-3.0.md・docs/season-art.md）。**ローカルで一度だけ**回す道具。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tools/season-art.js

   読む：tools/season-src/kNN.{jpg,jpeg,png,webp,tif}
         NN は春分の初候から数えた候の番号 00〜71（js/season.js の `k`）。元の絵は大きいのでコミットしない
         （.gitignore 済み）。出どころ（所蔵・作者・題・URL）を docs/season-art.md に書いた絵だけを置くこと。
   書く：img/season/kNN.webp —— 短い辺 720px（大きくはしない）・彩度を落とす・少しぼかす・WebP で
         **1枚25KBまで**（質を下げて収める）。72枚で2MBを超えたら止めて言う。
   出す：候ごとの平均の色（参考。下地には使わない——浮世絵の平均はどれも紙のくすんだ灰色で季節の色に
         ならない。docs/season-art.md）。

   画像の処理は Playwright の Chromium の canvas で行う（sharp などを足さない）。 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "tools", "season-src");
const OUT = path.join(ROOT, "img", "season");
const MAX_ONE = 25 * 1024;
const MAX_ALL = 2 * 1024 * 1024;
const SHORT = 720;

(async () => {
  if (!fs.existsSync(SRC)) { console.log(`絵がありません：${path.relative(ROOT, SRC)}/kNN.jpg を置いてください`); return; }
  const files = fs.readdirSync(SRC).filter((f) => /^k\d{2}\.(jpe?g|png|webp|tiff?)$/i.test(f)).sort();
  if (!files.length) { console.log("kNN.jpg の形の絵がありません"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const rows = [];
  let total = 0;
  for (const f of files) {
    const k = Number(f.slice(1, 3));
    if (k > 71) continue;
    const mime = /png$/i.test(f) ? "image/png" : /webp$/i.test(f) ? "image/webp" : /tiff?$/i.test(f) ? "image/tiff" : "image/jpeg";
    const data = `data:${mime};base64,${fs.readFileSync(path.join(SRC, f)).toString("base64")}`;
    const r = await page.evaluate(async ([src, SHORT, MAX_ONE]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const k = Math.min(1, SHORT / Math.min(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.filter = "saturate(55%) blur(1.2px)";
      ctx.drawImage(img, 0, 0, w, h);
      /* 平均の色（縮めた写しで） */
      const sm = document.createElement("canvas");
      sm.width = 32; sm.height = 32;
      const sx = sm.getContext("2d");
      sx.drawImage(cv, 0, 0, 32, 32);
      const px = sx.getImageData(0, 0, 32, 32).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < px.length; i += 4) { sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2]; }
      const n = px.length / 4;
      const color = "#" + sum.map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("");
      const blobOf = (q) => new Promise((res) => cv.toBlob(res, "image/webp", q));
      let q = 0.72, blob = await blobOf(q);
      while (blob.size > MAX_ONE && q > 0.2) { q -= 0.06; blob = await blobOf(q); }
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return { w, h, q: Math.round(q * 100) / 100, size: blob.size, color, b64: btoa(bin) };
    }, [data, SHORT, MAX_ONE]);
    if (r.size > MAX_ONE) { console.log(`k${String(k).padStart(2, "0")}：25KB に収まりません（${r.size}B）。切り抜いてから置いてください`); continue; }
    const out = path.join(OUT, `k${String(k).padStart(2, "0")}.webp`);
    fs.writeFileSync(out, Buffer.from(r.b64, "base64"));
    total += r.size;
    rows.push({ k, file: path.relative(ROOT, out), size: r.size, q: r.q, w: r.w, h: r.h, color: r.color });
  }
  await browser.close();
  rows.forEach((x) => console.log(`k${String(x.k).padStart(2, "0")}  ${x.w}×${x.h}  ${(x.size / 1024).toFixed(1)}KB  質${x.q}  平均 ${x.color}`));
  console.log(`合計 ${(total / 1024).toFixed(0)}KB（${rows.length}枚）`);
  if (total > MAX_ALL) { console.log("2MB を超えました。質を下げるか、枚数を減らしてください（同じ節気の隣の候と分け合ってよい）"); process.exitCode = 1; }
})();
