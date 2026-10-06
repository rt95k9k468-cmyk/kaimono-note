/* =========================================================
   くらしノート — 記録の写し（IndexedDB `kaimono-note` の meta "live"）

   決めごとは docs/storage.md の「記録の写し」（2026年10月6日）。

   元（localStorage の一本）を書くたびに、**同じ文字列**を大きな保存場所にも
   置きます。二度目の消失（iPhone が localStorage だけを丸ごと落とした）の
   手当て：控えは一時間おきなので、そこから戻すと最大一時間ぶんを失い、しかも
   本人が気づいて押すまで空のまま動いていました。写しは書くたびなので、開いた
   ときに元が無ければ、その場で写しから戻せます。

   - 置き場は meta の "live"（`{ seq, at, json }`）。棚を足さない（版を上げない）。
   - 番号は元と同じ `lsSeq`。開いたとき、**読んだときの**元（store.loadInfo）と比べる：
       元が無い                     → 写しを元へ
       元に番号があり、写しが大きい → 写しを元へ（元の保存が落ちていた・巻き戻った）
       それ以外                     → 元を写しへ
     置き換える前に、負ける側に中身があれば控えへ（間引かない）。
   - 比べ終わるまで写しへは書かない（空で立ち上がった記録で写しを上書きしない
     ため）。書きたいものは最新の一つだけ覚えて、済んでから。
   - 日記の写しの突き合わせ（diary-idb.js）は、これが済んでから始まる。
   - 記録が読めなかった日（loadError）・大きな保存場所が使えない日は、何もしない。
   - 開いた記録（journal）：開くたびの元と写しの番号・大きさ・決めたこと、使って
     いるうちに元が消えていた、などを新しい40件まで。localStorage と一緒に消えない
     よう、こちらに置く。数と番号だけで、記録の中身は残さない。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const LIVE = "live";
  const JOURNAL = "journal";
  const JOURNAL_MAX = 40;
  const GAP_MS = 1000;            // 写しへ書く間隔の下限（打っている最中に毎拍書かない）
  const RETRY_MS = 10000;         // 書けなかったときに、次に試すまで

  let phase = "idle";             // idle → starting → on | off
  let settle = null;
  const readyP = new Promise((r) => { settle = r; });
  let pending = null;             // まだ写していない、いちばん新しい { seq, at, json }
  let writing = false;
  let timer = null;
  let nextAt = 0;
  let last = null;                // 写しにある、いちばん新しいものの { seq, at }
  let did = "";                   // 開いたときに決めたこと
  let reason = "";                // off の理由
  let failed = false;             // 書けなかったことを errlog へ一度だけ
  let copyAtOpen = null;          // 開いたとき元と違っていた写しの { at, total }（元が勝ったとき）
  let journal = [];
  let jChain = Promise.resolve();

  const now = () => new Date().toISOString();
  const say = (err) => String((err && err.message) || err);
  const version = () => (KN.errlog && KN.errlog.version) || "dev";

  function valid(v) {
    return !!v && typeof v === "object" && typeof v.json === "string" && v.json.length > 1
      && isFinite(Number(v.seq));
  }

  function read() {
    return KN.idb.run(["meta"], "readonly", (t) => {
      const live = t.objectStore("meta").get(LIVE);
      const jr = t.objectStore("meta").get(JOURNAL);
      return () => ({
        live: live.result ? live.result.v : null,
        journal: jr.result && Array.isArray(jr.result.v) ? jr.result.v : [],
      });
    });
  }

  /* ---------------- 立ち上がり ---------------- */

  function start() {
    if (phase !== "idle") return readyP;
    phase = "starting";
    boot().catch((err) => {
      console.warn("live copy is off:", err);
      phase = "off";
      reason = say(err);
    }).then(() => {
      settle();
      pump();
    });
    return readyP;
  }

  function ready() {
    if (phase === "idle") start();
    return readyP;
  }

  async function boot() {
    const info = store.loadInfo();
    if (store.loadError()) throw new Error("記録が読めなかった日なので、写しには触れません");
    if (!KN.idb || !KN.idb.available()) throw new Error("この端末では、大きな保存場所が使えません");
    const got = await read();
    journal = got.journal;
    const v = valid(got.live) ? got.live : null;
    const entry = {
      at: now(), kind: "open", ver: version(),
      had: info.hadData, seq: info.seq, chars: rawLen(), keys: lsKeys(),
      vseq: v ? Number(v.seq) : null, vat: v ? v.at : null, vchars: v ? v.json.length : null,
    };
    if (v && (!info.hadData || (info.seq > 0 && Number(v.seq) > info.seq))) {
      entry.did = adopt(v, info.hadData ? "older" : "restored");
    } else {
      /* 元を写しへ。元に番号の無いもの（直に書いた・古い版）も、ここ（元が勝つ）。
         写しのほうが中身がずっと多いなら、置き換える前に控えへ。 */
      if (v && v.json !== store.rawLive()) await keepIfFuller(v);
      entry.did = !v ? "first" : Number(v.seq) === info.seq ? "same" : "copied";
      if (!pending) {
        const raw = store.rawLive();
        if (raw && (!v || raw !== v.json)) pending = { seq: store.lsSeq(), at: now(), json: raw };
      }
      last = v ? { seq: Number(v.seq), at: v.at } : null;
    }
    did = entry.did;
    phase = "on";
    storageInfo().then((s) => note(Object.assign(entry, s || {}), true));
  }

  /* 写しを元へ。戻す前の記憶の中身は、中身があれば控えへ（「写しから戻す前」）。
     その控えは戻したあとで取ります——先に取ると、取り終わるまでに打った字が
     控えにも戻した記録にも入らない。記憶の中の古い state は置き換わったあと
     誰も書き換えないので、あとで取っても同じ中身です。 */
  function adopt(v, why) {
    const before = store.get();
    pending = null;   // 空で立ち上がった記録の書きかけは、写しへ送らない
    if (!store.adoptRaw(v.json)) return "adopt-failed";
    last = { seq: Number(v.seq), at: v.at };
    if (KN.backup && !store.isBlank(before)) {
      KN.backup.take("写しから戻す前", { state: before, now: true }).catch(() => {});
    }
    if (why === "restored" && KN.ui && KN.ui.toast) KN.ui.toast(`記録を ${stamp(v.at)} の状態に戻しました`);
    return why;
  }

  /* 写しのほうが中身がずっと多いのに元が勝つとき（古い版が空に近い元を書いた、
     など）は、写しの中身を控えへ（「写しを置き換える前」）。写しの数は、開いたときの
     点検（backup.js の inspectOpen）に渡す。 */
  async function keepIfFuller(v) {
    try {
      const was = JSON.parse(v.json);
      if (!was || typeof was !== "object") return;
      delete was.lsSeq;
      copyAtOpen = { at: v.at, total: store.totalOf(was) };
      if (!store.shrinks(copyAtOpen.total, store.totalOf(store.get()))) return;
      if (KN.backup) await KN.backup.take("写しを置き換える前", { state: was, now: true });
    } catch (err) {
      console.warn("keep live copy", err);
    }
  }

  /* ---------------- 書くたびに ---------------- */

  /**
   * store が元（localStorage）を書いたあとに呼びます（writeLive）。元が書けな
   * かったときも呼ばれます——容量で落ちているあいだの記録を、写しに残すため。
   */
  function afterWrite(json, seq) {
    pending = { seq, at: now(), json };
    if (phase !== "on") return;
    pump(typeof document !== "undefined" && document.visibilityState === "hidden");
  }

  function pump(rush) {
    if (phase !== "on" || writing || !pending) return;
    const wait = rush ? 0 : Math.max(0, nextAt - Date.now());
    if (wait) {
      if (!timer) timer = setTimeout(() => { timer = null; pump(); }, wait);
      return;
    }
    clearTimeout(timer);
    timer = null;
    writing = true;
    nextAt = Date.now() + GAP_MS;
    const p = pending;
    pending = null;
    KN.idb.run(["meta"], "readwrite", (t) => {
      t.objectStore("meta").put({ k: LIVE, v: { seq: p.seq, at: p.at, json: p.json } });
    }).then(() => {
      last = { seq: p.seq, at: p.at };
      failed = false;
    }, (err) => {
      if (!pending) pending = p;
      nextAt = Date.now() + RETRY_MS;
      if (!failed && KN.errlog) KN.errlog.note("save", err, { file: "live-idb.js" });
      failed = true;
    }).then(() => {
      writing = false;
      if (pending) pump();
    });
  }

  /* ---------------- 開いた記録 ---------------- */

  /** 開いた記録に一件。`entry.kind` は "open"（開いた）・"vanished"（使っている
      うちに元が消えていた）・"other"（ほかの画面が書いた）・"shrink"（一度に大きく
      減った）・"doubt"（開いたときの点検で、写しか控えより大きく少なかった。backup.js）。
      数と番号だけを渡すこと。 */
  function note(entry, quiet) {
    const e = Object.assign({ at: now(), ver: version() }, entry);
    journal = journal.concat([e]).slice(-JOURNAL_MAX);
    if (!quiet && KN.errlog) KN.errlog.note("save", `${e.kind} ${e.seq != null ? "seq " + e.seq : ""}`.trim(), { file: "store.js" });
    if (!KN.idb || !KN.idb.available() || phase === "off") return;
    const list = journal;
    jChain = jChain.then(() => KN.idb.run(["meta"], "readwrite", (t) => {
      t.objectStore("meta").put({ k: JOURNAL, v: list });
    })).catch(() => { /* 記録できなくても、守る側は止めない */ });
  }

  /* 端末の保存の様子（永続にしてもらえたか・使っている量）。開いた記録に添える。 */
  function storageInfo() {
    const S = typeof navigator !== "undefined" && navigator.storage;
    if (!S || !S.estimate) return Promise.resolve(null);
    const p = Promise.all([
      S.persisted ? S.persisted().catch(() => null) : null,
      S.estimate().catch(() => null),
    ]).then(([persisted, est]) => ({
      persisted,
      usage: est && est.usage != null ? est.usage : null,
      quota: est && est.quota != null ? est.quota : null,
    }));
    return Promise.race([p, new Promise((r) => setTimeout(() => r(null), 1500))]);
  }

  function rawLen() { const r = store.rawLive(); return r ? r.length : 0; }
  function lsKeys() { try { return localStorage.length; } catch (_) { return null; } }

  function stamp(iso) {
    const d = new Date(iso);
    if (!isFinite(d)) return "前";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /** コピーする字（設定 →「困ったときの記録」）。新しいものから、一件一行。 */
  function journalText() {
    return journal.slice().reverse().map((e) => JSON.stringify(e)).join("\n");
  }

  /** 設定・試験に出すもの。 */
  function status() {
    return { phase, did, reason, last, waiting: !!pending, failed, copy: copyAtOpen };
  }

  /** 待っている書き込みを、いま写しへ（約束で、書き終えたら）。試験と、隠れる直前に。 */
  function flush() {
    const until = Date.now() + 3000;
    return ready().then(() => new Promise((resolve) => {
      const check = () => {
        if (phase !== "on" || (!pending && !writing) || Date.now() > until) { resolve(status()); return; }
        pump(true);
        setTimeout(check, 30);
      };
      check();
    }));
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") pump(true);
    });
  }

  KN.liveIdb = { start, ready, afterWrite, note, status, journal: () => journal.slice(), journalText, flush, LIVE };
})();
