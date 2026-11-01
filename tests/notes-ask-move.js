/* 冊なしの問いのノートを thinking へ（docs/thinking.md「考えたことは thinking へ」）。

   対象は冊なし・一番上・頭の行が「？問い」のノートだけ（中のノートは一緒に）。タグ「問い」だけ・親の下・頭の行でない・
   冊のある・消したものは対象外／先に一覧を見せる紙 → 控え → 移す／変わるのは冊だけ（本文・日時・並び）／
   設定の行は対象があるときだけ、移したあとは「戻す」／戻すと冊・前の整理の記録が元どおり。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-ask-move.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-ask-move");
  const { browser, page, errors } = await open();

  await page.evaluate(() => KN.notes.ready());
  await page.waitForFunction(() => KN.notes.state() === "on");
  await page.evaluate(async () => {
    let i = 0;
    const L = [];
    const mk = (id, body, notebook, extra) => {
      i += 1;
      const at = `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`;
      L.push(Object.assign({ id, title: "", body, notebook, tags: [], fav: false, createdAt: at, updatedAt: at, deletedAt: null }, extra || {}));
    };
    mk("n-a", "？問いA\n答え", "", { org: { at: "2026-10-13T00:00:00.000Z", nb: "Notion" } });
    mk("n-ak", "中のノート", "", { parent: "n-a" });
    mk("n-b", "？問いB", "", { title: "題B" });
    mk("n-tag", "ふつう", "", { tags: ["問い"] });
    mk("n-x", "親", "");
    mk("n-under", "？下の問い", "", { parent: "n-x" });
    mk("n-mid", "前置き\n？二行めの問い", "");
    mk("n-nb", "？冊のある問い", "learning");
    mk("n-del", "？消した問い", "", { deletedAt: "2026-10-30T00:00:00.000Z" });
    await KN.notes.addMany(L);
  });
  const snap = () => page.evaluate(() => KN.notes.list().concat(KN.notes.trash())
    .map((n) => ({ id: n.id, title: n.title, body: n.body, notebook: n.notebook, parent: n.parent || "", pos: n.pos || "",
      createdAt: n.createdAt, updatedAt: n.updatedAt, deletedAt: n.deletedAt || null, org: JSON.stringify(n.org || null) }))
    .sort((a, b) => a.id.localeCompare(b.id)));
  const before = await snap();

  const setRows = async () => {
    await page.evaluate(() => KN.app.showScreen("notes"));
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForFunction(() => document.querySelector(".set-layer .set-row"));
    const r = await page.evaluate(() => [...document.querySelectorAll(".set-layer:last-child .set-title")].map((e) => e.textContent).join(" / "));
    await page.evaluate(() => KN.app.showScreen("notes"));
    return r;
  };
  const plan = await page.evaluate(() => KN.noteOrganize.askPlan().moved.join(","));
  t.check("対象は冊なし・一番上・頭の行が問いのものだけ", plan === "題B,問いA" || plan === "問いA,題B", plan);

  const r0 = await setRows();
  t.check("設定：対象があれば口が出る（戻すは無い）", /問いのノートを thinking へ/.test(r0) && !/thinking へ移したのを戻す/.test(r0), r0);

  /* 先に見せる紙 → 控え → 移す */
  await page.evaluate(() => KN.noteOrganize.askPreview());
  await page.waitForSelector(".sheet .js-tidy");
  const sheet = await page.locator(".sheet").last().innerText();
  t.check("紙に一覧が出る", /問いA/.test(sheet) && /題B/.test(sheet) && !/下の問い|二行め|冊のある|消した/.test(sheet), sheet);
  await page.click(".sheet .js-tidy");
  await page.waitForFunction(() => KN.notes.get("n-b").notebook === "thinking", null, { timeout: 5000 }).catch(() => {});
  const mid = await snap();
  const by = (l) => Object.fromEntries(l.map((n) => [n.id, n]));
  const B = by(before), M = by(mid);
  const moved = ["n-a", "n-ak", "n-b"];
  t.check("対象と中のノートは thinking へ", moved.every((id) => M[id].notebook === "thinking"), moved.map((id) => M[id].notebook).join());
  t.check("ほかは動かない", Object.keys(B).filter((id) => !moved.includes(id)).every((id) => JSON.stringify(B[id]) === JSON.stringify(M[id])));
  t.check("本文・日時・並び・親は変わらない", moved.every((id) => ["title", "body", "parent", "pos", "createdAt", "updatedAt"].every((k) => B[id][k] === M[id][k])));
  t.check("控えを取った", await page.evaluate(async () => {
    const l = KN.backup && KN.backup.list ? await KN.backup.list() : [];
    return JSON.stringify(l).includes("問いを thinking へ移す前");
  }));

  t.check("移したあとは対象なし", (await page.evaluate(() => KN.noteOrganize.askPlan().moved.length)) === 0);
  const r1 = await setRows();
  t.check("設定：移したあとは「戻す」だけ", !/問いのノートを thinking へ/.test(r1) && /thinking へ移したのを戻す/.test(r1), r1);
  t.check("戻せる回は一つ", (await page.evaluate(() => KN.noteOrganize.askRuns().length)) === 1);

  /* 戻す */
  await page.evaluate(() => KN.notes.reshape([], KN.noteOrganize.undoPlan(KN.noteOrganize.askRuns()[0])));
  const after = await snap();
  const diff = before.filter((b) => JSON.stringify(b) !== JSON.stringify(after.find((x) => x.id === b.id))).map((b) => b.id);
  t.check("戻すと元どおり（冊・前の整理の記録）", !diff.length, diff.join());
  t.check("戻したあとはまた移せる", (await page.evaluate(() => KN.noteOrganize.askPlan().moved.length)) === 2);

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
