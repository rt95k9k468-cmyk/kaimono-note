/* =========================================================
   くらしノート — shared product / item detail sheet
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
   * @param {string} [opts.itemId] when opened from the shopping list, shows the ★ and the memo
   */
  function open(productId, { itemId } = {}) {
    const product = store.getProduct(productId);
    if (!product) return;
    return openV2(productId, { itemId });
  }

  /* ---------------- fields ---------------- */

  /* 名前を付け替える（紙の頭の欄から）。 */
  function renameProduct(productId, v, onRecategorised, onRenamed) {
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
  }

  /* ---------------- the picture ---------------- */

  /* 「もしかして」 first, then everything. The guess already had its go at the
     name; what is useful here is the *near* misses — the pictures the name
     brushes against without landing on, which is where the right one usually
     is. Below that the whole set, because sometimes the right picture has
     nothing to do with the name at all. */
  function openIconPicker(productId, onChanged) {
    /* 紙の作り（探す・報告・おまかせ・もしかして・見出しで束ねる・流し込み）は
       やることと一つ（KN.ui.iconPicker）。ここが渡すのは品物の絵の出どころと、
       選んだあとの保存だけ。

       報告に出す絵は自動の推測（findKey、カテゴリの当たりも含む）で、
       いま product.icon に入っている値ではありません——手で選んだ絵を
       挟んだあとに報告しても、辞書がどちらの困りごとを起こしているかは
       変わらないので。 */
    function autoGuess() {
      const p = store.getProduct(productId);
      if (!p) return "";
      const name = String(p.name || "").trim();
      if (!name) return "";
      const cat = store.get().categories.find((c) => c.id === p.categoryId)
        || store.get().categories.find((c) => c.id === store.OTHER_CATEGORY)
        || store.get().categories[0];
      return KN.productIcons.findKey(name) || (cat && KN.productIcons.findKey(cat.name)) || "";
    }

    return KN.ui.iconPicker({
      screen: "shop",
      current: () => (store.getProduct(productId) || {}).icon || "",
      reportOf: () => {
        const p = store.getProduct(productId);
        return { text: (p && p.name) || "", gotIcon: autoGuess() };
      },
      guess: (text) => KN.productIcons.findKey(text) || "",
      autoMark: () => {
        const rec = store.getProduct(productId);
        return rec ? store.autoMark(rec) : null;
      },
      search: (query) => KN.productIcons.search(query),
      maybe: () => {
        const rec = store.getProduct(productId);
        const maybe = KN.productIcons.suggest(rec.name, 8);
        return KN.productIcons.list().filter((x) => maybe.includes(x.key))
          .sort((a, b) => maybe.indexOf(a.key) - maybe.indexOf(b.key));
      },
      /* 「ぜんぶ」は見出しで束ねて出します（`KN.productIcons.groups()`）。 */
      groups: () => KN.productIcons.groups(),
      onChoose: (key) => {
        store.update((s) => {
          const rec = s.products.find((x) => x.id === productId);
          if (rec) rec.icon = key || null;
        });
        haptic(12);
        onChanged && onChanged();
      },
    });
  }

  /* 手でカテゴリを選んだ（小窓から）。 */
  function chooseCategory(productId, categoryId) {
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
        ? `1${unitEl.value}あたりの値段も出します`
        : "";
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
        <p style="color:var(--c-text-2);font-size:var(--fs-md);line-height:1.6">
          まだ登録がありません。
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
                ${isBest ? html`<span class="crown" aria-label="いちばん安い">${icon("crown", "is-sub")}</span>` : ""}
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
          KN.ui.toast("価格を消しました", {
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
          <input class="input js-date" type="hidden" data-when="day" aria-label="記録した日" value="${isoToDay(pr.date)}">
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
    KN.ui.whenFields(body);
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
      /* 元に戻すときは、同じ価格を同じ場所へ（roadmap-2.0 の V18）。 */
      let at = -1, snap = null;
      store.update((s) => {
        const prod = s.products.find((x) => x.id === productId);
        if (!prod) return;
        at = prod.prices.findIndex((x) => x.id === priceId);
        if (at >= 0) snap = JSON.parse(JSON.stringify(prod.prices[at]));
        prod.prices = prod.prices.filter((x) => x.id !== priceId);
      });
      handle.close();
      onChanged && onChanged();
      KN.ui.toast("消しました", snap ? { action: { label: "元に戻す", onClick: () => {
        store.update((s) => {
          const prod = s.products.find((x) => x.id === productId);
          if (!prod || prod.prices.some((x) => x.id === priceId)) return;
          const next = prod.prices.slice();
          next.splice(Math.min(at, next.length), 0, snap);
          prod.prices = next;
        });
        onChanged && onChanged();
      } } } : {});
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

  /** ISO timestamp → the YYYY-MM-DD the day field (whenFields) wants. */
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

  /* 枠の箱と「値段を追加」の見出し・説明の一行は外した。お店の札は一列で横に送る
     （V26、利用者「値段を追加の枠が場所を取りすぎ」10月5日）。 */
  function addPriceForm(productId, onAdded) {
    const p = store.getProduct(productId);
    const hasStores = store.get().stores.length > 0;

    const form = node(html`
      <form class="price-add" aria-label="値段を追加">
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
        <p class="js-store-note" style="font-size:var(--fs-md);color:var(--c-warn);margin:0;line-height:1.5" hidden></p>
        <div class="calc-row js-calc" hidden>
          <span class="calc-out js-calc-out" aria-live="polite"></span>
        </div>
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
        note.textContent = `${st ? st.name : "この店"}は ${yen(has.price)}。新しい記録として足します`;
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
      // And the caret with it. onAdded() rebuilds this form, and a field that
      // is removed while focused is never blurred — the app would still think
      // something was being typed into a field that no longer exists.
      priceEl.blur();
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
            <span style="font-size:calc(11px * var(--fs-k));color:var(--c-text-3)">いちばん安いとき ${yen(min)}</span>
            <span style="font-size:calc(11px * var(--fs-k));color:var(--c-text-3)">高いとき ${yen(max)}</span>
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
      /* 元に戻すときは、商品と、一緒に外したリストの項目を同じ場所へ（V18）。 */
      const gone = { at: -1, prod: null, items: [] };
      store.update((s) => {
        gone.at = s.products.findIndex((x) => x.id === productId);
        if (gone.at >= 0) gone.prod = JSON.parse(JSON.stringify(s.products[gone.at]));
        s.items.forEach((it, i) => { if (it.productId === productId) gone.items.push([i, JSON.parse(JSON.stringify(it))]); });
        s.products = s.products.filter((x) => x.id !== productId);
        s.items = s.items.filter((i) => i.productId !== productId);
      });
      KN.ui.toast("消しました", gone.prod ? { action: { label: "元に戻す", onClick: () => {
        store.update((s) => {
          if (s.products.some((x) => x.id === productId)) return;
          const prods = s.products.slice();
          prods.splice(Math.min(gone.at, prods.length), 0, gone.prod);
          s.products = prods;
          const items = s.items.slice();
          gone.items.forEach(([i, it]) => {
            if (!items.some((x) => x.id === it.id)) items.splice(Math.min(i, items.length), 0, it);
          });
          s.items = items;
        });
      } } } : {});
      closeSheet();
    });
    return btn;
  }

  /* openIconPicker も外へ出します——買うものの一覧の丸を直接タップして
     絵を選べるように（screen-list.js）。品目の紙を経由せず、その場で
     アイコンを選ぶ紙だけを開きます。 */
  /* ---------------- 2.0：やることの紙と同じ形（roadmap-2.0 の V23） ----------------

     足す紙と直す紙を、同じ一つの形から作ります（10月4日、利用者「追加する時と編集する
     時がほぼ同じであってほしい」「タスクと同じような詳細シートのレイアウトに」）。

       頭   … カテゴリの色の帯。左に大きな絵（直すときは押して替える）、右に名前と
              小さな★（今回買う。前は一段まるごと使っていた）。名前の上は最安の値段
       札   … カテゴリ（押すと小窓）。直すときは下に内容量
       中身 … メモ。直すときは、その下に値段・履歴・削除

     数量は出しません（使わない、と利用者。記録の qty はそのまま残す）。 */

  function frame({ name = "", categoryId, fav = null, memo = "", add = false, chips = false } = {}) {
    const hero = node(html`
      <div class="sheet-hero pd-hero">
        <span class="hero-mark">
          ${/* 足す紙では、まだ品物が無いので絵は推すだけ（ボタンにしない＝最初の欄は名前）。 */""}
          ${add ? html`<span class="hero-node js-icon-pick" aria-hidden="true"></span>`
            : html`<button type="button" class="hero-node js-icon-pick" aria-label="絵を選ぶ"></button>`}
        </span>
        <span class="hero-text">
          <span class="hero-cap js-cap" hidden></span>
          <span class="pd-name">
            <input class="hero-title js-name" value="${name}" placeholder="例：食器用洗剤"
                   autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="商品名">
            ${fav == null ? "" : html`<button type="button" class="pd-fav js-fav ${fav ? "is-on" : ""}"
                    aria-pressed="${String(!!fav)}" aria-label="今回買う">${icon("star")}</button>`}
          </span>
          <button type="button" class="dest-chip js-dest" hidden></button>
        </span>
      </div>
    `);
    /* chips：カテゴリとメモを、名前の下の札一列に（足す紙。V27、利用者が選んだ）。
       メモは札を押すと欄が出る。配線（js-row-cat・js-cat-v・js-memo）は枠の形と同じ。 */
    const body = chips ? node(html`
      <div class="sheet-detail">
        <div class="js-ac"></div>
        <div class="pd-chips">
          <button type="button" class="chip pd-chip js-row-cat"><span class="chip-dot"></span><span class="js-cat-v"></span>${icon("chevron-down")}</button>
          <button type="button" class="chip pd-chip js-memo-chip" ${memo ? "hidden" : ""}>${icon("edit")}<span>メモ</span></button>
        </div>
        <div class="js-more"></div>
        <textarea class="d-memo pd-memo js-memo" rows="1" placeholder="メモ（例：詰め替え用）" ${memo ? "" : "hidden"}>${memo}</textarea>
      </div>
    `) : node(html`
      <div class="sheet-detail">
        <div class="js-ac"></div>
        <div class="d-card">
          <button type="button" class="d-row js-row-cat">
            <span class="d-ico">${icon("tag")}</span>
            <span class="d-label">カテゴリ</span>
            <span class="d-value js-cat-v"></span>
            <span class="d-go">${icon("chevron")}</span>
          </button>
          <div class="js-more"></div>
          <textarea class="d-memo js-memo" rows="1" placeholder="メモ（例：詰め替え用）">${memo}</textarea>
        </div>
      </div>
    `);
    const memoChip = body.querySelector(".js-memo-chip");
    if (memoChip) memoChip.addEventListener("click", () => {
      const ta = body.querySelector(".js-memo");
      memoChip.hidden = true;
      ta.hidden = false;
      haptic();
      KN.ui.focusNow(ta);
    });

    let current = categoryId || store.OTHER_CATEGORY;
    let onSelect = null;
    const catRow = body.querySelector(".js-row-cat");
    const paintCat = () => {
      const c = store.getCategory(current);
      body.querySelector(".js-cat-v").textContent = c ? c.name : "";
      hero.style.setProperty("--cat", (c && c.color) || "var(--c-primary-fill)");
      catRow.style.setProperty("--cat", (c && c.color) || "var(--c-primary-fill)");
    };
    paintCat();
    /* カテゴリは押したそばの小窓で（やることの紙の日付・時刻と同じ）。選んだら一拍で閉じる。 */
    catRow.addEventListener("click", () => {
      const box = node(html`<div></div>`);
      const p = KN.ui.popOver(catRow, { side: "left", label: "カテゴリ", cls: "is-form" });
      KN.ui.categoryPicker(box, {
        selectedId: current,
        onSelect: (id) => {
          current = id;
          paintCat();
          if (onSelect) onSelect(id);
          setTimeout(() => p.close(), KN.motion.ms("--m-state"));
        },
      });
      p.el.append(box);
      p.place();
    });

    const fav0 = hero.querySelector(".js-fav");
    if (fav0) fav0.addEventListener("click", () => {
      const on = !fav0.classList.contains("is-on");
      fav0.classList.toggle("is-on", on);
      fav0.setAttribute("aria-pressed", String(on));
      haptic();
    });

    return {
      hero,
      body,
      name: hero.querySelector(".js-name"),
      fav: fav0,
      memo: body.querySelector(".js-memo"),
      ac: body.querySelector(".js-ac"),
      known: hero.querySelector(".js-cap"),
      dest: hero.querySelector(".js-dest"),
      more: body.querySelector(".js-more"),
      mark: hero.querySelector(".js-icon-pick"),
      /** メモの札を閉じた姿へ（足す紙で、続けて打つとき）。 */
      resetMemo() {
        const ta = body.querySelector(".js-memo");
        ta.value = "";
        if (memoChip) { memoChip.hidden = false; ta.hidden = true; }
      },
      /* 前の categoryPicker と同じ口（current・set）。set は onSelect を呼ばない。 */
      cat: {
        get current() { return current; },
        set(id) { if (id && id !== current) { current = id; paintCat(); } },
        onSelect(fn) { onSelect = fn; },
      },
    };
  }

  /* 直す紙。中身の配線は前の欄と同じもの（renameProduct・chooseCategory・
     sizeField・renderPrices ほか）を使います。 */
  function openV2(productId, { itemId } = {}) {
    const product = store.getProduct(productId);
    const itemOf = () => (itemId ? store.get().items.find((i) => i.id === itemId) : null);
    const item = itemOf();
    const f = frame({
      name: product.name, categoryId: product.categoryId,
      fav: item ? !!item.fav : null, memo: item ? item.memo || "" : "",
    });
    const pricesWrap = node(html`<div class="stack" style="gap:12px"></div>`);
    const rerenderPrices = () => { renderPrices(pricesWrap, productId); paintCap(); };

    const paintMark = () => { f.mark.innerHTML = store.productMark(store.getProduct(productId)); };
    function paintCap() {
      const p = store.getProduct(productId);
      const best = p ? store.bestPrice(p) : null;
      const st = best ? store.getStore(best.storeId) : null;
      f.known.hidden = !(best && st);
      f.known.textContent = best && st ? `最安 ${st.name} ${yen(best.price)}` : "";
    }
    paintMark();

    f.mark.addEventListener("click", () => openIconPicker(productId, paintMark));
    f.name.addEventListener("input", debounce(() => {
      const v = f.name.value.trim();
      if (!v) return;
      renameProduct(productId, v, () => f.cat.set(store.getProduct(productId).categoryId), paintMark);
    }, 350));
    f.cat.onSelect((id) => { chooseCategory(productId, id); paintMark(); });

    /* ★とメモは、買うものの行（item）のもの。価格から開いたとき（行が無い）は★を出さず、
       メモも書けない（前の紙と同じ）。 */
    if (f.fav) f.fav.addEventListener("click", () => {
      const on = f.fav.classList.contains("is-on");
      store.update((s) => { const rec = s.items.find((i) => i.id === itemId); if (rec) rec.fav = on; });
    });
    if (item) {
      f.memo.addEventListener("input", debounce(() => {
        store.update((s) => { const rec = s.items.find((i) => i.id === itemId); if (rec) rec.memo = f.memo.value; });
      }, 350));
    } else {
      f.memo.remove();
    }

    const size = node(html`<div class="pd-size"></div>`);
    size.append(sizeField(productId, rerenderPrices));
    f.more.append(size);

    f.body.append(pricesWrap);
    rerenderPrices();
    f.body.append(historySection(productId));
    f.body.append(dangerSection(productId, () => handle.close()));

    /* 「リストから外す」は ⋯ の中（前は数量の隣。数量は出さなくなった）。 */
    const menu = item ? [{
      id: "unlist",
      label: () => "リストから外す",
      icon: "close",
      onPick: () => {
        const snapshot = itemOf();
        if (!snapshot) return;
        store.update((s) => { s.items = s.items.filter((i) => i.id !== itemId); });
        KN.ui.toast("リストから外しました", {
          action: { label: "元に戻す", onClick: () => store.update((s) => { s.items.unshift(snapshot); }) },
        });
        handle.close();
      },
    }] : null;

    const foot = node(html`<button class="btn btn-primary btn-block">完了</button>`);
    const handle = KN.ui.sheet({ title: product.name, hero: f.hero, menu, content: f.body, footer: foot });
    foot.addEventListener("click", () => handle.close());
    return handle;
  }

  KN.productSheet = { open, openIconPicker, frame };
})();
