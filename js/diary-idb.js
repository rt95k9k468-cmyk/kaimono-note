/* =========================================================
   くらしノート — 日記の本文の写し（IndexedDB）

   日記の本文（`state.archive.days[].memo`）を、localStorage の一本とは
   別の大きな保存場所（js/idb.js の `diary`）にも持ちます。
   経緯は docs/improvements.md の A1(b)、決めごとは docs/storage.md。
   暗号にはしません（利用者が決めた。鍵を失うと二度と戻らないので）。

   **いまは二重に持つ時期です。** 元（localStorage の一本）は消さずに、
   これまでどおり書きつづけます。写しの側は、元を書くたびに同じものを
   書き足し、開くたびに元と突き合わせます。元から本文を外すのは、何度か
   開いて問題が無いと分かってから、**利用者に訊いてから**（まだしていない）。

   はじめて開いたとき
     ① 写す：本文のある日を全部、一つの取引で。
     ② 読み比べる：写したものを読み直して、全部の日で一字も違わないか。
     ③ 元は消さない。②で一つでも違えば、写したほうを捨てて、いままで
        どおり元だけで持つ（次に開いたとき、また試す）。

   どちらが新しいか（二回目から）
     元は、書くたびに番号（store の lsSeq）を一つ進めて一緒に書きます。
     写しの側も、書き足すたびに「元の何番に合わせたか」を持ちます。
     ・写しの番号のほうが大きい → 元の保存が（容量で）落ちたあいだに
       書いたぶんが、写しにだけある。写しから戻す。
     ・元が空（はじめての端末・元だけ消えた）→ 写しから戻す。
     ・それ以外 → 元が新しい（書いた直後に閉じた、など）。写しを直す。
     写しから戻すときは、**元にしか無い日を消しません。** どちらの向きでも、
     置き換わる側の本文は先に自動バックアップへ残します（「日記の突き合わせ前」）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const META = "diary";      // 写し替えの記録（設定に出す回数も）
  const SEQ = "diarySeq";    // 写しが、元の何番目の書き込みに合わせてあるか

  let phase = "idle";        // idle → starting → on | off
  let known = null;          // Map 日付 → 本文：写しに入っているはずのもの（null＝分からない）
  let pendingSeq = 0;        // 突き合わせが済む前に来た書き込みの番号
  let batch = null;          // 書き足し待ち { seq, puts: Map, dels: Set }
  let busy = false;
  let resyncing = false;
  let info = {};             // 設定に出すもの（status()）
  let settle = null;
  let readyP = new Promise((r) => { settle = r; });

  /* 本文のある日。**一字でもあれば**持ちます（空白だけでも、元にあるなら
     写しにも）——読み比べは一字も違わないことを見るので、片方だけが
     整えると、それだけで食い違いになります。同じ日付が二つあれば、先の
     ほう（画面の dayLog が `find` で見るほう）。 */
  function daysOf(s) {
    const out = new Map();
    const seen = new Set();
    const days = (s && s.archive && s.archive.days) || [];
    for (const d of days) {
      if (!d || !d.date || seen.has(d.date)) continue;
      seen.add(d.date);
      if (typeof d.memo === "string" && d.memo) out.set(d.date, d);
    }
    return out;
  }

  const rec = (date, d) => ({ date, memo: d.memo, at: d.updatedAt || null });
  const blankDay = (date, r) => ({
    date, memo: r.memo, wake: null, sleep: null,
    wakeSource: "manual", sleepSource: "manual",
    createdAt: r.at || date, updatedAt: r.at || date,
  });
  const say = (err) => String((err && err.message) || err);

  function readAll() {
    return KN.idb.run(["diary", "meta"], "readonly", (t) => {
      const rows = t.objectStore("diary").getAll();
      const meta = t.objectStore("meta").get(META);
      const seq = t.objectStore("meta").get(SEQ);
      return () => ({
        rows: rows.result || [],
        meta: meta.result ? meta.result.v : null,
        seq: seq.result ? Number(seq.result.v) || 0 : 0,
      });
    });
  }

  /* ---------------- 立ち上がり ---------------- */

  function start() {
    if (phase !== "idle") return readyP;
    phase = "starting";
    run();
    return readyP;
  }

  function run() {
    boot().then(() => {
      settle();
      if (phase === "on" && pendingSeq) {
        const s = pendingSeq;
        pendingSeq = 0;
        diffInto(s);
      }
      if (KN.idb) KN.idb.changed();
    });
  }

  async function boot() {
    const at = store.loadInfo();   // 読んだときの元の番号と、元に何かあったか
    try {
      if (store.loadError()) throw new Error("記録が読めなかった日なので、写しには触れません");
      if (!KN.idb || !KN.idb.available()) throw new Error("この端末では、大きな保存場所が使えません");
      const got = await readAll();
      if (!got.meta || got.meta.phase !== "verified") await migrate();
      else await reconcile(got, at);
      phase = "on";
    } catch (err) {
      console.warn("diary copy is off:", err);
      phase = "off";
      known = null;
      info = { ...info, reason: say(err) };
    }
  }

  /* ①写す → ②読み比べる → ③元は消さない。 */
  async function migrate() {
    const days = daysOf(store.get());
    const seq = store.lsSeq();
    const at = new Date().toISOString();
    await KN.idb.run(["diary", "meta"], "readwrite", (t) => {
      const box = t.objectStore("diary");
      box.clear();
      days.forEach((d, date) => box.put(rec(date, d)));
      t.objectStore("meta").put({ k: META, v: { phase: "copied", at, days: days.size } });
      t.objectStore("meta").put({ k: SEQ, v: seq });
    });

    const back = await readAll();
    const got = new Map(back.rows.map((r) => [r.date, r.memo]));
    let bad = got.size === days.size ? 0 : Math.abs(got.size - days.size);
    days.forEach((d, date) => { if (got.get(date) !== d.memo) bad++; });
    if (bad) {
      // 写したほうを捨てます。元（localStorage）には、はじめから触れていません。
      await KN.idb.run(["diary", "meta"], "readwrite", (t) => {
        t.objectStore("diary").clear();
        t.objectStore("meta").put({ k: META, v: { phase: "failed", at, days: days.size, bad } });
      }).catch(() => { /* 捨てられなくても、verified でなければ使いません */ });
      throw new Error(`写した日記を読み直すと、${bad}日ぶん違っていたので、写しを捨てました`);
    }

    const v = { phase: "verified", at, days: days.size, opens: 0, matched: 0, fixed: 0,
                last: { at, mode: "copied", days: 0 } };
    await KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").put({ k: META, v }); });
    known = new Map([...days].map(([date, d]) => [date, d.memo]));
    info = v;
  }

  /* 開くたびの突き合わせ。 */
  async function reconcile(got, at) {
    const inBox = new Map(got.rows.map((r) => [r.date, r]));
    const days = daysOf(store.get());
    const diff = [];
    days.forEach((d, date) => { const r = inBox.get(date); if (!r || r.memo !== d.memo) diff.push(date); });
    inBox.forEach((r, date) => { if (!days.has(date)) diff.push(date); });

    const mode = !at.hadData ? "copy" : !at.seq ? "live" : got.seq > at.seq ? "copy" : "live";
    // 次に元を書く番号は、写しの番号の続きから（store.seqAtLeast の説明）。
    store.seqAtLeast(got.seq);
    const now = new Date().toISOString();
    const puts = [];
    const dels = [];
    let seq = got.seq;

    if (diff.length && mode === "copy") {
      /* 写しから戻す。写しにあって元と違う日だけ——**元にしか無い日は
         消しません**（それは写しのほうへ足します）。 */
      const bring = diff.filter((date) => inBox.has(date));
      const lose = bring.filter((date) => {
        const d = days.get(date);
        return d && !inBox.get(date).memo.startsWith(d.memo);   // 写しが続きを書いただけなら、失うものは無い
      });
      if (lose.length) await keep(null);   // 置き換わる前の元を、控えに
      if (bring.length) {
        store.update((s) => {
          bring.forEach((date) => {
            const r = inBox.get(date);
            const row = s.archive.days.find((d) => d.date === date);
            if (!row) { s.archive.days.push(blankDay(date, r)); return; }
            row.memo = r.memo;
            if (r.at) row.updatedAt = r.at;
            if (!row.createdAt) row.createdAt = row.updatedAt || date;
          });
        });
      }
      diff.filter((date) => !inBox.has(date)).forEach((date) => puts.push(rec(date, days.get(date))));
      // 番号は下げません——元がまだ書けていないうちに下げると、次に開いたとき元が勝ってしまう。
    } else if (diff.length) {
      /* 元に合わせて、写しを直す。 */
      const lose = diff.filter((date) => {
        const r = inBox.get(date);
        const d = days.get(date);
        return r && !(d && d.memo.startsWith(r.memo));   // 元が続きを書いただけなら、失うものは無い
      });
      if (lose.length) await keep(withBox(store.get(), inBox, lose));
      diff.forEach((date) => {
        const d = days.get(date);
        if (d) puts.push(rec(date, d));
        else dels.push(date);
      });
      seq = store.lsSeq();
    }

    const prev = got.meta || {};
    const v = {
      ...prev,
      opens: (prev.opens || 0) + 1,
      matched: (prev.matched || 0) + (diff.length ? 0 : 1),
      fixed: (prev.fixed || 0) + (diff.length ? 1 : 0),
      last: { at: now, mode: diff.length ? mode : "match", days: diff.length },
    };
    await KN.idb.run(["diary", "meta"], "readwrite", (t) => {
      const box = t.objectStore("diary");
      puts.forEach((r) => box.put(r));
      dels.forEach((date) => box.delete(date));
      if (puts.length || dels.length) t.objectStore("meta").put({ k: SEQ, v: seq });
      t.objectStore("meta").put({ k: META, v });
    });

    const next = new Map([...inBox].map(([date, r]) => [date, r.memo]));
    puts.forEach((r) => next.set(r.date, r.memo));
    dels.forEach((date) => next.delete(date));
    known = next;
    info = v;
  }

  /* 突き合わせで置き換わる本文を、先に自動バックアップへ。 */
  function keep(alt) {
    if (!KN.backup || !KN.backup.take) return Promise.resolve("failed");
    return KN.backup.take("日記の突き合わせ前", { now: true, state: alt || undefined })
      .catch(() => "failed");
  }

  /* 写しの本文を当てた state の複製（写しの側が置き換わるときの控え用）。 */
  function withBox(s, inBox, dates) {
    const copy = JSON.parse(JSON.stringify(s));
    dates.forEach((date) => {
      const r = inBox.get(date);
      const row = copy.archive.days.find((d) => d.date === date);
      if (row) row.memo = r.memo;
      else copy.archive.days.push(blankDay(date, r));
    });
    return copy;
  }

  /* ---------------- 書くたびに ---------------- */

  /**
   * store が元（localStorage）を書いたあとに呼びます（writeLive）。
   * `seq` はその書き込みの番号、`ok` は書けたかどうか。**書けなかったときも
   * 写しには書きます**——容量で落ちているあいだに書いた日記を、写しの
   * 側に残すため（番号が元より大きくなるので、次に開いたとき写しが勝つ）。
   */
  function afterWrite(seq, ok) {
    try {
      info.liveFailed = !ok;
      if (phase === "off") return;
      if (phase !== "on") { pendingSeq = Math.max(pendingSeq, seq); return; }
      if (!known) { resync(seq); return; }
      diffInto(seq);
    } catch (err) {
      console.error("diary copy:", err);
      known = null;
    }
  }

  function diffInto(seq) {
    const days = daysOf(store.get());
    let puts = null;
    let dels = null;
    days.forEach((d, date) => {
      if (known.get(date) !== d.memo) (puts || (puts = [])).push(rec(date, d));
    });
    known.forEach((_, date) => { if (!days.has(date)) (dels || (dels = [])).push(date); });
    if (!puts && !dels) return;
    if (!batch) batch = { seq, puts: new Map(), dels: new Set() };
    batch.seq = Math.max(batch.seq, seq);
    (puts || []).forEach((r) => { known.set(r.date, r.memo); batch.dels.delete(r.date); batch.puts.set(r.date, r); });
    (dels || []).forEach((date) => { known.delete(date); batch.puts.delete(date); batch.dels.add(date); });
    drain();
  }

  function drain() {
    if (busy || !batch) return;
    busy = true;
    const b = batch;
    batch = null;
    KN.idb.run(["diary", "meta"], "readwrite", (t) => {
      const box = t.objectStore("diary");
      b.puts.forEach((r) => box.put(r));
      b.dels.forEach((date) => box.delete(date));
      t.objectStore("meta").put({ k: SEQ, v: b.seq });
    }).then(() => {
      info.error = null;
    }, (err) => {
      /* 写しの中身が分からなくなりました。次に書くときに読み直して合わせます。
         元（localStorage）は無事なので、失われるものはありません。 */
      console.error("diary copy write failed", err);
      known = null;
      info.error = say(err);
    }).then(() => {
      busy = false;
      drain();
    });
  }

  function resync(seq) {
    pendingSeq = Math.max(pendingSeq, seq);
    if (resyncing) return;
    resyncing = true;
    readAll().then((got) => {
      known = new Map(got.rows.map((r) => [r.date, r.memo]));
      const s = pendingSeq;
      pendingSeq = 0;
      diffInto(s);
    }, (err) => {
      info.error = say(err);
    }).then(() => { resyncing = false; });
  }

  /** store.reload() のあと。読み直した元と、写しを突き合わせ直します。 */
  function reloaded() {
    if (phase !== "on") return;
    phase = "starting";
    known = null;
    readyP = new Promise((r) => { settle = r; });
    run();
  }

  /* ---------------- 外から ---------------- */

  /** 突き合わせが済んだ（または、写しを使わないと決まった）ら果たされる約束。 */
  function ready() {
    if (phase === "idle") start();
    return readyP;
  }

  /** 済んだか。済む前の書き出しは、写しから戻るはずの本文を取りこぼしうる。 */
  const settled = () => phase === "on" || phase === "off";

  /** 設定に出すもの。 */
  function status() {
    return { ...info, phase, days: known ? known.size : null };
  }

  KN.diaryIdb = { start, ready, settled, status, afterWrite, reloaded };
})();
