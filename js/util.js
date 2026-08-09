/* =========================================================
   かいものノート — utilities
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

  /* ---------- unit price ---------- */

  const UNITS = ["ml", "L", "g", "kg", "個", "枚", "本", "袋", "ロール", "パック"];

  /**
   * Normalised unit price. ml/L → per 100ml, g/kg → per 100g,
   * countable units → per 1.
   * Returns { text, value } where `value` is comparable within a unit family.
   */
  function unitPrice(price, amount, unit) {
    if (!isFinite(price) || !isFinite(amount) || amount <= 0 || !unit) return null;

    let base = amount;
    let label = unit;
    if (unit === "L")  { base = amount * 1000; label = "ml"; }
    if (unit === "kg") { base = amount * 1000; label = "g"; }

    if (label === "ml" || label === "g") {
      const per100 = (price / base) * 100;
      return { text: `100${label} ${yenFine(per100)}`, value: price / base, label };
    }
    const per1 = price / amount;
    return { text: `1${label} ${yenFine(per1)}`, value: per1, label };
  }

  /** "500ml" / "3個" — human readable size of a product. */
  function formatSize(amount, unit) {
    if (!isFinite(amount) || amount <= 0 || !unit) return "";
    const n = Math.round(amount * 100) / 100;
    return `${n.toLocaleString("ja-JP")}${unit}`;
  }

  /* ---------- icons (inline SVG) ---------- */

  const ICON_PATHS = {
    list:      '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="3.5" cy="18" r="1.5"/>',
    // The previous tag started at 20.6,13.4 but ended at 20.6,15.4, so `Z`
    // drew a stray 2px segment that showed as a notch on the right corner.
    // This one is a closed outline, symmetric about the 45° diagonal.
    tag:       '<path d="M11.6 2.6H4.4A1.8 1.8 0 0 0 2.6 4.4v7.2a1.8 1.8 0 0 0 .53 1.27l8 8a1.8 1.8 0 0 0 2.54 0l7.2-7.2a1.8 1.8 0 0 0 0-2.54l-8-8A1.8 1.8 0 0 0 11.6 2.6Z"/><circle cx="7.2" cy="7.2" r="1.5"/>',
    // A storefront, because the tab this sits on is labelled お店. The old
    // balance scale meant "compare" but read as neither a shop nor a working
    // scale — its beam tilted while the pans hung level.
    shop:      '<path d="M3.2 9.2 5.1 3.8h13.8l1.9 5.4"/><path d="M2.6 9.2h18.8"/><path d="M4.6 9.2v11.4M19.4 9.2v11.4"/><path d="M2.8 20.6h18.4"/><path d="M9.6 20.6v-6.2h4.8v6.2"/>',
    // A real cog: eight square teeth on a circular body, generated so the
    // pitch is exact. The previous one was drawn from linked arcs, which
    // read as a wavy blob rather than a gear and clipped at the right edge.
    gear:      '<path d="M9.75 4.64L10.25 2.05A10.1 10.1 0 0 1 13.75 2.05L14.25 4.64A7.7 7.7 0 0 1 15.61 5.2L17.79 3.73A10.1 10.1 0 0 1 20.27 6.21L18.8 8.39A7.7 7.7 0 0 1 19.36 9.75L21.95 10.25A10.1 10.1 0 0 1 21.95 13.75L19.36 14.25A7.7 7.7 0 0 1 18.8 15.61L20.27 17.79A10.1 10.1 0 0 1 17.79 20.27L15.61 18.8A7.7 7.7 0 0 1 14.25 19.36L13.75 21.95A10.1 10.1 0 0 1 10.25 21.95L9.75 19.36A7.7 7.7 0 0 1 8.39 18.8L6.21 20.27A10.1 10.1 0 0 1 3.73 17.79L5.2 15.61A7.7 7.7 0 0 1 4.64 14.25L2.05 13.75A10.1 10.1 0 0 1 2.05 10.25L4.64 9.75A7.7 7.7 0 0 1 5.2 8.39L3.73 6.21A10.1 10.1 0 0 1 6.21 3.73L8.39 5.2A7.7 7.7 0 0 1 9.75 4.64Z"/><circle cx="12" cy="12" r="3.1"/>',
    // Five even points, generated rather than eyeballed. Filled via CSS when on.
    star:      '<path d="M12 2.6L14.26 8.89L20.94 9.1L15.66 13.19L17.53 19.6L12 15.85L6.47 19.6L8.34 13.19L3.06 9.1L9.74 8.89Z"/>',
    plus:      '<path d="M12 5v14M5 12h14"/>',
    check:     '<path d="M20 6 9 17l-5-5"/>',
    search:    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    close:     '<path d="M18 6 6 18M6 6l12 12"/>',
    chevron:   '<path d="m9 18 6-6-6-6"/>',
    trash:     '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit:      '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    store:     '<path d="M3 9 4.5 4h15L21 9M3 9h18M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    minus:     '<path d="M5 12h14"/>',
    download:  '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
    upload:    '<path d="M12 21V9M7 13l5-5 5 5M4 3h16"/>',
    sparkles:  '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    undo:      '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7"/>',
    cart:      '<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.77L21 8H6"/>',
    // `undo` mirrored about x=12, so it turns clockwise: same arc, same corner,
    // reads as "again" rather than "back". Drawn as a mirror rather than by
    // eye so the two cannot end up at different radii.
    refresh:   '<path d="M21 7v6h-6"/><path d="M20.5 13a9 9 0 1 1-2.3-9.3L21 7"/>',
  };

  /** Inline stroke icon. */
  function icon(name, cls) {
    const p = ICON_PATHS[name] || "";
    return raw(
      `<svg class="${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`
    );
  }

  /* ---------- feedback ---------- */

  function haptic(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (_) {} }
  }

  KN.util = {
    raw, html, node, frag, escapeHtml,
    uid, clamp, debounce,
    yen, yenFine, parseNum,
    today, formatDate, relativeDate, foldKana,
    unitPrice, formatSize, UNITS,
    icon, haptic,
  };
})();
