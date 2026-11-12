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
  /* 帯は四つ。**そのうち一つだけが、ふた面を持ちます。**

     daily・やること・買うもの（⇄ 価格）・ダイエット。

     daily と やること は、いっとき一つの帯のふた面にしていました
     （「今日」の表と裏）。**戻しました。** 二つとも毎日開くもので、
     しかも行き来する回数がいちばん多い組です。ふた面は「もう一度押す」
     という一手を毎回はさむので、よく行き来する二つに使うと、そこだけ
     手数が増えます。ふた面が向いているのは、**たまに開くほう**を表の
     裏へしまう組——買うものと価格が、まさにそれです。

     四つめの席は設定が使っていました。設定は**場所ではありません**
     ——毎日そこへ「行く」ものではなく、何かを直したいときに開くもの。
     各タブの右上の歯車へ戻して、席は daily に譲ります。 */
  const TABS = [
    { id: "archive", label: "daily", icon: "book" },
    /* **ノートは五つめの席**（2026年10月11日まで daily の紙の裏。docs/notes.md）。
       裏へ回る一手が、毎日書くものには重かったので。 */
    { id: "notes", label: "notes", icon: "notes" },
    { id: "todo", label: "tasks", icon: "checklist" },
    /* **価格はタブではありません。** 買うものの紙の後ろに敷いてある一枚で、
       そこへは、買うものに居るところでこの席を押して、紙を下げて行きます
       （2026年9月28日まで掴み手を引いていた。いまの掴み手は暦のもの）。だから帯には席を持たず、価格を見て
       いるあいだも帯が言うのは「買うもの」——いま居るのは買うもののタブで、
       その紙を下げているだけなので。`holds` は「この席が受け持つ画面」。 */
    { id: "list", holds: ["prices"], label: "shopping", icon: "cart" },
    /* ダイエット → health。絵も「健康・人」を連想するものへ
       （`heart`、Phosphor Regular）。手描きの `scale`（体重計）だけが
       線の絵で他の三つから浮いていたので、これで一族も揃います。 */
    { id: "diet", label: "health", icon: "heart" },
  ];

  /* 裏面の名前と絵。表と同じ形で持っておくと、塗るときに分岐が要りません。 */
  const FACES = {
    todo:     { label: "tasks",    icon: "checklist" },
    archive:  { label: "daily",    icon: "book" },
    list:     { label: "shopping", icon: "cart" },
    prices:   { label: "prices",   icon: "tag" },
    notes:    { label: "notes",    icon: "notes" },
    diet:     { label: "health",   icon: "heart" },
    /* 席の名前は英語で通します。ここだけ「設定」で、設定の画面では
       「shopping」の下に「一般」が並ぶ——**同じ系列の中で、そこだけ
       言葉が変わる**のが混ざって見えていた正体でした。 */
    settings: { label: "Settings", icon: "gear" },
  };

  /** その席が、いまの画面を受け持っているか。 */
  /* 真か偽だけを返す（holds の無い席で undefined を返し、aria-selected="undefined"＝「選べない」と読まれていた）。 */
  const holdsId = (t, id) => t.id === id || (!!t.holds && t.holds.indexOf(id) >= 0);

  /* 引き出し（価格・設定）を、どこから開けたか。**一つの変数ではなく積み木**
     です——買うもの → 価格 → 設定 と潜れるようになったので、「戻る」は
     一段ずつ戻らなければいけません。一つの変数だと、設定から戻ったときに
     価格ではなく買うものへ飛ぶか、価格と設定のあいだで往復します。

     タブへ戻ったら、積んだものは捨てます（タブは根っこなので）。 */
  const drawerFrom = [];
  /* 「戻る」で開くときは積みません。積むと、戻った先からまた戻れなくなります。 */
  let goingBack = false;
  const HOME_OF_DRAWER = "list";

  /* 立ち上げたときは tasks を出します。daily は鍵（js/lock.js）がかかるので、
     daily から始めると、開くたびに Face ID が出てしまうため（2026年10月3日）。
     daily は帯の一つめのまま、左端の席を押せば開きます。 */
  const HOME = "todo";

  let active = HOME;
  const mounted = new Set();

  /* ---------------- 紙の中で打っているあいだ、後ろは組み直さない ----------------

     日記の紙は打つあいだ 3 秒おきに残し（store を書く）、品物の紙は数を打つと残します。
     そのたびに store の subscribe が**後ろの画面**を組み直していて、打った字が一拍
     止まっていました（daily で 約80ms。1年ぶんの記録・CPU 1倍）。後ろは紙に隠れて
     いるので、打ち終えた——欄を出た・紙を閉じた——ところで一度だけ組み直します
     （docs/motion.md の「押した一拍を軽く」）。席を移れば show() が組むので、そこで忘れます。 */
  let behindStale = false;
  let preparing = false;   // show() が組む前の支度をしているあいだ（下の show）
  function typingInSheet() {
    const a = document.activeElement;
    return !!(a && a.closest && isTyping() && a.closest("#sheet-root .sheet"));
  }
  function catchUpBehind() {
    if (!behindStale || typingInSheet()) return;
    behindStale = false;
    if (KN.screens[active]) KN.screens[active].render();
  }

  /* ---------------- theme ---------------- */

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
  }
  KN.app.applyTheme = applyTheme;

  /* 基調色（base.css の「基調色」）。札は data-accent、既定の朱には付けない。装い「モダン」は自分の主色（墨）を
     持つので、そのあいだは札を外す。「季節」は今日の節気（春分から 0〜23）を data-sekki に——日が替わったら
     onMinute が付け直す。 */
  function applyAccent(accent) {
    const root = document.documentElement;
    const known = (KN.store && KN.store.ACCENTS) || [];
    const ok = known.some((a) => a.id === accent);
    const on = ok && accent !== "orange" && root.getAttribute("data-attire") !== "modern";
    if (on) root.setAttribute("data-accent", accent);
    else root.removeAttribute("data-accent");
    const s = on && accent === "season" && KN.season ? KN.season.of(KN.util.todayKey()) : null;
    if (s) root.setAttribute("data-sekki", String(Math.floor(s.k / 3)));
    else root.removeAttribute("data-sekki");

    /* アイコンの地も基調色に合わせます（icons/accent/）。タブの絵はすぐ変わり、
       ホーム画面の絵は「ホーム画面に追加」した時点の色で焼きつきます——
       追加済みの絵を後から塗り替える手段は、ウェブアプリには無いからです。 */
    const id = ok && accent !== "season" ? accent : "orange";
    const fav = document.querySelector('link[rel="icon"]');
    const touch = document.querySelector('link[rel="apple-touch-icon"]');
    /* 一枚にまとめた版（build-standalone.js）は絵を data: で抱えていて、
       icons/ が隣に無いので触りません。 */
    if (fav && fav.getAttribute("href").startsWith("data:")) return;
    if (fav) fav.href = id === "orange" ? "icons/icon.svg" : `icons/accent/${id}.svg`;
    if (touch) touch.href = id === "orange" ? "icons/apple-touch-icon.png" : `icons/accent/${id}-180.png`;
  }
  KN.app.applyAccent = applyAccent;

  /* 文字の大きさ（B11）。字の大きさはどれも --fs-k を掛けて書いてあるので
     （base.css）、倍率を一つ書けば画面ぜんぶの字がそろって変わります。
     「端末に合わせる」は iPhone の「文字サイズ」を読みます——Safari は
     -apple-system-body に端末の文字サイズを載せるので、その大きさを素の
     17px で割る。ほかのブラウザはこの書体名を知らず、17px のままなので 1。

     上下に枠を付けます（0.9〜1.3）。iPhone の文字サイズは「さらに大きな
     文字」で3倍まで行くので、そのまま掛けると一行に字が入りきりません。 */
  const TEXT_K = { std: 1, l: 1.12, xl: 1.25 };
  function deviceTextK() {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;font-size:17px;font:-apple-system-body";
    probe.textContent = "あ";
    document.body.append(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize) || 17;
    probe.remove();
    return Math.min(1.3, Math.max(0.9, px / 17));
  }
  function applyTextSize(size) {
    const k = size === "auto" ? deviceTextK() : (TEXT_K[size] || 1);
    const root = document.documentElement;
    if (k === 1) root.style.removeProperty("--fs-k");
    else root.style.setProperty("--fs-k", String(Math.round(k * 100) / 100));
  }
  KN.app.applyTextSize = applyTextSize;

  /* 書体（ゴシック・丸ゴ・明朝。base.css の「書体」の規則）。札は data-font。
     既定のゴシックには札を付けません（基調色と同じ）。 */
  function applyFont(font) {
    const root = document.documentElement;
    if (font === "maru" || font === "mincho") root.setAttribute("data-font", font);
    else root.removeAttribute("data-font");
  }
  KN.app.applyFont = applyFont;

  /* 装いは二つ（docs/redesign.md 4節）：手帳（札なし）とモダン（data-attire="modern"）。替わるのは札の組だけ。
     前の五つの値は**消さずに読み替える**——朱・臙脂・季節は手帳の基調色へ、いま・磨きは手帳の既定へ（lookOf）。
     見出しの書体（settings.headFont）は data-head="same" のとき本文と同じ。既定の明朝には札を付けない。 */
  const ATTIRE_ACCENT = { "washi-shu": "orange", "washi-enji": "rose", season: "season" };
  function lookOf(settings) {
    const s = settings || {};
    return { look: s.attire === "modern" ? "modern" : "techo", accent: ATTIRE_ACCENT[s.attire] || s.accent || "orange" };
  }
  KN.app.lookOf = lookOf;
  function applyLook(settings) {
    const s = settings || store.get().settings;
    const root = document.documentElement;
    const { look, accent } = lookOf(s);
    const was = root.getAttribute("data-attire");
    if (look === "modern") root.setAttribute("data-attire", "modern");
    else root.removeAttribute("data-attire");
    if (was !== root.getAttribute("data-attire") && KN.seasonArt) KN.seasonArt.reapply();   // 候の絵の出どころは装いで替わる
    if (s.headFont === "same") root.setAttribute("data-head", "same");
    else root.removeAttribute("data-head");
    applyAccent(accent);
  }
  KN.app.applyLook = applyLook;
  /* 前からの呼び名（道具・試験）。 */
  function applyAttire() { applyLook(); }
  KN.app.applyAttire = applyAttire;

  /* ---------------- tabs ---------------- */

  /* 左の列の小さな暦（広い幅）：日を選ぶ用。字のまま・印は付けない（docs/redesign.md 1節・5節）。出すのは見ている日の月
     （‹ › でめくれる）。見ている日は帯の題（`.topbar-dayrow` の data-day-key）から——席ごとに訊き回らない。 */
  const WIDE = window.matchMedia ? window.matchMedia("(min-width: 840px)") : null;
  function railMini() {
    const U = KN.util;
    const el = node(html`
      <div class="rail-mini">
        <div class="rail-mini-h"><b class="js-ym"></b>
          <button type="button" class="js-prev" aria-label="前の月">${icon("chevron-left")}</button>
          <button type="button" class="js-next" aria-label="次の月">${icon("chevron")}</button></div>
        <div class="rail-mini-g"></div>
      </div>
    `);
    const grid = el.querySelector(".rail-mini-g");
    let ym = null;          // めくって出している月（null＝見ている日の月）
    let sig = "";
    const row = () => document.querySelector("#head .topbar-dayrow");
    const cur = () => { const r = row(); return (r && r.dataset.dayKey) || U.todayKey(); };
    function paint() {
      if (!WIDE || !WIDE.matches) return;
      const here = cur(), today = U.todayKey();
      const [y, m] = (ym || here.slice(0, 7)).split("-").map(Number);
      const now = `${y}-${m}|${here}|${today}`;
      if (now === sig) return;
      sig = now;
      el.querySelector(".js-ym").textContent = `${y}年 ${m}月`;
      const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      const weeks = Math.ceil((lead + new Date(y, m, 0).getDate()) / 7);
      const out = ["月", "火", "水", "木", "金", "土", "日"].map((w) => { const i = document.createElement("i"); i.textContent = w; return i; });
      for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(y, m - 1, 1 - lead + i), key = U.dayKey(d);
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.day = key;
        b.textContent = String(d.getDate());
        b.className = (d.getMonth() !== m - 1 ? "is-out " : "") + (key === today ? "is-today " : "") + (key === here ? "is-here" : "");
        if (key === here) b.setAttribute("aria-current", "date");
        /* Tab で巡るのは見ている日の一つだけ（四十二の升を一つずつ止まらせない）。日を移すのは ←→（keys.js）。 */
        else b.tabIndex = -1;
        out.push(b);
      }
      /* めくった先に見ている日が無ければ、その月の一日を Tab の止まり先に。 */
      if (!out.some((b) => b.tabIndex === 0 && b.dataset && b.dataset.day)) {
        const first = out.find((b) => b.dataset && b.dataset.day && !b.classList.contains("is-out"));
        if (first) first.tabIndex = 0;
      }
      grid.replaceChildren(...out);
    }
    const turn = (d) => {
      const [y, m] = (ym || cur().slice(0, 7)).split("-").map(Number);
      const n = new Date(y, m - 1 + d, 1);
      ym = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
      haptic();
      paint();
    };
    el.querySelector(".js-prev").addEventListener("click", () => turn(-1));
    el.querySelector(".js-next").addEventListener("click", () => turn(1));
    grid.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-day]");
      if (!b) return;
      haptic();
      ym = null;
      const key = b.dataset.day, scr = KN.screens[active];
      /* その席の「その日へ」。日を持たない席・口の無い席は、共通の日に置いて組み直させる（入る画面が引き取るのと同じ道）。 */
      if (active === "list" || active === "prices") KN.head.shopGo(key);
      else if (scr && scr.goDay) scr.goDay(key);
      else { U.dayShare.set(key); if (scr && scr.day) scr.render(); }
      paint();
    });
    /* 見ている日が変わったら（払う・暦・今日へ）塗り直す。題が塗られるたびに札が書かれる（util の paintDayTitleInto）。 */
    queueMicrotask(() => {
      const r = row();
      if (r) new MutationObserver(() => { ym = null; paint(); }).observe(r, { attributes: true, attributeFilter: ["data-day-key"] });
      if (WIDE && WIDE.addEventListener) WIDE.addEventListener("change", paint);
      paint();
    });
    return el;
  }

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
      /* 価格を見ているところで「買うもの」を押したら、**紙を戻します**
         ——差し替えるのではなく。あの二つは重なった二枚なので、行き来は
         紙の動きで見えていないと、どちらが前に居るのか分からなくなります。

         **買うものを見ているところで押したら、紙を下げて価格へ**
         （2026年9月28日から）。前は掴み手を下へ引くのが価格への道でしたが、
         掴み手はほかのタブと同じく暦を開くものになったので、価格への入口は
         この席が受け持ちます。動きは引いたときと同じ——紙が下がって後ろの
         地が出ます。戻るのは、もう一度押すか、留まった頭を上へ引くか。 */
      btn.addEventListener("click", () => {
        if (t.holds && t.holds.indexOf(active) >= 0) faceTo(0, t.id);
        else if (t.holds && active === t.id) faceTo(1, t.id);
        /* いま居る席をもう一度押したら、その画面に言います（やること：
           時間割 ⇄ 一日の道。docs/todo-timeline.md）。断られたら今までどおり。 */
        else if (active === t.id && KN.screens[t.id].again && KN.screens[t.id].again()) { /* 画面が受けた */ }
        else show(t.id);
        /* 押した席の絵が、一度だけその絵らしく応える（base.css の「押した席の
           絵が応える」）。いま居る席をもう一度押しても応えます——押したことへの
           返事なので、行き先が変わったかどうかとは別。 */
        KN.motion.fire("poke", btn.querySelector(".tab-ico-face"));
      });
      bar.append(btn);
    });

    /* 左の列（広い幅。docs/redesign.md 5節）：印と名前・さがす・席・小さな暦・settings。電話では CSS が隠す。
       さがすは帯の虫めがねと同じ口（その席のさがす。⌘K・Ctrl+K も同じ）。 */
    const find = node(html`<button type="button" class="rail-find">${icon("search")}<span>さがす</span><kbd>${/Mac|iP(hone|ad|od)/.test(navigator.platform || "") ? "⌘K" : "Ctrl K"}</kbd></button>`);
    find.addEventListener("click", () => { const b = document.querySelector("#head .js-search-btn"); if (b) b.click(); });
    bar.prepend(node(html`<div class="rail-brand" aria-hidden="true"><img src="icons/icon.svg" alt="" width="34" height="34"><b>くらしノート</b></div>`), find);
    const set = node(html`<button type="button" class="rail-set">${icon("gear")}<span>settings</span></button>`);
    set.addEventListener("click", () => { if (active !== "settings") KN.app.showScreen("settings"); });
    bar.append(railMini(), set);

    /* いま居る席の印。**席ごとの丸ではなく、席から席へ滑る一枚のレンズ**
       です（`js/tab-lens.js`）。ここでは置くだけ——どこへ滑るかは
       `paintTabs` が言います。縁の屈折の**あと**に入ります（屈折に
       ぼかされないように。tab-lens.js の mount）。 */
    if (KN.tabLens) KN.tabLens.mount(bar);

    /* ---- 押しているあいだ、その席がふくらむ ----

       絵と速さは base.css（「押しているあいだ、その席がふくらむ」）。
       ここが持つのは**指の居場所**だけです。

       **押されているのは状態で、出来事ではありません。** 前はここで一度
       きりのアニメーションを焚いていて（`is-dimpled` を付け外しして
       `tab-dimple` を巻き戻す、という書き方そのものが、時計をこちらが
       持っている証拠でした）、だから長く押しても 0.46秒で終わっていました。
       いまは押したら付け、離したら外す——**時計は指が持ちます。**

       見張りは `document` です。`pointerdown` は帯で拾えますが、離す指は
       帯の外に居ることがあります（マウスで押したまま外へ出る、など）。
       帯だけで見ていると `pointerup` が降りてこず、**膨らんだまま戻らない**
       席が残ります（`reorder.js` / `day-swipe.js` と同じ理由・同じ手）。

       **指が席から外れたら、いったん戻します。離さずに戻ってくれば、また
       膨らみます。** 押している席の外で離してもタブは変わらない（click は
       押したところと離したところが同じでなければ出ない）ので、膨らんだまま
       だと「ここへ行く」という嘘になります。行き先を言うのは指の居場所で、
       最初に触れた場所ではありません。 */
    const hold = node(html`<i class="tab-hold" aria-hidden="true"></i>`);
    bar.append(hold);

    /* 光は指の下へ。座標は帯の中の位置で、ボタンの真ん中ではありません
       ——「押したところ」と言うなら、指の下から出ないと嘘になります。 */
    function aimHold(e) {
      const r = hold.getBoundingClientRect();
      if (!r.width) return;
      hold.style.setProperty("--gx", `${(e.clientX - r.left).toFixed(1)}px`);
      hold.style.setProperty("--gy", `${(e.clientY - r.top).toFixed(1)}px`);
    }

    let heldTab = null;
    /** 押している席を、膨らませる／戻す。光も一緒（同じ一つの状態なので）。 */
    function paintHeld(on) {
      if (heldTab) heldTab.classList.toggle("is-held", on);
      hold.classList.toggle("is-on", on);
      /* 二段目の膨らみ（`--hold-c`）は、いま居る席では**レンズ**が受け
         持ちます——席の印がそこへ移ったので。押しているのが別の席なら、
         レンズは動きません（そこはまだ行き先ではないので）。 */
      if (KN.tabLens) KN.tabLens.hold(on ? heldTab : null);
    }
    /** 指がその席の上にいるか。箱で見ます（掴んだ指は捕まっているので、
        `pointermove` の target は動かしても押した席のままです）。 */
    function overTab(el, e) {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right
          && e.clientY >= r.top && e.clientY <= r.bottom;
    }

    bar.addEventListener("pointerdown", (e) => {
      const t = e.target && e.target.closest ? e.target.closest(".tab") : null;
      if (!t) return;
      paintHeld(false);
      heldTab = t;
      aimHold(e);
      paintHeld(true);
    });
    document.addEventListener("pointermove", (e) => {
      if (!heldTab) return;
      const on = overTab(heldTab, e);
      paintHeld(on);
      if (on) aimHold(e);
    }, { passive: true });
    /* 離した・取り消された（iOS の長押しメニュー、電話の着信…）。どちらも
       「指がもう居ない」なので、同じところへ帰します。 */
    const letGo = () => { if (!heldTab) return; paintHeld(false); heldTab = null; };
    document.addEventListener("pointerup", letGo);
    document.addEventListener("pointercancel", letGo);

    paintTabs();
  }

  /* 席の幅が変わったら、いま居る席の印（レンズ）を置きなおす（回転・キーボード）。帯・＋・一言は塗った面なので、
     後ろの明るさも鏡面の光も見張らない（2026年11月10日、docs/redesign.md 2節。前は送るたびに帯の裏を読んでいた）。 */
  function watchGlass() {
    window.addEventListener("resize", () => { if (KN.tabLens) KN.tabLens.sync(); });
  }

  function paintTabs() {
    /* 窓の題（パソコンのタスクバー・タブ）にも、いま居る席の名前（design-review 9節の W4）。 */
    const title = FACES[active] ? `${FACES[active].label} — くらしノート` : "くらしノート";
    if (document.title !== title) document.title = title;
    let hereBtn = null;
    TABS.forEach((t) => {
      const btn = document.querySelector(`.tab[data-tab="${t.id}"]`);
      if (!btn) return;
      const here = holdsId(t, active);
      if (here) hereBtn = btn;
      /* 帯が言うのは**その席の名前**です。価格を見ているあいだも「買うもの」
         のまま——いま居るのは買うもののタブで、その紙を下げているだけ
         なので。帯はいる場所を言うもので、紙の位置を言うものではありません。 */
      const face = FACES[t.id];
      btn.setAttribute("aria-selected", String(here));
      btn.querySelector(".tab-ico-face").classList.add("is-on");
      const ico = btn.querySelector(".tab-ico-face");
      if (ico.dataset.sig !== face.icon) {
        ico.dataset.sig = face.icon;
        ico.innerHTML = "";
        ico.append(node(html`<span>${icon(face.icon)}</span>`).firstChild);
      }
      const label = btn.querySelector(".tab-label");
      if (label.dataset.sig !== face.label) {
        label.dataset.sig = face.label;
        label.textContent = face.label;
      }
    });

    /* 数えるのは、**やると言ったもの**だけです。絵の上でもタブの上でも
       同じ決めごとにします。

       いちど「タブは押した先の件数を言うだけだから、★の無いものも数えて
       いい」と考えて、未購入の全部を数えるようにしました。**間違いでした。**
       ★を付けていないものは「今回でも今日でもないが、近いうちに買うもの」
       に過ぎず、いま片づける対象ではありません。数を出せば、片づける対象に
       見えます。見える場所が違っても、数が持つ意味は変わりません。 */
    paintAppBadge();

    /* 数は、その面が出ているときだけ。価格を見ているのに「買うもの3件」と
       出ていると、いま見ている画面の数だと読まれます。 */
    paintTabBadge("list", active === "prices" ? 0 : tripCount());
    paintTabBadge("todo", todoBadge());
    /* ダイエットに数は出しません。「残り◯件」にあたるものが無いからです——
       体重を量っていない日を「1件」と数えるのは催促であって、記録ではない。
       daily も同じで、書いていない日は「0件」ではなく、ただの休みです。 */

    /* いま居る席の印を、そこへ滑らせます。**席が変わっていなければ
       `to()` は動きません**（同じ席を渡されたら置きなおすだけ）ので、
       組み直しのたびに呼んでも、滑りが焚き直されることはありません。

       写しを取るのはこの**あと**でないといけません——`to()` が滑り出す
       瞬間に `snap()` するので、絵と名前が新しくなる前に呼ぶと、
       レンズの中だけ前の行が残ります。 */
    if (KN.tabLens) {
      if (hereBtn) KN.tabLens.to(hereBtn);
      // 設定のように席を持たない画面では、印を伏せます（tab-lens.js の clear）。
      else KN.tabLens.clear();
    }
  }

  /* 画面の中で起きたことに、下の帯の席の絵が応える（docs/tabbar.md の「押した席の
     絵が応える」）。買った・★を付けた → カートが押し出される、やることを済ませた →
     チェックリストが跳ねる。**行き先の席が受け止めた**、を言うためのもので、帯を
     押したときと同じ動き（絵の名前ごと）を使う。 */
  KN.app.pokeTab = (tabId) => {
    const face = document.querySelector(`.tab[data-tab="${tabId}"] .tab-ico-face`);
    if (face) KN.motion.fire("poke", face);
  };

  function paintTabBadge(tabId, count) {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (!tab) return;
    const existing = tab.querySelector(".tab-badge");
    if (count > 0) {
      const text = count > 99 ? "99+" : String(count);
      if (existing) {
        /* **数が変わったときだけ**、一度だけ持ち上げます（`--m-number`）。
           出来事の名前は先に用意してありましたが、**どこからも呼ばれて
           いませんでした**——数が変わるのは画面のあちこちで起きますが、
           いちばん人が見ているのはここ（片づけると減る札）です。
           組み直しのたびに鳴らすと、何も変わっていない拍まで動きます。 */
        if (existing.textContent !== text) {
          existing.textContent = text;
          KN.motion.fire("number", existing);
        }
      } else tab.append(node(html`<span class="tab-badge">${text}</span>`));
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

  /* タブバーとホーム画面アイコンは、同じ「やること」の数を言うので、
     同じ基準（todosDue、時刻まで見る）で数えます。以前はタブバーだけ
     時刻を見ずに「今日の日付」だけで数えていて、二つの数が食い違って
     いました。 */
  const todoBadge = () => store.todosDue().length;

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


  /* ---------------- 画面は、帯と同じ向きへ流れる ----------------

     daily → やること と押したなら、画面も左へ流れて次の面が右から入って
     きます。どちらへ動いたかが、動きそのもので分かるように。

     並びは**下の帯の並び**です。買うもの と 価格 は同じ一つのタブの表と裏
     なので、同じ番号を持たせます——ふた面をめくるのは横へ動くことでは
     ないので、そこは流しません（これまでどおりの入りかた）。 */
  const SLIDE = { archive: 0, notes: 1, todo: 2, list: 3, prices: 3.5, diet: 4, settings: 5 };   // 価格は買うものの右の面（リスト｜価格）
  /* 流れ終わった面を片づけるまでの待ち時間。**CSS から読みます**
     ——動かしているのは base.css の `--m-nav`（席を移る）と `--m-push`
     （引き出しが押しのける）で、ここに数字を持つと二重帳簿になります。
     押しのけのほうが長いので、そのときはそちらを待ちます。 */
  const slideMs = (push) => KN.motion.ms(push ? "--m-push" : "--m-nav") + 40;
  let slideT = null;

  /* **タブの流れと、引き出しの押しのけは別のもの。**

     タブどうし（daily → やること）は、横に並んだ席を移るので、二枚が同じ
     ぶんだけ流れます（carousel）。引き出し（設定）は席ではなく**上に重なる
     一枚**なので、iOS の設定と同じ押しのけ——入る面は 100% → 0、下の面は
     0 → -28% しか動かず、入る面の左端に影が付きます。同じだけ動かすと
     二枚が並んで滑っているように見えて、「上に乗った」ことが伝わりません。 */
  const pushy = (a, b) => OFF_BAR.includes(a) || OFF_BAR.includes(b);

  function slideDir(from, to) {
    if (!from || from === to) return 0;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    const a = SLIDE[from], b = SLIDE[to];
    if (a == null || b == null || a === b) return 0;
    return b > a ? 1 : -1;
  }

  /* ---------------- 買うもの ⇄ 価格（リスト｜価格） ----------------

     二枚は一つの席の二つの面。行き来は紙の頭の リスト｜価格 の札（下の faceSeg）と、席の二度押し。
     前は買うものの紙を下げて後ろの地（価格）を出し、頭だけを帯の上に留めた——暦が紙の上に来て「紙の後ろ」が
     無くなったので、ほかの移りと同じ一拍で入れ替える（docs/redesign.md 5節。紙は引かない）。 */
  const PAIRS = [
    { front: "list", back: "prices" },
  ];
  const pairOf = (id) => PAIRS.find((x) => x.front === id || x.back === id) || null;
  /* 1280px から二枚を左右に並べていた（desk の段6）のは R5 で外した——広い幅の買うものは、左にリスト・右に選んだ品の
     値段（docs/redesign.md R5）。 */

  /** いまどちらの面か（0＝買うもの、1＝価格）。 */
  function faceAt(id) {
    const pr = pairOf(id || active);
    return pr && active === pr.back ? 1 : 0;
  }
  /** その面へ（0＝買うもの、1＝価格）。 */
  function faceTo(p, id) {
    const pr = pairOf(id || active);
    if (!pr) return;
    const to = p > 0.5 ? pr.back : pr.front;
    if (to === active) return;
    haptic();
    show(to);
  }
  KN.app.faceTo = faceTo;
  KN.app.faceAt = faceAt;
  /** 紙の頭の リスト｜価格 の札。二枚とも自分の頭に置く（並べているあいだは CSS が隠す）。 */
  KN.app.faceSeg = function faceSeg(id) {
    const pr = pairOf(id);
    const el = node(html`
      <div class="wk-faces face-seg">
        <div class="seg" role="group" aria-label="面">
          <button type="button" class="seg-btn" data-v="0" aria-pressed="${String(id === pr.front)}">リスト</button>
          <button type="button" class="seg-btn" data-v="1" aria-pressed="${String(id === pr.back)}">価格</button>
        </div>
      </div>
    `);
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".seg-btn");
      if (b) faceTo(+b.dataset.v, id);
    });
    return el;
  };

  /** その画面で、実際に**送っている器**はどれか。

      やること・daily・買うものでは、送るのは `.screen` ではなく**紙**
      （`.tl-sheet`）です。丸角と掴み手を持つ外枠は動かず、中身だけがその中を
      流れる——外枠が器の中の一員だったころは、下へ送ると紙の頭が上へ流れて
      いって、丸角ごと画面の外へ出ていました（実測：送り 270px で紙の上端が
      -140px）。

      ダイエット（紙が `is-bare` で丸角を持たない）・価格・設定は、これまで
      どおり画面そのものが送ります。**どちらかを決め打ちにしないこと**
      ——`overflow` を見て、実際に送っているほうを返します。 */
  /* 紙が送る器かどうかは、紙ごとに一度だけ読みます。決めているのは紙の居る画面
     （screens.css の `#screen-todo .tl-sheet` ほか）で、紙は組み直しのたびに作り直され、
     ほかの画面へ移ることはありません。毎回 `getComputedStyle` で読むと、組み直した直後
     （席を移った・済ませた）にそこで様式を計算させます（1回 9〜17ms。送るたびの帯の
     ガラスもここを通る）。 */
  const sheetScrolls = new WeakMap();
  KN.app.scrollerOf = function scrollerOf(el) {
    if (!el) return null;
    /* 設定は紙の重なり（.set-layer）で、送るのはいちばん上の一枚です。
       画面そのものは `overflow: hidden` なので、ここを教えないと
       pull-refresh が「上端にも下端にも同時に居る」と読みます。 */
    const layer = el.querySelector(".set-layer:last-child .set-scroll");
    if (layer) return layer;
    const sheet = el.querySelector(".tl-sheet");
    if (sheet) {
      let scrolls = sheetScrolls.get(sheet);
      if (scrolls === undefined && sheet.isConnected) {
        const ov = getComputedStyle(sheet).overflowY;
        scrolls = ov === "auto" || ov === "scroll";
        sheetScrolls.set(sheet, scrolls);
      }
      if (scrolls) return sheet;
    }
    return el;
  };
  const scrollerOf = KN.app.scrollerOf;

  function show(id, face) {
    if (!KN.screens[id]) return;
    /* 出ていく暦の印の写しは、何も書き換えないうちに（js/head.js の snapFor）。 */
    if (KN.head.snapFor) KN.head.snapFor(id);
    if (!goingBack) {
      if (OFF_BAR.includes(id)) { if (active !== id) drawerFrom.push(active); }
      else drawerFrom.length = 0;
    }
    /* 左端を引くために出していた一枚が残っていたら、ここで印を落とします
       ——指で戻りきった直後にここへ来るので、残すと「後ろの一枚」のまま
       次の画面に居座ります。 */
    document.querySelectorAll(".screen.is-under").forEach((s) => {
      s.classList.remove("is-under");
      s.style.transform = "";
    });
    /* 設定の下から指で引いたときに動かしたのは deck（帯ごと）です。 */
    const deck = document.getElementById("deck");
    if (deck) deck.style.transform = "";
    const from = active;
    if (from !== id && KN.ui.closePops) KN.ui.closePops();
    active = id;
    /* いまの画面を根に（下の帯の幕・ノートの左の木。CSS の `:has(#screen-….is-active)` をやめた——画面の中で
       何かが出入りするたびに入れ物ごと見直しが掛かり、席を移る一拍が重くなっていた。2026年10月24日）。 */
    document.documentElement.dataset.screen = id;
    /* `face === "settled"` は「呼んだ側がもう動かし終えた」の合図です
       （買うもの ⇄ 価格の重なり）。ここで重ねて動かすと、指で置いた
       ところから跳ねます。 */
    /* 帯は全タブで一つ（買うもの・価格も、段3から）。どのタブのあいだも
       帯の下の画面だけが流れます（docs/shared-header.md）。 */
    const dir = face ? 0 : slideDir(from, id);
    const ALL = ["is-leaving", "is-in-l", "is-in-r", "is-out-l", "is-out-r",
                 "is-push-in", "is-push-under", "is-pop-in", "is-pop-out"];
    const push = dir !== 0 && pushy(from, id);
    const inCls  = push ? (dir > 0 ? "is-push-in" : "is-pop-in")
                        : (dir > 0 ? "is-in-r" : "is-in-l");
    const outCls = push ? (dir > 0 ? "is-push-under" : "is-pop-out")
                        : (dir > 0 ? "is-out-l" : "is-out-r");

    /* **組み立ては、動かす前に済ませます。**

       前はここが逆で、入場の class を付けて transition を走らせてから
       `render()` を呼んでいました。組み直しは重い仕事なので（やることで
       117〜168ms／CPU 4倍）、動き出した直後に main thread がそのぶん
       固まります——実測で、席を移るたびに **100〜244ms** の長タスク。
       絵としては「流れずに、いきなり出てくる」。

       先に組んでおけば、そのあいだ画面に出ているのは**まだ前の席**です
       （入場の class は下で付けます）。押してから動き出すまでの間は
       変わらず、**動き出してからが詰まらなくなります。**

       **見える状態にしてから組むこと。** 隠れた面（`hidden` ＝ display:none）
       の中で組むと、測るものが軒並み 0 を返します——暦の厚み（`fitCalH`）、
       選んでいる日の輪の位置、「いま」の線。だからここで先に `is-active`
       だけ付けて、**動かす class（`inCls`）は下の輪の中で付けます**。
       この二つのあいだに描画は挟まらないので（同じ一拍のうち）、前の席が
       消えて見えることはありません。 */
    /* **いま見ている日は、全タブで一つ**（util の dayShare）。出ていく画面の
       日を置いてから、入ってくる画面を組みます——組む側は `render()` の頭で
       それを引き取ります。日を持たない画面（買うもの・価格・設定）からは
       何も置かないので、その前に見ていた日がそのまま残ります。 */
    const fromScr = from && KN.screens[from];
    /* 出ていく画面に言う（幅の広い画面のノートは、右の段に据えた紙をここで閉じる。docs/desk.md）。 */
    if (fromScr && fromScr.onLeave && from !== id) {
      try { fromScr.onLeave(id); } catch (err) { /* 移ることを妨げない */ }
    }
    if (fromScr && fromScr.day && from !== id) {
      try { KN.util.dayShare.set(fromScr.day()); } catch (err) { /* 移ることを妨げない */ }
    }
    const inEl = document.querySelector(`.screen[data-screen="${id}"]`);
    if (inEl) {
      inEl.hidden = false;
      inEl.classList.remove(...ALL);
      inEl.classList.add("is-active");
    }
    /* 上の帯の持ち主を、組む**前**に入ってくるタブへ（js/head.js）。組む側は
       `render()` の中で自分の暦と題を帯に置きます。 */
    KN.head.enter(id);
    /* daily・ノートの鍵（js/lock.js）。組む前に覆うので、中身は一瞬も出ません。 */
    if (KN.lock) KN.lock.enter(id);
    /* 据えつけ（はじめて開くとき）と、組む前の支度（daily：その日の行を用意する）。ここで
       store を書いても、subscribe は組みません——すぐ下で組むので。前は支度が組んだあと
       （onEnter）にあり、据えつけも今日の行を用意していて、その日はじめて daily を開く
       たびに画面を二度・三度組んでいました（docs/motion.md の「押した一拍を軽く」）。 */
    preparing = true;
    try {
      ensureMounted(id);
      if (KN.screens[id].prepare) {
        try { KN.screens[id].prepare(); } catch (err) { /* 開くことを妨げない */ }
      }
    } finally {
      preparing = false;
    }
    behindStale = false;   // ここで組むので、預かっていた組み直しは要らない
    KN.screens[id].render();

    document.querySelectorAll(".screen").forEach((s) => {
      const sid = s.dataset.screen;
      const on = sid === id;
      /* 出ていく面は、流れ終わるまで残します。消してから動かしても、
         動くものがありません。 */
      const out = dir !== 0 && !on && sid === from;
      s.classList.remove(...ALL);
      s.classList.toggle("is-active", on);
      if (on) {
        s.hidden = false;
        if (dir) s.classList.add(inCls);
      } else if (out) {
        s.classList.add("is-leaving", outCls);
      } else {
        s.hidden = true;
        KN.motion.depart(s);
      }
    });
    /* 押しのけは deck（帯と、その下の画面）ごと。下の画面の class は
       出入りの目印として残し、動きそのものは deck が持ちます（base.css）。 */
    if (deck) {
      deck.classList.remove("is-push-under", "is-pop-in");
      if (push) deck.classList.add(dir > 0 ? "is-push-under" : "is-pop-in");
    }
    clearTimeout(slideT);
    if (dir) {
      slideT = setTimeout(() => {
        document.querySelectorAll(".screen.is-leaving").forEach((s) => {
          s.classList.remove(...ALL);
          s.hidden = true;
          /* 開いたときの札も、隠れたここで外します（戻ってきた一拍に並べ直させない。motion.js の depart）。 */
          KN.motion.depart(s);
        });
        if (deck) deck.classList.remove("is-push-under", "is-pop-in");
      }, slideMs(push));
    }

    /* 画面によっては、開いたこと自体が合図になります。呼ぶのはここ——
       タブを押した一拍のうちなので、ブラウザの「操作のうちに」を満たします。 */
    if (KN.screens[id].onEnter) {
      try { KN.screens[id].onEnter(); } catch (err) { /* 開くことを妨げない */ }
    }
    /* 開いたとき、満ちるもの（health の輪・体重の線）。何が動くかは CSS が
       決めます（motion.js の arrive）。上の帯（暦）は画面の外なので、別に
       （設定は帯の上に重なる一枚なので、帯は迎えない）。 */
    KN.motion.arrive(inEl);
    if (id !== "settings") KN.motion.arrive(document.getElementById("head"), { restart: false });

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
      /* ＋ は帯と同じ段の右に立ちます（base.css の「＋ は帯と同じ段の右に」）。
         一覧の底とトーストがそのぶん上がるので、あるかないかを根に
         書いておいて、CSS がそこから余白を決めます。 */
      document.documentElement.classList.toggle("has-fab", !dock.hidden);
    }

    paintTabs();
    /* 暦の出入り（ノートの席は暦を持たない）。横の流れと同じ一拍で動かします。
       測るのは組み終えたここで一度だけ——直前の paintTabs が席の箱を測って
       並べ直したばかりなので、もう一度は並べ直しません（js/head.js の moveCal）。 */
    KN.head.moveCal(dir !== 0);
    haptic();

    if (location.hash.slice(1) !== id) {
      history.replaceState(null, "", "#" + id);
    }
  }

  /* 通知から来た用事の紙。画面が組み上がってから開きます。先に、閉じている
     あいだに鳴った回を受け取っておく——受け取る前に紙から時刻を直すと、
     古い回が「まだ鳴っていない」ままになり、開いた拍に鳴り直すので。 */
  /* 同じ押しが二つの道（`#due=` と控え）で届いても、紙は一度だけ。 */
  let lastDue = { key: "", at: 0 };
  function openDue(ids) {
    const key = (ids || []).slice().sort().join(",");
    if (key === lastDue.key && Date.now() - lastDue.at < 5000) return;
    lastDue = { key, at: Date.now() };
    const go = () => setTimeout(() => KN.dueSheet.open(ids), 60);
    if (KN.bell && KN.bell.absorb) KN.bell.absorb().then(go, go);
    else go();
  }

  function ensureMounted(id) {
    if (mounted.has(id)) return;
    KN.screens[id].mount(document.getElementById("screen-" + id));
    mounted.add(id);
  }

  /* ---------------- 左の列を畳む（幅の広い画面。docs/desk.md の段6） ----------------
     ⌘\（js/keys.js）か、列の下の ‹。畳むと絵だけの細い列で、席の名前は指したときの札に。 */
  /* 電話を横にした（指の端末・背の低い横長）。列は畳んだ形に据える——設定（railFolded）は書き換えず、‹ も出さない
     （base.css の「電話を横に」。docs/desk.md）。 */
  const SIDEWAYS = window.matchMedia ? window.matchMedia("(orientation: landscape) and (max-height: 520px) and (pointer: coarse)") : null;
  const railOn = () => store.get().settings.railFolded === true || !!(SIDEWAYS && SIDEWAYS.matches);
  function applyRail() {
    const on = railOn();
    const moved = document.documentElement.classList.contains("rail-fold") !== on;
    document.documentElement.classList.toggle("rail-fold", on);
    const btn = document.getElementById("rail-fold");
    if (btn) {
      btn.setAttribute("aria-label", on ? "左の列をひらく" : "左の列を畳む");
      btn.setAttribute("aria-expanded", String(!on));
    }
    document.querySelectorAll("#tabbar .tab").forEach((b) => {
      const t = b.querySelector(".tab-label");
      if (on && t) b.title = t.textContent; else b.removeAttribute("title");
    });
    /* 中身の幅が変わる——窓の幅が変わったときと同じく測り直させる（暦の選んだ日の輪・印の一枚）。 */
    if (moved) requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }
  KN.app.foldRail = function foldRail() {
    if (SIDEWAYS && SIDEWAYS.matches) return;
    store.update((s) => { s.settings.railFolded = s.settings.railFolded !== true; });
  };

  /* ---------------- boot ---------------- */

  function boot() {
    applyTheme(store.get().settings.theme || "auto");
    applyLook(store.get().settings);
    applyTextSize(store.get().settings.textSize || "std");
    applyFont(store.get().settings.font);
    /* 「端末に合わせる」なら、戻ってくるたびに読み直す（アプリを離れて
       iPhone の文字サイズを変えてきた、に追いつくため）。 */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && store.get().settings.textSize === "auto") applyTextSize("auto");
    });
    buildTabs();
    const fold = node(html`<button type="button" class="rail-fold-btn" id="rail-fold">${icon("chevron-left")}</button>`);
    fold.addEventListener("click", KN.app.foldRail);
    document.getElementById("tabbar").after(fold);
    applyRail();
    if (SIDEWAYS && SIDEWAYS.addEventListener) SIDEWAYS.addEventListener("change", applyRail);
    watchGlass();
    watchWriting();
    /* アプリへ戻ってきたときも、開いたときと同じく満ちます（道の人が歩くのと
       同じ二つの入口。docs/todo-timeline.md の「歩く」）。bfcache から戻った
       ときは visibilitychange が来ないことがあるので、pageshow も聞きます。 */
    const arriveHere = () => {
      KN.motion.arrive(document.querySelector(`.screen[data-screen="${active}"]`));
      if (active !== "settings") KN.motion.arrive(document.getElementById("head"), { restart: false });
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") arriveHere();
    });
    window.addEventListener("pageshow", (e) => { if (e.persisted) arriveHere(); });

    // 閉じているあいだに日をまたいでいたら、終わらなかった用事を今日へ運ぶ。
    store.rescheduleOverdue();

    /* `#cal-back` は、ショートカットでカレンダーに入れたあとの戻り道
       （js/ics.js の BACK）。入れたのはやることの紙からなので、やることへ。 */
    const calBack = !!KN.ics && location.hash.slice(1) === KN.ics.BACK;
    /* `#due=id,id` は、時刻の通知を押して来た道（sw.js の notificationclick）。
       やることを出して、その用事の紙を開く（js/due-sheet.js・R3）。 */
    const dueIds = KN.dueSheet ? KN.dueSheet.idsFromHash(location.hash) : null;
    /* 居た場所（N4。下の takePlace）。通知・ショートカットから来たときは使いません。 */
    let place = takePlace();
    if (calBack || dueIds) place = null;
    let fromHash = calBack || dueIds ? "todo" : location.hash.slice(1);
    /* 印の無い起動（閉じられたあと）は控えの席へ。印があれば印が勝ち、席の違う控えは捨てます。 */
    if (place && !fromHash) fromHash = place.seat;
    if (place && place.seat !== fromHash) place = null;
    /* 見ていた日は、組む前に共通の日へ（各画面が render() の頭で引き取る）。 */
    if (place && place.day) KN.util.dayShare.set(place.day);
    /* 設定は、潜ってきたタブも戻します（戻る道と、出す設定の中身が決まる）。 */
    if (place && fromHash === "settings" && place.from.length) {
      drawerFrom.push(...place.from);
      goingBack = true;
    }
    try { show(KN.screens[fromHash] ? fromHash : HOME); } finally { goingBack = false; }
    if (place) putPlace(place);
    /* 開いていた紙の書きかけ（N8）は、席が戻ったときだけ（ui.js の takeDraft。15分以内）。 */
    if (place) KN.ui.takeDraft(place.seat); else KN.ui.dropDraft();
    /* 消した知らせが出たまま閉じられたなら、それも（N13 の X18 (c)。ui.js の takeGone）。 */
    KN.ui.takeGone(!!place);
    if (calBack) KN.ics.cameBack();
    if (dueIds) {
      openDue(dueIds);
      if (KN.dueSheet.trail) KN.dueSheet.trail(`印（#due=）から開いた（id ${dueIds.length}件）`);
    }

    /* 押したことの控え（sw.js・js/due-sheet.js の take）。`#due=` が届かなかった
       iPhone の道の受け皿：開いたとき・戻ってきたとき・sw.js からの一言で読む。 */
    const pullDue = () => {
      if (!KN.dueSheet || !KN.dueSheet.take) return;
      KN.dueSheet.take().then((ids) => {
        if (!ids) return;
        if (active !== "todo") show("todo");
        if (ids.length) openDue(ids);
        else KN.ui.toast("その時刻の用事は、もう片づいています");
      });
    };
    /* 起動の直後は、sw.js が控えを置くより先に見に行くことがある（閉じていた
       アプリを通知が起こすと、アプリの起動と notificationclick が同時に走る）。
       だから少し間を置いて二度見直す。前に出たとき（focus・pageshow）も。 */
    pullDue();
    setTimeout(pullDue, 1500);
    setTimeout(pullDue, 4000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pullDue();
    });
    window.addEventListener("focus", pullDue);
    window.addEventListener("pageshow", pullDue);
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data && e.data.type === "due-click") pullDue();
      });
    }

    /* The hash is how the back button knows where it is, but it is also what
       iOS hands back when it restores a standalone app it had killed — and a
       restore is a fresh open, which should land on やること like any other.
       So the hash is wiped on the way out and only ever survives a reload
       inside one sitting. */
    /* ただし30分以内なら、隠れるたびに置く控え（keepPlace）が同じ席・日・送り位置へ戻します
       （roadmap-seamless の X14 の (b)）。daily・ノートは鍵のため、やることへ（takePlace）。 */
    window.addEventListener("pagehide", () => {
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") keepPlace(false);
      /* 閉じられずに戻ってきた——書きかけは紙に残っているので、控えは捨てます（N8）。 */
      else KN.ui.dropDraft();
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
      /* 組む前の支度のあいだは、何もしません——show() がこのあと組んで、席も塗ります。 */
      if (preparing) return;
      /* 左の列を畳んだ・ひらいた（控えを戻したときも）。組む前に——輪や印は組むときに測るので、新しい幅で。 */
      if (document.documentElement.classList.contains("rail-fold") !== railOn()) applyRail();
      if (KN.screens[active]) {
        /* 紙の中で打っているあいだは、組み直しを預かります（上の behindStale）。 */
        if (typingInSheet()) behindStale = true;
        else {
          behindStale = false;
          KN.screens[active].render();
        }
      }
      paintTabs();
    });
    /* 欄を出たら（紙を閉じるときも、紙が欄から指を外す）、預かっていた組み直しを。 */
    document.addEventListener("focusout", () => requestAnimationFrame(catchUpBehind));

    /* パソコンに入れたアプリは、開き直しても窓を増やさず今の窓へ戻る（manifest の launch_handler。docs/desk.md）。
       席の近道（タスクバー・Dock の右クリック）から来たら、その席へ。 */
    if ("launchQueue" in window) {
      window.launchQueue.setConsumer((p) => {
        const h = p && p.targetURL ? new URL(p.targetURL).hash : "";
        if (h && h !== location.hash) location.hash = h;
      });
    }

    window.addEventListener("hashchange", () => {
      const id = location.hash.slice(1);
      /* 開いたままのところへショートカットが戻してきた。画面も紙もそのまま、
         印だけ戻す（読み直しにはならない——`#` の後ろだけが違う URL なので）。 */
      if (KN.ics && id === KN.ics.BACK) {
        history.replaceState(null, "", "#" + active);
        return;
      }
      /* 開いたままのところへ、通知が用事を持って来た（R3）。 */
      const dueIds = KN.dueSheet ? KN.dueSheet.idsFromHash(id) : null;
      if (dueIds) {
        if (active !== "todo") show("todo");
        else history.replaceState(null, "", "#todo");
        openDue(dueIds);
        if (KN.dueSheet.trail) KN.dueSheet.trail(`印（#due=）が開いたところへ届いた（id ${dueIds.length}件）`);
        return;
      }
      if (KN.screens[id] && id !== active) show(id);
    });

    // Keep two tabs of the same app in sync.
    /* ノートの書きかけ（IndexedDB）を書き終えてから読み直す。読み直しが書き込みを途中で捨て、別の窓が書いた
       拍に打っていたノートの本文が消えていた（パソコン段10。docs/desk.md・tests/desk-windows.js）。 */
    let otherWrote = false;
    const otherWindow = () => {
      if (otherWrote) return;
      otherWrote = true;
      const notes = KN.notes && KN.notes.flush ? KN.notes.flush() : null;
      Promise.race([Promise.resolve(notes).catch(() => {}), new Promise((ok) => setTimeout(ok, 1500))])
        .then(() => KN.app.reloadHere());
    };
    window.addEventListener("storage", (e) => { if (e.key === store.KEY) otherWindow(); });
    if (KN.notes && KN.notes.onOther) KN.notes.onOther(otherWindow);   // ノートを書いた合図も（js/notes-idb.js。P6d）

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
      if (key !== dayNow) { store.rescheduleOverdue(); applyLook(store.get().settings); }
      if (KN.moment) KN.moment.maybe();   // 暦の日の一度きり（js/moment.js）
      const due = store.todosDue().length;
      if (key === dayNow && due === dueNow) return;
      dayNow = key;
      dueNow = due;
      if (KN.screens[active]) KN.screens[active].render();
      paintTabs();
      paintAppBadge(true);
    };
    setInterval(KN.app.onMinute, 30000);
    /* 戻ってきたときにも、すぐ一度。止まっていたあいだに日をまたいでいたら、
       30秒待たずにルーティンを次の日へ——待つあいだ、逃した日のまま見えるので。 */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") KN.app.onMinute();
    });

    requestPersistentStorage();
    watchTopTap();
    trackKeyboard();
    watchAppBadge();
    KN.pullRefresh.init();
    /* 記録の写し（js/live-idb.js）を、何よりも先に。元（localStorage）が消えて
       いたら、ここで写しから戻ります。日記の写しはこれが済んでから比べます。 */
    if (KN.liveIdb) KN.liveIdb.start();
    /* 日記の写しの突き合わせ（js/diary-idb.js）を先に。控えはそれが済むのを
       待ってから取ります（済む前の控えは、写しから戻る本文を取りこぼしうる）。 */
    if (KN.diaryIdb) {
      KN.diaryIdb.start();
      /* 突き合わせが済んだら（読めた・読めなかった、どちらでも）daily を
         描き直します——「読めません」を出す・引っ込める。写しから戻した
         本文は store の subscribe が描くので、ここは中身が同じだったときの分。 */
      KN.diaryIdb.onChange(() => {
        if (active === "archive" && KN.screens.archive) KN.screens.archive.render();
      });
      /* 読めなかった日は、前に出てきたときにもう一度読みにいきます
         （ホーム画面のアプリは、何日も裏で生きたままなので）。 */
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") KN.diaryIdb.retry();
      });
    }
    /* 過去のやることの棚（js/todo-past.js。R26 の段2）。読めなかった日は、前に出てきたときにもう一度。 */
    if (KN.todoPast) {
      KN.todoPast.start();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") KN.todoPast.retry();
      });
    }
    KN.backup.init();
    /* 3台の同期（js/sync.js。段2は影：つないだ一台が送るだけ）。比べるのは日記の写しなどが済んでから（sync が待つ）。 */
    if (KN.sync) KN.sync.start();
    /* 大きな保存場所の中身（控えの数・日記の写しの様子）が動いたら、設定が
       出ているときだけ描き直します。控えは離れるたびに取るので、ほかの
       画面まで描き直す理由はありません。 */
    if (KN.idb) KN.idb.onChange(() => {
      if (active === "settings" && KN.screens.settings) KN.screens.settings.render();
    });
    KN.notify.init();
    /* 中継所の見張り。**画面ではなくここから立てます**——前はダイエットと
       daily がそれぞれ持っていて、その二つが出ているときしか覗きませんでした
       （やること・買うものを見ているあいだ、届いた歩数は一度も入らない）。
       入った記録は store に乗り、いま出ている画面は上の subscribe が
       描き直すので、覗く側が画面を知っている必要はありません。 */
    KN.healthRelay.watch();
    /* 閉じていても鳴る通知（js/bell.js）。中継所の見張りとは別の拍です。 */
    if (KN.bell) KN.bell.init();
    registerServiceWorker();
    /* 起動の時間を控える（roadmap-seamless の N9。js/errlog.js）。 */
    if (KN.errlog && KN.errlog.ready) KN.errlog.ready();
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
  /* 紙を閉じた直後は（閉じる拍にキーボードも下りる）、窓が 0 へ戻るのを上のきわの
     一押しと読みません（iPhone でノートを読んで戻ると一覧が頭へ送られた。
     2026年10月11日、利用者）。 */
  let topTapHushUntil = 0;
  KN.app.hushTopTap = () => { topTapHushUntil = performance.now() + 1200; };

  const activeScreen = () => document.querySelector(".screen.is-active");

  /* Quick — a slide, not a journey. Native smooth scrolling paces itself by
     distance, so a screen 20 lists long took seconds; this is the same 260ms
     whether you are 300px down or 30,000. */
  /* 動いているあいだは、ノッチのタップを聞きません。滑らせている最中に
     文書が0へ寄ることがあり（貼りついた要素があると、ブラウザが位置を
     取り直します）、それを合図と読むと、自分が始めた動きを自分で
     打ち消して上へ飛びます。 */
  let gliding = 0;

  function glideTo(el, to, { ms = 260, pow = 3 } = {}) {
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const want = Math.max(0, Math.min(max, to));
    const from = el.scrollTop;
    if (Math.abs(want - from) < 1) return;
    /* 動きを減らす設定では滑らせずに着く（P7。CSS の transition と違い、毎コマ書く送りは base.css では止まらない）。 */
    if (KN.motion && KN.motion.still()) { el.scrollTop = want; gliding = performance.now() + 120; return; }
    const start = performance.now();
    gliding = start + ms + 160;
    const step = (now) => {
      /* rAF の時刻は start より前のことがある。負のまま曲線に入れると逆へ跳ねる。 */
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      const e = 1 - Math.pow(1 - t, pow);
      el.scrollTop = from + (want - from) * e;
      /* 残りが半px を切ったら着いた（目に見えない尾で、次の一押しを待たせない）。 */
      if (t < 1 && Math.abs(want - from) * (1 - e) >= 0.5) requestAnimationFrame(step);
      else if (t < 1) { el.scrollTop = want; gliding = performance.now() + 120; }
      else gliding = performance.now() + 120;   // 着地の直後もひと呼吸
    };
    requestAnimationFrame(step);
  }

  const isGliding = () => performance.now() < gliding;
  KN.app.isGliding = isGliding;
  /* 上のきわ・題を押して上へ（2026年10月4日、利用者「スピードダウンしたりふわっと
     しないとダサい」「最後の最後をもう少し遅く」。跳ね返りは試して外した）。遠いほど
     少し長く（道のりの対数）、出だしは速く、着く前に大きく緩めて、ふわっと止まる
     （6乗の ease-out）。長さのつまみは `--m-to-top`。 */
  const glideToTop = (el) => {
    if (!el || el.scrollTop < 1) return;
    if (KN.motion && KN.motion.still()) { el.scrollTop = 0; return; }
    const screens = el.scrollTop / Math.max(1, el.clientHeight || window.innerHeight);
    const k = Math.min(1.6, Math.max(0.7, 0.7 + 0.35 * Math.log2(1 + screens)));
    const base = KN.motion ? KN.motion.ms("--m-to-top") : 750;
    glideTo(el, 0, { ms: base * k, pow: 6 });
  };
  KN.app.glideTo = glideTo;
  KN.app.glideToTop = glideToTop;

  function watchTopTap() {
    /* The header, everywhere. Buttons and fields keep their own taps. */
    document.addEventListener("click", (e) => {
      const bar = e.target.closest && e.target.closest(".topbar");
      if (!bar) return;
      if (e.target.closest("button, a, input, textarea, select, label")) return;
      /* 戻すのは**送る器**です（紙が器になった画面では、画面そのものは
         送れない）。`activeScreen()` のままだった二つ（ここと、下のノッチ）は、
         押しても何も起きていませんでした（実測：やること・daily・買うもの・
         ダイエットで、600px 送った紙が 600px のまま）。 */
      glideToTop(scrollerOf(activeScreen()));
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

    /* 回すと iOS は文書を 0 へ戻す——上のきわの一押しと読むと、読んでいた紙が頭へ送られた
       （2026年10月26日、利用者「ノートで横にすると一番上へ」）。幅が変わった拍のあとは聞かない。
       scroll が resize より先に来ることもあるので、ここでも幅を見る。 */
    let seenW = window.innerWidth;
    const turned = () => {
      if (window.innerWidth === seenW) return false;
      seenW = window.innerWidth;
      KN.app.hushTopTap();
      return true;
    };
    window.addEventListener("scroll", () => {
      if (root.classList.contains("kb-open")) return;
      if (window.scrollY !== 0) return;
      if (turned()) { setTimeout(park, 250); return; }
      const quiet = !touching && !isGliding() && performance.now() > topTapHushUntil && !(KN.reorder && KN.reorder.isActive());
      /* 紙が開いていれば、いちばん上の紙の本体を送る（長いノートなど。2026年10月4日）。 */
      const sheets = document.querySelectorAll(".sheet.is-open");
      const top = sheets.length ? sheets[sheets.length - 1].querySelector(".sheet-body") : null;
      const el = quiet ? (sheets.length ? top : scrollerOf(activeScreen())) : null;
      // The pixel goes back either way, so the next tap has something to take.
      window.scrollTo(0, TOP_TAP_PARK);
      if (el && el.scrollTop > 0) { glideToTop(el); haptic(); }
    }, { passive: true });

    window.addEventListener("resize", () => { turned(); park(); });
    window.addEventListener("orientationchange", () => { KN.app.hushTopTap(); setTimeout(park, 250); });
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
    /* ノートの見たままの書く欄（js/note-live.js）。 */
    if (el.isContentEditable) return true;
    if (tag !== "INPUT") return false;
    return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"]
      .includes(el.type);
  }

  /* 書いているあいだは画面を消さない（Screen Wake Lock。docs/thinking.md の「書いているあいだ」）。
     音声入力は画面に触れないので、話している途中で iPhone の自動ロックが暗くして消し、
     日記の鍵が閉じて書く紙も閉じていた。持つのは欄にいて、最後に字が増えてから5分のあいだだけ
     （置いたままの画面は点けっぱなしにしない）。隠れるとブラウザが手放すので、戻ったら持ち直す。
     買うものの awake（screen-list.js）とは別に持つ——どちらかが持っていれば消えない。 */
  function watchWriting() {
    if (!navigator.wakeLock) return;
    const IDLE_MS = 5 * 60 * 1000;
    let lock = null, asking = false, idleT = 0;
    const wanted = () => document.visibilityState === "visible" && isTyping();
    function release() {
      clearTimeout(idleT);
      const l = lock;
      lock = null;
      if (l) l.release().catch(() => {});
    }
    function hold() {
      if (!wanted()) { release(); return; }
      clearTimeout(idleT);
      idleT = setTimeout(release, IDLE_MS);
      if (lock || asking) return;
      asking = true;
      navigator.wakeLock.request("screen").then((l) => {
        asking = false;
        if (!wanted()) { l.release().catch(() => {}); return; }
        lock = l;
        l.addEventListener("release", () => { if (lock === l) lock = null; });
      }, () => { asking = false; });
    }
    ["focusin", "input", "keydown"].forEach((t) => document.addEventListener(t, hold, true));
    /* 欄を出た：次の欄へ移っただけなら持ったまま。 */
    document.addEventListener("focusout", () => setTimeout(() => { if (!wanted()) release(); }, 0), true);
    document.addEventListener("visibilitychange", hold);
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

    /* 下に貼るもの（紙・電卓）の**床がどこにあるか**を測る、見えない一点。

       `--kb` は「innerHeight − 可視の高さ」で出していて、iPhone のホーム画面
       アプリでは 0 でした——あそこでは innerHeight も可視と一緒に縮むので。
       それで足りていたのは、**`position: fixed` の床も一緒に上がっていた**
       からです。iOS 26 ではそこが変わり、innerHeight と可視は縮むのに、
       fixed の床は画面の底に残ります。紙は `bottom: var(--kb)` ＝ 0 の
       ままキーボードの裏に沈み、見えるのは頭（「食事を書く」）だけで、
       欄はキーボードと道具棚（∧ ∨ ✓）の下でした（2026年9月27日の画面）。

       だから数で推さず、**床そのものを測ります**。fixed で bottom:0 に置いた
       高さ0の点の上端が床、可視の下端（offsetTop + height）がキーボードの
       上端。その差が、紙を持ち上げる量です。床も一緒に上がる端末では差が
       0 になるので、前と同じ答えに落ちます。`.app` の中には置かないこと
       （transform を持つ祖先があると、fixed の基準がそちらへ移ります）。 */
    const floor = document.createElement("i");
    floor.setAttribute("aria-hidden", "true");
    floor.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;"
      + "visibility:hidden;pointer-events:none";
    document.body.append(floor);

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
      /* 床とキーボードの上端の差（上の `floor`）。**打っているあいだだけ**
         使います——キーボードが出ていないときの差は、指で拡大しているときの
         ような別の話で、そこで紙を浮かせる理由はありません。
         書くより先に測ること（書いたあとに測ると、そこでレイアウトが一回増える）。 */
      const sunk = typing
        ? Math.round(floor.getBoundingClientRect().top - (vv.offsetTop + vv.height))
        : 0;
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
      // 床が画面の底に残る端末（iOS 26 のホーム画面アプリ）では、その差のぶん。
      root.style.setProperty("--kb", stale ? "0px" : Math.max(0, full - visible, sunk) + "px");

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
    KN.app.remeasure = () => { fit(); settle(); requestAnimationFrame(catchUpBehind); };

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
    return KN.util.selecting();
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

  /** 動いている版：配るとき stamp-build.js が入れる `<meta name="kn-build">`（errlog.js と同じ。N3）。手元では ""。 */
  function runningVersion() {
    const m = document.querySelector('meta[name="kn-build"]');
    return m && m.content !== "dev" ? m.content : "";
  }

  /** いまの Service Worker の版（sw.js の message に訊く）。答えが無ければ ""。 */
  function workerVersion() {
    return new Promise((resolve) => {
      const sw = navigator.serviceWorker.controller;
      if (!sw || typeof MessageChannel === "undefined") return resolve("");
      const ch = new MessageChannel();
      const timer = setTimeout(() => resolve(""), 1500);
      ch.port1.onmessage = (e) => { clearTimeout(timer); resolve((e.data && e.data.version) || ""); };
      try { sw.postMessage({ type: "kn-version" }, [ch.port2]); } catch (_) { clearTimeout(timer); resolve(""); }
    });
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
    /* ただし動いている版と新しい Service Worker の版が同じなら読み直さない（roadmap-seamless の N1）——
       ネットから新しい版で開いたところへ、その版の Service Worker が入ってきただけ。分からなければ今までどおり読み直す。 */
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      const mine = runningVersion();
      workerVersion().then((theirs) => {
        if (mine && theirs === mine) { reloading = false; return; }
        reloadForNewVersion();
      });
    });

    /* 見えているあいだは読み直しません（roadmap-seamless の N4）。隠れたとき、紙が開いていなければ
       ——開いていれば、閉じたあとの隠れまで待ちます（隠れた瞬間に紙ごと消さない）。戻ると居た場所に居ます。 */
    function reloadForNewVersion() {
      const now = () => {
        if (document.visibilityState !== "hidden" || isBusy()) return false;
        document.removeEventListener("visibilitychange", now);
        KN.app.reloadHere();
        return true;
      };
      if (!now()) document.addEventListener("visibilitychange", now);
    }

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // An installed app can stay open for days, so look for a new build
        // every time it comes back to the foreground rather than only at boot.
        document.addEventListener("visibilitychange", () => {
          /* 登録が空で返る場（試験の、Service Worker を止めたブラウザ）では何もしない。 */
          if (reg && document.visibilityState === "visible") reg.update().catch(() => {});
        });
      }).catch((err) => {
        console.warn("service worker registration failed", err);
      });
    });
  }

  /* Screens off the tab bar — 価格・設定 — are opened by name from the screens
     that link to them, and hand the way back with them. */
  KN.app.showScreen = show;
  /* 引き出し（帯に自分の場所を持たない画面）。設定がここへ戻りました
     ——どのタブの右上の歯車からも開けて、開けたところへ帰ります。
     価格は帯のまま（買うものの裏面）なので、ここには入りません。 */
  const OFF_BAR = ["settings"];
  /** 引き出しから帰る。`face` に何か渡すと**動かしません**——左端から指で
      引いて戻ったときのように、呼んだ側がもう滑らせ終えている場合です
      （買うもの ⇄ 価格 の `"settled"` と同じ合図）。 */
  KN.app.backScreen = (face) => {
    const to = drawerFrom.pop() || HOME_OF_DRAWER;
    goingBack = true;
    try { show(to, face); } finally { goingBack = false; }
  };

  /* ---------------- 左端から引くあいだ、後ろの画面を出す ----------------

     引き出し（設定）の根っこで左端を引くと、次に動くのは**画面そのもの**
     です。戻る先はいま隠れているので、指が動かすものがありません——ここで
     出します。どこから潜ってきたかを知っているのは、この積み木だけなので、
     出すのもここの仕事です。

     **組み直してから出すこと。** 設定を見ているあいだ store が動いても、
     描き直されるのは出ている画面だけなので、隠れていた一枚は古いままです。 */
  KN.app.underScreen = () => {
    const to = drawerFrom[drawerFrom.length - 1];
    if (!to || !KN.screens[to]) return null;
    const el = document.querySelector(`.screen[data-screen="${to}"]`);
    if (!el) return null;
    ensureMounted(to);
    try { KN.screens[to].render(); } catch (err) { /* 出すことを妨げない */ }
    el.hidden = false;
    el.classList.add("is-under");
    /* 指が動かすのは、その画面ではなく **deck**（上の帯ごと）。設定は帯ごと
       押しのけて重なった一枚なので、戻るときも帯ごと戻ってきます。 */
    const deck = document.getElementById("deck");
    if (deck) { deck.classList.remove("is-push-under", "is-pop-in"); return deck; }
    return el;
  };

  /** 引くのをやめた。出した一枚を、また隠します。 */
  KN.app.underScreenClear = () => {
    document.querySelectorAll(".screen.is-under").forEach((s) => {
      s.classList.remove("is-under");
      s.style.transform = "";
      if (s.dataset.screen !== active) s.hidden = true;
    });
    const deck = document.getElementById("deck");
    if (deck) { deck.style.transform = ""; deck.style.transition = ""; }
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

    /* ---- 札は、＋ から分かれて出る ----

       畳まれている姿は「＋ の中」です（screens.css の `.fab-menu-b`）。
       そこへ寄せる向きは、**開く直前に測る**しかありません——札の数も
       高さも呼ぶ側しだいなので、CSS では決め打ちできないからです。

       測るのは**素の位置**なので、いったん transform を外します。外した
       ぶんが動きとして出てしまわないよう、そのあいだは transition も
       止めて、畳まれた姿に戻してから一息（`offsetWidth`）置きます。 */
    const bs = Array.prototype.slice.call(menu.querySelectorAll(".fab-menu-b"));
    const fr = fab.getBoundingClientRect();
    bs.forEach((b) => { b.style.transition = "none"; b.style.transform = "none"; });
    bs.forEach((b) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty("--morph-x",
        ((fr.left + fr.width / 2) - (r.left + r.width / 2)).toFixed(1) + "px");
      b.style.setProperty("--morph-y",
        ((fr.top + fr.height / 2) - (r.top + r.height / 2)).toFixed(1) + "px");
    });
    bs.forEach((b) => { b.style.transform = ""; });
    void menu.offsetWidth;
    bs.forEach((b) => { b.style.transition = ""; });

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
  /* 設定の中の紙は、押しのける一枚（`.is-sheetish`）として出ます。 */
  function isBusy() {
    if (document.querySelector(".sheet, .set-layer.is-sheetish")) return true;
    const el = document.activeElement;
    return !!(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.value);
  }

  /* ---------------- 読み直し・閉じられたあとも、居た場所へ（roadmap-seamless の N4） ----------------

     席・見ていた日・送り位置（`scrollerOf()` の器）・設定の奥と潜ってきたタブを、一つの控えに置きます。
     置くのは隠れるたび（iOS に閉じられたときのため）と、読み直す直前。boot が一度だけ読んで消します。
     **記録の外**（`kaimono-note-errors` と同じ置き方。書き出し・自動の控え・Dropbox に乗らない）。
     読み直しのあとは同じものを、閉じられたあとは30分以内だけ戻します（X14 の (b)）。 */
  const PLACE_KEY = "kaimono-note-resume";
  const PLACE_MS = 30 * 60 * 1000;
  /** 読み直すと決めたあとは、隠れたときの控えで上書きしない。 */
  let leaving = false;

  function keepPlace(reload) {
    if (leaving) return;
    if (reload) leaving = true;
    try {
      const scr = KN.screens[active];
      let day = scr && scr.day ? scr.day() : KN.util.dayShare.get();
      if (day === KN.util.todayKey()) day = null;    // 今日なら焼き込まない（dayShare と同じ）
      const sc = scrollerOf(activeScreen());
      localStorage.setItem(PLACE_KEY, JSON.stringify({
        at: Date.now(), seat: active, day,
        top: sc ? Math.round(sc.scrollTop) : 0,
        from: drawerFrom.filter(Boolean),
        set: active === "settings" && scr.where ? scr.where() : null,
        reload: !!reload,
      }));
    } catch (_) { /* 置けなくても、閉じる・読み直すことは妨げない */ }
    /* 開いている紙の書きかけも（N8。ui.js の keepDraft）。 */
    KN.ui.keepDraft(active);
  }

  /** 控えを一度だけ読む（読んだら消す）。古い・読めない・閉じられたあとの daily とノートは null。 */
  function takePlace() {
    let p = null;
    try {
      p = JSON.parse(localStorage.getItem(PLACE_KEY) || "null");
      localStorage.removeItem(PLACE_KEY);
    } catch (_) { return null; }
    if (!p || typeof p !== "object" || !KN.screens[p.seat]) return null;
    const age = Date.now() - p.at;
    if (!(age >= 0 && age < PLACE_MS)) return null;
    const from = Array.isArray(p.from) ? p.from.filter((id) => KN.screens[id] && !OFF_BAR.includes(id)) : [];
    /* daily・ノート（とそこから潜った設定）は開くたびに鍵が出るところ。閉じられたあとは新しく開いたのと
       同じ、やることへ。 */
    const tab = p.seat === "settings" ? from[from.length - 1] : p.seat;
    if (!p.reload && (tab === "archive" || tab === "notes")) return null;
    return {
      seat: p.seat,
      day: typeof p.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : null,
      top: Number(p.top) > 0 ? Number(p.top) : 0,
      from,
      set: Array.isArray(p.set) ? p.set : null,
    };
  }

  /** 組んだあとに、送り位置へ。onEnter・parkSearch の一枚あと（やることは開くと「いま」へ送るので）。
      差しこんだばかりの器への scrollTop を iPhone が落とすことがあるので、もう一枚あとに見直します
      （daily の holdTop と同じ）。 */
  function putPlace(p) {
    if (active !== p.seat) return;     // ノート → daily に降ろしたときは、送り位置が別の器のもの
    if (active === "settings") {
      if (KN.screens.settings.goTo) KN.screens.settings.goTo(p.set);
      return;
    }
    const put = (again) => {
      const sc = scrollerOf(activeScreen());
      if (!sc || !sc.isConnected) return;
      const to = Math.min(p.top, Math.max(0, sc.scrollHeight - sc.clientHeight));
      if (Math.abs(sc.scrollTop - to) > 1) sc.scrollTop = to;
      if (again) requestAnimationFrame(() => put(false));
    };
    requestAnimationFrame(() => put(true));
  }

  /** 読み直す。その前に居た場所を置きます（組んだあと boot が戻す）。 */
  KN.app.reloadHere = () => { keepPlace(true); location.reload(); };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
