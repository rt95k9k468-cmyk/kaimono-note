/* =========================================================
   くらしノート — 写しの端末から足す道（docs/desk.md「段15 の設計」の③）

   写しの端末（js/replica.js）は記録を書かない。足す・直すは一件ずつ Dropbox の受け箱
   `inbox/<端末>/<時刻>-<乱数>.json` へ `add` で置き、主の一台（控えを送る役の iPhone）が取りこむ。
   職場の受け箱（js/dropbox.js の inbox 直下）とは別：端末ごとの入れ物（desk-…）の中だけ。

   中身 `{ v: 1, id, at, kind, … }`（at は置いた時刻。取り込みはこの順）。
     todo { todo: { id, title, due, time } } ／ item { item: { id, name } }（同じ品があれば寄せる）
     diary { day, mark, text } ／ fix { day, pos, was, text } ／ drop { day, pos, was } ／ toNote { day, pos, was, note }
     shop { ops }  買うもの・やること・からだの直し（一回の操作＝一件。下の「買うものの直し」）
   直しは was の一件がそのままあれば当てる（diary-posts.js の swap・take と同じ）。無ければ 直す→新しい一件、外す・移す→外さない。

   写しの端末：置く前に localStorage の控え（HELD。記録の外）へ書き、写しの inboxSeen に id が見えるまで
   持って、写しの上に重ねて見せる（lay）。
   主の一台（take）：日記の突き合わせが済み・記録が見当たらない日でなく・紙が開いていないとき。先に自動の控え →
   at の順に一度の update で当てる → 済んだ id を inboxSeen へ（30日）→ `inbox/.done/` へ移す（30日で消す）。
   読めない・知らない kind・大きすぎるものは当てず・消さず・動かさない。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const store = KN.store;
  const U = KN.util;
  const P = () => KN.diaryPosts;

  const ROOT = "/inbox";
  const DONE = "/inbox/.done";
  const BOX_RE = /^\/inbox\/(desk-[0-9a-f]{8})\/(\d{13}-[0-9a-f]{6}\.json)$/;
  const DONE_RE = /^\/inbox\/\.done\/desk-[0-9a-f]{8}\/(\d{13})-[0-9a-f]{6}(?: \(\d+\))?\.json$/;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ID_RE = /^[\w-]{1,64}$/;
  const KINDS = ["todo", "item", "diary", "fix", "drop", "toNote", "shop"];
  const MAX = 64 * 1024;              // これより大きいファイルは読まない
  const TEXT = 20000;                 // 一件の字の上限
  const KEEP = 30 * 864e5;            // 済んだ id・.done を持つ日数
  const HELD = "kn-desk-held";        // 写しの端末：置いた依頼の控え（記録の外）
  const DEV = "kn-desk-id";           // 写しの端末：受け箱の入れ物の名

  const hex = (n) => {
    const a = new Uint8Array(Math.ceil(n / 2));
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, n);
  };
  const str = (v, max) => typeof v === "string" && v.length <= max;

  /* ---------------- 依頼の形 ---------------- */

  function valid(o) {
    if (!o || typeof o !== "object" || o.v !== 1 || !str(o.id, 64) || !ID_RE.test(o.id)) return false;
    if (!str(o.at, 40) || isNaN(Date.parse(o.at)) || !KINDS.includes(o.kind)) return false;
    if (o.kind === "todo") {
      const t = o.todo;
      return !!t && str(t.id, 64) && ID_RE.test(t.id) && str(t.title, 500) && !!t.title.trim()
        && (t.due == null || DAY_RE.test(t.due)) && (t.time == null || U.isTime(t.time));
    }
    if (o.kind === "item") {
      const i = o.item;
      return !!i && str(i.id, 64) && ID_RE.test(i.id) && str(i.name, 200) && !!i.name.trim();
    }
    if (o.kind === "shop") return !!o.shop && shopValid(o.shop.ops);
    if (!DAY_RE.test(o.day || "")) return false;
    if (o.kind === "diary") return str(o.text, TEXT) && !!P().markOf(o.mark || "");
    if (!str(o.was, TEXT) || !o.was || !(Number.isInteger(o.pos) && o.pos >= 0)) return false;
    if (o.kind === "fix") return str(o.text, TEXT);
    if (o.kind === "toNote") return str(o.note, 64) && ID_RE.test(o.note);
    return true;
  }

  /* ---------------- 買うものの直し（docs/desk.md「買うものを直せる」） ----------------
     store の replicaUpdate が一回の操作を一件の依頼 shop にする（edit）。ops：
       set { t, s: "items"|"products"|"todos", id, was: {欄: 前}, set: {欄: 後} } ／ del { t, s: "items", id, was: { checked } } ／ add { t, id, name, 欄… }
     当てるのは前の値がいまもそのままの欄だけ。無い品は戻さない。ここに無い欄・並べ替え・値段・新しい品物は依頼にしない。
     やることは直すだけ（消す・足す・くり返しとその跡・手順・時刻は依頼にしない）。
     からだ（DIET）は欄を問わず直し、add { s, id, rec } で足し、del { s, id, was: 一件 } はそのままのときだけ消す。
     覚えた分類・絵の言い換え・問いの元（KEY。問いは q が鍵）は key { s, k, was, set }（無い＝null）。 */
  const DIET = ["weights", "meals", "drinks", "urges"];
  const KEY = { learned: (v) => plain(v) && str(v.category, 64), iconOverrides: (v) => str(v, 64) && !!v, asks: (v, k) => plain(v) && v.q === k };
  const keyed = (st, n) => new Map(n === "asks" ? (st.asks || []).map((x) => [x.q, x]) : Object.entries(st[n] || {}));
  const kindOf = (s, k) => (DIET.includes(s) ? k !== "id" && "j" : SHOP[s][k]);
  const shelfOf = (st, n) => (DIET.includes(n) ? st.diet || {} : st)[n] || [];
  const TYPE = {
    b: (v) => typeof v === "boolean", d: (v) => v === null || str(v, 40), m: (v) => str(v, TEXT), a: (v) => Array.isArray(v) && v.length < 50,
    q: (v) => Number.isInteger(v) && v > 0 && v < 1000, n: (v) => str(v, 500) && !!v.trim(), i: (v) => str(v, 64) && ID_RE.test(v),
    j: (v) => v !== undefined && JSON.stringify(v).length <= TEXT,
  };
  const SHOP = {
    items: { checked: "b", checkedAt: "d", fav: "b", qty: "q", memo: "m" },
    products: { name: "n", categoryId: "i", catManual: "b", archived: "b", archivedAt: "d" },
    todos: { title: "n", done: "b", doneAt: "d", skipped: "b", due: "d", deadline: "d", memo: "m", flagged: "b", archived: "b",
      archivedAt: "d", editedAt: "d", review: "d", shelf: "d", waitFor: "d", carried: "d", slips: "a" },
    add: { productId: "i", qty: "q", memo: "m", fav: "b", checked: "b", checkedAt: "d", addedAt: "d" },
  };
  const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  function shopValid(ops) {
    if (!Array.isArray(ops) || !ops.length || ops.length > 50) return false;
    return ops.every((op) => {
      if (plain(op) && op.t === "key") return Object.keys(KEY).includes(op.s) &&str(op.k, 2000) && !!op.k && TYPE.j(op.was) && TYPE.j(op.set) && (op.set === null || KEY[op.s](op.set, op.k));
      if (!plain(op) || !str(op.id, 64) || !ID_RE.test(op.id)) return false;
      const d = DIET.includes(op.s);
      if (op.t === "add" && op.s) return d && plain(op.rec) && op.rec.id === op.id && TYPE.j(op.rec);
      if (op.t === "add") return str(op.name, 200) && !!op.name.trim() && Object.keys(op).every((k) => ["t", "id", "name"].includes(k) || (SHOP.add[k] && TYPE[SHOP.add[k]](op[k])));
      if (op.t === "del") return plain(op.was) && (d ? op.was.id === op.id : op.s === "items" && typeof op.was.checked === "boolean");
      if (op.t !== "set" || !(d || SHOP[op.s]) || op.s === "add" || !plain(op.set) || !plain(op.was)) return false;
      const ks = Object.keys(op.set);
      return !!ks.length && ks.length === Object.keys(op.was).length && ks.every((k) => kindOf(op.s, k) && TYPE[kindOf(op.s, k)](op.set[k]) && k in op.was);
    });
  }

  /** 品を足す（item と shop の add）。同じ id・リストに未チェックの同じ品があれば足さない。 */
  function putItem(s, it, atIso) {
    if (s.items.some((i) => i.id === it.id)) return "kept";
    const name = it.name.trim();
    let prod = (it.productId && s.products.find((p) => p.id === it.productId)) || s.products.find((p) => fold(p.name) === fold(name));
    if (prod && !it.checked && s.items.some((i) => i.productId === prod.id && !i.checked)) return "kept";
    if (!prod) {
      prod = { id: `p-${it.id}`, name, categoryId: store.guessCategory(name) || store.OTHER_CATEGORY, order: null, amount: null, unit: "", note: "", prices: [] };
      s.products.push(prod);
    }
    prod.archived = false;
    const rec = { id: it.id, productId: prod.id, qty: it.qty || 1, memo: it.memo || "", checked: !!it.checked, fav: !!it.fav, addedAt: it.addedAt || atIso.slice(0, 10) };
    if (rec.checked && it.checkedAt) rec.checkedAt = it.checkedAt;
    s.items.unshift(rec);
    return "ok";
  }

  /** shop の ops を当てる。一つでも当たれば "ok"。 */
  function applyShop(s, o) {
    let n = 0;
    for (const op of o.shop.ops) {
      if (op.t === "key") {
        const l = op.s === "asks" && (s.asks = s.asks || []), m = l || (s[op.s] = s[op.s] || {}), was = keyed(s, op.s).get(op.k) || null;
        if (!same(was, op.was) || same(was, op.set)) continue;
        if (!l) op.set === null ? delete m[op.k] : (m[op.k] = op.set);
        else if (was) l.splice(l.indexOf(was), 1, ...(op.set ? [op.set] : []));
        else l.push(op.set);
        n++;
        continue;
      }
      const l = shelfOf(s, op.s), rec = l.find((x) => x && x.id === op.id);
      if (op.t === "add" && op.s) { if (!rec && s.diet && s.diet[op.s]) { l.push(op.rec); n++; } continue; }
      if (op.t === "add") { if (putItem(s, op, o.at) === "ok") n++; continue; }
      if (!rec) continue;
      if (op.t === "del") {
        if (op.s === "items" ? !!rec.checked === op.was.checked : same(rec, op.was)) { l.splice(l.indexOf(rec), 1); n++; }
        continue;
      }
      Object.keys(op.set).forEach((k) => { if (same(rec[k], op.was[k])) { rec[k] = op.set[k]; n++; } });
    }
    return n ? "ok" : "kept";
  }

  /** 写しの記録の前と後が買うものだけの直しなら ops。ほかの欄・並び・新しい品物・知らない欄が動いていたら null。 */
  function diffShop(b, a) {
    if (!plain(b) || !plain(a) || !["items", "products", "todos"].every((k) => Array.isArray(b[k]) && Array.isArray(a[k]))) return null;
    const odd = (x, y, ok) => [...new Set([...Object.keys(x), ...Object.keys(y)])].some((k) => !ok.includes(k) && !same(x[k], y[k]));
    if (odd(b, a, ["settings", "items", "products", "todos", "diet", ...Object.keys(KEY)]) || odd(b.diet || {}, a.diet || {}, DIET)) return null;
    const idSet = (l) => new Set(l.map((x) => x.id));
    const ids = (l, keep) => l.filter((x) => !keep || keep.has(x.id)).map((x) => x.id).join();
    const ops = [];
    const rows = (shelf, was, now) => {
      const wm = new Map(was.map((x) => [x.id, x]));
      for (const x of now) {
        const w = wm.get(x.id), set = {}, prev = {};
        for (const k of new Set(w ? [...Object.keys(w), ...Object.keys(x)] : [])) {
          if (same(w[k], x[k])) continue;
          if (!kindOf(shelf, k)) return false;
          set[k] = x[k] === undefined ? null : x[k];
          prev[k] = w[k] === undefined ? null : w[k];
        }
        if (!Object.keys(set).length) continue;
        if (w.repeat || w.trace) return false;
        ops.push({ t: "set", s: shelf, id: x.id, was: prev, set });
      }
      return true;
    };
    if (ids(b.todos) !== ids(a.todos) || !rows("todos", b.todos, a.todos)) return null;
    if (ids(b.products) !== ids(a.products) || !rows("products", b.products, a.products)) return null;
    const bi = idSet(b.items), ai = idSet(a.items);
    if (ids(b.items, ai) !== ids(a.items, bi) || !rows("items", b.items, a.items)) return null;
    b.items.filter((x) => !ai.has(x.id)).forEach((x) => ops.push({ t: "del", s: "items", id: x.id, was: { checked: !!x.checked } }));
    for (const x of a.items.filter((y) => !bi.has(y.id))) {
      const prod = a.products.find((p) => p.id === x.productId);
      if (!prod) return null;
      const op = { t: "add", id: x.id, name: prod.name, productId: prod.id };
      Object.keys(SHOP.add).slice(1).forEach((k) => { if (x[k] != null) op[k] = x[k]; });
      ops.push(op);
    }
    for (const n of DIET) {
      const bl = shelfOf(b, n), al = shelfOf(a, n), bs = idSet(bl), as = idSet(al);
      if (!rows(n, bl, al)) return null;
      bl.filter((x) => !as.has(x.id)).forEach((x) => ops.push({ t: "del", s: n, id: x.id, was: x }));
      al.filter((x) => !bs.has(x.id)).forEach((x) => ops.push({ t: "add", s: n, id: x.id, rec: x }));
    }
    for (const n in KEY) {
      const bm = keyed(b, n), am = keyed(a, n);
      new Set([...bm.keys(), ...am.keys()]).forEach((k) => same(bm.get(k), am.get(k)) || ops.push({ t: "key", s: n, k, was: bm.get(k) || null, set: am.get(k) || null }));
    }
    return ops;
  }

  /* ---------------- 当てる（記録にも写しにも同じ決まり。s を書き換える） ---------------- */

  /** 印の行の時刻（並べるため）。日付つき（あとで書いた）は、その月日へ。 */
  function whenOf(day, mk) {
    const dt = U.dayDate(day);
    if (!dt || !mk) return 0;
    let y = dt.getFullYear(), mo = dt.getMonth(), d = dt.getDate();
    if (mk.date) {
      const [mm, dd] = mk.date.split("/").map(Number);
      if (mm - 1 < mo || (mm - 1 === mo && dd < d)) y += 1;
      mo = mm - 1; d = dd;
    }
    const [hh, mi] = mk.at.split(":").map(Number);
    return new Date(y, mo, d, hh, mi).getTime();
  }

  /** 一件を、その日の時刻の順の位置へ。後ろに書いた一件が無ければ終わりに足す。 */
  function insert(memo, day, markLine, text) {
    const D = P();
    const body = D.clean(text);
    if (!body) return null;
    const s = String(memo || "");
    const mine = whenOf(day, D.markOf(markLine));
    const later = D.parse(s).find((x) => x.mark && whenOf(day, D.markOf(x.mark)) > mine);
    if (!later) { const r = D.add(s, body, markLine, ""); return r && r.memo; }
    const a = s.slice(0, later.start).replace(/\s+$/, "");
    return `${a ? `${a}\n\n` : ""}${markLine}\n${body}\n\n${s.slice(later.start)}`;
  }

  /** was の一件のいまの場所。pos に一件として丸ごとあればそこ、無ければ同じ字の一件が一つだけのとき。無ければ -1。 */
  function locate(memo, pos, was) {
    const D = P();
    const hit = D.parse(memo).filter((x) => D.chunkOf(memo, x) === was);
    const at = hit.find((x) => D.chunkAt(x) === pos) || (hit.length === 1 ? hit[0] : null);
    return at ? D.chunkAt(at) : -1;
  }

  function dayRow(s, day) { return s.archive.days.find((d) => d.date === day) || null; }
  function setMemo(s, day, memo) {
    const now = new Date().toISOString();
    const cur = dayRow(s, day);
    if (!cur) {
      if (memo.trim()) {
        s.archive.days.push({ date: day, memo, wake: null, sleep: null, wakeSource: "manual", sleepSource: "manual", createdAt: now, updatedAt: now });
      }
      return;
    }
    cur.memo = memo;
    if (!cur.createdAt) cur.createdAt = now;
    cur.updatedAt = now;
    if (!memo.trim() && !cur.wake && !cur.sleep && !cur.sleepStages && !cur.photo) s.archive.days = s.archive.days.filter((d) => d !== cur);
  }

  const fold = (v) => String(v || "").trim().toLowerCase();

  /**
   * 一件を当てる。"ok" 当てた・"kept" 当てずに済ませた（元が変わっていた・もう在る・寄せた）・
   * "wait" いまは当てられない（本文を外した日・ノートがまだ届いていない。ファイルはそのまま）。
   * hasNote(id) … そのノートが手元にあるか。
   */
  function applyTo(s, o, hasNote) {
    const D = P();
    if (o.kind === "todo") {
      if (s.todos.some((t) => t.id === o.todo.id)) return "kept";
      const rec = store.buildTodo({ title: o.todo.title, due: o.todo.due || null, time: o.todo.time || null });
      if (!rec) return "kept";
      rec.id = o.todo.id;
      const cut = store.pastCutoff();
      s.todos.forEach((t) => { if (!store.isPastTodo(t, cut)) t.order = (t.order || 0) + 1; });
      s.todos.unshift(rec);
      return "ok";
    }
    if (o.kind === "item") return putItem(s, { id: o.item.id, name: o.item.name }, o.at);
    if (o.kind === "shop") return applyShop(s, o);
    const cur = dayRow(s, o.day);
    if (store.memoOut(cur)) return "wait";
    const memo = cur ? String(cur.memo || "") : "";
    if (o.kind === "diary") {
      if (memo.includes(`${o.mark}\n${D.clean(o.text)}`)) return "kept";
      const next = insert(memo, o.day, o.mark, o.text);
      if (next == null) return "kept";
      setMemo(s, o.day, next);
      return "ok";
    }
    if (o.kind === "toNote" && !hasNote(o.note)) return "wait";
    const at = locate(memo, o.pos, o.was);
    if (o.kind === "fix") {
      const body = D.clean(o.text);
      const head = o.was.split("\n")[0];
      const mk = D.markOf(head) ? head : null;
      if (at < 0) {
        /* 元が変わっていた：上書きせず、新しい一件として足す（両方残る）。 */
        const next = body ? insert(memo, o.day, mk || D.mark(o.at, o.day), body) : null;
        if (next == null) return "kept";
        setMemo(s, o.day, next);
        return "ok";
      }
      const next = body ? D.swap(memo, at, o.was, mk ? `${mk}\n${body}` : body) : D.take(memo, at, o.was);
      if (next == null) return "kept";
      setMemo(s, o.day, next);
      return "ok";
    }
    /* drop・toNote：元がそのままあるときだけ外す。 */
    if (at < 0) return "kept";
    const next = D.take(memo, at, o.was);
    if (next == null) return "kept";
    setMemo(s, o.day, next);
    return "ok";
  }

  const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  /* ---------------- 写しの端末：置く ---------------- */

  const replica = () => store.replica();

  function device() {
    let d = "";
    try { d = localStorage.getItem(DEV) || ""; } catch (_) { d = ""; }
    if (/^desk-[0-9a-f]{8}$/.test(d)) return d;
    d = `desk-${hex(8)}`;
    try { localStorage.setItem(DEV, d); } catch (_) { /* 書けなければ、この回だけの名 */ }
    return d;
  }

  function readHeld() {
    try {
      const v = JSON.parse(localStorage.getItem(HELD) || "[]");
      return Array.isArray(v) ? v.filter((h) => h && typeof h.path === "string" && valid(h.o)) : [];
    } catch (_) { return []; }
  }
  function saveHeld(list) {
    try { localStorage.setItem(HELD, JSON.stringify(list)); } catch (_) { /* 書けなくても、置いたものは届く */ }
  }

  /** 写しの上に、まだ取りこまれていない依頼を重ねる（store.showReplica が呼ぶ）。取りこまれた控えはここで外す。 */
  function lay(s) {
    if (!replica()) return;
    const seen = (s && s.inboxSeen) || {};
    const all = readHeld();
    const left = all.filter((h) => !seen[h.o.id]);
    if (left.length !== all.length) saveHeld(left);
    left.map((h) => h.o).sort(byAt).forEach((o) => {
      try { applyTo(s, o, () => true); } catch (err) { console.warn("held not shown", err); }
    });
  }

  let sending = null, sendAgain = false;
  function send() {
    if (sending) { sendAgain = true; return sending; }
    sending = sendNow().finally(() => {
      sending = null;
      if (sendAgain) { sendAgain = false; send(); }
    });
    return sending;
  }
  async function sendNow() {
    const db = KN.dropbox && KN.dropbox.api;
    if (!replica() || !db) return 0;
    const list = readHeld().filter((h) => !h.sent);
    if (!list.length || !(await db.ready())) return 0;
    let n = 0;
    for (const h of list) {
      try {
        const r = await db.call(db.CONTENT, "/2/files/upload", {
          arg: { path: h.path, mode: "add", autorename: false, mute: true },
          body: new Blob([JSON.stringify(h.o)], { type: "application/octet-stream" }),
        });
        /* もう在る（前に送れていた）も、送れたこと。 */
        if (!(r.res.ok || (r.res.status === 409 && /conflict/.test(db.summary(r))))) continue;
        const now = readHeld();
        const it = now.find((x) => x.o.id === h.o.id);
        if (it) { it.sent = true; saveHeld(now); }
        n++;
      } catch (_) { /* 次に開いたとき・前に出たとき */ }
    }
    return n;
  }

  /** 依頼を一件置く（写しの端末だけ）。控えに書き、写しに重ね、送る。 */
  function put(kind, fields) {
    if (!replica()) return null;
    const list = readHeld();
    /* at は取り込みの順：同じ一刻みの二つ（品を足してすぐ★）が入れ替わらないよう、前より後ろへ。 */
    const top = list.reduce((m, h) => Math.max(m, Date.parse(h.o.at) || 0), 0);
    const o = { v: 1, id: `q${hex(12)}`, at: new Date(Math.max(Date.now(), top + 1)).toISOString(), kind, ...fields };
    if (!valid(o)) return null;
    list.push({ o, path: `${ROOT}/${device()}/${Date.now()}-${hex(6)}.json`, sent: false });
    saveHeld(list);
    if (KN.replica && KN.replica.redraw) KN.replica.redraw();
    send();
    return o;
  }

  /** store の replicaUpdate から：前と後が買うものだけの直しなら依頼を置く（true。多ければ 8000字ほどずつ分ける）。でなければ false（写しへ戻る）。 */
  function edit(before, after) {
    const parts = [];
    ((replica() && diffShop(before, after)) || []).forEach((op) => {
      const p = parts[parts.length - 1];
      if (p && p.length < 50 && JSON.stringify(p).length < 8000) p.push(op); else parts.push([op]);
    });
    return !!parts.length && parts.every(shopValid) && parts.every((ops) => put("shop", { shop: { ops } }));
  }

  /* ---------------- 写しの端末：足す紙 ---------------- */

  async function addTodo() {
    const v = await KN.ui.prompt({ title: "やること", okLabel: "足す" });
    const text = String(v || "").trim();
    if (!text) return;
    const w = KN.whenParse ? KN.whenParse.parse(text) : { title: text };
    const title = String(w.title || text).trim();
    if (put("todo", { todo: { id: U.uid("t"), title, due: w.due || U.todayKey(), time: w.time || null } })) KN.ui.toast("足しました");
  }
  async function addItem() {
    const v = await KN.ui.prompt({ title: "買うもの", okLabel: "足す" });
    const name = String(v || "").trim();
    if (name && put("item", { item: { id: U.uid("i"), name } })) KN.ui.toast("足しました");
  }

  /**
   * 日記の一件を書く・直す紙（写しの端末。screen-archive.js の openPost から）。
   * 書いても記録には触れず、閉じたときに依頼を一件置く。
   */
  function post(day, item, seed, title) {
    const D = P();
    const memo = (store.dayLog(day) || {}).memo || "";
    const fresh = !item;
    const good = !fresh && D.isGood(item.text);
    const was = fresh ? "" : D.chunkOf(memo, item);
    const pos = fresh ? 0 : D.chunkAt(item);
    const body = U.node(U.html`
      <label class="field arc-memo-field ${good ? "is-good" : ""}">
        <textarea class="textarea js-memo" rows="5" aria-label="${good ? "よかったこと" : "日記"}" placeholder="${good ? "よかったこと" : "いまのことを一行から"}">${fresh ? seed || "" : D.bare(item.text)}</textarea>
      </label>
    `);
    const ta = body.querySelector(".js-memo");
    const started = new Date();
    let how = "keep";
    const close = () => {
      const t = D.clean(ta.value);
      if (fresh) {
        if (t && put("diary", { day, mark: D.mark(started, day), text: t })) KN.ui.toast("保存しました");
        return;
      }
      if (how === "drop" || (how === "keep" && !t)) {
        if (put("drop", { day, pos, was })) KN.ui.toast("消しました");
        return;
      }
      if (how === "note") { moveToNote(day, item, pos, was); return; }
      if (t !== D.clean(D.bare(item.text)) && put("fix", { day, pos, was, text: (good ? D.GOOD : "") + t })) KN.ui.toast("更新しました");
    };
    let h = null;
    const menu = fresh ? null : [
      { icon: "notes", label: "ノートへ移す", onPick: () => { how = "note"; h.close(); } },
      { icon: "trash", label: "消す", danger: true, onPick: () => { how = "drop"; h.close(); } },
    ];
    h = KN.ui.sheet({
      title, content: body, menu, cls: "is-card", clear: true, guard: false,
      footer: U.node(U.html`<button class="btn btn-primary btn-block js-ok">${fresh ? "追加" : "閉じる"}</button>`),
      onClose: close,
    });
    h.el.querySelector(".js-ok").addEventListener("click", () => h.close());
    if (fresh) KN.ui.focusNow(ta);
  }

  /* ノートは写しの端末で書いて同期で送り、依頼はそのノートの id を持つ（iPhone は届いてから外す）。 */
  async function moveToNote(day, item, pos, was) {
    const N = KN.notes;
    const text = P().clean(P().outText(item.text));
    if (!N || N.state() !== "on" || !text) { KN.ui.toast("ノートを開けませんでした"); return; }
    const note = N.draft();
    note.body = text;
    if (!N.put(note)) { KN.ui.toast("ノートを開けませんでした"); return; }
    await N.flush();
    if (N.pending(note.id)) { KN.ui.toast("ノートに保存できませんでした"); return; }
    if (put("toNote", { day, pos, was, note: note.id })) KN.ui.toast("ノートへ移しました");
  }

  /* ---------------- 主の一台：取りこむ ---------------- */

  const bad = new Set();       // 読めない・知らない・大きすぎる（この回は読み直さない。動かさない）
  let taking = null;
  let retryTimer = 0;

  function take() {
    if (taking) return taking;
    taking = takeNow().catch((err) => { console.warn("desk inbox not taken", err); return 0; })
      .finally(() => { taking = null; });
    return taking;
  }

  /** 書く紙が開いているあいだは当てない（段10）。閉じたころにもう一度。 */
  function busy() {
    if (!(KN.ui && KN.ui.sheetsOpen && KN.ui.sheetsOpen() > 0)) return false;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (document.visibilityState === "visible") take(); }, 15000);
    return true;
  }

  async function list(db) {
    const out = [];
    let r = await db.call(db.API, "/2/files/list_folder", { json: { path: ROOT, recursive: true, limit: 2000 } });
    for (let page = 0; r.res.ok && page < 10; page++) {
      (r.body.entries || []).forEach((e) => { if (e[".tag"] === "file") out.push(e); });
      if (!r.body.has_more) break;
      r = await db.call(db.API, "/2/files/list_folder/continue", { json: { cursor: r.body.cursor } });
    }
    return out;
  }

  async function takeNow() {
    const DB = KN.dropbox;
    const db = DB && DB.api;
    if (replica() || !db || store.loadError()) return 0;
    if (!(await db.ready()) || !DB.status().main) return 0;
    const files = await list(db);
    /* .done の古いもの（30日）を消す。 */
    const old = Date.now() - KEEP;
    for (const e of files.filter((f) => { const m = DONE_RE.exec(f.path_lower || ""); return m && Number(m[1]) < old; }).slice(0, 50)) {
      await db.call(db.API, "/2/files/delete_v2", { json: { path: e.path_lower } });
    }
    const box = files.filter((f) => BOX_RE.test(f.path_lower || "") && !bad.has(f.path_lower));
    if (!box.length) return 0;
    /* 日記の突き合わせが済んでから・記録が見当たらない日はしない。 */
    if (KN.diaryIdb) { await KN.diaryIdb.ready(); if (KN.diaryIdb.body() !== "ok") return 0; }
    if (KN.backup && KN.backup.lost) { await KN.backup.checked(); if (KN.backup.lost()) return 0; }
    if (busy()) return 0;

    const got = [];
    for (const f of box) {
      if (f.size > MAX) { bad.add(f.path_lower); continue; }
      const d = await db.call(db.CONTENT, "/2/files/download", { arg: { path: f.path_lower }, raw: true });
      if (!d.res.ok) continue;
      let o = null;
      try { o = JSON.parse(await d.res.text()); } catch (_) { o = null; }
      if (!valid(o)) { bad.add(f.path_lower); continue; }
      got.push({ f, o });
    }
    const seen0 = store.get().inboxSeen || {};
    const fresh = got.filter((g) => !seen0[g.o.id]).sort((a, b) => byAt(a.o, b.o));
    const moving = got.filter((g) => seen0[g.o.id]);
    let n = 0;
    if (fresh.length) {
      if (busy()) return 0;
      /* 先に自動の控え。取れなければ当てない。 */
      if (KN.backup && KN.backup.take) {
        const r = await KN.backup.take("受け箱の取り込み前", { force: true });
        if (r !== "taken" && r !== "same") return 0;
      }
      if (busy() || store.loadError()) return 0;
      const N = KN.notes;
      const hasNote = (id) => { const x = N && N.get ? N.get(id) : null; return !!(x && !x.deletedAt); };
      const now = Date.now();
      const done = [];
      store.update((s) => {
        const seen = {};
        Object.keys(s.inboxSeen || {}).forEach((k) => { if (now - s.inboxSeen[k] < KEEP) seen[k] = s.inboxSeen[k]; });
        fresh.forEach((g) => {
          if (seen[g.o.id]) { done.push(g); return; }
          const r = applyTo(s, g.o, hasNote);
          if (r === "wait") return;
          if (r === "ok") n++;
          seen[g.o.id] = now;
          done.push(g);
        });
        s.inboxSeen = seen;
      });
      /* 書けてから移す（書けなければ次の回にもう一度。当てたものは id で二度当てない）。 */
      if (store.saveNow() === false) return n;
      moving.push(...done);
      if (n && DB.sync) DB.sync();
    }
    for (const g of moving) {
      const m = BOX_RE.exec(g.f.path_lower);
      await db.call(db.API, "/2/files/move_v2", { json: { from_path: g.f.path_lower, to_path: `${DONE}/${m[1]}/${m[2]}`, autorename: true } });
    }
    return n;
  }

  KN.deskInbox = { on: replica, put, send, lay, take, post, addTodo, addItem, valid, applyTo, insert, locate, edit };

  /* ---------------- 起動（KN.deskInbox を置いてから。写しの redraw が lay を引く） ---------------- */

  if (replica()) {
    if (KN.replica && KN.replica.onChange) KN.replica.onChange(() => send());
    if (KN.replica && KN.replica.redraw) KN.replica.redraw();
    setTimeout(send, 3000);
  } else {
    setTimeout(take, 10000);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (replica()) send(); else take();
  });
})();
