/* =========================================================
   くらしノート — ダイエット
   =========================================================

   一枚の画面に、上から順に

     今日     … 体重と、その一歩ぶんの動き
     グラフ   … 実測と7日平均、そして目標線
     からだ   … 歩数・距離・消費・睡眠・運動（ヘルスケアから）
     食事     … 今日の合計と、朝昼夕間食
     気づき   … 溜まった記録から読める「関連」
     目標     … 身長・目標・見込み

   ぜんぶを毎日読むためではありません。上の二つで「いまどうなっているか」
   が終わり、下は用があるときだけ降りていくところです。 */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon } = KN.util;
  const U = KN.util;
  const store = KN.store;
  const D = KN.diet;
  const DR = KN.drinks;

  let root = null;
  let els = {};
  /* カルーセルを指で払っているあいだ（横だと決まってから、滑り終わる
     まで）。この間は render() を呼びません——お店の外の理由（30秒ごとの
     見直しや、自動同期の書き込みなど）で store が動いても、指の下の紙が
     ガタッと組み直されないように。次の render() は、離した直後に自分で
     呼びます。 */
  let dragging = false;
  /* グラフの期間。まず7日を出します——「最近どうか」を見るのに、
     30日は入り口としては長すぎます（30日ぶんの点は、電話の幅では
     一日ぶんが10pxほどになり、日々の上下が読めません）。 */
  let range = 7;              // グラフの期間（日）。0 は全期間。
  let analysisWindow = 30;
  let series = "";             // 体重と並べて見るもの。空なら体重だけ。

  /* いま見ている日。null は「今日」——日付を焼き込まないのは、日付が
     変わったあともアプリを開きっぱなしにしていることがあるからです。 */
  let viewDay = null;
  /* 「食べたものを探す」の文字。入っているあいだは、その日の紙のかわりに
     見つかった日を並べます（下の renderFound）。 */
  let query = "";
  const curDay = () => viewDay || U.todayKey();
  const isViewToday = () => curDay() === U.todayKey();
  /** 見出しに出す日の呼び名。今日なら「今日」、ほかの日は「8月17日」。
      引数を渡せばその日、渡さなければ**いま見ている日**（既定の使い方）。
      カルーセルの前日・翌日の紙は、いま見ている日とは別の日を描くので、
      その紙の日を明示して呼びます。 */
  const dayName = (day) => {
    const d = day || curDay();
    return d === U.todayKey() ? "今日" : U.formatDay(d);
  };

  /* 一日の順に、日の高さで。朝は昇る日、昼は真上の日、夜は月——
     間食だけは時刻ではないので、食べもののほうを描きます。 */
  /* short は札や帯に出す一文字ぶんの名前。label は文の中で使う名前です
     （「朝食を直す」と「朝 300kcal」では、要る長さが違います）。 */
  const SLOTS = [
    { id: "breakfast", label: "朝食", short: "朝",   ico: "sunrise" },
    { id: "lunch",     label: "昼食", short: "昼",   ico: "sun" },
    { id: "dinner",    label: "夕食", short: "夜",   ico: "moon" },
    { id: "snack",     label: "間食", short: "間食", ico: "snack" },
  ];

  /** いま時刻なら、たぶんこの食事。夜遅くに開いたら間食です。 */
  function guessSlot() {
    const h = new Date().getHours();
    if (h < 10) return "breakfast";
    if (h < 15) return "lunch";
    if (h < 21) return "dinner";
    return "snack";
  }

  const kg = (v) => (v == null ? "—" : v.toFixed(1));
  const n0 = (v) => (v == null ? "—" : Math.round(v).toLocaleString());
  /* 0 は「±0.0」と書きます。「0.0」だけだと、増減の欄なのか実測の欄なのかが
     ぱっと読めません。 */
  const signed = (v, d) => {
    if (v == null) return "—";
    const s = v.toFixed(d == null ? 1 : d);
    return /^-?0(\.0+)?$/.test(s) ? "±" + s.replace("-", "") : (v > 0 ? "+" + s : s);
  };
  const hhmm = (min) => (min == null ? "—" : `${Math.floor(min / 60)}時間${String(Math.round(min % 60)).padStart(2, "0")}分`);
  /* 横に四つ並べる枠のための、短い書き方。「6時間40分」は7文字で、
     四等分した枠には入りません。 */
  const hm = (min) => (min == null ? "—" : `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}m`);

  /* ---------------- 組み立て ---------------- */

  function mount(el) {
    root = el;
    root.innerHTML = "";

    const chrome = node(html`
      <div class="stack">
        <header class="topbar">
          <div class="topbar-row">
            ${/* 題は、いま見ている日。やること・daily と同じ組みです——年だけ
                  差し色、月日が黒、右に「›」。押すと暦が月ぜんぶに開きます。
                  月と年を別に出す見出しの行（「8月 2026」）と「週」の札、
                  ‹ › は、この題に吸収して消えました。 */""}
            <button type="button" class="topbar-day js-day-title">
              <span class="topbar-title"><span class="day-y"></span><span class="day-md"></span></span>
              <span class="day-more">${icon("chevron")}</span>
            </button>
            ${/* 右端から 暦・さがす・取り込み。ほかの画面と同じ並べ方です。 */""}
            <button class="icon-btn js-sync" aria-label="ヘルスケアから取り込む" title="ヘルスケアから取り込む">
              ${icon("download")}
            </button>
            <button class="icon-btn js-search-btn" aria-label="食べたものを探す">${icon("search")}</button>
            <button class="icon-btn js-cal-btn" aria-pressed="true"></button>
          </div>
        </header>

        ${/* ほかの三画面と同じバーです。題の裏に隠してあって、少し下へ
              引くと出てきます（ui.js の parkSearch）。探す先だけが違って、
              ここは**食べたもの**——「あの日、何食べたっけ」に答えます。 */""}
        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="食べたものを探す" aria-label="食べたものを探す"
                   autocomplete="off" spellcheck="false">
            <button class="icon-btn js-search-clear" aria-label="検索をクリア"
                    style="width:28px;height:28px" hidden>${icon("close")}</button>
          </div>
        </div>

        <div class="js-body"></div>
      </div>
    `);
    root.append(chrome);

    els = {
      dayTitle: chrome.querySelector(".js-day-title"),
      body: chrome.querySelector(".js-body"),
      sync: chrome.querySelector(".js-sync"),
      topbar: chrome.querySelector(".topbar"),
      screen: root,
      searchBtn: chrome.querySelector(".js-search-btn"),
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search: chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
    };

    els.sync.addEventListener("click", openSyncSheet);

    /* 題を押すと、暦が月ぜんぶに開きます（やること・daily の「›」と同じ）。
       題は上のバーにいるので、結ぶのは組み立てのとき一度きりです。 */
    els.dayTitle.addEventListener("click", () => {
      KN.motion.fire("select");
      store.setCalPref("diet", { open: !calOpen() });
    });

    /* 暦を出すか、しまうか。**題の右**に置きます——暦そのものの中に
       ボタンを置くと、しまった先にボタンごと消えて戻れなくなります。
       しまっているあいだは、同じ暦に斜線の入った絵に変わります。 */
    const calBtn = chrome.querySelector(".js-cal-btn");
    if (calBtn) {
      paintCalBtn(calBtn);
      calBtn.addEventListener("click", () => {
        KN.motion.fire("select", calBtn);
        store.setCalPref("diet", { shown: !calShown() });
        paintCalBtn(calBtn);
        render();
      });
    }
    KN.ui.wireSearch(els, () => render(), (q) => { query = q; });

    /* カレンダーは貼りつけません（やることのタブとはそこだけ違います）。
       紙のいちばん上に印刷してあるものとして、スクロールで一緒に流れます。 */
    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });

    wireKeyboardScroll();
  }

  /* ---------------- 入力欄がキーボードに隠れないように ----------------

     食事の四枠は、シートの中ではなく画面にじかに置いています。シートは
     自分の可視高さを持っていて、フォーカスした欄を scrollIntoView で
     戻せますが（ui.js）、この画面でそれをやると「文書ぜんぶに見せて」と
     頼んでしまい、ノッチのタップ用の1px（app.js）を巻き込みます。
     なので、この画面自身の scrollTop を、手で計算して動かします。

     動かすのは**足りないぶんだけ**です。欄の下端がキーボードの上に
     ちょうど乗る、その一点まで。決め打ちの待ち時間で何度も測り直すと、
     可視領域がまだ動いている途中の値をつかんで、二度・三度と重ねて
     動かしてしまいます（それが「大きく揺れる」の正体でした）。
     いまは **可視領域が実際に変わったとき** だけ測り直し、すでに
     ほぼ同じ行き先なら黙って何もしません。 */
  let kbScrollBase = null;   // ずらす前の位置。キーボードが閉じたら、ここへ戻します。
  let kbTarget = null;       // 直前に動かした先（同じ先には、もう一度動かしません）。
  let kbField = null;        // いま追っている欄。
  let kbMoved = false;       // **こちらが**動かしたか。ブラウザが動かしたぶんは戻しません。

  const KB_MARGIN = 10;      // 欄の下端と、可視領域の下端のあいだに残す、最小限のすきま。

  /** 欄がキーボードに隠れているぶんだけ、画面を持ち上げます。隠れていなければ何もしません。 */
  function nudgeIntoView(field) {
    if (!root || document.activeElement !== field) return;
    const appEl = document.getElementById("app");
    const visibleBottom = (appEl ? appEl.getBoundingClientRect().bottom : window.innerHeight) - KB_MARGIN;
    const over = field.getBoundingClientRect().bottom - visibleBottom;

    /* 足りないぶんだけ持ち上げる——だけでなく、**行きすぎたぶんは戻します**。

       欄に触れると、ブラウザ自身も「見えるところへ」動かします。ところが
       その動きは必要最小限とは限らず、実際この画面では必要な548に対して
       732まで送っていました（欄が真ん中あたりに来る位置）。こちらは
       「もう見えている」と判断して何もしないので、行きすぎがそのまま
       残ります——押した欄が画面のずっと上のほうへ飛んだように見えます。

       上へ戻すのは、**始めた位置より上には行かない**範囲だけです。
       そこから先は、その人が自分で見ていた場所なので。 */
    const SLACK = 24;            // これ以内の行きすぎは、直しません（揺り戻しに見えるので）
    if (over <= 2 && !(kbScrollBase != null && over < -SLACK
                       && root.scrollTop > kbScrollBase)) return;
    const want = root.scrollTop + over;
    const target = Math.round(kbScrollBase != null ? Math.max(kbScrollBase, want) : want);
    if (Math.abs(target - root.scrollTop) < 3) return;
    if (kbTarget != null && Math.abs(target - kbTarget) < 3) return;   // ほぼ同じ先へは、動かし直さない
    kbTarget = target;
    kbMoved = true;
    KN.app.glideTo(root, target);
  }

  function armKeyboardFollow(field) {
    if (!root) return;
    /* フォーカスした瞬間、ブラウザが「見えるところに置く」ため自分で
       スクロールを一度動かすことがあります（フォーカスの仕様の一部で、
       focusin より先に効きます）。こちらの計算はキーボードぶんの
       すきまを見た**必要最小限**のはずなのに、ブラウザの分がその上に
       乗ると、合計では「大きく動いた」ように見えてしまいます。
       指を置いた時点（pointerdown、下の wireKeyboardScroll）の位置を
       覚えておき、ここで一度そこへ戻してから、こちらの計算だけを
       乗せます——動くのはこちらの分だけになります。 */
    /* ブラウザ自身のスクロールを**巻き戻しません**。
       ここにはかつて `root.scrollTop = kbScrollBase` がありました。こちらの
       計算を「必要最小限」に保つための巻き戻しでしたが、画面の上では

         ブラウザが欄を見せようと動かす → こちらが元に戻す → こちらが動かし直す

       の三手が続けて起き、「一度上に動いてから戻ってくる」に見えます。
       （二度指摘されたのはこれです。）

       巻き戻しは要りません。nudgeIntoView は欄の**いまの位置**を測って
       足りないぶんだけ動かすので、ブラウザが先に動かしていれば、その状態から
       測って「もう見えている」と判断するだけです。動きは一度で済みます。 */
    if (kbScrollBase == null) kbScrollBase = root.scrollTop;
    kbField = field;
    kbTarget = null;
    /* ここではまだ動かしません。キーボードがこれから出る（＝可視領域が
       これから縮む）ところなら、いま測っても出はじめの中途半端な高さを
       つかむだけです。それで一度動かし、キーボードが出終わってから
       正しい高さでもう一度動かすと、「動いてから、また動く」という
       いちばん避けたい二段の動きになります。

       実際に可視領域が変わった瞬間（下の visualViewport）にだけ、
       そこで初めて測って動かします——例外は、キーボードがもう出ている
       とき（他の欄から続けて打っている）です。そのときは可視領域は
       これ以上動かないので、ここで測ってすぐ合わせます。 */
    if (document.documentElement.classList.contains("kb-open")) nudgeIntoView(field);
  }

  function wireKeyboardScroll() {
    /* 指を置いた時点の位置を、いちばん早いところで覚えておきます
       （タップ→フォーカス→ブラウザ自身のスクロール、の一番手前）。 */
    root.addEventListener("pointerdown", (e) => {
      const field = e.target.closest && e.target.closest("input, textarea, select");
      if (field && kbScrollBase == null) kbScrollBase = root.scrollTop;
    }, true);
    root.addEventListener("focusin", (e) => {
      const field = e.target.closest && e.target.closest("input, textarea, select");
      if (field) armKeyboardFollow(field);
    });
    root.addEventListener("focusout", () => {
      // 少し待って、移った先も入力欄かどうかを見ます（欄から欄への移動では戻さない）。
      setTimeout(() => {
        if (kbScrollBase == null) return;
        const active = document.activeElement;
        const stillTyping = active && root.contains(active) && active.matches("input, textarea, select");
        if (stillTyping) return;
        /* **動いたぶんは、誰が動かしたのであれ戻します。**

           ここは長らく「こちらが動かしたときだけ」でした。ところが実際に
           動かしているのはたいていブラウザのほうで（欄に触れた時点で自分で
           送ります）、こちらは何もしていない。結果、打ち終えて閉じても
           画面は送られたままで、見ていた場所は自分で探し直しでした。

           誰が動かしたかは、その人には関係のない話です。触れる前に見て
           いた場所へ、静かに戻します。 */
        if (Math.abs(root.scrollTop - kbScrollBase) > 2) KN.app.glideTo(root, kbScrollBase);
        kbScrollBase = null; kbTarget = null; kbField = null; kbMoved = false;
      }, 80);
    });
    /* キーボードの出入りは、可視領域（visualViewport）をその**過程で
       何度も**動かします（一段飛びではなく、じわじわ縮む・じわじわ
       広がる）。その途中の値を追いかけて何度も補正すると、それ自体が
       「動いては、また動く」に見えてしまうので、ここは動きが止まって
       からの**一回だけ**にします——最後の変化から120ms、何も起きなければ
       「落ち着いた」とみなします。 */
    const vv = window.visualViewport;
    if (vv) {
      let t = 0;
      const onChange = () => {
        clearTimeout(t);
        t = setTimeout(() => { if (kbField) nudgeIntoView(kbField); }, 120);
      };
      vv.addEventListener("resize", onChange);
      vv.addEventListener("scroll", onChange);
    }
  }

  /**
   * その日の紙を、まるごと一枚。カルーセルの三枚（前日・今日・翌日）は
   * どれもこれで作ります——要約ではなく本物なので、隣の日を払っている
   * あいだも、止まったときと同じ中身が見えます。
   *
   * peek（前日・翌日側）は inert にします。指はカルーセルの外枠が
   * 引き受けるので、紙そのものは押せなくてかまいません——押せるままだと
   * 消えていく紙のボタンやテキストエリアにフォーカスが残ることがあります。
   */
  function buildDaySlide(day, opts) {
    const peek = !!(opts && opts.peek);
    const card = (opts && opts.card) || D.dayCard(day);
    // range === 0 は「全部」。365で丸めると、グラフ本体（chart()）は
    // 全期間を描くのに、隣の前回比・7日平均などのサマリーだけ直近365日に
    // 切り詰まってしまうので、ここだけ別に大きく取ります
    // （chart() 側の daysBetween と同じ上限=4000日）。
    const win = range === 0 ? 4000 : Math.max(range, 30);
    const sum = (opts && opts.sum) || D.weightSummary(win, day);
    const slide = node(html`
      <section class="card diet-day ${peek ? "is-peek" : "js-day-card"}" data-day="${day}">
        <div class="diet-block is-body js-body-stats"></div>
        <div class="diet-block is-meal js-meals"></div>
        <div class="diet-block is-weight js-today"></div>
      </section>
    `);
    renderBodyStats(slide.querySelector(".js-body-stats"), card);
    renderMeals(slide.querySelector(".js-meals"), card, { peek });
    renderToday(slide.querySelector(".js-today"), card, sum, opts && opts.chartEl);
    if (peek) slide.inert = true;
    return slide;
  }

  /* ---------------- 見つかった日を並べる ----------------

     ここで探しているのは「言葉」ではなく「日」です。「唐揚げ」と打つ人は
     文そのものではなく、**唐揚げを食べた日**を探しています。だから答えは
     日付の一覧で、押せばその日の紙へ跳びます（跳んだら探すのはやめます
     ——行き先に着いたら、地図はしまうものなので）。 */
  function renderFound() {
    const found = store.searchDietDays(query);
    els.body.innerHTML = "";
    /* 見つかった数は、結果のすぐ上に。上のバーに出していましたが、そこは
       いま見ている日の題の場所になりました——探しているあいだは日を見て
       いないので、題のところに数を置くと、二つが同じ場所で入れ替わります。 */
    if (found.length) {
      els.body.append(node(html`<p class="diet-found-n">${found.length}日 見つかりました</p>`));
    }

    if (!found.length) {
      els.body.append(node(html`
        <section class="card section">
          <p class="arc-log-empty">見つかりませんでした。</p>
        </section>
      `));
      return;
    }

    const list = node(html`<section class="card section diet-found"></section>`);
    found.slice(0, 60).forEach((f) => {
      const dt = U.dayDate(f.day);
      const slots = f.slots
        .map((id) => (SLOTS.find((s) => s.id === id) || {}).short || "メモ")
        .join("・");
      const row = node(html`
        <button type="button" class="arc-log-row diet-found-row" data-day="${f.day}">
          <span class="arc-log-day">
            <b>${String(dt ? dt.getDate() : "")}</b>
            <i>${dt ? U.weekdayJa(f.day) : ""}</i>
          </span>
          <span class="arc-log-text">
            <span class="arc-log-memo">${f.text.join(" ／ ")}</span>
            <span class="arc-log-times">${U.formatDate(f.day)}${slots ? " ・ " + slots : ""}</span>
          </span>
        </button>
      `);
      row.addEventListener("click", () => {
        viewDay = f.day === U.todayKey() ? null : f.day;
        calMonth = null;
        els.search.value = "";
        els.searchClear.hidden = true;
        query = "";
        KN.motion.fire("select");
        render();
        if (root) root.scrollTop = 0;
      });
      list.append(row);
    });
    if (found.length > 60) {
      list.append(node(html`<p class="arc-log-empty">ほかにも ${String(found.length - 60)}日 あります。</p>`));
    }
    els.body.append(list);
  }

  function render() {
    // 食事の四枠を保存した直後は、組み直しません（上の saving を参照）。
    if (saving) return;
    // 指でカルーセルを払っているあいだも、組み直しません（上の dragging を参照）。
    if (dragging) return;
    /* 食事の四枠は打った先から保存しますが、最後の一拍が残っている
       ことがあります。組み直す前に落とします（消える書きかけを
       作らないため）。 */
    flushSlots();
    flushSlots = () => {};
    const keepTop = root ? root.scrollTop : 0;
    // 探しているあいだは、その日の紙のかわりに、見つかった日を並べます。
    if (query.trim()) { renderFound(); return; }
    const day = curDay();
    const card = D.dayCard(day);
    // range === 0 は「全部」。365で丸めると、グラフ本体（chart()）は
    // 全期間を描くのに、隣の前回比・7日平均などのサマリーだけ直近365日に
    // 切り詰まってしまうので、ここだけ別に大きく取ります
    // （chart() 側の daysBetween と同じ上限=4000日）。
    const win = range === 0 ? 4000 : Math.max(range, 30);
    // 上の枠はその日の話、下の「目標」はいまの話。
    const sum = D.weightSummary(win, day);
    const now = isViewToday() ? sum : D.weightSummary(win);

    /* 日付は暦と、その日の紙の見出しが持っています。題の下でもう一度
       言う必要はありません（「さがす」の結果だけは、ここに出します）。 */
    els.body.innerHTML = "";
    els.cal = monthCalendar();
    els.body.append(els.cal);
    /* その日の話は、一枚の紙にまとめます。からだ・食事・体重は
       別々の話ではなく、同じ一日の三つの面なので——横に払って日を
       めくるときも、三つが**一緒に**流れたほうが「日が変わった」と読めます。
       区切りは線ではなく地の色で。線は「別のもの」と言いますが、
       ここで言いたいのは「同じ一日の、別の面」です。 */
    /* 暦から下は、掴める一枚として扱います（やること・daily と同じ）。
       ここは白い紙にしません——中の「今日のからだ」がすでに端から端まで
       の面を持っていて、その上にもう一枚白を敷くと、面が二重になります。
       出すのは掴み手だけ。**下へ引けば暦が月ぜんぶまで開き**、掴み手から
       上へ押せば週へ戻ります。 */
    const sheet = node(html`
      <div class="tl-sheet is-bare"><span class="tl-grip" aria-hidden="true"><i></i></span></div>
    `);
    els.body.append(sheet);
    wireCalPull(sheet);
    /* 紙を下へ引くと暦が出てくるので、そのぶん「引いて更新」は紙の上では
       使えません。閉じているあいだだけ譲ってもらいます。 */
    if (calShown() && !calOpen()) sheet.setAttribute("data-pull-own", "cal");

    sheet.append(node(html`
      <div class="diet">
        ${/* 前日・翌日の紙も、あらかじめ本物として並べておきます
              （js-track に横一列で三枚）。要約ではなく、その日の紙その
              ものです——払いはじめた瞬間から、指のぶんだけ連続して
              入ってくるように。既定は translateX(-100%) で真ん中の
              紙（今日）を映し、動かすのは wireDaySwipe が引き受けます。 */""}
        <div class="diet-carousel js-carousel">
          <div class="diet-carousel-track js-track"></div>
        </div>
        <section class="card section diet-look">
          <div class="js-insight"></div>
          <div class="divider"></div>
          <div class="js-goal"></div>
        </section>
      </div>
    `));

    // 三枚とも同じ体重グラフ（どの日を見ているかには依存しない）なので、
    // 一度だけ作って、残り二枚には複製を渡します。
    const sharedChart = chart();
    const track = els.body.querySelector(".js-track");
    track.append(
      buildDaySlide(U.shiftDay(day, -1), { peek: true, chartEl: sharedChart.cloneNode(true) }),
      buildDaySlide(day, { peek: false, card, sum, chartEl: sharedChart }),
      buildDaySlide(U.shiftDay(day, 1), { peek: true, chartEl: sharedChart.cloneNode(true) }),
    );

    /* 「気づいたこと」は、出すと決めた人にだけ出します（設定 → ダイエット）。
       枠ごと消すので、目標だけが残ったときに上の仕切り線が浮きません。 */
    const showInsight = store.get().settings.showInsight === true;
    const lookCard = els.body.querySelector(".diet-look");
    if (showInsight) renderInsight(els.body.querySelector(".js-insight"));
    else if (lookCard) {
      lookCard.querySelector(".js-insight").remove();
      const rule = lookCard.querySelector(".divider");
      if (rule) rule.remove();
    }
    renderGoal(els.body.querySelector(".js-goal"), now);

    /* その日の紙は、横に払えば日をめくれます。カレンダーまで手を
       伸ばさずに、昨日・一昨日と辿れるように。 */
    wireDaySwipe(track, els.body.querySelector(".js-carousel"));

    /* 輪は、並んでから置きます。組み立て中はまだ幅が無く、どこにも
       置けません（測れないので）。ここは組み直しなので、滑らせません。 */
    placeRing(true);

    if (root && keepTop) {
      root.scrollTop = Math.min(keepTop, Math.max(0, root.scrollHeight - root.clientHeight));
    }
  }

  /* ---------------- カレンダー ----------------

     やることのタブと同じ月の顔です（見た目のCSSはそのまま使い回します）。
     違うのは押したあと——あちらは棚まで運びますが、こちらは**その日の
     記録に画面ごと切り替わります**。過去の日も、今日と同じように書けます。

     やることの側の実装をそのまま持ってこなかったのは、あれが棚の並びや
     スクロール追従と編み込まれているからです。ここで要るのは、月をめくる
     ことと、日を選ぶことだけ。 */

  let calMonth = null;                 // {year, month}、null は「今日の月」

  /* カレンダーを月ぜんぶ出すか、いまの週だけに畳むか。
     既定は週です——月の顔は画面の36%（306px）を使って、日付31個と点数個しか
     運んでいませんでした。畳めば、その日の記録が最初の画面に入ります。
     月の顔が要るときは押せば開き、その選択は覚えます（設定に持ちます）。

     畳んでもマスは**ぜんぶ組んで**あります。隠すだけなので、開くのに
     組み直しは要らず、輪の位置も測り直さずに済みます。 */
  const calOpen = () => store.calPrefs("diet").open;
  const calShown = () => store.calPrefs("diet").shown;

  /** 題の右の暦ボタン。出しているかどうかで、絵と読み上げが変わります。 */
  function paintCalBtn(btn) {
    const on = calShown();
    btn.innerHTML = icon(on ? "calendar" : "calendar-off");
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "暦をしまう" : "暦を出す");
    btn.setAttribute("title", on ? "暦をしまう" : "暦を出す");
  }

  /** いま出している週だけを残して、ほかのマスに印を付けます。 */
  function markWeek(sec, here) {
    const open = calOpen();
    const shown = calShown();
    sec.classList.toggle("is-week", !open);
    sec.classList.toggle("is-hidden", !shown);
    /* 「どれだけ開いているか」を一つの数（0＝週、1＝月）で持ちます。題の
       右の「›」の傾きも、隣の週の濃さも、これを見て決まります（やること・
       daily と同じ）。 */
    if (root) root.style.setProperty("--cal-p", open ? "1" : "0");
    /* 「週／月」の札はここにありました。題（日付）を押す形に移したので、
       塗るものはもうありません。 */
    paintDayTitle();
    if (open) {
      sec.querySelectorAll(".is-off-week").forEach((c) => c.classList.remove("is-off-week"));
      return;
    }
    tagOffWeek(sec, here);
  }

  /** いまの週の外にあるマスに印を付けます。週で見ているときは CSS が隠し、
      指で引いているあいだは、その印が「濃さ」の目印になります。 */
  function tagOffWeek(sec, here) {
    /* 選んでいる日が、いま出している月に無いことがあります（先の月を
       覗いているとき）。そのときはその月の頭の週を出します——空っぽの
       週を出すよりは、行き先のある週のほうが役に立ちます。 */
    const first = sec.querySelector(".cal-day");
    const hasHere = !!sec.querySelector(`.cal-day[data-day="${here}"]`);
    const anchor = hasHere ? here : (first ? first.dataset.day : here);
    const w = U.weekOf(anchor);
    sec.querySelectorAll(".cal-day").forEach((c) => {
      const k = c.dataset.day;
      c.classList.toggle("is-off-week", k < w.from || k > w.to);
    });
    // 月の頭の空きマスは、その週を出しているときだけ残します。
    const padsOn = !!first && first.dataset.day >= w.from && first.dataset.day <= w.to;
    sec.querySelectorAll(".cal-pad").forEach((c) => c.classList.toggle("is-off-week", !padsOn));
  }

  /** 画面の題に、いま見ている日を書きます（やること・daily と同じ組み）。 */
  function paintDayTitle() {
    if (!els.dayTitle || !els.dayTitle.isConnected) return;
    const d = U.dayDate(curDay());
    if (!d || isNaN(d.getTime())) return;
    els.dayTitle.querySelector(".day-y").textContent = String(d.getFullYear());
    els.dayTitle.querySelector(".day-md").textContent = `年${d.getMonth() + 1}月${d.getDate()}日`;
    els.dayTitle.setAttribute("aria-expanded", String(calOpen()));
    els.dayTitle.setAttribute("aria-label",
      `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日。押すと暦を${calOpen() ? "たたむ" : "ひらく"}`);
  }

  /* ---------------- 紙を下に引くと、月が出てくる ----------------

     やること・daily と同じ仕掛けです（js/cal-peek.js）。ここが答えるのは
     「この画面では何が『いま見ている日』か」「いつ引いてよいか」だけ。 */
  function wireCalPull(el) {
    KN.calPeek.wire({
      sheet: el,
      root,
      cal: () => els.cal,
      isOpen: calOpen,
      // 探している最中と、暦をしまっているときは引きません。
      enabled: () => !query.trim() && calShown(),
      here: () => curDay(),
      tagOffWeek,
      commit: (open) => {
        if (open !== calOpen()) store.setCalPref("diet", { open });
        else markWeek(els.cal, curDay());
      },
    });
  }

  function shownMonth() {
    if (calMonth) return calMonth;
    const d = U.dayDate(curDay()) || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  /* その日の帯。出すのは**飲酒**だけにしました。

     「体重を書いた」「食事を書いた」は、カレンダーで見たいことでは
     ありません（開けば分かります）。カレンダーで見たいのは**流れ**——
     休肝日が続いているか、続けて飲んだ日があるか。

     長さはその日の量（目安に対する割合）、色はその意味。飲まなかった日は
     青、目安の内なら緑、超えた日は赤。何も書いていない日は出しません
     ——使う前の日々が「飲んでいない日」として青く並ぶのは、記録ではなく
     作り話です。 */
  function drinkBar(d) {
    const t = store.drinkTotals(d);
    if (!t) {
      /* 今日の、まだ夕方前は、まだ何も言えません。歩数が入っただけで
         「休肝日」の青い帯が朝から立つと、暦がその日を先に採点します
         （輪のほうと同じ直し——renderBodyStats の drinkPending 参照）。 */
      if (d === U.todayKey() && U.partOfTime(U.nowTime()) !== "night") return null;
      // 何かしら書いてある日だけ、「飲まなかった」と言えます。
      const any = store.weightOfDay(d) || store.mealsOfDay(d).length
        || store.healthValue(d, "steps") != null || store.healthValue(d, "sleep") != null;
      return any ? { kind: "dry", pct: 100, g: 0 } : null;
    }
    const pct = Math.round((t.alcoholG / alcoholGuide()) * 100);
    return { kind: pct > 100 ? "over" : "ok", pct: Math.max(6, Math.min(100, pct)), g: t.alcoholG };
  }

  function monthCalendar() {
    const sec = node(html`<section class="cal"></section>`);
    /* 三層（曜日の行／伸び縮みする窓／その中のずらしと日のマス）は
       cal-peek.js が組みます。やること・daily の暦と同じものです。 */
    const grid = KN.calPeek.mount(sec).grid;
    sec.append(node(html`<button type="button" class="cal-now js-now" hidden>今日へ</button>`));

    /* ‹ › の刻みは、出しているものに合わせます——週だけ出しているときに
       月ごと飛ぶと、押した先に自分の週が無くなります。 */
    const goTo = (delta) => {
      KN.motion.fire("nav");
      if (!calOpen()) {
        const next = U.shiftDay(curDay(), delta * 7);
        if (next > U.todayKey()) return;        // 先の日は見に行きません
        viewDay = next === U.todayKey() ? null : next;
        const d = U.dayDate(next);
        calMonth = { year: d.getFullYear(), month: d.getMonth() };
        render();
        return;
      }
      const m = shownMonth();
      const d = new Date(m.year, m.month + delta, 1);
      calMonth = { year: d.getFullYear(), month: d.getMonth() };
      fillCalendar(sec);
    };
    sec.querySelector(".js-now").addEventListener("click", () => {
      KN.motion.fire("nav");
      calMonth = null;
      viewDay = null;
      render();
    });

    wireMonthSwipe(sec, grid, goTo);
    fillCalendar(sec);
    return sec;
  }

  /* ---------------- 選んでいる日の輪 ----------------

     輪は枠ごとに描かず、一つだけ置いて滑らせます。日を押したとき、
     消えて別の場所に現れるのではなく、**そこまで動いて**ほしいので。
     月をめくったときや、画面を組み直したときは滑らせません（前にいた
     場所と関係のないところから飛んでくるため）。 */
  function moveRing(grid, cell, jump) {
    if (!grid) return;
    let ring = grid.querySelector(".cal-ring");
    if (!ring) {
      ring = node(html`<i class="cal-ring is-jump" aria-hidden="true"></i>`);
      grid.prepend(ring);
    }
    if (!cell) { ring.classList.remove("is-on"); return; }
    const n = cell.querySelector(".cal-n");
    if (!n) return;
    const g = grid.getBoundingClientRect();
    const b = n.getBoundingClientRect();
    if (!g.width || !b.width) return;              // まだ並んでいない
    const first = !ring.classList.contains("is-on");
    ring.classList.toggle("is-jump", !!jump || first);
    ring.style.transform = `translate(${(b.left - g.left).toFixed(1)}px, ${(b.top - g.top).toFixed(1)}px)`;
    ring.classList.add("is-on");
    if (jump || first) {
      // 次からは滑らせます（描き直した直後の一回だけ跳ばせたいので）。
      requestAnimationFrame(() => requestAnimationFrame(() => ring.classList.remove("is-jump")));
    }
  }

  /** いま見ている日へ、輪を置きます。 */
  function placeRing(jump) {
    if (!els.cal) return;
    moveRing(els.cal.querySelector(".cal-grid"),
      els.cal.querySelector(".cal-day.is-here"), jump);
  }

  /* 隣の月のマス。週で見るときだけ姿を見せます（月で見るあいだは CSS が
     伏せるので、月の見た目はこれまでどおり）。押せば、その日へ移ります。 */
  function outCell(key) {
    const d = U.dayDate(key);
    const wd = d ? d.getDay() : 0;
    const cell = node(html`
      <button class="cal-day is-out ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
              data-day="${key}" tabindex="-1"
              aria-label="${d ? `${d.getMonth() + 1}月${d.getDate()}日` : key}">
        <span class="cal-n">${d ? String(d.getDate()) : ""}</span>
        <span class="cal-dots"></span>
      </button>
    `);
    cell.addEventListener("click", () => {
      viewDay = key === U.todayKey() ? null : key;
      const on = U.dayDate(key);
      if (on) calMonth = { year: on.getFullYear(), month: on.getMonth() };
      KN.motion.fire("select");
      render();
    });
    return cell;
  }

  function fillCalendar(sec) {
    const today = U.todayKey();
    const here = curDay();
    const now = U.dayDate(today);
    const { year, month } = shownMonth();
    const thisMonth = year === now.getFullYear() && month === now.getMonth();
    const total = new Date(year, month + 1, 0).getDate();
    const lead = new Date(year, month, 1).getDay();

    sec.setAttribute("aria-label", `${year}年${month + 1}月`);
    sec.querySelector(".js-now").hidden = thisMonth && here === today;

    const grid = sec.querySelector(".cal-grid");
    grid.innerHTML = "";
    /* 曜日の行は、日のマスとは別の入れ物です——暦を引いて伸ばすとき、
       動くのは日のマスだけで、曜日はここに留まります。 */
    const wds = sec.querySelector(".cal-wds");
    wds.innerHTML = "";
    U.WEEKDAYS.forEach((w, i) => wds.append(node(html`
      <span class="cal-wd ${i === 0 ? "is-sun" : (i === 6 ? "is-sat" : "")}">${w}</span>
    `)));
    /* 週は月をまたぎます。7日そろいにするため、隣の月の日も本物のマスと
       して置きます（月で見ているあいだは CSS が伏せるので、月の見た目は
       これまでどおり）。押せば、その日へ行けます。 */
    const outer = U.outDays(year, month);
    outer.lead.forEach((key) => grid.append(outCell(key)));

    for (let d = 1; d <= total; d++) {
      const key = U.dayKey(new Date(year, month, d));
      const wd = (lead + d - 1) % 7;
      const isToday = key === today;
      /* 先の日には帯を出しません（記録は過去にしか無いので）。 */
      const bar = key > today ? null : drinkBar(key);
      const cell = node(html`
        <button class="cal-day ${isToday ? "is-today" : ""} ${key === here ? "is-here" : ""}
                       ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
                data-day="${key}" ${isToday ? KN.util.raw('aria-current="date"') : ""}
                aria-label="${month + 1}月${d}日${isToday ? "（今日）" : ""}${
                  bar ? (bar.kind === "dry" ? " 飲酒なし" : ` 純アルコール${bar.g}g`) : ""}">
          <span class="cal-n">${String(d)}</span>
          <span class="cal-dots">${bar
            ? KN.util.raw(`<span class="cal-bar"><i class="is-${bar.kind}" style="width:${bar.pct}%"></i></span>`)
            : ""}</span>
        </button>
      `);
      cell.addEventListener("click", () => {
        viewDay = key === today ? null : key;
        calMonth = { year, month };
        KN.motion.fire("select");
        /* 先に輪だけ動かします。組み直しのあとに置き直すと、そのときには
           もう新しい枠なので、輪は滑らずに現れることになります。 */
        moveRing(grid, cell);
        render();
      });
      grid.append(cell);
    }
    outer.trail.forEach((key) => grid.append(outCell(key)));
    // 隠すぶんを先に決めます——輪は並んだ位置から測るので、隠したあとで。
    markWeek(sec, here);
    // 描いたあとに、選んでいる日へ置きます（並んでいないと測れません）。
    moveRing(grid, grid.querySelector(".cal-day.is-here"), true);
  }

  /* ---------------- 横に払って、日をめくる ----------------

     カレンダーで選べますが、「昨日はどうだったか」を見るのに毎回上まで
     戻るのは遠い。その日のことが書いてある枠そのものを払えば、日が動きます。
     左へ払えば次の日、右へ払えば前の日——紙をめくる向きと同じです。

     前日・今日・翌日の三枚を、最初から横一列に並べておきます（js-track、
     render() が組みます）。動かすのはこの track の transform だけ——
     ドラッグした量そのままに、隣の紙が右（または左）から連続して
     入ってきます。要約ではなく本物の紙なので、止まった瞬間もいちばん
     払っている最中も、同じ中身が見えます。

     縦は下に譲ります——画面ぜんぶがスクロールするので、向きは最初の
     数ピクセルで決めて、そのまま最後まで持ちます。「少し動かしただけで
     隣へ行ける」を優先し、判定も動く量もどちらも軽くしてあります。 */
  function wireDaySwipe(track, viewport) {
    if (!track || !viewport) return;
    const AXIS_LOCK = 5;     // これだけ動けば、向きを決めます（前は8px）
    const COMMIT = 26;       // これだけ動けば、指を離したときに隣へ（前は56px）
    let id = null, x0 = 0, y0 = 0, dx = 0, axis = null, frame = 0, pageW = 0;
    let lastT = 0, lastX = 0, vx = 0;

    /* transform だけを書き換えます（レイアウトに触れる幅・高さ・
       位置は一切読み書きしません）。frame は rAF の間引き用で、
       一度のフレームに一回しか描かないぶん、指の動きより先に
       追いつくことはあっても、遅れて溜まることはありません。 */
    const paint = () => {
      frame = 0;
      track.style.transform = `translate3d(${-pageW + dx}px,0,0)`;
    };
    /** 三枚のうち、どれを画面いっぱいに見せて止まるか。0=前日 1=今日 2=翌日 */
    const settle = (index) => new Promise((resolve) => {
      track.style.transition = "transform .2s var(--ease-out)";
      track.style.transform = `translate3d(${-pageW * index}px,0,0)`;
      setTimeout(() => {
        track.style.transition = "";
        /* 真ん中（＝いま見ている日）に戻るときは、px の値を残さず、
           CSSの既定（-100%）に戻します。動いていない素の状態と、
           見分けが付かなくなるように。日をめくる側（0/2）は、この
           あとすぐ render() が紙を丸ごと差し替えるので、そのままで
           かまいません。 */
        if (index === 1) { track.style.transform = ""; track.classList.remove("is-dragging"); }
        resolve();
      }, 200);
    });

    viewport.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // 中の押せるものは、押せるままにします。
      if (e.target.closest("input, textarea, select")) return;
      pageW = viewport.getBoundingClientRect().width;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null;
      lastT = performance.now(); lastX = e.clientX; vx = 0;
      track.style.transition = "";
    }, { passive: true });
    viewport.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!axis) {
        if (Math.abs(mx) < AXIS_LOCK && Math.abs(my) < AXIS_LOCK) return;
        /* 横をやや優先します——完全に水平でなくても、斜めの払いは
           たいてい横のつもりです。真上・真下に近い動きだけ縦に譲ります。 */
        axis = Math.abs(mx) >= Math.abs(my) * 0.85 ? "x" : "y";
        /* 横だと決まってから初めて捕まえます。ボタンをただ押しただけの
           指まで捕まえると、そのボタンの click が届かなくなるので。 */
        if (axis === "x") {
          try { viewport.setPointerCapture(id); } catch (err) { /* Safari だと投げることがあります */ }
          /* ここから指が離れるまで、render() を止めます（30秒ごとの
             見直しや自動同期など、指と関係の無い理由で store が動いても、
             掴んでいる紙が組み直されないように）。will-change は、
             合成レイヤーへの昇格をドラッグの最初の一拍で終わらせておく
             ためのものなので、動いている間だけ付けます。 */
          dragging = true;
          track.classList.add("is-dragging");
        }
      }
      if (axis !== "x") return;
      const now = performance.now();
      if (now > lastT) { vx = (e.clientX - lastX) / (now - lastT); lastT = now; lastX = e.clientX; }
      /* 今日より先には行けないので、そちら向きだけ重くします。それ以外は
         指と1:1で追わせます。 */
      const blocked = mx < 0 && isViewToday();
      dx = blocked ? mx * 0.3 : mx;
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: true });
    const end = async (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      const moved = dx;
      id = null; axis = null;
      /* 縦の払い（や、動かなかったタップ）は、横には何も触れていません。
         ここで settle を呼ぶと、動いてもいない track に一瞬だけ
         translate を乗せてしまいます（すぐ消えるとはいえ、それを
         見るテストや目には「動いた」に映ります）。横だと決まった
         ときだけ、この先の判定に進みます。 */
      if (!wasX) return;
      /* 短い距離でも、速い払い（フリック）なら隣へ。「軽い操作感」を
         優先し、フリックの基準もゆるめにしてあります。 */
      const fling = Math.abs(vx) > 0.35 && Math.abs(moved) >= 8;
      if (Math.abs(moved) < COMMIT && !fling) { await settle(1); dragging = false; return; }
      const next = U.shiftDay(curDay(), moved < 0 ? 1 : -1);
      if (next > U.todayKey()) { await settle(1); dragging = false; return; }
      KN.motion.fire("nav");
      await settle(moved < 0 ? 2 : 0);
      /* 滑りきった、その位置のまま次へ渡します。viewDay を変えてから
         render() で三枚を組み直すと、真ん中（今日）はいま画面いっぱいに
         見えているのと同じ日になるので、見た目の続きが切れません。
         render() 自身が dragging を見て止めてしまわないよう、呼ぶ前に
         下ろします。 */
      dragging = false;
      viewDay = next === U.todayKey() ? null : next;
      const d = U.dayDate(next);
      calMonth = { year: d.getFullYear(), month: d.getMonth() };
      render();
    };
    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      id = null; axis = null;
      if (!wasX) return;
      settle(1).then(() => { dragging = false; });
    });
  }

  /* 払うと月がめくれます。縦は下のカードのスクロールに譲ります——
     向きは最初の数ピクセルで決めて、そのまま最後まで持ちます。 */
  function wireMonthSwipe(sec, grid, goTo) {
    const THRESHOLD = 52;
    let id = null, x0 = 0, y0 = 0, dx = 0, axis = null, frame = 0;

    const paint = () => {
      frame = 0;
      grid.style.transform = dx ? `translateX(${dx}px)` : "";
      grid.style.opacity = dx ? String(Math.max(.35, 1 - Math.abs(dx) / 260)) : "";
    };
    const reset = () => {
      grid.style.transition = "transform .22s var(--ease-out), opacity .22s";
      dx = 0;
      paint();
      setTimeout(() => { grid.style.transition = ""; }, 240);
    };

    sec.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest("button.cal-arrow, button.cal-now")) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null;
      grid.style.transition = "";
    });
    sec.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!axis) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
        if (axis === "x") sec.setPointerCapture(id);
      }
      if (axis !== "x") return;
      e.preventDefault();
      dx = Math.abs(mx) <= THRESHOLD ? mx : Math.sign(mx) * (THRESHOLD + (Math.abs(mx) - THRESHOLD) * .3);
      if (!frame) frame = requestAnimationFrame(paint);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      const moved = dx;
      id = null; axis = null;
      if (Math.abs(moved) < THRESHOLD) { reset(); return; }
      grid.style.transition = "";
      dx = 0;
      paint();
      goTo(moved < 0 ? 1 : -1);
    };
    sec.addEventListener("pointerup", end);
    sec.addEventListener("pointercancel", (e) => { if (e.pointerId === id) { id = null; axis = null; reset(); } });
  }

  /* ---------------- 今日 ---------------- */

  /* 体重の枠。読む順は「いくつか」→「増えたか減ったか」で、
     どちらも**一目**で終わってほしいところです。

     ・「タップして直す」は書きません。数字を押せば直せるのは、この
       アプリのどの数字でも同じことなので、一行ぶんの高さを使って
       言うほどのことではありません。
     ・体脂肪は体重の下に。同じ「いまの体」の話なので、縦に続けます。
     ・前回比・7日平均・目標までは**右側**に。下に置くと枠が縦に伸びて、
       グラフを見るのにいちいちスクロールすることになります。
     ・そのグラフも、同じ枠の中に入れます。「いまの体重」と「その動き」は
       別々の話ではありません。 */
  function renderToday(host, card, sum, chartEl) {
    const w = card.weight;
    const g = sum.goal;
    const pace = D.neededPace();
    const when = dayName(card.day);

    const sec = node(html`
      <div class="diet-hero">
        <div class="diet-hero-top">
          <button class="diet-hero-main js-weight">
            <span class="diet-hero-label">
              <i class="diet-hero-ico">${icon("scale")}</i>${w
                ? (w.source === "health" ? `${when}の体重（ヘルスケア）` : `${when}の体重`)
                : `${when}はまだ量っていません`}</span>
            <span class="diet-hero-value">
              <b class="mono-num">${w ? kg(w.kg) : "—"}</b><small>kg</small>
            </span>
            <span class="diet-hero-sub">
              ${w && w.fat != null ? html`<span class="diet-hero-fat mono-num">体脂肪 ${w.fat.toFixed(1)}%</span>` : ""}
              ${w && condText(w) ? html`<span class="diet-hero-cond">${condText(w)}</span>` : ""}
            </span>
          </button>
          <div class="diet-hero-side">
            <div class="diet-stat">
              <span class="diet-stat-label"><i class="diet-stat-ico">${icon("trend")}</i>前回比</span>
              <b class="diet-stat-value mono-num ${sum.delta == null ? "" : sum.delta < 0 ? "is-good" : sum.delta > 0 ? "is-warn" : ""}">${signed(sum.delta)}</b>
              <span class="diet-stat-unit">kg${sum.deltaDays > 1 ? `・${sum.deltaDays}日ぶり` : ""}</span>
            </div>
            <div class="diet-stat">
              <span class="diet-stat-label"><i class="diet-stat-ico">${icon("chart")}</i>7日平均</span>
              <b class="diet-stat-value mono-num">${sum.ma7Now == null ? "—" : sum.ma7Now.toFixed(2)}</b>
              <span class="diet-stat-unit">kg</span>
            </div>
            <div class="diet-stat">
              <span class="diet-stat-label"><i class="diet-stat-ico">${icon("target")}</i>${g.targetKg == null ? "目標" : "目標まで"}</span>
              <b class="diet-stat-value mono-num">${g.targetKg == null ? "—" : (sum.toGoal == null ? "—" : Math.abs(sum.toGoal).toFixed(1))}</b>
              <span class="diet-stat-unit">${g.targetKg == null ? "未設定" : (sum.toGoal != null && sum.toGoal <= 0 ? "kg 超過達成" : "kg")}</span>
            </div>
          </div>
        </div>
        ${pace != null ? html`
          <p class="diet-hero-note">目標日まで、週 ${signed(pace, 2)}kg のペースが要ります。</p>` : ""}
        <div class="js-graph"></div>
      </div>
    `);
    sec.querySelector(".js-weight").addEventListener("click", () => openWeightSheet(card.weight, card.day));
    renderGraph(sec.querySelector(".js-graph"), chartEl);
    host.append(sec);
  }

  /* ---------------- グラフ ---------------- */

  const RANGES = [
    { id: 7, label: "7日" }, { id: 30, label: "30日" }, { id: 90, label: "90日" },
    { id: 365, label: "1年" }, { id: 0, label: "全部" },
  ];

  /* ---------------- 体重と並べて見るもの ----------------

     単位が違うものを同じ縦軸に重ねると、どちらも読めなくなります。
     体重は 68〜70 の狭い幅で動き、歩数は 0〜12000 です。同じ軸に置けば
     体重は一本の水平線に潰れます。

     だから **主役は体重の線のまま**、関連データは背後の棒にします。
     棒は自分の最大値を天井とする別のものさしで、数字の目盛りは出さず、
     いちばん大きい日の値だけを右上に書きます。棒の高さどうしを見比べる
     ことはできて、体重と絶対値で比べることはできない——それが正しい
     読み方なので、そう見えるようにします。

     一度に一つだけ選べます。二つ重ねると、どちらの棒がどちらか分からなく
     なるうえ、体重の線が埋もれます。 */
  const SERIES = [
    { id: "",       label: "なし" },
    { id: "kcal",   label: "摂取",   unit: "kcal", ico: "meal",
      get: (d) => { const t = D.dayTotals(d); return t ? t.kcal : null; } },
    { id: "steps",  label: "歩数",   unit: "歩",   ico: "steps",
      get: (d) => store.healthValue(d, "steps") },
    /* 札の名前は二文字でそろえます。「総消費」だけ三文字だと、
       六つ並んだ列の中でそこだけ幅が違って、目が引っかかります。 */
    { id: "burned", label: "消費", unit: "kcal", ico: "flame",
      get: (d) => D.burnedOf(d) },
    { id: "sleep",  label: "睡眠",   unit: "時間", ico: "moon",
      get: (d) => { const v = store.healthValue(d, "sleep"); return v == null ? null : Math.round(v / 6) / 10; } },
    { id: "drink",  label: "飲酒",   unit: "g",    ico: "drink",
      get: (d) => { const t = store.drinkTotals(d); return t ? t.alcoholG : null; } },
  ];
  const seriesOf = (id) => SERIES.find((s) => s.id === id) || SERIES[0];

  /* グラフは、体重の枠の中に続けて描きます（別の枠に切ると、同じ体重の
     話が二つの箱に分かれて、あいだの余白のぶんだけ遠くなります）。

     「並べて見る」の札はグラフの**右**に縦に並べます。下に置くと、選ぶ
     たびに目が下まで降りて戻ることになり、六つ並べると横にもあふれます。
     縦に置けば、グラフの高さがそのまま札の置き場になります。 */
  /* chartEl を渡されたら、それを使います（作り直しません）。三枚の
     カルーセルはどれも同じグラフ（選んだ日には依存しません）なので、
     render() 側で一度だけ作って、他の二枚には複製を渡します——履歴が
     長くなるほど chart() 自体が重くなるので、同じものを3回作らないため。 */
  function renderGraph(host, chartEl) {
    const sec = node(html`
      <div class="diet-graph">
        <div class="section-title">${icon("chart")}体重の推移</div>
        <div class="js-range"></div>
        <div class="diet-plot">
          <div class="diet-plot-chart js-chart"></div>
          <div class="diet-with">
            <span class="diet-with-label">並べて</span>
            <div class="js-series"></div>
          </div>
        </div>
        <div class="diet-legend">
          <span class="diet-legend-item"><i class="dot-actual"></i>実測</span>
          <span class="diet-legend-item"><i class="dot-ma7"></i>7日平均</span>
          ${range === 0 || range >= 30 ? html`<span class="diet-legend-item"><i class="dot-ma14"></i>14日平均</span>` : ""}
          ${/* 目標はここには書きません。線の右の端に「目標 68.0」と数ごと
                置いてあるので（chart()）、凡例で名前だけ言い直すと、
                読む人は二か所を見比べることになります。 */""}
          ${/* 数はグラフの右の目盛りに出るので、ここでは名前だけ。
                同じ数を二か所に書くと、どちらが本物か確かめる手間が増えます。 */""}
          ${series ? html`<span class="diet-legend-item"><i class="dot-bar"></i>${seriesOf(series).label}（${seriesOf(series).unit}）</span>` : ""}
          <span class="diet-legend-item"><i class="dot-beer">${icon("drink")}</i>飲んだ日</span>
        </div>
      </div>
    `);

    KN.ui.chipRow(sec.querySelector(".js-range"), RANGES.map((r) => ({ id: r.id, label: r.label })), {
      activeId: range,
      onPick: (id) => { range = Number(id); render(); },
    });
    KN.ui.chipRow(sec.querySelector(".js-series"), SERIES.map((x) => ({ id: x.id, label: x.label })), {
      activeId: series,
      onPick: (id) => { series = String(id || ""); render(); },
    });

    const drawn = chartEl || chart();
    sec.querySelector(".js-chart").append(drawn);

    /* 線が引けない日（記録が1日ぶん以下）は、「並べて」の札を出しません。

       .diet-plot は横並びで、右のこの列は札を六つ縦に積みます——173px ほど
       あります。左が二行のお知らせだけのとき、その差がまるごと空白として
       残っていました（「体重の下に変な隙間」の正体）。

       高さのためだけではありません。重ねる相手の線が無いのに「並べて」を
       選ばせるのは、押しても何も起きない札を置くということです。 */
    const isEmpty = !!(drawn.classList && drawn.classList.contains("diet-empty"));
    const withCol = sec.querySelector(".diet-with");
    if (withCol) withCol.hidden = isEmpty;

    host.append(sec);
  }

  /** 目盛りの天井。半端な数で切らないよう、上の丸い数まで伸ばします。 */
  function niceTop(v, ticks) {
    if (!(v > 0)) return 1;
    const step = Math.pow(10, Math.floor(Math.log10(v / ticks)));
    for (const m of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
      const s = step * m;
      if (s * ticks >= v) return s * ticks;
    }
    return Math.ceil(v / ticks) * ticks;
  }

  /**
   * SVGのおりがみ。ライブラリは入れません——線が2本と点が並ぶだけのものに
   * 数十KBを積むと、電波の無いところで開くのが遅くなります。
   */
  function chart() {
    const today = U.todayKey();
    const all = D.weightPoints(null, today);
    const from = range === 0
      ? (all.length ? all[0].day : today)
      : U.shiftDay(today, -(range - 1));
    const pts = all.filter((p) => p.day >= from);

    if (pts.length < 2) {
      return node(html`
        <div class="empty diet-empty">
          <div class="empty-text">${pts.length ? "まだ1日ぶんです。" : "この期間の記録がありません。"}
            線が引けるのは2日ぶんからです。</div>
        </div>
      `);
    }

    /* 飲んだ日の印は、線とは別の帯に置きます。線の上に重ねると、
       体重が高い日の点と印が同じ高さで並んで、どちらか読めません。 */
    const hasMarks = D.daysBetween(all.length ? all[0].day : today, today)
      .some((d) => store.drinkTotals(d));
    const sel = seriesOf(series);
    /* 右の余白は、並べて見るものを選んだときだけ空けます——そこに
       その棒の目盛りを書くので。選んでいなければ空けません（空けたままだと、
       グラフだけが狭くなります）。 */
    /* 縦を高くしました。札を右に立てたぶん横が狭くなり、同じ比のままだと
       グラフの背まで低くなって、日々の上下が潰れます。高さは右の札の列と
       だいたい同じところに来ます。 */
    const W = 320, H = 180, padL = 34, padR = sel.id ? 30 : 8, padB = 18;
    const padT = hasMarks ? 22 : 10;
    const ma7 = D.movingAverage(pts, 7).filter((m) => m.value != null);
    const ma14 = (range === 0 || range >= 30) ? D.movingAverage(pts, 14).filter((m) => m.value != null) : [];
    const goal = store.get().diet.goal.targetKg;

    /* 目標へ向かう帯。**新しい計算はしません**——傾き（trendPerWeek）は
       前回比・7日平均と同じ D.weightSummary() が既に持っている数字で、
       標本が薄ければ null になる既存の関所もそのまま使います。目標が
       無い・傾きが判定できない・むしろ遠ざかっている、のどれかなら
       何も塗りません（作られた弾みにしないため）。 */
    const trendWin = range === 0 ? 4000 : Math.max(range, 30);
    const trendSum = goal != null ? D.weightSummary(trendWin, today) : null;
    const trendPerWeek = trendSum ? trendSum.trendPerWeek : null;
    const towardGoal = (() => {
      if (goal == null || trendPerWeek == null || !ma7.length) return false;
      const now = ma7[ma7.length - 1].value;
      if (Math.abs(now - goal) < 0.1) return false;   // もう届いている
      return now > goal ? trendPerWeek < -0.03 : trendPerWeek > 0.03;
    })();

    /* 横の並べ方。**左詰め**、一日の幅は期間どおり。

       前は「いちばん古い点」から「いちばん新しい点」までを目一杯に
       広げていました（両端揃え）。３日ぶんしか無い週でも横いっぱいに伸びて、
       間隔だけを見ると毎日量ったように見えます。

       期間の頭を左端に固定するのも試しましたが、こんどは記録が右の端に
       寄って、左が大きく空きます。始めたばかりの人ほど読みにくい。

       だから **記録の始まりを左端に置き、一日の幅は期間から決めます**。
       七日を選べば一日は幅の1/6で、三日ぶんなら左から2つぶんまで。
       間隔は本物のまま、余りは右に残ります。記録がそろっていれば、
       これまでどおり横いっぱいになります。 */
    const spanDays = range === 0
      ? Math.max(1, D.daysBetween(pts[0].day, pts[pts.length - 1].day).length)
      : range;
    const dayW = (W - padL - padR) / Math.max(1, spanDays - 1);
    const base = pts[0].day;
    const idx = (day) => Math.round(
      (U.dayDate(day).getTime() - U.dayDate(base).getTime()) / 86400000);

    /* ---- 縦のものさし ----

       前は「いちばん軽い日といちばん重い日を取って、上下に12%ずつ足す」
       でした。それだと目盛りが 71.9 / 70.8 / 69.7 / 68.6 / 67.5 のような
       半端な数の並びになります。等間隔ではありますが、**丸くない数**は
       読めません——目盛りは「いま何kgか」を数えるための道具なので、
       0.5 や 1 の刻みでないと、点の高さから重さを割り出せません。

       だから刻みのほうを先に決めます。0.1／0.2／0.25／0.5／1……という
       決まった刻みから、四つぶんで記録が収まるいちばん細かいものを選び、
       余りを上下に振り分けてから、刻みの倍数まで下ろします。こうすると
       五本の線はぜんぶ丸い数の上に来て、間隔も等しいままです。 */
    const GRID_N = 5;
    const values = pts.map((p) => p.kg)
      .concat(ma7.map((m) => m.value), ma14.map((m) => m.value));
    let lo = Math.min(...values), hi = Math.max(...values);

    /* ---- 目標線を枠に入れるかどうか ----

       前は「6kg以内なら入れる」でした。その結果、七日の窓ではほとんど
       いつも入っていました——七日の体重の振れ幅は 0.5kg ほどしかないので、
       3kg先の目標を入れると、**枠の八割が誰も通らない空白**になり、記録の
       ほうは天井に貼りついた一本の線になります。空白の広いグラフは、
       描いていないのと大差ありません。

       だから、決め方を「目標までの距離」ではなく「入れたら何倍になるか」に
       変えます。いま見えている振れ幅の2.6倍までに収まるなら入れる。収まら
       ないなら枠は記録に合わせ、目標は**枠の外にあると分かる形**——下の端
       （または上の端）に、数と向きの矢印だけを置きます。消すのではなく、
       「ここではないどこか下」と言う。

       90日や1年の窓では振れ幅そのものが大きいので、目標はふつうに枠へ
       入ります。長く見るほど目標が見えてくる、というのは理屈にも合います。 */
    const natRange = Math.max(0.6, hi - lo);
    let goalIn = false;
    if (goal != null) {
      const wLo = Math.min(lo, goal), wHi = Math.max(hi, goal);
      if (wHi - wLo <= natRange * 2.6) { lo = wLo; hi = wHi; goalIn = true; }
    }
    /* 振れ幅が小さい週でも、枠にはこれだけの高さを持たせます。0.2kgの上下を
       画面いっぱいに拡大すると、量りの誤差が山脈に見えるので。ただし前は
       1.2kg取っていて、七日の窓（振れ幅0.4kgほど）では線が枠の5%まで
       潰れていました。0.6kgなら、量りの誤差を誇張せずに、一週間の動きは
       動きとして見えます。 */
    if (hi - lo < 0.6) { const mid = (hi + lo) / 2; lo = mid - 0.3; hi = mid + 0.3; }

    const STEPS = [0.1, 0.2, 0.25, 0.5, 1, 1.5, 2, 2.5, 5, 10, 20, 25, 50];
    const need = (hi - lo) * 1.08;                 // 端に線が触れないぶん
    const step = STEPS.find((s) => s * (GRID_N - 1) >= need)
      || Math.ceil(need / (GRID_N - 1));
    const slack = step * (GRID_N - 1) - (hi - lo);
    lo = Math.floor((lo - slack / 2) / step) * step;
    hi = lo + step * (GRID_N - 1);
    /* 丸めたぶんで、外していた目標が枠に入ることもあります。 */
    if (goal != null && goal >= lo && goal <= hi) goalIn = true;
    /* 刻みが整数なら小数点は要りません（「68」と「68.0」なら前者）。 */
    const kgText = (v) => (step % 1 ? v.toFixed(1) : String(Math.round(v)));

    /* いちばん下の線は棒の足もと、いちばん上は飲んだ日の印の下。ものさしも
       その二本のあいだに張ります——そうすれば「五本の補助線」と「五つの
       目盛り」が同じものになり、線と数がずれません。 */
    const gBot = H - padB;
    const gTop = padT + 12;
    const x = (day) => padL + idx(day) * dayW;
    const y = (v) => gTop + (1 - (v - lo) / (hi - lo)) * (gBot - gTop);

    /* ---- 線のなめらかさ ----

       折れ線でつないでいました。7日平均はもともと日々のぶれをならした数
       なので、それを角のある折れ線で描くと、ならした意味が見た目に出ません。

       曲げ方は単調保存（Fritsch–Carlson）を使います。ふつうの滑らかな
       曲線は、点と点のあいだで**行き過ぎ**ます——70.2 と 70.1 のあいだで
       69.9 まで垂れる曲線を引いてしまう、ということです。体重のグラフで
       それは「その日そう量った」と読まれるので、使えません。この引き方は
       与えた点より外に出ないことが保証されています。 */
    const curve = (ps) => {
      if (ps.length < 3) return ps.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      const n = ps.length, dx = [], m = [], t = [];
      for (let i = 0; i < n - 1; i++) {
        dx[i] = ps[i + 1].x - ps[i].x;
        m[i] = dx[i] ? (ps[i + 1].y - ps[i].y) / dx[i] : 0;
      }
      t[0] = m[0];
      for (let i = 1; i < n - 1; i++) {
        if (m[i - 1] * m[i] <= 0) { t[i] = 0; continue; }
        const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
        t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
      }
      t[n - 1] = m[n - 2];
      let d = `M${ps[0].x.toFixed(1)} ${ps[0].y.toFixed(1)}`;
      for (let i = 0; i < n - 1; i++) {
        const h = dx[i] / 3;
        d += ` C${(ps[i].x + h).toFixed(1)} ${(ps[i].y + t[i] * h).toFixed(1)}`
          + ` ${(ps[i + 1].x - h).toFixed(1)} ${(ps[i + 1].y - t[i + 1] * h).toFixed(1)}`
          + ` ${ps[i + 1].x.toFixed(1)} ${ps[i + 1].y.toFixed(1)}`;
      }
      return d;
    };
    const path = (rows, get) => curve(rows.map((r) => ({ x: x(r.day), y: y(get(r)) })));

    /* ---- 並べて見るもの ----

       日ごとの棒。ものさしは体重とは別で、いちばん大きい日を天井に
       します。目盛りは書きません——書けば「体重と同じ軸だ」と読まれます。
       いちばん大きい日の値だけを右上に置いて、天井が何かを言います。 */
    /* 棒と印も、左端から。右の端より先には置きません（期間より長い
       ぶんは、そもそもこの窓に入っていないので出てきませんが、
       枠の外に描いてしまうと切れた棒が見えます）。 */
    const lastX = W - padR;
    const days = D.daysBetween(base, today).filter((d) => x(d) <= lastX + 0.01);
    const bars = [];
    let barMax = 0;
    if (sel.id) {
      days.forEach((d) => {
        const v = sel.get(d);
        if (v == null) return;
        bars.push({ day: d, value: v });
        if (v > barMax) barMax = v;
      });
    }
    const barW = Math.max(2, Math.min(11, (W - padL - padR) / Math.max(1, days.length) - 1.4));

    /* ---- 補助線 ----

       五本、等間隔。上で決めた刻みの倍数の上に一本ずつ立っているので、
       線と目盛りの数は同じものです（上の「縦のものさし」を参照）。

       いちばん下の線は棒の足もとでもあります。そうすると、線の間隔がその
       まま棒の目盛りの刻みになり、**同じ線の左右に体重と棒の数**を書け
       ます。二つのものさしを一つの枠で読ませるには、線を共有させるのが
       いちばん誤解が少ない。 */
    const gridVals = [];
    for (let i = 0; i < GRID_N; i++) gridVals.push(lo + step * i);

    const barTop = niceTop(barMax, GRID_N - 1);    // 棒の目盛りの天井
    const barH = (v) => (barTop > 0 ? (v / barTop) * (gBot - gTop) : 0);
    /* 書き方は天井で決めます。値ごとに変えると「10k」と「5000」が
       縦に並んで、同じものさしに見えなくなります。 */
    const barText = sel.unit === "時間" ? (v) => v.toFixed(1)
      : barTop >= 10000 ? (v) => (v ? Math.round(v / 100) / 10 + "k" : "0")
      : (v) => String(Math.round(v * 10) / 10);

    /* ---- 飲んだ日の印 ----

       「飲酒あり」とだけ出しても、350mlを一本と、一升瓶を空けた日が
       同じ顔になります。押せば中身が出るようにして、印の濃さは
       純アルコール量で変えます。 */
    const marks = days.map((d) => ({ day: d, t: store.drinkTotals(d) }))
      .filter((m) => m.t);
    const markY = 9;

    /* 面の左の縁を薄く消す幅。線が短いときに消しすぎないよう、線の長さの
       三割までにします。 */
    const areaX0 = ma7.length ? x(ma7[0].day) : padL;
    const areaFade = ma7.length > 1
      ? Math.max(6, Math.min(42, (x(ma7[ma7.length - 1].day) - areaX0) * 0.3))
      : 6;

    const svg = node(html`
      <svg class="diet-chart" viewBox="0 0 ${W} ${H}" role="img"
           aria-label="体重の推移のグラフ${sel.id ? `（${sel.label}を並べています）` : ""}${towardGoal ? "。目標に近づいています" : ""}">
        ${/* 線の下の面。**いつも敷きます**——線一本だけだと、グラフというより
              針金の絵に見えます。上を濃く、下へ消えていく一枚を敷くと、
              「この高さにある」ことが面積として伝わります。 */""}
        ${/* 面の左の縁は、線が始まる日にできる**垂直の壁**です。7日平均は
              七日ぶんたまってから始まるので、壁は枠の途中に立ちます。そこに
              段差があるように見えるのを、左だけ薄く消して逃がします
              （右の縁は枠の端なので、もともと見えません）。 */""}
        ${KN.util.raw(`<defs><linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--c-primary)" stop-opacity="0.20"/>
              <stop offset="100%" stop-color="var(--c-primary)" stop-opacity="0.01"/>
            </linearGradient>`
          + `<linearGradient id="areaFade" gradientUnits="userSpaceOnUse"`
          + ` x1="${areaX0.toFixed(1)}" y1="0" x2="${(areaX0 + areaFade).toFixed(1)}" y2="0">`
          + `<stop offset="0%" stop-color="#fff" stop-opacity="0"/>`
          + `<stop offset="100%" stop-color="#fff" stop-opacity="1"/></linearGradient>`
          + `<mask id="areaEdge"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#areaFade)"/></mask>`
          + `</defs>`)}
        ${KN.util.raw(bars.map((b) => {
          const h = barH(b.value);
          return `<rect class="diet-bar" x="${(x(b.day) - barW / 2).toFixed(1)}" y="${(gBot - h).toFixed(1)}"
                        width="${barW.toFixed(1)}" height="${Math.max(0.6, h).toFixed(1)}" rx="1.6"/>`;
        }).join(""))}
        ${KN.util.raw(gridVals.map((v, i) => {
          const yy = y(v);
          return `<line class="diet-gridline ${i ? "" : "is-base"}" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"/>`
            + `<text class="diet-axis" x="${padL - 6}" y="${(yy + 3.2).toFixed(1)}" text-anchor="end">${kgText(v)}</text>`
            + (sel.id
              ? `<text class="diet-axis is-right" x="${W - padR + 4}" y="${(yy + 3.2).toFixed(1)}">${
                  barText(barTop * i / (GRID_N - 1))}</text>`
              : "");
        }).join(""))}
        ${goal == null ? "" : goalIn
          ? KN.util.raw(`<line class="diet-goal-line" x1="${padL}" y1="${y(goal).toFixed(1)}" x2="${W - padR}" y2="${y(goal).toFixed(1)}"/>`
            + `<text class="diet-goal-tag" x="${W - padR}" y="${(y(goal) - 4).toFixed(1)}" text-anchor="end">目標 ${goal.toFixed(1)}</text>`)
          : KN.util.raw(`<text class="diet-goal-tag is-off" x="${W - padR}" y="${
              (goal < lo ? gBot - 3 : gTop + 8).toFixed(1)}" text-anchor="end">目標 ${goal.toFixed(1)} ${
              goal < lo ? "▼" : "▲"}</text>`)}
        ${ma7.length > 1 ? KN.util.raw(`<path class="diet-area" mask="url(#areaEdge)" d="${
          path(ma7, (m) => m.value)} L${x(ma7[ma7.length - 1].day).toFixed(1)} ${gBot.toFixed(1)}`
          + ` L${x(ma7[0].day).toFixed(1)} ${gBot.toFixed(1)} Z" fill="url(#weightArea)"/>`) : ""}
        ${ma14.length > 1 ? KN.util.raw(`<path class="diet-ma14" d="${path(ma14, (m) => m.value)}"/>`) : ""}
        ${/* 目標へ向かっているときの帯。前は線の下を塗りつぶしていましたが、
              いつもの面を敷いたので、こんどは**線そのものを光らせます**。
              太い薄緑を線の下に一本、同じ道筋で。線の色は変えません。 */""}
        ${towardGoal && ma7.length > 1
          ? KN.util.raw(`<path class="diet-goal-glow" d="${path(ma7, (m) => m.value)}"/>`) : ""}
        ${ma7.length > 1 ? KN.util.raw(`<path class="diet-ma7" d="${path(ma7, (m) => m.value)}"/>`) : ""}
        ${/* 量った点。線と同じ色にします——前は灰色で、線とは別のものを
              指しているように見えていました。今日の点だけは大きく、地の色で
              縁取って、線の先端がどこかを言います。 */""}
        ${KN.util.raw(pts.map((p, i) => {
          const now = i === pts.length - 1;
          return `<circle class="diet-dot ${p.source === "health" ? "is-health" : ""} ${now ? "is-now" : ""}"`
            + ` cx="${x(p.day).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="${now ? 3 : 1.8}"/>`;
        }).join(""))}
        ${KN.util.raw(marks.map((m) => {
          /* 濃さは純アルコール量で。「飲酒あり」とだけ出すと、350mlを一本と
             一升瓶を空けた日が同じ顔になります。目安（20g）の1.5倍で満ちます。 */
          const heavy = Math.min(1, (m.t.alcoholG || 0) / (DR.GUIDE_G * 1.5));
          const s = 11 / 24;                       // 絵は24四方。11pxまで縮めます
          const cx = x(m.day), cy = markY;
          return `<g class="diet-beer" data-day="${m.day}" opacity="${(0.5 + heavy * 0.5).toFixed(2)}">`
            + `<g transform="translate(${(cx - 5.5).toFixed(1)} ${(cy - 5.5).toFixed(1)}) scale(${s.toFixed(3)})">`
            + `<path class="diet-beer-mug" d="M6.2 4.6h9.2v13.2a2 2 0 0 1-2 2H8.2a2 2 0 0 1-2-2Z"/>`
            + `<path class="diet-beer-mug" d="M15.4 7.6h2.2a2.4 2.4 0 0 1 0 4.8h-2.2"/>`
            + `<path class="diet-beer-mug" d="M6.2 9.2h9.2"/></g>`
            + `<rect class="diet-beer-hit" x="${(cx - 9).toFixed(1)}" y="${cy - 9}" width="18" height="18"/>`
            + `</g>`;
        }).join(""))}
        ${/* 端の日付。右は「いちばん新しい記録」の下に置きます——右端に
              置くと、そこに点が無いのに日付だけがある形になります。 */""}
        <text class="diet-axis" x="${padL}" y="${H - 5}">${U.formatDay(base).replace("今日", "")}</text>
        <text class="diet-axis" x="${Math.min(W - padR, Math.max(padL + 40, x(pts[pts.length - 1].day))).toFixed(1)}"
              y="${H - 5}" text-anchor="end">${U.formatDay(pts[pts.length - 1].day)}</text>
      </svg>
    `);

    /* 印は押せます。飲んだ量は、グラフの上で確かめられないと意味が薄い。 */
    svg.querySelectorAll(".diet-beer").forEach((g) => {
      g.addEventListener("click", () => { KN.motion.fire("select"); showDrinkDay(g.getAttribute("data-day")); });
    });
    return svg;
  }

  /** グラフの🍺を押したとき。その日に何を飲んだかを出します。 */
  function showDrinkDay(day) {
    const rows = store.drinksOfDay(day);
    const t = DR.totals(rows);
    if (!t) return;
    const body = node(html`
      <div class="stack">
        <div class="diet-read">
          ${KN.util.raw(rows.map((d) => `
            <div class="diet-drink-row">
              <b>${d.time ? KN.util.escapeHtml(d.time) + "　" : ""}${KN.util.escapeHtml(DR.describeItem(d))}</b>
              <span>${d.abv}%${d.estimated ? "（推定）" : ""}</span>
              <span class="mono-num">純アルコール ${d.estimated ? "約" : ""}${d.alcoholG}g</span>
              <span class="mono-num">${d.estimated ? "約" : ""}${d.kcal.toLocaleString()}kcal</span>
              ${moodOf(d) ? `<span class="diet-mood">${KN.util.escapeHtml(moodOf(d))}</span>` : ""}
            </div>`).join(""))}
          ${rows.length > 1 ? `
            <div class="diet-drink-row is-sum">
              <b>合計</b>
              <span class="mono-num">${t.volumeMl.toLocaleString()}ml</span>
              <span class="mono-num">純アルコール ${t.estimated ? "約" : ""}${t.alcoholG}g</span>
              <span class="mono-num">${t.estimated ? "約" : ""}${t.kcal.toLocaleString()}kcal</span>
            </div>` : ""}
        </div>
      </div>
    `);
    /* 入れ物で包みます。ボタンそのものを渡すと、あとで
       foot.querySelector(".js-edit") が自分自身を見つけられず、
       ボタンが黙って効かなくなります（一度そうしていました）。 */
    const foot = node(html`
      <div style="width:100%">
        <button class="btn btn-soft btn-block js-edit">${icon("edit")}この日の記録を直す</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: U.formatDay(day) + " のお酒", content: body, footer: foot });
    foot.querySelector(".js-edit").addEventListener("click", () => { h.close(); openDrinkSheet(day); });
  }

  /* ---------------- からだ ---------------- */

  /* 数の並びは、見るためだけのものにしません。取り込んだ値を直せず消せず、
     今日より前の日にも触れないと、一度入った間違いがそのまま残ります。
     どの枠を押しても、その日の記録の画面が開きます。 */
  /* 絵は飾りではありません。数字だけが並ぶと、どれが何かは読むまで
     分からず、探すたびに全部読み直すことになります。目は文字より先に絵を
     拾うので、二度目からは絵で当たりを付けられます。

     この並びは「からだの記録」を直す画面のもの——ヘルスケアから来る
     六種類ぜんぶです。カードに出す四つとは別で、こちらは減らしません
     （直せる場所が減ると、直せない値が生まれます）。 */
  const BODY_ROWS = [
    { type: "steps",         label: "歩数",       unit: "歩",   hint: "8432", ico: "steps" },
    { type: "activeEnergy",  label: "アクティブ", unit: "kcal", hint: "430",  ico: "flame" },
    { type: "restingEnergy", label: "安静時",     unit: "kcal", hint: "1520", ico: "bed" },
    { type: "sleep",         label: "睡眠",       unit: "",     hint: "7:12", ico: "moon" },
    { type: "distance",      label: "歩行距離",   unit: "km",   hint: "6.1",  ico: "route" },
    { type: "heartRate",     label: "心拍数",     unit: "bpm",  hint: "62",   ico: "heart" },
  ];

  const showValue = (type, v) => {
    if (v == null) return "—";
    if (type === "sleep") return hhmm(v);
    if (type === "distance") return v.toFixed(1);
    return n0(v);
  };

  /** その日のその種目が手で書かれたものか。 */
  const isManual = (day, type) =>
    store.healthOfDay(day, type).some((h) => h.source === "manual");

  /** 一日の目安（純アルコールg）。決めていなければ厚労省の20g。 */
  const alcoholGuide = () => store.get().diet.goal.alcoholG || DR.GUIDE_G;

  /* からだの三つの目標。決めていなければ、届く高さの既定値を使います
     （store.js の goal のコメントを参照）。 */
  const STEPS_DEFAULT = 5000, BURN_DEFAULT = 1600, SLEEP_DEFAULT = 300;
  const stepsGoal = () => store.get().diet.goal.stepsTarget || STEPS_DEFAULT;
  const burnGoal  = () => store.get().diet.goal.burnTarget  || BURN_DEFAULT;
  const sleepGoal = () => store.get().diet.goal.sleepTarget || SLEEP_DEFAULT;

  /**
   * リングの描き方を決めます。角度だけを返し、色はCSS側の変数に任せます
   * （そうしないと、明るい／暗いの切り替えで色が固定されてしまうので）。
   *
   * ふつうの三つ（歩数・総消費・睡眠）:
   *   目標までは色が伸び、**超えたぶんは明るい色で二周目**として重なります。
   *   超えたことが見えないと、超えた日と、ちょうど届いた日が同じ顔になります。
   *
   * 飲酒だけは向きが逆です:
   *   飲まなかった日が **満ちた輪**。飲むほど減って灰色が増え、目安を
   *   超えたら、超えたぶんが赤で出ます。「飲まなかった」は空白ではなく
   *   その日の成果なので、いちばん見える形（満ちた輪）を当てています。
   *
   *   ただし **その日が終わっていれば** の話です。朝七時に満ちた青い輪を
   *   出すと、四つのうちいちばん目立つものが「まだ飲んでいない」を讃えて
   *   いることになります——お酒は夕方より前には飲まないのだから、昼までの
   *   0g は成果ではなく、まだ何も起きていないだけ。ほかの三つと同じ
   *   「—」にして、夕方（18時）から満ち始めます。
   *
   *   同じ間違いを、AIに渡す文章のほうでは先に直してあります
   *   （dayBodyText の「この時点ではまだ記録なし（未確定）」）。絵のほうが
   *   残っていました。
   *
   * @param {boolean} [pending] 飲酒のみ：今日で、まだ夕方前で、記録も無い
   * @returns {{cls:string, deg:number, pct:number|null}}
   */
  function ringOf(kind, value, target, pending) {
    if (kind === "drink") {
      if (pending) return { cls: "is-drink is-none", deg: 0, pct: null };
      const g = value || 0;                       // 飲んでいない日は 0g
      const pct = target > 0 ? (g / target) * 100 : 0;
      if (pct > 100) {
        // 超過ぶんを赤で。二周を超えるほど飲んだ日は、輪一周で頭打ち。
        const over = Math.min(100, pct - 100);
        return { cls: "is-drink is-over", deg: over * 3.6, pct: Math.round(pct) };
      }
      // 残っているぶんを色で。0gなら満ちる。
      return { cls: "is-drink", deg: (100 - pct) * 3.6, pct: Math.round(pct) };
    }
    if (value == null || !(target > 0)) return { cls: `is-${kind} is-none`, deg: 0, pct: null };
    const pct = (value / target) * 100;
    if (pct > 100) {
      const over = Math.min(100, pct - 100);
      return { cls: `is-${kind} is-over`, deg: over * 3.6, pct: Math.round(pct) };
    }
    return { cls: `is-${kind}`, deg: pct * 3.6, pct: Math.round(pct) };
  }

  function renderBodyStats(host, card) {
    const sync = store.get().diet.sync;
    const dt = card.drinkTotals;

    /* カードに出す四つ。「今日どうだったか」に答える最小の組です。

       総消費は、安静時とアクティブを **こちらで足して** 出します。二つに
       分けて見せていましたが、「今日どれだけ使ったか」を知るのに人に足し算を
       させるのは、こちらがやるべき仕事です。分けたぶんは、枠を押して開く
       「からだの記録」にあります。

       歩行距離はここから外しました。毎日ほとんど同じで、体重との関係も
       歩数がすでに言っています（そして機械が二台あると二重に数える——
       取り込みのほうで直しました）。記録としては持ち続けます。

       四つを**横一列**に並べます。そのために書き方を詰めました——睡眠は
       「6時間40分」ではなく「6h40m」、飲酒は中身の言葉ではなく
       **一日の目安に対する％**。中身は押せば出てきます。 */
    const guide = alcoholGuide();
    const pct = dt ? Math.round((dt.alcoholG / guide) * 100) : 0;
    /* まだ何も言えない日は、飲酒も数の無い枠にします（ringOf のコメント参照）。
       言えないのは二つ——**明日から先**（まだ起きていない）と、**今日の
       夕方前**（お酒はそれより前には出てこない）。夕方の境目は、やることの
       朝/午後/夜と同じ 18時を引きます。ここで別の数を書くと、二つの「夜」が
       少しずつずれていきます。

       カレンダーの帯のほうは、未来の日をすでに出していません（render 内の
       `key > today ? null : drinkBar(key)`）。輪だけが、横に払って出る
       明日の紙で満ちていました。 */
    const today = U.todayKey();
    const drinkPending = !dt && (card.day > today
      || (card.day === today && U.partOfTime(U.nowTime()) !== "night"));
    const sg = stepsGoal(), bg = burnGoal(), slg = sleepGoal();
    /* 輪の真ん中に出す字。ふつうの三つは目標に対する％（超えたら100を
       超えた数がそのまま出ます——超えたことが読めるように）。飲酒だけは
       量そのもの（g）です。％は下の行が言うので、同じ数を二度書きません。 */
    const ringPct = (r) => (r.pct == null ? "—" : r.pct + "%");
    const rSteps = ringOf("steps", card.steps, sg);
    const rBurn  = ringOf("burned", card.burned, bg);
    const rSleep = ringOf("sleep", card.sleep, slg);
    const rDrink = ringOf("drink", dt ? dt.alcoholG : 0, guide, drinkPending);
    const rows = [
      { type: "steps", label: "歩数", unit: `目標 ${n0(sg)}`, ico: "steps",
        value: showValue("steps", card.steps), manual: isManual(card.day, "steps"),
        ring: rSteps, mid: ringPct(rSteps) },
      { type: "burned", label: "総消費", unit: `目標 ${n0(bg)}`, ico: "flame",
        value: card.burned == null ? "—" : n0(card.burned),
        manual: isManual(card.day, "activeEnergy") || isManual(card.day, "restingEnergy"),
        ring: rBurn, mid: ringPct(rBurn) },
      { type: "sleep", label: "睡眠", unit: `目標 ${hm(slg)}`, ico: "moon",
        value: card.sleep == null ? "—" : hm(card.sleep), manual: isManual(card.day, "sleep"),
        ring: rSleep, mid: ringPct(rSleep) },
      /* 飲酒だけは「無い」ときも薄くしません。飲まなかった日は空白では
         なく **0%という記録**で、そこが薄いと「書き忘れ」に見えます。
         輪は逆向き——飲まなかった日が満ちます（ringOf のコメント参照）。

         例外は、今日のまだ夕方前だけ。そこは記録ではなく **まだ**なので、
         ほかの三つと同じ薄い枠にします（keep を外す）。 */
      { type: "drink", label: "飲酒", ico: "drink", keep: !drinkPending,
        value: drinkPending ? "—" : pct + "%",
        unit: dt ? `${dt.estimated ? "約" : ""}${dt.alcoholG}g` : `目安${guide}g`,
        over: !drinkPending && pct > 100,
        ring: rDrink, mid: drinkPending ? "—" : `${dt ? dt.alcoholG : 0}g` },
    ];
    const nothing = card.steps == null && card.burned == null && card.sleep == null
      && !card.workouts.length && !dt;

    const sec = node(html`
      <div class="stack">
        <div class="section-title">${icon("heart")}${dayName(card.day)}のからだ
          ${sync.lastAt ? html`<span class="section-note">取り込み ${U.formatStamp(sync.lastAt)}</span>` : ""}
        </div>
        <div class="diet-grid">
          ${KN.util.raw(rows.map((r) => `
            ${/* 読み上げの順と、目で読む順は別です。字は「歩数 → 5,356 →
                  目標」の順に並べておいて（読み上げも、textContent を見る
                  ところも、この順で読みます）、輪だけを CSS で上へ回します。 */""}
            <button class="diet-cell js-cell ${r.type === "drink" ? "js-drink" : ""} ${
              r.value === "—" && !r.keep ? "is-blank" : ""}" data-type="${r.type}">
              <span class="diet-cell-label"><span class="diet-cell-ico">${icon(r.ico)}</span>${
                r.label}${r.manual ? '<i class="diet-hand" title="手入力">' + icon("edit").value + '</i>' : ""}</span>
              <span class="diet-ring ${r.ring.cls}" style="--deg:${r.ring.deg.toFixed(1)}deg" aria-hidden="true">
                <i class="diet-ring-mid mono-num">${r.mid}</i>
              </span>
              <b class="diet-cell-value mono-num ${r.over ? "is-over" : ""}">${r.value}</b>
              ${r.unit ? `<span class="diet-cell-unit">${r.unit}</span>` : ""}
            </button>`).join(""))}
        </div>
        ${card.workouts.length ? html`
          <div class="diet-workouts">
            ${KN.util.raw(card.workouts.map((w) =>
              `<span class="badge">${KN.util.escapeHtml(w.label || "ワークアウト")} ${Math.round(w.value)}分`
              + `${w.kcal != null ? ` ・ ${Math.round(w.kcal)}kcal` : ""}</span>`).join(""))}
          </div>` : ""}
        ${nothing ? html`
          <button class="btn btn-soft btn-block js-import">
            ${icon("download")}ヘルスケアから取り込む
          </button>
          <p class="diet-note">歩数や睡眠は、iPhoneの「ショートカット」で書き出したものを読み込みます。
            やり方は取り込み画面に書いてあります。枠を押せば手で書くこともできます。</p>` : ""}
      </div>
    `);
    const btn = sec.querySelector(".js-import");
    if (btn) btn.addEventListener("click", openSyncSheet);
    sec.querySelectorAll(".js-cell").forEach((c) => {
      c.addEventListener("click", () => {
        if (c.dataset.type === "drink") { openDrinkSheet(card.day); return; }
        // 総消費はそれ自体の欄が無いので、内わけの片方に降ろします。
        const t = c.dataset.type === "burned" ? "activeEnergy" : c.dataset.type;
        openBodySheet(card.day, t);
      });
    });
    host.append(sec);
  }

  /* ---------------- お酒 ----------------

     書いてもらうのは一行だけです。「ビール350mlを2本」。
     種類を選び、量を選び、本数を選び……を毎晩やらせると、三日でやめます。

     ただし **読んだものを黙って保存はしません**。読み違えはあるし、
     度数を書かなければ推した値です。打つそばから読み下しを出して、
     入る中身を見てから押してもらいます。確認の画面を別に挟むのではなく、
     同じ画面に出す——押す回数は増やさずに、見えるようにするだけ。 */

  const EXAMPLES = ["ビール350ml 2本", "ワイン半分", "日本酒1合", "ハイボール2杯", "焼酎100ml"];

  /** 札と自由入力をひと続きに。同じ言葉が二度出ないようにします。 */
  function moodOf(d) {
    const tags = (d.moodTags || []).filter(Boolean);
    const text = String(d.mood || "").trim();
    const all = text && !tags.includes(text) ? tags.concat(text) : tags;
    return all.join("・");
  }

  function openDrinkSheet(day0, editId) {
    const day = day0 || U.todayKey();
    const editing = editId ? store.drinksOfDay(day).find((d) => d.id === editId) : null;

    const body = node(html`
      <div class="stack">
        <div class="diet-daynav">
          <b>${U.formatDay(day)}</b>
        </div>
        <label class="field">
          <span class="field-label">飲んだもの</span>
          <input class="input js-q" placeholder="ビール350ml 2本"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 value="${editing ? editing.raw || DR.describeItem(editing) : ""}">
        </label>
        <div class="diet-chips js-ex"></div>
        <div class="js-read"></div>

        ${/* 飲むたびに書き足すものなので、時刻を持たせます。あとで
              「いつ飲みはじめたか」「何時間かけたか」を見るために。
              既定はいま——たいてい、飲んだそのときに書くので。 */""}
        <div class="time-row">
          <span class="time-label">時刻</span>
          <input class="input js-time" type="time" aria-label="時刻"
                 value="${editing ? (editing.time || "") : U.nowTime()}">
        </div>

        <label class="field">
          <span class="field-label">そのときの気分（任意）</span>
          <input class="input js-mood" placeholder="疲れた／付き合い／…"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 value="${editing ? editing.mood || "" : ""}">
        </label>
        <div class="diet-chips js-moodtags"></div>
        <p class="diet-note js-moodnote"></p>

        <div class="js-list"></div>
      </div>
    `);

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        ${editing ? html`<button class="btn btn-soft js-del" style="flex:1">消す</button>` : ""}
        <button class="btn btn-primary js-save" style="flex:2">${editing ? "直す" : "記録する"}</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: editing ? "お酒を直す" : "お酒", content: body, footer: foot, guard: true });

    const q = body.querySelector(".js-q");
    const readBox = body.querySelector(".js-read");
    let items = [];
    let tags = editing ? (editing.moodTags || []).slice() : [];

    /* よくある書き方を、押せる形で。何をどう書けばいいかは、
       説明文より例のほうが早く伝わります。 */
    EXAMPLES.forEach((ex) => {
      const chip = node(html`<button type="button" class="chip">${ex}</button>`);
      chip.addEventListener("click", () => {
        q.value = q.value.trim() ? q.value.trim() + "、" + ex : ex;
        paint();
        KN.motion.fire("select");
      });
      body.querySelector(".js-ex").append(chip);
    });

    function paint() {
      const res = DR.parse(q.value);
      items = res.items;
      readBox.innerHTML = "";
      if (!q.value.trim()) return;

      if (!items.length) {
        readBox.append(node(html`
          <p class="diet-note is-warn">読めませんでした。
            「ビール350ml 2本」のように、<b>お酒の種類</b>と量を書いてみてください。</p>`));
        return;
      }
      const t = DR.totals(items);
      readBox.append(node(html`
        <div class="diet-read">
          ${KN.util.raw(items.map((it) => `
            <div class="diet-drink-row">
              <b>${KN.util.escapeHtml(DR.describeItem(it))}</b>
              <span>${it.abv}%${it.estimated ? "（推定）" : ""}</span>
              <span class="mono-num">純アルコール ${it.estimated ? "約" : ""}${it.alcoholG}g</span>
              <span class="mono-num">${it.estimated ? "約" : ""}${it.kcal.toLocaleString()}kcal</span>
            </div>`).join(""))}
          ${items.length > 1 ? `
            <div class="diet-drink-row is-sum">
              <b>合計 ${items.length}種類</b>
              <span class="mono-num">${t.volumeMl.toLocaleString()}ml</span>
              <span class="mono-num">純アルコール ${t.estimated ? "約" : ""}${t.alcoholG}g</span>
              <span class="mono-num">${t.estimated ? "約" : ""}${t.kcal.toLocaleString()}kcal</span>
            </div>` : ""}
        </div>
      `));
      readBox.append(node(html`
        <p class="diet-note">
          純アルコール量は <b>ml × 度数% ÷ 100 × 0.8</b> で数えます。
          ${t.estimated ? "度数や量を書かなかったぶんは、種類ごとの目安から推しました（「約」と付けています）。" : ""}
          ${t.alcoholG >= DR.GUIDE_G ? `なお「節度ある適度な飲酒」は一日 純アルコール${DR.GUIDE_G}g程度とされています（個人差があります）。` : ""}
        </p>`));
    }

    q.addEventListener("input", paint);
    paint();
    KN.ui.focusNow(q);

    /* ---- 気分の札 ----

       用意された選択肢はありません。**これまでに自分が書いた言葉**が並びます。
       はじめて書く人には何も出ず、二度目からは自分の言葉が押せるようになります。
       ここに一般的な五つを並べてしまうと、その五つの中から選ぶことになって、
       自分の飲み方が他人の言葉で記録されます。 */
    function paintMoodTags() {
      const host = body.querySelector(".js-moodtags");
      const note = body.querySelector(".js-moodnote");
      const seen = DR.moodSuggestions(store.get().diet.drinks, 5);
      const words = [...new Set(seen.map((x) => x.word).concat(tags))];
      host.innerHTML = "";
      if (!words.length) {
        note.textContent = "書いた言葉は、次から押せる札になります"
          + "（よくある言葉をこちらで並べることはしません——自分の言葉のほうが、あとで読み返したときに当たります）。";
        return;
      }
      note.textContent = "札は、これまでに自分が書いた言葉から作られます。";
      words.forEach((w) => {
        const on = tags.includes(w);
        const chip = node(html`<button type="button" class="chip ${on ? "is-on" : ""}"
          aria-pressed="${String(on)}">${w}</button>`);
        chip.addEventListener("click", () => {
          const i = tags.indexOf(w);
          if (i >= 0) tags.splice(i, 1); else tags.push(w);
          paintMoodTags();
          KN.motion.fire("select");
        });
        host.append(chip);
      });
    }
    paintMoodTags();

    /* その日のぶんの一覧。ここから直せます。 */
    function paintList() {
      const list = body.querySelector(".js-list");
      list.innerHTML = "";
      const mine = store.drinksOfDay(day).filter((d) => !editing || d.id !== editing.id);
      if (!mine.length) return;
      list.append(node(html`<div class="section-title">この日の記録</div>`));
      const rows = node(html`<div class="rows"></div>`);
      mine.forEach((d) => {
        const row = node(html`
          <button class="row">
            <span class="row-main">
              <span class="row-title">${d.time ? d.time + "　" : ""}${DR.describeItem(d)}</span>
              <span class="row-sub">${d.estimated ? "約" : ""}${d.alcoholG}g ・ ${d.estimated ? "約" : ""}${d.kcal.toLocaleString()}kcal${
                moodOf(d) ? "　" + moodOf(d) : ""}</span>
            </span>
            <span class="row-chevron">${icon("edit")}</span>
          </button>
        `);
        row.addEventListener("click", () => { h.close(); openDrinkSheet(day, d.id); });
        rows.append(row);
      });
      list.append(rows);
    }
    paintList();

    foot.querySelector(".js-save").addEventListener("click", () => {
      if (!items.length) { KN.ui.toast("読めませんでした。書き方を変えてみてください"); return; }
      const time = body.querySelector(".js-time").value || null;
      const mood = body.querySelector(".js-mood").value.trim();
      const extra = { day, raw: q.value.trim(), time, mood, moodTags: tags };
      if (editing) {
        // 直すときは一つぶん。二つに増えたなら、残りは足します。
        store.updateDrink(editing.id, { ...items[0], ...extra });
        items.slice(1).forEach((it) => store.addDrink({ ...it, ...extra }));
      } else {
        items.forEach((it) => store.addDrink({ ...it, ...extra }));
      }
      h.close();
      render();
      const t = DR.totals(items);
      KN.ui.toast(`お酒：${items.map((i) => DR.describeItem(i)).join("・")}（純アルコール ${t.estimated ? "約" : ""}${t.alcoholG}g）`);
      KN.motion.fire("save");
    });

    const del = foot.querySelector(".js-del");
    if (del) del.addEventListener("click", () => {
      store.removeDrink(editing.id);
      h.close();
      render();
      KN.ui.toast("消しました");
    });
  }

  /* ---------------- からだの記録を直す ----------------

     一枚で、見る・直す・消す・別の日へ移る、を全部やります。別々の画面に
     割ると「昨日の歩数を直したい」がどこにあるのか分からなくなるので。 */
  function openBodySheet(day0, focusType) {
    let day = day0 || U.todayKey();

    const body = node(html`<div class="stack"><div class="js-inner"></div></div>`);
    const h = KN.ui.sheet({ title: "からだの記録", content: body });

    function paint() {
      const inner = body.querySelector(".js-inner");
      inner.innerHTML = "";
      const workouts = store.healthOfDay(day, "workout");
      const isToday = day === U.todayKey();

      const el = node(html`
        <div class="stack">
          <div class="diet-daynav">
            <button class="icon-btn js-prev" aria-label="前の日">${icon("chevron", "flip-x")}</button>
            <b>${U.formatDay(day)}</b>
            <button class="icon-btn js-next" aria-label="次の日" ${isToday ? "disabled" : ""}>${icon("chevron")}</button>
            ${isToday ? "" : html`<button class="btn btn-soft btn-sm js-today">今日へ</button>`}
          </div>

          <div class="diet-edit">
            ${KN.util.raw(BODY_ROWS.map((r) => {
              const v = store.healthValue(day, r.type);
              const mine = isManual(day, r.type);
              const rec = store.healthOfDay(day, r.type)[0];
              const shown = v == null ? ""
                : r.type === "sleep" ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`
                : String(v);
              return `
                <label class="diet-edit-row">
                  <span class="diet-edit-name">${r.label}</span>
                  <input class="input js-v" data-type="${r.type}" inputmode="${r.type === "sleep" ? "text" : "decimal"}"
                         value="${shown}" placeholder="${r.hint}">
                  <span class="diet-edit-unit">${r.unit}</span>
                  <span class="diet-edit-src">${v == null ? ""
                    : mine ? "手入力"
                    : rec && rec.importedAt ? "ヘルスケア" : "ヘルスケア"}</span>
                </label>`;
            }).join(""))}
          </div>
          <p class="diet-note">
            欄を<b>空にして保存すると、その値は消えます</b>。消せば、次の取り込みで
            またヘルスケアの値が入ります。<br>
            手で書いた値には「手入力」と付き、<b>取り込みでは上書きされません</b>。
          </p>

          <div class="section-title">ワークアウト</div>
          ${workouts.length ? html`
            <div class="rows">
              ${KN.util.raw(workouts.map((w) => `
                <div class="row">
                  <span class="row-main">
                    <span class="row-title">${KN.util.escapeHtml(w.label || "ワークアウト")}</span>
                    <span class="row-sub">${Math.round(w.value)}分${w.kcal != null ? ` ・ ${Math.round(w.kcal)}kcal` : ""}${w.time ? ` ・ ${w.time}` : ""}</span>
                  </span>
                  <button class="icon-btn js-wdel" data-id="${w.id}" aria-label="消す">${icon("trash")}</button>
                </div>`).join(""))}
            </div>` : html`<p class="diet-note">この日のワークアウトはありません。</p>`}
          <button class="btn btn-soft btn-sm js-wadd">${icon("plus")}ワークアウトを足す</button>

          <button class="btn btn-primary btn-block js-save">保存</button>
        </div>
      `);
      inner.append(el);

      el.querySelector(".js-prev").addEventListener("click", () => { day = U.shiftDay(day, -1); paint(); });
      const next = el.querySelector(".js-next");
      if (!isToday) next.addEventListener("click", () => { day = U.shiftDay(day, 1); paint(); });
      const todayBtn = el.querySelector(".js-today");
      if (todayBtn) todayBtn.addEventListener("click", () => { day = U.todayKey(); paint(); });

      el.querySelectorAll(".js-wdel").forEach((b) => b.addEventListener("click", () => {
        store.removeHealth(b.dataset.id);
        paint();
        render();
      }));
      el.querySelector(".js-wadd").addEventListener("click", () => addWorkout(day, paint));

      el.querySelector(".js-save").addEventListener("click", () => {
        let changed = 0;
        el.querySelectorAll(".js-v").forEach((inp) => {
          const type = inp.dataset.type;
          const raw = inp.value.trim();
          const before = store.healthValue(day, type);
          if (!raw) {
            if (before != null) { store.clearHealth(day, type); changed++; }
            return;
          }
          const v = type === "sleep" ? KN.healthSync.toMinutes(raw)
            : type === "distance" ? KN.healthSync.toKm(raw)
            : parseFloat(raw.replace(/[^\d.]/g, ""));
          if (v == null || !Number.isFinite(v)) return;
          if (before != null && Math.abs(before - v) < 0.0001) return;
          store.setHealth(day, type, v, { unit: KN.healthSync.UNITS[type] || "" });
          changed++;
        });
        h.close();
        render();
        KN.ui.toast(changed ? `${changed}件を直しました` : "変わりはありません");
      });

      if (focusType) {
        const target = el.querySelector(`.js-v[data-type="${focusType}"]`);
        if (target) KN.ui.focusNow(target);
        focusType = null;
      }
    }

    paint();
  }

  function addWorkout(day, after) {
    const b = node(html`
      <div class="stack">
        <label class="field"><span class="field-label">種目</span>
          <input class="input js-n" placeholder="例：ウォーキング"></label>
        <div class="field-row">
          <label class="field" style="flex:1"><span class="field-label">時間（分）</span>
            <input class="input js-m" inputmode="numeric" placeholder="42"></label>
          <label class="field" style="flex:1"><span class="field-label">kcal</span>
            <input class="input js-k" inputmode="numeric" placeholder="任意"></label>
          <label class="field" style="flex:1"><span class="field-label">時刻</span>
            <input type="time" class="input js-t2" value="${U.nowTime()}"></label>
        </div>
      </div>
    `);
    const f = node(html`<button class="btn btn-primary btn-block">足す</button>`);
    const hh = KN.ui.sheet({ title: "ワークアウトを足す", content: b, footer: f, guard: true });
    KN.ui.focusNow(b.querySelector(".js-n"));
    f.addEventListener("click", () => {
      const min = parseFloat(String(b.querySelector(".js-m").value).replace(/[^\d.]/g, ""));
      if (!(min > 0)) { KN.ui.toast("時間を入れてください"); return; }
      const kcal = parseFloat(String(b.querySelector(".js-k").value).replace(/[^\d.]/g, ""));
      const time = b.querySelector(".js-t2").value || null;
      store.putHealth({
        type: "workout", day, time, value: min, unit: "分",
        label: b.querySelector(".js-n").value.trim() || "ワークアウト",
        kcal: Number.isFinite(kcal) ? kcal : null,
        source: "manual",
        externalId: `manual:${day}:${time || "?"}:${min}`,
      });
      hh.close();
      after();
      render();
    });
  }

  /* ---------------- 食事 ---------------- */

  /* ---------------- カロリーの出どころ、一本で ----------------

     「1,800kcal」だけでは、次にどうするかが決まりません。多いのか少ない
     のかは総消費しだいですし、多かったとして**どこから来たのか**が
     分からなければ、動かす場所も決まらない。

     だから一本の帯にします。全体（100%）がその日の総消費で、左から
     朝・昼・夜・間食・（区分なし）・飲酒、余りが「残り」。一目で
     「使ったぶんに対してどれだけ食べたか」と「その内わけ」が同時に読めます。 */
  function energyBar(day) {
    const sp = D.energySplit(day);
    if (!sp) return null;
    const el = node(html`
      <div class="diet-stack-wrap">
        <div class="diet-stack ${sp.over ? "is-over" : ""}" role="img"
             aria-label="${sp.known
               ? `総消費${Math.round(sp.burned).toLocaleString()}kcalのうち、摂取${sp.intake.toLocaleString()}kcal`
               : `摂取${sp.intake.toLocaleString()}kcalの内わけ`}">
          ${KN.util.raw(sp.parts.map((x) =>
            `<i class="is-${x.id}" style="width:${x.pct}%" title="${x.label} ${x.kcal.toLocaleString()}kcal"></i>`).join(""))}
          ${sp.restPct > 0 ? KN.util.raw(`<i class="is-rest" style="width:${sp.restPct}%"></i>`) : ""}
        </div>
        <div class="diet-stack-legend">
          ${KN.util.raw(sp.parts.map((x) =>
            `<span class="diet-stack-key"><i class="is-${x.id}"></i>${x.label}
               <b class="mono-num">${x.kcal.toLocaleString()}</b></span>`).join(""))}
          ${sp.known && !sp.over ? html`
            <span class="diet-stack-key"><i class="is-rest"></i>残り
              <b class="mono-num">${Math.round(sp.rest).toLocaleString()}</b></span>` : ""}
        </div>
        <p class="diet-note">
          ${sp.known ? html`
            総消費 <b class="mono-num">${Math.round(sp.burned).toLocaleString()}</b>kcal に対して、
            摂取は <b class="mono-num">${sp.intake.toLocaleString()}</b>kcal
            （<b>${sp.intakePct}%</b>）。${sp.over
              ? html`<b class="is-warn">${sp.overKcal.toLocaleString()}kcal 超えています。</b>`
              : ""}
          ` : html`
            総消費がまだ分からない日なので、割合ではなく<b>内わけ</b>として出しています
            （歩数や消費が入ると、総消費に対する割合になります）。
          `}
        </p>
      </div>
    `);
    return el;
  }

  function renderMeals(host, card, opts) {
    const peek = !!(opts && opts.peek);
    const t = card.totals;
    const rem = card.remaining;
    const pfc = card.pfc;
    const ai = store.dayMemo(card.day);          // AIの推計を入れておく一件
    const st = D.slotTotals(card.day);
    const foods = store.mealsOfDay(card.day)
      .reduce((a, m) => a.concat(m.items.filter((i) => i.from === "ai")), []);

    const sec = node(html`
      <div class="stack">
        <div class="section-title">${icon("meal")}${dayName(card.day)}の食事</div>

        <div class="diet-kcal">
          <div class="diet-kcal-main">
            <b class="mono-num">${t ? t.kcal.toLocaleString() : "—"}</b><small>kcal</small>
            ${/* 推定の幅。一つの数だけを出すと、推した値が測った値の顔をします。 */""}
            ${t && t.low != null && t.high != null ? html`
              <span class="badge badge-muted mono-num">${t.low.toLocaleString()}〜${t.high.toLocaleString()}</span>
            ` : (t && t.estimated ? html`<span class="badge badge-muted">推定を含む</span>` : "")}
          </div>
          ${card.drinkTotals ? html`
            <span class="badge badge-muted">＋ お酒 ${card.drinkTotals.estimated ? "約" : ""}${card.drinkTotals.kcal.toLocaleString()}kcal</span>
          ` : ""}
          ${rem ? html`
            <div class="diet-kcal-rem ${rem.kcal < 0 ? "is-over" : ""}">
              ${rem.kcal >= 0 ? html`残り <b class="mono-num">${rem.kcal.toLocaleString()}</b> kcal`
                              : html`<b class="mono-num">${Math.abs(rem.kcal).toLocaleString()}</b> kcal 超過`}
              <span class="diet-kcal-target">/ 目標 ${rem.target.toLocaleString()}</span>
            </div>` : ""}
        </div>

        <div class="js-stack"></div>

        ${/* 朝・昼・夜・間食は、はじめから四つとも出しておきます。
              「追加」を押してから区分を選ぶ作りだと、書くまでに二手
              かかって、そのぶん書かれなくなります。ここは開いた場所に
              そのまま書けます（打った先から保存します）。 */""}
        <div class="diet-slots js-slots"></div>

        ${/* AIの推計。押し方は前と同じ二段（プロンプトを作る → 返事を貼る）。 */""}
        <button class="diet-memo js-ai-open ${ai && ai.ai ? "" : "is-blank"}">
          <span class="diet-memo-head">
            <span class="diet-memo-ico">${icon("sparkles")}</span>
            <b>AI推計</b>
            <span class="diet-memo-hint">${ai && ai.ai ? "もう一度" : ""}</span>
          </span>
          <span class="diet-memo-body">${ai && ai.ai
            ? `${(ai.ai.kcal == null ? "—" : ai.ai.kcal.toLocaleString())}kcal ・ 食品 ${foods.length}件`
              + (ai.ai.at ? `（${U.formatStamp(ai.ai.at)}）` : "")
            : "＋ 食べたものをAIに推してもらう（プロンプトを作ってコピーします）"}</span>
        </button>

        ${/* エネルギー収支の評価は、AIが返してくれたときだけ短く出します。
              その日を開くたびに読めるように、ここに置きます（詳しくは
              「AI推計」を開けば同じ文が出ます）。 */""}
        ${ai && ai.ai && ai.ai.analysis ? html`
          <p class="diet-note diet-ai-note">${ai.ai.analysis}</p>` : ""}

        ${/* 食品ごとの内わけは、持ってはいますが並べません。
              「納豆 90kcal P7 F5 C5」の行が十件並んでも、次の一手は
              変わらないからです。使うのは、区分ごとの合計（上の帯）と
              一日の合計だけ。細かい数と根拠・情報源はAIの返事の原文に
              残しています。 */""}
        ${card.drinkTotals ? html`
          <p class="diet-note">
            上の ${t ? t.kcal.toLocaleString() : "0"}kcal は<b>食べたもの</b>だけの数です。
            お酒のぶんを足すと
            <b class="mono-num">${((t ? t.kcal : 0) + card.drinkTotals.kcal).toLocaleString()}kcal</b>
            になります（お酒は栄養の内わけを持たないので、PFCには入れていません）。
          </p>` : ""}
        ${/* PFCは数だけ置きます。棒にすると、目標を決めていない人には
              「内わけ」、決めた人には「進み具合」と、同じ絵が二つの
              意味を持ちます。数なら、どちらの読み方でも間違いません。 */""}
        ${t ? html`
          <div class="diet-pfc-nums">
            ${KN.util.raw(["p", "f", "c"].map((k) => {
              const name = { p: "P", f: "F", c: "C" }[k];
              const goalV = store.get().diet.goal[k + "Target"];
              return `
                <span class="diet-pfc-num ${goalV && t[k] > goalV ? "is-over" : ""}">
                  <i>${name}</i><b class="mono-num">${t[k]}</b>g${goalV ? `<small>/${goalV}</small>` : ""}
                </span>`;
            }).join(""))}
            ${t.fiber != null ? html`
              <span class="diet-pfc-num"><i>繊維</i><b class="mono-num">${t.fiber}</b>g</span>` : ""}
            ${pfc ? html`<span class="diet-pfc-ratio">熱量比 P${pfc.p}% F${pfc.f}% C${pfc.c}%</span>` : ""}
          </div>` : ""}
      </div>
    `);

    const bar = energyBar(card.day);
    if (bar) sec.querySelector(".js-stack").append(bar);
    buildSlotBoxes(sec.querySelector(".js-slots"), card.day, st, { peek });

    sec.querySelector(".js-ai-open").addEventListener("click", () => openAiSheet(card.day));
    host.append(sec);
    // 高さは、置いてからでないと測れません（幅が決まっていないので）。
    sec.querySelectorAll(".js-slot-memo").forEach(grow);
  }

  /* ---------------- 朝・昼・夜・間食の四枠 ----------------

     四つとも最初から出しておいて、開いた場所にそのまま書きます。
     時刻は聞きません——あとから使うのは「いつ食べたか」ではなく
     「どの食事だったか」だけなので、聞くと入力が一つ増えるだけです。

     打った先から保存します。「保存」を押さずに閉じても残ります
     （押し忘れで消えるほうが、間違って残るよりずっと痛い）。 */

  /* 空の枠に置くのは、例ではなくハイフンだけです。例を書いておくと、
     「この形で書かないといけない」と読まれます（書き方は自由です）。 */
  const SLOT_PLACEHOLDER = "-";

  /** 打った量に合わせて、枠の高さを伸ばします。 */
  /* 枠の高さを、中身のぶんに合わせます。

     **紙に置かれるまでは測れません。** どこにも置かれていない枠の
     scrollHeight は 0 で、そのまま下限の38px（一行ぶん）に落ち着きます。
     食事の枠は組み立てたあとで画面へ差し込まれるので、その場で測ると
     必ず一行になり、保存した二行目から先が開くたびに隠れていました。

     測れないうちは、一枚あとの絵で測り直します。それでも置かれていない
     なら、その枠は捨てられたということなので、あきらめます。 */
  function grow(ta, retry) {
    if (!ta.isConnected || !ta.scrollHeight) {
      if (retry) return;
      requestAnimationFrame(() => grow(ta, true));
      return;
    }
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 38)}px`;
  }

  /** 書きかけを、画面を組み直す前に落とします（render の頭で呼びます）。 */
  let flushSlots = () => {};
  /** 食事の四枠を保存しているあいだ（この間は組み直しません）。 */
  let saving = false;

  /* ---------------- 書いたものの絵 ----------------

     このアプリには 708 枚の手描きの絵があります（icons-v2.js）。玉ねぎには
     玉ねぎ、卵には卵。買うものと価格の二画面でしか使っていませんでした
     ——アプリで**いちばんよそに無いもの**が、二画面だけの方言でした。

     食事の枠に書くのは、まさにその 708 枚が描いているものです。「トースト、
     ゆで卵、コーヒー」と打てば、その三つの絵が見出しに並びます。字を読まずに
     「今日の朝は何を食べたか」が見えるようになりますし、書いたものが絵に
     なって返ってくるのは、それ自体が書く理由になります。

     出すのは絵だけです。名前も数も、下の枠にすでに書いてあります。
     引けなかったものは**何も出しません**——「？」のような代わりの絵を置くと、
     読めなかったことを画面に貼り出すことになります。

     多くても五つ。それ以上は絵が 20px より小さくなり、小さい絵は
     「何かある」以上のことを言えません。 */
  const MARK_MAX = 5;
  /* 区切りは、人が実際に打つもの全部。読点・コンマ・中黒・改行・空白。 */
  const MARK_SPLIT = /[、,，・･\n\r\/／]+|\s{1,}/;

  function slotMarks(text) {
    const line = String(text || "").trim();
    if (!line) return [];
    const seen = new Set();
    const out = [];
    for (const piece of line.split(MARK_SPLIT)) {
      const raw = piece.trim();
      if (!raw) continue;
      // 「卵2個」「ご飯150g」の、量のほうを落とします。
      const parsed = KN.foodData && KN.foodData.parseLine(raw);
      const name = (parsed && parsed.name) || raw;
      const key = KN.productIcons.findKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
      if (out.length >= MARK_MAX) break;
    }
    return out;
  }

  function paintMarks(host, text) {
    if (!host) return;
    const keys = slotMarks(text);
    host.innerHTML = "";
    host.hidden = !keys.length;
    keys.forEach((k) => {
      const i = document.createElement("i");
      i.className = "diet-slot-mark";
      i.innerHTML = KN.productIcons.byKey(k) || "";
      host.append(i);
    });
  }

  function buildSlotBoxes(host, day, st, opts) {
    const inSheet = !!(opts && opts.sheet);
    // カルーセルの前日・翌日の紙（本物だが押せない・打てない）。
    const peek = !!(opts && opts.peek);
    const boxes = [];
    SLOTS.forEach((sl) => {
      const text = store.slotMemo(day, sl.id);
      const kcal = st ? st[sl.id] : 0;
      const box = node(html`
        <div class="diet-slot" data-slot="${sl.id}">
          <div class="diet-slot-head">
            <span class="diet-slot-ico">${icon(sl.ico)}</span>
            <b class="diet-slot-name">${sl.short}</b>
            ${/* 書いたものの絵。打つそばから増えます（下の input を参照）。 */""}
            <span class="diet-slot-marks js-marks" aria-hidden="true" hidden></span>
            <span class="diet-slot-kcal mono-num">${kcal ? `${kcal.toLocaleString()}kcal` : ""}</span>
          </div>
          <textarea class="textarea diet-slot-memo js-slot-memo" data-slot="${sl.id}" rows="1"
                    spellcheck="false" autocapitalize="sentences"
                    aria-label="${sl.label}に食べたもの"
                    placeholder="${SLOT_PLACEHOLDER}">${text}</textarea>
        </div>
      `);
      const ta = box.querySelector("textarea");
      const marks = box.querySelector(".js-marks");
      ta.dataset.saved = text;
      boxes.push(ta);
      paintMarks(marks, text);
      host.append(box);
      /* 高さを合わせるのは、**紙に置いてから**です。

         ここは append より前にありました。まだどこにも置かれていない枠の
         scrollHeight は 0 なので、下限の38px（一行ぶん）に落ち着きます。
         打っているあいだは伸びるのに、書いて閉じて開き直すと一行に戻って
         いた——保存した二行目から先が、開くたびに隠れていました。 */
      grow(ta);
      if (peek) return;   // 押せない紙なので、保存の配線は要りません。
      let timer = 0;
      const save = () => {
        clearTimeout(timer);
        timer = 0;
        const val = ta.value.trim();
        if (val === ta.dataset.saved) return false;
        /* 保存すると記録が変わり、画面がまるごと組み直されます。打っている
           最中にそれをやると、いま指を置いている枠ごと入れ替わって、
           次の一文字が行き場を失います。自分の保存のあいだだけ止めます
           （文が変わっても、上の数や帯は変わりません）。 */
        saving = true;
        try { store.setSlotMemo(day, sl.id, val); } finally { saving = false; }
        ta.dataset.saved = val;
        return true;
      };
      ta.addEventListener("input", () => {
        grow(ta);
        /* 絵は保存を待ちません。打っているそばから増えるからこそ、
           「書くと絵になる」が分かります（保存は600ms後）。 */
        paintMarks(marks, ta.value);
        // 行が増えて枠が伸びると、欄の下端がまたキーボードに隠れうるので測り直します。
        if (!inSheet) nudgeIntoView(ta);
        if (inSheet) return;      // シートでは「保存」を押したときだけ書きます
        clearTimeout(timer);
        timer = setTimeout(save, 600);
      });
      if (!inSheet) ta.addEventListener("blur", save);
      ta.__save = save;
    });
    const flush = () => boxes.reduce((a, ta) => (ta.__save ? ta.__save() : false) || a, false);
    if (!inSheet && !peek) flushSlots = flush;
    return { boxes, flush };
  }

  /* ---------------- 食事のメモ ----------------

     一日ぶんを一枚に書きます。朝に「トースト」と書き、昼に「そば」と
     足していく——それだけで一日が残ります。

     夜、そのメモをまるごとAIに貼って、返ってきた推計をまた貼り戻す——
     その道を、二つのボタンにしました。

       「AI用プロンプトを作成」… 決まった聞き方＋その日のメモを、
                                 ひとつの文にしてコピーします。
       「AI結果を読み取る」    … 返ってきた7行から数だけを拾います。

     アプリからAIへ直接つなぎません。**鍵を持たないため**です。ここに
     APIキーを置けば、このページを開いた誰でもそれを読めます（設定の
     「AIの窓口」は、鍵を自分の中継所に置く人のための別の道です）。 */

  /* 聞き方は、こちらで決めて渡します。毎回ちがう聞き方をすると、
     返ってくる形もちがって、読み取れなくなるので。

     聞くのは二段です。**食品ごと**の内わけと、そのあとに一日の**合計**。
     合計だけでは「何を食べた結果そうなったか」が残らず、あとから
     「あの日の夜が重かったのか」を確かめられません。 */
  const AI_ITEM_LINES = [
    "食品: 名前",
    "量: 1パック",
    "カロリー: 数値",
    "タンパク質: 数値",
    "脂質: 数値",
    "炭水化物: 数値",
    "食物繊維: 数値",
    "区分: 朝",
    "根拠: 何を見て決めたか（例: 商品ページの栄養成分表示／標準的な食品成分データ）",
    "情報源: サイト名とURL（検索していなければ「AIの推定」）",
    "確度: 高・中・低のいずれか",
  ];
  /* 区分ごとの小計。食品の行に「区分」が付いていれば足せば出せますが、
     AIは案外そこを落とします。小計として名指しで書いてもらえば、
     区分の分からない日でも帯が引けます。 */
  const AI_SLOT_LINES = [
    "朝合計: 数値",
    "昼合計: 数値",
    "夜合計: 数値",
    "間食合計: 数値",
  ];
  const AI_LINES = [
    "摂取カロリー: 数値",
    "タンパク質: 数値",
    "脂質: 数値",
    "炭水化物: 数値",
    "食物繊維: 数値",
    "推定下限: 数値",
    "推定上限: 数値",
  ];

  /**
   * AIへの聞き方。memo は食事メモ（【朝】…の形）、ctx は今日のからだの
   * 記録と直近の記録（どちらも任意——無ければその見出しごと出しません）。
   *
   * くらしノート自身はWebを検索しません。ここで頼んでいるのは、貼り付け先の
   * ChatGPT等に検索・確認・分析までしてもらうことです——「AIへコピー」で
   * 渡す一つの文を作るのが、この関数の仕事です。
   */
  function aiPrompt(memo, ctx) {
    const c = ctx || {};
    const lines = [
      "次の「食事メモ」から、その日に食べたものの栄養を推定してください。",
      "",
      "【条件】",
      /* お酒は「見なかったこと」にしていましたが、その日のエネルギーの
         いちばん大きな一角になる日があります。数は【今日の記録】で渡すので、
         **評価と気づいたことでは必ず織り込んで**もらいます。

         ただし食品ごとの行と合計には入れません——アプリが摂取カロリーに
         お酒のぶんを自分で足しているので（画面の「＋お酒 Nkcal」）、
         向こうでも足すと二重になります。数える場所は一つだけにします。 */
      "・お酒（アルコール飲料）は、食品ごとの行と『摂取カロリー』の合計には"
        + "含めないでください（アプリ側で別に加算しています）。",
      "・ただし【今日の記録】の「飲酒」に、その日のお酒の量とカロリーが書いてあります。"
        + "エネルギー収支の評価と気づいたことでは、**お酒のぶんも合わせた一日**として"
        + "見てください（食事だけの評価にしないでください）。",
      "・食品の区切りは、スペース・読点（、）・中黒（・）・カンマ・スラッシュ・改行など、"
        + "どれでもかまいません。区切り記号にかかわらず、別々の食品として扱ってください。",
      "・商品名やメーカー名など、具体的な市販食品はWeb検索して栄養成分を確認してください。"
        + "可能な限り、公式サイト・メーカーの商品ページ・パッケージの栄養成分表示を優先してください。",
      "・銘柄の分からない一般的な食品は、日本食品標準成分表など信頼できる標準的な"
        + "食品成分データを使ってください。",
      "・検索して確認できた食品は、情報源（サイト名とURL）を書いてください。"
        + "確認できなかった食品は、根拠にAIによる推定であることを明示してください。",
      "・分量が書いていないものは、一般的な一人前として妥当な量を推定してください。",
      "・細かすぎる値にはせず、妥当な範囲の概数で答えてください。",
      "・カロリーは kcal、ほかは g で答えてください（数値のほかに単位は付けず、"
        + "説明は「根拠」の行にまとめてください）。",
      "・「区分」は 朝・昼・夜・間食 のどれかで、メモの【朝】【昼】【夜】【間食】に合わせてください。",
      "・推定下限と推定上限は、その日の摂取カロリーの推定の幅です。",
      "・「今日の記録」が渡されていれば、摂取と総消費の差からその日のエネルギー収支を計算し、"
        + "簡潔に評価してください。",
      "・「直近の記録」が渡されていれば、最近の傾向や個人内の変化にも触れてください。",
      "・相関や傾向は、そのまま原因と結果として断定しないでください。",
      /* まだ終わっていない日に、「まだ無いもの」を評価されると当たり前のことを
         言われます。昼に推してもらって「今日はお酒を飲んでいませんね」と
         褒められる——飲む時間になっていないだけです。無いのではなく、まだ無い。 */
      "・「今日はまだ終わっていません」と書かれている場合、**まだ記録の無いもの**"
        + "（お酒、これから食べる区分など）について、評価・称賛・助言をしないでください。"
        + "「まだ飲んでいない」「夜を抜いている」といった書き方もしないでください——"
        + "その時点で無いのは当たり前で、判断の材料になりません。",
      "・その場合は、**すでに記録されているもの**だけを見てください。"
        + "一日の合計や収支も「この時点まで」の話として扱ってください。",
      "",
      "【返し方】まず食品ごとに次の行を繰り返し、次に区分ごとの合計、"
        + "そのあとに一日の合計、最後にエネルギー収支の評価と気づいたことを書いてください。",
      "この形だけを返してください（前置きは要りません）。",
      "",
      AI_ITEM_LINES.join("\n"),
      "",
      "（食品の数だけ繰り返し。そのあとに区分ごとの合計）",
      "",
      AI_SLOT_LINES.join("\n"),
      "",
      "（そのあとに一日の合計）",
      "",
      AI_LINES.join("\n"),
      "",
      "（そのあとに、エネルギー収支の評価と気づいたことを自由に）",
      "評価: 文章",
      "",
      "【食事メモ】",
      String(memo || "").trim(),
    ];
    if (c.body) lines.push("", "【今日の記録】", c.body);
    if (c.recent) lines.push("", "【直近の記録】", c.recent);
    return lines.join("\n");
  }

  /* 返事の読み取り。行の頭の飾り（- や *）、全角のコロン、単位、
     「約」「およそ」、1800〜2000 のような幅——どれが来ても数を拾います。
     拾えなかった項目は null のままにします（0 で埋めると、聞いていない
     ことと「0だった」ことが同じになります）。

     食品の内わけと合計は、**同じ言葉**を使います（「タンパク質」は
     どちらにも出てきます）。区切りは「摂取カロリー」で、そこから先が
     合計です。食品の行が一つも無い返事——前の形の7行だけ——も、
     これまでどおり読めます。 */
  const AI_KEYS = [
    { key: "low",   re: /(推定)?下限|最小|min/i },
    { key: "high",  re: /(推定)?上限|最大|max/i },
    { key: "fiber", re: /食物繊維|繊維|fiber/i },
    { key: "c",     re: /炭水化物|糖質|carb/i },
    { key: "f",     re: /脂質|脂肪|fat/i },
    { key: "p",     re: /たんぱく質|タンパク質|蛋白|protein/i },
    { key: "kcal",  re: /摂取カロリー|カロリー|エネルギー|kcal/i },
  ];

  const SLOT_WORDS = [
    { slot: "breakfast", re: /朝/ },
    { slot: "lunch",     re: /昼|ランチ/ },
    { slot: "dinner",    re: /夜|夕/ },
    { slot: "snack",     re: /間食|おやつ|軽食|夜食/ },
  ];
  const slotOf = (word) => (SLOT_WORDS.find((x) => x.re.test(String(word || ""))) || {}).slot || null;

  /** 「: 」の右側。無ければ行そのもの。 */
  const rhsOf = (raw) => {
    const at = raw.search(/[:：]/);
    return at < 0 ? raw : raw.slice(at + 1).trim();
  };
  const numOf = (str) => {
    const m = String(str || "").match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    const v = parseFloat(m[0].replace(",", ""));
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null;
  };

  /* 「朝合計: 350」「【夜】合計: 700」「間食: 120」——どれも区分ごとの
     小計として読みます。右が数でない行（「朝: 納豆」など）は小計では
     ないので、そのまま通します。 */
  const SLOT_SUM_RE = /^[【[]?\s*(朝|昼|夕|夜|間食|おやつ|軽食|夜食)(?:食|ごはん|ご飯)?\s*[】\]]?\s*(?:の)?\s*(?:合計|小計|計|総計|カロリー|kcal)?\s*[:：]/i;

  /* 「評価:」「分析:」「気づいたこと:」から先は、数ではなく自由な文です。
     一度この見出しに入ったら、あとは全部その文として拾います
     （途中に別の見出しらしき語が出てきても、数の読み取りには戻りません
     ——評価文の中に「タンパク質」という単語が出てくることもあるので）。 */
  const ANALYSIS_HEAD_RE = /^(評価|分析|気づいたこと|エネルギー収支|コメント)\s*[:：]?\s*/;

  function readAiReply(text) {
    const out = { kcal: null, p: null, f: null, c: null, fiber: null, low: null, high: null };
    const slots = { breakfast: null, lunch: null, dinner: null, snack: null };
    const foods = [];
    const analysisLines = [];
    let cur = null;                 // いま読んでいる食品
    let inTotals = false;           // 「摂取カロリー」から先は合計
    let inAnalysis = false;         // 「評価」から先は自由文
    let found = 0;

    const closeFood = () => {
      if (cur && (cur.kcal != null || cur.name)) foods.push(cur);
      cur = null;
    };

    String(text || "").split(/\r?\n/).forEach((line) => {
      const raw = line.trim().replace(/^[-・*＊●○\s]+/, "");

      if (inAnalysis) { if (raw) analysisLines.push(raw); return; }
      if (!raw) return;

      if (ANALYSIS_HEAD_RE.test(raw)) {
        closeFood();
        inTotals = true;
        inAnalysis = true;
        const rest = raw.replace(ANALYSIS_HEAD_RE, "").trim();
        if (rest) analysisLines.push(rest);
        return;
      }

      // 食品の始まり
      if (/^(食品|品目|料理|food|item)\s*[:：]/i.test(raw)) {
        closeFood();
        inTotals = false;
        const name = rhsOf(raw).replace(/[（(].*?[)）]\s*$/, "").trim();
        cur = { name: name || "（名前なし）", amount: "", slot: null,
                kcal: null, p: null, f: null, c: null, fiber: null,
                basis: "", source: "", confidence: "" };
        return;
      }
      if (cur && /^(量|分量|目安量|amount|qty)\s*[:：]/i.test(raw)) {
        cur.amount = rhsOf(raw).slice(0, 40);
        return;
      }
      if (cur && /^(区分|食事区分|slot|meal)\s*[:：]/i.test(raw)) {
        cur.slot = slotOf(rhsOf(raw));
        return;
      }
      /* Web検索の根拠・情報源・確度。くらしノート自身は検索しません——
         貼り付け先のAIが検索した結果を、そのまま拾って残すだけです。 */
      if (cur && /^(根拠|reasoning|basis)\s*[:：]/i.test(raw)) {
        cur.basis = rhsOf(raw).slice(0, 200);
        return;
      }
      if (cur && /^(情報源|出典|参照|source)\s*[:：]/i.test(raw)) {
        cur.source = rhsOf(raw).slice(0, 300);
        return;
      }
      if (cur && /^(確度|信頼度|confidence)\s*[:：]/i.test(raw)) {
        cur.confidence = rhsOf(raw).slice(0, 20);
        return;
      }

      /* 区分ごとの小計。食品の行より先に見ます——「間食合計: 120」は
         「カロリー」の仲間ではなく、区分の話なので。 */
      const sum = raw.match(SLOT_SUM_RE);
      if (sum) {
        const sl = slotOf(sum[1]);
        const v = numOf(rhsOf(raw));
        if (sl && v != null) {
          closeFood();
          inTotals = true;
          if (slots[sl] == null) { slots[sl] = v; found++; }
          return;
        }
      }

      const hit = AI_KEYS.find((k) => k.re.test(raw));
      if (!hit) return;
      const v = numOf(rhsOf(raw));
      if (v == null) return;

      /* 「摂取カロリー」は合計の始まりです（食品のほうは「カロリー」）。 */
      const totalsHead = /摂取カロリー|合計/.test(raw);
      if (totalsHead) { closeFood(); inTotals = true; }

      if (cur && !inTotals) {
        if (cur[hit.key] == null && ["kcal", "p", "f", "c", "fiber"].includes(hit.key)) cur[hit.key] = v;
        return;
      }
      if (out[hit.key] == null) { out[hit.key] = v; found++; }
    });
    closeFood();

    out.foods = foods;
    if (analysisLines.length) out.analysis = analysisLines.join("\n").slice(0, 2000);
    /* 小計が書かれていなくても、食品ごとに区分が付いていれば足せます。
       （どちらも無い日は null のまま——0 は「食べなかった」なので。） */
    if (!Object.keys(slots).some((k) => slots[k] != null)) {
      foods.forEach((x) => {
        if (!x.slot || x.kcal == null) return;
        slots[x.slot] = (slots[x.slot] || 0) + x.kcal;
      });
    }
    if (Object.keys(slots).some((k) => slots[k] != null)) out.slots = slots;
    /* 合計を書かずに食品だけ返してくるAIもいます。そのときは足して作ります
       ——読めているものから出せる数を、わざわざ空にする理由がありません。 */
    if (foods.length && out.kcal == null) {
      const sum = (k) => foods.reduce((a, x) => a + (x[k] || 0), 0);
      out.kcal = Math.round(sum("kcal"));
      ["p", "f", "c"].forEach((k) => { out[k] = Math.round(sum(k) * 10) / 10; });
      if (foods.some((x) => x.fiber != null)) out.fiber = Math.round(sum("fiber") * 10) / 10;
      out.summed = true;
      found += 4;
    }
    out.found = found + foods.length + (out.analysis ? 1 : 0);
    return out;
  }

  const AI_SHOW = [
    { key: "kcal",  label: "摂取カロリー", unit: "kcal" },
    { key: "p",     label: "タンパク質",   unit: "g" },
    { key: "f",     label: "脂質",         unit: "g" },
    { key: "c",     label: "炭水化物",     unit: "g" },
    { key: "fiber", label: "食物繊維",     unit: "g" },
    { key: "low",   label: "推定下限",     unit: "kcal" },
    { key: "high",  label: "推定上限",     unit: "kcal" },
  ];

  /**
   * AIの推計から、その日の合計に使う明細を作ります。
   *
   * 食品ごとに返ってきていれば、**その一件ずつ**を入れます（区分も一緒に）。
   * 合計しか返ってこなかったときは、これまでどおり「AI推計」の一件だけ。
   * どちらでも、その日の合計・PFC・気づいたことの数え方は変わりません。
   */
  function aiItem(ai) {
    if (!ai) return [];
    if (ai.foods && ai.foods.length) {
      return ai.foods.map((x) => ({
        name: x.name, amount: x.amount || "", slot: x.slot || null, grams: null,
        kcal: x.kcal || 0, p: x.p || 0, f: x.f || 0, c: x.c || 0,
        fiber: x.fiber, from: "ai", foodId: null, estimated: true,
        basis: x.basis || "", source: x.source || "", confidence: x.confidence || "",
      }));
    }
    if (ai.kcal == null && ai.p == null && ai.f == null && ai.c == null) return [];
    return [{
      name: "AI推計", grams: null, amount: "", slot: null,
      kcal: ai.kcal || 0, p: ai.p || 0, f: ai.f || 0, c: ai.c || 0,
      fiber: ai.fiber, from: "ai", foodId: null, estimated: true,
    }];
  }

  /* ---------------- 食事を書く ----------------

     朝・昼・夜・間食の四枠を、いちどに開きます。区分を選んでから書く
     のではなく、書きたいところに書く——一日ぶんを思い出しながら書くとき、
     順番はたいてい前後するので。

     時刻は聞きません。数もここでは聞きません（AIに推してもらう道が
     別にあります）。 */
  function openMealMemoSheet(day0, existing, slotHint) {
    const day = day0 || curDay();
    /* 前の作りで書いた「一日ぶんのメモ」（slot:"memo"）が残っている日は、
       その文も見せます。区分に写せば、そちらの一件になります。 */
    const legacy = store.dayMemo(day);
    const legacyText = legacy && (legacy.memo || "").trim() ? legacy.memo.trim() : "";
    const hint = slotHint || (existing && existing.slot !== "memo" ? existing.slot : null);

    const body = node(html`
      <div class="stack">
        <div class="diet-daynav"><b>${U.formatDay(day)}</b></div>
        <div class="diet-slots js-slots"></div>
        <p class="diet-note">
          量は書いても書かなくてもかまいません（書いていないものは、AIが
          一般的な一人前として推します）。時刻は要りません——あとで使うのは
          「どの食事だったか」だけです。
        </p>
        ${legacyText ? html`
          <div class="field">
            <span class="field-label">前に一日ぶんで書いたもの</span>
            <div class="diet-read"><div class="diet-drink-row"><b>${legacyText}</b></div></div>
            <button type="button" class="btn btn-soft js-legacy">この文を消す（推計は残ります）</button>
          </div>` : ""}
      </div>
    `);

    const foot = node(html`
      <button class="btn btn-primary btn-block js-save">保存</button>
    `);
    const h = KN.ui.sheet({ title: "食事を書く", content: body, footer: foot, guard: true });

    const built = buildSlotBoxes(body.querySelector(".js-slots"), day, D.slotTotals(day), { sheet: true });
    built.boxes.forEach(grow);
    const first = built.boxes.find((ta) => ta.dataset.slot === (hint || guessSlot())) || built.boxes[0];
    KN.ui.focusNow(first);

    foot.addEventListener("click", () => {
      built.flush();
      KN.motion.fire("save");
      h.close();
      render();
      KN.ui.toast("書きました");
    });

    const leg = body.querySelector(".js-legacy");
    if (leg) leg.addEventListener("click", async () => {
      const ok = await KN.ui.confirm({ title: "この文を消す", message: "AIの推計は残ります。",
                                       okLabel: "消す", danger: true });
      if (!ok) return;
      store.setDayMemo(day, "");
      h.close();
      render();
      KN.ui.toast("消しました");
    });
  }

  /**
   * その日の食事メモを、区分つきで一本の文に。AIに渡すのはこれです。
   *
   *   【朝】納豆 卵
   *   【昼】給食 そば
   *
   * 区切りを【】にしたのは、返事でも同じ言葉で区分を書いてもらうためです。
   * 「朝:」だと、メモの本文に出てくる「朝ごはんの残り」のような書き方と
   * 見分けがつきません。書いていない区分は行ごと出しません——空の行を
   * 渡すと、そこに何か推してくるAIがいます。
   */
  function dayMemoText(day) {
    /* 一つの区分に何行書いてもかまいません。渡すときは読点でつなぎます
       ——行のままだと、どこまでが【朝】の中身か分かりにくくなるので。 */
    const oneLine = (text) => String(text || "").split(/\n+/).map((x) => x.trim()).filter(Boolean).join("、");
    const rows = SLOTS.map((sl) => {
      const text = oneLine(store.slotMemo(day, sl.id));
      return text ? `【${sl.short}】${text}` : null;
    }).filter(Boolean);
    // 前の作りで書いた「一日ぶんのメモ」も、残っていれば一緒に渡します。
    const legacy = store.dayMemo(day);
    if (legacy && (legacy.memo || "").trim()) rows.push(oneLine(legacy.memo));
    return rows.join("\n");
  }

  /**
   * その日のからだの記録（体重・体脂肪率・歩数・総消費・睡眠・飲酒）を、
   * AIに渡す一つの文に。書いていない項目は行ごと出しません——空欄を
   * 「0だった」と読まれないように。
   */
  function dayBodyText(day) {
    const card = D.dayCard(day);
    const rows = [];
    /* その日がまだ終わっていないなら、いちばん先にそう言います。

       言わないと、昼に推してもらった日の「飲酒: なし」が、一日ぶんの事実
       として読まれます——まだ飲む時間になっていないだけなのに、「今日は
       飲んでいませんね」と褒められることになる。無いのではなく、**まだ
       無い**。その区別は時刻を渡さないと向こうには作れません。 */
    const live = day === U.todayKey();
    if (live) {
      rows.push(`※ この記録は ${U.nowTime()} 時点のもので、今日はまだ終わっていません。`);
    }

    if (card.weight) {
      rows.push(`体重: ${card.weight.kg}kg`);
      if (card.weight.fat != null) rows.push(`体脂肪率: ${card.weight.fat}%`);
    }
    if (card.steps != null) rows.push(`歩数: ${Math.round(card.steps)}歩`);
    if (card.burned != null) rows.push(`総消費カロリー: ${Math.round(card.burned)}kcal`);
    if (card.sleep != null) rows.push(`睡眠: ${hm(card.sleep)}`);
    /* お酒は量だけでなく kcal も渡します。渡さないまま「お酒も含めて見て」と
       頼んでも、向こうは数を持っていないので、評価に混ぜようがありません。 */
    rows.push(card.drinkTotals
      ? `飲酒: 純アルコール${card.drinkTotals.alcoholG}g`
        + `（目安${alcoholGuide()}gの${Math.round(card.drinkTotals.alcoholG / alcoholGuide() * 100)}%）`
        + ` ／ ${card.drinkTotals.estimated ? "約" : ""}${card.drinkTotals.kcal}kcal`
      : (live ? "飲酒: この時点ではまだ記録なし（未確定）" : "飲酒: なし"));
    return rows.join("\n");
  }

  /**
   * 直近の記録を、日ごと一行の表に。「必要に応じて」なので、何も無い日は
   * 出しません——空の行を並べても、傾向の材料にならないので。
   */
  function recentText(day, spanDays) {
    const n = spanDays || 7;
    const rows = [];
    for (let i = 1; i <= n; i++) {
      const d = U.shiftDay(day, -i);
      const c = D.dayCard(d);
      if (!c.weight && !c.totals && c.steps == null) continue;
      const parts = [U.formatDay(d)];
      if (c.weight) parts.push(`体重${c.weight.kg}kg`);
      if (c.totals) parts.push(`摂取${c.totals.kcal.toLocaleString()}kcal`);
      if (c.burned != null) parts.push(`総消費${Math.round(c.burned).toLocaleString()}kcal`);
      if (c.steps != null) parts.push(`歩数${Math.round(c.steps).toLocaleString()}`);
      rows.push(parts.join(" ／ "));
    }
    return rows.join("\n");
  }

  /** 保存してある明細から、AIの「食品ごと」の形に戻します。 */
  function foodsOf(rec) {
    if (!rec) return [];
    return rec.items.filter((i) => i.from === "ai" && i.name !== "AI推計").map((i) => ({
      name: i.name, amount: i.amount || "", slot: i.slot || null,
      kcal: i.kcal, p: i.p, f: i.f, c: i.c, fiber: i.fiber,
      basis: i.basis || "", source: i.source || "", confidence: i.confidence || "",
    }));
  }

  function openAiSheet(day0) {
    const day = day0 || curDay();
    const cur = store.dayMemo(day);
    const memoText = dayMemoText(day);
    // 「AIへコピー」に自動で乗せる、今日のからだの記録と直近の記録。
    const bodyText = dayBodyText(day);
    const recent = recentText(day, 7);
    /* 手で書いた明細（前の作りで入れたもの）は触りません。AIのぶんだけを
       入れ替えます。 */
    const handItems = cur ? cur.items.filter((i) => i.from !== "ai").map((i) => ({ ...i })) : [];
    let ai = cur && cur.ai ? { ...cur.ai, foods: foodsOf(cur) } : null;

    const body = node(html`
      <div class="stack">
        <div class="diet-daynav"><b>${U.formatDay(day)}</b></div>
        ${memoText ? html`
          <div class="diet-read"><div class="diet-drink-row"><b>${memoText}</b></div></div>
        ` : html`
          <p class="diet-note is-warn">この日の食事がまだ書かれていません。
            先に「食事を書く」で、食べたものを入れてください。</p>`}
        <button class="btn btn-soft btn-block js-prompt">${icon("copy")}AI用プロンプトを作成</button>
        <p class="diet-note">
          決まった聞き方と、食事メモ・<b>今日の体重や歩数・総消費・睡眠・飲酒</b>・
          直近の記録をひとつの文にしてコピーします。ChatGPTなどに貼ってください
          （<b>Web検索や情報源の確認、栄養推定、傾向の分析</b>は、貼った先のAIが行います
          ——くらしノート自身は検索しません）。
          返ってきた行をそのまま下の欄に貼り戻せば、<b>食品ごとの内わけ（根拠・情報源つき）</b>、
          <b>朝・昼・夜・間食それぞれの合計</b>、<b>一日の合計</b>、<b>その日の評価</b>が保存されます。
          <b>お酒は入れません</b>——お酒は別に記録していて、カロリーもそちらで数えます。
        </p>

        <div class="divider"></div>
        <div class="section-title">AI推計結果</div>
        ${/* 貼ったら、その場で読みます。押すボタンを一つ挟むと、逐次
              貼り替える使い方では毎回二度手間になります。消すボタンは
              枠の中に——次を貼るのに、まず選んで消す必要がないように。 */""}
        <div class="ta-wrap">
          <textarea class="textarea js-ai" rows="8" spellcheck="false"
                    autocapitalize="off" autocorrect="off"
                    placeholder="食品: 納豆&#10;量: 1パック&#10;カロリー: 90&#10;タンパク質: 7&#10;脂質: 5&#10;炭水化物: 5&#10;食物繊維: 3&#10;区分: 朝&#10;…&#10;朝合計: 350&#10;摂取カロリー: 1700"
                    aria-label="AIの返事">${cur && cur.ai ? cur.ai.raw : ""}</textarea>
          <button type="button" class="ta-clear js-clear" aria-label="消して貼り直す" hidden>
            ${icon("close")}
          </button>
        </div>
        <div class="js-got"></div>
        <div class="js-items"></div>
      </div>
    `);

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-primary js-save" style="flex:1">保存</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "AIに推してもらう", content: body, footer: foot, guard: true });
    const aiTa = body.querySelector(".js-ai");

    /* ---- ① プロンプトを作ってコピー ---- */
    body.querySelector(".js-prompt").addEventListener("click", () => {
      if (!memoText) { KN.ui.toast("先に食べたものを書いてください"); return; }
      const text = aiPrompt(memoText, { body: bodyText, recent });
      copyText(text).then((ok) => {
        KN.motion.fire("select");
        if (ok) { KN.ui.toast("コピーしました。AIに貼ってください"); return; }
        // 断られる端末があります。その時は、長押しで拾えるように出します。
        showPrompt(text);
        KN.ui.toast("自動でコピーできませんでした。下の文を長押しでコピーしてください");
      });
    });

    function showPrompt(text) {
      const host = body.querySelector(".js-got");
      host.innerHTML = "";
      const box = node(html`
        <div class="stack">
          <textarea class="textarea js-out" rows="8" readonly aria-label="AIに貼る文">${text}</textarea>
        </div>
      `);
      host.append(box);
      const out = box.querySelector(".js-out");
      out.focus();
      try { out.setSelectionRange(0, out.value.length); } catch (err) { /* 選べなくても読めます */ }
    }

    /* ---- ② 返ってきたものを読み取る ---- */
    function paintAI() {
      const host = body.querySelector(".js-items");
      host.innerHTML = "";
      if (!ai) {
        host.append(node(html`<p class="diet-note">まだ推計はありません。食事メモだけでも保存されています。</p>`));
        return;
      }
      /* 食品ごとの数は、保存はしますが並べません（読み合わせても
         次の一手が変わらないので）。ここで見せるのは、区分ごとの合計と
         一日の合計——帯と数に出るのはこの二つだけです。
         情報源・確度は、件数の要約だけ添えます（何を確認できたかが
         分かれば十分で、一件ずつ見比べる場面は多くないので）。 */
      if (ai.foods && ai.foods.length) {
        const sourced = ai.foods.filter((x) => x.source && !/^AIの推定/.test(x.source)).length;
        const high = ai.foods.filter((x) => /高/.test(x.confidence || "")).length;
        host.append(node(html`
          <p class="diet-note">食品 ${ai.foods.length}件を読み取りました
            ${sourced ? `（情報源つき ${sourced}件${high ? `・確度「高」${high}件` : ""}）` : ""}。</p>`));
      }
      if (ai.slots) {
        host.append(node(html`
          <div class="diet-read">
            ${KN.util.raw(SLOTS.map((sl) => `
              <div class="diet-read-row">
                <span class="diet-read-name">${sl.short}</span>
                <b class="mono-num">${ai.slots[sl.id] == null ? "—" : ai.slots[sl.id].toLocaleString()}</b>
                <span class="diet-read-day">${ai.slots[sl.id] == null ? "書かれていません" : "kcal"}</span>
              </div>`).join(""))}
          </div>`));
      }
      host.append(node(html`
        <div class="diet-read">
          ${KN.util.raw(AI_SHOW.map((r) => `
            <div class="diet-read-row">
              <span class="diet-read-name">${r.label}</span>
              <b class="mono-num">${ai[r.key] == null ? "—" : ai[r.key].toLocaleString()}</b>
              <span class="diet-read-day">${ai[r.key] == null ? "読めませんでした" : r.unit}</span>
            </div>`).join(""))}
        </div>
      `));
      if (ai.analysis) {
        host.append(node(html`
          <div class="field">
            <span class="field-label">その日の評価</span>
            <div class="diet-read"><div class="diet-drink-row"><b>${ai.analysis}</b></div></div>
          </div>`));
      }
      host.append(node(html`
        <p class="diet-note">${ai.summed
          ? "合計は書かれていなかったので、食品ごとの数を足しました。"
          : "この内容で保存します。"}
          数が違っていれば、AIの返事の欄を直してもう一度「AI結果を読み取る」を押してください。</p>`));
    }

    /* 貼った（打った）そばから読みます。読めた・読めないは下に出るので、
       押して確かめるボタンは要りません。読めない文をそのままにしても、
       いまの推計は消しません——**読めたときだけ**入れ替えます。 */
    const clearBtn = body.querySelector(".js-clear");
    let readTimer = 0;
    let said = "";
    function paintClear() { clearBtn.hidden = !aiTa.value.trim(); }

    function readNow() {
      const raw = aiTa.value.trim();
      paintClear();
      if (!raw) { ai = null; said = ""; paintAI(); return; }
      const res = readAiReply(raw);
      if (!res.found) { paintAI(); return; }
      ai = { ...res, raw, at: new Date().toISOString() };
      delete ai.found;
      paintAI();
      // 同じ中身で何度も言いません（打ちながらだと一文字ごとに鳴ります）。
      const nSlot = res.slots ? Object.keys(res.slots).filter((k) => res.slots[k] != null).length : 0;
      const line = res.foods.length
        ? `食品${res.foods.length}件${nSlot ? `・区分${nSlot}件` : ""}と合計を読み取りました`
        : (nSlot ? `区分${nSlot}件と合計を読み取りました` : "合計を読み取りました");
      if (line !== said) { said = line; KN.ui.toast(line); KN.motion.fire("select"); }
    }

    aiTa.addEventListener("input", () => {
      paintClear();
      clearTimeout(readTimer);
      readTimer = setTimeout(readNow, 180);
    });
    // 貼り付けは、打つのと違って一度で終わります。待たずに読みます。
    aiTa.addEventListener("paste", () => { clearTimeout(readTimer); setTimeout(readNow, 0); });

    clearBtn.addEventListener("click", () => {
      aiTa.value = "";
      ai = null;
      said = "";
      paintClear();
      paintAI();
      KN.ui.focusNow(aiTa);
      KN.motion.fire("select");
    });

    paintClear();
    paintAI();

    foot.querySelector(".js-save").addEventListener("click", () => {
      /* 打ち終えた直後（読み取りの一拍が来る前）に押されることがあります。
         そのときのために、保存の前にもう一度だけ読みます。 */
      clearTimeout(readTimer);
      if (aiTa.value.trim() && (!ai || ai.raw !== aiTa.value.trim())) {
        const res = readAiReply(aiTa.value);
        if (res.found) { ai = { ...res, raw: aiTa.value.trim(), at: new Date().toISOString() }; delete ai.found; }
      }
      if (!aiTa.value.trim()) ai = null;
      const rec = store.dayMemo(day);
      store.setDayMemo(day, rec ? rec.memo : "", handItems.concat(aiItem(ai)), ai);
      KN.motion.fire("save");
      h.close();
      render();
      KN.ui.toast("保存しました");
    });
  }

  /** クリップボードへ。断られたら false を返します（例外は投げません）。 */
  function copyText(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.resolve(false);
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }

  /* 気づいたことの絵。何の話かを、読む前に見せます。 */
  const FINDING_ICON = {
    change:        "trend",
    "steps-weeks": "steps",
    "kcal-weeks":  "flame",
    sleep:         "moon",
    weekend:       "sun",
    pfc:           "meal",
    balance:       "flame",
    slot:          "meal",
    dinner:        "moon",
    fiber:         "heart",
    drink:         "drink",
    meal:          "meal",
    clothed:       "scale",
  };

  /* ---------------- 気づいたこと ---------------- */

  function renderInsight(host) {
    const found = D.analyze(analysisWindow);
    const cov = D.coverage(analysisWindow);
    const aiOn = KN.dietAI.configured();

    const sec = node(html`
      <div class="stack">
        <div class="section-title">${icon("sparkles")}気づいたこと</div>
        <div class="js-win"></div>
        ${found.length ? html`
          <div class="diet-findings">
            ${KN.util.raw(found.map((f) => `
              <div class="diet-finding is-${f.tone || "info"}">
                <span class="diet-finding-ico">${icon(FINDING_ICON[f.id] || "sparkles")}</span>
                <div class="diet-finding-text">
                  <b>${KN.util.escapeHtml(f.title)}</b>
                  <p>${KN.util.escapeHtml(f.text)}</p>
                </div>
              </div>`).join(""))}
          </div>
        ` : html`
          <div class="empty diet-empty">
            <div class="empty-text">まだ言えることがありません。<br>
              直近${cov.days}日のうち、体重 ${cov.weight}日・食事 ${cov.meals}日・歩数 ${cov.steps}日ぶんの記録です。</div>
          </div>`}
        ${/* 「これは関連であって因果ではありません」の但し書きは外しました。
              毎回同じ文が下に付くと、読み飛ばす癖のほうが先に付きます。
              言い方そのものを、断定しない形にしてあります（diet.js）。 */""}
        ${aiOn ? html`
          <button class="btn btn-soft btn-block js-ai">${icon("sparkles")}AIに相談する</button>
        ` : ""}
      </div>
    `);

    KN.ui.chipRow(sec.querySelector(".js-win"),
      [{ id: 14, label: "14日" }, { id: 30, label: "30日" }, { id: 90, label: "90日" }],
      { activeId: analysisWindow, onPick: (id) => { analysisWindow = Number(id); render(); } });

    const ai = sec.querySelector(".js-ai");
    if (ai) ai.addEventListener("click", askAI);
    host.append(sec);
  }

  function askAI() {
    const body = node(html`
      <div class="stack">
        <label class="field">
          <span class="field-label">聞きたいこと</span>
          <input class="input js-q" value="ここ2週間の傾向と、来週やるといいことを教えて">
        </label>
        <p class="diet-note">直近30日ぶんの体重・食事・歩数・睡眠を窓口へ送ります。
          買い物リストとやることは送りません。</p>
        <div class="js-out"></div>
      </div>
    `);
    const foot = node(html`<button class="btn btn-primary btn-block js-go">相談する</button>`);
    const h = KN.ui.sheet({ title: "AIに相談", content: body, footer: foot });
    foot.querySelector(".js-go").addEventListener("click", () => {
      const out = body.querySelector(".js-out");
      out.innerHTML = "";
      out.append(node(html`<p class="diet-note">考えています…</p>`));
      KN.dietAI.coach(body.querySelector(".js-q").value, 30)
        .then((text) => {
          out.innerHTML = "";
          out.append(node(html`<div class="diet-ai-out">${text}</div>`));
        })
        .catch((err) => {
          out.innerHTML = "";
          out.append(node(html`<p class="diet-note is-warn">うまくいきませんでした：${err.message}</p>`));
        });
    });
  }

  /* ---------------- 目標 ---------------- */

  function renderGoal(host, sum) {
    const g = sum.goal;
    const proj = D.projection();
    const sec = node(html`
      <div class="stack">
        <div class="section-title">${icon("flag")}目標</div>
        <div class="rows">
          <button class="row js-goal">
            <span class="row-main">
              <span class="row-title">目標体重</span>
              <span class="row-sub">${g.targetKg == null ? "決めていません"
                : `${g.targetKg.toFixed(1)}kg${g.targetDay ? ` ・ ${U.formatDay(g.targetDay)}まで` : ""}`}</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
          <div class="row">
            <span class="row-main">
              <span class="row-title">BMI</span>
              <span class="row-sub">${g.heightCm ? `身長 ${g.heightCm}cm` : "身長を入れると出ます"}</span>
            </span>
            <span class="row-value mono-num">${sum.bmi == null ? "—" : sum.bmi.toFixed(1)}</span>
          </div>
          <div class="row">
            <span class="row-main">
              <span class="row-title">いまの傾き</span>
              <span class="row-sub">7日平均の直線あてはめ</span>
            </span>
            <span class="row-value mono-num">${sum.trendPerWeek == null ? "—" : `${signed(sum.trendPerWeek, 2)} kg/週`}</span>
          </div>
        </div>
        ${proj ? html`<p class="diet-note">${projText(proj)}</p>` : ""}
      </div>
    `);
    sec.querySelector(".js-goal").addEventListener("click", openGoalSheet);
    host.append(sec);
  }

  function projText(p) {
    if (p.reached) return "目標の重さに届いています。";
    if (p.stalled) return "いまの傾きのままだと、目標には近づきません（傾きが目標と逆か、ほぼ横ばいです）。";
    if (p.far) return "いまの傾きだと、目標まで数年かかる計算になります。ペースか目標を見直す頃かもしれません。";
    return `いまの傾き（週 ${signed(p.rate, 2)}kg）が続いた場合、${U.formatDay(p.day)}ごろに目標の重さになる計算です。`
      + "これは予測ではなく、いまの傾きをそのまま伸ばした線です。";
  }

  /* ---------------- 体重を書く ---------------- */

  /* 量る条件。体重は、食前か食後かで1kg近く、着ているかいないかで0.5kg
     以上ふつうに動きます。同じ人の同じ日でも、条件が違えば別の数です。
     ここを書き留めておくと、あとで「増えた」と「着替えなかった」を
     分けて読めます。 */
  const MEAL_CHIPS = [
    { id: "before", label: "食前" },
    { id: "after", label: "食後" },
    { id: "", label: "未記入" },
  ];
  const WEAR_CHIPS = [
    { id: "no", label: "着衣なし" },
    { id: "yes", label: "着衣あり" },
    { id: "", label: "未記入" },
  ];
  const mealLabel = (v) => (v === "before" ? "食前" : v === "after" ? "食後" : "");
  const wearLabel = (v) => (v === true ? "着衣あり" : v === false ? "着衣なし" : "");
  /** 行に添える一言。書いていない条件は言いません。 */
  const condText = (w) => [mealLabel(w && w.meal), wearLabel(w && w.clothed)].filter(Boolean).join("・");

  /* 二桁打ったら、三桁目の前に小数点を入れます。体重も体脂肪率も
     「58.6」「13.2」の形にしかならないので、毎回「.」を探して打つのは
     ただの手数です。

     ただし**打ち消せる形**にします。三桁の整数（105kgなど）を書きたい
     ときに、こちらの都合で書けなくなるのは困ります——入った点を自分で
     消せば、その欄では以後もう入れません。 */
  /**
   * 三桁打ったら小数点を入れます（573 → 57.3）。
   *
   * next を渡すと、点を入れたところで**次の欄へ移ります**。体重を打ち終えた
   * 合図はその瞬間にはっきり出ているので、指を持ち上げて体脂肪の枠を狙う
   * 一手を省けます。自分で点を打った人（68.4）も同じ扱いにします——
   * 「打ち終えた」ことに変わりはないので。
   */
  function autoDecimal(input, next) {
    let stop = false;
    let hadDot = input.value.includes(".");
    const advance = () => {
      if (!next) return;
      /* 一拍おきます。iOS はこの入力の直後にまだ自分の仕事（変換の確定や
         キーボードの差し替え）をしていて、その最中に focus を移すと
         移った先の枠にキャレットが乗りません。 */
      setTimeout(() => { if (!next.value) KN.ui.focusNow(next); }, 60);
    };
    input.addEventListener("input", (e) => {
      const v = input.value;
      const del = !!(e && e.inputType && e.inputType.indexOf("delete") === 0);
      if (del && hadDot && !v.includes(".")) stop = true;   // 点を自分で外した
      const nowDot = v.includes(".");
      // 自分で点を打って、小数第一位まで入った（68.4）。それも打ち終わり。
      if (!del && !hadDot && nowDot === false) { /* まだ点なし。下で見ます */ }
      hadDot = nowDot;
      if (stop || del) return;
      if (hadDot) {
        if (/^\d{2,3}\.\d$/.test(v)) advance();
        return;
      }
      if (!/^\d{3}$/.test(v)) return;
      input.value = v.slice(0, 2) + "." + v.slice(2);
      hadDot = true;
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) { /* type=number など */ }
      advance();
    });
  }

  function openWeightSheet(existing, dayHint) {
    const w = existing || null;
    /* 新しく書くときは、前回と同じ条件を出しておきます。量る条件は
       ふつう毎日おなじなので、毎回二つ選ばせるのは手数の無駄。
       一度も選んでいなければ、どちらも未記入のままです。 */
    const seed = w || store.lastWeightCondition();
    let meal = seed.meal || null;
    let clothed = seed.clothed == null ? null : seed.clothed;

    const body = node(html`
      <div class="stack">
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">日付</span>
            <input type="date" class="input js-day" value="${w ? w.day : (dayHint || U.todayKey())}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">時刻</span>
            <input type="time" class="input js-time" value="${w && w.time ? w.time : U.nowTime()}">
          </label>
        </div>
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">体重 (kg)</span>
            <input class="input js-kg" inputmode="decimal" placeholder="例：68.4"
                   value="${w ? String(w.kg) : ""}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">体脂肪率 (%)</span>
            <input class="input js-fat" inputmode="decimal" placeholder="任意"
                   value="${w && w.fat != null ? String(w.fat) : ""}">
          </label>
        </div>
        <div class="field">
          <span class="field-label">量ったとき</span>
          <div class="js-meal"></div>
        </div>
        <div class="field">
          <span class="field-label">服装</span>
          <div class="js-wear"></div>
        </div>
        <p class="diet-note">
          食前か食後かで1kg近く、着ているかどうかで0.5kg以上動きます。
          書いておくと、その差を分けて読めます（<b>次からは前回と同じものが
          選ばれます</b>）。
        </p>

        <label class="field">
          <span class="field-label">メモ</span>
          <input class="input js-memo" placeholder="例：飲んだ翌日" value="${w ? w.memo : ""}">
        </label>
        ${w && w.source === "health" ? html`
          <p class="diet-note">これはヘルスケアから入った記録です。ここで直すと、
            手で書いた値として扱われます（次の取り込みで上書きされません）。</p>` : ""}
      </div>
    `);

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        ${w ? html`<button class="btn btn-soft js-del" aria-label="削除">${icon("trash")}</button>` : ""}
        <button class="btn btn-primary js-save" style="flex:1">${w ? "保存" : "記録する"}</button>
      </div>
    `);

    const h = KN.ui.sheet({ title: w ? "体重を直す" : "体重を記録", content: body, footer: foot, guard: true });
    const kgEl = body.querySelector(".js-kg");
    const fatEl = body.querySelector(".js-fat");
    // 体重を打ち終えたら、そのまま体脂肪へ。
    autoDecimal(kgEl, fatEl);
    autoDecimal(fatEl);
    if (!w) KN.ui.focusNow(kgEl);

    const paintMeal = () => KN.ui.chipRow(body.querySelector(".js-meal"), MEAL_CHIPS, {
      activeId: meal || "",
      onPick: (id) => { meal = id || null; paintMeal(); },
    });
    const paintWear = () => KN.ui.chipRow(body.querySelector(".js-wear"), WEAR_CHIPS, {
      activeId: clothed == null ? "" : (clothed ? "yes" : "no"),
      onPick: (id) => { clothed = id === "yes" ? true : (id === "no" ? false : null); paintWear(); },
    });
    paintMeal();
    paintWear();

    foot.querySelector(".js-save").addEventListener("click", () => {
      const val = parseFloat(String(kgEl.value).replace(/[^\d.]/g, ""));
      if (!(val > 0)) { KN.ui.toast("体重を入れてください"); return; }
      const fatRaw = parseFloat(String(body.querySelector(".js-fat").value).replace(/[^\d.]/g, ""));
      const patch = {
        day: body.querySelector(".js-day").value || U.todayKey(),
        time: body.querySelector(".js-time").value || null,
        kg: val,
        fat: Number.isFinite(fatRaw) && fatRaw > 0 ? fatRaw : null,
        memo: body.querySelector(".js-memo").value.trim(),
        meal, clothed,
        // 手が入ったものは手が入ったものです。次の取り込みで機械の値に
        // 戻されないよう、出どころを書き換えます。
        source: "manual",
      };
      if (w) store.updateWeight(w.id, patch);
      else store.addWeight(patch);
      KN.motion.fire("save");
      h.close();
      render();
      KN.ui.toast(w ? "直しました" : "記録しました");
    });

    const del = foot.querySelector(".js-del");
    if (del) del.addEventListener("click", async () => {
      const ok = await KN.ui.confirm({ title: "この記録を消す", message: "元に戻せません。", okLabel: "消す", danger: true });
      if (!ok) return;
      store.removeWeight(w.id);
      h.close();
      render();
    });
  }

  /* ---------------- 食事を書く ---------------- */

  function openMealSheet(existing, slotHint) {
    const meal = existing || null;
    let items = meal ? meal.items.map((i) => ({ ...i })) : [];
    let slot = meal ? meal.slot : (slotHint || guessSlot());

    const body = node(html`
      <div class="stack">
        <div class="js-slots"></div>
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">日付</span>
            <input type="date" class="input js-day" value="${meal ? meal.day : U.todayKey()}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">時刻</span>
            <input type="time" class="input js-time" value="${meal && meal.time ? meal.time : U.nowTime()}">
          </label>
        </div>

        <label class="field">
          <span class="field-label">食べたもの</span>
          <div class="input-group">
            <input class="input js-food" placeholder="例：ご飯150g / 卵2個 / 鶏むね肉100g"
                   autocomplete="off" spellcheck="false" enterkeyhint="done">
            <button class="btn btn-primary btn-sm js-add">${icon("plus")}</button>
          </div>
        </label>
        <div class="js-suggest"></div>
        <p class="diet-note">量を書かないと、一食ぶんの目安で入ります。あとから数字は直せます。
          値の出どころは${KN.foodData.SOURCE}です。</p>

        <div class="js-items"></div>
        <div class="js-total"></div>

        ${KN.dietAI.configured() ? html`
          <button class="btn btn-soft btn-block js-photo">${icon("camera")}写真から推定する</button>
        ` : ""}

        <label class="field">
          <span class="field-label">メモ</span>
          <input class="input js-memo" placeholder="任意" value="${meal ? meal.memo : ""}">
        </label>
      </div>
    `);

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        ${meal ? html`<button class="btn btn-soft js-del" aria-label="削除">${icon("trash")}</button>` : ""}
        <button class="btn btn-primary js-save" style="flex:1">${meal ? "保存" : "記録する"}</button>
      </div>
    `);

    const h = KN.ui.sheet({ title: meal ? "食事を直す" : "食事を記録", content: body, footer: foot, guard: true });

    KN.ui.chipRow(body.querySelector(".js-slots"), SLOTS, {
      activeId: slot,
      onPick: (id) => { slot = id; KN.ui.chipRow(body.querySelector(".js-slots"), SLOTS, { activeId: slot, onPick: () => {} }); },
    });

    const foodEl = body.querySelector(".js-food");
    const itemsEl = body.querySelector(".js-items");
    const totalEl = body.querySelector(".js-total");
    const sugEl = body.querySelector(".js-suggest");

    if (!meal) KN.ui.focusNow(foodEl);

    function paint() {
      itemsEl.innerHTML = "";
      if (!items.length) {
        itemsEl.append(node(html`<p class="diet-note">まだ何も入っていません。</p>`));
      } else {
        const rows = node(html`<div class="rows diet-items"></div>`);
        items.forEach((it, i) => {
          const row = node(html`
            <div class="row">
              <button class="row-main js-edit">
                <span class="row-title">${it.name}${it.estimated ? html`<span class="badge badge-muted">推定</span>` : ""}</span>
                <span class="row-sub">${it.grams != null ? `${Math.round(it.grams)}g ・ ` : ""}P${it.p} F${it.f} C${it.c}</span>
              </button>
              <span class="row-value mono-num">${it.estimated ? "約" : ""}${it.kcal.toLocaleString()}</span>
              <button class="icon-btn js-drop" aria-label="外す">${icon("close")}</button>
            </div>
          `);
          row.querySelector(".js-drop").addEventListener("click", () => { items.splice(i, 1); paint(); });
          row.querySelector(".js-edit").addEventListener("click", () => editItem(i));
          rows.append(row);
        });
        itemsEl.append(rows);
      }

      const sum = items.reduce((a, i) => ({
        kcal: a.kcal + i.kcal, p: a.p + i.p, f: a.f + i.f, c: a.c + i.c,
      }), { kcal: 0, p: 0, f: 0, c: 0 });
      totalEl.innerHTML = "";
      totalEl.append(node(html`
        <div class="diet-total">
          <b class="mono-num">${Math.round(sum.kcal).toLocaleString()}</b><small>kcal</small>
          <span class="mono-num">P ${sum.p.toFixed(1)} ・ F ${sum.f.toFixed(1)} ・ C ${sum.c.toFixed(1)}</span>
        </div>
      `));
    }

    function editItem(i) {
      const it = items[i];
      const b = node(html`
        <div class="stack">
          <label class="field"><span class="field-label">名前</span>
            <input class="input js-n" value="${it.name}"></label>
          <div class="field-row">
            <label class="field" style="flex:1"><span class="field-label">量 (g)</span>
              <input class="input js-g" inputmode="decimal" value="${it.grams == null ? "" : it.grams}"></label>
            <label class="field" style="flex:1"><span class="field-label">kcal</span>
              <input class="input js-k" inputmode="numeric" value="${it.kcal}"></label>
          </div>
          <div class="field-row">
            <label class="field" style="flex:1"><span class="field-label">P (g)</span>
              <input class="input js-p" inputmode="decimal" value="${it.p}"></label>
            <label class="field" style="flex:1"><span class="field-label">F (g)</span>
              <input class="input js-f" inputmode="decimal" value="${it.f}"></label>
            <label class="field" style="flex:1"><span class="field-label">C (g)</span>
              <input class="input js-c" inputmode="decimal" value="${it.c}"></label>
          </div>
          ${it.estimated ? html`<p class="diet-note">この数は推定です。直すと推定の印は外れます。</p>` : ""}
        </div>
      `);
      const f = node(html`<button class="btn btn-primary btn-block">直す</button>`);
      const hh = KN.ui.sheet({ title: "数を直す", content: b, footer: f, guard: true });
      f.addEventListener("click", () => {
        const num = (sel, d) => {
          const v = parseFloat(String(b.querySelector(sel).value).replace(/[^\d.]/g, ""));
          return Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0;
        };
        const before = { kcal: it.kcal, p: it.p, f: it.f, c: it.c };
        it.name = b.querySelector(".js-n").value.trim() || it.name;
        const gv = parseFloat(String(b.querySelector(".js-g").value).replace(/[^\d.]/g, ""));
        it.grams = Number.isFinite(gv) && gv > 0 ? gv : null;
        it.kcal = num(".js-k", 0); it.p = num(".js-p", 1); it.f = num(".js-f", 1); it.c = num(".js-c", 1);
        // 数に手が入ったのなら、それはもう推定ではなくその人の申告です。
        if (it.estimated && (before.kcal !== it.kcal || before.p !== it.p || before.f !== it.f || before.c !== it.c)) {
          it.estimated = false;
          it.from = "user";
        }
        hh.close();
        paint();
      });
    }

    /** 一行を食品に当てて、明細に足します。 */
    function addLine(text) {
      const parsed = KN.foodData.parseLine(text);
      if (!parsed || !parsed.name) return false;
      const food = store.findFood(parsed.name);
      if (!food) {
        // 引けなかったものも捨てません。名前だけ入れて、数は本人に任せます。
        items.push({ name: parsed.name, grams: null, kcal: 0, p: 0, f: 0, c: 0, from: "manual", estimated: false, foodId: null });
        paint();
        KN.ui.toast(`「${parsed.name}」は表にありません。数を入れてください`);
        editItem(items.length - 1);
        return true;
      }
      const per100 = food.per !== "unit";
      let grams = KN.foodData.gramsOf(food, parsed.qty, parsed.unit);
      if (grams == null) {
        grams = KN.foodData.defaultServing(food);
        KN.ui.toast(`「${parsed.unit}」では数えられないので、${Math.round(grams)}gにしました`);
      }
      const nut = per100
        ? KN.foodData.nutrientsOf(food, grams)
        // 市販品などで「1個あたり」で登録されているものは、個数ぶん掛けます。
        : (() => {
            const q = parsed.qty == null ? 1 : parsed.qty;
            return { kcal: Math.round(food.kcal * q), p: Math.round(food.p * q * 10) / 10,
                     f: Math.round(food.f * q * 10) / 10, c: Math.round(food.c * q * 10) / 10 };
          })();
      items.push({
        name: food.name, grams: per100 ? Math.round(grams) : (food.unitGrams || null),
        kcal: nut.kcal, p: nut.p, f: nut.f, c: nut.c,
        from: food.kind === "base" ? "base" : food.kind,
        foodId: food.id, estimated: false,
      });
      paint();
      return true;
    }

    function commitInput() {
      const raw = foodEl.value;
      if (!raw.trim()) return;
      // 何行かまとめて貼られたら、行ごとに読みます。
      const lines = raw.split(/[\n,、]/).map((x) => x.trim()).filter(Boolean);
      lines.forEach(addLine);
      foodEl.value = "";
      sugEl.innerHTML = "";
      foodEl.focus();
    }

    body.querySelector(".js-add").addEventListener("click", commitInput);
    foodEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commitInput(); }
    });

    /* 打っているそばから候補を出します。名前の部分だけで探すので、
       「ご飯150」まで打っても候補は消えません。 */
    foodEl.addEventListener("input", () => {
      const parsed = KN.foodData.parseLine(foodEl.value);
      const q = parsed ? parsed.name : "";
      sugEl.innerHTML = "";
      if (q.length < 1) return;
      const mine = store.get().diet.foods
        .filter((f) => U.foldKana(f.name).includes(U.foldKana(q))).slice(0, 3);
      const found = mine.concat(KN.foodData.search(q, 8)).slice(0, 8);
      if (!found.length) return;
      const row = node(html`<div class="chip-row diet-suggest"></div>`);
      found.forEach((f) => {
        const b = node(html`<button type="button" class="chip">${f.name}<span class="chip-count">${Math.round(f.kcal)}</span></button>`);
        b.addEventListener("click", () => {
          // 打った量はそのまま活かします——「とりむね200g」の「200g」は、
          // 候補を押した瞬間に消えていい情報ではありません。
          const tail = parsed && parsed.qty != null ? `${parsed.qty}${parsed.unit || "g"}` : "";
          foodEl.value = f.name + tail;
          commitInput();
        });
        row.append(b);
      });
      sugEl.append(row);
    });

    const photo = body.querySelector(".js-photo");
    if (photo) photo.addEventListener("click", () => pickPhoto((res) => {
      res.items.forEach((it) => items.push(it));
      paint();
      if (res.note) KN.ui.toast(res.note);
    }));

    foot.querySelector(".js-save").addEventListener("click", () => {
      const memo = body.querySelector(".js-memo").value.trim();
      if (!items.length && !memo) { KN.ui.toast("食べたものを入れてください"); return; }
      const patch = {
        day: body.querySelector(".js-day").value || U.todayKey(),
        time: body.querySelector(".js-time").value || null,
        slot, items, memo,
      };
      if (meal) store.updateMeal(meal.id, patch);
      else store.addMeal(patch);
      KN.motion.fire("save");
      h.close();
      render();
      KN.ui.toast(meal ? "直しました" : "記録しました");
    });

    const del = foot.querySelector(".js-del");
    if (del) del.addEventListener("click", async () => {
      const ok = await KN.ui.confirm({ title: "この食事を消す", message: "元に戻せません。", okLabel: "消す", danger: true });
      if (!ok) return;
      store.removeMeal(meal.id);
      h.close();
      render();
    });

    paint();
  }

  /** 写真を選んで、窓口に投げて、推定を受け取る。 */
  function pickPhoto(onDone) {
    const input = node(html`<input type="file" accept="image/*" capture="environment" hidden>`);
    document.body.append(input);
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const t = KN.ui.toast("写真を見ています…", { duration: 60000 });
      KN.dietAI.shrink(file)
        .then((dataUrl) => KN.dietAI.analyzePhoto(dataUrl))
        .then((res) => {
          t.dismiss();
          if (!res.items.length) { KN.ui.toast("何も読み取れませんでした"); return; }
          onDone(res);
        })
        .catch((err) => { t.dismiss(); KN.ui.toast(`うまくいきませんでした：${err.message}`); });
    });
    input.click();
  }

  /* ---------------- 目標を決める ---------------- */

  function openGoalSheet() {
    const g = store.get().diet.goal;
    const body = node(html`
      <div class="stack">
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">身長 (cm)</span>
            <input class="input js-h" inputmode="decimal" placeholder="例：170"
                   value="${g.heightCm == null ? "" : String(g.heightCm)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">目標体重 (kg)</span>
            <input class="input js-tw" inputmode="decimal" placeholder="例：65"
                   value="${g.targetKg == null ? "" : String(g.targetKg)}">
          </label>
        </div>
        <label class="field">
          <span class="field-label">目標日</span>
          <input type="date" class="input js-td" value="${g.targetDay || ""}">
        </label>

        <div class="divider"></div>
        <div class="section-title">一日の目安</div>
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">kcal</span>
            <input class="input js-kcal" inputmode="numeric" value="${g.kcalTarget == null ? "" : String(g.kcalTarget)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">P (g)</span>
            <input class="input js-p" inputmode="numeric" value="${g.pTarget == null ? "" : String(g.pTarget)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">F (g)</span>
            <input class="input js-f" inputmode="numeric" value="${g.fTarget == null ? "" : String(g.fTarget)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">C (g)</span>
            <input class="input js-c" inputmode="numeric" value="${g.cTarget == null ? "" : String(g.cTarget)}">
          </label>
        </div>
        <div class="js-suggest-box"></div>

        <div class="divider"></div>
        <div class="section-title">からだの目標（今日のからだの輪）</div>
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">歩数</span>
            <input class="input js-steps" inputmode="numeric" placeholder="${STEPS_DEFAULT}"
                   value="${g.stepsTarget == null ? "" : String(g.stepsTarget)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">総消費 (kcal)</span>
            <input class="input js-burn" inputmode="numeric" placeholder="${BURN_DEFAULT}"
                   value="${g.burnTarget == null ? "" : String(g.burnTarget)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">睡眠 (時間)</span>
            <input class="input js-sleep" inputmode="decimal" placeholder="${SLEEP_DEFAULT / 60}"
                   value="${g.sleepTarget == null ? "" : String(Math.round(g.sleepTarget / 6) / 10)}">
          </label>
        </div>
        <p class="diet-note">
          空なら <b>${n0(STEPS_DEFAULT)}歩 / ${n0(BURN_DEFAULT)}kcal / ${SLEEP_DEFAULT / 60}時間</b> で数えます。
          ここは <b>届く高さ</b>に置いてください——超えたぶんは、輪の二周目として
          明るい色で乗ります。直近の平均に合わせると、頑張るほど目盛りが遠のいて、
          いつまでも埋まらない輪になります。
        </p>

        <label class="field">
          <span class="field-label">お酒の目安（純アルコール g/日）</span>
          <input class="input js-alc" inputmode="decimal" placeholder="20"
                 value="${g.alcoholG == null ? "" : String(g.alcoholG)}">
        </label>
        <p class="diet-note">
          空なら <b>${DR.GUIDE_G}g</b> で数えます。厚生労働省は「節度ある適度な飲酒」を
          一日 純アルコール<b>20g程度</b>（ビール中瓶1本ほど）としていて、
          男性で<b>40g以上</b>が生活習慣病のリスクを高める量とされています。
          今日のからだの「飲酒」は、この目安を100%とした割合で出します。
        </p>
      </div>
    `);

    const foot = node(html`<button class="btn btn-primary btn-block js-save">保存</button>`);
    const h = KN.ui.sheet({ title: "目標", content: body, footer: foot, guard: true });

    renderKcalSuggestion(body.querySelector(".js-suggest-box"), body);

    foot.addEventListener("click", () => {
      const num = (sel) => {
        const v = parseFloat(String(body.querySelector(sel).value).replace(/[^\d.]/g, ""));
        return Number.isFinite(v) && v > 0 ? v : null;
      };
      store.setGoal({
        heightCm: num(".js-h"),
        targetKg: num(".js-tw"),
        targetDay: body.querySelector(".js-td").value || null,
        kcalTarget: num(".js-kcal"),
        pTarget: num(".js-p"),
        fTarget: num(".js-f"),
        cTarget: num(".js-c"),
        alcoholG: num(".js-alc"),
        stepsTarget: num(".js-steps"),
        burnTarget: num(".js-burn"),
        // 睡眠だけは「時間」で聞いて、分で持ちます（記録のほうが分なので）。
        sleepTarget: (() => { const hrs = num(".js-sleep"); return hrs == null ? null : Math.round(hrs * 60); })(),
      });
      h.close();
      render();
      KN.ui.toast("保存しました");
    });
  }

  /**
   * kcalの目安。年齢も性別も持っていないので、式では出しません——
   * 代わりに、この人のヘルスケアが実際に記録した消費から出します。
   * 実測が無ければ、この案内自体を出しません。
   */
  function renderKcalSuggestion(host, body) {
    const today = U.todayKey();
    const days = D.daysBetween(U.shiftDay(today, -13), today);
    const burn = days.map((d) => {
      const a = store.healthValue(d, "activeEnergy");
      const r = store.healthValue(d, "restingEnergy");
      return a != null && r != null ? a + r : null;
    }).filter((v) => v != null);
    if (burn.length < 3) return;

    const avg = Math.round(burn.reduce((a, b) => a + b, 0) / burn.length);
    const pace = D.neededPace();
    // 体脂肪1kgぶんの熱量はおよそ7,200〜7,700kcal。真ん中を採ります。
    const perKg = 7450;
    const deficit = pace != null ? Math.round((-pace * perKg) / 7) : null;
    const suggest = deficit != null ? Math.max(1200, avg - deficit) : null;

    const el = node(html`
      <div class="diet-suggest-box">
        <p class="diet-note">直近${burn.length}日の消費は、1日あたり平均 <b>${avg.toLocaleString()}kcal</b> でした
          （ヘルスケアのアクティブ＋安静時）。
          ${suggest != null ? html`目標日までのペースから逆算すると、摂取の目安は
            <b>${Math.round(suggest).toLocaleString()}kcal</b> あたりです。` : ""}
          あくまで目安で、体調や測り方で動きます。</p>
        ${suggest != null ? html`<button class="btn btn-soft btn-sm js-use">この目安を入れる</button>` : ""}
      </div>
    `);
    const use = el.querySelector(".js-use");
    if (use) use.addEventListener("click", () => {
      const k = Math.round(suggest);
      body.querySelector(".js-kcal").value = String(k);
      // PFCは、たんぱく質を体重×1.6g、脂質を熱量の25%、残りを炭水化物に。
      // 減量中のよくある置き方で、そう決めたことは画面にも書いてあります。
      const last = store.latestWeight();
      if (last) {
        const p = Math.round(last.kg * 1.6);
        const f = Math.round((k * 0.25) / 9);
        const c = Math.max(0, Math.round((k - p * 4 - f * 9) / 4));
        body.querySelector(".js-p").value = String(p);
        body.querySelector(".js-f").value = String(f);
        body.querySelector(".js-c").value = String(c);
        KN.ui.toast("P=体重×1.6g、F=熱量の25%、残りをCにしました");
      }
    });
    host.append(el);
  }

  /* ---------------- ヘルスケアの取り込み ----------------

     ここは説明の画面でもあります。iPhoneのヘルスケアはWebアプリからは
     読めないので、あいだにショートカットを一つ挟むことになる——その
     「なぜ」と「どうやって」を、外のどこかではなくここに置きます。

     並べる順は、作る順です。まず手で一行打って動くのを見て、それから
     その一行を機械に書かせる。16個のアクションを先に並べてから動かない
     理由を探すのは、いちばん心の折れる順番なので。 */

  const SAMPLE_MIN = ["day=" + U.todayKey(), "steps=8432", "sleep=7:12"].join("\n");

  const SHORTCUT_SAMPLE = [
    "くらしノート健康データ v1",
    "day=" + U.todayKey(),
    "steps=8432",
    "distance=6.1km",
    "activeEnergy=430",
    "restingEnergy=1520",
    "sleep=7:12",
    "weight=68.4",
    "bodyFat=21.3",
    "heartRate=62",
    "workout=ウォーキング,42,210",
  ].join("\n");

  const KEY_HELP = [
    ["steps", "歩数", "8432"],
    ["distance", "歩行距離", "6.1km / 6100m"],
    ["activeEnergy", "アクティブエネルギー", "430"],
    ["restingEnergy", "安静時エネルギー", "1520"],
    ["sleep", "睡眠", "7:12 / 432 / 7時間12分"],
    ["weight", "体重", "68.4"],
    ["bodyFat", "体脂肪率", "21.3"],
    ["heartRate", "心拍数", "62"],
    ["workout", "ワークアウト", "ウォーキング,42,210"],
    ["day", "どの日のぶんか", U.todayKey()],
    ["source", "どの機械のぶんか", "Apple Watch"],
  ];

  function openSyncSheet() {
    const sync = store.get().diet.sync;
    const body = node(html`
      <div class="stack">
        <p class="diet-note">
          iPhoneのヘルスケアは、Webアプリから直接は読めません（Safariにその窓口が
          無いためで、設定の問題ではありません）。かわりに<b>ショートカット</b>に
          読み出させて、その結果をここへ渡します。
        </p>

        <div class="divider"></div>
        <div class="section-title">① まず、手で試す</div>
        <p class="diet-note">
          ショートカットを作る前に、<b>入る形</b>を先に見ておくのがいちばん近道です。
          下の欄に打つと、読めたものがその場に出ます。
        </p>
        <textarea class="textarea js-t" rows="4" spellcheck="false"
                  autocapitalize="off" autocorrect="off">${SAMPLE_MIN}</textarea>
        <div class="js-preview"></div>
        <button class="btn btn-primary btn-block js-take">これを取り込む</button>

        <div class="divider"></div>
        <div class="section-title">② 毎日を楽にする（ショートカット）</div>
        <p class="diet-note">
          ①と同じ文字を、ショートカットに書かせます。<b>まず「歩数」だけで作って、
          動いたら残りを足す</b>——先に全部並べると、動かないときにどこが悪いのか
          分からなくなります。
        </p>
        <ol class="diet-steps">
          <li>「ショートカット」アプリ →「＋」で新規作成</li>
          <li><b>「ヘルスサンプルを検索」</b>を追加。
            <b>種類</b>を「歩数」、<b>フィルタ</b>を「開始日」が「今日」に</li>
          <li><b>「統計を計算」</b>を追加。<b>合計</b>を選び、対象は上の結果</li>
          <li><b>「テキスト」</b>を追加して、こう打つ：<br>
            <code>steps=</code> と打ち、その右に一つ前の結果の変数を差し込む</li>
          <li><b>「クリップボードにコピー」</b>を追加</li>
          <li>実行 → このアプリに戻って、下の<b>「コピーしたものを取り込む」</b></li>
        </ol>
        <p class="diet-note">
          動いたら、2〜4をもう一度ずつ足していけば種類が増えます。「テキスト」は
          <b>一つにまとめて</b>、行ごとに <code>distance=</code> <code>sleep=</code> …と
          並べてください。全部そろうとこうなります。
        </p>
        <pre class="diet-code">${SHORTCUT_SAMPLE}</pre>
        <button class="btn btn-soft btn-sm js-copy">この形をコピー</button>
        <p class="diet-note">
          最後に<b>オートメーション</b>（毎朝7時など）に登録しておけば、あとは
          このアプリで一度押すだけになります。<br>
          ひとつだけ気をつけることがあります。<b>iPhoneがロックされているあいだ、
          ヘルスケアは読めません</b>（<code>Protected health data is inaccessible</code>）。
          走る時刻は<b>ふだん端末を触っている時間</b>に寄せるか、ショートカットの先頭に
          「待機」を挟んで読み直すようにしてください。読めなかった便は、このアプリでは
          <b>取り込まずに待ちます</b>——0で塗り替えないためです。
        </p>

        <div class="divider"></div>
        <div class="section-title">③ コピーもやめる（中継所）</div>
        <p class="diet-note">
          ②まで来ると、残る手間は「アプリに戻って一度押す」だけです。それも
          消したいときは、<b>中継所</b>を一つ立てます。ショートカットの最後を
          「クリップボードにコピー」から<b>「URLの内容を取得」（POST）</b>に変えると、
          データはいったん自分の中継所に置かれ、次にこのタブを開いた時に
          くらしノートが自分で受け取ります。受け取ったら中継所からは消えます。
        </p>
        <p class="diet-note">
          ${KN.healthRelay.configured()
            ? html`いまの中継所：<b>${KN.healthRelay.host()}</b>（設定 → ダイエット → 中継所で変えられます）`
            : html`まだ設定していません。<b>iPhoneだけで建てられます</b>——パソコンは
                   要りません。手順はぜんぶ<b>設定 → ダイエット → 中継所</b>の中に
                   書いてあります（コードのコピーも、合言葉づくりも、動くかの確認も、
                   その画面のボタンで済みます）。`}
        </p>

        <div class="divider"></div>
        <div class="section-title">取り込む</div>
        <div class="rows">
          <button class="row js-relay">
            <span class="row-main">
              <span class="row-title">中継所から取り込む</span>
              <span class="row-sub">${KN.healthRelay.configured()
                ? "ショートカットが置いたデータを受け取ります"
                : "未設定（設定 → ダイエット → 中継所）"}</span>
            </span>
            <span class="row-chevron">${icon("download")}</span>
          </button>
          <button class="row js-paste">
            <span class="row-main">
              <span class="row-title">コピーしたものを取り込む</span>
              <span class="row-sub">${store.get().settings.clipboardBlocked
                ? "この端末では自動で読めないので、貼り付けの欄を開きます"
                : "ショートカットがコピーした中身を読みます"}</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
          <button class="row js-file">
            <span class="row-main">
              <span class="row-title">ファイルから取り込む</span>
              <span class="row-sub">「ファイルに保存」したテキストやJSON</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
        </div>
        <div class="js-got"></div>
        ${sync.lastAt ? html`<p class="diet-note">最後の取り込み：${U.formatStamp(sync.lastAt)}</p>` : ""}
        ${sync.lockedAt ? html`
          <p class="diet-note is-warn">
            ${U.formatStamp(sync.lockedAt)} に届いた便は、<b>ヘルスケアが読めない状態</b>でした
            （iPhoneがロックされているあいだ、ショートカットはヘルスケアを読めません）。
            <b>取り込んでいないので、それまでの記録はそのまま</b>です。少し待って何度か
            取りにいき、それでも駄目なら、次にこのタブを開いたときにまた取りにいきます。
          </p>
          <div class="divider"></div>
          <div class="section-title">ロック中でも取れるようにする</div>
          <p class="diet-note">
            大もとはショートカット側です。オートメーションが走ったとき画面がロックされて
            いると、ヘルスケアは暗号化されたままで読めません
            （<code>Protected health data is inaccessible</code>）。次のどれかで直ります。
          </p>
          <ol class="diet-steps">
            <li>オートメーションの<b>「実行前に尋ねる」を切り</b>、時刻を
              <b>ふだん端末を使っている時間</b>に寄せる（起床直後より、通勤中や昼など）</li>
            <li>ショートカットの先頭に<b>「待機 30秒」→ もう一度ヘルスサンプルを検索</b>を足して、
              一度目で空だったときの取り直しを作る（<b>「If」で結果が0件なら</b>のかたちにすると、
              うまくいった日は待ちません）</li>
            <li><b>0 を送らない</b>——「統計を計算」は読めなかったとき 0 を返します。
              <b>「If 歩数 が 0 でない」</b>で囲んでおくと、読めなかった日は何も送りません
              （このアプリも 0 だけの便は取り込みませんが、送らないほうが確かです）</li>
          </ol>` : ""}

        <div class="divider"></div>
        <div class="section-title">書ける言葉</div>
        <div class="diet-keys">
          ${KN.util.raw(KEY_HELP.map(([k, name, ex]) => `
            <div class="diet-key">
              <code>${k}</code>
              <span class="diet-key-name">${name}</span>
              <span class="diet-key-ex">${KN.util.escapeHtml(ex)}</span>
            </div>`).join(""))}
        </div>
        <p class="diet-note">
          値が取れなかった行は<b>空のままで大丈夫</b>です（空は「無かった」として扱い、
          0にはしません）。同じ日の同じ種類を何行も書いた場合は、歩数のように
          足せるものは<b>合計</b>されます。JSON形式でも読めます。
        </p>
        <p class="diet-note">
          <b>歩行距離だけは、足すと二重になります。</b>Apple Watch と iPhone が
          どちらも一日ぶんを持っているので、両方を合計すると倍近くになります
          （実測で 7.8km と 6.0km を足して 13.9km になりました）。
          <code>source=</code> を書いて機械ごとに分けて送れば、
          <b>Apple Watch のほうを採ります</b>（ヘルスケアの値と一致します）。
          分けずに一つだけ送るぶんには、これまでと何も変わりません。
        </p>
        <pre class="diet-code">source=Apple Watch
distance=7.8km
source=iPhone
distance=6.0km</pre>
      </div>
    `);

    const h = KN.ui.sheet({ title: "ヘルスケアから取り込む", content: body });

    const done = (res) => {
      let msg = KN.healthSync.describe(res);
      /* 郵便受けは一通しか持てないので、前の便が読まれないまま上書きされて
         いたことがあります——黙ってよい自動のときとは違い、ここは自分で
         押した操作なので、そのぶんは伝えます。
         ただし snapshot の便（睡眠のステージのように、窓ぶんまるごとが毎回
         入っているもの）は、前の便が消えても失われたものがありません。
         毎朝四回送る使い方では毎回鳴ってしまうので、そこは黙ります。 */
      if (res && res.replaced && !res.snapshot) msg += "／前の便は読まれないまま上書きされていました";
      KN.ui.toast(msg);
      if (res && res.ok) { h.close(); render(); }
    };

    /* ① 打つそばから「何が読めたか」を出します。ショートカットを直すのは
       だいたいここで、返ってくるのが「取り込めませんでした」の一言だけだと、
       どの行が悪いのか永久に分かりません。 */
    const ta = body.querySelector(".js-t");
    const pv = body.querySelector(".js-preview");
    function paintPreview() {
      const res = KN.healthSync.preview(ta.value);
      pv.innerHTML = "";
      if (!res.ok) {
        pv.append(node(html`<p class="diet-note is-warn">${res.error}</p>`));
        return;
      }
      pv.append(node(html`
        <div class="diet-read">
          ${KN.util.raw(res.rows.map((r) => `
            <div class="diet-read-row">
              <span class="diet-read-name">${r.label}</span>
              <b class="mono-num">${KN.util.escapeHtml(r.value)}</b>
              <span class="diet-read-day">${KN.util.escapeHtml(U.formatDay(r.day))}
                ${r.extra ? "・" + KN.util.escapeHtml(r.extra) : ""}</span>
            </div>`).join(""))}
          ${res.unknown ? `<p class="diet-note">読めなかった行が ${res.unknown} 行あります。</p>` : ""}
        </div>
      `));
    }
    ta.addEventListener("input", paintPreview);
    paintPreview();

    body.querySelector(".js-take").addEventListener("click", () => {
      done(KN.healthSync.importText(ta.value));
    });
    /* 「中継所から取り込む」。自動のときと違って、ここでは黙りません——
       押したのに何も言われないのが、いちばん困ります。 */
    body.querySelector(".js-relay").addEventListener("click", () => {
      if (!KN.healthRelay.configured()) {
        KN.ui.toast("設定 → ダイエット → 中継所 でURLを入れてください");
        return;
      }
      const btn = body.querySelector(".js-relay");
      btn.disabled = true;
      KN.healthRelay.pullAndImport().then((res) => {
        if (res.text != null) showGot(res.text);
        if (res.ok) { done(res); return; }
        if (res.text != null) {          // 受け取れたが、中身が読めなかった
          ta.value = res.text;
          paintPreview();
        }
        KN.ui.toast(res.error || "取り込めませんでした");
      }).catch((err) => {
        KN.ui.toast("中継所につなげませんでした（" + (err && err.message || err) + "）");
      }).finally(() => { btn.disabled = false; });
    });

    /* 「コピーしたものを取り込む」。
       読めればそのまま、読めなければ **貼り付けの欄** に切り替えます。
       クリップボードのAPIは環境しだいで断られる道なので、断られたときに
       行き止まりを出すのではなく、必ず通る道へ案内します。 */
    body.querySelector(".js-paste").addEventListener("click", () => {
      /* 一度断られた端末で、毎日おなじ失敗を踏ませません。断られたことを
         覚えて、次からは貼り付けの欄をまっすぐ開きます（欄の中に、また
         自動で読めるか試す口を残してあります——iOSは変わるので）。 */
      if (store.get().settings.clipboardBlocked) {
        openPasteSheet({ why: "この端末では前に断られています" }, done);
        return;
      }
      KN.healthSync.importFromClipboard().then((res) => {
        // 読めた文字列は、うまくいってもいかなくても、そのまま見せます。
        if (res.text != null) showGot(res.text);
        if (res.ok) { done(res); return; }
        if (res.text != null) {
          // 読めたが、中身が取り込めなかった。①の欄に落として、どこが
          // 悪いのかを読み下しで見せます。
          ta.value = res.text;
          paintPreview();
          KN.ui.toast(res.error);
          return;
        }
        // そもそも読めなかった。覚えておいて、理由を添えて貼り付けの道へ。
        store.update((st) => { st.settings.clipboardBlocked = true; });
        openPasteSheet(res, done);
      });
    });

    /* 読めた文字列そのもの。加工しません——「取れているつもりで取れていない」
       を切り分けられるのは、生の中身だけです。 */
    function showGot(text) {
      const host = body.querySelector(".js-got");
      host.innerHTML = "";
      host.append(node(html`
        <div class="diet-got">
          <span class="diet-got-head">クリップボードから取得した文字列（${text.length}文字）</span>
          <pre>${text || "（空）"}</pre>
        </div>
      `));
    }
    body.querySelector(".js-file").addEventListener("click", () => {
      const input = node(html`<input type="file" accept=".txt,.json,text/plain,application/json" hidden>`);
      document.body.append(input);
      input.addEventListener("change", () => {
        const f = input.files && input.files[0];
        input.remove();
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          const text = String(r.result || "");
          const res = KN.healthSync.importText(text);
          if (!res.ok) { ta.value = text.slice(0, 4000); paintPreview(); }
          done(res);
        };
        r.onerror = () => KN.ui.toast("ファイルを読めませんでした");
        r.readAsText(f);
      });
      input.click();
    });
    body.querySelector(".js-copy").addEventListener("click", () => {
      if (navigator.clipboard) navigator.clipboard.writeText(SHORTCUT_SAMPLE);
      KN.ui.toast("コピーしました");
    });
  }

  /* 貼り付けの欄。iOSの「ペースト」はブラウザの権限を通らないので、
     APIが断られても必ず通ります。開いた瞬間に欄へ入れておき、
     長押しから一手で貼れるようにします。 */
  function openPasteSheet(diag, done) {
    const b = node(html`
      <div class="stack">
        <p class="diet-note">
          この端末では、アプリからクリップボードを読み取れませんでした。
          かわりに<b>下の欄を長押しして「ペースト」</b>を押してください。
          貼り付けた時点で読み取ります。
        </p>
        <textarea class="textarea js-p" rows="4" spellcheck="false"
                  autocapitalize="off" autocorrect="off"
                  placeholder="ここに長押し →「ペースト」"></textarea>
        <div class="js-got2"></div>
        <div class="js-pv"></div>
        <button class="btn btn-primary btn-block js-take2">取り込む</button>
        <button class="btn btn-ghost btn-sm js-retry">自動で読めるか、もう一度試す</button>
        ${diag && diag.why ? html`
          <details class="diet-why">
            <summary>読み取れなかった理由</summary>
            <p class="diet-note">${diag.why}</p>
          </details>` : ""}
      </div>
    `);
    const h2 = KN.ui.sheet({ title: "貼り付けて取り込む", content: b });
    const ta2 = b.querySelector(".js-p");
    KN.ui.focusNow(ta2);

    function refresh() {
      const text = ta2.value;
      const got = b.querySelector(".js-got2");
      const pv = b.querySelector(".js-pv");
      got.innerHTML = "";
      pv.innerHTML = "";
      if (!text.trim()) return;
      got.append(node(html`
        <div class="diet-got">
          <span class="diet-got-head">貼り付けられた文字列（${text.length}文字）</span>
          <pre>${text}</pre>
        </div>
      `));
      const res = KN.healthSync.preview(text);
      if (!res.ok) {
        pv.append(node(html`<p class="diet-note is-warn">${res.error}</p>`));
        return;
      }
      pv.append(node(html`
        <div class="diet-read">
          ${KN.util.raw(res.rows.map((r) => `
            <div class="diet-read-row">
              <span class="diet-read-name">${r.label}</span>
              <b class="mono-num">${KN.util.escapeHtml(r.value)}</b>
              <span class="diet-read-day">${KN.util.escapeHtml(U.formatDay(r.day))}</span>
            </div>`).join(""))}
        </div>
      `));
    }

    // paste でも、キーボードで打っても、同じように読み直します。
    ta2.addEventListener("paste", () => setTimeout(refresh, 0));
    ta2.addEventListener("input", refresh);

    b.querySelector(".js-retry").addEventListener("click", () => {
      KN.healthSync.importFromClipboard().then((res) => {
        if (res.text != null) {
          // 読めた。次からはまた自動で読みにいきます。
          store.update((st) => { st.settings.clipboardBlocked = false; });
          ta2.value = res.text;
          refresh();
          if (res.ok) { h2.close(); done(res); return; }
          KN.ui.toast(res.error);
          return;
        }
        KN.ui.toast(res.why || res.error);
      });
    });

    b.querySelector(".js-take2").addEventListener("click", () => {
      // 手入力とまったく同じ道。
      const res = KN.healthSync.importText(ta2.value);
      if (res.ok) h2.close();
      done(res);
    });
  }

  /* ---------------- タブを押したら、そのまま読む ----------------

     ダイエットを開くのは、たいてい「ショートカットを走らせた直後」です。
     だったら開いた時点で一度読みにいけば、押すボタンが一つ減ります。

     三つだけ気をつけます。

       1. **黙って失敗する。** クリップボードに買い物のURLが入っている日の
          ほうが多いので、読めなかった・健康データでなかったときは何も
          言いません。知らせるのは入ったときだけ。
       2. **同じものを何度も知らせない。** 一度読んだ中身は覚えておいて、
          変わっていなければ触りません（タブを行き来するたびに
          「1件を更新」と出るのは、報告ではなく騒音です）。
       3. **切れる。** クリップボードを覗く動きなので、設定で止められます。

     読み取りそのものはタブを押した一拍のうちに始めます——そこを外すと、
     ブラウザは「操作のない読み取り」として断ります。

     中継所を設定してあれば、まずそちらを覗きます。クリップボードと違って
     こちらは操作の一拍を必要としないので、非同期でも構いません。中継所に
     届いていなければ、これまでどおりクリップボードを見にいきます——
     どちらか一方に寄せると、片方しか使っていない日に取りこぼします。 */

  let lastAuto = "";

  /** タブを押した一拍のうちに呼ばれます（app.js の show から）。 */
  function onEnter() {
    watchResume();          // 一度だけ。戻ってきたことも合図にします。
    const st = store.get().settings;
    if (st.dietAutoSync === false) return;
    // 中継所は「操作のうち」に縛られないので、先に走らせて構いません。
    // ただしクリップボードの読み取りは一拍のうちに始める必要があるので、
    // 中継所の返事を待たずに、同じ拍で並べて始めます。
    if (KN.healthRelay.configured()) pullRelay();
    if (st.clipboardBlocked) return;
    const state = KN.healthSync.clipboardState();
    if (!state.api) return;

    KN.healthSync.readClipboard().then((text) => {
      if (text == null) return;                 // 読めなかった：黙って引く
      if (text === lastAuto) return;            // さっきと同じ中身
      // 健康データの形をしていなければ、触りません。
      const look = KN.healthSync.preview(text);
      if (!look.ok) return;
      lastAuto = text;
      const res = KN.healthSync.importText(text);
      if (!res.ok) return;
      if (!res.added && !res.updated) return;   // 何も変わらなかった
      render();
      KN.ui.toast("ヘルスケア：" + KN.healthSync.describe(res));
    }).catch(() => { /* 黙って引く */ });
  }

  /* ---------------- ロック中に走ったショートカットのこと ----------------

     iPhoneがロックされているあいだ、HealthKit は暗号化されたままで読めません。
     毎朝のオートメーションはそこに当たることがあって、ショートカットは
     "Protected health data is inaccessible" を返すか、0 を並べて送ってきます。

     それを取り込めば、その日の歩数も睡眠も 0 で塗り替わります。だから

       ・入れない（health-sync.js が断ります。記録は動きません）
       ・**少し待って、もう一度取りにいく**（下の RETRY_WAITS）
       ・それでも駄目なら、そこで諦めます——上書きはしていないので、
         次にタブを開いたとき（＝次の自動実行）また取りにいきます。

     待つ間隔は、短すぎても長すぎても外します。ロックが解けるのは「人が
     iPhoneを触ったとき」なので、20秒・1分・3分と広げながら三度だけ。
     電池を気にする間隔ではありませんし、これ以上引っぱっても、次の
     自動実行のほうが先に来ます。 */
  let retryWaits = [20000, 60000, 180000];
  let retryTimer = 0;

  /* 試験からだけ、間隔を縮めます。20秒・1分・3分を実際に待つ試験は
     書けないので——縮められるのは長さだけで、段取りは同じものを通します。 */
  function __setRetryWaits(list) {
    retryWaits = Array.isArray(list) && list.length ? list.slice() : [20000, 60000, 180000];
  }

  function stopRetry() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = 0; }
  }

  function scheduleRetry(step) {
    stopRetry();
    if (step >= retryWaits.length) return;      // 何度も駄目だった。次の自動実行へ。
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      // そのあいだに事情が変わっていたら、掛け直しません。
      if (store.get().settings.dietAutoSync === false) return;
      if (KN.app.activeScreen && KN.app.activeScreen() !== "diet") return;
      if (!KN.healthRelay.configured()) return;
      pullRelay(step + 1);
    }, retryWaits[step]);
  }

  /* 中継所からの自動取り込み。ここも「黙って失敗する」を守ります——
     電波の悪いところでタブを開くたびに赤い字が出るのは、報告ではなく
     邪魔です。中継所の不調を確かめたいときは、設定の「つないでみる」か
     取り込みシートの「中継所から取り込む」を押します。そこでは黙りません。 */
  /**
   * @param next 掛け直しの何番目の待ち時間を使うか。ふだんの呼び出しは
   *             渡しません（＝掛け直しの最中ではない、ということ）。
   */
  function pullRelay(next) {
    const step = typeof next === "number" ? next : 0;
    const inChain = typeof next === "number";
    return KN.healthRelay.pullAndImport().then((res) => {
      /* 読めない便だった。記録には触れていないので、待って掛け直します。
         ここでも黙ります——ロックしていたのはその人の iPhone で、
         そのことを赤い字で報告される筋合いはありません。取り込み画面の
         ほうに「読めませんでした」と静かに出ます。 */
      if (res.locked) { scheduleRetry(step); render(); return res; }
      if (!res.ok) {
        /* 掛け直しの最中なら、**空も「まだ届いていない」**です。読めない便は
           受け取った時点で郵便受けから消えているので、次に届くのは
           ショートカットがもう一度置いたぶん。それを待ちます。 */
        if (inChain) scheduleRetry(step);
        return res;                             // 掛け直しの外では、黙って引く
      }
      stopRetry();                              // 入った。掛け直しはもう要らない。
      if (!res.added && !res.updated) return res;
      lastAuto = res.text || lastAuto;          // 同じ中身を貼り付けからも読まない
      render();
      KN.ui.toast("中継所：" + KN.healthSync.describe(res));
      return res;
    }).catch(() => ({ ok: false }));
  }

  /* ---------------- 下に引いたとき ----------------

     下に引くのは「取りに行け」です。控えを読み直すだけでは、歩数も睡眠も
     変わりません——あれは中継所の向こうにあるので。

     そして**ここでは黙りません**。自分で引いたのに何も言われないのが、
     いちばん困ります（タブを開いたときの自動取り込みは、電波の悪い場所で
     毎回赤い字が出ないように黙りますが、あれとは事情が違います）。 */
  /* 郵便受けは一通しか持てないので、前の便が読まれないまま上書きされて
     いたことがあります。自分で引いた・押したときだけ言い添えます
     （自動のときが黙るのはそのままです）。 */
  function describeRelay(res) {
    let msg = "中継所：" + KN.healthSync.describe(res);
    // snapshot の便は、前の便が消えても失われたものがありません（上を参照）。
    if (res && res.replaced && !res.snapshot) msg += "／前の便は読まれないまま上書きされていました";
    return msg;
  }

  function refresh() {
    if (!KN.healthRelay.configured()) return Promise.resolve();
    return KN.healthRelay.pullAndImport().then((res) => {
      if (res.ok && (res.added || res.updated)) {
        lastAuto = res.text || lastAuto;
        render();
        KN.ui.toast(describeRelay(res));
        return;
      }
      if (res.empty) { KN.ui.toast("中継所に新しいデータはありません"); return; }
      /* 読めない便だったとき。**入れていない**ので記録は無事です。
         そのことを言って、あとは自動と同じく待って掛け直します。 */
      if (res.locked) { render(); scheduleRetry(0); KN.ui.toast(res.error); return; }
      if (!res.ok) { KN.ui.toast(res.error || "中継所につながりませんでした"); return; }
      KN.ui.toast(describeRelay(res));
    }).catch((err) => {
      KN.ui.toast("中継所につながりませんでした（" + (err && err.message || err) + "）");
    });
  }

  /* ---------------- ほかのアプリから戻ったとき ----------------

     いちばん多い流れは「ショートカットを走らせる → アプリに戻る」です。
     このときダイエットのタブは**もう開いたまま**なので、タブを押す機会が
     ありません。押されなければ onEnter は呼ばれず、中継所は覗かれない——
     「押しても最新にならない」ように見えていた正体はこれです。

     だから、戻ってきたこと自体を合図にします。ここも自動なので黙ります。 */
  function watchResume() {
    if (watchResume.done) return;
    watchResume.done = true;
    const back = () => {
      if (document.visibilityState !== "visible") return;
      if (KN.app.activeScreen && KN.app.activeScreen() !== "diet") return;
      const st = store.get().settings;
      if (st.dietAutoSync === false) return;
      if (!KN.healthRelay.configured()) return;
      /* 置いた直後は、まだ届いていないことがあります（中継所のKVは
         結果整合で、伝わるまで少しかかる）。一度目で空でも、少し置いて
         もう一度だけ覗きます。二度で足りなければ、下に引けば取りにいきます。 */
      pullRelay().then((res) => {
        if (res && res.ok && (res.added || res.updated)) return;
        // 読めない便だったときは、あちらが待って掛け直しています。
        if (res && res.locked) return;
        setTimeout(() => pullRelay(), 4000);
      });
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
  }

  /* ---------------- ＋ ---------------- */

  function dockButton() {
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="記録する" aria-haspopup="menu">${icon("plus")}</button>
      </div>
    `);
    /* ＋ から始められることは三つあります。いちばん多いのは食事ですが、
       からだ も 体重 も、これまでは画面を探して該当の枠を押しにいくしか
       ありませんでした——押したその場に三つ並べます（使う回数の多い順）。 */
    fab.querySelector(".js-open-add").addEventListener("click", (e) => {
      e.stopPropagation();
      KN.app.fabMenu(e.currentTarget, [
        { label: "今日の食事", icon: "meal", onPick: () => openMealMemoSheet(curDay()) },
        { label: "今日のからだ", icon: "steps", onPick: () => openBodySheet(curDay()) },
        { label: "体重", icon: "scale", onPick: () => openWeightSheet(null, curDay()) },
      ]);
    });
    return fab;
  }

  KN.screens = KN.screens || {};
  KN.screens.diet = { mount, render, dockButton, onEnter, refresh,
    // 設定やテストから開けるように
    openWeightSheet, openMealSheet, openMealMemoSheet, openAiSheet, openGoalSheet, openSyncSheet,
    // 前の名前でも開けるように（設定や、外から呼んでいるところのため）
    openMemoSheet: openMealMemoSheet,
    __setRetryWaits,
    // 聞き方と読み取りは、画面を通さずに確かめられるように出しておきます。
    aiPrompt, readAiReply };
})();
