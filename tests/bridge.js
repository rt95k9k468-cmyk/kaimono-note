/* 積み上げ⇄ノートの橋（docs/notes.md の段6・docs/bridge-design.md の「試験」1〜15）。
   つながりは記録の側（entry.note・生まれた元は entry.fromNote）にだけ持ち、ノートは逆引き。
   見つからないノートを指す記録は欄を消さず「つなぎ直す／外す」、入れ物が開いていない日は何も出さない。
   控え・復元・Dropbox・記録の写しへ一緒に付いていく。古い形は読み込みで一文字も変わらない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/bridge.js */
const { open, checker } = require("./lib");

const TODAY = "2026-10-08";

(async () => {
  const t = checker("bridge");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 8, 13, 20)); },
  });
  const KEY = "kaimono-note-v2";
  const wait = (ms) => page.waitForTimeout(ms);
  const entry = (id) => page.evaluate((i) => { const e = KN.store.get().archive.entries.find((x) => x.id === i); return e ? { ...e } : null; }, id);
  const entriesStr = () => page.evaluate(() => JSON.stringify(KN.store.get().archive.entries));
  const openCount = () => page.evaluate(() => document.querySelectorAll(".sheet.is-open").length);
  const topSheet = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh ? { note: sh.classList.contains("is-note"), text: sh.textContent } : null;
  });
  const TOP = ".sheet.is-open:not(.is-note)";
  const closeTop = async () => {
    const n = await openCount();
    await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open")].pop().querySelector(".js-close").click());
    await page.waitForFunction((k) => document.querySelectorAll(".sheet.is-open").length < k, n);
    await wait(250);
  };
  const openEntry = async (id) => {
    await page.evaluate((i) => KN.screens.archive.openEntry(i), id);
    await page.waitForSelector(`${TOP} .js-bridge`, { state: "attached" });
    await wait(200);
  };
  const bridgeOf = () => page.evaluate((sel) => {
    const b = [...document.querySelectorAll(`${sel} .js-bridge`)].pop();
    const q = (s) => b.querySelector(s);
    return { hidden: b.hidden, src: q(".js-note-src") ? q(".js-note-src").textContent : null, from: !!q(".js-note-from"),
      re: !!q(".js-relink"), un: !!q(".js-unlink") };
  }, TOP);
  const menuPick = async (label) => {
    await page.click(`${TOP} .js-menu`);
    await page.locator(".note-pop.is-open .note-pop-item", { hasText: label }).click();
    await wait(250);
  };
  const menuLabels = async () => {
    await page.click(`${TOP} .js-menu`);
    await page.waitForSelector(".note-pop.is-open .note-pop-item");
    const ls = await page.$$eval(".note-pop.is-open .note-pop-item", (bs) => bs.map((b) => b.textContent.trim()));
    await page.keyboard.press("Escape");
    await wait(250);
    return ls;
  };
  const pick = async (noteId, q) => {
    await page.waitForSelector(".sheet.is-open .js-q");
    if (q) await page.fill(".sheet.is-open .js-q", q);
    const rows = await page.$$eval(".sheet.is-open .js-rows .note-ver", (rs) => rs.map((r) => r.dataset.id));
    await page.click(`.sheet.is-open .js-rows .note-ver[data-id="${noteId}"]`);
    await wait(300);
    return rows;
  };
  const toastAct = async () => { await page.locator(".toast-action", { hasText: "元に戻す" }).last().click(); await wait(200); };

  await page.evaluate(() => KN.notes.ready());
  await page.evaluate(() => {
    /* 時計を止めているので、直した時刻は自分で分ける（選ぶ紙の並びを見るため）。 */
    const at = (h) => new Date(2026, 9, 8, h).toISOString();
    KN.notes.put({ ...KN.notes.draft(), id: "n-a", title: "Aのノート", body: "本文A", updatedAt: at(9) });
    KN.notes.put({ ...KN.notes.draft(), id: "n-b", title: "Bのノート", body: "本文B", updatedAt: at(10) });
    return KN.notes.flush();
  });
  const ids = await page.evaluate(() => ({
    r: KN.store.addEntry({ type: "reading", title: "坊っちゃん", kind: "book", date: "2026-10-05" }).id,
    o: KN.store.addEntry({ type: "done", title: "ほかの記録", date: "2026-10-06" }).id,
  }));

  /* ---- 1 種をまく ---- */
  await page.evaluate(() => KN.screens.notes.open("n-a"));
  await page.waitForSelector(".sheet.is-note.is-open .js-note-more");
  await wait(300);
  t.check("1 何もつながらないノートには札を出さない", await page.$eval(".sheet.is-note.is-open .js-bridge", (b) => b.hidden));
  /* ノートの「⋯」の「種をまく」は外した（種はタグ。docs/thinking.md）。前からの種の橋の決まりは、口から確かめる。 */
  await page.evaluate(() => KN.screens.archive.seedFromNote("n-a"));
  await page.waitForSelector(`${TOP} .js-memo`);
  await wait(250);
  t.check("1 種の紙はメモへカーソル・頭にノートの札", await page.evaluate((s) => document.activeElement && document.activeElement.matches(`${s} .js-memo`), TOP)
    && (await bridgeOf()).src === "ノート『Aのノート』");
  await page.fill(`${TOP} .js-memo`, "芽のメモ\n二行目");
  await page.click(`${TOP} .js-ok`);
  await page.waitForFunction(() => document.querySelectorAll(".sheet.is-open").length === 1);
  await wait(300);
  const sId = await page.evaluate(() => KN.store.get().archive.entries.find((e) => e.memo.startsWith("芽のメモ")).id);
  let s = await entry(sId);
  t.check("1 種：note・fromNote が N、日付はローカルの今日", s.type === "seed" && s.note === "n-a" && s.fromNote === "n-a" && s.date === TODAY, JSON.stringify(s));
  t.check("1 閉じればノートへ戻り、札が出る", (await topSheet()).note
    && !(await page.$eval(".sheet.is-note.is-open .js-bridge", (b) => b.hidden)));
  await page.click(".sheet.is-note.is-open .js-bridge");
  await page.waitForSelector(".note-pop .note-bridge-row");
  const rows1 = await page.$$eval(".note-pop .note-bridge-row", (rs) => rs.map((r) => r.textContent));
  t.check("1 小窓に記録の行（種はメモの頭）", rows1.length === 1 && rows1[0].includes("芽のメモ") && !rows1[0].includes("二行目"), JSON.stringify(rows1));
  await page.click(".note-pop .note-bridge-row");
  await page.waitForSelector(`${TOP} .js-note-src`);
  await wait(250);
  await page.click(`${TOP} .js-note-src`);
  await page.waitForFunction(() => document.querySelectorAll(".sheet.is-open").length === 1);
  await wait(300);
  t.check("1 札を押すと、下のノートへ戻るだけ（重ねて開かない）", (await topSheet()).note
    && (await page.$$(".sheet.is-note.is-open")).length === 1);
  await closeTop();

  /* ---- 2 つなぐ ---- */
  const before2 = await page.evaluate(() => KN.store.get().archive.entries.map((e) => JSON.stringify(e)));
  const order2 = await page.evaluate(() => KN.store.entriesOfMonth("2026-10").map((e) => e.id).join());
  await openEntry(ids.r);
  t.check("2 つながっていない記録には札を出さない", (await bridgeOf()).hidden);
  const m2 = await menuLabels();
  t.check("2 「⋯」に「ノートにつなぐ」（消すの前）", m2.indexOf("ノートにつなぐ") >= 0 && m2.indexOf("ノートにつなぐ") < m2.indexOf("消す"), JSON.stringify(m2));
  await menuPick("ノートにつなぐ");
  const rows2 = await pick("n-b");
  t.check("2 選ぶ紙は新しく直した順", rows2.join() === "n-b,n-a", rows2.join());
  const r2 = await entry(ids.r);
  const after2 = await page.evaluate(() => KN.store.get().archive.entries.map((e) => JSON.stringify(e)));
  t.check("2 つなぐ：note が入り、updatedAt も並びも動かない", r2.note === "n-b" && r2.updatedAt === JSON.parse(before2.find((x) => x.includes(ids.r))).updatedAt
    && order2 === await page.evaluate(() => KN.store.entriesOfMonth("2026-10").map((e) => e.id).join()), JSON.stringify(r2));
  t.check("2 ほかの記録は1バイトも変わらない", after2.filter((x) => !x.includes(ids.r)).join() === before2.filter((x) => !x.includes(ids.r)).join());
  t.check("2 紙の札がその場で「ノート『Bのノート』」に", (await bridgeOf()).src === "ノート『Bのノート』");
  await closeTop();

  /* ---- 3 つなぎ直す ---- */
  await openEntry(sId);
  await menuPick("つなぎ直す");
  const rows3 = await pick("n-b", "Ｂの");
  t.check("3 さがす欄で絞れる（かなと幅をそろえて）", rows3.join() === "n-b", rows3.join());
  s = await entry(sId);
  t.check("3 A でまいた種を B へ：note は B・fromNote は A", s.note === "n-b" && s.fromNote === "n-a");
  const b3 = await bridgeOf();
  t.check("3 紙に B の札と、生まれた元（芽）の札", b3.src === "ノート『Bのノート』" && b3.from, JSON.stringify(b3));
  t.check("3 A・B どちらの逆引きにも出る", await page.evaluate((i) => KN.store.entriesOfNote("n-a").some((e) => e.id === i)
    && KN.store.entriesOfNote("n-b").map((e) => e.id).includes(i) && KN.store.entriesOfNote("n-b").length === 2, sId));
  await closeTop();

  /* ---- 4 外す → 元に戻す ---- */
  await openEntry(ids.r);
  await menuPick("外す");
  t.check("4 外す：note は null・札が消える", (await entry(ids.r)).note === null && (await bridgeOf()).hidden);
  await toastAct();
  t.check("4 元に戻す：前の id に戻る", (await entry(ids.r)).note === "n-b" && (await bridgeOf()).src === "ノート『Bのノート』");
  await closeTop();

  /* ---- 5 ノートを最近削除へ → 戻す ---- */
  const str5 = await entriesStr();
  await page.evaluate(() => KN.notes.remove("n-b"));
  await openEntry(sId);
  const b5 = await bridgeOf();
  t.check("5 最近削除のノート：「つなぎ直す／外す」、題は出さない", b5.re && b5.un && !b5.src && b5.from, JSON.stringify(b5));
  t.check("5 記録の文字列は同じ", (await entriesStr()) === str5);
  await page.evaluate(() => KN.notes.restore("n-b"));
  await wait(200);
  t.check("5 ノートを戻せば札が戻る（開いたままの紙でも）", (await bridgeOf()).src === "ノート『Bのノート』");
  await closeTop();

  /* ---- 6 30日を過ぎたノート ---- */
  const gId = await page.evaluate(() => KN.store.addEntry({ type: "done", title: "消えたノートの記録", note: "n-gone" }).id);
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("kaimono-note-notes", 1);
    r.onsuccess = () => {
      const d = r.result;
      const tx = d.transaction(["notes"], "readwrite");
      const old = new Date(Date.now() - 31 * 864e5).toISOString();
      tx.objectStore("notes").put({ id: "n-gone", title: "古い", body: "x", notebook: "", tags: [], fav: false,
        createdAt: old, updatedAt: old, deletedAt: old });
      tx.oncomplete = () => { d.close(); res(); };
    };
  }));
  await page.evaluate(() => KN.store.flush());
  const reload = async () => {
    await page.evaluate(() => Promise.all([KN.store.flush(), KN.notes.flush()]));
    await wait(150);
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.notes);
    await wait(300);
    await page.evaluate(() => KN.notes.ready());
  };
  await reload();
  t.check("6 30日を過ぎたノートは消え、記録の id は残る", await page.evaluate(() => !KN.notes.get("n-gone"))
    && (await entry(gId)).note === "n-gone");
  await openEntry(gId);
  const b6 = await bridgeOf();
  t.check("6 「つなぎ直す／外す」が出る", b6.re && b6.un && !b6.src, JSON.stringify(b6));
  await closeTop();

  /* ---- 7 入れ物が開いていない日 ---- */
  for (const st of ["loading", "off"]) {
    const str7 = await entriesStr();
    await page.evaluate((x) => { KN.notes.__state = KN.notes.state; KN.notes.state = () => x; }, st);
    await openEntry(sId);
    const b7 = await bridgeOf();
    const m7 = await menuLabels();
    t.check(`7 ${st}：札も「つなぎ直す／外す」も、「⋯」のつなぐも出さない`, b7.hidden && !m7.some((x) => /つな|外す/.test(x)), JSON.stringify([b7, m7]));
    await closeTop();
    t.check(`7 ${st}：記録は変わらない`, (await entriesStr()) === str7);
    await page.evaluate(() => { KN.notes.state = KN.notes.__state; delete KN.notes.__state; });
  }

  /* ---- 8 記録を消す → 元に戻す／さっき消したもの ---- */
  const r8 = JSON.stringify(await entry(ids.r));
  await openEntry(ids.r);
  await menuPick("消す");
  t.check("8 消した", (await entry(ids.r)) === null);
  await toastAct();
  t.check("8 元に戻す：つながりごと戻る", JSON.stringify(await entry(ids.r)) === r8);
  const s8 = JSON.stringify(await entry(sId));
  await page.evaluate((i) => { KN.store.keepGone(KN.store.removeEntry(i)); KN.store.putBackGone(KN.store.goneList()[0]); }, sId);
  t.check("8 さっき消したものから戻す：note・fromNote ごと", JSON.stringify(await entry(sId)) === s8);

  /* ---- 9 書き出す → 全部消す → ファイルから復元 ---- */
  const files = await page.evaluate(() => {
    const raw = JSON.parse(KN.store.exportJSON(undefined, KN.notes.forExport()));
    const bare = { ...raw };
    delete bare.noteBook;
    return { full: JSON.stringify(raw), bare: JSON.stringify(bare) };
  });
  const wipe = () => page.evaluate(() => {
    KN.store.update((x) => { x.archive.entries = []; });
    KN.notes.drop("n-a");
    KN.notes.drop("n-b");
    return KN.notes.flush();
  });
  const restoreFile = async (text) => {
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
    await page.waitForFunction(() => !document.querySelector(".set-layer.is-edge-lift"));
    await wait(250);
    await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップ" }).first().click();
    await page.waitForFunction(() => document.querySelectorAll(".set-layer").length >= 2 && !document.querySelector(".set-layer.is-edge-lift"));
    await page.locator(".js-file").setInputFiles({ name: "kurashi.json", mimeType: "application/json", buffer: Buffer.from(text) });
    await page.waitForSelector(".js-ok");
    await page.click(".js-ok");
    await page.waitForFunction(() => KN.store.get().archive.entries.length > 0, null, { timeout: 5000 }).catch(() => {});
    await wait(500);
    await page.evaluate(() => KN.app.showScreen("archive"));
    await wait(400);
  };
  await wipe();
  await restoreFile(files.bare);
  s = await entry(sId);
  t.check("9 noteBook の無いファイル：note・fromNote の id は残る", s && s.note === "n-b" && s.fromNote === "n-a", JSON.stringify(s));
  t.check("9 ノートは無いので「見つからない」", await page.evaluate(() => KN.screens.notes.find("n-b").state === "missing"));
  await wipe();
  await restoreFile(files.full);
  s = await entry(sId);
  t.check("9 ファイルから復元：note・fromNote が残る", s && s.note === "n-b" && s.fromNote === "n-a", JSON.stringify(s));
  await page.waitForFunction(() => KN.notes.get("n-b"), null, { timeout: 5000 }).catch(() => {});
  await openEntry(sId);
  t.check("9 ノートを合わせたあとに札", (await bridgeOf()).src === "ノート『Bのノート』");
  await closeTop();

  /* ---- 10 自動の控えから戻す ---- */
  const took = await page.evaluate(() => KN.backup.take("試験", { force: true }));
  const at10 = await page.evaluate(() => KN.backup.list()[0].at);
  await page.evaluate((i) => KN.store.setEntryNote(i, null), ids.r);
  await page.evaluate((a) => KN.backup.restore(a).then(() => KN.store.flush()), at10);
  await wait(400);
  t.check("10 自動の控えから戻す：つながりが戻る", (await entry(ids.r)).note === "n-b" && (await entry(sId)).fromNote === "n-a", String(took));

  /* ---- 11 Dropbox ---- */
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (route, status, obj) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) });
  const ups = [];
  await page.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const u = new URL(req.url());
    if (u.pathname === "/oauth2/token") return json(route, 200, { access_token: "acc", refresh_token: "ref", expires_in: 14400, token_type: "bearer" });
    if (u.pathname === "/2/files/upload") {
      const arg = JSON.parse(req.headers()["dropbox-api-arg"]);
      ups.push({ path: arg.path, body: req.postData() });
      return json(route, 200, { name: arg.path.split("/").pop() });
    }
    if (u.pathname === "/2/files/list_folder") return json(route, 200, { entries: [], has_more: false, cursor: "c" });
    return json(route, 409, { error_summary: "path/not_found/.." });
  });
  await page.evaluate(() => KN.dropbox.setAppKey("testkey123"));
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.dropbox.authUrl());
  await page.evaluate(() => KN.dropbox.finish("code"));
  const d0 = await page.evaluate(() => KN.dropbox.sync());
  const d1 = await page.evaluate(() => KN.dropbox.sync());
  await page.evaluate((i) => KN.store.setEntryNote(i, "n-a"), ids.r);
  const n11 = ups.length;
  const d2 = await page.evaluate(() => KN.dropbox.sync());
  const sent = ups.slice(n11).find((u) => u.path === "/kurashi-latest.json");
  const sentRows = sent ? JSON.parse(sent.body).archive.entries : [];
  t.check("11 Dropbox：つなぎ替えだけでも送る", d1 !== "sent" && d2 === "sent" && !!sent, `${d0} ${d1} ${d2}`);
  t.check("11 送った中身に note・fromNote", sentRows.some((e) => e.id === ids.r && e.note === "n-a")
    && sentRows.some((e) => e.id === sId && e.note === "n-b" && e.fromNote === "n-a"));

  /* ---- 12 記録の写し（live-idb） ---- */
  await page.evaluate((i) => KN.store.setEntryNote(i, "n-b"), ids.r);
  const live = await page.evaluate(() => KN.store.flush() || true).then(() => page.evaluate(() => KN.liveIdb.flush().then(() => KN.idb.run(["meta"], "readonly", (tx) => {
    const r = tx.objectStore("meta").get("live");
    return () => (r.result ? r.result.v : null);
  }))));
  const liveRows = live && live.json ? JSON.parse(live.json).archive.entries : [];
  t.check("12 記録の写しにつなぎ替えが入る", liveRows.some((e) => e.id === ids.r && e.note === "n-b")
    && liveRows.some((e) => e.id === sId && e.fromNote === "n-a"));

  /* ---- 13 古い形 ---- */
  const plain = await page.evaluate(() => JSON.stringify(KN.store.addEntry({ type: "done", title: "古い形" })));
  await page.evaluate(() => KN.store.flush());
  await page.evaluate((K) => {
    const raw = JSON.parse(localStorage.getItem(K));
    const base = raw.archive.entries.find((e) => e.title === "古い形");
    raw.archive.entries.push({ ...base, id: "e-bad1", title: "崩れ1", note: 5, fromNote: "", someday: "残る" });
    raw.archive.entries.push({ ...base, id: "e-bad2", title: "崩れ2", fromNote: 7 });
    localStorage.setItem(K, JSON.stringify(raw));
  }, KEY);
  await reload();
  const after13 = await page.evaluate(() => {
    const es = KN.store.get().archive.entries;
    const f = (t) => es.find((e) => e.title === t);
    return { plain: JSON.stringify(f("古い形")), b1: f("崩れ1"), b2: f("崩れ2") };
  });
  t.check("13 note・fromNote の無い記録は読み込みの前後で同じ文字列（欄を足さない）", after13.plain === plain
    && !("fromNote" in JSON.parse(plain)) && !("note" in JSON.parse(plain)), after13.plain);
  t.check("13 崩れた値（数・空）は null、知らない欄は残る", after13.b1.note === null && after13.b1.fromNote === null
    && after13.b1.someday === "残る" && after13.b2.fromNote === null && !("note" in after13.b2), JSON.stringify([after13.b1, after13.b2]));
  t.check("13 つないだ記録も読み直しで残る", (await entry(ids.r)).note === "n-b" && (await entry(sId)).fromNote === "n-a");

  /* ---- 14 fromNote は直す・達成に変える・出し入れを通っても残る ---- */
  await page.evaluate((i) => KN.store.updateEntry(i, { memo: "芽のメモ（直した）" }), sId);
  t.check("14 updateEntry を通っても残る", (await entry(sId)).fromNote === "n-a");
  await page.evaluate((i) => KN.store.promoteSeed(i), sId);
  s = await entry(sId);
  t.check("14 promoteSeed を通っても残る", s.type === "done" && s.fromNote === "n-a" && s.note === "n-b");
  await page.evaluate((i) => KN.store.removeEntry(i)(), sId);
  t.check("14 takeOut / putIn を通っても残る", (await entry(sId)).fromNote === "n-a");

  /* ---- 15 空のまま閉じた新しいノートでも、つながった記録があれば残す ---- */
  await page.evaluate(() => KN.app.showScreen("notes"));
  await wait(300);
  await page.evaluate(() => KN.screens.notes.open(null));
  await page.waitForSelector(".sheet.is-note.is-open .js-text");
  await page.fill(".sheet.is-note.is-open .js-text", "仮");
  await wait(400);
  const fresh = await page.evaluate(() => KN.notes.list().find((n) => n.body === "仮"));
  await page.evaluate(([i, n]) => KN.store.setEntryNote(i, n), [ids.o, fresh && fresh.id]);
  await page.fill(".sheet.is-note.is-open .js-text", "");
  await wait(300);
  await closeTop();
  t.check("15 空になった新しいノートも、つながった記録があれば残る", !!fresh && await page.evaluate((n) => !!KN.notes.get(n), fresh.id));

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
