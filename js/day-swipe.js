/* =========================================================
   くらしノート — 紙を横に払って、日を送る

   やること・daily・ダイエットの三つは、どれも**一日ぶんの紙**を出して
   います。隣の日へ行く道は暦にもありますが、「昨日はどうだったか」を見る
   のに毎回上まで戻るのは遠い。紙そのものを払えば、日が動きます。左へ
   払えば次の日、右へ払えば前の日——紙をめくる向きと同じです。

   ここは、その手つきだけを持ちます。**三画面で分け合う一つの仕掛け**です
   ——書き写すと、片方だけを直した日に三つの紙が違う動きをします。画面が
   答えるのは四つだけ：いま見ている日は何か（`day`）、その隣はどこか
   （`step`）、その日の紙をどう組むか（`slide`）、行き先が決まったら何を
   するか（`commit`）。

   買うもの（2026年9月28日から）は四つめの使い手です。あの紙は日で
   中身が変わらないので `slide` を渡しません——紙は指に少しついて戻る
   だけで、動くのは題と暦の日です（下の「隣の紙を持たない画面」）。

   ■ 受け口は紙ぜんぶ（`surface`）

   指を受けていたのは、中身を入れた器（`.day-car`）だけでした。器は
   中身の高さしかないので、**長期タスクの下の空白は器の外**——そこで
   払っても何も起きませんでした（利用者の報告、2026年9月28日）。いまは
   画面が紙（`.tl-sheet`）を `surface` に渡し、紙のどこから払っても
   日が動きます。器（`viewport`）は幅を測る相手のまま。

   ■ 動くのは紙そのもの

   要約でも、色の付いた帯でもありません。**本物の紙**が、指のぶんだけ
   連続して入ってきます。だから止まった瞬間もいちばん払っている最中も、
   同じ中身が見えます。

   ■ 隣の紙は、**指が触れる前に、DOM の外で**組んでおく

   組み直しが済んで**暇になった拍**（`requestIdleCallback`）に、隣の
   二枚を一枚ずつ組んで控えておきます（控え＝`ready`）。払いはじめの
   237ms の長タスク（2026年9月20日・CPU 4倍）の正体は、横だと決まった
   瞬間にその場で二日ぶんを組んでいたことでした。

   **「ふだんの DOM には、今日の紙しか居ません」は、そのままです**
   ——控えは `document` に繋がっていないので、`.tl-list` や `.tl-now` の
   ような「一枚しか無いはず」を探している側は、一枚も掴めません。

   ■ 差し込む瞬間の重さ（2026年9月28日に測り直した）

   組むのを先に済ませても、**画面に置くこと**の費用は残ります。実測
   （CPU 4倍）：横だと決まった一拍で 67ms（スタイル 28・レイアウト 30・
   描画 26 前後）。紙は 274 要素しかなく、費用のほとんどは紙そのものの
   文字組みでした。試して**効かなかった**もの（どれも誤差の内）：
   - 隣を絶対配置にして、器の高さを変えない
   - 器の `overflow` を `clip` に
   - 指が置かれた瞬間（pointerdown）に両側を差し込む——**逆に重くなる**
     （両側ぶんに加えて、ほかの touchstart が読む位置でレイアウトが強制
     され、230ms。押しただけの指にも毎回かかる）
   効いたのは一つだけ：**器の中身を、いつも合成レイヤーにしておく**
   （`.day-track { will-change: transform }`）。掴むたびに昇格・離すたびに
   降格して、そのつど紙ぜんぶを描き直していたぶんが消えます（描画
   35〜51ms → 18ms）。払い終わりの降格の描き直しも一緒に消えます。

   ■ 払い終わりに、画面を組み直さない

   滑りきった一枚を**真ん中に据えて**（`adopt`）、その紙そのものを
   `commit` の二つめとして渡します。画面の側は、**変わったものだけ**を
   塗り直せば済みます——日付の題と、暦の輪と、「いま」の線。

   据えたあと、**さっきまでの真ん中はそのまま控えに回します**（新しい日の
   反対側の隣なので）。その先の一枚は、指を離して滑っているあいだに
   組みます（`prebuild`。滑りは合成で走るので、JS が働いていても紙は
   止まりません）。続けて二度払っても、二度めの指はもう差し込むだけです。

   ■ 滑っている最中に、もう一度払える

   行き先へ滑っている途中に触って払い直すと、**そこへ着いたことにして**
   続きをそこから始めます。前は元の日の隣しか居なかったので、二度続けて
   払っても一日しか進みませんでした（二度めの指は、滑っていた一枚を
   押し戻すだけだった）。

   ■ 向きの決め方——縦は下に譲るが、早まって手放さない

   横は `AXIS_X`（6px）動いて、横が縦の `SLANT`（0.7）倍あれば横です
   ——水平から55°まで。前は 5px の時点で向きを決めきっていたので、親指が
   着地で少し縦に転がっただけで「縦」と決まり、そのあと横へ払っても
   取りませんでした。いまは縦と決めるのは `AXIS_Y`（10px）動いてから。
   それまでに本当に縦なら、ブラウザが送りを始めて pointercancel を
   よこすので、こちらが決める必要もありません。

   横と決めたら、`touchmove` を止めます（`preventDefault`）。止められるのは
   pointermove ではなく touchmove のほうで、止めないと斜めの払いの途中で
   ブラウザが縦の送りを始めて、指を取り上げます（cal-peek と同じ話）。

   ■ 行くか戻るかは、離す前の動きで

   速さは最後の二点ではなく、離す前の `VEL_MS`（90ms）の動きから測ります。
   最後の一回の動きは小さく揺れやすく、勢いよく払ったのに「遅い」と読まれて
   戻されることがありました。止まってから離した指の速さは 0。
   速く払っていれば、短くても行きます。**払った向きが、引いてきた向きと
   逆なら戻ります**（引いてから引き返した）。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const AXIS_X    = 6;    // 横にこれだけ動いて、横が勝っていれば横
  const AXIS_Y    = 10;   // 縦にこれだけ動いて、縦が勝っていれば縦（手放す）
  const SLANT     = 0.7;  // 横が縦のこの倍あれば横（水平から55°まで）
  const COMMIT    = 26;   // これだけ動けば、指を離したときに隣へ
  const FLING_V   = 0.3;  // 短い距離でも、これだけ速ければ隣へ（px/ms）
  const FLING_MIN = 8;    // ただし、まったく動いていないものは払いではない
  const VEL_MS    = 90;   // 速さは、離す前のこの長さの動きから測る
  const NUDGE     = 44;   // 隣の紙を持たない画面で、紙が指につく上限（px）
  /* 離したあとの滑りは、**残りの道のりと指の勢いから**出します
     （`KN.motion.glide`）。 */

  /** ゴム（`KN.motion.rubber`）の逆。滑って戻っている紙を掴み直したとき、
      いまの位置から指の続きを出すために。 */
  const unrubber = (y, lim) => {
    const a = Math.min(Math.abs(y), lim * 0.95);
    return Math.sign(y) * (lim * a) / (lim - a);
  };

  /**
   * @param {object} o
   * @param {Element} o.viewport  溢れたぶんを隠す外枠（.day-car）。幅を測る相手
   * @param {Element} o.track     横一列に並べる中身（.day-track）。中には
   *                              いま見ている日の紙が一枚だけ入っています。
   *                              隣の紙を持たない画面では、指につく中身。
   * @param {Element} [o.surface] 指を受けるところ（既定は viewport）。紙ぜんぶを
   *                              渡すと、中身の下の空白からも払えます。
   * @param {string}  [o.ignore]  ここから始まった指は取りません（行ごとの払いを
   *                              持つもの、など）
   * @param {Function} o.day      () => いま見ている日のキー
   * @param {Function} o.step     (day, dir) => 隣の日のキー。行けないなら null
   * @param {Function} [o.slide]  (day) => その日の紙（隣を組むために呼びます）。
   *                              渡さなければ、紙は指に少しついて戻るだけ。
   * @param {Function} o.commit   (day, kept) => 行き先が決まった。`kept` は
   *                              **滑りきってそこに居る紙そのもの**です
   *                              （真ん中に据えてあります）。受け取った側は
   *                              組み直さずに、変わったものだけを塗ること。
   *                              渡されなかったときだけ、組み直してかまいません。
   * @param {boolean} [o.recycle] false なら、据えたあとの控えの回し直しと
   *                              先組みをしません（着いてから画面ごと組み直す
   *                              ダイエット）
   * @param {Function} [o.busy]   () => true なら、この指は取りません
   * @param {Function} [o.lock]   (bool) 掴んでいるあいだ、組み直しを止める
   * @returns {{warm:Function, drop:Function}} 控えの組み直し口。画面の側が
   *          「中身が変わった」と知っているときに `drop()` を呼べます。
   */
  function wire(o) {
    const viewport = o.viewport, track = o.track;
    const surface = o.surface || viewport;
    if (!viewport || !track || !surface) return { warm() {}, drop() {} };
    /* 隣の紙を持たない画面（買うもの）。紙は指に少しついて戻るだけ。 */
    const nudge = typeof o.slide !== "function";
    const recycle = !nudge && o.recycle !== false;

    let id = null, x0 = 0, y0 = 0, dx = 0, mx = 0, axis = null, frame = 0, pageW = 0;
    /* 指の通り道 [時刻, x]。速さは、離す前の VEL_MS ぶんから測ります。 */
    let trail = [];
    let peeks = null;
    /* 真ん中の紙が画面いっぱいに見える transform。差し込んだ枚数で変わり
       ます——前に一枚増えれば、真ん中はそのぶん左へ下がるので。 */
    let originX = 0;
    /* 滑っている最中に掴み直されたら、走っている settle の後始末を
       黙らせるための番号。増やすだけで、古いほうは何もせずに終わります。 */
    let gen = 0;
    /* 指を離して滑っている最中の行き先（{which, key}）。掴み直したとき、
       行き先に着いたことにするかどうかをここで見ます。 */
    let settling = null;
    /* 滑っているあいだに組んだ、その先の一枚（{day, el}）。 */
    let pre = null;

    /* transform だけを書き換えます（レイアウトに触れる幅・高さ・位置は
       一切読み書きしません）。frame は rAF の間引き用です。 */
    const paint = () => {
      frame = 0;
      track.style.transform = `translate3d(${originX + dx}px,0,0)`;
    };

    /** 覗き見の一枚にします。

        **`inert` も `pointer-events: none` も付けません**（2026年9月28日）。
        どちらも子へ継がれる性質なので、据えるときに外すと**紙ぜんぶの
        スタイルを計算し直し**ます——滑り終えた一拍の重さの半分ちかくが
        これでした（実測・CPU 4倍：据える一拍 29〜38ms → 22ms、うち
        スタイル計算 16〜20ms → 3〜6ms）。覗き見の紙が DOM に居るのは
        払っている最中だけで、そのあいだ指は外枠が捕まえています。滑って
        いる途中に覗き見の紙を押した click だけは、下の `click` の見張りが
        止めます。
        画面が自分で付けた `inert`（daily の先の日・ダイエットの覗き見）には
        触れません——据えたときに外すと、見るだけの紙に書き込めてしまう。 */
    function asPeek(el) {
      el.classList.add("day-slide", "is-peek");
      return el;
    }

    /** 隣の一枚。行けない側は**差し込みません**——動くのは transform だけ
        なので、何も置かなくても指のぶんだけ地が覗くだけです。 */
    const slideFor = (key) => {
      const el = key ? o.slide(key) : null;
      return el ? asPeek(el) : null;
    };

    /* ---------------- 控え（DOM の外で組んでおく二枚） ----------------

       `ready` は `{day, back, fwd}`。`day` は**どの日の隣として組んだか**で、
       いま見ている日と食い違っていたら使いません（暦から日を選んだときなど、
       組み直しを経ずに日が動く道があるので）。`undefined` はまだ組んでいない、
       `null` は組もうとしたが行き先が無い、の意味です。

       組むのは暇な拍だけ、**一度に一枚**。二枚まとめて組むと、暇な時間を
       230ms ぶん占領して、そこへ飛んできた指を待たせることになります。 */
    let ready = null, idle = 0;

    const ric = window.requestIdleCallback
      || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 120));
    const cic = window.cancelIdleCallback || clearTimeout;

    function drop() {
      if (idle) { cic(idle); idle = 0; }
      ready = null;
    }

    /** 暇になったら、隣の一枚を組む。二枚そろうまで自分を呼び直します。 */
    function warm() {
      if (nudge || idle || peeks) return;
      const day = o.day();
      if (ready && ready.day !== day) ready = null;
      if (ready && ready.back !== undefined && ready.fwd !== undefined) return;
      idle = ric(() => {
        idle = 0;
        /* 指が乗っているあいだ・運んでいる最中は組みません。組んでいる
           数十msは何があっても止められないので、待つほうが安全です。 */
        if (id !== null || peeks || (o.busy && o.busy())) return;
        const now = o.day();
        if (!ready || ready.day !== now) ready = { day: now };
        if (ready.back === undefined) ready.back = slideFor(o.step(now, -1));
        else if (ready.fwd === undefined) ready.fwd = slideFor(o.step(now, 1));
        warm();                      // もう一枚あるなら、次の暇な拍で
      }, { timeout: 2000 });
    }

    const hasReady = (side, day) => !!ready && ready.day === day && ready[side] !== undefined;

    /** 控えから一枚取り出します。控えが無ければ、その場で組みます。 */
    function take(side, day) {
      if (hasReady(side, day)) {
        const el = ready[side];
        ready[side] = undefined;
        return el;
      }
      return slideFor(o.step(day, side === "back" ? -1 : 1));
    }

    /**
     * その向きの一枚を差し込みます。
     *
     * 前に一枚増えると真ん中の居場所がずれるので、`originX` を同じ拍で
     * 直して描き直すこと——直さないと、指の下で紙が一枚ぶん跳びます。
     *
     * @param {number} dir -1 ＝ 前の日（指は右へ）／+1 ＝ 次の日
     */
    function mountSide(dir) {
      const side = dir < 0 ? "back" : "fwd";
      /* 指が動くたびに呼ばれます。もう済んでいる側なら、何もしないこと
         ——ここで毎回 paint すると、rAF の間引きの外で transform を書く
         ことになります。 */
      if (peeks && peeks[side] !== null) return;
      const day = o.day();
      if (!peeks) {
        const center = track.firstElementChild;
        if (!center) return;
        center.classList.add("day-slide");
        peeks = { center, back: null, fwd: null };
        /* 合成レイヤーは CSS がいつも持たせています（頭の「差し込む瞬間の
           重さ」）。この印は「いま並べている」を言うだけです。 */
        track.classList.add("is-dragging");
      }
      const el = take(side, day);
      /* 行けない向きには何も置きません。`null` ではなく `false` を入れて
         「もう調べた」と覚えます——毎回 `o.step` を呼び直さないために。 */
      peeks[side] = el || false;
      if (el) {
        if (side === "back") {
          track.insertBefore(el, peeks.center);
          originX -= pageW;      // 前に一枚。真ん中はそのぶん左へ下がる
        } else {
          track.append(el);
        }
      }
      // 並べた直後に、同じ拍で位置を書きます（一拍も見せません）。
      paint();
    }

    function unmount() {
      if (peeks) {
        /* 外した二枚は、そのまま控えに返します——中身も日も変わって
           いないので、組み直す理由がありません。 */
        const day = o.day();
        if (peeks.back || peeks.fwd) {
          if (!ready || ready.day !== day) ready = { day };
          if (peeks.back) { peeks.back.remove(); ready.back = peeks.back; }
          if (peeks.fwd) { peeks.fwd.remove(); ready.fwd = peeks.fwd; }
        }
        peeks = null;
      }
      originX = 0;
      track.style.transition = "";
      track.style.transform = "";
      track.classList.remove("is-dragging");
    }

    /** その一枚が画面いっぱいに見える transform。真ん中を基準に、前の日は
        一枚ぶん右、次の日は一枚ぶん左。 */
    const xOf = (which) => originX
      + (which === "back" ? pageW : which === "fwd" ? -pageW : 0);

    /** 滑りきった一枚を、**真ん中に据える**。組み直しません。

        いま `xOf(which)` のところに居て、その一枚が画面いっぱいに見えて
        います。ほかを外して transform を素に戻すと、残った一枚は**同じ
        位置のまま**ただ一枚の中身になります——この付け替えは一拍の中で
        済むので、途中の姿は描かれません。

        さっきまでの真ん中は、新しい日の反対側の隣として控えに回します
        （捨てて、あとで同じものを組み直さないために）。

        @returns {Element|null} 据えた紙。渡す先は `commit` の二つめ。 */
    function adopt(which, key) {
      const keep = peeks && peeks[which];
      if (!keep) { unmount(); return null; }
      const old = peeks.center, oldDay = o.day();
      Array.prototype.slice.call(track.children).forEach((el) => {
        if (el !== keep) el.remove();
      });
      /* 覗き見の一枚ではなく、**いま見ている紙**になります（`inert` は
         もともと付けていません。画面が付けたものはそのまま）。 */
      keep.classList.remove("is-peek");
      peeks = null;
      originX = 0;
      track.style.transition = "";
      track.style.transform = "";
      track.classList.remove("is-dragging");
      if (recycle && key) {
        if (idle) { cic(idle); idle = 0; }
        ready = { day: key };
        /* 次の日へ行ったなら、さっきまでの日は「前」の隣。念のため、
           画面の `step` がそう答えるときだけ回します。 */
        const toFwd = which === "fwd";
        if (old && old !== keep && o.step(key, toFwd ? -1 : 1) === oldDay) {
          ready[toFwd ? "back" : "fwd"] = asPeek(old);
        }
        if (pre && pre.day === key) ready[which] = pre.el;
      }
      pre = null;
      return keep;
    }

    /** 滑っているあいだに、その先の一枚を組んでおきます。滑りそのものは
        合成で走るので、ここで JS が数十ms働いても紙は止まりません。
        始めるのは滑りの最初のフレームが出てから（同じ拍で組むと、
        その一拍ぶん出だしが遅れます）。 */
    function prebuild(key, which) {
      if (!recycle) return;
      const mine = gen;
      requestAnimationFrame(() => setTimeout(() => {
        if (mine !== gen || !settling || settling.key !== key) return;
        pre = { day: key, el: slideFor(o.step(key, which === "back" ? -1 : 1)) };
      }, 0));
    }

    /** いま track が本当に居るところ（px）。滑っている最中でも取れるので、
        掴み直しの起点になります。transform が無ければ、いまの dx から。 */
    function liveX() {
      try {
        const t = getComputedStyle(track).transform;
        if (t && t !== "none") return new DOMMatrixReadOnly(t).m41;
      } catch (_) { /* 読めなければ、控えのほうで */ }
      return originX + dx;
    }

    /** どれを画面いっぱいに見せて止まるか（"back" / "center" / "fwd"）。
        @returns {Promise<boolean>} false ＝ 途中で掴み直された（何もしないこと） */
    const settle = (which, v) => new Promise((resolve) => {
      if (!peeks) { resolve(true); return; }
      const mine = ++gen;
      const to = xOf(which);
      const from = liveX();
      /* 残りの道のりと、離したときの指の速さから。近くで離せば短く、
         勢いよく払えばその速さのまま走り出して静かに着きます。 */
      const g = KN.motion.glide(to - from, v, { span: pageW });
      track.style.transition = g.ms ? `transform ${g.ms}ms ${g.ease}` : "";
      track.style.transform = `translate3d(${to}px,0,0)`;
      setTimeout(() => {
        if (mine !== gen) { resolve(false); return; }
        track.style.transition = "";
        resolve(true);
      }, g.ms);
    });

    /** 戻ってきた。差し込んだぶんを片づけて、素の状態に返します
        （`unmount` が控えへ返すので、次に払うときはまた差し込むだけ）。 */
    const back = (v) => {
      settling = { which: "center" };
      return settle("center", v).then((done) => {
        if (!done) return;   // 滑っている途中で掴み直された。向こうの指のもの。
        settling = null;
        unmount();
        if (o.lock) o.lock(false);
        warm();              // 片側しか組んでいなければ、残りを暇な拍で
      });
    };

    /** 隣の紙を持たない画面で、指についた紙を元の場所へ返します。 */
    function home(v) {
      const mine = ++gen;
      settling = { which: "center" };
      const from = liveX();
      const g = KN.motion.glide(-from, v, { span: NUDGE * 2 });
      track.style.transition = g.ms ? `transform ${g.ms}ms ${g.ease}` : "";
      track.style.transform = "translate3d(0,0,0)";
      setTimeout(() => {
        if (mine !== gen) return;
        settling = null;
        track.style.transition = "";
        track.style.transform = "";
        track.style.willChange = "";
        if (o.lock) o.lock(false);
      }, g.ms);
    }

    /** この指からは手を引きます（縦だった・運びはじめた）。 */
    function letGo() {
      id = null; axis = null;
    }

    /** 滑っている最中に、横だと決まった指。 */
    function regrab(e) {
      gen++;                                 // 走っている後始末を黙らせる
      const cur = liveX();
      track.style.transition = "";
      const s = settling;
      settling = null;
      if (nudge) {
        const base = unrubber(cur, NUDGE);
        x0 = e.clientX - base;
        mx = base;
        return;
      }
      if (s.which !== "center" && peeks && peeks[s.which]) {
        /* 行き先へ滑っている途中。**そこへ着いたことにして**、続きをそこから
           始めます。据えた紙は、いま見えている位置（`off`）にそのまま置く
           ——transform を素に戻す `adopt` と、ここで書き直すのは同じ拍の中
           なので、途中の姿は描かれません。 */
        const off = cur - xOf(s.which);
        const kept = adopt(s.which, s.key);
        /* 画面は、掴んでいるあいだ組み直しを止めています。月をまたいだ
           ときのように組み直しの要る着き方もあるので、渡すあいだだけ外す。 */
        if (o.lock) o.lock(false);
        o.commit(s.key, kept);
        if (!track.isConnected) { id = null; axis = null; return; }  // 組み直された
        if (o.lock) o.lock(true);
        track.style.transform = `translate3d(${off}px,0,0)`;
        dx = off;
        x0 = e.clientX - off;
        mx = off;
        mountSide(off > 0 ? -1 : 1);
        return;
      }
      /* 真ん中へ戻っている途中。いま居るところを起点にします——ここを 0 から
         始めると、紙が真ん中へ跳びます。 */
      x0 = e.clientX - (cur - originX);  // 以後の mx が、そのまま続きの dx
      mx = e.clientX - x0;               // この一回ぶんも、引き直す
    }

    /** 離す前の VEL_MS ぶんの動きから、指の速さ（px/ms）。

        置いた点（`trail[0]`）は、動きが一つしか無いときだけ使います——
        置いてから少し留まって弾いた指で、留まっていた時間まで割ると、
        速く払ったのに遅いと読まれるので。

        時刻は**事象そのものの時刻**（`e.timeStamp`）。受け取った時刻
        （performance.now()）で測ると、紙を差し込んでいた数十msのあいだに
        溜まった動きがまとめて届いたとき、速さが実際と違って読まれます。

        @param {number} at 離した時刻（pointerup の timeStamp） */
    function velocity(at) {
      const last = trail[trail.length - 1];
      if (trail.length < 2 || at - last[0] > VEL_MS) return 0;   // 止まってから離した
      const lo = trail.length > 2 ? 1 : 0;
      let first = trail[trail.length - 2];
      for (let i = trail.length - 2; i >= lo; i--) {
        if (last[0] - trail[i][0] > VEL_MS) break;
        first = trail[i];
      }
      const dt = last[0] - first[0];
      return dt > 0 ? (last[1] - first[1]) / dt : 0;
    }

    surface.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (o.busy && o.busy()) return;
      // 中の書ける欄は、書けるままにします。
      if (e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (o.ignore && e.target.closest(o.ignore)) return;
      pageW = viewport.getBoundingClientRect().width;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; mx = 0; axis = null;
      trail = [[e.timeStamp, e.clientX]];
    }, { passive: true });

    surface.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      /* mx は、滑っている最中に掴み直したとき `regrab` が引き直します
         ——引き直した位置を、同じ一回の中で古い値が上書きしないこと
         （実測：160px 跳んだ）。 */
      mx = e.clientX - x0;
      const my = e.clientY - y0;
      if (!axis) {
        const ax = Math.abs(mx), ay = Math.abs(my);
        if (ax >= AXIS_X && ax >= ay * SLANT) axis = "x";
        else {
          if (ay >= AXIS_Y && ax < ay * SLANT) letGo();
          return;
        }
        /* 掴んだあとに用事を運びはじめている（長押しが立った）ことが
           あります。そのときは、この指は向こうのものです。 */
        if (o.busy && o.busy()) { letGo(); return; }
        /* 横だと決まってから初めて捕まえます。ボタンをただ押しただけの
           指まで捕まえると、そのボタンの click が届かなくなるので。 */
        try { surface.setPointerCapture(id); } catch (err) { /* Safari だと投げることがあります */ }
        /* ここから指が離れるまで、組み直しを止めます（30秒ごとの見直しや
           自動同期など、指と関係の無い理由で store が動いても、掴んでいる
           紙が組み直されないように）。 */
        if (o.lock) o.lock(true);
        if (settling) regrab(e);
        else if (nudge) track.style.willChange = "transform";
        else mountSide(mx > 0 ? -1 : 1);
        if (id === null) return;           // 着いた先で画面が組み直された
      }
      const now = e.timeStamp;
      trail.push([now, e.clientX]);
      // 置いた点（trail[0]）は残し、古い動きだけ落とします。
      while (trail.length > 3 && now - trail[1][0] > VEL_MS * 2) trail.splice(1, 1);
      if (nudge) {
        dx = KN.motion.rubber(mx, NUDGE);
      } else {
        /* 指が反対側へ戻ってきたら、そのときに反対の一枚を差し込みます
           （もう済んでいる側なら、何もしません）。 */
        if (peeks) mountSide(mx > 0 ? -1 : 1);
        /* 行けない向きだけ重くします。それ以外は指と1:1で追わせます。 */
        const day = o.day();
        const blocked = mx < 0 ? !o.step(day, 1) : !o.step(day, -1);
        dx = blocked ? mx * 0.3 : mx;
      }
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });

    /* 横と決めた指の送りは、ブラウザに渡しません（頭の「向きの決め方」）。 */
    surface.addEventListener("touchmove", (e) => {
      if (axis === "x" && id !== null && e.cancelable) e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      const moved = mx, v = velocity(e.timeStamp);
      id = null; axis = null;
      /* 縦の払い（や、動かなかったタップ）は、横には何も触れていません。
         ここで settle を呼ぶと、並べてもいない track に一瞬だけ
         translate を乗せてしまいます。 */
      if (!wasX) return;
      const want = moved < 0 ? 1 : -1;
      const fling = Math.abs(v) > FLING_V && Math.abs(moved) >= FLING_MIN;
      const go = fling ? (v < 0 ? 1 : -1) === want : Math.abs(moved) >= COMMIT;
      const key = go ? o.step(o.day(), want) : null;
      if (nudge) {
        if (key) {
          if (KN.motion) KN.motion.fire("nav");
          o.commit(key);
        }
        home(v);
        return;
      }
      if (!key) { back(v); return; }
      if (KN.motion) KN.motion.fire("nav");
      const which = want < 0 ? "back" : "fwd";
      if (!peeks || !peeks[which]) { back(v); return; }
      settling = { which, key };
      prebuild(key, which);
      settle(which, v).then((done) => {
        if (!done) return;                    // 途中で掴み直された
        settling = null;
        /* 滑りきった一枚を、**そのまま真ん中に据えて**渡します。組み直すと、
           いま見えているのと同じ絵をもう一度組むために 134ms 固まって、
           次の日が「いきなり出てきた」ように見えます。 */
        const kept = adopt(which, key);
        if (o.lock) o.lock(false);
        o.commit(key, kept);
        // 画面の側が結局組み直したのなら、track ごと入れ替わっています。
        if (track.isConnected) warm();
      });
    };

    /* 滑っている途中の覗き見の紙を押した指は、押したことにしません
       （`inert` を付けない代わり。上の `asPeek`）。据えたあとなら、もう
       覗き見ではないので通ります。 */
    surface.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest(".day-slide.is-peek")) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    surface.addEventListener("pointerup", end);
    surface.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      id = null; axis = null;
      if (!wasX) return;
      if (nudge) home(0);
      else back(0);
    });

    /* 組み上がったこの拍では、まだ画面が出そろっていないことがあります
       （親に付く前に wire される画面があるため）。暇な拍まで待ってから
       控えを組みはじめます——`warm` の中の `ric` がそれです。 */
    warm();

    return { warm, drop };
  }

  KN.daySwipe = { wire };
})();
