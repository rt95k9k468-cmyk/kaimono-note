/* =========================================================
   くらしノート — shopping list screen
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, frag, icon, yen } = KN.util;
  const store = KN.store;

  let root = null;
  let els = {};
  let categoryFilter = null;   // categoryId or null = all
  let query = "";              // folded, from the search bar
  /* 「買った」の三段（光る → 落ちる → 組み直す）を走っている最中の id。
     途中でもう一度押されても、二度目は無視します——押した回数ぶん
     チェックが行き来すると、落ちきったころには元に戻っています。 */
  const finishing = new Set();

  /* ---------------- mount (static chrome) ---------------- */

  function mount(el) {
    root = el;
    root.innerHTML = "";

    const chrome = node(html`
      <div class="stack">
        <header class="topbar">
          <div class="topbar-row">
            <div style="flex:1;min-width:0">
              ${/* 題は出します。ただし帯の高さは他のタブと同じまま——題の
                   ぶんだけ帯が太ると、この画面だけ一段深いところにいるように
                   見えるので。色は「2026年」と同じコーラル（--c-primary）で、
                   どのタブでも「いまどこか」を言う字は同じ色にします。 */""}
              <h1 class="topbar-title tab-title">買うもの</h1>
              <div class="topbar-sub js-sub"></div>
            </div>
            ${/* No 「まとめて削除」 on this bar any more. Having bought
                 something is not a reason to throw the record of it away, and
                 there is no moment in a shop where that is the thing you
                 reach for. What is bought drops into the archive below,
                 dated, and stays there.

                 The three that are here are the same three, in the same
                 order, on this screen and on 価格: くらべる・並べ方・さがす. */""}
            ${/* 価格の画面へ。ここにあったのは「お店をくらべる」でした——
                  行き先を決めるときに何度か使うもので、買い物の途中で押す
                  ものではなかったので、外しました。かわりに、値段を仕込む
                  ところ（商品と価格）への戸を置きます。値札の絵にしたのは、
                  行った先の画面が値札を並べているからです。 */""}
            ${/* 右上は**二つだけ**です——さがす と 設定。並べ方（タイル／行）と
                  暦の出し入れは、押すたびに画面が組み変わるほど強いのに、
                  たまにしか使いません。たまに使うものは設定の中へ。
                  右上に居るのは「どの画面でも同じ二つ」だけにします。 */""}
            <button class="icon-btn js-search-btn" aria-label="商品名で探す">${icon("search")}</button>
            <button class="icon-btn js-settings" aria-label="設定">${icon("gear")}</button>
          </div>
        </header>

        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="リストの中を探す" aria-label="リストの中を探す"
                   autocomplete="off" spellcheck="false">
            <button class="icon-btn js-search-clear" aria-label="検索をクリア"
                    style="width:28px;height:28px" hidden>${icon("close")}</button>
          </div>
        </div>

        ${/* 進み具合の帯は外しました。「何件買ったか」は下の見出しが数で
             言っていて、帯はそれを絵にし直しているだけ——しかも買い物の
             途中で見るのは「あと何を買うか」であって、達成率ではないので。 */""}

        <div class="js-filter"></div>
        ${/* 紙と掴み手。やること・daily と同じ器です。**掴み手を下へ引くと
              価格の面が出ます**——この二つは横に並んだ二つのタブではなく、
              買うものの後ろに価格がいる、という重なりなので。 */""}
        <div class="tl-sheet js-sheet">
          <span class="tl-grip js-grip" aria-hidden="true"><i></i></span>
          <div class="js-body"></div>
        </div>
      </div>
    `);

    root.append(chrome);

    els = {
      sub:        chrome.querySelector(".js-sub"),
      searchBtn:  chrome.querySelector(".js-search-btn"),
      screen:     root,
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search:     chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
      filter:     chrome.querySelector(".js-filter"),
      body:       chrome.querySelector(".js-body"),
      topbar:     chrome.querySelector(".topbar"),
    };

    /* 掴み手は上のバーのすぐ下に貼りつきます。バーの高さはノッチの深さで
       変わるので、実測して渡します（CSSに焼き込むと機種でずれる）。 */
    const fitBar = () => {
      const h = els.topbar.getBoundingClientRect().height;
      root.style.setProperty("--topbar-h", Math.round(h) + "px");
    };
    fitBar();
    window.addEventListener("resize", fitBar);
    KN.app.wireFaceGrip(chrome.querySelector(".js-grip"), { down: "prices" });

    chrome.querySelector(".js-settings").addEventListener("click",
      () => KN.app.showScreen("settings"));
    KN.ui.wireSearch(els, () => render(), (q) => { query = q; });

    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  /* ---------------- the add sheet ---------------- */

  /* One form for everything a new line on the list needs: what it is, how
     many, and which aisle it belongs to. The name field still suggests as you
     type — tapping a suggestion is what turns 「ぎゅうにゅう」 into the 牛乳
     already on file, with its prices and its category, instead of a second
     product with the same name.

     It closes after each add. Staying open saved a tap, and cost the sight of
     the row that had just appeared — the sheet sat over the list it had
     changed. One add, one close; the ＋ is under the thumb for the next. */
  function openAddSheet() {
    KN.motion.fire("save");

    let picked = null;        // an existing product chosen from the suggestions
    let catTouched = false;   // the category was set by hand, so stop guessing
    let fav = false;          // ★ — part of the trip being shopped now

    /* No 個数 here. It was a stepper that said 1 nearly every time, in a form
       whose whole job is to be over quickly; the quantity is a detail about a
       line that already exists, and the row's own sheet is where it belongs.
       The ★ took its place, because *that* is a decision made while writing
       the list — this trip or sometime — and going back to set it afterwards
       is the trip through the list the button was meant to save. */
    const body = node(html`
      <div class="stack" style="gap:18px">
        <div class="field">
          <span class="field-label">商品名</span>
          <input class="input js-name" placeholder="例：食器用洗剤"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 aria-autocomplete="list">
          <div class="js-ac"></div>
          <span class="field-hint js-known" hidden></span>
        </div>

        <div class="field">
          <button type="button" class="icon-auto fav-toggle js-fav" aria-pressed="false">
            <span class="icon-pick-mark js-fav-mark">${icon("star")}</span>
            <span class="icon-pick-text">
              <span class="icon-pick-name">今回買う</span>
              <span class="icon-pick-sub js-fav-sub">★を付けると、今回の買い物としてまとまります</span>
            </span>
          </button>
        </div>

        <div class="field">
          <span class="field-label">カテゴリ</span>
          <div class="js-cat"></div>
        </div>

        <label class="field">
          <span class="field-label">メモ（任意）</span>
          <input class="input js-memo" placeholder="例：詰め替え用" autocomplete="off">
        </label>
      </div>
    `);

    const nameEl = body.querySelector(".js-name");
    const memoEl = body.querySelector(".js-memo");
    const acHost = body.querySelector(".js-ac");
    const known  = body.querySelector(".js-known");
    const favBtn = body.querySelector(".js-fav");
    const favSub = body.querySelector(".js-fav-sub");

    const foot = node(html`<button class="btn btn-primary btn-block js-add" disabled>リストに追加</button>`);
    const addBtn = foot;

    const handle = KN.ui.sheet({ title: "買うものを追加", content: body, footer: foot, guard: true });

    const cat = KN.ui.categoryPicker(body.querySelector(".js-cat"), {
      selectedId: store.OTHER_CATEGORY,
      onSelect: () => { catTouched = true; },
    });

    favBtn.addEventListener("click", () => {
      fav = !fav;
      favBtn.classList.toggle("is-on", fav);
      favBtn.setAttribute("aria-pressed", String(fav));
      favSub.textContent = fav
        ? "今回の買い物としてまとまります"
        : "★を付けると、今回の買い物としてまとまります";
      KN.motion.fire("save");
    });

    /* Everything the name field drives: the button, the suggestions, and —
       until the category is touched by hand — the guess underneath it. */
    function onName() {
      const typed = nameEl.value.trim();
      addBtn.disabled = !typed;
      // Typing on past a chosen suggestion means it is no longer that product.
      if (picked && KN.util.foldKana(picked.name) !== KN.util.foldKana(typed)) {
        picked = null;
        known.hidden = true;
      }
      if (!picked && !catTouched) cat.set(typed ? store.guessCategory(typed) : store.OTHER_CATEGORY);
      renderSuggestions(nameEl, acHost, typed, choose);
    }

    /* A suggestion tapped: from here the form is about that product, so its
       category comes along and the sheet says which one it landed on. */
    function choose(product) {
      picked = product;
      nameEl.value = product.name;
      addBtn.disabled = false;
      catTouched = false;
      cat.set(product.categoryId);
      const best = store.bestPrice(product);
      const st = best ? store.getStore(best.storeId) : null;
      known.hidden = false;
      known.textContent = best && st
        ? `登録済みの商品です・${st.name} ${yen(best.price)} が最安`
        : "登録済みの商品です";
      acHost.innerHTML = "";
      nameEl.focus();
    }

    nameEl.addEventListener("input", onName);
    nameEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      submit();
    });
    memoEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    addBtn.addEventListener("click", submit);

    function submit() {
      const name = nameEl.value.trim();
      if (!name) { nameEl.focus(); return; }

      const product = picked || store.findProductByName(name)
        || store.addProduct({ name, categoryId: cat.current });

      /* A category chosen by hand outranks the guess, and is remembered — the
         next 「コンソメ」 lands where this one did without being told again.
         Applied even when the product was just created with that category:
         the guess and the choice agreeing does not make it a guess. */
      if (catTouched) {
        store.update((s) => {
          const rec = s.products.find((x) => x.id === product.id);
          if (rec) { rec.categoryId = cat.current; rec.catManual = true; }
        });
        store.learnCategory(product.name, cat.current);
      }

      const memo = memoEl.value.trim();
      const already = store.get().items.find((i) => i.productId === product.id && !i.checked);
      if (already) {
        // Already on the list: nothing to add, but the ★ and the memo are
        // still what was just said about it.
        store.update((s) => {
          const rec = s.items.find((i) => i.id === already.id);
          if (!rec) return;
          if (memo) rec.memo = memo;
          if (fav) rec.fav = true;
        });
        KN.ui.toast(`「${product.name}」はもうリストにあります`);
      } else {
        const rec = store.addItem(product.id, { memo });
        if (fav) store.update((s) => {
          const it = s.items.find((i) => i.id === rec.id);
          if (it) it.fav = true;
        });
        const c = store.getCategory(product.categoryId);
        KN.ui.toast(`${c.emoji} ${c.name} に「${product.name}」を追加しました`);
      }
      KN.motion.fire("save");
      /* Closed, not cleared. Staying open was meant to save a tap on a long
         list written in one sitting, but it left the sheet covering the very
         list it had just changed — so every add ended with a look at a form
         instead of at the line that appeared. One add, one close, and the ＋
         is right there under the thumb for the next one. */
      handle.close();
    }

    /* Straight into the field, keyboard and all.

       It has to happen *here* — synchronously, still inside the tap that
       opened the sheet. iOS only raises the keyboard for a focus that belongs
       to a gesture it can see, so the same call one frame later (or after the
       sheet's own animation, which is where it used to live) focuses the field
       and leaves the keyboard down: a caret blinking in a box you then have to
       tap anyway. */
    KN.ui.focusNow(nameEl);
    return handle;
  }

  /* ---------------- suggestions ---------------- */

  /* Matched on the folded name, so a single 「え」 already surfaces
     「エマール」 — nobody switches to katakana to search their own list. */
  function renderSuggestions(input, host, typed, onPick) {
    const q = KN.util.foldKana(typed);
    if (!q) { host.innerHTML = ""; return; }

    const onList = new Set(store.get().items.filter((i) => !i.checked).map((i) => i.productId));
    const found = store.get().products
      .map((p) => ({ p, key: KN.util.foldKana(p.name) }))
      .filter((r) => r.key.includes(q))
      .sort((a, b) => {
        const aStarts = a.key.startsWith(q) ? 0 : 1;
        const bStarts = b.key.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.p.name.localeCompare(b.p.name, "ja");
      })
      .slice(0, 6)
      .map((r) => r.p);

    if (!found.length) { host.innerHTML = ""; return; }

    /* Reuse the panel across keystrokes. Rebuilding it restarted the open
       animation on every character, which read as the list flickering. */
    let box = host.querySelector(".ac");
    if (!box) {
      box = node(html`<div class="ac" role="listbox"></div>`);
      host.append(box);
    } else {
      box.innerHTML = "";
    }

    found.forEach((p) => {
      const best = store.bestPrice(p);
      const bestStore = best ? store.getStore(best.storeId) : null;
      const row = node(html`
        <button type="button" class="ac-item" role="option">
          <span class="ac-emoji">${store.productMark(p)}</span>
          <span class="ac-main">
            <span class="ac-name">${p.name}</span>
            <span class="ac-sub">
              ${best && bestStore ? html`${bestStore.name} ${yen(best.price)} が最安` : "価格の記録なし"}
              ${onList.has(p.id) ? html` ・<b>リストにあります</b>` : ""}
            </span>
          </span>
        </button>
      `);
      // Keep the caret where it is; a suggestion is not somewhere to move to.
      row.addEventListener("mousedown", (e) => e.preventDefault());
      row.addEventListener("click", () => onPick(p));
      box.append(row);
    });
  }

  /* ---------------- render ---------------- */

  function render() {
    const st = store.get();
    const items = st.items;

    // Once anything is starred the header tracks that trip rather than the whole
    // list, so it agrees with the tab badge instead of quoting a second number.
    const scope = items.some((i) => i.fav) ? items.filter((i) => i.fav) : items;
    const done = scope.filter((i) => i.checked).length;
    const label = scope === items ? "" : "今回買うもの ";

    /* 表題の下には、何も出しません。

       「8件中8件購入済み」と書いていましたが、すぐ下の見出しが件数を持ち、
       その下に進み具合の帯もあります。同じことを三度言っていました。
       題のすぐ下は目がいちばん先に行く場所なので、そこは空けます。 */
    els.sub.textContent = "";



    renderFilter(items);
    /* Searching narrows the rows, not the header: the counts above still
       describe the whole trip, because a search is a way of looking at the
       list rather than a change to it. */
    renderBody(query ? items.filter(matchesQuery) : items);
  }

  /** Name, memo, or category — whichever the query happens to be. */
  function matchesQuery(item) {
    const p = store.getProduct(item.productId);
    if (!p) return false;
    const cat = store.getCategory(p.categoryId);
    return KN.util.foldKana(p.name).includes(query)
      || KN.util.foldKana(item.memo || "").includes(query)
      || (!!cat && KN.util.foldKana(cat.name).includes(query));
  }

  function renderFilter(items) {
    const counts = new Map();
    items.filter((i) => !i.checked).forEach((i) => {
      const p = store.getProduct(i.productId);
      if (!p) return;
      counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    });

    if (counts.size < 2) { categoryFilter = null; els.filter.innerHTML = ""; return; }
    if (categoryFilter && !counts.has(categoryFilter)) categoryFilter = null;

    const chips = [{ id: "", label: "すべて" }].concat(
      store.sortedCategories().filter((c) => counts.has(c.id)).map((c) => ({
        id: c.id, label: c.name, emoji: c.emoji, color: c.color, count: counts.get(c.id),
      })));

    KN.ui.chipRow(els.filter, chips, {
      activeId: categoryFilter || "",
      onPick: (id) => {
        categoryFilter = id && id !== categoryFilter ? id : null;
        KN.motion.fire("select");
        render();
      },
    });
  }

  function renderBody(items) {
    /* 組み直す前に、いまどの行がどこに居るかを測ります。組み終わってから
       settle() を呼ぶと、動いた行が「もといた場所」から滑ってきます
       （ui.js の flipRows）。丸ごと入れ替わるとき（検索・カテゴリの切り替え）
       は、向こうが自分で見送ります。 */
    const settle = KN.ui.flipRows(els.body, ".item-wrap");
    els.body.innerHTML = "";

    if (!items.length) {
      // An empty search is not an empty list, and offering 「サンプルを入れて
      // 試す」 to someone who just typed a name would be answering the wrong
      // question entirely.
      els.body.append(query
        ? node(html`
            <p style="text-align:center;color:var(--c-text-3);padding:40px 16px">
              見つかりませんでした
            </p>`)
        : emptyState());
      return;
    }

    const active = items.filter((i) => !i.checked);
    const checked = items.filter((i) => i.checked);
    const trip = active.filter((i) => i.fav);

    if (!trip.length) {
      /* Nothing starred: just the list. A total and a 「今回は◯◯だけで足ります」
         underneath would be answering a question nobody asked — the whole list
         is a standing note of things to buy sometime, not a shopping trip, and
         adding up a year of sometime gives a number with no occasion. Both come
         back the moment something is starred, where they mean this trip. */
      const shown = appendGroups(active);
      if (!shown && categoryFilter) els.body.append(noneInCategory());
      if (checked.length) els.body.append(checkedSection(checked));
      settle();
      return;
    }

    const rest = active.filter((i) => !i.fav);

    /* 今回買うもの gets a box of its own rather than a heading of its own. A
       heading is a line above a list, and a line above a list is easy to lose
       track of once you are three rows down; a panel the rows sit *inside*
       is unmistakable at any scroll position.

       No total at the foot of it. It could only ever be the total of the
       items whose price happens to be on file, which is not the total of the
       basket — and a number sitting under a list looks like the sum of that
       list. 「4品は値段が未登録」 next to it was an admission that the figure
       above was answering a different question. Each row still says what that
       one costs, which is a fact rather than an estimate. */
    const box = node(html`<section class="trip"></section>`);
    box.append(sectionHead("今回買うもの", trip.length, "trip"));
    const inner = node(html`<div class="trip-body"></div>`);
    const tripShown = appendGroups(trip, inner);
    if (!tripShown && categoryFilter) inner.append(noneInCategory());
    box.append(inner);
    box.append(tripPlanRow());
    els.body.append(box);
    els.body.append(insightsCard(trip));

    if (rest.length) {
      els.body.append(sectionHead("そのほか", rest.length, "rest"));
      appendGroups(rest);
    }

    if (checked.length) els.body.append(checkedSection(checked));
    settle();
  }

  /* ---------------- 「いつ行くか」を、予定のほうへ ----------------

     ★は「今回買うもの」を決めますが、**いつ行くか**は言いません。それは
     一日の組み立ての話なので、やること側に一件置いて、そちらで時間を
     決められるようにします（時間割の上でつまんで動かせます）。

     置くのは「買い物へ行く」の一件だけです。何を買うかはこの画面が持ち
     つづけます——予定側に品名まで写すと、★をひとつ足した瞬間に古くなる
     ので。 */
  function tripPlanRow() {
    const day = KN.util.todayKey();
    const planned = store.tripTodo(day);
    const row = node(html`
      <div class="trip-plan">
        <button type="button" class="trip-plan-btn ${planned ? "is-on" : ""}">
          ${icon(planned ? "check" : "plus")}
          <span>${planned ? "今日の予定にあります" : "今日の予定に入れる"}</span>
        </button>
      </div>
    `);
    row.querySelector("button").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      if (store.tripTodo(day)) {
        store.unplanTrip(day);
        KN.motion.fire("delete", btn);
        KN.ui.toast("今日の予定から外しました");
      } else {
        store.planTrip(day);
        KN.motion.fire("add", btn);
        KN.ui.toast("今日の予定に入れました", {
          action: { label: "見る", onClick: () => KN.app.showScreen("todo") },
        });
      }
      render();
    });
    return row;
  }

  /** Renders category groups for the given items. Returns whether anything showed. */
  function appendGroups(list, host) {
    const into = host || els.body;
    const groups = new Map();
    list.forEach((item) => {
      const p = store.getProduct(item.productId);
      if (!p) return;
      if (categoryFilter && p.categoryId !== categoryFilter) return;
      if (!groups.has(p.categoryId)) groups.set(p.categoryId, []);
      groups.get(p.categoryId).push({ item, product: p });
    });

    /* Tiles are one grid for the lot. A separate grid per category would give
       a category of one item a row of its own and two empty cells beside it —
       which is exactly the wasted space the layout is for. The order still
       runs category by category, and each tile wears its own colour, so the
       run is still visible; it just wraps instead of starting a new block. */
    if (KN.ui.isTiles()) {
      const grid = node(html`<div class="item-list is-tiles"></div>`);
      store.sortedCategories().forEach((cat) => {
        (groups.get(cat.id) || []).forEach(({ item, product }) => {
          grid.append(itemRow(item, product));
        });
      });
      if (grid.childElementCount) {
        const section = node(html`<section class="cat-group"></section>`);
        section.append(grid);
        into.append(section);
      }
      return groups.size > 0;
    }

    store.sortedCategories().forEach((cat) => {
      const entries = groups.get(cat.id);
      if (!entries || !entries.length) return;

      /* No heading. The category is written down the left edge of every row
         instead (see .item::before) — a word above each handful of rows was
         more furniture than the list could carry, and the colour says the
         same thing without taking a line. The grouping stays: it is what
         makes the colours run in blocks, and what a drag reorders within. */
      const group = node(html`
        <section class="cat-group" style="--cat:${cat.color || ""}">
          <div class="item-list"></div>
        </section>
      `);
      const listEl = group.querySelector(".item-list");
      entries.forEach(({ item, product }) => listEl.append(itemRow(item, product)));
      wireReorder(listEl);
      into.append(group);
    });

    return groups.size > 0;
  }

  /* Reordering is within a group, because a group is exactly the set of rows
     that are interchangeable: same category, same side of the「今回買うもの」
     line. Dragging a row into another category's group would have to silently
     recategorise it, which is not what picking it up looks like it means. */
  function wireReorder(listEl) {
    KN.reorder.attach(listEl, {
      item: ".item-wrap",
      onDrop: (from, to) => {
        const ids = Array.prototype.map.call(listEl.children, (w) => w.dataset.itemId);
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);

        // The group's order is its members' order within the whole list, so
        // the move writes them back into the same slots they already occupy —
        // everything not in this group stays exactly where it was.
        store.update((s) => {
          const inGroup = new Set(ids);
          const slots = [];
          s.items.forEach((it, i) => { if (inGroup.has(it.id)) slots.push(i); });
          const byId = new Map(s.items.map((it) => [it.id, it]));
          ids.forEach((id, k) => { s.items[slots[k]] = byId.get(id); });
        });
        KN.motion.fire("save");
      },
    });
  }

  function sectionHead(label, count, kind) {
    return node(html`
      <h2 class="trip-head trip-head-${kind}">
        ${kind === "trip" ? icon("star") : ""}
        <span>${label}</span>
        <span class="cat-head-count">${count}</span>
      </h2>
    `);
  }

  function noneInCategory() {
    return node(html`
      <p style="text-align:center;color:var(--c-text-3);padding:32px 16px">
        このカテゴリに未購入の商品はありません
      </p>
    `);
  }

  function itemRow(item, product) {
    const best = store.bestPrice(product);
    const bestStore = best ? store.getStore(best.storeId) : null;
    const tiles = KN.ui.isTiles();

    /* Both ways spring back and land as they go, the same as the price
       screen: right is ★, left is the archive. Tiles swipe too, on a shorter
       throw and with the icons alone — a third of a screen has no room for
       the wording. */
    const wrap = node(html`
      ${/* data-flip は「組み直しの前後で、同じ行かどうか」の目印です
            （ui.js の flipRows）。data-item-id とは役目が別なので、
            まとめずに二つ持たせています——片方を消しても、もう片方の
            意味が変わらないように。 */""}
      <article class="item-wrap ${tiles ? "is-tile-wrap" : ""}"
               data-item-id="${item.id}" data-flip="${item.id}"
               style="--cat:${store.productColor(product)}">
        <div class="swipe-yes">
          ${icon("star")}<span>${item.fav ? "★をはずす" : "今回買う"}</span>
        </div>
        <div class="swipe-arch">
          <span>アーカイブ</span>${icon("download")}
        </div>
      </article>
    `);

    const row = tiles ? node(html`
      <div class="item is-tile ${item.checked ? "is-checked" : ""}">
        <button class="check" role="checkbox" aria-checked="${String(item.checked)}"
                aria-label="${product.name} を購入済みにする">${icon("check")}</button>
        <button class="fav ${item.fav ? "is-on" : ""}" aria-pressed="${String(!!item.fav)}"
                aria-label="${product.name} を今回買うものにする">${icon("star")}</button>
        <button class="item-body">
          <span class="item-emoji" aria-hidden="true">${store.productMark(product)}</span>
          <span class="item-name">${product.name}</span>
          ${item.qty > 1 ? html`<span class="item-qty">×${item.qty}</span>` : ""}
          <span class="tile-price">${best ? yen(best.price * item.qty) : "—"}</span>
        </button>
      </div>
    `) : node(html`
      ${/* 星が左、丸が右。**やることの並びに揃えます**——同じ「済ませる」
            丸が、タブを移ると左右に飛ぶのは、指がいちばん覚えにくいところ
            でした。星は「今回買う」の指定なので、名前の手前で構いません。 */""}
      <div class="item ${item.checked ? "is-checked" : ""}">
        <button class="fav ${item.fav ? "is-on" : ""}" aria-pressed="${String(!!item.fav)}"
                aria-label="${product.name} を今回買うものにする">${icon("star")}</button>
        <span class="item-emoji" aria-hidden="true">${store.productMark(product)}</span>
        <button class="item-body">
          <span class="item-name-row">
            <span class="item-name">${product.name}</span>
            ${item.qty > 1 ? html`<span class="item-qty">×${item.qty}</span>` : ""}
          </span>
          <span class="item-meta">
            ${/* When it was bought, on the rows that have been. An archive
                 of undated lines says only 「いつか買った」, which is not a
                 record of anything — and on a day of several trips the clock
                 time is what separates them. */""}
            ${item.checked && item.checkedAt
              ? html`<span class="item-when">${KN.util.formatStamp(item.checkedAt)}</span>` : ""}
            ${item.memo ? html`<span class="item-memo">${item.memo}</span>` : ""}
          </span>
        </button>
        <div class="item-price"></div>
        <button class="check" role="checkbox" aria-checked="${String(item.checked)}"
                aria-label="${product.name} を購入済みにする">${icon("check")}</button>
      </div>
    `);
    wrap.append(row);

    const priceBox = row.querySelector(".item-price");
    if (priceBox && best && bestStore) {
      priceBox.append(frag(html`
        <span class="item-price-amount">${yen(best.price * item.qty)}</span>
        <span class="item-price-store"><span class="crown" aria-label="いちばん安い">${icon("crown", "is-sub")}</span>${bestStore.name}</span>
      `));
    } else if (priceBox) {
      priceBox.append(node(html`<span class="item-price-none">値段は未登録</span>`));
    }

    row.querySelector(".check").addEventListener("click", (e) => {
      const wasChecked = item.checked;
      const commit = () => store.update((s) => {
        const rec = s.items.find((i) => i.id === item.id);
        if (rec) {
          rec.checked = !rec.checked;
          rec.checkedAt = rec.checked ? KN.util.today() : null;
        }
      });

      // チェックを外すときは、いつもの軽いハプティックですぐ戻します
      // （取り消しは出来事ではないので、見せ場を作りません。todo と同じ約束）。
      if (wasChecked) { KN.motion.fire("save"); commit(); return; }

      /* 買った瞬間は、やることと同じ三段です——光る → 落ちる → 組み直す。
         押したそばから店が変わると、火花は散っているのに行はもう無く、
         何も起きなかったように見えます（screens.css の「済ませたときの動き」）。
         落ちる向きは下。行き先の「買ったもの」がそこにあるので、どこへ
         行ったかを探さずに済みます。 */
      /* やることと同じ返し方にします——線が引かれ、絵の丸がひと回りし、
         行を光が通る。そのあとで下の「買ったもの」へ落ちます。
         同じ「済ませた」が、タブごとに違う返り方をしないように。 */
      if (finishing.has(item.id)) return;      // 二度押しても一度だけ
      finishing.add(item.id);
      KN.motion.fire("check");
      KN.ui.burst(e.currentTarget);
      const mark = row.querySelector(".item-emoji");
      if (mark) KN.ui.burst(mark);

      const nameEl = row.querySelector(".item-name");
      const w = nameEl ? nameEl.getBoundingClientRect().width : 120;
      const SPEED = 620;   // px/秒。時間割と同じ筆の速さ。
      const draw = Math.round(Math.min(620, Math.max(220, (w / SPEED) * 1000)));
      row.style.setProperty("--strike-ms", draw + "ms");
      row.classList.add("is-striking", "is-flash");
      if (mark) mark.classList.add("is-pop");

      setTimeout(() => {
        row.classList.add("is-dropping");
        setTimeout(() => {
          finishing.delete(item.id);
          commit();
          /* 押し間違いは、その場で戻せること。行は「買ったもの」へ落ちて
             視界から消えるので、戻す道が見えていないと、下まで探しに行く
             ことになります。やること側と同じ約束です。 */
          const name = (store.getProduct(item.productId) || {}).name || "";
          KN.ui.toast(name ? `「${name}」を買いました` : "買いました", {
            action: {
              label: "元に戻す",
              onClick: () => store.update((s) => {
                const rec = s.items.find((i) => i.id === item.id);
                if (rec) { rec.checked = false; rec.checkedAt = null; }
              }),
            },
          });
        }, 280);
      }, draw);
    });

    row.querySelector(".fav").addEventListener("click", () => toggleFav(item.id));

    row.querySelector(".item-body").addEventListener("click", () => {
      KN.productSheet.open(product.id, { itemId: item.id });
    });

    KN.ui.swipeActions(wrap, row, {
      tiles,
      onRight: () => toggleFav(item.id),
      onLeft: () => archive(product),
    });
    return wrap;
  }

  /* The same one archive as the price screen's, not a second one: the product
     goes into the drawer at the bottom of 価格, and this row leaves the list —
     which is also what puts out the painted edge over there.

     It is also how a row leaves the list without being bought. There used to
     be a 「削除」 next to it, which only cleared the row and left the product
     sitting in the price list as though nothing had been decided about it;
     saying 「しばらく買わない」 once, in one place, is the honest version. */
  function archive(product) {
    KN.motion.fire("save");
    const undo = store.setArchived(product.id, true);
    KN.ui.toast(`「${product.name}」をアーカイブしました`, {
      action: { label: "元に戻す", onClick: undo },
    });
  }

  /* ---------------- ★ ---------------- */

  /** ★ marks an item as part of the trip being shopped right now. */
  function toggleFav(itemId) {
    store.update((s) => {
      const rec = s.items.find((i) => i.id === itemId);
      if (rec) rec.fav = !rec.fav;
    });
    KN.motion.fire("save");
  }

  /* 「購入済み」 became 「アーカイブ」, the same word the price screen's drawer
     uses. They are the same idea — done with, kept, dated, out of the way of
     what is still to do — and calling one of them something else made them
     look like two different mechanisms. Newest first: an archive is read from
     the most recent end. */
  function checkedSection(checked) {
    const st = store.get();
    const open = st.settings.showChecked !== false;

    const section = node(html`
      <section class="cat-group">
        <button class="done-head" aria-expanded="${String(open)}">
          ${icon("chevron")} アーカイブ <span class="cat-head-count">${checked.length}</span>
        </button>
        <div class="item-list js-done" ${open ? "" : KN.util.raw("hidden")}></div>
      </section>
    `);

    const list = section.querySelector(".js-done");
    const newestFirst = checked.slice().sort((a, b) =>
      String(b.checkedAt || "").localeCompare(String(a.checkedAt || "")));
    newestFirst.forEach((item) => {
      const p = store.getProduct(item.productId);
      if (p) list.append(itemRow(item, p));
    });

    section.querySelector(".done-head").addEventListener("click", () => {
      store.update((s) => { s.settings.showChecked = !open; });
    });

    return section;
  }

  /* Whatever the numbers happen to be worth saying out loud. Renders nothing
     at all when there is nothing to say, which is most of the time early on. */
  function insightsCard(items) {
    const found = KN.insights.forItems(items);
    if (!found.length) return document.createDocumentFragment();

    const card = node(html`
      <section class="insights">
        <h2 class="insights-head">${icon("sparkles")} 気づいたこと</h2>
        <div class="insights-list"></div>
      </section>
    `);
    const listEl = card.querySelector(".insights-list");
    found.forEach((f) => {
      listEl.append(node(html`
        <div class="insight">
          <span class="insight-ico is-${f.tone || "mute"}">${icon(f.icon, "is-sub")}</span>
          <span class="insight-main">
            <span class="insight-title">${f.title}</span>
            <span class="insight-body">${f.body}</span>
          </span>
        </div>
      `));
    });
    return card;
  }

  function emptyState() {
    const wrap = node(html`
      <div class="empty">
        <div class="empty-art">${KN.util.raw(KN.emptyArt.basket)}</div>
        <h2 class="empty-title">買うものを追加しましょう</h2>
        <p class="empty-text">
          下の欄に商品名を入れるだけ。カテゴリは自動で振り分けられ、
          お店ごとの値段を登録すると「どこが一番安いか」が分かります。
        </p>
        <button class="btn btn-soft js-sample" style="margin-top:8px">サンプルを入れて試す</button>
      </div>
    `);
    wrap.querySelector(".js-sample").addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "サンプルを入れますか？",
        message: "3つのお店と7つの商品・価格が入ったサンプルデータを読み込みます。あとから設定画面で全部消せます。",
        okLabel: "入れる",
      });
      if (ok) { store.loadSample(); KN.ui.toast("サンプルを読み込みました"); }
    });
    return wrap;
  }

  /* The ＋ the shell floats over this screen. Adding something is the one
     thing done one-handed in a shop aisle, so it belongs at the bottom, in the
     middle, where a thumb already is.

     It used to be a text field at the top, with the suggestions opening upward
     over the list. That got you a name and nothing else: category and memo had
     to be fixed afterwards in the product sheet. One button and one form is
     fewer steps for anything beyond a bare name, and the same suggestions
     still turn a name into an existing product. */
  function dockButton() {
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="買うものを追加">${icon("plus")}</button>
      </div>
    `);
    fab.querySelector(".js-open-add").addEventListener("click", openAddSheet);
    return fab;
  }

  KN.screens = KN.screens || {};
  KN.screens.list = { mount, render, dockButton };
})();
