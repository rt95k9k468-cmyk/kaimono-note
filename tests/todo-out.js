/* R26 の段2b：過去のやることを記録から外す（2026年10月26日、docs/storage.md「R26 の案」。js/todo-past.js）。見るもの：
     - 設定「過去のやることを記録から外す」→ 準備する（読み比べ・控え「やることを外す前」）→「書き出して外す」→
       保存できたら外す（大きな保存場所の meta の todoOut に記録。state には置かない）
     - 外したあと：元には過去の行が無く、id は印（todoOut）に。記憶・書き出しは全件
     - 直した過去の行・新しく過去になった行は、棚に届いてから元から外れる。消した行は棚からも消える
     - 開き直すと棚から戻る（食い違いに数えない）。元は外したまま
     - 外したあとの復元は、過去の行を棚へ先に届けてから置き換える（罠e）
     - 棚を読めない日：印は持ち越す・書き出しは紙「一部が入りません」→ ファイル名「一部なし」・確かめると言う・
       設定の頭に一行
     - 「過去のやることを記録に戻す」で元に全件が戻り、外した記録が消える */
const fs = require("fs");
const { open, checker } = require("./lib");

const KEY = "kaimono-note-v2";
const NOW = new Date(2026, 9, 15, 12, 30);   // 過去の線は 2026-09-15

(async () => {
  const t = checker("過去のやることを記録から外す（R26 の段2b）");
  const { browser, ctx, page, errors } = await open({
    before: async (c, p) => {
      await c.route(/dropbox(api)?\.com/, (r) => r.abort());
      await p.clock.install({ time: NOW });
      await c.addInitScript(() => {
        if (sessionStorage.getItem("kn-test-idb-off") === "1") {
          IDBFactory.prototype.open = function () { throw new Error("試験：開けない"); };
        }
      });
    },
  });
  const ready = async () => {
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.liveIdb && KN.todoPast);
    await page.waitForTimeout(300);
    await page.evaluate(() => Promise.all([KN.liveIdb.ready(), KN.diaryIdb.ready(), KN.todoPast.ready()]));
  };
  const idle = () => page.waitForFunction(() => !KN.todoPast.status().busy);
  const save = async () => { await page.evaluate(() => KN.store.saveNow()); await idle(); };
  const raw = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const liveIds = async () => (await raw()).todos.map((x) => x.id).sort().join(",");
  const marks = async () => ((await raw()).todoOut || []).slice().sort().join(",");
  const box = () => page.evaluate(() => KN.idb.run(["todoPast", "meta"], "readonly", (x) => {
    const r = x.objectStore("todoPast").getAll();
    const o = x.objectStore("meta").get("todoOut");
    return () => ({
      rows: Object.fromEntries((r.result || []).map((row) => [row.id, row])),
      out: o.result ? o.result.v : null,
    });
  }));
  const reopen = async (opts) => {
    await page.evaluate(() => KN.store.flush());
    await page.waitForTimeout(150);
    if (opts && opts.idbOff) await page.evaluate(() => sessionStorage.setItem("kn-test-idb-off", "1"));
    else await page.evaluate(() => sessionStorage.removeItem("kn-test-idb-off"));
    await page.reload();
    await ready();
  };
  /* 元が外した形に書き直されるのを待つ（届いたあと saveSoon）。 */
  const liveLacks = (ids) => page.waitForFunction(({ k, ids }) => {
    const p = JSON.parse(localStorage.getItem(k) || "null");
    return !!p && ids.every((id) => !p.todos.some((x) => x.id === id) && (p.todoOut || []).includes(id));
  }, { k: KEY, ids }, { timeout: 10000 }).then(() => true, () => false);
  const waitToast = (text) => page.waitForFunction(
    (s) => [...document.querySelectorAll(".toast-msg")].some((e) => e.textContent.includes(s)), text, { timeout: 20000 });
  const dialog = (text) => page.locator(".sheet, [role=dialog]", { hasText: text }).last();
  const rowTexts = () => page.locator(".set-layer:last-child .set-row").allTextContents();
  const tapRow = (text) => page.locator(".set-layer:last-child .set-row", { hasText: text }).first().click();
  const openBackup = async () => {
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
    await page.waitForTimeout(250);
    await tapRow("バックアップ");
    await page.waitForTimeout(400);
  };
  const rootTexts = async () => {
    await page.evaluate(() => KN.app.showScreen("archive"));
    await page.waitForTimeout(200);
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
    await page.waitForTimeout(250);
    return page.locator(".set-layer:first-child .set-row").allTextContents();
  };
  await ready();

  /* 記録：過去になるもの三つ（済ませた・片づけた・くり返しのやった記録）と、ならないもの。 */
  await page.evaluate(() => {
    const S = KN.store;
    S.reset();
    const base = (id, o) => ({ id, title: "試験 " + id, createdAt: "2026-06-01T00:00:00.000Z", ...o });
    S.update((s) => {
      s.todos = [
        base("p1", { done: true, doneAt: "2026-08-01T03:00:00.000Z", order: 5, memo: "一" }),
        base("p2", { archived: true, archivedAt: "2026-07-01T03:00:00.000Z", order: 6 }),
        base("tr", { done: true, doneAt: "2026-08-15T03:00:00.000Z", due: "2026-08-15", trace: true, order: 7 }),
        base("rp", { repeat: "daily", due: "2026-10-15", done: true, doneAt: "2026-08-01T03:00:00.000Z", order: 1 }),
        base("op", { due: "2026-08-01", order: 2 }),
        base("nd", { done: true, doneAt: null, order: 3 }),
        base("rc", { done: true, doneAt: "2026-10-10T03:00:00.000Z", order: 4 }),
      ];
    });
  });
  await save();
  await reopen();

  /* ---- 外す：準備する → 書き出して外す ---- */
  await openBackup();
  t.check("設定に「過去のやることを記録から外す」", (await rowTexts()).some((x) => x.includes("過去のやることを記録から外す")));
  await tapRow("過去のやることを記録から外す");
  const ask = dialog("過去のやることを記録から外しますか");
  await ask.waitFor();
  await ask.locator(".js-ok").click();
  await waitToast("準備できました");
  await page.waitForTimeout(300);
  t.check("準備すると「やることを外す前」の控えが取れる",
    await page.evaluate(() => KN.backup.list().some((s) => s.reason === "やることを外す前")));
  t.check("準備しただけでは外さない", (await liveIds()) === "nd,op,p1,p2,rc,rp,tr" && !(await box()).out);
  t.check("「書き出して外す」が出る", (await rowTexts()).some((x) => x.includes("書き出して外す")));

  const dl = page.waitForEvent("download");
  await tapRow("書き出して外す");
  const file = await dl;
  const ok = dialog("保存できましたか");
  await ok.waitFor();
  await ok.locator(".js-ok").click();
  await waitToast("過去のやることを記録から外しました");
  await page.waitForTimeout(400);
  {
    const text = fs.readFileSync(await file.path(), "utf8");
    t.check("外す前の書き出しには過去の行が入っている", text.includes("試験 p1") && !file.suggestedFilename().includes("一部なし"), file.suggestedFilename());
    const r = await raw();
    const b = await box();
    t.check("外したあと：元に過去の行が無い", (await liveIds()) === "nd,op,rc,rp", await liveIds());
    t.check("外した id は元の印に", (await marks()) === "p1,p2,tr", await marks());
    t.check("外したと、大きな保存場所に記録", !!(b.out && b.out.at && b.out.exportedAt), JSON.stringify(b.out));
    t.check("記録の state には置かない", !JSON.stringify(r).includes("exportedAt"));
    const mem = await page.evaluate(() => ({ n: KN.store.get().todos.length, out: KN.store.todoOut().length, ex: KN.store.exportJSON() }));
    t.check("記憶は全件・印なし（控え・Dropbox は待たずに全件）", mem.n === 7 && mem.out === 0, JSON.stringify({ n: mem.n, out: mem.out }));
    t.check("書き出しは全件", mem.ex.includes("試験 tr") && !mem.ex.includes("todoOut"));
    t.check("外したあとは「過去のやることを記録に戻す」が出る", (await rowTexts()).some((x) => x.includes("過去のやることを記録に戻す")));
    t.check("困ったときの記録に外したと出る", (await page.evaluate(() => KN.todoPast.text())).includes("\"isOut\":true"));
  }

  /* ---- 外したあと：直す・新しく過去になる・消す ---- */
  /* 書いた瞬間は棚に届いていないので元にも書き、届いたら書き直して外す。 */
  const inLive = (id) => page.evaluate(({ k, id }) => JSON.parse(localStorage.getItem(k)).todos.some((x) => x.id === id), { k: KEY, id });
  await page.evaluate(() => { KN.store.updateTodo("p1", { memo: "二" }); KN.store.saveNow(); });
  t.check("直した過去の行は、届く前は元にも書く", await inLive("p1"));
  t.check("直した過去の行は、棚に届いてから元から外れる", await liveLacks(["p1"]));
  t.check("棚は直した字", JSON.parse((await box()).rows.p1.json).memo === "二");
  await page.evaluate(() => {
    KN.store.update((s) => { const x = s.todos.find((y) => y.id === "op"); x.done = true; x.doneAt = "2026-08-02T03:00:00.000Z"; });
    KN.store.saveNow();
  });
  t.check("新しく過去になった行は、届く前は元に", await inLive("op"));
  t.check("新しく過去になった行も、棚に届いてから外れる", await liveLacks(["op"]) && !!(await box()).rows.op);
  await page.evaluate(() => KN.store.removeTodo("p2"));
  await save();
  await page.waitForTimeout(300);
  t.check("消した過去の行は棚からも印からも消える", !(await box()).rows.p2 && !(await marks()).includes("p2"), await marks());

  /* ---- 開き直す：棚から戻る。元は外したまま ---- */
  await reopen();
  {
    const st = await page.evaluate(() => ({ s: KN.todoPast.status(), p1: (KN.store.getTodo("p1") || {}).memo, out: KN.store.todoOut().length }));
    t.check("開き直すと棚から戻る", st.p1 === "二" && st.out === 0 && st.s.last.back === 3, JSON.stringify(st.s.last));
    t.check("戻したのは食い違いに数えない", st.s.last.fixed === 0 && st.s.last.added === 0, JSON.stringify(st.s.last));
    await page.evaluate(() => KN.store.saveNow());
    await page.waitForTimeout(300);
    t.check("開き直しても元は外したまま", (await liveIds()) === "nd,rc,rp" && (await marks()) === "op,p1,tr", `${await liveIds()} / ${await marks()}`);
  }

  /* ---- 外したあとの復元：棚へ先に届けてから（罠e） ---- */
  {
    const text = await page.evaluate(() => {
      const s = JSON.parse(KN.store.exportJSON());
      for (let i = 0; i < 40; i++) {
        s.todos.push({ id: `q${i}`, title: `戻す ${i}`, createdAt: "2026-05-01T00:00:00.000Z", done: true, doneAt: "2026-07-10T03:00:00.000Z", order: 100 + i, memo: "z".repeat(500) });
      }
      return JSON.stringify(s);
    });
    const r = await page.evaluate((x) => KN.store.inspectBackup(x), text);
    t.check("確かめると、過去の行の字数が分かる", r.ok && r.past > 40 * 500 && !r.pastBare, JSON.stringify({ past: r.past, bare: r.pastBare }));
    await page.evaluate((x) => KN.store.importBackup(x), text);
    await idle();
    await page.waitForTimeout(400);
    const b = await box();
    const lv = await raw();
    t.check("復元した過去の行は棚にある", Array.from({ length: 40 }, (_, i) => `q${i}`).every((id) => !!b.rows[id]));
    t.check("復元しても元には書かない", !lv.todos.some((x) => /^q/.test(x.id)) && (lv.todoOut || []).includes("q39"), String(lv.todos.length));
    t.check("記憶には入る", await page.evaluate(() => !!KN.store.getTodo("q0") && !!KN.store.getTodo("p1")));
  }

  /* ---- 棚を読めない日 ---- */
  await reopen({ idbOff: true });
  {
    const st = await page.evaluate(() => ({ phase: KN.todoPast.status().phase, p1: !!KN.store.getTodo("p1"), out: KN.store.todoOut().length }));
    t.check("読めない日は off・外した行は記憶に無い", st.phase === "off" && !st.p1 && st.out >= 43, JSON.stringify(st));
    await page.evaluate(() => KN.store.updateTodo("rc", { memo: "読めない日に書いた" }));
    await page.evaluate(() => KN.store.saveNow());
    t.check("読めない日も印は持ち越す", (await marks()).split(",").length >= 43 && !(await liveIds()).includes("p1"));
    t.check("設定の頭に一行", (await rootTexts()).some((x) => x.includes("過去のやることを読めません")));
    await tapRow("バックアップ");
    await page.waitForTimeout(400);
    t.check("読めない日は外す・戻すを出さない", !(await rowTexts()).some((x) => x.includes("過去のやることを記録")));
    await tapRow("バックアップを保存");
    const bare = dialog("一部が入りません");
    await bare.waitFor();
    /* 付けた名前は a.download から見る（試験の Chromium は日本語の名前を「download」にする）。 */
    await page.evaluate(() => {
      window.__dlNames = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dlNames.push(this.download); return orig.call(this); };
    });
    const dl2 = page.waitForEvent("download");
    await bare.locator(".js-ok").click();
    const f2 = await dl2;
    const named = await page.evaluate(() => window.__dlNames.join());
    t.check("書き出しのファイル名に「一部なし」", named.includes("一部なし") && named.endsWith(".json"), named);
    const saved = dialog("保存できましたか");
    await saved.waitFor();
    const before = await page.evaluate(() => KN.backup.lastExportAt());
    await saved.locator(".js-ok").click();
    await page.waitForTimeout(300);
    t.check("前回の書き出しに数えない", (await page.evaluate(() => KN.backup.lastExportAt())) === before);
    const r = await page.evaluate((x) => KN.store.inspectBackup(x), fs.readFileSync(await f2.path(), "utf8"));
    t.check("確かめると「入っていない過去のやること」", r.ok && r.pastBare);
  }

  /* ---- 読めた日：戻す ---- */
  await reopen();
  await openBackup();
  t.check("読めた日は頭の一行が消える", !(await rootTexts()).some((x) => x.includes("過去のやること")));
  await tapRow("バックアップ");
  await page.waitForTimeout(400);
  await tapRow("過去のやることを記録に戻す");
  const back = dialog("過去のやることを記録に戻しますか");
  await back.waitFor();
  await back.locator(".js-ok").click();
  await waitToast("過去のやることを記録に戻しました");
  await page.waitForTimeout(300);
  {
    const lv = await raw();
    t.check("戻すと元に全件", lv.todos.some((x) => x.id === "p1") && lv.todos.some((x) => x.id === "q39") && !lv.todoOut, String(lv.todos.length));
    t.check("戻すと外した記録が消える", !(await box()).out);
    t.check("読めない日に書いたものも残る", (await page.evaluate(() => (KN.store.getTodo("rc") || {}).memo)) === "読めない日に書いた");
    await reopen();
    t.check("戻したあと開き直しても元に全件", (await raw()).todos.some((x) => x.id === "tr"));
  }

  t.check("エラーが出ない", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((err) => { console.error(err); process.exit(1); });
