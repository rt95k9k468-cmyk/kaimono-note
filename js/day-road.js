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
     道を薄いままにして停留所だけ塗り、区間は決めたとおりに描いて、押した時刻に
     白い粒。先の日はぜんぶがこれから。

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
  /* 段と段の、中心どうしのあいだ。はじめは 64 で、札が上下の段と詰まって
     読みにくかったので 80 に（2026年9月30日・利用者の声「道の間の縦幅ももう
     少し」）。折り返しの半径も大きくなり、一段のまっすぐな長さは 276 → 260。
     同じ日にもう一度、利用者の声で 96 にしたが広すぎて 88 に（まっすぐは 252）。 */
  /* 10月2日、角も時間を持って五段になったあと、利用者の声「段は増やさずに縦の幅を
     少し広げて」で 94 に。 */
  const PITCH = 94;
  const R = PITCH / 2;          // 折り返しの半径
  const XL = PAD + R;           // 段のまっすぐなところの左端
  const XR = W - PAD - R;       // 右端
  const RUN = XR - XL;          // 一段のまっすぐな長さ
  const ARC = Math.PI * R;      // 折り返しの長さ
  const SEG = RUN + ARC;
  const TOP = 46;               // 一段目の上：札と、人の頭のぶん
  const BOT = 30;               // いちばん下の段の下：いまの時刻の札のぶん
  const ROAD = 9;               // 道の太さ（CSS の stroke-width と同じ数）
  const STOP = 16;              // 停留所の太さ（ふち。はじめは 21、9月30日に細く）
  const LANE = 19;              // 道の中心から、上・下の札の中心まで
  const GAP = 4;                // 札どうしのすきま
  const ME_K = 1.45;            // 人の大きさ（下の形の何倍で描くか。背の高さ約30）
  const ME_W = 9;               // 人の半分の幅（上の札がよける）
  const BEAD = 19;              // 連れどうしの間（丸は 18px）
  const BEAD_BACK = 16;         // 人から、最初の連れまで
  const BEADS_MAX = 5;
  /* 一日を何段に折るか。はじめは四段（高さ 268・15分が 14px）でしたが、
     スマホの縦に合わせて六段にしました（2026年9月29日・利用者の声）。
     5:00〜23:00 なら一段3時間・高さ 396 で、15分が 23px——段2の「押して
     決める」が指に合い、札も入りやすくなります。段の間（PITCH）は、時間を
     細かくするためには広げません（折り返しの半円が大きくなるだけ）——9月30日に
     広げたのは、札の読みやすさのため。
     角も時間を持つようになって（10月2日）、六段は「多くても」の数になった（geom が
     入りきるいちばん短い一段を選ぶので、長い一日は五段になることがある）。 */
  const ROWS = 6;

  const n1 = (v) => Math.round(v * 10) / 10;
  const clock = (min) => KN.plan.toTime(min).replace(/^0(\d:)/, "$1");
  const closed = (t) => !!(t.done || t.archived);

  /* ---------------- 時刻と、道の上の位置 ----------------

     道は段ごとに向きを変えます（一段目は右へ、二段目は左へ……）。

     **曲がり角も時間を持ちます**（2026年10月2日・利用者の声「1日の道の曲線部分にも、
     時間を持たせよう」）。道は**どこでも同じ長さが同じ時間**——まっすぐも曲がり角も。
     前は角が時間を持たず（段の尻と次の段の頭が同じ時刻）、角をまたぐ用事は時間の
     無い線を回り込み、人も角で次の段へ跳んでいた。
     - **角のまん中（いちばん外へ張り出したところ）がちょうどの時。** 角どうしの
       あいだが一段ぶん（`rowSpan`、1時間単位）。角の札（「12:00」）は前と同じところで、
       前と同じく物差しを言う。
     - そのかわり、一段目の左の端（と最後の段の終わり）は半端な時刻になる。道そのものは
       begin から描くので、端は見えない（空いた頭には寝床が入る）。
     - 一段のまっすぐは `rowSpan` の 65% ほど、角が残りの 35% ほど。
     - 段の数は六段まで（ROWS）。入りきるいちばん短い `rowSpan` を選ぶ（2時間から）。
       角も時間を持つぶん、同じ一日が前より少ない段に入る（5:30〜22:30 なら一段4時間の
       五段。15分は 24 単位で、前の六段の 21 より細かい）。
     - 始まり（begin）と終わり（end）は、どちらもまっすぐの上に来るように選ぶ
       （寝床が道の端の延長に置かれるので）。 */
  function geom(begin, end) {
    end = Math.max(end, begin + 60);
    const HALF = ARC / 2;
    /* 一段 rowSpan、始まりの角の一つ前のちょうどの時 start を、小さい rowSpan から探す。
       start は遅いほど一段目の空きが少ない。 */
    let rowSpan = 0, start = 0, rows = 1, k = 1;
    search:
    for (let rs = 120; rs <= 24 * 60; rs += 60) {
      const kk = SEG / rs;
      const s0 = Math.floor((begin - HALF / kk) / 60) * 60;
      for (let s = s0; s >= s0 - 180; s -= 60) {
        const a = (begin - s) * kk - HALF, b = (end - s) * kk - HALF;
        if (a < -1e-6 || a > RUN + 1e-6) continue;          // 始まりが一段目のまっすぐに無い
        const n = Math.floor(b / SEG + 1e-9) + 1;
        if (b - (n - 1) * SEG > RUN + 1e-6) continue;       // 終わりが曲がり角の上
        rowSpan = rs; start = s; rows = n; k = kk;
        if (n <= ROWS) break search;
        break;                                                // この rowSpan では入らない
      }
    }
    const H = TOP + (rows - 1) * PITCH + BOT;
    const rowY = (i) => TOP + i * PITCH;

    /** 時刻 → 道の長さ。角 j（0から）のまん中が start + (j+1)·rowSpan。道の始まり（begin）
        より前は始まりに、終わりより後は終わりに寄せる。 */
    function dist(t) {
      return (Math.max(begin, Math.min(end, t)) - start) * k - HALF;
    }
    const total = dist(end);
    const d0 = dist(begin);                     // 道の始まり（一段目の途中のこともある）

    /* 並走（off）。時刻の重なった停留所は、道を横に割った車線に描きます（
       2026年9月29日）。off は**進む向きの左へ**のずらし：右へ進む段では上、左へ
       進む段では下。右の曲がり角では外回り（半径 R + off）、左の角では内回り
       （R − off）になり、角をはさんでも同じ車線のまま次の段へつながります。 */
    const rOf = (i, off) => (i % 2 === 0 ? R + off : R - off);

    /** 長さ → 点。段と向き、進む向き（tx, ty）と、それに直交する向き（nx, ny。
        まっすぐなら真下、角なら外向き）も。角の上なら arc と、角に入ってからの角度 a。 */
    function point(d, off = 0) {
      const dd = Math.max(0, Math.min(total, d));
      const i = Math.max(0, Math.min(rows - 1, Math.floor(dd / SEG + 1e-9)));
      const rem = dd - i * SEG;
      const y = rowY(i);
      const ltr = i % 2 === 0;
      if (rem <= RUN + 1e-9) {
        return { x: ltr ? XL + rem : XR - rem, y: y + (ltr ? -off : off), row: i, ltr,
                 tx: ltr ? 1 : -1, ty: 0, nx: 0, ny: 1 };
      }
      const a = (rem - RUN) / R, r = rOf(i, off);
      const s = Math.sin(a), c = Math.cos(a);
      return { x: ltr ? XR + r * s : XL - r * s, y: y + R - r * c, row: i, ltr, arc: true, a,
               tx: ltr ? c : -c, ty: s, nx: ltr ? s : -s, ny: -c };
    }
    /** 札の置き場所に使う点。角の上なら、近いほうのまっすぐの端（角の前半は
        その段の尻、後半は次の段の頭）。札の通りは、まっすぐな段の上と下にしか無いので。 */
    function flat(d) {
      const p = point(d);
      if (!p.arc) return p;
      return point(p.a < Math.PI / 2 ? p.row * SEG + RUN : (p.row + 1) * SEG);
    }
    /** y にいちばん近い段（角の上に居る人の、札の通りを決める）。 */
    const rowAt = (y) => Math.max(0, Math.min(rows - 1, Math.round((y - TOP) / PITCH)));

    /** 長さ d0〜d1 の道筋（SVG の d）。長さが無ければ点——丸い端が丸を描きます。 */
    function path(d0, d1, off = 0) {
      let a = Math.max(0, Math.min(total, d0));
      const b = Math.max(a, Math.min(total, d1));
      const p = point(a, off);
      let s = `M${n1(p.x)} ${n1(p.y)}`;
      if (b - a < 0.05) return s + "l0.01 0";
      for (let guard = 0; b - a > 1e-6 && guard < 64; guard++) {
        const i = Math.max(0, Math.min(rows - 1, Math.floor(a / SEG + 1e-9)));
        const base = i * SEG;
        let to;
        if (a - base < RUN - 1e-6) {
          to = Math.min(b, base + RUN);
          const q = point(to, off);
          s += `L${n1(q.x)} ${n1(q.y)}`;
        } else {
          /* 曲がり角は四分の一ずつ。半周を一度に描くと、始点と終点が直径の
             両端になって、どちら回りかが決まりません。 */
          const half = base + RUN + ARC / 2;
          to = Math.min(b, a < half - 1e-6 ? half : base + SEG);
          const q = point(to, off), r = n1(rOf(i, off));
          s += `A${r} ${r} 0 0 ${i % 2 === 0 ? 1 : 0} ${n1(q.x)} ${n1(q.y)}`;
        }
        a = to;
      }
      return s;
    }

    /** 一時間ごとの目盛りの時刻（道の上にあるもの）。角のまん中もちょうどの時なので、
        そこにも置く（角の札がその目盛りを言う）。 */
    function tickTimes() {
      const out = [];
      for (let t = Math.floor(begin / 60) * 60 + 60; t < end; t += 60) out.push(t);
      return out;
    }
    /** 目盛りの道筋。道に直交する短い線（角の上では外向き）。half は半分の長さ、off は車線。 */
    function tickPath(ts, off = 0, half = 3) {
      return ts.map((t) => {
        const p = point(dist(t), off);
        return `M${n1(p.x - p.nx * half)} ${n1(p.y - p.ny * half)}`
          + `L${n1(p.x + p.nx * half)} ${n1(p.y + p.ny * half)}`;
      }).join("");
    }
    const ticks = () => tickPath(tickTimes());
    /** 目盛りの代わりの時の数字（2026年10月2日・利用者の声「時刻は24時間表記で、時間の線の
        ところに、線の上で書いてみて」）。道の上（off は車線）に「13」と、時だけ。
        角の上でも立てたまま。 */
    function hourSvg(ts, off = 0, fs = HOUR_FS) {
      return ts.map((t) => {
        const p = point(dist(t), off);
        return `<text x="${n1(p.x)}" y="${n1(p.y)}" data-t="${t}" font-size="${n1(fs)}">${Math.floor(t / 60) % 24}</text>`;
      }).join("");
    }

    return { start, begin, end, rowSpan, rows, H, total, d0, rowY, rowAt, dist, point, flat, path,
             ticks, tickTimes, tickPath, hourSvg };
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
  /* 時の数字の大きさ（2026年10月2日）。**二桁が細い道（太さ 9）に収まる大きさに、全部そろえる**
     （利用者の声「角の二桁だけ小さくしないで。それなら全部を小さく」）。字の大きさの設定で
     大きくはしない——道からはみ出すので。 */
  const HOUR_FS = 7.4;
  const hourFs = () => Math.min(HOUR_FS, HOUR_FS * fsK());
  function fsK() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fs-k"));
    return v > 0 ? v : 1;
  }

  /* 人の形。利用者が選んだ絵（2026年9月29日）：塗りの、歩く人。頭・シャツ・
     腕・ズボンを太い線と面で。奥の脚は一段濃く、奥の腕はシャツの後ろ。
     描くのは元の絵の座標（1200四方・足もとが y=1100）で、0.021 倍して足もとを
     (0,0) に。右へ歩いている向きで、左へ進む段では左右を返します（外の scale）。
     まわりに紙の色の縁（halo）——道や札の上でも形が読めるように。
     四つめは歩くときの呼び名（下の「歩く」が、縁と絵の両方を data-w で引く）。 */
  const ME_PARTS = [
    ["me-skin", "M470 440L378 492L338 688", 74, "armB"],        // 奥の腕
    ["me-shirt", "M555 356L445 452", 82, "sleeveB"],            // 奥の袖
    ["me-leg-b", "M478 690L425 878L325 1050", 100, "legB"],     // 奥の脚
    ["me-leg", "M540 690L690 890L775 1050", 100, "legF"],       // 手前の脚
    ["me-shirt", "M468 643L512 462L540 350Q575 325 615 325Q690 330 700 405L637 685Z", 0, "body"],
    ["me-skin", "M705 550L700 612L862 663", 72, "armF"],        // 手前の腕
    ["me-shirt-d", "M680 400L712 555", 74, "sleeveF"],          // 手前の袖
  ];
  const HALO = 110;             // 縁の太さ（元の絵の単位。約 2.9px）
  /* 描くのは止まった形（REST。元の絵と同じ位置で、前の脚が奥の脚。下の「歩く」で組む）。 */
  function meSvg(halo) {
    const lift = REST.lift ? ` transform="${REST.lift}"` : "";
    const parts = ME_PARTS.map(([cls, , w, key]) => (w
      ? `<path class="${halo ? "" : cls + " me-line"}" data-w="${key}" d="${REST[key]}" stroke-width="${w + (halo ? HALO : 0)}"/>`
      : `<path class="${halo ? "" : cls + " me-fill"}" data-w="${key}" d="${REST[key]}"${lift}`
        + `${halo ? ` stroke-width="${HALO}"` : ""}/>`));
    parts.push(`<circle class="${halo ? "" : "me-skin me-fill"}" data-w="head" cx="662" cy="187" r="88"`
      + `${lift}${halo ? ` stroke-width="${HALO}"` : ""}/>`);
    return `<g transform="scale(0.021) translate(-560 -1100)">${parts.join("")}</g>`;
  }
  const ME_HEAD = (1100 - 187) * 0.021 * ME_K;   // 足もとから頭の中心まで

  /* 寝床（2026年9月30日・利用者の声「5:30 の前と 22:30 の後に、この就寝アイコンを。
     歩く人との整合性も取りながら」）。道の両端の外に置く——起きる前と寝たあとは、
     道の外にいる。利用者が貼った絵（ベッドに寝た人と z Z）を、歩く人と同じ描き方で：
     塗りの面、頭は歩く人と同じ肌の丸（髪は描かない）、寝巻きは歩く人のシャツの色、
     紙の色の縁。元の絵の座標（1280幅・床が y=700）のまま、幅 BED_W に縮める。
     向きは**朝も夜も同じ**（2026年10月1日・利用者の声「上の寝ている人の向きは、下の人に
     揃えよう」）。夜の寝床（歩く人の逆。足もとが道の側）の向きを朝にも使う。前は朝だけ
     左右を返していて、上と下で寝ている向きが違って見えた。
     z Z は縮めない（元の割合だと 3px で読めない）。道を外れた時間にアプリを開いて
     いれば、z Z がいびきのように上へのぼる（.is-snore。paint が付ける）。 */
  const BED_W = 38;             // 寝床の幅
  /* 道の端から寝床まで。はじめは 6（道の丸い端 4.5 のすぐ外）で、道にくっついて見えた
     （2026年10月1日・利用者の声「道にぴったりくっつかないで」）。XL（54）で終わる道でも
     54 − 12 − 38 = 4 で紙の中に収まる。 */
  const BED_GAP = 12;
  const BED_K = BED_W / (1205 - 118);
  const BED_PARTS = [
    ["bed-frame", "M118 700V231a36 36 0 0 1 72 0V700Z"],             // 頭板
    ["bed-frame", "M190 515H1205V700H190Z"],                          // 台
    ["bed-sheet", "M190 400H530V515H190Z"],                           // 枕とシーツ
    ["me-shirt", "M395 515Q425 420 470 388Q500 366 530 364V515Z"],    // 寝巻きの肩
    ["bed-quilt", "M528 345H1150Q1205 345 1205 400V590H528Z"],        // 掛けぶとん
    ["bed-fold", "M528 325H640V590H528Z"],                            // 折り返し
  ];
  const zPath = (cx, cy, w) => `M${n1(cx - w / 2)} ${n1(cy - w / 2)}H${n1(cx + w / 2)}`
    + `L${n1(cx - w / 2)} ${n1(cy + w / 2)}H${n1(cx + w / 2)}`;
  function bedSvg(k, b) {
    const shapes = (halo) => BED_PARTS.map(([cls, d]) => `<path class="${halo ? "" : cls}" d="${d}"/>`).join("")
      + `<circle class="${halo ? "" : "me-skin"}" cx="340" cy="405" r="72"/>`;
    const inner = (halo) => `<g transform="scale(${n1(BED_K * 1e4) / 1e4}) translate(-661.5 -700)">${shapes(halo)}</g>`;
    /* z Z は字なので返さない（返すと「S」に見える）。置き場所とのぼる向きだけ返す。 */
    const at = `translate(${n1(b.cx)} ${n1(b.y + ROAD / 2)})`;
    return `<g class="road-bed" data-bed="${k}">`
      + `<g class="road-bed-body" transform="${at} scale(${b.sx} 1)">`
      + `<g class="road-bed-halo">${inner(true)}</g><g class="road-bed-ink">${inner(false)}</g></g>`
      + `<g transform="${at}"${b.sx < 0 ? ` style="--zx:-1"` : ""}>`
      + `<path class="road-z" d="${zPath(b.sx * -9, -20.5, 4.6)}"/>`
      + `<path class="road-z is-big" d="${zPath(b.sx * -2, -27, 6.2)}"/></g></g>`;
  }
  const BED_TOP = 34;           // 床から z Z のてっぺんまで。いびきでのぼるぶん（4）も（札がよける）
  /** 道の両端の寝床の置き場所。[朝, 夜]。道の外側（始まりの手前・終わりの先）に。 */
  function bedsOf(g) {
    const sx = g.point(g.total, 0).ltr ? -1 : 1;  // 夜の向き（歩く人の逆）を朝にも
    return [g.d0, g.total].map((d, i) => {
      const p = g.point(d, 0);
      const fwd = p.ltr ? 1 : -1;
      const side = i === 0 ? -fwd : fwd;          // 道の端から、寝床の側
      const a = p.x + side * BED_GAP, b = a + side * BED_W;
      return { lo: Math.min(a, b), hi: Math.max(a, b), cx: (a + b) / 2, y: p.y, row: p.row,
               side, sx, road: p };
    });
  }

  /* ---------------- 歩く（やることを開いたとき） ----------------

     タブを開いた瞬間に、道の人が四歩あるいて、いつもの形で止まります
     （2026年9月29日・利用者の声）。**その場で足踏み**です——人の立つ点は
     「いま」なので、道の上を進ませると、そのあいだ時刻が嘘になる。

     止まった形は利用者が選んだ絵と同じ位置で、**前に出ている脚を奥の脚**として
     描いたもの（REST。下の「止まった形」）。そこから出て、そこへ戻る二周（一周で
     二歩）。関節は絵そのものから読みます（腰・膝・足、肩・肘・手）——数を二重に
     持たない。
     - 脚は二本の骨の IK。足の通り道（着いたら後ろへ送られ、離れたら弧を
       描いて前へ）を決めて、膝は前へ曲がる側に解きます。届かなければ
       つま先が浮く（蹴り出し）だけで、足は地面より下へ行きません。
     - 元の絵は手前の脚が長く、腰も手前が前に出ています（奥行きの描き方）。
       これを**腰のひねり**として読み、脚が前後を入れ替えるのに合わせて、
       腰の位置と腿・すねの長さも入れ替えます。入れ替えないと一歩目が大股・
       二歩目が小股になって、足を引きずって見えた（試作で踏んだ）。
     - 腕は脚と逆に、**最初から最後まで**、**脚と同じ拍・同じ大きさで**振ります
       （9月29日・利用者の声）。歩き出しと止まりぎわは、半ばと同じ動きが速く・
       遅くなるだけで、腕と脚は同時に止まります。振りの端は元の絵の腕と、その
       左右を入れ替えた角度。
     - 体は一歩ごとに少し浮きます（片足で立つところがいちばん高い）。
     - 速さは台形（はじめの 15% で 0 から上がり、おわりの 25% で 0 まで）。
     一歩の長さは `--m-walk`。動きを減らす設定では歩きません。書き換えるのは
     人の中の d と transform だけで、組み直しも、測ることもしません。 */
  const WALK = {
    steps: 4,           // 歩数。止まった形へ戻るので偶数
    stance: 0.55,       // 一周のうち、足が地面にある割合
    lift: 55,           // 振り出す足の上がり（元の絵の単位。約 1.7px）
    bob: 18,            // 体の浮き（同じ。約 0.5px）
    rampIn: 0.15,       // 速さの台形：上がりきるまで
    rampOut: 0.25,      //              止まるまで
  };
  const ptsOf = (d) => {
    const v = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const out = [];
    for (let i = 0; i + 1 < v.length; i += 2) out.push({ x: v[i], y: v[i + 1] });
    return out;
  };
  /* 回す。a が正なら「前へ」（真下を向いたものが +x へ）。 */
  function rot(p, c, a) {
    const cs = Math.cos(a), sn = Math.sin(a), dx = p.x - c.x, dy = p.y - c.y;
    return { x: c.x + dx * cs + dy * sn, y: c.y - dx * sn + dy * cs };
  }
  let RIG = null;
  function rig() {
    if (RIG) return RIG;
    const P = {};
    ME_PARTS.forEach(([, d, w, key]) => { if (w) P[key] = ptsOf(d); });
    const len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const ang = (a, b) => Math.atan2(b.x - a.x, b.y - a.y);   // 真下から前へ
    const arm = (sleeve, skin) => {
      const up = ang(sleeve[0], skin[1]);
      return { up, flex: ang(skin[1], skin[2]) - up };
    };
    const [hF, kF, fF] = P.legF, [hB, kB, fB] = P.legB;
    const aF = arm(P.sleeveF, P.armF), aB = arm(P.sleeveB, P.armB);
    RIG = {
      P,
      front: [len(hF, kF), len(kF, fF)], back: [len(hB, kB), len(kB, fB)],
      hipX: (hF.x + hB.x) / 2, hipW: (hF.x - hB.x) / 2, hipY: hF.y,
      footF: fF.x, footB: fB.x, ground: fF.y,
      swing: aF.up - aB.up, flex: aF.flex - aB.flex,
    };
    return RIG;
  }
  /* 足の通り道。q は一周の中の位置（0＝前に着いたところ）。 */
  function footAt(q) {
    const R = rig();
    q -= Math.floor(q);
    const per = (R.footB - R.footF) / 0.5;      // 半周で、前から後ろへ送られる
    if (q < WALK.stance) return { x: R.footF + per * q, y: R.ground };
    const toe = R.footF + per * WALK.stance;
    const u = (q - WALK.stance) / (1 - WALK.stance);
    return { x: toe + (R.footF - toe) * (1 - Math.cos(Math.PI * u)) / 2,
             y: R.ground - WALK.lift * Math.sin(Math.PI * u) };
  }
  /* 二本の骨（腿 a・すね b）で、腰から足へ。膝は前へ曲げる。 */
  function ik(hip, foot, a, b) {
    let dx = foot.x - hip.x, dy = foot.y - hip.y, d = Math.hypot(dx, dy);
    const max = a + b - 0.01;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; }
    const ux = dx / d, uy = dy / d;
    const c = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
    const s = Math.sqrt(1 - c * c);
    return [hip, { x: hip.x + a * (ux * c + uy * s), y: hip.y + a * (-ux * s + uy * c) },
            { x: hip.x + dx, y: hip.y + dy }];
  }
  /* 経った割合 τ（0〜1）での形。ph は一周の位置（手前の脚が 0 で前に着く）。頭と尻は
     REST_PH：**奥の脚が前に着き、手前の脚が後ろ**のところ。この形は元の絵とぴったり
     同じ位置（前の脚・後ろの脚の腰と膝と足）で、前に出ているのが奥の脚になるだけ。 */
  const REST_PH = 0.5;
  function walkPose(tau) {
    const R = rig(), ph = REST_PH + walkPhase(tau);
    const bob = -WALK.bob * (1 - Math.cos(4 * Math.PI * ph)) / 2;
    const leg = (q) => {
      const c = Math.cos(2 * Math.PI * q), w = (1 - c) / 2;   // 0＝前に出た形、1＝後ろ
      return ik({ x: R.hipX + R.hipW * c, y: R.hipY + bob }, footAt(q),
        R.front[0] + (R.back[0] - R.front[0]) * w, R.front[1] + (R.back[1] - R.front[1]) * w);
    };
    /* 腕の振り。0 が元の絵の腕、1 が左右を入れ替えた腕。
       **腕はいつも脚と同じ拍・同じ大きさで、逆に振る**（脚とのずれ lag は一定）。
       歩き出しも止まりぎわも、半ばと同じ動きが速さの台形で速く・遅くなるだけ。
       足がいちばん後ろへ来るのは半周ではなく stance のところなので、ずれはちょうど π
       ではなく、そのぶん詰める。 */
    const lag = Math.PI * (2 - 2 * WALK.stance);
    const k = (1 - Math.cos(2 * Math.PI * ph + lag)) / 2;
    const arm = (sleeve, skin, sign) => {
      const up = sign * k * R.swing, fl = sign * k * R.flex;
      const f = (p) => { const q = rot(p, sleeve[0], up); return { x: q.x, y: q.y + bob }; };
      return { sleeve: sleeve.map(f), skin: [f(skin[0]), f(skin[1]), f(rot(skin[2], skin[1], fl))] };
    };
    const aB = arm(R.P.sleeveB, R.P.armB, 1), aF = arm(R.P.sleeveF, R.P.armF, -1);
    return { bob, legF: leg(ph), legB: leg(ph + 0.5),
             armB: aB.skin, sleeveB: aB.sleeve, armF: aF.skin, sleeveF: aF.sleeve };
  }
  /* 経った割合 τ（0〜1）→ 一周の位置。速さの台形を積んだもの。 */
  function walkPhase(tau) {
    const a = WALK.rampIn, b = WALK.rampOut, area = 1 - a / 2 - b / 2;
    const t = Math.max(0, Math.min(1, tau));
    const x = t < a ? t * t / (2 * a)
      : t <= 1 - b ? a / 2 + (t - a)
      : area - (1 - t) * (1 - t) / (2 * b);
    return (WALK.steps / 2) * x / area;
  }
  const dOf = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${n1(p.x)} ${n1(p.y)}`).join("");

  /* 止まった形（2026年9月29日・利用者が選んだ）。元の絵は「手前の脚が前・手前の腕も前」
     で、歩きには出てこない形（歩けば手前の脚が前のとき手前の腕は後ろ）——そこで
     止めようとすると、どこかで腕だけ別の動きが要った（五度作り直した。docs/todo-
     timeline.md の「歩く」）。**前に出ている脚を奥の脚として描けば**、元の絵と同じ
     位置のまま「奥の脚が前・手前の腕が前」という歩きの一瞬になる（REST_PH）。
     脚は元の絵の字とぴったり同じ（前の脚と後ろの脚の字が入れ替わるだけ）、腕は元の
     絵から手の位置で 0.3px ほど、浮きは 0。歩き終わりの形（τ = 1）も同じ字になる。
     見た目で変わるのは、前の脚が一段濃く（奥の脚の色）、後ろの脚が薄くなること。 */
  const REST = (() => {
    const q = walkPose(0), out = {};
    ME_PARTS.forEach(([, d, , key]) => { out[key] = d; });
    ["legB", "legF", "armB", "sleeveB", "armF", "sleeveF"].forEach((key) => { out[key] = dOf(q[key]); });
    out.lift = n1(q.bob) ? `translate(0 ${n1(q.bob)})` : null;
    return out;
  })();
  const ME_HALO = meSvg(true), ME_INK = meSvg(false);

  /* 人の置き場所（paint が me.__at に覚える）→ transform。 */
  const meAt = (a) => `translate(${a.x.toFixed(2)} ${a.y.toFixed(2)}) scale(${a.sx} ${ME_K})`;
  /** 道の長さ d に立つ人の置き場所。h は足もとの道（停留所ならそのふち）の太さ。
      まっすぐでは道の上のふちに立ち、角では立ったまま（傾けない）、道が縦になる
      ほど足もとを道の中心へ寄せる。顔は進む向きの左右（角のまん中で向きが返る）。 */
  function standAt(g, d, h) {
    const p = g.point(d);
    return { x: p.x, y: p.y - h / 2 * Math.abs(p.ny), sx: p.tx >= 0 ? ME_K : -ME_K, row: p.row, d, h };
  }

  /** その根の中の、今日の道の人を歩かせる。歩いている途中なら、そのまま。
      from（前の置き場所）があれば、歩くあいだにそこから今の足もとへ進む
      （分が変わったとき。paint）。進み方は脚と同じ速さの台形。 */
  function walk(root, from) {
    if (!root || KN.motion.still()) return;
    const me = root.querySelector(".day-road .road-me");
    if (!me || me.style.display === "none") return;
    if (me.__walk) return;
    const step = KN.motion.ms("--m-walk");
    if (!(step > 0)) return;
    const glide = from && me.__at ? from : null;
    const els = {};
    me.querySelectorAll("[data-w]").forEach((el) => {
      (els[el.dataset.w] = els[el.dataset.w] || []).push(el);
    });
    const set = (key, attr, v) => (els[key] || []).forEach((el) => {
      if (v == null) el.removeAttribute(attr);
      else el.setAttribute(attr, v);
    });
    /* 上がりきったときに、一歩がちょうど step。 */
    const dur = WALK.steps * step / (1 - WALK.rampIn / 2 - WALK.rampOut / 2);
    const t0 = performance.now();
    me.__walk = true;
    const rest = () => {
      me.__walk = false;
      ME_PARTS.forEach(([, , , key]) => set(key, "d", REST[key]));
      set("body", "transform", REST.lift);
      set("head", "transform", REST.lift);
      if (me.__at) me.setAttribute("transform", meAt(me.__at));
    };
    const tick = (now) => {
      const tau = (now - t0) / dur;
      if (tau >= 1 || !me.isConnected) { rest(); return; }
      if (glide) {
        /* 道の長さで進める（角の上でも道に沿って）。 */
        const k = walkPhase(tau) / (WALK.steps / 2), to = me.__at;
        me.setAttribute("transform", meAt(me.__stand && glide.d != null && to.d != null
          ? me.__stand(glide.d + (to.d - glide.d) * k, glide.h + (to.h - glide.h) * k)
          : { x: glide.x + (to.x - glide.x) * k, y: glide.y + (to.y - glide.y) * k, sx: to.sx }));
      }
      const q = walkPose(tau);
      ["legB", "legF", "armB", "sleeveB", "armF", "sleeveF"].forEach((key) => set(key, "d", dOf(q[key])));
      const lift = `translate(0 ${n1(q.bob)})`;
      set("body", "transform", lift);
      set("head", "transform", lift);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------------- 組み立て ---------------- */

  /**
   * @param {object} o
   *   plan   … KN.plan.buildDay の返り（その日の、済んだものも含めて）
   *   today  … 今日を見ているか（人が立つのは今日だけ）
   *   open   … (todoId, 押した要素) 詳細の紙を開く
   *   markOf … (todo) 連れの丸に入れる絵（マスクの url()）。無ければ ""
   *   decide … (todoId, "HH:MM") 空いた道の上で決めた時刻を付ける（段2）
   *   unplan … (todoId) 連れを道の外で離した。日と時刻を外して長期タスクへ（段8）
   *   tomorrow … { at: 分, title } 明日の最初の停留所（段6。今日だけ。無ければ null）
   *   someday … 長期タスク（期限の近い順。段8の段B：道の外周のくぼみに浮かべる）
   */
  /* 道の端（2026年9月29日・利用者の声「5:30 スタートなのに最初に 6:30」）。
     設定の一日（dayStart〜dayEnd）を、**はみ出す停留所まで伸ばし**、始まりは
     **ちょうどの時へ切り下げ**ます。
     - 前は設定の端で切っていたので、起きる時刻を 6:30 にした人の 5:30 の用事が
       道の頭（6:30）に点で押しつぶされ、「5:30」の札が 6:30 の場所に立っていた。
     - 始まりが「〜:30」だと、角は「〜:30」・目盛りは「〜:00」で物差しが二つに
       なっていた。一段は1時間単位なので、始まりをちょうどの時にすれば角も
       ちょうどの時になる。
     終わりは切り上げません（手描きの道も「22:30」で止まっていた）。
     **切り下げるのは段の割りだけ**（9月30日から。geom の頭）：道そのものは 5:30 から
     描き、角と目盛りは「ちょうどの時」のまま。角も時間を持つようになってから（10月2日）は、
     角のまん中がちょうどの時になるように geom が段の割りを選ぶ。
     描くだけで、設定も記録も書き換えません。 */
  /* 起きた時刻が分かる日は、道の始まりを設定の「起きる時刻」ではなく**起きた時刻**に
     （2026年10月2日・利用者の声「寝ていた時刻まで道を短くして、起きた時刻のところに
     その時刻と寝る人を」）。寝床と端の時刻は道の始まりに付いてくるので、そのまま起きた
     時刻に立つ。記録は daily の起床（ヘルスケアの写しも）から引くだけで、設定も記録も
     書き換えない。終わりの1時間より後の値（昼寝の記録など）は使わない。
     **起きた時刻より前に決めた用事があっても、道は起きた時刻から**（10月2日・利用者の声
     「起床より早く始めたタスクも、結局起きて以降しかでき始めていない」）。その用事は
     起きた時刻に始まったものとして、長さはそのままで後ろへずらして描く（shiftOf）。 */
  function reach(plan, wake) {
    const w = Number.isFinite(wake) && wake >= 0 && wake < plan.endMin - 60 ? wake : null;
    let a = w != null ? w : plan.startMin, b = plan.endMin;
    plan.items.forEach((it) => {
      if (!it.fixed) return;
      if (w == null) a = Math.min(a, it.atMin);
      const sh = w != null ? Math.max(0, w - it.atMin) : 0;
      b = Math.max(b, (Number(it.todo.minutes) > 0 ? it.untilMin : it.atMin) + sh);
    });
    return [Math.max(0, a), Math.min(24 * 60, b)];
  }

  /* 時刻を過ぎても済んでいない区間は、**人の足もとまで引っぱる**（2026年9月30日・
     利用者の声「朝のルーティンは7時までなのに過ぎている。でも表示は何も変わらない」）。
     終わりを「いま」に延ばし、色を一時的に変えます（`.is-late`）。済ませたら、押した
     時刻でそこに止まり、色は戻ります（済ませた時刻が決めた終わりより後なら、その
     時刻まで）。記録は書き換えません——描くときに `doneAt` からそのつど引くだけ。
     延びた終わりは `eu`。札もこれで見ます。返りは形の見分け字
     （変わったときだけ道筋を引き直す）。

     **道は一本**（2026年10月3日・利用者の声「時間を超過した方が超過したところまで
     伸びて、次の予定がそこから始まった方がいい」）。前は時刻の重なった停留所を道を
     横に割った車線（laneOut）に描いていたが、内側へずれた丸薬が道から浮いて見えた。
     いまは早い順に並べ、前の用事の（延びた）終わりより前に始まる用事は、そこから
     始まったものとして描く。**終わりは動かさず、始まりだけ遅らせて縮める**（就寝を
     越えない）。押されて始まりが決めた終わりを越えても、最低1分ぶんは残す。
     描く始まりは `ga`（分）と `d0`。**札は予定のまま**（`clock(s.at)`）——道は実際の
     流れ、札は予定。記録も `at`/`until` も書き換えない（描くたびに引き直すだけ）。
     車線はもう割らないので `off` は 0・`lanes` は 1（下の描き手はそのまま読む）。 */
  function shape(st, nowMin) {
    const g = st.g;
    let cursor = -Infinity, cl = -1;
    const cls = {};
    st.stops.slice().sort((p, q) => p.at - q.at || p.until - q.until).forEach((s) => {
      if (s.p0 == null) s.p0 = s.d0;   // 予定どおりの始まり（build が置いた位置）
      s.off = 0; s.lanes = 1; s.cl = null;
      s.late = !!(s.len && nowMin != null && !closed(s.t) && nowMin > s.until);
      /* 前の用事のあいだに済ませたもの（押した時刻が前の終わりより前）は、押さずに
         本当の時刻に置く——後ろへ回すと、済ませた時刻と違うところに立つので。 */
      const inside = !st.past && s.doneMin != null && s.doneMin <= cursor;
      s.ga = s.len && !inside ? Math.max(s.at, cursor) : s.at;
      /* 過ぎた日は、押した時刻まで延ばさない（決めた区間のまま。押した時刻は
         paint が小さな白い粒で置く）。2026年9月29日。 */
      /* 今日、決めた終わりより前に済ませたら、押した時刻で**縮める**（2026年9月30日・
         利用者の声「12:00-12:30 のタスクを 12:02 で終えたのに、丸薬はそのままの長さ」）。
         始まりより前に済ませても、最低1分ぶん（丸い端どうしで、ほぼ丸）は残す。 */
      /* 済ませた時刻まで延ばすのは、**次の停留所の始まりまで**（2026年10月1日・利用者の声
         「朝のルーティンと朝のBabyのたった2つが重なったくらいで、道がおかしくないか」）。
         押すのが遅れただけのことが多いので、決めた予定どうしが重なっていないのに、
         延びで次を押さない。まだのもの（is-late）も人の足もとまでだが、同じく**次の
         停留所の始まりで止める**（2026年10月3日。止めないと、押し忘れた朝の用事が
         いままで延び、そのあとの一日がぜんぶ「いま」の後ろへ押し出された）。 */
      const next = st.stops.reduce((m, q) => (q !== s && q.at >= s.until ? Math.min(m, q.at) : m), Infinity);
      const end = s.late ? Math.max(s.until, Math.min(nowMin, g.end, next))
        : !st.past && s.len && s.doneMin != null
          ? Math.min(s.doneMin, Math.max(s.until, next)) : s.until;
      s.eu = s.len ? Math.max(s.ga + 1, end) : s.until;
      s.d0 = s.len ? g.dist(s.ga) : s.p0;
      s.d1 = s.len ? Math.max(s.d0, g.dist(s.eu)) : s.d0;
      /* 押し合った用事どうしは一つの群（cl）。札が入りきらないとき、群の札に「ほか n」を
         添える（黙って消さない）。 */
      if (s.len) {
        if (s.at >= cursor) cl++;
        s.cl = cl;
        cls[cl] = (cls[cl] || 0) + 1;
        cursor = Math.max(cursor, s.eu);
      }
    });
    st.stops.forEach((s) => { if (s.cl != null && cls[s.cl] < 2) s.cl = null; });
    return st.stops.map((s) => `${n1(s.d0)}/${n1(s.d1)}/${s.late ? 1 : 0}`).join(",");
  }

  /* 済ませた時刻（分）。その日のうちに押したものだけ。 */
  function doneMinOf(t, day) {
    if (!closed(t) || !t.doneAt) return null;
    const d = new Date(t.doneAt);
    if (isNaN(d.getTime()) || U.dayKey(d) !== day) return null;
    return d.getHours() * 60 + d.getMinutes();
  }

  function build(o) {
    const plan = o.plan;
    const g = geom(...reach(plan, o.wake));
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
        /* 起きた時刻より前の用事は、起きた時刻に始まったものとして（reach の注）。 */
        const sh = Math.max(0, g.begin - it.atMin);
        if (sh) it = { ...it, atMin: it.atMin + sh, untilMin: it.untilMin + sh };
        const d0 = g.dist(it.atMin);
        /* 出る時刻（段7）。「前に30分」なら、停留所の手前30分に点線の区間。
           済ませたものには描きません（もう出ることはないので）。 */
        const lead = !closed(t) && Number(t.lead) > 0 ? Number(t.lead) : 0;
        const doneMin = doneMinOf(t, plan.day);
        /* 今日、始まりより前に済ませたものは、**済ませた時刻**に置く（2026年10月1日・
           利用者の声「夜のルーティンは 19:39 にすでに終わってるのに、道ではまだきていない
           20時に終わってることになってる」）。前は決めた始まりに1分ぶんの丸で残り、
           人より先の道に「済んだ」停留所が立っていた。札の時刻も済ませた時刻（道の物差しと
           同じ）。記録は書き換えない。過ぎた日は決めた形のまま（押した時刻は白い粒）。 */
        if (today && doneMin != null && doneMin < it.atMin) {
          const d = g.dist(doneMin);
          stops.push({ t, at: doneMin, until: doneMin + (len ? 1 : 0), len, d0: d, lead: 0, dl: d, doneMin });
          return;
        }
        stops.push({ t, at: it.atMin, until: it.untilMin, len, d0, lead,
                     dl: lead ? g.dist(Math.max(g.begin, it.atMin - lead)) : d0,
                     doneMin });
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
                     d1: Math.max(d0 + 12, Number(t.minutes) > 0 ? g.dist(it.untilMin) : d0) });
        return;
      }
      loose.push({ t });
    });
    /* 停留所の道筋・車線・延び（is-late）は paint が引きます（いまに合わせて
       延びるので）。 */
    const beds = bedsOf(g);
    const stopSvg = stops.map((s, k) =>
      `<g class="road-stop${closed(s.t) ? " is-done" : ""}" data-s="${k}">`
        + `<path class="road-stop-edge"/><path class="road-stop-in"/>`
        + `<path class="road-stop-went"/></g>`).join("");
    /* 出る時刻からの区間は、道の下に敷く点線の帯（道の上下に点がのぞく）。
       停留所のふちの点線（夜のごろ）と同じ言い分で、決めた約束そのものでは
       ない「そこへ向かう時間」だと読めるように。 */
    const leadSvg = stops.filter((s) => s.lead && s.d0 - s.dl > 0.5)
      .map((s) => `<path class="road-lead" d="${g.path(s.dl, s.d0)}"/>`).join("");
    const laterSvg = later.map((s) => {
      const d = g.path(s.d0, s.d1);
      return `<g class="road-stop is-later"><path class="road-stop-edge" d="${d}"/>`
        + `<path class="road-stop-in" d="${d}"/></g>`;
    }).join("");
    const stepSvg = steps.map((s) => {
      const p = g.point(s.d);
      return `<circle class="road-step" cx="${n1(p.x)}" cy="${n1(p.y)}" r="2.8"/>`;
    }).join("");
    /* 押せるのは、見えている区間より太い透明な線。停留所の丸は 16 単位で、
       指には細いので。 */
    const hitSvg = stops.map((s, k) => `<path class="road-hit" data-k="${k}" data-grow/>`).join("")
      + later.map((s, k) =>
        `<path class="road-hit" data-l="${k}" data-grow d="${g.path(s.d0, s.d1)}"/>`).join("");

    const svg = `<svg class="road-svg" viewBox="0 0 ${W} ${g.H}" aria-hidden="true" focusable="false">`
      + leadSvg
      + `<path class="road-base" d="${g.path(g.d0, g.total)}"/>`
      + `<path class="road-went"/>`
      + stopSvg + laterSvg
      /* 停留所の上の目盛り（paint が引く）。道の目盛りは停留所の太い線の下に
         隠れて、一日の半分ほどで物差しが消えていた。塗った上は白、まだの白い中は
         塗りの色で。 */
      + `<g class="road-hours is-over"></g><g class="road-hours is-ink"></g>`
      + `<g class="road-steps">${stepSvg}</g><g class="road-steps is-stops"></g>`
      /* 道の上の時の数字は、足あとの白丸よりも上に（2026年10月2日）。停留所の上のぶんは
         is-under で隠し、上の層（is-over / is-ink / is-rim）が同じ位置に置き直す。 */
      + `<g class="road-hours" font-size="${n1(hourFs())}">${g.hourSvg(g.tickTimes(), 0, hourFs())}</g>`
      + `<g class="road-hours is-rim"></g>`
      + beds.map((b, k) => bedSvg(k, b)).join("")
      + `<g class="road-me" style="display:none"><g class="road-me-halo">${ME_HALO}</g>`
      + `<g class="road-me-ink">${ME_INK}</g></g>`
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
    /* 長期タスク（段8の段B）。過ぎた日には出さない（置ける道が無い）。 */
    const someday = past ? [] : (o.someday || []).filter((t) => !closed(t) && !t.trace).map((t) => ({ t }));
    el.__road = { g, today, past, stops, steps, loose, later, someday, beds,
                  tomorrow: today && o.tomorrow ? o.tomorrow : null,
                  markOf: o.markOf, last: undefined, drawn: false };

    /* 押したものを一か所で受けます（札・透明な線・連れ・くぼみ・空いた道）。 */
    el.addEventListener("click", (e) => {
      if (e.target.classList && e.target.classList.contains("road-free")) {
        decideAt(el, o, e);
        return;
      }
      const hit = e.target.closest("[data-k], [data-l], [data-b], [data-h], .road-more");
      if (!hit || !el.contains(hit)) return;
      if (hit.classList.contains("road-more")) {
        /* 連れが多すぎて丸に入りきらないときの「+3」。全部は時間割にあるので、
           そこへ送ります。くぼみの「+n」は、長期タスクの欄へ。 */
        const list = hit.hasAttribute("data-more")
          ? (el.closest(".day-slide") || document).querySelector(".tl-someday-sec")
          : el.parentNode && el.parentNode.querySelector(".tl-list");
        if (list) list.scrollIntoView({ block: "start", behavior: KN.motion.still() ? "auto" : "smooth" });
        return;
      }
      const pick = hit.hasAttribute("data-k") ? stops[Number(hit.getAttribute("data-k"))]
        : hit.hasAttribute("data-l") ? later[Number(hit.getAttribute("data-l"))]
        : hit.hasAttribute("data-h") ? someday[Number(hit.getAttribute("data-h"))]
        : loose[Number(hit.getAttribute("data-b"))];
      if (pick && o.open) o.open(pick.t.id, hit);
    });
    wireCarry(el, o);

    paint(el);
    return el;
  }

  /* ---------------- 描く（「いま」が動いたら、ここだけ） ----------------

     組み直しはしません。30秒ごと（screen-todo の見回り）と、アプリへ戻って
     きたときに呼ばれ、**分が変わっていたときだけ**、歩いたぶん・停留所の塗り・
     人・札・次の一行を置き直します。 */
  /* 停留所の丸い端は、線の端から太さの半分（STOP / 2）外へ出ます。そのまま
     描くと 6:00 に始まる区間の頭が 6:00 より手前に見えた（2026年9月30日・
     利用者の声「始点と終点がちょっとずれて見える」）。道筋を両端で半分ずつ内へ
     詰めて、**丸い端の外側がちょうど始まりと終わり**に来るように。太さより短い
     区間は、まん中の丸（太さぶん）になる。押す的は詰めない（指の当たり）。 */
  const WENT_R = 6;             // 塗りの半分の太さ（CSS の .road-stop-went 12）
  /* まだのまま延びた区間（is-late）の尻は詰めない（2026年10月2日・利用者の声「超過した
     丸薬が人の足もとまで追いついていない。ベースの道がはみ出して見える」）。尻を詰めると
     丸い端の外がちょうど足もとで、ふちの側は手前で丸く引っこみ、歩いたぶんの道の丸い端
     （半径 4.5）がその先へのぞいていた。尻の丸のまん中を足もとに置けば、丸い端（半径 8）が
     足もとをくるみ、歩いたぶんの道の端を隠す。 */
  function capIn(s) {
    if (!s.len) return [s.d0, s.d1];
    const k = STOP / 2, k1 = s.late ? 0 : k;
    if (s.d1 - s.d0 <= k + k1) { const m = s.late ? s.d1 : (s.d0 + s.d1) / 2; return [Math.max(s.d0, m - k), m]; }
    return [s.d0 + k, s.d1 - k1];
  }

  function paint(el) {
    const st = el && el.__road;
    if (!st) return;
    const nowMin = st.today ? KN.plan.toMin(U.nowTime()) : null;
    if (st.drawn && st.last === nowMin) return;
    const moved = st.drawn && st.last != null && nowMin != null;
    st.last = nowMin;
    st.drawn = true;
    const g = st.g;
    const dNow = nowMin == null ? null : g.dist(nowMin);
    const svg = el.querySelector(".road-svg");
    /* 道を外れた時間（起きる前・寝たあと）は、人は道に立たず寝床にいる。
       0 なら朝の寝床、1 なら夜の寝床、道の上なら null。 */
    st.sleep = nowMin == null ? null : nowMin < g.begin ? 0 : nowMin > g.end ? 1 : null;
    svg.querySelectorAll(".road-bed").forEach((b, k) => b.classList.toggle("is-snore", st.sleep === k));

    /* ⓪ 停留所の道筋（一本道。shape）。延びる区間（過ぎてまだのもの）があると、分ごとに
       形が変わります。変わったときだけ引き直す。 */
    const sig = shape(st, nowMin);
    if (sig !== st.sig) {
      st.sig = sig;
      const grpEls = svg.querySelectorAll(".road-stop[data-s]");
      st.stops.forEach((s, k) => {
        const [a, b] = capIn(s);
        const d = g.path(a, b, s.off);
        if (grpEls[k]) {
          grpEls[k].classList.toggle("is-late", s.late);
          grpEls[k].querySelectorAll(".road-stop-edge, .road-stop-in").forEach((x) => x.setAttribute("d", d));
        }
        const hit = svg.querySelector(`.road-hit[data-k="${k}"]`);
        if (hit) hit.setAttribute("d", g.path(s.d0, s.d1, s.off));
      });
      /* 過ぎた日の、時刻を決めたものを押した時刻（2026年9月29日）。区間は決めた
         まま描くので、押した時刻は足あとと同じ白い粒で。区間の中なら、その車線に。 */
      const dots = svg.querySelector(".road-steps.is-stops");
      if (dots) dots.innerHTML = !st.past ? "" : st.stops.filter((s) => s.doneMin != null).map((s) => {
        const inside = s.doneMin >= s.at && s.doneMin <= s.eu;
        const p = g.point(g.dist(s.doneMin), inside ? s.off : 0);
        return `<circle class="road-step is-stop" cx="${n1(p.x)}" cy="${n1(p.y)}" r="2.8"/>`;
      }).join("");
    }

    // ① 歩いたぶんの道
    const went = svg.querySelector(".road-went");
    /* 過ぎた日は道を「これから」の薄い色のまま、停留所だけ塗る（2026年9月29日）。
       道ぜんぶを塗ると、どこに何があったかが塗りに沈んでいた。 */
    const wentTo = st.past ? null : dNow;
    if (wentTo > g.d0) went.setAttribute("d", g.path(g.d0, wentTo));
    else went.removeAttribute("d");
    /* 道の上の時の数字：歩いたぶんの上は白、これからの薄い道の上は塗りの色。 */
    /* 停留所の上にある時の数字は、下の道のぶんを隠す（上の層が置き直す）。 */
    svg.querySelectorAll(".road-hours:not(.is-over):not(.is-ink):not(.is-rim) text").forEach((x) => {
      const t = Number(x.getAttribute("data-t"));
      x.classList.toggle("is-went", wentTo != null && g.dist(t) <= wentTo + 1e-6);
      x.classList.toggle("is-under", st.stops.some((s) => s.len && t >= s.ga && t <= s.eu));
      /* 足あとの白丸に重なる数字も縁取る（白丸の上で白い字が消えていた）。 */
      const p = g.point(g.dist(t), 0);
      x.classList.toggle("is-rimmed", [...svg.querySelectorAll(".road-step")].some((c) =>
        Math.hypot(Number(c.getAttribute("cx")) - p.x, Number(c.getAttribute("cy")) - p.y) < 7));
    });

    /* 押して決められる道（段2）。**これからの道だけ**——歩いたぶんに時刻を
       付けても、過ぎた約束になるだけなので。過ぎた日には無し。 */
    const free = svg.querySelector(".road-free");
    const from = st.past ? null : dNow == null ? g.d0 : dNow;
    if (from != null && from < g.total) free.setAttribute("d", g.path(from, g.total));
    else free.removeAttribute("d");

    /* ② 停留所の塗り。時間割の丸薬と同じ決めごと：時計が通ったところまで
       塗る。済ませたものは時計に関わらず塗りきる（手が先に進むことはある）。 */
    const stopEls = svg.querySelectorAll(".road-stop[data-s]");
    const over = [], ink = [], rim = [], rimT = new Set();
    st.stops.forEach((s, k) => {
      const grp = stopEls[k];
      if (!grp) return;
      const w = grp.querySelector(".road-stop-went");
      const done = closed(s.t);
      let to = null;
      if (done || st.past) to = s.d1;
      else if (nowMin != null && nowMin >= s.ga) to = s.len ? Math.min(dNow, s.d1) : s.d1;
      /* 塗りの丸い端（半径 WENT_R）も、塗った時刻で止まるように内へ。 */
      const [a, b] = capIn(s);
      if (to != null && s.late) to = s.d1 + WENT_R;   // 延びた尻は足もとをくるむ丸まで塗る（capIn）
      if (to == null) w.removeAttribute("d");
      else w.setAttribute("d", g.path(a, Math.max(a, Math.min(b, to - WENT_R)), s.off));
      const live = !done && s.len && nowMin != null && nowMin >= s.ga && nowMin < s.until;
      grp.classList.toggle("is-live", live);
      /* 時計が通った・済ませた停留所は薄く（いまの丸だけ濃く。2026年10月3日・CSS の --road-past）。
         過ぎた日は塗ったまま（道が薄いので、停留所の形で読む）。 */
      grp.classList.toggle("is-past", to != null && !live && !st.past);
      /* 停留所の上の時の数字。塗ったところは白、まだの白い中は塗りの色。
         **位置は道の上の数字と同じところから動かさない**（2026年10月2日・利用者の声「線上の
         時刻の数値は絶対に動かさないで。そこしか時刻を表すところがない」）。
         端ちょうど（ふち・丸い端・道にまたがる）と、車線に割った停留所の上は、縁取りして
         いちばん上に（rim）。車線のものは道のまん中に一つだけ（車線の数だけ並べない）。 */
      if (!s.len) return;
      const fs = hourFs();
      g.tickTimes().filter((t) => t >= s.ga && t <= s.eu).forEach((t) => {
        if (s.off || t === s.ga || t === s.eu) { if (!rimT.has(t)) { rimT.add(t); rim.push(g.hourSvg([t], 0, fs)); } return; }
        (to != null && g.dist(t) <= to + 1e-6 ? over : ink).push(g.hourSvg([t], 0, fs));
      });
    });
    const put = (el, parts) => { const h = parts.join(""); if (el.__h !== h) { el.__h = h; el.innerHTML = h; } };
    put(svg.querySelector(".road-hours.is-over"), over);
    put(svg.querySelector(".road-hours.is-ink"), ink);
    put(svg.querySelector(".road-hours.is-rim"), rim);

    /* ③ 人。道の上に立ちます。停留所の中に居るときは、停留所のふちの上に
       （道の太さのところに立たせると、足がふちの中へ埋まる）。 */
    const me = svg.querySelector(".road-me");
    if (dNow == null || st.sleep != null) { me.style.display = "none"; me.__at = null; }
    else {
      /* 延びた区間（is-late）は足もとで終わるので、そのふちの上に。 */
      const onStop = st.stops.some((s) => s.len && nowMin >= s.ga && (nowMin < s.until || s.late));
      const was = me.__at;
      me.__stand = (d, h) => standAt(g, d, h);
      const to = me.__stand(dNow, onStop ? STOP : ROAD);
      me.__at = to;
      me.style.display = "";
      if (!me.__walk) me.setAttribute("transform", meAt(to));
      /* 分が変わったら、歩いて次の足もとへ（2026年9月30日・利用者の声「時刻が
         1分進むなど変わると、人が動くように」）。一分は道の上で 1〜3 単位しか
         ないので、動いたと分かるのは歩く形のほう。角も時間を持つので（10月2日）、
         道に沿って角を回る（まっすぐ横切らない）。一段より遠ければ、その場で歩くだけ。 */
      if (moved) walk(el, was && Math.abs(was.d - to.d) <= SEG ? was : null);
    }

    // ④ 札・連れ・いまの時刻
    el.querySelector(".road-marks").innerHTML = String(marks(st, nowMin, dNow));
    /* 運んでいる最中に描き直したら、持ち上げた丸は薄いまま（段8）。 */
    if (carry && carry.el === el) {
      const b = el.querySelector(carry.sel);
      if (b) b.classList.add("is-lifted");
    }

    // ⑤ 次の一行
    const next = el.querySelector(".road-next");
    if (next) next.innerHTML = String(caption(st, nowMin));
  }

  /* ---------------- 札を置く ----------------

     札は段の上か下の「通り」に、一行で置きます。置く順が、そのまま譲る順です：
       1. 人の頭（上の通り）と、いまの時刻（下の通り）
       2. 停留所の「時刻 題」。始まりの点から、進む向きへ伸ばす。ぶつかるなら
          縮めて、それでも入らなければ下の通り、逆向き、時刻だけ……と試す
       3. 夜のごろ
     入らないものは出しません。区間そのものは道に残り、押せば開きます。
     **区間の終わりの時刻は出しません**（2026年9月30日・利用者の声「時刻が
     書かれ過ぎていて読みにくい」）。前は45分以上の区間の尻に「12:00」「15:30」
     と小さく置いていて、角の時刻・札の時刻と合わせて一日に15ほど時刻が並んで
     いました。長さは道の形が言い、いまの区間の終わりは次の一行
     （「いまは 病院（14:30まで）」）が言い、細かくは押せば紙が言います。 */
  function marks(st, nowMin, dNow) {
    const g = st.g;
    const FS = 11 * fsK();
    /* 通りは段ごとに上（u）と下（d）。**曲がり角の側は、角の手前まで**
       ——上の段から降りてくる角・下の段へ降りる角が、通りの端を横切るので
       （特大の字で、札の尻が角の道に触れた）。 */
    const bump = {};   // 外へはみ出す車線は無いので、通りをずらすぶんは無し（shape の「道は一本」）
    const lanes = {};
    const lane = (row, side) => {
      const key = row + side;
      if (lanes[key]) return lanes[key];
      const occ = [];
      const ltr = row % 2 === 0;
      occ.lo = 2; occ.hi = W - 2;
      occ.dy = bump[key] || 0;
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
      /* 小数の誤差を許す。ちょうどの幅（want = min）で 229 − 40.1 を引くと
         40.0999… になり、空いた通りでも「入らない」と言って札が消えていました
         （六段にして座標が変わったとき、9:00 の札で出た）。 */
      return hi - lo >= min - 1e-6 ? [lo, hi] : null;
    }
    /** 真ん中に置けるか（縮めない）。 */
    function fitMid(occ, x, w) {
      const lo = Math.max(occ.lo, Math.min(occ.hi - w, x - w / 2));
      return occ.every(([a, b]) => lo + w + GAP <= a || lo >= b + GAP) ? [lo, lo + w] : null;
    }

    /* 通りの外に置いたもの（道の端の時刻・人・人の頭の上の時刻）の箱
       [左, 右, 上, 下]。くぼみの丸（段8の段B）がよける。 */
    const keep = [];
    const EFS = 10 * fsK();

    /* 始まりと終わりの時刻は、両端の寝床の下に（寝床が道の端のすぐ外に居るので）。
       寝床と z Z のぶんは、上と下の通りを空けさせる。 */
    const sleep = dNow == null ? null : st.sleep;
    st.beds.forEach((b, k) => {
      const s = clock(k === 0 ? g.begin : g.end);
      const w = textW(s, EFS) + 2;
      const ey = b.y + ROAD / 2 + 2 + EFS * 0.6;
      out.push(html`<span class="road-edge is-under" style="${at(b.cx, ey)}">${s}</span>`);
      const lo = Math.min(b.lo, b.cx - w / 2), hi = Math.max(b.hi, b.cx + w / 2);
      lane(b.row, "u").push([b.lo - 2, b.hi + 2]);
      lane(b.row, "d").push([lo - 2, hi + 2]);
      keep.push([b.lo - 2, b.hi + 2, b.y + ROAD / 2 - BED_TOP, b.y + ROAD / 2]);
      keep.push([b.cx - w / 2, b.cx + w / 2, ey - EFS * 0.7, ey + EFS * 0.7]);
    });
    /* 角の時刻の札（「16:00」）は 10月2日に外した。道の上の時の数字（hourSvg）が、角の
       まん中の「16」も言うので。 */

    /* 1. 人の頭・連れ・いまの時刻。
       **連れは道に乗せません。** 道の上は時刻そのものなので、人の後ろの道に
       並べると「7:20 にメール」と、過ぎた時刻に置いたように読めます（一度
       そう描いて外しました）。手描きのとおり、人の頭の高さで、後ろに並べます。
       後ろに入りきらない（段の頭に居る）ときは、まとめて前へ。 */
    if (dNow != null) {
      const p = g.point(dNow);
      /* 角の上に居るときは、近いほうの段の通り（角も時間を持つので、人は角を回る）。 */
      const pr = g.rowAt(p.y);
      const bed = sleep == null ? null : st.beds[sleep];
      if (!bed) {
        lane(pr, "u").push([p.x - ME_W, p.x + ME_W]);
        // 人の形（足もとが停留所のふちの上まで上がることもあるので、高いほうに合わせて）
        keep.push([p.x - ME_W - 2, p.x + ME_W + 2, p.y - STOP / 2 - ME_HEAD - 6, p.y]);
      }
      if (st.loose.length) {
        const many = st.loose.length > BEADS_MAX;
        const shown = many ? st.loose.slice(0, BEADS_MAX - 1) : st.loose;
        const count = shown.length + (many ? 1 : 0);
        const back = p.tx >= 0 ? -1 : 1;
        const far = p.x + back * (BEAD_BACK + (count - 1) * BEAD);
        /* 寝ているあいだは、連れは寝床と反対の側（道の側）に並ぶ。 */
        const dir = bed ? -bed.side : far - 9 >= 2 && far + 9 <= W - 2 ? back : -back;
        const xs = Array.from({ length: count }, (_, i) => p.x + dir * (BEAD_BACK + i * BEAD));
        const y = p.y - LANE - lane(pr, "u").dy;
        lane(pr, "u").push([Math.min(...xs) - 9, Math.max(...xs) + 9]);
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
      /* いまの時刻は**人の頭の上**（2026年9月30日・利用者の声「現在時刻は分かり
         にくいので、人の頭の上に」）。前は道の下の通りに置いていて、隣の札の時刻
         （「12:00」と「12:20」）と並んで読み分けられなかった。上の段の下の通りに
         食いこむときだけ、そこを空けさせる。 */
      const txt = clock(nowMin);
      const w = textW(txt, FS) + 2;
      const hx = Math.max(2 + w / 2, Math.min(W - 2 - w / 2, bed ? bed.cx : p.x));
      // 足もとは停留所のふちの上（STOP / 2）まで上がることがあるので、高いほうに合わせる。
      // 寝ているあいだは、寝床の z Z の上
      const hy = bed ? bed.y + ROAD / 2 - BED_TOP - 2 - FS * 0.6 : p.y - STOP / 2 - ME_HEAD - 4 - FS * 0.6;
      if (pr > 0) {
        const above = lane(pr - 1, "d");
        if (g.rowY(pr - 1) + LANE + above.dy + FS * 0.6 > hy - FS * 0.6 - 1) above.push([hx - w / 2, hx + w / 2]);
      }
      out.push(html`<span class="road-now" style="${at(hx, hy)}">${txt}</span>`);
      keep.push([hx - w / 2, hx + w / 2, hy - FS * 0.7, hy + FS * 0.7]);
    }

    /* 2. 停留所の「時刻 題」。試す順：上に全部 → 下に全部 → 上で縮めて →
       下で縮めて → 逆向き → 時刻だけ。縮めるより、下の通りへ移すほうが先
       （題が「朝のル…」になるより、一段下に全部読めるほうがいい）。 */
    function place(p, time, title, tries, extra = 0) {
      const tw = textW(time, FS) + 1;
      const full = tw + 4 + textW(title, FS) + 1 + extra;
      const min = tw + 4 + FS * 1.6 + extra;
      const dir = p.ltr ? 1 : -1;
      const anchor = p.x + (p.ltr ? -3 : 3);
      for (const [side, d, mode] of tries) {
        const occ = lane(p.row, side);
        const only = mode === "time";
        const box = fit(occ, anchor, d * dir, only ? tw : full,
          only ? tw : mode === "full" ? full : min);
        if (!box) continue;
        occ.push(box);
        return { lo: box[0], hi: box[1], y: p.y + (side === "u" ? -1 : 1) * (LANE + occ.dy),
                 rev: d * dir < 0, only };
      }
      return null;
    }
    const TRIES = [["u", 1, "full"], ["d", 1, "full"], ["u", 1], ["d", 1],
                   ["u", -1], ["d", -1], ["u", 1, "time"], ["d", 1, "time"]];
    /* 置く順は前のまま（早い停留所から）。時刻の重なった群（車線に割ったもの）で
       札が入りきらなかったものは、同じ群の最初の札に「ほか1」と添えます——
       道には車線が見えているのに、札が黙って一つ消えていたので。押せばその札の
       用事が開き、残りは時間割にあります。
       「ほか1」の幅は一度目には分からないので、入りきらない札が出たときだけ、
       添える札にその幅を足して**置き直します**（足さずに添えると、題が「…」に
       つぶれて「11:30 ほか1」になる）。 */
    const saved = Object.entries(lanes).map(([key, v]) => [key, Object.assign(v.slice(), { lo: v.lo, hi: v.hi, dy: v.dy })]);
    /* 角の上で始まる停留所の札は、**角の内側の空きに、丸薬の始まりの高さで**（2026年10月2日・
       利用者の声「曲線のところにも書くようにして。じゃないと、丸薬の始点と合ってなくて
       読みにくい」）。はじめは近いほうのまっすぐの端の通りに置いていた。
       札は角の内側のふちから内へ伸ばし、時刻を角の側に（右の角は「題 時刻」、左の角は
       「時刻 題」）。上下の段の道に触れない高さに収め、ほかの札・人・寝床とぶつかれば
       少し上下にずらす。置いた箱は、そこに重なる通りにも控える（あとの札がよける）。 */
    let arcBoxes = [];
    const laneY = (key) => g.rowY(parseInt(key, 10)) + (key.slice(-1) === "u" ? -1 : 1) * (LANE + lanes[key].dy);
    /* 同じ角で同じ時刻に始まる車線の札（2026年10月2日・利用者の声「朝のBabyとテスト、
       文字がどちらの文字なのか分かりにくいし、丸薬に文字が重なって読みづらい」）。
       前は札の上下が次の段の車線の上下と逆に並び、角の内側のふちも自分の車線で測って
       いたので、内の車線の丸薬に字が乗っていた。いまは、角の内側のふちを**その時刻に
       居るいちばん内の車線**で測り、上下の通りも外へはみ出した車線（bump）ぶん空け、
       同じ時刻の札は**次の段の車線と同じ上下の順**に詰めて積む（`stackY`）。 */
    function placeArc(d0, off, time, title, extra = 0, prefer = null) {
      const p = g.point(d0, off);
      if (!p.arc) return null;
      const i = p.row, right = i % 2 === 0;
      const cx = right ? XR : XL, cy = g.rowY(i) + R;
      const rIn = st.stops.reduce((m, s) => (s.len && s.d0 <= d0 && d0 <= s.d1
        ? Math.min(m, right ? R + s.off : R - s.off) : m), right ? R + off : R - off);
      const ri = Math.min(R, rIn) - STOP / 2 - 2;
      const h = FS * 0.7;
      const top = g.rowY(i) + STOP / 2 + (bump[i + "d"] || 0) + h + 1;
      const bot = g.rowY(i + 1) - STOP / 2 - (bump[(i + 1) + "u"] || 0) - h - 1;
      const ys = [];
      [0, 14, -14, 28, -28].map((dy) => Math.max(top, Math.min(bot, p.y + dy)))
        .concat(top, bot).forEach((y) => { if (!ys.some((v) => Math.abs(v - y) < 1)) ys.push(y); });
      if (prefer != null && prefer >= top - 1e-6 && prefer <= bot + 1e-6) ys.unshift(prefer);
      const tw = textW(time, FS) + 1;
      const full = tw + 4 + textW(title, FS) + 1 + extra;
      const min = tw + 4 + FS * 1.6 + extra;
      const dir = right ? -1 : 1;
      for (const mode of ["full", "min", "time"]) {
        for (const y of ys) {
          const dy = y - cy;
          const anchor = cx - dir * Math.sqrt(Math.max(0, ri * ri - dy * dy));
          const occ = [];
          occ.lo = 2; occ.hi = W - 2;
          const hit = (t, b) => t < y + h + 1 && b > y - h - 1;
          Object.keys(lanes).forEach((key) => {
            const ly = laneY(key);
            if (hit(ly - h, ly + h)) lanes[key].forEach((iv) => occ.push(iv));
          });
          keep.concat(arcBoxes).forEach(([a, b, t, u]) => { if (hit(t, u)) occ.push([a, b]); });
          const only = mode === "time";
          const box = fit(occ, anchor, dir, only ? tw : full, only ? tw : mode === "full" ? full : min);
          if (!box) continue;
          arcBoxes.push([box[0], box[1], y - h, y + h]);
          Object.keys(lanes).forEach((key) => {
            const ly = laneY(key);
            if (hit(ly - h, ly + h)) lanes[key].push(box);
          });
          return { lo: box[0], hi: box[1], y, rev: right, only };
        }
      }
      return null;
    }
    /* 同じ角で同じ時刻に始まる札の高さ。次の段の車線の上下の順（右の角は off の小さい
       ほうが上、左の角は大きいほうが上）に、ぶつからない間で積み、角の内側の高さに収める。 */
    const stackY = (() => {
      const ys = {}, by = {};
      st.stops.forEach((s, k) => { if (g.point(s.d0).arc) (by[n1(s.d0)] = by[n1(s.d0)] || []).push(k); });
      Object.values(by).forEach((ks) => {
        if (ks.length < 2) return;
        const p = g.point(st.stops[ks[0]].d0), i = p.row, right = i % 2 === 0;
        const h = FS * 0.7, step = 2 * h + 2.5;
        const top = g.rowY(i) + STOP / 2 + (bump[i + "d"] || 0) + h + 1;
        const bot = g.rowY(i + 1) - STOP / 2 - (bump[(i + 1) + "u"] || 0) - h - 1;
        ks.sort((a, b) => (right ? 1 : -1) * (st.stops[a].off - st.stops[b].off));
        let y0 = p.y - (ks.length - 1) * step / 2;
        y0 = Math.max(top, Math.min(bot - (ks.length - 1) * step, y0));
        ks.forEach((k, j) => { ys[k] = y0 + j * step; });
      });
      return ys;
    })();
    const placeAll = (room) => {
      arcBoxes = [];
      return st.stops.map((s, k) => g.point(s.d0).arc
        ? placeArc(s.d0, s.off, clock(s.at), s.t.title, room[k] || 0, stackY[k])
        : place(g.point(s.d0), clock(s.at), s.t.title, TRIES, room[k] || 0));
    };
    /* 入りきらなかった札ごとに、同じ群で時間が重なり、札の出た停留所のうち始まりが
       いちばん近いものへ数を寄せる（群の最初の札だと、朝の長い用事に「ほか1」が
       付いて、昼の込み合いから遠くなった）。 */
    const carriers = (got) => {
      const n = {};
      st.stops.forEach((h, k) => {
        if (got[k] || h.cl == null) return;
        let best = -1;
        st.stops.forEach((s, j) => {
          if (!got[j] || s.cl !== h.cl || !(s.at < h.eu && h.at < s.eu)) return;
          if (best < 0 || Math.abs(s.at - h.at) < Math.abs(st.stops[best].at - h.at)) best = j;
        });
        if (best >= 0) n[best] = (n[best] || 0) + 1;
      });
      return n;
    };
    let placed = placeAll({});
    let more = carriers(placed);
    if (Object.keys(more).length) {
      const room = {};
      Object.keys(more).forEach((k) => { room[k] = textW(`ほか${more[k]}`, FS) + 4; });
      Object.keys(lanes).forEach((key) => { delete lanes[key]; });
      saved.forEach(([key, v]) => { lanes[key] = v; });
      placed = placeAll(room);
      more = carriers(placed);
    }
    st.stops.forEach((s, k) => {
      const b = placed[k];
      if (!b) return;
      const time = clock(s.at);
      const extra = more[k] || 0;
      const done = closed(s.t);
      const title = b.only ? "" : cut(s.t.title, b.hi - b.lo - textW(time, FS) - 1 - 4 - 1 - extra);
      out.push(html`
        <button type="button" class="road-label ${b.rev ? "is-rev" : ""} ${done ? "is-done" : ""}"
                data-k="${String(k)}" style="${at(b.lo, b.y)};width:${pct(b.hi - b.lo, W)}"
                aria-label="${time} ${s.t.title}${done ? "（済み）" : ""}${extra ? `、ほか${extra}件` : ""}">
          <b>${time}</b>${b.only ? "" : html`<span>${title}</span>`}${extra
            ? html`<em>ほか${extra}</em>` : ""}
        </button>`);
    });

    /* 入りきらない題は、ここで字を落として「…」を付けます（2026年9月30日・利用者の声
       「ジモティー受け渡し…   12:00 と、時刻と字の間が空き過ぎて同じ札だと思わなかった」）。
       CSS の省略は字の境目で切るので、かな漢字だと最大一字ぶんの空白が「…」の後ろに
       残り、左へ進む段（時刻が右）ではそれが題と時刻のあいだに来ていました。見積もりで
       切れば、余りは札の外側（時刻と反対の端）に出ます。CSS の省略は、画面が 360 より
       狭いときの受け止めとして残します。 */
    function cut(s, room) {
      const chars = [...String(s)];
      if (textW(s, FS) <= room + 1e-6) return s;
      const dots = FS;   // 日本語の字体では「…」は全角
      let w = 0, n = 0;
      while (n < chars.length && w + textW(chars[n], FS) + dots <= room + 1e-6) w += textW(chars[n++], FS);
      return chars.slice(0, Math.max(1, n)).join("") + "…";
    }

    // 3. 夜のごろ
    st.later.forEach((s, k) => {
      const time = clock(s.at) + "ごろ";
      const b = g.point(s.d0).arc ? placeArc(s.d0, 0, time, s.t.title)
        : place(g.point(s.d0), time, s.t.title, TRIES.slice(0, 6));
      if (!b) return;
      out.push(html`
        <button type="button" class="road-label is-later ${b.rev ? "is-rev" : ""}"
                data-l="${String(k)}" style="${at(b.lo, b.y)};width:${pct(b.hi - b.lo, W)}"
                aria-label="${time} ${s.t.title}">
          <b>${time}</b><span>${s.t.title}</span>
        </button>`);
    });

    /* 4. 長期タスク（段8の段B）。道の外周のくぼみに丸で浮かべる。札・人・道と
       重なる場所は使わない（札のほうが先。くぼみは空いたところだけ）。入りきら
       なければ最後の丸を「+n」にして、押すと長期タスクの欄へ送る。 */
    if (st.someday.length) {
      const hh = FS * 0.7;
      const boxes = keep.concat(arcBoxes);   // 角の内側の札も
      Object.keys(lanes).forEach((key) => {
        const occ = lanes[key];
        const y = g.rowY(parseInt(key, 10)) + (key.slice(-1) === "u" ? -1 : 1) * (LANE + occ.dy);
        occ.forEach(([a, b]) => boxes.push([a, b, y - hh, y + hh]));
      });
      const r = HOLLOW_BEAD / 2 + 2;
      const hitsBox = (x, y) => boxes.some(([a, b, t, u]) => {
        const cx = Math.max(a, Math.min(b, x)), cy = Math.max(t, Math.min(u, y));
        return (cx - x) * (cx - x) + (cy - y) * (cy - y) < r * r;
      });
      const free = hollowSlots(g).filter((s) => !hitsBox(s.x, s.y)
        && clearOfRoad(st, s.x, s.y, HOLLOW_BEAD / 2 + STOP / 2 + 1.5));
      const many = st.someday.length > free.length;
      const shown = many ? st.someday.slice(0, Math.max(0, free.length - 1)) : st.someday;
      /* くぼみを薄く塗る（置き場がここだと分かるように）。使った丸の外接に 5 の余白。 */
      const pads = new Map();
      free.slice(0, shown.length + (many ? 1 : 0)).forEach((s) => {
        const k = s.row + (s.right ? "r" : "l");
        const b = pads.get(k) || [Infinity, -Infinity, Infinity, -Infinity];
        pads.set(k, [Math.min(b[0], s.x), Math.max(b[1], s.x), Math.min(b[2], s.y), Math.max(b[3], s.y)]);
      });
      const pr = HOLLOW_BEAD / 2 + 5;
      pads.forEach(([x0, x1, y0, y1]) => out.push(html`
        <span class="road-hollow" aria-hidden="true"
              style="${at(x0 - pr, y0 - pr)};width:${pct(x1 - x0 + 2 * pr, W)};height:${pct(y1 - y0 + 2 * pr, g.H)}"></span>`));
      shown.forEach((c, h) => {
        const m = st.markOf ? st.markOf(c.t) : "";
        out.push(html`
          <button type="button" class="road-bead is-someday ${m ? "" : "is-plain"}" data-h="${String(h)}"
                  style="${at(free[h].x, free[h].y)}${m ? U.raw(";--icon:" + m) : ""}"
                  aria-label="${c.t.title}（長期タスク）"></button>`);
      });
      if (many && free.length) {
        const rest = st.someday.length - shown.length;
        const s = free[free.length - 1];
        out.push(html`
          <button type="button" class="road-bead road-more is-someday" data-more="someday"
                  style="${at(s.x, s.y)}" aria-label="長期タスク、ほかに${rest}件">+${rest}</button>`);
      }
    }

    return html`${out}`;
  }

  /* くぼみ（段8の段B）＝折り返しの外側の空き。右の折り返しは (0,1)(2,3)(4,5) 段を
     つなぐので、右のくぼみは (1,2)(3,4) 段のあいだ、左は (0,1)(2,3)(4,5) 段のあいだ。
     右を先に、足りなければ左。一つに丸18が2列×3段。道に近い列から、上から順に。 */
  const HOLLOW_BEAD = 18;
  function hollowSlots(g) {
    const out = [];
    const put = (i, right) => {
      if (i + 1 >= g.rows) return;
      const xs = right ? [XR + 17, XR + 37] : [XL - 17, XL - 37];
      [24, 44, 64].forEach((dy) => xs.forEach((x) => out.push({ x, y: g.rowY(i) + dy, row: i, right })));
    };
    for (let i = 1; i < g.rows; i += 2) put(i, true);
    for (let i = 0; i < g.rows; i += 2) put(i, false);
    return out;
  }
  /** (x, y) が道と停留所（車線も）から r 以上離れているか。 */
  function clearOfRoad(st, x, y, r) {
    const g = st.g;
    const pts = st.pts || (st.pts = roadPts(g));
    if (nearest(pts, x, y).d < r) return false;
    return st.stops.every((s) => {
      if (!s.off) return true;
      for (let t = s.at; t <= s.eu; t += 2) {
        const p = g.point(g.dist(t), s.off);
        if (Math.hypot(p.x - x, p.y - y) < r) return false;
      }
      return true;
    });
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
    const sep = html`<span class="road-sep" aria-hidden="true">·</span>`;
    /* 出る時刻（段7）。まだ来ていないときだけ言い、「あと」もそこまでの空きに
       します——空いているのは、出るまでなので。過ぎたら（向かっている途中）
       言わず、「あと」は停留所まで。 */
    const leave = next && next.lead && next.at - next.lead > nowMin ? next.at - next.lead : null;
    const nextTxt = next
      ? html`次は <b>${clock(next.at)} ${next.t.title}</b>${leave != null
        ? html`${sep}<b>${clock(leave)}</b> に出る` : ""}`
      : "";
    if (cur) {
      return html`いまは <b>${cur.t.title}</b>（${clock(cur.until)}まで）${next ? html`${sep}${nextTxt}` : ""}`;
    }
    if (next) {
      const left = (leave != null ? leave : next.at) - nowMin;
      return html`${nextTxt}${sep}${left > 0 ? `あと${KN.plan.humanSpan(left)}` : "いまから"}`;
    }
    /* 今日の決まった予定が済んだら、明日の最初の停留所を一つだけ（段6）。
       見通しを言うだけで、明日の数や量は言いません。無ければ何も足さない。 */
    if (nowMin < st.g.end) {
      const tm = st.tomorrow;
      return html`このあと、決まった予定はありません${tm
        ? html`${sep}明日は <b>${clock(tm.at)} ${tm.title}</b>から` : ""}`;
    }
    return "";
  }

  /* ---------------- 道の上で決める（段2） ----------------

     空いた道を押すと、その時刻（15分きざみ）と前後の空きを出し、「時刻を
     決めていないもの」から一つ選べば、その時刻が付いて停留所になります。

     **決めるのは本人。** 空いているから何か入れろとは言いません——選ぶものが
     無ければ無いと言うだけで、新しく書く欄も出しません（入力を増やさない）。
     「空き」は長さを言うだけで、埋めるべき余白としては言いません。 */

  /** 道の上の、1分ごとの点（角の上も。角も時間を持つので、道は一本の物差し）。 */
  function roadPts(g) {
    const out = [];
    for (let t = g.begin; t <= g.end; t++) {
      const p = g.point(g.dist(t));
      out.push({ t, x: p.x, y: p.y });
    }
    return out;
  }
  /** 点の中で (x, y) にいちばん近いもの → { t: 分, d: 道の中心からの距離 }。 */
  function nearest(pts, x, y) {
    let best = pts[0], bd = Infinity;
    pts.forEach((p) => {
      const dd = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (dd < bd) { bd = dd; best = p; }
    });
    return { t: best.t, d: Math.sqrt(bd) };
  }
  /** viewBox の点 → いちばん近い時刻（分）。1分ずつ道をなぞって探します
      （一日で千回ほど。押したときに一度だけなので、逆算の式を持つより素直）。 */
  function timeNear(g, x, y) {
    return nearest(roadPts(g), x, y).t;
  }

  /** 時刻 raw のまわりの空き。前後の停留所（時刻を決めたもの）のあいだで、
      今日なら「いま」より前は数えません。長さを決めていない停留所は点なので、
      始まりの時刻で区切ります。停留所の中なら、その停留所を返します。 */
  function gapAt(st, raw, nowMin) {
    const g = st.g;
    let lo = g.begin, hi = g.end, inside = null;
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
      /* 決めた長さが無ければ、くり返しの用事のいつもの長さ（段4）。空きに入るかを
         見るための目安で、道には描きません。 */
      const own = Number(c.t.minutes) > 0 ? 0 : KN.store.usualMinutes(c.t);
      const len = Number(c.t.minutes) > 0 ? KN.plan.humanSpan(Number(c.t.minutes))
        : own ? `いつもは${KN.plan.humanSpan(own)}くらい` : "";
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

  /* ---------------- 道へ運ぶ（段8・2026年9月30日） ----------------

     連れ（時刻を決めていないもの）と、くぼみの長期タスク（段B。marks の 4.）を
     長押しで持ち上げ、道の上へ運んで離すと、その時刻が付いて停留所になります
     （長期タスクは、その日も付く）。書き換えは段2と同じ `o.decide`（時間割で
     時刻の列へ運んだときと同じ書き換えと「元に戻す」）。手つきは時間割の
     「つまんで、置きなおす」（screen-todo.js の wireDrag / lift）と同じ作りです。
     - 0.38秒押さえたら持ち上がる。その前に 8px 動いたら、ただの送り。短く押せば、
       今までどおり紙が開く。
     - 時刻は段2と同じく、指にいちばん近い道の時刻を1分ずつなぞって探し、15分
       きざみ（snap）。指が道の中心から AIM_NEAR 以内のときだけ、狙いの点と時刻の
       札を出す。置けるのは**これからの道だけ**（`.road-free` と同じ）。停留所と
       重なってもよい（車線に割れる。警告の色は出さない）。
     - 狙うのは指ではなく、**指の上に浮いた写しの位置**（GHOST_UP 上。2026年10月3日、
       利用者の頼み：「浮いている丸のところが操作する場所に」）。
     - 連れを道から離れたところ（OUT_FAR より外、道の絵の中）で離すと、日も時刻も
       外れて長期タスクへ戻る（`o.unplan`。時間割で長期タスクの欄へ運んだときと同じ）。
       くり返しは戻さない（due を外すと回が消える）。長期タスクは外で離しても何もしない。
     - 歩いたぶんで離したら、何も書かない。丸は元の場所へ戻る。
     - 道は一画面に入るので、端の自動送りは付けない。
     - 見張りは document（day-swipe.js が外枠でポインタを捕まえても届くように）。
       持ち上げたら touchmove を止め（送りを始めさせない）、離したあとの click を
       一度だけ食べる（でないと離したところで紙が開く）。day-swipe・pull-refresh は
       `carrying()` を見て、この指を取らない。 */
  const CARRY_HOLD = 380;       // screen-todo.js の DRAG_HOLD と同じ
  const CARRY_SLOP = 8;         //                   DRAG_SLOP と同じ
  const AIM_NEAR = 24;          // 道の中心から、狙える近さ（viewBox の単位 ≒ px）
  const OUT_FAR = 34;           // これより道から離れたら「道の外」（長期タスクへ戻す）
  /* 持ち上げた丸と時刻の札は、指の腹（触れた点からおよそ 24px 外へ広がる）に
     隠れないよう、指の上に積みます（札の下端が指から 58px 上）。 */
  const GHOST_UP = 40;
  const LABEL_UP = 58;
  let carry = null;

  function wireCarry(el, o) {
    el.addEventListener("pointerdown", (e) => {
      if (carry || !o.decide) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      /* 運べるのは連れ（data-b）と、くぼみの長期タスク（data-h）。夜のごろと「+n」は運ばない。 */
      const bead = e.target.closest && e.target.closest(".road-bead[data-b], .road-bead[data-h]");
      const st = el.__road;
      if (!bead || !st || st.past || !el.contains(bead)) return;
      const key = bead.hasAttribute("data-b") ? "b" : "h";
      const k = Number(bead.getAttribute("data-" + key));
      if (!(key === "b" ? st.loose : st.someday)[k]) return;
      const x0 = e.clientX, y0 = e.clientY, pid = e.pointerId;
      let timer = setTimeout(() => { timer = null; off(); lift(el, o, key, k, x0, y0, pid); }, CARRY_HOLD);
      const off = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        document.removeEventListener("pointermove", moved);
        document.removeEventListener("pointerup", off);
        document.removeEventListener("pointercancel", off);
      };
      const moved = (ev) => {
        if (ev.pointerId !== pid) return;
        if (Math.abs(ev.clientX - x0) > CARRY_SLOP || Math.abs(ev.clientY - y0) > CARRY_SLOP) off();
      };
      document.addEventListener("pointermove", moved);
      document.addEventListener("pointerup", off);
      document.addEventListener("pointercancel", off);
    });
    /* 長押しで端末が出す選択肢は、運んでいるあいだは出さない。 */
    el.addEventListener("contextmenu", (e) => { if (carry) e.preventDefault(); });
  }

  /** 持ち上げる。丸は元の場所で薄く残り（どこから来たか）、写しが指の上に浮く。 */
  function lift(el, o, key, k, x0, y0, pid) {
    const st = el.__road;
    const c = st && (key === "b" ? st.loose : st.someday)[k];
    const map = el.querySelector(".road-map");
    if (!c || !map || !el.isConnected) return;
    KN.motion.fire("reorder");
    try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch (_) { }
    const sel = `.road-bead[data-${key}="${k}"]`;
    const bead = el.querySelector(sel);
    if (bead) bead.classList.add("is-lifted");
    el.classList.add("is-carrying");

    const m = st.markOf ? st.markOf(c.t) : "";
    const ghost = node(html`<span class="road-bead road-ghost ${m ? "" : "is-plain"}" aria-hidden="true"></span>`);
    if (m) ghost.style.setProperty("--icon", m);
    const tag = node(html`<span class="road-carry-time" aria-hidden="true"></span>`);
    const aim = node(html`<span class="road-aim" aria-hidden="true"></span>`);
    document.body.append(ghost, tag);
    map.append(aim);

    /* 離したあとの click を一度だけ食べる（連れの丸は押すと紙が開くので）。 */
    const eat = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    el.addEventListener("click", eat, { capture: true, once: true });

    /* 道の位置は持ち上げたときに一度だけ測る。運んでいるあいだは送らない
       （touchmove を止める）ので動かない。 */
    const box = map.getBoundingClientRect();
    carry = { el, o, st, sel, id: c.t.id, pid, x0, y0, box, pts: st.pts || (st.pts = roadPts(st.g)),
              ghost, tag, aim, eat, at: null, out: false, moved: false,
              canOut: key === "b" && !!o.unplan && !c.t.repeat };

    const move = (ev) => {
      if (!carry || ev.pointerId !== pid) return;
      if (Math.abs(ev.clientX - x0) > CARRY_SLOP || Math.abs(ev.clientY - y0) > CARRY_SLOP) carry.moved = true;
      follow(ev.clientX, ev.clientY);
    };
    /* 送りを止めるのは touchmove のほう（pointermove で止めても、ブラウザは送りを
       始めて指の追跡ごと取り上げる。screen-todo.js の lift と同じ話）。 */
    const hold = (ev) => { if (carry && ev.cancelable) ev.preventDefault(); };
    const done = (ev) => { if (ev.pointerId !== pid) return; follow(ev.clientX, ev.clientY); dropCarry(true); };
    /* 取り上げられたときは置かない（指を離していないので、どこへとも言っていない）。 */
    const give = (ev) => { if (ev.pointerId === pid) dropCarry(false); };
    carry.off = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("touchmove", hold);
      document.removeEventListener("pointerup", done);
      document.removeEventListener("pointercancel", give);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("touchmove", hold, { passive: false });
    document.addEventListener("pointerup", done);
    document.addEventListener("pointercancel", give);
    follow(x0, y0);
  }

  /** 運んで狙った時刻（15分きざみ）。置けない（歩いたぶん・過ぎた日・一日の
      終わり）なら null。停留所の中でもかまわない（車線に割れる）。 */
  function carryAt(st, raw) {
    if (st.past) return null;
    const g = st.g;
    const lo = st.today ? KN.plan.toMin(U.nowTime()) : g.begin;
    if (raw < lo) return null;
    const at = snap(raw, lo, g.end);
    return at < g.end ? at : null;
  }

  /** 指の位置へ。写しは指の上、狙いの点は道の上、時刻の札は写しの上。
      狙うのは写しの位置（指の腹ではなく、浮いた丸のところ）。 */
  function follow(x, y) {
    const d = carry;
    if (!d) return;
    const gy = y - GHOST_UP;
    /* 位置は translate で（transform で書くと、CSS の scale: 1.3 が移動量まで
       1.3 倍して、写しが指から右下へずれた）。 */
    d.ghost.style.translate = `${x.toFixed(1)}px ${gy.toFixed(1)}px`;
    const g = d.st.g;
    const kk = d.box.width / W;
    let at = null, out = false;
    if (d.moved && kk > 0) {
      const hit = nearest(d.pts, (x - d.box.left) / kk, (gy - d.box.top) / kk);
      if (hit.d <= AIM_NEAR) at = carryAt(d.st, hit.t);
      else if (d.canOut && hit.d > OUT_FAR && gy >= d.box.top && gy <= d.box.bottom
               && x >= d.box.left && x <= d.box.right) out = true;
    }
    if (at === d.at && out === d.out && d.aim.classList.contains("is-on") === (at != null)) {
      if (at != null || out) d.tag.style.transform = tagAt(x, y);
      return;
    }
    d.at = at;
    d.out = out;
    d.el.classList.toggle("is-carry-out", out);
    d.aim.classList.toggle("is-on", at != null);
    d.tag.classList.toggle("is-on", at != null || out);
    if (out) { d.tag.textContent = "長期タスク"; d.tag.style.transform = tagAt(x, y); return; }
    if (at == null) return;
    const p = g.point(g.dist(at));
    d.aim.style.left = (p.x / W * 100).toFixed(3) + "%";
    d.aim.style.top = (p.y / g.H * 100).toFixed(3) + "%";
    d.tag.textContent = clock(at);
    d.tag.style.transform = tagAt(x, y);
  }
  /* 札は指の真上。画面の左右の端では内へ寄せる（札の幅はおよそ 56px、「長期タスク」で 80px）。 */
  const tagAt = (x, y) => {
    const cx = Math.max(44, Math.min(window.innerWidth - 44, x));
    return `translate(${cx.toFixed(1)}px, ${Math.max(4, y - LABEL_UP).toFixed(1)}px) translate(-50%, -100%)`;
  };

  /** 離した・取り上げられた。置けるところで離したときだけ書く。 */
  function dropCarry(commit) {
    const d = carry;
    carry = null;
    if (!d) return;
    d.off();
    d.ghost.remove();
    d.tag.remove();
    d.aim.remove();
    d.el.classList.remove("is-carrying", "is-carry-out");
    const bead = d.el.querySelector(d.sel);
    if (bead) bead.classList.remove("is-lifted");
    /* click は離した直後に来る。来なかったぶんは片づける（置いたままだと、
       次にどこかを押したときに食べてしまう）。 */
    setTimeout(() => d.el.removeEventListener("click", d.eat, true), 0);
    if (commit && d.moved && d.out) { d.o.unplan(d.id); return; }
    if (!commit || !d.moved || d.at == null) { paint(d.el); return; }
    d.o.decide(d.id, KN.plan.toTime(d.at));
  }

  /** その根の中の道を、ぜんぶ描き直す（分が変わっていなければ何もしない）。 */
  function paintAll(root) {
    if (!root) return;
    root.querySelectorAll(".day-road").forEach(paint);
  }

  /* pose(τ) は試験用：歩きの経った割合 τ（0〜1）での形（腕と脚の速さを数で見る）。 */
  /* carrying() は、道で運んでいる最中か（day-swipe・pull-refresh がこの指を取らない）。 */
  KN.dayRoad = { build, paint, paintAll, geom, snap, walk, W,
                 carrying: () => !!carry,
                 pose: walkPose };
})();
