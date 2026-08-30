/* =========================================================
   くらしノート — 一日を組み立てる

   やることの一覧は「何が残っているか」しか言いません。時間軸は
   **「今日をどう配ると収まるのか」**を言います。同じ5件でも、
   一覧なら「5件ある」で終わり、時間軸なら「昼までに3件、夕方に2件、
   あいだが1時間空いている」と読めます。

   ここは**組み立てるだけ**で、何も保存しません。保存するのは人が
   決めたこと（時刻・かかる時間・順番）だけで、「何時に始まるか」は
   そこから毎回導きます。導いた結果を保存すると、翌日には嘘になります。

   -------------------------------------------------------------------
   決まりごと（この四つだけです）

   1. **時刻を持つものは動かない。** 「16:00に病院」は16:00です。
   2. **持たないものは、前のものの後ろへ順に置く。** 置き場所は
      その日の始まりから順に詰めます。
   3. **毎朝は一日の頭、毎晩は一日の終わり。** これは並び順の指定なので、
      時刻を持っていても端に立ちます（時刻はそのまま尊重します）。
   4. **空いた時間は、空いたと言う。** 埋めません。「1時間20分あいている」
      と分かることが、配り直すための材料になります。

   -------------------------------------------------------------------
   評価はしません。

   予定より遅れていても、赤くしません。「達成率」も「予定通り」も出しません。
   現実の生活は崩れるものだ、というのがこの画面の前提です。出すのは
   「いま何時か」と「あと何が残っているか」だけで、そこから先は本人が
   決めることです。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;

  /* かかる時間を決めていないものに当てる長さ。

     30分にしたのは、短すぎると一日が実際よりたくさん入るように見え、
     長すぎると空きが無いように見えるからです。どちらも「配り直す材料」
     としては嘘になります。30分は、家事も用事もだいたいこのくらい、
     という当たりです（人が決めた数があれば、必ずそちらを使います）。 */
  const DEFAULT_MINUTES = 30;

  /* 一日の枠。ここから外は「今日」として扱いません。設定で動かせます。

     5:00〜23:00 にしてあります。7:00〜22:00 では、早い朝と遅い夜が枠の
     外に落ちました——早起きして片づけたものが「はみ出し」になったり、
     寝る前の用事が置けなかったり。広めに取って、実際の暮らしに合わせて
     設定で狭めてもらうほうが、間違いが少ない。 */
  const DEFAULT_START = "05:00";
  const DEFAULT_END = "23:00";

  /* これ未満の空きは、空きと呼びません。5分の隙間を「自由時間」と
     書かれても、何にも使えないので。 */
  const MIN_GAP = 10;

  /* ---------------- 時刻と分の行き来 ---------------- */

  const toMin = (hhmm) => {
    if (!U.isTime(hhmm)) return null;
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + m;
  };
  /* 24時をまたいでも折り返しません（1470 → 「24:30」）。深夜25時と書く
     あの言い方です。折り返すと「07:00に始まって07:00に終わる」ができて
     しまい、溢れているのか一瞬なのかが区別できなくなります。 */
  const toTime = (min) => {
    const m = Math.max(0, Math.round(min));
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  /** 「1時間20分」「45分」。0 は返しません（呼ぶ側が空きを間引くので）。 */
  function humanSpan(min) {
    const n = Math.round(min);
    if (n < 60) return `${n}分`;
    const h = Math.floor(n / 60), m = n % 60;
    return m ? `${h}時間${m}分` : `${h}時間`;
  }

  const minutesOf = (t) => (t && t.minutes) || DEFAULT_MINUTES;

  /* ---------------- 並べる ---------------- */

  /* 毎朝・毎晩は一日の端。あいだは、時刻を持つものが時刻順、持たないものは
     そのあと。これは既存の並び（store.sortedTodos）と同じ考え方で、
     ここでは「端に立つ」を先に確定させてから中を並べます。 */
  function ordered(todos) {
    const dawn = [], dusk = [], timed = [], loose = [];
    todos.forEach((t) => {
      if (t.part === "dawn") dawn.push(t);
      else if (t.part === "dusk") dusk.push(t);
      else if (U.isTime(t.time)) timed.push(t);
      else loose.push(t);
    });
    const byTime = (a, b) => (toMin(a.time) - toMin(b.time)) || ((a.order || 0) - (b.order || 0));
    const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
    dawn.sort((a, b) => (U.isTime(a.time) && U.isTime(b.time) ? byTime(a, b) : byOrder(a, b)));
    dusk.sort((a, b) => (U.isTime(a.time) && U.isTime(b.time) ? byTime(a, b) : byOrder(a, b)));
    timed.sort(byTime);
    loose.sort(byOrder);
    return { dawn, dusk, middle: timed.concat(loose) };
  }

  /**
   * 一日を組み立てます。
   *
   * @param {string} day        「YYYY-MM-DD」
   * @param {object[]} todos    その日の、まだ済んでいないものと済んだもの
   * @param {object} [opts]     { start, end }（省略時は設定、無ければ 7:00–22:00）
   * @returns {{ day, start, end, items, free, freeTotal, over }}
   *
   *   items … { todo, at, until, minutes, fixed, clash }
   *            at/until は「HH:MM」。fixed は時刻を持っていたか。
   *            clash は、前のものと重なってしまったか（重なりは
   *            隠さずに言います。隠すと、なぜ入らないのかが分からない）。
   *   free  … { at, until, minutes } の並び。空き。
   *   over  … 一日の枠から溢れた分（分）。0 なら収まっています。
   */
  /** ふさがっている時間帯（[start,end) の並び、開始順）に対して、
      `from` 以降でいちばん早い、`len` 分入る場所を返します。 */
  function firstGap(from, len, blocks) {
    let at = from;
    // blocks は開始順。前から順に、ぶつかるたびにその後ろへ送ります。
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.end <= at) continue;          // もう過ぎている
      if (b.start >= at + len) break;     // その前に入りきる
      at = b.end;                          // ぶつかった。後ろへ。
    }
    return at;
  }

  const addBlock = (blocks, start, end) => {
    blocks.push({ start, end });
    blocks.sort((a, b) => a.start - b.start);
  };

  /**
   * @param {object} [opts]
   *   start / end … 一日の枠（「HH:MM」）
   *   now         … 「いま」。渡すと、**まだ済んでいない**時刻なしのものを
   *                 ここから先へ置きます。今日を見ているときだけ渡すこと。
   */
  function buildDay(day, todos, opts) {
    const o = opts || {};
    const dayStart = toMin(o.start) != null ? toMin(o.start) : toMin(DEFAULT_START);
    const dayEnd = toMin(o.end) != null ? toMin(o.end) : toMin(DEFAULT_END);
    /* 「いま」。これが、この画面がいちばん役に立つところです。

       前は一日の始まりから詰めるだけでした。つまり15時に開いても、残った
       用事が7時・7時半・8時…と並びます。**もう過ぎた時刻に、これからやる
       ことが並ぶ**わけで、「今日をどう配るか」の役には立ちません。

       いまから先へ置けば、出てくる空きも「これから使える時間」になります。
       予定が崩れたら勝手に詰め直る、というのはこれのことです——遅れを
       責めるのではなく、**残りを数え直すだけ**です。 */
    const now = toMin(o.now);

    const { dawn, dusk, middle } = ordered(todos || []);
    const items = [];
    const blocks = [];   // ふさがっている時間帯

    /* 済んだものは、詰め直しの対象になりません。もうやったことなので
       置いたままにして、これからの時間は食べさせません。 */
    const doneOf = (t) => !!(t.done || t.archived);
    const floorFor = (t) => (now != null && !doneOf(t) ? Math.max(dayStart, now) : dayStart);

    /* 済ませた**実際の時刻**。doneAt はもともと時刻まで持っていました
       （ISO の刻印）が、組み立てが読んでいませんでした。読まないと、
       済んだものが一日の頭から順に詰められて、朝に済ませたことになります
       ——それは作り話です。押した時刻に置きます。

       終わりがその時刻で、始まりはそこから長さぶん手前。「10:42 に押した、
       20分かかった」を素直に読むと、10:22〜10:42 です。 */
    function doneSpan(t) {
      if (!doneOf(t) || !t.doneAt) return null;
      const d = new Date(t.doneAt);
      if (isNaN(d.getTime())) return null;
      if (U.dayKey(d) !== day) return null;          // 別の日に押したもの
      const end = d.getHours() * 60 + d.getMinutes();
      const len = minutesOf(t);
      if (end <= dayStart) return null;              // 枠の外。ふつうに詰めます
      return { start: Math.max(dayStart, end - len), end };
    }

    /* ---- ① 時刻を持つものに、先に場所を与える ----

       ここは一度まちがえました。来た順に一本の cursor で置いていくと、
       「16:00の病院」を先に置いたせいで、時刻を持たない「洗濯」が
       17:00 に回りました。朝じゅう空いているのに、です。

       時刻を持つものは**動かない予定**で、持たないものは**空いた
       ところに入るもの**です。順番の問題ではなく、種類の違いなので、
       先に固定を全部置いてから、残りを隙間に入れます。 */
    const fixedOf = (t) => U.isTime(t.time);
    [].concat(dawn, middle, dusk).filter(fixedOf).forEach((t) => {
      const len = minutesOf(t);
      const start = toMin(t.time);
      // 先に置いた固定と重なっているか。動かさずに、重なりとして言います。
      const clash = blocks.some((b) => start < b.end && start + len > b.start);
      items.push({ todo: t, atMin: start, untilMin: start + len,
                   minutes: len, fixed: true, clash });
      addBlock(blocks, start, start + len);
    });

    /** 時刻を持たないものを、`from` から順に空きへ置きます。返りは次の場所。 */
    function place(list, from) {
      let c = from;
      list.forEach((t) => {
        const len = minutesOf(t);
        /* 済ませたものは、押した時刻に置きます（詰めません）。
           押した記録が無いものだけ、順に詰めます。 */
        const span = doneSpan(t);
        const start = span ? span.start : firstGap(Math.max(c, floorFor(t)), len, blocks);
        const until = span ? span.end : start + len;
        items.push({ todo: t, atMin: start, untilMin: until,
                     minutes: until - start, fixed: false, clash: false,
                     doneAtMin: span ? span.end : null });
        addBlock(blocks, start, until);
        if (!span) c = until;
      });
      return c;
    }

    /* ---- ② 毎朝の、時刻を持たないもの。一日の頭から詰めます ----

       済ませたものを先に置きます。もうやったことなので朝のところに残り、
       これからの時間を食べません。まだのものは「いま」から先へ。 */
    const dawnFlex = dawn.filter((t) => !fixedOf(t));
    let cursor = place(dawnFlex.filter(doneOf), dayStart);
    cursor = place(dawnFlex.filter((t) => !doneOf(t)), cursor);

    /* ---- ③ あいだの、時刻を持たないもの。毎朝の後ろから、空きへ ----

       「毎朝は一日の頭」は、時間軸でも守ります。ここで cursor を毎朝の
       いちばん後ろまで進めておかないと、6:30 に固定した「服薬（毎朝）」の
       **前**に、時刻を持たない「掃除」が入ってしまいます。時計としては
       正しくても、毎朝を頭に置くと決めた意味が消えます。 */
    const dawnEnd = items
      .filter((it) => it.todo.part === "dawn")
      .reduce((n, it) => Math.max(n, it.untilMin), dayStart);
    cursor = Math.max(cursor, dawnEnd);

    const midFlex = middle.filter((t) => !fixedOf(t));
    cursor = place(midFlex.filter(doneOf), cursor);
    cursor = place(midFlex.filter((t) => !doneOf(t)), cursor);

    /* ---- ④ 毎晩の、時刻を持たないもの。一日の終わりに寄せます ----

       「寝る前にやること」は、終わりに寄っているほうが本当なので、
       合計の長さぶんだけ dayEnd から手前に置きます。あいだのものが
       そこまで伸びていたら、その後ろへ。 */
    const duskFlex = dusk.filter((t) => !fixedOf(t));
    const duskLen = duskFlex.filter((t) => !doneOf(t)).reduce((n, t) => n + minutesOf(t), 0);
    let duskCursor = place(duskFlex.filter(doneOf), cursor);
    place(duskFlex.filter((t) => !doneOf(t)), Math.max(duskCursor, dayEnd - duskLen));

    const sorted = items.slice().sort((a, b) => a.atMin - b.atMin || a.untilMin - b.untilMin);
    sorted.forEach((it) => { it.at = toTime(it.atMin); it.until = toTime(it.untilMin); });

    /* 空き。となりどうしのあいだと、一日の始まり・終わりの端。 */
    const free = [];
    let edge = dayStart;
    sorted.forEach((it) => {
      if (it.atMin - edge >= MIN_GAP) {
        free.push({ at: toTime(edge), until: toTime(it.atMin),
                    atMin: edge, untilMin: it.atMin, minutes: it.atMin - edge });
      }
      edge = Math.max(edge, it.untilMin);
    });
    if (dayEnd - edge >= MIN_GAP) {
      free.push({ at: toTime(edge), until: toTime(dayEnd),
                  atMin: edge, untilMin: dayEnd, minutes: dayEnd - edge });
    }

    /* 溢れ。**分のまま**で測ります——「HH:MM」に直してから引くと、
       24時をまたいだ日に折り返して 0 になります（実際そうなりました）。 */
    const last = sorted.length ? Math.max(...sorted.map((i) => i.untilMin)) : dayStart;

    /* 空きは二つ数えます。

       freeTotal … 一日ぜんぶの空き。
       freeAhead … **いまから先**の空き。

       分けたのは、合計だけ出すと嘘になるからです。15時に「空き13時間15分」
       と出しても、そのうち8時間はもう過ぎています。人が知りたいのは
       「これから何ができるか」なので、今日を見ているあいだはこちらを出します。 */
    const ahead = now == null ? null
      : free.reduce((n, f) => n + Math.max(0, f.untilMin - Math.max(f.atMin, now)), 0);

    return {
      day,
      start: toTime(dayStart),
      end: toTime(dayEnd),
      startMin: dayStart,
      endMin: dayEnd,
      nowMin: now,
      items: sorted,
      free,
      freeTotal: free.reduce((n, f) => n + f.minutes, 0),
      freeAhead: ahead,
      over: Math.max(0, last - dayEnd),
    };
  }

  /* ---------------- 空きへ入れる ---------------- */

  /**
   * この長さのものが入る空きを、早い順に挙げます。
   *
   * Quick Capture が「いつやりますか」と聞かずに済ませるための材料です。
   * 「10:00〜10:15 が空いています」と出してから聞けば、答えは一押しで済みます。
   *
   * @param {object} plan   buildDay の返り
   * @param {number} minutes  入れたい長さ（分）
   * @param {string} [after]  この時刻より後だけ（省略時は「いま」以降）
   * @returns {{at, until, minutes}[]}  最大3つ
   */
  function slotsFor(plan, minutes, after) {
    const len = Math.max(5, Number(minutes) || DEFAULT_MINUTES);
    const floor = toMin(after) != null ? toMin(after) : toMin(U.nowTime());
    return plan.free
      .map((f) => {
        const at = floor == null ? f.atMin : Math.max(f.atMin, floor);
        return { at: toTime(at), until: toTime(at + len), minutes: len,
                 atMin: at, room: f.untilMin - at };
      })
      .filter((f) => f.room >= len)
      .slice(0, 3)
      .map(({ at, until, minutes: m, atMin }) => ({ at, until, minutes: m, atMin }));
  }

  KN.plan = {
    buildDay, slotsFor, humanSpan, toMin, toTime,
    DEFAULT_MINUTES, DEFAULT_START, DEFAULT_END, MIN_GAP,
  };
})();
