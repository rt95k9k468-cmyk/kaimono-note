/* =========================================================
   くらしノート — daily

   買い物は「何を買う」、やることは「いつまでに何をする」を答えます。
   ここが答えるのは **「あの月は、どんな月だったか」** です。過去にしか
   向いていない画面で、締切も、次にやることも出てきません。

   だから、この画面には **測るものが一つもありません**。目標も、達成率も、
   何日続いたかも、先月より多いか少ないかも出しません。積み上がったものを
   置いておくと、後から読み返せる——それだけの場所です。

   一画面に、ずっと四つ並びます（前は「月」「種」で面を分けていましたが、
   やめました。種はお気に入り・完了の印・並び替えで見つかるので、
   専用の場所は要りません）。

     ①こよみ        … 他のタブと同じ作り（週／月・フリック・輪）
     ②月の積み上がり … その月の内訳。数だけを言うので、常に短く
     ③Daily Log     … その日あったこと・したこと。一、二行
     ④積み上げ項目   … 読書・学習・種・達成・変化。並び替えとお気に入り付き

   カレンダーは、やること・ダイエットと**同じコード**にしてあります
   （置き場所と印だけを変えて三つ目を足す、という前二つと同じやり方です）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const { html, node, icon } = U;
  const store = KN.store;

  let root = null;
  let els = {};

  /* 見ている月。null は「今月」。 */
  let viewMonth = null;
  /* 日で絞っているとき、その日。null は「月ぜんぶ」。 */
  let viewDay = null;

  /* ④の見せ方。並び替え・絞り込み・お気に入りだけ・文字さがし。
     ページを分けない代わりに、ここで探します。 */
  let typeFilter = "all";
  let sortMode = "recent";     // recent | favorite | date
  let favOnly = false;
  let query = "";

  /** daily の見え方の設定。まとめてここから読みます（既定はぜんぶ「出す」）。 */
  const S = () => store.get().settings;

  const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const curYm = () => viewMonth || ymOf(new Date());
  const ymParts = (ym) => ({ year: +ym.slice(0, 4), month: +ym.slice(5, 7) - 1 });
  const isThisMonth = () => curYm() === ymOf(new Date());
  /** 値が無ければ「-」。空欄をグレーの説明文で埋めない、という決めごとの担当。 */
  const orDash = (v) => (v == null || v === "" ? "-" : v);

  /** その日へ移る。月をまたいでも暦がついてくるように、二つ一緒に動かします。 */
  function goToDay(day) {
    if (!day) return;
    viewMonth = String(day).slice(0, 7);
    viewDay = day;
    render();
    // 暦は上にあるので、押した位置から画面ごと頭へ戻します。
    if (root) root.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ================================================================
     こよみ

     やること・ダイエットのカレンダーと、作りをそろえてあります
     （週⇄月・フリックで月送り・今日の赤丸・選んだ日の緑の輪）。
     新しく考えたのは「どの日にどの色の粒が乗るか」だけです。
     ================================================================ */

  const calOpen = () => store.calPrefs("archive").open;
  const calShown = () => store.calPrefs("archive").shown;

  function markWeek(sec, here) {
    const open = calOpen();
    const shown = calShown();
    sec.classList.toggle("is-week", !open);
    sec.classList.toggle("is-hidden", !shown);
    const pin = sec.querySelector(".js-calpin");
    if (pin) {
      pin.textContent = shown ? "しまう" : "暦を出す";
      pin.setAttribute("aria-pressed", String(shown));
      pin.setAttribute("aria-label", shown ? "暦をしまう" : "暦を出す");
    }
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
    const hasHere = !!sec.querySelector(`.cal-day[data-day="${here}"]`);
    const anchor = hasHere ? here : (first ? first.dataset.day : here);
    const w = U.weekOf(anchor);
    sec.querySelectorAll(".cal-day").forEach((c) => {
      const k = c.dataset.day;
      c.classList.toggle("is-off-week", k < w.from || k > w.to);
    });
    const padsOn = !!first && first.dataset.day >= w.from && first.dataset.day <= w.to;
    sec.querySelectorAll(".cal-pad").forEach((c) => c.classList.toggle("is-off-week", !padsOn));
  }

  function shownMonth() {
    if (viewMonth) return ymParts(viewMonth);
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

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
    if (!g.width || !b.width) return;
    const first = !ring.classList.contains("is-on");
    ring.classList.toggle("is-jump", !!jump || first);
    ring.style.transform = `translate(${(b.left - g.left).toFixed(1)}px, ${(b.top - g.top).toFixed(1)}px)`;
    ring.classList.add("is-on");
    if (jump || first) {
      requestAnimationFrame(() => requestAnimationFrame(() => ring.classList.remove("is-jump")));
    }
  }

  function calendar() {
    const sec = node(html`
      <section class="cal">
        <h2 class="cal-head">
          <span class="cal-month"></span>
          <span class="cal-year"></span>
          <button type="button" class="cal-now js-now" hidden>今月へ</button>
          <span class="cal-nav">
            <button type="button" class="cal-more js-calmore" aria-expanded="false"></button>
            ${/* 暦そのものを、しまう・出す。暦の無いほうが広く使える日が
                  あるので、ひと押しで替えられるようにしてあります。畳んでも
                  この見出しの帯は残します——しまった先が見えていないと、
                  戻す道が無くなるので。 */""}
            <button type="button" class="cal-pin js-calpin" aria-pressed="true"></button>
            <button type="button" class="cal-arrow js-prev" aria-label="前へ">${icon("chevron")}</button>
            <button type="button" class="cal-arrow js-next" aria-label="次へ">${icon("chevron")}</button>
          </span>
        </h2>
        <div class="cal-grid"></div>
      </section>
    `);
    const grid = sec.querySelector(".cal-grid");

    const goTo = (delta) => {
      KN.motion.fire("select");
      const m = shownMonth();
      const d = new Date(m.year, m.month + delta, 1);
      if (ymOf(d) > ymOf(new Date())) return;   // 先の月には行きません
      viewMonth = ymOf(d) === ymOf(new Date()) ? null : ymOf(d);
      viewDay = null;
      render();
    };
    sec.querySelector(".js-calmore").addEventListener("click", () => {
      KN.motion.fire("select");
      store.setCalPref("archive", { open: !calOpen() });
    });
    sec.querySelector(".js-calpin").addEventListener("click", () => {
      KN.motion.fire("select");
      store.setCalPref("archive", { shown: !calShown() });
    });
    sec.querySelector(".js-prev").addEventListener("click", () => goTo(-1));
    sec.querySelector(".js-next").addEventListener("click", () => goTo(1));
    sec.querySelector(".js-now").addEventListener("click", () => {
      KN.motion.fire("select"); viewMonth = null; viewDay = null; render();
    });

    wireMonthSwipe(sec, grid, goTo);
    return sec;
  }

  /* その日の粒。書いた種類ぶんの色（最大四つ）。log だけあって積み上げが
     無い日は、灰色の小さな一粒にします——書いたことは書いたことなので、
     何も出さないと「その日は空白」に見えてしまいます。 */
  function fillCalendar(sec) {
    const today = U.todayKey();
    const { year, month } = shownMonth();
    const total = new Date(year, month + 1, 0).getDate();
    const lead = new Date(year, month, 1).getDay();

    sec.setAttribute("aria-label", `${year}年${month + 1}月`);
    sec.querySelector(".cal-month").textContent = `${month + 1}月`;
    sec.querySelector(".cal-year").textContent = String(year);
    sec.querySelector(".js-now").hidden = isThisMonth() && !viewDay;

    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    const byDay = {};
    store.entriesOfMonth(ym).forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e.type); });
    const logged = {};
    store.daysOfMonth(ym).forEach((d) => { logged[d.date] = true; });

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
      const kinds = [...new Set(byDay[key] || [])].slice(0, 4);
      const dotsHtml = kinds.length
        ? kinds.map((t) => `<i style="background:${store.archiveType(t).color}"></i>`).join("")
        : (logged[key] ? '<i class="is-log"></i>' : "");
      const cell = node(html`
        <button class="cal-day ${isToday ? "is-today" : ""} ${key === viewDay ? "is-here" : ""}
                       ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
                data-day="${key}" ${isToday ? U.raw('aria-current="date"') : ""}
                aria-label="${month + 1}月${d}日${isToday ? "（今日）" : ""}${
                  kinds.length ? ` 記録${kinds.length}種` : ""}${logged[key] ? " log あり" : ""}">
          <span class="cal-n">${String(d)}</span>
          <span class="cal-dots">${U.raw(dotsHtml)}</span>
        </button>
      `);
      cell.addEventListener("click", () => {
        KN.motion.fire("select");
        viewDay = key === today ? null : key;
        viewMonth = ymOf(new Date(year, month, 1)) === ymOf(new Date()) ? null : ymOf(new Date(year, month, 1));
        moveRing(grid, cell);
        render();
      });
      grid.append(cell);
    }
    markWeek(sec, viewDay || today);
    moveRing(grid, grid.querySelector(`.cal-day[data-day="${viewDay || today}"]`), true);
  }

  /* やること・ダイエットと同じ、フリックで月をめくる仕掛け。日ごとの
     めくり（横に払って日を進める）は無いので、月だけの単純な版です。 */
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
      if (e.target.closest("button.cal-arrow, button.cal-now, button.cal-more")) return;
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
    sec.addEventListener("pointercancel", () => { id = null; axis = null; reset(); });
  }

  /* ================================================================
     ②あの日 — 貯めたものを、返すところ
     ================================================================

     ここまで作ったのは貯める器だけでした。一年ぶん書けるようにしても、
     書いたものが自分から出てこなければ、そのうち開かれなくなります。

     出し方には線が一本あります。**無い過去のことは、何も言わない。**
     「1年前の今日はこう書いていました」は思い出ですが、「去年は書いて
     いたのに今年は」は採点です。だから見つからなければ**枠ごと出しません**
     ——「まだ記録がありません」も出しません。それも「無い」を数えた言葉です。

     出すのは一日ぶん、一枚だけ。並べると流れになり、流れは読み飛ばすもの
     になります。選び方は store.archiveThen にあります。 */

  function thenCard() {
    const then = store.archiveThen();
    if (!then) return null;             // 無ければ、何も置かない

    const dt = U.dayDate(then.date);
    const when = dt ? `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${U.weekdayJa(then.date)}` : then.date;

    /* 記録は多くても二つまで。三つ目からは数を出さずに畳みます——
       「ほか3件」と数えると、その日の量の話になってしまうので、
       押せば全部見られることだけを言います。 */
    const shown = then.entries.slice(0, 2);
    const more = then.entries.length > shown.length;

    const sec = node(html`
      <button type="button" class="card arc-then" data-day="${then.date}">
        <span class="arc-then-head">
          <span class="arc-then-ico">${icon("clock", "is-sub")}</span>
          <b>あの日</b>
          ${then.label ? html`<i class="arc-then-when">${then.label}</i>` : ""}
        </span>
        <span class="arc-then-date">${when}</span>
        ${then.memo ? html`<span class="arc-then-memo">${then.memo}</span>` : ""}
        ${shown.length ? html`
          <span class="arc-then-rows">
            ${U.raw(shown.map((e) => {
              const t = store.archiveType(e.type);
              const ico = e.type === "reading" ? (e.kind === "paper" ? "paper" : "book") : t.icon;
              return `<span class="arc-then-row" style="--arc-c:${t.color}">`
                + `<i class="arc-then-row-ico">${icon(ico, "is-sub").value}</i>`
                + `<em>${U.escapeHtml(e.title || t.label)}</em></span>`;
            }).join(""))}
            ${more ? html`<span class="arc-then-more">ほかにも</span>` : ""}
          </span>` : ""}
      </button>
    `);
    sec.addEventListener("click", () => {
      KN.motion.fire("select");
      goToDay(then.date);
    });
    return sec;
  }

  /* 「◯月の積み上がり」の一行は、ここにありました。

     消したのは要らないからではなく、**同じものを二度出していた**からです。
     あの行は 読書2・学習1・種1・達成1・変化1 と並べ、その下の絞り込みの札は
     すべて・読書・学習・種・達成・変化 と並んでいました。同じ五つの、数える
     ほうと押すほうです。数を札のほうへ入れて、行そのものを畳みました。

     言葉も一つ減ります。「積み上がり」と「積み上げ」が縦に並んでいて、
     別のものを指しているのに一字しか違いませんでした。残るのは「積み上げ」
     だけです。 */

  /* ================================================================
     ③ Daily Log — その日あったこと・したこと
     ================================================================ */

  function dailyLog(ym) {
    const days = viewDay ? store.daysOfMonth(ym).filter((d) => d.date === viewDay) : store.daysOfMonth(ym);
    const sec = node(html`
      <section class="card arc-log">
        <header class="arc-log-head">
          ${/* 見出しから年月を外しました。すぐ上の暦が「8月 2026」と言っていて、
                さらにその上の帯も月を言っていた——一画面に三回。行そのものは
                日の数字を持っているので、ここは名前だけで足ります。 */""}
          <h2>Daily Log</h2>
          <button type="button" class="btn btn-soft btn-sm js-write">
            ${icon("edit", "is-sub")}<span>今日を書く</span>
          </button>
        </header>
        <div class="arc-log-body"></div>
      </section>
    `);
    const body = sec.querySelector(".arc-log-body");

    if (!days.length) {
      body.append(node(html`<p class="arc-log-empty">-</p>`));
    }
    days.forEach((d) => {
      const dt = U.dayDate(d.date);
      const edited = d.updatedAt && d.createdAt && d.updatedAt !== d.createdAt;
      /* **button ではなく div です。** iOS も含め、button の中の字は選べません
         （長押しは「押しっぱなし」として扱われ、選択もコピーの吹き出しも
         出ません）。ここに出ているのはその日に書いた文そのものなので、
         開き直さずに拾えるほうが自然です。押せることは role と tabindex と
         下の keydown で持たせます——見た目も振る舞いも今までどおり。 */
      const row = node(html`
        <div role="button" tabindex="0" class="arc-log-row ${d.date === U.todayKey() ? "is-today" : ""}"
             data-day="${d.date}">
          <span class="arc-log-day">
            <b>${String(dt ? dt.getDate() : "")}</b>
            <i>${dt ? U.weekdayJa(d.date) : ""}</i>
          </span>
          <span class="arc-log-text">
            <span class="arc-log-memo ${S().logFull === false ? "is-clamped" : ""}">${orDash(d.memo)}</span>
            ${/* その日のことを言う時刻（起床・就寝）と、書いた記録の時刻
                  （作成・更新）が、数字として同じ顔で並んでいました。前者は
                  中身、後者は帳簿です。帳簿のほうを薄い地に沈めて、目が
                  中身のほうに先に行くようにします。どちらも、要らない人は
                  設定で消せます（数字が四つ並ぶのが邪魔なときがあるので）。 */""}
            ${S().showDayTimes === false ? "" : html`
              <span class="arc-log-times">起床 ${orDash(d.wake)} ・ 就寝 ${orDash(d.sleep)}</span>`}
            ${S().showStamps === false ? "" : html`
              <span class="arc-log-meta">
                <span class="arc-stamp">作成 ${U.formatStamp(d.createdAt) || "-"}</span>
                ${edited ? html`<span class="arc-stamp">更新 ${U.formatStamp(d.updatedAt)}</span>` : ""}
              </span>`}
          </span>
        </div>
      `);
      /* 選び終えて指を離すと click も鳴ります。そこで紙を開くと、選んだ
         そばから選択が消えます——選んでいるときは、開きません。 */
      row.addEventListener("click", () => {
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.rangeCount && !sel.isCollapsed
            && row.contains(sel.anchorNode)) return;
        openLogSheet(d.date);
      });
      row.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        openLogSheet(d.date);
      });
      body.append(row);
    });

    sec.querySelector(".js-write").addEventListener("click", () => {
      openLogSheet(viewDay || (isThisMonth() ? U.todayKey() : `${ym}-01`));
    });
    return sec;
  }

  function openLogSheet(day) {
    const cur = store.dayLog(day) || {};
    const dt = U.dayDate(day);
    const label = dt ? `${dt.getMonth() + 1}月${dt.getDate()}日（${U.weekdayJa(day)}）` : day;

    /* 文字数の上限は置きません。前は200字で止めて残りを数えていましたが、
       書ける量をこちらが決める理由がありません——短く書きたい人は短く書きます。
       数えるのをやめると、書いている最中に「あと何字」が目に入らなくなります。 */
    const body = node(html`
      <div class="stack" style="gap:16px">
        <label class="field">
          <span class="field-label">その日あったこと・したこと</span>
          <textarea class="textarea js-memo" rows="5">${cur.memo || ""}</textarea>
        </label>
        <div class="arc-times">
          <label class="field">
            <span class="field-label">起きた</span>
            <input type="time" class="input js-wake" value="${cur.wake || ""}">
          </label>
          <label class="field">
            <span class="field-label">寝た</span>
            <input type="time" class="input js-sleep" value="${cur.sleep || ""}">
          </label>
        </div>
      </div>
    `);

    const memo = body.querySelector(".js-memo");
    const wakeEl = body.querySelector(".js-wake");
    const sleepEl = body.querySelector(".js-sleep");

    /* 打った先から保存します。「保存」を押さずに閉じても残る——押し忘れで
       消えるほうが、間違って残るよりずっと痛いので（食事の四枠と同じ考え）。
       打つたびに書くと重いので、手が止まってから 500ms 後に一度だけ。 */
    let timer = 0;
    let last = JSON.stringify([cur.memo || "", cur.wake || "", cur.sleep || ""]);
    const save = () => {
      clearTimeout(timer); timer = 0;
      const now = JSON.stringify([memo.value, wakeEl.value, sleepEl.value]);
      if (now === last) return;
      last = now;
      store.setDayLog(day, {
        memo: memo.value, wake: wakeEl.value || null, sleep: sleepEl.value || null,
      });
      render();
    };
    const queue = () => { clearTimeout(timer); timer = setTimeout(save, 500); };
    [memo, wakeEl, sleepEl].forEach((el) => {
      el.addEventListener("input", queue);
      el.addEventListener("change", save);
      el.addEventListener("blur", save);
    });

    const h = KN.ui.sheet({
      title: `${label} の log`,
      content: body,
      // 自動で保存しているので、閉じるときに引き止めません。
      guard: false,
      footer: node(html`<button class="btn btn-primary btn-block js-ok">閉じる</button>`),
      onClose: save,
    });
    h.el.querySelector(".js-ok").addEventListener("click", () => {
      save();
      KN.motion.fire("select");
      h.close();
    });

    /* 開いたら、そのまま打てるようにします。

       押してから枠を押し直して、さらにキーボードが出るのを待つ——三手です。
       この画面を開く人は書きに来ているので、その三手を先に済ませておきます。

       カーソルは**いちばん後ろ**へ。先頭に置くと、続きを書こうとした人が
       毎回いちばん下まで指で送ることになります（日記は足していくものなので、
       書き足す場所はいつも末尾です）。setSelectionRange を focus のあとに
       呼ぶのは、focus が既定で全選択にする端末があるためです——選んだまま
       打つと、書いてあったものが一文字で消えます。 */
    KN.ui.focusNow(memo);
    const end = memo.value.length;
    try { memo.setSelectionRange(end, end); } catch (_) { /* time 欄などでは投げます */ }
    memo.scrollTop = memo.scrollHeight;
  }

  /* ================================================================
     ④積み上げ項目 — 読書・学習・種・達成・変化
     ================================================================ */

  function visibleEntries(ym) {
    let list;
    if (query.trim()) {
      list = store.searchEntries(query);
    } else if (viewDay) {
      list = store.entriesOfDay(viewDay);
    } else {
      list = store.entriesOfMonth(ym);
    }
    if (typeFilter !== "all") list = list.filter((e) => e.type === typeFilter);
    if (favOnly) list = list.filter((e) => e.favorite);

    const sorter = sortMode === "favorite" ? cmpFavorite : (sortMode === "date" ? cmpDate : cmpRecent);
    return list.slice().sort(sorter);
  }
  // store 側の並びに乗るので、ここでは再現だけします（同じ関数を二重に
  // 持たない代わりに、store が要らないと言った並びだけこちらで足します）。
  const cmpRecent = (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  const cmpFavorite = (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || cmpRecent(a, b);
  const cmpDate = (a, b) => String(b.date).localeCompare(String(a.date)) || cmpRecent(a, b);

  function readingSubtitle(e, t) {
    const bits = [];
    if (e.author) bits.push(e.author);
    if (e.pageFrom != null || e.pageTo != null) {
      bits.push(`${orDash(e.pageFrom)}→${orDash(e.pageTo)}${e.amount != null ? `（${e.amount}ページ）` : ""}`);
    }
    return bits;
  }

  function entryRow(e) {
    const t = store.archiveType(e.type);
    const dt = U.dayDate(e.date);
    const when = dt ? `${dt.getMonth() + 1}/${dt.getDate()}` : "";
    const edited = e.updatedAt && e.createdAt && String(e.updatedAt).slice(0, 16) !== String(e.createdAt).slice(0, 16);

    const subBits = [t.label, when];
    if (e.type === "reading") {
      subBits.push(...readingSubtitle(e, t));
    } else if (e.amount != null) {
      subBits.push(`${e.amount}${e.unit || t.unit || ""}`);
    }
    if (edited) subBits.push(`直: ${U.formatStamp(e.updatedAt)}`);

    const typeIcon = e.type === "reading" ? (e.kind === "paper" ? "paper" : "book") : t.icon;

    const row = node(html`
      ${/* data-flip は、組み直しの前後で同じ行かどうかの目印です
            （ui.js の flipRows）。並べ替え・お気に入り・一件足したときに、
            行が「もといた場所」から滑ってきます。 */""}
      <div class="arc-row" data-flip="${e.id}" style="--arc-c:${t.color}">
        ${e.type === "seed" ? html`
          <button class="check js-seedcheck" role="checkbox" aria-checked="false"
                  aria-label="「${e.title}」を達成にする">${icon("check")}</button>
        ` : ""}
        <button class="fav ${e.favorite ? "is-on" : ""} js-favbtn" aria-pressed="${String(!!e.favorite)}"
                aria-label="「${e.title}」をお気に入りにする">${icon("star")}</button>
        <button class="arc-row-body" data-id="${e.id}">
          <span class="arc-ico">${icon(typeIcon, "is-sub")}</span>
          <span class="arc-main">
            <span class="arc-title">${e.title || t.label}</span>
            <span class="arc-sub">${U.raw(subBits.map((b) => `<span>${U.escapeHtml ? U.escapeHtml(b) : b}</span>`).join(""))}</span>
            <span class="arc-memo">${e.memo ? e.memo : "-"}</span>
          </span>
        </button>
      </div>
    `);
    row.querySelector(".arc-row-body").addEventListener("click", () => openEntrySheet(e));
    row.querySelector(".js-favbtn").addEventListener("click", () => {
      KN.motion.fire("select");
      store.toggleFavorite(e.id);
      render();
    });
    const seedCheck = row.querySelector(".js-seedcheck");
    if (seedCheck) {
      seedCheck.addEventListener("click", () => {
        KN.motion.fire("select");
        store.promoteSeed(e.id);
        KN.ui.toast("達成にしました");
        render();
      });
    }
    return row;
  }

  /* 並び順は三つだけです。三つを札の一列にすると、絞り込みの札と合わせて
     二段——記録が一件も見えないうちに 110px を使っていました。

     見出しの右へ、いまの並びを名乗るボタンとして畳みます。押すと次へ回り、
     三回で一周。隠れるのではなく **いまどれなのかが常に書いてある** ので、
     押す前に読めます（menu にすると、開くまで分かりません）。 */
  const SORTS = [
    { id: "recent",   label: "更新順" },
    { id: "date",     label: "日付順" },
    { id: "favorite", label: "お気に入り順" },
  ];
  const sortLabel = (id) => (SORTS.find((s) => s.id === id) || SORTS[0]).label;
  const nextSort = (id) => SORTS[(SORTS.findIndex((s) => s.id === id) + 1) % SORTS.length].id;

  function entriesSection(ym) {
    const sec = node(html`
      <section class="arc-stack">
        <header class="arc-stack-head">
          <h2>積み上げ</h2>
          <button type="button" class="arc-sort js-sort"
                  aria-label="並び順を変える（いまは${sortLabel(sortMode)}）">
            ${icon("rows", "is-sub")}<span>${sortLabel(sortMode)}</span>
          </button>
          <button type="button" class="fav js-favonly ${favOnly ? "is-on" : ""}"
                  aria-pressed="${String(favOnly)}" aria-label="お気に入りだけ見る">${icon("star")}</button>
        </header>
        <div class="js-typechips"></div>
        <div class="js-rows stack" style="gap:0"></div>
      </section>
    `);

    /* 数は札のほうへ。上にあった「◯月の積み上がり」の一行と同じ内訳です
       ——数えるほうと押すほうを、一つにまとめました。ゼロは書きません
       （「種 0」は、無いことを数えた字なので）。 */
    const counts = store.monthCounts(ym);
    KN.ui.chipRow(sec.querySelector(".js-typechips"),
      [{ id: "all", label: "すべて" },
       ...store.ARCHIVE_TYPES.map((t) => ({
         id: t.id, label: t.label, color: t.color, count: counts[t.id] || null,
       }))],
      { activeId: typeFilter, onPick: (id) => { typeFilter = id; KN.motion.fire("select"); render(); } });

    sec.querySelector(".js-sort").addEventListener("click", () => {
      sortMode = nextSort(sortMode); KN.motion.fire("select"); render();
    });

    sec.querySelector(".js-favonly").addEventListener("click", () => {
      favOnly = !favOnly; KN.motion.fire("select"); render();
    });

    const rows = sec.querySelector(".js-rows");
    const list = visibleEntries(ym);
    if (!list.length) {
      rows.append(node(html`
        <div class="empty">
          ${/* 枠（.empty-art）に入れます。裸で置くと大きさの決まりが効かず、
                原寸のまま出ます——「アイコンが大きすぎる」の正体はこれでした。 */""}
          <div class="empty-art">${U.raw(KN.emptyArt.notebook)}</div>
          <p class="empty-title">${query.trim() ? "見つかりませんでした" : "まだ記録はありません"}</p>
          <p class="empty-text">読んだ本・学んだこと・思いついたことを、軽く。</p>
        </div>
      `));
    } else {
      const card = node(html`<div class="card arc-list"></div>`);
      list.forEach((e) => card.append(entryRow(e)));
      rows.append(card);
    }
    return sec;
  }

  /* ---------------- 一つ書く／直すシート ----------------

     「くわしく」は畳みません。任意の欄も最初から出したままにします——
     開かないと見えない欄は、開かれないままのことが多いので。 */
  function openEntrySheet(existing) {
    const e = existing || null;
    let type = e ? e.type : "reading";
    let kind = e ? (e.kind || "book") : "book";
    /* 自動で埋めた欄には ×。人が打ち直したら消えます。 */
    let titleAuto = false, authorAuto = false;

    const body = node(html`
      <div class="stack" style="gap:16px">
        <div class="arc-pick js-pick"></div>

        <div class="js-reading-fields" hidden>
          <div class="stack" style="gap:16px">
            <div class="arc-kind js-kind"></div>
            <label class="field">
              <span class="field-label">名前</span>
              <div class="ta-wrap">
                <input type="text" class="input input-lg js-title" value="${e ? e.title : ""}"
                       enterkeyhint="next" autocomplete="off">
                <button type="button" class="ta-clear js-title-clear" hidden aria-label="消す">${icon("close")}</button>
              </div>
              <div class="js-title-ac"></div>
            </label>
            <label class="field">
              <span class="field-label">作者・著者</span>
              <div class="ta-wrap">
                <input type="text" class="input input-lg js-author" value="${e ? (e.author || "") : ""}"
                       enterkeyhint="next" autocomplete="off">
                <button type="button" class="ta-clear js-author-clear" hidden aria-label="消す">${icon("close")}</button>
              </div>
              <div class="js-author-ac"></div>
            </label>
            <div class="arc-times">
              <label class="field">
                <span class="field-label">開始ページ</span>
                <input type="number" inputmode="numeric" class="input js-pagefrom"
                       value="${e && e.pageFrom != null ? e.pageFrom : ""}">
              </label>
              <label class="field">
                <span class="field-label">終了ページ</span>
                <input type="number" inputmode="numeric" class="input js-pageto"
                       value="${e && e.pageTo != null ? e.pageTo : ""}">
              </label>
            </div>
            <p class="arc-pages-hint js-pages-calc">-</p>
          </div>
        </div>

        <div class="js-generic-fields">
          <div class="stack" style="gap:16px">
            <label class="field">
              <span class="field-label">タイトル</span>
              <input type="text" class="input js-title-generic" value="${e && e.type !== "reading" ? e.title : ""}"
                     enterkeyhint="done">
            </label>
            <div class="arc-times">
              <label class="field">
                <span class="field-label">数</span>
                <input type="number" inputmode="numeric" class="input js-amount"
                       value="${e && e.type !== "reading" && e.amount != null ? e.amount : ""}">
              </label>
              <label class="field">
                <span class="field-label">単位</span>
                <input type="text" class="input js-unit"
                       value="${e && e.type !== "reading" && e.unit ? e.unit : ""}">
              </label>
            </div>
          </div>
        </div>

        <label class="field">
          <span class="field-label">日付</span>
          <input type="date" class="input js-date" value="${e ? e.date : (viewDay || U.todayKey())}">
        </label>

        <label class="field">
          <span class="field-label">メモ</span>
          <textarea class="textarea js-memo" rows="4">${e ? e.memo : ""}</textarea>
        </label>
      </div>
    `);

    const readingFields = body.querySelector(".js-reading-fields");
    const genericFields = body.querySelector(".js-generic-fields");
    const titleReading = body.querySelector(".js-title");
    const titleGeneric = body.querySelector(".js-title-generic");
    const authorInput = body.querySelector(".js-author");
    const pageFrom = body.querySelector(".js-pagefrom");
    const pageTo = body.querySelector(".js-pageto");
    const pagesCalc = body.querySelector(".js-pages-calc");
    const titleClear = body.querySelector(".js-title-clear");
    const authorClear = body.querySelector(".js-author-clear");

    const paintPages = () => {
      const a = pageFrom.value === "" ? null : Number(pageFrom.value);
      const b = pageTo.value === "" ? null : Number(pageTo.value);
      pagesCalc.textContent = (a != null && b != null && b >= a) ? `${b - a + 1}ページ` : "-";
    };
    pageFrom.addEventListener("input", paintPages);
    pageTo.addEventListener("input", paintPages);
    paintPages();

    /* 新規の読書だけ、前回の名前・著者を下敷きにします。直したら ×は消えます。 */
    if (!e) {
      const last = store.lastReading();
      if (last) {
        titleReading.value = last.title;
        authorInput.value = last.author || "";
        kind = last.kind || "book";
        titleAuto = true; authorAuto = !!last.author;
      }
    }
    const paintClears = () => {
      titleClear.hidden = !titleAuto;
      authorClear.hidden = !authorAuto;
    };
    paintClears();
    titleReading.addEventListener("input", () => { titleAuto = false; paintClears(); renderTitleAc(); });
    authorInput.addEventListener("input", () => { authorAuto = false; paintClears(); renderAuthorAc(); });
    titleClear.addEventListener("click", () => {
      titleReading.value = ""; titleAuto = false; paintClears(); titleReading.focus();
    });
    authorClear.addEventListener("click", () => {
      authorInput.value = ""; authorAuto = false; paintClears(); authorInput.focus();
    });

    /* 候補（前に打った名前・著者）。選んだら両方いっぺんに埋めます
       ——同じ本の続きを書くときに、著者を打ち直させないためです。 */
    const titleAcHost = body.querySelector(".js-title-ac");
    const authorAcHost = body.querySelector(".js-author-ac");
    function renderTitleAc() {
      const q = U.foldKana(titleReading.value.trim());
      if (!q) { titleAcHost.innerHTML = ""; return; }
      const hits = store.readingCandidates()
        .filter((c) => U.foldKana(c.title).includes(q)).slice(0, 5);
      paintAc(titleAcHost, hits, (c) => `${c.title}`, (c) => c.author || "著者なし", (c) => {
        titleReading.value = c.title;
        if (c.author) { authorInput.value = c.author; authorAuto = false; }
        titleAuto = false; paintClears();
        titleAcHost.innerHTML = "";
      });
    }
    function renderAuthorAc() {
      const q = U.foldKana(authorInput.value.trim());
      if (!q) { authorAcHost.innerHTML = ""; return; }
      const seen = new Set();
      const hits = store.readingCandidates()
        .filter((c) => c.author && U.foldKana(c.author).includes(q))
        .filter((c) => { const k = U.foldKana(c.author); if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 5);
      paintAc(authorAcHost, hits, (c) => c.author, (c) => `${c.title} の著者`, (c) => {
        authorInput.value = c.author; authorAuto = false; paintClears();
        authorAcHost.innerHTML = "";
      });
    }
    function paintAc(host, rows, mainOf, subOf, onPick) {
      host.innerHTML = "";
      if (!rows.length) return;
      const box = node(html`<div class="ac" role="listbox"></div>`);
      rows.forEach((r) => {
        const item = node(html`
          <button type="button" class="ac-item" role="option">
            <span class="ac-main"><span class="ac-name">${mainOf(r)}</span>
              <span class="ac-sub">${subOf(r)}</span></span>
          </button>
        `);
        item.addEventListener("mousedown", (ev) => ev.preventDefault());
        item.addEventListener("click", () => onPick(r));
        box.append(item);
      });
      host.append(box);
    }

    /* 本／論文の切り替え。 */
    const kindHost = body.querySelector(".js-kind");
    const paintKind = () => {
      kindHost.innerHTML = "";
      [{ id: "book", label: "本", icon: "book" }, { id: "paper", label: "論文", icon: "paper" }].forEach((k) => {
        const b = node(html`
          <button type="button" class="arc-kind-b ${k.id === kind ? "is-on" : ""}" data-k="${k.id}">
            ${icon(k.icon, "is-sub")}<span>${k.label}</span>
          </button>
        `);
        b.addEventListener("click", () => { kind = k.id; KN.motion.fire("select"); paintKind(); });
        kindHost.append(b);
      });
    };
    paintKind();

    /* 種類の札。読書だけ専用の欄に切り替わります。 */
    const pick = body.querySelector(".js-pick");
    const paintPick = () => {
      pick.innerHTML = "";
      store.ARCHIVE_TYPES.forEach((t) => {
        const b = node(html`
          <button type="button" class="arc-pick-b ${t.id === type ? "is-on" : ""}"
                  style="--arc-c:${t.color}" data-t="${t.id}">
            ${icon(t.icon, "is-sub")}<span>${t.label}</span>
          </button>
        `);
        b.addEventListener("click", () => { type = t.id; KN.motion.fire("select"); paintPick(); paintMode(); });
        pick.append(b);
      });
    };
    const paintMode = () => {
      const isReading = type === "reading";
      readingFields.hidden = !isReading;
      genericFields.hidden = isReading;
    };
    paintPick();
    paintMode();

    const footer = node(html`
      <div style="display:flex;gap:8px">
        ${e ? html`<button class="btn btn-soft js-del">${icon("trash", "is-sub")}</button>` : ""}
        <button class="btn btn-primary js-ok" style="flex:1">${e ? "保存" : "書く"}</button>
      </div>
    `);

    const h = KN.ui.sheet({ title: e ? "記録を直す" : "記録を書く", content: body, footer, guard: true });

    footer.querySelector(".js-ok").addEventListener("click", () => {
      const isReading = type === "reading";
      const title = (isReading ? titleReading.value : titleGeneric.value).trim();
      if (!title) { KN.ui.toast("名前・タイトルを入れてください"); return; }
      const patch = {
        type,
        title,
        date: body.querySelector(".js-date").value || U.todayKey(),
        memo: body.querySelector(".js-memo").value,
      };
      if (isReading) {
        patch.kind = kind;
        patch.author = authorInput.value.trim() || null;
        patch.pageFrom = pageFrom.value;
        patch.pageTo = pageTo.value;
        patch.amount = null;   // applyReadingPages が計算し直します
        patch.unit = null;
      } else {
        patch.kind = null;
        patch.author = null;
        patch.pageFrom = null;
        patch.pageTo = null;
        patch.amount = body.querySelector(".js-amount").value;
        patch.unit = body.querySelector(".js-unit").value.trim() || null;
      }
      if (e) store.updateEntry(e.id, patch);
      else store.addEntry(patch);
      KN.motion.fire("select");
      h.close();
      render();
    });

    const del = footer.querySelector(".js-del");
    if (del) del.addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "この記録を消しますか", message: e.title, okLabel: "消す", danger: true,
      });
      if (!ok) return;
      store.removeEntry(e.id);
      h.close();
      render();
    });
  }

  /* ================================================================
     画面
     ================================================================ */

  function mount(el) {
    root = el;
    root.innerHTML = "";
    root.append(node(html`
      <div class="stack">
        <header class="topbar">
          <div class="topbar-row">
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">daily</h1>
              <p class="topbar-sub js-sub"></p>
            </div>
            ${/* 右端から 設定・さがす・書き出し。ほかの三画面と同じ並べ方で、
                  いちばん右がいつも設定です。 */""}
            <button class="icon-btn js-export" aria-label="この月を書き出す">${icon("download")}</button>
            <button class="icon-btn js-search-btn" aria-label="文字でさがす">${icon("search")}</button>
            <button class="icon-btn js-settings" aria-label="設定" title="設定">${icon("gear")}</button>
          </div>
        </header>

        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="文字でさがす" aria-label="文字でさがす"
                   autocomplete="off" spellcheck="false">
            <button class="icon-btn js-search-clear" aria-label="検索をクリア"
                    style="width:28px;height:28px" hidden>${icon("close")}</button>
          </div>
        </div>

        <div class="js-body arc-body"></div>
      </div>
    `));

    els = {
      sub: root.querySelector(".js-sub"),
      body: root.querySelector(".js-body"),
      screen: root,
      searchBtn: root.querySelector(".js-search-btn"),
      searchWrap: root.querySelector(".js-search-wrap"),
      search: root.querySelector(".js-search"),
      searchClear: root.querySelector(".js-search-clear"),
    };

    /* ほかの三画面とまったく同じ配線です。バーは題の裏に隠してあって、
       少し下へ引くと出てきます（ui.js の parkSearch）。 */
    KN.ui.wireSearch(els, () => render(), (q) => { query = q; });
    root.querySelector(".js-export").addEventListener("click", exportThisMonth);
    root.querySelector(".js-settings").addEventListener("click", () => KN.app.showScreen("settings"));

    els.cal = calendar();
    // 初めて開いたときも、今日の欄が待っているように。
    store.ensureDayLog(U.todayKey());
    /* ここに store.subscribe(() => render()) がありました。**二重でした**
       ——app.js が「state が変わったら、いま見ている画面を描き直す」を
       すでにやっています（app.js の store.subscribe）。他の画面はどれも
       自前で購読していません。daily だけが二回描いていました。

       見た目には出ませんでした（二度描いても同じ絵になるので）。表に
       出たのは FLIP を入れたときです——一度目で「新しく来た行」に印を
       付け、二度目がその行ごと作り直して印を消していました。無駄な仕事は、
       たいてい無駄なままでは終わりません。 */
  }

  /* 描き直している最中に、描き直しが始まらないように。

     store を触ると subscribe が render を呼びます。描いている途中でそれが
     起きると、内側の render が本体を空にしてから描き、外側は**その上に
     もう一度**積みます——同じ行が二つ並びます（今日の行を用意する処理を
     描画の中に置いたとき、実際にそうなりました）。 */
  let rendering = false;

  function render() {
    if (!root || rendering) return;
    const ym = curYm();

    /* 組み直すと、画面はいちばん上に戻ります。絞り込みや並び替えを押した人は
       **その場**を見ているので、押した瞬間に頭まで飛ばされると、もう一度
       同じところまで指で戻ることになります。位置を覚えて、組んだあとに返します。 */
    const keepTop = root.scrollTop;

    /* 組み直す前に、いまどの行がどこに居るかを測ります（ui.js の flipRows）。
       並べ替えを押す・お気に入りを付ける・一件足す——どれも一覧の中で行が
       動くだけの出来事なのに、いままでは別の絵に置き換わっていました。
       月をめくったときのように丸ごと入れ替わる場合は、向こうが見送ります。 */
    const settle = KN.ui.flipRows(els.body, ".arc-row");

    rendering = true;
    els.searchClear.hidden = !els.search.value;
    /* 上の帯は、**暦が言えないことだけ**を言います。
       月は、すぐ下の暦が「8月 2026」と出しています。ここでも「2026年8月」と
       書けば、二行つづけて同じことを言ったことになります。日を選んだときは
       暦のほうは緑の輪しか持っていないので、そのときだけここが引き受けます。 */
    els.sub.textContent = viewDay ? U.formatDate(viewDay) : "";
    els.sub.hidden = !viewDay;
    els.body.innerHTML = "";

    els.body.append(els.cal);
    fillCalendar(els.cal);
    /* 「あの日」は、暦のすぐ下。暦は行き先を選ぶところなので、**最初の中身**は
       これになります。見つからない日は、null が返って何も置かれません。
       出すかどうかは設定で決められます（既定は出す）。 */
    if (S().showThen !== false) {
      const then = thenCard();
      if (then) els.body.append(then);
    }
    /* Daily Log と積み上げのどちらを上にするか。日誌として使う人は
       その日の文が先で、集めるものとして使う人は積み上げが先です。
       どちらが上かは、その人の使い方でしか決まりません。 */
    const log = dailyLog(ym), entries = entriesSection(ym);
    if (S().dailyOrder === "entries") els.body.append(entries, log);
    else els.body.append(log, entries);

    if (keepTop) root.scrollTop = keepTop;
    rendering = false;
    // 位置を戻したあとで測ります（戻す前だと、行がスクロールぶんだけ
    // 余計に動いたことになって、画面の外から飛んできます）。
    settle();
  }

  /**
   * その月ぶんを JSON で書き出します。将来、この月がどんな時間だったかを
   * 言葉にしてもらうときに、そのまま渡せる形にしてあります。
   */
  function exportThisMonth() {
    const ym = curYm();
    const data = store.exportMonth(ym);
    const text = JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `daily-${ym}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    KN.motion.fire("select");
    KN.ui.toast(`${ym} を書き出しました`);
  }

  /* ＋ は二つのことを始められます（その日のことを書く／積み上げを一つ足す）。
     どちらかに決め打ちすると、もう片方は画面のどこかを探すことになるので、
     押したその場に二つ並べます。 */
  function dockButton() {
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="書く" aria-haspopup="menu">${icon("plus")}</button>
      </div>
    `);
    fab.querySelector(".js-open-add").addEventListener("click", (e) => {
      e.stopPropagation();
      KN.app.fabMenu(e.currentTarget, [
        { label: "Daily Log", icon: "edit",
          onPick: () => openLogSheet(viewDay || U.todayKey()) },
        { label: "記録", icon: "book", onPick: () => openEntrySheet(null) },
      ]);
    });
    return fab;
  }

  KN.screens = KN.screens || {};
  /* ---------------- 中継所を覗く ----------------

     睡眠が来ると、起床・就寝は**この画面**に出ます。ところが中継所を覗いて
     いたのはダイエットの画面だけでした——朝いちばんに daily を開いた人は、
     ダイエットへ寄り道するまで昨夜の記録が出てこないことになります。
     出る場所が覗く場所でもあるように、ここでも覗きます。

     自動なので黙ります（入っても言いません。画面が変わることが返事です）。
     郵便受けは一通なので、二つの画面が覗いても取り合いにはなりません
     ——先に取ったほうが取り込み、あとは空を見るだけです。 */
  function peekRelay() {
    if (!KN.healthRelay || !KN.healthRelay.configured()) return Promise.resolve(null);
    if (store.get().settings.dietAutoSync === false) return Promise.resolve(null);
    return KN.healthRelay.pullAndImport().then((res) => {
      if (res && res.ok && (res.added || res.updated)) render();
      return res;
    }).catch(() => null);
  }

  function onEnter() {
    watchResume();          // 一度だけ。戻ってきたことも合図にします。
    /* 日が変わっていれば、その日の行を用意します。開いたときに今日の欄が
       待っているように——描画の中ではなくここで呼ぶのは、store を触ると
       描き直しが走るためです（上の rendering を参照）。 */
    store.ensureDayLog(U.todayKey());
    render();
    /* 置いた直後は、まだ届いていないことがあります（中継所のKVは結果整合で、
       伝わるまで少しかかる）。一度目が空なら、少し置いてもう一度だけ。 */
    peekRelay().then((res) => {
      if (res && res.ok && (res.added || res.updated)) return;
      if (res && res.locked) return;      // 読めない便。あちらが掛け直します
      setTimeout(peekRelay, 4000);
    });
  }

  /* ほかのアプリ（ショートカット）から戻ってきたとき。daily を開いたまま
     走らせると、タブを押す機会がないので onEnter が呼ばれません。 */
  function watchResume() {
    if (watchResume.done) return;
    watchResume.done = true;
    const back = () => {
      if (document.visibilityState !== "visible") return;
      if (KN.app.activeScreen && KN.app.activeScreen() !== "archive") return;
      peekRelay();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
  }

  KN.screens.archive = { mount, render, dockButton, onEnter };
})();
