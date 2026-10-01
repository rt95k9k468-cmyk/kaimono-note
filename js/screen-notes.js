/* =========================================================
   くらしノート — ノート（daily の紙の裏）

   決めごとは docs/notes.md。daily に居て daily の席を押すと、daily の紙が
   下がって、この面（地）が出ます——買うもの⇄価格と同じ手つき（app.js の
   PAIRS）。だからここも価格と同じく**紙を持ちません**。丸角と掴み手を
   持てるのは前に居る一枚（daily）だけです。

   中身は `KN.notes`（js/notes-idb.js）が記憶に持っています。一覧・検索は
   その上でするだけで、ここからは store にも localStorage にも書きません。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const { html, node, icon } = U;

  let root = null;
  let els = {};
  let query = "";

  const N = () => KN.notes;

  function mount(el) {
    root = el;
    root.innerHTML = "";
    /* 上の帯と暦は画面の外（js/head.js）。暦は daily のものをそのまま置くので、
       行き来しても帯は変わりません。 */
    root.append(node(html`
      <div class="stack">
        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="ノートをさがす" aria-label="ノートをさがす"
                   autocomplete="off" spellcheck="false">
            <button class="icon-btn js-search-clear" aria-label="検索をクリア"
                    style="width:28px;height:28px" hidden>${icon("close")}</button>
          </div>
        </div>
        <div class="notes-ground js-body"></div>
      </div>
    `));

    els = {
      searchBtn: KN.head.els.searchBtn,
      mine: () => KN.head.mine("notes"),
      screen: root,
      searchWrap: root.querySelector(".js-search-wrap"),
      search: root.querySelector(".js-search"),
      searchClear: root.querySelector(".js-search-clear"),
      body: root.querySelector(".js-body"),
    };

    KN.ui.wireSearch(els, () => renderBody(), (q) => { query = q; });

    /* 読み終えた・★・消した・戻した。打つたびには来ません（紙を閉じたときに
       組み直します）。 */
    N().onChange(() => { if (root) renderBody(); });
  }

  function render() {
    if (!root) return;
    const arc = KN.screens.archive;
    KN.head.putCal("notes", arc && arc.cal ? arc.cal() : null);
    renderBody();
  }

  /* ---------------- 一覧 ---------------- */

  /** 題。無ければ本文の一行目。 */
  function headOf(n) {
    if (n.title.trim()) return n.title.trim();
    const line = n.body.split("\n").find((l) => l.trim());
    return line ? line.trim() : "";
  }

  /** 本文の冒頭。題を本文の一行目から借りたときは、その次から。 */
  function leadOf(n) {
    let lines = n.body.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!n.title.trim()) lines = lines.slice(1);
    return lines.join(" ").slice(0, 120);
  }

  /** 更新日。今日なら時刻、今年なら月日、それより前なら年から。 */
  function whenOf(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    if (U.dayKey(d) === U.todayKey()) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    const md = `${d.getMonth() + 1}月${d.getDate()}日`;
    return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}年${md}`;
  }

  const hit = (n, q) => !q || U.foldKana(`${n.title}\n${n.body}`).includes(q);

  function renderBody() {
    if (!els.body) return;
    const box = els.body;
    box.innerHTML = "";
    const st = N().state();
    if (st === "off") {
      box.append(node(html`<p class="notes-off">ノートを開けませんでした</p>`));
      return;
    }
    if (st !== "on") return;

    const rows = N().list().filter((n) => hit(n, query));
    const list = node(html`<div class="notes-list"></div>`);
    rows.forEach((n) => list.append(row(n)));
    box.append(list);

    /* 最近削除した項目は、探していないときだけ、いちばん下に一行。 */
    if (!query && N().trash().length) {
      const t = node(html`<button class="notes-trash-row js-trash">最近削除した項目</button>`);
      t.addEventListener("click", () => { KN.motion.fire("select"); openTrash(); });
      box.append(t);
    }
  }

  function row(n) {
    const head = headOf(n);
    const lead = leadOf(n);
    const el = node(html`
      <div class="note-row" data-id="${n.id}">
        <button class="note-open js-open">
          <span class="note-t">${head}</span>
          ${lead ? html`<span class="note-x">${lead}</span>` : ""}
          <span class="note-d">${whenOf(n.updatedAt)}</span>
        </button>
        <button class="fav ${n.fav ? "is-on" : ""}" aria-pressed="${String(n.fav)}"
                aria-label="${head || "ノート"} に★を付ける">${icon("star")}</button>
      </div>
    `);
    el.querySelector(".js-open").addEventListener("click", () => openNote(n.id));
    el.querySelector(".fav").addEventListener("click", (e) => {
      e.stopPropagation();
      U.haptic();
      N().setFav(n.id, !n.fav);
    });
    return el;
  }

  /* ---------------- 書く紙 ----------------

     ＋も一覧の行も、同じ紙を開きます（読む画面と編集ボタンは作りません）。
     保存は黙って：記憶は打つたびに直し、入れ物へは打ち終わりの少しあと
     （notes-idb.js）。閉じても払っても、閉じた拍に書き切ります。 */
  function openNote(id) {
    const st = N().state();
    if (st !== "on") {
      KN.ui.toast(st === "off" ? "ノートを開けませんでした" : "ノートを読み込んでいるところです");
      return;
    }
    const fresh = !id;
    const note = fresh ? N().draft() : N().get(id);
    if (!note) return;
    let stored = !fresh;

    const body = node(html`
      <div class="note-edit">
        <input class="note-title-in js-title" placeholder="タイトル" aria-label="タイトル"
               autocomplete="off">
        <textarea class="note-body-in js-text" aria-label="本文" rows="6"></textarea>
      </div>
    `);
    const titleIn = body.querySelector(".js-title");
    const textIn = body.querySelector(".js-text");
    /* 値は欄へ直に入れます（テンプレートに書くと、textarea は頭の改行を
       一つ落とします——本文は打ったままの形で持つので。docs/notes.md）。 */
    titleIn.value = note.title;
    textIn.value = note.body;

    /* 本文の欄は高さが伸びます（中で送らない。送るのは紙）。 */
    const grow = () => {
      textIn.style.height = "auto";
      textIn.style.height = `${textIn.scrollHeight}px`;
    };

    const blank = () => !titleIn.value.trim() && !textIn.value.trim();
    const sync = () => {
      if (!stored) {
        if (blank()) return;          // 何か書くまでは置きません
        if (!N().put(note)) return;
        stored = true;
      }
      N().edit(note.id, { title: titleIn.value, body: textIn.value });
    };
    titleIn.addEventListener("input", sync);
    textIn.addEventListener("input", () => { grow(); sync(); });
    /* 題で改行を押したら、本文へ。 */
    titleIn.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      textIn.focus();
    });

    const finish = () => {
      sync();
      /* 何も書かずに閉じた新しいノートは残しません。 */
      if (fresh && stored && blank()) N().drop(note.id);
      N().flush();
      renderBody();
    };

    const h = KN.ui.sheet({
      title: "",
      content: body,
      guard: false,
      menu: [
        { id: "fav", icon: "star",
          label: () => (note.fav ? "★を外す" : "★を付ける"),
          onPick: () => {
            if (stored) N().setFav(note.id, !note.fav);
            else note.fav = !note.fav;
          } },
        { id: "delete", icon: "trash", label: "削除", danger: true,
          onPick: () => {
            if (stored && !blank()) {
              sync();
              N().remove(note.id);
              KN.ui.toast("最近削除した項目へ移しました", {
                action: { label: "戻す", onClick: () => N().restore(note.id) },
              });
            }
            h.close();
          } },
      ],
      onClose: finish,
    });
    h.el.setAttribute("aria-label", "ノート");
    h.el.classList.add("is-note");
    grow();

    /* ＋から来たときは、**押した流れのまま**本文へカーソルを入れます（iOS は
       ここで同期に focus しないとキーボードを出しません。ui.js の focusNow）。
       開いたノートには入れません——読みに来ただけのときにキーボードが
       画面の半分を取るので。 */
    if (fresh) KN.ui.focusNow(textIn);
    return h;
  }

  /* ---------------- 最近削除した項目 ---------------- */

  function openTrash() {
    const box = node(html`<div class="notes-trash"></div>`);
    let h = null;
    const paint = () => {
      box.innerHTML = "";
      const rows = N().trash();
      if (!rows.length) { if (h) h.close(); return; }
      rows.forEach((n) => {
        const r = node(html`
          <div class="note-row is-gone">
            <div class="note-open">
              <span class="note-t">${headOf(n)}</span>
              <span class="note-d">${whenOf(n.deletedAt)}</span>
            </div>
            <button class="btn btn-soft btn-sm js-back">戻す</button>
          </div>
        `);
        r.querySelector(".js-back").addEventListener("click", () => {
          KN.motion.fire("select");
          N().restore(n.id);
          paint();
        });
        box.append(r);
      });
    };
    paint();
    h = KN.ui.sheet({ title: "最近削除した項目", content: box });
  }

  /* ---------------- ＋ ---------------- */

  function dockButton() {
    if (N().state() === "off") return null;
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="書く">${icon("plus")}</button>
      </div>
    `);
    fab.querySelector(".js-open-add").addEventListener("click", (e) => {
      e.stopPropagation();
      openNote(null);
    });
    return fab;
  }

  KN.screens = KN.screens || {};
  KN.screens.notes = { mount, render, dockButton, open: openNote };
})();
