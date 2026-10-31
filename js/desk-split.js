/* =========================================================
   境目を引いて幅を変える（desk。docs/desk.md の「境目を引く」・design-review 10節の P5）

   左の列とノートの一覧の右の境目。マウスの端末（`pointer: fine`）の 840px〜だけ（CSS が出す）。
   二度押しで元の幅へ。カーソルを置けば ←→ で 16px ずつ・Home／End で端まで・Enter で元へ。
   幅はこの端末だけ（localStorage `kn-split`。記録に入れない＝控えで iPhone へ渡らない）。

   CSS（base.css・screens.css）は :root の `--rail-pick`・`--list-pick` を clamp に通して `--rail-w`・`--list-w` に
   する——窓が狭まっても中身（600px）・本文の段（480px）を潰さない。ここの clamp は同じ式（引くあいだの数と aria の値）。
   引くあいだは :root に毎フレーム書く（traps の例外：窓の幅を変えるのと同じで並べ直しは避けられない。マウスの端末だけ）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const KEY = "kn-split";
  const DESK = window.matchMedia("(min-width: 840px) and (pointer: fine)");
  const STEP = 16;
  const SIDES = {
    rail: { name: "--rail-pick", def: 232, min: 184, label: "左の列の幅",
      max: () => Math.min(360, window.innerWidth - 600) },
    list: { name: "--list-pick", def: 380, min: 280, label: "一覧の幅",
      max: () => Math.min(560, window.innerWidth - railNow() - 480) },
  };

  function read() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch (_) { return {}; }
  }
  function write(v) {
    try {
      if (Object.keys(v).length) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY);
    } catch (_) { /* 置けなければこの窓のあいだだけ */ }
  }
  const folded = () => document.documentElement.classList.contains("rail-fold");
  const clamp = (side, px) => Math.round(Math.max(side.min, Math.min(px, side.max())));
  function pickOf(key) {
    const n = Number(read()[key]);
    return Number.isFinite(n) ? n : SIDES[key].def;
  }
  function railNow() { return folded() ? 64 : clamp(SIDES.rail, pickOf("rail")); }
  const now = (key) => (key === "rail" ? railNow() : clamp(SIDES.list, pickOf("list")));

  const bars = {};
  function paint(key) {
    const side = SIDES[key], b = bars[key];
    const v = read()[key];
    const root = document.documentElement;
    if (Number.isFinite(Number(v))) KN.util.setVar(root, side.name, Number(v) + "px");
    else root.style.removeProperty(side.name);
    if (!b) return;
    b.setAttribute("aria-valuemin", String(side.min));
    b.setAttribute("aria-valuemax", String(Math.max(side.min, Math.round(side.max()))));
    b.setAttribute("aria-valuenow", String(now(key)));
  }
  const paintAll = () => { paint("rail"); paint("list"); };

  /* 中身の幅が変わった——窓の幅が変わったときと同じく測り直させる（暦の輪・印の一枚。左の列を畳むのと同じ）。 */
  const settled = () => requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));

  function set(key, px, keep) {
    const v = read();
    v[key] = clamp(SIDES[key], px);
    if (keep) write(v);
    KN.util.setVar(document.documentElement, SIDES[key].name, v[key] + "px");
    if (bars[key]) bars[key].setAttribute("aria-valuenow", String(v[key]));
  }
  function reset(key) {
    const v = read();
    delete v[key];
    write(v);
    paint(key);
    settled();
  }

  function make(key) {
    const b = document.createElement("div");
    b.className = "split split-" + key;
    b.setAttribute("role", "separator");
    b.setAttribute("aria-orientation", "vertical");
    b.setAttribute("aria-label", SIDES[key].label);
    b.tabIndex = 0;
    bars[key] = b;

    let start = null, raf = 0, last = 0;
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !DESK.matches) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      start = { x: e.clientX, w: now(key), id: e.pointerId };
      last = start.w;
      document.documentElement.classList.add("is-splitting");
      b.classList.add("is-held");
    });
    b.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      last = start.w + (e.clientX - start.x);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (start) set(key, last, false); });
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      const moved = Math.abs(e.clientX - start.x) > 0;
      start = null;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      document.documentElement.classList.remove("is-splitting");
      b.classList.remove("is-held");
      if (moved) { set(key, last, true); settled(); }
    };
    b.addEventListener("pointerup", end);
    b.addEventListener("pointercancel", end);
    b.addEventListener("lostpointercapture", end);
    b.addEventListener("dblclick", (e) => { e.preventDefault(); reset(key); });
    b.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const side = SIDES[key];
      let to = null;
      if (e.key === "ArrowLeft") to = now(key) - STEP;
      else if (e.key === "ArrowRight") to = now(key) + STEP;
      else if (e.key === "Home") to = side.min;
      else if (e.key === "End") to = side.max();
      else if (KN.util.isEnter(e)) { e.preventDefault(); reset(key); return; }
      if (to == null) return;
      e.preventDefault();          // keys.js の ←→（日を送る）にしない
      set(key, to, true);
      settled();
    });
    return b;
  }

  function boot() {
    const fold = document.getElementById("rail-fold") || document.getElementById("tabbar");
    if (!fold) return;
    fold.after(make("rail"), make("list"));
    paintAll();
    /* 窓の幅・左の列を畳むで上の端が変わる（aria の値だけ。幅そのものは CSS の clamp が追う）。 */
    window.addEventListener("resize", paintAll);
    /* 別の窓で引いた幅にそろえる。 */
    window.addEventListener("storage", (e) => { if (e.key === KEY || e.key === null) { paintAll(); settled(); } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  KN.deskSplit = { reset, now };
})();
