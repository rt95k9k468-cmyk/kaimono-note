/* =========================================================
   くらしノート — products & prices screen
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, yen, perItemPrice, formatSize } = KN.util;
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
            ${/* 帰り道。価格はタブではなく、買うものの引き出しになりました
                  ——開いた画面へ帰します（設定の画面と同じ作法）。 */""}
            <button class="icon-btn js-back" aria-label="戻る" style="margin-left:-4px">
              ${icon("chevron", "is-back")}
            </button>
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">商品と価格</h1>
              <div class="topbar-sub js-sub"></div>
            </div>
            ${/* The ＋ is not up here any more — it is the same floating
                 button the list screen has, in the dock at the bottom
                 middle. Two screens that both add a thing should add it with
                 the same motion, and the corner of a top bar is the far end
                 of a phone from where the hand is.

                 右から 設定・並べ方・さがす。買うものの帯と同じ順です
                 （あちらの左端は「価格へ」、こちらの左端は「戻る」）。 */""}
            <button class="icon-btn js-search-btn" aria-label="商品名で探す">${icon("search")}</button>
            <button class="icon-btn js-layout"></button>
            <button class="icon-btn js-settings" aria-label="設定" title="設定">${icon("gear")}</button>
          </div>
        </header>

        ${/* Folded away until asked for. It used to sit open under the title on
              every visit, spending a row of the screen on a question asked
              once in a while. */""}
        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="商品名で探す" aria-label="商品名で探す"
                   autocomplete="off" spellcheck="false">
            <button class="icon-btn js-search-clear" aria-label="検索をクリア"
                    style="width:28px;height:28px" hidden>${icon("close")}</button>
          </div>
        </div>

        <div class="js-filter"></div>
        <div class="js-body"></div>
      </div>
    `);

    root.append(chrome);

    els = {
      sub:     chrome.querySelector(".js-sub"),

      searchBtn: chrome.querySelector(".js-search-btn"),
      screen:     root,
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search:  chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
      layout:  chrome.querySelector(".js-layout"),
      settings: chrome.querySelector(".js-settings"),
      filter:  chrome.querySelector(".js-filter"),
      body:    chrome.querySelector(".js-body"),
      topbar:  chrome.querySelector(".topbar"),
    };

    KN.ui.wireSearch(els, () => renderBody(), (q) => { query = q; });

    els.layout.addEventListener("click", KN.ui.toggleLayout);
    els.settings.addEventListener("click", () => KN.app.showScreen("settings"));
    chrome.querySelector(".js-back").addEventListener("click", () => KN.app.backScreen());

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
    KN.motion.fire("save");
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
        KN.motion.fire("select");
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
          <div class="empty-art">${KN.util.raw(KN.emptyArt.priceTag)}</div>
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
    /* カテゴリの中は、手で並べていればその順、まだなら五十音——ただし
       同じ絵のものは束ねます（「牛乳」と「低脂肪牛乳」が棚の端と端に
       離れない）。束ね方はカテゴリ単位なので、まずカテゴリで割ってから
       それぞれを並べ、あとで繋ぎ直します。 */
    const picked = all
      .filter((p) => !categoryFilter || p.categoryId === categoryFilter)
      .filter((p) => !query || KN.util.foldKana(p.name).includes(query));

    const byCat = new Map();
    picked.forEach((p) => {
      const k = order.has(p.categoryId) ? p.categoryId : "\u0000other";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k).push(p);
    });
    const shown = [...byCat.keys()]
      .sort((a, b) => (order.has(a) ? order.get(a) : order.size)
                    - (order.has(b) ? order.get(b) : order.size))
      .flatMap((k) => store.sortProductsInCategory(byCat.get(k)));

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
      /* カテゴリごとに、別々の入れ物に分けます。見出しは付けません——
         買うものの画面と同じで、どの仲間かはカードの左端の色が言います。
         分ける理由は見た目ではなく、**持ち上げて動かせる範囲** をここで
         区切るためです。別のカテゴリへ運べてしまうと、運んだだけで
         商品の仲間分けが黙って変わることになります。 */
      const tiles = KN.ui.isTiles();

      /* タイルのときは、今までどおり一枚の格子です。三つ並びの格子を
         カテゴリで割ると、二つしかない仲間のうしろに穴が空き、次の仲間が
         新しい行から始まります。割る理由は並べ替えの範囲を区切ることに
         あって、タイルは並べ替えないので、割る理由がありません。 */
      if (tiles) {
        const list = node(html`<div class="product-list is-tiles"></div>`);
        matched.forEach((p) => list.append(productCard(p)));
        els.body.append(list);
        if (archived.length) els.body.append(archiveSection(archived));
        return;
      }

      const groups = new Map();
      matched.forEach((p) => {
        const key = order.has(p.categoryId) ? p.categoryId : "__other";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
      });
      groups.forEach((rows, key) => {
        const cat = store.getCategory(key);
        const group = node(html`
          <section class="cat-group" style="--cat:${(cat && cat.color) || ""}">
            <div class="product-list"></div>
          </section>
        `);
        const listEl = group.querySelector(".product-list");
        rows.forEach((p) => listEl.append(productCard(p)));
        wireReorder(listEl);
        els.body.append(group);
      });
    }

    if (archived.length) els.body.append(archiveSection(archived));
  }

  /* 長押しで持ち上げて、同じカテゴリの中で場所を入れ替えます。

     並べ替えられるのは **同じカテゴリの中だけ** です。カテゴリをまたいで
     運べてしまうと、運んだこと自体が「この商品は野菜ではなく飲みものだ」
     という宣言になってしまう——それは持ち上げる動きが意味していることでは
     ありません（仲間分けは商品の画面で変えます）。

     タイルのときは並べ替えません。買うものの画面と同じ約束で、正方形が
     三つ並んだ格子は、行のように「上下に差し込む」場所が読めないので。 */
  function wireReorder(listEl) {
    if (KN.ui.isTiles()) return;
    KN.reorder.attach(listEl, {
      item: ".product-wrap",
      onDrop: (from, to) => {
        const ids = Array.prototype.map.call(listEl.children, (w) => w.dataset.productId);
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        const first = store.reorderProducts(ids);
        KN.motion.fire("save");
        // 初めてその棚に手を入れたときだけ、これから何が起きるかを言います。
        if (first) KN.ui.toast("この並びで覚えました（あとから増えた商品は後ろに付きます）");
      },
    });
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
      // Newest first, and each card says when — the same as the list screen's
      // archive. Products archived before there was a date to record keep
      // their place at the end and simply say nothing.
      list.slice()
        .sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")))
        .forEach((p) => box.append(productCard(p)));
      section.querySelector(".js-body").append(box);
    }

    section.querySelector(".js-toggle").addEventListener("click", () => {
      KN.motion.fire("select");
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
               data-product-id="${product.id}"
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
          ${best && bestStore ? html`<span class="tile-store"><span class="crown" aria-label="いちばん安い">${icon("crown", "is-sub")}</span>${bestStore.name}</span>` : ""}
          ${product.archived && product.archivedAt
            ? html`<span class="tile-when">${KN.util.formatStamp(product.archivedAt)}</span>` : ""}
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
          ${size || up || (product.archived && product.archivedAt) ? html`
            <span class="product-meta">
              ${product.archived && product.archivedAt
                ? html`<span class="item-when">${KN.util.formatStamp(product.archivedAt)}</span>` : ""}
              ${size ? html`<span class="badge badge-cat">${size}</span>` : ""}
              ${up ? html`<span>${up.text}</span>` : ""}
            </span>
          ` : ""}
        </button>
        <span class="item-price">
          ${best && bestStore
            ? html`
                <span class="item-price-amount">${yen(best.price)}</span>
                <span class="item-price-store"><span class="crown" aria-label="いちばん安い">${icon("crown", "is-sub")}</span>${bestStore.name}</span>
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
    KN.motion.fire("delete");
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
    KN.motion.fire("delete");
    const undo = store.setArchived(product.id, to);
    const said = to
      ? (wasListed ? `「${product.name}」をアーカイブし、リストから外しました`
                   : `「${product.name}」をアーカイブしました`)
      : `「${product.name}」を戻しました`;
    KN.ui.toast(said, { action: { label: "元に戻す", onClick: undo } });
  }

  /** The ＋ the shell floats over this screen — the list screen's, in kind. */
  function dockButton() {
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-new" aria-label="商品を追加">${icon("plus")}</button>
      </div>
    `);
    fab.querySelector(".js-new").addEventListener("click", createProduct);
    return fab;
  }

  KN.screens = KN.screens || {};
  KN.screens.prices = { mount, render, dockButton };
})();
