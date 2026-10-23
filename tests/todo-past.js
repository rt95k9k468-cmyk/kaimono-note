/* R26 の段2a：過去のやることを棚 todoPast へ写す（2026年10月23日、docs/storage.md「R26 の案」。
   js/todo-past.js）。元の形は変えない（誰も外さない）。見るもの：
     - 写すのは閉じた日が30日より前の単発だけ（くり返しの元・未完・閉じた日の無いもの・最近のものは写さない）。
       字は記憶の一件を JSON にしたものと `===`。元には全部残り、印（todoOut）は書かない
     - 直すと写し直す。足しても過去の行の並びはずらさない（罠d）。利用者が消すと棚からも消す
     - 開くたびに読み比べ：同じ・食い違いを直す・棚にだけある行は消さずに数える
     - 印（2b の形を手で作る）：棚にある行は記録へ戻して印を外す・棚に無い印は持ち越して数える・
       印の行は書いても棚から消さない（罠a）・復元のファイルの印へいまの行を当てる（罠c）・
       印があると Google の取り込みを断る（罠c）・控えは待って取れる（罠b）
     - 棚を読めない日：何も消さない・印は持ち越す。前の版（todo-past.js の無い版）で開いて消しても棚は残る */
const { open, checker } = require("./lib");

const KEY = "kaimono-note-v2";
const NOW = new Date(2026, 9, 15, 12, 30);   // 過去の線は 2026-09-15

(async () => {
  const t = checker("過去のやることの棚（R26 の段2a）");
  const { browser, ctx, page, errors } = await open({
    before: async (c, p) => {
      await c.route(/dropbox(api)?\.com/, (r) => r.abort());
      await p.clock.install({ time: NOW });
      await c.addInitScript(() => {
        // 前の版：todo-past.js を読まない／棚を読めない日：大きな保存場所を開けない
        if (sessionStorage.getItem("kn-test-idb-off") === "1") {
          IDBFactory.prototype.open = function () { throw new Error("試験：開けない"); };
        }
      });
    },
  });
  const ready = async () => {
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.liveIdb);
    await page.waitForTimeout(300);
    await page.evaluate(() => Promise.all([KN.liveIdb.ready(), KN.diaryIdb.ready(), KN.todoPast ? KN.todoPast.ready() : null]));
  };
  const idle = () => page.waitForFunction(() => !KN.todoPast || !KN.todoPast.status().busy);
  const save = async () => { await page.evaluate(() => KN.store.saveNow()); await idle(); };
  const shelf = () => page.evaluate(() => KN.idb.run(["todoPast"], "readonly", (x) => {
    const r = x.objectStore("todoPast").getAll();
    return () => Object.fromEntries((r.result || []).map((row) => [row.id, row]));
  }));
  const reopen = async (opts) => {
    await page.evaluate(() => KN.store.flush());
    await page.waitForTimeout(150);
    if (opts && opts.idbOff) await page.evaluate(() => sessionStorage.setItem("kn-test-idb-off", "1"));
    else await page.evaluate(() => sessionStorage.removeItem("kn-test-idb-off"));
    await page.reload();
    await ready();
  };
  const last = () => page.evaluate(() => KN.todoPast.status().last || {});
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
  await reopen();   // 記録は読んだ形（reconcile）で持つのがふつう
  {
    const box = await shelf();
    const mem = await page.evaluate(() => Object.fromEntries(KN.store.get().todos.map((x) => [x.id, JSON.stringify(x)])));
    t.check("写すのは過去の三つだけ", JSON.stringify(Object.keys(box).sort()) === JSON.stringify(["p1", "p2", "tr"]), Object.keys(box).join(","));
    t.check("棚の字は記憶の一件と同じ", ["p1", "p2", "tr"].every((id) => box[id] && box[id].json === mem[id]));
    t.check("棚の日は閉じた日", box.p1 && box.p1.day === "2026-08-01" && box.p2.day === "2026-07-01");
    const raw = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    t.check("元には全部残る・印は書かない", raw.todos.length === 7 && !("todoOut" in raw));
  }

  /* 直す・足す・消す。 */
  await page.evaluate(() => KN.store.update((s) => { s.todos.find((x) => x.id === "p1").memo = "二"; }));
  await save();
  t.check("直すと写し直す", JSON.parse((await shelf()).p1.json).memo === "二");
  {
    const before = await page.evaluate(() => Object.fromEntries(KN.store.get().todos.map((x) => [x.id, x.order])));
    await page.evaluate(() => KN.store.addTodo({ title: "新しい" }));
    await save();
    const after = await page.evaluate(() => Object.fromEntries(KN.store.get().todos.map((x) => [x.id, x.order])));
    t.check("足しても過去の行の並びはずらさない", ["p1", "p2", "tr"].every((id) => after[id] === before[id]), JSON.stringify(after));
    t.check("ほかの行はこれまでどおりずらす", ["rp", "op", "nd", "rc"].every((id) => after[id] === before[id] + 1), JSON.stringify(after));
  }
  await page.evaluate(() => KN.store.removeTodo("p2"));
  await save();
  t.check("利用者が消すと棚からも消す", !(await shelf()).p2);

  /* 開くたびに読み比べ。 */
  await reopen();
  {
    const l = await last();
    t.check("開き直すと全部同じ", l.same === 2 && l.fixed === 0 && l.added === 0 && l.orphan === 0, JSON.stringify(l));
    t.check("開いた回数を数える", (await page.evaluate(() => KN.todoPast.status().opens)) === 3);
  }
  await page.evaluate(() => KN.idb.run(["todoPast"], "readwrite", (x) => {
    const b = x.objectStore("todoPast");
    b.put({ id: "p1", day: "2026-08-01", json: "{\"id\":\"p1\",\"title\":\"古い\"}" });
    b.put({ id: "zz", day: "2026-05-01", json: JSON.stringify({ id: "zz", title: "棚にだけ", done: true, doneAt: "2026-05-01T03:00:00.000Z" }) });
  }));
  await reopen();
  {
    const l = await last();
    const box = await shelf();
    const mem = await page.evaluate(() => JSON.stringify(KN.store.get().todos.find((x) => x.id === "p1")));
    t.check("食い違いは記憶で直す", l.fixed === 1 && box.p1.json === mem, JSON.stringify(l));
    t.check("棚にだけある行は消さずに数える", l.orphan === 1 && !!box.zz, JSON.stringify(l));
    t.check("棚にだけある行は記録へ戻さない", !(await page.evaluate(() => KN.store.getTodo("zz"))));
  }
  await page.evaluate(() => KN.store.addTodo({ title: "もう一つ" }));
  await save();
  t.check("書いても棚にだけある行は消えない", !!(await shelf()).zz);

  /* 印（2b の形を手で作る）：zz は棚にある・gone は棚にも無い。 */
  await page.evaluate((k) => {
    KN.store.flush();
    const raw = JSON.parse(localStorage.getItem(k));
    delete raw.lsSeq;
    raw.todoOut = ["zz", "gone"];
    localStorage.setItem(k, JSON.stringify(raw));
  }, KEY);
  await reopen();
  {
    const l = await last();
    const s = await page.evaluate(() => ({ zz: !!KN.store.getTodo("zz"), out: KN.store.todoOut(), n: KN.store.countsOf().todos, len: KN.store.get().todos.length }));
    t.check("棚にある印の行は記録へ戻る", s.zz && l.back === 1, JSON.stringify(l));
    t.check("棚に無い印は持ち越して数える", JSON.stringify(s.out) === "[\"gone\"]" && l.missing === 1, JSON.stringify(s));
    t.check("記録の数は印も数える", s.n === s.len + 1, JSON.stringify(s));
    const raw = await page.evaluate((k) => { KN.store.saveNow(); return JSON.parse(localStorage.getItem(k)); }, KEY);
    t.check("元へも印を持ち越す", JSON.stringify(raw.todoOut) === "[\"gone\"]");
  }
  // 印の行を記録から外しても、棚からは消さない（罠a）。
  await page.evaluate(() => KN.store.update((s) => {
    s.todos = s.todos.filter((x) => x.id !== "tr");
    s.todoOut = [...(s.todoOut || []), "tr"];
  }));
  await save();
  t.check("印の行は書いても棚から消さない", !!(await shelf()).tr);
  // 復元のファイルの印へ、いまの行を当てる（罠c）。
  {
    const r = await page.evaluate(() => {
      const S = KN.store;
      const file = JSON.parse(JSON.stringify(S.get()));
      file.schema = 2;
      file.todos = file.todos.filter((x) => x.id !== "p1");
      file.todoOut = [...(file.todoOut || []), "p1"];
      S.importJSON(JSON.stringify(file));
      return { p1: !!S.getTodo("p1"), out: S.todoOut() };
    });
    t.check("復元のファイルの印へ、いまの行を当てる", r.p1 && r.out.includes("gone") && !r.out.includes("p1"), JSON.stringify(r));
  }
  // 印があるあいだ：Google の取り込みを断る・控えは待って取れる（罠b・c）。
  {
    const r = await page.evaluate(async () => {
      KN.store.update((s) => { s.todos.push({ ...s.todos[0], id: "gb", gbatch: "2026-10-01T00:00:00.000Z", title: "取り込んだ" }); });
      await KN.googleImport.undo();
      return { kept: !!KN.store.getTodo("gb"), dialog: !!document.querySelector(".sheet.is-open, dialog[open]") };
    });
    t.check("印があると取り込みの取り消しを断る", r.kept && !r.dialog, JSON.stringify(r));
    const took = await page.evaluate(() => Promise.race([
      KN.backup.take("試験", { force: true }).then(() => "took", () => "took"),
      new Promise((res) => setTimeout(() => res("hung"), 8000)),
    ]));
    t.check("印があっても控えは取れる", took === "took", took);
  }

  /* 棚を読めない日：何も消さない・印は持ち越す。 */
  await reopen({ idbOff: true });
  {
    const st = await page.evaluate(() => KN.todoPast.status());
    t.check("読めない日は off", st.phase === "off", JSON.stringify(st));
    await page.evaluate(() => KN.store.removeTodo("p1"));
    await page.evaluate(() => KN.store.saveNow());
    const raw = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    t.check("読めない日も印は持ち越す", Array.isArray(raw.todoOut) && raw.todoOut.includes("gone") && raw.todoOut.includes("tr"));
  }
  await reopen();
  {
    const box = await shelf();
    const l = await last();
    t.check("読めない日に消した行は、棚に残る（数えるだけ）", !!box.p1 && l.orphan >= 1, JSON.stringify(l));
    t.check("読めた日に印の行が戻る", !!(await page.evaluate(() => KN.store.getTodo("tr"))));
  }

  /* 前の版（todo-past.js の無い版）で開いて消しても、棚は残る。今の版で開き直すと数える。 */
  await page.route(/\/js\/todo-past\.js(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await reopen();
  {
    const has = await page.evaluate(() => !!KN.todoPast);
    t.check("前の版は棚を知らない", !has);
    const n = await page.evaluate(() => KN.store.get().todos.length);
    t.check("前の版で開いても行は見える", n >= 6, String(n));
    await page.evaluate(() => { KN.store.update((s) => { s.todos = s.todos.filter((x) => x.id !== "rc"); }); KN.store.saveNow(); });
  }
  await page.unroute(/\/js\/todo-past\.js(\?.*)?$/);
  await reopen();
  {
    const st = await page.evaluate(() => KN.todoPast.status());
    t.check("今の版で開き直すと on", st.phase === "on", JSON.stringify(st));
    t.check("困ったときの記録に一行", /^todoPast \{/.test(await page.evaluate(() => KN.todoPast.text())));
  }

  /* 棚だけ消える：記録はそのまま、開き直すと写し直す。 */
  {
    const n0 = await page.evaluate(() => KN.store.get().todos.length);
    await page.evaluate(() => KN.idb.run(["todoPast"], "readwrite", (x) => { x.objectStore("todoPast").clear(); }));
    await reopen();
    const l = await last();
    const n1 = await page.evaluate(() => KN.store.get().todos.length);
    t.check("棚だけ消えても記録はそのまま", n1 === n0, `${n0} → ${n1}`);
    t.check("棚だけ消えたら写し直す", l.added >= 1 && l.fixed === 0 && Object.keys(await shelf()).length === l.added, JSON.stringify(l));
  }

  t.check("エラーが出ない", errors.length === 0, errors.join("\n"));
  await browser.close();
  void ctx;
  t.done();
})().catch((err) => { console.error(err); process.exit(1); });
