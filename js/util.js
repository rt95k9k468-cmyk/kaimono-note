/* =========================================================
   くらしノート — utilities
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  /* ---------- safe HTML templating ---------- */

  class Raw {
    constructor(s) { this.value = String(s); }
    toString() { return this.value; }
  }

  function raw(s) { return new Raw(s); }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function interp(v) {
    if (v == null || v === false || v === true) return "";
    if (v instanceof Raw) return v.value;
    if (Array.isArray(v)) return v.map(interp).join("");
    return escapeHtml(v);
  }

  /** Tagged template that escapes interpolated values unless wrapped in raw(). */
  function html(strings, ...values) {
    let out = "";
    for (let i = 0; i < strings.length; i++) {
      out += strings[i];
      if (i < values.length) out += interp(values[i]);
    }
    return raw(out);
  }

  /** Build a single element from a template result. Extra roots would be
   *  silently dropped, so surface that as a loud mistake instead. */
  function node(h) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(h).trim();
    if (tpl.content.childElementCount > 1) {
      console.error(
        "node() received %d root elements — only the first is kept. Use frag().",
        tpl.content.childElementCount, tpl.content.firstElementChild
      );
    }
    return tpl.content.firstElementChild;
  }

  /** Build a document fragment (multiple roots) from a template result. */
  function frag(h) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(h);
    return tpl.content;
  }

  /* ---------- ids & misc ---------- */

  function uid(prefix) {
    const rnd = (crypto && crypto.randomUUID)
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return (prefix ? prefix + "-" : "") + Date.now().toString(36) + rnd;
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* ---------- numbers & money ---------- */

  /** ¥1,280 — rounded to whole yen. */
  function yen(n) {
    if (!isFinite(n)) return "—";
    return "¥" + Math.round(n).toLocaleString("ja-JP");
  }

  /** Keeps one decimal for small values (unit prices like ¥0.6). */
  function yenFine(n) {
    if (!isFinite(n)) return "—";
    if (Math.abs(n) >= 100) return yen(n);
    const r = Math.round(n * 10) / 10;
    return "¥" + r.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  }

  function parseNum(v) {
    const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
    return isFinite(n) ? n : NaN;
  }

  /* ---------- dates ---------- */

  /* Folds text down to one comparable form so searching does not depend on
     which kana the shopper happened to reach for. 「え」finds「エマール」,
     half-width ﾏ finds マ, and case stops mattering for latin names. */
  function foldKana(s) {
    return String(s || "")
      .normalize("NFKC")            // ﾏ → マ, Ａ → A, ㍑ → リットル
      .toLowerCase()
      // Katakana to hiragana. Long vowel marks and small kana come along
      // unchanged, so ロール and ろーる still meet.
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .replace(/\s+/g, "");
  }

  function today() { return new Date().toISOString(); }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const md = `${d.getMonth() + 1}/${d.getDate()}`;
    return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}/${md}`;
  }

  /** 「8/12 14:05」 — the date, plus the clock time it happened at.
      Several things get archived on one day, and the order they went in is
      most of what tells them apart afterwards. A stored value that is only a
      day (older records, or a due date) has no hour to show, so it stays a
      plain date rather than pretending to be midnight. */
  function formatStamp(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const date = formatDate(iso);
    if (!/\d{1,2}:\d{2}/.test(String(iso))) return date;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${date} ${hh}:${mm}`;
  }

  /* ---------- a time of day ----------

     Stored as 「19:30」 — local, no date, no zone, because it belongs to
     whatever day the todo is for and moves with it when the day does. A
     repeating 「毎週火曜 19:30」 keeps its half past seven whichever Tuesday
     it lands on. */

  const isTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ""));

  /** 「19:30」 → 夜. The three parts of the day, read off the clock, so a time
      and a 朝/午後/夜 never have to be kept in step by hand. */
  function partOfTime(hhmm) {
    if (!isTime(hhmm)) return null;
    const h = Number(String(hhmm).slice(0, 2));
    if (h < 12) return "am";
    if (h < 18) return "pm";
    return "night";
  }

  /** 「19:30」 as it is written on a row. Kept 24-hour: 「19:30」 is one glance
      and 「午後7時30分」 is a sentence. */
  const formatTime = (hhmm) => (isTime(hhmm) ? String(hhmm) : "");

  /** The clock right now, in the same 「19:30」 shape, so 「もう過ぎたか」 is a
      string comparison rather than two Date objects and a timezone. */
  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /* ---------- a day, without a time ----------

     A due date is a day, not an instant: 「金曜まで」 means the whole of
     Friday wherever you are standing. Stored as 「2026-08-14」 — local, no
     zone, no hour — so it cannot slide a day backwards the way a UTC
     timestamp does for anyone east of Greenwich. */

  const pad2 = (n) => (n < 10 ? "0" + n : String(n));

  /** The local day of a Date, as 「YYYY-MM-DD」. */
  function dayKey(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x.getTime())) return "";
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  }

  const todayKey = () => dayKey(new Date());

  /** A day key back into a Date at local midnight. */
  function dayDate(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /** Days from today to this day: negative is past, 0 is today. */
  function daysUntil(key) {
    const d = dayDate(key);
    if (!d) return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((d.getTime() - start.getTime()) / 86400000);
  }

  /** Shift a day key by n days. */
  function shiftDay(key, n) {
    const d = dayDate(key);
    if (!d) return "";
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }

  /** その月の暦を七日そろいにするために要る、**隣の月の日**。
   *
   *  暦は月ごとに組みますが、週は月をまたぎます。8/31（月）で月が終わる週は
   *  9/1〜9/5 まで続いているのに、その月のマスしか無いと後半が空白のまま
   *  でした——「週で見る」と言いながら、月末の週だけ二日しか出ません。
   *
   *  前の月ぶん（lead）と次の月ぶん（trail）を、日付の鍵で返します。
   *  月で見ているあいだは伏せるので（CSS の .is-out）、月の見た目は
   *  これまでどおりです。 */
  function outDays(year, month) {
    const lead = [];
    const trail = [];
    const first = new Date(year, month, 1);
    for (let i = first.getDay(); i > 0; i--) lead.push(dayKey(new Date(year, month, 1 - i)));
    const last = new Date(year, month + 1, 0);
    for (let i = 1; i <= 6 - last.getDay(); i++) {
      trail.push(dayKey(new Date(year, month + 1, i)));
    }
    return { lead, trail };
  }

  /** その日を含む一週間（日曜はじまり）の、両端の日。
   *  カレンダーを一週ぶんに畳むときに、どのマスを残すかを決めます。 */
  function weekOf(key) {
    const d = dayDate(key);
    if (!d) return { from: "", to: "" };
    const wd = d.getDay();
    return { from: shiftDay(key, -wd), to: shiftDay(key, 6 - wd) };
  }

  /** Same date n months on, clamped to the month's last day — 1/31 monthly is
   *  2/28, not 3/3. */
  function shiftMonth(key, n) {
    const d = dayDate(key);
    if (!d) return "";
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return dayKey(d);
  }

  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const weekdayJa = (key) => { const d = dayDate(key); return d ? WEEKDAYS[d.getDay()] : ""; };
  const dayOfWeek = (key) => { const d = dayDate(key); return d ? d.getDay() : null; };

  /* ---------- 第◯◯曜日 ----------

     「第2火曜」 and 「最終金曜」 are how a bin day or a rent day is actually
     said, and they are not the same as a date: the second Tuesday moves every
     month. nth is 1..5, or -1 for 「最終」. */

  /** The nth weekday of a given month, or "" when that month has no such day. */
  function nthWeekdayOf(year, monthIndex, nth, weekday) {
    if (nth === -1) {
      const last = new Date(year, monthIndex + 1, 0);
      last.setDate(last.getDate() - ((last.getDay() - weekday + 7) % 7));
      return dayKey(last);
    }
    const first = new Date(year, monthIndex, 1);
    const forward = (weekday - first.getDay() + 7) % 7;
    const d = new Date(year, monthIndex, 1 + forward + (nth - 1) * 7);
    return d.getMonth() === monthIndex ? dayKey(d) : "";
  }

  /** Which 「第◯」 this day is in its own month, and whether it is the last one. */
  function weekdayNth(key) {
    const d = dayDate(key);
    if (!d) return null;
    const nth = Math.floor((d.getDate() - 1) / 7) + 1;
    const last = d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return { nth, last, weekday: d.getDay() };
  }

  /* Near days by name, the rest by number. 「明日」 is read faster than a date
     and needs no arithmetic; 「9/2(火)」 needs no calendar. */
  function formatDay(key) {
    const d = dayDate(key);
    if (!d) return "";
    const n = daysUntil(key);
    if (n === 0) return "今日";
    if (n === 1) return "明日";
    if (n === 2) return "明後日";
    if (n === -1) return "昨日";
    const md = `${d.getMonth() + 1}/${d.getDate()}`;
    const wd = `(${WEEKDAYS[d.getDay()]})`;
    return d.getFullYear() === new Date().getFullYear() ? md + wd : `${d.getFullYear()}/${md}${wd}`;
  }

  function relativeDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
    if (days <= 0) return "今日";
    if (days === 1) return "昨日";
    if (days < 7) return `${days}日前`;
    if (days < 30) return `${Math.floor(days / 7)}週間前`;
    return formatDate(iso);
  }

  /* ---------- price per item ---------- */

  /* Counted units first: those are the ones the price gets divided by.
     Volume and weight are kept because writing 「500ml」 on a product is
     useful as a note to self, but nobody shops by the 100ml — a bottle of
     detergent is one bottle whatever it holds. */
  const COUNTED_UNITS = ["個", "袋", "本", "枚", "ロール", "パック"];
  const UNITS = [...COUNTED_UNITS, "ml", "L", "g", "kg"];

  const isCounted = (unit) => COUNTED_UNITS.indexOf(unit) >= 0;

  /**
   * Price of one of them. Only counted units divide: 「10個 ¥298」 is
   * ¥29.8 each, while 「500ml ¥298」 is just ¥298 — there is nothing to
   * split. Returns null when the price is already the price of one, so a
   * caller can simply skip the line.
   */
  function perItemPrice(price, amount, unit) {
    if (!isFinite(price) || !isCounted(unit)) return null;
    if (!isFinite(amount) || amount < 2) return null;
    const per1 = price / amount;
    return { text: `1${unit}あたり ${yenFine(per1)}`, value: per1, label: unit, count: amount };
  }

  /** "500ml" / "3個" — human readable size of a product. */
  function formatSize(amount, unit) {
    if (!isFinite(amount) || amount <= 0 || !unit) return "";
    const n = Math.round(amount * 100) / 100;
    return `${n.toLocaleString("ja-JP")}${unit}`;
  }

  /* ---------- icons ---------- */

  /* 絵そのものは、ここにはもうありません。名前がどの絵に当たるかは
     js/icons.js（取り次ぎ）が決め、絵は js/icons-phosphor.js と
     js/icons-legacy.js が持ちます。

     **画面の呼び方は変わりません。** `icon("gear")` のまま——だから
     一族を入れ替えても、画面には一行も触らずに済みます。 */
  function icon(name, cls) {
    return raw(KN.icons.svg(name, cls));
  }

  /* ---------- arithmetic in a text field ---------- */

  /* iOS gives a numeric keypad and no operator keys, and there is no way to ask
     it for a calculator. So the field takes an expression and this works it
     out: 「198+250」、「128*3」、「980/2」. Written out rather than handed to
     eval — a shopping note has no business running code, and the grammar here
     is four operators and a number, which is a dozen lines. */
  const FULLWIDTH = "０１２３４５６７８９．＋－×÷／";
  const ASCII     = "0123456789.+-*/ /";

  function normalizeExpr(v) {
    return String(v == null ? "" : v)
      .replace(/[０-９．＋－×÷／]/g, (c) => ASCII[FULLWIDTH.indexOf(c)])
      .replace(/[×✕✖]/g, "*")
      .replace(/÷/g, "/")
      .replace(/[−–—ー]/g, "-")
      .replace(/[\s,、¥￥円]/g, "");
  }

  /** True when this looks like a sum rather than a plain number. */
  function isExpression(v) {
    const s = normalizeExpr(v);
    return /\d[+\-*/]/.test(s) || s.indexOf("%") >= 0;
  }

  /* A discount is written on the shelf as 「398円 −12%」, and that is how it is
     written here: the price, then the rate, with the % at the end. Keeping it
     in the text rather than in a hidden mode means the field still shows the
     whole story and ⌫ takes it apart a character at a time. The answer drops
     the fraction of a yen, the way the till does. */
  const DISCOUNT = /^(.+?)([+-])(\d+(?:\.\d+)?)%$/;

  /**
   * Evaluate `1+2*3`, `398-12%` and friends. Returns null for anything that is
   * not a complete, well-formed sum — a trailing operator, or a % with no rate
   * behind it yet, is not an error while you are still typing, it just has no
   * answer yet.
   */
  function calc(v) {
    const src = normalizeExpr(v);
    const off = src.match(DISCOUNT);
    if (off) {
      const base = plainCalc(off[1]);
      if (base == null) return null;
      const rate = parseFloat(off[3]) / 100;
      const out = base * (off[2] === "-" ? 1 - rate : 1 + rate);
      return isFinite(out) ? Math.floor(out) : null;
    }
    return plainCalc(src);
  }

  function plainCalc(src) {
    if (!src || !/^[\d.+\-*/]+$/.test(src)) return null;

    const tokens = src.match(/\d+(?:\.\d+)?|\.\d+|[+\-*/]/g);
    if (!tokens) return null;

    const nums = [], ops = [];
    let wantNumber = true;
    for (const t of tokens) {
      const isOp = /^[+\-*/]$/.test(t);
      if (isOp === wantNumber) return null;   // two in a row, either way
      if (isOp) ops.push(t);
      else nums.push(parseFloat(t));
      wantNumber = isOp;
    }
    if (wantNumber) return null;              // ends on an operator

    for (let i = 0; i < ops.length; ) {
      if (ops[i] === "*" || ops[i] === "/") {
        const r = ops[i] === "*" ? nums[i] * nums[i + 1] : nums[i] / nums[i + 1];
        nums.splice(i, 2, r);
        ops.splice(i, 1);
      } else i++;
    }
    let out = nums[0];
    for (let i = 0; i < ops.length; i++) {
      out = ops[i] === "+" ? out + nums[i + 1] : out - nums[i + 1];
    }
    return isFinite(out) ? out : null;
  }

  /* ---------- feedback ---------- */

  function haptic(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (_) {} }
  }

  KN.util = {
    raw, html, node, frag, escapeHtml,
    uid, clamp, debounce,
    yen, yenFine, parseNum,
    today, formatDate, formatStamp, relativeDate, foldKana,
    isTime, partOfTime, formatTime, nowTime,
    dayKey, todayKey, dayDate, daysUntil, shiftDay, shiftMonth, weekOf, outDays, weekdayJa, formatDay,
    dayOfWeek, WEEKDAYS, nthWeekdayOf, weekdayNth,
    perItemPrice, formatSize, UNITS, COUNTED_UNITS, isCounted,
    calc, isExpression,
    icon, haptic,
  };
})();
