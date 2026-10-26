/* =========================================================
   くらしノート — 過去のやることの棚（IndexedDB の todoPast。R26 の段2）

   閉じた日が30日より前の単発のやること（store.isPastTodo）を、元（localStorage の
   一本）とは別の大きな保存場所（js/idb.js の `todoPast`）にも持ちます。一件一行
   `{ id, day, json }`。json は記憶の中の一件をそのまま JSON にした字（詰めない形）で、
   届いたかは字が `===` かで見ます。決めごとは docs/storage.md「R26 の案」。

   段2a——写す（元の形は変えない）
     ・元を書くたびに、過去のやることの差分を棚へ（diffInto）。元が書けなかったときも。
     ・開くたびに、記憶と棚を全件読み比べる（reconcile）。違えば記憶を棚へ（記憶が正しい
       ——外したあとも、開いて棚から戻したあとの記憶は全件を持つので）。数は困ったときの
       記録へ（text）。画面には出しません。
     ・棚から消すのは、前に書いたとき記憶にあった id が、利用者の操作で消えたときだけ（罠a）。
       読み込み中・読めない日・開いたときの突き合わせでは消しません。棚にだけある行は数えるだけ。

   印（state.todoOut。元から外した行の id）
     ・開いたとき、印の行が棚にあれば記録へ戻して印を外す（store.bringTodos）。
     ・印の id は棚から消さない。印が残るあいだ、控えは棚を待ち、Dropbox は送らない（罠b）。
     ・棚に届いたと確かめた行を committed に覚える（delivered()）。

   段2b——外す（利用者が設定で「準備する」→「書き出して外す」を済ませたときだけ）
     ・外した記録は大きな保存場所の meta の `todoOut`（{ at, exportedAt }）。state にも元にも
       書かない（控えを別の端末に戻すと儀式を飛ばして外れるので。日記の diaryOut と同じ）。
     ・記憶は全件のまま。元へ書く形（forLive。store の liveShape）だけ、棚に `===` で届いた
       行を抜いて、その id を印へ足す。新しく過去になった行は、棚に届いたあと書き直して外す。
     ・大きく入れる復元は棚へ先に届けてから元へ（deliver。罠e）。戻すのは putBack。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const BOX = "todoPast";
  const META = "todoPast";   // 突き合わせの記録（開いた回数・最後の数）
  const OUT = "todoOut";     // 外した記録（段2b）。突き合わせの記録とは鍵を分ける

  let phase = "idle";        // idle → starting → on | off
  let known = null;          // Map id → json：棚に入っているはずのもの（null＝分からない）
  /* Map id → json：棚に**届いたと確かめた**もの。読んだ行と、済んだ取引の行だけ。
     読めない日・読み直すときも捨てません（diary-idb の committed と同じ。罠a）。 */
  let committed = null;
  /* 前に書いたときの、記録の中のやることの id。消えた行を見分けるのに使います——
     これが無いとき（立ち上がり・読み直しのあと）は、何も消しません。 */
  let seen = null;
  let pending = false;       // 突き合わせが済む前に元が書かれた
  let batch = null;          // 書き足し待ち { puts: Map, dels: Set }
  let busy = false;
  let resyncing = false;
  let info = {};
  let settle = null;
  let readyP = new Promise((r) => { settle = r; });
  let retryable = false;
  let lastTry = 0;
  let outInfo = null;        // 外した記録（meta の todoOut）。読めていない日は null
  let idleWaiters = [];
  /* 一つの書き込み（writeLive）の中で、forLive が作った字を直後の diffInto が一度だけ使う。
     forLive が毎回作り直して置き、diffInto が取ったら捨てる。同期のあいだだけ（次の拍で捨てる）——
     記憶は同じ配列のまま書き換わるので、ほかの時に使うと古い字で外してしまう。 */
  let pastMemo = null;
  const listeners = new Set();

  const say = (err) => String((err && err.message) || err);

  /* 過去のやること（同じ id は先の一つ）。 */
  function pastOf(s) {
    const out = new Map();
    const cut = store.pastCutoff();
    ((s && s.todos) || []).forEach((t) => {
      if (!t || out.has(t.id) || !store.isPastTodo(t, cut)) return;
      out.set(t.id, { id: t.id, day: store.pastDay(t), json: JSON.stringify(t) });
    });
    return out;
  }
  const idsOf = (s) => new Set(((s && s.todos) || []).map((t) => t && t.id).filter(Boolean));
  function parse(json) {
    try {
      const t = JSON.parse(json);
      return t && typeof t === "object" && !Array.isArray(t) && t.id ? t : null;
    } catch (_) { return null; }
  }

  /* 欄の並びを問わない字（開き直すと reconcile() が欄を並べ直すので、中身が同じでも字は変わりうる）。 */
  function canon(v) {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v && typeof v === "object") {
      return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  }
  function sameBody(a, b) {
    const x = parse(a);
    const y = parse(b);
    return !!x && !!y && canon(x) === canon(y);
  }

  function readAll() {
    return KN.idb.run([BOX, "meta"], "readonly", (t) => {
      const rows = t.objectStore(BOX).getAll();
      const meta = t.objectStore("meta").get(META);
      const out = t.objectStore("meta").get(OUT);
      return () => ({
        rows: (rows.result || []).filter((r) => r && r.id && typeof r.json === "string"),
        meta: meta.result ? meta.result.v : null,
        out: out.result && out.result.v && typeof out.result.v === "object" ? out.result.v : null,
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
      if (phase === "on" && pending) {
        pending = false;
        diffInto();
      }
      listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    });
  }

  async function boot() {
    // 記録の写し（js/live-idb.js）が元を戻すなら、戻してから比べます。
    if (KN.liveIdb) await KN.liveIdb.ready();
    lastTry = Date.now();
    retryable = false;
    try {
      if (store.loadError()) throw new Error("記録が読めなかった日なので、棚には触れません");
      if (!KN.idb || !KN.idb.available()) throw new Error("この端末では、大きな保存場所が使えません");
      retryable = true;
      await reconcile(await readAll());
      phase = "on";
    } catch (err) {
      console.warn("todo past is off:", err);
      phase = "off";
      known = null;   // committed は残す（罠a）
      seen = null;
      info = { ...info, reason: say(err) };
    }
  }

  /* 開くたびの読み比べ。**記憶が正しい**——ただし印の行は記憶に無いので、先に棚から
     戻します（戻したあとの記憶は全件を持つ）。棚の行は一つも消しません。 */
  async function reconcile(got) {
    const inBox = new Map(got.rows.map((r) => [r.id, r]));
    committed = new Map(got.rows.map((r) => [r.id, r.json]));
    outInfo = got.out;

    const marks = store.todoOut();
    const bring = [];
    let missing = 0;   // 印があるのに、棚にも無い（読めない行も）
    marks.forEach((id) => {
      const t = inBox.has(id) ? parse(inBox.get(id).json) : null;
      if (t) bring.push(t);
      else missing++;
    });
    const back = bring.length ? store.bringTodos(bring) : 0;

    const s = store.get();
    const ids = idsOf(s);
    const left = new Set(store.todoOut(s));
    const puts = [];
    let same = 0, fixed = 0, added = 0, orphan = 0, reshaped = 0;
    pastOf(s).forEach((p, id) => {
      const r = inBox.get(id);
      if (r && r.json === p.json) { same++; return; }
      // 欄の並びだけ違う（開き直した）は食い違いに数えない。字は今のものへ写し直す。
      if (r && sameBody(r.json, p.json)) reshaped++;
      else if (r) fixed++;
      else added++;
      puts.push(p);
    });
    inBox.forEach((_, id) => { if (!ids.has(id) && !left.has(id)) orphan++; });

    const prev = got.meta || {};
    const now = new Date().toISOString();
    const v = {
      ...prev,
      since: prev.since || now,
      opens: (prev.opens || 0) + 1,
      fixed: (prev.fixed || 0) + (fixed ? 1 : 0),   // 食い違いを直した回数（はじめて写した行は数えない）
      last: { at: now, rows: inBox.size + added, same: same + reshaped, reshaped, fixed, added, orphan, missing, back },
    };
    await KN.idb.run([BOX, "meta"], "readwrite", (t) => {
      const box = t.objectStore(BOX);
      puts.forEach((p) => box.put(p));
      t.objectStore("meta").put({ k: META, v });
    });

    const next = new Map(committed);
    puts.forEach((p) => next.set(p.id, p.json));
    known = next;
    committed = new Map(next);
    seen = ids;
    info = v;
    // 外してあれば、戻した行・写し直した行を外した形で書き直す（届いたので）。
    if (outInfo && (puts.length || back)) store.saveSoon();
  }

  /* ---------------- 書くたびに ---------------- */

  /** store が元を書いたあとに（writeLive。書けなかったときも）。 */
  function afterWrite() {
    try {
      if (phase === "off") return;
      if (phase !== "on") { pending = true; return; }
      if (!known) { resync(); return; }
      diffInto();
    } catch (err) {
      console.error("todo past:", err);
      known = null;
    }
  }

  function diffInto() {
    const s = store.get();
    const ids = idsOf(s);
    const marks = new Set(store.todoOut(s));
    const past = pastMemo && pastMemo.todos === s.todos ? pastMemo.map : pastOf(s);
    pastMemo = null;
    let puts = null;
    let dels = null;
    past.forEach((p, id) => {
      if (known.get(id) !== p.json) (puts || (puts = [])).push(p);
    });
    /* 消すのは、前に書いたとき記録にあった行が、いま無いときだけ（利用者が消した・
       復元で置き換えた）。印の行は消さない（罠a）。 */
    if (seen) {
      seen.forEach((id) => {
        if (!ids.has(id) && !marks.has(id) && known.has(id)) (dels || (dels = [])).push(id);
      });
    }
    seen = ids;
    if (!puts && !dels) return;
    if (!batch) batch = { puts: new Map(), dels: new Set() };
    (puts || []).forEach((p) => { known.set(p.id, p.json); batch.dels.delete(p.id); batch.puts.set(p.id, p); });
    (dels || []).forEach((id) => { known.delete(id); batch.puts.delete(id); batch.dels.add(id); });
    drain();
  }

  function drain() {
    if (busy || !batch) return;
    busy = true;
    const b = batch;
    batch = null;
    KN.idb.run([BOX], "readwrite", (t) => {
      const box = t.objectStore(BOX);
      b.puts.forEach((p) => box.put(p));
      b.dels.forEach((id) => box.delete(id));
    }).then(() => {
      info.error = null;
      if (committed) {
        b.puts.forEach((p) => committed.set(p.id, p.json));
        b.dels.forEach((id) => committed.delete(id));
      }
      // 外してあれば、届いた行を外した形で書き直す（新しく過去になった行・直した過去の行）。
      if (outInfo && b.puts.size) store.saveSoon();
    }, (err) => {
      // 棚の中身が分からなくなった。次に書くときに読み直す（元は無事）。
      console.error("todo past write failed", err);
      known = null;
      info.error = say(err);
    }).then(() => {
      busy = false;
      drain();
      wakeIdle();
    });
  }

  /* 棚への書き足しが済むまで待ちます（済んでいれば、すぐ）。 */
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

  function resync() {
    if (resyncing) return;
    resyncing = true;
    readAll().then((got) => {
      known = new Map(got.rows.map((r) => [r.id, r.json]));
      committed = new Map(known);
      diffInto();
    }, (err) => {
      info.error = say(err);
    }).then(() => { resyncing = false; });
  }

  /** store.reload()・adoptRaw() のあと。読み直した記録と、棚を読み比べ直します。 */
  function reloaded() {
    if (phase !== "on") return;
    phase = "starting";
    known = null;   // committed は残す（罠a）
    seen = null;
    readyP = new Promise((r) => { settle = r; });
    run();
  }

  /** 読めなかった日に、もう一度（前に出てきたとき）。始めたら true。 */
  function retry() {
    if (phase !== "off" || !retryable || Date.now() - lastTry < 5000) return false;
    phase = "starting";
    readyP = new Promise((r) => { settle = r; });
    run();
    return true;
  }

  /* ---------------- 外す（段2b） ---------------- */

  /** 外してあるか（大きな保存場所の meta に記録がある）。読めていない日は false。 */
  const isOut = () => !!outInfo;

  /**
   * 元（localStorage）へ書く形（store の liveShape が呼ぶ）。外したあとは、棚に `===` で
   * 届いたと確かめた過去の行（committed）を抜き、その id を印（todoOut）へ足した浅い複製。
   * 同じ id の二つ目以降は抜かない（棚は先の一つしか持たない）。まだ届いていない行・
   * 直したばかりの行は、そのまま元にも書く。読み込み中・読めない日は、記憶に行が無く
   * 印だけがあるので、そのまま書けば印を持ち越す（罠a）。
   */
  function forLive(s) {
    pastMemo = null;
    if (!outInfo || !committed) return s;
    const todos = s && s.todos;
    if (!Array.isArray(todos) || !todos.length) return s;
    const past = pastOf(s);
    pastMemo = { todos, map: past };
    Promise.resolve().then(() => { pastMemo = null; });
    const first = new Set();
    const drop = [];
    const keep = todos.filter((t) => {
      if (!t || !t.id || first.has(t.id)) return true;
      first.add(t.id);
      const p = past.get(t.id);
      if (!p || committed.get(t.id) !== p.json) return true;
      drop.push(t.id);
      return false;
    });
    if (!drop.length) return s;
    return { ...s, todos: keep, todoOut: [...new Set([...store.todoOut(s), ...drop])] };
  }

  const notReady = () => new Error(phase === "off"
    ? "過去のやることの棚を読めない日です" : "過去のやることを読み込んでいるところです");

  /* 書きかけを出して、棚への書き足しが済むまで待つ。 */
  async function settleWrites() {
    if (phase !== "on") throw notReady();
    store.flush();
    do { await idle(); } while (busy || batch || resyncing);
    if (phase !== "on" || !known || !committed) throw new Error("棚への書き足しが止まっています");
  }

  /**
   * 1回目「準備する」。棚を読み直して、記憶の過去の行と**全件 `===`** で読み比べます。
   * 一件でも違えば false（何も変えません）。合えば、読み直した行を committed に。
   */
  async function prepare() {
    await settleWrites();
    const got = await readAll();
    const inBox = new Map(got.rows.map((r) => [r.id, r.json]));
    let same = true;
    pastOf(store.get()).forEach((p, id) => { if (inBox.get(id) !== p.json) same = false; });
    if (!same) return false;
    committed = inBox;
    return true;
  }

  /**
   * 2回目「書き出して外す」の、書き出しを保存できたあと。meta に外したと記録してから、
   * その場で外した形で元を書き直します。元が書けたら true。
   */
  async function markOut(exportedAt) {
    if (phase !== "on" || !committed) throw notReady();
    const v = { at: new Date().toISOString(), exportedAt: exportedAt || null };
    await KN.idb.run(["meta"], "readwrite", (t) => { t.objectStore("meta").put({ k: OUT, v }); });
    outInfo = v;
    return store.saveNow();
  }

  /**
   * 戻す。**元に全件書けたときだけ**、外した記録を消します。書けなければ外したまま
   * 書き直して false。記録を消せなかったときも、外したまま書き直して例外。
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
   * 棚へ先に届けます（外したあとの復元。罠e）。`todos` は戻す記録のやること（reconcile
   * した形）。取引が済んだら known と committed に入れるので、そのあと元へ書くと、届けた
   * 行は外した形で書かれます。届けた件数。
   */
  async function deliver(todos) {
    await settleWrites();
    const list = [];
    pastOf({ todos: Array.isArray(todos) ? todos : [] }).forEach((p) => {
      if (known.get(p.id) !== p.json) list.push(p);
    });
    if (!list.length) return 0;
    busy = true;
    try {
      await KN.idb.run([BOX], "readwrite", (t) => {
        const box = t.objectStore(BOX);
        list.forEach((p) => box.put(p));
      });
      list.forEach((p) => { known.set(p.id, p.json); committed.set(p.id, p.json); });
    } finally {
      busy = false;
      drain();
      wakeIdle();
    }
    return list.length;
  }

  /* ---------------- 外から ---------------- */

  function ready() {
    if (phase === "idle") start();
    return readyP;
  }
  const settled = () => phase === "on" || phase === "off";
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function status() {
    return { ...info, phase, rows: known ? known.size : null, busy: busy || !!batch, out: !!outInfo };
  }
  /** その行のその字が、棚に届いたと確かめてあるか（元から外してよい行）。 */
  function delivered(id, json) {
    return phase === "on" && !!committed && typeof json === "string" && committed.get(id) === json;
  }
  /** 困ったときの記録に添える一行（数だけ）。 */
  function text() {
    const l = info.last || {};
    return "todoPast " + JSON.stringify({
      phase, opens: info.opens || 0, fixed: info.fixed || 0, rows: l.rows, same: l.same, fixedNow: l.fixed,
      added: l.added, orphan: l.orphan, missing: l.missing, back: l.back,
      out: store.todoOut().length, isOut: !!outInfo, error: info.error || null, reason: phase === "off" ? info.reason || null : null,
    });
  }

  KN.todoPast = {
    start, ready, settled, retry, onChange, status, delivered, afterWrite, reloaded, text,
    isOut, forLive, prepare, markOut, putBack, deliver,
  };
})();
