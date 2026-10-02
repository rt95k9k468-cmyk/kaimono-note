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
  /* 暦の厚みを測り直す。mount が中身を入れます（render から呼びます）。 */
  let fitCalH = () => {};
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
     （part: "dawn"/"dusk"）も、それを見ている並べ替え・plan.js も
     手を付けていません——選べなくなるだけで、あるものは動きません。
     作り替えが要るなら、勝手にやらずに先に相談すること。 */
  const REPEATS = [
    { id: null,      label: "なし" },
    { id: "daily",   label: "毎日" },
    { id: "weekly",  label: "毎週" },
    { id: "monthly", label: "毎月" },
    /* 暦ではなく、済ませた日から数える（R6）。「14日ごと（済ませた日から）」。 */
    { id: "after",   label: "済ませてから" },
  ];
  /* 「済ませてから◯日」の◯の早見。これ以外は −／＋ で。 */
  const EVERY_PICKS = [3, 7, 10, 14, 30, 60, 90];
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
    if (t.repeat === "after") return `${t.repeatEvery || 7}日ごと`;
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
    if (t.repeat === "after") return `済ませてから${t.repeatEvery || 7}日ごと`;
    if (t.repeat === "weekly") {
      // 表示だけ月曜はじまりに揃えます（保存している repeatDays の並びは
      // 変えません——曜日チップの並びと同じ理由です）。
      const d = (t.repeatDays || []).slice()
        .sort((a, b) => KN.util.WEEKDAY_COLS.indexOf(a) - KN.util.WEEKDAY_COLS.indexOf(b));
      return d.length ? `毎週 ${d.map((n) => WD[n]).join("・")}` : "毎週";
    }
    const n = t.repeatNth;
    if (!n) return "毎月";
    return n.nth === -1 ? `毎月 最終${WD[n.weekday]}` : `毎月 第${n.nth}${WD[n.weekday]}`;
  }

  /* ---------------- mount ---------------- */

  /** 上の帯（全タブで一つ）の持ち主が、いまこの画面か（js/head.js）。 */
  function mine() { return KN.head.mine("todo"); }

  function mount(el) {
    root = el;
    root.innerHTML = "";

    /* 上の帯（題・今日へ戻る・さがす・設定）と暦は、この画面の外——全タブで
       一つの帯（js/head.js）に居ます。タブを移っても帯が 1px も動かないのは、
       帯がタブの流れの外に居るからです（docs/shared-header.md）。ここに残るのは
       帯より下：探す窓（暦の下に開く）、期限切れの札、紙。

       題の形と書式は KN.util が持ちます（daily・ダイエットと同じひと組）。
       右上は**二つだけ**——さがす と 設定。並べ方と暦の出し入れは設定の中。 */
    const chrome = node(html`
      <div class="stack">
        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="やることを探す" aria-label="やることを探す"
                   autocomplete="off" spellcheck="false">
            <button class="icon-btn js-search-clear" aria-label="検索をクリア"
                    style="width:28px;height:28px" hidden>${icon("close")}</button>
          </div>
        </div>

        <div class="js-late"></div>
        <div class="js-body"></div>
      </div>
    `);

    root.append(chrome);

    const head = KN.head.els;
    els = {
      searchBtn: head.searchBtn,
      screen:     root,
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search:    chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
      body:      chrome.querySelector(".js-body"),
      late:      chrome.querySelector(".js-late"),
      mine,
    };

    KN.ui.wireSearch(els, () => renderBody(), (q) => { query = q; });

    /* 暦を出すか、しまうか。**題の右**に置きます——暦そのものの中に
       ボタンを置くと、しまった先にボタンごと消えて戻れなくなります。
       しまっているあいだは、同じ暦に斜線の入った絵に変わります。 */
    /* 題を押すと、暦が月ぜんぶに開きます（参考画面の「›」と同じ役目）。
       週の帯の右にあった「週」の札と同じ切り替えなので、そちらは外して
       こちらに寄せました——同じことを二か所に置かないために。 */
    /* 題を押すと、暦が月ぜんぶに開きます（参考画面の「›」と同じ役目）。
       題は上のバーにいるので、結ぶのは組み立てのとき一度きりです
       ——暦は描き直されますが、バーは残るので。 */
    els.dayRow = head.dayRow;
    els.dayTitle = head.dayTitle;
    els.dayTitle.addEventListener("click", () => {
      if (!mine()) return;               // 帯は一つ。応えるのは持ち主だけ
      haptic();
      store.setCalPref("todo", { open: !calOpen() });
    });
    /* 題の右の「今日へ戻る」。一日ずつの紙なら日を入れ替え、一覧で見て
       いるときは今日の棚まで運びます（暦の送りと同じ二通り）。今日を見て
       いるあいだは `paintDayTitleInto` が押せなくしています。 */
    head.today.addEventListener("click", () => {
      if (!mine()) return;
      haptic();
      const today = todayKey();
      const d = KN.util.dayDate(today);
      setCalMonth(d.getFullYear(), d.getMonth(), true);
      if (oneDay()) { goDay(today, -1); return; }
      markDay(today, true);
      jumpToDay(today);
    });
    /* 暦の厚み。**掴み手はこのぶんだけ下に貼りつきます**——暦もバーも
       sticky で上に居るので、数えないと掴み手がその裏へ潜ります
       （実際そうなっていて、暦を出しているあいだだけ掴み手が消えていた）。

       暦は組み直しのたびに**別の要素**になるので、そのつど引き直して、
       見張る相手も付け替えます。書くのは変わったときだけ——書くたびに
       ResizeObserver が鳴ると、輪になります。 */
    let calRO = null, calSeen = null, calH = -1;
    fitCalH = () => {
      /* 暦は帯（画面の外）に居るので、根っこから探さずに持っている一枚を。 */
      const c = els.cal;
      /* **引いているあいだは測りません。** 紙を引くと暦は月ぜんぶの姿で
         留められる（cal-peek の begin）ので、そのまま測ると床が月の高さに
         なり、掴み手だけが暦の中へ食い込みます。床は始めた段のままでよく、
         紙の transform が一緒に運んでくれます。 */
      if (c && (c.classList.contains("is-peek") || c.classList.contains("is-settling"))) return;
      const h = c && !c.classList.contains("is-hidden")
        ? Math.round(c.getBoundingClientRect().height) : 0;
      if (h !== calH) { calH = h; root.style.setProperty("--cal-h", h + "px"); }
      if (c !== calSeen && window.ResizeObserver) {
        if (calRO) calRO.disconnect();
        calSeen = c;
        if (c) { calRO = new ResizeObserver(() => fitCalH()); calRO.observe(c); }
      }
    };
    fitCalH();
    window.addEventListener("resize", () => fitCalH());

    /* 手でめくった月の留めを外す合図。指が触ったこと、そのものです。 */
    root.addEventListener("pointerdown", unpinOnTouch, { passive: true, capture: true });
    root.addEventListener("wheel", unpinOnTouch, { passive: true, capture: true });

    /* 帯と暦の「貼りついた」印（is-stuck・境目の線）は、もう付けません。
       帯は画面の外に居て、送られることがないので——付けると、送った画面と
       送っていない画面のあいだで線が出たり消えたりして、全タブで一つの帯が
       タブごとに違う顔をします。 */
    let lastTop = 0;
    const sc0 = KN.app.scrollerOf(root);
    sc0.addEventListener("scroll", () => {
      const top = sc0.scrollTop;

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
    if (root) KN.util.setVar(root, "--cal-p", open ? "1" : "0");
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

  /** 画面の題に、いま見ている日を書きます（書式は KN.util が持ちます）。 */
  function paintDayTitle() {
    // 帯は全タブで一つ。持ち主でないときに塗ると、よそのタブの題を上書きします。
    if (!els.dayRow || !mine()) return;
    const key = titleDay();
    KN.util.paintDayTitleInto(els.dayRow, key,
      `押すと暦を${calOpen() ? "たたむ" : "ひらく"}`);
    els.dayTitle.setAttribute("aria-expanded", String(calOpen()));
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
  /* **置き場所を測るのは、一拍あと。**

     輪の居場所は、そのマスを測らないと決まりません。ところがここは
     組み立ての**途中**から呼ばれるので、測った瞬間にブラウザは画面ぜんぶの
     レイアウトをやり直します——実測（CPU 4倍）で、この二行が
     **組み直し 1回の 46%**（32ms のうち 14.6ms）を占めていました。

     一拍おけば、ブラウザがどのみち一度やるレイアウトに相乗りできます。
     **絵は変わりません**——`.cal-ring` は `is-on` が付くまで透明なので、
     その一拍のあいだ輪は出ていない（前の場所に出たままにはならない）。
     組み直した直後は跳ばせる決めごとなので、一拍あとに跳んでも同じです。
     日を押して滑らせる場合も、transform が変わるのは一拍あとというだけで、
     滑り自体はそこから始まります。 */
  let ringAt = 0, ringWant = null;

  function moveRing(grid, cell, jump) {
    if (!grid) return;
    let ring = grid.querySelector(".cal-ring");
    if (!ring) {
      ring = node(html`<i class="cal-ring is-jump" aria-hidden="true"></i>`);
      grid.prepend(ring);
    }
    if (!cell) { ring.classList.remove("is-on"); ringWant = null; return; }
    ringWant = { grid, ring, cell, jump: !!jump };
    if (ringAt) return;                            // すでに一拍ぶん待っている
    ringAt = requestAnimationFrame(() => { ringAt = 0; placeRing(); });
  }

  function placeRing() {
    const w = ringWant;
    ringWant = null;
    if (!w) return;
    /* 待っているあいだに組み直されていたら、その盤はもう画面にいません。
       新しい盤のぶんは、そちらの `paintHere` があらためて頼みます。 */
    if (!w.grid.isConnected || !w.cell.isConnected || !w.ring.isConnected) return;
    const n = w.cell.querySelector(".cal-n");
    if (!n) return;
    const g = w.grid.getBoundingClientRect();
    const b = n.getBoundingClientRect();
    if (!g.width || !b.width) return;              // まだ並んでいない
    const first = !w.ring.classList.contains("is-on");
    w.ring.classList.toggle("is-jump", w.jump || first);
    w.ring.style.transform =
      `translate(${(b.left - g.left).toFixed(1)}px, ${(b.top - g.top).toFixed(1)}px)`;
    w.ring.classList.add("is-on");
    if (w.jump || first) {
      // 次からは滑らせます（描き直した直後の一回だけ跳ばせたいので）。
      const ring = w.ring;
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
  /* from … 押した行の丸薬（`.tl-node`）。渡すと、それが紙の頭の丸薬へ
     伸びていきます（ui.js の morphPill）。 */
  function openSheet(todoId, from) {
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
    // 「済ませてから◯日」の◯。ほかの種類のあいだも覚えておく（選び直したとき用）。
    let repeatEvery = editing && t.repeatEvery ? t.repeatEvery : 7;
    let flagged = editing ? !!t.flagged : false;
    let minutes = editing ? (t.minutes || null) : null;
    // 出る時刻の「前に◯分」（段7）。時刻を決めたときだけ欄が出る。
    let lead = editing ? (t.lead || null) : null;
    /* くり返しの用事の、いつもの長さ（段4。済ませた記録から引く。言えなければ null）。
       黙って minutes に入れはしません——決めるのは本人なので、札を一つ足すだけ。 */
    const usual = editing ? store.usualMinutes(t) : null;
    let iconKey = editing ? (t.icon || null) : null;
    let deadline = editing ? (t.deadline || null) : null;
    /* この紙で題に手が入ったか。**打った字から日付や時刻を読むのは、
       手が入ったときだけ**です（下の「打った字から『いつ』を読む」）。
       ここに置くのは、組み立ての途中（paintRows → paintHeroFacts）から
       読まれるから——下に let で書くと、そこで TDZ で落ちます。 */
    let titleTouched = !editing;
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
          <button type="button" class="d-row js-row-repeat">
            <span class="d-ico">${icon("repeat")}</span>
            <span class="d-label js-repeat-label"></span>
            <span class="d-value js-repeat-value"></span>
            <span class="d-go">${icon("chevron")}</span>
          </button>
        </div>

        ${/* 通知とカレンダーは「いつ」の枠から離します（2026年10月2日）。 */""}
        <div class="d-card">
          <button type="button" class="d-row js-row-notify">
            <span class="d-ico">${icon("bell")}</span>
            <span class="d-label js-notify-label"></span>
            <span class="d-value js-notify-value"></span>
            <span class="d-go">${icon("chevron")}</span>
          </button>
          ${/* 端末のカレンダーへ（D3。js/ics.js）。前は頭の「⋯」の中でしたが、
                利用者の希望で決めごとの並びへ——「いつ」の札のすぐ下に居れば、
                日付と時刻を決めたその場で押せます。 */""}
          <button type="button" class="d-row js-row-cal">
            <span class="d-ico">${icon("upload")}</span>
            <span class="d-label js-cal-label"></span>
            <span class="d-value js-cal-value"></span>
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

    /* 時刻の紙（2026年10月2日）。時刻・時間・期限を一枚に。
         車輪 … 時と、5分きざみの分。
         時間 … かかる長さの札（前は別の紙）。
         期限 … 「なし／あり」を訊き、ありなら日付を一行で。普段は使わないので畳んでおく。 */
    const pickTime = node(html`
      <div class="stack" style="gap:12px">
        <div class="tw-head">
          <span class="tw-note js-span-note"></span>
          <button type="button" class="chip js-time-set">時刻を決める</button>
          <button type="button" class="chip js-time-clear" hidden>はずす</button>
        </div>
        <div class="note-wheels tw js-time-wheels"></div>
        <div class="field">
          <span class="field-label">時間</span>
          <div class="js-mins"></div>
        </div>
        <div class="tw-limit">
          <span class="field-label">期限</span>
          <div class="chip-row js-limit-yn"></div>
          <span class="date-cell js-limit-cell" hidden>
            <input class="input js-limit" type="date" aria-label="期限を選ぶ">
          </span>
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
          ${/* 粒そのものが「絵を選ぶ」ボタンです。前は左下にパレットの丸を
                掛けていましたが、紙が開き終えてから上に乗ってくるように見えて
                いました（C2 の手直し）。 */""}
          <button type="button" class="hero-node js-hero-node js-icon-pick"
                  aria-label="絵を選ぶ"></button>
        </span>
        <span class="hero-text">
          <span class="hero-cap js-hero-when"></span>
          ${/* 一行の textarea です（R1）。input は貼りつけた改行を黙って消すので、
                「牛乳を買う⏎銀行」が「牛乳を買う銀行」という一件になります。
                Enter は下で止めてあるので、打って改行はできません——改行が
                入るのは貼りつけたときだけ。wrap="off" で、一行のあいだは
                input と同じく横へ流れます。 */""}
          <textarea class="hero-title js-title" rows="1" wrap="off" placeholder="例：ゴミ出し・電球を替える"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 aria-label="やること">${editing ? t.title : ""}</textarea>
          <span class="hero-facts js-hero-facts"></span>
          <button type="button" class="dest-chip js-dest" hidden></button>
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
        onPick: () => {
          const src = store.getTodo(todoId);
          if (!src) return;
          const made = store.addTodo({
            title: `${src.title}(コピー)`,
            due: src.due, deadline: src.deadline, part: src.part, time: src.time,
            repeat: src.repeat, repeatDays: src.repeatDays, repeatNth: src.repeatNth,
            repeatEvery: src.repeatEvery, memo: src.memo, flagged: src.flagged, minutes: src.minutes,
            lead: src.lead, shop: src.shop, icon: src.icon,
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
      /* back … 閉じるときの帰り先。保存で時間割が組み直されると行は別の
         要素になるので、要素ではなく**引き方**を渡します（出ている画面に
         絞って、id から）。 */
      morph: editing && from ? {
        from, to: hero.querySelector(".js-hero-node"),
        back: () => document.querySelector(
          `.screen.is-active .tl-row[data-todo-id="${CSS.escape(todoId)}"] .tl-node`),
      } : null,
      menu: heroMenu,
      content: body,
      footer: foot,
      /* 書きかけのまま閉じようとしたら、一度だけ聞きます。 */
      guard: true,
    });

    /* メモは打った量ぶん伸びます（screen-diet.js の食事メモと同じ仕組み）。
       固定の高さに収めず全文を出し、はみ出た先は紙そのもの（.sheet-body）が
       スクロールして受けます。紙に置かれるまでは scrollHeight が 0 のまま
       なので、一度だけ測り直します。 */
    function growMemo(ta, retry) {
      if (!ta.isConnected || !ta.scrollHeight) {
        if (retry) return;
        requestAnimationFrame(() => growMemo(ta, true));
        return;
      }
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
    const memoEl = body.pick(".js-memo");
    if (memoEl) {
      growMemo(memoEl);
      memoEl.addEventListener("input", () => growMemo(memoEl));
    }

    /* 題を打ち替えたら、頭の題もついていきます。保存する前から同じものを
       指していないと、頭が「さっきのもの」を見せたままになります。 */

    /* ---- 頭の、題の上と下 ----

       上は「いつのことか」（日付と時刻）、下は印（★・くりかえし・手順の数）。
       参考にした画面と同じ並びです。 */
    function paintHeroFacts() {
      /* 打ちかけの字から日付や時刻が読めているなら、**そうなる姿**を先に
         出します（点線つき。下の whenPeek）。欄へ移るのは題の欄から離れた
         ときですが、そこまで何も出さないと、読めているのかどうかが
         分かりません。 */
      const peek = whenPeek();
      const cap = hero.querySelector(".js-hero-when");
      const capDay = (peek && peek.due) || due;
      const capAt = (peek && peek.time) || time;
      cap.classList.toggle("is-peek", !!peek);
      /* 「明日まで レポート」のように、読めたのが期限だけのときは、
         `due` の欄（「日付なし」）はそのまま——期限は別欄なので、
         そちらの姿を借りると「やる日が明日になった」と誤解させます。
         かわりに「◯◯まで」とだけ言います（新しい札は置かない決めごと
         なので、この一行が兼ねます）。 */
      if (peek && peek.deadline && !peek.due) {
        cap.textContent = `${formatDay(peek.deadline)}まで`;
      } else {
        cap.textContent =
          [capDay ? formatDay(capDay) : "日付なし", capAt ? tlClock(capAt) : ""].filter(Boolean).join("　");
      }
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
    let pickHandle = null;
    function openPick(title, el) {
      el.hidden = false;
      pickHandle = KN.ui.sheet({ title, content: el });
    }
    /* 札（今日・明日・18:00・空き）を押して決めたら、その紙は閉じます。
       決めたあとにもう一度「閉じる」を押させるのは、一回ぶん余計です。
       札が点くのを一拍見せてから閉じます（押したものが効いたと分かるように）。
       車輪・±15分では閉じません——そちらは何度か触って合わせるものなので。 */
    function closePick() {
      const h = pickHandle;
      pickHandle = null;
      if (h) setTimeout(() => h.close(), KN.motion.ms("--m-state"));
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
        const full = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
        row(".js-row-due", full, near);
      } else {
        row(".js-row-due", "日付なし", "");
      }
      /* 時刻と時間と期限は一つの札（2026年10月2日）。左が時刻、右が長さ。
         終わりの時刻は、長さを決めていなくても組み立てと同じ長さ（いつもの長さ → 30分）で。 */
      const len = minutes || usual || KN.plan.DEFAULT_MINUTES;
      let dl = "";
      if (deadline) {
        const d = KN.util.dayDate(deadline);
        dl = `　${d.getMonth() + 1}/${d.getDate()}まで`;
      }
      row(".js-row-time", time ? `${tlClock(time)} 〜 ${tlClock(KN.plan.toTime(KN.plan.toMin(time) + len))}` : "時刻なし",
          KN.plan.humanSpan(len) + (minutes ? "" : usual ? "（いつもの長さ）" : "") + dl);
      const rid = isBookend(part) ? part : (repeat || "");
      const rw = (REPEATS.find((r) => (r.id || "") === rid) || {}).label;
      // 表示だけ月曜はじまりに揃えます（曜日チップ・repeatText と同じ並び。
      // 保存している repeatDays の並びそのものは変えません）。
      const orderedRepeatDays = repeatDays.slice()
        .sort((a, b) => KN.util.WEEKDAY_COLS.indexOf(a) - KN.util.WEEKDAY_COLS.indexOf(b));
      row(".js-row-repeat", rid ? rw : "くりかえさない",
          repeat === "weekly" && repeatDays.length
            ? orderedRepeatDays.map((d) => WD[d]).join("・")
            : repeat === "after" ? `${repeatEvery}日ごと` : "");
      const nt = KN.notify;
      const on = !!(nt && nt.supported() && nt.enabled() && !nt.blocked());
      row(".js-row-notify", time ? "時刻に知らせる" : "時刻を決めると知らせます",
          time ? (on ? "オン" : "オフ") : "");
      body.querySelector(".js-row-notify").disabled = !time;
      /* 日付が無ければ期限の日に、終日で。どちらも無ければ押せません。 */
      row(".js-row-cal", due || deadline ? "カレンダーに入れる" : "日付を決めるとカレンダーに入れられます",
          !due && deadline ? "期限の日に" : "");
      body.querySelector(".js-row-cal").disabled = !(due || deadline);
      paintHeroFacts();
    }
    body.querySelector(".js-row-due").addEventListener("click", () => openPick("日付", pickDue));
    body.querySelector(".js-row-time").addEventListener("click", () => {
      openPick("時刻", pickTime);
      /* 車輪は紙が組まれてから合わせる（組む前は高さが無い）。 */
      syncWheels(); requestAnimationFrame(syncWheels);
    });
    body.querySelector(".js-row-repeat").addEventListener("click", () => openPick("くりかえし", pickRepeat));
    body.querySelector(".js-row-notify").addEventListener("click", () => {
      const nt = KN.notify;
      if (!nt || !nt.supported()) { KN.ui.toast("この端末では知らせられません"); return; }
      if (nt.blocked()) { KN.ui.toast("端末の設定で、通知が止められています"); return; }
      haptic();
      if (nt.enabled()) { nt.disable(); paintRows(); KN.ui.toast("お知らせを止めました"); return; }
      nt.enable().then(() => { paintRows(); }).catch(() => {});
    });
    /* 渡すのは**この紙にいま出ている中身**——保存する前に直した日付や題も、
       見えているとおりに入ります。くり返しは次の一回ぶんだけ（くり返しの
       決まりまで写すと、アプリの「第2火曜」「平日」などと端末の読み方が
       ずれた日に、二か所で違う日に立ちます）。 */
    body.querySelector(".js-row-cal").addEventListener("click", () => {
      const day = due || deadline;
      if (!KN.ics || !KN.util.dayDate(day)) return;
      const name = titleEl.value.trim() || (t && t.title) || "";
      if (!name) { KN.ui.toast("題を書くと、カレンダーに入れられます"); return; }
      haptic();
      const memoBox = body.querySelector(".js-memo");
      KN.ics.send({
        uid: `${todoId || "new-" + Date.now()}-${day}@kurashi-note`,
        title: due ? name : `${name}（期限）`,
        memo: memoBox ? memoBox.value : (t && t.memo) || "",
        day,
        time: due ? time : null,
        minutes,
      });
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
          closePick();
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
      const len = minutes || usual || P.DEFAULT_MINUTES;
      const until = P.toTime(at + len);
      const guess = minutes ? ""
        : usual ? "（いつもの長さ）"
        : "（仮に30分）";
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
          hintEl.textContent = `${time}にお知らせします`;
          return;
        }
        if (nt && nt.supported() && !nt.enabled()) {
          const b = node(html`
            <span>知らせるには
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
          ? "毎日、いちばん上に出ます"
          : "毎日、いちばん下に出ます";
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
    const timeClear = body.pick(".js-time-clear");
    const timeSet = body.pick(".js-time-set");

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
      /* いつもの長さが言えるなら、「決めない」の次に「いつもの25分」。
         同じ長さの札があれば、そちらをこの札に置き換えます（同じ答えが二つ並ぶので）。 */
      /* いつもの長さが無ければ、標準は30分（組み立てが使う長さと同じ）。
         「決めない」の札は置かず、30分の札が選ばれた姿で見せます——決めて
         いないときに並ぶ長さを、そのまま言うほうが伝わるので。保存は押すまで
         しません（null のまま。組み立ては30分として扱います）。 */
      const own = usual ? [{ id: String(usual), label: `いつもの${KN.plan.humanSpan(usual)}` }] : [];
      const none = usual ? [{ id: "", label: "決めない" }] : [];
      KN.ui.chipRow(minsHost, none.concat(own,
        MINS.filter((m) => m !== usual).map((m) => ({ id: String(m), label: KN.plan.humanSpan(m) }))
      ), {
        activeId: minutes ? String(minutes) : usual ? "" : String(KN.plan.DEFAULT_MINUTES),
        onPick: (id) => {
          minutes = id ? Number(id) : null;
          KN.motion.fire("select");
          paintMins();
          paintSpanNote();   // 終わりの時刻は、長さでも変わります
          paintRows();
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
            ${/* 掴み手（四本線）。押した瞬間から運べます——長押しを待つ
                  作りにはできません。ここは字を書く欄が並んでいる段で、
                  欄の上で指を止めるのは「文字の位置を決める」手つきだから
                  です。掴むための場所を別に置いたぶん、待たせる理由も
                  無くなりました。 */""}
            <span class="sub-grip js-sub-grip" aria-hidden="true">${icon("grip")}</span>
            <input class="input js-sub" value="${s.title}" placeholder="例：顔を洗う"
                   aria-label="${i + 1}つめの手順" autocomplete="off">
            <button type="button" class="icon-btn js-sub-del"
                    aria-label="この手順を消す">${icon("close")}</button>
          </div>
        `);
        const field = line.querySelector(".js-sub");
        field.addEventListener("input", () => {
          subs[i].title = field.value;
          /* 運んでいるあいだの控え（reorder.js の ghost）は cloneNode で
             作るので、打った字は **value 属性**にも書いておきます
             ——属性を更新しないと、控えだけが打つ前の字を出します。 */
          field.setAttribute("value", field.value);
        });
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
      paintSplit();       // 手順が入った紙は分けない（R1）。ボタンの字もそれに合わせる
    }
    /* 手順の並べ替え。掴み手からだけ、押した瞬間に持ち上がります。
       運び終わったら控えの配列を並べ替えて、そのまま描き直します
       ——保存はシートの「保存」が引き受けるので、ここでは store に
       触れません（**書く**のと**やる**を分ける、この紙の決めごと）。 */
    KN.reorder.attach(subHost, {
      item: ".sub-line",
      handle: ".js-sub-grip",
      onDrop: (from, to) => {
        const [moved] = subs.splice(from, 1);
        subs.splice(to, 0, moved);
        paintSubs();
      },
    });

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
    /* 時刻の車輪：時（0〜23）と、5分きざみの分。端末の時刻欄は使いません。
       すでに5分の目に乗っていない分（21:22 など）は、その分だけ列に足して、
       開いただけでは時刻を書き換えない。決めていないあいだは薄く出し、
       回すか「時刻を決める」で決まります。 */
    const WHEEL_ROW = 40;
    const wheelBox = body.pick(".js-time-wheels");
    const wheels = { quiet: null };
    function wheelCol(vals, label, fmt) {
      const el = node(html`<div class="note-wheel" role="listbox" aria-label="${label}" tabindex="0"></div>`);
      let t = 0;
      const col = {
        el, vals,
        index: () => Math.max(0, Math.min(vals.length - 1, Math.round(el.scrollTop / WHEEL_ROW))),
        value: () => vals[col.index()],
        go(v) {
          const i = Math.max(0, vals.indexOf(v));
          const to = i * WHEEL_ROW;
          if (Math.abs(el.scrollTop - to) > 1) {
            wheels.quiet = true;
            clearTimeout(wheels.qt);
            wheels.qt = setTimeout(() => { wheels.quiet = false; }, 300);
            el.scrollTop = to;
          }
          col.mark(i);
        },
        mark(i) {
          [...el.children].forEach((r, k) => r.toggleAttribute("aria-selected", k === i));
        },
      };
      vals.forEach((v) => el.append(node(html`<div class="note-wheel-row" role="option">${fmt(v)}</div>`)));
      el.addEventListener("scroll", () => {
        col.mark(col.index());
        if (wheels.quiet) return;
        clearTimeout(t);
        t = setTimeout(() => {
          const h = wheels.h.value(), m = wheels.m.value();
          const next = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          if (next === time) return;
          time = next;
          haptic();
          paintPart(true);
          paintHint();
        }, 120);
      }, { passive: true });
      el.addEventListener("click", (e) => {
        const r = e.target.closest(".note-wheel-row");
        if (!r) return;
        el.scrollTo({ top: [...el.children].indexOf(r) * WHEEL_ROW, behavior: "smooth" });
      });
      return col;
    }
    function buildWheels(at) {
      const base = at || time || (() => {
        const n = KN.plan.toMin(KN.util.nowTime());
        return KN.plan.toTime(Math.min(23 * 60 + 55, Math.round(n / 5) * 5));
      })();
      const bm = Number(base.slice(3, 5));
      const mins = Array.from({ length: 12 }, (_, i) => i * 5);
      if (!mins.includes(bm)) mins.push(bm);
      mins.sort((a, b) => a - b);
      wheels.h = wheelCol(Array.from({ length: 24 }, (_, i) => i), "時", (v) => `${v}時`);
      wheels.m = wheelCol(mins, "分", (v) => `${String(v).padStart(2, "0")}分`);
      wheels.base = base;
      wheelBox.append(wheels.h.el, wheels.m.el);
    }
    /** 車輪を、いま決めている時刻（無ければ出している値）へ合わせる。 */
    function syncWheels() {
      const v = time || wheels.base || (buildWheels(), wheels.base);
      const m = Number(v.slice(3, 5));
      if (!wheels.m || !wheels.m.vals.includes(m)) {
        wheelBox.textContent = "";
        buildWheels(v);
      }
      wheelBox.classList.toggle("is-off", !time);
      wheels.h.go(Number(v.slice(0, 2)));
      wheels.m.go(m);
    }

    function paintPart(fromWheel) {
      timeClear.hidden = !time;
      timeSet.hidden = !!time;
      wheelBox.classList.toggle("is-off", !time);
      if (!fromWheel) syncWheels();
      paintSpanNote();
    }

    timeSet.addEventListener("click", () => {
      if (!wheels.h) buildWheels();
      const h = wheels.h.value(), m = wheels.m.value();
      time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      haptic();
      paintPart(true);
      paintHint();
    });
    timeClear.addEventListener("click", () => {
      time = null;
      paintPart();
      paintHint();
      haptic();
    });

    paintDueChips();
    paintDueEmpty();
    paintPart();
    paintHint();

    /* 期限。「なし／あり」を訊き、ありなら日付を一行で。外れても何も連れて
       いきません（時刻もくりかえしも、やる日の話なので）。 */
    const limitEl = body.pick(".js-limit");
    const limitCell = body.pick(".js-limit-cell");
    let limitAsked = !!deadline;
    function paintLimit() {
      limitCell.hidden = !limitAsked;
      limitEl.value = deadline || "";
      KN.ui.chipRow(body.pick(".js-limit-yn"), [{ id: "no", label: "なし" }, { id: "yes", label: "あり" }], {
        activeId: limitAsked ? "yes" : "no",
        onPick: (id) => {
          limitAsked = id === "yes";
          if (!limitAsked) deadline = null;
          haptic();
          paintLimit();
        },
      });
      paintRows();
    }
    limitEl.addEventListener("change", () => {
      deadline = limitEl.value || null;
      paintRows();
      haptic();
    });
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
      detailEl.hidden = repeat !== "weekly" && repeat !== "monthly" && repeat !== "after";
      repeatHint.hidden = detailEl.hidden;
      if (detailEl.hidden) return;

      /* 「済ませてから◯日」（R6）。早見の数と、−／＋。打ちこむ欄は置かない
         ——数を選ぶだけのことに、キーボードを出すほどの手間はかけない。 */
      if (repeat === "after") {
        const row = node(html`<div class="chip-row js-every"></div>`);
        const setEvery = (n) => {
          repeatEvery = Math.max(1, Math.min(365, n));
          paintRepeatDetail();
          haptic();
        };
        const minus = node(html`<button type="button" class="chip js-every-minus" aria-label="1日へらす">−</button>`);
        minus.disabled = repeatEvery <= 1;
        minus.addEventListener("click", () => setEvery(repeatEvery - 1));
        row.append(minus);
        const shown = EVERY_PICKS.includes(repeatEvery) ? EVERY_PICKS : EVERY_PICKS.concat(repeatEvery).sort((a, b) => a - b);
        shown.forEach((n) => {
          const on = n === repeatEvery;
          const chip = node(html`
            <button type="button" class="chip ${on ? "is-on" : ""}" aria-pressed="${String(on)}"
                    data-every="${String(n)}">${n}日</button>
          `);
          chip.addEventListener("click", () => setEvery(n));
          row.append(chip);
        });
        const plus = node(html`<button type="button" class="chip js-every-plus" aria-label="1日ふやす">＋</button>`);
        plus.disabled = repeatEvery >= 365;
        plus.addEventListener("click", () => setEvery(repeatEvery + 1));
        row.append(plus);
        detailEl.append(row);
        repeatHint.textContent = `済ませた日から${repeatEvery}日後に次が立ちます`;
        return;
      }

      if (repeat === "weekly") {
        const row = node(html`<div class="chip-row js-days"></div>`);
        /* 見出しと同じ月曜はじまりの並び。`n` は保存している実際の曜日番号
           （0=日〜6=土）で、`repeatDays` の意味はここでは変えません
           ——並び順を月曜はじまりに揃えるのは表示だけの話です。 */
        KN.util.WEEKDAY_COLS.forEach((n) => {
          const label = KN.util.WEEKDAYS[n];
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
        const orderedDays = repeatDays.slice()
          .sort((a, b) => KN.util.WEEKDAY_COLS.indexOf(a) - KN.util.WEEKDAY_COLS.indexOf(b));
        repeatHint.textContent = repeatDays.length
          ? `毎週 ${orderedDays.map((n) => KN.util.WEEKDAYS[n]).join("・")} にくり返します`
          : "選ばなければ、いまの日付と同じ曜日で";
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
      repeatHint.textContent = repeatNth ? "" : "無い月は月末になります";
    }

    paintRepeat();
    paintRows();

    /* ★は ⋯ の中へ移りました（上の heroMenu）。付いているかどうかは、
       頭の題の下に小さな星として出ます。 */

    titleEl.addEventListener("input", () => { foot.disabled = !titleEl.value.trim(); });

    /* ---------------- 打った字から「いつ」を読む ----------------

       「10:00 病院」と打ったら、10:00 の時間割に「病院」が立つ。読むのは
       `js/when-parse.js`（DOM も store も触らない部品）で、ここが持つのは
       **読めたものを欄へ移すこと**だけです。決めごと（どこまで読むか・
       何を読まないか）は向こうに書いてあります。

       **移すのは、題の欄から離れたとき。** 打っているあいだは頭に点線で
       予告するだけです。一文字ごとに落としていくと、「10:00くらいに」と
       続けて打つ人の字が、打っている最中に消えます。

       読み違えたときのために、トーストに「戻す」を置きます——落とした字も、
       入った欄も、押せば元どおりになります。

       **直しに来ただけの紙では、読みません。** 「9/15 資料」という題の
       用事を開いて保存を押しただけで日付が動く、というのは、書いていない
       ことを勝手に決めているのと同じです。読むのは、この紙で題に手を
       入れた人がいるときだけ（`titleTouched`。宣言は紙の頭にあります——
       組み立ての途中で読まれるので、ここに let で書くと落ちます）。
       新しく足す紙は、題が空から始まるので、打った時点で必ず手が
       入っています。 */
    titleEl.addEventListener("input", () => { titleTouched = true; });

    /* ---- 一行に並べたものを、分けて入れる（docs/roadmap.md の R1） ----

       やることは**改行だけ**で分けます。「銀行、郵便局に寄る」は一件の用事
       なので、読点では分けません。改行が入るのは貼りつけたときだけです
       （Enter は止めてあります）。分けるのは新しく足す紙だけで、行ごとに
       「いつ」を読みます（when-parse）。**手順を書いた紙は分けません**
       ——手順がどの行のものか分からないので。 */
    function splitLines() {
      if (editing || !KN.splitItems) return null;
      if (subs.some((s) => String(s.title || "").trim())) return null;
      const lines = KN.splitItems.todo(titleEl.value);
      return lines.length >= 2 ? lines : null;
    }
    /* **function で書くこと。** whenPeek は組み立ての途中（paintRows →
       paintHeroFacts）から読まれるので、const だと TDZ で落ちます。 */
    function hasBreak() { return /[\r\n]/.test(titleEl.value.trim()); }
    /* 分けないときの一件の題。改行は「、」にして一行へ。 */
    function flatTitle(v) {
      return String(v).trim().split(/\s*(?:\r?\n|\r)+\s*/).filter(Boolean).join("、");
    }

    /* ボタンが先に言います（「3件に分けて追加」）。欄も行の数だけ伸ばします。 */
    function paintSplit() {
      const rows = Math.min(6, Math.max(1, titleEl.value.split(/\r?\n|\r/).length));
      if (titleEl.rows !== rows) titleEl.rows = rows;
      if (editing) return;
      const lines = splitLines();
      const label = lines ? `${lines.length}件に分けて追加` : "追加";
      if (foot.textContent.trim() !== label) foot.textContent = label;
    }
    titleEl.addEventListener("input", paintSplit);
    subHost.addEventListener("input", paintSplit);
    /* 直しに来た紙では、貼りつけた改行は空きにします（input だったころと同じ）。 */
    titleEl.addEventListener("paste", (e) => {
      if (!editing) return;
      const txt = e.clipboardData && e.clipboardData.getData("text");
      if (!txt || !/[\r\n]/.test(txt)) return;
      e.preventDefault();
      const a = titleEl.selectionStart ?? titleEl.value.length;
      const b = titleEl.selectionEnd ?? a;
      titleEl.setRangeText(txt.trim().replace(/\s*(?:\r?\n|\r)+\s*/g, " "), a, b, "end");
      titleEl.dispatchEvent(new Event("input", { bubbles: true }));
    });

    function whenPeek() {
      const W = KN.whenParse;
      if (!W || !titleTouched || hasBreak()) return null;
      const res = W.parse(titleEl.value);
      return W.found(res) ? res : null;
    }

    /* 題を差し替えます。**中身（textContent）にも書く**こと——運んでいる
       あいだの控え（cloneNode）が打つ前の字を出さないように（input だった
       ころは value 属性に書いていました。textarea の既定の字は中身です）。 */
    function setTitle(v) {
      titleEl.value = v;
      titleEl.textContent = v;
      foot.disabled = !v.trim();
      paintSplit();
      if (!iconKey) paintIcon();
    }

    /** 日付・時刻まわりの欄と札を、まとめて描き直します。 */
    function repaintWhen() {
      dueEl.value = due || "";
      paintDueEmpty();
      paintDueChips();
      paintPart();
      paintMins();
      paintRepeat();
      paintRepeatDetail();   // 中で paintRows も通ります
      paintHint();
      /* 期限（deadline）は due とは別欄です（CLAUDE.md「長期タスクと、
         期限」）。limitEl の値を書き直さないと、欄の中の日付ピッカーは
         打ち替える前の姿のまま残ります。 */
      if (limitEl) limitEl.value = deadline || "";
      paintLimit();
    }

    function whenApply(opts) {
      const W = KN.whenParse;
      if (!W || !titleTouched || hasBreak()) return;
      const res = W.parse(titleEl.value);
      if (!W.found(res)) return;
      const back = { title: titleEl.value, due, time, minutes, part, deadline,
        repeat, repeatDays: repeatDays.slice(), repeatNth, repeatEvery };
      setTitle(res.title);
      if (res.due) due = res.due;
      if (res.time) time = res.time;
      if (res.minutes) minutes = res.minutes;
      if (res.deadline) deadline = res.deadline;
      if (res.repeat) {
        repeat = res.repeat;
        repeatDays = res.repeatDays || [];
        repeatNth = res.repeatNth || null;
        if (res.repeatEvery) repeatEvery = res.repeatEvery;
        /* 毎朝・毎晩は記録の上では「毎日＋日の端」です。くり返しを言い直された
           のだから、古い端は外します。 */
        if (isBookend(part)) part = null;
      }
      /* 時刻だけを言われたら、その日は**いま出している日**。日付が無いまま
         時刻を持たせると、保存のところで時刻ごと落ちます
         （`const at = fixed ? time : null`）。 */
      if (time && !due) due = (oneDay() ? shownDay() : todayKey()) || todayKey();
      repaintWhen();
      /* 保存のときは黙って移します——すぐ後ろに「◯◯を9/14 15:00までに」が
         続くので、同じことを二枚のトーストで言うことになります。 */
      if (opts && opts.quiet) return;
      haptic(10);
      KN.ui.toast(`${W.describe(res, { due, time, minutes, deadline })}にしました`, {
        action: {
          label: "戻す",
          onClick: () => {
            setTitle(back.title);
            due = back.due; time = back.time; minutes = back.minutes; part = back.part;
            deadline = back.deadline;
            repeat = back.repeat; repeatDays = back.repeatDays; repeatNth = back.repeatNth;
            repeatEvery = back.repeatEvery;
            repaintWhen();
          },
        },
      });
    }

    titleEl.addEventListener("input", paintHeroFacts);
    /* 行き先の札（R4）。新しく足す紙で、打った字が買うものらしいときだけ
       （「牛乳」「電池を買う」）。押せば買うものへ入り、紙は閉じる。 */
    if (!editing && KN.capture) {
      const paintDest = KN.capture.bindChip(hero.querySelector(".js-dest"), {
        from: "todo",
        text: () => titleEl.value,
        go: (g) => {
          const got = KN.capture.toList(g.title);
          handle.close();
          if (!got) return;
          haptic(12);
          if (!got.item) { KN.ui.toast(`「${got.product.name}」はもうリストにあります`); return; }
          KN.ui.toast(`買うものに「${got.product.name}」を入れました`, {
            action: { label: "戻す", onClick: got.undo },
          });
        },
      });
      titleEl.addEventListener("input", paintDest);
    }
    titleEl.addEventListener("change", () => whenApply());
    titleEl.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      whenApply();
      titleEl.blur();
    });

    foot.addEventListener("click", () => {
      /* 打ちっぱなしで押されたぶんも、ここで読みます（欄から離れる前に
         押されたら、change はまだ来ていません）。 */
      whenApply({ quiet: true });
      const memo = body.pick(".js-memo").value;
      const lines = splitLines();
      if (lines) { addMany(lines, memo); return; }
      const title = flatTitle(titleEl.value);
      if (!title) return;
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
          repeat, repeatDays, repeatNth, repeatEvery, memo, flagged, minutes,
          lead: at ? lead : null, icon: iconKey });
        /* 手順は別に置きます。updateTodo は書いてよい欄を選ぶので、
           知らない欄を混ぜると黙って落ちます。 */
        store.setSubs(todoId, subs);
        KN.ui.toast(fixed !== due ? `${when}にしました` : "直しました");
      } else {
        store.addTodo({ title, due: fixed, deadline, part: fixed ? part : null, time: at,
          repeat, repeatDays, repeatNth, repeatEvery, memo, flagged, minutes,
          lead: at ? lead : null, subs, icon: iconKey });
        KN.ui.toast(fixed
          ? `「${title}」を${when}までに`
          : `「${title}」を追加しました`);
      }
      haptic(12);
      handle.close();
    });

    /* 分けて入れる（R1）。紙で決めたこと（日・時刻・長さ・くり返し・期限・
       メモ・旗）は、どの行にも同じく。そのうえで行ごとに「いつ」を読み、
       読めた欄だけ差し替えます（whenApply と同じ移し方）。絵は行ごとに
       おまかせ——一つの絵を三件に配る理由はないので。 */
    function addMany(lines, memo) {
      const W = KN.whenParse;
      const made = [];
      lines.forEach((line) => {
        let v = { title: line, due, time, minutes, part, deadline, repeat, repeatDays, repeatNth, repeatEvery };
        const res = W ? W.parse(line) : null;
        if (res && W.found(res)) {
          v.title = res.title;
          if (res.due) v.due = res.due;
          if (res.time) v.time = res.time;
          if (res.minutes) v.minutes = res.minutes;
          if (res.deadline) v.deadline = res.deadline;
          if (res.repeat) {
            v.repeat = res.repeat;
            v.repeatDays = res.repeatDays || [];
            v.repeatNth = res.repeatNth || null;
            if (res.repeatEvery) v.repeatEvery = res.repeatEvery;
            if (isBookend(v.part)) v.part = null;
          }
          if (v.time && !v.due) v.due = (oneDay() ? shownDay() : todayKey()) || todayKey();
        }
        const fx = v.due ? store.snapToRule(v, v.due) : v.due;
        const rec = store.addTodo({ title: v.title, due: fx, deadline: v.deadline,
          part: fx ? v.part : null, time: fx ? v.time : null,
          repeat: v.repeat, repeatDays: v.repeatDays, repeatNth: v.repeatNth,
          repeatEvery: v.repeatEvery, memo, flagged, minutes: v.minutes });
        if (rec) made.push(rec.id);
      });
      haptic(12);
      handle.close();
      if (!made.length) return;
      KN.ui.toast(`${made.length}件に分けて入れました`, {
        action: {
          label: "ひとつにする",
          /* 分けて足した行を片づけ、打ったとおりの一件に（行は「、」でつなぐ）。
             行ごとに読んだ「いつ」は使わず、紙で決めたことだけで入れ直します。 */
          onClick: () => {
            made.forEach((id) => store.removeTodo(id));
            const title = lines.join("、");
            const fixed = due ? store.snapToRule({ repeat, repeatDays, repeatNth }, due) : due;
            store.addTodo({ title, due: fixed, deadline, part: fixed ? part : null,
              time: fixed ? time : null, repeat, repeatDays, repeatNth, repeatEvery,
              memo, flagged, minutes, icon: iconKey });
            KN.ui.toast(`「${title}」ひとつにしました`);
          },
        },
      });
    }

    /* 削除は ⋯ の中へ移りました（上の heroMenu）。紙のいちばん下に置くと、
       毎回そこを通ることになります——たまに、一度だけ使うものなので。 */
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

  /* 今日の色を、いまの基調色に合わせます（`--c-primary-fill`）。時間割の
     丸と背骨がこの色で塗られるので、ここが基調とずれていると、今日の
     画面だけ別のアプリの色になります。基調を切り替えたときも、ここが
     追随するので固定のコーラルにはしません。二日目から先はこれまで
     どおり、締切までの遠さを言う坂です。 */
  const DAY_COLORS = ["var(--c-primary-fill)", "#e08a3a", "#cfa93c", "#8bb34a", "#6aae55", "#5aa55a", "#4fa17a", "#49a0a0"];
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
  /** 買うものの絵を、やること用に。**食材はシルエットに差し替えます**
   *  （`icons-food.js`、269品目→71型）。時間割の丸薬には「こと」の
   *  シルエットが並ぶので、「牛乳を買う」だけ色つきの絵が出ると一族が
   *  割れます。買うものタブ側は色つきのままです。 */
  function productArt(key) {
    return (key && (KN.iconsGoods.byKey(key) || KN.iconsFood.byKey(key)
      || KN.productIcons.byKey(key))) || "";
  }

  /* ---------------- 引いた答えは、覚えておく ----------------

     辞書を引くのは安くありません——`findKey` は品物2131語・こと684語を
     順に当てにいくので、実測（CPU 4倍）で**組み直し一回に 12.9ms**、
     `somedaySection` が5行で 28.8ms かかっていた中身のほとんどがこれ
     でした。行は組み直しのたびに作り直すので、**同じ題を何度も引きます**。

     辞書は動きません。だから（どちらの引きかたか・保存済みの絵の名前・題）
     が同じなら、答えも必ず同じです。

     **`iconOverrides` が動くなら、ここを捨てること。** いまは書く側に
     呼び出し元がありません（CLAUDE.md「自分だけの言い換えと、絵の報告」）。 */
  const artCache = new Map();
  function cachedArt(kind, key, title, resolve) {
    const ck = kind + "\u0001" + (key || "") + "\u0001" + (title || "");
    let v = artCache.get(ck);
    if (v === undefined) { v = resolve() || ""; artCache.set(ck, v); }
    return v;
  }

  /** 自分で選んだ絵（あれば）、無ければ題から推した絵。無ければ丸だけ。
   *  シート内の「いまの見え方」プレビューと、行そのものの両方が使います。 */
  function iconMarkHtml(titleText, key) {
    /* 保存済みの絵の名前は、どちらの辞書のものかを持っていません（前は
       買うものしか無かったので）。両方に聞いて、答えたほうを使います。 */
    const svg = cachedArt("mark", key, titleText, () =>
      (key && (KN.iconsTodo.byKey(key) || productArt(key)))
      || KN.iconsTodo.find(titleText || "")
      || productArt(KN.productIcons.findKey(titleText || "")));
    return svg
      ? html`<span class="todo-mark">${KN.util.raw(svg)}</span>`
      : html`<span class="todo-mark is-plain"><i class="todo-dot"></i></span>`;
  }

  function todoMark(t) {
    return iconMarkHtml(t.title, t.icon);
  }

  /* ---------------- 丸薬の中の絵 ----------------

     **丸薬と同じところで色が変わります。** 過ぎたぶん（テーマ色に染まった
     ところ）では白抜き、まだのぶん（灰色）ではテーマ色。進んでいる最中は、
     絵の途中で切り替わります。

     そのために、絵を `<svg>` ではなく **マスク**として置きます。塗りは CSS の
     グラデーション一枚で、丸薬の背景とまったく同じ式（`--pass` と丸薬の
     高さ）から出ます——**境目を二か所で計算しない**ことが肝で、別々に
     出すと、伸びた丸薬や重なった行で必ずずれます。

     **単色シルエットは、品物の絵もここへ通します**（2026年9月5日）。
     通していなかったころは、「燃えるゴミ」のような**品物の絵で当たった行だけ
     `<svg>` のまま置かれて、丸の中で黒いまま**でした——白抜きになるのは
     マスクに乗った絵だけなので。色つきに戻したときだけ `<svg>` に落ちます
     （`productArt` が色つきを返すのは、シルエットが無いキーのときだけ）。 */
  const maskCache = new Map();
  function maskUrl(svg) {
    let u = maskCache.get(svg);
    if (u) return u;
    const s = svg
      .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace('fill="currentColor"', 'fill="#000"');
    u = "url('data:image/svg+xml," + encodeURIComponent(s) + "')";
    maskCache.set(svg, u);
    return u;
  }

  /** 単色シルエットの絵（無ければ ""）。丸薬の中と、一日の道の連れの丸が使う。 */
  function silOf(t) {
    const key = t.icon;
    /* 引きかたが `iconMarkHtml` と違う（色つきへ落ちる前に、シルエットだけを
       三つ聞く）ので、覚えも別の棚に置きます。 */
    return cachedArt("sil", key, t.title, () =>
      (key && (KN.iconsTodo.byKey(key) || KN.iconsGoods.byKey(key)
        || KN.iconsFood.byKey(key)))
      || KN.iconsTodo.find(t.title || "")
      || productArt(KN.productIcons.findKey(t.title || "")));
  }

  /** 時間割の丸薬の中に置く絵。シルエットなら二色に割れる形で、
   *  色つきの絵ならそのまま。 */
  function tlMark(t) {
    const sil = silOf(t);
    if (!sil) return todoMark(t);
    return html`<span class="todo-mark is-split"
                      style="--icon:${KN.util.raw(maskUrl(sil))}"></span>`;
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
        <button type="button" class="icon-report-toggle js-report-toggle" aria-pressed="false">
          ${icon("flag")}
          <span class="icon-report-text">この絵はちがう、と記録する</span>
        </button>
        <div class="stack js-grids" style="gap:14px"></div>
      </div>
    `);
    const grids = body.querySelector(".js-grids");
    const q = body.querySelector(".js-q");
    const handle = KN.ui.sheet({ title: "アイコンを選ぶ", content: body });

    /* product-sheet.js の openIconPicker と同じ仕掛け（腕を組んで、次の
       choose() の結果を一緒に書く）。ここでの自動の推測は、行の絵と同じ
       引き方（こと辞書 → 品物辞書、iconMarkHtml と同じ順）です。 */
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
        const gotIcon = KN.iconsTodo.findKey(titleText || "") || KN.productIcons.findKey(titleText || "") || "";
        store.addIconReport({
          text: titleText || "", screen: "todo", gotIcon,
          kind: gotIcon ? "wrong" : "missing", chosen: key || "",
        });
        KN.ui.toast("記録しました");
      }
      KN.motion.fire("select");
      onChoose(key || null);
      handle.close();
    }

    /* 絵が800を超えるので、開いた瞬間に全部を組むと手が止まります
       （product-sheet.js の同じ仕掛けと同じ理由）。最初の一掴みだけ
       同期で入れ、残りはフレームごとに継ぎ足します。 */
    const CHUNK = 120;
    let painting = 0;
    function cellOf({ key, label, svg }) {
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

    /* 品物の側は見出しで束ねて出します（product-sheet.js の paintGroups と
       同じ作り・同じ理由——`grid()` を見出しごとに呼ぶと `painting` の札が
       前の流し込みを殺し、しかもどの見出しも CHUNK 未満なので刻まれずに
       707枚が同期で入ってしまう）。 */
    function paintGroups(gs, into) {
      const mine = ++painting;
      const put = (g) => {
        into.append(heading(g.label));
        const box = node(html`<div class="icon-grid"></div>`);
        g.items.forEach((it) => box.append(cellOf(it)));
        into.append(box);
      };
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

    /* 一覧に出す品物の絵も、行と同じもの（食材はシルエット）に差し替えます
       ——選ぶ紙と行で違う絵が出ると、選んだものが出ていないように見えます。 */
    const art = (it) => ({ ...it, svg: productArt(it.key) || it.svg });

    function paint() {
      grids.innerHTML = "";
      const query = q.value.trim();
      if (query) {
        const hits = KN.iconsTodo.search(query).concat(KN.productIcons.search(query).map(art));
        if (!hits.length) {
          /* product-sheet.js の openIconPicker と同じ仕掛け。「合う絵は
             ありません」を行き止まりにせず、いま打った言葉をその場で
             記録できるようにします。 */
          const empty = node(html`
            <div class="stack" style="gap:10px">
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
            const gotIcon = KN.iconsTodo.findKey(query) || KN.productIcons.findKey(query) || "";
            store.addIconReport({ text: query, screen: "todo", gotIcon, kind: gotIcon ? "wrong" : "missing" });
            KN.ui.toast("記録しました");
          });
          grids.append(empty);
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
        const pool = KN.iconsTodo.list().concat(KN.productIcons.list().map(art));
        grids.append(heading("もしかして"));
        grids.append(grid(pool.filter((x) => maybe.includes(x.key))
          .sort((a, b) => maybe.indexOf(a.key) - maybe.indexOf(b.key))));
      }
      /* 二つに分けて出します。数がまるで違う（こと108・品物707）ので、
         混ぜると こと が品物の海に沈みます。

         **こと は束ねません。** 108個は6列で18行——見出しを入れて切るほど
         の長さではなく、切ると「こと」という括り自体がぼやけます。品物の
         ほうだけ、見出しで束ねます。

         **ただし、流し込みは「こと」も込みで一本にします。** ここで
         `grid()` を呼んでから `paintGroups()` に移ると、あちらの
         `++painting` が「こと」の流し込みを降ろします。いまは こと が
         108枚（CHUNK=120 未満）なので刻まれず、たまたま無事なだけ
         ——**増えた日に黙って壊れる形**なので、はじめから一本にします。 */
      paintGroups([{ label: "こと", items: KN.iconsTodo.list() }].concat(
        KN.productIcons.groups().map((g) => ({ label: g.label, items: g.items.map(art) }))
      ), grids);
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
        ${/* 一覧（棚）だけ：丸そのものを押すと、詳細の紙を経由せずアイコン
              選びへ直行します——買うものの一覧（screen-list.js の js-emoji）
              と同じ揃え。時間割の丸薬（.tl-node）はここには来ません、
              あちらは時刻を持っている絵なので詳細の紙のままです。 */""}
        <button type="button" class="todo-mark-btn js-icon-pick" aria-label="${t.title} の絵を選ぶ">
          ${todoMark(t)}
        </button>
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

    const iconBtn = row.querySelector(".js-icon-pick");
    if (iconBtn) iconBtn.addEventListener("click", () => {
      openTodoIconPicker(t.icon, t.title, (key) => {
        store.updateTodo(t.id, { icon: key });
      });
    });

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
        /* 下の帯のチェックリストも跳ねる（片づいたことを、席が受け止める）。 */
        KN.app.pokeTab("todo");
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
    KN.app.pokeTab("todo");
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
    /* 紙を横に払っているあいだは、組み直しません（day-swipe.js が上げ下げ
       します）。指の下で紙が組み直されると、掴んでいたものが別の絵に
       なります。 */
    if (swiping) return;
    takeSharedDay();
    renderBody();
    paintDayTitle();
    /* 暦は組み直しのたびに別の要素になるので、厚みも測り直します
       （掴み手はそのぶん下に貼りつくので）。**ただし一拍おいてから**
       ——組み立て終わりに測ると、そこでレイアウトが強制されます。一拍
       待てば、ブラウザがどのみち一度やるレイアウトに相乗りできます。
       そのあいだ掴み手は前の床のままですが、床が変わるのは月と週を
       行き来したときだけなので、ふだんは同じ数です。 */
    fitCalSoon();
  }

  /* 一拍あとに一度だけ測ります。組み直しはスイッチ一つでも走るので、
     まとめないと同じ測りが何度も積まれます。 */
  let calFit = 0;
  function fitCalSoon() {
    if (calFit) return;
    calFit = requestAnimationFrame(() => { calFit = 0; fitCalH(); });
  }

  let groups = [];

  /* ---------------- 日の紙の控え ----------------

     `renderBody` が置いた `.tl-sheet` と、そのときの見分け字。次の組み直しで
     同じ字が出たら、紙には指一本触れません。 */
  let sheetNode = null;
  let sheetSig = null;

  /** 紙に出ているものを、まるごと一本の字にする。

      **数えるものを選びません。** 選ぶと、いつか選び落とします——紙は
      用事の題・メモ・時刻・長さ・手順・期限・並び順まで描くうえ、
      組み立て（`KN.plan.buildDay`）は設定の一日の始まり／終わりと、
      **いま何時か**まで見ます（時刻を書いていないものが、いまから先に
      並ぶので）。だから用事ぜんぶと設定ぜんぶをそのまま字にします。
      `todos` 65件で **0.16ms**（CPU 4倍）——組み直し一回の 0.3% です。

      分まで入れるのは**今日を見ているときだけ**。過ぎた日・先の日の
      組み立ては「いま」を渡されないので、分が変わっても絵は動きません。 */
  function sheetDigest(day) {
    const st = store.get();
    return JSON.stringify([
      day, todayKey(),
      day === todayKey() ? KN.util.nowTime() : "",
      st.settings,
      [...openSubs].sort(),
      st.todos,
    ]);
  }

  function renderBody() {
    /* 書き替えても、読んでいた場所は動かしません。中身を空にすると
       スクロールは0へ落ちるので、組み直したあとに返します——一件
       片づけるたびにいちばん上へ飛ぶのは、片づけの邪魔でしかない。 */
    const keepTop = root ? KN.app.scrollerOf(root).scrollTop : 0;

    /* 組み直す前に、いまどの行がどこに居るかを測ります。組み終わってから
       `settle()` を呼ぶと、動いた行が**もといた場所から**滑ってきます
       （`ui.js` の `flipRows`）。

       **行には前から `data-flip` が付いていました**——買うもの・daily は
       これを使っているのに、ここだけ呼んでいませんでした（目印だけ置いて、
       見る人が居なかった）。時間割に一件足すと、その下の行がいっせいに
       瞬間移動していたのは、それです。

       日を丸ごと替えたときは、向こうが自分で見送ります（新顔が半分を
       超えたら「編集ではなく行き先の変更」と見なして何もしない）。 */
    const settle = KN.ui.flipRows(els.body, ".tl-row");
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
    /* **暦は、組み直すより先に決めます。** 使い回せる盤は、**外さずに
       そのまま置いておく**ためです——`innerHTML = ""` で一度外すと、
       付け直したところでブラウザはその木ぶんのレイアウトをやり直します
       （実測：外して付け直すと、盤を組み直さなくても強制レイアウトが
       37.8ms。外さなければ **28.7ms**）。だから中身を空にするのは
       「残す一枚」を決めたあと、その一枚だけ残して消す形にします。 */
    /* 暦は帯（画面の外、全タブで一つ）に置きます。**探しているあいだも
       出したまま**——前は外していましたが、帯の暦が消えると帯の厚みが変わり、
       帯は全タブで一つなので「探しているタブだけ帯が縮む」ことになります。 */
    els.cal = monthCalendar(store.openTodos());
    KN.head.putCal("todo", els.cal);

    /* **日の紙も、変わっていなければ組み直しません。** 暦と同じ話で、
       同じ理由で**外しません**（外して付け直すだけで、その木ぶんの
       レイアウトが要る）。

       違うのは**見分けかた**です。暦は「絵を変えるものだけ」を数えれば
       足りましたが、紙のほうは用事の題・メモ・時刻・長さ・手順・期限……と
       ほとんど全部を描くうえ、**組み立て（`KN.plan.buildDay`）が「いま
       何時か」まで見ます**（時刻を書いていないものが、いまから先に並ぶ）。
       数え落とすと、直したはずの字が出ないまま残ります。だから**丸ごと
       見ます**——用事ぜんぶ・設定ぜんぶ・ひらいている手順・日・今日・
       今日を見ているなら分。どれか一つでも動けば組み直す、という、
       いままでと同じ形のまま。得があるのは「**何も変わっていない**」
       とき——席を移る、暦を開け閉めする、設定のスイッチを押す——で、
       残っていた長タスクはちょうどそこでした。 */
    const keepSheet = (!query && oneDay() && sheetNode
      && sheetNode.parentNode === els.body
      && sheetSig === sheetDigest(shownDay())) ? sheetNode : null;

    [...els.body.childNodes].forEach((n) => {
      if (n !== keepSheet) n.remove();
    });

    /* 紙がそのままなら、ここでおしまい。中の配線（払う・引く・運ぶ・
       30秒の拍）は紙に付いたままなので、何も起こしません。 */
    if (keepSheet) { restoreTop(keepTop); settle(); return; }
    sheetNode = null;

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
          <p class="empty-text">下の＋から追加できます。</p>
        </div>
      `));
      restoreTop(keepTop);
      settle();
      return;
    }

    if (!shown.length) {
      els.body.append(node(html`
        <p style="text-align:center;color:var(--c-text-3);padding:40px 16px">
          見つかりませんでした
        </p>
      `));
      restoreTop(keepTop);
      settle();
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
      /* 一日ぶんの中身は、横に払える一枚（.day-slide）にまとめて入れます。
         払っているあいだ、隣の日の紙が指のぶんだけ入ってきます。 */
      const car = node(html`<div class="day-car"><div class="day-track"></div></div>`);
      const track = car.querySelector(".day-track");
      track.append(daySlide(shownDay(), open));
      sheet.append(car);
      /* 指を受けるのは紙ぜんぶ——長期タスクの下の空白からも払えるように
         （day-swipe.js の「受け口は紙ぜんぶ」）。 */
      wireDaySwipe(car, track, open, sheet);
      wireCalPull(sheet);
      /* **印は掴み手だけに付けます。** 前は紙ぜんぶに付けていました
         ——紙のどこを持っても下へ引けば暦が出た時期の名残です。段を
         替えられるのが掴み手だけになったいま、紙の本体は「引いて更新」の
         ものなので、そのまま譲ります（ダイエットで引いて更新が効かなく
         なっていたのは、これでした）。 */
      const grip = sheet.querySelector(".tl-grip");
      if (grip) grip.setAttribute("data-pull-own", "cal");
      /* 次の組み直しで使い回せるように、いまの姿を控えます。 */
      sheetNode = sheet;
      sheetSig = sheetDigest(shownDay());
      restoreTop(keepTop);
      settle();
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
    settle();
  }

  /* ---------------- 一日ぶん ---------------- */

  /** 時間割で見ているか（＝一日ずつか）。探しているあいだは棚に戻ります
      ——絞った結果は「一日」ではないので。 */
  const oneDay = () => !query && !KN.ui.isTiles() && timelineOn();

  /* いま出している日。null は今日です（日が変わっても勝手についてくる
     ように、todayKey() を焼き付けません）。 */
  let viewDay = null;
  const shownDay = () => viewDay || todayKey();
  /** 題が言っている日（一日ずつの紙ならその日、一覧なら印を付けた日）。 */
  const titleDay = () => (oneDay() ? shownDay() : (hereDay || todayKey()));

  /* 他のタブで日が動いていたら、その日を引き取ります（util の dayShare。
     席を移るとき app.js の show() が置いていきます）。`goDay` と同じ三つ
     ——出す日・印・暦の月——を、組み直す前に書き換えるだけ。 */
  let dayVer = 0;
  function takeSharedDay() {
    const t = KN.util.dayShare.take(dayVer);
    dayVer = t.ver;
    if (!t.day || t.day === titleDay()) return;
    viewDay = t.day === todayKey() ? null : t.day;
    hereDay = t.day;
    dayPinned = true;
    const d = KN.util.dayDate(t.day);
    const now = KN.util.dayDate(todayKey());
    calMonth = (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth())
      ? null : { year: d.getFullYear(), month: d.getMonth() };
  }

  /** 一日ぶんの時間割。頭も見出しも持ちません——日付は画面の題が言います。 */
  /** その日ぶんの紙まるごと（時間割＋長期タスク）。横に払うと、この一枚が
      隣の日のものと入れ替わります。 */
  function daySlide(day, open) {
    const el = node(html`<div class="day-slide"></div>`);
    el.append(daySection(day, open));
    // 時間割の下に、少し離して。いつやるか決めていないものの置き場です。
    el.append(somedaySection(open));
    return el;
  }

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
    /* 一日の道は、何も無い日にも出します。空いた一日が、道の長さそのままで
       見えることにも意味があるので（今日なら、そこに人が立っています）。 */
    if (roadOn()) sec.append(dayRoad(day, rows.concat(done), open));
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

  /* ---------------- 一日の道（js/day-road.js） ----------------

     時間割の上に、その日を一本の道にした地図を置きます（利用者の手描きがもと。
     2026年9月29日）。組み立ては時間割と同じ `buildDay`——二つが別々に数えると、
     地図と時間割が食い違うので。設定の「一日の道を出す」で外せます。 */
  const roadOn = () => store.get().settings.todoRoad !== false;

  function dayRoad(day, todos, open) {
    const s = store.get().settings;
    const isToday = day === todayKey();
    const plan = KN.plan.buildDay(day, todos, {
      start: s.dayStart, end: s.dayEnd, now: isToday ? KN.util.nowTime() : null,
    });
    /* 長期タスク（段8・段B）。道の外周のくぼみに浮かべ、道へ運べば日と時刻が付く。
       過ぎた日には出さない（置ける道が無いので）。並びは**期限の近い順**——くぼみの
       位置が時刻を言っているように読めないように。同じ期限・期限なしは手で決めた順。 */
    const someday = day < todayKey() ? [] : (open || [])
      .filter((t) => !t.due && !t.done && !t.archived && !t.trace)
      .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999")
        || (a.order || 0) - (b.order || 0));
    return KN.dayRoad.build({
      plan, today: isToday, tomorrow: isToday ? firstStopOn(KN.util.shiftDay(day, 1)) : null,
      someday,
      open: (id) => openSheet(id),
      markOf: (t) => { const sil = silOf(t); return sil ? maskUrl(sil) : ""; },
      decide: (id, at) => decideOnRoad(id, at, day),
    });
  }

  /** その日の最初の停留所（時刻を決めた、まだの用事）。{ at: 分, title } か null。
      道の次の一行が、今日の決まった予定が済んだあとに「明日は 9:00 病院から」と
      添えるため（段6）。くり返しは fallsOn で開く（時間割と同じ読み方）。 */
  function firstStopOn(day) {
    let best = null;
    store.openTodos().forEach((t) => {
      if (t.trace || !KN.util.isTime(t.time) || !store.fallsOn(t, day)) return;
      const at = KN.plan.toMin(t.time);
      if (!best || at < best.at) best = { at, title: t.title };
    });
    return best;
  }

  /* 道の上で時刻を決めた（段2）。時間割で時刻の列へ運んだときと同じ書き換えと
     報せ。くり返しの用事は**やる日を動かしません**——動かすと、今日より前の
     回が消えるので（時刻だけが、毎回の時刻として付きます）。 */
  function decideOnRoad(id, at, day) {
    const t = store.get().todos.find((x) => x.id === id);
    if (!t) return;
    const was = { time: t.time, due: t.due };
    const patch = { time: at };
    if (!t.repeat || !t.due) patch.due = day;
    store.updateTodo(id, patch);
    KN.motion.fire("save");
    KN.ui.toast(`「${t.title}」を ${at} に`, {
      action: { label: "元に戻す", onClick: () => store.updateTodo(id, was) },
    });
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
    const sc = KN.app.scrollerOf(root);
    restoring = true;
    sc.scrollTop = Math.min(top, Math.max(0, sc.scrollHeight - sc.clientHeight));
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
  /* 上の帯と暦は画面の外（全タブで一つの帯）に移ったので、画面の中で
     上に貼りついて行を隠すものは、もうありません。 */
  function chromeInset() { return 0; }

  function scrollToSection(target, willStick) {
    /* Scrolled by hand rather than with scrollIntoView. That asks *every*
       ancestor to bring the row into view, the document included — and the
       document's one spare pixel is what the status-bar tap listens on, so
       revealing a row here would read as 「上へ戻れ」 and do the opposite
       (app.js). Setting the screen's own scrollTop leaves the document alone. */
    /* 送ったあとに暦が貼りつくと、着いた先の見出しがその裏に隠れます
       ——いま貼りついていないぶんは、chromeInset が数えていないので。
       これから貼りつくと分かっているときは、その高さも先に引きます。 */
    const inset = chromeInset();
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


  /* 骨組みは一度だけ作り、月が変わったら中身だけ描き直します。

     節そのものを作り直さないのは、これが position:sticky の要素だから
     です。貼りついている節を差し替えると、ブラウザはスクロールの
     つなぎ目を取り直そうとして文書のほうを1pxだけ動かします——そして
     その1pxは、ノッチのタップを聞くために置いてある1pxです（app.js）。
     つまり月をめくるたびに「上へ戻れ」と言ったことになり、画面が
     いちばん上まで飛びます。中身だけ入れ替えれば、節は動きません。 */
  /* ---------------- 暦は、変わっていなければ組み直さない ----------------

     実測（2026年9月21日・CPU 4倍・390×844）で、組み直し一回のうち暦が
     **28.1ms**（JS の取り分の76%）、しかも要素数では **531個のうち 369個**
     ——画面の7割が暦でした。そのうえ組み直した木は**まるごとレイアウトを
     やり直す**ので、そのあとの強制レイアウト 32.3ms もほとんどが暦ぶんです。

     暦が描いているのは「その月の、日ごとの絵と件数」だけで、用事の題や
     時刻をいじってもそこは動きません。**入力が同じなら、前の盤をそのまま
     使い回します**——`els.body.innerHTML = ""` で外れるだけで、節そのものは
     生きています（cal-peek・cal-swipe の配線も、押したときの口も付いたまま）。

     **見分けるのは `calDigest`**——月・今日・棚の色と、日を持つ用事の
     （id・日・くり返し・絵・題）だけ。そこだけが盤の絵を変えるものなので。
     安いほう（期限切れの帯・週の印・輪）は、使い回したときも毎回やります
     ——あちらは「いま見ている日」で変わるもので、盤の中身ではありません。 */
  let calNode = null;
  let calSig = null;

  /** 盤の絵を決めているものだけを、一本の字にする。 */
  function calDigest(open) {
    const today = todayKey();
    const m = shownMonth();
    const parts = [m.year, m.month, today, oneDay() ? 1 : 0];
    groups.forEach((g) => parts.push(g.id, g.color, g.day || "", g.from || "", g.to || ""));
    (open || []).forEach((t) => {
      if (!t.due) return;
      parts.push(t.id, t.due, t.repeat ? 1 : 0, t.icon || "", t.title);
    });
    store.get().todos.forEach((t) => {
      if (!t.due || t.due >= today || t.repeat || t.trace || !(t.done || t.archived)) return;
      parts.push("d", t.id, t.due, t.icon || "", t.title);
    });
    return parts.join("\u0001");
  }

  function monthCalendar(open) {
    const sig = calDigest(open);
    /* 前の盤がそのまま使えるなら、組みません。**外れていても外れていなくても
       同じ一枚を返します**——置き場所は呼んだ側（`renderBody`）が決めます。 */
    if (calNode && calSig === sig) {
      fillCalTail(calNode, open);
      return calNode;
    }
    const sec = buildCalendar(open);
    calNode = sec;
    calSig = sig;
    return sec;
  }

  function buildCalendar(open) {
    const U = KN.util;
    const sec = node(html`
      <section class="cal">
        ${/* 見出しの行は、まるごと上のバーへ移しました（日付の題と「›」）。
              残っていた ‹ › は落としています——日を送る道は、週の帯を押す・
              左右に払う、の二つで足りていて、三つめは行を一段ぶん使うだけ
              でした。

              「今日へ」の札は無くしました。隠れているあいだは場所を
              取らないボタンでしたが、出た瞬間だけ暦の高さがそのぶん伸びて、
              下の紙が押し下げられていました。今日へ戻る道は、暦から今日の
              マスを選ぶことで足ります。 */""}
      </section>
    `);
    /* 三層（曜日の行／伸び縮みする窓／その中のずらしと日のマス）は
       cal-peek.js が組みます。daily の暦と、同じものを使うためです。 */
    const grid = KN.calPeek.mount(sec).grid;

    /* 月を変えたら、下のリストもその月の頭へ運びます。上だけが動くと、
       カレンダーと棚が別々のものを指したまま並ぶことになります。
       週だけ出しているときは、刻みも週です（月ごと飛ぶと、押した先に
       自分の週が無くなります）。 */
    const goTo = (delta) => {
      haptic();
      /* 暦の送りは、出しているものに合わせます——週なら週、月なら月。
         一日ずつの紙のときも同じです。日を一日ぶんだけ送る道は、紙
         そのものを払うほうにあります（day-swipe.js）。ここで日ずつ
         飛ばすと、隣の週を見るのに七回ぶん動くことになるので。 */
      if (!calOpen()) {
        const here = oneDay() ? shownDay() : (hereDay || todayKey());
        const next = KN.util.shiftDay(here, delta * 7);
        const d = KN.util.dayDate(next);
        setCalMonth(d.getFullYear(), d.getMonth(), true);
        if (oneDay()) { goDay(next, delta); return; }
        markDay(next, true);
        jumpToDay(next);
        return;
      }
      const m = shownMonth();
      const d = new Date(m.year, m.month + delta, 1);
      setCalMonth(d.getFullYear(), d.getMonth(), true);
      if (oneDay()) {
        /* 一日ずつの紙も、その月へ運びます——暦と紙が同じ月を指すように。
           いまの月なら今日、そうでなければその月の頭。 */
        const now = KN.util.dayDate(todayKey());
        const key = (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth())
          ? todayKey() : KN.util.dayKey(d);
        goDay(key, delta);
        return;
      }
      scrollToMonth(d.getFullYear(), d.getMonth());
    };

    /* 手つきは三画面で分け合う一つ（js/cal-swipe.js）です。週だけ出して
       いるときは、隣の週が指のぶんだけ先に入ってきます。 */
    KN.calSwipe.wire({
      sec, grid,
      isWeek: () => !calOpen(),
      here: () => (oneDay() ? shownDay() : (hereDay || todayKey())),
      step: stepWeek,
      monthGrid: monthGridFor,
      go: goTo,
      /* 用事を運んでいる最中は、この指は向こうのものです。 */
      busy: () => !!tlDrag || KN.reorder.isActive(),
    });
    fillCalendar(sec, open);
    return sec;
  }

  /** 週を送った先の日。この画面は**先の日へも行けます**（これから何を
      するか組む画面なので）。だから塞ぐ向きはありません。 */
  function stepWeek(delta) {
    const here = oneDay() ? shownDay() : (hereDay || todayKey());
    return KN.util.shiftDay(here, delta * 7);
  }

  /** その月ぶんの日のマス。隣の週を先に見せるために cal-swipe が呼びます。
      いま出している月なら、生きている盤をそのまま渡します——組み直すと、
      選んでいる日の輪まで作り直すことになるので。 */
  function monthGridFor(year, month) {
    const cur = shownMonth();
    if (els.cal && cur.year === year && cur.month === month) {
      return els.cal.querySelector(".cal-grid");
    }
    const tmp = node(html`<section class="cal"></section>`);
    KN.calPeek.mount(tmp);
    fillCalendar(tmp, store.openTodos(), { year, month });
    return tmp.querySelector(".cal-grid");
  }

  /** その月の顔を描く。節と grid の要素はそのまま使い回します。 */
  /* 隣の月のマス。週が月をまたぐときだけ表に出ます（月で見ているあいだは
     CSS が伏せます）。押せばその日へ行けるので、月末の週から翌月の頭へ
     そのまま進めます。中身は日付だけ——粒（件数）はその月のぶんしか
     数えていないので、出すと嘘になります。 */
  function outCell(key, marks) {
    const U = KN.util;
    const d = U.dayDate(key);
    const wd = d ? d.getDay() : 0;
    const cell = node(html`
      <button class="cal-day is-out ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
              data-day="${key}"
              aria-label="${d ? `${d.getMonth() + 1}月${d.getDate()}日` : key}">
        <span class="cal-n">${d ? String(d.getDate()) : ""}</span>
        <span class="cal-dots" style="--cat:${dayColor(key)}"></span>
      </button>
    `);
    /* 絵も出します。ここを空にしていたのは「件数はその月ぶんしか数えて
       いない」からでしたが、marks は `t.due` で引いているだけなので、
       隣の月の日もそのまま引けます。空のままにすると「翌月1日は何も
       ない」と嘘をつくことになります。 */
    const dots = cell.querySelector(".cal-dots");
    ((marks && marks.get(key)) || []).forEach((t) => dots.append(node(html`
      <i class="cal-mark" style="--cat:${tlColorOf(t)}">${todoMark(t)}</i>
    `)));
    cell.addEventListener("click", () => openDay(key));
    return cell;
  }

  /**
   * @param {Element} sec  組む先の `.cal`
   * @param {Array} open   やること（`store.openTodos()`）
   * @param {{year:number,month:number}} [only]  その月で組みます。渡すのは
   *   **離れたところへ組むとき**だけ（隣の週を先に見せるため）。そのぶんは
   *   画面に出ないので、最後の二つ——いまの週の印と、見ている日の輪——は
   *   置きません。置くと、出ていない盤のために生きている題まで塗り直します。
   */
  function fillCalendar(sec, open, only) {
    if (!sec) return;
    const U = KN.util;
    const today = todayKey();
    const now = U.dayDate(today);
    const { year, month } = only || shownMonth();
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
       大きさ（20px）だと四つ目がマスからはみ出すからです。

       過ぎた日のぶんは、片づけていても出します——`open` は「まだ
       やっていない」ものだけなので、済ませたとたんにそのマスから絵が
       消えていました。過去のマスは記録なので、片づけたことでその日に
       何があったか読めなくなるのは本末転倒です。今日から先はこれまで
       どおり `open` だけ（まだ起きていないことを「済んだ」と出すと
       嘘になるので）。

       ただし**繰り返しのぶんは、済んだ記録としては出しません**（2026年9月28日。済ませると残る控え＝`trace` も同じ）。
       毎週のものは、済ませるたびに過去の日へ絵が並び、暦が「済んだ印」だらけ
       になるので。まだこれからの繰り返しは、上のとおり出ます。 */
    const doneForMarks = store.get().todos
      .filter((t) => (t.done || t.archived) && !t.repeat && !t.trace && t.due && t.due < today);
    const marks = new Map();
    (open || []).concat(doneForMarks).forEach((t) => {
      if (!t.due) return;
      const list = marks.get(t.due) || [];
      if (list.length < 3) { list.push(t); marks.set(t.due, list); }
    });

    sec.setAttribute("aria-label", `${year}年${month + 1}月`);

    const grid = sec.querySelector(".cal-grid");
    grid.innerHTML = "";

    const wds = sec.querySelector(".cal-wds");
    wds.innerHTML = "";
    U.WEEKDAY_COLS.forEach((wd) => wds.append(node(html`
      <span class="cal-wd ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}">${U.WEEKDAYS[wd]}</span>
    `)));
    /* 週は月をまたぎます。7日そろいにするため、隣の月の日も本物のマスと
       して置きます（月で見ているあいだは CSS が伏せるので、月の見た目は
       これまでどおり）。押せば、その日へ行けます。 */
    const outer = U.outDays(year, month);
    outer.lead.forEach((key) => grid.append(outCell(key, marks)));

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
    outer.trail.forEach((key) => grid.append(outCell(key, marks)));
    if (only) return;                     // 離れたところへ組んだぶん（上を参照）
    /* 生きている盤へ直に描いたので、控えの見分け字はもう当てになりません
       （`setCalMonth` はここを通ります）。次の組み直しで組み直させます。 */
    if (sec === calNode) calSig = null;
    fillCalTail(sec, open);
  }

  /** 盤の中身ではなく、**いま見ている日**で変わるぶん。使い回した盤にも
      毎回これだけは置き直します（どれも安い）。 */
  function fillCalTail(sec, open) {
    const today = todayKey();
    /* 期限切れ。一日の中には居場所がないので、**あることだけ**言って、
       受け皿（一覧）への口を出します。

       ここ（貼りつく帯の中）に置くのが肝です。紙の中に置いていたら、
       開いた瞬間に「いま」のところへ送られて（toNow）、そのまま帯の裏へ
       隠れました——**見えない注意は、無いのと同じ**です。帯の中なら、
       どこまで送っても居ます。

       今日を見ているときだけ。過ぎた日を見ているときに「期限切れ」と
       言われても、することがありません。 */
    /* 札の置き場は、暦の中ではなく**帯のすぐ下（この画面の頭）**です。
       暦は全タブで一つの帯に居るので、中に置くと、やることの暦だけが
       札のぶん背が高くなり、タブを移るたびに紙が上下します。画面の頭も
       紙の外で送られないので、「どこまで送っても居る」はそのまま。 */
    const host = els.late;
    const oldBar = host && host.querySelector(".tl-late");
    if (oldBar) oldBar.remove();
    const late = host && oneDay() && shownDay() === today
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
      host.append(bar);
    }
    /* 段3：前の日から運んできたもの。**あることと、置き直す口だけ**言います。
       押さなければ今日に居続ける（9月27日の「期限切れは作らない」のまま）。
       数は件数だけ——「できなかった」「◯日持ち越し」は言いません。 */
    const oldCarry = host && host.querySelector(".tl-carry");
    if (oldCarry) oldCarry.remove();
    const carried = host && oneDay() && shownDay() === today ? store.carriedToday() : [];
    if (carried.length) {
      const bar = node(html`
        <button type="button" class="tl-late tl-carry">
          <span class="tl-late-n">${carried.length}</span>
          <span>前の日から運んだもの</span>
          <span class="tl-late-go">置き直す${icon("chevron")}</span>
        </button>
      `);
      bar.addEventListener("click", () => { haptic(); carrySheet(); });
      host.append(bar);
    }
    paintPassed(true);

    // 隠すぶんを先に決めます——輪は並んだ位置から測るので、隠したあとで。
    markWeek(sec, hereDay || today);
    // 描き直したぶん、いま見ている日の印は消えています。付け直します
    // （枠ごと入れ替わったので、輪は滑らせずに置きます）。
    paintHere(true);
  }

  /* 段3：運んできたものを、一件ずつ選び直す紙（docs/todo-timeline.md
     「崩れたときの置き直し」）。選ぶと行が消え、報せに「元に戻す」。
     片づけ終えたら紙は閉じる（通知から来た紙 due-sheet.js と同じ拍）。 */
  function carrySheet() {
    const rows = store.carriedToday();
    if (!rows.length) return;
    const week = store.carryWeek();
    const picks = [
      { key: "today", label: "今日のどこか", done: "今日のどこかに" },
      { key: "tomorrow", label: "明日", done: "明日へ" },
      { key: "week", label: week.next ? "来週" : "今週", done: week.next ? "来週中に" : "今週中に" },
      { key: "someday", label: "長期タスクへ", done: "長期タスクへ" },
      { key: "stop", label: "やめる", done: "アーカイブしました" },
    ];
    const box = node(html`<div class="carry-list"></div>`);
    let handle = null;
    let left = rows.length;
    rows.forEach((t) => {
      const was = t.carried && t.carried.time;
      const row = node(html`
        <div class="carry-row" data-id="${t.id}">
          <div class="carry-head">
            <span class="carry-title">${t.title}</span>
            ${was ? html`<span class="carry-was">前は ${was}</span>` : ""}
          </div>
          <div class="carry-acts">
            ${picks.map((p) => html`<button type="button" class="btn btn-soft btn-sm js-carry" data-key="${p.key}">${p.label}</button>`)}
          </div>
        </div>
      `);
      row.querySelectorAll(".js-carry").forEach((b) => b.addEventListener("click", () => {
        const p = picks.find((x) => x.key === b.dataset.key);
        const undo = store.settleCarried(t.id, p.key);
        haptic();
        KN.motion.fire("save");
        row.remove();
        if (!--left && handle) { handle.close(); handle = null; }
        KN.ui.toast(`「${t.title}」を${p.done}`, {
          action: { label: "元に戻す", onClick: undo },
        });
      }));
      box.append(row);
    });
    handle = KN.ui.sheet({ title: "前の日から運んだもの", content: box, onClose: () => { handle = null; } });
  }

  /* 段5：その日のうちの置き直し（docs/todo-timeline.md「その日のうちの置き直し」）。
     時刻を過ぎたのにまだのものが**あることと、置き直す口だけ**を、段3の札の隣に
     言います。件数だけで、赤くしません——「遅れ」「できなかった」は言いません。
     組み直しを待たず、30秒の見回りでも数え直します（見ているあいだに時刻が過ぎる
     ことのほうが多いので）。数が変わらなければ触りません。 */
  function paintPassed(force) {
    const host = els.late;
    if (!host) return;
    const old = host.querySelector(".tl-passed");
    const list = oneDay() && shownDay() === todayKey() ? store.passedToday() : [];
    if (!force && (old ? Number(old.dataset.n) : 0) === list.length) return;
    if (old) old.remove();
    if (!list.length) return;
    const bar = node(html`
      <button type="button" class="tl-late tl-passed" data-n="${String(list.length)}">
        <span class="tl-late-n">${list.length}</span>
        <span>時刻を過ぎたもの</span>
        <span class="tl-late-go">置き直す${icon("chevron")}</span>
      </button>
    `);
    bar.addEventListener("click", () => { haptic(); passedSheet(); });
    host.append(bar);
  }

  /* 段5の紙。段3の紙（carrySheet）と同じ形で、一件ずつ選び直します。
     「いまから」はいまの次の15分きざみ。「時刻を外す」と連れに戻り、道の空いた
     ところを押せば、また時刻を付けられます（段2）。 */
  function passedSheet() {
    const rows = store.passedToday();
    if (!rows.length) return;
    const now = KN.plan.toMin(KN.util.nowTime());
    const soon = Math.ceil((now + 1) / 15) * 15;
    const soonAt = soon < 24 * 60 ? KN.plan.toTime(soon) : null;
    const picks = [
      soonAt && { key: "now", label: `いまから（${soonAt.replace(/^0/, "")}）`, done: `${soonAt.replace(/^0/, "")} に` },
      { key: "loose", label: "時刻を外す", done: "連れに戻しました" },
      { key: "tomorrow", label: "明日", done: "明日へ" },
      { key: "someday", label: "長期タスクへ", done: "長期タスクへ" },
      { key: "stop", label: "やめる", done: "アーカイブしました" },
    ].filter(Boolean);
    const box = node(html`
      <div class="carry-list">
        <p class="passed-note">時刻を外すと「連れ」に戻ります。</p>
      </div>
    `);
    let handle = null;
    let left = rows.length;
    rows.forEach((t) => {
      const row = node(html`
        <div class="carry-row" data-id="${t.id}">
          <div class="carry-head">
            <span class="carry-title">${t.title}</span>
            <span class="carry-was">${t.time.replace(/^0/, "")} の予定</span>
          </div>
          <div class="carry-acts">
            ${picks.map((p) => html`<button type="button" class="btn btn-soft btn-sm js-passed" data-key="${p.key}">${p.label}</button>`)}
          </div>
        </div>
      `);
      row.querySelectorAll(".js-passed").forEach((b) => b.addEventListener("click", () => {
        const p = picks.find((x) => x.key === b.dataset.key);
        const undo = store.settlePassed(t.id, p.key, soonAt);
        haptic();
        KN.motion.fire("save");
        row.remove();
        if (!--left && handle) { handle.close(); handle = null; }
        KN.ui.toast(`「${t.title}」を${p.done}`, {
          action: { label: "元に戻す", onClick: undo },
        });
      }));
      box.append(row);
    });
    handle = KN.ui.sheet({ title: "時刻を過ぎたもの", content: box, onClose: () => { handle = null; } });
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
     一つ、‹ › が二つめ、これが三つめ——**紙を横に払う**。

     仕掛けそのものは js/day-swipe.js が持ちます（daily・ダイエットと
     分け合うため——三枚書き写すと、片方だけを直した日に三つの紙が違う
     動きをします）。ここが答えるのは「いま見ている日は何か」「隣はどこか」
     「その日の紙をどう組むか」「決まったら何をするか」だけです。

     **動くのは紙そのもの**です。前は指が離れてから隣の日へ差し替えて、
     22px ぶんだけ横から入れていました——払っている最中は何も動かないので、
     指がどこまで行けば送られるのかが絵に出ていませんでした。

     つまんで運んでいる最中は取りません——用事を横へ運ぼうとしている指を、
     日送りに取られては困ります。 */
  let swiping = false;

  function wireDaySwipe(viewport, track, open, surface) {
    KN.daySwipe.wire({
      viewport,
      track,
      surface,
      day: shownDay,
      /* 先の日へも行けます。ここは「これから何をするか」を組む画面なので、
         明日・あさっての時間割にも用があります。 */
      step: (d, dir) => shiftDay(d, dir),
      /* 隣の日も、いまの組み直しで拾った同じ一覧から組みます（`open` は
         日で絞る前のもの）。掴んでいるあいだ組み直しは止まっているので、
         この控えが古くなることはありません。 */
      slide: (d) => daySlide(d, open),
      /* **組み直しません。** 滑りきった `kept` が、もう「その日」の紙です
         ——同じものをもう一度組むために 134ms 固まると、次の日が「いきなり
         出てきた」ように見えます（実測・CPU 4倍）。

         塗り直すのは、紙の**外**で変わったものだけ：暦の輪と週の帯と
         日付の題（`markDay` がまとめて持っています）。紙の中の「いま」の
         線は、`watchNow` の ResizeObserver が付いた瞬間に置き直します
         ——親に付く前は高さが 0 なので、あそこはもともとその口です。

         月をまたいだときだけ、暦の盤を差し替えます（`setCalMonth`）。
         あれは暦だけを描き直すもので、画面ぜんぶではありません。 */
      commit: (next, kept) => {
        const was = shownDay();
        viewDay = next === todayKey() ? null : next;
        /* **控えを捨てます。** 滑りきった一枚を据える（adopt）のは
           組み直しを通らない道なので、紙の中身は `sheetSig` が言っている
           日と違うものに変わっています。捨てないと、払って戻ってきたときに
           「字は合っているから紙はそのまま」と読まれて、**隣の日の時間割が
           そのまま居座ります**（実測：今日→明日と払って「今日へ戻る」を
           押すと、題と暦だけ今日になり、紙は明日のままでした）。 */
        sheetSig = null;
        const d = KN.util.dayDate(next), m = shownMonth();
        if (d.getFullYear() !== m.year || d.getMonth() !== m.month) {
          setCalMonth(d.getFullYear(), d.getMonth());
          fitCalH();
        }
        markDay(next, true);
        /* 週をまたいだら、週の帯を送った向きから滑り込ませ、輪は滑らせずに
           置き直します（帯ごと入れ替わるので、前の週の端から輪が横切って
           くると、動きが二つ重なって見えます）。 */
        if (KN.util.otherWeek(was, next)) {
          KN.util.slideWeek(els.cal, next > was ? 1 : -1);
          paintHere(true);
        }
        // 控えが渡らなかったとき（掴み直しなど）だけ、これまでどおり。
        if (!kept) render();
      },
      /* 道で連れを運んでいる指も向こうのもの（day-road.js の段8）。 */
      busy: () => !!tlDrag || KN.reorder.isActive() || KN.dayRoad.carrying(),
      lock: (on) => { swiping = on; },
    });
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
      /* 用事を運んでいる指を、暦に取られては困ります。暦を横に払って
         いる最中も同じ——cal-swipe が生きている盤を運んでいるので、
         ここで高さまで書くと二つが同じものを取り合います。 */
      busy: () => !!tlDrag || KN.calSwipe.isActive(),
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
    if (root) KN.app.scrollerOf(root).scrollTop = 0;
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

  let tlDoneOpen = false;
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
    /* 済んだものは畳める（2026年10月2日）。道が上に来て、済んだ行が残ると
       スクロールが長いので。畳み方は次に開いたときも覚えています。 */
    const doneN = plan.items.filter((it) => it.todo.done || it.todo.archived).length;
    const sec = node(html`
      <div class="tl ${tlDoneOpen ? "" : "is-done-shut"}">
        ${/* 「このあと空き◯分」は出しません。時間割そのものが、時刻の
              並びと帯の隙間で同じことを言っています。文で重ねて言うのは
              説明のしすぎです。

              超過（はみ出し）だけは残します——これは「読めば分かる」では
              なく、**詰め込みすぎている**という注意なので、他の事実とは
              性格が違います。 */""}
        ${plan.over || doneN
          ? html`<div class="tl-sum">
              ${plan.over ? html`<span class="tl-over">寝る時刻を ${P.humanSpan(plan.over)} すぎます</span>` : ""}
              ${doneN ? html`<button type="button" class="tl-done-toggle" aria-expanded="${String(tlDoneOpen)}">
                済み ${doneN}件<span class="tl-subs-arrow">${icon("chevron")}</span></button>` : ""}
            </div>` : ""}
        <ol class="tl-list js-tl"></ol>
      </div>
    `);
    const list = sec.querySelector(".js-tl");
    const dt = sec.querySelector(".tl-done-toggle");
    if (dt) dt.addEventListener("click", () => {
      tlDoneOpen = !tlDoneOpen;
      dt.setAttribute("aria-expanded", String(tlDoneOpen));
      sec.classList.toggle("is-done-shut", !tlDoneOpen);
      const ax = sec.querySelector(".tl-axis");
      if (ax && ax.__paint) ax.__paint();
    });

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
      const prev = parts[i - 1];
      const touch = !!prev && prev.kind === "item" && landsInside(prev.it, part.it);
      list.append(itemRow(part.it, !!next && next.kind === "item", day, touch));
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

  /** 線の上で、その行が受け持つ時間 { a, u }（分）と、その用事の本当の終わり end。

      ふつうは用事の始まり〜終わりそのものです。**下の行とぶつかっている行
      （`is-clash-above`）だけ、受け持ちは下の行が始まるまで**です。

      20:00〜22:00 のルーティンの途中、20:55 に「テスト」があるとき、二つは
      一本の線の上に上下に並びます。上の丸薬をルーティン自身の進み具合で塗ると、
      20:57 には上の丸薬のまん中に「いま」が来て、その下の、もう始まっている
      テストが灰色——上から下へ読むと時間が戻ります（2026年9月29日の画面）。
      線の上の順に読めば、上の丸薬の見えているところは「テストが始まるまで」
      なので、そこまでで塗り切ります。運ぶときの目盛り（`axisOf`）も、もとから
      そう読んでいます。

      end はうすい地（`is-live`）のため——ルーティン自体はまだ続いているので。 */
  function shownSpan(li) {
    const a = Number(li.dataset.at), end = Number(li.dataset.until);
    let u = end;
    if (li.classList.contains("is-clash-above")) {
      const nx = li.nextElementSibling;
      const na = nx ? Number(nx.dataset.at) : NaN;
      if (isFinite(na) && na < u) u = Math.max(a, na);
    }
    return { a, u, end };
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
      const { a, u } = shownSpan(li);
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

  /* **先に測って、あとから書く。**

     前は `markPass`（書く）→ `nowY`（読む）→ `clearOfClocks`（読む）の
     順でした。書いたすぐあとに測ると、ブラウザはそこでレイアウトを
     やり直さないと答えられません——組み直しのたびに、余分な一回。

     入れ替えても答えは同じです。`markPass` が書くのは色（`--pass`・
     線の色・`is-live` のうすい地）だけで、**高さも位置も動かさない**ので、
     測る前に書いても後に書いても、測れる数は変わりません。 */
  function paintNow(sec, list, axis, isToday) {
    /* いまの時刻は、描くたびに時計から読み直します。組み立てたときの値を
       持ち回ると、線が置かれた時刻のまま固まるので。 */
    const nowMin = isToday ? KN.plan.toMin(KN.util.nowTime()) : null;

    // ① 測る（まだ何も書かない）
    let at = null;
    if (nowMin != null) {
      const y = nowY(sec, list, nowMin);
      if (y != null) at = clearOfClocks(sec, list, y);
    }

    // ② 書く
    axis.textContent = "";
    markPass(list, nowMin);
    if (at != null) axis.append(nowMark(nowMin, at));
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
    /* 線の上で「いま」が居る行に、もう着いたか。着くまでの行の線は全部
       過ぎたぶん（色）、着いたあとの行の線は全部これから（灰色）。 */
    let reached = false;
    for (const li of list.children) {
      if (!li.classList) continue;
      const row = li.classList.contains("tl-row");
      if (!row && !li.classList.contains("tl-free-row")) continue;
      const { a, u, end } = shownSpan(li);
      const known = isFinite(a) && isFinite(end) && end > a;
      let pass;
      if (nowMin == null || !known || li.classList.contains("is-done")) pass = 1;
      else if (nowMin >= u) pass = 1;
      else if (nowMin <= a) pass = 0;
      else pass = (nowMin - a) / (u - a);
      li.style.setProperty("--pass", pass.toFixed(3));
      /* 丸薬の**外**の線の色。丸薬の中の境目は CSS が丸薬の寸法から出す
         ので（--rail-p）、ここが渡すのは外の二本だけです。

         外の線は時間を持ちません——丸薬と丸薬をつなぐ、ただの繋ぎです。
         だから途中で色が変わってはならず、二値で決まります。

         **決めるのは、一本の線の上の「いま」の位置です。行ごとの
         pass ではありません。** 前は行ごとに「上は始まったか・下は
         終わったか」で塗っていて、二つの場面で**色の付いた短い線**が
         丸薬の上下から灰色の線の中へ突き出ました（「丸薬に線が刺さって
         いる」。2026年9月27日の画面）：
           - 済ませたもの（pass は時計に関わらず 1）… 夕方の用事を朝に
             済ませると、夕方の丸薬の上下 5〜10px だけが色になる。
           - 重なり … 4時間のルーティンの途中で済ませた用事は、始まって
             いて終わってもいるので上下とも色、上のルーティンはまだ
             終わっていないので下は灰色——灰色 → 色 → 丸薬 → 色 → 灰色。
         「いま」の行は `nowY` と同じ引き方（時刻の順に見て、まだ終わって
         いない最初の行）で決めるので、線の色の境目は、いまの時刻の札と
         同じところに一つだけ落ちます。丸薬の塗り（pass）は、そのまま
         その用事の進み具合・済んだかを言います——線は時間、丸薬は用事。

         下（--rail-bot-c）は、手順の段（.tl-sub-wrap）の背骨も継ぎます。
         あそこの高さは手順の件数で決まっていて時間ではないので、割合を
         渡してはいけません（渡していた時期があり、それが「線が丸薬を
         追い越す」の正体でした）。 */
      let top = true, bot = true;
      if (nowMin != null && reached) top = bot = false;
      else if (nowMin != null && known && nowMin < u) {
        reached = true;
        top = nowMin > a;
        bot = false;
      }
      if (!row) continue;
      li.style.setProperty("--rail-top-c", top ? "var(--tl-fill)" : "var(--tl-wait)");
      li.style.setProperty("--rail-bot-c", bot ? "var(--tl-fill)" : "var(--tl-wait)");
      /* いま進んでいる一件。うすい地は残します——「いま目を向けるのは
         ここ」という合図で、塗りの境目とは別のことを言っているので。
         済ませたものには出しません。 */
      const live = nowMin != null && known && nowMin > a && nowMin < end
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
  /* 拍は**分の変わり目**にそろえます（2026年9月30日）。前は30秒ごとで、
     時計が 7:34 になってから最大30秒、道の人と「いま」が 7:33 のまま残り、
     分が変わると歩く人（day-road.js の paint）も遅れて歩いていました。 */
  const nowTick = () => setTimeout(() => {
    nowTick();
    if (!root || document.hidden) return;
    /* 別のタブを見ているときは、測っても 0 しか返りません（消えている
       ので）。戻ってきたときは ResizeObserver が呼んでくれます。 */
    if (!root.offsetParent && root.offsetHeight === 0) return;
    if (tlDrag || KN.dayRoad.carrying()) return;   // 運んでいる最中は触りません
    paintNowAll();
  }, 60000 - (Date.now() % 60000) + 250);
  nowTick();

  function paintNowAll() {
    root.querySelectorAll(".tl-axis").forEach((el) => {
      if (typeof el.__paint === "function") el.__paint();
    });
    if (KN.dayRoad) KN.dayRoad.paintAll(root);
    paintPassed(false);
  }

  /* **戻ってきたら、すぐ一度。** 30秒の見回りだけでは、アプリへ戻ってから
     最初の拍までのあいだ「いま」が閉じた時刻のまま残ります（7:43 に開いて
     「7:34」と出ていた。2026年9月29日の画面）。いまを指す字が古いのは、
     無いより悪い——見た人はそれを信じるので。
     組み直しも頼みます。紙の見分け字は今日なら分まで持つので、分が変わって
     いれば、時刻を決めていないものが**いまから先へ**置き直されます（頼まないと、
     朝に組んだ「7:00ごろ」が、昼に開いても過ぎた場所に残ったままになり得た）。
     開いて見ているあいだは組み直しません（読んでいる途中で行が動くので）。
     アプリへ戻ってきたのも「開いた」うちなので、道の人も歩きます。読み込みの
     pageshow（persisted でない）は数えません——そちらは onEnter が歩かせて
     いて、組み直しが挟まると、歩きの途中から頭へ跳ぶので。 */
  function wakeNow(e) {
    if (!root || document.visibilityState !== "visible") return;
    if (!root.offsetParent && root.offsetHeight === 0) return;
    if (tlDrag) return;
    render();
    paintNowAll();
    if (KN.dayRoad && e && (e.type === "visibilitychange" || e.persisted)) KN.dayRoad.walk(root);
  }
  document.addEventListener("visibilitychange", wakeNow);
  window.addEventListener("pageshow", wakeNow);

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
  /* 運んでいる最中に、画面の端で自動的に送る帯の厚みと、ひと呼吸あたりの
     送り幅。**端に近いほど速く**——深く入るほど急いでいる、と読みます。
     これが無いと、画面の外にあるもの（長期タスクの欄や、朝の時間帯）へは
     運べません。指は画面から出られないので。 */
  const EDGE_BAND = 84;
  const EDGE_MAX = 17;
  /* 狙っている時刻の札を、線からどれだけ上へ逃がすか。指の腹はおよそ 22px
     ぶん線にかかるので、そのぶんを越えて空けます（css の余白と合わせて、
     札の下端が線から 18px 上に来ます）。この数より上に線が来たときだけ、
     札を下側へ返します。 */
  const AIM_LABEL_GAP = 56;

  /* ---------------- 左の列は、一本の時間軸 ----------------

     **「空いている場所だけ置ける」という考え方は、捨てました。**

     前は、掴んだ瞬間に空きの行が破線の帯になって上下へ広がり（`bandHeight`
     が 64〜220px を返していました）、その帯の中だけが細かく狙えました。
     つまり**置ける場所を決めていたのは、そこに何が置いてあるかでした**。

     いまは行を見ません。**丸薬に合わせた一本の軸**を通します：丸薬の上端が
     その用事の始まり、下端が終わり。丸薬と丸薬のあいだは、前の終わりから
     次の始まりへまっすぐ。丸薬の上でも、あいだでも、空きでも、狙った高さの
     時刻がそのまま出ます。

     **まっすぐ一直線（列の上端＝日の始まり、下端＝終わり）も試して、外し
     ました。** px あたりの分はどこでも同じになりますが、行の高さは題とメモが
     決めていて時間に比例しないので、**丸薬の時刻と軸が最大 327分ずれました**
     ——「12:30 旅行準備」の真横で札が「18:12」と出る。座標が示す時刻は、
     そこに描いてある丸薬が言っている時刻でなければいけません。

     ずれは 0分になりましたが、そのかわり px あたりの分は場所で変わります
     （丸薬の中は細かく、長い空きは粗い）。**それでも置けない高さはありません**
     ——どの座標にも時刻が対応します。 */

  /** 掴んだときの軸。**一度だけ**決めます（途中で測り直すと、指の下で
      速さが変わる）。持つのは列の上端からの px と、そこの分。位置は毎回
      その場で測ります——画面を送れば列も動くので。 */
  function axisOf(dayList) {
    const rows = [...dayList.children].filter((li) => li.classList
      && (li.classList.contains("tl-row") || li.classList.contains("tl-free-row")));
    if (!rows.length) return null;
    const box = dayList.getBoundingClientRect();
    const from = Number(rows[0].dataset.at);
    const to = Number(rows[rows.length - 1].dataset.until);
    if (!isFinite(from) || !isFinite(to) || to <= from || box.height <= 0) return null;

    /* 節は丸薬（`.tl-node`）の上端と下端。`.todo-mark` は中の32pxの絵で、
       丸薬そのものではありません——あちらを測ると、4時間の用事も15分の
       用事も同じ32pxになります。 */
    const raw = [{ y: 0, min: from }];
    rows.forEach((li) => {
      const at = Number(li.dataset.at), un = Number(li.dataset.until);
      const node0 = li.querySelector(".tl-node");
      if (!node0 || !isFinite(at) || !isFinite(un) || un < at) return;
      const b = node0.getBoundingClientRect();
      if (b.height <= 0) return;
      raw.push({ y: b.top - box.top, min: at });
      raw.push({ y: b.bottom - box.top, min: un });
    });
    raw.push({ y: box.height, min: to });

    /* **上から下へ、y も分も進む一本にします。** 重なった二つは丸薬どうしが
       ぶつかる（`is-clash` が上下へ14pxずつ育てる）ので、そのままだと節が
       前後します。y で並べ直して、分は前の節より戻らないように押さえます。 */
    raw.sort((a, b) => a.y - b.y);
    const pts = [];
    raw.forEach((p) => {
      const last = pts[pts.length - 1];
      const min = last ? Math.max(last.min, p.min) : p.min;
      if (last && p.y - last.y < 0.5) { last.min = Math.max(last.min, min); return; }
      pts.push({ y: p.y, min });
    });
    if (pts.length < 2) return null;

    /* **左右の境目は、もうありません。** 前はここで列の切れ目（100px）を
       出して、それより右を「順番で置きなおす」に振っていました。行のどこを
       持ち上げても同じ時間軸、に変えたので要りません（aim() の但し書き）。 */
    return { pts };
  }

  /* 一覧のドラッグ（下の reorder まわり）にも同じ名前の札があるので、
     こちらは時間割のものだと分かる名前にします。 */
  let tlDrag = null;

  /* どの用事の手順を、いま開いて見ているか。組み直しをまたいで覚えて
     おきます——手順を一つ押すたびに畳まれては、続けて押せません。 */
  const openSubs = new Set();

  /* 手順のボタンを押した拍を、要素ではなく id で覚えておきます（値は時刻。
     指を置き直すと消える）。長押しで store を書き換えると、その一拍で
     画面ぜんぶが描き直され（app.js の store.subscribe）、押したボタン自身も
     新しい要素に差し替わります。タッチでは指を離したあとに「代替の」click が続けて
     発行され、その click は差し替わった**新しい**要素をあらためて叩く
     ——preventDefault では止まりません（touchstart 側で止める必要が
     あり、pointer イベントだけでは間に合わない）。要素ではなく id を
     見張れば、差し替わっても同じ手順として気づけます。 */
  const subGestureAt = new Map();

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
      /* 済ませたあとでも持てます——開始時刻がわかってから、事後的に
         リスケすることがあるので。止めていたのはここ一行だけでした。 */
      if (!row) return;

      const id = row.dataset.todoId;
      const x0 = e.clientX, y0 = e.clientY, pid = e.pointerId;
      let timer = setTimeout(() => { timer = null; lift(row, id, list, day, y0); }, DRAG_HOLD);

      /* **待っているあいだの見張りは document で。** 一覧に付けていました
         が、紙を横に払うと day-swipe.js が外枠でポインタを捕まえます
         （setPointerCapture）——捕まえた先はこの一覧より**外**なので、
         以後の pointermove も pointerup も、ここまで降りてきません。
         見張りが黙ると長押しの時計は止まらず、払い終わったあとに行が
         持ち上がりました。document なら、捕まえた先がどこでも届きます
         （reorder.js も同じ作りです）。 */
      const cancel = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        document.removeEventListener("pointermove", moved);
        document.removeEventListener("pointerup", cancel);
        document.removeEventListener("pointercancel", cancel);
      };
      const moved = (ev) => {
        if (ev.pointerId !== pid || !timer) return;
        if (Math.abs(ev.clientX - x0) > DRAG_SLOP || Math.abs(ev.clientY - y0) > DRAG_SLOP) cancel();
      };
      document.addEventListener("pointermove", moved);
      document.addEventListener("pointerup", cancel);
      document.addEventListener("pointercancel", cancel);
    });
  }

  /** 持ち上げる。左の列が、一本の時間軸になります。 */
  function lift(row, id, list, day, y0) {
    const t = store.getTodo(id);
    if (!t) return;
    const len = KN.plan.minutesOf(t);

    /* 持ち上げた指の位置を控えます。**動かさずに離したら、何もしません**
       ——下の drop() を見ること。 */
    /* 落とし先の一覧。ふつうは掴んだのと同じ一覧ですが、**長期タスクから
       運ぶときだけは違います**——あの欄には時刻の軸が無いので、置き場は
       その日の時間割のほうにあります。日付も、その日のものになります
       （長期タスクはまだどの日のものでもないので）。

       **探すのは `.tl-list` です。** ここは `.tl:not(.tl-someday)` でした
       が、`.tl` は**二つの別物**に付いています——行を並べる
       `<ul class="tl tl-someday">`（js の 2148行）と、その日の時間割を
       囲む `<div class="tl">`（2804行）。`:not(.tl-someday)` が拾うのは
       後者の**囲い**で、中の `<ol class="tl-list">` ではありません。
       囲いの子は `.tl-sum` と `<ol>` だけなので、行を数えると 0 件
       ——長期タスクから運ぶと**時刻が一度も取れませんでした**（実測：
       列の真上 x=20 でも、y 160〜710 の全点で時刻が null）。 */
    const someday = list.classList.contains("tl-someday");
    const dayList = someday
      ? (root && root.querySelector(".todo-day .tl-list")) || list
      : list;
    const dayKey = someday ? shownDay() : day;

    tlDrag = { id, row, list, dayList, someday, day: dayKey, len,
               target: null, y0, moved: false, axis: axisOf(dayList) };
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

    /* **行は、いっさい動かしません。**

       前はここで空きの行を破線の帯にして上下へ広げ、押し下がったぶんだけ
       画面をずらし返していました。掴んだ行は指の下に留まりますが、**狙って
       いた先のほうは動きます**——組み替わった軸の上で狙い直すことになる。
       開いた帯そのものも「置けるのはここ」と言っていて、捨てた考え方の
       生き残りでした（実測：帯が5つ、合わせて490px ぶん割り込んでいた）。

       狙いの線は、行の中ではなく**一枚の層**に乗せます。列ぜんぶが一本の
       軸なので、線の置き場を行で分ける理由がありません。行に仕込むと、
       線は必ず行の境目に吸い寄せられます。 */
    const aimLayer = node(html`
      <div class="tl-aim" aria-hidden="true">
        <span class="tl-aim-line"><span class="tl-band-time"></span></span>
      </div>
    `);
    (dayList.closest(".tl") || dayList).append(aimLayer);
    tlDrag.aimLayer = aimLayer;

    /* **持ち上げた行は、指についてきます。**

       前は行がその場に残って薄くなるだけで、動いているのは細い線と札だけ
       でした。何を運んでいるのかが手の中に無いので、狙いを合わせている
       あいだ「いま何を動かしているか」を覚えていないといけません。

       写しを一枚、画面の上に浮かせて指の高さへ運びます。**縦だけ**——
       時間軸は縦なので、横に振れると狙いが揺れて見えます。もとの行は
       薄いまま残します（どこから来たかが見える）。 */
    const gb = row.getBoundingClientRect();
    /* **原寸の写しではなく、縮めたカードにします。** 行をそのまま持ち上げると
       指の下が広く塞がって、下の時間割が読めません。要るのは「何を運んで
       いるか」だけなので、絵と題と長さの三つに削ります。 */
    const mark0 = row.querySelector(".todo-mark");
    /* 題は `.item-name`。`.tl-title` は無いので、行ぜんぶの字（時刻＋題＋
       事実）が札に入っていました。 */
    const title0 = (row.querySelector(".item-name") || row).textContent.trim();
    const span0 = t.minutes ? KN.plan.humanSpan(t.minutes) : "";
    const ghost = node(html`
      <div class="tl-ghost" style="--cat:${tlColorOf(t, NaN)}">
        <span class="tl-ghost-mark"></span>
        <span class="tl-ghost-body">
          ${span0 ? html`<span class="tl-ghost-when">${span0}</span>` : ""}
          <span class="tl-ghost-title">${title0}</span>
        </span>
      </div>
    `);
    if (mark0) ghost.querySelector(".tl-ghost-mark").append(mark0.cloneNode(true));
    const mb = (mark0 || row).getBoundingClientRect();
    ghost.style.left = Math.round(gb.left + 44) + "px";
    ghost.style.top = Math.round(mb.top + mb.height / 2) + "px";
    document.body.append(ghost);
    tlDrag.ghost = ghost;
    tlDrag.ghostY = mb.top + mb.height / 2;
    /* **＋ が、赤いゴミ箱に変わります。** 運んでいるあいだだけ。落とせば
       消えますが、**必ず取り消せます**（store.removeTodo が戻す手を返す）。 */
    const dock = document.getElementById("dock");
    if (dock && !dock.hidden) {
      const trash = node(html`<span class="tl-trash" aria-hidden="true">${icon("trash")}</span>`);
      (dock.querySelector(".quick-add") || dock).append(trash);
      dock.classList.add("is-trash");
      tlDrag.trash = trash;
      tlDrag.dock = dock;
    }

    const scroller = KN.app.scrollerOf(list.closest(".screen")) || document.scrollingElement;
    tlDrag.scroller = scroller;
    tlDrag.x = row.getBoundingClientRect().left + 20;
    tlDrag.y = y0;
    tlDrag.raf = requestAnimationFrame(edgeScroll);

    const move = (ev) => {
      if (!tlDrag) return;
      /* 「動かした」と言えるのは、狙いが変わるだけ動いてから。指は置いた
         ままでも数px揺れるので、その揺れで時刻が書き換わっては困ります。 */
      if (Math.abs(ev.clientY - tlDrag.y0) > DRAG_SLOP) tlDrag.moved = true;
      tlDrag.x = ev.clientX; tlDrag.y = ev.clientY;
      moveGhost();
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

  /** 影を、指の高さへ。縦だけ動かします。 */
  function moveGhost() {
    const d = tlDrag;
    if (!d || !d.ghost) return;
    d.ghost.style.transform = `translateY(${(d.y - d.ghostY).toFixed(1)}px)`;
  }

  /** 画面の端まで運んだら、その向きへ送ります。

      指は画面から出られないので、これが無いと**画面の外にあるものへは
      運べません**——長期タスクの欄が下に隠れていたら、そこへは置けない。
      端に近いほど速くします（深く入るほど急いでいる、と読む）。
      送ったあとは狙いを取り直します——中身が指の下で動いたので。 */
  function edgeScroll() {
    const d = tlDrag;
    if (!d) return;
    const sc = d.scroller;
    if (sc) {
      const b = sc.getBoundingClientRect();
      let v = 0;
      if (d.y < b.top + EDGE_BAND) v = -(b.top + EDGE_BAND - d.y) / EDGE_BAND;
      else if (d.y > b.bottom - EDGE_BAND) v = (d.y - (b.bottom - EDGE_BAND)) / EDGE_BAND;
      if (v) {
        const step = Math.sign(v) * Math.max(2, Math.min(1, Math.abs(v)) * EDGE_MAX);
        const was = sc.scrollTop;
        sc.scrollTop = was + step;
        if (sc.scrollTop !== was) { moveGhost(); aim(d.x, d.y); }
      }
    }
    d.raf = requestAnimationFrame(edgeScroll);
  }

  /** 左の列の、その高さが何時か（15分きざみ）。

      **縦の座標 → 時刻。それだけです。** そこに何が置いてあっても、置ける
      かどうかは問いません——丸薬の上でも、丸薬と丸薬のあいだでも、空きでも、
      同じ一本の軸の上の一点として読みます。目盛りは丸薬に合わせてあるので、
      丸薬の真横に指を置けば、その丸薬が言っている時刻が出ます。

      **横は見ません。** 前は列の切れ目（100px）より右を「順番で置きなおす」
      に振っていましたが、その分岐ごとやめました——行のどこを持ち上げても、
      同じ一本の時間軸です。

      狙いの線は一枚の層に置きます。指の高さがそのまま線の高さなので、
      **行の境目へ吸い寄せられることも、空きへ逃げることもありません。** */
  function railTime(d, x, y) {
    const a = d.axis;
    if (!a) return null;
    const box = d.dayList.getBoundingClientRect();
    if (box.height <= 0) return null;
    /* 節と節のあいだを、まっすぐ割ります。 */
    const yy = Math.min(box.height, Math.max(0, y - box.top));
    const pts = a.pts;
    let i = 1;
    while (i < pts.length - 1 && pts[i].y < yy) i++;
    const p0 = pts[i - 1], p1 = pts[i];
    const r = p1.y > p0.y ? (yy - p0.y) / (p1.y - p0.y) : 0;
    const t = Math.round((p0.min + Math.min(1, Math.max(0, r)) * (p1.min - p0.min)) / SLOT_MIN) * SLOT_MIN;

    const layer = d.aimLayer;
    const line = layer && layer.querySelector(".tl-aim-line");
    if (line) {
      const lb = layer.getBoundingClientRect();
      /* 線は**層の中の位置**で置きます（行の中の割合ではなく）。層は
         その日の時間割ぜんぶを覆っているので、指の高さをそのまま渡せます。 */
      const lineY = Math.min(box.bottom, Math.max(box.top, y)) - lb.top;
      line.style.top = lineY.toFixed(1) + "px";
      /* 線は列いっぱい。左右で言うことが違わなくなったので、時刻の側だけを
         指す理由がありません（下の aim() の但し書き）。 */
      line.style.width = (box.width).toFixed(1) + "px";
      layer.classList.add("is-on");
      const label = line.querySelector(".tl-band-time");
      if (label) label.textContent = KN.plan.toTime(t);
      /* **札は、指の上に逃がします。**

         線の高さにそのまま置くと、そこは指が乗っているところなので、
         いちばん読みたい数字が指の腹で隠れます。線の少し上（CSS の
         `bottom: 100%` ＋ 余白）へ出しておけば、同じ高さのことを言い
         ながら、指には隠れません。

         ただし列のいちばん上では、上に出す場所がありません。そこだけ
         下へ返します（`is-under`）——指のすぐ上に画面の端が来ている
         ときは、指も上からは触れないので下側が空いています。 */
      line.classList.toggle("is-under", lineY < AIM_LABEL_GAP);
    }
    return { at: t };
  }

  /** いま指の下にあるのは、どの置き場か。 */
  function aim(x, y) {
    const d = tlDrag;
    if (!d) return;
    [d.list, d.dayList, root].forEach((L) => {
      if (!L) return;
      L.querySelectorAll(".is-aim").forEach((el) => el.classList.remove("is-aim"));
    });
    if (d.aimLayer) d.aimLayer.classList.remove("is-on");
    if (d.trash) d.trash.classList.remove("is-armed");
    if (els.cal) els.cal.querySelectorAll(".is-drop").forEach((el) => el.classList.remove("is-drop"));

    /* ---- ゴミ箱 ----

       **いちばん先に見ます。** 下の帯の上に浮いているので、あとに回すと
       「長期タスクの欄」のほうが先に当たります。 */
    if (d.trash) {
      const b = d.trash.getBoundingClientRect();
      const over = b.width > 0 && x >= b.left - 8 && x <= b.right + 8
                              && y >= b.top - 8 && y <= b.bottom + 8;
      d.trash.classList.toggle("is-armed", over);
      if (over) { d.target = { kind: "trash" }; return; }
    }

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

    /* ---- 長期タスクの欄 ----

       **探すのは節のほう**（.tl-someday-sec）です。中の `ul.tl-someday` は
       一件も無いと組まれないので、いちばん要る「空っぽの長期タスクへ
       最初の一件を運ぶ」がちょうど落とせませんでした。 */
    const sec = root && root.querySelector(".tl-someday-sec");
    if (!d.someday && sec) {
      const b = sec.getBoundingClientRect();
      if (b.height > 0 && y >= b.top && y <= b.bottom) {
        sec.classList.add("is-aim");
        d.target = { kind: "someday" };
        return;
      }
    }

    /* ---- 長期タスクの欄の中で並べ替える ---- */
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

    /* ---- 時間割の中は、どこでも時刻 ----

       **横は見ません。** 前はここで左右に振っていました——列の切れ目
       （100px）より左なら時刻、右なら「順番で置きなおす」。行のどこを
       持ち上げたかで、同じ縦の動きが別のことになる、ということです。
       題は行のいちばん広い的なので、**ふつうに掴むと必ず並び順のほう**に
       落ちていました（実測：x=170 では全高で時刻が取れない）。

       分岐ごとやめます。時間割の中はどこでも同じ一本の時間軸で、縦の座標が
       そのまま15分きざみの時刻です。並び順は、時刻が決めます。

       **時間割での「並び順だけ変える」は無くなりました。** 長期タスクの欄
       （時刻を持たない行）の中の並べ替えは、上のとおり残っています。 */
    const timeAt = railTime(d, x, y);
    d.target = timeAt ? { kind: "time", at: timeAt.at } : null;
  }

  /** つまんだ手を離したところ。
   *  @param {boolean} commit 置くかどうか。指を離したなら true。
   *    ブラウザに指の追跡を取り上げられた（pointercancel）ときは false
   *    ——**離していないのだから、まだどこへ置くとも言っていません。** */
  function drop(commit) {
    const d = tlDrag;
    tlDrag = null;
    if (!d) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    d.row.classList.remove("is-lifted");
    d.list.classList.remove("is-dragging");
    d.dayList.classList.remove("is-dragging");
    [d.list, d.dayList, root].forEach((L) => {
      if (!L) return;
      L.querySelectorAll(".is-aim").forEach((el) => {
        el.classList.remove("is-aim", "is-aim-before");
      });
    });
    /* 狙いの層を片づけます。行には何も仕込んでいないので、畳むものは
       これだけです（空きを広げるのをやめたので、閉じる手当ても要らない）。 */
    if (d.aimLayer) d.aimLayer.remove();
    if (d.ghost) d.ghost.remove();
    if (d.trash) d.trash.remove();
    if (d.dock) d.dock.classList.remove("is-trash");
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

    /* ゴミ箱へ落とした。**消しますが、取り消せます。** やることは人の予定
       そのものなので、戻す手を必ず添えること。 */
    if (d.target.kind === "trash") {
      const undo = store.removeTodo(d.id);
      KN.motion.fire("save");
      haptic(14);
      KN.ui.toast(`「${t.title}」を削除しました`, {
        action: { label: "元に戻す", onClick: undo },
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

    /* 長期タスクの欄へ運んだ。**日付と時刻を外します。**

       「いつやるか決めていないもの」に戻す、ということです。順番で置き
       なおすときに時刻だけ手放すのとは違って、こちらは日付も手放します
       ——長期タスクの欄にいるのは `due` を持たない用事なので。 */
    if (d.target.kind === "someday") {
      if (!t.due && !t.time) { render(); return; }
      const was = { due: t.due, time: t.time };
      store.updateTodo(d.id, { due: null, time: null });
      KN.motion.fire("save");
      KN.ui.toast(`「${t.title}」を長期タスクへ`, {
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

    /* **時間割の「順番で置きなおす」は、もうここへ来ません。**
       aim() が時間割の中で返すのは `time` だけになりました（左右の分岐を
       やめたので）。並び順は時刻が決めます。 */
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
  function tlColorOf(t, atMin) {
    /* 一日ずつのときは、棚がありません。坂（締切までの遠さ）も、比べる
       相手が画面に無いので何も言えません。基調の塗りひとつで揃えます。 */
    if (oneDay()) return "var(--c-primary-fill)";
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
    return node(html`
      <li class="tl-free-row ${past ? "is-past" : ""}"
          data-at="${String(f.atMin)}" data-until="${String(f.untilMin)}"
          style="--cat:var(--c-primary-fill)">
        <span class="tl-time"></span>
        <span class="tl-rail ${dash ? "is-dash" : ""}"></span>
      </li>
    `);
  }

  /* 丸の高さは nodeH（上）が決めます。長さを決めた用事だけが伸びて、
     行そのものは伸びません——伸びるのは丸のほうだけ、というのが参考画面の
     作りでした。 */

  /** 一つの用事。丸薬のアイコンが線の上に乗り、右に印を付ける丸。 */
  /** 済ませた時刻。`doneAt` は UTC の ISO なので、**読むのは地元の時刻**
      です（`getHours` が直します——文字を切り出すと9時間ずれます）。
      昔の記録は日付だけのことがあるので、時刻を持たないものは出しません。 */
  function doneClock(iso) {
    if (!iso || !/\d{1,2}:\d{2}/.test(String(iso))) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /** 下の行が、すぐ上の行の**時間の中で**起きたか（丸薬どうしをぶつけるか）。

      組み立ての `clash` は「時刻を決めたものどうし」しか見ません。済ませた
      ものは押した時刻に置かれる（plan.js の doneSpan）ので、4時間の朝の
      ルーティンの途中で済ませた用事は、ルーティンの**下の行**に、線で
      つながれて並びます。すると絵は「ルーティンが終わってから、次の用事」
      と読めて、ルーティンの丸薬がまだ途中まで（`--pass` 0.27）なのに、
      その下の丸薬だけ色が付いている——時間が逆に流れて見えました
      （2026年9月27日の画面）。重なりは重なりとして、ぶつけて見せます。

      **決めた長さどうしのときだけ。** 長さを書いていない用事の 30分は、
      置き場所を決めるための仮の数です（nodeH の但し書き）。仮の数で
      重なりを言うと、続けて二つ済ませただけで丸薬がぶつかります。
      だから上の行は長さを持っていること、下の行は**本当の時刻**
      （決めた時刻・長さから出した始まり・済ませた時刻）がその中にあること。 */
  function landsInside(above, it) {
    if (!above || !above.todo || !Number(above.todo.minutes)) return false;
    const real = it.fixed || Number(it.todo && it.todo.minutes)
      ? it.atMin
      : (it.doneAtMin != null ? it.doneAtMin : null);
    return real != null && real >= above.atMin && real < above.untilMin;
  }

  function itemRow(it, joined, day, touch) {
    const t = it.todo;
    /* 書くのは「決めたこと」だけ。決めていない長さは出しません。 */
    const facts = [];
    /* 時刻あり・毎日・残り手順は、ここには出しません。行の左側（時刻の
       太さ）と、押す丸の繰り返しアイコンがすでに言っています。手順の残数は、
       行の下をひらけば見えます。

       **済ませた時刻は出します。** ここには「左の時刻の列がすでに書いて
       いる」と書いてありましたが、あれは**予定の時刻**です。7時に置いた
       用事を9時に済ませたなら、その二つは別のこと——記録として残るのは
       後者のほうです。 */
    if ((t.done || t.archived) && t.doneAt) {
      const c = doneClock(t.doneAt);
      if (c) facts.push(html`<span class="tl-doneat">${icon("check")}<i>${c}</i></span>`);
    }
    /* 買い物の一件だけは、**いま何個ぶんか**をその場で数えます。置いた
       ときの数を写しておくと、★をひとつ足した瞬間に古くなるので。 */
    const sc = store.subCount(t, day);
    /* 繰り返す用事は、今日の行と翌日以降の行が**同じ t.id**を指します
       （fallsOn の但し書き——記録は増やしません）。だから開閉も day を
       混ぜた鍵で見張ります。混ぜないと、今日ひらいた手順が翌日の同じ
       行にもひらいたまま出ました。 */
    const subsKey = day ? `${t.id}@${day}` : t.id;
    const subsOpen = openSubs.has(subsKey);
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
      <li class="tl-row ${joined ? "is-joined" : ""} ${it.clash || touch ? "is-clash" : ""}
                 ${closed ? "is-done" : ""}"
          data-todo-id="${t.id}" data-flip="${t.id}"
          data-at="${String(it.atMin)}" data-until="${String(it.untilMin)}"
          style="--cat:${tlColorOf(t, it.atMin)};--tl-h:${nodeH(it)}px">
        ${/* 時刻を決めていない用事の時刻は、その場で詰めた**目安**なので「ごろ」を
              添えます（B6）。前は字の太さだけが違い、「17:03」を決めた時刻と
              読み違えました（詳細を開くと「時刻なし」）。「ごろ」は時刻の**下**に
              浮かせます——列は 44px で横に並べる幅が無く、行の中に積むと時刻の
              字が丸の中心からずれるので。済ませたもの（押した時刻）には付けない。 */""}
        <span class="tl-time ${it.fixed ? "is-fixed" : ""}">${tlClock(it.at)}${
          !it.fixed && !closed && it.at ? html`<span class="tl-about">ごろ</span>` : ""}</span>
        <span class="tl-rail" data-grow><span class="tl-node">${tlMark(t)}</span></span>
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
    li.querySelector(".tl-open").addEventListener("click",
      () => openSheet(t.id, li.querySelector(".tl-node")));
    /* 絵（レールの丸）も、押せば詳細が開きます。行の中で絵だけが「押しても
       何も起きないところ」でした——見た目には題と同じ一つの行なので、
       どちらを押しても同じ場所へ行くのが素直です。

       運んだ指が離れぎわに起こす click は、lift() の eatClick が食べるので、
       ここには来ません（置きなおすたびに詳細が開くことはありません）。 */
    const rail = li.querySelector(".tl-rail");
    if (rail) rail.addEventListener("click",
      () => openSheet(t.id, li.querySelector(".tl-node")));
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
      /* 長押し＝スキップ。500msは「押し間違いでは届かないが、待たされた
         とは感じない」長さ（iOSのcontext menuの既定と同じ帯）。キーボードの
         Enter/Spaceは pointerdown を起こさないので、長押し扱いにはなりません
         （下の click だけが走ります）。 */
      const HOLD_MS = 500;
      (t.subs || []).forEach((s0) => {
        /* s0 は「手順そのもの」（題・並び）。済み方は繰り返す用事だと
           day 基準の上書きから読みます（subStatus の但し書き参照）——
           s0.done / s0.skipped をそのまま出すと、今日チェックした手順が
           翌日の同じ行にもチェック済みで出ます。 */
        const st0 = store.subStatus(t, s0, day);
        const s = { ...s0, done: st0.done, skipped: st0.skipped };
        const gestureKey = day ? `${day}:${s.id}` : s.id;
        const line = node(html`
          <li class="tl-sub ${s.done ? "is-done" : ""} ${s.skipped ? "is-skipped" : ""}">
            <button type="button" class="check is-sub" role="checkbox"
                    aria-checked="${s.done ? "true" : s.skipped ? "mixed" : "false"}"
                    aria-label="${s.title}${s.skipped ? "（できなかった）" : ""} を終わりにする（長押しでできなかったことにする）">${s.skipped ? icon("minus") : icon("check")}</button>
            <span class="tl-sub-name">${s.title}</span>
          </li>
        `);
        const btn = line.querySelector("button");

        /* 見た目を、いま store にある値に合わせて描き直します。s は
           このループの外で捕まえたスナップショットなので、toggle のあとは
           必ず store から読み直します。 */
        function paint() {
          const fresh = store.getTodo(t.id);
          const raw = (fresh && (fresh.subs || []).find((x) => x.id === s.id)) || s;
          const cur = fresh ? store.subStatus(fresh, raw, day) : { done: s.done, skipped: s.skipped };
          line.classList.toggle("is-done", !!cur.done);
          line.classList.toggle("is-skipped", !!cur.skipped);
          btn.setAttribute("aria-checked", cur.done ? "true" : cur.skipped ? "mixed" : "false");
          btn.setAttribute("aria-label",
            `${raw.title}${cur.skipped ? "（できなかった）" : ""} を終わりにする（長押しでできなかったことにする）`);
          btn.innerHTML = KN.icons.svg(cur.skipped ? "minus" : "check");
        }

        /* store を書き換えると、その一拍で画面ぜんぶが描き直されます
           （app.js の store.subscribe）——このボタン自身も新しい要素に
           差し替わるということです。**500ms経った時点**（指はまだ
           乗っている）で確定させるので、その描き直しはここでも起こります
           ——それでも構いません。古いボタンは DOM から外れて pointercancel
           を受け取るだけで、以後は何もしません（下の holdFired の早期
           returnがそれ）。

           足りないのはタッチの「代替の」click です。pointerup のあとに
           続けて発行され、差し替わった**新しい**要素をあらためて叩きます
           ——preventDefault は touchstart 側で呼ばないと間に合わず、
           pointerdown 側で呼んでも止まりません（実機のCDP touchで確かめて
           踏んだ動きです。これが「スキップの直後にもう一度タップ＝完了が
           走る」の正体でした）。だから「扱った」の印はボタン要素にもこの
           描画のクロージャにも持たせず、手順の id で見張ります
           （subGestureAt、モジュール直下＝描き直しをまたいで生きています）。 */
        let holdTimer = 0, holdFired = false;
        const clearHold = () => { clearTimeout(holdTimer); holdTimer = 0; };
        /* 長押し確定。指を離すのを待たず、ここで「できなかった」を立てます
           ——離したときにしか反応しないと、0.5秒経っても何も起きていないように
           見えて、指を離すまで長押しと認められません。 */
        function commitHold() {
          holdFired = true;
          holdTimer = 0;
          subGestureAt.set(gestureKey, Date.now());
          KN.motion.fire("warn", btn);
          store.toggleSubSkip(t.id, s.id, day);
          paint();
        }
        function release(commit, e) {
          clearHold();
          // 長押しはもう確定済み。離す・キャンセルのどちらでも、ここでは
          // 何もしません（二重に切り替えてしまうので）。
          if (holdFired) { holdFired = false; return; }
          if (!commit) return;
          /* 500ms経った時点で store を書き換えると、その一拍で行が丸ごと
             差し替わります——このボタンはもう外れています。それでも
             ブラウザは、外れたことに気づいた直後の pointerup を、いま
             同じ場所にある**新しい**ボタンへ渡すことがあります（実機の
             CDP touchで確かめて踏んだ動きです）。新しいボタンの
             holdFired は false（何も知らない、生まれたての状態）なので、
             ここで防がないと長押しの直後に完了/選択なしがもう一度走り、
             せっかく立てた「できなかった」が一拍でまた消えます。

             **見分けるのは「指を置き直したか」。** 新しいタップは必ず
             pointerdown（キーボードなら keydown）から始まり、そこで印を
             消します（下）。印が残っているうちに来たものは、同じ指の
             続きです。時間の物差しだけだと、すぐあとに同じ手順を本当に
             もう一度押した（できなかった→選択なし、を続けてやりたいときは
             普通にあります）のまで弾いてしまいます。
             前は pointerId で見分けていましたが、iPhone の震えるつまみ
             （motion.js の FEEL）が出す click は pointerId を持たないことが
             あり、それだと長押しの直後の click を通してしまいます。 */
          const at = subGestureAt.get(gestureKey);
          if (at && Date.now() - at < 2000) return;
          subGestureAt.set(gestureKey, Date.now());
          const fresh = store.getTodo(t.id);
          const raw = (fresh && (fresh.subs || []).find((x) => x.id === s.id)) || s;
          const cur = fresh ? store.subStatus(fresh, raw, day) : { done: s.done, skipped: s.skipped };
          if (cur.skipped) {
            /* 「できなかった」のところへの短いタップは、選択なしへ戻します。
               toggleSub を呼ぶと done が立ってしまう（できなかった→できた、
               という順に進んでしまう）ので、ここは toggleSubSkip で外すだけ。 */
            KN.motion.fire("uncheck", btn);
            store.toggleSubSkip(t.id, s.id, day);
          } else {
            KN.motion.fire(cur.done ? "uncheck" : "check", btn);
            if (!cur.done) KN.ui.burst(btn);
            store.toggleSub(t.id, s.id, day);
          }
          paint();
        }
        btn.addEventListener("pointerdown", (e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          subGestureAt.delete(gestureKey);   // 新しい指。前の指の印を消す
          holdFired = false;
          holdTimer = setTimeout(commitHold, HOLD_MS);
        });
        btn.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") subGestureAt.delete(gestureKey);
        });
        /* 短いタップを決めるのは click だけ。pointerup では決めません。
           pointerup で store を書き換えると、その場で行ごと描き直され、
           iPhone の震えるつまみ（motion.js の FEEL）が、震える前に DOM から
           外れていました——手順の丸だけ震えなかったのはこれ。click まで
           待てば、つまみは震えてから click を出し、それがここへ上がって
           きます。送った指の click は、つまみが button へ渡しません。 */
        btn.addEventListener("pointerup", (e) => release(false, e));
        btn.addEventListener("pointercancel", (e) => release(false, e));
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          // 長押しを決めたあとの同じ指の click は、release の中の見張りが
          // 黙って弾きます。
          release(true, e);
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
        const open = !openSubs.has(subsKey);
        if (open) openSubs.add(subsKey); else openSubs.delete(subsKey);
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
    /* 一日の道が出ていれば、「いま」は紙のいちばん上（道の上の人）にいます。
       時間割の「いま」まで送ると、道が画面の外へ出ていくので、頭へ戻すだけ。 */
    if (root.querySelector(".day-road")) {
      const sc = KN.app.scrollerOf(root);
      if (sc.scrollTop > 0) {
        restoring = true;
        sc.scrollTop = 0;
        setTimeout(() => { restoring = false; }, 60);
      }
      return;
    }
    const mark = root.querySelector(".tl-now")
      || root.querySelector(".tl-row:not(.is-done)");
    if (!mark) return;
    /* 測るのも動かすのも、**実際に送っている器**（紙）です。画面のほうは
       もう動きません——そこを測ると box.height が画面ぜんぶになって、
       狙いの高さ（AIM）が紙の中のどこでもない場所を指します。 */
    const root2 = KN.app.scrollerOf(root);
    const box = root2.getBoundingClientRect();
    const at = mark.getBoundingClientRect();
    const want = root2.scrollTop + (at.top - box.top) - box.height * AIM;
    const max = Math.max(0, root2.scrollHeight - root2.clientHeight);
    const to = Math.round(Math.min(max, Math.max(0, want)));
    if (Math.abs(to - root2.scrollTop) < 4) return;
    /* 送ったことが「その人が動かした」と読まれないよう、ひと呼吸伏せます
       （restoreTop と同じ約束。見ている日の印が動いてしまうので）。 */
    restoring = true;
    root2.scrollTop = to;
    setTimeout(() => { restoring = false; }, 60);
  }

  /* 開いた一拍のうちに。組み終わってから測るので、一枚あとの絵で。
     道の人は、開いた瞬間に四歩あるいて止まります（day-road.js の「歩く」）。 */
  function onEnter() {
    requestAnimationFrame(toNow);
    if (KN.dayRoad) KN.dayRoad.walk(root);
  }

  KN.screens = KN.screens || {};
  /* open … 用事の紙を外から開く（通知から来た紙の「用事の紙を開く」、js/due-sheet.js）。 */
  KN.screens.todo = { mount, render, dockButton, onEnter, day: () => titleDay(), open: (id) => openSheet(id),
    /* ほかから「その日を見せて」（これからの二週間・js/upcoming.js）。暦の月も
       その日へ合わせます——一日ずつの紙でなければ、その日の棚まで運びます
       （「今日へ戻る」と同じ二通り）。 */
    goDay: (day) => {
      const d = KN.util.dayDate(day);
      if (!d) return;
      setCalMonth(d.getFullYear(), d.getMonth(), true);
      if (oneDay()) { goDay(day, day > shownDay() ? 1 : -1); return; }
      markDay(day, true);
      jumpToDay(day);
    } };
})();
