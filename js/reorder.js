/* =========================================================
   かいものノート — long-press to lift, drag to reorder

   Press and hold a row and it lifts off the list — a shadow under it, a
   fraction larger, following your finger. The rows it passes glide aside, and
   a faded copy of the row itself sits in the gap they open, showing exactly
   where it will land while you are still holding it. Let go and it settles
   onto its own ghost.

   Holding still is what starts it. Moving first means you meant to scroll the
   list or swipe the row away, and those keep working untouched: the lift is
   cancelled the moment the finger travels more than a few pixels before the
   timer is up.
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { haptic } = KN.util;

  const HOLD   = 400;   // press this long before the row lifts
  const CANCEL = 8;     // travel further than this first and it was a scroll
  const EDGE   = 64;    // how near the end of the list auto-scroll starts
  const SPEED  = 14;    // auto-scroll, px per frame at the very edge
  const DROP   = 190;   // how long the row takes to settle into its gap

  let drag = null;

  /** True while a row is lifted — other gesture handlers stand down on this. */
  const isActive = () => !!drag;

  /**
   * @param {Element} container  the list; only its direct children move
   * @param {object} opts
   * @param {string} opts.item   selector for the rows
   * @param {Function} opts.onDrop  (fromIndex, toIndex) — commit the new order
   * @param {Function} [opts.blocked]  return true to refuse to start
   */
  function attach(container, opts) {
    container.addEventListener("pointerdown", (e) => arm(e, container, opts));
  }

  /* ---------------- the press ---------------- */

  function arm(e, container, opts) {
    if (drag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (opts.blocked && opts.blocked()) return;

    const el = e.target.closest(opts.item);
    if (!el || el.parentElement !== container) return;

    const startX = e.clientX, startY = e.clientY, pointerId = e.pointerId;

    const moved = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (Math.abs(ev.clientX - startX) > CANCEL || Math.abs(ev.clientY - startY) > CANCEL) done();
    };
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("pointermove", moved);
      document.removeEventListener("pointerup", done);
      document.removeEventListener("pointercancel", done);
    };
    const timer = setTimeout(() => { done(); lift({ container, opts, el, pointerId, startY }); }, HOLD);

    document.addEventListener("pointermove", moved);
    document.addEventListener("pointerup", done);
    document.addEventListener("pointercancel", done);
  }

  /* ---------------- the lift ---------------- */

  function lift({ container, opts, el, pointerId, startY }) {
    const kids = Array.prototype.filter.call(container.children, (k) => k.matches(opts.item));
    const from = kids.indexOf(el);
    if (from < 0 || kids.length < 2) return;

    // Measured once, before anything moves. Everything after this is arithmetic
    // on these numbers, so a row half way through its own transition cannot
    // feed a wrong position back in.
    const rects = kids.map((k) => k.getBoundingClientRect());
    const gap = Math.max(0, rects[1].top - rects[0].bottom);
    const scroller = findScroller(container);

    /* A faded stand-in for the row, parked in whichever gap it would drop into.
       Without it the gap is just a hole in the list and you have to picture
       what goes there; with it, the answer is on screen the whole time.

       Positioned rather than laid out, and sized from the measurement above, so
       adding it to the container cannot disturb the rows it is standing among.
       Inert too — aria-hidden, untabbable — because it is a picture of a row
       that already exists a couple of hundred pixels further up. */
    const contRect = container.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add("reorder-ghost");
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.querySelectorAll("button, input, a, [tabindex]").forEach((c) => c.setAttribute("tabindex", "-1"));
    ghost.style.left = Math.round(rects[from].left - contRect.left) + "px";
    ghost.style.width = Math.round(rects[from].width) + "px";
    ghost.style.height = Math.round(rects[from].height) + "px";
    container.append(ghost);

    drag = {
      container, opts, el, kids, rects, from, to: from,
      // What the rows in between move by is the lifted row's own height —
      // it is the space that opens where it was and closes where it lands,
      // whatever the rows around it happen to measure.
      step: rects[from].height + gap,
      scroller, startScroll: scroller ? scroller.scrollTop : 0,
      startY, clientY: startY, pointerId, raf: 0,
      ghost, contTop: contRect.top,
    };

    container.classList.add("is-reordering");
    el.classList.add("reorder-lift");
    try { el.setPointerCapture(pointerId); } catch (err) { /* mouse in a test rig */ }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    // The list must not scroll under a row being carried across it.
    document.addEventListener("touchmove", swallowTouch, { passive: false });

    haptic(18);
    paint();
    drag.raf = requestAnimationFrame(tick);
  }

  const swallowTouch = (e) => { if (drag) e.preventDefault(); };

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.clientY = e.clientY;
  }

  /* Auto-scroll and painting share a frame loop rather than riding on pointer
     events: holding the finger still at the end of the list still has to keep
     scrolling, and no pointer events arrive while it is still. */
  function tick() {
    if (!drag) return;
    autoScroll();
    paint();
    drag.raf = requestAnimationFrame(tick);
  }

  function autoScroll() {
    const d = drag;
    if (!d.scroller) return;
    const r = d.scroller.getBoundingClientRect();
    let v = 0;
    if (d.clientY < r.top + EDGE) v = -SPEED * Math.min(1, (r.top + EDGE - d.clientY) / EDGE);
    else if (d.clientY > r.bottom - EDGE) v = SPEED * Math.min(1, (d.clientY - (r.bottom - EDGE)) / EDGE);
    if (v) d.scroller.scrollTop += v;
  }

  function paint() {
    const d = drag;
    // Scrolling moves the row's own layout position along with everything
    // else, so it has to be added back in for the row to stay under the finger.
    const delta = (d.clientY - d.startY) + (d.scroller ? d.scroller.scrollTop - d.startScroll : 0);
    d.el.style.transform = `translate3d(0, ${Math.round(delta)}px, 0)`;

    const mid = d.rects[d.from].top + d.rects[d.from].height / 2 + delta;
    let to = d.from;
    for (let i = d.from - 1; i >= 0; i--) {
      if (mid < d.rects[i].top + d.rects[i].height / 2) to = i; else break;
    }
    for (let i = d.from + 1; i < d.rects.length; i++) {
      if (mid > d.rects[i].top + d.rects[i].height / 2) to = i; else break;
    }
    if (to !== d.to) { d.to = to; haptic(8); }
    placeGhost();

    d.kids.forEach((k, i) => {
      if (i === d.from) return;
      let shift = 0;
      if (d.to > d.from && i > d.from && i <= d.to) shift = -d.step;
      else if (d.to < d.from && i >= d.to && i < d.from) shift = d.step;
      k.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : "";
    });
  }

  /** Put the stand-in where the row would land — the same slot the gap opens. */
  function placeGhost() {
    const d = drag;
    if (!d.ghost) return;
    d.ghost.style.top = Math.round(slotTop(d) - d.contTop) + "px";
  }

  /** Viewport-space top of the gap for the current target, measured against the
   *  positions everything had when the lift started. */
  function slotTop(d) {
    const a = d.rects[d.from];
    if (d.to > d.from) return d.rects[d.to].bottom - a.height;
    if (d.to < d.from) return d.rects[d.to].top;
    return a.top;
  }

  /* ---------------- the drop ---------------- */

  function onUp(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const d = drag;
    drag = null;

    cancelAnimationFrame(d.raf);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    document.removeEventListener("touchmove", swallowTouch);

    const a = d.rects[d.from];
    const landing = slotTop(d);
    const scrolled = d.scroller ? d.scroller.scrollTop - d.startScroll : 0;

    d.el.classList.remove("reorder-lift");
    d.el.classList.add("reorder-drop");
    d.el.style.transform = `translate3d(0, ${Math.round(landing - a.top + scrolled)}px, 0)`;
    haptic(12);

    // The press that lifted the row would otherwise land as a tap on release
    // and open whatever the row opens.
    const eatClick = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener("click", eatClick, true);
    setTimeout(() => document.removeEventListener("click", eatClick, true), 350);

    // The stand-in fades out from under the row settling onto it, so the two
    // are never both solid in the same place.
    if (d.ghost) d.ghost.classList.add("is-going");

    setTimeout(() => {
      d.container.classList.remove("is-reordering");
      if (d.ghost) d.ghost.remove();
      d.kids.forEach((k) => {
        k.style.transform = "";
        k.classList.remove("reorder-drop");
      });
      // Committing last means the re-render it triggers replaces rows that are
      // already sitting where they belong, so nothing jumps at the swap.
      if (d.to !== d.from) d.opts.onDrop(d.from, d.to);
    }, DROP);
  }

  function findScroller(el) {
    let n = el.parentElement;
    while (n && n !== document.body) {
      const o = getComputedStyle(n).overflowY;
      if (o === "auto" || o === "scroll") return n;
      n = n.parentElement;
    }
    return null;
  }

  /** Move one entry of a list and write the result back as `order` fields. */
  function applyOrder(records, from, to, pick) {
    const ids = records.map((r) => r.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    KN.store.update((s) => {
      ids.forEach((id, i) => {
        const rec = pick(s).find((r) => r.id === id);
        if (rec) rec.order = i;
      });
    });
  }

  KN.reorder = { attach, isActive, applyOrder };
})();
