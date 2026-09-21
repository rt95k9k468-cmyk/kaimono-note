/* =========================================================
   くらしノート — 帯のレンズ（liquid glass lens）

   下の帯の「いま居る席」の印は、長いあいだ**席ごとの小さな丸**でした
   （`.tab-ico` の 40×26px に `--c-primary-soft` を敷いたもの）。席を移ると、
   前の席の丸が消えて、次の席の丸が出る。**動いたものは何もありません。**

   参考にした画面（Structured、1284×2776＝3倍で実測）はそうではありません。
   印は**一枚のガラスのレンズ**で、席から席へ滑ります。そして滑っている
   あいだ、**レンズは帯自身の字を曲げます**——後ろのページではなく、
   帯に載っている絵と名前のほうを。

   ■ 実測（動画 60fps・6.2秒・356コマ。値はすべて3で割った CSS px）

     ・休んでいるとき … **75 × 53px の丸薬**、地はべた塗りの灰
       （実測 233／帯の白は 253）。歪みなし。
     ・滑っているとき … **77 × 71px の、ほぼ丸**（縦だけ 1.34倍に育つ。
       横幅は変わらない）。地は 246 の乳白、縁に 232 の輪。
     ・レンズの中 … **真ん中が空**。字と絵は**ふちへ押し出されて弧に
       曲がり**、進む向きの先に桃、後ろに黄の色ズレが出る。
     ・着いたら丸薬へ戻り、しばらくして地もべた塗りへ落ち着く
       （実測：f140〜150 はまだガラス、f220 でべた塗り）。

   ■ 中身が「ふちへ押し出される」の正体

     真ん中が空になる、というのが手がかりでした。ふちに寄るだけなら、
     真ん中には薄まった中身が残ります。**空になる**ということは、
     レンズの真ん中が**元のごく狭いところ**を引き伸ばしている、という
     ことです——虫めがねと同じ。

     出したい点の半径を r（0〜1）、引いてくる元の半径を s(r) として、

         中  （r ≤ RC）… s(r) = r / MAG        ……一様に MAG 倍の虫めがね
         ふち（r > RC）… そこから s(1)=1 へ滑らかに戻す

     とします。中では拡大率がどこも同じなので、**絵の形が崩れません**。
     ふちでは ds/dr が大きくなるので、元の広い輪がせまい輪へ**半径方向に
     潰れ**——角度はそのままなので、字は**弧になって**ふちに貼りつく。

     **一度こわした話。** はじめは一本のべき乗（s(r) = r^3.6）で書いて
     いました。真ん中は確かに空きましたし、字もふちへ行きました。でも
     あの式は**ふちの拡大率が 1/P ＝ 0.28倍**で、字が 1px の輪へ潰れて
     しまう——実測すると、参考画面では歯車も「設」も**読める大きさの
     まま**弧になっていました。潰す式と、拡大して押し出す式は、見た目が
     途中まで同じなので、絵を並べるまで気づきませんでした。

   ■ どうやって曲げるか

     Safari は `backdrop-filter: url(#…)` を受け付けません（CLAUDE.md の
     ガラスの節）。**でも `filter: url(#…)` は要素に効きます。**
     幸い、曲げたい相手は後ろのページではなく**帯自身**——つまり自分の
     DOM です。だからレンズの中に**タブの行の写し**を置いて、写しのほうに
     フィルタを掛ければ済みます。

     地図（`feImage`）は canvas で一度だけ焼いた PNG です。一画素ごとに
     上の式をそのまま計算して、ずらす量を R（横）と G（縦）に入れます。
     放射グラデーションを重ねて近似する道もありますが、あれは「量」しか
     持てず**向き**を持てません。正確に描いたほうが短くて速い。

     色ズレ（色収差）は、**同じ地図で押し出す量をチャンネルごとに
     変えて**三度走らせ、R・G・B を一枚ずつ取り出して足します。

   ■ 効かなかったときに、どう壊れるか

     **写しは、元の行とぴったり重なる場所に置きます。** だから
     `feDisplacementMap` が効かない環境では、写しは**歪まないまま元の
     位置に出る**——つまり「ふつうの帯」に見えます。壊れ方を安全側に
     倒すために、写しの位置はレンズの中で常に元の行と一致させること。
     ここをずらすと、効かない環境で**字が二重に**なります。

   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const M = KN.motion;

  /* ---- 寸法。実測（上）を、この帯の丈（--tab-cap 64px）へ写したもの ---- */

  /* 丸薬の丈。参考画面は 53px／カプセル 70px ＝ 0.757。64 × 0.757 ≒ 48。 */
  const REST_H = 48;
  /* 滑っているあいだ、縦に育つ倍率（実測 53 → 71px ＝ 1.34）。
     横幅は**変えません**——実測でも 75 → 77px、誤差のうちでした。 */
  const BULGE = 1.34;
  /* 席の幅から左右に逃がすぶん。 */
  const INSET_X = 3;

  /* 虫めがねの倍率と、ふちが始まる半径。

     **倍率は、レンズの中身が外へ出ていかない上限で決まります。** 席の
     中身（絵と名前）はレンズとほぼ同じ幅なので、いちばん外の字は
     r ≒ 0.6 のあたりに居ます。MAG を 2.55 にしていたとき、そこは
     出口で r ＝ 1.53 ——**ふちの外**です。実測の絵では、席の名前が
     まるごと消えて、かけらだけがふちに貼りついていました。
     1.62 なら 0.97 で、ぎりぎり中に収まります。 */
  const MAG = 1.62;
  const RC = 0.34;

  /* 色ズレの開き。R をいちばん遠くへ、B をいちばん手前に置きます。 */
  const ABER = 0.055;

  /* 地図の目の細かさ。正規化した円の上で焼くので、これで足ります。 */
  const MAP_N = 96;

  const FILTER_ID = "kn-tab-lens";

  /* 地図は大きさ（縦横比）ごとに違うので、焼いたものを覚えておきます
     ——毎フレーム焼くと `toDataURL` だけで一拍ぶん食べます。実際に
     使う大きさは数えるほどしかないので、二回目からはただです。 */
  const maps = new Map();

  /** 引いてくる元の半径 ÷ 出したい点の半径。いつも 1 以下（内側を引く）。 */
  function pull(r) {
    if (r <= RC) return 1 / MAG;
    /* RC から 1 へ、滑らかに 1/MAG → 1 へ戻します。smoothstep なので
       途中で戻ることがありません（＝絵が折り返しません）。 */
    const t = (r - RC) / (1 - RC);
    const w = t * t * (3 - 2 * t);
    return (1 / MAG) + (1 - 1 / MAG) * w;
  }

  /**
   * レンズの箱（w×h）に合う地図を焼く。
   * @returns {{url:string, scale:number}} `scale` はフィルタへ渡す数。
   *   **地図と対で返すこと**——二か所で別々に計算すると、片方だけ直した
   *   日に押し出す量が倍になります（地図は 0〜1 に収まっているので、
   *   絵は壊れず「なぜか効きが弱い」形で出ます＝見つけにくい）。
   */
  function bakeMap(w, h) {
    const key = Math.round(w) + "x" + Math.round(h);
    if (maps.has(key)) return maps.get(key);

    const c = document.createElement("canvas");
    c.width = c.height = MAP_N;
    const g = c.getContext("2d");
    const img = g.createImageData(MAP_N, MAP_N);
    const d = img.data;

    /* 先に、いちばん大きい押し出しを測ります。地図に書けるのは 0〜1 の
       範囲なので、そこがちょうど端に来るように割ってから書きます。 */
    const dxs = new Float32Array(MAP_N * MAP_N);
    const dys = new Float32Array(MAP_N * MAP_N);
    let big = 1e-6;
    for (let y = 0; y < MAP_N; y++) {
      for (let x = 0; x < MAP_N; x++) {
        const u = ((x + 0.5) / MAP_N) * 2 - 1;
        const v = ((y + 0.5) / MAP_N) * 2 - 1;
        const r = Math.hypot(u, v);
        const i = y * MAP_N + x;
        if (r > 1e-4 && r <= 1) {
          const k = pull(r) - 1;              // 負の数
          dxs[i] = u * k * (w / 2);
          dys[i] = v * k * (h / 2);
          const m = Math.max(Math.abs(dxs[i]), Math.abs(dys[i]));
          if (m > big) big = m;
        }
      }
    }
    const scale = big * 2;
    for (let i = 0; i < MAP_N * MAP_N; i++) {
      const j = i * 4;
      d[j]     = Math.max(0, Math.min(255, Math.round((0.5 + dxs[i] / scale) * 255)));
      d[j + 1] = Math.max(0, Math.min(255, Math.round((0.5 + dys[i] / scale) * 255)));
      d[j + 2] = 128;
      d[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const out = { url: c.toDataURL("image/png"), scale };
    maps.set(key, out);
    return out;
  }

  /* ---- フィルタの一式。**一度だけ**組みます ---- */

  let fx = null;   // { svg, image, dR, dG, dB }

  function buildFilter() {
    if (fx) return fx;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";

    const f = document.createElementNS(NS, "filter");
    f.setAttribute("id", FILTER_ID);
    /* **sRGB で計算すること。** 既定の linearRGB だと、薄墨の字が
       押し出されたところで妙に明るく抜けます（絵の具の混ざり方が
       画面のそれと違うので）。 */
    f.setAttribute("color-interpolation-filters", "sRGB");
    f.setAttribute("x", "-2%");
    f.setAttribute("y", "-2%");
    f.setAttribute("width", "104%");
    f.setAttribute("height", "104%");

    /* **効かなかったときの受け皿を、式のほうに置きます。**

       `feImage` が絵を出せなかったら（Safari はデータURIの地図で
       つまずいた前例があり、こちらでは実機を確かめられません）、
       地図は「透明な黒」になります。黒＝0 なので、ずらす量は
       `scale × (0 − 0.5)` ——**どの画素も同じだけ斜めにずれる**。
       レンズの中身がまるごと 12px ばかり飛ぶ、という壊れ方です。

       そこで、地図の下に**真ん中の灰（128,128,128 ＝ ずらさない）**を
       敷いておきます。絵が出れば絵が勝ち、出なければ灰が残る
       ——後者は「歪まないガラスの札」＝いまの姿そのものです。
       **壊れ方は安全側に**、を式で言っておく一行。 */
    const flat = document.createElementNS(NS, "feFlood");
    flat.setAttribute("flood-color", "rgb(128,128,128)");
    flat.setAttribute("flood-opacity", "1");
    flat.setAttribute("result", "flat");
    f.append(flat);

    const image = document.createElementNS(NS, "feImage");
    image.setAttribute("result", "mapimg");
    image.setAttribute("preserveAspectRatio", "none");
    /* 地図はレンズの箱いっぱいに伸ばします。中身は正規化した円の上で
       焼いてあるので、伸ばしても向きは狂いません（大きさのほうは
       焼くときに入れてあります）。

       **x / y / width / height は書かないこと。** 書かなければ、この
       一枚はフィルタの領域いっぱい＝レンズの箱ぴったりになります。
       `width="100%"` と書いた時期がありますが、百分率が何に対する
       ものかを決めるのは `primitiveUnits`（既定 userSpaceOnUse）で、
       そこでの基準は**この SVG の viewport**です——地図を入れてある
       SVG は 0×0 なので、**100% が 0px** になりました。
       絵としては「地図が真っ黒（＝どこも 0,0）」なので、ずらす量は
       どの画素でも `scale × (0 − 0.5)` の一定値——つまり**全体が
       同じだけ平行移動しただけ**で、放射状に押し出されません。
       色ズレだけがきれいに出ていたので、いかにも効いているように
       見えました（実際そう見えて、一度これで通しかけました）。 */
    f.append(image);

    const over = document.createElementNS(NS, "feComposite");
    over.setAttribute("in", "mapimg");
    over.setAttribute("in2", "flat");
    over.setAttribute("operator", "over");
    over.setAttribute("result", "map");
    f.append(over);

    /* 色ズレ。**同じ地図で、押し出す量だけを変えて三度**走らせます。
       違う地図を三枚持つと、直した日に一枚だけ古くなります。 */
    const chans = [
      ["R", "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
      ["G", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
      ["B", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"],
    ];
    const disp = {};
    chans.forEach(([name, mat]) => {
      const dm = document.createElementNS(NS, "feDisplacementMap");
      dm.setAttribute("in", "SourceGraphic");
      dm.setAttribute("in2", "map");
      dm.setAttribute("xChannelSelector", "R");
      dm.setAttribute("yChannelSelector", "G");
      dm.setAttribute("scale", "0");
      dm.setAttribute("result", "d" + name);
      f.append(dm);
      const cm = document.createElementNS(NS, "feColorMatrix");
      cm.setAttribute("in", "d" + name);
      cm.setAttribute("type", "matrix");
      cm.setAttribute("values", mat);
      cm.setAttribute("result", "c" + name);
      f.append(cm);
      disp[name] = dm;
    });

    /* 三枚を足し合わせます。重なっているところ（字の芯）は不透明度が
       1 で頭打ちになり、色は元どおり。重なっていないところ＝押し出し量の
       差のぶんだけ、桃（R＋B）や黄（R＋G）の縁が残ります。 */
    const add = (a, b, out) => {
      const co = document.createElementNS(NS, "feComposite");
      co.setAttribute("in", a);
      co.setAttribute("in2", b);
      co.setAttribute("operator", "arithmetic");
      co.setAttribute("k1", "0"); co.setAttribute("k2", "1");
      co.setAttribute("k3", "1"); co.setAttribute("k4", "0");
      if (out) co.setAttribute("result", out);
      f.append(co);
    };
    add("cR", "cG", "cRG");
    add("cRG", "cB", null);

    svg.append(f);
    document.body.append(svg);
    fx = { svg, image, dR: disp.R, dG: disp.G, dB: disp.B };
    return fx;
  }

  /** いま掛かっている地図の `scale`（`bakeMap` が対で返したもの）。 */
  let mapScale = 0;

  /** 押し出しの強さを置きなおす。0 なら歪みません。 */
  function setWarp(amount) {
    const s = mapScale * amount;
    fx.dR.setAttribute("scale", (s * (1 + ABER)).toFixed(2));
    fx.dG.setAttribute("scale", s.toFixed(2));
    fx.dB.setAttribute("scale", (s * (1 - ABER)).toFixed(2));
  }

  /* ---- ベジェを JS で辿る ----

     滑る長さと曲線は `KN.motion.glide` から取ります（指を離したあとの
     滑りは一本から出す、という決めごと）。ただしあちらが返す曲線は
     CSS の文字列なので、こちらで数として辿れるようにします。

     **なぜ transition に任せないのか。** 動かすものが三つ（位置・丈・
     押し出しの強さ）あって、そのうち押し出しの強さは SVG の属性です
     ——CSS の transition が触れるところに居ません。三つを別々の時計で
     動かすと、いつか必ずずれます。**時計は一つ。** */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const fx_ = (t) => ((ax * t + bx) * t + cx) * t;
    const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      let t = x;
      for (let i = 0; i < 6; i++) {
        const e = fx_(t) - x;
        if (Math.abs(e) < 1e-4) break;
        const d = dfx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      t = Math.max(0, Math.min(1, t));
      return ((ay * t + by) * t + cy) * t;
    };
  }
  const LINEAR = (x) => x;
  function easeOf(str) {
    const m = /cubic-bezier\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(str || "");
    return m ? bezier(+m[1], +m[2], +m[3], +m[4]) : LINEAR;
  }

  /* ---- レンズそのもの ---- */

  let bar = null;
  let lens = null, warpEl = null, copyEl = null;
  let at = null;            // いま乗っている席の DOM
  let anim = 0;             // 走っている rAF
  let held = false;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

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

  /** 位置と丈を書く。**書くだけ**——測るのは呼ぶ側の仕事です。 */
  function place(x, w, h, cy) {
    lens.style.width = w.toFixed(2) + "px";
    lens.style.height = h.toFixed(2) + "px";
    lens.style.transform =
      "translate(" + x.toFixed(2) + "px," + (cy - h / 2).toFixed(2) + "px)";
    /* 写しは、**元の行とまったく同じところ**へ。ここがずれると、
       フィルタの効かない環境で字が二重になります（頭の注記）。 */
    copyEl.style.transform =
      "translate(" + (-x).toFixed(2) + "px," + (-(cy - h / 2)).toFixed(2) + "px)";
  }

  /** 帯の行の写しを取り直す。滑り出す瞬間にだけ呼びます。 */
  function snap() {
    copyEl.textContent = "";
    const frag = document.createDocumentFragment();
    bar.querySelectorAll(".tab").forEach((t) => {
      const c = t.cloneNode(true);
      c.removeAttribute("id");
      c.removeAttribute("aria-controls");
      c.removeAttribute("role");
      c.setAttribute("aria-hidden", "true");
      frag.append(c);
    });
    copyEl.append(frag);
    copyEl.style.width = bar.offsetWidth + "px";
    copyEl.style.height = bar.offsetHeight + "px";
  }

  /** ガラスの見た目を、押し出しの強さと一緒に出し入れする。 */
  function paintWarp(amount) {
    lens.style.setProperty("--lens-warp", amount.toFixed(3));
    if (fx) setWarp(amount);
  }

  function stop() {
    if (anim) cancelAnimationFrame(anim);
    anim = 0;
  }

  /** 休んでいる姿（席の上の丸薬）へ戻す。 */
  function rest(tab) {
    const s = seatBox(tab);
    lens.classList.remove("is-flying");
    place(s.x, s.w, REST_H, s.cy);
    paintWarp(0);
    copyEl.textContent = "";
    /* **休んでいるあいだは、フィルタを外しておきます。** 中身が空でも、
       `filter` が付いている要素はそれ用の面を一枚持たされます。実機
       （iOS Safari）では確かめられない以上、掛けておく理由の無いあいだは
       掛けないでおくのが安いほうです。掛けるのは滑っているあいだだけ
       ——それが「押しているあいだだけ」に当たる手当てです。 */
    warpEl.style.filter = "";
  }

  /**
   * 席から席へ滑らせる。
   * @param {Element} tab 行き先の席
   * @param {object} [o]  {jump:true} なら滑らずに置くだけ
   */
  function to(tab, o) {
    if (!lens || !tab) return;
    const opt = o || {};
    stop();

    const from = at && at.isConnected ? at : null;
    at = tab;
    lens.hidden = false;

    const dst = seatBox(tab);
    if (!from || from === tab || opt.jump || M.still()) {
      rest(tab);
      return;
    }
    const src = seatBox(from);
    const dist = dst.x - src.x;
    if (!dist) { rest(tab); return; }

    /* 滑る長さと曲線は glide から。押した指には速さがありませんが
       （タップには「離したときの速さ」が無い）、glide はそのとき
       **道のりの割合**で答えます——隣の席へは短く、端から端へは長く。
       決め打ちの一つの数で送ると、その二つが同じ時間になります。 */
    const span = bar.offsetWidth;
    const g = M.glide(dist, 0, { span, base: M.ms("--m-nav") });
    if (!g.ms) { rest(tab); return; }
    const ease = easeOf(g.ease);

    /* 育ち方は、この滑りの**速さ**から。glide が長さを決めたあとなので、
       速さは「道のり ÷ その長さ」——同じ隣の席でも、勢いよく決まった
       滑りほど丸くなります。 */
    const v = Math.abs(dist) / g.ms;               // px/ms
    const bulge = clamp(v / 0.45, 0.35, 1);

    lens.classList.add("is-flying");
    snap();
    buildFilter();
    warpEl.style.filter = "url(#" + FILTER_ID + ")";
    /* 地図は、**いちばん膨らんだ姿**の箱で一枚だけ焼きます。滑って
       いるあいだ丈は毎フレーム変わりますが、そのつど焼き直すと
       `toDataURL` だけで一拍ぶん食べます（実測：一枚 2〜4ms）。
       縦横比のずれは、押し出す向きがわずかに傾くだけで、絵としては
       見えません。 */
    const map = bakeMap(dst.w, REST_H * BULGE);
    mapScale = map.scale;
    fx.image.setAttribute("href", map.url);
    fx.image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", map.url);

    const t0 = performance.now();
    const step = (now) => {
      const p = clamp((now - t0) / g.ms, 0, 1);
      const e = ease(p);
      /* 育つのも歪むのも、**行きと帰りで同じ一つの山**（sin）。
         別々の曲線を当てると、着いたときにどちらかが残ります。 */
      const hump = Math.pow(Math.sin(Math.PI * p), 0.7);
      const h = REST_H * (1 + (BULGE - 1) * bulge * hump);
      const x = src.x + dist * e;
      const w = src.w + (dst.w - src.w) * e;
      place(x, w, h, dst.cy);
      paintWarp(hump * bulge);
      if (p < 1) { anim = requestAnimationFrame(step); return; }
      anim = 0;
      rest(tab);
    };
    place(src.x, src.w, REST_H, src.cy);
    paintWarp(0);
    anim = requestAnimationFrame(step);
  }

  /** 席の大きさが変わった（回転・キーボード）ときに置きなおす。 */
  function sync() {
    if (!lens || !at || !at.isConnected) return;
    if (anim) return;          // 滑っている最中は、そちらが持っています
    rest(at);
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
    warpEl = document.createElement("i");
    warpEl.className = "tab-lens-warp";
    copyEl = document.createElement("i");
    copyEl.className = "tab-lens-copy";
    warpEl.append(copyEl);
    lens.append(warpEl);
    /* いちばん先に置きます。休んでいるあいだレンズは z-index 0 なので、
       順番がそのまま重なりの順——丸薬・縁の屈折・押した光・そして席の
       絵と字（z-index 1）。滑っているあいだだけ 2 へ上がって、
       **元の行を覆います**（覆わないと、歪んだ写しと歪んでいない元が
       二重に見えます）。 */
    bar.prepend(lens);
    at = null;
    held = false;
  }

  KN.tabLens = { mount, to, sync, hold, REST_H, BULGE, MAG, RC };
})();
