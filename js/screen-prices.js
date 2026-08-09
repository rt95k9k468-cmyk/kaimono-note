/* =========================================================
   かいものノート — products & prices screen
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, yen, perItemPrice, formatSize, haptic } = KN.util;
  const store = KN.store;

  let root = null;
  let els = {};
  let query = "";
  let categoryFilter = null;

  function mount(el) {
    root = el;
    root.innerHTML = "";

    const chrome = node(html`
      <div class="stack">
        <header class="topbar">
          <div class="topbar-row">
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">商品と価格</h1>
              <div class="topbar-sub js-sub"></div>
            </div>
            <button class="icon-btn js-new" aria-label="商品を追加" title="商品を追加"
                    style="background:var(--c-primary);color:#fff">${icon("plus")}</button>
          </div>
        </header>

        <div class="search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="商品名で探す" aria-label="商品名で探す"
                   autocomplete="off" spellcheck="false">
            <button class="icon-btn js-clear" aria-label="検索をクリア" style="width:28px;height:28px" hidden>
              ${icon("close")}
            </button>
          </div>
        </div>

        <div class="js-filter"></div>
        <div class="js-body"></div>
      </div>
    `);

    root.append(chrome);

    els = {
      sub:     chrome.querySelector(".js-sub"),
      search:  chrome.querySelector(".js-search"),
      clear:   chrome.querySelector(".js-clear"),
      newBtn:  chrome.querySelector(".js-new"),
      filter:  chrome.querySelector(".js-filter"),
      body:    chrome.querySelector(".js-body"),
      topbar:  chrome.querySelector(".topbar"),
    };

    els.search.addEventListener("input", () => {
      // Folded so this behaves like the list screen's suggestions:
      // 「え」finds「エマール」.
      query = KN.util.foldKana(els.search.value);
      els.clear.hidden = !query;
      renderBody();
    });

    els.clear.addEventListener("click", () => {
      query = "";
      els.search.value = "";
      els.clear.hidden = true;
      renderBody();
    });

    els.newBtn.addEventListener("click", createProduct);

    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  async function createProduct() {
    const name = await KN.ui.prompt({
      title: "商品を追加",
      label: "商品名",
      placeholder: "例：食器用洗剤",
      okLabel: "追加",
    });
    if (!name) return;

    const existing = store.findProductByName(name);
    if (existing) {
      KN.ui.toast("すでに登録されています");
      KN.productSheet.open(existing.id);
      return;
    }
    const p = store.addProduct({ name, categoryId: store.guessCategory(name) });
    haptic(10);
    KN.productSheet.open(p.id);
  }

  function render() {
    const st = store.get();
    els.sub.textContent = `${st.products.length}商品 ・ ${st.stores.length}店舗`;
    renderFilter();
    renderBody();
  }

  function renderFilter() {
    els.filter.innerHTML = "";
    const counts = new Map();
    store.get().products.forEach((p) => {
      counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    });
    if (counts.size < 2) { categoryFilter = null; return; }
    if (categoryFilter && !counts.has(categoryFilter)) categoryFilter = null;

    const row = node(html`<div class="chip-row"></div>`);
    const all = node(html`<button type="button" class="chip" aria-pressed="${String(!categoryFilter)}">すべて</button>`);
    all.addEventListener("click", () => { categoryFilter = null; renderFilter(); renderBody(); });
    row.append(all);

    store.sortedCategories().filter((c) => counts.has(c.id)).forEach((c) => {
      const chip = node(html`
        <button type="button" class="chip" aria-pressed="${String(categoryFilter === c.id)}"
                style="--cat:${c.color || ""}">
          <span class="chip-emoji">${c.emoji}</span>${c.name}
          <span class="chip-count">${counts.get(c.id)}</span>
        </button>
      `);
      chip.addEventListener("click", () => {
        categoryFilter = categoryFilter === c.id ? null : c.id;
        haptic();
        renderFilter();
        renderBody();
      });
      row.append(chip);
    });

    els.filter.append(row);
  }

  function renderBody() {
    els.body.innerHTML = "";
    const all = store.get().products;

    if (!all.length) {
      els.body.append(node(html`
        <div class="empty">
          <div class="empty-art">🏷️</div>
          <h2 class="empty-title">商品がまだありません</h2>
          <p class="empty-text">
            買い物リストに追加した商品はここに自動で並びます。
            お店ごとの値段を登録すると、いちばん安いお店が分かります。
          </p>
        </div>
      `));
      return;
    }

    const matched = all
      .filter((p) => !categoryFilter || p.categoryId === categoryFilter)
      .filter((p) => !query || KN.util.foldKana(p.name).includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));

    if (!matched.length) {
      els.body.append(node(html`
        <p style="text-align:center;color:var(--c-text-3);padding:40px 16px">
          「${query}」に一致する商品はありません
        </p>
      `));
      return;
    }

    const list = node(html`<div class="product-list"></div>`);
    matched.forEach((p) => list.append(productCard(p)));
    els.body.append(list);
  }

  /** The item on the shopping list for this product, if it is on it. */
  const listedItem = (productId) => store.get().items.find((i) => i.productId === productId) || null;

  function productCard(product) {
    const prices = store.currentPrices(product);
    const best = prices[0] || null;
    const bestStore = best ? store.getStore(best.storeId) : null;
    const size = formatSize(product.amount, product.unit);
    const up = best ? perItemPrice(best.price, product.amount, product.unit) : null;
    const listed = listedItem(product.id);

    /* Two layers, like the rows on the list screen: the panel underneath is
       what the swipe uncovers, the card on top is what moves. */
    const wrap = node(html`
      <article class="product-wrap ${listed ? "is-there" : ""}" style="--cat:${store.productColor(product)}">
        <div class="product-hint">
          ${listed ? icon("check") : icon("plus")}<span>${listed ? "リストにあります" : "リストへ"}</span>
        </div>
      </article>
    `);

    const card = node(html`
      <div class="product ${listed ? "is-listed" : ""}">
        <button class="check js-pick" role="checkbox" aria-checked="${String(!!listed)}"
                aria-label="${product.name} を買うものリストに${listed ? "入れない" : "入れる"}">${icon("check")}</button>
        <span class="product-emoji" aria-hidden="true">${store.productMark(product)}</span>
        <button class="product-main js-open">
          <span class="product-name">${product.name}</span>
          <span class="product-meta">
            ${size ? html`<span class="badge badge-cat">${size}</span>` : ""}
            ${prices.length
              ? html`<span>${prices.length}店舗で比較中</span>`
              : html`<span style="color:var(--c-text-3)">値段は未登録</span>`}
            ${up ? html`<span style="color:var(--c-text-3)">${up.text}</span>` : ""}
          </span>
        </button>
        <span class="item-price">
          ${best && bestStore
            ? html`
                <span class="item-price-amount">${yen(best.price)}</span>
                <span class="item-price-store">🏆 ${bestStore.name}</span>
              `
            : html`<span class="item-price-none">—</span>`}
        </span>
      </div>
    `);
    wrap.append(card);

    card.querySelector(".js-open").addEventListener("click", () => KN.productSheet.open(product.id));
    card.querySelector(".js-pick").addEventListener("click", () => toggleListed(product));
    attachAddSwipe(wrap, card, product);
    return wrap;
  }

  /* The circle on the left says whether this product is on the shopping list,
     and puts it on or takes it off. Same control as the list screen's
     checkbox — there it means 買った, here it means 買う — so the two screens
     read the same way round: filled means "this one is in play". */
  function toggleListed(product) {
    const item = listedItem(product.id);
    haptic(12);
    if (!item) {
      store.addItem(product.id);
      KN.ui.toast(`「${product.name}」をリストに追加しました`);
      return;
    }
    const at = store.get().items.indexOf(item);
    store.update((s) => { s.items = s.items.filter((i) => i.id !== item.id); });
    KN.ui.toast(`「${product.name}」をリストから外しました`, {
      action: {
        label: "元に戻す",
        onClick: () => store.update((s) => {
          const next = s.items.slice();
          next.splice(Math.max(0, Math.min(at, next.length)), 0, item);
          s.items = next;
        }),
      },
    });
  }

  /* ---------------- swipe right to put it on the list ---------------- */

  /* Rightwards, and it springs straight back — nothing stays open, because
     there is no second step to confirm. The pull is deliberately heavy past
     the trigger so the card tells you when it has gone far enough. */
  function attachAddSwipe(wrap, card, product) {
    const TRIGGER = 68;
    const MAX = 104;
    const SLOP = 14;
    const DOMINANCE = 1.6;
    let startX = 0, startY = 0, dx = 0;
    let dragging = false, decided = false, pointerId = null, swallowClick = false;
    let armed = false, pending = null, rafId = 0;

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
      const mx = e.clientX - startX;
      const my = e.clientY - startY;

      if (!decided) {
        if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
        decided = true;
        dragging = mx >= SLOP && mx > Math.abs(my) * DOMINANCE;
        if (!dragging) return;
        card.setPointerCapture(pointerId);
        card.style.transition = "none";
        wrap.classList.add("is-swiping");
      }
      if (!dragging) return;

      // Past the trigger the card only creeps, so the finger feels the edge.
      dx = mx <= TRIGGER ? mx : TRIGGER + (mx - TRIGGER) * 0.32;
      dx = Math.min(MAX, dx);
      const nowArmed = dx >= TRIGGER;
      if (nowArmed !== armed) {
        armed = nowArmed;
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
      dragging = false;
      armed = false;
      swallowClick = true;
      // Let the card glide home before the store change rebuilds the list;
      // committing on the spot would swap it out mid-flight.
      setTimeout(() => {
        wrap.classList.remove("is-swiping", "is-armed");
        if (!fired) return;
        if (listedItem(product.id)) {
          KN.ui.toast(`「${product.name}」はもうリストにあります`);
          return;
        }
        store.addItem(product.id);
        haptic(14);
        KN.ui.toast(`「${product.name}」をリストに追加しました`);
      }, 200);
    };
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);

    // A pointer sequence still fires a click afterwards; left alone it would
    // open the product sheet at the end of every swipe.
    card.addEventListener("click", (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }

  KN.screens = KN.screens || {};
  KN.screens.prices = { mount, render };
})();
