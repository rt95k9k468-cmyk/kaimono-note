/* =========================================================
   くらしノート — ノートの木を手で組み替える（つまんで運ぶ）

   決めごとは docs/notes-unify.md「並び」。ホームの木・左の木・紙の中の「中のノート」で同じ。
   - 指は長押し（KN.gesture.HOLD）、マウスは押したまま動かすと持ち上がる。押すだけなら今までどおり開く。
   - 行のあいだに落とす＝その段の並びへ。左右にずらすと段が上下する（線の字下げが行き先の段）。
     行の上（まん中）に落とす＝その中の終わりへ（行が色づく）。閉じた枝の上で待つと、その場で開く。
   - 運ぶのは子孫ごと（群 `.nt-grp` が薄くなる）。自分と自分の中は的にならない。
   - ノートブックの行は、ノートブックどうしの並びだけ。
   - 落としたら「元に戻す」。パソコンは Tab／Shift+Tab で段、Alt+↑↓ で並び、↑↓ で行を移る。
   - 運んでいるあいだは KN.reorder.hold（払って戻る・引いて閉じる・引いて更新が退く）と
     KN.notes.hold（組み直しは離してから一度）。運んでいる行は DOM から外さない（指の出来事が切れる）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const N = () => KN.notes;
  const { HOLD, HOLD_SLOP, AXIS } = KN.gesture;
  const EDGE = 56;       // 送る器の端からこれだけで送り始める（px）
  const SPEED = 14;      // 端での送り（px／フレーム）
  const SPRING = 650;    // 閉じた枝の上でこれだけ待つと開く（ms）
  const FINGER = 28;     // 指で一段ずらすのに要る横の動き（px）。マウスは字下げの幅のまま
  const INTO = [0.28, 0.72];   // 行のこの高さのあいだ＝その中へ

  let drag = null;
  const isActive = () => !!drag;

  /* 字下げの段（screen-notes.js の rowLook と同じ：5段目から半分ずつ）。 */
  const unit = (d) => (d <= 4 ? d : 4 + (d - 4) / 2);

  /** 器の中の、運べる行（ノートとノートブック）。「すべてのノート」などは入らない。 */
  function rowsOf(box) {
    const out = [];
    box.querySelectorAll(".nt-row").forEach((el) => {
      const book = el.classList.contains("js-book");
      if (!book && !el.classList.contains("js-tree-note")) return;
      out.push({ el, book, id: book ? null : el.dataset.id, nb: book ? el.dataset.nb : null,
        d: Number(el.dataset.d) || 0, leaf: el.dataset.table === "1" });
    });
    return out;
  }

  /**
   * @param {Element} box  木の器（行は box の中の .nt-row）
   * @param {object} o
   * @param {string} o.scope   "books"（ホーム・左の木：ノートブックの行と、ノートブックの無いノートが一番上）
   *                           か、紙の根のノートの id（紙の中の「中のノート」）
   * @param {Set} o.open       開いた枝（運ぶ先で閉じた枝をその場で開くのにだけ使う）
   * @param {Function} o.root  () => いまの器（組み直したあと、キーで動かした行へ戻る）
   * @param {Function} [o.scroller]  () => 送る器
   * @param {Function} [o.expand]    (行) => 閉じた枝をその場で開く（組み直さない）
   * @param {Function} [o.done]      運び終えたとき（待たせた組み直しをする）
   */
  function attach(box, o) {
    box.addEventListener("pointerdown", (e) => arm(e, box, o));
    box.addEventListener("keydown", (e) => key(e, box, o));
  }

  /* ---------------- 押す ---------------- */

  function arm(e, box, o) {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (!N() || N().state() !== "on" || KN.util.selecting(e)) return;
    const el = e.target.closest(".nt-row");
    const row = el && box.contains(el) ? rowsOf(box).find((r) => r.el === el) : null;
    if (!row || (row.book && o.scope !== "books")) return;
    const p = { x0: e.clientX, y0: e.clientY, pid: e.pointerId, target: e.target, mouse: e.pointerType === "mouse" };
    let timer = 0;
    const off = () => {
      clearTimeout(timer);
      document.removeEventListener("pointermove", mv, true);
      document.removeEventListener("pointerup", off, true);
      document.removeEventListener("pointercancel", off, true);
    };
    const go = (ev) => {
      off();
      if (row.el.isConnected && !drag) lift(box, o, row, ev, p);
    };
    const mv = (ev) => {
      if (ev.pointerId !== p.pid) return;
      const far = Math.hypot(ev.clientX - p.x0, ev.clientY - p.y0);
      if (p.mouse) { if (far > AXIS) go(ev); } else if (far > HOLD_SLOP) off();
    };
    /* 持ち上がるのは押しの途中。iPhone は指がまだ触れていない音を鳴らさないので、いま開けておく。 */
    if (!p.mouse) { KN.motion.wakeSound(); timer = setTimeout(() => go(null), HOLD); }
    document.addEventListener("pointermove", mv, true);
    document.addEventListener("pointerup", off, true);
    document.addEventListener("pointercancel", off, true);
  }

  /* ---------------- 持ち上げる ---------------- */

  /** 行の位置を測る（送る器の中身の上の y）。留まる行は運ぶあいだ留めない（.is-carrying）。 */
  function measure(d) {
    const st = d.sc ? d.sc.scrollTop : 0;
    d.all = rowsOf(d.box).map((r) => {
      const b = r.el.getBoundingClientRect();
      return Object.assign(r, { y: b.top + st, h: b.height, l: b.left, r: b.right });
    });
    d.list = d.all.filter((r) => !d.grp.contains(r.el));
    d.sr = d.sc ? d.sc.getBoundingClientRect() : null;
  }

  function lift(box, o, row, ev, p) {
    const sc = o.scroller ? o.scroller() : null;
    box.classList.add("is-carrying");
    const d = {
      box, o, row, grp: row.el.parentElement, sc, pid: p.pid,
      x0: p.x0, y0: p.y0, cx: ev ? ev.clientX : p.x0, cy: ev ? ev.clientY : p.y0,
      aim: null, mark: "", intoEl: null, springEl: null, spring: 0, raf: 0, touchEl: p.mouse ? null : p.target,
    };
    /* 測るのは書く前に、まとめて（docs/traps.md）。 */
    measure(d);
    const r0 = row.el.getBoundingClientRect();
    const cs = getComputedStyle(row.el);
    const px = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
    d.base = px("--nt-base");
    d.stepPx = px("--nt-step") || 18;
    d.step = p.mouse ? d.stepPx : Math.max(d.stepPx, FINGER);
    const tw = row.el.querySelector(".nt-twist");
    d.twist = tw ? tw.offsetWidth : 0;
    /* 写しは指の少し上（マウスは矢印の右下）に——指の下の行（中へ入る的）を隠さないように。 */
    d.lift = p.mouse ? p.y0 - r0.top + 8 : p.y0 - r0.top - r0.height * 1.2;
    const sheet = box.closest(".sheet");
    const z = sheet ? String((parseInt(getComputedStyle(sheet).zIndex, 10) || 0) + 1) : "";

    /* 指につく写し（行は元の場所で薄く残り、行き先の線と一緒に見える）。 */
    const ghost = row.el.cloneNode(true);
    ghost.classList.remove("js-tree-note", "js-book", "is-stick", "is-drop-into");
    ghost.classList.add("nt-carry");
    ghost.removeAttribute("aria-current");
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("tabindex", "-1");
    ghost.querySelectorAll("[role=button]").forEach((b) => b.removeAttribute("role"));
    Object.assign(ghost.style, { left: `${r0.left}px`, top: `${r0.top}px`, width: `${r0.width}px`, height: `${r0.height}px`,
      backgroundImage: "none", zIndex: z });
    const line = document.createElement("div");
    line.className = "nt-drop";
    line.hidden = true;
    if (z) line.style.zIndex = z;
    document.body.append(ghost, line);
    d.ghost = ghost;
    d.line = line;
    d.grp.classList.add("is-carried");

    drag = d;
    KN.reorder.hold(true);
    N().hold(true);
    try { row.el.setPointerCapture(p.pid); } catch (_) { /* 試験の指など */ }
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    document.addEventListener("keydown", esc, true);
    /* 運んでいる行の下で器を送らない。指の出来事は触れた要素に届くので、そこにも付ける。 */
    document.addEventListener("touchmove", swallow, { passive: false, capture: true });
    if (d.touchEl) d.touchEl.addEventListener("touchmove", swallow, { passive: false });
    KN.motion.fire("lift");
    paint(d);
    d.raf = requestAnimationFrame(tick);
  }

  const swallow = (e) => { if (drag && e.cancelable) e.preventDefault(); };
  const move = (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.pid) return;
    d.cx = e.clientX;
    d.cy = e.clientY;
  };
  const esc = (e) => { if (drag && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); stop(drag, false); } };

  /* 送りと塗りは一つのフレームの輪で（指を止めていても、端では送り続ける）。 */
  function tick() {
    const d = drag;
    if (!d) return;
    if (!d.row.el.isConnected) { stop(d, false); return; }
    if (d.sc && d.sr) {
      let v = 0;
      if (d.cy < d.sr.top + EDGE) v = -SPEED * Math.min(1, (d.sr.top + EDGE - d.cy) / EDGE);
      else if (d.cy > d.sr.bottom - EDGE) v = SPEED * Math.min(1, (d.cy - (d.sr.bottom - EDGE)) / EDGE);
      if (v) d.sc.scrollTop += v;
    }
    paint(d);
    d.raf = requestAnimationFrame(tick);
  }

  /* ---------------- 行き先 ---------------- */

  function aim(d) {
    const y = d.cy + (d.sc ? d.sc.scrollTop : 0);
    return d.row.book ? aimBook(d, y) : aimNote(d, y);
  }

  /** ノート：行の上なら「中へ」、行のあいだなら段と隣。 */
  function aimNote(d, y) {
    const L = d.list;
    if (!L.length) return null;
    let gap = L.length;
    for (let i = 0; i < L.length; i++) {
      const r = L[i];
      if (y < r.y) { gap = i; break; }
      if (y < r.y + r.h) {
        const f = (y - r.y) / r.h;
        if (!r.leaf && f > INTO[0] && f < INTO[1]) return { into: r };
        gap = f < 0.5 ? i : i + 1;
        break;
      }
    }
    const books = d.o.scope === "books";
    const prev = L[gap - 1] || null, next = L[gap] || null;
    const hi = prev ? (prev.leaf ? prev.d : prev.d + 1) : 0;
    /* 一番上の段はノートブックの無いノートの場所。ノートブックの行のあいだには置けない。 */
    const lo = Math.max(next ? next.d : 0, books && next && next.book ? 1 : 0);
    if (lo > hi) return null;
    const depth = Math.max(lo, Math.min(hi, d.row.d + Math.round((d.cx - d.x0) / d.step)));
    let up = null, after = null;
    for (let k = gap - 1; k >= 0 && depth > 0; k--) if (L[k].d === depth - 1) { up = L[k]; break; }
    for (let k = gap - 1; k >= 0 && L[k].d >= depth; k--) if (L[k].d === depth) { after = L[k]; break; }
    const to = up && up.book ? { parent: null, nb: up.nb }
      : up ? { parent: up.id }
        : books ? { parent: null, nb: "" } : { parent: d.o.scope };
    if (after) to.after = after.id;
    else if (next && next.d === depth) to.before = next.id;
    return { gap, depth, to, y: prev ? prev.y + prev.h : next.y };
  }

  /** ノートブック：ノートブックの群のあいだ（一番近いもの）。 */
  function aimBook(d, y) {
    const L = d.list;
    const B = L.filter((r) => r.book);
    if (!B.length) return null;
    const gaps = B.map((r) => ({ y: r.y, before: r.nb }));
    let k = L.indexOf(B[B.length - 1]);
    let bottom = L[k].y + L[k].h;
    for (k++; k < L.length && L[k].d > 0; k++) bottom = L[k].y + L[k].h;
    gaps.push({ y: bottom, before: null });
    const best = gaps.reduce((a, g) => (Math.abs(g.y - y) < Math.abs(a.y - y) ? g : a));
    return { book: true, depth: 0, y: best.y, to: { before: best.before } };
  }

  function paint(d) {
    const st = d.sc ? d.sc.scrollTop : 0;
    d.ghost.style.transform = `translate3d(${Math.round(d.cx - d.x0)}px, ${Math.round(d.cy - d.y0 + d.lift)}px, 0)`;
    const a = aim(d);
    d.aim = a;
    const mark = !a ? "" : a.into ? `in:${a.into.el.dataset.id || a.into.nb}` : `${a.y}:${a.depth}`;
    if (mark !== d.mark) { d.mark = mark; if (mark) KN.util.haptic(8); }

    const into = a && a.into ? a.into.el : null;
    if (into !== d.intoEl) {
      if (d.intoEl) d.intoEl.classList.remove("is-drop-into");
      if (into) into.classList.add("is-drop-into");
      d.intoEl = into;
    }
    /* 閉じた枝の上で待つと開く（組み直さずにその場で。開いたら測り直す）。 */
    const shut = into && into.getAttribute("aria-expanded") === "false" ? into : null;
    if (shut !== d.springEl) {
      clearTimeout(d.spring);
      d.springEl = shut;
      if (shut && d.o.expand) {
        d.spring = setTimeout(() => {
          if (drag !== d || d.springEl !== shut) return;
          d.o.expand(shut);
          d.springEl = null;
          measure(d);
        }, SPRING);
      }
    }

    /* 行き先の線：その段の字の頭から右まで。送る器の外では見せない。 */
    const show = a && !a.into;
    const top = show ? a.y - st : 0;
    const vis = show && (!d.sr || (top >= d.sr.top - 2 && top <= d.sr.bottom + 2));
    if (d.line.hidden === !!vis) d.line.hidden = !vis;
    if (vis) {
      const l0 = d.all.length ? d.all[0].l : 0, r0 = d.all.length ? d.all[0].r : 0;
      const left = Math.round(l0 + d.base + unit(a.depth) * d.stepPx + d.twist);
      const css = `top:${Math.round(top - 1)}px;left:${left}px;width:${Math.max(24, Math.round(r0 - left - 4))}px;${d.line.style.zIndex ? `z-index:${d.line.style.zIndex};` : ""}`;
      if (d.lineCss !== css) { d.lineCss = css; d.line.style.cssText = css; }
    }
  }

  /* ---------------- 置く ---------------- */

  function end(e) {
    const d = drag;
    if (!d || e.pointerId !== d.pid) return;
    stop(d, e.type === "pointerup");
  }

  function stop(d, commit) {
    drag = null;
    cancelAnimationFrame(d.raf);
    clearTimeout(d.spring);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", end, true);
    document.removeEventListener("pointercancel", end, true);
    document.removeEventListener("keydown", esc, true);
    document.removeEventListener("touchmove", swallow, { capture: true });
    if (d.touchEl) d.touchEl.removeEventListener("touchmove", swallow);
    d.ghost.remove();
    d.line.remove();
    if (d.intoEl) d.intoEl.classList.remove("is-drop-into");
    d.box.classList.remove("is-carrying");
    d.grp.classList.remove("is-carried");
    /* 持ち上げた押しが、離したところで「押した」にならないように（次に押すまで・長くても少しのあいだ）。 */
    const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    const fed = () => { document.removeEventListener("click", eat, true); document.removeEventListener("pointerdown", fed, true); };
    document.addEventListener("click", eat, true);
    document.addEventListener("pointerdown", fed, true);
    setTimeout(fed, 350);
    KN.reorder.hold(false);
    const a = commit ? d.aim : null;
    let undo = null;
    /* 置くのがしくじっても、待たせた組み直しは必ず放す（放さないとノートの面が止まったままになる）。 */
    try {
      if (a && a.book) {
        const was = N().moveBook(d.row.nb, a.to.before);
        if (was) undo = () => N().setBooks(was);
      } else if (a) {
        const to = a.into ? (a.into.book ? { parent: null, nb: a.into.nb } : { parent: a.into.id }) : a.to;
        /* 置いた先の枝は開かない（続けて何冊も入れるとき、>が開いたまま残って邪魔になる）。 */
        const was = N().place(d.row.id, to);
        if (was) undo = () => N().unplace(was);
      }
    } finally {
      N().hold(false);
      if (d.o.done) d.o.done();
    }
    if (undo) landed(undo);
  }

  function landed(undo) {
    KN.motion.fire("drop");
    KN.ui.toast("移しました", { action: { label: "元に戻す", onClick: () => undo() } });
  }

  /* ---------------- キー（パソコン） ---------------- */

  function key(e, box, o) {
    if (drag || e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    const el = e.target.closest && e.target.closest(".nt-row");
    if (!el || !box.contains(el)) return;
    const k = e.key;
    if ((k === "ArrowUp" || k === "ArrowDown") && !e.altKey && !e.shiftKey) {
      const all = [...box.querySelectorAll(".nt-row")];
      const nx = all[all.indexOf(el) + (k === "ArrowUp" ? -1 : 1)];
      e.preventDefault();
      if (nx) nx.focus();
      return;
    }
    const row = rowsOf(box).find((r) => r.el === el);
    if (!row || !N() || N().state() !== "on") return;
    if ((k === "ArrowUp" || k === "ArrowDown") && e.altKey && !e.shiftKey) {
      e.preventDefault();
      shift(box, o, row, k === "ArrowUp" ? -1 : 1);
    } else if (k === "Tab" && !e.altKey && !row.book) {
      e.preventDefault();
      indent(box, o, row, e.shiftKey ? -1 : 1);
    }
  }

  /** いまの兄弟と、同じ群へ置き直す to。 */
  function groupOf(n) {
    const t = N().tree();
    const up = t.parentOf(n.id);
    if (up && !t.isHead(up.id)) return { t, up, sibs: t.kids(up.id), to: { parent: up.id } };
    return { t, up: null, sibs: t.tops(n.notebook), to: { parent: null, nb: n.notebook } };
  }

  /** Alt+↑↓：兄弟の中で一つ上・下へ（ノートブックの行はノートブックの並び）。 */
  function shift(box, o, row, dir) {
    if (row.book) {
      const list = N().notebooks();
      const i = list.indexOf(row.nb), j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      const was = N().moveBook(row.nb, dir < 0 ? list[j] : list[j + 1] || null);
      if (was) moved(o, { nb: row.nb }, () => N().setBooks(was));
      return;
    }
    const n = N().get(row.id);
    if (!n) return;
    const { sibs, to } = groupOf(n);
    const nx = sibs[sibs.findIndex((k) => k.id === n.id) + dir];
    if (!nx) return;
    const was = N().place(n.id, { ...to, [dir < 0 ? "before" : "after"]: nx.id });
    if (was) moved(o, { id: n.id }, () => N().unplace(was));
  }

  /** Tab：一つ上の兄弟の中（終わり）へ。Shift+Tab：親の次へ（ノートブックの一番上・紙の根の直下からは上げない）。 */
  function indent(box, o, row, dir) {
    const n = N().get(row.id);
    if (!n) return;
    const { t, up, sibs } = groupOf(n);
    let was = null;
    if (dir > 0) {
      const p = sibs[sibs.findIndex((k) => k.id === n.id) - 1];
      if (!p || N().isTable(p)) return;
      was = N().place(n.id, { parent: p.id });
    } else {
      if (!up || up.id === o.scope) return;
      const g = t.parentOf(up.id);
      was = N().place(n.id, g && !t.isHead(g.id) ? { parent: g.id, after: up.id } : { parent: null, nb: up.notebook, after: up.id });
    }
    if (was) moved(o, { id: n.id }, () => N().unplace(was));
  }

  /** キーで動かしたあと：組み直した器の、同じ行へ戻る。 */
  function moved(o, at, undo) {
    const b = o.root ? o.root() : null;
    const sel = at.nb != null ? `.nt-row.js-book[data-nb="${CSS.escape(at.nb)}"]` : `.nt-row.js-tree-note[data-id="${CSS.escape(at.id)}"]`;
    const el = b && b.querySelector(sel);
    if (el) el.focus();
    landed(undo);
  }

  KN.noteDrag = { attach, isActive };
})();
