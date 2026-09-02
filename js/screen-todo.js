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
  /* **毎朝・毎晩は、選べる先から外しました。** 時間割になる前は、その日の
     どこに置くかを言う手立てが「朝の端／夜の端」しかありませんでした。
     いまは時刻そのものを書けて、書かなくても組み立てが場所を決めます。
     残しておくと「毎日・7:00」と「毎朝・7:00」の二通りができて、同じことを
     二つの言い方で持つことになります。

     **すでに毎朝・毎晩で持っているものは、そのままにします。** 記録の形
     （part: "dawn"/"dusk"）も、それを見ている並べ替え・夜の色・plan.js も
     手を付けていません——選べなくなるだけで、あるものは動きません。
     作り替えが要るなら、勝手にやらずに先に相談すること。 */
  const REPEATS = [
    { id: null,      label: "なし" },
    { id: "daily",   label: "毎日" },
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
            ${/* 題は「やること」ではなく、**いま見ている日**です。タブの名前は
                  下の帯がすでに言っているので、上で二度言う必要がありません。

                  一度は一段下げて暦の見出しに置きました。幅が足りなかった
                  からです——四つのボタンと同居できなかった。設定が帯へ移って
                  一つ減ったので、ここへ戻せます。戻したぶん、暦の見出しの
                  行がまるごと消えました。 */""}
            <button type="button" class="topbar-day js-day-title">
              <span class="topbar-title"><span class="day-y"></span><span class="day-md"></span></span>
              <span class="day-more">${icon("chevron")}</span>
            </button>
            ${/* 右上は**二つだけ**です——さがす と 設定。並べ方（タイル／行）と
                  暦の出し入れは、押すたびに画面が組み変わるほど強いのに、
                  たまにしか使いません。たまに使うものは設定の中へ。
                  右上に居るのは「どの画面でも同じ二つ」だけにします。 */""}
            <button class="icon-btn js-search-btn" aria-label="やることを探す">${icon("search")}</button>
            <button class="icon-btn js-settings" aria-label="設定">${icon("gear")}</button>
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
      searchBtn: chrome.querySelector(".js-search-btn"),
      screen:     root,
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search:    chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
      body:      chrome.querySelector(".js-body"),
      topbar:    chrome.querySelector(".topbar"),
    };

    KN.ui.wireSearch(els, () => renderBody(), (q) => { query = q; });
    chrome.querySelector(".js-settings").addEventListener("click",
      () => KN.app.showScreen("settings"));

    /* 暦を出すか、しまうか。**題の右**に置きます——暦そのものの中に
       ボタンを置くと、しまった先にボタンごと消えて戻れなくなります。
       しまっているあいだは、同じ暦に斜線の入った絵に変わります。 */
    /* 題を押すと、暦が月ぜんぶに開きます（参考画面の「›」と同じ役目）。
       週の帯の右にあった「週」の札と同じ切り替えなので、そちらは外して
       こちらに寄せました——同じことを二か所に置かないために。 */
    /* 題を押すと、暦が月ぜんぶに開きます（参考画面の「›」と同じ役目）。
       題は上のバーにいるので、結ぶのは組み立てのとき一度きりです
       ——暦は描き直されますが、バーは残るので。 */
    els.dayTitle = chrome.querySelector(".js-day-title");
    els.dayTitle.addEventListener("click", () => {
      haptic();
      store.setCalPref("todo", { open: !calOpen() });
    });

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
    /* 一日ずつのときは、画面に日は一つしかありません。スクロールで
       数え直す相手がいないので、そのまま帰ります。 */
    if (oneDay()) {
      hereDay = shownDay();
      markWeek(els.cal, hereDay);
      paintHere();
      return;
    }
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

  /* 題の右にあった暦ボタン（出す／しまう）は外しました。**紙を引く手つきが
     同じことを言えます**——週から上へ押せば暦は消え、そこから下へ引けば
     戻ってきます（js/cal-peek.js の三段）。押しても引いても同じことが
     起きるなら、置くのは一つでいい。設定の「やること」にも札があります。 */

  /** いま出している週だけを残して、ほかのマスに印を付けます。 */
  function markWeek(sec, here) {
    if (!sec) return;
    const open = calOpen();
    const shown = calShown();
    sec.classList.toggle("is-week", !open);
    sec.classList.toggle("is-hidden", !shown);
    /* 「どれだけ開いているか」を一つの数（0＝週、1＝月）で持ちます。題の
       右の「›」の傾きも、隣の月の日の濃さも、これを見て決まります。指で
       引いているあいだは、この数が指について動きます。 */
    if (root) root.style.setProperty("--cal-p", open ? "1" : "0");
    /* 「週／月」の札はここにありました。題（日付）を押す形に移したので、
       塗るものはもうありません——開いているかどうかは、題の右の「›」が
       回ることで言います（paintDayTitle）。 */
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
    paintDayTitle();
  }

  /** 画面の題に、いま見ている日を書きます。 */
  function paintDayTitle() {
    if (!els.dayTitle || !els.dayTitle.isConnected) return;
    const key = oneDay() ? shownDay() : (hereDay || todayKey());
    const d = KN.util.dayDate(key);
    if (!d || isNaN(d.getTime())) return;
    els.dayTitle.querySelector(".day-y").textContent = String(d.getFullYear());
    els.dayTitle.querySelector(".day-md").textContent =
      `年${d.getMonth() + 1}月${d.getDate()}日`;
    els.dayTitle.setAttribute("aria-expanded", String(calOpen()));
    els.dayTitle.setAttribute("aria-label",
      `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日。押すと暦を${calOpen() ? "たたむ" : "ひらく"}`);
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

    /* 新しく書くものは、**いま出している日**のこと。日付なしで足すと
       「いつか」の棚に落ちて、そこは見に行かないと目に入りません。
       あとから外せます。

       一日ずつになってからは、今日を焼き付けるほうが不自然です——9月1日を
       開いて＋を押した人が足したいのは、9月1日のことなので。 */
    let due = editing ? t.due : (oneDay() ? shownDay() : todayKey());
    let part = editing ? t.part : null;
    let time = editing ? t.time : null;
    let repeat = editing ? t.repeat : null;
    let repeatDays = editing ? (t.repeatDays || []).slice() : [];
    let repeatNth = editing ? (t.repeatNth ? { ...t.repeatNth } : null) : null;
    let flagged = editing ? !!t.flagged : false;
    let minutes = editing ? (t.minutes || null) : null;
    let iconKey = editing ? (t.icon || null) : null;
    let deadline = editing ? (t.deadline || null) : null;
    haptic(10);

    /* ---------------- 詳細の紙 ----------------

       **一枚に全部を並べるのをやめました。**

       前はここに、題・アイコン・いつまでに（札4つ＋日付欄＋時刻欄）・
       どれくらいかかる（札14個）・空いているところ・手順・くりかえし・
       メモ・削除が、上から下へ全部並んでいました。決められることは多い
       けれど、**いま決めたい一つを探すのに全部を読む**ことになります。

       参考にした画面の作りに合わせて、三段にしました。

         頭   … 行の絵の続き。ここで題を直し、絵を選び、印を付ける
         札   … 決めごとを一行ずつ（日付・時刻・くりかえし・お知らせ）。
                押すと、その一つだけの紙が開く
         中身 … 手順とメモ

       札を押して開く紙の中身は、**前と同じ部品をそのまま**移しています
       ——札も欄も配線ごと動かすので、選び方は何も変わりません。変わったのは
       「いつ見せるか」だけです。 */
    const body = node(html`
      <div class="sheet-detail">
        ${/* ---- 決めごと ---- */""}
        <div class="d-card">
          <button type="button" class="d-row js-row-due">
            <span class="d-ico">${icon("calendar")}</span>
            <span class="d-label js-due-label"></span>
            <span class="d-value js-due-value"></span>
            <span class="d-go">${icon("chevron")}</span>
          </button>
          <button type="button" class="d-row js-row-time">
            <span class="d-ico">${icon("clock")}</span>
            <span class="d-label js-time-label"></span>
            <span class="d-value js-time-value"></span>
            <span class="d-go">${icon("chevron")}</span>
          </button>
          ${/* 期限。**日付（いつやるか）とは別のこと**です——長期タスクは
                やる日を決めていないだけで、締め切りはあることがあります。
                時刻と長さのすぐ下に置くのは、どちらも「いつ」の話だから。 */""}
          <button type="button" class="d-row js-row-limit">
            <span class="d-ico">${icon("flag")}</span>
            <span class="d-label js-limit-label"></span>
            <span class="d-value js-limit-value"></span>
            <span class="d-go">${icon("chevron")}</span>
          </button>
          <button type="button" class="d-row js-row-repeat">
            <span class="d-ico">${icon("repeat")}</span>
            <span class="d-label js-repeat-label"></span>
            <span class="d-value js-repeat-value"></span>
            <span class="d-go">${icon("chevron")}</span>
          </button>
          <button type="button" class="d-row js-row-notify">
            <span class="d-ico">${icon("bell")}</span>
            <span class="d-label js-notify-label"></span>
            <span class="d-value js-notify-value"></span>
            <span class="d-go">${icon("chevron")}</span>
          </button>
        </div>

        ${/* ---- 中身：手順とメモ ---- */""}
        <div class="d-card">
          <div class="sub-edit js-subs"></div>
          <button type="button" class="d-add js-sub-add">
            <span class="d-add-box">${icon("plus")}</span>
            <span>手順を足す</span>
          </button>
          <textarea class="d-memo js-memo" rows="2"
                    placeholder="メモ、持ちもの、電話番号…">${editing ? t.memo || "" : ""}</textarea>
        </div>
      </div>
    `);

    /* ---- 押すと開く、一つぶんの紙 ----

       中身は前と同じ部品です。body の中には置かず、ここで組んで持って
       おきます（開くときに紙へ差し込み、閉じたら戻します）。 */
    const pickDue = node(html`
      <div class="stack" style="gap:14px">
        <div class="field">
          <div class="js-due-chips"></div>
          <div class="date-row">
            <span class="date-cell">
              <input class="input js-due" type="date" value="${due || ""}"
                     aria-label="日付を選ぶ">
              <span class="date-empty js-due-empty" aria-hidden="true">--/--/--</span>
            </span>
          </div>
          <span class="field-hint js-due-hint"></span>
        </div>
      </div>
    `);

    /* 期限の紙。日付の紙と同じ組みですが、**呼び名の札は置きません**
       ——「今日」「明日」に締め切るものはたいてい日付のほうで決まっていて、
       ここで選ぶのは「今月末まで」のような、もう少し先の日なので。
       外すための口だけは要ります（一度書いた期限は、消せなければ嘘のまま
       残ります）。 */
    const pickLimit = node(html`
      <div class="stack" style="gap:14px">
        <div class="field">
          <span class="field-label">いつまでに</span>
          <div class="date-row">
            <span class="date-cell">
              <input class="input js-limit" type="date" value="${deadline || ""}"
                     aria-label="期限を選ぶ">
              <span class="date-empty js-limit-empty" aria-hidden="true">--/--/--</span>
            </span>
            <button type="button" class="icon-btn js-limit-clear" aria-label="期限をはずす" hidden>
              ${icon("close")}
            </button>
          </div>
          <span class="field-hint">やる日とは別です。長期タスクは、やる日を
            決めていなくても期限だけ持てます。</span>
        </div>
      </div>
    `);

    const pickTime = node(html`
      <div class="stack" style="gap:14px">
        <div class="field">
          <span class="field-label">時刻</span>
          <div class="date-row">
            <span class="date-cell is-time">
              <input class="input js-time" type="time" aria-label="時刻を選ぶ">
              <span class="date-empty js-time-empty" aria-hidden="true">--:--</span>
            </span>
            <button type="button" class="icon-btn js-time-clear" aria-label="時刻をはずす" hidden>
              ${icon("close")}
            </button>
          </div>
          <span class="field-hint js-span-note" hidden></span>
          ${/* 毎朝・毎晩のときだけ出します。そう言っておかないと「毎朝なのに
                19:30 と書いていいのか」で迷います。 */""}
          <span class="field-hint js-time-note" hidden>時刻は、お知らせを出す
            タイミングです。並ぶ場所は毎朝・毎晩のままです。</span>
        </div>

        ${/* どれくらいかかるか。締め切りでも目標でもありません——**今日の
              時間割を組むための長さ**です。決めなくても構いません。 */""}
        <div class="field">
          <span class="field-label">どれくらい かかる</span>
          <div class="js-mins"></div>
        </div>

        ${/* **その長さが入る空き**を、そのまま押せる形で。時刻を決めるのに
              「何時なら空いていたか」を思い出させるのは、この画面がもう
              知っていることを人にやらせています。 */""}
        <div class="field js-slot-field" hidden>
          <span class="field-label">空いているところ</span>
          <div class="js-slots"></div>
        </div>
      </div>
    `);

    const pickRepeat = node(html`
      <div class="stack" style="gap:14px">
        <div class="field">
          <div class="js-repeat"></div>
          <div class="js-repeat-detail" hidden></div>
          <span class="field-hint js-repeat-hint" hidden></span>
        </div>
      </div>
    `);

    /* 紙の中の部品を、body から探せるようにします——下の配線は
       body.querySelector で書かれているので、探す先を広げるだけで
       そのまま通ります。 */
    const parts = [body, pickDue, pickTime, pickRepeat];
    body.pick = (sel) => {
      for (const el of parts) { const hit = el.querySelector(sel); if (hit) return hit; }
      return null;
    };

    /* ---- 頭。行の絵の続きで、ここが題とアイコンの持ち場です ----

       題の欄は body の中にありました。頭に絵と題が並んでいるのに、その
       すぐ下でもう一度「やること」という欄に同じ題が出ている——同じものが
       二つある形でした。**頭のほうを本物にします**（参考画面と同じで、
       題は下線の引かれた白い字として、そこで直に打てます）。

       新しく足すときも頭を敷きます。前は「まだ何の絵でも題でもないので
       敷くものがない」と書きましたが、打ちながら絵と題が育っていくほうが、
       欄を埋めてから確かめるより短い道でした。 */
    const hero = node(html`
      <div class="sheet-hero" style="--cat:${editing ? tlColorOf(t) : "var(--c-primary-fill)"}">
        <span class="hero-mark">
          <span class="hero-node js-hero-node"></span>
          <button type="button" class="hero-paint js-icon-pick" aria-label="絵を選ぶ">
            ${icon("palette")}
          </button>
        </span>
        <span class="hero-text">
          <span class="hero-cap js-hero-when"></span>
          <input class="hero-title js-title" placeholder="例：ゴミ出し・電球を替える"
                 value="${editing ? t.title : ""}"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 aria-label="やること">
          <span class="hero-facts js-hero-facts"></span>
        </span>
      </div>
    `);

    const titleEl = hero.querySelector(".js-title");
    const dueEl = body.pick(".js-due");
    const hintEl = body.pick(".js-due-hint");

    /* アイコン。選んだ鍵（iconKey）と、いま打ってある題の両方が見え方を
       決めます——おまかせのときは、打つそばから推す絵が変わるので。 */
    const iconPickBtn = hero.querySelector(".js-icon-pick");
    function paintIcon() {
      hero.querySelector(".js-hero-node").innerHTML = iconMarkHtml(titleEl.value, iconKey);
    }
    paintIcon();
    iconPickBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTodoIconPicker(iconKey, titleEl.value, (key) => { iconKey = key; paintIcon(); });
    });
    titleEl.addEventListener("input", () => { if (!iconKey) paintIcon(); });
    const foot = node(html`
      <button class="btn btn-primary btn-block js-save" ${editing ? "" : KN.util.raw("disabled")}>
        ${editing ? "保存" : "追加"}
      </button>
    `);

    /* 紙の頭は、時間割の行の**続き**です。

       参考にした画面は、押した行の絵をそのまま大きくして紙の頭に敷きます
       ——同じ丸、同じ色、同じ題。押したものと開いたものが同じだと目で
       分かるので、「どれを開いたんだったか」を思い出さずに済みます。
       ふつうの題の行（「やることを直す」）は、そのぶん要らなくなります。

       新しく足すときは出しません。まだ何の絵でも何の題でもないので、
       敷くものがありません。 */
    /* ---- ⋯ の中の二つ ----

       ★を付けるのと、消すの。どちらも「たまに、一度だけ」使うもので、
       決めごとの札のあいだに置くと、毎回目を通す列に混ざります。
       ★は前は題の右の小さな丸、削除は紙のいちばん下にありました。 */
    const heroMenu = [
      {
        id: "flag",
        label: () => (flagged ? "★をはずす" : "★をつける"),
        sub: "同じ日のなかで先に出てきます",
        icon: "star",
        onPick: () => { flagged = !flagged; paintHeroFacts(); },
      },
    ];
    if (editing) {
      /* 写しを作ります。似たものを続けて足すとき——同じ手順を持つ用事を
         曜日ちがいで置く、買い出しの型を使い回す——に、一から書き直すのは
         そこにある一件を無視していることになります。

         写したらすぐ、その写しの紙を開きます。作って閉じてしまうと、
         「どこへ行ったか」を時間割の中から探すことになるので。題に
         「（コピー）」を付けておくのは、開いた紙がどちらのものか、
         見た瞬間に分かるようにするためです。

         **済ませた印は写しません。** 写しはこれからやることで、
         元がもう済んでいるかどうかとは関わりがないので。 */
      heroMenu.push({
        id: "copy", label: () => "このやることをコピー", icon: "copy",
        sub: "同じ中身で、もう一件つくります",
        onPick: () => {
          const src = store.getTodo(todoId);
          if (!src) return;
          const made = store.addTodo({
            title: `${src.title}(コピー)`,
            due: src.due, deadline: src.deadline, part: src.part, time: src.time,
            repeat: src.repeat, repeatDays: src.repeatDays, repeatNth: src.repeatNth,
            memo: src.memo, flagged: src.flagged, minutes: src.minutes,
            shop: src.shop, icon: src.icon,
            // 手順は形だけ写して、済ませた印は落とします。
            subs: (src.subs || []).map((x) => ({ title: x.title })),
          });
          if (!made) return;
          haptic(10);
          handle.close();
          // 紙が閉じきってから開きます。重ねると、閉じる動きが新しい紙を消します。
          setTimeout(() => openSheet(made.id), 260);
        },
      });
      heroMenu.push({
        id: "delete", label: () => "このやることを削除", icon: "trash", danger: true,
        onPick: () => {
          const undo = store.removeTodo(todoId);
          haptic(14);
          handle.close();
          KN.ui.toast("削除しました", { action: { label: "元に戻す", onClick: undo } });
        },
      });
    }

    const handle = KN.ui.sheet({
      title: editing ? "やることを直す" : "やることを追加",
      hero,
      menu: heroMenu,
      content: body,
      footer: foot,
      /* 書きかけのまま閉じようとしたら、一度だけ聞きます。 */
      guard: true,
    });

    /* 題を打ち替えたら、頭の題もついていきます。保存する前から同じものを
       指していないと、頭が「さっきのもの」を見せたままになります。 */

    /* ---- 頭の、題の上と下 ----

       上は「いつのことか」（日付と時刻）、下は印（★・くりかえし・手順の数）。
       参考にした画面と同じ並びです。 */
    function paintHeroFacts() {
      hero.querySelector(".js-hero-when").textContent =
        [due ? formatDay(due) : "日付なし", time ? tlClock(time) : ""].filter(Boolean).join("　");
      const facts = hero.querySelector(".js-hero-facts");
      facts.innerHTML = "";
      if (flagged) facts.append(node(html`<span class="hero-fact is-fav">${icon("star")}</span>`));
      if (repeat) facts.append(node(html`<span class="hero-fact">${icon("repeat")}</span>`));
      const n = subs.filter((x) => x.title.trim()).length;
      if (n) {
        const done = subs.filter((x) => x.done && x.title.trim()).length;
        facts.append(node(html`
          <span class="hero-fact is-subs">${icon("check")}<i>${done}/${n}</i></span>`));
      }
    }

    /* ---- 四つの札 ----

       押すと、その一つだけの紙が開きます。中身は上で組んだ pickDue /
       pickTime / pickRepeat をそのまま差し込むので、選び方は前と同じです。 */
    function openPick(title, el) {
      el.hidden = false;
      KN.ui.sheet({ title, content: el });
    }
    function paintRows() {
      const row = (sel, label, value) => {
        body.querySelector(sel + " .d-label").textContent = label;
        body.querySelector(sel + " .d-value").textContent = value;
      };
      /* 左は**日付そのもの**、右は「今日」「明日」のような呼び名。
         両方に formatDay を使うと、今日の行が「今日／今日」になります。 */
      if (due) {
        const d = KN.util.dayDate(due);
        const n = daysUntil(due);
        const near = n === 0 ? "今日" : n === 1 ? "明日" : n === 2 ? "明後日"
          : n === -1 ? "昨日" : (n < 0 ? `${-n}日前` : `${n}日後`);
        const full = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
        row(".js-row-due", full, near);
      } else {
        row(".js-row-due", "日付なし", "");
      }
      row(".js-row-time", time ? `${tlClock(time)}${minutes ? " 〜 " + tlClock(KN.plan.toTime(KN.plan.toMin(time) + minutes)) : ""}` : "時刻なし",
          minutes ? KN.plan.humanSpan(minutes) : "");
      /* 期限。過ぎていたら、その旨をそのまま書きます（色だけで言うと、
         色の意味を知っている人にしか伝わらないので）。 */
      if (deadline) {
        const d = KN.util.dayDate(deadline);
        const n = daysUntil(deadline);
        const near = n === 0 ? "今日まで" : n === 1 ? "明日まで"
          : n < 0 ? `${-n}日すぎています` : `あと${n}日`;
        row(".js-row-limit",
            `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）まで`, near);
      } else {
        row(".js-row-limit", "期限なし", "");
      }
      const rid = isBookend(part) ? part : (repeat || "");
      const rw = (REPEATS.find((r) => (r.id || "") === rid) || {}).label;
      row(".js-row-repeat", rid ? rw : "くりかえさない",
          repeat === "weekly" && repeatDays.length
            ? repeatDays.map((d) => WD[d]).join("・") : "");
      const nt = KN.notify;
      const on = !!(nt && nt.supported() && nt.enabled() && !nt.blocked());
      row(".js-row-notify", time ? "時刻に知らせる" : "時刻を決めると知らせます",
          time ? (on ? "オン" : "オフ") : "");
      body.querySelector(".js-row-notify").disabled = !time;
      paintHeroFacts();
    }
    body.querySelector(".js-row-due").addEventListener("click", () => openPick("いつまでに", pickDue));
    body.querySelector(".js-row-time").addEventListener("click", () => openPick("時刻と長さ", pickTime));
    body.querySelector(".js-row-limit").addEventListener("click", () => openPick("期限", pickLimit));
    body.querySelector(".js-row-repeat").addEventListener("click", () => openPick("くりかえし", pickRepeat));
    body.querySelector(".js-row-notify").addEventListener("click", () => {
      const nt = KN.notify;
      if (!nt || !nt.supported()) { KN.ui.toast("この端末では知らせられません"); return; }
      if (nt.blocked()) { KN.ui.toast("端末の設定で、通知が止められています"); return; }
      haptic();
      if (nt.enabled()) { nt.disable(); paintRows(); KN.ui.toast("お知らせを止めました"); return; }
      nt.enable().then(() => { paintRows(); }).catch(() => {});
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
      const ph = body.pick(".js-due-empty");
      if (ph) ph.hidden = !!due;
    }

    function paintDueChips() {
      KN.ui.chipRow(body.pick(".js-due-chips"), DUE_CHIPS(), {
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
    /** 「7:00 〜 7:30　30分」。時刻と長さの両方が決まったときだけ。 */
    function paintSpanNote() {
      const el = body.pick(".js-span-note");
      if (!el) return;
      const P = KN.plan;
      const at = P.toMin(time);
      if (at == null) { el.hidden = true; el.textContent = ""; return; }
      const len = minutes || P.DEFAULT_MINUTES;
      const until = P.toTime(at + len);
      const guess = minutes ? "" : "（長さを決めていないので、30分として）";
      /* 時刻の書き方は、時間割の左の列と揃えます（頭の0を落とす）。
         同じ時刻が画面によって「07:00」と「7:00」に見えると、同じもの
         だと気づくのに一拍かかります。 */
      el.hidden = false;
      el.textContent = `${tlClock(time)} 〜 ${tlClock(until)}　${P.humanSpan(len)}${guess}`;
    }

    function paintHint() {
      paintSpanNote();
      /* 札の右の値も、決めごとが変わるたびに書き直します。ここは日付・
         時刻・長さのどれが変わっても必ず通る合流点です。 */
      paintRows();
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
    const timeCell = body.pick(".date-cell.is-time");
    const timeEl = body.pick(".js-time");
    const timeClear = body.pick(".js-time-clear");

    /* かかる時間。よく使う長さだけを札で出します——分を打たせると
       「25分か30分か」を考え始めてしまい、見積もりはそこまで細かく
       なりません。「決めない」も答えのうちなので、先頭に置きます。

       2時間までは30分刻み、そこから先は1時間刻みにします。外出や作業
       まとめのように長くかかる用事も、札を押すだけで置けるように
       （買い物へ行く、通院、旅行の移動など）。上限は cleanMinutes と
       同じ12時間——それ以上は一日の別の使い方（複数の用事に割る）の話
       なので、ここでは扱いません。 */
    const MINS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720];
    const minsHost = body.pick(".js-mins");
    function paintMins() {
      KN.ui.chipRow(minsHost, [{ id: "", label: "決めない" }].concat(
        MINS.map((m) => ({ id: String(m), label: KN.plan.humanSpan(m) }))
      ), {
        activeId: minutes ? String(minutes) : "",
        onPick: (id) => {
          minutes = id ? Number(id) : null;
          KN.motion.fire("select");
          paintMins();
          paintSpanNote();   // 終わりの時刻は、長さでも変わります
          paintRows();
          paintSlots();
        },
      });
    }

    /* その日の組み立てを引いて、いま決めている長さが入る空きを出します。

       いま直している一件は、組み立てから**外して**数えます。入れたまま
       だと、自分がすでに占めている場所を「空いていません」と自分に言い
       返すことになります。 */
    const slotField = body.pick(".js-slot-field");
    const slotHost = body.pick(".js-slots");
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
    const subHost = body.pick(".js-subs");
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
      paintHeroFacts();   // 頭の「☑ 2/5」も、増減についていきます
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
      const ph = body.pick(".js-time-empty");
      if (ph) ph.hidden = !!time;
      const note = body.pick(".js-time-note");
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

    /* 期限の欄。日付の欄と同じ作りですが、こちらは外れても何も連れて
       いきません（時刻もくりかえしも、やる日の話なので）。 */
    const limitEl = body.pick(".js-limit");
    const limitClear = body.pick(".js-limit-clear");
    function paintLimit() {
      const ph = body.pick(".js-limit-empty");
      if (ph) ph.hidden = !!deadline;
      if (limitClear) limitClear.hidden = !deadline;
      paintRows();
    }
    if (limitEl) {
      limitEl.addEventListener("change", () => {
        deadline = limitEl.value || null;
        paintLimit();
        haptic();
      });
    }
    if (limitClear) {
      limitClear.addEventListener("click", () => {
        deadline = null;
        if (limitEl) limitEl.value = "";
        paintLimit();
        haptic();
      });
    }
    paintLimit();

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

    const detailEl = body.pick(".js-repeat-detail");
    const repeatHint = body.pick(".js-repeat-hint");

    /* 毎朝・毎晩は、記録の上では「毎日 ＋ 日の端」です。選択肢としては
       毎日の隣に一つずつ並びますが、しまうときは repeat と part に分かれます。
       だから光らせる印も、その二つから逆に組み立てます。 */
    const repeatChipId = () => (isBookend(part) ? part : (repeat || ""));

    function paintRepeat() {
      KN.ui.chipRow(body.pick(".js-repeat"),
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
      paintRows();
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
    paintRows();

    /* ★は ⋯ の中へ移りました（上の heroMenu）。付いているかどうかは、
       頭の題の下に小さな星として出ます。 */

    titleEl.addEventListener("input", () => { foot.disabled = !titleEl.value.trim(); });

    foot.addEventListener("click", () => {
      const title = titleEl.value.trim();
      if (!title) return;
      const memo = body.pick(".js-memo").value;
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
        store.updateTodo(todoId, { title, due: fixed, deadline,
          part: fixed ? part : null, time: at,
          repeat, repeatDays, repeatNth, memo, flagged, minutes, icon: iconKey });
        /* 手順は別に置きます。updateTodo は書いてよい欄を選ぶので、
           知らない欄を混ぜると黙って落ちます。 */
        store.setSubs(todoId, subs);
        KN.ui.toast(fixed !== due ? `${when}にしました` : "直しました");
      } else {
        store.addTodo({ title, due: fixed, deadline, part: fixed ? part : null, time: at,
          repeat, repeatDays, repeatNth, memo, flagged, minutes, subs, icon: iconKey });
        KN.ui.toast(fixed
          ? `「${title}」を${when}までに`
          : `「${title}」を追加しました`);
      }
      haptic(12);
      handle.close();
    });

    /* 削除は ⋯ の中へ移りました（上の heroMenu）。紙のいちばん下に置くと、
       毎回そこを通ることになります——たまに、一度だけ使うものなので。 */

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

  /* 今日の色を、基調のコーラルに合わせました（実測 #f2938e）。時間割の
     丸と背骨がこの色で塗られるので、ここが基調とずれていると、今日の
     画面だけ別のアプリの色になります。二日目から先はこれまでどおり、
     締切までの遠さを言う坂です。 */
  const DAY_COLORS = ["#f2938e", "#e08a3a", "#cfa93c", "#8bb34a", "#6aae55", "#5aa55a", "#4fa17a", "#49a0a0"];
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

  /* やることの絵。**「こと」の辞書（icons-todo.js）を先に**、当たらなければ
     買うものの辞書（product-icons.js）を引きます。

     前は買うものの辞書だけを引いていました。実測したところ、用事の言い回し
     107個のうち当たったのは50個（47%）です——「買い物」「料理する」「会議」
     「宿題」「散歩」「充電」「バックアップ」が、ことごとく外れていました。
     買い物リストのために作った辞書に、用事を引かせていたからです。

     順番が大事です。「洗濯する」は洗濯機であってほしいが、「洗濯洗剤」は
     ボトルであってほしい。同じ辞書を同じ順で引くと、どちらか一方しか
     立ちません。やること側は こと を先に、買うもの側は 品物 を先に。

     選べるようにはしていません。買うものは「同じ品を何度も」なので手で
     直す値打ちがありますが、やることは一度きりの文が多く、いちいち絵を
     選ばせるのは手間のほうが大きい。名前から引くだけにしてあります。

     当たらないときは、期限の色の丸に落とします。絵の無い行だけ左端が
     空くと列が崩れるので、何かは必ず置く。丸は「まだ絵が無い」の目印で
     あって、失敗の表示ではありません。 */
  /** 自分で選んだ絵（あれば）、無ければ題から推した絵。無ければ丸だけ。
   *  シート内の「いまの見え方」プレビューと、行そのものの両方が使います。 */
  function iconMarkHtml(titleText, key) {
    /* 保存済みの絵の名前は、どちらの辞書のものかを持っていません（前は
       買うものしか無かったので）。両方に聞いて、答えたほうを使います。 */
    const svg = (key && (KN.iconsTodo.byKey(key) || KN.productIcons.byKey(key)))
      || KN.iconsTodo.find(titleText || "")
      || KN.productIcons.find(titleText || "");
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
        const hits = KN.iconsTodo.search(query).concat(KN.productIcons.search(query));
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

      /* 「もしかして」は こと を先に。用事の題を書いているところなので。 */
      const mineT = KN.iconsTodo.suggest(titleText, 4);
      const mineP = KN.productIcons.suggest(titleText, 4);
      const maybe = mineT.concat(mineP);
      if (maybe.length) {
        const pool = KN.iconsTodo.list().concat(KN.productIcons.list());
        grids.append(heading("もしかして"));
        grids.append(grid(pool.filter((x) => maybe.includes(x.key))
          .sort((a, b) => maybe.indexOf(a.key) - maybe.indexOf(b.key))));
      }
      /* 二つに分けて出します。数がまるで違う（こと93・品物708）ので、
         混ぜると こと が品物の海に沈みます。 */
      grids.append(heading("こと"));
      grids.append(grid(KN.iconsTodo.list()));
      grids.append(heading("品物"));
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
    renderBody();
    paintDayTitle();
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

    /* 一日ぶんは、**白い紙**の上に乗ります。

       参考にした画面は、暦のうしろの地（うっすら紫がかった灰）の上に、
       角の丸い白いシートを一枚重ねています。上の掴み手（小さな灰色の棒）
       まで含めて「ここから下は別の層」と言っていて、暦とリストが同じ面に
       並んでいないことが、線を引かなくても読めます。

       検索しているあいだは出しません——絞った結果は「一日」ではないので、
       一日ぶんの紙に乗せると嘘になります。 */
    const sheet = query ? els.body : node(html`
      <div class="tl-sheet"><span class="tl-grip" aria-hidden="true"><i></i></span></div>
    `);
    if (sheet !== els.body) els.body.append(sheet);

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

    /* ---- 一日ずつ ----

       時間割で見ているあいだは、**画面に一日ぶんだけ**を出します（参考に
       した画面と同じ）。棚を縦に積むのをやめました。

       積んでいた形にも良いところはありました——「棚は月をほどいて縦に
       並べたもの」で、下へたどれば来週まで見通せて、棚をまたいでつまむと
       日付が変わる。失うものがあるのは承知のうえです。かわりに得るのは、
       **一日が一枚に収まる**ことです。今日を見ているときに明日の見出しが
       目に入らない、というのは、一日を組み直すあいだはむしろ利きます。

       失った道は、二つとも別の口に付け替えました。
         ・遠くの日へ … 上の週の帯を押す（＋ ‹ › と左右に払う）
         ・日付を変える … その用事を、週の帯の日へ運ぶ（下の wireDayDrop）

       期限切れ・もっと先・済んだものは、一日の中には居場所がありません。
       **一覧で見る**ほうがその受け皿です（設定で切り替え）。時間割の頭に、
       期限切れがあることだけ出します——黙って隠すと、見に行く理由すら
       無くなるので。 */
    if (oneDay()) {
      sheet.append(daySection(shownDay(), open));
      // 時間割の下に、少し離して。いつやるか決めていないものの置き場です。
      sheet.append(somedaySection(open));
      wireDaySwipe(sheet);
      wireCalPull(sheet);
      /* 紙を下へ引くと暦が出てくるので、そのぶん「引いて更新」は紙の上では
         使えません。閉じているあいだだけ譲ってもらいます（開いていれば
         下向きは空いているので、これまでどおり更新できます）。
         上の暦の帯からは、どちらの姿でも引けます。 */
      if (els.cal && !calOpen()) sheet.setAttribute("data-pull-own", "cal");
      restoreTop(keepTop);
      return;
    }

    const rowsOf = (id) => open.filter((t) => groupIdOf(t, groups) === id);

    /* 期限切れ and 「もっと先」 are the two that only appear when they have
       something in them: one is a problem rather than a place, and the other is
       an overflow rather than a shelf. */
    const late = groups.find((g) => g.late);
    if (rowsOf("late").length) sheet.append(groupSection(late, rowsOf("late"), tiles));

    sheet.append(todayPanel(rowsOf, tiles));

    groups.filter((g) => !g.late && !g.today).forEach((g) => {
      const rows = rowsOf(g.id);
      if (!rows.length && g.onlyWhenFull) return;
      sheet.append(groupSection(g, rows, tiles));
    });

    if (closed.length) sheet.append(archiveSection(closed, tiles));
    restoreTop(keepTop);
  }

  /* ---------------- 一日ぶん ---------------- */

  /** 時間割で見ているか（＝一日ずつか）。探しているあいだは棚に戻ります
      ——絞った結果は「一日」ではないので。 */
  const oneDay = () => !query && !KN.ui.isTiles() && timelineOn();

  /* いま出している日。null は今日です（日が変わっても勝手についてくる
     ように、todayKey() を焼き付けません）。 */
  let viewDay = null;
  const shownDay = () => viewDay || todayKey();

  /** 一日ぶんの時間割。頭も見出しも持ちません——日付は画面の題が言います。 */
  function daySection(day, open) {
    const sec = node(html`
      <section class="todo-group todo-day is-tl" data-group="day"
               data-month="${day.slice(0, 7)}" data-day="${day}"></section>
    `);

    /* くり返しの用事は、先の日にも立ちます（store.fallsOn）。**今日から先
       だけ**そうします——過ぎた日には済ませた跡（trace）がもう並んでいて、
       そこへ生きている一件を重ねると、同じ用事が二行になるので。 */
    const ahead = day >= todayKey();
    const rows = open.filter((t) => (ahead ? store.fallsOn(t, day) : t.due === day));
    const done = store.get().todos.filter((t) => (t.done || t.archived) && t.due === day);
    if (!rows.length && !done.length) {
      sec.append(node(html`
        <p class="todo-today-empty">${day === todayKey()
          ? "今日のぶんはありません" : "この日のやることはありません"}</p>
      `));
      return sec;
    }
    sec.append(timeline(rows, { id: "day", day }));
    return sec;
  }

  /* ---------------- 長期タスク ----------------

     やると決めているが、**いつやるかは決めていない**もの（`due` を
     持たないもの）。時間割の下に、少し離して置きます。

     時刻も、時刻の線も出しません。時刻が無いのだから、そこに何かを
     書けば嘘になります——「未定」とも書きません（列が空いていること自体が
     もう「まだ決めていない」と言っているので）。かわりに出すのは**期限**
     です。ここは締め切りだけが効いてくる場所なので。

     ここから時間割へ運べます（wireDrag は同じものを使います）。空いている
     ところへ落とせば、その日・その時刻に決まる——それがこの欄の使い道です。
     詳細の紙も、時間割の行とまったく同じものが開きます。 */
  function somedaySection(open) {
    const rows = open.filter((t) => !t.due && !t.done && !t.archived && !t.trace);
    const sec = node(html`
      <section class="todo-group tl-someday-sec" data-group="someday">
        <h2 class="todo-head tl-someday-head">
          <span>長期タスク</span>
          ${rows.length ? html`<span class="cat-head-count">${rows.length}</span>` : ""}
        </h2>
      </section>
    `);
    if (!rows.length) {
      sec.append(node(html`
        <p class="todo-today-empty">いつかやることを、ここに置いておけます</p>
      `));
      return sec;
    }
    /* 並びは**手で決めたもの**（order）です。期限は文字で見えているので、
       並び順まで期限に決めさせると、二つのやり方で同じことを言うことに
       なります——並べ替えられるようにした以上、並びの持ち主は order の
       ほうにします。急ぐものを上に置きたければ、運べば済みます。 */
    const sorted = rows.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const list = node(html`<ul class="tl tl-someday"></ul>`);
    sorted.forEach((t) => list.append(somedayRow(t)));
    sec.append(list);
    /* 運ぶ手つきは時間割と同じもの。day は渡しません——この欄の行は
       まだどの日のものでもないので、落とした先が日を決めます。 */
    wireDrag(list, null);
    return sec;
  }

  /** 長期タスクの一行。時間割の行と同じ組みで、時刻の列だけが空。 */
  function somedayRow(t) {
    const it = {
      todo: t,
      at: null, atMin: NaN, untilMin: NaN,
      fixed: false, clash: false,
      minutes: t.minutes || KN.plan.DEFAULT_MINUTES,
    };
    const li = itemRow(it, false);
    li.classList.add("is-someday");
    /* 期限は、題のすぐ近くに。事実の行（長さと同じところ）に置きます
       ——ここでいちばん効いてくる数なので、先頭に差し込みます。 */
    if (t.deadline) {
      const body = li.querySelector(".tl-body");
      let facts = li.querySelector(".tl-facts");
      if (!facts) {
        facts = node(html`<span class="tl-facts"></span>`);
        if (body) body.append(facts);
      }
      const over = t.deadline < todayKey();
      facts.prepend(node(html`
        <span class="tl-due ${over ? "is-over" : ""}">${formatDay(t.deadline)}まで</span>
      `));
    }
    return li;
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

  function scrollToSection(target, willStick) {
    /* Scrolled by hand rather than with scrollIntoView. That asks *every*
       ancestor to bring the row into view, the document included — and the
       document's one spare pixel is what the status-bar tap listens on, so
       revealing a row here would read as 「上へ戻れ」 and do the opposite
       (app.js). Setting the screen's own scrollTop leaves the document alone. */
    /* 送ったあとに暦が貼りつくと、着いた先の見出しがその裏に隠れます
       ——いま貼りついていないぶんは、chromeInset が数えていないので。
       これから貼りつくと分かっているときは、その高さも先に引きます。 */
    let inset = chromeInset();
    if (willStick && els.cal && !els.cal.classList.contains("is-stuck")) {
      inset += els.cal.getBoundingClientRect().height;
    }
    const top = root.scrollTop
      + target.getBoundingClientRect().top - root.getBoundingClientRect().top - inset;
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
        ${/* 見出しの行は、まるごと上のバーへ移しました（日付の題と「›」）。
              残っていた ‹ › は落としています——日を送る道は、週の帯を押す・
              左右に払う、の二つで足りていて、三つめは行を一段ぶん使うだけ
              でした。「今日へ」だけは、遠い日から一息で帰る道として残します。 */""}
      </section>
    `);
    /* 三層（曜日の行／伸び縮みする窓／その中のずらしと日のマス）は
       cal-peek.js が組みます。daily の暦と、同じものを使うためです。 */
    const grid = KN.calPeek.mount(sec).grid;
    sec.append(node(html`<button type="button" class="cal-now js-now" hidden>今日へ</button>`));

    /* 月を変えたら、下のリストもその月の頭へ運びます。上だけが動くと、
       カレンダーと棚が別々のものを指したまま並ぶことになります。
       週だけ出しているときは、刻みも週です（月ごと飛ぶと、押した先に
       自分の週が無くなります）。 */
    const goTo = (delta) => {
      haptic();
      /* 一日ずつのときは、一日ぶん送ります。週ごと飛ばすと、隣の日を
         見るのに七回ぶん動くことになります。週をまたげば帯のほうが
         ついてきます（markDay → markWeek）。 */
      if (oneDay()) {
        goDay(KN.util.shiftDay(shownDay(), delta), delta);
        return;
      }
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
    sec.querySelector(".js-now").addEventListener("click", () => {
      haptic();
      if (oneDay()) { goDay(todayKey()); return; }
      const now = U.dayDate(todayKey());
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
    cell.addEventListener("click", () => openDay(key));
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

    /* 日ごとの**絵**。点のかわりに、その日にあるものの絵をそのまま並べます
       （参考にした画面と同じ）。点は「詰まっている／いない」しか言いません
       が、絵は「病院がある」「買い物の日だ」まで言います。暦を読む目的の
       ほとんどは後者です。

       繰り返すものも入れます。上の点は繰り返しを外していました——毎週火曜の
       ゴミ出しが九日に点を打つと、点が「ふつうでない日」を指せなくなるから
       です。絵は違います：絵は数ではなく**中身**なので、毎週あるものが毎週
       出ているのは、そのとおりで正しい。

       三つまで（参考画面は四つ）。一つ減らしたのは、こちらの絵が読める
       大きさ（20px）だと四つ目がマスからはみ出すからです。 */
    const marks = new Map();
    (open || []).forEach((t) => {
      if (!t.due) return;
      const list = marks.get(t.due) || [];
      if (list.length < 3) { list.push(t); marks.set(t.due, list); }
    });

    sec.setAttribute("aria-label", `${year}年${month + 1}月`);

    /* 「今日へ」。一日ずつのときは**出している日**が今日かどうかで決めます
       ——月で見ていた名残のまま「今月かどうか」で決めていると、9月1日を
       開いているのに戻り口が出ませんでした（同じ月なので）。 */
    sec.querySelector(".js-now").hidden = oneDay() ? (shownDay() === today) : thisMonth;

    const grid = sec.querySelector(".cal-grid");
    grid.innerHTML = "";

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
      (marks.get(key) || []).forEach((t) => dots.append(node(html`
        <i class="cal-mark" style="--cat:${tlColorOf(t)}">${todoMark(t)}</i>
      `)));
      /* Tapping a date goes to that date's shelf. Otherwise the month is a
         picture of somewhere you cannot get to — 8月17日 is visible up here
         and four screens down there, with nothing joining them. */
      /* 押した日には、その場で輪を移します。棚まで運んでから followScroll に
         数え直させると、その日に棚が無ければ（やることの無い日は棚が出ない）
         輪はどこにも移らず、押しても何も起きないように見えます。
         押した日を見ている——それがいちばん確かなことなので、先に言います。 */
      cell.addEventListener("click", () => openDay(key));
      grid.append(cell);
    }
    outer.trail.forEach((key) => grid.append(outCell(key)));
    /* 期限切れ。一日の中には居場所がないので、**あることだけ**言って、
       受け皿（一覧）への口を出します。

       ここ（貼りつく帯の中）に置くのが肝です。紙の中に置いていたら、
       開いた瞬間に「いま」のところへ送られて（toNow）、そのまま帯の裏へ
       隠れました——**見えない注意は、無いのと同じ**です。帯の中なら、
       どこまで送っても居ます。

       今日を見ているときだけ。過ぎた日を見ているときに「期限切れ」と
       言われても、することがありません。 */
    const oldBar = sec.querySelector(".tl-late");
    if (oldBar) oldBar.remove();
    const late = oneDay() && shownDay() === today
      ? (open || []).filter((t) => t.due && t.due < today) : [];
    if (late.length) {
      const bar = node(html`
        <button type="button" class="tl-late js-late">
          <span class="tl-late-n">${late.length}</span>
          <span>期限切れがあります</span>
          <span class="tl-late-go">一覧で見る${icon("chevron")}</span>
        </button>
      `);
      bar.addEventListener("click", () => {
        haptic();
        store.update((st) => { st.settings.todoTimeline = false; });
        KN.ui.toast("一覧で出します。設定から戻せます");
      });
      sec.append(bar);
    }

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
    /* 時間割はここでは描きません。**一日ずつ**の画面（daySection）だけが
       描きます。ここは「一覧で見る」ときの棚——期限切れ・来週・もっと先の
       受け皿で、どれも何日かの寄せ集めなので、一本の時間軸は引けません。 */
    if (rows.length) {
      const box = node(html`<div class="item-list js-rows ${tiles ? "is-tiles" : ""}"></div>`);
      rows.forEach((t) => box.append(todoRow(t, tiles, groups, g)));
      section.append(box);
      if (!tiles) wireReorder(box, g);
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
  /* 過ぎた日。暦でその日を押すと、ここへ出ます。

     新しく持ち直すものは何もありません。その日の時間割は、いま持っている
     やること（due がその日のもの）から**そのつど組み立てます**——済ませた
     もの、済ませなかったもの、繰り返しを済ませたときの写し、手順の印まで、
     すべて元のデータがすでに持っています。写しを作れば、元を直したときに
     古い姿が残ります。組み立てるなら、そもそもずれようがありません。

     出しかたは今日と同じ部品（timeline）です。過ぎた日だけ別の見せかたに
     すると、同じ「やること」に二つの読み方ができてしまいます。 */
  /** 暦で押された日へ。

      一日ずつのときは、**その日に入れ替えます**（過ぎた日も先の日も同じ
      扱いで、特別な差し込みはもう要りません）。棚で見ているときは、
      これまでどおりその棚まで運びます。 */
  function openDay(day) {
    haptic();
    if (oneDay()) {
      goDay(day);
      return;
    }
    markDay(day, true);
    jumpToDay(day);
  }

  /* ---------------- 左右に払って、日を送る ----------------

     一日ずつになったので、隣の日へ行く道が要ります。上の帯を押すのが
     一つ、‹ › が二つめ、これが三つめ——**紙を横に払う**。参考にした画面と
     同じ手つきで、いちばん手数が少ない道です。

     縦のスクロールとぶつからないよう、横がはっきり勝っているときだけ
     取ります（1.4倍）。つまんで運んでいる最中は取りません——用事を横へ
     運ぼうとしている指を、日送りに取られては困ります。 */
  const SWIPE_MIN = 56;      // これだけ横に動いたら、日を送ります
  const SWIPE_DOM = 1.4;     // 縦より、これだけ横が勝っていること

  function wireDaySwipe(el) {
    let x0 = 0, y0 = 0, pid = null, live = false;
    el.addEventListener("pointerdown", (e) => {
      if (tlDrag || e.pointerType === "mouse") return;
      pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; live = true;
    }, { passive: true });
    const end = (e) => {
      if (!live || e.pointerId !== pid) return;
      live = false;
      if (tlDrag) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) < SWIPE_MIN) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_DOM) return;
      const dir = dx < 0 ? 1 : -1;      // 左へ払う＝次の日
      haptic();
      goDay(shiftDay(shownDay(), dir), dir);
    };
    el.addEventListener("pointerup", end, { passive: true });
    el.addEventListener("pointercancel", () => { live = false; }, { passive: true });
  }

  /* ---------------- 紙を下に引くと、月が出てくる ----------------

     仕掛けそのものは js/cal-peek.js が持ちます（daily と分け合うため
     ——二枚書き写すと、片方だけを直した日に二つの暦が違う動きをします）。
     ここが答えるのは「この画面では何が『いま見ている日』か」「いつ引いて
     よいか」だけです。 */
  function wireCalPull(el) {
    KN.calPeek.wire({
      sheet: el,
      root,
      cal: () => els.cal,
      isOpen: calOpen,
      isShown: calShown,
      /* 探している最中だけ引きません。**暦をしまっていても引けます**
         ——三段目（暦なし）から週へ戻す道が、ここしかないので。 */
      enabled: () => !query && oneDay(),
      // 用事を運んでいる指を、暦に取られては困ります。
      busy: () => !!tlDrag,
      here: () => hereDay || todayKey(),
      tagOffWeek,
      /* 三段（暦なし・週・月）ぶんを、まとめて書きます。段が変わらなかった
         ときだけ塗り直し——書けば store が組み直すので、二度手間になります。 */
      commit: ({ shown, open }) => {
        if (open !== calOpen() || shown !== calShown()) {
          store.setCalPref("todo", { open, shown });
        } else markWeek(els.cal, hereDay || todayKey());
      },
    });
  }

  /** 出す日を入れ替えます。 */
  function goDay(day, dir) {
    if (!day || day === shownDay()) return;
    viewDay = day === todayKey() ? null : day;
    markDay(day, true);
    render();
    /* 入れ替えたら、読む場所は先頭から。今日だけは「いま」のところへ
       ——一日の途中で開くのはたいてい今日なので。 */
    if (root) root.scrollTop = 0;
    if (day === todayKey()) requestAnimationFrame(toNow);
    const sheet = els.body && els.body.querySelector(".tl-sheet");
    if (sheet && dir && !KN.motion.still()) {
      sheet.classList.add(dir > 0 ? "is-from-right" : "is-from-left");
      requestAnimationFrame(() => sheet.classList.remove("is-from-right", "is-from-left"));
    }
  }

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
    /* ここは「一覧で見る」ときの今日の枠です。時間割は daySection が描く
       ようになったので、こちらは並べるだけになりました。 */
    if (rows.length) {
      const box = node(html`<div class="item-list js-rows ${tiles ? "is-tiles" : ""}"></div>`);
      rows.forEach((t) => box.append(todoRow(t, tiles, groups, plain)));
      top.append(box);
      if (!tiles) wireReorder(box, plain);
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

    parts.forEach((part, i) => {
      if (part.kind === "free") {
        list.append(freeRow(part.f, isToday ? nowMin : null));
        return;
      }
      const next = parts[i + 1];
      list.append(itemRow(part.it, !!next && next.kind === "item"));
    });

    /* 重なっている二つは、**丸薬どうしがぶつかって**見えます（下の CSS）。
       ぶつかるには相手が要るので、重なった行の一つ上にも印を付けます。
       組み立ては時刻の順に並べているので、重なった相手はすぐ上の行です。 */
    [...list.children].forEach((li) => {
      if (!li.classList.contains("is-clash")) return;
      const prev = li.previousElementSibling;
      if (prev && prev.classList.contains("tl-row")) prev.classList.add("is-clash-above");
    });

    /* 「いま」は、行の流れの中には置きません。**一枚の層**に乗せて、行の
       上に重ねます。行だったころは、いまの時刻がある用事の**あと**にしか
       置けませんでした——14時から18時の用事を15時に見ると、線が18時の
       あたりに出ます。層にすれば、その行の中の正しい高さに置けて、しかも
       常に前に出ます。 */
    const axis = node(html`<div class="tl-axis" aria-hidden="true"></div>`);
    sec.append(axis);
    watchNow(sec, isToday);

    wireDrag(list, day);
    return sec;
  }

  /* ---------------- いま、どこにいるか ----------------

     ここには1時間ごとの目盛りを描く層がありました。**やめました。**

     参考にした画面（Structured）の時間割は、時間に比例していません。
     610分の空きと325分の空きが同じ高さで、しかも5分の用事より低い
     ——つまりあれは「並び順のリスト」で、長さは絵ではなく字（詳細の
     「16時30分〜16時35分」）で言っています。目盛りの軸も、伸びる帯も、
     その作りとは噛み合いません。両方とも外しました。

     残したのは「いま」の一本だけです。あちらには無いものですが、
     一日の途中で開いたときに**どこまで来たか**を言えるのはこれだけ
     なので、ここは意図して足しています。

     位置は組み終わってから実測します。行の高さは中身（メモ・手順・題の
     行数）で変わるので、分から計算した位置は当たりません。時間の背骨は
     レール（.tl-rail）なので、そこだけを測ります——手順をひらいた行では、
     レールは題の段にとどまり、下へ伸びた手順の帯には時間がありません。 */

  function watchNow(sec, isToday) {
    const list = sec.querySelector(".js-tl");
    const axis = sec.querySelector(".tl-axis");
    if (!list || !axis) return;
    const paint = () => paintNow(sec, list, axis, isToday);
    axis.__paint = paint;
    /* 返した時点では、まだ親に付いていません（高さが0です）。付いた瞬間
       にも、手順をひらいて伸びたときにも呼ばれるので、測り直す口はこれ
       一つで足ります。 */
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(paint).observe(list);
    } else {
      requestAnimationFrame(paint);
    }
  }

  /** いまの時刻が、リストのどの高さに当たるか。無ければ null。

      **行の中にも入ります。** ここには「行と行のあいだにしか置けない」と
      書いてありました。丸薬（アイコン周り）がかかる時間だけ縦に伸びる
      ようになって、事情が変わりました——丸薬の上端が始まり、下端が
      終わりなので、行の中に目盛りが生まれています。9時00分〜9時45分の
      用事を 9時07分に見れば、丸薬の頭から 16% のところが「いま」です。
      塗りの境目（下の CSS の --pass）と同じ高さになります。

      空きの帯の中でも同じように割ります。空きの高さは長さに比例しません
      が、「この空きのどのあたりか」は帯の中でなら言えます。 */
  function nowY(sec, list, nowMin) {
    const top0 = sec.getBoundingClientRect().top;
    let last = null;
    for (const li of list.children) {
      const rail = li.querySelector(".tl-rail");
      if (!rail) continue;
      const a = Number(li.dataset.at), u = Number(li.dataset.until);
      if (!isFinite(a) || !isFinite(u) || u <= a) continue;
      const r = rail.getBoundingClientRect();
      if (r.height <= 0) continue;
      if (nowMin <= a) return r.top - top0;
      if (nowMin < u) {
        /* 用事なら丸薬の中で、空きなら帯の中で。丸薬は行のまん中にあって
           行より低いので、行の高さで割ると塗りの境目とずれます。 */
        const nd = li.querySelector(".tl-node");
        const box = nd ? nd.getBoundingClientRect() : r;
        if (box.height > 0) return box.top - top0 + box.height * ((nowMin - a) / (u - a));
      }
      last = r.bottom - top0;
    }
    /* 一日の残りが全部始まっているなら、線はいちばん下です。 */
    return last;
  }

  function paintNow(sec, list, axis, isToday) {
    axis.textContent = "";
    /* いまの時刻は、描くたびに時計から読み直します。組み立てたときの値を
       持ち回ると、線が置かれた時刻のまま固まるので。 */
    const nowMin = isToday ? KN.plan.toMin(KN.util.nowTime()) : null;
    markPass(list, nowMin);
    if (nowMin == null) return;
    const y = nowY(sec, list, nowMin);
    if (y == null) return;
    axis.append(nowMark(nowMin, clearOfClocks(sec, list, y)));
  }

  /** いまの時刻を、用事の時刻とぶつからない高さへ逃がします。

      いまの時刻は塗りの境目に置きます。境目が丸薬の頭のすぐ近くに来ると
      ——15分の用事を始まって3分で見たとき、1時間の用事を26分で見たとき
      ——その用事の時刻の札と字が重なって、どちらも読めなくなります
      （「14:45」と「15:11」が重なりました）。

      **動かすのは、いまの時刻のほう**です。用事の時刻は丸薬の頭に付いて
      いて、そこを離れると何を指しているのか言えなくなります。いまの時刻の
      ほうは、境目そのものが色で見えているので、札は近くに居れば足ります。

      逃がす向きは、いま居るほう（上にいるなら上へ、下なら下へ）。 */
  const CLOCK_GAP = 17;                     // 字の高さ（16px前後）＋ひと呼吸

  function clearOfClocks(sec, list, y) {
    const top0 = sec.getBoundingClientRect().top;
    let out = y;
    for (const li of list.children) {
      const el = li.querySelector(".tl-time");
      if (!el || !el.textContent.trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) continue;
      const mid = r.top + r.height / 2 - top0;
      const d = out - mid;
      if (Math.abs(d) >= CLOCK_GAP) continue;
      out = mid + (d < 0 ? -CLOCK_GAP : CLOCK_GAP);
    }
    return out;
  }

  /* ---------------- 過ぎたぶんは、色。まだのぶんは、灰色 ----------------

     ここには「丸のまわりの輪」がありました（始まりからの割合を、円グラフの
     ように）。**やめました。** 丸薬が時間ぶん伸びるようになったので、
     どこまで来たかは**丸薬そのものの中**で言えます——上から色が下りてきて、
     下はまだ灰色。参考にした画面（Structured）がそうでした。輪は、伸びた
     丸薬のまわりに描くと形が合いませんし、同じことを二度言うことにも
     なります。

     数はひとつ（--pass：0＝まだ、1＝過ぎた）。丸薬の塗り・背骨の色・
     破線の色が、すべてこれから出ます。行ごとに 0〜1 で、その行の
     「始まり〜終わり」を時計がどこまで通ったかです。

     **今日を見ているときだけ**です。ほかの日には出しません——明日を
     開いたときに一日ぶんが灰色だと、これから組む画面として読めない。
     灰色が言っているのは「まだ来ていない」ではなく、**今日のうちで、
     まだ来ていない**なので。

     済ませたものは、いつでも色のままです（1 に留めます）。時計より
     手が先に進むことはあるので。

     30秒ごとに置き直します（軸と同じ拍）。組み直しはしません。 */
  function markPass(list, nowMin) {
    for (const li of list.children) {
      if (!li.classList) continue;
      const row = li.classList.contains("tl-row");
      if (!row && !li.classList.contains("tl-free-row")) continue;
      const a = Number(li.dataset.at), u = Number(li.dataset.until);
      const known = isFinite(a) && isFinite(u) && u > a;
      let pass;
      if (nowMin == null || !known || li.classList.contains("is-done")) pass = 1;
      else if (nowMin >= u) pass = 1;
      else if (nowMin <= a) pass = 0;
      else pass = (nowMin - a) / (u - a);
      li.style.setProperty("--pass", pass.toFixed(3));
      if (!row) continue;
      /* いま進んでいる一件。うすい地は残します——「いま目を向けるのは
         ここ」という合図で、塗りの境目とは別のことを言っているので。
         済ませたものには出しません。 */
      const live = nowMin != null && known && pass > 0 && pass < 1
        && !li.classList.contains("is-done");
      li.classList.toggle("is-live", live);
      if (live) li.setAttribute("aria-current", "time");
      else li.removeAttribute("aria-current");
    }
  }

  /* 「いま」は、黙っていると止まります。

     画面を組み直すのは、その日が変わったときと、やることの数が変わった
     ときだけです（app.js の onMinute）。つまり15時に開いたまま16時になっても、
     線は15時のところに居ます。**いまを指す線が、いまを指していない**のは、
     ただ無いより悪い——見た人はそれを信じるので。

     組み直しはしません。線だけ置き直せば足ります（行の高さは変わらない
     ので、置き場所は同じ折れ線から読めます）。組み直すと、読んでいる
     途中で行が動いたり、つまんでいるものが落ちたりします。 */
  const NOW_TICK = 30000;
  setInterval(() => {
    if (!root || document.hidden) return;
    /* 別のタブを見ているときは、測っても 0 しか返りません（消えている
       ので）。戻ってきたときは ResizeObserver が呼んでくれます。 */
    if (!root.offsetParent && root.offsetHeight === 0) return;
    if (tlDrag) return;                       // 運んでいる最中は触りません
    root.querySelectorAll(".tl-axis").forEach((el) => {
      if (typeof el.__paint === "function") el.__paint();
    });
  }, NOW_TICK);

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
      if (e.target.closest(".check, .fav, .tl-subs-chip")) return;
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

    /* 持ち上げた指の位置を控えます。**動かさずに離したら、何もしません**
       ——下の drop() を見ること。 */
    /* 落とし先の一覧。ふつうは掴んだのと同じ一覧ですが、**長期タスクから
       運ぶときだけは違います**——あの欄には空きの行が無いので、置き場は
       その日の時間割のほうにあります。日付も、その日のものになります
       （長期タスクはまだどの日のものでもないので）。 */
    const someday = list.classList.contains("tl-someday");
    const dayList = someday
      ? (root && root.querySelector(".todo-day .tl:not(.tl-someday)")) || list
      : list;
    const dayKey = someday ? shownDay() : day;

    tlDrag = { id, row, list, dayList, someday, day: dayKey, len,
               target: null, y0, moved: false };
    KN.motion.fire("reorder");
    row.classList.add("is-lifted");
    list.classList.add("is-dragging");
    // 落とし先が別の一覧なら、そちらにも印を付けます（軸を伏せる CSS のため）。
    if (dayList !== list) dayList.classList.add("is-dragging");
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
    dayList.querySelectorAll(".tl-free-row").forEach((fr) => {
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
      /* 「動かした」と言えるのは、狙いが変わるだけ動いてから。指は置いた
         ままでも数px揺れるので、その揺れで時刻が書き換わっては困ります。 */
      if (Math.abs(ev.clientY - tlDrag.y0) > DRAG_SLOP) tlDrag.moved = true;
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
    d.dayList.querySelectorAll(".is-aim").forEach((el) => el.classList.remove("is-aim"));
    if (els.cal) els.cal.querySelectorAll(".is-drop").forEach((el) => el.classList.remove("is-drop"));

    /* ---- 週の帯の日 ----

       ここが**日付を変える**道です。棚を縦に積んでいたころは、下の
       「9月1日」の棚まで運べば日が変わりました。一日ずつにしたので棚は
       もうありません。かわりに、上の帯の日へ持っていきます。

       上のほうを先に見ます。帯は行の上に重なっているので、あとに回すと
       「行と行のあいだ」が先に当たってしまいます。 */
    const cell = els.cal && [...els.cal.querySelectorAll(".cal-day")].find((c) => {
      const b = c.getBoundingClientRect();
      return b.width > 0 && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    });
    if (cell && cell.dataset.day) {
      cell.classList.add("is-drop");
      d.target = { kind: "day", day: cell.dataset.day };
      return;
    }

    /* 開いた帯の中にいるなら、指の高さがそのまま時刻です。 */
    for (const fr of d.dayList.querySelectorAll(".tl-free-row.is-open")) {
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
    /* 長期タスクの欄の中。**この欄の中でも、並べ替えられます**——
       落とし先は時間割だけではありません。行の上なら、その前後へ。
       行の無いところ（欄の余白）で離したなら、まだ何も言っていないので
       帰します。 */
    if (d.someday) {
      const b = d.list.getBoundingClientRect();
      if (y >= b.top && y <= b.bottom) {
        const mine = [...d.list.querySelectorAll(".tl-row")].filter((r) => r !== d.row);
        let before = null;
        for (const r of mine) {
          const rb = r.getBoundingClientRect();
          if (y < rb.top + rb.height / 2) { before = r; break; }
        }
        const anchor = before || mine[mine.length - 1] || null;
        if (!anchor) { d.target = null; return; }
        anchor.classList.add("is-aim");
        anchor.classList.toggle("is-aim-before", !!before);
        d.target = { kind: "someday-order", id: anchor.dataset.todoId, before: !!before };
        return;
      }
    }

    /* 用事と用事のあいだ。行の上半分なら前へ、下半分なら後ろへ。 */
    const rows = [...d.dayList.querySelectorAll(".tl-row")].filter((r) => r !== d.row);
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
    d.dayList.classList.remove("is-dragging");
    [d.list, d.dayList].forEach((L) => L.querySelectorAll(".is-aim").forEach((el) => {
      el.classList.remove("is-aim", "is-aim-before");
    }));
    /* 広げた空きは、閉じます。置いたあとに描き直される行もありますが、
       落とす先が無かったときは描き直されないので、ここで畳みます。 */
    d.dayList.querySelectorAll(".tl-free-row.is-open").forEach((fr) => {
      fr.classList.remove("is-open");
      fr.style.removeProperty("--band-h");
      const band = fr.querySelector(".tl-band");
      if (band) band.remove();
    });
    /* click は離した直後に来ます。来なかったぶんは、ここで片づけます
       ——置いたままだと、次にどこかを押したときに食べてしまいます。 */
    if (d.eatClick) setTimeout(() => d.list.removeEventListener("click", d.eatClick, true), 0);
    if (els.cal) els.cal.querySelectorAll(".is-drop").forEach((el) => el.classList.remove("is-drop"));
    const t = store.getTodo(d.id);
    if (!commit || !d.target || !t) { render(); return; }

    /* **持ち上げて、そのまま離した。** 何も言っていないので、何もしません。

       持ち上げると空きの行が開いて、指の下がその帯の中に入ります。だから
       動かしていなくても aim() は「その高さの時刻」を返します——11:00 の
       用事を持ち上げて置きなおしただけで 12:00 になっていたのは、これです。
       置き場が見えていることと、そこへ置くと言ったことは別なので、
       指が動いていなければ帰します。 */
    if (!d.moved) { render(); return; }

    /* 週の帯の日へ落とした。**日付を変えます。**

       時刻は持ったままにします——「16時の病院を明日へ」は、明日の16時の
       ことです。順番で置きなおしたときに時刻を手放すのとは、言っている
       ことが違います（あちらは「時計ではなくこの順で」と言い直したので）。 */
    if (d.target.kind === "day") {
      if (d.target.day === t.due) { render(); return; }
      const was = { due: t.due };
      store.updateTodo(d.id, { due: d.target.day });
      KN.motion.fire("save");
      KN.ui.toast(`「${t.title}」を ${formatDay(d.target.day)} へ`, {
        action: { label: "元に戻す", onClick: () => store.updateTodo(d.id, was) },
      });
      return;
    }

    if (d.target.kind === "time") {
      const at = KN.plan.toTime(d.target.at);
      // もとと同じ時刻・同じ日に落ちたなら、書き換えも報せも要りません。
      if (at === t.time && d.day === t.due) { render(); return; }
      const was = { time: t.time };
      store.updateTodo(d.id, { time: at, due: d.day });
      KN.motion.fire("save");
      KN.ui.toast(`「${t.title}」を ${at} に`, {
        action: { label: "元に戻す", onClick: () => store.updateTodo(d.id, was) },
      });
      return;
    }

    /* 長期タスクの欄の中で、並べ替えるだけ。**時刻もやる日も動きません**
       ——この欄の行はどちらも持っていないので、動かしようがないので。
       控えるのは、この欄の並び順だけです。 */
    if (d.target.kind === "someday-order") {
      const ids = [...d.list.querySelectorAll(".tl-row")]
        .map((r) => r.dataset.todoId).filter((x) => x && x !== d.id);
      const was = new Map();
      store.get().todos.forEach((x) => {
        if (x.id === d.id || ids.includes(x.id)) was.set(x.id, x.order);
      });
      const at = ids.indexOf(d.target.id);
      ids.splice(d.target.before ? Math.max(0, at) : at + 1, 0, d.id);
      store.update((s) => {
        ids.forEach((tid, i) => {
          const row = s.todos.find((x) => x.id === tid);
          if (row) row.order = i;
        });
      });
      KN.motion.fire("save");
      KN.ui.toast(`「${t.title}」を動かしました`, {
        action: {
          label: "元に戻す",
          onClick: () => store.update((s) => {
            was.forEach((ord, tid) => {
              const row = s.todos.find((x) => x.id === tid);
              if (row) row.order = ord;
            });
          }),
        },
      });
      return;
    }

    /* 順番で置きなおす。時刻は手放します。 */
    const ids = [...d.dayList.querySelectorAll(".tl-row")]
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

  /* 時間割の丸の色。**一覧の colorOf とは別の規則です。**

     一覧の色は「あとどれくらいで締切か」を言う坂で、済ませたものと
     繰り返すものはその坂に乗らないので灰色にしてあります。時間割は
     締切の話をしていません——その日をどう配ったか、の話です。だから
     ここでは全部その日の色で塗ります。

     済ませたものも色のまま残します（参考にした画面と同じ）。やった
     ことが灰色になって沈むと、朝からの半日が空白に見えるので。 */
  /* ---------------- 夜は、夜の色 ----------------

     一日ぶんは基調の塗りひとつで並べていました。参考にした画面（Structured）
     も昼のあいだはそうですが、**一日の終わりだけ青**にしてあります（実測。
     色は --c-night）。理屈も分かります——夕方から先は、同じ「やること」でも
     体感の色が違う。暗くなってからの一件が朝の一件と同じ色で並んでいると、
     一日が一本調子に見えます。

     夜と決めるのは二つ。**毎晩**（part: "dusk"）は、時刻を持っていても
     いなくても夜です。それ以外は**組み立てが置いた時刻**で見ます
     ——t.time ではなく置かれた位置で見るのは、時刻を決めていない用事も
     夜に落ちれば夜だからです。 */
  const NIGHT_FROM = 18 * 60;      // 18:00 から先

  function isNight(t, atMin) {
    if (t && t.part === "dusk") return true;
    const m = isFinite(atMin) ? Number(atMin) : KN.plan.toMin(t && t.time);
    return m != null && isFinite(m) && m >= NIGHT_FROM;
  }

  function tlColorOf(t, atMin) {
    /* 一日ずつのときは、棚がありません。坂（締切までの遠さ）も、比べる
       相手が画面に無いので何も言えません。基調の塗りひとつで揃えます
       ——夜のぶんを除いて。 */
    if (oneDay()) return isNight(t, atMin) ? "var(--c-night)" : "var(--c-primary-fill)";
    const g = groups.find((x) => x.id === groupIdOf(t, groups));
    return (g && g.color) || NONE_COLOR;
  }

  /** いま何時か。**時刻の字だけ**を、軸のいちばん前に置きます。

      点と、右へ流れる線がありました。外しました——色が過ぎたぶんと
      これからを分けるようになったので、「いま」は塗りの境目としてもう
      画面に出ています。そこへ点と線を重ねると、同じことを三度言うことに
      なります。残すのは、境目が**何時なのか**だけ（それは色では言えない）。
      参考にした画面も、ここは太字の時刻ひとつです。 */
  function nowMark(nowMin, y) {
    return node(html`
      <span class="tl-now" style="top:${y.toFixed(1)}px">
        <span class="tl-time is-now">${tlClock(KN.plan.toTime(nowMin))}</span>
      </span>
    `);
  }

  /* ---------------- 丸薬（アイコン周り）の高さ ----------------

     丸は**伸びます**。ここには「伸びません」と書いてありました——参考に
     した画面の**行**が時間に比例していない、という実測からです。それは
     いまも本当で、行はいまも比例しません（4時間の用事も25分の用事も、
     題と絵の段は同じ高さ）。

     比例するのは**丸のほう**でした。同じ画面をもう一度measureすると、
     15分の用事は真円、45分・1時間のものは縦に伸びた丸薬で、重なった二つは
     丸薬どうしがぶつかっています。つまりあの画面は「行は並び順、丸は時間」
     という二本立てです。行を伸ばさずに丸だけ伸ばすと、一日が一画面に
     入ったまま、長さが絵でも読めます。

     数の決めかた：
       ・30分までは真円（50px）。決めなかった長さの既定と同じ幅なので、
         ここを境にすると「長さを決めた人」のものだけが伸びます。
       ・そこから 1分 = 0.8px。1時間で74px、2時間で122px。
       ・170pxで頭打ち。半日の用事に半日ぶんの丸薬を描くと、それだけで
         一画面が埋まります。上限から先は、長さは題の下の字が言います。

     **長さを決めていない用事は、伸ばしません。** 組み立ては30分として
     置きますが、それは置き場所を決めるための仮の数で、画面に出すと
     決めた数のように読めます（題の下に「30分」と書かないのと同じ理由）。 */
  const TL_NODE_MIN  = 50;
  const TL_NODE_MAX  = 170;
  const TL_NODE_FREE = 30;
  const TL_NODE_RATE = 0.8;

  function nodeH(it) {
    const m = it && it.todo && Number(it.todo.minutes);
    if (!m || !isFinite(m)) return TL_NODE_MIN;
    return Math.round(Math.min(TL_NODE_MAX,
      TL_NODE_MIN + Math.max(0, m - TL_NODE_FREE) * TL_NODE_RATE));
  }

  /** 空いているところ。埋めずに、点線の帯だけで示します。

      「10時間44分」のような長さの文は出しません——空きの前後にある用事の
      時刻を見れば、どれだけ空いているかは読めます。文で重ねて言うのは
      説明のしすぎです（帯の広さ自体は、つまんで動かすときに見えます）。 */
  /* 空きの高さ。空いている量が、そのまま縦の長さになります——ただし
     用事ほど素直には伸ばしません。夜の10時間を10時間ぶんの点線で描くと、
     一日の大半が「何も無いところ」で埋まって、肝心の用事が画面の外へ
     出ていきます。空きは詰めて、用事は正直に。 */
  /* 空きの高さは、**長さによりません**。10分の隙間も一晩も同じ高さです。

     参考にした画面がそうだからです（610分と325分の空きが同じ高さで、
     しかも5分の用事より低い）。比例をやめると失うものはあります——一日の
     形が高さで読めなくなる。かわりに得るのは、**一日が一画面に入る**
     ことです。夜の10時間を10時間ぶん描くと、肝心の用事が画面の外へ
     出ていきます。あちらはその取り引きを、比例を捨てる側で決めています。

     56px → 36px。**破線がすでに「ここは離れている」と言っています。**
     同じことを高さでも言っていたぶんを、一つに戻しました。 */
  const TL_FREE_H = 36;

  /* 空きの線を、実線にするか点線にするか。

     **30分以内の空きは、繋がっています。** 用事と用事のあいだの十分や
     そこらは「途切れ」ではなく、ひと続きの時間のなかの余白です。そこを
     点線で切ると、続けてやる二件が別々の塊に見えます。30分より空いたら、
     そこはもう別の時間なので点線。 */
  const TL_JOIN_GAP = 30;

  function freeRow(f, nowMin) {
    const past = nowMin != null && f.untilMin <= nowMin;
    const dash = f.minutes > TL_JOIN_GAP;
    /* 空きも、夜に入ったところから夜の色にします。線は一日を通す一本な
       ので、空きだけ昼の色のままだと、夜の用事のあいだで色が切れて
       「別の線」に見えます。切り替わるのは、その空きが**夜に入る**
       ところ（18時をまたぐ空きは、夜のぶんが半分でも夜側で数えます
       ——点線のなかで色を変えると、そこに何かがあるように見えるので）。 */
    const night = f.untilMin > NIGHT_FROM;
    return node(html`
      <li class="tl-free-row ${past ? "is-past" : ""}"
          data-at="${String(f.atMin)}" data-until="${String(f.untilMin)}"
          style="--cat:${night ? "var(--c-night)" : "var(--c-primary-fill)"}">
        <span class="tl-time"></span>
        <span class="tl-rail ${dash ? "is-dash" : ""}"></span>
      </li>
    `);
  }

  /* 丸の高さは nodeH（上）が決めます。長さを決めた用事だけが伸びて、
     行そのものは伸びません——伸びるのは丸のほうだけ、というのが参考画面の
     作りでした。 */

  /** 一つの用事。丸薬のアイコンが線の上に乗り、右に印を付ける丸。 */
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
    const sc = store.subCount(t);
    const subsOpen = openSubs.has(t.id);
    /* 手順は、事実の行に**丸薬**で出します。前は行の下に「手順をひらく」
       という文のボタンを置いていましたが、参考にした画面はここに
       `☑ 2/5 ⌄` の一粒を置いていて、そのぶん一段ぶんの高さが浮きます。
       数（いくつ済んだか）と入口が、一粒で同時に言えるので。 */
    if (sc.total && !t.trace) {
      facts.push(html`
        <button type="button" class="tl-subs-chip" aria-expanded="${String(subsOpen)}"
                aria-label="${t.title} の手順を${subsOpen ? "たたむ" : "ひらく"}">
          <span class="tl-subs-box">${icon("check")}</span>
          <span class="tl-subs-n">${sc.done}/${sc.total}</span>
          <span class="tl-subs-arrow">${icon("chevron")}</span>
        </button>
      `);
    }
    if (t.shop) {
      const n = store.tripCount();
      if (n) facts.push(html`<span class="tl-shop">★${n}つ</span>`);
    }
    if (t.minutes) facts.push(html`<span class="tl-len">${KN.plan.humanSpan(it.minutes)}</span>`);
    if (it.clash) facts.push(html`<span class="tl-clash">前と重なっています</span>`);
    const closed = t.done || t.archived;
    const li = node(html`
      <li class="tl-row ${joined ? "is-joined" : ""} ${it.clash ? "is-clash" : ""}
                 ${closed ? "is-done" : ""}"
          data-todo-id="${t.id}" data-flip="${t.id}"
          data-at="${String(it.atMin)}" data-until="${String(it.untilMin)}"
          style="--cat:${tlColorOf(t, it.atMin)};--tl-h:${nodeH(it)}px">
        <span class="tl-time ${it.fixed ? "is-fixed" : ""}">${tlClock(it.at)}</span>
        <span class="tl-rail"><span class="tl-node">${todoMark(t)}</span></span>
        ${/* 上から、前置き・題・事実。参考にした画面と同じ順です。

              前置き（メモ）が上にあるのは、それが**題を読むための文脈**
              だからです（「忘れたくないことだから ／ 「あとで」を使ってみよう」）。
              事実（長さ・時刻あり・繰り返し）は下——題を読んだあとで
              十分なので。前は長さを題の上に置いていましたが、いちばん
              大きく読ませたいものの上に、数字が乗っていました。 */""}
        <div class="item todo tl-item ${t.done ? "is-checked" : ""}">
          ${/* 事実の行を、題を押す button の**外**へ出しました。手順の丸薬が
                押せるものになったからです——button の中に button は置けず、
                置いても browser が黙って捨てます。入れものは block のまま
                （下の CSS の但し書き：行数を絞る要素を抱える入れものを
                flex にすると、-webkit-line-clamp が高さ0に畳みます）。 */""}
          <div class="tl-body">
            <button class="tl-open" type="button">
              ${t.memo ? html`<span class="tl-cap">${t.memo}</span>` : ""}
              <span class="item-name">${t.title}</span>
            </button>
            ${/* 決めていない長さは**書きません**。組み立てには30分として
                  使いますが、画面に「30分」と出すとそれが決めた数のように
                  読めますし、決めていない行にまで一段増えて、丸と題が
                  中心線からずれる原因にもなっていました。
                  facts が空になる行では、この帯ごと出しません。 */""}
            ${facts.length ? html`<span class="tl-facts">${facts}</span>` : ""}
          </div>
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
    li.querySelector(".tl-open").addEventListener("click", () => openSheet(t.id));
    /* 絵（レールの丸）も、押せば詳細が開きます。行の中で絵だけが「押しても
       何も起きないところ」でした——見た目には題と同じ一つの行なので、
       どちらを押しても同じ場所へ行くのが素直です。

       運んだ指が離れぎわに起こす click は、lift() の eatClick が食べるので、
       ここには来ません（置きなおすたびに詳細が開くことはありません）。 */
    const rail = li.querySelector(".tl-rail");
    if (rail) rail.addEventListener("click", () => openSheet(t.id));
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
      const wrap = node(html`
        <div class="tl-sub-wrap ${subsOpen ? "is-open" : ""}">
          <ul class="tl-sub-list" ${subsOpen ? "" : KN.util.raw("hidden")}></ul>
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

          /* 手順を全部終えたら、そのタスクも終わりにします。押した丸を
             確かめるほうが、押す前の s.done を見るより確かです——ここは
             toggleSub のあとなので、subs はもう書き換わっています。 */
          const fresh = store.getTodo(t.id);
          const done = store.subCount(fresh);
          if (done.total && done.done === done.total && !fresh.done) {
            const mainCheck = li.querySelector(".tl-item > .check");
            if (mainCheck) tick(t.id, mainCheck);
          }
        });
        list.append(line);
      });
      /* ひらく・たたむは、**その場で**やります。

         前はここで render() を呼んで、画面ぜんぶを組み直していました。
         組み直すと一瞬で入れ替わるので、手順が「出てきた」のか「もとから
         あった」のかが分かりません。読んでいた位置も、開閉のたびに
         測り直しになります。高さを動かすだけなら、行はその場に残ります。 */
      const chip = li.querySelector(".tl-subs-chip");
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = !openSubs.has(t.id);
        if (open) openSubs.add(t.id); else openSubs.delete(t.id);
        KN.motion.fire("select", chip);
        chip.setAttribute("aria-expanded", String(open));
        chip.setAttribute("aria-label", `${t.title} の手順を${open ? "たたむ" : "ひらく"}`);
        slideSubs(wrap, open);
      });
      li.append(wrap);
    }
    return li;
  }

  /** 手順の段を、高さで開け閉めします。

      height を auto のままでは動かせないので、実測した高さまで動かして、
      着いたら auto に戻します（戻さないと、あとで手順が増えたときに
      古い高さで切れます）。動きを減らす設定の人には、瞬時に。 */
  function slideSubs(wrap, open) {
    const list = wrap.querySelector(".tl-sub-list");
    if (!list) return;
    wrap.classList.toggle("is-open", open);
    const clear = () => {
      list.style.height = "";
      list.style.overflow = "";
      list.style.transition = "";
    };
    if (KN.motion.still()) {
      clear();
      list.hidden = !open;
      return;
    }
    const dur = KN.motion.ms(open ? "--m-sheet-open" : "--m-sheet-close");
    if (open) list.hidden = false;
    const h = list.scrollHeight;
    list.style.overflow = "hidden";
    list.style.height = (open ? 0 : h) + "px";
    /* 一枚待ってから動かします。同じフレームで from と to を書くと、
       ブラウザは to しか見ません（動かずに飛びます）。 */
    requestAnimationFrame(() => {
      list.style.transition = `height ${dur}ms var(--ease-${open ? "out" : "in"})`;
      list.style.height = (open ? h : 0) + "px";
    });
    setTimeout(() => {
      clear();
      if (!open) list.hidden = true;
    }, dur + 40);
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
