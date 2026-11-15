/* =========================================================
   くらしノート — 一日の頁の並び（構1。shots/vision/README.md 6.2・6.4）

   一日ぶんの記録を受けて、頁の行の並びを返すだけ（DOM にも store にも触らない。読むだけ）。
   記録に時刻の欄は足さない——持っている時刻を引いて並べる（写しを持たないので、直せば次に描くとき動く）。
   集めるのは画面の側（screen-archive.js の pageOf）。ここは試験が node で直に確かめる。

   入力 rec：
     day     "YYYY-MM-DD"
     posts   KN.diaryPosts.parse(memo) の一件ずつ（mark・at・date・text…）
     todos   その日に済ませた用事 [{ id, title, due, time, doneDay, doneClock }]（doneClock＝丸を押した時 "HH:MM"）
     bought  買ったもの [{ id, title, day, clock }]（checkedAt を端末の日と時刻に）
     meals   食事 [{ slot, time, text }]（枠ごと。time は入れたときだけ）
     weight  { time, kg } | null
     wake / sleep "HH:MM" | null、sleepMin 眠りの長さ（分）| null、steps | null
     slotOf  (分) → 時間帯（無ければ時間帯の境を置かない）
   出力：[{ kind, zone, at, min, key, brk, showAt, ... }]
     kind  head・post・later・wake・weight・meal・done・bought・sleep・steps
     zone  top（頭）・time（時刻の並び）・end（あとから書いた）・foot（足もと）
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const ORDER = { wake: 0, weight: 1, meal: 2, done: 3, bought: 4, post: 5, sleep: 6 };
  /* 時刻の無い食事は枠の場所に（朝7・昼12・間食15・夕19時）。時刻の列は枠の名。 */
  const SLOT = { breakfast: [7, "朝"], lunch: [12, "昼"], snack: [15, "間食"], dinner: [19, "夕"] };
  const BUNDLE = 30;      // 続きと見なす間（分）
  const DONE_MIN = 3;     // 済ませた用事は三つ続いたら一行に

  const minOf = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const clock = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  /* 就寝の並び：5時より前は前の晩の続き（health-sync の nightRank と同じ）。 */
  const night = (min) => (min < 5 * 60 ? min + 24 * 60 : min);

  /** 済ませた用事の置き場（分）。その日の頁に出ないものは null。 */
  function doneMin(t, day) {
    if (!t || t.doneDay !== day) return null;
    const done = minOf(t.doneClock);
    if (done == null) return null;
    const plan = t.due === day ? minOf(t.time) : null;
    /* 決めた時刻があってその日に済ませたら決めた時刻。始まりより前に押したものだけ押した時。 */
    return plan != null && plan <= done ? plan : done;
  }

  /** 続けて並んだ同じ種類を束ねる（間が BUNDLE 分以内で、少なくとも n 件）。 */
  function bundle(list, kind, n) {
    const out = [];
    for (let i = 0; i < list.length;) {
      let j = i + 1;
      if (list[i].kind === kind) {
        while (j < list.length && list[j].kind === kind && list[j].min - list[j - 1].min <= BUNDLE) j++;
      }
      if (list[i].kind === kind && j - i >= n) {
        const run = list.slice(i, j);
        out.push(Object.assign({}, run[0], { items: run.map((r) => r.item), many: true }));
      } else out.push(list[i]), (j = i + 1);
      i = j;
    }
    return out;
  }

  function rows(rec) {
    const r = rec || {};
    const day = r.day;
    const top = [], end = [], foot = [], time = [];
    const put = (kind, min, extra) => time.push(Object.assign({ kind, zone: "time", min, at: clock(min) }, extra));

    (r.posts || []).forEach((p, k) => {
      const m = p.mark ? minOf(p.at) : null;
      if (!p.mark || m == null) top.push({ kind: "head", zone: "top", k, post: p });
      else if (p.date) end.push({ kind: "later", zone: "end", k, post: p, at: `${p.date} ${p.at}` });
      else put("post", m, { k, post: p });
    });

    const wake = minOf(r.wake);
    if (wake != null) put("wake", wake, { sleepMin: r.sleepMin == null ? null : r.sleepMin });
    else if (r.sleepMin != null) foot.push({ kind: "sleepLen", zone: "foot", sleepMin: r.sleepMin });

    const w = r.weight;
    if (w && w.kg != null) {
      const m = minOf(w.time);
      if (m != null) put("weight", m, { kg: w.kg });
      else foot.push({ kind: "weight", zone: "foot", kg: w.kg });
    }

    /* 食事は枠ごとに一行。枠に時刻の入った記録があれば、いちばん早い時刻に。無ければ枠の場所。 */
    const slots = {};
    (r.meals || []).forEach((m) => {
      if (!SLOT[m.slot] || !String(m.text || "").trim()) return;
      const s = (slots[m.slot] = slots[m.slot] || { texts: [], min: null });
      s.texts.push(String(m.text).trim());
      const t = minOf(m.time);
      if (t != null && (s.min == null || t < s.min)) s.min = t;
    });
    Object.keys(SLOT).forEach((id) => {
      const s = slots[id];
      if (!s) return;
      const [h, label] = SLOT[id];
      if (s.min != null) put("meal", s.min, { slot: id, text: s.texts.join("、") });
      else put("meal", h * 60, { slot: id, text: s.texts.join("、"), at: label, framed: true });
    });

    (r.todos || []).forEach((t) => {
      const m = doneMin(t, day);
      if (m != null) put("done", m, { item: { id: t.id, title: t.title } });
    });
    (r.bought || []).forEach((b) => {
      const m = b.day === day ? minOf(b.clock) : null;
      if (m != null) put("bought", m, { item: { id: b.id, title: b.title } });
    });

    const sleep = minOf(r.sleep);

    /* 同じ時刻は 起床→体重→食事→済ませた→買った→言葉。並びが同じなら入ってきた順（安定）。 */
    time.forEach((x, i) => { x.key = x.min * 10 + ORDER[x.kind]; x.n = i; });
    time.sort((a, b) => a.key - b.key || a.n - b.n);
    let list = bundle(time, "done", DONE_MIN);
    list = bundle(list, "bought", 2);
    /* 就寝は頁の最後（0〜5時は 23時台より後ろ。並びの鍵は夜の続きで数える）。 */
    if (sleep != null) list.push({ kind: "sleep", zone: "time", min: sleep, at: clock(sleep), key: night(sleep) * 10 + ORDER.sleep });

    /* 時刻の字は一度だけ。時間帯の境で空け、境の最初の時刻だけ太く。 */
    let prevAt = null, prevBand = null;
    list.forEach((x) => {
      x.showAt = x.at !== prevAt;
      prevAt = x.at;
      const band = typeof r.slotOf === "function" ? r.slotOf(x.min) : null;
      x.brk = band != null && prevBand != null && band !== prevBand;
      x.band = band;
      prevBand = band;
      delete x.n;
    });

    if (r.steps != null) foot.push({ kind: "steps", zone: "foot", steps: r.steps });
    return top.concat(list, end, foot);
  }

  KN.dayPage = { rows, minOf, clock };
})();
