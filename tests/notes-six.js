/* ノートを6つに分ける（docs/notes.md「6つの棚」）。

   表のとおりに冊と親だけ付け替える（本文・作った日・直した日は動かない）／子は親の冊についていく／
   授業7つは teaching の一番上・【自身の保険・投資について】は living／Evernote の5冊は題に「(Evernote)」／
   reading に空の「論文」を一つ作り中へ／冊の並びは6つが頭／前の整理の記録は戻すと戻る／
   戻すと冊・親・題・並びが元どおり・作った「論文」は消した印／二度目は分けるものが無い／
   設定の行（分ける → 戻す）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-six.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-six");
  const { browser, page, errors } = await open();

  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on");
  await page.evaluate(async () => {
    let i = 0;
    const L = [];
    const mk = (title, notebook, parent, extra) => {
      i += 1;
      const at = `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`;
      const n = Object.assign({ id: `n-t${i}`, title, body: `本文${i}`, notebook, tags: [], fav: false,
        createdAt: at, updatedAt: at, deletedAt: null }, parent ? { parent } : {}, extra || {});
      L.push(n);
      return n.id;
    };
    const old = { at: "2026-10-13T00:00:00.000Z", nb: "Notion" };
    const pw = mk("🔸philosophy&work", "Notion", null, { org: old });
    mk("【語彙】", "Notion", pw);
    const kids = mk("【子どもの様子】", "Notion", pw);
    mk("★R7.六年生の三人との一年間", "Notion", kids);
    const edu = mk("【教育全般】", "Notion", pw);
    ["授業【国語】", "授業【算数】", "活動【社会見学】", "授業【自立活動】", "授業【体育】", "授業【総合】"].forEach((x) => mk(x, "Notion", edu));
    const sp = mk("授業【特別活動】", "Notion", edu);
    mk("スマホ・情報モラル", "Notion", sp);
    mk("板書の構想", "Notion", edu);
    const ling = mk("【言語学】", "Notion", pw);
    mk("【用法基盤モデル】", "Notion", ling);
    const ldb = mk("【learningDB】", "Notion", null);
    mk("『Deep skill』石川明", "Notion", ldb);
    const ins = mk("【自身の保険・投資について】", "Notion", ldb);
    mk("投資哲学", "Notion", ins);
    const whole = mk("全体構想", "Notion", null);
    mk("言語学領域と1-6年単元の対応表", "Notion", whole);
    mk("A30歳anniversaryディナー候補", "private", null);
    const msg = mk("✉️Messages✉️", "private", null);
    mk("思いやりとは", "private", msg);
    mk("2026, 生成AIで変わる言語教育の未来", "論文", null);
    mk("【国語】初発の考えからの単元計画", "論文", null);
    const study = mk("学習用", "Evernote", null, { org: { at: "2026-10-12T00:00:00.000Z", made: true } });
    mk("B", "Evernote", study);
    ["教員職務", "教採対策", "思考", "修士論文"].forEach((x) => mk(x, "Evernote", null));
    L.push({ id: "n-tsumiage", title: "積み上げ（〜2026年10月）", body: "x", notebook: "Evernote", tags: [], fav: false,
      createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z", deletedAt: null });
    ["アファーマティブアクションについて", "一日ひとつの成長を", "メタファーの遍在性", "学びのモジュール化", "拾い物言説",
      "能力主義を超えて", "【もっと学びたいこと】", "読みたい本"].forEach((x) => mk(x, "思考・読書", null));
    const done = mk("読了まとめ", "思考・読書", null);
    mk("1984 (角川文庫)", "思考・読書", done);
    mk("無題のノート", "Evernote", mk("思考の中", "Evernote", null));
    await KN.notes.addMany(L);
  });
  const snap = () => page.evaluate(() => KN.notes.list().concat(KN.notes.trash())
    .map((n) => ({ id: n.id, title: n.title, body: n.body, notebook: n.notebook, parent: n.parent || "", pos: n.pos || "",
      createdAt: n.createdAt, updatedAt: n.updatedAt, deletedAt: n.deletedAt || null, org: JSON.stringify(n.org || null) }))
    .sort((a, b) => a.id.localeCompare(b.id)));
  const before = await snap();

  const p = await page.evaluate(() => { const p = KN.noteOrganize.sixPlan(); return { moved: p.moved, missing: p.missing, by: p.by }; });
  t.check("見つからないものは無い", p.missing.length === 0, p.missing.join(" / "));
  t.check("6つの冊に数が出る", Object.keys(p.by).join() === "thinking,reading,teaching,learning,living,archive", JSON.stringify(p.by));
  await page.evaluate(() => KN.noteOrganize.sixApply(KN.noteOrganize.sixPlan()));

  const r = await page.evaluate(() => {
    const t = KN.notes.tree();
    const g = (id) => KN.notes.get(id);
    const byT = (title) => KN.notes.list().find((n) => n.title === title);
    const tops = (nb) => t.tops(nb).map((n) => n.title);
    const paper = byT("論文");
    return {
      books: KN.notes.notebooks().slice(0, 6).join(),
      thinking: tops("thinking").join(), reading: tops("reading").join(), teaching: tops("teaching").join(),
      learning: tops("learning").join(), living: tops("living").join(), archive: tops("archive").join(),
      deep: [g("n-t4").notebook, g("n-t4").parent, g("n-t13").notebook, g("n-t13").parent].join(),
      edu: t.kids("n-t5").map((n) => n.title).join(),
      paper: paper ? [paper.notebook, paper.body, t.kids(paper.id).map((n) => n.title).join()].join("|") : "",
      ins: [g("n-t19").notebook, g("n-t19").parent || "", g("n-t20").notebook].join(),
      pw: [g("n-t1").notebook, t.kids("n-t1").length].join(),
      left: KN.notes.notebooks().filter((nb) => KN.noteOrganize.SHELVES.indexOf(nb) < 0).join(),
    };
  });
  t.check("冊の並びは6つが頭", r.books === "thinking,reading,teaching,learning,living,archive", r.books);
  t.check("thinking", r.thinking === "アファーマティブアクションについて,一日ひとつの成長を,メタファーの遍在性,学びのモジュール化,拾い物言説,能力主義を超えて", r.thinking);
  t.check("reading（論文は終わり）", r.reading === "読了まとめ,読みたい本,論文", r.reading);
  t.check("teaching：授業7つは一番上", r.teaching === "【子どもの様子】,【教育全般】,授業【国語】,授業【算数】,活動【社会見学】,授業【自立活動】,授業【特別活動】,授業【体育】,授業【総合】", r.teaching);
  t.check("【教育全般】には板書の構想だけ残る", r.edu === "板書の構想", r.edu);
  t.check("learning", r.learning === "【語彙】,【言語学】,【learningDB】,【もっと学びたいこと】", r.learning);
  t.check("living（保険・投資も）", r.living === "A30歳anniversaryディナー候補,✉️Messages✉️,【自身の保険・投資について】", r.living);
  t.check("archive：Evernote の5冊は題に (Evernote)", r.archive === "学習用(Evernote),教員職務(Evernote),教採対策(Evernote),思考(Evernote),修士論文(Evernote),積み上げ（〜2026年10月）,全体構想", r.archive);
  t.check("子は親についていく（★・スマホ）", r.deep === "teaching,n-t3,teaching,n-t12", r.deep);
  t.check("論文：reading の空のノート・中に2件", r.paper === "reading||2026, 生成AIで変わる言語教育の未来,【国語】初発の考えからの単元計画", r.paper);
  t.check("保険・投資は living の一番上・中もついていく", r.ins === "living,,living", r.ins);
  t.check("philosophy&work は Notion に空で残る", r.pw === "Notion,0", r.pw);
  t.check("旧い冊は消さない（中の残る Notion・Evernote）", /Notion/.test(r.left) && /Evernote/.test(r.left), r.left);

  const mid = await snap();
  const same = (k) => before.filter((b) => { const m = mid.find((x) => x.id === b.id); return !m || m[k] !== b[k]; }).map((b) => b.id);
  t.check("本文は動かない", !same("body").length, same("body").join());
  t.check("作った日は動かない", !same("createdAt").length, same("createdAt").join());
  t.check("直した日は動かない", !same("updatedAt").length, same("updatedAt").join());
  t.check("題が変わるのは Evernote の5冊だけ", same("title").length === 5, same("title").join());
  t.check("二度目は分けるものが無い", (await page.evaluate(() => KN.noteOrganize.sixPlan().moved)) === 0);

  /* 設定の行 */
  await page.click('.tab[data-tab="notes"]');
  await page.waitForTimeout(600);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => document.querySelector(".set-layer .set-row"));
  const rows = await page.locator(".set-layer:last-child").innerText();
  t.check("設定：分けたあとは「戻す」だけ", /6つに分けたのを戻す/.test(rows) && !/6つに分ける\n/.test(rows + "\n"), rows);

  /* 戻す */
  await page.evaluate(() => KN.notes.reshape([], KN.noteOrganize.undoPlan(KN.noteOrganize.sixRuns()[0])));
  const after = await snap();
  const diff = before.filter((b) => {
    const a = after.find((x) => x.id === b.id);
    return !a || ["title", "body", "notebook", "parent", "pos", "createdAt", "updatedAt", "deletedAt", "org"].some((k) => a[k] !== b[k]);
  }).map((b) => b.id);
  t.check("戻すと元どおり（冊・親・題・並び・前の整理の記録）", !diff.length, diff.join());
  const paper = after.find((x) => x.title === "論文");
  t.check("作った「論文」は消した印", !!paper && !!paper.deletedAt, JSON.stringify(paper));
  t.check("戻したあとはまた分けられる", (await page.evaluate(() => KN.noteOrganize.sixPlan().moved)) > 0);

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
