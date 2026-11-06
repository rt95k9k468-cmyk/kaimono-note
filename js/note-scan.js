/* =========================================================
   くらしノート — ノートのスキャン（`KN.scan`。docs/notes.md「スキャン」）

   ノートの＋ →「スキャン」。すぐカメラ（自前。紙が止まってピントが合えば自動で撮る・めくれば次を撮る・
   同じ紙は二度撮らない）。写真（iOS の選ぶ口に「写真を撮る」＝標準カメラもある）。→ 並べる（並べ替え・
   回す・外す・字）→ 四隅を直す（隅と辺・拡大の丸）→ 仕上げ（書類／カラー／そのまま）→ 保存。
   計算は js/scan-core.js（Worker で。使えなければこの場で）。**端末の中だけで処理する。**

   - 保存は docs/image-design.md のまま：一枚ごとに見る画像（`KN.noteImg.add`。長辺1600）と、すぐ下に
     原本の行（`KN.noteFile.keep`。仕上げた大きさ・JPEG 0.95）。終わりに字入りの PDF（`KN.noteFile.add`。
     写真は原本の JPEG のまま、字は行の帯の位置へ透明に）。ファイルを先に書き、書けてから本文。
   - 字はアプリでは読まない。「共有」→ iOS のショートカット（画像からテキストを抽出）→ 写した字を「貼る」
     （`---` の行か改ページで分ければ、まとめてページごとに入る）。字は `setText` で検索にも。
   - 撮りかけは別の入れ物 `kaimono-note-scan`（版1の決め打ち。写真と四隅・字だけ）。ショートカットへ行く
     あいだに iOS がアプリを落としても、開き直せば続きから（20分以内なら起動で開く）。保存・捨てるで消す。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const U = KN.util;
  const C = window.KNScanCore;

  const JPEG_Q = 0.95;          // 仕上げた原本（画質を落とさない）
  const SEEK = 320;             // 四隅を探す縮図の長辺
  const FINE = 1280;            // 縁を直す図の長辺
  const LOOK = 1600;            // 直す画面・並べる絵の元
  const PREVIEW = 1100;         // 並べて見せる仕上がり
  const LAYOUT = 1000;          // 字の帯を探す図
  const STILL_MS = 700;         // 紙が止まってから撮るまで（指の重さではない）
  const DETECT_MS = 110;        // 撮るあいだの四隅の間合い
  const DRAFT_DB = "kaimono-note-scan";
  const FLAG = "kn-scan-draft"; // 撮りかけがあるか・開いていたか（起動で続きを開く）
  const MODE_KEY = "kn-scan-mode";
  const RESUME_MS = 20 * 60e3;
  const MODES = [["doc", "書類"], ["color", "カラー"], ["raw", "そのまま"]];
  const SEP = /^\s*(?:-{3,}|={3,}|_{3,}|─{3,}|—{2,})\s*$/;

  /* ---------------- 下ごしらえ ---------------- */

  const canvasOf = (w, h) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  /** canvas の記憶を返す（iOS は canvas の記憶の合計に上限がある）。 */
  const drop = (c) => { if (c) { c.width = 1; c.height = 1; } };
  const toBlob = (cv, q) => new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("画像を作れませんでした"))), "image/jpeg", q));
  const ms = (name, fb) => (KN.motion && KN.motion.ms ? KN.motion.ms(name) : fb);
  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

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

  /** 絵の元の一部を w×h に描いて画素を読む。 */
  function pixels(src, sx, sy, sw, sh, w, h) {
    const c = canvasOf(w, h);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height);
    drop(c);
    return d;
  }
  const inset = (w, h) => { const m = 0.04; return [[w * m, h * m], [w * (1 - m), h * m], [w * (1 - m), h * (1 - m)], [w * m, h * (1 - m)]]; };
  const clampQ = (q, w, h) => q.map(([x, y]) => [Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y))]);

  /** 写真（bitmap・canvas）の四隅。hint は縮図で見つけた四角（同じ座標）。細かい図で縁を直線に当て直す。 */
  function locate(src, w, h, hint) {
    let coarse = hint || null;
    if (!coarse) {
      const k = Math.min(1, SEEK / Math.max(w, h));
      const img = pixels(src, 0, 0, w, h, w * k, h * k);
      const r = C.detect(img, { thorough: true });
      if (!r.found) return { found: false, quad: inset(w, h) };
      coarse = r.quad.map(([x, y]) => [(x * w) / img.width, (y * h) / img.height]);
    }
    const k2 = Math.min(1, FINE / Math.max(w, h));
    const f = pixels(src, 0, 0, w, h, w * k2, h * k2);
    const sx = f.width / w, sy = f.height / h;
    const g = C.blur3(C.grayOf(f), f.width, f.height);
    const q = C.refine({ w: f.width, h: f.height, g }, coarse.map(([x, y]) => [x * sx, y * sy]));
    return { found: true, quad: clampQ(q.map(([x, y]) => [x / sx, y / sy]), w, h) };
  }

  async function lookOf(src, w, h) {
    const k = Math.min(1, LOOK / Math.max(w, h));
    const c = canvasOf(w * k, h * k);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    try { return await toBlob(c, 0.88); } finally { drop(c); }
  }

  /* ---------------- ページ ---------------- */

  let idN = 0;
  const newId = () => `s${Date.now().toString(36)}${(idN++).toString(36)}`;
  function mkPage(o) {
    return {
      id: o.id || newId(), blob: o.blob, w: o.w, h: o.h, quad: o.quad.map((p) => p.slice()),
      auto: (o.auto || o.quad).map((p) => p.slice()), found: !!o.found, rot: o.rot || 0, text: o.text || "",
      look: o.look || null, lookUrl: null, prev: null, prevKey: "", prevP: null, prevFor: "",
      full: null, fullKey: "", fullP: null, fullFor: "",
    };
  }
  async function pageFromBlob(blob) {
    const pic = await decode(blob);
    try {
      const loc = locate(pic.src, pic.w, pic.h);
      const look = await lookOf(pic.src, pic.w, pic.h);
      return mkPage({ blob, w: pic.w, h: pic.h, quad: loc.quad, found: loc.found, look });
    } finally {
      pic.done();
    }
  }
  async function ensureLook(p) {
    if (p.look) return p.look;
    const pic = await decode(p.blob);
    try { p.look = await lookOf(pic.src, pic.w, pic.h); } finally { pic.done(); }
    return p.look;
  }
  const release = (p) => {
    [p.prev, p.lookUrl].forEach((u) => { if (u) URL.revokeObjectURL(u); });
    p.prev = p.lookUrl = null;
  };

  /* ---------------- 重い計算（Worker。使えなければこの場で） ---------------- */

  let worker = null;
  let wstate = "idle";          // idle → on / off
  let wseq = 0;
  const waits = new Map();
  const wfail = () => Object.assign(new Error("worker"), { worker: true });
  function offWorker() {
    wstate = "off";
    if (worker) { try { worker.terminate(); } catch (_) { /* もう止まっている */ } }
    worker = null;
    waits.forEach((w) => w.rej(wfail()));
    waits.clear();
  }
  function getWorker() {
    if (wstate === "off") return null;
    if (worker) return worker;
    try {
      worker = new Worker("js/scan-core.js");
      wstate = "on";
      worker.onmessage = (e) => {
        const m = e.data || {};
        const w = waits.get(m.id);
        if (!w) return;
        waits.delete(m.id);
        if (m.ok) w.res(m); else w.rej(new Error(m.error || "worker"));
      };
      worker.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); offWorker(); };
    } catch (_) {
      wstate = "off";
      worker = null;
    }
    return worker;
  }

  /** 補正・回転・仕上げ。Worker が途中で倒れたら null（呼ぶ側が元を読み直してこの場で）。 */
  async function processPx(src, quad, size, rot, mode, cubic) {
    const w = getWorker();
    if (w) {
      try {
        const r = await new Promise((resolve, reject) => {
          const id = ++wseq;
          waits.set(id, { res: resolve, rej: reject });
          try {
            w.postMessage({ op: "render", id, w: src.width, h: src.height, data: src.data.buffer, quad,
              outW: size.w, outH: size.h, rot, mode, cubic }, [src.data.buffer]);
          } catch (_) { waits.delete(id); reject(wfail()); }
        });
        return new ImageData(new Uint8ClampedArray(r.data), r.w, r.h);
      } catch (err) {
        if (err && err.worker) return null;
        throw err;
      }
    }
    let img = C.warp(src, quad, size.w, size.h, cubic);
    img = C.rotate(img, rot);
    C.finish(img, mode);
    return new ImageData(img.data, img.width, img.height);
  }

  /** 一枚を仕上げて canvas に。scale は元に掛ける倍率。o.look：小さな絵から（並べて見せる）、o.cubic：双三次。 */
  async function render(p, mode, scale, o) {
    o = o || {};
    for (let attempt = 0; attempt < 2; attempt++) {
      const pic = await decode(o.look ? await ensureLook(p) : p.blob);
      let out = null;
      try {
        const kd = pic.w / p.w;
        const WS = p.w * scale, HS = p.h * scale;
        const qS = p.quad.map(([x, y]) => [x * scale, y * scale]);
        const xs = qS.map((v) => v[0]), ys = qS.map((v) => v[1]);
        const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2), y0 = Math.max(0, Math.floor(Math.min(...ys)) - 2);
        const x1 = Math.min(Math.ceil(WS), Math.ceil(Math.max(...xs)) + 2), y1 = Math.min(Math.ceil(HS), Math.ceil(Math.max(...ys)) + 2);
        const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
        const s = scale / kd;
        const src = pixels(pic.src, x0 / s, y0 / s, cw / s, ch / s, cw, ch);
        out = await processPx(src, qS.map(([x, y]) => [x - x0, y - y0]), C.outSize(qS, WS, HS), p.rot || 0, mode, !!o.cubic);
      } finally {
        pic.done();
      }
      if (out) {
        const cv = canvasOf(out.width, out.height);
        cv.getContext("2d").putImageData(out, 0, 0);
        return cv;
      }
    }
    throw new Error("仕上げられませんでした");
  }

  /* ---------------- 撮りかけ（入れ物 kaimono-note-scan） ---------------- */

  let dbP = null;
  function draftDb() {
    if (dbP) return dbP;
    dbP = new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DRAFT_DB, 1); } catch (_) { resolve(null); return; }
      const t = setTimeout(() => resolve(null), 5000);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv", { keyPath: "k" });
        if (!d.objectStoreNames.contains("photo")) d.createObjectStore("photo", { keyPath: "id" });
      };
      req.onsuccess = () => {
        clearTimeout(t);
        const d = req.result;
        d.onversionchange = () => { try { d.close(); } catch (_) { /* もう閉じている */ } dbP = null; };
        resolve(d);
      };
      req.onerror = () => { clearTimeout(t); resolve(null); };
      req.onblocked = () => { clearTimeout(t); resolve(null); };
    });
    return dbP;
  }
  async function dtx(stores, mode, fn) {
    const d = await draftDb();
    if (!d) throw new Error("撮りかけを置けません");
    return new Promise((resolve, reject) => {
      const t = d.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => resolve(typeof out === "function" ? out() : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const draft = {
    putPhoto: (p) => p.blob.arrayBuffer()
      .then((bytes) => dtx(["photo"], "readwrite", (t) => { t.objectStore("photo").put({ id: p.id, type: p.blob.type || "image/jpeg", bytes }); }))
      .catch(() => {}),
    delPhoto: (id) => dtx(["photo"], "readwrite", (t) => { t.objectStore("photo").delete(id); }).catch(() => {}),
    putMeta: (m) => dtx(["kv"], "readwrite", (t) => { t.objectStore("kv").put({ k: "draft", ...m }); }).catch(() => {}),
    load: () => dtx(["kv", "photo"], "readonly", (t) => {
      const a = t.objectStore("kv").get("draft"), b = t.objectStore("photo").getAll();
      return () => ({ meta: a.result || null, photos: b.result || [] });
    }).catch(() => ({ meta: null, photos: [] })),
    clear: () => dtx(["kv", "photo"], "readwrite", (t) => { t.objectStore("kv").clear(); t.objectStore("photo").clear(); }).catch(() => {}),
  };
  const flag = (v) => {
    try { if (v) localStorage.setItem(FLAG, JSON.stringify(v)); else localStorage.removeItem(FLAG); } catch (_) { /* 書けない */ }
  };

  let mode = (() => {
    try { const m = localStorage.getItem(MODE_KEY); return MODES.some(([k]) => k === m) ? m : "doc"; } catch (_) { return "doc"; }
  })();
  const setMode = (m) => { mode = m; try { localStorage.setItem(MODE_KEY, m); } catch (_) { /* 書けない */ } };

  /** 貼った字を `---` の行・改ページで分ける。 */
  function splitPages(s) {
    const chunks = [];
    let cur = [];
    String(s || "").replace(/\r\n?/g, "\n").replace(/\f/g, "\n---\n").split("\n").forEach((l) => {
      if (SEP.test(l)) { chunks.push(cur.join("\n").trim()); cur = []; } else cur.push(l);
    });
    chunks.push(cur.join("\n").trim());
    return chunks.filter(Boolean);
  }

  /* ---------------- 画面 ---------------- */

  let live = null;

  function open(o) {
    o = o || {};
    if (live) return live;
    const { html, node, icon } = U;
    const pages = [];
    const pend = new Set();
    let view = "";
    let closed = false;
    let stream = null;
    let busy = false;
    let camGen = 0;
    let camFailed = false;
    let camRestart = null;
    let editCancel = null;
    let metaT = 0;
    const canCam = () => !camFailed && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const clip = () => !!(navigator.clipboard && navigator.clipboard.readText);

    const el = node(html`
      <div class="scan" role="dialog" aria-label="スキャン">
        <div class="scan-top">
          <button type="button" class="scan-ico js-back" aria-label="閉じる">${icon("close")}</button>
          <span class="scan-title js-title"></span>
          <div class="scan-top-r js-top-r"></div>
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
    const topR = el.querySelector(".js-top-r");
    const camIn = el.querySelector(".js-cam-in");
    const picIn = el.querySelector(".js-pic-in");
    document.body.append(el);
    document.documentElement.classList.add("is-scanning");
    requestAnimationFrame(() => el.classList.add("is-on"));

    const btn = (cls, ico, label, fn) => {
      const b = node(html`<button type="button" class="${cls}">${ico ? icon(ico) : ""}<span>${label}</span></button>`);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (b.getAttribute("aria-disabled") === "true") return;
        fn(b);
      });
      return b;
    };

    /* ---- 撮りかけを置く ---- */
    const metaNow = (isOpen) => {
      clearTimeout(metaT);
      metaT = 0;
      if (!pages.length) { flag(null); return draft.putMeta({ at: Date.now(), open: false, mode, pages: [] }); }
      const at = Date.now();
      flag({ open: !!isOpen, at, n: pages.length });
      return draft.putMeta({ at, open: !!isOpen, mode, pages: pages.map((p) => ({
        id: p.id, w: p.w, h: p.h, quad: p.quad, auto: p.auto, found: p.found, rot: p.rot, text: p.text })) });
    };
    const saveMeta = () => { clearTimeout(metaT); metaT = setTimeout(() => { if (!closed) metaNow(true); }, 250); };

    const stopCam = () => {
      if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) { /* 止まっている */ } });
      stream = null;
    };
    /** how: "keep"（撮りかけを残す）・"saved"・"drop"（既定。撮りかけを消す）。 */
    const close = (how) => {
      if (closed) return;
      closed = true;
      camGen++;
      stopCam();
      clearTimeout(metaT);
      if (how === "keep" && pages.length) metaNow(false);
      else { draft.clear(); flag(null); }
      pages.forEach(release);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVis);
      document.documentElement.classList.remove("is-scanning");
      el.remove();
      live = null;
    };
    const back = async () => {
      if (busy) return;
      if (view === "edit") { if (editCancel) editCancel(); return; }
      if (view !== "pages") { if (pages.length || pend.size) show("pages"); else close(); return; }
      if (!pages.length) { close(); return; }
      const v = await ask([
        { label: "あとで続ける", icon: "clock", value: "keep" },
        { label: "捨てる", icon: "trash", value: "drop", danger: true },
      ]);
      if (v === "keep") close("keep"); else if (v === "drop") close("drop");
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      const veil = el.querySelector(".scan-ask");
      if (veil) { veil.click(); return; }
      back();
    };
    const onVis = () => {
      if (closed) return;
      if (document.hidden) { if (pages.length) metaNow(true); return; }
      if (view === "cam" && camRestart) camRestart();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVis);
    el.querySelector(".js-back").addEventListener("click", () => back());

    /** 画面の中の小さな問い（下から）。外を押せば null。 */
    function ask(items) {
      return new Promise((resolve) => {
        const veil = node(html`<div class="scan-ask"><div class="scan-ask-box" role="menu"></div></div>`);
        const box = veil.querySelector(".scan-ask-box");
        const done = (v) => { veil.remove(); resolve(v); };
        items.forEach((it) => box.append(btn(`scan-ask-b${it.danger ? " is-danger" : ""}`, it.icon, it.label, () => done(it.value))));
        veil.addEventListener("click", (e) => { if (e.target === veil) done(null); });
        el.append(veil);
        requestAnimationFrame(() => veil.classList.add("is-on"));
      });
    }

    /* ---- 写真から ---- */
    const take = async (files) => {
      el.classList.add("is-busy");
      for (const f of files) {
        if (closed) return;
        try {
          const p = await pageFromBlob(f);
          pages.push(p);
          draft.putPhoto(p);
        } catch (_) {
          KN.ui.toast("画像を開けませんでした");
        }
      }
      el.classList.remove("is-busy");
      if (closed) return;
      saveMeta();
      if (pages.length) show("pages");
    };
    camIn.addEventListener("change", () => { const f = [...(camIn.files || [])]; camIn.value = ""; if (f.length) take(f); });
    picIn.addEventListener("change", () => { const f = [...(picIn.files || [])]; picIn.value = ""; if (f.length) take(f); });
    const pickPhotos = () => { picIn.value = ""; picIn.click(); };

    /* ---- 仕上がり（並べて見せる小さなもの・保存する原本） ---- */
    const keyOf = (p) => `${mode}|${p.rot || 0}|${p.quad.map((v) => v.map((n) => n.toFixed(1)).join(",")).join(";")}`;
    let prevQ = Promise.resolve();
    const preview = (p) => {
      const k = keyOf(p);
      if (p.prev && p.prevKey === k) return Promise.resolve(p.prev);
      if (p.prevP && p.prevFor === k) return p.prevP;
      p.prevFor = k;
      p.prevP = prevQ = prevQ.catch(() => {}).then(async () => {
        if (closed || keyOf(p) !== k || !pages.includes(p)) return null;
        const cv = await render(p, mode, Math.min(1, PREVIEW / Math.max(p.w, p.h)), { look: true });
        const b = await toBlob(cv, 0.85);
        drop(cv);
        if (p.prev) URL.revokeObjectURL(p.prev);
        p.prev = URL.createObjectURL(b);
        p.prevKey = k;
        return p.prev;
      });
      return p.prevP;
    };
    let fullQ = Promise.resolve();
    /** 原本の大きさで仕上げる（一枚ずつ順に。共有・保存の前に済ませておく）。 */
    const full = (p) => {
      const k = keyOf(p);
      if (p.full && p.fullKey === k) return Promise.resolve(p.full);
      if (p.fullP && p.fullFor === k) return p.fullP;
      p.fullFor = k;
      p.fullP = fullQ = fullQ.catch(() => {}).then(async () => {
        if (closed || keyOf(p) !== k || !pages.includes(p)) return null;
        const cv = await render(p, mode, 1, { cubic: true });
        const blob = await toBlob(cv, JPEG_Q);
        const v = { blob, w: cv.width, h: cv.height };
        drop(cv);
        if (keyOf(p) === k) { p.full = v; p.fullKey = k; }
        paintShare();
        return v;
      });
      return p.fullP;
    };
    /** 見せる絵を先に、原本はそのあと。 */
    const warm = () => Promise.all(pages.map((p) => preview(p).catch(() => null))).then(() => {
      if (!closed) pages.forEach((p) => full(p).catch(() => {}));
    });

    /* ---- 面 ---- */
    function show(v) {
      if (closed) return;
      if (view === "cam" && v !== "cam") { camGen++; stopCam(); camRestart = null; }
      view = v;
      el.dataset.view = v;
      stage.textContent = "";
      bar.textContent = "";
      topR.textContent = "";
      title.textContent = "";
      if (v === "start") paintStart();
      else if (v === "cam") paintCam();
      else if (v === "pages") paintPages();
    }

    function paintStart() {
      const box = node(html`<div class="scan-start"></div>`);
      if (canCam()) box.append(btn("scan-src js-src-cam", "camera", "撮る", () => show("cam")));
      box.append(
        btn("scan-src js-src-std", "camera", "カメラ", () => { camIn.value = ""; camIn.click(); }),
        btn("scan-src js-src-pic", "image", "写真", pickPhotos),
      );
      stage.append(box);
    }

    /* ---- 自前のカメラ（自動シャッター・連続撮影） ---- */
    function paintCam() {
      const gen = ++camGen;
      const alive = () => !closed && view === "cam" && gen === camGen;
      const wrap = node(html`
        <div class="scan-cam">
          <video class="js-video" playsinline muted autoplay></video>
          <canvas class="scan-view js-view"></canvas>
          <div class="scan-flash js-flash"></div>
        </div>
      `);
      stage.append(wrap);
      const video = wrap.querySelector(".js-video");
      /* iOS は属性だけでは足りないことがある。値でも入れる。 */
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute("webkit-playsinline", "");
      /* 見せるのは canvas に写した一コマ（iOS のホーム画面のアプリは、カメラの映像を video のままでは
         黒く出すことがある。2026年11月6日、iPhone）。紙の枠も同じ canvas に描く。 */
      const shown = wrap.querySelector(".js-view");
      const vg = shown.getContext("2d");
      const flash = wrap.querySelector(".js-flash");

      const st = { target: null, disp: null, lostAt: 0, last: null, since: 0, sharpMax: 0, armed: true, shotAt: -1e9, sig: null, prog: 0 };
      let auto = true;
      const autoB = btn("scan-pill js-auto", "", "自動", () => {
        auto = !auto;
        autoB.setAttribute("aria-pressed", String(auto));
        st.since = performance.now();
      });
      autoB.setAttribute("aria-pressed", "true");
      const torchB = node(html`<button type="button" class="scan-ico js-torch" aria-label="ライト" aria-pressed="false" hidden>${icon("sun")}</button>`);
      topR.append(torchB, autoB);
      const pickB = node(html`<button type="button" class="scan-round js-pick" aria-label="写真">${icon("image")}</button>`);
      const shot = node(html`<button type="button" class="scan-shutter js-shutter" aria-label="撮る"></button>`);
      const thumb = node(html`<button type="button" class="scan-thumb-b js-done" aria-label="並べる"><canvas class="js-thumb"></canvas><span class="scan-count js-count"></span></button>`);
      bar.append(pickB, shot, thumb);
      const thumbCv = thumb.querySelector(".js-thumb");
      const countEl = thumb.querySelector(".js-count");
      const paintCount = () => {
        const n = pages.length + pend.size;
        countEl.textContent = n ? String(n) : "";
        thumb.classList.toggle("is-empty", !n);
      };
      const putThumb = (src) => {
        const px = Math.min(2, window.devicePixelRatio || 1);
        const r = thumb.getBoundingClientRect();
        thumbCv.width = Math.max(2, Math.round(r.width * px));
        thumbCv.height = Math.max(2, Math.round(r.height * px));
        const g = thumbCv.getContext("2d");
        const k = Math.max(thumbCv.width / src.width, thumbCv.height / src.height);
        g.drawImage(src, (thumbCv.width - src.width * k) / 2, (thumbCv.height - src.height * k) / 2, src.width * k, src.height * k);
      };
      paintCount();
      const lastP = pages[pages.length - 1];
      if (lastP) ensureLook(lastP).then((b) => decode(b)).then((pic) => { if (alive()) putThumb(pic.src); pic.done(); }).catch(() => {});
      pickB.addEventListener("click", pickPhotos);
      thumb.addEventListener("click", () => { if (pages.length || pend.size) show("pages"); });

      let box = { x: 0, y: 0, w: 1, h: 1 };
      const fit = () => {
        if (!alive()) { window.removeEventListener("resize", fit); return; }
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw) return;
        const r = wrap.getBoundingClientRect();
        const k = Math.min(r.width / vw, r.height / vh);
        box = { x: (r.width - vw * k) / 2, y: (r.height - vh * k) / 2, w: vw * k, h: vh * k };
        Object.assign(shown.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
        const px = Math.min(2, window.devicePixelRatio || 1);
        const cw = Math.max(2, Math.round(box.w * px)), ch = Math.max(2, Math.round(box.h * px));
        if (shown.width !== cw || shown.height !== ch) { shown.width = cw; shown.height = ch; }
      };
      window.addEventListener("resize", fit);

      /* 写す・枠を描く（毎フレーム。枠は推定の間合いのあいだもなめらかに寄せる）。 */
      const draw = () => {
        if (!alive()) return;
        requestAnimationFrame(draw);
        if (!video.videoWidth || video.readyState < 2 || shown.width < 2) return;
        try { vg.drawImage(video, 0, 0, shown.width, shown.height); } catch (_) { return; }
        const now = performance.now();
        if (st.target) {
          st.disp = st.disp
            ? st.disp.map((p, i) => [p[0] + (st.target[i][0] - p[0]) * 0.35, p[1] + (st.target[i][1] - p[1]) * 0.35])
            : st.target.map((p) => p.slice());
        }
        const fade = st.target ? 1 : Math.max(0, 1 - (now - st.lostAt) / 260);
        if (!st.disp || fade <= 0) { if (!st.target) st.disp = null; return; }
        const k = shown.width / video.videoWidth;
        vg.save();
        vg.globalAlpha = fade;
        vg.beginPath();
        st.disp.forEach(([x, y], i) => (i ? vg.lineTo(x * k, y * k) : vg.moveTo(x * k, y * k)));
        vg.closePath();
        vg.fillStyle = `rgba(90, 174, 255, ${(0.12 + 0.22 * st.prog).toFixed(3)})`;
        vg.fill();
        vg.lineJoin = "round";
        vg.lineWidth = Math.max(2, (shown.width / box.w) * 3);
        vg.strokeStyle = "#5aaeff";
        vg.stroke();
        vg.restore();
      };

      const setProg = (v) => {
        if (Math.abs(v - st.prog) < 0.02 && v !== 0 && v !== 1) return;
        st.prog = v;
        shot.style.setProperty("--p", v.toFixed(3));
      };

      /* 四隅の推定（間合いごと）→ 止まった・鮮明・めくった を見て撮る。 */
      const judge = (r, s) => {
        const now = performance.now();
        if (!r.found) {
          if (st.target) st.lostAt = now;
          st.target = null;
          st.last = null;
          st.since = now;
          if (!st.armed && now - st.shotAt > 400) st.armed = true;
          setProg(0);
          return;
        }
        st.target = r.quad.map(([x, y]) => [x * s, y * s]);
        const diag = Math.hypot(r.w, r.h);
        const move = st.last ? Math.max(...r.quad.map((p, i) => C.dist(p, st.last[i]))) / diag : 1;
        st.last = r.quad;
        if (move > 0.012) st.since = now;
        const sharp = C.sharpness(r.gray, r.w, r.h, r.quad);
        st.sharpMax = Math.max(sharp, st.sharpMax * 0.98);
        const sig = C.signature(r.gray, r.w, r.h, r.quad);
        /* 撮ったあとは、紙が動く・消える・中身が変わる（めくる）まで次を撮らない。 */
        if (!st.armed && (move > 0.06 || C.sigDiff(sig, st.sig) > 0.45)) { st.armed = true; st.since = now; }
        const held = now - st.since;
        setProg(auto && st.armed ? Math.min(1, held / STILL_MS) : 0);
        if (!auto || !st.armed || held < STILL_MS || now - st.shotAt < 900) return;
        if (sharp < 0.6 * st.sharpMax) return;
        if (st.sig && C.sigDiff(sig, st.sig) < 0.3) { st.armed = false; setProg(0); return; }
        shoot(st.target, sig);
      };

      const seekCv = canvasOf(2, 2);
      const sgc = seekCv.getContext("2d", { willReadFrequently: true });
      const tick = () => {
        if (!alive()) { drop(seekCv); return; }
        if (video.videoWidth && video.readyState >= 2 && !document.hidden) {
          const vw = video.videoWidth, vh = video.videoHeight;
          const k = Math.min(1, SEEK / Math.max(vw, vh));
          const sw = Math.max(2, Math.round(vw * k)), sh = Math.max(2, Math.round(vh * k));
          if (seekCv.width !== sw || seekCv.height !== sh) { seekCv.width = sw; seekCv.height = sh; }
          try {
            sgc.drawImage(video, 0, 0, sw, sh);
            judge(C.detect(sgc.getImageData(0, 0, sw, sh)), vw / sw);
          } catch (_) { /* この一コマは飛ばす */ }
        }
        setTimeout(tick, DETECT_MS);
      };

      /* 撮った一コマを、枠の場所から右下の束へ飛ばす。 */
      const snapshot = (q) => {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw) return null;
        const qq = q || [[0, 0], [vw, 0], [vw, vh], [0, vh]];
        const xs = qq.map((p) => p[0]), ys = qq.map((p) => p[1]);
        const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
        const x1 = Math.min(vw, Math.max(...xs)), y1 = Math.min(vh, Math.max(...ys));
        if (x1 - x0 < 8 || y1 - y0 < 8) return null;
        const k = Math.min(1, 480 / Math.max(x1 - x0, y1 - y0));
        const cv = canvasOf((x1 - x0) * k, (y1 - y0) * k);
        cv.getContext("2d").drawImage(video, x0, y0, x1 - x0, y1 - y0, 0, 0, cv.width, cv.height);
        const sr = shown.getBoundingClientRect();
        const kk = sr.width / vw;
        return { cv, rect: { left: sr.left + x0 * kk, top: sr.top + y0 * kk, width: (x1 - x0) * kk, height: (y1 - y0) * kk } };
      };
      const fly = (snap) => {
        if (reduced()) { drop(snap.cv); return; }
        const tr = thumb.getBoundingClientRect();
        const f = snap.cv;
        f.className = "scan-fly";
        Object.assign(f.style, { left: `${snap.rect.left}px`, top: `${snap.rect.top}px`, width: `${snap.rect.width}px`, height: `${snap.rect.height}px` });
        el.append(f);
        const s = Math.min(tr.width / snap.rect.width, tr.height / snap.rect.height);
        const dx = tr.left + tr.width / 2 - (snap.rect.left + snap.rect.width / 2);
        const dy = tr.top + tr.height / 2 - (snap.rect.top + snap.rect.height / 2);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          f.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(3)})`;
          f.classList.add("is-going");
        }));
        setTimeout(() => { f.remove(); drop(f); }, ms("--m-sheet-open", 340) + 120);
      };

      let chain = Promise.resolve();
      const develop = async (src, vw, vh) => {
        if (src.photo) {
          const blob = await src.photo;
          if (blob) { drop(src.cv); return pageFromBlob(blob); }
        }
        try {
          const loc = locate(src.cv, vw, vh, src.q);
          const look = await lookOf(src.cv, vw, vh);
          const blob = await toBlob(src.cv, JPEG_Q);
          return mkPage({ blob, w: vw, h: vh, quad: loc.quad, found: !!src.q || loc.found, look });
        } finally {
          drop(src.cv);
        }
      };
      const shoot = (q, sig) => {
        if (!stream || !video.videoWidth) return;
        const now = performance.now();
        st.armed = false;
        st.shotAt = now;
        st.since = now;
        if (sig) st.sig = sig;
        setProg(0);
        flash.classList.remove("is-on");
        void flash.offsetWidth;
        flash.classList.add("is-on");
        if (U.haptic) U.haptic(10);
        const vw = video.videoWidth, vh = video.videoHeight;
        /* 一コマは押したその時に取る（あとで取ると次の紙が写る）。 */
        const cv = canvasOf(vw, vh);
        cv.getContext("2d").drawImage(video, 0, 0, vw, vh);
        const src = { cv, q: q ? q.map((p) => p.slice()) : null, photo: null };
        const track = stream.getVideoTracks()[0];
        if (track && window.ImageCapture) {
          try { src.photo = new window.ImageCapture(track).takePhoto().catch(() => null); } catch (_) { src.photo = null; }
        }
        const snap = snapshot(q);
        if (snap) { putThumb(snap.cv); fly(snap); }
        const job = (chain = chain.then(() => develop(src, vw, vh)))
          .then((p) => {
            if (!p || closed) return;
            pages.push(p);
            draft.putPhoto(p);
            saveMeta();
          })
          .catch(() => { if (!closed) KN.ui.toast("撮れませんでした"); })
          .finally(() => { pend.delete(job); if (alive()) paintCount(); });
        pend.add(job);
        paintCount();
      };
      shot.addEventListener("click", (e) => { e.stopPropagation(); shoot(st.target, null); });

      torchB.addEventListener("click", () => {
        const track = stream && stream.getVideoTracks()[0];
        if (!track) return;
        const on = torchB.getAttribute("aria-pressed") !== "true";
        track.applyConstraints({ advanced: [{ torch: on }] }).then(() => torchB.setAttribute("aria-pressed", String(on))).catch(() => {});
      });

      /* 映像が来るか（新しい一コマ）。iOS は許可の直後・高い解像度を最初から求めたときに来ないことがある。 */
      /* 合図は三つのどれか：新しい一コマの知らせ・再生の時刻が進む・小さく描いた画素が変わる
         （video を黒く出す iOS では前の二つが来ないことがある。本物のカメラは揺らぎで必ず変わる）。 */
      const frames = (wait) => new Promise((resolve) => {
        let done = false;
        const probe = canvasOf(8, 8);
        const pg = probe.getContext("2d", { willReadFrequently: true });
        let last = -1;
        const end = (ok) => { if (!done) { done = true; drop(probe); resolve(ok); } };
        setTimeout(() => end(false), wait);
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => end(video.videoWidth > 0));
        const t0 = video.currentTime;
        const poll = () => {
          if (done) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            if (video.currentTime > t0) { end(true); return; }
            try {
              pg.drawImage(video, 0, 0, 8, 8);
              const d = pg.getImageData(0, 0, 8, 8).data;
              let sum = 0;
              for (let i = 0; i < d.length; i++) sum = (sum * 31 + d[i]) >>> 0;
              if (last >= 0 && sum !== last) { end(true); return; }
              last = sum;
            } catch (_) { /* まだ描けない */ }
          }
          setTimeout(poll, 100);
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
      let running = false;
      const start = async () => {
        let ok = false;
        for (let i = 0; i < 2 && !ok; i++) {
          stopCam();
          const s = await navigator.mediaDevices.getUserMedia(BASE);
          if (!alive()) { s.getTracks().forEach((t) => t.stop()); return; }
          attach(s);
          ok = await frames(2500);
          if (!alive()) return;
        }
        if (!ok) throw new Error("映りません");
        fit();
        if (!running) { running = true; requestAnimationFrame(draw); tick(); }
        const track = stream.getVideoTracks()[0];
        try { const caps = track.getCapabilities ? track.getCapabilities() : null; if (caps && caps.torch) torchB.hidden = false; } catch (_) { /* 無い */ }
        if (!track.applyConstraints) return;
        /* 映ってから解像度を上げる（撮る一枚の画質）。上げて止まったら元の解像度へ。 */
        const was = track.getSettings ? track.getSettings() : {};
        try {
          await track.applyConstraints({ facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } });
          if (!alive()) return;
          if (!(await frames(2000)) && alive() && was.width) {
            await track.applyConstraints({ width: { ideal: was.width }, height: { ideal: was.height } }).catch(() => {});
          }
          fit();
        } catch (_) { /* 上げられない端末はそのまま */ }
      };
      const fail = () => {
        stopCam();
        if (!alive()) return;
        camFailed = true;
        KN.ui.toast("カメラを使えませんでした");
        show(pages.length || pend.size ? "pages" : "start");
      };
      camRestart = () => {
        const t = stream && stream.getVideoTracks()[0];
        if (alive() && (!t || t.readyState === "ended")) start().catch(fail);
      };
      start().catch(fail);
    }

    /* ---- 並べる・仕上げ・字・保存 ---- */
    let shareB = null;
    let progEl = null;
    const paintShare = () => {
      if (!shareB || !shareB.isConnected) return;
      const ready = pages.filter((p) => p.full && p.fullKey === keyOf(p)).length;
      shareB.setAttribute("aria-disabled", String(!pages.length || ready < pages.length));
      shareB.style.setProperty("--p", pages.length ? (ready / pages.length).toFixed(3) : "0");
    };
    const setProgress = (v) => {
      if (!progEl) return;
      progEl.hidden = v == null;
      if (v != null) progEl.style.setProperty("--p", Math.max(0, Math.min(1, v)).toFixed(3));
    };

    function paintPages() {
      if (!pages.length && !pend.size) { show(canCam() ? "cam" : "start"); return; }
      title.textContent = `${pages.length}枚`;
      if (clip() && pages.length > 1) topR.append(btn("scan-pill js-paste-all", "copy", "貼る", () => pasteAll()));
      const list = node(html`<div class="scan-pages"></div>`);
      stage.append(list);
      pages.forEach((p, i) => list.append(card(p, i)));
      if (pend.size) {
        list.append(node(html`<div class="scan-wait" aria-hidden="true"></div>`));
        Promise.all([...pend]).then(() => { if (view === "pages" && !closed) show("pages"); });
      }
      if (KN.reorder) {
        KN.reorder.attach(list, { item: ".scan-page", handle: ".js-grip", onDrop: (from, to) => {
          if (from === to) return;
          const [p] = pages.splice(from, 1);
          pages.splice(to, 0, p);
          saveMeta();
          show("pages");
        } });
      }

      progEl = node(html`<div class="scan-progress" hidden></div>`);
      const seg = node(html`<div class="scan-seg" role="radiogroup" aria-label="仕上げ"></div>`);
      MODES.forEach(([k, label]) => {
        const b = node(html`<button type="button" role="radio" class="scan-seg-b" data-mode="${k}">${label}</button>`);
        b.setAttribute("aria-checked", String(mode === k));
        b.addEventListener("click", () => {
          if (mode === k) return;
          setMode(k);
          seg.querySelectorAll(".scan-seg-b").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.mode === k)));
          list.querySelectorAll(".scan-page").forEach((c) => {
            const p = pages.find((x) => x.id === c.dataset.id);
            if (p) showPreview(p, c.querySelector("img"));
          });
          paintShare();
          saveMeta();
          warm();
        });
        seg.append(b);
      });
      const row = node(html`<div class="scan-acts"></div>`);
      shareB = btn("scan-pill is-wait js-share", "upload", "共有", () => share());
      row.append(
        btn("scan-pill js-add", "plus", "足す", () => show(canCam() ? "cam" : "start")),
        shareB,
        btn("scan-pill is-main js-save", "check", "保存", () => save()),
      );
      bar.append(progEl, seg, row);
      paintShare();
      warm();
    }

    function showPreview(p, im) {
      if (!im) return;
      if (!(p.prev && p.prevKey === keyOf(p))) im.classList.add("is-wait");
      preview(p).then((u) => {
        if (u && im.isConnected && p.prevKey === keyOf(p)) { im.src = u; im.classList.remove("is-wait"); }
      }).catch(() => {});
    }

    function card(p, i) {
      const c = node(html`
        <div class="scan-page" data-id="${p.id}">
          <button type="button" class="scan-grip js-grip" aria-label="並べ替え">${icon("grip")}</button>
          <button type="button" class="scan-thumb js-edit" aria-label="四隅を直す"><img alt=""></button>
          <div class="scan-page-side">
            <span class="scan-no">${String(i + 1)}</span>
            <textarea class="scan-text grow-field js-text" rows="2" placeholder="字" aria-label="字"></textarea>
            <div class="scan-page-acts"></div>
          </div>
        </div>
      `);
      const im = c.querySelector("img");
      showPreview(p, im);
      c.querySelector(".js-edit").addEventListener("click", () => editCorners(p));
      const ta = c.querySelector(".js-text");
      ta.value = p.text;
      ta.addEventListener("input", () => { p.text = ta.value; saveMeta(); });
      const acts = c.querySelector(".scan-page-acts");
      acts.append(btn("scan-mini js-rot", "redo", "回す", () => {
        p.rot = ((p.rot || 0) + 1) % 4;
        saveMeta();
        showPreview(p, im);
        paintShare();
        warm();
      }));
      if (clip()) {
        acts.append(btn("scan-mini js-paste", "copy", "貼る", async () => {
          try {
            const s = String((await navigator.clipboard.readText()) || "").trim();
            if (s) { p.text = ta.value = s; saveMeta(); }
          } catch (_) { KN.ui.focusNow(ta); }
        }));
      }
      acts.append(btn("scan-mini js-drop", "trash", "外す", () => {
        const k = pages.indexOf(p);
        if (k < 0) return;
        pages.splice(k, 1);
        release(p);
        draft.delPhoto(p.id);
        saveMeta();
        show("pages");
      }));
      return c;
    }

    /** まとめて貼る：`---` の行・改ページで分けてページごとに。分け目が無ければ、字の無い最初のページへ。 */
    async function pasteAll() {
      let s = "";
      try { s = await navigator.clipboard.readText(); } catch (_) { KN.ui.toast("貼れませんでした"); return; }
      const parts = splitPages(s);
      if (!parts.length || !pages.length) return;
      if (parts.length > 1) {
        parts.forEach((t, i) => {
          if (i < pages.length) pages[i].text = t;
          else pages[pages.length - 1].text = `${pages[pages.length - 1].text}\n${t}`;
        });
      } else {
        (pages.find((x) => !x.text.trim()) || pages[pages.length - 1]).text = parts[0];
      }
      saveMeta();
      show("pages");
    }

    /** 仕上げた原本を共有（ショートカットで字を写す）。押した流れで渡すので、仕上がるまでは押せない。 */
    function share() {
      const ready = pages.length && pages.every((p) => p.full && p.fullKey === keyOf(p));
      if (!ready) return;
      const files = pages.map((p, i) => new File([p.full.blob], `scan-${i + 1}.jpg`, { type: "image/jpeg" }));
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files }))) { KN.ui.toast("共有できませんでした"); return; }
      metaNow(true);
      navigator.share({ files }).catch(() => {});
    }

    /** 仕上げた一枚から字の帯（書類の仕上げで見る）。 */
    async function layoutOf(v) {
      const pic = await decode(v.blob);
      try {
        const k = Math.min(1, LAYOUT / Math.max(pic.w, pic.h));
        const img = pixels(pic.src, 0, 0, pic.w, pic.h, pic.w * k, pic.h * k);
        const im = { width: img.width, height: img.height, data: img.data };
        if (mode !== "doc") C.finish(im, "doc");
        return C.bands(im);
      } finally {
        pic.done();
      }
    }

    async function save() {
      if (busy || !pages.length) return;
      const I = KN.noteImg, D = KN.noteFile, N = KN.notes;
      if (!I || I.state() !== "on" || !N || N.state() !== "on") { KN.ui.toast("画像を保存できませんでした"); return; }
      busy = true;
      el.classList.add("is-busy");
      setProgress(0.02);
      try {
        await Promise.all([...pend]);
        const outs = [];
        for (let i = 0; i < pages.length; i++) {
          let v = await full(pages[i]);
          if (!v) v = await full(pages[i]);
          if (!v) throw new Error("仕上げられませんでした");
          outs.push(v);
          setProgress(0.05 + (0.55 * (i + 1)) / pages.length);
        }
        /* ファイルを先に書き、書けてから本文の行。 */
        const lines = [];
        const d = new Date();
        const stamp = `${d.getMonth() + 1}月${d.getDate()}日`;
        const fileOn = D && D.state() === "on";
        for (let i = 0; i < outs.length; i++) {
          const v = outs[i];
          const name = `scan-${i + 1}.jpg`;
          let id;
          try { id = await I.add(new File([v.blob], name, { type: "image/jpeg" })); } catch (_) { KN.ui.toast("画像を保存できませんでした"); return; }
          lines.push(I.refLine(id));
          if (fileOn) {
            try { const k = await D.keep(v.blob, name); lines.push(D.refLine(k.id, k.name)); } catch (_) { /* 縮めたものだけ */ }
          }
          setProgress(0.6 + (0.25 * (i + 1)) / outs.length);
        }
        let pdfLine = null;
        if (fileOn) {
          try {
            const layouts = [];
            for (let i = 0; i < outs.length; i++) layouts.push(pages[i].text.trim() ? await layoutOf(outs[i]).catch(() => null) : null);
            const jpegs = await Promise.all(outs.map((v) => v.blob.arrayBuffer()));
            const titleText = `スキャン ${stamp}`;
            const bytes = C.makePdf(outs.map((v, i) => ({ jpeg: new Uint8Array(jpegs[i]), w: v.w, h: v.h, text: pages[i].text, layout: layouts[i] })),
              { title: titleText, date: d });
            const got = await D.add(new File([bytes], `${titleText}.pdf`, { type: "application/pdf" }));
            const all = pages.map((p) => p.text.trim()).filter(Boolean).join("\n");
            if (all) await D.setText(got.id, all).catch(() => {});
            pdfLine = D.refLine(got.id, got.name);
          } catch (_) { KN.ui.toast("PDF を保存できませんでした"); }
        }
        setProgress(0.95);
        const note = N.draft();
        note.title = `スキャン ${stamp}`;
        note.body = lines.join("\n") + (pdfLine ? `\n\n${pdfLine}` : "");
        if (!N.put(note)) { KN.ui.toast("ノートに保存できませんでした"); return; }
        await N.flush();
        setProgress(1);
        close("saved");
        if (KN.screens && KN.screens.notes) KN.screens.notes.open(note.id);
      } catch (_) {
        KN.ui.toast("保存できませんでした");
      } finally {
        busy = false;
        if (!closed) { el.classList.remove("is-busy"); setProgress(null); }
      }
    }

    /* ---- 四隅を指で直す（隅と辺・拡大の丸） ---- */
    function editCorners(p) {
      view = "edit";
      el.dataset.view = "edit";
      stage.textContent = "";
      bar.textContent = "";
      topR.textContent = "";
      title.textContent = `${pages.indexOf(p) + 1} / ${pages.length}`;
      const was = p.quad.map((v) => v.slice());
      editCancel = () => { p.quad = was; editCancel = null; show("pages"); };
      const wrap = node(html`
        <div class="scan-edit">
          <div class="scan-edit-box js-box">
            <img alt="" class="js-src" draggable="false">
            <svg class="scan-poly" preserveAspectRatio="none"><polygon class="js-poly"></polygon></svg>
          </div>
          <canvas class="scan-loupe js-loupe" hidden></canvas>
        </div>
      `);
      stage.append(wrap);
      const box = wrap.querySelector(".js-box");
      const im = wrap.querySelector(".js-src");
      const poly = wrap.querySelector(".js-poly");
      const loupe = wrap.querySelector(".js-loupe");
      wrap.querySelector("svg").setAttribute("viewBox", `0 0 ${p.w} ${p.h}`);
      const handles = [0, 1, 2, 3].map((i) => ({ k: "c", i })).concat([0, 1, 2, 3].map((i) => ({ k: "e", i })));
      handles.forEach((hd) => {
        hd.el = node(html`<span class="scan-dot ${hd.k === "e" ? "is-edge" : ""}" data-h="${hd.k}${String(hd.i)}"></span>`);
        box.append(hd.el);
      });
      const posOf = (hd) => {
        if (hd.k === "c") return p.quad[hd.i];
        const a = p.quad[hd.i], b = p.quad[(hd.i + 1) % 4];
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      };
      const paint = () => {
        poly.setAttribute("points", p.quad.map((v) => v.join(",")).join(" "));
        handles.forEach((hd) => {
          const [x, y] = posOf(hd);
          hd.el.style.left = `${(x / p.w) * 100}%`;
          hd.el.style.top = `${(y / p.h) * 100}%`;
        });
      };
      const lay = () => {
        const r = wrap.getBoundingClientRect();
        const k = Math.min(r.width / p.w, r.height / p.h);
        box.style.width = `${p.w * k}px`;
        box.style.height = `${p.h * k}px`;
      };
      ensureLook(p).then((b) => {
        if (!p.lookUrl) p.lookUrl = URL.createObjectURL(b);
        if (im.isConnected) im.src = p.lookUrl;
      }).catch(() => {});
      requestAnimationFrame(() => { lay(); paint(); });

      const drawLoupe = (pt, cx, cy) => {
        if (!im.complete || !im.naturalWidth) return;
        const r = box.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const size = 112;
        if (loupe.width !== size * dpr) { loupe.width = size * dpr; loupe.height = size * dpr; }
        const g = loupe.getContext("2d");
        const zoom = (r.width / p.w) * 3;
        const half = size / 2 / zoom;
        const ki = im.naturalWidth / p.w;
        g.save();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = "#000";
        g.fillRect(0, 0, size, size);
        g.drawImage(im, (pt[0] - half) * ki, (pt[1] - half) * ki, 2 * half * ki, 2 * half * ki, 0, 0, size, size);
        g.translate(size / 2, size / 2);
        g.scale(zoom, zoom);
        g.translate(-pt[0], -pt[1]);
        g.beginPath();
        p.quad.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
        g.lineWidth = 2 / zoom;
        g.strokeStyle = "#5aaeff";
        g.stroke();
        g.restore();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.beginPath();
        g.arc(size / 2, size / 2, 3, 0, Math.PI * 2);
        g.fillStyle = "#5aaeff";
        g.fill();
        const wr = wrap.getBoundingClientRect();
        let ly = cy - wr.top - size - 44;
        if (ly < 0) ly = cy - wr.top + 44;
        loupe.style.transform = `translate(${(cx - wr.left - size / 2).toFixed(1)}px, ${ly.toFixed(1)}px)`;
        loupe.hidden = false;
      };

      let drag = null;
      box.addEventListener("pointerdown", (e) => {
        const r = box.getBoundingClientRect();
        const k = r.width / p.w;
        const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
        let best = null, bd = Infinity;
        handles.forEach((hd) => {
          const d0 = C.dist(posOf(hd), [x, y]) * k - (hd.k === "c" ? 8 : 0);
          if (d0 < bd) { bd = d0; best = hd; }
        });
        /* 指の太さ：画面で約44px以内の取っ手だけ掴む。 */
        if (!best || bd > 44) return;
        drag = { hd: best, x0: x, y0: y, q0: p.quad.map((v) => v.slice()) };
        box.setPointerCapture(e.pointerId);
        best.el.classList.add("is-held");
        e.preventDefault();
      });
      box.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const r = box.getBoundingClientRect();
        const k = r.width / p.w;
        const x = Math.min(p.w, Math.max(0, (e.clientX - r.left) / k)), y = Math.min(p.h, Math.max(0, (e.clientY - r.top) / k));
        const { hd, q0 } = drag;
        if (hd.k === "c") p.quad[hd.i] = [x, y];
        else {
          /* 辺は向きを保って平行に動かす（両端が一緒に）。 */
          const a = q0[hd.i], b = q0[(hd.i + 1) % 4];
          const len = C.dist(a, b) || 1;
          const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
          const dd = (x - drag.x0) * nx + (y - drag.y0) * ny;
          const mv = (v) => [Math.min(p.w, Math.max(0, v[0] + nx * dd)), Math.min(p.h, Math.max(0, v[1] + ny * dd))];
          p.quad[hd.i] = mv(a);
          p.quad[(hd.i + 1) % 4] = mv(b);
        }
        paint();
        drawLoupe(posOf(hd), e.clientX, e.clientY);
      });
      const up = () => {
        if (drag) drag.hd.el.classList.remove("is-held");
        drag = null;
        loupe.hidden = true;
      };
      box.addEventListener("pointerup", up);
      box.addEventListener("pointercancel", up);

      bar.append(
        btn("scan-pill js-auto-quad", "", "自動", () => { p.quad = p.auto.map((v) => v.slice()); paint(); }),
        btn("scan-pill js-whole", "", "全体", () => { p.quad = [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]; paint(); }),
        btn("scan-pill is-main js-ok", "check", "決める", () => {
          if (!(C.polyArea(p.quad) > 64 && C.isConvex(p.quad))) { p.quad = was; KN.ui.toast("四隅を直せませんでした"); }
          editCancel = null;
          saveMeta();
          show("pages");
        }),
      );
    }

    /* ---- 始め：撮りかけがあれば続きから、なければカメラ ---- */
    live = {
      close, pages, show,
      view: () => view,
      settle: () => Promise.all([...pend]),
      warm: () => Promise.all(pages.map((p) => full(p))),
    };
    draft.load().then(({ meta, photos }) => {
      if (closed) return;
      const byId = new Map((photos || []).map((x) => [x.id, x]));
      ((meta && meta.pages) || []).forEach((m) => {
        const ph = byId.get(m.id);
        if (!ph || !ph.bytes || !m.quad) return;
        pages.push(mkPage({ ...m, blob: new Blob([ph.bytes], { type: ph.type || "image/jpeg" }) }));
      });
      if (meta && MODES.some(([k]) => k === meta.mode)) mode = meta.mode;
      if (pages.length) { metaNow(true); show("pages"); } else show(canCam() ? "cam" : "start");
    });
    return live;
  }

  /* 起動したとき、20分以内に開いていた撮りかけがあれば続きを開く（ショートカットから戻ったら
     iOS がアプリを落としていた、のとき）。閉じて「あとで続ける」にしたものは、＋から開いたときだけ。 */
  (function resume() {
    let f = null;
    try { f = JSON.parse(localStorage.getItem(FLAG) || "null"); } catch (_) { f = null; }
    if (!f || !f.open || !f.n || !(Date.now() - (f.at || 0) < RESUME_MS)) return;
    const go = () => setTimeout(() => { if (!live) open({ resume: true }); }, 700);
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  })();

  KN.scan = {
    open,
    live: () => live,
    /** 試験の口：絵の元（canvas・bitmap）の四隅。 */
    locate: (src, w, h) => locate(src, w || src.width, h || src.height),
    workerState: () => wstate,
    noWorker: () => offWorker(),
    draft: () => draft.load(),
    splitPages,
  };
})();
