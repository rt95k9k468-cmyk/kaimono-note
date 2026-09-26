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

  /* ---- 置き場は、大きな保存場所（IndexedDB）へ（2026年9月26日） ----

     控えは前は SNAP_KEY（localStorage）にあって、本体と同じ枠（iPhone で
     およそ5MB）を分け合っていました。日記が伸びると、上限（BUDGET）の
     中に入る世代が黙って減っていく——いちばん先に苦しくなるのが控えでした
     （docs/improvements.md の A2）。いまは js/idb.js の `snaps`（見出し）と
     `snapBodies`（中身）に置きます。

     移し方は日記と同じ：①写す ②読み比べる（一件ずつ、中身が一字も違わ
     ないか）③**元（SNAP_KEY）は消さずに残す**。②で違えば、写したほうを
     捨てて前のまま localStorage に置きます。大きな保存場所が使えない端末・
     使えなかった日も、前のまま。その日に取った控えは、次に使えたときに
     写します（`copiedUpTo` より新しいものだけ）。

     残した元は、もう書き足しません。本体の保存が容量で落ちたときは、
     makeRoom がこれを手放します（写しは大きな保存場所にあるので、戻せる
     控えは減りません）。 */
  let where = "ls";          // "idb"（大きな保存場所）か "ls"（前のまま）
  let heads = read();        // 控えの一覧（古い順）。"idb" では見出しだけ
  let lastPayload = heads.length ? heads[heads.length - 1].payload : null;
  let moved = { phase: "idle" };
  let loading = null;
  let chain = Promise.resolve();   // 控えの読み書きは、一つずつ

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
  const BUDGET = 1_500_000;            // 控え全部で、だいたいこのバイト数まで（localStorage に置くとき）
  /* 大きな保存場所に置くときの上限（字数）。本体と枠を分け合わなくなったので、
     ふつうの大きさなら上の段（直近2日は一時間おき・14日）がそのまま全部入り
     ます。日記が数年ぶん（数MB）になっても、数十世代は残ります。 */
  const BUDGET_IDB = 20_000_000;
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
  /* 「日記の突き合わせ前」は、日記の写し（js/diary-idb.js）が元と写しの
     食い違いを直す前に、置き換わる側の本文を残したもの。これも戻せない
     書き換えの直前なので、同じく間引きません。 */
  const PINNED = new Set(["削除前", "復元前", "サンプル読込前", "日記の突き合わせ前"]);
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

  /** 残すものを選びます。近いところは一時間おき、遠いところは一日一つ。
      `budget` と `sizeOf` を渡さなければ localStorage の上限で、丸ごとの字数で量ります。 */
  function prune(list, budget, sizeOf) {
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
    const cap = budget || BUDGET;
    const size = sizeOf
      ? (l) => l.reduce((n, s) => n + sizeOf(s), 0)
      : (l) => JSON.stringify(l).length;
    let out = keep;
    while (out.length > 1 && size(out) > cap) out = dropOne(out);
    return out;
  }

  /* 大きな保存場所の見出しの大きさ。中身の字数に、見出しのぶんを少し。 */
  const headSize = (h) => (h.size || 0) + 300;
  const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : (a.id || 0) - (b.id || 0));
  const headOf = (s) => ({ at: s.at, reason: s.reason, summary: s.summary, size: String(s.payload || "").length });

  function readHeads() {
    return KN.idb.run(["snaps"], "readonly", (t) => {
      const r = t.objectStore("snaps").getAll();
      return () => (r.result || []).sort(byAt);
    });
  }

  function readBodies(ids) {
    return KN.idb.run(["snapBodies"], "readonly", (t) => {
      const box = t.objectStore("snapBodies");
      const rs = ids.map((id) => box.get(id));
      return () => rs.map((r) => (r.result ? r.result.payload : null));
    });
  }

  /** 一つの控えの中身（字列）。前の置き場のものは、そこから。 */
  async function bodyOf(h) {
    if (!h) return null;
    if (typeof h.payload === "string") return h.payload;
    if (h.ls || where !== "idb") {
      const found = read().find((s) => s.at === h.at);
      return found ? found.payload : null;
    }
    return (await readBodies([h.id]))[0];
  }

  /* 大きな保存場所へ移す（はじめて使うとき）・写す（使えなかった日に
     localStorage へ取ったぶん）。**元は消しません。** 失敗したら例外で、
     呼ぶ側（ensure）が前のまま localStorage に置くと決めます。 */
  async function moveIn() {
    if (!KN.idb || !KN.idb.available()) throw new Error("この端末では、大きな保存場所が使えません");
    const got = await KN.idb.run(["meta"], "readonly", (t) => {
      const m = t.objectStore("meta").get("snaps");
      return () => (m.result ? m.result.v : null);
    });
    const meta = got || {};
    const upTo = String(meta.copiedUpTo || "");
    const legacy = read().filter((s) => s && s.at && typeof s.payload === "string" && String(s.at) > upTo);
    if (legacy.length) {
      // ① 写す（一つの取引で）
      const ids = await KN.idb.run(["snaps", "snapBodies"], "readwrite", (t) => {
        const S = t.objectStore("snaps");
        const B = t.objectStore("snapBodies");
        const out = [];
        legacy.forEach((s, i) => {
          const r = S.add(headOf(s));
          r.onsuccess = () => { out[i] = r.result; B.put({ id: r.result, payload: s.payload }); };
        });
        return () => out;
      });
      // ② 読み比べる
      const bodies = await readBodies(ids);
      const bad = legacy.filter((s, i) => bodies[i] !== s.payload).length;
      if (bad) {
        await KN.idb.run(["snaps", "snapBodies"], "readwrite", (t) => {
          ids.forEach((id) => { t.objectStore("snaps").delete(id); t.objectStore("snapBodies").delete(id); });
        }).catch(() => { /* 捨てられなくても、一覧には出しません */ });
        throw new Error(`写した控えを読み直すと、${bad}件違っていたので、写しを捨てました`);
      }
      // ③ 元は消さない。どこまで写したかだけを覚えます（同じものを二度写さない）。
      const newest = legacy.reduce((m, s) => (String(s.at) > m ? String(s.at) : m), upTo);
      meta.copiedUpTo = newest;
      meta.copied = (meta.copied || 0) + legacy.length;
    }
    if (legacy.length || meta.phase !== "verified") {
      const v = { ...meta, phase: "verified", at: meta.at || today() };
      await KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").put({ k: "snaps", v }); });
    }
    const list = await readHeads();
    const last = list[list.length - 1];
    lastPayload = last ? (await readBodies([last.id]))[0] : null;
    heads = list;
    where = "idb";
    moved = { phase: "on", copied: legacy.length };
  }

  /** 置き場が決まったら果たされる約束（何度呼んでも、読みに行くのは一度）。 */
  function ensure() {
    if (loading) return loading;
    loading = moveIn().catch((err) => {
      console.warn("snapshots stay in localStorage:", err);
      where = "ls";
      heads = read();
      moved = { phase: "off", reason: String((err && err.message) || err) };
    }).then(() => { if (KN.idb) KN.idb.changed(); });
    return loading;
  }

  /* 一つ足して、上限と段に合わせて古いものを手放す——一つの取引で。 */
  async function addIdb(snap, payload) {
    const inBox = heads.filter((h) => !h.ls);
    const next = prune(inBox.concat([snap]), BUDGET_IDB, headSize);
    const drop = inBox.filter((h) => next.indexOf(h) < 0);
    const id = await KN.idb.run(["snaps", "snapBodies"], "readwrite", (t) => {
      const S = t.objectStore("snaps");
      const B = t.objectStore("snapBodies");
      const r = S.add(snap);
      r.onsuccess = () => B.put({ id: r.result, payload });
      drop.forEach((h) => { S.delete(h.id); B.delete(h.id); });
      return () => r.result;
    });
    snap.id = id;
    heads = next.concat(heads.filter((h) => h.ls)).sort(byAt);
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
   *
   * **約束（Promise）で返ります**（大きな保存場所は「あとで返事が来る」ので）。
   * 日記の写し（js/diary-idb.js）の突き合わせが済むのを待ってから取ります
   * ——済む前に取ると、写しから戻るはずの本文が抜けた控えになりうるので。
   * `opts.now` はその突き合わせ自身が使うもので、待ちません（待つと互いを
   * 待ちあって止まる）。`opts.state` を渡すと、いまの state の代わりにそれを。
   */
  function take(reason, opts) {
    const o = opts || {};
    const gate = !o.now && KN.diaryIdb ? KN.diaryIdb.ready() : Promise.resolve();
    return gate.then(() => {
      const p = chain.then(() => takeNow(reason, o.state));
      chain = p.catch(() => {});
      return p;
    });
  }

  async function takeNow(reason, given) {
    try {
      await ensure();
      const state = given || store.get();
      if (isEmpty(state)) return "empty";
      const payload = JSON.stringify(state);

      // Skip an identical repeat, otherwise simply opening the app on quiet days
      // would push the genuinely different older snapshots out of the window.
      if (where !== "idb") {
        const cur = read();
        const last = cur[cur.length - 1];
        lastPayload = last ? last.payload : null;
      }
      if (payload === lastPayload) return "same";

      const snap = { at: today(), reason: reason || "自動", summary: summarize(state), size: payload.length };
      if (where === "idb") {
        try {
          await addIdb(snap, payload);
          lastPayload = payload;
          KN.idb.changed();
          return "taken";
        } catch (err) {
          /* 大きな保存場所に書けなかった。前の置き場へ退きます（「削除前」の
             ような控えを、取れないまま進ませないため）。次に開いたとき、
             大きな保存場所へ写します。 */
          console.error("snapshot to IndexedDB failed", err);
        }
      }
      const list = read();
      list.push({ at: snap.at, reason: snap.reason, payload, summary: snap.summary });
      if (!write(list)) return "failed";
      if (where === "idb") heads = heads.concat([{ ...snap, ls: true }]).sort(byAt);
      else heads = read();
      lastPayload = payload;
      if (KN.idb) KN.idb.changed();
      return "taken";
    } catch (err) {
      console.error("snapshot failed", err);
      return "failed";
    }
  }

  /** Store the current state. 約束で、新しく取れたときだけ true。 */
  function snapshot(reason) {
    return take(reason).then((r) => r === "taken");
  }

  /**
   * 本体（kaimono-note-v2）の保存が容量で落ちたときに、store から呼ばれます。
   * 控えを dropOne の順で一つずつ手放し、そのたびに本体を書き直してみて、
   * **書けた時点で止めます。** 本体が書けたら true。手放したことは一度だけ
   * 知らせます——黙って減らすと、戻せるつもりの人が戻せなくなるので。
   *
   * 本体の保存の途中から呼ばれるので、**その場で終わる（同期の）まま**です。
   * 手放すのは localStorage に残した控えだけ。控えが大きな保存場所にある
   * ときは、ここにあるのは写し終えた元なので、戻せる控えは減りません
   * （だから知らせません）。
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
      if (where !== "idb") {
        heads = read();
        if (KN.ui) KN.ui.toast(`空きが足りないので、自動バックアップを${dropped}件減らして保存しました`);
      }
      return true;
    }
    return false;
  }

  /**
   * 設定に出すための数。字数は保存している形（JSON）の文字数です。
   *
   * `where` が "ls" のときは、本体と控えが同じ localStorage の枠（iPhone で
   * およそ5MB）を分け合っています。"idb" のときは控えは大きな保存場所にあり、
   * `legacyChars` は localStorage に残した元の控えの大きさ。
   *
   * `fits` は、控えの上限に、いまの大きさの控えが何件入るか。一日一つの
   * 背骨（最大12件）といちばん新しい一つが入りきらなくなると、直近2日の
   * 一時間おきの控えは残せません（prune が細かいほうから落とす）。
   * `diary` は日記の写しの様子（js/diary-idb.js の status）。
   */
  function usage() {
    const idb = where === "idb";
    const list = idb ? heads : read();
    const live = store.get();
    const liveChars = JSON.stringify(live).length;
    const last = list[list.length - 1];
    const per = last
      ? (idb ? headSize(last) : JSON.stringify(last).length)
      : Math.round(liveChars * 1.15);
    const diaryChars = ((live.archive && live.archive.days) || [])
      .reduce((n, d) => n + String((d && d.memo) || "").length, 0);
    const fineFrom = Date.now() - FINE_DAYS * 86400000;
    let legacyChars = 0;
    try { legacyChars = (localStorage.getItem(SNAP_KEY) || "").length; } catch (err) { /* 読めない端末 */ }
    const budget = idb ? BUDGET_IDB : BUDGET;
    return {
      where, liveChars, diaryChars,
      snapChars: idb ? list.reduce((n, h) => n + (h.size || 0), 0) : legacyChars,
      legacyChars: idb ? legacyChars : 0,
      count: list.length,
      fine: list.filter((s) => new Date(s.at).getTime() >= fineFrom).length,
      fits: Math.max(1, Math.floor(budget / Math.max(1, per))),
      tight: Math.floor(budget / Math.max(1, per)) < KEEP_DAYS - FINE_DAYS + 2,
      diary: KN.diaryIdb ? KN.diaryIdb.status() : null,
    };
  }

  /** 前の控えから `gap` ミリ秒あいていれば、一つ取ります（約束で true / false）。 */
  async function maybeEvery(gap, reason) {
    await ensure();
    const list = where === "idb" ? heads : read();
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

  /** Newest first. **その場で返ります**（大きな保存場所の見出しは、覚えてあるものを）。 */
  function list() {
    return (where === "idb" ? heads : read()).slice().reverse();
  }

  /**
   * 控えへ戻します（約束で）。戻すこと自体をやり直せるように、先に一つ取ります
   * （中身は先に読んでおくので、この一つに prune で押し出されても戻せます）。
   * **取れなかったら戻しません**——`code: "keep-failed"` の Error で断るので、
   * 画面で知らせて、それでもと言われたら `{ force: true }` で呼び直すこと。
   */
  async function restore(at, opts) {
    await ensure();
    const found = (where === "idb" ? heads : read()).find((s) => s.at === at);
    if (!found) throw new Error("その控えが見つかりません");
    const payload = await bodyOf(found);
    if (typeof payload !== "string") throw new Error("その控えの中身が読めません");
    if ((await take("復元前")) === "failed" && !(opts && opts.force)) {
      const err = new Error("いまの状態を控えに残せませんでした");
      err.code = "keep-failed";
      throw err;
    }
    store.importJSON(payload);
  }

  /** 控えを全部捨てます（どこからも呼んでいません。戻せません）。 */
  async function clear() {
    try { localStorage.removeItem(SNAP_KEY); } catch (err) { /* already gone */ }
    if (where === "idb") {
      await KN.idb.run(["snaps", "snapBodies"], "readwrite", (t) => {
        t.objectStore("snaps").clear();
        t.objectStore("snapBodies").clear();
      });
    }
    heads = [];
    lastPayload = null;
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
    ensure().then(() => maybeHourly());

    /* **アプリを離れるとき**は、いちばん取りたい瞬間です。書き終えて
       閉じた直後に消えるのが、いちばん痛い失い方なので、ここは時間を
       置かずに取ります。中身が前と同じなら snapshot 側が見送るので、
       ただ行き来しているだけでは増えません。数が増えたぶんは、書き込む
       ときに prune が一時間に一つへ間引きます。

       大きな保存場所への書き込みは「あとで返事が来る」ので、隠れた直後に
       止められると、この一つが残らないことがあります。そのときも本体は
       store.flush がその場で書いているので、次に開いたときの控えが同じ
       中身を取ります（失うのは、控えの時刻の正確さだけ）。 */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") snapshot("離れる前");
    });
    window.addEventListener("pagehide", () => snapshot("離れる前"));

    /* 開いたままの人のために。5分ごとに「一時間たったか」を見るだけで、
       たっていなければ何もしません（読むだけなので軽い）。 */
    setInterval(maybeHourly, 5 * 60 * 1000);
  }

  KN.backup = {
    SNAP_KEY, KEEP, EVERY_MS, FINE_DAYS, KEEP_DAYS, BUDGET, BUDGET_IDB,
    snapshot, take, makeRoom, usage,
    maybeDaily, maybeHourly, maybeEvery, prune, list, restore, clear,
    lastExportAt, markExported, exportDue,
    init,
    // 置き場が決まったら果たされる約束と、いまの置き場（"idb" / "ls"）。
    ready: ensure, where: () => where, moved: () => moved,
  };
})();
