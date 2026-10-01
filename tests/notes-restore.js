/* ノートの段2「復元で合わせる・版の控え」。決めごとは docs/notes.md。

   書く紙に作った日時／書く回の最初に直したとき、直す前が前の版に残る（同じ回で
   何度打っても一つ）／隠れて戻ったら別の回／読み直しても前の版が残る（入れ物の
   meta `ver:<id>`）／「前の版」から読んで戻す→戻す前の中身も前の版に／
   復元の口（設定のファイル）でノートを合わせる：無いものは足す・新しいほうが本文・
   もう片方は前の版・こちらにだけあるノートは消えない・★と消した印はこちらのまま／
   記録（localStorage）にはノートが入らない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-restore.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-restore");
  const { browser, page, errors } = await open();

  const active = () => page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  const toNotes = async () => {
    if ((await active()) === "notes") return;
    if ((await active()) !== "archive") {
      await page.evaluate(() => KN.app.showScreen("archive"));
      await settled("archive");
    }
    await page.click('.tab[data-tab="archive"]');
    await settled("notes");
  };
  const closeSheet = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-note.is-open"), null, { timeout: 3000 });
  };
  const openRow = async (id) => {
    await page.click(`#screen-notes .note-row[data-id="${id}"] .js-open`);
    await page.waitForSelector(".sheet.is-note.is-open");
  };
  const typeEnd = async (s) => {
    await page.focus(".sheet.is-note .js-text");
    await page.keyboard.press("End");
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(s);
  };
  const vers = (id) => page.evaluate((i) => KN.notes.versions(i), id);
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.notes);
    await page.waitForTimeout(300);
    await page.evaluate(() => KN.notes.ready());
  };

  await page.evaluate(() => KN.notes.ready());
  await toNotes();

  /* ---- 書く紙に、作った日時 ---- */
  await page.click("#dock .add-fab");
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.keyboard.insertText("一つ目");
  const when = await page.$eval(".sheet.is-note .note-when", (e) => e.textContent);
  t.check("書く紙に作った日時（年月日・曜・時刻）", /^\d{4}年\d+月\d+日\(.\) \d+:\d\d$/.test(when), when);
  const bg = await page.$eval(".sheet.is-note", (e) => getComputedStyle(e).backgroundColor);
  t.check("書く紙は白い一枚（透ける灰ではない）", bg === "rgb(255, 255, 255)", bg);
  await page.waitForTimeout(900);
  /* 育つ紙は開く途中で縮んでいるので、開き切ってから測ります。 */
  const tall = await page.$eval(".sheet.is-note", (e) => e.getBoundingClientRect().height / innerHeight);
  t.check("書く紙ははじめから背いっぱい", tall > 0.85, tall.toFixed(2));
  await closeSheet();
  const id = await page.evaluate(() => KN.notes.list()[0].id);
  t.check("新しく書いたノートには前の版が無い", (await vers(id)).length === 0);

  /* ---- 書く回の最初に直したとき、直す前が残る（何度打っても一つ） ---- */
  await openRow(id);
  await typeEnd("、二");
  await page.waitForTimeout(100);
  await typeEnd("つ目");
  await page.waitForTimeout(900);
  await closeSheet();
  let v = await vers(id);
  t.check("開いて直すと、直す前が前の版に（同じ回で何度打っても一つ）",
    v.length === 1 && v[0].body === "一つ目", JSON.stringify(v));

  /* ---- 隠れて戻ったら別の回 ---- */
  await openRow(id);
  await typeEnd("、三");
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  await typeEnd("つ目");
  await page.waitForTimeout(900);
  await closeSheet();
  v = await vers(id);
  t.check("隠れて戻ってから直すと、別の版になる",
    v.length === 3 && v[0].body === "一つ目、二つ目、三" && v[1].body === "一つ目、二つ目", JSON.stringify(v.map((x) => x.body)));

  /* ---- 読み直しても前の版は残る（入れ物の meta） ---- */
  await reload();
  v = await vers(id);
  t.check("読み直しても前の版が残る", v.length === 3 && v[2].body === "一つ目", JSON.stringify(v.map((x) => x.body)));
  const meta = await page.evaluate((i) => new Promise((res) => {
    const r = indexedDB.open("kaimono-note-notes", 1);
    r.onsuccess = () => {
      const d = r.result;
      const q = d.transaction(["meta"], "readonly").objectStore("meta").get(`ver:${i}`);
      q.onsuccess = () => { d.close(); res(q.result ? q.result.list.length : -1); };
    };
  }), id);
  t.check("前の版は入れ物の meta `ver:<id>` に", meta === 3, String(meta));

  /* ---- 「前の版」から読んで戻す ---- */
  await toNotes();
  await openRow(id);
  await page.click(".sheet.is-note .js-menu");
  await page.locator(".action-sheet button, .sheet button", { hasText: "前の版" }).last().click();
  await page.waitForSelector(".notes-versions");
  const rowsShown = await page.$$eval(".notes-versions .note-ver", (rs) => rs.length);
  t.check("前の版の並びが出る（日時つき）", rowsShown === 3
    && /\d{4}年/.test(await page.$eval(".notes-versions .note-ver .note-d", (e) => e.textContent)), String(rowsShown));
  await page.locator(".notes-versions .note-ver").last().click();
  await page.waitForSelector(".js-revert");
  const readBody = await page.$eval(".note-read", (e) => e.textContent);
  t.check("押した版の中身を読める", readBody === "一つ目", readBody);
  await page.click(".js-revert");
  await page.waitForTimeout(600);
  const now = await page.evaluate((i) => KN.notes.get(i).body, id);
  const field = await page.$eval(".sheet.is-note.is-open .js-text", (e) => e.value).catch(() => "");
  t.check("この版に戻す → ノートと書く欄がその版に", now === "一つ目" && field === "一つ目", `${now} / ${field}`);
  await closeSheet();
  v = await vers(id);
  t.check("戻す前の中身も前の版に（戻したことも戻せる）",
    v[0].body === "一つ目、二つ目、三つ目", JSON.stringify(v.map((x) => x.body)));

  /* ---- 復元の口でノートを合わせる ---- */
  await page.evaluate(() => {
    const at = (d) => new Date(Date.now() + d * 864e5).toISOString();
    const mk = (id, body, upd, extra) => KN.notes.put({ ...KN.notes.draft(), id, body, createdAt: at(-9), updatedAt: at(upd), ...extra });
    mk("n-mine", "こちらだけ", -1);
    mk("n-newer", "こちらが古い", -3, { fav: true });
    mk("n-older", "こちらが新しい", -1);
    return KN.notes.flush();
  });
  const fileText = await page.evaluate(() => {
    const at = (d) => new Date(Date.now() + d * 864e5).toISOString();
    const n = (id, body, upd, extra) => ({ id, title: "", body, notebook: "", tags: [], fav: false,
      createdAt: at(-9), updatedAt: at(upd), deletedAt: null, ...extra });
    const raw = JSON.parse(KN.store.exportJSON("2026-09-30T00:00:00.000Z"));
    raw.noteBook = { v: 1, notes: [
      n("n-file", "ファイルだけ", -5),
      n("n-newer", "ファイルが新しい", -2),
      n("n-older", "ファイルが古い", -4),
    ] };
    return JSON.stringify(raw);
  });
  const ls0 = await page.evaluate(() => localStorage.getItem("kaimono-note-v2").length);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings");
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップ" }).first().click();
  await page.locator(".js-file").setInputFiles({ name: "kurashi.json", mimeType: "application/json", buffer: Buffer.from(fileText) });
  await page.waitForSelector(".js-ok");
  const ask = await page.evaluate(() => document.body.innerText);
  t.check("復元の確認に「ノートは消さずに合わせます」", ask.includes("ノートは消さずに合わせます"), "");
  await page.click(".js-ok");
  await page.waitForFunction(() => KN.notes.get("n-file"), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const got = await page.evaluate(async () => ({
    file: KN.notes.get("n-file") && KN.notes.get("n-file").body,
    mine: KN.notes.get("n-mine") && KN.notes.get("n-mine").body,
    newer: KN.notes.get("n-newer").body,
    newerFav: KN.notes.get("n-newer").fav,
    older: KN.notes.get("n-older").body,
    vNewer: (await KN.notes.versions("n-newer")).map((x) => x.body),
    vOlder: (await KN.notes.versions("n-older")).map((x) => x.body),
    kept: !!KN.notes.get(KN.notes.list().find((n) => n.body.startsWith("一つ目")).id),
  }));
  t.check("こちらに無いノートは足す", got.file === "ファイルだけ", JSON.stringify(got));
  t.check("こちらにだけあるノートは消えない", got.mine === "こちらだけ" && got.kept);
  t.check("ファイルが新しい → 本文はファイル、こちらの中身は前の版に",
    got.newer === "ファイルが新しい" && got.vNewer.includes("こちらが古い"), JSON.stringify(got.vNewer));
  t.check("ファイルが古い → 本文はこちら、ファイルの中身は前の版に",
    got.older === "こちらが新しい" && got.vOlder.includes("ファイルが古い"), JSON.stringify(got.vOlder));
  t.check("★はこちらのまま", got.newerFav === true);
  const ls = await page.evaluate(() => localStorage.getItem("kaimono-note-v2"));
  t.check("記録（localStorage）にノートは入らない", !ls.includes("noteBook") && !ls.includes("ファイルだけ"), `${ls0} → ${ls.length}`);

  await reload();
  const after = await page.evaluate(() => ({ file: !!KN.notes.get("n-file"), newer: KN.notes.get("n-newer").body }));
  t.check("合わせた中身は読み直しても残る", after.file && after.newer === "ファイルが新しい", JSON.stringify(after));

  /* ---- 二度合わせても増えない ---- */
  const twice = await page.evaluate(async (text) => {
    const r = await KN.notes.merge(JSON.parse(text).noteBook);
    return { r, n: (await KN.notes.versions("n-older")).length };
  }, fileText);
  t.check("同じファイルを二度合わせても増えない", twice.r.added === 0 && twice.n === 1, JSON.stringify(twice));

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
