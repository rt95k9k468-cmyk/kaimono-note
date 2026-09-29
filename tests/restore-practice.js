/* 復元の練習（R15、2026年9月29日、docs/storage.md）。

   「書き出す → 空にする → 戻す → 件数と中身が同じ」を、毎回の試験で見張る。
   アプリのコード（backup.js・guard.js・store の復元）は触らない。見るだけ。

   材料は、emptyState() の鍵ぜんぶに中身を入れた記録（試験用の無難な字だけ）。
   「戻す欄の足し忘れ」（iconOverrides・iconReports が漏れていた昔の不具合）を、
   鍵の数から見張る。 */
const { open, checker } = require("./lib");

/* 「戻した中身は元と同じ」の物差し。

   戻すときは reconcile() を通るので、実行中に作った記録に**足りない欄が既定値で
   足される**（products の order・items の fav・todos の deadline など。読み込みで
   足されるのと同じ）。だから一字一句の同一ではなく、
     ① 元にあった値は、一つも消えず・変わらない（元 ⊆ 戻した）
     ② もう一度 書き出す→空→戻す をしても同じ（戻した後は固定点）
   で見る。足された欄が既定値以外なら ① が落ちる。 */
const HELPERS = `window.__lost = function (a, b, p) {
  if (a === b || a === null) return [];   // 元に値が無かった欄は、既定値が入ってよい
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    return Object.keys(a).flatMap((k) => window.__lost(a[k], b[k], p + "." + k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [p + ": " + JSON.stringify(a) + " -> " + JSON.stringify(b)];
};
window.__diff = function (a, b, p) {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object") {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => window.__diff(a[k], b[k], p + "." + k));
  }
  return [p + ": " + JSON.stringify(a) + " -> " + JSON.stringify(b)];
};`;

(async () => {
  const t = checker("復元の練習");
  const { browser, page, errors } = await open();
  await page.evaluate(HELPERS);

  /* ================= 材料：鍵ぜんぶに中身 ================= */
  const seeded = await page.evaluate(() => {
    const S = KN.store;
    S.loadSample();
    const p = S.get().products[0];
    /* 組（R11）は画面から外したが、保存済みの sets は持ち続ける——復元でも残るかを見る。 */
    S.update((s) => { s.sets = [{ id: "g-rp", name: "試験の組", productIds: [p.id, S.get().products[1].id] }]; });
    S.learnCategory("試験の品", "c-food");
    S.setIconOverride("試験の一品", "apple");
    S.addIconReport({ text: "試験の言葉", screen: "list", kind: "wrong" });
    S.addWeight({ day: "2026-09-01", time: "07:00", kg: 60.5 });
    S.addWeight({ day: "2026-09-02", time: "07:00", kg: 60.2 });
    S.addMeal({ day: "2026-09-01", time: "12:00", slot: "lunch", items: [{ name: "試験のごはん" }], memo: "試験" });
    S.addUserFood({ name: "試験の食べもの", kcal: 100 });
    S.addDrink({ day: "2026-09-01", time: "20:00", kind: "beer", volumeMl: 350, abv: 5 });
    S.addUrge({ day: "2026-09-01", time: "21:00", before: 3, trigger: ["試験"] });
    S.putHealth({ type: S.HEALTH_TYPES[0], day: "2026-09-01", value: 5000 });
    S.setGoal && S.setGoal({ heightCm: 165, targetKg: 58 });
    S.addEntry({ date: "2026-09-01", type: "reading", title: "試験の本", author: "試験", pageFrom: 1, pageTo: 10 });
    S.setDayLog("2026-09-01", { memo: "試験の日記です。", wake: "07:00", sleep: "23:00" });
    S.setDayLog("2026-09-02", { memo: "二日目。" });
    S.setQuietDay("2026-09-03", true);
    S.update((s) => { s.settings.theme = "dark"; s.settings.captureDest = { 試験: "todo" }; });
    const st = S.get();
    const emptyKeys = Object.keys(JSON.parse(S.exportJSON())).filter((k) => k !== "exportedAt" && k !== "app");
    return { keys: emptyKeys, counts: S.countsOf(st) };
  });
  const nonEmpty = await page.evaluate(() => {
    const st = KN.store.get();
    const isEmpty = (v) => v == null || (Array.isArray(v) ? !v.length : typeof v === "object" ? !Object.keys(v).length : v === "");
    return Object.keys(st).filter((k) => k !== "schema" && isEmpty(st[k]));
  });
  t.check("材料：鍵ぜんぶに中身がある", nonEmpty.length === 0, `空の鍵: ${nonEmpty.join(",")}`);
  const c0 = seeded.counts;
  t.check("材料：件数がどれも0より上", ["products", "stores", "items", "todos", "days", "entries", "diet"].every((k) => c0[k] > 0), JSON.stringify(c0));
  const dietEmpty = await page.evaluate(() => Object.entries(KN.store.get().diet)
    .filter(([, v]) => Array.isArray(v) && !v.length).map(([k]) => k));
  t.check("材料：ダイエットの棚（体重・食事・食べもの・健康・お酒・飲みたくなった）が全部入っている", dietEmpty.length === 0, dietEmpty.join(","));

  /* ================= A. ファイルの書き出し → 全部消す → 戻す ================= */
  const A = await page.evaluate(() => {
    const S = KN.store;
    const before = JSON.stringify(S.get());
    const file = S.exportJSON("2026-09-29T00:00:00.000Z");
    const insp = S.inspectBackup(file);
    const beforeCounts = S.countsOf();
    S.reset();
    const emptied = S.countsOf();
    S.importJSON(file);
    const after = JSON.stringify(S.get());
    const lost = window.__lost(JSON.parse(before), JSON.parse(after), "");
    S.importJSON(S.exportJSON()); S.reset(); S.importJSON(file);
    const again = JSON.stringify(S.get());
    return {
      before, after, lost, stable: again === after, file, insp, beforeCounts, emptied,
      afterCounts: S.countsOf(), fileKeys: Object.keys(JSON.parse(file)),
    };
  });
  t.check("A. 確かめ（inspectBackup）の件数が、書き出す前の件数と同じ",
    JSON.stringify(A.insp.counts) === JSON.stringify(A.beforeCounts) && A.insp.ok, JSON.stringify(A.insp));
  t.check("A. 空にすると件数がすべて 0（買うもの・やること・daily・ダイエット）",
    Object.values(A.emptied).every((n) => n === 0), JSON.stringify(A.emptied));
  t.check("A. 戻した件数が、書き出す前と同じ", JSON.stringify(A.afterCounts) === JSON.stringify(A.beforeCounts), JSON.stringify(A.afterCounts));
  t.check("A. 戻した中身に、元の値が一つも欠けず・変わらない（足されるのは既定値の欄だけ）", A.lost.length === 0, A.lost.slice(0, 5).join("\n      "));
  t.check("A. もう一度 書き出す→空→戻す をしても同じ（戻した後は動かない）", A.stable);
  t.check("A. 書き出しに emptyState() の鍵がぜんぶ入っている",
    seeded.keys.length >= 10 && ["categories", "stores", "products", "items", "sets", "todos", "learned", "diet", "archive", "iconOverrides", "iconReports", "settings"]
      .every((k) => A.fileKeys.includes(k)), A.fileKeys.join(","));

  /* 日記の本文は、件数ではなく字で見る（試験用の字）。 */
  const memo = await page.evaluate(() => KN.store.get().archive.days.map((d) => `${d.date}:${d.memo}`).sort().join("|"));
  t.check("A. 日記の本文が戻っている", memo === "2026-09-01:試験の日記です。|2026-09-02:二日目。", memo);

  /* ================= B. 別の文脈（新品の端末）へ戻す ================= */
  const B = await (async () => {
    const other = await open();
    try {
      await other.page.evaluate(HELPERS);
      const r = await other.page.evaluate((file) => {
        const S = KN.store;
        const fresh = S.countsOf();
        S.importJSON(file);
        return { fresh, after: JSON.stringify(S.get()), counts: S.countsOf() };
      }, A.file);
      await other.page.waitForTimeout(400);
      await other.page.reload();
      await other.page.waitForFunction(() => window.KN && KN.store && KN.app);
      await other.page.waitForTimeout(600);
      const reloaded = await other.page.evaluate(() => JSON.stringify(KN.store.get()));
      await other.page.evaluate(HELPERS);
      const drift = await other.page.evaluate((a) => window.__diff(JSON.parse(a), KN.store.get(), ""), r.after);
      return { ...r, reloaded, drift, errors: other.errors };
    } finally { await other.browser.close(); }
  })();
  t.check("B. 新品の端末は空で始まる", Object.values(B.fresh).every((n) => n === 0), JSON.stringify(B.fresh));
  t.check("B. 新品の端末に戻すと、件数が元と同じ", JSON.stringify(B.counts) === JSON.stringify(A.beforeCounts), JSON.stringify(B.counts));
  t.check("B. 新品の端末に戻した中身が、元の端末に戻した中身と一字も違わない", B.after === A.after,
    B.after === A.after ? "" : `元の端末${A.after.length}字 新品${B.after.length}字`);
  /* 読み直しで動くのは、決まりどおりの二つだけ：
       ① 過ぎた用事の日が今日へ（rescheduleOverdue。段3から、運んだ印 carried と
          時刻を外すのも）② 今日の空の日の行（ensureDayLog） */
  const KNOWN = [/^\.todos\.\d+\.(due|carried|time):/, /^\.archive\.days\.\d+: undefined ->/];
  const drift = B.drift.filter((d) => !KNOWN.some((re) => re.test(d)));
  t.check("B. 読み直しても、戻した中身が残っている（決まりどおりの動きを除く）", drift.length === 0, drift.slice(0, 6).join("\n      "));
  t.check("B. 試験中にエラーが出ていない", B.errors.length === 0, B.errors.join("\n"));

  /* ================= C. 自動の控え：取る → 空にする → 控えから戻す ================= */
  const C = await page.evaluate(async () => {
    const S = KN.store;
    const before = JSON.stringify(S.get());
    const beforeCounts = S.countsOf();
    const took = await KN.backup.take("削除前");
    const heads = KN.backup.list();
    const mine = heads.find((h) => h.reason === "削除前");
    S.reset();
    const emptied = S.countsOf();
    /* 空の状態は守るものが無いので控えに残さない（"empty"。backup.js の isEmpty）。
       「復元前」が残ることを見るには、戻す前に何か一つ書いておく。 */
    S.addTodo({ title: "戻す前に書いた用事" });
    let restoredErr = null;
    try { await KN.backup.restore(mine.at); } catch (e) { restoredErr = String(e && e.message); }
    return {
      took, hasHead: !!mine, summary: mine && mine.summary, before, beforeCounts, emptied,
      after: JSON.stringify(S.get()), afterCounts: S.countsOf(), restoredErr,
      lost: window.__lost(JSON.parse(before), JSON.parse(JSON.stringify(S.get())), ""),
      reasons: KN.backup.list().map((h) => h.reason),
    };
  });
  t.check("C. 控えが取れる（失敗しない）", C.took !== "failed" && C.hasHead, String(C.took));
  t.check("C. 空にすると件数がすべて 0", Object.values(C.emptied).every((n) => n === 0), JSON.stringify(C.emptied));
  t.check("C. 控えから戻せる（エラーなし）", C.restoredErr === null, String(C.restoredErr));
  t.check("C. 戻した件数が、控えを取ったときと同じ", JSON.stringify(C.afterCounts) === JSON.stringify(C.beforeCounts), JSON.stringify(C.afterCounts));
  t.check("C. 戻した中身に、控えを取ったときの値が一つも欠けず・変わらない", C.lost.length === 0, C.lost.slice(0, 5).join("\n      "));
  t.check("C. 戻す前の状態が「復元前」の控えに残る（空の状態は残さない決まり）", C.reasons.includes("復元前"), C.reasons.join(","));

  /* ================= D. ファイルでない・違う種類のファイルは何も変えない ================= */
  const D = await page.evaluate(() => {
    const S = KN.store;
    const before = JSON.stringify(S.get());
    const bad = [
      "これは JSON ではない",
      "[]",
      JSON.stringify({ kind: "daily-month", ym: "2026-09" }),
      JSON.stringify({ kind: "diary-sealed" }),
      JSON.stringify({ app: "ほかのアプリ", schema: 2 }),
      JSON.stringify({ hello: "world" }),
    ];
    const results = bad.map((text) => {
      const insp = S.inspectBackup(text);
      let threw = false;
      try { S.importJSON(text); } catch (e) { threw = true; }
      return { ok: insp.ok, threw };
    });
    return { results, same: JSON.stringify(S.get()) === before };
  });
  t.check("D. 六種類の「戻せないファイル」を、確かめでも復元でも断る",
    D.results.every((r) => r.ok === false && r.threw === true), JSON.stringify(D.results));
  t.check("D. 断ったあと、記録は一字も変わっていない", D.same);

  /* ================= E. 画面から：ファイルを選ぶ → 確認 → 戻る ================= */
  await page.evaluate(HELPERS);
  const beforeUi = await page.evaluate(() => JSON.stringify(KN.store.get()));
  const fileText = await page.evaluate(() => KN.store.exportJSON("2026-09-29T00:00:00.000Z"));
  await page.evaluate(() => { KN.store.reset(); KN.store.addTodo({ title: "画面で戻す前の用事" }); });
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップと書き出し" }).first().click();
  await page.waitForTimeout(500);
  await page.locator(".js-file").setInputFiles({ name: "kurashi.json", mimeType: "application/json", buffer: Buffer.from(fileText) });
  await page.waitForSelector(".sheet .js-ok, .dialog .js-ok, .js-ok", { timeout: 4000 });
  const msg = await page.evaluate(() => document.body.innerText);
  t.check("E. 確認の紙に「復元しますか？」と、ファイルの件数・いまの記録が出る",
    msg.includes("復元しますか") && msg.includes("いまのデータはすべて置き換わります"), "");
  await page.locator(".js-ok").last().click();
  await page.waitForTimeout(800);
  const afterUi = await page.evaluate(() => JSON.stringify(KN.store.get()));
  const lostUi = await page.evaluate((b) => window.__lost(JSON.parse(b), KN.store.get(), ""), beforeUi);
  t.check("E. 画面から復元した中身に、消す前の値が一つも欠けず・変わらない", lostUi.length === 0, lostUi.slice(0, 5).join("\n      "));
  const todoGone = await page.evaluate(() => !KN.store.get().todos.some((x) => x.title === "画面で戻す前の用事"));
  t.check("E. 復元は置き換え：戻す前に書いた用事は残らない", todoGone);
  const kept = await page.evaluate(() => KN.backup.list().map((h) => h.reason));
  t.check("E. 復元の直前に「復元前」の控えが増えている", kept.includes("復元前"), kept.join(","));

  /* 点検（R28）：鍵ぜんぶの材料を戻した記録に、食い違いは無い。わざと食い違いを
     入れたファイルは tests/audit.js。 */
  const au = await page.evaluate(() => KN.audit.check(KN.store.get()));
  t.check("F. 戻した記録を点検すると、食い違いは0件", au.total === 0, JSON.stringify(au));

  t.check("エラーが出ていない", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
