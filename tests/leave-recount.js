/* 前の数え方の育休の行を、今の数え方へ（2026年10月26日・js/screen-archive.js の recountLeave）。
   - 期間の日の頭にある「育休完了まであとN日」のうち、N が前の数え方（4/1 も入れる）と同じ行だけ
     「あと(N-1)日（04.01を含めるとあとN日）」へ。開いたら走る（読み直して確かめる）
   - 今の数え方の行・数の合わない行・期間の外の日・頭より下の行には触れない
   - 本文の残り・更新の時刻はそのまま。置き換える前に「育休の数え直し前」の控えが一本
   - 二度目は何もしない。置き換えた行も、頭の字（鍵が閉じていても出す・直すボタンを出さない）として読む
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/leave-recount.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("leave-recount");
  const { browser, page, errors } = await open({
    before: (cx, p) => p.clock.setFixedTime(new Date(2026, 9, 26, 10, 0)),
  });

  const SEED = {
    "2027-03-31": "2027.03.31（水）\n育休完了まであと2日\n\nてすと",
    "2026-04-01": "2026.04.01（水）\n育休完了まであと366日\n\nてすと",
    "2026-10-01": "2026.10.01（木）\n育休完了まであと182日\n\nてすと",
    "2026-10-02": "2026.10.02（金）\n育休完了まであと9日\n\nてすと",
    "2026-03-31": "2026.03.31（火）\n育休完了まであと367日\n\nてすと",
    "2026-10-05": "てすと\nてすと\nてすと\n育休完了まであと179日",
  };
  await page.evaluate((seed) => {
    Object.entries(seed).forEach(([d, memo]) => KN.store.setDayLog(d, { memo }));
    KN.store.flush();
  }, SEED);
  const before = await page.evaluate(() => Object.fromEntries(KN.store.get().archive.days.map((d) => [d.date, d.updatedAt])));
  await page.evaluate(() => KN.diaryIdb && KN.diaryIdb.ready());
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.screens && KN.screens.archive);
  /* 開いて 1.5秒のちに走る。置き換わるまで待つ（上限 8秒）。 */
  await page.waitForFunction(() => /含めると/.test((KN.store.dayLog("2027-03-31") || {}).memo || ""), null, { timeout: 8000 }).catch(() => {});

  const got = await page.evaluate(() => Object.fromEntries(KN.store.get().archive.days.map((d) => [d.date, { memo: d.memo, at: d.updatedAt }])));
  const m = (d) => (got[d] || {}).memo;
  t.check("2027.03.31：あと1日（04.01を含めるとあと2日）",
    m("2027-03-31") === "2027.03.31（水）\n育休完了まであと1日（04.01を含めるとあと2日）\n\nてすと", m("2027-03-31"));
  t.check("2026.04.01：あと365日（04.01を含めるとあと366日）",
    m("2026-04-01") === "2026.04.01（水）\n育休完了まであと365日（04.01を含めるとあと366日）\n\nてすと", m("2026-04-01"));
  t.check("今の数え方の行には触れない", m("2026-10-01") === SEED["2026-10-01"], m("2026-10-01"));
  t.check("数の合わない行には触れない", m("2026-10-02") === SEED["2026-10-02"], m("2026-10-02"));
  t.check("期間の外の日には触れない", m("2026-03-31") === SEED["2026-03-31"], m("2026-03-31"));
  t.check("頭より下の行には触れない", m("2026-10-05") === SEED["2026-10-05"], m("2026-10-05"));
  t.check("更新の時刻はそのまま", ["2027-03-31", "2026-04-01"].every((d) => got[d] && got[d].at === before[d]),
    JSON.stringify([before["2027-03-31"], got["2027-03-31"] && got["2027-03-31"].at]));

  const snaps = await page.evaluate(async () => (await KN.backup.list()).filter((s) => s.reason === "育休の数え直し前").length);
  t.check("置き換える前に控えが一本", snaps === 1, String(snaps));
  t.check("二度目は何もしない", await page.evaluate(() => KN.screens.archive.recountLeave()) === 0);

  /* 読み直しても置き換えたまま（元と日記の写しの両方に届いている）。 */
  await page.evaluate(() => { KN.store.flush(); return KN.diaryIdb && KN.diaryIdb.ready(); });
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.screens && KN.screens.archive && (!KN.diaryIdb || KN.diaryIdb.body() === "ok"));
  t.check("読み直しても置き換えたまま", await page.evaluate(() => /あと1日（04\.01を含めるとあと2日）/.test((KN.store.dayLog("2027-03-31") || {}).memo || "")));
  const copy = await page.evaluate(() => new Promise((ok) => {
    const rq = indexedDB.open("kaimono-note");
    rq.onerror = () => ok("open-failed");
    rq.onsuccess = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains("diary")) { db.close(); ok("no-store"); return; }
      const g = db.transaction("diary").objectStore("diary").get("2027-03-31");
      g.onsuccess = () => { db.close(); ok(JSON.stringify(g.result || null)); };
      g.onerror = () => { db.close(); ok("get-failed"); };
    };
  }));
  t.check("日記の写しにも届いている", /含めるとあと2日/.test(copy), copy);

  /* 置き換えた日を空の日の頭として読む（直す・コピーのボタンが出ない日記の頭）。 */
  await page.evaluate(() => { KN.app.showScreen("archive"); KN.screens.archive.goDay("2027-03-31"); });
  await page.waitForTimeout(800);
  const text = await page.evaluate(() => (document.querySelector(".screen.is-active .arc-log") || document.body).innerText);
  t.check("画面に今の形で出る", /育休完了まであと1日（04\.01を含めるとあと2日）/.test(text), text.slice(0, 200));

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
