/* =========================================================
   くらしノート — 予定を、端末のカレンダーへ（.ics）

   やることの一件を iCalendar（RFC 5545）の一枚にして、端末に渡します。
   docs/improvements.md の D3・docs/todo-items.md の「カレンダーに入れる」。

   **どこにも送りません。** 作るのも渡すのも、この端末の中だけです。

   渡し方は端末で分けます（`offer`）。

   ・パソコン・Android … .ics をファイルとして落とす（`save`）。開けば
     カレンダーのアプリが受け取ります。
   ・iPhone の Safari（タブ）… 同じく `save`。
   ・iPhone の**ホーム画面のアプリ** … `save` では**入りませんでした**
     （利用者が実機で確かめた。2026年9月27日）。ホーム画面のアプリは
     Safari と違って、カレンダーのファイルを受け取る口を持っていない。
     そこで、押したらすぐ Safari 本体に受け渡しのページ（tools/calendar.html）
     を開かせます（`x-safari-https:` は Safari で開けという iOS の書き方）。
     ページは開いたとたんに「カレンダーに追加」を出します。予定の中身は
     URL の `#` の後ろに載せるので、サーバーには届きません。
     （最初は間に「Safari で開く／共有シートで渡す」を選ぶ紙を挟んでいたが、
     手数が多いと言われて外した。Safari の道が実機で通ったので。）

   DOM は `save` と `offer` だけが使います（a 要素一つ）。
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

  /* ---------------- iPhone のホーム画面のアプリから ---------------- */

  const appleTouch = () => {
    try {
      return /iP(hone|ad|od)/.test(navigator.userAgent || "")
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    } catch (_) { return false; }
  };
  const standalone = () => {
    try {
      return navigator.standalone === true
        || !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    } catch (_) { return false; }
  };

  /* 中身を URL の `#` の後ろへ載せる形（UTF-8 を base64url に）。`#` の後ろは
     サーバーへ送られないので、予定の題がどこかに残ることはありません
     （Safari の履歴には残ります）。 */
  function payload(text) {
    const bytes = enc.encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /** 受け渡しのページの URL。アプリの置き場所から数えます。 */
  function helperURL(text) {
    return new URL("tools/calendar.html", document.baseURI).href + "#" + payload(text);
  }

  /**
   * 渡します。端末で道を分けます（冒頭の説明）。**押した流れの中で呼ぶこと**
   * ——Safari へ渡すのも、ファイルを落とすのも、指が押した続きでないと
   * 端末が止めることがあります。
   * @param {string} text  make() の返したもの
   * @param {string} day   ファイルの名前に使う日（"YYYY-MM-DD"）
   */
  function offer(text, day) {
    if (!(appleTouch() && standalone())) { save(text, fileName(day)); return; }
    open(helperURL(text).replace(/^http/, "x-safari-http"));
  }

  function open(href) {
    const a = document.createElement("a");
    a.href = href;
    document.body.append(a);
    a.click();
    a.remove();
  }

  /* ---------------- ショートカット App で、決めたカレンダーへ ----------------

     Safari の道は、最後の二手（どのカレンダーか・戻る）が iPhone の側の決まりで
     省けません。利用者が「ショートカット」App に**一度だけ**小さな手順を組めば、
     押すだけで決めたカレンダー（自宅など）にそのまま入ります（設定の
     「カレンダーはショートカットで入れる」。組み方は設定の「›」の先）。

     渡すのは .ics ではなく、手順が読みやすい小さな JSON です。

       { "title": "…", "start": "2026/09/27 17:00", "end": "2026/09/27 17:30",
         "allday": "no", "memo": "…" }

     ・日時は「2026/09/27 17:00」の形。ショートカットは日付の欄に入れた字を
       日付として読みます。終日なら時刻を付けず、始まりも終わりも同じ日。
     ・`allday` は "yes" / "no" の字。手順の「もし」で字を比べます。
     ・名前（`SHORTCUT`）は手順のほうと一字でも違えば動かないので、変えない。
     ・中身は URL に載ってショートカット App へ渡るだけで、どこにも送りません。 */
  const SHORTCUT = "くらしノートの予定";

  /** iPhone・iPad・Mac（どれもショートカット App がある）。 */
  const apple = () => {
    try {
      return appleTouch() || /Macintosh|Mac OS X/.test(navigator.userAgent || "");
    } catch (_) { return false; }
  };

  function useShortcut() {
    try {
      return apple() && KN.store.get().settings.calShortcut === true;
    } catch (_) { return false; }
  }

  function shortcutText(ev) {
    const day = KN.util.dayDate(ev.day);
    const at = ev.time ? KN.plan.toMin(ev.time) : null;
    const d = (x) => `${x.getFullYear()}/${pad(x.getMonth() + 1)}/${pad(x.getDate())}`;
    const dt = (x) => `${d(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
    let start, end;
    if (at == null) {
      start = end = d(day);
    } else {
      const s = new Date(day);
      s.setHours(0, at, 0, 0);
      const e = new Date(s);
      e.setMinutes(e.getMinutes() + (ev.minutes || KN.plan.DEFAULT_MINUTES));
      start = dt(s);
      end = dt(e);
    }
    return JSON.stringify({
      title: String(ev.title || ""),
      start, end,
      allday: at == null ? "yes" : "no",
      memo: String(ev.memo || "").trim(),
    });
  }

  function shortcutURL(ev) {
    return "shortcuts://run-shortcut?name=" + encodeURIComponent(SHORTCUT)
      + "&input=text&text=" + encodeURIComponent(shortcutText(ev));
  }

  /**
   * 一件を、端末のカレンダーへ。設定でショートカットを選んでいればそちら、
   * そうでなければ .ics（`offer`）。**押した流れの中で呼ぶこと。**
   * @param {object} ev  make() と同じ形
   */
  function send(ev) {
    if (useShortcut()) { open(shortcutURL(ev)); return; }
    offer(make(ev), ev.day);
  }

  KN.ics = { make, save, offer, send, payload, helperURL, fileName, fold, esc,
             apple, SHORTCUT, shortcutText, shortcutURL };
})();
