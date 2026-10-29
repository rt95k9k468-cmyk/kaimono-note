/* 時刻を決めていない用事の札は、紙に沈む（2026年10月29日、利用者「時刻の決まった予定と、いつでもいいタスクが
   同じ大きさ・同じ重さに見える」。docs/todo-timeline.md の「ごろ」）。
   - 印（is-about）は「ごろ」と同じ一つの判定：時刻を決めていない・まだの用事だけ。種類（予定・やること）とは別の軸で、
     時刻を決めたやること（夜のルーティン）は白い札のまま。
   - 白い札・太字・実線の縁は時刻を決めたものだけ。is-about は地が紙（--c-sheet）寄り、題は細字（400）、縁は点線。
     棒はどちらも実線（8px の棒を刻むと角丸の太い塊に見えた）。
   - 地は紙と札のあいだ（明るい面でも暗い面でも、紙より濃くならない）。
   - 開いたまま時計が目安の時刻に追いついても、始めたことにしない（塗り・is-live・is-late なし）。
   - 畳んだ空きの点線は前のまま（点線は一つの変数 --tl-dash から）。 */
const { open, checker } = require("./lib");

const DAY = "2026-10-29";

(async () => {
  const c = checker("timeline-about");
  const { browser, page, errors } = await open({
    before: async (ctx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 29, 10, 12)); },
  });

  await page.evaluate((day) => {
    const s = KN.store;
    s.addTodo({ title: "児童センターの催し", kind: "event", due: day, time: "10:30", minutes: 60 });
    s.addTodo({ title: "予約の電話", due: day, minutes: 60 });
    s.addTodo({ title: "本を返す", due: day });
    s.addTodo({ title: "夜のルーティン", due: day, part: "dusk", repeat: "daily", time: "19:00", minutes: 180 });
    const t = s.addTodo({ title: "洗濯", due: day });
    s.update((st) => { const x = st.todos.find((y) => y.id === t.id); x.done = true; x.doneAt = new Date(2026, 9, 29, 10, 5).toISOString(); });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });

  /* 色は見本の箱で読む（color-mix も 16 進もここで rgb に揃う）。 */
  const read = () => page.evaluate(() => {
    const rgb = (s) => {
      let m = String(s).match(/rgba?\(([^)]+)\)/);
      if (m) return m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
      m = String(s).match(/color\(srgb ([^)]+)\)/);
      return m ? m[1].trim().split(/\s+/).slice(0, 3).map((x) => Math.round(parseFloat(x) * 255)) : null;
    };
    const probe = (v) => {
      const d = document.createElement("div");
      d.style.background = `var(${v})`;
      document.querySelector("#screen-todo .tl-list").append(d);
      const out = rgb(getComputedStyle(d).backgroundColor);
      d.remove();
      return out;
    };
    const list = document.querySelector("#screen-todo .tl-list");
    const rows = [...list.querySelectorAll(":scope > li.tl-row")].map((li) => ({
      title: li.querySelector(".item-name").textContent.trim(),
      about: li.classList.contains("is-about"),
      goro: !!li.querySelector(".tl-about"),
      bg: rgb(getComputedStyle(li.querySelector(".item.tl-item")).backgroundColor),
      weight: getComputedStyle(li.querySelector(".item-name")).fontWeight,
      dash: /repeating-linear-gradient/.test(getComputedStyle(li.querySelector(".tl-node")).maskImage
        || getComputedStyle(li.querySelector(".tl-node")).webkitMaskImage || ""),
      edge: getComputedStyle(li.querySelector(".item.tl-item")).outlineStyle,
    }));
    const fold = list.querySelector(".tl-fold-rail");
    return { rows, sheet: probe("--c-sheet"), surface: probe("--c-surface"),
      foldDash: !!fold && /repeating-linear-gradient/.test(getComputedStyle(fold).maskImage || getComputedStyle(fold).webkitMaskImage || "") };
  });
  const lum = (x) => (x ? 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2] : NaN);
  const same = (a, b) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= 1);
  const between = (x, a, b) => lum(x) >= Math.min(lum(a), lum(b)) - 0.5 && lum(x) <= Math.max(lum(a), lum(b)) + 0.5;

  let r = await read();
  const find = (w) => r.rows.find((x) => x.title.includes(w)) || {};
  const ev = find("児童センター"), call = find("予約の電話"), book = find("本を返す"), night = find("夜のルーティン");

  c.check("物差しには、まだの四件（済ませた一件は上の一覧）",
    r.rows.length === 4 && !find("洗濯").title, JSON.stringify(r.rows.map((x) => x.title)));
  c.check("印は時刻を決めていない二件だけ（時刻を決めたやること＝夜のルーティンには付かない）",
    call.about && book.about && !ev.about && !night.about, JSON.stringify(r.rows.map((x) => [x.title, x.about])));
  c.check("印と「ごろ」は同じ判定", r.rows.every((x) => x.about === x.goro), JSON.stringify(r.rows.map((x) => [x.title, x.about, x.goro])));
  c.check("時刻を決めた札は白（--c-surface）・太字・実線の縁",
    [ev, night].every((x) => same(x.bg, r.surface) && x.weight === "700" && x.edge === "solid"), JSON.stringify([ev, night, r.surface]));
  c.check("時刻を決めていない札は細字・点線の縁",
    [call, book].every((x) => x.weight === "400" && x.edge === "dashed"), JSON.stringify([call, book]));
  c.check("棒はどれも点線にしない（8px を刻むと太い塊に見えた）", r.rows.every((x) => !x.dash), JSON.stringify(r.rows.map((x) => [x.title, x.dash])));
  c.check("時刻を決めていない札の地は紙と札のあいだで、白ではない（明るい面）",
    [call, book].every((x) => between(x.bg, r.sheet, r.surface) && lum(x.bg) < lum(r.surface) - 1),
    JSON.stringify({ call: call.bg, book: book.bg, sheet: r.sheet, surface: r.surface }));
  c.check("畳んだ空きの棒は点線のまま", r.foldDash, "");

  /* 開いたまま時計が進んでも、時刻を決めていない札は始まらない（目安の時刻に追いついただけ。2026年10月29日、利用者）。
     組み直さずに塗りだけ置き直す（axis.__paint）。12:20 は「本を返す」の終わりを過ぎ、「予約の電話」の途中。 */
  await page.clock.setFixedTime(new Date(2026, 9, 29, 12, 20));
  const went = await page.evaluate(() => {
    document.querySelector("#screen-todo .tl-axis").__paint();
    return [...document.querySelectorAll("#screen-todo .tl-list > li.tl-row")].map((li) => ({
      title: li.querySelector(".item-name").textContent.trim(), about: li.classList.contains("is-about"),
      pass: Number(li.style.getPropertyValue("--pass")), live: li.classList.contains("is-live"), late: li.classList.contains("is-late"),
    }));
  });
  const wa = went.filter((x) => x.about), we = went.find((x) => x.title.includes("児童センター")) || {};
  c.check("開いたまま時計が追いついても、時刻を決めていない札は塗らない・進んでいるにしない・過ぎてもまだにしない",
    wa.length === 2 && wa.every((x) => x.pass === 0 && !x.live && !x.late), JSON.stringify(went));
  c.check("時刻を決めた札は、時計どおり塗る", we.pass === 1, JSON.stringify(we));

  /* 暗い面：紙と札が同じ色でも、沈めた札が紙より濃く浮かない（--c-bg へ寄せると濃くなった）。 */
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  /* 明暗を替えると札の地は移り変わる（途中の色は oklab で読める）。移り終わるまで待つ。 */
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === "running"
    && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest("#screen-todo .tl-list")), null, { timeout: 5000 });
  r = await read();
  const darkAbout = r.rows.filter((x) => x.about);
  c.check("暗い面でも、沈めた札の地は紙と札のあいだ",
    darkAbout.length === 2 && darkAbout.every((x) => between(x.bg, r.sheet, r.surface)),
    JSON.stringify({ rows: darkAbout.map((x) => x.bg), sheet: r.sheet, surface: r.surface }));

  if (process.env.SHOTS) {
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    const el = await page.$("#screen-todo .tl");
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: `${process.env.SHOTS}/timeline-about.png` });
  }
  c.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
