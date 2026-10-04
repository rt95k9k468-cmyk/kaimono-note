/* 日記の本文を記録から外す（段2の2b、2026年10月4日）。docs/storage.md の「段2の案」。

   - 外す前は、元（localStorage）に本文がある（これまでどおり）
   - 外していないと、大きな日記の取り込み・大きなファイルの復元は断り、「先に外す」と言う
   - 設定：「日記を記録から外す」→ 準備する（読み比べ・控え「日記を外す前」）→
     「書き出して外す」→ 保存できたら外す（大きな保存場所の meta に記録）
   - 外したあと：元は印の行（memo ""・memoOut）、記憶・画面・書き出しは本文つき
   - 新しく書いた本文は、写しに届いてから元から外れる
   - 大きな日記の取り込みは、写しへ先に届けてから元へ（罠b）。元は小さいまま
   - 開き直しても、写しから戻した本文を元へ書かない（罠a）。食い違いに数えない
   - 外したあとの復元は、本文を写しへ先に届けてから置き換える
   - 読めない日：書き出しは紙で「本文は入りません」→ ファイル名に「本文なし」、
     前回の書き出しに数えない。確かめる紙も言う。控えに out（案B の4）
   - 本文の入った最後の控えは、14日を過ぎても残す（案B の6）
   - 「日記を記録に戻す」で元に本文が戻り、外した記録が消える
   - dist/ がコミットされていない（罠f）

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-out.js */
const fs = require("fs");
const { execSync } = require("child_process");
const { open, checker, ROOT } = require("./lib");

const KEY = "kaimono-note-v2";
const A = "2026-02-01", B = "2026-02-02", C = "2026-02-03", D = "2026-02-04";
const BODY = { [A]: "外す試験の一日目", [B]: "外す試験の二日目", [C]: "外す試験の三日目" };
const PW = "test pass";
const BIG_DAYS = 220;           // 一日1万字 × 220日 ＝ 約220万字（取り込みの上限 200万字を越える）
const bigDate = (i) => new Date(Date.UTC(2019, 0, 1 + i)).toISOString().slice(0, 10);
const bigBody = (i, tag) => `${tag}${i}:` + "x".repeat(10000);

const settled = async (page) => {
  await page.waitForFunction(() => window.KN && KN.store && KN.diaryIdb && KN.diaryIdb.settled());
  await page.waitForTimeout(400);
};
const liveRaw = (page) => page.evaluate((K) => localStorage.getItem(K) || "", KEY);
/* 元の行。{ 日付: { memo, out } } */
const liveRows = (page) => page.evaluate((K) => {
  const p = JSON.parse(localStorage.getItem(K) || "null");
  return p ? Object.fromEntries(p.archive.days.map((d) => [d.date, { memo: d.memo, out: d.memoOut === true }])) : {};
}, KEY);
/* 写しの中身と記録。 */
const box = (page) => page.evaluate(() => KN.idb.run(["diary", "meta"], "readonly", (t) => {
  const r = t.objectStore("diary").getAll();
  const o = t.objectStore("meta").get("diaryOut");
  const m = t.objectStore("meta").get("diary");
  return () => ({
    rows: Object.fromEntries((r.result || []).map((x) => [x.date, x.memo])),
    out: o.result ? o.result.v : null,
    meta: m.result ? m.result.v : null,
  });
}));
const memOf = (page, date) => page.evaluate((d) => (KN.store.dayLog(d) || {}).memo || "", date);
const waitToast = (page, text, timeout = 20000) => page.waitForFunction(
  (t) => [...document.querySelectorAll(".toast-msg")].some((e) => e.textContent.includes(t)), text, { timeout });
const dialog = (page, text) => page.locator(".sheet, [role=dialog]", { hasText: text }).last();
const rowTexts = (page) => page.locator(".set-layer:last-child .set-row").allTextContents();
const tapRow = (page, text) => page.locator(".set-layer:last-child .set-row", { hasText: text }).first().click();

async function openBackup(page) {
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await page.waitForTimeout(250);
  await tapRow(page, "バックアップ");
  await page.waitForTimeout(400);
}

/* 取り込み道具と同じ形の控え。 */
const sealed = (page, days) => page.evaluate(async ({ days, PW }) => {
  const X = KN.diaryCrypto;
  const made = await X.makeLock(PW);
  const out = [];
  for (const [date, body] of days) {
    const b = await X.seal(made.key, body);
    out.push({ date, iv: b.iv, ct: b.ct, at: new Date().toISOString() });
  }
  return JSON.stringify({ app: "kaimono-note", kind: "diary-sealed", v: 1, lock: made.lock, days: out, at: new Date().toISOString() });
}, { days, PW });

/* 設定 → バックアップ →「日記を取り込む」で合言葉まで。 */
async function pickDiary(page, text) {
  await page.locator(".js-diary-file").setInputFiles({ name: "kurashi-diary.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await page.locator(".js-input").waitFor();
  await page.locator(".js-input").fill(PW);
  await page.locator(".sheet .js-ok, .js-ok").last().click();
}

const bigDays = (tag) => Array.from({ length: BIG_DAYS }, (_, i) => [bigDate(i), bigBody(i, tag)]);

(async () => {
  const t = checker("diary-out");

  /* ================= 罠f：古い単体版が配られない ================= */
  {
    let tracked = "";
    try { tracked = execSync("git ls-files dist", { cwd: ROOT, encoding: "utf8" }).trim(); } catch (err) { tracked = ""; }
    t.check("dist/ がコミットされていない（罠f）", !tracked, tracked.slice(0, 200));
    const ignore = fs.readFileSync(`${ROOT}/.gitignore`, "utf8");
    t.check(".gitignore に dist/ がある", /^dist\/$/m.test(ignore));
  }

  /* ================= 外す・外したあと・大きな日記 ================= */
  {
    const { browser, page, errors } = await open();
    await settled(page);
    await page.evaluate((BODY) => Object.entries(BODY).forEach(([d, memo]) => KN.store.setDayLog(d, { memo })), BODY);
    await page.waitForTimeout(700);
    let lv = await liveRows(page);
    t.check("外す前は、元に本文がある", lv[A].memo === BODY[A] && !lv[A].out, JSON.stringify(lv[A]));

    /* 外していないと、大きな日記は断る（何も変えない）。 */
    await openBackup(page);
    t.check("設定に「日記を記録から外す」", (await rowTexts(page)).some((x) => x.includes("日記を記録から外す")));
    const big1 = await sealed(page, bigDays("一回目"));
    await pickDiary(page, big1);
    const refuse = dialog(page, "入りきりません");
    await refuse.waitFor({ timeout: 20000 });
    t.check("外していないと、大きな日記は断り「先に外す」と言う", (await refuse.innerText()).includes("日記を記録から外す"));
    await refuse.locator(".js-ok").click();
    await page.waitForTimeout(300);
    t.check("断ったときは何も入らない", (await memOf(page, bigDate(0))) === "");

    /* 大きなファイルの復元も、外していなければ断る。 */
    const bigFile = await page.evaluate(({ days }) => {
      const s = JSON.parse(KN.store.exportJSON());
      days.forEach(([date, memo]) => s.archive.days.push({ date, memo, wake: null, sleep: null, wakeSource: "manual", sleepSource: "manual", createdAt: null, updatedAt: null }));
      for (let i = 0; i < 60; i++) s.archive.days.push({ date: `2018-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")}`, memo: "y".repeat(10000), wake: null, sleep: null });
      return JSON.stringify(s);
    }, { days: bigDays("復元") });
    await page.locator(".js-file").setInputFiles({ name: "big.json", mimeType: "application/json", buffer: Buffer.from(bigFile) });
    const refuse2 = dialog(page, "入りきりません");
    await refuse2.waitFor();
    t.check("外していないと、記録の枠を越えるファイルの復元は断る", (await refuse2.innerText()).includes("先に「日記を記録から外す」"));
    await refuse2.locator(".js-ok").click();
    await page.waitForTimeout(300);

    /* 外す：準備する → 書き出して外す。 */
    await tapRow(page, "日記を記録から外す");
    const ask = dialog(page, "日記を記録から外しますか");
    await ask.waitFor();
    await ask.locator(".js-ok").click();
    await waitToast(page, "準備できました");
    await page.waitForTimeout(300);
    const pinned = await page.evaluate(() => KN.backup.list().some((s) => s.reason === "日記を外す前"));
    t.check("準備すると「日記を外す前」の控えが取れる", pinned);
    t.check("準備しただけでは外さない", (await liveRows(page))[A].memo === BODY[A] && !(await box(page)).out);
    t.check("「書き出して外す」が出る", (await rowTexts(page)).some((x) => x.includes("書き出して外す")));

    const dl = page.waitForEvent("download");
    await tapRow(page, "書き出して外す");
    const file = await dl;
    const saved = dialog(page, "保存できましたか");
    await saved.waitFor();
    await saved.locator(".js-ok").click();
    await waitToast(page, "日記を記録から外しました");
    await page.waitForTimeout(400);
    const fileText = fs.readFileSync(await file.path(), "utf8");
    t.check("外す前の書き出しには本文が入っている", fileText.includes(BODY[A]) && !file.suggestedFilename().includes("本文なし"), file.suggestedFilename());

    lv = await liveRows(page);
    let bx = await box(page);
    t.check("外したあと：元は印の行（本文なし）", [A, B, C].every((d) => lv[d].memo === "" && lv[d].out), JSON.stringify(lv));
    t.check("元のどこにも本文が無い", !(await liveRaw(page)).includes(BODY[B]));
    t.check("外したと、大きな保存場所に記録", !!(bx.out && bx.out.at), JSON.stringify(bx.out));
    t.check("記録の state には置かない", !(await liveRaw(page)).includes("diaryOut"));
    t.check("記憶の中は本文つき", (await memOf(page, A)) === BODY[A]);
    t.check("書き出しは本文つき（Dropbox も送れる＝印の行が記憶に無い）", await page.evaluate((M) =>
      KN.store.exportJSON().includes(M) && !KN.store.get().archive.days.some(KN.store.memoOut), BODY[C]));
    t.check("前回の書き出しとして記録", !!(await page.evaluate(() => KN.backup.lastExportAt())));
    const usage = await page.evaluate(() => document.querySelector(".set-layer:last-child").textContent);
    t.check("設定に「本文は記録から外しています」", usage.includes("本文は記録から外しています"));
    t.check("外したあとは「日記を記録に戻す」が出る", (await rowTexts(page)).some((x) => x.includes("日記を記録に戻す")));

    /* 新しく書いた本文：写しに届いてから元から外れる。 */
    await page.evaluate((D) => KN.store.setDayLog(D, { memo: "あとから書いた四日目" }), D);
    await page.waitForTimeout(900);
    lv = await liveRows(page);
    bx = await box(page);
    t.check("新しく書いた本文は写しに入り、元からは外れる", bx.rows[D] === "あとから書いた四日目" && lv[D].memo === "" && lv[D].out, JSON.stringify(lv[D]));

    /* 大きな日記（約220万字）を取り込む：写しへ先に、元は小さいまま（罠b）。 */
    await pickDiary(page, big1);
    const go = dialog(page, "日記を取り込みますか");
    await go.waitFor({ timeout: 20000 });
    await go.locator(".js-ok").click();
    await waitToast(page, "取り込みました", 30000);
    await page.waitForTimeout(1200);
    const raw1 = await liveRaw(page);
    bx = await box(page);
    t.check("大きな日記が入る（記憶）", (await memOf(page, bigDate(BIG_DAYS - 1))) === bigBody(BIG_DAYS - 1, "一回目"));
    t.check("写しに全部ある", Object.keys(bx.rows).filter((d) => d.startsWith("2019")).length === BIG_DAYS
      && bx.rows[bigDate(5)] === bigBody(5, "一回目"));
    t.check("元は小さいまま（100万字未満）", raw1.length < 1000000, `${raw1.length}`);
    t.check("保存は止まっていない", await page.evaluate(() => !KN.store.saveError()));

    /* 開き直す：写しから全部戻しても、元へ書かない（罠a）。食い違いに数えない。 */
    const fixed0 = bx.meta.fixed || 0;
    await page.reload();
    await settled(page);
    await page.waitForTimeout(800);
    const raw2 = await liveRaw(page);
    bx = await box(page);
    t.check("開き直すと、本文は写しから戻る", (await memOf(page, bigDate(7))) === bigBody(7, "一回目") && (await memOf(page, A)) === BODY[A]);
    t.check("戻した本文を元へ書かない（罠a）", raw2.length < 1000000 && !raw2.includes(BODY[A]), `${raw2.length}`);
    t.check("食い違いには数えない（外してあったので戻した）", (bx.meta.fixed || 0) === fixed0 && bx.meta.last.mode === "restored", JSON.stringify(bx.meta.last));
    await page.evaluate(() => KN.store.addTodo({ title: "外したあとのやること", due: KN.util.todayKey() }));
    await page.waitForTimeout(500);
    const raw3 = await liveRaw(page);
    t.check("ほかの記録は書ける・元は小さいまま", raw3.includes("外したあとのやること") && raw3.length < 1000000);
    await openBackup(page);
    t.check("書き戻すと枠に入らないときは「日記を記録に戻す」を出さない", !(await rowTexts(page)).some((x) => x.includes("日記を記録に戻す")));

    /* 外したあとの復元：本文を写しへ先に届けてから置き換える。 */
    const restoreText = await page.evaluate((N) => {
      const s = JSON.parse(KN.store.exportJSON());
      s.archive.days.forEach((d) => { if (String(d.date).startsWith("2019")) d.memo = d.memo.replace("一回目", "二回目"); });
      return JSON.stringify(s);
    }, BIG_DAYS);
    await page.evaluate((text) => KN.store.importBackup(text), restoreText);
    await page.waitForTimeout(1000);
    const raw4 = await liveRaw(page);
    bx = await box(page);
    t.check("外したあとの復元：写しが新しい本文になる", bx.rows[bigDate(3)] === bigBody(3, "二回目"));
    t.check("外したあとの復元：元は小さいまま・保存は止まらない", raw4.length < 1000000 && await page.evaluate(() => !KN.store.saveError()), `${raw4.length}`);

    /* 印の行のファイル（読めない日の書き出し）を戻す：いま持っている本文を当てる。 */
    const bare = await page.evaluate((K) => {
      const p = JSON.parse(localStorage.getItem(K));
      delete p.lsSeq;
      return JSON.stringify({ ...p, app: "kaimono-note", exportedAt: new Date().toISOString() });
    }, KEY);
    t.check("本文の無いファイルは inspectBackup が bare と言う", await page.evaluate((x) => KN.store.inspectBackup(x).bare, bare));
    await page.evaluate((text) => KN.store.importBackup(text), bare);
    await page.waitForTimeout(800);
    bx = await box(page);
    t.check("本文の無いファイルを戻しても、本文は残る（記憶・写し）", (await memOf(page, B)) === BODY[B] && bx.rows[B] === BODY[B]);

    t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* ================= 読めない日（案B の4・6）と、戻す ================= */
  {
    const { browser, page, errors } = await open({
      before: async (ctx) => {
        await ctx.addInitScript(() => {
          const orig = IDBFactory.prototype.open;
          IDBFactory.prototype.open = function (...a) {
            if (localStorage.getItem("__test_idb_broken")) throw new DOMException("試験で開けなくした", "UnknownError");
            return orig.apply(this, a);
          };
        });
      },
    });
    await settled(page);
    await page.evaluate((BODY) => Object.entries(BODY).forEach(([d, memo]) => KN.store.setDayLog(d, { memo })), BODY);
    await page.waitForTimeout(700);
    const prep = await page.evaluate(async () => {
      const same = await KN.diaryIdb.prepare();
      await KN.backup.take("日記を外す前", { force: true });
      const ok = await KN.diaryIdb.markOut(null);
      return { same, ok };
    });
    t.check("prepare → markOut（API）", prep.same && prep.ok, JSON.stringify(prep));
    t.check("外した", (await liveRows(page))[A].out);

    /* 写しに無い本文があると、準備は断る（何も変えない）——別の文脈で見るので、ここでは
       写しを一日だけ書き換えて、記憶と食い違わせる。 */
    await page.evaluate((A) => KN.idb.run(["diary"], "readwrite", (t) => { t.objectStore("diary").put({ date: A, memo: "写しだけ違う", at: null }); }), A);
    t.check("写しと記憶が一日でも違えば、準備は false", (await page.evaluate(() => KN.diaryIdb.prepare())) === false);
    await page.evaluate(({ A, M }) => KN.idb.run(["diary"], "readwrite", (t) => { t.objectStore("diary").put({ date: A, memo: M, at: null }); }), { A, M: BODY[A] });

    /* 読めない日。 */
    await page.evaluate(() => localStorage.setItem("__test_idb_broken", "1"));
    await page.reload();
    await settled(page);
    t.check("読めない日", await page.evaluate(() => KN.diaryIdb.body()) === "off");
    const exp0 = await page.evaluate(() => KN.backup.lastExportAt());

    await openBackup(page);
    await tapRow(page, "バックアップを保存");
    const warn = dialog(page, "日記の本文は入りません");
    await warn.waitFor();
    /* 付けた名前は a.download から見る（試験の Chromium は日本語の名前を
       「download」に置き換えて保存するので、保存された名前では見られない）。 */
    await page.evaluate(() => {
      window.__dlNames = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dlNames.push(this.download); return orig.call(this); };
    });
    const dl = page.waitForEvent("download");
    await warn.locator(".js-ok").click();
    const file = await dl;
    const named = await page.evaluate(() => window.__dlNames.join());
    t.check("読めない日の書き出しは、ファイル名に「本文なし」", named.includes("本文なし") && named.endsWith(".json"), named);
    const savedQ = dialog(page, "保存できましたか");
    await savedQ.waitFor();
    await savedQ.locator(".js-ok").click();
    await waitToast(page, "日記の本文なし");
    t.check("本文なしの書き出しは、前回の書き出しに数えない", (await page.evaluate(() => KN.backup.lastExportAt())) === exp0);
    const bareText = fs.readFileSync(await file.path(), "utf8");
    t.check("本文なしのファイルに、本文は入っていない", !bareText.includes(BODY[A]));

    await page.locator(".js-verify").setInputFiles({ name: "bare.json", mimeType: "application/json", buffer: Buffer.from(bareText) });
    const vf = dialog(page, "バックアップを確かめました");
    await vf.waitFor();
    t.check("確かめる紙も「本文が無い日」と言う", (await vf.innerText()).includes("日記の本文が無い日があります"));
    t.check("確かめても、前回の書き出しに数えない", (await page.evaluate(() => KN.backup.lastExportAt())) === exp0);
    await vf.locator(".btn").last().click();
    await page.waitForTimeout(300);

    /* 読めない日の控えは out を持つ。 */
    const snapOut = await page.evaluate(async () => {
      await KN.backup.take("自動", { force: true });
      const l = KN.backup.list();
      return l[0].out || 0;
    });
    t.check("読めない日の控えに、外した行の数（out）", snapOut >= 3, String(snapOut));

    /* 案B の6：本文の入った最後の控えは、14日を過ぎても残す。 */
    const pr = await page.evaluate(() => {
      const now = Date.now();
      const at = (days) => new Date(now - days * 86400000).toISOString();
      const list = [{ at: at(20), reason: "自動", out: 0, payload: "full" }];
      for (let i = 16; i >= 0; i--) list.push({ at: at(i), reason: "自動", out: 3, payload: "bare" + i });
      const kept = KN.backup.prune(list);
      const plain = KN.backup.prune(list.map((s) => ({ ...s, out: 0 })));
      return { full: kept.some((s) => s.payload === "full"), plain: plain.some((s) => s.payload === "full"), n: kept.length };
    });
    t.check("本文の入った最後の控えは、14日を過ぎても残す（案B の6）", pr.full, JSON.stringify(pr));
    t.check("ふだん（全部に本文がある）は、これまでどおり14日で手放す", !pr.plain, JSON.stringify(pr));

    /* 読めるようになったら、戻す。 */
    await page.evaluate(() => localStorage.removeItem("__test_idb_broken"));
    await page.reload();
    await settled(page);
    t.check("読めるようになると本文が戻る", (await memOf(page, A)) === BODY[A]);
    await openBackup(page);
    await tapRow(page, "日記を記録に戻す");
    const back = dialog(page, "日記を記録に戻しますか");
    await back.waitFor();
    await back.locator(".js-ok").click();
    await waitToast(page, "日記を記録に戻しました");
    await page.waitForTimeout(400);
    let lv = await liveRows(page);
    t.check("戻すと、元に本文がある", [A, B, C].every((d) => lv[d].memo === BODY[d] && !lv[d].out), JSON.stringify(lv));
    t.check("戻すと、外した記録が消える", !(await box(page)).out);
    await page.reload();
    await settled(page);
    await page.waitForTimeout(600);
    lv = await liveRows(page);
    t.check("戻したあと開き直しても、元に本文がある", lv[B].memo === BODY[B] && !lv[B].out);
    t.check("戻したあとは「日記を記録から外す」が出る", await (async () => { await openBackup(page); return (await rowTexts(page)).some((x) => x.includes("日記を記録から外す")); })());

    const real = errors.filter((e) => !e.includes("reading 'update'"));
    t.check("ページのエラーが無い（読めない日）", !real.length, real.join(" | "));
    await browser.close();
  }

  t.done();
})();
