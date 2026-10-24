/* =========================================================
   くらしノート — settings screen：外観・アイコン・困ったときの記録
   土台（紙の重なり・行の部品・PAGES）は screen-settings.js。分け方は
   docs/settings.md の「ファイルの分け方」。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;
  const store = KN.store;
  const S = KN.settingsParts;
  const { TINT, card, head, foot, navRow, switchRow, pickRow, choose, render, copyText } = S;

  /** 写して、言葉を一つ出す（写せなければ欄を出して選んでおく。KN.util.copy）。 */
  function copyOut(text) {
    KN.util.copy(text, { show: true }).then((ok) => KN.ui.toast(ok
      ? "コピーしました" : "コピーできませんでした"));
  }

  /* ---------------- 困ったときの記録（R23、js/errlog.js） ----------------

     アプリの中で起きたエラーの控え（新しい50件）。iPhone で「動かない」が出たとき、
     ここでコピーして次のセッションに貼る。控えは記録の外の鍵にあるので、書き出し・
     自動の控え・Dropbox には乗らない。**コピーする前に、一覧で中身が見える。** */
  const errCount = () => (KN.errlog ? KN.errlog.list().length : 0);
  function errorRows() {
    const list = KN.errlog.list();
    // 開いた記録（js/live-idb.js）。数と番号だけ。localStorage と一緒に消えない側。
    const journal = KN.liveIdb ? KN.liveIdb.journalText() : "";
    const when = (iso) => {
      const d = new Date(iso);
      return isFinite(d) ? `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : "";
    };
    const rows = list.map((r) => node(html`
      <div class="set-row js-err-row">
        <span class="set-title">${r.msg || r.kind}<span class="set-note">${when(r.at)} · ${r.screen || "—"} · ${r.file ? `${r.file}:${r.line || "?"}` : r.kind}${r.n ? ` · ${r.n}回` : ""} · 版 ${r.ver}</span></span>
      </div>
    `));
    return [
      list.length
        ? card(...rows)
        : foot("ありません。"),
      card(navRow({ ico: "copy", tint: TINT.data, title: "コピー", act: true,
        onTap: () => copyText([KN.errlog.text(), journal, KN.todoPast ? KN.todoPast.text() : ""].filter(Boolean).join("\n\n"), "困ったときの記録") })),
      foot("新しい50件まで。日記の中身は残しません。"),
    ];
  }

  /* ---------------- 外観（「›」の先） ---------------- */

  /** 基調色の丸。押すとその場で画面ぜんぶの色が変わります——設定を出たり
      入ったりしないと確かめられない選択は、選びようがないので。 */
  function paintAccents(host) {
    const now = store.get().settings.accent || "orange";
    host.innerHTML = "";
    store.ACCENTS.forEach((a) => {
      const on = a.id === now;
      const b = node(html`
        <button type="button" class="accent-dot ${on ? "is-on" : ""}"
                data-accent="${a.id}" aria-pressed="${String(on)}"
                aria-label="${a.label}" title="${a.label}">
          <span class="accent-swatch" style="background:${a.swatch}"></span>
          <span class="accent-name">${a.label}</span>
        </button>
      `);
      b.addEventListener("click", () => {
        store.update((s) => { s.settings.accent = a.id; });
        KN.app.applyAccent(a.id);
        KN.motion.fire("select", b);
        paintAccents(host);
      });
      host.append(b);
    });
  }

  /* 明るさは、字の札ではなく**小さな画面の絵**で選ぶ（iPhone の「画面表示と明るさ」と同じ形）。
     「ライト」「ダーク」の字より、どう見えるかを先に見せるほうが早い。絵は CSS だけで描き、
     いまの基調色の帯を一本入れる（色を選んだ結果も、ここで一緒に見える）。下に丸い印。 */
  const THEMES = [
    { id: "auto",  label: "自動" },
    { id: "light", label: "ライト" },
    { id: "dark",  label: "ダーク" },
  ];
  function themeCard(theme) {
    const el = node(html`
      <div class="set-card is-pad">
        <div class="theme-picks" role="radiogroup" aria-label="明るさ">
          ${THEMES.map((t) => html`
            <button type="button" class="theme-pick" data-theme="${t.id}" role="radio"
                    aria-checked="${String(theme === t.id)}" aria-pressed="${String(theme === t.id)}">
              <span class="theme-shot is-${t.id}" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="theme-name">${t.label}</span>
              <span class="theme-mark" aria-hidden="true">${icon("check")}</span>
            </button>`)}
        </div>
      </div>
    `);
    el.querySelectorAll(".theme-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.theme;
        if (v === (store.get().settings.theme || "auto")) return;
        store.update((x) => { x.settings.theme = v; });
        KN.app.applyTheme(v);
        haptic();
        render();
      });
    });
    return el;
  }

  /* 文字の大きさは**量**なので、段のある滑り棒（標準・大きめ・特大の三段）。左右に小さな「あ」と
     大きな「あ」。動かすあいだも画面ぜんぶの字がその場で変わり、離したときに預かる（動かしている
     最中に組み直すと、指の下から棒が消える）。「iPhone に合わせる」を入れると棒は
     しまう——端末に任せているあいだ、手で決める段は効かないので（iPhone の設定と同じ並び）。 */
  const SIZES = ["std", "l", "xl"];
  const SIZE_NAMES = { std: "標準", l: "大きめ", xl: "特大" };
  function sizeCard(size) {
    const auto = size === "auto";
    const at = Math.max(0, SIZES.indexOf(size));
    const sw = switchRow({
      title: "iPhone に合わせる", on: auto,
      onTap: (v) => {
        const next = v ? "auto" : "std";
        KN.app.applyTextSize(next);
        store.update((x) => { x.settings.textSize = next; });
      },
    });
    if (auto) return card(sw);
    const slider = node(html`
      <div class="set-row is-slider">
        <span class="set-slide-a is-small" aria-hidden="true">あ</span>
        <input type="range" class="set-range js-size" min="0" max="${SIZES.length - 1}" step="1" value="${at}"
               aria-label="文字の大きさ" aria-valuetext="${SIZE_NAMES[SIZES[at]]}">
        <span class="set-slide-a is-large" aria-hidden="true">あ</span>
      </div>
    `);
    const range = slider.querySelector(".js-size");
    let shown = at;
    const show = () => {
      const i = Number(range.value);
      range.setAttribute("aria-valuetext", SIZE_NAMES[SIZES[i]]);
      if (i !== shown) { shown = i; haptic(); KN.app.applyTextSize(SIZES[i]); }
    };
    range.addEventListener("input", show);
    range.addEventListener("change", () => {
      show();
      range.blur();   // 欄が焦点を持ったままだと、紙の組み直しが止まる（paintLayer の頭）
      const v = SIZES[Number(range.value)];
      if (v !== (store.get().settings.textSize || "std")) store.update((x) => { x.settings.textSize = v; });
    });
    return card(sw, slider);
  }

  function lookRows() {
    const s = store.get().settings;
    const theme = s.theme || "auto";
    const seg = themeCard(theme);

    const accents = node(html`
      <div class="set-card is-pad">
        <div class="accent-row is-grid js-accents" role="group" aria-label="基調色"></div>
      </div>
    `);
    paintAccents(accents.querySelector(".js-accents"));

    /* ホーム画面の絵に数を出せる端末でだけ。ブラウザのタブでは API その
       ものが無く、**何も起きないスイッチは、無いより悪い**ので。 */
    const badge = KN.app.appBadge;
    const canBadge = badge && badge.supported();
    const badgeOn = canBadge && badge.enabled();
    /* 「オン」なのに出ていない、が三つのうちいちばん悪い状態です。iOS は
       許可を自分で落とすことがあり（設定を触った・端末を戻した）、その
       ことをページには何も言いません。だからスイッチ側が言います。 */
    const badgeBlocked = canBadge && badgeOn && badge.blocked && badge.blocked();

    /* 文字の大きさ。明るさと同じで、動かしたその場で画面ぜんぶが変わる
       ——いま読んでいるこの一枚の字で、大きさを確かめられるように。 */
    const sizes = sizeCard(s.textSize || "std");

    /* 書体。どれも字が欠けない三つ（base.css の「書体」の規則）。ボタンは
       自分の書体で名前を出し、押せば文字の大きさと同じく画面ぜんぶが変わる。 */
    const font = s.font || "gothic";
    const fonts = node(html`
      <div class="set-card is-pad">
        <div class="seg">
          <button class="seg-btn" data-font="gothic" aria-pressed="${String(font === "gothic")}">ゴシック</button>
          <button class="seg-btn" data-font="maru"   aria-pressed="${String(font === "maru")}">丸ゴシック</button>
          <button class="seg-btn" data-font="mincho" aria-pressed="${String(font === "mincho")}">明朝</button>
        </div>
      </div>
    `);
    fonts.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.font;
        store.update((x) => { x.settings.font = v; });
        KN.app.applyFont(v);
        haptic();
        render();
      });
    });

    /* 「表示」の六行は、どこに効くかで二つに割った（2026年10月24日）：全タブの**上の帯**（暦・
       これからの二週間・空）と、**一覧**（並べ方・探す窓）。見出しが効く場所を言うので、スイッチの
       題は出るものの名前だけにする（「〜を出す」を六回くり返さない）。 */
    return [
      head("明るさ"), seg,
      head("基調色"), accents,
      head("文字の大きさ"), sizes,
      head("書体"), fonts,
      head("上の帯"),
      card(
        calSwitch(),
        /* 上の帯の「これからの二週間」。既定で畳む（roadmap-3.1 の S4）。 */
        switchRow({
          title: "これからの二週間", on: s.showUpcoming === true,
          onTap: (v) => {
            store.update((x) => { x.settings.showUpcoming = v; });
            render();
          },
        }),
        /* 帯と暦の後ろの空（js/sky.js・docs/sky.md）。既定は出す。 */
        switchRow({
          title: "空の写真", on: s.sky !== false,
          onTap: (v) => {
            store.update((x) => { x.settings.sky = v; });
            render();
          },
        })
      ),
      KN.sky ? S.more("空の写真の出典", "Wikimedia Commons ／ " + KN.sky.credits()
        .map((c) => `${c.name}：${c.author}「${c.title}」${c.license}（${c.url}）`).join(" ／ ")) : null,
      head("一覧"),
      card(
        pickRow({
          title: "並べ方", value: KN.ui.isTiles() ? "タイル" : "リスト",
          onTap: () => choose({
            title: "並べ方", value: KN.ui.isTiles() ? "tiles" : "list",
            options: [
              { id: "list",  label: "リスト" },
              { id: "tiles", label: "タイル" },
            ],
            onPick: () => { KN.ui.toggleLayout(); render(); },
          }),
        }),
        switchRow({
          title: "探す窓をいつも出す", on: s.searchBar === true,
          onTap: (v) => {
            store.update((x) => { x.settings.searchBar = v; });
            render();
          },
        })
      ),
      canBadge ? head("ホーム画面") : null,
      canBadge ? card(
        switchRow({
          title: "アイコンに数を出す", on: badgeOn,
          onTap: async (v) => {
            haptic();
            if (!v) { badge.disable(); render(); return; }
            const ok = await badge.enable();
            render();
            if (!ok) KN.ui.toast("端末の設定で通知が許可されていないため、出せませんでした");
          },
        })
      ) : null,
      badgeBlocked ? foot("端末の設定で通知を許可してください。") : null,
    ];
  }

  /* ---------------- 暦を出すか、しまうか ----------------

     題の右の暦ボタンが各画面から消えたので、その札はここにあります。
     ただし**押すのが唯一の道ではありません**——紙の掴み手を上へ押せば
     暦は消え、下へ引けば戻ります（js/cal-peek.js の三段）。ここは
     「そんな手つきがあると知らない人」のための、もう一つの入口です。

     **全タブで一つです**（2026年9月27日から。docs/shared-header.md）。
     上の帯と暦は全タブで同じ一つ、という作りなので、タブごとの三つの札を
     外観の「表示」に一つだけ置きます。 */
  function calSwitch() {
    const on = store.calPrefs().shown;
    return switchRow({
      title: "暦", on,
      onTap: (v) => { store.setCalPref(null, { shown: v }); render(); },
    });
  }

  /* ---------------- 絵が見つからない言葉 ----------------

     新しい保存領域は増やしません。いま store にある題・食事・商品の名前を、
     画面が実際に引いているのと同じ手順（やること→こと辞書→品物辞書、
     食事→品物辞書のみ）で、開くたびその場で辞書に通すだけです。外れた
     ものだけを、出てきた回数の多い順に並べます。

     手で絵を選んだもの（t.icon / p.icon が付いているもの）は、辞書に
     頼っていないので対象外にします——ここは「自動で当てられなかった
     言葉」の一覧なので。 */

  function collectIconGaps() {
    const s = store.get();
    const T = KN.iconsTodo, P = KN.productIcons;
    if (!T || !P) return [];

    const byKey = new Map(); // "kind\u0000name" -> { name, kind, count }
    const bump = (name, kind) => {
      const k = kind + "\u0000" + name;
      const cur = byKey.get(k);
      if (cur) cur.count++;
      else byKey.set(k, { name, kind, count: 1 });
    };

    (s.todos || []).forEach((t) => {
      if (t.icon) return;
      const title = String(t.title || "").trim();
      if (!title) return;
      if (!(T.findKey(title) || P.findKey(title))) bump(title, "やること");
    });

    (s.diet && s.diet.meals || []).forEach((m) => {
      (m.items || []).forEach((it) => {
        const name = String(it.name || "").trim();
        if (!name) return;
        if (!P.findKey(name)) bump(name, "食事");
      });
    });

    (s.products || []).forEach((p) => {
      if (p.icon) return;
      const name = String(p.name || "").trim();
      if (!name) return;
      const cat = s.categories.find((c) => c.id === p.categoryId)
        || s.categories.find((c) => c.id === store.OTHER_CATEGORY)
        || s.categories[0];
      const hit = P.findKey(name) || (cat && P.findKey(cat.name));
      if (!hit) bump(name, "買うもの");
    });

    return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
  }

  function iconGapsGroup() {
    const gaps = collectIconGaps();
    const wrap = node(html`
      <section class="settings-group">
        <h2 class="set-head is-flush">絵が見つからない言葉</h2>
        ${gaps.length ? html`
          <div class="set-card js-gap-rows"></div>
          <div class="set-card" style="margin-top:12px">
            <button type="button" class="set-row js-gap-copy">
              <span class="set-title">一覧をコピー</span>
              <span class="set-glyph is-plain">${icon("copy")}</span>
            </button>
          </div>
        ` : html`
          <div class="set-card"><p class="set-empty">ありません。</p></div>
        `}
      </section>
    `);

    if (gaps.length) {
      const rows = wrap.querySelector(".js-gap-rows");
      gaps.slice(0, 200).forEach((g) => {
        rows.append(node(html`
          <div class="set-row">
            <span class="set-title">${g.name}<span class="set-note">${g.kind}</span></span>
            <span class="set-val">${g.count}件</span>
          </div>
        `));
      });

      wrap.querySelector(".js-gap-copy").addEventListener("click", () => {
        const text = gaps.map((g) => `${g.name}\t${g.kind}\t${g.count}`).join("\n");
        copyOut(text);
      });
    }

    return wrap;
  }

  /* 「この絵はちがう」の報告。書き込む先は買うもの・やることの絵を
     タップして開く紙（`screen-list.js` / `screen-todo.js`）ですが、
     ここではその置き場所を出すだけです。食事メモの絵は出さなくなった
     ので（キリがなかったので）、いまはこの二画面ぶんです。

     **困りごとは二種類あって、見出しも二つに割ります**（`kind`）。
     「言葉が無い」は上の「絵が見つからない言葉」と近い話に見えますが、
     あちらは辞書に一度も当たらなかった記録を**自動で**拾ったもの、
     こちらは**手で**「この言葉には、まだ正しい絵が無い」と残したもの
     ——絵選び紙で「おまかせにする」を選びながら報告すると、ここに載ります。
     「絵がちがう」は自動では拾えません（辞書は当たっているので）。
     選び直した絵があれば、そのまま次の直しの入力として使えます。

     **送り先はありません。** このアプリが外と話す唯一の口は中継所URLで、
     それは資格情報なので触れません（このファイルの最優先の約束事）。
     だから報告は**この端末に溜まるだけ**——見返す、またはコピーして
     次にお願いするときに渡す先です。 */
  function iconReportsGroup() {
    const screenLabel = { meal: "食事", shop: "買うもの", todo: "やること" };
    const iconLabel = (key) => key ? (KN.productIcons.LABELS[key] || key) : "（絵ナシ）";

    const wrap = node(html`
      <section class="settings-group">
        ${/* 空のときと件があるときで、中身の形がまるごと変わります
              （一覧＋コピー行、か、一行の案内文か）。だから空にするのは
              「入れ物」ではなく、その**中身**——js-rep-body は常に同じ
              一つの要素のまま、中を repaint のたびに詰め替えます。
              前は空のとき要素ごと差し替えていて、二回目の repaint が
              もう外れた要素を触っていました。 */""}
        <div class="js-rep-body"></div>
        <h2 class="set-head is-flush">ことばを確かめる</h2>
        <div class="set-card is-pad">
          <div style="display:flex;gap:8px">
            <input class="input js-rep-text grow" placeholder="例：一本満足バー"
                   autocomplete="off" autocapitalize="off" spellcheck="false">
            <button type="button" class="btn btn-soft js-rep-add">報告する</button>
          </div>
        </div>
      </section>
    `);

    const body = wrap.querySelector(".js-rep-body");

    function copyReports(reports) {
      const text = JSON.stringify(reports.map((r) => (
        { kind: r.kind, screen: r.screen, text: r.text, gotIcon: r.gotIcon, chosen: r.chosen, note: r.note }
      )), null, 1);
      copyOut(text);
    }

    /* 一つの種類ぶん（絵がちがう／言葉が無い）を、見出し・一覧・コピー行の
       ひとかたまりで描きます。二つの見出しが同じ形をしていること・同じ
       手つき（消す・コピー）を持つことを、ここ一か所で保ちます。 */
    function kindBlock(kind, title, emptyText) {
      const reports = (store.get().iconReports || []).filter((r) => r.kind === kind);
      const frag = document.createDocumentFragment();
      frag.append(node(html`<h2 class="set-head is-flush">${title}</h2>`));

      if (!reports.length) {
        frag.append(node(html`<div class="set-card"><p class="set-empty">${emptyText}</p></div>`));
        return frag;
      }

      const rows = node(html`<div class="set-card"></div>`);
      reports.forEach((r) => {
        const detail = kind === "wrong"
          ? `${screenLabel[r.screen] || r.screen || "？"}・いま出る絵：${iconLabel(r.gotIcon)}`
              + (r.chosen ? `・正しくは：${iconLabel(r.chosen)}` : "")
          : `${screenLabel[r.screen] || r.screen || "？"}`;
        const row = node(html`
          <div class="set-row">
            <span class="set-title">${r.text}<span class="set-note">${detail}</span></span>
            <button type="button" class="icon-btn js-rep-del" aria-label="「${r.text}」の報告を消す">${icon("close")}</button>
          </div>
        `);
        row.querySelector(".js-rep-del").addEventListener("click", () => {
          store.removeIconReport(r.id);
          paint();
        });
        rows.append(row);
      });
      frag.append(rows);

      const copyRow = node(html`
        <div class="set-card" style="margin-top:12px">
          <button type="button" class="set-row js-rep-copy">
            <span class="set-title">一覧をコピー</span>
            <span class="set-glyph is-plain">${icon("copy")}</span>
          </button>
        </div>
      `);
      copyRow.querySelector(".js-rep-copy").addEventListener("click", () => copyReports(reports));
      frag.append(copyRow);
      return frag;
    }

    function paint() {
      body.innerHTML = "";
      body.append(kindBlock("wrong", "報告した「絵がちがう」", "ありません。"));
      body.append(kindBlock("missing", "報告した「言葉が無い」", "ありません。"));
    }
    paint();

    wrap.querySelector(".js-rep-add").addEventListener("click", () => {
      const input = wrap.querySelector(".js-rep-text");
      const text = input.value.trim();
      if (!text) return;
      /* どの画面のつもりかを、この欄は知りません（品目にも用事にも
         まだ結びついていない、思いついた言葉を確かめるための入口
         なので）。両方の辞書に聞いて、当たったほうを採ります——こと
         辞書→品物辞書は、やることの絵選び紙と同じ順番です。 */
      const gotIcon = (KN.iconsTodo && KN.iconsTodo.findKey(text)) || KN.productIcons.findKey(text) || "";
      store.addIconReport({ text, screen: "", gotIcon, kind: gotIcon ? "wrong" : "missing" });
      input.value = "";
      paint();
    });

    return wrap;
  }

  Object.assign(S, { errCount, errorRows, lookRows, collectIconGaps, iconGapsGroup, iconReportsGroup });
})();
