/* =========================================================
   くらしノート — 睡眠のステージ（深い・コア・レム・覚醒）
   =========================================================

   ヘルスケアの「睡眠分析」は、一晩を細切れの区間で持っています。
   ショートカットの「ヘルスサンプルを探す」がそのまま出すと、こうなります。

     {"duration":"12:29","value":"コア","end":"2026/08/26 1:05","start":"2026/08/26 0:53"}

   これを一晩ぶんにまとめ、四つの型の時間・就寝・起床・睡眠時間を出します。

   ---- duration は読みません ----

   上の行の duration は **12分29秒** です。12時間29分ではありません。
   ところが既存の toMinutes() は「12:29」を 12時間29分＝749分 と読みます
   （そちらは「sleep=7:12」＝7時間12分を読むための関数なので、正しい）。
   同じ「数:数」が、片方では時分・片方では分秒を意味します。

   だから duration は**捨てて**、start と end の差から数えます。実データ83行で
   検算したところ、四つの型の合計とベッド滞在時間の差は0分でした。

   ---- 一晩の切り分け ----

   届くのは窓ぶん（前日12:00〜いま）で、二晩ぶん入ることがあります。
   区間が3時間以上とぎれたら「別の晩」とします。晩の中の覚醒は区間として
   記録されている（＝とぎれではない）ので、これで混ざりません。

   ---- どの晩が「その日の晩」か ----

   **その日に終わった晩**です。複数あればいちばん早く終わったもの——
   昼寝を夜の記録として拾わないためです。

   就寝時刻は「前日」に決め打ちしません。00:42に寝て08:13に起きた晩では、
   就寝も起床も同じ日です。**始まりが実際に属する日**に書きます。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;

  /* ヘルスケアが返す名前。日本語・英語のどちらでも受けます——ショートカットは
     端末の言語で書き出すので、片方だけにすると英語端末で黙って落ちます。 */
  const STAGES = {
    "深い": "deep", "deep": "deep", "asleepdeep": "deep",
    "コア": "core", "core": "core", "asleepcore": "core", "asleep": "core", "睡眠": "core",
    "レム": "rem", "rem": "rem", "asleeprem": "rem",
    "覚醒": "awake", "awake": "awake", "起きている": "awake",
    /* 「ベッドにいる」は Apple Watch を着けずに寝た夜などに来ます。眠っていた
       とは言えないので、四つのどれにも足しません（下で捨てます）。 */
    "inbed": null, "ベッド": null,
  };

  const normStage = (v) => {
    const k = String(v == null ? "" : v).trim().toLowerCase().replace(/[\s_-]/g, "");
    return Object.prototype.hasOwnProperty.call(STAGES, k) ? STAGES[k] : undefined;
  };

  /* 「2026/08/26 0:51」「2026-08-26 00:51」「2026-08-26T00:51:00+09:00」を受けます。
     前の二つは**その端末の時刻**として読みます——ヘルスケアが書き出すのは
     現地時刻で、UTCとして読むと九時間ずれた晩になります。 */
  function parseAt(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v == null ? "" : v).trim();
    if (!s) return null;
    const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);          // ISO（帯つき）はここで
    return isNaN(d.getTime()) ? null : d;
  }

  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    + `-${String(d.getDate()).padStart(2, "0")}`;
  const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  /**
   * 行の並びを、区間の並びに直します。
   * 読めない行・ステージでない行は黙って捨てます（他の種類のサンプルが
   * 混ざって届くことがあるため）。
   */
  function toSegments(rows) {
    const out = [];
    (rows || []).forEach((r) => {
      if (!r || typeof r !== "object") return;
      const stage = normStage(r.value != null ? r.value : r.stage);
      if (stage === undefined || stage === null) return;   // 未知＝別の種類 / null＝ベッドのみ
      const start = parseAt(r.start != null ? r.start : r.startDate);
      const end = parseAt(r.end != null ? r.end : r.endDate);
      if (!start || !end || end <= start) return;
      out.push({ stage, start, end });
    });
    return out.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  /** 3時間以上とぎれたら別の晩。 */
  const GAP_MIN = 180;

  function toNights(segs) {
    const out = [];
    segs.forEach((s) => {
      const cur = out[out.length - 1];
      if (!cur || (s.start - cur.end) / 60000 > GAP_MIN) {
        out.push({ segs: [s], start: s.start, end: s.end });
      } else {
        cur.segs.push(s);
        if (s.end > cur.end) cur.end = s.end;
      }
    });
    return out;
  }

  /** 一晩ぶんを数えます。時間はぜんぶ分で、四捨五入は最後だけ。 */
  function summarize(night) {
    const by = { deep: 0, core: 0, rem: 0, awake: 0 };
    night.segs.forEach((s) => { by[s.stage] += (s.end - s.start) / 60000; });
    const asleep = by.deep + by.core + by.rem;
    const r = (n) => Math.round(n);
    return {
      /* 睡眠時間は 深い+コア+レム。覚醒はベッドにいただけなので入れません
         （Appleの「睡眠時間」と同じ数え方）。 */
      asleepMin: r(asleep),
      inBedMin: r((night.end - night.start) / 60000),
      stages: { deep: r(by.deep), core: r(by.core), rem: r(by.rem), awake: r(by.awake) },
      bedDay: dayKey(night.start),
      bedTime: hhmm(night.start),
      wakeDay: dayKey(night.end),
      wakeTime: hhmm(night.end),
      // 起床が「いま」に近すぎる晩は、まだ寝ている途中に取った疑いがあります。
      endAt: night.end.toISOString(),
      segments: night.segs.length,
    };
  }

  /**
   * 届いた行から、晩ごとのまとめを返します。新しい晩が先。
   *
   * 一日ぶんに絞りません——届いた窓に二晩あれば二晩とも返します。どれを
   * どの日に書くかは、受け取った側（health-sync）が決めます。
   */
  function nightsFrom(rows) {
    const segs = toSegments(rows);
    if (!segs.length) return [];
    return toNights(segs).map(summarize).sort((a, b) => (a.endAt < b.endAt ? 1 : -1));
  }

  /**
   * その日の晩を一つ選びます。**その日に終わった晩**のうち、いちばん早く
   * 終わったもの——昼寝を夜の記録として拾わないためです。
   *
   * 短すぎるものは晩と見ません（うたた寝を「今夜の睡眠」にしないため）。
   */
  function nightForDay(nights, day, minMin) {
    const floor = minMin == null ? 60 : minMin;
    return (nights || [])
      .filter((n) => n.wakeDay === day && n.inBedMin >= floor)
      .sort((a, b) => (a.endAt < b.endAt ? -1 : 1))[0] || null;
  }

  /** 行の並びが「睡眠のステージ」かどうか。取り込み口の振り分けに使います。 */
  function looksLikeStages(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    let hit = 0;
    rows.forEach((r) => {
      if (!r || typeof r !== "object") return;
      const st = normStage(r.value != null ? r.value : r.stage);
      if (st !== undefined && (r.start || r.startDate) && (r.end || r.endDate)) hit++;
    });
    return hit >= Math.max(2, Math.ceil(rows.length * 0.5));
  }

  KN.sleepStages = {
    nightsFrom, nightForDay, looksLikeStages,
    // 試験と、他所からの検算のために出しておきます。
    toSegments, toNights, summarize, parseAt, normStage, GAP_MIN,
  };
})();
