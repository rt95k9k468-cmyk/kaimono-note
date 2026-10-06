/* 記録の写し（js/live-idb.js、docs/storage.md の「記録の写し」、2026年10月6日）。

   - 開くと元（localStorage）の一本が写し（IndexedDB meta "live"）へ入る。書くたびに追う。
   - localStorage だけを丸ごと消して開く → 訊かずに写しから戻る（閉じる直前の一字まで）。
     印（lost）は立たず、Dropbox も見合わせない。開いた記録に "restored"。
   - 元の保存が落ちていた（写しのほうが番号が大きい）→ 写しが勝つ。戻す前の記憶は
     控え「写しから戻す前」へ。
   - 元に番号が無い（直に書いた）→ 元が勝つ（写しへ）。
   - 一度に大きく減る保存 → 減る前の元が控え「大きく減る前」に。すべて削除では取らない
     （「削除前」がある）。
   - 使っているうちに元が消えた → 次の保存で元が戻り、開いた記録に "vanished"。
     そこで読み直し（引っぱって更新）をしても、空を読み込まない。
   Dropbox への通信は全部止めてある。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/live-idb.js */
const { open, checker, URL } = require("./lib");

const KEY = "kaimono-note-v2";

(async () => {
  const t = checker("live-idb");
  const { browser, page, errors } = await open({
    before: async (c) => {
      await c.route(/dropbox(api)?\.com/, (r) => r.abort());
      await c.addInitScript(() => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        const d = "2026-10-06";
        localStorage.setItem("kaimono-note-v2", JSON.stringify({
          schema: 2,
          todos: Array.from({ length: 30 }, (_, i) => ({ id: "t" + i, title: "試験のやること" + i, due: d, done: false, archived: false, createdAt: d, order: i })),
        }));
        localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "試験の鍵", refresh: "試験の更新札" }));
      });
    },
  });

  const ready = async () => {
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.liveIdb);
    await page.waitForTimeout(300);
    await page.evaluate(() => Promise.all([KN.liveIdb.ready(), KN.backup.checked(), KN.diaryIdb.ready()]));
  };
  const copy = () => page.evaluate(() => KN.liveIdb.flush().then(() => KN.idb.run(["meta"], "readonly", (t) => {
    const r = t.objectStore("meta").get("live");
    return () => (r.result ? r.result.v : null);
  })));
  const lsRaw = () => page.evaluate((K) => localStorage.getItem(K), KEY);
  const todos = () => page.evaluate(() => KN.store.get().todos.length);
  const reasons = () => page.evaluate(() => KN.backup.list().map((s) => s.reason));
  const lastOpen = () => page.evaluate(() => KN.liveIdb.journal().filter((e) => e.kind === "open").pop() || null);
  const lostDialog = () => page.locator(".sheet-title, [class*=title]").filter({ hasText: "記録が見当たりません" });
  /* 別の頁へ離れてから、localStorage だけを消して戻る（大きな保存場所は残る）。 */
  const wipeLs = async () => {
    await page.goto(URL + "#away");
    await page.evaluate(() => KN.store.flush());
    await page.evaluate(() => KN.liveIdb.flush());
    await page.goto(URL.replace("index.html", "manifest.webmanifest"));
    await page.evaluate(() => localStorage.clear());
    await page.goto(URL);
    await ready();
  };

  /* 1. 開くと写しができ、書くたびに追う。 */
  await ready();
  let v = await copy();
  t.check("開くと写しができる", !!(v && v.json), JSON.stringify(v && { seq: v.seq }));
  await page.evaluate(() => KN.store.addTodo({ title: "閉じる直前に足したやること" }));
  await page.waitForTimeout(300);
  v = await copy();
  const raw1 = await lsRaw();
  t.check("書くたびに写しが元と同じ中身になる", v && v.json === raw1, `copy ${v && v.json.length} / ls ${raw1 && raw1.length}`);
  t.check("写しの番号は元の番号", v && v.seq === JSON.parse(raw1).lsSeq, `${v && v.seq} / ${JSON.parse(raw1).lsSeq}`);

  /* 2. localStorage だけが消えた → 訊かずに写しから戻る。 */
  await wipeLs();
  const s2 = await page.evaluate(async () => ({
    todos: KN.store.get().todos.length,
    last: KN.store.get().todos.some((x) => x.title === "閉じる直前に足したやること"),
    lost: KN.backup.lost(),
    sent: await KN.dropbox.sync(),
    dbx: KN.dropbox.status().connected,
  }));
  t.check("消えても写しから戻る（31件）", s2.todos === 31, `todos=${s2.todos}`);
  t.check("閉じる直前の一件まで戻る", s2.last);
  t.check("印は立たない", s2.lost === null);
  t.check("訊かない", (await lostDialog().count()) === 0);
  t.check("Dropbox は見合わせない", s2.sent !== "held", s2.sent);
  t.check("Dropbox の設定も戻る", s2.dbx);
  t.check("元にも書き戻る", JSON.parse((await lsRaw()) || "{}").todos.length === 31);
  t.check("開いた記録に restored", ((await lastOpen()) || {}).did === "restored", JSON.stringify(await lastOpen()));

  /* 3. 元の保存が落ちていた（写しが新しい）→ 写しが勝つ。 */
  await page.evaluate((K) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, val) {
      if (k === K) throw new DOMException("試験：いっぱい", "QuotaExceededError");
      return set.call(this, k, val);
    };
    KN.store.addTodo({ title: "元に書けなかったやること" });
  }, KEY);
  await page.waitForTimeout(400);
  const v3 = await copy();
  t.check("元が書けなくても写しには届く", v3.json.includes("元に書けなかったやること"));
  await page.reload();
  await ready();
  t.check("写しが新しい：写しが勝つ（32件）", (await todos()) === 32, `todos=${await todos()}`);
  t.check("写しが新しい：元にも書き戻る", ((await lsRaw()) || "").includes("元に書けなかったやること"));
  t.check("戻す前の記憶は控え「写しから戻す前」に", (await reasons()).includes("写しから戻す前"), JSON.stringify(await reasons()));
  t.check("開いた記録に older", ((await lastOpen()) || {}).did === "older");

  /* 4. 元に番号が無い（直に書いた）→ 元が勝つ。 */
  await page.evaluate((K) => {
    KN.store.flush();
    const p = JSON.parse(localStorage.getItem(K));
    delete p.lsSeq;
    p.todos = p.todos.slice(0, 31);
    localStorage.setItem(K, JSON.stringify(p));
  }, KEY);
  await page.reload();
  await ready();
  t.check("元に番号が無い：元が勝つ（31件）", (await todos()) === 31, `todos=${await todos()}`);
  const v4 = await copy();
  t.check("元に番号が無い：写しは元に合わせる", JSON.parse(v4.json).todos.length === 31);

  /* 5. 一度に大きく減る → 減る前が控えに。 */
  const before5 = (await reasons()).filter((r) => r === "大きく減る前").length;
  await page.evaluate(() => KN.store.update((s) => { s.todos = s.todos.slice(0, 3); }));
  await page.waitForTimeout(600);
  const after5 = (await reasons()).filter((r) => r === "大きく減る前").length;
  t.check("一度に大きく減ると「大きく減る前」の控え", after5 === before5 + 1, `${before5} → ${after5}`);
  const kept = await page.evaluate(async () => {
    const h = KN.backup.list().find((s) => s.reason === "大きく減る前");
    return h && h.summary ? h.summary.todos : null;
  });
  t.check("「大きく減る前」には減る前の数", kept === 31, `todos=${kept}`);
  await page.evaluate(() => KN.store.update((s) => { s.todos.pop(); }));
  await page.waitForTimeout(400);
  t.check("一つ消すだけでは取らない", (await reasons()).filter((r) => r === "大きく減る前").length === after5);

  /* 6. 使っているうちに元が消えた → 次の保存で戻る。読み直しでも空を読まない。 */
  await page.evaluate((K) => localStorage.removeItem(K), KEY);
  await page.evaluate(() => KN.store.reload());
  await page.waitForTimeout(400);
  t.check("消えたあとの読み直しで空を読まない", (await todos()) === 2, `todos=${await todos()}`);
  t.check("消えたあとの読み直しで元が戻る", JSON.parse((await lsRaw()) || "{}").todos.length === 2);
  await page.evaluate((K) => localStorage.removeItem(K), KEY);
  await page.evaluate(() => KN.store.addTodo({ title: "消えたあとに足したやること" }));
  await page.waitForTimeout(400);
  t.check("消えたあとの保存で元が戻る", JSON.parse((await lsRaw()) || "{}").todos.length === 3);
  const kinds = await page.evaluate(() => KN.liveIdb.journal().map((e) => e.kind));
  t.check("開いた記録に vanished", kinds.filter((k) => k === "vanished").length >= 2, JSON.stringify(kinds));

  /* 7. すべて削除は「大きく減る前」を取らない（「削除前」がある）。写しも空に合わせる。 */
  const before7 = (await reasons()).filter((r) => r === "大きく減る前").length;
  await page.evaluate(() => KN.store.reset());
  await page.waitForTimeout(500);
  t.check("すべて削除では「大きく減る前」を取らない", (await reasons()).filter((r) => r === "大きく減る前").length === before7);
  const v7 = await copy();
  t.check("すべて削除は写しも空に", JSON.parse(v7.json).todos.length === 0);

  t.check("開いた記録をコピーの字にできる", (await page.evaluate(() => KN.liveIdb.journalText())).includes("\"kind\":\"open\""));
  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
