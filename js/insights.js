/* =========================================================
   かいものノート — insights

   Reads the shopping data and says something useful about it. Everything
   here is arithmetic on the user's own records: no network, no key, works
   on a plane. That also means it never guesses — a figure shown here can
   be traced back to a price the user typed in.
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { yen, formatDate, unitPrice } = KN.util;
  const store = KN.store;

  const STALE_DAYS = 90;
  const ONE_STOP_TOLERANCE = 0.05;   // within 5% of the best split is "close enough"

  const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

  /** Every price recorded for one product at one store, oldest first. */
  function history(product, storeId) {
    return product.prices
      .filter((pr) => pr.storeId === storeId)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /* ---------------- individual checks ---------------- */

  /* The latest price against the one before it, at the same store. Anything
     else would compare two different shops and call it a change. */
  function priceMoves(products) {
    const out = [];
    products.forEach((p) => {
      store.currentPrices(p).forEach((cur) => {
        const h = history(p, cur.storeId);
        if (h.length < 2) return;
        const prev = h[h.length - 2];
        const delta = cur.price - prev.price;
        if (!delta) return;
        const st = store.getStore(cur.storeId);
        if (!st) return;
        const up = delta > 0;
        out.push({
          kind: "price-move",
          weight: 60 + Math.abs(delta) / Math.max(prev.price, 1) * 40,
          icon: up ? "📈" : "📉",
          title: `${p.name}が${up ? "値上がり" : "値下がり"}`,
          body: `${st.name}で ${yen(prev.price)} → ${yen(cur.price)}（${up ? "+" : ""}${yen(delta)}）`,
        });
      });
    });
    return out;
  }

  /* Cheapest sticker price is not always cheapest per millilitre — the whole
     reason the app records sizes at all. */
  function unitPriceUpsets(products) {
    const out = [];
    products.forEach((p) => {
      if (!p.unit) return;
      const rows = store.currentPrices(p)
        .map((pr) => {
          const amount = pr.amount || p.amount;
          const u = unitPrice(pr.price, amount, p.unit);
          return u ? { pr, u, st: store.getStore(pr.storeId) } : null;
        })
        .filter((r) => r && r.st);
      if (rows.length < 2) return;

      const byPrice = rows.slice().sort((a, b) => a.pr.price - b.pr.price)[0];
      const byUnit  = rows.slice().sort((a, b) => a.u.value - b.u.value)[0];
      if (byPrice === byUnit) return;

      out.push({
        kind: "unit-price",
        weight: 70,
        icon: "⚖️",
        title: `${p.name}は${byUnit.st.name}の方が割安`,
        body: `${byPrice.st.name} ${yen(byPrice.pr.price)}（${byPrice.u.text}）より、`
            + `${byUnit.st.name} ${yen(byUnit.pr.price)}（${byUnit.u.text}）の方が量あたりは安く済みます`,
      });
    });
    return out;
  }

  /* Is this trip worth splitting across shops, or is one stop good enough? */
  function tripRouting(items) {
    const priced = items
      .map((it) => ({ it, p: store.getProduct(it.productId) }))
      .filter((r) => r.p && store.bestPrice(r.p));
    if (priced.length < 2) return [];

    const cheapest = priced.reduce((sum, r) => sum + store.bestPrice(r.p).price * r.it.qty, 0);

    // What each store costs if you buy there whatever it stocks and pick up
    // the rest wherever it is cheapest — a total you could actually spend.
    const totals = store.sortedStores().map((st) => {
      let total = 0, here = 0;
      priced.forEach((r) => {
        const at = store.priceAt(r.p, st.id);
        const best = store.bestPrice(r.p);
        if (at) { total += at.price * r.it.qty; here += 1; }
        else { total += best.price * r.it.qty; }
      });
      return { st, total, here };
    }).filter((t) => t.here > 0).sort((a, b) => a.total - b.total);

    if (!totals.length) return [];
    const top = totals[0];
    const extra = top.total - cheapest;

    if (extra <= 0 || extra <= cheapest * ONE_STOP_TOLERANCE) {
      return [{
        kind: "one-stop",
        weight: 100,
        icon: "🛒",
        title: `今回は${top.st.name}だけで足ります`,
        body: extra <= 0
          ? `${priced.length}品を ${yen(top.total)} で買えます。店を回る必要はありません。`
          : `${priced.length}品を ${yen(top.total)}。店を分けても ${yen(extra)} しか変わりません。`,
      }];
    }
    return [{
      kind: "split",
      weight: 95,
      icon: "🧭",
      title: `店を分けると ${yen(extra)} 安くなります`,
      body: `${top.st.name}中心なら ${yen(top.total)}、それぞれ最安の店で買うと ${yen(cheapest)} です。`,
    }];
  }

  /* A price from last spring is a guess, not a price. */
  function stalePrices(products) {
    const out = [];
    products.forEach((p) => {
      const best = store.bestPrice(p);
      if (!best) return;
      const age = daysSince(best.date);
      if (!(age > STALE_DAYS)) return;
      out.push({
        kind: "stale",
        weight: 40 + Math.min(age / 10, 20),
        icon: "🕰️",
        title: `${p.name}の値段が古くなっています`,
        body: `最後に記録したのは ${formatDate(best.date)}。次に見かけたら確かめると合計が正確になります。`,
      });
    });
    return out;
  }

  /* ---------------- public ---------------- */

  /**
   * Findings for the items being shopped, strongest first.
   * @param {Array} items  the trip (or the whole active list when nothing is starred)
   */
  function forItems(items, limit = 3) {
    const products = [];
    const seen = new Set();
    items.forEach((it) => {
      if (seen.has(it.productId)) return;
      seen.add(it.productId);
      const p = store.getProduct(it.productId);
      if (p && p.prices.length) products.push(p);
    });
    if (!products.length) return [];

    const found = [
      ...tripRouting(items),
      ...priceMoves(products),
      ...unitPriceUpsets(products),
      ...stalePrices(products),
    ];

    // One finding per kind, so a single stale shelf cannot fill the card.
    const bestOfKind = new Map();
    found.forEach((f) => {
      const cur = bestOfKind.get(f.kind);
      if (!cur || f.weight > cur.weight) bestOfKind.set(f.kind, f);
    });

    return [...bestOfKind.values()].sort((a, b) => b.weight - a.weight).slice(0, limit);
  }

  KN.insights = { forItems, STALE_DAYS };
})();
