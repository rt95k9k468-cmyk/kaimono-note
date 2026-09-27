/* 閉じていても鳴る通知（D1）。js/bell.js・sw.js の push・中継所とのやりとり。

   - 中継所へ出るのは**時刻（数）だけ**。題もメモも、どの要求の本文にも無い。
   - 古い中継所（鳴らす役が無い）には、鍵を頼む本文なしの POST しか送らない。
   - 端末の写し（IndexedDB kaimono-note-bell）には題がある。
   - 中身なしの押しで、写しから「19:30 題」の形で出す。鳴らした回はアプリが
     受け取り、もう一度は鳴らさない。写しに無ければ「やることの時刻です」。
   - 切ると、中継所の列も端末の押し先も片づく。

   中継所には繋がない（`relay.invalid` を page.route で受ける）。
   この台本だけは Service Worker を**止めずに**開く（押しを届けるため）。
   押し先はブラウザの試験では作れない（押しの取り次ぎが無い）ので、
   pushManager を偽物にして、押しそのものは CDP の deliverPushMessage で届ける。 */
const { chromium } = require("playwright");
const { checker, ensureServer, URL: APP } = require("./lib");

const FAKE = "https://relay.invalid/kn-testonlypath0000";
/* 本物の形をした公開の鍵（P-256 の生の65バイトを base64url）。 */
const KEY = "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

(async () => {
  const t = checker("bell");
  await ensureServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const origin = new URL(APP).origin;
  await ctx.grantPermissions(["notifications"], { origin });

  /* 押し先の偽物。subscribe は鍵を覚え、unsubscribe は数える。 */
  await ctx.addInitScript(() => {
    if (!window.PushManager) return;
    let sub = null;
    window.__unsubs = 0;
    const make = (key) => ({
      endpoint: "https://push.invalid/abc",
      options: window.__noOptions ? undefined : { applicationServerKey: key.buffer || key },
      toJSON() { return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: "p", auth: "a" } }; },
      unsubscribe() { window.__unsubs++; sub = null; return Promise.resolve(true); },
    });
    PushManager.prototype.getSubscription = function () { return Promise.resolve(sub); };
    PushManager.prototype.subscribe = function (o) { sub = make(o.applicationServerKey); return Promise.resolve(sub); };
  });

  /* 中継所のふり。old を立てると、鳴らす役を持たない古い中継所になる。 */
  const sent = [];
  let old = false;
  await ctx.route("https://relay.invalid/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const bell = u.searchParams.get("bell");
    sent.push({ method: req.method(), bell, body: req.postData() || "" });
    const head = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Kn-Ver, X-Kn-Bell" };
    if (old) {
      if (req.method() === "POST" && !(req.postData() || "").trim()) return route.fulfill({ status: 400, headers: head, body: "空です" });
      return route.fulfill({ status: 204, headers: head, body: "" });
    }
    if (bell === "key") return route.fulfill({ status: 200, headers: { ...head, "X-Kn-Bell": "1" }, body: KEY });
    if (bell) return route.fulfill({ status: 200, headers: { ...head, "X-Kn-Bell": "1" }, body: "ok" });
    return route.fulfill({ status: 204, headers: { ...head, "X-Kn-Ver": "0" }, body: "" });
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(APP);
  /* 初めての文脈では Service Worker が入れ替わって一度読み直す。それを待つ。 */
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.bell);
  await page.waitForTimeout(300);

  t.check("この試験のブラウザに PushManager がある", await page.evaluate(() => KN.bell.supported()));

  /* 中継所・お知らせが揃うまで、行は出ない。 */
  t.check("中継所が無ければ出さない", !(await page.evaluate(() => KN.bell.available())));
  await page.evaluate((u) => KN.store.update((s) => {
    s.settings.healthRelayUrl = u;
    s.settings.dietAutoSync = false;    // 健康の見張りを走らせない
    s.settings.todoNotify = true;
  }), FAKE);
  t.check("中継所とお知らせが揃うと出せる", await page.evaluate(() => KN.bell.available()));
  t.check("既定はオフ", !(await page.evaluate(() => KN.bell.active())));

  /* やることを四つ。時刻のある一回・毎日・時刻なし・済ませたもの。 */
  const ids = await page.evaluate(() => {
    const U = KN.util;
    const d = new Date(Date.now() + 90 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const soon = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const day = U.dayKey(d);
    const a = KN.store.addTodo({ title: "秘密の用事A", due: day, time: soon, memo: "メモは出さない" });
    const b = KN.store.addTodo({ title: "毎日の用事B", due: U.todayKey(), time: "12:00", repeat: "daily" });
    const c = KN.store.addTodo({ title: "時刻なしC", due: U.todayKey() });
    const e = KN.store.addTodo({ title: "済みE", due: day, time: soon });
    KN.store.toggleTodo(e.id);
    return { a: a.id, b: b.id, c: c.id, e: e.id };
  });

  const plan = await page.evaluate(() => KN.bell.plan());
  const now = Date.now();
  t.check("写しの列は時刻の早い順・過ぎた時刻は無い",
    plan.every((x, i) => x.at > now - 5000 && (i === 0 || plan[i - 1].at <= x.at)));
  t.check("一回きりの用事が一つ", plan.filter((x) => x.id === ids.a).length === 1);
  const bs = plan.filter((x) => x.id === ids.b);
  t.check("毎日の用事は7日先まで開く（7か8）", bs.length === 7 || bs.length === 8, String(bs.length));
  t.check("回は「日付 時刻」", bs.every((x) => /^\d{4}-\d{2}-\d{2} 12:00$/.test(x.occ)));
  t.check("時刻なし・済んだものは入らない", !plan.some((x) => x.id === ids.c || x.id === ids.e));

  /* 古い中継所。鍵を頼む本文なしの POST だけで止まる。 */
  old = true;
  sent.length = 0;
  const r0 = await page.evaluate(() => KN.bell.start());
  t.check("古い中継所なら入らない（理由は old）", !r0.ok && r0.reason === "old", JSON.stringify(r0));
  t.check("古い中継所には本文つきの要求を送らない",
    sent.every((x) => x.method === "POST" && x.body === ""), JSON.stringify(sent));
  t.check("入らなかったら設定は戻る", !(await page.evaluate(() => KN.store.get().settings.todoBell)));

  /* 新しい中継所。 */
  old = false;
  sent.length = 0;
  const r1 = await page.evaluate(() => KN.bell.start());
  t.check("入れると通る", r1.ok, JSON.stringify(r1));
  t.check("設定に残る", await page.evaluate(() => KN.store.get().settings.todoBell === true));
  const kinds = sent.map((x) => x.bell).join(",");
  t.check("鍵 → 押し先 → 時刻の順", kinds === "key,sub,times", kinds);
  t.check("どれも POST", sent.every((x) => x.method === "POST"));
  const times = JSON.parse((sent.find((x) => x.bell === "times") || {}).body || "null");
  t.check("時刻の列は数だけ", Array.isArray(times) && times.length === plan.length && times.every(Number.isFinite),
    JSON.stringify(times));
  t.check("中継所へ題もメモも出ていない",
    !sent.some((x) => /秘密|毎日の用事|メモは出さない|用事/.test(x.body)), JSON.stringify(sent.map((x) => x.body)));
  const sub = JSON.parse((sent.find((x) => x.bell === "sub") || {}).body || "{}");
  t.check("押し先は pushManager のもの", sub.endpoint === "https://push.invalid/abc");

  /* 端末の写し。 */
  const readDb = () => page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open("kaimono-note-bell", 1);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["plan", "rung"], "readonly");
      const p = tx.objectStore("plan").get("list");
      const r = tx.objectStore("rung").getAll();
      tx.oncomplete = () => { db.close(); ok({ list: (p.result && p.result.list) || [], rung: r.result }); };
    };
  }));
  const db1 = await readDb();
  t.check("端末の写しに題がある", db1.list.some((x) => x.title === "秘密の用事A"));
  t.check("写しにメモは置かない", !JSON.stringify(db1.list).includes("メモは出さない"));

  /* 変わらなければ送らない。題だけ変えても中継所へは何も行かない。 */
  sent.length = 0;
  await page.evaluate((id) => KN.store.updateTodo(id, { title: "秘密の用事A2" }), ids.a);
  await page.waitForTimeout(3600);
  t.check("題だけ変えても、中継所へは送らない", sent.length === 0, JSON.stringify(sent));
  t.check("写しの題は書き直される", (await readDb()).list.some((x) => x.title === "秘密の用事A2"));
  await page.evaluate((id) => KN.store.removeTodo(id), ids.b);
  await page.waitForTimeout(3600);
  const kinds2 = sent.map((x) => x.bell).join(",");
  t.check("時刻が変われば送り直す（押し先は送り直さない）", kinds2 === "key,times", kinds2);

  /* 押しを届ける。CDP で登録の番号を取る。 */
  const cdp = await ctx.newCDPSession(page);
  const regId = await new Promise(async (ok) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
      const r = e.registrations.find((x) => !x.isDeleted && x.scopeURL.startsWith(origin));
      if (r) ok(r.registrationId);
    });
    await cdp.send("ServiceWorker.enable");
  });
  /* 頭のないブラウザは出した通知を一覧に残さないので、Service Worker の中で
     showNotification に渡したものを控える。 */
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  await sw.evaluate(() => {
    self.__shown = [];
    const reg = self.registration;
    const real = reg.showNotification.bind(reg);
    reg.showNotification = (title, opts) => {
      self.__shown.push({ title, body: opts.body, tag: opts.tag, renotify: opts.renotify });
      return real(title, opts).catch(() => {});
    };
  });
  const push = async () => {
    await sw.evaluate(() => { self.__shown.length = 0; });
    await cdp.send("ServiceWorker.deliverPushMessage", { origin, registrationId: regId, data: "" });
    await page.waitForTimeout(800);
    return sw.evaluate(() => self.__shown.slice());
  };

  /* 用事Aを「いまの分」に動かし、その回を写しに置いてから押す（中継所は
     分の頭に、その分の時刻を押す）。ページの側の tick() が先に鳴らさない
     よう、お知らせの印だけ下ろしておく（bell の設定はそのまま）。 */
  const occA = await page.evaluate(async (id) => {
    KN.store.update((s) => { s.settings.todoNotify = false; });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const day = KN.util.dayKey(d);
    KN.store.updateTodo(id, { due: day, time });
    d.setSeconds(0, 0);
    const row = { at: d.getTime(), time, title: KN.store.getTodo(id).title, id, occ: `${day} ${time}` };
    await new Promise((ok) => {
      const req = indexedDB.open("kaimono-note-bell", 1);
      req.onsuccess = () => {
        const tx = req.result.transaction(["plan"], "readwrite");
        tx.objectStore("plan").put({ k: "list", list: [row] });
        tx.oncomplete = () => { req.result.close(); ok(); };
      };
    });
    return row.occ;
  }, ids.a);
  const n1 = await push();
  const hitA = n1.find((n) => n.tag === "kn-todo-time");
  t.check("押されたら写しの題で出る（19:30 題 の形）",
    !!hitA && hitA.title === `${occA.slice(11)} 秘密の用事A2`, JSON.stringify(n1));
  const again = await push();
  t.check("同じ回をもう一度押されても、同じ札を静かに出し直すだけ",
    again.length === 1 && again[0].title === hitA.title && again[0].renotify === false, JSON.stringify(again));
  const db2 = await readDb();
  t.check("鳴らした回を写しの側に残す", db2.rung.some((r) => r.id === ids.a && r.occ === occA), JSON.stringify(db2.rung));

  const absorbed = await page.evaluate(() => KN.bell.absorb());
  const nf = await page.evaluate((id) => KN.store.getTodo(id).notifiedFor, ids.a);
  t.check("開いたら「もう言った」へ（二度鳴らさない）", absorbed === 1 && nf === occA, `${absorbed} ${nf}`);
  t.check("もう言った回は写しの列から外れる",
    !(await page.evaluate((id) => KN.bell.plan().some((x) => x.id === id), ids.a)));
  await page.evaluate(() => KN.store.update((s) => { s.settings.todoNotify = true; }));

  /* 写しに無い時刻の押し。 */
  await page.evaluate(() => new Promise((ok) => {
    const req = indexedDB.open("kaimono-note-bell", 1);
    req.onsuccess = () => {
      const tx = req.result.transaction(["plan"], "readwrite");
      tx.objectStore("plan").put({ k: "list", list: [] });
      tx.oncomplete = () => { req.result.close(); ok(); };
    };
  }));
  const n2 = await push();
  t.check("写しに無ければ「やることの時刻です」",
    n2.some((n) => n.title === "やることの時刻です"), JSON.stringify(n2));

  /* 切る。 */
  sent.length = 0;
  await page.evaluate(() => KN.bell.stop());
  t.check("切ると中継所へ off（本文なし）", sent.length === 1 && sent[0].bell === "off" && sent[0].body === "",
    JSON.stringify(sent));
  t.check("切ると設定もオフ", !(await page.evaluate(() => KN.store.get().settings.todoBell)));
  t.check("切ると端末の押し先も外す", (await page.evaluate(() => window.__unsubs)) >= 1);

  /* お知らせを切ると、一緒に止まる。 */
  await page.evaluate(() => KN.bell.start());
  sent.length = 0;
  await page.evaluate(() => KN.notify.disable());
  await page.waitForTimeout(300);
  t.check("時刻のお知らせを切ると、閉じていても鳴るのも止まる",
    sent.some((x) => x.bell === "off") && !(await page.evaluate(() => KN.store.get().settings.todoBell)));

  /* 設定の行。お知らせを戻して、やることの設定を開く。 */
  await page.evaluate(() => KN.store.update((s) => { s.settings.todoNotify = true; }));
  // 設定の中身は歯車を押した画面で決まる（やることから開くと tasks の設定）
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(400);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  const rowText = await page.locator(".set-layer:last-child").innerText();
  t.check("設定に「閉じていても鳴らす」", rowText.includes("閉じていても鳴らす"), rowText.slice(0, 300));

  /* 押し先が自分の鍵を答えない端末。開くたびに作り直さないこと。 */
  await page.evaluate(() => { window.__noOptions = true; });
  await page.evaluate(() => KN.bell.start());
  const u0 = await page.evaluate(() => window.__unsubs);
  sent.length = 0;
  await page.evaluate(() => KN.bell.sync({ force: true }));
  t.check("鍵を答えない押し先でも、同じ鍵なら作り直さない",
    (await page.evaluate(() => window.__unsubs)) === u0 && !sent.some((x) => x.bell === "sub"),
    JSON.stringify(sent.map((x) => x.bell)));

  t.check("頁の誤りが無い", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
