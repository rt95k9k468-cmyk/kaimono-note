/* =========================================================
   くらしノート — UI primitives (sheet, toast, dialogs)
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;

  const sheetRoot = () => document.getElementById("sheet-root");
  const toastRoot = () => document.getElementById("toast-root");

  const openSheets = [];

  /* 紙の段は CSS が持っています（base.css の「重なりの順」）。重なるたびに
     二段ずつ上げるので、**その足もとだけ**をここで読みます。 */
  const zSheet = () => parseInt(
    getComputedStyle(document.documentElement).getPropertyValue("--z-sheet"), 10) || 100;

  /* ---------------- 紙が生まれるところ ----------------

     紙は画面の下からせり上がっていました。＋を押して出てくる紙が、押した
     指とは関係のないところ——画面の下端——から来るので、「＋がこれを出した」
     ことが動きの中に無い。参考にした画面（Structured）は、押した丸のところ
     から紙が育ちます。

     ここで覚えるのは**最後に押された指の位置**だけです。呼び出し側は一つも
     書き換えません——押してから紙が開くまでのあいだ（0.8秒）に開いた紙は、
     その場所から育ちます。押していないのに開いた紙（プログラムから、
     キーボードから）は覚えがないので、これまでどおり下からせり上がります。

     ボタンの真ん中ではなく**指の位置**を覚えるのは、そのほうが正直だから
     でもありますが、何より**測らなくて済む**からです。ボタンの箱を測ると、
     アプリじゅうのどの pointerdown でもレイアウトを一度取り直すことに
     なります——一覧を送りはじめる指も、その一つです。

     capture で拾うのは、途中で止められる（stopPropagation する）ボタンが
     あるからです。押されたことだけは、どこで止まっても知りたい。 */
  let pressed = null;
  document.addEventListener("pointerdown", (e) => {
    const b = e.target && e.target.closest
      && e.target.closest("button, [role='button'], a[href], [data-grow]");
    pressed = b ? { x: e.clientX, y: e.clientY, t: Date.now(),
      fab: !!b.closest(".add-fab, .fab-menu-b") } : null;
  }, true);

  const still = () => !!(window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /** 押されたところから育てる支度。育てないなら null。 */
  /* 欄の中のカーソルの行が見えるよう、欄の送り位置だけを動かす。行の高さは同じ幅・同じ字の
     写し（見えない div）で測る。 */
  function keepCaretInView(ta) {
    if (document.activeElement !== ta || ta.scrollHeight <= ta.clientHeight) return;
    const cs = getComputedStyle(ta);
    const m = document.createElement("div");
    ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "wordBreak", "lineBreak",
      "overflowWrap", "textIndent", "fontFeatureSettings"].forEach((k) => { m.style[k] = cs[k]; });
    Object.assign(m.style, { position: "absolute", visibility: "hidden", top: "0", left: "-9999px",
      width: `${ta.clientWidth}px`, boxSizing: "border-box", whiteSpace: "pre-wrap", border: "0" });
    m.textContent = ta.value.slice(0, ta.selectionEnd);
    const at = document.createElement("span");
    at.textContent = "​";
    m.appendChild(at);
    document.body.appendChild(m);
    const top = at.offsetTop, bottom = top + at.offsetHeight;
    m.remove();
    const pad = parseFloat(cs.paddingBottom) || 0;
    if (bottom + pad > ta.scrollTop + ta.clientHeight) ta.scrollTop = bottom + pad - ta.clientHeight;
    else if (top - pad < ta.scrollTop) ta.scrollTop = Math.max(0, top - pad);
  }

  function seedFrom(el) {
    if (!pressed || Date.now() - pressed.t > 800) return null;
    /* 640px 以上では紙は画面の真ん中のダイアログで、別の transform を
       持っています。そちらは触りません。 */
    if (!window.matchMedia("(max-width: 639px)").matches) return null;
    if (still()) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    /* いまの transform は translate(-50%, 100%)——**100% ＝ 自分の高さ**
       なので、開いたときの箱は、いま測った箱を高さぶん上へ戻したもの。 */
    const cx = r.left + r.width / 2;
    const cy = r.top - r.height / 2;
    el.style.setProperty("--sx", `${(pressed.x - cx).toFixed(1)}px`);
    el.style.setProperty("--sy", `${(pressed.y - cy).toFixed(1)}px`);
    /* 畳んだ姿は、**動きを止めたまま**確定させます。三行とも要ります。

       ここを一行でも落とすと、これまでどおり下からせり上がるだけになります
       ——しかも黙って。実測でつまずいた順に書くと：

       ・class を足すだけ（読まない）… `.is-open` がすぐ次に付くので、
         そのあいだにスタイルが一度も解決されず、ブラウザが「動き出す前の
         姿」として覚えているのは上の getBoundingClientRect のときのまま。
       ・transition を止めずに読む … 今度は解決されますが、そこで
         「下に控えた紙 → 畳んだ姿」の動きが**その場で始まります**。次の
         rAF で開きを頼んだときには、まだ下に控えたところにいるので、
         そこから開くことになる（実測：scale は 1 のまま、ty だけ 666→0）。

       止めて、読んで、戻す。これで「畳んだ姿から開く」になります。 */
    el.style.transition = "none";
    el.classList.add("is-from-origin");
    void getComputedStyle(el).transform;
    el.style.transition = "";
    return { x: pressed.x, y: pressed.y, fab: pressed.fab, home: pressed.fab ? fabAt() : null };
  }

  /* ---- ＋から出た紙は、＋へ縮んで帰る（docs/roadmap-2.0.md の V16） ----

     ＋の上に立ち上がる札から開いた紙は、閉じるころには札がもう無いので、
     押した点（札のあった所）へ帰ると何も無い所へ消えていきます。帰り先を、
     閉じる瞬間の＋の真ん中に置き直します。返すのは＋（着いたときに受け止めさせる）。

     打っているあいだは＋が下へ引っ込んでいて（base.css の `.has-fab.kb-open .dock`）、
     閉じる瞬間には測れません。保存で閉じるのはたいていこのときで、帰り先が無いと
     縮まずに速い閉じ方へ落ち、「ぱっと消える」に見えていました（U17、10月7日）。
     そこで開いたときの＋の真ん中を覚えておき、見えなければそこへ帰します
     ——キーボードが下りれば＋はそこへ戻ってきます。
     ただし iOS はキーボードのぶん innerHeight ごと縮め（app.js の fit）、下りると
     一気に伸びます。下の端に付いた紙は縮む途中で 380px ほど下へ跳んでいました
     （利用者「ショッピングの戻り方がダメ」）。なので帰る前に紙を**いまの上端と高さで
     留め**、行き先は開いたとき（キーボードの無い姿）の＋の座標にします。上から
     測った座標は、下の端が伸びても動きません。 */
  function fabAt() {
    /* 引っ込んだ＋は透けたまま上の端だけ画面に残るので、箱では見分けられない
       （真ん中は画面の下の外＝キーボードの裏へ縮んでいた）。 */
    if (document.documentElement.classList.contains("kb-open")) return null;
    const fab = document.querySelector("#dock .add-fab");
    const f = fab && fab.getBoundingClientRect();
    const y = f && f.top + f.height / 2;
    if (!f || !f.width || y >= window.innerHeight || y <= 0) return null;
    return { fab, x: f.left + f.width / 2, y };
  }
  function aimHome(el, seen, homeOf) {
    let live = fabAt();
    let at = live || (seen && seen.fab && seen.fab.isConnected ? seen : null);
    /* ＋ではない帰り先（sheet の opts.home）。閉じる瞬間に測る。打っているあいだは
       下の留め方を使う（キーボードが下りても紙が跳ばない）。 */
    if (homeOf) {
      const t = homeOf();
      const b = t && t.isConnected && t.getBoundingClientRect();
      const y = b && b.top + b.height / 2;
      at = b && b.width && y > 0 && y < window.innerHeight ? { fab: t, x: b.left + b.width / 2, y } : null;
      live = at && !document.documentElement.classList.contains("kb-open") ? at : null;
    }
    if (!at) return null;
    let r = el.getBoundingClientRect();
    /* いまの姿は translate(-50%, 0)（開いた姿）。ずれていればそのぶんを引いて、
       --sx/--sy が測る相手（開いた箱の真ん中）を出します。 */
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    if (!live) {
      const h = el.offsetHeight;
      el.style.top = `${(r.top - m.f).toFixed(1)}px`;
      el.style.bottom = "auto";
      el.style.height = `${h}px`;
      el.style.maxHeight = "none";
      r = el.getBoundingClientRect();
    }
    const cx = r.left + r.width / 2 - (m.e + el.offsetWidth / 2);
    const cy = r.top + r.height / 2 - m.f;
    el.style.setProperty("--sx", `${(at.x - cx).toFixed(1)}px`);
    el.style.setProperty("--sy", `${(at.y - cy).toFixed(1)}px`);
    return at.fab;
  }

  /* ---- 押した行の丸薬が、紙の頭の丸薬へ伸びていく（C2） ----

     紙は押した点から育ちますが、それだけだと「どの行の続きなのか」は
     題の位置でしか言えません。行の丸薬（from）そのものが、紙の頭の丸薬
     （to）の場所・大きさへ伸びていけば、頭の粒が**あの行の丸薬の続き**だと
     絵が言います。

     動くのは影武者の一枚（to の写し）で、飛んでいるあいだは本物の二つを
     隠します——紙そのものは押した点から縮んだ姿で育ってくる途中なので、
     頭の丸薬を紙に乗せたまま動かすと、行き先が毎フレーム動いて追えません。

     行き先は**開き終えたときの箱**です。紙に `.is-open` を付けた姿を、
     動きを止めたまま一度だけ測ります（seedFrom と同じ「止めて、読んで、
     戻す」）。rAF の中で測るのは、紙を開いたあとで頭の字（いつ・印）が
     埋まり、丸薬の縦の位置が変わるからです。

     速さと曲線は紙が育つのと同じ（--m-sheet-grow / --push-e）——同じ時に
     着くので、着いた瞬間に本物へ入れ替えても継ぎ目が出ません。

     返すのは、途中で紙が閉じたときの後始末。 */

  /* 写した要素に、元の見た目を焼きつけます。行の丸薬の塗り・絵のマスクは
     `.tl-row` の中でだけ効く規則と変数から出ているので、外へ出した写しには
     掛かりません。算出された値（変数は解決済み）を、子まで一つずつ移します。 */
  const FREEZE = ["width", "height", "background-color", "background-image",
    "border-radius", "color", "fill", "opacity", "mask-image", "mask-size",
    "mask-position", "mask-repeat", "-webkit-mask-image", "-webkit-mask-size",
    "-webkit-mask-position", "-webkit-mask-repeat"];
  function freeze(src, dst) {
    const cs = getComputedStyle(src);
    for (const p of FREEZE) {
      const v = cs.getPropertyValue(p);
      if (v) dst.style.setProperty(p, v);
    }
    const a = src.children, b = dst.children;
    for (let i = 0; i < a.length && i < b.length; i++) freeze(a[i], b[i]);
  }

  /* 影武者を一枚こしらえます。行き（行 → 頭）と帰り（頭 → 行）で同じもの。

     地は頭の丸薬の写し（hero）。その上に、行の丸薬の写し（row を freeze
     したもの）を重ねます——行の側では、上の写しが見えていて、頭の側では
     消えている。飛ぶあいだにその濃さを動かすので、色がパッと変わりません。

     `k` は絵の倍率（行の絵 ÷ 頭の絵）。大きさは変形の掛からない値（算出
     された width）で比べます。頭の絵は縮んだ紙の中にあるので、見えている
     箱で測ると何分の一にもなり、影武者の絵が 2.4 倍に膨らんでいました。 */
  function pillGhost(hero, row, z) {
    const cs = getComputedStyle(hero);
    const ghost = hero.cloneNode(true);
    ghost.className = "hero-node sheet-morph";
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    ghost.style.background = cs.backgroundColor;
    /* 字の色も写します。絵は currentColor で塗られていて、頭の白は
       `.sheet-hero` から継いでいたもの——紙の外に置いた写しは地の字の色
       （黒）を継ぎ、飛んでいるあいだだけ真っ黒なシルエットになっていました。 */
    ghost.style.color = cs.color;
    ghost.style.zIndex = String(z);
    const under = row.cloneNode(true);
    freeze(row, under);
    under.removeAttribute("class");
    Object.assign(under.style, {
      position: "absolute", inset: "0", left: "0", top: "0",
      width: "auto", height: "auto", transform: "none", margin: "0",
      display: "grid", placeItems: "center", borderRadius: "inherit",
      visibility: "visible",
    });
    ghost.append(under);
    const sizeOf = (x, d) => (x && parseFloat(getComputedStyle(x).width)) || d;
    const k = sizeOf(row.firstElementChild, 32) / sizeOf(hero.firstElementChild, 38);
    const rowLook = { borderRadius: getComputedStyle(row).borderRadius,
      boxShadow: "0 0 0 0 transparent" };
    const heroLook = { borderRadius: cs.borderRadius, boxShadow: cs.boxShadow };
    return { ghost, under, k, rowLook, heroLook };
  }

  const pillBox = (r) => ({
    left: `${r.left}px`, top: `${r.top}px`,
    width: `${r.width}px`, height: `${r.height}px`,
  });

  /* 影武者の中身を動かします。t0 → t1 は「行らしさ」（1 ＝ 行、0 ＝ 頭）。
     絵は行では 32px、頭では 38px。箱と一緒に伸び縮みさせます。 */
  function pillInner(g, t0, t1, timing) {
    const sc = (t) => (t ? `scale(${g.k.toFixed(3)})` : "none");
    const usc = (t) => (t ? "none" : `scale(${(1 / g.k).toFixed(3)})`);
    const mark = g.ghost.firstElementChild;
    if (mark && mark !== g.under) {
      mark.animate([{ transform: sc(t0) }, { transform: sc(t1) }], timing);
    }
    const underMark = g.under.firstElementChild;
    if (underMark) {
      underMark.animate([{ transform: usc(t0) }, { transform: usc(t1) }], timing);
    }
    g.under.animate([{ opacity: t0 }, { opacity: t1 }], timing);
  }

  /* 行き（行 → 頭）。わけは上の「押した行の丸薬が、紙の頭の丸薬へ伸びていく」。
     返すのは、途中で紙が閉じたときの後始末（`.flying()` で、まだ飛んでいるか）。 */
  function morphPill(morph, el, z) {
    const from = morph && morph.from;
    const to = morph && morph.to;
    if (!from || !to || !from.isConnected || !el.contains(to)) return null;
    const a = from.getBoundingClientRect();
    if (!a.width || !a.height) return null;
    let b;
    if (el.classList.contains("is-open")) {
      /* 行から広がる紙（growCard）はもう開いた場所にいて、ずれているのは寄せたぶん（translate）だけ。 */
      const r = el.getBoundingClientRect(), s = restBox(el), t = to.getBoundingClientRect();
      b = { left: t.left + s.left - r.left, top: t.top + s.top - r.top, width: t.width, height: t.height };
    } else {
      el.style.transition = "none";
      el.classList.add("is-open");
      b = to.getBoundingClientRect();
      el.classList.remove("is-open");
      void getComputedStyle(el).transform;
      el.style.transition = "";
    }
    if (!b.width || !b.height) return null;

    const g = pillGhost(to, from, z);
    sheetRoot().append(g.ghost);
    from.style.visibility = "hidden";
    to.style.visibility = "hidden";

    const timing = { duration: KN.motion.ms("--m-sheet-grow"),
      easing: KN.motion.ease("--push-e"), fill: "both" };
    const run = g.ghost.animate([
      { ...pillBox(a), ...g.rowLook },
      { ...pillBox(b), ...g.heroLook },
    ], timing);
    pillInner(g, 1, 0, timing);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      from.style.visibility = "";
      to.style.visibility = "";
      g.ghost.remove();
    };
    finish.flying = () => !done;
    run.onfinish = finish;
    run.oncancel = finish;
    return finish;
  }

  /* ---- 閉じるときは、頭の丸薬が行の丸薬へ帰る ----

     行きの逆です。ただ、行き先が**じっとしていません**：保存すると時間割が
     組み直され、行は別の要素になったうえで、もといた場所から FLIP で
     滑ってきます（`flipRows`）。だから行き先は、動き出す前に一度決めるの
     ではなく、**毎フレーム探し直して**（morph.back() が id から引く）、
     動きの終わりの形を書き換えます（setKeyframes）。進み具合と曲線は
     ブラウザが持ったままなので、行き先が動いても速さは途切れません。

     速さと曲線は、行が収まる FLIP と同じ一族（--m-settle / --ease-settle）。
     「並びが変わった」結果を読ませる速さで、同じ場所へ一緒に収まります。

     帰らないとき：行が見つからない（別の日へ移した・消した）、画面の外、
     行きの影武者がまだ飛んでいる。途中で行を見失ったら、その場で薄れて消えます。 */
  function morphBack(morph, z) {
    const hero = morph && morph.to;
    const find = morph && morph.back;
    if (!hero || !find || !hero.isConnected) return;
    let row = find();
    if (!row) return;
    const a = hero.getBoundingClientRect();
    let b = row.getBoundingClientRect();
    const seen = (r) => r.width && r.height && r.bottom > 0 && r.top < window.innerHeight
      && r.right > 0 && r.left < window.innerWidth;
    if (!a.width || !a.height || !seen(b)) return;

    const g = pillGhost(hero, row, z);
    sheetRoot().append(g.ghost);
    hero.style.visibility = "hidden";
    row.style.visibility = "hidden";

    const timing = { duration: KN.motion.ms("--m-settle"),
      easing: KN.motion.ease("--ease-settle"), fill: "both" };
    const frames = (r) => [{ ...pillBox(a), ...g.heroLook }, { ...pillBox(r), ...g.rowLook }];
    const run = g.ghost.animate(frames(b), timing);
    pillInner(g, 0, 1, timing);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (row) row.style.visibility = "";
      hero.style.visibility = "";
      g.ghost.remove();
    };
    const lose = () => {
      if (row) row.style.visibility = "";
      row = null;
      const fade = g.ghost.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: KN.motion.ms("--m-state"), easing: KN.motion.ease("--ease-in"),
          fill: "forwards" });
      fade.onfinish = () => { run.cancel(); finish(); };
    };
    const follow = () => {
      if (done || !row) return;
      const now = find();
      if (!now) { lose(); return; }
      if (now !== row) {
        row.style.visibility = "";
        row = now;
        row.style.visibility = "hidden";
      }
      const r = row.getBoundingClientRect();
      if (Math.abs(r.left - b.left) + Math.abs(r.top - b.top)
          + Math.abs(r.width - b.width) + Math.abs(r.height - b.height) > 0.5) {
        b = r;
        run.effect.setKeyframes(frames(b));
      }
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
    run.onfinish = finish;
    run.oncancel = () => { if (row) finish(); };
  }

  /* ---- 一覧のカードが膨らんで紙になり、閉じると縮んでカードへ戻る ----

     ノートの書く紙（段4.3）。行の丸薬（上）と違って、動くのは**紙そのもの**
     です：紙は初めから開いた場所にいて、見える窓（clip-path）だけがカードの
     箱から紙いっぱいへ広がる。字は縮めない（transform で縮めると字がつぶれて
     見える）ので、紙の中身は窓が広がるあとから現れ、カードの字は写しが
     上へ滑りながら薄れます。

     帰りは窓をカードの箱へ戻します。行き先は**毎フレーム探し直す**
     （grow.back() が id から引く。直したノートは一覧の先頭へ移るので）——
     morphBack と同じ考え方。下へ払っていたら、その場所から戻ります。

     電話の幅だけ（広い画面は真ん中の一枚で、transform の形が違う）。動きを
     減らす設定なら使いません。 */
  const phone = () => window.matchMedia("(max-width: 639px)").matches;

  /** いまの transform を外した、開いたときの紙の箱。 */
  function restBox(el) {
    const r = el.getBoundingClientRect();
    const t = getComputedStyle(el).transform;
    const m = t && t !== "none" ? new DOMMatrixReadOnly(t) : null;
    const dy = m ? m.m42 : 0;
    /* 横は、真ん中に置く translate(-50%) から外れたぶん（左端から払っていた紙。V19）。 */
    const dx = m ? m.m41 + r.width / 2 : 0;
    return { left: r.left - dx, right: r.right - dx, top: r.top - dy, bottom: r.bottom - dy };
  }
  const radiusOf = (x) => parseFloat(getComputedStyle(x).borderTopLeftRadius) || 0;
  /* 窓の角。角の無い行（やることの時間割の行）は、紙の角で（角の立った白い箱に見えないように）。 */
  const roundOf = (card, el) => radiusOf(card) || radiusOf(el);
  const REST = "translate(-50%, 0px)";
  /* カードの箱にあたる窓（clip）。カードが紙の箱からはみ出していれば、紙ごとそちらへ寄せ
     （shift）、窓は紙の中に収める——やることの紙は中身ぶんの高さで下に浮くので、行は紙より
     上にいることが多い。紙より広い行は、真ん中を合わせて紙の幅に。収まるカード（ノート）は寄せない。 */
  function cardWindow(s, b, rad) {
    const W = s.right - s.left, H = s.bottom - s.top;
    const w = Math.min(b.width, W), h = Math.min(b.height, H);
    const L = b.left + (b.width - w) / 2, T = b.top + (b.height - h) / 2;
    const x = Math.min(Math.max(L - s.left, 0), W - w);
    const y = Math.min(Math.max(T - s.top, 0), H - h);
    const dx = L - s.left - x, dy = T - s.top - y;
    return {
      shift: Math.abs(dx) + Math.abs(dy) > 0.5 ? `${REST} translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` : null,
      clip: `inset(${y}px ${W - x - w}px ${H - y - h}px ${x}px round ${rad}px)`,
    };
  }
  /* 紙の角は紙から読む（上だけ丸い紙も、四隅の丸いカード＝2.0 の V19 も）。 */
  const fullClip = (el) => {
    const cs = getComputedStyle(el);
    const R = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"]
      .map((k) => `${parseFloat(cs[k]) || 0}px`).join(" ");
    return `inset(0px round ${R})`;
  };
  const seenBox = (r) => r.width && r.height && r.bottom > 0 && r.top < window.innerHeight
    && r.right > 0 && r.left < window.innerWidth;

  /** カードの写し（字が薄れて／現れて入れ替わるためのもの）。hide … 写しで隠すもの
      （やることの行の丸薬。丸薬は自分で頭へ飛ぶので、写しに残すと二つに見える）。 */
  function cardGhost(card, r, z, hide) {
    const g = card.cloneNode(true);
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    g.classList.add("sheet-morph");
    if (hide) g.querySelectorAll(hide).forEach((n) => { n.style.visibility = "hidden"; });
    Object.assign(g.style, {
      position: "fixed", margin: "0", boxSizing: "border-box", pointerEvents: "none",
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      zIndex: String(z), visibility: "visible",
    });
    sheetRoot().append(g);
    return g;
  }
  const kids = (el) => [...el.children];

  /** 行き。育てたら true。 */
  function growCard(grow, el, z) {
    const card = grow && grow.from;
    if (!card || !card.isConnected || still() || !phone()) return false;
    const a = card.getBoundingClientRect();
    if (!seenBox(a)) return false;
    el.style.transition = "none";
    el.classList.add("is-open");
    const s = restBox(el);
    const timing = { duration: KN.motion.ms("--m-sheet-grow"), easing: KN.motion.ease("--push-e") };
    const w = cardWindow(s, a, roundOf(card, el));
    /* 寄せないときは transform を握らない（育つ途中でも下へ払えば、その場所から帰る）。 */
    const run = el.animate(w.shift
      ? [{ transform: w.shift, clipPath: w.clip }, { transform: REST, clipPath: fullClip(el) }]
      : [{ clipPath: w.clip }, { clipPath: fullClip(el) }], timing);
    kids(el).forEach((k) => k.animate([{ opacity: 0 }, { opacity: 0, offset: .3 }, { opacity: 1 }], timing));
    const g = cardGhost(card, a, z + 1, grow.hide);
    /* 写しは窓の角と同じ速さで滑る（薄れるのは前半で）。先に紙の頭まで着くと、紙が行より上に
       開くとき（やること）、写しが窓の外へ出て上の行に重なっていた。 */
    g.animate([
      { opacity: 1, transform: "none" },
      { opacity: 0, offset: .45 },
      { opacity: 0, transform: `translate(${s.left - a.left}px, ${s.top - a.top}px)` },
    ], timing);
    card.style.visibility = "hidden";
    let over = false;
    const done = () => {
      if (over) return;
      over = true;
      g.remove();
      card.style.visibility = "";
      /* 膨らみきる前に閉じたときは、閉じる側が transition を握っている。 */
      if (el.classList.contains("is-open")) el.style.transition = "";
    };
    run.onfinish = done;
    run.oncancel = done;
    /* カードが隠れたまま残ると、ノートが消えたように見える。終わりの知らせが
       来なくても必ず戻す。 */
    setTimeout(done, timing.duration + 200);
    return true;
  }

  /** 帰り。紙を片づけてよくなるまでの ms（帰らないなら 0）。from は閉じる前の
      transform（下へ払っていたら、その場所）。 */
  function shrinkCard(grow, el, z, from) {
    const find = grow && grow.back;
    let card = find && find();
    const a = card && card.getBoundingClientRect();
    if (!card || !seenBox(a)) {
      /* 戻るカードが無い・画面の外：紙がふつうに帰るのと同じ形で。 */
      const to = getComputedStyle(el);
      const run = el.animate([
        { transform: from.transform, opacity: from.opacity, borderRadius: from.radius },
        { transform: to.transform, opacity: to.opacity, borderRadius: to.borderRadius },
      ], { duration: KN.motion.ms("--m-sheet-close"), easing: KN.motion.ease("--ease-in"), fill: "forwards" });
      return run.effect.getComputedTiming().endTime;
    }
    /* ＋から育った紙も、帰りはカードへ（畳んだ姿＝透明には戻らない）。 */
    el.classList.remove("is-from-origin");
    const s = restBox(el);
    /* 打っていたなら、帰るあいだ紙を今の箱に留める（キーボードが下りると下の端が伸び、
       紙ごと跳んで窓が行からずれる。aimHome と同じ）。 */
    if (document.documentElement.classList.contains("kb-open")) {
      Object.assign(el.style, { top: `${s.top.toFixed(1)}px`, bottom: "auto",
        height: `${(s.bottom - s.top).toFixed(1)}px`, maxHeight: "none" });
    }
    let b = a;
    const rad = roundOf(card, el);
    const full = fullClip(el);
    const frames = (r) => {
      const w = cardWindow(s, r, rad);
      return [{ transform: from.transform, clipPath: full }, { transform: w.shift || REST, clipPath: w.clip }];
    };
    const timing = { duration: KN.motion.ms("--m-settle"), easing: KN.motion.ease("--ease-settle"), fill: "forwards" };
    const run = el.animate(frames(b), timing);
    kids(el).forEach((k) => k.animate([{ opacity: 1 }, { opacity: 0, offset: .5 }, { opacity: 0 }], timing));
    const g = cardGhost(card, b, z + 1, grow.hide);
    const fade = g.animate([{ opacity: 0 }, { opacity: 0, offset: .4 }, { opacity: 1 }], timing);
    card.style.visibility = "hidden";

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.style.visibility = "hidden";
      if (card) card.style.visibility = "";
      g.remove();
    };
    const follow = () => {
      if (done) return;
      const now = find();
      if (!now) {
        /* 見失ったら、その場で薄れて消えます。 */
        if (card) card.style.visibility = "";
        card = null;
        fade.cancel();
        g.remove();
        el.animate([{ opacity: 1 }, { opacity: 0 }],
          { duration: KN.motion.ms("--m-state"), easing: KN.motion.ease("--ease-in"), fill: "forwards" })
          .onfinish = () => { run.cancel(); finish(); };
        return;
      }
      if (now !== card) {
        if (card) card.style.visibility = "";
        card = now;
        card.style.visibility = "hidden";
      }
      const r = card.getBoundingClientRect();
      if (Math.abs(r.left - b.left) + Math.abs(r.top - b.top)
          + Math.abs(r.width - b.width) + Math.abs(r.height - b.height) > 0.5) {
        b = r;
        run.effect.setKeyframes(frames(b));
        Object.assign(g.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
      }
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
    run.onfinish = finish;
    /* 見失って薄れるぶん（--m-state）まで待つ。知らせが来なくても、カードは必ず戻す。 */
    const ms = timing.duration + KN.motion.ms("--m-state");
    setTimeout(finish, ms + 40);
    return ms;
  }

  /* ---------------- bottom sheet ---------------- */

  /**
   * Open a modal sheet.
   * @param {object} opts
   * @param {string} opts.title
   * @param {Node|DocumentFragment} opts.content
   * @param {Node} [opts.footer]
   * @param {Function} [opts.onClose]
   * @returns {{close: Function, el: HTMLElement}}
   */
  /**
   * 下から出てくる紙。
   *
   * `guard: true` を渡した紙だけ、閉じようとしたときに見張ります。書きかけの
   * まま × を押したり下へ払ったりしたら、黙って捨てずに一度だけ聞きます。
   *
   * 既定で入れていないのは、**書いたそばから保存する紙**があるからです
   * （商品のメモは、欄から離れた時点でもう入っています）。そういう紙で
   * 聞くのは、済んだことをもう一度聞くだけになります。
   */
  /* hero … 紙の頭に敷く一枚。渡すと、題の行のかわりにこれが乗り、閉じる
     丸だけがその上に浮きます。時間割の行の絵を、そのまま大きくして続きを
     見せるためのものです（参考にした画面と同じ作り）。 */
  /* menu … 頭に置く「⋯」の中身。[{ id, label(), sub, icon, danger, onPick }]
     たまに、一度だけ使うもの（★を付ける・削除）の置き場です。決めごとの
     列に混ぜると、毎回そこを通ることになります。 */
  /* ---- 書きかけのまま閉じようとしたとき ----

     ×、下へ払う、外を押す、左端から引く——どれも「やめる」の合図ですが、
     **書いたものを捨てる合図ではありません**。開いたときの中身を覚えて
     おいて、変わっていれば**そのまま保存します**。聞きません——保存の
     ボタンがそこにあって、押せる状態で、中身が変わっているなら、答えは
     もう決まっているので。

     聞くのは、**押しても保存が通らなかったとき**だけです（体重が空、の
     ような検算で止まる紙）。そのときは閉じないので、それを合図に一度だけ
     聞きます——「保存しない」を選ぶ道が無いと、直せない欄を抱えたまま
     出られなくなるので。

     **紙でも、設定の中の押しのける一枚でも、同じことをします。**だから
     ここに一つだけ置いて、両方が借ります——二か所に書くと、片方だけ
     直した日に「下へ払うと消えるが、左端から引くと残る」が起きます。

     見張る範囲は**入れものぜんぶ**。`.sheet-body` の中しか数えていな
     かった時期があり、やることの題の欄（hero にいる）を打ち替えただけ
     だと「何も変わっていない」と判定され、黙って捨てられていました。
     欄がどの段にあるかは、書いた人にとって何の意味も持ちません。数え
     ないのは帯（footer）の中だけ——押せば決まるものなので。 */
  function makeGuard({ el, footer, guard, close, isClosed }) {
    const inFoot = (n) => !!(footer && footer.contains && footer.contains(n));
    const fields = () => [...el.querySelectorAll("input, textarea, select")]
      .filter((f) => !f.readOnly && !f.disabled && f.type !== "file" && !inFoot(f));
    const snapshot = () =>
      fields().map((f) => (f.type === "checkbox" || f.type === "radio" ? String(f.checked) : String(f.value))).join("\u241F")
      + "\u241E"
      + [...el.querySelectorAll("[aria-pressed]")].filter((b) => !inFoot(b))
        .map((b) => b.getAttribute("aria-pressed")).join(",");
    /* 「押せば済む」ボタン。帯そのものがボタンのこともあれば（やること）、
       中に並んでいることもあります（体重、お酒）。押せない状態のものは
       数えません——押しても何も起きないので、聞く意味がありません。 */
    const primary = () => {
      if (!footer || guard !== true) return null;
      const ok = (b) => b && !b.disabled;
      if (footer.matches && footer.matches(".js-save, .btn-primary") && ok(footer)) return footer;
      const inside = footer.querySelector
        ? footer.querySelector(".js-save, .btn-primary") : null;
      return ok(inside) ? inside : null;
    };
    let baseline = snapshot();
    /* 開いた直後に自分で埋める紙があります（前回と同じ条件、いまの時刻…）。
       それを「その人が書いた」と数えないよう、一拍おいて取り直します。 */
    setTimeout(() => { if (!isClosed()) baseline = snapshot(); }, 60);

    return function tryClose() {
      if (isClosed()) return;
      const btn = guard === false ? null : primary();
      if (!btn || snapshot() === baseline) { close(); return; }
      /* 保存のボタンを、そのまま押します。うまくいった紙は自分で閉じるので
         （どの保存も最後に handle.close() を呼びます）、**閉じたかどうか**が
         そのまま「保存できたか」の返事になります。

         保存が非同期な紙のために、返事は一拍おいて聞きます。 */
      btn.click();
      setTimeout(() => {
        if (isClosed()) return;
        /* 「捨てる」ほうを ok に置くのは、confirm が**流された（外を押した・
           Escape）ときに false を返す**からです。false ＝ 何もしない＝紙は
           開いたまま、が安全側になります。 */
        confirm({
          title: "保存できませんでした",
          message: "書きかけのものが残っています。",
          okLabel: "保存しない",
          cancelLabel: "書きつづける",
          danger: true,
        }).then((drop) => { if (drop) close(); });
      }, 80);
    };
  }

  /* ---- 設定の中では、紙ではなく一枚を押しのける ----

     `KN.ui.pageHost` が名乗り出ていて、いまがその画面なら、下から出る紙の
     かわりに**全画面の一枚**として開きます。呼ぶ側は同じ handle を受け取る
     ので、`h.close()` も `h.tryClose()` もそのまま効きます——十数か所の
     `KN.ui.sheet(...)` を一つも書き換えずに、設定の中だけが押しのけに
     なる、ということです。

     移さないものが三つ：
       - `as: "dialog"`（confirm・prompt・ほかの操作）。**あれは決めるための
         もので、行き先ではありません。**iOS でも設定の中に警告は警告として
         出ます。
       - 頭を敷いた紙（hero）と「⋯」を持つ紙（menu）。あの二つは紙の形に
         寄りかかった作りなので、移すと絵が壊れます。 */
  let pageHost = null;

  function sheet(opts) {
    const { title, titleMark, hero, menu, content, footer, onClose, guard } = opts || {};
    if (pageHost && opts && opts.as !== "dialog" && !hero && !menu && pageHost.wants()) {
      return pageHost.open(opts);
    }
    const backdrop = node(html`<div class="sheet-backdrop"></div>`);
    /* cls … 紙に足す class（開く前の形を決めるもの。growCard が測るので）。
       clear … 電話の幅では後ろを暗くしない（ノートの書く紙。段4.3）。
       grow … { from: 押したカード, back: () => 戻るカード }（上の growCard）。 */
    const grow = opts && opts.grow;
    if (opts && opts.clear) backdrop.classList.add("is-clear");
    const el = node(html`
      <div class="sheet ${hero ? "has-hero" : ""} ${(opts && opts.cls) || ""}" role="dialog" aria-modal="true"
           aria-label="${title || ""}">
        <div class="sheet-handle"></div>
        <header class="sheet-head">
          ${/* 頭を敷いたときは、閉じる丸が**左**、⋯ が右。参考にした画面と
                同じ並びです——色の面の上では、閉じるほうが先に目に入る側に
                あったほうが、迷わずに出られます。 */""}
          <button class="icon-btn js-close" aria-label="閉じる">${icon("close")}</button>
          <h2 class="sheet-title">${titleMark ? html`<span class="sheet-mark">${titleMark}</span>` : ""}${title || ""}</h2>
          ${menu && menu.length
            ? html`<button class="icon-btn js-menu" aria-label="ほかの操作">${icon("more")}</button>`
            : ""}
        </header>
        <div class="sheet-body"></div>
      </div>
    `);

    /* ＋（とその上に立つ札）から開いた紙は、下に付いた紙ではなく四隅の丸いカード
       （U17・2026年10月7日、利用者が見比べで A「中身ぶんの高さ」を選んだ）。
       背いっぱいのカード（.is-card・.is-note）と確かめの紙はそのまま。形は CSS の
       .sheet.is-fab-card（電話の幅だけ）。seedFrom が開いた箱を測る前に付ける。 */
    /* home … ＋ではない帰り先（() => 要素。やることの「これから」の＋）。そこから開いた紙も同じカードに。 */
    /* card … どこから開いてもこのカード（やることの紙。2026年10月9日、利用者「下の紙ではなく四隅の丸い紙に」）。 */
    const homeOf = opts && typeof opts.home === "function" ? opts.home : null;
    if (((pressed && pressed.fab && Date.now() - pressed.t <= 800) || homeOf || (opts && opts.card))
      && !(opts && opts.as === "dialog") && !el.matches(".is-card, .is-note")) {
      el.classList.add("is-fab-card");
    }
    if (hero) el.querySelector(".sheet-head").before(hero);
    const menuBtn = el.querySelector(".js-menu");
    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        haptic();
        /* 紙の「⋯」も、押した ⋯ のすぐ下に出る小窓（2026年10月2日・利用者の声
           「シートではなくポッと表示されて欲しい」）。前は下から出る紙だった。 */
        popMenu(menuBtn, menu);
      });
    }
    el.querySelector(".sheet-body").append(content);
    /* ボタンは**紙の中身の最後**に置きます。キーボードの上に貼りつけて
       いましたが、指が届く代わりに、読めるところを一段ぶん食べていました。
       書き終えて下まで来た人はそこでボタンに会いますし、途中でやめる人には
       閉じるときに聞きます（下の tryClose）。 */
    if (footer) {
      const foot = node(html`<div class="sheet-foot"></div>`);
      foot.append(footer);
      el.querySelector(".sheet-body").append(foot);
    }

    /* Each sheet opened over another gets its own storey. Without this every
       sheet sits at the same z-index and the new sheet's backdrop lands
       *under* the old sheet — so the one underneath stays sharp and bright and
       you end up reading two forms at once through the frosted glass. */
    /* いちばん下の段は **CSS の `--z-sheet`** から読みます。数を二か所に
       書くと、段の名前を直した日にここだけ置いていかれます
       （--push-p / PARALLAX と同じ罠）。 */
    const depth = openSheets.length;
    const floor = zSheet();
    backdrop.style.zIndex = String(floor + depth * 2);
    el.style.zIndex = String(floor + 1 + depth * 2);

    sheetRoot().append(backdrop, el);
    document.body.style.overflow = "hidden";
    /* 出来事の名前を鳴らします。**いままで呼ばれていませんでした**
       ——`sheetOpen` / `sheetClose` は motion.js に用意だけしてあって、
       どこからも呼ばれない名前でした（--m-sheet-close が誰にも読まれて
       いなかったのと同じ形です）。いまは震えも絵も持たない出来事ですが、
       名前が現に呼ばれていれば、あとで手ごたえを足すのはここ一か所です。 */
    KN.motion.fire("sheetOpen");

    /* 押されたところから育てます（育てないなら null で、これまでどおり
       下からせり上がります）。 */
    const seed = grow && grow.from ? null : seedFrom(el);
    if (seed) {
      /* 押した丸から、いちど光がにじみ出ます。紙が育ちきるまでの一拍を、
         ＋のあった場所が受け持つためのものです——紙が小さいあいだ、画面に
         「どこから来たのか」を言うものが他にありません。
         重ね順は覆いと同じ数にして、DOM の順で覆いの上・紙の下に置きます。 */
      const bloom = node(html`<i class="sheet-bloom" aria-hidden="true"></i>`);
      bloom.style.left = `${seed.x}px`;
      bloom.style.top = `${seed.y}px`;
      bloom.style.zIndex = String(floor + depth * 2);
      sheetRoot().append(bloom);
      /* 光は紙が育ちきるまでのあいだだけ。長さは CSS 側（--m-sheet-grow）
         から出します——光は「紙より先に終わる」ことが決めごとなので、
         紙の速さを直したら一緒についてこないと意味がありません。 */
      setTimeout(() => bloom.remove(), KN.motion.ms("--m-sheet-grow") + 100);
    }

    // Next frame so the transition runs.
    let unmorph = null;
    /* カードから膨らむときは、紙はもう開いた場所にいます（窓だけが広がる）。 */
    const grown = grow ? growCard(grow, el, floor + 1 + depth * 2) : false;
    requestAnimationFrame(() => {
      /* 行の丸薬から伸びるのは、押した点から育つときと、行から広がるとき（やること）。 */
      if ((seed || grown) && opts && opts.morph && !closed) unmorph = morphPill(opts.morph, el, floor + 1 + depth * 2);
      backdrop.classList.add("is-open");
      el.classList.add("is-open");
    });

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      /* 頭の丸薬は、行の丸薬へ帰ります（行きの影武者がまだ飛んでいる
         あいだに閉じたときは帰しません——出どころの箱が決まらないので）。 */
      const flying = unmorph && unmorph.flying();
      if (unmorph) unmorph();
      if ((seed || grown) && opts && opts.morph && opts.morph.back && !flying && !still()) {
        morphBack(opts.morph, floor + 1 + depth * 2);
      }
      /* カードへ縮んで帰る紙は、CSS の帰り道を走らせません（帰り道は
         onClose のあと、一覧を組み直してから決める。下の shrinkCard）。 */
      const shrinks = grow && grow.back && !still() && phone();
      let from = null;
      if (shrinks) {
        const cs = getComputedStyle(el);
        from = { transform: cs.transform, opacity: cs.opacity, radius: cs.borderRadius };
        el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        el.style.transition = "none";
      }
      /* カードへ縮む紙（ノート）は、＋ではなくカードへ帰る。 */
      const home = seed && (seed.fab || homeOf) && !shrinks && !still() && el.classList.contains("is-from-origin")
        ? aimHome(el, seed.home, homeOf) : null;
      if (home) el.classList.add("is-homing");
      /* 閉じた紙は、もう指を受けない。行やカードへ縮んで帰るあいだ（.7秒ほど）覆いと窓が
         残っていて、閉じてすぐ次の行を押しても、覆いが食べていた。 */
      backdrop.style.pointerEvents = "none";
      el.style.pointerEvents = "none";
      backdrop.classList.remove("is-open");
      el.classList.remove("is-open");
      KN.motion.fire("sheetClose");
      /* 着いたところで＋が一度だけ受け止める。 */
      if (home) {
        setTimeout(() => home.isConnected && home.animate(
          [{ transform: "none" }, { transform: "scale(1.1)" }, { transform: "none" }],
          { duration: KN.motion.ms("--m-number"), easing: KN.motion.ease("--ease-out"), composite: "add" },
        ), KN.motion.ms("--m-sheet-home"));
      }
      // The pad belongs to a field in this sheet; it has no business outliving it.
      KN.keypad && KN.keypad.close();
      /* Nor does the caret. A field removed while still focused is never
         blurred on WebKit, so the app goes on believing a keyboard is up —
         which is what left the tab bar hidden after a sheet was closed.
         Say goodbye while the field is still there to hear it. */
      if (el.contains(document.activeElement)) document.activeElement.blur();
      KN.app.remeasure && KN.app.remeasure();
      const idx = openSheets.indexOf(handle);
      if (idx >= 0) openSheets.splice(idx, 1);
      if (!openSheets.length) document.body.style.overflow = "";
      /* 育って出てきた紙は、同じ道を縮んで帰ります（.is-open を外すだけで
         逆再生になります）。そのぶん片づけるのを待ちます。

         **待つ長さは CSS から読みます。** ここには 460 / 300 と直に書いて
         ありましたが、紙の速さを決めているのは CSS の `--m-sheet-*` の
         ほうです。二か所に持つと、片方だけ直した日に「まだ動いているのに
         消える」か「もう止まっているのに残る」のどちらかが起きます。 */
      const closeMs = KN.motion.ms(home ? "--m-sheet-home" : "--m-sheet-close");
      const tidy = (ms) => setTimeout(() => { backdrop.remove(); el.remove(); }, ms + 60);
      if (!shrinks) tidy(closeMs);
      onClose && onClose();
      if (shrinks) tidy(shrinkCard(grow, el, floor + 1 + depth * 2, from));
    }

    /* ---- 書きかけのまま閉じようとしたとき ----

       ×、下へ払う、外を押す——どれも「やめる」の合図ですが、**書いたものを
       捨てる合図ではありません**。開いたときの中身を覚えておいて、変わって
       いれば**そのまま保存します**。聞きません——保存のボタンがそこにあって、
       押せる状態で、中身が変わっているなら、答えはもう決まっているので。

       聞くのは、**押しても保存が通らなかったとき**だけです（体重が空、
       のような検算で止まる紙）。そのときは紙が閉じないので、それを合図に
       従来どおり一度だけ聞きます——「保存しない」を選ぶ道が無いと、直せない
       欄を抱えた紙から出られなくなるので。

       ---- 見張る範囲は、紙ぜんぶ ----

       ここは `.sheet-body` の中しか数えていませんでした。ところが**やること
       の題の欄は頭（hero）にいます**——題を打ち替えただけだと「何も変わって
       いない」と判定され、下へ払うと**黙って捨てられていました**。欄がどの
       段にあるかは、書いた人にとって何の意味も持ちません。紙ぜんぶを見ます
       （帯の中は押せば決まるものなので、そこだけ数えません）。 */
    const tryClose = makeGuard({ el, footer, guard, close, isClosed: () => closed });

    backdrop.addEventListener("click", tryClose);
    el.querySelector(".js-close").addEventListener("click", tryClose);

    /* Capping the sheet at the visible height (see --vvh) keeps it on screen,
       but the field you tapped can end up below the fold of the sheet's own
       scroller — which is exactly what happens entering a price near the
       bottom of a long product. Bring it back into view once the keyboard has
       finished arriving; it takes a few hundred milliseconds, and the sheet is
       still resizing the whole time, so this checks back rather than trusting
       one moment of it. */
    const scrollFieldIntoView = (field) => {
      const scroller = el.querySelector(".sheet-body");
      if (!scroller) return;
      const f = field.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      if (f.top >= s.top + 4 && f.bottom <= s.bottom - 4) return;   // already visible
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    el.addEventListener("focusin", (e) => {
      const field = e.target.closest("input, textarea, select");
      if (!field) return;
      /* 自分で送る欄（ノートの本文：中身ぶん伸びるので、真ん中へ寄せると
         題ごと飛ぶ。screen-notes.js の reveal）は任せてもらう。 */
      if (field.hasAttribute("data-own-scroll")) return;
      [140, 340, 620].forEach((ms) => setTimeout(() => {
        if (document.activeElement === field) scrollFieldIntoView(field);
      }, ms));
      /* 長い本文の下のほうを押すと、カーソルは押した行に入るが、キーボードが上がって欄が
         縮むあいだ欄の送り位置は据え置き——押した行が欄の下へ隠れ、真ん中あたりが見えていた
         （2026年10月9日・利用者「一番下を押したのに真ん中にずれる」）。縮むたび、カーソルの行を欄の中へ戻す。 */
      if (field.tagName === "TEXTAREA" && window.ResizeObserver) {
        const ro = new ResizeObserver(() => keepCaretInView(field));
        ro.observe(field);
        field.addEventListener("blur", () => ro.disconnect(), { once: true });
      }
    });

    /* ---- 下へ払って閉じる ----

       紙が画面の下に留まっているあいだだけ（640px より広いと真ん中の
       一枚になり、transform の形が違います）。

       **三つ直しました。**

       ① **紙が指についてきませんでした。** 指の位置を毎フレーム紙に
          書いているのに、紙は `.sheet` の「--m-sheet-close かけて動く」を
          着たままでした。だから一フレームごとに、なめらか移動がやり直され、
          紙はねばるように遅れて追ってきます（実測：指の位置を当てても、
          移動時間は 0.3秒のまま）。掴んでいるあいだは transition を切ります。

       ② **速さを見ていませんでした。** 閉じるかどうかが `dy > 90` の
          距離だけだったので、**ぱっと弾くと戻り、のろのろ 95px 引くと
          閉じる**——iPhone の紙と逆です。勢いも見ます。

       ③ **上へは道がありません**でした（`dy > 0` 以外は無視）。指は動くのに
          絵が動かないと、そこで指と絵が切れます。上へは**だんだん重く**して、
          ついてはくるが進まない、という形で「ここまで」を言います。 */
    const isBottomSheet = () => window.matchMedia("(max-width: 639px)").matches;
    /* 閉じる境目は**紙の丈に対する割合**です（iPhone の紙と同じ考えかた）
       ——ただし上下で止めます。短い紙で 44px、長い紙で 154px では、同じ
       「下へ払う」が紙によって別の手つきになってしまうので。 */
    const DISMISS   = 0.22;   // 紙の丈の、これだけ引けば閉じる
    const DISMISS_MIN = 56, DISMISS_MAX = 140;
    /* 短くても、これだけ速ければ閉じる（KN.gesture の閉じる・戻る払い。左端から戻るのと同じ）。 */
    const { BACK_FLING_V: FLING_V, BACK_FLING_MIN: FLING_MIN } = KN.gesture;
    let startY = null, dy = 0, lastT = 0, lastY = 0, vy = 0;
    const head = el.querySelector(".sheet-head");
    const handleBar = el.querySelector(".sheet-handle");

    const dragTo = (y) => { el.style.transform = `translate(-50%, ${y}px)`; };
    /** 戻す／閉じきる、どちらも「残りの道のりと指の勢い」から。 */
    const slideTo = (y) => {
      const h = el.getBoundingClientRect().height || 1;
      const g = KN.motion.glide(y - dy, vy,
        { span: h, base: KN.motion.ms("--m-sheet-close") });
      el.style.transition = g.ms ? `transform ${g.ms}ms ${g.ease}` : "";
      if (y) dragTo(y); else el.style.transform = "";
      return g.ms;
    };

    const follow = (y) => {
      const now = performance.now();
      if (now > lastT) { vy = (y - lastY) / (now - lastT); lastT = now; lastY = y; }
      const raw = y - startY;
      dy = raw >= 0 ? raw : KN.motion.rubber(raw, 50);   // ③ 上はゴム
      dragTo(dy);
    };

    const release = (dismissable) => {
      if (startY == null) return;
      startY = null;
      const h = el.getBoundingClientRect().height || 1;
      const far = Math.min(DISMISS_MAX, Math.max(DISMISS_MIN, h * DISMISS));
      const fling = vy > FLING_V && dy >= FLING_MIN;     // ②
      if (!dismissable || !(dy > far || fling)) {
        const ms = slideTo(0);
        setTimeout(() => { if (!closed) el.style.transition = ""; }, ms + 20);
        return;
      }
      /* 下へ払って閉じるときは、**下へ帰します**。指が下へ送ったものが
         ＋のほうへ飛んで戻るのは、いま自分がした動きと逆なので。
         そのまま下まで滑らせながら閉じにいきます。 */
      el.classList.remove("is-from-origin");
      /* カードへ縮んで帰る紙は、払った場所から縮みます（shrinkCard）。 */
      const ms = grow && grow.back && !still() ? 0 : slideTo(h);
      tryClose();
      /* 保存が通らなかった紙は**閉じません**（`tryClose` の但し書き）。
         そのときは、下げたぶんを戻してやらないと、開いたまま画面の外に
         居ることになります。 */
      setTimeout(() => {
        if (closed || !el.isConnected) return;
        dy = h; vy = 0;
        const back = slideTo(0);
        setTimeout(() => { if (!closed) el.style.transition = ""; }, back + 20);
      }, ms + 20);
    };

    [head, handleBar].forEach((zone) => {
      if (!zone) return;
      zone.addEventListener("touchstart", (e) => {
        if (!isBottomSheet()) { startY = null; return; }
        startY = e.touches[0].clientY;
        dy = 0; lastT = performance.now(); lastY = startY; vy = 0;
        el.style.transition = "none";          // ① 指につかせる
      }, { passive: true });

      zone.addEventListener("touchmove", (e) => {
        if (startY == null) return;
        follow(e.touches[0].clientY);
      }, { passive: true });

      zone.addEventListener("touchend", () => release(true));
      zone.addEventListener("touchcancel", () => release(false));
    });

    /* pull … () => true のあいだ、中身が一番上まで送ってあれば、中身を下へ
       引いても閉じる（ノートの書く紙・2.0 の V19）。一番上に居ない・上へ
       送る指は、ふつうの送りのまま。取ると決めたら紙の払いと同じ扱い
       （指につく・勢い・保存してから閉じる）。引いて更新ではない。 */
    const body = el.querySelector(".sheet-body");
    if (opts && typeof opts.pull === "function" && body) {
      let p0 = null, px0 = 0;
      body.addEventListener("touchstart", (e) => {
        p0 = null;
        if (e.touches.length !== 1 || !isBottomSheet() || !opts.pull()) return;
        if (body.scrollTop > 0) return;
        p0 = e.touches[0].clientY; px0 = e.touches[0].clientX;
      }, { passive: true });
      body.addEventListener("touchmove", (e) => {
        if (p0 == null) return;
        const y = e.touches[0].clientY;
        if (startY == null) {
          const my = y - p0, mx = e.touches[0].clientX - px0;
          if (Math.abs(my) < 2 && Math.abs(mx) < 2) return;
          /* 下向きの縦で、まだ一番上に居るときだけ取る。早く決める——iOS は
             送りが始まってからの preventDefault を聞かない。 */
          if (!(my > 0 && my > Math.abs(mx) && body.scrollTop <= 0)) { p0 = null; return; }
          startY = y;
          dy = 0; lastT = performance.now(); lastY = y; vy = 0;
          el.style.transition = "none";
        }
        /* 取ったあとは、中身の送り（と、一番上での跳ね返り）を止める。 */
        if (e.cancelable) e.preventDefault();
        follow(y);
      }, { passive: false });
      body.addEventListener("touchend", () => { p0 = null; release(true); });
      body.addEventListener("touchcancel", () => { p0 = null; release(false); });
    }

    /* tryClose も渡します。Escape で閉じる道（下の keydown）が close() を
       直接呼んでいて、そこだけ**書きかけを黙って捨てていました**。閉じ方が
       四つあるなら、四つとも同じ扱いにします。 */
    const handle = { close, tryClose, el };
    openSheets.push(handle);

    // Focus the first meaningful control.
    /* もう紙の中に居るカーソル（＋から本文へ入れたもの）は奪いません。
       待つあいだに閉じた紙も奪いません——帰る途中の紙はまだ在るので、すぐ開いた次の
       ノートの本文から、閉じた紙のボタンへカーソルを引き抜いていた（tests/notes.js）。 */
    setTimeout(() => {
      if (closed || el.contains(document.activeElement)) return;
      const target = el.querySelector("input, textarea, select, button:not(.js-close):not(.js-menu)");
      if (target && !("ontouchstart" in window)) target.focus();
    }, 320);

    return handle;
  }

  /* aria-modal="true" だけでは、キーボードのTabは紙の外へも出て行けます
     （それを止めるのはブラウザではなく、ここのJSの役目です）。いちばん
     上の紙の中だけを回すようにします——端まで来たら、もう一方の端へ。 */
  function focusableIn(el) {
    return [...el.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
      'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((f) => f.offsetParent !== null);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openSheets.length) {
      const top = openSheets[openSheets.length - 1];
      (top.tryClose || top.close)();
      return;
    }
    if (e.key === "Tab" && openSheets.length) {
      const top = openSheets[openSheets.length - 1];
      const list = focusableIn(top.el);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      const active = document.activeElement;
      const inside = top.el.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first) { e.preventDefault(); last.focus(); }
      } else if (!inside || active === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------------- 別の日へ運ぶ（docs/roadmap-2.0.md の V15） ----------------

     やることを別の日へ移すと、その日の画面から行が消えます。どこへ行ったのかを
     言うものが無いので、行（か紙の頭の丸薬）の写しが、上の帯の暦のその日へ縮み
     ながら飛んでいき、着いた日の丸が一度ふくらみます。暦が出ていない・その日が
     いま出ている週や月に無いときは、頭の日付へ。動きを減らす設定では飛ばさない。

       KN.ui.sendToDay(el, "2026-10-05")   // el は消える前の行（測ってから写す）

     **写しを飛ばす**のは、元の行が組み直しで消えるからです（行き先で同じ行が
     待っているわけではない＝FLIP にはならない）。 */
  function dayTarget(day) {
    const head = document.getElementById("head");
    if (!head) return null;
    const vw = window.innerWidth;
    const cellOk = (e) => {
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2;
      return r.width > 0 && r.height > 0 && x > 0 && x < vw && r.bottom > 0;
    };
    const cell = [...head.querySelectorAll(`.cal-day[data-day="${CSS.escape(day)}"]`)].find(cellOk);
    if (cell) return cell;
    const title = head.querySelector(".js-day-title");
    return title && cellOk(title) ? title : null;
  }

  function sendToDay(el, day) {
    if (!el || !day || still()) return false;
    const a = el.getBoundingClientRect();
    if (!a.width || !a.height) return false;
    const target = dayTarget(day);
    if (!target) return false;
    const b = target.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const g = el.cloneNode(true);
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    g.classList.add("day-send");
    /* 紙の外へ出すので、紙から継いでいた色・字・角を写します（pillGhost と同じ）。
       地が透けている行（紙の上の一行）は、紙の地を持たせて浮かせる。 */
    const clear = /rgba\(.*,\s*0\)|transparent/.test(cs.backgroundColor);
    Object.assign(g.style, {
      background: clear ? "var(--c-surface)" : cs.backgroundColor,
      color: cs.color, font: cs.font, borderRadius: clear ? "var(--r-md)" : cs.borderRadius,
      boxShadow: clear ? "var(--shadow-2)" : cs.boxShadow,
    });
    Object.assign(g.style, {
      position: "fixed", margin: "0", boxSizing: "border-box", pointerEvents: "none",
      left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
      zIndex: "var(--z-toast)", visibility: "visible", transformOrigin: "50% 50%",
    });
    document.body.append(g);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const k = Math.max(.08, Math.min(1, b.height / a.height) * .6);
    const timing = { duration: KN.motion.ms("--m-settle"), easing: KN.motion.ease("--ease-settle"), fill: "forwards" };
    const run = g.animate([
      { transform: "none", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k.toFixed(3)})`, opacity: .9, offset: .8 },
      { transform: `translate(${dx}px, ${dy}px) scale(${(k * .6).toFixed(3)})`, opacity: 0 },
    ], timing);
    let over = false;
    const done = () => {
      if (over) return;
      over = true;
      g.remove();
      const t = dayTarget(day);
      if (t) t.animate([{ transform: "none" }, { transform: "scale(1.18)" }, { transform: "none" }],
        { duration: KN.motion.ms("--m-number"), easing: KN.motion.ease("--ease-out") });
    };
    run.onfinish = done;
    run.oncancel = done;
    setTimeout(done, timing.duration + 200);
    return true;
  }

  /* ---------------- 行が動くところを見せる（FLIP） ----------------

     この app の画面は、何かが変わるたびに**丸ごと組み直します**。作りとしては
     正しい（画面が state のうつしになる）のですが、そのぶん、起きたことが
     全部「瞬間移動」として出ます。一件足すと、上から二番目だった行がいつの
     まにか三番目にいる。並び替えを押すと、一覧が別のものに置き換わっている。
     何が起きたのかは、二枚の絵を見比べて自分で当てるしかありません。

     組み直しの**前後**で同じ行がどこに居たかを測って、「もといた場所」から
     いまの場所へ滑らせます。行そのものは新しい要素ですが、目には同じ行が
     動いたように見えます——これが FLIP（First / Last / Invert / Play）です。

       const settle = KN.ui.flipRows(host, ".arc-row");   // 組む前に測る
       ...組み直す...
       settle();                                          // 測って、滑らせる

     行は data-flip に自分の id を持ちます。持っていない行は素通りします。

     **行き先が変わるときは動かしません。** 月をめくる・日を選ぶ・タブを移る
     ときは一覧が丸ごと入れ替わるので、全部の行がいっせいに現れることに
     なります。それは「編集の手ごたえ」ではなく、ただのちらつきです。
     新しい行が半分を超えたら、動かさずに黙って置き換えます。
     長さと曲線は辞書の `--m-settle`・`--ease-settle`（docs/motion.md）。 */

  function flipRows(host, selector) {
    if (!host) return () => {};
    /* 動きを減らす設定なら、測りもしません（transition は base.css が
       瞬時にしますが、測って書いて消す往復そのものが無駄なので）。 */
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => {};
    }
    const first = new Map();
    host.querySelectorAll(selector).forEach((el) => {
      const id = el.dataset.flip;
      if (id) first.set(id, el.getBoundingClientRect().top);
    });

    return () => {
      const rows = [...host.querySelectorAll(selector)].filter((el) => el.dataset.flip);
      if (!rows.length || !first.size) return;
      const fresh = rows.filter((el) => !first.has(el.dataset.flip));
      // 半分より多くが新顔なら、これは編集ではなく行き先の変更です。
      if (fresh.length > rows.length / 2) return;

      /* **測るのを先に、まとめて。** 一行ずつ「測って→ずらして」と交互にすると、ずらした
         行のせいで次の行を測るたびに並べ直しが入ります（四十行で四十回。docs/motion.md の
         「押した一拍を軽く」）。先に全部を測れば、並べ直しは最初の一回だけ。 */
      const now = new Map();
      rows.forEach((el) => {
        if (first.has(el.dataset.flip)) now.set(el, el.getBoundingClientRect().top);
      });
      let moved = false;
      rows.forEach((el) => {
        const was = first.get(el.dataset.flip);
        if (was == null) {
          // 新しく来た行だけが、名乗りを上げます。
          el.classList.add("is-arriving");
          /* **名乗り終わったら、札は外します。** `is-arriving`（`m-add`）は
             `animation-fill-mode: both` なので、終わったあとも
             `translate`・`scale` を押さえ続けます（U5 の前は `transform`）——アニメーションは
             インラインの style より強いので、**札を持ったままの行は
             二度と FLIP で滑れません**。
             行が毎回新しく組まれているあいだは、札も一緒に消えていたので
             出ませんでした。行を使い回す画面（やることの時間割）が
             できたので、ここで始末します。 */
          el.addEventListener("animationend", () => el.classList.remove("is-arriving"),
            { once: true });
          return;
        }
        const dy = was - now.get(el);
        if (Math.abs(dy) < 1) return;          // 動いていない行は触りません
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
        moved = true;
      });
      if (!moved) return;

      /* 一拍おいてから戻します。同じフレームで書いて消すと、ブラウザは
         二つをまとめて「何も変わっていない」と見なし、動きが出ません。 */
      const ms = KN.motion.ms("--m-settle");
      requestAnimationFrame(() => {
        rows.forEach((el) => {
          if (!el.style.transform) return;
          el.style.transition = "transform var(--m-settle) var(--ease-settle)";
          el.style.transform = "";
        });
        setTimeout(() => {
          rows.forEach((el) => { el.style.transition = ""; el.style.transform = ""; });
        }, ms + 30);
      });
    };
  }

  /* ---------------- 弾み（済ませた瞬間だけの、短い火花） ----------------

     やることを済ませた・買うものを買った、その指の下だけに、小さな星が
     一瞬散って消えます。褒賞ではなく、**その場で起きたことへの相槌**の
     つもりなので、一度きり・250ms前後で終わり、居座りません。
     鳴らすのは「済ませた」ときだけ——チェックを外す・取り消すときは
     呼びません（本当に起きたことにしか反応しない、という約束のため）。

     動きを減らす設定の端末では、base.css の全体ルールがこの動きも
     瞬時にします。ここで個別に分岐は要りません。 */
  function burst(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const wrap = document.createElement("div");
    wrap.className = "kn-burst";
    wrap.style.left = cx + "px";
    wrap.style.top = cy + "px";
    /* **輪です。** 前は6つの星を、角度も距離も少しずつ散らして飛ばして
       いました（火花）。参考にした画面は、丸い点を等間隔にきれいな輪で
       広げます——散らすと「弾けた」ですが、揃えると「一周した」になって、
       済ませたことの区切りらしく収まります。 */
    const n = 12;
    const dist = 19;
    for (let i = 0; i < n; i++) {
      const spark = document.createElement("i");
      spark.style.setProperty("--a", ((360 / n) * i).toFixed(1) + "deg");
      spark.style.setProperty("--d", dist + "px");
      wrap.appendChild(spark);
    }
    /* 波を一つ（2026年10月8日）。押した丸のふちから、やわらかな光の輪が一度だけ広がって
       消える——「一周した」を点の輪に加えて面でも言う。大きさは押した丸に合わせる（行ごと
       渡されても輪が行の幅にならないよう、丸の大きさの範囲に収める）。 */
    const wave = document.createElement("b");
    wave.style.setProperty("--s", Math.max(20, Math.min(36, r.width, r.height)).toFixed(1) + "px");
    wrap.appendChild(wave);
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 700);
  }

  /* ---------------- ほかの操作（⋯ の中身） ----------------

     たまに、一度だけ使うものの置き場です。★を付ける、削除する。決めごとの
     列に混ぜると、毎回そこを通ることになりますし、削除のような戻せない
     ものが指の通り道にあるのは、それだけで危ない。

     ふつうの紙（sheet）を借ります——専用の作りを増やすより、開き方・閉じ方・
     背景の作法が同じであるほうが、覚え直しがありません。 */
  function actionSheet(items, title) {
    const box = node(html`<div class="act-list"></div>`);
    const handle = sheet({ title: title || "ほかの操作", content: box, as: "dialog" });
    (items || []).forEach((it) => {
      const row = node(html`
        <button type="button" class="act-row ${it.danger ? "is-danger" : ""}">
          <span class="act-ico">${it.icon ? icon(it.icon) : ""}</span>
          <span class="act-main">
            <span class="act-label">${it.label}</span>
            ${it.sub ? html`<span class="act-sub">${it.sub}</span>` : ""}
          </span>
        </button>
      `);
      row.addEventListener("click", () => {
        handle.close();
        /* 閉じ終わってから動かします。紙が消えるのと画面が組み直るのが
           同じ拍だと、閉じる動きが飛んで見えます。 */
        setTimeout(() => { try { it.onPick(); } catch (_) { /* 閉じるのは済んでいます */ } }, 40);
      });
      box.append(row);
    });
    return handle;
  }

  /* ---------------- 押したところに出る小窓 ----------------

     押したもののすぐ下に出る小さな一枚（ノートの「⋯」・タグ・ノートブック・作った日、
     やることの詳細の紙の「⋯」・日付・時刻・くりかえし・期限の暦）。下から出る紙では
     なく、そこにポッと出る（2026年10月1日、ノートで利用者の声「シートでなく、そこに
     ポンと出てほしい」。10月2日に、やることの詳細の紙でも同じ声）。
     どれも押したものの中の最後の絵（無ければ真ん中）からふくらんで出て、同じ点へ縮んで帰る
     （V27 でノートの札に入れ、roadmap-unify の U7 で全部に）。
     side は揃える側（左の口なら left、右の口なら right）。外を押す・Escape で閉じ、
     閉じたら onClose。重なりは開いている紙の一段上。下に入りきらなければ、口の上に
     出す（place() は中身を足したあとに呼ぶ）。 */
  const pops = [];   // 開いている小窓の close（上が後ろ）
  function popOver(anchor, { role = "dialog", side = "right", label = "", cls = "", lift = false, onClose } = {}) {
    const sheetEl = anchor.closest(".sheet, .note-pop");   // 小窓の中から開く小窓は、その上に
    /* lift … 画面から開く背の高い小窓（見直す）。下の帯（--z-bar）に潜らないよう紙の高さに。 */
    const zSheet = lift ? parseInt(getComputedStyle(document.documentElement).getPropertyValue("--z-sheet"), 10) || 0 : 0;
    const z = (sheetEl && parseInt(getComputedStyle(sheetEl).zIndex, 10)) || zSheet;
    const r = anchor.getBoundingClientRect();
    const cover = node(html`<div class="note-pop-cover"></div>`);
    const pop = node(html`<div class="note-pop is-${side} ${cls}" role="${role}" aria-label="${label}"></div>`);
    cover.style.zIndex = String(z + 1);
    pop.style.zIndex = String(z + 2);
    let gone = false;
    const close = () => {
      if (gone) return;
      gone = true;
      pops.splice(pops.indexOf(close), 1);
      /* 帰り先は閉じる瞬間に測り直す（開いてからキーボードが出て画面が動くと、
         開いたときの点は押したものから外れている）。 */
      const o = originOf();
      if (o) pop.style.transformOrigin = o;
      pop.classList.remove("is-open");
      document.removeEventListener("keydown", onKey, true);
      cover.remove();
      setTimeout(() => pop.remove(), KN.motion.ms("--m-pop-grow") + 40);
      if (onClose) onClose();
    };
    /* Escape は一番上の小窓だけが受ける（小窓の中から開いた暦で、下の小窓まで閉じていた）。 */
    const onKey = (e) => {
      if (e.key !== "Escape" || pops[pops.length - 1] !== close) return;
      e.stopImmediatePropagation();
      close();
    };
    pops.push(close);
    cover.addEventListener("click", close);
    document.addEventListener("keydown", onKey, true);
    document.body.append(cover, pop);
    /* 横は left で決め、画面の中へ収めます。right で置くと、口が左寄りで
       小窓が幅広いとき（タグの「＋」）、左の外へはみ出していた（2026年10月1日、
       iPhone）。縦は口の下、入りきらず上のほうが広ければ口の上（is-up）。 */
    const place = () => {
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      const w = Math.min(pop.offsetWidth, vw - 16);
      const want = side === "left" ? r.left : r.right - w;
      pop.style.left = `${Math.round(Math.max(8, Math.min(want, vw - 8 - w)))}px`;
      /* 口の上にも下にも入りきらない背の高いもの（時刻の小窓）は、口に重なってもいいので
         画面の中に全部出す（中で送らせると、下の行が隠れた）。 */
      const below = vh - r.bottom - 12, above = r.top - 12;
      pop.style.maxHeight = `${Math.round(vh - 16)}px`;
      const h = pop.offsetHeight;
      const up = h > below && above > below;
      let top = up ? Math.round(r.top - 4 - h) : Math.round(r.bottom + 4);
      top = Math.max(8, Math.min(top, Math.round(vh - 8 - h)));
      pop.classList.toggle("is-up", up);
      pop.style.top = `${top}px`;
      pop.style.setProperty("--pop-top", `${top}px`);
      pop.style.transformOrigin = originOf() || pop.style.transformOrigin;
    };
    /* 押した札の ＞（中の最後の絵、無ければ札のまん中）からふくらみ、閉じるときは同じ点へ
       縮んで帰る。 */
    function originOf() {
      if (!anchor.isConnected) return "";
      const marks = anchor.querySelectorAll("svg");
      const g = (marks.length ? marks[marks.length - 1] : anchor).getBoundingClientRect();
      if (!g.width && !g.height) return "";
      const ox = g.left + g.width / 2 - parseFloat(pop.style.left);
      const oy = g.top + g.height / 2 - parseFloat(pop.style.top);
      return `${Math.round(ox)}px ${Math.round(oy)}px`;
    }
    place();
    requestAnimationFrame(() => { if (!gone) pop.classList.add("is-open"); });
    return { el: pop, close, place };
  }

  /** 「⋯」の中身を、押した ⋯ のすぐ下に縦に並べる。選ぶか外を押すと閉じる。 */
  function popMenu(anchor, items) {
    const p = popOver(anchor, { role: "menu", side: "right" });
    (items || []).forEach((it) => {
      const label = typeof it.label === "function" ? it.label() : it.label;
      const b = node(html`
        <button class="note-pop-item ${it.danger ? "is-danger" : ""}" role="menuitem">${it.icon ? icon(it.icon) : ""}<span class="note-pop-main"><span>${label}</span>${it.sub ? html`<small class="note-pop-sub">${it.sub}</small>` : ""}</span></button>`);
      b.addEventListener("click", () => {
        KN.motion.fire("select");
        p.close();
        it.onPick();
      });
      p.el.append(b);
    });
    p.place();
    return p;
  }

  /** 一件の記録を消す「⋯」の一行（roadmap-unify の U11）。確かめずに消し、「元に戻す」だけ付ける。
      remove() は store の remove* と同じく、戻す関数を返す。sheet() はその紙、after() は描き直し。
      確かめの紙を出すのは、まとめて消す・戻せない・設定の奥だけ（docs/look.md の「消すとき」）。 */
  function delMenu(remove, { sheet, after } = {}) {
    return [{ id: "delete", label: "消す", icon: "trash", danger: true, onPick: () => {
      const undo = remove();
      if (sheet) sheet().close();
      if (after) after();
      toast("消しました", { action: { label: "元に戻す", onClick: () => { undo(); if (after) after(); } } });
    } }];
  }

  /* ---------------- 日を選ぶ暦（小窓） ----------------

     押したところに出る、一か月の暦。端末の日付欄は iPhone で
     `showPicker()` に応えず、手で開くと画面が上へずれた（2026年10月2日・利用者の声
     「期限をオンにしてもカレンダーは自動で開かない。手動で開くと画面が上にズレる」）。
     欄に focus しないので、キーボードの扱いも画面のずれも起きない。週は月曜はじまり
     （`WEEKDAY_COLS`）。日を押すと onPick(日付キー) で閉じる。 */
  /* 今日は色だけで言わない（2026年10月6日・利用者の声「色を変えるだけでは分かりにくい」）：頭に「今日は
     10月6日（火）」、その日の升は輪と「今日」の字。min より前の日は押せない（見直しの紙が渡す）。 */
  function popCalendar(anchor, { value, month, label = "日付", min, onPick, onClose } = {}) {
    const U = KN.util;
    const today = U.todayKey();
    const td = U.dayDate(today);
    const sel = value || "";
    let ym = (sel || month || today).slice(0, 7);
    const p = popOver(anchor, { side: "left", label, cls: "is-cal", onClose });
    const box = node(html`
      <div class="pop-cal">
        <div class="pop-cal-head">
          <button type="button" class="icon-btn js-prev" aria-label="前の月">${icon("chevron-left")}</button>
          <b class="js-ym" aria-live="polite"></b>
          <button type="button" class="icon-btn js-next" aria-label="次の月">${icon("chevron")}</button>
        </div>
        <button type="button" class="pop-cal-now js-now">今日は ${`${td.getMonth() + 1}月${td.getDate()}日（${U.WEEKDAYS[td.getDay()]}）`}</button>
        <div class="pop-cal-grid js-grid" role="grid"></div>
      </div>`);
    const grid = box.querySelector(".js-grid");
    const paint = () => {
      const [y, m] = ym.split("-").map(Number);
      box.querySelector(".js-ym").textContent = `${y}年${m}月`;
      grid.innerHTML = "";
      U.WEEKDAY_COLS.forEach((wd) => grid.append(node(html`<span class="pop-cal-wd">${U.WEEKDAYS[wd]}</span>`)));
      const first = new Date(y, m - 1, 1);
      const lead = (first.getDay() + 6) % 7;
      for (let i = 0; i < lead; i++) grid.append(node(html`<span></span>`));
      const n = new Date(y, m, 0).getDate();
      for (let d = 1; d <= n; d++) {
        const key = `${ym}-${String(d).padStart(2, "0")}`;
        const isToday = key === today;
        const b = node(html`
          <button type="button" class="pop-cal-day ${isToday ? "is-today" : ""}" ${min && key < min ? "disabled" : ""}
                  aria-pressed="${String(key === sel)}" data-day="${key}"
                  ${isToday ? html`aria-label="今日 ${String(d)}日"` : ""}>${String(d)}${isToday ? html`<small>今日</small>` : ""}</button>`);
        b.addEventListener("click", () => { haptic(); p.close(); if (onPick) onPick(key); });
        grid.append(b);
      }
    };
    const step = (k) => {
      const [y, m] = ym.split("-").map(Number);
      const d = new Date(y, m - 1 + k, 1);
      ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      paint();
      p.place();
    };
    box.querySelector(".js-prev").addEventListener("click", () => step(-1));
    box.querySelector(".js-next").addEventListener("click", () => step(1));
    /* 「今日は…」を押せば今日の月へ戻る。 */
    box.querySelector(".js-now").addEventListener("click", () => { ym = today.slice(0, 7); paint(); p.place(); });
    paint();
    p.el.append(box);
    p.place();
    return p;
  }

  /* ---------------- 回すドラム（年・月・日、時・分） ----------------

     手作りのドラムは、どれもこれで止める。前は CSS の `scroll-snap-type: y mandatory`
     で一行ずつ止めていたが、iPhone では一払いの勢いが次の目で止まり、送りが少なかった
     （2026年10月5日・利用者の声「一払いの送りが少ない」）。目を外して指の勢いのまま
     滑らせ、指が離れて止まってから、いちばん近い行へなめらかに寄せる。

     iPhone では、勢いの尾の動きと寄せ（smooth）がかち合うと、寄せが scroll を一つも出さずに
     消え、行の途中で止まったままになった（2026年10月8日・利用者の声）。寄せたあと
     動きが絶えたら確かめ、まだ途中ならその場で行へ置く。 */
  /* 行をまたぐ音（「カチッ」）。iPhone の Safari は震えを出せないので、純正のドラムの手ざわりを音で
     （2026年10月8日・利用者の声）。音の場は ambient——消音スイッチで黙り、流れている音楽も止めない。
     音の口は指で触れたときに開ける（iPhone は触れる前の音を出さない）。 */
  let tickCtx = null, tickBuf = null, tickAt = 0;
  function tickWake() {
    try {
      if (!tickCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (navigator.audioSession) navigator.audioSession.type = "ambient";
        tickCtx = new AC();
        const n = Math.round(tickCtx.sampleRate * 0.012);
        tickBuf = tickCtx.createBuffer(1, n, tickCtx.sampleRate);
        const d = tickBuf.getChannelData(0);
        for (let i = 0; i < n; i++) {
          const s = i / tickCtx.sampleRate;
          d[i] = (Math.sin(2 * Math.PI * 3200 * s) * 0.6 + (Math.random() * 2 - 1) * 0.4) * Math.exp(-s / 0.0015);
        }
      }
      if (tickCtx.state !== "running") tickCtx.resume();
    } catch (_) {}
  }
  function tick() {
    if (!tickCtx || tickCtx.state !== "running") return;
    const now = performance.now();
    if (now - tickAt < 30) return;   // 速い払いで重ならない
    tickAt = now;
    try {
      const src = tickCtx.createBufferSource();
      const g = tickCtx.createGain();
      g.gain.value = 0.25;
      src.buffer = tickBuf;
      src.connect(g).connect(tickCtx.destination);
      src.start();
    } catch (_) {}
  }

  function drum(el, rowH) {
    let touching = false;
    let t = 0;
    let row = -1;
    let live = false;   // 指で回しているあいだ（開いたときの位置合わせでは鳴らさない）
    const settle = (force) => {
      if (touching) return;
      const to = Math.round(el.scrollTop / rowH) * rowH;
      if (Math.abs(el.scrollTop - to) <= 0.5) { live = false; return; }
      if (force) { el.scrollTop = to; live = false; return; }
      el.scrollTo({ top: to, behavior: "smooth" });
      t = setTimeout(() => settle(true), 400);
    };
    const later = () => { clearTimeout(t); t = setTimeout(settle, 90); };
    el.addEventListener("touchstart", () => { touching = true; live = true; clearTimeout(t); tickWake(); }, { passive: true });
    const up = () => { touching = false; tickWake(); later(); };
    el.addEventListener("touchend", up, { passive: true });
    el.addEventListener("touchcancel", up, { passive: true });
    el.addEventListener("scroll", () => {
      /* 行をまたぐたびに、かちっと（音と、震えの出せる端末では震え）。 */
      const i = Math.round(el.scrollTop / rowH);
      if (i !== row) { if (live && row >= 0) { tick(); haptic(4); } row = i; }
      later();
    }, { passive: true });
    return el;
  }

  /** ドラムの一列（年・月・日、時・分）。止まった行の値（数）を onSettle(v) へ渡す。 */
  function wheelCol(fmt, colLabel, onSettle) {
    const ROW = KN.gesture.WHEEL_ROW;
    const el = drum(node(html`<div class="note-wheel" role="listbox" aria-label="${colLabel}" tabindex="0"></div>`), ROW);
    let idx = -1;
    let t = 0;
    const fill = (vals) => {
      el.innerHTML = "";
      idx = -1;
      vals.forEach((v) => el.append(node(html`<div class="note-wheel-row" role="option" data-v="${v}">${fmt(v)}</div>`)));
    };
    const mark = (i) => {
      if (i === idx) return;
      const rows = el.children;
      if (rows[idx]) rows[idx].removeAttribute("aria-selected");
      idx = i;
      if (rows[idx]) rows[idx].setAttribute("aria-selected", "true");
    };
    const read = () => Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / ROW)));
    const settle = () => {
      const i = read();
      mark(i);
      onSettle(Number(el.children[i].dataset.v));
    };
    el.addEventListener("scroll", () => {
      mark(read());
      clearTimeout(t);
      t = setTimeout(settle, 120);
    }, { passive: true });
    /* 押した行へ回す（指で回さなくても選べる）。 */
    el.addEventListener("click", (e) => {
      const r = e.target.closest(".note-wheel-row");
      if (!r) return;
      el.scrollTo({ top: [...el.children].indexOf(r) * ROW, behavior: "smooth" });
    });
    const go = (v) => {
      const i = Math.max(0, [...el.children].findIndex((r) => Number(r.dataset.v) === v));
      el.scrollTop = i * ROW;
      mark(i);
    };
    return { el, fill, go, settle: () => { clearTimeout(t); settle(); } };
  }

  /** 年・月・日の三列。`base` は Date。`years` は [最初, 最後]。値は `value()`（{y, m, d}）。
      ノートの「作った日」・daily の期間の書き出し・目標日が使う。 */
  function dateDrums(base, { years: span, label = "日付" } = {}) {
    const y0 = span ? span[0] : Math.min(1990, base.getFullYear());
    const y1 = span ? span[1] : Math.max(new Date().getFullYear(), base.getFullYear());
    const years = [];
    for (let y = y0; y <= y1; y++) years.push(y);
    const at = { y: base.getFullYear(), m: base.getMonth() + 1, d: base.getDate() };
    const daysIn = () => new Date(at.y, at.m, 0).getDate();
    const box = node(html`<div class="note-wheels" role="group" aria-label="${label}"></div>`);
    const set = (k) => (v) => { if (at[k] !== v) { at[k] = v; if (k !== "d") fitDays(); } };
    const yc = wheelCol((v) => `${v}年`, "年", set("y"));
    const mc = wheelCol((v) => `${v}月`, "月", set("m"));
    const dc = wheelCol((v) => `${v}日`, "日", set("d"));
    yc.fill(years);
    mc.fill([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    let dn = 0;
    function fitDays() {
      const n = daysIn();
      if (n === dn) return;
      dn = n;
      at.d = Math.min(at.d, n);
      dc.fill(Array.from({ length: n }, (_, i) => i + 1));
      dc.go(at.d);
    }
    fitDays();
    box.append(yc.el, mc.el, dc.el);
    return {
      el: box,
      /** 中身が置かれて高さが決まってから、いまの日へ回す。 */
      go() { yc.go(at.y); mc.go(at.m); dc.go(at.d); },
      /** 回し終わりを待たずに閉じても、止まっている行で決める。 */
      value() { yc.settle(); mc.settle(); dc.settle(); return { ...at }; },
    };
  }

  /** ドラムの小窓の下の「OK」。閉じれば決まる（外を押すのと同じ）。「なし」は whenFields がこの左に足す。 */
  function okFoot(p) {
    const foot = node(html`<div class="when-foot"><button type="button" class="btn btn-primary when-ok">OK</button></div>`);
    foot.firstElementChild.addEventListener("click", () => { haptic(); p.close(); });
    return foot;
  }

  /** 日を選ぶドラムの小窓（日付キー）。決めるのは閉じたとき（外を押す・Escape）。
      期間の書き出し（V22）で、利用者の声「年月日のドラムにしたい」（2026年10月5日）。
      空の欄（value なし）は今日から回し、回さずに閉じても今日に決まる。 */
  function popDate(anchor, { value, label = "日付", years, onPick } = {}) {
    const U = KN.util;
    const key = value || U.todayKey();
    const [y, m, d] = key.split("-").map(Number);
    const dd = dateDrums(new Date(y, m - 1, d), { years, label });
    const p = popOver(anchor, {
      side: "left", label, cls: "is-pick is-wheel",
      onClose: () => {
        const v = dd.value();
        const next = `${v.y}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
        if (next !== (value || "") && onPick) onPick(next);
      },
    });
    p.el.append(dd.el, okFoot(p));
    p.place();
    dd.go();
    return p;
  }

  /** 時刻を選ぶ車輪の小窓（"HH:MM"・時と1分きざみの分）。作りは popDate と同じで、決めるのは閉じたとき。
      空の欄はいまの時刻から回す（U8・端末の時刻欄をやめた）。 */
  function popTime(anchor, { value, label = "時刻", cls = "", onPick } = {}) {
    const U = KN.util;
    const key = U.isTime(value) ? value : U.nowTime();
    const at = { h: Number(key.slice(0, 2)), m: Number(key.slice(3, 5)) };
    const box = node(html`<div class="note-wheels is-time" role="group" aria-label="${label}"></div>`);
    const hc = wheelCol((v) => `${v}時`, "時", (v) => { at.h = v; });
    const mc = wheelCol((v) => `${String(v).padStart(2, "0")}分`, "分", (v) => { at.m = v; });
    hc.fill(Array.from({ length: 24 }, (_, i) => i));
    mc.fill(Array.from({ length: 60 }, (_, i) => i));
    box.append(hc.el, mc.el);
    const p = popOver(anchor, {
      side: "left", label, cls: `is-pick is-wheel ${cls}`,
      onClose: () => {
        hc.settle(); mc.settle();
        const next = `${String(at.h).padStart(2, "0")}:${String(at.m).padStart(2, "0")}`;
        if (next !== (value || "") && onPick) onPick(next);
      },
    });
    p.el.append(box, okFoot(p));
    p.place();
    hc.go(at.h);
    mc.go(at.m);
    return p;
  }

  /* ---------------- 日付と時刻の欄（U8） ----------------

     端末の日付欄・時刻欄はやめた（iPhone で `showPicker()` に応えず、手で開くと画面が上へずれた）。
     書き方は `<input type="hidden" class="input js-…" data-when="day|far|time" value="…">` のまま置いて、
     組んだあとに `whenFields(root)` を呼ぶ。見えるのは `.input` の形のボタンで、押すと
       day … 暦の小窓（popCalendar）／far … 年月日のドラム（popDate。目標日のような遠い日）／time … 車輪（popTime）。
     **値は隠した <input> に持つ**：紙を閉じたときの書きかけの保存（makeGuard）は欄の value しか見ないので、
     JS の変数に持つと日や時刻だけ変えて閉じた分が黙って落ちる（roadmap-unify の 3節）。選んだら value を書いて
     `input`・`change` を投げる——今までの `addEventListener("change")` も `.value` もそのまま動く。
     `data-clear` があれば小窓に「なし」（空へ戻す口。端末の欄にはあった）。 */
  const WHEN_EMPTY = { day: "--/--/--", far: "--/--/--", time: "--:--" };
  function whenText(kind, v) {
    const U = KN.util;
    if (!v) return WHEN_EMPTY[kind];
    if (kind === "time") return U.isTime(v) ? `${Number(v.slice(0, 2))}:${v.slice(3, 5)}` : v;
    const d = U.dayDate(v);
    if (!d) return v;
    /* 「今日」「昨日」だけでは何日か分からないので、言葉のあとに日付も添える（今日 10/7(水)）。 */
    const say = U.formatDay(v);
    return say.includes("/") ? say : `${say} ${d.getMonth() + 1}/${d.getDate()}(${U.WEEKDAYS[d.getDay()]})`;
  }
  function whenFields(root) {
    const own = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    root.querySelectorAll("input[data-when]").forEach((inp) => {
      if (inp.nextElementSibling && inp.nextElementSibling.classList.contains("when-btn")) return;
      const kind = inp.dataset.when;
      const label = inp.getAttribute("aria-label") || (kind === "time" ? "時刻" : "日付");
      const btn = node(html`<button type="button" class="input when-btn" aria-label="${label}"></button>`);
      const paint = () => {
        const v = own.get.call(inp);
        btn.textContent = whenText(kind, v);
        btn.classList.toggle("is-empty", !v);
      };
      /* 呼ぶ側が `.value = …` と書いても（札で「明日」を選んだ、×で外した）、見える字が追う。 */
      Object.defineProperty(inp, "value", {
        configurable: true,
        get() { return own.get.call(this); },
        set(v) { own.set.call(this, v); paint(); },
      });
      const put = (v) => {
        if (v === inp.value) return;
        inp.value = v;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      };
      btn.addEventListener("click", () => {
        let cleared = false;
        const onPick = (v) => { if (!cleared) put(v); };
        const opts = { value: inp.value || null, label, onPick };
        const y = new Date().getFullYear();
        const vy = inp.value ? Number(inp.value.slice(0, 4)) : y;
        const p = kind === "time" ? popTime(btn, opts)
          : kind === "far" ? popDate(btn, { ...opts, years: [Math.min(y - 1, vy), Math.max(y + 10, vy)] })
          : popCalendar(btn, opts);
        if (inp.hasAttribute("data-clear") && inp.value) {
          const foot = p.el.querySelector(".when-foot");
          const none = node(html`<button type="button" class="btn ${foot ? "" : "btn-block "}btn-soft when-none">なし</button>`);
          none.addEventListener("click", () => { cleared = true; put(""); p.close(); });
          if (foot) foot.prepend(none); else p.el.append(none);
          p.place();
        }
      });
      inp.after(btn);
      paint();
    });
    return root;
  }

  /* ---------------- toast ---------------- */

  let toastTimer = null;

  /* 押せるもの（「元に戻す」ほか）が付くトーストは、既定で長めに出す——押しに
     行くあいだに消えないように（roadmap-2.0 の V18。言葉は「元に戻す」に揃える）。 */
  const TOAST_MS = 3600, TOAST_ACT_MS = 5000;
  /* `long`＝読むのに時間がかかる文（何も変えていない理由など）。`until`＝答えを待つあいだの
     「…しています」——答えが来たら呼ぶ側が `dismiss()` する。来なかったときのための上限だけ持つ。
     長さを数で渡す口は持たない（場所ごとに違う長さが生えるので）。`stay`＝押すまで残る
     （週に一度の控え。docs/storage.md）。 */
  const TOAST_LONG_MS = 8000, TOAST_UNTIL_MS = 60000;

  function toast(message, { action, actions, long, until, stay } = {}) {
    const root = toastRoot();
    root.innerHTML = "";
    clearTimeout(toastTimer);
    /* 押せるものは二つまで（済ませたときの「時刻」と「元に戻す」）。 */
    const acts = actions || (action ? [action] : []);
    const duration = until ? TOAST_UNTIL_MS : long ? TOAST_LONG_MS : acts.length ? TOAST_ACT_MS : TOAST_MS;

    const el = node(html`
      <div class="toast">
        <span class="toast-msg">${message}</span>
        ${acts.map((a) => html`<button class="toast-action">${a.label}</button>`)}
      </div>
    `);

    el.querySelectorAll(".toast-action").forEach((b, i) => {
      b.addEventListener("click", (e) => {
        // Stop it reaching the tap-to-dismiss below: the action closes the
        // toast itself, and running both would be doing the same work twice.
        e.stopPropagation();
        acts[i].onClick(b);
        dismiss();
      });
    });

    /* Tapped anywhere else: gone. It is an aside, not a question, and sitting
       out its 3.6 seconds to see the row underneath is a poor deal. */
    el.addEventListener("click", () => dismiss());

    let gone = false;
    function dismiss() {
      if (gone) return;
      gone = true;
      clearTimeout(toastTimer);
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 220);
    }

    root.append(el);
    if (!stay) toastTimer = setTimeout(dismiss, duration);
    return { dismiss };
  }

  /* ---------------- confirm ---------------- */

  function confirm({ title, message, okLabel = "OK", cancelLabel = "キャンセル", danger = false }) {
    return new Promise((resolve) => {
      let settled = false;
      const body = node(html`<div class="stack gap-2"><p class="sheet-text">${message || ""}</p></div>`);
      const foot = node(html`
        <div class="btn-row">
          <button class="btn btn-soft js-cancel grow">${cancelLabel}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"} js-ok grow">${okLabel}</button>
        </div>
      `);

      const h = sheet({
        title, content: body, footer: foot, guard: false, as: "dialog",
        onClose: () => { if (!settled) { settled = true; resolve(false); } },
      });

      foot.querySelector(".js-cancel").addEventListener("click", () => h.close());
      foot.querySelector(".js-ok").addEventListener("click", () => {
        settled = true;
        resolve(true);
        h.close();
      });
    });
  }

  /* ---------------- prompt ---------------- */

  /* secret … 合言葉のように、伏せて打つもの。前後の空白も**そのまま**返します
     （合言葉の空白を黙って削ると、合っているのに開かなくなります）。 */
  function prompt({ title, label, value = "", placeholder = "", okLabel = "保存", inputMode, secret = false }) {
    return new Promise((resolve) => {
      let settled = false;
      const body = node(html`
        <label class="field">
          ${label ? html`<span class="field-label">${label}</span>` : ""}
          <input class="input js-input" value="${value}" placeholder="${placeholder}" enterkeyhint="done"
                 ${inputMode ? KN.util.raw(`inputmode="${inputMode}"`) : ""}
                 ${secret ? KN.util.raw(`type="password" autocomplete="off" autocapitalize="none" spellcheck="false"`) : ""}>
        </label>
      `);
      const foot = node(html`
        <div class="btn-row">
          <button class="btn btn-soft js-cancel grow">キャンセル</button>
          <button class="btn btn-primary js-ok grow">${okLabel}</button>
        </div>
      `);

      const h = sheet({
        title, content: body, footer: foot, guard: false, as: "dialog",
        onClose: () => { if (!settled) { settled = true; resolve(null); } },
      });

      const input = body.querySelector(".js-input");
      function submit() {
        settled = true;
        resolve(secret ? input.value : input.value.trim());
        h.close();
      }
      input.addEventListener("keydown", (e) => { if (KN.util.isEnter(e)) { e.preventDefault(); submit(); } });
      foot.querySelector(".js-ok").addEventListener("click", submit);
      foot.querySelector(".js-cancel").addEventListener("click", () => h.close());
    });
  }

  /* ---------------- store picker ---------------- */

  /** Chips of known stores + inline "new store" field. Resolves to a storeId. */
  /**
   * @param opts.selectedId  the shop to start on, or null
   * @param opts.autoPick    fall back to the first shop when nothing is given.
   *   Off where landing on a shop by default would be a decision made for the
   *   user — recording a price against whichever shop happens to sort first
   *   is not a thing anyone asked for.
   */
  function storePicker(container, { selectedId, onSelect, autoPick = true }) {
    const stores = KN.store.sortedStores();
    let current = selectedId || (autoPick ? (stores[0] && stores[0].id) : null) || null;

    function render() {
      container.innerHTML = "";
      const wrap = node(html`<div class="chip-wrap"></div>`);
      stores.forEach((s) => {
        const chip = node(html`
          <button type="button" class="chip" aria-pressed="${String(s.id === current)}">
            <span class="dot" style="background:${s.color}"></span>${s.name}
          </button>
        `);
        chip.addEventListener("click", () => {
          current = s.id;
          onSelect(current);
          render();
        });
        wrap.append(chip);
      });

      const addChip = node(html`<button type="button" class="chip">＋ お店を追加</button>`);
      addChip.addEventListener("click", async () => {
        const name = await prompt({ title: "お店を追加", label: "お店の名前", placeholder: "例：イオン 〇〇店" });
        if (!name) return;
        const rec = KN.store.addStore(name);
        stores.length = 0;
        KN.store.sortedStores().forEach((s) => stores.push(s));
        current = rec.id;
        onSelect(current);
        render();
      });
      wrap.append(addChip);
      container.append(wrap);
    }

    render();
    if (current) onSelect(current);
    return { get current() { return current; } };
  }

  /* ---------------- horizontal chip filter ---------------- */

  /**
   * A sideways-scrolling row of filter chips that survives a re-render.
   *
   * Rebuilding the row from scratch on every tap threw its scroll position
   * away, so choosing a category that had been scrolled into view sent the
   * whole row back to the left and the chip just pressed could end up off
   * the screen. Here the row is kept: while the chips themselves are
   * unchanged only `aria-pressed` moves, and the scroller is never touched.
   * A real change — a category gaining items, or disappearing — does rebuild,
   * and puts the scroll position back where it was.
   *
   * @param {HTMLElement} host
   * @param {Array<{id:string,label:string,emoji?:string,color?:string,count?:number}>} chips
   * @param {{activeId:string, onPick:Function}} opts
   */
  function chipRow(host, chips, { activeId, onPick }) {
    const sig = chips.map((c) => `${c.id}\u0000${c.label}\u0000${c.count == null ? "" : c.count}`).join("|");
    let row = host.querySelector(".chip-row");

    if (row && row.dataset.sig === sig) {
      row.querySelectorAll(".chip").forEach((el) => {
        el.setAttribute("aria-pressed", String(el.dataset.id === String(activeId)));
      });
      return row;
    }

    const left = row ? row.scrollLeft : 0;
    host.innerHTML = "";
    row = node(html`<div class="chip-row"></div>`);
    row.dataset.sig = sig;

    chips.forEach((c) => {
      /* Only written when there is a colour: `--cat:` with nothing after it is
         an empty value, not an absent one, so `var(--cat, var(--c-primary))`
         would substitute nothing and the selected 「すべて」 chip would lose
         its green rather than fall back to it. */
      /* **絵文字はやめました**（「アプリ内UIに絵文字を使わない」——最優先の
         約束事）。かわりに置くのは**カテゴリ色の丸**です。色はこの画面で
         すでに「どの棚か」を言っているもの（行の丸・暦の丸・丸薬と同じ）
         なので、同じ言葉を札でも一度使うだけで済みます。
         保存済みの `emoji` 欄は**消していません**——描くのをやめただけです。 */
      const el = node(html`
        <button type="button" class="chip" data-id="${c.id}"
                aria-pressed="${String(c.id === activeId)}"
                ${c.color ? KN.util.raw(`style="--cat:${c.color}"`) : ""}>
          ${c.color ? html`<span class="chip-dot" aria-hidden="true"></span>` : ""}${c.label}
          ${c.count != null ? html`<span class="chip-count">${String(c.count)}</span>` : ""}
        </button>
      `);
      el.addEventListener("click", () => onPick(c.id));
      row.append(el);
    });

    host.append(row);
    row.scrollLeft = left;
    return row;
  }

  /* ---------------- アイコンを選ぶ紙 ----------------

     買うもの（product-sheet.js）とやること（screen-todo.js）が分け合う一つ
     （roadmap-unify の U2）。並べるのは「探す欄」「この絵はちがう、と記録する」
     「おまかせにする」「もしかして」「ぜんぶ（見出しで束ねる）」。違うのは
     絵の出どころと、選んだあとに何をするかだけなので、そこを受け取ります。

     報告は「選ぶ」のついでに残します。押した瞬間には何が正しいかまだ
     分からない（分かっていれば選んでいる）ので、ここでは腕を組むだけ
     （armed）——次に choose() が呼ばれたとき（グリッドの絵、または
     「おまかせにする」）、その結果を chosen として一緒に書きます。
     「おまかせ」のまま報告すれば、chosen は空——「正しい絵はまだ無い」
     という記録そのものです。 */
  /**
   * @param {{
   *   screen: string,                       // 報告に書く画面（"shop" / "todo"）
   *   current: () => string,                // いま選んである鍵（無ければ ""）
   *   reportOf: () => {text: string, gotIcon: string},  // 腕を組んで選んだときの報告の中身
   *   guess: (text: string) => string,      // 探して当たらなかった言葉の、自動の推測
   *   autoMark: () => string|null,          // 「おまかせにする」に添える絵（null なら何も描かない）
   *   autoSub?: string,                     // 「おまかせにする」の下の一言
   *   search: (q: string) => Array,         // 探す欄の当たり（{key,label,svg}）
   *   maybe: () => Array,                   // 「もしかして」
   *   groups: () => Array<{label: string, items: Array}>,  // ぜんぶ（見出しで束ねる）
   *   onChoose: (key: string|null) => void, // 選んだ（null＝おまかせ）。このあと紙を閉じます
   * }} o
   */
  function iconPicker(o) {
    const store = KN.store;
    const body = node(html`
      <div class="stack gap-3">
        <input class="input js-q" placeholder="絵をさがす（例：洗剤）"
               autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="絵をさがす">
        <button type="button" class="icon-report-toggle js-report-toggle" aria-pressed="false">
          ${icon("flag")}
          <span class="icon-report-text">この絵はちがう、と記録する</span>
        </button>
        <div class="stack js-grids gap-3"></div>
      </div>
    `);
    const grids = body.querySelector(".js-grids");
    const q = body.querySelector(".js-q");
    const handle = sheet({ title: "アイコンを選ぶ", content: body });

    let armed = false;
    const reportBtn = body.querySelector(".js-report-toggle");
    reportBtn.addEventListener("click", () => {
      armed = !armed;
      reportBtn.classList.toggle("is-on", armed);
      reportBtn.setAttribute("aria-pressed", String(armed));
      reportBtn.querySelector(".icon-report-text").textContent = armed
        ? "次に選ぶ絵を「ちがう」として記録します"
        : "この絵はちがう、と記録する";
    });

    function choose(key) {
      if (armed) {
        const { text, gotIcon } = o.reportOf();
        store.addIconReport({
          text: text || "", screen: o.screen, gotIcon: gotIcon || "",
          kind: gotIcon ? "wrong" : "missing", chosen: key || "",
        });
        toast("記録しました");
      }
      o.onChoose(key || null);
      handle.close();
    }

    /* 一画面に入るぶんより、少し多め。最初の一手で見えるところが埋まっていれば、
       残りが何フレームか遅れて届いても、めくるより先に間に合います。 */
    const CHUNK = 120;
    /* 開いているシートが閉じたら、まだ流し込んでいるぶんは止めます。 */
    let painting = 0;

    function cellOf({ key, label, svg }) {
      const current = o.current() || "";
      const cell = node(html`
        <button type="button" class="icon-cell ${key === current ? "is-on" : ""}"
                data-key="${key}" aria-pressed="${String(key === current)}">
          <span class="icon-cell-mark">${KN.util.raw(svg)}</span>
          <span class="icon-cell-label">${label}</span>
        </button>
      `);
      cell.addEventListener("click", () => choose(key));
      return cell;
    }

    function grid(items) {
      const g = node(html`<div class="icon-grid"></div>`);

      /* 絵が557個だったころは、全部いちどに組んで差し込んでも 70ms でした。
         857個になると DOM が 8,000 節点・HTML が 700KB を超えて、実機では
         シートが開く手が止まります。

         そこで最初の一掴みだけを同期で入れ、残りはフレームごとに継ぎ足します。
         総量は同じでも、一フレームに載る仕事が減るので、開く動作は止まりません。
         中身は変わらないので、探すことにも選ぶことにも影響しません。 */
      const head = items.slice(0, CHUNK);
      head.forEach((it) => g.append(cellOf(it)));

      if (items.length > CHUNK) {
        const mine = ++painting;
        let at = CHUNK;
        const more = () => {
          // 描き直しが始まっていたら、古い流し込みはここで降ります。
          if (mine !== painting || !g.isConnected) return;
          const stop = Math.min(at + CHUNK, items.length);
          const frag = document.createDocumentFragment();
          for (; at < stop; at++) frag.append(cellOf(items[at]));
          g.append(frag);
          if (at < items.length) requestAnimationFrame(more);
        };
        requestAnimationFrame(more);
      }
      return g;
    }

    /* 「ぜんぶ」は見出しで束ねて出します。見出しの無い一本の格子で流れて
       いたので、探す欄で当たらなかった人には、そこから先の手がかりが
       ありませんでした。

       **刻むのは見出し単位で、`grid()` は使いません。** `grid()` の流し込みは
       `painting` の札で「最後の一本だけを生かす」作りなので、見出しごとに
       呼ぶと、二つ目が始まった時点で一つ目の流し込みが死にます。しかも
       どの見出しも120枚（CHUNK）未満なので、そもそも刻まれず 707枚が
       まるごと同期で入ります——**実機でシートが開く手が止まる**、あの形に
       戻ってしまう。だから流し込みは一本のまま、切り口を見出しへ移します
       （やることの「こと」も、この一本に先頭の見出しとして乗せます）。 */
    function paintGroups(gs, into) {
      const mine = ++painting;
      const put = (g) => {
        into.append(heading(g.label));
        const box = node(html`<div class="icon-grid"></div>`);
        g.items.forEach((it) => box.append(cellOf(it)));
        into.append(box);
      };
      /* 最初の一手で見えるぶんだけ同期で。残りはフレームごとに一見出しずつ
         ——いちばん大きい見出しでも76枚なので、一フレームの仕事は前より軽い。 */
      const HEAD = 2;
      gs.slice(0, HEAD).forEach(put);
      let at = HEAD;
      const more = () => {
        if (mine !== painting || !into.isConnected) return;
        put(gs[at++]);
        if (at < gs.length) requestAnimationFrame(more);
      };
      if (at < gs.length) requestAnimationFrame(more);
    }

    const heading = (text) => node(html`<span class="field-label">${text}</span>`);

    function paint() {
      const mark = o.autoMark();
      if (mark == null) return;
      grids.innerHTML = "";
      const query = q.value.trim();

      if (query) {
        const hits = o.search(query);
        if (!hits.length) {
          /* 「合う絵はありません」で行き止まりにしません。ここで探した
             言葉そのものに絵が無い、という発見そのものが**報告の材料**
             なので、その場で残せるようにします（腕組みボタンを押す手間を
             飛ばして、いま打った言葉を直接記録する一本道）。 */
          const empty = node(html`
            <div class="stack gap-2">
              <p style="color:var(--c-text-3);font-size:calc(13px * var(--fs-k));padding:8px 0 0">
                「${query}」に合う絵はありません
              </p>
              <button type="button" class="icon-report-toggle js-report-empty">
                ${icon("flag")}
                <span class="icon-report-text">「${query}」の絵が無い、と記録する</span>
              </button>
            </div>
          `);
          empty.querySelector(".js-report-empty").addEventListener("click", () => {
            const gotIcon = o.guess(query) || "";
            store.addIconReport({ text: query, screen: o.screen, gotIcon, kind: gotIcon ? "wrong" : "missing" });
            toast("記録しました");
          });
          grids.append(empty);
          return;
        }
        grids.append(grid(hits));
        return;
      }

      /* Back to the guess. Shown with the picture it would land on, so it is
         a choice between two pictures rather than a choice with the lights
         off. */
      const cur = o.current();
      const auto = node(html`
        <button type="button" class="icon-auto js-auto ${cur ? "" : "is-on"}"
                aria-pressed="${String(!cur)}">
          <span class="icon-pick-mark">${mark}</span>
          <span class="icon-pick-text">
            <span class="icon-pick-name">おまかせにする</span>
            ${o.autoSub ? html`<span class="icon-pick-sub">${o.autoSub}</span>` : ""}
          </span>
        </button>
      `);
      auto.addEventListener("click", () => choose(null));
      grids.append(auto);

      const maybe = o.maybe();
      if (maybe.length) {
        grids.append(heading("もしかして"));
        grids.append(grid(maybe));
      }

      paintGroups(o.groups(), grids);
    }

    q.addEventListener("input", KN.util.debounce(paint, 160));
    paint();
    return handle;
  }

  /* ---------------- category picker ---------------- */

  function categoryPicker(container, { selectedId, onSelect }) {
    let current = selectedId || KN.store.OTHER_CATEGORY;

    function render() {
      container.innerHTML = "";
      const wrap = node(html`<div class="chip-wrap"></div>`);
      KN.store.sortedCategories().forEach((c) => {
        /* 色があるときだけ `--cat` を書きます。`--cat:` を空で書くと、
           それは「無い」ではなく「空の値」なので、`var(--cat, …)` が
           何にも落ちません（すぐ上の chipRow の但し書きと同じ罠——
           ここは書きっぱなしでした）。 */
        const chip = node(html`
          <button type="button" class="chip" aria-pressed="${String(c.id === current)}"
                  ${c.color ? KN.util.raw(`style="--cat:${c.color}"`) : ""}>
            ${c.color ? html`<span class="chip-dot" aria-hidden="true"></span>` : ""}${c.name}
          </button>
        `);
        chip.addEventListener("click", () => {
          current = c.id;
          haptic();
          onSelect(current);
          render();
        });
        wrap.append(chip);
      });
      container.append(wrap);
    }

    render();
    return {
      get current() { return current; },
      /** Move the selection without firing onSelect — for when something else
       *  changed the category, e.g. a rename that re-guessed it. */
      set(id) { if (id && id !== current) { current = id; render(); } },
    };
  }

  /* ---------------- layout: rows or tiles ---------------- */

  /* Both lists are laid out the same way, from one setting. Two screens
     disagreeing about how a product looks would be a setting the app keeps
     rather than a way of looking at it. */

  const isTiles = () => KN.store.get().settings.layout === "tiles";

  function toggleLayout() {
    const to = isTiles() ? "rows" : "tiles";
    haptic(10);
    KN.store.update((s) => { s.settings.layout = to; });
  }

  /** Paints a topbar button with the layout it switches *to*. */
  function paintLayoutButton(btn) {
    if (!btn) return;
    const toTiles = !isTiles();
    btn.innerHTML = "";
    btn.append(node(html`${icon(toTiles ? "tiles" : "rows")}`));
    const label = toTiles ? "タイル表示にする" : "リスト表示にする";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  /* ---------------- swipe: right to take, left to archive ---------------- */

  /* One gesture for both screens and both layouts. Right is the tab's own
     positive action — ★ on the list, onto the list on the price screen — and
     left is always the archive. Nothing stays open, because neither has a
     second step to confirm; the card springs back and the change lands as it
     goes, with the toast holding the undo.

     Past the trigger the card only creeps, so the finger can feel where the
     edge is instead of watching for it. A tile is a third of a screen across,
     so it gets its own shorter throw — the same gesture, scaled to what is
     actually under the thumb.

     @param wrap  the positioned container holding the panels
     @param card  the part that moves
     @param opts  {onRight, onLeft, tiles} */
  function swipeActions(wrap, card, { onRight, onLeft, tiles }) {
    const TRIGGER = tiles ? 34 : 68;
    const MAX = tiles ? 52 : 104;
    const SLOP = tiles ? 10 : 14;
    const DOMINANCE = 1.6;

    let startX = 0, startY = 0, dx = 0, dir = 1;
    let dragging = false, decided = false, pointerId = null, swallowClick = false;
    let armed = false, pending = null, rafId = 0;

    // Pointer moves arrive faster than the screen refreshes; painting once per
    // frame is the difference between gliding and stuttering.
    const paint = () => {
      rafId = 0;
      if (pending === null) return;
      card.style.transform = `translate3d(${pending}px, 0, 0)`;
    };
    const schedule = (v) => {
      pending = v;
      if (!rafId) rafId = requestAnimationFrame(paint);
    };

    card.addEventListener("touchmove", (e) => { if (dragging) e.preventDefault(); }, { passive: false });

    card.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dragging = false;
      decided = false;
      armed = false;
    });

    card.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointerId) return;
      // Held still long enough to lift the row out of the list — from there the
      // gesture belongs to the reorder.
      if (KN.reorder && KN.reorder.isActive && KN.reorder.isActive()) return;
      const mx = e.clientX - startX;
      const my = e.clientY - startY;

      if (!decided) {
        if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
        decided = true;
        // Clearly sideways, not a drifting scroll: a diagonal belongs to the
        // list, which stays scrollable throughout.
        dragging = Math.abs(mx) >= SLOP && Math.abs(mx) > Math.abs(my) * DOMINANCE;
        if (!dragging) return;
        dir = mx > 0 ? 1 : -1;
        card.setPointerCapture(pointerId);
        card.style.transition = "none";
        wrap.classList.add("is-swiping", dir > 0 ? "is-right" : "is-left");
      }
      if (!dragging) return;

      const travel = mx * dir;
      dx = dir * Math.min(MAX, travel <= TRIGGER ? Math.max(0, travel)
        : TRIGGER + (travel - TRIGGER) * 0.32);
      const now = Math.abs(dx) >= TRIGGER;
      if (now !== armed) {
        armed = now;
        wrap.classList.toggle("is-armed", armed);
        if (armed) haptic(10);
      }
      schedule(dx);
    });

    const finish = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      if (!dragging) return;

      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      pending = null;
      card.style.transition = "";
      card.style.transform = "";
      const fired = armed;
      const way = dir;
      dragging = false;
      armed = false;
      swallowClick = true;
      // Let the card glide home before the store change rebuilds the list;
      // committing on the spot would swap it out mid-flight.
      setTimeout(() => {
        wrap.classList.remove("is-swiping", "is-armed", "is-left", "is-right");
        if (!fired) return;
        if (way > 0) { if (onRight) onRight(); }
        else if (onLeft) onLeft();
      }, 200);
    };
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);

    // A pointer sequence still fires a click afterwards; left alone it would
    // press whatever the finger lifted over at the end of every swipe.
    card.addEventListener("click", (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }

  /* ---------------- 文字でさがす：上に隠してあるバー ----------------

     バーは**いつもそこにあります**が、いつもは見えません。題（.topbar）の
     すぐ下、画面のいちばん上に置いてあって、その画面を開いた時点で、
     ちょうどその一段ぶんだけ先へ送ってあります。.topbar は貼りついて
     いるので、送られたバーはその裏に隠れます。少し下へ引けば出てくる
     ——iOS のメールや写真と同じ、「上に隠してある」やり方です。

     隠すのに hidden を使っていたころは、虫めがねを押さないと在ることが
     分かりませんでした。いまは押さなくても、下へ引けば出てきます。
     虫めがねはそのまま残します——出すのに一番速い道でもあるので。

     引ける余地が無い画面（中身が一画面に収まっている）では、送れないので
     出したままになります。探すものが無いくらい短い一覧なので、それで
     困りません。

     @param els  { screen, searchBtn, searchWrap, search, searchClear, mine? }
                 mine … 虫めがねを他の画面と分け合うとき、押されたのが自分の番か
     @param onChange  called after the query changes; repaint the list
     @param setQuery  hands the folded query back to the screen
  */
  function searchWrapOf(scroller) {
    return scroller ? scroller.querySelector(".search-wrap") : null;
  }

  /** 窓を出しっぱなしにするか（設定）。既定は「出さない」。 */
  function searchBarAlways() {
    try { return KN.store.get().settings.searchBar === true; } catch (_) { return false; }
  }

  /** バーを一段ぶん先へ送って、題の裏に隠します。 */
  function parkSearch(scroller, force) {
    const wrap = searchWrapOf(scroller);
    if (!wrap) return;
    const input = wrap.querySelector(".search-input");
    // 探している最中の人の手からは、画面を取り上げません。
    if (input && (input.value || document.activeElement === input)) return;

    /* 窓を置きっぱなしにしない設定なら、裏へ送るのではなく畳みます。
       送るやりかたは「上に一段ぶんの余白がある」ことが前提なので、
       出していないときはそもそも余白が要りません。

       設定を入れ替えた直後に、その場で追いつくところでもあります——画面へ
       戻ってきたときに必ずここを通るので、畳んだ窓を出し直すのも、出して
       いた窓を畳むのも、ここ一か所で済みます。 */
    if (!searchBarAlways()) {
      wrap.hidden = true;
      wrap.style.opacity = "";
      const stack0 = wrap.parentElement;
      if (stack0) { stack0.style.flexShrink = ""; stack0.style.minHeight = ""; }
      return;
    }
    wrap.hidden = false;
    const h = Math.round(wrap.getBoundingClientRect().height);
    if (!h) return;
    // すでに読み進めているところへ、割り込みません。
    if (!force && scroller.scrollTop > h + 1) return;

    /* 送る余地が足りないとき——中身が一画面に収まっている画面——は、
       足りないぶんだけ下に余白を足します。余白は送りきったところで
       ちょうど使い切るので、画面には出ません。これが無いと、短い画面
       だけバーが出たままになって、タブごとに顔が変わります。 */
    const stack = wrap.parentElement;
    if (stack) {
      /* flex-shrink を止めてから。flex の子は既定で min-height:auto を
         持っていて、それが「中身より縮まない」を保証しています。ここで
         min-height を書くとその自動の下限が外れ、**中身より縮める**ように
         なります——長い画面（ダイエット）の下が、帯の下に潜りました。 */
      stack.style.flexShrink = "0";
      stack.style.minHeight = `calc(100% + ${h}px)`;
    }
    scroller.scrollTop = h;
  }

  /** バーを出して、そのまま打てるようにします。 */
  function revealSearch(scroller, input) {
    // focus が先です。iOS は「指の動きからたどれる focus」にしか
    // キーボードを出しません（focusNow の説明と同じ理由）。
    if (input) focusNow(input);
    if (scroller) KN.app.glideTo(scroller, 0);
  }

  function wireSearch(els, onChange, setQuery) {
    const scroller = els.screen || (els.searchWrap && els.searchWrap.closest(".screen"));

    const paint = () => {
      // 光るのは「いま絞り込んでいる」ときだけ。出ているかどうかではなく。
      const on = !!els.search.value;
      els.searchBtn.classList.toggle("is-on", on);
      els.searchBtn.setAttribute("aria-expanded", String(on));
    };

    const clear = () => {
      els.search.value = "";
      els.searchClear.hidden = true;
      setQuery("");
      onChange();
      paint();
      if (KN.searchAll) KN.searchAll.hint(els);
    };

    /* 窓を置きっぱなしにしない設定のときは、ふだんは畳んでおきます。
       虫めがねを押したときだけ開きます——探し終えたら、また畳みます。 */
    const tuck = () => {
      if (searchBarAlways() || !els.searchWrap) return;
      if (els.search.value || document.activeElement === els.search) return;
      els.searchWrap.hidden = true;
      els.searchWrap.style.opacity = "";
      if (els.searchClear) els.searchClear.hidden = true;
      const stack = els.searchWrap.parentElement;
      if (stack) { stack.style.flexShrink = ""; stack.style.minHeight = ""; }
    };
    const untuck = () => {
      if (!els.searchWrap || !els.searchWrap.hidden) return;
      els.searchWrap.hidden = false;
      els.searchWrap.style.opacity = "";
      paintClear();
    };
    tuck();

    /* 出ているか。置きっぱなしの設定では、窓はいつも在るので「使っている
       最中か」で見ます（裏へ送ったものは閉じている）。 */
    const isOpen = () => {
      if (!els.searchWrap) return false;
      if (searchBarAlways()) return !!els.search.value || document.activeElement === els.search;
      return !els.searchWrap.hidden;
    };
    /* 閉じる：字を消し、キーボードを下ろし、畳む（置きっぱなしなら裏へ送る）。 */
    const close = () => {
      if (els.search.value) clear();
      els.search.blur();
      if (searchBarAlways()) parkSearch(scroller, true);
      else tuck();
    };
    /* ×は、字があれば消す・空なら閉じる。だから開いているあいだは出しておく。 */
    const paintClear = () => {
      const open = !els.searchWrap || !els.searchWrap.hidden;
      els.searchClear.hidden = !(els.search.value || (open && !searchBarAlways()));
      els.searchClear.setAttribute("aria-label", els.search.value ? "検索をクリア" : "探す窓を閉じる");
    };

    els.searchBtn.addEventListener("click", () => {
      /* 虫めがねが全タブで一つの帯に居る画面（やること・daily・ダイエット、
         js/head.js）は、同じボタンに三つが結んでいます。応えるのは持ち主だけ。 */
      if (els.mine && !els.mine()) return;
      /* 出ているなら、押すと閉じる（2026年9月29日、実機で「消す方法がない」）。
         前は「使っている最中（字が入っている・指が入っている）」だけ閉じて、
         キーボードを下ろしたあとの空の窓は、押しても開き直すだけでした。 */
      if (isOpen()) close();
      else {
        untuck();
        revealSearch(scroller, els.search);
      }
      KN.util.haptic();
    });

    els.search.addEventListener("input", () => {
      // Folded, so 「え」 finds 「エマール」 — the same rule the suggestions use.
      paintClear();
      setQuery(KN.util.foldKana(els.search.value));
      onChange();
      paint();
      /* ほかの場所にもあれば、窓の下に一行（R8・js/search-all.js）。
         タブの中の絞り込みは、上の三行のまま。 */
      if (KN.searchAll) KN.searchAll.hint(els);
    });

    els.searchClear.addEventListener("click", () => {
      if (els.search.value) { clear(); paintClear(); els.search.focus(); }
      else close();
    });

    /* 打ち終えて改行を押したら、キーボードだけ下ろします（絞り込みは
       残したまま——見に行くのはこれからなので）。 */
    els.search.addEventListener("keydown", (e) => {
      if (KN.util.isEnter(e)) { e.preventDefault(); els.search.blur(); }
      if (e.key === "Escape") close();
    });

    /* 送られていくあいだ、薄くなっていきます。

       題（.topbar）は少しだけ透けているので、裏に回ったバーがそのまま
       残ると、題の後ろに丸い帯が影のように見えていました。出てくる途中で
       濃くなるほうが「引き出している」感じにも合います。使っている最中
       （打った字が入っている・指が入っている）は、薄くしません。 */
    if (scroller) {
      const fade = () => {
        if (els.search.value || document.activeElement === els.search) {
          els.searchWrap.style.opacity = "";
          return;
        }
        const h = els.searchWrap.offsetHeight || 1;
        const t = Math.min(1, Math.max(0, scroller.scrollTop / h));
        els.searchWrap.style.opacity = String(1 - t);
      };
      scroller.addEventListener("scroll", fade, { passive: true });
      els.search.addEventListener("focus", fade);
      els.search.addEventListener("blur", fade);
      fade();
    }

    paint();
  }

  /**
   * Put the cursor in a field and bring the keyboard with it.
   *
   * Must be called synchronously from the tap that opened the sheet. iOS only
   * raises the keyboard for a focus it can trace back to a gesture, and a
   * setTimeout — even one frame — has already broken that trail: the field
   * takes the caret and the keyboard stays down, so the first thing you do
   * after tapping ＋ is tap again.
   *
   * The second call, after the sheet has finished sliding, is for the browsers
   * that have no such rule and would otherwise focus a moving element.
   * Once the field has had the caret and let it go (the user moved to another
   * field or closed the keyboard), the second call stands down — it used to
   * pull the caret back.
   */
  function focusNow(el) {
    if (!el) return;
    let left = false;
    el.addEventListener("blur", () => { left = true; }, { once: true });
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    setTimeout(() => {
      if (!left && document.activeElement !== el && el.isConnected) el.focus();
    }, 320);
  }

  /** 設定の画面が「紙のかわりに一枚を押しのける」と名乗り出るための口。 */
  function setPageHost(host) { pageHost = host; }

  KN.ui = {
    sheet, actionSheet, popOver, popMenu, delMenu, popCalendar, popDate, popTime, whenFields, dateDrums, drum, toast, confirm, prompt, storePicker, categoryPicker, iconPicker, chipRow,
    setPageHost, makeGuard,
    isTiles, toggleLayout, paintLayoutButton, swipeActions, wireSearch, focusNow,
    burst, flipRows, sendToDay, parkSearch, revealSearch,
  };
})();
