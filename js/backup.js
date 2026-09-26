/* =========================================================
   くらしノート — automatic local snapshots

   A page cannot write files to the phone on its own, so "automatic
   backup" here means rolling copies kept in the app's own storage.
   They cover the accidents that actually happen — a stray「すべて削除」,
   a restore from the wrong file — but not a lost or wiped phone, so the
   manual export is still nudged once the data is worth protecting.
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { today } = KN.util;
  const store = KN.store;

  // Kept apart from the live data so「すべて削除」cannot take the snapshots with it.
  const SNAP_KEY = "kaimono-note-snapshots";

  /* ---- どれくらいの頻度で、どれだけ残すか ----

     一日一回でした。**朝7時に取った控えしか無くて、そこまでしか戻せない**、
     という目に遭ったので変えます。一日ぶんの書きものを失うのと、一時間ぶんを
     失うのとでは、痛みがまるで違います。

     ただ「毎時間ぜんぶ残す」は選べません。控えは live のデータと同じ
     localStorage（端末ぜんぶで 5MB ほど）に入るので、増やしすぎると
     **控えが本体を追い出します**。それでは元も子もない。

     なので、時間の粗さを段にします。

       ・直近 2日ぶんは、一時間に一つ（＝細かく戻せる）
       ・それより古いものは、一日一つだけ（＝遠くまで戻れる）
       ・全部で 14日ぶんまで
       ・いちばん新しいものは、いつでも必ず残す

     **取るのと、残すのを分けます。** 取るほうは遠慮しません——アプリを
     離れるたびに、中身が変わっていれば取ります（書き終えて閉じた直後に
     消えるのが、いちばん痛い失い方なので）。数が増えすぎないようにする
     のは、書き込むときに間引く prune の仕事です。取る側で我慢すると、
     「書いて、すぐ閉じた」ぶんが取れません。

     近いところは細かく、遠いところは粗く。写真の縮小版と同じ考え方です。
     容量にも上限を置いて、超えたら**細かいほうから**間引きます——
     一日一つの背骨は最後まで残します。 */
  const EVERY_MS = 60 * 60 * 1000;     // 開いているあいだは、一時間おき
  const FINE_DAYS = 2;                 // ここまでは一時間おきで残す
  const KEEP_DAYS = 14;                // これより古いものは捨てる
  const BUDGET = 1_500_000;            // 控え全部で、だいたいこのバイト数まで
  // 昔の呼び名。設定画面などが見ているので残します。
  const KEEP = 24 * FINE_DAYS + KEEP_DAYS;
  const REMIND_AFTER_DAYS = 30;
  const REMIND_MIN_PRODUCTS = 5;
  const REMIND_MIN_TODOS = 5;
  const REMIND_MIN_DIET_RECORDS = 5;

  function read() {
    try {
      const list = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  /* 日と時の区切りは**ローカル**で。控えの時刻は today()（UTC の ISO）なので、
     先頭10文字で切ると UTC の日——日本時間では朝9時で日が替わっていて、
     「一日一つ」に残るのが、その日の終わりではなく翌朝9時前の状態でした
     （CLAUDE.md「日をまたぐ集計は必ず dayKey() 系で揃える」）。 */
  const dayOf = (iso) => KN.util.dayKey(new Date(iso));
  const hourOf = (iso) => {
    const d = new Date(iso);
    return `${KN.util.dayKey(d)}T${d.getHours()}`;
  };

  /* 戻せない操作の直前に取った控え。確認の文が「直前の状態は自動
     バックアップに残る」と約束しているものです。**時・日の間引きに
     かけません**（14日たつまで残す）。前は「一時間に一つ」の間引きに
     そのままかけていたので、戻したあと・サンプルを入れたあとに同じ
     一時間のうちにアプリを離れると、その控えに押し出されていました。 */
  const PINNED = new Set(["削除前", "復元前", "サンプル読込前"]);
  const pinned = (s) => !!s && PINNED.has(s.reason);

  /* 容量が足りないときに、次に手放す一つ。**細かいほう（直近の一時間おき）
     の古いものから**、それが無くなったら古い日から。戻せない操作の直前の
     控えは、そのあと。いちばん新しい一つは最後まで残します。prune の上限と、
     本体の保存を通すための makeRoom が、同じ順番で手放すように一つにして
     あります。 */
  function dropOne(list) {
    if (list.length <= 1) return [];
    const fineFrom = Date.now() - FINE_DAYS * 86400000;
    const last = list.length - 1;
    let cut = -1;
    for (let i = 0; i < last && cut < 0; i++) {
      if (!pinned(list[i]) && new Date(list[i].at).getTime() >= fineFrom) cut = i;
    }
    for (let i = 0; i < last && cut < 0; i++) {
      if (!pinned(list[i])) cut = i;
    }
    if (cut < 0) cut = 0;
    return list.slice(0, cut).concat(list.slice(cut + 1));
  }

  /** 残すものを選びます。近いところは一時間おき、遠いところは一日一つ。 */
  function prune(list) {
    if (list.length <= 1) return list.slice();
    const now = Date.now();
    const fineFrom = now - FINE_DAYS * 86400000;
    const oldest = now - KEEP_DAYS * 86400000;

    const newest = list[list.length - 1];
    const keep = [];
    const dailyTaken = new Set();

    // 新しいほうから見て、細かい窓の中は全部、外は日に一つ。
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      const t = new Date(s.at).getTime();
      if (!isFinite(t) || t < oldest) continue;
      // 戻せない操作の直前の控えは、間引かない（上の PINNED）。
      if (pinned(s)) { keep.push(s); continue; }
      /* 細かい窓の中は、一時間に一つだけ（新しいほうから見ているので、
         その時間のいちばん新しいものが残ります）。ただし、いちばん新しい
         一つは無条件で残します——「たった今の状態」は必ず要るので。 */
      if (t >= fineFrom) {
        const h = hourOf(s.at);
        if (s === newest || !dailyTaken.has("h:" + h)) {
          dailyTaken.add("h:" + h);
          keep.push(s);
        }
        continue;
      }
      const d = dayOf(s.at);
      if (dailyTaken.has(d)) continue;
      dailyTaken.add(d);
      keep.push(s);
    }
    keep.reverse();
    if (!keep.length) keep.push(newest);   // いちばん新しいものは必ず残す

    /* 容量。超えていたら、**細かいほうから**間引きます——一日一つの背骨は
       最後まで残したいので、細かい窓の中の古いものから落とします。
       いちばん新しいものには手を付けません。 */
    const size = (l) => JSON.stringify(l).length;
    let out = keep;
    while (out.length > 1 && size(out) > BUDGET) out = dropOne(out);
    return out;
  }

  function write(list) {
    /* 控えが本体を押しのけてはいけないので、入りきらなければ古いものから
       落として書き直します。**一つも入らなかったときは、何も書かずに
       引き下がります。** 前はここで控えをまるごと消していました——
       「削除前」の控えが取れなかったうえに、それまでの控えまで失います。
       本体の保存が容量で落ちたときに場所を空けるのは、makeRoom の仕事です。 */
    let keep = prune(list);
    while (keep.length) {
      try {
        localStorage.setItem(SNAP_KEY, JSON.stringify(keep));
        return true;
      } catch (err) {
        keep = keep.slice(1);
      }
    }
    return false;
  }

  /* 数は store と同じ物差しで（countsOf）。前は買うものの三つだけで、
     やること・daily・ダイエットの変化が、どの控えに入っているのか
     一覧から見分けられませんでした。 */
  function summarize(state) {
    return store.countsOf(state);
  }

  // やること・ダイエットの記録も守る対象なので、買い物が空でも
  // どちらかに中身があれば「空ではない」とみなします。
  function dietRecordCount(state) {
    const d = (state && state.diet) || {};
    return (d.weights || []).length + (d.meals || []).length
      + (d.health || []).length + (d.drinks || []).length + (d.foods || []).length
      // 飲みたくなったときの記録も、失って痛いものなので数えます。ここに
      // 足さないと、それしか書いていない人の控えが「空」と判定されます。
      + (d.urges || []).length;
  }

  /* daily も数えます。前は買うもの・やること・ダイエットしか見ておらず、
     daily しか書いていない人の state は「空」とされて、控えを一つも取らず
     ——「削除前」「復元前」の控えも取らないまま、確認の文だけが「直前の
     状態は自動バックアップに残る」と言っていました（urges を足したときに
     塞いだのと同じ種類の穴）。 */
  function isEmpty(state) {
    const c = store.countsOf(state);
    return !(c.products || c.stores || c.items || c.todos || c.days || c.entries || c.diet);
  }

  /**
   * 控えを取って、どうなったかを返します。
   *   "taken"  取れた
   *   "same"   いまと同じ中身が、もういちばん新しい控えにある
   *   "empty"  守るものが無い
   *   "failed" 容量が足りず、書けなかった（それまでの控えはそのまま）
   * 戻せない操作の前は、これを見て「failed なら進む前に知らせる」こと。
   */
  function take(reason) {
    const state = store.get();
    if (isEmpty(state)) return "empty";

    const list = read();
    const payload = JSON.stringify(state);

    // Skip an identical repeat, otherwise simply opening the app on quiet days
    // would push the genuinely different older snapshots out of the window.
    const last = list[list.length - 1];
    if (last && last.payload === payload) return "same";

    list.push({ at: today(), reason: reason || "自動", payload, summary: summarize(state) });
    return write(list) ? "taken" : "failed";
  }

  /** Store the current state. Returns false when nothing new was kept. */
  function snapshot(reason) {
    return take(reason) === "taken";
  }

  /**
   * 本体（kaimono-note-v2）の保存が容量で落ちたときに、store から呼ばれます。
   * 控えを dropOne の順で一つずつ手放し、そのたびに本体を書き直してみて、
   * **書けた時点で止めます。** 本体が書けたら true。手放したことは一度だけ
   * 知らせます——黙って減らすと、戻せるつもりの人が戻せなくなるので。
   */
  function makeRoom(tryWrite) {
    let list = read();
    let dropped = 0;
    while (list.length) {
      list = dropOne(list);
      dropped++;
      try {
        if (list.length) localStorage.setItem(SNAP_KEY, JSON.stringify(list));
        else localStorage.removeItem(SNAP_KEY);
      } catch (err) {
        continue;   // 縮めた控えすら書けないなら、もう一つ手放す
      }
      try { tryWrite(); } catch (err) { continue; }
      if (KN.ui) KN.ui.toast(`空きが足りないので、自動バックアップを${dropped}件減らして保存しました`);
      return true;
    }
    return false;
  }

  /**
   * 設定に出すための数。本体と控えが同じ localStorage の枠（iPhone でおよそ
   * 5MB）を分け合っているので、どちらがどれだけ使っているかを出します。
   * 字数は保存している形（JSON）の文字数です。
   *
   * `fits` は、控えの上限（BUDGET）に、いまの大きさの控えが何件入るか。
   * 一日一つの背骨（最大12件）といちばん新しい一つが入りきらなくなると、
   * 直近2日の一時間おきの控えは残せません（prune が細かいほうから落とす）。
   */
  function usage() {
    const list = read();
    const live = store.get();
    const liveChars = JSON.stringify(live).length;
    const last = list[list.length - 1];
    const per = last ? JSON.stringify(last).length : Math.round(liveChars * 1.15);
    const diaryChars = ((live.archive && live.archive.days) || [])
      .reduce((n, d) => n + String((d && d.memo) || "").length, 0);
    const fineFrom = Date.now() - FINE_DAYS * 86400000;
    let snapChars = 0;
    try { snapChars = (localStorage.getItem(SNAP_KEY) || "").length; } catch (err) { /* 読めない端末 */ }
    return {
      liveChars, diaryChars, snapChars,
      count: list.length,
      fine: list.filter((s) => new Date(s.at).getTime() >= fineFrom).length,
      fits: Math.max(1, Math.floor(BUDGET / Math.max(1, per))),
      tight: Math.floor(BUDGET / Math.max(1, per)) < KEEP_DAYS - FINE_DAYS + 2,
    };
  }

  /** 前の控えから `gap` ミリ秒あいていれば、一つ取ります。 */
  function maybeEvery(gap, reason) {
    const list = read();
    const last = list[list.length - 1];
    if (last) {
      const t = new Date(last.at).getTime();
      if (isFinite(t) && Date.now() - t < gap) return false;
    }
    return snapshot(reason || "自動");
  }

  /** 一時間おき。開いているあいだと、開いた時。 */
  function maybeHourly() { return maybeEvery(EVERY_MS, "自動"); }

  /* 昔の名前。一日一回だったころの呼び出し元が残っていても動くように。 */
  function maybeDaily() { return maybeHourly(); }

  /** Newest first. */
  function list() {
    return read().slice().reverse();
  }

  /**
   * 控えへ戻します。戻すこと自体をやり直せるように、先に一つ取ります
   * （found は先に読んであるので、この一つに prune で押し出されても戻せます）。
   * **取れなかったら戻しません**——`code: "keep-failed"` の Error を投げるので、
   * 画面で知らせて、それでもと言われたら `{ force: true }` で呼び直すこと。
   */
  function restore(at, opts) {
    const found = read().find((s) => s.at === at);
    if (!found) throw new Error("その控えが見つかりません");
    if (take("復元前") === "failed" && !(opts && opts.force)) {
      const err = new Error("いまの状態を控えに残せませんでした");
      err.code = "keep-failed";
      throw err;
    }
    store.importJSON(found.payload);
  }

  function clear() {
    try { localStorage.removeItem(SNAP_KEY); } catch (err) { /* already gone */ }
  }

  /* ---------------- off-device export nudge ---------------- */

  function lastExportAt() {
    const st = store.get();
    return (st.settings && st.settings.lastExportAt) || null;
  }

  /* **保存できたと分かったときだけ**呼ぶこと（押した瞬間ではなく）。
     `at` はそのファイルの書き出し日時。保存したファイルを確かめたときにも
     呼ぶので、前の記録より古い日時では巻き戻しません。 */
  function markExported(at) {
    const t = at || today();
    store.update((s) => {
      const cur = s.settings.lastExportAt;
      if (!cur || !(new Date(cur).getTime() >= new Date(t).getTime())) s.settings.lastExportAt = t;
    });
  }

  /** True once there is real data and no file has been written out in a while. */
  function exportDue() {
    const st = store.get();
    const worth = (st.products || []).length >= REMIND_MIN_PRODUCTS
      || (st.todos || []).length >= REMIND_MIN_TODOS
      || dietRecordCount(st) >= REMIND_MIN_DIET_RECORDS;
    if (!worth) return false;
    const last = lastExportAt();
    if (!last) return true;
    const days = (Date.now() - new Date(last).getTime()) / 86400000;
    return !(days < REMIND_AFTER_DAYS);
  }

  /* 自動の控えは取り続けますが、**催促はしません**。
     頼んでもいないのに出る知らせは、出るたびに読み飛ばす癖をつけます。
     そうなると、本当に伝えたいこと（取り込めた／取り込めなかった）まで
     一緒に読み飛ばされます。書き出しどきかどうかは exportDue() が
     答えるので、設定の画面に「前回いつ書き出したか」として静かに出ます。 */
  function init() {
    maybeHourly();

    /* **アプリを離れるとき**は、いちばん取りたい瞬間です。書き終えて
       閉じた直後に消えるのが、いちばん痛い失い方なので、ここは時間を
       置かずに取ります。中身が前と同じなら snapshot 側が見送るので、
       ただ行き来しているだけでは増えません。数が増えたぶんは、書き込む
       ときに prune が一時間に一つへ間引きます。 */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") snapshot("離れる前");
    });
    window.addEventListener("pagehide", () => snapshot("離れる前"));

    /* 開いたままの人のために。5分ごとに「一時間たったか」を見るだけで、
       たっていなければ何もしません（読むだけなので軽い）。 */
    setInterval(maybeHourly, 5 * 60 * 1000);
  }

  KN.backup = {
    SNAP_KEY, KEEP, EVERY_MS, FINE_DAYS, KEEP_DAYS, BUDGET,
    snapshot, take, makeRoom, usage,
    maybeDaily, maybeHourly, maybeEvery, prune, list, restore, clear,
    lastExportAt, markExported, exportDue,
    init,
  };
})();
