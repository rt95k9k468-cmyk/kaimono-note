/* 復元の練習の穴（P6b、2026年11月1日。docs/storage.md「守りの地図」）。restore-practice（ファイル・新品の端末・
   いちばん新しい自動の控え）・break（置き場が一つずつ消える）・dropbox（切る・外される）に無い場面だけ。
   Dropbox は台本が偽の返事をする（二つの端末で分け合う）。

   1. 機種を替える／Safari のデータが消える：空の端末で Dropbox の最新の控えから戻す → 件数・中身・日記の本文・
      ノートの本文が元の端末と同じ。読み直しても残る。空の端末は控えを送らない
   2. 前の控えへ：Dropbox の日付の控え（古いほう）→ その日の中身。あとで足したノートは消えず、直した本文は前の版に
      自動の控え：いちばん新しくない一つへ戻す → その時点の中身。新しいほうの控えも残り、そこへやり直せる
   3. IndexedDB が壊れる：開けない日も記録は書けて残り、直れば写しが追いつく／写しの中身が途中で切れていても
      元が勝ち、次の書き込みで写しが直る

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/restore-drill.js */
const { open, checker } = require("./lib");

/* 元にあった値が、一つも消えず・変わらない（restore-practice と同じ物差し。足された欄は見ない）。 */
const LOST = `window.__lost = function lost(a, b, p) {
  if (a === b || a === null || a === undefined) return [];
  if (typeof a === "object" && b && typeof b === "object") {
    let out = [];
    for (const k of Object.keys(a)) out = out.concat(lost(a[k], b[k], p + "." + k));
    return out;
  }
  return [p + ": " + JSON.stringify(a) + " -> " + JSON.stringify(b)];
};`;

/* 偽の Dropbox。files は端末をまたいで一つ。 */
async function fakeDropbox(page, files, uploads) {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const revs = new Map();
  let n = 0;
  const json = (route, status, obj) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) });
  await page.route(/https:\/\/(api|content|notify)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const u = new URL(req.url());
    const h = req.headers();
    const arg = h["dropbox-api-arg"] ? JSON.parse(h["dropbox-api-arg"]) : null;
    if (u.pathname === "/oauth2/token") {
      const f = Object.fromEntries(new URLSearchParams(req.postData() || ""));
      return json(route, 200, { access_token: "acc", expires_in: 14400, token_type: "bearer", ...(f.grant_type === "authorization_code" ? { refresh_token: "ref" } : {}) });
    }
    if (u.pathname === "/2/files/upload") {
      if (arg.mode === "add" && files.has(arg.path)) return json(route, 409, { error_summary: "path/conflict/file/.." });
      if (arg.mode && arg.mode[".tag"] === "update" && revs.get(arg.path) !== arg.mode.update) return json(route, 409, { error_summary: "path/conflict/file/.." });
      files.set(arg.path, req.postData());
      uploads.push(arg.path);
      revs.set(arg.path, `r${++n}`);
      return json(route, 200, { name: arg.path.split("/").pop(), rev: revs.get(arg.path) });
    }
    if (u.pathname === "/2/files/list_folder") {
      const entries = [...files.keys()].filter((p) => p.startsWith("/daily/"))
        .map((p) => ({ ".tag": "file", name: p.slice(7), server_modified: `${(/(\d{4}-\d\d-\d\d)/.exec(p) || [0, "2026-10-01"])[1]}T03:00:00Z`, size: files.get(p).length }));
      return json(route, 200, { entries, has_more: false, cursor: "c" });
    }
    if (u.pathname === "/2/files/get_metadata") {
      const { path } = JSON.parse(req.postData());
      if (!files.has(path)) return json(route, 409, { error_summary: "path/not_found/.." });
      if (!revs.has(path)) revs.set(path, `r${++n}`);
      return json(route, 200, { ".tag": "file", name: path.slice(1), rev: revs.get(path), server_modified: "2026-10-31T03:00:00Z", size: files.get(path).length });
    }
    if (u.pathname === "/2/files/download") {
      if (!files.has(arg.path)) return json(route, 409, { error_summary: "path/not_found/.." });
      return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "application/octet-stream" }, body: files.get(arg.path) });
    }
    if (u.pathname === "/2/files/delete_v2") return json(route, 200, {});
    return json(route, 409, { error_summary: "path/not_found/.." });
  });
}

const settle = (page) => page.evaluate(() => Promise.all([KN.liveIdb.ready(), KN.backup.checked(), KN.diaryIdb.ready(), KN.notes.ready()]));
const connect = (page) => page.evaluate(async () => {
  KN.dropbox.setAppKey("testkey123");
  for (let i = 0; i < 50 && !KN.dropbox.authUrl(); i++) await new Promise((r) => setTimeout(r, 50));
  return KN.dropbox.finish("code-1");
});
/* 記録の中身（その端末の設定は除く）・件数・日記の本文・ノートの本文。 */
const truth = (page) => page.evaluate(() => {
  const st = JSON.parse(JSON.stringify(KN.store.get()));
  delete st.settings;
  return {
    st, counts: KN.store.countsOf(),
    memo: st.archive.days.filter((d) => d.memo).map((d) => `${d.date}:${d.memo}`).sort().join("|"),
    notes: KN.notes.list().map((x) => `${x.id}:${KN.notes.get(x.id).body}`).sort().join("|"),
  };
});
/* 設定 → バックアップ → Dropbox → 控えから戻す → 行を押す → 復元する。 */
async function restoreFromDropbox(page, rowText) {
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(400);
  for (const label of ["バックアップ", "Dropbox へ自動で送る", "Dropbox の控えから戻す"]) {
    await page.locator(".set-layer:last-child .set-row", { hasText: label }).first().click();
    await page.waitForTimeout(450);
  }
  await page.locator(".set-layer:last-child button.row", { hasText: rowText }).first().click({ timeout: 5000 });
  await page.waitForSelector(".js-ok", { timeout: 4000 });
  await page.locator(".js-ok").last().click();
  await page.waitForFunction(() => /復元しました/.test(document.body.innerText), null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

(async () => {
  const t = checker("復元の練習の穴");
  const files = new Map();

  /* ================= 元の端末（A） ================= */
  const upA = [];
  const A = await open({ before: (ctx, p) => fakeDropbox(p, files, upA) });
  await settle(A.page);
  await A.page.evaluate(async () => {
    const S = KN.store;
    S.loadSample();
    S.setDayLog("2026-09-01", { memo: "一日目の本文。", wake: "07:00" });
    S.setDayLog("2026-09-02", { memo: "二日目の本文。" });
    const at = (d) => new Date(Date.now() + d * 864e5).toISOString();
    KN.notes.put({ ...KN.notes.draft(), id: "n-keep", body: "残るノート", createdAt: at(-9), updatedAt: at(-5) });
    KN.notes.put({ ...KN.notes.draft(), id: "n-edit", body: "直す前の本文", createdAt: at(-9), updatedAt: at(-5) });
    await KN.notes.flush();
  });
  /* 前の日の控え（古いほう）：この時点の中身を、日付の控えとして置いておく（その日に送った形）。 */
  const v1 = await truth(A.page);
  files.set("/daily/kurashi-2026-10-20.json", await A.page.evaluate(() => KN.store.exportJSON(undefined, KN.notes.forExport())));
  await A.page.evaluate(async () => {
    const S = KN.store;
    S.addTodo({ title: "あとから足した用事" });
    S.setDayLog("2026-09-02", { memo: "二日目を書き直した。" });
    KN.notes.put({ ...KN.notes.get("n-edit"), body: "直したあとの本文", updatedAt: new Date().toISOString() });
    KN.notes.put({ ...KN.notes.draft(), id: "n-later", body: "あとで足したノート", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await KN.notes.flush();
  });
  t.check("A は主の一台としてつながる", (await connect(A.page)) !== "other");
  await A.page.evaluate(() => KN.dropbox.sync());
  const v2 = await truth(A.page);
  t.check("材料：Dropbox に最新と古い日付の控え", files.has("/kurashi-latest.json") && files.has("/daily/kurashi-2026-10-20.json")
    && JSON.parse(files.get("/kurashi-latest.json")).noteBook.notes.length === 3);

  /* ================= 1. 機種を替える／Safari のデータが消える（空の端末 B） ================= */
  const upB = [];
  const B = await open({ before: (ctx, p) => fakeDropbox(p, files, upB) });
  await settle(B.page);
  await B.page.evaluate(LOST);
  t.check("1 空の端末は空で始まる", await B.page.evaluate(() => KN.store.isBlank(KN.store.get()) && !KN.notes.list().length));
  const rB = await connect(B.page);
  t.check("1 空の端末は二台めとしてつながり、控えを送らない", ["other", "empty"].includes(rB)
    && !upB.some((p) => /^\/(kurashi-latest|daily\/)/.test(p)), `${rB} ${upB.join(",")}`);
  await restoreFromDropbox(B.page, "（最新）");
  await B.page.waitForFunction((n) => KN.notes.list().length >= n, 3, { timeout: 5000 }).catch(() => {});
  const b1 = await truth(B.page);
  t.check("1 件数が元の端末と同じ", JSON.stringify(b1.counts) === JSON.stringify(v2.counts), `${JSON.stringify(b1.counts)} / ${JSON.stringify(v2.counts)}`);
  const lost1 = await B.page.evaluate((a) => window.__lost(a, JSON.parse(JSON.stringify(KN.store.get())), ""), v2.st);
  t.check("1 元の端末の値が一つも欠けず・変わらない", lost1.length === 0, lost1.slice(0, 5).join("\n      "));
  t.check("1 日記の本文が同じ", b1.memo === v2.memo, b1.memo);
  t.check("1 ノートの件数と本文が同じ", b1.notes === v2.notes, b1.notes);
  await B.page.reload();
  await B.page.waitForFunction(() => window.KN && KN.store && KN.app && KN.liveIdb);
  await settle(B.page);
  await B.page.evaluate(LOST);
  const b1r = await truth(B.page);
  t.check("1 読み直しても件数・日記・ノートが残る", JSON.stringify(b1r.counts) === JSON.stringify(v2.counts)
    && b1r.memo === v2.memo && b1r.notes === v2.notes);

  /* ================= 2. 前の控えへ ================= */
  /* Dropbox の日付の控え（古いほう）。 */
  await restoreFromDropbox(B.page, "10/20");
  const b2 = await truth(B.page);
  t.check("2 日付の控え：件数がその日と同じ", JSON.stringify(b2.counts) === JSON.stringify(v1.counts), `${JSON.stringify(b2.counts)} / ${JSON.stringify(v1.counts)}`);
  const lost2 = await B.page.evaluate((a) => window.__lost(a, JSON.parse(JSON.stringify(KN.store.get())), ""), v1.st);
  t.check("2 日付の控え：その日の値が一つも欠けず・変わらない", lost2.length === 0, lost2.slice(0, 5).join("\n      "));
  t.check("2 日付の控え：あとから足した用事は無く、日記はその日の本文", b2.memo === v1.memo
    && !(await B.page.evaluate(() => KN.store.get().todos.some((x) => x.title === "あとから足した用事"))), b2.memo);
  const notes2 = await B.page.evaluate(async () => ({
    later: !!KN.notes.get("n-later"),
    edit: KN.notes.get("n-edit").body,
    vers: (await KN.notes.versions("n-edit")).map((v) => v.body),
  }));
  t.check("2 日付の控え：あとで足したノートは消えず、直した本文は新しいほう・古いほうは前の版に",
    notes2.later && notes2.edit === "直したあとの本文" && notes2.vers.includes("直す前の本文"), JSON.stringify(notes2));
  /* 戻す前の中身は控えに残る（「復元前」。同じ中身の控えが先にあれば、それが代わり＝backup.take の "same"）。 */
  const undo2 = await B.page.evaluate(async () => {
    await KN.backup.restore(KN.backup.list()[0].at);
    return { counts: KN.store.countsOf(), has: KN.store.get().todos.some((x) => x.title === "あとから足した用事") };
  });
  t.check("2 日付の控え：戻す前の中身は控えに残り、そこへやり直せる",
    undo2.has && JSON.stringify(undo2.counts) === JSON.stringify(v2.counts), JSON.stringify(undo2));

  /* 自動の控え：いちばん新しくない一つへ。 */
  const auto = await A.page.evaluate(async () => {
    const S = KN.store;
    await KN.backup.take("削除前");
    const older = KN.backup.list().find((s) => s.reason === "削除前");
    const st1 = JSON.parse(JSON.stringify(S.get()));
    delete st1.settings;
    const c1 = S.countsOf();
    await new Promise((r) => setTimeout(r, 30));
    S.addTodo({ title: "控えのあとの用事" });
    S.setDayLog("2026-09-01", { memo: "一日目を控えのあとで直した。" });
    await KN.backup.take("削除前");
    const newer = KN.backup.list().find((s) => s.reason === "削除前" && s.at !== older.at);
    const c2 = S.countsOf();
    await KN.backup.restore(older.at);
    const back = { counts: S.countsOf(), memo: S.get().archive.days.find((d) => d.date === "2026-09-01").memo,
      gone: !S.get().todos.some((x) => x.title === "控えのあとの用事") };
    const newerKept = !!newer && KN.backup.list().some((s) => s.at === newer.at);
    if (newer) await KN.backup.restore(newer.at);
    const again = { counts: S.countsOf(), has: S.get().todos.some((x) => x.title === "控えのあとの用事") };
    return { st1, c1, c2, back, newerKept, again, olderIsNotLatest: !!newer && newer.at > older.at };
  });
  await A.page.evaluate(LOST);
  t.check("2 自動の控え：いちばん新しくない一つを選べる", auto.olderIsNotLatest);
  t.check("2 自動の控え：件数がその時点と同じ・あとの用事は無い・日記はその時点の本文",
    JSON.stringify(auto.back.counts) === JSON.stringify(auto.c1) && auto.back.gone && auto.back.memo === "一日目の本文。", JSON.stringify(auto.back));
  t.check("2 自動の控え：新しいほうの控えは残り、そこへやり直せる",
    auto.newerKept && auto.again.has && JSON.stringify(auto.again.counts) === JSON.stringify(auto.c2), JSON.stringify(auto.again));
  t.check("エラーが出ていない（A・B）", !A.errors.length && !B.errors.length, A.errors.concat(B.errors).join(" | "));
  await A.browser.close();
  await B.browser.close();

  /* ================= 3. IndexedDB が壊れる ================= */
  const C = await open({
    before: (ctx) => ctx.addInitScript(() => {
      const orig = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...a) {
        if (localStorage.getItem("__test_idb_broken")) throw new DOMException("試験で開けなくした", "UnknownError");
        return orig.apply(this, a);
      };
    }),
  });
  const page = C.page;
  const reopen = async () => {
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.liveIdb);
    await page.waitForTimeout(300);
    await page.evaluate(() => Promise.all([KN.liveIdb.ready(), KN.backup.checked(), KN.diaryIdb.ready()]).catch(() => {}));
  };
  const titles = () => page.evaluate(() => KN.store.get().todos.map((x) => x.title).sort().join("|"));
  const liveCopy = () => page.evaluate(() => Promise.resolve(KN.store.flush()).then(() => KN.liveIdb.flush()).then(() => KN.idb.run(["meta"], "readonly", (tx) => {
    const r = tx.objectStore("meta").get("live");
    return () => (r.result ? r.result.v : null);
  })));
  const lsRaw = () => page.evaluate(() => localStorage.getItem("kaimono-note-v2"));
  await settle(page);
  await page.evaluate(() => KN.store.loadSample());
  await page.waitForTimeout(400);
  const t0 = await titles();

  await page.evaluate(() => localStorage.setItem("__test_idb_broken", "1"));
  await reopen();
  t.check("3 開けない日：写しは止まり、記録はそのまま", (await page.evaluate(() => KN.liveIdb.status().phase)) === "off" && (await titles()) === t0);
  await page.evaluate(() => KN.store.addTodo({ title: "壊れた日の用事" }));
  await page.waitForTimeout(500);
  await reopen();
  const t1 = await titles();
  t.check("3 開けない日に書いたものも、開き直して残る", t1.includes("壊れた日の用事") && t1.split("|").length === t0.split("|").length + 1, t1);
  await page.evaluate(() => localStorage.removeItem("__test_idb_broken"));
  await reopen();
  await page.evaluate(() => KN.store.addTodo({ title: "直った日の用事" }));
  const v3 = await liveCopy();
  t.check("3 直ると写しが元に追いつく（壊れた日の用事も）", !!v3 && v3.json === (await lsRaw()) && v3.json.includes("壊れた日の用事"));

  /* 写しの中身が途中で切れている（番号は元より大きい）。 */
  const raw = await lsRaw();
  await page.evaluate((r) => KN.idb.run(["meta"], "readwrite", (tx) => {
    tx.objectStore("meta").put({ k: "live", v: { seq: JSON.parse(r).lsSeq + 50, at: new Date().toISOString(), json: r.slice(0, Math.floor(r.length / 2)) } });
  }), raw);
  const before4 = await titles();
  await reopen();
  t.check("3 写しが切れていれば元が勝つ（記録はそのまま）", (await titles()) === before4 && (await page.evaluate(() => KN.liveIdb.status().did)) === "adopt-failed");
  await page.evaluate(() => KN.store.addTodo({ title: "写しを直す用事" }));
  const v4 = await liveCopy();
  t.check("3 次の書き込みで写しが直る", !!v4 && v4.json === (await lsRaw()));
  t.check("エラーが出ていない（C）", !C.errors.length, C.errors.join(" | "));
  await C.browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
