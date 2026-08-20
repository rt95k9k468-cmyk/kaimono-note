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
  const { html, node, icon, haptic } = KN.util;
  const U = KN.util;
  const store = KN.store;
  const D = KN.diet;
  const DR = KN.drinks;

  let root = null;
  let els = {};
  /* グラフの期間。まず7日を出します——「最近どうか」を見るのに、
     30日は入り口としては長すぎます（30日ぶんの点は、電話の幅では
     一日ぶんが10pxほどになり、日々の上下が読めません）。 */
  let range = 7;              // グラフの期間（日）。0 は全期間。
  let analysisWindow = 30;
  let series = "";             // 体重と並べて見るもの。空なら体重だけ。

  /* いま見ている日。null は「今日」——日付を焼き込まないのは、日付が
     変わったあともアプリを開きっぱなしにしていることがあるからです。 */
  let viewDay = null;
  const curDay = () => viewDay || U.todayKey();
  const isViewToday = () => curDay() === U.todayKey();
  /** 見出しに出す日の呼び名。今日なら「今日」、ほかの日は「8月17日」。 */
  const dayName = () => (isViewToday() ? "今日" : U.formatDay(curDay()));

  /* 一日の順に、日の高さで。朝は昇る日、昼は真上の日、夜は月——
     間食だけは時刻ではないので、食べもののほうを描きます。 */
  const SLOTS = [
    { id: "breakfast", label: "朝食", ico: "sunrise" },
    { id: "lunch",     label: "昼食", ico: "sun" },
    { id: "dinner",    label: "夕食", ico: "moon" },
    { id: "snack",     label: "間食", ico: "snack" },
  ];
  const slotLabel = (id) => (id === "memo" ? "メモ" : (SLOTS.find((s) => s.id === id) || {}).label || "間食");

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
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">ダイエット</h1>
              <div class="topbar-sub js-sub"></div>
            </div>
            ${/* 右端から 設定・取り込み。ほかの画面と同じ並べ方で、
                 いちばん右がいつも設定です。 */""}
            <button class="icon-btn js-sync" aria-label="ヘルスケアから取り込む" title="ヘルスケアから取り込む">
              ${icon("download")}
            </button>
            <button class="icon-btn js-settings" aria-label="設定" title="設定">${icon("gear")}</button>
          </div>
        </header>
        <div class="js-body"></div>
      </div>
    `);
    root.append(chrome);

    els = {
      sub: chrome.querySelector(".js-sub"),
      body: chrome.querySelector(".js-body"),
      sync: chrome.querySelector(".js-sync"),
      settings: chrome.querySelector(".js-settings"),
      topbar: chrome.querySelector(".topbar"),
    };

    els.sync.addEventListener("click", openSyncSheet);
    els.settings.addEventListener("click", () => KN.showScreen("settings"));

    /* カレンダーは貼りつけません（やることのタブとはそこだけ違います）。
       紙のいちばん上に印刷してあるものとして、スクロールで一緒に流れます。 */
    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  function render() {
    const keepTop = root ? root.scrollTop : 0;
    const day = curDay();
    const card = D.dayCard(day);
    const win = Math.max(range || 365, 30);
    // 上の枠はその日の話、下の「目標」はいまの話。
    const sum = D.weightSummary(win, day);
    const now = isViewToday() ? sum : D.weightSummary(win);

    els.sub.textContent = U.formatDate(U.dayDate(day) || new Date());

    els.body.innerHTML = "";
    els.cal = monthCalendar();
    els.body.append(els.cal);
    /* 並びは「カレンダーで選んだ日の話」から。
         からだ＋食事 … その日そのもの（カレンダーのすぐ下）
         体重＋推移   … その日の体重と、そこまでの動き
         気づき＋目標 … ときどき読み返すもの */
    els.body.append(node(html`
      <div class="diet">
        <section class="card section js-day-card">
          <div class="js-body-stats"></div>
          <div class="divider"></div>
          <div class="js-meals"></div>
        </section>
        <div class="js-today"></div>
        <section class="card section diet-look">
          <div class="js-insight"></div>
          <div class="divider"></div>
          <div class="js-goal"></div>
        </section>
      </div>
    `));

    renderBodyStats(els.body.querySelector(".js-body-stats"), card);
    renderMeals(els.body.querySelector(".js-meals"), card);
    renderToday(els.body.querySelector(".js-today"), card, sum);
    renderInsight(els.body.querySelector(".js-insight"));
    renderGoal(els.body.querySelector(".js-goal"), now);

    /* その日の話をしている二枚は、横に払えば日をめくれます。
       カレンダーまで手を伸ばさずに、昨日・一昨日と辿れるように。 */
    wireDaySwipe(els.body.querySelector(".js-day-card"));
    wireDaySwipe(els.body.querySelector(".diet-hero"));

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

  function shownMonth() {
    if (calMonth) return calMonth;
    const d = U.dayDate(curDay()) || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  /* その日の点。何件あるかではなく、**何が書いてあるか**を出します。
       ・体重を量った
       ・食事を書いた
       ・お酒（飲んだ＝緑／飲んでいない＝青）

     三つめが青いのは、飲まなかった日も記録だからです。点が出ないと
     「書き忘れ」と見分けがつかず、休肝日が続いていることも見えません。
     ただし、その日に何ひとつ書いていなければ何も出しません——使う前の
     日々が「飲んでいない日」として青く並ぶのは、記録ではなく作り話です。 */
  function dayDots(d) {
    const out = [];
    if (store.weightOfDay(d)) out.push("kg");
    if (store.mealsOfDay(d).length) out.push("meal");
    const drank = store.drinksOfDay(d).length;
    const anyHealth = store.healthValue(d, "steps") != null || store.healthValue(d, "sleep") != null;
    if (drank) out.push("drink");
    else if (out.length || anyHealth) out.push("dry");
    return out;
  }

  function monthCalendar() {
    const sec = node(html`
      <section class="cal">
        <h2 class="cal-head">
          <span class="cal-month"></span>
          <span class="cal-year"></span>
          <button type="button" class="cal-now js-now" hidden>今日へ</button>
          <span class="cal-nav">
            <button type="button" class="cal-arrow js-prev" aria-label="前の月">${icon("chevron")}</button>
            <button type="button" class="cal-arrow js-next" aria-label="次の月">${icon("chevron")}</button>
          </span>
        </h2>
        <div class="cal-grid"></div>
      </section>
    `);
    const grid = sec.querySelector(".cal-grid");

    const goTo = (delta) => {
      const m = shownMonth();
      const d = new Date(m.year, m.month + delta, 1);
      haptic();
      calMonth = { year: d.getFullYear(), month: d.getMonth() };
      fillCalendar(sec);
    };
    sec.querySelector(".js-prev").addEventListener("click", () => goTo(-1));
    sec.querySelector(".js-next").addEventListener("click", () => goTo(1));
    sec.querySelector(".js-now").addEventListener("click", () => {
      haptic();
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

  function fillCalendar(sec) {
    const today = U.todayKey();
    const here = curDay();
    const now = U.dayDate(today);
    const { year, month } = shownMonth();
    const thisMonth = year === now.getFullYear() && month === now.getMonth();
    const total = new Date(year, month + 1, 0).getDate();
    const lead = new Date(year, month, 1).getDay();

    sec.setAttribute("aria-label", `${year}年${month + 1}月`);
    sec.querySelector(".cal-month").textContent = `${month + 1}月`;
    sec.querySelector(".cal-year").textContent = String(year);
    sec.querySelector(".js-now").hidden = thisMonth && here === today;

    const grid = sec.querySelector(".cal-grid");
    grid.innerHTML = "";
    U.WEEKDAYS.forEach((w, i) => grid.append(node(html`
      <span class="cal-wd ${i === 0 ? "is-sun" : (i === 6 ? "is-sat" : "")}">${w}</span>
    `)));
    for (let i = 0; i < lead; i++) grid.append(node(html`<span class="cal-pad"></span>`));

    for (let d = 1; d <= total; d++) {
      const key = U.dayKey(new Date(year, month, d));
      const wd = (lead + d - 1) % 7;
      const isToday = key === today;
      /* 先の日には点を打ちません（記録は過去にしか無いので）。 */
      const dots = key > today ? [] : dayDots(key);
      const n = dots.length;
      const cell = node(html`
        <button class="cal-day ${isToday ? "is-today" : ""} ${key === here ? "is-here" : ""}
                       ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
                data-day="${key}" ${isToday ? KN.util.raw('aria-current="date"') : ""}
                aria-label="${month + 1}月${d}日${isToday ? "（今日）" : ""}${
                  n ? (dots.includes("drink") ? " 記録あり・飲酒あり" : " 記録あり") : ""}">
          <span class="cal-n">${String(d)}</span>
          <span class="cal-dots" style="--cat:var(--c-primary)"></span>
        </button>
      `);
      const host = cell.querySelector(".cal-dots");
      dots.forEach((kind) => host.append(node(html`<i class="cal-dot ${kind === "dry" ? "is-dry" : ""}"></i>`)));
      cell.addEventListener("click", () => {
        viewDay = key === today ? null : key;
        calMonth = { year, month };
        haptic();
        /* 先に輪だけ動かします。組み直しのあとに置き直すと、そのときには
           もう新しい枠なので、輪は滑らずに現れることになります。 */
        moveRing(grid, cell);
        render();
      });
      grid.append(cell);
    }
    // 描いたあとに、選んでいる日へ置きます（並んでいないと測れません）。
    moveRing(grid, grid.querySelector(".cal-day.is-here"), true);
  }

  /* ---------------- 横に払って、日をめくる ----------------

     カレンダーで選べますが、「昨日はどうだったか」を見るのに毎回上まで
     戻るのは遠い。その日のことが書いてある枠そのものを払えば、日が動きます。
     左へ払えば次の日、右へ払えば前の日——紙をめくる向きと同じです。

     縦は下に譲ります（画面ぜんぶがスクロールするので）。向きは最初の
     数ピクセルで決めて、そのまま最後まで持ちます。 */
  function wireDaySwipe(el) {
    if (!el) return;
    const THRESHOLD = 56;
    let id = null, x0 = 0, y0 = 0, dx = 0, axis = null, frame = 0;

    const paint = () => {
      frame = 0;
      el.style.transform = dx ? `translateX(${dx}px)` : "";
    };
    const reset = () => {
      el.style.transition = "transform .2s var(--ease-out)";
      dx = 0;
      paint();
      setTimeout(() => { el.style.transition = ""; }, 220);
    };

    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // 中の押せるものは、押せるままにします。
      if (e.target.closest("input, textarea, select")) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null;
      el.style.transition = "";
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!axis) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      }
      if (axis !== "x") return;
      /* 今日より先には行けないので、そちら向きは重くします（動かないの
         ではなく、動きにくい——端に来たことが指に伝わります）。 */
      const blocked = mx < 0 && isViewToday();
      const m = blocked ? mx * 0.25 : mx;
      dx = Math.abs(m) <= THRESHOLD ? m : Math.sign(m) * (THRESHOLD + (Math.abs(m) - THRESHOLD) * .3);
      if (!frame) frame = requestAnimationFrame(paint);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      const moved = dx;
      id = null; axis = null;
      if (Math.abs(moved) < THRESHOLD) { reset(); return; }
      const next = U.shiftDay(curDay(), moved < 0 ? 1 : -1);
      if (next > U.todayKey()) { reset(); return; }
      el.style.transition = "";
      dx = 0;
      paint();
      viewDay = next === U.todayKey() ? null : next;
      /* カレンダーは、めくった先の月に合わせます（月をまたいだときに
         その日の枠が無いと、緑の輪がどこにも行けません）。 */
      const d = U.dayDate(next);
      calMonth = { year: d.getFullYear(), month: d.getMonth() };
      haptic();
      render();
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", (e) => { if (e.pointerId === id) { id = null; axis = null; reset(); } });
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
  function renderToday(host, card, sum) {
    const w = card.weight;
    const g = sum.goal;
    const pace = D.neededPace();
    const when = dayName();

    const sec = node(html`
      <section class="card diet-hero">
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
      </section>
    `);
    sec.querySelector(".js-weight").addEventListener("click", () => openWeightSheet(card.weight, card.day));
    renderGraph(sec.querySelector(".js-graph"));
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
  function renderGraph(host) {
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
          ${store.get().diet.goal.targetKg != null ? html`<span class="diet-legend-item"><i class="dot-goal"></i>目標</span>` : ""}
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

    sec.querySelector(".js-chart").append(chart());
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

    const values = pts.map((p) => p.kg)
      .concat(ma7.map((m) => m.value), ma14.map((m) => m.value));
    let lo = Math.min(...values), hi = Math.max(...values);
    /* 目標線は、近ければ枠に入れます。20kg先の目標まで無理に収めると、
       実測の線が一本の水平線に潰れて、何も読めなくなります。 */
    if (goal != null && goal >= lo - 6 && goal <= hi + 6) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
    if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.6; hi = mid + 0.6; }
    const padY = (hi - lo) * 0.12;
    lo -= padY; hi += padY;

    const x = (day) => padL + idx(day) * dayW;
    const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    const path = (rows, get) => rows.map((r, i) => `${i ? "L" : "M"}${x(r.day).toFixed(1)} ${y(get(r)).toFixed(1)}`).join(" ");

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

       三本では、線と線のあいだが広すぎて、点がどのあたりの重さなのかを
       目分量で割ることになっていました。五本に増やして、**等間隔**に
       引きます（前は「上・真ん中・下」で、真ん中だけが端数でした）。

       いちばん下の線は棒の足もとに重ねます。そうすると、線の間隔がその
       まま棒の目盛りの刻みになり、**同じ線の左右に体重と棒の数**を書け
       ます。二つのものさしを一つの枠で読ませるには、線を共有させるのが
       いちばん誤解が少ない。 */
    const GRID_N = 5;
    const gBot = H - padB;                         // いちばん下＝棒の足もと
    const gTop = padT + 12;                        // いちばん上（飲んだ日の印の下）
    const gridY = [];
    for (let i = 0; i < GRID_N; i++) gridY.push(gBot - (gBot - gTop) * i / (GRID_N - 1));
    // その高さが指す体重（y の逆算）。
    const vAt = (yy) => lo + (1 - (yy - padT) / (H - padT - padB)) * (hi - lo);

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

    const svg = node(html`
      <svg class="diet-chart" viewBox="0 0 ${W} ${H}" role="img"
           aria-label="体重の推移のグラフ${sel.id ? `（${sel.label}を並べています）` : ""}">
        ${KN.util.raw(bars.map((b) => {
          const h = barH(b.value);
          return `<rect class="diet-bar" x="${(x(b.day) - barW / 2).toFixed(1)}" y="${(gBot - h).toFixed(1)}"
                        width="${barW.toFixed(1)}" height="${Math.max(0.6, h).toFixed(1)}" rx="1.2"/>`;
        }).join(""))}
        ${KN.util.raw(gridY.map((yy, i) =>
          `<line class="diet-gridline" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"/>`
          + `<text class="diet-axis" x="${padL - 5}" y="${(yy + 3.4).toFixed(1)}" text-anchor="end">${vAt(yy).toFixed(1)}</text>`
          + (sel.id
            ? `<text class="diet-axis is-right" x="${W - padR + 4}" y="${(yy + 3.4).toFixed(1)}">${
                barText(barTop * i / (GRID_N - 1))}</text>`
            : "")
        ).join(""))}
        ${goal != null && goal >= lo && goal <= hi
          ? KN.util.raw(`<line class="diet-goal-line" x1="${padL}" y1="${y(goal).toFixed(1)}" x2="${W - padR}" y2="${y(goal).toFixed(1)}"/>`)
          : ""}
        ${ma14.length > 1 ? KN.util.raw(`<path class="diet-ma14" d="${path(ma14, (m) => m.value)}"/>`) : ""}
        ${ma7.length > 1 ? KN.util.raw(`<path class="diet-ma7" d="${path(ma7, (m) => m.value)}"/>`) : ""}
        ${KN.util.raw(pts.map((p) =>
          `<circle class="diet-dot ${p.source === "health" ? "is-health" : ""}" cx="${x(p.day).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="1.9"/>`
        ).join(""))}
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
      g.addEventListener("click", () => { haptic(); showDrinkDay(g.getAttribute("data-day")); });
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
    const rows = [
      { type: "steps", label: "歩数", unit: "歩", ico: "steps",
        value: showValue("steps", card.steps), manual: isManual(card.day, "steps") },
      { type: "burned", label: "総消費", unit: "kcal", ico: "flame",
        value: card.burned == null ? "—" : n0(card.burned),
        manual: isManual(card.day, "activeEnergy") || isManual(card.day, "restingEnergy") },
      { type: "sleep", label: "睡眠", unit: "", ico: "moon",
        value: card.sleep == null ? "—" : hm(card.sleep), manual: isManual(card.day, "sleep") },
      /* 飲酒だけは「無い」ときも薄くしません。飲まなかった日は空白では
         なく **0%という記録**で、そこが薄いと「書き忘れ」に見えます。 */
      { type: "drink", label: "飲酒", ico: "drink", keep: true,
        value: pct + "%", unit: dt ? `${dt.estimated ? "約" : ""}${dt.alcoholG}g` : `目安${guide}g`,
        over: pct > 100 },
    ];
    const nothing = card.steps == null && card.burned == null && card.sleep == null
      && !card.workouts.length && !dt;

    const sec = node(html`
      <div class="stack">
        <div class="section-title">${icon("heart")}${dayName()}のからだ
          ${sync.lastAt ? html`<span class="section-note">取り込み ${U.formatStamp(sync.lastAt)}</span>` : ""}
        </div>
        <div class="diet-grid">
          ${KN.util.raw(rows.map((r) => `
            <button class="diet-cell js-cell ${r.type === "drink" ? "js-drink" : ""} ${
              r.value === "—" && !r.keep ? "is-blank" : ""}" data-type="${r.type}">
              <span class="diet-cell-ico">${icon(r.ico)}</span>
              <span class="diet-cell-label">${r.label}${r.manual ? '<i class="diet-hand" title="手入力">✎</i>' : ""}</span>
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
        haptic();
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
          haptic();
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
      haptic(12);
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

  function renderMeals(host, card) {
    const t = card.totals;
    const rem = card.remaining;
    const pfc = card.pfc;
    const meals = store.mealsOfDay(card.day);
    const memo = store.dayMemo(card.day);
    const others = meals.filter((m) => m.slot !== "memo");

    const sec = node(html`
      <div class="stack">
        <div class="section-title">${icon("meal")}${dayName()}の食事</div>

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

        ${card.drinkTotals ? html`
          <p class="diet-note">
            上の ${t ? t.kcal.toLocaleString() : "0"}kcal は<b>食べたもの</b>だけの数です。
            お酒のぶんを足すと
            <b class="mono-num">${((t ? t.kcal : 0) + card.drinkTotals.kcal).toLocaleString()}kcal</b>
            になります（お酒は栄養の内わけを持たないので、PFCの棒には入れていません）。
          </p>` : ""}
        ${t ? html`
          <div class="diet-pfc">
            ${/* 棒が何を言っているかは一つに決めます。目標があるならその進み具合、
                 無いなら熱量の内わけ。同じ棒に二つの意味を持たせると、
                 「Pの棒が短いのは足りないから? それとも脂質が多いから?」
                 が毎回わからなくなります。 */""}
            ${KN.util.raw(["p", "f", "c"].map((k) => {
              const name = { p: "P たんぱく質", f: "F 脂質", c: "C 炭水化物" }[k];
              const goalV = store.get().diet.goal[k + "Target"];
              const pct = goalV ? Math.min(100, Math.round(t[k] / goalV * 100))
                                : (pfc ? pfc[k] : 0);
              const over = goalV && t[k] > goalV;
              return `
                <div class="diet-pfc-row">
                  <span class="diet-pfc-name">${name}</span>
                  <span class="diet-pfc-bar ${over ? "is-over" : ""}"><i class="is-${k}" style="width:${pct}%"></i></span>
                  <span class="diet-pfc-num mono-num">${t[k]}g${goalV ? ` / ${goalV}` : ""}</span>
                </div>`;
            }).join(""))}
            ${t.fiber != null ? html`
              <div class="diet-pfc-row">
                <span class="diet-pfc-name">食物繊維</span>
                <span class="diet-pfc-bar"><i class="is-fiber" style="width:${Math.min(100, Math.round(t.fiber / 21 * 100))}%"></i></span>
                <span class="diet-pfc-num mono-num">${t.fiber}g</span>
              </div>` : ""}
            <p class="diet-note">${store.get().diet.goal.pTarget
              ? "棒は一日の目安に対する進み具合です。"
              : "棒は熱量の内わけです（目安を決めると、進み具合に変わります）。"}
              ${pfc ? `熱量比 P${pfc.p}% F${pfc.f}% C${pfc.c}%` : ""}</p>
          </div>` : ""}

        ${/* 朝昼夜間食の四つの枠はやめました。分けて書かせると、
              「これは昼か間食か」を毎回決めることになって、そのうち
              書かなくなります。書くのは一本のメモです——時間の順に
              足していくだけ。数は、あとから読み取らせます。 */""}
        <button class="diet-memo js-memo ${memo && memo.memo.trim() ? "" : "is-blank"}">
          <span class="diet-memo-head">
            <span class="diet-memo-ico">${icon("edit")}</span>
            <b>メモ</b>
            <span class="diet-memo-hint">${memo && memo.memo.trim() ? "タップして書き足す" : ""}</span>
          </span>
          <span class="diet-memo-body">${memo && memo.memo.trim()
            ? KN.util.escapeHtml(memo.memo)
            : "＋ 食べたものを書く（あとでAIに貼って、カロリーを返してもらえます）"}</span>
        </button>

        ${/* 前に朝昼夜間食で書いたぶんは、そのまま残して、ここから
              直せるようにしておきます（消したら書いたものが消えます）。 */""}
        ${others.length ? html`
          <div class="rows diet-old-meals">
            ${KN.util.raw(others.map((m) => {
              const kcal = m.items.reduce((a, i) => a + i.kcal, 0);
              const names = m.items.map((i) => i.name).join("・") || m.memo || "（メモだけ）";
              return `
                <button class="row js-old" data-id="${m.id}">
                  <span class="row-main">
                    <span class="row-title">${KN.util.escapeHtml(names)}</span>
                    <span class="row-sub">${slotLabel(m.slot)}${m.time ? " ・ " + m.time : ""}</span>
                  </span>
                  <span class="row-value mono-num">${kcal ? kcal.toLocaleString() + " kcal" : ""}</span>
                </button>`;
            }).join(""))}
          </div>` : ""}
      </div>
    `);

    sec.querySelector(".js-memo").addEventListener("click", () => openMemoSheet(card.day));
    sec.querySelectorAll(".js-old").forEach((b) => {
      b.addEventListener("click", () => {
        const m = others.find((x) => x.id === b.dataset.id);
        if (m) openMealSheet(m);
      });
    });
    host.append(sec);
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
     返ってくる形もちがって、読み取れなくなるので。 */
  const AI_LINES = [
    "摂取カロリー: 数値",
    "タンパク質: 数値",
    "脂質: 数値",
    "炭水化物: 数値",
    "食物繊維: 数値",
    "推定下限: 数値",
    "推定上限: 数値",
  ];

  function aiPrompt(memo) {
    return [
      "次の「食事メモ」から、その日の栄養を推定してください。",
      "",
      "【条件】",
      "・お酒（アルコール飲料）は計算に入れないでください。別に記録しています。",
      "・分量が書いていないものは、一般的な一人前として推定してください。",
      "・細かすぎる値にはせず、妥当な範囲の概数で答えてください。",
      "・カロリーは kcal、ほかは g で、数値だけを書いてください（単位や説明は不要）。",
      "・推定下限と推定上限は、摂取カロリーの推定の幅です。",
      "・次の7行だけを、この形のまま返してください。",
      "",
      AI_LINES.join("\n"),
      "",
      "【食事メモ】",
      String(memo || "").trim(),
    ].join("\n");
  }

  /* 返事の読み取り。行の頭の飾り（- や *）、全角のコロン、単位、
     「約」「およそ」、1800〜2000 のような幅——どれが来ても数を拾います。
     拾えなかった項目は null のままにします（0 で埋めると、聞いていない
     ことと「0だった」ことが同じになります）。 */
  const AI_KEYS = [
    { key: "low",   re: /(推定)?下限|最小|min/i },
    { key: "high",  re: /(推定)?上限|最大|max/i },
    { key: "fiber", re: /食物繊維|繊維|fiber/i },
    { key: "c",     re: /炭水化物|糖質|carb/i },
    { key: "f",     re: /脂質|脂肪|fat/i },
    { key: "p",     re: /たんぱく質|タンパク質|蛋白|protein/i },
    { key: "kcal",  re: /摂取カロリー|カロリー|エネルギー|kcal/i },
  ];

  function readAiReply(text) {
    const out = { kcal: null, p: null, f: null, c: null, fiber: null, low: null, high: null };
    let found = 0;
    String(text || "").split(/\r?\n/).forEach((line) => {
      const raw = line.trim().replace(/^[-・*＊●○\s]+/, "");
      if (!raw) return;
      const hit = AI_KEYS.find((k) => k.re.test(raw));
      if (!hit || out[hit.key] != null) return;
      // 数は「:」より右から拾います（左に混ざる数を拾わないため）。
      const rhs = raw.replace(/^[^:：]*[:：]/, "");
      const m = (rhs || raw).match(/-?\d+(?:[.,]\d+)?/);
      if (!m) return;
      const v = parseFloat(m[0].replace(",", ""));
      if (!Number.isFinite(v) || v < 0) return;
      out[hit.key] = Math.round(v * 10) / 10;
      found++;
    });
    out.found = found;
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

  /** AIの推計から、その日の合計に使う一件を作ります。 */
  function aiItem(ai) {
    if (!ai || (ai.kcal == null && ai.p == null && ai.f == null && ai.c == null)) return [];
    return [{
      name: "AI推計", grams: null,
      kcal: ai.kcal || 0, p: ai.p || 0, f: ai.f || 0, c: ai.c || 0,
      fiber: ai.fiber, from: "ai", foodId: null, estimated: true,
    }];
  }

  function openMemoSheet(day0) {
    const day = day0 || curDay();
    const cur = store.dayMemo(day);
    /* 手で書いた明細（前の作りで入れたもの）は触りません。AIの推計は
       「AI推計」の一件として別に持ちます——読み直すたびに、その一件だけを
       入れ替えます。 */
    const handItems = cur ? cur.items.filter((i) => i.from !== "ai").map((i) => ({ ...i })) : [];
    let ai = cur && cur.ai ? { ...cur.ai } : null;

    const body = node(html`
      <div class="stack">
        <div class="diet-daynav"><b>${U.formatDay(day)}</b></div>
        <textarea class="textarea js-memo" rows="7" spellcheck="false"
                  placeholder="トースト2枚とコーヒー&#10;昼 そば&#10;夜 鶏むね200g、ごはん150g"
                  aria-label="食べたもの">${cur ? cur.memo : ""}</textarea>
        <p class="diet-note">
          時間帯で分けなくてかまいません。書いた順に残ります。
          <b>メモだけでも保存できます</b>。
        </p>
        <button class="btn btn-soft btn-block js-prompt">${icon("copy")}AI用プロンプトを作成</button>
        <p class="diet-note js-promptnote">
          決まった聞き方と、この日のメモをひとつの文にしてコピーします。
          ChatGPTなどに貼って、返ってきた7行を下の欄に貼り戻してください。
          <b>お酒は計算に入れません</b>（お酒は別に記録しています）。
        </p>

        <div class="divider"></div>
        <div class="section-title">AI推計結果</div>
        <textarea class="textarea js-ai" rows="7" spellcheck="false"
                  autocapitalize="off" autocorrect="off"
                  placeholder="摂取カロリー: 1850&#10;タンパク質: 78&#10;脂質: 55&#10;炭水化物: 240&#10;食物繊維: 18&#10;推定下限: 1700&#10;推定上限: 2000"
                  aria-label="AIの返事">${cur && cur.ai ? cur.ai.raw : ""}</textarea>
        <button class="btn btn-soft btn-block js-read">${icon("sparkles")}AI結果を読み取る</button>
        <div class="js-got"></div>
        <div class="js-items"></div>
      </div>
    `);

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-primary js-save" style="flex:1">保存</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "食事のメモ", content: body, footer: foot, guard: true });
    const ta = body.querySelector(".js-memo");
    const aiTa = body.querySelector(".js-ai");
    if (!cur) KN.ui.focusNow(ta);

    /* ---- ① プロンプトを作ってコピー ---- */
    body.querySelector(".js-prompt").addEventListener("click", () => {
      const memo = ta.value.trim();
      if (!memo) { KN.ui.toast("先に食べたものを書いてください"); return; }
      const text = aiPrompt(memo);
      copyText(text).then((ok) => {
        haptic(10);
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

    /* ---- ② 返ってきた7行を読み取る ---- */
    function paintAI() {
      const host = body.querySelector(".js-items");
      host.innerHTML = "";
      if (!ai) {
        host.append(node(html`<p class="diet-note">まだ推計はありません。メモだけでも保存できます。</p>`));
        return;
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
      host.append(node(html`
        <p class="diet-note">この内容で保存します。数が違っていれば、AIの返事の欄を直して
          もう一度「AI結果を読み取る」を押してください。</p>`));
    }

    body.querySelector(".js-read").addEventListener("click", () => {
      const res = readAiReply(aiTa.value);
      if (!res.found) {
        KN.ui.toast("数のある行が見つかりませんでした");
        return;
      }
      ai = { ...res, raw: aiTa.value.trim(), at: new Date().toISOString() };
      delete ai.found;
      paintAI();
      KN.ui.toast(`${res.found}項目を読み取りました`);
      haptic();
    });
    paintAI();

    foot.querySelector(".js-save").addEventListener("click", () => {
      /* 貼っただけで読み取りを押していない人のために、保存のときにもう一度
         読みます（押し忘れで数が消えるほうが、勝手に読むより困ります）。 */
      if (aiTa.value.trim() && (!ai || ai.raw !== aiTa.value.trim())) {
        const res = readAiReply(aiTa.value);
        if (res.found) { ai = { ...res, raw: aiTa.value.trim(), at: new Date().toISOString() }; delete ai.found; }
      }
      if (!aiTa.value.trim()) ai = null;
      store.setDayMemo(day, ta.value, handItems.concat(aiItem(ai)), ai);
      haptic(10);
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
    mixed:         "scale",
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
  function autoDecimal(input) {
    let stop = false;
    let hadDot = input.value.includes(".");
    input.addEventListener("input", (e) => {
      const v = input.value;
      const del = !!(e && e.inputType && e.inputType.indexOf("delete") === 0);
      if (del && hadDot && !v.includes(".")) stop = true;   // 点を自分で外した
      hadDot = v.includes(".");
      if (stop || del || hadDot) return;
      if (!/^\d{3}$/.test(v)) return;
      input.value = v.slice(0, 2) + "." + v.slice(2);
      hadDot = true;
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) { /* type=number など */ }
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
    autoDecimal(kgEl);
    autoDecimal(body.querySelector(".js-fat"));
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
      haptic(10);
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
      haptic(10);
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
          このアプリで一度押すだけになります。
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
      KN.ui.toast(KN.healthSync.describe(res));
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

  /* 中継所からの自動取り込み。ここも「黙って失敗する」を守ります——
     電波の悪いところでタブを開くたびに赤い字が出るのは、報告ではなく
     邪魔です。中継所の不調を確かめたいときは、設定の「つないでみる」か
     取り込みシートの「中継所から取り込む」を押します。そこでは黙りません。 */
  function pullRelay() {
    return KN.healthRelay.pullAndImport().then((res) => {
      if (!res.ok) return res;                  // 空も、繋がらないも、黙って引く
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
  function refresh() {
    if (!KN.healthRelay.configured()) return Promise.resolve();
    return KN.healthRelay.pullAndImport().then((res) => {
      if (res.ok && (res.added || res.updated)) {
        lastAuto = res.text || lastAuto;
        render();
        KN.ui.toast("中継所：" + KN.healthSync.describe(res));
        return;
      }
      if (res.empty) { KN.ui.toast("中継所に新しいデータはありません"); return; }
      if (!res.ok) { KN.ui.toast(res.error || "中継所につながりませんでした"); return; }
      KN.ui.toast("中継所：" + KN.healthSync.describe(res));
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
      if (KN.activeScreen && KN.activeScreen() !== "diet") return;
      const st = store.get().settings;
      if (st.dietAutoSync === false) return;
      if (!KN.healthRelay.configured()) return;
      /* 置いた直後は、まだ届いていないことがあります（中継所のKVは
         結果整合で、伝わるまで少しかかる）。一度目で空でも、少し置いて
         もう一度だけ覗きます。二度で足りなければ、下に引けば取りにいきます。 */
      pullRelay().then((res) => {
        if (res && res.ok && (res.added || res.updated)) return;
        setTimeout(pullRelay, 4000);
      });
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
  }

  /* ---------------- ＋ ---------------- */

  function dockButton() {
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="食事を記録">${icon("plus")}</button>
      </div>
    `);
    // いちばん多い操作は食事です。体重は日に一度で、画面の一番上にあります。
    fab.querySelector(".js-open-add").addEventListener("click", () => openMemoSheet(curDay()));
    return fab;
  }

  KN.screens = KN.screens || {};
  KN.screens.diet = { mount, render, dockButton, onEnter, refresh,
    // 設定やテストから開けるように
    openWeightSheet, openMealSheet, openMemoSheet, openGoalSheet, openSyncSheet,
    // 聞き方と読み取りは、画面を通さずに確かめられるように出しておきます。
    aiPrompt, readAiReply };
})();
