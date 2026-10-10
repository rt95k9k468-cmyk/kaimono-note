/* =========================================================
   くらしノート — settings screen：shopping の行（お店・カテゴリ・おぼえた振り分け）
   土台（紙の重なり・行の部品・PAGES）は screen-settings.js。分け方は
   docs/settings.md の「ファイルの分け方」。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon } = KN.util;
  const store = KN.store;
  const S = KN.settingsParts;
  const { go, TINT, card, foot, navRow, switchRow, render } = S;

  /* ---------------- 買うもの ----------------

     お店とカテゴリは、どちらも一画面ぶんあります（10行・9行）。数だけを
     行に出して、中身は「›」の先へ。価格の画面の上にあった「68商品・10店舗」も
     ここへ——あちらでは値札の並びそのものが数を見せていて、その上でもう一度
     数えた結果を書くのは、同じことを二度言うことでした。 */
  function listRows() {
    const s = store.get();
    return [
      card(
        navRow({
          ico: "store", tint: TINT.store, title: "お店",
          value: `${(s.stores || []).length}件`, onTap: () => go("stores"),
        }),
        navRow({
          ico: "tag", tint: TINT.cat, title: "カテゴリ",
          value: `${(s.categories || []).length}件`, onTap: () => go("cats"),
        }),
        /* バックアップの一枚から移しました。カテゴリの自動判定の話なので、
           カテゴリのすぐ下に。 */
        navRow({
          ico: "sparkles", tint: TINT.sub, title: "おぼえた振り分け",
          value: `${store.learnedList().length}件`, onTap: openLearned,
        })
      ),
      foot(`${s.products.length}商品・${s.stores.length}店舗`),
      /* 既定で畳む（roadmap-3.1 の S4）。 */
      card(
        switchRow({
          title: "そろそろ切れそう", on: s.settings.showLow === true,
          onTap: (v) => { store.update((x) => { x.settings.showLow = v; }); render(); },
        })
      ),
    ];
  }

  function storesGroup() {
    const stores = store.sortedStores();
    const wrap = node(html`
      <section class="settings-group">
        <div class="set-card js-rows"></div>
        <div class="set-card">
          <button type="button" class="set-row is-add js-add">
            <span class="set-glyph">${icon("plus")}</span>
            <span class="set-title">お店を追加</span>
          </button>
        </div>
      </section>
    `);

    const rows = wrap.querySelector(".js-rows");
    if (!stores.length) {
      rows.append(node(html`
        <p class="set-empty">まだありません。</p>
      `));
    }

    stores.forEach((st) => {
      const usage = store.get().products.reduce(
        (n, p) => n + p.prices.filter((pr) => pr.storeId === st.id).length, 0
      );
      const row = node(html`
        <div class="manage-row">
          <span class="dot" style="background:${st.color};width:14px;height:14px"></span>
          <span class="manage-name">${st.name}</span>
          <span class="fine-note">${usage}件の価格</span>
          <button class="icon-btn js-edit" aria-label="直す">${icon("edit")}</button>
          <button class="icon-btn is-danger js-del" aria-label="消す">${icon("trash")}</button>
        </div>
      `);

      row.querySelector(".js-edit").addEventListener("click", () => editStore(st));
      row.querySelector(".js-del").addEventListener("click", async () => {
        const ok = await KN.ui.confirm({
          title: "お店を消しますか？",
          message: `「${st.name}」と、この店で登録した${usage}件の価格が消えます。`,
          okLabel: "消す",
          danger: true,
        });
        if (!ok) return;
        store.update((s) => {
          s.stores = s.stores.filter((x) => x.id !== st.id);
          s.products.forEach((p) => { p.prices = p.prices.filter((pr) => pr.storeId !== st.id); });
        });
        KN.ui.toast("消しました");
      });

      rows.append(row);
    });

    KN.reorder.attach(rows, {
      item: ".manage-row",
      onDrop: (from, to) => KN.reorder.applyOrder(stores, from, to, (s) => s.stores),
    });

    wrap.querySelector(".js-add").addEventListener("click", () => editStore(null));

    return wrap;
  }

  /** お店の紙。`st` が null なら「足す」——**編集と同じ一枚**にします。
      名前だけ聞く小さな窓だと、色は足したあとでもう一度開いて選ぶことに
      なりますし、足すと編集で出てくるものの形が違います。 */
  function editStore(st) {
    const body = node(html`
      <div class="stack gap-4">
        <label class="field">
          <span class="field-label">お店の名前</span>
          <input class="input js-name" value="${st ? st.name : ""}" placeholder="例：イオン 〇〇店">
        </label>
        <div class="field">
          <span class="field-label">色</span>
          <div class="swatches js-swatches"></div>
        </div>
      </div>
    `);

    let color = st ? st.color : store.STORE_COLORS[0];
    const sw = body.querySelector(".js-swatches");
    function paint() {
      sw.innerHTML = "";
      store.STORE_COLORS.forEach((c) => {
        const b = node(html`<button type="button" class="swatch" style="background:${c}" aria-pressed="${String(c === color)}" aria-label="色"></button>`);
        b.addEventListener("click", () => { color = c; paint(); });
        sw.append(b);
      });
    }
    paint();

    const foot = node(html`<button class="btn btn-primary btn-block js-save">${st ? "保存" : "追加"}</button>`);
    const h = KN.ui.sheet({
      title: st ? "お店を直す" : "お店を追加", content: body, footer: foot, guard: true,
    });

    foot.addEventListener("click", () => {
      const name = body.querySelector(".js-name").value.trim();
      if (!st) {
        if (!name) { KN.ui.toast("名前を入力してください"); return; }
        if (store.findStoreByName(name)) { KN.ui.toast("同じ名前のお店があります"); return; }
        store.addStore(name, color);
        h.close();
        KN.ui.toast("追加しました");
        return;
      }
      store.update((s) => {
        const rec = s.stores.find((x) => x.id === st.id);
        if (rec) { if (name) rec.name = name; rec.color = color; }
      });
      h.close();
      KN.ui.toast("保存しました");
    });
  }

  /* ---------------- categories ---------------- */

  function categoriesGroup() {
    const cats = store.sortedCategories();
    const wrap = node(html`
      <section class="settings-group">
        <div class="set-card js-rows"></div>
        <div class="set-card">
          <button type="button" class="set-row is-add js-add">
            <span class="set-glyph">${icon("plus")}</span>
            <span class="set-title">カテゴリを追加</span>
          </button>
        </div>
      </section>
    `);

    const rows = wrap.querySelector(".js-rows");
    cats.forEach((c) => {
      const used = store.get().products.filter((p) => p.categoryId === c.id).length;
      const row = node(html`
        <div class="manage-row" style="--cat:${c.color || ""}">
          ${/* 絵文字の列はやめました（最優先の約束事）。すぐ左の色の帯が
                同じことを——どの棚か——もう言っています。 */""}
          <span class="manage-swatch" style="background:${c.color || "transparent"}"></span>
          <span class="manage-name">${c.name}</span>
          <span class="fine-note">${used}商品</span>
          <button class="icon-btn js-edit" aria-label="直す">${icon("edit")}</button>
          ${c.id === store.OTHER_CATEGORY
            ? ""
            : html`<button class="icon-btn is-danger js-del" aria-label="消す">${icon("trash")}</button>`}
        </div>
      `);

      row.querySelector(".js-edit").addEventListener("click", () => editCategory(c));

      const del = row.querySelector(".js-del");
      if (del) {
        del.addEventListener("click", async () => {
          const ok = await KN.ui.confirm({
            title: "カテゴリを消しますか？",
            message: used > 0
              ? `${used}件の商品は「その他」に移動します。`
              : "このカテゴリを消します。",
            okLabel: "消す",
            danger: true,
          });
          if (!ok) return;
          store.update((s) => {
            s.categories = s.categories.filter((x) => x.id !== c.id);
            s.products.forEach((p) => {
              if (p.categoryId === c.id) p.categoryId = store.OTHER_CATEGORY;
            });
          });
          KN.ui.toast("消しました");
        });
      }

      rows.append(row);
    });

    KN.reorder.attach(rows, {
      item: ".manage-row",
      onDrop: (from, to) => KN.reorder.applyOrder(cats, from, to, (s) => s.categories),
    });

    wrap.querySelector(".js-add").addEventListener("click", () => editCategory(null));
    return wrap;
  }

  function editCategory(cat) {
    const body = node(html`
      <div class="stack gap-4">
        <label class="field">
          <span class="field-label">名前</span>
          <input class="input js-name" value="${cat ? cat.name : ""}" placeholder="例：おやつ">
        </label>
        ${/* **絵文字の欄は出しません。** 「アプリ内UIに絵文字を使わない」と
              決めてあるのに、ここは打ちこませる口でした——打てるのに出ない、
              では打った人の字が消えたように見えます。棚を見分けるのは下の
              色です。**保存済みの `emoji` 欄は消していません**（消すと既存の
              値が戻せないので、そのまま持ったまま、描かないだけ）。 */""}
        <div class="field">
          <span class="field-label">色（このカテゴリの品物の背景になります）</span>
          <div class="swatches js-swatches"></div>
        </div>
      </div>
    `);

    let color = (cat && cat.color) || store.CATEGORY_COLORS[0];
    const sw = body.querySelector(".js-swatches");
    function paintSwatches() {
      sw.innerHTML = "";
      store.CATEGORY_COLORS.forEach((c) => {
        const b = node(html`<button type="button" class="swatch" style="background:${c}"
                              aria-pressed="${String(c === color)}" aria-label="色"></button>`);
        b.addEventListener("click", () => { color = c; paintSwatches(); });
        sw.append(b);
      });
    }
    paintSwatches();

    const foot = node(html`<button class="btn btn-primary btn-block">${cat ? "保存" : "追加"}</button>`);
    const h = KN.ui.sheet({ title: cat ? "カテゴリを直す" : "カテゴリを追加", content: body, footer: foot });

    foot.addEventListener("click", () => {
      const name = body.querySelector(".js-name").value.trim();
      if (!name) { KN.ui.toast("名前を入力してください"); return; }

      store.update((s) => {
        if (cat) {
          const rec = s.categories.find((x) => x.id === cat.id);
          /* `emoji` には**触りません**。もう描いていませんが、欄は残して
             あるので、ここで書き替えると保存済みの値が黙って消えます。 */
          if (rec) { rec.name = name; rec.color = color; }
        } else {
          s.categories.push({
            /* `emoji` は**空で持たせます**。もう描きませんが、欄そのものは
               残す決めごとなので（保存済みの値を消さないため）、新しい棚も
               同じ形で持たせておきます——形が揃っていないと、あとで
               `reconcile()` や書き出しが棚ごとに違う顔を見ることになります。 */
            id: KN.util.uid("c"), name, emoji: "", color,
            order: Math.max(-1, ...s.categories.map((x) => x.order ?? 0)) + 1,
          });
        }
      });
      h.close();
      KN.ui.toast(cat ? "保存しました" : "追加しました");
    });
  }

  /* What the app has been taught, and a way to take it back. Guessing on the
     user's behalf is only reasonable if they can see what it decided. */
  function openLearned() {
    const rules = store.learnedList();
    if (!rules.length) {
      KN.ui.toast("まだ何も覚えていません");
      return;
    }

    const body = node(html`
      <div class="stack">
        <div class="stack js-rules gap-2"></div>
        <button class="btn btn-soft btn-sm js-forget-all mt-1">すべて忘れる</button>
      </div>
    `);

    let handle = null;
    const rows = body.querySelector(".js-rules");

    function paint() {
      rows.innerHTML = "";
      const list = store.learnedList();
      if (!list.length) { handle && handle.close(); return; }
      list.forEach((r) => {
        const row = node(html`
          <div class="manage-row" style="--cat:${(r.category && r.category.color) || ""}">
            <span class="manage-swatch" style="background:${(r.category && r.category.color) || "transparent"}"></span>
            <span class="manage-name">${r.label}</span>
            <span class="fine-note">
              → ${r.category ? r.category.name : "（消えたカテゴリ）"}
            </span>
            <button class="icon-btn is-danger js-forget" aria-label="この振り分けを忘れる">${icon("close")}</button>
          </div>
        `);
        row.querySelector(".js-forget").addEventListener("click", () => {
          store.forgetCategory(r.key);
          KN.ui.toast(`「${r.label}」を忘れました`);
          paint();
        });
        rows.append(row);
      });
    }
    paint();

    body.querySelector(".js-forget-all").addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "覚えた振り分けを全部忘れますか？",
        message: "商品そのものは消えません。カテゴリの自動判定が、はじめの状態に戻ります。",
        okLabel: "忘れる",
        danger: true,
      });
      if (!ok) return;
      store.forgetAllCategories();
      KN.ui.toast("忘れました");
      handle && handle.close();
    });

    handle = KN.ui.sheet({ title: "おぼえた振り分け", content: body });
  }

  Object.assign(S, { listRows, storesGroup, categoriesGroup });
})();
