/* =========================================================
   くらしノート — 今日の面の物差し（docs/timeline-scale-design.md）

   用事の並び（plan.buildDay の items）を、縦軸が時間に比例する絵の
   位置へ直します。**DOM も store も触らない純粋な部品**——当たり外れは
   node の表で測れます（tests/tl-layout.js）。

   入力：[{ id, atMin, untilMin, known }]（known＝長さを決めた用事か）
   出力：{ cards, folds, height, y(min) }
     cards … 各札の { id, top, height, lane, lanes, more }（px）。
             重なった札は同じ連なりの中で列に分ける（lanes＝その連なりの列数）。
             列の上限を超えた札は札にせず、その時間にいる最後の列の札の `more`（id の配列）へ。
     folds … 畳んだ長い空き { fromMin, untilMin, top, height }
     y(min) … 時刻（分）→ 縦の位置（px）。畳んだ区間の中は区間の高さへ比例で割る。
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
    const drawn = list.map((it) => {
      const len = Math.max(0, (Number(it.untilMin) || it.atMin) - it.atMin);
      const h = Math.max(len * o.pxMin, it.known ? o.minH : o.minUnknownH);
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

    // 区間の並び（物差しと畳み）。上からの px を積む。
    const segs = [];
    let at = from, px = 0;
    const span = (a, b) => { if (b > a) { segs.push({ fold: false, from: a, to: b, px }); px += (b - a) * o.pxMin; } };
    foldGaps.forEach((g) => {
      span(at, g.from);
      segs.push({ fold: true, from: g.from, to: g.to, px });
      px += o.foldH;
      at = g.to;
    });
    span(at, to);
    const height = px;

    const y = (min) => {
      const s = segs.find((g) => min < g.to) || segs[segs.length - 1];
      if (!s) return 0;
      if (s.fold) return s.px + (Math.min(Math.max(min, s.from), s.to) - s.from) / (s.to - s.from) * o.foldH;
      return s.px + (min - s.from) * o.pxMin;
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
          cards.push({ id: d.it.id, top: y(d.at), height: y(d.end) - y(d.at), lane, lanes, more: [] });
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

    const folds = segs.filter((s) => s.fold).map((s) => ({ fromMin: s.from, untilMin: s.to, top: s.px, height: o.foldH }));
    return { cards, folds, height, y, from, to };
  }

  KN.tlLayout = { layout, DEFAULTS };
})();
