/* =========================================================
   くらしノート — 日記を時刻ごとに（思考のホーム。docs/thinking.md）

   日記の本文（archive.days[].memo）は**一つの文字のまま**持ちます。時刻ごとの
   一件は「時刻だけの行」（`08:52`。書いた日が日記の日と違えば `10/12 08:52`）
   から、次の時刻だけの行の前まで。一件目の時刻より前は「頭」（日付と育休の
   行・前からの地の文）。保存の形は前のままなので、写し（diary-idb）・控え・
   書き出し・取り込み・コピーは、何も変えずに同じ本文を運びます。

   ここは文字を受けて文字を返すだけ（DOM にも store にも触らない）——試験が
   中身を直に確かめられるように。直す・消すは、開いたときに読んだ字が
   その場所にまだあるときだけ（`swap`）。違っていたら null を返し、書きません。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  /* 時刻だけの行。全角の字（PDF から戻った本文など）も読めるように、見るときだけ NFKC。 */
  const MARK = /^(?:(\d{1,2})\/(\d{1,2})\s+)?([01]?\d|2[0-3]):([0-5]\d)$/;
  const norm = (s) => (String.prototype.normalize ? s.normalize("NFKC") : s).trim();

  function markOf(line) {
    const m = MARK.exec(norm(String(line || "")));
    if (!m) return null;
    return {
      date: m[1] ? `${Number(m[1])}/${Number(m[2])}` : null,
      at: `${String(Number(m[3])).padStart(2, "0")}:${m[4]}`,
    };
  }

  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /** 書いた時刻の行。日記の日（day）と書いた日が違えば日付も（「あとで書いた」と分かるように）。 */
  function mark(when, day) {
    const d = when instanceof Date ? when : new Date(when);
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return day && keyOf(d) !== day ? `${d.getMonth() + 1}/${d.getDate()} ${hm}` : hm;
  }

  /** 打った字を一件の中身に：改行をそろえ、頭の空行と終わりの空白を落とす（中はそのまま）。 */
  function clean(text) {
    return String(text == null ? "" : text).replace(/\r\n?/g, "\n")
      .replace(/^(?:[ \t　]*\n)+/, "").replace(/\s+$/, "");
  }

  /**
   * 本文を、頭と時刻ごとの一件に分けます。
   * 一件は { mark（時刻の行そのまま。頭は null）, at, date, text, start, textStart, textEnd, end }。
   * start〜end がその一件の場所（次の一件の時刻の行の手前まで）、textStart〜textEnd が中身
   * （頭と終わりの空行を除く）。頭は中身があるときだけ。
   */
  function parse(memo) {
    const s = String(memo || "");
    const lines = s.split("\n");
    const at = [];
    let o = 0;
    lines.forEach((l) => { at.push(o); o += l.length + 1; });
    const lineEnd = (i) => at[i] + lines[i].length;
    const blank = (i) => !lines[i].trim();
    const marks = [];
    lines.forEach((l, i) => { const m = markOf(l); if (m) marks.push(Object.assign({ i }, m)); });

    /* from〜to の行（to は含まない）の中身の範囲。空なら null。 */
    const span = (from, to) => {
      let a = from, b = to;
      while (a < b && blank(a)) a++;
      while (b > a && blank(b - 1)) b--;
      return a < b ? { textStart: at[a], textEnd: lineEnd(b - 1) } : null;
    };

    const items = [];
    const firstMark = marks.length ? marks[0].i : lines.length;
    const head = span(0, firstMark);
    if (head) {
      items.push(Object.assign({
        mark: null, at: null, date: null, start: 0,
        end: marks.length ? at[firstMark] : s.length,
      }, head, { text: s.slice(head.textStart, head.textEnd) }));
    }
    marks.forEach((m, k) => {
      const next = k + 1 < marks.length ? marks[k + 1].i : lines.length;
      const body = span(m.i + 1, next);
      const markEnd = lineEnd(m.i);
      items.push({
        mark: lines[m.i], at: m.at, date: m.date,
        start: at[m.i],
        end: next < lines.length ? at[next] : s.length,
        textStart: body ? body.textStart : markEnd,
        textEnd: body ? body.textEnd : markEnd,
        text: body ? s.slice(body.textStart, body.textEnd) : "",
      });
    });
    return items;
  }

  /** 一件の、書き換える範囲の字（時刻の行から中身の終わりまで。頭は中身だけ）。 */
  function chunkOf(memo, item) {
    const s = String(memo || "");
    return item.mark ? s.slice(item.start, item.textEnd) : s.slice(item.textStart, item.textEnd);
  }
  /** 一件を書き換えた字（時刻の行は打ったときのまま。頭は中身だけ）。 */
  const chunk = (item, text) => (item.mark ? `${item.mark}\n${clean(text)}` : clean(text));
  /** 書き換える範囲の頭（chunkOf と同じ数え方）。 */
  const chunkAt = (item) => (item.mark ? item.start : item.textStart);

  /**
   * 一件を足します。終わりの空白を落として、空の行を一つはさんでから。
   * base … 本文が空の日に、頭に置く字（日付と育休の行。daily の下書きと同じもの）。
   * 返すのは { memo, at（足した一件の始まり）, chunk（足した字）}。中身が空なら null。
   */
  function add(memo, text, markLine, base) {
    const body = clean(text);
    if (!body) return null;
    let s = String(memo || "").replace(/\s+$/, "");
    if (!s && base) s = String(base).replace(/\s+$/, "");
    const sep = s ? "\n\n" : "";
    const piece = `${markLine}\n${body}`;
    return { memo: s + sep + piece, at: s.length + sep.length, chunk: piece };
  }

  /** at の場所に was がまだあるときだけ、now に入れ替えます。無ければ null（書かない）。 */
  function swap(memo, at, was, now) {
    const s = String(memo || "");
    if (at < 0 || s.slice(at, at + was.length) !== was) return null;
    return s.slice(0, at) + now + s.slice(at + was.length);
  }

  /**
   * 一件を外します。at の場所に chunk（書いたとおりの字）がまだあるときだけ。継ぎ目の
   * 空白は空の行一つに（前の終わり・後ろの頭）。無ければ null（何も外さない）。
   */
  function take(memo, at, chunk) {
    const s = swap(memo, at, chunk, "");
    if (s == null) return null;
    const a = s.slice(0, at).replace(/\s+$/, "");
    const b = s.slice(at).replace(/^\s+/, "");
    return a && b ? `${a}\n\n${b}` : a || b;
  }

  /** 開いたときの一件が、いまの本文の同じ場所にまだあるか。 */
  const still = (memo, item) => parse(memo).some((x) => x.start === item.start && x.mark === item.mark && x.text === item.text);

  KN.diaryPosts = { parse, markOf, mark, clean, add, swap, take, still, chunkOf, chunk, chunkAt };
})();
