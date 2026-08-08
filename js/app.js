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

    // Badge the list tab with how many items are still unchecked.
    const listTab = document.querySelector('.tab[data-tab="list"]');
    if (!listTab) return;
    const pending = store.get().items.filter((i) => !i.checked).length;
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
    KN.backup.init();
    registerServiceWorker();
  }

  /* The soft keyboard shrinks the visual viewport but leaves the layout
     viewport alone, so the bottom-docked add bar would end up behind it.
     Publishing the covered height as --kb lets the bar ride above the
     keyboard, and the tab bar steps aside while typing — nobody switches
     tabs mid-word, and hiding it means the bar's offset is simply --kb. */
  function trackKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;   // Without it the bar stays at the bottom, as before.
    const root = document.documentElement;

    const apply = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Browser chrome sliding in and out moves this by a few dozen pixels;
      // only a keyboard takes this much of the screen.
      const kb = covered > 120 ? Math.round(covered) : 0;
      root.style.setProperty("--kb", kb + "px");
      root.classList.toggle("kb-open", kb > 0);
    };

    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    apply();
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
