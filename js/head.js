/* =========================================================
   くらしノート — 上の帯と暦は、全タブで一つ（docs/shared-header.md の段2）

   daily・やること・買うもの・価格・ダイエットの上の帯（題・今日へ戻る・さがす・設定）と
   暦の置き場は、**この一つ**です。`.screens` の中でも、タブの流れ
   （`#panes` の中の画面）の外に居るので、席を移っても 1px も動きません
   ——動かないことを、中身をそろえることではなく**作り**で保証します
   （案B「一つに見せる」を採らなかった理由は docs に）。

   ■ 帯は一つ、応えはタブごと

   題を押す・今日へ戻る・虫めがね は、どのタブでも同じ場所の同じボタン
   ですが、押したときに何をするかはタブが決めます（やること・ダイエット：
   週⇄月、daily：月を選ぶ小窓）。だから各画面はいままでどおり自分の手で
   ボタンに結び、**押されたときに持ち主が自分かどうか**を `mine()` で
   見ます。持ち主でない画面は黙る。買うもの・価格の応え（週⇄月・今日へ）
   だけは、日を持たない二画面にかわってこのファイルが結びます（下）。

   ■ 暦の枠は一つ、印はタブごと

   暦（`.cal`）そのものは、これまでどおり各画面が組みます——マスに何を
   描くか（やることの絵・daily の粒・ダイエットの飲酒の帯）がタブごとに
   違うので。**全タブ共通の印にしてはいけない**：daily にダイエットの
   達成の棒が出て、「daily は評価しない」を破ります（tests/daily-rules.js）。
   置き場（`.head-cal`）は一つで、持ち主の暦だけがそこに居ます。

   ■ 持ち主

   いちばん最後に出たタブ（daily・やること・買うもの・価格・ダイエットの
   どれか）。設定は持ち主を変えません——設定は帯ごと押しのけて上に重なる
   一枚で、その下に居るのは歯車を押した画面の帯のままなので（左端から
   引くと、それが見える）。

   席を移るときは、印だけを重ねて替えます（段4。下の crossMarks）。

   ■ 買うもの・価格の暦（段3・段4）

   その日に買ったものの丸（段4）を描く暦を、ここで**一枚だけ**組みます
   （`shopCal()`）。買うものと
   価格は同じ一枚を置くので、紙を下げて価格へ移っても暦は差し替わりません。
   日を押すと動くのは共通の日（`dayShare`、席を移るとき app.js の show() が
   `day()` を読んで置いていく）と題だけ——買うものの紙そのものは変わりません
   （「その日に買ったもの」を出すのは、あとで足せる拡張）。紙を横に払って
   日を送る手つき（day-swipe）は付けません。暦そのものを横に払う
   （cal-swipe）のは、ほかのタブと同じ。題を押すと週⇄月。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const U = KN.util;
  const { html, node, icon } = U;

  /** 帯を持つタブ。 */
  const TABS = ["archive", "notes", "todo", "list", "prices", "diet"];

  let root = null;
  let owner = null;
  const els = {};

  function mount() {
    root = document.getElementById("head");
    if (!root) return;
    root.innerHTML = "";
    root.append(node(html`
      <header class="topbar">
        <div class="topbar-row">
          ${KN.util.dayTitleBar()}
          <button class="icon-btn js-upcoming" aria-label="これからの二週間">${icon("calendar")}</button>
          <button class="icon-btn js-search-btn" aria-label="さがす">${icon("search")}</button>
          <button class="icon-btn head-gear js-settings" aria-label="設定">${icon("gear")}</button>
        </div>
      </header>
    `));
    root.append(node(html`<div class="head-cal"></div>`));
    els.topbar = root.querySelector(".topbar");
    els.dayRow = root.querySelector(".topbar-dayrow");
    els.dayTitle = root.querySelector(".js-day-title");
    els.today = root.querySelector(".js-go-today");
    els.searchBtn = root.querySelector(".js-search-btn");
    els.cal = root.querySelector(".head-cal");
    /* ノートの題は日付ではなく「Notes」（docs/notes.md「ノートでは暦をしまう」）。
       日付の題と同じ場所に重ね、紙を下げる `--face-p` で入れ替えます（CSS）。 */
    els.name = node(html`<span class="topbar-title head-name" aria-hidden="true">Notes</span>`);
    els.dayRow.append(els.name);
    /* 歯車と「これからの二週間」（R7・js/upcoming.js）は、どのタブでも同じ
       ことをします。二週間の一覧で日を押すと、やることのその日へ。 */
    root.querySelector(".js-upcoming").addEventListener("click", () => {
      KN.motion.fire("select");
      KN.upcoming.open();
    });
    root.querySelector(".js-settings").addEventListener("click", (e) => {
      KN.app.showScreen("settings");
      /* 歯車が半周まわる（base.css の「押した席の絵が応える」）。 */
      KN.motion.fire("poke", e.currentTarget);
    });
    /* 買うもの・価格の題と「今日へ戻る」の応えは、ここが持ちます（二つの
       画面は日を持たないので、暦と日はこのファイルの中にあります）。ほかの
       タブと同じく、持ち主でなければ黙ります。 */
    els.dayTitle.addEventListener("click", () => {
      if (!shopMine()) return;
      KN.motion.fire("select");
      KN.store.setCalPref("list", { open: !calOpen() });   // 組み直しは subscribe が
    });
    /* 今日へ戻るのも、払いと同じ道（shopGo）を通します。前は日を戻して
       暦を塗るだけで、紙に知らせて（dayMoved）いなかったので、前の日の
       「その日に買ったもの」が紙に居残っていました（2026年9月28日、実機）。 */
    els.today.addEventListener("click", () => {
      if (!shopMine()) return;
      KN.motion.fire("select");
      shopGo(U.todayKey());
    });
  }

  /** その画面が、いま帯の持ち主か。 */
  const mine = (id) => owner === id;

  /**
   * 席を移るとき、入ってくる画面を組む**前**に呼びます（app.js の show）。
   * 帯を出すか隠すかと、虫めがねの光り方・読み上げを、入ってくるタブに
   * 合わせます。暦と題は、このあとの `render()` が自分で置きます——同じ
   * 一拍のうちなので、前のタブの暦が一瞬でも描かれることはありません。
   */
  function enter(id) {
    if (!root) return;
    if (id === "settings") return;            // 持ち主はそのまま（上を参照）
    if (!TABS.includes(id)) {
      owner = null;
      root.hidden = true;
      return;
    }
    /* 持ち主が替わるなら、出ていく暦の印を写しておきます（putCal が、
       差し替えたあとの重ねに使います）。ここで撮るのは、組み直しの**前**
       ——配置がまだ前の一拍のままで、測るのが安いので。 */
    snap = id !== owner ? snapMarks() : null;
    owner = id;
    root.hidden = false;
    const notes = id === "notes";
    root.classList.toggle("is-notes", notes);
    els.name.setAttribute("aria-hidden", String(!notes));
    /* 虫めがねは一つなので、光るかどうかは入ってくるタブの窓で決めます
       （光るのは「いま絞り込んでいる」ときだけ——ui.js の wireSearch）。 */
    const input = document.querySelector(`#screen-${id} .js-search`);
    const on = !!(input && input.value);
    els.searchBtn.classList.toggle("is-on", on);
    els.searchBtn.setAttribute("aria-expanded", String(on));
    if (input) els.searchBtn.setAttribute("aria-label", input.getAttribute("aria-label") || "さがす");
  }

  /** 持ち主の暦を置き場に据えます。持ち主でなければ何もしません。
      **同じ要素なら触りません**——外して付け直すだけで、その木ぶんの
      レイアウトがやり直しになります（screen-todo.js の renderBody）。 */
  function putCal(id, cal) {
    if (!root || !mine(id)) return;
    const s = snap;
    snap = null;
    if (!cal) { if (els.cal.firstChild) els.cal.replaceChildren(); return; }
    if (cal.parentNode === els.cal && els.cal.childNodes.length === 1) return;
    els.cal.replaceChildren(cal);
    if (s) crossMarks(s, cal);
  }

  /* ---------------- 席を移るとき、印だけをふわっと替える（段4） ----------------

     枠（曜日・数字・輪）は動きませんが、マスの印はタブごとに違うので、
     要素を差し替えた一拍で**いきなり**替わっていました（実機で「急に出て
     くる」）。そこで、出ていく暦の印（`.cal-dots`）の写しを同じ位置に重ねて
     薄れさせ、半ばまで薄れたところで入ってきた暦の印を浮かび上がらせます
     （`--m-marks` の半分ずらして重ねる。まったく同時だと二タブぶんの印が
     重なって見え、順にすると急に見えた——どちらも実機）。

     写しは `.cal` の外、帯の直下（`.head-ghost`）に置きます。暦の中に
     置くと「帯の暦は一枚だけ」「daily の暦にダイエットの棒が無い」
     （tests/head-still.js・daily-rules の約束）が、重ねのあいだだけ嘘に
     なります。写しは押せず、読み上げにも出ません。 */
  let snap = null;        // enter が撮った、出ていく暦の印の写し
  let fadeT = 0;
  let fading = null;      // 浮かび上がらせている最中の暦

  function snapMarks() {
    const old = els.cal && els.cal.querySelector(":scope > .cal");
    if (!old || KN.motion.still()) return null;
    const base = root.getBoundingClientRect();
    const clip = (old.querySelector(".cal-clip") || old).getBoundingClientRect();
    const out = [];
    old.querySelectorAll(".cal-dots").forEach((d) => {
      if (!d.childElementCount) return;
      const r = d.getBoundingClientRect();
      if (!r.width || r.bottom <= clip.top || r.top >= clip.bottom) return;   // 伏せてある週
      out.push({ el: d.cloneNode(true), x: r.left - base.left, y: r.top - base.top, w: r.width });
    });
    return out;
  }

  function crossMarks(s, cal) {
    clearTimeout(fadeT);
    root.querySelectorAll(":scope > .head-ghost").forEach((g) => g.remove());
    if (fading) fading.classList.remove("is-marks-in");
    let ghost = null;
    if (s.length) {
      ghost = node(html`<div class="head-ghost" aria-hidden="true"></div>`);
      s.forEach((m) => {
        m.el.style.left = `${m.x.toFixed(1)}px`;
        m.el.style.top = `${m.y.toFixed(1)}px`;
        m.el.style.width = `${m.w.toFixed(1)}px`;
        ghost.append(m.el);
      });
      root.append(ghost);
    }
    fading = cal;
    cal.classList.add("is-marks-in");
    fadeT = setTimeout(() => {
      if (ghost) ghost.remove();
      cal.classList.remove("is-marks-in");
      if (fading === cal) fading = null;
    }, 1.5 * KN.motion.ms("--m-marks") + 40);
  }

  /** 帯を持つタブか。 */
  const has = (id) => TABS.includes(id);

  /* ---------------- 買うもの・価格の暦（段4から、買ったものの丸） ---------------- */

  const shopMine = () => owner === "list" || owner === "prices";
  const calOpen = () => KN.store.calPrefs("list").open;
  const calShown = () => KN.store.calPrefs("list").shown;

  let sDay = null;      // 見ている日（null＝今日）
  let sMonth = null;    // 出している月（null＝見ている日の月）
  let sVer = 0;         // dayShare の、最後に見た番号
  let sCal = null;

  const sCur = () => sDay || U.todayKey();
  function shownMonth() {
    if (sMonth) return sMonth;
    const d = U.dayDate(sCur()) || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  /** 日を選ぶ（今日なら null に戻す）。出している月もその日へ。 */
  function setDay(key) {
    sDay = key === U.todayKey() ? null : key;
    const d = U.dayDate(key);
    sMonth = d ? { year: d.getFullYear(), month: d.getMonth() } : null;
  }

  /** ほかのタブで日が動いていたら、その日を引き取ります（ほかの画面の
      takeSharedDay と同じ）。 */
  function takeShared() {
    const t = U.dayShare.take(sVer);
    sVer = t.ver;
    if (!t.day || t.day === sCur()) return;
    setDay(t.day);
  }

  function paintTitle() {
    if (!shopMine()) return;       // よそのタブの題を上書きしない
    U.paintDayTitleInto(els.dayRow, sCur(), `押すと暦を${calOpen() ? "たたむ" : "ひらく"}`);
    els.dayTitle.setAttribute("aria-expanded", String(calOpen()));
  }

  /** 輪は一つだけ置いて滑らせます（ほかの三つの暦と同じ）。 */
  function moveRing(grid, cell, jump) {
    if (!grid) return;
    let ring = grid.querySelector(".cal-ring");
    if (!ring) {
      ring = node(html`<i class="cal-ring is-jump" aria-hidden="true"></i>`);
      grid.prepend(ring);
    }
    const n = cell && cell.querySelector(".cal-n");
    if (!n) { ring.classList.remove("is-on"); return; }
    const g = grid.getBoundingClientRect();
    const b = n.getBoundingClientRect();
    if (!g.width || !b.width) return;              // まだ並んでいない
    const first = !ring.classList.contains("is-on");
    ring.classList.toggle("is-jump", !!jump || first);
    ring.style.transform = `translate(${(b.left - g.left).toFixed(1)}px, ${(b.top - g.top).toFixed(1)}px)`;
    ring.classList.add("is-on");
    if (jump || first) {
      requestAnimationFrame(() => requestAnimationFrame(() => ring.classList.remove("is-jump")));
    }
  }

  /** いま出している週の外のマスに印を付けます（週で見ているときは CSS が
      隠します）。選んでいる日が出している月に無ければ、その月の頭の週。 */
  function markWeek(sec) {
    const open = calOpen();
    sec.classList.toggle("is-week", !open);
    sec.classList.toggle("is-hidden", !calShown());
    if (open) {
      sec.querySelectorAll(".is-off-week").forEach((c) => c.classList.remove("is-off-week"));
      return;
    }
    tagOffWeek(sec, sCur());
  }

  /** いまの週の外に印を付けます（月で見ているときも。cal-peek が引きはじめに
      呼ぶ——行きと帰りで見え方が違わないように）。 */
  function tagOffWeek(sec, here) {
    const first = sec.querySelector(".cal-day");
    const hasHere = !!sec.querySelector(`.cal-day[data-day="${here}"]`);
    const w = U.weekOf(hasHere ? here : (first ? first.dataset.day : here));
    sec.querySelectorAll(".cal-day").forEach((c) => {
      const k = c.dataset.day;
      c.classList.toggle("is-off-week", k < w.from || k > w.to);
    });
    const padsOn = !!first && first.dataset.day >= w.from && first.dataset.day <= w.to;
    sec.querySelectorAll(".cal-pad").forEach((c) => c.classList.toggle("is-off-week", !padsOn));
  }

  /* ---- 買ったものの絵（段4） ----

     その日に買ったもの（買うものの「買った」、`checkedAt`）を、やることの
     暦と同じ丸で出します（`.cal-mark`——カテゴリの色に染まった丸の中に、
     その品物の絵を白抜きで）。三つまで。材料は daily の「その日に買った
     もの」（store.dayFeed の③）と同じで、写しは持ちません。

     `checkedAt` は UTC の ISO なので、日は `dayKey(new Date(...))` で
     ローカルに直して数えます（頭10文字を切ると、朝の買い物が前の日へ
     回ります——store.js の dayOfStamp）。

     絵を決める順は store.productMark と同じ（手で選んだ絵→名前→カテゴリの
     名前）。当たらなければ、やることと同じ小さな丸だけ——包みの絵
     （productIcons.fallback）は色つきで、白抜きの丸に入れると塗りが潰れます。
     引いた答えは覚えておきます（findKey は安くありません。screen-todo.js の
     cachedArt と同じ理由）。 */
  const artMemo = new Map();
  function boughtArt(p) {
    const P = KN.productIcons;
    const cat = KN.store.getCategory(p.categoryId);
    const ck = `${p.icon || ""}\u0001${p.name}\u0001${(cat && cat.name) || ""}`;
    let v = artMemo.get(ck);
    if (v === undefined) {
      const key = (p.icon && P.byKey(p.icon) && p.icon)
        || P.findKey(p.name) || (cat && P.findKey(cat.name)) || "";
      v = (key && P.byKey(key)) || "";
      artMemo.set(ck, v);
    }
    return v;
  }

  /** 日ごとの、その日に買った品物（同じ品物は一つ、買った順に三つまで）。 */
  function boughtByDay() {
    const s = KN.store.get();
    const by = new Map();
    (s.items || []).filter((i) => i.checked && i.checkedAt)
      .sort((a, b) => String(a.checkedAt).localeCompare(String(b.checkedAt)))
      .forEach((i) => {
        const k = U.dayKey(new Date(i.checkedAt));
        const p = k && KN.store.getProduct(i.productId);
        if (!p) return;
        const list = by.get(k) || [];
        if (list.length < 3 && !list.includes(p)) list.push(p);
        by.set(k, list);
      });
    return by;
  }

  function marksHtml(list) {
    return (list || []).map((p) => {
      const svg = boughtArt(p);
      const inner = svg
        ? `<span class="todo-mark">${svg}</span>`
        : `<span class="todo-mark is-plain"><i class="todo-dot"></i></span>`;
      return `<i class="cal-mark" style="--cat:${KN.store.productColor(p) || "var(--c-primary-fill)"}">${inner}</i>`;
    }).join("");
  }

  /* 日のマスは KN.calGrid が組みます。`.cal-dots` は、買ったものが無い日も
     空のまま置きます（マスの背丈をほかのタブの暦とそろえるため。そろわないと、
     タブを移るたびに帯の厚みが変わります）。 */

  /** 日が動いたことを、買うものの紙へ知らせます（2026年9月28日から）。
      紙は、今日でない日に合わせると、その日に買ったものを頭に出すので
      （screen-list.js の `dayBought`）。組み直すのは紙の中身だけで、暦は
      ここで塗ったまま——`render()` を呼ぶと暦まで組み直して輪が跳びます。
      価格は日で中身が変わらないので、知らせません。 */
  function dayMoved() {
    if (owner !== "list") return;
    const scr = KN.screens && KN.screens.list;
    if (scr && scr.dayMoved) scr.dayMoved();
  }

  /** 日を押した。共通の日を動かし、買うものの紙には知らせます（dayMoved）。 */
  function pick(key, b) {
    KN.motion.fire("select");
    const cur = shownMonth();
    setDay(key);
    const m = shownMonth();
    /* 隣の月のマス（週で見ているときの端）なら、その月で組み直します。 */
    if (m.year !== cur.year || m.month !== cur.month) { fill(sCal); dayMoved(); return; }
    sCal.querySelectorAll(".cal-day.is-here").forEach((c) => c.classList.remove("is-here"));
    b.classList.add("is-here");
    moveRing(sCal.querySelector(".cal-grid"), b);
    paintTitle();
    dayMoved();
  }

  /** 紙を横に払って、日を送った（買うもの。2026年9月28日から）。
      暦の日を押したのと同じく、共通の日を動かして紙に知らせます（dayMoved）
      ——送った先が週の外なら出す週も替えます（押すときは、見えて
      いる週の日しか押せないので要らなかった）。 */
  function shopGo(key) {
    if (!key) return;
    const cur = shownMonth(), was = sCur();
    setDay(key);
    if (!sCal) { paintTitle(); dayMoved(); return; }
    const m = shownMonth();
    if (m.year !== cur.year || m.month !== cur.month) { fill(sCal); dayMoved(); return; }
    sCal.querySelectorAll(".cal-day.is-here").forEach((c) => c.classList.remove("is-here"));
    const b = sCal.querySelector(`.cal-day[data-day="${key}"]`);
    if (b) b.classList.add("is-here");
    markWeek(sCal);
    const crossed = U.otherWeek(was, key);
    if (crossed) U.slideWeek(sCal, key > was ? 1 : -1);
    moveRing(sCal.querySelector(".cal-grid"), b, crossed);
    paintTitle();
    dayMoved();
  }

  /** 組みます。`only` を渡すのは、隣の週を先に見せるために離れたところへ
      組むときだけ（そのぶんは画面に出ないので、週の印も輪も置きません）。 */
  function fill(sec, only) {
    /* 隣の月のマスにも出します（やることと同じ理由——空にすると
       「翌月1日は何も無い」と嘘をつく）。 */
    const bought = boughtByDay();
    const { year, month } = only || shownMonth();
    const grid = KN.calGrid.fill(sec, {
      year, month, here: sCur(), outToday: true,
      mark: (k) => ({ html: marksHtml(bought.get(k)) }),
      pick: (k, b) => pick(k, b),
    });
    if (only) return;
    markWeek(sec);
    paintTitle();
    moveRing(grid, grid.querySelector(".cal-day.is-here"), true);
  }

  /** その月ぶんの盤。いま出している月なら、生きている盤をそのまま（KN.calGrid）。 */
  const monthGridFor = KN.calGrid.monthGridFor({
    live: () => sCal, shown: () => shownMonth(), fill: (tmp, only) => fill(tmp, only),
  });

  /**
   * 買うもの・価格が `render()` の中で呼んで、`putCal` に渡す一枚。
   * 共通の日を引き取り、組み直して返します。要素はいつも同じ一つです。
   */
  function shopCal() {
    takeShared();
    if (!sCal) {
      sCal = node(html`<section class="cal"></section>`);
      const grid = KN.calPeek.mount(sCal).grid;
      /* 暦を横に払う手つきは、ほかのタブと同じ一つ（cal-swipe.js）。
         週は日ごと送り、月は出している月だけをめくります。 */
      KN.calSwipe.wire({
        sec: sCal, grid,
        isWeek: () => !calOpen(),
        here: sCur,
        step: (delta) => U.shiftDay(sCur(), delta * 7),
        monthGrid: monthGridFor,
        go: (delta) => {
          KN.motion.fire("nav");
          if (!calOpen()) setDay(U.shiftDay(sCur(), delta * 7));
          else {
            const m = shownMonth();
            const d = new Date(m.year, m.month + delta, 1);
            sMonth = { year: d.getFullYear(), month: d.getMonth() };
          }
          fill(sCal);
          if (!calOpen()) dayMoved();
        },
      });
    }
    fill(sCal);
    return sCal;
  }

  /**
   * 買うものの紙の掴み手を引くと、暦が開く（2026年9月28日から。ほかのタブと
   * 同じ js/cal-peek.js の三段——下へ引けば週→月、週から上へ押せば暦なし）。
   * 前はこの掴み手が価格へのものでしたが、価格へは帯の「shopping」を押して
   * 行くようになりました（app.js）。**紙が価格へ下がって留まっているあいだは
   * 引きません**——そのときの掴み手は、買うものへ戻る道（wireFaceGrip）なので。
   */
  function shopPeek(o) {
    KN.calPeek.wire({
      sheet: o.sheet,
      root: o.root,
      cal: () => sCal,
      isOpen: calOpen,
      isShown: calShown,
      enabled: () => o.enabled() && owner === "list" && !KN.app.faceAt("list"),
      busy: () => KN.calSwipe.isActive(),
      here: sCur,
      tagOffWeek,
      /* 段が変わったら書くだけ（組み直しは store の subscribe から）。
         変わらなかったときは、引きはじめに付けた印を塗り直します。 */
      commit: ({ shown, open }) => {
        if (open !== calOpen() || shown !== calShown()) {
          KN.store.setCalPref("list", { open, shown });
        } else if (sCal) markWeek(sCal);
      },
    });
  }

  /* 端末の外の控えの見張り（R25、js/backup.js の offDeviceStale）。古く
     なったら歯車に小さな点だけ。押すまで何も言いません（トースト・通知・赤
     なし）。書き出し・Dropbox の送信はどちらも store を書き換えるので、
     subscribe で消えます。一フレームにまとめて、同じ値なら書き直しません。 */
  let dotQueued = false;
  function paintDot() {
    dotQueued = false;
    const btn = root && root.querySelector(".js-settings");
    if (!btn || !KN.backup || !KN.backup.offDeviceStale) return;
    const on = !!KN.backup.offDeviceStale();
    if (btn.classList.contains("has-dot") === on) return;
    btn.classList.toggle("has-dot", on);
    btn.setAttribute("aria-label", on ? "設定（端末の外の控えが古くなっています）" : "設定");
  }
  function queueDot() {
    if (dotQueued) return;
    dotQueued = true;
    requestAnimationFrame(paintDot);
  }

  /* 今日の丸は、**その日はじめて開いたときだけ**一度脈打つ（roadmap-unify の U16・
     docs/motion.md の「開いたとき、満ちる」）。帯も `arrive` の相手で（app.js の show）、
     打つかどうかだけここが決める。席を移るたびに打つと多すぎる。見た日は store の外の鍵に
     （day-road.js の SEEN_KEY と同じ作り）。帯が隠れている・今日のマスが見えていない
     （ノート・ほかの月）ときは、見たことにしない。 */
  const BEAT_KEY = "kn-cal-beat";
  if (KN.motion) KN.motion.onArrive((el) => {
    if (el !== root) return;
    let first = false;
    const n = root.hidden ? null : root.querySelector(".cal-day.is-today .cal-n");
    if (n && n.offsetWidth) {
      try {
        first = localStorage.getItem(BEAT_KEY) !== U.todayKey();
        if (first) localStorage.setItem(BEAT_KEY, U.todayKey());
      } catch (_) { /* 残せない端末では打たない */ }
    }
    root.classList.toggle("is-day-first", first);
  });

  mount();
  paintDot();
  if (KN.store) KN.store.subscribe(queueDot);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") queueDot();
  });

  KN.head = { els, mine, enter, putCal, has, TABS, shopCal, shopDay: sCur, shopGo, shopPeek };
})();
