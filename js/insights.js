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
          ? `${priced.length}品を ${yen(top.total)} で買えます。`
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
        body: `最後の記録は ${formatDate(best.date)}。`,
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

  /**
   * よく買う物（買うものの足す紙で、打つ前に札で出す。V27）。買った日の数が多い順、
   * 並べば最後に買ったのが新しい順。いまリストにあるもの・アーカイブしたものは出さない。
   * 読むだけで、記録には何も足さない。
   * @returns {Array<object>} 品物
   */
  function oftenBought(limit = 10) {
    const st = store.get();
    const onList = new Set();
    const days = new Map();              // productId → Set(dayKey)
    const last = new Map();
    st.items.forEach((i) => {
      if (!i.checked) { onList.add(i.productId); return; }
      const t = i.checkedAt ? new Date(i.checkedAt) : null;
      if (!t || isNaN(t)) return;
      if (!days.has(i.productId)) days.set(i.productId, new Set());
      days.get(i.productId).add(KN.util.dayKey(t));
      last.set(i.productId, Math.max(last.get(i.productId) || 0, t.getTime()));
    });
    const out = [];
    days.forEach((set, pid) => {
      if (onList.has(pid)) return;
      const p = store.getProduct(pid);
      if (!p || p.archived) return;
      out.push({ p, n: set.size, at: last.get(pid) || 0 });
    });
    return out.sort((a, b) => b.n - a.n || b.at - a.at).slice(0, limit).map((r) => r.p);
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

  /* ---------------- 席をまたぐ気づき（F4 H3。docs/health.md「席をまたぐ気づき」） ----------------

     からだの「気づいたこと」の下に並ぶ（diet.js の analyze と同じ形 { id, title, text, tone, n }）。
     出すのは「◯日のうち」とそろった日数・二つの組の日数と平均だけ。助言・原因・採点の言葉は書かない
     （tone は info だけ）。片側が3日（MIN）に満たなければ出さない。記録は読むだけ。
     飲んだ翌朝の体重は analyze の「飲んだ翌日の体重」がすでに言う。 */
  const MIN = 3;
  const BUSY_MIN = 2;           // 予定がこれだけある日を「予定の多い日」
  const LATE_DINNER = "21:00";  // 夕食がこの時刻から
  const STEPS_DEFAULT = 5000;   // 歩数の目標が空のとき（screen-diet.js の STEPS_DEFAULT と同じ）
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const hm = (m) => `${Math.floor(Math.round(m) / 60)}時間${Math.round(m) % 60}分`;
  const kg = (v) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(1)}kg`;

  function across(windowDays) {
    const U = KN.util, D = KN.diet;
    const win = windowDays || 30;
    const today = U.todayKey();
    const from = U.shiftDay(today, -(win - 1));
    const days = D.daysBetween(from, today);
    const out = [];

    /* 歩いた日の夜の睡眠：d の歩数と、d の晩に寝て d+1 に起きた睡眠（睡眠は起きた日に付く）。 */
    const goal = store.get().diet.goal;
    const thr = goal.stepsTarget || STEPS_DEFAULT;
    const walk = [], rest = [];
    days.forEach((d) => {
      const w = U.shiftDay(d, 1);
      if (w > today) return;
      const log = store.dayLog(w);
      if (w === today && log && log.sleepStages && log.sleepStages.provisional) return;
      const st = store.healthValue(d, "steps"), sl = store.healthValue(w, "sleep");
      if (st == null || !(sl > 0)) return;
      (st >= thr ? walk : rest).push(sl);
    });
    if (walk.length >= MIN && rest.length >= MIN) {
      out.push({
        id: "walk-sleep", title: "歩いた日の夜の睡眠", tone: "info", n: walk.length + rest.length,
        text: `${win}日のうち、歩数とその夜の睡眠がそろった日は ${walk.length + rest.length}日。`
          + `${thr.toLocaleString()}歩以上の日（${walk.length}日）の夜は平均 ${hm(avg(walk))}、`
          + `そうでない日（${rest.length}日）の夜は ${hm(avg(rest))}。`,
      });
    }

    /* 予定の多い日と飲みたくなった：飲みたくなったを初めて書いた日から、昨日まで（今日はまだ途中）。
       予定は やること の kind:"event"（くり返しは store.fallsOn）。 */
    const urgeDays = (store.get().diet.urges || []).map((u) => u.day).filter(Boolean).sort();
    if (urgeDays.length) {
      const events = (store.get().todos || []).filter((t) => t.kind === "event" && !t.archived && !t.endDay);
      const busy = [], calm = [];
      days.forEach((d) => {
        if (d < urgeDays[0] || d >= today) return;
        const n = events.filter((t) => store.fallsOn(t, d)).length;
        (n >= BUSY_MIN ? busy : calm).push(store.urgesOfDay(d).length > 0);
      });
      if (busy.length >= MIN && calm.length >= MIN) {
        const yes = (xs) => xs.filter(Boolean).length;
        out.push({
          id: "busy-urge", title: "予定の多い日と飲みたくなった", tone: "info", n: busy.length + calm.length,
          text: `${win}日のうち、予定と飲みたくなったの記録がそろった日は ${busy.length + calm.length}日。`
            + `予定が${BUSY_MIN}件以上の日（${busy.length}日）のうち飲みたくなった日は ${yes(busy)}日、`
            + `そうでない日（${calm.length}日）では ${yes(calm)}日。`,
        });
      }
    }

    /* 夕食の時刻と翌朝の体重：翌朝の体重の、7日平均からのずれ（analyze の「飲んだ翌日の体重」と同じ物差し）。
       夕食の時刻はその日の夜の枠のいちばん早い時刻。 */
    const pts = D.weightPoints(U.shiftDay(from, -6), today);
    const ma = new Map(D.movingAverage(pts, 7).filter((m) => m.value != null).map((m) => [m.day, m.value]));
    const morning = new Map();
    pts.forEach((p) => { if (!morning.has(p.day)) morning.set(p.day, p.kg); });
    const late = [], early = [];
    days.forEach((d) => {
      const next = U.shiftDay(d, 1);
      if (next > today || !morning.has(next) || !ma.has(next)) return;
      const t = store.mealsOfDay(d).filter((m) => m.slot === "dinner" && U.isTime(m.time)).map((m) => m.time).sort()[0];
      if (!t) return;
      (t >= LATE_DINNER ? late : early).push(morning.get(next) - ma.get(next));
    });
    if (late.length >= MIN && early.length >= MIN) {
      out.push({
        id: "dinner-time", title: "夕食の時刻と翌朝の体重", tone: "info", n: late.length + early.length,
        text: `${win}日のうち、夕食の時刻と翌朝の体重がそろった日は ${late.length + early.length}日。`
          + `${LATE_DINNER.replace(/^0/, "").replace(":00", "時")}からの夕食（${late.length}日）の翌朝は 7日平均から平均 ${kg(avg(late))}、`
          + `それより前（${early.length}日）は ${kg(avg(early))}。`,
      });
    }
    return out;
  }

  KN.insights = { forItems, runningLow, oftenBought, across, STALE_DAYS };
})();
