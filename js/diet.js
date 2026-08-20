/* =========================================================
   くらしノート — ダイエットの計算
   =========================================================

   ここには画面がありません。体重の並び、移動平均、傾き、今日の合計、
   そして「関連が見られる」の言い方——数だけを扱います。

   ひとつ約束があります。**分からないときは null を返す**こと。
   データが足りないところに 0 を置くと、画面は「今日は0kcal」「歩数0歩」と
   平然と言います。それは記録ではなく作り話です。 */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const store = KN.store;

  const round = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  /* ---------------- 体重の並び ---------------- */

  /** 古い順に day を並べる（from と to を含む）。 */
  function daysBetween(from, to) {
    const out = [];
    let d = from;
    for (let i = 0; i < 4000 && d <= to; i++) { out.push(d); d = U.shiftDay(d, 1); }
    return out;
  }

  /**
   * 一日一点の体重の並び。値のある日だけを返します。
   * 測っていない日を前日の値で埋めることはしません——埋めた点は
   * 「測らなかった」という事実を消したうえ、移動平均をなだらかに見せます。
   */
  function weightPoints(fromDay, toDay) {
    const seen = new Map();
    store.get().diet.weights.forEach((w) => {
      if (fromDay && w.day < fromDay) return;
      if (toDay && w.day > toDay) return;
      const cur = seen.get(w.day);
      // その日の最初の一回（起き抜け）を代表にします。
      if (!cur || (w.time || "00:00") < (cur.time || "00:00")) seen.set(w.day, w);
    });
    return [...seen.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((w) => ({ day: w.day, kg: w.kg, fat: w.fat, source: w.source, id: w.id,
                     meal: w.meal, clothed: w.clothed }));
  }

  /**
   * 後ろ向き移動平均。窓は「日数」であって「点の数」ではありません——
   * 三日に一度しか乗らない人の「7日平均」が、実際には三週間ぶんを
   * 均したものになってしまうので。
   * @param minPoints 窓の中にこれだけ点が無ければ null（薄い平均は嘘に近い）
   */
  function movingAverage(points, windowDays, minPoints) {
    const need = minPoints || Math.max(2, Math.ceil(windowDays / 3));
    // 窓ぜんぶが記録の中に入っている日から先が「満ちた」平均です。
    const firstFull = points.length ? U.shiftDay(points[0].day, windowDays - 1) : null;
    return points.map((pt) => {
      const from = U.shiftDay(pt.day, -(windowDays - 1));
      const inWin = points.filter((q) => q.day >= from && q.day <= pt.day);
      if (inWin.length < need) return { day: pt.day, value: null, full: false };
      return {
        day: pt.day,
        value: round(mean(inWin.map((q) => q.kg)), 2),
        /* 記録の頭のほうは、窓が record の外にはみ出していて、実際には
           3日ぶんや4日ぶんの平均です。出すことは出しますが（毎日は乗らない
           人にも線を見せたいので）、傾きを当てる材料からは外します——
           助走ぶんの短い平均が混ざると、傾きが実際より寝ます。 */
        full: firstFull != null && pt.day >= firstFull,
      };
    });
  }

  /**
   * 最小二乗の傾き。返すのは kg/週。
   * 点が3つ未満、または期間が短すぎるときは null。
   */
  function slopePerWeek(points) {
    const pts = points.filter((p) => p.value != null || p.kg != null)
      .map((p) => ({ t: U.dayDate(p.day).getTime() / 86400000, v: p.value != null ? p.value : p.kg }));
    if (pts.length < 3) return null;
    const span = pts[pts.length - 1].t - pts[0].t;
    if (span < 6) return null;   // 一週間に満たない傾きは、傾きというより揺れ
    const mt = mean(pts.map((p) => p.t)), mv = mean(pts.map((p) => p.v));
    let num = 0, den = 0;
    pts.forEach((p) => { num += (p.t - mt) * (p.v - mv); den += (p.t - mt) ** 2; });
    if (!den) return null;
    return round((num / den) * 7, 3);
  }

  /** 画面ひとつぶんの体重まわり。無い数は null のまま渡します。
   *
   *  endDay を渡すと、その日を「いま」として数えます——過ぎた日を開いて
   *  いるあいだ、右の三つ（前回比・7日平均・目標まで）まで今日の数のままだと、
   *  大きい数字とその横の数が別々の日の話になります。渡さなければ今日で、
   *  これまでの呼び出しは何も変わりません。 */
  function weightSummary(windowDays, endDay) {
    const today = endDay || U.todayKey();
    const win = windowDays || 90;
    const pts = weightPoints(U.shiftDay(today, -(win - 1)), today);
    const ma7 = movingAverage(pts, 7);
    const ma14 = movingAverage(pts, 14);
    const last = pts.length ? pts[pts.length - 1] : null;
    const prev = pts.length > 1 ? pts[pts.length - 2] : null;
    const lastMa = [...ma7].reverse().find((m) => m.value != null) || null;

    const goal = store.get().diet.goal;
    const height = goal.heightCm;
    return {
      points: pts,
      ma7, ma14,
      latest: last,
      // 前回比。前の「日」との差であって、前の「回」との差ではありません
      // ——同じ日の朝と夜を比べても、それは一日の中の水の出入りです。
      delta: last && prev ? round(last.kg - prev.kg, 2) : null,
      deltaDays: last && prev ? Math.round((U.dayDate(last.day) - U.dayDate(prev.day)) / 86400000) : null,
      ma7Now: lastMa ? lastMa.value : null,
      trendPerWeek: (() => {
        const full = ma7.filter((m) => m.value != null && m.full);
        if (full.length >= 3) return slopePerWeek(full);
        const any = ma7.filter((m) => m.value != null);
        return slopePerWeek(any.length >= 3 ? any : pts);
      })(),
      bmi: last && height ? round(last.kg / (height / 100) ** 2, 1) : null,
      toGoal: last && goal.targetKg != null ? round(last.kg - goal.targetKg, 2) : null,
      goal,
    };
  }

  /**
   * 目標に届く日の見込み。断定しません——返すのは
   * 「いまの傾きが続いたとき」の話で、そう書いてある名前にしてあります。
   */
  function projection() {
    const s = weightSummary(90);
    const base = s.ma7Now != null ? s.ma7Now : (s.latest ? s.latest.kg : null);
    const target = s.goal.targetKg;
    const rate = s.trendPerWeek;   // kg/週（減っていれば負）
    if (base == null || target == null || rate == null) return null;
    const gap = base - target;
    if (Math.abs(gap) < 0.05) return { reached: true };
    // 向きが合っていなければ、日付は出しません。「このままでは着かない」と
    // だけ言うほうが、遠い未来の日付を出すより正直です。
    if (gap > 0 && rate >= -0.01) return { stalled: true, rate };
    if (gap < 0 && rate <= 0.01) return { stalled: true, rate };
    const weeks = gap / -rate;
    if (!Number.isFinite(weeks) || weeks <= 0 || weeks > 520) return { far: true, rate };
    const days = Math.round(weeks * 7);
    return { day: U.shiftDay(U.todayKey(), days), days, weeks: round(weeks, 1), rate };
  }

  /** 目標日までに必要な週あたりのペース。 */
  function neededPace() {
    const g = store.get().diet.goal;
    const last = store.latestWeight();
    if (!last || g.targetKg == null || !g.targetDay) return null;
    const days = U.daysUntil(g.targetDay);
    if (days == null || days <= 0) return null;
    return round((g.targetKg - last.kg) / (days / 7), 2);
  }

  /* ---------------- 食事 ---------------- */

  /** その日に食べたものの合計。食事が一件も無ければ null（0 ではなく）。 */
  function dayTotals(day) {
    const meals = store.mealsOfDay(day);
    if (!meals.length) return null;
    const sum = { kcal: 0, p: 0, f: 0, c: 0, fiber: null, low: null, high: null,
                  estimated: false, items: 0 };
    meals.forEach((m) => m.items.forEach((it) => {
      sum.kcal += it.kcal; sum.p += it.p; sum.f += it.f; sum.c += it.c;
      if (it.fiber != null) sum.fiber = (sum.fiber || 0) + it.fiber;
      sum.items += 1;
      if (it.estimated) sum.estimated = true;
    }));
    /* 推定の幅は、AIに聞いた日だけ付きます。合計そのものではなく
       「どれくらい確からしいか」なので、足し合わせずそのまま持ちます。 */
    meals.forEach((m) => {
      if (!m.ai) return;
      if (m.ai.low != null) sum.low = (sum.low || 0) + m.ai.low;
      if (m.ai.high != null) sum.high = (sum.high || 0) + m.ai.high;
    });
    /* 数の入っていない日（メモだけ書いた日）は「0kcal」ではありません。
       0 と書くと、何も食べなかったことになります。 */
    if (!sum.items) return null;
    sum.kcal = Math.round(sum.kcal);
    sum.p = round(sum.p, 1); sum.f = round(sum.f, 1); sum.c = round(sum.c, 1);
    if (sum.fiber != null) sum.fiber = round(sum.fiber, 1);
    if (sum.low != null) sum.low = Math.round(sum.low);
    if (sum.high != null) sum.high = Math.round(sum.high);
    return sum;
  }

  /* ---------------- 区分ごと、そして総消費との割合 ----------------

     「一日で何kcal食べたか」だけでは、次にどうするかが決まりません。
     朝が軽すぎるのか、夜が重いのか、間食なのか、お酒なのか——**どこから
     来たか**が分かってはじめて、動かす場所が決まります。

     そして、それを **総消費に対する割合** で見ます。1,800kcal が多いのか
     少ないのかは、その日どれだけ使ったか次第なので。 */

  const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
  const SLOT_LABEL = { breakfast: "朝", lunch: "昼", dinner: "夜", snack: "間食" };

  /** 区分ごとの合計。AIが食品ごとに区分を付けてくれた日は、ここが埋まります。 */
  function slotTotals(day) {
    const out = { breakfast: 0, lunch: 0, dinner: 0, snack: 0, other: 0, any: false };
    const meals = store.mealsOfDay(day);
    meals.forEach((m) => m.items.forEach((it) => {
      const key = MEAL_SLOTS.includes(it.slot) ? it.slot
        : (MEAL_SLOTS.includes(m.slot) ? m.slot : "other");
      out[key] += it.kcal;
      if (it.kcal) out.any = true;
    }));
    MEAL_SLOTS.concat("other").forEach((k) => { out[k] = Math.round(out[k]); });

    /* 食品ごとの区分が一つも拾えなかった日でも、AIが「朝合計」まで
       書いてくれていれば、そちらを使います。使ったぶんは「区分なし」から
       引きます——同じカロリーを二度数えないためです。 */
    const ai = (meals.find((m) => m.ai && m.ai.slots) || {}).ai;
    if (ai && !MEAL_SLOTS.some((k) => out[k])) {
      let used = 0;
      MEAL_SLOTS.forEach((k) => {
        const v = ai.slots[k];
        if (v == null) return;
        out[k] = Math.round(v);
        used += out[k];
        if (out[k]) out.any = true;
      });
      out.other = Math.max(0, out.other - used);
    }
    return out;
  }

  /**
   * 一本の帯にするための組み立て。
   *
   *   朝 → 昼 → 夜 → 間食 →（区分なし）→ 飲酒 → 残り
   *
   * 全体（100%）は **その日の総消費**。総消費が分からない日は、割合の
   * 話ができないので「内わけ」として同じ帯を出します（そう書きます）。
   * 摂取が総消費を超えた日は、帯を摂取いっぱいまで使って、超えたぶんを
   * 別に言います——「残り」を負の長さで描くことはできません。
   */
  function energySplit(day) {
    const st = slotTotals(day);
    const dt = store.drinkTotals(day);
    const drink = dt ? dt.kcal : 0;
    const eaten = MEAL_SLOTS.reduce((a, k) => a + st[k], 0) + st.other;
    const intake = eaten + drink;
    const burned = burnedOf(day);
    const parts = [
      { id: "breakfast", label: "朝",   kcal: st.breakfast },
      { id: "lunch",     label: "昼",   kcal: st.lunch },
      { id: "dinner",    label: "夜",   kcal: st.dinner },
      { id: "snack",     label: "間食", kcal: st.snack },
      { id: "other",     label: "区分なし", kcal: st.other },
      { id: "drink",     label: "飲酒", kcal: drink },
    ].filter((x) => x.kcal > 0);
    if (!intake) return null;

    const known = burned != null && burned > 0;
    const over = known && intake > burned;
    // 割合の分母。総消費が分からない日と、超えた日は、摂取そのものを分母に。
    const base = known && !over ? burned : intake;
    parts.forEach((x) => { x.pct = Math.round((x.kcal / base) * 1000) / 10; });
    const rest = known && !over ? Math.max(0, burned - intake) : 0;
    return {
      parts, intake, eaten, drink, burned, rest, over,
      /* 総消費が分かる日だけ、割合の話になります。分からない日は
         同じ帯を「内わけ」として読みます。 */
      known,
      restPct: known && !over ? Math.round((rest / base) * 1000) / 10 : 0,
      intakePct: known ? Math.round((intake / burned) * 1000) / 10 : null,
      overKcal: over ? Math.round(intake - burned) : 0,
    };
  }

  /** 目標があるときだけ「残り」を出します。 */
  function remaining(day) {
    const g = store.get().diet.goal;
    if (g.kcalTarget == null) return null;
    const t = dayTotals(day);
    return { kcal: Math.round(g.kcalTarget - (t ? t.kcal : 0)), target: g.kcalTarget, eaten: t ? t.kcal : 0 };
  }

  /** PFCの熱量比（%）。合計が0なら null。 */
  function pfcRatio(totals) {
    if (!totals) return null;
    const kp = totals.p * 4, kf = totals.f * 9, kc = totals.c * 4;
    const all = kp + kf + kc;
    if (all <= 0) return null;
    return { p: Math.round(kp / all * 100), f: Math.round(kf / all * 100), c: Math.round(kc / all * 100) };
  }

  /* ---------------- 一日ぶんのまとめ ---------------- */

  /** ホームが一目で読むもの。取れていないものは null のまま。 */
  function dayCard(day) {
    const d = day || U.todayKey();
    const w = store.weightOfDay(d);
    const totals = dayTotals(d);
    const workouts = store.healthOfDay(d, "workout");
    return {
      day: d,
      weight: w,
      totals,
      remaining: remaining(d),
      pfc: pfcRatio(totals),
      steps: store.healthValue(d, "steps"),
      distance: store.healthValue(d, "distance"),
      activeEnergy: store.healthValue(d, "activeEnergy"),
      restingEnergy: store.healthValue(d, "restingEnergy"),
      // 睡眠は前の晩のもの。日付は「起きた日」に付いている前提です
      // （ショートカット側でもそう書き出します）。
      sleep: store.healthValue(d, "sleep"),
      heartRate: store.healthValue(d, "heartRate"),
      /* 総消費。安静時＋アクティブ。

         別々に見せていましたが、「今日どれだけ使ったか」を知りたいときに
         二つの数を足させるのは、こちらがやるべき仕事です。片方しか
         取れていない日は、足すと嘘になるので null にします——
         「1,444kcal使った」と「安静時ぶんしか分からない」は違います。 */
      burned: burnedOf(d),
      workouts,
      drinks: store.drinksOfDay(d),
      drinkTotals: store.drinkTotals(d),
    };
  }

  /** その日の総消費。両方そろっているときだけ数えます。 */
  function burnedOf(day) {
    const rest = store.healthValue(day, "restingEnergy");
    const act = store.healthValue(day, "activeEnergy");
    if (rest == null && act == null) return null;
    if (rest == null || act == null) return null;
    return Math.round(rest + act);
  }

  /* ---------------- 統合分析 ----------------

     ここがこの機能の芯です。そして、いちばん嘘をつきやすいところでもあります。

     二つだけ守ります。
       1. 少ない標本で言い切らない。件数が足りなければ、その項目は出しません。
       2. 「原因」と言わない。出てくるのは並んだ二つの数の関係だけで、
          どちらがどちらを動かしたのかは、この計算では分かりません。
     だから文は「〜な傾向があります」「関連が見られます」で終わり、
     必ず何件ぶんの話かを添えます。 */

  const MIN_GROUP = 3;   // 片側にこれだけ無ければ、比べません

  function weeksOf(days) {
    // 直近から7日ずつ区切る。週の切れ目は曜日ではなく「今日から数えて」。
    const out = [];
    for (let i = 0; i < days; i += 7) {
      out.push({
        to: U.shiftDay(U.todayKey(), -i),
        from: U.shiftDay(U.todayKey(), -(i + 6)),
      });
    }
    return out;
  }

  function analyze(windowDays) {
    const win = windowDays || 30;
    const today = U.todayKey();
    const from = U.shiftDay(today, -(win - 1));
    const out = [];
    const pts = weightPoints(from, today);

    /* --- 期間の増減 --- */
    if (pts.length >= 2) {
      const ma = movingAverage(pts, 7).filter((m) => m.value != null);
      let first, last, basis;
      if (ma.length >= 2) { first = ma[0].value; last = ma[ma.length - 1].value; basis = "7日平均"; }
      else { first = pts[0].kg; last = pts[pts.length - 1].kg; basis = "実測"; }
      const diff = round(last - first, 2);
      out.push({
        id: "change",
        title: `${win}日間の変化`,
        text: diff === 0
          ? `${basis}で見て、ほぼ変わっていません（${pts.length}日ぶんの記録）。`
          : `${basis}で ${diff > 0 ? "+" : ""}${diff}kg です（${pts.length}日ぶんの記録）。`,
        value: diff, tone: diff < 0 ? "good" : diff > 0 ? "warn" : "flat", n: pts.length,
      });
    }

    /* --- 歩数と、体重が動いた向き --- */
    const weekRows = weeksOf(win).map((wk) => {
      const inWk = pts.filter((p) => p.day >= wk.from && p.day <= wk.to);
      if (inWk.length < 2) return null;
      const stepsDays = daysBetween(wk.from, wk.to)
        .map((d) => store.healthValue(d, "steps")).filter((v) => v != null);
      if (!stepsDays.length) return null;
      return {
        delta: inWk[inWk.length - 1].kg - inWk[0].kg,
        steps: mean(stepsDays),
        kcal: mean(daysBetween(wk.from, wk.to).map((d) => {
          const t = dayTotals(d); return t ? t.kcal : null;
        }).filter((v) => v != null)),
      };
    }).filter(Boolean);

    const down = weekRows.filter((r) => r.delta < 0);
    const up = weekRows.filter((r) => r.delta > 0);
    if (down.length >= 2 && up.length >= 2) {
      const ds = Math.round(mean(down.map((r) => r.steps)));
      const us = Math.round(mean(up.map((r) => r.steps)));
      out.push({
        id: "steps-weeks",
        title: "歩数と体重の動き",
        text: `体重が減った週の平均は ${ds.toLocaleString()}歩、増えた週は ${us.toLocaleString()}歩でした`
          + `（減った週 ${down.length}週 / 増えた週 ${up.length}週）。`
          + (Math.abs(ds - us) < 500 ? "差はほとんどありません。" : "関連が見られます。"),
        tone: "info", n: weekRows.length,
      });
      const dk = down.map((r) => r.kcal).filter((v) => v != null);
      const uk = up.map((r) => r.kcal).filter((v) => v != null);
      if (dk.length >= 2 && uk.length >= 2) {
        out.push({
          id: "kcal-weeks",
          title: "摂取カロリーと体重の動き",
          text: `減った週の平均は ${Math.round(mean(dk)).toLocaleString()}kcal/日、`
            + `増えた週は ${Math.round(mean(uk)).toLocaleString()}kcal/日でした`
            + `（食事を記録した日だけの平均）。`,
          tone: "info", n: dk.length + uk.length,
        });
      }
    }

    /* --- 睡眠が短かった日の、翌日の体重 ---
       素の体重どうしを比べても、長い減量の途中なら後の日ほど軽いに決まって
       います。なので、その日の7日平均からの **ずれ** を比べます。 */
    const maMap = new Map(movingAverage(pts, 7).map((m) => [m.day, m.value]));
    const short = [], normal = [];
    pts.forEach((p) => {
      const ma = maMap.get(p.day);
      if (ma == null) return;
      const sleepPrev = store.healthValue(p.day, "sleep");   // その朝までの睡眠
      if (sleepPrev == null) return;
      (sleepPrev < 360 ? short : normal).push(p.kg - ma);
    });
    if (short.length >= MIN_GROUP && normal.length >= MIN_GROUP) {
      const diff = round(mean(short) - mean(normal), 2);
      out.push({
        id: "sleep",
        title: "睡眠と体重",
        text: Math.abs(diff) < 0.1
          ? `睡眠6時間未満の日（${short.length}日）と、それ以外の日（${normal.length}日）で、`
            + `その週の平均からのずれに目立った差はありません。`
          : `睡眠6時間未満の日は、その週の平均より ${diff > 0 ? "+" : ""}${diff}kg でした`
            + `（6時間未満 ${short.length}日 / それ以外 ${normal.length}日）。傾向が見られます。`,
        tone: "info", n: short.length + normal.length,
      });
    }

    /* --- 量る条件 ---

       ここは、ほかの項目より効きます。食前と食後、着ているかいないかは、
       体そのものの変化ではなく **測り方の差** なので、混ざったまま並ぶと
       増減として読めてしまいます。どれだけ違うのかを数で出しておけば、
       次からは差し引いて読めます。

       比べるのは素の体重ではなく、その日の7日平均からの **ずれ** です。
       素で比べると、減量の途中なら後の日ほど軽いという当たり前しか
       出てきません。 */
    /* ここだけは、7日平均ではなく **期間ぜんぶに引いた直線** からのずれで
       比べます。理由があります。7日平均はその点自身を含む後ろ向きの窓
       なので、一日おきに着衣ありなしを繰り返す人だと、窓の中に自分と同じ
       条件の日が多め（7日なら4日対3日）に入ります。すると平均が自分の
       ほうへ寄って、差が実際より小さく出ます——0.8kgの差が0.69kgに見える。
       量り方の差を数で出すのがここの仕事なので、それでは足りません。
       直線なら、条件は傾きに乗らず、まとめて切片に吸われるので、
       二つの組のずれの差がそのまま量り方の差になります。

       睡眠や休日のほうを7日平均のままにしてあるのは、あちらが訊いている
       のが「その前後の日と比べて重かったか」だからです。問いが違えば、
       比べる相手も違います。 */
    const line = (() => {
      const xs = pts.map((p) => U.dayDate(p.day).getTime() / 86400000);
      const mx = mean(xs), my = mean(pts.map((p) => p.kg));
      let num = 0, den = 0;
      xs.forEach((x, i) => { num += (x - mx) * (pts[i].kg - my); den += (x - mx) ** 2; });
      const slope = den ? num / den : 0;
      return (day) => my + slope * (U.dayDate(day).getTime() / 86400000 - mx);
    })();

    const splitBy = (pick) => {
      const a = [], b = [];
      pts.forEach((p) => {
        const side = pick(p);
        if (side === true) a.push(p.kg - line(p.day));
        else if (side === false) b.push(p.kg - line(p.day));
      });
      return { a, b };
    };

    const condition = (id, title, pick, nameA, nameB) => {
      const { a, b } = splitBy(pick);
      if (a.length < MIN_GROUP || b.length < MIN_GROUP) return;
      const diff = round(mean(a) - mean(b), 2);
      out.push({
        id, title,
        text: Math.abs(diff) < 0.1
          ? `${nameA}（${a.length}日）と${nameB}（${b.length}日）で、`
            + `その週の平均からのずれに目立った差はありません。`
          : `${nameA}は${nameB}より平均 ${diff > 0 ? "+" : ""}${diff}kg でした`
            + `（${nameA} ${a.length}日 / ${nameB} ${b.length}日）。`
            + `体の変化ではなく、量り方の差として読めます。`,
        value: diff, tone: "info", n: a.length + b.length,
      });
    };

    condition("meal", "食前と食後",
      (p) => (p.meal === "after" ? true : (p.meal === "before" ? false : null)), "食後", "食前");
    condition("clothed", "服装",
      (p) => (p.clothed === true ? true : (p.clothed === false ? false : null)), "着衣あり", "着衣なし");

    /* 二つの条件が一緒に動いていたら、そう言います。
       食後にはいつも服を着ていて、食前にはいつも脱いでいる人の記録では、
       出てくる二つの数はどちらも「食後の差」と「着衣の差」の合計です。
       そのまま並べると、両方を二重に数えたことになります。
       切り分けられないことは、切り分けられないと書くのが唯一正しい。 */
    const both = pts.filter((p) => p.meal != null && p.clothed != null);
    if (both.length >= MIN_GROUP * 2 && out.some((f) => f.id === "meal") && out.some((f) => f.id === "clothed")) {
      const after = both.filter((p) => p.meal === "after");
      const before = both.filter((p) => p.meal === "before");
      const rate = (xs) => (xs.length ? xs.filter((p) => p.clothed).length / xs.length : null);
      const ra = rate(after), rb = rate(before);
      if (ra != null && rb != null && Math.abs(ra - rb) > 0.5) {
        const note = `なお、この期間は食前・食後と服装がほとんど一緒に動いています`
          + `（食後の${Math.round(ra * 100)}%、食前の${Math.round(rb * 100)}%が着衣あり）。`
          + `上の二つの差は切り分けられていないので、それぞれ多めに出ています。`;
        ["meal", "clothed"].forEach((id) => {
          const f = out.find((x) => x.id === id);
          if (f) { f.text += note; f.tone = "warn"; f.entangled = true; }
        });
      }
    }

    /* --- 収支 ---

       いちばん知りたいのはここです。「1,800kcal 食べた」も「8,000歩
       歩いた」も、それ単体では次の一手になりません。**使ったぶんに対して
       どれだけ入れたか**が分かってはじめて、増えるほうへ進んでいるのか
       減るほうへ進んでいるのかが言えます。

       体脂肪1kg はおよそ 7,200kcal——ここから「この差が続けば1週間で
       何kg ぶんか」を出します。ただし、これは**計算上の見込み**であって
       予報ではありません。摂取はAIの推計、総消費も端末の推計です。
       だから、同じ期間の実測がある日は必ず並べて出します。ずれていたら、
       ずれているという事実のほうが、計算より役に立ちます。 */
    const balDays = daysBetween(from, today).map((d) => {
      const t = dayTotals(d);
      const burned = burnedOf(d);
      if (!t || burned == null || burned <= 0) return null;
      const dt = store.drinkTotals(d);
      return { day: d, intake: t.kcal + (dt ? dt.kcal : 0), burned };
    }).filter(Boolean);
    if (balDays.length >= MIN_GROUP) {
      const gap = mean(balDays.map((r) => r.intake - r.burned));
      const perWeek = round(gap * 7 / 7200, 2);
      const changed = out.find((f) => f.id === "change");
      out.push({
        id: "balance",
        title: "食べたぶんと、使ったぶん",
        text: `両方そろっている ${balDays.length}日の平均で、摂取は総消費より`
          + `1日 ${Math.abs(Math.round(gap)).toLocaleString()}kcal ${gap >= 0 ? "多め" : "少なめ"}です`
          + `（摂取 ${Math.round(mean(balDays.map((r) => r.intake))).toLocaleString()}kcal / `
          + `総消費 ${Math.round(mean(balDays.map((r) => r.burned))).toLocaleString()}kcal）。`
          + `体脂肪1kgをおよそ7,200kcalとすると、この差が続けば1週間で `
          + `${perWeek > 0 ? "+" : ""}${perWeek}kg ぶんの計算になります。`
          + (changed
            ? `実測は同じ期間で ${changed.value > 0 ? "+" : ""}${changed.value}kg でした。`
              + `計算と実測がずれるのはふつうです（摂取も総消費も推定なので）。`
              + `どちらかに合わせにいくより、同じ測り方で続けたときの向きを見てください。`
            : `摂取も総消費も推定なので、実測の体重の動きと突き合わせて読んでください。`),
        value: round(gap, 0), tone: gap > 0 ? "warn" : "good", n: balDays.length,
      });
    }

    /* --- どこで食べているか ---

       一日の合計が同じでも、朝に寄っているのか夜に寄っているのかで、
       次に動かせる場所が変わります。ここは「多い・少ない」ではなく、
       いまどうなっているかを数で置くだけにします。 */
    const slotDays = daysBetween(from, today).map((d) => slotTotals(d)).filter((s) => s.any);
    if (slotDays.length >= MIN_GROUP) {
      const avg = {};
      MEAL_SLOTS.concat("other").forEach((k) => { avg[k] = mean(slotDays.map((s) => s[k])); });
      const all = MEAL_SLOTS.concat("other").reduce((a, k) => a + avg[k], 0);
      const pct = (k) => (all > 0 ? Math.round(avg[k] / all * 100) : 0);
      const heavy = MEAL_SLOTS.slice().sort((a, b) => avg[b] - avg[a])[0];
      out.push({
        id: "slot",
        title: "どの食事が重いか",
        text: `区分の分かる ${slotDays.length}日の平均は、`
          + MEAL_SLOTS.map((k) => `${SLOT_LABEL[k]} ${Math.round(avg[k]).toLocaleString()}kcal（${pct(k)}%）`).join("・")
          + (avg.other >= 1 ? `、区分なし ${Math.round(avg.other).toLocaleString()}kcal（${pct("other")}%）` : "")
          + `。いちばん重いのは${SLOT_LABEL[heavy]}で、一日の${pct(heavy)}%です。`,
        tone: "info", n: slotDays.length,
      });
    }

    /* --- 夕食が重かった日と、その翌朝 ---

       上の「どこで食べているか」は、いまの形を置くだけです。ここは
       それが**並びに出ているか**を見ます。分ける線は決め打ちにせず、
       その人の記録の真ん中（中央値）にします——「夜は40%まで」のような
       外から持ってきた線は、人によって当たり外れが大きいので。 */
    const shares = daysBetween(from, today).map((d) => {
      const s = slotTotals(d);
      const eaten = MEAL_SLOTS.reduce((a, k) => a + s[k], 0) + s.other;
      if (!s.any || eaten <= 0) return null;
      return { day: d, share: s.dinner / eaten };
    }).filter(Boolean);
    if (shares.length >= MIN_GROUP * 2) {
      const sorted = shares.map((s) => s.share).slice().sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const heavy = [], light = [];
      shares.forEach((s) => {
        const next = U.shiftDay(s.day, 1);
        const p = pts.find((x) => x.day === next);
        const ma = maMap.get(next);
        if (!p || ma == null) return;
        (s.share >= med ? heavy : light).push(p.kg - ma);
      });
      if (heavy.length >= MIN_GROUP && light.length >= MIN_GROUP) {
        const diff = round(mean(heavy) - mean(light), 2);
        out.push({
          id: "dinner",
          title: "夕食が重かった日の翌朝",
          text: Math.abs(diff) < 0.1
            ? `夕食の割合が高かった日（${heavy.length}日）と、そうでない日（${light.length}日）で、`
              + `翌朝の体重に、7日平均からのずれの差はほとんどありません。`
            : `夕食の割合が高かった日の翌朝は、そうでない日より平均 ${diff > 0 ? "+" : ""}${diff}kg でした`
              + `（分け目はこの期間の真ん中、夕食 ${Math.round(med * 100)}%。`
              + `高いほう ${heavy.length}日 / 低いほう ${light.length}日）。`
              + `並びの差であって、夕食が原因だとは言えません`
              + `——重い夕食の日は、外食や飲酒と重なりやすいところです。`,
          value: diff, tone: "info", n: heavy.length + light.length,
        });
      }
    }

    /* --- 食物繊維 ---

       PFCの陰に隠れますが、いちばん足りていないのはたいていここです。
       目安（日本人の食事摂取基準2020：成人男性21g・女性18g以上）に対して
       いくつ足りないかを、数だけ置きます。 */
    const fibers = daysBetween(from, today).map((d) => dayTotals(d))
      .filter((t) => t && t.fiber != null).map((t) => t.fiber);
    if (fibers.length >= MIN_GROUP) {
      const avg = round(mean(fibers), 1);
      const target = 21;
      out.push({
        id: "fiber",
        title: "食物繊維",
        text: `記録のある ${fibers.length}日の平均は 1日 ${avg}g です。`
          + (avg >= target
            ? `目安（成人男性21g・女性18g以上）には届いています。`
            : `目安の21g（成人男性、女性は18g以上）まで、あと ${round(target - avg, 1)}g です。`)
          + `AIの推計なので、数そのものより日ごとの上下を見てください。`,
        value: avg, tone: avg >= target ? "good" : "info", n: fibers.length,
      });
    }

    /* --- 飲んだ日と、その翌日 ---

       翌日の体重を見ます。当日ではありません——飲んだあと体重計に
       乗る人は少ないし、アルコールは水分として翌朝に出るからです。

       ここは特に、因果に読まれやすいところです。「飲んだから増えた」と
       書けば、そう読まれます。実際には、飲む日は外食の日でもあり、
       塩分も糖質も同時に増えます。だから **並びの差** としてだけ言います。 */
    const drinkDays = pts.filter((p) => {
      const t = store.drinkTotals(U.shiftDay(p.day, -1));
      return !!t;
    });
    const soberDays = pts.filter((p) => !store.drinkTotals(U.shiftDay(p.day, -1)));
    const dr = [], so = [];
    drinkDays.forEach((p) => { const m = maMap.get(p.day); if (m != null) dr.push(p.kg - m); });
    soberDays.forEach((p) => { const m = maMap.get(p.day); if (m != null) so.push(p.kg - m); });
    if (dr.length >= MIN_GROUP && so.length >= MIN_GROUP) {
      const diff = round(mean(dr) - mean(so), 2);
      const gTotal = drinkDays.reduce((a, p) => {
        const t = store.drinkTotals(U.shiftDay(p.day, -1));
        return a + (t ? t.alcoholG : 0);
      }, 0);
      out.push({
        id: "drink",
        title: "飲んだ翌日の体重",
        text: Math.abs(diff) < 0.1
          ? `飲んだ翌日（${dr.length}日）と、そうでない日（${so.length}日）で、`
            + `7日平均からのずれに目立った差はありません。`
          : `飲んだ翌日は、そうでない日より平均 ${diff > 0 ? "+" : ""}${diff}kg でした`
            + `（飲んだ翌日 ${dr.length}日 / そうでない日 ${so.length}日、`
            + `純アルコール 平均${round(gTotal / dr.length, 1)}g）。`
            + `並びに差があるということで、飲酒が原因だとは言えません`
            + `——飲む日は外食の日でもあり、塩分も水分も一緒に動きます。`,
        value: diff, tone: "info", n: dr.length + so.length,
      });
    }

    /* --- 平日と休日 --- */
    const wd = [], we = [];
    pts.forEach((p) => {
      const ma = maMap.get(p.day);
      if (ma == null) return;
      const dow = U.dayOfWeek(p.day);
      (dow === 0 || dow === 6 ? we : wd).push(p.kg - ma);
    });
    if (wd.length >= MIN_GROUP && we.length >= MIN_GROUP) {
      const diff = round(mean(we) - mean(wd), 2);
      out.push({
        id: "weekend",
        title: "平日と休日",
        text: Math.abs(diff) < 0.1
          ? `休日（${we.length}日）と平日（${wd.length}日）で、平均からのずれはほぼ同じです。`
          : `休日は平日より平均 ${diff > 0 ? "+" : ""}${diff}kg でした`
            + `（休日 ${we.length}日 / 平日 ${wd.length}日）。`,
        tone: "info", n: wd.length + we.length,
      });
    }

    /* --- 直近7日のPFC --- */
    const week = daysBetween(U.shiftDay(today, -6), today)
      .map((d) => dayTotals(d)).filter(Boolean);
    if (week.length >= 3) {
      const avg = {
        kcal: mean(week.map((t) => t.kcal)),
        p: mean(week.map((t) => t.p)),
        f: mean(week.map((t) => t.f)),
        c: mean(week.map((t) => t.c)),
      };
      const r = pfcRatio(avg);
      out.push({
        id: "pfc",
        title: "直近7日のPFC",
        text: `1日あたり ${Math.round(avg.kcal).toLocaleString()}kcal、`
          + `P ${Math.round(avg.p)}g・F ${Math.round(avg.f)}g・C ${Math.round(avg.c)}g`
          + (r ? `（熱量比 P${r.p}% F${r.f}% C${r.c}%）` : "")
          + `。記録があったのは ${week.length}日ぶんです。`,
        tone: "info", n: week.length,
      });
    }

    return out;
  }

  /** 分析が何も出せないとき、何が足りないのかを言うために。 */
  function coverage(windowDays) {
    const win = windowDays || 30;
    const today = U.todayKey();
    const days = daysBetween(U.shiftDay(today, -(win - 1)), today);
    return {
      days: win,
      weight: weightPoints(days[0], today).length,
      // 量る条件まで書いてある日。統計に効くのはこちらなので、別に数えます。
      condition: weightPoints(days[0], today).filter((p) => p.meal != null || p.clothed != null).length,
      meals: days.filter((d) => store.mealsOfDay(d).length).length,
      steps: days.filter((d) => store.healthValue(d, "steps") != null).length,
      sleep: days.filter((d) => store.healthValue(d, "sleep") != null).length,
    };
  }

  /* ---------------- 書き出し ----------------

     控え（バックアップ）とは別のものです。あちらは**アプリに戻すため**の
     ぜんぶで、買い物の商品も値段も覚えた振り分けも入っています。こちらは
     **人とAIが読むため**の、日ごとに一行の表です。

     ・過去の食事をあとで推し直す
     ・一か月ぶんをまとめてAIに渡して読んでもらう
     この二つのために、一日の記録を一行にほどきます。 */

  /* 空欄は「未測定」です。0 とは別のものなので、0 では埋めません
     （体重0kg も歩数0歩も、測っていないこととは違います）。
     体重は数だけでは比べられないので、**測った時刻と条件**まで出します
     ——朝と夜、食前と食後、着衣のあるなしで、同じ体でも1kg近く動きます。 */
  const EXPORT_COLS = [
    { key: "day",        label: "日付" },
    { key: "weightKg",   label: "体重kg" },
    { key: "weightTime", label: "測定時刻" },
    { key: "fatPct",     label: "体脂肪%" },
    { key: "meal",       label: "食前後" },
    { key: "clothed",    label: "着衣" },
    { key: "steps",    label: "歩数" },
    { key: "burned",   label: "総消費kcal" },
    { key: "sleepMin", label: "睡眠分" },
    { key: "kcal",       label: "摂取kcal" },
    { key: "kBreakfast", label: "朝kcal" },
    { key: "kLunch",     label: "昼kcal" },
    { key: "kDinner",    label: "夜kcal" },
    { key: "kSnack",     label: "間食kcal" },
    { key: "p",        label: "P_g" },
    { key: "f",        label: "F_g" },
    { key: "c",        label: "C_g" },
    { key: "fiber",    label: "食物繊維g" },
    { key: "low",      label: "推定下限kcal" },
    { key: "high",     label: "推定上限kcal" },
    { key: "alcoholG", label: "純アルコールg" },
    { key: "drinkKcal", label: "酒kcal" },
    { key: "drinks",   label: "飲んだもの" },
    { key: "memo",     label: "食事メモ" },
  ];

  /** 一日ぶんを、平たい一行に。無い値は null のままにします。 */
  function exportRows(fromDay, toDay) {
    const to = toDay || U.todayKey();
    const from = fromDay || to;
    return daysBetween(from, to).map((day) => {
      const w = store.weightOfDay(day);
      const t = dayTotals(day);
      const st = slotTotals(day);
      const dt = store.drinkTotals(day);
      /* 食事メモは、区分ごとに書いたものを一本にまとめて出します
         （前の作りの「一日ぶんのメモ」も、同じ列に並びます）。 */
      const memoText = store.mealsOfDay(day)
        .filter((m) => String(m.memo || "").trim())
        // 区分のあるものが先、前の作りの「一日ぶんのメモ」は最後に。
        .sort((a, b) => (SLOT_LABEL[a.slot] ? 0 : 1) - (SLOT_LABEL[b.slot] ? 0 : 1))
        .map((m) => (SLOT_LABEL[m.slot] ? `【${SLOT_LABEL[m.slot]}】` : "")
          + m.memo.trim().split(/\n+/).map((x) => x.trim()).filter(Boolean).join("、"))
        .join(" ");
      const drinks = store.drinksOfDay(day);
      return {
        day,
        weightKg: w ? w.kg : null,
        weightTime: w && w.time ? w.time : null,
        fatPct: w && w.fat != null ? w.fat : null,
        meal: w && w.meal ? (w.meal === "before" ? "食前" : "食後") : null,
        clothed: w && w.clothed != null ? (w.clothed ? "着衣あり" : "着衣なし") : null,
        steps: store.healthValue(day, "steps"),
        burned: burnedOf(day),
        sleepMin: store.healthValue(day, "sleep"),
        kcal: t ? t.kcal : null,
        /* 区分ごとの内わけ。AIが食品ごとに区分を付けた日だけ埋まります
           （付いていない日は 0 ではなく空欄——区分が分からないだけで、
           食べていないわけではないので）。 */
        kBreakfast: st.any ? st.breakfast : null,
        kLunch: st.any ? st.lunch : null,
        kDinner: st.any ? st.dinner : null,
        kSnack: st.any ? st.snack : null,
        p: t ? t.p : null,
        f: t ? t.f : null,
        c: t ? t.c : null,
        fiber: t ? t.fiber : null,
        low: t ? t.low : null,
        high: t ? t.high : null,
        alcoholG: dt ? dt.alcoholG : null,
        drinkKcal: dt ? dt.kcal : null,
        drinks: drinks.length ? drinks.map((d) => KN.drinks.describeItem(d)).join("・") : null,
        memo: memoText || null,
      };
    });
  }

  /** 何も書いていない日は落とします（空行だけの月を渡しても仕方がない）。 */
  const hasSomething = (r) => EXPORT_COLS.some((c) => c.key !== "day" && r[c.key] != null);

  function exportCsv(fromDay, toDay, opts) {
    const rows = exportRows(fromDay, toDay).filter((o) => (opts && opts.all) || hasSomething(o));
    const esc = (v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [EXPORT_COLS.map((c) => c.label).join(",")]
      .concat(rows.map((r) => EXPORT_COLS.map((c) => esc(r[c.key])).join(",")))
      .join("\n");
  }

  /** AIに貼るための文。表よりも、日ごとの塊のほうが読み違えられません。 */
  function exportText(fromDay, toDay) {
    const rows = exportRows(fromDay, toDay).filter(hasSomething);
    if (!rows.length) return "";
    const line = (r) => {
      const bits = [];
      if (r.weightKg != null) {
        bits.push(`体重${r.weightKg}kg`
          + (r.weightTime ? `（${r.weightTime}）` : "")
          + (r.fatPct != null ? `／体脂肪${r.fatPct}%` : "")
          + [r.meal, r.clothed].filter(Boolean).map((x) => `［${x}］`).join(""));
      }
      if (r.steps != null) bits.push(`歩数${Math.round(r.steps).toLocaleString()}`);
      if (r.burned != null) bits.push(`総消費${Math.round(r.burned).toLocaleString()}kcal`);
      if (r.sleepMin != null) bits.push(`睡眠${Math.floor(r.sleepMin / 60)}時間${String(Math.round(r.sleepMin % 60)).padStart(2, "0")}分`);
      if (r.kcal != null) {
        bits.push(`摂取${r.kcal.toLocaleString()}kcal`
          + (r.low != null && r.high != null ? `（${r.low}〜${r.high}）` : "")
          + `／P${r.p} F${r.f} C${r.c}` + (r.fiber != null ? ` 繊維${r.fiber}` : ""));
        if (r.kBreakfast != null) {
          bits.push(`内わけ 朝${r.kBreakfast}／昼${r.kLunch}／夜${r.kDinner}／間食${r.kSnack}`);
        }
      }
      if (r.alcoholG != null) bits.push(`飲酒 純アルコール${r.alcoholG}g（${r.drinks || ""}）`);
      /* 数はまだ無くてメモだけ、という日があります（AIに聞く前）。
         そこに「記録なし」と書くと、書いたものが無かったことになります。 */
      const head = `■ ${r.day}` + (bits.length ? `　${bits.join("／")}` : "");
      return r.memo ? `${head}\n　食事メモ：${String(r.memo).replace(/\n/g, " / ")}` : head;
    };
    return [
      `くらしノート 記録の書き出し（${rows[0].day}〜${rows[rows.length - 1].day}／${rows.length}日ぶん）`,
      "※ 摂取カロリーとPFCはAIによる推定を含みます。飲酒は摂取カロリーに含めていません。",
      "※ 書いていない項目は「未測定」です（0ではありません）。"
        + "体重は測った時刻・食前後・着衣のあるなしで動くので、分かっているものは添えてあります。",
      "",
    ].concat(rows.map(line)).join("\n");
  }

  KN.diet = {
    burnedOf,
    daysBetween, weightPoints, movingAverage, slopePerWeek,
    weightSummary, projection, neededPace,
    dayTotals, remaining, pfcRatio, dayCard, slotTotals, energySplit,
    analyze, coverage,
    EXPORT_COLS, exportRows, exportCsv, exportText,
    MIN_GROUP,
  };
})();
