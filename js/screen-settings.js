/* =========================================================
   くらしノート — settings screen
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;
  const store = KN.store;

  /* 中身の行は settings-*.js に分けてあります（docs/settings.md の「ファイルの
     分け方」）。部品（紙の重なり・行・カード）はここから配り、中身はそれぞれの
     ファイルがここへ置きます。 */
  const S = (KN.settingsParts = {});

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
    L.navTitle.textContent = page ? titleOf(page) : (opts.title || "Settings");
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
    /* Dropbox へ送った・送れなかったは store の外で動くので、別に聞きます。 */
    if (KN.dropbox) KN.dropbox.onChange(render);
    /* ノート（js/notes-idb.js）も store の外。読み終えたらノートブック・タグの
       行が出るので、組み直します。 */
    if (KN.notes) KN.notes.onChange(() => { if (KN.app.activeScreen() === "settings") render(); });

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
    if (page) {
      if (typeof page.title === "function") L.navTitle.textContent = titleOf(page);
      page.build().flat().filter(Boolean).forEach((n) => L.body.append(n));
    } else renderRoot(L);
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

  /** めったに要らない説明（つまずいたとき・込み入った組み方）。畳んでおき、
      押した人にだけ開きます。 */
  const more = (title, text) => node(html`
    <details class="set-more"><summary>${title}</summary><p>${text}</p></details>`);

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

  /* ---------------- どの画面の設定か ----------------

     歯車を押した画面 → その席の名前と中身。価格は席を持たない画面
     （買うものの紙の裏）なので、その席——買うもの——の設定を出します。

     中身の関数は、このファイルより後に読まれる settings-*.js にあります。
     読み込んだ時点ではまだ居ないので、組むときに `S` から引きます。 */
  /* ノートは daily の席を分け合う（docs/notes.md）ので、daily のすぐ下に
     notes の見出しで並べます（`more`）。daily から開いても、ノートの面から
     開いても同じ順。 */
  const NOTES = { label: "notes", rows: () => S.notesRows() };
  const TAB = {
    todo:    { label: "tasks",    rows: () => S.todoRows() },
    list:    { label: "shopping", rows: () => S.listRows() },
    prices:  { label: "shopping", rows: () => S.listRows() },
    archive: { label: "daily",    rows: () => S.dailyRows(), more: NOTES },
    notes:   { label: "daily",    rows: () => S.dailyRows(), more: NOTES },
    diet:    { label: "health",   rows: () => S.dietRows() },
  };

  /** 「›」の先。ここに載るのは**一画面ぶんある中身**だけです。 */
  const PAGES = {
    look:   { title: "外観",                 build: () => S.lookRows() },
    data:   { title: "バックアップ",          build: () => S.dataRows() },
    notify:    { title: "通知",     build: () => S.notifyRows() },
    cal:       { title: "カレンダー", build: () => S.calRows() },
    slips:     { title: "置き直しの控え", build: () => S.slipRows() },
    dailyView: { title: "表示",     build: () => S.dailyViewRows() },
    dailyOut:  { title: "書き出し", build: () => S.dailyOutRows() },
    lock:      { title: "ロック",   build: () => S.lockRows() },
    intake:    { title: "取り込み", build: () => S.intakeRows() },
    errors: { title: "困ったときの記録",      build: () => S.errorRows() },
    dropbox: { title: "Dropbox へ送る",       build: () => S.dropboxRows() },
    stores: { title: "お店",                 build: () => [S.storesGroup()] },
    cats:   { title: "カテゴリ",              build: () => [S.categoriesGroup()] },
    icons:  { title: "アイコンについて",       build: () => [S.iconGapsGroup(), S.iconReportsGroup()] },
    calHow:   { title: "ショートカットの組み方", build: () => S.calHowRows() },
    relay:    { title: "中継所",   build: () => S.relayRows() },
    relayHow: { title: "建てかた", build: () => S.relayHowRows() },
    notesBooks: { title: "ノートブック", build: () => S.notesLabelList("nb") },
    notesTags:  { title: "タグ",         build: () => S.notesLabelList("tag") },
    /* 一つのノートブック・タグ。題はその名前なので、付け替えたら追いかけます
       （`title` が関数なら、組み直すたびに引く）。 */
    noteLabel:  { title: () => S.noteLabelTitle(), build: () => S.noteLabelRows() },
  };
  const titleOf = (page) => (typeof page.title === "function" ? page.title() : page.title);

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
    /* 歯車の点（R25）の中身を、頭に一行。押すとバックアップへ。 */
    const stale = KN.backup.offDeviceStale && KN.backup.offDeviceStale();
    if (stale) L.body.append(card(navRow({
      ico: "download", tint: TINT.data, title: staleText(stale),
      onTap: () => go("data"),
    })));
    /* 開いたときの点検（B4、backup.js の doubt）：記録が写しや控えより大きく少ない。
       記録は「自動バックアップから戻す」へ。ノートは、その控えから消さずに合わせる。 */
    const doubt = KN.backup.doubt && KN.backup.doubt();
    if (doubt) L.body.append(card(
      doubt.record ? navRow({
        ico: "undo", tint: TINT.data, title: "記録が控えより少なくなっています",
        value: stampOf(doubt.record.at), onTap: () => go("data"),
      }) : null,
      doubt.notes ? navRow({
        ico: "undo", tint: TINT.data, title: "ノートが控えより少なくなっています",
        value: stampOf(doubt.notes.at), onTap: () => mergeNotesFrom(doubt.notes.at),
      }) : null
    ));
    const tab = TAB[fromTab] || TAB.archive;
    L.body.append(head(tab.label));
    put(tab.rows());
    if (tab.more) {
      L.body.append(head(tab.more.label));
      put(tab.more.rows());
    }
    /* 上の見出しは席の名前（tab.label ＝ shopping など）。その続きなので、
       ここも同じ系列の言葉にします。 */
    L.body.append(head("General"));
    put(generalRows());
  }

  function stampOf(iso) {
    const d = new Date(iso);
    if (!isFinite(d)) return "";
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  async function mergeNotesFrom(at) {
    const ok = await KN.ui.confirm({
      title: "ノートを合わせますか？",
      message: `${stampOf(at)} の控えのノートを、いまのノートに足します。いまのノートは消しません。`,
      okLabel: "合わせる",
    });
    if (!ok) return;
    const r = await KN.backup.mergeNotes(at);
    KN.ui.toast(r === "merged" ? "ノートを合わせました" : "合わせられませんでした", { long: r !== "merged" });
    render();
  }

  function staleText(x) {
    if (x.stuck) return `Dropbox へ${x.days}日送れていません`;
    if (x.days === null) return "端末の外の控えが、まだありません";
    return `端末の外の控えが${x.days}日前のままです`;
  }

  /** どの画面から開いても、下半分はこれ。 */
  function generalRows() {
    const s = store.get();
    const a = store.ACCENTS.find((x) => x.id === (s.settings.accent || "orange"));
    const notes = S.collectIconGaps().length + (s.iconReports || []).length;
    return [
      card(
        navRow({
          ico: "palette", tint: TINT.look, title: "外観",
          /* 参考画面と同じで、いまの色をひと粒で。 */
          value: a ? node(html`<span class="set-dot" style="background:${a.swatch}"></span>`) : null,
          onTap: () => go("look"),
        }),
        /* 前は「バックアップと書き出し」。書き出しの三つがタブへ移ったので、
           名前を中身に合わせました。 */
        navRow({
          ico: "download", tint: TINT.data, title: "バックアップ",
          onTap: () => go("data"),
        }),
        navRow({
          ico: "tag", tint: TINT.icons, title: "アイコンについて",
          value: notes ? `${notes}件` : "",
          onTap: () => go("icons"),
        }),
        KN.errlog ? navRow({
          ico: "copy", tint: TINT.sub, title: "困ったときの記録",
          value: S.errCount() ? `${S.errCount()}件` : "なし",
          onTap: () => go("errors"),
        }) : null
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
            <span class="set-title">保存できていません<span class="set-note">端末の空き容量を確かめてください。</span></span>
          </div>
        </div>
      </section>
    `);
  }

  /* 目次のいちばん下には、かごの絵と「くらしノート」「データはこの端末の
     中だけに」「ホーム画面に追加すると…」の四行がありました。**外しました。**

     設定を開く人は、直したいものがあって開きます。その列のいちばん下に
     アプリの名乗りと使い方の案内があると、探しものの列が名乗りで終わる
     ——目次が「行き先の一覧」であることが、そこで途切れます。名乗りは
     立ち上げたときの面が済ませていますし、保存先の話はバックアップの中で
     もう一度、必要な文脈と一緒に出てきます。 */

  Object.assign(S, { back, go, TINT, card, head, foot, more, navRow, dangerRow, switchRow, pickRow, choose, render, copyText, fieldCard });

  KN.screens = KN.screens || {};
  KN.screens.settings = { mount, render, onEnter };
})();
