/* =========================================================
   くらしノート — 上の帯と暦は、全タブで一つ（docs/shared-header.md の段2）

   やること・daily・ダイエットの上の帯（題・今日へ戻る・さがす・設定）と
   暦の置き場は、**この一つ**です。`.screens` の中でも、タブの流れ
   （`#panes` の中の画面）の外に居るので、席を移っても 1px も動きません
   ——動かないことを、中身をそろえることではなく**作り**で保証します
   （案B「一つに見せる」を採らなかった理由は docs に）。

   ■ 帯は一つ、応えはタブごと

   題を押す・今日へ戻る・虫めがね は、どのタブでも同じ場所の同じボタン
   ですが、押したときに何をするかはタブが決めます（やること・ダイエット：
   週⇄月、daily：月を選ぶ紙）。だから各画面はいままでどおり自分の手で
   ボタンに結び、**押されたときに持ち主が自分かどうか**を `mine()` で
   見ます。持ち主でない画面は黙る。

   ■ 暦の枠は一つ、印はタブごと

   暦（`.cal`）そのものは、これまでどおり各画面が組みます——マスに何を
   描くか（やることの絵・daily の粒・ダイエットの飲酒の帯）がタブごとに
   違うので。**全タブ共通の印にしてはいけない**：daily にダイエットの
   達成の棒が出て、「daily は評価しない」を破ります（tests/daily-rules.js）。
   置き場（`.head-cal`）は一つで、持ち主の暦だけがそこに居ます。

   ■ 持ち主

   いちばん最後に出たタブ（やること・daily・ダイエットのどれか）。設定は
   持ち主を変えません——設定は帯ごと押しのけて上に重なる一枚で、その下に
   居るのは歯車を押した画面の帯のままなので（左端から引くと、それが見える）。
   買うもの・価格は段3まで帯を持たないので、そこへ移ると帯は隠れます。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const { html, node, icon } = KN.util;

  /** 帯を持つタブ。段3で買うもの・価格が加わります。 */
  const TABS = ["archive", "todo", "diet"];

  let root = null;
  let owner = null;
  const els = {};

  function mount() {
    root = document.getElementById("head");
    if (!root) return;
    root.innerHTML = "";
    root.append(node(html`
      <header class="topbar">
        <div class="topbar-row">
          ${KN.util.dayTitleBar()}
          <button class="icon-btn js-search-btn" aria-label="さがす">${icon("search")}</button>
          <button class="icon-btn js-settings" aria-label="設定">${icon("gear")}</button>
        </div>
      </header>
    `));
    root.append(node(html`<div class="head-cal"></div>`));
    els.topbar = root.querySelector(".topbar");
    els.dayRow = root.querySelector(".topbar-dayrow");
    els.dayTitle = root.querySelector(".js-day-title");
    els.today = root.querySelector(".js-go-today");
    els.searchBtn = root.querySelector(".js-search-btn");
    els.cal = root.querySelector(".head-cal");
    /* 歯車だけは、どのタブでも同じことをします。 */
    root.querySelector(".js-settings").addEventListener("click",
      () => KN.app.showScreen("settings"));
  }

  /** その画面が、いま帯の持ち主か。 */
  const mine = (id) => owner === id;

  /**
   * 席を移るとき、入ってくる画面を組む**前**に呼びます（app.js の show）。
   * 帯を出すか隠すかと、虫めがねの光り方・読み上げを、入ってくるタブに
   * 合わせます。暦と題は、このあとの `render()` が自分で置きます——同じ
   * 一拍のうちなので、前のタブの暦が一瞬でも描かれることはありません。
   */
  function enter(id) {
    if (!root) return;
    if (id === "settings") return;            // 持ち主はそのまま（上を参照）
    if (!TABS.includes(id)) {
      owner = null;
      root.hidden = true;
      return;
    }
    owner = id;
    root.hidden = false;
    /* 虫めがねは一つなので、光るかどうかは入ってくるタブの窓で決めます
       （光るのは「いま絞り込んでいる」ときだけ——ui.js の wireSearch）。 */
    const input = document.querySelector(`#screen-${id} .js-search`);
    const on = !!(input && input.value);
    els.searchBtn.classList.toggle("is-on", on);
    els.searchBtn.setAttribute("aria-expanded", String(on));
    if (input) els.searchBtn.setAttribute("aria-label", input.getAttribute("aria-label") || "さがす");
  }

  /** 持ち主の暦を置き場に据えます。持ち主でなければ何もしません。
      **同じ要素なら触りません**——外して付け直すだけで、その木ぶんの
      レイアウトがやり直しになります（screen-todo.js の renderBody）。 */
  function putCal(id, cal) {
    if (!root || !mine(id)) return;
    if (!cal) { if (els.cal.firstChild) els.cal.replaceChildren(); return; }
    if (cal.parentNode === els.cal && els.cal.childNodes.length === 1) return;
    els.cal.replaceChildren(cal);
  }

  /** 帯を持つタブか。 */
  const has = (id) => TABS.includes(id);

  mount();

  KN.head = { els, mine, enter, putCal, has, TABS };
})();
