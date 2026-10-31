/* =========================================================
   くらしノート — ノート（下の帯の五つめの席）

   決めごとは docs/notes.md。2026年10月11日までは daily の紙の裏（地）だったので、
   いまも**紙を持たない**地のまま——画面そのものが送ります。暦も持ちません。

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
  /* 面の重なり（段1。docs/notes-unify.md「画面」）。いちばん下はホーム。記憶だけに持ちます。
     { k: "home" } ／ { k: "list" }（すべてのノート＝今の一覧）／ { k: "ask" }（問い）。y は降りる前の送り。
     ノートブックは面にしない——ホームの木でその場に開く（③。利用者「面が次々に移ると階層が見えづらい」）。 */
  let pages = [{ k: "home" }];
  const page = () => pages[pages.length - 1];
  /* 開いている書く紙（重ねた順）。道すじの親へ戻るとき、重ねた紙にあればそこまで閉じる。 */
  const papers = [];
  /* 左の木を出す幅（段1b）。幅の広い画面（desk。iPad の横・パソコン）と同じ境目——base.css・screens.css の
     「幅の広い画面」の @media と同じ数（docs/desk.md）。 */
  const WIDE = "(min-width: 840px)";
  /* 三列（1280px〜）：ノートの席で開いたノートは、紙ではなく右の段に据える（木｜一覧｜本文。docs/desk.md）。
     覆いが無いので一覧も押せる——ほかのノートを押せば入れ替わり、席を移れば閉じる（onLeave）。 */
  const PANE = "(min-width: 1280px)";
  const docked = () => window.matchMedia(PANE).matches && document.documentElement.dataset.screen === "notes";
  /* 電話を横にした（base.css の「portrait only」と同じ式）。 */
  const sideways = window.matchMedia("(orientation: landscape) and (max-height: 520px) and (min-aspect-ratio: 3/2) and (pointer: coarse)");
  const treeOpen = new Set();      // 開いた枝（"nb:名前" かノートの id）。ホームの木と左の木で一つ。記憶だけに持ちます
  let treeEl = null;
  let seeking = false;             // さがす窓に指が入っている
  /* ホームの木の印：木から開いて閉じたノート（homeCur）か、道すじから戻ったノートブック（homeNb）。 */
  let homeCur = null;
  let homeNb = null;

  const N = () => KN.notes;
  /* 紙を画面いっぱいにするか（端末ごと。記録には入れない）。 */
  const FULL = "kn-note-wide";
  /* 見たまま（js/note-live.js）でなく印で書く端末（「⋯」から。記録・控えに入れない）。 */
  const MARKS = "kn-note-marks";
  const marksPref = () => { try { return !!localStorage.getItem(MARKS); } catch (_) { return false; } };

  /* 種と問いは、独り立ちの入力にしないでタグ（思考のホーム。docs/thinking.md）。タグの小窓には、まだ
     どのノートにも無くてもこの二つを並べる（押せば付く）。問いの一覧は「問い」のノートも引く。 */
  const SEED_TAG = "種";
  const ASK_TAG = "問い";

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
     名前から決まった一色。置き場は `KN.notes.colors()`（ノートの入れ物。読めない日は前の
     `settings.noteColors`）——無い・知らない色は名前の色へ戻る。kind は "nb"・"tag"。 */
  function colorOf(kind, name) {
    const all = KN.notes ? KN.notes.colors() : (KN.store.get().settings || {}).noteColors;
    const m = all && typeof all === "object" ? all[kind] : null;
    const c = m && typeof m === "object" && Object.prototype.hasOwnProperty.call(m, name) ? m[name] : null;
    return TAG_COLORS.includes(c) ? c : hashColor(name);
  }
  const dot = (t) => html`<span class="chip-dot" style="--cat:${colorOf("tag", t)}"></span>`;
  /* ノートブックの本の絵にも色（2026年10月1日、利用者が「それぞれに色が欲しい」）。 */
  /* 6つの棚は棚の絵と色（2026年10月15日、利用者の頼み）。 */
  const book = (b) => (SHELF[b] ? html`<span class="nb-ico" data-shelf="${b}">${shelfIcon(SHELF[b].ico)}</span>`
    : html`<span class="nb-ico" style="--cat:${colorOf("nb", b)}">${icon("book")}</span>`);

  function mount(el) {
    root = el;
    root.innerHTML = "";
    /* 上の帯は画面の外（js/head.js）。 */
    root.append(node(html`
      <div class="stack">
        <div class="search-wrap js-search-wrap">
          <div class="search-bar">
            ${icon("search")}
            <input class="search-input js-search" placeholder="ノートをさがす" aria-label="ノートをさがす"
                   autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button class="icon-btn js-search-clear is-sm" aria-label="検索をクリア" hidden>${icon("close")}</button>
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

    /* 三列の真ん中は探すあいだも出す（docs/desk.md）。虫めがね・⌘K は窓に指を入れるので、その前に出しておく。 */
    const unseek = () => { if (!els.search.value && document.activeElement !== els.search) { seeking = false; paintMid(); } };
    els.searchBtn.addEventListener("click", () => {
      if (!els.mine()) return;
      seeking = true;
      paintMid();
      setTimeout(unseek);              // 押して閉じたとき
    });
    /* 一覧を押して窓を離れたときは、押し終えてから（先に畳むと押した行が消える）。 */
    els.search.addEventListener("blur", () => {
      if (root.matches(":active")) window.addEventListener("pointerup", () => setTimeout(unseek), { once: true });
      else unseek();
    });
    KN.ui.wireSearch(els, () => renderBody(), (q) => { query = q; });

    /* 読み終えた・★・消した・戻した。打つたびには来ません（紙を閉じたときに
       組み直します）。 */
    N().onChange(() => { if (root) renderBody(); });

    /* 降りた面は、右へ払って戻る（段1b。iPhone で「‹ しかない」）。左端でなくても、面のどこからでも（段2の前、
       利用者「左から右へどこからでも」）。引くあいだ一つ上の面を後ろに組んで見せ、戻ると決めたら写しを外して
       その場で組み直す（前は空いた後ろへ滑り出てから、組み直した面を滑り込ませていて、ぎこちなかった）。 */
    if (KN.edgeBack) {
      KN.edgeBack.wire({
        el: root,
        edge: Infinity,
        busy: () => pages.length < 2 || !!query || !!document.querySelector(".sheet"),
        begin: () => {
          const under = underPage();
          const off = () => { if (under) under.remove(); KN.edgeBack.clear(els.body); };
          return { top: els.body, under, clip: !!under, commit: () => { off(); back(); }, cancel: off };
        },
      });
    }
    /* ホームの中身は木の有無で変わる（deskHome）。組み直せば木も塗る。 */
    window.matchMedia(WIDE).addEventListener("change", () => renderBody());
  }

  /** 引くあいだ後ろに見せる、一つ上の面の写し（押せない）。戻ったときの送りの位置に合わせ、
      見えている高さだけに切る（送る器の中身を伸ばさない）。 */
  function underPage() {
    const sc = KN.app.scrollerOf(root);
    const below = pages[pages.length - 2];
    if (!sc || !below || N().state() !== "on") return null;
    /* 測るのは書く前に、まとめて（docs/traps.md） */
    const sr = sc.getBoundingClientRect(), br = els.body.getBoundingClientRect();
    const top = sc.scrollTop, ch = sc.clientHeight, sh = sc.scrollHeight, hc = els.body.offsetHeight;
    const wrap = node(html`<div class="notes-under" aria-hidden="true"><div class="notes-ground"></div></div>`);
    const box = wrap.firstElementChild;
    fill(box, N().tree(), below, 0);
    wrap.style.clipPath = "inset(0 100% 0 0)";
    sc.append(wrap);
    /* 組み直すと送りは below.y へ。中身が短ければブラウザが詰めるので、同じだけ詰めておく。 */
    const y = Math.min(below.y || 0, Math.max(0, sh - hc + box.offsetHeight - ch));
    const at = br.top - sr.top;            // いまの面の頭（見えている枠の中で）
    const cut = Math.max(0, at);           // それより上（さがす窓）には写さない
    wrap.style.top = `${top + cut}px`;
    wrap.style.height = `${ch - cut}px`;
    wrap.style.left = `${br.left - sr.left}px`;
    wrap.style.width = `${br.width}px`;
    box.style.marginTop = `${at + top - y - cut}px`;
    KN.edgeBack.rest(wrap);
    return wrap;
  }

  function render() {
    if (!root) return;
    /* ノートの席は暦を持ちません（docs/notes.md「五つめの席」）。帯は題「Notes」・さがす・設定だけ。 */
    KN.head.putCal("notes", null);
    /* 季節の絵（3.0 の E1）。今日の候の色と広重を地の後ろに（daily は写真。docs/season-art.md）。 */
    if (KN.seasonArt) KN.seasonArt.apply(root, U.todayKey(), "notes");
    /* 敷くのは帯の後ろの一枚（帯の上端から画面の下まで。css の「ノートは上から一枚の絵」）。
       画面の印（data-season）はカードの透かしと試験のために残す。 */
    if (KN.seasonArt) KN.seasonArt.apply(document.getElementById("head"), U.todayKey(), "notes");
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
  /* 画像の参照の行（段5）は探さない。 */
  const hit = (n, q) => !q || U.foldKana(`${n.title}\n${KN.noteFormat.searchable(n.body)}\n${n.notebook}\n${n.tags.join("\n")}`).includes(q);

  const picked = (n) => !pick
    || (pick.k === "fav" ? n.fav
      : pick.k === "nb" ? n.notebook === pick.v
        : n.tags.includes(pick.v));

  function renderBody(jump) {
    if (!els.body) return;
    if (carrying()) { owedPaint = true; return; }
    const box = els.body;
    paintTitle();
    /* チップの列は組み直しても横の位置を保ちます（右のほうのチップを押した
       とたんに、列が頭へ戻らないように）。 */
    const was = box.querySelector(".notes-chips");
    const keepX = was ? was.scrollLeft : 0;
    /* 縦の送りも保ちます。空にした瞬間に器が縮んで 0 へ詰められ、読んで
       戻ると一覧の頭へ飛ばされていました（2026年10月11日、利用者）。 */
    const sc = root ? KN.app.scrollerOf(root) : null;
    const keepY = sc ? sc.scrollTop : 0;
    box.innerHTML = "";
    const st = N().state();
    if (st === "off") {
      box.append(node(html`<p class="notes-off">ノートを開けませんでした</p>`));
      return;
    }
    if (st !== "on") return;

    fill(box, N().tree(), page(), keepX);
    const y = jump == null ? keepY : jump;
    if (sc && sc.scrollTop !== y) sc.scrollTop = y;
    paintTree();
  }

  /** 面 p の中身を box へ。探しているあいだは、どの面からでも今の一覧（平らに全部）。 */
  function fill(box, t, p, keepX) {
    if (query || p.k === "list") listBody(box, t, keepX);
    else if (p.k === "ask") askBody(box);
    else homeBody(box, t);
  }

  /** 今の一覧そのまま（すべてのノート）：絞り込みのチップ・カード・最近削除した項目。 */
  function listBody(box, t, keepX) {
    let all = N().list();
    if (byCreated()) all = all.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const chips = chipRow(all);
    if (chips) { box.append(chips); chips.scrollLeft = keepX; }

    box.append(cards(all.filter((n) => picked(n) && hit(n, query)), t));

    /* 最近削除した項目は、探していないときだけ、いちばん下に一行。 */
    if (!query && N().trash().length) {
      const b = node(html`<button class="notes-trash-row js-trash">最近削除した項目</button>`);
      b.addEventListener("click", () => { KN.motion.fire("select"); openTrash(); });
      box.append(b);
    }
  }

  /* ---------------- 面（段1） ---------------- */

  const secTitle = (text) => node(html`<div class="notes-sec"><div class="section-title">${text}</div></div>`);

  /** ホーム：「すべてのノート」「問い」・★・最近直した（行）・ノートブックの木。数は出しません。
      ノートブックを足すのは設定、新しいノートは右下の＋（docs/notes.md「6つの棚」）。 */
  function homeBody(box, t) {
    const all = N().list();
    /* 左の列に木がある幅では、ホームは最近直したノートの札（木と同じものを二度出さない。docs/desk.md 段7・P2）。 */
    if (deskHome()) { box.append(recentCards(recentOf(all, 12))); return; }
    const gates = node(html`<div class="notes-books nt-gates" role="list"></div>`);
    const gate = (label, mark, to, cls) => {
      const b = node(html`<button type="button" class="nt-gate notes-book ${cls}" role="listitem">${mark}<span class="nt-name">${label}</span></button>`);
      b.addEventListener("click", () => { KN.motion.fire("select"); go(to); });
      gates.append(b);
    };
    gate("すべてのノート", icon("notes"), { k: "list" }, "js-all");
    gate("問い", icon("thought"), { k: "ask" }, "js-asks");
    box.append(gates);
    const favs = all.filter((n) => n.fav);
    if (favs.length) { box.append(secTitle("★")); box.append(flatRows(favs)); }
    /* 取り込んだまま触っていないノートは出さない（Notion は取り込んだ時刻が直した日になる。答えの12）。 */
    const recent = recentOf(all);
    if (recent.length) { box.append(secTitle("最近直した")); box.append(flatRows(recent)); }
    /* 6つの棚があれば、棚ごとに色のカード。 */
    const shelves = N().notebooks().some((nb) => SHELF[nb]);
    const tree = node(html`<div class="notes-books ${shelves ? "has-shelves" : ""}" role="tree" aria-label="ノートブック"></div>`);
    const c = homeCur ? N().get(homeCur) : null;
    bookRows(tree, t, {
      open: treeOpen, stick: true, shelves,
      cur: c && !t.isHead(c.id) ? c.id : null,
      curNb: homeNb != null ? homeNb : c && t.isHead(c.id) ? c.notebook : null,
      onNote: (n, el) => openNote(n.id, el, { tree: true, back: TREE_ROW }),
      redraw: () => renderBody(),
    });
    box.append(tree);
    carry(tree, { scope: "books", open: treeOpen, scroller: () => KN.app.scrollerOf(root),
      root: () => root && root.querySelector(TREE_ROW.replace(" .nt-row", "")) });
  }

  /** 空のノートブックを作る（名前を訊いて、終わりに。docs/notes-unify.md「並び」）。作った名前を返す。 */
  function newBook() {
    return KN.ui.prompt({ title: "ノートブックを追加", label: "名前", okLabel: "追加" }).then((v) => {
      const nb = String(v || "").trim();
      if (!nb || N().state() !== "on" || !N().addBook(nb)) return null;
      U.haptic();
      return nb;
    });
  }

  const recentOf = (all, k) => all.filter((n) => !n.src || !n.src.batch || String(n.updatedAt) > String(n.src.batch)).slice(0, k || 3);

  /* 左の列に木が出ている（広い幅で、列を畳んでいない）。木の出し入れは css の「左の木」と同じ条件。 */
  const deskHome = () => window.matchMedia(WIDE).matches && !document.documentElement.classList.contains("rail-fold");

  /** 札の日付＝直した日。今年なら月日だけ、今日なら時刻。 */
  function editedOf(n) {
    const d = new Date(n.updatedAt);
    if (isNaN(d.getTime())) return "";
    if (U.dayKey(d) === U.todayKey()) return hm(d);
    const md = `${d.getMonth() + 1}月${d.getDate()}日`;
    return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}年${md}`;
  }

  /** 最近直したノートの札（desk のホーム）：題・頭の数行・日付。押すと紙（1280px〜は右の段）。 */
  function recentCards(list) {
    const box = node(html`<div class="nt-cards" role="list" aria-label="最近直した"></div>`);
    list.forEach((n) => {
      const c = node(html`
        <button type="button" class="nt-card" role="listitem" data-id="${n.id}">
          <span class="nt-card-title">${headOf(n) || "ノート"}</span>
          <span class="nt-card-lead">${leadOf(n)}</span>
          <span class="nt-card-when">${n.notebook ? book(n.notebook) : ""}${editedOf(n)}</span>
        </button>`);
      c.addEventListener("click", () => { KN.motion.fire("select"); openNote(n.id, c, { back: ".nt-cards .nt-card" }); });
      box.append(c);
    });
    return box;
  }

  /** 行だけの短い並び（★・最近直した）：ノートブックの小さな絵と題。押すと紙（閉じるとこの行へ縮んで戻る）。 */
  function flatRows(list) {
    const box = node(html`<div class="notes-books notes-flat" role="list"></div>`);
    list.forEach((n) => {
      const r = node(html`
        <button type="button" class="nt-row is-flat" role="listitem" data-id="${n.id}">
          ${n.notebook ? book(n.notebook) : html`<span class="nb-ico is-blank">${icon("book")}</span>`}<span class="nt-name">${headOf(n) || "ノート"}</span>
        </button>`);
      r.addEventListener("click", () => { KN.motion.fire("select"); openNote(n.id, r, { back: ".notes-flat .nt-row" }); });
      box.append(r);
    });
    return box;
  }

  /* ---------------- 木の行（③。ホーム・左の木・紙の中のノートで同じ。docs/notes-unify.md「画面」） ----------------
     ▸ でその場に開き、名前で開く（ノートは紙。ノートブックは、頭のある冊なら頭の紙、無ければその場で開く）。
     段ごとに縦の線（先祖の ▸ の真ん中）。開いた枝の三段までは、その枝を送るあいだ上に留まる（.is-stick。
     留まるのは自分の群の中だけ）。5段目から先は字下げを半分ずつ（深くても題が読める幅を残す）。 */
  const TREE_ROW = '.notes-books[role="tree"] .nt-row';
  const unit = (d) => (d <= 4 ? d : 4 + (d - 4) / 2);
  function rowLook(d, open, stick) {
    const at = [];
    for (let k = 0; k < d; k++) at.push(`calc(var(--nt-base) + ${unit(k)} * var(--nt-step) + var(--nt-mid)) 0`);
    const lines = d ? `background-image:${Array(d).fill("var(--nt-line)").join(",")};background-position:${at.join(",")};` : "";
    return { cls: stick && open && d < 3 ? "is-stick" : "", style: `--d:${d};--u:${unit(d)};${lines}` };
  }
  const twistOf = (has, open) => (has
    ? html`<span class="nt-twist" role="button" aria-label="${open ? "閉じる" : "開く"}">${icon("chevron")}</span>`
    : html`<span class="nt-twist is-leaf" aria-hidden="true"></span>`);
  const flip = (set, key) => { if (set.has(key)) set.delete(key); else set.add(key); };

  /** ノートの行を box へ。開いた枝は、その行と同じ群の中に続けて。
      o … { open: Set, kids(n), cur（印の id）, stick, onNote(n, 行), redraw() } */
  function treeRows(box, list, d, o) {
    list.forEach((n) => {
      const kids = o.kids(n);
      const open = kids.length > 0 && o.open.has(n.id);
      const look = rowLook(d, open, o.stick);
      const g = node(html`<div class="nt-grp" role="none"></div>`);
      const r = node(html`
        <button type="button" class="nt-row js-tree-note ${look.cls}" role="treeitem" data-id="${n.id}" data-d="${d}" style="${look.style}"
                ${N().isTable(n) ? html`data-table="1"` : ""}
                ${n.id === o.cur ? html`aria-current="true"` : ""} ${kids.length ? html`aria-expanded="${String(open)}"` : ""}>
          ${twistOf(kids.length, open)}${N().isTable(n) ? html`<span class="nt-ico">${icon("rows")}</span>` : ""}<span class="nt-name">${headOf(n) || "ノート"}</span>
        </button>`);
      r.addEventListener("click", (e) => {
        KN.motion.fire("select");
        if (kids.length && e.target.closest(".nt-twist")) { slide(r, () => { flip(o.open, n.id); o.redraw(); }); return; }
        o.onNote(n, r);
      });
      g.append(r);
      if (open) treeRows(g, kids, d + 1, o);
      else if (kids.length) springs.set(r, () => { o.open.add(n.id); opened(r); treeRows(g, kids, d + 1, o); });
      box.append(g);
    });
  }

  /* ▸ の開け閉めは、枝が下へ伸び縮みする（--m-grow。docs/motion.md の JS の表「枝」）。決めごとと組み直しは
     その場で（run）、動きは組み直したあとの群の高さだけ。畳むときは前の中身を一時借りて縮め、終わったら外す。 */
  function slide(r, run) {
    const was = r.getAttribute("aria-expanded") === "true";
    const kept = was ? [...r.parentElement.children].filter((x) => x !== r) : [];
    const sel = r.dataset.nb != null ? `.js-book[data-nb="${CSS.escape(r.dataset.nb)}"]`
      : r.dataset.fold != null ? `[data-fold="${CSS.escape(r.dataset.fold)}"]` : `.js-tree-note[data-id="${CSS.escape(r.dataset.id || "")}"]`;
    const ups = [];
    for (let a = r.parentElement; a; a = a.parentElement) ups.push(a);
    run();
    if (KN.motion.still()) return;
    const at = ups.find((a) => a.isConnected);
    const r1 = at && at.querySelector(sel);
    if (!r1 || r1 === r) return;
    const g = r1.parentElement;
    if (was) { kept.forEach((x) => { x.inert = true; }); g.append(...kept); }
    if (g.lastElementChild === r1) return;
    const full = g.getBoundingClientRect().height;
    const shut = full - (g.lastElementChild.getBoundingClientRect().bottom - r1.getBoundingClientRect().bottom);
    const opt = { duration: KN.motion.ms("--m-grow"), easing: KN.motion.ease("--ease") };
    g.style.overflow = "clip";
    const anim = g.animate([{ height: `${was ? full : shut}px` }, { height: `${was ? shut : full}px` }], opt);
    const tw = r1.querySelector(".nt-twist svg");
    if (tw) tw.animate([{ rotate: was ? "90deg" : "0deg" }, { rotate: was ? "0deg" : "90deg" }], opt);
    const end = () => { g.style.overflow = ""; kept.forEach((x) => x.remove()); };
    anim.onfinish = end;
    anim.oncancel = end;
  }

  /* 運んでいるあいだ、閉じた枝をその場で開く口（js/note-drag.js の expand。組み直すと運んでいる行が外れる）。 */
  const springs = new WeakMap();
  const opened = (r) => {
    r.setAttribute("aria-expanded", "true");
    const tw = r.querySelector(".nt-twist");
    if (tw) tw.setAttribute("aria-label", "閉じる");
  };
  /** 木の器に、つまんで運ぶ・キーで動かすを付ける（docs/notes-unify.md「並び」）。 */
  function carry(box, o) {
    if (!KN.noteDrag) return;
    KN.noteDrag.attach(box, {
      ...o,
      expand: (r) => { const f = springs.get(r); if (f) { springs.delete(r); f(); } },
      done: () => { if (owedPaint) { owedPaint = false; renderBody(); } },
    });
  }
  /* 運んでいるあいだに来た組み直し（store の変わり目など）は、離してから一度。 */
  let owedPaint = false;
  const carrying = () => !!(KN.noteDrag && KN.noteDrag.isActive());

  /** ノートブックの行と、その中の木（表の行は並べない）。名前は、頭のある冊なら頭の紙、無ければその場で開く。
      ＋でその冊に書く（頭のある冊は頭の中に）。終わりにノートブックの無いノートの木。
      o … treeRows と同じ（kids は要らない）＋ curNb（印を付けるノートブック）。 */
  function bookRows(box, t, o) {
    const sub = { ...o, kids: (n) => t.branch(n.id) };
    /* 棚のカード（o.shelves。ホームだけ）：6つの棚が先に、ほかの冊とノートブックの無いノートは白いカードに。
       棚の見出しは ▸ を右端に、＋は持たない（新しいノートは右下の＋。10月16日、利用者）。 */
    const rest = o.shelves ? node(html`<div class="nt-plain" role="none"></div>`) : box;
    const all = N().notebooks();
    const order = o.shelves ? all.filter((nb) => SHELF[nb]).concat(all.filter((nb) => !SHELF[nb])) : all;
    order.forEach((nb) => {
      const key = `nb:${nb}`;
      const shelf = o.shelves ? SHELF[nb] : null;
      if (shelf) seedShelf(nb, key, o.open);
      const tops = t.tops(nb);
      const h = t.head(nb);
      const open = tops.length > 0 && o.open.has(key);
      const look = rowLook(0, open, o.stick);
      const g = node(html`<div class="nt-grp ${shelf ? "nt-shelf" : ""}" role="none" ${shelf ? html`data-shelf="${nb}"` : ""}></div>`);
      const r = node(html`
        <button type="button" class="nt-row is-book js-book ${look.cls}" role="treeitem" data-nb="${nb}" ${h ? html`data-id="${h.id}"` : ""} data-d="0" style="${look.style}"
                ${o.curNb === nb ? html`aria-current="true"` : ""} ${tops.length ? html`aria-expanded="${String(open)}"` : ""}>
          ${shelf ? html`<span class="nt-shelf-ico">${shelfIcon(shelf.ico)}</span><span class="nt-name">${nb}</span>${twistOf(tops.length, open)}`
    : html`${twistOf(tops.length, open)}${book(nb)}<span class="nt-name">${nb}</span><span class="nt-add" role="button" aria-label="${nb} に書く">${icon("plus")}</span>`}
        </button>`);
      r.addEventListener("click", (e) => {
        KN.motion.fire("select");
        if (e.target.closest(".nt-add")) { openNote(null, r, { ...(h ? { parent: h.id } : { nb }), tree: true, back: TREE_ROW }); return; }
        if (h && !e.target.closest(".nt-twist")) { o.onNote(h, r); return; }
        if (tops.length) slide(r, () => { flip(o.open, key); if (!(shelf && keepShelf(nb, o.open.has(key)))) o.redraw(); });
      });
      g.append(r);
      const fold = shelf && FOLD[nb] ? splitOld(tops, t, FOLD[nb]) : null;
      const shown = fold ? fold.keep : tops;
      const tail = () => { if (fold && fold.old.length) foldRows(g, nb, fold.old, o); };
      if (open) { treeRows(g, shown, 1, sub); tail(); }
      else if (tops.length) springs.set(r, () => { o.open.add(key); opened(r); treeRows(g, shown, 1, sub); tail(); });
      (shelf ? box : rest).append(g);
    });
    treeRows(rest, t.tops(""), 0, sub);
    if (rest !== box && rest.childElementCount) box.append(rest);
  }

  /* 前のもの（docs/notes-structure.md の段1）：棚の一段目で、★でも束でもなく、決めた日数触っていないノートを、
     棚の終わりの一行に畳む。開けば月ごと（新しい月から、月の中は並びの順）。見せ方だけ——並び・データは動かさず、
     直せば元の位置へ戻る。取り込んだまま触っていないものも畳む（「最近直した」と同じ見方）。数は出さない。
     畳んだ行は運ばない（.js-tree-note を付けない＝note-drag の的にも隣にもならない）。 */
  const FOLD = { thinking: 30 };
  const DAY_MS = 86400000;
  function splitOld(tops, t, days) {
    const edge = new Date(Date.now() - days * DAY_MS).toISOString();
    const keep = [], old = [];
    tops.forEach((n) => {
      const idle = (n.src && n.src.batch && String(n.updatedAt) <= String(n.src.batch)) || String(n.updatedAt || "") < edge;
      (!n.fav && !t.kids(n.id).length && idle ? old : keep).push(n);
    });
    return { keep, old };
  }
  function monthOf(n) {
    const d = new Date(n.updatedAt);
    if (Number.isNaN(d.getTime())) return { key: "", label: "日付なし" };
    const y = d.getFullYear(), m = d.getMonth() + 1;
    return { key: `${y}-${String(m).padStart(2, "0")}`, label: y === new Date().getFullYear() ? `${m}月` : `${y}年${m}月` };
  }
  function foldRows(box, nb, old, o) {
    const key = `old:${nb}`;
    if (old.some((n) => n.id === o.cur)) o.open.add(key);
    const months = new Map();
    old.forEach((n) => {
      const m = monthOf(n);
      if (!months.has(m.key)) months.set(m.key, { ...m, list: [] });
      months.get(m.key).list.push(n);
      if (n.id === o.cur) o.open.add(`${key}:${m.key}`);
    });
    const fold = (into, k, d, label, cls, fill) => {
      const open = o.open.has(k);
      const look = rowLook(d, open, o.stick);
      const g = node(html`<div class="nt-grp" role="none"></div>`);
      const r = node(html`
        <button type="button" class="nt-row ${cls} ${look.cls}" role="treeitem" data-fold="${k}" data-d="${d}" style="${look.style}" aria-expanded="${String(open)}">
          ${twistOf(true, open)}<span class="nt-name">${label}</span>
        </button>`);
      r.addEventListener("click", () => {
        KN.motion.fire("select");
        slide(r, () => { flip(o.open, k); o.redraw(); });
      });
      g.append(r);
      if (open) fill(g);
      into.append(g);
    };
    fold(box, key, 1, "前のもの", "is-fold", (g) => {
      [...months.values()].sort((a, b) => (a.key < b.key ? 1 : -1)).forEach((m) => {
        fold(g, `${key}:${m.key}`, 2, m.label, "is-month", (mg) => m.list.forEach((n) => mg.append(oldRow(n, o))));
      });
    });
  }
  function oldRow(n, o) {
    const look = rowLook(3, false, false);
    const r = node(html`
      <button type="button" class="nt-row js-old-note" role="treeitem" data-id="${n.id}" data-d="3" style="${look.style}"
              ${n.id === o.cur ? html`aria-current="true"` : ""}>
        ${twistOf(0, false)}<span class="nt-name">${headOf(n) || "ノート"}</span>
      </button>`);
    r.addEventListener("click", () => { KN.motion.fire("select"); o.onNote(n, r); });
    const g = node(html`<div class="nt-grp" role="none"></div>`);
    g.append(r);
    return g;
  }

  /* 6つの棚（docs/notes.md「6つの棚」）。開け閉めは設定 notesShelfOpen に（無ければ archive だけ閉じる）。
     ほかの冊の開け閉めは今までどおり記憶だけ。 */
  const SHELF = {
    thinking: { ico: "bulb" },
    reading: { ico: "study" },
    teaching: { ico: "chalkboard" },
    learning: { ico: "gradCap" },
    living: { ico: "home" },
    archive: { ico: "tidyBox" },
  };
  const shelfIcon = (k) => { const s = KN.iconsTodo && KN.iconsTodo.byKey(`do-${k}`); return s ? U.raw(s) : icon(k); };
  const seeded = new Set();
  function seedShelf(nb, key, open) {
    if (seeded.has(nb)) return;
    seeded.add(nb);
    const m = (KN.store.get().settings || {}).notesShelfOpen || {};
    if (nb in m ? !!m[nb] : nb !== "archive") open.add(key); else open.delete(key);
  }
  /** 開け閉めを覚える。ノートの面が出ていれば store の subscribe が組み直すので true（自分では組まない）。 */
  function keepShelf(nb, on) {
    KN.store.update((s) => { s.settings.notesShelfOpen = { ...(s.settings.notesShelfOpen || {}), [nb]: on }; });
    return KN.app.activeScreen() === "notes";
  }

  /** 木から開いた紙を閉じたら、ホームの木のその行に印（枝を開く。表の行なら表のノート、頭なら冊の行）。 */
  function reveal(id) {
    const t = N().tree();
    let n = N().get(id);
    homeNb = null;
    if (!n || n.deletedAt) { homeCur = null; return; }
    const up = t.parentOf(n.id);
    if (up && !t.branch(up.id).includes(n)) n = up;
    homeCur = n.id;
    if (n.notebook && !t.isHead(n.id)) treeOpen.add(`nb:${n.notebook}`);
    t.path(n.id).forEach((p) => { if (!t.isHead(p.id)) treeOpen.add(p.id); });
  }

  /** 印の行が見えていなければ、送る器の真ん中へ。 */
  function showCur() {
    const sc = root ? KN.app.scrollerOf(root) : null;
    const r = els.body ? els.body.querySelector(`${TREE_ROW}[aria-current="true"]`) : null;
    if (!sc || !r) return;
    const a = sc.getBoundingClientRect();
    const b = r.getBoundingClientRect();
    if (b.top >= a.top && b.bottom <= a.bottom - 96) return;
    sc.scrollTop += b.top - a.top - (a.height - b.height) / 2;
  }

  /**
   * 問い（思考のホーム。docs/thinking.md「問いの面」）：ノートの「？」で始まる行・タグ「問い」のノート・日記の「？」で
   * 始まる行。どこにもしまわず、開くたびに引く（写さず引く）。数は出さない。
   * 答えのノート（頭の行が「？問い」）は答える紙で続きを書く。中身があれば「続きから考える」（最後に書いた順）、
   * 頭の行だけ（＋でつくった問い）は「まだの問い」の頭。ほかの「？」の行は元のノート・その日の daily へ。
   * 一区切り（設定 askRest。問いの字の鍵 → 時刻）は畳んだ段へ。日記は、鍵で伏せている日・本文を読めない日は引かない。
   */
  function askRows() {
    const F = KN.noteFormat;
    const rows = [];
    N().list().forEach((n) => {
      if (n.tags.includes(ASK_TAG)) rows.push({ n, text: headOf(n) || "", at: n.updatedAt });
      F.asks(n.body).forEach((a) => {
        const r = { n, line: a.line, text: a.text, at: n.updatedAt };
        if (a.line === 0) r.go = n.body.split("\n").slice(1).join("\n").trim() ? "go" : "new";
        rows.push(r);
      });
    });
    if (!(KN.lock && KN.lock.hides("daily")) && (!KN.diaryIdb || KN.diaryIdb.body() === "ok")) {
      (KN.store.get().archive.days || []).forEach((d) => {
        F.asks(d.memo || "").forEach((a) => rows.push({ day: d.date, text: a.text, at: d.date }));
      });
    }
    return rows.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  }
  const askRest = () => { const m = (KN.store.get().settings || {}).askRest; return m && typeof m === "object" && !Array.isArray(m) ? m : {}; };
  function setRest(q, on) {
    KN.store.update((s) => {
      const m = { ...askRest() };
      if (on) m[askKey(q)] = new Date().toISOString(); else delete m[askKey(q)];
      s.settings.askRest = m;
    });
  }

  function askBody(box) {
    const rows = askRows();
    const rest = askRest();
    /* 同じ問いは一度だけ（答えのノートが先）。一区切りは畳んだ段へ。 */
    const seen = new Set(), go = [], made = [], left = [], resting = [];
    rows.filter((r) => r.go).concat(rows.filter((r) => !r.go)).forEach((r) => {
      const k = askKey(r.text);
      if (seen.has(k)) return;
      seen.add(k);
      if (rest[k]) resting.push(r);
      else (r.go === "go" ? go : r.go === "new" ? made : left).push(r);
    });
    made.sort((x, y) => String(y.n.createdAt).localeCompare(String(x.n.createdAt)));
    const yet = askItems().filter((a) => !seen.has(askKey(a.q)) && !rest[askKey(a.q)]);
    const restYet = askItems().filter((a) => !seen.has(askKey(a.q)) && rest[askKey(a.q)]);

    const add = node(html`<div class="notes-list notes-asks is-new"><div class="note-row is-card is-ask"><button class="note-open notes-ask-new js-ask-new">${icon("plus")}<span class="note-t">問いをつくる</span></button></div></div>`);
    add.querySelector(".js-ask-new").addEventListener("click", () => { KN.motion.fire("select"); makeAsk(); });
    box.append(add);
    if (!rows.length && !yet.length && !restYet.length) { box.append(node(html`<p class="notes-asks-empty">問いはまだありません</p>`)); return; }

    const card = (r) => {
      const where = r.n ? (headOf(r.n) || "ノート") : `${U.formatDate(`${r.day}T00:00`)} の日記`;
      const el = node(html`
        <div class="note-row is-card is-ask">
          <button class="note-open js-open">
            <span class="note-t">${r.text}</span>
            <span class="note-foot">
              <span class="note-d">${r.n ? whenOf(r.n) : U.formatDate(`${r.day}T00:00`)}</span>
              ${r.go ? "" : html`<span class="note-nb">${r.n ? icon("notes") : icon("edit")}<span>${where}</span></span>`}
            </span>
          </button>
        </div>
      `);
      el.querySelector(".js-open").addEventListener("click", () => {
        KN.motion.fire("select");
        if (r.go) { answer(r.text); return; }
        if (r.n) { openNote(r.n.id, el, r.line != null ? { line: r.line } : null); return; }
        KN.app.showScreen("archive");
        if (KN.screens.archive && KN.screens.archive.goDay) KN.screens.archive.goDay(r.day);
      });
      return el;
    };
    const yetCard = (a) => {
      const el = node(html`
        <div class="note-row is-card is-ask is-yet">
          <button class="note-open js-answer"><span class="note-t">${a.q}</span>${a.from ? html`<span class="note-foot"><span class="note-d">${a.from}</span></span>` : ""}</button>
        </div>
      `);
      el.querySelector(".js-answer").addEventListener("click", () => { KN.motion.fire("select"); answer(a.q); });
      return el;
    };
    const listOf = (cls, items, fn) => { const l = node(html`<div class="notes-list notes-asks ${cls}"></div>`); items.forEach((x) => l.append(fn(x))); return l; };

    if (go.length) box.append(secTitle("続きから考える"), listOf("is-go", go, card));
    if (made.length || yet.length) {
      box.append(secTitle("まだの問い"));
      if (made.length) box.append(listOf("is-yet is-made", made, card));
      /* 分け（g）ごとに小さな見出し。出典（from）があれば足に。 */
      let more = null, g = null;
      yet.forEach((a) => {
        if (!more || a.g !== g) {
          g = a.g;
          if (g) box.append(node(html`<div class="notes-sec is-sub"><div class="section-title">${g}</div></div>`));
          more = node(html`<div class="notes-list notes-asks is-yet"></div>`);
          box.append(more);
        }
        more.append(yetCard(a));
      });
    }
    if (left.length) box.append(secTitle("ノート・日記に残した問い"), listOf("is-left", left, card));
    if (resting.length || restYet.length) {
      const d = node(html`<details class="notes-rest"><summary class="notes-sec"><span class="section-title">一区切り</span>${icon("chevron")}</summary></details>`);
      d.append(listOf("is-rest", resting, card));
      restYet.forEach((a) => d.lastElementChild.append(yetCard(a)));
      box.append(d);
    }
  }

  /** ＋問いをつくる：頭の行が「？問い」だけのノート（答えのノートと同じ形。同期・控え・書き出しはノートのまま）。
      同じ問いがあればつくらず、その問いを開く。 */
  function makeAsk() {
    if (N().state() !== "on") return;
    const box = node(html`<label class="field"><textarea class="textarea js-q" rows="3" aria-label="問い" placeholder="問い" enterkeyhint="done"></textarea></label>`);
    const ta = box.querySelector(".js-q");
    let dup = null;
    const close = async () => {
      const q = ta.value.replace(/\s+/g, " ").trim().replace(/^[？?]\s*/, "");
      if (!q) return;
      const k = askKey(q);
      const hit = askRows().find((r) => askKey(r.text) === k);
      const item = askItems().find((a) => askKey(a.q) === k);
      if (hit || item) { dup = hit || { text: item.q, go: "yet" }; }
      else {
        const n = N().draft();
        n.body = `？${q}`;
        if (!N().put(n)) { KN.ui.toast("ノートに保存できませんでした"); return; }
        await N().flush();
        if (N().pending(n.id)) { KN.ui.toast("ノートに保存できませんでした"); return; }
      }
      if (dup) {
        const d = dup;
        KN.ui.toast("同じ問いがあります", { action: { label: "開く", onClick: () => {
          if (d.go) answer(d.text);
          else if (d.n) openNote(d.n.id, null, d.line != null ? { line: d.line } : null);
          else { KN.app.showScreen("archive"); if (KN.screens.archive && KN.screens.archive.goDay) KN.screens.archive.goDay(d.day); }
        } } });
      }
      if (root && page().k === "ask") renderBody();
    };
    onEnter(ta, () => h.close());
    const h = KN.ui.sheet({
      title: "問いをつくる",
      content: box,
      cls: "is-card",
      clear: true,
      guard: false,
      footer: node(html`<button class="btn btn-primary btn-block js-ok">保存する</button>`),
      onClose: close,
    });
    h.el.querySelector(".js-ok").addEventListener("click", () => { KN.motion.fire("select"); h.close(); });
    KN.ui.focusNow(ta);
  }

  /** 問いの面へ（daily の思考のホームの札から）。 */
  function asks() {
    if (page().k === "ask") { renderBody(0); return; }
    go({ k: "ask" });
  }

  /** 面を降りる・戻る。降りる前の送りを持っておき、戻ったらそこへ。 */
  function go(p) {
    const sc = root ? KN.app.scrollerOf(root) : null;
    page().y = sc ? sc.scrollTop : 0;
    pages.push(p);
    pick = null;
    renderBody(0);
  }
  function back() {
    if (pages.length < 2) return;
    pages.pop();
    renderBody(page().y || 0);
  }
  /** 帯の題：ホームは「Notes」、降りた面はその名前と ‹。 */
  function paintTitle() {
    if (!KN.head.notesTitle) return;
    const p = page();
    KN.head.notesTitle(p.k === "list" ? html`<span>すべてのノート</span>` : p.k === "ask" ? html`<span>問い</span>` : "",
      pages.length > 1 ? back : null, again);
    paintMid();
  }
  /** 三列（1280px〜）の真ん中の一覧を出すか：すべてのノート・問い・探しているときだけ。ホームは木｜本文の二列
      （ホームの中身は左の木と同じなので。docs/desk.md）。効くのは css の 1280px の中だけ。 */
  function paintMid() {
    document.documentElement.classList.toggle("notes-mid", page().k !== "home" || !!query || seeking);
  }
  /** 席をもう一度押したら、ホームへ。ホームに居れば断る（今までどおり）。 */
  function again() {
    if (pages.length < 2) return false;
    pages = [pages[0]];
    renderBody(pages[0].y || 0);
    return true;
  }

  /** カードの並び。o … { open(n, el) } 押したとき（無ければ書く紙を重ねる）。 */
  function cards(list, t, o) {
    const box = node(html`<div class="notes-list"></div>`);
    list.forEach((n) => box.append(row(n, t, o)));
    return box;
  }

  /* ---------------- 絞り込みのチップ（段3・roadmap-2.0 の V20） ----------------

     すべて・★・ノートブック ⌄・タグ ⌄。ノートブックとタグは名前を列に並べず、
     押すとそのすぐ下の小窓に（折り返して）並べます——前は全部を一列に並べて横へ
     流していて、タグが増えると探せなかった（10月4日、利用者）。選んだら、その札に
     名前が出ます。件数は出しません（daily の席なので）。「すべて」のほかに選べる
     ものが無ければ、列ごと出しません。 */
  function chipRow(all) {
    const hasFav = all.some((n) => n.fav);
    const books = N().notebooks({ used: true });
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

  function row(n, t, o) {
    const head = headOf(n);
    const lead = leadOf(n);
    /* 中のノートには、親の題を小さく添えます（段1）。 */
    const up = t ? t.parentOf(n.id) : null;
    const where = [n.notebook, up && !t.isHead(up.id) ? headOf(up) : ""].filter(Boolean).join(" › ");
    const el = node(html`
      <div class="note-row is-card" data-id="${n.id}">
        <button class="note-open js-open">
          <span class="note-t">${head}</span>
          ${lead ? html`<span class="note-x">${lead}</span>` : ""}
          <span class="note-foot">
            <span class="note-d">${whenOf(n)}</span>
            ${where ? html`<span class="note-nb">${n.notebook ? book(n.notebook) : ""}<span>${where}</span></span>` : ""}
            ${n.tags.map((t) => html`<span class="note-tag">${dot(t)}<span>${t}</span></span>`)}
          </span>
        </button>
        <button class="fav ${n.fav ? "is-on" : ""}" aria-pressed="${String(n.fav)}"
                aria-label="${head || "ノート"} に★を付ける">${icon("star")}</button>
      </div>
    `);
    el.querySelector(".js-open").addEventListener("click", () => (o && o.open ? o.open(n, el) : openNote(n.id, el)));
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
  /* from … 押した一覧のカード。紙はそのカードから膨らむ（段4.3）。
     o … { parent: 親の id（中に足す）, nb: ノートブック（その面の＋）, within: 戻り先のカードを探す場所,
           after: 閉じたあとに }（段1） */
  function openNote(id, from, o) {
    o = o || {};
    const st = N().state();
    if (st !== "on") {
      KN.ui.toast(st === "off" ? "ノートを開けませんでした" : "ノートを読み込んでいるところです");
      return;
    }
    const F = KN.noteFormat;
    const fresh = !id;
    const note = fresh ? N().draft() : N().get(id);
    if (!note) return;
    /* 右の段は一枚（中のノートから開いたものだけ重ねる）。同じノートならそのまま。 */
    const dock = docked() && !o.within;
    if (dock && papers.length) {
      if (!fresh && papers[papers.length - 1].id === id) return;
      closePapers();
    }
    if (fresh) {
      const up = o.parent ? N().get(o.parent) : null;
      if (up) { note.parent = up.id; note.notebook = up.notebook; }
      else if (o.nb) note.notebook = o.nb;
    }
    let stored = !fresh;
    /* 閉じたときの「更新しました」は、開いたときと比べて決めます。 */
    const look = (n) => JSON.stringify(n ? [n.title, n.body, n.notebook, n.tags, !!n.fav, n.createdAt, !!n.noTime] : null);
    const opened = fresh ? null : look(note);
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
        <nav class="note-path js-path" aria-label="道すじ" hidden></nav>
        <textarea class="note-title-in grow-field js-title" placeholder="タイトル" aria-label="タイトル"
                  rows="1" autocomplete="off" enterkeyhint="next"></textarea>
        <div class="note-sub">
          <button type="button" class="note-when js-when" aria-label="作った日">${stampOf(note.createdAt, note.noTime)}</button>
          <div class="note-labels js-labels"></div>
        </div>
        <div class="note-view js-view" hidden></div>
        <div class="note-view note-live js-live" aria-label="本文" data-own-scroll hidden></div>
        <div class="note-ink js-ink">
          <textarea class="note-body-in grow-field js-text" aria-label="本文" rows="6" data-own-scroll></textarea>
          <div class="note-hl js-hl" aria-hidden="true"></div>
        </div>
        <section class="note-kids js-kids"></section>
      </div>
    `);
    /* 頭の行のまん中：ノートブック。下へ送って大きな題が隠れたら、その
       上に題を小さく出す（Notion の形。情報が上にまとまる）。 */
    const mid = node(html`
      <div class="note-head-mid">
        <span class="note-head-t js-head-t" aria-hidden="true"></span>
        <button class="note-nb-btn js-nb"><span class="nb-ico">${icon("book")}</span><span class="js-nb-name"></span></button>
      </div>
    `);
    const headT = mid.querySelector(".js-head-t");
    const titleIn = body.querySelector(".js-title");
    const textIn = body.querySelector(".js-text");
    const viewEl = body.querySelector(".js-view");
    const ink = body.querySelector(".js-ink");
    const hl = body.querySelector(".js-hl");
    const liveEl = body.querySelector(".js-live");
    /* 値は欄へ直に入れます（テンプレートに書くと、textarea は頭の改行を
       一つ落とします——本文は打ったままの形で持つので。docs/notes.md）。 */
    titleIn.value = note.title;
    textIn.value = note.body;
    const paintHeadT = () => { headT.textContent = titleIn.value.trim(); };
    paintHeadT();
    /* 送る器（紙の本体）。欄の高さを測り直すあいだ、送った位置を持っておく
       ——測るために欄を一瞬 0 にすると、器の中身が縮んで送りが頭へ戻されて
       いた（打つたび・道具を押すたびに一番上へ飛び、iOS がカーソルを
       見えるぎりぎり＝キーボードの際へ送り直していた。2026年10月7日、iPhone）。 */
    const scroller = () => (h ? h.el.querySelector(".sheet-body") : null);
    /* 「一番下へ」を出すか見直す（紙を組んだあとで中身が入る）。 */
    let paintEnd = () => {};
    const keepScroll = (fn) => {
      const sc = scroller();
      const top = sc ? sc.scrollTop : 0;
      fn();
      if (sc && sc.scrollTop !== top) sc.scrollTop = top;
    };
    /* 題は折り返して全部見せます（長い本の題が右で切れて読めなかった。
       2026年10月1日、iPhone）。改行は持たない一行なので、貼った改行は空白に。 */
    const growTitle = () => U.fitFields || keepScroll(() => {
      titleIn.style.height = "0";
      titleIn.style.height = `${titleIn.scrollHeight}px`;
    });

    /* ---- 書いているあいだの色付け（10月7日、利用者「編集中も太字が反映されないと
       分からない」） ----

       欄（textarea）は字に色も太さも付けられない。欄の字は透かし、同じ字を同じ位置に
       並べた写し（.note-hl、KN.noteFormat.ink）を重ねる。打つ・変換・選ぶ・取り消すは
       欄のまま。写しの字の位置が欄とずれるとカーソルが字から外れるので、
       ・字の形は欄から写す（COPY）。
       ・欄の中の左右の空き（iOS の textarea は消せない空きを左右に持つ）は実測する
         （inkInset）。
       ・写しの高さが欄の字の高さと違ったら（折り返しがずれた）、その紙では色付けを
         やめて素の字に戻す（.is-plain）。 */
    const COPY = ["boxSizing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStyle",
      "fontFamily", "fontSize", "fontStyle", "fontWeight", "fontStretch", "fontVariant", "fontFeatureSettings",
      "lineHeight", "letterSpacing", "wordSpacing", "textAlign", "textIndent", "textTransform",
      "tabSize", "wordBreak", "overflowWrap", "lineBreak"];
    /* 写しに欄の字の形と幅を着せる。gap は欄の中の左右の空き。 */
    const dress = (el, w, gap) => {
      const cs = getComputedStyle(textIn);
      COPY.forEach((k) => { el.style[k] = cs[k]; });
      el.style.width = `${w}px`;
      el.style.textJustify = cs.textJustify || "";
      if (gap) {
        el.style.paddingLeft = `${(parseFloat(cs.paddingLeft) || 0) + gap}px`;
        el.style.paddingRight = `${(parseFloat(cs.paddingRight) || 0) + gap}px`;
      }
    };
    /* 欄の中の左右の空き。折り返す境目のまわりの長さの点の行を並べ、欄と写しで折り返しの
       数が揃う空きを探す（点は字の間で折れないので、幅の違いがそのまま折り返しの数に出る）。
       揃わなければ null。 */
    const inkInset = (w) => {
      const base = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;overflow:hidden;";
      const pd = document.createElement("div");
      pd.style.cssText = `${base}white-space:pre`;
      dress(pd, w, 0);
      pd.style.width = "auto";
      pd.textContent = ".".repeat(200);
      ink.append(pd);
      const dotW = pd.getBoundingClientRect().width / 200 || 5;
      const n0 = Math.max(1, Math.floor((w - 14) / dotW) - 2);
      const dots = Array.from({ length: Math.ceil(14 / dotW) + 6 }, (_, i) => ".".repeat(n0 + i)).join("\n");
      const pt = document.createElement("textarea");
      pt.className = "note-body-in";
      pt.style.cssText = `${base}width:${w}px;height:0;min-height:0`;
      pt.value = dots;
      ink.append(pt);
      const want = pt.scrollHeight;
      pt.remove();
      pd.style.whiteSpace = "pre-wrap";
      pd.textContent = dots;
      let found = null;
      for (const gap of [0, 3, 2, 4, 1, 5, 6]) {
        dress(pd, w, gap);
        pd.style.height = "0";
        pd.style.minHeight = "0";
        if (Math.abs(pd.scrollHeight - want) < 1) { found = gap; break; }
      }
      pd.remove();
      return found;
    };
    let inkW = -1;
    let inkGap = 0;
    const inkOn = () => !ink.classList.contains("is-plain") && !textIn.hidden;
    const paintInk = () => {
      if (!inkOn()) return;
      const w = textIn.getBoundingClientRect().width;
      if (!w) return;
      if (w !== inkW) {
        inkW = w;
        const gap = inkInset(w);
        if (gap == null) { ink.classList.add("is-plain"); return; }
        inkGap = gap;
        dress(hl, w, gap);
      }
      F.ink(textIn.value, hl);
    };

    /* 本文の欄は高さが伸びます（中で送らない。送るのは紙）。
       CSS が伸ばす端末では測らず、写しと高さが揃うかだけ見る。欄が下の限り（38vh）に
       居るあいだは中身の高さが見えないので、写しがはみ出さないかだけ。 */
    const fitGrow = () => {
      paintInk();
      if (!inkOn()) return;
      const th = textIn.offsetHeight;
      const hh = hl.offsetHeight;
      const atMin = th <= (parseFloat(getComputedStyle(textIn).minHeight) || 0) + 1;
      if (atMin ? hh > th + 1 : Math.abs(hh - th) > 1) ink.classList.add("is-plain");
    };
    const grow = () => (U.fitFields ? fitGrow() : keepScroll(() => {
      paintInk();
      const s = textIn.style;
      s.minHeight = "0";
      s.height = "0";
      const textH = textIn.scrollHeight;
      s.minHeight = "";
      s.height = `${textH}px`;
      if (inkOn() && Math.abs(hl.offsetHeight - textH) > 1) ink.classList.add("is-plain");
    }));

    /* カーソルの行の上下（欄の上端から）。欄は中で送らないので、同じ字と
       幅の写しを画面の外に流して測ります。 */
    let mirror = null;
    let mirrorW = -1;
    let lineBox = { lh: 28, pad: 0 };
    const caretBox = (at) => {
      if (!mirror) {
        mirror = document.createElement("div");
        mirror.setAttribute("aria-hidden", "true");
        mirror.append(document.createTextNode(""), document.createElement("span"));
        document.body.append(mirror);
      }
      /* 字の形を写すのは、幅が変わったときだけ（打つたびに写すと重い）。 */
      const w = textIn.getBoundingClientRect().width;
      if (w !== mirrorW) {
        mirrorW = w;
        const cs = getComputedStyle(textIn);
        mirror.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;"
          + "white-space:pre-wrap;height:auto;overflow:hidden;contain:layout style";
        dress(mirror, w, inkGap);
        lineBox = { lh: parseFloat(cs.lineHeight) || 28, pad: parseFloat(cs.paddingTop) || 0 };
      }
      const v = textIn.value;
      const end = v.indexOf("\n", at);
      const mark = mirror.lastChild;
      mirror.firstChild.nodeValue = v.slice(0, at);
      /* 行の残りも流す（折り返しは、カーソルのあとの字でも変わる）。 */
      mark.textContent = v.slice(at, end < 0 ? v.length : end) || "\u200b";
      /* 行の高さはどの行も同じ。印の箱の上端は字の上端（行の上端より行間の半分
         下）なので、行の上端へそろえる。 */
      const { lh, pad } = lineBox;
      const top = pad + Math.floor((mark.offsetTop - pad) / lh) * lh;
      return { top, bottom: top + lh, lh };
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
    /* 見たまま（js/note-live.js。docs/notes-unify.md「書き方：見たまま」）。本文の正は書く欄（textIn）のまま、
       書くあいだの画面だけ行の並び。開いて戻して一字でも違うノートと、印で書く端末は今の書く欄。 */
    let lv = false;
    const ed = () => (lv ? liveEl : textIn);
    /* 見たままの表のマスは欄の中の別の打つ欄（note-live.js の table）。 */
    const inEd = () => document.activeElement === ed() || (lv && liveEl.contains(document.activeElement));
    /** いまの本文（見たままで書いているあいだは並びから写した字が新しい）。 */
    const val = () => (lv && writing ? live.md() : textIn.value);
    /** 選んでいる範囲（本文の位置）。 */
    const selNow = () => (lv ? (live.sel() || lastSel) : [textIn.selectionStart, textIn.selectionEnd]);
    const setSel = (s, e) => { if (lv) live.place(s, e); else textIn.setSelectionRange(s, e); };
    const paintView = () => { F.render(textIn.value, viewEl); paintPics(); };
    /* 画像の行（段5。docs/image-design.md）：幅いっぱいの画像。見つからない・入れ物が開かない日は、
       灰色の枠に絵だけ（行は残る）。読むのは開いたノートが参照するものだけ。 */
    const showPic = (el, v) => {
      el.classList.remove("is-gone");
      el.textContent = "";
      if (v.w && v.h) el.style.aspectRatio = `${v.w} / ${v.h}`;
      const im = document.createElement("img");
      im.alt = "";
      im.src = v.url;
      el.append(im);
      el.classList.add("is-on");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", "画像");
    };
    /* ファイルの行（PDF）。手元に無ければ薄くして Dropbox から取る（開いたときに取っておく）。 */
    const paintFiles = () => {
      const D = KN.noteFile;
      viewEl.querySelectorAll(".nv-file").forEach((el) => {
        const id = el.dataset.file;
        if (D && D.known(id)) return;
        el.classList.add("is-away");
        if (!D) return;
        const name = el.textContent;
        D.look(id).then((url) => url || D.pull(id, name).then((ok) => (ok ? D.look(id) : null))).then((url) => {
          if (url && el.isConnected) el.classList.remove("is-away");
        });
      });
    };
    const paintPic = (el) => {
      const I = KN.noteImg;
      const id = el.dataset.img;
      const v = I && I.known(id);
      if (v) { showPic(el, v); return; }
      (I ? I.look(id) : Promise.resolve(null)).then((got) => {
        if (!el.isConnected) return;
        if (got) showPic(el, got);
        else { el.classList.add("is-gone"); el.innerHTML = icon("image"); }
      });
    };
    const paintPics = () => {
      paintFiles();
      viewEl.querySelectorAll(".nv-img").forEach(paintPic);
    };
    /* 整えた姿と書く欄は、見出しの大きさや印のぶん行の高さが違う。入れ替わる
       ときは、カーソルの行が画面の同じ高さに留まるよう送り直す（でないと、
       キーボードを閉じたとたんに読んでいたところがずれる）。 */
    const lineOfView = (at) => [...viewEl.children].find((el) => at <= Number(el.dataset.end)) || null;
    const toView = () => {
      const sc = scroller();
      let at = selNow()[1];
      let was = null;
      if (writing && sc && lv) {
        /* 見たままは読む姿と同じ形なので、カーソルの行の頭を同じ高さに。 */
        const el = live.lineEl(at);
        if (el) { was = el.getBoundingClientRect().top; at = live.startOf(el); }
      } else if (writing && sc && !textIn.hidden) was = textIn.getBoundingClientRect().top + caretBox(at).top;
      writing = false;
      paintView();
      viewEl.hidden = false;
      textIn.hidden = true;
      liveEl.hidden = true;
      if (h) h.el.classList.remove("is-writing");
      const ln = was != null ? lineOfView(at) : null;
      if (ln) sc.scrollTop += ln.getBoundingClientRect().top - was;
    };
    /** 見たままで書くか（端末の決まりと、開いて戻して一字も違わないこと）。並べるのもここ。 */
    const goLive = () => {
      if (!live || marksPref()) return false;
      if (live.load(textIn.value)) return true;
      liveEl.textContent = "";
      return false;
    };
    const toWrite = (caret) => {
      writing = true;
      viewEl.hidden = true;
      lv = goLive();
      liveEl.hidden = !lv;
      ink.hidden = lv;
      textIn.hidden = lv;
      if (lv) {
        try { liveEl.focus({ preventScroll: true }); } catch (_) { liveEl.focus(); }
        const c = caret != null ? caret : Math.min(lastSel[1], textIn.value.length);
        live.place(c, c);
      } else {
        grow();
        try { textIn.focus({ preventScroll: true }); } catch (_) { textIn.focus(); }
        if (caret != null) textIn.setSelectionRange(caret, caret);
      }
      if (h) h.el.classList.add("is-writing");
      paintTools();
    };
    /** 押した点の字が、行の中身（.nv-t）の何字めか。と、その字の高さの真ん中。 */
    const pointIn = (ln, x, y) => {
      const t = ln.querySelector(".nv-t");
      if (!t) return null;
      let node = null;
      let off = 0;
      if (document.caretRangeFromPoint) {
        const c = document.caretRangeFromPoint(x, y);
        if (c) { node = c.startContainer; off = c.startOffset; }
      } else if (document.caretPositionFromPoint) {
        const c = document.caretPositionFromPoint(x, y);
        if (c) { node = c.offsetNode; off = c.offset; }
      }
      if (!node || !t.contains(node)) return null;
      const rg = document.createRange();
      rg.setStart(t, 0);
      rg.setEnd(node, off);
      const k = rg.toString().length;
      rg.setStart(node, off);
      const box = rg.getClientRects()[0] || rg.getBoundingClientRect();
      return { k, mid: box && box.height ? (box.top + box.bottom) / 2 : y };
    };
    viewEl.addEventListener("click", (e) => {
      /* 画像は、黒地の一枚で全体（書く欄へは入らない）。 */
      const pic = e.target.closest(".nv-img.is-on");
      if (pic) {
        e.stopPropagation();
        KN.motion.fire("select");
        openPicture(pic.dataset.img, pic.dataset.orig, pic.dataset.origName);
        return;
      }
      /* リンク（段4の一部）：中のノートは紙を重ねる（重ねた紙にあればそこまで戻る）、外は新しい窓（a の既定の動き）。
         どちらも書く欄へは入らない。 */
      const link = e.target.closest(".nv-link");
      if (link) {
        e.stopPropagation();
        if (!link.dataset.note) return;
        e.preventDefault();
        KN.motion.fire("select");
        const to = N().get(link.dataset.note);
        if (!to || to.deletedAt) { KN.ui.toast("ノートが見つかりませんでした"); return; }
        sync();
        toNote(to.id);
        return;
      }
      /* ファイルは、端末の見る口で開く（書く欄へは入らない）。 */
      const doc = e.target.closest(".nv-file");
      if (doc) {
        e.stopPropagation();
        if (!openFile(doc.dataset.file, doc.textContent)) KN.ui.toast("まだ届いていません");
        return;
      }
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
      /* カーソルは押した字に（行の終わりにすると、長い段落では何行も下へ
         飛んでいた。2026年10月12日）。字が取れなければ行の終わり。 */
      const hit = ln ? pointIn(ln, e.clientX, e.clientY) : null;
      const start = ln ? Number(ln.dataset.at) : 0;
      const at = hit ? start + F.sourceAt(textIn.value.slice(start, Number(ln.dataset.end)), hit.k)
        : ln ? Number(ln.dataset.end) : textIn.value.length;
      /* 押した字（取れなければ行の頭）の高さを、入れ替わる前に測っておき、書く欄
         でも同じ高さに来るよう送る（見出しは整えた姿のほうが大きいので、そのまま
         だと行がずれる）。高さは行の真ん中で比べる（字の箱と行の箱は上端が違う）。 */
      const r = ln ? ln.getBoundingClientRect() : null;
      const was = hit ? hit.mid : r ? r.top : null;
      toWrite(at);
      const sc = scroller();
      if (was != null && sc && lv) {
        const c = hit ? live.caretRect() : null;
        const el = hit ? null : live.lineEl(start);
        const now = c ? (c.top + c.bottom) / 2 : el ? el.getBoundingClientRect().top : null;
        if (now != null) sc.scrollTop += now - was;
      } else if (was != null && sc) {
        const c = caretBox(hit ? at : start);
        sc.scrollTop += textIn.getBoundingClientRect().top + (hit ? (c.top + c.bottom) / 2 : c.top) - was;
      }
      afterKeyboard(showCaret);
    });

    /* ---- カーソルの行を見せる（段4.2・10月7日） ----

       紙の送りを ui.js の「欄を真ん中へ」に任せない（data-own-scroll）。
       本文の欄は中身ぶん伸びるので、いつも「見えきっていない」と読まれ、
       欄の真ん中が画面の真ん中へ来る——打ち始めると題ごと上へ飛んでいた
       （2026年10月1日、iPhone）。動かすのは、隠れたぶんだけ。底は道具の帯の
       上端（帯は中身の上に浮いている）。どの行で打っていても、カーソルの
       行の下に一行ぶんの余白を残す——iOS に任せると、帯を知らないので
       行はキーボードの際（帯の裏）に寄り、読めなかった（10月7日）。
       カーソルは欄の中で測る（caretBox）ので、欄の底を見せようとして題ごと
       送ることはない（段4.2のあと）。 */
    const showCaret = () => {
      const sc = scroller();
      if (!sc || !writing || !inEd()) return;
      let c;
      if (lv) c = live.caretRect();
      else {
        const b = caretBox(textIn.selectionEnd);
        const t = textIn.getBoundingClientRect();
        c = { top: t.top + b.top, bottom: t.top + b.bottom, lh: b.lh };
      }
      if (!c) return;
      const s = sc.getBoundingClientRect();
      const bar = tools.getBoundingClientRect();
      const floor = (bar.height ? Math.min(s.bottom, bar.top) : s.bottom) - c.lh - 8;
      const ceil = s.top + 12;
      if (c.bottom > floor) sc.scrollTop += c.bottom - floor;
      else if (c.top < ceil) sc.scrollTop -= ceil - c.top;
      paintEnd();
    };
    /* キーボードが出きるまで紙は縮み続けるので、何度か見直す（ui.js と同じ拍）。 */
    const afterKeyboard = (fn) => {
      [140, 340, 620].forEach((ms) => setTimeout(() => {
        if (!closed && inEd()) fn();
      }, ms));
    };
    [textIn, liveEl].forEach((x) => x.addEventListener("focusin", () => {
      if (!writing) toWrite(null);
    }));
    /* キーボードの高さが変わったら（出きる・絵文字や予測の棚が出入りする）、
       カーソルの行をもう一度帯の上へ。--vvh を書く app.js のあとで測る。 */
    const vv = window.visualViewport;
    const onViewport = () => requestAnimationFrame(() => {
      if (closed || !writing) return;
      if (!lv) grow();
      showCaret();
    });
    if (vv) vv.addEventListener("resize", onViewport);
    /* ほかのアプリへ移った拍の blur は、キーボードを閉じたのではない。書く姿・カーソル・送りを
       そのまま持っておき、戻ったら欄へ戻す（読む姿へ替えると、隠した欄から焦点が消えて画面も動く）。 */
    let away = null;
    /* 横にしたときも（base.css の「portrait only」が隠す）。 */
    /* 縦へ戻した直後に、横のあいだの blur が遅れて届くことがある（重い拍）。それも離れた拍と読む。 */
    let turnAt = -1e9;
    const leaving = () => document.hidden || !document.hasFocus() || sideways.matches || performance.now() - turnAt < 800;
    const hold = () => {
      const sc = scroller();
      away = { sel: selNow(), top: sc ? sc.scrollTop : null };
      /* もう前に居る（戻った直後の遅れた blur）なら、すぐ欄へ。 */
      if (!document.hidden && !sideways.matches) requestAnimationFrame(onBack);
    };
    [textIn, liveEl].forEach((x) => x.addEventListener("focusout", () => {
      if (writing && !closed && leaving()) { hold(); return; }
      /* 道具の帯を押した拍の blur は、帯が自分で欄へ戻します。 */
      setTimeout(() => {
        if (away || closed || !writing || inEd()) return;
        if (leaving()) { hold(); return; }
        toView();
      }, 0);
    }));
    const onTurn = () => { turnAt = performance.now(); onBack(); };
    const onBack = () => {
      if (!away || document.hidden || sideways.matches || !document.hasFocus()) return;
      const a = away;
      away = null;
      if (closed || !writing || inEd()) return;
      const sc = scroller();
      try { ed().focus({ preventScroll: true }); } catch (_) { ed().focus(); }
      if (inEd()) setSel(a.sel[0], a.sel[1]);
      if (sc && a.top != null) sc.scrollTop = a.top;
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("pageshow", onBack);
    window.addEventListener("focus", onBack);
    sideways.addEventListener("change", onTurn);

    /* ---- やり直し（道具の帯の ↶ ↷）。前の版とは別で、紙を開いているあいだだけ ---- */
    const hist = F.history(
      () => { const [s, e] = selNow(); return { v: val(), s, e }; },
      (st2) => {
        textIn.value = st2.v;
        if (writing && lv) live.set(st2.v, [st2.s, st2.e]);
        else if (writing) textIn.setSelectionRange(st2.s, st2.e);
        changed();
      },
    );
    /* 中身が変わったあとに、いつも通る道。 */
    const changed = () => {
      if (writing && lv) { if (live.md() !== textIn.value) live.set(textIn.value); showCaret(); }
      else if (writing) { grow(); showCaret(); } else paintView();
      sync();
      paintTools();
    };
    /* 置き換えを一つ当てる（道具の帯・改行の続き）。 */
    const apply = (r, kind) => {
      if (!r) return;
      hist.note(kind, true);
      if (lv && writing) {
        const v = live.md();
        textIn.value = v.slice(0, r.from) + r.text + v.slice(r.to);
        live.set(textIn.value, [r.s, r.e]);
      } else {
        textIn.setRangeText(r.text, r.from, r.to, "end");
        textIn.setSelectionRange(r.s, r.e);
      }
      changed();
    };

    /* 見たままの欄の手（js/note-live.js の create）。行をまたぐ差し替えは apply、打った字は input で書く欄へ写す。 */
    const live = KN.noteLive ? KN.noteLive.create(liveEl, {
      apply: (r, kind) => apply(r, kind),
      note: (kind) => hist.note(kind),
      input: () => {
        textIn.value = live.md();
        showCaret();
        sync();
        paintTools();
      },
      undo: () => hist.undo(),
      redo: () => hist.redo(),
      bold: () => TOOLS.find((x) => x.k === "bold").run(),
      tick: (at) => {
        U.haptic();
        hist.note("tick", true);
        const s = selNow();
        textIn.value = F.toggleTask(live.md(), at);
        live.set(textIn.value, s);
        changed();
      },
      /* 終わりより下を押した：終わりが画像・線なら空の行を足してそこへ。 */
      tail: () => {
        const v = live.md();
        const last = v.slice(v.lastIndexOf("\n") + 1);
        if (["rule", "img", "file"].includes(F.parse(last).kind)) apply({ from: v.length, to: v.length, text: "\n", s: v.length + 1, e: v.length + 1 }, "br");
        else live.place(v.length);
      },
      paint: paintPic,
      pic: (el) => { KN.motion.fire("select"); openPicture(el.dataset.img, el.dataset.orig, el.dataset.origName); },
      file: (el) => { if (!openFile(el.dataset.file, el.textContent)) KN.ui.toast("まだ届いていません"); },
      /* パソコンで ⌘／Ctrl を押しながら：中のノートは紙を重ねる、外は新しい窓。 */
      link: (a) => {
        const href = a.dataset.href || "";
        if (!href.startsWith("note:")) { window.open(href, "_blank", "noopener,noreferrer"); return; }
        const to = N().get(href.slice(5));
        if (!to || to.deletedAt) { KN.ui.toast("ノートが見つかりませんでした"); return; }
        sync();
        toNote(to.id);
      },
    }) : null;

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
    textIn.addEventListener("input", () => { grow(); showCaret(); sync(); paintTools(); });
    /* 題で改行を押したら、本文へ。 */
    titleIn.addEventListener("keydown", (e) => {
      if (!KN.util.isEnter(e)) return;
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
      { k: "bold", ico: "bold", label: "太字",
        run: () => {
          /* 見たままで太字の終わりに居れば、太字の外へ出る（続けて打つ字は細い）。 */
          if (lv && writing && live.leave()) { paintTools(); return; }
          const [s, e] = selNow();
          apply(F.bold(val(), s, e), "tool");
        } },
      { k: "head", ico: "heading", label: "見出し" },
      { k: "bullet", ico: "list", label: "箇条書き" },
      { k: "num", ico: "numbers", label: "番号" },
      { k: "task", ico: "checkbox", label: "チェック" },
      { k: "quote", ico: "quote", label: "引用" },
      { k: "rule", ico: "minus", label: "区切り",
        run: () => apply(F.rule(val(), selNow()[0]), "tool") },
      { k: "outdent", ico: "outdent", label: "上げる",
        run: () => apply(F.shift(val(), ...selNow(), -1), "tool") },
      { k: "indent", ico: "indent", label: "下げる",
        run: () => apply(F.shift(val(), ...selNow(), 1), "tool") },
      { k: "image", ico: "image", label: "画像", run: () => pickImage() },
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
      if (!inEd()) {
        const [s0, s1] = lastSel;
        toWrite(null);
        setSel(s0, s1);
      }
      const t = TOOLS.find((x) => x.k === k);
      if (t.run) t.run();
      else apply(F.setKind(val(), ...selNow(), k), "tool");
    });
    /* ---- 画像（段5）。押した流れで選ぶ口を開く（iOS はカメラ・写真を選ばせる）。縮めて書けたと
       分かってから、カーソルの行の下に参照の一行。書いているあいだは帯の絵を薄くするだけ。 ---- */
    const fileIn = node(html`<input type="file" accept="image/*,application/pdf" multiple hidden class="js-pic-in">`);
    body.append(fileIn);
    let picking = false;
    let pickAt = 0;
    const pickImage = () => {
      if (picking || !KN.noteImg || KN.noteImg.state() !== "on") return;
      pickAt = selNow()[1];
      fileIn.value = "";
      fileIn.click();
    };
    fileIn.addEventListener("change", async () => {
      const files = [...(fileIn.files || [])];
      fileIn.value = "";
      if (!files.length || picking) return;
      picking = true;
      paintTools();
      let at = Math.min(pickAt, textIn.value.length);
      for (const f of files) {
        /* PDF はそのまま（note-file.js）、ほかは縮めた画像に。 */
        const D = KN.noteFile && KN.noteFile.takes(f) ? KN.noteFile : null;
        let line = null;
        try {
          if (D) { const got = await D.add(f); line = D.refLine(got.id, got.name); }
          else line = KN.noteImg.refLine(await KN.noteImg.add(f));
        } catch (_) { line = null; }
        if (closed) break;
        if (!line) { KN.ui.toast(D ? "ファイルを保存できませんでした" : "画像を保存できませんでした"); break; }
        const v = val();
        let r = F.putLine(v, Math.min(at, v.length), line);
        /* 見たままでは、終わりの画像の下に空の行（触れない塊の後ろにもカーソルを置けるように）。 */
        if (lv && writing && r.to === v.length) r = { ...r, text: `${r.text}\n`, s: r.s + 1, e: r.s + 1 };
        apply(r, "tool");
        at = r.s;
      }
      picking = false;
      if (!closed) paintTools();
    });
    let lastSel = [textIn.value.length, textIn.value.length];
    const paintTools = () => {
      if (inEd()) lastSel = selNow();
      const can = hist.can();
      const v = val();
      const at = (inEd() ? selNow() : lastSel)[0];
      const kind = F.kindAt(v, Math.min(at, v.length));
      /* 表のマスの中では、行の形を変える道具は効かない（表が崩れる）。 */
      const cell = lv && writing && live.inCell();
      tools.querySelectorAll(".js-tool").forEach((b) => {
        const k = b.dataset.k;
        if (k === "undo" || k === "redo") b.setAttribute("aria-disabled", String(!can[k]));
        else if (cell && k !== "bold") b.setAttribute("aria-disabled", "true");
        else if (k === "image") {
          b.hidden = !KN.noteImg || KN.noteImg.state() !== "on";
          b.setAttribute("aria-disabled", String(picking));
        }
        else if (k === "bold") b.setAttribute("aria-pressed", String(F.boldAt(v, Math.min(at, v.length))));
        else {
          b.removeAttribute("aria-disabled");
          if (["head", "bullet", "num", "task", "quote"].includes(k)) b.setAttribute("aria-pressed", String(kind === k));
        }
      });
    };
    /* カーソルが動いたら、押されている印を合わせます。 */
    const onSel = () => { if (writing && inEd()) paintTools(); };
    document.addEventListener("selectionchange", onSel);

    /* ---- ノートブック（左上）とタグ（右上）。段3の口を、頭の行へ ---- */
    const labelsEl = body.querySelector(".js-labels");
    const nbBtn = mid.querySelector(".js-nb");
    const setLabels = (patch) => {
      if (stored) N().setLabels(note.id, patch);
      else {
        if ("notebook" in patch) {
          const nb = String(patch.notebook || "").trim();
          if (nb !== note.notebook) delete note.parent;
          note.notebook = nb;
        }
        if ("tags" in patch) note.tags = N().cleanTags(patch.tags);
      }
      paintLabels();
      paintPath();
    };
    const paintLabels = () => {
      nbBtn.querySelector(".js-nb-name").textContent = note.notebook || "ノートブック";
      if (note.notebook) nbBtn.style.setProperty("--cat", colorOf("nb", note.notebook));
      else nbBtn.style.removeProperty("--cat");
      nbBtn.classList.toggle("is-empty", !note.notebook);
      nbBtn.querySelector(".nb-ico").replaceWith(note.notebook ? node(book(note.notebook)) : node(html`<span class="nb-ico">${icon("book")}</span>`));
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

    /* ---- 道すじと中のノート（段1。docs/notes-unify.md「画面」） ----
       道すじは親があるときだけ、題の上に（ノートブック › 親 › …）。三つより深ければ真ん中を「…」に畳み、
       押すと全部出す。本文の下に中のノートのカード（作った順）。 */
    const me = { id: note.id, h: null };
    const pathEl = body.querySelector(".js-path");
    const kidsEl = body.querySelector(".js-kids");
    let pathOpen = false;
    const paintPath = () => {
      const up = note.parent ? N().get(note.parent) : null;
      const tr = N().tree();
      const ups = (!up || up.deletedAt ? [] : stored ? tr.path(note.id) : tr.path(up.id).concat(up)).filter((n) => !tr.isHead(n.id));
      pathEl.innerHTML = "";
      pathEl.hidden = !ups.length;
      if (!ups.length) return;
      let parts = (note.notebook ? [{ nb: note.notebook }] : []).concat(ups.map((n) => ({ n })));
      if (!pathOpen && parts.length > 3) parts = [parts[0], { more: true }, parts[parts.length - 1]];
      parts.forEach((x, i) => {
        if (i) pathEl.append(node(html`<span class="note-path-sep" aria-hidden="true">›</span>`));
        const b = x.more ? node(html`<button type="button" aria-label="道すじをすべて出す"><span>…</span></button>`)
          : x.nb ? node(html`<button type="button">${book(x.nb)}<span>${x.nb}</span></button>`)
            : node(html`<button type="button"><span>${headOf(x.n) || "ノート"}</span></button>`);
        b.addEventListener("click", () => {
          KN.motion.fire("select");
          if (x.more) { pathOpen = true; paintPath(); }
          else if (x.nb) toBook(x.nb);
          else toNote(x.n.id);
        });
        pathEl.append(b);
      });
    };
    /* 中のノートも木の行（③。答えの11「ノートの中の子も行」）。▸ でその場に開く。表の行は、この紙では並べる
       （表の中から開けるようになるまで。段5）。 */
    const kidsOpen = new Set();
    const paintKids = () => {
      if (closed) return;
      kidsEl.innerHTML = "";
      const t = stored ? N().tree() : null;
      const kids = t ? t.kids(note.id) : [];
      if (!kids.length) return;
      kidsEl.append(node(html`<div class="section-title">中のノート</div>`));
      const box = node(html`<div class="nt-tree" role="tree" aria-label="中のノート"></div>`);
      treeRows(box, kids, 0, {
        open: kidsOpen, kids: (n) => t.branch(n.id), cur: null, stick: true, redraw: paintKids,
        onNote: (n, el) => { sync(); openNote(n.id, el, { within: kidsEl, after: paintKids, back: ".nt-row" }); },
      });
      kidsEl.append(box);
      carry(box, { scope: note.id, open: kidsOpen, scroller: () => box.closest(".sheet-body"), root: () => kidsEl.querySelector(".nt-tree") });
    };
    /* ★・消した・戻した・移したら（打つたびには来ません）。 */
    const offKids = N().onChange(() => { if (!closed) { paintKids(); paintPath(); } });
    /* 中に足す・移すは、まだ置いていない新しいノートなら先に置きます（空なら閉じたときに消える）。 */
    const settle = () => {
      if (!stored) {
        if (!N().put(note)) return false;
        stored = true;
      }
      sync();
      return true;
    };
    paintPath();
    paintKids();

    const finish = () => {
      closed = true;
      if (fold) fold.disconnect();
      if (mirror) mirror.remove();
      if (live) live.destroy();
      if (vv) vv.removeEventListener("resize", onViewport);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("pageshow", onBack);
      window.removeEventListener("focus", onBack);
      sideways.removeEventListener("change", onTurn);
      document.removeEventListener("selectionchange", onSel);
      sync();
      offKids();
      const at = papers.indexOf(me);
      if (at >= 0) papers.splice(at, 1);
      /* 何も書かずに閉じた新しいノートは残しません。 */
      if (fresh && stored && blank()) N().drop(note.id);
      N().flush();
      N().end(note.id);
      /* 木から開いた紙を全部閉じたら、ホームの木のその行に印を付けて見せる（③）。 */
      const mark = !!o.tree && !papers.length && page().k === "home" && !query;
      if (mark) reveal(note.id);
      renderBody();
      if (mark) showCur();
      if (o.after) o.after();
      /* 消したとき（最近削除へ移した）は、そちらの知らせ（元に戻す）を残します。 */
      const now = stored ? N().get(note.id) : null;
      if (now && !now.deletedAt && look(now) !== opened) KN.ui.toast(fresh ? "保存しました" : "更新しました");
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
      { icon: "plus", label: "中にノートを足す",
        onPick: () => {
          if (!settle()) return;
          openNote(null, null, { parent: note.id, within: kidsEl, after: paintKids, back: ".nt-row" });
        } },
      { icon: "indent", label: "移す",
        onPick: () => {
          if (!settle()) return;
          pickPlace(note, (to, nb) => {
            if (!N().move(note.id, to, nb)) return;
            paintLabels();
            paintPath();
            KN.ui.toast("移しました");
          });
        } },
      { icon: "trash", label: "消す", danger: true,
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

    /* リンク先を中へ（docs/notes-unify.md「並び」）：目次の行（リンクだけの行）が指すノートを、このノートの中へ
       行の順に。まだ中に無いものがあるときだけ出す。控えを取ってから・「元に戻す」で戻る。 */
    const gatherItem = () => (!stored || !N().linked(note.id).some((k) => k.parent !== note.id) ? [] : [{
      icon: "indent", label: "リンク先を中へ",
      onPick: async () => {
        sync();
        const snap = KN.backup && KN.backup.take ? await KN.backup.take("リンク先を中へ移す前", { force: true }).catch(() => "failed") : "failed";
        if (snap === "failed") { KN.ui.toast("控えを取れなかったので、何も変えていません", { long: true }); return; }
        const r = N().gather(note.id);
        if (!r) return;
        KN.motion.fire("drop");
        KN.ui.toast(`${r.moved}件を中へ移しました`, { action: { label: "元に戻す", onClick: () => N().ungather(r.was) } });
      } }]);

    /* 束ねる（docs/notes-structure.md の段2）：同じ段のノートを選び、新しい話題の下へ。控えを取ってから・「元に戻す」で戻る。 */
    const bundleItem = () => (!stored || blank() ? [] : [{
      icon: "folder", label: "束ねる",
      onPick: () => {
        if (!settle()) return;
        pickBundle(note, async (ids, title) => {
          const snap = KN.backup && KN.backup.take ? await KN.backup.take("束ねる前", { force: true }).catch(() => "failed") : "failed";
          if (snap === "failed") { KN.ui.toast("控えを取れなかったので、何も変えていません", { long: true }); return; }
          const r = N().bundle(ids, title);
          if (!r) return;
          KN.motion.fire("drop");
          paintPath();
          KN.ui.toast("束ねました", { action: { label: "元に戻す", onClick: () => { N().unbundle(r); paintPath(); } } });
        });
      } }]);

    /* 道に置く（3.0 の A2）。このノートについて考える時間を、今日の道に一つ（js/activity.js）。
       書いたノートだけ（何も書いていないノートは閉じれば消えるので）。 */
    /* 既定で畳む（roadmap-3.1 の S4。設定のノートから戻せる）。 */
    const roadItem = () => (!KN.activity || !stored || blank()
      || KN.store.get().settings.noteRoad !== true ? [] : [{ icon: "hourglass", label: "道に置く",
      onPick: () => {
        sync();
        KN.activity.noteToRoad({ id: note.id, title: N().headOf(N().get(note.id) || note), day: U.todayKey() });
      } }]);

    /* 読んだところ（思考のホーム。docs/thinking.md）。終わりに「### 10月12日 p.」の見出しを足し、押した流れの
       まま続きへ（ページは任意。論文のタグなら「p.」を付けない）。下に書くのは自分の気づき・問い・やってみること
       ——要約の欄は作らない。前の「種をまく」（段6）は外した：種はタグ。つながった記録の札・小窓は今のまま。 */
    const readItem = () => (!stored || blank() || KN.util.folded("readMark") ? [] : [{ icon: "book", label: "読んだところ",
      onPick: () => {
        const d = new Date();
        const line = `### ${d.getMonth() + 1}月${d.getDate()}日${note.tags.includes("論文") ? " " : " p."}`;
        const v = textIn.value.replace(/\s+$/, "");
        hist.note("read", true);
        textIn.value = `${v}${v ? "\n\n" : ""}${line}`;
        toWrite(textIn.value.length);
        changed();
      } }]);

    /* 見出しが三つ以上あるノートだけ、「⋯」の小窓に見出しの並びを足す（R32）。押すと整えた
       姿に戻し、送る器（紙の本体 .sheet-body）をその見出しまで送る。本文は読むだけ。 */
    /* 広い画面だけ：紙を画面いっぱいに（2026年10月21日、利用者「パソコンで最大化できない？」）。端末ごとに覚える。 */
    /* 見たまま ⇄ 印（端末ごと）。見たままに戻すのは、開いて戻して一字も違わないノートでだけ出す。 */
    const markItem = () => {
      if (!live) return [];
      const marks = marksPref();
      if (!KN.noteLive.fits(textIn.value)) return [];
      return [{ label: marks ? "見たままで書く" : "印で書く",
        onPick: () => {
          try { localStorage.setItem(MARKS, marks ? "" : "1"); } catch (_) {}
          if (!writing) return;
          const [s, e] = selNow();
          toWrite(null);
          setSel(s, e);
        } }];
    };
    const wideItem = () => (!matchMedia("(min-width: 640px)").matches ? [] : [{
      label: () => (h.el.classList.contains("is-wide") ? "元の大きさ" : "画面いっぱい"),
      onPick: () => {
        const on = h.el.classList.toggle("is-wide");
        try { localStorage.setItem(FULL, on ? "1" : ""); } catch (_) {}
      } }]);
    const headingItems = () => {
      const hs = F.headings(textIn.value);
      if (hs.length < 3) return [];
      return hs.map((x) => ({
        label: "\u3000".repeat(x.level - 1) + x.text,
        onPick: () => {
          if (writing) { ed().blur(); if (writing) toView(); }
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
      /* 右の段は一覧のカードから膨らまない（据える場所が決まっている）。 */
      grow: dock ? null : {
        from: from || null,
        back: () => {
          /* 中のノートは、親の紙の「中のノート」のカードへ戻る（段1）。 */
          const at = o.within && o.within.isConnected ? o.within : root;
          return (at && at.querySelector(`${o.back || ".notes-list .note-row"}[data-id="${CSS.escape(note.id)}"]`)) || null;
        },
      },
      /* V19：一番上まで送ってあれば、中身を下へ引いても閉じる。書いているあいだは
         取らない（キーボードを出して打っている途中に、上へ戻そうと引いた指で
         紙ごと閉じていた。10月7日）。 */
      pull: () => !writing,
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
          || (inEd() && (lv ? !window.getSelection().isCollapsed : textIn.selectionStart !== textIn.selectionEnd)),
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
    me.h = h;
    papers.push(me);
    paintTree();
    /* 右の段のときに覆いを外すための印（screens.css の「幅の広い画面」）。 */
    if (h.backdrop) h.backdrop.classList.add("is-note-cover");
    h.el.setAttribute("aria-label", "ノート");
    h.el.classList.add("is-note");
    try { if (localStorage.getItem(FULL)) h.el.classList.add("is-wide"); } catch (_) {}
    /* 頭：左に戻る ‹、右に ⋯（Evernote の並び）。閉じ方は紙のまま
       （×と同じ tryClose。払っても閉じる）。 */
    const closeBtn = h.el.querySelector(".js-close");
    closeBtn.innerHTML = icon("chevron-left");
    closeBtn.setAttribute("aria-label", "戻る");
    const moreBtn = node(html`<button class="icon-btn js-note-more" aria-label="ほかの操作">${icon("more")}</button>`);
    moreBtn.addEventListener("click", () => { U.haptic(); popMenu(moreBtn, menu.slice(0, 2).concat(roadItem(), readItem(), menu.slice(2, 4), gatherItem(), bundleItem(), menu.slice(4), wideItem(), markItem(), headingItems())); });
    h.el.querySelector(".sheet-head").append(moreBtn);
    closeBtn.after(mid);
    h.el.append(tools);
    /* 右下の薄い「一番下へ」（2026年10月26日、利用者）。下にまだ半画面より多く残っているときだけ。
       押しても欄から出ない（帯と同じ keep）。着き方は上へと同じ緩め（app.js の glideToTop）。 */
    const toEnd = node(html`<button type="button" class="note-to-end" aria-label="一番下へ" tabindex="-1">${icon("chevron-down")}</button>`);
    toEnd.addEventListener("pointerdown", keep);
    toEnd.addEventListener("mousedown", keep);
    toEnd.addEventListener("click", () => {
      const sc = scroller();
      if (!sc) return;
      U.haptic();
      const to = sc.scrollHeight - sc.clientHeight;
      if (!KN.app.glideTo || (KN.motion && KN.motion.still())) { sc.scrollTop = to; return; }
      const screens = (to - sc.scrollTop) / Math.max(1, sc.clientHeight);
      const k = Math.min(1.6, Math.max(0.7, 0.7 + 0.35 * Math.log2(1 + screens)));
      KN.app.glideTo(sc, to, { ms: (KN.motion ? KN.motion.ms("--m-to-top") : 750) * k, pow: 6 });
    });
    h.el.append(toEnd);
    let endQ = false;
    paintEnd = () => {
      if (endQ) return;
      endQ = true;
      requestAnimationFrame(() => {
        endQ = false;
        const sc = scroller();
        if (closed || !sc) return;
        toEnd.classList.toggle("is-on", sc.scrollHeight - sc.scrollTop - sc.clientHeight > sc.clientHeight / 2);
      });
    };
    h.el.querySelector(".sheet-body").addEventListener("scroll", paintEnd, { passive: true });
    paintEnd();
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
      lv = goLive();
      liveEl.hidden = !lv;
      ink.hidden = lv;
      textIn.hidden = lv;
      h.el.classList.add("is-writing");
      if (!lv) grow();
      paintTools();
      /* ＋からは先にノートブックを選ぶ（2026年10月15日、利用者が改めた）。選んだ押しのまま本文へ。 */
      /* 試験の台本は sessionStorage の kn-book-first=off で今までどおり本文から（tests/lib.js）。 */
      let skip = false;
      try { skip = sessionStorage.getItem("kn-book-first") === "off"; } catch (_) {}
      if (note.notebook || skip) KN.ui.focusNow(ed());
      else {
        setTimeout(() => {
          if (!closed) pickNotebook(nbBtn, note, (name) => setLabels({ notebook: name }), () => KN.ui.focusNow(ed()));
        }, KN.motion.ms("--m-sheet-grow"));
      }
    } else {
      toView();
      /* 問いの一覧から：その行へ送る（紙が育ちきってからもう一度。育つあいだは測りがずれる）。 */
      if (o.line != null) {
        const jump = () => {
          const el = viewEl.querySelector(`[data-line="${o.line}"]`);
          const sc = h.el.querySelector(".sheet-body");
          if (!el || !sc || closed) return;
          sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight / 4;
        };
        requestAnimationFrame(jump);
        setTimeout(jump, KN.motion.ms("--m-sheet-grow") + 40);
      }
    }
    return h;
  }

  /** ファイル（PDF）を端末の見る口で開く。押した流れのまま（await しない。iOS が窓を止める）。
      ホーム画面のアプリ（iOS）は新しい窓を持てないので、保存の口（見る画面と共有が出る）へ。
      手元にまだ無ければ false。 */
  function openFile(id, name) {
    const url = KN.noteFile && KN.noteFile.known(id);
    if (!url) return false;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    if (navigator.standalone === true) a.download = String(name || "").trim() || id;
    document.body.append(a);
    a.click();
    a.remove();
    return true;
  }

  /** 画像を黒地の一枚で全体に（段5）。下へ払って閉じる。原本（取り込んだもの。files/）があれば、
      手元か Dropbox から取れしだい差しかえる（ブラウザが描けない種類なら縮めたもののまま）。 */
  function openPicture(id, orig, origName) {
    const v = KN.noteImg && KN.noteImg.known(id);
    if (!v) return;
    const body = node(html`<div class="note-pic"><img alt="" src="${v.url}"></div>`);
    const D = KN.noteFile;
    if (orig && D) {
      D.look(orig).then((url) => url || D.pull(orig, origName).then((ok) => (ok ? D.look(orig) : null))).then((url) => {
        if (!url || !body.isConnected) return;
        const big = new Image();
        big.onload = () => { const im = body.querySelector("img"); if (im) im.src = url; };
        big.src = url;
      });
    }
    const h = KN.ui.sheet({ title: "", content: body, cls: "is-pic", pull: () => true });
    h.el.setAttribute("aria-label", "画像");
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
    if (!KN.util.isEnter(e)) return;
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
      const names = [...new Set(N().tagNames().concat(mine, [SEED_TAG, ASK_TAG]))].sort((a, b) => a.localeCompare(b, "ja"));
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

  /** then … 選んで閉じたあと（＋から開いた紙で本文へ）。棚・ほかの冊・なしの順に、二列で一目に。 */
  function pickNotebook(anchor, note, done, then) {
    const box = node(html`<div class="note-pick"><div class="note-pick-books js-chips"></div></div>`);
    const chipsEl = box.querySelector(".js-chips");
    const input = nameField("新しいノートブック");
    box.append(input);
    let p = null;
    let settled = false;
    const choose = (name) => {
      settled = true;
      done(name);
      if (p) p.close();
      if (then) then();
    };
    const all = N().notebooks();
    if (note.notebook && !all.includes(note.notebook)) all.push(note.notebook);
    const names = all.filter((nb) => SHELF[nb]).concat(all.filter((nb) => !SHELF[nb]));
    names.concat([""]).forEach((nb) => {
      const b = node(html`
        <button class="chip" aria-pressed="${String(note.notebook === nb && !(then && !nb))}">
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
  function pickDate(anchor, iso, done) {
    const was = new Date(iso);
    const base = isNaN(was.getTime()) ? new Date() : was;
    const dd = KN.ui.dateDrums(base, { label: "作った日" });
    const p = popOver(anchor, {
      side: "left",
      label: "作った日",
      onClose: () => {
        const at = dd.value();
        const next = new Date(at.y, at.m - 1, at.d, base.getHours(), base.getMinutes(), base.getSeconds());
        if (U.dayKey(next) !== U.dayKey(base)) done(next.toISOString());
      },
    });
    p.el.classList.add("is-pick", "is-wheel");
    p.el.append(dd.el);
    p.place();
    /* 中身が入って高さが決まってから、いまの日へ回しておく。 */
    dd.go();
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
          <span class="note-d">${stampOf(v.at)}${v.two ? "・二つの版" : ""}</span>
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

  /* ---------------- 道すじから・移す先（段1） ---------------- */

  /** 道すじの親へ：重ねた紙にあれば、その上の紙を閉じて戻る。無ければ上に重ねる。 */
  function toNote(id) {
    const at = papers.findIndex((x) => x.id === id);
    if (at < 0) { openNote(id); return; }
    papers.slice(at + 1).reverse().forEach((x) => x.h.close());
  }

  /** 道すじのノートブックへ：頭のある冊は頭の紙へ（重ねた紙にあればそこまで戻る）。無ければ紙を全部閉じて
      ホームへ戻り、木のその冊を開いて印を付ける。 */
  function toBook(nb) {
    const h = N().tree().head(nb);
    if (h) { toNote(h.id); return; }
    closePapers();
    treeOpen.add(`nb:${nb}`);
    homeCur = null;
    homeNb = nb;
    if (pages.length > 1) pages = [pages[0]];
    renderBody();
    showCur();
  }

  /* ---------------- 左の木（段1b。幅のある画面だけ。docs/notes-unify.md「画面」） ----------------
     Notes（ホーム）・すべてのノート・ノートブック（中に一番上のノート、その中…）・ノートブックの無いノート。
     行はホームの木と同じ（bookRows。開いた枝もホームと一つ。ここは行を上に留めない）。開いている紙のノート、
     紙が無ければ今の面に印。そこまでの枝は開く。数は出さない。
     画面は transform で動くので、木は body の子（fixed がアプリの列でなく画面に効くように）。
     出す・隠すは CSS（幅とノートの席が出ているか）。 */
  function paintTree() {
    if (!window.matchMedia(WIDE).matches) return;
    if (carrying()) { owedPaint = true; return; }
    if (!treeEl) {
      treeEl = node(html`<nav class="notes-tree" aria-label="ノートの木"><div role="tree"></div></nav>`);
      document.body.append(treeEl);
      carry(treeEl.firstElementChild, { scope: "books", open: treeOpen, scroller: () => treeEl, root: () => treeEl.firstElementChild });
    }
    const box = treeEl.firstElementChild;
    const keep = treeEl.scrollTop;
    box.innerHTML = "";
    if (N().state() !== "on") return;
    const t = N().tree();
    const cur = papers.length ? papers[papers.length - 1].id : null;
    const curNote = cur ? N().get(cur) : null;
    if (curNote) {
      if (curNote.notebook && !t.isHead(cur)) treeOpen.add(`nb:${curNote.notebook}`);
      t.path(cur).forEach((n) => { if (!t.isHead(n.id)) treeOpen.add(n.id); });
    }
    const p = page();
    const line = (inner, on, act, cls) => {
      const b = node(html`
        <button type="button" class="nt-row ${cls}" role="treeitem" ${on ? html`aria-current="true"` : ""}><span class="nt-twist is-leaf" aria-hidden="true"></span>${inner}</button>`);
      b.addEventListener("click", () => { KN.motion.fire("select"); act(); });
      box.append(b);
    };
    line(html`<span class="nt-name">Notes</span>`, !cur && !query && p.k === "home", () => { closePapers(); again(); }, "is-head js-tree-home");
    line(html`${icon("notes")}<span class="nt-name">すべてのノート</span>`, !cur && (!!query || p.k === "list"), () => {
      closePapers();
      if (page().k !== "list") go({ k: "list" });
    }, "is-all js-tree-all");
    line(html`${icon("thought")}<span class="nt-name">問い</span>`, !cur && !query && p.k === "ask", () => {
      closePapers();
      if (page().k !== "ask") go({ k: "ask" });
    }, "is-all js-tree-asks");
    /* ★は木の上へ（desk のホームは最近直したの札なので、木には出さない＝二度出さない。docs/desk.md 段7）。 */
    const all = N().list();
    [["★", all.filter((n) => n.fav)]].forEach(([title, list]) => {
      if (!list.length) return;
      const sec = node(html`<div class="nt-quick" role="group" aria-label="${title}"><div class="section-title">${title}</div></div>`);
      list.forEach((n) => {
        const r = node(html`
          <button type="button" class="nt-row is-flat" data-id="${n.id}">${n.notebook ? book(n.notebook) : html`<span class="nb-ico is-blank">${icon("book")}</span>`}<span class="nt-name">${headOf(n) || "ノート"}</span></button>`);
        r.addEventListener("click", () => { KN.motion.fire("select"); fromTree(n.id); });
        sec.append(r);
      });
      box.append(sec);
    });
    bookRows(box, t, {
      open: treeOpen, stick: false, cur,
      curNb: curNote && t.isHead(cur) ? curNote.notebook : null,
      onNote: (n) => fromTree(n.id),
      redraw: () => renderBody(),
    });
    treeEl.scrollTop = keep;
  }

  function closePapers() { papers.slice().reverse().forEach((x) => x.h.close()); }

  /** 木のノートへ：重ねた紙にあればそこまで戻る。無ければ紙を閉じて、そのノートを開く。 */
  function fromTree(id) {
    if (papers.some((x) => x.id === id)) { toNote(id); return; }
    closePapers();
    openNote(id);
  }

  /** 移す先を選ぶ紙：ノートブックの行と、その中の木。自分と自分の中のノートは選べない。
      done(親の id か null, ノートブック)。 */
  function pickPlace(note, done) {
    const t = N().tree();
    const box = node(html`<div class="notes-place" role="tree"></div>`);
    let h = null;
    const pick = (to, nb) => { KN.motion.fire("select"); if (h) h.close(); done(to, nb); };
    const line = (n, d, off) => {
      const here = n.id === note.parent;
      const b = node(html`
        <button class="notes-place-row" role="treeitem" style="--d:${d}" data-id="${n.id}"
                ${off ? html`aria-disabled="true"` : ""} ${here ? html`aria-current="true"` : ""}>
          <span>${headOf(n) || "ノート"}</span>
        </button>`);
      if (!off) b.addEventListener("click", () => pick(n.id));
      box.append(b);
      t.branch(n.id).forEach((k) => line(k, d + 1, off || k.id === note.id));
    };
    const books = N().notebooks();
    if (!books.includes(note.notebook) && note.notebook) books.push(note.notebook);
    if (t.tops("").length || !note.notebook) books.unshift("");
    books.forEach((nb) => {
      /* 頭のある冊（取り込んだ Notion の一番上のページ）の一番上へ＝頭の中へ。頭そのものは選べない。 */
      const h = nb ? t.head(nb) : null;
      const top = h ? note.parent === h.id : !note.parent && note.notebook === nb;
      const self = !!h && h.id === note.id;
      const b = node(html`
        <button class="notes-place-row is-book" role="treeitem" ${top ? html`aria-current="true"` : ""} ${self ? html`aria-disabled="true"` : ""}>
          ${nb ? book(nb) : icon("notes")}<span>${nb || "ノートブックなし"}</span>
        </button>`);
      if (!self) b.addEventListener("click", () => pick(h ? h.id : null, nb));
      box.append(b);
      t.tops(nb).forEach((n) => line(n, 1, n.id === note.id));
    });
    h = KN.ui.sheet({ title: "移す先", content: box });
    return h;
  }

  /** 束ねる紙（docs/notes-structure.md の段2）。同じ段（同じ親・同じ冊の一番上）のノートを並びの順に、このノートは
      選んだまま始まる。話題の題と一つ以上で「束ねる」→ done(ids, title)。 */
  function pickBundle(note, done) {
    const t = N().tree();
    const group = note.parent && !t.isHead(note.parent) ? t.kids(note.parent) : t.tops(note.notebook);
    const on = new Set([note.id]);
    const box = node(html`
      <div class="stack gap-2">
        <input class="input js-topic" placeholder="話題" aria-label="話題" autocomplete="off" enterkeyhint="done">
        <div class="search-bar">
          ${icon("search")}
          <input class="search-input js-q" placeholder="ノートをさがす" aria-label="ノートをさがす"
                 autocomplete="off" spellcheck="false" enterkeyhint="search">
        </div>
        <div class="notes-versions js-rows"></div>
      </div>
    `);
    const topic = box.querySelector(".js-topic");
    const q = box.querySelector(".js-q");
    const rows = box.querySelector(".js-rows");
    const ok = node(html`<button class="btn btn-primary btn-block js-ok" disabled>束ねる</button>`);
    const ready = () => { ok.disabled = !topic.value.trim() || !on.size; };
    const paint = () => {
      rows.innerHTML = "";
      const w = U.foldKana(q.value.trim());
      group.filter((n) => on.has(n.id) || !w || U.foldKana(`${n.title}\n${KN.noteFormat.searchable(n.body)}`).includes(w)).forEach((n) => {
        const r = node(html`
          <button class="note-open note-bundle-row" data-id="${n.id}" aria-pressed="${String(on.has(n.id))}">
            <span class="note-check">${icon("check")}</span>
            <span class="note-t">${headOf(n) || "ノート"}</span>
          </button>
        `);
        r.addEventListener("click", () => {
          KN.motion.fire("select");
          if (on.has(n.id)) on.delete(n.id); else on.add(n.id);
          r.setAttribute("aria-pressed", String(on.has(n.id)));
          ready();
        });
        rows.append(r);
      });
    };
    topic.addEventListener("input", ready);
    onEnter(topic, () => topic.blur());
    q.addEventListener("input", paint);
    paint();
    const h = KN.ui.sheet({ title: "束ねる", content: box, footer: ok });
    ok.addEventListener("click", () => {
      if (ok.disabled) return;
      KN.motion.fire("select");
      const ids = group.filter((n) => on.has(n.id)).map((n) => n.id);
      h.close();
      done(ids, topic.value.trim());
    });
    KN.ui.focusNow(topic);
    return h;
  }

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

  /* ---------------- 問いに答える紙（docs/thinking.md） ---------------- */

  const askKey = (s) => String(s || "").normalize("NFKC").replace(/\s+/g, "").replace(/\?+$/, "");
  /** その問いの答えのノート：頭の行が「？問い」のノート（新しく直した順の一冊め）。 */
  /** 問いの元（この端末の記録 store.asks。配る器には無い）。 */
  function askItems() { return KN.store.get().asks || []; }

  function answerNote(q) {
    const k = askKey(q);
    return N().list().filter((n) => { const a = KN.noteFormat.asks(n.body)[0]; return a && a.line === 0 && askKey(a.text) === k; })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
  }

  /**
   * 問いに答える紙。問いは欄の外に出す（答えの字に混ざらない・消せない）。保存は閉じたとき（裏へ回る瞬間も）：
   * 頭の行を「？問い」にした新しいノート。同じ問いのノートがあれば、その終わりに日付と時刻の行をはさんで足す。
   * ノートが開けないときは null（呼ぶ側が日記の紙で代わる）。
   */
  function answer(q) {
    if (N().state() !== "on") return null;
    const hidden = !!(KN.lock && KN.lock.hides("notes"));
    /* 問いの下に出典と文脈（畳まない）。 */
    const it = askItems().find((a) => askKey(a.q) === askKey(q)) || {};
    /* 前に書いた答え（読むだけ。答えのノートの頭の行のあと）。続きは下の欄から、終わりに足す。 */
    const was = hidden ? null : answerNote(q);
    const past = was ? was.body.split("\n").slice(1).join("\n").trim() : "";
    const resting = !!askRest()[askKey(q)];
    const box = node(html`
      <div class="stack gap-3">
        <p class="ask-sheet-q">${q}</p>
        ${it.from || it.hint ? html`<div class="ask-ctx">${it.from ? html`<p class="ask-ctx-from">${it.from}</p>` : ""}${it.hint ? html`<p class="ask-ctx-t">${it.hint}</p>` : ""}</div>` : ""}
        ${past ? html`<div class="ask-past js-past"></div>` : ""}
        <label class="field"><textarea class="textarea js-a" rows="6" aria-label="答え" placeholder="思いついたことから"></textarea></label>
      </div>
    `);
    const ta = box.querySelector(".js-a");
    if (past) box.querySelector(".js-past").textContent = past;
    const at = new Date();
    const pad = (v) => String(v).padStart(2, "0");
    const stamp = `${at.getMonth() + 1}月${at.getDate()}日(${U.weekdayJa(U.dayKey(at))}) ${pad(at.getHours())}:${pad(at.getMinutes())}`;
    const compose = (prev, text) => (prev == null ? `？${q}\n${text}` : `${prev.replace(/\s+$/, "")}\n\n${stamp}\n${text}`);
    /* wrote … 書いたノートと、書く前の本文（新しいノートは null）・書いた本文。 */
    let wrote = null;
    let flip = null;
    const write = () => {
      const text = ta.value.replace(/^\s*\n/, "").replace(/\s+$/, "");
      if (!text.trim()) return;
      if (wrote) {
        const n = N().get(wrote.id);
        if (n && !n.deletedAt && n.body === wrote.body) {
          const b = compose(wrote.prev, text);
          if (b !== n.body && N().edit(n.id, { body: b })) wrote.body = b;
          return;
        }
        wrote = null;                         // ほかで直した：上書きせず、もう一度足す
      }
      const home = hidden ? null : answerNote(q);
      if (home) {
        const b = compose(home.body, text);
        if (N().edit(home.id, { body: b })) wrote = { id: home.id, prev: home.body, body: b };
        return;
      }
      const n = N().draft();
      n.body = compose(null, text);
      if (N().put(n)) wrote = { id: n.id, prev: null, body: n.body };
    };
    const hide = () => { write(); N().flush(); };
    const onVis = () => { if (document.visibilityState === "hidden") hide(); };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", onVis);
    const close = async () => {
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", onVis);
      write();
      /* 一区切り・再開は押したとき。続きを書いたら再開（一区切りを押して閉じたときは別）。 */
      if (wrote && resting && !flip) setRest(q, false);
      if (!wrote) {
        if (flip) KN.ui.toast(flip === "rest" ? "一区切りにしました" : "再開しました", { action: { label: "元に戻す", onClick: () => setRest(q, flip !== "rest") } });
        if (root && page().k === "ask") renderBody();
        return;
      }
      const id = wrote.id;
      await N().flush();
      if (N().pending(id)) { KN.ui.toast("ノートに保存できませんでした"); return; }
      KN.ui.toast("保存しました", { action: { label: "開く", onClick: () => openNote(id) } });
      /* ノートの onChange は書いたときには来ない：問いの面が出ていれば組み直す（答えた問いを「書いた問い」へ）。 */
      if (root && page().k === "ask") renderBody();
    };
    const h = KN.ui.sheet({
      title: "問い",
      content: box,
      cls: "is-card",
      clear: true,
      guard: false,
      footer: node(html`<div class="ask-foot"><button class="btn btn-ghost js-rest">${resting ? "再開する" : "一区切り"}</button><button class="btn btn-primary js-ok">保存する</button></div>`),
      onClose: close,
    });
    h.el.querySelector(".js-ok").addEventListener("click", () => { KN.motion.fire("select"); h.close(); });
    h.el.querySelector(".js-rest").addEventListener("click", () => {
      KN.motion.fire("select");
      flip = resting ? "back" : "rest";
      setRest(q, !resting);
      h.close();
    });
    KN.ui.focusNow(ta);
    return h;
  }

  /* ---------------- ノートを選ぶ紙 ---------------- */

  /** 話題（docs/notes-structure.md の段2）：冊 nb の束（子のあるノート）と、問いの形の話題（答えのノート＝頭の行が
      「？問い」で中身のあるもの。問いの面の「続きから考える」）。最近足した順（中のノートも含めて一番新しく直した日）。 */
  function topicsOf(nb) {
    const t = N().tree();
    const last = (n) => t.kids(n.id).reduce((m, k) => { const x = last(k); return x > m ? x : m; }, String(n.updatedAt || ""));
    return N().list().filter((n) => {
      if (n.notebook === nb && t.kids(n.id).length) return true;
      const a = KN.noteFormat.asks(n.body)[0];
      return !!a && a.line === 0 && !!n.body.split("\n").slice(1).join("\n").trim();
    }).map((n) => ({ n, at: last(n) })).sort((a, b) => b.at.localeCompare(a.at));
  }

  /** つなぐ先を選ぶ紙。消していないノートを新しく直した順、上にさがす欄。押せば決まって閉じる。
      o … { title, fresh: 頭に足す「新しいノート」の字（押すと onPick(null)）, topics: 冊の名（さがす前は、その冊の
      話題を先に。topicsOf）}（日記の一件をノートへ移す。
      docs/thinking.md）。鍵でノートを伏せているあいだは、題を並べない（新しいノートだけ）。 */
  function pickNote(onPick, o) {
    o = o || {};
    if (N().state() !== "on") return null;
    const hidden = !!(KN.lock && KN.lock.hides("notes"));
    const box = node(html`
      <div class="stack gap-2">
        ${o.fresh ? html`<button class="note-open note-ver note-fresh js-fresh">${icon("plus")}<span class="note-t">${o.fresh}</span></button>` : ""}
        ${hidden ? "" : html`
        <div class="search-bar">
          ${icon("search")}
          <input class="search-input js-q" placeholder="ノートをさがす" aria-label="ノートをさがす"
                 autocomplete="off" spellcheck="false" enterkeyhint="search">
        </div>`}
        <div class="notes-versions js-rows"></div>
      </div>
    `);
    const q = box.querySelector(".js-q");
    const rows = box.querySelector(".js-rows");
    let h = null;
    const fresh = box.querySelector(".js-fresh");
    if (fresh) fresh.addEventListener("click", () => { KN.motion.fire("select"); if (h) h.close(); onPick(null); });
    const row = (n, at) => {
      const r = node(html`
        <button class="note-open note-ver" data-id="${n.id}">
          <span class="note-d">${stampOf(at || n.updatedAt)}</span>
          <span class="note-t">${headOf(n) || " "}</span>
        </button>
      `);
      r.addEventListener("click", () => { KN.motion.fire("select"); if (h) h.close(); onPick(n.id); });
      rows.append(r);
    };
    const paint = () => {
      rows.innerHTML = "";
      if (hidden) return;
      const w = U.foldKana(q.value.trim());
      const all = N().list().filter((n) => !w || U.foldKana(`${n.title}\n${KN.noteFormat.searchable(n.body)}`).includes(w));
      const tops = o.topics && !w ? topicsOf(o.topics) : [];
      if (tops.length) {
        const mine = new Set(tops.map((x) => x.n.id));
        rows.append(secTitle("話題"));
        tops.forEach((x) => row(x.n, x.at));
        rows.append(secTitle("すべて"));
        all.filter((n) => !mine.has(n.id)).forEach((n) => row(n));
      } else all.forEach((n) => row(n));
    };
    if (q) q.addEventListener("input", paint);
    paint();
    h = KN.ui.sheet({ title: o.title || "ノートにつなぐ", content: box });
    return h;
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
      /* ノートブックに書くのは、木のノートブックの行の＋から（③）。 */
      openNote(null, null, null);
    });
    return fab;
  }

  KN.screens = KN.screens || {};
  /** ほかの席・設定へ移る。右の段に据えたノートは、その画面の上に残さず閉じる（保存は閉じる道のまま）。 */
  function onLeave() { if (window.matchMedia(PANE).matches) closePapers(); }

  KN.screens.notes = { mount, render, dockButton, again, onLeave, open: openNote, makeAsk, colorOf, COLORS: TAG_COLORS, COLOR_NAMES,
    pick: pickNote, asks, answer, newBook };
})();
