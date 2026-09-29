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
     少し」）。折り返しの半径も大きくなり、一段のまっすぐな長さは 276 → 260。 */
  const PITCH = 80;
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
  /* 重なった停留所の車線どうしの間。太さは割らず、ふち（2.5）を一本ぶん重ねて
     並べる——あいだの仕切りが、外のふちと同じ太さになる。 */
  const LANE_P = STOP - 2.5;
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
     広げたのは、札の読みやすさのため。 */
  const ROWS = 6;

  const n1 = (v) => Math.round(v * 10) / 10;
  const clock = (min) => KN.plan.toTime(min).replace(/^0(\d:)/, "$1");
  const closed = (t) => !!(t.done || t.archived);

  /* ---------------- 時刻と、道の上の位置 ----------------

     道は段ごとに向きを変えます（一段目は右へ、二段目は左へ……）。一段は
     **ちょうどの時間**を持ちます——一日を六段（ROWS）に割り、1時間単位に切り上げ。
     5:00〜23:00 なら一段3時間で、8:00・11:00・14:00・17:00・20:00 で折り返します。
     割り切れない日は、最後の段が余ったぶんだけで、道はそこで終わります（手描きの道も、最後の段は端まで
     行かずに「22:30」で止まっていました）。

     **折り返しは時間を持ちません。** 段の尻と次の段の頭は同じ時刻で、曲がり
     角はそのあいだをつなぐだけの線です。持たせると一時間の長さが段の途中で
     変わらないかわりに、折り返しの時刻が半端になり、角の札（「11:00」）で
     物差しを言えなくなります。 */
  function geom(start, end) {
    const span = Math.max(60, end - start);
    const rowSpan = Math.max(120, Math.ceil(span / ROWS / 60) * 60);
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

    /* 並走（off）。時刻の重なった停留所は、道を横に割った車線に描きます（
       2026年9月29日）。off は**進む向きの左へ**のずらし：右へ進む段では上、左へ
       進む段では下。右の曲がり角では外回り（半径 R + off）、左の角では内回り
       （R − off）になり、角をはさんでも同じ車線のまま次の段へつながります。 */
    const rOf = (i, off) => (i % 2 === 0 ? R + off : R - off);

    /** 長さ → 点。まっすぐなところなら、その段と向きも。 */
    function point(d, off = 0) {
      const dd = Math.max(0, Math.min(total, d));
      const i = Math.max(0, Math.min(rows - 1, Math.floor(dd / SEG + 1e-9)));
      const rem = dd - i * SEG;
      const y = rowY(i);
      const ltr = i % 2 === 0;
      if (rem <= RUN + 1e-9) return { x: ltr ? XL + rem : XR - rem, y: y + (ltr ? -off : off), row: i, ltr };
      const a = (rem - RUN) / R, r = rOf(i, off);
      const s = Math.sin(a), c = Math.cos(a);
      return { x: ltr ? XR + r * s : XL - r * s, y: y + R - r * c, row: i, ltr, arc: true };
    }

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

    /** 一時間ごとの目盛りの時刻。曲がり角の上には置きません（そこは札が言うので）。
        道の始まりはちょうどの時へ切り下げてあるので（`reach`）、角も目盛りも
        「ちょうどの時」にそろいます。 */
    function tickTimes() {
      const out = [];
      for (let t = Math.floor(start / 60) * 60 + 60; t < start + span; t += 60) {
        if ((t - start) % rowSpan !== 0) out.push(t);
      }
      return out;
    }
    /** 目盛りの道筋。half は目盛りの半分の長さ、off は車線。 */
    function tickPath(ts, off = 0, half = 3) {
      return ts.map((t) => {
        const p = point(dist(t), off);
        return `M${n1(p.x)} ${n1(p.y - half)}V${n1(p.y + half)}`;
      }).join("");
    }
    const ticks = () => tickPath(tickTimes());

    return { start, end: start + span, rowSpan, rows, H, total, rowY, dist, point, path,
             ticks, tickTimes, tickPath };
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
        const k = walkPhase(tau) / (WALK.steps / 2), to = me.__at;
        me.setAttribute("transform", meAt({ x: glide.x + (to.x - glide.x) * k,
                                            y: glide.y + (to.y - glide.y) * k, sx: to.sx }));
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
   *   tomorrow … { at: 分, title } 明日の最初の停留所（段6。今日だけ。無ければ null）
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
     描くだけで、設定も記録も書き換えません。 */
  function reach(plan) {
    let a = plan.startMin, b = plan.endMin;
    plan.items.forEach((it) => {
      if (!it.fixed) return;
      a = Math.min(a, it.atMin);
      b = Math.max(b, Number(it.todo.minutes) > 0 ? it.untilMin : it.atMin);
    });
    return [Math.max(0, Math.floor(a / 60) * 60), Math.min(24 * 60, b)];
  }

  /* 時刻の重なった停留所（長さのあるものどうし）は、道を横に割った車線へ
     （2026年9月29日）。前は同じところに重ねて描いていたので、あとの一本が
     上に乗って一本に見え、重なっていることが道から読めなかった。
     重なりでつながった一群（クラスター）ごとに、空いた車線へ入れます。
     **太さは割りません**（2026年9月30日・利用者の声「2つ以上重なったときも、
     太さを変えなくていいように」）。前は群の車線の数で停留所の太さを割っていて、
     重なるたびに細くなり、三つ重なれば読めない細さでした。いまは同じ太さの
     まま LANE_P ずつ横に並べます。**重なった区間だけでなく、その用事の全体を
     車線に描く**——途中で位置が変わると、塗り（歩いたぶん）の描き直しが継ぎ目を
     持つので。長さの無い停留所（点）は割らない（点そのものが印）。
     評価はしません（「重複」の警告色は出さない。時間割の丸薬と同じ）。

     **長いほうが道の中心**（2026年9月30日・利用者の声「あくまで中心は長い方で、
     それにぴったりくっつく形で外側に短いタスクが出る」）。前は早い順に左から
     詰めていたので、一日の軸になる長い用事まで道の中心から外れていた。群の中を
     長い順に、中心 → 進む向きの右 → 左 → 右の二つ目……と、時間の重ならない
     車線へ入れます。短いほうは、中心の停留所にくっついて道の外へ出ます
     （それでいい、と利用者）。重なりは「延びた終わり」（`eu`）で見ます。 */
  function laneOut(stops) {
    const spans = stops.filter((s) => s.len).sort((p, q) => p.at - q.at || p.eu - q.eu);
    const groups = [];
    let cur = null, reachEnd = -Infinity;
    spans.forEach((s) => {
      if (!cur || s.at >= reachEnd) { groups.push(cur = []); reachEnd = -Infinity; }
      cur.push(s);
      reachEnd = Math.max(reachEnd, s.eu);
    });
    stops.forEach((s) => { s.lanes = 1; s.slot = 0; s.cl = null; s.off = 0; });
    groups.forEach((grp, id) => {
      if (grp.length < 2) return;
      const put = [];
      grp.slice().sort((p, q) => (q.eu - q.at) - (p.eu - p.at) || p.at - q.at).forEach((s) => {
        for (let i = 0; i < 64; i++) {
          const slot = i % 2 ? (i + 1) / 2 : -i / 2;     // 0, 1, -1, 2, -2 …（正が右）
          if (put.some((x) => x.slot === slot && x.at < s.eu && s.at < x.eu)) continue;
          s.slot = slot;
          put.push(s);
          break;
        }
      });
      const slots = grp.map((s) => s.slot);
      const n = Math.max(...slots) - Math.min(...slots) + 1;
      /* off は進む向きの左が正なので、右の車線は負。 */
      grp.forEach((s) => { s.lanes = n; s.cl = n > 1 ? id : null; s.off = n > 1 ? -s.slot * LANE_P : 0; });
    });
  }

  /* 時刻を過ぎても済んでいない区間は、**人の足もとまで引っぱる**（2026年9月30日・
     利用者の声「朝のルーティンは7時までなのに過ぎている。でも表示は何も変わらない」）。
     終わりを「いま」に延ばし、色を一時的に変えます（`.is-late`）。済ませたら、押した
     時刻でそこに止まり、色は戻ります（済ませた時刻が決めた終わりより後なら、その
     時刻まで）。記録は書き換えません——描くときに `doneAt` からそのつど引くだけ。
     延びた終わりは `eu`。車線（laneOut）も札もこれで見ます。返りは形の見分け字
     （変わったときだけ道筋を引き直す）。 */
  function shape(st, nowMin) {
    const g = st.g;
    st.stops.forEach((s) => {
      s.late = !!(s.len && nowMin != null && !closed(s.t) && nowMin > s.until);
      /* 過ぎた日は、押した時刻まで延ばさない（決めた区間のまま。押した時刻は
         paint が小さな白い粒で置く）。2026年9月29日。 */
      s.eu = s.late ? Math.max(s.until, Math.min(nowMin, g.end))
        : !st.past && s.len && s.doneMin != null && s.doneMin > s.until ? s.doneMin : s.until;
      s.d1 = s.len ? Math.max(s.d0, g.dist(s.eu, true)) : s.d0;
    });
    laneOut(st.stops);
    return st.stops.map((s) => `${n1(s.d1)}/${n1(s.off)}/${s.lanes}/${s.late ? 1 : 0}`).join(",");
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
    const g = geom(...reach(plan));
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
        /* 出る時刻（段7）。「前に30分」なら、停留所の手前30分に点線の区間。
           済ませたものには描きません（もう出ることはないので）。 */
        const lead = !closed(t) && Number(t.lead) > 0 ? Number(t.lead) : 0;
        stops.push({ t, at: it.atMin, until: it.untilMin, len, d0, lead,
                     dl: lead ? g.dist(Math.max(g.start, it.atMin - lead)) : d0,
                     doneMin: doneMinOf(t, plan.day) });
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
    /* 停留所の道筋・車線・延び（is-late）は paint が引きます（いまに合わせて
       延びるので）。 */
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
      + `<path class="road-base" d="${g.path(0, g.total)}"/>`
      + `<path class="road-went"/>`
      + `<path class="road-ticks" d="${g.ticks()}"/>`
      + stopSvg + laterSvg
      /* 停留所の上の目盛り（paint が引く）。道の目盛りは停留所の太い線の下に
         隠れて、一日の半分ほどで物差しが消えていた。塗った上は白、まだの白い中は
         塗りの色で。 */
      + `<path class="road-ticks is-over"/><path class="road-ticks is-ink"/>`
      + `<g class="road-steps">${stepSvg}</g><g class="road-steps is-stops"></g>`
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
    el.__road = { g, today, past, stops, steps, loose, later,
                  tomorrow: today && o.tomorrow ? o.tomorrow : null,
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
    const moved = st.drawn && st.last != null && nowMin != null;
    st.last = nowMin;
    st.drawn = true;
    const g = st.g;
    const dNow = nowMin == null ? null : g.dist(nowMin);
    const svg = el.querySelector(".road-svg");

    /* ⓪ 停留所の道筋と車線。延びる区間（過ぎてまだのもの）があると、分ごとに
       形が変わります。変わったときだけ引き直す。 */
    const sig = shape(st, nowMin);
    if (sig !== st.sig) {
      st.sig = sig;
      const grpEls = svg.querySelectorAll(".road-stop[data-s]");
      st.stops.forEach((s, k) => {
        const d = g.path(s.d0, s.d1, s.off);
        const lanes = s.lanes > 1;
        [grpEls[k], svg.querySelector(`.road-hit[data-k="${k}"]`)].forEach((x) => {
          if (!x) return;
          x.classList.toggle("is-lanes", lanes);
          if (lanes) x.style.setProperty("--lanes", s.lanes);
          else x.style.removeProperty("--lanes");
        });
        if (grpEls[k]) {
          grpEls[k].classList.toggle("is-late", s.late);
          grpEls[k].querySelectorAll(".road-stop-edge, .road-stop-in").forEach((x) => x.setAttribute("d", d));
        }
        const hit = svg.querySelector(`.road-hit[data-k="${k}"]`);
        if (hit) hit.setAttribute("d", d);
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
    const over = [], ink = [];
    st.stops.forEach((s, k) => {
      const grp = stopEls[k];
      if (!grp) return;
      const w = grp.querySelector(".road-stop-went");
      const done = closed(s.t);
      let to = null;
      if (done || st.past) to = s.d1;
      else if (nowMin != null && nowMin >= s.at) to = s.len ? Math.min(dNow, s.d1) : s.d1;
      if (to == null) w.removeAttribute("d");
      else w.setAttribute("d", g.path(s.d0, to, s.off));
      grp.classList.toggle("is-live",
        !done && s.len && nowMin != null && nowMin >= s.at && nowMin < s.until);
      /* 停留所の上の目盛り。始まりと終わりちょうどは札と丸い端が言うので置かない。
         塗ったところは白、まだの白い中は塗りの色。車線に割ったものは車線の中に。 */
      if (!s.len) return;
      g.tickTimes().filter((t) => t > s.at && t < s.eu).forEach((t) => {
        (to != null && g.dist(t) <= to + 1e-6 ? over : ink).push(g.tickPath([t], s.off));
      });
    });
    const tickD = (el, parts) => {
      if (parts.length) el.setAttribute("d", parts.join(""));
      else el.removeAttribute("d");
    };
    tickD(svg.querySelector(".road-ticks.is-over"), over);
    tickD(svg.querySelector(".road-ticks.is-ink"), ink);

    /* ③ 人。道の上に立ちます。停留所の中に居るときは、停留所のふちの上に
       （道の太さのところに立たせると、足がふちの中へ埋まる）。 */
    const me = svg.querySelector(".road-me");
    if (dNow == null) me.style.display = "none";
    else {
      const p = g.point(dNow);
      /* 延びた区間（is-late）は足もとで終わるので、そのふちの上に。 */
      const onStop = st.stops.some((s) => s.len && nowMin >= s.at && (nowMin < s.until || s.late));
      const was = me.__at;
      const to = { x: p.x, y: p.y - (onStop ? STOP : ROAD) / 2, sx: p.ltr ? ME_K : -ME_K, row: p.row };
      me.__at = to;
      me.style.display = "";
      if (!me.__walk) me.setAttribute("transform", meAt(to));
      /* 分が変わったら、歩いて次の足もとへ（2026年9月30日・利用者の声「時刻が
         1分進むなど変わると、人が動くように」）。一分は道の上で 1〜2 単位しか
         ないので、動いたと分かるのは歩く形のほう。段が変わる（角を回る）ときは
         まっすぐ横切らせず、その場で歩くだけ。 */
      if (moved) walk(el, was && was.row === to.row ? was : null);
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
    /* 道の外へはみ出した車線（長いほうが中心で、短いほうが外。laneOut）が
       ある段の側は、通りを外へずらします（dy）。ずらさないと札の字が車線の
       ふちに乗る。 */
    const bump = {};
    st.stops.forEach((s) => {
      if (s.lanes < 2) return;
      const out = Math.abs(s.off) + 0.5;   // 車線は停留所と同じ太さなので、ずれたぶんだけ外へ
      if (out <= 0.1) return;
      for (let r = g.point(s.d0).row; r <= g.point(s.d1).row; r++) {
        const key = r + ((s.off > 0) === (r % 2 === 0) ? "u" : "d");
        bump[key] = Math.max(bump[key] || 0, out);
      }
    });
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

    // 始まりと終わりの時刻、曲がり角の時刻（物差し）
    const p0 = g.point(0), pe = g.point(g.total);
    out.push(html`<span class="road-edge is-before" style="${at(p0.x - 9, p0.y)}">${clock(g.start)}</span>`);
    out.push(html`<span class="road-edge ${pe.ltr ? "" : "is-before"}"
                        style="${at(pe.x + (pe.ltr ? 9 : -9), pe.y)}">${clock(g.end)}</span>`);
    /* 角の時刻は、人がそこに立っているときは出しません（頭と重なる。
       人の足もとの時刻の札が、同じことを言っています）。 */
    const me = dNow == null ? null : g.point(dNow);
    const turnAt = new Map();   // 角の時刻 → out の中の位置（停留所の札と重なれば、あとで外す）
    for (let i = 0; i < g.rows - 1; i++) {
      const x = i % 2 === 0 ? XR + R * 0.36 : XL - R * 0.36;
      const y = g.rowY(i) + R;
      if (me && Math.abs(me.x - x) < 26 && Math.abs(me.y - ME_HEAD - y) < 30) continue;
      const turn = g.start + (i + 1) * g.rowSpan;
      turnAt.set(turn, out.length);
      out.push(html`<span class="road-turn" style="${at(x, y)}">${clock(turn)}</span>`);
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
        const y = p.y - LANE - lane(p.row, "u").dy;
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
        out.push(html`<span class="road-now" style="${at(box[0], p.y + LANE + lane(p.row, "d").dy)}">${txt}</span>`);
      }
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
    const placeAll = (room) => st.stops.map((s, k) => place(g.point(s.d0), clock(s.at), s.t.title, TRIES, room[k] || 0));
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
      /* 角ちょうどに始まる停留所（8:00 の朝のBaby）は、札の太字が同じ時刻を
         言うので、角の小さな「8:00」は外します——上下に二つ並んでいました
         （2026年9月29日、iPhone。R17 は「角で終わる」側だけだった）。札が
         置けなかったときは外さない（時刻が消えないように）。 */
      if (turnAt.has(s.at)) { out[turnAt.get(s.at)] = ""; turnAt.delete(s.at); }
      const time = clock(s.at);
      const extra = more[k] || 0;
      const done = closed(s.t);
      out.push(html`
        <button type="button" class="road-label ${b.rev ? "is-rev" : ""} ${done ? "is-done" : ""}"
                data-k="${String(k)}" style="${at(b.lo, b.y)};width:${pct(b.hi - b.lo, W)}"
                aria-label="${time} ${s.t.title}${done ? "（済み）" : ""}${extra ? `、ほか${extra}件` : ""}">
          <b>${time}</b>${b.only ? "" : html`<span>${s.t.title}</span>`}${extra
            ? html`<em>ほか${extra}</em>` : ""}
        </button>`);
    });

    // 3. 夜のごろ
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

  /** その根の中の道を、ぜんぶ描き直す（分が変わっていなければ何もしない）。 */
  function paintAll(root) {
    if (!root) return;
    root.querySelectorAll(".day-road").forEach(paint);
  }

  /* pose(τ) は試験用：歩きの経った割合 τ（0〜1）での形（腕と脚の速さを数で見る）。 */
  KN.dayRoad = { build, paint, paintAll, geom, snap, walk, W,
                 pose: walkPose };
})();
