/* ノートのスキャン（js/note-scan.js・js/scan-core.js。docs/notes.md「スキャン」）。

   合成の場面（3Dで傾けた A4 を焦点距離のあるカメラで写す。暗い机＋照明ムラと色かぶり／明るい机＋影／
   指が縁に／正面に近い／紙なし）で：四隅のずれ（対角の0.2%以内）・縦横比（A4 にそろう）／仕上げ（書類・
   カラーの紙の白さとムラ・色かぶり・朱と蛍光ペン・字の濃さ、そのままはムラが残る、縁に残った机は白く）／
   字の帯（横書き・縦書き）と行の割り当て（欠けた行を飛ばす）／字入りの PDF（xref・JPEG のまま・
   字の層をページごとに照合・行の帯の位置・縦書きは回した行列・題・pdftotext）／
   ＋の「書く」「スキャン」→ すぐカメラ（captureStream をカメラの代わりに）：自動で撮る・止まったままなら
   二枚目を撮らない・めくると次を撮る・シャッター／並べる面：撮りかけを開き直しで続ける（再読み込み）・
   並べ替え・四隅（隅・辺・拡大の丸・自動へ戻す）・回す・仕上げの切り替えを覚える・「字」（読ませる画像に
   ページの印）→「貼る」（印の番号でページへ・読み違い・空白）・
   保存（画像の行・原本の行・PDF の行、原本は仕上げた大きさ、PDF の字・検索、撮りかけを消す）／
   閉じる（あとで続ける・捨てる）／カメラが使えない日は「カメラ・写真」・写真から（明るい机）・原本は
   縮めない／映らない流れは一度開き直して最初の面へ／Worker が使えない日もこの場で仕上がる。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-scan.js */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { open, checker } = require("./lib");

/* ---- PDF の字の層を取り出す（ToUnicode と各ページの Tm・Tj） ---- */
function pdfText(buf) {
  const s = buf.toString("latin1");
  const objs = new Map();
  const re = /(\d+) 0 obj\n/g;
  let m;
  while ((m = re.exec(s))) objs.set(Number(m[1]), m.index);
  const body = (n) => s.slice(objs.get(n), s.indexOf("\nendobj", objs.get(n)));
  const streamOf = (n) => { const b = body(n); return b.slice(b.indexOf("stream\n") + 7, b.lastIndexOf("\nendstream")); };
  const sx = Number(/startxref\n(\d+)/.exec(s)[1]);
  const xr = s.slice(sx).split("\n");
  const count = Number(xr[1].split(" ")[1]);
  let xrefOk = xr[0] === "xref";
  for (let i = 1; i < count; i++) if (!s.startsWith(`${i} 0 obj`, Number(xr[2 + i].slice(0, 10)))) xrefOk = false;
  const tu = Number(/\/ToUnicode (\d+) 0 R/.exec(body(3))[1]);
  const map = new Map();
  for (const mm of streamOf(tu).matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)) {
    const units = [];
    for (let i = 0; i < mm[2].length; i += 4) units.push(parseInt(mm[2].slice(i, i + 4), 16));
    map.set(mm[1], String.fromCharCode(...units));
  }
  const kids = /\/Kids \[([^\]]*)\]/.exec(body(2))[1].match(/\d+ 0 R/g).map((k) => Number(k.split(" ")[0]));
  const pages = kids.map((k) => {
    const pg = body(k);
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pg).slice(1).map(Number);
    const cs = streamOf(Number(/\/Contents (\d+) 0 R/.exec(pg)[1]));
    const runs = [...cs.matchAll(/([-\d. ]+) Tm\n<([0-9A-F]*)> Tj/g)].map((x) => ({
      tm: x[1].trim().split(/\s+/).map(Number),
      text: x[2].match(/.{4}/g).map((h) => map.get(h) || "?").join(""),
    }));
    return { box, invisible: /\b3 Tr\b/.test(cs), runs, lines: runs.map((r) => r.text) };
  });
  const info = /\/Info (\d+) 0 R/.exec(s);
  let title = "";
  if (info) {
    const hex = (/\/Title <FEFF([0-9A-F]*)>/.exec(body(Number(info[1]))) || [])[1] || "";
    const units = [];
    for (let i = 0; i < hex.length; i += 4) units.push(parseInt(hex.slice(i, i + 4), 16));
    title = String.fromCharCode(...units);
  }
  return { xrefOk, pages, title };
}

(async () => {
  const t = checker("note-scan");
  const { browser, page, errors } = await open({ noteFab: true });

  /* ---- 場面を作る道具（頁の中。再読み込みのあとも入れ直す） ---- */
  const helpers = () => page.evaluate(() => {
    const C = window.KNScanCore;
    /* A4 を3Dで傾けて、焦点距離（対角×0.6）のカメラで写した四隅。 */
    window.__proj = (W, H, ax, ay, az, fill) => {
      const f = 0.6 * Math.hypot(W, H), pw = 210, ph = 297, rad = (d) => (d * Math.PI) / 180;
      const rot = ([x, y, z]) => {
        let c = Math.cos(rad(az)), s = Math.sin(rad(az)); [x, y] = [c * x - s * y, s * x + c * y];
        c = Math.cos(rad(ax)); s = Math.sin(rad(ax)); [y, z] = [c * y - s * z, s * y + c * z];
        c = Math.cos(rad(ay)); s = Math.sin(rad(ay)); [x, z] = [c * x + s * z, -s * x + c * z];
        return [x, y, z];
      };
      const Z = (f * ph) / (H * fill);
      return [[-pw / 2, -ph / 2, 0], [pw / 2, -ph / 2, 0], [pw / 2, ph / 2, 0], [-pw / 2, ph / 2, 0]].map((p) => {
        const [x, y, z] = rot(p);
        return [W / 2 + (f * x) / (z + Z), H / 2 + (f * y) / (z + Z)];
      });
    };
    /* 紙の中身 A（字の帯・朱・蛍光ペン）と B（写真の枠と別の帯）。 */
    const paperOf = (kind, color) => {
      const PW = 840, PH = 1188;
      const pc = document.createElement("canvas");
      pc.width = PW; pc.height = PH;
      const g = pc.getContext("2d");
      g.fillStyle = `rgb(${color.join(",")})`; g.fillRect(0, 0, PW, PH);
      if (kind === "B") {
        g.fillStyle = "#777"; g.fillRect(PW * 0.1, PH * 0.08, PW * 0.8, PH * 0.3);
        g.fillStyle = "#333";
        for (let k = 0; k < 6; k++) g.fillRect(PW * 0.1, PH * (0.45 + k * 0.07), PW * (0.8 - (k % 2) * 0.3), PH * 0.016);
      } else {
        g.fillStyle = "#333";
        for (let k = 0; k < 9; k++) g.fillRect(PW * 0.1, PH * (0.1 + k * 0.04), PW * 0.8 * (1 - (k % 3) * 0.2), PH * 0.014);
        g.fillStyle = "rgb(200,30,40)"; g.fillRect(PW * 0.4, PH * 0.55, PW * 0.15, PH * 0.07);
        g.fillStyle = "rgb(255,240,60)"; g.fillRect(PW * 0.6, PH * 0.5, PW * 0.3, PH * 0.06);
      }
      return { P: g.getImageData(0, 0, PW, PH).data, PW, PH };
    };
    window.__mk = (W, H, o) => {
      const { P, PW, PH } = paperOf(o.kind || "A", o.paper || [248, 246, 240]);
      const Hm = C.homography(o.quad, [[0, 0], [PW, 0], [PW, PH], [0, PH]]);
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const out = cv.getContext("2d").createImageData(W, H);
      const d = out.data, ss = o.ss || 1, cast = o.cast || [1, 1, 1];
      let seed = 5;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let r = 0, g = 0, b = 0;
          for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
            const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
            const [u, v] = C.mapPt(Hm, px, py);
            const shade = 1 - (o.shade || 0) * ((px / W) * 0.6 + (py / H) * 0.4);
            let c;
            if (u >= 0 && v >= 0 && u < PW && v < PH) {
              const p = ((v | 0) * PW + (u | 0)) * 4;
              c = [P[p] * shade * cast[0], P[p + 1] * shade * cast[1], P[p + 2] * shade * cast[2]];
            } else {
              const n = rnd() * (o.noise == null ? 14 : o.noise);
              c = o.bg.map((q) => q + n);
              if (o.shadow) {
                const [uu, vv] = C.mapPt(Hm, px - W * 0.01, py - H * 0.012);
                if (uu >= 0 && vv >= 0 && uu < PW && vv < PH) c = c.map((q) => q * 0.82);
              }
            }
            if (o.hand) {
              const dx = (px - o.hand[0]) / o.hand[2], dy = (py - o.hand[1]) / o.hand[3];
              if (dx * dx + dy * dy < 1) c = [205, 150, 120];
            }
            r += c[0]; g += c[1]; b += c[2];
          }
          const i = (y * W + x) * 4;
          const k = ss * ss;
          d[i] = r / k; d[i + 1] = g / k; d[i + 2] = b / k; d[i + 3] = 255;
        }
      }
      cv.getContext("2d").putImageData(out, 0, 0);
      return cv;
    };
    window.__b64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
  });
  await helpers();

  /* ---- 射影 ---- */
  const geo = await page.evaluate(() => {
    const q = [[520, 260], [2750, 420], [2600, 2250], [380, 2050]];
    const Hm = KNScanCore.homography([[0, 0], [100, 0], [100, 50], [0, 50]], q);
    return Math.max(...[[0, 0], [100, 0], [100, 50], [0, 50]].map(([x, y], i) => { const p = KNScanCore.mapPt(Hm, x, y); return Math.hypot(p[0] - q[i][0], p[1] - q[i][1]); }));
  });
  t.check("射影：四隅が四隅へ移る", geo < 1e-6, String(geo));

  /* ---- 四隅の推定と縦横比（場面ごと） ---- */
  const scenes = await page.evaluate(() => {
    const W = 1600, H = 1200, diag = Math.hypot(W, H);
    const list = [
      ["暗い机・照明ムラ", __proj(W, H, 28, -12, 8, 0.7), { bg: [50, 40, 32], shade: 0.4 }],
      ["明るい机・影", __proj(W, H, 20, 15, -5, 0.68), { bg: [205, 200, 192], paper: [250, 250, 250], noise: 6, shadow: true }],
      ["指が縁に", __proj(W, H, 25, 5, 12, 0.7), { bg: [60, 45, 38], paper: [245, 244, 238], hand: [560, 640, 90, 60] }],
      ["正面に近い", __proj(W, H, 3, 2, 1, 0.8), { bg: [70, 60, 50], paper: [240, 238, 232] }],
    ];
    return list.map(([name, quad, o]) => {
      const cv = __mk(W, H, { ...o, quad, ss: 2 });
      const r = KN.scan.locate(cv);
      const err = r.found ? Math.max(...r.quad.map((p, i) => Math.hypot(p[0] - quad[i][0], p[1] - quad[i][1]))) / diag : 1;
      const sz = KNScanCore.outSize(r.quad, W, H);
      const raw = KNScanCore.aspect(r.quad, W, H);
      cv.width = 1; cv.height = 1;
      return { name, found: r.found, err, ratio: sz.ratio, raw };
    });
  });
  scenes.forEach((s) => {
    t.check(`四隅（${s.name}）：見つかる・ずれは対角の0.2%以内`, s.found && s.err < 0.002, `${(s.err * 100).toFixed(3)}%`);
    t.check(`縦横比（${s.name}）：紙の本当の比（A4 の±2%）→ A4 にそろう`,
      Math.abs(s.raw / Math.SQRT1_2 - 1) < 0.02 && s.ratio === Math.SQRT1_2, `${s.raw} → ${s.ratio}`);
  });
  const none = await page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = 800; cv.height = 600;
    const g = cv.getContext("2d");
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgb(${100 + (i * 37) % 60},${90 + (i * 53) % 50},${80 + (i * 29) % 40})`; g.fillRect((i * 97) % 800, (i * 61) % 600, 40, 30); }
    return KN.scan.locate(cv).found;
  });
  t.check("四隅：紙が無ければ見つからない（内側の枠）", none === false);

  /* ---- 仕上げ ---- */
  const fin = await page.evaluate(() => {
    const C = KNScanCore;
    const W = 1600, H = 1200;
    const quad = __proj(W, H, 28, -12, 8, 0.7);
    const cv = __mk(W, H, { quad, bg: [50, 40, 32], shade: 0.6, cast: [1, 0.97, 0.9] });
    const src = cv.getContext("2d").getImageData(0, 0, W, H);
    const stat = (img) => {
      const { width: w, height: h, data: d } = img;
      const region = (x0, y0, x1, y1) => {
        const L = [], R = [], G = [], B = [];
        for (let y = Math.round(y0 * h); y < Math.round(y1 * h); y += 2) for (let x = Math.round(x0 * w); x < Math.round(x1 * w); x += 2) {
          const o = (y * w + x) * 4;
          R.push(d[o]); G.push(d[o + 1]); B.push(d[o + 2]); L.push(d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114);
        }
        const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
        const so = L.slice().sort((a, b) => a - b);
        return { L: mean(L), r: mean(R), g: mean(G), b: mean(B), p5: so[Math.floor(so.length * 0.05)] };
      };
      return {
        w, h,
        blankA: region(0.08, 0.72, 0.30, 0.92), blankB: region(0.70, 0.72, 0.92, 0.92), blankC: region(0.70, 0.05, 0.92, 0.09),
        red: region(0.42, 0.565, 0.53, 0.605), hi: region(0.63, 0.51, 0.87, 0.55), ink: region(0.2, 0.1015, 0.8, 0.1125),
      };
    };
    const res = {};
    const sz = C.outSize(quad, W, H);
    for (const mode of ["doc", "color", "raw"]) {
      const img = C.warp(src, quad, sz.w, sz.h, true);
      C.finish(img, mode);
      res[mode] = stat(img);
    }
    /* 四隅を外へ1.5%広げる（机が縁に残る）→ 書類で縁が白い。 */
    const cx = quad.reduce((s, p) => s + p[0], 0) / 4, cy = quad.reduce((s, p) => s + p[1], 0) / 4;
    const wide = quad.map(([x, y]) => [cx + (x - cx) * 1.03, cy + (y - cy) * 1.03]);
    const sw = C.outSize(wide, W, H);
    const img = C.warp(src, wide, sw.w, sw.h, false);
    C.finish(img, "doc");
    const band = Math.round(Math.min(img.width, img.height) * 0.006);
    let s = 0, n = 0;
    for (let y = 0; y < img.height; y += 3) for (let x = 0; x < img.width; x += 3) {
      if (x > band && y > band && x < img.width - band && y < img.height - band) continue;
      const o = (y * img.width + x) * 4;
      s += img.data[o] * 0.299 + img.data[o + 1] * 0.587 + img.data[o + 2] * 0.114; n++;
    }
    res.edge = s / n;
    res.size = sz;
    cv.width = 1; cv.height = 1;
    return res;
  });
  const spread = (m) => Math.max(m.blankA.L, m.blankB.L, m.blankC.L) - Math.min(m.blankA.L, m.blankB.L, m.blankC.L);
  t.check("補正：A4 の比・縮めない大きさ", Math.abs(fin.size.h / fin.size.w - Math.SQRT2) < 0.01 && fin.raw.w === fin.size.w, JSON.stringify(fin.size));
  t.check("そのまま：照明ムラが残る（試験が効いている）", spread(fin.raw) > 15, String(spread(fin.raw)));
  for (const mode of ["doc", "color"]) {
    const m = fin[mode];
    const name = mode === "doc" ? "書類" : "カラー";
    t.check(`${name}：紙は白い（平均248以上・下5%も235以上）`, [m.blankA, m.blankB, m.blankC].every((r) => r.L >= 248 && r.p5 >= 235),
      JSON.stringify([m.blankA, m.blankB, m.blankC].map((r) => [Math.round(r.L), Math.round(r.p5)])));
    t.check(`${name}：ムラが消える（白の差6以内）`, spread(m) <= 6, String(spread(m)));
    t.check(`${name}：色かぶりが消える（紙の R と B の差8以内）`, Math.abs(m.blankB.r - m.blankB.b) <= 8, JSON.stringify(m.blankB));
    t.check(`${name}：朱が残る`, m.red.r > 150 && m.red.g < 110 && m.red.b < 110, JSON.stringify(m.red));
    t.check(`${name}：蛍光ペンが残る`, m.hi.r > 200 && m.hi.g > 190 && m.hi.b < 170, JSON.stringify(m.hi));
    t.check(`${name}：字は濃い`, m.ink.L < 110, JSON.stringify(m.ink));
  }
  t.check("書類：縁に残った机は白く", fin.edge > 245, String(fin.edge));

  /* ---- 字の帯と行の割り当て ---- */
  const lay = await page.evaluate(() => {
    const C = KNScanCore;
    const PW = 800, PH = 1130;
    const page1 = new Uint8ClampedArray(PW * PH * 4).fill(255);
    const bars = [0.9, 0.7, 0.85, 0.5, 0.88, 0.3];
    bars.forEach((b, k) => {
      const y0 = Math.round(PH * (0.1 + k * 0.05));
      for (let y = y0; y < y0 + 18; y++) for (let x = Math.round(PW * 0.1); x < Math.round(PW * b); x++) { const i = (y * PW + x) * 4; page1[i] = page1[i + 1] = page1[i + 2] = 30; }
    });
    const h = C.bands({ width: PW, height: PH, data: page1 });
    const lines = bars.map((b) => "あ".repeat(Math.round(((b - 0.1) * PW) / 18)));
    const all = C.place(lines, h, PW, PH).map((s) => s.y0);
    const miss = lines.slice(); miss.splice(2, 1);
    const skip = C.place(miss, h, PW, PH).map((s) => s.y0);
    const page2 = new Uint8ClampedArray(PW * PH * 4).fill(255);
    for (let k = 0; k < 7; k++) {
      const x0 = Math.round(PW * (0.85 - k * 0.1));
      for (let y = Math.round(PH * 0.1); y < Math.round(PH * (0.9 - (k % 3) * 0.15)); y++) for (let x = x0; x < x0 + 20; x++) { const i = (y * PW + x) * 4; page2[i] = page2[i + 1] = page2[i + 2] = 30; }
    }
    const v = C.bands({ width: PW, height: PH, data: page2 });
    return { h, all, skip, v, b64a: null };
  });
  t.check("字の帯：横書きの行を上から6本", !lay.h.vertical && lay.h.bands.length === 6 && Math.abs(lay.h.bands[0].y0 - 0.1) < 0.003, JSON.stringify(lay.h.bands.map((b) => b.y0)));
  t.check("字の帯：行はそれぞれの帯へ", lay.all.every((y, i) => Math.abs(y - (0.1 + i * 0.05)) < 0.003), JSON.stringify(lay.all));
  t.check("字の帯：欠けた行の帯は飛ばす", JSON.stringify(lay.skip.map((y) => Math.round(y * 100))) === JSON.stringify([10, 15, 25, 30, 35]), JSON.stringify(lay.skip));
  t.check("字の帯：縦書きは列を右から", lay.v.vertical && lay.v.bands.length === 7 && lay.v.bands[0].x0 > lay.v.bands[1].x0, JSON.stringify(lay.v.bands.map((b) => b.x0)));

  /* ---- 字入りの PDF ---- */
  const TEXTS = ["スキャンの字\n二行目 ABC 123\n三行目", "𠮷野家の𠮷と「朱」\n縦の二列目"];
  const pdf = await page.evaluate(async ([texts, h, v]) => {
    const mk = async (w, hh, color) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = hh;
      const g = c.getContext("2d");
      g.fillStyle = color; g.fillRect(0, 0, w, hh);
      const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
      return new Uint8Array(await b.arrayBuffer());
    };
    const j1 = await mk(420, 594, "#eee"), j2 = await mk(420, 594, "#ddd");
    const lay1 = { vertical: false, bands: h.bands.slice(0, 3) };
    const lay2 = { vertical: true, bands: v.bands.slice(0, 2) };
    const bytes = KNScanCore.makePdf([
      { jpeg: j1, w: 420, h: 594, text: texts[0], layout: lay1 },
      { jpeg: j2, w: 420, h: 594, text: texts[1], layout: lay2 },
    ], { title: "スキャン 試験" });
    return { pdf: __b64(bytes), j1: __b64(j1), j2: __b64(j2), lay1 };
  }, [TEXTS, lay.h, lay.v]);
  const pbuf = Buffer.from(pdf.pdf, "base64");
  const got = pdfText(pbuf);
  t.check("PDF：xref の位置が合う", got.xrefOk);
  t.check("PDF：2ページ・字は透明（3 Tr）・A4", got.pages.length === 2 && got.pages.every((p) => p.invisible)
    && Math.abs(got.pages[0].box[0] - 595.28) < 1 && Math.abs(got.pages[0].box[1] - 841.89) < 1, JSON.stringify(got.pages.map((p) => p.box)));
  t.check("PDF：字の層を取り出すとページごとに同じ字",
    got.pages[0].lines.join("\n") === TEXTS[0] && got.pages[1].lines.join("\n") === TEXTS[1], JSON.stringify(got.pages.map((p) => p.lines)));
  const H1 = got.pages[0].box[1];
  t.check("PDF：横書きの行は字の帯の高さに置く", got.pages[0].runs.every((r, i) => {
    const b = pdf.lay1.bands[i];
    return r.tm[0] === 1 && r.tm[5] >= H1 * (1 - b.y1) - 0.5 && r.tm[5] <= H1 * (1 - b.y0) + 0.5;
  }), JSON.stringify(got.pages[0].runs.map((r) => r.tm)));
  t.check("PDF：縦書きは回した行列で列に置く", got.pages[1].runs.every((r) => r.tm[0] === 0 && r.tm[1] === -1 && r.tm[2] === 1), JSON.stringify(got.pages[1].runs.map((r) => r.tm)));
  t.check("PDF：写真は JPEG のまま埋まる（作り直さない）", pbuf.indexOf(Buffer.from(pdf.j1, "base64")) > 0 && pbuf.indexOf(Buffer.from(pdf.j2, "base64")) > 0);
  t.check("PDF：題（Info）", got.title === "スキャン 試験", got.title);
  if (!spawnSync("pdftotext", ["-v"], { encoding: "utf8" }).error) {
    const f = path.join(os.tmpdir(), `kn-scan-${process.pid}.pdf`);
    fs.writeFileSync(f, pbuf);
    const r = spawnSync("pdftotext", [f, "-"], { encoding: "utf8" });
    fs.unlinkSync(f);
    const pg = String(r.stdout || "").split("\f");
    const norm = (s) => s.replace(/\s+/g, "");
    t.check("PDF：pdftotext でも横書きの字が出る", r.status === 0 && norm(pg[0]) === norm(TEXTS[0]), JSON.stringify(pg[0]));
    t.check("PDF：pdftotext でも縦書きの字が出る（字の集まりとして）", [...norm(TEXTS[1])].every((c) => pg[1].includes(c)), JSON.stringify(pg[1]));
  }

  /* ---- ＋ →「書く」「スキャン」 ---- */
  const settled = () => page.waitForFunction(() => document.querySelector(".screen.is-active").dataset.screen === "notes"
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), null, { timeout: 4000 });
  await page.click('.tab[data-tab="notes"]');
  await settled();
  await page.waitForFunction(() => KN.noteImg.state() === "on" && KN.noteFile.state() === "on" && KN.notes.state() === "on");
  await page.click("#dock .add-fab");
  await page.waitForSelector(".fab-menu.is-on .fab-menu-b");
  const labels = await page.$$eval(".fab-menu-b .fab-menu-label", (a) => a.map((x) => x.textContent));
  t.check("＋：書く・スキャンの二つ", JSON.stringify(labels) === JSON.stringify(["書く", "スキャン"]), JSON.stringify(labels));
  await page.click(".fab-menu-b:nth-child(1)");
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });
  const openScan = async (view) => {
    if ((await page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen)) !== "notes") {
      await page.click('.tab[data-tab="notes"]');
      await settled();
    }
    await page.click("#dock .add-fab");
    /* 紙を閉じた直後の一押しは吸われることがある（閉じる動きの最中）。出なければ押し直す。 */
    if (!(await page.waitForSelector(".fab-menu.is-on .fab-menu-b", { timeout: 1500 }).then(() => true, () => false))) {
      await page.click("#dock .add-fab");
      await page.waitForSelector(".fab-menu.is-on .fab-menu-b");
    }
    await page.click(".fab-menu-b:nth-child(2)");
    await page.waitForSelector(`.scan.is-on[data-view=${view}]`, { timeout: 10000 });
  };

  /* ---- カメラ（captureStream をカメラの代わりに。紙 A → めくって B） ---- */
  const camStub = () => page.evaluate(() => {
    const W = 1280, H = 960;
    const quad = __proj(W, H, 18, -6, 4, 0.78);
    window.__camA = __mk(W, H, { quad, bg: [52, 42, 34], kind: "A" });
    window.__camB = __mk(W, H, { quad, bg: [52, 42, 34], kind: "B" });
    window.__camSrc = window.__camA;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const draw = () => g.drawImage(window.__camSrc, 0, 0);
    draw();
    setInterval(draw, 80);
    window.__gum = [];
    navigator.mediaDevices.getUserMedia = async (o) => { window.__gum.push(JSON.stringify(o)); return c.captureStream(15); };
  });
  await camStub();
  await openScan("cam");
  t.check("スキャン：すぐカメラ", true);
  t.check("カメラ：自動は既定で入・写真の口がある", (await page.getAttribute(".scan .js-auto", "aria-pressed")) === "true" && !!(await page.$(".scan .js-pick")));
  const count = () => page.$eval(".scan .js-count", (e) => e.textContent).catch(() => "");
  const one = await page.waitForFunction(() => document.querySelector(".scan .js-count").textContent === "1", null, { timeout: 10000 }).then(() => true, () => false);
  t.check("カメラ：紙が止まると自動で撮る", one);
  const seen = await page.$eval(".scan .scan-view", (c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 450) lit++;
    return lit;
  });
  t.check("カメラ：映像を canvas に写して見せる", seen > 20, String(seen));
  t.check("カメラ：最初は解像度を求めない（映ってから上げる）", (await page.evaluate(() => window.__gum)).every((g) => !/width|height/.test(g)));
  await page.waitForTimeout(2200);
  t.check("カメラ：止まったままなら二枚目を撮らない", (await count()) === "1", await count());
  await page.evaluate(() => { window.__camSrc = window.__camB; });
  const two = await page.waitForFunction(() => document.querySelector(".scan .js-count").textContent === "2", null, { timeout: 8000 }).then(() => true, () => false);
  t.check("カメラ：めくる（中身が変わる）と次を撮る", two, await count());
  await page.click(".scan .js-shutter");
  await page.waitForFunction(() => document.querySelector(".scan .js-count").textContent === "3", null, { timeout: 5000 }).catch(() => {});
  t.check("カメラ：シャッターで撮れる（連続）", (await count()) === "3", await count());
  await page.click(".scan .js-done");
  await page.waitForSelector(".scan[data-view=pages] .scan-page img[src^='blob:']", { timeout: 15000 });
  t.check("並べる：3枚・四隅は撮るときに見つけたもの", await page.evaluate(() => KN.scan.live().pages.length === 3 && KN.scan.live().pages.every((p) => p.found)));
  t.check("カメラ：並べる面へ移ると流れを止める", await page.evaluate(() => !document.querySelector(".scan video")));

  /* ---- 撮りかけを続ける（再読み込み＝iOS がアプリを落とした） ---- */
  await page.fill(".scan .scan-page:nth-child(1) .js-text", "下書きの字");
  await page.waitForTimeout(500);
  const idsBefore = await page.evaluate(() => KN.scan.live().pages.map((p) => p.id));
  await page.reload();
  const back = await page.waitForSelector(".scan.is-on[data-view=pages] .scan-page", { timeout: 15000 }).then(() => true, () => false);
  t.check("続き：開き直すと撮りかけの並べる面へ", back);
  t.check("続き：3枚・順番・字もそのまま", await page.evaluate((ids) => {
    const l = KN.scan.live();
    return !!l && JSON.stringify(l.pages.map((p) => p.id)) === JSON.stringify(ids) && l.pages[0].text === "下書きの字";
  }, idsBefore));
  await page.waitForSelector(".scan .scan-page:nth-child(3) img[src^='blob:']", { timeout: 15000 });
  await helpers();
  await camStub();

  /* ---- 並べ替え（取っ手） ---- */
  const grip = await page.$eval(".scan .scan-page:nth-child(3) .js-grip", (g) => { const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const top1 = await page.$eval(".scan .scan-page:nth-child(1)", (c) => c.getBoundingClientRect().top);
  await page.mouse.move(grip[0], grip[1]);
  await page.mouse.down();
  await page.mouse.move(grip[0], top1 + 4, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const idsAfter = await page.evaluate(() => KN.scan.live().pages.map((p) => p.id));
  t.check("並べ替え：三枚目を一番上へ", idsAfter[0] === idsBefore[2] && idsAfter[1] === idsBefore[0], JSON.stringify([idsBefore, idsAfter]));

  /* ---- 四隅を直す（隅・辺・拡大の丸・自動へ戻す） ---- */
  await page.click(".scan .scan-page:nth-child(1) .js-edit");
  await page.waitForSelector(".scan[data-view=edit] .scan-dot");
  await page.waitForTimeout(150);
  const q0 = await page.evaluate(() => KN.scan.live().pages[0].quad.map((p) => p.slice()));
  const dotAt = (h) => page.$eval(`.scan-dot[data-h='${h}']`, (d) => { const r = d.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  let p0 = await dotAt("c0");
  await page.mouse.move(p0[0], p0[1]);
  await page.mouse.down();
  await page.mouse.move(p0[0] + 14, p0[1] + 18, { steps: 4 });
  t.check("四隅：動かすあいだ拡大の丸", await page.$eval(".scan-loupe", (l) => !l.hidden));
  await page.mouse.up();
  const q1 = await page.evaluate(() => KN.scan.live().pages[0].quad.map((p) => p.slice()));
  t.check("四隅：左上を動かすと左上だけ動く", q1[0][0] > q0[0][0] + 5 && q1[0][1] > q0[0][1] + 5 && JSON.stringify(q1.slice(1)) === JSON.stringify(q0.slice(1)));
  p0 = await dotAt("e2");
  await page.mouse.move(p0[0], p0[1]);
  await page.mouse.down();
  await page.mouse.move(p0[0], p0[1] + 16, { steps: 4 });
  await page.mouse.up();
  const q2 = await page.evaluate(() => KN.scan.live().pages[0].quad.map((p) => p.slice()));
  t.check("四隅：下の辺を動かすと右下と左下が一緒に動く", q2[2][1] > q1[2][1] + 5 && q2[3][1] > q1[3][1] + 5
    && JSON.stringify(q2.slice(0, 2)) === JSON.stringify(q1.slice(0, 2)), JSON.stringify([q1, q2]));
  await page.click(".scan .js-auto-quad");
  await page.click(".scan .js-ok");
  await page.waitForSelector(".scan[data-view=pages]");
  t.check("四隅：「自動」で推定へ戻る", await page.evaluate((q) => JSON.stringify(KN.scan.live().pages[0].quad) === JSON.stringify(q), q0));

  /* ---- 回す・仕上げの切り替え ---- */
  await page.waitForSelector(".scan .scan-page:nth-child(2) img[src^='blob:']:not(.is-wait)", { timeout: 15000 });
  const before2 = await page.$eval(".scan .scan-page:nth-child(2) img", (i) => i.naturalWidth / i.naturalHeight);
  await page.click(".scan .scan-page:nth-child(2) .js-rot");
  await page.waitForFunction((r) => { const i = document.querySelector(".scan .scan-page:nth-child(2) img"); return !i.classList.contains("is-wait") && i.naturalWidth / i.naturalHeight > 1 / r - 0.05 && i.naturalWidth > i.naturalHeight; }, before2, { timeout: 15000 }).catch(() => {});
  const after2 = await page.$eval(".scan .scan-page:nth-child(2) img", (i) => i.naturalWidth / i.naturalHeight);
  t.check("回す：仕上がりが横向きになる", before2 < 1 && after2 > 1, JSON.stringify([before2, after2]));
  await page.click(".scan .scan-seg-b[data-mode=color]");
  t.check("仕上げ：カラーを覚える", await page.evaluate(() => localStorage.getItem("kn-scan-mode") === "color"));

  /* ---- 字：読ませる画像を渡す（書類の仕上げ・上の帯にページの印）→ 戻ると「貼る」→ 印でページへ ---- */
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = d; }; });
  const ready = await page.waitForFunction(() => document.querySelector(".scan .js-read").getAttribute("aria-disabled") === "false", null, { timeout: 30000 }).then(() => true, () => false);
  t.check("字：読ませる画像が揃うと押せる", ready);
  await page.click(".scan .js-read");
  await page.waitForFunction(() => !!window.__shared, null, { timeout: 5000 }).catch(() => {});
  const shared = await page.evaluate(async () => {
    const d = window.__shared;
    if (!d) return null;
    const out = [];
    for (const f of d.files) {
      const bm = await createImageBitmap(f);
      const c = document.createElement("canvas");
      c.width = bm.width; c.height = bm.height;
      const g = c.getContext("2d");
      g.drawImage(bm, 0, 0);
      const strip = g.getImageData(0, 0, bm.width, 40).data;
      let white = 0, dark = 0;
      for (let i = 0; i < strip.length; i += 4) {
        const l = strip[i] * 0.299 + strip[i + 1] * 0.587 + strip[i + 2] * 0.114;
        if (l > 240) white++; else if (l < 90) dark++;
      }
      out.push({ name: f.name, type: f.type, long: Math.max(bm.width, bm.height), white: white / (strip.length / 4), dark: dark / (strip.length / 4) });
    }
    return out;
  });
  t.check("字：三枚の JPEG（scan-1〜3）", !!shared && JSON.stringify(shared.map((x) => [x.name, x.type])) === JSON.stringify([["scan-1.jpg", "image/jpeg"], ["scan-2.jpg", "image/jpeg"], ["scan-3.jpg", "image/jpeg"]]), JSON.stringify(shared));
  t.check("字：上の白い帯にページの印（白地に濃い字）", !!shared && shared.every((x) => x.white > 0.75 && x.dark > 0.004), JSON.stringify(shared));
  t.check("字：渡したあとは「貼る」・上の「貼る」は隠れる", await page.evaluate(() => {
    const b = document.querySelector(".scan .js-read"), top = document.querySelector(".scan .js-paste-all");
    return b.textContent.trim() === "貼る" && b.classList.contains("is-main") && (!top || top.hidden);
  }));
  const nos = await page.evaluate(() => KN.scan.live().pages.map((p) => p.no));
  /* 認識の出す字：印の順はばらばら・読み違い（空白・全角）・漢字かなのあいだの空白。 */
  const PASTE = `KNSCAN ${nos[1]}\n二 ペ ー ジ 目\nKN SCAN ${nos[0]}\n一ページ目の字\n二行目\n${String.fromCharCode(...[..."KNSCAN"].map((c) => c.charCodeAt(0) + 0xfee0))} ${nos[2]}\n三ページ目 ABC`;
  await page.evaluate((s) => { Object.defineProperty(navigator.clipboard, "readText", { value: async () => s, configurable: true }); }, PASTE);
  await page.click(".scan .js-read");
  await page.waitForFunction(() => document.querySelector(".scan .js-read").textContent.trim() === "字", null, { timeout: 3000 }).catch(() => {});
  const texts = await page.evaluate(() => KN.scan.live().pages.map((p) => p.text));
  t.check("貼る：印の番号でページへ（順・読み違い・空白によらない）", JSON.stringify(texts) === JSON.stringify(["一ページ目の字\n二行目", "二ページ目", "三ページ目 ABC"]), JSON.stringify([nos, texts]));
  t.check("貼る：「字」に戻る", (await page.$eval(".scan .js-read", (b) => b.textContent.trim())) === "字");
  t.check("貼る：分け目の読み方（---・改ページ・印が無いとき）", JSON.stringify(await page.evaluate(() => KN.scan.splitPages("a\fb\n===\nc"))) === JSON.stringify(["a", "b", "c"]));
  t.check("貼る：漢字・かなのあいだの空白を外す", await page.evaluate(() => KN.scan.tidy(" 日 本 語 の 字 ABC 123 ") === "日本語の字 ABC 123"));
  t.check("貼る：印の前の字は、印の読めなかったページへ", JSON.stringify(await page.evaluate(() => KN.scan.assign("前\nKNSCAN 1\n一", [{ no: 2 }, { no: 1 }]))) === JSON.stringify([[0, "前"], [1, "一"]]));

  /* ---- 保存 ---- */
  const fulls = await page.evaluate(async () => (await KN.scan.live().warm()).map((v) => [v.w, v.h]));
  t.check("Worker で仕上げる", await page.evaluate(() => KN.scan.workerState() === "on"));
  await page.click(".scan .js-save");
  await page.waitForSelector(".sheet.is-note.is-open", { timeout: 60000 });
  t.check("保存：スキャンの画面は閉じる", !(await page.$(".scan")));
  const saved = await page.evaluate(async () => {
    const n = KN.notes.list().find((x) => /^スキャン /.test(x.title));
    if (!n) return null;
    const lines = n.body.split("\n");
    const dims = async (bytes) => { const bm = await createImageBitmap(new Blob([bytes])); return [bm.width, bm.height]; };
    const origs = [];
    for (let i = 0; i < 3; i++) {
      const o = KN.noteFile.refOf(lines[i * 2 + 1]);
      const rec = o && await KN.noteFile.get(o.id);
      origs.push(rec ? await dims(rec.bytes) : null);
    }
    const pdfRef = KN.noteFile.refOf(lines[lines.length - 1]);
    const p = pdfRef && await KN.noteFile.get(pdfRef.id);
    const imgs = [];
    for (let i = 0; i < 3; i++) { const id = KN.noteImg.refOf(lines[i * 2]); const r = id && await KN.noteImg.get(id); imgs.push(r ? Math.max(r.w, r.h) : 0); }
    return { body: n.body, lines, origs, imgs, pdf: p ? __b64(new Uint8Array(p.bytes)) : "", ft: p ? KN.noteFile.textOf(p.id) : "",
      draft: await KN.scan.draft(), flag: localStorage.getItem("kn-scan-draft") };
  });
  t.check("保存：ノートができる", !!saved);
  if (saved) {
    const L = saved.lines;
    t.check("保存：本文は（画像の行・原本の行）×3・空行・PDF の行", L.length === 8
      && [0, 2, 4].every((i) => /^!\[\]\(img:[0-9a-f]{16}\)$/.test(L[i]))
      && [1, 3, 5].every((i, k) => new RegExp(`^\\[scan-${k + 1}\\.jpg\\]\\(file:[0-9a-f]{64}\\.jpg\\)$`).test(L[i]))
      && L[6] === "" && /\(file:[0-9a-f]{64}\.pdf\)$/.test(L[7]), saved.body);
    t.check("保存：原本は仕上げた大きさのまま", JSON.stringify(saved.origs) === JSON.stringify(fulls), JSON.stringify([saved.origs, fulls]));
    t.check("保存：見る画像は長辺1600まで", saved.imgs.every((x) => x > 0 && x <= 1600), JSON.stringify(saved.imgs));
    const sp = pdfText(Buffer.from(saved.pdf, "base64"));
    t.check("保存：PDF は3ページ・字の層はページごとに貼った字", sp.xrefOk && sp.pages.length === 3
      && sp.pages.map((p) => p.lines.join("\n")).join("|") === texts.join("|"), JSON.stringify(sp.pages.map((p) => p.lines)));
    t.check("保存：回したページは横長", sp.pages[1].box[0] > sp.pages[1].box[1] && sp.pages[0].box[0] < sp.pages[0].box[1], JSON.stringify(sp.pages.map((p) => p.box)));
    t.check("保存：PDF の字は検索に（setText。日本語の折り返しはつなぐ）", /二ページ目/.test(saved.ft) && saved.ft.includes("一ページ目の字二行目"), saved.ft);
    t.check("保存：撮りかけは消える", (!saved.draft.meta || !saved.draft.meta.pages.length) && !saved.draft.photos.length && saved.flag === null, JSON.stringify([saved.draft.meta, saved.draft.photos.length, saved.flag]));
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });

  /* ---- 閉じる：あとで続ける・捨てる ---- */
  await page.evaluate(() => { window.__camSrc = window.__camA; });
  await openScan("cam");
  await page.waitForFunction(() => document.querySelector(".scan .js-count").textContent === "1", null, { timeout: 10000 }).catch(() => {});
  await page.click(".scan .js-done");
  await page.waitForSelector(".scan[data-view=pages] .scan-page");
  await page.click(".scan .js-back");
  await page.waitForSelector(".scan-ask.is-on .scan-ask-b");
  t.check("閉じる：あとで続ける・捨てる の二つ", JSON.stringify(await page.$$eval(".scan-ask-b span", (a) => a.map((x) => x.textContent))) === JSON.stringify(["あとで続ける", "捨てる"]));
  await page.click(".scan-ask-b:nth-child(1)");
  t.check("あとで続ける：閉じて撮りかけは残る（起動では開かない）", !(await page.$(".scan")) && await page.evaluate(async () => {
    const d = await KN.scan.draft();
    const f = JSON.parse(localStorage.getItem("kn-scan-draft") || "null");
    return d.meta && d.meta.pages.length === 1 && d.photos.length === 1 && f && f.open === false;
  }));
  await openScan("pages");
  t.check("あとで続ける：＋から開くと続きの並べる面", (await page.$$(".scan .scan-page")).length === 1);
  await page.click(".scan .js-back");
  await page.waitForSelector(".scan-ask.is-on .scan-ask-b");
  await page.click(".scan-ask-b.is-danger");
  t.check("捨てる：閉じて撮りかけを消す", !(await page.$(".scan")) && await page.evaluate(async () => {
    const d = await KN.scan.draft();
    return (!d.meta || !d.meta.pages.length) && !d.photos.length && localStorage.getItem("kn-scan-draft") === null;
  }));

  /* ---- カメラが使えない日：カメラ・写真 → 写真から（明るい机）。原本は縮めない ---- */
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error("NotAllowedError"); }; });
  await openScan("start");
  t.check("カメラが使えない日：カメラ・写真", JSON.stringify(await page.$$eval(".scan-src span", (a) => a.map((x) => x.textContent))) === JSON.stringify(["カメラ", "写真"]));
  const big = await page.evaluate(async () => {
    const W = 3200, H = 2400;
    const quad = __proj(W, H, 22, 10, -6, 0.8);
    const cv = __mk(W, H, { quad, bg: [205, 200, 192], paper: [250, 250, 250], noise: 6, shadow: true });
    const b = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.95));
    cv.width = 1; cv.height = 1;
    window.__bigQuad = quad;
    return __b64(new Uint8Array(await b.arrayBuffer()));
  });
  await page.setInputFiles(".scan .js-pic-in", { name: "doc.jpg", mimeType: "image/jpeg", buffer: Buffer.from(big, "base64") });
  await page.waitForSelector(".scan[data-view=pages] .scan-page img[src^='blob:']", { timeout: 20000 });
  const bigRes = await page.evaluate(async () => {
    const l = KN.scan.live();
    const p = l.pages[0];
    const err = Math.max(...p.quad.map((v, i) => Math.hypot(v[0] - __bigQuad[i][0], v[1] - __bigQuad[i][1]))) / Math.hypot(3200, 2400);
    const v = (await l.warm())[0];
    return { found: p.found, err, w: v.w, h: v.h };
  });
  t.check("写真から：明るい机でも四隅（対角の0.2%以内）", bigRes.found && bigRes.err < 0.002, JSON.stringify(bigRes));
  t.check("写真から：原本は縮めない（長辺1600を越える・A4 の比）", Math.max(bigRes.w, bigRes.h) > 1600 && Math.abs(bigRes.h / bigRes.w - Math.SQRT2) < 0.01, JSON.stringify(bigRes));
  await page.click(".scan .js-back");
  await page.click(".scan-ask-b.is-danger");

  /* ---- 映らない流れ：一度だけ開き直して、だめなら最初の面へ ---- */
  await page.evaluate(() => {
    const dark = document.createElement("canvas");
    window.__dark = [];
    navigator.mediaDevices.getUserMedia = async () => { const s = dark.captureStream(0); window.__dark.push(s); return s; };
  });
  await openScan("cam");
  const fellBack = await page.waitForSelector(".scan[data-view=start] .scan-src", { timeout: 9000 }).then(() => true, () => false);
  t.check("映らない：最初の面へ戻る", fellBack);
  t.check("映らない：開き直しは一度・流れは止める", await page.evaluate(() => window.__dark.length === 2
    && window.__dark.every((s) => s.getTracks().every((tr) => tr.readyState === "ended"))));
  await page.keyboard.press("Escape");

  /* ---- Worker が使えない日もこの場で仕上がる ---- */
  await page.evaluate(() => KN.scan.noWorker());
  await openScan("start");
  const small = await page.evaluate(async () => {
    const W = 1200, H = 900;
    const cv = __mk(W, H, { quad: __proj(W, H, 15, 5, 3, 0.75), bg: [50, 40, 32] });
    const b = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.92));
    return __b64(new Uint8Array(await b.arrayBuffer()));
  });
  await page.setInputFiles(".scan .js-pic-in", { name: "s.jpg", mimeType: "image/jpeg", buffer: Buffer.from(small, "base64") });
  const local = await page.waitForSelector(".scan[data-view=pages] .scan-page img[src^='blob:']:not(.is-wait)", { timeout: 20000 }).then(() => true, () => false);
  t.check("Worker なし：この場で仕上がる", local && await page.evaluate(() => KN.scan.workerState() === "off"));
  await page.click(".scan .js-back");
  await page.click(".scan-ask-b.is-danger");

  t.check("頁のエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
