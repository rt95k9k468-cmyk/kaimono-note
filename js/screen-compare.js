/* =========================================================
   かいものノート — store comparison screen
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, yen } = KN.util;
  const store = KN.store;

  let root = null;
  let els = {};

  function mount(el) {
    root = el;
    root.innerHTML = "";

    const chrome = node(html`
      <div class="stack">
        ${/* No tab of its own any more — comparing shops is something done a
              few times while deciding where to go, not a place to live in. It
              opens from the shop button on リスト and 価格, and carries its
              own way back to whichever of them asked for it. */""}
        <header class="topbar">
          <div class="topbar-row">
            <button class="icon-btn js-back" aria-label="戻る" style="margin-left:-4px">
              ${icon("chevron", "flip-x")}
            </button>
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">お店くらべ</h1>
              <div class="topbar-sub js-sub"></div>
            </div>
          </div>
        </header>
        <div class="js-body"></div>
      </div>
    `);

    root.append(chrome);
    els = {
      sub:    chrome.querySelector(".js-sub"),
      body:   chrome.querySelector(".js-body"),
      topbar: chrome.querySelector(".topbar"),
    };

    chrome.querySelector(".js-back").addEventListener("click", () => KN.backScreen());

    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  /* ---------------- computation ---------------- */

  /** Items still to buy (falls back to the whole list once everything is checked). */
  function targetItems() {
    const items = store.get().items;
    const active = items.filter((i) => !i.checked);
    return active.length ? active : items;
  }

  function analyse() {
    const entries = targetItems()
      .map((item) => ({ item, product: store.getProduct(item.productId) }))
      .filter((e) => e.product);

    // Only items with at least one recorded price can take part in a comparison.
    const priced = entries.filter((e) => store.bestPrice(e.product));
    const unpriced = entries.length - priced.length;

    // Cheapest achievable: every item bought at its own cheapest store.
    const combo = [];
    let comboTotal = 0;
    priced.forEach(({ item, product }) => {
      const best = store.bestPrice(product);
      const st = store.getStore(best.storeId);
      const line = best.price * item.qty;
      comboTotal += line;
      combo.push({ product, item, store: st, price: best.price, line });
    });
    combo.sort((a, b) => b.line - a.line);

    /* Per-store figures over the SAME basket, so the totals are comparable:
       buy what the store carries there, and anything it lacks at its own
       cheapest store. `anchored` is therefore a realistic trip total. */
    const rankings = store.sortedStores().map((st) => {
      let ownTotal = 0;
      let anchored = 0;
      let covered = 0;
      const missing = [];

      priced.forEach(({ item, product }) => {
        const here = store.priceAt(product, st.id);
        if (here) {
          ownTotal += here.price * item.qty;
          anchored += here.price * item.qty;
          covered += 1;
        } else {
          const best = store.bestPrice(product);
          anchored += best.price * item.qty;
          missing.push({ product, item, best });
        }
      });

      return {
        store: st,
        ownTotal,
        anchored,
        covered,
        missing,
        full: priced.length > 0 && covered === priced.length,
        ratio: priced.length ? covered / priced.length : 0,
      };
    }).filter((r) => r.covered > 0);

    rankings.sort((a, b) => a.anchored - b.anchored || b.covered - a.covered);

    // Cheapest store that carries the whole basket on its own, if one exists.
    const fullCover = rankings.filter((r) => r.full).sort((a, b) => a.ownTotal - b.ownTotal);
    const bestSingle = fullCover.length ? fullCover[0] : null;

    return {
      entries, priced, unpriced, rankings, combo, comboTotal, bestSingle,
      storeCount: new Set(combo.map((c) => c.store && c.store.id)).size,
    };
  }

  /* ---------------- render ---------------- */

  function render() {
    const st = store.get();
    const data = analyse();

    els.sub.textContent = data.entries.length
      ? `未購入 ${data.entries.length}品で比較`
      : "リストが空です";

    els.body.innerHTML = "";

    if (!data.entries.length) {
      els.body.append(node(html`
        <div class="empty">
          <div class="empty-art">⚖️</div>
          <h2 class="empty-title">リストに商品を追加すると比べられます</h2>
          <p class="empty-text">
            買い物リストの商品それぞれに、お店ごとの値段を登録してください。
            合計でどのお店が安いかを自動で計算します。
          </p>
        </div>
      `));
      return;
    }

    if (!st.stores.length || !data.combo.length) {
      els.body.append(node(html`
        <div class="empty">
          <div class="empty-art">🏪</div>
          <h2 class="empty-title">まだ値段の記録がありません</h2>
          <p class="empty-text">
            「商品と価格」から、お店ごとの値段を登録してみてください。
            2店舗以上あると、合計でどちらが安いかが分かります。
          </p>
        </div>
      `));
      return;
    }

    els.body.append(hero(data));
    els.body.append(rankingSection(data));
    els.body.append(comboSection(data));
  }

  function hero(data) {
    const saving = data.bestSingle ? data.bestSingle.ownTotal - data.comboTotal : 0;

    return node(html`
      <div class="compare-hero">
        <span class="hero-label">最安の組み合わせで買うと</span>
        <span class="hero-total">${yen(data.comboTotal)}</span>
        <span class="hero-note">
          ${data.combo.length}品を、それぞれいちばん安いお店で買った合計
          ${data.storeCount > 1 ? html`（${data.storeCount}店をまわった場合）` : ""}
          ${data.unpriced > 0 ? html`<br>※ ${data.unpriced}品は値段が未登録のため含みません` : ""}
        </span>
        ${saving > 0
          ? html`<span class="hero-save">${data.bestSingle.store.name}だけで買うより ${yen(saving)} おトク</span>`
          : ""}
      </div>
    `);
  }

  function rankingSection(data) {
    const section = node(html`
      <section class="section" style="padding-top:0">
        <h2 class="section-title">この店を中心に買うと</h2>
        <p style="font-size:12px;color:var(--c-text-3);line-height:1.6;margin:-4px 0 4px">
          同じ${data.priced.length}品を、その店にある物はその店で、ない物は最安の店で買った場合の合計です。
        </p>
        <div class="store-rank"></div>
      </section>
    `);
    const list = section.querySelector(".store-rank");

    data.rankings.forEach((r, idx) => {
      const card = node(html`
        <button class="rank-card ${idx === 0 ? "is-first" : ""}">
          <span class="rank-no">${idx + 1}</span>
          <span class="rank-main">
            <span class="rank-name">
              <span class="dot" style="background:${r.store.color}"></span>${r.store.name}
            </span>
            <span class="rank-cover">
              <span class="cover-bar"><span class="cover-fill" style="width:${String(Math.round(r.ratio * 100))}%"></span></span>
              ${r.full
                ? html`<b style="color:var(--c-primary)">全品そろう</b>`
                : html`${r.covered}/${data.priced.length}品`}
            </span>
          </span>
          <span class="rank-total">
            <span class="rank-amount">${yen(r.anchored)}</span>
            <span class="rank-sub">${r.full ? "この店だけで" : `${r.missing.length}品は他店で`}</span>
          </span>
        </button>
      `);
      card.addEventListener("click", () => openStoreDetail(r, data));
      list.append(card);
    });

    if (data.rankings.length < 2) {
      section.append(node(html`
        <p style="font-size:12px;color:var(--c-text-3);line-height:1.6">
          お店をもう1つ登録すると、合計金額を比べられるようになります。
        </p>
      `));
    }

    return section;
  }

  function openStoreDetail(rank, data) {
    const lines = data.priced
      .map(({ item, product }) => ({
        product, item,
        pr: store.priceAt(product, rank.store.id),
      }))
      .sort((a, b) => (a.pr ? 0 : 1) - (b.pr ? 0 : 1));

    const body = node(html`<div class="stack" style="gap:14px"></div>`);

    body.append(node(html`
      <div class="stack" style="gap:6px">
        <div class="spread">
          <span class="summary-label">この店で買える分</span>
          <span class="summary-total">${yen(rank.ownTotal)}</span>
        </div>
        ${rank.full
          ? html`<p style="font-size:12px;color:var(--c-text-2)">リストの品はすべてこの店でそろいます。</p>`
          : html`
              <div class="spread">
                <span class="summary-label">残り${rank.missing.length}品を最安店で買うと</span>
                <span style="font-weight:800">＋${yen(rank.anchored - rank.ownTotal)}</span>
              </div>
              <div class="divider" style="margin:4px 0"></div>
              <div class="spread">
                <span class="summary-label">合計</span>
                <span class="summary-total">${yen(rank.anchored)}</span>
              </div>
            `}
      </div>
    `));

    const list = node(html`<div class="combo-list"></div>`);
    lines.forEach(({ item, product, pr }) => {
      const best = store.bestPrice(product);
      const isCheapestHere = pr && best && pr.price <= best.price;
      const bestStore = best ? store.getStore(best.storeId) : null;
      list.append(node(html`
        <div class="combo-row">
          <span class="combo-name">${product.name}${item.qty > 1 ? html` <span style="color:var(--c-text-3)">×${item.qty}</span>` : ""}</span>
          ${pr
            ? html`
                ${isCheapestHere ? html`<span class="crown">🏆</span>` : ""}
                <span class="combo-price">${yen(pr.price * item.qty)}</span>
              `
            : html`
                <span class="combo-store" style="color:var(--c-text-3)">
                  取扱なし → ${bestStore ? bestStore.name : ""}
                </span>
                <span class="combo-price" style="color:var(--c-text-3)">${yen(best.price * item.qty)}</span>
              `}
        </div>
      `));
    });
    body.append(list);

    KN.ui.sheet({ title: rank.store.name, content: body });
  }

  function comboSection(data) {
    const section = node(html`
      <section class="section">
        <h2 class="section-title">商品ごとの最安店</h2>
        <div class="combo-list"></div>
      </section>
    `);
    const list = section.querySelector(".combo-list");

    data.combo.forEach(({ product, item, store: st, line }) => {
      const row = node(html`
        <button class="combo-row" style="text-align:left;width:100%">
          <span class="combo-name">${product.name}${item.qty > 1 ? html` <span style="color:var(--c-text-3)">×${item.qty}</span>` : ""}</span>
          <span class="combo-store">
            <span class="dot" style="background:${st.color};display:inline-block;margin-right:4px"></span>${st.name}
          </span>
          <span class="combo-price">${yen(line)}</span>
        </button>
      `);
      row.addEventListener("click", () => KN.productSheet.open(product.id, { itemId: item.id }));
      list.append(row);
    });

    return section;
  }

  KN.screens = KN.screens || {};
  KN.screens.compare = { mount, render };
})();
