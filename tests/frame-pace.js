/* 速さの台本（docs/roadmap-2.0.md の V2）。CPU を4倍遅くして、五つの手つきのあいだの
   requestAnimationFrame の間隔を集め、長いフレーム（20ms 超）の数と 95% 点を出す。
   - 帯を押す（daily → 買うもの）・道を開く（帯で やること へ。一日の道が組まれる）・
     暦をしまう／出す（やること ⇄ ノート。暦の出入りが横の流れと同じ一拍。head.js の moveCal）・
     日の横払い（やることの紙）・暦を伸ばす／畳む（題を押す一段。cal-peek）・一覧の送り（買うものの紙を縦に）・紙を開く（用事の行を押す）
   - 指は本物のタッチ（CDP の Input.dispatchTouchEvent）
   **門にも run-all にも入れない**（機械の揺れで止めないため。数字は目安）。動きを足す
   項目の前後で手で回し、数字をその項目の節に書く。落とすのはエラーが出たときだけ。
   試験のブラウザ（Chromium）の数字で、iPhone の Safari とは描き方が違う（特にぼかし）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/frame-pace.js
   RUNS=<n> で n 回測って中央値（既定 3）。「並べ直し」は手つきのあいだのレイアウトの回数（CDP の
   LayoutCount）。動くあいだ毎フレーム並べ直していれば、フレームの数に近くなる。
   CSS=<ファイル> を付けると、その CSS を差し込んで測る（V5 の見比べ。コードは変えずに案を測る）。
   TRACE=<手つき,…>（例 TRACE=帯を押す,紙を開く RUNS=1）：その手つきだけ Chromium の trace を録り、**どの拍が長いか**を出す。
   拍＝rAF の呼び出しから次の呼び出しまでが 22ms 超の所（数える「長い」は ts の間隔で、長い拍の一つあとのコマに出る）。
   拍ごとに、主の糸で走ったもの（1.5ms 以上。強いた様式・並べ直しは呼び元つき）・様式を無効にした書き込み（★＝根の下
   ぜんぶ）・JS の関数（js/ だけ・含む時間）。録るあいだは 3〜5 割遅い（数は TRACE なしで）。指で送るあいだの長いコマは
   主の糸が空いている（Chromium が rAF を間引く。アプリの重さではない）。 */
const fs = require("fs");
const { open, checker } = require("./lib");

const EXTRA = process.env.CSS ? fs.readFileSync(process.env.CSS, "utf8") : "";

const RUNS = Math.max(1, Number(process.env.RUNS) || 3);
const LONG = 20;
const TRACE = (process.env.TRACE || "").split(",").filter(Boolean);
const CATS = ["-*", "devtools.timeline", "disabled-by-default-devtools.timeline", "blink.user_timing", "disabled-by-default-v8.cpu_profiler",
  "disabled-by-default-devtools.timeline.stack", "disabled-by-default-devtools.timeline.invalidationTracking"];

/** TRACE：長い拍ごとに、主の糸で何が走ったか。evs は trace の出来事、cbs は rAF の呼び出しの時刻（performance.now）。 */
function beats(name, evs, cbs) {
  const m0 = evs.find((e) => e.name === "pace:0");
  if (!m0 || cbs.length < 2) return;
  const base = (u) => String(u || "").replace(/^.*\//, "");
  const ms = (us) => (us / 1000).toFixed(1);
  const T = (p) => p * 1000 + (m0.ts - cbs[0] * 1000);
  const mine = evs.filter((e) => e.pid === m0.pid && e.tid === m0.tid).sort((a, b) => a.ts - b.ts || (b.dur || 0) - (a.dur || 0));
  const press = mine.find((e) => e.name === "EventDispatch" && /^(pointerdown|touchstart)$/.test((e.args.data || {}).type));
  const t0 = press ? press.ts : T(cbs[0]);
  const rel = (ts) => ((ts - t0) / 1000).toFixed(0);
  const who = (st) => (st && st.length ? ` ←${st.slice(0, 4).map((x) => `${x.functionName || "?"}@${base(x.url)}:${x.lineNumber}`).join(" < ")}` : "");
  const gaps = cbs.slice(1).map((c, i) => c - cbs[i]);
  console.log(`\n== ${name}：呼び出しの間隔 ${gaps.map((g) => (g > 22 ? `[${g.toFixed(0)}]` : g.toFixed(0))).join(" ")}`);
  /* JS の標本（時刻・関数の鎖） */
  const samples = [];
  for (const p of mine.filter((e) => e.name === "Profile")) {
    const nodes = new Map();
    let t = p.args.data.startTime;
    for (const c of evs.filter((e) => e.name === "ProfileChunk" && e.id === p.id).sort((a, b) => a.ts - b.ts)) {
      const cp = c.args.data.cpuProfile || {};
      (cp.nodes || []).forEach((n) => nodes.set(n.id, n));
      (cp.samples || []).forEach((id, i) => { t += (c.args.data.timeDeltas || [])[i] || 0; samples.push([t, id, nodes]); });
    }
  }
  samples.sort((a, b) => a[0] - b[0]);
  gaps.forEach((g, i) => {
    if (g <= 22) return;
    const a = T(cbs[i]), b = T(cbs[i + 1]), a0 = T(cbs[Math.max(0, i - 1)]);
    console.log(`  -- コマ ${i + 1}：押してから ${rel(a)}〜${rel(b)}ms（${g.toFixed(0)}ms）`);
    const open = [];
    const inv = new Map(), whole = new Set();
    for (const e of mine) {
      const d = (e.args && (e.args.data || e.args.beginData)) || {};
      if (e.ts >= a0 && e.ts < b) {
        /* 無効にした書き込みは一つ前の拍から（動きの終わりの出来事は前のコマの頭で配られる）。 */
        if (e.name === "StyleInvalidatorInvalidationTracking" && /allDescendantsMightBeInvalid/.test(JSON.stringify(d.invalidationList || ""))) whole.add(d.nodeName);
        if (e.name === "StyleRecalcInvalidationTracking" && d.stackTrace && d.stackTrace.length) {
          const k = `${d.nodeName}｜${d.reason || ""}${who(d.stackTrace)}`;
          inv.set(k, (inv.get(k) || 0) + 1);
        }
      }
      if (e.ph !== "X" || e.ts + e.dur <= a || e.ts >= b || /RunTask|v8\.callFunction|GC_TIME/.test(e.name)) continue;
      while (open.length && open[open.length - 1] <= e.ts) open.pop();
      if (e.dur >= 1500) {
        const txt = e.name === "EventDispatch" ? d.type : e.name === "FunctionCall" ? `${d.functionName || "(無名)"} ${base(d.url)}:${d.lineNumber}`
          : e.name === "UpdateLayoutTree" ? `要素 ${e.args.elementCount}${who(d.stackTrace)}`
          : e.name === "Layout" ? `${d.dirtyObjects}/${d.totalObjects}${who(d.stackTrace)}` : "";
        console.log(`    ${rel(e.ts).padStart(5)} ${"· ".repeat(open.length)}${e.name} ${ms(e.dur)} ${txt || ""}`);
      }
      open.push(e.ts + e.dur);
    }
    [...inv.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).forEach(([k, n]) =>
      console.log(`    無効 ×${n} ${whole.has(k.split("｜")[0]) ? "★" : ""}${k.slice(0, 300)}`));
    if (g < 40) return;
    const incl = new Map();
    samples.forEach(([t, id, nodes], k) => {
      if (t < a || t >= b || k + 1 >= samples.length) return;
      const seen = new Set();
      for (let n = nodes.get(id); n; n = n.parent != null ? nodes.get(n.parent) : null) {
        const cf = n.callFrame || {};
        const key = `${cf.functionName || "(無名)"} ${base(cf.url)}:${(cf.lineNumber || 0) + 1}`;
        if (/\/js\//.test(cf.url || "") && !seen.has(key)) { seen.add(key); incl.set(key, (incl.get(key) || 0) + samples[k + 1][0] - t); }
      }
    });
    console.log(`    JS: ${[...incl.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => `${ms(v)} ${k}`).join("／")}`);
  });
}

async function once() {
  let cdp;
  const { browser, ctx, page, errors } = await open({
    touch: true,
    before: async (cx, pg) => {
      /* 時計は止めない（page.clock は rAF も作り物の 16ms 刻みにして、測れなくなる）。 */
      await pg.addInitScript(() => {
        /* 間隔を集める。start() で始め、stop() で返す。輪は回ごとに一本（止めた直後に始めると、前の輪の
           最後の一コマが生き残って二本回り、コマが倍に数えられた——「暦を出す」の 153）。 */
        let run = 0, last = 0, gaps = [], cbs = [];
        const loop = (id) => {
          const tick = (ts) => {
            if (id !== run) return;
            /* TRACE 用：呼び出しの時刻。最初の一コマに印を打ち、trace の時計と合わせる。 */
            if (!cbs.length) performance.mark("pace:0");
            cbs.push(performance.now());
            if (last) gaps.push(ts - last);
            last = ts;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        };
        window.__pace = {
          start() { last = 0; gaps = []; cbs = []; loop(++run); },
          stop() { run++; return gaps; },
          cbs: () => cbs,
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
  await page.evaluate(() => {
    const S = KN.store;
    const d = KN.util.todayKey();
    [["朝の用事", "08:00", 30], ["病院", "09:30", 60], ["昼", "12:00", 60], ["買い出し", "15:00", 45], ["夕飯", "18:30", 60]]
      .forEach(([title, time, minutes]) => S.addTodo({ title, due: d, time, minutes }));
    for (let i = 0; i < 4; i++) S.addTodo({ title: `長期 ${i + 1}` });
    for (let i = 0; i < 40; i++) {
      const p = S.addProduct({ name: `品物 ${i + 1}` });
      if (p) S.addItem(p.id);
    }
    KN.app.showScreen("archive");
  });
  await page.waitForTimeout(800);

  cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Performance.enable");
  const layouts = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "LayoutCount").value;

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
  const lay = {};
  let name = "";
  const measure = async (act, settle = 900) => {
    const tr = TRACE.includes(name);
    if (tr) await browser.startTracing(page, { categories: CATS });
    const l0 = await layouts();
    await page.evaluate(() => window.__pace.start());
    await act();
    await page.waitForTimeout(settle);
    const gaps = await page.evaluate(() => window.__pace.stop());
    lay[name] = (await layouts()) - l0;
    if (tr) beats(name, JSON.parse((await browser.stopTracing()).toString("utf8")).traceEvents, await page.evaluate(() => window.__pace.cbs()));
    return gaps;
  };

  const out = {};
  const moved = {};
  out[name = "帯を押す"] = await measure(() => tap('.tab[data-tab="list"]'));
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(800);
  out[name = "道を開く"] = await measure(() => tap('.tab[data-tab="todo"]'), 1200);
  out[name = "暦をしまう"] = await measure(() => tap('.tab[data-tab="notes"]'));
  out[name = "暦を出す"] = await measure(() => tap('.tab[data-tab="todo"]'), 1200);
  {
    const p = await center("#screen-todo .tl-sheet");
    const title = () => page.evaluate(() => document.querySelector("#head .js-day-title").textContent);
    const before = await title();
    out[name = "日の横払い"] = await measure(() => trace(p.x + 120, p.y, line(-260, 0)));
    moved.day = (await title()) !== before;
    /* 今日へ戻しておく（紙を開く行が今日にある）。 */
    await trace(p.x - 120, p.y, line(260, 0));
    await page.waitForTimeout(900);
  }
  /* 暦を伸ばす（題を押して週 → 月。cal-peek の glide。並びは押した一拍で行き先、滑るのは見かけだけ） */
  out[name = "暦を伸ばす"] = await measure(() => tap("#head .js-day-title"), 900);
  out[name = "暦を畳む"] = await measure(() => tap("#head .js-day-title"), 900);
  await page.evaluate(() => KN.app.showScreen("list"));
  await page.waitForTimeout(800);
  {
    const p = await center("#screen-list .tl-sheet");
    out[name = "一覧の送り"] = await measure(() => trace(p.x, p.y + 150, line(0, -360, 18)), 1200);
    moved.scroll = await page.evaluate(() => KN.app.scrollerOf(document.getElementById("screen-list")).scrollTop > 100);
  }
  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("#screen-todo .tl-row")].find((e) => e.textContent.includes("病院"));
    row && row.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(400);
  out[name = "紙を開く"] = await measure(() => tap("#screen-todo .tl-row .tl-title, #screen-todo .tl-row", "病院"));
  const opened = await page.evaluate(() => !!document.querySelector(".sheet.is-open"));

  await browser.close();
  return { out, lay, errors, opened, moved };
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
  console.log(`CPU 4倍・${RUNS}回の中央値${process.env.CSS ? `・${require("path").basename(process.env.CSS)}` : ""}（長い＝${LONG}ms 超）`);
  console.log("手つき        フレーム  長い  95%点  並べ直し");
  for (const name of names) {
    const r = runs.map((x) => sum(x.out[name]));
    const n = median(r.map((x) => x.n)), long = median(r.map((x) => x.long)), p95 = median(r.map((x) => x.p95));
    const l = median(runs.map((x) => x.lay[name]));
    console.log(`${name.padEnd(8, "　")}  ${String(n).padStart(6)}  ${String(long).padStart(4)}  ${p95.toFixed(1).padStart(5)}ms  ${String(l).padStart(6)}`);
    t.check(`${name}：フレームが集まった`, n > 10, String(n));
  }
  t.check("日が動いた", runs.every((x) => x.moved.day));
  t.check("一覧が送られた", runs.every((x) => x.moved.scroll));
  t.check("紙が開いた", runs.every((x) => x.opened));
  const errs = runs.flatMap((x) => x.errors);
  t.check("エラーなし", errs.length === 0, errs.join("\n"));
  t.done();
})();
