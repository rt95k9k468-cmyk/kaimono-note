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
   iPhone では、主な押すものだけ別の手で震わせます（下の FEEL。C1）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;

  /* 出来事の一覧。

     ms   … 震えの長さ。強さは指定できないので、長さで軽重を表します。
     cls  … その間だけ付ける class（css/components.css の .is-m-* ）。
     tok  … 長さを読む CSS 変数の名前。
     snd  … 鳴らす音（下の SOUNDS）。震えの届かない出来事だけ（docs/motion.md の「手ざわりの表」）。 */
  const EVENTS = {
    press:      { ms: 0,  cls: null,          tok: "--m-press" },
    check:      { ms: 12, cls: "is-m-check",  tok: "--m-check" },
    uncheck:    { ms: 6,  cls: null,          tok: "--m-check" },
    add:        { ms: 10, cls: "is-m-add",    tok: "--m-add" },
    delete:     { ms: 14, cls: "is-m-delete", tok: "--m-delete" },
    /* 回すドラムが行をまたぐ・行や丸が持ち上がる・置く。 */
    turn:       { ms: 4,  cls: null,          tok: "--m-press",   snd: "tick" },
    lift:       { ms: 6,  cls: null,          tok: "--m-reorder", snd: "lift" },
    drop:       { ms: 12, cls: null,          tok: "--m-reorder", snd: "drop" },
    select:     { ms: 5,  cls: null,          tok: "--m-press" },
    save:       { ms: 12, cls: null,          tok: "--m-check" },
    sheetOpen:  { ms: 0,  cls: null,          tok: "--m-sheet-open" },
    sheetClose: { ms: 0,  cls: null,          tok: "--m-sheet-close" },
    nav:        { ms: 4,  cls: null,          tok: "--m-nav" },
    number:     { ms: 0,  cls: "is-m-number", tok: "--m-number" },
    /* 押された絵が、一度だけその絵らしく応える（席の絵・歯車）。震えは
       席を移る nav が受け持つので、ここでは鳴らしません（二度鳴ると重い）。 */
    poke:       { ms: 0,  cls: "is-poke",     tok: "--m-poke" },
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
        .addEventListener("change", () => { cache.clear(); easeCache.clear(); curveCache.clear(); setTimeout(warm, 0); });
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

  /* 長さと曲線は、開いて落ち着いたところで一度に読んでおきます（docs/motion.md の
     「押した一拍を軽く」）。はじめて呼ばれたときに読むと、そこはたいてい組み直しの
     直後（席を押した・紙を開いた）で、ブラウザに様式の計算を前倒しさせます——実測で、
     はじめての席移りに 29ms。落ち着いたところなら、読むだけで済みます。
     読むのは base.css の `:root` にある名前（`--m-*` と曲線）。見つからなければ何もせず、
     これまでどおり呼ばれたときに読みます。 */
  const CURVE = /^--(ease(-[a-z]+)*|spring|push-e)$/;
  function warm() {
    try {
      const names = new Set();
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch (_) { continue; }
        for (const r of rules || []) {
          if (r.selectorText !== ":root" || !r.style) continue;
          for (let i = 0; i < r.style.length; i++) {
            const p = r.style[i];
            if (p.startsWith("--m-") || CURVE.test(p)) names.add(p);
          }
        }
      }
      names.forEach((p) => (p.startsWith("--m-") ? ms(p) : ease(p)));
    } catch (_) { /* 読めなければ、呼ばれたときに読む */ }
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("load", () => requestAnimationFrame(() => setTimeout(warm, 0)), { once: true });
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
     音（docs/motion.md の「手ざわりの表」・N6）

     iPhone の Safari は震えを出せず、下の FEEL のつまみも押すものにしか重ねられません。
     回す・持ち上げる・置くには、震えの代わりに短い音を返します。鳴らすのは fire() だけ
     ——EVENTS の snd を持つ行からだけです（tests/feel-sound.js が見張る）。

     音の場は ambient——消音スイッチで黙り、流れている音楽も止めない。音は一度だけ作って
     使い回します。音の口（wakeSound）は指で触れたときに開けます——iPhone は触れる前の
     音を出しません。持ち上がるのは長押しの途中なので、指を置いたときに開けておきます。 */
  const SOUNDS = {
    /* カチッ（2026年10月8日・利用者の声。純正のドラムの手ざわり）。 */
    tick: { len: 0.012, gain: 0.25,
            at: (s) => (Math.sin(2 * Math.PI * 3200 * s) * 0.6 + (Math.random() * 2 - 1) * 0.4) * Math.exp(-s / 0.0015) },
    /* ぽっ（持ち上がる）。音程が少し上がる、丸い音。ドラムより小さく。 */
    lift: { len: 0.045, gain: 0.12,
            at: (s) => Math.sin(2 * Math.PI * (520 * s + 4000 * s * s)) * Math.exp(-s / 0.009) },
    /* ことっ（置く）。低い木の音に、触れた一瞬のざらつき。ドラムより小さく。 */
    drop: { len: 0.06, gain: 0.16,
            at: (s) => (Math.sin(2 * Math.PI * 190 * s) * 0.7
                        + Math.sin(2 * Math.PI * 470 * s) * 0.3 * Math.exp(-s / 0.004)
                        + (Math.random() * 2 - 1) * 0.25 * Math.exp(-s / 0.0008)) * Math.exp(-s / 0.012) },
  };
  let actx = null;
  const bufs = {};
  const playedAt = {};
  function wakeSound() {
    try {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (navigator.audioSession) navigator.audioSession.type = "ambient";
        actx = new AC();
        const rate = actx.sampleRate;
        Object.keys(SOUNDS).forEach((k) => {
          const S = SOUNDS[k];
          const n = Math.round(rate * S.len);
          const b = actx.createBuffer(1, n, rate);
          const d = b.getChannelData(0);
          for (let i = 0; i < n; i++) d[i] = S.at(i / rate);
          bufs[k] = b;
        });
      }
      if (actx.state !== "running") {
        const p = actx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (_) {}
  }
  function sound(name) {
    const b = bufs[name];
    if (!b || !actx || actx.state !== "running") return;
    const now = performance.now();
    if (now - (playedAt[name] || 0) < 30) return;   // 速い払いで重ならない
    playedAt[name] = now;
    try {
      const src = actx.createBufferSource();
      const g = actx.createGain();
      g.gain.value = SOUNDS[name].gain;
      src.buffer = b;
      src.connect(g).connect(actx.destination);
      src.start();
    } catch (_) {}
  }

  /* ---------------------------------------------------------------
     iPhone で、主な押すものを震わせる（docs/motion.md の C1）

     iOS 18 から、Safari の `<input type="checkbox" switch>`（切り替えの
     つまみ）は、**指で押されて**切り替わるときに端末を軽く震わせます。

     **押したことにする（`label.click()`）では震えません。** 最初の版は
     そうしていて、実機で震えませんでした。WebKit は click が本物か
     （isTrusted）を見ていて、本物でない切り替えでは震わせない
     （CheckboxInputType.cpp の willDispatchClick → `state.trusted` のときだけ
     performSwitchVisuallyOnAnimation。2026年9月に WebKit のソースで確認）。

     だから、**指が本当にそのつまみを押す**ようにします。押すもの（button）の
     中に、見えないつまみを同じ大きさで重ねる。指はつまみを押し（震える）、
     その click は button へ上がって、いつもの動きが走ります。

     **どれに重ねるかは、下の FEEL の一覧だけが決めます。** 画面に出てきた
     ものへ、見張り（MutationObserver）が付けて回ります——画面ごとに呼ぶと、
     組み直しのたびに付け忘れが生まれるので。

     一覧に入れないもの（入れると壊れるもの）：
     ・**送る面の上の広いもの**（行・カード・札の並び）。iPhone は、つまみの
       上で始まった指を「つまみを動かす」と受け取り、画面を送りません
       （WebKit は touchstart を自分で受け取る＝defaultHandled）。小さな丸や
       ★のように、送る指がめったに乗らないものだけ。
     ・**押したまま滑らせるもの**（下の帯の席・掴み手・並べ替え）。つまみは
       指を離した場所に関係なく「押した」と受け取るので、「席の外で離せば
       変わらない」が崩れる。
     ・**a 要素**（リンク）。中のつまみが押されると、リンクのほうは開かない
       （一度の click で動くのは、いちばん内側の一つだけ）。
     ・**form の送信ボタン**（type="submit" で form を持つもの）。同じ理由で、
       送信が起きなくなる（商品の紙の値段の「追加」がこれ）。一覧の書き方に
       かかわらず、付けるときに外します。

     ・重ねるのは Apple の指で触る端末で、navigator.vibrate が無いときだけ。
       ほかの端末の DOM は変えません（そちらは上の buzz が震わせる）。
     ・つまみは読み上げにも Tab にも出しません（button がそれを持つ）。
     ・見えない（opacity 0）が**描かれている**こと——WebKit は描かれていない
       つまみの指を受け取らないので、display:none や head の中では震えない。
     ・押せない button（disabled）は `pointer-events: none` を子へ継ぐので、
       つまみも押されない（震えない）。
     ・一度の指で click が二度来ても、button へは一度だけ渡します（指を
       置いた回数で数えるので、数字キーの速い連打は落としません）。
     ・持ち上げて「置いた」、払って「閉じた」は震わせられません。そこには
       指で押すつまみが無いので。
     --------------------------------------------------------------- */
  const FEEL = [
    "button.check",        // 済ませる（やること・手順・買うもの）
    "button.fav",          // ★ 今回買う
    "button.btn-primary",  // 保存・追加・記録する（紙の足もと・確かめの紙）
    "button.btn-danger",   // 消す・置き換える（確かめの紙）
    "button.add-fab",      // ＋
    "button.fab-menu-b",   // ＋ から出る行き先
    "button.key",          // 数字キー
    "button.low-add",      // そろそろ切れそう → 入れる
  ].join(",");

  const appleTouch = (() => {
    try {
      const ua = navigator.userAgent || "";
      return /iP(hone|ad|od)/.test(ua)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    } catch (_) { return false; }
  })();
  const feels = () => appleTouch && !navigator.vibrate;

  function makeSwitch() {
    const sw = document.createElement("input");
    sw.type = "checkbox";
    sw.setAttribute("switch", "");
    sw.className = "feel-switch";
    sw.tabIndex = -1;
    sw.setAttribute("aria-hidden", "true");
    /* 一度の指に、button へ渡す click は一つ。数えるのは指を置いた回数
       （pointerdown）——時間で切ると、数字キーの速い連打を落とします。 */
    let downs = 0, used = -1;
    /* 送った指は、押したことにしない。iPhone のつまみは、指が上下に動いて
       画面が送られても、離したところで click を出す（実機で踏んだ：★や丸の
       上から送ると、離した瞬間に押されていた）。ふつうの button なら
       ブラウザが「送ったから押していない」と決めるところを、ここで決める。
       見るのは三つ——指が SLOP より動いた・何かが送られた（紙の scroll は
       泡立たないので window の capture で聞く）・pointercancel。どれか一つ
       でも立てば、その指の click は button へ渡さない。 */
    let x0 = 0, y0 = 0, moved = false;
    const onScroll = () => { moved = true; };
    const stopWatch = () => window.removeEventListener("scroll", onScroll, true);
    const begin = (x, y) => {
      x0 = x; y0 = y; moved = false;
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    };
    sw.addEventListener("pointerdown", (e) => { downs++; begin(e.clientX, e.clientY); });
    sw.addEventListener("pointercancel", () => { moved = true; });
    sw.addEventListener("touchstart", (e) => {
      const p = e.touches[0];
      if (p) begin(p.clientX, p.clientY);
    }, { passive: true });
    sw.addEventListener("touchmove", (e) => {
      const p = e.touches[0];
      if (p && Math.hypot(p.clientX - x0, p.clientY - y0) > SLOP) moved = true;
    }, { passive: true });
    sw.addEventListener("touchend", stopWatch, { passive: true });
    sw.addEventListener("touchcancel", () => { moved = true; stopWatch(); }, { passive: true });
    sw.addEventListener("click", (e) => {
      stopWatch();
      if (moved || used === downs) {
        e.stopPropagation();
        e.preventDefault();   // つまみの入/切も戻す（見えないが、次の指のため）
        return;
      }
      used = downs;
    });
    return sw;
  }
  /* 「押した」と「送った」の境目。指先の震えは押したうち、それを越えたら送った。 */
  const SLOP = 10;

  /* 付けて回る。まず全部の要否と位置を**読んでから**、まとめて書く
     （一つずつ読み書きすると、そのたびに組み直しの計算が走るので）。 */
  function attach(buttons) {
    const need = buttons.filter((b) => b.isConnected
      && !(b.type === "submit" && b.form)
      && !b.querySelector(":scope > .feel-switch"));
    if (!need.length) return;
    const statics = need.filter((b) => getComputedStyle(b).position === "static");
    statics.forEach((b) => { b.style.position = "relative"; });
    need.forEach((b) => b.append(makeSwitch()));
  }

  function collect(node, into) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches(FEEL)) into.push(node);
    node.querySelectorAll(FEEL).forEach((b) => into.push(b));
  }

  function watchFeel() {
    if (!feels() || !window.MutationObserver) return;
    const first = [];
    collect(document.body, first);
    attach(first);
    new MutationObserver((records) => {
      const found = [];
      records.forEach((r) => {
        r.addedNodes.forEach((n) => collect(n, found));
        /* 中身を書き直された button（textContent など）は、つまみを失う。 */
        if (r.target.nodeType === 1 && r.target.matches(FEEL)) found.push(r.target);
      });
      if (found.length) attach(found);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) watchFeel();
  else document.addEventListener("DOMContentLoaded", watchFeel, { once: true });

  /** 一覧の外のものに、そのつど付けたいとき（いまは使っていない）。 */
  function feel(btn) {
    if (!btn || !feels()) return;
    attach([btn]);
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
    if (spec.snd) sound(spec.snd);
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

  /* ---------------------------------------------------------------
     開いたとき、満ちる（docs/motion.md の「開いたとき、満ちる」）

     画面を開いた一拍（と、アプリへ戻ってきたとき）に、その画面へ
     `is-m-arrive` をしばらく付けます。**何が動くかは CSS が決めます**
     （`.is-m-arrive .diet-ma7` など）——ここが持つのは時計だけ。画面ごとに
     「開いたら輪を満たす」を書くと、組み直しのたびに誰が何を動かしたかが
     散らばるので、入口を一つにしました。

     ・付けているあいだに組み直された中身も、同じく頭から動きます（新しい
       要素は、そのとき始まるので）。外したあとの組み直しは動きません
       ——保存のたびに輪が満ち直すと、動きが「開いた」ではなく「何か
       起きた」を言ってしまうので。
     ・**CSS だけでは揃わないものは、ここへ手を出す**（`onArrive`）。health の
       輪と真ん中の数がそれ（screen-diet.js の fillRings）——二つを同じ一つの
       時計で進めないと、輪と数がずれる。はじめは輪を `@property` の
       アニメーションで、数を CSS の counter で動かしていたが、iPhone の Safari は
       counter を途中で描き直さず、数だけ最後に「パン」と出た（2026年9月29日、
       実機を見た利用者の声）。
     ・動きを減らす設定では付けません。
     --------------------------------------------------------------- */
  const ARRIVE = "is-m-arrive";
  const arriveT = new WeakMap();
  const arriveHooks = [];
  function arrive(root, { restart = true } = {}) {
    if (!root || still()) return;
    clearTimeout(arriveT.get(root));
    /* もう付いていたら、外して読んでから付け直す（頭からやり直す）。
       restart: false … やり直さなくてよい相手（上の帯。帯で動くのは「今日はじめて」の脈だけで、
       それは `is-day-first` が付いた瞬間に始まる——札を付け直さなくても）。読むのは、組み直した
       直後の画面ぜんぶを並べ直させることなので、要らないときは読まない。 */
    if (restart && root.classList.contains(ARRIVE)) {
      root.classList.remove(ARRIVE);
      void root.offsetWidth;
    }
    root.classList.add(ARRIVE);
    arriveHooks.forEach((fn) => { try { fn(root); } catch (_) { /* 開くことを妨げない */ } });
    /* いちばん遅く始まる輪（四つめ）と、いちばん長い線が終わるまで。 */
    const dur = Math.max(ms("--m-fill") * 1.4, ms("--m-draw")) + ms("--m-stagger") * 4 + 60;
    arriveT.set(root, setTimeout(() => root.classList.remove(ARRIVE), dur));
  }
  /** 開いたときに、JS で動かすものがある画面が名乗る。fn(root) は arrive のたびに呼ばれる。 */
  function onArrive(fn) { arriveHooks.push(fn); }
  /** 隠れた画面から札を外しておく（app.js の show）。札が残ったまま戻ってくると、
      頭からやり直すために arrive がその場で並べ直させる（offsetWidth）——組み直した
      直後の画面ぜんぶを、もう一度。隠れているあいだに外せば、戻ったときは付けるだけ。 */
  function depart(root) {
    if (!root) return;
    clearTimeout(arriveT.get(root));
    arriveT.delete(root);
    root.classList.remove(ARRIVE);
  }

  /* ---------------------------------------------------------------
     曲線を JS で引く（`--ease-out` などの cubic-bezier を、進み具合の関数に）

     CSS に任せられない動き（輪と数を一つの時計で進める、など）でも、曲線は
     CSS と同じ名前から読みます——JS に数字を二重に持たないため（上の ms /
     ease と同じ決めごと）。読めない曲線（`ease` などの名前）は ease-out 相当。
     --------------------------------------------------------------- */
  const curveCache = new Map();
  function curve(token) {
    if (curveCache.has(token)) return curveCache.get(token);
    const m = /cubic-bezier\(([^)]+)\)/.exec(ease(token, ""));
    const [x1, y1, x2, y2] = m ? m[1].split(",").map(Number) : [0.16, 1, 0.3, 1];
    const bx = (t) => 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t;
    const by = (t) => 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t;
    const dx = (t) => 3 * x1 * (1 - t) * (1 - t) + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
    const fn = (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      /* x から t を引く：ニュートン法、だめなら二分法。 */
      let t = x;
      for (let i = 0; i < 6; i++) {
        const d = dx(t), e = bx(t) - x;
        if (Math.abs(e) < 1e-5) return by(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 30; i++) {
        const e = bx(t) - x;
        if (Math.abs(e) < 1e-5) break;
        if (e > 0) hi = t; else lo = t;
        t = (lo + hi) / 2;
      }
      return by(t);
    };
    curveCache.set(token, fn);
    return fn;
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

  KN.motion = { fire, press, ms, ease, curve, glide, rubber, still, feel, arrive, onArrive, depart, warm, wakeSound, EVENTS };

  /* 指の重さ（roadmap-unify の U4・docs/motion.md の「指の重さは一か所」）。同じ身ぶりは
     どこでも同じ重さ。払いだけ二つ——行き先へ送る（日・面・暦の段）と、閉じる・戻る（紙・
     左端から）。各ファイルはここから読む（tests/gesture-dict.js が見張る）。 */
  KN.gesture = Object.freeze({
    HOLD: 380,             // これだけ押さえたら持ち上がる（並べ替え・時間割・道）
    HOLD_SLOP: 8,          // その前にこれ以上動いたら、ただの送り
    FLING_V: 0.35,         // 行き先へ送る払い：短くても、これだけ速ければ行く（px/ms）
    FLING_MIN: 8,          // ただし、まったく動いていないものは払いではない（px）
    BACK_FLING_V: 0.4,     // 閉じる・戻る払い（px/ms）
    BACK_FLING_MIN: 10,    // （px）
    AXIS: 6,               // これだけ動いたら、向きを決める（px）
    WHEEL_ROW: 40,         // 車輪の一行（.note-wheel-row の高さと同じ）
  });
})();
