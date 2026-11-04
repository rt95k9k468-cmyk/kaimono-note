/* 同期の部屋のふるまい（docs/sync.md）。外に出ずに、本物の worker.mjs と room.mjs を動かします。
   実行： node sync/room.test.mjs

   偽の部屋：Durable Object の ctx（storage.sql.exec・transactionSync・acceptWebSocket・getWebSockets）を
   node:sqlite の上に作り、"cloudflare:workers" と WebSocketPair だけを差し替えます。決まりは本物のまま。 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8");

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined && !ok ? "  → " + detail : ""}`);
};

/* ---------- 偽の Cloudflare ---------- */

class FakeSocket {
  constructor() { this.sent = []; this.closed = null; }
  send(m) { if (this.closed) throw new Error("closed"); this.sent.push(m); }
  close(code, reason) { this.closed = { code, reason }; }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new FakeSocket(); this[1] = new FakeSocket(); } };
globalThis.WebSocketRequestResponsePair = class { constructor(a, b) { this.request = a; this.response = b; } };
/* Node の Response は 101 を作れないので、101 のときだけ形を借ります。 */
const NodeResponse = globalThis.Response;
globalThis.Response = class extends NodeResponse {
  constructor(body, init) {
    if (init && init.status === 101) {
      super(null, { ...init, status: 200 });
      Object.defineProperty(this, "status", { value: 101 });
      this.webSocket = init.webSocket;
    } else super(body, init);
  }
};

function fakeCtx() {
  const db = new DatabaseSync(":memory:");
  const sockets = [];
  let auto = null;
  return {
    db, sockets, get auto() { return auto; },
    storage: {
      sql: {
        exec(q, ...b) {
          if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)/i.test(q)) throw new Error("exec では BEGIN を使えない");
          const rows = db.prepare(q).all(...b).map((r) => ({ ...r }));
          return { toArray: () => rows, one: () => rows[0] };
        },
      },
      transactionSync(fn) {
        db.exec("BEGIN");
        try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    },
    acceptWebSocket(ws, tags) { ws.tags = tags || []; sockets.push(ws); },
    getWebSockets(tag) { return sockets.filter((s) => !s.closed && (tag === undefined || s.tags.includes(tag))); },
    setWebSocketAutoResponse(pair) { auto = pair; },
  };
}

/* worker.mjs を、"cloudflare:workers" だけ差し替えて読む（ほかは一字も変えない）。 */
const workerSrc = read("worker.mjs");
const IMPORT_CF = 'import { DurableObject } from "cloudflare:workers";';
const patched = workerSrc
  .replace(IMPORT_CF, "class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }")
  .replace('"./room.mjs"', JSON.stringify(pathToFileURL(join(here, "room.mjs")).href));
const worker = await import("data:text/javascript," + encodeURIComponent(patched));
const { LIMIT, PROTO } = await import("./room.mjs");

const SETUP = "setup-" + "x".repeat(30);
let clock = Date.UTC(2026, 10, 4, 3, 0, 0);

/* 部屋を一つ建てる。wake() は同じ記憶のまま新しい実体を作る（休眠から起きたのと同じ）。 */
function house(setup = SETUP) {
  const ctx = fakeCtx();
  const env = { ROOM_SETUP: setup };
  let obj = null;
  const make = () => { obj = new worker.Room(ctx, env); obj.core.now = () => clock; return obj; };
  make();
  const names = [];
  env.ROOM = { idFromName: (n) => { names.push(n); return n; }, get: () => ({ fetch: (r) => obj.fetch(r) }) };
  return { ctx, env, names, wake: make, get obj() { return obj; } };
}

const call = async (h, method, path, { body, token, headers } = {}) => {
  const hd = { ...(headers || {}) };
  if (token) hd.authorization = "Bearer " + token;
  if (body !== undefined) hd["content-type"] = "application/json";
  const res = await worker.default.fetch(new Request("https://room.test" + path, {
    method, headers: hd, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
  }), h.env);
  const ct = res.headers.get("content-type") || "";
  const data = res.status === 101 ? null : ct.includes("json") ? await res.json() : await res.text();
  return { res, status: res.status, data };
};

const join1 = (h, code = SETUP, name = "iPhone", schema = 1) => call(h, "POST", "/join", { body: { code, name, schema } });
const b64 = (n) => Buffer.from(String(n).padEnd(24, ".")).toString("base64url");
const H = (s) => Buffer.from(("hash-" + s).padEnd(24, "_")).toString("base64url");   // 鍵つきハッシュのつもり
let opn = 0;
const op = () => "op-" + String(++opn).padStart(6, "0");
const put = (shelf, item, base, body, extra = {}) => ({ op: op(), shelf: H(shelf), item: H(item), base, body: b64(body), ...extra });
const del = (shelf, item, base) => ({ op: op(), shelf: H(shelf), item: H(item), base, del: true });
const push = (h, token, changes, extra = {}) => call(h, "POST", "/push", { token, body: { schema: 1, changes, ...extra } });

/* ---------- 部屋がある・合言葉 ---------- */
{
  const h = house("");
  const r = await call(h, "GET", "/");
  check("ROOM_SETUP が無ければ / は 500 で、何を置くかを言う", r.status === 500 && /ROOM_SETUP/.test(r.data), r.status);
  const j = await join1(h, "anything-long-enough-0000");
  check("ROOM_SETUP が無ければ誰も入れない", j.status === 403, j.status);
  const s = house("short");
  check("20字に満たない ROOM_SETUP は合言葉にならない", (await join1(s, "short")).status === 403);
}
{
  const h = house();
  const r = await call(h, "GET", "/");
  check("/ は 200（部屋があるだけを言う）", r.status === 200 && r.data === "くらしノートの部屋", r.data);
  check("部屋は名前一つ（kurashi）", h.names.every((n) => n === "kurashi") && h.names.length > 0, h.names.join());
  check("ping には眠ったまま pong", h.ctx.auto && h.ctx.auto.request === "ping" && h.ctx.auto.response === "pong");
  const o = await call(h, "OPTIONS", "/push");
  check("前もっての問い合わせ（CORS）は鍵なしで 204",
    o.status === 204 && /Authorization/.test(o.res.headers.get("access-control-allow-headers") || ""));
  check("nosniff・no-store", r.res.headers.get("x-content-type-options") === "nosniff"
    && /no-store/.test(r.res.headers.get("cache-control") || ""));
  for (const [m, p] of [["GET", "/pull"], ["POST", "/push"], ["POST", "/pair"], ["GET", "/devices"], ["GET", "/ws"], ["DELETE", "/devices/abcdefgh"], ["GET", "/nothing"]]) {
    const x = await call(h, m, p);
    check(`鍵なしの ${m} ${p} は 401`, x.status === 401, x.status);
  }
  const bad = await call(h, "GET", "/pull", { token: "A".repeat(43) });
  check("知らない鍵は 401", bad.status === 401, bad.status);
}

/* ---------- 最初の一台と、二台めの合言葉 ---------- */
{
  const h = house();
  const a = await join1(h);
  check("最初の一台は ROOM_SETUP で入れる", a.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(a.data.token || ""), a.status);
  check("入ったら部屋の名札・番号・約束の版が返る", a.data.room && a.data.head === 0 && a.data.schema === 0);
  const again = await join1(h);
  check("同じ ROOM_SETUP は二度使えない", again.status === 403, again.status);
  h.env.ROOM_SETUP = SETUP + "-new"; h.wake();
  const back = await join1(h, SETUP + "-new", "Surface");
  check("ROOM_SETUP を変えれば、もう一度だけ最初の一台になれる（持ち主の取り戻し）", back.status === 200, back.status);
  check("変えた値も二度は使えない", (await join1(h, SETUP + "-new")).status === 403);

  const pr = await call(h, "POST", "/pair", { token: a.data.token });
  check("つながった端末は合言葉を作れる（10字・期限つき）",
    pr.status === 200 && /^[a-km-np-z2-9]{10}$/.test(pr.data.code) && pr.data.until === clock + LIMIT.pairLife, JSON.stringify(pr.data));
  const typed = pr.data.code.toUpperCase().replace(/(.{5})/, "$1 ");
  const b = await join1(h, typed, "iPad");
  check("合言葉で二台めが入れる（大文字・空白で打っても）", b.status === 200, b.status);
  check("合言葉は一回だけ", (await join1(h, pr.data.code, "x")).status === 403);
  const devs = await call(h, "GET", "/devices", { token: b.data.token });
  check("端末の一覧に三台・自分に印", devs.data.devices.length === 3 && devs.data.devices.filter((d) => d.me).length === 1
    && devs.data.devices.some((d) => d.name === "iPad" && d.me));

  const p2 = await call(h, "POST", "/pair", { token: a.data.token });
  clock += LIMIT.pairLife + 1;
  check("期限を過ぎた合言葉は使えない", (await join1(h, p2.data.code)).status === 403);
  clock += LIMIT.failWindow;

  const p3 = await call(h, "POST", "/pair", { token: a.data.token });
  const p4 = await call(h, "POST", "/pair", { token: a.data.token });
  check("作り直すと前の合言葉は消える", (await join1(h, p3.data.code)).status === 403);
  for (let i = 0; i < LIMIT.pairTries - 1; i++) await join1(h, "wrongwrong" + i);
  check("外した回数が上限に届くと、その合言葉は消える", (await join1(h, p4.data.code)).status === 403);
  clock += LIMIT.failWindow;

  const p5 = await call(h, "POST", "/pair", { token: a.data.token });
  for (let i = 0; i < LIMIT.failMax; i++) await join1(h, "nope" + i);
  const locked = await join1(h, "whatever");
  check("一時間に外しすぎると、しばらく /join を断る", locked.status === 429, locked.status);
  clock += LIMIT.failWindow;
  const p6 = await call(h, "POST", "/pair", { token: a.data.token });
  check("一時間たてば、また入れる", (await join1(h, p6.data.code, "Surface2")).status === 200);
  void p5;

  const dump = JSON.stringify(["meta", "dev", "pair"].map((t) => h.ctx.db.prepare(`SELECT * FROM ${t}`).all()));
  check("部屋に端末の鍵・ROOM_SETUP・合言葉の素の字が無い（ハッシュだけ）",
    !dump.includes(a.data.token) && !dump.includes(b.data.token) && !dump.includes(SETUP) && !dump.includes(p6.data.code));

  const ws = await call(h, "GET", "/ws", { headers: { upgrade: "websocket", "sec-websocket-protocol": `${PROTO}, ${b.data.token}` } });
  check("WebSocket は鍵を protocol に載せて 101、kn-sync を返す",
    ws.status === 101 && ws.res.headers.get("sec-websocket-protocol") === PROTO, ws.status);
  const bSocket = h.ctx.sockets[h.ctx.sockets.length - 1];
  const cut = await call(h, "DELETE", "/devices/" + b.data.device, { token: a.data.token });
  check("端末を切れる", cut.status === 200, cut.status);
  check("切った端末の鍵はもう通らない", (await call(h, "GET", "/pull", { token: b.data.token })).status === 401);
  check("切った端末の WebSocket は閉じる", bSocket.closed && bSocket.closed.code === 4001);
  check("無い端末は 404", (await call(h, "DELETE", "/devices/" + b.data.device, { token: a.data.token })).status === 404);
}

/* ---------- 送る ---------- */
async function twoDevices() {
  const h = house();
  const a = (await join1(h)).data;
  const code = (await call(h, "POST", "/pair", { token: a.token })).data.code;
  const b = (await join1(h, code, "iPad")).data;
  return { h, a: a.token, b: b.token, bid: b.device };
}
{
  const { h, a, b } = await twoDevices();
  const c1 = put("shop", "milk", 0, "v1");
  const r1 = await push(h, a, [c1]);
  check("新しい記録は元の版 0 で受け取り、版1・番号1", r1.status === 200 && r1.data.results[0].ok && r1.data.results[0].ver === 1 && r1.data.head === 1, JSON.stringify(r1.data));
  const r2 = await push(h, a, [c1]);
  check("同じ操作の番号は二度当てない（同じ答え・again）", r2.data.results[0].again && r2.data.results[0].ver === 1 && r2.data.head === 1, JSON.stringify(r2.data));
  const logN = () => h.ctx.db.prepare("SELECT COUNT(*) AS n FROM log").get().n;
  for (let i = 0; i < 2; i++) await push(h, a, [c1]);
  check("同じ操作が三度来ても履歴は一つ", logN() === 1, logN());
  const dupIn = put("shop", "egg", 0, "e1");
  const r3 = await push(h, a, [dupIn, dupIn]);
  check("一回の送りに同じ操作が二つあっても一度だけ", r3.data.results[0].ver === 1 && r3.data.results[1].again && r3.data.head === 2);

  const stale = put("shop", "milk", 0, "from-b");
  const r4 = await push(h, b, [stale]);
  const cur = r4.data.results[0];
  check("元の版が違えば断って、今の中身を返す", !cur.ok && cur.why === "ver" && cur.cur.ver === 1 && cur.cur.body === b64("v1"), JSON.stringify(cur));
  check("断ったものは書かれない", r4.data.head === 2);
  const r4b = await push(h, a, [put("shop", "milk", 1, "v2")]);
  const r4c = await push(h, b, [stale]);
  check("断った操作は覚えない（送り直せば、そのときの今の中身で答える）", r4c.data.results[0].cur.ver === 2 && !r4c.data.results[0].again, JSON.stringify(r4c.data.results[0]));
  void r4b;
  const r5 = await push(h, b, [put("shop", "milk", 2, "v3-b")]);
  check("合わせ直して今の版で送れば通る", r5.data.results[0].ok && r5.data.results[0].ver === 3);

  const d1 = await push(h, a, [del("shop", "milk", 3)]);
  check("消すは印（版が進む）", d1.data.results[0].ok && d1.data.results[0].ver === 4);
  const row = h.ctx.db.prepare("SELECT del, body FROM rec WHERE item = ?").get(H("milk"));
  check("消しても前の中身は部屋に残る", row.del === 1 && row.body === b64("v3-b"));
  const d2 = await push(h, b, [put("shop", "milk", 4, "back")]);
  check("消した記録を今の版で直せば戻る", d2.data.results[0].ok && d2.data.results[0].ver === 5);
  const d3 = await push(h, a, [del("shop", "milk", 3)]);
  check("古い版のままの消しは断る（直したほうが残る）", !d3.data.results[0].ok && d3.data.results[0].cur.body === b64("back"));

  const head0 = r5.data.head;
  void head0;
  const bad = [
    ["素の JSON は預からない", { op: op(), shelf: H("shop"), item: H("x"), base: 0, body: '{"name":"牛乳"}' }],
    ["日付のままの名前は預からない", { op: op(), shelf: H("diary"), item: "2026-11-04", base: 0, body: b64("x") }],
    ["棚の名前が短いものは預からない", { op: op(), shelf: "shop", item: H("x"), base: 0, body: b64("x") }],
    ["操作の番号が無いものは預からない", { shelf: H("shop"), item: H("x"), base: 0, body: b64("x") }],
    ["元の版が無いものは預からない", { op: op(), shelf: H("shop"), item: H("x"), body: b64("x") }],
    ["中身も消しも無いものは預からない", { op: op(), shelf: H("shop"), item: H("x"), base: 0 }],
    ["消しに中身を添えたものは預からない", { op: op(), shelf: H("shop"), item: H("x"), base: 0, del: true, body: b64("x") }],
    ["一件の上限を越える暗号文は預からない", { op: op(), shelf: H("shop"), item: H("x"), base: 0, body: "A".repeat(LIMIT.body + 1) }],
  ];
  const before = h.ctx.db.prepare("SELECT COUNT(*) AS n FROM log").get().n;
  for (const [name, c] of bad) {
    const r = await push(h, a, [put("shop", "ok-" + name, 0, "fine"), c]);
    check(name + "（送り全部を断る）", r.status === 400 && r.data.at === 1, r.status);
  }
  check("断った送りの良いほうも当たっていない", h.ctx.db.prepare("SELECT COUNT(*) AS n FROM log").get().n === before);
  check("空の送りは断る", (await push(h, a, [])).status === 400);
  check("件数の上限を越える送りは断る", (await push(h, a, Array.from({ length: LIMIT.changes + 1 }, (_, i) => put("shop", "n" + i, 0, "x")))).status === 400);
  const big = await call(h, "POST", "/push", { token: a, body: "x".repeat(LIMIT.request + 1) });
  check("大きすぎる送りは読む前に断る（413）", big.status === 413, big.status);
  check("読めない送りは 400", (await call(h, "POST", "/push", { token: a, body: "{nope" })).status === 400);
}

/* ---------- 一度にたくさん消す ---------- */
{
  const { h, a, b } = await twoDevices();
  const many = Array.from({ length: 30 }, (_, i) => put("todo", "t" + i, 0, "t" + i));
  await push(h, a, many);
  const kill = (n, from = 0) => Array.from({ length: n }, (_, i) => del("todo", "t" + (from + i), 1));
  const r = await push(h, a, kill(11));
  check("生きている30件のうち11件をまとめて消す送りは断る（409 many）", r.status === 409 && r.data.why === "many" && r.data.n === 11 && r.data.live === 30, JSON.stringify(r.data));
  check("断ったら一件も消えていない", h.ctx.db.prepare("SELECT COUNT(*) AS n FROM rec WHERE del = 1").get().n === 0);
  check("sure の数が違えば通らない", (await push(h, a, kill(11), { sure: 10 })).status === 409);
  const ok = await push(h, a, kill(11), { sure: 11 });
  check("訊いて決めた数（sure）を添えれば通る", ok.status === 200 && ok.data.results.every((x) => x.ok));
  const small = await push(h, a, kill(5, 11));
  check("訊いて決めた消しは、あとの数に足さない", small.status === 200);
  const more = await push(h, a, kill(6, 16));
  check("小分けにしても10分のうちに足して越えれば断る", more.status === 409 && more.data.n === 11, JSON.stringify(more.data));
  const other = await push(h, b, kill(6, 16));
  check("足すのは同じ端末の消しだけ", other.status === 200, other.status);
  clock += LIMIT.delWindow + 1;

  const big = Array.from({ length: 600 }, (_, i) => put("diary", "d" + i, 0, "d" + i));
  await push(h, a, big.slice(0, 300)); await push(h, a, big.slice(300));
  const dkill = (n) => Array.from({ length: n }, (_, i) => del("diary", "d" + i, 1));
  check("10件までは訊かずに消せる", (await push(h, a, dkill(10))).status === 200);
  clock += LIMIT.delWindow + 1;
  const cap = await push(h, a, Array.from({ length: 101 }, (_, i) => del("diary", "d" + (100 + i), 1)));
  check("1/5 に満たなくても100件を越える消しは断る", cap.status === 409 && cap.data.n === 101, JSON.stringify(cap.data));
  const shelfApart = await push(h, a, [...kill(3, 22), ...Array.from({ length: 8 }, (_, i) => del("diary", "d" + (200 + i), 1))]);
  check("棚ごとに数える（別の棚の消しは足さない）", shelfApart.status === 200, JSON.stringify(shelfApart.data));
}

/* ---------- 約束の版 ---------- */
{
  const { h, a, b } = await twoDevices();
  const r1 = await push(h, a, [put("shop", "a", 0, "a")]);
  check("最初の書き込みで約束の版が1になる", r1.status === 200);
  const up = await call(h, "POST", "/push", { token: a, body: { schema: 2, changes: [put("shop", "b", 0, "b")] } });
  check("新しい版の端末が書くと約束が上がる", up.status === 200);
  const old = await push(h, b, [put("shop", "c", 0, "c")]);
  check("約束より古い端末の書き込みは断る（426・今の約束を言う）", old.status === 426 && old.data.why === "old" && old.data.schema === 2, JSON.stringify(old.data));
  check("断った書き込みは当たっていない", !h.ctx.db.prepare("SELECT 1 AS x FROM rec WHERE item = ?").get(H("c")));
  const jump = await call(h, "POST", "/push", { token: a, body: { schema: 4, changes: [put("shop", "d", 0, "d")] } });
  check("約束を二つ飛ばしては上げられない", jump.status === 400 && jump.data.why === "schema");
  const rd = await call(h, "GET", "/pull?since=0", { token: b });
  check("古い端末も読むのは断らない（約束の版を知らせる）", rd.status === 200 && rd.data.schema === 2 && rd.data.items.length === 2);
}

/* ---------- 取る・知らせる ---------- */
{
  const { h, a, b } = await twoDevices();
  const ws = await call(h, "GET", "/ws", { headers: { upgrade: "websocket", "sec-websocket-protocol": `${PROTO}, ${b}` } });
  const sock = h.ctx.sockets[0];
  check("WebSocket は休眠の形で受ける（acceptWebSocket・端末の札）", ws.status === 101 && h.ctx.sockets.length === 1 && sock.tags.length === 1);
  check("Upgrade の無い /ws は 426", (await call(h, "GET", "/ws", { token: b })).status === 426);
  const wsBad = await call(h, "GET", "/ws", { headers: { upgrade: "websocket", "sec-websocket-protocol": `${PROTO}, ${"Z".repeat(43)}` } });
  check("知らない鍵の WebSocket は 401", wsBad.status === 401);

  await push(h, a, [put("shop", "a", 0, "a1"), put("shop", "b", 0, "b1")]);
  check("書けば開いている端末へ新しい番号だけを知らせる", sock.sent.length === 1 && sock.sent[0] === JSON.stringify({ head: 2 }), sock.sent.join("|"));
  await push(h, a, [put("shop", "a", 0, "again-stale")]);
  check("何も変わらなければ知らせない", sock.sent.length === 1);
  await push(h, a, [put("shop", "a", 1, "a2"), put("shop", "c", 0, "c1")]);

  const all = await call(h, "GET", "/pull?since=0", { token: b });
  check("番号0から取れば、一件につき今の版だけを番号順に", all.data.items.map((x) => x.seq).join() === "2,3,4"
    && all.data.items[1].body === b64("a2") && all.data.head === 4 && all.data.next === 4 && !all.data.more, JSON.stringify(all.data.items.map((x) => x.seq)));
  check("取ったものに部屋の名札", all.data.room && all.data.room === (await call(h, "GET", "/pull", { token: a })).data.room);
  const tail = await call(h, "GET", "/pull?since=3", { token: b });
  check("読んだ番号の続きだけ", tail.data.items.length === 1 && tail.data.items[0].seq === 4);
  const none = await call(h, "GET", "/pull?since=4", { token: b });
  check("続きが無ければ空", none.data.items.length === 0 && none.data.next === 4);
  const page = await call(h, "GET", "/pull?since=0&limit=2", { token: b });
  check("限りを付ければ分けて渡す（more・next）", page.data.items.length === 2 && page.data.more && page.data.next === 3);
  const ahead = await call(h, "GET", "/pull?since=99", { token: b });
  check("部屋より先の番号＝作り直された部屋（409 ahead）", ahead.status === 409 && ahead.data.why === "ahead" && ahead.data.head === 4);
  check("番号が数でなければ 400", (await call(h, "GET", "/pull?since=abc", { token: b })).status === 400);
  await push(h, a, [del("shop", "b", 1)]);
  const gone = await call(h, "GET", "/pull?since=4", { token: b });
  check("消した記録は印だけを渡す（中身は載せない）", gone.data.items[0].del === true && gone.data.items[0].body === undefined);

  h.wake();
  check("起き直しても番号と端末は残る（休眠から戻る）", (await call(h, "GET", "/pull?since=0", { token: b })).data.head === 5);
  await push(h, a, [put("shop", "d", 0, "d1")]);
  check("起き直したあとも、開いたままの WebSocket に知らせる", sock.sent[sock.sent.length - 1] === JSON.stringify({ head: 6 }));
  const msgs = sock.sent.join("");
  check("知らせに棚・記録・中身が載らない", !msgs.includes(H("shop")) && !msgs.includes(b64("d1")));
}

/* ---------- 履歴を間引く ---------- */
{
  const { h, a } = await twoDevices();
  const c = put("shop", "old", 0, "o1");
  await push(h, a, [c]);
  clock += LIMIT.keep + 1;
  await push(h, a, [put("shop", "new", 0, "n1")]);
  const log = h.ctx.db.prepare("SELECT COUNT(*) AS n FROM log").get().n;
  const rec = h.ctx.db.prepare("SELECT COUNT(*) AS n FROM rec").get().n;
  check("30日より古い履歴は間引く（今の中身は残す）", log === 1 && rec === 2, `${log}/${rec}`);
  const again = await push(h, a, [c]);
  check("30日たっても同じ操作は二度当てない（操作の覚えは60日）", again.data.results[0].again);
  clock += LIMIT.opsKeep;
}

/* ---------- 落ちても中身を漏らさない ---------- */
{
  const { h, a } = await twoDevices();
  const real = h.obj.core.sql;
  h.obj.core.sql = (q, ...b) => { if (/^INSERT INTO log/.test(q)) throw new Error("boom " + b.join()); return real(q, ...b); };
  const r = await push(h, a, [put("shop", "x", 0, "secret-body")]);
  check("落ちたら 500 で、理由も中身も返さない", r.status === 500 && JSON.stringify(r.data) === '{"why":"room"}', JSON.stringify(r.data));
  h.obj.core.sql = real;
  check("落ちた送りは途中まで当たらない（ひとまとまり）", !h.ctx.db.prepare("SELECT 1 AS x FROM rec WHERE item = ?").get(H("x"))
    && h.ctx.db.prepare("SELECT v FROM meta WHERE k = 'head'").get().v === "0");
}

/* ---------- 形の決まり（ファイルを読む） ---------- */
{
  const room = read("room.mjs"), wk = workerSrc, wr = read("wrangler.jsonc"), ign = read(".gitignore");
  const all = ["room.mjs", "worker.mjs", "wrangler.jsonc", ".dev.vars.example", "README.md"].map(read).join("\n");
  check("本文を書き出さない（console を使わない）", !/console\./.test(room) && !/console\./.test(wk));
  check("部屋のログを切ってある（observability: false）", /"observability":\s*\{\s*"enabled":\s*false\s*\}/.test(wr));
  check("SQLite の Durable Object（new_sqlite_classes）・binding は ROOM", /"new_sqlite_classes":\s*\["Room"\]/.test(wr) && /"name":\s*"ROOM"/.test(wr));
  check("中継所とは別の Worker（名前が kurashi-relay ではない）", /"name":\s*"kurashi-sync"/.test(wr));
  check("中継所の URL・鍵を持たない", !/RELAY_PATH|kurashi-relay\.|env\.MAIL/.test(room + wk));
  check("部屋の URL・鍵を書いていない（workers.dev は形の例だけ）",
    !/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i.test(all.replace(/kurashi-sync\.<[^>]+>\.workers\.dev/g, "")) && /^ROOM_SETUP=$/m.test(read(".dev.vars.example")));
  check("本物の合言葉のファイルはリポジトリに入れない", /^\.dev\.vars$/m.test(ign));
  check("中身は Cloudflare に寄せない（SQL と io だけ）", !/cloudflare:|WebSocketPair|acceptWebSocket|getWebSockets|ctx\.|env\./.test(room));
  check("つなぎに決まりを置かない（worker.mjs は短い）", wk.split("\n").length < 70);
  check("exec で BEGIN を使わない（transactionSync で）", !/["'`]\s*(BEGIN|COMMIT|ROLLBACK)/i.test(room + wk));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
