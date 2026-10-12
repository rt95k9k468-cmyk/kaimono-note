/* 積み上げを一冊のノートへ（2026年10月12日。docs/thinking.md の「積み上げをやめた」。js/entries-note.js）。
   - 積み上げの無い端末は、ノートを作らず印だけ（"")
   - 前からの積み上げがあれば、起動のとき一度だけ一冊に：題「積み上げ（〜2026年10月）」、日付の古い順、
     同じ日は書いた順、頭の行は「種類『題』著者 p.・時刻から長さ・タグ」、下にメモ
   - 記録そのもの（archive.entries）は一文字も変えない。印は書けてから（設定 entriesNote＝ノートの id）
   - 読み直しても二冊目を作らない・書き直さない。印が消えても、同じ id のノートがあれば作らない
   - daily には出さない

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/entries-note.js */
const { open, checker } = require("./lib");

const EXPECT = [
  "### 2026年9月28日(月)",
  "種",
  "種のメモ",
  "",
  "### 2026年10月3日(土)",
  "読書『坊っちゃん』 夏目漱石 p.10–30・08:30から30分",
  "気づき",
  "二行目",
  "論文『ある論文』",
  "",
  "### 2026年10月5日(月)",
  "達成『引っ越し』・家",
  "学習『英単語』 25分",
].join("\n");

(async () => {
  const t = checker("entries-note");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 12, 9, 0)); },
  });
  const wait = (ms) => page.waitForTimeout(ms);
  const ID = "n-tsumiage";
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.notes && KN.notes.settled());
    await wait(500);
  };

  await page.evaluate(() => KN.notes.ready());
  await wait(300);
  const fresh = await page.evaluate((id) => ({ mark: KN.store.get().settings.entriesNote, note: !!KN.notes.get(id) }), ID);
  t.check("積み上げの無い端末はノートを作らず、印だけ", fresh.mark === "" && !fresh.note, JSON.stringify(fresh));

  /* 前からの積み上げ（日付の順を崩して足す）。印を消して、前の版から上がってきた端末にする。 */
  const before = await page.evaluate(() => {
    const S = KN.store;
    S.addEntry({ type: "done", title: "引っ越し", tags: ["家"], date: "2026-10-05" });
    S.addEntry({ type: "reading", kind: "book", title: "坊っちゃん", author: "夏目漱石", pageFrom: 10, pageTo: 30,
                 memo: "気づき\n二行目\n", minutes: 30, at: "08:30", date: "2026-10-03" });
    S.addEntry({ type: "seed", memo: "種のメモ", date: "2026-09-28" });
    S.addEntry({ type: "reading", kind: "paper", title: "ある論文", date: "2026-10-03" });
    S.addEntry({ type: "study", title: "英単語", amount: 25, unit: "分", date: "2026-10-05" });
    S.update((s) => { delete s.settings.entriesNote; });
    return JSON.stringify(S.get().archive.entries);
  });
  await wait(600);
  await reload();
  await page.waitForFunction((id) => KN.store.get().settings.entriesNote === id, ID, { timeout: 10000 }).catch(() => {});
  const got = await page.evaluate((id) => {
    const n = KN.notes.get(id);
    return { mark: KN.store.get().settings.entriesNote, title: n && n.title, body: n && n.body, at: n && n.updatedAt,
             del: n && n.deletedAt, pending: KN.notes.pending(id), entries: JSON.stringify(KN.store.get().archive.entries),
             count: KN.notes.list().filter((x) => /^積み上げ/.test(x.title)).length };
  }, ID);
  t.check("起動のとき一冊に（印はノートの id）", got.mark === ID && !!got.body && !got.del && !got.pending, JSON.stringify(got.mark));
  t.check("題は「積み上げ（〜2026年10月）」", got.title === "積み上げ（〜2026年10月）", String(got.title));
  t.check("本文：日付の古い順・同じ日は書いた順・頭の行とメモ", got.body === EXPECT, `\n${got.body}`);
  t.check("記録そのものは一文字も変えない", got.entries === before);

  await reload();
  const again = await page.evaluate((id) => ({ at: KN.notes.get(id).updatedAt,
    count: KN.notes.list().filter((x) => /^積み上げ/.test(x.title)).length }), ID);
  t.check("読み直しても二冊目を作らず、書き直さない", again.count === 1 && again.at === got.at, JSON.stringify(again));

  const lost = await page.evaluate(async (id) => {
    KN.notes.remove(id);
    KN.store.update((s) => { delete s.settings.entriesNote; });
    await KN.entriesNote.run();
    const n = KN.notes.get(id);
    return { mark: KN.store.get().settings.entriesNote, del: !!(n && n.deletedAt), count: KN.notes.list().filter((x) => /^積み上げ/.test(x.title)).length };
  }, ID);
  t.check("印が消えても、同じ id のノート（最近削除）があれば作り直さない", lost.mark === ID && lost.del && lost.count === 0, JSON.stringify(lost));

  t.check("本文を組むだけの口：空なら空", await page.evaluate(() => KN.entriesNote.text([]) === "" && KN.entriesNote.titleOf([]) === "積み上げ"));

  await page.click('.tab[data-tab="archive"]');
  await wait(600);
  t.check("daily に積み上げを出さない", await page.evaluate(() => !/坊っちゃん|引っ越し|英単語/.test(document.querySelector("#screen-archive").innerText)));

  t.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
