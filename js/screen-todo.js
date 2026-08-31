/* =========================================================
   くらしノート — やること

   The shopping list answers 「何を買う」. This one answers 「いつまでに何を
   する」, which is a different question with a different shape: no prices, no
   shops, no categories — a line of text and, when it matters, the day it is
   wanted by.

   Everything on this screen is arranged around that day. The list is grouped
   by it and coloured by it, the app icon counts what is due by it, dragging a
   row across a divider changes it, and 「毎週」 is what keeps it from being a
   one-off — ticking a repeating todo does not finish it, it moves it on.
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic, formatDay, todayKey, daysUntil, shiftDay } = KN.util;
  const store = KN.store;

  let root = null;
  let els = {};
  let query = "";

  /* くりかえしの選択肢。毎朝と毎晩は、かつて「いつまでに」の下に別の列で
     置いていましたが、あれは同じ問いを二か所で聞いていました——毎朝は
     「一日のいつか」ではなく **どれくらいの頻度でいつ** であって、
     毎日の言い換えの一つです。だから毎日の隣に置きます。

     id は "dawn"/"dusk" のまま。中では repeat="daily" と part="dawn" の
     組で持ちます（記録の形は変えていません。並べ替えも表示もそこを見ます）。 */
  const REPEATS = [
    { id: null,      label: "なし" },
    { id: "daily",   label: "毎日" },
    { id: "dawn",    label: "毎朝" },
    { id: "dusk",    label: "毎晩" },
    { id: "weekly",  label: "毎週" },
    { id: "monthly", label: "毎月" },
  ];
  const WD = KN.util.WEEKDAYS;

  /* 今日 is one shelf, not four.

     It used to be split into 朝・午後・夜, from a time when that was the only
     way to say when in the day something belonged. Two things replaced it: a
     todo can carry the clock itself (19:30 rather than 「夜」), and rows can be
     picked up and put where you want them. Three headings that a row could
     only be sorted into, in a panel you can now simply arrange, were three
     lines of furniture — 「午後」 with nothing under it, every day.

     What is left is the two ends of the day. 毎朝 and 毎晩 are not parts of it:
     not 「今日の朝に」 but 「起きてすること」 and 「寝る前にすること」, which is
     why everything else for the day is listed *between* them rather than among
     them. Both are daily by definition, and the store holds them to it (a
     「毎朝」 that happens once is not a 毎朝).

     Grey, like every other repeat: the ramp says how near a deadline is, and a
     thing you do every morning has no deadline to be near. */
  const BOOKEND_COLOR = "#9aa4a0";
  const BOOKENDS = [
    { id: "dawn", label: "毎朝", color: BOOKEND_COLOR },
    { id: "dusk", label: "毎晩", color: BOOKEND_COLOR },
  ];
  const partLabel = (id) => (BOOKENDS.find((p) => p.id === id) || {}).label || "";
  const isBookend = (id) => id === "dawn" || id === "dusk";

  /** The rule in as few characters as fit under a circle: 火・金, 第2火, 毎日. */
  function repeatShort(t) {
    if (!t.repeat) return "";
    if (isBookend(t.part)) return partLabel(t.part);
    if (t.repeat === "daily") return "毎日";
    if (t.repeat === "weekly") {
      const d = t.repeatDays || [];
      return d.length ? d.map((n) => WD[n]).join("・") : "毎週";
    }
    const n = t.repeatNth;
    if (!n) return "毎月";
    return n.nth === -1 ? `最終${WD[n.weekday]}` : `第${n.nth}${WD[n.weekday]}`;
  }

  /* 「毎週」 on its own says how often; 「毎週 火・金」 says when. Used where
     there is room for the whole rule — the tiles and the sheet. */
  function repeatText(t) {
    if (!t.repeat) return "";
    // 「毎朝」 already says both how often and when; 「毎日 毎朝」 says it twice.
    if (isBookend(t.part)) return partLabel(t.part);
    if (t.repeat === "daily") return "毎日";
    if (t.repeat === "weekly") {
      const d = t.repeatDays || [];
      return d.length ? `毎週 ${d.map((n) => WD[n]).join("・")}` : "毎週";
    }
    const n = t.repeatNth;
    if (!n) return "毎月";
    return n.nth === -1 ? `毎月 最終${WD[n.weekday]}` : `毎月 第${n.nth}${WD[n.weekday]}`;
  }

  /* ---------------- mount ---------------- */

  function mount(el) {
    root = el;
    root.innerHTML = "";

    const chrome = node(html`
      <div class="stack">
        <header class="topbar">
          <div class="topbar-row">
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">やること</h1>
            </div>
            ${/* Right to left: 設定, 並べ方, さがす — the same three, in the
                  same places, on every screen that has them. 設定 is last on
                  the right because it is the one that leaves. */""}
            <button class="icon-btn js-search-btn" aria-label="やることを探す">${icon("search")}</button>
            <button class="icon-btn js-layout"></button>
            <button class="icon-btn js-cal-btn" aria-pressed="true"></button>
            <button class="icon-btn js-settings" aria-label="設定" title="設定">${icon("gear")}</button>
          </div>
        </header>

        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="やることを探す" aria-label="やることを探す"
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
      layout:    chrome.querySelector(".js-layout"),
      settings:  chrome.querySelector(".js-settings"),
      searchBtn: chrome.querySelector(".js-search-btn"),
      screen:     root,
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search:    chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
      body:      chrome.querySelector(".js-body"),
      topbar:    chrome.querySelector(".topbar"),
    };

    KN.ui.wireSearch(els, () => renderBody(), (q) => { query = q; });
    els.layout.addEventListener("click", KN.ui.toggleLayout);
    els.settings.addEventListener("click", () => KN.app.showScreen("settings"));

    /* 暦を出すか、しまうか。**題の右**に置きます——暦そのものの中に
       ボタンを置くと、しまった先にボタンごと消えて戻れなくなります。
       しまっているあいだは、同じ暦に斜線の入った絵に変わります。 */
    const calBtn = chrome.querySelector(".js-cal-btn");
    if (calBtn) {
      paintCalBtn(calBtn);
      calBtn.addEventListener("click", () => {
        KN.motion.fire("select", calBtn);
        store.setCalPref("todo", { shown: !calShown() });
        paintCalBtn(calBtn);
        render();
      });
    }

    /* ずっと見えているカレンダーは、上のバーのすぐ下に貼りつきます。バーの
       高さはノッチの深さで変わるので、実測して渡します——CSSに数字を
       焼き込むと、機種が変わった日にずれます。 */
    const fitCal = () => {
      const h = els.topbar.getBoundingClientRect().height;
      root.style.setProperty("--topbar-h", Math.round(h) + "px");
    };
    fitCal();
    window.addEventListener("resize", fitCal);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", fitCal);

    /* 手でめくった月の留めを外す合図。指が触ったこと、そのものです。 */
    root.addEventListener("pointerdown", unpinOnTouch, { passive: true, capture: true });
    root.addEventListener("wheel", unpinOnTouch, { passive: true, capture: true });

    let lastTop = 0;
    root.addEventListener("scroll", () => {
      const top = root.scrollTop;
      const stuck = top > 4;
      els.topbar.classList.toggle("is-stuck", stuck);
      /* 印を付けるのは境目の線のためと、chromeInset が「いま貼りついて
         いるか」を知るため。**高さは変えません**——指を動かしている最中に
         足場の背が変わると、読んでいる行がずれます。 */
      if (els.cal) els.cal.classList.toggle("is-stuck", stuck);

      /* 月を追いかけるのは、**位置が変わったとき** だけ。scroll は、行が
         増えて高さが変わっただけでも飛んできます。 */
      const moved = Math.abs(top - lastTop) > 0.5;
      lastTop = top;
      if (!moved) return;
      followScroll();
    }, { passive: true });
  }

  /* ---------------- スクロールに月がついていく ----------------

     下の棚はカレンダーをほどいて縦に並べたものなので、いま画面の上に来て
     いる棚が何月かは分かります。9月の棚まで下りたら、上のカレンダーも9月に
     する——同じ場所を、上と下の二つの描き方で見ているだけにしたい。

     逆向きも同じで、カレンダーを払って月を変えたら、リストもその月の頭へ
     動きます。片方だけが動くと、二つは別々のものになってしまいます。 */

  let followFrame = 0;
  /* 手でめくった月は、留めます。その月の棚がまだ無いことはよくあり
     （10月に一件も無ければ10月の棚は出ません）、そのとき位置から月を
     読み直すと、めくった先が「いま見えている月」に上書きされて、
     ‹ › が効かなくなります。留めは、その人がじっさいにスクロールした
     ときに外れます。 */
  let calPinned = false;
  let restoring = false;

  /* 留めを外すのは、**その人がリストに触ったとき**です。

     前は「スクロールが24pxを超えたら外す」でした。これは動いた距離から
     動かした人を当てようとするもので、当たらないことがあります——
     こちらが運んだぶん、描き直しで戻したぶん、カレンダーの背が変わって
     ずれたぶん。どれも指ではないのに、距離だけは出ます。実際、貼りついた
     カレンダーの縮みをやめただけで、‹ › が三回で効かなくなりました。

     指が触ったかどうかは、推し量らずに聞けます。カレンダーの上（矢印や
     払い）は「リストに触った」ではないので、そこは除きます。 */
  function unpinOnTouch(e) {
    if (!calPinned && !dayPinned) return;
    if (els.cal && els.cal.contains(e.target)) return;
    calPinned = false;
    dayPinned = false;
  }

  function followScroll() {
    if (followFrame) return;
    followFrame = requestAnimationFrame(() => {
      followFrame = 0;
      if (!root || !els.cal || query) return;
      /* 自分で滑らせているあいだは、ついていきません。こちらが運んでいる
         最中に位置から月を読み直すと、めくったばかりの月が、通り道の月に
         書き換わります。 */
      if (KN.app.isGliding && KN.app.isGliding()) return;

      const line = els.cal.getBoundingClientRect().bottom + 1;
      let at = null;
      const secs = els.body.querySelectorAll("[data-month]");
      for (let i = 0; i < secs.length; i++) {
        if (!secs[i].getAttribute("data-month")) continue;
        // 画面の上端をまたいでいる棚。まだ来ていないものは相手にしません。
        if (secs[i].getBoundingClientRect().top <= line) at = secs[i];
        else break;
      }
      if (!at) {
        // まだどの棚にも届いていない＝いちばん上。最初の棚に戻します。
        for (let i = 0; i < secs.length; i++) {
          if (secs[i].getAttribute("data-month")) { at = secs[i]; break; }
        }
      }
      if (!at) return;

      /* いま上に来ている棚の日を、カレンダーの中でも塗ります。月だけが
         ついてくると、「8月のどのあたりを見ているか」は分からないまま
         でした。棚と数字は同じ場所を指しているので、同じ印が要ります。

         月の留め（手でめくった）とは無関係に塗ります——留めているのは
         「どの月を出すか」であって、「どこを見ているか」ではないので。
         別の月を出していれば、その日の枠はそこに無く、何も塗られません。 */
      markDay(at.getAttribute("data-day") || "");

      if (calPinned) return;
      const want = at.getAttribute("data-month");
      const [y, mo] = want.split("-").map(Number);
      const cur = shownMonth();
      if (cur.year === y && cur.month === mo - 1) return;
      setCalMonth(y, mo - 1);
    });
  }

  /* いま見ている日。カレンダーを描き直すと印は消えるので、覚えておいて
     描いたあとに付け直します。 */
  let hereDay = "";
  /* 手で押した日は、留めます。押したあとリストを運ぶので、その途中の
     スクロールで「通り道の日」に書き換わってしまうためです。やることの
     無い日には棚がありませんから、運んだ先は近くの棚になり、輪だけが
     押した日から離れることになります。留めは、指がリストに触れば外れます
     （月の留めと同じ合図）。 */
  let dayPinned = false;

  /* カレンダーを月ぜんぶ出すか、いまの週だけに畳むか。既定は週です
     （画面の36%＝306pxを、日付31個と点数個のために使っていました）。
     畳んでもマスはぜんぶ組んであり、隠しているだけです。 */
  const calOpen = () => store.calPrefs("todo").open;
  const calShown = () => store.calPrefs("todo").shown;

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
    if (!sec) return;
    const open = calOpen();
    const shown = calShown();
    sec.classList.toggle("is-week", !open);
    sec.classList.toggle("is-hidden", !shown);
    const btn = sec.querySelector(".js-calmore");
    if (btn) {
      btn.textContent = open ? "月" : "週";
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "週だけにする" : "月ぜんぶを見る");
    }
    if (open) {
      sec.querySelectorAll(".is-off-week").forEach((c) => c.classList.remove("is-off-week"));
      return;
    }
    const first = sec.querySelector(".cal-day");
    const anchor = (here && sec.querySelector(`.cal-day[data-day="${here}"]`))
      ? here : (first ? first.dataset.day : here);
    const w = KN.util.weekOf(anchor || todayKey());
    sec.querySelectorAll(".cal-day").forEach((c) => {
      const k = c.dataset.day;
      c.classList.toggle("is-off-week", k < w.from || k > w.to);
    });
    const padsOn = !!first && first.dataset.day >= w.from && first.dataset.day <= w.to;
    sec.querySelectorAll(".cal-pad").forEach((c) => c.classList.toggle("is-off-week", !padsOn));
  }

  function markDay(day, byHand) {
    if (dayPinned && !byHand) return;
    hereDay = day || "";
    if (byHand) dayPinned = true;
    /* 見ている日が変われば、出す週も変わります（スクロールで日が
       移っていくときも、週がそれについていくように）。 */
    markWeek(els.cal, hereDay || todayKey());
    paintHere();
  }

  function paintHere(jump) {
    if (!els.cal) return;
    els.cal.querySelectorAll(".cal-day.is-here").forEach((c) => c.classList.remove("is-here"));
    const grid = els.cal.querySelector(".cal-grid");
    if (!hereDay) { moveRing(grid, null); return; }
    const cell = els.cal.querySelector(`.cal-day[data-day="${hereDay}"]`);
    if (cell) cell.classList.add("is-here");
    moveRing(grid, cell, jump);
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

  /** いまカレンダーが出している月。 */
  function shownMonth() {
    const now = KN.util.dayDate(todayKey());
    return calMonth || { year: now.getFullYear(), month: now.getMonth() };
  }

  /**
   * カレンダーだけを描き直します。スクロールのたびに画面ぜんぶを組み直すと
   * 指の下で列が跳ねるので、ここは差し替えるものを最小にします。
   */
  function setCalMonth(year, month, manual) {
    const now = KN.util.dayDate(todayKey());
    calMonth = (year === now.getFullYear() && month === now.getMonth())
      ? null : { year, month };
    if (manual) calPinned = true;
    fillCalendar(els.cal, store.openTodos());
  }

  /* ---------------- the add / edit sheet ---------------- */

  /* One sheet for both, because a todo written in a hurry is the same object
     as a todo corrected later, and two forms that differ by a title bar is two
     places for a field to go missing from. */
  function openSheet(todoId) {
    const editing = !!todoId;
    const t = editing ? store.getTodo(todoId) : null;
    if (editing && !t) return;

    /* 新しく書くものは、まず今日のこと。日付なしで足すと「いつか」の棚に
       落ちて、そこは見に行かないと目に入りません。あとから外せます。 */
    let due = editing ? t.due : todayKey();
    let part = editing ? t.part : null;
    let time = editing ? t.time : null;
    let repeat = editing ? t.repeat : null;
    let repeatDays = editing ? (t.repeatDays || []).slice() : [];
    let repeatNth = editing ? (t.repeatNth ? { ...t.repeatNth } : null) : null;
    let flagged = editing ? !!t.flagged : false;
    let minutes = editing ? (t.minutes || null) : null;
    let iconKey = editing ? (t.icon || null) : null;
    haptic(10);

    const body = node(html`
      <div class="stack" style="gap:18px">
        <div class="field">
          <span class="field-label">やること</span>
          ${/* ★は名前の右に。前は一段まるごと使って「★を付ける／同じ日の
                なかで先に出てきます」と書いていましたが、説明のほうが
                ボタンより大きい札は、幅の使い方として逆さまです。 */""}
          <div class="todo-name-row">
            <input class="input js-title" placeholder="例：ゴミ出し・電球を替える"
                   value="${editing ? t.title : ""}"
                   autocomplete="off" autocapitalize="off" spellcheck="false">
            <button type="button" class="icon-btn fav js-flag" aria-pressed="${String(flagged)}"
                    aria-label="★を付ける（同じ日のなかで先に出てきます）"
                    title="★を付ける">${icon("star")}</button>
          </div>
        </div>

        ${/* アイコン。買うものの商品アイコンと同じ選び方です。迷ったときに
              丸のまま置いておくのではなく、中身にいちばん近い絵を積極的に
              選ぶ、という決めごとも揃えます。既定は「おまかせ」——題から
              推した絵で、選んだことになりません（自分で選んだ絵だけが
              「自分で選んだ絵です」と出ます）。 */""}
        <div class="field">
          <span class="field-label">アイコン</span>
          <button type="button" class="icon-pick js-icon-pick">
            <span class="icon-pick-mark js-icon-mark"></span>
            <span class="icon-pick-text">
              <span class="icon-pick-name js-icon-lbl"></span>
              <span class="icon-pick-sub js-icon-sub"></span>
            </span>
            <span class="price-chevron">${icon("chevron")}</span>
          </button>
        </div>

        <div class="field">
          <span class="field-label">いつまでに</span>
          <div class="js-due-chips"></div>
          ${/* 空のとき、iOS の日付欄も時刻欄も **何も出しません**。枠だけが
                並んで、何の欄なのか分からなくなります。だから空のときは
                自分で「--/--/--」「--:--」と書いて、押せば選べることを
                見せます。

                日付と時刻は横に並べます。二つで一つの答え（いつ）なので、
                段を分けると、時刻だけが宙に浮いて見えます。時刻の欄は
                日付が空でも出したままにします——「なし」を選んだ人が、
                そのあとで時刻を足せなくなるのは変なので。 */""}
          <div class="date-row">
            <span class="date-cell">
              <input class="input js-due" type="date" value="${due || ""}"
                     aria-label="日付を選ぶ">
              <span class="date-empty js-due-empty" aria-hidden="true">--/--/--</span>
            </span>
            <span class="date-cell is-time">
              <input class="input js-time" type="time" aria-label="時刻を選ぶ">
              <span class="date-empty js-time-empty" aria-hidden="true">--:--</span>
            </span>
            <button type="button" class="icon-btn js-time-clear" aria-label="時刻をはずす" hidden>
              ${icon("close")}
            </button>
          </div>
          <span class="field-hint js-due-hint"></span>
          ${/* 毎朝・毎晩のときだけ出します。そう言っておかないと「毎朝なのに
                19:30 と書いていいのか」で迷います。 */""}
          <span class="field-hint js-time-note" hidden>時刻は、お知らせを出す
            タイミングです。並ぶ場所は毎朝・毎晩のままです。</span>
        </div>

        ${/* どれくらいかかるか。

              これは締め切りでも目標でもありません。**今日の時間割を組む
              ための長さ**です。決めなくても構いません——決めていないものは
              30分として置かれます。

              札で選ばせるのは、分を打たせると「25分か30分か」を考え始めて
              しまうからです。見積もりはそこまで細かくならないので、
              よく使う長さだけを並べます。 */""}
        <div class="field">
          <span class="field-label">どれくらい かかる</span>
          <div class="js-mins"></div>
          <span class="field-hint">今日の時間割を組むのに使います。
            決めなければ 30分ぶんの場所を取ります。</span>
        </div>

        ${/* **その長さが入る空き**を、そのまま押せる形で出します。

              時刻を決めるのに時計の欄を開いて「何時なら空いていたか」を
              思い出させるのは、この画面がもう知っていることを人にやらせて
              います。長さが決まった時点で答えは出せるので、押せば決まる形
              で置きます。

              入る空きが無い日は、何も出しません——入らない時間を勧める
              くらいなら、黙っているほうがいい。 */""}
        <div class="field js-slot-field" hidden>
          <span class="field-label">空いているところ</span>
          <div class="js-slots"></div>
        </div>

        ${/* 中の段取り。

              「朝のしたく」のような一件は、それ自体がいくつかの手順です。
              手順ごとに別々の用事へ割ると一日が細切れに見えますし、一件に
              まとめてしまうと何が残っているのか分かりません。中に持たせます。

              くりかえしと合わせれば、そのままルーティンです——毎朝の一件が、
              中に同じ手順を持って毎日戻ってきます。 */""}
        <div class="field">
          <span class="field-label">中の段取り（任意）</span>
          <div class="sub-edit js-subs"></div>
          <button type="button" class="btn btn-soft js-sub-add">手順を足す</button>
        </div>

        ${/* 見出しは付けません。札に「なし・毎日・毎朝…」と書いてあるので、
              その上に「くりかえし」と重ねて言う必要がありません。 */""}
        <div class="field">
          <div class="js-repeat"></div>
          ${/* Which days, once 毎週 or 毎月 is chosen. Hidden otherwise —
                「なし」 has no days to ask about. */""}
          <div class="js-repeat-detail" hidden></div>
          <span class="field-hint js-repeat-hint" hidden></span>
        </div>

        <label class="field">
          <span class="field-label">メモ（任意）</span>
          <textarea class="input memo-input js-memo" rows="3"
                    placeholder="例：可燃ごみ・8時まで">${editing ? t.memo || "" : ""}</textarea>
        </label>

        ${editing ? html`
          <button type="button" class="btn btn-soft js-delete" style="color:var(--c-danger)">
            このやることを削除
          </button>` : ""}
      </div>
    `);

    const titleEl = body.querySelector(".js-title");
    const dueEl = body.querySelector(".js-due");
    const hintEl = body.querySelector(".js-due-hint");
    const flagBtn = body.querySelector(".js-flag");

    /* アイコンの札。選んだ鍵（iconKey）と、いま打ってある題の両方が
       見え方を決めます——おまかせのときは、打つそばから推す絵が変わる
       ので、題の変化にも塗り直しが要ります。 */
    const iconPickBtn = body.querySelector(".js-icon-pick");
    function paintIcon() {
      const own = iconKey && KN.productIcons.byKey(iconKey);
      iconPickBtn.querySelector(".js-icon-mark").innerHTML = iconMarkHtml(titleEl.value, iconKey);
      iconPickBtn.querySelector(".js-icon-lbl").textContent =
        own ? (KN.productIcons.LABELS[iconKey] || iconKey) : "おまかせ";
      iconPickBtn.querySelector(".js-icon-sub").textContent =
        own ? "自分で選んだ絵です" : "題から選んでいます";
    }
    paintIcon();
    iconPickBtn.addEventListener("click", () => {
      openTodoIconPicker(iconKey, titleEl.value, (key) => { iconKey = key; paintIcon(); });
    });
    titleEl.addEventListener("input", () => { if (!iconKey) paintIcon(); });
    const foot = node(html`
      <button class="btn btn-primary btn-block js-save" ${editing ? "" : KN.util.raw("disabled")}>
        ${editing ? "保存" : "追加"}
      </button>
    `);

    const handle = KN.ui.sheet({
      title: editing ? "やることを直す" : "やることを追加",
      content: body,
      footer: foot,
      /* 書きかけのまま閉じようとしたら、一度だけ聞きます。 */
      guard: true,
    });

    /* The days a todo is nearly always for, in one press each. Typing a date
       into a date field is four taps that 「明後日」 does in one, and the
       calendar underneath is still there for the ones that are a real date. */
    /* 押せる候補は、口に出して言う日だけ。「明々後日」「1週間後」「1か月後」は
       外しました——数が増えるほど探す時間が延びますし、そのあたりの日は
       たいてい下の日付欄で選んだほうが早い（「来週の火曜」は1週間後とは
       限りません）。 */
    const DUE_CHIPS = () => [
      { id: todayKey(), label: "今日" },
      { id: shiftDay(todayKey(), 1), label: "明日" },
      { id: shiftDay(todayKey(), 2), label: "明後日" },
      { id: "", label: "なし" },
    ];

    /* 空かどうかで、かぶせる「--/--/--」を出し入れします。 */
    function paintDueEmpty() {
      const ph = body.querySelector(".js-due-empty");
      if (ph) ph.hidden = !!due;
    }

    function paintDueChips() {
      KN.ui.chipRow(body.querySelector(".js-due-chips"), DUE_CHIPS(), {
        activeId: due || "",
        onPick: (id) => {
          due = id || null;
          if (!due) { part = null; time = null; }
          dueEl.value = due || "";
          paintDueEmpty();
          paintDueChips();
          paintPart();
          paintHint();
          paintRepeatDetail();
          haptic();
        },
      });
    }

    /* What a date actually buys you is the number on the app icon — and on
       iPhone that is behind a setting most people never open. So the hint says
       so, and offers to switch it on from here, where the reason for it is on
       screen. */
    function paintHint() {
      hintEl.innerHTML = "";
      if (!due) {
        /* 何も言いません。日付が空であることは、欄そのもの（--/--/--）が
           言っています。同じことを二度書くと、そのぶん縦に伸びます。 */
        return;
      }
      /* Said here rather than discovered at 19:30. Two different sentences,
         because with the switch on the app really does say something at the
         time — just not while it is closed, which is the part that has to be
         written down rather than assumed. */
      if (time) {
        const nt = KN.notify;
        if (nt && nt.supported() && nt.enabled() && !nt.blocked()) {
          hintEl.textContent =
            `${time}になったらお知らせします（閉じているあいだは、次に開いたときに）`;
          return;
        }
        hintEl.textContent = `${formatDay(due)} ${time}まではアイコンの数に入りません`;
        if (nt && nt.supported() && !nt.enabled()) {
          const b = node(html`
            <span>　その時刻に知らせるには
              <button type="button" class="link-btn js-notify-on">オンにする</button></span>
          `);
          b.querySelector(".js-notify-on").addEventListener("click", async () => {
            const ok = await nt.enable();
            paintHint();
            if (!ok) KN.ui.toast("端末の設定で通知が許可されていないため、出せませんでした");
          });
          hintEl.append(b);
        }
        return;
      }
      if (isBookend(part)) {
        hintEl.textContent = part === "dawn"
          ? "毎日くり返して、その日のいちばん上に出ます"
          : "毎日くり返して、その日のいちばん下に出ます";
        return;
      }
      /* 日付を選んだだけのときは、何も言いません。「その日が来ると
         アイコンに数が出ます」は、毎回おなじことを読ませるだけで、
         読む人はもう知っています（アイコンの数の入り切りは、設定に
         あります）。 */
    }

    /* 朝・午後・夜 and the clock are one question with two grains, so they are
       drawn as one control: the chips say roughly when, the field says exactly
       when, and whichever was touched last is the answer. A time lights up the
       part it falls in, so 19:30 visibly *is* 夜 rather than something else
       sitting beside it. */
    const timeCell = body.querySelector(".date-cell.is-time");
    const timeEl = body.querySelector(".js-time");
    const timeClear = body.querySelector(".js-time-clear");

    /* かかる時間。よく使う長さだけを札で出します——分を打たせると
       「25分か30分か」を考え始めてしまい、見積もりはそこまで細かく
       なりません。「決めない」も答えのうちなので、先頭に置きます。

       2時間までは30分刻み、そこから先は1時間刻みにします。外出や作業
       まとめのように長くかかる用事も、札を押すだけで置けるように
       （買い物へ行く、通院、旅行の移動など）。上限は cleanMinutes と
       同じ12時間——それ以上は一日の別の使い方（複数の用事に割る）の話
       なので、ここでは扱いません。 */
    const MINS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720];
    const minsHost = body.querySelector(".js-mins");
    function paintMins() {
      KN.ui.chipRow(minsHost, [{ id: "", label: "決めない" }].concat(
        MINS.map((m) => ({ id: String(m), label: KN.plan.humanSpan(m) }))
      ), {
        activeId: minutes ? String(minutes) : "",
        onPick: (id) => {
          minutes = id ? Number(id) : null;
          KN.motion.fire("select");
          paintMins();
          paintSlots();
        },
      });
    }

    /* その日の組み立てを引いて、いま決めている長さが入る空きを出します。

       いま直している一件は、組み立てから**外して**数えます。入れたまま
       だと、自分がすでに占めている場所を「空いていません」と自分に言い
       返すことになります。 */
    const slotField = body.querySelector(".js-slot-field");
    const slotHost = body.querySelector(".js-slots");
    function paintSlots() {
      const day = due;
      if (!day) { slotField.hidden = true; return; }
      /* その日のものを、そのまま拾います。**todosDue は使えません**
         ——あれは日を取らず、「いま来ているもの」を返します（お知らせ用）。
         渡した日は黙って捨てられ、時刻がまだ来ていない用事が居ないことに
         なって、一日じゅう空いているという答えが返っていました。

         済ませたものも渡します。組み立て側が、済んだものは「これからの
         時間」を食べないように扱います（時間割と同じ）。 */
      const rows = store.get().todos.filter((x) => x.due === day && !x.archived && !x.trace
        && (!editing || x.id !== todoId));
      const isToday = day === todayKey();
      const cfg = store.get().settings;
      const plan = KN.plan.buildDay(day, rows, {
        start: cfg.dayStart, end: cfg.dayEnd,
        now: isToday ? KN.util.nowTime() : null,
      });
      const slots = KN.plan.slotsFor(plan, minutes || KN.plan.DEFAULT_MINUTES,
        isToday ? KN.util.nowTime() : "00:00");
      slotField.hidden = !slots.length;
      if (!slots.length) return;
      KN.ui.chipRow(slotHost, slots.map((s) => ({ id: s.at, label: s.at })), {
        activeId: time || "",
        onPick: (id) => {
          /* もう一度押したら外れます。決めたものを外す道が無いのは不便です。 */
          time = time === id ? null : id;
          KN.motion.fire("select");
          paintPart();
          paintHint();
          paintSlots();
        },
      });
    }
    paintMins();

    /* ---- 中の段取りを書くところ ----

       欄をそのまま並べます。ここで印を付けさせないのは、**書く**のと
       **やる**が別のことだからです。印は時間割の行のほうで付けます
       ——手順を直しに来て、ついでに済ませたことにしてしまう、という
       取り違えが起きないように。 */
    let subs = editing ? (t.subs || []).map((x) => ({ ...x })) : [];
    const subHost = body.querySelector(".js-subs");
    function paintSubs(focusAt) {
      subHost.textContent = "";
      subs.forEach((s, i) => {
        const line = node(html`
          <div class="sub-line">
            <input class="input js-sub" value="${s.title}" placeholder="例：顔を洗う"
                   aria-label="${i + 1}つめの手順" autocomplete="off">
            <button type="button" class="icon-btn js-sub-del"
                    aria-label="この手順を消す">${icon("close")}</button>
          </div>
        `);
        const field = line.querySelector(".js-sub");
        field.addEventListener("input", () => { subs[i].title = field.value; });
        /* 改行で次の手順へ。続けて書くときに、いちいち「足す」を押しに
           戻らなくて済みます。 */
        field.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          subs.splice(i + 1, 0, { id: "s" + Date.now() + i, title: "", done: false });
          paintSubs(i + 1);
        });
        line.querySelector(".js-sub-del").addEventListener("click", () => {
          subs.splice(i, 1);
          KN.motion.fire("delete");
          paintSubs();
        });
        subHost.append(line);
      });
      if (focusAt != null) {
        const el = subHost.querySelectorAll(".js-sub")[focusAt];
        if (el) KN.ui.focusNow(el);
      }
    }
    body.querySelector(".js-sub-add").addEventListener("click", () => {
      subs.push({ id: "s" + Date.now() + subs.length, title: "", done: false });
      KN.motion.fire("add");
      paintSubs(subs.length - 1);
    });
    paintSubs();

    /* 時刻の欄はいつも出しておきます（日付が「なし」でも、毎朝・毎晩でも）。

       かつては毎朝・毎晩のあいだ伏せていました——「朝」と「7:30」は同じ
       問いへの二つの答えだから、と。ですが**並び順と、報せる時刻は別のこと**
       です。毎朝は一日のいちばん上に居てほしい、でもバッジは7時に出てほしい。
       前者は毎朝・毎晩が、後者は時刻が決めます。 */
    function paintPart() {
      timeCell.hidden = false;
      timeEl.value = time || "";
      timeClear.hidden = !time;
      const ph = body.querySelector(".js-time-empty");
      if (ph) ph.hidden = !!time;
      const note = body.querySelector(".js-time-note");
      if (note) note.hidden = !isBookend(part);
    }

    timeEl.addEventListener("change", () => {
      time = KN.util.isTime(timeEl.value) ? timeEl.value : null;
      // 毎朝・毎晩はそのまま。時刻は「いつ報せるか」なので、並ぶ場所とは別。
      paintPart();
      paintHint();
      paintSlots();      // 自分で打った時刻も、札のほうに映します
    });
    timeClear.addEventListener("click", () => {
      time = null;
      paintPart();
      paintHint();
      paintSlots();
      haptic();
    });

    paintDueChips();
    paintDueEmpty();
    paintPart();
    paintHint();
    paintSlots();

    dueEl.addEventListener("change", () => {
      due = dueEl.value || null;
      // 日付を外すと、毎朝・毎晩の立つ場所が無くなります。くりかえしの
      // 列にもそれが見えていないといけないので、そちらも塗り直します。
      const dropped = !due && isBookend(part);
      if (!due) { part = null; time = null; }
      paintDueEmpty();
      paintDueChips();
      paintPart();
      paintHint();
      paintSlots();      // 日が変われば、空いているところも変わります
      if (dropped) paintRepeat(); else paintRepeatDetail();
    });

    const detailEl = body.querySelector(".js-repeat-detail");
    const repeatHint = body.querySelector(".js-repeat-hint");

    /* 毎朝・毎晩は、記録の上では「毎日 ＋ 日の端」です。選択肢としては
       毎日の隣に一つずつ並びますが、しまうときは repeat と part に分かれます。
       だから光らせる印も、その二つから逆に組み立てます。 */
    const repeatChipId = () => (isBookend(part) ? part : (repeat || ""));

    function paintRepeat() {
      KN.ui.chipRow(body.querySelector(".js-repeat"),
        REPEATS.map((r) => ({ id: r.id || "", label: r.label })), {
          activeId: repeatChipId(),
          onPick: (id) => {
            if (isBookend(id)) {
              /* 毎朝・毎晩は、言葉の意味からして毎日です。そして時刻とは
                 同じ問いへの二つの答えなので、片方を選べば片方は降ります。 */
              part = id;
              repeat = "daily";
              // 時刻は残します（バッジをいつ出すかの指定なので）。
            } else {
              part = null;
              repeat = id || null;
            }
            if (repeat !== "weekly") repeatDays = [];
            if (repeat !== "monthly") repeatNth = null;
            paintRepeat();
            paintPart();
            paintHint();
            haptic();
          },
        });
      paintRepeatDetail();
    }

    /* 毎週 asks which days — more than one, because 「燃えるゴミは火と金」 is
       one rule, not two todos. 毎月 asks whether it is a date or a 「第2火曜」,
       and both of those are read off the day already chosen above, so the
       question is a choice between two readings rather than a form. */
    function paintRepeatDetail() {
      detailEl.innerHTML = "";
      detailEl.hidden = repeat !== "weekly" && repeat !== "monthly";
      repeatHint.hidden = detailEl.hidden;
      if (detailEl.hidden) return;

      if (repeat === "weekly") {
        const row = node(html`<div class="chip-row js-days"></div>`);
        KN.util.WEEKDAYS.forEach((label, n) => {
          const on = repeatDays.includes(n);
          const chip = node(html`
            <button type="button" class="chip ${on ? "is-on" : ""}" aria-pressed="${String(on)}"
                    data-day="${String(n)}">${label}</button>
          `);
          chip.addEventListener("click", () => {
            repeatDays = repeatDays.includes(n)
              ? repeatDays.filter((x) => x !== n)
              : repeatDays.concat(n).sort((a, b) => a - b);
            paintRepeatDetail();
            haptic();
          });
          row.append(chip);
        });
        detailEl.append(row);
        repeatHint.textContent = repeatDays.length
          ? `毎週 ${repeatDays.map((n) => KN.util.WEEKDAYS[n]).join("・")} にくり返します`
          : "曜日を選ばないと、いまの日付と同じ曜日で1週間ごとにくり返します";
        return;
      }

      const base = due || KN.util.todayKey();
      const info = KN.util.weekdayNth(base);
      const d = KN.util.dayDate(base);
      const opts = [
        { id: "day", label: `毎月${d.getDate()}日` },
        { id: `nth:${info.nth}`, label: `第${info.nth}${KN.util.WEEKDAYS[info.weekday]}曜日` },
      ];
      if (info.last) opts.push({ id: "nth:-1", label: `最終${KN.util.WEEKDAYS[info.weekday]}曜日` });

      const active = repeatNth ? `nth:${repeatNth.nth}` : "day";
      const row = node(html`<div class="chip-row"></div>`);
      opts.forEach((o) => {
        const on = o.id === active;
        const chip = node(html`
          <button type="button" class="chip ${on ? "is-on" : ""}" aria-pressed="${String(on)}">${o.label}</button>
        `);
        chip.addEventListener("click", () => {
          repeatNth = o.id === "day" ? null : { nth: Number(o.id.slice(4)), weekday: info.weekday };
          paintRepeatDetail();
          haptic();
        });
        row.append(chip);
      });
      detailEl.append(row);
      repeatHint.textContent = repeatNth
        ? "月によって日付は変わります（31日のない月も飛ばしません）"
        : "その月に無い日は、その月の最後の日になります";
    }

    paintRepeat();

    flagBtn.classList.toggle("is-on", flagged);
    flagBtn.addEventListener("click", () => {
      flagged = !flagged;
      flagBtn.classList.toggle("is-on", flagged);
      flagBtn.setAttribute("aria-pressed", String(flagged));
      haptic(10);
    });

    titleEl.addEventListener("input", () => { foot.disabled = !titleEl.value.trim(); });

    foot.addEventListener("click", () => {
      const title = titleEl.value.trim();
      if (!title) return;
      const memo = body.querySelector(".js-memo").value;
      /* 「毎週 火・金」 with a Monday on it is a rule and a date that disagree.
         The rule is the one that was just chosen on purpose, so the date moves
         to the first day the rule actually falls on. */
      const rule = { repeat, repeatDays, repeatNth };
      const fixed = due ? store.snapToRule(rule, due) : due;
      const at = fixed ? time : null;
      const when = fixed ? formatDay(fixed) + (at ? ` ${at}` : "") : "";
      /* 毎朝・毎晩は、時刻を書いても**残します**。

         ここは `fixed && !at ? part : null` でした——時刻を入れた瞬間に
         毎朝・毎晩を捨てる、という式です。「朝」と「7:30」は同じ問いへの
         二つの答えだから、と考えていたころの名残でした。

         いまは別の問いです。**毎朝・毎晩は「その日のどこに並ぶか」、時刻は
         「いつ報せるか」。** 画面の側（paintPart）も並べ替え（store の
         todoPart）も、とうにそう直してありました。しまうところだけが
         古いままで、直したつもりの札が、保存の瞬間に外れていました。 */
      if (editing) {
        store.updateTodo(todoId, { title, due: fixed, part: fixed ? part : null, time: at,
          repeat, repeatDays, repeatNth, memo, flagged, minutes, icon: iconKey });
        /* 手順は別に置きます。updateTodo は書いてよい欄を選ぶので、
           知らない欄を混ぜると黙って落ちます。 */
        store.setSubs(todoId, subs);
        KN.ui.toast(fixed !== due ? `${when}にしました` : "直しました");
      } else {
        store.addTodo({ title, due: fixed, part: fixed ? part : null, time: at,
          repeat, repeatDays, repeatNth, memo, flagged, minutes, subs, icon: iconKey });
        KN.ui.toast(fixed
          ? `「${title}」を${when}までに`
          : `「${title}」を追加しました`);
      }
      haptic(12);
      handle.close();
    });

    const del = body.querySelector(".js-delete");
    if (del) {
      del.addEventListener("click", () => {
        const undo = store.removeTodo(todoId);
        haptic(14);
        handle.close();
        KN.ui.toast("削除しました", { action: { label: "元に戻す", onClick: undo } });
      });
    }

    /* New ones open ready to type — see focusNow: the focus has to happen in
       the same beat as the tap or iOS leaves the keyboard down. Editing an
       existing todo does not, because the thing you came to change is as
       likely to be the date as the words. */
    if (!editing) KN.ui.focusNow(titleEl);
  }

  /* ---------------- when, as a set of shelves ----------------

     Not six buckets any more but a calendar laid out downwards, the way the
     Reminders app does it: 今日 split into 朝・午後・夜, then tomorrow, the day
     after, the days of the coming week one by one, then whole weeks, then whole
     months, then 「いつか」.

     They are drawn even when empty, as thin labelled lines. That is the whole
     point of them: an empty shelf is a place to put something, and rescheduling
     is meant to be picking a row up and dropping it two lines down rather than
     opening a sheet and reading a date field. A slot you cannot see is a slot
     you cannot aim at.

     The colour runs from the red of today out to the blue of things far off,
     and grey for what has no day at all — near is hot, far is cool, undecided
     is neither. */

  const DAY_COLORS = ["#e05a3a", "#e08a3a", "#cfa93c", "#8bb34a", "#6aae55", "#5aa55a", "#4fa17a", "#49a0a0"];
  const WEEK_COLOR = "#4a8fd9";
  const MONTH_COLOR = "#6a7fd0";
  const NONE_COLOR = "#9aa4a0";

  /* Built fresh on every render, because every one of them is 「how far from
     today」 and today moves. */
  function buildGroups() {
    const today = todayKey();
    const U = KN.util;
    const out = [];

    out.push({ id: "late", label: "期限切れ", color: "#b23a2e", late: true, drop: null });

    // 今日 — the panel, and the three parts of the day inside it.
    /* Dropping onto one of these is a statement about the time of day, so it
       clears any clock time as well — otherwise 19:30 carried up to 朝 would
       file itself straight back under 夜 and the drop would look ignored.
       Dropping onto a *day* leaves the time alone: only the day changed. */
    /* 今日は一枚。毎朝と毎晩は、かつてそれぞれ見出しを持っていましたが、
       やめました——ほかの日はどれも見出しが一つで、今日だけ三つあるのは、
       同じ「一日」を別の作りで描いていることになります。毎朝と毎晩は
       いまも日の両端に並びますが、それは並び順が言うことで、見出しが
       言うことではありません（行の左に「毎朝」と出ます）。 */
    out.push({ id: "today", label: "今日", color: DAY_COLORS[0], today: true, day: today,
      drop: () => ({ due: today, part: null }) });

    // The coming week, a day at a time.
    for (let i = 1; i <= 7; i++) {
      const day = U.shiftDay(today, i);
      const d = U.dayDate(day);
      /* どの日も、まず日付。「明日」だけが日付を持たないと、下に並ぶ
         「8月20日 木」と読み方が変わってしまいます。呼び名はそのうしろに
         添えるもの。 */
      const date = `${d.getMonth() + 1}月${d.getDate()}日 ${U.WEEKDAYS[d.getDay()]}`;
      const label = i === 1 ? `${date} 明日` : i === 2 ? `${date} 明後日` : date;
      out.push({ id: "d" + i, label, color: DAY_COLORS[Math.min(i, DAY_COLORS.length - 1)],
        day, drop: () => ({ due: day }) });
    }

    /* Then whole weeks. 「8月 第3週」 is how a week gets referred to out loud,
       and it is close enough to aim at without being a date you have to decide
       on yet — dropping into one lands on its first day that has not gone. */
    for (let w = 0; w < 3; w++) {
      const from = U.shiftDay(today, 8 + w * 7);
      const to = U.shiftDay(from, 6);
      const d = U.dayDate(from);
      const nth = Math.floor((d.getDate() - 1) / 7) + 1;
      out.push({
        id: "w" + w, label: `${d.getMonth() + 1}月 第${nth}週`, color: WEEK_COLOR,
        from, to, drop: () => ({ due: from }),
      });
    }

    // And then whole months, from the one after the last week shown.
    const afterWeeks = U.shiftDay(today, 8 + 2 * 7 + 7);
    const aw = U.dayDate(afterWeeks);
    for (let m = 0; m < 3; m++) {
      const first = new Date(aw.getFullYear(), aw.getMonth() + m, 1);
      const year = first.getFullYear(), month = first.getMonth();
      const start = m === 0 ? afterWeeks : U.dayKey(first);
      out.push({
        id: `m${year}-${month}`, label: `${month + 1}月`, color: MONTH_COLOR,
        year, month, from: start, drop: () => ({ due: start }),
      });
    }

    const lastMonth = out[out.length - 1];
    out.push({
      id: "far", label: "もっと先", color: MONTH_COLOR, far: true, onlyWhenFull: true,
      drop: () => ({ due: U.dayKey(new Date(lastMonth.year, lastMonth.month + 1, 1)) }),
    });

    out.push({ id: "none", label: "いつか", color: NONE_COLOR, none: true,
      drop: () => ({ due: null }) });

    return out;
  }

  /** Which shelf a todo sits on. */
  function groupIdOf(t, groups) {
    if (!t.due) return "none";
    const n = daysUntil(t.due);
    if (n < 0) return "late";
    // 今日はひと棚。毎朝も毎晩もここに入り、並び順だけが日の両端に置きます。
    if (n === 0) return "today";
    if (n <= 7) return "d" + n;
    const week = groups.find((g) => g.from && g.to && t.due >= g.from && t.due <= g.to);
    if (week) return week.id;
    const d = KN.util.dayDate(t.due);
    const month = groups.find((g) => g.year === d.getFullYear() && g.month === d.getMonth());
    if (month) return month.id;
    return "far";
  }

  /* The painted edge says when this is due. Once it is done or put away there
     is no 「when」 left to say, and a red edge on a finished row goes on
     shouting 今日 at something nobody has to do — so the archive drops to the
     same neutral grey the undated rows wear. */
  const colorOf = (t, groups) => {
    if (t.done || t.archived) return NONE_COLOR;
    /* A repeating todo wears the same grey. The ramp answers 「あとどれくらい
       で締切か」, and 「ゴミ出し」 has no such answer — it comes round again on
       Friday whatever happens today. Painting it red among the things that
       really do have to happen today makes the red mean less. Its own mark is
       the ↻ in the circle. */
    if (t.repeat) return NONE_COLOR;
    const g = groups.find((x) => x.id === groupIdOf(t, groups));
    return (g && g.color) || NONE_COLOR;
  };

  /* やることの絵。買うものと同じ辞書（product-icons.js）を、同じ引き方で
     引きます。用事の言い回し——歯医者・銀行・ゴミ出し・保育園・役所——は
     アイコン刷新のときに描き足したので、いまはどれも当たります。

     選べるようにはしていません。買うものは「同じ品を何度も」なので手で
     直す値打ちがありますが、やることは一度きりの文が多く、いちいち絵を
     選ばせるのは手間のほうが大きい。名前から引くだけにしてあります。

     当たらないときは、期限の色の丸に落とします。絵の無い行だけ左端が
     空くと列が崩れるので、何かは必ず置く。丸は「まだ絵が無い」の目印で
     あって、失敗の表示ではありません。 */
  /** 自分で選んだ絵（あれば）、無ければ題から推した絵。無ければ丸だけ。
   *  シート内の「いまの見え方」プレビューと、行そのものの両方が使います。 */
  function iconMarkHtml(titleText, key) {
    const svg = (key && KN.productIcons.byKey(key)) || KN.productIcons.find(titleText || "");
    return svg
      ? html`<span class="todo-mark">${KN.util.raw(svg)}</span>`
      : html`<span class="todo-mark is-plain"><i class="todo-dot"></i></span>`;
  }

  function todoMark(t) {
    return iconMarkHtml(t.title, t.icon);
  }

  /* ---------------- やることの絵を選ぶ ----------------

     買うものの商品アイコンと、同じ絵の一覧・同じ選び方です（KN.productIcons）。
     ここではまだ何も保存しません——選んだ鍵をシートに持たせておいて、
     「追加」「保存」を押したときに他の欄と一緒に書き込みます。書きかけの
     ままシートを閉じても、その場では何も変わっていないように。 */
  function openTodoIconPicker(current, titleText, onChoose) {
    const body = node(html`
      <div class="stack" style="gap:14px">
        <input class="input js-q" placeholder="絵をさがす（例：洗剤）"
               autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="絵をさがす">
        <div class="stack js-grids" style="gap:14px"></div>
      </div>
    `);
    const grids = body.querySelector(".js-grids");
    const q = body.querySelector(".js-q");
    const handle = KN.ui.sheet({ title: "アイコンを選ぶ", content: body });

    function choose(key) {
      KN.motion.fire("select");
      onChoose(key || null);
      handle.close();
    }

    /* 絵が800を超えるので、開いた瞬間に全部を組むと手が止まります
       （product-sheet.js の同じ仕掛けと同じ理由）。最初の一掴みだけ
       同期で入れ、残りはフレームごとに継ぎ足します。 */
    const CHUNK = 120;
    let painting = 0;
    function grid(items) {
      const g = node(html`<div class="icon-grid"></div>`);
      const cellOf = ({ key, label, svg }) => {
        const cell = node(html`
          <button type="button" class="icon-cell ${key === current ? "is-on" : ""}"
                  data-key="${key}" aria-pressed="${String(key === current)}">
            <span class="icon-cell-mark">${KN.util.raw(svg)}</span>
            <span class="icon-cell-label">${label}</span>
          </button>
        `);
        cell.addEventListener("click", () => choose(key));
        return cell;
      };
      const head = items.slice(0, CHUNK);
      head.forEach((it) => g.append(cellOf(it)));
      if (items.length > CHUNK) {
        const mine = ++painting;
        let at = CHUNK;
        const more = () => {
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

    const heading = (text) => node(html`<span class="field-label">${text}</span>`);

    function paint() {
      grids.innerHTML = "";
      const query = q.value.trim();
      if (query) {
        const hits = KN.productIcons.search(query);
        if (!hits.length) {
          grids.append(node(html`
            <p style="color:var(--c-text-3);font-size:13px;padding:8px 0">
              「${query}」に合う絵はありません
            </p>
          `));
          return;
        }
        grids.append(grid(hits));
        return;
      }
      const auto = node(html`
        <button type="button" class="icon-auto js-auto ${current ? "" : "is-on"}"
                aria-pressed="${String(!current)}">
          <span class="icon-pick-mark">${iconMarkHtml(titleText, null)}</span>
          <span class="icon-pick-text">
            <span class="icon-pick-name">おまかせにする</span>
            <span class="icon-pick-sub">題から選びます</span>
          </span>
        </button>
      `);
      auto.addEventListener("click", () => choose(null));
      grids.append(auto);

      const maybe = KN.productIcons.suggest(titleText, 8);
      if (maybe.length) {
        grids.append(heading("もしかして"));
        grids.append(grid(KN.productIcons.list().filter((x) => maybe.includes(x.key))
          .sort((a, b) => maybe.indexOf(a.key) - maybe.indexOf(b.key))));
      }
      grids.append(heading("ぜんぶ"));
      grids.append(grid(KN.productIcons.list()));
    }
    q.addEventListener("input", KN.util.debounce(paint, 160));
    paint();
    return handle;
  }

  /* ---------------- rows ---------------- */

  function todoRow(t, tiles, groups, shelf) {
    const closed = t.done || t.archived;
    const when = closed ? store.todoClosedAt(t) : null;
    const late = !closed && t.due && daysUntil(t.due) < 0;
    /* The shelf already says which day, and often which part of it, so the row
       does not repeat it. 「今日」 written on a row sitting under a heading that
       says 今日 is a word that has to be read to learn nothing. Kept where the
       shelf is vaguer than the row: a week, a month, the archive, a search. */
    const sameDay = !!(shelf && shelf.day && !closed);
    /* A time is never redundant with its shelf: 夜 says which third of the
       evening block this is in, 19:30 says when. So it is shown wherever it
       exists, and it takes the place the part label would have had. */
    const at = !closed && t.due ? t.time : null;

    /* The circle carries the ↻ for a repeating todo. It is the one control on
       the row whose meaning actually changes: pressing it does not finish the
       thing, it moves it on to Friday. Saying so on the button itself puts the
       mark where the consequence is, and the tick replaces it the moment it is
       pressed. */
    const checkMark = () => (t.repeat
      ? html`${icon("check")}<span class="check-repeat">${icon("repeat")}</span>`
      : icon("check"));

    /* Short enough to live under a 26px circle: the ↻ there already says 「くり
       返し」, so the words only have to say *which* — 火・金, 第2火, 毎日. And
       not at all when the shelf overhead is already saying it. */
    const every = (!closed && t.repeat && !(shelf && shelf.part && shelf.part === t.part))
      ? repeatShort(t) : "";

    /* Whatever is left goes beside the title, on the same line, so the row
       does not grow a second one: the day (where the shelf is vaguer than the
       row), 「しまった」, the memo, and the archive's stamp. */
    /* The day goes last, hard against the star. The line is right-aligned and
       clipped from the left when it will not fit, so whatever is first is what
       gets cut — and a half-eaten date reads as a different date (「8/26」
       clipped to 「6」 is a lie you cannot see). A clipped memo is only a
       shorter memo, so the memo takes the squeeze. */
    const meta = [];
    if (t.memo) meta.push(html`<span class="item-memo">${t.memo}</span>`);
    if (t.archived && !t.done) meta.push(html`<span class="todo-tag">しまった</span>`);
    if (closed && when) meta.push(html`<span class="item-when">${KN.util.formatStamp(when)}</span>`);
    else if (t.due && !sameDay) {
      meta.push(html`<span class="item-when ${late ? "is-late" : ""}">${formatDay(t.due)}</span>`);
    }

    const wrap = node(html`
      <article class="item-wrap todo-wrap ${tiles ? "is-tile-wrap" : ""}"
               data-todo-id="${t.id}" style="--cat:${colorOf(t, groups)}">
        <div class="swipe-yes">
          ${icon("calendar")}<span>今日にする</span>
        </div>
        <div class="swipe-arch">
          <span>アーカイブ</span>${icon("download")}
        </div>
      </article>
    `);

    /* Tiles put the same three facts in a square: what it is, when it is, and
       whether it is done. No memo — a third of a screen wide has no room for a
       sentence, and the row's own sheet has the whole of it. */
    const row = tiles ? node(html`
      <div class="item todo is-tile ${closed ? "is-checked" : ""}">
        <button class="check ${t.repeat ? "is-repeat" : ""}" role="checkbox"
                aria-checked="${String(!!t.done)}"
                aria-label="${t.title} を終わりにする">${checkMark()}</button>
        <button class="fav ${t.flagged ? "is-on" : ""}" aria-pressed="${String(!!t.flagged)}"
                aria-label="${t.title} に★を付ける">${icon("star")}</button>
        <button class="item-body">
          ${todoMark(t)}
          <span class="item-name">${t.title}</span>
          <span class="tile-when">${closed ? KN.util.formatStamp(when)
            : (t.due
                ? formatDay(t.due) + (at ? " " + at : "")
                : "いつか")}</span>
          ${t.repeat ? html`<span class="tile-repeat">${repeatText(t)}</span>` : ""}
        </button>
      </div>
    `) : node(html`
      <div class="item todo ${closed ? "is-checked" : ""}">
        ${/* The circle, with its own two shelves. What a row says about *when*
              — 19:30 above, 毎週火・金 below — stacks around the button rather
              than under the title, so the title keeps the middle of the row to
              itself and the row stays one line tall. */""}
        <span class="todo-lead">
          ${at ? html`<span class="todo-at">${at}</span>` : ""}
          <button class="check ${t.repeat ? "is-repeat" : ""}" role="checkbox"
                  aria-checked="${String(!!t.done)}"
                  aria-label="${t.title} を終わりにする">${checkMark()}</button>
          ${every ? html`<span class="todo-every">${every}</span>` : ""}
        </span>
        ${todoMark(t)}
        <button class="item-body">
          <span class="item-name">${t.title}</span>
          ${meta.length ? html`<span class="item-meta">${meta}</span>` : ""}
        </button>
        <button class="fav ${t.flagged ? "is-on" : ""}" aria-pressed="${String(!!t.flagged)}"
                aria-label="${t.title} に★を付ける">${icon("star")}</button>
      </div>
    `);
    wrap.append(row);

    row.querySelector(".check").addEventListener("click", (e) => tick(t.id, e.currentTarget));
    row.querySelector(".fav").addEventListener("click", () => {
      store.updateTodo(t.id, { flagged: !t.flagged });
      haptic(12);
    });
    row.querySelector(".item-body").addEventListener("click", () => openSheet(t.id));

    KN.ui.swipeActions(wrap, row, {
      tiles,
      onRight: () => {
        if (closed) {
          const undo = store.archiveTodo(t.id, false);
          if (t.done) store.toggleTodo(t.id);
          haptic(12);
          KN.ui.toast(`「${t.title}」を戻しました`, { action: { label: "元に戻す", onClick: undo } });
          return;
        }
        store.updateTodo(t.id, { due: todayKey() });
        haptic(12);
        KN.ui.toast(`「${t.title}」を今日にしました`);
      },
      /* Not 削除. Something written down and then not done is still a record
         of having decided not to do it, and the date it went away is part of
         that. Deleting outright is in the row's own sheet, for the ones that
         were typed by mistake. */
      onLeft: () => {
        const undo = store.archiveTodo(t.id, true);
        haptic(14);
        KN.ui.toast(`「${t.title}」をアーカイブしました`, {
          action: { label: "元に戻す", onClick: undo },
        });
      },
    });
    return wrap;
  }

  /* A repeating todo says out loud where it went. Otherwise ticking 「ゴミ出し」
     looks like nothing happened — the row stays, because the next one is due. */
  /* いま動いている行。二度押しで二重に走らせないための札。 */
  const finishing = new Set();

  function tick(id, checkEl) {
    if (finishing.has(id)) return;
    const t = store.getTodo(id);
    const wasDone = t.done;
    const row = checkEl && checkEl.closest(".item");

    /* ---- 時間割の行は、済ませても消えません ----

       一覧の「光って、畳まれて消える」は、行が去るから成り立つ動きです。
       時間割では行がその場に残る（今日それをした、が残る）ので、別の
       見せ方が要ります。題の上を線が引かれていき、丸がひと回りして戻る
       ——線が引き終わったところで store を更新すると、本物の取り消し線に
       そのまま引き継がれます。 */
    const tl = checkEl && checkEl.closest(".tl-row");
    /* 繰り返しのものも、**同じ動き**で済ませます。ここで外していたので、
       毎朝のものだけ線も光りもなく、その場で組み直されて行が飛んでいま
       した。繰り返しは済ませると今日に記録が残り、元が翌日へ行く——行は
       その場に残るので、他と同じ見せ方でそのまま通ります。 */
    if (tl) {
      const item = tl.querySelector(".tl-item");
      const node0 = tl.querySelector(".tl-node");
      finishing.add(id);
      checkEl.setAttribute("aria-checked", String(!wasDone));
      let wait = KN.motion.ms("--m-check");
      if (wasDone) {
        KN.motion.fire("uncheck");
        item.classList.add("is-unstriking");
        node0.classList.add("is-unpop");
      } else {
        /* 線を引く時間は、**題の長さに合わせます**。短い題も長い題も同じ
           0.38秒で引くと、長いほうだけ筆が妙に速く走ります。速さのほうを
           一定にして、そのぶん時間が伸び縮みするほうが自然です。
           短すぎる／長すぎるのは止めます（0.22〜0.62秒）。 */
        const w = tl.querySelector(".item-name").getBoundingClientRect().width;
        const SPEED = 620;   // px/秒。筆の走る速さ。
        wait = Math.round(Math.min(620, Math.max(220, (w / SPEED) * 1000)));
        item.style.setProperty("--strike-ms", wait + "ms");
        KN.motion.fire("check");
        item.classList.add("is-striking");
        node0.classList.add("is-pop");
        tl.classList.add("is-flash");
        /* 火花は、押した丸からと**絵の丸からも**。押した先だけで散ると、
           片づいたのがどの用事かは、指のあるところしか言いません。 */
        KN.ui.burst(checkEl);
        KN.ui.burst(node0);
      }
      setTimeout(() => {
        finishing.delete(id);
        tl.classList.remove("is-flash");
        item.style.removeProperty("--strike-ms");
        store.toggleTodo(id);      // ここで組み直され、本物の線に変わります
      }, wait);
      return;
    }

    /* 外すときは、これまでどおりその場で。戻す動きに見せ場は要りません。 */
    if (wasDone || !row) {
      const res = store.toggleTodo(id);
      haptic(wasDone ? 12 : [16, 40, 16]);
      if (!wasDone && checkEl) KN.ui.burst(checkEl);
      if (res.repeated) sayMoved(t, res);
      return;
    }

    /* 済ませるときは、**行が光ってから**動きます。
       これまでは押した瞬間に store が変わり、その場で組み直されていたので、
       火花は散っているのに行はもう無く、何も起きていないように見えました。
       済ませたことを見せてから、消す（または次の日へ送る）順にします。 */
    finishing.add(id);
    haptic([16, 40, 16]);
    checkEl.setAttribute("aria-checked", "true");   // 指にはすぐ応える
    KN.ui.burst(checkEl);

    /* 繰り返しは消えません。次の設定日へ移るので、そちらへ**滑って**いきます
       ——同じ行がその場で消えると「終わった」に見え、実際には明日また出る
       ことが伝わりません。 */
    const repeating = !!t.repeat;
    /* 光の色は、その行が着ている棚の色（期限の近さの色）。行そのものが
       持っている --cat をそのまま借ります。 */
    row.classList.add("is-glow");

    setTimeout(() => {
      row.classList.add(repeating ? "is-sliding" : "is-finishing");
      setTimeout(() => {
        finishing.delete(id);
        const res = store.toggleTodo(id);      // ここで初めて組み直されます
        if (res.repeated) sayMoved(t, res);
      }, repeating ? 300 : 240);
    }, 260);
  }

  /** 「やった記録」を取り消します。記録を消して、繰り返しを今日へ戻します。 */
  function untrace(t) {
    const undo = store.undoTrace(t.id);
    if (!undo) return;
    KN.motion.fire("uncheck");
    KN.ui.toast(`「${t.title}」を、済ませていないことにしました`, {
      action: { label: "元に戻す", onClick: undo },
    });
  }

  function sayMoved(t, res) {
    KN.ui.toast(`「${t.title}」は次は ${formatDay(res.due)}`, {
      action: { label: "元に戻す", onClick: res.undo },
    });
  }


  /* ---------------- render ---------------- */

  /* No count under the title. 「残り7件」 is a fact about the app rather than
     about the day, and the number that matters — what is wanted now — is
     already on the tab, on the icon, and beside every heading below. */
  function render() {
    KN.ui.paintLayoutButton(els.layout);
    renderBody();
  }

  let groups = [];

  function renderBody() {
    /* 書き替えても、読んでいた場所は動かしません。中身を空にすると
       スクロールは0へ落ちるので、組み直したあとに返します——一件
       片づけるたびにいちばん上へ飛ぶのは、片づけの邪魔でしかない。 */
    const keepTop = root ? root.scrollTop : 0;
    els.body.innerHTML = "";
    const tiles = KN.ui.isTiles();
    groups = buildGroups();
    const all = store.sortedTodos();
    const q = query;
    const hit = (t) => !q
      || KN.util.foldKana(t.title).includes(q)
      || KN.util.foldKana(t.memo || "").includes(q);

    const shown = all.filter(hit);
    const open = shown.filter((t) => !t.done && !t.archived);
    /* 「やった記録」（繰り返しを済ませたときの写し）は、棚に入れません。
       棚は「やらずに片づけたもの」の置き場で、性格が違います。記録は
       その日の時間割の中にだけ残ります。 */
    const closed = shown.filter((t) => (t.done || t.archived) && !t.trace);

    /* The month, above everything. The shelves below are a calendar unrolled
       downwards, which answers 「次に何をするか」 well and 「今月どのあたりに
       いるのか」 not at all — 8月17日 four screens down is a date without a
       shape. Left out while searching: a filtered list is not a month. */
    els.cal = null;
    if (!query) {
      els.cal = monthCalendar(store.openTodos());
      if (root && root.scrollTop > 4) els.cal.classList.add("is-stuck");
      els.body.append(els.cal);
    }

    if (!all.length) {
      els.body.append(node(html`
        <div class="empty">
          <div class="empty-art">${KN.util.raw(KN.emptyArt.donePad)}</div>
          <h2 class="empty-title">やることはありません</h2>
          <p class="empty-text">
            下の＋から追加できます。日付を決めておくと、その日が来たときに
            アプリのアイコンに数が出ます。
          </p>
        </div>
      `));
      restoreTop(keepTop);
      return;
    }

    if (!shown.length) {
      els.body.append(node(html`
        <p style="text-align:center;color:var(--c-text-3);padding:40px 16px">
          見つかりませんでした
        </p>
      `));
      restoreTop(keepTop);
      return;
    }

    const rowsOf = (id) => open.filter((t) => groupIdOf(t, groups) === id);

    /* 期限切れ and 「もっと先」 are the two that only appear when they have
       something in them: one is a problem rather than a place, and the other is
       an overflow rather than a shelf. */
    const late = groups.find((g) => g.late);
    if (rowsOf("late").length) els.body.append(groupSection(late, rowsOf("late"), tiles));

    els.body.append(todayPanel(rowsOf, tiles));

    groups.filter((g) => !g.late && !g.today).forEach((g) => {
      const rows = rowsOf(g.id);
      if (!rows.length && g.onlyWhenFull) return;
      els.body.append(groupSection(g, rows, tiles));
    });

    if (closed.length) els.body.append(archiveSection(closed, tiles));
    restoreTop(keepTop);
  }

  /** 組み直したあとに、読んでいた場所へ戻します。 */
  function restoreTop(top) {
    /* 描き直したら、いま見ている日を数え直します。位置を戻さないとき
       （いちばん上にいるとき）も要ります——開いた直後にスクロールが
       起きないと、印がどこにも付かないままになるので。 */
    followScroll();
    if (!root || !top) return;
    restoring = true;
    root.scrollTop = Math.min(top, Math.max(0, root.scrollHeight - root.clientHeight));
    // 戻したことが「その人が動いた」と読まれないよう、ひと呼吸だけ伏せます。
    setTimeout(() => { restoring = false; }, 60);
  }

  function head(g, count) {
    return node(html`
      <h2 class="todo-head ${g.late ? "is-late" : ""} ${count ? "" : "is-empty"}" style="--cat:${g.color}">
        <span class="todo-head-dot"></span>
        <span>${g.label}</span>
        ${count ? html`<span class="cat-head-count">${count}</span>` : ""}
      </h2>
    `);
  }

  /* ---------------- この月 ----------------

     The shelves below are a calendar unrolled downwards: excellent at 「次は
     何か」, useless at 「今月のどのあたりにいるのか」. A month is a shape —
     which week today falls in, how much of it is left, where the busy days
     sit — and a shape is the one thing a list cannot draw.

     Today is circled, and the months turn — 「来月の第2週」 is a thing the
     shelves name but cannot show you the shape of. Which month is on screen is
     kept between renders, so ticking something off does not snap you back to
     August while you are looking at October. */

  let calMonth = null;    // {year, month}, or null for 「this one」

  /**
   * どの月の棚か。「YYYY-MM」、決められないものは空。
   * 期限切れ・いつか・もっと先は、どの月のものでもありません——そこを通っても
   * 上のカレンダーは動かないほうがいい（月の無いものを見ているあいだに
   * 勝手に月が変わるのは、ただの誤作動に見えます）。
   */
  function monthKeyOf(g) {
    if (!g) return "";
    const U = KN.util;
    if (g.year != null && g.month != null) return `${g.year}-${String(g.month + 1).padStart(2, "0")}`;
    const day = g.day || g.from;
    if (!day) return "";
    const d = U.dayDate(day);
    return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
  }

  /** Which shelf a bare date belongs to — the same reading groupIdOf does. */
  function groupIdOfDay(day) {
    const n = daysUntil(day);
    if (n < 0) return "late";
    if (n === 0) return "today";
    if (n <= 7) return "d" + n;
    const week = groups.find((g) => g.from && g.to && day >= g.from && day <= g.to);
    if (week) return week.id;
    const d = KN.util.dayDate(day);
    const month = groups.find((g) => g.year === d.getFullYear() && g.month === d.getMonth());
    return month ? month.id : "far";
  }

  const dayColor = (day) => {
    const g = groups.find((x) => x.id === groupIdOfDay(day));
    return (g && g.color) || NONE_COLOR;
  };

  /**
   * Go to a date's shelf, and say which rows were meant.
   *
   * The shelf a date lands on is often wider than the date — a week, a month,
   * 「もっと先」 — so arriving leaves you looking at a list and guessing which
   * line you asked for. The rows for that exact day light up once: long enough
   * to find, short enough not to be a state anyone has to dismiss.
   */
  /** 上に貼りついているもの（バーと、いまはカレンダー）の厚み。 */
  function chromeInset() {
    const bar = root.querySelector(".topbar");
    let h = bar ? bar.getBoundingClientRect().height : 0;
    // 貼りついている（＝すでに上にいる）カレンダーのぶんだけ、さらに下げます。
    if (els.cal && els.cal.classList.contains("is-stuck")) {
      h += els.cal.getBoundingClientRect().height;
    }
    return h;
  }

  function scrollToSection(target) {
    /* Scrolled by hand rather than with scrollIntoView. That asks *every*
       ancestor to bring the row into view, the document included — and the
       document's one spare pixel is what the status-bar tap listens on, so
       revealing a row here would read as 「上へ戻れ」 and do the opposite
       (app.js). Setting the screen's own scrollTop leaves the document alone. */
    const top = root.scrollTop
      + target.getBoundingClientRect().top - root.getBoundingClientRect().top - chromeInset();
    KN.app.glideTo(root, Math.max(0, top));
  }

  /**
   * その月の、いちばん上の棚まで。
   * **その月の棚が無ければ、動かしません。** 近くの棚で代用すると、
   * 見たかった月とは関係のない場所へ運んだうえ、そこの月がカレンダーに
   * 跳ね返ってきて、めくったことが取り消されます。
   */
  function scrollToMonth(year, month) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const target = [...els.body.querySelectorAll("[data-month]")]
      .find((x) => x.getAttribute("data-month") === key);
    if (target) scrollToSection(target);
  }

  function jumpToDay(day) {
    const target = els.body.querySelector(`.todo-group[data-group="${groupIdOfDay(day)}"]`)
      || els.body.querySelector(".trip.todo-today");
    /* Scrolled by hand rather than with scrollIntoView. That asks *every*
       ancestor to bring the row into view, the document included — and the
       document's one spare pixel is what the status-bar tap listens on, so
       revealing a row here would read as 「上へ戻れ」 and do the opposite
       (app.js). Setting the screen's own scrollTop leaves the document alone. */
    if (target) scrollToSection(target);

    const ids = new Set(store.openTodos().filter((t) => t.due === day).map((t) => t.id));
    if (!ids.size) return;
    // After the scroll, or the flash is spent on rows nobody is looking at yet.
    setTimeout(() => {
      els.body.querySelectorAll(".item-wrap").forEach((w) => {
        if (!ids.has(w.dataset.todoId)) return;
        w.classList.remove("is-flash");
        void w.offsetWidth;            // restart the animation on a second tap
        w.classList.add("is-flash");
        setTimeout(() => w.classList.remove("is-flash"), 1500);
      });
    }, 320);
  }

  /* Flicked sideways, the month turns.

     The arrows stay — they are what says it can be done — but a month grid is
     a page, and a page is turned by pushing it. The grid follows the finger so
     the gesture is answered while it is happening rather than only at the end,
     and a push that stops short slides back to where it was, which is how you
     find out that half a push is not enough without having to undo anything.

     Vertical wins ties: the whole screen scrolls under this, and a calendar
     that swallowed a downward flick would be a calendar you had to scroll
     around. The direction is decided once, on the first few pixels, and holds
     for the rest of the gesture. */
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
      // The arrows and 「今日へ」 are buttons; let them be pressed.
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
      // Past the threshold it stiffens: the page is already committed, and the
      // remaining travel is only the finger carrying on.
      dx = Math.abs(mx) <= THRESHOLD ? mx : Math.sign(mx) * (THRESHOLD + (Math.abs(mx) - THRESHOLD) * .3);
      if (!frame) frame = requestAnimationFrame(paint);
    });

    const end = (e) => {
      if (e.pointerId !== id) return;
      const moved = dx;
      id = null; axis = null;
      if (Math.abs(moved) < THRESHOLD) { reset(); return; }
      // Pushed left, the next month comes in from the right.
      grid.style.transition = "";
      dx = 0;
      paint();
      goTo(moved < 0 ? 1 : -1);
    };
    sec.addEventListener("pointerup", end);
    sec.addEventListener("pointercancel", (e) => { if (e.pointerId === id) { id = null; axis = null; reset(); } });
  }

  /* 骨組みは一度だけ作り、月が変わったら中身だけ描き直します。

     節そのものを作り直さないのは、これが position:sticky の要素だから
     です。貼りついている節を差し替えると、ブラウザはスクロールの
     つなぎ目を取り直そうとして文書のほうを1pxだけ動かします——そして
     その1pxは、ノッチのタップを聞くために置いてある1pxです（app.js）。
     つまり月をめくるたびに「上へ戻れ」と言ったことになり、画面が
     いちばん上まで飛びます。中身だけ入れ替えれば、節は動きません。 */
  function monthCalendar(open) {
    const U = KN.util;
    const sec = node(html`
      <section class="cal">
        <h2 class="cal-head">
          <span class="cal-month"></span>
          <span class="cal-year"></span>
          <button type="button" class="cal-now js-now" hidden>今日へ</button>
          <span class="cal-nav">
            <button type="button" class="cal-more js-calmore" aria-expanded="false"></button>
            <button type="button" class="cal-arrow js-prev" aria-label="前へ">${icon("chevron")}</button>
            <button type="button" class="cal-arrow js-next" aria-label="次へ">${icon("chevron")}</button>
          </span>
        </h2>
        <div class="cal-grid"></div>
      </section>
    `);
    const grid = sec.querySelector(".cal-grid");

    /* 月を変えたら、下のリストもその月の頭へ運びます。上だけが動くと、
       カレンダーと棚が別々のものを指したまま並ぶことになります。
       週だけ出しているときは、刻みも週です（月ごと飛ぶと、押した先に
       自分の週が無くなります）。 */
    const goTo = (delta) => {
      haptic();
      if (!calOpen()) {
        const next = KN.util.shiftDay(hereDay || todayKey(), delta * 7);
        const d = KN.util.dayDate(next);
        setCalMonth(d.getFullYear(), d.getMonth(), true);
        markDay(next, true);
        jumpToDay(next);
        return;
      }
      const m = shownMonth();
      const d = new Date(m.year, m.month + delta, 1);
      setCalMonth(d.getFullYear(), d.getMonth(), true);
      scrollToMonth(d.getFullYear(), d.getMonth());
    };
    sec.querySelector(".js-calmore").addEventListener("click", () => {
      haptic();
      store.setCalPref("todo", { open: !calOpen() });
    });
    sec.querySelector(".js-prev").addEventListener("click", () => goTo(-1));
    sec.querySelector(".js-next").addEventListener("click", () => goTo(1));
    sec.querySelector(".js-now").addEventListener("click", () => {
      const now = U.dayDate(todayKey());
      haptic();
      setCalMonth(now.getFullYear(), now.getMonth(), true);
      scrollToMonth(now.getFullYear(), now.getMonth());
    });

    wireMonthSwipe(sec, grid, goTo);
    fillCalendar(sec, open);
    return sec;
  }

  /** その月の顔を描く。節と grid の要素はそのまま使い回します。 */
  /* 隣の月のマス。週が月をまたぐときだけ表に出ます（月で見ているあいだは
     CSS が伏せます）。押せばその日へ行けるので、月末の週から翌月の頭へ
     そのまま進めます。中身は日付だけ——粒（件数）はその月のぶんしか
     数えていないので、出すと嘘になります。 */
  function outCell(key) {
    const U = KN.util;
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
    cell.addEventListener("click", () => { markDay(key, true); jumpToDay(key); haptic(); });
    return cell;
  }

  function fillCalendar(sec, open) {
    if (!sec) return;
    const U = KN.util;
    const today = todayKey();
    const now = U.dayDate(today);
    const { year, month } = shownMonth();
    const thisMonth = year === now.getFullYear() && month === now.getMonth();
    const total = new Date(year, month + 1, 0).getDate();
    const lead = new Date(year, month, 1).getDay();

    /* How many are wanted on each day. Dots rather than numerals: at a glance
       it is 「その週は詰まっている」 that reads, not 「3件」.

       Repeats are left out. 「ゴミ出し」 every Tuesday and Friday would put a
       dot on nine days of the month, which is true and useless — the dots are
       for spotting the days that are unlike the others, and a thing that
       happens every week is exactly what all the days have in common. */
    const load = new Map();
    (open || []).forEach((t) => {
      if (!t.due || t.repeat) return;
      load.set(t.due, (load.get(t.due) || 0) + 1);
    });

    sec.setAttribute("aria-label", `${year}年${month + 1}月`);
    sec.querySelector(".cal-month").textContent = `${month + 1}月`;
    sec.querySelector(".cal-year").textContent = String(year);
    sec.querySelector(".js-now").hidden = thisMonth;

    const grid = sec.querySelector(".cal-grid");
    grid.innerHTML = "";

    U.WEEKDAYS.forEach((w, i) => grid.append(node(html`
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
      const n = load.get(key) || 0;
      const isToday = key === today;
      const cell = node(html`
        <button class="cal-day ${isToday ? "is-today" : ""} ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
                data-day="${key}" ${isToday ? KN.util.raw('aria-current="date"') : ""}
                aria-label="${month + 1}月${d}日${isToday ? "（今日）" : ""}${n ? ` やること${n}件` : ""}">
          <span class="cal-n">${String(d)}</span>
          <span class="cal-dots" style="--cat:${dayColor(key)}"></span>
        </button>
      `);
      const dots = cell.querySelector(".cal-dots");
      for (let i = 0; i < Math.min(n, 3); i++) dots.append(node(html`<i class="cal-dot"></i>`));
      /* Tapping a date goes to that date's shelf. Otherwise the month is a
         picture of somewhere you cannot get to — 8月17日 is visible up here
         and four screens down there, with nothing joining them. */
      /* 押した日には、その場で輪を移します。棚まで運んでから followScroll に
         数え直させると、その日に棚が無ければ（やることの無い日は棚が出ない）
         輪はどこにも移らず、押しても何も起きないように見えます。
         押した日を見ている——それがいちばん確かなことなので、先に言います。 */
      cell.addEventListener("click", () => { markDay(key, true); jumpToDay(key); haptic(); });
      grid.append(cell);
    }
    outer.trail.forEach((key) => grid.append(outCell(key)));
    // 隠すぶんを先に決めます——輪は並んだ位置から測るので、隠したあとで。
    markWeek(sec, hereDay || today);
    // 描き直したぶん、いま見ている日の印は消えています。付け直します
    // （枠ごと入れ替わったので、輪は滑らせずに置きます）。
    paintHere(true);
  }

  function groupSection(g, rows, tiles) {
    const section = node(html`
      <section class="cat-group todo-group ${rows.length ? "" : "is-empty"}"
               data-group="${g.id}" data-month="${monthKeyOf(g)}"
               data-day="${g.day || g.from || ""}"></section>
    `);
    section.append(head(g, rows.length));
    /* 今日の枠と同じ理由で、済ませたものだけの日も出します。 */
    const asTl = !tiles && timelineOn() && g.day;
    const doneThatDay = asTl
      ? store.get().todos.filter((t) => (t.done || t.archived) && t.due === g.day)
      : [];
    if (rows.length || doneThatDay.length) {
      /* 翌日以降も、今日と同じ顔にします。今日だけ時間割で明日からただの
         一覧だと、同じ「やること」が二つの読み方を持つことになり、下へ
         送った用事がどこへ行ったのか読み替えが要ります。

         一日ぶんの棚（g.day を持つもの）だけです。「来週」「もっと先」は
         何日かの寄せ集めなので、一本の時間軸は引けません。 */
      if (asTl) {
        section.classList.add("is-tl");
        section.append(timeline(rows, g));
      } else {
        const box = node(html`<div class="item-list js-rows ${tiles ? "is-tiles" : ""}"></div>`);
        rows.forEach((t) => box.append(todoRow(t, tiles, groups, g)));
        section.append(box);
        if (!tiles) wireReorder(box, g);
      }
    }
    return section;
  }

  /* 今日 gets the panel 今回買うもの has on the shopping list: the rows sit
     *inside* something rather than under a heading that scrolls away.

     Inside, the day runs top to bottom the way it is lived: 毎朝 first, then
     whatever is for today without being for any particular part of it, then
     朝・午後・夜, then 毎晩. The two ends are only drawn when something is
     standing in them — an empty 「毎朝」 line every morning is a shelf for a
     routine nobody has. */
  function todayPanel(rowsOf, tiles) {
    const panel = node(html`<section class="trip todo-today"></section>`);
    const plain = groups.find((g) => g.id === "today");
    const rows = rowsOf("today");

    const top = node(html`
      <section class="todo-group todo-today-any ${rows.length ? "" : "is-empty"}"
               data-group="today" data-month="${monthKeyOf(plain)}"
               data-day="${plain ? plain.day : ""}"></section>
    `);
    top.append(head(plain, rows.length));
    /* 時間割は、済ませたものも並べます。なので**残りが0でも出します**
       ——ここは一度こわしました。残りの数だけで出すかどうかを決めていたので、
       今日ぶんを全部片づけた瞬間に、その日の記録ごと画面から消えました。
       「今日これをやった」は、残りが無くなってからこそ見たいものです。 */
    const asTimeline = !tiles && timelineOn();
    const doneToday = asTimeline && plain && plain.day
      ? store.get().todos.filter((t) => (t.done || t.archived) && t.due === plain.day)
      : [];
    if (rows.length || doneToday.length) {
      /* 今日だけは、一覧ではなく**時間割**で出せます。一覧は「何が残って
         いるか」しか言いませんが、時間割は「どう配ると収まるか」を言います
         ——同じ5件でも、読み取れることが違います。
         タイルを選んでいる人には出しません（正方形に時間軸は引けないので）。 */
      if (asTimeline) {
        /* 時間割のときは、今日の枠の地の色を外します（下の CSS）。
           一本の線と時刻でもう十分に「今日」と言えているので、そこへ
           色の面まで重ねると、色の言っていることが薄まります。 */
        panel.classList.add("is-tl");
        top.append(timeline(rows, plain));
      } else {
        const box = node(html`<div class="item-list js-rows ${tiles ? "is-tiles" : ""}"></div>`);
        rows.forEach((t) => box.append(todoRow(t, tiles, groups, plain)));
        top.append(box);
        if (!tiles) wireReorder(box, plain);
      }
    } else {
      top.append(node(html`<p class="todo-today-empty">今日のぶんはありません</p>`));
    }
    panel.append(top);
    return panel;
  }

  /* ---------------- 今日の時間割 ----------------

     一本の線に沿って、今日が上から下へ流れます。左に時刻、線の上に丸い
     アイコン、右に用事。用事と用事のあいだが空いていれば、空いていると
     書きます——埋めません。**空きが見えること**が、配り直すための材料です。

     評価はしません。遅れていても赤くしませんし、「予定通り」も「達成率」も
     出しません。出すのは「いま何時か」と「何が残っているか」だけ。現実の
     生活は崩れるものだ、というのがこの画面の前提なので。

     組み立てそのものは js/plan.js が持ちます。ここは描くだけです。 */

  const timelineOn = () => store.get().settings.todoTimeline !== false;

  function timeline(rows, shelf) {
    const P = KN.plan;
    const s = store.get().settings;
    const nowMin = P.toMin(KN.util.nowTime());
    const isToday = !shelf || !shelf.day || shelf.day === todayKey();
    /* 今日を見ているときだけ「いま」を渡します。渡すと、まだ済んでいない
       時刻なしのものが**いまから先**に並びます——15時に開いて残りの用事が
       7時に並んでいても、配り直す役には立たないので。 */
    /* 済ませたものも線の上に残します。**今日それをした**ことが見えるのは、
       残りが何かと同じくらい大事なので（消すと、朝からの半日が空白に
       なります）。組み立て側は、済んだものが「これからの時間」を食べない
       ようにしています（plan.js の doneOf）。 */
    const day = shelf && shelf.day ? shelf.day : todayKey();
    const done = store.get().todos.filter((t) => (t.done || t.archived) && t.due === day);
    const plan = P.buildDay(day, rows.concat(done), {
      start: s.dayStart, end: s.dayEnd, now: isToday ? KN.util.nowTime() : null,
    });
    const sec = node(html`
      <div class="tl">
        ${/* 「このあと空き◯分」は出しません。時間割そのものが、時刻の
              並びと帯の隙間で同じことを言っています。文で重ねて言うのは
              説明のしすぎです。

              超過（はみ出し）だけは残します——これは「読めば分かる」では
              なく、**詰め込みすぎている**という注意なので、他の事実とは
              性格が違います。 */""}
        ${plan.over
          ? html`<div class="tl-sum">
              <span class="tl-over">${P.humanSpan(plan.over)} はみ出しています</span>
            </div>` : ""}
        <ol class="tl-list js-tl"></ol>
      </div>
    `);
    const list = sec.querySelector(".js-tl");

    /* 用事と空きを、時刻の順に一本へ混ぜます。 */
    const parts = []
      .concat(plan.items.map((it) => ({ kind: "item", at: it.atMin, it })))
      .concat(plan.free.map((f) => ({ kind: "free", at: f.atMin, f })))
      .sort((a, b) => a.at - b.at);

    let nowPlaced = false;
    /* 直前の行が、左の列にどの時刻を書いたか。空きの目盛りは、それと同じ
       時刻を二度書かないためにこれを見ます（用事が10時に終わって空きが
       10時に始まるとき、10:00 を上下に並べても何も言っていません）。 */
    let shownMin = null;
    parts.forEach((part, i) => {
      /* 「いま」の線は、その時刻をまたぐところに一度だけ。今日以外の日を
         見ているときは出しません（きのうの「いま」は意味を成さないので）。 */
      /* ちょうど「いま」から始まるものは、線の**下**に来ます（これから
         やることなので）。> だと同時刻のものが線の上に残っていました。 */
      if (isToday && !nowPlaced && nowMin != null && part.at >= nowMin) {
        list.append(nowRow(nowMin));
        nowPlaced = true;
        shownMin = nowMin;
      }
      if (part.kind === "free") {
        list.append(freeRow(part.f, isToday ? nowMin : null, shownMin));
        shownMin = part.f.untilMin;
        return;
      }
      const next = parts[i + 1];
      list.append(itemRow(part.it, !!next && next.kind === "item"));
      shownMin = part.it.atMin;
    });
    if (isToday && !nowPlaced && nowMin != null && nowMin <= plan.endMin) {
      list.append(nowRow(nowMin));
    }

    wireDrag(list, day);
    return sec;
  }

  /* ---------------- つまんで、置きなおす ----------------

     長押しで一件が持ち上がり、指について動きます。落とせる先は二種類です。

       ① **用事と用事のあいだ** … その順番に入ります。時刻を持っていた
          ものは、時刻を手放します——「ここでやる」と順番で言い直したので、
          時計に縛られたままだと二つの指示が食い違います。以後の用事は、
          その用事の長さぶんだけ後ろへずれます（組み立てが勝手にやります）。

       ② **空いている時間の中** … 空きの行が、その空きぶんに広がって、
          15分ごとの置き場が現れます。時間帯のどこに置くかまで選べる。
          ここへ落とすと時刻を持ちます（「その時間にやる」と言ったので）。

     置きなおす先が「順番」と「時刻」の二つある、というのがこの画面の
     肝です。片方だけだと、決めたいことの半分しか言えません。 */

  const DRAG_HOLD = 380;   // これだけ押さえたら持ち上がる
  const DRAG_SLOP = 8;     // その前にこれ以上動いたら、ただのスクロール
  const SLOT_MIN = 15;     // 帯の中は15分きざみで止まります

  /** 空きが広がる高さ。長い空きほど高く、ただし画面を覆わない程度に。

      分をそのまま画素にすると、昼の5時間があいている日は帯だけで
      300画素になり、前後の用事が視界から消えます。かといって全部同じ
      高さにすると、10分の空きと3時間の空きが同じ顔になります。 */
  function bandHeight(minutes) {
    return Math.round(Math.min(220, Math.max(64, 40 + minutes * 0.42)));
  }

  /* 一覧のドラッグ（下の reorder まわり）にも同じ名前の札があるので、
     こちらは時間割のものだと分かる名前にします。 */
  let tlDrag = null;

  /* どの用事の手順を、いま開いて見ているか。組み直しをまたいで覚えて
     おきます——手順を一つ押すたびに畳まれては、続けて押せません。 */
  const openSubs = new Set();

  function wireDrag(list, day) {
    list.addEventListener("pointerdown", (e) => {
      if (tlDrag) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      /* 掴めないのは**印だけ**です。前はここで button 全部を外していま
         したが、行の本文（題や事実の乗っているところ）自体が button なので、
         行を掴む道がどこにも無くなっていました。掴んで欲しくないのは、
         押したら別のことが起きる小さな丸——それだけ。 */
      if (e.target.closest(".check, .fav")) return;
      const row = e.target.closest(".tl-row");
      if (!row || row.classList.contains("is-done")) return;

      const id = row.dataset.todoId;
      const x0 = e.clientX, y0 = e.clientY, pid = e.pointerId;
      let timer = setTimeout(() => { timer = null; lift(row, id, list, day, y0); }, DRAG_HOLD);

      const cancel = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        list.removeEventListener("pointermove", moved);
        list.removeEventListener("pointerup", cancel);
        list.removeEventListener("pointercancel", cancel);
      };
      const moved = (ev) => {
        if (ev.pointerId !== pid || !timer) return;
        if (Math.abs(ev.clientX - x0) > DRAG_SLOP || Math.abs(ev.clientY - y0) > DRAG_SLOP) cancel();
      };
      list.addEventListener("pointermove", moved);
      list.addEventListener("pointerup", cancel);
      list.addEventListener("pointercancel", cancel);
    });
  }

  /** 持ち上げる。空きの行を開いて、置き場を見せます。 */
  function lift(row, id, list, day, y0) {
    const t = store.getTodo(id);
    if (!t) return;
    const len = t.minutes || KN.plan.DEFAULT_MINUTES;

    tlDrag = { id, row, list, day, len, target: null };
    KN.motion.fire("reorder");
    row.classList.add("is-lifted");
    list.classList.add("is-dragging");
    /* 持ち上がるまでの0.38秒で、もう選ばれていることがあります。 */
    try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch (_) { }

    /* 運び終えた指は、離したところで click も起こします。本文は押すと
       詳細が開くので、そのままだと**置きなおすたびに詳細が開いて**
       いました。この一回だけ、止めます。 */
    const eatClick = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    list.addEventListener("click", eatClick, { capture: true, once: true });
    tlDrag.eatClick = eatClick;

    /* 空きの行が、その空きぶんに**上下へ広がります**。**その空きに入る
       ものだけ**——入らないところが開いても、置けないので。

       広がった帯の中は、時間そのものです。上端がその空きの始まり、下端が
       終わり。指を上下すれば、その高さのぶんだけ時刻が動きます。前はここに
       15分きざみの札を敷き詰めていましたが、昼の空きひとつで札が60枚
       出て、時間帯を選ぶというより数字の壁を読む作業になっていました。
       帯なら、長い空きは長く見えます——空きの**量**も同時に読めます。 */
    /* 開くと、そのぶん下がぜんぶ押し下がります。掴んでいる行が指の下から
       逃げると、狙ったところに置けません——**掴んだ行が動かないように**、
       広がった量だけ画面のほうをずらします。上で開いたぶんだけ、下へ。 */
    const before = row.getBoundingClientRect().top;
    list.querySelectorAll(".tl-free-row").forEach((fr) => {
      const from = Number(fr.dataset.at), until = Number(fr.dataset.until);
      if (!isFinite(from) || !isFinite(until) || until - from < len) return;
      fr.classList.add("is-open");
      fr.style.setProperty("--band-h", bandHeight(until - from) + "px");
      fr.append(node(html`
        <span class="tl-band">
          <span class="tl-band-line"><span class="tl-band-time"></span></span>
        </span>
      `));
    });
    const scroller = list.closest(".screen") || document.scrollingElement;
    if (scroller) {
      const shift = Math.round(row.getBoundingClientRect().top - before);
      if (shift) scroller.scrollTop += shift;
    }

    const move = (ev) => {
      if (!tlDrag) return;
      aim(ev.clientX, ev.clientY);
    };
    /* 運んでいるあいだ、画面のほうは動かしません。

       **これは pointermove では止まりません。** そちらで preventDefault
       しても、指で画面を送るのを止めるのは touchmove のほうです。止め
       そこねるとブラウザが画面を送りはじめ、そのとき指の追跡ごと取り
       上げられます（pointercancel）——指はまだ触れているのに、運ぶのが
       終わる。touch-action: none は持ち上げたあとに付けているので、
       すでに始まっている指の動きには効きません。ここで押さえます。 */
    const hold = (ev) => { if (tlDrag) ev.preventDefault(); };
    const off = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("touchmove", hold);
      document.removeEventListener("pointerup", done);
      document.removeEventListener("pointercancel", give);
    };
    const done = () => { off(); drop(true); };
    /* 取り上げられたときは、**置きません**。指を離していないのだから、
       まだどこへ置くとも言っていません。 */
    const give = () => { off(); drop(false); };
    document.addEventListener("pointermove", move);
    document.addEventListener("touchmove", hold, { passive: false });
    document.addEventListener("pointerup", done);
    document.addEventListener("pointercancel", give);
    aim(row.getBoundingClientRect().left + 20, y0);
  }

  /** いま指の下にあるのは、どの置き場か。 */
  function aim(x, y) {
    const d = tlDrag;
    if (!d) return;
    d.list.querySelectorAll(".is-aim").forEach((el) => el.classList.remove("is-aim"));

    /* 開いた帯の中にいるなら、指の高さがそのまま時刻です。 */
    for (const fr of d.list.querySelectorAll(".tl-free-row.is-open")) {
      const band = fr.querySelector(".tl-band");
      if (!band) continue;
      const b = band.getBoundingClientRect();
      if (y < b.top || y > b.bottom || b.height <= 0) continue;
      const from = Number(fr.dataset.at), until = Number(fr.dataset.until);
      /* 置けるのは「始まり」だけなので、下端は**終わり − 長さ**です。
         そうしないと帯のいちばん下を狙ったとき、はみ出す時刻を返します。 */
      const last = Math.max(from, until - d.len);
      const ratio = Math.min(1, Math.max(0, (y - b.top) / b.height));
      const at = Math.min(last, Math.max(from,
        Math.round((from + ratio * (last - from)) / SLOT_MIN) * SLOT_MIN));
      fr.classList.add("is-aim");
      const line = fr.querySelector(".tl-band-line");
      if (line) {
        const span = last - from;
        line.style.top = (span > 0 ? ((at - from) / span) * 100 : 0) + "%";
        const label = line.querySelector(".tl-band-time");
        if (label) label.textContent = KN.plan.toTime(at);
      }
      d.target = { kind: "time", at };
      return;
    }
    /* 用事と用事のあいだ。行の上半分なら前へ、下半分なら後ろへ。 */
    const rows = [...d.list.querySelectorAll(".tl-row")].filter((r) => r !== d.row);
    let before = null;
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      if (y < b.top + b.height / 2) { before = r; break; }
    }
    const anchor = before || rows[rows.length - 1] || null;
    if (!anchor) { d.target = null; return; }
    anchor.classList.add("is-aim");
    anchor.classList.toggle("is-aim-before", !!before);
    d.target = { kind: "order", id: anchor.dataset.todoId, before: !!before };
  }

  /** つまんだ手を離したところ。
   *  @param {boolean} commit 置くかどうか。指を離したなら true。
   *    ブラウザに指の追跡を取り上げられた（pointercancel）ときは false
   *    ——**離していないのだから、まだどこへ置くとも言っていません。** */
  function drop(commit) {
    const d = tlDrag;
    tlDrag = null;
    if (!d) return;
    d.row.classList.remove("is-lifted");
    d.list.classList.remove("is-dragging");
    d.list.querySelectorAll(".is-aim").forEach((el) => {
      el.classList.remove("is-aim", "is-aim-before");
    });
    /* 広げた空きは、閉じます。置いたあとに描き直される行もありますが、
       落とす先が無かったときは描き直されないので、ここで畳みます。 */
    d.list.querySelectorAll(".tl-free-row.is-open").forEach((fr) => {
      fr.classList.remove("is-open");
      fr.style.removeProperty("--band-h");
      const band = fr.querySelector(".tl-band");
      if (band) band.remove();
    });
    /* click は離した直後に来ます。来なかったぶんは、ここで片づけます
       ——置いたままだと、次にどこかを押したときに食べてしまいます。 */
    if (d.eatClick) setTimeout(() => d.list.removeEventListener("click", d.eatClick, true), 0);
    const t = store.getTodo(d.id);
    if (!commit || !d.target || !t) { render(); return; }

    if (d.target.kind === "time") {
      const at = KN.plan.toTime(d.target.at);
      const was = { time: t.time };
      store.updateTodo(d.id, { time: at, due: d.day });
      KN.motion.fire("save");
      KN.ui.toast(`「${t.title}」を ${at} に`, {
        action: { label: "元に戻す", onClick: () => store.updateTodo(d.id, was) },
      });
      return;
    }

    /* 順番で置きなおす。時刻は手放します。 */
    const ids = [...d.list.querySelectorAll(".tl-row")]
      .map((r) => r.dataset.todoId).filter((x) => x && x !== d.id);
    /* **並び全体**を控えます。この置きなおしは一件だけでなく、その日の
       並び順をまるごと書き替えるので、戻すときも同じ広さで戻さないと
       「元に戻す」が元に戻しません（動かした一件だけを戻して、まわりは
       新しい順のまま、という半端な形になっていました）。 */
    const was = { time: t.time, order: new Map() };
    store.get().todos.forEach((x) => {
      if (x.id === d.id || ids.includes(x.id)) was.order.set(x.id, x.order);
    });
    const at = ids.indexOf(d.target.id);
    ids.splice(d.target.before ? Math.max(0, at) : at + 1, 0, d.id);
    store.update((s) => {
      ids.forEach((tid, i) => {
        const row = s.todos.find((x) => x.id === tid);
        if (row) row.order = i;
      });
      const me = s.todos.find((x) => x.id === d.id);
      if (me) { me.time = null; me.due = d.day; }
    });
    KN.motion.fire("save");
    KN.ui.toast(`「${t.title}」を動かしました`, {
      action: {
        label: "元に戻す",
        onClick: () => store.update((s) => {
          was.order.forEach((ord, tid) => {
            const row = s.todos.find((x) => x.id === tid);
            if (row) row.order = ord;
          });
          const me = s.todos.find((x) => x.id === d.id);
          if (me) me.time = was.time;
        }),
      },
    });
  }

  /* 時刻の見せかた。0時台から9時台は頭の0を落とします——「05:00」の0は
     読むための情報を持っていないのに、桁を一つ余分に使って、時刻の列を
     数字の壁にしていました。「5:00」でいい。

     **見せかただけ**です。持っている時刻（HH:MM）はそのままなので、
     並べ替えも比較も、これまでどおり動きます。 */
  function tlClock(hhmm) {
    return String(hhmm || "").replace(/^0(\d:)/, "$1");
  }

  /** いま何時か。線がここで色を変えます。 */
  function nowRow(nowMin) {
    return node(html`
      <li class="tl-now">
        <span class="tl-time is-now">${tlClock(KN.plan.toTime(nowMin))}</span>
        <span class="tl-rail"><span class="tl-now-dot"></span></span>
        <span class="tl-now-line"></span>
      </li>
    `);
  }

  /** 空いているところ。埋めずに、点線の帯だけで示します。

      「10時間44分」のような長さの文は出しません——空きの前後にある用事の
      時刻を見れば、どれだけ空いているかは読めます。文で重ねて言うのは
      説明のしすぎです（帯の広さ自体は、つまんで動かすときに見えます）。 */
  /* 空きの高さ。空いている量が、そのまま縦の長さになります——ただし
     用事ほど素直には伸ばしません。夜の10時間を10時間ぶんの点線で描くと、
     一日の大半が「何も無いところ」で埋まって、肝心の用事が画面の外へ
     出ていきます。空きは詰めて、用事は正直に。 */
  const TL_FREE_MIN = 44;      // これより短くはしません（時刻の字が入る高さ）
  const TL_FREE_MAX = 200;     // 長い空きは、ここで頭打ち
  const TL_FREE_PX_PER_MIN = 0.5;
  function freeH(minutes) {
    return Math.round(Math.min(TL_FREE_MAX, Math.max(TL_FREE_MIN, minutes * TL_FREE_PX_PER_MIN)));
  }

  /* 空きの中を通る、ちょうどの時刻（1時間きざみ）。

     終わりの側は返しません——次の用事が自分の時刻をすぐ下に書くので、
     同じ数字が二つ並びます。始まりの側は返します：用事が10時に始まって
     11時に終わったとき、空きは11時から始まりますが、上の行が書いている
     のは「10:00」なので、11:00 を落とすと軸から一時間ぶん抜けます。
     直前の行が同じ時刻を書いているときだけ、その一つを飛ばします。 */
  function hourMarks(fromMin, untilMin, shownMin) {
    const out = [];
    const span = untilMin - fromMin;
    if (span <= 0) return out;
    for (let m = Math.ceil(fromMin / 60) * 60; m < untilMin; m += 60) {
      if (m === shownMin) continue;
      out.push({ at: m, pct: ((m - fromMin) / span) * 100 });
    }
    /* 1時間きざみで刻みきれないほど長い空き（一晩）では、札が15枚並んで
       壁になります。そうなったら2時間、3時間…と間引いて、10枚までに。 */
    if (out.length <= 10) return out;
    const step = Math.ceil(out.length / 10);
    return out.filter((_, i) => i % step === 0);
  }

  function freeRow(f, nowMin, shownMin) {
    const past = nowMin != null && f.untilMin <= nowMin;
    const marks = hourMarks(f.atMin, f.untilMin, shownMin);
    /* 空きの中に「ちょうどの時刻」が通るなら、左の列はそれを出します
       ——時刻の軸が1時間きざみで読めるように。通らないほど短い空きは、
       これまでどおり空きの始まりを一つだけ。 */
    return node(html`
      <li class="tl-free-row ${past ? "is-past" : ""}"
          data-at="${String(f.atMin)}" data-until="${String(f.untilMin)}"
          style="--free-h:${freeH(f.untilMin - f.atMin)}px">
        <span class="tl-time">${marks.length ? "" : tlClock(f.at)}</span>
        <span class="tl-rail is-dash"></span>
        ${marks.length ? html`
          <span class="tl-hours" aria-hidden="true">
            ${marks.map((m) => html`
              <span class="tl-hour" style="top:${m.pct.toFixed(2)}%"><i>${tlClock(KN.plan.toTime(m.at))}</i></span>
            `)}
          </span>
        ` : ""}
      </li>
    `);
  }

  /* アイコンまわりの枠の高さは、かかる時間そのものです。

     1分1pxで測ります。60分の用事は60px、120分は120px、180分は180px
     ——**高さを見比べれば、長さを見比べたことになります**。前は30分
     きざみで少しずつ足していき、6時間で頭打ちにしていました。すると
     3時間の用事と10時間の用事が同じ高さになり、枠は「長さ」ではなく
     「長めであること」しか言っていませんでした。上限は外しました。

     48pxは下限です。丸と題が入る高さで、これより詰めると読めません。
     30分以下はここに収まるので、丸のままです。そこから先は、伸びた枠の
     上端が始まりの時刻、下端が終わりの時刻になります。

     済ませた行には使いません（#30で詰めた「済んだ列はできるだけ小さく」
     という決めごとと矛盾するので）。 */
  const TL_BASE_H = 48;    // .tl-rail の基本の高さ（css/screens.css と同じ数）
  const TL_PX_PER_MIN = 1;
  function tlSpanH(minutes) {
    if (!minutes) return null;
    const h = Math.round(minutes * TL_PX_PER_MIN);
    return h > TL_BASE_H ? h : null;
  }

  /** 一つの用事。丸いアイコンが線の上に乗り、右に印を付ける丸。 */
  function itemRow(it, joined) {
    const t = it.todo;
    /* 書くのは「決めたこと」だけ。決めていない長さは出しません。 */
    const facts = [];
    /* 完了時刻・時刻あり・毎日・残り手順は、ここには出しません。

       完了時刻は、左の時刻の列がその用事の行そのものにすでに書いています
       （組み立てが完了時刻でその行を置いているので）。時刻あり・毎日は、
       行の左側（時刻の太さ）と、押す丸の繰り返しアイコンがすでに言って
       います。手順の残数は、行の下をひらけば見えます。同じことを、題の
       すぐ下でもう一度言う理由がありません。 */
    /* 買い物の一件だけは、**いま何個ぶんか**をその場で数えます。置いた
       ときの数を写しておくと、★をひとつ足した瞬間に古くなるので。 */
    if (t.shop) {
      const n = store.tripCount();
      if (n) facts.push(html`<span class="tl-shop">★${n}つ</span>`);
    }
    if (t.minutes) facts.push(html`<span class="tl-len">${KN.plan.humanSpan(it.minutes)}</span>`);
    if (it.clash) facts.push(html`<span class="tl-clash">前と重なっています</span>`);
    // 残数は文にしません。手順を持っているかどうかだけ、下の開閉に使います。
    const sc = store.subCount(t);
    const closed = t.done || t.archived;
    const span = closed ? null : tlSpanH(t.minutes);
    const li = node(html`
      <li class="tl-row ${joined ? "is-joined" : ""} ${it.clash ? "is-clash" : ""}
                 ${closed ? "is-done" : ""} ${span ? "is-long" : ""}"
          data-todo-id="${t.id}" data-flip="${t.id}"
          style="--cat:${colorOf(t, groups)}${span ? `;--tl-span:${span}px` : ""}">
        ${/* 伸びた行では、時刻もアイコンも**上端**へ寄せます。上端が
              始まりの時刻だからです。まん中に置くと、枠は10時から18時
              まで伸びているのに、札は14時のあたりに付いていることに
              なります。 */""}
        <span class="tl-time ${it.fixed ? "is-fixed" : ""}">${tlClock(it.at)}</span>
        <span class="tl-rail"><span class="tl-node">${todoMark(t)}</span></span>
        ${/* 上から、前置き・題・事実。参考にした画面と同じ順です。

              前置き（メモ）が上にあるのは、それが**題を読むための文脈**
              だからです（「忘れたくないことだから ／ 「あとで」を使ってみよう」）。
              事実（長さ・時刻あり・繰り返し）は下——題を読んだあとで
              十分なので。前は長さを題の上に置いていましたが、いちばん
              大きく読ませたいものの上に、数字が乗っていました。 */""}
        <div class="item todo tl-item ${t.done ? "is-checked" : ""}">
          <button class="tl-body" type="button">
            ${t.memo ? html`<span class="tl-cap">${t.memo}</span>` : ""}
            <span class="item-name">${t.title}</span>
            ${/* 決めていない長さは**書きません**。組み立てには30分として
                  使いますが、画面に「30分」と出すとそれが決めた数のように
                  読めますし、決めていない行にまで一段増えて、丸と題が
                  中心線からずれる原因にもなっていました。
                  facts が空になる行では、この帯ごと出しません。 */""}
            ${facts.length ? html`<span class="tl-facts">${facts}</span>` : ""}
          </button>
          ${/* 「やった記録」も押せます。**押し間違いは取り消せなければ
                いけません。** ここを飾りにしていたので、毎朝のものを
                うっかり済ませたとき、その日から外す方法がありませんでした
                （元は翌日へ行っていて、今日には印だけが残る）。
                押すと記録を消して、元を今日へ戻します。 */""}
          ${t.trace
            ? html`<button class="check is-trace" role="checkbox" aria-checked="true"
                    aria-label="${t.title} を、済ませていないことにする">${icon("check")}</button>`
            : html`<button class="check ${t.repeat ? "is-repeat" : ""}" role="checkbox"
                    aria-checked="${String(!!t.done)}"
                    aria-label="${t.title} を終わりにする">
                ${t.repeat
                  ? html`${icon("check")}<span class="check-repeat">${icon("repeat")}</span>`
                  : icon("check")}
              </button>`}
        </div>
      </li>
    `);
    li.querySelector(".tl-body").addEventListener("click", () => openSheet(t.id));
    const box = li.querySelector("button.check");
    if (box) {
      box.addEventListener("click", (e) => {
        e.stopPropagation();
        if (t.trace) { untrace(t); return; }
        tick(t.id, e.currentTarget);
      });
    }

    /* 手順は、行の下にたたんで置きます。

       **やるところで押せる**ようにするのが肝です。手順を一つ済ませる
       たびにシートを開かせると、朝のしたくのような細かい流れでは、開いて
       閉じるだけで手数が増えます。ここなら、時間割を見たまま押せます。

       たたんであるのは、手順を持つ用事が二つ三つあると、時間割が手順で
       埋まって「今日は何があるか」が読めなくなるからです。 */
    if (sc.total && !t.trace) {
      const open = openSubs.has(t.id);
      const wrap = node(html`
        <div class="tl-sub-wrap ${open ? "is-open" : ""}">
          <button type="button" class="tl-sub-toggle" aria-expanded="${String(open)}">
            ${open ? "手順をたたむ" : "手順をひらく"}
          </button>
          <ul class="tl-sub-list" ${open ? "" : KN.util.raw("hidden")}></ul>
        </div>
      `);
      const list = wrap.querySelector(".tl-sub-list");
      (t.subs || []).forEach((s) => {
        const line = node(html`
          <li class="tl-sub ${s.done ? "is-done" : ""}">
            <button type="button" class="check is-sub" role="checkbox"
                    aria-checked="${String(!!s.done)}"
                    aria-label="${s.title} を終わりにする">${icon("check")}</button>
            <span class="tl-sub-name">${s.title}</span>
          </li>
        `);
        line.querySelector("button").addEventListener("click", (e) => {
          e.stopPropagation();
          const btn = e.currentTarget;
          KN.motion.fire(s.done ? "uncheck" : "check", btn);
          if (!s.done) KN.ui.burst(btn);
          store.toggleSub(t.id, s.id);
        });
        list.append(line);
      });
      wrap.querySelector(".tl-sub-toggle").addEventListener("click", (e) => {
        e.stopPropagation();
        if (openSubs.has(t.id)) openSubs.delete(t.id); else openSubs.add(t.id);
        KN.motion.fire("select", e.currentTarget);
        render();
      });
      li.append(wrap);
    }
    return li;
  }

  /* ---------------- picking one up ----------------

     Within a group a drag reorders, exactly as it does on the shopping list.
     Across a divider it reschedules: the groups *are* the days, so carrying a
     row from 今日 down into 「8月14日 金」 is the plainest way of saying so —
     no sheet, no date field, one gesture.

     The group under the finger lights up while it is being carried, because a
     drop that silently changes a date is a drop that has to be visibly aimed. */
  function wireReorder(box, g) {
    KN.reorder.attach(box, {
      item: ".item-wrap",
      onDrop: (from, to) => {
        const ids = Array.prototype.map.call(box.children, (w) => w.dataset.todoId).filter(Boolean);
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        store.update((s) => {
          const inGroup = new Set(ids);
          const slots = [];
          s.todos.forEach((t, i) => { if (inGroup.has(t.id)) slots.push(i); });
          const byId = new Map(s.todos.map((t) => [t.id, t]));
          ids.forEach((id, k) => { s.todos[slots[k]] = byId.get(id); });
          // The hand-order is what sorts within a day, so it has to be written
          // down rather than left to the order of the array alone.
          s.todos.forEach((t, i) => { t.order = i; });
        });
        haptic(12);
      },

      onCross: (clientY) => {
        const over = groupUnder(clientY);
        paintDropTarget(over && over.id !== g.id ? over.id : null);
        return over && over.id !== g.id && over.drop ? over : null;
      },
      onDropCross: (target) => {
        paintDropTarget(null);
        const todoId = dragging;
        if (!todoId) return;
        const t = store.getTodo(todoId);
        const to = target.drop();
        const patch = { due: to.due };
        // A day-shelf says nothing about which part of the day, so it leaves
        // that and any clock time alone; 朝 and 午後 and 夜 set the part and
        // drop the time, and 「いつか」 clears both.
        if ("part" in to) patch.part = to.part;
        else if (to.due === null) patch.part = null;
        if ("time" in to) patch.time = to.time;
        store.updateTodo(todoId, patch);
        haptic(14);
        if (t) {
          KN.ui.toast(target.none
            ? `「${t.title}」の日付をはずしました`
            : `「${t.title}」を${target.label}に`);
        }
      },
    });

    // reorder.js hands the drop nothing but the target, so the row being
    // carried is remembered here, at the one moment it is unambiguous.
    box.addEventListener("pointerdown", (e) => {
      const wrap = e.target.closest(".item-wrap");
      dragging = wrap ? wrap.dataset.todoId : null;
    });
  }

  let dragging = null;

  /** Which shelf is under this point, if any. */
  function groupUnder(clientY) {
    const sections = els.body.querySelectorAll(".todo-group");
    for (const sec of sections) {
      const r = sec.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        return groups.find((x) => x.id === sec.dataset.group) || null;
      }
    }
    return null;
  }

  function paintDropTarget(id) {
    els.body.querySelectorAll(".todo-group").forEach((sec) => {
      sec.classList.toggle("is-drop-target", !!id && sec.dataset.group === id);
    });
  }

  /* Finished and put-away todos, dated, newest first — the same drawer, in the
     same words, as the shopping list's and the price screen's. */
  function archiveSection(closed, tiles) {
    const open = store.get().settings.showTodoArchive === true;

    const section = node(html`
      <section class="cat-group">
        <button class="done-head" aria-expanded="${String(open)}">
          ${icon("chevron")} アーカイブ <span class="cat-head-count">${closed.length}</span>
        </button>
        <div class="item-list js-done ${tiles ? "is-tiles" : ""}" ${open ? "" : KN.util.raw("hidden")}></div>
      </section>
    `);

    if (open) {
      const box = section.querySelector(".js-done");
      closed.slice()
        .sort((a, b) => String(store.todoClosedAt(b) || "").localeCompare(String(store.todoClosedAt(a) || "")))
        .forEach((t) => box.append(todoRow(t, tiles, groups)));
    }

    section.querySelector(".done-head").addEventListener("click", () => {
      store.update((s) => { s.settings.showTodoArchive = !open; });
    });

    return section;
  }

  /** The ＋ the shell floats over this screen. */
  function dockButton() {
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="やることを追加">${icon("plus")}</button>
      </div>
    `);
    fab.querySelector(".js-open-add").addEventListener("click", () => openSheet(null));
    return fab;
  }

  /* ---------------- 開いたときに、いまのところへ ----------------

     一日ぶんは画面より長いので、いちばん上から始めると、開くたびに朝の
     済んだ列を下へたどることになります。読みたいのは**いま**です。

     寄せる先は「いまの線」。無ければ（今日でない日を見ているときなど）
     まだ済んでいない最初の一件。どちらも無ければ、動かしません。

     まん中より**少し上**に置きます。まん中ちょうどだと、これからやること
     ——下側——に使える高さが半分しか残りません。少し上げれば、過ぎたぶんは
     すぐ上に見えたまま、先のほうが広く見えます。 */
  const AIM = 0.38;   // 画面の高さの、どのあたりに置くか（0＝上、0.5＝まん中）

  function toNow() {
    if (!root) return;
    const mark = root.querySelector(".tl-now")
      || root.querySelector(".tl-row:not(.is-done)");
    if (!mark) return;
    const box = root.getBoundingClientRect();
    const at = mark.getBoundingClientRect();
    const want = root.scrollTop + (at.top - box.top) - box.height * AIM;
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    const to = Math.round(Math.min(max, Math.max(0, want)));
    if (Math.abs(to - root.scrollTop) < 4) return;
    /* 送ったことが「その人が動かした」と読まれないよう、ひと呼吸伏せます
       （restoreTop と同じ約束。見ている日の印が動いてしまうので）。 */
    restoring = true;
    root.scrollTop = to;
    setTimeout(() => { restoring = false; }, 60);
  }

  /* 開いた一拍のうちに。組み終わってから測るので、一枚あとの絵で。 */
  function onEnter() { requestAnimationFrame(toNow); }

  KN.screens = KN.screens || {};
  KN.screens.todo = { mount, render, dockButton, onEnter };
})();
