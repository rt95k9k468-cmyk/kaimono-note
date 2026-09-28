/* =========================================================
   くらしノート — 時刻のお知らせ

   What this can and cannot do, said plainly, because the difference matters
   to whoever relies on it:

   It CAN put a notification on the phone the moment a todo's time comes round
   while the app is running, and it CAN tell you on the way in about the ones
   whose time passed while you were away.

   It CANNOT wake the app to ring at 19:30 while the app is closed. That takes
   a push from a server — iOS 16.4 onwards will deliver Web Push to an
   installed PWA, but something has to send it, and this app has no server and
   no account; it is a folder of files on GitHub Pages and a copy of your data
   on your own phone. There is no local scheduled-notification API on iOS
   either (no Notification Triggers), so a timer in the page dies with the
   page. Anything claiming otherwise here would be a promise the app breaks
   silently, at the exact moment you were counting on it.

   So: an alarm while you are holding the phone, and a catch-up when you pick
   it up. The settings row says as much rather than saying 「通知」 and letting
   it be assumed.

   追記（2026年9月27日、D1）：「something has to send it」は、もう建っている
   中継所に持たせました（js/bell.js・relay/worker.js の「鳴らす役」）。設定の
   「閉じていても鳴らす」を入れた人だけ。入れていない人には、上のとおりです。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;

  const hasAPI = () => typeof window !== "undefined" && "Notification" in window;

  /** Only where a notification could actually be shown. */
  function supported() {
    if (!hasAPI()) return false;
    // iOS only permits this from an installed app; asking in a Safari tab
    // throws or silently does nothing.
    return typeof navigator !== "undefined" && "serviceWorker" in navigator;
  }

  const enabled = () => supported() && store.get().settings.todoNotify === true;

  /** Switched on in the app, but the phone is not letting anything through. */
  function blocked() {
    if (!enabled()) return false;
    return hasAPI() && Notification.permission !== "granted";
  }

  function enable() {
    if (!supported()) return Promise.resolve(false);
    const ask = Notification.requestPermission
      ? Notification.requestPermission()
      : Promise.resolve(Notification.permission);
    return Promise.resolve(ask)
      .then((res) => {
        if (res !== "granted") return false;
        store.update((s) => { s.settings.todoNotify = true; });
        /* Anything already past at the moment it is switched on is history,
           not news — announcing four things from this morning as the switch
           flips is the app shouting about its own settings screen. */
        store.markAnnounced(store.todosToAnnounce().map((t) => t.id));
        return true;
      })
      .catch(() => false);
  }

  function disable() {
    store.update((s) => { s.settings.todoNotify = false; });
    /* 閉じていても鳴る（bell.js）はこの上に乗っているので、一緒に止めます。
       止めないと、切ったはずのお知らせが中継所から届き続けます。 */
    if (KN.bell && store.get().settings.todoBell === true) KN.bell.stop();
  }

  /* ---------------- showing one ---------------- */

  /* iOS shows nothing for `new Notification()` in a standalone app; it wants
     the service worker's registration to do it. Desktop browsers take either,
     so the registration is tried first and the constructor is the fallback. */
  /* due … その時刻の用事の id。押したら、その用事の紙が開きます（R3・js/due-sheet.js）。 */
  function show(title, body, tag, due) {
    const opts = {
      body,
      tag: tag || "kn-todo",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      lang: "ja",
      renotify: true,
      data: { screen: "todo", due: due || [] },
    };
    const viaSW = navigator.serviceWorker && navigator.serviceWorker.ready;
    if (viaSW) {
      return viaSW
        .then((reg) => reg.showNotification(title, opts))
        .catch(() => fallback(title, opts));
    }
    return Promise.resolve(fallback(title, opts));
  }

  function fallback(title, opts) {
    try { new Notification(title, opts); } catch (_) { /* nothing more to try */ }
  }

  /* ---------------- the round ---------------- */

  /**
   * Say whatever has come round since the last look, and remember saying it.
   *
   * One notification however many are due: four separate banners for 19:30 is
   * four things to dismiss for one moment in the day.
   */
  function tick() {
    if (!enabled() || blocked()) return Promise.resolve(0);
    const due = store.todosToAnnounce();
    if (!due.length) return Promise.resolve(0);

    const first = due[0];
    const title = due.length === 1
      ? `${first.time} ${first.title}`
      : `${first.time} ${first.title} ほか${due.length - 1}件`;
    const body = due.length === 1
      ? (first.memo || "やることの時刻です")
      : due.map((t) => `${t.time} ${t.title}`).join("\n");

    store.markAnnounced(due.map((t) => t.id));
    // 閉じていても鳴る（bell.js）の側に、もう鳴らしたと知らせる。
    if (KN.bell) KN.bell.noteRung(due);
    return show(title, body, "kn-todo-time", due.map((t) => t.id)).then(() => due.length, () => due.length);
  }

  /* ---------------- keeping watch ---------------- */

  let timer = null;

  function init() {
    if (!supported()) return;

    /* Once a minute is as fine as the clock the times are written in. It is
       also what makes the badge correct: 19:30 arriving has to change the
       number on the icon whether or not anyone is looking at the screen. */
    /* 閉じているあいだに Service Worker が鳴らした回を先に受け取ってから
       （bell.js の absorb）。でないと、開いた瞬間に同じものをもう一度鳴らします。 */
    const beat = () => {
      const got = KN.bell ? KN.bell.absorb().catch(() => 0) : Promise.resolve(0);
      got.then(tick);
      if (KN.app.onMinute) KN.app.onMinute();
    };
    if (timer) clearInterval(timer);
    timer = setInterval(beat, 30000);

    /* And on the way back in — this is the path that actually carries most of
       them, since the app is usually not running at 19:30. */
    const wake = () => { if (document.visibilityState !== "hidden") beat(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    wake();
  }

  KN.notify = { supported, enabled, blocked, enable, disable, tick, init };
})();
