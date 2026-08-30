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

  const dayOf = (iso) => String(iso || "").slice(0, 10);

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
      /* 細かい窓の中は、一時間に一つだけ（新しいほうから見ているので、
         その時間のいちばん新しいものが残ります）。ただし、いちばん新しい
         一つは無条件で残します——「たった今の状態」は必ず要るので。 */
      if (t >= fineFrom) {
        const h = s.at.slice(0, 13);   // YYYY-MM-DDTHH
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
    while (keep.length > 1 && size(keep) > BUDGET) {
      let cut = -1;
      for (let i = 0; i < keep.length - 1; i++) {
        const t = new Date(keep[i].at).getTime();
        if (t >= fineFrom) { cut = i; break; }
      }
      keep.splice(cut >= 0 ? cut : 0, 1);
    }
    return keep;
  }

  function write(list) {
    // Snapshots must never crowd out the live shopping data. If the quota is
    // full, drop the oldest and retry instead of letting the write throw.
    let keep = prune(list);
    while (keep.length) {
      try {
        localStorage.setItem(SNAP_KEY, JSON.stringify(keep));
        return true;
      } catch (err) {
        keep = keep.slice(1);
      }
    }
    try { localStorage.removeItem(SNAP_KEY); } catch (err) { /* nothing left to do */ }
    return false;
  }

  function summarize(state) {
    return {
      products: (state.products || []).length,
      stores: (state.stores || []).length,
      items: (state.items || []).length,
    };
  }

  // やること・ダイエットの記録も守る対象なので、買い物が空でも
  // どちらかに中身があれば「空ではない」とみなします。
  function dietRecordCount(state) {
    const d = (state && state.diet) || {};
    return (d.weights || []).length + (d.meals || []).length
      + (d.health || []).length + (d.drinks || []).length + (d.foods || []).length;
  }

  function isEmpty(state) {
    const s = summarize(state);
    if (s.products || s.stores || s.items) return false;
    if ((state.todos || []).length) return false;
    if (dietRecordCount(state)) return false;
    return true;
  }

  /** Store the current state. Returns false when there was nothing worth keeping. */
  function snapshot(reason) {
    const state = store.get();
    if (isEmpty(state)) return false;

    const list = read();
    const payload = JSON.stringify(state);

    // Skip an identical repeat, otherwise simply opening the app on quiet days
    // would push the genuinely different older snapshots out of the window.
    const last = list[list.length - 1];
    if (last && last.payload === payload) return false;

    list.push({ at: today(), reason: reason || "自動", payload, summary: summarize(state) });
    return write(list);
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

  function restore(at) {
    const found = read().find((s) => s.at === at);
    if (!found) throw new Error("その控えが見つかりません");
    // Take one first so that restoring is itself undoable.
    snapshot("復元前");
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

  function markExported() {
    store.update((s) => { s.settings.lastExportAt = today(); });
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
    snapshot, maybeDaily, maybeHourly, maybeEvery, prune, list, restore, clear,
    lastExportAt, markExported, exportDue,
    init,
  };
})();
