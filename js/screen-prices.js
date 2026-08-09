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

  function productCard(product) {
    const cat = store.getCategory(product.categoryId);
    const prices = store.currentPrices(product);
    const best = prices[0] || null;
    const bestStore = best ? store.getStore(best.storeId) : null;
    const size = formatSize(product.amount, product.unit);
    const up = best ? perItemPrice(best.price, product.amount, product.unit) : null;

    const card = node(html`
      <button class="product" style="--cat:${store.productColor(product)}">
        <span class="product-emoji">${store.productMark(product)}</span>
        <span class="product-main">
          <span class="product-name">${product.name}</span>
          <span class="product-meta">
            ${size ? html`<span class="badge badge-cat">${size}</span>` : ""}
            ${prices.length
              ? html`<span>${prices.length}店舗で比較中</span>`
              : html`<span style="color:var(--c-text-3)">値段は未登録</span>`}
            ${up ? html`<span style="color:var(--c-text-3)">${up.text}</span>` : ""}
          </span>
        </span>
        <span class="item-price">
          ${best && bestStore
            ? html`
                <span class="item-price-amount">${yen(best.price)}</span>
                <span class="item-price-store">🏆 ${bestStore.name}</span>
              `
            : html`<span class="item-price-none">—</span>`}
        </span>
      </button>
    `);

    card.addEventListener("click", () => KN.productSheet.open(product.id));
    return card;
  }

  KN.screens = KN.screens || {};
  KN.screens.prices = { mount, render };
})();
