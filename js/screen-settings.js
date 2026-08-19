/* =========================================================
   くらしノート — settings screen
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
        ${/* No tab of its own any more. 設定 is not a place you live in — it
              is a drawer you open, change one thing in, and shut. It opens
              from the gear at the right-hand end of every screen's top bar and
              carries its own way back to whichever asked for it. */""}
        <header class="topbar">
          <div class="topbar-row">
            <button class="icon-btn js-back" aria-label="戻る" style="margin-left:-4px">
              ${icon("chevron", "flip-x")}
            </button>
            <h1 class="topbar-title">設定</h1>
          </div>
        </header>
        <div class="js-body"></div>
      </div>
    `);

    root.append(chrome);
    els = { body: chrome.querySelector(".js-body"), topbar: chrome.querySelector(".topbar") };
    chrome.querySelector(".js-back").addEventListener("click", () => KN.backScreen());

    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  /* ---------------- 引き出しは、開けたところのもの ----------------

     設定はタブを持たない引き出しで、どの画面の歯車からも開きます。
     だから中身も、**開けた画面のもの**を出します。ダイエットを見ていて
     歯車を押したのに、店の一覧と商品のカテゴリが最初に出てくるのは、
     引き出しの中で探しものをさせているのと同じです。

     買うものと価格は一つの引き出しを分け合います——同じ棚の表と裏で、
     店もカテゴリも両方から使うものなので。

     どこにも行き止まりは作りません。いちばん下の「ほかの設定も見る」で
     全部が出ます。見せないことと、無くすことは違います。 */
  let showAll = false;

  const scope = () => {
    const from = KN.openedFrom ? KN.openedFrom() : "list";
    if (from === "todo") return "todo";
    if (from === "diet") return "diet";
    return "shop";                       // list / prices は共有
  };

  /* 開け直すたびに、その画面のものへ戻します。
     app.js は render() を先に、onEnter() をあとに呼ぶので、開いた時点では
     まだ前回の showAll のままです。広げたままだったときだけ畳み直します
     （毎回描き直すと、ただの二度手間になるので）。 */
  function onEnter() {
    if (!showAll) return;
    showAll = false;
    render();
  }

  function render() {
    const only = scope();
    els.body.innerHTML = "";
    els.body.append(themeGroup());

    if (showAll || only === "todo") els.body.append(todoGroup());
    if (showAll || only === "shop") {
      els.body.append(storesGroup());
      els.body.append(categoriesGroup());
    }
    if (showAll || only === "diet") els.body.append(dietGroup());

    els.body.append(dataGroup());
    if (!showAll) els.body.append(moreBlock(only));
    els.body.append(aboutBlock());
  }

  const SCOPE_LABEL = { todo: "やること", shop: "買うもの・価格", diet: "ダイエット" };

  /** 隠したものへの入り口。畳んであるだけで、無いわけではないと言うための行。 */
  function moreBlock(only) {
    const others = Object.keys(SCOPE_LABEL).filter((k) => k !== only).map((k) => SCOPE_LABEL[k]);
    const wrap = node(html`
      <section class="settings-group">
        <div class="rows">
          <button class="row js-more">
            <span class="row-main">
              <span class="row-title">ほかの設定も見る</span>
              <span class="row-sub">${others.join("・")}の設定</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
        </div>
      </section>
    `);
    wrap.querySelector(".js-more").addEventListener("click", () => {
      showAll = true;
      render();
      haptic();
    });
    return wrap;
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
        ${/* アイコンの数は「表示」に置きます。数えているのは買うものと
              やることの **両方** なので、どちらか一方のタブのものでは
              ありません（時刻のお知らせは、やることだけの話なので
              あちらへ移しました）。 */""}
        <div class="rows js-badge-rows" hidden style="margin-top:12px">
          <button class="row js-badge">
            <span class="row-main">
              <span class="row-title">アイコンにも数を出す</span>
              <span class="row-sub js-badge-sub"></span>
            </span>
            <span class="row-value js-badge-state"></span>
          </button>
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

    /* Only where there is an icon to badge. In a browser tab the API is not
       there at all, and a switch that does nothing is worse than no switch. */
    const badge = KN.appBadge;
    if (badge && badge.supported()) {
      const rows = wrap.querySelector(".js-badge-rows");
      const state = wrap.querySelector(".js-badge-state");
      const sub = wrap.querySelector(".js-badge-sub");
      rows.hidden = false;

      /* An 「オン」 that is not on is the worst of the three states: the app
         says it is doing something the icon is not showing. iOS drops the
         badge permission on its own — a reset, a tap in 設定 → 通知 — and
         tells the page nothing, so the switch has to be able to say so. */
      const paint = () => {
        const on = badge.enabled();
        const blocked = on && badge.blocked && badge.blocked();
        state.textContent = blocked ? "許可が必要" : (on ? "オン" : "オフ");
        state.style.color = blocked ? "var(--c-danger)"
          : (on ? "var(--c-primary)" : "var(--c-text-3)");
        sub.textContent = blocked
          ? "端末の設定で、このアプリの通知を許可すると出るようになります"
          : (on ? "ホーム画面のアイコンに、今回買うものと、いま手をつけられるやることの数が出ます。時刻を決めたものは、その時刻から数に入ります"
                : "iPhone では、通知の許可を求められます（この設定は数を出すだけです）");
      };
      paint();

      wrap.querySelector(".js-badge").addEventListener("click", async () => {
        haptic();
        if (badge.enabled()) { badge.disable(); paint(); return; }
        const ok = await badge.enable();
        paint();
        if (!ok) {
          KN.ui.toast("端末の設定で通知が許可されていないため、出せませんでした");
        }
      });
    }

    return wrap;
  }


  /* ---------------- やること ----------------

     数を出すのも、時刻を知らせるのも、やることの話です。「表示」に
     混ざっていたのは、どちらも見え方の設定に見えたからですが、
     ダイエットを見ている人には関係がありません。 */

  function todoGroup() {
    const wrap = node(html`
      <section class="settings-group">
        <h2 class="section-title">やること</h2>
        <div class="rows js-notify-rows" hidden>
          <button class="row js-notify">
            <span class="row-main">
              <span class="row-title">やることの時刻を知らせる</span>
              <span class="row-sub js-notify-sub"></span>
            </span>
            <span class="row-value js-notify-state"></span>
          </button>
        </div>
        <p class="section-hint js-none" hidden>この端末で切り替えられる設定はありません。</p>
      </section>
    `);

    /* 時刻のお知らせ。The sub-line says what it actually does, at both
       settings, because 「通知」 on its own would be read as 「19:30 に鳴る」 —
       and it does not ring while the app is closed. Saying that here is the
       difference between a feature and a thing that quietly lets you down. */
    const notify = KN.notify;
    if (notify && notify.supported()) {
      const rows = wrap.querySelector(".js-notify-rows");
      const state = wrap.querySelector(".js-notify-state");
      const sub = wrap.querySelector(".js-notify-sub");
      rows.hidden = false;

      const paint = () => {
        const on = notify.enabled();
        const blocked = on && notify.blocked();
        state.textContent = blocked ? "許可が必要" : (on ? "オン" : "オフ");
        state.style.color = blocked ? "var(--c-danger)"
          : (on ? "var(--c-primary)" : "var(--c-text-3)");
        sub.textContent = blocked
          ? "端末の設定で、このアプリの通知を許可すると出るようになります"
          : (on
              ? "時刻を決めたやることをお知らせします。アプリを閉じているあいだは鳴らず、次に開いたときにまとめて出ます"
              : "アプリを開いているときにお知らせし、閉じていたぶんは開いたときにまとめて出ます");
      };
      paint();

      wrap.querySelector(".js-notify").addEventListener("click", async () => {
        haptic();
        if (notify.enabled()) { notify.disable(); paint(); return; }
        const ok = await notify.enable();
        paint();
        if (!ok) KN.ui.toast("端末の設定で通知が許可されていないため、出せませんでした");
      });
    }


    /* 使えない端末（ブラウザのタブなど）では、見出しだけの空の枠が
       残ります。何も無いことを言うほうが、白い枠より親切です。 */
    if (wrap.querySelector(".js-notify-rows").hidden) {
      wrap.querySelector(".js-none").hidden = false;
    }
    return wrap;
  }

  /* ---------------- stores ---------------- */

  function storesGroup() {
    const stores = store.sortedStores();
    const wrap = node(html`
      <section class="settings-group">
        <h2 class="section-title">お店 <span style="font-weight:600;color:var(--c-text-3)">${stores.length}件</span></h2>
        ${stores.length > 1
          ? html`<p class="section-hint">長押しすると持ち上がります。そのまま動かして並べ替えられます。</p>`
          : ""}
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

    KN.reorder.attach(rows, {
      item: ".manage-row",
      onDrop: (from, to) => KN.reorder.applyOrder(stores, from, to, (s) => s.stores),
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
        <p class="section-hint">長押しすると持ち上がります。そのまま動かして並べ替えられます。</p>
        <div class="stack js-rows" style="gap:8px"></div>
        <button class="btn btn-soft btn-sm js-add">${icon("plus")} カテゴリを追加</button>
      </section>
    `);

    const rows = wrap.querySelector(".js-rows");
    cats.forEach((c) => {
      const used = store.get().products.filter((p) => p.categoryId === c.id).length;
      const row = node(html`
        <div class="manage-row" style="--cat:${c.color || ""}">
          <span class="manage-swatch" style="background:${c.color || "transparent"}"></span>
          <span class="manage-emoji">${c.emoji}</span>
          <span class="manage-name">${c.name}</span>
          <span style="font-size:11px;color:var(--c-text-3);flex:none">${used}商品</span>
          <button class="icon-btn js-edit" aria-label="編集">${icon("edit")}</button>
          ${c.id === store.OTHER_CATEGORY
            ? ""
            : html`<button class="icon-btn is-danger js-del" aria-label="削除">${icon("trash")}</button>`}
        </div>
      `);

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

    KN.reorder.attach(rows, {
      item: ".manage-row",
      onDrop: (from, to) => KN.reorder.applyOrder(cats, from, to, (s) => s.categories),
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
        <div class="field">
          <span class="field-label">絵文字（1文字）</span>
          <!-- No placeholder here. An emoji placeholder paints itself in its
               own colours whatever ::placeholder says, so 🍪 sat in the box
               looking exactly like a value someone had already typed. The
               example belongs outside the box, where nothing can be mistaken
               for the field's contents. -->
          <input class="input js-emoji" value="${cat ? cat.emoji : ""}" maxlength="4"
                 aria-label="絵文字" style="width:100px;text-align:center;font-size:24px">
          <span class="field-hint">例：🍪 🧺 🥫 ／ 空のままなら 🏷️ になります</span>
        </div>
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
    const h = KN.ui.sheet({ title: cat ? "カテゴリの編集" : "カテゴリを追加", content: body, footer: foot });

    foot.addEventListener("click", () => {
      const name = body.querySelector(".js-name").value.trim();
      const emoji = body.querySelector(".js-emoji").value.trim() || "🏷️";
      if (!name) { KN.ui.toast("名前を入力してください"); return; }

      store.update((s) => {
        if (cat) {
          const rec = s.categories.find((x) => x.id === cat.id);
          if (rec) { rec.name = name; rec.emoji = emoji; rec.color = color; }
        } else {
          s.categories.push({
            id: KN.util.uid("c"), name, emoji, color,
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

  function learnedSub() {
    const n = store.learnedList().length;
    return n
      ? `${n}件。カテゴリを手で選ぶたびに増えます`
      : "商品のカテゴリを手で選ぶと、次から同じ名前をそこに入れます";
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
        <p style="font-size:12px;color:var(--c-text-3);line-height:1.6;margin:0 0 8px">
          商品のカテゴリを手で選ぶと、その名前を覚えます。次から同じ名前や、
          それを含む名前は、はじめからそのカテゴリに入ります。
        </p>
        <div class="stack js-rules" style="gap:8px"></div>
        <button class="btn btn-soft btn-sm js-forget-all" style="margin-top:4px">すべて忘れる</button>
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
            <span style="font-size:11px;color:var(--c-text-3);flex:none">
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

  function snapshotSub() {
    const snaps = KN.backup.list();
    if (!snaps.length) return "アプリ内に自動保存された控えはまだありません";
    return `${snaps.length}件・最新 ${snapStamp(snaps[0].at)}`;
  }

  /* ---------------- 記録の書き出し ----------------

     バックアップは「アプリに戻すため」のもので、中身はJSONです。人が読む
     ものでも、AIに渡すものでもありません（買い物の商品や覚えた振り分けまで
     入っています）。

     ここで出すのは **日ごとに一行** の記録です。過去の食事をあとで推し直す、
     一か月ぶんをまとめて読んでもらう——そのための形。文とCSVの二つを
     用意して、コピーもファイル保存もできるようにします。 */

  const EXPORT_SPANS = [
    { id: "30", label: "30日" },
    { id: "month", label: "今月" },
    { id: "last", label: "先月" },
    { id: "all", label: "全部" },
  ];

  function spanRange(id) {
    const U = KN.util;
    const today = U.todayKey();
    const now = U.dayDate(today);
    if (id === "month") {
      return { from: U.dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    }
    if (id === "last") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: U.dayKey(first), to: U.dayKey(last) };
    }
    if (id === "all") {
      const st = store.get().diet;
      const days = []
        .concat(st.weights.map((w) => w.day), st.meals.map((m) => m.day),
                st.health.map((h) => h.day), st.drinks.map((d) => d.day))
        .filter(Boolean).sort();
      return { from: days.length ? days[0] : today, to: today };
    }
    return { from: KN.util.shiftDay(today, -29), to: today };
  }

  function openRecordExport() {
    let span = "30";
    let form = "text";

    const body = node(html`
      <div class="stack">
        <p class="diet-note">
          日ごとの記録（体重・体脂肪・歩数・総消費・睡眠・摂取と推定の幅・お酒・
          食事メモ）を、まとめて書き出します。<b>AIに貼って読んでもらう</b>ときは
          「文」、表計算で見るときは「CSV」。<br>
          バックアップとは別のものです（戻すためのファイルは、上の
          「バックアップを保存」のほうです）。
        </p>
        <div class="js-span"></div>
        <div class="js-form"></div>
        <p class="diet-note js-count"></p>
        <textarea class="textarea js-out" rows="10" readonly aria-label="書き出したもの"></textarea>
      </div>
    `);
    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-file" style="flex:1">${icon("download")}ファイルに保存</button>
        <button class="btn btn-primary js-copy" style="flex:1">${icon("copy")}コピー</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "記録を書き出す", content: body, footer: foot });

    function build() {
      const { from, to } = spanRange(span);
      const rows = KN.diet.exportRows(from, to)
        .filter((r) => KN.diet.EXPORT_COLS.some((c) => c.key !== "day" && r[c.key] != null));
      const text = form === "csv" ? KN.diet.exportCsv(from, to) : KN.diet.exportText(from, to);
      body.querySelector(".js-out").value = text || "この期間には記録がありません。";
      body.querySelector(".js-count").textContent =
        `${from} 〜 ${to}　記録のある日：${rows.length}日ぶん（${text.length.toLocaleString()}文字）`;
      return text;
    }

    function paint() {
      KN.ui.chipRow(body.querySelector(".js-span"), EXPORT_SPANS,
        { activeId: span, onPick: (id) => { span = String(id); paint(); } });
      KN.ui.chipRow(body.querySelector(".js-form"),
        [{ id: "text", label: "文" }, { id: "csv", label: "CSV" }],
        { activeId: form, onPick: (id) => { form = String(id); paint(); } });
      build();
    }
    paint();

    foot.querySelector(".js-copy").addEventListener("click", () => {
      const text = body.querySelector(".js-out").value;
      const done = (ok) => {
        if (ok) { KN.ui.toast("コピーしました"); return; }
        // 断られる端末があります。選んでおいて、長押しから拾えるように。
        const out = body.querySelector(".js-out");
        out.focus();
        try { out.setSelectionRange(0, out.value.length); } catch (err) { /* 読めれば足ります */ }
        KN.ui.toast("自動でコピーできませんでした。欄を長押しでコピーしてください");
      };
      if (!navigator.clipboard || !navigator.clipboard.writeText) { done(false); return; }
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    });

    foot.querySelector(".js-file").addEventListener("click", () => {
      const text = body.querySelector(".js-out").value;
      const ext = form === "csv" ? "csv" : "txt";
      const type = form === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
      /* CSVは Excel が UTF-8 と分かるように BOM を付けます（付けないと
         日本語が化けます）。 */
      const blob = new Blob([form === "csv" ? "﻿" + text : text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const { from, to } = spanRange(span);
      a.href = url;
      a.download = `kurashi-kiroku-${from}_${to}.${ext}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      KN.ui.toast("保存しました");
      h.close();
    });
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

  /* ---------------- ダイエット ---------------- */

  function dietGroup() {
    const d = store.get().diet;
    const aiOn = KN.dietAI.configured();
    const wrap = node(html`
      <section class="settings-group">
        <h2 class="section-title">ダイエット</h2>
        <div class="rows">
          <button class="row js-goal">
            <span class="row-main">
              <span class="row-title">目標</span>
              <span class="row-sub">${d.goal.targetKg == null ? "決めていません"
                : `${d.goal.targetKg}kg${d.goal.targetDay ? " ・ " + KN.util.formatDay(d.goal.targetDay) + "まで" : ""}`}</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
          <button class="row js-auto">
            <span class="row-main">
              <span class="row-title">開いたときに自動で読む</span>
              <span class="row-sub">${store.get().settings.dietAutoSync === false
                ? "オフ"
                : KN.healthRelay.configured()
                  ? "ダイエットを開いた時に、中継所に届いているデータを取り込みます"
                  : "ダイエットを開いた時に、コピー済みの健康データがあれば取り込みます"}</span>
            </span>
            <span class="row-value">${store.get().settings.dietAutoSync === false ? "オフ" : "オン"}</span>
          </button>
          <button class="row js-sync">
            <span class="row-main">
              <span class="row-title">ヘルスケアから取り込む</span>
              <span class="row-sub">${d.sync.lastAt ? `最後の取り込み：${KN.util.formatStamp(d.sync.lastAt)}` : "ショートカットで書き出したものを読みます"}</span>
            </span>
            <span class="row-chevron">${icon("download")}</span>
          </button>
          <button class="row js-relay">
            <span class="row-main">
              <span class="row-title">中継所</span>
              <span class="row-sub">${KN.healthRelay.configured()
                ? `${KN.util.escapeHtml(KN.healthRelay.host())} ・ コピーと貼り付けなしで受け取ります`
                : "未設定（ショートカットを走らせるだけで取り込めるようになります）"}</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
          <button class="row js-ai">
            <span class="row-main">
              <span class="row-title">AIの窓口</span>
              <span class="row-sub">${aiOn ? KN.util.escapeHtml(KN.dietAI.url()) : "未設定（写真の推定とAI相談に使います）"}</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
          <button class="row js-diet-clear">
            <span class="row-main">
              <span class="row-title" style="color:var(--c-danger)">ダイエットの記録を消す</span>
              <span class="row-sub">体重 ${d.weights.length}件・食事 ${d.meals.length}件・ヘルスケア ${d.health.length}件</span>
            </span>
            <span class="row-chevron">${icon("trash")}</span>
          </button>
        </div>
      </section>
    `);

    wrap.querySelector(".js-goal").addEventListener("click", () => KN.screens.diet.openGoalSheet());
    wrap.querySelector(".js-sync").addEventListener("click", () => KN.screens.diet.openSyncSheet());
    wrap.querySelector(".js-auto").addEventListener("click", () => {
      const off = store.get().settings.dietAutoSync === false;
      store.update((s) => { s.settings.dietAutoSync = off; });
      render();
      KN.ui.toast(off ? "開いたときに読みます" : "自動では読みません");
    });
    wrap.querySelector(".js-relay").addEventListener("click", openRelaySheet);
    wrap.querySelector(".js-ai").addEventListener("click", openAiSheet);
    wrap.querySelector(".js-diet-clear").addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "ダイエットの記録を消す",
        message: "体重・食事・ヘルスケアの記録がすべて消えます。買い物リストとやることはそのままです。直前の状態は自動バックアップに残ります。",
        okLabel: "消す", danger: true,
      });
      if (!ok) return;
      store.clearDiet();
      render();
      KN.ui.toast("消しました");
    });
    return wrap;
  }

  /* ---------------- 中継所 ----------------

     この画面は設定であると同時に、**手順書**です。外に置かないのは、
     読む人がiPhoneしか持っていないからで、手順を読むために別の端末を
     開かせるのは本末転倒だからです。

     iPhoneだけで建てるとき、難所は二つあります。

       1. **90行のコードをクリップボードに載せる。** GitHubを開いて、rawを
          出して、全部を選んで、コピーして——指ではここで落ちます。
          だから「コードをコピー」の一つボタンにしました。
       2. **当てられない合言葉を作る。** iPhoneに openssl はありませんし、
          人が思いつく「適当な文字列」は適当ではありません。だから
          アプリが作ります。

     残りは、Cloudflareの画面で貼るだけの作業になります。 */
  /* 「Cloudflareに置く」の行き先。リポジトリの relay/ を指します——
     Cloudflare がそこの wrangler.jsonc を読んで、置き場を作り、
     .dev.vars.example を見て合言葉を尋ねてきます。 */
  const DEPLOY_URL = "https://deploy.workers.cloudflare.com/?url="
    + "https://github.com/rt95k9k468-cmyk/kaimono-note/tree/main/relay";

  function openRelaySheet() {
    // まだ保存していない、この場かぎりの下ごしらえ。
    let draftPath = "";

    const body = node(html`
      <div class="stack">
        <p class="diet-note">
          ショートカットがここへ健康データを置き、くらしノートが受け取ります。
          受け取ったら中継所からは消えるので、同じものを二度読むことはありません。
          読み方は手入力とまったく同じで、増えるのは入口だけです。
        </p>
        <p class="diet-note">
          <b>iPhoneだけで建てられます。</b>パソコンは要りません。下の①〜④を
          順に。Cloudflareの画面はSafariで開いてください（無料・カード不要）。
        </p>

        <div class="divider"></div>
        <div class="section-title">① 道（合言葉）をつくる</div>
        <div class="diet-relaykey">
          <code class="js-path">${draftPath || "（まだ作っていません）"}</code>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-soft js-newpath" style="flex:1">道をつくる</button>
          <button class="btn btn-soft js-copypath" style="flex:1">道をコピー</button>
        </div>
        <p class="diet-note">
          <b>これが合言葉です。</b>知られると、その人も同じ郵便受けを開けられます。
          ②の途中で貼るので、先に作ってコピーしておきます。
        </p>

        <div class="divider"></div>
        <div class="section-title">② 中継所を置く（コピペ不要）</div>
        <a class="btn btn-primary btn-block js-deploy"
           href="${DEPLOY_URL}" target="_blank" rel="noopener">Cloudflareに置く</a>
        <ol class="diet-steps">
          <li>Cloudflareに登録（メールアドレスだけ。カードは要りません）。
            登録済みならそのまま進みます</li>
          <li>GitHubとつなぐ画面が出たら許可する（コードの置き場を読むためです）</li>
          <li><b>RELAY_PATH</b> を聞かれたら、①でコピーした道を<b>ペースト</b></li>
          <li><b>Deploy</b>（Create and deploy）を押す</li>
        </ol>
        <p class="diet-note">
          押すと、コードも<b>置き場（KV）も Cloudflare が自分で用意します</b>。
          コードを貼り付ける必要も、KVを作って結び付ける必要もありません
          （設計図に置き場の番号を書いていないので、「作ってください」の意味になります）。
        </p>
        <p class="diet-note">
          <b>RELAY_PATH を聞かれなかったら</b>、置いたあとに
          <b>Settings → Variables and Secrets → Add</b> で、Type を <b>Secret</b>、
          名前を <code>RELAY_PATH</code> にして置いてください（それから <b>Deploy</b>）。
        </p>

        <p class="diet-note">
          <b>うまくいかないときは、Cloudflareの画面からも同じことができます。</b>
          <b>Create</b> → <b>Import a repository</b> → このアプリのリポジトリ
          （<code>kaimono-note</code>）を選び、<b>Root directory</b> に
          <code>relay</code> と入れて配置します。<b>あなた自身のリポジトリ</b>なので、
          GitHubをつなげば一覧に出ます。
        </p>
        <p class="diet-note">
          置き場（KV）が自動で用意されなかったときだけ、
          <b>Storage &amp; Databases → KV</b> で作って、Workerの
          <b>Settings → Bindings</b> で <code>MAIL</code> という名前に結んでください。
        </p>

        <div class="divider"></div>
        <p class="diet-note">
          <b>コードを手で貼るやり方は、iPhoneでは勧めません。</b>
          編集画面（Edit code）はパソコン向けの部品でできていて、
          指での「すべてを選択 → ペースト」がうまく効かないことがあります。
          上の二つは、どちらも<b>貼り付けを必要としません</b>。
          それでも中身を見たい・手で貼りたいときのために、口だけ残してあります。
        </p>
        <button class="btn btn-soft btn-block js-copycode">中継所のコードをコピー</button>

        <div class="divider"></div>
        <div class="section-title">③ URLをつなげる</div>
        <label class="field">
          <span class="field-label">WorkerのURL（Cloudflareの画面からコピー）</span>
          <input class="input js-base" inputmode="url" autocapitalize="off" spellcheck="false"
                 placeholder="https://kurashi-relay.あなた.workers.dev">
        </label>
        <button class="btn btn-soft btn-block js-join">道をつなげる</button>
        <label class="field">
          <span class="field-label">中継所のURL（これが保存されます）</span>
          <input class="input js-url" inputmode="url" autocapitalize="off" spellcheck="false"
                 placeholder="https://…workers.dev/kn-…"
                 value="${KN.healthRelay.url()}">
        </label>
        <p class="diet-note">
          WorkerのURLは、Cloudflareの Worker の画面の上のほうに出ています
          （<code>…workers.dev</code>）。それを貼って「道をつなげる」を押すと、
          ③で作った道が後ろに付きます。手で打ち継ぐ必要はありません。
        </p>

        <div class="divider"></div>
        <div class="section-title">④ 確かめる</div>
        <button class="btn btn-primary btn-block js-verify">中継所を確かめる</button>
        <div class="js-steps"></div>
        <p class="diet-note js-said">
          置く・取る・消える・道が合言葉になっている——を、この場で一往復して
          確かめます。ここが全部通れば、中継所は正しく建っています。
        </p>
        <p class="diet-note">
          確かめる前に郵便受けを空にするので、もう届いていたデータは
          <b>捨てずに取り込みます</b>（中継所は渡したら消す作りなので、
          覗いて捨てると、その日のぶんを失くすことになります）。
        </p>
      </div>
    `);

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-clear" style="flex:1">外す</button>
        <button class="btn btn-primary js-save" style="flex:1">保存</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "中継所", content: body, footer: foot });

    const said = body.querySelector(".js-said");
    const stepsBox = body.querySelector(".js-steps");
    const urlField = body.querySelector(".js-url");
    const pathLabel = body.querySelector(".js-path");
    const readUrl = () => urlField.value.trim();
    const bad = (v) => v && !/^https:\/\//.test(v);

    /* iOSでは書き込みは通ります（読み取りと違って権限を通らない）。
       それでも黙って失敗させないように、通らなかったら欄に出して
       手で選べるようにします。 */
    function copy(text, what) {
      const ok = () => KN.ui.toast(what + "をコピーしました");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, () => fallback(text, what));
      } else {
        fallback(text, what);
      }
    }
    function fallback(text, what) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:50%;left:4%;width:92%;height:40%;z-index:9999";
      document.body.append(ta);
      ta.select();
      let done = false;
      try { done = document.execCommand("copy"); } catch (err) { done = false; }
      if (done) { ta.remove(); KN.ui.toast(what + "をコピーしました"); return; }
      KN.ui.toast("長押しして「すべてを選択」→「コピー」してください");
      ta.addEventListener("blur", () => ta.remove());
    }

    body.querySelector(".js-copycode").addEventListener("click", () => {
      copy(KN.relayCode, "コード");
    });

    body.querySelector(".js-newpath").addEventListener("click", () => {
      draftPath = KN.healthRelay.makePath();
      pathLabel.textContent = draftPath;
      copy(draftPath, "道");
    });
    body.querySelector(".js-copypath").addEventListener("click", () => {
      if (!draftPath) { KN.ui.toast("先に「道をつくる」を押してください"); return; }
      copy(draftPath, "道");
    });

    body.querySelector(".js-join").addEventListener("click", () => {
      const base = body.querySelector(".js-base").value.trim();
      if (!base) { KN.ui.toast("WorkerのURLを貼ってください"); return; }
      if (bad(base)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
      if (!draftPath && !/\/\S/.test(base.replace(/^https:\/\/[^/]+/, ""))) {
        KN.ui.toast("先に「道をつくる」を押してください"); return;
      }
      urlField.value = KN.healthRelay.joinUrl(base, draftPath);
      KN.ui.toast("つなげました。④で確かめてください");
    });

    /* 確かめるのは、まだ保存していない欄の値です。打ち間違えたURLを
       保存させてから試させるのは順番が逆なので。 */
    body.querySelector(".js-verify").addEventListener("click", () => {
      const v = readUrl();
      if (!v) { KN.ui.toast("先に③でURLをつなげてください"); return; }
      if (bad(v)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
      const btn = body.querySelector(".js-verify");
      btn.disabled = true;
      stepsBox.innerHTML = "";
      said.textContent = "確かめています…";
      KN.healthRelay.selfTest(v).then((r) => {
        said.textContent = r.message;
        stepsBox.innerHTML = "";
        stepsBox.append(node(html`
          <div class="diet-read">
            ${KN.util.raw(r.steps.map((st) => `
              <div class="diet-read-row">
                <span class="diet-read-name">${st.ok ? "✓" : "✗"} ${KN.util.escapeHtml(st.name)}</span>
                <span class="diet-read-day">${KN.util.escapeHtml(st.detail)}</span>
              </div>`).join(""))}
          </div>
        `));
        if (r.ok) KN.screens.diet.render();
      }).catch((err) => {
        said.textContent = "確かめられませんでした（" + (err && err.message || err) + "）";
      }).finally(() => { btn.disabled = false; });
    });

    foot.querySelector(".js-save").addEventListener("click", () => {
      const v = readUrl();
      if (bad(v)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
      KN.healthRelay.setUrl(v);
      h.close(); render();
      KN.ui.toast(v ? "中継所を覚えました" : "中継所を外しました");
    });
    foot.querySelector(".js-clear").addEventListener("click", () => {
      KN.healthRelay.setUrl(""); h.close(); render(); KN.ui.toast("外しました");
    });
  }

  /* 鍵ではなくURLを預かります。ここに鍵を書かせないのは方針ではなく事実で、
     このページの中身は誰でも読めるからです。そのことを画面にも書きます。 */
  function openAiSheet() {
    const body = node(html`
      <div class="stack">
        <label class="field">
          <span class="field-label">窓口のURL（https://…）</span>
          <input class="input js-url" inputmode="url" autocapitalize="off" spellcheck="false"
                 placeholder="https://example.workers.dev/kurashi"
                 value="${KN.dietAI.url()}">
        </label>
        <p class="diet-note">
          APIキーはこのアプリには入れません。ここは静的なページなので、書いた鍵は
          誰にでも読めてしまいます。鍵は窓口の向こう側（Cloudflare Workers など）に
          置いてください。このアプリが送るのは、ダイエットの記録だけです——
          買い物リストとやることは送りません。
        </p>
        <p class="diet-note">窓口が受ける形は README の「AIの窓口」に書いてあります。</p>
      </div>
    `);
    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-clear" style="flex:1">外す</button>
        <button class="btn btn-primary js-save" style="flex:1">保存</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "AIの窓口", content: body, footer: foot });
    foot.querySelector(".js-save").addEventListener("click", () => {
      const v = body.querySelector(".js-url").value.trim();
      if (v && !/^https:\/\//.test(v)) { KN.ui.toast("https:// で始まるURLにしてください"); return; }
      KN.dietAI.setUrl(v);
      h.close(); render();
      KN.ui.toast(v ? "保存しました" : "外しました");
    });
    foot.querySelector(".js-clear").addEventListener("click", () => {
      KN.dietAI.setUrl(""); h.close(); render(); KN.ui.toast("外しました");
    });
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
          ${/* 控えとは別の道です。あちらはアプリに戻すためのぜんぶ、
                こちらは人とAIが読むための、日ごとの表。 */""}
          <button class="row js-records">
            <span class="row-main">
              <span class="row-title">記録を書き出す（AIに渡す用）</span>
              <span class="row-sub">体重・食事・歩数・お酒を、日ごとの表にします</span>
            </span>
            <span class="row-chevron">${icon("copy")}</span>
          </button>
          <button class="row js-snapshots">
            <span class="row-main">
              <span class="row-title">自動バックアップから戻す</span>
              <span class="row-sub">${snapshotSub()}</span>
            </span>
            <span class="row-chevron">${icon("upload")}</span>
          </button>
          <button class="row js-learned">
            <span class="row-main">
              <span class="row-title">おぼえた振り分け</span>
              <span class="row-sub">${learnedSub()}</span>
            </span>
            <span class="row-chevron">${icon("sparkles")}</span>
          </button>
          <button class="row js-sample">
            <span class="row-main">
              <span class="row-title">サンプルデータを入れる</span>
              <span class="row-sub">お試し用のお店と商品を読み込みます</span>
            </span>
            <span class="row-chevron">${icon("sparkles")}</span>
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

    wrap.querySelector(".js-records").addEventListener("click", openRecordExport);
    wrap.querySelector(".js-snapshots").addEventListener("click", openSnapshots);
    wrap.querySelector(".js-learned").addEventListener("click", openLearned);

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
        <div style="font-weight:700;color:var(--c-text-2)">くらしノート</div>
        <div>データはこの端末の中だけに保存されます</div>
        <div style="margin-top:8px">
          スマホのブラウザで「ホーム画面に追加」すると、<br>アプリのように使えます
        </div>
      </div>
    `);
  }

  KN.screens = KN.screens || {};
  KN.screens.settings = { mount, render, onEnter };
})();
