/* =========================================================
   くらしノート — 活動（3.0 の A1。docs/roadmap-3.0.md・docs/todo-timeline.md の「活動」）

   活動はやること一件（`act` 付き）。道・時刻の紙・運ぶ・通知、今ある仕組みがそのまま効く。
   積み上げはやめた（2026年10月12日。docs/thinking.md）——済ませても記録は作らず、道具箱で
   過ぎた時刻に置けば済んだ用事になる。前からの積み上げ（時刻と長さのあるもの）は、道が
   読むだけで描く（`forRoad`。押せば積み上げをまとめたノート）。

   ここは入口の紙（時刻と長さ）と、道に渡す前の読み替えだけ。記録の形は store が決めます。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const { html, node, icon } = U;

  /* 予定にする種類。達成・種・変化は予定にしない（「達成『…』」は評価の言葉に見える）。 */
  const PLANNED = ["reading", "study"];
  /* 長さの札（roadmap-3.0 の A1）。 */
  const LENS = [15, 25, 30, 45, 60];
  const ROW = KN.gesture.WHEEL_ROW;   // 車輪の一行

  const span = (m) => KN.plan.humanSpan(m);
  const toMin = (t) => KN.plan.toMin(t);
  const toTime = (m) => KN.plan.toTime(m);

  /** 車輪の一列。値は `value()`、合わせるのは `go(v)`（紙に置いてから）。 */
  function wheel(vals, label, fmt) {
    const el = KN.ui.drum(node(html`<div class="note-wheel" role="listbox" aria-label="${label}" tabindex="0"></div>`), ROW);
    vals.forEach((v) => el.append(node(html`<div class="note-wheel-row" role="option">${fmt(v)}</div>`)));
    const idx = () => Math.max(0, Math.min(vals.length - 1, Math.round(el.scrollTop / ROW)));
    const mark = () => [...el.children].forEach((r, k) => r.setAttribute("aria-selected", String(k === idx())));
    el.addEventListener("scroll", mark, { passive: true });
    el.addEventListener("click", (e) => {
      const r = e.target.closest(".note-wheel-row");
      if (r) el.scrollTo({ top: [...el.children].indexOf(r) * ROW, behavior: "smooth" });
    });
    return { el, value: () => vals[idx()], go: (v) => { el.scrollTop = Math.max(0, vals.indexOf(v)) * ROW; mark(); } };
  }

  /**
   * 時刻と長さを聞く紙（時刻の紙と同じ一行ずつの枠）。決めたら `onPick("HH:MM", 分)`。
   * @param {{title:string, at?:string, minutes?:number, ok:string, lens?:number[], onPick:Function}} o
   */
  function askSpan(o) {
    const base = U.isTime(o.at) ? o.at
      : toTime(Math.min(23 * 60 + 55, Math.round(toMin(U.nowTime()) / 5) * 5));
    const lens = o.lens || LENS;
    let minutes = Number(o.minutes) > 0 ? Number(o.minutes) : 30;
    const bm = Number(base.slice(3, 5));
    const mins = Array.from({ length: 12 }, (_, i) => i * 5);
    if (!mins.includes(bm)) mins.push(bm), mins.sort((a, b) => a - b);
    const h = wheel(Array.from({ length: 24 }, (_, i) => i), "時", (v) => `${v}時`);
    const m = wheel(mins, "分", (v) => `${String(v).padStart(2, "0")}分`);
    const body = node(html`
      <div class="d-card tw-card act-span">
        <div class="d-row tw-row">
          <span class="d-ico">${icon("clock")}</span>
          <span class="d-label">時刻</span>
        </div>
        <div class="note-wheels tw js-wheels"></div>
        <div class="d-row tw-row">
          <span class="d-ico">${icon("hourglass")}</span>
          <span class="d-label">時間</span>
        </div>
        <div class="chip-row tw-mins js-lens"></div>
      </div>
    `);
    body.querySelector(".js-wheels").append(h.el, m.el);
    const paintLens = () => {
      const list = lens.includes(minutes) ? lens : lens.concat(minutes).sort((a, b) => a - b);
      KN.ui.chipRow(body.querySelector(".js-lens"), list.map((v) => ({ id: String(v), label: span(v) })), {
        activeId: String(minutes),
        onPick: (id) => { minutes = Number(id); KN.motion.fire("select"); paintLens(); },
      });
    };
    paintLens();
    const footer = node(html`<button type="button" class="btn btn-primary btn-block js-ok">${o.ok}</button>`);
    const handle = KN.ui.sheet({ title: o.title, content: body, footer, as: "dialog" });
    /* 紙に置かれる前は scrollTop が効かないので、置いてから合わせる。 */
    requestAnimationFrame(() => { h.go(Number(base.slice(0, 2))); m.go(bm); });
    footer.addEventListener("click", () => {
      const at = `${String(h.value()).padStart(2, "0")}:${String(m.value()).padStart(2, "0")}`;
      handle.close();
      setTimeout(() => o.onPick(at, minutes), 40);
    });
    return handle;
  }

  /** 活動の予定を一つ置く（その日に `act` 付きの用事）。知らせに「元に戻す」。
      `bare` は題をそのまま（道具箱の「思考」など。3.0 の A3）、`note` は結ぶノート、`say` は知らせの字。 */
  function plant({ type, title, day, at, minutes, memo = "", bare = false, note = null, say = null }) {
    const name = String(title || "").trim();
    if (!name) return null;
    const t = KN.store.addTodo({
      title: bare ? name : KN.store.actTitle(type, name), due: day, time: at, minutes, memo,
      act: note ? { type, note } : { type },
    });
    if (!t) return null;
    KN.motion.fire("save");
    KN.ui.toast(say || `「${t.title}」を ${at} に`, {
      action: { label: "元に戻す", onClick: KN.store.removeTodo.bind(null, t.id) },
    });
    return t;
  }

  /* ノートから道へ（3.0 の A2）。長さの札は 15・20・25・45、既定は25分。題は「『ノートの題』について考える」、
     種類は種（考えたこと）。結ぶのはノートの id（`act.note`）。済ませた積み上げも同じノートを持つ。 */
  const NOTE_LENS = [15, 20, 25, 45];
  function noteToRoad({ id, title, day }) {
    const name = String(title || "").trim() || "ノート";
    askSpan({
      title: "道に置く", ok: "道に置く", lens: NOTE_LENS, minutes: 25,
      onPick: (at, minutes) => {
        const t = KN.store.addTodo({
          title: `『${name}』について考える`, due: day || U.todayKey(), time: at, minutes,
          act: { type: "seed", note: id },
        });
        if (!t) return;
        KN.motion.fire("save");
        KN.ui.toast(`「${t.title}」を ${at} に`, {
          action: { label: "元に戻す", onClick: KN.store.removeTodo.bind(null, t.id) },
        });
      },
    });
  }

  /** 結んだノート（まだあるものだけ。ノートは IndexedDB で、別に消えうる）。{ id, title } か null。 */
  function noteOf(id) {
    if (!id || !KN.notes || KN.notes.state() !== "on") return null;
    const n = KN.notes.get(id);
    /* 最近削除した項目へ移したノートも「無い」とみなす（戻せば札も戻る）。 */
    return n && !n.deletedAt ? { id, title: KN.notes.headOf(n) || "ノート" } : null;
  }
  /** ノートを開く（ノートの書く紙。閉じれば元の画面へ戻る）。 */
  function openNote(id) {
    if (KN.screens.notes && KN.screens.notes.open) KN.screens.notes.open(id);
  }

  /* 前に置いた活動（act 付きのやること。前からの積み上げも読むだけ）。新しい順。 */
  function pastActs() {
    const s = KN.store.get();
    const todos = (s.todos || []).filter((t) => t.act && t.act.type).map((t) => ({
      type: t.act.type, title: KN.store.actName(t), minutes: t.minutes, at: t.doneAt || t.createdAt || "" }));
    const old = ((s.archive || {}).entries || []).map((e) => ({
      type: e.type, title: e.title || "", minutes: e.minutes, at: e.updatedAt || "" }));
    return todos.concat(old).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  /* 同じ種類・同じ題で前に道へ置いた長さ（無ければ null＝30分）。 */
  function lastMinutes(type, title) {
    const key = U.foldKana(String(title || "").trim());
    const hit = pastActs().find((e) => e.type === type && e.minutes > 0 && U.foldKana(String(e.title).trim()) === key);
    return hit ? hit.minutes : null;
  }

  /**
   * 道の空きを押したときの「活動」（段2の紙）。前に置いた読書・学習の題から、
   * 新しい順に四つまで。
   */
  function recent(limit = 4) {
    const seen = new Set();
    const out = [];
    pastActs()
      .filter((e) => e.title && PLANNED.includes(e.type))
      .forEach((e) => {
        const key = `${e.type}\u0000${U.foldKana(e.title.trim())}`;
        if (seen.has(key) || out.length >= limit) return;
        seen.add(key);
        const t = KN.store.archiveType(e.type);
        out.push({ type: e.type, title: e.title.trim(), label: KN.store.actTitle(e.type, e.title),
                   color: t.color, minutes: lastMinutes(e.type, e.title) || 30 });
      });
    return out;
  }

  /* 済ませた時刻の印（道の足あと・縮めの勘定）。決めた終わりちょうどにして、道が長さを
     記録のまま描くように（day-road の shape は済ませた時刻で縮めるので）。 */
  function stampAt(day, min) {
    const d = U.dayDate(day);
    d.setHours(Math.floor(min / 60), min % 60, 0, 0);
    return d.toISOString();
  }

  /**
   * 道に渡す用事の読み替え（写さず引く。記録は書き換えない）。
   * - 結んだ積み上げに時刻と長さがあれば、その日の道ではそちらで描く。
   * - 用事に結ばれていない、その日の積み上げで時刻と長さのあるものは、済んだ活動として足す
   *   （id は `arc:` ＋ 記録の id。押せば記録の紙）。
   */
  function forRoad(day, todos) {
    const store = KN.store;
    const used = new Set();
    const out = todos.map((t) => {
      const e = store.actEntry(t);
      if (!e) return t;
      used.add(e.id);
      if (e.date !== day || !U.isTime(e.at) || !(e.minutes > 0)) return t;
      const end = toMin(e.at) + e.minutes;
      return { ...t, time: e.at, minutes: e.minutes, doneAt: t.done ? stampAt(day, Math.min(end, 24 * 60 - 1)) : t.doneAt };
    });
    store.get().archive.entries.forEach((e) => {
      if (e.date !== day || used.has(e.id) || !U.isTime(e.at) || !(e.minutes > 0)) return;
      if (store.entryTodo(e)) return;   // 結んだ用事は別の日に居る（その日の道が描く）
      const end = toMin(e.at) + e.minutes;
      out.push({
        id: `arc:${e.id}`, title: e.title || store.archiveType(e.type).label, due: day, time: e.at,
        minutes: e.minutes, done: true, doneAt: stampAt(day, Math.min(end, 24 * 60 - 1)),
        act: { type: e.type, entry: e.id, note: null }, part: null, repeat: null,
        subs: [], subState: {}, skipDays: [], icon: null, archived: false, trace: false, order: 0,
      });
    });
    return out;
  }

  /** 活動の色（積み上げの種類の色）。活動でなければ null。 */
  function colorOf(t) {
    return t && t.act ? KN.store.archiveType(t.act.type).color : null;
  }

  /** 道から押したものが記録（`arc:`）なら、その id。 */
  const entryIdOf = (id) => (typeof id === "string" && id.startsWith("arc:") ? id.slice(4) : null);

  /* ---------------- 道具箱（3.0 の A3。docs/roadmap-3.0.md） ----------------

     道の右下の思考・ノート・読書。運んで道に置けば、**歩いたぶん・過ぎた日は済んだ用事**、
     **これからの道・先の日は予定**（どちらも `act` 付きの用事。積み上げは作らない）。
     種類：思考＝種（題「思考」）、ノート＝種（その日に書いたノートが一つなら結ぶ。題は
     ノートの題、無ければ「ノート」）、読書＝読書（題「読書」）。 */
  const TOOLS = [   // 左から読書・思考・ノート（10月8日・利用者の声）
    { kind: "read", type: "reading", label: "読書", icon: "book" },
    { kind: "think", type: "seed", label: "思考", icon: "thought" },
    { kind: "note", type: "seed", label: "ノート", icon: "notes" },
  ];
  const toolOf = (kind) => TOOLS.find((x) => x.kind === kind) || null;
  /* 記録がどの道具のものか（長さの覚えを道具ごとに引くため）。種で題が「思考」なら思考、ほかの種はノート。 */
  const kindOf = (e) => (e.type === "reading" ? "read" : e.type !== "seed" ? null
    : String(e.title || "").trim() === "思考" ? "think" : "note");

  /** その道具で前に残した長さ（無ければ30分）。 */
  function toolMinutes(kind) {
    const hit = pastActs().find((e) => e.minutes > 0 && kindOf(e) === kind);
    return hit ? hit.minutes : 30;
  }

  /** その日に書いた（作った・直した）ノートが一つだけなら { id, title }。 */
  function noteOfDay(day) {
    if (!KN.notes || KN.notes.state() !== "on") return null;
    const hits = KN.notes.list().filter((n) => KN.notes.headOf(n)
      && [n.createdAt, n.updatedAt].some((x) => x && U.dayKey(x) === day));
    return hits.length === 1 ? { id: hits[0].id, title: KN.notes.headOf(hits[0]) } : null;
  }

  /**
   * 道に渡す道具箱（screen-todo の dayRoad → day-road の `o.tools`）。
   * - `list`：並び（左から読書・思考・ノート）と絵・色。
   * - `minutes(kind)`：運ぶときの長さ（前に残した長さ。道のほうが次の停留所と「いま」で止める）。
   * - `put(kind, { at, minutes, record })`：置く。用事の id を返す（`record` なら済んだ用事）。
   * - `ask(kind)`：短く押したとき。時刻と長さの紙（下敷きは「いま − 長さ」）。
   */
  function toolsFor(day) {
    const list = TOOLS.map((x) => ({ ...x, color: KN.store.archiveType(x.type).color }));
    function put(kind, { at, minutes, record }) {
      const x = toolOf(kind);
      if (!x || !U.isTime(at) || !(minutes > 0)) return null;
      const n = kind === "note" ? noteOfDay(day) : null;
      const name = n ? n.title : x.label;
      const say = `${name} ${at.replace(/^0(\d:)/, "$1")}から${span(minutes)}`;
      if (!record) {
        const t = plant({ type: x.type, title: name, day, at, minutes, bare: true, note: n && n.id, say });
        return t ? t.id : null;
      }
      /* 過ぎた時刻は、済んだ用事として（済ませた時刻は終わりちょうど。道が長さのまま描く）。 */
      const t = KN.store.addTodo({ title: name, due: day, time: at, minutes, act: n ? { type: x.type, note: n.id } : { type: x.type } });
      if (!t) return null;
      KN.store.update((s) => {
        const y = s.todos.find((z) => z.id === t.id);
        if (y) { y.done = true; y.doneAt = stampAt(day, Math.min(toMin(at) + minutes, 24 * 60 - 1)); }
      });
      KN.motion.fire("save");
      KN.ui.toast(say, { action: { label: "元に戻す", onClick: KN.store.removeTodo.bind(null, t.id) } });
      return t.id;
    }
    function ask(kind) {
      const x = toolOf(kind);
      if (!x) return;
      const want = toolMinutes(kind);
      const base = toTime(Math.max(0, Math.floor((toMin(U.nowTime()) - want) / 5) * 5));
      askSpan({
        title: x.label, ok: "道に置く", at: base, minutes: want,
        onPick: (at, minutes) => {
          const today = U.todayKey();
          const record = day < today || (day === today && toMin(at) < toMin(U.nowTime()));
          put(kind, { at, minutes, record });
        },
      });
    }
    return { list, minutes: toolMinutes, put, ask };
  }

  KN.activity = { askSpan, plant, recent, forRoad, colorOf, entryIdOf,
                  noteToRoad, noteOf, openNote, toolsFor, noteOfDay, LENS, PLANNED, NOTE_LENS };
})();
