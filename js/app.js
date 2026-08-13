/* =========================================================
   くらしノート — app shell: tabs, routing, theme, PWA
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;
  const store = KN.store;

  /* お店くらべ is not among these. It is a thing you do a few times while
     deciding where to go, not a place you live in — it opens from the shop
     button on 買うもの and 価格 instead. やること took the freed place, at the
     left, because it is the screen you open first when the question is 「今日
     なにをするんだっけ」 rather than 「何を買うんだっけ」.

     Three groups, not four buttons in a row. 買うもの and 価格 are two views of
     the same shopping — the same products, the same archive, the same tiles —
     while やること is a different kind of thing that happens to live in the
     same app, and 設定 is not a place at all. The bar says so with a hairline
     between the groups and by tinting the shopping pair, so the eye finds
     「買い物のほう」 without reading either word. */
  const TABS = [
    { id: "todo",     label: "やること", icon: "checklist", group: "todo" },
    { id: "list",     label: "買うもの", icon: "list",      group: "shop" },
    { id: "prices",   label: "価格",     icon: "tag",       group: "shop" },
    { id: "settings", label: "設定",     icon: "gear",      group: "app" },
  ];

  /* The app opens on やること. The question on picking the phone up is 「今日
     なにをするんだっけ」 far more often than 「何を買うんだっけ」 — the shopping
     list is what you open once you are already standing in a shop, and it is
     one tap away. */
  const HOME = "todo";

  let active = HOME;
  const mounted = new Set();

  /* ---------------- theme ---------------- */

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  }
  KN.applyTheme = applyTheme;

  /* ---------------- tabs ---------------- */

  /* Built as three groups rather than four buttons, because that is what the
     bar means: one thing on the left, one thing on the right, and two views of
     the same shopping in the middle. Each group gets a third of the bar and
     the pair inside the middle third sits shoulder to shoulder — the gap
     between 買うもの and 価格 is smaller than the gap to anything else, which
     is the whole statement, and it is made by spacing rather than by a tint
     behind them. */
  function buildTabs() {
    const bar = document.getElementById("tabbar");
    bar.innerHTML = "";

    const groups = [];
    TABS.forEach((t) => {
      const last = groups[groups.length - 1];
      if (last && last.id === t.group) last.tabs.push(t);
      else groups.push({ id: t.group, tabs: [t] });
    });

    groups.forEach((g, i) => {
      if (i) bar.append(node(html`<span class="tab-split"></span>`));
      const box = node(html`<div class="tab-group tab-group-${g.id}"></div>`);
      g.tabs.forEach((t) => {
        const btn = node(html`
          <button class="tab tab-${t.group}" role="tab" data-tab="${t.id}"
                  aria-selected="${String(t.id === active)}"
                  aria-controls="screen-${t.id}">
            <span class="tab-ico">${icon(t.icon)}</span>
            <span class="tab-label">${t.label}</span>
          </button>
        `);
        btn.addEventListener("click", () => show(t.id));
        box.append(btn);
      });
      bar.append(box);
    });
  }

  function paintTabs() {
    document.querySelectorAll(".tab").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.tab === active));
    });

    // The badge counts what is left to buy on this trip, and the star is what
    // puts something on the trip. Nothing starred means nothing planned, so no
    // badge — falling back to the whole list here would report a backlog the
    // user never said they were buying.
    paintAppBadge();

    paintTabBadge("list", tripCount());
    // やること counts what is wanted today or already late. Something due next
    // week is not a number you can act on today, and a tab that counts the
    // whole backlog is a tab you learn to ignore.
    paintTabBadge("todo", store.todosDue().length);
  }

  function paintTabBadge(tabId, count) {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (!tab) return;
    const existing = tab.querySelector(".tab-badge");
    if (count > 0) {
      const text = count > 99 ? "99+" : String(count);
      if (existing) existing.textContent = text;
      else tab.append(node(html`<span class="tab-badge">${text}</span>`));
    } else if (existing) {
      existing.remove();
    }
  }

  /* ---------------- the same number, on the home screen ---------------- */

  /* iOS has carried the Badging API for installed web apps since 16.4, so the
     counts on the tabs can be the count on the app icon — the one number
     worth seeing without opening anything.

     Two things make this a setting rather than something that just happens.
     It only works from the Home Screen, not in the browser; and iOS hangs the
     badge off the *notification* permission, so switching it on means asking
     for a permission whose dialog talks about notifications this app will
     never send. That is not a prompt to spring on anyone unasked. */
  /** Left to buy on the trip being shopped now. */
  const tripCount = () => store.get().items.filter((i) => i.fav && !i.checked).length;

  /* What the home-screen icon counts: this trip's shopping, plus the やること
     that are wanted today or are already late. Both are 「things I said I
     would do and have not」, which is the only kind of number worth putting on
     an app icon; a todo due next Friday is not one of them yet. */
  const pendingCount = () => tripCount() + store.todosDue().length;

  const badgeSupported = () => typeof navigator !== "undefined" && !!navigator.setAppBadge;

  let badgeShown = null;    // what we last asked the icon to show
  let badgeRefused = false; // the last ask was turned down

  /**
   * @param force  re-state the number even if it has not changed.
   *
   * The cache exists so an ordinary repaint does not fire a promise per
   * keystroke. But the icon is not ours to remember: iOS drops the badge on a
   * reboot, on a force quit, and when the notification permission is taken
   * away — and tells the page nothing. Left to the cache, the app would then
   * skip the one call that would put it back, forever. So a refused call
   * forgets the cache, and coming back to the app re-states the number
   * instead of assuming it stuck.
   */
  function paintAppBadge(force) {
    if (!badgeSupported()) return;
    const want = store.get().settings.appBadge === true ? pendingCount() : 0;
    if (!force && want === badgeShown) return;
    badgeShown = want;
    const refused = () => { badgeShown = null; badgeRefused = true; };
    try {
      const done = want > 0 ? navigator.setAppBadge(want) : navigator.clearAppBadge();
      Promise.resolve(done).then(() => { badgeRefused = false; }, refused);
    } catch (err) { refused(); }
  }

  /** The icon is showing nothing although the setting says it should. */
  function badgeBlocked() {
    if (store.get().settings.appBadge !== true) return false;
    if (window.Notification && Notification.permission === "denied") return true;
    return badgeRefused;
  }

  function watchAppBadge() {
    const restate = () => paintAppBadge(true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") restate();
    });
    window.addEventListener("pageshow", restate);
    window.addEventListener("focus", restate);
    /* And on the way out. The icon is read while the app is closed, so the
       last thing it is told before the app goes away had better be the number
       that was on screen. */
    window.addEventListener("pagehide", restate);
  }

  /** Ask for what the badge needs, and turn it on if it is given. */
  function enableAppBadge() {
    if (!badgeSupported()) return Promise.resolve(false);
    const ask = (window.Notification && Notification.requestPermission)
      ? Notification.requestPermission()
      : Promise.resolve("granted");
    return Promise.resolve(ask)
      .then((res) => {
        // Chrome badges an installed app without asking anything; iOS wants
        // the notification permission first and simply does nothing without.
        if (res === "denied") return false;
        store.update((s) => { s.settings.appBadge = true; });
        badgeShown = null;
        paintAppBadge();
        return true;
      })
      .catch(() => false);
  }

  function disableAppBadge() {
    store.update((s) => { s.settings.appBadge = false; });
    badgeShown = null;
    paintAppBadge();
  }

  KN.appBadge = {
    supported: badgeSupported,
    enabled: () => store.get().settings.appBadge === true,
    blocked: badgeBlocked,
    enable: enableAppBadge,
    disable: disableAppBadge,
  };

  /* Where the shop button came from, so 「戻る」 on お店くらべ goes back to the
     screen that opened it rather than always to リスト. */
  let cameFrom = "list";

  function show(id) {
    if (!KN.screens[id]) return;
    if (id === "compare" && active !== "compare") cameFrom = active;
    active = id;

    document.querySelectorAll(".screen").forEach((s) => {
      const on = s.dataset.screen === id;
      s.classList.toggle("is-active", on);
      s.hidden = !on;
    });

    ensureMounted(id);
    KN.screens[id].render();

    /* The ＋ lives in the dock — floating over the screen just above the tab
       bar, where a thumb already is — rather than in the top corner of each
       screen. Both the list and the price screen have something to add, and
       adding it is the same motion on both; the screens that have nothing to
       add leave the dock empty and it steps out of the way entirely.

       Rebuilt on every switch rather than kept per screen: one dock, one
       button, and no chance of the list's ＋ opening over the price screen. */
    const dock = document.getElementById("dock");
    if (dock) {
      dock.innerHTML = "";
      const make = KN.screens[id] && KN.screens[id].dockButton;
      const fab = make ? make() : null;
      if (fab) dock.append(fab);
      dock.hidden = !dock.childElementCount;
    }

    paintTabs();
    haptic();

    if (location.hash.slice(1) !== id) {
      history.replaceState(null, "", "#" + id);
    }
  }

  function ensureMounted(id) {
    if (mounted.has(id)) return;
    KN.screens[id].mount(document.getElementById("screen-" + id));
    mounted.add(id);
  }

  /* ---------------- boot ---------------- */

  function boot() {
    applyTheme(store.get().settings.theme || "auto");
    buildTabs();

    const fromHash = location.hash.slice(1);
    show(KN.screens[fromHash] ? fromHash : HOME);

    /* The hash is how the back button knows where it is, but it is also what
       iOS hands back when it restores a standalone app it had killed — and a
       restore is a fresh open, which should land on やること like any other.
       So the hash is wiped on the way out and only ever survives a reload
       inside one sitting. */
    window.addEventListener("pagehide", () => {
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    });

    // Re-render whichever screen is visible whenever state changes.
    store.subscribe(() => {
      if (KN.screens[active]) KN.screens[active].render();
      paintTabs();
    });

    window.addEventListener("hashchange", () => {
      const id = location.hash.slice(1);
      if (KN.screens[id] && id !== active) show(id);
    });

    // Keep two tabs of the same app in sync.
    window.addEventListener("storage", (e) => {
      if (e.key === store.KEY) location.reload();
    });

    /* The clock moving is a thing that changes the screen.

       Midnight is the obvious one: a due date is only 「今日」 until it is not,
       and a phone left open on the kitchen counter overnight would otherwise
       still be showing yesterday's groupings and yesterday's badge.

       19:30 is the other. A todo with a time on it is not counted until its
       time comes round, so the number on the icon has to change by itself when
       it does — nobody is going to be holding the phone at the moment that
       matters. Both are checked by looking at what the answer *is* rather than
       by arithmetic on when it should next change. */
    let dayNow = KN.util.todayKey();
    let dueNow = store.todosDue().length;
    KN.onMinute = () => {
      const key = KN.util.todayKey();
      const due = store.todosDue().length;
      if (key === dayNow && due === dueNow) return;
      dayNow = key;
      dueNow = due;
      if (KN.screens[active]) KN.screens[active].render();
      paintTabs();
      paintAppBadge(true);
    };
    setInterval(KN.onMinute, 30000);

    requestPersistentStorage();
    watchTopTap();
    trackKeyboard();
    watchAppBadge();
    KN.pullRefresh.init();
    KN.backup.init();
    KN.notify.init();
    registerServiceWorker();
  }

  /* ---------------- back to the top ----------------

     Tapping the status bar — the strip beside the notch — sends you to the top
     of a list. It is the oldest gesture on the phone and it is free, except
     that this app cannot hear it.

     What iOS actually does is scroll *the document* to the top, and this
     document does not scroll: the shell is exactly viewport height and every
     list scrolls inside its own screen (see base.css, which pins it on purpose
     — a scrollable document rubber-banded under every gesture and kept the
     scroll iOS applied to reveal a focused field). There is no event for the
     tap itself; nothing is delivered to a page under the status bar.

     So the document is given one pixel of travel and parked on it. That single
     pixel is the only thing iOS can take, and taking it is the signal. The
     pixel is hidden under the status bar, the keyboard handler still owns
     window.scrollY while a field is focused, and if the tap never arrives the
     app is exactly as it was.

     The header does the same thing on purpose, for every other device and as
     the one that certainly works: a tap on the title, away from the buttons,
     goes to the top. */

  /* The one pixel the document is given, and where it rests. */
  const TOP_TAP_PARK = 1;
  const topTapOn = () => document.documentElement.classList.contains("has-top-tap");

  const activeScreen = () => document.querySelector(".screen.is-active");

  /* Quick — a slide, not a journey. Native smooth scrolling paces itself by
     distance, so a screen 20 lists long took seconds; this is the same 260ms
     whether you are 300px down or 30,000. */
  function glideTo(el, to) {
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const want = Math.max(0, Math.min(max, to));
    const from = el.scrollTop;
    if (Math.abs(want - from) < 1) return;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 260);
      const e = 1 - Math.pow(1 - t, 3);
      el.scrollTop = from + (want - from) * e;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const glideToTop = (el) => glideTo(el, 0);
  KN.glideTo = glideTo;
  KN.glideToTop = glideToTop;

  function watchTopTap() {
    /* The header, everywhere. Buttons and fields keep their own taps. */
    document.addEventListener("click", (e) => {
      const bar = e.target.closest && e.target.closest(".topbar");
      if (!bar) return;
      if (e.target.closest("button, a, input, textarea, select, label")) return;
      glideToTop(activeScreen());
    });

    /* And the status bar — only on a touch screen, which is the only place
       there is one. On a desktop the pixel would just be a pixel of wheel
       travel that jumps the list to the top for no reason. */
    if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;

    const root = document.documentElement;
    root.classList.add("has-top-tap");
    const park = () => {
      // Never while a field is focused: window.scrollY belongs to the keyboard
      // then, and fit() moves it for reasons of its own.
      if (root.classList.contains("kb-open")) return;
      if (window.scrollY < TOP_TAP_PARK) window.scrollTo(0, TOP_TAP_PARK);
    };
    park();

    /* What must never reach here is a *collateral* pull to zero. `scrollIntoView`
       on a row asks every ancestor to bring it into view, the document included,
       and that would read as a tap and jump the screen to the top underneath
       whatever was being done to it. The app therefore scrolls its screens by
       setting scrollTop rather than by asking the browser to reveal an element
       (see jumpToDay), which leaves the document out of it entirely.

       Timing cannot tell the two apart: a tap during a flick's coast looks
       exactly like collateral, and refusing it would break the one moment the
       gesture is most wanted. So the rule is 「起こさない」 rather than
       「見分ける」. */
    let touching = false;
    const down = () => { touching = true; };
    const up = () => { touching = false; };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("touchstart", down, { capture: true, passive: true });
    document.addEventListener("touchend", up, { capture: true, passive: true });

    window.addEventListener("scroll", () => {
      if (root.classList.contains("kb-open")) return;
      if (window.scrollY !== 0) return;
      const quiet = !touching && !(KN.reorder && KN.reorder.isActive());
      const el = quiet ? activeScreen() : null;
      // The pixel goes back either way, so the next tap has something to take.
      window.scrollTo(0, TOP_TAP_PARK);
      if (el && el.scrollTop > 0) { glideToTop(el); haptic(); }
    }, { passive: true });

    window.addEventListener("resize", park);
    window.addEventListener("orientationchange", () => setTimeout(park, 250));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") setTimeout(park, 60);
    });
  }

  /* iOS does not resize the page when the keyboard appears. It shrinks the
     *visual* viewport — the window you are looking through — and slides that
     window down the page to bring the focused field into it. The page keeps
     its full height, so the app now starts above what you can see, which
     reads as the whole thing having slid off the top of the screen.

     Chasing that with arithmetic on the keyboard's height was the wrong idea
     twice over: the page never moved, so there was no page scroll to undo,
     and shortening the app did not stop the window from sliding. What works
     is following the window itself — size the shell to what is visible and
     move it to wherever that visible region currently is. Then the bottom of
     the app is the top of the keyboard by construction. */
  /** True while a text field holds focus — i.e. while the keyboard is showing. */
  function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag !== "INPUT") return false;
    return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"]
      .includes(el.type);
  }

  function trackKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;   // Falls back to the CSS 100dvh, as before.
    const root = document.documentElement;
    const app = document.getElementById("app");
    if (!app) return;

    const fit = () => {
      // Size first: the shell ends where the keyboard begins.
      app.style.height = Math.round(vv.height) + "px";

      /* Publish the same two numbers to CSS, for the things that are not the
         shell. A sheet is `position: fixed` and sized in dvh, and neither of
         those knows about a keyboard: the sheet stays as tall as the whole
         screen and its top half — where the price fields are — ends up above
         the top edge with no way to reach it.

         --vvh is what is actually visible. --kb is how much of the layout
         viewport the keyboard covers, which is zero on iOS in an installed
         app (it shrinks the layout viewport instead) and the keyboard's height
         on the browsers that do not. Anything anchored to the bottom of the
         window needs the second one; anything sized to the window needs the
         first. */
      root.style.setProperty("--vvh", Math.round(vv.height) + "px");
      root.style.setProperty("--kb", Math.max(0, Math.round(window.innerHeight - vv.height)) + "px");

      /* Then put the document back. iOS scrolls it to reveal the focused
         field while the shell is still full height; once it is not, that
         scroll is left over and the app rides above the screen.

         A transform would line it up just as well, and did — but iOS paints
         the text caret from the element's *untransformed* position, so the
         cursor floated hundreds of pixels above the field it belonged to
         while the field itself looked correct. Scrolling moves the real
         geometry, and the caret comes along. */
      /* Anything past the parked pixel is the keyboard's doing and has to go;
         the pixel itself is the status-bar tap's and stays. */
      const rest = topTapOn() ? TOP_TAP_PARK : 0;
      if (window.scrollY > rest) window.scrollTo(0, rest);
      app.style.transform = "";

      // Whether the keyboard is up cannot be read from the viewport at all.
      // A reading from an iPhone with the keyboard fully open:
      //
      //   innerH 465   可視 h 465   offsetTop 414   pageTop 414
      //
      // iOS shrinks the layout viewport along with the visual one, so the gap
      // between them is zero at the exact moment the keyboard covers half the
      // screen. Every arithmetic test on those two numbers reports "no
      // keyboard", the tab bar stays up, and it pushes the input bar 94px
      // clear of the keyboard — which is the shift that kept coming back.
      //
      // A focused text field, on a phone, *is* the keyboard being up.
      root.classList.toggle("kb-open", isTyping());
    };

    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);

    // The keyboard slides in over a few hundred milliseconds and the numbers
    // keep moving the whole time; the last event does not always coincide with
    // the last position. Re-read across the animation rather than trusting one
    // moment of it.
    const settle = () => [60, 180, 360, 600].forEach((ms) => setTimeout(fit, ms));
    window.addEventListener("focusin", settle);
    window.addEventListener("focusout", settle);
    window.addEventListener("orientationchange", settle);

    /* Coming back from the app switcher is the other moment these numbers go
       stale. iOS suspends the page as it leaves, and on the way back it
       restores the window without necessarily firing a resize or a scroll on
       the visual viewport — so the shell keeps whatever height it was pinned
       to when it went away (the keyboard's, if a field had focus), and any
       document scroll iOS left behind stays applied. Both read on screen as
       the whole app sitting too high.

       So: measure again on the way back, immediately and then across the next
       second, because the window keeps moving for a while after the app is
       handed back. */
    /* The one moment none of these events cover: a focused field that is
       *removed* rather than blurred. Recording a price rebuilds the form the
       price was typed into, and WebKit fires no blur for a node that simply
       stops existing — so 「入力中」 stayed true with nothing left to type
       into, and the tab bar that hides behind it stayed hidden even after the
       sheet was closed. Anything that takes a field away can say so here. */
    KN.remeasure = () => { fit(); settle(); };

    /* And a net under that: every tap re-reads it. If whatever had focus is
       gone, this is where it gets noticed — one cheap measurement, on a
       gesture the user was making anyway. */
    document.addEventListener("click", () => setTimeout(fit, 0), true);

    const resume = () => { fit(); settle(); setTimeout(fit, 1000); };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resume();
    });
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);

    fit();
    dismissKeyboardOnSwipeDown();
  }

  /* The add bar has no "done" of its own: on iOS the only way out of it was
     the keyboard's own ✓, which is a small target in a corner and not where
     the hand already is. A downward swipe anywhere on the app — the same
     motion that puts a sheet away — now ends it too.
     A drag that starts inside the field is included on purpose: flicking the
     bar itself downwards is the most obvious way to push it out of sight. */
  function dismissKeyboardOnSwipeDown() {
    const DROP = 34;   // far enough that a tap with a wobble is not a swipe
    const SIDE = 40;   // and straight enough not to be a swipe across a row
    let y0 = 0, x0 = 0, live = false;

    document.addEventListener("touchstart", (e) => {
      live = e.touches.length === 1 && document.documentElement.classList.contains("kb-open");
      if (!live) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      if (!live) return;
      const dy = e.touches[0].clientY - y0;
      if (Math.abs(e.touches[0].clientX - x0) > SIDE) { live = false; return; }
      if (dy < DROP) return;
      live = false;
      const el = document.activeElement;
      if (el && el.blur) el.blur();
    }, { passive: true });

    document.addEventListener("touchend", () => { live = false; }, { passive: true });
  }

  /* Shopping history lives only in localStorage, which browsers are free to
     evict under storage pressure or after a long idle stretch — months of
     price records would go with it. Asking for persistent storage exempts the
     app from that sweep; installed PWAs are usually granted it silently. */
  function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persisted()
      .then((already) => (already ? true : navigator.storage.persist()))
      .catch(() => { /* not fatal — the app works either way */ });
  }

  function registerServiceWorker() {
    // The single-file build has no sw.js alongside it to register.
    if (window.KN_STANDALONE) return;
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;

    // A new worker calls skipWaiting() and takes over while this page is still
    // running the previous build's scripts. Reload once so the new code is
    // actually the code in use — otherwise the app sits a version behind until
    // it happens to be launched again, which on a home-screen app resumed from
    // the switcher may not be for days.
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      if (isBusy()) {
        // Don't pull the page out from under someone mid-entry; wait until
        // they put the app away.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") location.reload();
        }, { once: true });
        return;
      }
      location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // An installed app can stay open for days, so look for a new build
        // every time it comes back to the foreground rather than only at boot.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      }).catch((err) => {
        console.warn("service worker registration failed", err);
      });
    });
  }

  /* Screens off the tab bar — お店くらべ — are opened by name from the screens
     that link to them, and hand the way back with them. */
  KN.showScreen = show;
  KN.backScreen = () => show(cameFrom === "compare" ? "list" : cameFrom);

  /** True while the user is part-way through something a reload would lose. */
  function isBusy() {
    if (document.querySelector(".sheet")) return true;
    const el = document.activeElement;
    return !!(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.value);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
