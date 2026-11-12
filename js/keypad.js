/* =========================================================
   くらしノート — the number pad

   iOS will hand you a numeric keypad, but it has no operators, no 税 keys, and
   a system toolbar above it that a web page cannot remove. So the field asks
   for no keyboard at all (`inputmode="none"`) and this pad slides up instead:
   digits, the four operators, 税抜 and its rate, a backspace and a 確定.

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

  /* 税抜で打って税込で持つ（docs/shopping.md「S1〜S4」）。札は二つ：「税抜」（押すあいだ打った数は税抜）と率（8%⇄10%）。
     率は欄が持つ（`data-rate`。品物の紙が食品 8%・ほか 10% を入れ、品ごとに直したらそれ）。欄に率が無ければ二つは出さない。
     確定で税込（円未満は切り捨て——棚の値段と同じ）に置き換えて、札は外れる。保存するのは今までどおり一つの数。
     空の欄は前の「税抜」を引き継ぐ（同じ店で続けて打つので）。 */
  let lastNet = false;

  let pad = null;      // the element, built once
  let field = null;    // the input it is typing into
  let opts = {};

  /* ---------------- building ---------------- */

  const KEYS = [
    ["7", "8", "9", { op: "/", label: "÷" }],
    ["4", "5", "6", { op: "*", label: "×" }],
    ["1", "2", "3", { op: "-", label: "−" }],
    /* 「00」 was here. It saved one press on prices ending in two zeros, which
       a grocery list almost never has — 「298」「1,480」 — while the discount
       on the shelf tag is something this pad could work out and could not. */
    [{ pct: true }, "0", ".", { op: "+", label: "＋" }],
  ];

  function build() {
    pad = node(html`
      <div class="keypad" role="group" aria-label="数字キーボード" hidden>
        <div class="keypad-grid js-grid"></div>
        <div class="keypad-actions">
          <button type="button" class="key key-tax js-net" aria-pressed="false">税抜</button>
          <button type="button" class="key key-tax js-rate" aria-label="税の率を替える"></button>
          <button type="button" class="key key-ok js-ok" aria-label="確定">確定</button>
          <button type="button" class="key key-back js-back" aria-label="1文字消す">${icon("backspace")}</button>
        </div>
      </div>
    `);

    const grid = pad.querySelector(".js-grid");
    KEYS.forEach((row) => row.forEach((k) => {
      if (k && k.pct) {
        const btn = node(html`
          <button type="button" class="key key-off js-off" aria-label="割引の率を入れる">
            <span class="key-off-cap">割引</span><span class="key-off-main">−％</span>
          </button>
        `);
        btn.addEventListener("click", discount);
        grid.append(btn);
        return;
      }
      const isOp = typeof k === "object";
      const btn = node(html`
        <button type="button" class="key ${isOp ? "key-op" : ""}">${isOp ? k.label : k}</button>
      `);
      btn.addEventListener("click", () => insert(isOp ? k.op : k));
      grid.append(btn);
    }));

    pad.querySelector(".js-back").addEventListener("click", backspace);
    pad.querySelector(".js-net").addEventListener("click", () => setNet(field && field.dataset.net !== "1"));
    pad.querySelector(".js-rate").addEventListener("click", () => {
      if (!field || !field.dataset.rate) return;
      field.dataset.rate = field.dataset.rate === "0.1" ? "0.08" : "0.1";
      setNet(true);
    });
    /* One key, two jobs, and never both at once: while a sum is on screen it
       is ＝ and works the answer out in place; once the field holds a plain
       number it is 確定 and puts the pad away. Pressing 確定 on a half-typed
       sum used to swallow the working and close in the same motion, which
       gave you no chance to look at what it came to. */
    pad.querySelector(".js-ok").addEventListener("click", () => {
      if (field && KN.util.isExpression(field.value)) equals();
      else commit();
    });

    /* Nothing on the pad may steal the caret — not the keys, and not the gaps
       between them. Landing a fast thumb a few pixels wide of a key used to
       blur the field, and the blur handler below then put the pad away
       mid-sum. Cancelling the press on the whole pad keeps focus wherever the
       finger lands; clicks still fire, so the keys work exactly as before. */
    pad.addEventListener("pointerdown", (e) => e.preventDefault());
    pad.addEventListener("mousedown", (e) => e.preventDefault());

    /* Since a lost caret no longer takes the pad down with it (see
       restoreOrClose), there has to be a deliberate way out other than 確定:
       a press anywhere that is neither the pad nor the field it is typing
       into means the user is done with it. But not this instant — see
       closeAfterTap: the finger is still on the glass. */
    document.addEventListener("pointerdown", (e) => {
      if (!isOpen()) return;
      if (pad.contains(e.target)) return;
      if (field && (e.target === field || field.contains(e.target))) return;
      closeAfterTap();
    }, true);

    document.getElementById("sheet-root").append(pad);
  }

  /* ---------------- editing ---------------- */

  function fire() {
    field.dispatchEvent(new Event("input", { bubbles: true }));
    refreshOk();
  }

  function setNet(on) {
    if (!field || !field.dataset.rate) return;
    field.dataset.net = on ? "1" : "";
    lastNet = on;
    haptic(12);
    fire();
  }

  /** 欄の値段（式なら答え、税抜なら税込）。打ちかけ・空は null。品物の紙の読み・保存が使う。 */
  function price(input) {
    const n = KN.util.calc(input.value);
    if (n == null) return null;
    return input.dataset.net === "1" ? Math.floor(n * (1 + parseFloat(input.dataset.rate))) : Math.round(n * 100) / 100;
  }

  /** Keep the big green key showing whichever of its two jobs applies now. */
  function refreshOk() {
    if (!pad) return;
    const ok = pad.querySelector(".js-ok");
    if (!ok) return;
    const rate = field && field.dataset.rate;
    pad.classList.toggle("no-tax", !rate);
    pad.querySelector(".js-net").setAttribute("aria-pressed", String(!!rate && field.dataset.net === "1"));
    if (rate) pad.querySelector(".js-rate").textContent = `${Math.round(parseFloat(rate) * 100)}%`;
    const sum = !!field && KN.util.isExpression(field.value);
    ok.classList.toggle("is-equals", sum);
    /* okLabel … 確定がそのまま決める欄（品物の紙の値段を足す欄＝「追加」「更新」。RS の④、主のボタンは鍵盤の上に一つ）。 */
    const word = (opts && opts.okLabel && opts.okLabel()) || "確定";
    ok.textContent = sum ? "＝" : word;
    ok.setAttribute("aria-label", sum ? "計算する" : word);
  }

  /* Work the sum out and leave it on screen. The pad stays up and the caret
     stays put, so the answer can be read, taxed, or typed over before
     anything is committed. */
  function equals() {
    if (!field) return;
    const n = KN.util.calc(field.value);
    // 「198+」 is not wrong, it is unfinished — say nothing and wait.
    if (n == null) { haptic(20); return; }
    field.value = String(Math.round(n * 100) / 100);
    setCaret(field.value.length);
    haptic(14);
    fire();
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

  /* 「20%引き」 on the shelf tag. Press this after the sticker price and the
     field reads 「398-%」 with the caret parked between the two, so the rate
     you type next lands where it belongs and the whole thing stays readable
     as 「398-12%」. The answer comes from ＝, like any other sum. */
  function discount() {
    if (!field) return;
    const at = field.selectionStart != null ? field.selectionStart : field.value.length;
    const end = field.selectionEnd != null ? field.selectionEnd : at;
    const before = field.value.slice(0, at);
    // Nothing to take the discount off yet, or a rate already waiting for one.
    if (!before || /[+\-*/%]$/.test(before) || field.value.indexOf("%") >= 0) {
      haptic(20);
      return;
    }
    field.value = before + "-%" + field.value.slice(end);
    setCaret(at + 1);
    haptic(12);
    fire();
  }

  /** Replace the expression with its answer and put the pad away. */
  function commit() {
    if (!field) return;
    const n = price(field);
    if (n != null) {
      field.value = String(n);
      field.dataset.net = "";
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
    if (input.dataset.rate && !input.value) input.dataset.net = lastNet ? "1" : "";
    pad.hidden = false;
    refreshOk();
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
    // The field is what the app reads to decide whether a keyboard is up (and
    // whether to hide the tab bar behind it). Let it go with the pad — if it
    // is still there. A form that has been rebuilt underneath us has not.
    const was = field;
    field = null;
    opts = {};
    if (was && was.isConnected && document.activeElement === was) was.blur();
    document.documentElement.style.setProperty("--pad", "0px");
    guardGhostClick();
    // The pad standing in for the keyboard means the app's idea of one has to
    // be re-read now, whether or not a blur was there to announce it.
    KN.app.remeasure && KN.app.remeasure();
  }

  /* ---------------- the click that lands somewhere else ----------------

     The pad is a third of the screen. Closing it hands all of that height
     back at once, and everything above slides down into it — while a finger
     is still on the glass. A tap is not one event but three: press, release,
     click. If the pad goes away on the press, the layout has moved by the
     time the click is worked out, and the browser hands it to whatever is
     under the point *now*.

     On the price sheet this was a data loss: with the pad up, 「追加」 sat
     where a saved row's 🗑 landed once the pad was gone. Pressing 追加
     deleted a price and recorded nothing.

     So a press outside the pad no longer closes it — it arms the close, and
     the pad stays up until the tap it belongs to has been delivered in full.
     Nothing moves under the finger, and 追加 gets its own click. */

  let armed = false;
  let armedFor = null;

  function closeAfterTap() {
    if (armed) return;
    armed = true;
    // Which field this close belongs to. If the tap turns out to open the pad
    // on something else, the close is stale and must not take the new one down.
    armedFor = field;
    // Capture, so this runs before the button's own handler and can hand the
    // close to the end of the queue — after the whole click has been
    // dispatched, whatever it turns out to do.
    document.addEventListener("click", onTapEnd, true);
    document.addEventListener("pointerup", onTapEnd, true);
    document.addEventListener("pointercancel", onTapEnd, true);
    document.addEventListener("touchend", onTapEnd, true);
  }

  function onTapEnd() {
    if (!armed) return;
    armed = false;
    document.removeEventListener("click", onTapEnd, true);
    document.removeEventListener("pointerup", onTapEnd, true);
    document.removeEventListener("pointercancel", onTapEnd, true);
    document.removeEventListener("touchend", onTapEnd, true);
    // A release is not the end of the tap: the click still has to be worked
    // out and delivered. Wait past it before giving the height back.
    const was = armedFor;
    setTimeout(() => {
      if (armed) return;              // another tap is in flight
      if (field && field !== was) return; // the pad moved to another field
      close();
    }, 90);
  }

  /* Belt and braces for the same failure. If anything else takes the pad down
     mid-tap — a blur, a sheet closing, a handler calling close() — a click
     that ends up somewhere other than where the finger went down is not a
     tap the user made. Throw it away. */

  let downTarget = null;
  document.addEventListener("pointerdown", (e) => { downTarget = e.target; }, true);
  document.addEventListener("touchstart", (e) => {
    downTarget = (e.touches[0] && e.touches[0].target) || downTarget;
  }, true);

  let guardUntil = 0;
  function guardGhostClick() { guardUntil = Date.now() + 400; }

  document.addEventListener("click", (e) => {
    if (!guardUntil || Date.now() > guardUntil) return;
    const from = downTarget;
    // Same element, or one contains the other: the tap stayed where it began.
    if (from && (from === e.target || from.contains(e.target) || e.target.contains(from))) return;
    guardUntil = 0;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  const isOpen = () => !!(pad && !pad.hidden);

  /* Focus left the field — but where did it go? Onto another control is a
     real exit and the pad goes away. Nowhere at all (activeElement back on
     <body>, or on the pad itself) means the tap simply fell off the edge of a
     key, and taking the pad down there loses the sum the user is halfway
     through typing. Hand the caret back and stay open. */
  function restoreOrClose(input) {
    // The pad has already been handed to another field — this blur is the tail
    // end of leaving the old one, not a reason to take the new one down.
    if (field && field !== input) return;
    const a = document.activeElement;
    const wentNowhere = !a || a === document.body || a === document.documentElement
      || (pad && pad.contains(a));
    if (isOpen() && field === input && wentNowhere && input.isConnected) {
      input.focus({ preventScroll: true });
      return;
    }
    close();
  }

  /**
   * Give a field this pad instead of the system keyboard.
   * @param {HTMLInputElement} input
   * @param {object} [options]
   * @param {Function} [options.onOpen]    after the pad is up and measured
   * @param {Function} [options.onCommit]  after 確定
   * @param {Function} [options.okLabel]   the 確定 key's word when it also saves (「追加」)
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
      setTimeout(() => {
        if (document.activeElement !== input) restoreOrClose(input);
      }, 60);
    });
  }

  KN.keypad = { bind, open, close, isOpen, price, refresh: refreshOk };
})();
