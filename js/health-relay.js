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

  /* ---------------- iPhoneだけで建てるための道具 ----------------

     パソコンがあれば、道（合言葉）は `openssl rand -hex 8` で作れます。
     iPhoneにはそれがありません。人が思いつく「適当な文字列」は、
     だいたい適当ではない——生年月日や名前が混ざります。だから
     ここで作ります。crypto は端末の中で完結するので、外には出ません。 */

  /* 紛らわしい四文字（l 1 o 0）を落とすと、ちょうど32文字になります。
     32は 2^32 を割り切るので、% で剰余を取っても偏りません。33文字だと
     先頭のいくつかがわずかに出やすくなる——読み写す人のために字を選んだら、
     数のほうも都合が良くなった、という順です。 */
  const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";  // 32文字

  /** @returns {string} 例 "/kn-7f3a9c1d4e8b2h6k" */
  function makePath(len) {
    const n = len || 16;
    const out = new Array(n);
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(n);
      window.crypto.getRandomValues(buf);
      for (let i = 0; i < n; i++) out[i] = ALPHABET[buf[i] % ALPHABET.length];
    } else {
      // ここに落ちる端末はまず無いが、落ちたときに弱い道を黙って配らない。
      for (let i = 0; i < n; i++) out[i] = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return "/kn-" + out.join("");
  }

  /**
   * WorkerのURLと道を、一本に組み立てます。
   *
   * 指で長いURLを継ぎ足すのは、間違える上に確かめにくい作業です。
   * Cloudflareからは "https://xxx.workers.dev" を、道はこのアプリが
   * 作ったものを——それぞれ**貼るだけ**にして、繋ぐのはこちらでやります。
   *
   * 道がすでに付いているURLを渡されたら、そのまま返します（付け直すと
   * 二重になるので）。
   */
  function joinUrl(base, path) {
    const b = String(base || "").trim().replace(/\/+$/, "");
    const p = String(path || "").trim();
    if (!b) return "";
    let tail = "";
    try { tail = new URL(b).pathname; } catch (err) { return b; }
    if (tail && tail !== "/") return b;                    // もう道が付いている
    if (!p) return b;
    return b + (p.charAt(0) === "/" ? p : "/" + p);
  }

  /**
   * 郵便受けを覗きます。
   * @returns {Promise<{ok:boolean, text:string|null, error?:string, replaced?:boolean}>}
   *   text が null なら「繋がったが、届いていない」。
   *   ok が false なら「繋がらなかった」——理由を添えます。
   *   replaced が true なら、いま受け取った便が届く前に別の便が来ていて、
   *   読まれないまま上書きされていたということ（郵便受けは一通しか
   *   持てないので）。古い中継所（この印を返さないバージョン）では、
   *   常に付きません——アプリ側は付いていなければ何も言いません。
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
        const replaced = res.headers.get("X-Kn-Replaced") === "1";
        return res.text().then((t) => ({ ok: true, text: String(t == null ? "" : t), replaced }));
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
   *
   * 中継所に置かれるのは、無人のショートカットが書いたものです。人が
   * 目で見て押した貼り付けとはそこが違うので、`auto` を立てて渡します
   * ——iPhoneがロックされていて読めなかった便（"Protected health data is
   * inaccessible"、あるいは 0 の羅列）を、記録として入れないために。
   * 断ったときは locked:true が付いて返り、**いまある記録は動きません**。
   *
   * @returns {Promise<{ok:boolean, empty?:boolean, locked?:boolean, error?:string, …importTextの結果}>}
   */
  function pullAndImport() {
    return pull().then((res) => {
      if (!res.ok) return { ok: false, error: res.error, added: 0, updated: 0, skipped: 0 };
      if (res.text == null || !res.text.trim()) {
        return { ok: false, empty: true, error: "中継所に新しいデータはありません",
                 added: 0, updated: 0, skipped: 0 };
      }
      const out = { ...KN.healthSync.importText(res.text, { auto: true }), text: res.text,
                     replaced: !!res.replaced };
      // 読めなかった便が来たことは、覚えておきます（画面で言えるように）。
      if (out.locked) store.markSyncLocked();
      return out;
    });
  }

  /* ---------------- 建てたあと、本当に動くか ----------------

     パソコンなら curl で「置く・取る・消える」を確かめられます。iPhoneには
     それがないので、アプリが自分で一往復します。

     手順を踏み外さないように、**先に郵便受けを空にしてから**試します。
     いきなり試しの便を置くと、ショートカットが朝に置いた本物を押し流す
     ことになるので、まず取って（＝取り込んで）から置きます。

     ここが全部通るのに取り込めないなら、悪いのは中継所ではありません。 */
  function selfTest(candidate) {
    const target = String(candidate || url() || "").trim();
    const steps = [];
    const note = (name, ok, detail) => { steps.push({ name, ok, detail: detail || "" }); return ok; };
    const done = (ok, message) => ({ ok, message, steps });

    if (!/^https:\/\/\S+$/.test(target)) {
      return Promise.resolve(done(false, "https:// で始まるURLを入れてください"));
    }
    const ask = (opts) => {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT) : null;
      return fetch(target, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined, ...opts })
        .finally(() => { if (timer) clearTimeout(timer); });
    };

    // 試しの便。本物と同じ形にしておくと、読み取りまで一緒に試せます。
    const probe = "day=" + KN.util.todayKey() + "\nsteps=1234";
    let imported = null;

    // ① まず空にする（残っていたら捨てずに取り込む）
    return ask({ method: "GET" })
      .then((res) => (res.status === 204 ? null : res.text()))
      .then((waiting) => {
        if (waiting && waiting.trim()) {
          const look = KN.healthSync.preview(waiting);
          if (look.ok) imported = KN.healthSync.importText(waiting);
        }
        // ② 置く
        return ask({ method: "POST", body: probe });
      })
      .then((res) => {
        if (!note("置けた", res.ok, "POST " + res.status)) {
          throw new Error(res.status === 404
            ? "道が違います（RELAY_PATH と、アプリのURLの終わりを見比べてください）"
            : res.status === 500
              ? "中継所の設定が足りません（RELAY_PATH か、KVの結び付け）"
              : `中継所が ${res.status} を返しました`);
        }
        // ③ 取る
        return ask({ method: "GET" });
      })
      .then((res) => res.text().then((body) => ({ res, body })))
      .then(({ res, body }) => {
        note("置いたものがそのまま取れた", res.status === 200 && body === probe,
          res.status === 200 ? "" : "GET " + res.status);
        // ④ 消えている
        return ask({ method: "GET" });
      })
      .then((res) => {
        note("渡したら消えた", res.status === 204,
          res.status === 204 ? "" : `二度目が ${res.status}（同じ便が二度届きます）`);
        // ⑤ 道が合言葉になっている
        return fetch(target + "x", { cache: "no-store" });
      })
      .then((res) => {
        note("道が違えば渡さない", res.status === 404, `${res.status}`);
        const bad = steps.filter((s) => !s.ok);
        return done(bad.length === 0,
          bad.length === 0
            ? "中継所は正しく動いています" + (imported && imported.ok
                ? "（待っていたデータも取り込みました：" + KN.healthSync.describe(imported) + "）"
                : "")
            : bad[0].name + "…で止まりました" + (bad[0].detail ? "（" + bad[0].detail + "）" : ""));
      })
      .catch((err) => done(false,
        err && err.name === "AbortError"
          ? "中継所が時間内に答えませんでした"
          : (err && err.message) || "中継所に繋がりませんでした"));
  }

  KN.healthRelay = { configured, url, setUrl, host, pull, pullAndImport,
                     makePath, joinUrl, selfTest };
})();
