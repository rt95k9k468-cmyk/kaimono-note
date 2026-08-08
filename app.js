(() => {
  const STORAGE_KEY = "kaimono-note-v1";

  /** @type {{products: Array<{id:string,name:string,category:string,prices:Array<{id:string,store:string,price:number,date:string}>}>, listItems: Array<{id:string,productId:string,qty:number,memo:string,checked:boolean,addedAt:string}>}} */
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("failed to load state", e);
    }
    return { products: [], listItems: [] };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
  }

  function normalizeName(name) {
    return name.trim();
  }

  function findProductByName(name) {
    const norm = normalizeName(name).toLowerCase();
    return state.products.find(p => p.name.toLowerCase() === norm);
  }

  function findOrCreateProduct(name, category = "") {
    const cleanName = normalizeName(name);
    let product = findProductByName(cleanName);
    if (!product) {
      product = { id: uid(), name: cleanName, category: category.trim(), prices: [] };
      state.products.push(product);
    } else if (category.trim()) {
      product.category = category.trim();
    }
    return product;
  }

  const UNCATEGORIZED = "その他";

  function categoryLabel(product) {
    return product.category || UNCATEGORIZED;
  }

  function allCategories() {
    return [...new Set(state.products.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  }

  function getProduct(id) {
    return state.products.find(p => p.id === id);
  }

  function bestPrice(product) {
    if (!product || product.prices.length === 0) return null;
    return product.prices.reduce((min, p) => (p.price < min.price ? p : min), product.prices[0]);
  }

  function formatYen(n) {
    return "¥" + Number(n).toLocaleString("ja-JP");
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  // ---------- Tabs ----------
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // ---------- Shopping list ----------
  const shoppingListEl = document.getElementById("shopping-list");
  const listEmptyEl = document.getElementById("list-empty");
  const listSummaryEl = document.getElementById("list-summary");
  const addItemForm = document.getElementById("add-item-form");
  const itemNameInput = document.getElementById("item-name");
  const itemCategoryInput = document.getElementById("item-category");
  const itemQtyInput = document.getElementById("item-qty");
  const itemMemoInput = document.getElementById("item-memo");
  const productNamesDatalist = document.getElementById("product-names");
  const categoryFilterEl = document.getElementById("category-filter");
  const categoryNamesDatalist = document.getElementById("category-names");

  const expandedItems = new Set();
  let activeCategoryFilter = null;

  addItemForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = itemNameInput.value;
    if (!normalizeName(name)) return;
    const qty = Math.max(1, parseInt(itemQtyInput.value, 10) || 1);
    const memo = itemMemoInput.value.trim();
    const product = findOrCreateProduct(name, itemCategoryInput.value);
    state.listItems.unshift({
      id: uid(),
      productId: product.id,
      qty,
      memo,
      checked: false,
      addedAt: new Date().toISOString(),
    });
    saveState();
    addItemForm.reset();
    itemQtyInput.value = 1;
    itemNameInput.focus();
    renderAll();
  });

  document.getElementById("clear-checked").addEventListener("click", () => {
    state.listItems = state.listItems.filter(i => !i.checked);
    saveState();
    renderAll();
  });

  function renderCategoryFilter() {
    const present = new Map(); // label -> count
    state.listItems.forEach(item => {
      const product = getProduct(item.productId);
      if (!product) return;
      const label = categoryLabel(product);
      present.set(label, (present.get(label) || 0) + 1);
    });

    if (present.size === 0) {
      categoryFilterEl.innerHTML = "";
      return;
    }
    if (activeCategoryFilter && !present.has(activeCategoryFilter)) {
      activeCategoryFilter = null;
    }

    const labels = [...present.keys()].sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "ja");
    });

    const chips = [`<button type="button" class="category-chip${activeCategoryFilter ? "" : " active"}" data-category="">すべて</button>`]
      .concat(labels.map(label => `<button type="button" class="category-chip${activeCategoryFilter === label ? " active" : ""}" data-category="${escapeHtml(label)}">${escapeHtml(label)} (${present.get(label)})</button>`));

    categoryFilterEl.innerHTML = chips.join("");
    categoryFilterEl.querySelectorAll(".category-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        activeCategoryFilter = btn.dataset.category || null;
        renderShoppingList();
      });
    });
  }

  function buildItemCard(item, product) {
    const li = document.createElement("li");
    li.className = "item-card" + (item.checked ? " item-checked" : "");

    const best = bestPrice(product);

    li.innerHTML = `
      <div class="item-row">
        <input type="checkbox" class="item-check" ${item.checked ? "checked" : ""} title="購入済みにする">
        <div class="item-main">
          <div class="item-name">${escapeHtml(product.name)} <span style="font-weight:400;color:var(--text-muted);font-size:0.85rem;">× ${item.qty}</span></div>
          ${item.memo ? `<div class="item-meta">📝 ${escapeHtml(item.memo)}</div>` : ""}
          ${best
            ? `<div class="best-price-badge">🏆 ${escapeHtml(best.store)} ${formatYen(best.price)} が最安</div>`
            : `<div class="no-price-hint">価格情報なし・タップして登録できます</div>`}
        </div>
        <div class="item-actions">
          <button class="icon-btn expand-btn" title="価格を見る/登録">💰</button>
          <button class="icon-btn delete-item-btn" title="削除">🗑️</button>
        </div>
      </div>
      <div class="item-detail ${expandedItems.has(item.id) ? "open" : ""}">
        <ul class="price-list"></ul>
        <form class="add-price-form">
          <input type="text" class="price-store-input" placeholder="店名" required>
          <input type="number" class="price-amount-input" placeholder="価格" min="0" required>
          <button type="submit">登録</button>
        </form>
      </div>
    `;

    li.querySelector(".item-check").addEventListener("change", (e) => {
      item.checked = e.target.checked;
      saveState();
      renderShoppingList();
    });

    li.querySelector(".delete-item-btn").addEventListener("click", () => {
      state.listItems = state.listItems.filter(i => i.id !== item.id);
      saveState();
      renderAll();
    });

    const detail = li.querySelector(".item-detail");
    li.querySelector(".expand-btn").addEventListener("click", () => {
      if (expandedItems.has(item.id)) {
        expandedItems.delete(item.id);
      } else {
        expandedItems.add(item.id);
      }
      detail.classList.toggle("open");
    });

    renderPriceList(li.querySelector(".price-list"), product);

    li.querySelector(".add-price-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const storeInput = li.querySelector(".price-store-input");
      const amountInput = li.querySelector(".price-amount-input");
      const store = storeInput.value.trim();
      const price = parseFloat(amountInput.value);
      if (!store || isNaN(price)) return;
      product.prices.push({ id: uid(), store, price, date: new Date().toISOString() });
      saveState();
      expandedItems.add(item.id);
      renderAll();
    });

    return li;
  }

  function renderShoppingList() {
    renderCategoryFilter();
    shoppingListEl.innerHTML = "";
    const items = state.listItems;
    listEmptyEl.classList.toggle("show", items.length === 0);

    const total = items.length;
    const done = items.filter(i => i.checked).length;
    listSummaryEl.textContent = total ? `${done} / ${total} 購入済み` : "";

    const groups = new Map(); // label -> {items: []}
    items.forEach(item => {
      const product = getProduct(item.productId);
      if (!product) return;
      const label = categoryLabel(product);
      if (activeCategoryFilter && label !== activeCategoryFilter) return;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ item, product });
    });

    const labels = [...groups.keys()].sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "ja");
    });

    labels.forEach(label => {
      const entries = groups.get(label);
      const groupEl = document.createElement("div");
      groupEl.className = "category-group";
      groupEl.innerHTML = `<h3 class="category-heading">🏷️ ${escapeHtml(label)} <span class="category-count">${entries.length}</span></h3>`;
      const ul = document.createElement("ul");
      ul.className = "category-items";
      entries.forEach(({ item, product }) => ul.appendChild(buildItemCard(item, product)));
      groupEl.appendChild(ul);
      shoppingListEl.appendChild(groupEl);
    });
  }

  function renderPriceList(ulEl, product) {
    ulEl.innerHTML = "";
    if (product.prices.length === 0) {
      const li = document.createElement("li");
      li.className = "price-row";
      li.textContent = "まだ価格が登録されていません";
      ulEl.appendChild(li);
      return;
    }
    const best = bestPrice(product);
    const sorted = [...product.prices].sort((a, b) => a.price - b.price);
    sorted.forEach(p => {
      const li = document.createElement("li");
      li.className = "price-row" + (p.id === best.id ? " best" : "");
      li.innerHTML = `
        <span class="price-store">${p.id === best.id ? "🏆 " : ""}${escapeHtml(p.store)}</span>
        <span class="price-amount">${formatYen(p.price)}</span>
        <span class="price-date">${formatDate(p.date)}</span>
        <button class="icon-btn delete-price-btn" title="削除">✕</button>
      `;
      li.querySelector(".delete-price-btn").addEventListener("click", () => {
        product.prices = product.prices.filter(x => x.id !== p.id);
        saveState();
        renderAll();
      });
      ulEl.appendChild(li);
    });
  }

  // ---------- Products / price comparison tab ----------
  const productListEl = document.getElementById("product-list");
  const productEmptyEl = document.getElementById("product-empty");
  const addProductForm = document.getElementById("add-product-form");
  const productNameInput = document.getElementById("product-name-input");
  const productCategoryInput = document.getElementById("product-category-input");
  const productSearchInput = document.getElementById("product-search");

  const expandedProducts = new Set();

  addProductForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = productNameInput.value;
    if (!normalizeName(name)) return;
    findOrCreateProduct(name, productCategoryInput.value);
    saveState();
    addProductForm.reset();
    renderAll();
  });

  productSearchInput.addEventListener("input", renderProductList);

  function renderProductList() {
    productListEl.innerHTML = "";
    const query = productSearchInput.value.trim().toLowerCase();
    const products = state.products
      .filter(p => p.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));

    productEmptyEl.classList.toggle("show", products.length === 0);

    products.forEach(product => {
      const li = document.createElement("li");
      li.className = "product-card";
      const best = bestPrice(product);

      li.innerHTML = `
        <div class="product-card-header">
          <div>
            <div class="product-name">${escapeHtml(product.name)}</div>
            ${product.category ? `<span class="product-category">${escapeHtml(product.category)}</span>` : ""}
            ${best ? `<div class="best-price-badge">🏆 ${escapeHtml(best.store)} ${formatYen(best.price)} が最安</div>` : ""}
          </div>
          <div class="item-actions">
            <button class="icon-btn expand-btn" title="価格を見る/登録">💰</button>
            <button class="icon-btn delete-product-btn" title="商品を削除">🗑️</button>
          </div>
        </div>
        <div class="item-detail ${expandedProducts.has(product.id) ? "open" : ""}">
          <ul class="price-list"></ul>
          <form class="add-price-form">
            <input type="text" class="price-store-input" placeholder="店名" required>
            <input type="number" class="price-amount-input" placeholder="価格" min="0" required>
            <button type="submit">登録</button>
          </form>
        </div>
      `;

      const detail = li.querySelector(".item-detail");
      li.querySelector(".expand-btn").addEventListener("click", () => {
        if (expandedProducts.has(product.id)) {
          expandedProducts.delete(product.id);
        } else {
          expandedProducts.add(product.id);
        }
        detail.classList.toggle("open");
      });

      li.querySelector(".delete-product-btn").addEventListener("click", () => {
        if (!confirm(`「${product.name}」を削除しますか？関連する買い物リストの項目も削除されます。`)) return;
        state.products = state.products.filter(p => p.id !== product.id);
        state.listItems = state.listItems.filter(i => i.productId !== product.id);
        saveState();
        renderAll();
      });

      renderPriceList(li.querySelector(".price-list"), product);

      li.querySelector(".add-price-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const storeInput = li.querySelector(".price-store-input");
        const amountInput = li.querySelector(".price-amount-input");
        const store = storeInput.value.trim();
        const price = parseFloat(amountInput.value);
        if (!store || isNaN(price)) return;
        product.prices.push({ id: uid(), store, price, date: new Date().toISOString() });
        saveState();
        expandedProducts.add(product.id);
        renderAll();
      });

      productListEl.appendChild(li);
    });
  }

  function renderProductDatalist() {
    productNamesDatalist.innerHTML = state.products
      .map(p => `<option value="${escapeHtml(p.name)}">`)
      .join("");
    categoryNamesDatalist.innerHTML = allCategories()
      .map(c => `<option value="${escapeHtml(c)}">`)
      .join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderAll() {
    renderShoppingList();
    renderProductList();
    renderProductDatalist();
  }

  renderAll();
})();
