/* =========================================================
   くらしノート — settings screen：バックアップ（保存・確かめる・復元・Dropbox・使用量・日記の取り込み）
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
    if (!last) return "";
    return `前回 ${snapStamp(last)}`;
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
        <p class="set-foot is-flush">この端末の中だけの控えです。</p>
        <div class="rows js-snaps"></div>
      </div>
    `);

    let sheetHandle = null;
    const rows = body.querySelector(".js-snaps");
    snaps.forEach((s) => {
      // 2026年9月26日より前に取った控えは、買うものの数しか持っていません。
      /* out：日記の保存場所を読めない日の控えで、外した日の本文が入っていない
         （docs/storage.md の案B の4）。件数は言いません。 */
      const sub = (s.summary.todos == null
        ? `${s.summary.products}商品・${s.summary.stores}店舗・リスト${s.summary.items}件`
        : countText(s.summary)) + (s.out ? "・本文の無い日あり" : "");
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
        /* ノートの入った控え（B3。docs/storage.md）は、ノートを置き換えずに合わせる。 */
        const ok = await KN.ui.confirm({
          title: "この時点に戻しますか？",
          message: `いまのデータは置き換わります${s.nb != null ? "（ノートは消さずに合わせます）" : ""}。戻す直前の状態も控えに残すので、やり直せます。`,
          okLabel: "戻す",
          danger: true,
        });
        if (!ok) return;
        try {
          let res = null;
          try {
            res = await KN.backup.restore(s.at);
          } catch (err) {
            if (err.code !== "keep-failed") throw err;
            // 戻す前の控えが取れなかった。黙って戻すと、いまの状態へは戻れない。
            const go = await KN.ui.confirm({
              title: "控えを取れませんでした",
              message: "空き容量が足りず、戻す前の状態を控えに残せませんでした。このまま戻すと、いまの状態へはやり直せません。",
              okLabel: "それでも戻す", cancelLabel: "やめる", danger: true,
            });
            if (!go) return;
            res = await KN.backup.restore(s.at, { force: true });
          }
          KN.ui.toast(`${snapStamp(s.at)} の状態に戻しました${res && res.notes === "failed" ? "（ノートは合わせられませんでした）" : ""}`);
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
      <div class="stack gap-3">
        <p class="sheet-text">${a.total
          ? `食い違いが${a.total}件ありました。`
          : "食い違いは見つかりませんでした"}</p>
        <table class="verify-table js-audit">
          ${KN.audit.LABELS.map(([k, label]) => html`<tr><td>${label}</td><td>${String(a[k])}</td></tr>`)}
        </table>
        <p class="sheet-text">記録は変えていません。</p>
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
  /* `opts.bare`：本文の無い書き出しと分かって押した（下の confirmBare）。
     `opts.onSaved(at)`：保存できたと分かったあとに（日記を外す。下の exportAndOut）。 */
  async function saveBackup(opts) {
    const o = (opts && typeof opts === "object" && !(opts instanceof Event)) ? opts : {};
    /* 日記の写し（js/diary-idb.js）の突き合わせが済む前は、写しから戻る
       はずの本文が、まだ記録に入っていないことがあります。開いた直後の
       一瞬だけのことなので、待たずに断ります（ここで await すると、下の
       共有シートが「人が押した」流れから外れます）。 */
    if (KN.diaryIdb && !KN.diaryIdb.settled()) {
      KN.ui.toast("日記を読み込んでいるところです。少し待ってから、もう一度押してください");
      return;
    }
    /* ノート（docs/notes.md）も同じ門。読み終える前の書き出しは、ノートを
       取りこぼします。 */
    if (KN.notes && !KN.notes.settled()) {
      KN.ui.toast("ノートを読み込んでいるところです。少し待ってから、もう一度押してください");
      return;
    }
    /* 日記を元から外したあと、日記の保存場所を読めない日は、外した日の本文が
       記録に無い（docs/storage.md の案B の4）。先に紙で言い、その「書き出す」の
       **押した流れのまま**共有します。ファイル名に「本文なし」、前回の書き出しには数えません。 */
    if (!o.bare && KN.diaryIdb && KN.diaryIdb.body() === "off" && bareNow()) {
      confirmBare();
      return;
    }
    const at = new Date().toISOString();
    const d = new Date(at);
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const name = `kaimono-note-${stamp}${o.bare ? "-本文なし" : ""}.json`;
    const text = store.exportJSON(at, KN.notes ? KN.notes.forExport() : null);

    const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    let file = null;
    try { file = new File([text], name, { type: "application/json" }); } catch (err) { file = null; }
    if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      let shared = false;
      try {
        await navigator.share({ files: [file], title: name });
        shared = true;
      } catch (err) {
        if (err && err.name === "AbortError") {
          KN.ui.toast("書き出しをやめました（記録していません）");
          return;
        }
        // 共有そのものが使えなかったときだけ、ダウンロードの道へ。
      }
      // 渡し終えたあとの処理（日記を外す、など）は try の外で——そこで落ちて、ダウンロードへ回らないように。
      if (shared) { await saved(at, o); return; }
    }
    await downloadBackup(name, text, at, o);
  }

  /* 保存できたと分かったあと。本文の無い書き出しは、前回の書き出しに数えません。 */
  async function saved(at, o) {
    if (!o.bare) KN.backup.markExported(at);
    if (o.onSaved) await o.onSaved(at);
    else KN.ui.toast(o.bare ? "書き出しました（日記の本文なし）" : "バックアップを書き出しました");
    render();
  }

  /* 記録に、本文を外した行（memoOut）があるか。 */
  const bareNow = () => ((store.get().archive || {}).days || []).some(store.memoOut);

  function confirmBare() {
    const body = node(html`<div class="stack gap-2"><p class="sheet-text">日記の保存場所を読めない日なので、外した日記の本文は入りません。</p></div>`);
    const foot = node(html`
      <div class="btn-row">
        <button class="btn btn-soft js-cancel grow">やめる</button>
        <button class="btn btn-primary js-ok grow">書き出す</button>
      </div>`);
    const h = KN.ui.sheet({ title: "日記の本文は入りません", content: body, footer: foot, guard: false, as: "dialog" });
    foot.querySelector(".js-cancel").addEventListener("click", () => h.close());
    // 押した流れのまま共有する（手前で await しない）。
    foot.querySelector(".js-ok").addEventListener("click", () => { saveBackup({ bare: true }); h.close(); });
  }

  async function downloadBackup(name, text, at, o) {
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
      message: `「${name}」がファイルやダウンロードにあれば、保存できています。`,
      okLabel: "保存できた", cancelLabel: "できなかった",
    });
    if (ok && (o.bare || o.onSaved)) { await saved(at, o); return; }
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
      await restoreText(text);
    });
    return file;
  }

  /** 読んだバックアップの字を、確かめて見せてから戻します（ファイルと、Dropbox の
      控え）。戻したら true。 */
  async function restoreText(text) {
    const r = store.inspectBackup(text);
    if (!r.ok) {
      KN.ui.toast(`復元できません：${r.reason}（何も変えていません）`, { long: true });
      return false;
    }
    /* 記録の置き場（localStorage）に入りきらない大きさなら、戻す前に断ります。
       日記の本文を外してあれば、本文は大きな保存場所へ先に届けるので入ります
       （store.importBackup）。 */
    const D = KN.diaryIdb;
    const outOk = !!(D && D.isOut && D.isOut() && D.body() === "ok");
    if (r.size > IPHONE_CHARS && !outOk) {
      await KN.ui.confirm({
        title: "入りきりません",
        message: D && D.isOut && D.isOut()
          ? "日記の保存場所を読めない日なので、この大きさのファイルは戻せません（何も変えていません）。"
          : `このファイルは${charText(r.size)}あり、この端末の記録の置き場に入りきりません（何も変えていません）。先に「日記を記録から外す」を。`,
        okLabel: "わかった", cancelLabel: "閉じる",
      });
      return false;
    }
    const when = r.exportedAt ? `${snapStamp(r.exportedAt)} の書き出し` : "書き出し日時の無いファイル";
    /* ノート（記録の外。docs/notes.md の段2）は置き換えずに合わせます。 */
    let book = null;
    try { book = JSON.parse(text).noteBook || null; } catch (err) { book = null; }
    const ok = await KN.ui.confirm({
      title: "復元しますか？",
      message: `このファイル（${when}）：${countText(r.counts)}。いまの記録：${countText(store.countsOf())}。${auditText(auditOfText(text))}${r.bare ? "日記の本文が無い日があります（いま持っている本文を当てます）。" : ""}いまのデータはすべて置き換わります${book ? "（ノートは消さずに合わせます）" : ""}。直前の状態は自動バックアップに残ります。`,
      okLabel: "復元する",
      danger: true,
    });
    if (!ok) return false;
    if (!(await keepBefore("復元前"))) return false;
    try {
      await store.importBackup(text);
      await KN.backup.settleLost();   // 記録が見当たらない日（backup.js）は、これで戻ったことに
    } catch (err) {
      console.error(err);
      KN.ui.toast(`読み込めませんでした：${String((err && err.message) || err)}`);
      return false;
    }
    if (!book || !KN.notes) { KN.ui.toast("復元しました"); return true; }
    try {
      if (await KN.notes.merge(book)) { KN.ui.toast("復元しました"); return true; }
    } catch (err) {
      console.error(err);
    }
    KN.ui.toast("復元しました（ノートは合わせられませんでした）", { long: true });
    return true;
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
        ? "数は、いまの記録と同じです。"
        : "このあと増減した記録があります。新しく書き出しておくと安心です。";
      // 本文の無い書き出しは、前回の書き出しに数えません（docs/storage.md の案B の4）。
      if (r.bare) verdict += "日記の本文が無い日があります。";
      else if (r.exportedAt) KN.backup.markExported(r.exportedAt);
    }
    const body = node(html`
      <div class="stack gap-3">
        <p class="sheet-text">${lead}</p>
        ${r.ok ? html`
          <table class="verify-table">
            <tr><th></th><th>このファイル</th><th>いま</th></tr>
            ${kinds.map(([label, k]) => html`<tr><td>${label}</td><td>${r.counts[k]}</td><td>${now[k]}</td></tr>`)}
          </table>
          <p class="sheet-text">${verdict}</p>
          ${auditText(audit) ? html`<p class="js-audit-line sheet-text">${auditText(audit)}</p>` : ""}` : ""}
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

     ・本文のある日は、書き足しなら控えの文に。中身が変わった日は日付を見せて
       利用者が決める（上掛け。store.importDiary）。
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
      KN.ui.toast("日記の取り込み道具で作ったファイルではありません（何も変えていません）", { long: true });
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
      KN.ui.toast("日記の保存場所を読めない日なので、取り込めません（何も変えていません）", { long: true });
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

    /* 上掛け（2026年9月30日）。くらしノートの文がそのまま入っている日（書き足し）は
       控えの本文にします。中身が変わった日だけは、日付を見せて利用者に決めてもらう
       ——本文は見せない・引かない。閉じたら「そのまま」（安全なほう）。 */
    const first = store.importDiary(list, { dry: true, replace: "grow" });
    if (!first.add && !first.fill && !first.grow && !first.differ) {
      KN.ui.toast("この控えの日記は、もう全部入っています（何も変えていません）");
      return;
    }
    let replace = "grow";
    if (first.differ) {
      const SHOW = 15;
      const days = first.differDays.slice(0, SHOW).map(shortDay).join("・")
        + (first.differDays.length > SHOW ? " ほか" : "");
      const all = await KN.ui.confirm({
        title: "中身の変わった日があります",
        message: `くらしノートの文と控えの文が、書き足しではなく違っている日です：${days}。控えの文にすると、くらしノートの文は取り込み前の自動バックアップにだけ残ります。`,
        okLabel: "控えの文にする", cancelLabel: "くらしノートのまま",
      });
      if (all) replace = "all";
    }
    const plan = store.importDiary(list, { dry: true, replace });
    if (!plan.add && !plan.fill && !plan.replaced) {
      KN.ui.toast("入れるものがありませんでした（何も変えていません）");
      return;
    }
    /* 日記の本文を外してあれば（段2の2b）、入れる本文は大きな保存場所へ先に
       届けて（罠b）、元には外した行だけが増えます。大きさはその形で測ります。 */
    const out = !!(KN.diaryIdb && KN.diaryIdb.isOut && KN.diaryIdb.isOut());
    const after = out
      ? store.liveChars() + plan.add * 160
      : JSON.stringify(store.get()).length + plan.chars;
    if (after > DIARY_LIVE_LIMIT) {
      await KN.ui.confirm({
        title: "入りきりません",
        message: `取り込むと、記録が${charText(after)}になり、この端末の記録の置き場（iPhone でおよそ5MB）に入りきりません。あふれると、日記だけでなく、ほかの記録も保存できなくなるので、取り込みませんでした（何も変えていません）。${out ? "" : "先に「日記を記録から外す」を。"}`,
        okLabel: "わかった", cancelLabel: "閉じる",
      });
      return;
    }

    const span = plan.from === plan.to ? dayText(plan.from) : `${dayText(plan.from)}〜${dayText(plan.to)}`;
    const notes = [
      plan.grow ? "くらしノートの文に書き足してある日は、控えの文にします。" : "",
      replace === "all" ? "中身の変わった日も、控えの文にします。" : "",
      plan.kept ? "そのほかの本文のある日は、そのままにします。" : "",
      broken ? "開けなかった日がありました（その日は入れません）。" : "",
    ].join("");
    const go = await KN.ui.confirm({
      title: "日記を取り込みますか？",
      message: `${span}の日記です。本文の無い日に入れます。${notes}取り込むと、記録は${charText(after)}になります。直前の状態は自動バックアップに残ります。`,
      okLabel: "取り込む",
    });
    if (!go) return;
    if (!(await keepBefore("日記の取り込み前"))) return;
    try {
      if (out) await KN.diaryIdb.deliver(plan.bodies);
      store.importDiary(list, { replace });
      KN.motion.fire("success");
      KN.ui.toast(plan.kept ? "取り込みました（そのままにした日もあります）" : "取り込みました");
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
  /* "2026-04-03" → "4月3日"（今年でなければ年も） */
  function shortDay(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return "";
    const md = `${Number(m[2])}月${Number(m[3])}日`;
    return Number(m[1]) === new Date().getFullYear() ? md : `${Number(m[1])}年${md}`;
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
    return `iPhone の枠（約260万字）の${part}。${share >= 0.6 ? "記録が大きくなってきました。" : ""}`;
  }

  function usageText(u) {
    const ai = aiChars();
    /* 日記の本文を記録から外してあれば（段2の2b）、日記は記録の外（大きな保存場所）。 */
    const out = !!(u.diary && u.diary.out);
    const inner = [!out && u.diaryChars ? `日記 ${charText(u.diaryChars)}` : "", ai ? `AI の原文 ${charText(ai)}` : ""]
      .filter(Boolean).join("・");
    const diary = inner ? `（うち${inner}）` : "";
    const apart = out && u.diaryChars ? `日記 ${charText(u.diaryChars)}と` : "";
    /* 控えが大きな保存場所（IndexedDB）にあれば、もう記録と枠を分け合って
       いません。そう言わないと、前の「分け合っています」を読んだ人が、
       控えを減らさなければと思い続けます。 */
    let t = u.where === "idb"
      ? `この端末の中：記録 ${charText(u.liveChars)}${diary}。${apart}自動バックアップ ${u.count}件は別の保存場所。`
      : `この端末の中：記録 ${charText(u.liveChars)}${diary}・自動バックアップ ${u.count}件 ${charText(u.snapChars)}。${apart ? `${apart.slice(0, -1)}は別の保存場所。` : ""}`;
    t += liveCopyText();
    t += roomText(u);
    t += diaryCopyText(u.diary);
    if (u.tight) {
      t += `自動バックアップは${u.fits}件まで。こまめに「バックアップを保存」を。`;
    }
    return t;
  }

  /* 記録の写し（js/live-idb.js。B1）：いつの状態か。書くたびに追うので、ふだんは
     いま。止まっている・書けていないときだけ、そう言う。 */
  function liveCopyText() {
    if (!KN.liveIdb) return "";
    const s = KN.liveIdb.status();
    if (s.phase === "off") return "記録の写しは止まっています。";
    if (s.phase !== "on") return "";
    if (s.failed) return "記録の写しへ書けていません。";
    return s.last ? `記録の写し：${whenText(s.last.at)}の状態。` : "";
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
      return `日記の保存場所を読めないため、本文は書けません（${outs
        ? "外した日の本文は出せません"
        : "本文は記録の中にあります"}）。`;
    }
    const n = d.opens || 0;
    /* 直した向き。向きは2026年9月28日から数えているので、それより前に直した
       回は「向きを数える前」として分けます。一度に両方の向きを直した回は、
       両方に数えます。 */
    const dir = [];
    if (d.fixedCopy) dir.push(`写しから記録へ${d.fixedCopy}回`);
    if (d.fixedLive) dir.push(`記録から写しへ${d.fixedLive}回`);
    if (dir.length && d.fixedBefore) dir.push(`向きを数える前に${d.fixedBefore}回`);
    const how = !n ? "確かめ済み"
      : d.fixed ? `${n}回のうち${d.fixed}回直しました${dir.length ? `（${dir.join("・")}）` : ""}`
      : `${n}回とも食い違いなし`;
    const stuck = d.error ? "写しへの書き足しが止まっています。" : "";
    const notes = [
      d.unverified ? "写しの確認記録が無いまま突き合わせています。" : "",
      d.missing ? "写しにも本文が無い日があります（バックアップから戻せることがあります）。" : "",
    ].join("");
    return `日記の写し：${how}。${d.out ? "本文は記録から外しています。" : ""}${stuck}${notes}`;
  }

  /* ---------------- 日記を記録から外す（段2の2b。docs/storage.md） ----------------

     記録（localStorage の一本）から日記の本文を外し、大きな保存場所（写しと
     控え）だけに置きます。大きな日記を取り込みたいとき・記録が大きくなって
     きたときに、利用者が押す。二回に分けます：
       1回目「準備する」：写しと記憶の本文を全日読み比べ → 控え「日記を外す前」
       2回目「書き出して外す」：共有シートで書き出し（押した流れのまま）→
         保存できたときだけ外す（diaryIdb.markOut）
     外したあとは「日記を記録に戻す」（本文を書き戻しても枠に入るときだけ出す）。 */
  const READY_MS = 10 * 60 * 1000;   // 準備してから、書き出して外せるあいだ
  let outReady = 0;
  const outReadyNow = () => !!outReady && Date.now() - outReady < READY_MS
    && !!KN.diaryIdb && !KN.diaryIdb.isOut() && KN.diaryIdb.body() === "ok";

  function diaryOutRows() {
    const D = KN.diaryIdb;
    if (!D || !D.isOut) return [];
    const st = D.status();
    if (st.out) {
      if (st.phase !== "on" || JSON.stringify(store.get()).length > DIARY_LIVE_LIMIT) return [];
      return [navRow({ ico: "undo", tint: TINT.sub, title: "日記を記録に戻す", onTap: putBackDiary })];
    }
    if (st.phase !== "on") return [];
    if (outReadyNow()) return [navRow({ ico: "download", tint: TINT.data, title: "書き出して外す", onTap: exportAndOut })];
    return [navRow({ ico: "book", tint: TINT.sub, title: "日記を記録から外す", onTap: prepareOut })];
  }

  async function prepareOut() {
    const D = KN.diaryIdb;
    if (D.body() !== "ok") { D.retry(); KN.ui.toast("日記を読めないので、外せません（何も変えていません）"); return; }
    /* 外したあと、本文は大きな保存場所（写しと控え）とファイルにしかありません
       （罠g）。消さない約束（永続）を、押した流れのまま頼みなおします。 */
    let persisted = null;
    try {
      if (navigator.storage && navigator.storage.persist) persisted = await navigator.storage.persist();
    } catch (err) { persisted = null; }
    const ok = await KN.ui.confirm({
      title: "日記を記録から外しますか？",
      message: `日記の本文を記録から外し、大きな保存場所だけに置きます。写しと読み比べて控えを取り、バックアップを書き出せたら外します。${persisted === false ? "この端末は保存場所を消さない約束をしていないので、書き出しはこまめに。" : ""}`,
      okLabel: "準備する",
    });
    if (!ok) return;
    let same = false;
    try {
      same = await D.prepare();
    } catch (err) {
      KN.ui.toast(`準備できませんでした（${String((err && err.message) || err)}）`, { long: true });
      return;
    }
    if (!same) {
      KN.ui.toast("写しと食い違う日があったので、外しません（何も変えていません）", { long: true });
      return;
    }
    if ((await KN.backup.take("日記を外す前", { force: true })) === "failed") {
      KN.ui.toast("控えを取れなかったので、外しません（何も変えていません）", { long: true });
      return;
    }
    outReady = Date.now();
    KN.ui.toast("準備できました");
    render();
  }

  /* 押した流れのまま共有シートへ（saveBackup の手前で await しない）。 */
  function exportAndOut() {
    if (!outReadyNow()) {
      outReady = 0;
      KN.ui.toast("もう一度「日記を記録から外す」から");
      render();
      return;
    }
    saveBackup({
      onSaved: async (at) => {
        outReady = 0;
        try {
          await KN.diaryIdb.markOut(at);
          KN.motion.fire("success");
          KN.ui.toast("日記を記録から外しました");
        } catch (err) {
          console.error(err);
          KN.ui.toast("書き出しましたが、外せませんでした（何も変えていません）", { long: true });
        }
      },
    });
  }

  async function putBackDiary() {
    const ok = await KN.ui.confirm({
      title: "日記を記録に戻しますか？",
      message: "日記の本文を、記録にも書き戻します。",
      okLabel: "戻す",
    });
    if (!ok) return;
    if (JSON.stringify(store.get()).length > DIARY_LIVE_LIMIT) {
      KN.ui.toast("記録の置き場に入りきらないので、戻せません（何も変えていません）", { long: true });
      return;
    }
    try {
      KN.ui.toast(await KN.diaryIdb.putBack()
        ? "日記を記録に戻しました"
        : "記録の置き場に入りきらないので、戻せませんでした（外したままです）", { long: true });
    } catch (err) {
      console.error(err);
      KN.ui.toast("戻しきれませんでした（外したままです）", { long: true });
    }
    render();
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
        navRow({ ico: "book", tint: TINT.sub, title: "日記を取り込む", onTap: () => diaryFile.click() }),
        diaryOutRows()
      ),
      foot(`本文の無い日と、書き足した日に入れます。${outReadyNow() ? "書き出せたら外します。" : ""}`),
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
          : "ゆるすと出るコードを、ここへ貼ります。"),
      ];
    }
    const last = s.lastAt ? `最後に送ったのは${whenText(s.lastAt)}。` : "まだ送っていません。";
    const err = s.error ? `${whenText(s.errorAt)}に送れませんでした（${s.error}）。` : "";
    return [
      card(
        navRow({
          ico: "upload", tint: TINT.data, title: "いま送る",
          onTap: async () => {
            const r = await db.sync();
            KN.ui.toast(r === "sent" ? "送りました" : r === "same" ? "前に送ったものと同じです"
              : r === "empty" ? "記録が空なので送りません" : "送れませんでした");
            render();
          },
        }),
        navRow({ ico: "undo", tint: TINT.sub, title: "Dropbox の控えから戻す", onTap: openDropboxBackups })
      ),
      foot(last + err),
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

  /* Dropbox の控えから戻す（B2。js/dropbox.js の backups / download）。端末ごと
     失った日に、ファイル App を通らずに。並びを見せ、押したものを読んで、ファイルの
     復元と同じ確かめ（restoreText）へ。 */
  async function openDropboxBackups() {
    let list = null;
    try {
      list = await KN.dropbox.backups();
    } catch (err) {
      KN.ui.toast(`Dropbox を読めませんでした（${String((err && err.message) || err)}）`, { long: true });
      return;
    }
    if (!list.length) { KN.ui.toast("Dropbox に控えがありません"); return; }
    const body = node(html`<div class="stack"><div class="rows js-dbx"></div></div>`);
    const rows = body.querySelector(".js-dbx");
    let h = null;
    list.forEach((f) => {
      const when = f.at ? snapStamp(f.at) : formatDate(f.day);
      const row = node(html`
        <button class="row">
          <span class="row-main">
            <span class="row-title">${when}${f.latest ? "（最新）" : ""}</span>
          </span>
          <span class="row-chevron">${icon("chevron")}</span>
        </button>
      `);
      row.addEventListener("click", async () => {
        let text = "";
        try {
          text = await KN.dropbox.download(f.path);
        } catch (err) {
          KN.ui.toast(`読み込めませんでした（${String((err && err.message) || err)}）`, { long: true });
          return;
        }
        if ((await restoreText(text)) && h) h.close();
      });
      rows.append(row);
    });
    h = KN.ui.sheet({ title: "Dropbox の控え", content: body });
  }

  /* 「データを消す」の一段（ダイエットの記録を消す・サンプルを入れる・すべて削除）は
     外しました（2026年10月5日）。消したい時は無い——戻せない操作の入口を持たない。 */

  /* ---------------- 週に一度の控え（2026年10月8日） ---------------- */

  /* 手で書き出してから7日たったら、押すまで残るトーストを一日に一度。「保存」は
     「バックアップを保存」と同じ共有シート（押した流れのまま）——iCloud Drive など、
     Dropbox と別の場所に置いてもらうためなので、Dropbox に届いた時刻は数えません。
     歯車の点（R25）の「トーストは出さない」の、利用者が決めた例外（docs/storage.md）。
     出した日は store の外の鍵に（その日を過ぎるまで出さない）。 */
  const NUDGE_DAYS = 7, NUDGE_WAIT = 4000, NUDGE_KEY = "kn-export-nudge";

  function nudgeDue(now) {
    if (!KN.backup.worthKeeping()) return false;
    const last = KN.backup.lastExportAt();
    const t = last ? new Date(last).getTime() : NaN;
    return !isFinite(t) || Math.floor((now - t) / 86400000) >= NUDGE_DAYS;
  }

  function nudge() {
    if (document.visibilityState !== "visible") return;
    /* 読み終える前は saveBackup が断るので、出さない（次に前へ出たとき）。 */
    if ((KN.diaryIdb && !KN.diaryIdb.settled()) || (KN.notes && !KN.notes.settled())) return;
    const day = KN.util.todayKey();
    try {
      if ((localStorage.getItem(NUDGE_KEY) || "") >= day || !nudgeDue(Date.now())) return;
      localStorage.setItem(NUDGE_KEY, day);
    } catch (_) { return; /* 覚えられない端末では出さない（開くたびに出てしまうので） */ }
    KN.ui.toast("週に一度の控え", {
      stay: true,
      actions: [{ label: "あとで", onClick: () => {} }, { label: "保存", onClick: () => saveBackup() }],
    });
  }

  /* 開いたときは、先に待ってから日記の写しを待つ——ここで ready() を呼ぶと、
     記録の写し（live-idb.js）より先に日記の突き合わせが始まってしまう（app.js の順）。 */
  setTimeout(() => {
    (KN.diaryIdb ? KN.diaryIdb.ready() : Promise.resolve()).then(nudge, nudge);
  }, NUDGE_WAIT);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(nudge, NUDGE_WAIT);
  });

  Object.assign(S, { dataRows, dropboxRows, nudge });
})();
