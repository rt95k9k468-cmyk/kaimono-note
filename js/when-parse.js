/* js/when-parse.js — 打った字から「いつ」を読む
 *
 * 「10:00 病院」と打ったら、その日の 10:00 の時間割に「病院」が立つ。
 * それだけのために、この一枚があります。
 *
 * **ここは純粋な部品です。** DOM も store も触らず、字を受け取って
 * 「いつ」を返すだけ。画面の側（screen-todo.js）が、返ってきたものを
 * 欄へ入れます——読むことと、決めることを分けておくと、読み違いを
 * 試験で追い込めます（icon-eval.json と同じ考えかた）。
 *
 * ## 取りかたの決めごと
 *
 * - **頭かお尻のかたまりとしてだけ取る。** 真ん中は取りません。
 *   「12時の鐘を鳴らす」の 12時 は題の一部で、やる時刻ではない。
 * - **取ったあと題が空になるなら、取らない。** 「明日」だけを打った人は、
 *   題として「明日」と書いています。日付だけになって題が消えるより、
 *   何もしないほうがいい。
 * - **すぐ後ろが「まで・ごろ・くらい・すぎ・前・後」なら取らない。**
 *   「10時までに起きる」の 10時 は締め切りで、始める時刻ではない。
 *   ただし**あいだに空きがあれば別の言葉**として扱います
 *   （「10:00 前田さんに電話」の「前田」は「前」ではない）。
 * - **落とすのは境目の助詞ひとつまで**、しかも次が仮名でないときだけ。
 *   「明日の会議」→「会議」、でも「明日からあげを作る」は「からあげ」の
 *   ままにする（「から」を落とすと「あげを作る」になる）。
 * - **過ぎた日付は、次に来るその日。** 9月13日に「9/1」と打たれたら来年の
 *   9月1日。やることは「これからやる」ものなので。
 * - **昨日・一昨日は読みません。** 上と同じ理由で、過ぎた日へ用事を置く
 *   言葉は要らない。
 * - **毎朝・毎晩は読みません。** くり返しの選択肢からも外してあります
 *   （時刻が書けるので、毎日との二通りができていた）。
 */
(function () {
  const KN = (window.KN = window.KN || {});
  const U = KN.util;

  const pad2 = (n) => (n < 10 ? "0" + n : String(n));
  const WDS = "日月火水木金土";

  /* ---------- 長さの変わらない正規化 ----------
   *
   * 全角の数字や「：」を読むために置き換えますが、**一字は一字のまま**に
   * します（`foldRuns` が字の種類を添えて返すのと同じ手）。長さが変わると、
   * ここで見つけた場所を元の字へ持ち帰れません——落とすのは元の字のほう
   * なので、位置がずれると題が壊れます。 */
  const WIDE   = "０１２３４５６７８９：／．－～　−–~";
  const NARROW = "0123456789:/.-〜 --〜";
  function flatten(s) {
    let out = "";
    for (const ch of String(s == null ? "" : s)) {
      const i = WIDE.indexOf(ch);
      out += i >= 0 ? NARROW[i] : ch;
    }
    return out;
  }

  const isHira = (c) => !!c && c >= "ぁ" && c <= "ゖ";
  /* 題として残るものが、助詞と記号だけになっていないか。 */
  const MEAT = /[^\s　のにはがをへとでや、,・:\-]/;

  /* ---------- 日付をつくる ---------- */

  /** y年m月d日を鍵に。実在しない日（2月30日）は null。 */
  function ymd(y, m, d) {
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return U.dayKey(dt);
  }

  /** 「9/1」。今年のその日が過ぎていたら、来年のその日。 */
  function nextMd(mo, da, ctx) {
    const y0 = Number(ctx.today.slice(0, 4));
    for (let i = 0; i <= 4; i++) {
      const key = ymd(y0 + i, mo, da);
      if (key && key >= ctx.today) return key;
    }
    return null;
  }

  /** 「15日」。今月のその日が過ぎていたら、次にその日が来る月。 */
  function nextDom(da, ctx) {
    const base = U.dayDate(ctx.today) || new Date();
    for (let i = 0; i <= 13; i++) {
      const p = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const key = ymd(p.getFullYear(), p.getMonth() + 1, da);
      if (key && key >= ctx.today) return key;
    }
    return null;
  }

  /** その曜日が次に来る日（その日自身も数える）。 */
  function nextWd(wd, from) {
    for (let i = 0; i < 7; i++) {
      const k = U.shiftDay(from, i);
      if (U.dayOfWeek(k) === wd) return k;
    }
    return null;
  }

  /** その日を含む週の日曜日。暦が日曜始まりなので、週の頭もそこに合わせる。 */
  const weekTop = (key) => U.shiftDay(key, -(U.dayOfWeek(key) || 0));

  /** その月の最後の日。 */
  function endOfMonth(key, add) {
    const d = U.dayDate(key);
    if (!d) return null;
    return U.dayKey(new Date(d.getFullYear(), d.getMonth() + (add || 0) + 1, 0));
  }

  /* ---------- 時刻を読む ----------
   *
   * **「3時」は昼の3時**として読みます（1〜4時だけ＋12）。時間割が扱うのは
   * 5:00〜23:00 の一日で、深夜3時に用事を置く人はまず居ません。「深夜3時」
   * 「午前3時」と書いてあれば、書いてあるほうを採ります。
   * **「:」で書いてあるときは、いつも書いてあるとおり**（10:00 は 10:00）。 */
  const T_PRE = "(?:午前|午後|ごぜん|ごご|AM|PM|am|pm|朝|昼|夕方|夕|夜|晩|深夜|未明)";
  const T_ONE = "(?:正午|" + T_PRE + "?[ \\u3000]?\\d{1,2}(?::\\d{2}|時(?:\\d{1,2}分|半)?))";

  function readTime(src) {
    const s = String(src);
    if (/正午/.test(s)) return "12:00";
    const am = /午前|ごぜん|AM|am|朝|深夜|未明/.test(s);
    const pm = !am && /午後|ごご|PM|pm|夕|夜|晩/.test(s);
    const noon = /昼/.test(s);
    const m = /(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分|(半))?)/.exec(s);
    if (!m) return null;
    const colon = m[2] != null;
    let h = Number(m[1]);
    const mi = colon ? Number(m[2]) : m[3] != null ? Number(m[3]) : m[4] ? 30 : 0;
    if (h > 23 || mi > 59) return null;
    if (pm || (noon && h < 12)) h = (h % 12) + 12;
    else if (am) h = h % 12;
    else if (!colon && h >= 1 && h <= 4) h += 12;
    if (h > 23) return null;
    return pad2(h) + ":" + pad2(mi);
  }

  const toMin = (hhmm) => {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const toTime = (min) => pad2(Math.floor(min / 60) % 24) + ":" + pad2(min % 60);

  /** 長さは store の cleanMinutes と同じ丸め（5分きざみ・12時間まで）。 */
  function cleanSpan(n) {
    if (!isFinite(n) || n <= 0) return null;
    return Math.min(720, Math.max(5, Math.round(n / 5) * 5));
  }

  /* ---------- 読む言葉の表 ----------
   *
   * 上から順に当てます。**長いものが先**——「3日後」は「3日」より先に
   * 当たらないと、「後」だけが題に残ります。 */
  const RE_WD = "([日月火水木金土])曜日?";
  const RE_WEEK = "(今週|来週|再来週)";

  const RAW = [
    /* ---- くり返し ---- */
    { kind: "repeat", re: "毎月第([1-5])" + RE_WD,
      read: (m) => ({ repeat: "monthly", repeatNth: { nth: Number(m[1]), weekday: WDS.indexOf(m[2]) } }) },
    { kind: "repeat", re: "毎月最終" + RE_WD,
      read: (m) => ({ repeat: "monthly", repeatNth: { nth: -1, weekday: WDS.indexOf(m[1]) } }) },
    { kind: "repeat", re: "毎月(\\d{1,2})日",
      read: (m, c) => { const due = nextDom(Number(m[1]), c); return due ? { repeat: "monthly", due } : null; } },
    { kind: "repeat", re: "毎月", read: () => ({ repeat: "monthly" }) },
    /* 「毎週月曜」「毎週月・金曜」「毎週火曜日と金曜日」。
       **最後の一つには必ず「曜」が要る**——ここを緩めて裸の一字を許すと、
       「毎週水やり」の「水」を曜日として食べます（実際に食べました）。
       あいだの一字は、区切り（・、と）が続くときだけ曜日として読みます。 */
    { kind: "repeat", re: "毎週(?:の?[日月火水木金土](?:曜日?)?[・、,と])*の?[日月火水木金土]曜日?", read: (m, c) => {
        const days = [];
        /* 「曜」「曜日」を先に落とすこと——落とさないと「火曜日」の
           **日**を日曜として数えます（実測：火金のつもりが日火金）。 */
        String(m[0]).slice(2).replace(/曜日?/g, "・").replace(/[日月火水木金土]/g, (w) => {
          const n = WDS.indexOf(w);
          if (days.indexOf(n) < 0) days.push(n);
          return "";
        });
        days.sort((a, b) => a - b);
        /* その日をいつにするかは、いちばん早く来る曜日。保存のときに
           store.snapToRule が同じことをしますが、打った直後の紙にも
           出ていないと「入ったのかどうか」が読めません。 */
        let due = null;
        for (let i = 0; i < 7 && !due; i++) {
          const k = U.shiftDay(c.today, i);
          if (days.indexOf(U.dayOfWeek(k)) >= 0) due = k;
        }
        return { repeat: "weekly", repeatDays: days, due };
      } },
    { kind: "repeat", re: "毎週", read: () => ({ repeat: "weekly", repeatDays: [] }) },
    { kind: "repeat", re: "毎日", read: () => ({ repeat: "daily" }) },

    /* ---- 日付 ---- */
    { kind: "date", re: "(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})",
      read: (m) => { const d = ymd(+m[1], +m[2], +m[3]); return d ? { due: d } : null; } },
    { kind: "date", re: "(\\d{4})年(\\d{1,2})月(\\d{1,2})日",
      read: (m) => { const d = ymd(+m[1], +m[2], +m[3]); return d ? { due: d } : null; } },
    { kind: "date", re: "(\\d{1,2})月(\\d{1,2})日",
      read: (m, c) => { const d = nextMd(+m[1], +m[2], c); return d ? { due: d } : null; } },
    { kind: "date", re: "(\\d{1,2})/(\\d{1,2})",
      read: (m, c) => { const d = nextMd(+m[1], +m[2], c); return d ? { due: d } : null; } },
    { kind: "date", re: "(?:今日|本日|きょう)", read: (m, c) => ({ due: c.today }) },
    { kind: "date", re: "(?:明々後日|明明後日|しあさって)", read: (m, c) => ({ due: U.shiftDay(c.today, 3) }) },
    { kind: "date", re: "(?:明後日|あさって)", read: (m, c) => ({ due: U.shiftDay(c.today, 2) }) },
    { kind: "date", re: "(?:明日|あした|あす)", read: (m, c) => ({ due: U.shiftDay(c.today, 1) }) },
    { kind: "date", re: "(\\d{1,3})日後", read: (m, c) => ({ due: U.shiftDay(c.today, Number(m[1])) }) },
    { kind: "date", re: "(\\d{1,2})週間後", read: (m, c) => ({ due: U.shiftDay(c.today, Number(m[1]) * 7) }) },
    { kind: "date", re: "(\\d{1,2})[ヶケかカ箇]?月後",
      read: (m, c) => ({ due: U.shiftMonth(c.today, Number(m[1])) }) },
    { kind: "date", re: "(今月|来月|再来月)末",
      read: (m, c) => ({ due: endOfMonth(c.today, m[1] === "来月" ? 1 : m[1] === "再来月" ? 2 : 0) }) },
    { kind: "date", re: "月末", read: (m, c) => ({ due: endOfMonth(c.today, 0) }) },
    { kind: "date", re: RE_WEEK + "末", read: (m, c) => {
        const add = m[1] === "来週" ? 7 : m[1] === "再来週" ? 14 : 0;
        return { due: add ? U.shiftDay(weekTop(c.today), add + 6) : nextWd(6, c.today) };
      } },
    { kind: "date", re: "週末", read: (m, c) => ({ due: nextWd(6, c.today) }) },
    { kind: "date", re: RE_WEEK + "の?" + RE_WD, read: (m, c) => {
        const add = m[1] === "来週" ? 7 : m[1] === "再来週" ? 14 : 0;
        return { due: nextWd(WDS.indexOf(m[2]), U.shiftDay(weekTop(c.today), add)) };
      } },
    /* 「来週」だけのときは、その週のはじめ（月曜）。日を言っていないので、
       週の頭に置いて、あとから動かしてもらう。 */
    { kind: "date", re: "(来週|再来週)", read: (m, c) => ({
        due: U.shiftDay(weekTop(c.today), (m[1] === "来週" ? 7 : 14) + 1) }) },
    { kind: "date", re: RE_WD, read: (m, c) => ({ due: nextWd(WDS.indexOf(m[1]), c.today) }) },
    { kind: "date", re: "(\\d{1,2})日", read: (m, c) => { const d = nextDom(+m[1], c); return d ? { due: d } : null; } },

    /* ---- 時刻 ---- */
    { kind: "time", re: "(" + T_ONE + ")[ \\u3000]?(?:〜|-|から)[ \\u3000]?(" + T_ONE + ")(?:まで)?",
      read: (m) => {
        const a = readTime(m[1]);
        const b = readTime(m[2]);
        if (!a) return null;
        const span = a && b ? cleanSpan(toMin(b) - toMin(a)) : null;
        return span ? { time: a, minutes: span } : { time: a };
      } },
    { kind: "time", re: "(" + T_ONE + ")",
      read: (m) => { const t = readTime(m[1]); return t ? { time: t } : null; } },
  ];

  /* 頭とお尻ぶんを、一度だけ組んでおきます（打つたびに 50本 組み直さない）。 */
  const RULES = RAW.map((r) => ({
    kind: r.kind, read: r.read,
    head: new RegExp("^(?:" + r.re + ")"),
    tail: new RegExp("(?:" + r.re + ")$"),
  }));

  /* すぐ後ろにこれが**くっついて**いたら、その言葉は時刻ではなく、
     時刻を指す別のこと（締め切り・目安・前後）を言っています。
     あいだに空きがあれば別の言葉なので、ここでは trim しません。 */
  const NOT_AFTER = ["まで", "ごろ", "頃", "くらい", "ぐらい", "すぎ", "過ぎ",
    "以降", "以内", "以前", "ほど", "近く", "前", "後", "間", "分", "目",
    "おき", "ごと", "ぶり", "半ば", "年", "月"];
  const blocked = (s) => NOT_AFTER.some((w) => s.startsWith(w));

  /** 頭の語を落としたあと、境目に残る助詞ひとつぶん。落とす字数を返す。 */
  function seamHead(s) {
    let i = 0;
    while (i < s.length && /[\s　]/.test(s[i])) i++;
    const m = /^(から|より|の|に|は|、|,|・|:|-)/.exec(s.slice(i));
    if (m) {
      const nx = s[i + m[0].length];
      /* 次が仮名なら、それは助詞ではなく語の頭かもしれない
         （明日｜からあげ、明日｜はやめる）。触らない。 */
      if (nx && !isHira(nx)) i += m[0].length;
    }
    while (i < s.length && /[\s　]/.test(s[i])) i++;
    return i;
  }

  /** お尻の語を落としたあと、手前に残る助詞ひとつぶん。残す字数を返す。 */
  function seamTail(s) {
    let i = s.length;
    while (i > 0 && /[\s　]/.test(s[i - 1])) i--;
    if (i > 1 && "はがをにので、,・".indexOf(s[i - 1]) >= 0 && !isHira(s[i - 2])) i--;
    while (i > 0 && /[\s　]/.test(s[i - 1])) i--;
    return i;
  }

  /** いちばん先に当たる語をひとつ取り、残りの字といっしょに返す。 */
  function takeOne(text, taken, ctx) {
    const flat = flatten(text);
    const a = flat.length - flat.replace(/^[\s　]+/, "").length;
    const b = flat.replace(/[\s　]+$/, "").length;
    if (a >= b) return null;
    const span = flat.slice(a, b);

    for (const rule of RULES) {
      if (taken[rule.kind]) continue;

      const h = rule.head.exec(span);
      if (h) {
        const end = a + h[0].length;
        if (!blocked(flat.slice(end, b))) {
          const patch = rule.read(h, ctx);
          if (patch) {
            const drop = seamHead(flat.slice(end, b));
            const rest = text.slice(0, a) + text.slice(end + drop);
            if (MEAT.test(rest)) return { rest, patch, text: text.slice(a, end) };
          }
        }
      }

      const t = rule.tail.exec(span);
      if (t) {
        const start = a + t.index;
        const prev = flat[start - 1];
        /* 数字や「第」の続きなら、それは語の一部（第3金曜・1510時）。 */
        if (!(prev && (/\d/.test(prev) || prev === "第"))) {
          const patch = rule.read(t, ctx);
          if (patch) {
            const keep = seamTail(flat.slice(a, start));
            const rest = text.slice(0, a + keep) + text.slice(b);
            if (MEAT.test(rest)) return { rest, patch, text: text.slice(start, b) };
          }
        }
      }
    }
    return null;
  }

  /**
   * 打った字から「いつ」を読む。
   *
   * @param {string} text  題の欄に打たれた字
   * @param {{today?: string}} [opts]  今日（試験のために外から渡せる）
   * @returns {{title: string, hits: Array, due?: string, time?: string,
   *            minutes?: number, repeat?: string, repeatDays?: number[],
   *            repeatNth?: object}}
   *          見つからなかった欄は**置きません**（null と「言っていない」を
   *          分けるため。画面の側は、来た欄だけを書き換えます）。
   */
  function parse(text, opts) {
    const o = opts || {};
    const ctx = { today: o.today || U.todayKey() };
    const out = { title: String(text == null ? "" : text).trim(), hits: [] };
    const taken = {};
    let cur = String(text == null ? "" : text);

    for (let pass = 0; pass < 4; pass++) {
      const hit = takeOne(cur, taken, ctx);
      if (!hit) break;
      cur = hit.rest;
      Object.keys(hit.patch).forEach((k) => { out[k] = hit.patch[k]; });
      if (hit.patch.due) taken.date = true;
      if (hit.patch.time) taken.time = true;
      if (hit.patch.repeat) taken.repeat = true;
      taken[hit.kind] = true;
      out.hits.push({ text: hit.text, kind: hit.kind });
    }
    out.title = cur.trim();
    return out;
  }

  /** 何か読めたか。 */
  const found = (res) => !!(res && res.hits && res.hits.length);

  /** くり返しを、札と同じ言い方で。 */
  function repeatWord(res) {
    if (res.repeat === "daily") return "毎日";
    if (res.repeat === "weekly") {
      const d = res.repeatDays || [];
      return d.length ? "毎週 " + d.map((n) => WDS[n]).join("・") : "毎週";
    }
    if (res.repeat === "monthly") {
      const n = res.repeatNth;
      if (!n) return "毎月";
      return n.nth === -1 ? `毎月 最終${WDS[n.weekday]}` : `毎月 第${n.nth}${WDS[n.weekday]}`;
    }
    return "";
  }

  /**
   * 読めたものを一行で。予告にもトーストにも**同じもの**を使います
   * ——二か所で書くと、片方だけ直した日に違うことを言います。
   */
  function describe(res, extra) {
    const e = extra || {};
    const bits = [];
    if (res.repeat) bits.push(repeatWord(res));
    const day = res.due || e.due;
    const at = res.time || e.time;
    if (day) bits.push(U.formatDay(day));
    if (at) {
      const len = res.minutes || e.minutes;
      const end = len != null && toMin(at) != null ? toTime(toMin(at) + len) : null;
      bits.push(end ? `${at}〜${end}` : at);
    }
    return bits.join(" ");
  }

  KN.whenParse = { parse, describe, found, readTime, flatten };
})();
