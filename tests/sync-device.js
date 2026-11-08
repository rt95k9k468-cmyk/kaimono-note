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
   段3・読む側（写しの端末が部屋から読む。二つ目の窓）：
   - 二台めの合言葉でつなぐ。出どころは切ったまま（Dropbox の写し）。入れれば部屋の中身（並びも同じ）
   - 知らせ（WebSocket）で続きだけ取る。紙を開いているあいだは当てず、閉じてから
   - 作り直された（ahead）・鍵が無い → Dropbox の写しへ黙って戻る。切れば元どおり
   - そのあいだ、端末の前からの記録（kaimono-note-v2）に触れない・部屋へ送らない */
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
  const files = new Map(), uploads = [];
  const readerCalls = [];
  const roomRoute = (log) => async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    calls.push(`${req.method()} ${u.pathname}`);
    if (log) log.push(`${req.method()} ${u.pathname}${u.search}`);
    const headers = { ...req.headers() };
    delete headers["content-length"]; delete headers.host;
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

  /* ---- 設定の紙（バックアップ → 同期の部屋） ---- */
  const topText = () => page.evaluate(() => {
    const ls = [...document.querySelectorAll("#screen-settings .set-layer")].filter((e) => e.getClientRects().length);
    return ls.length ? ls[ls.length - 1].textContent : "";
  });
  await page.click(".js-settings");
  await page.waitForTimeout(600);
  await page.evaluate(() => KN.settingsParts.go("data")); await page.waitForTimeout(600);
  t.check("バックアップに「同期の部屋」の行", (await topText()).includes("同期の部屋"));
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

  /* 設定の紙：Dropbox の紙に畳んだ入口 → 同期の部屋に「部屋から読む」。 */
  await rp.click(".js-settings");
  await rp.waitForTimeout(600);
  await rp.evaluate(() => KN.settingsParts.go("dropbox")); await rp.waitForTimeout(500);
  const dp = await rp.evaluate(() => { const d = [...document.querySelectorAll("#screen-settings details.set-more")].find((e) => /同期の部屋/.test(e.textContent)); return d ? !d.open : null; });
  t.check("写しの端末の Dropbox の紙に、畳んだ「同期の部屋」", dp === true, String(dp));
  await rp.evaluate(() => KN.settingsParts.go("sync")); await rp.waitForTimeout(500);
  const rpaper = await rp.evaluate(() => { const ls = [...document.querySelectorAll("#screen-settings .set-layer")].filter((e) => e.getClientRects().length); return ls.length ? ls[ls.length - 1].textContent : ""; });
  t.check("同期の部屋に「部屋から読む」", /部屋から読む/.test(rpaper) && !/送り待ち|照らした/.test(rpaper), rpaper.slice(0, 160));

  /* 切れば元どおり。 */
  await rp.evaluate(() => KN.replica.setFrom(false));
  t.check("出どころを切れば Dropbox の写しへ", await rp.evaluate(() => !KN.replica.from().room
    && !KN.store.get().todos.some((x) => x.title === "試験の読む用事を部屋で")));
  t.check("読む側は部屋へ送らない・控えを置かない", !readerCalls.some((c) => /^POST \/push/.test(c))
   );
  await rp.evaluate(() => KN.replica.disable());
  await rp.waitForFunction(() => window.KN && KN.replica && !KN.replica.on() && KN.store.get().todos.length > 0, null, { timeout: 8000 });
  t.check("写しを切れば、前からの記録のまま", own === await rp.evaluate(() => localStorage.getItem("kaimono-note-v2"))
    && await rp.evaluate(() => KN.store.get().todos.some((x) => x.title === "この端末の前からの用事")));
  t.check("読む側の頁にエラーが無い", !R.errors || !R.errors.length, (R.errors || []).join(" / ").slice(0, 300));
  await R.browser.close();

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
