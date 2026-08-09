/* =========================================================
   かいものノート — shopping list screen
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, frag, icon, yen, haptic } = KN.util;
  const store = KN.store;

  let root = null;
  let els = {};
  let categoryFilter = null;   // categoryId or null = all
  let acIndex = -1;            // active autocomplete row
  let acMatches = [];
  let openWrap = null;         // the one row currently swiped open, if any

  /* ---------------- mount (static chrome) ---------------- */

  function mount(el) {
    root = el;
    root.innerHTML = "";

    const chrome = node(html`
      <div class="stack">
        <header class="topbar">
          <div class="topbar-row">
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">買い物リスト</h1>
              <div class="topbar-sub js-sub"></div>
            </div>
            <button class="icon-btn js-clear" aria-label="購入済みをまとめて削除" title="購入済みをまとめて削除">
              ${icon("trash")}
            </button>
          </div>
        </header>

        <div class="progress-wrap js-progress-wrap" hidden>
          <div class="progress"><div class="progress-bar js-progress" style="width:0%"></div></div>
        </div>

        <div class="js-filter"></div>
        <div class="js-body"></div>
      </div>
    `);

    root.append(chrome);

    /* The add bar sits in the shell's dock, not in this screen. Adding an item
       is the one thing done one-handed in a shop aisle, so it belongs at the
       bottom — but as a plain element there, not a sticky one in here. */
    const dock = document.getElementById("dock");
    dock.innerHTML = "";
    dock.append(node(html`
      <div class="quick-add">
        <form class="quick-add-bar js-form">
          ${icon("cart")}
          <input class="quick-add-input js-input" placeholder="商品を追加（例：食器用洗剤）"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 aria-label="商品を追加" aria-autocomplete="list">
          <button class="quick-add-btn js-add" type="submit" aria-label="追加" disabled>${icon("plus")}</button>
        </form>
        <div class="js-ac"></div>
      </div>
    `));

    els = {
      sub:        chrome.querySelector(".js-sub"),
      clear:      chrome.querySelector(".js-clear"),
      form:       dock.querySelector(".js-form"),
      input:      dock.querySelector(".js-input"),
      addBtn:     dock.querySelector(".js-add"),
      ac:         dock.querySelector(".js-ac"),
      progWrap:   chrome.querySelector(".js-progress-wrap"),
      progress:   chrome.querySelector(".js-progress"),
      filter:     chrome.querySelector(".js-filter"),
      body:       chrome.querySelector(".js-body"),
      topbar:     chrome.querySelector(".topbar"),
    };

    wireQuickAdd();

    els.clear.addEventListener("click", clearChecked);

    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  /* ---------------- quick add + autocomplete ---------------- */

  function wireQuickAdd() {
    const { input, form, addBtn, ac } = els;

    input.addEventListener("input", () => {
      addBtn.disabled = !input.value.trim();
      renderAutocomplete();
    });

    input.addEventListener("keydown", (e) => {
      if (!acMatches.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        acIndex = (acIndex + 1) % acMatches.length;
        paintActive();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        acIndex = acIndex <= 0 ? acMatches.length - 1 : acIndex - 1;
        paintActive();
      } else if (e.key === "Escape") {
        closeAutocomplete();
      }
    });

    input.addEventListener("blur", () => setTimeout(closeAutocomplete, 140));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const picked = acIndex >= 0 ? acMatches[acIndex] : null;
      if (picked && picked.product) {
        addExisting(picked.product);
      } else {
        addByName(input.value);
      }
    });
  }

  function renderAutocomplete() {
    const typed = els.input.value.trim();
    const q = KN.util.foldKana(typed);
    acIndex = -1;
    acMatches = [];
    if (!q) { closeAutocomplete(); return; }

    const onList = new Set(store.get().items.map((i) => i.productId));
    // Matched on the folded name, so a single「え」already surfaces
    // 「エマール」— nobody switches to katakana just to search their own list.
    const found = store.get().products
      .map((p) => ({ p, key: KN.util.foldKana(p.name) }))
      .filter((r) => r.key.includes(q))
      .sort((a, b) => {
        const aStarts = a.key.startsWith(q) ? 0 : 1;
        const bStarts = b.key.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.p.name.localeCompare(b.p.name, "ja");
      })
      .slice(0, 6)
      .map((r) => r.p);

    // Against what was actually typed, not the folded form — this decides
    // whether we are looking at an existing product or offering a new one.
    const exact = store.findProductByName(typed);
    acMatches = found.map((p) => ({ product: p }));
    if (!exact) acMatches.push({ product: null, name: typed });
    if (!acMatches.length) { closeAutocomplete(); return; }

    /* Reuse the panel across keystrokes. Rebuilding it meant the open
       animation — a fade up from transparent — restarted on every character,
       which read as the list flickering while you typed. The panel is created
       once, when it opens from nothing, and after that only its rows change. */
    let box = els.ac.querySelector(".ac");
    if (!box) {
      box = node(html`<div class="ac" role="listbox"></div>`);
      els.ac.append(box);
    } else {
      box.innerHTML = "";
    }

    acMatches.forEach((m, idx) => {
      let row;
      if (m.product) {
        const cat = store.getCategory(m.product.categoryId);
        const best = store.bestPrice(m.product);
        const bestStore = best ? store.getStore(best.storeId) : null;
        row = node(html`
          <button type="button" class="ac-item" role="option" data-idx="${String(idx)}">
            <span class="ac-emoji">${store.productMark(m.product)}</span>
            <span class="ac-main">
              <span class="ac-name">${m.product.name}</span>
              <span class="ac-sub">
                ${best && bestStore ? html`${bestStore.name} ${yen(best.price)} が最安` : "価格の記録なし"}
                ${onList.has(m.product.id) ? html` ・<b>リストにあります</b>` : ""}
              </span>
            </span>
          </button>
        `);
      } else {
        row = node(html`
          <button type="button" class="ac-item" role="option" data-idx="${String(idx)}">
            <span class="ac-emoji">✨</span>
            <span class="ac-main">
              <span class="ac-name ac-new">「${m.name}」を新しく追加</span>
              <span class="ac-sub">カテゴリは自動で振り分けます</span>
            </span>
          </button>
        `);
      }

      row.addEventListener("mousedown", (e) => e.preventDefault());
      row.addEventListener("click", () => {
        if (m.product) addExisting(m.product);
        else addByName(m.name);
      });
      box.append(row);
    });
  }

  function paintActive() {
    els.ac.querySelectorAll(".ac-item").forEach((r, i) => {
      r.classList.toggle("is-active", i === acIndex);
    });
  }

  function closeAutocomplete() {
    els.ac.innerHTML = "";
    acIndex = -1;
    acMatches = [];
  }

  function resetInput() {
    els.input.value = "";
    els.addBtn.disabled = true;
    closeAutocomplete();
    els.input.focus();
  }

  function addExisting(product) {
    const already = store.get().items.find((i) => i.productId === product.id && !i.checked);
    if (already) {
      // `already` points at the live record, so read the new quantity back
      // after the update rather than adding one to a value that already moved.
      store.update((s) => {
        const rec = s.items.find((i) => i.id === already.id);
        if (rec) rec.qty += 1;
      });
      const updated = store.get().items.find((i) => i.id === already.id);
      KN.ui.toast(`${product.name} を ${updated ? updated.qty : already.qty} 個にしました`);
    } else {
      store.addItem(product.id);
    }
    haptic(10);
    resetInput();
  }

  function addByName(rawName) {
    const name = String(rawName).trim();
    if (!name) return;

    const existing = store.findProductByName(name);
    if (existing) { addExisting(existing); return; }

    const product = store.addProduct({ name, categoryId: store.guessCategory(name) });
    store.addItem(product.id);
    haptic(10);
    resetInput();

    const cat = store.getCategory(product.categoryId);
    KN.ui.toast(`${cat.emoji} ${cat.name} に追加しました`, {
      action: {
        label: "編集",
        onClick: () => {
          const item = store.get().items.find((i) => i.productId === product.id);
          KN.productSheet.open(product.id, { itemId: item && item.id });
        },
      },
    });
  }

  /* ---------------- clear checked ---------------- */

  async function clearChecked() {
    const checked = store.get().items.filter((i) => i.checked);
    if (!checked.length) { KN.ui.toast("購入済みの商品はありません"); return; }

    const ok = await KN.ui.confirm({
      title: "購入済みを削除",
      message: `${checked.length}件の購入済み商品をリストから消します。商品と価格の記録は残ります。`,
      okLabel: "削除する",
      danger: true,
    });
    if (!ok) return;

    store.update((s) => { s.items = s.items.filter((i) => !i.checked); });
    KN.ui.toast(`${checked.length}件を削除しました`, {
      action: {
        label: "元に戻す",
        onClick: () => store.update((s) => { s.items = [...checked, ...s.items]; }),
      },
    });
  }

  /* ---------------- render ---------------- */

  function render() {
    const st = store.get();
    const items = st.items;

    // Once anything is starred the header tracks that trip rather than the whole
    // list, so it agrees with the tab badge instead of quoting a second number.
    const scope = items.some((i) => i.fav) ? items.filter((i) => i.fav) : items;
    const done = scope.filter((i) => i.checked).length;
    const label = scope === items ? "" : "今回買うもの ";

    // 「N件中M件購入済み」rather than「N件・M件購入済み」: the section heading
    // below counts what is left, and two different numbers under the same
    // wording read as a contradiction.
    els.sub.textContent = items.length
      ? (scope.length ? `${label}${scope.length}件中 ${done}件購入済み` : "今回買うものは未選択です")
      : "リストは空です";

    els.progWrap.hidden = scope.length === 0;
    els.progress.style.width = scope.length ? `${(done / scope.length) * 100}%` : "0%";

    renderFilter(items);
    renderBody(items);
  }

  function renderFilter(items) {
    els.filter.innerHTML = "";
    const counts = new Map();
    items.filter((i) => !i.checked).forEach((i) => {
      const p = store.getProduct(i.productId);
      if (!p) return;
      counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    });

    if (counts.size < 2) { categoryFilter = null; return; }
    if (categoryFilter && !counts.has(categoryFilter)) categoryFilter = null;

    const row = node(html`<div class="chip-row"></div>`);

    const all = node(html`
      <button type="button" class="chip" aria-pressed="${String(!categoryFilter)}">すべて</button>
    `);
    all.addEventListener("click", () => { categoryFilter = null; render(); });
    row.append(all);

    store.sortedCategories()
      .filter((c) => counts.has(c.id))
      .forEach((c) => {
        const chip = node(html`
          <button type="button" class="chip" aria-pressed="${String(categoryFilter === c.id)}">
            <span class="chip-emoji">${c.emoji}</span>${c.name}
            <span class="chip-count">${counts.get(c.id)}</span>
          </button>
        `);
        chip.addEventListener("click", () => {
          categoryFilter = categoryFilter === c.id ? null : c.id;
          haptic();
          render();
        });
        row.append(chip);
      });

    els.filter.append(row);
  }

  function renderBody(items) {
    // Rows are rebuilt from scratch, so any remembered open row is now detached.
    openWrap = null;
    els.body.innerHTML = "";

    if (!items.length) {
      els.body.append(emptyState());
      return;
    }

    const active = items.filter((i) => !i.checked);
    const checked = items.filter((i) => i.checked);
    const trip = active.filter((i) => i.fav);

    if (!trip.length) {
      // Nothing starred yet: one plain list with one total, as before. Splitting
      // the screen the moment favourites exist as a concept would leave anyone
      // not using them staring at an empty「今回買うもの」and a — total.
      const shown = appendGroups(active);
      if (!shown && categoryFilter) els.body.append(noneInCategory());
      if (checked.length) els.body.append(checkedSection(checked));
      els.body.append(summaryCard(active));
      els.body.append(insightsCard(active));
      return;
    }

    const rest = active.filter((i) => !i.fav);

    els.body.append(sectionHead("今回買うもの", trip.length, "trip"));
    const tripShown = appendGroups(trip);
    if (!tripShown && categoryFilter) els.body.append(noneInCategory());
    // The total belongs to the trip, so it sits directly under it — everything
    // below this line is explicitly not being bought today.
    els.body.append(summaryCard(trip, { trip: true }));
    els.body.append(insightsCard(trip));

    if (rest.length) {
      els.body.append(sectionHead("そのほか", rest.length, "rest"));
      appendGroups(rest);
    }

    if (checked.length) els.body.append(checkedSection(checked));
  }

  /** Renders category groups for the given items. Returns whether anything showed. */
  function appendGroups(list) {
    const groups = new Map();
    list.forEach((item) => {
      const p = store.getProduct(item.productId);
      if (!p) return;
      if (categoryFilter && p.categoryId !== categoryFilter) return;
      if (!groups.has(p.categoryId)) groups.set(p.categoryId, []);
      groups.get(p.categoryId).push({ item, product: p });
    });

    store.sortedCategories().forEach((cat) => {
      const entries = groups.get(cat.id);
      if (!entries || !entries.length) return;

      const group = node(html`
        <section class="cat-group">
          <h2 class="cat-head">
            <span class="cat-head-emoji">${cat.emoji}</span>${cat.name}
            <span class="cat-head-count">${entries.length}</span>
          </h2>
          <div class="item-list"></div>
        </section>
      `);
      const listEl = group.querySelector(".item-list");
      entries.forEach(({ item, product }) => listEl.append(itemRow(item, product)));
      wireReorder(listEl);
      els.body.append(group);
    });

    return groups.size > 0;
  }

  /* Reordering is within a group, because a group is exactly the set of rows
     that are interchangeable: same category, same side of the「今回買うもの」
     line. Dragging a row into another category's group would have to silently
     recategorise it, which is not what picking it up looks like it means. */
  function wireReorder(listEl) {
    KN.reorder.attach(listEl, {
      item: ".item-wrap",
      // A row already swiped open is mid-gesture; picking it up on top of that
      // would leave the delete panel hanging in the air.
      blocked: () => !!openWrap,
      onDrop: (from, to) => {
        const ids = Array.prototype.map.call(listEl.children, (w) => w.dataset.itemId);
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);

        // The group's order is its members' order within the whole list, so
        // the move writes them back into the same slots they already occupy —
        // everything not in this group stays exactly where it was.
        store.update((s) => {
          const inGroup = new Set(ids);
          const slots = [];
          s.items.forEach((it, i) => { if (inGroup.has(it.id)) slots.push(i); });
          const byId = new Map(s.items.map((it) => [it.id, it]));
          ids.forEach((id, k) => { s.items[slots[k]] = byId.get(id); });
        });
        KN.util.haptic(12);
      },
    });
  }

  function sectionHead(label, count, kind) {
    return node(html`
      <h2 class="trip-head trip-head-${kind}">
        ${kind === "trip" ? icon("star") : ""}
        <span>${label}</span>
        <span class="cat-head-count">${count}</span>
      </h2>
    `);
  }

  function noneInCategory() {
    return node(html`
      <p style="text-align:center;color:var(--c-text-3);padding:32px 16px">
        このカテゴリに未購入の商品はありません
      </p>
    `);
  }

  function itemRow(item, product) {
    const best = store.bestPrice(product);
    const bestStore = best ? store.getStore(best.storeId) : null;

    const wrap = node(html`
      <article class="item-wrap" data-item-id="${item.id}">
        <div class="item-actions">
          <button class="item-del" tabindex="-1" aria-label="${product.name} をリストから削除">削除</button>
        </div>
      </article>
    `);

    const row = node(html`
      <div class="item ${item.checked ? "is-checked" : ""}">
        <button class="check" role="checkbox" aria-checked="${String(item.checked)}"
                aria-label="${product.name} を購入済みにする">${icon("check")}</button>
        <span class="item-emoji" aria-hidden="true">${store.productMark(product)}</span>
        <button class="item-body">
          <span class="item-name-row">
            <span class="item-name">${product.name}</span>
            ${item.qty > 1 ? html`<span class="item-qty">×${item.qty}</span>` : ""}
          </span>
          <span class="item-meta">
            ${item.memo ? html`<span class="item-memo">${item.memo}</span>` : ""}
          </span>
        </button>
        <div class="item-price"></div>
        <button class="fav ${item.fav ? "is-on" : ""}" aria-pressed="${String(!!item.fav)}"
                aria-label="${product.name} を今回買うものにする">${icon("star")}</button>
      </div>
    `);
    wrap.append(row);

    const priceBox = row.querySelector(".item-price");
    if (best && bestStore) {
      priceBox.append(frag(html`
        <span class="item-price-amount">${yen(best.price * item.qty)}</span>
        <span class="item-price-store">🏆 ${bestStore.name}</span>
      `));
    } else {
      priceBox.append(node(html`<span class="item-price-none">値段は未登録</span>`));
    }

    row.querySelector(".check").addEventListener("click", () => {
      store.update((s) => {
        const rec = s.items.find((i) => i.id === item.id);
        if (rec) {
          rec.checked = !rec.checked;
          rec.checkedAt = rec.checked ? KN.util.today() : null;
        }
      });
      haptic(12);
    });

    row.querySelector(".fav").addEventListener("click", () => {
      store.update((s) => {
        const rec = s.items.find((i) => i.id === item.id);
        if (rec) rec.fav = !rec.fav;
      });
      haptic(12);
    });

    row.querySelector(".item-body").addEventListener("click", () => {
      KN.productSheet.open(product.id, { itemId: item.id });
    });

    wrap.querySelector(".item-del").addEventListener("click", () => {
      const removed = store.get().items.find((i) => i.id === item.id);
      const at = store.get().items.indexOf(removed);
      store.update((s) => { s.items = s.items.filter((i) => i.id !== item.id); });
      haptic(12);
      // Deleting straight from a swipe is the platform convention, so the safety
      // net is an undo rather than a dialog standing between every removal.
      KN.ui.toast(`「${product.name}」を削除しました`, {
        action: {
          label: "元に戻す",
          onClick: () => store.update((s) => {
            const next = s.items.slice();
            next.splice(Math.max(0, Math.min(at, next.length)), 0, removed);
            s.items = next;
          }),
        },
      });
    });

    attachSwipe(wrap, row);
    return wrap;
  }

  /* ---------------- swipe to reveal delete ---------------- */

  // Only one row may sit open; a second one opening closes the first.
  function closeOpenRow() {
    if (openWrap) {
      openWrap.classList.remove("is-open");
      holdPanelDuringClose(openWrap);
    }
    openWrap = null;
  }

  /* The row slides back over 0.22s. Hiding the panel the instant the class goes
     would leave a bare strip of background trailing the row for that moment, so
     keep it on screen until the row has finished covering it again. */
  function holdPanelDuringClose(wrap) {
    const row = wrap.querySelector(".item");
    if (!row) return;
    wrap.classList.add("is-closing");
    const done = () => wrap.classList.remove("is-closing");
    row.addEventListener("transitionend", done, { once: true });
    // A transition that never runs (already at rest) would otherwise strand it.
    // Comfortably longer than the slide, or the panel vanishes mid-flight.
    setTimeout(done, 900);
  }

  function attachSwipe(wrap, row) {
    const REVEAL = 88;      // width of the delete panel
    const SLOP = 14;        // travel before a drag counts as a drag and not a tap
    const DOMINANCE = 1.6;  // how much horizontal has to beat vertical by
    let startX = 0, startY = 0, dx = 0;
    let dragging = false, decided = false, pointerId = null, swallowClick = false;
    let pendingDx = null, rafId = 0;

    // Pointer moves arrive faster than the screen refreshes. Painting once per
    // frame instead of once per event keeps the row gliding rather than
    // stuttering under a quick finger.
    const paint = () => {
      rafId = 0;
      if (pendingDx === null) return;
      row.style.transform = `translate3d(${pendingDx}px, 0, 0)`;
    };
    const schedule = (v) => {
      pendingDx = v;
      if (!rafId) rafId = requestAnimationFrame(paint);
    };

    // touch-action keeps the list scrollable up to the moment a swipe is
    // recognised; from then on the browser has to be told to stop, or the list
    // scrolls under the finger while the row slides sideways.
    row.addEventListener("touchmove", (e) => {
      if (dragging) e.preventDefault();
    }, { passive: false });

    row.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dragging = false;
      decided = false;
      // Deliberately touches no styles: a press that never becomes a swipe
      // should leave the row exactly as it was.
    });

    row.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointerId) return;
      // Held still long enough to lift the row out of the list — from here the
      // gesture belongs to the reorder, not to the delete swipe.
      if (KN.reorder.isActive()) return;
      const mx = e.clientX - startX;
      const my = e.clientY - startY;

      if (!decided) {
        if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
        decided = true;
        // Has to be a clearly sideways movement, not a drifting scroll. A
        // diagonal belongs to the list, which stays scrollable throughout.
        // Rightwards only counts on an open row, where it means "put it back";
        // on a closed row there is nothing to the right to reach for.
        const isOpen = wrap.classList.contains("is-open");
        dragging = Math.abs(mx) >= SLOP
          && Math.abs(mx) > Math.abs(my) * DOMINANCE
          && (isOpen || mx < 0);
        if (!dragging) return;
        row.setPointerCapture(pointerId);
        row.style.transition = "none";
        wrap.classList.add("is-swiping");
        if (openWrap && openWrap !== wrap) closeOpenRow();
      }
      if (!dragging) return;

      const base = wrap.classList.contains("is-open") ? -REVEAL : 0;
      // Bounded by the panel at both ends. Going further left than the panel is
      // wide opened a strip of bare background beyond it — very visible on a
      // second swipe of an already-open row — and going right of 0 would show
      // the same on the other side.
      dx = Math.min(0, Math.max(-REVEAL, base + mx));
      schedule(dx);
    });

    const finish = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (!dragging) return;

      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      pendingDx = null;
      row.style.transition = "";
      row.style.transform = "";
      wrap.classList.remove("is-swiping");
      const open = dx < -REVEAL / 2;
      wrap.classList.toggle("is-open", open);
      if (!open) holdPanelDuringClose(wrap);
      openWrap = open ? wrap : (openWrap === wrap ? null : openWrap);
      dragging = false;
      // A pointer sequence still emits a click afterwards. Left alone it would
      // press whatever the finger lifted over, and — because the row is open by
      // then — immediately close the row the swipe just opened.
      swallowClick = true;
    };
    row.addEventListener("pointerup", finish);
    row.addEventListener("pointercancel", finish);

    row.addEventListener("click", (e) => {
      if (swallowClick) {
        swallowClick = false;
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      // With the delete panel showing, a tap on the row means "put it back".
      if (wrap.classList.contains("is-open")) {
        e.stopPropagation();
        e.preventDefault();
        closeOpenRow();
      }
    }, true);
  }

  function checkedSection(checked) {
    const st = store.get();
    const open = st.settings.showChecked !== false;

    const section = node(html`
      <section class="cat-group">
        <button class="done-head" aria-expanded="${String(open)}">
          ${icon("chevron")} 購入済み <span class="cat-head-count">${checked.length}</span>
        </button>
        <div class="item-list js-done" ${open ? "" : KN.util.raw("hidden")}></div>
      </section>
    `);

    const list = section.querySelector(".js-done");
    checked.forEach((item) => {
      const p = store.getProduct(item.productId);
      if (p) list.append(itemRow(item, p));
    });

    section.querySelector(".done-head").addEventListener("click", () => {
      store.update((s) => { s.settings.showChecked = !open; });
    });

    return section;
  }

  function summaryCard(active, { trip = false } = {}) {
    let total = 0;
    let unknown = 0;

    active.forEach((item) => {
      const p = store.getProduct(item.productId);
      const best = p && store.bestPrice(p);
      if (best) total += best.price * item.qty;
      else unknown += 1;
    });

    if (!active.length) return document.createDocumentFragment();

    const scope = trip ? "今回買うもの" : "未購入";
    return node(html`
      <div class="list-summary">
        <div class="summary-row">
          <span class="summary-label">最安値で買うと</span>
          <span class="summary-total">${total > 0 ? yen(total) : "—"}</span>
        </div>
        <p class="summary-note">
          ${unknown > 0
            ? html`${unknown}品は値段が未登録です。商品をタップして登録すると合計に反映されます。`
            : html`${scope} ${active.length}品を、それぞれいちばん安いお店で買った場合の合計です。`}
        </p>
      </div>
    `);
  }

  /* Whatever the numbers happen to be worth saying out loud. Renders nothing
     at all when there is nothing to say, which is most of the time early on. */
  function insightsCard(items) {
    const found = KN.insights.forItems(items);
    if (!found.length) return document.createDocumentFragment();

    const card = node(html`
      <section class="insights">
        <h2 class="insights-head">${icon("sparkles")} 気づいたこと</h2>
        <div class="insights-list"></div>
      </section>
    `);
    const listEl = card.querySelector(".insights-list");
    found.forEach((f) => {
      listEl.append(node(html`
        <div class="insight">
          <span class="insight-ico">${f.icon}</span>
          <span class="insight-main">
            <span class="insight-title">${f.title}</span>
            <span class="insight-body">${f.body}</span>
          </span>
        </div>
      `));
    });
    return card;
  }

  function emptyState() {
    const wrap = node(html`
      <div class="empty">
        <div class="empty-art">🛒</div>
        <h2 class="empty-title">買うものを追加しましょう</h2>
        <p class="empty-text">
          下の欄に商品名を入れるだけ。カテゴリは自動で振り分けられ、
          お店ごとの値段を登録すると「どこが一番安いか」が分かります。
        </p>
        <button class="btn btn-soft js-sample" style="margin-top:8px">サンプルを入れて試す</button>
      </div>
    `);
    wrap.querySelector(".js-sample").addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "サンプルを入れますか？",
        message: "3つのお店と7つの商品・価格が入ったサンプルデータを読み込みます。あとから設定画面で全部消せます。",
        okLabel: "入れる",
      });
      if (ok) { store.loadSample(); KN.ui.toast("サンプルを読み込みました"); }
    });
    return wrap;
  }

  KN.screens = KN.screens || {};
  KN.screens.list = { mount, render };
})();
