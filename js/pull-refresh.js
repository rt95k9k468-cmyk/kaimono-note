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

  const GIVE   = 76;    // a band never stretches further than this, at either end
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
  let edge = null;       // "top" | "bottom" — which end this gesture belongs to
  let couldTop = false, couldBottom = false;
  let armed = false;     // the touch started somewhere an end could give
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
    armed = engaged = false;
    edge = null;
    drop();
    lastEl = null;
    host.querySelectorAll(".screen").forEach((el) => {
      el.style.transform = "";
      el.style.willChange = "";
    });
  }

  /* 帯を、いま付けている器からその場で外します。**帯が付くのは送る器**
     （紙の画面なら `.tl-sheet`、設定なら `.set-scroll`）なので、上の
     `.screen` を戻すだけでは、戻る途中で隠れた紙の帯はずれたまま残る
     作りでした。 */
  function drop() {
    if (loop) { cancelAnimationFrame(loop); loop = 0; }
    target = shown = 0;
    out = bare = false;
    if (screenEl) {
      screenEl.style.transform = "";
      screenEl.style.willChange = "";
    }
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
    const next = (KN.app && KN.app.scrollerOf) ? KN.app.scrollerOf(active) : active;
    // 別の器の帯がまだ戻る途中なら、置き去りにせず外してから持ち替えます。
    if (loop && screenEl && screenEl !== next) drop();
    screenEl = next;
    if (!screenEl) return;
    /* **器の外から始まった指には返しません。** 帯が付くのは器なので、上の
       バーや暦をなぞった指で紙が伸びると、指の下にないものが動いて見えます。
       紙が上端に居るのはふだんの姿なので、上端に give を戻したいまは、
       暦を下へなぞるたびに紙が伸びることになります。 */
    if (!screenEl.contains(e.target)) return;
    /* 画面のほうが、その端の give を自分で使うことがあります（紙の掴み手は
       下へ引くと暦が出ます）。同じ指を二つが取ると、暦が伸びながら画面ごと
       下がることになるので、印のあるところから始まった手つきは拾いません。
       **印が付いているのは掴み手だけ**です。 */
    if (e.target && e.target.closest && e.target.closest("[data-pull-own]")) return;
    // どちらの端にも着いていなければ、そもそも構いません。
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
      /* 端から外へ向かう指だけが give です——下端で上へ、上端で下へ。
         中身のほうへ向かう指は送りなので、器に返します。

         **上端の give は、「引いて更新」を外したときに一緒に消えていました。**
         あちらは上端の give に更新の札を載せたものだったので、札ごと外すと
         上端には何も残らず、指で引くと**壁に当たったように止まっていました**
         （下端だけ伸びた。やること・daily・買うもの・ダイエット・設定の
         五つともで、実測：下端 -58px、上端 0px）。いまの上端は、下端と同じ
         帯だけです。何も取りに行きません。 */
      if (dy < 0 && couldBottom && atBottom(screenEl)) edge = "bottom";
      else if (dy > 0 && couldTop && atTop(screenEl)) edge = "top";
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
    const pull = Math.max(0, edge === "top" ? dy : -dy);
    const give = GIVE * (1 - Math.exp(-pull / GIVE));
    target = edge === "top" ? give : -give;
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
    if (!el || !el.classList) return;

    const now = performance.now();
    // Only consecutive samples of the same screen say anything about speed;
    // a long gap or a change of tab is a fresh start, not a fast one.
    const ok = el === lastEl && now - lastAt > 0 && now - lastAt < 120;
    const v = ok ? (el.scrollTop - lastTop) / (now - lastAt) : 0;
    lastEl = el; lastTop = el.scrollTop; lastAt = now;

    // A finger or a band already running owns the screen.
    if (engaged || armed || loop) return;
    if (Math.abs(v) < FLING_MIN) return;
    if ((v > 0 ? atBottom(el) : atTop(el)) && bounceless(el)) fling(el, v);
  }

  /* **帯を出すのは、ブラウザが自分では跳ね返さない器だけです。**

     前は `.screen` だけを見ていました。画面そのものが送っていたころの名残で、
     紙が器になったいま、**画面が自分で送る画面は一つも無く**（ダイエットも
     紙が送る）、この帯は一度も出ていませんでした（実測：五画面とも両端 0px）。
     設定（`.set-scroll`）は `overscroll-behavior-y: none` で本来の跳ね返りも
     切ってあるので、勢いよく払うと**両端とも**壁に当たって止まっていました。

     紙（`.tl-sheet`）は本来の跳ね返りを残してある（sheet-scroll の docs）ので、
     ここで帯まで出すと二重に跳ねます。だから器の名前ではなく
     `overscroll-behavior-y` を見ます。測るのは端に着いた一瞬だけです。 */
  function bounceless(el) {
    const active = host.querySelector(".screen.is-active");
    const sc = (KN.app && KN.app.scrollerOf) ? KN.app.scrollerOf(active) : active;
    return el === sc && getComputedStyle(el).overscrollBehaviorY === "none";
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
