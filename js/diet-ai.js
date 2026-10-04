/* =========================================================
   くらしノート — AIに渡す口
   =========================================================

   鍵はこのアプリに置きません。置けないからではなく、置いてはいけないから
   です。ここはブラウザで動く静的なページで、埋めた文字列は誰でも読めます。
   APIキーを埋めるのは、鍵を玄関マットの下に置いて出かけるのと同じです。

   そのかわり、**窓口のURLをひとつ**設定に持ちます。その先（Cloudflare
   Workers でも、自分のサーバでも）に鍵を置き、そこがAIを呼びます。
   このファイルがするのは、送る中身を組み立てて、返ってきたものを
   読むところまでです。

   窓口が満たすべき約束（これだけです）:

     POST <窓口のURL>
     Content-Type: application/json

     ① 相談  { "kind": "coach", "question": "…", "data": { …本人の記録… } }
        → { "text": "…" }

     ② 写真  { "kind": "photo", "image": "data:image/jpeg;base64,…", "hint": "…" }
        → { "items": [ { "name":"ご飯", "grams":180,
                         "kcal":281, "p":4.5, "f":0.5, "c":66.8 } ],
            "note": "…" }

     ④ 推計  { "kind": "estimate", "prompt": "…「AI推計」でコピーさせている文そのもの…" }
        → { "text": "食品: …\n…\n評価: …" }（貼り付けと同じ形の返事）

        ①②④の返事には、任意で cost が付きます（見本の窓口は付けます）:
          { "model": "…", "inputTokens": n, "outputTokens": n, "searches": n, "usd": 0.07 }
        付いていれば画面に一回ぶんの料金の目安を出します。

     ③ 確かめる  GET <窓口のURL>  → { "ok": true, "model": "…" }（任意。無くても①②は動きます）

   しくじったときに { "error": "…" } を返せば、その文を画面に出します。
   この約束どおりの見本（Cloudflare Worker）は ai/ にあります。

   写真から返ってくる数は **推定** です。このアプリはそれを estimated: true
   の印つきで保存し、画面でも「約」と書きます。計算した値と推定した値が
   同じ顔で並ぶと、記録全体の信頼度が、いちばん低いところまで落ちます。 */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const url = () => String(store.get().settings.dietAiUrl || "").trim();
  const configured = () => /^https:\/\/\S+$/.test(url());

  function setUrl(v) {
    const clean = String(v || "").trim();
    store.update((s) => { s.settings.dietAiUrl = clean; });
    return clean;
  }

  function post(body, timeoutMs) {
    if (!configured()) return Promise.reject(new Error("AIの窓口が設定されていません"));
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 45000) : null;
    return fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(readReply)
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  /* しくじった窓口が { "error": "…" } を返していれば、その文を出します
     （見本の ai/worker.js はそう返します）。「502 を返しました」だけでは、
     鍵が違うのか、混んでいるのか、見分けがつかないので。 */
  function readReply(res) {
    if (res.ok) return res.json();
    return res.json()
      .catch(() => null)
      .then((j) => {
        const why = j && typeof j.error === "string" && j.error.trim();
        throw new Error(why || `窓口が ${res.status} を返しました`);
      });
  }

  /** 確かめる。見本の窓口は GET に { ok, model } を返します（料金はかかりません）。
      保存する前の欄の値でも確かめられるように、URLを受け取ります。 */
  function check(target) {
    const u = String(target || url()).trim();
    if (!/^https:\/\/\S+$/.test(u)) return Promise.reject(new Error("https:// で始まるURLにしてください"));
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
    return fetch(u, { method: "GET", signal: ctrl ? ctrl.signal : undefined })
      .then(readReply)
      .then((r) => {
        if (!r || r.ok !== true) throw new Error("窓口の返事の形が違います");
        return r;
      })
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  /**
   * 相談に渡す本人の記録。一般論ではなく本人のデータで答えてもらうための
   * 材料なので、生の記録そのものを渡します——ただし渡すのは
   * **ダイエットの数字だけ**。買い物リストもやることも、ここには入りません。
   */
  function payload(days, opts) {
    const U = KN.util;
    const D = KN.diet;
    const n = days || 30;
    const today = U.todayKey();
    const list = D.daysBetween(U.shiftDay(today, -(n - 1)), today);
    const g = store.get().diet.goal;
    const mealDay = opts && opts.mealDay;

    const out = {
      today,
      goal: {
        heightCm: g.heightCm, targetKg: g.targetKg, targetDay: g.targetDay,
        kcalTarget: g.kcalTarget, pTarget: g.pTarget, fTarget: g.fTarget, cTarget: g.cTarget,
      },
      summary: (() => {
        const s = D.weightSummary(n);
        return { latestKg: s.latest ? s.latest.kg : null, ma7: s.ma7Now,
                 trendPerWeek: s.trendPerWeek, bmi: s.bmi, toGoal: s.toGoal };
      })(),
      days: list.map((d) => {
        const w = store.weightOfDay(d);
        const t = D.dayTotals(d);
        return {
          day: d,
          weightKg: w ? w.kg : null,
          bodyFat: w ? w.fat : null,
          // 量った条件。食前/食後・着衣のあるなしで、体重は体の変化と
          // 同じくらい動きます。渡さないと、量り方の差を増減と読まれます。
          weighedMeal: w ? w.meal : null,
          weighedClothed: w ? w.clothed : null,
          kcal: t ? t.kcal : null,
          p: t ? t.p : null, f: t ? t.f : null, c: t ? t.c : null,
          steps: store.healthValue(d, "steps"),
          sleepMin: store.healthValue(d, "sleep"),
          activeEnergy: store.healthValue(d, "activeEnergy"),
          restingEnergy: store.healthValue(d, "restingEnergy"),
          // 安静時＋アクティブ。両方そろった日だけ数えます。
          burnedKcal: KN.diet.burnedOf(d),
          /* お酒。飲まなかった日は drinks:[] で、**その日を渡さない**のとは
             別のことです（記録が無いのか、飲まなかったのかを分けるため）。 */
          drinks: store.drinksOfDay(d).map((x) => ({
            kind: x.kind, name: x.name || null, volumeMl: x.volumeMl,
            abv: x.abv, alcoholG: x.alcoholG, kcal: x.kcal, estimated: x.estimated,
            // いつ、どんな気分で。きっかけが見えるとしたら、たぶんここです。
            time: x.time || null,
            mood: x.mood || null,
            moodTags: x.moodTags && x.moodTags.length ? x.moodTags : null,
          })),
          alcoholG: (store.drinkTotals(d) || {}).alcoholG != null ? store.drinkTotals(d).alcoholG : 0,
          drinkKcal: (store.drinkTotals(d) || {}).kcal != null ? store.drinkTotals(d).kcal : 0,
          workouts: store.healthOfDay(d, "workout").map((h) => ({ label: h.label, min: h.value, kcal: h.kcal })),
        };
      }).filter((r) => r.weightKg != null || r.kcal != null || r.steps != null
                    || r.sleepMin != null || r.drinks.length),
      // 相関を因果と言わせないための一言。窓口側のプロンプトにも
      // 同じことを書きますが、材料にも添えておきます。
      note: "相関を因果と断定しないこと。データが足りない項目は「わからない」と言うこと。"
        + "kcal は食べたものだけの数で、飲酒由来は drinkKcal に分けてある（足すかどうかは用途しだい）。"
        + "alcoholG は純アルコール量（ml×度数%÷100×0.8）。estimated が真のものは推定値なので、"
        + "細かい差を意味のあるものとして扱わないこと。"
        + "moodTags と mood は本人が書いた言葉で、こちらが用意した分類ではない。"
        + "件数が少ないうちは、言葉の重なりを傾向として語らないこと。"
        + "体重は weighedMeal（食前=before/食後=after）と weighedClothed（着衣の有無）で"
        + "条件が変わる。条件の違う日どうしの差を、体の変化として読まないこと。",
    };
    if (mealDay) {
      out.meals = mealsOf(mealDay);
      out.note += "meals はその日の食事の中身。memo は本人が書いたままの文で、量（amount）は目分量。"
        + "品目の数（kcal など）が無い食事は、数を推して断定しないこと。";
    }
    return out;
  }

  /**
   * 一日ぶんの食事の中身（本人が頼んだときだけ足す）。days の合計だけでは
   * 「何を食べたか」が見えないので、その日に書いた文と品目をそのまま渡します。
   * 読むのは食事の記録（diet.meals）だけです。
   */
  function mealsOf(day) {
    return {
      day,
      entries: store.mealsOfDay(day).map((m) => ({
        slot: m.slot,
        time: m.time || null,
        memo: String(m.memo || "").trim() || null,
        items: m.items.map((it) => ({
          name: it.name,
          slot: it.slot || null,
          amount: it.amount || null,
          grams: it.grams,
          kcal: it.kcal, p: it.p, f: it.f, c: it.c,
          fiber: it.fiber,
          estimated: it.estimated,
        })),
      })).filter((m) => m.memo || m.items.length),
    };
  }

  /** 窓口が返した料金の欄を、決まった形にそろえます（無ければ null）。 */
  function cleanCost(c) {
    if (!c || typeof c !== "object") return null;
    const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
    const out = {
      usd: n(c.usd), searches: n(c.searches) || 0,
      inputTokens: n(c.inputTokens), outputTokens: n(c.outputTokens),
      model: typeof c.model === "string" ? c.model.slice(0, 60) : "",
    };
    return out.usd == null && out.inputTokens == null ? null : out;
  }

  /* 円は目安です。為替は動くので、決めうちの一つの値で割り直します
     （細かく合わせるほどの額ではなく、「数円か、数十円か」が分かれば足ります）。 */
  const YEN_PER_USD = 150;
  /** 「約$0.065（約10円）・検索3回」。額が分からなければトークン数だけ。 */
  function costLabel(c) {
    if (!c) return "";
    const s = c.searches ? `・検索${c.searches}回` : "";
    if (c.usd == null) {
      return `入力${(c.inputTokens || 0).toLocaleString()}・出力${(c.outputTokens || 0).toLocaleString()}トークン${s}`;
    }
    const yen = c.usd * YEN_PER_USD;
    return `約$${c.usd < 0.01 ? c.usd.toFixed(4) : c.usd.toFixed(3)}（約${yen < 1 ? "1円未満" : Math.round(yen) + "円"}）${s}`;
  }

  /** opts.mealDay を渡すと、その日の食事の中身も材料に足します。
      @returns {Promise<{text:string, cost:object|null}>} */
  function coach(question, days, opts) {
    return post({ kind: "coach", question: String(question || ""), data: payload(days, opts) })
      .then((r) => ({
        text: String(r && r.text || "").trim() || "返事が空でした",
        cost: cleanCost(r && r.cost),
      }));
  }

  /* 「AI推計」の代行。いままで利用者がコピーして外のAIに貼っていた文を、
     そのまま窓口へ送ります。返事は貼り付けと同じ読み取りにかけるので、
     ここでは文のまま返します。Web で調べながら答えるので長めに待ちます。
     送るのはその文だけ（食事メモ・その日と直近の体の記録）です。 */
  function estimate(prompt) {
    return post({ kind: "estimate", prompt: String(prompt || "") }, 150000)
      .then((r) => {
        const text = String(r && r.text || "").trim();
        if (!text) throw new Error("返事が空でした");
        return { text, cost: cleanCost(r && r.cost) };
      });
  }

  /** @returns {Promise<{items:Array, note:string}>} 値はすべて推定です。 */
  function analyzePhoto(dataUrl, hint) {
    return post({ kind: "photo", image: dataUrl, hint: String(hint || "") }, 60000)
      .then((r) => {
        const rows = Array.isArray(r && r.items) ? r.items : [];
        return {
          items: rows.map((it) => ({
            name: String(it.name || "").trim() || "食べたもの",
            grams: Number(it.grams) > 0 ? Math.round(Number(it.grams)) : null,
            kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
            p: Math.max(0, Math.round((Number(it.p) || 0) * 10) / 10),
            f: Math.max(0, Math.round((Number(it.f) || 0) * 10) / 10),
            c: Math.max(0, Math.round((Number(it.c) || 0) * 10) / 10),
            from: "ai",
            estimated: true,
          })).filter((it) => it.name),
          note: String(r && r.note || ""),
        };
      });
  }

  /* 写真は送る前に縮めます。4000pxの写真をそのまま投げても、返ってくる
     推定は良くなりませんし、通信と料金だけが増えます。 */
  function shrink(file, maxSide) {
    return new Promise((resolve, reject) => {
      const side = maxSide || 1024;
      const img = new Image();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("写真を読めませんでした"));
      reader.onload = () => {
        img.onerror = () => reject(new Error("写真を開けませんでした"));
        img.onload = () => {
          const scale = Math.min(1, side / Math.max(img.width, img.height));
          const cv = document.createElement("canvas");
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  KN.dietAI = { configured, url, setUrl, check, coach, estimate, costLabel, cleanCost, analyzePhoto, shrink, payload };
})();
