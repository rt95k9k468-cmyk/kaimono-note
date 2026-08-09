/* =========================================================
   かいものノート — UI primitives (sheet, toast, dialogs)
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;

  const sheetRoot = () => document.getElementById("sheet-root");
  const toastRoot = () => document.getElementById("toast-root");

  const openSheets = [];

  /* ---------------- bottom sheet ---------------- */

  /**
   * Open a modal sheet.
   * @param {object} opts
   * @param {string} opts.title
   * @param {Node|DocumentFragment} opts.content
   * @param {Node} [opts.footer]
   * @param {Function} [opts.onClose]
   * @returns {{close: Function, el: HTMLElement}}
   */
  function sheet({ title, titleMark, content, footer, onClose }) {
    const backdrop = node(html`<div class="sheet-backdrop"></div>`);
    const el = node(html`
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${title || ""}">
        <div class="sheet-handle"></div>
        <header class="sheet-head">
          <h2 class="sheet-title">${titleMark ? html`<span class="sheet-mark">${titleMark}</span>` : ""}${title || ""}</h2>
          <button class="icon-btn js-close" aria-label="閉じる">${icon("close")}</button>
        </header>
        <div class="sheet-body"></div>
      </div>
    `);

    el.querySelector(".sheet-body").append(content);
    if (footer) {
      const foot = node(html`<div class="sheet-foot"></div>`);
      foot.append(footer);
      el.append(foot);
    }

    sheetRoot().append(backdrop, el);
    document.body.style.overflow = "hidden";

    // Next frame so the transition runs.
    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
      el.classList.add("is-open");
    });

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      backdrop.classList.remove("is-open");
      el.classList.remove("is-open");
      const idx = openSheets.indexOf(handle);
      if (idx >= 0) openSheets.splice(idx, 1);
      if (!openSheets.length) document.body.style.overflow = "";
      setTimeout(() => { backdrop.remove(); el.remove(); }, 300);
      onClose && onClose();
    }

    backdrop.addEventListener("click", close);
    el.querySelector(".js-close").addEventListener("click", close);

    /* Capping the sheet at the visible height (see --vvh) keeps it on screen,
       but the field you tapped can end up below the fold of the sheet's own
       scroller — which is exactly what happens entering a price near the
       bottom of a long product. Bring it back into view once the keyboard has
       finished arriving; it takes a few hundred milliseconds, and the sheet is
       still resizing the whole time, so this checks back rather than trusting
       one moment of it. */
    const scrollFieldIntoView = (field) => {
      const scroller = el.querySelector(".sheet-body");
      if (!scroller) return;
      const f = field.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      if (f.top >= s.top + 4 && f.bottom <= s.bottom - 4) return;   // already visible
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    el.addEventListener("focusin", (e) => {
      const field = e.target.closest("input, textarea, select");
      if (!field) return;
      [140, 340, 620].forEach((ms) => setTimeout(() => {
        if (document.activeElement === field) scrollFieldIntoView(field);
      }, ms));
    });

    // Drag-down-to-dismiss, only while the sheet is anchored to the bottom
    // (above 640px it becomes a centred dialog with a different transform).
    const isBottomSheet = () => window.matchMedia("(max-width: 639px)").matches;
    let startY = null;
    const head = el.querySelector(".sheet-head");
    const handleBar = el.querySelector(".sheet-handle");
    [head, handleBar].forEach((zone) => {
      zone.addEventListener("touchstart", (e) => {
        startY = isBottomSheet() ? e.touches[0].clientY : null;
      }, { passive: true });
      zone.addEventListener("touchmove", (e) => {
        if (startY == null) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) el.style.transform = `translate(-50%, ${dy}px)`;
      }, { passive: true });
      zone.addEventListener("touchend", (e) => {
        if (startY == null) return;
        const dy = (e.changedTouches[0] || {}).clientY - startY;
        el.style.transform = "";
        if (dy > 90) close();
        startY = null;
      });
    });

    const handle = { close, el };
    openSheets.push(handle);

    // Focus the first meaningful control.
    setTimeout(() => {
      const target = el.querySelector("input, textarea, select, button:not(.js-close)");
      if (target && !("ontouchstart" in window)) target.focus();
    }, 320);

    return handle;
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openSheets.length) {
      openSheets[openSheets.length - 1].close();
    }
  });

  /* ---------------- toast ---------------- */

  let toastTimer = null;

  function toast(message, { action, duration = 3600 } = {}) {
    const root = toastRoot();
    root.innerHTML = "";
    clearTimeout(toastTimer);

    const el = node(html`
      <div class="toast">
        <span class="toast-msg">${message}</span>
        ${action ? html`<button class="toast-action">${action.label}</button>` : ""}
      </div>
    `);

    if (action) {
      el.querySelector(".toast-action").addEventListener("click", () => {
        action.onClick();
        dismiss();
      });
    }

    function dismiss() {
      clearTimeout(toastTimer);
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 220);
    }

    root.append(el);
    toastTimer = setTimeout(dismiss, duration);
    return { dismiss };
  }

  /* ---------------- confirm ---------------- */

  function confirm({ title, message, okLabel = "OK", cancelLabel = "キャンセル", danger = false }) {
    return new Promise((resolve) => {
      let settled = false;
      const body = node(html`<div class="stack" style="gap:8px"><p style="color:var(--c-text-2);line-height:1.6">${message || ""}</p></div>`);
      const foot = node(html`
        <div style="display:flex;gap:8px;width:100%">
          <button class="btn btn-soft js-cancel" style="flex:1">${cancelLabel}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"} js-ok" style="flex:1">${okLabel}</button>
        </div>
      `);

      const h = sheet({
        title, content: body, footer: foot,
        onClose: () => { if (!settled) { settled = true; resolve(false); } },
      });

      foot.querySelector(".js-cancel").addEventListener("click", () => h.close());
      foot.querySelector(".js-ok").addEventListener("click", () => {
        settled = true;
        resolve(true);
        h.close();
      });
    });
  }

  /* ---------------- prompt ---------------- */

  function prompt({ title, label, value = "", placeholder = "", okLabel = "保存", inputMode }) {
    return new Promise((resolve) => {
      let settled = false;
      const body = node(html`
        <label class="field">
          ${label ? html`<span class="field-label">${label}</span>` : ""}
          <input class="input js-input" value="${value}" placeholder="${placeholder}"
                 ${inputMode ? KN.util.raw(`inputmode="${inputMode}"`) : ""}>
        </label>
      `);
      const foot = node(html`
        <div style="display:flex;gap:8px;width:100%">
          <button class="btn btn-soft js-cancel" style="flex:1">キャンセル</button>
          <button class="btn btn-primary js-ok" style="flex:1">${okLabel}</button>
        </div>
      `);

      const h = sheet({
        title, content: body, footer: foot,
        onClose: () => { if (!settled) { settled = true; resolve(null); } },
      });

      const input = body.querySelector(".js-input");
      function submit() {
        settled = true;
        resolve(input.value.trim());
        h.close();
      }
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      foot.querySelector(".js-ok").addEventListener("click", submit);
      foot.querySelector(".js-cancel").addEventListener("click", () => h.close());
    });
  }

  /* ---------------- store picker ---------------- */

  /** Chips of known stores + inline "new store" field. Resolves to a storeId. */
  function storePicker(container, { selectedId, onSelect }) {
    const stores = KN.store.sortedStores();
    let current = selectedId || (stores[0] && stores[0].id) || null;

    function render() {
      container.innerHTML = "";
      const wrap = node(html`<div class="chip-wrap"></div>`);
      stores.forEach((s) => {
        const chip = node(html`
          <button type="button" class="chip" aria-pressed="${String(s.id === current)}">
            <span class="dot" style="background:${s.color}"></span>${s.name}
          </button>
        `);
        chip.addEventListener("click", () => {
          current = s.id;
          onSelect(current);
          render();
        });
        wrap.append(chip);
      });

      const addChip = node(html`<button type="button" class="chip">＋ お店を追加</button>`);
      addChip.addEventListener("click", async () => {
        const name = await prompt({ title: "お店を追加", label: "お店の名前", placeholder: "例：イオン 〇〇店" });
        if (!name) return;
        const rec = KN.store.addStore(name);
        stores.length = 0;
        KN.store.sortedStores().forEach((s) => stores.push(s));
        current = rec.id;
        onSelect(current);
        render();
      });
      wrap.append(addChip);
      container.append(wrap);
    }

    render();
    if (current) onSelect(current);
    return { get current() { return current; } };
  }

  /* ---------------- category picker ---------------- */

  function categoryPicker(container, { selectedId, onSelect }) {
    let current = selectedId || KN.store.OTHER_CATEGORY;

    function render() {
      container.innerHTML = "";
      const wrap = node(html`<div class="chip-wrap"></div>`);
      KN.store.sortedCategories().forEach((c) => {
        const chip = node(html`
          <button type="button" class="chip" aria-pressed="${String(c.id === current)}"
                  style="--cat:${c.color || ""}">
            <span class="chip-emoji">${c.emoji}</span>${c.name}
          </button>
        `);
        chip.addEventListener("click", () => {
          current = c.id;
          haptic();
          onSelect(current);
          render();
        });
        wrap.append(chip);
      });
      container.append(wrap);
    }

    render();
    return {
      get current() { return current; },
      /** Move the selection without firing onSelect — for when something else
       *  changed the category, e.g. a rename that re-guessed it. */
      set(id) { if (id && id !== current) { current = id; render(); } },
    };
  }

  KN.ui = { sheet, toast, confirm, prompt, storePicker, categoryPicker };
})();
