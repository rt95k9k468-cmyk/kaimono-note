/* 速さの台本（docs/roadmap-2.0.md の V2）。CPU を4倍遅くして、五つの手つきのあいだの
   requestAnimationFrame の間隔を集め、長いフレーム（20ms 超）の数と 95% 点を出す。
   - 帯を押す（daily → 買うもの）・道を開く（帯で やること へ。一日の道が組まれる）・
     日の横払い（やることの紙）・一覧の送り（買うものの紙を縦に）・紙を開く（用事の行を押す）
   - 指は本物のタッチ（CDP の Input.dispatchTouchEvent）
   **門にも run-all にも入れない**（機械の揺れで止めないため。数字は目安）。動きを足す
   項目の前後で手で回し、数字をその項目の節に書く。落とすのはエラーが出たときだけ。
   試験のブラウザ（Chromium）の数字で、iPhone の Safari とは描き方が違う（特にぼかし）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/frame-pace.js
   V2=1 を付けると 2.0 の見た目（.is-v2）で測る。RUNS=<n> で n 回測って中央値（既定 3）。
   CSS=<ファイル> を付けると、その CSS を差し込んで測る（V5 の見比べ。コードは変えずに案を測る）。 */
const fs = require("fs");
const { open, checker } = require("./lib");

const EXTRA = process.env.CSS ? fs.readFileSync(process.env.CSS, "utf8") : "";

const RUNS = Math.max(1, Number(process.env.RUNS) || 3);
const LONG = 20;

async function once() {
  let cdp;
  const { browser, ctx, page, errors } = await open({
    touch: true,
    before: async (cx, pg) => {
      /* 時計は止めない（page.clock は rAF も作り物の 16ms 刻みにして、測れなくなる）。 */
      await pg.addInitScript(() => {
        /* 間隔を集める。start() で始め、stop() で返す。 */
        let on = false, last = 0, gaps = [];
        const tick = (ts) => {
          if (!on) return;
          if (last) gaps.push(ts - last);
          last = ts;
          requestAnimationFrame(tick);
        };
        window.__pace = {
          start() { on = true; last = 0; gaps = []; requestAnimationFrame(tick); },
          stop() { on = false; return gaps; },
        };
      });
      if (EXTRA) {
        await pg.addInitScript((css) => {
          addEventListener("DOMContentLoaded", () => {
            const st = document.createElement("style");
            st.textContent = css;
            document.head.append(st);
          });
        }, EXTRA);
      }
    },
  });
  await page.evaluate((v2) => {
    const S = KN.store;
    const d = KN.util.todayKey();
    [["朝の用事", "08:00", 30], ["病院", "09:30", 60], ["昼", "12:00", 60], ["買い出し", "15:00", 45], ["夕飯", "18:30", 60]]
      .forEach(([title, time, minutes]) => S.addTodo({ title, due: d, time, minutes }));
    for (let i = 0; i < 4; i++) S.addTodo({ title: `長期 ${i + 1}` });
    for (let i = 0; i < 40; i++) {
      const p = S.addProduct({ name: `品物 ${i + 1}` });
      if (p) S.addItem(p.id);
    }
    S.update((x) => { x.settings.v2 = v2; });
    KN.app.applyV2(v2);
    KN.app.showScreen("archive");
  }, !!process.env.V2);
  await page.waitForTimeout(800);

  cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  const trace = async (x, y, path, gap = 16) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(x, y) });
    for (const [dx, dy] of path) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(x + dx, y + dy) });
      await page.waitForTimeout(gap);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const line = (dx, dy, n = 14) => Array.from({ length: n }, (_, i) => [dx * (i + 1) / n, dy * (i + 1) / n]);
  const tap = async (sel, text) => {
    const r = await page.evaluate(([s, tx]) => {
      const el = [...document.querySelectorAll(s)].find((e) =>
        e.getClientRects().length && (!tx || e.textContent.includes(tx)));
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, [sel, text || ""]);
    if (!r) throw new Error(`押す先が無い：${sel} ${text || ""}`);
    await trace(r.x, r.y, []);
  };
  const center = (sel) => page.evaluate((s) => {
    const b = document.querySelector(s).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 300) };
  }, sel);
  /** 手つき一つぶんを測る。settle は指を離してから動きが落ち着くまで。 */
  const measure = async (act, settle = 900) => {
    await page.evaluate(() => window.__pace.start());
    await act();
    await page.waitForTimeout(settle);
    return page.evaluate(() => window.__pace.stop());
  };

  const out = {};
  const moved = {};
  out["帯を押す"] = await measure(() => tap('.tab[data-tab="list"]'));
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(800);
  out["道を開く"] = await measure(() => tap('.tab[data-tab="todo"]'), 1200);
  {
    const p = await center("#screen-todo .tl-sheet");
    const title = () => page.evaluate(() => document.querySelector("#head .js-day-title").textContent);
    const before = await title();
    out["日の横払い"] = await measure(() => trace(p.x + 120, p.y, line(-260, 0)));
    moved.day = (await title()) !== before;
    /* 今日へ戻しておく（紙を開く行が今日にある）。 */
    await trace(p.x - 120, p.y, line(260, 0));
    await page.waitForTimeout(900);
  }
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(800);
  {
    const p = await center("#screen-list .tl-sheet");
    out["一覧の送り"] = await measure(() => trace(p.x, p.y + 150, line(0, -360, 18)), 1200);
    moved.scroll = await page.evaluate(() => KN.app.scrollerOf(document.getElementById("screen-list")).scrollTop > 100);
  }
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("#screen-todo .tl-row")].find((e) => e.textContent.includes("病院"));
    row && row.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(400);
  out["紙を開く"] = await measure(() => tap("#screen-todo .tl-row .tl-title, #screen-todo .tl-row", "病院"));
  const opened = await page.evaluate(() => !!document.querySelector(".sheet.is-open"));

  await browser.close();
  return { out, errors, opened, moved };
}

const sum = (gaps) => {
  const s = [...gaps].sort((a, b) => a - b);
  const p95 = s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] : 0;
  return { n: s.length, long: s.filter((g) => g > LONG).length, p95 };
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

(async () => {
  const t = checker("frame-pace");
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await once());
  const names = Object.keys(runs[0].out);
  console.log(`CPU 4倍・${RUNS}回の中央値${process.env.V2 ? "・2.0 の見た目" : ""}${process.env.CSS ? `・${require("path").basename(process.env.CSS)}` : ""}（長い＝${LONG}ms 超）`);
  console.log("手つき        フレーム  長い  95%点");
  for (const name of names) {
    const r = runs.map((x) => sum(x.out[name]));
    const n = median(r.map((x) => x.n)), long = median(r.map((x) => x.long)), p95 = median(r.map((x) => x.p95));
    console.log(`${name.padEnd(8, "　")}  ${String(n).padStart(6)}  ${String(long).padStart(4)}  ${p95.toFixed(1).padStart(5)}ms`);
    t.check(`${name}：フレームが集まった`, n > 10, String(n));
  }
  t.check("日が動いた", runs.every((x) => x.moved.day));
  t.check("一覧が送られた", runs.every((x) => x.moved.scroll));
  t.check("紙が開いた", runs.every((x) => x.opened));
  const errs = runs.flatMap((x) => x.errors);
  t.check("エラーなし", errs.length === 0, errs.join("\n"));
  t.done();
})();
