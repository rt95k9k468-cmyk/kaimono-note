/* =========================================================
   くらしノート — 今日の面の物差し（docs/timeline-scale-design.md）

   用事の並び（plan.buildDay の items）を、縦軸が時間に比例する絵の
   位置へ直します。**DOM も store も触らない純粋な部品**——当たり外れは
   node の表で測れます（tests/tl-layout.js）。

   入力：[{ id, atMin, untilMin, known }]（known＝長さを決めた用事か）、opts.open＝{ id: 足す px }
   出力：{ cards, folds, height, y(min), minAt(px) }
     cards … 各札の { id, top, height, lane, lanes, more }（px）。
             重なった札は同じ連なりの中で列に分ける（lanes＝その連なりの列数）。
             列の上限を超えた札は札にせず、その時間にいる最後の列の札の `more`（id の配列）へ。
     folds … 畳んだ長い空き { fromMin, untilMin, top, height }
     y(min) … 時刻（分）→ 縦の位置（px）。畳んだ区間の中は区間の高さへ比例で割る。
     minAt(px) … その逆（つまんで動かす指の高さ → 時刻）。
   ========================================================= */
(function () {
  "use strict";
  const KN = window.KN;

  const DEFAULTS = {
    start: 5 * 60, end: 23 * 60,
    pxMin: 1.2,          // 1時間 72px
    minH: 36,            // 決めた長さの短い札の最低の高さ
    minUnknownH: 44,     // 長さ未定の札（長さは言わない）
    foldMin: 90,         // これ以上の予定なしは畳む
    foldH: 44,           // 畳んだ区間の高さ
    maxLanes: 3,
  };

  function layout(items, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const list = (items || []).filter((it) => it && Number.isFinite(it.atMin));

    /* 描く大きさ。短い札は最低高まで伸ばす——重なりは**描いた高さ**で数える
       （見た目で重なるなら列に分ける）。 */
    /* 長さ未定の札が最低高（44px）まで伸びるのは、次の用事までが空いているときだけ。組み立て（plan）は長さ未定を
       仮の30分で続けて置くので、伸ばしきると次の札と 8px 重なり、続けて置いただけの二件が左右の列に割れていた
       （2026年10月24日）。詰まっているときは次の札の頭まで（それでも短い札の最低高は守る）。 */
    const starts = list.map((it) => it.atMin).sort((a, b) => a - b);
    const drawn = list.map((it) => {
      const until = Number(it.untilMin) || it.atMin;
      const len = Math.max(0, until - it.atMin);
      let least = it.known ? o.minH : o.minUnknownH;
      if (!it.known) {
        const next = starts.find((a) => a > it.atMin);
        if (next != null && next >= until) least = Math.max(o.minH, Math.min(least, (next - it.atMin) * o.pxMin));
      }
      const h = Math.max(len * o.pxMin, least);
      return { it, at: it.atMin, end: it.atMin + h / o.pxMin, h };
    }).sort((a, b) => a.at - b.at || b.end - a.end);

    // 一日の範囲は、はみ出す札のぶん広げる（寝る時刻をすぎる用事など）。
    const from = Math.min(o.start, ...drawn.map((d) => d.at));
    const to = Math.max(o.end, ...drawn.map((d) => d.end));

    // ふさがっている時間帯（重なりをまとめたもの）と、そのあいだの空き。
    const busy = [];
    drawn.forEach((d) => {
      const last = busy[busy.length - 1];
      if (last && d.at < last.to) last.to = Math.max(last.to, d.end);
      else busy.push({ from: d.at, to: d.end });
    });
    const gaps = [];
    let cur = from;
    busy.forEach((b) => { if (b.from > cur) gaps.push({ from: cur, to: b.from }); cur = Math.max(cur, b.to); });
    if (to > cur) gaps.push({ from: cur, to });
    const foldGaps = gaps.filter((g) => g.to - g.from >= o.foldMin);

    /* 手順をひらいた札（opts.open＝{ id: 足す px }）は、札の下端（描いた終わり）に継ぎ目を入れて
       下を押し下げる——継ぎ目は時間を持たない高さ（§6-3 の (a)。ひらいた間だけ比例を外す）。 */
    const open = o.open || {};
    const seams = [];
    drawn.forEach((d) => {
      const px = Number(open[d.it.id]) || 0;
      if (px <= 0) return;
      const same = seams.find((s) => s.min === d.end);
      if (same) same.px = Math.max(same.px, px); else seams.push({ min: d.end, px });
    });

    // 区間の並び（物差し・畳み・継ぎ目）。上からの px を積む。同じ分なら継ぎ目が先（札の下端の直後）。
    const segs = [];
    let at = from, px = 0;
    const line = (a, b) => { if (b > a) { segs.push({ kind: "line", from: a, to: b, px, h: (b - a) * o.pxMin }); px += (b - a) * o.pxMin; } };
    const marks = seams.map((s) => ({ min: s.min, seam: s })).concat(foldGaps.map((g) => ({ min: g.from, fold: g })))
      .sort((a, b) => a.min - b.min || (a.seam ? -1 : 1));
    marks.forEach((m) => {
      if (m.seam) {
        line(at, m.min);
        at = Math.max(at, m.min);
        segs.push({ kind: "seam", from: at, to: at, px, h: m.seam.px });
        px += m.seam.px;
        return;
      }
      line(at, m.fold.from);
      segs.push({ kind: "fold", from: m.fold.from, to: m.fold.to, px, h: o.foldH });
      px += o.foldH;
      at = m.fold.to;
    });
    line(at, to);
    const height = px;

    /* 時刻（分）→ 縦の位置。継ぎ目はその分ちょうどから下に効く（ひらいた札の下端も伸びる）。 */
    const y = (min) => {
      for (const s of segs) {
        if (s.kind === "seam" || min >= s.to) continue;
        if (s.kind === "fold") return s.px + (Math.max(min, s.from) - s.from) / (s.to - s.from) * s.h;
        return s.px + (min - s.from) * o.pxMin;
      }
      return height + Math.max(0, min - to) * o.pxMin;
    };
    /* 縦の位置 → 時刻（分）。y の逆。継ぎ目の中はその分、畳みの中は区間へ比例で割る。 */
    const minAt = (p) => {
      for (const s of segs) {
        if (p >= s.px + s.h) continue;
        if (s.kind === "seam") return s.from;
        if (s.kind === "fold") return s.from + Math.max(0, p - s.px) / s.h * (s.to - s.from);
        return s.from + (p - s.px) / o.pxMin;
      }
      return to + Math.max(0, p - height) / o.pxMin;
    };

    // 列の割り当て：重なる連なりごとに、空いている最初の列へ。
    const cards = [];
    let i = 0;
    while (i < drawn.length) {
      let clusterEnd = drawn[i].end, j = i + 1;
      while (j < drawn.length && drawn[j].at < clusterEnd) { clusterEnd = Math.max(clusterEnd, drawn[j].end); j++; }
      const laneEnd = [];
      const made = [];
      drawn.slice(i, j).forEach((d) => {
        let lane = laneEnd.findIndex((e) => e <= d.at);
        if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); }
        laneEnd[lane] = d.end;
        made.push({ d, lane });
      });
      const lanes = Math.min(laneEnd.length, o.maxLanes);
      made.forEach(({ d, lane }) => {
        if (lane < o.maxLanes) {
          // 継ぎ目ちょうどで終わる隣の札は伸ばさない（伸びるのはひらいた札だけ）。
          const seam = (Number(open[d.it.id]) || 0) > 0 ? null : seams.find((s) => s.min === d.end);
          const bottom = y(d.end) - (seam ? seam.px : 0);
          cards.push({ id: d.it.id, top: y(d.at), height: bottom - y(d.at), lane, lanes, more: [] });
          return;
        }
        // 列の上限を超えた札：その時間にいる最後の列の札へまとめる。
        const host = cards.filter((c) => c.lane === o.maxLanes - 1 && c.lanes === lanes
          && c.top <= y(d.at) && y(d.at) < c.top + c.height).pop()
          || cards.filter((c) => c.lane === o.maxLanes - 1 && c.lanes === lanes).pop();
        if (host) host.more.push(d.it.id);
      });
      i = j;
    }

    const folds = segs.filter((s) => s.kind === "fold").map((s) => ({ fromMin: s.from, untilMin: s.to, top: s.px, height: s.h }));
    return { cards, folds, height, y, minAt, from, to };
  }

  KN.tlLayout = { layout, DEFAULTS };
})();
