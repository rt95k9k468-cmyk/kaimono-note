/* =========================================================
   くらしノート — キーボードと横の送り（パソコン。docs/desk.md の段3）

   打っていないとき（欄・本文の外）だけ効きます：
     1〜5        席（daily・notes・tasks・shopping・health）
     ← →         前・次の日（日を持つ画面）。日を持たない画面は暦を一つ送る
     Shift+← →   前・次の週（暦）
     t           今日へ
     /・⌘K       さがす（⌘K・Ctrl+K は打っている欄の中でも）
     n           ＋（その画面で足す）
     ,           設定
     ⌘\          左の列を畳む・ひらく
   ⌘・Ctrl・Alt 付き（⌘K のほか）、変換中、覆いのある紙・小窓が開いているあいだは何もしません（右の段に据えたノートは覆いが無いので効く）。

   トラックパッドの二本指の横払い（wheel の deltaX）：暦の上なら週、画面の上なら日を一つ送る（払う向きは指で
   払うのと同じ——左へ払えば次）。一回の払いで一度だけ（指を離したあとの慣性の続きは待つ）。横に送れる中身
   （表・チップの列）の上では取りません。送るのは指で払いきったのと同じ道（day-swipe・cal-swipe の flip）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const TABS = ["archive", "notes", "todo", "list", "diet"];
  const WIDE = window.matchMedia("(min-width: 840px)");

  /** 打っているところ（欄・本文・選ぶ欄）。util.js の TEXT_FIELD と同じ見分け（チェック・ボタンの input は欄ではない）。 */
  const FIELD = "textarea, select, [contenteditable]:not([contenteditable='false']), input:not([type=checkbox])"
    + ":not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file])"
    + ":not([type=range]):not([type=color])";
  const typing = (el) => !!(el && el.closest && el.closest(FIELD));
  /** 覆いのある紙・小窓が出ている（決めるあいだは、後ろの画面を動かさない）。右の段に据えたノートの覆いは消してある。 */
  const covered = () => [...document.querySelectorAll(".sheet-backdrop, .note-pop-cover")].some((b) => b.getClientRects().length > 0);
  /** 鍵がかかっている（daily・ノート）。席は移れる（下の帯と同じ）が、中身は動かさない。 */
  const locked = () => document.documentElement.classList.contains("is-locked");
  const activeScreen = () => document.querySelector(`.screen[data-screen="${KN.app.activeScreen()}"]`);
  const shown = (el) => !!(el && el.getClientRects().length && !el.closest("[hidden]"));

  /** 日を一つ送る。日を持たない画面（ノート・価格・設定）では何もしない。 */
  function day(dir) {
    const scr = activeScreen();
    return !!(scr && KN.daySwipe && KN.daySwipe.flipIn(scr, dir));
  }
  /** 暦を一つ送る（週を出していれば週、月なら月）。 */
  function cal(dir) {
    const head = document.getElementById("head");
    return !!(head && !head.hidden && KN.calSwipe && KN.calSwipe.flipIn(head, dir));
  }
  const press = (el) => { if (shown(el) && !el.disabled) { el.click(); return true; } return false; };

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    /* ⌘K・Ctrl+K：さがす（Notion・Slack と同じ）。打っている欄の中でも効く——書いている途中から探しに行く道。 */
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) {
      if (!covered() && press(document.querySelector("#head .js-search-btn"))) e.preventDefault();
      return;
    }
    /* ⌘\・Ctrl+\：左の列を畳む・ひらく（Notion・VS Code と同じ。JIS の ¥ キーも）。広い幅だけ。 */
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "\\" || e.key === "¥" || e.code === "Backslash" || e.code === "IntlYen")) {
      if (WIDE.matches && KN.app.foldRail) { KN.app.foldRail(); e.preventDefault(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing(e.target) || typing(document.activeElement)) return;
    const k = e.key;
    const tab = "12345".indexOf(k);
    let done = false;
    if (covered()) return;
    if (tab >= 0 && k.length === 1) {
      done = press(document.querySelector(`#tabbar .tab-${TABS[tab]}`));
    } else if (locked()) {
      return;
    } else if (k === "ArrowLeft" || k === "ArrowRight") {
      const dir = k === "ArrowLeft" ? -1 : 1;
      done = e.shiftKey ? cal(dir) : (day(dir) || cal(dir));
    } else if (e.shiftKey) {
      return;
    } else if (k === "t") {
      done = press(document.querySelector("#head .js-go-today"));
    } else if (k === "/") {
      done = press(document.querySelector("#head .js-search-btn"));
    } else if (k === "n") {
      done = press(document.querySelector("#dock .add-fab"));
    } else if (k === ",") {
      done = press(document.querySelector("#head .js-settings"));
    }
    if (done) e.preventDefault();
  });

  /* ---- トラックパッドの横払い ---- */

  /** 指の下から上へ、その向きにまだ横へ送れる中身があるか（表・チップの列）。 */
  function sideScroll(t, dx) {
    for (let n = t; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      if (n.scrollWidth <= n.clientWidth + 1) continue;
      if (!/auto|scroll/.test(getComputedStyle(n).overflowX)) continue;
      if (dx > 0 ? n.scrollLeft + n.clientWidth < n.scrollWidth - 1 : n.scrollLeft > 0) return true;
    }
    return false;
  }

  let acc = 0, lastT = -1e9, fired = false;
  /* 一続きの払いとみなす間（ms）。慣性の続きはこれより詰めて来る。 */
  const GAP = 220;
  /* 送る量（px）。指一本ぶんほど横へ払えば送る。 */
  const STEP = 60;

  document.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return;                               // つまんで拡大
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * px, dy = e.deltaY * px;
    const now = e.timeStamp;
    const fresh = now - lastT > GAP;
    lastT = now;
    if (fresh) { acc = 0; fired = false; }
    if (Math.abs(dx) <= Math.abs(dy)) return;            // 縦の送り
    const t = e.target;
    const onCal = !!(t.closest && t.closest("#head .head-cal"));
    const onScreen = !!(t.closest && t.closest(".panes > .screen:is(.is-active, .is-duo-r)"));
    if (!onCal && !onScreen) return;
    if (typing(t) || sideScroll(t, dx) || covered() || locked()) return;
    e.preventDefault();                                  // ブラウザの「戻る・進む」の払いにしない
    if (fired) return;
    acc += dx;
    if (Math.abs(acc) < STEP) return;
    fired = true;
    const dir = acc > 0 ? 1 : -1;
    if (onCal) cal(dir);
    else if (!day(dir)) cal(dir);
  }, { passive: false });

  KN.keys = { TABS };
})();
