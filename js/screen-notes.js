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
  const COLOR_NAMES = ["緑", "赤", "橙", "青", "水色", "紫", "青緑", "桃"];
  function hashColor(name) {
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return TAG_COLORS[h % TAG_COLORS.length];
  }
  /* 設定（notes →「ノートブック」「タグ」）で選んだ色があればそれ。無ければ
     名前から決まった一色。置き場は `settings.noteColors = { nb: {名前: 色},
     tag: {名前: 色} }`——無い・知らない色は名前の色へ戻る（移行なし）。
     kind は "nb"・"tag"。 */
  function colorOf(kind, name) {
    const all = (KN.store.get().settings || {}).noteColors;
    const m = all && typeof all === "object" ? all[kind] : null;
    const c = m && typeof m === "object" && Object.prototype.hasOwnProperty.call(m, name) ? m[name] : null;
    return TAG_COLORS.includes(c) ? c : hashColor(name);
  }
  const dot = (t) => html`<span class="chip-dot" style="--cat:${colorOf("tag", t)}"></span>`;
  /* ノートブックの本の絵にも色（2026年10月1日、利用者が「それぞれに色が欲しい」）。 */
  const book = (b) => html`<span class="nb-ico" style="--cat:${colorOf("nb", b)}">${icon("book")}</span>`;

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

  const hm = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

  /** カードの日付＝作った日。「2018年5月1日 20:20」。日だけ選んだノート
      （`noTime`）は時刻を出しません（段4.5）。 */
  function whenOf(n) {
    const d = new Date(n.createdAt);
    if (isNaN(d.getTime())) return "";
    const ymd = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    return n.noTime ? ymd : `${ymd} ${hm(d)}`;
  }

  /** 書く紙と前の版の日時。「2026年10月1日(木) 9:05」。noTime なら時刻なし。 */
  function stampOf(iso, noTime) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const wd = "日月火水木金土"[d.getDay()];
    const day = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${wd})`;
    return noTime ? day : `${day} ${hm(d)}`;
  }

  /** 一覧の並び。設定（notes → 並び）で作った日の順にもできる。 */
  const byCreated = () => (KN.store.get().settings || {}).notesOrder === "created";

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

    let all = N().list();
    if (byCreated()) all = all.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
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

  /* ---------------- 絞り込みのチップ（段3・roadmap-2.0 の V20） ----------------

     すべて・★・ノートブック ⌄・タグ ⌄。ノートブックとタグは名前を列に並べず、
     押すとそのすぐ下の小窓に（折り返して）並べます——前は全部を一列に並べて横へ
     流していて、タグが増えると探せなかった（10月4日、利用者）。選んだら、その札に
     名前が出ます。件数は出しません（daily の席なので）。「すべて」のほかに選べる
     ものが無ければ、列ごと出しません。 */
  function chipRow(all) {
    const hasFav = all.some((n) => n.fav);
    const books = N().notebooks();
    const tags = N().tagNames();
    /* 選んでいたものが無くなっていたら（最後の★を外した・名前を消した）、すべてへ。 */
    if (pick && !(pick.k === "fav" ? hasFav : pick.k === "nb" ? books.includes(pick.v) : tags.includes(pick.v))) pick = null;
    if (!hasFav && !books.length && !tags.length) return null;

    const chip = (k, inner, on, label) => html`
      <button class="chip js-pick" data-k="${k}" aria-pressed="${String(on)}"
              ${label ? html`aria-label="${label}"` : ""}>${inner}</button>`;
    /* ノートブック・タグの札：選んでいればその名前、いなければ種類の名前と ⌄。 */
    const menu = (k, word, mark) => {
      const mine = !!pick && pick.k === k;
      return chip(k, mine ? html`${mark(pick.v)}<span>${pick.v}</span>`
        : html`<span>${word}</span>${icon("chevron-down")}`, mine);
    };
    const el = node(html`
      <div class="chip-row notes-chips" role="group" aria-label="絞り込み">
        ${chip("all", "すべて", !pick)}
        ${hasFav ? chip("fav", icon("star"), !!pick && pick.k === "fav", "★") : ""}
        ${books.length ? menu("nb", "ノートブック", book) : ""}
        ${tags.length ? menu("tag", "タグ", dot) : ""}
      </div>
    `);
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".js-pick");
      if (!b) return;
      const k = b.dataset.k;
      KN.motion.fire("select");
      if (k === "nb" || k === "tag") { pickFilter(b, k, k === "nb" ? books : tags); return; }
      /* ★をもう一度押したら、すべてへ戻ります。 */
      pick = k === "fav" && !(pick && pick.k === "fav") ? { k } : null;
      renderBody();
    });
    return el;
  }

  /* 絞り込みの小窓：名前を折り返して並べ、押すとその名前で絞って閉じる。選んでいる
     名前をもう一度押したら、すべてへ。 */
  function pickFilter(anchor, k, names) {
    const box = node(html`<div class="note-pick"><div class="chip-row js-chips"></div></div>`);
    const chipsEl = box.querySelector(".js-chips");
    let p = null;
    names.forEach((v) => {
      const on = !!pick && pick.k === k && pick.v === v;
      const b = node(html`
        <button class="chip js-filter-pick" aria-pressed="${String(on)}">
          ${k === "nb" ? book(v) : dot(v)}<span>${v}</span>
        </button>`);
      b.addEventListener("click", () => {
        U.haptic();
        pick = on ? null : { k, v };
        if (p) p.close();
        renderBody();
      });
      chipsEl.append(b);
    });
    p = popOver(anchor, { side: "left", label: k === "nb" ? "ノートブック" : "タグ" });
    p.el.classList.add("is-pick");
    p.el.append(box);
    p.place();
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
            <span class="note-d">${whenOf(n)}</span>
            ${n.notebook ? html`<span class="note-nb">${book(n.notebook)}<span>${n.notebook}</span></span>` : ""}
            ${n.tags.map((t) => html`<span class="note-tag">${dot(t)}<span>${t}</span></span>`)}
          </span>
        </button>
        <button class="fav ${n.fav ? "is-on" : ""}" aria-pressed="${String(n.fav)}"
                aria-label="${head || "ノート"} に★を付ける">${icon("star")}</button>
      </div>
    `);
    el.querySelector(".js-open").addEventListener("click", () => openNote(n.id, el));
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
  /* from … 押した一覧のカード。紙はそのカードから膨らむ（段4.3）。 */
  function openNote(id, from) {
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
    let fold = null;
    N().begin(note.id);

    /* 全画面の一枚（段4。2026年10月1日、iPhone で「記事を書くときはフル
       画面が絶対使いやすい」）。段4.2で詰めた：ノートブックは頭の行（‹ の
       隣）、タグは日時と同じ行。題のまわりで一行ぶん浮く（キーボードが
       出ると、書く場所が狭い）。 */
    const body = node(html`
      <div class="note-edit">
        <textarea class="note-title-in js-title" placeholder="タイトル" aria-label="タイトル"
                  rows="1" autocomplete="off"></textarea>
        <div class="note-sub">
          <button type="button" class="note-when js-when" aria-label="作った日">${stampOf(note.createdAt, note.noTime)}</button>
          <div class="note-labels js-labels"></div>
        </div>
        <div class="note-view js-view" hidden></div>
        <textarea class="note-body-in js-text" aria-label="本文" rows="6" data-own-scroll></textarea>
      </div>
    `);
    /* 頭の行のまん中：ノートブック。下へ送って大きな題が隠れたら、その
       上に題を小さく出す（Notion の形。情報が上にまとまる）。 */
    const mid = node(html`
      <div class="note-head-mid">
        <span class="note-head-t js-head-t" aria-hidden="true"></span>
        <button class="note-nb-btn js-nb"><span class="nb-ico js-nb-ico">${icon("book")}</span><span class="js-nb-name"></span></button>
      </div>
    `);
    const headT = mid.querySelector(".js-head-t");
    const titleIn = body.querySelector(".js-title");
    const textIn = body.querySelector(".js-text");
    const viewEl = body.querySelector(".js-view");
    /* 値は欄へ直に入れます（テンプレートに書くと、textarea は頭の改行を
       一つ落とします——本文は打ったままの形で持つので。docs/notes.md）。 */
    titleIn.value = note.title;
    textIn.value = note.body;
    const paintHeadT = () => { headT.textContent = titleIn.value.trim(); };
    paintHeadT();
    /* 題は折り返して全部見せます（長い本の題が右で切れて読めなかった。
       2026年10月1日、iPhone）。改行は持たない一行なので、貼った改行は空白に。 */
    const growTitle = () => {
      titleIn.style.height = "0";
      titleIn.style.height = `${titleIn.scrollHeight}px`;
    };

    /* 本文の欄は高さが伸びます（中で送らない。送るのは紙）。字のある高さ
       （textH）も測っておく——欄は短くても 38vh あるので、欄の底は最後の
       行ではない（下の followEnd）。 */
    let textH = 0;
    const grow = () => {
      const s = textIn.style;
      s.minHeight = "0";
      s.height = "0";
      textH = textIn.scrollHeight;
      s.minHeight = "";
      s.height = `${textH}px`;
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
      /* 押した行の高さを、入れ替わる前に測っておく（整えた姿と書く欄は
         字の大きさと行の高さが同じなので、書く欄でもほぼ同じところ）。 */
      const v = viewEl.getBoundingClientRect();
      const r = ln ? ln.getBoundingClientRect() : null;
      toWrite(ln ? Number(ln.dataset.end) : textIn.value.length);
      if (r) afterKeyboard(() => reveal(r.top - v.top, r.bottom - v.top));
      else afterKeyboard(followEnd);
    });

    /* ---- カーソルの行を見せる（段4.2） ----

       紙の送りを ui.js の「欄を真ん中へ」に任せない（data-own-scroll）。
       本文の欄は中身ぶん伸びるので、いつも「見えきっていない」と読まれ、
       欄の真ん中が画面の真ん中へ来る——打ち始めると題ごと上へ飛んでいた
       （2026年10月1日、iPhone）。動かすのは、隠れたぶんだけ。底は道具の帯の
       上端（帯は中身の上に浮いている）。 */
    const reveal = (y0, y1) => {
      const sc = h && h.el.querySelector(".sheet-body");
      if (!sc || !writing) return;
      const s = sc.getBoundingClientRect();
      const t = textIn.getBoundingClientRect();
      const bar = tools.getBoundingClientRect();
      const floor = bar.height ? Math.min(s.bottom, bar.top) : s.bottom;
      const room = 12;
      if (t.top + y1 > floor - room) sc.scrollTop += t.top + y1 - (floor - room);
      else if (t.top + y0 < s.top + room) sc.scrollTop -= s.top + room - (t.top + y0);
    };
    /* 最後の行で打っているあいだは、その行を帯の上に。途中の行は iOS が
       自分で見せる。最後の行は字のある高さの底（textH）で、欄の底では
       ない——欄の底を見せようとすると、本文が短いときに題ごと上へ送って
       いた（段4.2のあと、空の本文を押すと題が隠れた。2026年10月1日、iPhone）。 */
    let lineH = 0;
    const followEnd = () => {
      if (!writing || document.activeElement !== textIn) return;
      if (textIn.value.indexOf("\n", textIn.selectionEnd) !== -1) return;
      lineH = lineH || parseFloat(getComputedStyle(textIn).lineHeight) || 28;
      reveal(textH - lineH, textH);
    };
    /* キーボードが出きるまで紙は縮み続けるので、何度か見直す（ui.js と同じ拍）。 */
    const afterKeyboard = (fn) => {
      [140, 340, 620].forEach((ms) => setTimeout(() => {
        if (!closed && document.activeElement === textIn) fn();
      }, ms));
    };
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
      if (writing) { grow(); followEnd(); } else paintView();
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
    titleIn.addEventListener("input", () => {
      if (titleIn.value.includes("\n")) {
        const at = titleIn.selectionStart;
        titleIn.value = titleIn.value.replace(/\r?\n/g, " ");
        titleIn.setSelectionRange(at, at);
      }
      growTitle();
      paintHeadT();
      sync();
    });
    textIn.addEventListener("input", () => { grow(); followEnd(); sync(); paintTools(); });
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
    const nbBtn = mid.querySelector(".js-nb");
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
      if (note.notebook) nbBtn.style.setProperty("--cat", colorOf("nb", note.notebook));
      else nbBtn.style.removeProperty("--cat");
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

    /* ---- 作った日（Evernote から移した過去のノートを、その日へ） ----
       日時を押すと、年・月・日の回る列。日を変えたら「時刻なし」（noTime）に
       します——移した日の時刻は、そのノートの時刻ではないので（段4.5）。 */
    const whenBtn = body.querySelector(".js-when");
    whenBtn.addEventListener("click", () => {
      KN.motion.fire("select");
      pickDate(whenBtn, note.createdAt, (iso) => {
        if (stored) N().setCreated(note.id, iso, true);
        else { note.createdAt = iso; note.noTime = true; }
        whenBtn.textContent = stampOf(note.createdAt, note.noTime);
      });
    });

    const finish = () => {
      closed = true;
      if (fold) fold.disconnect();
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
            paintHeadT();
            changed();
          });
        } },
      { icon: "trash", label: "削除", danger: true,
        onPick: () => {
          if (stored && !blank()) {
            sync();
            N().remove(note.id);
            KN.ui.toast("最近削除した項目へ移しました", {
              action: { label: "元に戻す", onClick: () => N().restore(note.id) },
            });
          }
          h.close();
        } },
    ];

    /* 見出しが三つ以上あるノートだけ、「⋯」の小窓に見出しの並びを足す（R32）。押すと整えた
       姿に戻し、送る器（紙の本体 .sheet-body）をその見出しまで送る。本文は読むだけ。 */
    const headingItems = () => {
      const hs = F.headings(textIn.value);
      if (hs.length < 3) return [];
      return hs.map((x) => ({
        label: "\u3000".repeat(x.level - 1) + x.text,
        onPick: () => {
          if (writing) { textIn.blur(); if (writing) toView(); }
          else paintView();
          const el = viewEl.querySelector(`[data-line="${x.line}"]`);
          const sc = h.el.querySelector(".sheet-body");
          if (!el || !sc) return;
          sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
        },
      }));
    };

    /* 電話の幅では、帯のすぐ下から始まるカード（段4.3）。一覧のカードから
       膨らみ、閉じると一覧のカードへ縮んで戻る（直したノートは先頭へ移る
       ので、戻り先は毎フレーム探し直す）。＋からは＋から育ち、閉じたら
       先頭にできたカードへ。後ろは暗くしない（角からのぞく灰を帯と同じに）。 */
    h = KN.ui.sheet({
      title: "",
      content: body,
      guard: false,
      cls: "is-note",
      clear: true,
      grow: {
        from: from || null,
        back: () => (root && root.querySelector(`.notes-list .note-row[data-id="${CSS.escape(note.id)}"]`)) || null,
      },
      /* V19：一番上まで送ってあれば、中身を下へ引いても閉じる。 */
      pull: () => true,
      onClose: finish,
    });
    /* V19：右へ払って戻る（edge-back.js）。左端でなくても、紙のどこからでも（V26）。
       紙は払った場所からカードへ縮む（here）。字を選んでいる指は取らない。 */
    if (KN.edgeBack) {
      h.el.dataset.edgeBase = "translate(-50%, 0)";
      KN.edgeBack.wire({
        el: h.el,
        edge: Infinity,
        busy: () => closed || !window.matchMedia("(max-width: 639px)").matches
          || (document.activeElement === textIn && textIn.selectionStart !== textIn.selectionEnd),
        begin: () => ({
          top: h.el, under: null, here: true,
          commit: () => {
            if (KN.motion.still()) h.el.style.transform = "";
            h.tryClose();
          },
          cancel: () => { h.el.style.transform = ""; },
        }),
      });
    }
    h.el.setAttribute("aria-label", "ノート");
    h.el.classList.add("is-note");
    /* 頭：左に戻る ‹、右に ⋯（Evernote の並び）。閉じ方は紙のまま
       （×と同じ tryClose。払っても閉じる）。 */
    const closeBtn = h.el.querySelector(".js-close");
    closeBtn.innerHTML = icon("chevron-left");
    closeBtn.setAttribute("aria-label", "戻る");
    const moreBtn = node(html`<button class="icon-btn js-note-more" aria-label="ほかの操作">${icon("more")}</button>`);
    moreBtn.addEventListener("click", () => { U.haptic(); popMenu(moreBtn, menu.concat(headingItems())); });
    h.el.querySelector(".sheet-head").append(moreBtn);
    closeBtn.after(mid);
    h.el.append(tools);
    growTitle();
    requestAnimationFrame(() => { if (!closed) growTitle(); });
    /* 大きな題が上へ隠れたら、頭の行に題を小さく（.is-folded）。 */
    if ("IntersectionObserver" in window) {
      fold = new IntersectionObserver(([e]) => {
        h.el.classList.toggle("is-folded", !e.isIntersecting);
      }, { root: h.el.querySelector(".sheet-body") });
      fold.observe(titleIn);
    }

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

  /* 「⋯」とタグ・ノートブック・作った日の小窓は KN.ui.popMenu / popOver（2026年10月2日に
     やることの詳細の紙と共用にした）。 */
  const popMenu = (anchor, items) => KN.ui.popMenu(anchor, items);
  const popOver = (anchor, o) => KN.ui.popOver(anchor, o);

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
    p.place();
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
          ${nb ? html`${book(nb)}<span>${nb}</span>` : "なし"}
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
    p.place();
  }

  /* ---------------- 作った日を選ぶ回る列 ----------------

     年・月・日の三列。指で回して、止まった真ん中の行が選ばれます。決めるのは
     小窓を閉じたとき（外を押す・Escape）。時・分は元のまま持ち越します。 */
  const ROW_H = 40;
  function pickDate(anchor, iso, done) {
    const was = new Date(iso);
    const base = isNaN(was.getTime()) ? new Date() : was;
    const thisYear = new Date().getFullYear();
    const y0 = Math.min(1990, base.getFullYear());
    const years = [];
    for (let y = y0; y <= Math.max(thisYear, base.getFullYear()); y++) years.push(y);
    const at = { y: base.getFullYear(), m: base.getMonth() + 1, d: base.getDate() };
    const daysIn = () => new Date(at.y, at.m, 0).getDate();

    const box = node(html`<div class="note-wheels" role="group" aria-label="作った日"></div>`);
    const col = (k, values, fmt, label) => {
      const el = node(html`<div class="note-wheel" role="listbox" aria-label="${label}" tabindex="0"></div>`);
      let idx = -1;
      let t = 0;
      const fill = (vals) => {
        el.innerHTML = "";
        vals.forEach((v) => el.append(node(html`<div class="note-wheel-row" role="option" data-v="${v}">${fmt(v)}</div>`)));
      };
      const mark = (i) => {
        if (i === idx) return;
        const rows = el.children;
        if (rows[idx]) rows[idx].removeAttribute("aria-selected");
        idx = i;
        if (rows[idx]) rows[idx].setAttribute("aria-selected", "true");
      };
      const read = () => Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / ROW_H)));
      const settle = () => {
        const i = read();
        mark(i);
        const v = Number(el.children[i].dataset.v);
        if (at[k] !== v) { at[k] = v; if (k !== "d") fitDays(); }
      };
      el.addEventListener("scroll", () => {
        mark(read());
        clearTimeout(t);
        t = setTimeout(settle, 120);
      }, { passive: true });
      /* 押した行へ回す（指で回さなくても選べる）。 */
      el.addEventListener("click", (e) => {
        const r = e.target.closest(".note-wheel-row");
        if (!r) return;
        el.scrollTo({ top: [...el.children].indexOf(r) * ROW_H, behavior: "smooth" });
      });
      const go = (v) => {
        const i = Math.max(0, [...el.children].findIndex((r) => Number(r.dataset.v) === v));
        el.scrollTop = i * ROW_H;
        mark(i);
      };
      return { el, fill, go, settle: () => { clearTimeout(t); settle(); } };
    };
    const yc = col("y", years, (v) => `${v}年`, "年");
    const mc = col("m", null, (v) => `${v}月`, "月");
    const dc = col("d", null, (v) => `${v}日`, "日");
    yc.fill(years);
    mc.fill([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    let dn = 0;
    function fitDays() {
      const n = daysIn();
      if (n === dn) return;
      dn = n;
      at.d = Math.min(at.d, n);
      dc.fill(Array.from({ length: n }, (_, i) => i + 1));
      dc.go(at.d);
    }
    fitDays();
    box.append(yc.el, mc.el, dc.el);

    const p = popOver(anchor, {
      side: "left",
      label: "作った日",
      onClose: () => {
        /* 回し終わりを待たずに閉じても、止まっている行で決める。 */
        yc.settle(); mc.settle(); dc.settle();
        const next = new Date(at.y, at.m - 1, at.d, base.getHours(), base.getMinutes(), base.getSeconds());
        if (U.dayKey(next) !== U.dayKey(base)) done(next.toISOString());
      },
    });
    p.el.classList.add("is-pick", "is-wheel");
    p.el.append(box);
    p.place();
    /* 中身が入って高さが決まってから、いまの日へ回しておく。 */
    yc.go(at.y);
    mc.go(at.m);
    dc.go(at.d);
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
  KN.screens.notes = { mount, render, dockButton, open: openNote, colorOf, COLORS: TAG_COLORS, COLOR_NAMES };
})();
