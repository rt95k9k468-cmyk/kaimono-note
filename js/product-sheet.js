/* =========================================================
   かいものノート — shared product / item detail sheet
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, yen, perItemPrice, isCounted, formatSize, relativeDate, formatDate, UNITS, debounce, haptic } = KN.util;
  const store = KN.store;

  /**
   * Open the detail sheet for a product.
   * @param {string} productId
   * @param {object} [opts]
   * @param {string} [opts.itemId] when opened from the shopping list, shows qty/memo controls
   */
  function open(productId, { itemId } = {}) {
    const product = store.getProduct(productId);
    if (!product) return;

    const body = node(html`<div class="stack" style="gap:20px"></div>`);

    const pricesWrap = node(html`<div class="stack" style="gap:12px"></div>`);
    const rerenderPrices = () => renderPrices(pricesWrap, productId);

    const category = categoryField(productId);
    const mark = iconField(productId, () => {
      // The picture is on the sheet's own title too; keep the two agreeing.
      const head = sheetHandle && sheetHandle.el.querySelector(".sheet-mark");
      if (head) head.innerHTML = store.productMark(store.getProduct(productId));
    });
    body.append(nameField(productId, category.recheck, mark.recheck));
    if (itemId) body.append(itemSection(itemId));
    body.append(mark.el);
    body.append(category.el);
    body.append(sizeField(productId, rerenderPrices));
    body.append(pricesWrap);
    rerenderPrices();

    body.append(historySection(productId));
    body.append(dangerSection(productId, () => sheetHandle.close()));

    const foot = node(html`<button class="btn btn-primary btn-block">完了</button>`);

    const sheetHandle = KN.ui.sheet({
      title: product.name,
      titleMark: store.productMark(product),
      content: body,
      footer: foot,
    });

    foot.addEventListener("click", () => sheetHandle.close());
    return sheetHandle;
  }

  /* ---------------- fields ---------------- */

  function nameField(productId, onRecategorised, onRenamed) {
    const p = store.getProduct(productId);
    const wrap = node(html`
      <label class="field">
        <span class="field-label">商品名</span>
        <input class="input js-name" value="${p.name}" placeholder="商品名">
      </label>
    `);
    const input = wrap.querySelector(".js-name");

    const save = debounce(() => {
      const v = input.value.trim();
      if (!v) return;

      /* A rename is very often a correction. 「コンソメ」 came out as その他,
         so it gets renamed 「コンソメ(調味料)」 — and the new name now says
         plainly where it goes. Re-reading it costs nothing and saves a second
         trip to the picker.

         Two limits. A category picked by hand is never overruled: that was a
         decision, and this is a guess. And a guess that lands on その他 is
         thrown away rather than applied — a name we cannot place must not
         demote a category that is already right. */
      let moved = null;
      store.update((s) => {
        const rec = s.products.find((x) => x.id === productId);
        if (!rec) return;
        rec.name = v;
        if (rec.catManual) return;
        const guess = store.guessCategory(v);
        if (guess !== store.OTHER_CATEGORY && guess !== rec.categoryId) {
          rec.categoryId = guess;
          moved = guess;
        }
      });

      // The picture follows the name too, whether or not the category moved.
      onRenamed && onRenamed();

      if (moved) {
        onRecategorised && onRecategorised();
        KN.ui.toast(`「${store.getCategory(moved).name}」に移しました`);
        haptic();
      }
    }, 350);

    input.addEventListener("input", save);
    return wrap;
  }

  /* ---------------- the picture ---------------- */

  /* The guess reads the name and is usually right. Where it is wrong it is
     wrong in a way only the person who buys the thing can see — 「コンソメ」
     is a box to the app and a stock cube in the cupboard — so the picture can
     be set by hand, and once set nothing overrules it. */
  function iconField(productId, onChanged) {
    const wrap = node(html`
      <div class="field">
        <span class="field-label">アイコン</span>
        <button type="button" class="icon-pick js-pick">
          <span class="icon-pick-mark js-mark"></span>
          <span class="icon-pick-text">
            <span class="icon-pick-name js-lbl"></span>
            <span class="icon-pick-sub js-sub"></span>
          </span>
          <span class="price-chevron">${icon("chevron")}</span>
        </button>
      </div>
    `);

    function paint() {
      const p = store.getProduct(productId);
      if (!p) return;
      const own = KN.productIcons.byKey(p.icon);
      wrap.querySelector(".js-mark").innerHTML = store.productMark(p);
      wrap.querySelector(".js-lbl").textContent =
        own ? (KN.productIcons.LABELS[p.icon] || p.icon) : "おまかせ";
      wrap.querySelector(".js-sub").textContent =
        own ? "自分で選んだ絵です" : "名前とカテゴリから選んでいます";
    }
    paint();

    wrap.querySelector(".js-pick").addEventListener("click", () => {
      openIconPicker(productId, () => { paint(); onChanged && onChanged(); });
    });

    return { el: wrap, recheck: paint };
  }

  /* 「もしかして」 first, then everything. The guess already had its go at the
     name; what is useful here is the *near* misses — the pictures the name
     brushes against without landing on, which is where the right one usually
     is. Below that the whole set, because sometimes the right picture has
     nothing to do with the name at all. */
  function openIconPicker(productId, onChanged) {
    const body = node(html`
      <div class="stack" style="gap:14px">
        <input class="input js-q" placeholder="絵をさがす（例：洗剤）"
               autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="絵をさがす">
        <div class="stack js-grids" style="gap:14px"></div>
      </div>
    `);
    const grids = body.querySelector(".js-grids");
    const q = body.querySelector(".js-q");

    const handle = KN.ui.sheet({ title: "アイコンを選ぶ", content: body });

    function choose(key) {
      store.update((s) => {
        const rec = s.products.find((x) => x.id === productId);
        if (rec) rec.icon = key || null;
      });
      haptic(12);
      onChanged && onChanged();
      handle.close();
    }

    function grid(items) {
      const current = store.getProduct(productId).icon || "";
      const g = node(html`<div class="icon-grid"></div>`);
      items.forEach(({ key, label, svg }) => {
        const cell = node(html`
          <button type="button" class="icon-cell ${key === current ? "is-on" : ""}"
                  data-key="${key}" aria-pressed="${String(key === current)}">
            <span class="icon-cell-mark">${KN.util.raw(svg)}</span>
            <span class="icon-cell-label">${label}</span>
          </button>
        `);
        cell.addEventListener("click", () => choose(key));
        g.append(cell);
      });
      return g;
    }

    const heading = (text) => node(html`<span class="field-label">${text}</span>`);

    function paint() {
      const rec = store.getProduct(productId);
      if (!rec) return;
      grids.innerHTML = "";
      const query = q.value.trim();

      if (query) {
        const hits = KN.productIcons.search(query);
        if (!hits.length) {
          grids.append(node(html`
            <p style="color:var(--c-text-3);font-size:13px;padding:8px 0">
              「${query}」に合う絵はありません
            </p>
          `));
          return;
        }
        grids.append(grid(hits));
        return;
      }

      /* Back to the guess. Shown with the picture it would land on, so it is
         a choice between two pictures rather than a choice with the lights
         off. */
      const auto = node(html`
        <button type="button" class="icon-auto js-auto ${rec.icon ? "" : "is-on"}"
                aria-pressed="${String(!rec.icon)}">
          <span class="icon-pick-mark">${store.autoMark(rec)}</span>
          <span class="icon-pick-text">
            <span class="icon-pick-name">おまかせにする</span>
            <span class="icon-pick-sub">名前とカテゴリから選びます</span>
          </span>
        </button>
      `);
      auto.addEventListener("click", () => choose(null));
      grids.append(auto);

      const maybe = KN.productIcons.suggest(rec.name, 8);
      if (maybe.length) {
        grids.append(heading("もしかして"));
        grids.append(grid(KN.productIcons.list().filter((x) => maybe.includes(x.key))
          .sort((a, b) => maybe.indexOf(a.key) - maybe.indexOf(b.key))));
      }

      grids.append(heading("ぜんぶ"));
      grids.append(grid(KN.productIcons.list()));
    }

    q.addEventListener("input", debounce(paint, 160));
    paint();
    return handle;
  }

  function itemSection(itemId) {
    const item = store.get().items.find((i) => i.id === itemId);
    if (!item) return document.createDocumentFragment();

    const wrap = node(html`
      <div class="stack" style="gap:12px">
        <div class="field">
          <span class="field-label">数量</span>
          <div style="display:flex;align-items:center;gap:12px">
            <button class="icon-btn js-minus" aria-label="減らす" style="background:var(--c-surface-2)">${icon("minus")}</button>
            <span class="js-qty mono-num" style="font-size:22px;font-weight:800;min-width:44px;text-align:center">${item.qty}</span>
            <button class="icon-btn js-plus" aria-label="増やす" style="background:var(--c-surface-2)">${icon("plus")}</button>
            <button class="btn btn-soft btn-sm js-remove" style="margin-left:auto">リストから外す</button>
          </div>
        </div>
        <label class="field">
          <span class="field-label">メモ</span>
          <input class="input js-memo" value="${item.memo || ""}" placeholder="例：詰め替え用・特売のとき">
        </label>
      </div>
    `);

    const qtyEl = wrap.querySelector(".js-qty");
    function setQty(delta) {
      store.update((s) => {
        const rec = s.items.find((i) => i.id === itemId);
        if (rec) rec.qty = Math.max(1, rec.qty + delta);
      });
      const rec = store.get().items.find((i) => i.id === itemId);
      qtyEl.textContent = rec ? rec.qty : 1;
      haptic();
    }
    wrap.querySelector(".js-minus").addEventListener("click", () => setQty(-1));
    wrap.querySelector(".js-plus").addEventListener("click", () => setQty(1));

    const memo = wrap.querySelector(".js-memo");
    memo.addEventListener("input", debounce(() => {
      store.update((s) => {
        const rec = s.items.find((i) => i.id === itemId);
        if (rec) rec.memo = memo.value;
      });
    }, 350));

    wrap.querySelector(".js-remove").addEventListener("click", () => {
      const snapshot = store.get().items.find((i) => i.id === itemId);
      store.update((s) => { s.items = s.items.filter((i) => i.id !== itemId); });
      KN.ui.toast("リストから外しました", {
        action: {
          label: "元に戻す",
          onClick: () => store.update((s) => { s.items.unshift(snapshot); }),
        },
      });
      const sheetEl = wrap.closest(".sheet");
      if (sheetEl) sheetEl.querySelector(".js-close").click();
    });

    return wrap;
  }

  function categoryField(productId) {
    const p = store.getProduct(productId);
    const wrap = node(html`
      <div class="field">
        <span class="field-label">カテゴリ</span>
        <div class="js-picker"></div>
      </div>
    `);

    const picker = KN.ui.categoryPicker(wrap.querySelector(".js-picker"), {
      selectedId: p.categoryId,
      onSelect: (categoryId) => {
        store.update((s) => {
          const rec = s.products.find((x) => x.id === productId);
          if (!rec) return;
          rec.categoryId = categoryId;
          // Chosen by hand. Nothing guessed from the name may move it again.
          rec.catManual = true;
        });

        /* And remember it. Being told 「コンソメ is 調味料」 once should be
           enough — the next 「コンソメ」 typed into the list goes straight
           there, and so does 「味の素 コンソメ」. Shown in 設定 so it is not a
           machine quietly making decisions nobody can see or undo. */
        const rec = store.getProduct(productId);
        const known = store.learnedList().some((l) => l.key === KN.util.foldKana(rec.name) && l.categoryId === categoryId);
        store.learnCategory(rec.name, categoryId);
        if (!known) {
          KN.ui.toast(`「${rec.name}」は${store.getCategory(categoryId).name}、と覚えました`);
        }
      },
    });

    // Called after a rename moved the category out from under the picker.
    const recheck = () => picker.set(store.getProduct(productId).categoryId);
    return { el: wrap, recheck };
  }

  function sizeField(productId, onChanged) {
    const p = store.getProduct(productId);
    const wrap = node(html`
      <div class="field">
        <span class="field-label">内容量・入数</span>
        <div class="input-group">
          <input class="input js-amount" style="flex:1" type="text" inputmode="none"
                 autocomplete="off" autocorrect="off" spellcheck="false"
                 value="${p.amount != null ? p.amount : ""}" placeholder="500">
          <select class="select js-unit" style="flex:0 0 110px">
            <option value="">単位なし</option>
            ${UNITS.map((u) => html`<option value="${u}" ${p.unit === u ? KN.util.raw("selected") : ""}>${u}</option>`)}
          </select>
        </div>
        <span class="field-hint js-size-hint"></span>
      </div>
    `);

    const amountEl = wrap.querySelector(".js-amount");
    const unitEl = wrap.querySelector(".js-unit");
    const hintEl = wrap.querySelector(".js-size-hint");

    /* 「10個」なら 1個あたりに割る。「500ml」は割らない — そう書いてあると
       見分けがつくというだけで、値段は 1本ぶんの値段のまま。 */
    function paintHint() {
      hintEl.textContent = isCounted(unitEl.value)
        ? `この数で割って、1${unitEl.value}あたりの値段も出します`
        : "値段は 1つぶんとして比べます。ここは目印として書いておくだけです";
    }

    function save() {
      const amount = KN.util.calc(amountEl.value);
      store.update((s) => {
        const rec = s.products.find((x) => x.id === productId);
        if (!rec) return;
        rec.amount = isFinite(amount) && amount > 0 ? amount : null;
        rec.unit = unitEl.value;
      });
      paintHint();
      onChanged && onChanged();
    }

    KN.keypad.bind(amountEl);
    amountEl.addEventListener("input", debounce(save, 400));
    unitEl.addEventListener("change", save);
    paintHint();
    return wrap;
  }

  /* ---------------- prices ---------------- */

  function renderPrices(container, productId) {
    container.innerHTML = "";
    container.classList.add("js-prices-host");

    const p = store.getProduct(productId);
    const prices = store.currentPrices(p);
    const best = prices[0] || null;

    const section = node(html`
      <div class="stack js-prices" style="gap:10px">
        <span class="field-label">お店ごとの値段</span>
      </div>
    `);

    if (!prices.length) {
      section.append(node(html`
        <p style="color:var(--c-text-3);font-size:13px;line-height:1.6">
          まだ登録がありません。下のフォームからお店と値段を追加すると、いちばん安いお店が分かります。
        </p>
      `));
    } else {
      const list = node(html`<div class="price-list"></div>`);
      prices.forEach((pr) => {
        const st = store.getStore(pr.storeId);
        const up = perItemPrice(pr.price, p.amount, p.unit);
        const isBest = best && pr.id === best.id && prices.length > 1;

        const row = node(html`
          <div class="price-row ${isBest ? "is-best" : ""}">
            <button class="price-main js-open" aria-label="${st.name} の値段をくわしく見る">
              <span class="dot" style="background:${st.color}"></span>
              <span class="price-store-wrap">
                <span class="price-store">${st.name}</span>
                ${isBest ? html`<span class="crown">🏆</span>` : ""}
              </span>
              <span class="price-figures">
                <span class="price-amount">${yen(pr.price)}</span>
                ${up ? html`<span class="price-unit">${up.text}</span>` : ""}
                <span class="price-date">${relativeDate(pr.date)}</span>
              </span>
              <span class="price-chevron">${icon("chevron")}</span>
            </button>
            <button class="icon-btn is-danger js-del" aria-label="この価格を削除">${icon("trash")}</button>
          </div>
        `);

        row.querySelector(".js-open").addEventListener("click", () => {
          openPriceDetail(productId, pr.id, () => renderPrices(container, productId));
        });

        row.querySelector(".js-del").addEventListener("click", () => {
          store.update((s) => {
            const rec = s.products.find((x) => x.id === productId);
            if (rec) rec.prices = rec.prices.filter((x) => x.id !== pr.id);
          });
          renderPrices(container, productId);
          KN.ui.toast("価格を削除しました", {
            action: {
              label: "元に戻す",
              onClick: () => {
                store.update((s) => {
                  const rec = s.products.find((x) => x.id === productId);
                  if (rec) rec.prices.push(pr);
                });
                renderPrices(container, productId);
              },
            },
          });
        });

        list.append(row);
      });
      section.append(list);
    }

    section.append(addPriceForm(productId, () => renderPrices(container, productId)));
    container.append(section);
  }

  /* ---------------- one store's price, in full ---------------- */

  /* The row in 「お店ごとの値段」 shows what fits on a line: the price, the
     price of one, how long ago. Everything else about that record — the day
     it was seen, how far off the cheapest it is, what it used to cost there
     — needs a page of its own, and this is it. Also the only place any of it
     can be corrected: until now a wrong price could only be deleted and
     typed again. */
  function openPriceDetail(productId, priceId, onChanged) {
    const p = store.getProduct(productId);
    const pr = p && p.prices.find((x) => x.id === priceId);
    if (!pr) return;
    const st = store.getStore(pr.storeId);
    if (!st) return;

    const body = node(html`
      <div class="stack" style="gap:18px">
        <label class="field">
          <span class="field-label">値段</span>
          <input class="input js-price" type="text" autocomplete="off" value="${String(pr.price)}">
        </label>

        <label class="field">
          <span class="field-label">記録した日</span>
          <input class="input js-date" type="date" value="${isoToDay(pr.date)}">
        </label>

        <div class="field">
          <span class="field-label">くらべる</span>
          <div class="card js-compare" style="padding:12px"></div>
        </div>

        <div class="field js-log-wrap"></div>

        <button class="btn btn-danger btn-block js-del">${icon("trash")} この記録を削除</button>
      </div>
    `);

    const priceEl = body.querySelector(".js-price");
    const dateEl  = body.querySelector(".js-date");
    KN.keypad.bind(priceEl);

    const handle = KN.ui.sheet({
      title: st.name,
      titleMark: KN.util.raw(`<span class="dot" style="background:${st.color};width:14px;height:14px"></span>`),
      content: body,
      footer: node(html`<button class="btn btn-primary btn-block js-done">完了</button>`),
    });
    handle.el.querySelector(".js-done").addEventListener("click", () => handle.close());

    function save() {
      const price = KN.util.calc(priceEl.value);
      store.update((s) => {
        const prod = s.products.find((x) => x.id === productId);
        const rec = prod && prod.prices.find((x) => x.id === priceId);
        if (!rec) return;
        if (isFinite(price) && price >= 0) rec.price = price;
        const day = dateEl.value;
        if (day) rec.date = dayToIso(day, rec.date);
      });
      paint();
      onChanged && onChanged();
    }

    priceEl.addEventListener("input", debounce(save, 400));
    dateEl.addEventListener("change", save);

    function paint() {
      paintCompare(body.querySelector(".js-compare"), productId, priceId);
      paintLog(body.querySelector(".js-log-wrap"), productId, pr.storeId, priceId, () => {
        paint();
        onChanged && onChanged();
      });
    }
    paint();

    body.querySelector(".js-del").addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "この記録を削除しますか？",
        message: `${st.name} の ${yen(pr.price)} を消します。`,
        okLabel: "削除する",
        danger: true,
      });
      if (!ok) return;
      store.update((s) => {
        const prod = s.products.find((x) => x.id === productId);
        if (prod) prod.prices = prod.prices.filter((x) => x.id !== priceId);
      });
      handle.close();
      onChanged && onChanged();
      KN.ui.toast("削除しました");
    });

    return handle;
  }

  /* How this record stands against the others. The comparison is on the price
     as it is — what you actually hand over at the till — because the same
     thing in the same size is what gets bought week after week. When it is
     sold by the pack the price of one is shown underneath, but it never
     changes which shop is cheapest: every shop is divided by the same count. */
  function paintCompare(host, productId, priceId) {
    const p = store.getProduct(productId);
    const pr = p.prices.find((x) => x.id === priceId);
    const others = store.currentPrices(p);
    const mine = others.find((x) => x.id === priceId);
    const cheapest = others[0] || null;

    const rows = [];
    if (mine && cheapest && others.length > 1) {
      const diff = pr.price - cheapest.price;
      rows.push(diff === 0
        ? html`<span class="cmp-good">いちばん安い値段です</span>`
        : html`<span>いちばん安い ${store.getStore(cheapest.storeId).name} より
                 <b class="cmp-bad">${yen(diff)} 高い</b></span>`);
    }

    const up = perItemPrice(pr.price, p.amount, p.unit);
    if (up) {
      rows.push(html`<span>${formatSize(p.amount, p.unit)}入りなので <b>${up.text}</b></span>`);
    } else if (isCounted(p.unit)) {
      rows.push(html`<span style="color:var(--c-text-3)">入数を入れると、1${p.unit}あたりの値段も出ます</span>`);
    }

    host.innerHTML = "";
    host.append(node(html`
      <div class="stack cmp" style="gap:6px">${rows.length ? rows : html`<span style="color:var(--c-text-3)">ほかのお店の値段がまだありません</span>`}</div>
    `));
  }

  /** Every price ever recorded at this shop for this product. */
  function paintLog(host, productId, storeId, currentId, onChanged) {
    const p = store.getProduct(productId);
    const log = p.prices
      .filter((x) => x.storeId === storeId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    host.innerHTML = "";
    if (log.length < 2) return;

    host.append(node(html`<span class="field-label">このお店での記録（${String(log.length)}件）</span>`));
    const list = node(html`<div class="stack" style="gap:6px"></div>`);
    log.forEach((x) => {
      const up = perItemPrice(x.price, p.amount, p.unit);
      const row = node(html`
        <div class="log-row ${x.id === currentId ? "is-current" : ""}">
          <span class="log-date">${formatDate(x.date)}</span>
          <span class="log-price">${yen(x.price)}</span>
          <span class="log-unit">${up ? up.text : ""}</span>
          ${x.id === currentId
            ? html`<span class="log-tag">いま見ている</span>`
            : html`<button class="icon-btn is-danger js-drop" aria-label="この記録を削除">${icon("close")}</button>`}
        </div>
      `);
      const drop = row.querySelector(".js-drop");
      if (drop) {
        drop.addEventListener("click", () => {
          store.update((s) => {
            const prod = s.products.find((y) => y.id === productId);
            if (prod) prod.prices = prod.prices.filter((y) => y.id !== x.id);
          });
          onChanged && onChanged();
        });
      }
      list.append(row);
    });
    host.append(list);
  }

  /** ISO timestamp → the YYYY-MM-DD an <input type="date"> wants. */
  function isoToDay(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** YYYY-MM-DD back to a timestamp, keeping the original time of day. */
  function dayToIso(day, previousIso) {
    const [y, m, d] = day.split("-").map(Number);
    const prev = new Date(previousIso);
    const out = new Date(isNaN(prev.getTime()) ? Date.now() : prev.getTime());
    out.setFullYear(y, m - 1, d);
    return out.toISOString();
  }

  /* The price field takes a sum, not just a number, and the pad supplies the
     operators the system keypad does not have. This is the readout for it:
     what the sum comes to, live, right above the pad. */
  function wireCalculator(form) {
    const strip = form.querySelector(".js-calc");
    const out = form.querySelector(".js-calc-out");
    const fields = [form.querySelector(".js-price")].filter(Boolean);
    let last = fields[0];

    function paint() {
      const v = last && last.value;
      const n = KN.util.calc(v);
      if (KN.util.isExpression(v) && n != null) {
        out.textContent = `= ${yen(n)}`;
        out.classList.remove("is-idle");
      } else if (KN.util.isExpression(v)) {
        out.textContent = "…";
        out.classList.add("is-idle");
      } else {
        out.textContent = "＋ − × ÷ と「税」「割引」で計算できます";
        out.classList.add("is-idle");
      }
    }

    /* The readout sits under the field, which is exactly where the sheet's
       own scroller runs out — opening the pad on the last field in a long
       product left the running total below the fold, so the sum was being
       worked out somewhere the user could not see. Bring it up as the pad
       arrives, and again once the sheet has finished resizing around it. */
    const revealStrip = () => [180, 400, 680].forEach((ms) => setTimeout(() => {
      if (!strip.hidden) strip.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, ms));

    fields.forEach((f) => {
      KN.keypad.bind(f, {
        onOpen: () => { last = f; strip.hidden = false; paint(); revealStrip(); },
        onCommit: () => { strip.hidden = true; },
      });
      f.addEventListener("input", () => { last = f; paint(); });
      f.addEventListener("blur", () => setTimeout(() => {
        if (!KN.keypad.isOpen()) strip.hidden = true;
      }, 120));
    });

    paint();
  }

  function addPriceForm(productId, onAdded) {
    const p = store.getProduct(productId);
    const hasStores = store.get().stores.length > 0;

    const form = node(html`
      <form class="stack" style="gap:10px;padding:12px;border:1.5px dashed var(--c-border-2);border-radius:12px">
        <span class="field-label">値段を追加</span>
        <div class="js-stores"></div>
        <div class="input-group">
          <!-- Text, not number: a number field throws away「198+250」 the moment
               it is typed, and that sum is the whole point of the row of
               operators below. inputmode still asks for the numeric keypad. -->
          <input class="input js-price" type="text"
                 autocomplete="off" autocorrect="off" spellcheck="false"
                 placeholder="値段" style="flex:1.2" required>
          <button class="btn btn-primary js-add" type="submit" style="flex:0 0 auto">追加</button>
        </div>
        <p class="js-store-note" style="font-size:11px;color:var(--c-warn);margin:0;line-height:1.5" hidden></p>
        <div class="calc-row js-calc" hidden>
          <span class="calc-out js-calc-out" aria-live="polite"></span>
        </div>
        ${perItemPrice(1, p.amount, p.unit)
          ? html`<p class="js-hint" style="font-size:11px;color:var(--c-text-3);margin:0">
                   ${formatSize(p.amount, p.unit)}入りとして、1${p.unit}あたりの値段も出します
                 </p>`
          : ""}
      </form>
    `);

    /* Which shop this form should start on.
       Not simply the first one. The form is rebuilt after every add, and the
       first shop is usually the one whose price was just entered — so the
       next price would land on it again, quietly, and 「イオン ¥298」 would
       turn into 「イオン ¥248」 in front of someone who believed they were
       recording a second shop. (The ¥298 is still in the history; the row
       list only ever shows each shop's current price. But the row vanishing
       is not something to learn by watching it happen.)
       So: start on the first shop that has no price for this product yet,
       and if they all have one, start on none and let the tap say it. */
    const already = new Set(store.currentPrices(p).map((x) => x.storeId));
    const firstFree = store.sortedStores().find((s) => !already.has(s.id));

    let selectedStore = firstFree ? firstFree.id : null;

    /* Choosing a shop that already has a price is a perfectly good thing to
       do — it is how a price gets updated — but it should be the thing you
       meant, so the button and the line under it say which one it is.
       Declared before the picker: the picker announces its starting choice
       as it is built, and this is what listens. */
    const note = form.querySelector(".js-store-note");
    const addBtn = form.querySelector(".js-add");
    function paintStore() {
      const has = selectedStore
        ? store.currentPrices(p).find((x) => x.storeId === selectedStore)
        : null;
      addBtn.textContent = has ? "更新" : "追加";
      note.hidden = !has;
      if (has) {
        const st = store.getStore(selectedStore);
        note.textContent = `${st ? st.name : "この店"}にはすでに ${yen(has.price)} が入っています。`
          + "上書きではなく、新しい記録として今の値段になります";
      }
    }
    paintStore();

    /* Pressing a button in this form must not first take the caret off the
       price field: that closes the pad, the pad closing hands back a third of
       the screen, and everything moves before the click has been delivered.
       Keeping focus keeps the geometry still — the pad goes away afterwards,
       once the button has done what it was pressed for. */
    ["pointerdown", "mousedown"].forEach((type) => {
      form.addEventListener(type, (e) => {
        if (e.target.closest("button")) e.preventDefault();
      });
    });

    KN.ui.storePicker(form.querySelector(".js-stores"), {
      selectedId: selectedStore,
      autoPick: false,
      onSelect: (id) => { selectedStore = id; paintStore(); },
    });

    wireCalculator(form);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const priceEl = form.querySelector(".js-price");
      // 「198+250」 is stored as 448. calc() returns null for a plain number,
      // so a straight price still goes through parseNum as before.
      const price = KN.util.calc(priceEl.value);

      if (!hasStores && !selectedStore) {
        KN.ui.toast("先に「＋ お店を追加」でお店を登録してください");
        return;
      }
      if (!selectedStore) { KN.ui.toast("お店を選んでください"); return; }
      // `price == null` is the empty field and the half-typed sum alike —
      // and it has to be checked on its own, because isFinite(null) is true
      // and would have let a priceless price through.
      if (price == null || !isFinite(price) || price < 0) {
        KN.ui.toast("値段を入力してください");
        return;
      }

      /* The pad has no business outliving the form it was typing into — and
         its going away is what moves the layout, so it goes now, before the
         list below is rebuilt. */
      KN.keypad.close();
      const st = store.getStore(selectedStore);
      const had = store.currentPrices(p).find((x) => x.storeId === selectedStore);
      store.addPrice(productId, { storeId: selectedStore, price });
      haptic(12);
      priceEl.value = "";
      // Which shop it went to, out loud. A price is only ever meaningful with
      // a shop attached, and this is the moment the wrong one would be caught.
      KN.ui.toast(had
        ? `${st ? st.name : "この店"}を ${yen(had.price)} → ${yen(price)} にしました`
        : `${st ? st.name : "この店"}に ${yen(price)} を記録しました`);
      onAdded();
    });

    return form;
  }

  /* ---------------- history ---------------- */

  function historySection(productId) {
    const p = store.getProduct(productId);
    if (!p.prices || p.prices.length < 3) return document.createDocumentFragment();

    const sorted = [...p.prices].sort((a, b) => new Date(a.date) - new Date(b.date));
    const values = sorted.map((x) => x.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;

    const W = 300, H = 48, PAD = 4;
    const pts = sorted.map((pr, i) => {
      const x = sorted.length === 1 ? W / 2 : (i / (sorted.length - 1)) * (W - PAD * 2) + PAD;
      const y = H - PAD - ((pr.price - min) / span) * (H - PAD * 2);
      return [x, y];
    });

    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;

    return node(html`
      <div class="field">
        <span class="field-label">値段の記録（${sorted.length}件）</span>
        <div class="card" style="padding:12px">
          <svg class="spark" viewBox="0 0 ${String(W)} ${String(H)}" preserveAspectRatio="none" aria-hidden="true">
            <path class="spark-area" d="${area}"></path>
            <path class="spark-line" d="${line}"></path>
          </svg>
          <div class="spread" style="margin-top:6px">
            <span style="font-size:11px;color:var(--c-text-3)">いちばん安いとき ${yen(min)}</span>
            <span style="font-size:11px;color:var(--c-text-3)">高いとき ${yen(max)}</span>
          </div>
        </div>
      </div>
    `);
  }

  /* ---------------- danger ---------------- */

  function dangerSection(productId, closeSheet) {
    const btn = node(html`
      <button class="btn btn-danger btn-block">${icon("trash")} この商品を削除</button>
    `);
    btn.addEventListener("click", async () => {
      const p = store.getProduct(productId);
      const ok = await KN.ui.confirm({
        title: "商品を削除しますか？",
        message: `「${p.name}」の価格記録と、買い物リストの項目もまとめて削除されます。`,
        okLabel: "削除する",
        danger: true,
      });
      if (!ok) return;
      store.update((s) => {
        s.products = s.products.filter((x) => x.id !== productId);
        s.items = s.items.filter((i) => i.productId !== productId);
      });
      KN.ui.toast("削除しました");
      closeSheet();
    });
    return btn;
  }

  KN.productSheet = { open };
})();
