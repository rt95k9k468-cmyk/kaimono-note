/* =========================================================
   くらしノート — 中継所ごしの取り込み
   =========================================================

   ホーム画面のアプリと Safari は、保存領域が別々です。だからショートカット
   から「URLを開く」でデータを渡しても、それは Safari のほうのくらしノートに
   入り、ホーム画面のほうからは見えません。URLスキームもユニバーサルリンクも
   ネイティブアプリのための仕組みで、Webアプリには使えません。Web Share
   Target は Safari が実装していません。

   端末の中だけで渡す道が全部ふさがっているので、**外を一周させます**。

     ショートカット（無人・毎朝）
       ↓ POST（本文は手入力とまったく同じ「steps=8432」の形）
     中継所（自分で立てる小さな郵便受け。relay/ にコードがあります）
       ↓ GET（取ったら郵便受けからは消える）
     くらしノート

   受け取ったあとは、手入力・貼り付けと **同じ importText() に渡すだけ** です。
   ここが増やすのは入口であって、読み方ではありません。

   窓口のURLそのものが合言葉です。だから設定に置くのは一つだけ。
   ヘッダを足さないのにも理由があって、追加のヘッダを付けるとブラウザが
   事前問い合わせ（preflight）を挟み、中継所側で受け止める作りが要ります。
   合言葉をURLに含めれば、ただの GET で済みます。 */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const TIMEOUT = 8000;

  const url = () => String(store.get().settings.healthRelayUrl || "").trim();
  const configured = () => /^https:\/\/\S+$/.test(url());

  /** 設定の画面に出す用。合言葉ごと出さずに、どこに繋がっているかだけ。 */
  function host() {
    try { return new URL(url()).host; } catch (err) { return ""; }
  }

  function setUrl(v) {
    const clean = String(v || "").trim();
    store.update((s) => { s.settings.healthRelayUrl = clean; });
    return clean;
  }

  /**
   * 郵便受けを覗きます。
   * @returns {Promise<{ok:boolean, text:string|null, error?:string}>}
   *   text が null なら「繋がったが、届いていない」。
   *   ok が false なら「繋がらなかった」——理由を添えます。
   */
  function pull() {
    if (!configured()) {
      return Promise.resolve({ ok: false, text: null, error: "中継所が設定されていません" });
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT) : null;

    return fetch(url(), {
      method: "GET",
      // 途中の誰かが覚えていた古い便を渡してこないように。
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then((res) => {
        // 204 は「郵便受けは空」。異常ではありません。
        if (res.status === 204) return { ok: true, text: null };
        if (!res.ok) return { ok: false, text: null, error: `中継所が ${res.status} を返しました` };
        return res.text().then((t) => ({ ok: true, text: String(t == null ? "" : t) }));
      })
      .catch((err) => ({
        ok: false, text: null,
        error: err && err.name === "AbortError"
          ? "中継所が時間内に答えませんでした"
          : "中継所に繋がりませんでした（電波か、URLか、中継所の設定）",
      }))
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  /**
   * 郵便受けから取って、そのまま取り込みます。
   * 読み方は手入力とまったく同じ道です。
   * @returns {Promise<{ok:boolean, empty?:boolean, error?:string, …importTextの結果}>}
   */
  function pullAndImport() {
    return pull().then((res) => {
      if (!res.ok) return { ok: false, error: res.error, added: 0, updated: 0, skipped: 0 };
      if (res.text == null || !res.text.trim()) {
        return { ok: false, empty: true, error: "中継所に新しいデータはありません",
                 added: 0, updated: 0, skipped: 0 };
      }
      return { ...KN.healthSync.importText(res.text), text: res.text };
    });
  }

  /**
   * 設定の画面から「つないでみる」。
   *
   * 覗くだけにはできません。中継所は **渡したら消す** 作りなので、
   * 「試しに取ってきて、中身は捨てる」はその日のデータを捨てることに
   * なります。だから届いていた場合はそのまま取り込み、取り込んだと
   * 言います。試したせいで一日ぶん失くすほうが、よほど困ります。
   */
  function test() {
    return pull().then((res) => {
      if (!res.ok) return { ok: false, message: res.error };
      if (res.text == null || !res.text.trim()) {
        return { ok: true, empty: true,
                 message: "繋がりました。いまは空です（ショートカットを一度走らせてください）" };
      }
      const look = KN.healthSync.preview(res.text);
      if (!look.ok) {
        return { ok: true, message: `繋がりましたが、中身が読めません（${look.error}）`, text: res.text };
      }
      const done = KN.healthSync.importText(res.text);
      return {
        ok: true,
        imported: done,
        message: `繋がりました。${look.rows.length}件が届いていたので、そのまま取り込みました（`
          + KN.healthSync.describe(done) + "）",
        text: res.text,
      };
    });
  }

  KN.healthRelay = { configured, url, setUrl, host, pull, pullAndImport, test };
})();
