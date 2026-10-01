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
  /* 上のチップで選んだ絞り込み（段3）。null は「すべて」。一度に一つだけ。
     記憶だけに持ちます（localStorage には書きません）。
     { k: "fav" } ／ { k: "nb", v: 名前 } ／ { k: "tag", v: 名前 } */
  let pick = null;

  const N = () => KN.notes;

  /* タグの色。名前から決まった一色を引きます（色を選ばせない＝どこにも
     しまわない）。色は買うもののカテゴリと同じ並び（灰の「その他」は外す
     ——丸が見えなくなるので）。 */
  const TAG_COLORS = ["#5ea55a", "#d4695f", "#d79a4a", "#5b9bd5", "#4fb3c4", "#9b7ede", "#48b39a", "#e07fa8"];
  function tagColor(name) {
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return TAG_COLORS[h % TAG_COLORS.length];
  }
  const dot = (t) => html`<span class="chip-dot" style="--cat:${tagColor(t)}"></span>`;

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

  /** 題。無ければ本文の一行目（notes-idb.js。ぜんぶをさがすも同じものを使う）。 */
  const headOf = (n) => N().headOf(n);

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

  /** 書く紙と前の版の日時。「2026年10月1日(木) 9:05」。 */
  function stampOf(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const wd = "日月火水木金土"[d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${wd}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /* 窓の字は、題・本文に加えてノートブックとタグの名前にも当てます。 */
  const hit = (n, q) => !q || U.foldKana(`${n.title}\n${n.body}\n${n.notebook}\n${n.tags.join("\n")}`).includes(q);

  const picked = (n) => !pick
    || (pick.k === "fav" ? n.fav
      : pick.k === "nb" ? n.notebook === pick.v
        : n.tags.includes(pick.v));

  function renderBody() {
    if (!els.body) return;
    const box = els.body;
    /* チップの列は組み直しても横の位置を保ちます（右のほうのチップを押した
       とたんに、列が頭へ戻らないように）。 */
    const was = box.querySelector(".notes-chips");
    const keepX = was ? was.scrollLeft : 0;
    box.innerHTML = "";
    const st = N().state();
    if (st === "off") {
      box.append(node(html`<p class="notes-off">ノートを開けませんでした</p>`));
      return;
    }
    if (st !== "on") return;

    const all = N().list();
    const chips = chipRow(all);
    if (chips) { box.append(chips); chips.scrollLeft = keepX; }

    const rows = all.filter((n) => picked(n) && hit(n, query));
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

  /* ---------------- 絞り込みのチップ（段3） ----------------

     すべて・★・ノートブック・タグ（色の丸）。並べるのは使われているもの
     だけで、件数は出しません（daily の席なので）。「すべて」のほかに選べる
     ものが無ければ、列ごと出しません。 */
  function chipRow(all) {
    const hasFav = all.some((n) => n.fav);
    const books = N().notebooks();
    const tags = N().tagNames();
    /* 選んでいたものが無くなっていたら（最後の★を外した・名前を消した）、すべてへ。 */
    if (pick && !(pick.k === "fav" ? hasFav : pick.k === "nb" ? books.includes(pick.v) : tags.includes(pick.v))) pick = null;
    if (!hasFav && !books.length && !tags.length) return null;

    const on = (k, v) => !!pick && pick.k === k && (k === "fav" || pick.v === v);
    const chip = (k, v, inner, label) => html`
      <button class="chip js-pick" data-k="${k}" data-v="${v || ""}" aria-pressed="${String(k === "all" ? !pick : on(k, v))}"
              ${label ? html`aria-label="${label}"` : ""}>${inner}</button>`;
    const el = node(html`
      <div class="chip-row notes-chips" role="group" aria-label="絞り込み">
        ${chip("all", "", "すべて")}
        ${hasFav ? chip("fav", "", icon("star"), "★") : ""}
        ${books.map((b) => chip("nb", b, html`${icon("book")}<span>${b}</span>`))}
        ${tags.map((t) => chip("tag", t, html`${dot(t)}<span>${t}</span>`))}
      </div>
    `);
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".js-pick");
      if (!b) return;
      const k = b.dataset.k;
      const v = b.dataset.v;
      /* 選んでいるものをもう一度押したら、すべてへ戻ります。 */
      pick = k === "all" || on(k, v) ? null : { k, v };
      KN.motion.fire("select");
      renderBody();
    });
    return el;
  }

  function row(n) {
    const head = headOf(n);
    const lead = leadOf(n);
    const el = node(html`
      <div class="note-row is-card" data-id="${n.id}">
        <button class="note-open js-open">
          <span class="note-t">${head}</span>
          ${lead ? html`<span class="note-x">${lead}</span>` : ""}
          <span class="note-foot">
            <span class="note-d">${whenOf(n.updatedAt)}</span>
            ${n.notebook ? html`<span class="note-nb">${icon("book")}<span>${n.notebook}</span></span>` : ""}
            ${n.tags.map((t) => html`<span class="note-tag">${dot(t)}<span>${t}</span></span>`)}
          </span>
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
    N().begin(note.id);

    const body = node(html`
      <div class="note-edit">
        <input class="note-title-in js-title" placeholder="タイトル" aria-label="タイトル"
               autocomplete="off">
        <time class="note-when js-when" datetime="${note.createdAt}">${stampOf(note.createdAt)}</time>
        <div class="note-labels js-labels"></div>
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

    /* ノートブックとタグ（段3）。日時のすぐ下に、付いているものと「＋」。
       置く前の新しいノートは、手元の一件に持っておいて、置くときに一緒に
       入ります（★と同じ）。 */
    const labelsEl = body.querySelector(".js-labels");
    const setLabels = (patch) => {
      if (stored) N().setLabels(note.id, patch);
      else {
        if ("notebook" in patch) note.notebook = String(patch.notebook || "").trim();
        if ("tags" in patch) note.tags = N().cleanTags(patch.tags);
      }
      paintLabels();
    };
    const paintLabels = () => {
      labelsEl.innerHTML = "";
      labelsEl.append(node(html`
        <div class="note-labels-in">
          ${note.notebook ? html`<button class="chip js-nb">${icon("book")}<span>${note.notebook}</span></button>` : ""}
          ${note.tags.map((t) => html`<button class="chip js-tags">${dot(t)}<span>${t}</span></button>`)}
          <button class="chip note-tag-add js-tags" aria-label="タグ">${icon("plus")}${note.tags.length ? "" : html`<span>タグ</span>`}</button>
        </div>
      `));
      labelsEl.querySelectorAll(".js-tags").forEach((b) => b.addEventListener("click", () => {
        KN.motion.fire("select");
        pickTags(note, (tags) => setLabels({ tags }));
      }));
      const nb = labelsEl.querySelector(".js-nb");
      if (nb) nb.addEventListener("click", () => {
        KN.motion.fire("select");
        pickNotebook(note, (name) => setLabels({ notebook: name }));
      });
    };
    paintLabels();

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
        { id: "notebook", icon: "book", label: "ノートブック",
          onPick: () => pickNotebook(note, (name) => setLabels({ notebook: name })) },
        { id: "versions", icon: "clock", label: "前の版",
          onPick: () => {
            if (!stored) { KN.ui.toast("前の版はありません"); return; }
            sync();
            openVersions(note.id, (v) => {
              titleIn.value = v.title;
              textIn.value = v.body;
              grow();
            });
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

  /* ---------------- タグ・ノートブックを選ぶ紙（段3） ----------------

     どちらも、いま使われている名前をチップで並べ、下の欄で新しい名前を
     足します。欄に打ったまま閉じても、その名前は付きます（打った字が
     消えたように見せないため）。 */
  function nameField(placeholder) {
    return node(html`
      <input class="input note-name-in js-new" placeholder="${placeholder}" aria-label="${placeholder}"
             autocomplete="off" spellcheck="false" enterkeyhint="done">
    `);
  }
  const onEnter = (input, fn) => input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    fn();
  });

  function pickTags(note, done) {
    let mine = note.tags.slice();
    const box = node(html`<div class="note-pick"><div class="chip-row js-chips"></div></div>`);
    const chipsEl = box.querySelector(".js-chips");
    const input = nameField("新しいタグ");
    box.append(input);
    const paint = () => {
      const names = [...new Set(N().tagNames().concat(mine))].sort((a, b) => a.localeCompare(b, "ja"));
      chipsEl.innerHTML = "";
      chipsEl.hidden = !names.length;
      names.forEach((t) => {
        const b = node(html`<button class="chip" aria-pressed="${String(mine.includes(t))}">${dot(t)}<span>${t}</span></button>`);
        b.addEventListener("click", () => {
          U.haptic();
          mine = mine.includes(t) ? mine.filter((x) => x !== t) : mine.concat(t);
          done(mine);
          paint();
        });
        chipsEl.append(b);
      });
    };
    const addTyped = () => {
      const t = input.value.trim();
      input.value = "";
      if (!t || mine.includes(t)) return;
      mine = mine.concat(t);
      done(mine);
      paint();
    };
    onEnter(input, () => { U.haptic(); addTyped(); });
    paint();
    KN.ui.sheet({ title: "タグ", content: box, onClose: addTyped });
  }

  function pickNotebook(note, done) {
    const box = node(html`<div class="note-pick"><div class="chip-row js-chips"></div></div>`);
    const chipsEl = box.querySelector(".js-chips");
    const input = nameField("新しいノートブック");
    box.append(input);
    let h = null;
    let settled = false;
    const choose = (name) => {
      settled = true;
      done(name);
      if (h) h.close();
    };
    const names = N().notebooks();
    if (note.notebook && !names.includes(note.notebook)) names.push(note.notebook);
    [""].concat(names).forEach((nb) => {
      const b = node(html`
        <button class="chip" aria-pressed="${String(note.notebook === nb)}">
          ${nb ? html`${icon("book")}<span>${nb}</span>` : "なし"}
        </button>`);
      b.addEventListener("click", () => { U.haptic(); choose(nb); });
      chipsEl.append(b);
    });
    onEnter(input, () => { if (input.value.trim()) { U.haptic(); choose(input.value.trim()); } });
    h = KN.ui.sheet({
      title: "ノートブック",
      content: box,
      onClose: () => { if (!settled && input.value.trim()) done(input.value.trim()); },
    });
  }

  /* ---------------- 前の版（段2） ----------------

     直す前の中身は、書く紙を開いて最初に直したときに残っています
     （notes-idb.js）。並べて、押したら中身を読めて、戻せる。戻すと、
     いまの中身も前の版に入るので、戻したことも戻せます。 */
  async function openVersions(id, onRevert) {
    let list = [];
    try { list = await N().versions(id); } catch (err) { list = []; }
    if (!list.length) { KN.ui.toast("前の版はありません"); return; }
    const box = node(html`<div class="notes-versions"></div>`);
    let h = null;
    list.forEach((v) => {
      const r = node(html`
        <button class="note-open note-ver">
          <span class="note-d">${stampOf(v.at)}</span>
          <span class="note-t">${headOf(v) || " "}</span>
          ${leadOf(v) ? html`<span class="note-x">${leadOf(v)}</span>` : ""}
        </button>
      `);
      r.addEventListener("click", () => { KN.motion.fire("select"); openVersion(id, v, () => { if (h) h.close(); onRevert(v); }); });
      box.append(r);
    });
    h = KN.ui.sheet({ title: "前の版", content: box });
  }

  function openVersion(id, v, done) {
    const box = node(html`
      <div class="note-edit is-read">
        ${v.title.trim() ? html`<div class="note-title-in">${v.title}</div>` : ""}
        <time class="note-when">${stampOf(v.at)}</time>
        <div class="note-body-in note-read"></div>
      </div>
    `);
    box.querySelector(".note-read").textContent = v.body;
    const foot = node(html`<button class="btn btn-primary btn-block js-revert">この版に戻す</button>`);
    const h = KN.ui.sheet({ title: "", content: box, footer: foot });
    foot.addEventListener("click", () => {
      U.haptic();
      if (!N().revert(id, v)) return;
      h.close();
      done();
      KN.ui.toast("戻しました");
    });
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
