/* =========================================================
   くらしノート — 取り込んだノートを整理する（docs/notes-unify.md「整理」、答えの 9〜13）

   - Notion：一番上のページで中にページを持つものは、その題で一冊。ページは冊の頭（`head: true`）——中の
     ページがその冊の一番上に並ぶ。中の無いページ・表だけのページは取り込んだ冊（「Notion」）に残す。
     同じ親の中は、親の本文のリンクの順（Notion の並び）に。取り込んだ時刻から 1ms ずつの作り物の
     作った日時を、兄弟のあいだで入れ替えるだけ（日時の組は変えない）。
   - Evernote：一冊「Evernote」へ。元の冊（.enex ごと）の名前の、題だけのノート（入れ物）を一段はさむ。
   - 動かしたノートは `org`（前の冊 nb・親 p・作った日時 c、頭にした h、入れ物 made と、整理した時刻 at）を
     持つ →「整理を戻す」。更新日は動かさない（「最近直した」「取り込みを取り消す」がそのまま効く）。
   - 取り込んだあと移したノート（取り込んだ冊の外の一番上・ほかの親の下）と、もう整理したものには触らない。
   - 取り込みのあとは、その取り込みの分だけ黙って整理する（控えは取り込む前に取ってある）。
   - 計画（plan）は読むだけ。書くのは KN.notes.reshape の一度だけ。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const U = KN.util;
  const { html, node } = U;

  const EV = "Evernote";
  /* 表のノートの一行め（CSV の原本への参照。js/note-notion.js）。行は表の中で見るので、並べ替えない。 */
  const TABLE = /^\[[^\]\n]*\]\(file:[0-9a-f]{64}\.csv\)$/;
  const isTable = (n) => TABLE.test(String(n.body || "").split("\n", 1)[0]);
  const from = (n, k) => !!n.src && n.src.from === k;
  const old = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));
  const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
  /* 子のページの行（Notion は中のページを一行のリンクで書き出す）。箇条・引用の中でも。 */
  const LINE = /^\s*(?:(?:[-*+]|\d+\.)\s+|>\s?)*\[[^\]\n]*\]\(note:([^)\s]+)\)\s*$/;
  const LINK = /\]\(note:([^)\s]+)\)/g;

  const all = () => KN.notes.list().concat(KN.notes.trash());

  /**
   * 整理の計画。notes … ノート（消した印のものも可。見るのは消していないもの）。
   * o.batch … その取り込みの分だけ（取り込みのあと）。o.at・o.uid … 試験で決め打つとき。
   * 返すのは { at, made, patches: [[id, patch]], books, ev, order, fixed, moved }。
   */
  function plan(notes, o) {
    o = o || {};
    const at = o.at || U.today();
    const uid = o.uid || (() => U.uid("n"));
    const live = (notes || all()).filter((n) => !n.deletedAt);
    const by = new Map(live.map((n) => [n.id, n]));
    const upOf = (n) => { const p = n.parent ? by.get(String(n.parent)) : null; return p && p.id !== n.id ? p : null; };
    const kidsOf = new Map();
    live.forEach((n) => {
      const p = upOf(n);
      if (!p) return;
      if (!kidsOf.has(p.id)) kidsOf.set(p.id, []);
      kidsOf.get(p.id).push(n);
    });
    kidsOf.forEach((l) => l.sort(old));
    const under = (id) => {
      const out = [];
      const seen = new Set([id]);
      for (let i = -1; i < out.length; i++) {
        (kidsOf.get(i < 0 ? id : out[i].id) || []).forEach((k) => { if (!seen.has(k.id)) { seen.add(k.id); out.push(k); } });
      }
      return out;
    };
    const mine = (n) => !o.batch || (!!n.src && n.src.batch === o.batch);
    const tops = live.filter((n) => !upOf(n)).sort(old);

    const patches = new Map();
    const now = (n, k) => (patches.has(n.id) && k in patches.get(n.id) ? patches.get(n.id)[k] : n[k]);
    const KEEP = { notebook: "nb", parent: "p", createdAt: "c" };
    /* 欄を直す。前の値は org に一度だけ（同じ回で二度直しても、残すのは整理する前）。 */
    const set = (n, k, v) => {
      if (now(n, k) === v) return;
      if (!patches.has(n.id)) patches.set(n.id, {});
      const p = patches.get(n.id);
      const rec = p.org || (p.org = { at });
      if (KEEP[k] && !(KEEP[k] in rec)) rec[KEEP[k]] = k === "parent" ? String(n.parent || "") : n[k];
      if (k === "head") rec.h = 1;
      p[k] = v;
    };

    /* ---- Evernote：一冊に、元の冊は入れ物の一段 ---- */
    const made = [];
    const ev = [];
    const groups = new Map();
    tops.forEach((n) => {
      if (n.org || !from(n, "evernote") || !mine(n) || !n.notebook || n.notebook === EV) return;
      if (!groups.has(n.notebook)) groups.set(n.notebook, []);
      groups.get(n.notebook).push(n);
    });
    const names = [...groups.keys()].sort((a, b) => a.localeCompare(b, "ja"));
    names.forEach((name, i) => {
      const evs = groups.get(name);
      let members = evs;
      if (!o.batch) {
        /* 取り込んだものが半分以下の冊は、自分の冊（取り込んだあと移してきたもの）。触らない。 */
        const here = tops.filter((n) => n.notebook === name && !n.org && !from(n, "notion"));
        if (evs.length * 2 <= here.length) return;
        members = here;
      }
      const key = `enbook:${name}`;
      let box = tops.find((n) => n.notebook === EV && n.src && n.src.key === key);
      if (!box) {
        const batch = evs.map((n) => n.src.batch).filter(Boolean).sort()[0] || at;
        /* 取り込みを取り消すと一緒に消えるよう、日時はその取り込みより前（名前の順に 1ms ずつ）。 */
        const t = new Date(Date.parse(batch) - (names.length - i)).toISOString();
        box = { id: uid(), title: name, body: "", notebook: EV, tags: [], fav: false, createdAt: t, updatedAt: t, deletedAt: null,
          src: { from: "evernote", key, batch }, org: { at, made: 1 } };
        made.push(box);
      }
      ev.push(name);
      members.forEach((m) => {
        set(m, "parent", box.id);
        set(m, "notebook", EV);
        under(m.id).forEach((k) => set(k, "notebook", EV));
      });
    });

    /* ---- Notion：中を持つ一番上のページごとに一冊 ---- */
    const books = [];
    const roots = tops.filter((n) => from(n, "notion") && !n.org && n.head !== true && mine(n));
    /* 取り込んだ冊：その取り込みの一番上のページが一番多くいる冊（ほかの冊へ移したページは触らない）。 */
    const home = new Map();
    const tally = new Map();
    roots.forEach((n) => {
      const b = n.src.batch || "";
      if (!tally.has(b)) tally.set(b, new Map());
      const m = tally.get(b);
      m.set(n.notebook, (m.get(n.notebook) || 0) + 1);
    });
    tally.forEach((m, b) => home.set(b, [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]));
    const used = new Set(live.map((n) => now(n, "notebook")).filter(Boolean));
    roots.forEach((r) => {
      if (patches.has(r.id) || r.notebook !== home.get(r.src.batch || "") || isTable(r) || !(kidsOf.get(r.id) || []).length) return;
      const base = oneLine(r.title) || oneLine(KN.notes && KN.notes.headOf ? KN.notes.headOf(r) : "") || "無題";
      let name = base;
      for (let i = 2; used.has(name); i++) name = `${base}（${i}）`;
      used.add(name);
      books.push(name);
      set(r, "notebook", name);
      set(r, "head", true);
      under(r.id).forEach((k) => set(k, "notebook", name));
    });

    /* ---- Notion の並び：親の本文のリンクの順 ---- */
    let order = 0;
    live.forEach((p) => {
      if (!from(p, "notion") || isTable(p)) return;
      const sibs = (kidsOf.get(p.id) || []).filter((k) => from(k, "notion") && !k.org && mine(k));
      if (sibs.length < 2) return;
      const rank = new Map();
      const body = String(p.body || "");
      body.split("\n").forEach((line, i) => { const m = LINE.exec(line); if (m && !rank.has(m[1])) rank.set(m[1], i); });
      let j = 0;
      for (const m of body.matchAll(LINK)) { if (!rank.has(m[1])) rank.set(m[1], 1e9 + j); j++; }
      const r = (k) => (rank.has(k.id) ? rank.get(k.id) : 2e9);
      const want = sibs.slice().sort((a, b) => r(a) - r(b) || old(a, b));
      const times = sibs.map((k) => k.createdAt).sort();
      want.forEach((k, i) => { if (k.createdAt !== times[i]) { set(k, "createdAt", times[i]); order++; } });
    });

    /* ---- 子は親と同じ冊（あとから取り込んだページが、整理した親の下に入ったとき） ---- */
    const rootOf = (n) => {
      let r = n;
      const seen = new Set([n.id]);
      for (let p = upOf(r); p && !seen.has(p.id); p = upOf(p)) { seen.add(p.id); r = p; }
      return r;
    };
    live.forEach((n) => {
      if (!n.src || n.org || !mine(n) || !upOf(n)) return;
      const nb = now(rootOf(n), "notebook");
      if (now(n, "notebook") !== nb) set(n, "notebook", nb);
    });

    /* ---- 頭の印が落ちていたら戻す（古い版の端末が書き直したとき） ---- */
    let fixed = 0;
    if (!o.batch) {
      live.forEach((n) => {
        if (!n.org || !n.org.h || n.head === true || upOf(n) || patches.has(n.id)) return;
        patches.set(n.id, { head: true });
        fixed++;
      });
    }

    const moved = [...patches.values()].filter((p) => "notebook" in p || "parent" in p).length;
    return { at, made, patches: [...patches.entries()], books, ev, order, fixed, moved };
  }

  const empty = (p) => !p || (!p.made.length && !p.patches.length);

  /** 計画を書く（一つの取引）。 */
  function apply(p) {
    if (empty(p)) return Promise.resolve(p);
    return KN.notes.reshape(p.made, p.patches).then(() => p);
  }

  /** 取り込みのあと：その取り込みの分だけ。 */
  function after(batch) {
    if (!KN.notes || KN.notes.state() !== "on" || !batch) return Promise.resolve(null);
    return apply(plan(null, { batch }));
  }

  /**
   * 戻す計画：その回の整理の前の冊・親・作った日時へ。入れ物は消した印（中に自分で足したノートがある・
   * 入れ物を直していたら残す）。整理のあと中に足したノートは、親と同じ冊へ。返すのは [[id, patch]]。
   */
  function undoPlan(at, notes) {
    const list = notes || all();
    const live = list.filter((n) => !n.deletedAt);
    const by = new Map(live.map((n) => [n.id, n]));
    const hit = list.filter((n) => n.org && n.org.at === at);
    const set = new Set(hit.map((n) => n.id));
    const patches = new Map();
    const stamp = U.today();
    hit.forEach((n) => {
      const r = n.org;
      const p = { org: undefined };
      if ("nb" in r) p.notebook = r.nb;
      if ("p" in r) p.parent = r.p ? r.p : undefined;
      if ("c" in r) p.createdAt = r.c;
      if (r.h) p.head = undefined;
      if (r.made && !n.deletedAt && String(n.updatedAt) <= at
        && !live.some((k) => String(k.parent || "") === n.id && !set.has(k.id))) p.deletedAt = stamp;
      patches.set(n.id, p);
    });
    const val = (n, k) => (patches.has(n.id) && k in patches.get(n.id) ? patches.get(n.id)[k] : n[k]);
    const upNow = (n) => {
      const id = val(n, "parent");
      const q = id ? by.get(String(id)) : null;
      return q && q.id !== n.id && !val(q, "deletedAt") ? q : null;
    };
    live.forEach((n) => {
      if (set.has(n.id)) return;
      let r = n;
      let near = false;
      const seen = new Set([n.id]);
      for (let q = upNow(r); q && !seen.has(q.id); q = upNow(q)) { seen.add(q.id); if (set.has(q.id)) near = true; r = q; }
      const nb = val(r, "notebook");
      if (near && n.notebook !== nb) patches.set(n.id, { notebook: nb });
    });
    return [...patches.entries()];
  }

  /** 整理した回（戻せるもの。新しい順）。 */
  function runs() {
    const set = new Set();
    KN.notes.list().forEach((n) => { if (n.org && n.org.at) set.add(n.org.at); });
    return [...set].sort().reverse();
  }

  /* ---------------- 紙 ---------------- */

  const S = () => KN.settingsParts;
  const row = (title, val) => node(html`
    <div class="set-row"><span class="set-title">${title}</span><span class="set-val">${String(val)}</span></div>`);

  /** 控えを取ってから。取れなければ断る。 */
  async function guard(reason) {
    const snap = KN.backup && KN.backup.take ? await KN.backup.take(reason, { force: true }).catch(() => "failed") : "failed";
    if (snap === "failed") { KN.ui.toast("控えを取れなかったので、何も変えていません", { long: true }); return false; }
    return true;
  }

  /** 先に見せる紙 → 控え → 整理する。数を出すのはこの紙の中だけ。 */
  function preview() {
    const p = plan();
    if (empty(p)) { KN.ui.toast("整理するものはありません"); return null; }
    const P = S();
    const body = node(html`<div class="stack"></div>`);
    if (p.books.length) body.append(P.card(row("Notion：ノートブックに", p.books.length)), P.more("ノートブックの名前", p.books.join(" ／ ")));
    if (p.ev.length) body.append(P.card(row("Evernote：一冊に", p.ev.length)), P.more("Evernote の中", p.ev.join(" ／ ")));
    if (p.order) body.append(P.card(row("Notion の並びに", p.order)));
    if (p.fixed) body.append(P.card(row("ノートブックの頭", p.fixed)));
    const foot = node(html`<div class="stack gap-2"><button class="btn btn-primary js-tidy"><span class="js-word">整理する</span></button></div>`);
    const go = foot.querySelector(".js-tidy");
    const word = foot.querySelector(".js-word");
    let busy = false;
    const h = KN.ui.sheet({ title: "整理する", content: body, footer: foot });
    go.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      go.disabled = true;
      word.textContent = "控えを取っています";
      if (!(await guard("整理する前"))) { busy = false; go.disabled = false; word.textContent = "整理する"; return; }
      try {
        /* 控えを待つあいだに変わっていてもよいよう、計画は書く直前に立て直す。 */
        await apply(plan());
      } catch (_) {
        KN.ui.toast("ノートを保存できませんでした", { long: true });
        h.close();
        return;
      }
      h.close();
      KN.ui.toast("整理しました");
    });
    return h;
  }

  /** 「整理を戻す」：訊いてから、控えを取って戻す。 */
  function undo(at, done) {
    return KN.ui.confirm({ title: "整理を戻す", message: "整理する前の場所と並びに戻します。", okLabel: "戻す" }).then(async (ok) => {
      if (!ok) return false;
      if (!(await guard("整理を戻す前"))) return false;
      try {
        await KN.notes.reshape([], undoPlan(at));
      } catch (_) {
        KN.ui.toast("ノートを保存できませんでした", { long: true });
        return false;
      }
      if (done) done();
      KN.ui.toast("戻しました");
      return true;
    });
  }

  KN.noteOrganize = { plan, apply, after, undoPlan, runs, empty, preview, undo };
})();
