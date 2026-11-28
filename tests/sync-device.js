/* 3台の同期・端末の側（docs/sync.md 段2・js/sync.js）。門に入れる。

   偽の部屋：本物の sync/room.mjs を node:sqlite の上で動かし、page.route でつなぐ（外には出ない）。
   - 記録の欄はみな「送る／端末だけ」に分けてある（知らない欄があれば止まる＝新しい欄はどちらかへ書く）
   - 合言葉は端末が作る。鍵は Dropbox の sync-key.json へ一度だけ（二度目は上書きしない）
   - つないだだけでは最初の中身を送らない（訊く）。「送る」で全部が一件ずつ届く
   - 部屋に見えるのは暗号文とハッシュだけ（素の字・日付・設定・中継所の URL が無い）
   - 直すと版が上がる・消すは印・読み直しても送り直さない
   - 送る途中で切れても、同じ操作の番号で送り直して二度当てない
   - 消しすぎは止まって訊き、「送る」で sure つきで届く
   - 照らす：一日に一度、ずれ 0・一件を開いて読み比べる
   - 部屋の約束が上がった（古い版）→ 送るのを止め、歯車の点
   - 三方 merge3（段4）：欄ごとに変えたほう・両方なら部屋・消すと直すは直す
   - 取りこむ（段4の②）：既定は切る。開ければ控えを取って当て、送り返さない。紙のあいだは当てず 409 は待つ。
     無い品物を指す一件は持ち越す。多く変わるなら訊く
   段3・読む側（写しの端末が部屋から読む。二つ目の窓）：
   - 二台めの合言葉でつなぐ。出どころは切ったまま（Dropbox の写し）。入れれば部屋の中身（並びも同じ）
   - 知らせ（WebSocket）で続きだけ取る。紙を開いているあいだは当てず、閉じてから
   - 作り直された（ahead）・鍵が無い → Dropbox の写しへ黙って戻る。切れば元どおり
   - そのあいだ、端末の前からの記録（kaimono-note-v2）に触れない・印が無ければ部屋へ送らない
   - 書く（段4の③）：印を開ければ品の直しを部屋へ・409 は三方・切れば送り待ちを依頼に。iPhone の取りこみを切るときは訊く */
const path = require("path");
const { pathToFileURL } = require("url");
const { open, checker, fakeDropbox, ROOT } = require("./lib");

const HOST = "https://kurashi-sync.test.workers.dev";
const RELAY = "https://relay.example.workers.dev/kn-relay-secret";

async function fakeRoom() {
  const { DatabaseSync } = require("node:sqlite");
  const { Room } = await import(pathToFileURL(path.join(ROOT, "sync", "room.mjs")).href);
  const db = new DatabaseSync(":memory:");
  const core = new Room({
    sql: (q, ...b) => db.prepare(q).all(...b).map((r) => ({ ...r })),
    tx: (fn) => { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } },
    io: { list: () => [] },
  });
  return { db, core, rows: (q, ...b) => db.prepare(q).all(...b).map((r) => ({ ...r })) };
}

(async () => {
  const t = checker("同期・端末の側");
  const room = await fakeRoom();
  const calls = [];
  let cutNext = false;          // 次の push は部屋が受け取ったあとで切る
  let stopPush = false;         // push を部屋に届けない（写しの端末が送れないまま）
  const files = new Map(), uploads = [];
  const readerCalls = [];
  const roomRoute = (log) => async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    calls.push(`${req.method()} ${u.pathname}`);
    if (log) log.push(`${req.method()} ${u.pathname}${u.search}`);
    const headers = { ...req.headers() };
    delete headers["content-length"]; delete headers.host;
    if (stopPush && u.pathname === "/push") return route.abort("connectionrefused");
    const body = ["GET", "HEAD", "OPTIONS"].includes(req.method()) ? undefined : req.postData();
    if (body) calls.push(body);
    const res = await room.core.handle(new Request(req.url(), { method: req.method(), headers, body }));
    const text = await res.text();
    if (cutNext && u.pathname === "/push") { cutNext = false; return route.abort("connectionreset"); }
    return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: text });
  };

  const { browser, page } = await open({
    before: async (ctx) => {
      await fakeDropbox(ctx, files, uploads);
      await ctx.route(`${HOST}/**`, roomRoute(null));
      await ctx.addInitScript(() => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "k", refresh: "r", access: "a", expires: Date.now() + 864e5, sender: true }));
      });
    },
  });
  const tick = () => page.evaluate(() => KN.sync.now());
  const st = () => page.evaluate(() => KN.sync.status());

  /* ---- 記録を作る（無難な字だけ） ---- */
  await page.evaluate((relay) => {
    KN.store.loadSample();
    for (let i = 0; i < 15; i++) KN.store.addTodo({ title: `試験の用事${i}`, due: "2026-11-10" });
    KN.store.update((s) => {
      s.archive.days.push({ date: "2025-12-31", memo: "試験の日記の一" });
      s.archive.days.push({ date: "2026-11-01", memo: "試験の日記の二" });
      s.settings.healthRelayUrl = relay;
    });
    KN.store.saveNow();
  }, RELAY);
  /* 読み直して、欄の既定を埋めた形にしておく（埋まる分は一度だけ送り直しになる——害は無いが、下の数が揺れる）。 */
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.sync && KN.sync.status().phase === "on");

  const unknown = await page.evaluate(() => { KN.sync.shelvesOf(KN.store.get()); return KN.sync.unknown(); });
  t.check("記録の欄はみな「送る／端末だけ」に分けてある", !unknown.length, unknown.join(","));
  const shelves = await page.evaluate(() => [...KN.sync.shelvesOf(KN.store.get()).keys()]);
  t.check("設定は棚に無い・日記は年で分かれる", !shelves.some((s) => /settings/.test(s))
    && shelves.includes("archive.days:2025") && shelves.includes("archive.days:2026"), shelves.join(","));

  /* ---- 三方（段4） ---- */
  const m3 = await page.evaluate(() => {
    const m = KN.sync.merge3, j = (x) => JSON.stringify(x);
    const b = { id: "a", name: "牛乳", qty: 1, star: false, memo: "" };
    return [
      j(m(b, { ...b, qty: 2 }, { ...b, star: true })) === j({ id: "a", name: "牛乳", qty: 2, star: true, memo: "" }),
      m(b, { ...b, qty: 2 }, { ...b, qty: 3 }).qty === 3,
      m(b, { ...b, memo: "x" }, b).memo === "x" && m(b, b, { ...b, memo: "y" }).memo === "y",
      m(b, null, b) === null && m(b, b, null) === null && m(b, null, null) === null,
      m(b, null, { ...b, qty: 5 }).qty === 5 && m(b, { ...b, qty: 5 }, null).qty === 5,
      m(null, { id: "n", a: 1 }, null).a === 1 && m(null, null, { id: "n", b: 2 }).b === 2,
      j(m(null, { id: "n", a: 1, c: 1 }, { id: "n", b: 2, c: 2 })) === j({ id: "n", b: 2, c: 2, a: 1 }),
      !("memo" in m(b, { ...b, memo: undefined }, b)) && m(b, { ...b, memo: undefined }, { ...b, memo: "z" }).memo === "z",
      m(1, 2, 1) === 2 && m(1, 1, 3) === 3 && m(1, 2, 3) === 3,
      j(m(b, { ...b, tags: [1, 2] }, b).tags) === "[1,2]" && j(m({ t: [1] }, { t: [1, 2] }, { t: [0, 1] }).t) === "[0,1]",
    ];
  });
  t.check("三方：欄ごとに変えたほう・両方なら部屋・消すと直すは直す", m3.every(Boolean), JSON.stringify(m3));

  /* ---- 設定の紙（バックアップ → 同期の部屋） ---- */
  const topText = () => page.evaluate(() => {
    const ls = [...document.querySelectorAll("#screen-settings .set-layer")].filter((e) => e.getClientRects().length);
    return ls.length ? ls[ls.length - 1].textContent : "";
  });
  await page.click(".js-settings");
  await page.waitForTimeout(600);
  await page.evaluate(() => KN.settingsParts.go("syncing")); await page.waitForTimeout(600);
  t.check("同期の一枚に「同期の部屋」の行", (await topText()).includes("同期の部屋"));
  await page.evaluate(() => KN.settingsParts.go("sync")); await page.waitForTimeout(600);
  const paper = await topText();
  t.check("つなぐ前の紙：URL・合言葉をコピー・つなぐ", /部屋のURL/.test(paper) && /合言葉をコピー/.test(paper) && /つなぐ/.test(paper), paper.slice(0, 200));

  /* ---- つなぐ ---- */
  const code = await page.evaluate(() => KN.sync.setupCode());
  t.check("合言葉は端末が作る（20字以上）", typeof code === "string" && code.length >= 20);
  room.core.setup = code;
  const bad = await page.evaluate((h) => KN.sync.join(h, "ちがう合言葉ちがう合言葉ちがう合言葉").then(() => "ok", (e) => e.message), HOST);
  t.check("合言葉が違えばつながない", bad === "合言葉が合いません", bad);
  const joined = await page.evaluate(async (h) => { if (!KN.sync.status().joined) await KN.sync.join(h, await KN.sync.setupCode()); return KN.sync.status().joined; }, HOST);
  t.check("つながる", joined);
  await page.waitForFunction(() => KN.sync.status().lock);
  await tick();
  t.check("鍵を Dropbox へ置いた", files.has("/sync-key.json") && uploads.filter((p) => p === "/sync-key.json").length === 1, uploads.join(","));

  /* ---- 最初の中身は訊いてから ---- */
  let s = await st();
  t.check("つないだだけでは送らない（最初の中身を訊く）", s.ask && s.ask.kind === "first" && s.ask.n > 20
    && !calls.some((c) => c === "POST /push"), JSON.stringify(s.ask));
  t.check("紙に「最初の中身を置く」", /最初の中身を置く/.test(await topText()));
  await page.evaluate(() => KN.sync.go());
  await tick();
  s = await st();
  const n0 = await page.evaluate(() => { let n = 0; KN.sync.shelvesOf(KN.store.get()).forEach((m) => { n += m.size; }); return n; });
  const recs = room.rows("SELECT shelf, item, ver, del, body FROM rec");
  t.check("「送る」で全部が一件ずつ届く", !s.ask && s.out === 0 && recs.length === n0, `${recs.length}/${n0} out=${s.out}`);

  const all = JSON.stringify(room.rows("SELECT * FROM rec")) + JSON.stringify(room.rows("SELECT * FROM log"));
  const plain = ["試験の用事", "試験の日記", "2025-12-31", "2026-11", "kn-relay-secret", "relay.example", "settings", "todos", "archive"]
    .filter((w) => all.includes(w));
  t.check("部屋に素の字が無い（記録・日付・棚の名前・中継所の URL）", !plain.length, plain.join(","));
  const sent = calls.filter((c) => c.startsWith("{")).join("");
  t.check("送った字にも素の字が無い", !["試験の用事", "kn-relay-secret", "2025-12-31"].some((w) => sent.includes(w)));

  /* ---- 照らす ---- */
  s = await st();
  t.check("照らす：一日に一度、ずれ 0・一件を開いて合う", s.checks.length === 1 && s.checks[0].miss === 0
    && s.checks[0].extra === 0 && s.checks[0].body === true, JSON.stringify(s.checks));
  await tick();
  t.check("同じ日に二度は照らさない", (await st()).checks.length === 1);

  /* ---- 直す・消す ---- */
  const head0 = Number(room.rows("SELECT v FROM meta WHERE k='head'")[0].v);
  await page.evaluate(() => {
    const t0 = KN.store.get().todos.find((x) => x.title === "試験の用事0");
    KN.store.updateTodo(t0.id, { title: "試験の用事0を直した" });
  });
  await tick();
  const vers = room.rows("SELECT ver FROM rec WHERE ver > 1");
  t.check("直した一件だけが届き、版が上がる", vers.length === 1 && vers[0].ver === 2
    && Number(room.rows("SELECT v FROM meta WHERE k='head'")[0].v) === head0 + 1);

  /* ---- 送る途中で切れる ---- */
  cutNext = true;
  await page.evaluate(() => {
    const t1 = KN.store.get().todos.find((x) => x.title === "試験の用事1");
    KN.store.updateTodo(t1.id, { title: "試験の用事1を直した" });
  });
  await tick();
  t.check("切れたら送り待ちに残る", (await st()).out === 1);
  await tick();
  const v2 = room.rows("SELECT ver FROM rec WHERE ver > 1").map((r) => r.ver).sort();
  t.check("同じ操作の番号で送り直し、二度当てない", (await st()).out === 0 && JSON.stringify(v2) === "[2,2]", JSON.stringify(v2));

  /* ---- 読み直しても送り直さない ---- */
  const pushes = calls.filter((c) => c === "POST /push").length;
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.sync && KN.sync.status().lock);
  await tick();
  t.check("読み直しても前に合わせた中身を覚えている（送り直さない）", calls.filter((c) => c === "POST /push").length === pushes
    && (await st()).out === 0);

  /* ---- 消しすぎは訊く ---- */
  await page.evaluate(() => {
    const ids = KN.store.get().todos.filter((x) => /^試験の用事/.test(x.title)).slice(0, 12).map((x) => x.id);
    KN.store.update((st2) => { st2.todos = st2.todos.filter((x) => !ids.includes(x.id)); });
  });
  await tick();
  s = await st();
  t.check("消しすぎは止まって訊く（送らない）", s.ask && s.ask.kind === "many" && s.ask.n === 12
    && !room.rows("SELECT 1 FROM rec WHERE del = 1").length, JSON.stringify(s.ask));
  const dot = await page.waitForFunction(() => document.querySelector(".js-settings").dataset.dot === "sync", null, { timeout: 3000 })
    .then(() => "sync", () => page.evaluate(() => document.querySelector(".js-settings").dataset.dot));
  t.check("訊いているあいだは歯車の点", dot === "sync", dot);
  await page.evaluate(() => KN.sync.go());
  await tick();
  t.check("「送る」で消しが届く（印だけ・前の中身は残る）", room.rows("SELECT 1 FROM rec WHERE del = 1 AND body IS NOT NULL").length === 12
    && (await st()).out === 0);

  /* ---- 丸ごと入れ替えたら訊く ---- */
  const backup = await page.evaluate(() => KN.store.exportJSON());
  await page.evaluate(() => KN.store.addTodo({ title: "試験の入れ替え前の用事", due: "2026-11-12" }));
  await tick();
  const before = (await st()).out;
  await page.evaluate((text) => KN.store.importBackup(text), backup);
  await tick();
  s = await st();
  /* n：消えた一件と、入れ替えで並び（order）が詰め直された分。 */
  t.check("復元のあとは送る前に訊く", before === 0 && s.ask && s.ask.kind === "bulk" && s.ask.n >= 1, JSON.stringify(s.ask));
  await page.evaluate(() => KN.sync.go());
  await tick();
  t.check("「送る」で届く", !(await st()).ask && (await st()).out === 0);

  /* ---- 部屋から取りこむ（段4の②）。ほかの端末の代わりに、iPhone の鍵と札で部屋の品物を書く ---- */
  const other = (edits) => page.evaluate(async ([host, edits]) => {
    const m = await new Promise((ok) => { const q = indexedDB.open("kaimono-note-sync"); q.onsuccess = () => { const g = q.result.transaction("meta").objectStore("meta").getAll(); g.onsuccess = () => { q.result.close(); ok(Object.fromEntries(g.result.map((r) => [r.k, r.v]))); }; }; });
    const enc = new TextEncoder(), un = (x) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const b64 = (u) => btoa(String.fromCharCode(...u)), b64u = (u) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const ikm = await crypto.subtle.importKey("raw", un(m.key), "HKDF", false, ["deriveKey"]);
    const d = (info, alg, use) => crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("kurashi-sync"), info: enc.encode(info) }, ikm, alg, false, use);
    const body = await d("body", { name: "AES-GCM", length: 256 }, ["encrypt"]), name = await d("name", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]);
    const h = async (x) => b64u(new Uint8Array(await crypto.subtle.sign("HMAC", name, enc.encode(x))));
    const auth = { Authorization: `Bearer ${m.token}`, "Content-Type": "application/json" };
    const pulled = (await (await fetch(`${host}/pull?since=0&limit=1000`, { headers: auth })).json()).items;
    const changes = [];
    for (const [id, rec] of edits) {
      const sh = await h("s\nitems"), ih = await h("i\nitems\nid:" + id);
      const cur = pulled.filter((x) => x.shelf === sh && x.item === ih).pop();
      const c = { op: b64u(crypto.getRandomValues(new Uint8Array(12))), shelf: sh, item: ih, base: cur ? cur.ver : 0 };
      if (rec === null) c.del = true;
      else {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(sh + "." + ih) }, body, enc.encode(JSON.stringify({ s: "items", i: "id:" + id, d: rec }))));
        const o = new Uint8Array(13 + ct.length); o[0] = 1; o.set(iv, 1); o.set(ct, 13); c.body = b64(o);
      }
      changes.push(c);
    }
    const r = await fetch(`${host}/push`, { method: "POST", headers: auth, body: JSON.stringify({ schema: 1, changes }) });
    return (await r.json()).results.every((x) => x.ok);
  }, [HOST, edits]);
  const items = () => page.evaluate(() => KN.store.get().items.map((x) => ({ ...x })));
  const itemOf = async (id) => (await items()).find((x) => x.id === id);
  const memo = (id, text) => page.evaluate(([i, v]) => KN.store.update((s2) => { s2.items.find((x) => x.id === i).memo = v; }), [id, text]);
  const pushN = () => calls.filter((c) => c === "POST /push").length;
  const [A, B, C, D] = await items();
  const wrote = await other([[A.id, { ...A, qty: 9 }]]);
  await tick();
  t.check("既定は切る：ほかの端末の版を当てない", wrote && (await itemOf(A.id)).qty === A.qty && !(await st()).take.length);
  await page.evaluate(() => KN.sync.takeFrom(["items"]));
  const p0 = pushN();
  await tick();
  t.check("開ければ取りこむ・先に控え・送り返さない", (await itemOf(A.id)).qty === 9 && (await st()).out === 0 && pushN() === p0
    && await page.evaluate(() => KN.backup.list().some((x) => x.reason === "部屋からの取りこみ前")));
  await memo(A.id, "試験のメモ");
  await other([[A.id, { ...A, qty: 3 }]]);
  await tick();
  let a1 = await itemOf(A.id);
  t.check("三方：iPhone の直しと部屋の直しを欄ごとに合わせて送る", a1.qty === 3 && a1.memo === "試験のメモ" && (await st()).out === 0, JSON.stringify(a1));

  /* 紙を開いているあいだは当てない。そのあいだの送りの 409 は上書きせず、閉じて取りこんでから。 */
  await page.evaluate(() => KN.ui.sheet({ title: "試験の紙", as: "dialog", content: document.createElement("div") }));
  await page.waitForFunction(() => KN.ui.sheetsOpen() > 0, null, { timeout: 3000 }).catch(() => {});
  await other([[B.id, { ...B, qty: 4 }]]);
  await memo(B.id, "紙のあいだのメモ");
  await tick();
  const b1 = await itemOf(B.id), w1 = (await st()).out;
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !KN.ui.sheetsOpen(), null, { timeout: 3000 }).catch(() => {});
  await tick();
  const b2 = await itemOf(B.id);
  t.check("紙のあいだは当てず、409 は待って、閉じてから合わせる", b1.qty === B.qty && w1 === 1 && b2.qty === 4 && b2.memo === "紙のあいだのメモ"
    && (await st()).out === 0, JSON.stringify([b1.qty, w1, b2]));

  /* 消すと直すは直すが勝つ。無い品物を指す一件は持ち越す。 */
  await memo(D.id, "残すメモ");
  const nai = { id: "t-nai", productId: "p-nai", qty: 1, memo: "", checked: false, fav: false, addedAt: "2026-11-28" };
  await other([[C.id, null], [D.id, null], [nai.id, nai]]);
  await tick();
  const its = await items();
  t.check("部屋で消した一件は消え、iPhone で直した一件は残る", !its.some((x) => x.id === C.id) && its.some((x) => x.id === D.id && x.memo === "残すメモ")
    && (await st()).out === 0);
  t.check("無い品物を指す一件は持ち越す", !its.some((x) => x.id === nai.id) && (await st()).held === 1);
  await page.evaluate(() => KN.store.update((s2) => { s2.products.push({ id: "p-nai", name: "試験の品物", categoryId: s2.categories[0].id, order: null, amount: null, unit: "", note: "", prices: [] }); }));
  await tick();
  t.check("品物が来れば次の回に当てる", !!(await itemOf(nai.id)) && (await st()).held === 0);

  /* 多く変わるなら訊く。 */
  await other(Array.from({ length: 25 }, (_, i) => [`t-m${i}`, { ...nai, id: `t-m${i}`, productId: A.productId }]));
  await tick();
  s = await st();
  t.check("多く変わるなら止めて訊く（当てない・送らない）", s.ask && s.ask.kind === "room" && s.ask.n === 25 && !(await itemOf("t-m0")), JSON.stringify(s.ask));
  await page.evaluate(() => KN.sync.go());
  await tick();
  t.check("「取りこむ」で当たる", !(await st()).ask && (await items()).filter((x) => /^t-m/.test(x.id)).length === 25 && (await st()).out === 0);

  /* ---- 読む側（段3）：写しの端末（二つ目の窓） ---- */
  const LATEST = "/kurashi-latest.json";
  await page.evaluate(() => KN.store.addTodo({ title: "試験の読む用事", due: "2026-11-12" }));
  await tick();
  const latest = await page.evaluate(() => KN.store.exportJSON());
  files.set(LATEST, latest);
  const pc = await page.evaluate(() => KN.sync.pair());
  t.check("二台めの合言葉を出せる（つないだ端末で）", typeof pc === "string" && pc.length === 10, String(pc));
  const sockets = [];
  const R = await open({
    viewport: { width: 1280, height: 860 },
    before: async (ctx) => {
      await fakeDropbox(ctx, files, uploads);
      await ctx.route(`${HOST}/**`, roomRoute(readerCalls));
      await ctx.routeWebSocket(/\/ws$/, (ws) => { sockets.push(ws); ws.onMessage((m) => { if (m === "ping") ws.send("pong"); }); });
      await ctx.addInitScript(() => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "k", refresh: "r", access: "a", expires: Date.now() + 864e5 }));
      });
    },
  });
  const rp = R.page;
  /* 端末の前からの記録（写しにしても触れずに残る）。 */
  await rp.evaluate(() => { KN.store.addTodo({ title: "この端末の前からの用事", due: "2026-11-09" }); KN.store.saveNow(); });
  const own = await rp.evaluate(() => localStorage.getItem("kaimono-note-v2"));
  await rp.evaluate(() => localStorage.setItem("kn-replica", JSON.stringify({ on: true })));
  await rp.reload();
  await rp.waitForFunction(() => window.KN && KN.replica && KN.replica.on() && KN.store.get().todos.some((x) => x.title === "試験の読む用事")
    && KN.sync && KN.sync.status().phase === "on");
  const rs = () => rp.evaluate(() => KN.sync.status());
  t.check("写しの端末は読む側（送らない）", (await rs()).reader && !(await rs()).joined);
  const jr = await rp.evaluate(([h, c]) => KN.sync.join(h, c).then(() => "ok", (e) => e.message), [HOST, pc]);
  t.check("二台めの合言葉でつなぐ", jr === "ok" && (await rs()).joined, jr);
  await rp.waitForTimeout(300);
  t.check("つないでも出どころは切ったまま（部屋を読まない）", !readerCalls.some((c) => c.startsWith("GET /pull"))
    && !(await rp.evaluate(() => KN.replica.from().room)), readerCalls.join(","));

  /* iPhone が直す（Dropbox の控えはまだ前のまま）。 */
  await page.evaluate(() => {
    const t2 = KN.store.get().todos.find((x) => x.title === "試験の読む用事");
    KN.store.updateTodo(t2.id, { title: "試験の読む用事を部屋で" });
  });
  await tick();
  files.set(LATEST, latest);
  /* 字の形をそろえて比べる（欄の順は reconcile が変える）。 */
  const view = (pg) => pg.evaluate(() => {
    const c = (v) => (v && typeof v === "object" ? (Array.isArray(v) ? "[" + v.map(c).join(",") + "]"
      : "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + c(v[k])).join(",") + "}") : JSON.stringify(v));
    const out = [];
    KN.sync.shelvesOf(KN.store.get()).forEach((m, sh) => m.forEach((v, k) => out.push(sh + "|" + k + "|" + c(v))));
    return { all: out.sort().join("\n"), todos: KN.store.get().todos.map((x) => x.id).join(","), items: KN.store.get().items.map((x) => x.id).join(",") };
  });
  await rp.evaluate(() => KN.replica.setFrom(true));
  const a = await view(page), b = await view(rp);
  t.check("入れると部屋から取る（Dropbox にまだ無い直しが見える）", await rp.evaluate(() => KN.replica.from().room
    && KN.store.get().todos.some((x) => x.title === "試験の読む用事を部屋で")));
  t.check("部屋から見せた中身は iPhone の記録と同じ（並びも）", a.all === b.all && a.todos === b.todos && a.items === b.items,
    a.all === b.all ? "並び" : "中身");
  t.check("写しのあいだ、前からの記録に触れない", own === await rp.evaluate(() => localStorage.getItem("kaimono-note-v2")));

  /* 知らせで続きだけ取る。 */
  await rp.waitForFunction(() => true);
  const seq0 = (await rs()).seq;
  t.check("開いているあいだは知らせを受ける（WebSocket）", sockets.length >= 1, String(sockets.length));
  await page.evaluate(() => KN.store.addTodo({ title: "試験の知らせの用事", due: "2026-11-13" }));
  await tick();
  const head1 = Number(room.rows("SELECT v FROM meta WHERE k='head'")[0].v);
  sockets[sockets.length - 1].send(JSON.stringify({ head: head1 }));
  await rp.waitForFunction(() => KN.store.get().todos.some((x) => x.title === "試験の知らせの用事"), null, { timeout: 5000 }).catch(() => {});
  const lastPull = readerCalls.filter((c) => c.startsWith("GET /pull")).pop() || "";
  t.check("知らせで続きだけ取る（読んだ番号の続き）", await rp.evaluate(() => KN.store.get().todos.some((x) => x.title === "試験の知らせの用事"))
    && lastPull.includes(`since=${seq0}&`) && seq0 > 0 && (await rs()).seq === head1, `${lastPull} seq0=${seq0}`);

  /* 紙を開いているあいだは当てない。 */
  await rp.evaluate(() => KN.app.showScreen("todo"));
  await rp.waitForTimeout(300);
  await rp.evaluate(() => { KN.deskInbox.addTodo(); });
  await rp.waitForFunction(() => KN.ui.sheetsOpen() > 0, null, { timeout: 3000 }).catch(() => {});
  const sheet = await rp.evaluate(() => KN.ui.sheetsOpen());
  await page.evaluate(() => KN.store.addTodo({ title: "試験の紙のあいだの用事", due: "2026-11-14" }));
  await tick();
  sockets[sockets.length - 1].send(JSON.stringify({ head: head1 + 50 }));
  await rp.waitForTimeout(1200);
  const during = await rp.evaluate(() => KN.store.get().todos.some((x) => x.title === "試験の紙のあいだの用事"));
  await rp.keyboard.press("Escape");
  await rp.waitForFunction(() => !KN.ui.sheetsOpen(), null, { timeout: 3000 }).catch(() => {});
  const after = await rp.waitForFunction(() => KN.store.get().todos.some((x) => x.title === "試験の紙のあいだの用事"), null, { timeout: 20000 })
    .then(() => true, () => false);
  t.check("紙を開いているあいだは当てず、閉じてから当てる", sheet > 0 && !during && after, `sheet=${sheet} during=${during} after=${after}`);

  /* 作り直された部屋（ahead）→ Dropbox の写しへ黙って戻り、次は頭から読む。 */
  await rp.evaluate(() => new Promise((ok) => {
    const q = indexedDB.open("kaimono-note-sync");
    q.onsuccess = () => { const tx = q.result.transaction("meta", "readwrite"); tx.objectStore("meta").put({ k: "seq", v: 999999 }); tx.oncomplete = () => { q.result.close(); ok(); }; };
  }));
  await rp.evaluate(() => KN.replica.room());
  t.check("作り直された部屋（ahead）は Dropbox の写しへ黙って戻る", await rp.evaluate(() => !KN.replica.from().room
    && KN.store.get().todos.some((x) => x.title === "試験の読む用事") && !KN.store.get().todos.some((x) => x.title === "試験の読む用事を部屋で")
    && document.querySelector(".js-settings").dataset.dot !== "sync"));
  await rp.evaluate(() => KN.replica.room());
  t.check("次は頭から読み直して部屋へ", await rp.evaluate(() => KN.replica.from().room
    && KN.store.get().todos.some((x) => x.title === "試験の紙のあいだの用事")));

  /* 鍵が無い → 黙って戻る。 */
  const key = files.get("/sync-key.json");
  files.delete("/sync-key.json");
  await rp.evaluate(() => new Promise((ok) => {
    const q = indexedDB.open("kaimono-note-sync");
    q.onsuccess = () => { const tx = q.result.transaction("meta", "readwrite"); tx.objectStore("meta").delete("key"); tx.oncomplete = () => { q.result.close(); ok(); }; };
  }));
  await rp.reload();
  await rp.waitForFunction(() => window.KN && KN.sync && KN.sync.status().phase === "on" && KN.store.get().todos.length > 0);
  await rp.waitForTimeout(800);
  t.check("鍵が無ければ Dropbox の写しのまま（点も出さない）", await rp.evaluate(() => KN.replica.from().want && !KN.replica.from().room
    && !KN.store.get().todos.some((x) => x.title === "試験の読む用事を部屋で") && document.querySelector(".js-settings").dataset.dot !== "sync"));
  files.set("/sync-key.json", key);
  await rp.evaluate(() => KN.replica.room());
  t.check("鍵が戻れば部屋から", await rp.evaluate(() => KN.replica.from().room));

  /* ---- 書く（段4の③）：写しの端末が items を部屋へ。iPhone は取りこむを開けたまま ---- */
  const isPush = (c) => /^POST \/push/.test(c);
  t.check("読む側は印が無ければ部屋へ送らない", !readerCalls.some(isPush));
  const rItem = (id) => rp.evaluate((i) => KN.store.get().items.find((x) => x.id === i), id);
  const rSet = (id, k, v) => rp.evaluate(([i, kk, vv]) => KN.store.update((s2) => { s2.items.find((x) => x.id === i)[kk] = vv; }), [id, k, v]);
  const rNow = () => rp.evaluate(() => KN.sync.now());
  await rp.evaluate(() => KN.sync.writeTo(["items"]));
  await rSet(A.id, "qty", 7);
  const shown7 = (await rItem(A.id)).qty === 7;
  await rNow();
  await tick();
  t.check("印を開ければ品の直しは部屋へ（すぐ重ねて見せ、iPhone が取りこむ）", shown7 && readerCalls.some(isPush) && (await rs()).out === 0
    && (await itemOf(A.id)).qty === 7, JSON.stringify([shown7, (await rs()).out, (await itemOf(A.id)).qty]));
  await memo(A.id, "iPhone のメモ");
  await tick();
  await rSet(A.id, "fav", !A.fav);
  await rNow();
  await tick();
  await rp.evaluate(() => KN.replica.room());
  const a2 = await itemOf(A.id), r2 = await rItem(A.id);
  t.check("409 は部屋の版と三方で送り直す（両方の直しが残る）", [a2, r2].every((x) => x.memo === "iPhone のメモ" && x.fav === !A.fav && x.qty === 7)
    && (await rs()).out === 0, JSON.stringify([a2, r2]));
  stopPush = true;
  await rSet(B.id, "memo", "写しのメモ");
  await rNow();
  const out1 = (await rs()).out, off = await rp.evaluate(() => KN.sync.writeTo([]));
  const held = await rp.evaluate(() => JSON.parse(localStorage.getItem("kn-desk-held") || "[]"));
  stopPush = false;
  t.check("印を切れば送り待ちを依頼に作り直す（見え方はそのまま）", out1 === 1 && off === true && (await rs()).out === 0
    && held.some((h) => h.o.kind === "shop" && h.o.shop.ops.some((op) => op.id === B.id && op.set && op.set.memo === "写しのメモ"))
    && (await rItem(B.id)).memo === "写しのメモ", JSON.stringify([out1, off, held.length]));

  /* 設定の紙：Dropbox の紙に畳んだ入口 → 同期の部屋に「部屋から読む」。 */
  await rp.click(".js-settings");
  await rp.waitForTimeout(600);
  await rp.evaluate(() => KN.settingsParts.go("dropbox")); await rp.waitForTimeout(500);
  const dp = await rp.evaluate(() => { const d = [...document.querySelectorAll("#screen-settings details.set-more")].find((e) => /同期の部屋/.test(e.textContent)); return d ? !d.open : null; });
  t.check("写しの端末の Dropbox の紙に、畳んだ「同期の部屋」", dp === true, String(dp));
  await rp.evaluate(() => KN.settingsParts.go("sync")); await rp.waitForTimeout(500);
  const rpaper = await rp.evaluate(() => { const ls = [...document.querySelectorAll("#screen-settings .set-layer")].filter((e) => e.getClientRects().length); return ls.length ? ls[ls.length - 1].textContent : ""; });
  t.check("同期の部屋に「部屋から読む」「買うものを部屋へ書く」", /部屋から読む/.test(rpaper) && /買うものを部屋へ書く/.test(rpaper) && !/送り待ち|照らした/.test(rpaper), rpaper.slice(0, 160));

  /* 切れば元どおり。 */
  await rp.evaluate(() => KN.replica.setFrom(false));
  t.check("出どころを切れば Dropbox の写しへ", await rp.evaluate(() => !KN.replica.from().room
    && !KN.store.get().todos.some((x) => x.title === "試験の読む用事を部屋で")));
  await rp.evaluate(() => KN.replica.disable());
  await rp.waitForFunction(() => window.KN && KN.replica && !KN.replica.on() && KN.store.get().todos.length > 0, null, { timeout: 8000 });
  t.check("写しを切れば、前からの記録のまま", own === await rp.evaluate(() => localStorage.getItem("kaimono-note-v2"))
    && await rp.evaluate(() => KN.store.get().todos.some((x) => x.title === "この端末の前からの用事")));
  t.check("読む側の頁にエラーが無い", !R.errors || !R.errors.length, (R.errors || []).join(" / ").slice(0, 300));
  await R.browser.close();

  /* iPhone：「買うものを部屋から取りこむ」を切るときは訊く。 */
  if (await page.evaluate(() => KN.app.activeScreen() !== "settings")) { await page.click(".js-settings"); await page.waitForTimeout(600); }
  await page.evaluate(() => KN.settingsParts.go("sync")); await page.waitForTimeout(500);
  const tk = await topText();
  await page.locator("#screen-settings button.is-sw", { hasText: "買うものを部屋から取りこむ" }).last().click();
  await page.waitForSelector(".js-ok", { timeout: 4000 }).catch(() => {});
  const asked = await page.locator(".js-ok").count();
  await page.locator(".js-ok").last().click().catch(() => {});
  await page.waitForTimeout(300);
  t.check("iPhone の紙に「買うものを部屋から取りこむ」・切るときは訊く", /買うものを部屋から取りこむ/.test(tk) && asked > 0 && !(await st()).take.length, tk.slice(0, 160));

  /* ---- 古い版 ---- */
  room.db.prepare("UPDATE meta SET v = '9' WHERE k = 'schema'").run();
  await page.evaluate(() => KN.store.addTodo({ title: "試験の新しい用事", due: "2026-11-11" }));
  await tick();
  s = await st();
  t.check("部屋の約束が上なら送るのを止める（古い版）", s.trouble === "old" && s.out >= 1, JSON.stringify(s));

  /* ---- 切る ---- */
  await page.evaluate(() => KN.sync.leave());
  s = await st();
  t.check("切ると部屋の覚えを忘れる（鍵は残す）", !s.joined && s.out === 0 && s.live === 0
    && await page.evaluate(() => new Promise((r) => { const q = indexedDB.open("kaimono-note-sync"); q.onsuccess = () => { const g = q.result.transaction("meta").objectStore("meta").get("key"); g.onsuccess = () => r(!!g.result); }; })));

  await browser.close();
  t.done();
})().catch((e) => { console.log("  NG  台本が落ちた\n      " + (e && e.stack || e)); process.exitCode = 1; });
