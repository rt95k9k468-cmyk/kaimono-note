/* =========================================================
   くらしノート — settings screen：daily の行（表示・書き出し・年の本）
   土台（紙の重なり・行の部品・PAGES）は screen-settings.js。分け方は
   docs/settings.md の「ファイルの分け方」。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon } = KN.util;
  const store = KN.store;
  const S = KN.settingsParts;
  const { go, TINT, card, foot, navRow, switchRow, pickRow, choose, render } = S;

  /* ---------------- daily ----------------

     ここにあるのは、**見え方**だけです。何を書くか・何を残すかには一切
     関わりません（daily は評価しない画面なので、目標も達成率もここには
     置きません）。人によって、日誌として使うか、集めるものとして使うかが
     はっきり分かれる画面なので、その分かれ目だけを渡します。 */

  const dailySet = (key, value) => {
    store.update((s) => { s.settings[key] = value; });
    render();
  };

  /* 根っこには「あの日」だけを置き、見え方の十行は「表示 ›」、書き出しの
     二行は「書き出し ›」へ。十行を根っこに並べると、daily の歯車から開いた
     一枚が daily の設定だけで埋まり、一般まで遠くなります。 */
  function dailyRows() {
    const s = store.get().settings;
    return [
      card(
        switchRow({
          title: "「あの日」を出す", on: s.showThen !== false,
          onTap: (v) => dailySet("showThen", v),
        })
      ),
      foot("「あの日」は、暦のすぐ下に、何年か前の同じ日に書いたものを一つ出します。同じ日の記録が二年以上あれば、年ごとに一行ずつ。出したくない日は、その日の log の紙で「出さない」にできます。"),
      card(
        navRow({ ico: "list", tint: TINT.look, title: "表示", onTap: () => go("dailyView") }),
        navRow({ ico: "download", tint: TINT.sub, title: "書き出し", onTap: () => go("dailyOut") })
      ),
    ];
  }

  /** 表示（daily の「›」の先）。 */
  function dailyViewRows() {
    const s = store.get().settings;
    const full = s.logFull !== false;
    const entryFull = s.entryFull !== false;
    return [
      card(
        pickRow({
          title: "出す範囲", value: s.dailyScope === "month" ? "月ぜんぶ" : "1日",
          onTap: () => choose({
            title: "Daily Log に出す範囲",
            value: s.dailyScope === "month" ? "month" : "day",
            options: [
              { id: "day",   label: "1日",      note: "暦で選んでいる日だけ" },
              { id: "month", label: "月ぜんぶ", note: "その月を、日ごとに縦へ" },
            ],
            onPick: (v) => dailySet("dailyScope", v),
          }),
        }),
        pickRow({
          title: "見せ方", value: full ? "全文" : "数行",
          onTap: () => choose({
            title: "Daily Log の見せ方", value: full ? "full" : "short",
            options: [
              { id: "full",  label: "全文", note: "書いたものをそのまま" },
              { id: "short", label: "数行", note: "はじめの三行。押せば続きが開く" },
            ],
            onPick: (v) => dailySet("logFull", v === "full"),
          }),
        }),
        pickRow({
          title: "積み上げのメモ", value: entryFull ? "全文" : "数行",
          onTap: () => choose({
            title: "積み上げのメモの見せ方", value: entryFull ? "full" : "short",
            options: [
              { id: "full",  label: "全文", note: "書いたものをそのまま" },
              { id: "short", label: "数行", note: "はじめの三行。押せば全文が開く" },
            ],
            onPick: (v) => dailySet("entryFull", v === "full"),
          }),
        }),
        pickRow({
          title: "上に出すもの", value: s.dailyOrder === "entries" ? "積み上げ" : "Daily Log",
          onTap: () => choose({
            title: "上に出すもの", value: s.dailyOrder === "entries" ? "entries" : "log",
            options: [
              { id: "log",     label: "Daily Log", note: "その日の文を書く使い方に" },
              { id: "entries", label: "積み上げ",  note: "読んだ本や学んだことを集める使い方に" },
            ],
            onPick: (v) => dailySet("dailyOrder", v),
          }),
        })
      ),
      card(
        switchRow({
          title: "起床・就寝の時刻", on: s.showDayTimes !== false,
          onTap: (v) => dailySet("showDayTimes", v),
        }),
        switchRow({
          title: "作成・更新の時刻", on: s.showStamps !== false,
          onTap: (v) => dailySet("showStamps", v),
        })
      ),
      foot("「作成・更新」は、いつ書いていつ直したか（その日の話ではなく、帳簿のほう）。"),
      card(
        switchRow({
          title: "季節のひとこと", on: s.showSeason !== false,
          onTap: (v) => dailySet("showSeason", v),
        })
      ),
      foot("その日の二十四節気と七十二候を、Daily Log の見出しの下に一行。端末の中で計算します。"),
      card(
        switchRow({
          title: "月のまとめを出す", on: s.showDigest !== false,
          onTap: (v) => dailySet("showDigest", v),
        }),
        /* 位置は「上か下か」の決め打ちで、日の間には挟まりません——まとめは
           月ぜんぶの話なので、日の列に混ぜると、どの日の話か分からなくなります。 */
        s.showDigest === false ? null : pickRow({
          title: "まとめの位置", value: s.digestPos === "top" ? "上" : "下",
          onTap: () => choose({
            title: "月のまとめの位置", value: s.digestPos === "top" ? "top" : "bottom",
            options: [
              { id: "top",    label: "上", note: "開いてすぐ、月の姿が目に入る" },
              { id: "bottom", label: "下", note: "まず日を読んで、最後にまとめ" },
            ],
            onPick: (v) => dailySet("digestPos", v),
          }),
        })
      ),
    ];
  }

  /** 書き出し（daily の「›」の先）。年の本はバックアップの一枚から移しました
      ——中身の大半が daily の積み上げと日記なので。置き場は設定のままで、
      daily の画面は変わりません（docs/daily.md の「年の本」）。 */
  function dailyOutRows() {
    return [
      card(
        navRow({
          ico: "download", tint: TINT.sub, title: "月ぶんを書き出す",
          onTap: openMonthExport,
        }),
        navRow({ ico: "book", tint: TINT.sub, title: "年の本", onTap: openYearbook })
      ),
      foot("「年の本」は、一年ぶんの積み上げ・買ったもの・日記を一冊に（印刷・PDF と Markdown）。"),
    ];
  }

  /* 月の書き出しには日記の本文が入ります。日記の写し（js/diary-idb.js）の
     突き合わせが済む前は、写しから戻るはずの本文がまだ入っていないことがあり、
     大きな保存場所を読めない日は本文を出さない日です。daily 画面の月の書き出し
     （bodyBlocked）と同じ門。できないときは理由を言って true を返します。 */
  function monthExportBlocked(what = "月ぶん") {
    const b = KN.diaryIdb ? KN.diaryIdb.body() : "ok";
    if (b === "ok") return false;
    if (b === "loading") {
      KN.ui.toast("日記を読み込んでいるところです。少し待ってから、もう一度押してください");
    } else {
      KN.diaryIdb.retry();
      KN.ui.toast(`日記の保存場所を読めない日なので、${what}は書き出せません（何も書き出していません）`, { duration: 6000 });
    }
    return true;
  }

  /* 書き出す月を選ぶ紙。記録のある月だけを、新しい順に並べます——
     空の月を書き出しても意味がないので、選べるのは中身のある月だけです。 */
  function openMonthExport() {
    if (monthExportBlocked()) return;
    const arc = store.get().archive || { entries: [], days: [] };
    const months = new Set();
    (arc.entries || []).forEach((e) => { if (e.date) months.add(String(e.date).slice(0, 7)); });
    (arc.days || []).forEach((d) => { if (d.date) months.add(String(d.date).slice(0, 7)); });
    const list = [...months].sort().reverse();

    const body = node(html`<div class="stack"><div class="rows js-rows"></div></div>`);
    const rows = body.querySelector(".js-rows");
    if (!list.length) {
      rows.append(node(html`<div class="row"><span class="row-main">
        <span class="row-sub">まだ書いたものがありません。</span></span></div>`));
    }
    let handle = null;
    list.forEach((ym) => {
      const n = store.exportMonth(ym);
      const days = (n.days || []).length, entries = (n.entries || []).length;
      const row = node(html`
        <button class="row">
          <span class="row-main">
            <span class="row-title">${ym.replace("-", "年") + "月"}</span>
            <span class="row-sub">Daily Log ${String(days)}日 ・ 積み上げ ${String(entries)}件</span>
          </span>
          <span class="row-chevron">${icon("download")}</span>
        </button>
      `);
      row.addEventListener("click", () => {
        // 紙を開いたあとで写しの様子が変わることがあるので、押したときにも。
        if (monthExportBlocked()) return;
        downloadJSON(`daily-${ym}.json`, store.exportMonth(ym));
        KN.ui.toast(`${ym} を書き出しました`);
        if (handle) handle.close();
      });
      rows.append(row);
    });

    handle = KN.ui.sheet({ title: "月ぶんを書き出す", content: body });
  }

  /* ---------------- 年の本（R10、js/yearbook.js） ----------------

     一年ぶんを事実だけの一冊に。選べるのは記録のある年だけ（新しい順）。
     本文が入るので、月ぶんと同じ門（突き合わせの前・読めない日は断る）。
     紙に言うのは中身の種類だけで、数は言いません（daily は数えない）。 */
  function openYearbook() {
    if (monthExportBlocked("年の本")) return;
    const list = KN.yearbook.years();
    const body = node(html`
      <div class="stack">
        <p class="set-foot is-flush">
          その年の積み上げ・初めて買ったもの・よく買ったもの・日記を、一冊に
          まとめます。印刷の画面で「PDF に保存」を選べば PDF に。Markdown は
          アプリが無くても読める文字のファイルです。
        </p>
        <div class="js-years"></div>
      </div>
    `);
    if (!list.length) {
      body.querySelector(".js-years").append(node(html`<p class="diet-note">まだ書いたものがありません。</p>`));
      KN.ui.sheet({ title: "年の本", content: body });
      return;
    }
    let year = list.includes(KN.util.todayKey().slice(0, 4)) ? KN.util.todayKey().slice(0, 4) : list[0];
    const paint = () => KN.ui.chipRow(body.querySelector(".js-years"),
      list.map((y) => ({ id: y, label: `${y}年` })),
      { activeId: year, onPick: (id) => { year = String(id); paint(); } });
    paint();

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-md" style="flex:1">${icon("download")}Markdown</button>
        <button class="btn btn-primary js-print" style="flex:1">${icon("book")}印刷・PDF</button>
      </div>
    `);
    KN.ui.sheet({ title: "年の本", content: body, footer: foot });

    foot.querySelector(".js-print").addEventListener("click", () => {
      if (monthExportBlocked("年の本")) return;
      KN.yearbook.print(year);
    });
    foot.querySelector(".js-md").addEventListener("click", () => {
      if (monthExportBlocked("年の本")) return;
      const name = `kurashi-${year}.md`;
      const text = KN.yearbook.markdown(year);
      /* 指で触る端末は共有シートで（ファイルへ保存・メモへ送る）。
         share はタップの流れの中で呼ぶ（手前で await しない）。 */
      const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      let file = null;
      try { file = new File([text], name, { type: "text/markdown" }); } catch (err) { file = null; }
      if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: name }).catch(() => {});
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      KN.ui.toast(`${year}年の本を書き出しました`);
    });
  }

  function downloadJSON(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  Object.assign(S, { dailyRows, dailyViewRows, dailyOutRows });
})();
