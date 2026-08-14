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
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">やること</h1>
            </div>
            <button class="icon-btn js-layout"></button>
            <button class="icon-btn js-search-btn" aria-label="やることを探す">${icon("search")}</button>
          </div>
        </header>

        <div class="search-wrap js-search-wrap" hidden>
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
      searchBtn: chrome.querySelector(".js-search-btn"),
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search:    chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
      body:      chrome.querySelector(".js-body"),
      topbar:    chrome.querySelector(".topbar"),
    };

    KN.ui.wireSearch(els, () => renderBody(), (q) => { query = q; });
    els.layout.addEventListener("click", KN.ui.toggleLayout);

    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  /* ---------------- the add / edit sheet ---------------- */

  /* One sheet for both, because a todo written in a hurry is the same object
     as a todo corrected later, and two forms that differ by a title bar is two
     places for a field to go missing from. */
  function openSheet(todoId) {
    const editing = !!todoId;
    const t = editing ? store.getTodo(todoId) : null;
    if (editing && !t) return;

    let due = editing ? t.due : null;
    let part = editing ? t.part : null;
    let time = editing ? t.time : null;
    let repeat = editing ? t.repeat : null;
    let repeatDays = editing ? (t.repeatDays || []).slice() : [];
    let repeatNth = editing ? (t.repeatNth ? { ...t.repeatNth } : null) : null;
    let flagged = editing ? !!t.flagged : false;
    haptic(10);

    const body = node(html`
      <div class="stack" style="gap:18px">
        <div class="field">
          <span class="field-label">やること</span>
          <input class="input js-title" placeholder="例：ゴミ出し・電球を替える"
                 value="${editing ? t.title : ""}"
                 autocomplete="off" autocapitalize="off" spellcheck="false">
        </div>

        <div class="field">
          <span class="field-label">いつまでに</span>
          <div class="js-due-chips"></div>
          <input class="input js-due" type="date" value="${editing && t.due ? t.due : ""}"
                 aria-label="日付を選ぶ">
          ${/* Which part of the day, for the ones where it matters, and the
                clock itself for the ones that happen at a time. Choosing
                either drops the other — 「19:30」 and 「朝」 together is two
                answers to one question. */""}
          <div class="js-part"></div>
          <div class="time-row js-time-row" hidden>
            <span class="time-label">時刻</span>
            <input class="input js-time" type="time" aria-label="時刻を選ぶ">
            <button type="button" class="chip js-time-clear" hidden>はずす</button>
          </div>
          <span class="field-hint js-due-hint"></span>
        </div>

        <div class="field">
          <span class="field-label">くりかえし</span>
          <div class="js-repeat"></div>
          ${/* Which days, once 毎週 or 毎月 is chosen. Hidden otherwise —
                「なし」 has no days to ask about. */""}
          <div class="js-repeat-detail" hidden></div>
          <span class="field-hint js-repeat-hint" hidden></span>
        </div>

        <div class="field">
          <button type="button" class="icon-auto fav-toggle js-flag" aria-pressed="${String(flagged)}">
            <span class="icon-pick-mark js-flag-mark">${icon("star")}</span>
            <span class="icon-pick-text">
              <span class="icon-pick-name">★を付ける</span>
              <span class="icon-pick-sub">同じ日のなかで先に出てきます</span>
            </span>
          </button>
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
    const foot = node(html`
      <button class="btn btn-primary btn-block js-save" ${editing ? "" : KN.util.raw("disabled")}>
        ${editing ? "保存" : "追加"}
      </button>
    `);

    const handle = KN.ui.sheet({
      title: editing ? "やることを直す" : "やることを追加",
      content: body,
      footer: foot,
    });

    /* The days a todo is nearly always for, in one press each. Typing a date
       into a date field is four taps that 「明後日」 does in one, and the
       calendar underneath is still there for the ones that are a real date. */
    const DUE_CHIPS = () => [
      { id: todayKey(), label: "今日" },
      { id: shiftDay(todayKey(), 1), label: "明日" },
      { id: shiftDay(todayKey(), 2), label: "明後日" },
      { id: shiftDay(todayKey(), 3), label: "明々後日" },
      { id: shiftDay(todayKey(), 7), label: "1週間後" },
      { id: KN.util.shiftMonth(todayKey(), 1), label: "1か月後" },
      { id: "", label: "なし" },
    ];

    function paintDueChips() {
      KN.ui.chipRow(body.querySelector(".js-due-chips"), DUE_CHIPS(), {
        activeId: due || "",
        onPick: (id) => {
          due = id || null;
          if (!due) { part = null; time = null; }
          dueEl.value = due || "";
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
      const badge = KN.appBadge;
      hintEl.innerHTML = "";
      if (!due) {
        hintEl.textContent = "日付を決めると、その日からアプリのアイコンに数が出ます";
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
      if (!badge || !badge.supported()) {
        hintEl.textContent = `${formatDay(due)}までのやることとして数えます`;
        return;
      }
      if (badge.enabled()) {
        hintEl.textContent = badge.blocked()
          ? "アイコンの数は、端末の設定で通知を許可すると出ます"
          : "その日が来ると、アプリのアイコンにも数が出ます";
        return;
      }
      const b = node(html`
        <span>アプリのアイコンに数を出すには
          <button type="button" class="link-btn js-badge-on">オンにする</button></span>
      `);
      b.querySelector(".js-badge-on").addEventListener("click", async () => {
        await badge.enable();
        paintHint();
      });
      hintEl.append(b);
    }

    /* 朝・午後・夜 and the clock are one question with two grains, so they are
       drawn as one control: the chips say roughly when, the field says exactly
       when, and whichever was touched last is the answer. A time lights up the
       part it falls in, so 19:30 visibly *is* 夜 rather than something else
       sitting beside it. */
    const timeRow = body.querySelector(".js-time-row");
    const timeEl = body.querySelector(".js-time");
    const timeClear = body.querySelector(".js-time-clear");

    function paintPart() {
      const host = body.querySelector(".js-part");
      host.hidden = !due;
      timeRow.hidden = !due;
      if (!due) return;
      /* Only the two ends are choices now, so a clock time lights nothing —
         it is not a third bookend, it is the answer instead of one. */
      const shown = part;
      /* 毎朝 … いつでも … 毎晩, in the order the day runs. 朝・午後・夜 are
         gone: the clock below says when precisely, and dragging says where. */
      const chips = [
        { id: "dawn", label: "毎朝" },
        { id: "", label: "いつでも" },
        { id: "dusk", label: "毎晩" },
      ];
      KN.ui.chipRow(host, chips, {
        activeId: shown || "",
        onPick: (id) => {
          part = id || null;
          /* 「毎朝」 and a clock time are two answers to one question, so the
             newer one wins. 「毎朝」 is also daily by the meaning of the word,
             so choosing it sets くりかえし rather than leaving a 「毎朝だが
             一度きり」 for the store to correct quietly later. */
          if (isBookend(part)) {
            time = null;
            repeat = "daily";
            repeatDays = [];
            repeatNth = null;
            paintRepeat();
          }
          paintPart();
          paintHint();
          haptic();
        },
      });
      // A clock and 「毎朝」 are different answers to the same question.
      timeRow.hidden = isBookend(part);
      timeEl.value = time || "";
      timeClear.hidden = !time;
    }

    timeEl.addEventListener("change", () => {
      time = KN.util.isTime(timeEl.value) ? timeEl.value : null;
      if (time) part = null;
      paintPart();
      paintHint();
    });
    timeClear.addEventListener("click", () => {
      time = null;
      paintPart();
      paintHint();
      haptic();
    });

    paintDueChips();
    paintPart();
    paintHint();

    dueEl.addEventListener("change", () => {
      due = dueEl.value || null;
      if (!due) { part = null; time = null; }
      paintDueChips();
      paintPart();
      paintHint();
      paintRepeatDetail();
    });

    const detailEl = body.querySelector(".js-repeat-detail");
    const repeatHint = body.querySelector(".js-repeat-hint");

    function paintRepeat() {
      KN.ui.chipRow(body.querySelector(".js-repeat"),
        REPEATS.map((r) => ({ id: r.id || "", label: r.label })), {
          activeId: repeat || "",
          onPick: (id) => {
            repeat = id || null;
            if (repeat !== "weekly") repeatDays = [];
            if (repeat !== "monthly") repeatNth = null;
            /* 「毎朝」で「毎週」は矛盾。あとから決めたほうが勝つので、
               時間帯のほうが「いつでも」に降ります。 */
            if (isBookend(part) && repeat !== "daily") { part = null; paintPart(); }
            paintRepeat();
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
      if (editing) {
        store.updateTodo(todoId, { title, due: fixed, part: fixed && !at ? part : null, time: at,
          repeat, repeatDays, repeatNth, memo, flagged });
        KN.ui.toast(fixed !== due ? `${when}にしました` : "直しました");
      } else {
        store.addTodo({ title, due: fixed, part: fixed && !at ? part : null, time: at,
          repeat, repeatDays, repeatNth, memo, flagged });
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
    /* 毎朝 opens the day and 毎晩 closes it, with the rest of today between —
       so the panel reads down the day the way the day is lived. Both only
       appear when something is in them: an empty 「毎朝」 line every morning is
       a shelf for a routine nobody has. */
    out.push({ id: "today-dawn", label: BOOKENDS[0].label, color: BOOKENDS[0].color,
      today: true, day: today, part: "dawn", onlyWhenFull: true,
      drop: () => ({ due: today, part: "dawn", time: null }) });
    out.push({ id: "today", label: "今日", color: DAY_COLORS[0], today: true, day: today,
      drop: () => ({ due: today, part: null }) });
    out.push({ id: "today-dusk", label: BOOKENDS[1].label, color: BOOKENDS[1].color,
      today: true, day: today, part: "dusk", onlyWhenFull: true,
      drop: () => ({ due: today, part: "dusk", time: null }) });

    // The coming week, a day at a time.
    for (let i = 1; i <= 7; i++) {
      const day = U.shiftDay(today, i);
      const d = U.dayDate(day);
      const label = i === 1 ? "明日" : i === 2 ? "明後日"
        : `${d.getMonth() + 1}月${d.getDate()}日 ${U.WEEKDAYS[d.getDay()]}`;
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
    /* Only the two ends of the day are shelves of their own now; everything
       else for today sits in 今日 and is ordered by the clock and by hand. */
    if (n === 0) return isBookend(t.part) ? "today-" + t.part : "today";
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
        <button class="item-body">
          <span class="item-name">${t.title}</span>
          ${meta.length ? html`<span class="item-meta">${meta}</span>` : ""}
        </button>
        <button class="fav ${t.flagged ? "is-on" : ""}" aria-pressed="${String(!!t.flagged)}"
                aria-label="${t.title} に★を付ける">${icon("star")}</button>
      </div>
    `);
    wrap.append(row);

    row.querySelector(".check").addEventListener("click", () => tick(t.id));
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
  function tick(id) {
    const t = store.getTodo(id);
    const res = store.toggleTodo(id);
    haptic(12);
    if (res.repeated) {
      KN.ui.toast(`「${t.title}」は次は ${formatDay(res.due)}`, {
        action: { label: "元に戻す", onClick: res.undo },
      });
    }
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
    const closed = shown.filter((t) => t.done || t.archived);

    /* The month, above everything. The shelves below are a calendar unrolled
       downwards, which answers 「次に何をするか」 well and 「今月どのあたりに
       いるのか」 not at all — 8月17日 four screens down is a date without a
       shape. Left out while searching: a filtered list is not a month. */
    if (!query) els.body.append(monthCalendar(store.openTodos()));

    if (!all.length) {
      els.body.append(node(html`
        <div class="empty">
          <div class="empty-art">✅</div>
          <h2 class="empty-title">やることはありません</h2>
          <p class="empty-text">
            下の＋から追加できます。日付を決めておくと、その日が来たときに
            アプリのアイコンに数が出ます。
          </p>
        </div>
      `));
      return;
    }

    if (!shown.length) {
      els.body.append(node(html`
        <p style="text-align:center;color:var(--c-text-3);padding:40px 16px">
          見つかりませんでした
        </p>
      `));
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
  function jumpToDay(day) {
    const target = els.body.querySelector(`.todo-group[data-group="${groupIdOfDay(day)}"]`)
      || els.body.querySelector(".trip.todo-today");
    /* Scrolled by hand rather than with scrollIntoView. That asks *every*
       ancestor to bring the row into view, the document included — and the
       document's one spare pixel is what the status-bar tap listens on, so
       revealing a row here would read as 「上へ戻れ」 and do the opposite
       (app.js). Setting the screen's own scrollTop leaves the document alone. */
    if (target) {
      const bar = root.querySelector(".topbar");
      const inset = bar ? bar.getBoundingClientRect().height : 0;
      const top = root.scrollTop
        + target.getBoundingClientRect().top - root.getBoundingClientRect().top - inset;
      KN.glideTo(root, top);
    }

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

  function monthCalendar(open) {
    const U = KN.util;
    const today = todayKey();
    const now = U.dayDate(today);
    const year = calMonth ? calMonth.year : now.getFullYear();
    const month = calMonth ? calMonth.month : now.getMonth();
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
    open.forEach((t) => {
      if (!t.due || t.repeat) return;
      load.set(t.due, (load.get(t.due) || 0) + 1);
    });

    const sec = node(html`
      <section class="cal" aria-label="${year}年${month + 1}月">
        <h2 class="cal-head">
          <span class="cal-month">${month + 1}月</span>
          <span class="cal-year">${year}</span>
          ${thisMonth ? "" : html`<button type="button" class="cal-now js-now">今日へ</button>`}
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
      const d = new Date(year, month + delta, 1);
      calMonth = { year: d.getFullYear(), month: d.getMonth() };
      haptic();
      renderBody();
    };
    sec.querySelector(".js-prev").addEventListener("click", () => goTo(-1));
    sec.querySelector(".js-next").addEventListener("click", () => goTo(1));
    const nowBtn = sec.querySelector(".js-now");
    if (nowBtn) nowBtn.addEventListener("click", () => { calMonth = null; haptic(); renderBody(); });

    wireMonthSwipe(sec, grid, goTo);

    U.WEEKDAYS.forEach((w, i) => grid.append(node(html`
      <span class="cal-wd ${i === 0 ? "is-sun" : (i === 6 ? "is-sat" : "")}">${w}</span>
    `)));
    for (let i = 0; i < lead; i++) grid.append(node(html`<span class="cal-pad"></span>`));

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
      cell.addEventListener("click", () => { jumpToDay(key); haptic(); });
      grid.append(cell);
    }
    return sec;
  }

  function groupSection(g, rows, tiles) {
    const section = node(html`
      <section class="cat-group todo-group ${rows.length ? "" : "is-empty"}"
               data-group="${g.id}"></section>
    `);
    section.append(head(g, rows.length));
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
  function todayPanel(rowsOf, tiles) {
    const panel = node(html`<section class="trip todo-today"></section>`);
    const plain = groups.find((g) => g.id === "today");
    const bookend = (id) => groups.find((g) => g.id === id);

    const anyToday = rowsOf("today").length
      + rowsOf("today-dawn").length + rowsOf("today-dusk").length;

    if (rowsOf("today-dawn").length) {
      panel.append(groupSection(bookend("today-dawn"), rowsOf("today-dawn"), tiles));
    }

    const top = node(html`
      <section class="todo-group todo-today-any ${rowsOf("today").length ? "" : "is-empty"}"
               data-group="today"></section>
    `);
    top.append(head(plain, rowsOf("today").length));
    if (rowsOf("today").length) {
      const box = node(html`<div class="item-list js-rows ${tiles ? "is-tiles" : ""}"></div>`);
      rowsOf("today").forEach((t) => box.append(todoRow(t, tiles, groups, plain)));
      top.append(box);
      if (!tiles) wireReorder(box, plain);
    } else if (!anyToday) {
      top.append(node(html`<p class="todo-today-empty">今日のぶんはありません</p>`));
    }
    panel.append(top);

    if (rowsOf("today-dusk").length) {
      panel.append(groupSection(bookend("today-dusk"), rowsOf("today-dusk"), tiles));
    }
    return panel;
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

  KN.screens = KN.screens || {};
  KN.screens.todo = { mount, render, dockButton };
})();
