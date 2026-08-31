/* =========================================================
   くらしノート — the edges of a scroll: pull to refresh, and the give
   at the bottom

   There is no server behind this app, so a refresh cannot fetch anything.
   What it can do is real, if small: write out any save still in flight,
   re-read the file from disk so a copy open elsewhere is picked up, repaint
   the screen, and ask the service worker whether a newer build has been
   deployed. The gesture is mostly there because reaching the top of a list
   and pulling is what a phone user does; this makes that mean something
   instead of nothing.

   The screens turn the browser's own overscroll off (see overscroll-behavior
   in base.css) because its bounce fought this gesture at the top. That left
   the bottom of a list stopping dead against nothing, so the same engine
   gives the bottom edge a band too — no chip, no action, just the give that
   tells a finger it has reached the end.

   Both edges are painted by one loop that eases what is on screen towards
   where the finger is, rather than writing the finger's position straight
   out. Touch points do not arrive evenly, and copying them frame for frame
   put every gap in the stream on the screen. Chasing them smooths the whole
   thing out — a few frames behind the finger, which nobody sees, and no
   steps, which everybody does.
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, raw, haptic } = KN.util;

  /* The mark, drawn rather than borrowed from the icon set, because it has to
     do two different things.

     While you pull it is a redo mark: a ring with a gap, an arrowhead at the
     leading end that never quite closes the circle, and the whole thing turns
     as you go — one full revolution by the time it is armed. The ring is not
     just revealed, it is drawn: the stroke runs on from the gap and the head
     fades in as the last of it lands.

     Once you let go the arrowhead goes and a second arc takes over, chasing
     itself around the ring. Same circle, same weight, so it reads as the mark
     carrying on rather than a different thing appearing.

     Geometry, so the numbers are not mysterious: r=9 about (12,12). The arc
     runs clockwise from -60° to 240°, i.e. 300° of the circle, leaving the
     gap across the top. Its length is 2·π·9·(300/360) = 47.12, which is the
     dash pattern the drawing-on relies on. The head is a triangle centred on
     the arc's end and turned to its tangent there. */
  const MARK = raw(`
    <svg class="ptr-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
      <path class="ptr-arc" d="M16.5 4.21A9 9 0 1 1 7.5 4.21"/>
      <path class="ptr-head" d="M10.1 2.71 7.3 6.86 5.1 3.05Z" fill="currentColor" stroke="none"/>
      <circle class="ptr-spin" cx="12" cy="12" r="9"/>
    </svg>
  `);

  const ARC_LEN = 47.12;

  const TRIGGER = 56;    // pull the chip this far down to arm the refresh
  const HOLD    = 52;    // where it parks while the refresh runs
  const MAX     = 96;    // it never stretches further than this
  const FOOT    = 76;    // and the band at the bottom never further than this
  const MIN_RUN = 550;   // keep the spinner up long enough to be read
  const SLOP    = 10;    // finger travel before we decide what this gesture is

  /* How hard the painted position is pulled towards the finger each frame,
     and towards home once the finger is gone. Low numbers on purpose: a
     little lag is invisible, whereas an uneven touch stream copied straight
     to the screen is not. */
  const FOLLOW  = 0.22;
  const SETTLE  = 0.13;

  let host = null;       // #screens
  let ptr = null;        // the chip
  let mark = null;       // the svg inside it
  let arc = null;        // the redo ring, drawn on as you pull
  let head = null;       // its arrowhead

  let screenEl = null;   // the screen being pulled
  let startY = 0, startX = 0;
  let target = 0;        // where the finger says the screen should be
  let shown = 0;         // where it actually is, chasing target
  let edge = null;       // "top" | "bottom" — which end this gesture belongs to
  let couldTop = false, couldBottom = false;
  let armed = false;     // the touch started somewhere an edge could give
  let engaged = false;   // it turned out to be a pull rather than a scroll
  let busy = false;
  let loop = 0;
  let bare = false;      // a band with no chip on it — the fling below
  let out = false;       // the fling is still on its way out, not yet coming back

  /* A flick that runs out of list stops against the boundary as if it had hit
     a wall, because the browser's own overscroll is off. Catching how fast it
     was going as it arrives lets the same band carry it a little past the end
     and bring it back — the give a finger gets, given to a throw as well. */
  const FLING_MIN  = 0.35;   // px/ms; below this it is a drift, not a throw
  const FLING_GAIN = 9;      // how much of the speed becomes travel
  const FLING_MAX  = 46;     // and how far that is ever allowed to reach
  const FLING_OUT  = 0.34;   // it goes out briskly and comes back gently
  let lastEl = null, lastTop = 0, lastAt = 0;

  function init() {
    host = document.getElementById("screens");
    if (!host) return;

    ptr = node(html`<div class="ptr"><span class="ptr-ring">${MARK}</span></div>`);
    mark = ptr.querySelector(".ptr-mark");
    arc = ptr.querySelector(".ptr-arc");
    head = ptr.querySelector(".ptr-head");
    // First child, so the screens paint over it. It only ever shows in the
    // gap a pull opens up above them.
    host.prepend(ptr);

    host.addEventListener("touchstart", onStart, { passive: true });
    host.addEventListener("touchmove", onMove, { passive: false });
    host.addEventListener("touchend", onEnd);
    host.addEventListener("touchcancel", onEnd);
    // scroll does not bubble; the capture phase is how one listener covers
    // every screen, including ones mounted later.
    host.addEventListener("scroll", onScroll, true);

    /* Switching apps mid-gesture can take the touch away without a touchend
       ever arriving, and the page is suspended before the band can spring
       back. On the way in it would then still be held open — a screen sitting
       an inch off the top with no way to put it back. Whatever was in flight
       when the app left is over; drop it and start square. */
    document.addEventListener("visibilitychange", clear);
    window.addEventListener("pageshow", clear);
  }

  /** Abandon any band, gesture or animation, and put the screen back. */
  function clear() {
    armed = engaged = out = bare = false;
    edge = null;
    if (loop) { cancelAnimationFrame(loop); loop = 0; }
    target = shown = 0;
    lastEl = null;
    if (ptr) {
      ptr.style.opacity = "0";
      ptr.style.transform = "";
    }
    // The refresh keeps running if it was mid-flight; only the motion stops.
    host.querySelectorAll(".screen").forEach((el) => {
      el.style.transform = "";
      el.style.willChange = "";
    });
    if (ptr) ptr.style.willChange = "";
  }

  /** Nothing should be pulled out from under a keyboard, a sheet or a swipe. */
  function blocked() {
    if (busy) return true;
    if (KN.reorder.isActive()) return true;
    if (document.documentElement.classList.contains("kb-open")) return true;
    if (document.querySelector(".sheet")) return true;
    if (document.querySelector(".item-wrap.is-open")) return true;
    return false;
  }

  const atTop = (el) => el.scrollTop <= 0;
  const atBottom = (el) => el.scrollHeight - el.clientHeight - el.scrollTop <= 1;

  function onStart(e) {
    armed = engaged = false;
    edge = null;
    if (e.touches.length !== 1 || blocked()) return;

    screenEl = host.querySelector(".screen.is-active");
    if (!screenEl) return;
    /* 画面のほうが、その端の give を自分で使うことがあります（やることの
       時間割は、紙を下へ引くと暦が月ぜんぶまで出てきます）。同じ指を二つが
       取ると、暦が伸びながら画面ごと下がることになるので、印のあるところ
       から始まった手つきは、こちらでは拾いません。 */
    if (e.target && e.target.closest && e.target.closest("[data-pull-own]")) return;
    // Which ends have any give in them. Anywhere in the middle of a list, a
    // drag either way is just a scroll.
    couldTop = atTop(screenEl);
    couldBottom = atBottom(screenEl);
    if (!couldTop && !couldBottom) return;

    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    armed = true;
  }

  function onMove(e) {
    if (!armed) return;
    // A row lifted out of the list mid-press: that gesture is now a reorder.
    if (KN.reorder.isActive()) { armed = false; return; }
    const t = e.touches[0];
    const dy = t.clientY - startY;
    const dx = t.clientX - startX;

    if (!engaged) {
      // Give up on the sideways drag that deletes a row or stars it.
      if (Math.abs(dx) > SLOP) { armed = false; return; }
      if (Math.abs(dy) < SLOP || Math.abs(dy) < Math.abs(dx) * 1.5) return;
      // Down at the top, up at the bottom — anything else is a scroll, and
      // the scroller has to have it.
      if (dy > 0 && couldTop && atTop(screenEl)) edge = "top";
      else if (dy < 0 && couldBottom && atBottom(screenEl)) edge = "bottom";
      else { armed = false; return; }
      engaged = true;
      // A finger arriving over a flick's band takes it over from here.
      out = false;
      bare = false;
      begin();
    }

    // Taking the gesture means the scroller must not also act on it.
    e.preventDefault();
    // Rubber band: the first pixels come easily, the last ones barely move.
    target = edge === "top"
      ? MAX * (1 - Math.exp(-Math.max(0, dy) / MAX))
      : -FOOT * (1 - Math.exp(-Math.max(0, -dy) / FOOT));
  }

  function onEnd() {
    if (!engaged) { armed = false; return; }
    armed = engaged = false;
    if (edge === "top" && shown >= TRIGGER) run();
    else { target = 0; spin(); }
  }

  /* ---------------- carrying a flick past the end ---------------- */

  function onScroll(e) {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains("screen")) return;

    const now = performance.now();
    // Only consecutive samples of the same screen say anything about speed;
    // a long gap or a change of tab is a fresh start, not a fast one.
    const ok = el === lastEl && now - lastAt > 0 && now - lastAt < 120;
    const v = ok ? (el.scrollTop - lastTop) / (now - lastAt) : 0;
    lastEl = el; lastTop = el.scrollTop; lastAt = now;

    // A finger, a refresh, or a band already running owns the screen.
    if (engaged || armed || busy || loop) return;
    if (Math.abs(v) < FLING_MIN) return;
    if (v > 0 ? atBottom(el) : atTop(el)) fling(el, v);
  }

  function fling(el, v) {
    const dist = Math.min(FLING_MAX, Math.abs(v) * FLING_GAIN);
    if (dist < 4) return;
    screenEl = el;
    bare = true;              // no chip: a throw must never arm the refresh
    out = true;
    shown = 0;
    target = v > 0 ? -dist : dist;
    begin();
  }

  /* ---------------- the motion ---------------- */

  function begin() {
    ptr.style.willChange = "transform, opacity";
    if (screenEl) screenEl.style.willChange = "transform";
    spin();
  }

  function spin() {
    if (!loop) loop = requestAnimationFrame(tick);
  }

  function tick() {
    loop = 0;
    const k = engaged ? FOLLOW : (out ? FLING_OUT : SETTLE);
    shown += (target - shown) * k;

    // The flick's band turns round once it has nearly reached its furthest
    // point, rather than creeping the last pixel — out briskly, back gently.
    if (out && Math.abs(target - shown) < Math.abs(target) * 0.12) {
      out = false;
      target = 0;
    }
    // Close enough is home: without this the last hundredth of a pixel keeps
    // a frame running forever.
    if (!engaged && !out && Math.abs(target - shown) < 0.25) shown = target;

    paint();
    if (engaged || out || shown !== target) spin();
    else rest();
  }

  function rest() {
    ptr.style.willChange = "";
    bare = false;
    if (screenEl) {
      screenEl.style.willChange = "";
      if (shown === 0) screenEl.style.transform = "";
    }
  }

  function paint() {
    if (screenEl) screenEl.style.transform = `translate3d(0, ${shown.toFixed(2)}px, 0)`;

    // The chip belongs to a finger at the top edge only. The bottom band and
    // the band a flick leaves behind are bare give, with nothing to arm.
    if (shown <= 0 || bare) {
      ptr.style.opacity = "0";
      return;
    }
    ptr.style.transform = `translate3d(0, ${shown.toFixed(2)}px, 0)`;
    ptr.style.opacity = String(Math.min(1, shown / 26));
    if (busy) return;   // from here on the spinner has the mark

    // The ring draws itself on, the head lands at the end of it, and the
    // whole mark turns once by the time the pull is armed.
    const p = shown / TRIGGER;
    ptr.classList.toggle("is-ready", shown >= TRIGGER);
    arc.style.strokeDashoffset = (ARC_LEN * (1 - Math.min(1, p))).toFixed(2);
    head.style.opacity = String(Math.max(0, Math.min(1, (p - 0.72) / 0.28)));
    mark.style.transform = `rotate(${(Math.min(p, 1.2) * 300).toFixed(1)}deg)`;
  }

  function run() {
    busy = true;
    haptic();
    ptr.classList.add("is-busy");
    ptr.classList.remove("is-ready");
    // Hand the mark over to the spinner. Both of these were set inline on the
    // way down, and inline beats the `is-busy` rules that would hide them.
    mark.style.transform = "";
    head.style.opacity = "0";
    target = HOLD;
    spin();

    const started = Date.now();
    Promise.all([refreshData(), checkForNewBuild()])
      .catch(() => {})
      .then(() => {
        const left = Math.max(0, MIN_RUN - (Date.now() - started));
        setTimeout(() => {
          busy = false;
          ptr.classList.remove("is-busy");
          target = 0;
          spin();
        }, left);
      });
  }

  /* 下に引くのは「いま持っているものを見せ直せ」ではなく、
     **「取りに行け」** の意味です。控えを読み直すだけだと、ダイエットの
     画面では何も変わりません——歩数や睡眠は中継所の向こうにあって、
     読み直しても取りには行かないので。

     だから、開いている画面に refresh() があれば、それも待ちます。
     無い画面はこれまでどおり読み直すだけです。 */
  function refreshData() {
    let outside = null;
    try {
      const screen = KN.screens && KN.screens[KN.app.activeScreen && KN.app.activeScreen()];
      if (screen && screen.refresh) outside = screen.refresh();
    } catch (err) { console.warn("refresh failed", err); }

    return Promise.resolve(outside)
      .catch(() => {})
      .then(() => {
        try { KN.store.reload(); } catch (err) { console.warn("refresh failed", err); }
      });
  }

  /* The installed app can sit on the home screen for weeks. Asking the worker
     to look for a new build is the one thing here that reaches the network —
     and if it finds one, app.js reloads into it on its own. */
  function checkForNewBuild() {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.getRegistration) {
      return Promise.resolve();
    }
    return navigator.serviceWorker.getRegistration()
      .then((reg) => (reg ? reg.update() : null))
      .catch(() => null);
  }

  KN.pullRefresh = { init };
})();
