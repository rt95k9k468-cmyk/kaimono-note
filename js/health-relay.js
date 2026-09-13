/* =========================================================
   くらしノート — 中継所ごしの取り込み
   =========================================================

   ホーム画面のアプリと Safari は、保存領域が別々です。だからショートカット
   から「URLを開く」でデータを渡しても、それは Safari のほうのくらしノートに
   入り、ホーム画面のほうからは見えません。URLスキームもユニバーサルリンクも
   ネイティブアプリのための仕組みで、Webアプリには使えません。Web Share
   Target は Safari が実装していません。

   端末の中だけで渡す道が全部ふさがっているので、**外を一周させます**。

     ショートカット（無人・一時間おき）
       ↓ POST（本文は手入力とまったく同じ「steps=8432」の形）
     中継所（自分で立てる小さな郵便受け。relay/ にコードがあります）
       ↓ GET（消えません。版が変わっていなければ 204）
     くらしノート

   受け取ったあとは、手入力・貼り付けと **同じ importText() に渡すだけ** です。
   ここが増やすのは入口であって、読み方ではありません。

   窓口のURLそのものが合言葉です。だから設定に置くのは一つだけ。
   ヘッダを足さないのにも理由があって、追加のヘッダを付けるとブラウザが
   事前問い合わせ（preflight）を挟み、中継所側で受け止める作りが要ります。
   合言葉をURLに含めれば、ただの GET で済みます。

   ---- ここが「取りに行く頻度」を持っています ----

   前は、覗きに行くのは **ダイエットと daily の画面が出ているときだけ** でした。
   やること・買うものを見ているあいだは一度も覗かず、開きっぱなしにすれば
   二度と覗きません（他アプリから戻ってきたときしか合図が無かったため）。
   一時間おきに届いていても、画面の数字が数時間前のままだったのはこれです。

   だから見張りをこちらへ移しました（`watch()`）。画面がどれであっても、
   **見えているあいだは静かに覗き続けます**。中継所が新しい形なら、
   新しい便が無いときの返事は 204 ——中身を読まずに済むので、何度覗いても
   タダです。 */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const TIMEOUT = 8000;

  /* 便と便の仕切り（中継所が付けます）。ASCII の RS。 */
  const SEP = "\u001E";

  const url = () => String(store.get().settings.healthRelayUrl || "").trim();
  const configured = () => /^https:\/\/\S+$/.test(url());

  /** 設定の画面に出す用。合言葉ごと出さずに、どこに繋がっているかだけ。 */
  function host() {
    try { return new URL(url()).host; } catch (err) { return ""; }
  }

  function setUrl(v) {
    const clean = String(v || "").trim();
    const moved = clean !== url();
    store.update((s) => {
      s.settings.healthRelayUrl = clean;
      /* 郵便受けが**変わった**なら、版も別の数え方になります。持ち越すと、
         新しい中継所の最初の便を「もう見た」と読み違えます。同じURLを
         押し直しただけのときは触りません（覚え直すたびに全部を取り込み
         直すことになるので）。 */
      if (moved) s.settings.healthRelayVer = "";
    });
    if (moved) seen.length = 0;
    /* 建てた直後に、その場で覗きにいきます。ここが無いと、見張りは
       「設定されていない」と見て拍を掛けずに終わっているので、次に画面を
       開くまで一度も覗きません（建てたばかりの人が、いちばん動いてほしい
       ところで何も起きない）。 */
    if (clean) pullNow({ boost: BOOST_RESUME });
    return clean;
  }

  /* ---------------- 版（どこまで見たか） ----------------

     新しい中継所は、渡した便を消しません。かわりに「いちばん新しい便を
     置いた時刻」を版として返します。こちらは最後に見た版を覚えていて、
     `?since=` で送ります。同じなら 204。

     消さないことが効くのは、**断った便で郵便受けが空にならない**ところです。
     iPhoneがロックされているあいだに走ったショートカットは 0 の羅列を置き、
     こちらはそれを正しく断ります。前はその時点で郵便受けが空になっていたので、
     次にショートカットが走るまで何も入りませんでした。 */

  const seenVer = () => String(store.get().settings.healthRelayVer || "");

  function rememberVer(v) {
    const s = String(v == null ? "" : v).trim();
    if (!s || s === seenVer()) return;
    store.update((st) => { st.settings.healthRelayVer = s; });
  }

  /** 版だけを足した（あるいは外した）URL。元の問い合わせは壊しません。 */
  function withSince(base, since) {
    try {
      const u = new URL(base);
      if (since) u.searchParams.set("since", since);
      else u.searchParams.delete("since");
      return u.toString();
    } catch (err) { return base; }
  }

  /* ---------------- もう通した一通は、もう一度通さない ----------------

     中継所は「ひとつ前 → いま」を並べて渡します（ロック中の空振りが良い便を
     踏み潰さないための仕掛けです）。ひとつ前は、たいてい**さっき取り込んだ
     それ**なので、もう一度通しても記録は悪くなりませんが、「1件を更新」と
     言われるのは報告ではなく騒音です。通った一通は覚えておいて落とします。

     覚えるのは、このセッションのあいだだけです。読み直しても記録は
     変わらないので、保存してまで持つ値ではありません。 */
  const seen = [];
  const SEEN_MAX = 8;

  function fingerprint(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return s.length + ":" + h;
  }

  function dropSeen(text) {
    return String(text).split(SEP)
      .filter((p) => p.trim() && seen.indexOf(fingerprint(p)) < 0)
      .join(SEP);
  }

  function rememberParts(text) {
    String(text).split(SEP).forEach((p) => {
      if (!p.trim()) return;
      const f = fingerprint(p);
      if (seen.indexOf(f) < 0) seen.push(f);
    });
    while (seen.length > SEEN_MAX) seen.shift();
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
   * @returns {Promise<{ok:boolean, text:string|null, ver:string|null,
   *                    parts:number, modern:boolean, error?:string}>}
   *   text が null なら「繋がったが、新しい便は無い」。
   *   ok が false なら「繋がらなかった」——理由を添えます。
   *   modern が false なら、相手は**渡したら消す古い中継所**です。
   */
  function pull() {
    if (!configured()) {
      return Promise.resolve({ ok: false, text: null, ver: null, parts: 0,
                               modern: false, error: "中継所が設定されていません" });
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT) : null;

    return fetch(withSince(url(), seenVer()), {
      method: "GET",
      // 途中の誰かが覚えていた古い便を渡してこないように。
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then((res) => {
        const ver = res.headers.get("X-Kn-Ver");
        const parts = Number(res.headers.get("X-Kn-Parts") || 0) || 0;
        const modern = ver != null;
        // 204 は「新しい便は無い」。異常ではありません。
        if (res.status === 204) return { ok: true, text: null, ver, parts: 0, modern };
        if (!res.ok) {
          return { ok: false, text: null, ver, parts: 0, modern,
                   error: `中継所が ${res.status} を返しました` };
        }
        return res.text().then((t) => ({
          ok: true, text: String(t == null ? "" : t), ver, parts, modern,
        }));
      })
      .catch((err) => ({
        ok: false, text: null, ver: null, parts: 0, modern: false,
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

      const nothing = { ok: false, empty: true, error: "中継所に新しいデータはありません",
                        added: 0, updated: 0, skipped: 0, modern: res.modern };
      if (res.text == null || !res.text.trim()) { rememberVer(res.ver); return nothing; }

      /* さっき通した一通（＝中継所が添えてくる「ひとつ前」）は落とします。
         落とした結果、通すものが無くなることもあります——それは
         「新しい便は無い」と同じです。 */
      const fresh = dropSeen(res.text);
      rememberParts(res.text);
      if (!fresh.trim()) { rememberVer(res.ver); return nothing; }

      let out;
      try {
        out = { ...KN.healthSync.importText(fresh, { auto: true }),
                text: res.text, parts: res.parts, modern: res.modern };
      } catch (err) {
        out = { ok: false, error: "取り込みの途中で落ちました", added: 0, updated: 0, skipped: 0 };
      }
      /* 版は「受け取ったこと」の印で、「うまく入ったこと」の印ではありません。
         断った便をもう一度取りに行っても、同じものが同じように断られるだけ
         なので、ここで進めます。新しい便が来れば版が変わり、また取りにいきます。 */
      rememberVer(res.ver);
      // 読めなかった便が来たことは、覚えておきます（画面で言えるように）。
      if (out.locked) store.markSyncLocked();
      return out;
    });
  }

  /* ---------------- 見張り ----------------

     見えているあいだ、静かに覗き続けます。画面がどれかは見ません——記録は
     store に入り、いま出ている画面は store の変化で描き直されるので
     （app.js の subscribe）、覗く側が画面を選ぶ理由がありません。

     間隔は、届かなければ広げます（1分 → 2分 → 4分 → 5分で頭打ち）。
     届いたら1分に戻します。「いま届いたばかり」のときだけ短く刻む口も
     置いてあります（boost）——ショートカットを起こした直後と、他アプリから
     戻ってきた直後です。中継所のKVは結果整合で、置いたことが伝わるまで
     最大60秒ほどかかるので、一度きりの問い合わせでは取りこぼします。 */

  const WAITS = [60000, 120000, 240000, 300000];
  const BOOST_STEP = 5000;
  const BOOST_RESUME = 20000;      // 他アプリから戻ったとき
  const BOOST_SHORTCUT = 120000;   // ショートカットを起こしたとき

  let timer = 0;
  let step = 0;
  let boostUntil = 0;
  let started = false;

  /* 走っている一回ぶん。二つの入口（拍と、押されたとき）が重ならないように、
     **同じ約束を返します**——断るのではなく相乗りさせるのは、押した人に
     「いま取りに行っています」の返事を返すためです。 */
  let inflight = null;

  function once() {
    if (inflight) return inflight;
    inflight = pullAndImport()
      .catch(() => ({ ok: false, added: 0, updated: 0, skipped: 0 }))
      .then((res) => { inflight = null; return res; });
    return inflight;
  }

  function awake() {
    if (!configured()) return false;
    if (store.get().settings.dietAutoSync === false) return false;
    if (typeof document === "undefined") return true;
    return document.visibilityState === "visible";
  }

  function idle() {
    if (timer) { clearTimeout(timer); timer = 0; }
  }

  function plan() {
    idle();
    if (!awake()) return;
    const wait = Date.now() < boostUntil
      ? BOOST_STEP
      : WAITS[Math.min(step, WAITS.length - 1)];
    timer = setTimeout(beat, wait);
  }

  function beat() {
    timer = 0;
    if (!awake()) return;
    once().then((res) => {
      if (res && res.ok && (res.added || res.updated)) step = 0;
      else step = Math.min(step + 1, WAITS.length - 1);
      plan();
    });
  }

  /**
   * いますぐ一度。画面を開いたとき・押されたときの入口です。
   *
   * 設定の「自動で取り込む」を切ってあれば、**覗きにも行きません**——
   * 切った人が止めたかったのは通信そのものなので、拍だけ止めて開くたびに
   * 一度ずつ覗くのでは、止めたことになりません。
   * ただし**押されたとき（force）は別**です。切ってあっても、自分で押した
   * ぶんは取りに行きます（そこは「自動」ではないので）。
   *
   * @param opts.boost この先どれだけのあいだ短く刻むか（ミリ秒）
   * @param opts.force 自動を切ってあっても取りに行く（押されたとき）
   * @returns {Promise} 取り込みの結果
   */
  function pullNow(opts) {
    const force = !!(opts && opts.force);
    if (opts && opts.boost) boostUntil = Math.max(boostUntil, Date.now() + opts.boost);
    step = 0;
    idle();
    if (!configured()) {
      return Promise.resolve({ ok: false, error: "中継所が設定されていません",
                               added: 0, updated: 0, skipped: 0 });
    }
    if (!force && store.get().settings.dietAutoSync === false) {
      return Promise.resolve({ ok: false, off: true, error: "自動での取り込みは切ってあります",
                               added: 0, updated: 0, skipped: 0 });
    }
    return once().then((res) => { plan(); return res; });
  }

  /** 一度だけ。app.js の立ち上げから呼びます。 */
  function watch() {
    if (started) return;
    started = true;

    const back = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        idle();
        return;
      }
      pullNow({ boost: BOOST_RESUME });
    };

    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", back);
    /* 電波が戻った瞬間も合図です。圏外で落ちた一回ぶんを、次の拍まで
       待たせる理由がありません。 */
    window.addEventListener("online", back);

    back();
  }

  /* ---------------- ショートカットを、その場で走らせる ----------------

     中継所にあるのは「ショートカットが最後に置いたもの」です。だから
     いくら頻繁に覗いても、置かれていなければ新しくなりません。取りに行く
     いちばん確かな道は、**その場でショートカットを走らせる**ことです。

     `shortcuts://` は、ホーム画面のWebアプリからでも開けます。戻り先
     （x-callback の x-success）は**付けません**——ホーム画面のWebアプリへ
     戻る道は iOS に無く、指定すると Safari のほうが開いて、別の保存領域の
     くらしノートが立ち上がります。戻るのは指で構いません。戻ってきた合図は
     visibilitychange が出し、そこから2分間は5秒おきに覗きます
     （ショートカットの実行と、中継所のKVが落ち着くのを待つぶん）。 */

  const shortcutName = () => String(store.get().settings.healthShortcutName || "").trim();

  function setShortcutName(v) {
    const clean = String(v || "").trim();
    store.update((s) => { s.settings.healthShortcutName = clean; });
    return clean;
  }

  /** @returns {boolean} 走らせに行けたか（名前が無ければ false） */
  function runShortcut(name) {
    const n = String(name == null ? shortcutName() : name).trim();
    if (!n) return false;
    boostUntil = Math.max(boostUntil, Date.now() + BOOST_SHORTCUT);
    try {
      location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(n);
      return true;
    } catch (err) { return false; }
  }

  /* ---------------- 建てたあと、本当に動くか ----------------

     パソコンなら curl で「置く・取る・消える」を確かめられます。iPhoneには
     それがないので、アプリが自分で一往復します。

     試しの便は **健康データの形をしていないもの** にしてあります
     （`kn-selftest=…`）。渡しても消えない作りになったので、片づけ損ねた
     試しの便がそのまま記録に入る道を、はじめから塞いでおきます。
     置き場所も専用の棚（?slot=kntest）で、本物の便には触れません。

     ここが全部通るのに取り込めないなら、悪いのは中継所ではありません。 */
  function selfTest(candidate) {
    const target = String(candidate || url() || "").trim();
    const steps = [];
    const note = (name, ok, detail) => { steps.push({ name, ok, detail: detail || "" }); return ok; };
    const done = (ok, message) => ({ ok, message, steps });

    if (!/^https:\/\/\S+$/.test(target)) {
      return Promise.resolve(done(false, "https:// で始まるURLを入れてください"));
    }
    const ask = (path, opts) => {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT) : null;
      return fetch(path, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined, ...opts })
        .finally(() => { if (timer) clearTimeout(timer); });
    };
    const slot = (u) => {
      try { const x = new URL(u); x.searchParams.set("slot", "kntest"); return x.toString(); }
      catch (err) { return u; }
    };

    const probe = "kn-selftest=" + Math.random().toString(36).slice(2, 10);
    let modern = false;
    let ver0 = "";
    let imported = null;

    /* ① いま何が待っているかを見ます。古い中継所ではこの GET が郵便受けを
       空にしてしまうので、返ってきたものは**捨てずに取り込みます**。 */
    return ask(target, { method: "GET" })
      .then((res) => {
        modern = res.headers.get("X-Kn-Ver") != null;
        ver0 = res.headers.get("X-Kn-Ver") || "";
        note("中継所が新しい形（渡しても消えない）", modern,
          modern ? "" : "古い形です。設定の「中継所のコードをコピー」から置き直してください");
        return res.status === 204 ? null : res.text();
      })
      .then((waiting) => {
        if (waiting && waiting.trim()) {
          const look = KN.healthSync.preview(waiting);
          if (look.ok) imported = KN.healthSync.importText(waiting, { auto: true });
        }
        // ② 置く（専用の棚へ）
        return ask(slot(target), { method: "POST", body: probe });
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
        return ask(modern ? withSince(target, ver0) : target, { method: "GET" });
      })
      .then((res) => res.text().then((body) => ({ res, body })))
      .then(({ res, body }) => {
        note("置いたものがそのまま取れた",
          res.status === 200 && body.split(SEP).indexOf(probe) >= 0,
          res.status === 200 ? "" : "GET " + res.status);
        const ver1 = res.headers.get("X-Kn-Ver") || "";
        // ④ 版が同じなら、もう渡してこない（＝二度読みが起きない）
        return ask(modern ? withSince(target, ver1) : target, { method: "GET" });
      })
      .then((res) => {
        note(modern ? "版が同じなら渡してこない" : "渡したら消えた", res.status === 204,
          res.status === 204 ? "" : `二度目が ${res.status}（同じ便が二度届きます）`);
        // ⑤ 試しの便を片づける（新しい形は消えないので、こちらから捨てます）
        return modern ? ask(slot(target), { method: "DELETE" })
                      : Promise.resolve({ ok: true, status: 200 });
      })
      .then((res) => {
        if (modern) {
          note("試した便を片づけられた", res.ok, res.ok ? "" : "DELETE " + res.status);
        }
        // ⑥ 道が合言葉になっている
        return ask(target + "x", { method: "GET" });
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
                     makePath, joinUrl, selfTest,
                     watch, pullNow, seenVer,
                     shortcutName, setShortcutName, runShortcut,
                     BOOST_SHORTCUT };
})();
