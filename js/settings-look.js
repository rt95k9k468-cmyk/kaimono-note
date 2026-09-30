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

  /* ---------------- 困ったときの記録（R23、js/errlog.js） ----------------

     アプリの中で起きたエラーの控え（新しい50件）。iPhone で「動かない」が出たとき、
     ここでコピーして次のセッションに貼る。控えは記録の外の鍵にあるので、書き出し・
     自動の控え・Dropbox には乗らない。**コピーする前に、一覧で中身が見える。** */
  const errCount = () => (KN.errlog ? KN.errlog.list().length : 0);
  function errorRows() {
    const list = KN.errlog.list();
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
        : foot("いまは何もありません。"),
      list.length ? card(navRow({ ico: "copy", tint: TINT.data, title: "コピー",
        onTap: () => copyText(KN.errlog.text(), "困ったときの記録") })) : null,
      foot("アプリの中で起きたエラーと、保存できなかったときの控えです（新しい50件まで）。時刻・版・画面・短い文・ファイルと行だけを持ちます。日記を保存する道で起きたものは、種類だけ。書き出し・バックアップ・Dropbox には乗りません。「すべて削除」で消えます。"),
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

  function lookRows() {
    const s = store.get().settings;
    const theme = s.theme || "auto";

    const seg = node(html`
      <div class="set-card is-pad">
        <div class="seg">
          <button class="seg-btn" data-theme="auto"  aria-pressed="${String(theme === "auto")}">自動</button>
          <button class="seg-btn" data-theme="light" aria-pressed="${String(theme === "light")}">ライト</button>
          <button class="seg-btn" data-theme="dark"  aria-pressed="${String(theme === "dark")}">ダーク</button>
        </div>
      </div>
    `);
    seg.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.theme;
        store.update((x) => { x.settings.theme = v; });
        KN.app.applyTheme(v);
        haptic();
        render();
      });
    });

    const accents = node(html`
      <div class="set-card is-pad">
        <div class="accent-row js-accents" role="group" aria-label="基調色"></div>
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

    /* 文字の大きさ。明るさと同じで、押したその場で画面ぜんぶが変わる
       ——いま読んでいるこの一枚の字で、大きさを確かめられるように。 */
    const size = s.textSize || "std";
    const sizes = node(html`
      <div class="set-card is-pad">
        <div class="seg">
          <button class="seg-btn" data-size="std"  aria-pressed="${String(size === "std")}">標準</button>
          <button class="seg-btn" data-size="l"    aria-pressed="${String(size === "l")}">大きめ</button>
          <button class="seg-btn" data-size="xl"   aria-pressed="${String(size === "xl")}">特大</button>
          <button class="seg-btn" data-size="auto" aria-pressed="${String(size === "auto")}">端末</button>
        </div>
      </div>
    `);
    sizes.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.size;
        store.update((x) => { x.settings.textSize = v; });
        KN.app.applyTextSize(v);
        haptic();
        render();
      });
    });

    return [
      head("明るさ"), seg,
      head("基調色"), accents,
      head("文字の大きさ"), sizes,
      foot("「端末」は iPhone の設定の「文字サイズ」に合わせます。"),
      head("表示"),
      card(
        pickRow({
          title: "並べ方", value: KN.ui.isTiles() ? "タイル" : "リスト",
          onTap: () => choose({
            title: "並べ方", value: KN.ui.isTiles() ? "tiles" : "list",
            options: [
              { id: "list",  label: "リスト", note: "一行に一つ。名前が読みやすい" },
              { id: "tiles", label: "タイル", note: "絵を大きく、三つずつ" },
            ],
            onPick: () => { KN.ui.toggleLayout(); render(); },
          }),
        }),
        switchRow({
          title: "探す窓を出しておく", on: s.searchBar === true,
          onTap: (v) => {
            store.update((x) => { x.settings.searchBar = v; });
            render();
          },
        }),
        calSwitch()
      ),
      foot("並べ方は、買うもの・価格・やることの三つが分け合います。探す窓を出さないときは、虫めがねを押すと出ます。暦は、どのタブでも同じものが出ます。"),
      canBadge ? card(
        switchRow({
          title: "アイコンにも数を出す", on: badgeOn,
          onTap: async (v) => {
            haptic();
            if (!v) { badge.disable(); render(); return; }
            const ok = await badge.enable();
            render();
            if (!ok) KN.ui.toast("端末の設定で通知が許可されていないため、出せませんでした");
          },
        })
      ) : null,
      canBadge ? foot(badgeBlocked
        ? "許可が要ります。端末の設定で、このアプリの通知を許可してください。"
        : "ホーム画面の絵に、今回買うものと、いま手をつけられるやることの数が出ます。") : null,
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
      title: "暦を出す", on,
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
          <p class="set-foot is-flush">辞書に当たらなかった言葉です。コピーして伝えていただくと、辞書に足せます。</p>
        ` : html`
          <div class="set-card"><p class="set-empty">いまのところ、ありません。</p></div>
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
        const ok = () => KN.ui.toast("コピーしました");
        const fallback = () => {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.cssText = "position:fixed;top:50%;left:4%;width:92%;height:40%;z-index:9999";
          document.body.append(ta);
          ta.select();
          let done = false;
          try { done = document.execCommand("copy"); } catch (err) { done = false; }
          if (done) { ta.remove(); ok(); return; }
          KN.ui.toast("長押しして「すべてを選択」→「コピー」してください");
          ta.addEventListener("blur", () => ta.remove());
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok, fallback);
        } else {
          fallback();
        }
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
            <input class="input js-rep-text" placeholder="例：一本満足バー" style="flex:1"
                   autocomplete="off" autocapitalize="off" spellcheck="false">
            <button type="button" class="btn btn-soft js-rep-add">報告する</button>
          </div>
        </div>
        <p class="set-foot is-flush">辞書に当たれば「絵がちがう」、当たらなければ「言葉が無い」に、自分で振り分けます。送り先はありません。次にお願いするときに、コピーして渡すための控えです。</p>
      </section>
    `);

    const body = wrap.querySelector(".js-rep-body");

    function copyReports(reports) {
      const text = JSON.stringify(reports.map((r) => (
        { kind: r.kind, screen: r.screen, text: r.text, gotIcon: r.gotIcon, chosen: r.chosen, note: r.note }
      )), null, 1);
      const ok = () => KN.ui.toast("コピーしました");
      const fallback = () => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:50%;left:4%;width:92%;height:40%;z-index:9999";
        document.body.append(ta);
        ta.select();
        let done = false;
        try { done = document.execCommand("copy"); } catch (err) { done = false; }
        if (done) { ta.remove(); ok(); return; }
        KN.ui.toast("長押しして「すべてを選択」→「コピー」してください");
        ta.addEventListener("blur", () => ta.remove());
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, fallback);
      } else {
        fallback();
      }
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
      body.append(kindBlock("wrong", "報告した「絵がちがう」", "いまのところ、ありません。"));
      body.append(kindBlock("missing", "報告した「言葉が無い」", "いまのところ、ありません。"));
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
