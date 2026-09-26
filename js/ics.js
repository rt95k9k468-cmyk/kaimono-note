/* =========================================================
   くらしノート — 予定を、端末のカレンダーへ（.ics）

   やることの一件を iCalendar（RFC 5545）の一枚にして、端末に渡します。
   docs/improvements.md の D3・docs/todo-items.md の「カレンダーに入れる」。

   **どこにも送りません。** 作るのも渡すのも、この端末の中だけです。

   渡し方は「.ics を開く」です（`save`）。iPhone の Safari はカレンダーの
   ファイルを受け取ると「カレンダーに追加」を出します。共有シートでは
   渡しません——iPhone の共有シートにはカレンダーが並ばず、ファイルに
   保存してから開き直すことになるので。パソコンではファイルとして落ちて、
   開けばカレンダーのアプリが受け取ります。

   DOM も store も知りません（`save` だけが a 要素を一つ使います）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;

  const pad = (n) => String(n).padStart(2, "0");
  /* 日付と時刻は**その端末の時計のまま**書きます（TZID も Z も付けない
     「浮いた時刻」）。17:00 の用事は、どの端末で開いても 17:00 に立つ
     ——アプリの時間割も同じ読み方をしているので。 */
  const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const local = (d) => `${ymd(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  /* DTSTAMP だけは決まりで UTC。 */
  const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  /* 文字の決まり（3.3.11）：\ ; , と改行を逃がします。 */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  /* 一行は 75 オクテットまで（3.1）。続きは頭に空白を一つ置いた次の行へ。
     日本語は一字 3 バイトなので、**字の途中で切らない**よう、字（コード
     ポイント）ごとに数えます——バイトで切ると、切れ目の一字が化けます。 */
  const enc = new TextEncoder();
  function fold(line) {
    const out = [];
    let cur = "", bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (bytes + b > 75) { out.push(cur); cur = " "; bytes = 1; }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join("\r\n");
  }

  /**
   * 一件ぶんの .ics を作ります。
   *
   * @param {object} ev
   * @param {string} ev.uid     同じ用事の同じ日なら同じもの（入れ直したとき、
   *                            カレンダーが「同じ予定」と分かるように）
   * @param {string} ev.title
   * @param {string} [ev.memo]
   * @param {string} ev.day     "YYYY-MM-DD"（ローカルの日。dayKey の形）
   * @param {string} [ev.time]  "HH:MM"。無ければ終日
   * @param {number} [ev.minutes] 長さ。無ければ plan の既定（30分）
   * @returns {string}
   */
  function make(ev) {
    const day = KN.util.dayDate(ev.day);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//kurashi-note//ja",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${utc(new Date())}`,
    ];
    const at = ev.time ? KN.plan.toMin(ev.time) : null;
    if (at == null) {
      /* 終日は、終わりの日を**含まない**書き方（次の日）。 */
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${ymd(next)}`);
    } else {
      const start = new Date(day);
      start.setHours(0, at, 0, 0);
      /* 足すのは時計の分で（ミリ秒ではなく）。夏時間のある土地でも、
         30分の用事は時計の上で30分になります。 */
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + (ev.minutes || KN.plan.DEFAULT_MINUTES));
      lines.push(`DTSTART:${local(start)}`, `DTEND:${local(end)}`);
    }
    lines.push(`SUMMARY:${esc(ev.title)}`);
    if (ev.memo && String(ev.memo).trim()) lines.push(`DESCRIPTION:${esc(ev.memo)}`);
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  /* ファイルの名前は、英数字だけで日付を（`yotei-2026-09-27.ics`）。
     予定の題はファイルの中（SUMMARY）にあるので、名前に題は要りません。
     題を名前にしていたころ、日本語の名前を受け取れない端末では名前が
     「download」になり、拡張子ごと落ちて、カレンダーのファイルだと
     分からなくなりました（机の上の Chromium で実測）。 */
  function fileName(day) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(day || "")) ? day : "";
    return d ? `yotei-${d}.ics` : "yotei.ics";
  }

  /**
   * 渡します。**押した流れの中で呼ぶこと**——手前で await すると、端末が
   * 「人が押した」と見なさずに止めることがあります（docs/settings.md の
   * 共有シートと同じ）。
   *
   * data: で渡すのは、iPhone で blob: だと開けない場面が知られているため。
   * `download` を付けるので、アプリの画面そのものが .ics に置き換わる
   * ことはありません（ページの移動ではなく、受け取りになる）。
   */
  function save(text, name) {
    const a = document.createElement("a");
    a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
    a.download = name;
    a.rel = "noopener";
    document.body.append(a);
    a.click();
    a.remove();
  }

  KN.ics = { make, save, fileName, fold, esc };
})();
