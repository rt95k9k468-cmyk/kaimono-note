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
   週⇄月、daily：月を選ぶ紙）。だから各画面はいままでどおり自分の手で
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

   ■ 買うもの・価格の暦（段3）

   印を描かない暦を、ここで**一枚だけ**組みます（`shopCal()`）。買うものと
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
  const TABS = ["archive", "todo", "list", "prices", "diet"];

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
          <button class="icon-btn js-search-btn" aria-label="さがす">${icon("search")}</button>
          <button class="icon-btn js-settings" aria-label="設定">${icon("gear")}</button>
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
    /* 歯車だけは、どのタブでも同じことをします。 */
    root.querySelector(".js-settings").addEventListener("click",
      () => KN.app.showScreen("settings"));
    /* 買うもの・価格の題と「今日へ戻る」の応えは、ここが持ちます（二つの
       画面は日を持たないので、暦と日はこのファイルの中にあります）。ほかの
       タブと同じく、持ち主でなければ黙ります。 */
    els.dayTitle.addEventListener("click", () => {
      if (!shopMine()) return;
      KN.motion.fire("select");
      KN.store.setCalPref("list", { open: !calOpen() });   // 組み直しは subscribe が
    });
    els.today.addEventListener("click", () => {
      if (!shopMine()) return;
      KN.motion.fire("select");
      sDay = null;
      sMonth = null;
      if (sCal) fill(sCal);
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
    owner = id;
    root.hidden = false;
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
    if (!cal) { if (els.cal.firstChild) els.cal.replaceChildren(); return; }
    if (cal.parentNode === els.cal && els.cal.childNodes.length === 1) return;
    els.cal.replaceChildren(cal);
  }

  /** 帯を持つタブか。 */
  const has = (id) => TABS.includes(id);

  /* ---------------- 買うもの・価格の暦（印なし） ---------------- */

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
    const here = sCur();
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

  /** 日のマス一つ。**印は描きません**——`.cal-dots` は空のまま置きます
      （マスの背丈をほかのタブの暦とそろえるため。そろわないと、タブを
      移るたびに帯の厚みが変わります）。 */
  function cell(key, cls) {
    const d = U.dayDate(key);
    const wd = d ? d.getDay() : 0;
    const today = key === U.todayKey();
    const b = node(html`
      <button class="cal-day ${cls} ${today ? "is-today" : ""}
                     ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
              data-day="${key}" ${today ? U.raw('aria-current="date"') : ""}
              ${cls.includes("is-out") ? U.raw('tabindex="-1"') : ""}
              aria-label="${d ? `${d.getMonth() + 1}月${d.getDate()}日` : key}${today ? "（今日）" : ""}">
        <span class="cal-n">${d ? String(d.getDate()) : ""}</span>
        <span class="cal-dots"></span>
      </button>
    `);
    b.addEventListener("click", () => pick(key, b));
    return b;
  }

  /** 日を押した。共通の日を動かすだけで、紙は組み直しません。 */
  function pick(key, b) {
    KN.motion.fire("select");
    const cur = shownMonth();
    setDay(key);
    const m = shownMonth();
    /* 隣の月のマス（週で見ているときの端）なら、その月で組み直します。 */
    if (m.year !== cur.year || m.month !== cur.month) { fill(sCal); return; }
    sCal.querySelectorAll(".cal-day.is-here").forEach((c) => c.classList.remove("is-here"));
    b.classList.add("is-here");
    moveRing(sCal.querySelector(".cal-grid"), b);
    paintTitle();
  }

  /** 組みます。`only` を渡すのは、隣の週を先に見せるために離れたところへ
      組むときだけ（そのぶんは画面に出ないので、週の印も輪も置きません）。 */
  function fill(sec, only) {
    const here = sCur();
    const { year, month } = only || shownMonth();
    const total = new Date(year, month + 1, 0).getDate();
    sec.setAttribute("aria-label", `${year}年${month + 1}月`);
    const grid = sec.querySelector(".cal-grid");
    grid.innerHTML = "";
    const wds = sec.querySelector(".cal-wds");
    wds.innerHTML = "";
    U.WEEKDAY_COLS.forEach((wd) => wds.append(node(html`
      <span class="cal-wd ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}">${U.WEEKDAYS[wd]}</span>
    `)));
    const outer = U.outDays(year, month);
    outer.lead.forEach((k) => grid.append(cell(k, "is-out")));
    for (let d = 1; d <= total; d++) {
      const k = U.dayKey(new Date(year, month, d));
      grid.append(cell(k, k === here ? "is-here" : ""));
    }
    outer.trail.forEach((k) => grid.append(cell(k, "is-out")));
    if (only) return;
    markWeek(sec);
    paintTitle();
    moveRing(grid, grid.querySelector(".cal-day.is-here"), true);
  }

  /** その月ぶんの盤。いま出している月なら、生きている盤をそのまま。 */
  function monthGridFor(year, month) {
    const cur = shownMonth();
    if (sCal && cur.year === year && cur.month === month) return sCal.querySelector(".cal-grid");
    const tmp = node(html`<section class="cal"></section>`);
    KN.calPeek.mount(tmp);
    fill(tmp, { year, month });
    return tmp.querySelector(".cal-grid");
  }

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
        },
      });
    }
    fill(sCal);
    return sCal;
  }

  mount();

  KN.head = { els, mine, enter, putCal, has, TABS, shopCal, shopDay: sCur };
})();
