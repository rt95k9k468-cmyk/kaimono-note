/* ノートのスキャン（js/note-scan.js。docs/notes.md「スキャン」）。

   合成画像（暗い机の上に、斜めから撮った紙。照明ムラと色かぶり、字の帯・朱・蛍光ペン）で：
   四隅の推定のずれ（対角の1.5%以内）／書類・カラーの紙の白さとムラの消え方（そのままはムラが残る）／
   朱と蛍光ペンが色のまま・字は濃いまま／字入りの PDF（xref が合う・JPEG はそのまま埋まる・
   ToUnicode で字の層を取り出してページごとに照合・pdftotext があればそれでも）／
   ＋の「書く」「スキャン」・写真から取り込む → 四隅を指で直す → 保存（ノートに画像の行・原本の行・PDF の行、
   原本は仕上げた大きさのまま・見る画像は長辺1600・PDF の字は検索に）／自前のカメラ（captureStream を
   カメラの代わりに）で自動シャッター・止まったままなら二枚目を撮らない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-scan.js */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { open, checker } = require("./lib");

/* ---- PDF の字の層を取り出す（ToUnicode と各ページの Tj） ---- */
function pdfText(buf) {
  const s = buf.toString("latin1");
  const objs = new Map();
  const re = /(\d+) 0 obj\n/g;
  let m;
  while ((m = re.exec(s))) objs.set(Number(m[1]), m.index);
  const body = (n) => {
    const at = objs.get(n);
    const end = s.indexOf("\nendobj", at);
    return s.slice(at, end);
  };
  const streamOf = (n) => {
    const b = body(n);
    const a = b.indexOf("stream\n") + 7;
    return b.slice(a, b.lastIndexOf("\nendstream"));
  };
  /* xref の位置が「N 0 obj」を指すか */
  const sx = Number(/startxref\n(\d+)/.exec(s)[1]);
  const xr = s.slice(sx).split("\n");
  const count = Number(xr[1].split(" ")[1]);
  let xrefOk = xr[0] === "xref";
  for (let i = 1; i < count; i++) {
    const off = Number(xr[2 + i].slice(0, 10));
    if (!s.startsWith(`${i} 0 obj`, off)) xrefOk = false;
  }
  const font = body(3);
  const tu = Number(/\/ToUnicode (\d+) 0 R/.exec(font)[1]);
  const map = new Map();
  for (const mm of streamOf(tu).matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)) {
    const hex = mm[2];
    const units = [];
    for (let i = 0; i < hex.length; i += 4) units.push(parseInt(hex.slice(i, i + 4), 16));
    map.set(mm[1], String.fromCharCode(...units));
  }
  const kids = /\/Kids \[([^\]]*)\]/.exec(body(2))[1].match(/\d+ 0 R/g).map((k) => Number(k.split(" ")[0]));
  const pages = kids.map((k) => {
    const c = Number(/\/Contents (\d+) 0 R/.exec(body(k))[1]);
    const cs = streamOf(c);
    const invisible = /\b3 Tr\b/.test(cs);
    const lines = [...cs.matchAll(/<([0-9A-F]*)> Tj/g)].map((x) => x[1].match(/.{4}/g).map((h) => map.get(h) || "?").join(""));
    return { lines, invisible };
  });
  return { xrefOk, pages };
}

(async () => {
  const t = checker("note-scan");
  const { browser, page, errors } = await open({ noteFab: true });

  /* ---- 合成画像 ---- */
  const QUAD = [[520, 260], [2750, 420], [2600, 2250], [380, 2050]];
  const W = 3200, H = 2400;
  await page.evaluate(([quad, w, h]) => {
    const PW = 1100, PH = 1500;
    const pc = document.createElement("canvas");
    pc.width = PW; pc.height = PH;
    const g = pc.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, PW, PH);
    g.fillStyle = "#333";
    for (let y = 0.10; y < 0.45; y += 0.035) g.fillRect(PW * 0.1, PH * y, PW * 0.8, PH * 0.012);
    g.fillStyle = "rgb(200,30,40)"; g.fillRect(PW * 0.40, PH * 0.55, PW * 0.15, PH * 0.07);
    g.fillStyle = "rgb(255,240,60)"; g.fillRect(PW * 0.60, PH * 0.50, PW * 0.30, PH * 0.06);
    const P = g.getImageData(0, 0, PW, PH).data;
    const Hm = KN.scan.homography(quad, [[0, 0], [PW, 0], [PW, PH], [0, PH]]);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const cg = cv.getContext("2d");
    const out = cg.createImageData(w, h);
    const d = out.data;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const [u, v] = KN.scan.mapPt(Hm, x + 0.5, y + 0.5);
        const shade = 1 - 0.45 * ((x / w) * 0.6 + (y / h) * 0.4);
        if (u >= 0 && v >= 0 && u < PW && v < PH) {
          const p = ((v | 0) * PW + (u | 0)) * 4;
          d[o] = P[p] * shade; d[o + 1] = P[p + 1] * shade * 0.97; d[o + 2] = P[p + 2] * shade * 0.9;
        } else {
          const n = rnd() * 16;
          d[o] = 60 + n; d[o + 1] = 45 + n; d[o + 2] = 35 + n;
        }
        d[o + 3] = 255;
      }
    }
    cg.putImageData(out, 0, 0);
    window.__src = cv;
  }, [QUAD, W, H]);

  /* ---- 幾何 ---- */
  const geo = await page.evaluate(([quad]) => {
    const Hm = KN.scan.homography([[0, 0], [100, 0], [100, 50], [0, 50]], quad);
    const back = [[0, 0], [100, 0], [100, 50], [0, 50]].map(([x, y]) => KN.scan.mapPt(Hm, x, y));
    return Math.max(...back.map((p, i) => Math.hypot(p[0] - quad[i][0], p[1] - quad[i][1])));
  }, [QUAD]);
  t.check("射影：四隅が四隅へ移る", geo < 1e-6, String(geo));

  /* ---- 四隅の推定 ---- */
  const found = await page.evaluate(([w, h]) => KN.scan.seek(window.__src, w, h), [W, H]);
  const diag = Math.hypot(W, H);
  const err = Math.max(...found.quad.map((p, i) => Math.hypot(p[0] - QUAD[i][0], p[1] - QUAD[i][1])));
  t.check("四隅：見つかる", found.found);
  t.check("四隅：ずれは対角の1.5%以内", err / diag < 0.015, `${(err / diag * 100).toFixed(2)}% ${JSON.stringify(found.quad.map((p) => p.map(Math.round)))}`);
  const flat = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400; c.height = 300;
    const g = c.getContext("2d");
    g.fillStyle = "#777"; g.fillRect(0, 0, 400, 300);
    return KN.scan.seek(c, 400, 300);
  });
  t.check("四隅：紙が無ければ内側の枠（found: false）", !flat.found && flat.quad.length === 4);

  /* ---- 仕上げ ---- */
  const stats = await page.evaluate(async ([quad, w, h]) => {
    const blob = await new Promise((r) => window.__src.toBlob(r, "image/png"));
    const res = {};
    for (const mode of ["doc", "color", "raw"]) {
      const cv = await KN.scan.render({ blob, w, h, quad }, mode, 1);
      const W2 = cv.width, H2 = cv.height;
      const d = cv.getContext("2d").getImageData(0, 0, W2, H2).data;
      const region = (x0, y0, x1, y1) => {
        const L = [], R = [], G = [], B = [];
        for (let y = Math.round(y0 * H2); y < Math.round(y1 * H2); y += 2) {
          for (let x = Math.round(x0 * W2); x < Math.round(x1 * W2); x += 2) {
            const o = (y * W2 + x) * 4;
            R.push(d[o]); G.push(d[o + 1]); B.push(d[o + 2]);
            L.push(d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114);
          }
        }
        const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
        const sorted = L.slice().sort((a, b) => a - b);
        return { L: mean(L), r: mean(R), g: mean(G), b: mean(B), p5: sorted[Math.floor(sorted.length * 0.05)] };
      };
      res[mode] = {
        w: W2, h: H2,
        blankA: region(0.08, 0.72, 0.30, 0.92),   // 左下（明るい側）
        blankB: region(0.70, 0.72, 0.92, 0.92),   // 右下（暗い側）
        blankC: region(0.70, 0.05, 0.92, 0.09),   // 右上
        red: region(0.42, 0.565, 0.53, 0.605),
        hi: region(0.63, 0.51, 0.87, 0.55),
        ink: region(0.2, 0.1015, 0.8, 0.1105),
      };
    }
    return res;
  }, [QUAD, W, H]);
  const sz = await page.evaluate(([quad]) => KN.scan.outSize(quad), [QUAD]);
  t.check("補正：大きさは向かい合う辺の長いほう（縮めない）", stats.raw.w === sz.w && stats.raw.h === sz.h && sz.w > 2000, `${stats.raw.w}x${stats.raw.h}`);
  const spread = (m) => Math.max(m.blankA.L, m.blankB.L, m.blankC.L) - Math.min(m.blankA.L, m.blankB.L, m.blankC.L);
  t.check("そのまま：照明ムラが残る（試験が効いている）", spread(stats.raw) > 20, String(spread(stats.raw)));
  for (const mode of ["doc", "color"]) {
    const m = stats[mode];
    const name = mode === "doc" ? "書類" : "カラー";
    t.check(`${name}：紙は白い（平均248以上・下5%も235以上）`,
      [m.blankA, m.blankB, m.blankC].every((r) => r.L >= 248 && r.p5 >= 235),
      JSON.stringify([m.blankA, m.blankB, m.blankC].map((r) => [Math.round(r.L), Math.round(r.p5)])));
    t.check(`${name}：ムラが消える（白の差6以内）`, spread(m) <= 6, String(spread(m)));
    t.check(`${name}：色かぶりが消える（紙の R と B の差8以内）`, Math.abs(m.blankB.r - m.blankB.b) <= 8, JSON.stringify(m.blankB));
    t.check(`${name}：朱が残る`, m.red.r > 150 && m.red.g < 110 && m.red.b < 110, JSON.stringify(m.red));
    t.check(`${name}：蛍光ペンが残る`, m.hi.r > 200 && m.hi.g > 190 && m.hi.b < 170, JSON.stringify(m.hi));
    t.check(`${name}：字は濃い`, m.ink.L < 110, JSON.stringify(m.ink));
  }
  t.check("書類：2値化しない（字の帯は中間の濃さを持てる＝0と255だけではない）", stats.doc.ink.L > 0 && stats.doc.ink.L < 255);

  /* ---- 字入りの PDF ---- */
  const TEXTS = ["スキャンの字\n二行目 ABC 123", "𠮷野家の𠮷と「朱」"];
  const pdf = await page.evaluate(async (texts) => {
    const mk = async (w, h, color) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
      return new Uint8Array(await b.arrayBuffer());
    };
    const j1 = await mk(300, 420, "#eee"), j2 = await mk(500, 300, "#ddd");
    const bytes = KN.scan.makePdf([{ jpeg: j1, w: 300, h: 420, text: texts[0] }, { jpeg: j2, w: 500, h: 300, text: texts[1] }]);
    const b64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
    return { pdf: b64(bytes), j1: b64(j1), j2: b64(j2) };
  }, TEXTS);
  const pbuf = Buffer.from(pdf.pdf, "base64");
  const got = pdfText(pbuf);
  t.check("PDF：xref の位置が合う", got.xrefOk);
  t.check("PDF：2ページ・字は透明（3 Tr）", got.pages.length === 2 && got.pages.every((p) => p.invisible));
  t.check("PDF：字の層を取り出すとページごとに同じ字",
    got.pages[0].lines.join("\n") === TEXTS[0] && got.pages[1].lines.join("\n") === TEXTS[1], JSON.stringify(got.pages.map((p) => p.lines)));
  t.check("PDF：写真は JPEG のまま埋まる（作り直さない）",
    pbuf.indexOf(Buffer.from(pdf.j1, "base64")) > 0 && pbuf.indexOf(Buffer.from(pdf.j2, "base64")) > 0);
  const tool = spawnSync("pdftotext", ["-v"], { encoding: "utf8" });
  if (!tool.error) {
    const f = path.join(os.tmpdir(), `kn-scan-${process.pid}.pdf`);
    fs.writeFileSync(f, pbuf);
    const r = spawnSync("pdftotext", [f, "-"], { encoding: "utf8" });
    fs.unlinkSync(f);
    const pagesTxt = String(r.stdout || "").split("\f");
    const norm = (s) => s.replace(/\s+/g, "");
    t.check("PDF：pdftotext でも字が出る（ページごと）",
      r.status === 0 && norm(pagesTxt[0]) === norm(TEXTS[0]) && norm(pagesTxt[1]) === norm(TEXTS[1]), JSON.stringify(pagesTxt));
  }

  /* ---- ＋ →「書く」「スキャン」 ---- */
  await page.click('.tab[data-tab="notes"]');
  await page.waitForFunction(() => document.querySelector(".screen.is-active").dataset.screen === "notes"
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), null, { timeout: 4000 });
  await page.waitForFunction(() => KN.noteImg.state() === "on" && KN.noteFile.state() === "on" && KN.notes.state() === "on");
  await page.click("#dock .add-fab");
  await page.waitForSelector(".fab-menu.is-on .fab-menu-b");
  const labels = await page.$$eval(".fab-menu-b .fab-menu-label", (a) => a.map((x) => x.textContent));
  t.check("＋：書く・スキャンの二つ", JSON.stringify(labels) === JSON.stringify(["書く", "スキャン"]), JSON.stringify(labels));
  await page.click(".fab-menu-b:nth-child(1)");
  await page.waitForSelector(".sheet.is-note.is-open");
  t.check("＋の「書く」：新しいノートの紙", true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });

  const openScan = async () => {
    await page.click("#dock .add-fab");
    await page.waitForSelector(".fab-menu.is-on .fab-menu-b");
    await page.click(".fab-menu-b:nth-child(2)");
    await page.waitForSelector(".scan.is-on .scan-src");
  };
  await openScan();
  const srcs = await page.$$eval(".scan-src span", (a) => a.map((x) => x.textContent));
  t.check("スキャン：撮る・カメラ・写真", JSON.stringify(srcs) === JSON.stringify(["撮る", "カメラ", "写真"]), JSON.stringify(srcs));
  t.check("スキャン：説明文を置かない（字は短い札だけ）", (await page.$eval(".scan", (e) => e.innerText.replace(/\s+/g, ""))).length <= 8);

  /* 写真から */
  const jpg = await page.evaluate(async () => {
    const b = await new Promise((r) => window.__src.toBlob(r, "image/jpeg", 0.95));
    const u = new Uint8Array(await b.arrayBuffer());
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await page.setInputFiles(".scan .js-pic-in", { name: "doc.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpg, "base64") });
  await page.waitForSelector(".scan[data-view=pages] .scan-page img[src^='blob:']", { timeout: 15000 });
  t.check("写真：1枚・四隅は自動で見つかる", await page.evaluate(() => KN.scan.live().pages.length === 1 && KN.scan.live().pages[0].found));
  t.check("写真：仕上げは書類が既定", (await page.getAttribute(".scan-seg-b[aria-checked=true]", "data-mode")) === "doc");

  /* 四隅を指で直す → 自動へ戻す → 決める */
  await page.click(".scan .js-edit");
  await page.waitForSelector(".scan[data-view=edit] .scan-dot");
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => KN.scan.live().pages[0].quad.map((p) => p.slice()));
  const dot = await page.$eval(".scan-dot[data-i='0']", (d) => { const r = d.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(dot[0], dot[1]);
  await page.mouse.down();
  await page.mouse.move(dot[0] + 12, dot[1] + 18, { steps: 4 });
  t.check("四隅：指の上に拡大の丸", await page.$eval(".scan-loupe", (l) => !l.hidden));
  await page.mouse.up();
  const after = await page.evaluate(() => KN.scan.live().pages[0].quad.map((p) => p.slice()));
  t.check("四隅：左上を動かすと左上だけ動く", after[0][0] > before[0][0] + 5 && after[0][1] > before[0][1] + 5
    && JSON.stringify(after.slice(1)) === JSON.stringify(before.slice(1)), JSON.stringify([before[0], after[0]]));
  await page.click(".scan .js-auto-quad");
  await page.click(".scan .js-ok");
  await page.waitForSelector(".scan[data-view=pages]");
  t.check("四隅：「自動」で推定へ戻る", await page.evaluate((b) => JSON.stringify(KN.scan.live().pages[0].quad) === JSON.stringify(b), before));

  /* 足す → 撮る・カメラ・写真の面、× で並べる面へ戻る（ページは残る） */
  await page.click(".scan .js-add");
  await page.waitForSelector(".scan[data-view=start] .scan-src");
  await page.click(".scan .js-back");
  await page.waitForSelector(".scan[data-view=pages] .scan-page");
  t.check("足す：× で並べる面へ戻り、ページは残る", await page.evaluate(() => KN.scan.live().pages.length === 1));

  /* 字を貼って保存 */
  const TXT = "試験の字 一行目\n二行目";
  await page.fill(".scan .js-text", TXT);
  await page.click(".scan .js-save");
  await page.waitForSelector(".sheet.is-note.is-open", { timeout: 30000 });
  t.check("保存：スキャンの画面は閉じる", !(await page.$(".scan")));
  const saved = await page.evaluate(async () => {
    const n = KN.notes.list().find((x) => /^スキャン /.test(x.title));
    if (!n) return null;
    const lines = n.body.split("\n");
    const img = KN.noteImg.refOf(lines[0]);
    const orig = KN.noteFile.refOf(lines[1]);
    const pdfL = KN.noteFile.refOf(lines[lines.length - 1]);
    const rec = img && await KN.noteImg.get(img);
    const o = orig && await KN.noteFile.get(orig.id);
    const p = pdfL && await KN.noteFile.get(pdfL.id);
    const dims = async (bytes) => { const bm = await createImageBitmap(new Blob([bytes])); return [bm.width, bm.height]; };
    const u = p ? new Uint8Array(p.bytes) : new Uint8Array();
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return { body: n.body, lines, imgWH: rec ? [rec.w, rec.h] : null, origWH: o ? await dims(o.bytes) : null,
      pdfId: p && p.id, pdf: btoa(s), ft: p ? KN.noteFile.textOf(p.id) : "" };
  });
  t.check("保存：ノートができる", !!saved, "");
  if (saved) {
    t.check("保存：本文は画像の行・原本の行・空行・PDF の行",
      saved.lines.length === 4 && /^!\[\]\(img:[0-9a-f]{16}\)$/.test(saved.lines[0])
      && /^\[scan-1\.jpg\]\(file:[0-9a-f]{64}\.jpg\)$/.test(saved.lines[1]) && saved.lines[2] === ""
      && /\(file:[0-9a-f]{64}\.pdf\)$/.test(saved.lines[3]), saved.body);
    t.check("保存：見る画像は長辺1600（image-design の決まり）", saved.imgWH && Math.max(...saved.imgWH) === 1600, JSON.stringify(saved.imgWH));
    t.check("保存：原本は仕上げた大きさのまま（画質を落とさない）", saved.origWH && Math.max(...saved.origWH) > 1600
      && Math.abs(saved.origWH[0] - sz.w) <= sz.w * 0.03 && Math.abs(saved.origWH[1] - sz.h) <= sz.h * 0.03, JSON.stringify([saved.origWH, sz]));
    const sp = pdfText(Buffer.from(saved.pdf, "base64"));
    t.check("保存：PDF の字の層は貼った字", sp.xrefOk && sp.pages.length === 1 && sp.pages[0].lines.join("\n") === TXT, JSON.stringify(sp.pages));
    t.check("保存：PDF の字は検索に（setText）", /試験の字/.test(saved.ft), saved.ft);
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });

  /* ---- 自前のカメラ（captureStream をカメラの代わりに） ---- */
  await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 1200;
    const g = c.getContext("2d");
    const draw = () => g.drawImage(window.__src, 0, 0, 1600, 1200);
    draw();
    setInterval(draw, 100);
    /* 一回目は一コマも来ない流れ（iOS で黒いまま止まるとき）、二回目から映る。 */
    const dark = document.createElement("canvas");
    dark.width = 640; dark.height = 480;
    window.__gum = [];
    navigator.mediaDevices.getUserMedia = async (o) => {
      window.__gum.push(JSON.stringify(o));
      return window.__gum.length === 1 ? dark.captureStream(0) : c.captureStream(10);
    };
  });
  await openScan();
  await page.click(".scan-src:nth-child(1)");
  await page.waitForSelector(".scan[data-view=cam] video");
  t.check("カメラ：自動は既定で入", (await page.getAttribute(".scan .js-auto", "aria-pressed")) === "true");
  const shot = await page.waitForFunction(() => /済 1/.test(document.querySelector(".scan .js-done").textContent), null, { timeout: 12000 })
    .then(() => true, () => false);
  const gum = await page.evaluate(() => window.__gum);
  t.check("カメラ：映らなければ一度だけ開き直す", gum.length === 2, JSON.stringify(gum));
  t.check("カメラ：最初は解像度を求めない（映ってから上げる）", gum.every((g) => !/width|height/.test(g)), JSON.stringify(gum));
  t.check("カメラ：映像は muted・playsinline（値でも）", await page.$eval(".scan video", (v) => v.muted && v.playsInline));
  t.check("カメラ：紙が止まると自動で撮る", shot);
  await page.waitForTimeout(2500);
  t.check("カメラ：止まったままなら二枚目を撮らない", /済 1$/.test((await page.textContent(".scan .js-done")).trim()));
  await page.click(".scan .js-shutter");
  await page.waitForFunction(() => /済 2/.test(document.querySelector(".scan .js-done").textContent), null, { timeout: 5000 }).catch(() => {});
  t.check("カメラ：シャッターで撮れる（連続）", /済 2/.test(await page.textContent(".scan .js-done")));
  await page.click(".scan .js-done");
  await page.waitForSelector(".scan[data-view=pages] .scan-page");
  t.check("カメラ：済で並べる面へ（2枚）", (await page.$$(".scan .scan-page")).length === 2);
  t.check("カメラ：止める（流れを閉じる）", await page.evaluate(() => !document.querySelector(".scan video")));
  await page.keyboard.press("Escape");
  t.check("Escape で閉じる", !(await page.$(".scan")));

  /* 二度とも映らない：一言出して最初の面へ（「カメラ」で撮れる）。流れは止める。 */
  await page.evaluate(() => {
    const dark = document.createElement("canvas");
    window.__dark = [];
    navigator.mediaDevices.getUserMedia = async () => { const s = dark.captureStream(0); window.__dark.push(s); return s; };
  });
  await openScan();
  await page.click(".scan-src:nth-child(1)");
  const back = await page.waitForSelector(".scan[data-view=start] .scan-src", { timeout: 9000 }).then(() => true, () => false);
  t.check("カメラ：映らなければ最初の面へ戻る", back);
  t.check("カメラ：映らなかった流れは止める", await page.evaluate(() => window.__dark.length === 2
    && window.__dark.every((s) => s.getTracks().every((tr) => tr.readyState === "ended"))));
  await page.keyboard.press("Escape");

  t.check("頁のエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
