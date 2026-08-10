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

    /* The add button sits in the shell's dock, not in this screen. Adding
       something is the one thing done one-handed in a shop aisle, so it
       belongs at the bottom, in the middle, where a thumb already is.

       It used to be a text field here, with the suggestions opening upward
       over the list. That got you a name and nothing else: quantity and
       category had to be fixed afterwards in the product sheet. One button
       and one form is fewer steps for anything beyond a bare name, and the
       same suggestions still turn a name into an existing product. */
    const dock = document.getElementById("dock");
    dock.innerHTML = "";
    dock.append(node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="買うものを追加">${icon("plus")}</button>
      </div>
    `));

    els = {
      sub:        chrome.querySelector(".js-sub"),
      clear:      chrome.querySelector(".js-clear"),
      addFab:     dock.querySelector(".js-open-add"),
      progWrap:   chrome.querySelector(".js-progress-wrap"),
      progress:   chrome.querySelector(".js-progress"),
      filter:     chrome.querySelector(".js-filter"),
      body:       chrome.querySelector(".js-body"),
      topbar:     chrome.querySelector(".topbar"),
    };

    els.addFab.addEventListener("click", openAddSheet);

    els.clear.addEventListener("click", clearChecked);

    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  /* ---------------- the add sheet ---------------- */

  /* One form for everything a new line on the list needs: what it is, how
     many, and which aisle it belongs to. The name field still suggests as you
     type — tapping a suggestion is what turns 「ぎゅうにゅう」 into the 牛乳
     already on file, with its prices and its category, instead of a second
     product with the same name.

     It stays open after each add. A shopping list is written in one sitting,
     and closing the sheet only to press ＋ again is the kind of ceremony that
     makes a list feel like paperwork. */
  function openAddSheet() {
    haptic(10);

    let picked = null;        // an existing product chosen from the suggestions
    let catTouched = false;   // the category was set by hand, so stop guessing
    let qty = 1;

    const body = node(html`
      <div class="stack" style="gap:18px">
        <div class="field">
          <span class="field-label">商品名</span>
          <input class="input js-name" placeholder="例：食器用洗剤"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 aria-autocomplete="list">
          <div class="js-ac"></div>
          <span class="field-hint js-known" hidden></span>
        </div>

        <div class="field">
          <span class="field-label">個数</span>
          <div class="stepper">
            <button type="button" class="stepper-btn js-minus" aria-label="1つ減らす">${icon("minus")}</button>
            <span class="stepper-value js-qty" aria-live="polite">1</span>
            <button type="button" class="stepper-btn js-plus" aria-label="1つ増やす">${icon("plus")}</button>
          </div>
        </div>

        <div class="field">
          <span class="field-label">カテゴリ</span>
          <div class="js-cat"></div>
        </div>

        <label class="field">
          <span class="field-label">メモ（任意）</span>
          <input class="input js-memo" placeholder="例：詰め替え用" autocomplete="off">
        </label>
      </div>
    `);

    const nameEl = body.querySelector(".js-name");
    const memoEl = body.querySelector(".js-memo");
    const qtyEl  = body.querySelector(".js-qty");
    const acHost = body.querySelector(".js-ac");
    const known  = body.querySelector(".js-known");

    const foot = node(html`<button class="btn btn-primary btn-block js-add" disabled>リストに追加</button>`);
    const addBtn = foot;

    const handle = KN.ui.sheet({ title: "買うものを追加", content: body, footer: foot });

    const cat = KN.ui.categoryPicker(body.querySelector(".js-cat"), {
      selectedId: store.OTHER_CATEGORY,
      onSelect: () => { catTouched = true; },
    });

    const paintQty = () => { qtyEl.textContent = String(qty); };
    body.querySelector(".js-minus").addEventListener("click", () => {
      if (qty <= 1) { haptic(20); return; }
      qty -= 1; paintQty(); haptic();
    });
    body.querySelector(".js-plus").addEventListener("click", () => {
      qty += 1; paintQty(); haptic();
    });

    /* Everything the name field drives: the button, the suggestions, and —
       until the category is touched by hand — the guess underneath it. */
    function onName() {
      const typed = nameEl.value.trim();
      addBtn.disabled = !typed;
      // Typing on past a chosen suggestion means it is no longer that product.
      if (picked && KN.util.foldKana(picked.name) !== KN.util.foldKana(typed)) {
        picked = null;
        known.hidden = true;
      }
      if (!picked && !catTouched) cat.set(typed ? store.guessCategory(typed) : store.OTHER_CATEGORY);
      renderSuggestions(nameEl, acHost, typed, choose);
    }

    /* A suggestion tapped: from here the form is about that product, so its
       category comes along and the sheet says which one it landed on. */
    function choose(product) {
      picked = product;
      nameEl.value = product.name;
      addBtn.disabled = false;
      catTouched = false;
      cat.set(product.categoryId);
      const best = store.bestPrice(product);
      const st = best ? store.getStore(best.storeId) : null;
      known.hidden = false;
      known.textContent = best && st
        ? `登録済みの商品です・${st.name} ${yen(best.price)} が最安`
        : "登録済みの商品です";
      acHost.innerHTML = "";
      nameEl.focus();
    }

    nameEl.addEventListener("input", onName);
    nameEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      submit();
    });
    memoEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    addBtn.addEventListener("click", submit);

    function submit() {
      const name = nameEl.value.trim();
      if (!name) { nameEl.focus(); return; }

      const product = picked || store.findProductByName(name)
        || store.addProduct({ name, categoryId: cat.current });

      /* A category chosen by hand outranks the guess, and is remembered — the
         next 「コンソメ」 lands where this one did without being told again.
         Applied even when the product was just created with that category:
         the guess and the choice agreeing does not make it a guess. */
      if (catTouched) {
        store.update((s) => {
          const rec = s.products.find((x) => x.id === product.id);
          if (rec) { rec.categoryId = cat.current; rec.catManual = true; }
        });
        store.learnCategory(product.name, cat.current);
      }

      const memo = memoEl.value.trim();
      const already = store.get().items.find((i) => i.productId === product.id && !i.checked);
      if (already) {
        store.update((s) => {
          const rec = s.items.find((i) => i.id === already.id);
          if (!rec) return;
          rec.qty += qty;
          if (memo) rec.memo = memo;
        });
        const now = store.get().items.find((i) => i.id === already.id);
        KN.ui.toast(`${product.name} を ${now ? now.qty : already.qty} 個にしました`);
      } else {
        store.addItem(product.id, { qty, memo });
        const c = store.getCategory(product.categoryId);
        KN.ui.toast(`${c.emoji} ${c.name} に「${product.name}」を追加しました`);
      }
      haptic(12);
      reset();
    }

    /* Cleared and ready for the next one, rather than closed. */
    function reset() {
      picked = null;
      catTouched = false;
      qty = 1;
      paintQty();
      nameEl.value = "";
      memoEl.value = "";
      known.hidden = true;
      addBtn.disabled = true;
      acHost.innerHTML = "";
      cat.set(store.OTHER_CATEGORY);
      nameEl.focus();
    }

    // The sheet focuses its first control after its own animation; on a phone
    // it deliberately does not, so the keyboard does not fly up over it.
    setTimeout(() => { if (!("ontouchstart" in window)) nameEl.focus(); }, 340);
    return handle;
  }

  /* ---------------- suggestions ---------------- */

  /* Matched on the folded name, so a single 「え」 already surfaces
     「エマール」 — nobody switches to katakana to search their own list. */
  function renderSuggestions(input, host, typed, onPick) {
    const q = KN.util.foldKana(typed);
    if (!q) { host.innerHTML = ""; return; }

    const onList = new Set(store.get().items.filter((i) => !i.checked).map((i) => i.productId));
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

    if (!found.length) { host.innerHTML = ""; return; }

    /* Reuse the panel across keystrokes. Rebuilding it restarted the open
       animation on every character, which read as the list flickering. */
    let box = host.querySelector(".ac");
    if (!box) {
      box = node(html`<div class="ac" role="listbox"></div>`);
      host.append(box);
    } else {
      box.innerHTML = "";
    }

    found.forEach((p) => {
      const best = store.bestPrice(p);
      const bestStore = best ? store.getStore(best.storeId) : null;
      const row = node(html`
        <button type="button" class="ac-item" role="option">
          <span class="ac-emoji">${store.productMark(p)}</span>
          <span class="ac-main">
            <span class="ac-name">${p.name}</span>
            <span class="ac-sub">
              ${best && bestStore ? html`${bestStore.name} ${yen(best.price)} が最安` : "価格の記録なし"}
              ${onList.has(p.id) ? html` ・<b>リストにあります</b>` : ""}
            </span>
          </span>
        </button>
      `);
      // Keep the caret where it is; a suggestion is not somewhere to move to.
      row.addEventListener("mousedown", (e) => e.preventDefault());
      row.addEventListener("click", () => onPick(p));
      box.append(row);
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
    const counts = new Map();
    items.filter((i) => !i.checked).forEach((i) => {
      const p = store.getProduct(i.productId);
      if (!p) return;
      counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    });

    if (counts.size < 2) { categoryFilter = null; els.filter.innerHTML = ""; return; }
    if (categoryFilter && !counts.has(categoryFilter)) categoryFilter = null;

    const chips = [{ id: "", label: "すべて" }].concat(
      store.sortedCategories().filter((c) => counts.has(c.id)).map((c) => ({
        id: c.id, label: c.name, emoji: c.emoji, color: c.color, count: counts.get(c.id),
      })));

    KN.ui.chipRow(els.filter, chips, {
      activeId: categoryFilter || "",
      onPick: (id) => {
        categoryFilter = id && id !== categoryFilter ? id : null;
        haptic();
        render();
      },
    });
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

    /* 今回買うもの gets a box of its own rather than a heading of its own. A
       heading is a line above a list, and a line above a list is easy to lose
       track of once you are three rows down; a panel the rows sit *inside*
       is unmistakable at any scroll position. The total goes at the bottom of
       the same panel, because it is the total of exactly what the panel
       holds — everything outside it is explicitly not being bought today. */
    const box = node(html`<section class="trip"></section>`);
    box.append(sectionHead("今回買うもの", trip.length, "trip"));
    const inner = node(html`<div class="trip-body"></div>`);
    const tripShown = appendGroups(trip, inner);
    if (!tripShown && categoryFilter) inner.append(noneInCategory());
    box.append(inner);
    box.append(summaryTotal(trip));
    els.body.append(box);
    els.body.append(insightsCard(trip));

    if (rest.length) {
      els.body.append(sectionHead("そのほか", rest.length, "rest"));
      appendGroups(rest);
    }

    if (checked.length) els.body.append(checkedSection(checked));
  }

  /** Renders category groups for the given items. Returns whether anything showed. */
  function appendGroups(list, host) {
    const into = host || els.body;
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

      /* No heading. The category is written down the left edge of every row
         instead (see .item::before) — a word above each handful of rows was
         more furniture than the list could carry, and the colour says the
         same thing without taking a line. The grouping stays: it is what
         makes the colours run in blocks, and what a drag reorders within. */
      const group = node(html`
        <section class="cat-group" style="--cat:${cat.color || ""}">
          <div class="item-list"></div>
        </section>
      `);
      const listEl = group.querySelector(".item-list");
      entries.forEach(({ item, product }) => listEl.append(itemRow(item, product)));
      wireReorder(listEl);
      into.append(group);
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
      <article class="item-wrap" data-item-id="${item.id}" style="--cat:${store.productColor(product)}">
        <div class="item-actions">
          <button class="item-del" tabindex="-1" aria-label="${product.name} をリストから削除">削除</button>
        </div>
        <div class="item-star">
          ${icon("star")}<span>${item.fav ? "★をはずす" : "今回買う"}</span>
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

    row.querySelector(".fav").addEventListener("click", () => toggleFav(item.id));

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

    attachSwipe(wrap, row, item);
    return wrap;
  }

  /* ---------------- swipe: left to delete, right to star ---------------- */

  /** ★ marks an item as part of the trip being shopped right now. */
  function toggleFav(itemId) {
    store.update((s) => {
      const rec = s.items.find((i) => i.id === itemId);
      if (rec) rec.fav = !rec.fav;
    });
    haptic(12);
  }

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

  function attachSwipe(wrap, row, item) {
    const REVEAL = 88;      // width of the delete panel
    const SLOP = 14;        // travel before a drag counts as a drag and not a tap
    const DOMINANCE = 1.6;  // how much horizontal has to beat vertical by
    const STAR = 68;        // how far right before the ★ is armed
    const STAR_MAX = 104;   // and how far it will stretch at all
    let startX = 0, startY = 0, dx = 0;
    let dragging = false, decided = false, pointerId = null, swallowClick = false;
    let pendingDx = null, rafId = 0;
    // "del" reveals the delete panel and stays open; "star" springs straight
    // back and toggles ★ — same gesture as the price screen's list swipe.
    let mode = "del";
    let starArmed = false;

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
        const isOpen = wrap.classList.contains("is-open");
        dragging = Math.abs(mx) >= SLOP && Math.abs(mx) > Math.abs(my) * DOMINANCE;
        if (!dragging) return;
        // Rightwards on an open row still means "put it back"; on a closed one
        // it is the ★.
        mode = (mx > 0 && !isOpen) ? "star" : "del";
        row.setPointerCapture(pointerId);
        row.style.transition = "none";
        wrap.classList.add("is-swiping", mode === "star" ? "is-starring" : "is-deleting");
        if (openWrap && openWrap !== wrap) closeOpenRow();
      }
      if (!dragging) return;

      if (mode === "star") {
        // Past the trigger the row only creeps, so the finger feels the edge.
        dx = mx <= STAR ? mx : STAR + (mx - STAR) * 0.32;
        dx = Math.min(STAR_MAX, Math.max(0, dx));
        const now = dx >= STAR;
        if (now !== starArmed) {
          starArmed = now;
          wrap.classList.toggle("is-armed", now);
          if (now) haptic(10);
        }
        schedule(dx);
        return;
      }

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

      if (mode === "star") {
        const fired = starArmed;
        starArmed = false;
        dragging = false;
        swallowClick = true;
        // Let the row glide home before the store change rebuilds the list;
        // toggling on the spot would swap it out mid-flight.
        setTimeout(() => {
          wrap.classList.remove("is-swiping", "is-starring", "is-armed");
          if (fired) toggleFav(item.id);
        }, 200);
        return;
      }

      wrap.classList.remove("is-swiping", "is-deleting");
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

  /* Just the number. What it is the total *of* is now said by where it sits —
     at the foot of the panel holding those rows — so the paragraph that used
     to explain it has gone. The one thing kept is the count of items with no
     price yet, because without it a total that looks too small looks wrong
     rather than incomplete. */
  function summaryTotal(active) {
    let total = 0;
    let unknown = 0;

    active.forEach((item) => {
      const p = store.getProduct(item.productId);
      const best = p && store.bestPrice(p);
      if (best) total += best.price * item.qty;
      else unknown += 1;
    });

    if (!active.length) return document.createDocumentFragment();

    return node(html`
      <div class="summary-row">
        <span class="summary-label">
          最安値で買うと
          ${unknown > 0 ? html`<span class="summary-missing">${unknown}品は値段が未登録</span>` : ""}
        </span>
        <span class="summary-total">${total > 0 ? yen(total) : "—"}</span>
      </div>
    `);
  }

  /** The same total, on its own card, for a list with nothing starred. */
  function summaryCard(active) {
    if (!active.length) return document.createDocumentFragment();
    const card = node(html`<div class="list-summary"></div>`);
    card.append(summaryTotal(active));
    return card;
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
