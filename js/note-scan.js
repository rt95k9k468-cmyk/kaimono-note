/* =========================================================
   くらしノート — ノートのスキャン（`KN.scan`。docs/notes.md「スキャン」）

   ノートの＋ →「スキャン」。撮る（自前のカメラ・標準カメラ・写真）→ 四隅の推定 → 指で直す →
   台形補正 → 仕上げ（書類／カラー／そのまま）→ 字（任意）→ 保存。**端末の中だけで処理する。**

   - 保存は docs/image-design.md の決まりのまま：一枚ごとに見る画像（`KN.noteImg.add`。長辺1600）と、
     そのすぐ下に原本の行（`KN.noteFile.keep`。仕上げたままの大きさ＝画質を落とさない。画像を押すと原本）。
     終わりに字入りの PDF（`KN.noteFile.add`。中の写真は原本の JPEG をそのまま埋める＝作り直さない）。
     ファイルを先に書き、書けてから本文（参照の行）を持つノートを作る。
   - 字はアプリでは読まない。共有 → iOS のショートカット（画像からテキストを抽出）で写した字を、
     ページごとに貼る。PDF には透明な字の層（Tr 3）として書く。検索（`setText`）にも。
   - 仕上げの照明ムラは「紙の明るさの推定」で割る（2値化しない）。書類は色の薄いところだけ灰に寄せ、
     朱・蛍光ペンなど色のあるところは色のまま。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const U = KN.util;

  const MAX_PX = 16e6;          // 一枚の画素の上限（iOS の canvas の上限 16,777,216 の手前）
  const JPEG_Q = 0.95;          // 仕上げた原本の JPEG（画質を落とさない）
  const SEEK = 256;             // 四隅を探す縮図の長辺
  const PREVIEW = 1100;         // 並べて見せる仕上がりの長辺

  /* ---------------- 幾何 ---------------- */

  /** 8元の連立一次方程式（部分ピボットの消去法）。 */
  function solve(A, b) {
    const n = b.length;
    const M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c] || 1e-12;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / d;
        if (!f) continue;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r, i) => r[n] / (r[i] || 1e-12));
  }

  /** from の4点を to の4点へ移す射影（3×3 を9つの数で）。 */
  function homography(from, to) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = from[i], [u, v] = to[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    return solve(A, b).concat([1]);
  }
  const mapPt = (H, x, y) => {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /** 補正後の大きさ：向かい合う辺の長いほう（画素を間引かない）。上限を越えたら比を保って縮める。 */
  function outSize(q) {
    let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
    let h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    const k = Math.min(1, Math.sqrt(MAX_PX / Math.max(1, w * h)));
    return { w: Math.max(8, Math.round(w * k)), h: Math.max(8, Math.round(h * k)) };
  }

  /** 4点を 左上・右上・右下・左下（画面の向きで時計回り）に並べる。 */
  function order(pts) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
    const q = pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    let tl = 0;
    q.forEach((p, i) => { if (p[0] + p[1] < q[tl][0] + q[tl][1]) tl = i; });
    return q.slice(tl).concat(q.slice(0, tl)).map((p) => [p[0], p[1]]);
  }

  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const polyArea = (q) => Math.abs(q.reduce((s, p, i) => {
    const n = q[(i + 1) % q.length];
    return s + p[0] * n[1] - n[0] * p[1];
  }, 0)) / 2;

  /** 凸包（単調な鎖）。 */
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const lo = [], up = [];
    for (const v of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], v) <= 0) lo.pop(); lo.push(v); }
    for (let i = p.length - 1; i >= 0; i--) {
      const v = p[i];
      while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], v) <= 0) up.pop();
      up.push(v);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  /** 凸多角形に内接する面積最大の四角形（頂点から選ぶ。二つの指は単調に進む）。 */
  function maxQuad(P) {
    const n = P.length;
    if (n < 4) return null;
    const at = (i) => P[i % n];
    const tri = (a, b, c) => Math.abs(cross(at(a), at(b), at(c)));
    let best = -1, out = null;
    for (let i = 0; i < n; i++) {
      let j = i + 1, l = i + 3;
      for (let k = i + 2; k < i + n - 1; k++) {
        if (j >= k) j = k - 1;
        while (j + 1 < k && tri(i, j + 1, k) >= tri(i, j, k)) j++;
        if (l <= k) l = k + 1;
        while (l + 1 < i + n && tri(i, k, l + 1) >= tri(i, k, l)) l++;
        const a = tri(i, j, k) + tri(i, k, l);
        if (a > best) { best = a; out = [at(i), at(j), at(k), at(l)]; }
      }
    }
    return out;
  }

  /* ---------------- 四隅の推定 ---------------- */

  /** 縮図（ImageData の形）から紙の四隅。紙＝明るく色の薄い塊。見つからなければ null。 */
  function detect(img) {
    const { width: w, height: h, data } = img;
    const n = w * h;
    const s = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = data[j], g = data[j + 1], b = data[j + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      s[i] = Math.max(0, mx - 1.5 * (mx - mn));
    }
    /* 3×3 でならす（字の線・網目をつぶす）。 */
    const t = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let a = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            a += s[yy * w + xx]; c++;
          }
        }
        t[y * w + x] = a / c;
      }
    }
    /* 大津の閾値。 */
    const hist = new Float64Array(256);
    for (let i = 0; i < n; i++) hist[Math.min(255, t[i] | 0)]++;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let wB = 0, sB = 0, bestV = -1, th = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > bestV) { bestV = v; th = i; }
    }
    if (bestV <= 0) return null;
    /* いちばん大きな明るい塊。 */
    const lab = new Int32Array(n);
    const stack = new Int32Array(n);
    let bestLab = 0, bestCount = 0, cur = 0;
    for (let i = 0; i < n; i++) {
      if (lab[i] || t[i] <= th) continue;
      cur++;
      let sp = 0, count = 0;
      stack[sp++] = i; lab[i] = cur;
      while (sp) {
        const p = stack[--sp];
        count++;
        const x = p % w, y = (p - x) / w;
        if (x > 0 && !lab[p - 1] && t[p - 1] > th) { lab[p - 1] = cur; stack[sp++] = p - 1; }
        if (x < w - 1 && !lab[p + 1] && t[p + 1] > th) { lab[p + 1] = cur; stack[sp++] = p + 1; }
        if (y > 0 && !lab[p - w] && t[p - w] > th) { lab[p - w] = cur; stack[sp++] = p - w; }
        if (y < h - 1 && !lab[p + w] && t[p + w] > th) { lab[p + w] = cur; stack[sp++] = p + w; }
      }
      if (count > bestCount) { bestCount = count; bestLab = cur; }
    }
    if (bestCount < n * 0.08 || bestCount > n * 0.985) return null;
    /* 塊の縁（行ごとの左右の端。画素の境で）→ 凸包 → 面積最大の四角。 */
    const pts = [];
    let top = -1, bot = -1;
    for (let y = 0; y < h; y++) {
      let a = -1, b = -1;
      for (let x = 0; x < w; x++) if (lab[y * w + x] === bestLab) { if (a < 0) a = x; b = x; }
      if (a < 0) continue;
      if (top < 0) { top = y; pts.push([a, y], [b + 1, y]); }
      bot = y;
      pts.push([a, y + 0.5], [b + 1, y + 0.5]);
      pts.push([a, y + 1], [b + 1, y + 1]);
    }
    const q = maxQuad(hull(pts));
    if (!q) return null;
    const area = polyArea(q);
    if (area < n * 0.08 || area < bestCount * 0.75) return null;
    return order(q);
  }

  /** 枠いっぱいの少し内側（見つからないとき）。 */
  const inset = (w, h) => { const m = 0.04; return [[w * m, h * m], [w * (1 - m), h * m], [w * (1 - m), h * (1 - m)], [w * m, h * (1 - m)]]; };

  /** 絵の元（bitmap・video・canvas）の四隅。見つからなければ found: false と内側の枠。 */
  function seek(src, w, h) {
    const k = Math.min(1, SEEK / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * k));
    cv.height = Math.max(1, Math.round(h * k));
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, cv.width, cv.height);
    const q = detect(g.getImageData(0, 0, cv.width, cv.height));
    const sx = w / cv.width, sy = h / cv.height;
    return q ? { found: true, quad: q.map(([x, y]) => [x * sx, y * sy]) } : { found: false, quad: inset(w, h) };
  }

  /* ---------------- 台形補正 ---------------- */

  const tick = () => new Promise((r) => setTimeout(r, 0));

  /** 元（ImageData）の四角 quad を outW×outH へ（双一次で引く）。 */
  async function warp(src, quad, outW, outH) {
    const H = homography([[0, 0], [outW, 0], [outW, outH], [0, outH]], quad);
    const out = new ImageData(outW, outH);
    const d = out.data, s = src.data, sw = src.width, sh = src.height;
    let since = 0;
    for (let v = 0; v < outH; v++) {
      const yv = v + 0.5;
      for (let u = 0; u < outW; u++) {
        const xu = u + 0.5;
        const ww = H[6] * xu + H[7] * yv + H[8];
        let x = (H[0] * xu + H[1] * yv + H[2]) / ww - 0.5;
        let y = (H[3] * xu + H[4] * yv + H[5]) / ww - 0.5;
        if (x < 0) x = 0; else if (x > sw - 1) x = sw - 1;
        if (y < 0) y = 0; else if (y > sh - 1) y = sh - 1;
        const x0 = x | 0, y0 = y | 0;
        const x1 = x0 + 1 < sw ? x0 + 1 : x0, y1 = y0 + 1 < sh ? y0 + 1 : y0;
        const fx = x - x0, fy = y - y0;
        const a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, e = (y1 * sw + x1) * 4;
        const o = (v * outW + u) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const top = s[a + ch] + (s[b + ch] - s[a + ch]) * fx;
          const btm = s[c + ch] + (s[e + ch] - s[c + ch]) * fx;
          d[o + ch] = top + (btm - top) * fy;
        }
        d[o + 3] = 255;
      }
      since += outW;
      if (since > 600000) { since = 0; await tick(); }
    }
    return out;
  }

  /* ---------------- 仕上げ ---------------- */

  /** 紙の明るさ（RGB）の推定：升ごとの明るい画素の平均 → 明るいほうへ広げる（字・線・蛍光ペンの帯を
      紙で埋める）→ ならす。升の格子（gw×gh・3ch）。 */
  function paperOf(img) {
    const { width: w, height: h, data: d } = img;
    const cell = Math.max(6, Math.round(Math.max(w, h) / 90));
    const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const G = new Float32Array(gw * gh * 3);
    const L = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const x0 = gx * cell, y0 = gy * cell, x1 = Math.min(w, x0 + cell), y1 = Math.min(h, y0 + cell);
        let mx = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * 4;
          const l = d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114;
          if (l > mx) mx = l;
        }
        let r = 0, g = 0, b = 0, c = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * 4;
          const l = d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114;
          if (l >= mx - 14) { r += d[o]; g += d[o + 1]; b += d[o + 2]; c++; }
        }
        const k = gy * gw + gx;
        G[k * 3] = r / c; G[k * 3 + 1] = g / c; G[k * 3 + 2] = b / c;
        L[k] = mx;
      }
    }
    /* 明るいほうへ広げる（半径2升）：いちばん明るい隣の色を借りる。 */
    const D = new Float32Array(G.length);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let bk = gy * gw + gx, bl = -1;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = gy + dy;
          if (yy < 0 || yy >= gh) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = gx + dx;
            if (xx < 0 || xx >= gw) continue;
            const k = yy * gw + xx;
            if (L[k] > bl) { bl = L[k]; bk = k; }
          }
        }
        const k = gy * gw + gx;
        D[k * 3] = G[bk * 3]; D[k * 3 + 1] = G[bk * 3 + 1]; D[k * 3 + 2] = G[bk * 3 + 2];
      }
    }
    /* ならす（3×3 を二度）。 */
    let A = D;
    for (let pass = 0; pass < 2; pass++) {
      const B = new Float32Array(A.length);
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) {
          let r = 0, g = 0, b = 0, c = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = gy + dy;
            if (yy < 0 || yy >= gh) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = gx + dx;
              if (xx < 0 || xx >= gw) continue;
              const k = (yy * gw + xx) * 3;
              r += A[k]; g += A[k + 1]; b += A[k + 2]; c++;
            }
          }
          const k = (gy * gw + gx) * 3;
          B[k] = r / c; B[k + 1] = g / c; B[k + 2] = b / c;
        }
      }
      A = B;
    }
    return { G: A, gw, gh, cell };
  }

  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /** 仕上げ（その場で書き換える）。mode: "doc"（書類）・"color"（カラー）・"raw"（そのまま）。 */
  async function finish(img, mode) {
    if (mode !== "doc" && mode !== "color") return img;
    const { width: w, height: h, data: d } = img;
    const { G, gw, gh, cell } = paperOf(img);
    /* 書類の曲線：紙は白へ、鉛筆・墨は濃く（2値にはしない）。 */
    const gray = new Uint8ClampedArray(256), tint = new Uint8ClampedArray(256), soft = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const t = Math.min(1, Math.max(0, (v - 40) / (228 - 40)));
      gray[v] = 255 * Math.pow(t, 1.45);
      tint[v] = 255 * Math.min(1, Math.max(0, (v - 25) / (238 - 25)));
      soft[v] = 255 * Math.min(1, Math.max(0, (v - 6) / (244 - 6)));
    }
    let since = 0;
    for (let y = 0; y < h; y++) {
      const gyf = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
      const gy0 = gyf | 0, gy1 = Math.min(gh - 1, gy0 + 1), fy = gyf - gy0;
      for (let x = 0; x < w; x++) {
        const gxf = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5));
        const gx0 = gxf | 0, gx1 = Math.min(gw - 1, gx0 + 1), fx = gxf - gx0;
        const a = (gy0 * gw + gx0) * 3, b = (gy0 * gw + gx1) * 3, c = (gy1 * gw + gx0) * 3, e = (gy1 * gw + gx1) * 3;
        const o = (y * w + x) * 4;
        let r = 0, g = 0, bl = 0;
        for (let ch = 0; ch < 3; ch++) {
          const top = G[a + ch] + (G[b + ch] - G[a + ch]) * fx;
          const btm = G[c + ch] + (G[e + ch] - G[c + ch]) * fx;
          const bg = Math.max(24, top + (btm - top) * fy);
          const v = clamp((d[o + ch] * 255) / bg);
          if (ch === 0) r = v; else if (ch === 1) g = v; else bl = v;
        }
        if (mode === "color") {
          d[o] = soft[r | 0]; d[o + 1] = soft[g | 0]; d[o + 2] = soft[bl | 0];
        } else {
          const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl);
          const k = smooth(26, 70, mx - mn);
          const n = gray[(r * 0.299 + g * 0.587 + bl * 0.114) | 0];
          d[o] = n + (tint[r | 0] - n) * k;
          d[o + 1] = n + (tint[g | 0] - n) * k;
          d[o + 2] = n + (tint[bl | 0] - n) * k;
        }
      }
      since += w;
      if (since > 500000) { since = 0; await tick(); }
    }
    return img;
  }

  /* ---------------- 字入りの PDF ---------------- */

  const fmt = (v) => String(Math.round(v * 100) / 100);
  const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, "0");
  const utf16 = (cp) => {
    if (cp < 0x10000) return hex4(cp);
    const c = cp - 0x10000;
    return hex4(0xd800 + (c >> 10)) + hex4(0xdc00 + (c & 0x3ff));
  };

  /** ページ（{jpeg: Uint8Array, w, h, text}）を一つの PDF に。写真は JPEG のまま（DCTDecode）、
      字は透明な層（3 Tr）。字は一字ずつ番号（Identity-H）、ToUnicode で元の字へ戻る。 */
  function makePdf(pages) {
    const enc = new TextEncoder();
    const parts = [];
    let len = 0;
    const offs = [];
    const add = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const cids = new Map();
    const cidOf = (cp) => { if (!cids.has(cp)) cids.set(cp, cids.size + 1); return cids.get(cp); };

    const FIRST = 7;
    const sizes = pages.map((p) => {
      /* 面積を A4 にそろえる（向きは写真のまま）。 */
      const k = Math.sqrt((595.28 * 841.89) / (p.w * p.h));
      return { W: p.w * k, H: p.h * k };
    });
    const streams = pages.map((p, i) => {
      const { W, H } = sizes[i];
      let s = `q ${fmt(W)} 0 0 ${fmt(H)} 0 0 cm /Im0 Do Q\n`;
      const lines = String(p.text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length) {
        const m = Math.min(W, H) * 0.05;
        const step = Math.min((H - 2 * m) / lines.length, H / 18);
        const fs = Math.max(1, step * 0.8);
        s += "BT\n3 Tr\n";
        s += `/F1 ${fmt(fs)} Tf\n`;
        lines.forEach((l, j) => {
          const cps = Array.from(l).map((c) => c.codePointAt(0));
          const z = Math.max(1, (100 * (W - 2 * m)) / (cps.length * fs));
          s += `${fmt(z)} Tz\n1 0 0 1 ${fmt(m)} ${fmt(H - m - fs - j * step)} Tm\n`;
          s += `<${cps.map((cp) => hex4(cidOf(cp))).join("")}> Tj\n`;
        });
        s += "ET\n";
      }
      return s;
    });

    const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n`); body(); add("\nendobj\n"); };
    const dict = (n, s) => obj(n, () => add(s));
    const stream = (n, head, bytes) => obj(n, () => {
      add(`<< ${head} /Length ${bytes.length} >>\nstream\n`);
      add(bytes);
      add("\nendstream");
    });

    add("%PDF-1.4\n");
    add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    dict(1, "<< /Type /Catalog /Pages 2 0 R >>");
    const kids = pages.map((_, i) => `${FIRST + i * 3} 0 R`).join(" ");
    dict(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    dict(3, "<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>");
    dict(4, "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GlyphLessFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 1000 /CIDToGIDMap /Identity >>");
    dict(5, "<< /Type /FontDescriptor /FontName /GlyphLessFont /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 1000 /Descent 0 /CapHeight 1000 /StemV 80 >>");
    const pairs = [...cids.entries()].map(([cp, cid]) => `<${hex4(cid)}> <${utf16(cp)}>`);
    let cm = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n" +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n" +
      "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n";
    for (let i = 0; i < pairs.length; i += 100) {
      const part = pairs.slice(i, i + 100);
      cm += `${part.length} beginbfchar\n${part.join("\n")}\nendbfchar\n`;
    }
    cm += "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
    stream(6, "", enc.encode(cm));
    pages.forEach((p, i) => {
      const n = FIRST + i * 3;
      const { W, H } = sizes[i];
      dict(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(W)} ${fmt(H)}] ` +
        `/Resources << /XObject << /Im0 ${n + 2} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${n + 1} 0 R >>`);
      stream(n + 1, "", enc.encode(streams[i]));
      stream(n + 2, `/Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, p.jpeg);
    });
    const count = FIRST + pages.length * 3;
    const xref = len;
    let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let i = 1; i < count; i++) x += `${String(offs[i]).padStart(10, "0")} 00000 n \n`;
    add(x);
    add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len);
    let at = 0;
    parts.forEach((b) => { out.set(b, at); at += b.length; });
    return out;
  }

  /* ---------------- 写真を開く・仕上げる ---------------- */

  async function decode(blob) {
    if (window.createImageBitmap) {
      try {
        const bm = await createImageBitmap(blob, { imageOrientation: "from-image" });
        return { src: bm, w: bm.width, h: bm.height, done: () => { try { bm.close(); } catch (_) { /* 閉じてある */ } } };
      } catch (_) { /* 下の Image で */ }
    }
    const url = URL.createObjectURL(blob);
    const im = await new Promise((resolve, reject) => {
      const x = new Image();
      x.onload = () => resolve(x);
      x.onerror = () => reject(new Error("画像を開けませんでした"));
      x.src = url;
    }).catch((e) => { URL.revokeObjectURL(url); throw e; });
    return { src: im, w: im.naturalWidth, h: im.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }

  const toBlob = (cv, q) => new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を作れませんでした"))), "image/jpeg", q));

  /** 一枚を仕上げる。scale は元に掛ける倍率（並べて見せる小さな仕上がりは 1 未満）。
      元は四角の外接矩形だけ描く（記憶を食わない）。返すのは canvas。 */
  async function render(page, mode, scale) {
    const pic = await decode(page.blob);
    try {
      const q = page.quad.map(([x, y]) => [x * scale, y * scale]);
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      const W = pic.w * scale, H = pic.h * scale;
      const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1), y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1);
      const x1 = Math.min(Math.ceil(W), Math.ceil(Math.max(...xs)) + 1), y1 = Math.min(Math.ceil(H), Math.ceil(Math.max(...ys)) + 1);
      const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
      const cv = document.createElement("canvas");
      cv.width = cw; cv.height = ch;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(pic.src, x0 / scale, y0 / scale, cw / scale, ch / scale, 0, 0, cw, ch);
      const src = g.getImageData(0, 0, cw, ch);
      cv.width = 1; cv.height = 1;
      const sz = outSize(q);
      const img = await warp(src, q.map(([x, y]) => [x - x0, y - y0]), sz.w, sz.h);
      await finish(img, mode);
      const out = document.createElement("canvas");
      out.width = sz.w; out.height = sz.h;
      out.getContext("2d").putImageData(img, 0, 0);
      return out;
    } finally {
      pic.done();
    }
  }

  /** 写真（Blob）→ ページ（大きさ・四隅の推定）。 */
  async function pageOf(blob) {
    const pic = await decode(blob);
    try {
      const s = seek(pic.src, pic.w, pic.h);
      return { blob, w: pic.w, h: pic.h, quad: s.quad, auto: s.quad.map((p) => p.slice()), found: s.found,
        text: "", full: null, prev: null, look: null, key: "" };
    } finally {
      pic.done();
    }
  }

  /* ---------------- 画面 ---------------- */

  const MODES = [["doc", "書類"], ["color", "カラー"], ["raw", "そのまま"]];
  let mode = "doc";
  let live = null;

  function open() {
    if (document.querySelector(".scan")) return;
    const { html, node, icon } = U;
    const pages = [];
    let view = "";
    let closed = false;
    let stream = null;
    let busy = false;

    const el = node(html`
      <div class="scan" role="dialog" aria-label="スキャン">
        <div class="scan-top">
          <button type="button" class="scan-ico js-back" aria-label="閉じる">${icon("close")}</button>
          <span class="scan-title js-title"></span>
          <span class="scan-ico"></span>
        </div>
        <div class="scan-stage js-stage"></div>
        <div class="scan-bar js-bar"></div>
        <input type="file" accept="image/*" capture="environment" hidden class="js-cam-in">
        <input type="file" accept="image/*" multiple hidden class="js-pic-in">
      </div>
    `);
    const stage = el.querySelector(".js-stage");
    const bar = el.querySelector(".js-bar");
    const title = el.querySelector(".js-title");
    const camIn = el.querySelector(".js-cam-in");
    const picIn = el.querySelector(".js-pic-in");
    document.body.append(el);
    document.documentElement.classList.add("is-scanning");
    requestAnimationFrame(() => el.classList.add("is-on"));

    const btn = (cls, ico, label, fn) => {
      const b = node(html`<button type="button" class="${cls}">${ico ? icon(ico) : ""}<span>${label}</span></button>`);
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(b); });
      return b;
    };

    const stopCam = () => {
      if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) { /* 止まっている */ } });
      stream = null;
    };
    const close = () => {
      if (closed) return;
      closed = true;
      stopCam();
      pages.forEach((p) => { if (p.prev) URL.revokeObjectURL(p.prev); if (p.look) URL.revokeObjectURL(p.look); });
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.classList.remove("is-scanning");
      el.remove();
      live = null;
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (view !== "pages" && pages.length) show("pages");
      else close();
    };
    document.addEventListener("keydown", onKey, true);
    el.querySelector(".js-back").addEventListener("click", () => {
      if (view !== "pages" && pages.length) show("pages");
      else close();
    });

    /* ---- 取り込む ---- */
    const take = async (files) => {
      for (const f of files) {
        if (closed) return;
        try { pages.push(await pageOf(f)); } catch (_) { KN.ui.toast("画像を開けませんでした"); }
      }
      if (!closed && pages.length) show("pages");
    };
    camIn.addEventListener("change", () => { const f = [...(camIn.files || [])]; camIn.value = ""; if (f.length) take(f); });
    picIn.addEventListener("change", () => { const f = [...(picIn.files || [])]; picIn.value = ""; if (f.length) take(f); });
    const canCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const sources = () => [
      canCam ? { label: "撮る", icon: "camera", run: () => show("cam") } : null,
      { label: "カメラ", icon: "camera", run: () => { camIn.value = ""; camIn.click(); } },
      { label: "写真", icon: "image", run: () => { picIn.value = ""; picIn.click(); } },
    ].filter(Boolean);

    /* ---- 仕上がり（並べて見せる小さなもの・保存する原本） ---- */
    const keyOf = (p) => `${mode}|${p.quad.map((v) => v.map((n) => n.toFixed(1)).join(",")).join(";")}`;
    const preview = async (p) => {
      const k = keyOf(p);
      if (p.prev && p.prevKey === k) return p.prev;
      const scale = Math.min(1, PREVIEW / Math.max(p.w, p.h));
      const cv = await render(p, mode, scale);
      const b = await toBlob(cv, 0.85);
      cv.width = 1; cv.height = 1;
      if (keyOf(p) !== k) return preview(p);
      if (p.prev) URL.revokeObjectURL(p.prev);
      p.prev = URL.createObjectURL(b);
      p.prevKey = k;
      return p.prev;
    };
    let fullQ = Promise.resolve();
    /** 原本の大きさで仕上げる（一枚ずつ順に。共有・保存の前に済ませておく）。 */
    const full = (p) => {
      const k = keyOf(p);
      if (p.full && p.key === k) return Promise.resolve(p.full);
      if (p.fullP && p.fullKey === k) return p.fullP;
      p.fullKey = k;
      p.fullP = fullQ = fullQ.catch(() => {}).then(async () => {
        if (keyOf(p) !== k || closed) return null;
        const cv = await render(p, mode, 1);
        const blob = await toBlob(cv, JPEG_Q);
        const v = { blob, w: cv.width, h: cv.height };
        cv.width = 1; cv.height = 1;
        if (keyOf(p) === k) { p.full = v; p.key = k; }
        return v;
      });
      return p.fullP;
    };
    const fullAll = () => pages.forEach((p) => { full(p).catch(() => {}); });

    /* ---- 面 ---- */
    function show(v) {
      if (closed) return;
      if (view === "cam" && v !== "cam") stopCam();
      view = v;
      el.dataset.view = v;
      stage.textContent = "";
      bar.textContent = "";
      title.textContent = "";
      if (v === "start") paintStart();
      else if (v === "cam") paintCam();
      else if (v === "pages") paintPages();
    }

    function paintStart() {
      const box = node(html`<div class="scan-start"></div>`);
      sources().forEach((s) => box.append(btn("scan-src", s.icon, s.label, s.run)));
      stage.append(box);
    }

    /* ---- 自前のカメラ（自動シャッター・連続撮影） ---- */
    function paintCam() {
      const wrap = node(html`
        <div class="scan-cam">
          <video class="js-video" playsinline muted autoplay></video>
          <svg class="scan-guide js-guide" preserveAspectRatio="none"><polygon class="js-poly" points=""></polygon></svg>
          <div class="scan-flash js-flash"></div>
        </div>
      `);
      stage.append(wrap);
      const video = wrap.querySelector(".js-video");
      /* iOS は属性だけでは足りないことがある（黒いまま）。値でも入れる。 */
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute("webkit-playsinline", "");
      const guide = wrap.querySelector(".js-guide");
      const poly = wrap.querySelector(".js-poly");
      const flash = wrap.querySelector(".js-flash");
      let auto = true;
      let shooting = false;
      let armed = true;
      let last = null, still = 0;

      const autoB = btn("scan-pill js-auto", "", "自動", () => {
        auto = !auto;
        autoB.setAttribute("aria-pressed", String(auto));
        still = 0;
      });
      autoB.setAttribute("aria-pressed", String(auto));
      const shot = node(html`<button type="button" class="scan-shutter js-shutter" aria-label="撮る"></button>`);
      const doneB = btn("scan-pill js-done", "", "済", () => (pages.length ? show("pages") : close()));
      const count = () => { doneB.querySelector("span").textContent = pages.length ? `済 ${pages.length}` : "済"; };
      count();
      bar.append(autoB, shot, doneB);

      const fit = () => {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw) return;
        guide.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
        /* video は contain で置く。案内の絵も同じ枠に。 */
        const r = video.getBoundingClientRect();
        const k = Math.min(r.width / vw, r.height / vh);
        Object.assign(guide.style, { width: `${vw * k}px`, height: `${vh * k}px`,
          left: `${(r.width - vw * k) / 2}px`, top: `${(r.height - vh * k) / 2}px` });
      };

      const grab = async () => {
        const track = stream && stream.getVideoTracks()[0];
        if (track && window.ImageCapture) {
          try { return await new window.ImageCapture(track).takePhoto(); } catch (_) { /* 下の一コマで */ }
        }
        const cv = document.createElement("canvas");
        cv.width = video.videoWidth; cv.height = video.videoHeight;
        cv.getContext("2d").drawImage(video, 0, 0);
        const b = await toBlob(cv, JPEG_Q);
        cv.width = 1; cv.height = 1;
        return b;
      };
      const shoot = async () => {
        if (shooting || !stream) return;
        shooting = true;
        armed = false;
        still = 0;
        flash.classList.remove("is-on");
        void flash.offsetWidth;
        flash.classList.add("is-on");
        if (U.haptic) U.haptic(10);
        try {
          const b = await grab();
          if (b && !closed) { pages.push(await pageOf(b)); count(); }
        } catch (_) {
          KN.ui.toast("撮れませんでした");
        }
        shooting = false;
      };
      shot.addEventListener("click", (e) => { e.stopPropagation(); shoot(); });

      const loop = () => {
        if (closed || view !== "cam" || !stream) return;
        if (video.videoWidth && !shooting) {
          const s = seek(video, video.videoWidth, video.videoHeight);
          poly.setAttribute("points", s.found ? s.quad.map((p) => p.join(",")).join(" ") : "");
          guide.classList.toggle("is-found", s.found);
          const diag = Math.hypot(video.videoWidth, video.videoHeight);
          const moved = s.found && last ? Math.max(...s.quad.map((p, i) => dist(p, last[i]))) / diag : 1;
          /* 一度撮ったら、紙が動く（めくる・替える）か消えるまで次を撮らない。 */
          if (!armed && (!s.found || moved > 0.05)) armed = true;
          still = s.found && moved < 0.015 ? still + 1 : 0;
          last = s.found ? s.quad : null;
          if (auto && armed && still >= 4) shoot();
        }
        setTimeout(loop, 280);
      };

      /* 映像が来るか（新しい一コマ）。iOS は許可の直後・高い解像度を最初から求めたときに黒いまま
         止まることがあるので、来なければ開き直す。 */
      const gone = () => closed || view !== "cam" || !wrap.isConnected;
      const frames = (ms) => new Promise((resolve) => {
        let done = false;
        const end = (ok) => { if (!done) { done = true; resolve(ok); } };
        setTimeout(() => end(false), ms);
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => end(video.videoWidth > 0));
        const t0 = video.currentTime;
        const poll = () => {
          if (done) return;
          if (video.readyState >= 2 && video.videoWidth > 0 && video.currentTime > t0) end(true);
          else setTimeout(poll, 100);
        };
        poll();
      });
      const attach = (s) => {
        stream = s;
        video.srcObject = s;
        const go = () => { video.play().catch(() => {}); fit(); };
        video.onloadedmetadata = go;
        video.oncanplay = go;
        video.onresize = fit;
        video.play().catch(() => {});
      };
      const BASE = { audio: false, video: { facingMode: { ideal: "environment" } } };
      const start = async () => {
        let ok = false;
        for (let i = 0; i < 2 && !ok; i++) {
          stopCam();
          const s = await navigator.mediaDevices.getUserMedia(BASE);
          if (gone()) { s.getTracks().forEach((t) => t.stop()); return; }
          attach(s);
          ok = await frames(2500);
          if (gone()) return;
        }
        if (!ok) throw new Error("映りません");
        window.addEventListener("resize", fit);
        loop();
        /* 映ってから解像度を上げる（撮る一枚の画質）。上げて止まったら元の解像度へ。 */
        const track = stream && stream.getVideoTracks()[0];
        if (!track || !track.applyConstraints) return;
        const was = track.getSettings ? track.getSettings() : {};
        try {
          await track.applyConstraints({ facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } });
          if (gone()) return;
          if (!(await frames(2000)) && !gone() && was.width) {
            await track.applyConstraints({ width: { ideal: was.width }, height: { ideal: was.height } }).catch(() => {});
          }
        } catch (_) { /* 上げられない端末はそのまま */ }
      };
      start().catch(() => {
        stopCam();
        if (gone()) return;
        KN.ui.toast("カメラを使えませんでした");
        show(pages.length ? "pages" : "start");
      });
    }

    /* ---- 並べる・仕上げ・字・保存 ---- */
    function paintPages() {
      title.textContent = `${pages.length}枚`;
      const list = node(html`<div class="scan-pages"></div>`);
      pages.forEach((p, i) => {
        const card = node(html`
          <div class="scan-page">
            <button type="button" class="scan-thumb js-edit" aria-label="四隅を直す"><img alt=""></button>
            <div class="scan-page-side">
              <span class="scan-no">${String(i + 1)}</span>
              <textarea class="scan-text grow-field js-text" rows="2" placeholder="字" aria-label="字"></textarea>
              <div class="scan-page-acts"></div>
            </div>
          </div>
        `);
        const im = card.querySelector("img");
        im.dataset.page = String(i);
        preview(p).then((u) => { if (u && im.isConnected) im.src = u; }).catch(() => {});
        card.querySelector(".js-edit").addEventListener("click", () => editCorners(p));
        const ta = card.querySelector(".js-text");
        ta.value = p.text;
        ta.addEventListener("input", () => { p.text = ta.value; });
        const acts = card.querySelector(".scan-page-acts");
        if (navigator.clipboard && navigator.clipboard.readText) {
          acts.append(btn("scan-mini js-paste", "copy", "貼る", async () => {
            try {
              const s = await navigator.clipboard.readText();
              if (s) { p.text = ta.value = s; }
            } catch (_) { KN.ui.focusNow(ta); }
          }));
        }
        acts.append(btn("scan-mini js-drop", "trash", "外す", () => {
          pages.splice(pages.indexOf(p), 1);
          if (p.prev) URL.revokeObjectURL(p.prev);
          show(pages.length ? "pages" : "start");
        }));
        list.append(card);
      });
      stage.append(list);

      const seg = node(html`<div class="scan-seg" role="radiogroup" aria-label="仕上げ"></div>`);
      MODES.forEach(([k, label]) => {
        const b = node(html`<button type="button" role="radio" class="scan-seg-b" data-mode="${k}">${label}</button>`);
        b.setAttribute("aria-checked", String(mode === k));
        b.addEventListener("click", () => {
          if (mode === k) return;
          mode = k;
          seg.querySelectorAll(".scan-seg-b").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.mode === k)));
          list.querySelectorAll(".scan-page img").forEach((im) => {
            const p = pages[Number(im.dataset.page)];
            im.classList.add("is-wait");
            preview(p).then((u) => { if (u && im.isConnected) { im.src = u; im.classList.remove("is-wait"); } }).catch(() => {});
          });
          fullAll();
        });
        seg.append(b);
      });
      const row = node(html`<div class="scan-acts"></div>`);
      row.append(
        btn("scan-pill js-add", "plus", "足す", () => show("start")),
        btn("scan-pill js-share", "upload", "共有", () => share()),
        btn("scan-pill is-main js-save", "check", "保存", () => save()),
      );
      bar.append(seg, row);
      fullAll();
    }

    /** 仕上げた原本を共有（ショートカットで字を写す）。押した流れで渡すので、仕上がっていなければ一言。 */
    function share() {
      const ready = pages.every((p) => p.full && p.key === keyOf(p));
      if (!ready) { fullAll(); KN.ui.toast("仕上げています"); return; }
      const files = pages.map((p, i) => new File([p.full.blob], `scan-${i + 1}.jpg`, { type: "image/jpeg" }));
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files }))) {
        KN.ui.toast("共有できませんでした");
        return;
      }
      navigator.share({ files }).catch(() => {});
    }

    async function save() {
      if (busy || !pages.length) return;
      const I = KN.noteImg, D = KN.noteFile, N = KN.notes;
      if (!I || I.state() !== "on" || !N || N.state() !== "on") { KN.ui.toast("画像を保存できませんでした"); return; }
      busy = true;
      el.classList.add("is-busy");
      try {
        const outs = [];
        for (const p of pages) {
          const v = await full(p);
          if (!v) throw new Error("仕上げられませんでした");
          outs.push(v);
        }
        /* ファイルを先に書き、書けてから本文の行。 */
        const lines = [];
        const stamp = (() => { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日`; })();
        for (let i = 0; i < outs.length; i++) {
          const v = outs[i];
          const file = new File([v.blob], `scan-${i + 1}.jpg`, { type: "image/jpeg" });
          let id;
          try { id = await I.add(file); } catch (_) { KN.ui.toast("画像を保存できませんでした"); return; }
          lines.push(I.refLine(id));
          if (D && D.state() === "on") {
            try { const o = await D.keep(v.blob, `scan-${i + 1}.jpg`); lines.push(D.refLine(o.id, o.name)); } catch (_) { /* 縮めたものだけ */ }
          }
        }
        let pdfLine = null;
        if (D && D.state() === "on") {
          try {
            const jpegs = await Promise.all(outs.map((v) => v.blob.arrayBuffer()));
            const bytes = makePdf(outs.map((v, i) => ({ jpeg: new Uint8Array(jpegs[i]), w: v.w, h: v.h, text: pages[i].text })));
            const got = await D.add(new File([bytes], `スキャン ${stamp}.pdf`, { type: "application/pdf" }));
            const all = pages.map((p) => p.text.trim()).filter(Boolean).join("\n");
            if (all) await D.setText(got.id, all).catch(() => {});
            pdfLine = D.refLine(got.id, got.name);
          } catch (_) { KN.ui.toast("PDF を保存できませんでした"); }
        }
        const note = N.draft();
        note.title = `スキャン ${stamp}`;
        note.body = lines.join("\n") + (pdfLine ? `\n\n${pdfLine}` : "");
        if (!N.put(note)) { KN.ui.toast("ノートに保存できませんでした"); return; }
        await N.flush();
        close();
        if (KN.screens && KN.screens.notes) KN.screens.notes.open(note.id);
      } catch (_) {
        KN.ui.toast("保存できませんでした");
      } finally {
        busy = false;
        el.classList.remove("is-busy");
      }
    }

    /* ---- 四隅を指で直す ---- */
    function editCorners(p) {
      view = "edit";
      el.dataset.view = "edit";
      stage.textContent = "";
      bar.textContent = "";
      title.textContent = "";
      const was = p.quad.map((v) => v.slice());
      const wrap = node(html`
        <div class="scan-edit">
          <div class="scan-edit-box js-box">
            <img alt="" class="js-src">
            <svg class="scan-guide is-found" preserveAspectRatio="none"><polygon class="js-poly"></polygon></svg>
          </div>
          <div class="scan-loupe js-loupe" hidden></div>
        </div>
      `);
      stage.append(wrap);
      const box = wrap.querySelector(".js-box");
      const im = wrap.querySelector(".js-src");
      const svg = wrap.querySelector("svg");
      const poly = wrap.querySelector(".js-poly");
      const loupe = wrap.querySelector(".js-loupe");
      svg.setAttribute("viewBox", `0 0 ${p.w} ${p.h}`);
      const dots = p.quad.map((_, i) => {
        const d = node(html`<span class="scan-dot" data-i="${String(i)}"></span>`);
        box.append(d);
        return d;
      });
      const paint = () => {
        poly.setAttribute("points", p.quad.map((v) => v.join(",")).join(" "));
        dots.forEach((d, i) => {
          d.style.left = `${(p.quad[i][0] / p.w) * 100}%`;
          d.style.top = `${(p.quad[i][1] / p.h) * 100}%`;
        });
      };
      const lay = () => {
        const r = wrap.getBoundingClientRect();
        const k = Math.min(r.width / p.w, r.height / p.h);
        box.style.width = `${p.w * k}px`;
        box.style.height = `${p.h * k}px`;
      };
      (async () => {
        if (!p.look) {
          const pic = await decode(p.blob);
          const k = Math.min(1, 1600 / Math.max(pic.w, pic.h));
          const cv = document.createElement("canvas");
          cv.width = Math.round(pic.w * k); cv.height = Math.round(pic.h * k);
          cv.getContext("2d").drawImage(pic.src, 0, 0, cv.width, cv.height);
          pic.done();
          p.look = URL.createObjectURL(await toBlob(cv, 0.85));
          cv.width = 1; cv.height = 1;
        }
        if (im.isConnected) im.src = p.look;
        loupe.style.backgroundImage = `url("${p.look}")`;
      })().catch(() => {});
      requestAnimationFrame(() => { lay(); paint(); });

      let drag = -1;
      box.addEventListener("pointerdown", (e) => {
        const r = box.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * p.w, y = ((e.clientY - r.top) / r.height) * p.h;
        let best = -1, bd = Infinity;
        p.quad.forEach((v, i) => { const d0 = dist(v, [x, y]); if (d0 < bd) { bd = d0; best = i; } });
        /* 指の太さ：画面で約44px以内の隅だけ掴む。 */
        if (bd / (p.w / r.width) > 48) return;
        drag = best;
        box.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      box.addEventListener("pointermove", (e) => {
        if (drag < 0) return;
        const r = box.getBoundingClientRect();
        const x = Math.min(p.w, Math.max(0, ((e.clientX - r.left) / r.width) * p.w));
        const y = Math.min(p.h, Math.max(0, ((e.clientY - r.top) / r.height) * p.h));
        p.quad[drag] = [x, y];
        paint();
        /* 指の下が隠れるので、上に拡大の丸。 */
        const L = 2.5;
        loupe.hidden = false;
        loupe.style.left = `${e.clientX - r.left + box.offsetLeft}px`;
        loupe.style.top = `${e.clientY - r.top + box.offsetTop}px`;
        loupe.style.backgroundSize = `${r.width * L}px ${r.height * L}px`;
        loupe.style.backgroundPosition = `${-(x / p.w) * r.width * L + 48}px ${-(y / p.h) * r.height * L + 48}px`;
      });
      const up = () => { drag = -1; loupe.hidden = true; };
      box.addEventListener("pointerup", up);
      box.addEventListener("pointercancel", up);

      bar.append(
        btn("scan-pill js-auto-quad", "", "自動", () => { p.quad = p.auto.map((v) => v.slice()); paint(); }),
        btn("scan-pill js-whole", "", "全体", () => { p.quad = [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]; paint(); }),
        btn("scan-pill is-main js-ok", "check", "決める", () => {
          const ok = polyArea(p.quad) > 64 && isConvex(p.quad);
          if (!ok) { p.quad = was; KN.ui.toast("四隅を直せませんでした"); }
          show("pages");
        }),
      );
    }

    show("start");
    live = { close, pages, show };
    return live;
  }

  const isConvex = (q) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
      if (!c) continue;
      if (!sign) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
    }
    return true;
  };

  KN.scan = { open, detect, seek, homography, mapPt, outSize, warp, finish, paperOf, makePdf, render, pageOf, order, maxQuad, hull,
    /** 開いているスキャン（試験の口）。 */
    live: () => live,
    /** 仕上げの既定（試験の口）。 */
    mode: (m) => { if (m) mode = m; return mode; } };
})();
