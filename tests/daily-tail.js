/* Daily Log の「3行」「5行」は終わりの数行（2026年10月6日、docs/daily.md）。

   時計を 2026年10月6日に止め、その日に十二行の日記を置く。
   - 全文：十二行ぶんの背、頭が見える。
   - 5行：背は五行ぶん、最後の行が見え、頭は上へ切れて薄い（is-cut）。
   - 3行：背は三行ぶん。設定の札は「3行」。
   - 短い日（二行）は切らない（is-cut なし）。
   - 前の保存（logFull: false だけ、logLines 無し）は 5行。
   日記の本文は試験用の無難な字だけ。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/daily-tail.js */
const { open, checker } = require("./lib");

const LINES = Array.from({ length: 12 }, (_, i) => `試験の行${i + 1}`).join("\n");

(async () => {
  const t = checker("daily-tail");
  const { browser, page, errors } = await open({
    before: async (ctx, pg) => {
      await pg.clock.setFixedTime(new Date(2026, 9, 6, 10, 0));
      await ctx.addInitScript((memo) => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("kaimono-note-v2", JSON.stringify({
          schema: 2, settings: { theme: "auto", logFull: false },
          archive: {
            entries: [],
            days: [
              { date: "2026-10-06", memo, createdAt: "2026-10-06" },
              { date: "2026-10-05", memo: "試験の短い一行\n二行め", createdAt: "2026-10-05" },
            ],
          },
        }));
      }, LINES);
    },
  });

  const look = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const m = document.querySelector("#screen-archive .arc-log-memo");
      const r = m.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(m).lineHeight);
      const inner = [...m.firstElementChild.getClientRects()];
      const range = document.createRange();
      const txt = m.firstElementChild.firstChild;
      const pos = (s) => { const i = txt.data.indexOf(s); range.setStart(txt, i); range.setEnd(txt, i + s.length);
        const b = range.getBoundingClientRect(); return b.top >= r.top - 1 && b.bottom <= r.bottom + 1; };
      res({ rows: Math.round(r.height / lh), cut: m.classList.contains("is-cut"),
        first: pos("試験の行1\n") , last: pos("試験の行12") });
    }))));

  await page.evaluate(() => KN.app.showScreen("archive"));
  let v = await look();
  t.check("前の保存（logLines 無し）は5行", v.rows === 5, JSON.stringify(v));
  t.check("最後の行が見え、頭は切れる", v.last && !v.first && v.cut, JSON.stringify(v));

  await page.evaluate(() => { KN.store.update((s) => { s.settings.logLines = 3; }); KN.app.showScreen("archive"); });
  v = await look();
  t.check("3行は三行ぶん・最後の行が見える", v.rows === 3 && v.last && v.cut, JSON.stringify(v));

  await page.evaluate(() => { KN.store.update((s) => { s.settings.logFull = true; }); KN.app.showScreen("archive"); });
  v = await look();
  t.check("全文は頭も終わりも見える", v.rows >= 12 && v.first && v.last && !v.cut, JSON.stringify(v));

  await page.evaluate(() => { KN.store.update((s) => { s.settings.logFull = false; }); });
  const short = await page.evaluate(() => new Promise((res) => {
    KN.store.update((s) => { s.settings.dailyScope = "month"; });
    KN.app.showScreen("archive");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ms = [...document.querySelectorAll("#screen-archive .arc-log-row[data-day='2026-10-05'] .arc-log-memo")];
      res(ms.map((m) => m.classList.contains("is-tail") && !m.classList.contains("is-cut")));
    }));
  }));
  t.check("短い日は切らない", short.length === 1 && short[0], JSON.stringify(short));

  t.check("エラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  t.done();
})();
