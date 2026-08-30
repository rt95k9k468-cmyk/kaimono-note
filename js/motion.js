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

   震えについて：iOS の Safari は navigator.vibrate を持ちません。つまり
   ホーム画面のこのアプリでは、いまのところ震えません。それでも呼ぶ形だけ
   残すのは、ここが将来ネイティブへ移ったときに UIFeedbackGenerator へ
   差し替える一点になるからです。呼び出し側を書き換えずに済みます。
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
        .addEventListener("change", () => cache.clear());
    } catch (_) { /* 古い Safari。無くても困りません */ }
  }

  function buzz(spec) {
    if (!navigator.vibrate) return;
    try {
      if (spec.pattern) navigator.vibrate(spec.pattern);
      else if (spec.ms) navigator.vibrate(spec.ms);
    } catch (_) { /* 震えないことは失敗ではありません */ }
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

  KN.motion = { fire, press, ms, still, EVENTS };
})();
