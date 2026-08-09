/* =========================================================
   かいものノート — app shell: tabs, routing, theme, PWA
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;
  const store = KN.store;

  const TABS = [
    { id: "list",     label: "リスト",   icon: "list"  },
    { id: "prices",   label: "価格",     icon: "tag"   },
    { id: "compare",  label: "お店",     icon: "shop"  },
    { id: "settings", label: "設定",     icon: "gear"  },
  ];

  let active = "list";
  const mounted = new Set();

  /* ---------------- theme ---------------- */

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  }
  KN.applyTheme = applyTheme;

  /* ---------------- tabs ---------------- */

  function buildTabs() {
    const bar = document.getElementById("tabbar");
    bar.innerHTML = "";

    TABS.forEach((t) => {
      const btn = node(html`
        <button class="tab" role="tab" data-tab="${t.id}"
                aria-selected="${String(t.id === active)}"
                aria-controls="screen-${t.id}">
          <span class="tab-ico">${icon(t.icon)}</span>
          <span>${t.label}</span>
        </button>
      `);
      btn.addEventListener("click", () => show(t.id));
      bar.append(btn);
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
    const listTab = document.querySelector('.tab[data-tab="list"]');
    if (!listTab) return;
    const pending = store.get().items.filter((i) => i.fav && !i.checked).length;
    const existing = listTab.querySelector(".tab-badge");
    if (pending > 0) {
      const text = pending > 99 ? "99+" : String(pending);
      if (existing) existing.textContent = text;
      else listTab.append(node(html`<span class="tab-badge">${text}</span>`));
    } else if (existing) {
      existing.remove();
    }
  }

  function show(id) {
    if (!KN.screens[id]) return;
    active = id;

    document.querySelectorAll(".screen").forEach((s) => {
      const on = s.dataset.screen === id;
      s.classList.toggle("is-active", on);
      s.hidden = !on;
    });

    ensureMounted(id);
    KN.screens[id].render();

    // The add bar belongs to the list; on the other screens there is nothing
    // to add to, so the dock steps out of the way entirely.
    const dock = document.getElementById("dock");
    if (dock) dock.hidden = id !== "list" || !dock.childElementCount;

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
    show(KN.screens[fromHash] ? fromHash : "list");

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

    requestPersistentStorage();
    trackKeyboard();
    KN.pullRefresh.init();
    KN.backup.init();
    registerServiceWorker();
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
      if (window.scrollY) window.scrollTo(0, 0);
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
