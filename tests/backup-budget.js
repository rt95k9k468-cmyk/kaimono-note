/* 自動の控えの上限を、記録の大きさに合わせて広げる（docs/log/data-check.md の案B、2026年10月8日）。

   - 小さな記録では、これまでどおり 2,000万字（下げない）
   - 1件 50万字なら、段（直近2日の一時間おき＋日に一つ）が全部入る。2,000万字のままだと間引かれていた
   - 頭打ち（6,000万字）で止まる。それを越える大きさは、これまでどおり細かいほうから間引く
   - 物差しはいちばん大きい控え：記録がごっそり減った直後の小さな控えで上限が縮まない
   - 設定の「◯件まで」（usage の fits）も同じ上限で数える
   画面は開くが、触らない（KN.backup の関数を呼ぶだけ）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/backup-budget.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("backup-budget");
  const { browser, page, errors } = await open({
    before: async (c) => { await c.route(/dropbox(api)?\.com/, (r) => r.abort()); },
  });
  await page.waitForFunction(() => window.KN && KN.backup && KN.backup.budgetIdb);

  const r = await page.evaluate(() => {
    const B = KN.backup;
    const now = Date.now();
    const H = 3600000, D = 86400000;
    /* 段いっぱいの見出し：直近2日の一時間おき（47件）と、3〜13日前の日に一つ（11件）。 */
    const ladder = (size) => {
      const l = [];
      for (let d = 13; d >= 3; d--) l.push({ at: new Date(now - d * D - H).toISOString(), reason: "自動", size });
      for (let i = 46; i >= 0; i--) l.push({ at: new Date(now - i * H - 60000).toISOString(), reason: "自動", size });
      return l;
    };
    const sizeOf = (h) => (h.size || 0) + 300;
    const keptWith = (l, cap) => B.prune(l, cap, sizeOf).length;
    const mid = ladder(500_000);
    const huge = ladder(2_000_000);
    /* 大きい控えのあとに、ごっそり減った小さな一つ。 */
    const shrunk = ladder(500_000);
    shrunk.push({ at: new Date(now).toISOString(), reason: "自動", size: 1000 });
    return {
      small: B.budgetIdb(ladder(100_000)),
      base: B.BUDGET_IDB,
      max: B.BUDGET_IDB_MAX,
      empty: B.budgetIdb([]),
      n: mid.length,
      midNew: keptWith(mid, B.budgetIdb(mid)),
      midOld: keptWith(mid, B.BUDGET_IDB),
      huge: B.budgetIdb(huge),
      hugeKept: keptWith(huge, B.budgetIdb(huge)),
      shrunk: B.budgetIdb(shrunk),
      mid: B.budgetIdb(mid),
      shrunkKept: keptWith(shrunk, B.budgetIdb(shrunk)),
    };
  });
  t.check("小さな記録は、これまでどおり 2,000万字", r.small === r.base && r.empty === r.base, JSON.stringify(r));
  t.check("1件50万字なら段が全部入る", r.midNew === r.n, `${r.midNew}/${r.n}`);
  t.check("2,000万字のままだと間引かれていた（比べ）", r.midOld < r.n, `${r.midOld}/${r.n}`);
  t.check("頭打ち 6,000万字で止まり、越えるぶんは細かいほうから間引く", r.huge === r.max && r.hugeKept < r.n && r.hugeKept >= 12, `${r.huge} ${r.hugeKept}`);
  // 足した一つと同じ時間の一つは、段の決まりで譲る（容量ではない）ので r.n 件。
  t.check("ごっそり減った直後の小さな控えで、上限が縮まない", r.shrunk === r.mid && r.shrunkKept === r.n, `${r.shrunk} ${r.shrunkKept}`);

  /* 設定の「◯件まで」も同じ上限で数える（いまの控えの見出しから）。 */
  const u = await page.evaluate(async () => {
    await KN.backup.ready();
    await KN.backup.take("自動", { force: true });
    const x = KN.backup.usage();
    return { where: x.where, fits: x.fits };
  });
  t.check("控えは大きな保存場所に", u.where === "idb", u.where);
  t.check("fits は上限から数える（小さな記録で 2,000万字ぶん）", u.fits > 1000, String(u.fits));

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
