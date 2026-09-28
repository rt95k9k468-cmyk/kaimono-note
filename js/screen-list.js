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
        ${/* 上の帯（題・今日へ戻る・さがす・設定）と暦は、この画面の外——全タブで
              一つの帯（js/head.js）に居ます（docs/shared-header.md の段3）。
              前はここに自前の帯があり、題が「shopping」⇄「prices」と入れ替わって
              いました。いまは題も日付で、紙を下げて価格へ移っても変わりません。
              暦は印を描かない一枚（`KN.head.shopCal()`）で、価格と分け合います。 */""}
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

        ${/* カテゴリで絞る札の帯は、2026年9月28日に外しました（利用者：
              「shopping ではタグは要らない。使わないから」）。札があると、
              暦と掴み手のあいだに一段はさまって、ほかのタブと同じ「引くと
              暦が開く」の形になりません。価格の札は残っています。

              紙と掴み手。やること・daily と同じ器です。**掴み手を下へ引くと
              暦が開きます**（ほかのタブと同じ cal-peek）。価格は買うものの
              紙の後ろにいて、そこへは帯の「shopping」を押して行きます
              （紙が下がる。app.js の faceTo）。 */""}
        <div class="tl-sheet js-sheet">
          <span class="tl-grip js-grip" aria-hidden="true"><i></i></span>
          <div class="js-body"></div>
        </div>
      </div>
    `);

    root.append(chrome);

    els = {
      searchBtn:  KN.head.els.searchBtn,
      mine:       () => KN.head.mine("list"),
      screen:     root,
      searchWrap: chrome.querySelector(".js-search-wrap"),
      search:     chrome.querySelector(".js-search"),
      searchClear: chrome.querySelector(".js-search-clear"),
      body:       chrome.querySelector(".js-body"),
    };

    /* 掴み手は二役です。紙が上に居るあいだは暦を開くもの（ほかのタブと
       同じ cal-peek。head.js が暦を持っているので、結ぶのもあちら）、
       紙が価格へ下がって留まっているあいだは買うものへ戻る道（app.js）。 */
    const grip = chrome.querySelector(".js-grip");
    KN.app.wireFaceGrip(grip);
    KN.head.shopPeek({
      sheet: chrome.querySelector(".js-sheet"),
      root,
      // 探している最中だけ引きません（ほかのタブと同じ）。
      enabled: () => !query.trim(),
    });

    /* 紙を横に払うと、日が動きます（ほかのタブと同じ手つき・同じ一つの
       仕掛け js/day-swipe.js）。買うものの紙は日で中身が変わらないので、
       隣の紙は組みません——紙は指に少しついて戻り、動くのは題と暦の日
       だけです（docs/shared-header.md の「決めたこと」の2を、2026年9月28日に
       利用者と改めた）。掴み手は暦を引くものなので、そこから始まった指は
       取りません。行の上からも払えます——行ごとの払い（右で★・左で
       アーカイブ）は、日を払うのと取り合うので外しました（同じ日、利用者）。 */
    const sheet = chrome.querySelector(".js-sheet");
    KN.daySwipe.wire({
      viewport: sheet,
      surface: sheet,
      track: els.body,
      ignore: ".tl-grip",
      day: () => KN.head.shopDay(),
      step: (d, dir) => KN.util.shiftDay(d, dir),
      commit: (key) => KN.head.shopGo(key),
      busy: () => !KN.head.mine("list") || KN.reorder.isActive(),
    });

    /* 歯車は帯（head.js）が結びます。虫めがねは共通の一つで、応えるのは
       持ち主のときだけ（`els.mine`）。境目の線（is-stuck）は、ほかのタブと
       同じく出しません——帯は送られないので「貼りついた」がありません。 */
    KN.ui.wireSearch(els, () => render(), (q) => { query = q; });
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
          <button type="button" class="dest-chip js-dest" hidden></button>
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
      /* 分けて入れるときは、押す前にボタンがそう言います（R1）。 */
      const n = pieces().length;
      addBtn.textContent = n >= 2 ? `${n}つに分けて追加` : "リストに追加";
      renderSuggestions(nameEl, acHost, typed, choose);
      paintDest();
    }

    /* 行き先の札（R4）。「明日 19:00 歯医者」は、やることらしい——押せばそちらへ。
       押さなければ今までどおり買うものに入る。 */
    const paintDest = KN.capture
      ? KN.capture.bindChip(body.querySelector(".js-dest"), {
        from: "list",
        text: () => (picked ? "" : nameEl.value),
        go: (g) => {
          const rec = KN.capture.toTodo(nameEl.value.trim(), g.when);
          handle.close();
          if (!rec) return;
          const W = KN.whenParse;
          const w = g.when && W ? W.describe(g.when) : "";
          KN.motion.fire("save");
          KN.ui.toast(`やることに「${rec.title}」を入れました${w ? `（${w}）` : ""}`, {
            action: { label: "戻す", onClick: () => store.removeTodo(rec.id) },
          });
        },
      })
      : () => {};

    /* 「牛乳、卵、パン」は三つ（docs/roadmap.md の R1）。候補から選んだ品物は、
       名前に読点があっても一つ。登録済みの名前に入っている読点でも分けない。 */
    function pieces() {
      if (picked) return [picked.name];
      const S = KN.splitItems;
      const typed = nameEl.value.trim();
      if (!S || !typed) return typed ? [typed] : [];
      return S.shop(typed, store.get().products.map((p) => p.name));
    }

    /* 一行の欄は改行を持てないので、貼りつけた改行は読点にして見せます
       ——黙って消すと「牛乳卵パン」という一つの名前になります。 */
    nameEl.addEventListener("paste", (e) => {
      const txt = e.clipboardData && e.clipboardData.getData("text");
      if (!txt || !/[\r\n]/.test(txt.trim())) return;
      e.preventDefault();
      const flat = txt.trim().split(/\s*(?:\r?\n|\r)+\s*/).filter(Boolean).join("、");
      const a = nameEl.selectionStart ?? nameEl.value.length;
      const b = nameEl.selectionEnd ?? a;
      nameEl.setRangeText(flat, a, b, "end");
      onName();
    });

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
      paintDest();
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

      const many = pieces();
      if (many.length >= 2) { submitMany(name, many); return; }

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
        // 絵文字は出しません（最優先の約束事）。棚の名前だけで足ります。
        KN.ui.toast(`${c.name} に「${product.name}」を追加しました`);
      }
      KN.motion.fire("save");
      /* Closed, not cleared. Staying open was meant to save a tap on a long
         list written in one sitting, but it left the sheet covering the very
         list it had just changed — so every add ended with a look at a form
         instead of at the line that appeared. One add, one close, and the ＋
         is right there under the thumb for the next one. */
      handle.close();
    }

    /* 分けて入れる（R1）。棚は一つずつ推し直します——「牛乳、洗剤」を同じ棚に
       入れる理由はないので。手で選んだ棚だけは、新しく作る品物みんなへ。
       ★とメモは、打った人が一度に言ったことなので、どの行にも付けます
       （消すより、余ったものを直すほうが安い）。 */
    function submitMany(whole, names) {
      const memo = memoEl.value.trim();
      const made = [];      // この一押しで作った品物（ひとつにするとき片づける）
      const added = [];     // この一押しで足した行
      let dup = 0;
      names.forEach((name) => {
        let product = store.findProductByName(name);
        if (!product) {
          product = store.addProduct({ name,
            categoryId: catTouched ? cat.current : store.guessCategory(name) });
          if (!product) return;
          made.push(product.id);
        }
        if (store.get().items.some((i) => i.productId === product.id && !i.checked)) { dup++; return; }
        const rec = store.addItem(product.id, { memo });
        if (fav) store.update((s) => {
          const it = s.items.find((i) => i.id === rec.id);
          if (it) it.fav = true;
        });
        added.push(rec.id);
      });
      KN.motion.fire("save");
      handle.close();

      if (!added.length) {
        KN.ui.toast("どれも、もうリストにあります");
        return;
      }
      KN.ui.toast(`${added.length}つに分けて入れました${dup ? `（${dup}つはもうリストに）` : ""}`, {
        action: { label: "ひとつにする", onClick: () => joinBack(whole, added, made, memo) },
      });
    }

    /* 「ひとつにする」：分けて足した行と、そのとき作った品物を片づけて、打った
       とおりの一つの名前で入れ直します。作った品物は、そのあと値段が付いて
       いたら残します（もう別の用で使われているので）。 */
    function joinBack(whole, added, made, memo) {
      const drop = new Set(added);
      store.update((s) => {
        s.items = s.items.filter((i) => !drop.has(i.id));
        const used = new Set(s.items.map((i) => i.productId));
        s.products = s.products.filter((p) =>
          !made.includes(p.id) || used.has(p.id) || (p.prices && p.prices.length));
      });
      const product = store.findProductByName(whole)
        || store.addProduct({ name: whole,
          categoryId: catTouched ? cat.current : store.guessCategory(whole) });
      if (!product) return;
      if (store.get().items.some((i) => i.productId === product.id && !i.checked)) return;
      const rec = store.addItem(product.id, { memo });
      if (fav) store.update((s) => {
        const it = s.items.find((i) => i.id === rec.id);
        if (it) it.fav = true;
      });
      KN.ui.toast(`「${product.name}」ひとつにしました`);
    }

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
    const items = store.get().items;

    /* 暦は帯（全タブで一つ）に置きます。印の無い一枚で、価格と分け合う
       ——紙を下げて価格へ移っても、暦は差し替わりません（head.js）。
       題に「いま見ている日」を塗るのも、あちらが持ちます。 */
    KN.head.putCal("list", KN.head.shopCal());

    /* Searching narrows the rows, not the header: the counts above still
       describe the whole trip, because a search is a way of looking at the
       list rather than a change to it. */
    renderBody(query ? items.filter(matchesQuery) : items);
    awake.recheck();
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

  function renderBody(items) {
    /* 組み直す前に、いまどの行がどこに居るかを測ります。組み終わってから
       settle() を呼ぶと、動いた行が「もといた場所」から滑ってきます
       （ui.js の flipRows）。丸ごと入れ替わるとき（検索）
       は、向こうが自分で見送ります。 */
    const settle = KN.ui.flipRows(els.body, ".item-wrap");
    els.body.innerHTML = "";

    /* 暦で今日でない日に合わせていたら、紙は**その日に買ったもの**だけ
       （2026年9月28日夜、利用者：「その下に、まだ買ってないものやリストを
       送るやアーカイブがあるのがおかしい。要らないでしょ」）。何も買って
       いない日は「◯月◯日に買ったもの 0」だけ。探しているあいだは、日に
       関係なくリストを探します（探した結果によその日を混ぜないので）。 */
    const day = KN.head.shopDay();
    if (!query && day && day !== KN.util.todayKey()) {
      els.body.append(dayBought(items.filter((i) => i.checked), day));
      settle();
      return;
    }

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
      if (shown && !query) els.body.append(shareRow([{ title: "買うもの", list: active }]));
      els.body.append(lowSection());
      if (!query) els.body.append(dayBought(checked, KN.util.todayKey()));
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
    appendGroups(trip, inner);
    box.append(inner);
    box.append(tripPlanRow());
    els.body.append(box);
    els.body.append(insightsCard(trip));

    if (rest.length) {
      els.body.append(sectionHead("そのほか", rest.length, "rest"));
      appendGroups(rest);
    }
    if (!query) {
      els.body.append(shareRow([{ title: "今回買うもの", list: trip }, { title: "そのほか", list: rest }]));
    }

    els.body.append(lowSection());
    if (!query) els.body.append(dayBought(checked, KN.util.todayKey()));
    settle();
  }

  /* ---------------- リストを、文字にして送る ----------------

     LINE などへ渡すための一行（docs/improvements.md の D4）。送るのは
     **いま画面に出ている買うもの**そのまま——★があれば「今回買うもの」と
     「そのほか」に分けて、並びも画面と同じ。買ったもの（アーカイブ）は入れません。探しているあいだは出しません
     （探した結果はリストではなく、リストの見方なので）。

     渡し方は共有シート。無い端末ではクリップボードへ写します。共有シートを
     閉じただけ（AbortError）なら、何も言いません——取り消しは取り消しなので。 */
  function shareRow(parts) {
    const text = listText(parts);
    if (!text) return document.createDocumentFragment();
    const row = node(html`
      <div class="list-share">
        <button type="button" class="trip-plan-btn js-share">
          ${icon("upload")}<span>このリストを送る</span>
        </button>
      </div>
    `);
    row.querySelector(".js-share").addEventListener("click", () => sendList(listText(parts)));
    return row;
  }

  function listText(parts) {
    const blocks = parts.map(({ title, list }) => {
      const lines = [];
      const groups = groupsOf(list);
      store.sortedCategories().forEach((c) => {
        (groups.get(c.id) || []).forEach(({ item, product }) => {
          lines.push(`・${product.name}${item.qty > 1 ? ` ×${item.qty}` : ""}`
            + `${item.memo ? `（${String(item.memo).replace(/\s+/g, " ").trim()}）` : ""}`);
        });
      });
      return lines.length ? `${title}\n${lines.join("\n")}` : "";
    }).filter(Boolean);
    return blocks.join("\n\n");
  }

  function sendList(text) {
    const copy = () => (navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text).then(() => true, () => false)
      : Promise.resolve(false)
    ).then((ok) => {
      if (ok) KN.motion.fire("select");
      KN.ui.toast(ok ? "リストをコピーしました" : "送れませんでした");
    });
    if (!navigator.share) { copy(); return; }
    navigator.share({ text }).catch((err) => {
      if (err && err.name === "AbortError") return;
      copy();
    });
  }

  /* ---------------- そろそろ切れそう（D6） ----------------

     いつもの間隔で、そろそろ買うころのもの（js/insights.js の runningLow）。
     置き場所は買うものの終わり、アーカイブの手前——数えている相手が
     アーカイブの「買った」なので、その上に。押せば買うものへ入って、
     ここからは消えます（入ったものは数えない）。

     「要らない」を押す欄は置きません。覚えておく入れ物が要るので。
     かわりに、いつもの 2.5 倍を過ぎたら黙ります（insights.js）。
     探しているあいだは出しません——探した結果は「リストの見方」で、
     そこに外のものを混ぜると見方が崩れるので。 */
  function lowSection() {
    if (query) return document.createDocumentFragment();
    const low = KN.insights.runningLow();
    if (!low.length) return document.createDocumentFragment();
    const section = node(html`
      <section class="low" aria-label="そろそろ切れそう">
        <h2 class="trip-head trip-head-rest">${icon("clock")}<span>そろそろ切れそう</span></h2>
        <div class="low-list"></div>
      </section>
    `);
    const listEl = section.querySelector(".low-list");
    low.forEach(({ product, every, since }) => {
      const cat = store.getCategory(product.categoryId);
      const row = node(html`
        <div class="low-row" style="--cat:${(cat && cat.color) || ""}">
          <span class="low-mark" aria-hidden="true">${store.productMark(product)}</span>
          <span class="low-main">
            <span class="low-name">${product.name}</span>
            <span class="low-meta">だいたい${every}日ごと・前は${since}日前</span>
          </span>
          <button type="button" class="low-add" aria-label="${product.name} を買うものに入れる">
            ${icon("plus")}<span>入れる</span>
          </button>
        </div>
      `);
      row.querySelector(".low-add").addEventListener("click", (e) => {
        KN.motion.fire("add", e.currentTarget);
        const rec = store.addItem(product.id);
        KN.ui.toast(`「${product.name}」を買うものに入れました`, {
          action: {
            label: "元に戻す",
            onClick: () => store.update((s) => { s.items = s.items.filter((i) => i.id !== rec.id); }),
          },
        });
      });
      listEl.append(row);
    });
    return section;
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
  /** 画面に出る組：カテゴリごと。並べるのは
      `store.sortedCategories()` の順（appendGroups と、送る文の両方が使う）。 */
  function groupsOf(list) {
    const groups = new Map();
    list.forEach((item) => {
      const p = store.getProduct(item.productId);
      if (!p) return;
      if (!groups.has(p.categoryId)) groups.set(p.categoryId, []);
      groups.get(p.categoryId).push({ item, product: p });
    });
    return groups;
  }

  function appendGroups(list, host) {
    const into = host || els.body;
    const groups = groupsOf(list);

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
        <section class="cat-group is-run" style="--cat:${cat.color || ""}">
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

  function itemRow(item, product) {
    const best = store.bestPrice(product);
    const bestStore = best ? store.getStore(best.storeId) : null;
    const tiles = KN.ui.isTiles();

    /* 行を横に払う手つき（右で★・左でアーカイブ）は、2026年9月28日に
       外しました。紙を横に払うと日が動くようになり、行の上で指が二つの
       意味を取り合うので（利用者：「左右フリックで日付を変えたいので」）。
       ★は行の★を押す。アーカイブは価格の画面で（そちらの払いは残す）。 */
    const wrap = node(html`
      ${/* data-flip は「組み直しの前後で、同じ行かどうか」の目印です
            （ui.js の flipRows）。data-item-id とは役目が別なので、
            まとめずに二つ持たせています——片方を消しても、もう片方の
            意味が変わらないように。 */""}
      <article class="item-wrap ${tiles ? "is-tile-wrap" : ""}"
               data-item-id="${item.id}" data-flip="${item.id}"
               style="--cat:${store.productColor(product)}">
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
        ${/* タイルではなく一覧のときだけ、丸そのものが押せます——一覧では
              丸が題の連れ（.item-body の外）に居るので、独立した的が
              作れます。タイルは丸も題も一つのボタンの中なので、これまで
              どおり押せば紙が開きます（丸だけを的にする余地が無いため）。 */""}
        <button type="button" class="item-emoji js-emoji"
                aria-label="${product.name} の絵を選ぶ">${store.productMark(product)}</button>
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

    // 一覧だけ：丸そのものを押すと、品目の紙を経由せずアイコン選びへ直行します。
    const emojiBtn = row.querySelector(".js-emoji");
    if (emojiBtn) emojiBtn.addEventListener("click", () => {
      KN.productSheet.openIconPicker(product.id, () => {});
    });

    return wrap;
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

  /* ---------------- その日に買ったもの（2026年9月28日） ----------------

     暦で合わせた日に買ったもの（利用者：「shopping で買った日に日付を合わせ
     たら、その日に買ったものが出るように。過去と分かるように薄字かな」）。

     - 数えるのは暦の丸と同じ相手——買った印（`checkedAt` をローカルの日で）。
       **写さず引く**：記録の入れ物は増やしません。
     - 行は買ったものの姿（`itemRow` の is-checked：線が引かれて薄い）。丸を
       押せば買うものへ戻せます。
     - **今日でない日は、紙はこれだけ**（同じ日の夜、利用者：「まだ買ってない
       ものやリストを送るやアーカイブがあるのがおかしい」）。何も買っていない
       日も「◯月◯日に買ったもの 0」を出します（「それ以外は何も要らない」）。
     - **アーカイブの段は外しました**（同じ夜、「アーカイブ自体要らなくない？」）。
       前の日に買ったものは、暦でその日へ行けば見えます。今日買ったものは、
       リストの終わりに「今日買ったもの」として出ます（0 なら出さない——
       今日の紙の主役はリストのほう）。買った印（checked / checkedAt）は
       一つも消していません。描かないだけです。 */
  function dayBought(checked, day) {
    const isToday = day === KN.util.todayKey();
    const bought = checked
      .filter((i) => i.checkedAt && KN.util.dayKey(new Date(i.checkedAt)) === day)
      .sort((a, b) => String(a.checkedAt).localeCompare(String(b.checkedAt)));
    if (isToday && !bought.length) return document.createDocumentFragment();

    const d = KN.util.dayDate(day);
    const label = isToday ? "今日買ったもの"
      : d ? `${d.getMonth() + 1}月${d.getDate()}日に買ったもの` : "この日に買ったもの";
    const section = node(html`
      <section class="day-bought" aria-label="${label}">
        <h2 class="day-bought-head">${label} <span class="cat-head-count">${bought.length}</span></h2>
        <div class="item-list"></div>
      </section>
    `);
    const list = section.querySelector(".item-list");
    /* 買ったものの行に★は要りません（今回買うかどうかは、もう済んだ話）。
       丸も要らない——ただし今日の行だけは残します。押しまちがえたとき、
       その場で買うものへ戻せるように（同じ夜、利用者）。
       **消さずに、場所だけ残します**（`.is-void`：見えない・押せない・
       読み上げない）。抜くと絵と名前が左へ、値段が右の端へ寄って、リストの
       行とも、日を払った隣の日とも列がずれた（利用者：「わざわざ両端に寄せる
       必要はない」、同じ夜・五度目）。 */
    bought.forEach((item) => {
      const p = store.getProduct(item.productId);
      if (!p) return;
      const row = itemRow(item, p);
      row.querySelectorAll(isToday ? ".fav" : ".fav, .check").forEach((b) => {
        b.classList.add("is-void");
        b.tabIndex = -1;
      });
      list.append(row);
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

  /* ---------------- 買い物中は、画面を消さない ----------------

     買うものの画面が出ていて、まだ買うものが残っているあいだは、画面を
     暗くしません（Screen Wake Lock。docs/improvements.md の D5）。カゴを
     持った手で、消えた画面をもう一度起こすのは手間なので。設定は置きません
     ——効くのはこの画面を見ているあいだだけで、放っておけば消えるので。

     - **最後に触ってから5分で手放します。** 机に置いたままの画面を、電池が
       尽きるまで点けておかないために。触れば、また持ちます。
     - 持つのは触ったとき・画面に入ったとき・戻ってきたとき。組み直し
       （買った・消した）では**延ばさず**、要らなくなっていたら手放すだけ
       ——延ばすのは人の手だけにしないと、5分が数えられません。
     - 隠れるとブラウザが自分で手放すので、戻ってきたら持ち直します。
     - 使えない端末では何もしません（iOS のホーム画面アプリで効くのは
       18.4 からとされます。実機では未確認）。 */
  const awake = (() => {
    const IDLE_MS = 5 * 60 * 1000;
    let lock = null, asking = false, idleT = 0, pend = 0;
    const wanted = () => document.visibilityState === "visible"
      && ["list", "prices"].indexOf(KN.app.activeScreen && KN.app.activeScreen()) >= 0
      && store.get().items.some((i) => !i.checked);
    function release() {
      clearTimeout(idleT);
      const l = lock;
      lock = null;
      if (l) l.release().catch(() => {});
    }
    function hold() {
      if (!wanted()) { release(); return; }
      clearTimeout(idleT);
      idleT = setTimeout(release, IDLE_MS);
      if (lock || asking || !navigator.wakeLock) return;
      asking = true;
      navigator.wakeLock.request("screen").then((l) => {
        asking = false;
        if (!wanted()) { l.release().catch(() => {}); return; }
        lock = l;
        l.addEventListener("release", () => { if (lock === l) lock = null; });
      }, () => { asking = false; });
    }
    /** 人の手（触った・入った・戻った）。一拍おくのは、タブを押した手なら
        画面が切り替わってから確かめるため。 */
    function touched() {
      if (!pend) pend = setTimeout(() => { pend = 0; hold(); }, 0);
    }
    /** 組み直し。要らなくなっていたら手放すだけ。 */
    function recheck() { if (lock && !wanted()) release(); }
    return { touched, recheck };
  })();
  ["pointerup", "click", "keydown"].forEach((t) => document.addEventListener(t, awake.touched, true));
  document.addEventListener("visibilitychange", awake.touched);

  KN.screens = KN.screens || {};
  /* `day()` は共通の日を答えます（席を移るとき、app.js の show() が置いて
     いく——買うものの暦で押した日を、ほかのタブへ持っていくため）。 */
  /* 暦で日が動いた（head.js の dayMoved）。組み直すのは紙の中身だけ——
     `render()` だと暦まで組み直して、いま動いている輪が跳ぶので。 */
  function dayMoved() {
    if (!root) return;
    const items = store.get().items;
    renderBody(query ? items.filter(matchesQuery) : items);
  }

  KN.screens.list = { mount, render, dockButton, dayMoved, onEnter: awake.touched, day: () => KN.head.shopDay() };
})();
