/* =========================================================
   くらしノート — the edges of a scroll: the give at the top and bottom

   There is no server behind this app and no gesture that fetches anything
   anymore — pulling down used to arm a manual refresh for the diet screen's
   healthkit relay, but that was retired (the tab already pulls on its own
   when opened, and the settings sheet has its own button for it). What is
   left is just the feel of reaching either end of a list: a little give
   under the finger, and the same give when a fast flick carries past the
   end, so a scroll never just stops dead against nothing.

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

  const FOOT   = 76;    // the band at the bottom never stretches further than this
  const SLOP   = 10;    // finger travel before we decide what this gesture is

  /* How hard the painted position is pulled towards the finger each frame,
     and towards home once the finger is gone. Low numbers on purpose: a
     little lag is invisible, whereas an uneven touch stream copied straight
     to the screen is not. */
  const FOLLOW  = 0.22;
  const SETTLE  = 0.13;

  let host = null;       // #screens

  let screenEl = null;   // the screen being pulled
  let startY = 0, startX = 0;
  let target = 0;        // where the finger says the screen should be
  let shown = 0;         // where it actually is, chasing target
  let edge = null;       // "bottom" — which end this gesture belongs to
  let couldBottom = false;
  let armed = false;     // the touch started somewhere the bottom could give
  let engaged = false;   // it turned out to be a pull rather than a scroll
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

  /** Abandon any band or gesture, and put the screen back. */
  function clear() {
    armed = engaged = out = bare = false;
    edge = null;
    if (loop) { cancelAnimationFrame(loop); loop = 0; }
    target = shown = 0;
    lastEl = null;
    host.querySelectorAll(".screen").forEach((el) => {
      el.style.transform = "";
      el.style.willChange = "";
    });
  }

  /** Nothing should be pulled out from under a keyboard, a sheet or a swipe. */
  function blocked() {
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

    /* **測るのは「実際に送っている器」です。**

       やること・daily・買うものでは、送るのは画面ではなく紙（`.tl-sheet`）に
       なりました。画面のほうを測ると `scrollHeight === clientHeight` なので
       **上端にも下端にも同時に居ることになり**、縦の指をこちらが毎回
       「下端の give」として取って `preventDefault` します——**紙が一切
       送れなくなっていました**（実測：touchmove 7回すべてが既定阻止、送り 0）。 */
    const active = host.querySelector(".screen.is-active");
    screenEl = (KN.app && KN.app.scrollerOf) ? KN.app.scrollerOf(active) : active;
    if (!screenEl) return;
    /* 画面のほうが、その端の give を自分で使うことがあります（紙の掴み手は
       下へ引くと暦が出ます）。同じ指を二つが取ると、暦が伸びながら画面ごと
       下がることになるので、印のあるところから始まった手つきは拾いません。
       **印が付いているのは掴み手だけ**です。 */
    if (e.target && e.target.closest && e.target.closest("[data-pull-own]")) return;
    // 下端に give が無ければ、そもそも構いません。
    couldBottom = atBottom(screenEl);
    if (!couldBottom) return;

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
      // Up at the bottom is a give. Anything else is a scroll, and the
      // scroller has to have it（下へ引いて更新は廃止したので、上端は
      // 常にスクロールのまま）。
      if (dy < 0 && couldBottom && atBottom(screenEl)) edge = "bottom";
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
    target = -FOOT * (1 - Math.exp(-Math.max(0, -dy) / FOOT));
  }

  function onEnd() {
    if (!engaged) { armed = false; return; }
    armed = engaged = false;
    target = 0;
    spin();
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

    // A finger or a band already running owns the screen.
    if (engaged || armed || loop) return;
    if (Math.abs(v) < FLING_MIN) return;
    if (v > 0 ? atBottom(el) : atTop(el)) fling(el, v);
  }

  function fling(el, v) {
    const dist = Math.min(FLING_MAX, Math.abs(v) * FLING_GAIN);
    if (dist < 4) return;
    screenEl = el;
    bare = true;              // 帯だけ。跳ね返りが更新に化けないように。
    out = true;
    shown = 0;
    target = v > 0 ? -dist : dist;
    begin();
  }

  /* ---------------- the motion ---------------- */

  function begin() {
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
    bare = false;
    if (screenEl) {
      screenEl.style.willChange = "";
      if (shown === 0) screenEl.style.transform = "";
    }
  }

  function paint() {
    if (screenEl) screenEl.style.transform = `translate3d(0, ${shown.toFixed(2)}px, 0)`;
  }

  KN.pullRefresh = { init };
})();
