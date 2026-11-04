/* =========================================================
   くらしノート — 同期の部屋（中身。docs/sync.md）
   =========================================================

   iPhone・iPad・Surface が、端末で鍵をかけた記録を預け合う部屋です。
   **部屋は中身を読めません。** 預かるのは暗号文と、鍵つきハッシュにした
   棚・記録の名前だけ。見えるのは版・順・消した印・大きさ・時刻です。

   このファイルは Cloudflare に寄せません。使うのは
     sql(問い, ...値) → 行の配列（SQLite）
     tx(fn)           → fn をひとまとまりで（途中で落ちたら全部なかったことに）
     io               → upgrade(端末) で WebSocket を受け、list(端末?) で配る相手
   の三つだけ。Durable Object へのつなぎは worker.mjs、外に出ない試験の部屋は
   room.test.mjs です。ほかの SQLite の置き場へ移すときも、ここはそのまま。

   ---- 口 ----

     GET    /              部屋があるかだけ（鍵なし）
     POST   /join          {code, name, schema} → {device, token, room, head, schema}
                           code は最初の一台なら ROOM_SETUP、二台めからは /pair の合言葉
     POST   /pair          二台めの合言葉を一つ作る（10分・一回だけ・5回まで）
     GET    /devices       端末の一覧
     DELETE /devices/<id>  その端末を切る（鍵が消え、開いている WebSocket も閉じる）
     POST   /push          {schema, changes:[{op, shelf, item, base, body | del}], sure?}
     GET    /pull?since=N  N より後に変わった記録（一件につき今の版だけ）
     GET    /ws            新しい番号を知らせるだけ（休眠の形。中身は送らない）

   端末の鍵は Authorization: Bearer <token>。WebSocket は見出しを付けられないので、
   Sec-WebSocket-Protocol に "kn-sync, <token>" と並べます。

   ---- 守り ----

   - 同じ操作の番号（op）は二度当てない：前の答えをそのまま返す。
   - 元の版（base）が今の版と違えば断り、今の中身を返す（端末が三方で合わせて送り直す）。
   - 一度にたくさん消す送りは断る（下の many）。端末が訊いてから sure で通す。
   - 約束の版（schema）より古い端末の書き込みは断る。読むのは断らない（読んでも何も消えない）。
   - 暗号文らしくないもの（素の JSON・日付のままの名前）は預からない——鍵をかけ忘れた端末から、
     中身が部屋に置かれないように。
   - 本文はどこにも書き出さない（console を使わない。落ちても理由を返さない）。
   - 端末の鍵・合言葉はハッシュでだけ持つ。部屋を覗かれても鍵にはならない。 */

export const PROTO = "kn-sync";

export const LIMIT = {
  request: 4 * 1024 * 1024,     // 一回の送り（字数）
  body: 512 * 1024,             // 一件の暗号文（字数）
  changes: 500,                 // 一回の送りの件数
  pull: 500, pullMax: 1000,     // 一回で渡す件数
  pullBytes: 4 * 1024 * 1024,   // 一回で渡す暗号文の字数
  setupMin: 20,                 // ROOM_SETUP の短さの下限
  pairLife: 10 * 60 * 1000,     // 二台めの合言葉の期限
  pairTries: 5,                 // 合言葉を外せる回数（使い切ると合言葉が消える）
  failMax: 10,                  // 一時間に外せる回数（越えると一時間 /join を断る）
  failWindow: 60 * 60 * 1000,
  delFloor: 10, delShare: 5, delCap: 100,   // 消しの上限（many）
  delWindow: 10 * 60 * 1000,                // 消しを足し合わせる幅
  keep: 30 * 86400000,          // 履歴（巻き戻し）
  opsKeep: 60 * 86400000,       // 操作の番号の覚え（2週間電波なしでも二度当てない）
};

const NAME = /^[A-Za-z0-9_-]{22,86}$/;          // 鍵つきハッシュ（16〜64バイト）
const OP = /^[A-Za-z0-9_-]{8,64}$/;
const BODY = /^[A-Za-z0-9+/_-]{24,}={0,2}$/;    // 暗号文（base64）
const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;
const DEV = /^[A-Za-z0-9_-]{8,64}$/;
const PAIR_ABC = "abcdefghijkmnpqrstuvwxyz23456789";   // 紛らわしい l 1 o 0 を落とした32字

const TABLES = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rec (shelf TEXT NOT NULL, item TEXT NOT NULL, ver INTEGER NOT NULL,
     seq INTEGER NOT NULL, del INTEGER NOT NULL, body TEXT, size INTEGER NOT NULL, dev TEXT NOT NULL,
     at INTEGER NOT NULL, PRIMARY KEY (shelf, item))`,
  `CREATE INDEX IF NOT EXISTS rec_seq ON rec (seq)`,
  `CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, shelf TEXT NOT NULL, item TEXT NOT NULL,
     ver INTEGER NOT NULL, del INTEGER NOT NULL, body TEXT, dev TEXT NOT NULL, op TEXT NOT NULL,
     asked INTEGER NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS log_at ON log (at)`,
  `CREATE INDEX IF NOT EXISTS log_del ON log (dev, shelf, del, at)`,
  `CREATE TABLE IF NOT EXISTS ops (dev TEXT NOT NULL, op TEXT NOT NULL, res TEXT NOT NULL,
     at INTEGER NOT NULL, PRIMARY KEY (dev, op))`,
  `CREATE INDEX IF NOT EXISTS ops_at ON ops (at)`,
  `CREATE TABLE IF NOT EXISTS dev (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     schema INTEGER NOT NULL, made INTEGER NOT NULL, seen INTEGER NOT NULL, read INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pair (hash TEXT PRIMARY KEY, maker TEXT NOT NULL, until INTEGER NOT NULL,
     tries INTEGER NOT NULL)`,
];

const HEAD = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const reply = (status, obj) => new Response(JSON.stringify(obj),
  { status, headers: { ...HEAD, "Content-Type": "application/json; charset=utf-8" } });
const text = (status, s) => new Response(s,
  { status, headers: { ...HEAD, "Content-Type": "text/plain; charset=utf-8" } });

const b64url = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const random = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };
const token = (n) => b64url(random(n));
const pairCode = () => [...random(10)].map((x) => PAIR_ABC[x & 31]).join("");   // 50ビット
const normPair = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
async function sha(s) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}
const okSetup = (s) => typeof s === "string" && s.trim().length >= LIMIT.setupMin;
const cleanName = (s) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40) : "");
const int = (v) => (Number.isSafeInteger(v) ? v : null);

async function readJson(request, max) {
  const len = Number(request.headers.get("content-length"));
  if (len > max) return { bad: reply(413, { why: "big" }) };
  const t = await request.text();
  if (t.length > max) return { bad: reply(413, { why: "big" }) };
  try {
    const v = JSON.parse(t);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return { v };
  } catch { return { bad: reply(400, { why: "json" }) }; }
}

/* 一件の変更が形どおりか。どれか一つでも外れたら、その送りは丸ごと断る（半分だけ当てない）。 */
function badChange(c) {
  if (!c || typeof c !== "object") return true;
  if (typeof c.op !== "string" || !OP.test(c.op)) return true;
  if (typeof c.shelf !== "string" || !NAME.test(c.shelf)) return true;
  if (typeof c.item !== "string" || !NAME.test(c.item)) return true;
  if (int(c.base) === null || c.base < 0) return true;
  if (c.del === true) return c.body !== undefined;
  if (c.del !== undefined) return true;
  return typeof c.body !== "string" || c.body.length > LIMIT.body || !BODY.test(c.body);
}

export class Room {
  constructor({ sql, tx, io, setup, now }) {
    this.sql = sql;
    this.tx = tx || ((fn) => fn());
    this.io = io || {};
    this.setup = setup;
    this.now = now || (() => Date.now());
    for (const q of TABLES) sql(q);
    if (!this.meta("room")) {
      this.tx(() => { this.setMeta("room", token(12)); this.setMeta("head", 0); this.setMeta("schema", 0); });
    }
  }

  one(q, ...b) { return this.sql(q, ...b)[0] || null; }
  meta(k) { const r = this.one(`SELECT v FROM meta WHERE k = ?`, k); return r ? r.v : null; }
  setMeta(k, v) {
    this.sql(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`, k, String(v));
  }

  async handle(request) {
    try { return await this.route(request); }
    catch { return reply(500, { why: "room" }); }   // 理由も中身も返さない・書き出さない
  }

  async route(request) {
    const url = new URL(request.url);
    const m = request.method;
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: HEAD });
    if (p === "/" && m === "GET") return this.hello();
    if (p === "/join" && m === "POST") return this.join(request);

    const me = await this.who(request, p === "/ws");
    if (!me) return reply(401, { why: "who" });
    if (p === "/ws" && m === "GET") return this.listen(request, me);
    if (p === "/pull" && m === "GET") return this.pull(url, me);
    if (p === "/push" && m === "POST") return this.push(request, me);
    if (p === "/pair" && m === "POST") return this.pair(me);
    if (p === "/devices" && m === "GET") return this.devices(me);
    const d = /^\/devices\/([^/]+)$/.exec(p);
    if (d && m === "DELETE" && DEV.test(d[1])) return this.cut(d[1]);
    return reply(404, { why: "where" });
  }

  /* 合言葉の無い部屋を、誰も入れないまま黙って置かない。端末が一台でもいれば、合言葉は外してあってよい。 */
  hello() {
    if (!okSetup(this.setup) && !this.one(`SELECT id FROM dev LIMIT 1`)) {
      return text(500, "ROOM_SETUP が置かれていません（Settings → Variables and Secrets に Secret で）");
    }
    return text(200, "くらしノートの部屋");
  }

  async who(request, ws) {
    let t = "";
    const a = /^Bearer (\S+)$/.exec(request.headers.get("authorization") || "");
    if (a) t = a[1];
    else if (ws) {
      const p = (request.headers.get("sec-websocket-protocol") || "").split(",").map((s) => s.trim());
      if (p[0] === PROTO) t = p[1] || "";
    }
    if (!TOKEN.test(t)) return null;
    return this.one(`SELECT id, name, schema, read FROM dev WHERE hash = ?`, await sha(t));
  }

  /* 外した回数。一時間に failMax を越えたら、正しい合言葉でも一時間断る。 */
  locked(now) {
    const n = Number(this.meta("fail_n") || 0), since = Number(this.meta("fail_since") || 0);
    return n >= LIMIT.failMax && now - since < LIMIT.failWindow;
  }
  miss(now) {
    const since = Number(this.meta("fail_since") || 0);
    if (now - since >= LIMIT.failWindow) { this.setMeta("fail_since", now); this.setMeta("fail_n", 1); }
    else this.setMeta("fail_n", Number(this.meta("fail_n") || 0) + 1);
    this.sql(`UPDATE pair SET tries = tries - 1`);
    this.sql(`DELETE FROM pair WHERE tries <= 0`);
  }

  /* 最初の一台は ROOM_SETUP（その値につき一回だけ。Cloudflare で値を変えれば、もう一度だけ使える
     ＝持ち主だけができる取り戻し）。二台めからは、つながった端末が作る使い捨ての合言葉。 */
  async join(request) {
    const { v, bad } = await readJson(request, 4096);
    if (bad) return bad;
    const code = typeof v.code === "string" ? v.code.trim() : "";
    const name = cleanName(v.name), schema = int(v.schema);
    if (!code || code.length > 200 || !name || !schema || schema < 1) return reply(400, { why: "form" });
    const now = this.now();
    const setupHash = okSetup(this.setup) ? await sha("setup:" + this.setup.trim()) : null;
    const asSetup = await sha("setup:" + code), asPair = await sha("pair:" + normPair(code));
    const tok = token(32), tokHash = await sha(tok), id = token(12);
    let out;
    this.tx(() => {
      if (this.locked(now)) { out = reply(429, { why: "wait" }); return; }
      this.sql(`DELETE FROM pair WHERE until <= ?`, now);
      let ok = false;
      if (setupHash && asSetup === setupHash && this.meta("setup_used") !== setupHash) {
        this.setMeta("setup_used", setupHash);
        ok = true;
      } else if (this.one(`SELECT hash FROM pair WHERE hash = ?`, asPair)) {
        this.sql(`DELETE FROM pair WHERE hash = ?`, asPair);
        ok = true;
      }
      if (!ok) { this.miss(now); out = reply(403, { why: "code" }); return; }
      this.sql(`INSERT INTO dev (id, hash, name, schema, made, seen, read) VALUES (?, ?, ?, ?, ?, ?, 0)`,
        id, tokHash, name, schema, now, now);
      out = reply(200, { device: id, token: tok, room: this.meta("room"),
        head: Number(this.meta("head")), schema: Number(this.meta("schema")) });
    });
    return out;
  }

  /* 生きている合言葉はいつも一つだけ（作り直せば前のは消える）。 */
  async pair(me) {
    const code = pairCode(), hash = await sha("pair:" + code), until = this.now() + LIMIT.pairLife;
    this.tx(() => {
      this.sql(`DELETE FROM pair`);
      this.sql(`INSERT INTO pair (hash, maker, until, tries) VALUES (?, ?, ?, ?)`, hash, me.id, until, LIMIT.pairTries);
    });
    return reply(200, { code, until });
  }

  devices(me) {
    const rows = this.sql(`SELECT id, name, schema, made, seen FROM dev ORDER BY made`);
    return reply(200, { devices: rows.map((r) => ({ id: r.id, name: r.name, schema: r.schema,
      made: r.made, seen: r.seen, me: r.id === me.id })) });
  }

  cut(id) {
    let found = false;
    this.tx(() => {
      found = !!this.one(`SELECT id FROM dev WHERE id = ?`, id);
      this.sql(`DELETE FROM dev WHERE id = ?`, id);
      this.sql(`DELETE FROM pair WHERE maker = ?`, id);
    });
    if (!found) return reply(404, { why: "where" });
    for (const ws of this.sockets(id)) { try { ws.close(4001, "cut"); } catch { /* もう閉じている */ } }
    return reply(200, { ok: true });
  }

  sockets(id) { try { return this.io.list ? this.io.list(id) || [] : []; } catch { return []; } }

  listen(request, me) {
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") return reply(426, { why: "ws" });
    if (!this.io.upgrade) return reply(501, { why: "ws" });
    return this.io.upgrade(me.id);
  }

  /* 知らせるのは番号だけ。棚の名前も暗号文も載せない。 */
  tell(head) {
    const msg = JSON.stringify({ head });
    for (const ws of this.sockets()) { try { ws.send(msg); } catch { /* 閉じかけ */ } }
  }

  async push(request, me) {
    const { v, bad } = await readJson(request, LIMIT.request);
    if (bad) return bad;
    const schema = int(v.schema), list = v.changes;
    if (!schema || schema < 1) return reply(400, { why: "form" });
    if (!Array.isArray(list) || !list.length || list.length > LIMIT.changes) return reply(400, { why: "form" });
    const at = list.findIndex(badChange);
    if (at >= 0) return reply(400, { why: "form", at });
    const sure = int(v.sure);
    const now = this.now();
    let out, moved = 0;
    this.tx(() => {
      const roomSchema = Number(this.meta("schema"));
      if (schema < roomSchema) { out = reply(426, { why: "old", schema: roomSchema }); return; }
      if (schema > roomSchema + 1) { out = reply(400, { why: "schema", schema: roomSchema }); return; }

      const done = new Map();
      for (const c of list) {
        if (done.has(c.op)) continue;
        const r = this.one(`SELECT res FROM ops WHERE dev = ? AND op = ?`, me.id, c.op);
        if (r) done.set(c.op, JSON.parse(r.res));
      }
      const fresh = list.filter((c, i) => !done.has(c.op) && list.findIndex((d) => d.op === c.op) === i);

      /* many：同じ棚で、この送りとこの端末の直近10分の消しを足して、delCap を越えるか、
         delFloor を越えて生きている数の 1/delShare を越えたら断る。訊いて決めた消し（sure）は数えない。 */
      const dels = fresh.filter((c) => c.del);
      const asked = dels.length > 0 && sure === dels.length;
      if (dels.length && !asked) {
        const per = new Map();
        for (const c of dels) per.set(c.shelf, (per.get(c.shelf) || 0) + 1);
        for (const [shelf, n0] of per) {
          const recent = this.one(`SELECT COUNT(*) AS n FROM log WHERE dev = ? AND shelf = ? AND del = 1
            AND asked = 0 AND at > ?`, me.id, shelf, now - LIMIT.delWindow).n;
          const live = this.one(`SELECT COUNT(*) AS n FROM rec WHERE shelf = ? AND del = 0`, shelf).n;
          const n = n0 + recent;
          if (n > LIMIT.delCap || (n > LIMIT.delFloor && n * LIMIT.delShare > live)) {
            out = reply(409, { why: "many", shelf, n, live });
            return;
          }
        }
      }

      if (schema > roomSchema) this.setMeta("schema", schema);
      const before = Number(this.meta("head"));
      let head = before;
      const results = [];
      for (const c of list) {
        if (done.has(c.op)) { results.push({ ...done.get(c.op), again: true }); continue; }
        const cur = this.one(`SELECT ver, seq, del, body, at FROM rec WHERE shelf = ? AND item = ?`, c.shelf, c.item);
        const ver = cur ? cur.ver : 0;
        let res;
        if (c.base !== ver) {
          /* 断った答えは覚えない：送り直されたら、そのときの今の中身で答え直す。 */
          res = { op: c.op, ok: false, why: "ver", cur: cur ? shape(cur) : { ver: 0 } };
          results.push(res);
          done.set(c.op, res);
          continue;
        }
        if (c.del && (!cur || cur.del)) {
          res = { op: c.op, ok: true, ver, seq: cur ? cur.seq : 0 };   // 無いものを消す：何も変えない
        } else {
          head += 1;
          const nv = ver + 1;
          const body = c.del ? cur.body : c.body;   // 消すは印だけ。前の中身は残す
          this.sql(`INSERT INTO rec (shelf, item, ver, seq, del, body, size, dev, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (shelf, item) DO UPDATE SET ver = excluded.ver, seq = excluded.seq, del = excluded.del,
            body = excluded.body, size = excluded.size, dev = excluded.dev, at = excluded.at`,
            c.shelf, c.item, nv, head, c.del ? 1 : 0, body, body ? body.length : 0, me.id, now);
          this.sql(`INSERT INTO log (seq, shelf, item, ver, del, body, dev, op, asked, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            head, c.shelf, c.item, nv, c.del ? 1 : 0, c.del ? null : c.body, me.id, c.op, c.del && asked ? 1 : 0, now);
          res = { op: c.op, ok: true, ver: nv, seq: head };
        }
        this.sql(`INSERT INTO ops (dev, op, res, at) VALUES (?, ?, ?, ?)`, me.id, c.op, JSON.stringify(res), now);
        done.set(c.op, res);
        results.push(res);
      }
      this.setMeta("head", head);
      this.sql(`UPDATE dev SET schema = ?, seen = ? WHERE id = ?`, schema, now, me.id);
      this.sql(`DELETE FROM log WHERE at < ?`, now - LIMIT.keep);
      this.sql(`DELETE FROM ops WHERE at < ?`, now - LIMIT.opsKeep);
      this.sql(`DELETE FROM pair WHERE until <= ?`, now);
      moved = head > before ? head : 0;
      out = reply(200, { head, results });
    });
    if (moved) this.tell(moved);
    return out;
  }

  pull(url, me) {
    const q = (k) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : null);
    const since = q("since") ?? 0, limit = q("limit") ?? LIMIT.pull;
    if (!Number.isSafeInteger(since) || since < 0) return reply(400, { why: "form" });
    if (!Number.isSafeInteger(limit) || limit < 1) return reply(400, { why: "form" });
    const head = Number(this.meta("head")), room = this.meta("room"), schema = Number(this.meta("schema"));
    /* 端末の番号が部屋より先＝部屋が作り直された。端末は前に合わせた中身を捨てずに、全部を送り直す。 */
    if (since > head) return reply(409, { why: "ahead", head, room });
    const n = Math.min(limit, LIMIT.pullMax);
    const rows = this.sql(`SELECT shelf, item, ver, seq, del, body, at FROM rec WHERE seq > ? ORDER BY seq LIMIT ?`, since, n + 1);
    const items = [];
    let bytes = 0, more = rows.length > n;
    for (const r of rows.slice(0, n)) {
      const b = r.del ? 0 : (r.body || "").length;
      if (items.length && bytes + b > LIMIT.pullBytes) { more = true; break; }
      bytes += b;
      items.push(shape(r));
    }
    const next = items.length ? items[items.length - 1].seq : since;
    this.sql(`UPDATE dev SET read = ?, seen = ? WHERE id = ?`, since, this.now(), me.id);
    return reply(200, { room, head, schema, items, more, next });
  }
}

/* 渡す形。消した記録は中身を載せない（部屋には残っている）。 */
function shape(r) {
  const o = { ver: r.ver, seq: r.seq, at: r.at };
  if (r.shelf !== undefined) { o.shelf = r.shelf; o.item = r.item; }
  if (r.del) o.del = true; else o.body = r.body;
  return o;
}
