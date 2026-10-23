/* R26 の段1：元と写しへ書くときだけ、やることの既定値の欄を省く（2026年10月22日、
   docs/storage.md「R26 の案」。js/store.js の slimTodos）。

   全部の形（欄ごとの値の候補を一つずつ・混ぜたもの・崩れた値・正していない記憶）で見る：
     - 省いた欄は許す一覧（ALLOWED）だけ。店の一覧と同じ。id・題・作成日・並びは必ず残る
     - 詰めた元を読み直す（adoptRaw）と記憶と同じ。書き出しも同じ。Dropbox の指紋も同じ
     - 写しから戻す・「大きく減る前」の控えから戻すと同じ
     - 前の版（今の store.js から詰める一行だけ抜いた＝revert した版）で開いて同じ。前の版が
       書いた元を今の版で開いても同じ
   アプリのコードは触らない。 */
const fs = require("fs");
const path = require("path");
const { open, checker, URL, ROOT } = require("./lib");

const KEY = "kaimono-note-v2";
/* 省いてよい欄（js/store.js の slimDefaults と同じであること）。 */
const ALLOWED = [
  "due", "deadline", "repeat", "repeatDays", "repeatNth", "part", "time", "minutes", "lead", "shelf", "waitFor",
  "review", "slips", "editedAt", "notifiedFor", "memo", "flagged", "done", "doneAt", "archived", "archivedAt",
  "trace", "shop", "subs", "subState", "skipDays", "icon",
];
/* 前の版：詰める一行を抜いた store.js。 */
const SLIM_LINE = `    try { s = slimTodos(s); } catch (err) { console.error("live slim", err); }\n`;

(async () => {
  const t = checker("元へ書く形を詰める（R26 の段1）");
  const { browser, page, errors } = await open({ before: (c) => c.route(/dropbox(api)?\.com/, (r) => r.abort()) });
  const ready = async (p) => {
    await p.waitForFunction(() => window.KN && KN.store && KN.app && KN.liveIdb);
    await p.waitForTimeout(300);
    await p.evaluate(() => Promise.all([KN.liveIdb.ready(), KN.backup.checked(), KN.diaryIdb.ready()]));
  };
  await ready(page);

  /* 頁の中の道具：Dropbox と同じ並べ方（js/dropbox.js の canon）と指紋。 */
  const tools = () => {
    window.__canon = function canon(v) {
      if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canon(x))).join(",")}]`;
      if (v && typeof v === "object") {
        return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
      }
      return JSON.stringify(v);
    };
    window.__sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  await page.evaluate(tools);
  const canonNow = (p) => p.evaluate(() => __canon(KN.store.get()));

  t.check("店の許す一覧は、この台本の一覧と同じ",
    JSON.stringify(await page.evaluate(() => KN.store.slimKeys().sort())) === JSON.stringify(ALLOWED.slice().sort()),
    JSON.stringify(await page.evaluate(() => KN.store.slimKeys())));

  /* 全部の形を記録に入れる。欄ごとの値の候補（既定・既定でない・崩れた値）を一つずつと、混ぜたもの。 */
  const seeded = await page.evaluate(() => {
    const S = KN.store;
    S.reset();
    S.loadSample();
    const I = KN.iconsTodo.ICONS;
    const icon = Array.isArray(I) ? I[0].key : Object.keys(I)[0];
    const P = {
      due: [null, undefined, "2026-10-01", "2026-10-22T09:00:00Z", ""],
      deadline: [null, "2026-11-01", "bad"],
      repeat: [null, "daily", "weekly", "monthly", "yearly", "after", "nope"],
      repeatDays: [[], [1, 3], [7, "2"]],
      repeatNth: [null, { nth: 2, weekday: 2 }, { nth: 9, weekday: 1 }],
      repeatEvery: [null, undefined, 3, 999],
      part: [null, "dawn", "dusk", "morning"],
      time: [null, "07:30", "25:00"],
      minutes: [null, 30, 0, 1000],
      lead: [null, 15, -1],
      carried: [undefined, { on: "2026-10-20", time: "08:00" }, { on: "x" }],
      act: [undefined, { type: "reading", entry: "e1" }, { type: "zzz" }],
      kind: [undefined, "event", "x"],
      side: [undefined, "work"],
      endDay: [undefined, "2026-10-25"],
      repeatWeeks: [undefined, 2, 99],
      weekMark: [undefined, "2026-10-20"],
      gid: [undefined, "g-abc"],
      gbatch: [undefined, "b1"],
      shelf: [null, "wait", "someday", "x"],
      waitFor: [null, "返事", "   "],
      review: [null, "2026-10-30"],
      slips: [[], [{ on: "2026-10-01", from: "2026-09-30", time: null, how: "carry" }], [{ on: "x", how: "carry" }]],
      editedAt: [null, "2026-10-21T00:00:00.000Z", "bad"],
      notifiedFor: [null, "2026-10-22 07:30"],
      memo: ["", "試験のメモ", null],
      flagged: [false, true],
      done: [false, true],
      doneAt: [null, "2026-10-21", ""],
      archived: [false, true],
      archivedAt: [null, "2026-10-21"],
      trace: [false, true],
      shop: [false, true],
      subs: [[], [{ id: "s1", title: "手順", done: true, skipped: false }], [{ title: "" }]],
      subState: [{}, { "2026-10-22": { s1: "done" } }, { bad: 1 }],
      skipDays: [[], ["2026-10-21"], ["x"]],
      icon: [null, icon, "no-such-icon"],
      createdAt: ["2026-10-01", undefined],
      order: [0, 5, undefined],
    };
    const todos = [];
    let n = 0;
    const base = () => ({ id: "ts" + n, title: "試験の形" + n++, createdAt: "2026-10-01", order: n });
    for (const k of Object.keys(P)) for (const v of P[k]) todos.push({ ...base(), [k]: v });
    let r = 20261022;
    const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (let i = 0; i < 300; i++) {
      const x = base();
      for (const k of Object.keys(P)) if (rnd() < 0.4) x[k] = P[k][Math.floor(rnd() * P[k].length)];
      todos.push(x);
    }
    const s = JSON.parse(JSON.stringify(S.get()));
    s.todos = s.todos.concat(todos);
    S.adoptRaw(JSON.stringify(s));
    /* 崩れた組み合わせは二度目の読みでも変わる（毎朝・毎晩の fixBookend が日・くり返しを足し、
       日のあるものは待つ・いつかから外れる。詰める前からの性質）。読み直しても変わらない形まで
       読み直してから比べる。 */
    let turns = 0;
    for (let prev = ""; turns < 5 && prev !== JSON.stringify(S.get()); turns++) {
      prev = JSON.stringify(S.get());
      S.adoptRaw(prev);
    }
    S.saveNow();
    return { todos: S.get().todos.length, pools: P, icon, iconOk: !!KN.iconsTodo.byKey(icon), turns };
  });
  t.check("こと の絵の鍵が本物", seeded.iconOk, seeded.icon);
  t.check("記憶が読み直しても変わらない形に落ち着いた", seeded.turns < 5, String(seeded.turns));
  const lacking = ALLOWED.filter((k) => {
    const vs = seeded.pools[k] || [];
    return !(vs.some((v) => v == null || v === false || v === "" || (typeof v === "object" && !Object.keys(v).length))
      && vs.some((v) => v != null && v !== false && v !== "" && !(typeof v === "object" && !Object.keys(v).length)));
  });
  t.check("許す欄はどれも、既定と既定でない値の両方を試す", lacking.length === 0, lacking.join(", "));

  /* 1. 元の形。 */
  const shape = await page.evaluate((ALLOWED) => {
    const S = KN.store;
    S.flush();
    const raw = localStorage.getItem("kaimono-note-v2");
    const p = JSON.parse(raw);
    const mem = S.get().todos;
    const out = { raw: raw.length, full: JSON.stringify(Object.assign({}, S.get(), { lsSeq: 1 })).length,
      bad: [], must: 0, omitted: new Set(), same: p.todos.length === mem.length, lsSeqLast: /"lsSeq":\d+\}$/.test(raw) };
    p.todos.forEach((x, i) => {
      for (const k of Object.keys(mem[i])) {
        if (k in x) continue;
        out.omitted.add(k);
        if (!ALLOWED.includes(k)) out.bad.push(`${i}:${k}`);
      }
      if (!x.id || !x.title || !x.createdAt || typeof x.order !== "number") out.must++;
    });
    out.omitted = [...out.omitted];
    return out;
  }, ALLOWED);
  t.check(`全部の形が入った（${seeded.todos}件）`, seeded.todos > 400, String(seeded.todos));
  t.check("元のやることの数は記憶と同じ", shape.same);
  t.check("省いたのは許す欄だけ", shape.bad.length === 0, shape.bad.slice(0, 10).join(", "));
  t.check("許す欄はどれも、どこかで省かれた", ALLOWED.every((k) => shape.omitted.includes(k)),
    ALLOWED.filter((k) => !shape.omitted.includes(k)).join(", "));
  t.check("id・題・作成日・並びは必ず残る", shape.must === 0, String(shape.must));
  t.check(`元が詰まる（${shape.full} → ${shape.raw}字）`, shape.raw < shape.full * 0.9);
  t.check("元の終わりは書いた回数のまま", shape.lsSeqLast);

  /* 2. 読み直して同じ・書き出しも同じ・Dropbox の指紋も同じ。 */
  const mem0 = await canonNow(page);
  const r2 = await page.evaluate(async () => {
    const S = KN.store;
    const ex0 = S.exportJSON("2026-10-22T00:00:00.000Z");
    const sha0 = await __sha(__canon(S.get()));
    const ok = S.adoptRaw(localStorage.getItem("kaimono-note-v2"));
    return { ok, exSame: S.exportJSON("2026-10-22T00:00:00.000Z") === ex0, shaSame: (await __sha(__canon(S.get()))) === sha0,
      exFull: JSON.parse(ex0).todos.every((x) => "memo" in x && "done" in x && "subs" in x) };
  });
  t.check("詰めた元を読み直すと記憶と同じ", r2.ok && (await canonNow(page)) === mem0);
  t.check("書き出しは同じ", r2.exSame);
  t.check("書き出しは既定の欄も持つ（今のまま）", r2.exFull);
  t.check("Dropbox の指紋は同じ", r2.shaSame);

  /* 3. 正していない記憶（操作が足したまま、reconcile を通っていない値）でも、詰めて読むと詰めずに読むのと同じ。 */
  const r3 = await page.evaluate(() => {
    const S = KN.store;
    S.update((s) => {
      s.todos.push({ id: "raw1", title: "正していない1", createdAt: "2026-10-02", order: 900, repeat: "after", repeatEvery: null, memo: "" });
      s.todos.push({ id: "raw2", title: "正していない2", createdAt: "2026-10-02", order: 901, part: "dawn", due: null, done: false });
      s.todos.push({ id: "raw3", title: "正していない3", createdAt: "2026-10-02", order: 902, due: null, shelf: null, doneAt: "", subState: {} });
    });
    S.saveNow();
    const full = JSON.stringify(S.get());
    const slim = localStorage.getItem("kaimono-note-v2");
    S.adoptRaw(full);
    const a = __canon(S.get());
    S.adoptRaw(slim);
    return a === __canon(S.get());
  });
  t.check("正していない記憶も、詰めて読むと詰めずに読むのと同じ", r3);

  /* 4. 写しから戻すと同じ（元だけ消えた日）。 */
  const mem4 = await canonNow(page);
  const copySame = await page.evaluate(() => KN.liveIdb.flush().then(() => KN.idb.run(["meta"], "readonly", (tx) => {
    const r = tx.objectStore("meta").get("live");
    return () => (r.result ? r.result.v.json === localStorage.getItem("kaimono-note-v2") : false);
  })));
  t.check("写しにも詰めた形が届く", copySame);
  await page.goto(URL + "#away");
  await page.evaluate(() => KN.store.flush());
  await page.evaluate(() => KN.liveIdb.flush());
  await page.goto(URL.replace("index.html", "manifest.webmanifest"));
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await ready(page);
  await page.evaluate(tools);
  const did = await page.evaluate(() => (KN.liveIdb.journal().filter((e) => e.kind === "open").pop() || {}).did);
  t.check("元が消えた日は写しから戻る", did === "restored", String(did));
  t.check("写しから戻すと同じ", (await canonNow(page)) === mem4);

  /* 5. 「大きく減る前」の控え（詰めた元そのもの）から戻すと同じ。 */
  const mem5 = await canonNow(page);
  await page.evaluate(() => KN.store.update((s) => { s.todos = s.todos.slice(0, 3); }));
  await page.waitForTimeout(600);
  const r5 = await page.evaluate(async () => {
    const h = KN.backup.list().find((s) => s.reason === "大きく減る前");
    if (!h) return "控えが無い";
    await KN.backup.restore(h.at);
    KN.store.flush();
    return "ok";
  });
  t.check("「大きく減る前」の控えが取れた", r5 === "ok", r5);
  t.check("「大きく減る前」から戻すと同じ", (await canonNow(page)) === mem5);

  /* 6. 前の版で開いて同じ。前の版が書いた元を今の版で開いても同じ。 */
  const src = fs.readFileSync(path.join(ROOT, "js/store.js"), "utf8");
  t.check("前の版を作れる（詰める一行が一つだけ）", src.split(SLIM_LINE).length === 2);
  const oldSrc = src.replace(SLIM_LINE, "");
  const raws = await page.evaluate(() => {
    KN.store.flush();
    const slim = localStorage.getItem("kaimono-note-v2");
    return { slim, full: JSON.stringify(Object.assign({}, KN.store.get(), { lsSeq: JSON.parse(slim).lsSeq })) };
  });
  /* 新しい頁で元を置いて開く（開いたときの処理で記憶は動くので、同じ開き方どうしで比べる）。 */
  const openWith = async (raw, body) => {
    const o = await open({
      before: async (c) => {
        await c.route(/dropbox(api)?\.com/, (r) => r.abort());
        if (body) await c.route(/\/js\/store\.js(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body }));
        await c.addInitScript((raw) => {
          if (sessionStorage.getItem("__seeded")) return;
          sessionStorage.setItem("__seeded", "1");
          localStorage.setItem("kaimono-note-v2", raw);
        }, raw);
      },
    });
    await ready(o.page);
    await o.page.evaluate(tools);
    return o;
  };
  const nowSlim = await openWith(raws.slim);
  const cNowSlim = await canonNow(nowSlim.page);
  await nowSlim.browser.close();
  const oldFull = await openWith(raws.full, oldSrc);
  const cOldFull = await canonNow(oldFull.page);
  await oldFull.browser.close();
  const old = await openWith(raws.slim, oldSrc);
  const cOld = await canonNow(old.page);
  t.check("前の版で詰めた元を開くと、詰めない元を開くのと同じ", cOld === cOldFull);
  t.check("前の版で開いても、今の版で開くのと同じ", cOld === cNowSlim);
  const oldRaw = await old.page.evaluate(() => {
    KN.store.update((s) => { s.settings.__touch = 1; });
    KN.store.update((s) => { delete s.settings.__touch; });
    KN.store.saveNow();
    return localStorage.getItem("kaimono-note-v2");
  });
  const cOldNow = await old.page.evaluate((raw) => KN.store.adoptRaw(raw) && __canon(KN.store.get()), oldRaw);
  t.check("前の版は詰めずに書く（差し替えが効いている）",
    JSON.parse(oldRaw).todos.every((x) => "memo" in x && "done" in x && "subs" in x));
  t.check("前の版：エラーが出ない", old.errors.length === 0, old.errors.join("\n"));
  await old.browser.close();
  const back = await page.evaluate((raw) => KN.store.adoptRaw(raw), oldRaw);
  t.check("前の版が書いた元を今の版で読んで同じ", back && (await canonNow(page)) === cOldNow);

  t.check("エラーが出ない", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
