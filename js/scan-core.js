/* =========================================================
   くらしノート — スキャンの芯（`self.KNScanCore`。画面を持たない計算だけ）

   js/note-scan.js が使う。ページでも Worker でも読む。Worker として読まれたとき
   （`new Worker("js/scan-core.js")`）は、重い計算（補正・回転・仕上げ）を引き受ける。

   - 四隅：縮図で三通りの候補（明るく色の薄い塊・縁の色から遠い塊・まっすぐな縁の組）→
     四辺に沿った勾配で採点 → 細かい図で辺ごとに勾配の山を拾って直線に当て、交点（画素より細かく）。
   - 縦横の比：射影から焦点距離を推し、紙の本当の比（Zhang・He 2004）。A判・B判（√2）・
     レターに近ければそろえる。
   - 補正（双三次）・回転・仕上げ（紙の明るさを升ごとに推して割る・縁に残った机を白く・字を締める。
     2値化しない。書類は色の薄いところだけ灰に寄せ、朱・蛍光ペンは色のまま）。
   - 字の帯（横書きの行・縦書きの列）と、貼った字の行を帯へ割り当てる（長さの比で動的計画）。
   - 字入りの PDF（写真は JPEG のまま・字は透明な層・ToUnicode）。
   ========================================================= */
(function (G) {
  "use strict";

  const MAX_PX = 16e6;          // 一枚の画素の上限（iOS の canvas の上限 16,777,216 の手前）
  const EDGE_T = 28;            // 縁とみなす勾配（3×3 でならした明るさの Sobel）

  /* ---------------- 幾何 ---------------- */

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const polyArea = (q) => Math.abs(q.reduce((s, p, i) => {
    const n = q[(i + 1) % q.length];
    return s + p[0] * n[1] - n[0] * p[1];
  }, 0)) / 2;

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

  /** 凸多角形に内接する面積最大の四角形（頂点から。二つの指は単調に進む）。 */
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

  /** 4点を 左上・右上・右下・左下（画面の向きで時計回り）に。 */
  function order(pts) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
    const q = pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    let tl = 0;
    q.forEach((p, i) => { if (p[0] + p[1] < q[tl][0] + q[tl][1]) tl = i; });
    return q.slice(tl).concat(q.slice(0, tl)).map((p) => [p[0], p[1]]);
  }

  function isConvex(q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
      if (!c) return false;
      if (!sign) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
    }
    return true;
  }
  const angles = (q) => q.map((p, i) => {
    const a = q[(i + 3) % 4], b = q[(i + 1) % 4];
    const ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const c = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  });
  /** 紙として無理のない四角（凸・角が 32〜148°）。 */
  const sane = (q) => !!q && isConvex(q) && angles(q).every((a) => a > 32 && a < 148);

  /* ---------------- 明るさ・ならし・勾配 ---------------- */

  function grayOf(img) {
    const { width: w, height: h, data: d } = img;
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
    return g;
  }

  /** 3×3 の平均（縦横に分けて）。 */
  function blur3(src, w, h) {
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const r = y * w;
      for (let x = 0; x < w; x++) {
        const a = x > 0 ? src[r + x - 1] : src[r + x], c = x < w - 1 ? src[r + x + 1] : src[r + x];
        t[r + x] = (a + src[r + x] + c) / 3;
      }
    }
    for (let y = 0; y < h; y++) {
      const up = (y > 0 ? y - 1 : y) * w, dn = (y < h - 1 ? y + 1 : y) * w, r = y * w;
      for (let x = 0; x < w; x++) o[r + x] = (t[up + x] + t[r + x] + t[dn + x]) / 3;
    }
    return o;
  }

  function sobel(g, w, h) {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1], d = g[i - 1], f = g[i + 1];
        const k = g[i + w - 1], l = g[i + w], m = g[i + w + 1];
        gx[i] = (c + 2 * f + m) - (a + 2 * d + k);
        gy[i] = (k + 2 * l + m) - (a + 2 * b + c);
      }
    }
    return { gx, gy };
  }

  /* ---------------- 四隅の候補 ---------------- */

  /** 大津の閾値（値の幅を256に割って）。幅が無ければ null。 */
  function otsu(f) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < f.length; i++) { const v = f[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!(hi - lo > 8)) return null;
    const bins = 256, k = (bins - 1) / (hi - lo), hist = new Float64Array(bins);
    for (let i = 0; i < f.length; i++) hist[((f[i] - lo) * k) | 0]++;
    const n = f.length;
    let sum = 0;
    for (let i = 0; i < bins; i++) sum += i * hist[i];
    let wB = 0, sB = 0, best = -1, th = 0;
    for (let i = 0; i < bins; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; th = i; }
    }
    return lo + (th + 0.5) / k;
  }

  /** 値の高いいちばん大きな塊 → 凸包 → 面積最大の四角。 */
  function blobQuad(f, w, h) {
    const th = otsu(f);
    if (th == null) return null;
    const n = w * h, lab = new Int32Array(n), stack = new Int32Array(n);
    let cur = 0, bestLab = 0, bestCount = 0;
    for (let i = 0; i < n; i++) {
      if (lab[i] || f[i] <= th) continue;
      cur++;
      let sp = 0, count = 0;
      stack[sp++] = i; lab[i] = cur;
      while (sp) {
        const p = stack[--sp];
        count++;
        const x = p % w;
        if (x > 0 && !lab[p - 1] && f[p - 1] > th) { lab[p - 1] = cur; stack[sp++] = p - 1; }
        if (x < w - 1 && !lab[p + 1] && f[p + 1] > th) { lab[p + 1] = cur; stack[sp++] = p + 1; }
        if (p >= w && !lab[p - w] && f[p - w] > th) { lab[p - w] = cur; stack[sp++] = p - w; }
        if (p < n - w && !lab[p + w] && f[p + w] > th) { lab[p + w] = cur; stack[sp++] = p + w; }
      }
      if (count > bestCount) { bestCount = count; bestLab = cur; }
    }
    if (bestCount < n * 0.06 || bestCount > n * 0.985) return null;
    const pts = [];
    for (let y = 0; y < h; y++) {
      let a = -1, b = -1;
      const r = y * w;
      for (let x = 0; x < w; x++) if (lab[r + x] === bestLab) { if (a < 0) a = x; b = x; }
      if (a >= 0) pts.push([a, y], [b + 1, y], [a, y + 1], [b + 1, y + 1]);
    }
    const q = maxQuad(hull(pts));
    return q ? order(q) : null;
  }

  /** 紙らしさ：明るく、色が薄い。 */
  function paperness(img) {
    const { data: d } = img;
    const f = new Float32Array(img.width * img.height);
    for (let i = 0, j = 0; i < f.length; i++, j += 4) {
      const r = d[j], g = d[j + 1], b = d[j + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      f[i] = Math.max(0, mx - 1.5 * (mx - mn));
    }
    return f;
  }

  /** 縁の色（机）からの遠さ。白い机に色の紙・色の机に白い紙。 */
  function apartness(img) {
    const { width: w, height: h, data: d } = img;
    const ring = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const R = [], Gr = [], B = [];
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
        const j = (y * w + x) * 4;
        R.push(d[j]); Gr.push(d[j + 1]); B.push(d[j + 2]);
      }
    }
    const med = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1] || 0; };
    const mr = med(R), mg = med(Gr), mb = med(B);
    const f = new Float32Array(w * h);
    for (let i = 0, j = 0; i < f.length; i++, j += 4) {
      const dr = d[j] - mr, dg = d[j + 1] - mg, db = d[j + 2] - mb;
      f[i] = Math.sqrt(dr * dr + dg * dg + db * db);
    }
    return f;
  }

  /** まっすぐな縁（勾配の向きに絞った Hough）。強い順に K 本。 */
  function houghLines(gx, gy, w, h, K) {
    const n = w * h, mag = new Float32Array(n);
    for (let i = 0; i < n; i++) mag[i] = Math.hypot(gx[i], gy[i]);
    const D = Math.ceil(Math.hypot(w, h)), NR = 2 * D + 1, NT = 180;
    const acc = new Float32Array(NT * NR);
    const cs = new Float32Array(NT), sn = new Float32Array(NT);
    for (let t = 0; t < NT; t++) { cs[t] = Math.cos((t * Math.PI) / 180); sn[t] = Math.sin((t * Math.PI) / 180); }
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = y * w + x, m = mag[i];
        if (m < EDGE_T) continue;
        const ax = gx[i] / m, ay = gy[i] / m;
        const dx = Math.round(ax), dy = Math.round(ay);
        if (m < mag[i + dy * w + dx] || m < mag[i - dy * w - dx]) continue;
        let t0 = Math.round((Math.atan2(ay, ax) * 180) / Math.PI);
        t0 = ((t0 % 180) + 180) % 180;
        for (let dt = -3; dt <= 3; dt++) {
          const t = (t0 + dt + NT) % NT;
          acc[t * NR + Math.round(x * cs[t] + y * sn[t]) + D] += 1;
        }
      }
    }
    const minV = Math.max(12, Math.min(w, h) * 0.12);
    const peaks = [];
    for (let t = 0; t < NT; t++) {
      for (let r = 1; r < NR - 1; r++) {
        const v = acc[t * NR + r];
        if (v < minV) continue;
        let top = true;
        for (let dt = -1; dt <= 1 && top; dt++) {
          const tt = t + dt;
          if (tt < 0 || tt >= NT) continue;
          for (let dr = -1; dr <= 1; dr++) {
            if ((dt || dr) && acc[tt * NR + r + dr] > v) { top = false; break; }
          }
        }
        if (top) peaks.push({ t, r: r - D, v });
      }
    }
    peaks.sort((a, b) => b.v - a.v);
    const near = (p, q) => {
      let dt = Math.abs(p.t - q.t), dr = Math.abs(p.r - q.r);
      if (dt > 90) { dt = 180 - dt; dr = Math.abs(p.r + q.r); }
      return dt < 6 && dr < 10;
    };
    const keep = [];
    for (const p of peaks) {
      if (keep.length >= K) break;
      if (!keep.some((q) => near(p, q))) keep.push(p);
    }
    return keep.map((p) => ({ c: cs[p.t], s: sn[p.t], r: p.r, t: p.t }));
  }

  function houghQuads(gx, gy, w, h, K) {
    const L = houghLines(gx, gy, w, h, K);
    const meetL = (a, b) => {
      const det = a.c * b.s - a.s * b.c;
      if (Math.abs(det) < 1e-6) return null;
      return [(a.r * b.s - a.s * b.r) / det, (a.c * b.r - a.r * b.c) / det];
    };
    const diff = (a, b) => { const d = Math.abs(a.t - b.t) % 180; return Math.min(d, 180 - d); };
    const inside = (p) => p[0] > -0.15 * w && p[0] < 1.15 * w && p[1] > -0.15 * h && p[1] < 1.15 * h;
    const out = [];
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) for (let c = b + 1; c < L.length; c++) for (let d = c + 1; d < L.length; d++) {
      const s = [L[a], L[b], L[c], L[d]];
      for (const [i, j, k, l] of [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]]) {
        if (diff(s[i], s[j]) > 40 || diff(s[k], s[l]) > 40 || diff(s[i], s[k]) < 30) continue;
        const q = [meetL(s[i], s[k]), meetL(s[k], s[j]), meetL(s[j], s[l]), meetL(s[l], s[i])];
        if (q.some((p) => !p || !inside(p)) || !isConvex(q) || polyArea(q) < 0.08 * w * h) continue;
        out.push(order(q));
      }
    }
    return out;
  }

  /** 四辺に沿って、辺に直交する向きの勾配がある割合（0〜1）。 */
  function supportOf(q, gx, gy, w, h) {
    let hit = 0, tot = 0;
    for (let e = 0; e < 4; e++) {
      const a = q[e], b = q[(e + 1) % 4];
      const len = dist(a, b);
      if (len < 4) return 0;
      const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len, nx = -ty, ny = tx;
      const steps = Math.max(10, Math.min(60, Math.round(len / 4)));
      for (let k = 0; k < steps; k++) {
        const t = 0.04 + (0.92 * (k + 0.5)) / steps;
        const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        tot++;
        if (px < 1 || py < 1 || px > w - 2 || py > h - 2) continue;
        let best = 0;
        for (let s = -2; s <= 2; s++) {
          const x = Math.min(w - 2, Math.max(1, Math.round(px + s * nx))), y = Math.min(h - 2, Math.max(1, Math.round(py + s * ny)));
          const i = y * w + x;
          const along = Math.abs(gx[i] * nx + gy[i] * ny), across = Math.abs(gx[i] * tx + gy[i] * ty);
          if (along > best && along > across) best = along;
        }
        if (best >= EDGE_T) hit++;
      }
    }
    return tot ? hit / tot : 0;
  }

  /** 縮図（ImageData の形）から紙の四隅。o.thorough：縁の組も必ず試す（撮った一枚）。 */
  function detect(img, o) {
    o = o || {};
    const { width: w, height: h } = img;
    const g = blur3(grayOf(img), w, h);
    const { gx, gy } = sobel(g, w, h);
    let best = null;
    const tryQ = (q, kind) => {
      if (!sane(q)) return;
      const a = polyArea(q) / (w * h);
      if (a < 0.08) return;
      const s = supportOf(q, gx, gy, w, h);
      const sc = s * (0.85 + 0.15 * Math.min(1, a / 0.5));
      if (!best || sc > best.score) best = { quad: q, score: sc, support: s, area: a, kind };
    };
    tryQ(blobQuad(blur3(paperness(img), w, h), w, h), "paper");
    tryQ(blobQuad(blur3(apartness(img), w, h), w, h), "apart");
    if (!best || best.support < 0.85 || o.thorough) houghQuads(gx, gy, w, h, o.thorough ? 14 : 10).forEach((q) => tryQ(q, "lines"));
    const found = !!best && best.support >= 0.55;
    return { found, quad: found ? best.quad : null, support: best ? best.support : 0, kind: best ? best.kind : "", gray: g, w, h };
  }

  /* ---------------- 縁を直す（画素より細かく） ---------------- */

  function fitLine(pts) {
    let sw = 0, mx = 0, my = 0;
    for (const p of pts) { sw += p.w; mx += p.w * p.x; my += p.w * p.y; }
    mx /= sw; my /= sw;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += p.w * dx * dx; syy += p.w * dy * dy; sxy += p.w * dx * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const dx = Math.cos(th), dy = Math.sin(th);
    return { x: mx, y: my, nx: -dy, ny: dx };
  }
  function meet(L1, L2) {
    const c1 = L1.nx * L1.x + L1.ny * L1.y, c2 = L2.nx * L2.x + L2.ny * L2.y;
    const det = L1.nx * L2.ny - L1.ny * L2.nx;
    if (Math.abs(det) < 1e-9) return null;
    return [(c1 * L2.ny - L1.ny * c2) / det, (L1.nx * c2 - c1 * L2.nx) / det];
  }

  /** 細かい図（{w, h, g}：ならした明るさ）で、四辺を勾配の山の直線に当て直す。 */
  function refine(Gm, quad) {
    const { w, h, g } = Gm;
    const at = (x, y) => {
      if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
      if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
      const a = g[i] + (g[i + 1] - g[i]) * fx, b = g[i + w] + (g[i + w + 1] - g[i + w]) * fx;
      return a + (b - a) * fy;
    };
    const R = Math.max(4, Math.round(Math.hypot(w, h) * 0.012));
    const fits = [];
    for (let e = 0; e < 4; e++) {
      const a = quad[e], b = quad[(e + 1) % 4];
      const len = dist(a, b);
      if (len < 16) { fits.push(null); continue; }
      const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len, nx = -ty, ny = tx;
      const K = Math.max(16, Math.min(64, Math.round(len / 12)));
      const rows = [];
      for (let k = 0; k < K; k++) {
        const t = 0.07 + (0.86 * (k + 0.5)) / K;
        const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        const v = new Float32Array(2 * R + 1);
        let inside = true;
        for (let s = -R; s <= R && inside; s++) {
          const cx = px + s * nx, cy = py + s * ny;
          if (cx < 2 || cy < 2 || cx > w - 3 || cy > h - 3) { inside = false; break; }
          let d = 0;
          for (let u = -1; u <= 1; u++) {
            const ux = cx + u * tx * 1.5, uy = cy + u * ty * 1.5;
            d += at(ux + nx, uy + ny) - at(ux - nx, uy - ny);
          }
          v[s + R] = d;
        }
        if (inside) rows.push({ px, py, v });
      }
      if (rows.length < 8) { fits.push(null); continue; }
      /* 紙と机の明るさの向きは辺に沿って同じ。多いほうの向きの山だけ拾う（影・字の縁に引かれない）。 */
      let sum = 0;
      for (const r of rows) {
        let bi = 0;
        for (let i = 1; i < r.v.length; i++) if (Math.abs(r.v[i]) > Math.abs(r.v[bi])) bi = i;
        sum += r.v[bi];
      }
      const sg = sum >= 0 ? 1 : -1;
      const pts = [];
      for (const r of rows) {
        let bi = -1, bv = 0;
        for (let i = 1; i < r.v.length - 1; i++) { const x = r.v[i] * sg; if (x > bv) { bv = x; bi = i; } }
        if (bi < 1) continue;
        const l = r.v[bi - 1] * sg, rr = r.v[bi + 1] * sg, den = l - 2 * bv + rr;
        const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - rr)) / den)) : 0;
        const s = bi - R + off;
        pts.push({ x: r.px + s * nx, y: r.py + s * ny, w: bv });
      }
      if (pts.length < 8) { fits.push(null); continue; }
      const ws = pts.map((p) => p.w).sort((x, y) => x - y);
      let use = pts.filter((p) => p.w >= ws[ws.length >> 1] * 0.35);
      for (let it = 0; it < 3 && use.length >= 6; it++) {
        const L = fitLine(use);
        const res = use.map((p) => Math.abs((p.x - L.x) * L.nx + (p.y - L.y) * L.ny));
        const sr = res.slice().sort((x, y) => x - y);
        const lim = Math.max(0.75, 2.5 * 1.4826 * sr[sr.length >> 1]);
        const next = use.filter((p, i) => res[i] <= lim);
        if (next.length === use.length) break;
        use = next;
      }
      fits.push(use.length >= 6 ? fitLine(use) : null);
    }
    const lineOf = (e) => {
      if (fits[e]) return fits[e];
      const a = quad[e], b = quad[(e + 1) % 4], len = dist(a, b) || 1;
      return { x: a[0], y: a[1], nx: -(b[1] - a[1]) / len, ny: (b[0] - a[0]) / len };
    };
    const out = [];
    for (let i = 0; i < 4; i++) {
      const p = meet(lineOf((i + 3) % 4), lineOf(i));
      out.push(p && dist(p, quad[i]) < 3 * R ? p : quad[i].slice());
    }
    return sane(out) ? out : quad.map((p) => p.slice());
  }

  /* ---------------- 紙の本当の縦横比 ---------------- */

  /** 四隅（左上・右上・右下・左下）と写真の大きさから、紙の 幅／高さ（Zhang・He 2004）。 */
  function aspect(q, W, H) {
    const u0 = W / 2, v0 = H / 2;
    const m1 = [q[0][0], q[0][1], 1], m2 = [q[1][0], q[1][1], 1], m3 = [q[3][0], q[3][1], 1], m4 = [q[2][0], q[2][1], 1];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const k2 = dot(cr(m1, m4), m3) / dot(cr(m2, m4), m3);
    const k3 = dot(cr(m1, m4), m2) / dot(cr(m3, m4), m2);
    if (!isFinite(k2) || !isFinite(k3)) return null;
    const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
    const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
    const diag = Math.hypot(W, H);
    const den = n2[2] * n3[2];
    let f = NaN;
    if (Math.abs(den) > 1e-12) {
      const f2 = -((n2[0] * n3[0] - (n2[0] * n3[2] + n2[2] * n3[0]) * u0 + n2[2] * n3[2] * u0 * u0)
        + (n2[1] * n3[1] - (n2[1] * n3[2] + n2[2] * n3[1]) * v0 + n2[2] * n3[2] * v0 * v0)) / den;
      if (f2 > 0) f = Math.sqrt(f2);
    }
    /* 正面に近いと焦点距離は決まらない（比はそれにほとんどよらない）。電話の広角の目安で。 */
    if (!(f > 0.35 * diag && f < 2.5 * diag)) f = 0.6 * diag;
    const ai = (n) => [(n[0] - u0 * n[2]) / f, (n[1] - v0 * n[2]) / f, n[2]];
    const a2 = ai(n2), a3 = ai(n3);
    const r = Math.sqrt(dot(a2, a2) / dot(a3, a3));
    return isFinite(r) && r > 0.08 && r < 12 ? r : null;
  }

  /** A判・B判（√2）とレターに近ければそろえる。 */
  function snap(r) {
    for (const c of [Math.SQRT1_2, Math.SQRT2, 8.5 / 11, 11 / 8.5]) if (Math.abs(r / c - 1) < 0.025) return c;
    return r;
  }

  /** 補正後の大きさ：本当の比で、どの向きにも元の画素を間引かない大きさ（上限で頭打ち）。 */
  function outSize(q, W, H) {
    const top = dist(q[0], q[1]), bottom = dist(q[3], q[2]), left = dist(q[0], q[3]), right = dist(q[1], q[2]);
    let r = W && H ? aspect(q, W, H) : null;
    if (!r) r = Math.max(top, bottom) / Math.max(left, right, 1);
    r = snap(r);
    const hh = Math.max(left, right, top / r, bottom / r, 8);
    const ww = hh * r;
    const k = Math.min(1, Math.sqrt(MAX_PX / (ww * hh)));
    return { w: Math.max(8, Math.round(ww * k)), h: Math.max(8, Math.round(hh * k)), ratio: r };
  }

  /* ---------------- 補正・回転 ---------------- */

  /** 元（{width, height, data}）の四角 quad を outW×outH へ。cubic は双三次（Catmull-Rom）。 */
  function warp(src, quad, outW, outH, cubic) {
    const H = homography([[0, 0], [outW, 0], [outW, outH], [0, outH]], quad);
    const out = new Uint8ClampedArray(outW * outH * 4);
    const s = src.data, sw = src.width, sh = src.height;
    const mx = sw - 1, my = sh - 1;
    for (let v = 0; v < outH; v++) {
      const yv = v + 0.5;
      const bx = H[1] * yv + H[2], by = H[4] * yv + H[5], bw = H[7] * yv + H[8];
      let o = v * outW * 4;
      for (let u = 0; u < outW; u++, o += 4) {
        const xu = u + 0.5;
        const ww = H[6] * xu + bw;
        let x = (H[0] * xu + bx) / ww - 0.5, y = (H[3] * xu + by) / ww - 0.5;
        if (x < 0) x = 0; else if (x > mx) x = mx;
        if (y < 0) y = 0; else if (y > my) y = my;
        if (cubic) {
          const xf = Math.floor(x), yf = Math.floor(y), tx = x - xf, ty = y - yf;
          const a0 = ((-0.5 * tx + 1) * tx - 0.5) * tx, a1 = (1.5 * tx - 2.5) * tx * tx + 1;
          const a2 = ((-1.5 * tx + 2) * tx + 0.5) * tx, a3 = (0.5 * tx - 0.5) * tx * tx;
          const b0 = ((-0.5 * ty + 1) * ty - 0.5) * ty, b1 = (1.5 * ty - 2.5) * ty * ty + 1;
          const b2 = ((-1.5 * ty + 2) * ty + 0.5) * ty, b3 = (0.5 * ty - 0.5) * ty * ty;
          const x0 = xf > 0 ? xf - 1 : 0, x1 = xf, x2 = xf + 1 < sw ? xf + 1 : mx, x3 = xf + 2 < sw ? xf + 2 : mx;
          let r = 0, g = 0, b = 0;
          for (let j = 0; j < 4; j++) {
            let yy = yf - 1 + j;
            if (yy < 0) yy = 0; else if (yy > my) yy = my;
            const wy = j === 0 ? b0 : j === 1 ? b1 : j === 2 ? b2 : b3;
            const row = yy * sw;
            const p0 = (row + x0) * 4, p1 = (row + x1) * 4, p2 = (row + x2) * 4, p3 = (row + x3) * 4;
            r += wy * (a0 * s[p0] + a1 * s[p1] + a2 * s[p2] + a3 * s[p3]);
            g += wy * (a0 * s[p0 + 1] + a1 * s[p1 + 1] + a2 * s[p2 + 1] + a3 * s[p3 + 1]);
            b += wy * (a0 * s[p0 + 2] + a1 * s[p1 + 2] + a2 * s[p2 + 2] + a3 * s[p3 + 2]);
          }
          out[o] = r; out[o + 1] = g; out[o + 2] = b;
        } else {
          const x0 = x | 0, y0 = y | 0;
          const x1 = x0 < mx ? x0 + 1 : x0, y1 = y0 < my ? y0 + 1 : y0;
          const fx = x - x0, fy = y - y0;
          const a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, e = (y1 * sw + x1) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const t = s[a + ch] + (s[b + ch] - s[a + ch]) * fx;
            const btm = s[c + ch] + (s[e + ch] - s[c + ch]) * fx;
            out[o + ch] = t + (btm - t) * fy;
          }
        }
        out[o + 3] = 255;
      }
    }
    return { width: outW, height: outH, data: out };
  }

  /** 時計回りに rot×90°。 */
  function rotate(img, rot) {
    rot = (((rot | 0) % 4) + 4) % 4;
    if (!rot) return img;
    const { width: w, height: h, data } = img;
    const W2 = rot % 2 ? h : w, H2 = rot % 2 ? w : h;
    const out = new Uint8ClampedArray(W2 * H2 * 4);
    const s32 = new Uint32Array(data.buffer, data.byteOffset, w * h), o32 = new Uint32Array(out.buffer);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = s32[y * w + x];
        if (rot === 1) o32[x * W2 + (h - 1 - y)] = v;
        else if (rot === 2) o32[(h - 1 - y) * W2 + (w - 1 - x)] = v;
        else o32[(w - 1 - x) * W2 + y] = v;
      }
    }
    return { width: W2, height: H2, data: out };
  }

  /* ---------------- 仕上げ ---------------- */

  /** 紙の明るさ（RGB）の推定。升ごとに明るい画素の色 → 紙らしくない升（写真・塗り・机）は
      隣の紙の升から埋める → ならす。 */
  function paperOf(img) {
    const { width: w, height: h, data: d } = img;
    const cell = Math.max(6, Math.round(Math.max(w, h) / 90));
    const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell), N = gw * gh;
    const R = new Float32Array(N), Gc = new Float32Array(N), B = new Float32Array(N), L = new Float32Array(N);
    const step = cell >= 12 ? 2 : 1;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const x0 = gx * cell, y0 = gy * cell, x1 = Math.min(w, x0 + cell), y1 = Math.min(h, y0 + cell);
        let mx = 0;
        for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
          const o = (y * w + x) * 4;
          const l = d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114;
          if (l > mx) mx = l;
        }
        let r = 0, g = 0, b = 0, c = 0;
        for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
          const o = (y * w + x) * 4;
          if (d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114 >= mx - 14) { r += d[o]; g += d[o + 1]; b += d[o + 2]; c++; }
        }
        const k = gy * gw + gx;
        R[k] = r / c; Gc[k] = g / c; B[k] = b / c; L[k] = mx;
      }
    }
    let ok = new Uint8Array(N);
    let any = false;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let lm = 0;
        for (let dy = -3; dy <= 3; dy++) {
          const yy = gy + dy;
          if (yy < 0 || yy >= gh) continue;
          for (let dx = -3; dx <= 3; dx++) {
            const xx = gx + dx;
            if (xx >= 0 && xx < gw && L[yy * gw + xx] > lm) lm = L[yy * gw + xx];
          }
        }
        const k = gy * gw + gx;
        const chroma = Math.max(R[k], Gc[k], B[k]) - Math.min(R[k], Gc[k], B[k]);
        if (L[k] >= 0.8 * lm && chroma < 48) { ok[k] = 1; any = true; }
      }
    }
    if (any) {
      for (let pass = 0; pass < gw + gh; pass++) {
        const next = ok.slice();
        let changed = false;
        for (let gy = 0; gy < gh; gy++) {
          for (let gx = 0; gx < gw; gx++) {
            const k = gy * gw + gx;
            if (ok[k]) continue;
            let r = 0, g = 0, b = 0, c = 0;
            for (let dy = -1; dy <= 1; dy++) {
              const yy = gy + dy;
              if (yy < 0 || yy >= gh) continue;
              for (let dx = -1; dx <= 1; dx++) {
                const xx = gx + dx;
                if (xx < 0 || xx >= gw) continue;
                const kk = yy * gw + xx;
                if (ok[kk]) { r += R[kk]; g += Gc[kk]; b += B[kk]; c++; }
              }
            }
            if (c) { R[k] = r / c; Gc[k] = g / c; B[k] = b / c; next[k] = 1; changed = true; }
          }
        }
        ok = next;
        if (!changed) break;
      }
    }
    let A = [R, Gc, B];
    for (let pass = 0; pass < 2; pass++) A = A.map((ch) => blur3(ch, gw, gh));
    return { R: A[0], G: A[1], B: A[2], gw, gh, cell };
  }

  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const TABLES = (() => {
    const gray = new Uint8ClampedArray(256), tint = new Uint8ClampedArray(256), soft = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      gray[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - 40) / (228 - 40))), 1.45);
      tint[v] = 255 * Math.min(1, Math.max(0, (v - 25) / (238 - 25)));
      soft[v] = 255 * Math.min(1, Math.max(0, (v - 6) / (244 - 6)));
    }
    return { gray, tint, soft };
  })();

  /** 仕上げ（その場で書き換える）。mode: "doc"（書類）・"color"（カラー）・"raw"（そのまま）。 */
  function finish(img, mode) {
    if (mode !== "doc" && mode !== "color") return img;
    const { width: w, height: h, data: d } = img;
    const P = paperOf(img);
    const Y = new Uint8ClampedArray(w * h);
    const { R: PR, G: PG, B: PB, gw, gh, cell } = P;
    const ga = new Int32Array(w), gb = new Int32Array(w), gf = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const gxf = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5));
      ga[x] = gxf | 0; gb[x] = Math.min(gw - 1, ga[x] + 1); gf[x] = gxf - ga[x];
    }
    for (let y = 0; y < h; y++) {
      const gyf = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5));
      const gy0 = gyf | 0, gy1 = Math.min(gh - 1, gy0 + 1), fy = gyf - gy0;
      const r0 = gy0 * gw, r1 = gy1 * gw;
      for (let x = 0; x < w; x++) {
        const fx = gf[x], a = r0 + ga[x], b = r0 + gb[x], c = r1 + ga[x], e = r1 + gb[x];
        const o = (y * w + x) * 4;
        let t = PR[a] + (PR[b] - PR[a]) * fx, u = PR[c] + (PR[e] - PR[c]) * fx;
        const br = Math.max(24, t + (u - t) * fy);
        t = PG[a] + (PG[b] - PG[a]) * fx; u = PG[c] + (PG[e] - PG[c]) * fx;
        const bgc = Math.max(24, t + (u - t) * fy);
        t = PB[a] + (PB[b] - PB[a]) * fx; u = PB[c] + (PB[e] - PB[c]) * fx;
        const bb = Math.max(24, t + (u - t) * fy);
        const r = clamp((d[o] * 255) / br), g = clamp((d[o + 1] * 255) / bgc), bl = clamp((d[o + 2] * 255) / bb);
        d[o] = r; d[o + 1] = g; d[o + 2] = bl;
        Y[y * w + x] = r * 0.299 + g * 0.587 + bl * 0.114;
      }
    }
    /* 字を締める（明るさの 3×3 との差を足す）＋曲線。 */
    const amt = mode === "doc" ? 0.9 : 0.5;
    const { gray, tint, soft } = TABLES;
    for (let y = 0; y < h; y++) {
      const up = (y > 0 ? y - 1 : y) * w, row = y * w, dn = (y < h - 1 ? y + 1 : y) * w;
      for (let x = 0; x < w; x++) {
        const xl = x > 0 ? x - 1 : x, xr = x < w - 1 ? x + 1 : x;
        const yc = Y[row + x];
        const mean = (Y[up + xl] + Y[up + x] + Y[up + xr] + Y[row + xl] + yc + Y[row + xr] + Y[dn + xl] + Y[dn + x] + Y[dn + xr]) / 9;
        const delta = amt * (yc - mean);
        const o = (row + x) * 4;
        const r = clamp(d[o] + delta), g = clamp(d[o + 1] + delta), b = clamp(d[o + 2] + delta);
        if (mode === "color") {
          d[o] = soft[r | 0]; d[o + 1] = soft[g | 0]; d[o + 2] = soft[b | 0];
        } else {
          const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
          const k = smooth(26, 70, mx - mn);
          const n = gray[clamp(yc + delta) | 0];
          d[o] = n + (tint[r | 0] - n) * k;
          d[o + 1] = n + (tint[g | 0] - n) * k;
          d[o + 2] = n + (tint[b | 0] - n) * k;
        }
      }
    }
    cleanEdges(img);
    return img;
  }

  /** 四辺の帯（3%）で、縁から続く暗いところ（補正で残った机・影）を白く。 */
  function cleanEdges(img) {
    const { width: w, height: h, data: d } = img;
    const bw = Math.max(2, Math.round(w * 0.03)), bh = Math.max(2, Math.round(h * 0.03));
    const band = (x, y) => x < bw || x >= w - bw || y < bh || y >= h - bh;
    const dark = (i) => d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114 < 170;
    const mark = new Uint8Array(w * h);
    const stack = new Int32Array(2 * (w * bh + h * bw) + 8);
    let sp = 0;
    const seed = (x, y) => { const i = y * w + x; if (!mark[i] && dark(i)) { mark[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
    for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
    const visit = (xx, yy) => {
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !band(xx, yy)) return;
      const j = yy * w + xx;
      if (!mark[j] && dark(j)) { mark[j] = 1; stack[sp++] = j; }
    };
    while (sp) {
      const i = stack[--sp];
      const x = i % w, y = (i - x) / w;
      visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
    }
    for (let i = 0; i < mark.length; i++) if (mark[i]) { const o = i * 4; d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; }
    return img;
  }

  /* ---------------- 字の帯（行・縦書きの列） ---------------- */

  function runs(p, a, b, thr) {
    const out = [];
    let s = -1;
    for (let i = a; i < b; i++) {
      if (p[i] > thr) { if (s < 0) s = i; } else if (s >= 0) { out.push([s, i]); s = -1; }
    }
    if (s >= 0) out.push([s, b]);
    if (!out.length) return out;
    const hs = out.map((r) => r[1] - r[0]).sort((x, y) => x - y);
    const med = hs[hs.length >> 1];
    const m = [out[0].slice()];
    for (const r of out.slice(1)) {
      const last = m[m.length - 1];
      if (r[0] - last[1] <= Math.max(1, med * 0.3)) last[1] = r[1]; else m.push(r.slice());
    }
    return m.filter((r) => r[1] - r[0] >= Math.max(3, med * 0.35));
  }

  /** 仕上げた一枚（白い紙に濃い字）から、字の帯。返すのは割合の座標（左上が 0,0）。
      横書きは上から、縦書き（列が行より揃う）は右から。 */
  function bands(img) {
    const { width: w, height: h, data: d } = img;
    const dark = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < dark.length; i++, j += 4) dark[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114 < 150 ? 1 : 0;
    const mx0 = Math.round(w * 0.015), mx1 = w - mx0, my0 = Math.round(h * 0.015), my1 = h - my0;
    const rows = new Int32Array(h), cols = new Int32Array(w);
    for (let y = my0; y < my1; y++) for (let x = mx0; x < mx1; x++) if (dark[y * w + x]) { rows[y]++; cols[x]++; }
    const H = runs(rows, my0, my1, Math.max(1, (mx1 - mx0) * 0.002));
    const V = runs(cols, mx0, mx1, Math.max(1, (my1 - my0) * 0.002));
    const hb = H.map(([a, b]) => {
      let x0 = w, x1 = 0;
      for (let y = a; y < b; y++) for (let x = mx0; x < mx1; x++) if (dark[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      return { x0, y0: a, x1: x1 + 1, y1: b };
    }).filter((b) => b.x1 > b.x0);
    const vb = V.map(([a, b]) => {
      let y0 = h, y1 = 0;
      for (let y = my0; y < my1; y++) for (let x = a; x < b; x++) if (dark[y * w + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { x0: a, y0, x1: b, y1: y1 + 1 };
    }).filter((b) => b.y1 > b.y0);
    const lineH = hb.filter((b) => b.x1 - b.x0 >= 3 * (b.y1 - b.y0)).length;
    const lineV = vb.filter((b) => b.y1 - b.y0 >= 3 * (b.x1 - b.x0)).length;
    const vertical = lineV >= 3 && lineV > 1.5 * lineH;
    const list = vertical ? vb.slice().reverse() : hb;
    return { vertical, bands: list.map((b) => ({ x0: b.x0 / w, y0: b.y0 / h, x1: b.x1 / w, y1: b.y1 / h })) };
  }

  /** 一字の幅（全角＝1）。 */
  const charW = (c) => (/[　-鿿豈-﫿！-｠￠-￦]|[\ud840-\ud87f][\udc00-\udfff]/.test(c) ? 1 : c === " " ? 0.3 : 0.55);

  /** 貼った字の行を帯へ割り当てる。返すのは行ごとの置き場所（割合の座標・vertical）。
      帯の長さ（字の数の見込み）と行の長さの比で、行の順・帯の順を保った動的計画
      （帯を飛ばす＝絵・線、二〜三行で一つの帯＝段組み、行を余らせる）。帯が無ければ均等に。 */
  function place(lines, layout, pageW, pageH) {
    const B = (layout && layout.bands) || [];
    const vert = !!(layout && layout.vertical);
    const nl = lines.length, nb = B.length;
    const lens = lines.map((l) => Array.from(l).reduce((s, c) => s + charW(c), 0) || 1);
    const even = () => lines.map((_, i) => {
      const m = 0.05, step = Math.min((1 - 2 * m) / Math.max(1, nl), 1 / 18);
      return { x0: m, x1: 1 - m, y0: m + i * step, y1: m + i * step + step * 0.9, vertical: false };
    });
    if (!nl) return [];
    if (!nb) return even();
    /* 行と帯の数が同じなら、そのまま一対一（写した字の行は帯の行と同じ順）。 */
    if (nl === nb) return B.map((b) => ({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, vertical: vert }));
    const est = B.map((b) => {
      const along = vert ? (b.y1 - b.y0) * pageH : (b.x1 - b.x0) * pageW;
      const across = vert ? (b.x1 - b.x0) * pageW : (b.y1 - b.y0) * pageH;
      return along / Math.max(1e-6, across * 0.95);
    });
    const INF = 1e18;
    const cost = Array.from({ length: nl + 1 }, () => new Float64Array(nb + 1).fill(INF));
    const back = Array.from({ length: nl + 1 }, () => new Int32Array(nb + 1).fill(-1));
    cost[0][0] = 0;
    const relax = (i, j, c, code) => { if (c < cost[i][j]) { cost[i][j] = c; back[i][j] = code; } };
    for (let i = 0; i <= nl; i++) {
      for (let j = 0; j <= nb; j++) {
        const c = cost[i][j];
        if (c >= INF) continue;
        if (j < nb) relax(i, j + 1, c + (est[j] < 2 ? 0.5 : 0.9), 0);
        if (i < nl) relax(i + 1, j, c + 1.6, 1);
        if (j < nb) {
          let L = 0;
          for (let k = 1; k <= 3 && i + k <= nl; k++) {
            L += lens[i + k - 1];
            relax(i + k, j + 1, c + Math.abs(Math.log((L + 0.5) / (est[j] + 0.5))) + 0.6 * (k - 1), 10 + k);
          }
        }
      }
    }
    const pick = new Array(nl).fill(-1);
    const groups = [];
    let i = nl, j = nb;
    while (i > 0 || j > 0) {
      const code = back[i][j];
      if (code === 0) j--;
      else if (code === 1) i--;
      else if (code > 10) {
        const k = code - 10;
        groups.push({ band: j - 1, from: i - k, to: i });
        for (let t = i - k; t < i; t++) pick[t] = j - 1;
        i -= k; j--;
      } else break;
    }
    const out = new Array(nl).fill(null);
    groups.forEach((gr) => {
      const b = B[gr.band];
      const total = lens.slice(gr.from, gr.to).reduce((s, x) => s + x, 0);
      let acc = 0;
      for (let t = gr.from; t < gr.to; t++) {
        const a = acc / total, z = (acc + lens[t]) / total;
        acc += lens[t];
        out[t] = vert
          ? { x0: b.x0, x1: b.x1, y0: b.y0 + (b.y1 - b.y0) * a, y1: b.y0 + (b.y1 - b.y0) * z, vertical: true }
          : { x0: b.x0 + (b.x1 - b.x0) * a, x1: b.x0 + (b.x1 - b.x0) * z, y0: b.y0, y1: b.y1, vertical: false };
      }
    });
    /* 余った行：前の行の置き場所に重ねる（無ければ均等の位置）。 */
    const ev = even();
    for (let t = 0; t < nl; t++) if (!out[t]) out[t] = t > 0 && out[t - 1] ? { ...out[t - 1] } : ev[t];
    return out;
  }

  /* ---------------- 字入りの PDF ---------------- */

  const fmt = (v) => String(Math.round(v * 100) / 100);
  const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, "0");
  const utf16 = (cp) => {
    if (cp < 0x10000) return hex4(cp);
    const c = cp - 0x10000;
    return hex4(0xd800 + (c >> 10)) + hex4(0xdc00 + (c & 0x3ff));
  };
  const textHex = (s) => `<FEFF${Array.from(String(s)).map((c) => utf16(c.codePointAt(0))).join("")}>`;
  const pdfDate = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    const off = -d.getTimezoneOffset(), sg = off >= 0 ? "+" : "-", a = Math.abs(off);
    return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sg}${p(Math.floor(a / 60))}'${p(a % 60)}'`;
  };

  /** ページ（{jpeg: Uint8Array, w, h, text, layout}）を一つの PDF に。写真は JPEG のまま（DCTDecode）、
      字は透明な層（3 Tr）で帯の位置へ。字は一字ずつ番号（Identity-H）、ToUnicode で元の字へ戻る。 */
  function makePdf(pages, info) {
    info = info || {};
    const enc = new TextEncoder();
    const parts = [];
    let len = 0;
    const offs = [];
    const add = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const cids = new Map();
    const cidOf = (cp) => { if (!cids.has(cp)) cids.set(cp, cids.size + 1); return cids.get(cp); };
    const FIRST = 8;
    const sizes = pages.map((p) => {
      /* 面積を A4 にそろえる（比は写真のまま。A4 の比なら A4 そのもの）。 */
      const k = Math.sqrt((595.28 * 841.89) / (p.w * p.h));
      return { W: p.w * k, H: p.h * k };
    });
    const streams = pages.map((p, i) => {
      const { W, H } = sizes[i];
      let s = `q ${fmt(W)} 0 0 ${fmt(H)} 0 0 cm /Im0 Do Q\n`;
      const lines = String(p.text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length) {
        const spots = place(lines, p.layout, W, H);
        s += "BT\n3 Tr\n";
        lines.forEach((l, j) => {
          const b = spots[j];
          const cps = Array.from(l).map((c) => c.codePointAt(0));
          if (b.vertical) {
            const across = (b.x1 - b.x0) * W, along = (b.y1 - b.y0) * H;
            const fs = Math.max(1, across * 0.86);
            const z = Math.max(1, (100 * along) / (cps.length * fs));
            s += `/F1 ${fmt(fs)} Tf\n${fmt(z)} Tz\n0 -1 1 0 ${fmt(b.x0 * W + across * 0.07)} ${fmt(H * (1 - b.y0))} Tm\n`;
          } else {
            const across = (b.y1 - b.y0) * H, along = (b.x1 - b.x0) * W;
            const fs = Math.max(1, across * 0.86);
            const z = Math.max(1, (100 * along) / (cps.length * fs));
            s += `/F1 ${fmt(fs)} Tf\n${fmt(z)} Tz\n1 0 0 1 ${fmt(b.x0 * W)} ${fmt(H * (1 - b.y1) + across * 0.12)} Tm\n`;
          }
          s += `<${cps.map((cp) => hex4(cidOf(cp))).join("")}> Tj\n`;
        });
        s += "ET\n";
      }
      return s;
    });

    const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n`); body(); add("\nendobj\n"); };
    const dict = (n, s) => obj(n, () => add(s));
    const stream = (n, head, bytes) => obj(n, () => {
      add(`<< ${head}${head ? " " : ""}/Length ${bytes.length} >>\nstream\n`);
      add(bytes);
      add("\nendstream");
    });

    add("%PDF-1.4\n");
    add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    dict(1, "<< /Type /Catalog /Pages 2 0 R /Lang (ja) /ViewerPreferences << /DisplayDocTitle true >> >>");
    dict(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${FIRST + i * 3} 0 R`).join(" ")}] /Count ${pages.length} >>`);
    dict(3, "<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>");
    dict(4, "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GlyphLessFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 1000 /CIDToGIDMap /Identity >>");
    dict(5, "<< /Type /FontDescriptor /FontName /GlyphLessFont /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 1000 /Descent 0 /CapHeight 1000 /StemV 80 >>");
    const pairs = [...cids.entries()].map(([cp, cid]) => `<${hex4(cid)}> <${utf16(cp)}>`);
    let cm = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n"
      + "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"
      + "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n";
    for (let i = 0; i < pairs.length; i += 100) {
      const part = pairs.slice(i, i + 100);
      cm += `${part.length} beginbfchar\n${part.join("\n")}\nendbfchar\n`;
    }
    cm += "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
    stream(6, "", enc.encode(cm));
    const when = pdfDate(info.date || new Date());
    dict(7, `<< /Title ${textHex(info.title || "")} /Producer (kurashi-note) /CreationDate (${when}) /ModDate (${when}) >>`);
    pages.forEach((p, i) => {
      const n = FIRST + i * 3;
      const { W, H } = sizes[i];
      dict(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(W)} ${fmt(H)}] `
        + `/Resources << /XObject << /Im0 ${n + 2} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${n + 1} 0 R >>`);
      stream(n + 1, "", enc.encode(streams[i]));
      stream(n + 2, `/Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, p.jpeg);
    });
    const count = FIRST + pages.length * 3;
    const xref = len;
    let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let i = 1; i < count; i++) x += `${String(offs[i]).padStart(10, "0")} 00000 n \n`;
    add(x);
    add(`trailer\n<< /Size ${count} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len);
    let at = 0;
    parts.forEach((b) => { out.set(b, at); at += b.length; });
    return out;
  }

  /* ---------------- 自動シャッターの見張り ---------------- */

  /** 四角の中の鮮明さ（ラプラシアンの分散。縮図の明るさ）。 */
  function sharpness(g, w, h, q) {
    const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    const x0 = Math.max(1, Math.floor(Math.min(...xs))), x1 = Math.min(w - 2, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(1, Math.floor(Math.min(...ys))), y1 = Math.min(h - 2, Math.ceil(Math.max(...ys)));
    let s = 0, s2 = 0, n = 0;
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const i = y * w + x;
        const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
        s += l; s2 += l * l; n++;
      }
    }
    return n ? s2 / n - (s / n) * (s / n) : 0;
  }

  /** 紙の中身の目印（24×32 の明るさ。平均を引いて散らばりで割る）。めくった・替えたを見分ける。 */
  function signature(g, w, h, q) {
    const gw = 24, gh = 32;
    const H = homography([[0, 0], [1, 0], [1, 1], [0, 1]], q);
    const out = new Float32Array(gw * gh);
    let m = 0;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const [x, y] = mapPt(H, (i + 0.5) / gw, (j + 0.5) / gh);
        const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y)));
        out[j * gw + i] = g[yi * w + xi];
        m += out[j * gw + i];
      }
    }
    m /= out.length;
    let v = 0;
    for (let k = 0; k < out.length; k++) { out[k] -= m; v += out[k] * out[k]; }
    const sd = Math.sqrt(v / out.length) + 4;
    for (let k = 0; k < out.length; k++) out[k] /= sd;
    return out;
  }
  const sigDiff = (a, b) => {
    if (!a || !b || a.length !== b.length) return 9;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  };

  const C = {
    MAX_PX, dist, polyArea, homography, mapPt, hull, maxQuad, order, isConvex, sane,
    grayOf, blur3, sobel, detect, refine, supportOf, aspect, snap, outSize,
    warp, rotate, paperOf, finish, cleanEdges, bands, place, makePdf, sharpness, signature, sigDiff,
  };
  G.KNScanCore = C;

  /* ---------------- Worker として ---------------- */
  if (typeof window === "undefined" && typeof importScripts === "function") {
    G.onmessage = (e) => {
      const m = e.data || {};
      try {
        if (m.op === "render") {
          let img = warp({ width: m.w, height: m.h, data: new Uint8ClampedArray(m.data) }, m.quad, m.outW, m.outH, m.cubic);
          img = rotate(img, m.rot);
          finish(img, m.mode);
          G.postMessage({ id: m.id, ok: true, w: img.width, h: img.height, data: img.data.buffer }, [img.data.buffer]);
        } else {
          G.postMessage({ id: m.id, ok: true });
        }
      } catch (err) {
        G.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
      }
    };
  }
})(typeof self !== "undefined" ? self : this);
