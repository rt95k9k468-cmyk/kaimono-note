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

   ■ 動くのは紙そのもの

   要約でも、色の付いた帯でもありません。**本物の紙**が、指のぶんだけ
   連続して入ってきます。だから止まった瞬間もいちばん払っている最中も、
   同じ中身が見えます。

   ■ 隣の紙は、**指が触れる前に、DOM の外で**組んでおく

   前は三枚を最初から並べていました（ダイエット）。あの画面は一日ぶんが
   軽いので通っていましたが、やることの時間割を毎回三日ぶん組むと、
   store が動くたびに三倍の絵を捨てて組み直すことになります。

   そこで「横だと決まった瞬間（5px）に、その場で組む」にしました。
   **これが、払いはじめのカクつきの正体でした。** 実測（2026年9月20日、
   CPU 4倍・390×844）：払い始めから **70ms** の地点で **237ms** の長タスク
   ——指はもう動いているのに、二日ぶんの絵をそこで組んでいたためです。

   いまは、組み直しが済んで**暇になった拍**（`requestIdleCallback`）に、
   隣の二枚を先に組んで控えておきます。掴んだら、その控えを**差し込むだけ**。
   一枚ずつ組むので、暇な時間を長く占領することもありません。

   **「ふだんの DOM には、今日の紙しか居ません」は、そのままです**
   ——控えは `document` に繋がっていないので、`.tl-list` や `.tl-now` の
   ような「一枚しか無いはず」を探している側は、一枚も掴めません。
   指を離して戻ってきたら、差し込んだ二枚は片づけます。

   控えが無ければ、これまでどおりその場で組みます（落ちない形を残す）。

   ■ 払い終わりに、画面を組み直さない

   滑りきった時点で、画面に出ている紙は**もう「その日」の正しい紙**です。
   それを捨てて同じものを組み直していたので、指を離したあとに **134ms**
   固まって、次の日が「いきなり出てきた」ように見えていました。

   いまは、滑りきった一枚を**真ん中に据えて**（`adopt`）、その紙そのものを
   `commit` の二つめとして渡します。画面の側は、**変わったものだけ**を
   塗り直せば済みます——日付の題と、暦の輪と、「いま」の線。

   ■ 縦は下に譲る

   向きは最初の数ピクセルで決めて、そのまま最後まで持ちます。横をやや
   優先します（0.85）——完全に水平でなくても、斜めの払いはたいてい横の
   つもりです。真上・真下に近い動きだけ縦に譲ります。器の側の
   `touch-action: pan-y` が、縦をブラウザの手に残します。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const AXIS_LOCK = 5;    // これだけ動けば、向きを決めます
  const COMMIT    = 26;   // これだけ動けば、指を離したときに隣へ
  const FLING_V   = 0.35; // 短い距離でも、これだけ速ければ隣へ
  const FLING_MIN = 8;    // ただし、まったく動いていないものは払いではない
  /* 離したあとの滑りは、**残りの道のりと指の勢いから**出します
     （`KN.motion.glide`）。ここには 200ms と直に書いてあって、27px で
     離しても 380px で離しても同じ時間かけていました。 */

  /**
   * @param {object} o
   * @param {Element} o.viewport  溢れたぶんを隠す外枠（.day-car）
   * @param {Element} o.track     横一列に並べる中身（.day-track）。中には
   *                              いま見ている日の紙が一枚だけ入っています。
   * @param {Function} o.day      () => いま見ている日のキー
   * @param {Function} o.step     (day, dir) => 隣の日のキー。行けないなら null
   * @param {Function} o.slide    (day) => その日の紙（隣を組むために呼びます）
   * @param {Function} o.commit   (day, kept) => 行き先が決まった。`kept` は
   *                              **滑りきってそこに居る紙そのもの**です
   *                              （真ん中に据えてあります）。受け取った側は
   *                              組み直さずに、変わったものだけを塗ること。
   *                              渡されなかったとき（掴み直しなど）だけ、
   *                              これまでどおり組み直してかまいません。
   * @param {Function} [o.busy]   () => true なら、この指は取りません
   * @param {Function} [o.lock]   (bool) 掴んでいるあいだ、組み直しを止める
   * @returns {{warm:Function, drop:Function}} 控えの組み直し口。画面の側が
   *          「中身が変わった」と知っているときに `drop()` を呼べます。
   */
  function wire(o) {
    const viewport = o.viewport, track = o.track;
    if (!viewport || !track) return { warm() {}, drop() {} };

    let id = null, x0 = 0, y0 = 0, dx = 0, axis = null, frame = 0, pageW = 0;
    let lastT = 0, lastX = 0, vx = 0, peeks = null;
    /* 真ん中の紙が画面いっぱいに見える transform。差し込んだ枚数で変わり
       ます——前に一枚増えれば、真ん中はそのぶん左へ下がるので。 */
    let originX = 0;
    /* 滑っている最中に掴み直されたら、走っている settle の後始末を
       黙らせるための番号。増やすだけで、古いほうは何もせずに終わります。 */
    let gen = 0;

    /* transform だけを書き換えます（レイアウトに触れる幅・高さ・位置は
       一切読み書きしません）。frame は rAF の間引き用で、一度のフレームに
       一回しか描かないぶん、指の動きより先に追いつくことはあっても、
       遅れて溜まることはありません。 */
    const paint = () => {
      frame = 0;
      track.style.transform = `translate3d(${originX + dx}px,0,0)`;
    };

    /** 隣の一枚。行けない側は**差し込みません**——動くのは transform だけ
        なので、何も置かなくても指のぶんだけ地が覗くだけです（場所取りの
        一枚を置いていた時期がありますが、置いても置かなくても同じ絵で、
        置いたぶんだけレイアウトの費用がかかります）。 */
    const slideFor = (key) => {
      const el = key ? o.slide(key) : null;
      if (!el) return null;
      el.classList.add("day-slide", "is-peek");
      /* 押せません——指は外枠が引き受けます。CSS でも塞ぎますが、
         inert なら中のボタンにタブでも入れません。 */
      el.setAttribute("inert", "");
      el.inert = true;
      return el;
    };

    /* ---------------- 控え（DOM の外で組んでおく二枚） ----------------

       `ready` は `{day, back, fwd}`。`day` は**どの日の隣として組んだか**で、
       いま見ている日と食い違っていたら使いません（暦から日を選んだときなど、
       組み直しを経ずに日が動く道があるので）。

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
      if (idle || peeks) return;
      const day = o.day();
      if (ready && ready.day !== day) ready = null;
      if (ready && ready.back !== undefined && ready.fwd !== undefined) return;
      idle = ric(() => {
        idle = 0;
        /* 指が乗っているあいだ・運んでいる最中は組みません。組んでいる
           数十msは何があっても止められないので、待つほうが安全です。 */
        if (id !== null || (o.busy && o.busy())) return;
        const now = o.day();
        if (!ready || ready.day !== now) ready = { day: now };
        if (ready.back === undefined) ready.back = slideFor(o.step(now, -1));
        else if (ready.fwd === undefined) ready.fwd = slideFor(o.step(now, 1));
        warm();                      // もう一枚あるなら、次の暇な拍で
      }, { timeout: 2000 });
    }

    /** 控えから一枚取り出します。控えが無ければ、その場で組みます。 */
    function take(side, day) {
      if (ready && ready.day === day && ready[side] !== undefined) {
        const el = ready[side];
        ready[side] = undefined;
        return el;
      }
      return slideFor(o.step(day, side === "back" ? -1 : 1));
    }

    /**
     * **その向きの一枚だけ**を差し込みます。
     *
     * 前は掴んだ瞬間に両側を差し込んでいました。実測（CPU 4倍）で、差し込み
     * そのものの JS は 0.8ms、**そのあとのレイアウトが 113.6ms**——費用は
     * 組むことではなく、**画面に置くこと**のほうでした。指が右へ動いている
     * あいだ、左側の一枚は一度も見えないので、その半分は払わずに済みます。
     *
     * 指が戻ってきたら、そのときに反対側を差し込みます（そのぶんの費用は
     * そこで払う）。前に一枚増えると真ん中の居場所がずれるので、`originX`
     * を同じ拍で直して描き直すこと——直さないと、指の下で紙が一枚ぶん跳びます。
     *
     * @param {number} dir -1 ＝ 前の日（指は右へ）／+1 ＝ 次の日
     */
    function mountSide(dir) {
      const side = dir < 0 ? "back" : "fwd";
      /* 指が動くたびに呼ばれます。もう済んでいる側なら、何もしないこと
         ——ここで毎回 paint すると、rAF の間引きの外で transform を書く
         ことになります。 */
      if (peeks && peeks[side] !== null) return;
      if (!peeks) {
        const center = track.firstElementChild;
        if (!center) return;
        center.classList.add("day-slide");
        peeks = { center, back: null, fwd: null };
        /* 合成レイヤーへの昇格は、掴んだ瞬間に済ませておきます——最初の
           一拍でその場で昇格すると、そこだけ一段重くなって見えます。 */
        track.classList.add("is-dragging");
      }
      const el = take(side, o.day());
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

        @returns {Element|null} 据えた紙。渡す先は `commit` の二つめ。 */
    function adopt(which) {
      const keep = peeks && peeks[which];
      if (!keep) { unmount(); return null; }
      Array.prototype.slice.call(track.children).forEach((el) => {
        if (el !== keep) el.remove();
      });
      /* 覗き見の一枚ではなく、**いま見ている紙**になります。押せる相手に
         戻すこと——`inert` を残すと、着いた先の行が一つも押せません。 */
      keep.classList.remove("is-peek");
      keep.removeAttribute("inert");
      keep.inert = false;
      peeks = null;
      originX = 0;
      track.style.transition = "";
      track.style.transform = "";
      track.classList.remove("is-dragging");
      return keep;
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
    const settle = (which) => new Promise((resolve) => {
      if (!peeks) { resolve(true); return; }
      const mine = ++gen;
      const to = xOf(which);
      const from = liveX();
      /* 残りの道のりと、離したときの指の速さから。近くで離せば短く、
         勢いよく払えばその速さのまま走り出して静かに着きます。 */
      const g = KN.motion.glide(to - from, vx, { span: pageW });
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
    const back = () => settle("center").then((done) => {
      if (!done) return;   // 滑っている途中で掴み直された。向こうの指のもの。
      unmount();
      if (o.lock) o.lock(false);
    });

    viewport.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (o.busy && o.busy()) return;
      // 中の書ける欄は、書けるままにします。
      if (e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      pageW = viewport.getBoundingClientRect().width;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null;
      lastT = performance.now(); lastX = e.clientX; vx = 0;
      track.style.transition = "";
    }, { passive: true });

    viewport.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      /* mx は **let**。滑っている最中に掴み直したときだけ、この下で x0 を
         引き直すので、そこから先は新しい x0 で測り直す必要があります
         ——`const` のままだと、せっかく拾った位置を、同じ一回の中で
         古い mx が上書きします（実測：160px 跳んだ）。 */
      let mx = e.clientX - x0;
      const my = e.clientY - y0;
      if (!axis) {
        if (Math.abs(mx) < AXIS_LOCK && Math.abs(my) < AXIS_LOCK) return;
        axis = Math.abs(mx) >= Math.abs(my) * 0.85 ? "x" : "y";
        if (axis !== "x") return;
        /* 掴んだあとに用事を運びはじめている（長押しが立った）ことが
           あります。そのときは、この指は向こうのものです。 */
        if (o.busy && o.busy()) { id = null; axis = null; return; }
        /* 横だと決まってから初めて捕まえます。ボタンをただ押しただけの
           指まで捕まえると、そのボタンの click が届かなくなるので。 */
        try { viewport.setPointerCapture(id); } catch (err) { /* Safari だと投げることがあります */ }
        /* ここから指が離れるまで、組み直しを止めます（30秒ごとの見直しや
           自動同期など、指と関係の無い理由で store が動いても、掴んでいる
           紙が組み直されないように）。 */
        if (o.lock) o.lock(true);
        if (peeks) {
          /* **滑っている最中の掴み直し。** いま居るところを起点にします
             ——ここを 0 から始めると、行き先へ向かっていた紙が真ん中へ
             跳びます（`mount()` は peeks があると素通りするので、位置を
             書く者が誰も居なくなる、というのが正体でした）。

             黙らせるのは**ここ**で、指が触れた時点ではありません
             ——触れただけで離した指のために、滑りを止めてしまうので。 */
          gen++;
          track.style.transition = "";
          x0 = e.clientX - (liveX() - originX);  // 以後の mx が、そのまま続きの dx
          mx = e.clientX - x0;                   // この一回ぶんも、引き直す
        } else {
          /* **その向きの一枚だけ**を差し込みます。右へ動いているなら前の日、
             左なら次の日。見えない側は、見えるまで組みません。 */
          mountSide(mx > 0 ? -1 : 1);
        }
      }
      if (axis !== "x") return;
      const now = performance.now();
      if (now > lastT) { vx = (e.clientX - lastX) / (now - lastT); lastT = now; lastX = e.clientX; }
      /* 指が反対側へ戻ってきたら、そのときに反対の一枚を差し込みます。
         費用をここで払うのは、ここで初めて見えるからです。 */
      if (peeks) mountSide(mx > 0 ? -1 : 1);
      /* 行けない向きだけ重くします。それ以外は指と1:1で追わせます。 */
      const day = o.day();
      const blocked = mx < 0 ? !o.step(day, 1) : !o.step(day, -1);
      dx = blocked ? mx * 0.3 : mx;
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });

    const end = async (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      const moved = dx;
      id = null; axis = null;
      /* 縦の払い（や、動かなかったタップ）は、横には何も触れていません。
         ここで settle を呼ぶと、並べてもいない track に一瞬だけ
         translate を乗せてしまいます。 */
      if (!wasX) return;
      const fling = Math.abs(vx) > FLING_V && Math.abs(moved) >= FLING_MIN;
      if (Math.abs(moved) < COMMIT && !fling) { back(); return; }
      const key = o.step(o.day(), moved < 0 ? 1 : -1);
      if (!key) { back(); return; }
      if (KN.motion) KN.motion.fire("nav");
      const which = moved < 0 ? "fwd" : "back";
      /* 行き先の一枚がまだ無いなら（差し込む前に指が離れた）、真ん中へ
         返してから、これまでどおり組み直してもらいます。 */
      if (!peeks || !peeks[which]) { back(); return; }
      if (!await settle(which)) return;              // 途中で掴み直された
      /* 滑りきった一枚を、**そのまま真ん中に据えて**渡します。組み直すと、
         いま見えているのと同じ絵をもう一度組むために 134ms 固まって、
         次の日が「いきなり出てきた」ように見えます。 */
      const kept = adopt(which);
      if (o.lock) o.lock(false);
      o.commit(key, kept);
      // 画面の側が結局組み直したのなら、track ごと入れ替わっています。
      if (track.isConnected) warm();
    };

    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      id = null; axis = null;
      if (!wasX) return;
      back();
    });

    /* 組み上がったこの拍では、まだ画面が出そろっていないことがあります
       （親に付く前に wire される画面があるため）。暇な拍まで待ってから
       控えを組みはじめます——`warm` の中の `ric` がそれです。 */
    warm();

    return { warm, drop };
  }

  KN.daySwipe = { wire };
})();
