/* =========================================================
   くらしノート — UI primitives (sheet, toast, dialogs)
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
  /**
   * 下から出てくる紙。
   *
   * `guard: true` を渡した紙だけ、閉じようとしたときに見張ります。書きかけの
   * まま × を押したり下へ払ったりしたら、黙って捨てずに一度だけ聞きます。
   *
   * 既定で入れていないのは、**書いたそばから保存する紙**があるからです
   * （商品のメモは、欄から離れた時点でもう入っています）。そういう紙で
   * 聞くのは、済んだことをもう一度聞くだけになります。
   */
  function sheet({ title, titleMark, content, footer, onClose, guard }) {
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
    /* ボタンは**紙の中身の最後**に置きます。キーボードの上に貼りつけて
       いましたが、指が届く代わりに、読めるところを一段ぶん食べていました。
       書き終えて下まで来た人はそこでボタンに会いますし、途中でやめる人には
       閉じるときに聞きます（下の tryClose）。 */
    if (footer) {
      const foot = node(html`<div class="sheet-foot"></div>`);
      foot.append(footer);
      el.querySelector(".sheet-body").append(foot);
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
      /* Nor does the caret. A field removed while still focused is never
         blurred on WebKit, so the app goes on believing a keyboard is up —
         which is what left the tab bar hidden after a sheet was closed.
         Say goodbye while the field is still there to hear it. */
      if (el.contains(document.activeElement)) document.activeElement.blur();
      KN.app.remeasure && KN.app.remeasure();
      const idx = openSheets.indexOf(handle);
      if (idx >= 0) openSheets.splice(idx, 1);
      if (!openSheets.length) document.body.style.overflow = "";
      setTimeout(() => { backdrop.remove(); el.remove(); }, 300);
      onClose && onClose();
    }

    /* ---- 書きかけのまま閉じようとしたとき ----

       ×、下へ払う、外を押す——どれも「やめる」の合図ですが、**書いたものを
       捨てる合図ではありません**。開いたときの中身を覚えておいて、変わって
       いれば一度だけ聞きます。「保存する」を選べば、そのまま保存の
       ボタンを押したのと同じことが起きます（検算で止まる紙なら、止まります）。 */
    const fields = () => [...el.querySelectorAll(".sheet-body input, .sheet-body textarea, .sheet-body select")]
      .filter((f) => !f.readOnly && !f.disabled && f.type !== "file");
    const snapshot = () =>
      fields().map((f) => (f.type === "checkbox" || f.type === "radio" ? String(f.checked) : String(f.value))).join("\u241F")
      + "\u241E"
      + [...el.querySelectorAll(".sheet-body [aria-pressed]")].map((b) => b.getAttribute("aria-pressed")).join(",");
    /* 「押せば済む」ボタン。帯そのものがボタンのこともあれば（やること）、
       中に並んでいることもあります（体重、お酒）。押せない状態のものは
       数えません——押しても何も起きないので、聞く意味がありません。 */
    const primary = () => {
      if (!footer || guard !== true) return null;
      const ok = (b) => b && !b.disabled;
      if (footer.matches && footer.matches(".js-save, .btn-primary") && ok(footer)) return footer;
      const inside = footer.querySelector
        ? footer.querySelector(".js-save, .btn-primary") : null;
      return ok(inside) ? inside : null;
    };
    let baseline = snapshot();
    /* 開いた直後に自分で埋める紙があります（前回と同じ条件、いまの時刻…）。
       それを「その人が書いた」と数えないよう、一拍おいて取り直します。 */
    setTimeout(() => { if (!closed) baseline = snapshot(); }, 60);

    function tryClose() {
      if (closed) return;
      const btn = guard === false ? null : primary();
      if (!btn || snapshot() === baseline) { close(); return; }
      confirm({
        title: "保存しますか？",
        message: "書きかけのものがあります。",
        okLabel: btn.textContent.trim() || "保存する",
        cancelLabel: "保存しない",
      }).then((ok) => {
        if (ok) btn.click();
        else close();
      });
    }

    backdrop.addEventListener("click", tryClose);
    el.querySelector(".js-close").addEventListener("click", tryClose);

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
        if (dy > 90) tryClose();
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

  /* aria-modal="true" だけでは、キーボードのTabは紙の外へも出て行けます
     （それを止めるのはブラウザではなく、ここのJSの役目です）。いちばん
     上の紙の中だけを回すようにします——端まで来たら、もう一方の端へ。 */
  function focusableIn(el) {
    return [...el.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
      'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((f) => f.offsetParent !== null);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openSheets.length) {
      openSheets[openSheets.length - 1].close();
      return;
    }
    if (e.key === "Tab" && openSheets.length) {
      const top = openSheets[openSheets.length - 1];
      const list = focusableIn(top.el);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      const active = document.activeElement;
      const inside = top.el.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first) { e.preventDefault(); last.focus(); }
      } else if (!inside || active === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------------- 弾み（済ませた瞬間だけの、短い火花） ----------------

     やることを済ませた・買うものを買った、その指の下だけに、小さな星が
     一瞬散って消えます。褒賞ではなく、**その場で起きたことへの相槌**の
     つもりなので、一度きり・250ms前後で終わり、居座りません。
     鳴らすのは「済ませた」ときだけ——チェックを外す・取り消すときは
     呼びません（本当に起きたことにしか反応しない、という約束のため）。

     動きを減らす設定の端末では、base.css の全体ルールがこの動きも
     瞬時にします。ここで個別に分岐は要りません。 */
  function burst(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const wrap = document.createElement("div");
    wrap.className = "kn-burst";
    wrap.style.left = cx + "px";
    wrap.style.top = cy + "px";
    const n = 6;
    for (let i = 0; i < n; i++) {
      const spark = document.createElement("i");
      const angle = (360 / n) * i + (Math.random() * 22 - 11);
      const dist = 16 + Math.random() * 10;
      spark.style.setProperty("--a", angle.toFixed(1) + "deg");
      spark.style.setProperty("--d", dist.toFixed(1) + "px");
      spark.style.animationDelay = Math.round(Math.random() * 40) + "ms";
      wrap.appendChild(spark);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 700);
  }

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
        title, content: body, footer: foot, guard: false,
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
        title, content: body, footer: foot, guard: false,
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
  /**
   * @param opts.selectedId  the shop to start on, or null
   * @param opts.autoPick    fall back to the first shop when nothing is given.
   *   Off where landing on a shop by default would be a decision made for the
   *   user — recording a price against whichever shop happens to sort first
   *   is not a thing anyone asked for.
   */
  function storePicker(container, { selectedId, onSelect, autoPick = true }) {
    const stores = KN.store.sortedStores();
    let current = selectedId || (autoPick ? (stores[0] && stores[0].id) : null) || null;

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

  /* ---------------- layout: rows or tiles ---------------- */

  /* Both lists are laid out the same way, from one setting. Two screens
     disagreeing about how a product looks would be a setting the app keeps
     rather than a way of looking at it. */

  const isTiles = () => KN.store.get().settings.layout === "tiles";

  function toggleLayout() {
    const to = isTiles() ? "rows" : "tiles";
    haptic(10);
    KN.store.update((s) => { s.settings.layout = to; });
  }

  /** Paints a topbar button with the layout it switches *to*. */
  function paintLayoutButton(btn) {
    if (!btn) return;
    const toTiles = !isTiles();
    btn.innerHTML = "";
    btn.append(node(html`${icon(toTiles ? "tiles" : "rows")}`));
    const label = toTiles ? "タイル表示にする" : "リスト表示にする";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  /* ---------------- swipe: right to take, left to archive ---------------- */

  /* One gesture for both screens and both layouts. Right is the tab's own
     positive action — ★ on the list, onto the list on the price screen — and
     left is always the archive. Nothing stays open, because neither has a
     second step to confirm; the card springs back and the change lands as it
     goes, with the toast holding the undo.

     Past the trigger the card only creeps, so the finger can feel where the
     edge is instead of watching for it. A tile is a third of a screen across,
     so it gets its own shorter throw — the same gesture, scaled to what is
     actually under the thumb.

     @param wrap  the positioned container holding the panels
     @param card  the part that moves
     @param opts  {onRight, onLeft, tiles} */
  function swipeActions(wrap, card, { onRight, onLeft, tiles }) {
    const TRIGGER = tiles ? 34 : 68;
    const MAX = tiles ? 52 : 104;
    const SLOP = tiles ? 10 : 14;
    const DOMINANCE = 1.6;

    let startX = 0, startY = 0, dx = 0, dir = 1;
    let dragging = false, decided = false, pointerId = null, swallowClick = false;
    let armed = false, pending = null, rafId = 0;

    // Pointer moves arrive faster than the screen refreshes; painting once per
    // frame is the difference between gliding and stuttering.
    const paint = () => {
      rafId = 0;
      if (pending === null) return;
      card.style.transform = `translate3d(${pending}px, 0, 0)`;
    };
    const schedule = (v) => {
      pending = v;
      if (!rafId) rafId = requestAnimationFrame(paint);
    };

    card.addEventListener("touchmove", (e) => { if (dragging) e.preventDefault(); }, { passive: false });

    card.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dragging = false;
      decided = false;
      armed = false;
    });

    card.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointerId) return;
      // Held still long enough to lift the row out of the list — from there the
      // gesture belongs to the reorder.
      if (KN.reorder && KN.reorder.isActive && KN.reorder.isActive()) return;
      const mx = e.clientX - startX;
      const my = e.clientY - startY;

      if (!decided) {
        if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
        decided = true;
        // Clearly sideways, not a drifting scroll: a diagonal belongs to the
        // list, which stays scrollable throughout.
        dragging = Math.abs(mx) >= SLOP && Math.abs(mx) > Math.abs(my) * DOMINANCE;
        if (!dragging) return;
        dir = mx > 0 ? 1 : -1;
        card.setPointerCapture(pointerId);
        card.style.transition = "none";
        wrap.classList.add("is-swiping", dir > 0 ? "is-right" : "is-left");
      }
      if (!dragging) return;

      const travel = mx * dir;
      dx = dir * Math.min(MAX, travel <= TRIGGER ? Math.max(0, travel)
        : TRIGGER + (travel - TRIGGER) * 0.32);
      const now = Math.abs(dx) >= TRIGGER;
      if (now !== armed) {
        armed = now;
        wrap.classList.toggle("is-armed", armed);
        if (armed) haptic(10);
      }
      schedule(dx);
    });

    const finish = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (!dragging) return;

      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      pending = null;
      card.style.transition = "";
      card.style.transform = "";
      const fired = armed;
      const way = dir;
      dragging = false;
      armed = false;
      swallowClick = true;
      // Let the card glide home before the store change rebuilds the list;
      // committing on the spot would swap it out mid-flight.
      setTimeout(() => {
        wrap.classList.remove("is-swiping", "is-armed", "is-left", "is-right");
        if (!fired) return;
        if (way > 0) { if (onRight) onRight(); }
        else if (onLeft) onLeft();
      }, 200);
    };
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);

    // A pointer sequence still fires a click afterwards; left alone it would
    // press whatever the finger lifted over at the end of every swipe.
    card.addEventListener("click", (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }

  /* ---------------- search: a button, and the bar it opens ----------------

     A search bar is worth its height only while it is being used. Left up
     permanently it costs a row of the list on every screen, every day, to
     answer a question asked once a week — so it lives behind the magnifier
     next to the layout button, and folds away again when the query is
     cleared. Same three parts on every screen that has one, wired here so
     they cannot drift apart.

     @param els  { searchBtn, searchWrap, search, searchClear }
     @param onChange  called after the query changes; repaint the list
     @param setQuery  hands the folded query back to the screen
  */
  function wireSearch(els, onChange, setQuery) {
    const paint = () => {
      const open = !els.searchWrap.hidden;
      els.searchBtn.classList.toggle("is-on", open);
      els.searchBtn.setAttribute("aria-expanded", String(open));
    };

    const clear = () => {
      els.search.value = "";
      els.searchClear.hidden = true;
      setQuery("");
      onChange();
    };

    els.searchBtn.addEventListener("click", () => {
      const opening = els.searchWrap.hidden;
      els.searchWrap.hidden = !opening;
      if (opening) setTimeout(() => els.search.focus(), 30);
      else clear();
      paint();
      KN.util.haptic();
    });

    els.search.addEventListener("input", () => {
      // Folded, so 「え」 finds 「エマール」 — the same rule the suggestions use.
      els.searchClear.hidden = !els.search.value;
      setQuery(KN.util.foldKana(els.search.value));
      onChange();
    });

    els.searchClear.addEventListener("click", () => { clear(); els.search.focus(); });

    paint();
  }

  /**
   * Put the cursor in a field and bring the keyboard with it.
   *
   * Must be called synchronously from the tap that opened the sheet. iOS only
   * raises the keyboard for a focus it can trace back to a gesture, and a
   * setTimeout — even one frame — has already broken that trail: the field
   * takes the caret and the keyboard stays down, so the first thing you do
   * after tapping ＋ is tap again.
   *
   * The second call, after the sheet has finished sliding, is for the browsers
   * that have no such rule and would otherwise focus a moving element.
   */
  function focusNow(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    setTimeout(() => {
      if (document.activeElement !== el && el.isConnected) el.focus();
    }, 320);
  }

  KN.ui = {
    sheet, toast, confirm, prompt, storePicker, categoryPicker, chipRow,
    isTiles, toggleLayout, paintLayoutButton, swipeActions, wireSearch, focusNow,
    burst,
  };
})();
