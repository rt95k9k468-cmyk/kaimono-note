/* 日記を取り込む（D7）の上掛け（2026年9月30日）。docs/storage.md の「日記を取り込む」。

   - 本文の無い日・行の無い日には入れる
   - 同じ本文（空白・改行・全角半角の違いだけ）の日は何もしない
   - 書き足し（くらしノートの文が控えの中にそのままある）の日は控えの文にする
   - 中身の変わった日は、日付を見せて訊く。「くらしノートのまま」ならそのまま、
     「控えの文にする」なら置き換える
   - 本文を外した行（memoOut）は、どのときも触れない
   - 控えにない日には触れない。置き換えても「作成」「更新」は動かない
   - 取り込み前の自動バックアップにくらしノートの文が残る

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-import.js */
const { open, checker } = require("./lib");

const PW = "test pass";
const DAYS = {
  add: "2026-04-01",     // 行が無い
  same: "2026-04-02",    // 改行と全角だけ違う
  grow: "2026-04-03",    // 書き足し
  differ: "2026-04-04",  // 中身が変わった
  out: "2026-04-05",     // 本文を外した行
  keep: "2026-04-06",    // 控えに無い
};
const MINE = {
  same: "一行目\n二行目 ABC",
  grow: "朝に散歩した。",
  differ: "昼に本を読んだ。",
  keep: "くらしノートにだけある日",
};
const THEIRS = {
  add: "新しく入る日",
  same: "一行目二行目　ＡＢＣ",
  grow: "朝に散歩した。\n夜にも少し書き足した。",
  differ: "昼に本を読み終えた。",
  out: "外した行へは入らない",
};

async function run(choice) {
  const t = checker(`日記の取り込み（上掛け・変わった日は「${choice}」）`);
  const { browser, page, errors } = await open();
  await page.waitForFunction(() => KN.diaryIdb && KN.diaryIdb.settled());

  /* くらしノート側の本文を置く。本文を外した行は元を直に作る（2a と同じ）。 */
  await page.evaluate(({ DAYS, MINE }) => {
    Object.entries(MINE).forEach(([k, memo]) => KN.store.setDayLog(DAYS[k], { memo }));
    KN.store.update((s) => {
      s.archive.days.push({ date: DAYS.out, memo: "", memoOut: true, wake: null, sleep: null,
        wakeSource: "manual", sleepSource: "manual", createdAt: "2026-04-05T00:00:00.000Z", updatedAt: "2026-04-05T00:00:00.000Z" });
    });
  }, { DAYS, MINE });
  const before = await page.evaluate((d) => KN.store.dayLog(d), DAYS.grow);

  /* 控えを作る（取り込み道具と同じ形）。 */
  const sealed = await page.evaluate(async ({ DAYS, THEIRS, PW }) => {
    const X = KN.diaryCrypto;
    const made = await X.makeLock(PW);
    const days = [];
    for (const [k, body] of Object.entries(THEIRS)) {
      const b = await X.seal(made.key, body);
      days.push({ date: DAYS[k], iv: b.iv, ct: b.ct, at: new Date().toISOString() });
    }
    return JSON.stringify({ app: "kaimono-note", kind: "diary-sealed", v: 1, lock: made.lock, days, at: new Date().toISOString() });
  }, { DAYS, THEIRS, PW });

  /* 見積もり（dry）だけで分け方を見る。 */
  const plan = await page.evaluate(({ DAYS, THEIRS }) => KN.store.importDiary(
    Object.entries(THEIRS).map(([k, body]) => ({ date: DAYS[k], body })), { dry: true, replace: "grow" }), { DAYS, THEIRS });
  t.check("見積もり：足す1・同じ1・書き足し1・変わった1（その日付）・そのまま2",
    plan.add === 1 && plan.same === 1 && plan.grow === 1 && plan.differ === 1
      && plan.differDays.join() === DAYS.differ && plan.kept === 2 && plan.replaced === 1,
    JSON.stringify(plan));
  const plain = await page.evaluate(({ DAYS, THEIRS }) => KN.store.importDiary(
    Object.entries(THEIRS).map(([k, body]) => ({ date: DAYS[k], body })), { dry: true }), { DAYS, THEIRS });
  t.check("replace を渡さなければ、本文のある日には触れない（これまでどおり）",
    plain.replaced === 0 && plain.kept === 3, JSON.stringify(plain));

  /* 画面から：設定 → バックアップ → 控えを選ぶ。 */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await page.waitForTimeout(250);
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップ" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".js-diary-file").setInputFiles({ name: "kurashi-diary.json", mimeType: "application/json", buffer: Buffer.from(sealed) });
  await page.locator(".js-input").waitFor();
  await page.locator(".js-input").fill(PW);
  await page.locator(".sheet .js-ok, .js-ok").last().click();

  const ask = page.locator(".sheet, [role=dialog]", { hasText: "中身の変わった日があります" }).last();
  await ask.waitFor({ timeout: 15000 });
  const askText = await ask.innerText();
  t.check("変わった日は日付で訊く（4月4日）。本文は出さない",
    askText.includes("4月4日") && !askText.includes(MINE.differ) && !askText.includes(THEIRS.differ), askText.slice(0, 200));
  await ask.locator(choice === "控えの文にする" ? ".js-ok" : ".js-cancel").click();

  const final = page.locator(".sheet, [role=dialog]", { hasText: "日記を取り込みますか" }).last();
  await final.waitFor();
  await final.locator(".js-ok").click();
  await page.waitForFunction(() => [...document.querySelectorAll(".toast-msg")].some((e) => e.textContent.includes("取り込みました")), null, { timeout: 15000 });

  const got = await page.evaluate((DAYS) => Object.fromEntries(Object.entries(DAYS).map(([k, d]) => [k, KN.store.dayLog(d)])), DAYS);
  const memo = (k) => (got[k] && got[k].memo) || "";
  t.check("行の無い日には入る", memo("add") === THEIRS.add);
  t.check("空白・全角半角だけ違う日は、くらしノートの文のまま", memo("same") === MINE.same, memo("same"));
  t.check("書き足しの日は控えの文になる", memo("grow") === THEIRS.grow, memo("grow"));
  t.check("書き足しで置き換えても「作成」「更新」は動かない",
    got.grow.createdAt === before.createdAt && got.grow.updatedAt === before.updatedAt);
  t.check(`変わった日は「${choice}」のとおり`,
    memo("differ") === (choice === "控えの文にする" ? THEIRS.differ : MINE.differ), memo("differ"));
  t.check("本文を外した行には入らない", memo("out") === "" && !JSON.stringify(got.out).includes(THEIRS.out));
  t.check("控えに無い日には触れない", memo("keep") === MINE.keep);

  const snapOk = await page.evaluate((text) => KN.idb.run(["snapBodies"], "readonly", (tx) => {
    const r = tx.objectStore("snapBodies").getAll();
    return () => (r.result || []).some((x) => JSON.stringify(x).includes(text));
  }), MINE.grow);
  t.check("取り込み前の自動バックアップに、くらしノートの文が残る", snapOk);

  /* 写しにも同じ本文が入る（二重に持つ時期。docs/storage.md）。 */
  await page.waitForTimeout(600);
  const copy = await page.evaluate((d) => KN.idb.run(["diary"], "readonly", (tx) => {
    const r = tx.objectStore("diary").get(d);
    return () => (r.result ? r.result.memo : null);
  }), DAYS.grow);
  t.check("大きな保存場所の写しにも、置き換えた文が入る", copy === THEIRS.grow, String(copy));

  t.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
}

(async () => {
  await run("くらしノートのまま");
  await run("控えの文にする");
})();
