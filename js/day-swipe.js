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

   ■ 隣の紙は、横だと決まってから組む

   前は三枚を最初から並べていました（ダイエット）。あの画面は一日ぶんが
   軽いので通っていましたが、やることの時間割を毎回三日ぶん組むと、
   store が動くたびに三倍の絵を捨てて組み直すことになります。

   横に払うと決まった瞬間（5px）に、隣の二枚をその場で組みます。組んだ
   直後に transform を書くので、一拍も見えません。指を離して戻ってきたら、
   その二枚は片づけます——**ふだんの DOM には、今日の紙しか居ません**。
   ここは大事なところで、居残ると `.tl-list` や `.tl-now` のような
   「一枚しか無いはず」を探している側が、隣の日のほうを掴みます。

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
  const SETTLE    = 200;  // 離したあと、行き先まで滑る時間

  /**
   * @param {object} o
   * @param {Element} o.viewport  溢れたぶんを隠す外枠（.day-car）
   * @param {Element} o.track     横一列に並べる中身（.day-track）。中には
   *                              いま見ている日の紙が一枚だけ入っています。
   * @param {Function} o.day      () => いま見ている日のキー
   * @param {Function} o.step     (day, dir) => 隣の日のキー。行けないなら null
   * @param {Function} o.slide    (day) => その日の紙（隣を組むために呼びます）
   * @param {Function} o.commit   (day) => 行き先が決まった。画面を組み直す
   * @param {Function} [o.busy]   () => true なら、この指は取りません
   * @param {Function} [o.lock]   (bool) 掴んでいるあいだ、組み直しを止める
   */
  function wire(o) {
    const viewport = o.viewport, track = o.track;
    if (!viewport || !track) return;

    let id = null, x0 = 0, y0 = 0, dx = 0, axis = null, frame = 0, pageW = 0;
    let lastT = 0, lastX = 0, vx = 0, peeks = null;

    /* transform だけを書き換えます（レイアウトに触れる幅・高さ・位置は
       一切読み書きしません）。frame は rAF の間引き用で、一度のフレームに
       一回しか描かないぶん、指の動きより先に追いつくことはあっても、
       遅れて溜まることはありません。 */
    const paint = () => {
      frame = 0;
      track.style.transform = `translate3d(${-pageW + dx}px,0,0)`;
    };

    /** 隣の一枚。行けない側は、中身の無い一枚で場所だけ取ります
        （真ん中を -100% に置くための足場なので、無いと位置がずれます）。 */
    const slideFor = (key) => {
      const built = key ? o.slide(key) : null;
      const el = built || document.createElement("div");
      el.classList.add("day-slide", "is-peek");
      if (!built) el.classList.add("is-void");
      /* 押せません——指は外枠が引き受けます。CSS でも塞ぎますが、
         inert なら中のボタンにタブでも入れません。 */
      el.setAttribute("inert", "");
      el.inert = true;
      return el;
    };

    function mount() {
      if (peeks) return;
      const center = track.firstElementChild;
      if (!center) return;
      center.classList.add("day-slide");
      const day = o.day();
      peeks = { back: slideFor(o.step(day, -1)), fwd: slideFor(o.step(day, 1)) };
      track.insertBefore(peeks.back, center);
      track.append(peeks.fwd);
      /* 合成レイヤーへの昇格は、掴んだ瞬間に済ませておきます——最初の
         一拍でその場で昇格すると、そこだけ一段重くなって見えます。 */
      track.classList.add("is-dragging");
      // 並べた直後に、同じ拍で位置を書きます（一拍も見せません）。
      paint();
    }

    function unmount() {
      if (peeks) { peeks.back.remove(); peeks.fwd.remove(); peeks = null; }
      track.style.transition = "";
      track.style.transform = "";
      track.classList.remove("is-dragging");
    }

    /** 三枚のうち、どれを画面いっぱいに見せて止まるか。0=前 1=いま 2=次 */
    const settle = (index) => new Promise((resolve) => {
      if (!peeks) { resolve(); return; }
      const ms = KN.motion && KN.motion.still() ? 0 : SETTLE;
      track.style.transition = ms ? `transform ${ms}ms var(--ease-out)` : "";
      track.style.transform = `translate3d(${-pageW * index}px,0,0)`;
      setTimeout(() => { track.style.transition = ""; resolve(); }, ms);
    });

    /** 戻ってきた。隣の二枚を片づけて、素の状態に返します。 */
    const back = () => settle(1).then(() => {
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
      const mx = e.clientX - x0, my = e.clientY - y0;
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
        mount();
      }
      if (axis !== "x") return;
      const now = performance.now();
      if (now > lastT) { vx = (e.clientX - lastX) / (now - lastT); lastT = now; lastX = e.clientX; }
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
      await settle(moved < 0 ? 2 : 0);
      /* 滑りきった、その位置のまま次へ渡します。組み直したあとの真ん中は、
         いま画面いっぱいに見えているのと同じ日なので、見た目の続きが
         切れません。commit の中で render が走るので、その前に下ろします。 */
      if (o.lock) o.lock(false);
      o.commit(key);
      // 組み直しで track ごと入れ替わるのがふつうですが、残っていたら片づけます。
      if (track.isConnected) unmount();
    };

    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      id = null; axis = null;
      if (!wasX) return;
      back();
    });
  }

  KN.daySwipe = { wire };
})();
