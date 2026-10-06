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
      foot("何年か前の同じ日に書いたものを、暦の下に出します。"),
      card(
        navRow({ ico: "list", tint: TINT.look, title: "表示", onTap: () => go("dailyView") }),
        navRow({ ico: "download", tint: TINT.sub, title: "書き出し", onTap: () => go("dailyOut") }),
        navRow({ ico: "lock", tint: TINT.data, title: "ロック",
          value: KN.lock && KN.lock.enabled() ? "オン" : "オフ", onTap: () => go("lock") })
      ),
    ];
  }

  /** ロック（daily とノートの鍵。中身は js/lock.js）。 */
  function lockRows() {
    const L = KN.lock;
    if (!L || !L.supported()) return [foot("この端末では使えません。")];
    const done = () => render();
    const rows = [card(switchRow({
      title: "ロック", on: L.enabled(),
      onTap: (v) => (v ? L.turnOn() : L.turnOff()).then(done),
    }))];
    if (!L.enabled()) return rows;
    const bio = switchRow({
      title: "Face ID・Touch ID", on: L.hasBio(),
      onTap: (v) => { if (v) L.bioOn().then(done); else { L.bioOff(); done(); } },
    });
    bio.hidden = true;
    L.bioAvailable().then((ok) => { bio.hidden = !ok && !L.hasBio(); });
    rows.push(card(
      bio,
      navRow({ ico: "lock", tint: TINT.sub, title: "番号を変える", onTap: () => L.changeCode().then(done) })
    ));
    rows.push(foot("中身は暗号化されません。"));
    return rows;
  }

  /** 表示（daily の「›」の先）。 */
  function dailyViewRows() {
    const s = store.get().settings;
    const full = s.logFull !== false;
    const lines = s.logLines === 3 ? 3 : 5;
    const entryFull = s.entryFull !== false;
    return [
      card(
        pickRow({
          title: "出す範囲", value: s.dailyScope === "month" ? "月ぜんぶ" : "1日",
          onTap: () => choose({
            title: "Daily Log に出す範囲",
            value: s.dailyScope === "month" ? "month" : "day",
            options: [
              { id: "day",   label: "1日" },
              { id: "month", label: "月ぜんぶ" },
            ],
            onPick: (v) => dailySet("dailyScope", v),
          }),
        }),
        pickRow({
          /* 数行は終わりから。行数は logLines（3／5、無ければ5）。logFull はそのまま使う。 */
          title: "見せ方", value: full ? "全文" : `${lines}行`,
          onTap: () => choose({
            title: "Daily Log の見せ方", value: full ? "full" : String(lines),
            options: [
              { id: "full", label: "全文" },
              { id: "3",    label: "3行" },
              { id: "5",    label: "5行" },
            ],
            onPick: (v) => {
              store.update((st) => {
                st.settings.logFull = v === "full";
                if (v !== "full") st.settings.logLines = Number(v);
              });
              render();
            },
          }),
        }),
        pickRow({
          title: "積み上げのメモ", value: entryFull ? "全文" : "数行",
          onTap: () => choose({
            title: "積み上げのメモの見せ方", value: entryFull ? "full" : "short",
            options: [
              { id: "full",  label: "全文" },
              { id: "short", label: "数行" },
            ],
            onPick: (v) => dailySet("entryFull", v === "full"),
          }),
        }),
        pickRow({
          title: "上に出すもの", value: s.dailyOrder === "entries" ? "積み上げ" : "Daily Log",
          onTap: () => choose({
            title: "上に出すもの", value: s.dailyOrder === "entries" ? "entries" : "log",
            options: [
              { id: "log",     label: "Daily Log" },
              { id: "entries", label: "積み上げ" },
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
      card(
        switchRow({
          title: "季節のひとこと", on: s.showSeason !== false,
          onTap: (v) => dailySet("showSeason", v),
        })
      ),
      foot("二十四節気と七十二候を一行。"),
      /* 季節の絵（3.0 の E1）。daily の紙の後ろの、候ごとの色と浮世絵。既定は入。出典は畳んで。 */
      card(
        switchRow({
          title: "季節の絵", on: s.seasonArt !== false,
          onTap: (v) => dailySet("seasonArt", v),
        })
      ),
      KN.seasonArt && KN.seasonArt.credits().length ? S.more("絵の出典", KN.seasonArt.credits()
        .map((c) => `${c.kou}：${c.author}『${c.title}』（${c.holder}）`).join(" ／ ")) : null,
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
              { id: "top",    label: "上" },
              { id: "bottom", label: "下" },
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
        navRow({ ico: "download", tint: TINT.sub, title: "期間を選んで書き出す", onTap: openRangeExport }),
        navRow({ ico: "book", tint: TINT.sub, title: "年の本", onTap: openYearbook })
      ),
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

  /* 期間を選んで書き出す（roadmap-2.0 の V22）。始まりと終わりの日を年・月・日の
     ドラムの小窓で（V27、利用者の声）選び、その間（両端を含む）を月ぶんと同じ形で。既定は今月の一日から今日。
     本文が入るので、月ぶんと同じ門。読む用だけで、バックアップの形には触れない。 */
  function openRangeExport() {
    if (monthExportBlocked("期間ぶん")) return;
    const U = KN.util;
    let to = U.todayKey();
    let from = `${to.slice(0, 7)}-01`;
    const body = node(html`
      <div class="stack">
        <div class="rows">
          <button type="button" class="row js-from">
            <span class="row-main"><span class="row-title">始まり</span></span>
            <span class="row-value js-v"></span>
          </button>
          <button type="button" class="row js-to">
            <span class="row-main"><span class="row-title">終わり</span></span>
            <span class="row-value js-v"></span>
          </button>
        </div>
        <p class="set-foot is-flush js-n"></p>
      </div>
    `);
    const fromEl = body.querySelector(".js-from");
    const toEl = body.querySelector(".js-to");
    const foot = node(html`<button class="btn btn-primary btn-block js-go">${icon("download")}書き出す</button>`);
    const paint = () => {
      fromEl.querySelector(".js-v").textContent = U.formatDay(from);
      toEl.querySelector(".js-v").textContent = U.formatDay(to);
      const n = store.exportRange(from, to);
      body.querySelector(".js-n").textContent = `Daily Log ${n.days.length}日 ・ 積み上げ ${n.entries.length}件`;
      foot.disabled = !n.days.length && !n.entries.length;
    };
    const span = [Math.min(1990, Number(from.slice(0, 4))), Number(to.slice(0, 4))];
    fromEl.addEventListener("click", () => KN.ui.popDate(fromEl, {
      value: from, label: "始まり", years: span,
      onPick: (day) => { from = day; if (to < from) to = from; paint(); },
    }));
    toEl.addEventListener("click", () => KN.ui.popDate(toEl, {
      value: to, label: "終わり", years: span,
      onPick: (day) => { to = day; if (from > to) from = to; paint(); },
    }));
    paint();
    const handle = KN.ui.sheet({ title: "期間を選んで書き出す", content: body, footer: foot });
    foot.addEventListener("click", () => {
      if (monthExportBlocked("期間ぶん")) return;
      downloadJSON(`daily-${from}_${to}.json`, store.exportRange(from, to));
      KN.ui.toast(`${from}〜${to} を書き出しました`);
      handle.close();
    });
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
        <p class="set-foot is-flush">PDF は印刷の画面の「PDF に保存」から。</p>
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

  Object.assign(S, { dailyRows, dailyViewRows, dailyOutRows, lockRows });
})();
