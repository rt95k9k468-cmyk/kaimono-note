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

        <div class="progress-wrap js-progress-wrap" hidden>
          <div class="progress"><div class="progress-bar js-progress" style="width:0%"></div></div>
        </div>

        <div class="js-filter"></div>
        <div class="js-body"></div>
      </div>
    `);

    root.append(chrome);

    els = {
      sub:        chrome.querySelector(".js-sub"),
      clear:      chrome.querySelector(".js-clear"),
      form:       chrome.querySelector(".js-form"),
      input:      chrome.querySelector(".js-input"),
      addBtn:     chrome.querySelector(".js-add"),
      ac:         chrome.querySelector(".js-ac"),
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
    const q = els.input.value.trim().toLowerCase();
    els.ac.innerHTML = "";
    acIndex = -1;
    acMatches = [];
    if (!q) return;

    const onList = new Set(store.get().items.map((i) => i.productId));
    const found = store.get().products
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name, "ja");
      })
      .slice(0, 6);

    const exact = store.findProductByName(q);
    acMatches = found.map((p) => ({ product: p }));
    if (!exact) acMatches.push({ product: null, name: els.input.value.trim() });
    if (!acMatches.length) return;

    const box = node(html`<div class="ac" role="listbox"></div>`);

    acMatches.forEach((m, idx) => {
      let row;
      if (m.product) {
        const cat = store.getCategory(m.product.categoryId);
        const best = store.bestPrice(m.product);
        const bestStore = best ? store.getStore(best.storeId) : null;
        row = node(html`
          <button type="button" class="ac-item" role="option" data-idx="${String(idx)}">
            <span class="ac-emoji">${cat.emoji}</span>
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

    els.ac.append(box);
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
    const done = items.filter((i) => i.checked).length;

    els.sub.textContent = items.length
      ? `${items.length}件 ・ ${done}件購入済み`
      : "リストは空です";

    els.progWrap.hidden = items.length === 0;
    els.progress.style.width = items.length ? `${(done / items.length) * 100}%` : "0%";

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
    els.body.innerHTML = "";

    if (!items.length) {
      els.body.append(emptyState());
      return;
    }

    const active = items.filter((i) => !i.checked);
    const checked = items.filter((i) => i.checked);

    // group active items by category
    const groups = new Map();
    active.forEach((item) => {
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
      const list = group.querySelector(".item-list");
      entries.forEach(({ item, product }) => list.append(itemRow(item, product)));
      els.body.append(group);
    });

    if (!groups.size && categoryFilter) {
      els.body.append(node(html`
        <p style="text-align:center;color:var(--c-text-3);padding:32px 16px">
          このカテゴリに未購入の商品はありません
        </p>
      `));
    }

    if (checked.length) els.body.append(checkedSection(checked));
    els.body.append(summaryCard(active));
  }

  function itemRow(item, product) {
    const best = store.bestPrice(product);
    const bestStore = best ? store.getStore(best.storeId) : null;

    const row = node(html`
      <article class="item ${item.checked ? "is-checked" : ""}">
        <button class="check" role="checkbox" aria-checked="${String(item.checked)}"
                aria-label="${product.name} を購入済みにする">${icon("check")}</button>
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
      </article>
    `);

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

    row.querySelector(".item-body").addEventListener("click", () => {
      KN.productSheet.open(product.id, { itemId: item.id });
    });

    return row;
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

  function summaryCard(active) {
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
      <div class="list-summary">
        <div class="summary-row">
          <span class="summary-label">最安値で買うと</span>
          <span class="summary-total">${total > 0 ? yen(total) : "—"}</span>
        </div>
        <p class="summary-note">
          ${unknown > 0
            ? html`${unknown}品は値段が未登録です。商品をタップして登録すると合計に反映されます。`
            : html`未購入 ${active.length}品を、それぞれいちばん安いお店で買った場合の合計です。`}
        </p>
      </div>
    `);
  }

  function emptyState() {
    const wrap = node(html`
      <div class="empty">
        <div class="empty-art">🛒</div>
        <h2 class="empty-title">買うものを追加しましょう</h2>
        <p class="empty-text">
          上の欄に商品名を入れるだけ。カテゴリは自動で振り分けられ、
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
