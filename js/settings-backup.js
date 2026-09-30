/* =========================================================
   くらしノート — settings screen：バックアップ（保存・確かめる・復元・Dropbox・使用量・日記の取り込み・データを消す）
   土台（紙の重なり・行の部品・PAGES）は screen-settings.js。分け方は
   docs/settings.md の「ファイルの分け方」。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, formatDate } = KN.util;
  const store = KN.store;
  const S = KN.settingsParts;
  const { go, TINT, card, foot, navRow, dangerRow, render, fieldCard } = S;

  /* ---------------- data ---------------- */

  /* 前は「◯商品・◯店舗をJSONで書き出します」で、やること・daily・
     ダイエットも入っていることが伝わりませんでした。 */
  function exportSub() {
    const last = KN.backup.lastExportAt();
    const what = "買うもの・やること・daily・ダイエット・設定を、一つのファイルにまとめて書き出します";
    if (!last) return `${what}。`;
    return `${what}。前回 ${snapStamp(last)}（保存できたと確かめた書き出し）。`;
  }

  /** 記録の数を一行で。控えの一覧・復元の確認・書き出しの確かめで使います。 */
  function countText(c) {
    return `商品 ${c.products}・やること ${c.todos}・daily ${c.days}日・積み上げ ${c.entries}・ダイエット ${c.diet}`;
  }

  /* 記録の点検（R28、js/audit.js）。数えるだけで、記録は変えません。
     ファイルは reconcile() を通す前の中身を見ます——読み込むときに直るもの
     （持ち主の無い品物を外す、など）も「このファイルの食い違い」なので。
     古い形（v1）は形が違うので数えません。 */
  function auditOfText(text) {
    if (!KN.audit) return null;
    try {
      const raw = JSON.parse(text);
      return raw && raw.schema >= 2 ? KN.audit.check(raw) : null;
    } catch (err) { return null; }
  }
  function auditText(a) {
    if (!a || !a.total) return "";
    const parts = KN.audit.LABELS.filter(([k]) => a[k]).map(([k, label]) => `${label} ${a[k]}`);
    return `このファイルには食い違いが${a.total}件あります（${parts.join("・")}）。`;
  }

  /** 字数を「約◯万字」で。小さいときは、細かく言わない。 */
  function charText(n) {
    if (n < 10000) return "1万字未満";
    return `約${(n / 10000).toFixed(n < 100000 ? 1 : 0)}万字`;
  }

  /* 戻せない操作の前の控え。**取れなかったら、進む前に知らせます。**
     確認の文は「直前の状態は自動バックアップに残る」と約束しているので、
     残らなかったのに黙って進むと、その約束が嘘になります。"same"（同じ
     中身がもう控えにある）と "empty"（守るものが無い）は、取れたのと同じ。 */
  async function keepBefore(reason) {
    if ((await KN.backup.take(reason)) !== "failed") return true;
    return KN.ui.confirm({
      title: "控えを取れませんでした",
      message: "空き容量が足りず、いまの状態を自動バックアップに残せませんでした。このまま進むと、元に戻せません。先に「バックアップを保存」でファイルに書き出すことをおすすめします。",
      okLabel: "それでも進む", cancelLabel: "やめる", danger: true,
    });
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
    /* どこまで戻せるかを言います。件数だけでは「いつまで遡れるか」が
       分からず、いざというときに開いてみるまで分かりません。 */
    const oldest = snaps[snaps.length - 1];
    return `${snaps.length}件・最新 ${snapStamp(snaps[0].at)}`
      + (snaps.length > 1 ? `（${snapStamp(oldest.at)} まで戻せます）` : "");
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
        <p class="set-foot is-flush">この端末の中だけの控えです。機種変更にそなえるには「バックアップを保存」を。</p>
        <div class="rows js-snaps"></div>
      </div>
    `);

    let sheetHandle = null;
    const rows = body.querySelector(".js-snaps");
    snaps.forEach((s) => {
      // 2026年9月26日より前に取った控えは、買うものの数しか持っていません。
      const sub = s.summary.todos == null
        ? `${s.summary.products}商品・${s.summary.stores}店舗・リスト${s.summary.items}件`
        : countText(s.summary);
      const row = node(html`
        <button class="row">
          <span class="row-main">
            <span class="row-title">${snapStamp(s.at)}（${s.reason}）</span>
            <span class="row-sub">${sub}</span>
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
          try {
            await KN.backup.restore(s.at);
          } catch (err) {
            if (err.code !== "keep-failed") throw err;
            // 戻す前の控えが取れなかった。黙って戻すと、いまの状態へは戻れない。
            const go = await KN.ui.confirm({
              title: "控えを取れませんでした",
              message: "空き容量が足りず、戻す前の状態を控えに残せませんでした。このまま戻すと、いまの状態へはやり直せません。",
              okLabel: "それでも戻す", cancelLabel: "やめる", danger: true,
            });
            if (!go) return;
            await KN.backup.restore(s.at, { force: true });
          }
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

  /* ---------------- 記録を点検する（R28、js/audit.js） ----------------

     いまの記録の食い違いを数えて見せるだけ。直す手は置きません——直すのは
     記録の作り替えなので、別の段で、先に利用者へ話してから（CLAUDE.md）。 */
  function openAudit() {
    const a = KN.audit.check(store.get());
    const body = node(html`
      <div class="stack" style="gap:12px">
        <p style="color:var(--c-text-2);line-height:1.6">${a.total
          ? `食い違いが${a.total}件ありました。`
          : "食い違いは見つかりませんでした。"}</p>
        <table class="verify-table js-audit">
          ${KN.audit.LABELS.map(([k, label]) => html`<tr><td>${label}</td><td>${String(a[k])}</td></tr>`)}
        </table>
        <p style="color:var(--c-text-2);line-height:1.6">数えるだけで、記録は変えていません。</p>
      </div>
    `);
    const foot = node(html`<button class="btn btn-soft btn-block">閉じる</button>`);
    const h = KN.ui.sheet({ title: "記録の点検", content: body, footer: foot, guard: false, as: "dialog" });
    foot.addEventListener("click", () => h.close());
  }

  /* ---------------- バックアップ（「›」の先） ---------------- */

  /* 保存できたかどうかを、**押した瞬間には記録しません。** 前は押した直後に
     「前回の書き出し」を今にして「保存しました」と出していたので、iPhone で
     保存の画面を取り消しても、失敗しても、設定には前回の日付が出て、守られて
     いるつもりになりました。

     指で触る端末で、ファイルを共有シートで渡せるなら、そちらを使います——
     渡し終えたときにだけ果たされ、取り消しは AbortError で分かるので、
     確かめてから記録できます。それ以外は、ダウンロードのあとに一度だけ
     「保存できましたか？」と訊きます。**share はタップの流れの中で呼ぶこと**
     （手前で await すると、端末が「人が押した」と見なさなくなります）。 */
  async function saveBackup() {
    /* 日記の写し（js/diary-idb.js）の突き合わせが済む前は、写しから戻る
       はずの本文が、まだ記録に入っていないことがあります。開いた直後の
       一瞬だけのことなので、待たずに断ります（ここで await すると、下の
       共有シートが「人が押した」流れから外れます）。 */
    if (KN.diaryIdb && !KN.diaryIdb.settled()) {
      KN.ui.toast("日記を読み込んでいるところです。少し待ってから、もう一度押してください");
      return;
    }
    const at = new Date().toISOString();
    const d = new Date(at);
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const name = `kaimono-note-${stamp}.json`;
    const text = store.exportJSON(at);

    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    let file = null;
    try { file = new File([text], name, { type: "application/json" }); } catch (err) { file = null; }
    if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        KN.backup.markExported(at);
        KN.ui.toast("バックアップを書き出しました");
        render();
        return;
      } catch (err) {
        if (err && err.name === "AbortError") {
          KN.ui.toast("書き出しをやめました（記録していません）");
          return;
        }
        // 共有そのものが使えなかったときだけ、ダウンロードの道へ。
      }
    }
    await downloadBackup(name, text, at);
  }

  async function downloadBackup(name, text, at) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    /* 1秒で捨てていたのを1分に。「ダウンロードしますか？」に答えてから
       中身を取りに来る端末では、迷っているあいだに捨てると取りに行けません。 */
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
    const ok = await KN.ui.confirm({
      title: "保存できましたか？",
      message: `「${name}」がファイルやダウンロードの中にあれば、保存できています。できていたときだけ、前回の書き出しとして記録します。`,
      okLabel: "保存できた", cancelLabel: "できなかった",
    });
    if (ok) {
      KN.backup.markExported(at);
      KN.ui.toast("前回の書き出しとして記録しました");
    } else {
      KN.ui.toast("記録していません。もう一度お試しください");
    }
    render();
  }

  /** 復元に使う、隠したファイル選択。**画面に置いたまま**にします——
      押してから開くまでのあいだに組み直しが走ると、選び終わった file が
      もう外れた要素に届きます。

      **置き換える前に、中身を確かめて見せます。** daily の月の書き出しや
      日記の取り込み道具の出力も同じ .json で、前はそれを選ぶと、空の
      state で全部が置き換わりました（store.js の readBackup）。 */
  function importInput() {
    const file = node(html`<input type="file" accept="application/json,.json" class="js-file" hidden>`);
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      let text = "";
      try { text = await f.text(); } catch (err) { text = ""; }
      file.value = "";
      const r = store.inspectBackup(text);
      if (!r.ok) {
        KN.ui.toast(`復元できません：${r.reason}（何も変えていません）`, { duration: 6000 });
        return;
      }
      const when = r.exportedAt ? `${snapStamp(r.exportedAt)} の書き出し` : "書き出し日時の無いファイル";
      const ok = await KN.ui.confirm({
        title: "復元しますか？",
        message: `このファイル（${when}）：${countText(r.counts)}。いまの記録：${countText(store.countsOf())}。${auditText(auditOfText(text))}いまのデータはすべて置き換わります。直前の状態は自動バックアップに残ります。`,
        okLabel: "復元する",
        danger: true,
      });
      if (!ok) return;
      if (!(await keepBefore("復元前"))) return;
      try {
        store.importJSON(text);
        KN.ui.toast("復元しました");
      } catch (err) {
        console.error(err);
        KN.ui.toast(`読み込めませんでした：${String((err && err.message) || err)}`);
      }
    });
    return file;
  }

  /* 保存したファイルを、**戻さずに**読んで確かめます。書き出した日時と
     記録の数を、いまの記録と並べて見せるだけで、記録には何も触れません。
     読めたファイルは確かに手元にあるので、その書き出し日時を「前回の
     書き出し」として記録します（前の記録より古ければ巻き戻しません）。 */
  function verifyInput() {
    const file = node(html`<input type="file" accept="application/json,.json" class="js-verify" hidden>`);
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      let text = "";
      try { text = await f.text(); } catch (err) { text = ""; }
      file.value = "";
      showVerify(f.name, store.inspectBackup(text), auditOfText(text));
    });
    return file;
  }

  function showVerify(name, r, audit) {
    const now = store.countsOf();
    const kinds = [
      ["商品", "products"], ["やること", "todos"], ["daily（日）", "days"],
      ["積み上げ", "entries"], ["ダイエット", "diet"],
    ];
    let lead = `「${name}」は、戻せるバックアップではありません。${r.reason || ""}。`;
    let verdict = "";
    if (r.ok) {
      lead = `「${name}」は読めました。${r.exportedAt ? `${snapStamp(r.exportedAt)} の書き出しです。` : ""}`;
      verdict = kinds.every(([, k]) => r.counts[k] === now[k])
        ? "数は、いまの記録と同じです（中身の一字一字までは比べていません）。"
        : "このファイルのあとに、増えたり減ったりした記録があります。新しく書き出しておくと安心です。";
      if (r.exportedAt) KN.backup.markExported(r.exportedAt);
    }
    const body = node(html`
      <div class="stack" style="gap:12px">
        <p style="color:var(--c-text-2);line-height:1.6">${lead}</p>
        ${r.ok ? html`
          <table class="verify-table">
            <tr><th></th><th>このファイル</th><th>いま</th></tr>
            ${kinds.map(([label, k]) => html`<tr><td>${label}</td><td>${r.counts[k]}</td><td>${now[k]}</td></tr>`)}
          </table>
          <p style="color:var(--c-text-2);line-height:1.6">${verdict}</p>
          ${auditText(audit) ? html`<p class="js-audit-line" style="color:var(--c-text-2);line-height:1.6">${auditText(audit)}</p>` : ""}` : ""}
      </div>
    `);
    const foot = node(html`<button class="btn btn-soft btn-block">閉じる</button>`);
    const h = KN.ui.sheet({
      title: r.ok ? "バックアップを確かめました" : "バックアップではありません",
      content: body, footer: foot, guard: false, as: "dialog",
    });
    foot.addEventListener("click", () => h.close());
    render();
  }

  /* ---------------- 日記を取り込む（D7） ----------------

     取り込み道具（tools/diary-import.html）が作った控え（`diary-sealed`）を、
     作ったときの合言葉で開いて、daily の本文にします。開いた本文は**暗号に
     しないまま**、ほかの日記と同じところへ入ります（利用者が決めた。
     docs/storage.md）。

     ・すでに本文のある日には触れません（store.importDiary）。
     ・入れる前に、記録がどれだけ大きくなるかを測ります。記録はいまも一つの
       文字列でまるごと元（localStorage）に書いているので、枠からあふれると、
       日記だけでなく**やることや買うものの保存まで止まります**。入りきら
       ないなら、何も変えずに断ります（そのときは docs/storage.md の「次の段」
       ——元から本文を外す——が先に要る）。
     ・入れる前に、自動の控え（「日記の取り込み前」）。
     ・件数は言いません（daily は数えない）。言うのは期間と、大きさ。 */

  /* 取り込んだあとの記録が、この字数を越えるなら断ります。iPhone の枠は
     およそ5MBで、日本語の混じる文字列は一字2バイトで数えられるので、
     入るのは260万字ほど。そこから、これから書く日記やほかの記録のぶんを
     空けておきます。 */
  const DIARY_LIVE_LIMIT = 2000000;

  function diaryImportInput() {
    const file = node(html`<input type="file" accept="application/json,.json" class="js-diary-file" hidden>`);
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      let text = "";
      try { text = await f.text(); } catch (err) { text = ""; }
      file.value = "";
      importDiaryFile(text);
    });
    return file;
  }

  async function importDiaryFile(text) {
    let sealed = null;
    try { sealed = JSON.parse(text); } catch (err) { sealed = null; }
    const ok = sealed && sealed.app === "kaimono-note" && sealed.kind === "diary-sealed"
      && sealed.lock && Array.isArray(sealed.days);
    if (!ok) {
      KN.ui.toast("日記の取り込み道具で作ったファイルではありません（何も変えていません）", { duration: 6000 });
      return;
    }
    const X = KN.diaryCrypto;
    if (!X || !window.crypto || !window.crypto.subtle) {
      KN.ui.toast("この端末では、控えを開けません（何も変えていません）");
      return;
    }
    /* 日記の写しの突き合わせが済む前に書くと、写しから戻るはずの本文と
       行き違います（書き出しと同じ門）。大きな保存場所を読めなかった日も
       入れません——daily の本文は書かせない日なので（docs/storage.md）。 */
    const diaryNow = KN.diaryIdb ? KN.diaryIdb.body() : "ok";
    if (diaryNow === "loading") {
      KN.ui.toast("日記を読み込んでいるところです。少し待ってから、もう一度選んでください");
      return;
    }
    if (diaryNow === "off") {
      KN.diaryIdb.retry();
      KN.ui.toast("日記の保存場所を読めない日なので、取り込めません（何も変えていません）", { duration: 6000 });
      return;
    }

    let key = null;
    for (;;) {
      const pw = await KN.ui.prompt({
        title: "合言葉",
        label: "取り込み道具で控えを作ったときの合言葉",
        okLabel: "開く",
        secret: true,
      });
      if (pw == null || pw === "") return;
      KN.ui.toast("合言葉を確かめています…");
      try { key = await X.openLock(sealed.lock, pw); } catch (err) { key = null; }
      if (key) break;
      KN.ui.toast("合言葉が違います");
    }

    const list = [];
    let broken = 0;
    for (let i = 0; i < sealed.days.length; i++) {
      const d = sealed.days[i];
      try {
        list.push({ date: d.date, body: await X.open(key, d) });
      } catch (err) {
        broken++;
      }
    }
    if (!list.length) {
      KN.ui.toast("控えを開けませんでした（何も変えていません）");
      return;
    }

    const plan = store.importDiary(list, { dry: true });
    if (!plan.add && !plan.fill) {
      KN.ui.toast("この控えの日記は、もう全部入っています（何も変えていません）");
      return;
    }
    const after = JSON.stringify(store.get()).length + plan.chars;
    if (after > DIARY_LIVE_LIMIT) {
      await KN.ui.confirm({
        title: "入りきりません",
        message: `取り込むと、記録が${charText(after)}になり、この端末の記録の置き場（iPhone でおよそ5MB）に入りきりません。あふれると、日記だけでなく、ほかの記録も保存できなくなるので、取り込みませんでした（何も変えていません）。`,
        okLabel: "わかった", cancelLabel: "閉じる",
      });
      return;
    }

    const span = plan.from === plan.to ? dayText(plan.from) : `${dayText(plan.from)}〜${dayText(plan.to)}`;
    const notes = [
      plan.kept ? "すでに本文のある日は、そのままにします（上書きしません）。" : "",
      broken ? "開けなかった日がありました（その日は入れません）。" : "",
    ].join("");
    const go = await KN.ui.confirm({
      title: "日記を取り込みますか？",
      message: `${span}の日記です。本文の無い日にだけ入れます。${notes}取り込むと、記録は${charText(after)}になります。直前の状態は自動バックアップに残ります。`,
      okLabel: "取り込む",
    });
    if (!go) return;
    if (!(await keepBefore("日記の取り込み前"))) return;
    try {
      store.importDiary(list);
      KN.motion.fire("success");
      KN.ui.toast(plan.kept ? "取り込みました（本文のあった日は、そのままです）" : "取り込みました", { duration: 5000 });
    } catch (err) {
      console.error(err);
      KN.ui.toast(`取り込めませんでした：${String((err && err.message) || err)}`);
    }
    render();
  }

  /* "2019-04-01" → "2019年4月1日" */
  function dayText(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : "";
  }

  /** 設定に出す、この端末の中の量（backup.usage）。 */
  /* iPhone の保存の枠の目安（R24）。正確な値はブラウザも端末も教えてくれないので、
     docs/storage.md の見積もり（およそ5MB）を字数にしたもの。「目安」と言う。 */
  const IPHONE_CHARS = 2600000;

  /** AI の推計が持つ原文と分析の字数（diet.meals[].ai の raw＋analysis）。読むだけ。
      一日一回で一年に約120万字——記録の中でいちばん育つ棚なので、日記と並べて言う。 */
  function aiChars() {
    const meals = ((store.get().diet || {}).meals) || [];
    return meals.reduce((n, m) => {
      const a = m && m.ai;
      return a ? n + String(a.raw || "").length + String(a.analysis || "").length : n;
    }, 0);
  }

  /** 枠までの目安（R24）。控えが記録と同じ枠（localStorage）にあれば、それも数える。
      6割を越えたら一行だけ。色は変えない・催促しない（backup.js の決めごと）。 */
  function roomText(u) {
    const used = u.where === "idb" ? u.liveChars : u.liveChars + (u.snapChars || 0);
    const share = used / IPHONE_CHARS;
    const tenths = Math.round(share * 10);
    const part = tenths < 1 ? "1割未満" : `約${Math.min(tenths, 10)}割`;
    return `iPhone の保存の枠（目安でおよそ260万字）の${part}です。${share >= 0.6 ? "記録が大きくなってきました。" : ""}`;
  }

  function usageText(u) {
    const ai = aiChars();
    const inner = [u.diaryChars ? `日記 ${charText(u.diaryChars)}` : "", ai ? `AI の原文 ${charText(ai)}` : ""]
      .filter(Boolean).join("・");
    const diary = inner ? `（うち${inner}）` : "";
    /* 控えが大きな保存場所（IndexedDB）にあれば、もう記録と枠を分け合って
       いません。そう言わないと、前の「分け合っています」を読んだ人が、
       控えを減らさなければと思い続けます。 */
    let t = u.where === "idb"
      ? `この端末の中：記録 ${charText(u.liveChars)}${diary}。自動バックアップ ${u.count}件（${charText(u.snapChars)}）は、記録とは別の、大きな保存場所にあります。`
      : `この端末の中：記録 ${charText(u.liveChars)}${diary}・自動バックアップ ${u.count}件 ${charText(u.snapChars)}。二つで、端末の保存の枠（iPhone でおよそ5MB）を分け合っています。`;
    t += roomText(u);
    t += diaryCopyText(u.diary);
    if (u.tight) {
      t += `記録が大きくなったので、自動バックアップは${u.fits}件ぶんまでしか持てず、直近の細かい控えから減ります。こまめに「バックアップを保存」を。`;
    }
    return t;
  }

  /* 日記の写し（js/diary-idb.js）の様子。**元（記録の中）を消していない**
     ことと、開くたびに突き合わせた結果を言います——元を記録から外すかどうか
     を決めるときの手がかりなので。日記の中身や、書いた日の数には触れません
     （daily は数えない・評価しない）。 */
  function diaryCopyText(d) {
    if (!d || d.phase === "idle" || d.phase === "starting") return "";
    /* 記録の中から本文を外した日（印 memoOut。docs/storage.md の「段2の案」）が
       あるか。あれば「本文は記録の中に残っています」は事実でないので言いません（罠c）。 */
    const outs = ((store.get().archive || {}).days || []).some(store.memoOut);
    if (d.phase === "off") {
      return `日記の保存場所（大きな保存場所）を読めなかったので、daily の本文は「読めません」と出して、書けないようにしています（${outs
        ? "記録の中から本文を外してある日は、保存場所が読めるまで出せません"
        : "本文は記録の中に残っています"}。アプリを前に出すと、もう一度読みにいきます）。`;
    }
    const n = d.opens || 0;
    /* 直した向き。向きは2026年9月28日から数えているので、それより前に直した
       回は「向きを数える前」として分けます。一度に両方の向きを直した回は、
       両方に数えます。 */
    const dir = [];
    if (d.fixedCopy) dir.push(`写しから記録へ${d.fixedCopy}回`);
    if (d.fixedLive) dir.push(`記録から写しへ${d.fixedLive}回`);
    if (dir.length && d.fixedBefore) dir.push(`向きを数える前に${d.fixedBefore}回`);
    const how = !n ? "写したあと、読み比べて一字も違わないことを確かめました"
      : d.fixed ? `開くたびに突き合わせていて、これまで${n}回のうち${d.fixed}回は、食い違いを直しました${dir.length ? `（${dir.join("・")}）` : ""}`
      : `開くたびに突き合わせていて、これまで${n}回とも食い違いはありません`;
    const stuck = d.error ? `いまは写しへの書き足しが止まっています${outs ? "" : "（記録の中には残っています）"}。` : "";
    const notes = [
      d.restored ? "記録の中から外した本文を写しから戻したのは、食い違いには数えていません。" : "",
      d.unverified ? "写しを確かめた記録が見つからなかったので、写し直さずに（写しを消さずに）突き合わせています。" : "",
      d.missing ? "本文を外した日のうち、写しにも本文が見つからない日があります（その日は「本文が見つかりません」と出ます。バックアップのファイルから戻せることがあります）。" : "",
    ].join("");
    const lead = outs
      ? "日記の本文は、大きな保存場所に写してあり、記録の中からは外してある日もあります"
      : "日記の本文は、記録の中に残したまま、大きな保存場所にも写してあります";
    return `${lead}（${how}）。${stuck}${notes}`;
  }

  function dataRows() {
    const file = importInput();
    const verify = verifyInput();
    const diaryFile = diaryImportInput();
    const snaps = KN.backup.list();
    return [
      card(
        navRow({ ico: "download", tint: TINT.data, title: "バックアップを保存", onTap: saveBackup }),
        navRow({ ico: "check", tint: TINT.data, title: "保存したバックアップを確かめる", onTap: () => verify.click() }),
        navRow({ ico: "upload", tint: TINT.data, title: "バックアップから復元", onTap: () => file.click() })
      ),
      foot(exportSub()),
      KN.dropbox ? card(navRow({
        ico: "upload", tint: TINT.data, title: "Dropbox へ自動で送る",
        value: dropboxValue(KN.dropbox.status()),
        onTap: () => go("dropbox"),
      })) : null,
      card(
        navRow({
          ico: "undo", tint: TINT.sub, title: "自動バックアップから戻す",
          value: snaps.length ? `${snaps.length}件` : "なし", onTap: openSnapshots,
        }),
        /* 記録を書き出す（→ health）・年の本（→ daily の書き出し）・おぼえた
           振り分け（→ shopping）は、中身の持ち主のタブへ移しました。ここに
           残すのは、全部の記録にかかわるものだけ。 */
        navRow({ ico: "check", tint: TINT.sub, title: "記録を点検する", onTap: openAudit })
      ),
      foot(usageText(KN.backup.usage())),
      /* 日記の取り込み（D7）。取り込み道具の README が「設定 → 日記を取り込む」
         と案内している口。一度きりの作業なので、毎日使う列には混ぜません。 */
      card(
        navRow({ ico: "book", tint: TINT.sub, title: "日記を取り込む", onTap: () => diaryFile.click() })
      ),
      foot("取り込み道具（パソコンで日記の PDF から作る控え）を読みます。本文の無い日にだけ入れ、すでに書いてある日には触れません。"),
      /* 戻せない操作は、ここからもう一段奥。同じ一枚に置いておくと、
         「戻す」の隣に「消す」が並ぶことになります。 */
      card(
        navRow({ ico: "trash", tint: TINT.danger, title: "データを消す", onTap: () => go("danger") })
      ),
      file,
      verify,
      diaryFile,
    ];
  }

  /* ---------------- Dropbox へ送る（js/dropbox.js） ----------------

     つなぐまでは三行（App key・ゆるす・コードを貼る）。つないだあとは、
     最後に送った時刻と、いま送る・切る。送る中身と溜まり方は
     docs/storage.md の「Dropbox へ送る」。 */

  function dropboxValue(s) {
    if (s.connected) return s.error ? "送れていません" : "つないでいます";
    return s.needsAuth ? "つなぎ直しが要ります" : "";
  }

  function whenText(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  }

  function dropboxRows() {
    const db = KN.dropbox;
    const s = db.status();
    if (!s.connected) {
      db.prepare();
      return [
        foot("記録をまるごと、Dropbox の「アプリ」フォルダへ自動で送ります。開いたとき・書き換えて少ししたときに、変わっていれば送ります。"),
        fieldCard({
          label: "App key", value: s.appKey, placeholder: "Dropbox の App Console に出ている英数字",
          onSave: (v) => { db.setAppKey(v); render(); },
        }),
        card(
          navRow({
            ico: "route", tint: TINT.data, title: "Dropbox でゆるす",
            value: s.appKey ? "" : "App key が要ります",
            onTap: () => {
              const url = db.authUrl();
              if (!url) {
                KN.ui.toast(s.appKey ? "用意しています。少し待ってから、もう一度押してください" : "先に App key を入れてください");
                return;
              }
              window.open(url, "_blank", "noopener");
            },
          }),
          navRow({
            ico: "check", tint: TINT.data, title: "出てきたコードを貼る",
            onTap: async () => {
              if (!db.authUrl()) { KN.ui.toast("先に「Dropbox でゆるす」を"); return; }
              const code = await KN.ui.prompt({ title: "Dropbox のコード", label: "ゆるしたあとに出てきたコード", okLabel: "つなぐ" });
              if (code == null || !String(code).trim()) return;
              try {
                const r = await db.finish(code);
                KN.ui.toast(r === "sent" ? "つなぎました。最初の控えを送りました" : "つなぎました");
              } catch (err) {
                KN.ui.toast("つなげませんでした（" + ((err && err.message) || err) + "）");
              }
              render();
            },
          })
        ),
        foot(s.needsAuth
          ? "Dropbox の側でつながりが外れました。もう一度ゆるして、コードを貼ってください。"
          : "「ゆるす」を押すと Dropbox の画面が開きます。ゆるすと出てくるコードを写して、ここへ戻って貼ります。"),
      ];
    }
    const last = s.lastAt ? `最後に送ったのは${whenText(s.lastAt)}。` : "まだ送っていません。";
    const err = s.error ? `${whenText(s.errorAt)}に送れませんでした（${s.error}）。次に開いたときに、また送ります。` : "";
    return [
      card(navRow({
        ico: "upload", tint: TINT.data, title: "いま送る",
        onTap: async () => {
          const r = await db.sync();
          KN.ui.toast(r === "sent" ? "送りました" : r === "same" ? "前に送ったものと同じです" : "送れませんでした");
          render();
        },
      })),
      foot(last + err),
      foot(`「kurashi-latest.json」は送るたびに上書きします。「daily」には一日一つ、その日はじめて送った中身を置き、新しいほうから${s.keep}日ぶんを残します。どれも「バックアップから復元」で読めます。`),
      card(dangerRow({
        ico: "close", title: "Dropbox とのつながりを切る",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "つながりを切りますか？",
            message: "これからは送りません。Dropbox に置いたファイルはそのまま残ります。",
            okLabel: "切る", danger: true,
          });
          if (!ok) return;
          await db.disconnect();
          render();
        },
      })),
    ];
  }

  /* ---------------- データを消す（三段奥） ----------------

     どれも**戻せない**操作です。参考画面（Structured）が「アプリを初期化」を
     詳細設定のいちばん下に置いているのと同じ考えで、ここだけ一段深くして
     あります。「サンプルデータを入れる」も、見た目は足す操作ですが、中身は
     いまの記録を**全部置き換える**ものなので、同じ棚に置きます。

     四角の絵は着せません——あれは「押すと続きがある」の印なので、戻れない
     操作に着せると、普通の行き先と同じ顔になります。 */

  function dangerRows() {
    const d = store.get().diet;
    return [
      foot("ここから先は、押すと戻せません。どれも直前の状態を自動バックアップに残しますが、端末を替えたあとでは戻せません。"),
      card(dangerRow({
        ico: "trash", title: "ダイエットの記録を消す",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "ダイエットの記録を消す",
            message: "体重・食事・ヘルスケアの記録がすべて消えます。買うものとやることはそのままです。直前の状態は自動バックアップに残ります。",
            okLabel: "消す", danger: true,
          });
          if (!ok) return;
          /* 前はここで控えを取っていませんでした。確認の文は「直前の状態は
             自動バックアップに残ります」と言うのに、残っていたのは最後に
             アプリを離れたときの状態でした。 */
          if (!(await keepBefore("削除前"))) return;
          store.clearDiet();
          render();
          KN.ui.toast("消しました");
        },
      })),
      foot(`体重 ${d.weights.length}件・食事 ${d.meals.length}件・ヘルスケア ${d.health.length}件。`),
      card(dangerRow({
        ico: "sparkles", title: "サンプルデータを入れる",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "サンプルを入れますか？",
            message: "いまのデータはすべて置き換わります。",
            okLabel: "入れる", danger: true,
          });
          if (!ok) return;
          if (!(await keepBefore("サンプル読込前"))) return;
          store.loadSample();
          KN.ui.toast("サンプルを読み込みました");
        },
      })),
      foot("お試し用のお店と商品に置き換えます。いまの記録は消えます。"),
      card(dangerRow({
        ico: "trash", title: "すべて削除",
        onTap: async () => {
          const ok = await KN.ui.confirm({
            title: "すべて削除しますか？",
            message: "買うもの・やること・daily・ダイエットの記録（体重・食事・お酒・目標）と設定が、すべて消えます。直前の状態は自動バックアップに残るので、あとから戻せます。",
            okLabel: "削除する", danger: true,
          });
          if (!ok) return;
          if (!(await keepBefore("削除前"))) return;
          store.reset();
          if (KN.errlog) KN.errlog.clear();
          KN.ui.toast("すべて削除しました");
        },
      })),
      foot("買うもの・やること・daily・ダイエット・設定、ぜんぶ消えます。"),
    ];
  }

  Object.assign(S, { dataRows, dropboxRows, dangerRows });
})();
