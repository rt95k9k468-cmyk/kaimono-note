/* 3.0 の受け皿（docs/roadmap-3.0.md の T0、2026年10月6日）。

   reconcile() は やること を知っている欄だけで組み直すので、新しい欄は書く画面より先に
   受け皿だけ出す。ここでは画面は見ない。見るのは：
   - 欄の無い古い保存がそのまま読める（既定に落ち、act は足さない・積み上げに欄を足さない）
   - 新しい欄が保存と読み直しをまたいで残る
   - 崩れた値は既定に落ちる
   （restore-practice.js も合わせて回す）

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/shelf-base.js */
const { open, checker } = require("./lib");

const FAR = "2099-01-10";
const slips = Array.from({ length: 25 }, (_, i) => ({
  on: `2099-01-${String(i + 1).padStart(2, "0")}`, from: "2099-01-01", time: "09:00", how: "hand",
}));
const SAVED = {
  todos: [
    { id: "t-old", title: "古い用事", due: FAR, createdAt: "2026-09-01" },
    { id: "t-new", title: "新しい用事", due: null, createdAt: "2026-09-01",
      act: { type: "study", entry: "e-new", note: "n1" }, shelf: "wait", waitFor: "返事",
      review: "2099-02-01", slips: slips.slice(0, 2), editedAt: "2026-10-01T09:00:00.000Z" },
    { id: "t-bad", title: "崩れた用事", due: null, createdAt: "2026-09-01",
      act: { type: "bogus" }, shelf: "later", waitFor: "あ".repeat(40), review: "来週",
      slips: [{ on: "x", how: "hand" }, { on: "2099-01-01", how: "nope" }, ...slips], editedAt: "nope" },
    { id: "t-due", title: "日のある用事", due: FAR, createdAt: "2026-09-01",
      shelf: "someday", act: { type: "reading", entry: 5 } },
  ],
  archive: {
    entries: [
      { id: "e-old", type: "done", title: "古い記録", date: "2026-09-01" },
      { id: "e-new", type: "study", title: "新しい記録", date: "2026-09-02",
        minutes: 45, at: "07:30", todo: "t-new", note: "n1" },
      { id: "e-bad", type: "study", title: "崩れた記録", date: "2026-09-03",
        minutes: 7, at: "25:00", todo: "", note: 3 },
      { id: "e-bad2", type: "study", title: "崩れた記録2", date: "2026-09-04", minutes: "abc" },
    ],
    days: [],
  },
};

(async () => {
  const t = checker("受け皿（T0）");
  const { browser, page, errors } = await open({
    before: (ctx) => ctx.addInitScript((raw) => {
      if (!localStorage.getItem("kaimono-note-v2")) localStorage.setItem("kaimono-note-v2", raw);
    }, JSON.stringify(SAVED)),
  });

  const read = () => page.evaluate(() => {
    const s = KN.store.get();
    const pick = (id) => s.todos.find((x) => x.id === id);
    const ent = (id) => s.archive.entries.find((x) => x.id === id);
    return {
      old: pick("t-old"), nw: pick("t-new"), bad: pick("t-bad"), due: pick("t-due"),
      eOld: ent("e-old"), eNew: ent("e-new"), eBad: ent("e-bad"), eBad2: ent("e-bad2"),
      n: s.todos.length, ne: s.archive.entries.length,
    };
  });

  const a = await read();
  t.check("古い保存が全部読める", a.n === 4 && a.ne === 4, `${a.n} ${a.ne}`);
  t.check("古い用事は既定に落ちる",
    a.old.shelf === null && a.old.waitFor === null && a.old.review === null &&
    Array.isArray(a.old.slips) && a.old.slips.length === 0 && a.old.editedAt === null, JSON.stringify(a.old));
  t.check("古い用事に act を足さない", !("act" in a.old));
  t.check("古い用事の中身はそのまま", a.old.title === "古い用事" && a.old.due === FAR);
  t.check("古い記録に欄を足さない", !["minutes", "at", "todo", "note"].some((k) => k in a.eOld), JSON.stringify(a.eOld));

  const keepNew = (x) => x.shelf === "wait" && x.waitFor === "返事" && x.review === "2099-02-01" &&
    x.editedAt === "2026-10-01T09:00:00.000Z" && x.slips.length === 2 && x.slips[1].on === "2099-01-02" &&
    x.act && x.act.type === "study" && x.act.entry === "e-new" && x.act.note === "n1";
  const keepEntry = (e) => e.minutes === 45 && e.at === "07:30" && e.todo === "t-new" && e.note === "n1";
  t.check("新しい欄を読む", keepNew(a.nw), JSON.stringify(a.nw));
  t.check("積み上げの新しい欄を読む", keepEntry(a.eNew), JSON.stringify(a.eNew));

  t.check("知らない shelf は null", a.bad.shelf === null);
  t.check("waitFor は30字まで", a.bad.waitFor === "あ".repeat(30));
  t.check("読めない review は null", a.bad.review === null);
  t.check("読めない editedAt は null", a.bad.editedAt === null);
  t.check("知らない種類の act は欄ごと落とす", !("act" in a.bad));
  t.check("崩れた控えは捨て、新しい20件まで",
    a.bad.slips.length === 20 && a.bad.slips[0].on === "2099-01-06" && a.bad.slips[19].on === "2099-01-25",
    JSON.stringify(a.bad.slips.map((x) => x.on)));
  t.check("日のある用事は待つ・いつかに居ない", a.due.shelf === null && a.due.due === FAR);
  t.check("act の崩れた id は null", a.due.act && a.due.act.type === "reading" && a.due.act.entry === null);
  t.check("積み上げの崩れた値は null（分は5きざみ）",
    a.eBad.minutes === 5 && a.eBad.at === null && a.eBad.todo === null && a.eBad.note === null &&
    a.eBad2.minutes === null, JSON.stringify([a.eBad, a.eBad2]));

  /* 保存して読み直しても残る（ほかの用事を直して書かせる） */
  await page.evaluate(() => KN.store.update((s) => { s.todos.find((x) => x.id === "t-old").memo = "書いた"; }));
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kaimono-note-v2")));
  const sNew = stored.todos.find((x) => x.id === "t-new");
  t.check("保存に新しい欄が乗る", keepNew(sNew), JSON.stringify(sNew));
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.waitForTimeout(300);
  const b = await read();
  t.check("読み直しても新しい欄が残る", keepNew(b.nw) && keepEntry(b.eNew), JSON.stringify(b.nw));
  t.check("読み直しても書いたものが残る", b.old.memo === "書いた" && b.n === 4 && b.ne === 4);

  t.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
