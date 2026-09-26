/* =========================================================
   くらしノート — settings screen
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic, formatDate } = KN.util;
  const store = KN.store;

  let root = null;

  /* ---------------- 一段は、紙の重なり ----------------

     前は一枚でした。`.js-body` の中身を入れ替えて「›」の先を出していたので、
     **奥へ行く動きが絵に出ていません**でした——押した瞬間に別の中身に化ける
     だけで、どちらへ進んだのか、戻る道がどちらにあるのかを、動きが何も
     言っていない。戻ったときに読んでいた場所（scrollTop）も失われます。

     いまは、一段ごとに**本物の紙**（`.set-layer`）を重ねます。奥へ行けば
     右から一枚入ってきて、下の一枚は -28% まで引いて控える。戻れば、その
     一枚が右へ抜けて、下が戻ってくる。**左端から指で引いても同じこと**が
     起きます（`js/edge-back.js`）——押して動かすのと、指で動かすのとで、
     絵が一致している、ということです。

     紙が器になったので、送るのは紙のほう（画面ではない）。`scrollerOf()` に
     そのことを教えてあります——教えないと `pull-refresh` が「上端にも下端にも
     同時に居る」と読んで、縦の指を毎回取ります（CLAUDE.md）。 */

  /** いま重なっている紙。[0] が根っこで、最後が上に見えている一枚。 */
  let stack = [];

  const top = () => stack[stack.length - 1];

  /** 動いている最中は、次の一手を取らない（重ねて押されると紙が迷子になる）。 */
  let moving = false;

  /** 一枚を組む。`opts.title` を渡すと、`PAGES` に載っていない一枚
      （紙のかわりに押しのけるもの）になります。`opts.bar` は下の帯。 */
  function makeLayer(pageId, opts) {
    opts = opts || {};
    const page = pageId ? PAGES[pageId] : null;
    const root2 = !pageId && !opts.title;   // 根っこ（大きな題を持つ一枚）
    const el = node(html`
      <div class="set-layer">
        ${/* 帯は**紙ごと**に持ちます。押しのけられるときに帯も一緒に動くのが、
              あちらの動きなので——一枚だけ据え置くと、題だけが宙に残ります。
              送る箱の**外**に置くので、貼りつける仕掛けは要りません。 */""}
        <header class="set-nav js-nav">
          <button class="set-back js-back" aria-label="もどる">${icon("chevron")}</button>
          <span class="set-nav-title js-nav-title"></span>
          ${/* 題を**まん中**に置くための、戻るボタンと同じ幅の空き。 */""}
          <span class="set-nav-pad" aria-hidden="true"></span>
        </header>
        <div class="set-scroll js-scroll">
          ${root2 ? html`<h1 class="set-hero js-hero">Settings</h1>` : ""}
          <div class="js-body"></div>
        </div>
      </div>
    `);
    const L = {
      id: pageId,
      el,
      nav: el.querySelector(".js-nav"),
      navTitle: el.querySelector(".js-nav-title"),
      hero: el.querySelector(".js-hero"),
      scroll: el.querySelector(".js-scroll"),
      body: el.querySelector(".js-body"),
    };
    /* 帯の題。根っこは**席の名前**なので英語（daily / tasks / shopping /
       health と同じ系列）。「›」の先は**中身の名前**（外観・バックアップ…）
       なので日本語のまま——線は「席か、中身か」で引いています。 */
    L.navTitle.textContent = page ? page.title : (opts.title || "Settings");
    /* 押せば決まるもの（保存・外す）は、下に貼りつけた帯へ。紙のときは
       中身の最後に置いていましたが、一枚ぶんの高さがあると、短い欄の紙で
       ボタンが画面のまん中に浮きます。 */
    if (opts.bar) {
      const bar = node(html`<div class="set-bar"></div>`);
      bar.append(opts.bar);
      el.append(bar);
    }
    el.querySelector(".js-back").addEventListener("click", back);
    L.scroll.addEventListener("scroll", () => paintNav(L), { passive: true });
    return L;
  }

  function mount(el) {
    root = el;
    root.innerHTML = "";
    stack = [makeLayer(null)];
    root.append(stack[0].el);

    /* 左端から引いて一段戻る。設定の中では紙の重なり、いちばん外では
       画面そのものが動きます——どちらも「上の一枚と、その下の一枚」なので、
       同じ仕掛けが両方を受け持てます。 */
    /* 設定の中では、紙ではなく一枚を押しのける、と名乗り出ます。決めるための
       もの（confirm・ほかの操作）は `as: "dialog"` で紙のまま来ます。 */
    KN.ui.setPageHost({
      wants: () => KN.app.activeScreen() === "settings" && !!root && stack.length > 0,
      open: openAsPage,
    });

    KN.edgeBack.wire({
      el: root,
      busy: () => moving
        || !!document.querySelector(".sheet")
        || (KN.reorder && KN.reorder.isActive && KN.reorder.isActive()),
      begin: edgeBegin,
    });
  }

  /** 左端を引きはじめた。上の一枚と、その下に出すものを答えます。 */
  function edgeBegin() {
    if (stack.length > 1) {
      const leaving = top();
      const under = stack[stack.length - 2];
      return {
        top: leaving.el, under: under.el,
        commit: () => {
          if (!leaving.handle) {
            stack.pop(); leaving.el.remove(); KN.edgeBack.clear(under.el);
            return;
          }
          /* 書きかけがあれば、ここで保存されます（`tryClose`）。うまく
             いった一枚は自分で閉じる＝ `popLayer` がその場で外すので、
             指の置いたところから続きます。

             **検算で止まったときだけ、押し戻します。**指はもう出しきって
             いますが、直す欄が画面の外にあっては直しようがないので。 */
          leaving.el.style.pointerEvents = "none";
          leaving.handle.tryClose();
          setTimeout(() => {
            if (!leaving.el.isConnected) return;
            leaving.el.style.pointerEvents = "";
            moving = true;
            KN.edgeBack.push(leaving.el, under.el, +1).then(() => { moving = false; });
          }, 160);
        },
        cancel: () => { KN.edgeBack.clear(leaving.el); KN.edgeBack.rest(under.el); },
      };
    }
    /* 根っこまで来ている。ここから先は**画面**が一段で、後ろに居るのは
       歯車を押した画面そのものです。出すのは app.js の役目——どこから
       潜ってきたかを知っているのはあちらなので。 */
    const under = KN.app.underScreen && KN.app.underScreen();
    if (!under) return null;
    root.classList.add("is-over");
    const done = () => { root.classList.remove("is-over"); KN.edgeBack.clear(root); };
    return {
      top: root, under,
      commit: () => { KN.edgeBack.clear(under); done(); KN.app.backScreen("settled"); },
      cancel: () => { KN.app.underScreenClear(); done(); },
    };
  }

  /** 一枚を抜く。**もう指で出しきっている一枚は、そのまま外します**
      ——0 に戻してから右へ流し直すと、一拍だけ元の位置へ跳ねて見えます。 */
  function popLayer(L) {
    const i = stack.indexOf(L);
    if (i <= 0) return;
    stack.splice(i, 1);
    const under = top();
    const at = /translate3d\(\s*(-?[\d.]+)px/.exec(L.el.style.transform || "");
    if (at && parseFloat(at[1]) > 4) {
      L.el.remove();
      KN.edgeBack.clear(under.el);
      return;
    }
    moving = true;
    KN.edgeBack.push(L.el, under.el, -1).then(() => { L.el.remove(); moving = false; });
  }

  /** 戻る。紙を一枚めくるだけ——根っこまで来ていれば、呼んだ画面へ帰る。 */
  function back() {
    if (moving) return;
    const L = top();
    /* 紙のかわりに押しのけている一枚は、**閉じかたをその一枚が持っています**
       （書きかけがあれば保存する、という決めごと）。ここで勝手にめくると、
       下へ払ったときと違う結果になります。 */
    if (L && L.handle) { KN.motion.fire("nav"); L.handle.tryClose(); return; }
    KN.motion.fire("nav");
    if (stack.length <= 1) { KN.app.backScreen(); return; }
    popLayer(L);
  }

  /** 「›」の先へ。右から一枚入ってきて、下の一枚は控えへ下がります。 */
  function go(id) {
    if (moving || !PAGES[id]) return;
    const under = top();
    const L = makeLayer(id);
    stack.push(L);
    root.append(L.el);
    paintLayer(L);
    moving = true;
    KN.edgeBack.push(L.el, under.el, +1).then(() => { moving = false; });
  }

  /* 帯の題は、**大きな題が帯の下へ隠れてから**出します。二つ同時に
     「設定」と書いてあるのは、同じことを二度言うことなので。境目も同じ
     ところで引きます——大きな題が見えているあいだに線が横切ると、題が
     帯の中身に見えます。「›」の先には大きな題が無いので、いつも出します。 */
  /* ---------------- 紙のかわりに、一枚を押しのける ----------------

     設定の中で `KN.ui.sheet(...)` を呼ぶと、下から出る紙ではなく**全画面の
     一枚**が右から入ってきます。呼ぶ側は同じ handle を受け取るので、
     `h.close()` はそのまま効きます——十数か所ある呼び出しを一つも書き
     換えずに、設定の中だけが押しのけになる、ということです。

     **閉じかたは紙と同じ**（`KN.ui.makeGuard`）。書きかけがあれば、戻るを
     押しても左端から引いても保存されます。二か所に書くと、片方だけ直した日に
     「下へ払うと消えるが、左端から引くと残る」が起きます。 */
  function openAsPage(opts) {
    const under = top();
    const L = makeLayer(null, { title: opts.title, bar: opts.footer });
    /* 中身は**紙のつもりで組まれたもの**（`.field` や `.diet-note` が、器の
       余白を当てにして並んでいる）。器が変わっても、その余白は器が持ち
       続けます——中身を書き換えて回るより、ここで一行ぶん受けるほうが、
       落としどころとして安い。 */
    L.el.classList.add("is-sheetish");
    stack.push(L);
    root.append(L.el);
    L.body.append(opts.content);
    /* 帯の題を出します。組み直しは通らない一枚（`paintLayer` が `handle` を
       見て素通りする）ので、ここで一度だけ。 */
    paintNav(L);
    moving = true;
    KN.edgeBack.push(L.el, under.el, +1).then(() => { moving = false; });

    let closed = false;
    const handle = {
      /* 設定そのものから出ていくとき（下の帯を押した、など）に、この一枚は
         畳まれます。紙は覆いがあって出られませんが、押しのける一枚は下の帯が
         見えているので出られる——**そこは紙と違うところ**です。DOM はもう
         外れているので、ここでは「閉じた」ことだけを伝えます
         （待っている約束があれば、それを解くために）。 */
      abandon() {
        if (closed) return;
        closed = true;
        if (opts.onClose) opts.onClose();
      },
      close() {
        if (closed) return;
        closed = true;
        /* 欄を残したまま外すと、WebKit は blur を出しません——キーボードが
           出たままだとアプリが思い込みます（紙のほうと同じ手当て）。 */
        if (L.el.contains(document.activeElement)) document.activeElement.blur();
        KN.keypad && KN.keypad.close();
        popLayer(L);
        if (opts.onClose) opts.onClose();
        KN.app.remeasure && KN.app.remeasure();
      },
    };
    handle.tryClose = KN.ui.makeGuard({
      el: L.el, footer: opts.footer, guard: opts.guard,
      close: handle.close, isClosed: () => closed,
    });
    L.handle = handle;
    return handle;
  }

  function paintNav(L) {
    if (!L || !L.nav) return;
    /* 大きな題を持っていない一枚は、いつも帯の題を出します——「›」の先も、
       紙のかわりに押しのけている一枚も。出さないと、帯に戻るボタンだけが
       居て、**いま何を見ているのかを言うものが画面に無くなります**。 */
    let titled = !L.hero;
    if (!titled && L.hero) {
      titled = L.hero.getBoundingClientRect().bottom <= L.nav.getBoundingClientRect().bottom;
    }
    L.nav.classList.toggle("is-titled", titled);
    L.nav.classList.toggle("is-stuck", titled && L.scroll.scrollTop > 4);
  }

  /** 一枚ぶんを組み直す。**読んでいた場所は保つ**——store が動くたびに
      render() が走るので、ここを 0 に戻すと、スイッチを一つ押しただけで
      一覧の頭まで飛ばされます。 */
  function paintLayer(L) {
    /* **書いている最中の欄は、組み直さない。** 中継所は見えているあいだ
       1〜5分ごとに覗きにいき、届けば store が動きます——そのたびに紙を
       組み直すと、URLを打っている途中の字が消えます（買うものの枠が
       `saving` を見ているのと同じ心配りの列）。離れれば change が走って
       保存され、そこで組み直されるので、古いまま残ることはありません。 */
    /* 紙のかわりに押しのけている一枚は、中身が呼んだ側のものです
       （`KN.ui.sheet` に渡された content）。組み直す型を持っていないので、
       触りません——紙が store の動きで組み直されないのと同じです。 */
    if (L.handle) return;
    const a = document.activeElement;
    if (a && L.el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    const keep = L.scroll.scrollTop;
    L.body.innerHTML = "";
    const page = L.id ? PAGES[L.id] : null;
    if (page) page.build().flat().filter(Boolean).forEach((n) => L.body.append(n));
    else renderRoot(L);
    L.scroll.scrollTop = keep;
    paintNav(L);
  }

  /* ---------------- 一枚で済ませる ----------------

     二段でした。**目次**（外観・バックアップ・「画面ごと」…の行き先だけが
     並ぶ一枚）と、**その中**。歯車を押すとその画面の設定がいきなり開き、
     戻るを押すと目次が出てくる、という順です。

     目次をやめました。歯車を押した指は「**この画面のことを直したい**」と
     言っているので、開いた一枚に、その画面の設定と「一般」が両方並びます。
     ほかのタブの設定は、そのタブの歯車から。「画面ごと」というまとまりは、
     もうどこにもありません。

     **一画面ぶんある中身だけは、これまでどおり「›」の先です**（お店10件・
     カテゴリ9件・外観・バックアップ・アイコン）。あれは「目次の目次」では
     なく、参考画面（Structured）の `通知設定 ›` と同じ**詳細**——行の右に
     いまの値が出ていて、押すと続きが開く、というものです。 */

  /* 歯車を押したのはどの画面か。**入ったときに一度だけ**読みます——store が
     動くたびに render() が走るので、そのつど聞くと、設定を見ているあいだに
     根っこの中身が入れ替わる余地を残すことになります。 */
  let fromTab = null;

  /* 絵の四角の色。**基調色とは別の軸**です（からだの四つの輪と同じ理由
     ——ここの色は「どの設定か」を言うもので、その人の好きな色の話では
     ありません）。どれも白い絵が 3:1 以上で乗る濃さにしてあります。 */
  const TINT = {
    look:   "#5f9152",
    data:   "#6a7d92",
    sub:    "#7f8fa3",
    icons:  "#8a7f74",
    danger: "#b8463c",
    store:  "#5686bd",
    cat:    "#7f68ad",
    goal:   "#bd7a2e",
    sync:   "#4f8f8a",
    relay:  "#5686bd",
    ai:     "#9a6fae",
  };

  /* ---------------- 行とカード ----------------

     参考画面の実測（1284×2778、3倍）を写したものです。カードは左右20px、
     行は52px、仕切りは**絵の右**から。 */

  /** 白いカード。null は捨てるので、端末で出せない行をそのまま渡せます。 */
  function card(...rows) {
    const list = rows.flat().filter(Boolean);
    if (!list.length) return null;
    const el = node(html`<div class="set-card"></div>`);
    list.forEach((r) => el.append(r));
    return el;
  }

  const head = (text) => node(html`<h2 class="set-head">${text}</h2>`);

  /** カードの**下**に置く説明。行の中に入れると、行の高さを説明が決めて
      しまい、設定の一覧が読み物になります（参考画面も外に出しています）。 */
  const foot = (text) => (text ? node(html`<p class="set-foot">${text}</p>`) : null);

  /** 先へ進む行。**色の付いた四角が付くのは、ここだけ**です——あれは
      「押すと続きがある」の合図で、その場で切り替わるスイッチの行には
      要りません（参考画面もそうなっています）。 */
  function navRow({ ico, tint, title, value, onTap }) {
    const row = node(html`
      <button type="button" class="set-row is-nav">
        <span class="set-tile" style="background:${tint || TINT.data}">${icon(ico || "gear")}</span>
        <span class="set-title">${title}</span>
        <span class="set-val"></span>
        <span class="set-chev">${icon("chevron")}</span>
      </button>
    `);
    const slot = row.querySelector(".set-val");
    if (value && typeof value === "object") slot.append(value);
    else if (value) slot.textContent = value;
    row.addEventListener("click", () => { KN.motion.fire("nav", row); onTap(); });
    return row;
  }

  /** 戻せない操作の行。**四角ではなく、赤い絵と赤い字**（参考画面の
      「アプリを初期化」と同じ）——色の付いた四角は「行き先」の印なので、
      そのまま着せると、消す操作が普通の行き先と同じ顔になります。 */
  function dangerRow({ ico, title, onTap }) {
    const row = node(html`
      <button type="button" class="set-row is-danger">
        <span class="set-glyph">${icon(ico || "trash")}</span>
        <span class="set-title">${title}</span>
      </button>
    `);
    row.addEventListener("click", onTap);
    return row;
  }

  /** その場で切り替わる行。絵は付けません。 */
  function switchRow({ title, on, onTap }) {
    const row = node(html`
      <button type="button" class="set-row is-sw" role="switch" aria-checked="${String(!!on)}">
        <span class="set-title">${title}</span>
        ${/* iOSの「オン/オフラベル」に合わせて、棒と丸を中に描きます
              ——参考画面の実機がそうなっているので、そこだけ素のスイッチだと
              端末の中で一つだけ顔が違って見えます。 */""}
        <span class="toggle" aria-hidden="true">
          <span class="toggle-mark"></span>
          <span class="toggle-knob"></span>
        </span>
      </button>
    `);
    row.addEventListener("click", () => { haptic(); onTap(!on); });
    return row;
  }

  /** 二択だが「オン/オフ」ではない行（並べ方、出す範囲…）。右にいまの値、
      押すと選ぶ紙。スイッチにすると、**どちらがオンなのかを字で言えません**。 */
  function pickRow({ title, value, onTap }) {
    const row = node(html`
      <button type="button" class="set-row is-pick">
        <span class="set-title">${title}</span>
        <span class="set-val">${value || ""}</span>
        <span class="set-chev">${icon("chevron")}</span>
      </button>
    `);
    row.addEventListener("click", () => { KN.motion.fire("nav", row); onTap(); });
    return row;
  }

  /** 選ぶ紙。いまのものに ✓。 */
  function choose({ title, value, options, onPick }) {
    const body = node(html`<div class="set-choose"></div>`);
    let h = null;
    options.forEach((o) => {
      const on = o.id === value;
      const row = node(html`
        <button type="button" class="set-row is-choice ${on ? "is-on" : ""}">
          <span class="set-title">${o.label}${o.note
            ? html`<span class="set-note">${o.note}</span>` : ""}</span>
          <span class="set-check">${on ? icon("check") : ""}</span>
        </button>
      `);
      row.addEventListener("click", () => {
        if (h) h.close();
        if (!on) { haptic(); onPick(o.id); }
      });
      body.append(row);
    });
    h = KN.ui.sheet({ title, content: body });
  }

  /* ---------------- どの画面の設定か ----------------

     歯車を押した画面 → その席の名前と中身。価格は席を持たない画面
     （買うものの紙の裏）なので、その席——買うもの——の設定を出します。 */
  const TAB = {
    todo:    { label: "tasks",    rows: todoRows },
    list:    { label: "shopping", rows: listRows },
    prices:  { label: "shopping", rows: listRows },
    archive: { label: "daily",    rows: dailyRows },
    diet:    { label: "health",   rows: dietRows },
  };

  /** 「›」の先。ここに載るのは**一画面ぶんある中身**だけです。 */
  const PAGES = {
    look:   { title: "外観",                 build: lookRows },
    data:   { title: "バックアップと書き出し", build: dataRows },
    danger: { title: "データを消す",          build: dangerRows },
    stores: { title: "お店",                 build: () => [storesGroup()] },
    cats:   { title: "カテゴリ",              build: () => [categoriesGroup()] },
    icons:  { title: "アイコンについて",       build: () => [iconGapsGroup(), iconReportsGroup()] },
    relay:    { title: "中継所",   build: relayRows },
    relayHow: { title: "建てかた", build: relayHowRows },
  };

  function onEnter() {
    const from = KN.app.openedFrom && KN.app.openedFrom();
    fromTab = TAB[from] ? from : "archive";
    /* 重なりは畳んで、根っこ一枚に戻します——前に開いたときの「›」の先が
       残っていると、歯車を押した人が、押した覚えのない紙を見ることになる。 */
    while (stack.length > 1) {
      const L = stack.pop();
      L.el.remove();
      if (L.handle) L.handle.abandon();
    }
    KN.edgeBack.clear(stack[0].el);
    stack[0].scroll.scrollTop = 0;
    render();
  }

  /** store が動いた。**重なっている紙は、ぜんぶ**組み直します——上の一枚
      だけにすると、戻ったときに古い数字が出ます（お店を消した直後の件数など）。 */
  function render() {
    if (!stack.length) return;
    stack.forEach(paintLayer);
  }

  /** 根っこ。開いた画面の設定が先、一般があと。 */
  function renderRoot(L) {
    const put = (list) => list.flat().filter(Boolean).forEach((n) => L.body.append(n));
    /* 保存できていないことは、いちばん先に言います。中へ入る前に目に
       入らないと、直せる人が直す機会を失うので。 */
    if (store.saveError()) L.body.append(saveErrorBanner());
    const tab = TAB[fromTab] || TAB.archive;
    L.body.append(head(tab.label));
    put(tab.rows());
    /* 上の見出しは席の名前（tab.label ＝ shopping など）。その続きなので、
       ここも同じ系列の言葉にします。 */
    L.body.append(head("General"));
    put(generalRows());
  }

  /** どの画面から開いても、下半分はこれ。 */
  function generalRows() {
    const s = store.get();
    const a = store.ACCENTS.find((x) => x.id === (s.settings.accent || "orange"));
    const notes = collectIconGaps().length + (s.iconReports || []).length;
    return [
      card(
        navRow({
          ico: "palette", tint: TINT.look, title: "外観",
          /* 参考画面と同じで、いまの色をひと粒で。 */
          value: a ? node(html`<span class="set-dot" style="background:${a.swatch}"></span>`) : null,
          onTap: () => go("look"),
        }),
        navRow({
          ico: "download", tint: TINT.data, title: "バックアップと書き出し",
          onTap: () => go("data"),
        }),
        navRow({
          ico: "tag", tint: TINT.icons, title: "アイコンについて",
          value: notes ? `${notes}件` : "",
          onTap: () => go("icons"),
        })
      ),
    ];
  }

  /* 直近の保存が容量不足などで失敗したままのとき、直るまでずっと出す行。
     一度きりのトーストは読み飛ばされて忘れられるので、ここには「保存済み
     ではない」という事実を、直るまで居座らせます（store.js の saveError）。 */
  function saveErrorBanner() {
    return node(html`
      <section class="settings-group">
        <div class="set-card is-alert">
          <div class="set-row">
            <span class="set-title">保存できていません<span class="set-note">空き容量が足りないなど、変更がこの端末に保存できていません。</span></span>
          </div>
        </div>
      </section>
    `);
  }

  /* ---------------- 外観（「›」の先） ---------------- */

  /** 基調色の丸。押すとその場で画面ぜんぶの色が変わります——設定を出たり
      入ったりしないと確かめられない選択は、選びようがないので。 */
  function paintAccents(host) {
    const now = store.get().settings.accent || "orange";
    host.innerHTML = "";
    store.ACCENTS.forEach((a) => {
      const on = a.id === now;
      const b = node(html`
        <button type="button" class="accent-dot ${on ? "is-on" : ""}"
                data-accent="${a.id}" aria-pressed="${String(on)}"
                aria-label="${a.label}" title="${a.label}">
          <span class="accent-swatch" style="background:${a.swatch}"></span>
          <span class="accent-name">${a.label}</span>
        </button>
      `);
      b.addEventListener("click", () => {
        store.update((s) => { s.settings.accent = a.id; });
        KN.app.applyAccent(a.id);
        KN.motion.fire("select", b);
        paintAccents(host);
      });
      host.append(b);
    });
  }

  function lookRows() {
    const s = store.get().settings;
    const theme = s.theme || "auto";

    const seg = node(html`
      <div class="set-card is-pad">
        <div class="seg">
          <button class="seg-btn" data-theme="auto"  aria-pressed="${String(theme === "auto")}">自動</button>
          <button class="seg-btn" data-theme="light" aria-pressed="${String(theme === "light")}">ライト</button>
          <button class="seg-btn" data-theme="dark"  aria-pressed="${String(theme === "dark")}">ダーク</button>
        </div>
      </div>
    `);
    seg.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.theme;
        store.update((x) => { x.settings.theme = v; });
        KN.app.applyTheme(v);
        haptic();
        render();
      });
    });

    const accents = node(html`
      <div class="set-card is-pad">
        <div class="accent-row js-accents" role="group" aria-label="基調色"></div>
      </div>
    `);
    paintAccents(accents.querySelector(".js-accents"));

    /* ホーム画面の絵に数を出せる端末でだけ。ブラウザのタブでは API その
       ものが無く、**何も起きないスイッチは、無いより悪い**ので。 */
    const badge = KN.app.appBadge;
    const canBadge = badge && badge.supported();
    const badgeOn = canBadge && badge.enabled();
    /* 「オン」なのに出ていない、が三つのうちいちばん悪い状態です。iOS は
       許可を自分で落とすことがあり（設定を触った・端末を戻した）、その
       ことをページには何も言いません。だからスイッチ側が言います。 */
    const badgeBlocked = canBadge && badgeOn && badge.blocked && badge.blocked();

    return [
      head("明るさ"), seg,
      head("基調色"), accents,
      head("表示"),
      card(
        pickRow({
          title: "並べ方", value: KN.ui.isTiles() ? "タイル" : "リスト",
          onTap: () => choose({
            title: "並べ方", value: KN.ui.isTiles() ? "tiles" : "list",
            options: [
              { id: "list",  label: "リスト", note: "一行に一つ。名前が読みやすい" },
              { id: "tiles", label: "タイル", note: "絵を大きく、三つずつ" },
            ],
            onPick: () => { KN.ui.toggleLayout(); render(); },
          }),
        }),
        switchRow({
          title: "探す窓を出しておく", on: s.searchBar === true,
          onTap: (v) => {
            store.update((x) => { x.settings.searchBar = v; });
            render();
          },
        })
      ),
      foot("並べ方は、買うもの・価格・やることの三つが分け合います。探す窓を出さないときは、虫めがねを押すと出ます。"),
      canBadge ? card(
        switchRow({
          title: "アイコンにも数を出す", on: badgeOn,
          onTap: async (v) => {
            haptic();
            if (!v) { badge.disable(); render(); return; }
            const ok = await badge.enable();
            render();
            if (!ok) KN.ui.toast("端末の設定で通知が許可されていないため、出せませんでした");
          },
        })
      ) : null,
      canBadge ? foot(badgeBlocked
        ? "許可が要ります。端末の設定で、このアプリの通知を許可してください。"
        : "ホーム画面の絵に、今回買うものと、いま手をつけられるやることの数が出ます。") : null,
    ];
  }

  /* ---------------- 暦を出すか、しまうか ----------------

     題の右の暦ボタンが各画面から消えたので、その札はここにあります。
     ただし**押すのが唯一の道ではありません**——紙の掴み手を上へ押せば
     暦は消え、下へ引けば戻ります（js/cal-peek.js の三段）。ここは
     「そんな手つきがあると知らない人」のための、もう一つの入口です。

     タブごとに持ちます（store.calPrefs）。ダイエットは月ぜんぶを眺めたいが
     やることは今週でいい、というように、見たい単位が画面ごとに違うので。 */
  function calSwitch(tab) {
    const on = store.calPrefs(tab).shown;
    return switchRow({
      title: "暦を出す", on,
      onTap: (v) => { store.setCalPref(tab, { shown: v }); render(); },
    });
  }

  /* ---------------- やること ---------------- */

  /** 一日の枠。時間割はこの幅の中に組み、空き時間もここから数えます。
      行の中に時刻の欄を二つ並べていましたが、そこだけ行が二段になって、
      一覧の高さがそろわなくなっていました。 */
  function openDaySpan() {
    const P = KN.plan;
    const st = store.get().settings;
    const body = node(html`
      <div class="stack">
        <div class="row-times">
          <input class="input js-a" type="time" aria-label="一日の始まり"
                 value="${st.dayStart || P.DEFAULT_START}">
          <span class="row-dash">〜</span>
          <input class="input js-b" type="time" aria-label="一日の終わり"
                 value="${st.dayEnd || P.DEFAULT_END}">
        </div>
        <p class="set-foot is-flush">今日の時間割は、この幅のなかに組みます。空き時間もここから数えます。</p>
      </div>
    `);
    const save = node(html`<button class="btn btn-primary btn-block">保存</button>`);
    const h = KN.ui.sheet({ title: "一日の始まりと終わり", content: body, footer: save });

    save.addEventListener("click", () => {
      const av = body.querySelector(".js-a").value;
      const bv = body.querySelector(".js-b").value;
      const a = KN.util.isTime(av) ? av : P.DEFAULT_START;
      let b = KN.util.isTime(bv) ? bv : P.DEFAULT_END;
      /* 終わりが始まりより前なら、一日が裏返ります。組めないので直します
         ——黙って受け取って空きが負になるより、その場で戻すほうが親切です。 */
      if (P.toMin(b) <= P.toMin(a)) {
        b = P.DEFAULT_END;
        KN.ui.toast("終わりは始まりより後にしてください");
      }
      store.update((s) => { s.settings.dayStart = a; s.settings.dayEnd = b; });
      h.close();
      render();
      KN.motion.fire("save");
    });
  }

  function todoRows() {
    const s = store.get().settings;
    const P = KN.plan;
    /* 「05:00」ではなく「5:00」。時刻の欄が返す形と、画面に書く形は別。 */
    const trim = (t) => String(t).replace(/^0/, "");
    const span = `${trim(s.dayStart || P.DEFAULT_START)}〜${trim(s.dayEnd || P.DEFAULT_END)}`;

    /* 時刻のお知らせ。何をするかは**カードの下**で言います——「通知」と
       だけ書くと「19:30 に鳴る」と読まれますが、アプリを閉じているあいだは
       鳴りません。そこを言うかどうかが、機能と、黙って裏切るものの差です。 */
    const notify = KN.notify;
    const canNotify = notify && notify.supported();
    const notifyOn = canNotify && notify.enabled();
    const notifyBlocked = canNotify && notifyOn && notify.blocked();

    return [
      card(
        switchRow({
          title: "今日を時間割で見る", on: s.todoTimeline !== false,
          onTap: (v) => {
            store.update((x) => { x.settings.todoTimeline = v; });
            render();
            KN.motion.fire("select");
          },
        }),
        calSwitch("todo")
      ),
      card(
        pickRow({ title: "一日の始まりと終わり", value: span, onTap: openDaySpan })
      ),
      canNotify ? card(
        switchRow({
          title: "やることの時刻を知らせる", on: notifyOn,
          onTap: async (v) => {
            if (!v) { notify.disable(); render(); return; }
            const ok = await notify.enable();
            render();
            if (!ok) KN.ui.toast("端末の設定で通知が許可されていないため、出せませんでした");
          },
        })
      ) : null,
      canNotify ? foot(notifyBlocked
        ? "許可が要ります。端末の設定で、このアプリの通知を許可してください。"
        : "アプリを閉じているあいだは鳴らず、次に開いたときにまとめて出ます。") : null,
    ];
  }

  /* ---------------- 買うもの ----------------

     お店とカテゴリは、どちらも一画面ぶんあります（10行・9行）。数だけを
     行に出して、中身は「›」の先へ。価格の画面の上にあった「68商品・10店舗」も
     ここへ——あちらでは値札の並びそのものが数を見せていて、その上でもう一度
     数えた結果を書くのは、同じことを二度言うことでした。 */
  function listRows() {
    const s = store.get();
    return [
      card(
        navRow({
          ico: "store", tint: TINT.store, title: "お店",
          value: `${(s.stores || []).length}件`, onTap: () => go("stores"),
        }),
        navRow({
          ico: "tag", tint: TINT.cat, title: "カテゴリ",
          value: `${(s.categories || []).length}件`, onTap: () => go("cats"),
        })
      ),
      foot(`${s.products.length}商品・${s.stores.length}店舗が登録されています。`),
    ];
  }

  function storesGroup() {
    const stores = store.sortedStores();
    const wrap = node(html`
      <section class="settings-group">
        <div class="set-card js-rows"></div>
        ${stores.length > 1
          ? html`<p class="set-foot is-flush">長押しで並べ替えられます。</p>`
          : ""}
        <div class="set-card">
          <button type="button" class="set-row is-add js-add">
            <span class="set-glyph">${icon("plus")}</span>
            <span class="set-title">お店を追加</span>
          </button>
        </div>
      </section>
    `);

    const rows = wrap.querySelector(".js-rows");
    if (!stores.length) {
      rows.append(node(html`
        <p class="set-empty">お店を登録すると、商品ごとに値段を記録して比べられます。</p>
      `));
    }

    stores.forEach((st) => {
      const usage = store.get().products.reduce(
        (n, p) => n + p.prices.filter((pr) => pr.storeId === st.id).length, 0
      );
      const row = node(html`
        <div class="manage-row">
          <span class="dot" style="background:${st.color};width:14px;height:14px"></span>
          <span class="manage-name">${st.name}</span>
          <span style="font-size:11px;color:var(--c-text-3);flex:none">${usage}件の価格</span>
          <button class="icon-btn js-edit" aria-label="編集">${icon("edit")}</button>
          <button class="icon-btn is-danger js-del" aria-label="削除">${icon("trash")}</button>
        </div>
      `);

      row.querySelector(".js-edit").addEventListener("click", () => editStore(st));
      row.querySelector(".js-del").addEventListener("click", async () => {
        const ok = await KN.ui.confirm({
          title: "お店を削除しますか？",
          message: `「${st.name}」と、この店で登録した${usage}件の価格が削除されます。`,
          okLabel: "削除する",
          danger: true,
        });
        if (!ok) return;
        store.update((s) => {
          s.stores = s.stores.filter((x) => x.id !== st.id);
          s.products.forEach((p) => { p.prices = p.prices.filter((pr) => pr.storeId !== st.id); });
        });
        KN.ui.toast("削除しました");
      });

      rows.append(row);
    });

    KN.reorder.attach(rows, {
      item: ".manage-row",
      onDrop: (from, to) => KN.reorder.applyOrder(stores, from, to, (s) => s.stores),
    });

    wrap.querySelector(".js-add").addEventListener("click", () => editStore(null));

    return wrap;
  }

  /** お店の紙。`st` が null なら「足す」——**編集と同じ一枚**にします。
      名前だけ聞く小さな窓だと、色は足したあとでもう一度開いて選ぶことに
      なりますし、足すと編集で出てくるものの形が違います。 */
  function editStore(st) {
    const body = node(html`
      <div class="stack" style="gap:18px">
        <label class="field">
          <span class="field-label">お店の名前</span>
          <input class="input js-name" value="${st ? st.name : ""}" placeholder="例：イオン 〇〇店">
        </label>
        <div class="field">
          <span class="field-label">色</span>
          <div class="swatches js-swatches"></div>
        </div>
      </div>
    `);

    let color = st ? st.color : store.STORE_COLORS[0];
    const sw = body.querySelector(".js-swatches");
    function paint() {
      sw.innerHTML = "";
      store.STORE_COLORS.forEach((c) => {
        const b = node(html`<button type="button" class="swatch" style="background:${c}" aria-pressed="${String(c === color)}" aria-label="色"></button>`);
        b.addEventListener("click", () => { color = c; paint(); });
        sw.append(b);
      });
    }
    paint();

    const foot = node(html`<button class="btn btn-primary btn-block js-save">${st ? "保存" : "追加"}</button>`);
    const h = KN.ui.sheet({
      title: st ? "お店の編集" : "お店を追加", content: body, footer: foot, guard: true,
    });

    foot.addEventListener("click", () => {
      const name = body.querySelector(".js-name").value.trim();
      if (!st) {
        if (!name) { KN.ui.toast("名前を入力してください"); return; }
        if (store.findStoreByName(name)) { KN.ui.toast("同じ名前のお店があります"); return; }
        store.addStore(name, color);
        h.close();
        KN.ui.toast("追加しました");
        return;
      }
      store.update((s) => {
        const rec = s.stores.find((x) => x.id === st.id);
        if (rec) { if (name) rec.name = name; rec.color = color; }
      });
      h.close();
      KN.ui.toast("保存しました");
    });
  }

  /* ---------------- categories ---------------- */

  function categoriesGroup() {
    const cats = store.sortedCategories();
    const wrap = node(html`
      <section class="settings-group">
        <div class="set-card js-rows"></div>
        <p class="set-foot is-flush">長押しで並べ替えられます。</p>
        <div class="set-card">
          <button type="button" class="set-row is-add js-add">
            <span class="set-glyph">${icon("plus")}</span>
            <span class="set-title">カテゴリを追加</span>
          </button>
        </div>
      </section>
    `);

    const rows = wrap.querySelector(".js-rows");
    cats.forEach((c) => {
      const used = store.get().products.filter((p) => p.categoryId === c.id).length;
      const row = node(html`
        <div class="manage-row" style="--cat:${c.color || ""}">
          ${/* 絵文字の列はやめました（最優先の約束事）。すぐ左の色の帯が
                同じことを——どの棚か——もう言っています。 */""}
          <span class="manage-swatch" style="background:${c.color || "transparent"}"></span>
          <span class="manage-name">${c.name}</span>
          <span style="font-size:11px;color:var(--c-text-3);flex:none">${used}商品</span>
          <button class="icon-btn js-edit" aria-label="編集">${icon("edit")}</button>
          ${c.id === store.OTHER_CATEGORY
            ? ""
            : html`<button class="icon-btn is-danger js-del" aria-label="削除">${icon("trash")}</button>`}
        </div>
      `);

      row.querySelector(".js-edit").addEventListener("click", () => editCategory(c));

      const del = row.querySelector(".js-del");
      if (del) {
        del.addEventListener("click", async () => {
          const ok = await KN.ui.confirm({
            title: "カテゴリを削除しますか？",
            message: used > 0
              ? `${used}件の商品は「その他」に移動します。`
              : "このカテゴリを削除します。",
            okLabel: "削除する",
            danger: true,
          });
          if (!ok) return;
          store.update((s) => {
            s.categories = s.categories.filter((x) => x.id !== c.id);
            s.products.forEach((p) => {
              if (p.categoryId === c.id) p.categoryId = store.OTHER_CATEGORY;
            });
          });
          KN.ui.toast("削除しました");
        });
      }

      rows.append(row);
    });

    KN.reorder.attach(rows, {
      item: ".manage-row",
      onDrop: (from, to) => KN.reorder.applyOrder(cats, from, to, (s) => s.categories),
    });

    wrap.querySelector(".js-add").addEventListener("click", () => editCategory(null));
    return wrap;
  }

  function editCategory(cat) {
    const body = node(html`
      <div class="stack" style="gap:18px">
        <label class="field">
          <span class="field-label">名前</span>
          <input class="input js-name" value="${cat ? cat.name : ""}" placeholder="例：おやつ">
        </label>
        ${/* **絵文字の欄は出しません。** 「アプリ内UIに絵文字を使わない」と
              決めてあるのに、ここは打ちこませる口でした——打てるのに出ない、
              では打った人の字が消えたように見えます。棚を見分けるのは下の
              色です。**保存済みの `emoji` 欄は消していません**（消すと既存の
              値が戻せないので、そのまま持ったまま、描かないだけ）。 */""}
        <div class="field">
          <span class="field-label">色（このカテゴリの品物の背景になります）</span>
          <div class="swatches js-swatches"></div>
        </div>
      </div>
    `);

    let color = (cat && cat.color) || store.CATEGORY_COLORS[0];
    const sw = body.querySelector(".js-swatches");
    function paintSwatches() {
      sw.innerHTML = "";
      store.CATEGORY_COLORS.forEach((c) => {
        const b = node(html`<button type="button" class="swatch" style="background:${c}"
                              aria-pressed="${String(c === color)}" aria-label="色"></button>`);
        b.addEventListener("click", () => { color = c; paintSwatches(); });
        sw.append(b);
      });
    }
    paintSwatches();

    const foot = node(html`<button class="btn btn-primary btn-block">${cat ? "保存" : "追加"}</button>`);
    const h = KN.ui.sheet({ title: cat ? "カテゴリの編集" : "カテゴリを追加", content: body, footer: foot });

    foot.addEventListener("click", () => {
      const name = body.querySelector(".js-name").value.trim();
      if (!name) { KN.ui.toast("名前を入力してください"); return; }

      store.update((s) => {
        if (cat) {
          const rec = s.categories.find((x) => x.id === cat.id);
          /* `emoji` には**触りません**。もう描いていませんが、欄は残して
             あるので、ここで書き替えると保存済みの値が黙って消えます。 */
          if (rec) { rec.name = name; rec.color = color; }
        } else {
          s.categories.push({
            /* `emoji` は**空で持たせます**。もう描きませんが、欄そのものは
               残す決めごとなので（保存済みの値を消さないため）、新しい棚も
               同じ形で持たせておきます——形が揃っていないと、あとで
               `reconcile()` や書き出しが棚ごとに違う顔を見ることになります。 */
            id: KN.util.uid("c"), name, emoji: "", color,
            order: Math.max(-1, ...s.categories.map((x) => x.order ?? 0)) + 1,
          });
        }
      });
      h.close();
      KN.ui.toast(cat ? "保存しました" : "追加しました");
    });
  }

  /* ---------------- data ---------------- */

  /* 前は「◯商品・◯店舗をJSONで書き出します」で、やること・daily・
     ダイエットも入っていることが伝わりませんでした。 */
  function exportSub() {
    const last = KN.backup.lastExportAt();
    const what = "買うもの・やること・daily・ダイエット・設定を、一つのファイルにまとめて書き出します";
    if (!last) return `${what}。`;
    return `${what}。前回 ${snapStamp(last)}（保存できたと確かめた書き出し）。`;
  }

  /** 記録の数を一行で。控えの一覧・復元の確認・書き出しの確かめで使います。 */
  function countText(c) {
    return `商品 ${c.products}・やること ${c.todos}・daily ${c.days}日・積み上げ ${c.entries}・ダイエット ${c.diet}`;
  }

  /** 字数を「約◯万字」で。小さいときは、細かく言わない。 */
  function charText(n) {
    if (n < 10000) return "1万字未満";
    return `約${(n / 10000).toFixed(n < 100000 ? 1 : 0)}万字`;
  }

  /* 戻せない操作の前の控え。**取れなかったら、進む前に知らせます。**
     確認の文は「直前の状態は自動バックアップに残る」と約束しているので、
     残らなかったのに黙って進むと、その約束が嘘になります。"same"（同じ
     中身がもう控えにある）と "empty"（守るものが無い）は、取れたのと同じ。 */
  async function keepBefore(reason) {
    if ((await KN.backup.take(reason)) !== "failed") return true;
    return KN.ui.confirm({
      title: "控えを取れませんでした",
      message: "空き容量が足りず、いまの状態を自動バックアップに残せませんでした。このまま進むと、元に戻せません。先に「バックアップを保存」でファイルに書き出すことをおすすめします。",
      okLabel: "それでも進む", cancelLabel: "やめる", danger: true,
    });
  }

  /** Several snapshots can land on one day (削除前, 復元前…), so the clock
      time is what actually tells them apart when recovering from a slip. */
  function snapStamp(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${formatDate(iso)} ${hh}:${mm}`;
  }

  /* What the app has been taught, and a way to take it back. Guessing on the
     user's behalf is only reasonable if they can see what it decided. */
  function openLearned() {
    const rules = store.learnedList();
    if (!rules.length) {
      KN.ui.toast("まだ何も覚えていません");
      return;
    }

    const body = node(html`
      <div class="stack">
        <p class="set-foot is-flush">カテゴリを手で選ぶと、次から同じ名前はそこに入ります。</p>
        <div class="stack js-rules" style="gap:8px"></div>
        <button class="btn btn-soft btn-sm js-forget-all" style="margin-top:4px">すべて忘れる</button>
      </div>
    `);

    let handle = null;
    const rows = body.querySelector(".js-rules");

    function paint() {
      rows.innerHTML = "";
      const list = store.learnedList();
      if (!list.length) { handle && handle.close(); return; }
      list.forEach((r) => {
        const row = node(html`
          <div class="manage-row" style="--cat:${(r.category && r.category.color) || ""}">
            <span class="manage-swatch" style="background:${(r.category && r.category.color) || "transparent"}"></span>
            <span class="manage-name">${r.label}</span>
            <span style="font-size:11px;color:var(--c-text-3);flex:none">
              → ${r.category ? r.category.name : "（消えたカテゴリ）"}
            </span>
            <button class="icon-btn is-danger js-forget" aria-label="この振り分けを忘れる">${icon("close")}</button>
          </div>
        `);
        row.querySelector(".js-forget").addEventListener("click", () => {
          store.forgetCategory(r.key);
          KN.ui.toast(`「${r.label}」を忘れました`);
          paint();
        });
        rows.append(row);
      });
    }
    paint();

    body.querySelector(".js-forget-all").addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "覚えた振り分けを全部忘れますか？",
        message: "商品そのものは消えません。カテゴリの自動判定が、はじめの状態に戻ります。",
        okLabel: "忘れる",
        danger: true,
      });
      if (!ok) return;
      store.forgetAllCategories();
      KN.ui.toast("忘れました");
      handle && handle.close();
    });

    handle = KN.ui.sheet({ title: "おぼえた振り分け", content: body });
  }

  function snapshotSub() {
    const snaps = KN.backup.list();
    if (!snaps.length) return "アプリ内に自動保存された控えはまだありません";
    /* どこまで戻せるかを言います。件数だけでは「いつまで遡れるか」が
       分からず、いざというときに開いてみるまで分かりません。 */
    const oldest = snaps[snaps.length - 1];
    return `${snaps.length}件・最新 ${snapStamp(snaps[0].at)}`
      + (snaps.length > 1 ? `（${snapStamp(oldest.at)} まで戻せます）` : "");
  }

  /* ---------------- 記録の書き出し ----------------

     バックアップは「アプリに戻すため」のもので、中身はJSONです。人が読む
     ものでも、AIに渡すものでもありません（買い物の商品や覚えた振り分けまで
     入っています）。

     ここで出すのは **日ごとに一行** の記録です。過去の食事をあとで推し直す、
     一か月ぶんをまとめて読んでもらう——そのための形。文とCSVの二つを
     用意して、コピーもファイル保存もできるようにします。 */

  const EXPORT_SPANS = [
    { id: "30", label: "30日" },
    { id: "month", label: "今月" },
    { id: "last", label: "先月" },
    { id: "all", label: "全部" },
  ];

  function spanRange(id) {
    const U = KN.util;
    const today = U.todayKey();
    const now = U.dayDate(today);
    if (id === "month") {
      return { from: U.dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    }
    if (id === "last") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: U.dayKey(first), to: U.dayKey(last) };
    }
    if (id === "all") {
      const st = store.get().diet;
      const days = []
        .concat(st.weights.map((w) => w.day), st.meals.map((m) => m.day),
                st.health.map((h) => h.day), st.drinks.map((d) => d.day))
        .filter(Boolean).sort();
      return { from: days.length ? days[0] : today, to: today };
    }
    /* 数の id は「今日を入れて N 日」。前からある "30" は、これまでどおり
       今日から数えて30日ぶんです。 */
    const n = Math.max(1, Number(id) || 30);
    return { from: U.shiftDay(today, -(n - 1)), to: today };
  }

  function openRecordExport() {
    let span = "30";
    let form = "text";

    const body = node(html`
      <div class="stack">
        <p class="set-foot is-flush">
          AIに貼るときは「文」、表計算で見るときは「CSV」。アプリに戻すための
          ファイルは「バックアップを保存」のほうです。
        </p>
        <div class="js-span"></div>
        <div class="js-form"></div>
        <p class="diet-note js-count"></p>
        <textarea class="textarea js-out" rows="10" readonly aria-label="書き出したもの"></textarea>
      </div>
    `);
    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-file" style="flex:1">${icon("download")}ファイルに保存</button>
        <button class="btn btn-primary js-copy" style="flex:1">${icon("copy")}コピー</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "記録を書き出す", content: body, footer: foot });

    function build() {
      const { from, to } = spanRange(span);
      const rows = KN.diet.exportRows(from, to)
        .filter((r) => KN.diet.EXPORT_COLS.some((c) => c.key !== "day" && r[c.key] != null));
      const text = form === "csv" ? KN.diet.exportCsv(from, to) : KN.diet.exportText(from, to);
      body.querySelector(".js-out").value = text || "この期間には記録がありません。";
      body.querySelector(".js-count").textContent =
        `${from} 〜 ${to}　記録のある日：${rows.length}日ぶん（${text.length.toLocaleString()}文字）`;
      return text;
    }

    function paint() {
      KN.ui.chipRow(body.querySelector(".js-span"), EXPORT_SPANS,
        { activeId: span, onPick: (id) => { span = String(id); paint(); } });
      KN.ui.chipRow(body.querySelector(".js-form"),
        [{ id: "text", label: "文" }, { id: "csv", label: "CSV" }],
        { activeId: form, onPick: (id) => { form = String(id); paint(); } });
      build();
    }
    paint();

    foot.querySelector(".js-copy").addEventListener("click", () => {
      const text = body.querySelector(".js-out").value;
      const done = (ok) => {
        if (ok) { KN.ui.toast("コピーしました"); return; }
        // 断られる端末があります。選んでおいて、長押しから拾えるように。
        const out = body.querySelector(".js-out");
        out.focus();
        try { out.setSelectionRange(0, out.value.length); } catch (err) { /* 読めれば足ります */ }
        KN.ui.toast("自動でコピーできませんでした。欄を長押しでコピーしてください");
      };
      if (!navigator.clipboard || !navigator.clipboard.writeText) { done(false); return; }
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    });

    foot.querySelector(".js-file").addEventListener("click", () => {
      const text = body.querySelector(".js-out").value;
      const ext = form === "csv" ? "csv" : "txt";
      const type = form === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
      /* CSVは Excel が UTF-8 と分かるように BOM を付けます（付けないと
         日本語が化けます）。 */
      const blob = new Blob([form === "csv" ? "﻿" + text : text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const { from, to } = spanRange(span);
      a.href = url;
      a.download = `kurashi-kiroku-${from}_${to}.${ext}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      KN.ui.toast("保存しました");
      h.close();
    });
  }

  /** Pick one of the app's own rolling snapshots and roll back to it. */
  function openSnapshots() {
    const snaps = KN.backup.list();
    if (!snaps.length) {
      KN.ui.toast("まだ控えがありません");
      return;
    }

    const body = node(html`
      <div class="stack">
        <p class="set-foot is-flush">この端末の中だけの控えです。機種変更にそなえるには「バックアップを保存」を。</p>
        <div class="rows js-snaps"></div>
      </div>
    `);

    let sheetHandle = null;
    const rows = body.querySelector(".js-snaps");
    snaps.forEach((s) => {
      // 2026年9月26日より前に取った控えは、買うものの数しか持っていません。
      const sub = s.summary.todos == null
        ? `${s.summary.products}商品・${s.summary.stores}店舗・リスト${s.summary.items}件`
        : countText(s.summary);
      const row = node(html`
        <button class="row">
          <span class="row-main">
            <span class="row-title">${snapStamp(s.at)}（${s.reason}）</span>
            <span class="row-sub">${sub}</span>
          </span>
          <span class="row-chevron">${icon("chevron")}</span>
        </button>
      `);
      row.addEventListener("click", async () => {
        const ok = await KN.ui.confirm({
          title: "この時点に戻しますか？",
          message: "いまのデータは置き換わります。戻す直前の状態も控えに残すので、やり直せます。",
          okLabel: "戻す",
          danger: true,
        });
        if (!ok) return;
        try {
          try {
            await KN.backup.restore(s.at);
          } catch (err) {
            if (err.code !== "keep-failed") throw err;
            // 戻す前の控えが取れなかった。黙って戻すと、いまの状態へは戻れない。
            const go = await KN.ui.confirm({
              title: "控えを取れませんでした",
              message: "空き容量が足りず、戻す前の状態を控えに残せませんでした。このまま戻すと、いまの状態へはやり直せません。",
              okLabel: "それでも戻す", cancelLabel: "やめる", danger: true,
            });
            if (!go) return;
            await KN.backup.restore(s.at, { force: true });
          }
          KN.ui.toast(`${snapStamp(s.at)} の状態に戻しました`);
          if (sheetHandle) sheetHandle.close();
        } catch (err) {
          console.error(err);
          KN.ui.toast("戻せませんでした");
        }
      });
      rows.append(row);
    });

    sheetHandle = KN.ui.sheet({ title: "自動バックアップ", content: body });
  }

  /* ---------------- daily ----------------

     ここにあるのは、**見え方**だけです。何を書くか・何を残すかには一切
     関わりません（daily は評価しない画面なので、目標も達成率もここには
     置きません）。人によって、日誌として使うか、集めるものとして使うかが
     はっきり分かれる画面なので、その分かれ目だけを渡します。 */

  const dailySet = (key, value) => {
    store.update((s) => { s.settings[key] = value; });
    render();
  };

  function dailyRows() {
    const s = store.get().settings;
    const full = s.logFull !== false;
    return [
      card(
        calSwitch("archive"),
        switchRow({
          title: "「あの日」を出す", on: s.showThen !== false,
          onTap: (v) => dailySet("showThen", v),
        })
      ),
      foot("「あの日」は、暦のすぐ下に、何年か前の同じ日に書いたものを一つ出します。"),
      card(
        pickRow({
          title: "出す範囲", value: s.dailyScope === "month" ? "月ぜんぶ" : "1日",
          onTap: () => choose({
            title: "Daily Log に出す範囲",
            value: s.dailyScope === "month" ? "month" : "day",
            options: [
              { id: "day",   label: "1日",      note: "暦で選んでいる日だけ" },
              { id: "month", label: "月ぜんぶ", note: "その月を、日ごとに縦へ" },
            ],
            onPick: (v) => dailySet("dailyScope", v),
          }),
        }),
        pickRow({
          title: "見せ方", value: full ? "全文" : "数行",
          onTap: () => choose({
            title: "Daily Log の見せ方", value: full ? "full" : "short",
            options: [
              { id: "full",  label: "全文", note: "書いたものをそのまま" },
              { id: "short", label: "数行", note: "はじめの三行。押せば続きが開く" },
            ],
            onPick: (v) => dailySet("logFull", v === "full"),
          }),
        }),
        pickRow({
          title: "上に出すもの", value: s.dailyOrder === "entries" ? "積み上げ" : "Daily Log",
          onTap: () => choose({
            title: "上に出すもの", value: s.dailyOrder === "entries" ? "entries" : "log",
            options: [
              { id: "log",     label: "Daily Log", note: "その日の文を書く使い方に" },
              { id: "entries", label: "積み上げ",  note: "読んだ本や学んだことを集める使い方に" },
            ],
            onPick: (v) => dailySet("dailyOrder", v),
          }),
        })
      ),
      card(
        switchRow({
          title: "起床・就寝の時刻", on: s.showDayTimes !== false,
          onTap: (v) => dailySet("showDayTimes", v),
        }),
        switchRow({
          title: "作成・更新の時刻", on: s.showStamps !== false,
          onTap: (v) => dailySet("showStamps", v),
        })
      ),
      foot("「作成・更新」は、いつ書いていつ直したか（その日の話ではなく、帳簿のほう）。"),
      card(
        switchRow({
          title: "月のまとめを出す", on: s.showDigest !== false,
          onTap: (v) => dailySet("showDigest", v),
        }),
        /* 位置は「上か下か」の決め打ちで、日の間には挟まりません——まとめは
           月ぜんぶの話なので、日の列に混ぜると、どの日の話か分からなくなります。 */
        s.showDigest === false ? null : pickRow({
          title: "まとめの位置", value: s.digestPos === "top" ? "上" : "下",
          onTap: () => choose({
            title: "月のまとめの位置", value: s.digestPos === "top" ? "top" : "bottom",
            options: [
              { id: "top",    label: "上", note: "開いてすぐ、月の姿が目に入る" },
              { id: "bottom", label: "下", note: "まず日を読んで、最後にまとめ" },
            ],
            onPick: (v) => dailySet("digestPos", v),
          }),
        })
      ),
      card(
        navRow({
          ico: "download", tint: TINT.sub, title: "月ぶんを書き出す",
          onTap: openMonthExport,
        })
      ),
    ];
  }

  /* 書き出す月を選ぶ紙。記録のある月だけを、新しい順に並べます——
     空の月を書き出しても意味がないので、選べるのは中身のある月だけです。 */
  function openMonthExport() {
    const arc = store.get().archive || { entries: [], days: [] };
    const months = new Set();
    (arc.entries || []).forEach((e) => { if (e.date) months.add(String(e.date).slice(0, 7)); });
    (arc.days || []).forEach((d) => { if (d.date) months.add(String(d.date).slice(0, 7)); });
    const list = [...months].sort().reverse();

    const body = node(html`<div class="stack"><div class="rows js-rows"></div></div>`);
    const rows = body.querySelector(".js-rows");
    if (!list.length) {
      rows.append(node(html`<div class="row"><span class="row-main">
        <span class="row-sub">まだ書いたものがありません。</span></span></div>`));
    }
    let handle = null;
    list.forEach((ym) => {
      const n = store.exportMonth(ym);
      const days = (n.days || []).length, entries = (n.entries || []).length;
      const row = node(html`
        <button class="row">
          <span class="row-main">
            <span class="row-title">${ym.replace("-", "年") + "月"}</span>
            <span class="row-sub">Daily Log ${String(days)}日 ・ 積み上げ ${String(entries)}件</span>
          </span>
          <span class="row-chevron">${icon("download")}</span>
        </button>
      `);
      row.addEventListener("click", () => {
        downloadJSON(`daily-${ym}.json`, store.exportMonth(ym));
        KN.ui.toast(`${ym} を書き出しました`);
        if (handle) handle.close();
      });
      rows.append(row);
    });

    handle = KN.ui.sheet({ title: "月ぶんを書き出す", content: body });
  }

  function downloadJSON(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------------- ダイエット ----------------

     「ダイエットの記録を消す」はここから外しました。戻せない操作なのに、
     目標や中継所と同じ列に、同じ高さで並んでいたからです。行き先は
     一般 → バックアップと書き出し → データを消す（三段奥）。 */

  function dietRows() {
    const s = store.get();
    const d = s.diet;
    const goal = d.goal.targetKg == null
      ? "未設定"
      : `${d.goal.targetKg}kg${d.goal.targetDay
          ? " ・ " + KN.util.formatDay(d.goal.targetDay) + "まで" : ""}`;

    return [
      card(
        calSwitch("diet"),
        switchRow({
          title: "開いたときに自動で読む", on: s.settings.dietAutoSync !== false,
          onTap: (v) => { store.update((x) => { x.settings.dietAutoSync = v; }); render(); },
        }),
        switchRow({
          title: "気づいたことを出す", on: s.settings.showInsight === true,
          onTap: (v) => { store.update((x) => { x.settings.showInsight = v; }); render(); },
        })
      ),
      foot("「気づいたこと」は、体重と食事から読み取れたことを画面に出します。"),
      card(
        navRow({
          ico: "target", tint: TINT.goal, title: "目標", value: goal,
          onTap: () => KN.screens.diet && KN.screens.diet.openGoalSheet(),
        })
      ),
      card(
        navRow({
          ico: "chart", tint: TINT.ai, title: "AIに分析してもらう",
          onTap: openAiAnalyze,
        })
      ),
      foot("歩数・総消費・睡眠・食事・体重・お酒を、期間を選んで一枚の文にします。"
        + "コピーして、お使いのAIに貼ってください（このアプリからは送りません）。"),
      card(
        navRow({
          ico: "download", tint: TINT.sync, title: "ヘルスケアから取り込む",
          value: d.sync.lastAt ? KN.util.formatStamp(d.sync.lastAt) : "",
          onTap: () => KN.screens.diet && KN.screens.diet.openSyncSheet(),
        }),
        navRow({
          ico: "route", tint: TINT.relay, title: "中継所",
          value: KN.healthRelay.configured() ? KN.healthRelay.host() : "未設定",
          onTap: () => go("relay"),
        }),
        navRow({
          ico: "sparkles", tint: TINT.ai, title: "AIの窓口",
          value: KN.dietAI.configured() ? "設定済み" : "未設定",
          onTap: openAiSheet,
        })
      ),
      foot("中継所を建てると、ショートカットを走らせるだけで歩数や睡眠が入ります。"),
    ];
  }

  /* ---------------- AIに分析してもらう ----------------

     健康の記録を、期間を選んで一枚の文にします。**送りません**——出来た
     ものをコピーして、好きなAIに自分で貼ります。アプリから外へ出す道を
     ここに作らない、というのがこの画面の決めごとです（「AIの窓口」は
     別のもので、あちらは自分で建てた窓口へ聞きにいきます）。

     「記録を書き出す」（バックアップと書き出しの中）と似ていますが、
     宛先が違います。あちらは表計算で開く・あとで自分が読み返すためのもの。
     こちらは頭に問いが付き、睡眠の型と食事の中身まで降ります。 */

  const AI_SPANS = [
    { id: "7", label: "7日" },
    { id: "30", label: "30日" },
    { id: "90", label: "90日" },
    { id: "month", label: "今月" },
    { id: "all", label: "全部" },
  ];

  const AI_DETAILS = [
    { id: "summary", label: "合計だけ" },
    { id: "named", label: "品目つき" },
    { id: "full", label: "ぜんぶ" },
  ];

  function openAiAnalyze() {
    let span = "30";
    let detail = "summary";
    let ask = "overview";

    const body = node(html`
      <div class="stack">
        <p class="set-foot is-flush">
          歩数・総消費・睡眠（型まで）・食事・体重・体脂肪・お酒を、一枚の文に
          まとめます。コピーして、お使いのAIに貼って聞いてください。
          このアプリから送ることはしません。
        </p>
        <p class="diet-note">期間</p>
        <div class="js-span"></div>
        <p class="diet-note">詳しさ</p>
        <div class="js-detail"></div>
        <p class="diet-note">聞きたいこと</p>
        <div class="js-ask"></div>
        <textarea class="textarea js-q" rows="2"
          placeholder="自分で書く（書いたら、こちらが使われます）"
          aria-label="聞きたいこと"></textarea>
        <p class="diet-note js-count"></p>
        <textarea class="textarea js-out" rows="10" readonly
          aria-label="書き出したもの"></textarea>
      </div>
    `);
    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-file" style="flex:1">${icon("download")}ファイルに保存</button>
        <button class="btn btn-primary js-copy" style="flex:1">${icon("copy")}コピー</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "AIに分析してもらう", content: body, footer: foot });

    /** 打ちかけの問いも拾うので、コピーする直前にも呼びます。 */
    function build() {
      const { from, to } = spanRange(span);
      const typed = body.querySelector(".js-q").value.trim();
      const preset = (KN.diet.AI_ASKS.find((a) => a.id === ask) || {}).text || "";
      const text = KN.diet.aiText(from, to, { detail, question: typed || preset });
      body.querySelector(".js-out").value = text || "この期間には記録がありません。";
      /* 長さは、貼る前に知りたいことです。AIによって入る量が違うので、
         こちらで勝手に切らずに、数だけ見せて決めてもらいます。 */
      const n = text.length;
      body.querySelector(".js-count").textContent = `${from} 〜 ${to}　${n.toLocaleString()}文字`
        + (n > 100000 ? "　長すぎて入りきらないかもしれません。期間を短くするか、詳しさを下げてください。"
          : n > 30000 ? "　AIによっては長いかもしれません。" : "");
      return text;
    }

    function paint() {
      KN.ui.chipRow(body.querySelector(".js-span"), AI_SPANS,
        { activeId: span, onPick: (id) => { span = String(id); paint(); } });
      KN.ui.chipRow(body.querySelector(".js-detail"), AI_DETAILS,
        { activeId: detail, onPick: (id) => { detail = String(id); paint(); } });
      KN.ui.chipRow(body.querySelector(".js-ask"), KN.diet.AI_ASKS,
        { activeId: ask, onPick: (id) => { ask = String(id); paint(); } });
      build();
    }
    paint();

    /* 打っているあいだは組み直しません——全期間だと、一文字ごとに数万字を
       組み直すことになります。欄から離れたときに反映します。 */
    body.querySelector(".js-q").addEventListener("change", build);

    foot.querySelector(".js-copy").addEventListener("click", () => {
      const text = build();
      const done = (ok) => {
        if (ok) { KN.ui.toast("コピーしました"); return; }
        const out = body.querySelector(".js-out");
        out.focus();
        try { out.setSelectionRange(0, out.value.length); } catch (err) { /* 読めれば足ります */ }
        KN.ui.toast("自動でコピーできませんでした。欄を長押しでコピーしてください");
      };
      if (!navigator.clipboard || !navigator.clipboard.writeText) { done(false); return; }
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    });

    foot.querySelector(".js-file").addEventListener("click", () => {
      const text = build();
      const { from, to } = spanRange(span);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kurashi-kenko-${from}_${to}.txt`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      KN.ui.toast("保存しました");
      h.close();
    });
  }

  /* ---------------- 中継所 ----------------

     下から出る一枚の紙に、①〜⑤の手順書がまるごと入っていました。**建てて
     しまった人には、そのほとんどが要らないもの**です——建ったあとに開くのは
     「ちゃんと届いているか確かめる」「ショートカットの名前を直す」ときで、
     そのたびに Cloudflare の手順を五段ぶんスクロールすることになる。

     二枚に分けます。**中継所**（いま建っているか・確かめる・名前）と、その
     「›」の先の**建てかた**（①〜③）。手順そのものも畳みました——⑤あった
     段が三つになったのは、④（確かめる）と⑤（名前）が手順ではなく
     **設定**だったからです。手順の紙から出して、状態の紙へ置きました。

     残す言葉は「押して何が起きるか分からないこと」と「つまずいたときの
     逃げ道」だけ。安心させるための言い回し（「〜する必要はありません」
     「〜という意味になります」）は、全部落としてあります。

     **中継所URLには触れません。** 読むのは `KN.healthRelay` だけで、
     ここは欄に出して預かるだけです（このファイルから fetch もしません）。 */

  /* 道（合言葉）は、作ってから②で貼り、③でつなぐまで持ち歩きます。紙が
     組み直されても消えないように、**紙の外**に置きます——中継所を覗く拍
     （1〜5分ごと）で store が動くと、紙はそのつど組み直されるので。 */
  let relayPath = "";
  /* 確かめた結果も同じ理由でここに。 */
  let relayTest = null;

  const relayBad = (v) => v && !/^https:\/\//.test(v);

  /* iOSでは書き込みは通ります（読み取りと違って権限を通らない）。それでも
     黙って失敗させないように、通らなかったら欄に出して手で選べるように
     します。 */
  function copyText(text, what) {
    const ok = () => KN.ui.toast(what + "をコピーしました");
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:50%;left:4%;width:92%;height:40%;z-index:9999";
      document.body.append(ta);
      ta.select();
      let done = false;
      try { done = document.execCommand("copy"); } catch (err) { done = false; }
      if (done) { ta.remove(); ok(); return; }
      KN.ui.toast("長押しして「すべてを選択」→「コピー」してください");
      ta.addEventListener("blur", () => ta.remove());
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else {
      fallback();
    }
  }

  /** 字を書く欄を一つだけ置くカード。 */
  function fieldCard({ label, value, placeholder, hint, onSave }) {
    const wrap = node(html`
      <div class="set-card is-pad">
        <label class="field">
          <span class="field-label">${label}</span>
          <input class="input js-f" inputmode="url" autocapitalize="off" spellcheck="false"
                 placeholder="${placeholder || ""}" value="${value || ""}">
        </label>
      </div>
    `);
    const f = wrap.querySelector(".js-f");
    if (hint) f.setAttribute("inputmode", hint);
    /* 離れたときに預かります。設定の他の行が押した瞬間に効くのと同じ拍で、
       「保存」を押させるためだけの帯を持ちません。 */
    f.addEventListener("change", () => onSave(f.value.trim(), f));
    return wrap;
  }

  function relayRows() {
    const url = KN.healthRelay.url();
    const on = KN.healthRelay.configured();

    /* 確かめた結果。**紙の外に持っている**ので、覗く拍で組み直されても
       消えません。 */
    const result = node(html`<div class="js-relay-out"></div>`);
    const paintResult = () => {
      result.innerHTML = "";
      if (!relayTest) return;
      result.append(node(html`
        <div class="set-card is-pad">
          <div class="diet-read">
            ${KN.util.raw((relayTest.steps || []).map((st) => `
              <div class="diet-read-row">
                <span class="diet-read-name">${st.ok ? "✓" : "✗"} ${KN.util.escapeHtml(st.name)}</span>
                <span class="diet-read-day">${KN.util.escapeHtml(st.detail)}</span>
              </div>`).join(""))}
          </div>
          <p class="set-foot is-flush" style="margin-top:8px">${relayTest.message}</p>
        </div>
      `));
    };
    paintResult();

    const verify = navRow({
      ico: "check", tint: TINT.sync, title: "確かめる",
      value: on ? "" : "URLが要ります",
      onTap: () => {
        const v = KN.healthRelay.url();
        if (!v) { KN.ui.toast("先に「建てかた」でURLをつなげてください"); return; }
        relayTest = { message: "確かめています…", steps: [] };
        paintResult();
        KN.healthRelay.selfTest(v).then((r) => {
          relayTest = { message: r.message, steps: r.steps || [] };
          paintResult();
          /* 届いた、という出来事。**`success` はここまで一度も呼ばれて
             いませんでした**——用意してあるのに誰も鳴らさない名前でした。
             うまくいったと言うべき場所で、かつ絵の当たる相手（結果の札）が
             いるのは、ここです。 */
          if (r.ok) KN.motion.fire("success", result.firstElementChild);
          if (r.ok && KN.screens.diet) KN.screens.diet.render();
        }).catch((err) => {
          relayTest = { message: "確かめられませんでした（" + (err && err.message || err) + "）", steps: [] };
          paintResult();
        });
      },
    });

    return [
      foot("iPhoneのショートカットがここへ健康データを置き、くらしノートが取りにいきます。読み方は手入力とまったく同じで、増えるのは入口だけです。"),
      fieldCard({
        label: "中継所のURL", value: url,
        placeholder: "https://…workers.dev/kn-…",
        onSave: (v, f) => {
          if (relayBad(v)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
          /* **空にしても外しません。** ここは合言葉を含んだURLで、消すと
             Cloudflare を見に行かないと戻せません。外すのは下の行から。 */
          if (!v) { f.value = KN.healthRelay.url(); return; }
          KN.healthRelay.setUrl(v);
          render();
          KN.ui.toast("中継所を覚えました");
        },
      }),
      card(verify),
      result,
      foot("置く・取る・消える・道が合言葉になっている——を一往復して確かめます。古い形の中継所につないでいると、一行目でそう出ます。"),
      fieldCard({
        label: "ショートカットの名前", value: KN.healthRelay.shortcutName(),
        placeholder: "くらしノート健康",
        onSave: (v) => { KN.healthRelay.setShortcutName(v); KN.ui.toast(v ? "覚えました" : "外しました"); },
      }),
      foot("入れておくと、ダイエットの「◯:◯◯ 時点」を押したときに、そのショートカットをその場で走らせます。ショートカットアプリに出ている名前を、記号や空白まで一字たがえずに。"),
      card(navRow({
        ico: "route", tint: TINT.relay, title: "建てかた",
        onTap: () => go("relayHow"),
      })),
      foot("まだ建てていない方はこちら。iPhoneだけで建てられます。"),
      on ? card(dangerRow({
        ico: "close", title: "中継所を外す",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "中継所を外しますか？",
            message: "このURLはCloudflareの画面を見ないと作り直せません。控えてから外してください。",
            okLabel: "外す", danger: true,
          });
          if (!ok) return;
          KN.healthRelay.setUrl("");
          relayTest = null;
          render();
          KN.ui.toast("外しました");
        },
      })) : null,
    ];
  }

  /* 「Cloudflareに置く」の行き先。リポジトリの relay/ を指します——
     Cloudflare がそこの wrangler.jsonc を読んで、置き場を作り、
     .dev.vars.example を見て合言葉を尋ねてきます。 */
  const DEPLOY_URL = "https://deploy.workers.cloudflare.com/?url="
    + "https://github.com/rt95k9k468-cmyk/kaimono-note/tree/main/relay";

  /* ---------------- 建てかた（三段目） ----------------

     ①〜⑤ を三つに畳みました。④（確かめる）と⑤（ショートカットの名前）は
     **手順ではなく設定**だったので、一つ手前の紙へ移してあります。

     iPhoneだけで建てるとき、難所は二つあります。

       1. **90行のコードをクリップボードに載せる。** GitHubを開いて、rawを
          出して、全部を選んで、コピーして——指ではここで落ちます。
          だから「コードをコピー」の一つボタンにしました。
       2. **当てられない合言葉を作る。** iPhoneに openssl はありませんし、
          人が思いつく「適当な文字列」は適当ではありません。だから
          アプリが作ります。

     残りは、Cloudflareの画面で貼るだけの作業になります。 */
  function relayHowRows() {
    const pathCard = node(html`
      <div class="set-card is-pad">
        <div class="diet-relaykey">
          <code class="js-path">${relayPath || "（まだ作っていません）"}</code>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button type="button" class="btn btn-soft js-newpath" style="flex:1">道をつくる</button>
          <button type="button" class="btn btn-soft js-copypath" style="flex:1">道をコピー</button>
        </div>
      </div>
    `);
    const label = pathCard.querySelector(".js-path");
    pathCard.querySelector(".js-newpath").addEventListener("click", () => {
      relayPath = KN.healthRelay.makePath();
      label.textContent = relayPath;
      copyText(relayPath, "道");
    });
    pathCard.querySelector(".js-copypath").addEventListener("click", () => {
      if (!relayPath) { KN.ui.toast("先に「道をつくる」を押してください"); return; }
      copyText(relayPath, "道");
    });

    const deployCard = node(html`
      <div class="set-card is-pad">
        <a class="btn btn-primary btn-block js-deploy"
           href="${DEPLOY_URL}" target="_blank" rel="noopener">Cloudflareに置く</a>
        <ol class="diet-steps" style="margin-top:12px">
          <li>Cloudflareに登録（メールアドレスだけ。カードは要りません）</li>
          <li>GitHubとつなぐ画面が出たら許可する</li>
          <li><b>RELAY_PATH</b> を聞かれたら、①でコピーした道を<b>ペースト</b></li>
          <li><b>Deploy</b>（Create and deploy）を押す</li>
        </ol>
      </div>
    `);

    const joinCard = node(html`
      <div class="set-card is-pad">
        <label class="field">
          <span class="field-label">WorkerのURL</span>
          <input class="input js-base" inputmode="url" autocapitalize="off" spellcheck="false"
                 placeholder="https://kurashi-relay.あなた.workers.dev">
        </label>
        <button type="button" class="btn btn-primary btn-block js-join" style="margin-top:12px">
          道をつなげて保存
        </button>
      </div>
    `);
    joinCard.querySelector(".js-join").addEventListener("click", () => {
      const base = joinCard.querySelector(".js-base").value.trim();
      if (!base) { KN.ui.toast("WorkerのURLを貼ってください"); return; }
      if (relayBad(base)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
      if (!relayPath && !/\/\S/.test(base.replace(/^https:\/\/[^/]+/, ""))) {
        KN.ui.toast("先に「道をつくる」を押してください"); return;
      }
      KN.healthRelay.setUrl(KN.healthRelay.joinUrl(base, relayPath));
      /* つないだら、ここで終わりです。**一つ手前へ返します**——次にすること
         （確かめる）はあちらにあるので、戻る道を探させません。 */
      back();
      KN.ui.toast("つなげました。「確かめる」を押してください");
    });

    const codeCard = card(navRow({
      ico: "copy", tint: TINT.sub, title: "中継所のコードをコピー",
      onTap: () => copyText(KN.relayCode, "コード"),
    }));

    return [
      foot("パソコンは要りません。Cloudflareの画面はSafariで開いてください（無料・カード不要）。"),
      head("① 道（合言葉）をつくる"),
      pathCard,
      foot("これが合言葉です。知られると、その人も同じ郵便受けを開けられます。②の途中で貼るので、先に作ってコピーしておきます。"),
      head("② 中継所を置く"),
      deployCard,
      /* 逃げ道は一段にまとめます。三つに割ると、どれも同じ重さの手順に
         見えて、**まっすぐ進める人にも三段ぶん読ませる**ことになります。 */
      foot("つまずいたら：RELAY_PATH を聞かれなかったら、置いたあとに Settings → Variables and Secrets → Add で Type を Secret、名前を RELAY_PATH にして Deploy。置く画面が出なければ Create → Import a repository → kaimono-note を選び、Root directory に relay。置き場（KV）が用意されなかったときだけ Storage & Databases → KV で作り、Settings → Bindings で MAIL に結びます。"),
      codeCard,
      foot("手で貼るのは、iPhoneでは勧めません（編集画面が指で扱いにくいため）。すでに建てている方は、ここから貼り直してください——渡した便を消さない作りに変わったので、アプリだけ新しくしても効きません。URLも道もそのままで構いません。"),
      head("③ URLをつなげる"),
      joinCard,
      foot("Workerの画面の上のほうに出ている …workers.dev を貼ると、①の道が後ろに付いて保存されます。手で打ち継ぐ必要はありません。"),
      foot("ショートカットを3本目以降増やすときは、URLの末尾に ?slot=名前 を付けて名乗ってください（例：?slot=weight）。名乗らないと、同じ書式の便どうしが上書きし合います。"),
    ];
  }

  /* 鍵ではなくURLを預かります。ここに鍵を書かせないのは方針ではなく事実で、
     このページの中身は誰でも読めるからです。そのことを画面にも書きます。 */
  function openAiSheet() {
    const body = node(html`
      <div class="stack">
        <label class="field">
          <span class="field-label">窓口のURL（https://…）</span>
          <input class="input js-url" inputmode="url" autocapitalize="off" spellcheck="false"
                 placeholder="https://example.workers.dev/kurashi"
                 value="${KN.dietAI.url()}">
        </label>
        <p class="set-foot is-flush">
          <b>APIキーはここに入れません。</b>このページの中身は誰でも読めるので、鍵は
          窓口の向こう側（Cloudflare Workers など）に置いてください。送るのは
          ダイエットの記録だけです。受ける形は README の「AIの窓口」に。
        </p>
      </div>
    `);
    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-clear" style="flex:1">外す</button>
        <button class="btn btn-primary js-save" style="flex:1">保存</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "AIの窓口", content: body, footer: foot });
    foot.querySelector(".js-save").addEventListener("click", () => {
      const v = body.querySelector(".js-url").value.trim();
      if (v && !/^https:\/\//.test(v)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
      KN.dietAI.setUrl(v);
      h.close(); render();
      KN.ui.toast(v ? "保存しました" : "外しました");
    });
    foot.querySelector(".js-clear").addEventListener("click", () => {
      KN.dietAI.setUrl(""); h.close(); render(); KN.ui.toast("外しました");
    });
  }

  /* ---------------- 絵が見つからない言葉 ----------------

     新しい保存領域は増やしません。いま store にある題・食事・商品の名前を、
     画面が実際に引いているのと同じ手順（やること→こと辞書→品物辞書、
     食事→品物辞書のみ）で、開くたびその場で辞書に通すだけです。外れた
     ものだけを、出てきた回数の多い順に並べます。

     手で絵を選んだもの（t.icon / p.icon が付いているもの）は、辞書に
     頼っていないので対象外にします——ここは「自動で当てられなかった
     言葉」の一覧なので。 */

  function collectIconGaps() {
    const s = store.get();
    const T = KN.iconsTodo, P = KN.productIcons;
    if (!T || !P) return [];

    const byKey = new Map(); // "kind\u0000name" -> { name, kind, count }
    const bump = (name, kind) => {
      const k = kind + "\u0000" + name;
      const cur = byKey.get(k);
      if (cur) cur.count++;
      else byKey.set(k, { name, kind, count: 1 });
    };

    (s.todos || []).forEach((t) => {
      if (t.icon) return;
      const title = String(t.title || "").trim();
      if (!title) return;
      if (!(T.findKey(title) || P.findKey(title))) bump(title, "やること");
    });

    (s.diet && s.diet.meals || []).forEach((m) => {
      (m.items || []).forEach((it) => {
        const name = String(it.name || "").trim();
        if (!name) return;
        if (!P.findKey(name)) bump(name, "食事");
      });
    });

    (s.products || []).forEach((p) => {
      if (p.icon) return;
      const name = String(p.name || "").trim();
      if (!name) return;
      const cat = s.categories.find((c) => c.id === p.categoryId)
        || s.categories.find((c) => c.id === store.OTHER_CATEGORY)
        || s.categories[0];
      const hit = P.findKey(name) || (cat && P.findKey(cat.name));
      if (!hit) bump(name, "買うもの");
    });

    return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
  }

  function iconGapsGroup() {
    const gaps = collectIconGaps();
    const wrap = node(html`
      <section class="settings-group">
        <h2 class="set-head is-flush">絵が見つからない言葉</h2>
        ${gaps.length ? html`
          <div class="set-card js-gap-rows"></div>
          <div class="set-card" style="margin-top:12px">
            <button type="button" class="set-row js-gap-copy">
              <span class="set-title">一覧をコピー</span>
              <span class="set-glyph is-plain">${icon("copy")}</span>
            </button>
          </div>
          <p class="set-foot is-flush">辞書に当たらなかった言葉です。コピーして伝えていただくと、辞書に足せます。</p>
        ` : html`
          <div class="set-card"><p class="set-empty">いまのところ、ありません。</p></div>
        `}
      </section>
    `);

    if (gaps.length) {
      const rows = wrap.querySelector(".js-gap-rows");
      gaps.slice(0, 200).forEach((g) => {
        rows.append(node(html`
          <div class="set-row">
            <span class="set-title">${g.name}<span class="set-note">${g.kind}</span></span>
            <span class="set-val">${g.count}件</span>
          </div>
        `));
      });

      wrap.querySelector(".js-gap-copy").addEventListener("click", () => {
        const text = gaps.map((g) => `${g.name}\t${g.kind}\t${g.count}`).join("\n");
        const ok = () => KN.ui.toast("コピーしました");
        const fallback = () => {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.cssText = "position:fixed;top:50%;left:4%;width:92%;height:40%;z-index:9999";
          document.body.append(ta);
          ta.select();
          let done = false;
          try { done = document.execCommand("copy"); } catch (err) { done = false; }
          if (done) { ta.remove(); ok(); return; }
          KN.ui.toast("長押しして「すべてを選択」→「コピー」してください");
          ta.addEventListener("blur", () => ta.remove());
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok, fallback);
        } else {
          fallback();
        }
      });
    }

    return wrap;
  }

  /* 「この絵はちがう」の報告。書き込む先は買うもの・やることの絵を
     タップして開く紙（`screen-list.js` / `screen-todo.js`）ですが、
     ここではその置き場所を出すだけです。食事メモの絵は出さなくなった
     ので（キリがなかったので）、いまはこの二画面ぶんです。

     **困りごとは二種類あって、見出しも二つに割ります**（`kind`）。
     「言葉が無い」は上の「絵が見つからない言葉」と近い話に見えますが、
     あちらは辞書に一度も当たらなかった記録を**自動で**拾ったもの、
     こちらは**手で**「この言葉には、まだ正しい絵が無い」と残したもの
     ——絵選び紙で「おまかせにする」を選びながら報告すると、ここに載ります。
     「絵がちがう」は自動では拾えません（辞書は当たっているので）。
     選び直した絵があれば、そのまま次の直しの入力として使えます。

     **送り先はありません。** このアプリが外と話す唯一の口は中継所URLで、
     それは資格情報なので触れません（このファイルの最優先の約束事）。
     だから報告は**この端末に溜まるだけ**——見返す、またはコピーして
     次にお願いするときに渡す先です。 */
  function iconReportsGroup() {
    const screenLabel = { meal: "食事", shop: "買うもの", todo: "やること" };
    const iconLabel = (key) => key ? (KN.productIcons.LABELS[key] || key) : "（絵ナシ）";

    const wrap = node(html`
      <section class="settings-group">
        ${/* 空のときと件があるときで、中身の形がまるごと変わります
              （一覧＋コピー行、か、一行の案内文か）。だから空にするのは
              「入れ物」ではなく、その**中身**——js-rep-body は常に同じ
              一つの要素のまま、中を repaint のたびに詰め替えます。
              前は空のとき要素ごと差し替えていて、二回目の repaint が
              もう外れた要素を触っていました。 */""}
        <div class="js-rep-body"></div>
        <h2 class="set-head is-flush">ことばを確かめる</h2>
        <div class="set-card is-pad">
          <div style="display:flex;gap:8px">
            <input class="input js-rep-text" placeholder="例：一本満足バー" style="flex:1"
                   autocomplete="off" autocapitalize="off" spellcheck="false">
            <button type="button" class="btn btn-soft js-rep-add">報告する</button>
          </div>
        </div>
        <p class="set-foot is-flush">辞書に当たれば「絵がちがう」、当たらなければ「言葉が無い」に、自分で振り分けます。送り先はありません。次にお願いするときに、コピーして渡すための控えです。</p>
      </section>
    `);

    const body = wrap.querySelector(".js-rep-body");

    function copyReports(reports) {
      const text = JSON.stringify(reports.map((r) => (
        { kind: r.kind, screen: r.screen, text: r.text, gotIcon: r.gotIcon, chosen: r.chosen, note: r.note }
      )), null, 1);
      const ok = () => KN.ui.toast("コピーしました");
      const fallback = () => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:50%;left:4%;width:92%;height:40%;z-index:9999";
        document.body.append(ta);
        ta.select();
        let done = false;
        try { done = document.execCommand("copy"); } catch (err) { done = false; }
        if (done) { ta.remove(); ok(); return; }
        KN.ui.toast("長押しして「すべてを選択」→「コピー」してください");
        ta.addEventListener("blur", () => ta.remove());
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, fallback);
      } else {
        fallback();
      }
    }

    /* 一つの種類ぶん（絵がちがう／言葉が無い）を、見出し・一覧・コピー行の
       ひとかたまりで描きます。二つの見出しが同じ形をしていること・同じ
       手つき（消す・コピー）を持つことを、ここ一か所で保ちます。 */
    function kindBlock(kind, title, emptyText) {
      const reports = (store.get().iconReports || []).filter((r) => r.kind === kind);
      const frag = document.createDocumentFragment();
      frag.append(node(html`<h2 class="set-head is-flush">${title}</h2>`));

      if (!reports.length) {
        frag.append(node(html`<div class="set-card"><p class="set-empty">${emptyText}</p></div>`));
        return frag;
      }

      const rows = node(html`<div class="set-card"></div>`);
      reports.forEach((r) => {
        const detail = kind === "wrong"
          ? `${screenLabel[r.screen] || r.screen || "？"}・いま出る絵：${iconLabel(r.gotIcon)}`
              + (r.chosen ? `・正しくは：${iconLabel(r.chosen)}` : "")
          : `${screenLabel[r.screen] || r.screen || "？"}`;
        const row = node(html`
          <div class="set-row">
            <span class="set-title">${r.text}<span class="set-note">${detail}</span></span>
            <button type="button" class="icon-btn js-rep-del" aria-label="「${r.text}」の報告を消す">${icon("close")}</button>
          </div>
        `);
        row.querySelector(".js-rep-del").addEventListener("click", () => {
          store.removeIconReport(r.id);
          paint();
        });
        rows.append(row);
      });
      frag.append(rows);

      const copyRow = node(html`
        <div class="set-card" style="margin-top:12px">
          <button type="button" class="set-row js-rep-copy">
            <span class="set-title">一覧をコピー</span>
            <span class="set-glyph is-plain">${icon("copy")}</span>
          </button>
        </div>
      `);
      copyRow.querySelector(".js-rep-copy").addEventListener("click", () => copyReports(reports));
      frag.append(copyRow);
      return frag;
    }

    function paint() {
      body.innerHTML = "";
      body.append(kindBlock("wrong", "報告した「絵がちがう」", "いまのところ、ありません。"));
      body.append(kindBlock("missing", "報告した「言葉が無い」", "いまのところ、ありません。"));
    }
    paint();

    wrap.querySelector(".js-rep-add").addEventListener("click", () => {
      const input = wrap.querySelector(".js-rep-text");
      const text = input.value.trim();
      if (!text) return;
      /* どの画面のつもりかを、この欄は知りません（品目にも用事にも
         まだ結びついていない、思いついた言葉を確かめるための入口
         なので）。両方の辞書に聞いて、当たったほうを採ります——こと
         辞書→品物辞書は、やることの絵選び紙と同じ順番です。 */
      const gotIcon = (KN.iconsTodo && KN.iconsTodo.findKey(text)) || KN.productIcons.findKey(text) || "";
      store.addIconReport({ text, screen: "", gotIcon, kind: gotIcon ? "wrong" : "missing" });
      input.value = "";
      paint();
    });

    return wrap;
  }

  /* ---------------- バックアップと書き出し（「›」の先） ---------------- */

  /* 保存できたかどうかを、**押した瞬間には記録しません。** 前は押した直後に
     「前回の書き出し」を今にして「保存しました」と出していたので、iPhone で
     保存の画面を取り消しても、失敗しても、設定には前回の日付が出て、守られて
     いるつもりになりました。

     指で触る端末で、ファイルを共有シートで渡せるなら、そちらを使います——
     渡し終えたときにだけ果たされ、取り消しは AbortError で分かるので、
     確かめてから記録できます。それ以外は、ダウンロードのあとに一度だけ
     「保存できましたか？」と訊きます。**share はタップの流れの中で呼ぶこと**
     （手前で await すると、端末が「人が押した」と見なさなくなります）。 */
  async function saveBackup() {
    /* 日記の写し（js/diary-idb.js）の突き合わせが済む前は、写しから戻る
       はずの本文が、まだ記録に入っていないことがあります。開いた直後の
       一瞬だけのことなので、待たずに断ります（ここで await すると、下の
       共有シートが「人が押した」流れから外れます）。 */
    if (KN.diaryIdb && !KN.diaryIdb.settled()) {
      KN.ui.toast("日記を読み込んでいるところです。少し待ってから、もう一度押してください");
      return;
    }
    const at = new Date().toISOString();
    const d = new Date(at);
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const name = `kaimono-note-${stamp}.json`;
    const text = store.exportJSON(at);

    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    let file = null;
    try { file = new File([text], name, { type: "application/json" }); } catch (err) { file = null; }
    if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        KN.backup.markExported(at);
        KN.ui.toast("バックアップを書き出しました");
        render();
        return;
      } catch (err) {
        if (err && err.name === "AbortError") {
          KN.ui.toast("書き出しをやめました（記録していません）");
          return;
        }
        // 共有そのものが使えなかったときだけ、ダウンロードの道へ。
      }
    }
    await downloadBackup(name, text, at);
  }

  async function downloadBackup(name, text, at) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    /* 1秒で捨てていたのを1分に。「ダウンロードしますか？」に答えてから
       中身を取りに来る端末では、迷っているあいだに捨てると取りに行けません。 */
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
    const ok = await KN.ui.confirm({
      title: "保存できましたか？",
      message: `「${name}」がファイルやダウンロードの中にあれば、保存できています。できていたときだけ、前回の書き出しとして記録します。`,
      okLabel: "保存できた", cancelLabel: "できなかった",
    });
    if (ok) {
      KN.backup.markExported(at);
      KN.ui.toast("前回の書き出しとして記録しました");
    } else {
      KN.ui.toast("記録していません。もう一度お試しください");
    }
    render();
  }

  /** 復元に使う、隠したファイル選択。**画面に置いたまま**にします——
      押してから開くまでのあいだに組み直しが走ると、選び終わった file が
      もう外れた要素に届きます。

      **置き換える前に、中身を確かめて見せます。** daily の月の書き出しや
      日記の取り込み道具の出力も同じ .json で、前はそれを選ぶと、空の
      state で全部が置き換わりました（store.js の readBackup）。 */
  function importInput() {
    const file = node(html`<input type="file" accept="application/json,.json" class="js-file" hidden>`);
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      let text = "";
      try { text = await f.text(); } catch (err) { text = ""; }
      file.value = "";
      const r = store.inspectBackup(text);
      if (!r.ok) {
        KN.ui.toast(`復元できません：${r.reason}（何も変えていません）`, { duration: 6000 });
        return;
      }
      const when = r.exportedAt ? `${snapStamp(r.exportedAt)} の書き出し` : "書き出し日時の無いファイル";
      const ok = await KN.ui.confirm({
        title: "復元しますか？",
        message: `このファイル（${when}）：${countText(r.counts)}。いまの記録：${countText(store.countsOf())}。いまのデータはすべて置き換わります。直前の状態は自動バックアップに残ります。`,
        okLabel: "復元する",
        danger: true,
      });
      if (!ok) return;
      if (!(await keepBefore("復元前"))) return;
      try {
        store.importJSON(text);
        KN.ui.toast("復元しました");
      } catch (err) {
        console.error(err);
        KN.ui.toast(`読み込めませんでした：${String((err && err.message) || err)}`);
      }
    });
    return file;
  }

  /* 保存したファイルを、**戻さずに**読んで確かめます。書き出した日時と
     記録の数を、いまの記録と並べて見せるだけで、記録には何も触れません。
     読めたファイルは確かに手元にあるので、その書き出し日時を「前回の
     書き出し」として記録します（前の記録より古ければ巻き戻しません）。 */
  function verifyInput() {
    const file = node(html`<input type="file" accept="application/json,.json" class="js-verify" hidden>`);
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      let text = "";
      try { text = await f.text(); } catch (err) { text = ""; }
      file.value = "";
      showVerify(f.name, store.inspectBackup(text));
    });
    return file;
  }

  function showVerify(name, r) {
    const now = store.countsOf();
    const kinds = [
      ["商品", "products"], ["やること", "todos"], ["daily（日）", "days"],
      ["積み上げ", "entries"], ["ダイエット", "diet"],
    ];
    let lead = `「${name}」は、戻せるバックアップではありません。${r.reason || ""}。`;
    let verdict = "";
    if (r.ok) {
      lead = `「${name}」は読めました。${r.exportedAt ? `${snapStamp(r.exportedAt)} の書き出しです。` : ""}`;
      verdict = kinds.every(([, k]) => r.counts[k] === now[k])
        ? "数は、いまの記録と同じです（中身の一字一字までは比べていません）。"
        : "このファイルのあとに、増えたり減ったりした記録があります。新しく書き出しておくと安心です。";
      if (r.exportedAt) KN.backup.markExported(r.exportedAt);
    }
    const body = node(html`
      <div class="stack" style="gap:12px">
        <p style="color:var(--c-text-2);line-height:1.6">${lead}</p>
        ${r.ok ? html`
          <table class="verify-table">
            <tr><th></th><th>このファイル</th><th>いま</th></tr>
            ${kinds.map(([label, k]) => html`<tr><td>${label}</td><td>${r.counts[k]}</td><td>${now[k]}</td></tr>`)}
          </table>
          <p style="color:var(--c-text-2);line-height:1.6">${verdict}</p>` : ""}
      </div>
    `);
    const foot = node(html`<button class="btn btn-soft btn-block">閉じる</button>`);
    const h = KN.ui.sheet({
      title: r.ok ? "バックアップを確かめました" : "バックアップではありません",
      content: body, footer: foot, guard: false, as: "dialog",
    });
    foot.addEventListener("click", () => h.close());
    render();
  }

  /** 設定に出す、この端末の中の量（backup.usage）。 */
  function usageText(u) {
    const diary = u.diaryChars ? `（うち日記 ${charText(u.diaryChars)}）` : "";
    /* 控えが大きな保存場所（IndexedDB）にあれば、もう記録と枠を分け合って
       いません。そう言わないと、前の「分け合っています」を読んだ人が、
       控えを減らさなければと思い続けます。 */
    let t = u.where === "idb"
      ? `この端末の中：記録 ${charText(u.liveChars)}${diary}。自動バックアップ ${u.count}件（${charText(u.snapChars)}）は、記録とは別の、大きな保存場所にあります。`
      : `この端末の中：記録 ${charText(u.liveChars)}${diary}・自動バックアップ ${u.count}件 ${charText(u.snapChars)}。二つで、端末の保存の枠（iPhone でおよそ5MB）を分け合っています。`;
    t += diaryCopyText(u.diary);
    if (u.tight) {
      t += `記録が大きくなったので、自動バックアップは${u.fits}件ぶんまでしか持てず、直近の細かい控えから減ります。こまめに「バックアップを保存」を。`;
    }
    return t;
  }

  /* 日記の写し（js/diary-idb.js）の様子。**元（記録の中）を消していない**
     ことと、開くたびに突き合わせた結果を言います——元を記録から外すかどうか
     を決めるときの手がかりなので。日記の中身や、書いた日の数には触れません
     （daily は数えない・評価しない）。 */
  function diaryCopyText(d) {
    if (!d || d.phase === "idle" || d.phase === "starting") return "";
    if (d.phase === "off") return "日記は、記録の中だけにあります（大きな保存場所へは写していません）。";
    const n = d.opens || 0;
    const how = !n ? "写したあと、読み比べて一字も違わないことを確かめました"
      : d.fixed ? `開くたびに突き合わせていて、これまで${n}回のうち${d.fixed}回は、食い違いを直しました`
      : `開くたびに突き合わせていて、これまで${n}回とも食い違いはありません`;
    const stuck = d.error ? "いまは写しへの書き足しが止まっています（記録の中には残っています）。" : "";
    return `日記の本文は、記録の中に残したまま、大きな保存場所にも写してあります（${how}）。${stuck}`;
  }

  function dataRows() {
    const file = importInput();
    const verify = verifyInput();
    const snaps = KN.backup.list();
    return [
      card(
        navRow({ ico: "download", tint: TINT.data, title: "バックアップを保存", onTap: saveBackup }),
        navRow({ ico: "check", tint: TINT.data, title: "保存したバックアップを確かめる", onTap: () => verify.click() }),
        navRow({ ico: "upload", tint: TINT.data, title: "バックアップから復元", onTap: () => file.click() })
      ),
      foot(exportSub()),
      card(
        navRow({
          ico: "undo", tint: TINT.sub, title: "自動バックアップから戻す",
          value: snaps.length ? `${snaps.length}件` : "なし", onTap: openSnapshots,
        }),
        navRow({ ico: "copy", tint: TINT.sub, title: "記録を書き出す", onTap: openRecordExport }),
        navRow({
          ico: "sparkles", tint: TINT.sub, title: "おぼえた振り分け",
          value: `${store.learnedList().length}件`, onTap: openLearned,
        })
      ),
      foot(usageText(KN.backup.usage())),
      foot("「記録を書き出す」は、体重・食事・歩数・お酒を日ごとの表にします（AIに渡す用）。"),
      /* 戻せない操作は、ここからもう一段奥。同じ一枚に置いておくと、
         「戻す」の隣に「消す」が並ぶことになります。 */
      card(
        navRow({ ico: "trash", tint: TINT.danger, title: "データを消す", onTap: () => go("danger") })
      ),
      file,
      verify,
    ];
  }

  /* ---------------- データを消す（三段奥） ----------------

     どれも**戻せない**操作です。参考画面（Structured）が「アプリを初期化」を
     詳細設定のいちばん下に置いているのと同じ考えで、ここだけ一段深くして
     あります。「サンプルデータを入れる」も、見た目は足す操作ですが、中身は
     いまの記録を**全部置き換える**ものなので、同じ棚に置きます。

     四角の絵は着せません——あれは「押すと続きがある」の印なので、戻れない
     操作に着せると、普通の行き先と同じ顔になります。 */

  function dangerRows() {
    const d = store.get().diet;
    return [
      foot("ここから先は、押すと戻せません。どれも直前の状態を自動バックアップに残しますが、端末を替えたあとでは戻せません。"),
      card(dangerRow({
        ico: "trash", title: "ダイエットの記録を消す",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "ダイエットの記録を消す",
            message: "体重・食事・ヘルスケアの記録がすべて消えます。買うものとやることはそのままです。直前の状態は自動バックアップに残ります。",
            okLabel: "消す", danger: true,
          });
          if (!ok) return;
          /* 前はここで控えを取っていませんでした。確認の文は「直前の状態は
             自動バックアップに残ります」と言うのに、残っていたのは最後に
             アプリを離れたときの状態でした。 */
          if (!(await keepBefore("削除前"))) return;
          store.clearDiet();
          render();
          KN.ui.toast("消しました");
        },
      })),
      foot(`体重 ${d.weights.length}件・食事 ${d.meals.length}件・ヘルスケア ${d.health.length}件。`),
      card(dangerRow({
        ico: "sparkles", title: "サンプルデータを入れる",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "サンプルを入れますか？",
            message: "いまのデータはすべて置き換わります。",
            okLabel: "入れる", danger: true,
          });
          if (!ok) return;
          if (!(await keepBefore("サンプル読込前"))) return;
          store.loadSample();
          KN.ui.toast("サンプルを読み込みました");
        },
      })),
      foot("お試し用のお店と商品に置き換えます。いまの記録は消えます。"),
      card(dangerRow({
        ico: "trash", title: "すべて削除",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "すべて削除しますか？",
            message: "買うもの・やること・daily・ダイエットの記録（体重・食事・お酒・目標）と設定が、すべて消えます。直前の状態は自動バックアップに残るので、あとから戻せます。",
            okLabel: "削除する", danger: true,
          });
          if (!ok) return;
          if (!(await keepBefore("削除前"))) return;
          store.reset();
          KN.ui.toast("すべて削除しました");
        },
      })),
      foot("買うもの・やること・daily・ダイエット・設定、ぜんぶ消えます。"),
    ];
  }

  /* 目次のいちばん下には、かごの絵と「くらしノート」「データはこの端末の
     中だけに」「ホーム画面に追加すると…」の四行がありました。**外しました。**

     設定を開く人は、直したいものがあって開きます。その列のいちばん下に
     アプリの名乗りと使い方の案内があると、探しものの列が名乗りで終わる
     ——目次が「行き先の一覧」であることが、そこで途切れます。名乗りは
     立ち上げたときの面が済ませていますし、保存先の話はバックアップの中で
     もう一度、必要な文脈と一緒に出てきます。 */

  KN.screens = KN.screens || {};
  KN.screens.settings = { mount, render, onEnter };
})();
