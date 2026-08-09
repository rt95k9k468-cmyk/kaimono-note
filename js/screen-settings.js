/* =========================================================
   かいものノート — settings screen
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic, formatDate } = KN.util;
  const store = KN.store;

  let root = null;
  let els = {};

  function mount(el) {
    root = el;
    root.innerHTML = "";

    const chrome = node(html`
      <div class="stack">
        <header class="topbar">
          <div class="topbar-row">
            <h1 class="topbar-title">設定</h1>
          </div>
        </header>
        <div class="js-body"></div>
      </div>
    `);

    root.append(chrome);
    els = { body: chrome.querySelector(".js-body"), topbar: chrome.querySelector(".topbar") };

    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  function render() {
    els.body.innerHTML = "";
    els.body.append(themeGroup());
    els.body.append(storesGroup());
    els.body.append(categoriesGroup());
    els.body.append(dataGroup());
    els.body.append(aboutBlock());
  }

  /* ---------------- theme ---------------- */

  function themeGroup() {
    const current = store.get().settings.theme || "auto";
    const wrap = node(html`
      <section class="settings-group">
        <h2 class="section-title">表示</h2>
        <div class="seg">
          <button class="seg-btn" data-theme="auto"  aria-pressed="${String(current === "auto")}">自動</button>
          <button class="seg-btn" data-theme="light" aria-pressed="${String(current === "light")}">ライト</button>
          <button class="seg-btn" data-theme="dark"  aria-pressed="${String(current === "dark")}">ダーク</button>
        </div>
      </section>
    `);

    wrap.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const theme = btn.dataset.theme;
        store.update((s) => { s.settings.theme = theme; });
        KN.applyTheme(theme);
        haptic();
      });
    });
    return wrap;
  }

  /* ---------------- stores ---------------- */

  function storesGroup() {
    const stores = store.sortedStores();
    const wrap = node(html`
      <section class="settings-group">
        <h2 class="section-title">お店 <span style="font-weight:600;color:var(--c-text-3)">${stores.length}件</span></h2>
        <div class="stack js-rows" style="gap:8px"></div>
        <button class="btn btn-soft btn-sm js-add">${icon("plus")} お店を追加</button>
      </section>
    `);

    const rows = wrap.querySelector(".js-rows");
    if (!stores.length) {
      rows.append(node(html`
        <p style="font-size:13px;color:var(--c-text-3);line-height:1.6">
          お店を登録すると、商品ごとに値段を記録して比べられます。
        </p>
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
          <span style="font-size:11px;color:var(--c-text-3);flex:none">${usage}件の価格</span>
          <button class="icon-btn js-edit" aria-label="編集">${icon("edit")}</button>
          <button class="icon-btn is-danger js-del" aria-label="削除">${icon("trash")}</button>
        </div>
      `);

      row.querySelector(".js-edit").addEventListener("click", () => editStore(st));
      row.querySelector(".js-del").addEventListener("click", async () => {
        const ok = await KN.ui.confirm({
          title: "お店を削除しますか？",
          message: `「${st.name}」と、この店で登録した${usage}件の価格が削除されます。`,
          okLabel: "削除する",
          danger: true,
        });
        if (!ok) return;
        store.update((s) => {
          s.stores = s.stores.filter((x) => x.id !== st.id);
          s.products.forEach((p) => { p.prices = p.prices.filter((pr) => pr.storeId !== st.id); });
        });
        KN.ui.toast("削除しました");
      });

      rows.append(row);
    });

    wrap.querySelector(".js-add").addEventListener("click", async () => {
      const name = await KN.ui.prompt({ title: "お店を追加", label: "お店の名前", placeholder: "例：イオン 〇〇店" });
      if (!name) return;
      if (store.findStoreByName(name)) { KN.ui.toast("同じ名前のお店があります"); return; }
      store.addStore(name);
      KN.ui.toast("追加しました");
    });

    return wrap;
  }

  function editStore(st) {
    const body = node(html`
      <div class="stack" style="gap:18px">
        <label class="field">
          <span class="field-label">お店の名前</span>
          <input class="input js-name" value="${st.name}">
        </label>
        <div class="field">
          <span class="field-label">色</span>
          <div class="swatches js-swatches"></div>
        </div>
      </div>
    `);

    let color = st.color;
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

    const foot = node(html`<button class="btn btn-primary btn-block">保存</button>`);
    const h = KN.ui.sheet({ title: "お店の編集", content: body, footer: foot });

    foot.addEventListener("click", () => {
      const name = body.querySelector(".js-name").value.trim();
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
        <h2 class="section-title">カテゴリ <span style="font-weight:600;color:var(--c-text-3)">${cats.length}件</span></h2>
        <div class="stack js-rows" style="gap:8px"></div>
        <button class="btn btn-soft btn-sm js-add">${icon("plus")} カテゴリを追加</button>
      </section>
    `);

    const rows = wrap.querySelector(".js-rows");
    cats.forEach((c, idx) => {
      const used = store.get().products.filter((p) => p.categoryId === c.id).length;
      const row = node(html`
        <div class="manage-row">
          <span class="manage-emoji">${c.emoji}</span>
          <span class="manage-name">${c.name}</span>
          <span style="font-size:11px;color:var(--c-text-3);flex:none">${used}商品</span>
          <button class="icon-btn js-up" aria-label="上へ" ${idx === 0 ? KN.util.raw("disabled") : ""}
                  style="${idx === 0 ? "opacity:.3" : ""}">${icon("chevron", "rot-up")}</button>
          <button class="icon-btn js-edit" aria-label="編集">${icon("edit")}</button>
          ${c.id === store.OTHER_CATEGORY
            ? ""
            : html`<button class="icon-btn is-danger js-del" aria-label="削除">${icon("trash")}</button>`}
        </div>
      `);

      row.querySelector(".js-up").style.transform = "rotate(-90deg)";

      row.querySelector(".js-up").addEventListener("click", () => {
        if (idx === 0) return;
        const prev = cats[idx - 1];
        store.update((s) => {
          const a = s.categories.find((x) => x.id === c.id);
          const b = s.categories.find((x) => x.id === prev.id);
          if (a && b) { const t = a.order; a.order = b.order; b.order = t; }
        });
      });

      row.querySelector(".js-edit").addEventListener("click", () => editCategory(c));

      const del = row.querySelector(".js-del");
      if (del) {
        del.addEventListener("click", async () => {
          const ok = await KN.ui.confirm({
            title: "カテゴリを削除しますか？",
            message: used > 0
              ? `${used}件の商品は「その他」に移動します。`
              : "このカテゴリを削除します。",
            okLabel: "削除する",
            danger: true,
          });
          if (!ok) return;
          store.update((s) => {
            s.categories = s.categories.filter((x) => x.id !== c.id);
            s.products.forEach((p) => {
              if (p.categoryId === c.id) p.categoryId = store.OTHER_CATEGORY;
            });
          });
          KN.ui.toast("削除しました");
        });
      }

      rows.append(row);
    });

    wrap.querySelector(".js-add").addEventListener("click", () => editCategory(null));
    return wrap;
  }

  function editCategory(cat) {
    const body = node(html`
      <div class="stack" style="gap:18px">
        <label class="field">
          <span class="field-label">名前</span>
          <input class="input js-name" value="${cat ? cat.name : ""}" placeholder="例：おやつ">
        </label>
        <label class="field">
          <span class="field-label">絵文字（1文字）</span>
          <input class="input js-emoji" value="${cat ? cat.emoji : ""}" placeholder="🍪" maxlength="4" style="width:100px;text-align:center;font-size:24px">
        </label>
      </div>
    `);

    const foot = node(html`<button class="btn btn-primary btn-block">${cat ? "保存" : "追加"}</button>`);
    const h = KN.ui.sheet({ title: cat ? "カテゴリの編集" : "カテゴリを追加", content: body, footer: foot });

    foot.addEventListener("click", () => {
      const name = body.querySelector(".js-name").value.trim();
      const emoji = body.querySelector(".js-emoji").value.trim() || "🏷️";
      if (!name) { KN.ui.toast("名前を入力してください"); return; }

      store.update((s) => {
        if (cat) {
          const rec = s.categories.find((x) => x.id === cat.id);
          if (rec) { rec.name = name; rec.emoji = emoji; }
        } else {
          s.categories.push({
            id: KN.util.uid("c"), name, emoji,
            order: Math.max(-1, ...s.categories.map((x) => x.order ?? 0)) + 1,
          });
        }
      });
      h.close();
      KN.ui.toast(cat ? "保存しました" : "追加しました");
    });
  }

  /* ---------------- data ---------------- */

  function exportSub(st) {
    const last = KN.backup.lastExportAt();
    const size = `${st.products.length}商品・${st.stores.length}店舗`;
    if (!last) return `${size}をJSONで書き出します`;
    return `${size}／前回 ${formatDate(last)}`;
  }

  /** Several snapshots can land on one day (削除前, 復元前…), so the clock
      time is what actually tells them apart when recovering from a slip. */
  function snapStamp(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${formatDate(iso)} ${hh}:${mm}`;
  }

  function snapshotSub() {
    const snaps = KN.backup.list();
    if (!snaps.length) return "アプリ内に自動保存された控えはまだありません";
    return `${snaps.length}件・最新 ${snapStamp(snaps[0].at)}`;
  }

  /** Pick one of the app's own rolling snapshots and roll back to it. */
  function openSnapshots() {
    const snaps = KN.backup.list();
    if (!snaps.length) {
      KN.ui.toast("まだ控えがありません");
      return;
    }

    const body = node(html`
      <div class="stack">
        <p style="font-size:12px;color:var(--c-text-3);line-height:1.6;margin:0 0 8px">
          アプリが自動で残している控えです。この端末の中にだけ保存されるため、
          機種変更や端末の紛失には備えられません。そなえるには「バックアップを保存」で
          ファイルを書き出してください。
        </p>
        <div class="rows js-snaps"></div>
      </div>
    `);

    let sheetHandle = null;
    const rows = body.querySelector(".js-snaps");
    snaps.forEach((s) => {
      const row = node(html`
        <button class="row">
          <span class="row-main">
            <span class="row-title">${snapStamp(s.at)}（${s.reason}）</span>
            <span class="row-sub">${s.summary.products}商品・${s.summary.stores}店舗・リスト${s.summary.items}件</span>
          </span>
          <span class="row-chevron">${icon("chevron")}</span>
        </button>
      `);
      row.addEventListener("click", async () => {
        const ok = await KN.ui.confirm({
          title: "この時点に戻しますか？",
          message: "いまのデータは置き換わります。戻す直前の状態も控えに残すので、やり直せます。",
          okLabel: "戻す",
          danger: true,
        });
        if (!ok) return;
        try {
          KN.backup.restore(s.at);
          KN.ui.toast(`${snapStamp(s.at)} の状態に戻しました`);
          if (sheetHandle) sheetHandle.close();
        } catch (err) {
          console.error(err);
          KN.ui.toast("戻せませんでした");
        }
      });
      rows.append(row);
    });

    sheetHandle = KN.ui.sheet({ title: "自動バックアップ", content: body });
  }

  function dataGroup() {
    const st = store.get();
    const wrap = node(html`
      <section class="settings-group">
        <h2 class="section-title">データ</h2>
        <div class="rows">
          <button class="row js-export">
            <span class="row-main">
              <span class="row-title">バックアップを保存</span>
              <span class="row-sub">${exportSub(st)}</span>
            </span>
            <span class="row-chevron">${icon("download")}</span>
          </button>
          <button class="row js-import">
            <span class="row-main">
              <span class="row-title">バックアップから復元</span>
              <span class="row-sub">書き出したJSONを読み込みます</span>
            </span>
            <span class="row-chevron">${icon("upload")}</span>
          </button>
          <button class="row js-snapshots">
            <span class="row-main">
              <span class="row-title">自動バックアップから戻す</span>
              <span class="row-sub">${snapshotSub()}</span>
            </span>
            <span class="row-chevron">${icon("upload")}</span>
          </button>
          <button class="row js-sample">
            <span class="row-main">
              <span class="row-title">サンプルデータを入れる</span>
              <span class="row-sub">お試し用のお店と商品を読み込みます</span>
            </span>
            <span class="row-chevron">${icon("sparkles")}</span>
          </button>
          <button class="row js-vvdebug">
            <span class="row-main">
              <span class="row-title">画面サイズの数値を出す</span>
              <span class="row-sub">${KN.vvDebugOn && KN.vvDebugOn()
                ? "表示中。入力欄をタップした状態のスクリーンショットが手がかりになります"
                : "入力バーの位置ずれを調べるための一時的な表示です"}</span>
            </span>
            <span class="row-chevron">${icon("search")}</span>
          </button>
          <button class="row js-reset">
            <span class="row-main">
              <span class="row-title" style="color:var(--c-danger)">すべて削除</span>
              <span class="row-sub">リスト・商品・価格・お店をすべて消します</span>
            </span>
            <span class="row-chevron">${icon("trash")}</span>
          </button>
        </div>
        <input type="file" accept="application/json,.json" class="js-file" hidden>
      </section>
    `);

    wrap.querySelector(".js-export").addEventListener("click", () => {
      const blob = new Blob([store.exportJSON()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      a.href = url;
      a.download = `kaimono-note-${stamp}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      KN.backup.markExported();
      KN.ui.toast("バックアップを保存しました");
    });

    wrap.querySelector(".js-snapshots").addEventListener("click", openSnapshots);

    wrap.querySelector(".js-vvdebug").addEventListener("click", () => {
      KN.setVvDebug(!(KN.vvDebugOn && KN.vvDebugOn()));
    });

    const file = wrap.querySelector(".js-file");
    wrap.querySelector(".js-import").addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const ok = await KN.ui.confirm({
        title: "復元しますか？",
        message: "いまのデータはすべて置き換わります。直前の状態は自動バックアップに残ります。",
        okLabel: "復元する",
        danger: true,
      });
      file.value = "";
      if (!ok) return;
      try {
        KN.backup.snapshot("復元前");
        store.importJSON(await f.text());
        KN.ui.toast("復元しました");
      } catch (err) {
        console.error(err);
        KN.ui.toast("読み込めませんでした（ファイル形式を確認してください）");
      }
    });

    wrap.querySelector(".js-sample").addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "サンプルを入れますか？",
        message: "いまのデータはすべて置き換わります。",
        okLabel: "入れる",
        danger: true,
      });
      if (!ok) return;
      KN.backup.snapshot("サンプル読込前");
      store.loadSample();
      KN.ui.toast("サンプルを読み込みました");
    });

    wrap.querySelector(".js-reset").addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "すべて削除しますか？",
        message: "買い物リスト・商品・価格・お店の記録がすべて消えます。直前の状態は自動バックアップに残るので、あとから戻せます。",
        okLabel: "削除する",
        danger: true,
      });
      if (!ok) return;
      KN.backup.snapshot("削除前");
      store.reset();
      KN.ui.toast("すべて削除しました");
    });

    return wrap;
  }

  function aboutBlock() {
    return node(html`
      <div class="about">
        <div style="font-size:28px;margin-bottom:4px">🛒</div>
        <div style="font-weight:700;color:var(--c-text-2)">かいものノート</div>
        <div>データはこの端末の中だけに保存されます</div>
        <div style="margin-top:8px">
          スマホのブラウザで「ホーム画面に追加」すると、<br>アプリのように使えます
        </div>
      </div>
    `);
  }

  KN.screens = KN.screens || {};
  KN.screens.settings = { mount, render };
})();
