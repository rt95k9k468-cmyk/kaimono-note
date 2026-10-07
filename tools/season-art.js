/* 季節の絵を加工する（3.0 の E1。docs/roadmap-3.0.md・docs/season-art.md）。**ローカルで一度だけ**回す道具。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tools/season-art.js        （浮世絵）
             NODE_PATH=/opt/node22/lib/node_modules node tools/season-art.js photo  （写真：tools/season-photo-src → img/season-photo）
             NODE_PATH=/opt/node22/lib/node_modules node tools/season-art.js sky    （帯の空：tools/sky-src → img/sky。docs/sky.md）

   読む：tools/season-src/kNN.{jpg,jpeg,png,webp,tif}
         NN は春分の初候から数えた候の番号 00〜71（js/season.js の `k`）。元の絵は大きいのでコミットしない
         （.gitignore 済み）。出どころ（所蔵・作者・題・URL）を docs/season-art.md に書いた絵だけを置くこと。
   書く：img/season/kNN.webp —— 短い辺 720px（大きくはしない）・彩度を落とす・少しぼかす・WebP で
         **1枚25KBまで**（質を下げて収める）。72枚で2MBを超えたら止めて言う。
   出す：候ごとの平均の色（参考。下地には使わない——浮世絵の平均はどれも紙のくすんだ灰色で季節の色に
         ならない。docs/season-art.md）。

   空（sky）：tools/sky-src/<札>.jpg（季節ごとにするときは <季節>-<札>.jpg）→ img/sky/ に同じ名前の .webp。
         帯の幅いっぱいに上から敷くので**正方形**に切る（幅 390 の iPhone で、月に開いた暦の高さまで届く。
         週では上の空だけ、月では下の景色まで）。左右のどこを残すかは `CROP`（中心の位置、0〜1）。彩度は落とさない
         （上に幕を重ねて淡くなるので）。

   画像の処理は Playwright の Chromium の canvas で行う（sharp などを足さない）。 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const SKY = process.argv[2] === "sky";
const PHOTO = process.argv[2] === "photo" || SKY;
const SRC = path.join(ROOT, "tools", SKY ? "sky-src" : PHOTO ? "season-photo-src" : "season-src");
const OUT = path.join(ROOT, "img", SKY ? "sky" : PHOTO ? "season-photo" : "season");
const MAX_ONE = 25 * 1024;
const MAX_ALL = 2 * 1024 * 1024;
const SHORT = 720;
/* 写真は細かいので少し強くぼかす（25KB に収めるため。背景に薄く敷くので形が分かれば足りる） */
const BLUR = PHOTO ? 2 : 1.2;
const SATURATE = SKY ? 100 : 55;
/* 空：正方形に切るとき、左右のどこを中心に残すか（札ごと。無ければ真ん中）。元の写真に合わせて決めた（docs/sky.md の表） */
const CROP = { morning: 0.55, evening: 0.4, night: 0.55 };
const NAME = SKY ? /^((?:[a-z]+-)?(morning|day|evening|night))\.(jpe?g|png|webp|tiff?)$/i : /^(k(\d{2}))\.(jpe?g|png|webp|tiff?)$/i;

(async () => {
  const want = SKY ? "<札>.jpg" : "kNN.jpg";
  if (!fs.existsSync(SRC)) { console.log(`絵がありません：${path.relative(ROOT, SRC)}/${want} を置いてください`); return; }
  const files = fs.readdirSync(SRC).filter((f) => NAME.test(f)).sort();
  if (!files.length) { console.log(`${want} の形の絵がありません`); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const rows = [];
  let total = 0;
  for (const f of files) {
    const [, name, part] = f.match(NAME);
    if (!SKY && Number(part) > 71) continue;
    const crop = SKY ? (CROP[part.toLowerCase()] ?? 0.5) : null;
    const mime = /png$/i.test(f) ? "image/png" : /webp$/i.test(f) ? "image/webp" : /tiff?$/i.test(f) ? "image/tiff" : "image/jpeg";
    const data = `data:${mime};base64,${fs.readFileSync(path.join(SRC, f)).toString("base64")}`;
    const r = await page.evaluate(async ([src, SHORT, MAX_ONE, BLUR, SATURATE, crop]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      /* 空は正方形に切る（短い辺の長さで、crop を中心に。はみ出すなら端に寄せる） */
      const iw = img.naturalWidth, ih = img.naturalHeight, side = Math.min(iw, ih);
      const sw = crop == null ? iw : side, sh = crop == null ? ih : side;
      const cx = crop == null ? 0 : Math.max(0, Math.min(iw - side, Math.round(iw * crop - side / 2)));
      const cy = crop == null ? 0 : Math.round((ih - side) / 2);
      const k = Math.min(1, SHORT / Math.min(sw, sh));
      const w = Math.round(sw * k), h = Math.round(sh * k);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.filter = `saturate(${SATURATE}%) blur(${BLUR}px)`;
      ctx.drawImage(img, cx, cy, sw, sh, 0, 0, w, h);
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
    }, [data, SHORT, MAX_ONE, BLUR, SATURATE, crop]);
    if (r.size > MAX_ONE) { console.log(`${name}：25KB に収まりません（${r.size}B）。切り抜いてから置いてください`); continue; }
    const out = path.join(OUT, `${name}.webp`);
    fs.writeFileSync(out, Buffer.from(r.b64, "base64"));
    total += r.size;
    rows.push({ name, file: path.relative(ROOT, out), size: r.size, q: r.q, w: r.w, h: r.h, color: r.color });
  }
  await browser.close();
  rows.forEach((x) => console.log(`${x.name}  ${x.w}×${x.h}  ${(x.size / 1024).toFixed(1)}KB  質${x.q}  平均 ${x.color}`));
  console.log(`合計 ${(total / 1024).toFixed(0)}KB（${rows.length}枚）`);
  if (total > MAX_ALL) { console.log("2MB を超えました。質を下げるか、枚数を減らしてください（同じ節気の隣の候と分け合ってよい）"); process.exitCode = 1; }
})();
