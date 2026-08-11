/* =========================================================
   かいものノート — やること

   The shopping list answers 「何を買う」. This one answers 「いつまでに何を
   する」, which is a different question with a different shape: no prices, no
   shops, no categories — a line of text and, when it matters, the day it is
   wanted by.

   Everything on this screen is arranged around that day. The list is grouped
   by it (late / today / tomorrow / this week / later / no date), the app icon
   counts what is due by it, and 「毎週」 is what keeps a day from being a
   one-off — ticking a repeating todo does not finish it, it moves it to its
   next day.
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
  const repeatLabel = (id) => (REPEATS.find((r) => r.id === id) || REPEATS[0]).label;

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
      searchBtn: chrome.querySelector(".js-search-btn"),
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search:    chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
      body:      chrome.querySelector(".js-body"),
      topbar:    chrome.querySelector(".topbar"),
    };

    KN.ui.wireSearch(els, () => renderBody(), (q) => { query = q; });

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
          <span class="field-hint">日付を決めると、その日からアプリのアイコンに数が出ます</span>
        </div>

        <div class="field">
          <span class="field-label">くりかえし</span>
          <div class="js-repeat"></div>
        </div>

        <div class="field">
          <button type="button" class="icon-auto fav-toggle js-flag" aria-pressed="${String(flagged)}">
            <span class="icon-pick-mark js-flag-mark">${icon("flag")}</span>
            <span class="icon-pick-text">
              <span class="icon-pick-name">目印を付ける</span>
              <span class="icon-pick-sub js-flag-sub">同じ日のなかで先に出てきます</span>
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

    /* The three days a todo is nearly always for, then the calendar for the
       rest. Typing a date into a date field is four taps that 「今日」 does in
       one, and 「今日」 is what most of these are. */
    function paintDueChips() {
      const opts = [
        { id: todayKey(), label: "今日" },
        { id: shiftDay(todayKey(), 1), label: "明日" },
        { id: shiftDay(todayKey(), 7), label: "1週間後" },
        { id: "", label: "なし" },
      ];
      KN.ui.chipRow(body.querySelector(".js-due-chips"), opts.map((o) => ({ id: o.id, label: o.label })), {
        activeId: due || "",
        onPick: (id) => {
          due = id || null;
          dueEl.value = due || "";
          paintDueChips();
          haptic();
        },
      });
    }
    paintDueChips();

    dueEl.addEventListener("change", () => {
      due = dueEl.value || null;
      paintDueChips();
    });

    function paintRepeat() {
      KN.ui.chipRow(body.querySelector(".js-repeat"),
        REPEATS.map((r) => ({ id: r.id || "", label: r.label })), {
          activeId: repeat || "",
          onPick: (id) => { repeat = id || null; paintRepeat(); haptic(); },
        });
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
      if (editing) {
        store.updateTodo(todoId, { title, due, repeat, memo, flagged });
        KN.ui.toast("直しました");
      } else {
        store.addTodo({ title, due, repeat, memo, flagged });
        KN.ui.toast(due
          ? `「${title}」を${formatDay(due)}までに`
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

  /* ---------------- rows ---------------- */

  function todoRow(t) {
    const late = !t.done && t.due && daysUntil(t.due) < 0;
    const wrap = node(html`
      <article class="item-wrap todo-wrap ${late ? "is-late" : ""}" data-todo-id="${t.id}">
        <div class="swipe-yes">
          ${icon("calendar")}<span>今日にする</span>
        </div>
        <div class="swipe-arch is-danger">
          <span>削除</span>${icon("trash")}
        </div>
      </article>
    `);

    const row = node(html`
      <div class="item todo ${t.done ? "is-checked" : ""} ${late ? "is-late" : ""}">
        <button class="check" role="checkbox" aria-checked="${String(t.done)}"
                aria-label="${t.title} を終わりにする">${icon("check")}</button>
        <button class="item-body">
          <span class="item-name-row">
            ${t.flagged ? html`<span class="todo-flag" aria-label="目印">${icon("flag")}</span>` : ""}
            <span class="item-name">${t.title}</span>
          </span>
          <span class="item-meta">
            ${t.due
              ? html`<span class="item-when ${late ? "is-late" : ""}">${formatDay(t.due)}</span>`
              : ""}
            ${t.repeat
              ? html`<span class="todo-repeat">${icon("repeat")}${repeatLabel(t.repeat)}</span>` : ""}
            ${t.done && t.doneAt
              ? html`<span class="item-when">${KN.util.formatDate(t.doneAt)}</span>` : ""}
            ${t.memo ? html`<span class="item-memo">${t.memo}</span>` : ""}
          </span>
        </button>
      </div>
    `);
    wrap.append(row);

    row.querySelector(".check").addEventListener("click", () => tick(t.id));
    row.querySelector(".item-body").addEventListener("click", () => openSheet(t.id));

    KN.ui.swipeActions(wrap, row, {
      onRight: () => {
        store.updateTodo(t.id, { due: todayKey() });
        haptic(12);
        KN.ui.toast(`「${t.title}」を今日にしました`);
      },
      onLeft: () => {
        const undo = store.removeTodo(t.id);
        haptic(14);
        KN.ui.toast(`「${t.title}」を削除しました`, { action: { label: "元に戻す", onClick: undo } });
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
    const todos = store.get().todos;
    const left = todos.filter((t) => !t.done).length;
    const dueNow = store.todosDue().length;
    els.sub.textContent = todos.length
      ? (dueNow ? `残り${left}件 ・ 今日までが${dueNow}件` : `残り${left}件`)
      : "";
    renderBody();
  }

  /* Groups, in the order a day is lived: what is already late, then today,
     then what is coming, then the things with no day at all. Empty groups are
     not drawn — a heading over nothing is a heading that has to be read and
     then dismissed. */
  const GROUPS = [
    { id: "late",  label: "期限切れ",  match: (n) => n !== null && n < 0 },
    { id: "today", label: "今日",      match: (n) => n === 0 },
    { id: "tom",   label: "明日",      match: (n) => n === 1 },
    { id: "week",  label: "今週",      match: (n) => n !== null && n >= 2 && n <= 7 },
    { id: "later", label: "それ以降",  match: (n) => n !== null && n > 7 },
    { id: "none",  label: "日付なし",  match: (n) => n === null },
  ];

  function renderBody() {
    els.body.innerHTML = "";
    const all = store.sortedTodos();
    const q = query;
    const hit = (t) => !q
      || KN.util.foldKana(t.title).includes(q)
      || KN.util.foldKana(t.memo || "").includes(q);

    const shown = all.filter(hit);
    const open = shown.filter((t) => !t.done);
    const done = shown.filter((t) => t.done);

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
      const rows = open.filter((t) => g.match(t.due ? daysUntil(t.due) : null));
      if (!rows.length) return;
      const section = node(html`
        <section class="cat-group">
          <h2 class="todo-head ${g.id === "late" ? "is-late" : ""}">
            <span>${g.label}</span>
            <span class="cat-head-count">${rows.length}</span>
          </h2>
          <div class="item-list js-rows"></div>
        </section>
      `);
      const box = section.querySelector(".js-rows");
      rows.forEach((t) => box.append(todoRow(t)));
      els.body.append(section);
    });

    if (!open.length) {
      els.body.append(node(html`
        <p style="text-align:center;color:var(--c-text-3);padding:28px 16px">
          やることは全部おわりました
        </p>
      `));
    }

    if (done.length) els.body.append(archiveSection(done));
  }

  /* Finished todos, dated, newest first — the same drawer, in the same words,
     as the shopping list's and the price screen's. */
  function archiveSection(done) {
    const open = store.get().settings.showTodoArchive === true;

    const section = node(html`
      <section class="cat-group">
        <button class="done-head" aria-expanded="${String(open)}">
          ${icon("chevron")} アーカイブ <span class="cat-head-count">${done.length}</span>
        </button>
        <div class="item-list js-done" ${open ? "" : KN.util.raw("hidden")}></div>
      </section>
    `);

    if (open) {
      const box = section.querySelector(".js-done");
      done.slice()
        .sort((a, b) => String(b.doneAt || "").localeCompare(String(a.doneAt || "")))
        .forEach((t) => box.append(todoRow(t)));
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
