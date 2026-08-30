/* =========================================================
   くらしノート — app shell: tabs, routing, theme, PWA
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;
  const store = KN.store;

  // 他のモジュールと同じく、外に出すものは一つの名前空間（KN.app）にまとめます。
  // 中身はこのファイルのあちこちで出来上がった順に足していきます。
  KN.app = {};

  /* 四つ。この帳面が扱う四つのことです——日々・その日の用事・買い物・からだ。

     ここに無いものは、**居場所ではないから**ここに無い。お店くらべは
     行き先を決めるときに何度か使うもので、住む場所ではありませんでした
     （そして使われないまま残っていたので、外しました）。設定も同じで、
     そもそも場所ではない。価格は、買い物の途中で開くものではなく、値段を
     仕込むときにたまに開くもの。三つとも、呼んだ画面から名前で開いて、
     帰り道を持って帰ります。 */
  const TABS = [
    { id: "archive", label: "daily", icon: "book" },
    { id: "todo", label: "やること", icon: "checklist" },
    /* 「買うもの」と「価格」は、一つのボタンのふた面でした。押すたびに
       裏返る作りで、動きとしては綺麗だったのですが、**価格はタブの
       持ち場ではありません**——買い物の途中で開くものではなく、値段を
       仕込むときにたまに開くものです。買うものの上の帯から呼ぶ形にして、
       タブは一つに戻しました。 */
    { id: "list", label: "買うもの", icon: "list" },
    { id: "diet", label: "ダイエット", icon: "scale" },
  ];

  /* 引き出し（価格・設定）を、どこから開けたか。**一つの変数ではなく積み木**
     です——買うもの → 価格 → 設定 と潜れるようになったので、「戻る」は
     一段ずつ戻らなければいけません。一つの変数だと、設定から戻ったときに
     価格ではなく買うものへ飛ぶか、価格と設定のあいだで往復します。

     タブへ戻ったら、積んだものは捨てます（タブは根っこなので）。 */
  const drawerFrom = [];
  /* 「戻る」で開くときは積みません。積むと、戻った先からまた戻れなくなります。 */
  let goingBack = false;
  const HOME_OF_DRAWER = "list";

  /* The app opens on やること. The question on picking the phone up is 「今日
     なにをするんだっけ」 far more often than 「何を買うんだっけ」 — the shopping
     list is what you open once you are already standing in a shop, and it is
     one tap away. */
  const HOME = "todo";

  let active = HOME;
  const mounted = new Set();

  /* ---------------- theme ---------------- */

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  }
  KN.app.applyTheme = applyTheme;

  /* 基調色。明暗（data-theme）とは**別の軸**なので、別の札で持ちます
     ——「青の、暗い面」のように二つは掛け合わさるものだからです。

     既定（オレンジ）のときは札を付けません。付けないほうが :root の素の値が
     そのまま効いて、規則が一段浅く済みます。 */
  function applyAccent(accent) {
    const root = document.documentElement;
    const known = (KN.store && KN.store.ACCENTS) || [];
    const ok = known.some((a) => a.id === accent);
    if (ok && accent !== "orange") root.setAttribute("data-accent", accent);
    else root.removeAttribute("data-accent");
  }
  KN.app.applyAccent = applyAccent;

  /* ---------------- tabs ---------------- */

  function buildTabs() {
    const bar = document.getElementById("tabbar");
    bar.innerHTML = "";

    TABS.forEach((t) => {
      /* 仕切りの線（.tab-split）は、ここで四つのあいだに入れていました。
         帯が画面いっぱいだったころ、四つの持ち場を切るために要ったものです。
         浮いた一つのカプセルになった今は、外枠が「ここが一まとまり」と
         言っているので、中を切るとかえって窮屈に見えます。 */
      /* 絵は .tab-ico-face に入れます。丸い下地（.tab-ico）と絵を分けて
         おくと、選ばれた印（下地）と絵の差し替えが別々に効きます。 */
      const btn = node(html`
        <button class="tab tab-${t.id}" role="tab"
                data-tab="${t.id}" aria-controls="screen-${t.id}">
          <span class="tab-ico"><span class="tab-ico-face" data-face="${t.id}"></span></span>
          <span class="tab-label"></span>
        </button>
      `);
      btn.querySelector(".tab-ico-face")
        .append(node(html`<span>${icon(t.icon)}</span>`).firstChild);
      btn.addEventListener("click", () => show(t.id));
      bar.append(btn);
    });
    paintTabs();
  }

  function paintTabs() {
    TABS.forEach((t) => {
      const btn = document.querySelector(`.tab[data-tab="${t.id}"]`);
      if (!btn) return;
      /* 価格は買うものの引き出しなので、そこに居るあいだも「買うもの」が
         光ったままです——帯のどこも光っていない画面は、迷子に見えます。 */
      const here = t.id === active || (t.id === "list" && active === "prices");
      btn.setAttribute("aria-selected", String(here));
      btn.querySelector(".tab-ico-face").classList.add("is-on");
      const label = btn.querySelector(".tab-label");
      if (label.dataset.sig !== t.label) { label.dataset.sig = t.label; label.textContent = t.label; }
    });

    /* 数えるのは、**やると言ったもの**だけです。絵の上でもタブの上でも
       同じ決めごとにします。

       いちど「タブは押した先の件数を言うだけだから、★の無いものも数えて
       いい」と考えて、未購入の全部を数えるようにしました。**間違いでした。**
       ★を付けていないものは「今回でも今日でもないが、近いうちに買うもの」
       に過ぎず、いま片づける対象ではありません。数を出せば、片づける対象に
       見えます。見える場所が違っても、数が持つ意味は変わりません。 */
    paintAppBadge();

    paintTabBadge("list", tripCount());
    paintTabBadge("todo", todoBadge());
    /* ダイエットに数は出しません。「残り◯件」にあたるものが無いからです——
       体重を量っていない日を「1件」と数えるのは催促であって、記録ではない。
       daily も同じで、書いていない日は「0件」ではなく、ただの休みです。 */
  }

  function paintTabBadge(tabId, count) {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (!tab) return;
    const existing = tab.querySelector(".tab-badge");
    if (count > 0) {
      const text = count > 99 ? "99+" : String(count);
      if (existing) existing.textContent = text;
      else tab.append(node(html`<span class="tab-badge">${text}</span>`));
    } else if (existing) {
      existing.remove();
    }
  }

  /* ---------------- the same number, on the home screen ---------------- */

  /* iOS has carried the Badging API for installed web apps since 16.4, so the
     counts on the tabs can be the count on the app icon — the one number
     worth seeing without opening anything.

     Two things make this a setting rather than something that just happens.
     It only works from the Home Screen, not in the browser; and iOS hangs the
     badge off the *notification* permission, so switching it on means asking
     for a permission whose dialog talks about notifications this app will
     never send. That is not a prompt to spring on anyone unasked. */
  /** Left to buy on the trip being shopped now. アプリの絵の上に出す数。 */
  const tripCount = () => store.get().items.filter((i) => i.fav && !i.checked).length;

  /* やることは「今日ぶん」。時刻が来ているかだけは見ません——今日に
     決めたものは、19時のぶんも今日やると言ったものなので。絵の上の数
     （todosDue）は時刻まで見ます。そこは開いていなくても目に入るので、
     まだ来ていない時刻のぶんを出すと催促になるからです。
     期限を過ぎたものは、どちらにも入ります。 */
  const todoBadge = () =>
    store.openTodos().filter((t) => t.due && KN.util.daysUntil(t.due) <= 0).length;

  /* What the home-screen icon counts: this trip's shopping, plus the やること
     that are wanted today or are already late. Both are 「things I said I
     would do and have not」, which is the only kind of number worth putting on
     an app icon; a todo due next Friday is not one of them yet. */
  const pendingCount = () => tripCount() + store.todosDue().length;

  const badgeSupported = () => typeof navigator !== "undefined" && !!navigator.setAppBadge;

  let badgeShown = null;    // what we last asked the icon to show
  let badgeRefused = false; // the last ask was turned down

  /**
   * @param force  re-state the number even if it has not changed.
   *
   * The cache exists so an ordinary repaint does not fire a promise per
   * keystroke. But the icon is not ours to remember: iOS drops the badge on a
   * reboot, on a force quit, and when the notification permission is taken
   * away — and tells the page nothing. Left to the cache, the app would then
   * skip the one call that would put it back, forever. So a refused call
   * forgets the cache, and coming back to the app re-states the number
   * instead of assuming it stuck.
   */
  function paintAppBadge(force) {
    if (!badgeSupported()) return;
    const want = store.get().settings.appBadge === true ? pendingCount() : 0;
    if (!force && want === badgeShown) return;
    badgeShown = want;
    const refused = () => { badgeShown = null; badgeRefused = true; };
    try {
      const done = want > 0 ? navigator.setAppBadge(want) : navigator.clearAppBadge();
      Promise.resolve(done).then(() => { badgeRefused = false; }, refused);
    } catch (err) { refused(); }
  }

  /** The icon is showing nothing although the setting says it should. */
  function badgeBlocked() {
    if (store.get().settings.appBadge !== true) return false;
    if (window.Notification && Notification.permission === "denied") return true;
    return badgeRefused;
  }

  function watchAppBadge() {
    const restate = () => paintAppBadge(true);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") restate();
    });
    window.addEventListener("pageshow", restate);
    window.addEventListener("focus", restate);
    /* And on the way out. The icon is read while the app is closed, so the
       last thing it is told before the app goes away had better be the number
       that was on screen. */
    window.addEventListener("pagehide", restate);
  }

  /** Ask for what the badge needs, and turn it on if it is given. */
  function enableAppBadge() {
    if (!badgeSupported()) return Promise.resolve(false);
    const ask = (window.Notification && Notification.requestPermission)
      ? Notification.requestPermission()
      : Promise.resolve("granted");
    return Promise.resolve(ask)
      .then((res) => {
        // Chrome badges an installed app without asking anything; iOS wants
        // the notification permission first and simply does nothing without.
        if (res === "denied") return false;
        store.update((s) => { s.settings.appBadge = true; });
        badgeShown = null;
        paintAppBadge();
        return true;
      })
      .catch(() => false);
  }

  function disableAppBadge() {
    store.update((s) => { s.settings.appBadge = false; });
    badgeShown = null;
    paintAppBadge();
  }

  KN.app.appBadge = {
    supported: badgeSupported,
    enabled: () => store.get().settings.appBadge === true,
    blocked: badgeBlocked,
    enable: enableAppBadge,
    disable: disableAppBadge,
    /* いま絵に出しているはずの数と、その内わけ。設定の画面がこれを出します
       ——0 のとき、絵には何も出ません。それが「壊れている」のか「数える
       ものが無い」のかは、外からは見分けがつきません。言えば分かります。 */
    now: () => ({ total: pendingCount(), trip: tripCount(), due: store.todosDue().length }),
  };


  function show(id) {
    if (!KN.screens[id]) return;
    if (!goingBack) {
      if (OFF_BAR.includes(id)) { if (active !== id) drawerFrom.push(active); }
      else drawerFrom.length = 0;
    }
    active = id;

    document.querySelectorAll(".screen").forEach((s) => {
      const on = s.dataset.screen === id;
      s.classList.toggle("is-active", on);
      s.hidden = !on;
    });

    ensureMounted(id);
    KN.screens[id].render();

    /* 画面によっては、開いたこと自体が合図になります。呼ぶのはここ——
       タブを押した一拍のうちなので、ブラウザの「操作のうちに」を満たします。 */
    if (KN.screens[id].onEnter) {
      try { KN.screens[id].onEnter(); } catch (err) { /* 開くことを妨げない */ }
    }

    /* 「文字でさがす」のバーは、題のすぐ下に置いてあって、開いた時点では
       その一段ぶんだけ先へ送ってあります（ui.js の parkSearch）。少し下へ
       引けば出てきます。組み終わってから測るので、一拍おきます。 */
    const screenEl = document.getElementById("screen-" + id);
    requestAnimationFrame(() => KN.ui.parkSearch(screenEl));

    /* The ＋ lives in the dock — floating over the screen just above the tab
       bar, where a thumb already is — rather than in the top corner of each
       screen. Both the list and the price screen have something to add, and
       adding it is the same motion on both; the screens that have nothing to
       add leave the dock empty and it steps out of the way entirely.

       Rebuilt on every switch rather than kept per screen: one dock, one
       button, and no chance of the list's ＋ opening over the price screen. */
    const dock = document.getElementById("dock");
    if (dock) {
      dock.innerHTML = "";
      const make = KN.screens[id] && KN.screens[id].dockButton;
      const fab = make ? make() : null;
      if (fab) dock.append(fab);
      dock.hidden = !dock.childElementCount;
      /* ＋ は帯の**右どなり**に立ちます（参考にした画面と同じ並び）。
         その日は帯のほうが一つぶん狭くなるので、あるかないかを根に
         書いておいて、CSS がそこから幅を決めます。 */
      document.documentElement.classList.toggle("has-fab", !dock.hidden);
    }

    paintTabs();
    haptic();

    if (location.hash.slice(1) !== id) {
      history.replaceState(null, "", "#" + id);
    }
  }

  function ensureMounted(id) {
    if (mounted.has(id)) return;
    KN.screens[id].mount(document.getElementById("screen-" + id));
    mounted.add(id);
  }

  /* ---------------- boot ---------------- */

  function boot() {
    applyTheme(store.get().settings.theme || "auto");
    applyAccent(store.get().settings.accent || "orange");
    buildTabs();

    const fromHash = location.hash.slice(1);
    show(KN.screens[fromHash] ? fromHash : HOME);

    /* The hash is how the back button knows where it is, but it is also what
       iOS hands back when it restores a standalone app it had killed — and a
       restore is a fresh open, which should land on やること like any other.
       So the hash is wiped on the way out and only ever survives a reload
       inside one sitting. */
    window.addEventListener("pagehide", () => {
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    });

    /* 保存は120msだけ待ってからまとめて書きます（連打のたびに書かないため）。
       その一拍のうちにアプリを閉じられると、待っていた分だけ保存されずに
       終わることがあります——iOSではスワイプでの終了が一瞬なので、
       pagehide／隠れた瞬間（visibilitychange）の両方でその場に書き出します。 */
    window.addEventListener("pagehide", () => store.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") store.flush();
    });

    // Re-render whichever screen is visible whenever state changes.
    store.subscribe(() => {
      if (KN.screens[active]) KN.screens[active].render();
      paintTabs();
    });

    window.addEventListener("hashchange", () => {
      const id = location.hash.slice(1);
      if (KN.screens[id] && id !== active) show(id);
    });

    // Keep two tabs of the same app in sync.
    window.addEventListener("storage", (e) => {
      if (e.key === store.KEY) location.reload();
    });

    /* The clock moving is a thing that changes the screen.

       Midnight is the obvious one: a due date is only 「今日」 until it is not,
       and a phone left open on the kitchen counter overnight would otherwise
       still be showing yesterday's groupings and yesterday's badge.

       19:30 is the other. A todo with a time on it is not counted until its
       time comes round, so the number on the icon has to change by itself when
       it does — nobody is going to be holding the phone at the moment that
       matters. Both are checked by looking at what the answer *is* rather than
       by arithmetic on when it should next change. */
    let dayNow = KN.util.todayKey();
    let dueNow = store.todosDue().length;
    KN.app.onMinute = () => {
      const key = KN.util.todayKey();
      const due = store.todosDue().length;
      if (key === dayNow && due === dueNow) return;
      dayNow = key;
      dueNow = due;
      if (KN.screens[active]) KN.screens[active].render();
      paintTabs();
      paintAppBadge(true);
    };
    setInterval(KN.app.onMinute, 30000);

    requestPersistentStorage();
    watchTopTap();
    trackKeyboard();
    watchAppBadge();
    KN.pullRefresh.init();
    KN.backup.init();
    KN.notify.init();
    registerServiceWorker();
  }

  /* ---------------- back to the top ----------------

     Tapping the status bar — the strip beside the notch — sends you to the top
     of a list. It is the oldest gesture on the phone and it is free, except
     that this app cannot hear it.

     What iOS actually does is scroll *the document* to the top, and this
     document does not scroll: the shell is exactly viewport height and every
     list scrolls inside its own screen (see base.css, which pins it on purpose
     — a scrollable document rubber-banded under every gesture and kept the
     scroll iOS applied to reveal a focused field). There is no event for the
     tap itself; nothing is delivered to a page under the status bar.

     So the document is given one pixel of travel and parked on it. That single
     pixel is the only thing iOS can take, and taking it is the signal. The
     pixel is hidden under the status bar, the keyboard handler still owns
     window.scrollY while a field is focused, and if the tap never arrives the
     app is exactly as it was.

     The header does the same thing on purpose, for every other device and as
     the one that certainly works: a tap on the title, away from the buttons,
     goes to the top. */

  /* The one pixel the document is given, and where it rests. */
  const TOP_TAP_PARK = 1;
  const topTapOn = () => document.documentElement.classList.contains("has-top-tap");

  const activeScreen = () => document.querySelector(".screen.is-active");

  /* Quick — a slide, not a journey. Native smooth scrolling paces itself by
     distance, so a screen 20 lists long took seconds; this is the same 260ms
     whether you are 300px down or 30,000. */
  /* 動いているあいだは、ノッチのタップを聞きません。滑らせている最中に
     文書が0へ寄ることがあり（貼りついた要素があると、ブラウザが位置を
     取り直します）、それを合図と読むと、自分が始めた動きを自分で
     打ち消して上へ飛びます。 */
  let gliding = 0;

  function glideTo(el, to) {
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const want = Math.max(0, Math.min(max, to));
    const from = el.scrollTop;
    if (Math.abs(want - from) < 1) return;
    const start = performance.now();
    gliding = start + 420;
    const step = (now) => {
      const t = Math.min(1, (now - start) / 260);
      const e = 1 - Math.pow(1 - t, 3);
      el.scrollTop = from + (want - from) * e;
      if (t < 1) requestAnimationFrame(step);
      else gliding = performance.now() + 120;   // 着地の直後もひと呼吸
    };
    requestAnimationFrame(step);
  }

  const isGliding = () => performance.now() < gliding;
  KN.app.isGliding = isGliding;
  const glideToTop = (el) => glideTo(el, 0);
  KN.app.glideTo = glideTo;
  KN.app.glideToTop = glideToTop;

  function watchTopTap() {
    /* The header, everywhere. Buttons and fields keep their own taps. */
    document.addEventListener("click", (e) => {
      const bar = e.target.closest && e.target.closest(".topbar");
      if (!bar) return;
      if (e.target.closest("button, a, input, textarea, select, label")) return;
      glideToTop(activeScreen());
    });

    /* And the status bar — only on a touch screen, which is the only place
       there is one. On a desktop the pixel would just be a pixel of wheel
       travel that jumps the list to the top for no reason. */
    if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;

    const root = document.documentElement;
    root.classList.add("has-top-tap");
    const park = () => {
      // Never while a field is focused: window.scrollY belongs to the keyboard
      // then, and fit() moves it for reasons of its own.
      if (root.classList.contains("kb-open")) return;
      if (window.scrollY < TOP_TAP_PARK) window.scrollTo(0, TOP_TAP_PARK);
    };
    park();

    /* What must never reach here is a *collateral* pull to zero. `scrollIntoView`
       on a row asks every ancestor to bring it into view, the document included,
       and that would read as a tap and jump the screen to the top underneath
       whatever was being done to it. The app therefore scrolls its screens by
       setting scrollTop rather than by asking the browser to reveal an element
       (see jumpToDay), which leaves the document out of it entirely.

       Timing cannot tell the two apart: a tap during a flick's coast looks
       exactly like collateral, and refusing it would break the one moment the
       gesture is most wanted. So the rule is 「起こさない」 rather than
       「見分ける」. */
    let touching = false;
    const down = () => { touching = true; };
    const up = () => { touching = false; };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("touchstart", down, { capture: true, passive: true });
    document.addEventListener("touchend", up, { capture: true, passive: true });

    window.addEventListener("scroll", () => {
      if (root.classList.contains("kb-open")) return;
      if (window.scrollY !== 0) return;
      const quiet = !touching && !isGliding() && !(KN.reorder && KN.reorder.isActive());
      const el = quiet ? activeScreen() : null;
      // The pixel goes back either way, so the next tap has something to take.
      window.scrollTo(0, TOP_TAP_PARK);
      if (el && el.scrollTop > 0) { glideToTop(el); haptic(); }
    }, { passive: true });

    window.addEventListener("resize", park);
    window.addEventListener("orientationchange", () => setTimeout(park, 250));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") setTimeout(park, 60);
    });
  }

  /* iOS does not resize the page when the keyboard appears. It shrinks the
     *visual* viewport — the window you are looking through — and slides that
     window down the page to bring the focused field into it. The page keeps
     its full height, so the app now starts above what you can see, which
     reads as the whole thing having slid off the top of the screen.

     Chasing that with arithmetic on the keyboard's height was the wrong idea
     twice over: the page never moved, so there was no page scroll to undo,
     and shortening the app did not stop the window from sliding. What works
     is following the window itself — size the shell to what is visible and
     move it to wherever that visible region currently is. Then the bottom of
     the app is the top of the keyboard by construction. */
  /** True while a text field holds focus — i.e. while the keyboard is showing. */
  function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag !== "INPUT") return false;
    return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"]
      .includes(el.type);
  }

  /* 「キーボードでは起こり得ない縮み方」の境目。道具棚は高々100pxほど、
     キーボードは250px以上。数の役目はそれだけで、高さの計算には使いません。 */
  const KB_MIN = 180;

  function trackKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;   // Falls back to the CSS 100dvh, as before.
    const root = document.documentElement;
    const app = document.getElementById("app");
    if (!app) return;

    const fit = () => {
      /* 他のアプリから戻ったとき、タブ欄の下にキーボードひとつぶんの
         空白が残ることがありました。iOS はページを眠らせているあいだの
         visualViewport を必ずしも起こし直さないので、resize も scroll も
         飛ばないまま、**キーボードの高さに縮めたままのシェル**が残ります。

         そこで、あり得ない状態を一つだけ弾きます——
         **入力する場所が無いのに、キーボードの高さぶん縮んでいる。**
         キーボードは focus のあるところにしか出ないので、これは古い値です。

         「入力中でなければ可視を信じない」ではいけません。iOS Safari は
         上下の道具棚が引っ込むときにも可視を縮めます。あれは本当に
         見えていないので、信じないとタブ欄が棚の下に潜ります。
         道具棚は高々100px、キーボードは250px以上——間を取って180pxを
         境にします。キーボードの高さを計算に使うのではなく、
         「これはキーボードでは起こり得ない」を言うためだけの数です。 */
      const visible = Math.round(vv.height);
      const full = Math.round(window.innerHeight);
      const typing = isTyping();
      const stale = !typing && (full - visible) > KB_MIN;
      const shell = stale ? full : visible;
      app.style.height = shell + "px";

      /* Publish the same two numbers to CSS, for the things that are not the
         shell. A sheet is `position: fixed` and sized in dvh, and neither of
         those knows about a keyboard: the sheet stays as tall as the whole
         screen and its top half — where the price fields are — ends up above
         the top edge with no way to reach it.

         --vvh is what is actually visible. --kb is how much of the layout
         viewport the keyboard covers, which is zero on iOS in an installed
         app (it shrinks the layout viewport instead) and the keyboard's height
         on the browsers that do not. Anything anchored to the bottom of the
         window needs the second one; anything sized to the window needs the
         first. */
      root.style.setProperty("--vvh", shell + "px");
      // --kb も同じ値から。古い値を弾いたなら、空けるべき隙間もありません
      // （空けたままだと、下に貼る棒がその高さだけ浮きます）。
      root.style.setProperty("--kb", stale ? "0px" : Math.max(0, full - visible) + "px");

      /* Then put the document back. iOS scrolls it to reveal the focused
         field while the shell is still full height; once it is not, that
         scroll is left over and the app rides above the screen.

         A transform would line it up just as well, and did — but iOS paints
         the text caret from the element's *untransformed* position, so the
         cursor floated hundreds of pixels above the field it belonged to
         while the field itself looked correct. Scrolling moves the real
         geometry, and the caret comes along. */
      /* Anything past the parked pixel is the keyboard's doing and has to go;
         the pixel itself is the status-bar tap's and stays. */
      const rest = topTapOn() ? TOP_TAP_PARK : 0;
      if (window.scrollY > rest) window.scrollTo(0, rest);
      app.style.transform = "";

      // Whether the keyboard is up cannot be read from the viewport at all.
      // A reading from an iPhone with the keyboard fully open:
      //
      //   innerH 465   可視 h 465   offsetTop 414   pageTop 414
      //
      // iOS shrinks the layout viewport along with the visual one, so the gap
      // between them is zero at the exact moment the keyboard covers half the
      // screen. Every arithmetic test on those two numbers reports "no
      // keyboard", the tab bar stays up, and it pushes the input bar 94px
      // clear of the keyboard — which is the shift that kept coming back.
      //
      // A focused text field, on a phone, *is* the keyboard being up.
      root.classList.toggle("kb-open", typing);
    };

    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);

    // The keyboard slides in over a few hundred milliseconds and the numbers
    // keep moving the whole time; the last event does not always coincide with
    // the last position. Re-read across the animation rather than trusting one
    // moment of it.
    const settle = () => [60, 180, 360, 600].forEach((ms) => setTimeout(fit, ms));
    window.addEventListener("focusin", settle);
    window.addEventListener("focusout", settle);
    window.addEventListener("orientationchange", settle);

    /* Coming back from the app switcher is the other moment these numbers go
       stale. iOS suspends the page as it leaves, and on the way back it
       restores the window without necessarily firing a resize or a scroll on
       the visual viewport — so the shell keeps whatever height it was pinned
       to when it went away (the keyboard's, if a field had focus), and any
       document scroll iOS left behind stays applied. Both read on screen as
       the whole app sitting too high.

       So: measure again on the way back, immediately and then across the next
       second, because the window keeps moving for a while after the app is
       handed back. */
    /* The one moment none of these events cover: a focused field that is
       *removed* rather than blurred. Recording a price rebuilds the form the
       price was typed into, and WebKit fires no blur for a node that simply
       stops existing — so 「入力中」 stayed true with nothing left to type
       into, and the tab bar that hides behind it stayed hidden even after the
       sheet was closed. Anything that takes a field away can say so here. */
    KN.app.remeasure = () => { fit(); settle(); };

    /* And a net under that: every tap re-reads it. If whatever had focus is
       gone, this is where it gets noticed — one cheap measurement, on a
       gesture the user was making anyway. */
    document.addEventListener("click", () => setTimeout(fit, 0), true);

    const resume = () => { fit(); settle(); setTimeout(fit, 1000); };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resume();
    });
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);

    fit();
    dismissKeyboardOnSwipeDown();
  }

  /* The add bar has no "done" of its own: on iOS the only way out of it was
     the keyboard's own ✓, which is a small target in a corner and not where
     the hand already is. A downward swipe anywhere on the app — the same
     motion that puts a sheet away — now ends it too.
     A drag that starts inside the field is included on purpose: flicking the
     bar itself downwards is the most obvious way to push it out of sight. */
  /** 指の下（と、その上のどこか）に、まだ縦へ動かせる余地があるか。

      「下へ払ったらキーボードを閉じる」は、**動かせるものが何も無いとき**の
      約束です。読み返すために長いメモや一覧を動かしているのに閉じられると、
      読むことと打つことが両立しません。だから、その動きで実際に何かが
      スクロールできるなら、払いとは見なしません。 */
  function canScroll(node, dy) {
    let el = node;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const style = getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY)) {
          // 下へ払う（dy>0）＝上の内容を見にいく。まだ上に残りがあるか。
          const room = dy > 0 ? el.scrollTop : el.scrollHeight - el.clientHeight - el.scrollTop;
          if (room > 1) return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  /** いま、文字を選んでいる最中か。

      打った文をコピーしようとするとき、人は長押しで一語を選び、そのまま
      **つまみを下へ引いて**範囲を広げます。指の動きは「下へ払う」と
      そっくりで、放っておくとその途中でキーボードが落ちます。落ちれば
      画面が組み直され、選択も消えて、コピーにたどり着けません。

      選択が残っているあいだは、その指は払いではありません。 */
  function isSelectingText() {
    const a = document.activeElement;
    if (a && typeof a.selectionStart === "number"
        && a.selectionStart !== a.selectionEnd) return true;
    const sel = window.getSelection && window.getSelection();
    return !!(sel && sel.rangeCount && !sel.isCollapsed);
  }

  function dismissKeyboardOnSwipeDown() {
    const DROP = 34;   // far enough that a tap with a wobble is not a swipe
    const SIDE = 40;   // and straight enough not to be a swipe across a row
    const STIR = 6;    // これ以上動いて、はじめて「動きだした」
    /* 動きだすまでの間。払いは指を置いてすぐ走りますが、選択は一度
       押さえてから始まります（iOS の長押しはおよそ 0.5 秒）。じっと
       していた時間そのものが、二つを分けるいちばん確かな印です。 */
    const HOLD = 260;
    let y0 = 0, x0 = 0, t0 = 0, live = false, from = null, stirred = false, held = false;

    document.addEventListener("touchstart", (e) => {
      live = e.touches.length === 1 && document.documentElement.classList.contains("kb-open");
      if (!live) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      t0 = Date.now();
      stirred = false;
      held = false;
      from = e.target;
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      if (!live) return;
      const x = e.touches[0].clientX, dy = e.touches[0].clientY - y0;
      if (!stirred) {
        if (Math.abs(dy) < STIR && Math.abs(x - x0) < STIR) return;
        stirred = true;
        held = Date.now() - t0 >= HOLD;
      }
      // 押さえてから動きだしたなら、払いではなく、つまんで運んでいます。
      if (held) { live = false; return; }
      if (Math.abs(x - x0) > SIDE) { live = false; return; }
      if (dy < DROP) return;
      live = false;
      // 選んでいる最中なら、その指はコピーの途中です（上の isSelectingText）。
      if (isSelectingText()) return;
      /* 指の下にまだ動かせるものがあるなら、それは読み返しているのであって、
         キーボードを払っているのではありません。長いメモを読み直すたびに
         キーボードが落ちると、打ち直すのに毎回入り直すことになります。 */
      if (canScroll(from, dy)) return;
      const el = document.activeElement;
      if (el && el.blur) el.blur();
    }, { passive: true });

    document.addEventListener("touchend", () => { live = false; from = null; }, { passive: true });
  }

  /* Shopping history lives only in localStorage, which browsers are free to
     evict under storage pressure or after a long idle stretch — months of
     price records would go with it. Asking for persistent storage exempts the
     app from that sweep; installed PWAs are usually granted it silently. */
  function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persisted()
      .then((already) => (already ? true : navigator.storage.persist()))
      .catch(() => { /* not fatal — the app works either way */ });
  }

  function registerServiceWorker() {
    // The single-file build has no sw.js alongside it to register.
    if (window.KN_STANDALONE) return;
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;

    // A new worker calls skipWaiting() and takes over while this page is still
    // running the previous build's scripts. Reload once so the new code is
    // actually the code in use — otherwise the app sits a version behind until
    // it happens to be launched again, which on a home-screen app resumed from
    // the switcher may not be for days.
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      if (isBusy()) {
        // Don't pull the page out from under someone mid-entry; wait until
        // they put the app away.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") location.reload();
        }, { once: true });
        return;
      }
      location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // An installed app can stay open for days, so look for a new build
        // every time it comes back to the foreground rather than only at boot.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      }).catch((err) => {
        console.warn("service worker registration failed", err);
      });
    });
  }

  /* Screens off the tab bar — 価格・設定 — are opened by name from the screens
     that link to them, and hand the way back with them. */
  KN.app.showScreen = show;
  const OFF_BAR = ["prices", "settings"];
  KN.app.backScreen = () => {
    const to = drawerFrom.pop() || HOME_OF_DRAWER;
    goingBack = true;
    try { show(to); } finally { goingBack = false; }
  };

  /** どの**タブ**から潜ってきたか。設定の画面が、出すものを選ぶのに使います
      ——途中の引き出し（価格）ではなく、根っこのタブが知りたいので。 */
  KN.app.openedFrom = () =>
    [...drawerFrom].reverse().find((id) => !OFF_BAR.includes(id)) || HOME_OF_DRAWER;

  /** いま開いている画面。下に引いたときに、誰に聞けばいいかを知るため。 */
  KN.app.activeScreen = () => active;

  /* ---------------- ＋ の上に出る、行き先の選択 ----------------

     ＋ が二つ以上のことを始められる画面（daily・ダイエット）で使います。
     押すと**その場**——親指のすぐ上——に選択肢が立ち上がります。シートを
     開いて選ばせると、選ぶために一枚めくり、選んでからもう一枚めくることに
     なるので、一手ぶん遠くなります。

     dock は画面を切り替えるたびに組み直されるので、開いたままの札が別の
     画面へ持ち越されることはありません。 */
  function fabMenu(fab, items) {
    const dock = document.getElementById("dock");
    if (!dock || dock.querySelector(".fab-menu")) return closeFabMenu();

    const menu = node(html`<div class="fab-menu" role="menu"></div>`);
    items.forEach((it, i) => {
      const b = node(html`
        <button type="button" class="fab-menu-b" role="menuitem" style="--i:${String(i)}">
          <span class="fab-menu-label">${it.label}</span>
          <span class="fab-menu-ico">${icon(it.icon)}</span>
        </button>
      `);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        closeFabMenu();
        haptic();
        it.onPick();
      });
      menu.append(b);
    });
    dock.insertBefore(menu, dock.firstChild);
    dock.classList.add("is-menu");
    fab.classList.add("is-open");
    requestAnimationFrame(() => menu.classList.add("is-on"));

    /* 外を押したら閉じます。＋そのものは自分で開け閉めするので外します
       （ここで拾うと、閉じたそばから開き直します）。 */
    const away = (e) => { if (!e.target.closest(".fab-menu, .add-fab")) closeFabMenu(); };
    const esc = (e) => { if (e.key === "Escape") closeFabMenu(); };
    setTimeout(() => {
      document.addEventListener("pointerdown", away, true);
      document.addEventListener("keydown", esc);
    }, 0);
    closeFabMenu.teardown = () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }

  function closeFabMenu() {
    const dock = document.getElementById("dock");
    if (!dock) return;
    const menu = dock.querySelector(".fab-menu");
    const fab = dock.querySelector(".add-fab");
    if (fab) fab.classList.remove("is-open");
    dock.classList.remove("is-menu");
    if (closeFabMenu.teardown) { closeFabMenu.teardown(); closeFabMenu.teardown = null; }
    if (!menu) return;
    menu.classList.remove("is-on");
    // しまう動き（screens.css の .fab-menu-b、transform .24s）が終わってから。
    setTimeout(() => menu.remove(), 260);
  }

  KN.app.fabMenu = fabMenu;
  KN.app.closeFabMenu = closeFabMenu;

  /** True while the user is part-way through something a reload would lose. */
  function isBusy() {
    if (document.querySelector(".sheet")) return true;
    const el = document.activeElement;
    return !!(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.value);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
