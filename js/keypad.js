/* =========================================================
   かいものノート — the number pad

   iOS will hand you a numeric keypad, but it has no operators, no 税 keys, and
   a system toolbar above it that a web page cannot remove. So the field asks
   for no keyboard at all (`inputmode="none"`) and this pad slides up instead:
   digits, the four operators, both tax rates, a backspace and a 確定.

   The field itself is the display. There is no second readout to keep in sync,
   the caret goes where you tap, and what you see is exactly what is stored
   once 確定 works the sum out.

   Nothing here takes focus. Every key cancels the press that would move it, so
   the caret stays in the field the whole time and the pad never has to put it
   back afterwards.
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;

  /* Both rates, because Japan has both and a grocery list meets both in the
     same basket: 8% on food under 軽減税率, 10% on everything else. One key
     would be wrong about half the shelf, and which half is not something the
     app can work out from a price. 8% first — it is the one a food shop
     reaches for most. */
  const TAX_RATES = [0.08, 0.1];

  let pad = null;      // the element, built once
  let field = null;    // the input it is typing into
  let opts = {};

  /* ---------------- building ---------------- */

  const KEYS = [
    ["7", "8", "9", { op: "/", label: "÷" }],
    ["4", "5", "6", { op: "*", label: "×" }],
    ["1", "2", "3", { op: "-", label: "−" }],
    ["00", "0", ".", { op: "+", label: "＋" }],
  ];

  function build() {
    pad = node(html`
      <div class="keypad" role="group" aria-label="数字キーボード" hidden>
        <div class="keypad-grid js-grid"></div>
        <div class="keypad-actions">
          ${TAX_RATES.map((r) => html`
            <button type="button" class="key key-tax js-tax" data-rate="${String(r)}"
                    aria-label="税${Math.round(r * 100)}パーセントを足す">
              <span class="key-tax-cap">税</span><span class="key-tax-rate">+${Math.round(r * 100)}%</span>
            </button>
          `)}
          <button type="button" class="key key-ok js-ok">確定</button>
          <button type="button" class="key key-back js-back" aria-label="1文字消す">${icon("backspace")}</button>
        </div>
      </div>
    `);

    const grid = pad.querySelector(".js-grid");
    KEYS.forEach((row) => row.forEach((k) => {
      const isOp = typeof k === "object";
      const btn = node(html`
        <button type="button" class="key ${isOp ? "key-op" : ""}">${isOp ? k.label : k}</button>
      `);
      btn.addEventListener("click", () => insert(isOp ? k.op : k));
      grid.append(btn);
    }));

    pad.querySelector(".js-back").addEventListener("click", backspace);
    pad.querySelectorAll(".js-tax").forEach((k) => {
      k.addEventListener("click", () => applyTax(parseFloat(k.dataset.rate)));
    });
    pad.querySelector(".js-ok").addEventListener("click", commit);

    // A key must never steal the caret. Cancelling the press keeps focus, and
    // the field stays lit as though a real keyboard were open.
    pad.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".key")) e.preventDefault();
    });

    document.getElementById("sheet-root").append(pad);
  }

  /* ---------------- editing ---------------- */

  function fire() {
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function insert(text) {
    if (!field) return;
    const at = field.selectionStart != null ? field.selectionStart : field.value.length;
    const end = field.selectionEnd != null ? field.selectionEnd : at;
    field.value = field.value.slice(0, at) + text + field.value.slice(end);
    setCaret(at + text.length);
    haptic();
    fire();
  }

  function backspace() {
    if (!field) return;
    const at = field.selectionStart != null ? field.selectionStart : field.value.length;
    const end = field.selectionEnd != null ? field.selectionEnd : at;
    if (end > at) {
      field.value = field.value.slice(0, at) + field.value.slice(end);
      setCaret(at);
    } else if (at > 0) {
      field.value = field.value.slice(0, at - 1) + field.value.slice(at);
      setCaret(at - 1);
    }
    haptic();
    fire();
  }

  /* Works the sum out first, so 「198+250」 gets the tax on the total rather
     than on whatever was typed last, then rounds down — which is what a
     Japanese shelf price does with the fraction of a yen. */
  function applyTax(rate) {
    if (!field) return;
    const n = KN.util.calc(field.value);
    if (n == null) { haptic(20); return; }
    field.value = String(Math.floor(n * (1 + rate)));
    setCaret(field.value.length);
    haptic(14);
    fire();
  }

  /** Replace the expression with its answer and put the pad away. */
  function commit() {
    if (!field) return;
    const n = KN.util.calc(field.value);
    if (n != null) {
      field.value = String(Math.round(n * 100) / 100);
      fire();
    }
    haptic(12);
    const done = opts.onCommit;
    const input = field;
    close();
    // Let the caret go too. Otherwise the field is still focused, and the next
    // tap on it fires no `focus` — the pad would refuse to come back.
    input.blur();
    done && done();
  }

  function setCaret(i) {
    try { field.setSelectionRange(i, i); } catch (err) { /* not every type allows it */ }
  }

  /* ---------------- showing and hiding ---------------- */

  function open(input, options) {
    if (!pad) build();
    field = input;
    opts = options || {};
    pad.hidden = false;
    // Published so a sheet can sit above the pad exactly as it sits above a
    // real keyboard — same mechanism, see --kb in app.js.
    requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--pad", pad.offsetHeight + "px");
      pad.classList.add("is-open");
      opts.onOpen && opts.onOpen();
    });
  }

  function close() {
    if (!pad || pad.hidden) return;
    pad.classList.remove("is-open");
    pad.hidden = true;
    field = null;
    opts = {};
    document.documentElement.style.setProperty("--pad", "0px");
  }

  const isOpen = () => !!(pad && !pad.hidden);

  /**
   * Give a field this pad instead of the system keyboard.
   * @param {HTMLInputElement} input
   * @param {object} [options]
   * @param {Function} [options.onOpen]    after the pad is up and measured
   * @param {Function} [options.onCommit]  after 確定
   */
  function bind(input, options) {
    // `none` is the whole trick: the field still focuses, still shows a caret,
    // still takes a tap to position it — iOS just does not raise a keyboard,
    // so there is no system toolbar above it either.
    input.setAttribute("inputmode", "none");
    input.setAttribute("autocomplete", "off");
    input.addEventListener("focus", () => open(input, options));
    // Focus alone is not enough: a field that never lost it fires no `focus`,
    // so tapping a field the pad was dismissed over has to bring it back too.
    input.addEventListener("click", () => { if (!isOpen()) open(input, options); });
    input.addEventListener("blur", () => {
      // A tap on a key cancels its own press, so focus never actually leaves
      // while the pad is in use. Anything that does get here is a real exit.
      setTimeout(() => { if (document.activeElement !== input) close(); }, 60);
    });
  }

  KN.keypad = { bind, open, close, isOpen };
})();
