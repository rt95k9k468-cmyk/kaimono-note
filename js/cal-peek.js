/* =========================================================
   くらしノート — 暦の三段（暦なし・週・月）を滑らせる

   段は題を押して替える（取っ手は置かない。docs/shared-header.md の頭）。ここは、段が替わるときの
   滑り（glide）と暦の三層（mount）だけを持つ。やること・からだ・買うもので同じものを使う。

   ■ 動かすのは、暦の高さ。紙はそのぶんだけ上下する

   数（p）から出るのは**暦の高さ**（`visibleH`）ひとつで、紙はそのぶん
   だけ流れの中で上下します。紙の上端（丸角＋掴み手）は、いつも暦の
   すぐ下——**掴み手の貼りつく床（--cal-h）も、同じ `visibleH` から**
   毎フレーム書きます。数が一つなので、途中で指を離しても暦と掴み手と
   紙が別々のところに居る、ということが起きません。

   **紙のほうを transform で動かす作りは、試して外しました。**
   暦を月の姿で留めて紙を平行移動させれば組み直しが要らない、という
   話でしたが、そのためには紙が暦の**上**を通らなければなりません
   （上へ押して暦を消すのは「紙が覆う」ことなので）。ところが紙の箱は
   画面の上へはみ出しています——送った先では、紙の頭は viewport の
   ずっと上です。上に乗せた瞬間、**紙の地が暦を丸ごと隠しました**
   （実測：ダイエットで下まで送ってから引くと、暦は一度も見えない）。
   紙のはみ出しを切るには clip-path を毎フレーム計算することになり、
   それは高さを書き換えるより高くつきます。暦が上に居て、下を紙が
   流れる——この順のままにするのが素直でした。

   ■ 三層

     .cal-wds    曜日の行
     .cal-clip   窓（overflow: hidden）
       .cal-slide   その中のずらし（縦の transform ＝ どの週を上に出すか）
         .cal-grid    日のマス（横の transform ＝ 月めくり）

   縦と横で層を分けているのは、月めくりの横ずれを .cal-grid がすでに
   持っているからです——同じ要素に二つの transform は書けません。
   曜日を .cal-grid の外に出したのは、暦が伸びても曜日が上に留まるように。

   ■ 段は三つ

     -1 … 暦なし（画面ぜんぶが下の紙）
      0 … 今週の一行
      1 … 月ぜんぶ

   数はひとつ（p）で、-1 から 1 まで続いています（真ん中の 0 が週）。

   画面へ渡すのは --cal-p で、こちらは **0〜1 だけ**です（隣の週の濃さと
   題の「›」の傾きが見ている数で、負の側には意味がありません）。消える
   ぶんの縮みは、JSが曜日の行と余白に直に書きます。

   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node } = KN.util;


  /**
   * 暦の三層を組んで、節に足します。中身（曜日・日のマス）を書くのは
   * それぞれの画面の仕事です——日ごとに何を出すかが違うので。
   */
  function mount(sec) {
    const wds = node(html`<div class="cal-wds"></div>`);
    const clip = node(html`
      <div class="cal-clip"><div class="cal-slide"><div class="cal-grid"></div></div></div>
    `);
    sec.append(wds, clip);
    return {
      wds,
      clip,
      slide: clip.querySelector(".cal-slide"),
      grid: clip.querySelector(".cal-grid"),
    };
  }

  /** 伸びしろを測ります。**開いた姿**で測るので、呼ぶ前に窓を開けること。 */
  function metrics(cal, here) {
    const clip = cal.querySelector(".cal-clip");
    const slide = cal.querySelector(".cal-slide");
    const grid = cal.querySelector(".cal-grid");
    if (!clip || !slide || !grid) return null;
    const cells = [].slice.call(grid.querySelectorAll(".cal-day"));
    if (cells.length < 8) return null;
    const rowH = cells[7].offsetTop - cells[0].offsetTop;
    const cellH = cells[0].offsetHeight;
    const full = grid.offsetHeight;
    if (!(rowH > 0) || !(cellH > 0) || full <= cellH) return null;
    /* いま見ている日の週が、窓に来る週です。月をめくった先など、その日が
       この月に無いときは先頭の週にします。 */
    let idx = -1;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].dataset.day === here) { idx = i; break; }
    }
    /* 三段目（暦なし）へ縮めるには、日のマスだけでは足りません。曜日の行と
       暦そのものの上下の余白も一緒に畳まないと、消したはずの暦の場所に
       「日 月 火…」と余白だけが残ります。 */
    const wds = cal.querySelector(".cal-wds");
    const cs = window.getComputedStyle(cal);
    /* 背の高い月（やることの月の面・`.is-tall`）は、週のマスの高さが月より低い。週へ向かうぶん
       マスも縮める（`lo`＝週のときの高さ。画面が `data-row-lo` に置く）。 */
    const lo = cal.classList.contains("is-tall") ? Math.min(cellH, parseFloat(cal.dataset.rowLo) || cellH) : cellH;
    return {
      cal, clip, slide, grid, cellH, rowH, full, lo,
      rows: Math.max(1, Math.ceil(grid.querySelectorAll(":scope > .cal-day, :scope > .cal-pad").length / 7)),
      week: idx < 0 ? 0 : Math.floor(idx / 7),
      wds,
      wdsH: wds ? wds.offsetHeight : 0,
      padT: parseFloat(cs.paddingTop) || 0,
      padB: parseFloat(cs.paddingBottom) || 0,
    };
  }

  /** 月ぜんぶの背。k は背の高い月のマスの背（1＝高いまま、0＝ふつうの月の背。押して月の面へ出入りするとき、
      段は月のまま背だけが変わる——`glide`）。背の高い月でなければ k は効かない。 */
  const fullOf = (m, k) => m.full - m.rows * (m.cellH - m.lo) * (1 - k);

  /** その段のとき、暦は何px見えているか（上下の余白と曜日の行を含む）。 */
  function visibleH(m, p, k = 1) {
    if (p <= -1) return 0;
    const chrome = m.wdsH + m.padT + m.padB;
    const grid = p <= 0 ? m.lo : m.lo + (fullOf(m, k) - m.lo) * Math.min(1, p);
    /* 暦なし（-1）と週（0）のあいだは、暦ぜんぶが畳まれていきます。 */
    const keep = p < 0 ? 1 + p : 1;
    return (grid + chrome) * keep;
  }

  /** lo段から hi段までの、指の道のり（px）。**暦が伸び縮みする量そのもの**
      ＝ 紙が上下する量です。ここを別に決めると、指の下で紙が速すぎたり
      遅すぎたりします。 */

  /** -1（暦なし）〜0（週）〜1（月）のあいだの、途中の姿を描きます。

      書くのは**暦の高さ**だけ。紙はそのぶんだけ流れの中で下がり、紙の
      上端（丸角＋掴み手）は暦のすぐ下に来ます。掴み手の貼りつく床
      （--cal-h）も同じ数から出すので、送った先でも掴み手は暦の下辺に
      居ます。 */
  function paint(o, m, p, k = 1) {
    const open = p > 0 ? p : 0;          // 0〜1：週から月へ
    const keep = p < 0 ? 1 + p : 1;      // 1〜0：週から暦なしへ
    const grid = p <= 0 ? m.lo : m.lo + (fullOf(m, k) - m.lo) * Math.min(1, p);
    m.clip.style.height = (grid * keep).toFixed(1) + "px";
    // マスの高さは背の高い月のときだけ動かす（custom property ではなく直に——受け継ぐと中の全部が再計算）。
    /* 書くのは段ごとの背（grid-template-rows）。grid-auto-rows は滑らない（Chromium は補間せず、収まりはじめの一コマで
       行き先の背へ跳び、窓に別の週の下半分が映っていた）。段の数ぶん並べて書けば、同じ数どうしで滑る。 */
    const cell = m.lo + (m.cellH - m.lo) * k * open;
    if (m.lo < m.cellH) m.grid.style.gridTemplateRows = Array(m.rows).fill(cell.toFixed(1) + "px").join(" ");
    m.slide.style.transform = `translateY(${(-m.week * (cell + m.rowH - m.cellH) * (1 - open)).toFixed(1)}px)`;
    /* 三段目へ向かうぶんは、日のマスだけでは足りません——曜日の行と暦の
       上下の余白も一緒に畳まないと、消したはずの場所に「日 月 火…」と
       余白だけが残ります。 */
    if (m.wds) {
      m.wds.style.height = (m.wdsH * keep).toFixed(1) + "px";
      m.wds.style.opacity = keep.toFixed(3);
    }
    m.cal.style.paddingTop = (m.padT * keep).toFixed(1) + "px";
    m.cal.style.paddingBottom = (m.padB * keep).toFixed(1) + "px";
    /* ---- 毎フレームの数は、**読む相手そのもの**へ書きます ----

       ふだん（止まっているとき）この二つを持っているのは画面の根っこで、
       それでかまいません——書くのは組み直しのときだけなので。**引いて
       いるあいだは違います。** カスタムプロパティは継承するので、根っこに
       毎フレーム書くと、読む相手が何個であろうと**画面ぜんぶ**（やることで
       575要素）の style を計算し直します。実測（2026年9月20日・CPU 4倍）：
       引いているあいだの style 再計算が **64回で 1385ms**（1回 22ms）、
       81フレーム中 **22落ち**。レイアウトは 48回で 116ms しかないので、
       重かったのは**測ることではなく、配ること**のほうでした。

       読む相手は、実際には二つだけです：
         --cal-p … `.cal.is-peek .cal-day.is-off-week`（暦の中だけ）
         --cal-h … `.tl-grip`（**一つの要素だけ**）
       だから引いているあいだは、そこへ直に書きます。指を離したら `bare`
       が剥がして、ふだんの数（根っこ）へ返します——**根っこの値には
       一度も触れません**ので、剥がした瞬間に正しい姿へ戻ります。 */
    if (m.cal) {
      /* 画面へ渡すのは 0〜1 だけ。負の側は「暦が消えていく」ことで、
         「どれだけ開いているか」ではありません。 */
      m.cal.style.setProperty("--cal-p", open.toFixed(3));
    }
    /* 掴み手の床。**毎フレーム、暦の高さと同じ数**を書きます——これが
       無いと、送った先で掴み手だけが暦に潜ります（ダイエットは暦の
       厚みを誰も測っていないので、まるごと88px 潜っていました）。 */
    if (m.grip) m.grip.style.setProperty("--cal-h", visibleH(m, p, k).toFixed(1) + "px");
  }

  /** 指の下で書いた寸法を、ぜんぶ剥がします。 */
  function bare(o, m) {
    if (!m) return;
    m.clip.style.height = "";
    m.slide.style.transform = "";
    m.grid.style.gridTemplateRows = "";
    if (m.wds) { m.wds.style.height = ""; m.wds.style.opacity = ""; }
    m.cal.style.paddingTop = "";
    m.cal.style.paddingBottom = "";
    /* 指の下で書いたぶんを剥がすと、二つとも**根っこの値**（ふだんの数）が
       そのまま見えます——引いているあいだ、根っこには一度も書いていないので。
       このあと画面が組み直せば、そちらの fitCalH が新しい値を書きます。 */
    m.cal.style.removeProperty("--cal-p");
    if (m.grip) m.grip.style.removeProperty("--cal-h");
  }

  function end(o) {
    const cal = o.cal();
    if (cal) cal.classList.remove("is-peek", "is-settling");
    if (o.root) o.root.classList.remove("is-cal-peek");
  }

  /** 引きはじめ。隠していた週をぜんぶ出してから測ります。p・k は描きはじめる姿（既定はいまの段。
      押して替えるときは、書いたあとの暦に元の姿を描く——`glide`）。 */
  function begin(o, p, k = 1) {
    const cal = o.cal();
    if (!cal) return null;
    /* 送ってあるぶんを覚えておきます。**この先で暦がいったん月の高さまで
       伸びるので**（隠していた週を出して測るため）、ブラウザが「読んで
       いた場所」を追いかけて画面ごと送ってしまいます——実測で、下まで
       送った先から引くと 196px（＝伸びたぶん）跳ねていました。測り終えて
       正しい高さを書いたら、ここへ戻します。 */
    const sc0 = o.root ? KN.app.scrollerOf(o.root) : null;
    const scroll0 = sc0 ? sc0.scrollTop : 0;
    /* ふだんから貼りついている暦か（やること・daily）、そうでないか
       （ダイエット）。引いているあいだは css がどちらも貼りつけるので、
       印を付ける**前に**見ること。 */
    const stuck = window.getComputedStyle(cal).position === "sticky";
    cal.classList.remove("is-settling");
    cal.classList.add("is-peek");
    if (o.root) o.root.classList.add("is-cal-peek");
    /* 選ばれている字を放します。マウスで引くと紙の上の字が選ばれ、次に
       その上から引いたときブラウザが「選んだ字を運ぶ」ほうの手つきだと
       判断して、こちらの指を取り上げます（pointercancel）。 */
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
    /* 月から週へ戻すときも、いまの週の外に印を付けておきます。同じ CSS が
       濃さと隣の月の日を見ているので、行き（週→月）と帰り（月→週）で
       見え方が違わないように。 */
    o.tagOffWeek(cal, o.here());
    const m = metrics(cal, o.here());
    if (!m) { end(o); return null; }
    m.stuck = stuck;
    m.scroll = scroll0;
    /* 床（`--cal-h`）を読むのは掴み手ひとつだけなので、引いているあいだは
       そこへ直に書きます（`paint` の節）。掴み手は組み直しのたびに別の
       要素になるので、掴んだこの時点で見つけておくこと。 */
    m.grip = null;   // 取っ手は帯の盆に居て貼りつかない（前は紙の頭に貼りつく掴み手の床 --cal-h を毎フレーム書いた）
    paint(o, m, p === undefined ? at(o) : p, k);
    /* 測るあいだに伸びたぶんを、ブラウザが追いかけていたら戻します。 */
    if (sc0) { void o.root.offsetHeight; sc0.scrollTop = scroll0; }
    return m;
  }

  /** いまの段。-1＝暦なし、0＝週、1＝月。 */
  const at = (o) => (!o.isShown() ? -1 : (o.isOpen() ? 1 : 0));

  /** 指を離したあと。行き先まで滑らせて**から**、はじめて設定に書きます。
      先に書くと暦が組み直されて、途中の姿から跳んでしまいます。 */
  function settle(o, m, to, fling, k = 1) {
    const cal = o.cal();
    if (!cal || !m) return;
    const done = () => {
      end(o);
      bare(o, m);
      /* 押して替えたときは、もう書いてある段を言う（滑っているあいだに続けて押されていたら、行き先は古い）。 */
      const now = m.press ? at(o) : to;
      o.commit({ shown: now >= 0, open: now > 0 });
      /* 剥がして組み直したところで、また「読んでいた場所」が働きます。
         収まった姿は指の下の姿と同じ寸法なので、送りは引く前のまま。

         **ふだん貼りつかない暦（ダイエット）で、開くほうへ収めたときだけ
         上まで戻します。** あちらの暦は紙の頭に印刷してあるものなので、
         送った先では画面の外に居ます——せっかく開いた月が、指を離した
         とたんに見えなくなるので。畳むほうへ収めたときは、読んでいた
         ところに居させます。

         押して替えたとき（`glide`）は触りません。組み直しはもう済んでいて、送り先は画面が決めた
         ところ（面の頭・過ぎた日を隠したところ・押した日の行へ滑らせている最中）なので。 */
      if (o.root && !m.press) KN.app.scrollerOf(o.root).scrollTop = (!m.stuck && to > m.from) ? 0 : m.scroll;
    };
    if (m.from === undefined) m.from = at(o);
    if (KN.motion.still()) { done(); return; }

    /* **長さと曲線は、残りの道のりと指の勢いから**（`KN.motion.glide`）。

       ここは決まった長さ（`--m-grow`）でした。だから**ゆっくり引いても
       勢いよく弾いても、収まるまでの時間が同じ**で、指の動きと絵が
       そこで切れていました——day-swipe・cal-swipe・edge-back・紙の面は
       もう glide を通っているのに、ここだけ残っていた、というだけです。

       数は `--cal-ms` / `--cal-ease` に置いて、**transition の宣言は
       CSS のまま**にします（どこがどう動くかは CSS が持つ、という決めごと。
       読めなければ `--m-grow` に落ちます）。 */
    /* 押して替えたとき（`glide`）は指の勢いが無いので、勢い 0 の滑り（止まったところから動き出して、静かに着く）。
       長さは `--m-grow`。`--ease-out` のまま（出だしがいちばん速い曲線）だと、最初の一コマで 220px 跳び、押した
       ところが「パッと」開いて見えた。道のりは書いたあとの背の差（段が同じでも背だけ変わることがある）。 */
    const sp = m.press ? Math.max(1, Math.abs(m.dist)) : (fling && fling.span) || 1;
    const from = (fling && typeof fling.from === "number") ? fling.from : m.from;
    const g = m.press ? KN.motion.glide(m.dist, 0, { span: sp, base: KN.motion.ms("--m-grow") })
      : KN.motion.glide((to - from) * sp, (fling && fling.v) || 0, { span: sp });
    cal.style.setProperty("--cal-ms", g.ms + "ms");
    cal.style.setProperty("--cal-ease", g.ease);
    const ms = g.ms;

    cal.classList.add("is-settling");
    if (o.root) o.root.classList.remove("is-cal-peek");   // ここからは滑らせます
    paint(o, m, to, k);
    let over = false;
    const fin = (e) => {
      if (over || (e && e.target !== m.clip)) return;
      /* 収まる途中で指が掴み直した（`begin` が is-settling を外した）。あとはその指のもの——剥がさない。 */
      if (!cal.classList.contains("is-settling")) {
        over = true;
        clearTimeout(tm);
        m.clip.removeEventListener("transitionend", fin);
        return;
      }
      over = true;
      clearTimeout(tm);
      m.clip.removeEventListener("transitionend", fin);
      cal.style.removeProperty("--cal-ms");
      cal.style.removeProperty("--cal-ease");
      done();
    };
    m.clip.addEventListener("transitionend", fin);
    /* 保険の時計も、glide が決めた長さに合わせます（決め打ちの 420ms が
       残っていると、短い滑りのあとに長く待つことになります）。 */
    const tm = setTimeout(fin, ms + 120);
  }

  /**
   * 押して段を替えます（題を押す・面の札・月の段の日）。指を離したあとと同じ滑りで、いまの姿から
   * 行き先まで。`write()` が行き先を書いて組み直します（その場で済むこと）。
   *
   * **先に書きます。** 押した札も紙の中身もその場で替わり、暦だけが元の姿から滑ります——あとで
   * 書くと、滑り終えるまで札も中身も替わらず、押しても何も起きないように見えます。前は書くだけで、
   * 暦が一拍で行き先へ跳んでいました（やることの「月」で 93px→506px、紙が 413px 跳ぶ）。
   * 組み直した暦を測って元の姿を描き直し、そこから行き先へ滑らせます。
   *
   * **背の高い月から出るときは、組み直すあいだ今の姿を留めます**（`is-peek`。画面の組み直しは
   * 引いているあいだマスの背に触らない）。留めないと組み直しが先にマスを縮め、縮んだところから
   * 滑ることになります。背は k（1＝背の高い月、0＝ふつう）で、段は月のまま背だけが変わることもある。
   * 背の高い月かどうかは書いたあと `o.tall()` に訊きます（留めているあいだ、印は前のままなので）。
   *
   * 動きを減らす設定、暦が見つからないとき、指が暦を持っているとき（引いている・収まる途中）は、書くだけ。
   * `o` は `wire` と同じもの。`o.sheet` は書いたあとに読む（組み直すと紙が替わるので、取り出す口にしておく）。
   */
  function glide(o, write) {
    const cal0 = o.cal();
    if (!cal0 || KN.motion.still() || cal0.classList.contains("is-peek") || cal0.classList.contains("is-settling")) {
      write();
      return;
    }
    const a = { p: at(o), k: cal0.classList.contains("is-tall") ? 1 : 0 };
    if (a.k) cal0.classList.add("is-peek");
    try { write(); } catch (err) { cal0.classList.remove("is-peek"); throw err; }
    if (a.k && o.cal() !== cal0) cal0.classList.remove("is-peek");
    const cal = o.cal();
    const b = { p: at(o), k: (o.tall ? o.tall() : !!cal && cal.classList.contains("is-tall")) ? 1 : 0 };
    /* 姿が変わらないなら滑らせない（週どうし・暦なしどうしは背の違いが出ない）。留めていたなら放して、
       組み直しが黙っていたぶん（背の高い月の背・輪・床）を画面に置き直させる。 */
    const same = a.p === b.p && (a.k === b.k || a.p <= 0);
    if (!cal || same) {
      if (cal && cal.classList.contains("is-peek")) { end(o); o.commit({ shown: b.p >= 0, open: b.p > 0 }); }
      return;
    }
    const m = begin(o, a.p, a.k);
    if (!m) { o.commit({ shown: b.p >= 0, open: b.p > 0 }); return; }
    m.from = a.p;
    m.press = true;
    m.dist = visibleH(m, b.p, b.k) - visibleH(m, a.p, a.k);
    if (o.root && m.dist > 0) pin(o, m);
    /* **滑り出すのは次の一拍から。** 組み直しの重い一拍（やることで約40ms）のうちに滑りを始めると、その時計は
       描く前から進んでいて、最初に描かれる一コマで、もう半分近く開いていた（実測 44%）。元の姿を一コマ描いてから。 */
    requestAnimationFrame(() => {
      /* その一コマのうちに段がまた替わった（続けて押した）なら、滑らせずに放して、いまの段へ置き直させる。 */
      if (at(o) !== b.p || o.cal() !== cal) { end(o); bare(o, m); o.commit({ shown: at(o) >= 0, open: at(o) > 0 }); return; }
      settle(o, m, b.p, null, b.k);
    });
  }

  /** 暦が伸びるあいだ、紙の送りを書いた所に留めます。元の姿（暦が低い）のあいだは紙が長く、送りの先が
      足りないので、ブラウザが送りを縮めます——月の面で過ぎた日を隠した送りが 0 に戻り、伸びきってから
      読む場所がずれていました。伸びるにつれて送れる先が増えるので、毎コマ書き直せば紙は書いた所へ寄っていく。
      指が紙に触れたら、その指に譲ります。 */
  function pin(o, m) {
    const sc = KN.app.scrollerOf(o.root);
    const want = m.scroll;
    let on = true;
    const stop = () => { on = false; };
    const off = () => { sc.removeEventListener("pointerdown", stop); sc.removeEventListener("wheel", stop); };
    sc.addEventListener("pointerdown", stop, { passive: true });
    sc.addEventListener("wheel", stop, { passive: true });
    const tick = () => {
      if (!on || !m.cal.isConnected || !m.cal.classList.contains("is-peek")) { off(); return; }   // 収まった（done が外す）
      if (Math.abs(sc.scrollTop - want) > 0.5) sc.scrollTop = want;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  KN.calPeek = { mount, glide };
})();
