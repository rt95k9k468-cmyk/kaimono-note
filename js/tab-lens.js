/* =========================================================
   くらしノート — 帯の印は、席から席へ滑る一枚（`.tab-lens`）

   下の帯の「いま居る席」の印は、長いあいだ**席ごとの小さな丸**でした
   （`.tab-ico` の 40×26px に `--c-primary-soft` を敷いたもの）。席を移ると、
   前の席の丸が消えて、次の席の丸が出る。**動いたものは何もありません。**

   いまは**一枚だけ**あって、席から席へ滑ります。大きさも席ぜんぶ
   （絵と名前の両方が入る丸薬）に広げました——小さな丸が絵の後ろにだけ
   あったころは、「いまここ」が絵の持ちもので、席の持ちものに見えて
   いなかったので。

   持っている仕事は三つだけです：

     ① 行き先の席の箱を測る
     ② そこへ滑らせる（長さと曲線は `KN.motion.glide` から）
     ③ 押しているあいだ、いま居る席のぶんだけ膨らむ

   見た目（地の色・丸み・膨らむ倍率）は CSS が持ちます。ここが書くのは
   位置と大きさ、それと滑る長さだけ。

   ■ 歪ませるレンズは、試して外しました

     参考画面（Structured）の印は**ガラスのレンズ**で、滑っているあいだ
     帯自身の字を曲げます（真ん中が空いて、字はふちへ押し出されて弧に
     なり、桃と黄の色ズレが出る）。実際に作って、実測で参考画面の数字にも
     届いていました——が、**採らないことにしました**。詳しい経緯と、
     もう一度やるときの落とし穴は CLAUDE.md の
     「席の印を歪ませるレンズは、試して外した」に書いてあります。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const M = KN.motion;

  /* 丸薬の丈。参考画面の実測は 53px／カプセル 70px ＝ 0.757 なので、
     この帯の丈（`--tab-cap` 64px）に写して 48px。 */
  const REST_H = 48;
  /* 席の幅から左右に逃がすぶん。 */
  const INSET_X = 3;

  let bar = null;
  let lens = null;
  let at = null;            // いま乗っている席の DOM
  let held = false;
  let timer = 0;

  /* 席の箱を、帯の中の座標で。

     **`getBoundingClientRect` では測らないこと。** あれは transform の
     **かかったあと**の箱を返します。ところがレンズが動き出すのは、指が
     席を押した直後——つまり `.tab.is-held` の 1.09倍がまだ掛かっている
     最中です（時計を持っているのは指なので、離しても `pointerup` の
     順番によっては残っています）。実測で、行き先の席が 75.5px ではなく
     **76.2px** と返り、レンズが着地のたびにわずかに太って、指を離した
     あとに縮みました（「押すと横に伸びる丸薬」に見えた）。

     `offsetLeft` / `offsetWidth` は**組み上がりの箱**で、transform を
     見ません。席の親は `.tabbar`（position:absolute）なので、返るのは
     そのまま帯の中の座標です。 */
  function seatBox(tab) {
    return {
      x: tab.offsetLeft + INSET_X,
      w: tab.offsetWidth - INSET_X * 2,
      cy: tab.offsetTop + tab.offsetHeight / 2,
    };
  }

  /**
   * 置く。`ms` を渡すとそのぶん滑り、渡さなければその場に跳びます。
   *
   * **滑る長さは CSS の変数へ書き、`transition` の宣言は CSS に置きます**
   * （どこがどう動くかは CSS が持つ、という決めごと。`cal-peek` の
   * `--cal-ms` と同じ手）。既定は `0ms` ＝ 跳ぶ、なので、組み直しや
   * 画面の回転で置きなおすときは何も渡さなければ済みます。
   */
  function place(s, ms, ease) {
    lens.style.setProperty("--lens-ms", (ms || 0) + "ms");
    if (ease) lens.style.setProperty("--lens-ease", ease);
    lens.style.width = s.w.toFixed(2) + "px";
    lens.style.height = REST_H + "px";
    lens.style.transform =
      "translate(" + s.x.toFixed(2) + "px," + (s.cy - REST_H / 2).toFixed(2) + "px)";
  }

  /**
   * 席から席へ滑らせる。
   * @param {Element} tab 行き先の席
   * @param {object} [o]  {jump:true} なら滑らずに置くだけ
   */
  function to(tab, o) {
    if (!lens || !tab) return;
    const opt = o || {};
    if (timer) { clearTimeout(timer); timer = 0; }

    const from = at && at.isConnected ? at : null;
    at = tab;
    lens.hidden = false;

    const dst = seatBox(tab);
    if (!from || from === tab || opt.jump) { place(dst); return; }

    const dist = dst.x - seatBox(from).x;
    if (!dist) { place(dst); return; }

    /* 滑る長さと曲線は glide から。押した指には「離したときの速さ」が
       ありませんが（タップにはそれが無い）、glide はそのとき**道のりの
       割合**で答えます——隣の席へは短く、端から端へは長く。決め打ちの
       一つの数で送ると、その二つが同じ時間になります。 */
    const g = M.glide(dist, 0, { span: bar.offsetWidth, base: M.ms("--m-nav") });
    place(dst, g.ms, g.ease);
    /* 滑り終わったら 0ms へ戻します——戻さないと、次に幅が変わったとき
       （回転・キーボード）置きなおしまで滑って見えます。 */
    if (g.ms) timer = setTimeout(() => { timer = 0; place(seatBox(at)); }, g.ms + 20);
  }

  /** 席の大きさが変わった（回転・キーボード）ときに置きなおす。 */
  function sync() {
    if (!lens || !at || !at.isConnected || timer) return;
    place(seatBox(at));
  }

  /** 押している席がレンズの下なら、レンズも一緒にふくらむ。 */
  function hold(tab) {
    if (!lens) return;
    const on = !!tab && tab === at;
    if (on === held) return;
    held = on;
    lens.classList.toggle("is-held", on);
  }

  /** 帯に一枚だけ置く。`buildTabs` のたびに呼ばれます。 */
  function mount(el) {
    bar = el;
    lens = document.createElement("i");
    lens.className = "tab-lens";
    lens.setAttribute("aria-hidden", "true");
    lens.hidden = true;
    /* いちばん先に置きます。レンズは z-index 0 なので、順番がそのまま
       重なりの順——丸薬・縁の屈折・押した光・そして席の絵と字
       （z-index 1）。**席の絵と字より前に出してはいけません。** */
    bar.prepend(lens);
    at = null;
    held = false;
    if (timer) { clearTimeout(timer); timer = 0; }
  }

  KN.tabLens = { mount, to, sync, hold, REST_H };
})();
