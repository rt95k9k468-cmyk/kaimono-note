/* =========================================================
   くらしノート — 絵の取り次ぎ（UIアイコンの層）

   画面は `icon("gear")` としか言いません。その名前がどの絵の、どの版に
   当たるかを決めるのが、ここです。**画面はどの絵の一族を使っているかを
   知りません。** 知らないから、一族を入れ替えても画面を書き直さずに済みます。

   ■ 一族（provider）

   一族は名前で登録します。いまは二つ：

     phosphor … Phosphor Icons v2.1.1（MIT）。いま使っているもの
     legacy   … 手描きの55個。使っていませんが、消していません

   `KN.icons.use("legacy")` と書けば、画面には一行も触れずに全部が戻ります。
   三つめを足すときも、ここに register するだけです。

   ■ 版が違うと、絵の作りも違う

   手描きのほうは「線の絵」でした——`fill:none` に `stroke` を引き、太さは
   CSS（--ico-w）が決める。Phosphor は逆で、**輪郭の形そのものを塗った絵**
   です（viewBox は 24 ではなく 256、paths は fill）。だから太さは CSS では
   なく**どの weight のファイルを持ってくるか**で決まります。標準は Regular。

   この違いを画面に漏らさないため、`get()` は絵と一緒に「どう塗るか」
   （mode）と「どの升目か」（viewBox）を返し、`svg()` がそれに合わせて
   組み立てます。

   ■ 塗りつぶしの面（solid）

   タブの選ばれている面と、★の付いた印は、線ではなく**面**で言います。
   手描きのほうは塗り用の絵を別に描いてありました。Phosphor では同じ絵の
   Fill weight がそれに当たります。どちらの一族でも、二つの絵を
   `.ico-line` / `.ico-solid` の二つの層として同じ形で出すので、CSS
   （`.ui-ico.is-solid`）はこれまでどおり効きます。

   ■ 塗りを path に書く理由

   `fill="currentColor"` は svg ではなく **一枚ずつの path** に書きます。
   画面のあちこちに `svg { fill: none }`（★の消えている側、⌫、›…）が
   あって、svg に書くとそれに負けて絵ごと消えるからです。path の属性なら、
   svg を狙った CSS は届きません。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  /* 一族ごとの絵の帳面。{ name: { body, solid, viewBox, mode } } */
  const providers = Object.create(null);

  /* いま使う一族と、そこに無い名前の逃げ場。逃げ場があるので、
     Phosphor に見つからなかった一つ（体重計）だけが手描きのまま残せます。 */
  let current = "phosphor";
  let fallback = "legacy";

  function register(id, set) {
    providers[id] = Object.assign(providers[id] || Object.create(null), set);
  }

  function use(id) {
    if (providers[id]) current = id;
    /* いまどの一族かを、いちばん上の札に書いておきます。CSS がそれを見て
       重さを合わせられるように——一族が変われば線の太さの意味も変わるので
       （手描きは 24 の升目に 2.2、Phosphor は 256 の升目に 16）。 */
    if (document.documentElement) document.documentElement.dataset.icons = current;
    return current;
  }

  const provider = () => current;
  const has = (id, name) => !!(providers[id] && providers[id][name]);

  /** その名前の絵。いまの一族に無ければ逃げ場から。どちらにも無ければ null。 */
  function get(name) {
    const a = providers[current] && providers[current][name];
    if (a) return a;
    const b = providers[fallback] && providers[fallback][name];
    return b || null;
  }

  /* 升目と塗り方の既定。手描きの55個は 24 の升目に線で描かれていて、
     Phosphor は 256 の升目に面で描かれています。 */
  const DEFAULT_BOX = "0 0 24 24";

  /**
   * 一枚ぶんの svg。名前と、足したい class。
   *
   * `ui-ico` はこのアプリの全部の絵に一つだけ付く手がかりです（大きさと
   * 太さの CSS がここに掛かっています）。`data-ico` は、どの絵が出ている
   * かを外から見るための札——見た目には効きません。
   */
  function svg(name, cls) {
    const it = get(name);
    if (!it) return "";
    const box = it.viewBox || DEFAULT_BOX;
    /* 線の絵は stroke で、面の絵は fill で塗ります。線の絵の太さは CSS が
       決めるので、ここでは書きません（--ico-w / --ico-sm-w）。 */
    const paint = it.mode === "fill"
      /* 面の絵は、塗りも線も path 側に書いてあります。ここは何も継がせない
         ——継がせると、画面に残っている線の絵むけの CSS が拾います。 */
      ? 'fill="none" stroke="none"'
      : 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
    const open =
      `<svg class="ui-ico${cls ? " " + cls : ""}" viewBox="${box}" ${paint} ` +
      `data-ico="${name}" data-ico-mode="${it.mode || "stroke"}" aria-hidden="true">`;
    const body = it.solid
      ? `<g class="ico-line">${it.body}</g><g class="ico-solid">${it.solid}</g>`
      : it.body;
    return open + body + "</svg>";
  }

  KN.icons = { register, use, provider, has, get, svg, DEFAULT_BOX };

  /* 札は、最初から出しておきます（use() を呼ばずに既定のまま使うので）。 */
  if (document.documentElement) document.documentElement.dataset.icons = current;
})();
