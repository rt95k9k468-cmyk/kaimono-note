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
      .map((w) => ({ day: w.day, kg: w.kg, fat: w.fat, source: w.source, id: w.id }));
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

  /** 画面ひとつぶんの体重まわり。無い数は null のまま渡します。 */
  function weightSummary(windowDays) {
    const today = U.todayKey();
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
    const sum = { kcal: 0, p: 0, f: 0, c: 0, estimated: false, items: 0 };
    meals.forEach((m) => m.items.forEach((it) => {
      sum.kcal += it.kcal; sum.p += it.p; sum.f += it.f; sum.c += it.c;
      sum.items += 1;
      if (it.estimated) sum.estimated = true;
    }));
    sum.kcal = Math.round(sum.kcal);
    sum.p = round(sum.p, 1); sum.f = round(sum.f, 1); sum.c = round(sum.c, 1);
    return sum;
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
      workouts,
    };
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
      meals: days.filter((d) => store.mealsOfDay(d).length).length,
      steps: days.filter((d) => store.healthValue(d, "steps") != null).length,
      sleep: days.filter((d) => store.healthValue(d, "sleep") != null).length,
    };
  }

  KN.diet = {
    daysBetween, weightPoints, movingAverage, slopePerWeek,
    weightSummary, projection, neededPace,
    dayTotals, remaining, pfcRatio, dayCard,
    analyze, coverage,
    MIN_GROUP,
  };
})();
