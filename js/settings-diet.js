/* =========================================================
   くらしノート — settings screen：health の行（記録の書き出し・取り込み・AIに分析）
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
    /* 数の id は「今日を入れて N 日」。前からある "30" は、これまでどおり
       今日から数えて30日ぶんです。 */
    const n = Math.max(1, Number(id) || 30);
    return { from: U.shiftDay(today, -(n - 1)), to: today };
  }

  function openRecordExport() {
    let span = "30";
    let form = "text";

    const body = node(html`
      <div class="stack">
        <p class="set-foot is-flush">
          AIに貼るときは「文」、表計算で見るときは「CSV」。アプリに戻すための
          ファイルは「バックアップを保存」のほうです。
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

  /* ---------------- ダイエット ----------------

     「ダイエットの記録を消す」はここから外しました。戻せない操作なのに、
     目標や中継所と同じ列に、同じ高さで並んでいたからです。行き先は
     一般 → バックアップ → データを消す（三段奥）。 */

  function dietRows() {
    const s = store.get();
    const d = s.diet;
    const goal = d.goal.targetKg == null
      ? "未設定"
      : `${d.goal.targetKg}kg${d.goal.targetDay
          ? " ・ " + KN.util.formatDay(d.goal.targetDay) + "まで" : ""}`;

    return [
      card(
        switchRow({
          title: "開いたときに自動で読む", on: s.settings.dietAutoSync !== false,
          onTap: (v) => { store.update((x) => { x.settings.dietAutoSync = v; }); render(); },
        }),
        switchRow({
          title: "気づいたことを出す", on: s.settings.showInsight === true,
          onTap: (v) => { store.update((x) => { x.settings.showInsight = v; }); render(); },
        })
      ),
      foot("「気づいたこと」は、体重と食事から読み取れたことを画面に出します。"),
      card(
        navRow({
          ico: "target", tint: TINT.goal, title: "目標", value: goal,
          onTap: () => KN.screens.diet && KN.screens.diet.openGoalSheet(),
        })
      ),
      card(
        navRow({
          ico: "chart", tint: TINT.ai, title: "AIに分析してもらう",
          onTap: openAiAnalyze,
        })
      ),
      foot("歩数・総消費・睡眠・食事・体重・お酒を、期間を選んで一枚の文にします。"
        + "コピーして、お使いのAIに貼ってください（このアプリからは送りません）。"),
      /* バックアップの一枚から移しました。中身はダイエットの記録だけなので。 */
      card(
        navRow({ ico: "copy", tint: TINT.sub, title: "記録を書き出す", onTap: openRecordExport })
      ),
      foot("「記録を書き出す」は、体重・食事・歩数・お酒を日ごとの表にします（AIに渡す用）。"),
      /* 取り込みの三行（ヘルスケア・中継所・AIの窓口）は、建てたあとは
         めったに開かないので「›」の先へ。 */
      card(
        navRow({ ico: "download", tint: TINT.sync, title: "取り込み", onTap: () => go("intake") })
      ),
    ];
  }

  /** 取り込み（health の「›」の先）。 */
  function intakeRows() {
    const d = store.get().diet;
    return [
      card(
        navRow({
          ico: "download", tint: TINT.sync, title: "ヘルスケアから取り込む",
          value: d.sync.lastAt ? KN.util.formatStamp(d.sync.lastAt) : "",
          onTap: () => KN.screens.diet && KN.screens.diet.openSyncSheet(),
        }),
        navRow({
          ico: "route", tint: TINT.relay, title: "中継所",
          value: KN.healthRelay.configured() ? KN.healthRelay.host() : "未設定",
          onTap: () => go("relay"),
        }),
        navRow({
          ico: "sparkles", tint: TINT.ai, title: "AIの窓口",
          value: KN.dietAI.configured() ? "設定済み" : "未設定",
          onTap: S.openAiSheet,
        })
      ),
      foot("中継所を建てると、ショートカットを走らせるだけで歩数や睡眠が入ります。"),
    ];
  }

  /* ---------------- AIに分析してもらう ----------------

     健康の記録を、期間を選んで一枚の文にします。**送りません**——出来た
     ものをコピーして、好きなAIに自分で貼ります。アプリから外へ出す道を
     ここに作らない、というのがこの画面の決めごとです（「AIの窓口」は
     別のもので、あちらは自分で建てた窓口へ聞きにいきます）。

     「記録を書き出す」（すぐ下の行）と似ていますが、
     宛先が違います。あちらは表計算で開く・あとで自分が読み返すためのもの。
     こちらは頭に問いが付き、睡眠の型と食事の中身まで降ります。 */

  const AI_SPANS = [
    { id: "7", label: "7日" },
    { id: "30", label: "30日" },
    { id: "90", label: "90日" },
    { id: "month", label: "今月" },
    { id: "all", label: "全部" },
  ];

  const AI_DETAILS = [
    { id: "summary", label: "合計だけ" },
    { id: "named", label: "品目つき" },
    { id: "full", label: "ぜんぶ" },
  ];

  function openAiAnalyze() {
    let span = "30";
    let detail = "summary";
    let ask = "overview";

    const body = node(html`
      <div class="stack">
        <p class="set-foot is-flush">
          歩数・総消費・睡眠（型まで）・食事・体重・体脂肪・お酒を、一枚の文に
          まとめます。コピーして、お使いのAIに貼って聞いてください。
          このアプリから送ることはしません。
        </p>
        <p class="diet-note">期間</p>
        <div class="js-span"></div>
        <p class="diet-note">詳しさ</p>
        <div class="js-detail"></div>
        <p class="diet-note">聞きたいこと</p>
        <div class="js-ask"></div>
        <textarea class="textarea js-q" rows="2"
          placeholder="自分で書く（書いたら、こちらが使われます）"
          aria-label="聞きたいこと"></textarea>
        <p class="diet-note js-count"></p>
        <textarea class="textarea js-out" rows="10" readonly
          aria-label="書き出したもの"></textarea>
      </div>
    `);
    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn btn-soft js-file" style="flex:1">${icon("download")}ファイルに保存</button>
        <button class="btn btn-primary js-copy" style="flex:1">${icon("copy")}コピー</button>
      </div>
    `);
    const h = KN.ui.sheet({ title: "AIに分析してもらう", content: body, footer: foot });

    /** 打ちかけの問いも拾うので、コピーする直前にも呼びます。 */
    function build() {
      const { from, to } = spanRange(span);
      const typed = body.querySelector(".js-q").value.trim();
      const preset = (KN.diet.AI_ASKS.find((a) => a.id === ask) || {}).text || "";
      const text = KN.diet.aiText(from, to, { detail, question: typed || preset });
      body.querySelector(".js-out").value = text || "この期間には記録がありません。";
      /* 長さは、貼る前に知りたいことです。AIによって入る量が違うので、
         こちらで勝手に切らずに、数だけ見せて決めてもらいます。 */
      const n = text.length;
      body.querySelector(".js-count").textContent = `${from} 〜 ${to}　${n.toLocaleString()}文字`
        + (n > 100000 ? "　長すぎて入りきらないかもしれません。期間を短くするか、詳しさを下げてください。"
          : n > 30000 ? "　AIによっては長いかもしれません。" : "");
      return text;
    }

    function paint() {
      KN.ui.chipRow(body.querySelector(".js-span"), AI_SPANS,
        { activeId: span, onPick: (id) => { span = String(id); paint(); } });
      KN.ui.chipRow(body.querySelector(".js-detail"), AI_DETAILS,
        { activeId: detail, onPick: (id) => { detail = String(id); paint(); } });
      KN.ui.chipRow(body.querySelector(".js-ask"), KN.diet.AI_ASKS,
        { activeId: ask, onPick: (id) => { ask = String(id); paint(); } });
      build();
    }
    paint();

    /* 打っているあいだは組み直しません——全期間だと、一文字ごとに数万字を
       組み直すことになります。欄から離れたときに反映します。 */
    body.querySelector(".js-q").addEventListener("change", build);

    foot.querySelector(".js-copy").addEventListener("click", () => {
      const text = build();
      const done = (ok) => {
        if (ok) { KN.ui.toast("コピーしました"); return; }
        const out = body.querySelector(".js-out");
        out.focus();
        try { out.setSelectionRange(0, out.value.length); } catch (err) { /* 読めれば足ります */ }
        KN.ui.toast("自動でコピーできませんでした。欄を長押しでコピーしてください");
      };
      if (!navigator.clipboard || !navigator.clipboard.writeText) { done(false); return; }
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    });

    foot.querySelector(".js-file").addEventListener("click", () => {
      const text = build();
      const { from, to } = spanRange(span);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kurashi-kenko-${from}_${to}.txt`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      KN.ui.toast("保存しました");
      h.close();
    });
  }

  Object.assign(S, { dietRows, intakeRows });
})();
