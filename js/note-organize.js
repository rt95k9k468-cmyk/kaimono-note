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
    /* o.into（取り込みの紙で名前を入れたとき）：冊「Evernote」でなく archive の一番上の入れ物「名前」の中へ
       （archive › 名前 › 元の冊 › ノート。10月29日、利用者：別のアカウントを「Evernote旧」に）。 */
    const into = o.batch && o.into ? oneLine(o.into) : "";
    const EVB = into ? "archive" : EV;
    let root = null;
    if (into && names.length) {
      const rkey = `enroot:${into}`;
      root = tops.find((n) => n.notebook === EVB && n.src && n.src.key === rkey && n.src.batch === o.batch);
      if (!root) {
        const t = new Date(Date.parse(o.batch) - names.length - 1).toISOString();
        const k = live.filter((n) => n.notebook === EVB && !upOf(n)).length + 1;
        root = { id: uid(), title: into, body: "", notebook: EVB, tags: [], fav: false, createdAt: t, updatedAt: t, deletedAt: null,
          pos: "0" + String(k).padStart(3, "0"), src: { from: "evernote", key: rkey, batch: o.batch }, org: { at, made: 1 } };
        made.push(root);
      }
    }
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
      let box = root ? null : tops.find((n) => n.notebook === EV && n.src && n.src.key === key);
      if (!box) {
        const batch = evs.map((n) => n.src.batch).filter(Boolean).sort()[0] || at;
        /* 取り込みを取り消すと一緒に消えるよう、日時はその取り込みより前（名前の順に 1ms ずつ）。 */
        const t = new Date(Date.parse(batch) - (names.length - i)).toISOString();
        box = { id: uid(), title: name, body: "", notebook: EVB, tags: [], fav: false, createdAt: t, updatedAt: t, deletedAt: null,
          src: { from: "evernote", key, batch }, org: { at, made: 1 } };
        if (root) box.parent = root.id;
        made.push(box);
      }
      ev.push(name);
      members.forEach((m) => {
        set(m, "parent", box.id);
        set(m, "notebook", EVB);
        under(m.id).forEach((k) => set(k, "notebook", EVB));
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

  /**
   * リンクのとおりに中へ（Notion 全体。docs/notes-unify.md「並び」）。平らに来たページ（親の無い一番上・
   * まだ整理していない・頭でない）を、目次の行（LINE）で指しているただ一つのページの中へ、子孫ごと親の冊へ。
   * 二つ以上から指されている・輪になる・中に整理したものを持つページは迷うので触らない（unsure）。
   * 中の並びは目次の行の順（移したもののあいだで作った日時を入れ替える）。org に前を残す →「整理を戻す」。
   * 返すのは { at, made: [], patches, moved, pairs: [[子, 親]], unsure: [題] }。
   */
  function linkPlan(notes, o) {
    o = o || {};
    const at = o.at || U.today();
    const live = (notes || all()).filter((n) => !n.deletedAt);
    const by = new Map(live.map((n) => [n.id, n]));
    const upOf = (n) => { const p = n.parent ? by.get(String(n.parent)) : null; return p && p.id !== n.id ? p : null; };
    const loose = (n) => from(n, "notion") && !n.org && n.head !== true && !upOf(n);
    const kidsOf = new Map();
    live.forEach((n) => { const p = upOf(n); if (p) { if (!kidsOf.has(p.id)) kidsOf.set(p.id, []); kidsOf.get(p.id).push(n); } });
    const under = (id) => {
      const out = [];
      const seen = new Set([id]);
      for (let i = -1; i < out.length; i++) {
        (kidsOf.get(i < 0 ? id : out[i].id) || []).forEach((k) => { if (!seen.has(k.id)) { seen.add(k.id); out.push(k); } });
      }
      return out;
    };
    const title = (n) => oneLine(n.title) || oneLine(KN.notes && KN.notes.headOf ? KN.notes.headOf(n) : "") || "無題";

    /* 子 → { 親: 目次の何行め } */
    const pointed = new Map();
    live.forEach((p) => {
      if (!from(p, "notion") || isTable(p)) return;
      String(p.body || "").split("\n").forEach((line, i) => {
        const m = LINE.exec(line);
        const c = m && by.get(m[1]);
        if (!c || c.id === p.id || !loose(c)) return;
        if (!pointed.has(c.id)) pointed.set(c.id, new Map());
        if (!pointed.get(c.id).has(p.id)) pointed.get(c.id).set(p.id, i);
      });
    });
    const to = new Map();
    const unsure = [];
    [...pointed.keys()].map((id) => by.get(id)).sort(old).forEach((c) => {
      const ps = pointed.get(c.id);
      const pid = ps.size === 1 ? [...ps.keys()][0] : null;
      let ok = !!pid && !under(c.id).some((k) => k.org);
      /* 輪：親から上へ（決めた親・今の親）たどって自分に着くなら置かない。 */
      for (let q = pid, seen = new Set(); ok && q && !seen.has(q); ) {
        if (q === c.id) ok = false;
        seen.add(q);
        const n = by.get(q);
        q = to.has(q) ? to.get(q) : n && upOf(n) ? upOf(n).id : null;
      }
      if (ok) to.set(c.id, pid); else unsure.push(title(c));
    });
    const nbOf = (id) => (to.has(id) ? nbOf(to.get(id)) : by.get(id).notebook);

    const patches = new Map();
    const set = (n, k, v) => {
      if (n[k] === v) return;
      if (!patches.has(n.id)) patches.set(n.id, { org: { at } });
      const p = patches.get(n.id);
      p.org[{ notebook: "nb", parent: "p", createdAt: "c" }[k]] = k === "parent" ? String(n.parent || "") : n[k];
      p[k] = v;
    };
    const pairs = [];
    const into = new Map();
    to.forEach((pid, cid) => {
      const c = by.get(cid);
      const nb = nbOf(pid);
      set(c, "parent", pid);
      set(c, "notebook", nb);
      under(cid).forEach((k) => set(k, "notebook", nb));
      pairs.push([title(c), title(by.get(pid))]);
      if (!into.has(pid)) into.set(pid, []);
      into.get(pid).push(c);
    });
    /* 中の並び：目次の行の順に。 */
    into.forEach((cs, pid) => {
      const want = cs.slice().sort((a, b) => pointed.get(a.id).get(pid) - pointed.get(b.id).get(pid));
      const times = cs.map((k) => k.createdAt).sort();
      want.forEach((k, i) => set(k, "createdAt", times[i]));
    });
    return { at, made: [], patches: [...patches.entries()], moved: to.size, pairs, unsure };
  }

  const empty = (p) => !p || (!p.made.length && !p.patches.length);

  /** 計画を書く（一つの取引）。 */
  function apply(p) {
    if (empty(p)) return Promise.resolve(p);
    return KN.notes.reshape(p.made, p.patches).then(() => p);
  }

  /** 取り込みのあと：その取り込みの分だけ。 */
  function after(batch, o) {
    if (!KN.notes || KN.notes.state() !== "on" || !batch) return Promise.resolve(null);
    return apply(plan(null, { batch, into: o && o.into }));
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
      /* 6つに分ける（下の six）：題・並び・その前の整理の記録も戻す。 */
      if ("t" in r) p.title = r.t;
      if ("o" in r) p.pos = r.o == null ? undefined : r.o;
      if (r.prev) p.org = r.prev;
      if (r.hd) p.head = true;
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

  /** リンクのとおりに中へ：先に見せる紙 → 控え → 移す。戻すのは「…の整理を戻す」（その場の「元に戻す」も）。 */
  function linkPreview() {
    const p = linkPlan();
    if (empty(p)) { KN.ui.toast("中へ移すものはありません"); return null; }
    const P = S();
    const body = node(html`<div class="stack"></div>`);
    body.append(P.card(row("中へ移す", p.moved)), P.more("どこへ", p.pairs.map(([c, up]) => `${up} › ${c}`).join(" ／ ")));
    if (p.unsure.length) body.append(P.card(row("迷うのでそのまま", p.unsure.length)), P.more("いくつもから指されている・輪になる", p.unsure.join(" ／ ")));
    const foot = node(html`<div class="stack gap-2"><button class="btn btn-primary js-tidy"><span class="js-word">中へ移す</span></button></div>`);
    const go = foot.querySelector(".js-tidy");
    const word = foot.querySelector(".js-word");
    let busy = false;
    const h = KN.ui.sheet({ title: "リンクのとおりに中へ", content: body, footer: foot });
    go.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      go.disabled = true;
      word.textContent = "控えを取っています";
      if (!(await guard("リンクのとおりに中へ移す前"))) { busy = false; go.disabled = false; word.textContent = "中へ移す"; return; }
      let done = null;
      try {
        done = await apply(linkPlan());
      } catch (_) {
        KN.ui.toast("ノートを保存できませんでした", { long: true });
        h.close();
        return;
      }
      h.close();
      KN.ui.toast("中へ移しました", { action: { label: "元に戻す", onClick: () => undo(done.at) } });
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

  /* ---------------- 6つに分ける（2026年10月15日、利用者が決めた。docs/notes.md「6つの棚」） ----------------
     決めた表のとおりに、冊と親を付け替えるだけ（本文・作った日・直した日は動かさない）。Evernote の5冊だけ題に
     「(Evernote)」を足し、reading の中に空の「論文」を一つ作る。元の冊・親・題・並び・前の整理の記録は org に
     （k: "six"）。戻すのは undoPlan。題は字と数だけで引き当てる（絵文字・括弧・空白の違いで外れない）。
     人の名前が入る題は名前を除いた末尾の正規表現で（リポジトリに名前を置かない）。 */
  const SHELVES = ["thinking", "reading", "teaching", "learning", "living", "archive"];
  const PW = "philosophy&work";
  const PAPERS = "論文";
  const ev = (t) => ["archive", EV, [t], `${t}(${EV})`];
  const SIX = [
    ...["アファーマティブアクションについて", "一日ひとつの成長を", "メタファーの遍在性", "学びのモジュール化",
      "拾い物言説", "能力主義を超えて"].map((t) => ["thinking", "思考・読書", [t]]),
    ["reading", "思考・読書", ["読了まとめ"]], ["reading", "思考・読書", ["読みたい本"]], ["reading", PAPERS, null],
    ["teaching", "Notion", [PW, "【子どもの様子】"]], ["teaching", "Notion", [PW, "【教育全般】"]],
    ...["授業【国語】", "授業【算数】", "活動【社会見学】", "授業【自立活動】", "授業【特別活動】", "授業【体育】", "授業【総合】"]
      .map((t) => ["teaching", "Notion", [PW, "【教育全般】", t]]),
    ["learning", "Notion", [PW, "【語彙】"]], ["learning", "Notion", [PW, "【言語学】"]], ["learning", "Notion", ["【learningDB】"]],
    ["learning", "思考・読書", ["【もっと学びたいこと】"]],
    ["living", "private", [/30歳anniversaryディナー候補$/]], ["living", "private", ["Messages"]],
    ["living", "Notion", ["【learningDB】", "【自身の保険・投資について】"]],
    ev("学習用"), ev("教員職務"), ev("教採対策"), ev("思考"), ev("修士論文"),
    ["archive", EV, ["積み上げ"], null, (n) => n.id === "n-tsumiage"],
    ["archive", "Notion", ["全体構想"]],
  ];
  const keyOf = (s) => String(s || "").normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");

  /** 計画。返すのは { at, made, patches, moved, missing, by: {冊: 数} }。o.at・o.uid … 試験で決め打つとき。 */
  function sixPlan(o) {
    const opt = o || {};
    const at = opt.at || U.today();
    const t = KN.notes.tree();
    const live = KN.notes.list();
    const by = new Map(live.map((n) => [n.id, n]));
    /* 冊の一番上から題の道すじで一つに決まるときだけ（同じ題が並ぶ段は触らない）。 */
    const find = (nb, path, test) => {
      let level = t.tops(nb);
      let n = null;
      for (const title of path) {
        const hits = level.filter((k) => (title instanceof RegExp ? title.test(keyOf(k.title)) : keyOf(k.title) === keyOf(title)));
        if (hits.length !== 1) return test ? live.find((k) => k.notebook === nb && test(k)) || null : null;
        n = hits[0];
        level = t.kids(n.id);
      }
      return n;
    };
    const made = [];
    const patches = new Map();
    const missing = [];
    const idx = {};
    const pos = (nb) => { idx[nb] = (idx[nb] || 0) + 1; return "0" + String(idx[nb]).padStart(3, "0"); };
    const mark = (n, r) => Object.assign({ at, k: "six" }, r, n.org ? { prev: n.org } : {});
    SIX.forEach(([to, nb, path, title, test]) => {
      if (!path) {
        const kids = t.tops(nb);
        if (!kids.length) { missing.push(nb); return; }
        const f = Object.assign(KN.notes.draft(), { id: opt.uid ? opt.uid() : U.uid("n"), title: nb, notebook: to,
          createdAt: at, updatedAt: at, pos: pos(to), org: { at, k: "six", made: true } });
        made.push(f);
        kids.forEach((n) => patches.set(n.id, { notebook: to, parent: f.id, org: mark(n, { nb: n.notebook, p: n.parent || "" }) }));
        return;
      }
      const n = find(nb, path, test);
      if (!n || patches.has(n.id)) { missing.push(`${nb} › ${path.join(" › ")}`); return; }
      const r = { nb: n.notebook, p: n.parent || "", o: n.pos == null ? null : n.pos };
      const p = { notebook: to, parent: undefined, pos: pos(to) };
      if (title && n.title !== title) { r.t = n.title; p.title = title; }
      p.org = mark(n, r);
      patches.set(n.id, p);
    });
    /* 子は親と同じ冊（docs/notes-unify.md「形」）。付け替えたあとの親をたどって一番上の冊に。 */
    const made1 = new Map(made.map((f) => [f.id, f]));
    const val = (n, k) => (patches.has(n.id) && k in patches.get(n.id) ? patches.get(n.id)[k] : n[k]);
    const up = (n) => { const id = val(n, "parent"); return id ? by.get(String(id)) || made1.get(String(id)) || null : null; };
    live.forEach((n) => {
      if (patches.has(n.id)) return;
      let r = n;
      const seen = new Set([n.id]);
      for (let q = up(r); q && !seen.has(q.id); q = up(q)) { seen.add(q.id); r = q; }
      const nb = made1.has(r.id) ? r.notebook : val(r, "notebook");
      if (nb !== n.notebook) patches.set(n.id, { notebook: nb, org: mark(n, { nb: n.notebook }) });
    });
    const count = {};
    patches.forEach((p) => { if (SHELVES.includes(p.notebook)) count[p.notebook] = (count[p.notebook] || 0) + 1; });
    return { at, made, patches: [...patches.entries()], moved: patches.size, missing, by: count };
  }

  /** 書く：ノートを一度に、それから冊の並びを6つを頭に。 */
  async function sixApply(p) {
    if (!p.moved) return p;
    await KN.notes.reshape(p.made, p.patches);
    const rest = KN.notes.notebooks().filter((nb) => !SHELVES.includes(nb));
    KN.notes.setBooks(SHELVES.concat(rest));
    return p;
  }

  /* 使っていない冊を消す（10月15日、利用者「もう使ってないよね？消して」）。ノートは消さない：残っていたノートは
     archive の一番上の終わりへ（中ごと）。冊の名前は並び（books）から外す。戻すのは「6つに分けたのを戻す」（同じ k）。 */
  const OLD = ["Notion", "private", PAPERS, EV, "思考・読書"];
  function oldPlan(o) {
    const at = (o && o.at) || U.today();
    const live = KN.notes.list();
    const books = KN.notes.notebooks().filter((nb) => OLD.includes(nb));
    const mine = live.filter((n) => OLD.includes(n.notebook));
    const ids = new Set(mine.map((n) => n.id));
    let k = KN.notes.tree().tops("archive").length;
    const mark = (n, r) => Object.assign({ at, k: "six" }, r, n.org ? { prev: n.org } : {});
    const patches = [];
    const moved = [];
    mine.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach((n) => {
      const top = !n.parent || !ids.has(String(n.parent));
      const r = { nb: n.notebook };
      const p = { notebook: "archive" };
      if (top) {
        k += 1;
        Object.assign(r, { p: n.parent || "", o: n.pos == null ? null : n.pos });
        Object.assign(p, { parent: undefined, pos: "0" + String(k).padStart(3, "0") });
        moved.push(n.title || "ノート");
      }
      if (n.head) { r.hd = true; p.head = undefined; }
      p.org = mark(n, r);
      patches.push([n.id, p]);
    });
    return { at, patches, books, moved };
  }
  async function oldApply(p) {
    if (p.patches.length) await KN.notes.reshape([], p.patches);
    KN.notes.setBooks(KN.notes.notebooks().filter((nb) => !OLD.includes(nb)));
    return p;
  }
  function oldPreview(done) {
    const p = oldPlan();
    if (!p.books.length) return null;
    const P = S();
    const body = node(html`<div class="stack"></div>`);
    body.append(P.card(p.books.map((nb) => node(html`<div class="set-row"><span class="set-title">${nb}</span></div>`))));
    if (p.moved.length) body.append(P.card(row("archive へ", p.moved.length)), P.more("どれ", p.moved.join(" ／ ")));
    const foot = node(html`<div class="stack gap-2"><button class="btn btn-primary js-tidy"><span class="js-word">消す</span></button></div>`);
    const go = foot.querySelector(".js-tidy");
    const word = foot.querySelector(".js-word");
    let busy = false;
    const h = KN.ui.sheet({ title: "使っていない冊を消しますか？", content: body, footer: foot });
    go.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      go.disabled = true;
      word.textContent = "控えを取っています";
      if (!(await guard("使っていない冊を消す前"))) { busy = false; go.disabled = false; word.textContent = "消す"; return; }
      try {
        await oldApply(oldPlan());
      } catch (_) {
        KN.ui.toast("ノートを保存できませんでした", { long: true });
        h.close();
        return;
      }
      h.close();
      if (done) done();
      KN.ui.toast("消しました");
    });
    return h;
  }

  /** 6つに分けた回（戻せるもの。新しい順）。 */
  function sixRuns() {
    const set = new Set();
    KN.notes.list().forEach((n) => { if (n.org && n.org.k === "six") set.add(n.org.at); });
    return [...set].sort().reverse();
  }

  /** 先に見せる紙 → 控え → 分ける。 */
  function sixPreview(done) {
    const p = sixPlan();
    if (!p.moved) { KN.ui.toast("分けるものはありません"); return null; }
    const P = S();
    const body = node(html`<div class="stack"></div>`);
    body.append(P.card(SHELVES.filter((nb) => p.by[nb]).map((nb) => row(nb, p.by[nb]))));
    if (p.missing.length) body.append(P.card(row("見つからないのでそのまま", p.missing.length)), P.more("どれ", p.missing.join(" ／ ")));
    const foot = node(html`<div class="stack gap-2"><button class="btn btn-primary js-tidy"><span class="js-word">分ける</span></button></div>`);
    const go = foot.querySelector(".js-tidy");
    const word = foot.querySelector(".js-word");
    let busy = false;
    const h = KN.ui.sheet({ title: "6つに分ける", content: body, footer: foot });
    go.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      go.disabled = true;
      word.textContent = "控えを取っています";
      if (!(await guard("6つに分ける前"))) { busy = false; go.disabled = false; word.textContent = "分ける"; return; }
      try {
        await sixApply(sixPlan());
      } catch (_) {
        KN.ui.toast("ノートを保存できませんでした", { long: true });
        h.close();
        return;
      }
      h.close();
      if (done) done();
      KN.ui.toast("分けました");
    });
    return h;
  }

  KN.noteOrganize = { plan, linkPlan, linkPreview, apply, after, undoPlan, runs, empty, preview, undo,
    SHELVES, sixPlan, sixApply, sixRuns, sixPreview, oldPlan, oldApply, oldPreview };
})();
