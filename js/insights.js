/* =========================================================
   くらしノート — insights

   Reads the shopping data and says something useful about it. Everything
   here is arithmetic on the user's own records: no network, no key, works
   on a plane. That also means it never guesses — a figure shown here can
   be traced back to a price the user typed in.
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { yen, formatDate } = KN.util;
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
          /* 絵は名前で持ちます。ここは「何を出すか」を決める場所で、
             どう描くかは画面の仕事です（util.js の icon()）。 */
          icon: up ? "trend" : "trendDown",
          tone: up ? "warn" : "good",
          title: `${p.name}が${up ? "値上がり" : "値下がり"}`,
          body: `${st.name}で ${yen(prev.price)} → ${yen(cur.price)}（${up ? "+" : ""}${yen(delta)}）`,
        });
      });
    });
    return out;
  }

  /* 「値段は高いが量あたりは安い」 という指摘はもう出ない。同じものを同じ
     大きさで買うのだから、比べるのは値段そのもの。入数で割るときも全店を
     同じ数で割るので、順番は変わらない。 */

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
        icon: "cart",
        tone: "good",
        title: `今回は${top.st.name}だけで足ります`,
        body: extra <= 0
          ? `${priced.length}品を ${yen(top.total)} で買えます。店を回る必要はありません。`
          : `${priced.length}品を ${yen(top.total)}。店を分けても ${yen(extra)} しか変わりません。`,
      }];
    }
    return [{
      kind: "split",
      weight: 95,
      icon: "shopCompare",
      tone: "note",
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
        icon: "clock",
        tone: "mute",
        title: `${p.name}の値段が古くなっています`,
        body: `最後に記録したのは ${formatDate(best.date)}。次に見かけたら確かめると合計が正確になります。`,
      });
    });
    return out;
  }

  /* ---------------- そろそろ切れそう（D6） ----------------

     買うものの「買った」（アーカイブに残る、チェックした日時 `checkedAt`）
     から、品物ごとの**いつもの間隔**を出します。記録の入れ物は増やしません
     ——いまある「買った」の行を、そのつど数えるだけです（Daily Log の
     「写さず引く」と同じ）。アーカイブの行を消せば、そのぶん数えなくなる。

     値段の記録の日付は使いません。値段は店で見かけただけでも付けるので、
     それを「買った」と数えると間隔が縮んで、まだあるものを急かします。

     決めごと：
     ・同じ日に二度買ったのは一回（日で数える。日はローカル、dayKey）。
     ・**三回以上**買ったものだけ（間隔が二つ無いと「いつも」は言えない）。
     ・いつもの間隔は、間隔の**真ん中の値**（平均だと、一度の買い忘れで
       大きく伸びる）。2日未満（毎日のように買うもの）は出しません。
     ・出すのは、前に買ってから、いつもの 0.85 倍を過ぎたころから、
       2.5 倍まで。それより空いたら、もう買っていないものとして黙ります
       ——「要らない」を押させる欄を置かないかわりに、ここで引く。
     ・いま買うものに入っているもの・しまったものは出さない。 */
  const LOW_MIN_BUYS = 3;
  const LOW_FROM = 0.85;
  const LOW_UNTIL = 2.5;
  const LOW_LIMIT = 5;

  const dayDiff = (a, b) => Math.round(
    (KN.util.dayDate(b).getTime() - KN.util.dayDate(a).getTime()) / 86400000);

  /**
   * @param {object} [o]
   * @param {string} [o.today] dayKey（試験用。既定は今日）
   * @returns {Array<{product, every:number, since:number}>} 急ぐ順
   */
  function runningLow(o) {
    const today = (o && o.today) || KN.util.todayKey();
    const st = store.get();
    const onList = new Set();
    const bought = new Map();            // productId → Set(dayKey)
    st.items.forEach((i) => {
      if (!i.checked) { onList.add(i.productId); return; }
      if (!i.checkedAt) return;
      const t = new Date(i.checkedAt);
      if (isNaN(t)) return;
      if (!bought.has(i.productId)) bought.set(i.productId, new Set());
      bought.get(i.productId).add(KN.util.dayKey(t));
    });

    const out = [];
    bought.forEach((daySet, pid) => {
      if (onList.has(pid) || daySet.size < LOW_MIN_BUYS) return;
      const p = store.getProduct(pid);
      if (!p || p.archived) return;
      const days = [...daySet].sort();
      const gaps = [];
      for (let k = 1; k < days.length; k++) gaps.push(dayDiff(days[k - 1], days[k]));
      gaps.sort((a, b) => a - b);
      const mid = gaps.length >> 1;
      const every = gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
      if (!(every >= 2)) return;
      const since = dayDiff(days[days.length - 1], today);
      if (since < every * LOW_FROM || since > every * LOW_UNTIL) return;
      out.push({ product: p, every, since });
    });
    return out.sort((a, b) => (b.since / b.every) - (a.since / a.every)).slice(0, LOW_LIMIT);
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

  KN.insights = { forItems, runningLow, STALE_DAYS };
})();
