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

  /** 本文の冒頭。題を本文の一行目から借りたときは、その次から。
      行頭の印（# - 1. - [ ] > ---）は外して見せます（段4）。 */
  function leadOf(n) {
    let lines = n.body.split("\n").map((l) => KN.noteFormat.plain(l)).filter(Boolean);
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
    const F = KN.noteFormat;
    const fresh = !id;
    const note = fresh ? N().draft() : N().get(id);
    if (!note) return;
    let stored = !fresh;
    let h = null;
    let closed = false;
    N().begin(note.id);

    /* 全画面の一枚（段4。2026年10月1日、iPhone で「記事を書くときはフル
       画面が絶対使いやすい」）。頭の行はノートブック（左）とタグ（右）、
       その下に大きな題・作った日時・本文。 */
    const body = node(html`
      <div class="note-edit">
        <div class="note-meta">
          <button class="note-nb-btn js-nb">${icon("book")}<span class="js-nb-name"></span></button>
          <div class="note-labels js-labels"></div>
        </div>
        <input class="note-title-in js-title" placeholder="タイトル" aria-label="タイトル"
               autocomplete="off">
        <time class="note-when js-when" datetime="${note.createdAt}">${stampOf(note.createdAt)}</time>
        <div class="note-view js-view" hidden></div>
        <textarea class="note-body-in js-text" aria-label="本文" rows="6"></textarea>
      </div>
    `);
    const titleIn = body.querySelector(".js-title");
    const textIn = body.querySelector(".js-text");
    const viewEl = body.querySelector(".js-view");
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

    /* ---- 読むときは整え、書くときは印（段4） ----

       本文の欄に居ないあいだは、整えた姿（.note-view）を出します。押すと、
       押した行の終わりにカーソルを入れて素の文字へ。**押した流れの中で
       同期に focus します**（iOS はそうしないとキーボードを出さない）。
       欄から出たら（キーボードを閉じた・題へ移った）、また整えた姿へ。 */
    let writing = false;
    const paintView = () => { F.render(textIn.value, viewEl); };
    const toView = () => {
      writing = false;
      paintView();
      viewEl.hidden = false;
      textIn.hidden = true;
      if (h) h.el.classList.remove("is-writing");
    };
    const toWrite = (caret) => {
      writing = true;
      viewEl.hidden = true;
      textIn.hidden = false;
      grow();
      try { textIn.focus({ preventScroll: true }); } catch (_) { textIn.focus(); }
      if (caret != null) textIn.setSelectionRange(caret, caret);
      if (h) h.el.classList.add("is-writing");
      paintTools();
    };
    viewEl.addEventListener("click", (e) => {
      /* チェックの四角は、整えた姿のまま付け外し（書く欄へは入らない）。 */
      const box = e.target.closest(".js-tick");
      if (box) {
        e.stopPropagation();
        U.haptic();
        hist.note("tick", true);
        const at = Number(box.closest("[data-at]").dataset.at);
        textIn.value = F.toggleTask(textIn.value, at);
        changed();
        return;
      }
      const ln = e.target.closest("[data-at]");
      toWrite(ln ? Number(ln.dataset.end) : textIn.value.length);
    });
    textIn.addEventListener("focus", () => {
      if (!writing) toWrite(null);
    });
    textIn.addEventListener("blur", () => {
      /* 道具の帯を押した拍の blur は、帯が自分で欄へ戻します。 */
      setTimeout(() => {
        if (document.activeElement !== textIn && !closed) toView();
      }, 0);
    });

    /* ---- やり直し（道具の帯の ↶ ↷）。前の版とは別で、紙を開いているあいだだけ ---- */
    const hist = F.history(
      () => ({ v: textIn.value, s: textIn.selectionStart, e: textIn.selectionEnd }),
      (st2) => {
        textIn.value = st2.v;
        if (writing) textIn.setSelectionRange(st2.s, st2.e);
        changed();
      },
    );
    /* 中身が変わったあとに、いつも通る道。 */
    const changed = () => {
      if (writing) grow(); else paintView();
      sync();
      paintTools();
    };
    /* 置き換えを一つ当てる（道具の帯・改行の続き）。 */
    const apply = (r, kind) => {
      if (!r) return;
      hist.note(kind, true);
      textIn.setRangeText(r.text, r.from, r.to, "end");
      textIn.setSelectionRange(r.s, r.e);
      changed();
    };

    textIn.addEventListener("beforeinput", (e) => {
      const t = e.inputType || "";
      if (t === "insertLineBreak" || t === "insertParagraph") {
        if (e.isComposing) return;
        const r = F.onEnter(textIn.value, textIn.selectionStart, textIn.selectionEnd);
        if (r) { e.preventDefault(); apply(r, "br"); return; }
        hist.note("br", true);
        return;
      }
      if (t === "historyUndo" || t === "historyRedo") return;
      hist.note(t.startsWith("delete") ? "del" : "type");
    });
    titleIn.addEventListener("input", sync);
    textIn.addEventListener("input", () => { grow(); sync(); paintTools(); });
    /* 題で改行を押したら、本文へ。 */
    titleIn.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      toWrite(0);
    });

    /* ---- 道具の帯（キーボードの上） ----

       本文に居るあいだだけ出ます。押しても欄からカーソルを奪わないよう、
       押し始めの既定を止めます（キーボードが下がらない）。ぜんぶを一列に
       詰めて出し、横へは流さない。キーボードを閉じる口は置かない（iOS の
       キーボードの上の ✓ が閉じる。2026年10月1日、利用者）。 */
    const TOOLS = [
      { k: "undo", ico: "undo", label: "取り消す", run: () => hist.undo() },
      { k: "redo", ico: "redo", label: "やり直す", run: () => hist.redo() },
      { k: "head", ico: "heading", label: "見出し" },
      { k: "bullet", ico: "list", label: "箇条書き" },
      { k: "num", ico: "numbers", label: "番号" },
      { k: "task", ico: "checkbox", label: "チェック" },
      { k: "quote", ico: "quote", label: "引用" },
      { k: "rule", ico: "minus", label: "区切り",
        run: () => apply(F.rule(textIn.value, textIn.selectionStart), "tool") },
      { k: "outdent", ico: "outdent", label: "上げる",
        run: () => apply(F.shift(textIn.value, textIn.selectionStart, textIn.selectionEnd, -1), "tool") },
      { k: "indent", ico: "indent", label: "下げる",
        run: () => apply(F.shift(textIn.value, textIn.selectionStart, textIn.selectionEnd, 1), "tool") },
    ];
    const tools = node(html`
      <div class="note-tools" role="toolbar" aria-label="装飾">
        ${TOOLS.map((t) => html`<button type="button" class="note-tool js-tool" data-k="${t.k}" aria-label="${t.label}">${icon(t.ico)}</button>`)}
      </div>
    `);
    const keep = (e) => e.preventDefault();
    tools.addEventListener("pointerdown", keep);
    tools.addEventListener("mousedown", keep);
    tools.addEventListener("click", (e) => {
      const b = e.target.closest(".js-tool");
      if (!b) return;
      const k = b.dataset.k;
      if (b.getAttribute("aria-disabled") === "true") return;
      U.haptic();
      /* 押した拍にカーソルが外れていたら（端末によっては帯を押すと欄から
         出る）、最後に居た場所へ戻してから当てます。 */
      if (document.activeElement !== textIn) {
        const [a, b] = lastSel;
        toWrite(null);
        textIn.setSelectionRange(a, b);
      }
      const t = TOOLS.find((x) => x.k === k);
      if (t.run) t.run();
      else apply(F.setKind(textIn.value, textIn.selectionStart, textIn.selectionEnd, k), "tool");
    });
    let lastSel = [textIn.value.length, textIn.value.length];
    const paintTools = () => {
      if (document.activeElement === textIn) lastSel = [textIn.selectionStart, textIn.selectionEnd];
      const can = hist.can();
      const kind = F.kindAt(textIn.value, textIn.selectionStart);
      tools.querySelectorAll(".js-tool").forEach((b) => {
        const k = b.dataset.k;
        if (k === "undo" || k === "redo") b.setAttribute("aria-disabled", String(!can[k]));
        else if (["head", "bullet", "num", "task", "quote"].includes(k)) b.setAttribute("aria-pressed", String(kind === k));
      });
    };
    /* カーソルが動いたら、押されている印を合わせます。 */
    const onSel = () => { if (writing && document.activeElement === textIn) paintTools(); };
    document.addEventListener("selectionchange", onSel);

    /* ---- ノートブック（左上）とタグ（右上）。段3の口を、頭の行へ ---- */
    const labelsEl = body.querySelector(".js-labels");
    const nbBtn = body.querySelector(".js-nb");
    const setLabels = (patch) => {
      if (stored) N().setLabels(note.id, patch);
      else {
        if ("notebook" in patch) note.notebook = String(patch.notebook || "").trim();
        if ("tags" in patch) note.tags = N().cleanTags(patch.tags);
      }
      paintLabels();
    };
    const paintLabels = () => {
      nbBtn.querySelector(".js-nb-name").textContent = note.notebook || "ノートブック";
      nbBtn.classList.toggle("is-empty", !note.notebook);
      labelsEl.innerHTML = "";
      labelsEl.append(node(html`
        <div class="note-labels-in">
          ${note.tags.map((t) => html`<button class="chip js-tags">${dot(t)}<span>${t}</span></button>`)}
          <button class="chip note-tag-add js-tags" aria-label="タグ">${icon("plus")}${note.tags.length ? "" : html`<span>タグ</span>`}</button>
        </div>
      `));
      labelsEl.querySelectorAll(".js-tags").forEach((b) => b.addEventListener("click", () => {
        KN.motion.fire("select");
        pickTags(b, note, (tags) => setLabels({ tags }));
      }));
    };
    nbBtn.addEventListener("click", () => {
      KN.motion.fire("select");
      pickNotebook(nbBtn, note, (name) => setLabels({ notebook: name }));
    });
    paintLabels();

    const finish = () => {
      closed = true;
      tintBar(false);
      document.removeEventListener("selectionchange", onSel);
      sync();
      /* 何も書かずに閉じた新しいノートは残しません。 */
      if (fresh && stored && blank()) N().drop(note.id);
      N().flush();
      renderBody();
    };

    /* 「⋯」はその場の小窓（段4。紙をもう一枚重ねると、目が画面の下まで
       行って戻る）。★・前の版・削除。ノートブックは頭の行に出ている。 */
    const menu = [
      { icon: "star",
        label: () => (note.fav ? "★を外す" : "★を付ける"),
        onPick: () => {
          if (stored) N().setFav(note.id, !note.fav);
          else note.fav = !note.fav;
        } },
      { icon: "clock", label: "前の版",
        onPick: () => {
          if (!stored) { KN.ui.toast("前の版はありません"); return; }
          sync();
          openVersions(note.id, (v) => {
            hist.note("revert", true);
            titleIn.value = v.title;
            textIn.value = v.body;
            changed();
          });
        } },
      { icon: "trash", label: "削除", danger: true,
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
    ];

    h = KN.ui.sheet({
      title: "",
      content: body,
      guard: false,
      onClose: finish,
    });
    h.el.setAttribute("aria-label", "ノート");
    h.el.classList.add("is-note");
    tintBar(true);
    /* 頭：左に戻る ‹、右に ⋯（Evernote の並び）。閉じ方は紙のまま
       （×と同じ tryClose。払っても閉じる）。 */
    const closeBtn = h.el.querySelector(".js-close");
    closeBtn.innerHTML = icon("chevron-left");
    closeBtn.setAttribute("aria-label", "戻る");
    const moreBtn = node(html`<button class="icon-btn js-note-more" aria-label="ほかの操作">${icon("more")}</button>`);
    moreBtn.addEventListener("click", () => { U.haptic(); popMenu(moreBtn, menu); });
    h.el.querySelector(".sheet-head").append(moreBtn);
    h.el.append(tools);

    /* ＋から来たときは、**押した流れのまま**本文へカーソルを入れます（iOS は
       ここで同期に focus しないとキーボードを出しません。ui.js の focusNow）。
       開いたノートは整えた姿で開き、カーソルを入れません——読みに来ただけの
       ときにキーボードが画面の半分を取るので。 */
    if (fresh) {
      writing = true;
      viewEl.hidden = true;
      h.el.classList.add("is-writing");
      grow();
      paintTools();
      KN.ui.focusNow(textIn);
    } else {
      toView();
    }
    return h;
  }

  /* ---------------- 上の帯（時刻・電池）の色 ----------------

     ホーム画面のアプリでは、時刻や電池の並ぶ帯はページの外で、色は
     theme-color（灰の地）で塗られます。全画面の書く紙は白なので、開いて
     いるあいだだけ帯も紙の色に合わせます（2026年10月1日、iPhone で「一番
     上だけ灰色でおかしい」）。閉じたら元の値へ。 */
  let barSaved = null;
  function tintBar(on) {
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    if (on) {
      if (barSaved) return;
      barSaved = metas.map((m) => m.getAttribute("content"));
      const c = getComputedStyle(document.documentElement).getPropertyValue("--c-surface").trim();
      if (c) metas.forEach((m) => m.setAttribute("content", c));
    } else if (barSaved) {
      metas.forEach((m, i) => m.setAttribute("content", barSaved[i]));
      barSaved = null;
    }
  }

  /* ---------------- 「⋯」の小窓（段4） ----------------

     押した「⋯」のすぐ下に、項目を縦に並べた小さな一枚を出します。外を
     押すか、項目を選ぶと閉じます。重なりは開いている紙の一段上。 */
  function popMenu(anchor, items) {
    const p = popOver(anchor, { role: "menu", side: "right" });
    items.forEach((it) => {
      const label = typeof it.label === "function" ? it.label() : it.label;
      const b = node(html`<button class="note-pop-item ${it.danger ? "is-danger" : ""}" role="menuitem">${icon(it.icon)}<span>${label}</span></button>`);
      b.addEventListener("click", () => { KN.motion.fire("select"); p.close(); it.onPick(); });
      p.el.append(b);
    });
    return p;
  }

  /* 押したもののすぐ下に出る小さな一枚（「⋯」・ノートブック・タグに共通）。
     side は揃える側（左の口なら left、右の口なら right）。外を押す・Escape で
     閉じ、閉じたら onClose。 */
  function popOver(anchor, { role = "dialog", side = "right", label = "", onClose } = {}) {
    const sheetEl = anchor.closest(".sheet");
    const z = (sheetEl && parseInt(getComputedStyle(sheetEl).zIndex, 10)) || 0;
    const r = anchor.getBoundingClientRect();
    const cover = node(html`<div class="note-pop-cover"></div>`);
    const pop = node(html`<div class="note-pop is-${side}" role="${role}" aria-label="${label}"></div>`);
    cover.style.zIndex = String(z + 1);
    pop.style.zIndex = String(z + 2);
    const top = Math.round(r.bottom + 4);
    pop.style.top = `${top}px`;
    pop.style.setProperty("--pop-top", `${top}px`);
    if (side === "left") pop.style.left = `${Math.max(8, Math.round(r.left))}px`;
    else pop.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right))}px`;
    let gone = false;
    const close = () => {
      if (gone) return;
      gone = true;
      pop.classList.remove("is-open");
      document.removeEventListener("keydown", onKey, true);
      cover.remove();
      setTimeout(() => pop.remove(), KN.motion.ms("--m-state") + 40);
      if (onClose) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    cover.addEventListener("click", close);
    document.addEventListener("keydown", onKey, true);
    document.body.append(cover, pop);
    requestAnimationFrame(() => { if (!gone) pop.classList.add("is-open"); });
    return { el: pop, close };
  }

  /* ---------------- タグ・ノートブックを選ぶ小窓（段3、段4.1で紙から小窓へ） ----------------

     どちらも、いま使われている名前をチップで並べ、下の欄で新しい名前を
     足します。欄に打ったまま閉じても、その名前は付きます（打った字が
     消えたように見せないため）。出るのは押した口のすぐ下（「⋯」と同じ。
     2026年10月1日、iPhone で「シートでなく、そこにポンと出てほしい」）。 */
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

  function pickTags(anchor, note, done) {
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
    const p = popOver(anchor, { side: "right", label: "タグ", onClose: addTyped });
    p.el.classList.add("is-pick");
    p.el.append(box);
  }

  function pickNotebook(anchor, note, done) {
    const box = node(html`<div class="note-pick"><div class="chip-row js-chips"></div></div>`);
    const chipsEl = box.querySelector(".js-chips");
    const input = nameField("新しいノートブック");
    box.append(input);
    let p = null;
    let settled = false;
    const choose = (name) => {
      settled = true;
      done(name);
      if (p) p.close();
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
    p = popOver(anchor, {
      side: "left",
      label: "ノートブック",
      onClose: () => { if (!settled && input.value.trim()) done(input.value.trim()); },
    });
    p.el.classList.add("is-pick");
    p.el.append(box);
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
