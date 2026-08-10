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
      const list = node(html`<div class="product-list"></div>`);
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
      const box = node(html`<div class="product-list"></div>`);
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

  function productCard(product) {
    const prices = store.currentPrices(product);
    const best = prices[0] || null;
    const bestStore = best ? store.getStore(best.storeId) : null;
    const size = formatSize(product.amount, product.unit);
    const up = best ? perItemPrice(best.price, product.amount, product.unit) : null;
    const listed = listedItem(product.id);

    /* Two layers, like the rows on the list screen: the panels underneath are
       what a swipe uncovers, the card on top is what moves. Right is the
       shopping list, left is the archive — opposite directions for opposite
       kinds of "put this somewhere else". */
    const wrap = node(html`
      <article class="product-wrap ${listed ? "is-there" : ""}" style="--cat:${store.productColor(product)}">
        <div class="product-hint">
          ${listed ? icon("minus") : icon("plus")}<span>${listed ? "リストから外す" : "リストへ"}</span>
        </div>
        <div class="product-hint product-hint-archive">
          <span>${product.archived ? "戻す" : "アーカイブ"}</span>${icon(product.archived ? "undo" : "download")}
        </div>
      </article>
    `);

    /* Being on the shopping list is shown by painting the card's left edge,
       not by a control. A checkbox here looked exactly like the list screen's
       「買った」 checkbox one tab over, and the two mean opposite things —
       so this one stopped being a button and became a mark. Putting it on
       or taking it off is the swipe's job. */
    const card = node(html`
      <div class="product ${listed ? "is-listed" : ""}">
        <span class="product-emoji" aria-hidden="true">${store.productMark(product)}</span>
        <button class="product-main js-open">
          <span class="product-name">${product.name}</span>
          ${listed ? html`<span class="sr-only">買うものリストに入っています</span>` : ""}
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
    attachListSwipe(wrap, card, product);
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
    haptic(14);
    store.update((s) => {
      const rec = s.products.find((x) => x.id === product.id);
      if (rec) rec.archived = to;
    });
    KN.ui.toast(to ? `「${product.name}」をアーカイブしました` : `「${product.name}」を戻しました`, {
      action: {
        label: "元に戻す",
        onClick: () => store.update((s) => {
          const rec = s.products.find((x) => x.id === product.id);
          if (rec) rec.archived = !to;
        }),
      },
    });
  }

  /* ---------------- swipe: right for the list, left for the archive ---------------- */

  /* Either way it springs straight back — nothing stays open, because there
     is no second step to confirm. The pull is deliberately heavy past the
     trigger so the card tells you when it has gone far enough. Both swipes
     undo themselves: on a product already listed the right one takes it off,
     and on an archived one the left one brings it back — which is what the
     panel underneath says it will do. */
  function attachListSwipe(wrap, card, product) {
    const TRIGGER = 68;
    const MAX = 104;
    const SLOP = 14;
    const DOMINANCE = 1.6;
    let startX = 0, startY = 0, dx = 0, dir = 1;
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
        dragging = Math.abs(mx) >= SLOP && Math.abs(mx) > Math.abs(my) * DOMINANCE;
        if (!dragging) return;
        dir = mx > 0 ? 1 : -1;
        card.setPointerCapture(pointerId);
        card.style.transition = "none";
        wrap.classList.add("is-swiping", dir > 0 ? "is-right" : "is-left");
      }
      if (!dragging) return;

      // Past the trigger the card only creeps, so the finger feels the edge.
      const travel = mx * dir;
      dx = dir * Math.min(MAX, travel <= TRIGGER ? Math.max(0, travel)
        : TRIGGER + (travel - TRIGGER) * 0.32);
      const nowArmed = Math.abs(dx) >= TRIGGER;
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
      const way = dir;
      dragging = false;
      armed = false;
      swallowClick = true;
      // Let the card glide home before the store change rebuilds the list;
      // committing on the spot would swap it out mid-flight.
      setTimeout(() => {
        wrap.classList.remove("is-swiping", "is-armed", "is-left", "is-right");
        if (!fired) return;
        if (way > 0) toggleListed(product);
        else toggleArchived(product);
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
