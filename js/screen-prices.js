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
            <button class="icon-btn js-layout"></button>
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
      layout:  chrome.querySelector(".js-layout"),
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
    els.layout.addEventListener("click", KN.ui.toggleLayout);

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
    KN.ui.paintLayoutButton(els.layout);
    renderFilter();
    renderBody();
  }

  function renderFilter() {
    const counts = new Map();
    // Archived products are out of the way, so they are out of the counts too:
    // a chip saying 「調味料 8」 over a list of three is just wrong.
    store.get().products.filter((p) => !p.archived).forEach((p) => {
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
        renderFilter();
        renderBody();
      },
    });
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

    /* Same order as the aisles: categories in the order they are set to, and
       within one, 五十音順. Folded first so かな and カナ and ｶﾅ sort as the
       same letters — 「ｷｭｳﾘ」 belongs next to 「きゅうり」, not off in a
       corner of the code chart. Names that start with a kanji land after the
       kana together, in a stable order: nothing here knows how 「牛乳」 is
       read, and guessing would be worse than being consistent. */
    const order = new Map(store.sortedCategories().map((c, i) => [c.id, i]));
    const rank = (p) => (order.has(p.categoryId) ? order.get(p.categoryId) : order.size);
    const shown = all
      .filter((p) => !categoryFilter || p.categoryId === categoryFilter)
      .filter((p) => !query || KN.util.foldKana(p.name).includes(query))
      .sort((a, b) => rank(a) - rank(b)
        || KN.util.foldKana(a.name).localeCompare(KN.util.foldKana(b.name), "ja"));

    const matched = shown.filter((p) => !p.archived);
    const archived = shown.filter((p) => p.archived);

    if (!matched.length && !archived.length) {
      els.body.append(node(html`
        <p style="text-align:center;color:var(--c-text-3);padding:40px 16px">
          「${query}」に一致する商品はありません
        </p>
      `));
      return;
    }

    if (matched.length) {
      const list = node(html`<div class="product-list ${KN.ui.isTiles() ? "is-tiles" : ""}"></div>`);
      matched.forEach((p) => list.append(productCard(p)));
      els.body.append(list);
    }

    if (archived.length) els.body.append(archiveSection(archived));
  }

  /* ---------------- archive ---------------- */

  /* Things bought once a year still have prices worth keeping, and they still
     get in the way of the ten things bought every week. Archived is neither
     deleted nor listed: the records stay, the card moves to the bottom, and
     the same swipe brings it back.

     Left open or shut as it was last time, except while searching — a name
     typed into the box is a question, and answering it with a closed drawer
     that happens to contain the answer would be a poor joke. */
  function archiveSection(list) {
    const open = query ? true : store.get().settings.showArchived === true;

    const section = node(html`
      <section class="archive ${open ? "is-open" : ""}">
        <button class="archive-head js-toggle" aria-expanded="${String(open)}">
          ${icon("chevron")}
          <span>アーカイブ</span>
          <span class="cat-head-count">${String(list.length)}</span>
        </button>
        <div class="archive-body js-body" ${open ? "" : KN.util.raw("hidden")}></div>
      </section>
    `);

    if (open) {
      const box = node(html`<div class="product-list ${KN.ui.isTiles() ? "is-tiles" : ""}"></div>`);
      list.forEach((p) => box.append(productCard(p)));
      section.querySelector(".js-body").append(box);
    }

    section.querySelector(".js-toggle").addEventListener("click", () => {
      haptic();
      store.update((s) => { s.settings.showArchived = !open; });
    });

    return section;
  }

  /** The item on the shopping list for this product, if it is on it. */
  const listedItem = (productId) => store.get().items.find((i) => i.productId === productId) || null;

  /* …and only while it is still something to buy. A row that has been ticked
     off is done: it stays on the list screen under 「購入済み」 until it is
     cleared, but it is no longer a thing to pick up, and the painted edge over
     here means exactly that. Leaving it painted told you to buy what was
     already in the basket. (The list screen has always read it this way —
     「今回買うもの」 counts only the unticked.) */
  const buying = (productId) => {
    const item = listedItem(productId);
    return item && !item.checked ? item : null;
  };

  function productCard(product) {
    const prices = store.currentPrices(product);
    const best = prices[0] || null;
    const bestStore = best ? store.getStore(best.storeId) : null;
    const size = formatSize(product.amount, product.unit);
    const up = best ? perItemPrice(best.price, product.amount, product.unit) : null;
    const listed = buying(product.id);
    const tiles = KN.ui.isTiles();

    /* Two layers, like the rows on the list screen: the panels underneath are
       what a swipe uncovers, the card on top is what moves. Right is the
       shopping list, left is the archive — opposite directions for opposite
       kinds of "put this somewhere else".

       Tiles swipe too, on a shorter throw. There is no room for the wording on
       a third of a screen, so the tile panels are the icons alone. */
    const wrap = node(html`
      <article class="product-wrap ${listed ? "is-there" : ""} ${tiles ? "is-tile-wrap" : ""}"
               style="--cat:${store.productColor(product)}">
        <div class="swipe-yes">
          ${listed ? icon("minus") : icon("plus")}<span>${listed ? "リストから外す" : "リストへ"}</span>
        </div>
        <div class="swipe-arch">
          <span>${product.archived ? "戻す" : "アーカイブ"}</span>${icon(product.archived ? "undo" : "download")}
        </div>
      </article>
    `);

    /* Being on the shopping list is shown by painting the card's left edge,
       not by a control. A checkbox here looked exactly like the list screen's
       「買った」 checkbox one tab over, and the two mean opposite things —
       so this one stopped being a button and became a mark. Putting it on
       or taking it off is the swipe's job. */
    const card = tiles ? node(html`
      <div class="product is-tile ${listed ? "is-listed" : ""}">
        <button class="product-main js-open">
          <span class="product-emoji" aria-hidden="true">${store.productMark(product)}</span>
          <span class="product-name">${product.name}</span>
          ${listed ? html`<span class="sr-only">買うものリストに入っています</span>` : ""}
          <span class="tile-price">${best ? yen(best.price) : "—"}</span>
          ${/* A price with no shop attached is half an answer — which shop it
                was is the whole reason the figure was written down. Under the
                figure rather than beside it: a third of a screen has no
                beside. */""}
          ${best && bestStore ? html`<span class="tile-store">🏆 ${bestStore.name}</span>` : ""}
        </button>
      </div>
    `) : node(html`
      <div class="product ${listed ? "is-listed" : ""}">
        <span class="product-emoji" aria-hidden="true">${store.productMark(product)}</span>
        <button class="product-main js-open">
          <span class="product-name">${product.name}</span>
          ${listed ? html`<span class="sr-only">買うものリストに入っています</span>` : ""}
          ${/* Only facts about the product itself. 「3店舗で比較中」 counted the
                app's own records rather than saying anything about the thing on
                the shelf, and 「値段は未登録」 repeated the — already sitting in
                the price column. What is left is the name, in the size of the
                thing the row is for. */""}
          ${size || up ? html`
            <span class="product-meta">
              ${size ? html`<span class="badge badge-cat">${size}</span>` : ""}
              ${up ? html`<span>${up.text}</span>` : ""}
            </span>
          ` : ""}
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
    KN.ui.swipeActions(wrap, card, {
      tiles,
      onRight: () => toggleListed(product),
      onLeft: () => toggleArchived(product),
    });
    return wrap;
  }

  /** Put this product on the shopping list, or take it off. */
  function toggleListed(product) {
    const item = listedItem(product.id);
    haptic(14);
    if (!item) {
      store.addItem(product.id);
      KN.ui.toast(`「${product.name}」をリストに追加しました`);
      return;
    }
    /* Already bought this trip. The swipe says 「リストへ」 because that is
       what the card looks like — unpainted — so it has to mean it: the tick
       comes off and the row goes back to being something to buy, rather than
       deleting a row the eye says is not there. */
    if (item.checked) {
      store.update((s) => {
        const rec = s.items.find((i) => i.id === item.id);
        if (rec) rec.checked = false;
      });
      KN.ui.toast(`「${product.name}」をまた買うものに戻しました`, {
        action: {
          label: "元に戻す",
          onClick: () => store.update((s) => {
            const rec = s.items.find((i) => i.id === item.id);
            if (rec) rec.checked = true;
          }),
        },
      });
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

  /** Put this product out of the way, or bring it back. */
  function toggleArchived(product) {
    const to = !product.archived;
    // Said out loud when it happens, because the row on the other tab
    // disappearing without a word would look like a bug.
    const wasListed = to && !!listedItem(product.id);
    haptic(14);
    const undo = store.setArchived(product.id, to);
    const said = to
      ? (wasListed ? `「${product.name}」をアーカイブし、リストから外しました`
                   : `「${product.name}」をアーカイブしました`)
      : `「${product.name}」を戻しました`;
    KN.ui.toast(said, { action: { label: "元に戻す", onClick: undo } });
  }

  KN.screens = KN.screens || {};
  KN.screens.prices = { mount, render };
})();
