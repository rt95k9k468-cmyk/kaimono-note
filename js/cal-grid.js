/* =========================================================
   くらしノート — 暦の盤を組む（四つの暦が分け合う一つ）
   やること・daily・ダイエット・買うもの（head.js）の暦は、盤の組み立て
   ——曜日の行・隣の月のマス・日のマス・隣の月の盤——が同じです。違うのは
   「その日の印」（マスの中の絵や帯と、読み上げに足す一言）と、押したときに
   何をするかだけ。だから各タブはその二つだけを渡します（roadmap-unify の U2）。

   週の印・選んでいる日の輪・題は、これまでどおり各タブが組んだあとに置きます
   （`only` を渡した離れた盤には置かない——calendar-swipe.md の決めごと）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, raw } = KN.util;

  /**
   * 日のマス一つ。
   * @param {string} key   その日（dayKey）
   * @param {boolean} out  隣の月のマスか
   * @param {object} o     fill に渡したもの
   */
  function dayCell(key, out, o) {
    const U = KN.util;
    const d = U.dayDate(key);
    const wd = d ? d.getDay() : 0;
    /* 隣の月のマスに「今日」を付けるのは、買うものの暦だけ（前からの形。
       ほかの三つは付けない——見た目を変えずに一つにしたので、そのまま）。 */
    const isToday = key === o.today && (!out || !!o.outToday);
    const isHere = !out && !!o.here && key === o.here;
    const m = o.mark(key, out) || {};
    const cell = node(html`
      <button class="cal-day ${out ? "is-out" : ""} ${isToday ? "is-today" : ""} ${isHere ? "is-here" : ""}
                     ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
              data-day="${key}" ${isToday ? raw('aria-current="date"') : ""}
              ${out && !o.outFocus ? raw('tabindex="-1"') : ""}
              aria-label="${d ? `${d.getMonth() + 1}月${d.getDate()}日` : key}${isToday ? "（今日）" : ""}${m.label || ""}">
        <span class="cal-n">${d ? String(d.getDate()) : ""}</span>
        <span class="cal-dots">${raw(m.html || "")}</span>
      </button>
    `);
    const dots = cell.querySelector(".cal-dots");
    if (m.cat) dots.style.setProperty("--cat", m.cat);
    if (m.nodes) m.nodes.forEach((n) => dots.append(n));
    if (o.pick) cell.addEventListener("click", () => o.pick(key, cell, out));
    return cell;
  }

  /**
   * 盤を組みます（節と `.cal-grid`・`.cal-wds` の要素は使い回し）。
   * @param {Element} sec  組む先の `.cal`（KN.calPeek.mount 済み）
   * @param {{
   *   year: number, month: number,
   *   mark: (key: string, out: boolean) => ({html?: string, nodes?: Node[], cat?: string, label?: string}|null),
   *   pick?: (key: string, cell: Element, out: boolean) => void,
   *   here?: string|null,      // そのマスに is-here を付ける日（その月のマスだけ）
   *   outToday?: boolean,      // 隣の月のマスにも「今日」を付ける（買うもの）
   *   outFocus?: boolean,      // 隣の月のマスも Tab で止まる（やること）
   * }} o
   * @returns {Element} `.cal-grid`
   */
  function fill(sec, o) {
    const U = KN.util;
    const { year, month } = o;
    const opts = Object.assign({ today: U.todayKey() }, o);
    const total = new Date(year, month + 1, 0).getDate();

    sec.setAttribute("aria-label", `${year}年${month + 1}月`);

    const grid = sec.querySelector(".cal-grid");
    grid.innerHTML = "";
    /* 曜日の行は、日のマスとは別の入れ物です——暦を引いて伸ばすとき、
       動くのは日のマスだけで、曜日はここに留まります。 */
    const wds = sec.querySelector(".cal-wds");
    wds.innerHTML = "";
    U.WEEKDAY_COLS.forEach((wd) => wds.append(node(html`
      <span class="cal-wd ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}">${U.WEEKDAYS[wd]}</span>
    `)));
    /* 週は月をまたぎます。7日そろいにするため、隣の月の日も本物のマスと
       して置きます（月で見ているあいだは CSS が伏せるので、月の見た目は
       これまでどおり）。押せば、その日へ行けます。 */
    const outer = U.outDays(year, month);
    outer.lead.forEach((key) => grid.append(dayCell(key, true, opts)));
    for (let d = 1; d <= total; d++) grid.append(dayCell(U.dayKey(new Date(year, month, d)), false, opts));
    outer.trail.forEach((key) => grid.append(dayCell(key, true, opts)));
    return grid;
  }

  /**
   * その月ぶんの日のマスを返す関数を作ります。隣の週を先に見せるために
   * cal-swipe が呼ぶもの（`KN.calSwipe.wire` の `monthGrid`）。いま出している
   * 月なら、生きている盤をそのまま渡します——組み直すと、選んでいる日の輪
   * まで作り直すことになるので。
   * @param {{ live: () => Element|null, shown: () => {year:number,month:number},
   *           fill: (sec: Element, only: {year:number,month:number}) => void }} o
   */
  function monthGridFor(o) {
    return (year, month) => {
      const cal = o.live();
      const cur = o.shown();
      if (cal && cur.year === year && cur.month === month) return cal.querySelector(".cal-grid");
      const tmp = node(html`<section class="cal"></section>`);
      KN.calPeek.mount(tmp);
      o.fill(tmp, { year, month });
      return tmp.querySelector(".cal-grid");
    };
  }

  KN.calGrid = { fill, monthGridFor };
})();
