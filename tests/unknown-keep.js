/* 知らない欄を落とさない（2026年10月22日、docs/storage.md「知らない欄」）。

   悪い版は revert で戻す。そのとき古い版が、新しい版の書いた記録を開いて保存すると、
   古い版の知らない欄が黙って消えうる（reconcile() が知っている欄だけで作り直す所）。
   記録のあらゆる入れ物に知らない欄（__fut）を入れ、二つの道で残るかを見る：
     開く道：写しから戻す adoptRaw()（＝開いたときの load と同じ loadFrom → reconcile）
     戻す道：書き出したファイルを importJSON()
   2026年10月27日に直して KNOWN は空（reconcile・applyBackup・一件を直す道が残す）。落ちる所が出たら赤。
   あわせて、読めない値を欄ごと落とす欄が生き返らないこと・書き出しの付けたし（…Book）が記録に入らないこと。 */
const { open, checker } = require("./lib");

/* 落ちてよい所（道ごと）。空のまま保つ。 */
const KNOWN = { open: [], import: [] };

(async () => {
  const t = checker("知らない欄を落とさない");
  const { browser, page, errors } = await open();


  const seed = () => page.evaluate(() => {
    const S = KN.store;
    S.reset();
    S.loadSample();
    const p = S.get().products[0];
    S.update((s) => { s.sets = [{ id: "g-uk", name: "試験の組", productIds: [p.id], createdAt: "2026-09-01T00:00:00.000Z" }]; });
    S.learnCategory("試験の品", "c-food");
    S.setIconOverride("試験の一品", "apple");
    S.addIconReport({ text: "試験の言葉", screen: "list", kind: "wrong" });
    S.addWeight({ day: "2026-09-01", time: "07:00", kg: 60.5 });
    S.addMeal({ day: "2026-09-01", time: "12:00", slot: "lunch", items: [{ name: "試験のごはん" }], memo: "試験" });
    S.addUserFood({ name: "試験の食べもの", kcal: 100 });
    S.addDrink({ day: "2026-09-01", time: "20:00", kind: "beer", volumeMl: 350, abv: 5 });
    S.addUrge({ day: "2026-09-01", time: "21:00", before: 3, trigger: ["試験"] });
    S.putHealth({ type: S.HEALTH_TYPES[0], day: "2026-09-01", value: 5000 });
    S.setGoal && S.setGoal({ heightCm: 165, targetKg: 58 });
    S.addEntry({ date: "2026-09-01", type: "reading", title: "試験の本", author: "試験", pageFrom: 1, pageTo: 10 });
    S.setDayLog("2026-09-01", { memo: "試験の日記です。", wake: "07:00", sleep: "23:00" });
    S.setAsks([{ g: "試験", w: 2, from: "試験の出典", hint: "試験の文脈", q: "試験の問いは何か。" }]);
    /* やることの中の入れ物（手順・置き直しの控え・活動・運んだ印）と、食事の AI の欄（区分・費用）。 */
    S.update((s) => {
      s.todos.unshift({ id: "t-uk", title: "試験の用事", due: "2026-09-01", order: -1,
        subs: [{ id: "s-uk", title: "試験の手順", done: false, skipped: false }],
        slips: [{ on: "2026-09-01", from: "2026-08-31", time: null, how: "carry" }],
        act: { type: "study", entry: null, note: null }, carried: { on: "2026-09-01", time: null } });
      s.diet.meals[0].ai = { kcal: 500, raw: "試験", at: "2026-09-01T12:00:00.000Z",
        slots: { breakfast: null, lunch: 500, dinner: null, snack: null },
        cost: { usd: 0.01, searches: 0, inputTokens: 10, outputTokens: 10, model: "" } };
    });
  });

  /* 入れ物ぜんぶ（配列の中の一件も、入れ子も）に __fut を足し、どこへ足したかを返す。
     配列の添え字は # にまとめる（同じ入れ物の何件目かは問わない）。 */
  const run = async (way) => { await seed(); return page.evaluate((way) => {
    const S = KN.store;
    const DICT = [".learned", ".iconOverrides", ".settings.captureDest", ".todos.#.subState"];
    const put = (v, path, out) => {
      if (Array.isArray(v)) { v.forEach((x) => put(x, path + ".#", out)); return; }
      if (!v || typeof v !== "object") return;
      if (DICT.some((d) => path === d || path.startsWith(d + "."))) return;   // 鍵が言葉・日の辞書は入れ物でない
      for (const k of Object.keys(v)) put(v[k], path + "." + k, out);
      v.__fut = "未来の欄";
      out.add(path || ".");
    };
    const has = (v, path) => {
      const keys = path === "." ? [] : path.slice(1).split(".");
      /* true・false・null（その一件はこの道を持たない：手順の無い用事・崩れた用事 t-bad）。 */
      const walk = (x, i) => {
        if (i === keys.length) return !!x && typeof x === "object" && !Array.isArray(x) && x.__fut === "未来の欄";
        if (Array.isArray(x)) {
          if (keys[i] !== "#") return false;
          const got = x.filter((y) => !(y && y.id === "t-bad")).map((y) => walk(y, i + 1)).filter((r) => r !== null);
          return got.length ? got.every(Boolean) : null;
        }
        if (!x || typeof x !== "object") return false;
        return x[keys[i]] === undefined || x[keys[i]] === null ? null : walk(x[keys[i]], i + 1);
      };
      return walk(v, 0) === true;
    };
    /* 読めない値は欄ごと落とす欄（知っている欄）。知らない欄として生き返らないこと。 */
    const bad = () => ({ id: "t-bad", title: "試験の崩れた用事", carried: { on: "x" }, act: { type: "?" },
      kind: "?", side: "?", endDay: "x", repeatWeeks: 99, weekMark: "x", gid: 1, gbatch: "" });
    const where = new Set();
    let after;
    if (way === "open") {
      const s = JSON.parse(JSON.stringify(S.get()));
      put(s, "", where);
      s.futureShelf = [{ id: "f1", note: "新しい版の棚" }];
      s.todos.push(bad());
      S.adoptRaw(JSON.stringify(s));
      after = JSON.parse(JSON.stringify(S.get()));
    } else {
      const f = JSON.parse(S.exportJSON("2026-10-22T00:00:00.000Z"));
      put(f, "", where);
      f.futureShelf = [{ id: "f1", note: "新しい版の棚" }];
      f.todos.push(bad());
      f.noteBook = { v: 1, notes: [{ id: "n1", text: "試験のノート" }] };   // 書き出しの付けたし（…Book）
      S.reset();
      S.importJSON(JSON.stringify(f));
      after = JSON.parse(JSON.stringify(S.get()));
    }
    return {
      where: where.size,
      lost: [...where].filter((p) => !has(after, p)).sort(),
      dropped: (() => { const t = after.todos.find((x) => x.id === "t-bad");
        return !!t && ["carried", "act", "kind", "side", "endDay", "repeatWeeks", "weekMark", "gid", "gbatch"].every((k) => !(k in t)); })(),
      envelope: ["exportedAt", "app", "noteBook", "lsSeq"].filter((k) => k in after),
      shelf: Array.isArray(after.futureShelf) && after.futureShelf[0] && after.futureShelf[0].note === "新しい版の棚",
    };
  }, way); };

  for (const [way, name] of [["open", "開く道（adoptRaw）"], ["import", "戻す道（importJSON）"]]) {
    const r = await run(way);
    if (process.env.KN_SHOW) console.log(way, JSON.stringify(r.lost));
    t.check(`${name}：知らない欄を足した入れ物が十分ある（${r.where}か所）`, r.where >= 20, String(r.where));
    t.check(`${name}：知らない棚（上の段）が残る${KNOWN[way].includes(".") ? "（KNOWN：いまは落ちる）" : ""}`,
      KNOWN[way].includes(".") ? !r.shelf : r.shelf);
    const fresh = r.lost.filter((p) => !KNOWN[way].includes(p));
    t.check(`${name}：KNOWN のほかに、知らない欄が落ちる所が無い`, fresh.length === 0, fresh.join("\n      "));
    t.check(`${name}：読めない値の欄（carried・act・kind ほか）は生き返らない`, r.dropped);
    t.check(`${name}：書き出しの付けたし（exportedAt・app・noteBook）は記録に入らない`, r.envelope.length === 0, r.envelope.join(", "));
    const healed = KNOWN[way].filter((p) => !r.lost.includes(p));
    t.check(`${name}：KNOWN の所は、まだ落ちる（直ったら KNOWN から消す）`, healed.length === 0, healed.join(", "));
  }

  /* 一件を直す道（古い版で一件だけ直したとき）。画面から来た欄（__ui）は残さない。 */
  await seed();
  const edit = await page.evaluate(() => {
    const S = KN.store;
    S.update((s) => {
      const d = s.diet;
      [d.meals[0], d.meals[0].items[0], d.drinks[0], d.urges[0], s.todos.find((t) => t.id === "t-uk").subs[0]]
        .forEach((x) => { x.__fut = "未来の欄"; });
    });
    const d = S.get().diet;
    S.updateMeal(d.meals[0].id, { memo: "直した" });
    S.updateDrink(d.drinks[0].id, { name: "直した", __ui: 1 });
    S.updateUrge(d.urges[0].id, { memo: "直した", __ui: 1 });
    S.setSubs("t-uk", [{ id: "s-uk", title: "直した", done: false, skipped: false, __ui: 1 }]);
    const a = S.get().diet, sub = S.get().todos.find((t) => t.id === "t-uk").subs[0];
    const xs = [a.meals[0], a.meals[0].items[0], a.drinks[0], a.urges[0], sub];
    return { kept: xs.map((x) => x.__fut === "未来の欄"), ui: xs.some((x) => "__ui" in x) };
  });
  t.check("一件を直す道（食事・明細・お酒・飲みたい・手順）：知らない欄が残る", edit.kept.every(Boolean), JSON.stringify(edit.kept));
  t.check("一件を直す道：画面から来た余計な欄は残さない", !edit.ui);

  t.check("エラーが出ない", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
