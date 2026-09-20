/* =========================================================
   くらしノート — 左端から引いて、一段戻る

   iOS の「設定」がそうであるように、**前の面は右へ押しのけられて消え、
   後ろの面が左から戻ってくる**。指で引けば、その途中の姿がそのまま見えます
   ——どこまで引けば戻るのかが、絵に出ている、ということです。

   ■ 二枚が動く。同じ速さでは動かない

   前の面は指と 1:1 で右へ。後ろの面は **-28% から 0 へ**（`PARALLAX`）。
   同じだけ動かすと二枚が並んで滑っているように見えて、「下に居た」ことが
   伝わりません。上の一枚だけに影を付けるのも同じ理由です。

   ■ 何が「前」で何が「後ろ」かは、呼ぶ側が答える

   設定の中では、一段は**紙の重なり**（`.set-layer`）ですが、いちばん外では
   **画面そのもの**（`.screen`）です。どちらも「上の一枚と、その下の一枚」と
   いう同じ形なので、ここはその二枚を受け取るだけにしてあります
   （day-swipe.js が「隣の日の紙」を画面側に組ませているのと同じ考えかた）。

   ■ pointer で取り、`touch-action: pan-y` で縦を渡す

   day-swipe.js と同じ作りです。縦は**器の `touch-action`** がブラウザに
   残すので、こちらは `preventDefault` を投げません——投げると、戻らないと
   決めたあとの縦送りまで止まります。

   ■ 端でなければ取らない

   `EDGE`（24px）より内側から始まった指は、ただのタップか縦送りです。実測で
   iOS の端ジェスチャは 20pt ほど。それより少し広く取って、指の腹の分を
   見ています。ホーム画面のWebアプリには Safari 自身の戻る手つきが無いので、
   ここが取り合いになることはありません。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const EDGE     = 24;    // ここより内側から始まった指は、戻る手つきではない
  const AXIS     = 5;     // これだけ動けば、向きを決める
  const COMMIT   = 0.33;  // 画面の幅の、これだけ引けば戻る
  const FLING_V  = 0.4;   // 短くても、これだけ速ければ戻る（px/ms）
  const FLING_MIN = 12;   // ただし、まったく動いていないものは払いではない
  const SETTLE   = 260;   // 離したあと、行き先まで滑る時間
  const PARALLAX = 0.28;  // 後ろの一枚が控えている深さ

  /** 後ろの一枚が、上の一枚の位置（dx）に対して居るところ。 */
  const underAt = (dx, w) => -(w - dx) * PARALLAX;

  const put = (el, px) => {
    if (!el) return;
    el.style.transform = px ? `translate3d(${px}px,0,0)` : "";
  };

  /* 止まっているときの後ろの一枚は、**百分率**で置きます——器の幅が変わって
     も（回転・キーボード）、自分の幅から出た数なのでついてきます。指で
     引いているあいだだけ px にするのは、そのほうが指と揃うからです。 */
  const rest = (el) => {
    if (!el) return;
    el.style.transform = `translate3d(${-PARALLAX * 100}%,0,0)`;
  };

  const clear = (el) => { if (el) { el.style.transition = ""; el.style.transform = ""; } };

  /**
   * @param {object} o
   * @param {Element}  o.el      指を見る器（その画面そのもの）
   * @param {Function} o.begin   () => {top, under, commit, cancel} または null。
   *                             横だと決まった瞬間に一度だけ呼ばれます。
   *                             **後ろの一枚を出すのも、ここの仕事**です。
   * @param {Function} [o.busy]  () => true なら、この指は取りません
   */
  function wire(o) {
    const host = o.el;
    if (!host) return;

    let id = null, x0 = 0, y0 = 0, dx = 0, axis = null, frame = 0, w = 0;
    let lastT = 0, lastX = 0, vx = 0, live = null;

    const paint = () => {
      frame = 0;
      if (!live) return;
      put(live.top, dx);
      put(live.under, underAt(dx, w));
    };

    /** 行き先まで滑らせる。0 は戻らない、w は戻る。 */
    const settle = (to) => new Promise((done) => {
      if (!live) { done(); return; }
      const ms = (KN.motion && KN.motion.still && KN.motion.still()) ? 0 : SETTLE;
      /* 曲線は CSS の `--push-e` から。ここには同じ数字が**文字列として
         べた書き**してありました——押して戻るのと指で引いて戻るのとで、
         同じ一段が二通りに動きうる形です（深さの数 `--push-p` / PARALLAX
         で、すでに一度踏んでいる罠）。 */
      const ease = KN.motion.ease("--push-e", "cubic-bezier(.32,.72,0,1)");
      [live.top, live.under].forEach((el) => {
        if (el) el.style.transition = ms ? `transform ${ms}ms ${ease}` : "";
      });
      put(live.top, to);
      put(live.under, underAt(to, w));
      setTimeout(done, ms + 20);
    });

    const finish = async (go) => {
      const cur = live;
      if (!cur) return;
      await settle(go ? w : 0);
      live = null;
      host.classList.remove("is-edge");
      /* 消すのは**滑らせるための仕掛けだけ**。置き場所（transform）の
         後始末は、呼んだ側に渡します——戻りきった一枚はそのまま外される
         ことがあり、ここで 0 に戻すと、外れる直前の一拍だけ元の位置に
         跳ねて見えるからです。 */
      [cur.top, cur.under].forEach((el) => { if (el) el.style.transition = ""; });
      if (go) cur.commit(); else cur.cancel();
    };

    host.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (live) return;
      if (o.busy && o.busy()) return;
      const box = host.getBoundingClientRect();
      if (e.clientX - box.left > EDGE) return;
      w = box.width;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null;
      lastT = performance.now(); lastX = e.clientX; vx = 0;
    }, { passive: true });

    host.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!axis) {
        if (Math.abs(mx) < AXIS && Math.abs(my) < AXIS) return;
        /* 右向きの横だけ。左へ引くのは戻ることではないので、縦と同じく
           そのまま渡します。 */
        axis = (mx >= Math.abs(my) * 0.85 && mx > 0) ? "x" : "y";
        if (axis !== "x") { id = null; return; }
        if (o.busy && o.busy()) { id = null; axis = null; return; }
        live = o.begin();
        if (!live) { id = null; axis = null; return; }
        try { host.setPointerCapture(id); } catch (err) { /* Safari が投げることがあります */ }
        host.classList.add("is-edge");
        [live.top, live.under].forEach((el) => { if (el) el.style.transition = ""; });
      }
      if (axis !== "x") return;
      const now = performance.now();
      if (now > lastT) { vx = (e.clientX - lastX) / (now - lastT); lastT = now; lastX = e.clientX; }
      dx = Math.max(0, Math.min(w, mx));
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });

    const end = (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      const moved = dx;
      const fling = vx > FLING_V && moved >= FLING_MIN;
      id = null; axis = null;
      if (!wasX || !live) return;
      if (KN.motion && (moved >= w * COMMIT || fling)) KN.motion.fire("nav");
      finish(moved >= w * COMMIT || fling);
    };

    host.addEventListener("pointerup", end);
    host.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      id = null; axis = null;
      if (!wasX || !live) return;
      finish(false);
    });
  }

  /** 指を使わずに、押して一段動かすとき（「›」と戻るボタン）。
      @param {Element} top   上に来る一枚
      @param {Element} under その下の一枚
      @param {number} dir    +1 ＝ 奥へ進む、-1 ＝ 手前へ戻る */
  function push(top, under, dir) {
    /* 押して一段動かすのは、CSS の `scr-push-*` とまったく同じ出来事です
       ——長さも同じところ（`--m-push`）から出します。 */
    const ms = (KN.motion && KN.motion.still && KN.motion.still())
      ? 0 : KN.motion.ms("--m-push");
    const w = (top.getBoundingClientRect().width) || 1;
    const from = dir > 0 ? w : 0;
    const to   = dir > 0 ? 0 : w;
    top.classList.add("is-edge-lift");
    put(top, from);
    put(under, underAt(from, w));
    return new Promise((done) => {
      if (!ms) {
        if (dir > 0) { clear(top); rest(under); } else { clear(under); }
        top.classList.remove("is-edge-lift");
        done();
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const ease = KN.motion.ease("--push-e", "cubic-bezier(.32,.72,0,1)");
        [top, under].forEach((el) => { if (el) el.style.transition = `transform ${ms}ms ${ease}`; });
        put(top, to);
        put(under, underAt(to, w));
        setTimeout(() => {
          [top, under].forEach((el) => { if (el) el.style.transition = ""; });
          /* 止まったところで、px を素の姿へ置き直します。奥へ進んだなら
             上の一枚は素、下の一枚は控えの位置（百分率）。戻ったなら下の
             一枚が素で、**上の一枚はそのまま**——外される一枚なので、
             0 に戻すと外れる直前の一拍だけ跳ねて見えます。 */
          if (dir > 0) { clear(top); rest(under); } else { clear(under); }
          top.classList.remove("is-edge-lift");
          done();
        }, ms + 20);
      }));
    });
  }

  KN.edgeBack = { wire, push, rest, clear, PARALLAX, EDGE };
})();
