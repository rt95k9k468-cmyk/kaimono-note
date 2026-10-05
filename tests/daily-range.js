/* V22 daily の書き出し：期間を選んで書き出す（docs/roadmap-2.0.md の V22・docs/daily.md の末の節）。
   2026年10月4日。

   - store.exportRange(from, to)：両端の日を含む。逆に渡せば入れ替える。形は月ぶんと同じ
     （kind だけ "daily-range"、ym の代わりに from・to）。記録は一字も変えない。
   - 期間の書き出しはバックアップとして読まない（kind を持つので readBackup が弾く）。
   - 月ぶんの書き出しは前のまま（kind "daily-month"）。
   - 画面：設定（daily の歯車）→ 書き出し →「期間を選んで書き出す」。始まり・終わりを年・月・日の
     ドラムの小窓で選び（V27）、書き出すとファイルが落ちる。始まりを終わりより後にすると終わりが追う。
   - ドラムは目（scroll-snap）を持たず、止まった所から近い行へ寄せる（ui.js の drum）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/daily-range.js */
const fs = require("fs");
const { open, checker } = require("./lib");

(async () => {
  const t = checker("daily-range");
  const { browser, page, errors } = await open();

  /* ---- store ---- */
  const st = await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    const d = (n) => U.shiftDay(today, n);
    S.update((s) => { s.archive.days = []; s.archive.entries = []; });
    S.setDayLog(d(-10), { memo: "十日前" });
    S.setDayLog(d(-5), { memo: "五日前" });
    S.setDayLog(d(-2), { memo: "二日前" });
    S.setDayLog(today, { memo: "今日" });
    S.addEntry({ date: d(-5), type: "done", title: "五日前の積み上げ" });
    S.addEntry({ date: d(-2), type: "reading", title: "二日前の本" });
    S.addEntry({ date: d(-9), type: "done", title: "九日前" });
    const before = JSON.stringify(S.get());
    const r = S.exportRange(d(-5), d(-2));
    const rev = S.exportRange(d(-2), d(-5));
    const after = JSON.stringify(S.get());
    const m = S.exportMonth(today.slice(0, 7));
    const bad = S.inspectBackup(JSON.stringify(r));
    return {
      from: d(-5), to: d(-2), r, rev, same: before === after, mKind: m.kind, mYm: m.ym,
      bad: { ok: bad.ok, reason: bad.reason || "" },
    };
  });
  t.check("両端の日を含む", JSON.stringify(st.r.days.map((x) => x.memo)) === JSON.stringify(["二日前", "五日前"]),
    JSON.stringify(st.r.days.map((x) => x.date)));
  t.check("積み上げも期間の中だけ", st.r.entries.length === 2 && st.r.entries.every((e) => e.title !== "九日前"),
    JSON.stringify(st.r.entries.map((e) => e.title)));
  t.check("種類ごとの数", st.r.counts.done === 1 && st.r.counts.reading === 1, JSON.stringify(st.r.counts));
  t.check("形：kind・from・to", st.r.app === "kaimono-note" && st.r.kind === "daily-range" && st.r.from === st.from && st.r.to === st.to);
  t.check("逆に渡しても同じ期間", st.rev.from === st.from && st.rev.to === st.to && st.rev.days.length === 2);
  t.check("書き出しで記録は変わらない", st.same);
  t.check("機械の時刻は外す（V22 の後半）", [...st.r.days, ...st.r.entries].every((x) => !("createdAt" in x) && !("updatedAt" in x))
    && st.r.days.every((x) => x.date && "memo" in x) && st.r.entries.every((x) => x.id && x.title),
    JSON.stringify(st.r.days[0]));
  t.check("月ぶんは前のまま", st.mKind === "daily-month" && /^\d{4}-\d{2}$/.test(st.mYm));
  t.check("期間の書き出しはバックアップとして読まない", st.bad.ok === false && /バックアップではありません/.test(st.bad.reason),
    JSON.stringify(st.bad));

  /* ---- 画面 ---- */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "書き出し" }).first().click();
  await page.waitForTimeout(400);
  const out = await page.locator(".set-layer:last-child").innerText();
  t.check("書き出しの先に「期間を選んで書き出す」", out.includes("月ぶんを書き出す") && out.includes("期間を選んで書き出す") && out.includes("年の本"), out.slice(0, 200));
  await page.locator(".set-layer:last-child .set-row", { hasText: "期間を選んで書き出す" }).first().click();
  await page.waitForTimeout(500);

  const sheetText = () => page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet, .set-layer")].reverse()
      .find((x) => x.querySelector(".js-from"));
    return s ? s.innerText.replace(/\s+/g, " ").trim() : null;
  });
  const s0 = await sheetText();
  t.check("始まり・終わり・中身の数", s0 && /始まり/.test(s0) && /終わり/.test(s0) && /Daily Log \d+日 ・ 積み上げ \d+件/.test(s0), s0);
  t.check("説明文を置かない・評価しない・絵文字なし", s0 && !/できなかった|目標|達成|連続|比べ/.test(s0)
    && !/\p{Extended_Pictographic}/u.test(s0), s0);

  // 始まりを五日前に（年・月・日のドラム。回して、外を押して閉じると決まる）
  const pick = async (sel, day) => {
    await page.locator(sel).last().click();
    await page.waitForTimeout(400);
    const [y, m, d] = day.split("-").map(Number);
    for (const [i, v] of [[0, y], [1, m], [2, d]]) {
      await page.evaluate(([i, v]) => {
        const col = document.querySelectorAll(".note-pop.is-wheel .note-wheel")[i];
        const k = [...col.children].findIndex((r) => Number(r.dataset.v) === v);
        col.scrollTop = k * 40;
        col.dispatchEvent(new Event("scroll"));
      }, [i, v]);
      await page.waitForTimeout(250);   // 月を回すと日の列が組み直る
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  };
  await page.locator(".js-from").last().click();
  await page.waitForTimeout(400);
  t.check("始まりは年・月・日のドラム", await page.evaluate(() =>
    document.querySelectorAll(".note-pop.is-wheel .note-wheel").length === 3));
  const snapped = await page.evaluate(async () => {
    const col = document.querySelectorAll(".note-pop.is-wheel .note-wheel")[2];
    const css = getComputedStyle(col).scrollSnapType;
    col.scrollTop = 4 * 40 + 13;   // 行の途中で止まった
    col.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 900));
    return { css, top: col.scrollTop };
  });
  t.check("目で止めず、止まってから近い行へ寄せる", (snapped.css === "none" || !snapped.css) && Math.abs(snapped.top - 160) < 1,
    JSON.stringify(snapped));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await pick(".js-from", st.from);
  await pick(".js-to", st.to);
  const s1 = await sheetText();
  t.check("選んだ期間の数に変わる", /Daily Log 2日 ・ 積み上げ 2件/.test(s1), s1);

  // 始まりを終わりより後にすると、終わりが追う
  const today = await page.evaluate(() => KN.util.todayKey());
  await pick(".js-from", today);
  const s2 = await sheetText();
  t.check("始まりを終わりより後にすると終わりが追う", /Daily Log 1日/.test(s2), s2);
  await pick(".js-from", st.from);
  await pick(".js-to", st.to);

  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }),
    page.locator(".js-go").last().click(),
  ]);
  const file = await dl.path();
  const got = JSON.parse(fs.readFileSync(file, "utf8"));
  t.check("ファイル名に期間", dl.suggestedFilename() === `daily-${st.from}_${st.to}.json`, dl.suggestedFilename());
  t.check("落ちたファイルが期間ぶん", got.kind === "daily-range" && got.from === st.from && got.to === st.to && got.days.length === 2);
  await page.waitForTimeout(400);
  const toast = await page.evaluate(() => [...document.querySelectorAll(".toast")].map((x) => x.textContent).join(" "));
  t.check("報せ", /を書き出しました/.test(toast), toast);

  t.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
