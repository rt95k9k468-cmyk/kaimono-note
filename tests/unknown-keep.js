/* 知らない欄を落とさない（2026年10月22日、docs/storage.md「知らない欄」）。

   悪い版は revert で戻す。そのとき古い版が、新しい版の書いた記録を開いて保存すると、
   古い版の知らない欄が黙って消えうる（reconcile() が知っている欄だけで作り直す所）。
   記録のあらゆる入れ物に知らない欄（__fut）を入れ、二つの道で残るかを見る：
     開く道：写しから戻す adoptRaw()（＝開いたときの load と同じ loadFrom → reconcile）
     戻す道：書き出したファイルを importJSON()
   いま落ちる所は KNOWN に並べて許す（直すかは利用者の返事待ち）。ここに無い所で
   落ちたら赤。KNOWN の所が落ちなくなったら、KNOWN から消す（それも赤で知らせる）。
   アプリのコードは触らない。見るだけ。 */
const { open, checker } = require("./lib");

/* いま落ちる所（2026年10月22日に測った）。道ごと。 */
const KNOWN = {
  open: [
    ".archive", ".asks.#", ".diet", ".diet.drinks.#", ".diet.foods.#", ".diet.health.#", ".diet.meals.#",
    ".diet.meals.#.items.#", ".diet.urges.#", ".diet.weights.#", ".iconReports.#", ".sets.#", ".todos.#",
  ],
  /* 戻す道は上の段も知っている鍵だけ（"." に足した欄も、知らない棚も落ちる）。 */
  import: [
    ".", ".archive", ".asks.#", ".diet", ".diet.drinks.#", ".diet.foods.#", ".diet.health.#", ".diet.meals.#",
    ".diet.meals.#.items.#", ".diet.urges.#", ".diet.weights.#", ".iconReports.#", ".sets.#", ".todos.#",
  ],
};

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
  });

  /* 入れ物ぜんぶ（配列の中の一件も、入れ子も）に __fut を足し、どこへ足したかを返す。
     配列の添え字は # にまとめる（同じ入れ物の何件目かは問わない）。 */
  const run = async (way) => { await seed(); return page.evaluate((way) => {
    const S = KN.store;
    const DICT = [".learned", ".iconOverrides", ".settings.captureDest"];
    const put = (v, path, out) => {
      if (Array.isArray(v)) { v.forEach((x) => put(x, path + ".#", out)); return; }
      if (!v || typeof v !== "object") return;
      if (DICT.includes(path)) return;   // 鍵が利用者の言葉の辞書は入れ物でない
      for (const k of Object.keys(v)) put(v[k], path + "." + k, out);
      v.__fut = "未来の欄";
      out.add(path || ".");
    };
    const has = (v, path) => {
      const keys = path === "." ? [] : path.slice(1).split(".");
      const walk = (x, i) => {
        if (i === keys.length) return !!x && typeof x === "object" && !Array.isArray(x) && x.__fut === "未来の欄";
        if (Array.isArray(x)) return keys[i] === "#" && x.length > 0 && x.every((y) => walk(y, i + 1));
        return !!x && typeof x === "object" && walk(x[keys[i]], i + 1);
      };
      return walk(v, 0);
    };
    const where = new Set();
    let after;
    if (way === "open") {
      const s = JSON.parse(JSON.stringify(S.get()));
      put(s, "", where);
      s.futureShelf = [{ id: "f1", note: "新しい版の棚" }];
      S.adoptRaw(JSON.stringify(s));
      after = JSON.parse(JSON.stringify(S.get()));
    } else {
      const f = JSON.parse(S.exportJSON("2026-10-22T00:00:00.000Z"));
      put(f, "", where);
      f.futureShelf = [{ id: "f1", note: "新しい版の棚" }];
      S.reset();
      S.importJSON(JSON.stringify(f));
      after = JSON.parse(JSON.stringify(S.get()));
    }
    return {
      where: where.size,
      lost: [...where].filter((p) => !has(after, p)).sort(),
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
    const healed = KNOWN[way].filter((p) => !r.lost.includes(p));
    t.check(`${name}：KNOWN の所は、まだ落ちる（直ったら KNOWN から消す）`, healed.length === 0, healed.join(", "));
  }

  t.check("エラーが出ない", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
