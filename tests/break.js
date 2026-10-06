/* 壊し方の試験（docs/storage.md の「立て直しの計画」B5、2026年10月6日）。
   置き場を一つずつ壊して開き直し、記録とノートが黙って戻るか・何も失わないかを一本で見る。

   1. localStorage だけ消える      → 写しから訊かずに戻る（閉じる直前まで）。設定に「記録の写し：…の状態」（B1）
   2. 大きな保存場所だけ消える    → 記録はそのまま、写しは作り直す、印も点検の行も出ない
   3. ノートの入れ物だけ消える    → 控えにノートが入っている（B3）→ 設定の頭に一行（B4）→ 押すと合わせて戻る
   4. 元が写しより大きく少ない    → 設定の頭に一行（B4）→ 控えへ戻すと消える
   5. 容量（元に書けない）        → 写しには届き、開き直すと写しが勝つ
   6. 二つの画面                  → 互いの書いたものが残り、消えても最後の一件まで戻る
   7. 書く途中で閉じる            → 元に入ったものは残り、写しが追いつく
   8. 両方消える（新しい端末と同じ）→ 空で始まり、訊かない・Dropbox に空を送らない
   Dropbox への通信は全部止めてある。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/break.js */
const { open, checker, URL } = require("./lib");

const KEY = "kaimono-note-v2";
const AWAY = URL.replace("index.html", "manifest.webmanifest");

(async () => {
  const t = checker("壊し方");
  let dbxCalls = 0;
  const { browser, ctx, page, errors } = await open({
    before: async (c) => {
      await c.route(/dropbox(api)?\.com/, (r) => { dbxCalls++; return r.abort(); });
      await c.addInitScript(() => {
        if (sessionStorage.getItem("__seeded") || localStorage.getItem("kaimono-note-v2")) return;
        sessionStorage.setItem("__seeded", "1");
        const d = "2026-10-06";
        localStorage.setItem("kaimono-note-v2", JSON.stringify({
          schema: 2,
          todos: Array.from({ length: 30 }, (_, i) => ({ id: "t" + i, title: "試験のやること" + i, due: d, done: false, archived: false, createdAt: d, order: i })),
        }));
      });
    },
  });

  const ready = async (p = page) => {
    await p.waitForFunction(() => window.KN && KN.store && KN.app && KN.liveIdb && KN.notes);
    await p.waitForTimeout(300);
    await p.evaluate(() => Promise.all([KN.liveIdb.ready(), KN.backup.checked(), KN.diaryIdb.ready(), KN.notes.ready()]));
  };
  const titles = (p = page) => p.evaluate(() => KN.store.get().todos.map((x) => x.title));
  const lsRaw = () => page.evaluate((K) => localStorage.getItem(K), KEY);
  const copy = () => page.evaluate(() => KN.liveIdb.flush().then(() => KN.idb.run(["meta"], "readonly", (t) => {
    const r = t.objectStore("meta").get("live");
    return () => (r.result ? r.result.v : null);
  })));
  const lastOpen = () => page.evaluate(() => KN.liveIdb.journal().filter((e) => e.kind === "open").pop() || null);
  /* 書きかけを全部書き切ってから、アプリの外（同じ置き場の別の頁）へ出て fn を走らせ、開き直す。 */
  const reopenAfter = async (fn, arg) => {
    await page.evaluate(() => Promise.all([KN.store.flush(), KN.liveIdb.flush(), KN.notes.flush()]));
    await page.evaluate(() => KN.notes.ready());
    await page.goto(AWAY);
    if (fn) await page.evaluate(fn, arg);
    await page.goto(URL);
    await ready();
  };
  const dropDb = (name) => new Promise((res) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = () => res();
    setTimeout(res, 3000);
  });
  const settingsRoot = async () => {
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForTimeout(500);
    return page.locator(".set-layer:last-child").innerText();
  };
  const leaveSettings = () => page.evaluate(() => KN.app.showScreen("todo"));

  await ready();

  /* 1. localStorage だけ消える */
  await page.evaluate(() => KN.store.addTodo({ title: "1 閉じる直前のやること" }));
  await page.waitForTimeout(300);
  await reopenAfter(() => localStorage.clear());
  let tt = await titles();
  t.check("1 localStorage だけ消える：写しから戻る（閉じる直前の一件まで）", tt.length === 31 && tt.includes("1 閉じる直前のやること"), `todos=${tt.length}`);
  t.check("1 印も立たず訊かない", (await page.evaluate(() => KN.backup.lost())) === null);
  t.check("1 開いた記録に restored", ((await lastOpen()) || {}).did === "restored");
  await settingsRoot();
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップ" }).first().click();
  await page.waitForTimeout(400);
  const dataText = await page.locator(".set-layer:last-child").innerText();
  t.check("1 設定のバックアップに「記録の写し：…の状態」（B1）", /記録の写し：\d+月\d+日 \d+:\d\dの状態/.test(dataText), dataText.slice(0, 200));
  await leaveSettings();

  /* 2. 大きな保存場所だけ消える */
  await page.evaluate(() => KN.store.addTodo({ title: "2 大きな保存場所が消える前" }));
  await page.waitForTimeout(300);
  await reopenAfter(dropDb, "kaimono-note");
  tt = await titles();
  t.check("2 大きな保存場所だけ消える：記録はそのまま", tt.length === 32 && tt.includes("2 大きな保存場所が消える前"), `todos=${tt.length}`);
  const v2 = await copy();
  t.check("2 写しは作り直される（元と同じ）", !!v2 && v2.json === (await lsRaw()));
  t.check("2 開いた記録に first", ((await lastOpen()) || {}).did === "first");
  t.check("2 印も点検の行も出ない", (await page.evaluate(() => [KN.backup.lost(), KN.backup.doubt()])).every((x) => x === null));

  /* 3. ノートの入れ物だけ消える（B3・B4） */
  const nid = await page.evaluate(() => {
    const n = KN.notes.draft();
    n.title = "試験のノート";
    n.body = "消えても戻る本文";
    KN.notes.put(n);
    return n.id;
  });
  await page.evaluate(() => KN.notes.flush());
  const took = await page.evaluate(() => KN.backup.take("試験"));
  const head = await page.evaluate(() => KN.backup.list()[0]);
  const body = await page.evaluate(() => KN.idb.run(["snapBodies"], "readonly", (t) => {
    const r = t.objectStore("snapBodies").getAll();
    return () => r.result.pop();
  }));
  t.check("3 控えにノートが入る（nb・大きさにノートのぶんも）", took === "taken" && head.nb === 1
    && !!body && head.size === body.payload.length + String(body.notes).length, JSON.stringify(head));
  t.check("3 控えの中身の隣に noteBook（記録の形は変えない）",
    !!body && typeof body.notes === "string" && JSON.parse(body.notes).notes.some((n) => n.id === nid) && !JSON.parse(body.payload).noteBook);
  t.check("3 同じなら取らない", (await page.evaluate(() => KN.backup.take("試験"))) === "same");
  await page.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { body: "消えても戻る本文。書き足し" }); }, nid);
  await page.evaluate(() => KN.notes.flush());
  t.check("3 ノートだけ変わっても取る", (await page.evaluate(() => KN.backup.take("試験"))) === "taken");
  await reopenAfter(dropDb, "kaimono-note-notes");
  t.check("3 ノートの入れ物が消えた", (await page.evaluate(() => KN.notes.list().length)) === 0);
  await page.waitForFunction(() => KN.backup.doubt() && KN.backup.doubt().notes, null, { timeout: 5000 }).catch(() => {});
  const root3 = await settingsRoot();
  t.check("3 設定の頭に「ノートが控えより少なくなっています」（B4）", root3.includes("ノートが控えより少なくなっています"), root3.slice(0, 120));
  await page.locator(".set-layer:last-child .set-row", { hasText: "ノートが控えより少なくなっています" }).first().click();
  await page.waitForSelector(".js-ok", { timeout: 4000 });
  await page.locator(".js-ok").last().click();
  await page.waitForTimeout(600);
  const back = await page.evaluate((id) => KN.notes.get(id), nid);
  t.check("3 押すと控えのノートが戻る（書き足した版）", !!back && back.body === "消えても戻る本文。書き足し", JSON.stringify(back));
  t.check("3 戻ったら行は消える", !(await page.locator(".set-layer:last-child").innerText()).includes("ノートが控えより少なく"));
  await leaveSettings();

  /* 4. 元が写しより大きく少ない（古い版が空に近い元を書いた、など） */
  await reopenAfter((K) => {
    const p = JSON.parse(localStorage.getItem(K));
    delete p.lsSeq;   // 番号の無い元は元が勝つ
    p.todos = p.todos.slice(0, 5);
    localStorage.setItem(K, JSON.stringify(p));
  }, KEY);
  t.check("4 元が勝つ（5件）", (await titles()).length === 5);
  await page.waitForFunction(() => KN.backup.doubt() && KN.backup.doubt().record, null, { timeout: 5000 }).catch(() => {});
  const root4 = await settingsRoot();
  t.check("4 設定の頭に「記録が控えより少なくなっています」（B4）", root4.includes("記録が控えより少なくなっています"), root4.slice(0, 120));
  const doubtLog = await page.evaluate(() => KN.liveIdb.journal().some((e) => e.kind === "doubt"));
  t.check("4 開いた記録に doubt", doubtLog);
  await leaveSettings();
  /* 写しの中身は控えにある（同じ中身がいちばん新しい控えにあれば、それ。無ければ「写しを置き換える前」）。 */
  const keepAt = await page.evaluate(() => (KN.backup.list().find((s) => s.summary.todos === 32) || {}).at);
  t.check("4 写しの中身は控えにある", !!keepAt);
  await page.evaluate((at) => KN.backup.restore(at).then(() => KN.store.flush()), keepAt);
  await page.waitForTimeout(300);
  t.check("4 戻すと 32件・行は消える", (await titles()).length === 32 && (await page.evaluate(() => KN.backup.doubt())) === null);

  /* 5. 容量（元に書けない） */
  await page.evaluate((K) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, val) {
      if (k === K) throw new DOMException("試験：いっぱい", "QuotaExceededError");
      return set.call(this, k, val);
    };
    KN.store.addTodo({ title: "5 元に書けなかったやること" });
  }, KEY);
  await page.waitForTimeout(400);
  t.check("5 保存の失敗を知っている", await page.evaluate(() => !!KN.store.saveError()));
  t.check("5 写しには届く", ((await copy()) || { json: "" }).json.includes("5 元に書けなかったやること"));
  await page.goto(AWAY);
  await page.goto(URL);
  await ready();
  tt = await titles();
  t.check("5 開き直すと写しが勝つ（33件）", tt.length === 33 && tt.includes("5 元に書けなかったやること"), `todos=${tt.length}`);
  t.check("5 元にも書き戻る", ((await lsRaw()) || "").includes("5 元に書けなかったやること"));
  t.check("5 開いた記録に older", ((await lastOpen()) || {}).did === "older");

  /* 6. 二つの画面 */
  const page2 = await ctx.newPage();
  page2.on("pageerror", (e) => errors.push("2枚目: " + String(e)));
  await page2.goto(URL);
  await ready(page2);
  await page.evaluate(() => KN.store.addTodo({ title: "6 一枚目で足した" }));
  await page.waitForTimeout(400);
  await page2.waitForTimeout(800);
  await ready(page2);
  t.check("6 二枚目に一枚目の一件が出る", (await titles(page2)).includes("6 一枚目で足した"));
  await page2.evaluate(() => KN.store.addTodo({ title: "6 二枚目で足した" }));
  await page2.waitForTimeout(400);
  await page.waitForTimeout(800);
  await ready();
  tt = await titles();
  t.check("6 一枚目に両方が残る", tt.includes("6 一枚目で足した") && tt.includes("6 二枚目で足した"), `todos=${tt.length}`);
  await page2.evaluate(() => Promise.all([KN.store.flush(), KN.liveIdb.flush()]));
  await page2.close();
  await reopenAfter(() => localStorage.clear());
  tt = await titles();
  t.check("6 そのあと localStorage が消えても、両方戻る", tt.includes("6 一枚目で足した") && tt.includes("6 二枚目で足した"), `todos=${tt.length}`);

  /* 7. 書く途中で閉じる（写しへ書く前に、頁ごと閉じる） */
  await page.evaluate(() => {
    KN.store.addTodo({ title: "7 閉じる直前その一" });
    KN.store.addTodo({ title: "7 閉じる直前その二" });
  });
  await page.waitForTimeout(200);
  const page3 = await ctx.newPage();
  page3.on("pageerror", (e) => errors.push("3枚目: " + String(e)));
  await page.close();
  await page3.goto(URL);
  await ready(page3);
  tt = await titles(page3);
  t.check("7 閉じても両方残る", tt.includes("7 閉じる直前その一") && tt.includes("7 閉じる直前その二"), `todos=${tt.length}`);
  const caught = await page3.evaluate((K) => KN.liveIdb.flush().then(() => KN.idb.run(["meta"], "readonly", (t) => {
    const r = t.objectStore("meta").get("live");
    return () => r.result && r.result.v.json === localStorage.getItem(K);
  })), KEY);
  t.check("7 写しが元に追いつく", caught);

  /* 8. 両方消える（新しい端末と同じ）。Dropbox の設定だけは残して、空を送らないかを見る。 */
  await page3.evaluate(() => Promise.all([KN.store.flush(), KN.liveIdb.flush()]));
  await page3.goto(AWAY);
  await page3.evaluate(() => {
    localStorage.clear();
    sessionStorage.setItem("__seeded", "1");
    localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "試験の鍵", refresh: "試験の更新札" }));
  });
  for (const name of ["kaimono-note", "kaimono-note-notes"]) await page3.evaluate(dropDb, name);
  const before8 = dbxCalls;
  await page3.goto(URL);
  await ready(page3);
  const s8 = await page3.evaluate(async () => ({
    blank: KN.store.isBlank(KN.store.get()),
    lost: KN.backup.lost(),
    doubt: KN.backup.doubt(),
    sent: await KN.dropbox.sync(),
  }));
  t.check("8 両方消える：空で始まる・訊かない・点検の行なし", s8.blank && s8.lost === null && s8.doubt === null, JSON.stringify(s8));
  t.check("8 Dropbox に空を送らない", s8.sent === "empty" && dbxCalls === before8, `${s8.sent} calls=${dbxCalls - before8}`);

  t.check("ページのエラーが無い", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})();
