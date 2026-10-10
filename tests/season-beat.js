/* 季節の変わり目の一拍（roadmap-seamless の N7、docs/daily.md の「季節のひとこと」）。
   - 祝日（2026/10/12 スポーツの日）：その日はじめて daily を開くと、祝日の行だけが一度満ちる（season-fill）。
     節気・候の行は動かない。今日を覚える（kn-season-beat）
   - その日の二度目は満ちない
   - 節気の初日（2026/10/8 寒露）：節気の行だけが変わる行
   - ふつうの日（2026/10/15）：変わる行が無く、満ちず、見たことにもしない
   - 動きを減らす設定では満ちない */
const { open, checker } = require("./lib");

const t = checker("season-beat");

const away = async (page, tab) => {
  await page.click(`.tab[data-tab="${tab}"]`);
  await page.waitForFunction(() => !document.querySelector(".is-m-arrive"), null, { timeout: 5000 });
};
const look = (page) => page.evaluate(() => {
  const root = document.getElementById("screen-archive");
  return {
    first: root.classList.contains("is-season-first"),
    key: localStorage.getItem("kn-season-beat"),
    today: KN.util.todayKey(),
    rows: [...root.querySelectorAll(".arc-season-row")].map((r) => ({
      k: r.querySelector(".arc-season-k").textContent, turn: r.classList.contains("is-turn"),
      anim: getComputedStyle(r).animationName,
    })),
  };
});
const day = async (at, fn, opts = {}) => {
  const { browser, page, errors } = await open({ before: async (cx, p) => {
    if (opts.reduce) await p.emulateMedia({ reducedMotion: "reduce" });
    await p.clock.setFixedTime(at);
  } });
  await away(page, "list");
  await page.click('.tab[data-tab="archive"]');
  await page.waitForTimeout(100);
  await fn(page);
  t.check(`エラーなし（${at.getMonth() + 1}/${at.getDate()}）`, errors.length === 0, errors.join(" | "));
  await browser.close();
};

(async () => {
  await day(new Date(2026, 9, 12, 10, 0), async (page) => {
    const a = await look(page);
    const turn = a.rows.filter((r) => r.turn).map((r) => r.k);
    t.check("祝日の日：変わる行は祝日だけ", turn.join() === "祝日", JSON.stringify(a.rows));
    t.check("その日はじめて：祝日の行が満ちる", a.first && a.rows.some((r) => r.turn && r.anim === "season-fill"), JSON.stringify(a));
    t.check("変わらない行は動かない", a.rows.filter((r) => !r.turn).every((r) => r.anim === "none"), JSON.stringify(a.rows));
    t.check("今日を見たと覚える", a.key === a.today, `${a.key} / ${a.today}`);
    await page.waitForFunction(() => !document.querySelector(".is-m-arrive"), null, { timeout: 5000 });
    await away(page, "todo");
    await page.click('.tab[data-tab="archive"]');
    await page.waitForTimeout(100);
    const b = await look(page);
    t.check("その日の二度目は満ちない", !b.first && b.rows.every((r) => r.anim === "none"), JSON.stringify(b));
  });

  await day(new Date(2026, 9, 8, 10, 0), async (page) => {
    const a = await look(page);
    t.check("節気の初日：節気の行だけが変わる行", a.rows.filter((r) => r.turn).map((r) => r.k).join() === "二十四節気", JSON.stringify(a.rows));
    t.check("節気の初日：満ちる", a.first && a.rows[0].anim === "season-fill", JSON.stringify(a));
  });

  await day(new Date(2026, 9, 15, 10, 0), async (page) => {
    const a = await look(page);
    t.check("ふつうの日：変わる行が無い", a.rows.length >= 2 && a.rows.every((r) => !r.turn), JSON.stringify(a.rows));
    t.check("ふつうの日：満ちず、見たことにもしない", !a.first && a.key == null && a.rows.every((r) => r.anim === "none"), JSON.stringify(a));
  });

  await day(new Date(2026, 9, 12, 10, 0), async (page) => {
    const a = await look(page);
    t.check("減らす設定：満ちない", !a.first && a.rows.every((r) => r.anim === "none"), JSON.stringify(a));
  }, { reduce: true });

  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
