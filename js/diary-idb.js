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

   開くたびの突き合わせ（二回目から）——**写しが正しい**（2026年9月28日から）
     元は「写しへ届かなかった書き込み」を拾うためだけに見ます。
     ・写しにだけある日 → 元へ戻す。**写しの行は、突き合わせでは一つも
       消しません。** 写しを消すのは、利用者が日記を消す・すべて削除・
       復元をしたとき（書くたびの diffInto）だけ。
     ・元にだけある日 → 写しへ足す。
     ・両方にあって違う日 → 写しを元へ。ただし元の番号（store の lsSeq）が
       写しの番号（「元の何番に合わせたか」）より大きいときだけは、元が
       新しい（書いた直後に閉じて、写しへの書き足しが届かなかった）ので、
       元を写しへ。
     どちらの向きでも、置き換わる側の本文は先に自動バックアップへ残します
     （「日記の突き合わせ前」）。

   読み込み中と、読めない日（body()）
     突き合わせが済むまでは「読み込み中」。daily の本文を書かせない・
     書き出させない・控えを取らせない。大きな保存場所を読めなかった日は
     「読めない」——daily の本文だけ「読めません」と出して、書かせない
     （ほかのタブは通常どおり）。前に出てきたとき、もう一度読みにいきます。

   本文を外した印（段2の2a・2026年9月28日。**まだ誰も外していません**）
     元から本文を外した行は `memo: ""` と印 `memoOut: true`（store.memoOut）。
     印の行は「本文がある行」です。
     ・書くたびの diffInto は、印の日を写しから消さない（最後の砦）。
     ・突き合わせで写しから本文を戻したら、印を外す。これは食い違いには
       数えない（向きごとに数える：写し→元／元→写し／外してあったので戻した）。
     ・元に印の行があるのに写しが確かめ済みでないときは、migrate しない（罠e）。
     ・写しに届いたと確かめた本文を committed に覚える（delivered()）。

   外す（段2の2b）
     利用者が設定で「準備する」（prepare：写しと記憶を全日読み比べ）→
     「書き出して外す」（書き出しを保存できたら markOut）を押したときだけ。
     外したことは**この大きな保存場所の meta（diaryOut）**に記録します
     （state に置くと、バックアップを別の端末へ戻したとき儀式を飛ばして外すので）。
     外すのは元に書く瞬間だけ（forLive）。記憶の中の state は本文つきのまま。
     外すのは committed にある本文だけで、まだ届いていない本文は元にも書きます。
     書き足しが済んだら、外した形で書き直します。大きな取り込み・復元は、
     写しへ先に届けてから元へ（deliver。罠b）。戻すのは putBack。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const META = "diary";      // 写し替えの記録（設定に出す回数も）
  const SEQ = "diarySeq";    // 写しが、元の何番目の書き込みに合わせてあるか
  const OUT = "diaryOut";    // 元から本文を外した（段2の2b）。{ at, exportedAt }

  let phase = "idle";        // idle → starting → on | off
  let outInfo = null;        // 外した記録（meta の diaryOut）。null＝外していない・まだ読んでいない
  let known = null;          // Map 日付 → 本文：写しに入っているはずのもの（null＝分からない）
  /* Map 日付 → 本文：写しに**届いたと確かめた**もの（null＝分からない）。
     読んだ行・取引が済んだ（strict）書き足しだけを入れ、失敗では変えません
     （失敗した取引は丸ごと戻るので）。known は「送ったもの」なので別に持ちます。
     元から本文を外す（段2の2b）ときに、外してよい本文かをこれで見ます。
     読めなかった日・読み直すときも捨てません——読んだ行も済んだ取引も写しに
     あり、捨てると外していたはずの本文を元へ全部書いて枠からあふれます（罠a）。
     置き換えるのは、写しを読み直したとき（reconcile・resync・prepare・migrate）。 */
  let committed = null;
  let pendingSeq = 0;        // 突き合わせが済む前に来た書き込みの番号
  let batch = null;          // 書き足し待ち { seq, puts: Map, dels: Set }
  let busy = false;
  let resyncing = false;
  let info = {};             // 設定に出すもの（status()）
  let settle = null;
  let readyP = new Promise((r) => { settle = r; });
  let retryable = false;     // 読めなかったのが、読み直せば直りうる理由か
  let lastTry = 0;
  let idleWaiters = [];      // 書き足しが済むのを待つ人（idle()）
  const listeners = new Set();

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

  /* 本文を元から外した日（印 memoOut の行。store.memoOut）。daysOf と同じく、
     同じ日付の先の一つだけを見ます。印の行は「本文がある行」——写しから
     消さない・空と見なさない（docs/storage.md の「段2の案」）。 */
  function outOf(s) {
    const out = new Set();
    const seen = new Set();
    const days = (s && s.archive && s.archive.days) || [];
    for (const d of days) {
      if (!d || !d.date || seen.has(d.date)) continue;
      seen.add(d.date);
      if (store.memoOut(d)) out.add(d.date);
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
      const out = t.objectStore("meta").get(OUT);
      return () => ({
        rows: rows.result || [],
        meta: meta.result ? meta.result.v : null,
        seq: seq.result ? Number(seq.result.v) || 0 : 0,
        out: out.result ? out.result.v || {} : null,
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
      listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    });
  }

  async function boot() {
    lastTry = Date.now();
    /* 元の番号は、**読んだときの**もの。読めなかった日のあとで読み直すとき
       も同じです——読めなかったあいだは本文を書かせないので、元の本文は
       読んだときのまま。そのあいだに進んだ番号（やること・買うものなどの書き込み）で
       比べると、古い元の本文が新しい写しに勝ってしまいます。 */
    const seqNow = store.loadInfo().seq;
    retryable = false;
    try {
      if (store.loadError()) throw new Error("記録が読めなかった日なので、写しには触れません");
      if (!KN.idb || !KN.idb.available()) throw new Error("この端末では、大きな保存場所が使えません");
      retryable = true;
      const got = await readAll();
      // 外したか（段2の2b）。突き合わせで本文を戻したあとの保存から、外した形で書きます。
      outInfo = got.out;
      if (got.meta && got.meta.phase === "verified") await reconcile(got, seqNow);
      /* 元に本文を外した日（印の行）があるのに、写しの記録が確かめ済みでない
         （写しを丸ごと失った・別の端末で戻した）。migrate は写しを空にして元から
         写し直し、「確かめ済み」にします——元に無い本文を持っているかもしれない
         写しを空にし、本文の無い日を 0 日と数えて済ませることになる。だから
         migrate せず、写しを消さない突き合わせで、写しにある本文は戻し、無い日は
         「本文が見つかりません」と出します（docs/storage.md の罠e）。確かめ済み
         にはしないので、印の行が残るあいだは開くたびにこの道を通ります。 */
      else if (outOf(store.get()).size) await reconcile(got, seqNow, { unverified: true });
      else await migrate();
      phase = "on";
    } catch (err) {
      console.warn("diary copy is off:", err);
      phase = "off";
      known = null;   // committed は残す（上の説明。罠a）
      info = { ...info, reason: say(err) };
    }
  }

  /* ①写す → ②読み比べる → ③元は消さない。
     写しを一度空にするのは、確かめ終えていない写し（途中で止まった・読み比べで
     違った）だけ——それは前の migrate が元から写したもので、書き足しは
     確かめ終えるまで一度も届いていないので、元に無いものは入っていません。 */
  async function migrate() {
    const days = daysOf(store.get());
    const seq = store.lsSeq();
    const at = new Date().toISOString();
    committed = null;   // 写しを空にするので、届いていたものは分からなくなる
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
    committed = new Map(got);   // 読み直して一字も違わなかったもの
    info = v;
  }

  /* 開くたびの突き合わせ。**写しが正しい**（上の説明）。

     元に無いことは、消した証拠になりません——元だけ消えた・元の保存が
     落ちた・書き足しが途中で止まった、どれでも同じ形になるので。だから
     ここでは写しの行を一つも消さず、写しにだけある日は元へ戻します。
     利用者が消した日が、写しへの書き足しが届かないうちに閉じられて
     戻ってくることはありえます（消えるよりマシ、のほう）。 */
  async function reconcile(got, seqNow, opts) {
    const inBox = new Map(got.rows.map((r) => [r.date, r]));
    /* 読んだ行は写しにあります。元へ戻す（bring）より先に覚えておかないと、
       戻した直後の保存が、外していた本文を元へ全部書きます（罠a）。 */
    committed = new Map(got.rows.map((r) => [r.date, r.memo]));
    const days = daysOf(store.get());
    const outs = outOf(store.get());   // 本文を元から外した日
    /* 元のほうが新しいと言えるのは、元の番号が写しの番号より大きいときだけ
       （写しへ届かなかった書き込みが、元にある）。番号の無い元（直に書いた・
       古い版）は、新しいと言えません。 */
    const liveNewer = seqNow > got.seq;
    // 次に元を書く番号は、写しの番号の続きから（store.seqAtLeast の説明）。
    store.seqAtLeast(got.seq);
    const now = new Date().toISOString();

    const bring = [];      // 写し → 元
    const puts = [];       // 元 → 写し（足す・書き直す。消さない）
    const loseLive = [];   // 置き換わる元の本文がある日
    const loseBox = [];    // 置き換わる写しの本文がある日
    let back = 0;          // bring のうち、元から外してあったので戻しただけの日（食い違いではない）
    inBox.forEach((r, date) => {
      const d = days.get(date);
      if (d && d.memo === r.memo) return;
      if (d && liveNewer) {
        puts.push(rec(date, d));
        if (!d.memo.startsWith(r.memo)) loseBox.push(date);   // 元が続きを書いただけなら、失うものは無い
      } else {
        bring.push(date);
        if (outs.has(date)) back++;
        if (d && !r.memo.startsWith(d.memo)) loseLive.push(date);   // 写しが続きを書いただけなら、失うものは無い
      }
    });
    days.forEach((d, date) => { if (!inBox.has(date)) puts.push(rec(date, d)); });
    /* 数え方は向きで分けます。元から外した本文を戻すのは、外したあと（段2）
       では毎回のことなので、食い違いには数えません（数えると「直した」回数が
       毎回増えて、ほんとうの食い違いが埋もれる。罠c）。 */
    const toLive = bring.length - back;   // 写し → 元（元に無い・写しが新しい）
    const toBox = puts.length;            // 元 → 写し（写しに無い・元が新しい）
    const n = toLive + toBox;
    // 本文を外したのに、写しにも無い日（「本文が見つかりません」）。日の数は画面に出しません。
    let missing = 0;
    outs.forEach((date) => { if (!inBox.has(date)) missing++; });

    if (loseLive.length) await keep(null);   // 置き換わる前の元を、控えに
    if (loseBox.length) await keep(withBox(store.get(), inBox, loseBox));
    if (bring.length) {
      store.update((s) => {
        bring.forEach((date) => {
          const r = inBox.get(date);
          const row = s.archive.days.find((d) => d.date === date);
          if (!row) { s.archive.days.push(blankDay(date, r)); return; }
          row.memo = r.memo;
          delete row.memoOut;   // 写しから本文を戻したので、印を外す
          if (r.at) row.updatedAt = r.at;
          if (!row.createdAt) row.createdAt = row.updatedAt || date;
        });
      });
    }

    const prev = got.meta || {};
    const mode = !n ? (back ? "restored" : "match")
      : toLive && toBox ? "both" : toLive ? "copy" : "live";
    /* opens・matched・fixed は段1から。fixed は向きを問わない回数のまま
       （設定の「食い違いを直した」回数）。fixedCopy・fixedLive はその向き別で、
       2026年9月28日（段2の2a）から数えています。それより前に直した回は
       fixedBefore（向きが分からない）。restored は外してあったので戻した回。 */
    const v = {
      ...prev,
      opens: (prev.opens || 0) + 1,
      matched: (prev.matched || 0) + (n ? 0 : 1),
      fixed: (prev.fixed || 0) + (n ? 1 : 0),
      fixedBefore: prev.fixedBefore != null ? prev.fixedBefore : (prev.fixed || 0),
      fixedCopy: (prev.fixedCopy || 0) + (toLive ? 1 : 0),
      fixedLive: (prev.fixedLive || 0) + (toBox ? 1 : 0),
      restored: (prev.restored || 0) + (back ? 1 : 0),
      last: { at: now, mode, days: n, copy: toLive, live: toBox, restored: back, missing },
    };
    await KN.idb.run(["diary", "meta"], "readwrite", (t) => {
      const box = t.objectStore("diary");
      puts.forEach((r) => box.put(r));
      /* 写しを元に合わせたぶん、番号も元に。写しから戻しただけのときは
         番号を動かしません——元がまだ書けていないうちに上げ下げすると、
         次に開いたとき、どちらが新しいかを取り違えます。 */
      if (puts.length) t.objectStore("meta").put({ k: SEQ, v: Math.max(got.seq, store.lsSeq()) });
      t.objectStore("meta").put({ k: META, v });
    });

    const next = new Map([...inBox].map(([date, r]) => [date, r.memo]));
    puts.forEach((r) => next.set(r.date, r.memo));
    known = next;
    /* 写しから読んだ行（元へ戻した本文も）と、いま済んだ取引で書いた行は、
       写しに届いています。戻した本文を「まだ届いていない」と扱うと、外した
       あと（段2）の最初の保存で元へ全部書くことになり、枠からあふれます（罠a）。 */
    committed = new Map(next);
    info = { ...v, unverified: !!(opts && opts.unverified), missing };
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
    /* 最後の砦：本文を元から外した日（印の行）は、写しから消しません。
       印の行は「本文がある行」です。本文を持たない控え・書き出しを復元した
       ときも、ここで写しの本文が残ります（docs/storage.md の「段2の案」）。 */
    const outs = outOf(store.get());
    let puts = null;
    let dels = null;
    days.forEach((d, date) => {
      if (known.get(date) !== d.memo) (puts || (puts = [])).push(rec(date, d));
    });
    known.forEach((_, date) => {
      if (!days.has(date) && !outs.has(date)) (dels || (dels = [])).push(date);
    });
    if (!puts && !dels) return;
    if (!batch) batch = { seq, puts: new Map(), dels: new Set() };
    batch.seq = Math.max(batch.seq, seq);
    (puts || []).forEach((r) => { known.set(r.date, r.memo); batch.dels.delete(r.date); batch.puts.set(r.date, r); });
    (dels || []).forEach((date) => { known.delete(date); batch.puts.delete(date); batch.dels.add(date); });
    drain();
  }

  function drain() {
    if (busy) return;
    if (!batch) { wakeIdle(); return; }
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
      // 取引が済んだ（strict）ので、写しに届いています。
      if (committed) {
        b.puts.forEach((r) => committed.set(r.date, r.memo));
        b.dels.forEach((date) => committed.delete(date));
      }
      /* 外したあと（段2の2b）は、届いた本文を元に残しません——書いた瞬間は
         まだ届いていなかったので、元にも本文を書いています。 */
      if (outInfo && b.puts.size) store.saveSoon();
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
      committed = new Map(known);   // 読めた行は、写しに届いている
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
    known = null;   // committed は残す（罠a）
    readyP = new Promise((r) => { settle = r; });
    run();
  }

  /**
   * 読めなかった日に、もう一度読みにいきます（前に出てきたとき・daily の
   * 本文を押したとき）。iPhone のホーム画面のアプリは、閉じたつもりでも
   * 何日も裏で生きているので、「開き直せば読み直す」だけでは足りません。
   * 読み直しても直らない理由（記録が読めない・この端末に無い）と、試して
   * すぐ（5秒以内）は、何もしません。始めたら true。
   */
  function retry() {
    if (phase !== "off" || !retryable || Date.now() - lastTry < 5000) return false;
    phase = "starting";
    known = null;   // committed は残す（罠a）
    readyP = new Promise((r) => { settle = r; });
    run();
    return true;
  }

  /* ---------------- 外から ---------------- */

  /** 突き合わせが済んだ（または、写しを使わないと決まった）ら果たされる約束。 */
  function ready() {
    if (phase === "idle") start();
    return readyP;
  }

  /** 済んだか。済む前の書き出しは、写しから戻るはずの本文を取りこぼしうる。 */
  const settled = () => phase === "on" || phase === "off";

  /**
   * daily の本文を、いま読める・書けるか。
   *   "ok"       読める・書ける
   *   "loading"  突き合わせの途中（開いた直後の一瞬）。書かせない・書き出させない
   *              （控えは backup.take が ready() を待つ）
   *   "off"      大きな保存場所を読めなかった。本文は「読めません」と出し、書かせない
   */
  function body() {
    if (phase === "on") return "ok";
    if (phase === "off") return "off";
    return "loading";
  }

  /** 突き合わせが済むたびに（読めた・読めなかった、どちらでも）。 */
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /** 設定に出すもの。 */
  function status() {
    return { ...info, phase, days: known ? known.size : null, out: !!outInfo, outAt: outInfo ? outInfo.at || null : null };
  }

  /**
   * その日のその本文が、写しに届いたと確かめてあるか。元から本文を外して
   * よいのは、これが true の本文だけ（段2の2b で writeLive が使う。いまは
   * 誰も外していません）。
   */
  function delivered(date, memo) {
    return phase === "on" && !!committed && typeof memo === "string" && !!memo
      && committed.get(date) === memo;
  }

  /* ---------------- 外す（段2の2b） ---------------- */

  /** 外してあるか（大きな保存場所の meta に記録がある）。読めていない日は false。 */
  const isOut = () => !!outInfo;

  /**
   * 元（localStorage）へ書く形（store の writeLive が呼ぶ）。外したあとは、
   * 写しに届いたと確かめた本文（committed）の行だけを `memo: "" + memoOut: true`
   * にした浅い複製を返します。同じ日付の二つ目以降は外しません（写しは先の
   * 一つしか持たない）。まだ届いていない本文は、そのまま元にも書きます。
   * 突き合わせの途中・読めない日も、committed にある本文は外します（罠a）。
   */
  function forLive(s) {
    if (!outInfo || !committed) return s;
    const days = s && s.archive && s.archive.days;
    if (!Array.isArray(days) || !days.length) return s;
    const seen = new Set();
    let changed = false;
    const next = days.map((d) => {
      if (!d || !d.date || seen.has(d.date)) return d;
      seen.add(d.date);
      if (typeof d.memo !== "string" || !d.memo || committed.get(d.date) !== d.memo) return d;
      changed = true;
      return { ...d, memo: "", memoOut: true };
    });
    return changed ? { ...s, archive: { ...s.archive, days: next } } : s;
  }

  /* 写しへの書き足しが済むまで待ちます（済んでいれば、すぐ）。 */
  function idle() {
    if (!busy && !batch) return Promise.resolve();
    return new Promise((r) => idleWaiters.push(r));
  }
  function wakeIdle() {
    if (busy || batch || !idleWaiters.length) return;
    const w = idleWaiters;
    idleWaiters = [];
    w.forEach((r) => r());
  }

  const notReady = () => new Error(phase === "off"
    ? "日記の保存場所を読めない日です" : "日記を読み込んでいるところです");

  /**
   * 1回目「準備する」。書きかけを出し、写しへの書き足しが済むのを待ってから、
   * 写しを読み直して、記憶の本文と**全日 `===`** で読み比べます。一日でも
   * 違えば false（何も変えません）。合えば、読み直した行を committed に。
   */
  async function prepare() {
    if (phase !== "on") throw notReady();
    store.flush();
    do { await idle(); } while (busy || batch);
    if (phase !== "on" || !known) throw new Error("写しへの書き足しが止まっています");
    const got = await readAll();
    const inBox = new Map(got.rows.map((r) => [r.date, r.memo]));
    const days = daysOf(store.get());
    let same = inBox.size === days.size;
    days.forEach((d, date) => { if (inBox.get(date) !== d.memo) same = false; });
    if (!same) return false;
    committed = inBox;
    return true;
  }

  /**
   * 2回目「書き出して外す」の、書き出しを保存できたあと。大きな保存場所の
   * meta に外したと記録してから、その場で外した形で元を書き直します。
   * 元が書けたら true。
   */
  async function markOut(exportedAt) {
    if (phase !== "on" || !committed) throw notReady();
    const v = { at: new Date().toISOString(), exportedAt: exportedAt || null };
    await KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").put({ k: OUT, v }); });
    outInfo = v;
    return store.saveNow();
  }

  /**
   * 戻す。**元に本文ごと書けたときだけ**、外した記録を消します。書けなければ
   * （枠に入らない）外したまま書き直して false。記録を消せなかったときも、
   * 外したまま書き直して例外（次に開いたとき、また外すことになるので）。
   */
  async function putBack() {
    if (!outInfo) return true;
    if (phase !== "on") throw notReady();
    const was = outInfo;
    outInfo = null;
    if (!store.saveNow()) {
      outInfo = was;
      store.saveNow();
      return false;
    }
    try {
      await KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").delete(OUT); });
    } catch (err) {
      outInfo = was;
      store.saveNow();
      throw err;
    }
    return true;
  }

  /**
   * 写しへ先に届けます（外したあとの日記の取り込み・復元。罠b）。
   * `rows` は { date, memo, at }。取引が済んだら known と committed に入れるので、
   * そのあと元へ書くと、届けた本文は外した形で書かれます——枠からあふれる
   * 大きさの本文を、一度も元へ書かずに済みます。写しの番号は動かしません
   * （元はまだ書いていないので）。届けた日の数を返します。
   */
  async function deliver(rows) {
    if (phase !== "on") throw notReady();
    do { await idle(); } while (busy || batch);
    if (phase !== "on" || !known || !committed) throw new Error("写しへの書き足しが止まっています");
    const list = [];
    const seen = new Set();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (!r || !r.date || seen.has(r.date) || typeof r.memo !== "string" || !r.memo) return;
      seen.add(r.date);
      if (known.get(r.date) !== r.memo) list.push({ date: r.date, memo: r.memo, at: r.at || null });
    });
    if (!list.length) return 0;
    busy = true;
    try {
      await KN.idb.run(["diary"], "readwrite", (t) => {
        const box = t.objectStore("diary");
        list.forEach((r) => box.put(r));
      });
      list.forEach((r) => { known.set(r.date, r.memo); committed.set(r.date, r.memo); });
    } finally {
      busy = false;
      drain();
    }
    return list.length;
  }

  KN.diaryIdb = {
    start, ready, settled, body, retry, onChange, status, delivered, afterWrite, reloaded,
    isOut, forLive, prepare, markOut, putBack, deliver,
  };
})();
