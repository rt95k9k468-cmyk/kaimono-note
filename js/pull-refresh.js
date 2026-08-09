/* =========================================================
   かいものノート — pull to refresh

   There is no server behind this app, so a refresh cannot fetch anything.
   What it can do is real, if small: write out any save still in flight,
   re-read the file from disk so a copy open elsewhere is picked up, repaint
   the screen, and ask the service worker whether a newer build has been
   deployed. The gesture is mostly there because reaching the top of a list
   and pulling is what a phone user does; this makes that mean something
   instead of nothing.
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;

  const TRIGGER = 56;    // pull the chip this far down to arm the refresh
  const HOLD    = 52;    // where it parks while the refresh runs
  const MAX     = 96;    // it never stretches further than this
  const MIN_RUN = 550;   // keep the spinner up long enough to be read
  const SLOP    = 10;    // finger travel before we decide what this gesture is

  let host = null;       // #screens
  let ptr = null;        // the chip
  let arrow = null;      // the svg inside it

  let screenEl = null;   // the screen being pulled
  let startY = 0, startX = 0;
  let pull = 0;
  let armed = false;     // the touch started somewhere a pull could begin
  let engaged = false;   // it turned out to be a downward pull
  let busy = false;
  let frame = 0;

  function init() {
    host = document.getElementById("screens");
    if (!host) return;

    ptr = node(html`<div class="ptr"><span class="ptr-ring">${icon("refresh")}</span></div>`);
    arrow = ptr.querySelector("svg");
    // First child, so the screens paint over it. It only ever shows in the
    // gap a pull opens up above them.
    host.prepend(ptr);

    host.addEventListener("touchstart", onStart, { passive: true });
    host.addEventListener("touchmove", onMove, { passive: false });
    host.addEventListener("touchend", onEnd);
    host.addEventListener("touchcancel", onEnd);
  }

  /** Nothing should be pulled out from under a keyboard, a sheet or a swipe. */
  function blocked() {
    if (busy) return true;
    if (document.documentElement.classList.contains("kb-open")) return true;
    if (document.querySelector(".sheet")) return true;
    if (document.querySelector(".item-wrap.is-open")) return true;
    return false;
  }

  function onStart(e) {
    armed = engaged = false;
    if (e.touches.length !== 1 || blocked()) return;

    screenEl = host.querySelector(".screen.is-active");
    // Only from the very top: anywhere else, a downward drag is a scroll.
    if (!screenEl || screenEl.scrollTop > 0) return;

    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    armed = true;
    screenEl.classList.remove("is-settling");
  }

  function onMove(e) {
    if (!armed) return;
    const t = e.touches[0];
    const dy = t.clientY - startY;
    const dx = t.clientX - startX;

    if (!engaged) {
      // Give up on anything that is not a straight pull downwards — an upward
      // scroll, or the sideways drag that deletes a row.
      if (dy < -SLOP / 2 || Math.abs(dx) > SLOP) { armed = false; return; }
      if (dy < SLOP || Math.abs(dy) < Math.abs(dx) * 1.5) return;
      if (screenEl.scrollTop > 0) { armed = false; return; }
      engaged = true;
    }

    // Taking the gesture means the scroller must not also act on it.
    e.preventDefault();
    // Rubber band: the first pixels come easily, the last ones barely move.
    pull = MAX * (1 - Math.exp(-Math.max(0, dy) / MAX));
    paint();
  }

  function onEnd() {
    if (!engaged) { armed = false; return; }
    armed = engaged = false;
    if (pull >= TRIGGER) run();
    else settle(0);
  }

  function paint() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const ready = pull >= TRIGGER && !busy;
      ptr.classList.toggle("is-ready", ready);
      ptr.style.transform = `translate3d(0, ${pull.toFixed(1)}px, 0)`;
      ptr.style.opacity = String(Math.min(1, pull / 26));
      if (screenEl) screenEl.style.transform = `translate3d(0, ${pull.toFixed(1)}px, 0)`;
      // A full turn by the time it is armed, then the spinner takes over.
      if (!busy) arrow.style.transform = `rotate(${Math.round((pull / TRIGGER) * 300)}deg)`;
    });
  }

  /** Animate the chip and the screen to `to`, then stop transitioning. */
  function settle(to) {
    pull = to;
    ptr.classList.add("is-settling");
    if (screenEl) screenEl.classList.add("is-settling");
    paint();
    setTimeout(() => {
      ptr.classList.remove("is-settling");
      if (screenEl) screenEl.classList.remove("is-settling");
      if (to === 0 && screenEl) screenEl.style.transform = "";
    }, 340);
  }

  function run() {
    busy = true;
    haptic();
    ptr.classList.add("is-busy");
    ptr.classList.remove("is-ready");
    arrow.style.transform = "";
    settle(HOLD);

    const started = Date.now();
    Promise.all([refreshData(), checkForNewBuild()])
      .catch(() => {})
      .then(() => {
        const left = Math.max(0, MIN_RUN - (Date.now() - started));
        setTimeout(() => {
          busy = false;
          ptr.classList.remove("is-busy");
          settle(0);
        }, left);
      });
  }

  function refreshData() {
    return new Promise((resolve) => {
      try { KN.store.reload(); } catch (err) { console.warn("refresh failed", err); }
      resolve();
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
