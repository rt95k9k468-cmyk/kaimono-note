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
  const KEEP = 7;
  const REMIND_AFTER_DAYS = 30;
  const REMIND_MIN_PRODUCTS = 5;

  function read() {
    try {
      const list = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function write(list) {
    // Snapshots must never crowd out the live shopping data. If the quota is
    // full, drop the oldest and retry instead of letting the write throw.
    let keep = list.slice(-KEEP);
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

  function isEmpty(state) {
    const s = summarize(state);
    return !s.products && !s.stores && !s.items;
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

  /** One snapshot per calendar day, taken at boot. */
  function maybeDaily() {
    const list = read();
    const last = list[list.length - 1];
    if (last) {
      const a = new Date(last.at);
      const b = new Date();
      const sameDay =
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
      if (sameDay) return false;
    }
    return snapshot("自動");
  }

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
    if ((st.products || []).length < REMIND_MIN_PRODUCTS) return false;
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
    maybeDaily();
  }

  KN.backup = {
    SNAP_KEY, KEEP,
    snapshot, maybeDaily, list, restore, clear,
    lastExportAt, markExported, exportDue,
    init,
  };
})();
