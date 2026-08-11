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

  /* 「毎週」 on its own says how often; 「毎週 火・金」 says when. The rows are
     read at a glance, so they carry the whole rule rather than the frequency
     with the details hidden in a sheet. */
  function repeatText(t) {
    if (!t.repeat) return "";
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
              <div class="topbar-sub js-sub"></div>
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
      sub:       chrome.querySelector(".js-sub"),
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
          dueEl.value = due || "";
          paintDueChips();
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

    paintDueChips();
    paintHint();

    dueEl.addEventListener("change", () => {
      due = dueEl.value || null;
      paintDueChips();
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
      if (editing) {
        store.updateTodo(todoId, { title, due: fixed, repeat, repeatDays, repeatNth, memo, flagged });
        KN.ui.toast(fixed !== due ? `${formatDay(fixed)}にしました` : "直しました");
      } else {
        store.addTodo({ title, due: fixed, repeat, repeatDays, repeatNth, memo, flagged });
        KN.ui.toast(fixed
          ? `「${title}」を${formatDay(fixed)}までに`
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

    if (!editing) setTimeout(() => titleEl.focus(), 120);
  }

  /* ---------------- the day this belongs to ----------------

     Six buckets and a name each. The names are what the screen is read by, so
     they say when rather than how far: 「明後日」 rather than 「2日後」, and
     「いつか」 rather than 「日付なし」 — a todo with no day is not missing a
     field, it is a thing to do sometime.

     Each carries the day something lands on when it is dragged into it, which
     is what makes the dividers rescheduling handles rather than labels. 期限切れ
     is the exception: a day that has already gone is not a day to move
     something *to*, so nothing can be dropped there.

     The colour is the other half. It runs from the red of today out through
     orange and green to the blue of things far off, and grey for the ones with
     no day — near is hot, far is cool, undecided is neither. */
  const GROUPS = [
    { id: "late",  label: "期限切れ",  color: "#b23a2e", drop: null,
      match: (n) => n !== null && n < 0 },
    { id: "today", label: "今日",      color: "#e05a3a", drop: () => todayKey(),
      match: (n) => n === 0 },
    { id: "tom",   label: "明日",      color: "#e08a3a", drop: () => shiftDay(todayKey(), 1),
      match: (n) => n === 1 },
    { id: "tom2",  label: "明後日",    color: "#cfa93c", drop: () => shiftDay(todayKey(), 2),
      match: (n) => n === 2 },
    { id: "week",  label: "1週間以内", color: "#5aa55a", drop: () => shiftDay(todayKey(), 3),
      match: (n) => n !== null && n >= 3 && n <= 7 },
    { id: "later", label: "先の予定",  color: "#4a8fd9", drop: () => shiftDay(todayKey(), 8),
      match: (n) => n !== null && n > 7 },
    { id: "none",  label: "いつか",    color: "#9aa4a0", drop: () => null,
      match: (n) => n === null },
  ];

  const groupOf = (t) => {
    const n = t.due ? daysUntil(t.due) : null;
    return GROUPS.find((g) => g.match(n)) || GROUPS[GROUPS.length - 1];
  };

  /* ---------------- rows ---------------- */

  function todoRow(t, tiles) {
    const g = groupOf(t);
    const closed = t.done || t.archived;
    const when = closed ? store.todoClosedAt(t) : null;

    const wrap = node(html`
      <article class="item-wrap todo-wrap ${tiles ? "is-tile-wrap" : ""}"
               data-todo-id="${t.id}" style="--cat:${g.color}">
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
        <button class="check" role="checkbox" aria-checked="${String(!!t.done)}"
                aria-label="${t.title} を終わりにする">${icon("check")}</button>
        <button class="fav ${t.flagged ? "is-on" : ""}" aria-pressed="${String(!!t.flagged)}"
                aria-label="${t.title} に★を付ける">${icon("star")}</button>
        <button class="item-body">
          <span class="item-name">${t.title}</span>
          <span class="tile-when">${closed ? KN.util.formatDate(when) : (t.due ? formatDay(t.due) : "いつか")}</span>
          ${t.repeat ? html`<span class="tile-repeat">${icon("repeat")}${repeatText(t)}</span>` : ""}
        </button>
      </div>
    `) : node(html`
      <div class="item todo ${closed ? "is-checked" : ""}">
        <button class="check" role="checkbox" aria-checked="${String(!!t.done)}"
                aria-label="${t.title} を終わりにする">${icon("check")}</button>
        <button class="item-body">
          <span class="item-name-row">
            <span class="item-name">${t.title}</span>
          </span>
          <span class="item-meta">
            ${closed && when
              ? html`<span class="item-when">${KN.util.formatDate(when)}</span>`
              : (t.due ? html`<span class="item-when ${g.id === "late" ? "is-late" : ""}">${formatDay(t.due)}</span>` : "")}
            ${t.archived && !t.done ? html`<span class="todo-tag">しまった</span>` : ""}
            ${t.repeat
              ? html`<span class="todo-repeat">${icon("repeat")}${repeatText(t)}</span>` : ""}
            ${t.memo ? html`<span class="item-memo">${t.memo}</span>` : ""}
          </span>
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

  function render() {
    const open = store.openTodos();
    const dueNow = store.todosDue().length;
    els.sub.textContent = store.get().todos.length
      ? (dueNow ? `残り${open.length}件 ・ 今日までが${dueNow}件` : `残り${open.length}件`)
      : "";
    KN.ui.paintLayoutButton(els.layout);
    renderBody();
  }

  function renderBody() {
    els.body.innerHTML = "";
    const tiles = KN.ui.isTiles();
    const all = store.sortedTodos();
    const q = query;
    const hit = (t) => !q
      || KN.util.foldKana(t.title).includes(q)
      || KN.util.foldKana(t.memo || "").includes(q);

    const shown = all.filter(hit);
    const open = shown.filter((t) => !t.done && !t.archived);
    const closed = shown.filter((t) => t.done || t.archived);

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

    GROUPS.forEach((g) => {
      const rows = open.filter((t) => groupOf(t).id === g.id);
      // 今日 keeps its heading even when empty: it is the one group the screen
      // is really about, and an empty 今日 is worth seeing.
      if (!rows.length && g.id !== "today") return;
      els.body.append(g.id === "today" ? todaySection(g, rows, tiles) : groupSection(g, rows, tiles));
    });

    if (!open.length) {
      els.body.append(node(html`
        <p style="text-align:center;color:var(--c-text-3);padding:20px 16px">
          やることは全部かたづきました
        </p>
      `));
    }

    if (closed.length) els.body.append(archiveSection(closed, tiles));
  }

  function head(g, count) {
    return node(html`
      <h2 class="todo-head ${g.id === "late" ? "is-late" : ""}" style="--cat:${g.color}">
        <span class="todo-head-dot"></span>
        <span>${g.label}</span>
        <span class="cat-head-count">${count}</span>
      </h2>
    `);
  }

  function groupSection(g, rows, tiles) {
    const section = node(html`
      <section class="cat-group todo-group" data-group="${g.id}"></section>
    `);
    section.append(head(g, rows.length));
    const box = node(html`<div class="item-list js-rows ${tiles ? "is-tiles" : ""}"></div>`);
    rows.forEach((t) => box.append(todoRow(t, tiles)));
    section.append(box);
    if (!tiles) wireReorder(box, g);
    return section;
  }

  /* 今日 gets the panel that 今回買うもの has on the shopping list: the rows sit
     *inside* something rather than under a heading, and an edge is visible from
     anywhere in it while a heading three rows up is not. It is the same idea on
     both screens — 「これが今日ぶんです」. */
  function todaySection(g, rows, tiles) {
    const section = node(html`
      <section class="trip todo-today todo-group" data-group="today"></section>
    `);
    section.append(head(g, rows.length));
    if (!rows.length) {
      section.append(node(html`
        <p class="todo-today-empty">今日のぶんはありません</p>
      `));
      return section;
    }
    const box = node(html`<div class="item-list js-rows ${tiles ? "is-tiles" : ""}"></div>`);
    rows.forEach((t) => box.append(todoRow(t, tiles)));
    section.append(box);
    if (!tiles) wireReorder(box, g);
    return section;
  }

  /* ---------------- picking one up ----------------

     Within a group a drag reorders, exactly as it does on the shopping list.
     Across a divider it reschedules: the groups *are* the days, so carrying a
     row from 今日 down into 明日 is the plainest way of saying 「明日にする」 —
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
        store.updateTodo(todoId, { due: target.drop() });
        haptic(14);
        if (t) {
          KN.ui.toast(target.id === "none"
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

  /** Which group's section is under this point, if any. */
  function groupUnder(clientY) {
    const sections = els.body.querySelectorAll(".todo-group");
    for (const sec of sections) {
      const r = sec.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        return GROUPS.find((x) => x.id === sec.dataset.group) || null;
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
        .forEach((t) => box.append(todoRow(t, tiles)));
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
