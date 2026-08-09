/* =========================================================
   かいものノート — shared product / item detail sheet
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, yen, unitPrice, formatSize, relativeDate, UNITS, parseNum, debounce, haptic } = KN.util;
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

    body.append(nameField(productId));
    if (itemId) body.append(itemSection(itemId));
    body.append(categoryField(productId));
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

  function nameField(productId) {
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
      store.update((s) => {
        const rec = s.products.find((x) => x.id === productId);
        if (rec) rec.name = v;
      });
    }, 350);
    input.addEventListener("input", save);
    return wrap;
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
    KN.ui.categoryPicker(wrap.querySelector(".js-picker"), {
      selectedId: p.categoryId,
      onSelect: (categoryId) => {
        store.update((s) => {
          const rec = s.products.find((x) => x.id === productId);
          if (rec) rec.categoryId = categoryId;
        });
      },
    });
    return wrap;
  }

  function sizeField(productId, onChanged) {
    const p = store.getProduct(productId);
    const wrap = node(html`
      <div class="field">
        <span class="field-label">内容量（単価の計算に使います）</span>
        <div class="input-group">
          <input class="input js-amount" style="flex:1" type="number" inputmode="decimal" min="0" step="any"
                 value="${p.amount != null ? p.amount : ""}" placeholder="500">
          <select class="select js-unit" style="flex:0 0 110px">
            <option value="">単位なし</option>
            ${UNITS.map((u) => html`<option value="${u}" ${p.unit === u ? KN.util.raw("selected") : ""}>${u}</option>`)}
          </select>
        </div>
      </div>
    `);

    const amountEl = wrap.querySelector(".js-amount");
    const unitEl = wrap.querySelector(".js-unit");

    function save() {
      const amount = parseNum(amountEl.value);
      store.update((s) => {
        const rec = s.products.find((x) => x.id === productId);
        if (!rec) return;
        rec.amount = isFinite(amount) && amount > 0 ? amount : null;
        rec.unit = unitEl.value;
      });
      onChanged && onChanged();
    }

    amountEl.addEventListener("input", debounce(save, 400));
    unitEl.addEventListener("change", save);
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
        const amount = pr.amount || p.amount;
        const up = unitPrice(pr.price, amount, p.unit);
        const isBest = best && pr.id === best.id && prices.length > 1;

        const row = node(html`
          <div class="price-row ${isBest ? "is-best" : ""}">
            <span class="dot" style="background:${st.color}"></span>
            <div class="price-store-wrap">
              <span class="price-store">${st.name}</span>
              ${isBest ? html`<span class="crown">🏆</span>` : ""}
            </div>
            <div class="price-figures">
              <span class="price-amount">${yen(pr.price)}</span>
              ${up ? html`<span class="price-unit">${up.text}</span>` : ""}
              <span class="price-date">${relativeDate(pr.date)}</span>
            </div>
            <button class="icon-btn is-danger js-del" aria-label="この価格を削除">${icon("trash")}</button>
          </div>
        `);

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

  function addPriceForm(productId, onAdded) {
    const p = store.getProduct(productId);
    const hasStores = store.get().stores.length > 0;

    const form = node(html`
      <form class="stack" style="gap:10px;padding:12px;border:1.5px dashed var(--c-border-2);border-radius:12px">
        <span class="field-label">値段を追加</span>
        <div class="js-stores"></div>
        <div class="input-group">
          <input class="input js-price" type="number" inputmode="numeric" min="0" step="1"
                 placeholder="値段" style="flex:1.2" required>
          <input class="input js-size" type="number" inputmode="decimal" min="0" step="any"
                 placeholder="${p.unit ? `内容量(${p.unit})` : "内容量"}" style="flex:1"
                 ${p.unit ? "" : KN.util.raw("disabled")}>
          <button class="btn btn-primary js-add" type="submit" style="flex:0 0 auto">追加</button>
        </div>
        <p class="js-hint" style="font-size:11px;color:var(--c-text-3);margin:0">
          ${p.unit
            ? html`内容量は、その店だけ容量が違うときに入れてください（空なら ${formatSize(p.amount, p.unit) || "商品の内容量"} を使います）`
            : html`上の「内容量」を設定すると、100gあたりなどの単価でも比べられます`}
        </p>
      </form>
    `);

    let selectedStore = null;
    KN.ui.storePicker(form.querySelector(".js-stores"), {
      selectedId: null,
      onSelect: (id) => { selectedStore = id; },
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const priceEl = form.querySelector(".js-price");
      const sizeEl = form.querySelector(".js-size");
      const price = parseNum(priceEl.value);

      if (!hasStores && !selectedStore) {
        KN.ui.toast("先に「＋ お店を追加」でお店を登録してください");
        return;
      }
      if (!selectedStore) { KN.ui.toast("お店を選んでください"); return; }
      if (!isFinite(price) || price < 0) { KN.ui.toast("値段を入力してください"); return; }

      store.addPrice(productId, {
        storeId: selectedStore,
        price,
        amount: parseNum(sizeEl.value),
      });
      haptic(12);
      priceEl.value = "";
      sizeEl.value = "";
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
