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

    /* Each sheet opened over another gets its own storey. Without this every
       sheet sits at the same z-index and the new sheet's backdrop lands
       *under* the old sheet — so the one underneath stays sharp and bright and
       you end up reading two forms at once through the frosted glass. */
    const depth = openSheets.length;
    backdrop.style.zIndex = String(100 + depth * 2);
    el.style.zIndex = String(101 + depth * 2);

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
      // The pad belongs to a field in this sheet; it has no business outliving it.
      KN.keypad && KN.keypad.close();
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
      el.querySelector(".toast-action").addEventListener("click", (e) => {
        // Stop it reaching the tap-to-dismiss below: the action closes the
        // toast itself, and running both would be doing the same work twice.
        e.stopPropagation();
        action.onClick();
        dismiss();
      });
    }

    /* Tapped anywhere else: gone. It is an aside, not a question, and sitting
       out its 3.6 seconds to see the row underneath is a poor deal. */
    el.addEventListener("click", () => dismiss());

    let gone = false;
    function dismiss() {
      if (gone) return;
      gone = true;
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

  /* ---------------- horizontal chip filter ---------------- */

  /**
   * A sideways-scrolling row of filter chips that survives a re-render.
   *
   * Rebuilding the row from scratch on every tap threw its scroll position
   * away, so choosing a category that had been scrolled into view sent the
   * whole row back to the left and the chip just pressed could end up off
   * the screen. Here the row is kept: while the chips themselves are
   * unchanged only `aria-pressed` moves, and the scroller is never touched.
   * A real change — a category gaining items, or disappearing — does rebuild,
   * and puts the scroll position back where it was.
   *
   * @param {HTMLElement} host
   * @param {Array<{id:string,label:string,emoji?:string,color?:string,count?:number}>} chips
   * @param {{activeId:string, onPick:Function}} opts
   */
  function chipRow(host, chips, { activeId, onPick }) {
    const sig = chips.map((c) => `${c.id} ${c.label} ${c.count == null ? "" : c.count}`).join("|");
    let row = host.querySelector(".chip-row");

    if (row && row.dataset.sig === sig) {
      row.querySelectorAll(".chip").forEach((el) => {
        el.setAttribute("aria-pressed", String(el.dataset.id === String(activeId)));
      });
      return row;
    }

    const left = row ? row.scrollLeft : 0;
    host.innerHTML = "";
    row = node(html`<div class="chip-row"></div>`);
    row.dataset.sig = sig;

    chips.forEach((c) => {
      /* Only written when there is a colour: `--cat:` with nothing after it is
         an empty value, not an absent one, so `var(--cat, var(--c-primary))`
         would substitute nothing and the selected 「すべて」 chip would lose
         its green rather than fall back to it. */
      const el = node(html`
        <button type="button" class="chip" data-id="${c.id}"
                aria-pressed="${String(c.id === activeId)}"
                ${c.color ? KN.util.raw(`style="--cat:${c.color}"`) : ""}>
          ${c.emoji ? html`<span class="chip-emoji">${c.emoji}</span>` : ""}${c.label}
          ${c.count != null ? html`<span class="chip-count">${String(c.count)}</span>` : ""}
        </button>
      `);
      el.addEventListener("click", () => onPick(c.id));
      row.append(el);
    });

    host.append(row);
    row.scrollLeft = left;
    return row;
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

  KN.ui = { sheet, toast, confirm, prompt, storePicker, categoryPicker, chipRow };
})();
