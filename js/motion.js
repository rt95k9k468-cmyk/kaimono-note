/* =========================================================
   くらしノート — 出来事の返し方（Motion / Haptic を一つにまとめる）

   このファイルの言い分は一つだけです。

     **同じ出来事は、どこで起きても同じように返る。**

   いままでは各画面が自分で `haptic()` を呼び、自分で .16s だの .28s だのを
   書いていました。結果として「済ませた」の手ごたえが、やることの画面と
   買うものの画面で違っていました。押した人からすれば同じ「済ませた」なので、
   返り方が違えば、画面ごとに読み方を学び直すことになります。

   ここでは出来事に名前を付けて、その名前に対して

     ・目に見える変化（class を一時的に付ける／FLIP）
     ・指に返る震え（震え方の長さも出来事ごとに変える）

   の**両方**を一度に決めます。視覚と触覚は別々の演出ではなく、同じ一つの
   出来事の二つの面です。片方だけ鳴ると、鳴らないほうが壊れて見えます。

   使い方：

     KN.motion.fire("check", el);     // 印が付いた
     KN.motion.fire("delete", el);    // 消えていく（Promise が返ります）
     KN.motion.press(el);             // 押されている間だけ

   速さは css/base.css の --m-* を読みます。JS 側に数字を二重に持つと、
   いつか必ず片方だけ直されるので、**CSS を唯一の出どころ**にします。

   震えについて：iOS の Safari は navigator.vibrate を持ちません。それでも
   呼ぶ形を残すのは、ここが将来ネイティブへ移ったときに UIFeedbackGenerator
   へ差し替える一点になるからです。呼び出し側を書き換えずに済みます。
   iPhone では「済ませた」だけ、別の手で震わせます（下の `feel`。C1）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;

  /* 出来事の一覧。

     ms   … 震えの長さ。強さは指定できないので、長さで軽重を表します。
     cls  … その間だけ付ける class（css/components.css の .is-m-* ）。
     tok  … 長さを読む CSS 変数の名前。 */
  const EVENTS = {
    press:      { ms: 0,  cls: null,          tok: "--m-press" },
    check:      { ms: 12, cls: "is-m-check",  tok: "--m-check" },
    uncheck:    { ms: 6,  cls: null,          tok: "--m-check" },
    add:        { ms: 10, cls: "is-m-add",    tok: "--m-add" },
    delete:     { ms: 14, cls: "is-m-delete", tok: "--m-delete" },
    reorder:    { ms: 6,  cls: null,          tok: "--m-reorder" },
    select:     { ms: 5,  cls: null,          tok: "--m-press" },
    save:       { ms: 12, cls: null,          tok: "--m-check" },
    sheetOpen:  { ms: 0,  cls: null,          tok: "--m-sheet-open" },
    sheetClose: { ms: 0,  cls: null,          tok: "--m-sheet-close" },
    nav:        { ms: 4,  cls: null,          tok: "--m-nav" },
    number:     { ms: 0,  cls: "is-m-number", tok: "--m-number" },
    /* うまくいった・気をつけて。ここだけ二拍にします——一拍だと
       「何か起きた」しか言えず、良し悪しが伝わらないので。 */
    success:    { ms: 0,  cls: "is-m-success", tok: "--m-success", pattern: [10, 40, 18] },
    warn:       { ms: 0,  cls: "is-m-warn",    tok: "--m-warn",    pattern: [22, 60, 22] },
  };

  /* 動きを減らす設定の人には、動かしません。class も付けません
     （付けても CSS 側で瞬時になりますが、無駄な組み直しが残るので）。 */
  const still = () => !!(window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* 長さは CSS から読みます。読めなければ 240ms。
     一度読んだら覚えます——毎回 getComputedStyle を呼ぶと、
     押すたびにレイアウトを測り直すことになります。 */
  const cache = new Map();
  function ms(token) {
    if (cache.has(token)) return cache.get(token);
    let out = 240;
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      if (/ms$/.test(v)) out = parseFloat(v);
      else if (/s$/.test(v)) out = parseFloat(v) * 1000;
    } catch (_) { /* 既定のまま */ }
    cache.set(token, out);
    return out;
  }
  /* 画面の設定が変わったら（テーマの切り替えなど）、測り直します。 */
  if (window.matchMedia) {
    try {
      window.matchMedia("(prefers-reduced-motion: reduce)")
        .addEventListener("change", () => { cache.clear(); easeCache.clear(); });
    } catch (_) { /* 古い Safari。無くても困りません */ }
  }

  /* 曲線も、同じ理由で CSS から読みます。
     `edge-back.js` は "cubic-bezier(.32,.72,0,1)" を**文字列としてべた書き**
     していました——`--push-e` とまったく同じ数字です。片方だけ直した日に、
     押して戻るのと指で引いて戻るのとで動きが割れます（深さの数
     `--push-p` / PARALLAX で、同じ罠を一度踏んでいます）。 */
  const easeCache = new Map();
  function ease(token, fallback) {
    if (easeCache.has(token)) return easeCache.get(token);
    let out = fallback || "ease";
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      if (v) out = v;
    } catch (_) { /* 既定のまま */ }
    easeCache.set(token, out);
    return out;
  }

  /* ---------------------------------------------------------------
     指を離したあと、行き先まで滑る

     ここは長いあいだ「決まった時間」でした——day-swipe 200ms、cal-swipe
     200ms、edge-back 260ms、紙の面 280ms。指の速さ（vx）は計算しては
     いましたが、**「行くか戻るか」の真偽にしか使われていません**でした。

     だから 27px で離すと 363px を 200ms で駆け抜け、380px まで引いて
     離すと 10px を 200ms かけて——**同じ時間**。前者は弾かれたように、
     後者はもたついて見えます。

     いま決めるのは二つです。

     ■ どれだけの時間で行くか

       ・指に勢いがあるなら、**その速さで行けば着く時間**（dist / v）。
         速く払った人は、速く着く。
       ・勢いが無いなら、**残りの道のりに比例**（span に対する割合）。
         あと10pxなら短く、半分残っていれば `--m-swipe` ぶん。
       短いほうを採り、上下で頭打ちにします（速すぎても遅すぎても
       「滑った」に見えないので）。

     ■ どんな曲線で行くか

       **出だしの傾きを、離したときの指の速さに合わせます。** これが
       「勢いを引き継ぐ」の正体で、`--ease-out` を一律に当てていたころ
       は、ゆっくり離しても出だしだけ速く、指の動きと繋がりませんでした。

       ベジェ (0,0)→(p1)→(p2)→(1,1) の出だしの傾きは p1y/p1x です。
       道のり d を時間 t で行くとき、初速 v を正規化すると v·t/d。
       p1x を固定して p1y をそこに合わせれば、離した瞬間の速さのまま
       走り出して、静かに着きます。
     --------------------------------------------------------------- */
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /**
   * @param {number} dist 残りの道のり。**符号つき**（右・下へ行くなら正）。
   * @param {number} v    指の速さ。**同じ軸の符号つき**（px/ms）。
   *                      向きが合っているかはこちらで見ます——呼ぶ側で
   *                      掛け算させると、いつか符号を落とす日が来るので。
   * @param {object} [o]
   * @param {number} [o.span] この手つきの全長（px）。既定は dist。
   * @param {number} [o.base] 基準の長さ（ms）。既定は --m-swipe。
   * @returns {{ms:number, ease:string}} 動きを減らす設定なら ms は 0。
   */
  function glide(dist, v, o) {
    const opt = o || {};
    const d = Math.abs(dist) || 0;
    const base = opt.base || ms("--m-swipe");
    if (still()) return { ms: 0, ease: "linear" };
    /* 行き先へ向かっている成分だけを見ます。逆向きに離した指は
       「助けていない」＝勢い無しとして扱います（負のまま使うと、
       出だしの傾きが後ろを向きます）。 */
    v = d ? Math.sign(dist) * (v || 0) : 0;

    const span = Math.max(1, Math.abs(opt.span || d || 1));
    const lo = base * 0.45, hi = base * 1.6;

    /* 道のりから（勢いが無いとき）。近いほど短いが、下限は置きます
       ——1pxでも「滑った」と読める最短は要るので。 */
    const byDist = base * clamp(d / span, 0.35, 1);
    /* 勢いから。ほとんど止まっている指（0.05px/ms 未満）は無いものとして
       扱います——割ると出てくるのは、ただの大きな数なので。 */
    const byVel = v > 0.05 ? d / v : Infinity;

    const t = clamp(Math.min(byDist, byVel), lo, hi);

    /* 出だしの傾き。p1x は 0.25 に固定（そこから先は減速に使う区間）。
       上を 1.4 で止めるのは、行き過ぎて戻る形になるのを防ぐため
       ——ここは弾みではなく、慣性の引き継ぎなので。 */
    const p1x = 0.25;
    const p1y = clamp((Math.max(0, v) * t / Math.max(1, d)) * p1x, 0, 1.4);
    return { ms: Math.round(t), ease: `cubic-bezier(${p1x}, ${p1y.toFixed(3)}, .2, 1)` };
  }

  /* 端をこえて引いたぶんは、だんだん重くする（ゴム）。

     いくら引いても 1:1 で付いてくると、そちらに道があるように見えます。
     指は動くのに行き先が近づかない、という手ざわりが「ここまで」を言う
     ——それを距離で言うと、どこまで引けるかを**数字で決める**ことになる
     ので、こちらは**行けない向きにも指はついてくる**まま、重さだけで
     伝えます。 */
  function rubber(over, limit) {
    const lim = limit || 120;
    const x = Math.abs(over);
    return Math.sign(over) * (lim * (1 - 1 / (x / lim + 1)));
  }

  function buzz(spec) {
    if (!navigator.vibrate) return;
    try {
      if (spec.pattern) navigator.vibrate(spec.pattern);
      else if (spec.ms) navigator.vibrate(spec.ms);
    } catch (_) { /* 震えないことは失敗ではありません */ }
  }

  /* ---------------------------------------------------------------
     iPhone で「済ませた」を震わせる（docs/motion.md の C1）

     iOS 18 から、Safari の `<input type="checkbox" switch>`（切り替えの
     つまみ）は、**指で押されて**切り替わるときに端末を軽く震わせます。

     **押したことにする（`label.click()`）では震えません。** 前はそうして
     いて、実機で震えませんでした。WebKit は click が本物か（isTrusted）を
     見ていて、本物でない切り替えでは震わせない（CheckboxInputType.cpp の
     willDispatchClick → `state.trusted` のときだけ
     performSwitchVisuallyOnAnimation。2026年9月に WebKit のソースで確認）。

     だから、**指が本当にそのつまみを押す**ようにします。済ませる丸の中に、
     見えないつまみを丸と同じ大きさで重ねる。指はつまみを押し（震える）、
     その click は丸（button）へ上がって、いつもの「済ませる」が走ります。

     ・重ねるのは Apple の指で触る端末だけ。ほかの端末の DOM は変えません
       （そちらは navigator.vibrate が上の buzz で震わせる）。
     ・つまみは読み上げにも Tab にも出しません（丸の button がそれを持つ）。
     ・つまみは見えない（opacity 0）が、**描かれている**必要があります
       ——WebKit は描かれていないつまみの指を受け取らないので、
       display:none や head の中では震えません。
     ・一度の指で click が二度来ても、丸へは一度だけ渡します（350ms）。
     ・持ち上げて「置いた」、払って「閉じた」は震わせられません。そこには
       指で押すつまみが無いので（前の版はそこでも試みていた）。
     --------------------------------------------------------------- */
  const appleTouch = (() => {
    try {
      const ua = navigator.userAgent || "";
      return /iP(hone|ad|od)/.test(ua)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    } catch (_) { return false; }
  })();
  function feel(btn) {
    if (!btn || !appleTouch || navigator.vibrate) return;
    if (btn.querySelector(":scope > .feel-switch")) return;
    const sw = document.createElement("input");
    sw.type = "checkbox";
    sw.setAttribute("switch", "");
    sw.className = "feel-switch";
    sw.tabIndex = -1;
    sw.setAttribute("aria-hidden", "true");
    let last = 0;
    sw.addEventListener("click", (e) => {
      const now = Date.now();
      if (now - last < 350) { e.stopPropagation(); return; }
      last = now;
    });
    btn.append(sw);
  }

  /**
   * 出来事を返します。
   *
   * @param {string} name  EVENTS の名前
   * @param {Element} [el] 目に見える変化を起こす相手（省略可）
   * @returns {Promise} 動きが終わったら解決します。消えるものを
   *                    「消え終わってから」外したいときに使います。
   */
  function fire(name, el) {
    const spec = EVENTS[name];
    if (!spec) return Promise.resolve();
    buzz(spec);
    const dur = ms(spec.tok);
    if (!el || !spec.cls || still()) {
      return new Promise((done) => setTimeout(done, still() ? 0 : dur));
    }
    /* 同じ class が残っていると二度目が効きません。一度外して、
       次のフレームで付け直します（アニメーションの作り直し）。 */
    el.classList.remove(spec.cls);
    // 読むことで、ブラウザにここまでを確定させます。
    void el.offsetWidth;
    el.classList.add(spec.cls);
    return new Promise((done) => setTimeout(() => {
      el.classList.remove(spec.cls);
      done();
    }, dur));
  }

  /* 押している間だけ縮むもの。CSS の :active で足りる場所には要りません
     ——これは「指を離しても少しだけ効いていてほしい」ところ用です。 */
  function press(el) {
    if (!el || still()) return;
    el.classList.add("is-m-press");
    const off = () => {
      el.classList.remove("is-m-press");
      el.removeEventListener("pointerup", off);
      el.removeEventListener("pointercancel", off);
      el.removeEventListener("pointerleave", off);
    };
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("pointerleave", off);
  }

  KN.motion = { fire, press, ms, ease, glide, rubber, still, feel, EVENTS };
})();
