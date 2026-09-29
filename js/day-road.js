/* =========================================================
   くらしノート — 一日の道

   やることの紙の頭に、その日を**一本の道**にして描きます。もとは利用者の
   手描き（2026年9月29日）：左上の「5:30」から右へ伸び、端で折り返しながら
   下へ降りて「22:30」で終わる太い道。病院は道の上のふち取りした区間で、
   いまの自分は道の上に立つ人、そのそばに色の丸がふたつ。

   下の時間割（丸薬の列）は**一つずつ手を動かすところ**、ここは**一日の
   地図**です（まず全体、細部は求めに応じて）。時間割の行は時間に比例しない
   （Structured の作り）ので、午後が6時間空いていても15分の隙間と同じ高さに
   しか見えません。道は時間に比例するので、それが長さで見えます。

   - **時刻を決めたものは、道の上の停留所。** 長さを決めたものは区間、決めて
     いないものは点（丸薬と同じ決めごと：決めていない長さは描かない）。
   - **時刻を決めていないものは、道に置きません。** いまの自分と一緒に歩く
     「連れ」として、人のすぐ後ろに並びます。道に置けば「10:42 書類整理」
     という、決めてもいない約束に見えます——予定が崩れるたびに嘘になる時刻
     です（暦に書くのは決まった約束だけ、という GTD の考えと同じ）。いつやるか
     決めたくなったら、時間割で左の時刻の列へ運べば停留所になります。
   - **済ませたものは、押した時刻の道の上に足あと。** 写さず引く——doneAt から
     そのつど数えます。
   - **歩いたぶんの道は濃く、これからは薄く。** 人が立つのは今日だけ。過ぎた日は
     道ぜんぶが歩いたあと、先の日はぜんぶがこれから。

   評価はしません。遅れも達成も言いません。言うのは「いま何時で、次に何が
   あって、そこまでどれだけ空いているか」だけです。

   組み立ては js/plan.js（時間割と同じ一つ）。ここは描くだけで、何も保存
   しません。座標はすべて計算で出し、画面を測りません（組み直しの値段が
   増えないように。試験で数として確かめられるように）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const { html, node } = U;

  /* ---------------- 寸法（viewBox の単位） ----------------

     幅 360 は、iPhone の紙の中身（390 − 左右16）とほぼ同じ。**1単位 ≒ 1px**
     なので、札の字（px）と図の寸法を同じ物差しで並べられます。広い画面では
     440px で止めてまん中に置きます（伸ばすと道だけ太って、字が置いていかれる）。 */
  const W = 360;
  const PAD = 10;
  const PITCH = 64;             // 段と段の、中心どうしのあいだ
  const R = PITCH / 2;          // 折り返しの半径
  const XL = PAD + R;           // 段のまっすぐなところの左端
  const XR = W - PAD - R;       // 右端
  const RUN = XR - XL;          // 一段のまっすぐな長さ
  const ARC = Math.PI * R;      // 折り返しの長さ
  const SEG = RUN + ARC;
  const TOP = 46;               // 一段目の上：札と、人の頭のぶん
  const BOT = 30;               // いちばん下の段の下：いまの時刻の札のぶん
  const ROAD = 9;               // 道の太さ（CSS の stroke-width と同じ数）
  const STOP = 21;              // 停留所の太さ（ふち）
  const LANE = 19;              // 道の中心から、上・下の札の中心まで
  const GAP = 4;                // 札どうしのすきま
  const ME_K = 1.25;            // 人の大きさ（下の形の何倍で描くか）
  const ME_W = 8;               // 人の頭の半分の幅（上の札がよける）
  const BEAD = 19;              // 連れどうしの間（丸は 18px）
  const BEAD_BACK = 16;         // 人から、最初の連れまで
  const BEADS_MAX = 5;

  const n1 = (v) => Math.round(v * 10) / 10;
  const clock = (min) => KN.plan.toTime(min).replace(/^0(\d:)/, "$1");
  const closed = (t) => !!(t.done || t.archived);

  /* ---------------- 時刻と、道の上の位置 ----------------

     道は段ごとに向きを変えます（一段目は右へ、二段目は左へ……）。一段は
     **ちょうどの時間**を持ちます——一日を四段に割り、1時間単位に切り上げ。
     5:00〜23:00 なら一段5時間で、10:00・15:00・20:00 で折り返します。最後の
     段は余ったぶんだけで、道はそこで終わります（手描きの道も、最後の段は端まで
     行かずに「22:30」で止まっていました）。

     **折り返しは時間を持ちません。** 段の尻と次の段の頭は同じ時刻で、曲がり
     角はそのあいだをつなぐだけの線です。持たせると一時間の長さが段の途中で
     変わらないかわりに、折り返しの時刻が半端になり、角の札（「10:00」）で
     物差しを言えなくなります。 */
  function geom(start, end) {
    const span = Math.max(60, end - start);
    const rowSpan = Math.max(120, Math.ceil(span / 4 / 60) * 60);
    const rows = Math.max(1, Math.ceil(span / rowSpan - 1e-9));
    const H = TOP + (rows - 1) * PITCH + BOT;
    const rowY = (i) => TOP + i * PITCH;

    /** 時刻 → 道の始まりからの長さ。境目ちょうどの時刻は、`tail` なら前の段の
        尻、でなければ次の段の頭へ——区間の終わりが曲がり角を回り込んで、次の
        段の頭まで伸びないように。 */
    function dist(t, tail) {
      const u = (Math.max(start, Math.min(start + span, t)) - start) / rowSpan;
      let i = tail ? Math.ceil(u - 1e-9) - 1 : Math.floor(u + 1e-9);
      i = Math.max(0, Math.min(rows - 1, i));
      return i * SEG + Math.max(0, Math.min(1, u - i)) * RUN;
    }
    const total = dist(start + span, true);

    /** 長さ → 点。まっすぐなところなら、その段と向きも。 */
    function point(d) {
      const dd = Math.max(0, Math.min(total, d));
      const i = Math.max(0, Math.min(rows - 1, Math.floor(dd / SEG + 1e-9)));
      const rem = dd - i * SEG;
      const y = rowY(i);
      const ltr = i % 2 === 0;
      if (rem <= RUN + 1e-9) return { x: ltr ? XL + rem : XR - rem, y, row: i, ltr };
      const a = (rem - RUN) / R;
      const s = Math.sin(a), c = Math.cos(a);
      return { x: ltr ? XR + R * s : XL - R * s, y: y + R - R * c, row: i, ltr, arc: true };
    }

    /** 長さ d0〜d1 の道筋（SVG の d）。長さが無ければ点——丸い端が丸を描きます。 */
    function path(d0, d1) {
      let a = Math.max(0, Math.min(total, d0));
      const b = Math.max(a, Math.min(total, d1));
      const p = point(a);
      let s = `M${n1(p.x)} ${n1(p.y)}`;
      if (b - a < 0.05) return s + "l0.01 0";
      for (let guard = 0; b - a > 1e-6 && guard < 64; guard++) {
        const i = Math.max(0, Math.min(rows - 1, Math.floor(a / SEG + 1e-9)));
        const base = i * SEG;
        let to;
        if (a - base < RUN - 1e-6) {
          to = Math.min(b, base + RUN);
          const q = point(to);
          s += `L${n1(q.x)} ${n1(q.y)}`;
        } else {
          /* 曲がり角は四分の一ずつ。半周を一度に描くと、始点と終点が直径の
             両端になって、どちら回りかが決まりません。 */
          const half = base + RUN + ARC / 2;
          to = Math.min(b, a < half - 1e-6 ? half : base + SEG);
          const q = point(to);
          s += `A${R} ${R} 0 0 ${i % 2 === 0 ? 1 : 0} ${n1(q.x)} ${n1(q.y)}`;
        }
        a = to;
      }
      return s;
    }

    /** 一時間ごとの目盛り。曲がり角の上には置きません（そこは札が言うので）。 */
    function ticks() {
      let s = "";
      for (let t = Math.floor(start / 60) * 60 + 60; t < start + span; t += 60) {
        if ((t - start) % rowSpan === 0) continue;
        const p = point(dist(t));
        s += `M${n1(p.x)} ${n1(p.y - 3)}V${n1(p.y + 3)}`;
      }
      return s;
    }

    return { start, end: start + span, rowSpan, rows, H, total, rowY, dist, point, path, ticks };
  }

  /* ---------------- 札の幅の見積もり ----------------

     札は組むたびに測らず、字の数から見積もります（測ると、組み直しのたびに
     レイアウトが一回増える）。見積もりが外れても、札は CSS の省略（…）で
     収まります。かなと漢字は字の大きさぶん、数字は6割、コロンと空白は3割。 */
  function textW(s, px) {
    let w = 0;
    for (const ch of String(s)) {
      if (ch.codePointAt(0) >= 0x2e80) w += 1;
      else if (/[0-9]/.test(ch)) w += 0.6;
      else if (/[:.\s]/.test(ch)) w += 0.3;
      else w += 0.62;
    }
    return w * px;
  }

  /* 文字の大きさの設定（特大＝1.25）。札の幅の見積もりに掛けます。 */
  function fsK() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fs-k"));
    return v > 0 ? v : 1;
  }

  /* 人の形。手描きと同じ、棒の人。足もとが (0,0)、右へ歩いている向き
     （左へ進む段では左右を返します）。前の腕を少し上げて。 */
  const ME_PATH = "M0 -13.2V-6.6L-3.2 -0.2M0 -6.6L3.4 -0.2M-3.6 -8.4L0 -11.4L4.2 -13.6";
  const ME = `<circle cx="0.4" cy="-17.2" r="3.7"/><path d="${ME_PATH}"/>`;

  /* ---------------- 組み立て ---------------- */

  /**
   * @param {object} o
   *   plan   … KN.plan.buildDay の返り（その日の、済んだものも含めて）
   *   today  … 今日を見ているか（人が立つのは今日だけ）
   *   open   … (todoId, 押した要素) 詳細の紙を開く
   *   markOf … (todo) 連れの丸に入れる絵（マスクの url()）。無ければ ""
   *   decide … (todoId, "HH:MM") 空いた道の上で決めた時刻を付ける（段2）
   */
  function build(o) {
    const plan = o.plan;
    const g = geom(plan.startMin, plan.endMin);
    const today = !!o.today;
    const past = !today && plan.day < U.todayKey();

    /* 四つに分けます。停留所（時刻を決めたもの）・足あと（済ませた、時刻の
       無いもの）・連れ（まだの、時刻の無いもの）・夜のごろ（毎晩の、時刻の
       無いもの——「寝る前」は夜に居るほうが本当なので、連れにはしない）。 */
    const stops = [], steps = [], loose = [], later = [];
    plan.items.forEach((it) => {
      const t = it.todo;
      if (it.fixed) {
        const len = Number(t.minutes) > 0;
        const d0 = g.dist(it.atMin);
        stops.push({ t, at: it.atMin, until: it.untilMin, len, d0,
                     d1: len ? Math.max(d0, g.dist(it.untilMin, true)) : d0 });
        return;
      }
      if (closed(t)) {
        if (it.doneAtMin != null) steps.push({ t, d: g.dist(it.doneAtMin) });
        return;
      }
      if (t.trace) return;
      if (t.part === "dusk") {
        const d0 = g.dist(it.atMin);
        later.push({ t, at: it.atMin, d0,
                     d1: Math.max(d0 + 12, Number(t.minutes) > 0 ? g.dist(it.untilMin, true) : d0) });
        return;
      }
      loose.push({ t });
    });

    const stopSvg = stops.map((s, k) => {
      const d = g.path(s.d0, s.d1);
      return `<g class="road-stop${closed(s.t) ? " is-done" : ""}" data-s="${k}">`
        + `<path class="road-stop-edge" d="${d}"/><path class="road-stop-in" d="${d}"/>`
        + `<path class="road-stop-went"/></g>`;
    }).join("");
    const laterSvg = later.map((s) => {
      const d = g.path(s.d0, s.d1);
      return `<g class="road-stop is-later"><path class="road-stop-edge" d="${d}"/>`
        + `<path class="road-stop-in" d="${d}"/></g>`;
    }).join("");
    const stepSvg = steps.map((s) => {
      const p = g.point(s.d);
      return `<circle class="road-step" cx="${n1(p.x)}" cy="${n1(p.y)}" r="2.8"/>`;
    }).join("");
    /* 押せるのは、見えている区間より太い透明な線。停留所の丸は 21 単位で、
       指には細いので。 */
    const hitSvg = stops.map((s, k) =>
      `<path class="road-hit" data-k="${k}" data-grow d="${g.path(s.d0, s.d1)}"/>`).join("")
      + later.map((s, k) =>
        `<path class="road-hit" data-l="${k}" data-grow d="${g.path(s.d0, s.d1)}"/>`).join("");

    const svg = `<svg class="road-svg" viewBox="0 0 ${W} ${g.H}" aria-hidden="true" focusable="false">`
      + `<path class="road-base" d="${g.path(0, g.total)}"/>`
      + `<path class="road-went"/>`
      + `<path class="road-ticks" d="${g.ticks()}"/>`
      + stopSvg + laterSvg
      + `<g class="road-steps">${stepSvg}</g>`
      + `<g class="road-me" style="display:none"><g class="road-me-halo">${ME}</g>`
      + `<g class="road-me-ink">${ME}</g></g>`
      + `<path class="road-free"/>`
      + hitSvg
      + `</svg>`;

    const el = node(html`
      <div class="day-road ${past ? "is-past" : today ? "is-today" : "is-ahead"}"
           role="group" aria-label="一日の道">
        <div class="road-map" style="aspect-ratio:${W} / ${g.H}">
          ${U.raw(svg)}
          <div class="road-marks"></div>
        </div>
        ${today ? html`<p class="road-next"></p>` : ""}
      </div>
    `);
    el.__road = { g, today, past, stops, steps, loose, later,
                  markOf: o.markOf, last: undefined, drawn: false };

    /* 押したものを一か所で受けます（札・透明な線・連れ・空いた道）。 */
    el.addEventListener("click", (e) => {
      if (e.target.classList && e.target.classList.contains("road-free")) {
        decideAt(el, o, e);
        return;
      }
      const hit = e.target.closest("[data-k], [data-l], [data-b], .road-more");
      if (!hit || !el.contains(hit)) return;
      if (hit.classList.contains("road-more")) {
        /* 連れが多すぎて丸に入りきらないときの「+3」。全部は時間割にあるので、
           そこへ送ります。 */
        const list = el.parentNode && el.parentNode.querySelector(".tl-list");
        if (list) list.scrollIntoView({ block: "start", behavior: KN.motion.still() ? "auto" : "smooth" });
        return;
      }
      const pick = hit.hasAttribute("data-k") ? stops[Number(hit.getAttribute("data-k"))]
        : hit.hasAttribute("data-l") ? later[Number(hit.getAttribute("data-l"))]
        : loose[Number(hit.getAttribute("data-b"))];
      if (pick && o.open) o.open(pick.t.id, hit);
    });

    paint(el);
    return el;
  }

  /* ---------------- 描く（「いま」が動いたら、ここだけ） ----------------

     組み直しはしません。30秒ごと（screen-todo の見回り）と、アプリへ戻って
     きたときに呼ばれ、**分が変わっていたときだけ**、歩いたぶん・停留所の塗り・
     人・札・次の一行を置き直します。 */
  function paint(el) {
    const st = el && el.__road;
    if (!st) return;
    const nowMin = st.today ? KN.plan.toMin(U.nowTime()) : null;
    if (st.drawn && st.last === nowMin) return;
    st.last = nowMin;
    st.drawn = true;
    const g = st.g;
    const dNow = nowMin == null ? null : g.dist(nowMin);
    const svg = el.querySelector(".road-svg");

    // ① 歩いたぶんの道
    const went = svg.querySelector(".road-went");
    const wentTo = st.past ? g.total : dNow;
    if (wentTo > 0) went.setAttribute("d", g.path(0, wentTo));
    else went.removeAttribute("d");

    /* 押して決められる道（段2）。**これからの道だけ**——歩いたぶんに時刻を
       付けても、過ぎた約束になるだけなので。過ぎた日には無し。 */
    const free = svg.querySelector(".road-free");
    const from = st.past ? null : dNow == null ? 0 : dNow;
    if (from != null && from < g.total) free.setAttribute("d", g.path(from, g.total));
    else free.removeAttribute("d");

    /* ② 停留所の塗り。時間割の丸薬と同じ決めごと：時計が通ったところまで
       塗る。済ませたものは時計に関わらず塗りきる（手が先に進むことはある）。 */
    const stopEls = svg.querySelectorAll(".road-stop[data-s]");
    st.stops.forEach((s, k) => {
      const grp = stopEls[k];
      if (!grp) return;
      const w = grp.querySelector(".road-stop-went");
      const done = closed(s.t);
      let to = null;
      if (done || st.past) to = s.d1;
      else if (nowMin != null && nowMin >= s.at) to = s.len ? Math.min(dNow, s.d1) : s.d1;
      if (to == null) w.removeAttribute("d");
      else w.setAttribute("d", g.path(s.d0, to));
      grp.classList.toggle("is-live",
        !done && s.len && nowMin != null && nowMin >= s.at && nowMin < s.until);
    });

    /* ③ 人。道の上に立ちます。停留所の中に居るときは、停留所のふちの上に
       （道の太さのところに立たせると、足がふちの中へ埋まる）。 */
    const me = svg.querySelector(".road-me");
    if (dNow == null) me.style.display = "none";
    else {
      const p = g.point(dNow);
      const onStop = st.stops.some((s) => s.len && nowMin >= s.at && nowMin < s.until);
      me.style.display = "";
      me.setAttribute("transform", `translate(${n1(p.x)} ${n1(p.y - (onStop ? STOP : ROAD) / 2)})`
        + ` scale(${p.ltr ? ME_K : -ME_K} ${ME_K})`);
    }

    // ④ 札・連れ・いまの時刻
    el.querySelector(".road-marks").innerHTML = String(marks(st, nowMin, dNow));

    // ⑤ 次の一行
    const next = el.querySelector(".road-next");
    if (next) next.innerHTML = String(caption(st, nowMin));
  }

  /* ---------------- 札を置く ----------------

     札は段の上か下の「通り」に、一行で置きます。置く順が、そのまま譲る順です：
       1. 人の頭（上の通り）と、いまの時刻（下の通り）
       2. 停留所の「時刻 題」。始まりの点から、進む向きへ伸ばす。ぶつかるなら
          縮めて、それでも入らなければ下の通り、逆向き、時刻だけ……と試す
       3. 区間の終わりの時刻（45分以上のものだけ。空いていれば）
       4. 夜のごろ
     入らないものは出しません。区間そのものは道に残り、押せば開きます。 */
  function marks(st, nowMin, dNow) {
    const g = st.g;
    const FS = 11 * fsK();
    /* 通りは段ごとに上（u）と下（d）。**曲がり角の側は、角の手前まで**
       ——上の段から降りてくる角・下の段へ降りる角が、通りの端を横切るので
       （特大の字で、札の尻が角の道に触れた）。 */
    const lanes = {};
    const lane = (row, side) => {
      const key = row + side;
      if (lanes[key]) return lanes[key];
      const occ = [];
      const ltr = row % 2 === 0;
      occ.lo = 2; occ.hi = W - 2;
      if (side === "u" && row > 0) { if (ltr) occ.lo = XL - 12; else occ.hi = XR + 12; }
      if (side === "d" && row < g.rows - 1) { if (ltr) occ.hi = XR + 12; else occ.lo = XL - 12; }
      return (lanes[key] = occ);
    };
    const pct = (v, of) => (v / of * 100).toFixed(3) + "%";
    const at = (x, y) => `left:${pct(x, W)};top:${pct(y, g.H)}`;
    const out = [];

    /** 通り occ に、anchor から dir の向きへ want まで伸ばして置けるか。
        置ければ [左, 右]、置けなければ null（min に届かない）。
        出だしに何かが居るときは、SLIDE までなら**その先へずらして**置きます
        ——停留所のすぐ手前に人が立つと（7:43 と 8:00）、札の頭がちょうど人の
        頭に当たって、次の予定の札が消えていました。 */
    const SLIDE = 28;
    function fit(occ, anchor, dir, want, min) {
      const near = occ.slice().sort((p, q) => (dir > 0 ? p[0] - q[0] : q[1] - p[1]));
      if (anchor < occ.lo || anchor > occ.hi) return null;
      let lo = dir > 0 ? anchor : Math.max(occ.lo, anchor - want);
      let hi = dir > 0 ? Math.min(occ.hi, anchor + want) : anchor;
      for (const [a, b] of near) {
        if (b + GAP <= lo || a - GAP >= hi) continue;
        if (dir > 0) {
          if (a - GAP > lo) { hi = a - GAP; break; }
          if (b + GAP - anchor > SLIDE) return null;
          lo = b + GAP; hi = Math.min(occ.hi, lo + want);
        } else {
          if (b + GAP < hi) { lo = b + GAP; break; }
          if (anchor - (a - GAP) > SLIDE) return null;
          hi = a - GAP; lo = Math.max(occ.lo, hi - want);
        }
      }
      return hi - lo >= min ? [lo, hi] : null;
    }
    /** 真ん中に置けるか（縮めない）。 */
    function fitMid(occ, x, w) {
      const lo = Math.max(occ.lo, Math.min(occ.hi - w, x - w / 2));
      return occ.every(([a, b]) => lo + w + GAP <= a || lo >= b + GAP) ? [lo, lo + w] : null;
    }

    // 始まりと終わりの時刻、曲がり角の時刻（物差し）
    const p0 = g.point(0), pe = g.point(g.total);
    out.push(html`<span class="road-edge is-before" style="${at(p0.x - 9, p0.y)}">${clock(g.start)}</span>`);
    out.push(html`<span class="road-edge ${pe.ltr ? "" : "is-before"}"
                        style="${at(pe.x + (pe.ltr ? 9 : -9), pe.y)}">${clock(g.end)}</span>`);
    /* 角の時刻は、人がそこに立っているときは出しません（頭と重なる。
       人の足もとの時刻の札が、同じことを言っています）。 */
    const me = dNow == null ? null : g.point(dNow);
    for (let i = 0; i < g.rows - 1; i++) {
      const x = i % 2 === 0 ? XR + R * 0.36 : XL - R * 0.36;
      const y = g.rowY(i) + R;
      if (me && Math.abs(me.x - x) < 26 && Math.abs(me.y - 24 - y) < 30) continue;
      out.push(html`<span class="road-turn" style="${at(x, y)}">${
        clock(g.start + (i + 1) * g.rowSpan)}</span>`);
    }

    /* 1. 人の頭・連れ・いまの時刻。
       **連れは道に乗せません。** 道の上は時刻そのものなので、人の後ろの道に
       並べると「7:20 にメール」と、過ぎた時刻に置いたように読めます（一度
       そう描いて外しました）。手描きのとおり、人の頭の高さで、後ろに並べます。
       後ろに入りきらない（段の頭に居る）ときは、まとめて前へ。 */
    if (dNow != null) {
      const p = g.point(dNow);
      lane(p.row, "u").push([p.x - ME_W, p.x + ME_W]);
      if (st.loose.length) {
        const many = st.loose.length > BEADS_MAX;
        const shown = many ? st.loose.slice(0, BEADS_MAX - 1) : st.loose;
        const count = shown.length + (many ? 1 : 0);
        const back = p.ltr ? -1 : 1;
        const far = p.x + back * (BEAD_BACK + (count - 1) * BEAD);
        const dir = far - 9 >= 2 && far + 9 <= W - 2 ? back : -back;
        const xs = Array.from({ length: count }, (_, i) => p.x + dir * (BEAD_BACK + i * BEAD));
        const y = p.y - LANE;
        lane(p.row, "u").push([Math.min(...xs) - 9, Math.max(...xs) + 9]);
        shown.forEach((c, b) => {
          const m = st.markOf ? st.markOf(c.t) : "";
          out.push(html`
            <button type="button" class="road-bead ${m ? "" : "is-plain"}" data-b="${String(b)}"
                    style="${at(xs[b], y)}${m ? U.raw(";--icon:" + m) : ""}"
                    aria-label="${c.t.title}（時刻を決めていない）"></button>`);
        });
        if (many) {
          const rest = st.loose.length - shown.length;
          out.push(html`
            <button type="button" class="road-bead road-more" style="${at(xs[count - 1], y)}"
                    aria-label="時刻を決めていないもの、ほかに${rest}件">+${rest}</button>`);
        }
      }
      const txt = clock(nowMin);
      const box = fitMid(lane(p.row, "d"), p.x, textW(txt, FS) + 2);
      if (box) {
        lane(p.row, "d").push(box);
        out.push(html`<span class="road-now" style="${at(box[0], p.y + LANE)}">${txt}</span>`);
      }
    }

    /* 2. 停留所の「時刻 題」。試す順：上に全部 → 下に全部 → 上で縮めて →
       下で縮めて → 逆向き → 時刻だけ。縮めるより、下の通りへ移すほうが先
       （題が「朝のル…」になるより、一段下に全部読めるほうがいい）。 */
    function place(p, time, title, tries) {
      const tw = textW(time, FS) + 1;
      const full = tw + 4 + textW(title, FS) + 1;
      const min = tw + 4 + FS * 1.6;
      const dir = p.ltr ? 1 : -1;
      const anchor = p.x + (p.ltr ? -3 : 3);
      for (const [side, d, mode] of tries) {
        const occ = lane(p.row, side);
        const only = mode === "time";
        const box = fit(occ, anchor, d * dir, only ? tw : full,
          only ? tw : mode === "full" ? full : min);
        if (!box) continue;
        occ.push(box);
        return { lo: box[0], hi: box[1], y: p.y + (side === "u" ? -LANE : LANE),
                 rev: d * dir < 0, only };
      }
      return null;
    }
    const TRIES = [["u", 1, "full"], ["d", 1, "full"], ["u", 1], ["d", 1],
                   ["u", -1], ["d", -1], ["u", 1, "time"], ["d", 1, "time"]];
    st.stops.forEach((s, k) => {
      const time = clock(s.at);
      const b = place(g.point(s.d0), time, s.t.title, TRIES);
      if (!b) return;
      const done = closed(s.t);
      out.push(html`
        <button type="button" class="road-label ${b.rev ? "is-rev" : ""} ${done ? "is-done" : ""}"
                data-k="${String(k)}" style="${at(b.lo, b.y)};width:${pct(b.hi - b.lo, W)}"
                aria-label="${time} ${s.t.title}${done ? "（済み）" : ""}">
          <b>${time}</b>${b.only ? "" : html`<span>${s.t.title}</span>`}
        </button>`);
    });

    // 3. 区間の終わりの時刻
    st.stops.forEach((s) => {
      if (!s.len || s.until - s.at < 45) return;
      const p = g.point(s.d1);
      const txt = clock(s.until);
      const box = fitMid(lane(p.row, "d"), p.x, textW(txt, FS * 0.92) + 2);
      if (!box) return;
      lane(p.row, "d").push(box);
      out.push(html`<span class="road-until" style="${at(box[0], p.y + LANE)}">${txt}</span>`);
    });

    // 4. 夜のごろ
    st.later.forEach((s, k) => {
      const time = clock(s.at) + "ごろ";
      const b = place(g.point(s.d0), time, s.t.title, TRIES.slice(0, 6));
      if (!b) return;
      out.push(html`
        <button type="button" class="road-label is-later ${b.rev ? "is-rev" : ""}"
                data-l="${String(k)}" style="${at(b.lo, b.y)};width:${pct(b.hi - b.lo, W)}"
                aria-label="${time} ${s.t.title}">
          <b>${time}</b><span>${s.t.title}</span>
        </button>`);
    });

    return html`${out}`;
  }

  /* ---------------- 次の一行 ----------------

     「次は 13:00 病院 · あと5時間17分」。道を読めば分かることですが、
     **いちばん知りたい一つ**なので、字でも一度だけ言います（道の案内の
     「次の角まで」）。「あと」は次の決まった予定までの空きで、急かす数では
     ありません。遅れ・予定通り・達成は言いません。 */
  function caption(st, nowMin) {
    if (nowMin == null) return "";
    const open = st.stops.filter((s) => !closed(s.t));
    const cur = open.find((s) => s.len && nowMin >= s.at && nowMin < s.until);
    const next = open.find((s) => s.at > nowMin);
    const nextTxt = next ? html`次は <b>${clock(next.at)} ${next.t.title}</b>` : "";
    const sep = html`<span class="road-sep" aria-hidden="true">·</span>`;
    if (cur) {
      return html`いまは <b>${cur.t.title}</b>（${clock(cur.until)}まで）${next ? html`${sep}${nextTxt}` : ""}`;
    }
    if (next) {
      const left = next.at - nowMin;
      return html`${nextTxt}${sep}${left > 0 ? `あと${KN.plan.humanSpan(left)}` : "いまから"}`;
    }
    if (nowMin < st.g.end) return html`このあと、決まった予定はありません`;
    return "";
  }

  /* ---------------- 道の上で決める（段2） ----------------

     空いた道を押すと、その時刻（15分きざみ）と前後の空きを出し、「時刻を
     決めていないもの」から一つ選べば、その時刻が付いて停留所になります。

     **決めるのは本人。** 空いているから何か入れろとは言いません——選ぶものが
     無ければ無いと言うだけで、新しく書く欄も出しません（入力を増やさない）。
     「空き」は長さを言うだけで、埋めるべき余白としては言いません。 */

  /** viewBox の点 → いちばん近い時刻（分）。1分ずつ道をなぞって探します
      （一日で千回ほど。押したときに一度だけなので、逆算の式を持つより素直）。 */
  function timeNear(g, x, y) {
    let best = g.start, bd = Infinity;
    for (let t = g.start; t <= g.end; t++) {
      for (const tail of [false, true]) {
        const p = g.point(g.dist(t, tail));
        const dd = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (dd < bd) { bd = dd; best = t; }
      }
    }
    return best;
  }

  /** 時刻 raw のまわりの空き。前後の停留所（時刻を決めたもの）のあいだで、
      今日なら「いま」より前は数えません。長さを決めていない停留所は点なので、
      始まりの時刻で区切ります。停留所の中なら、その停留所を返します。 */
  function gapAt(st, raw, nowMin) {
    const g = st.g;
    let lo = g.start, hi = g.end, inside = null;
    st.stops.forEach((s) => {
      const end = s.len ? s.until : s.at;
      if (s.len && s.at <= raw && raw < s.until) inside = s;
      if (end <= raw) lo = Math.max(lo, end);
      if (s.at > raw) hi = Math.min(hi, s.at);
    });
    if (nowMin != null) lo = Math.max(lo, nowMin);
    return { lo, hi, inside };
  }

  /** 空きの中で、押した時刻にいちばん近い15分きざみ。空きの尻ちょうど
      （次の停留所の頭）は選ばず、その15分前まで。 */
  function snap(raw, lo, hi) {
    const Q = 15;
    const first = Math.ceil(lo / Q) * Q;
    const last = Math.floor((hi - 1) / Q) * Q;
    if (first > last) return first;
    return Math.max(first, Math.min(last, Math.round(raw / Q) * Q));
  }

  function decideAt(el, o, e) {
    const st = el.__road;
    if (!st || st.past) return;
    const map = el.querySelector(".road-map").getBoundingClientRect();
    const k = map.width / W;
    if (!(k > 0)) return;
    const g = st.g;
    const nowMin = st.today ? KN.plan.toMin(U.nowTime()) : null;
    const raw = timeNear(g, (e.clientX - map.left) / k, (e.clientY - map.top) / k);
    const gap = gapAt(st, nowMin != null ? Math.max(raw, nowMin) : raw, nowMin);
    if (gap.inside) { if (o.open) o.open(gap.inside.t.id, e.target); return; }
    const at = snap(raw, gap.lo, gap.hi);
    if (at >= g.end) return;

    const cands = st.loose.concat(st.later);
    const rows = cands.map((c) => {
      const m = st.markOf ? st.markOf(c.t) : "";
      const len = Number(c.t.minutes) > 0 ? KN.plan.humanSpan(Number(c.t.minutes)) : "";
      const row = node(html`
        <button type="button" class="act-row road-pick" data-id="${c.t.id}">
          <span class="act-ico"><span class="road-pick-mark ${m ? "" : "is-plain"}"
                ${m ? U.raw(`style="--icon:${m}"`) : ""}></span></span>
          <span class="act-main">
            <span class="act-label">${c.t.title}</span>
            ${len ? html`<span class="act-sub">${len}</span>` : ""}
          </span>
        </button>
      `);
      return { row, id: c.t.id };
    });
    const box = node(html`
      <div class="road-decide">
        ${gap.hi > gap.lo ? html`<p class="road-gap"><b>${clock(gap.lo)}〜${clock(gap.hi)}</b>
          <span>空き${KN.plan.humanSpan(gap.hi - gap.lo)}</span></p>` : ""}
        ${cands.length
          ? html`<p class="road-decide-head">時刻を決めていないもの</p><div class="act-list"></div>`
          : html`<p class="road-decide-none">時刻を決めていないものはありません</p>`}
      </div>
    `);
    const list = box.querySelector(".act-list");
    const handle = KN.ui.sheet({ title: clock(at), content: box, as: "dialog" });
    rows.forEach(({ row, id }) => {
      row.addEventListener("click", () => {
        handle.close();
        /* 閉じ終わってから（ほかの操作の紙と同じ拍）。 */
        setTimeout(() => { if (o.decide) o.decide(id, KN.plan.toTime(at)); }, 40);
      });
      list.append(row);
    });
  }

  /** その根の中の道を、ぜんぶ描き直す（分が変わっていなければ何もしない）。 */
  function paintAll(root) {
    if (!root) return;
    root.querySelectorAll(".day-road").forEach(paint);
  }

  KN.dayRoad = { build, paint, paintAll, geom, snap, W };
})();
