/* 上の帯と暦は、全タブで一つ（docs/shared-header.md の段2・段3、2026年9月27日）。

   時計を 2026年9月15日(火) 10:00 に止めて開く。
   - タブを移っているあいだ、帯・題・暦・曜日の行・日のマスの位置と大きさを
     **毎フレーム**測り、動いた量が 0px であること（週・月の両方、十二通りの移り方。
     買うものも入る）。
     入ってくる画面のほうは本当に流れていること（流れていなければ試験にならない）。
     下の帯のボタンは CDP の本物のタッチで押す。
   - 掴み手を本物のタッチで下へ引くと、帯の暦が月へ開き（帯の題は動かない）、
     紙の上端が暦の下端に来る。月のまま daily へ移っても帯は動かない。
     当たり判定：紙の本体を上端で下へ引くと送る器に transform が付く。
   - 暦のマスの印はタブごと（ダイエットの飲酒の帯が daily・やることに出ない）。
     席を移るときは印だけ重ねて替わる（出ていく印の写しが同じ位置で薄れ、
     入ってきた印が浮かぶ。写しは `.cal` の外・押せない）。買うものの暦には
     その日に買ったものの丸（三つまで・同じ品物は一つ）（段4）。
   - 虫めがねは共通・窓はタブ側（暦の下）に開き、開いても帯は動かない。
   - 題を押したときの応えはタブごと（やること：週⇄月、daily：月を選ぶ紙）。
   - 設定は帯ごと押しのける（deck が動き、設定の一枚が帯の上に重なる）。
   - 買うもの・価格でも帯は動かない（段3）：掴み手を本物のタッチで引いて価格へ・
     帯の「買うもの」で戻る・価格からよそのタブへ、のどれも 0px。暦は一枚のまま
     差し替わらず、印は無い。題を押すと週⇄月。日を押すと題と共通の日だけが動き、
     紙は組み直さない。紙を横に払っても日は動かない。月に開いた暦のぶん狭く
     なっても、価格の地は帯の下から始まり、いちばん下の行まで送れ、留まった紙の
     頭は下の帯の上に居る。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("head-still");
  const { browser, ctx, page, errors } = await open({
    before: async (cx, pg) => { await pg.clock.setFixedTime(new Date(2026, 8, 15, 10, 0)); },
  });
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  const tapAt = async (x, y) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(x, y) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const center = (sel) => page.$eval(sel, (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const tapSel = async (sel) => { const p = await center(sel); await tapAt(p.x, p.y); };
  const drag = async (x, y0, dy, steps = 14) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(x, y0) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(x, y0 + (dy * i) / steps) });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const go = async (id) => { await page.evaluate((i) => KN.app.showScreen(i), id); await page.waitForTimeout(700); };
  const owner = () => page.evaluate(() => KN.head.TABS.find((t) => KN.head.mine(t)) || null);

  /* 毎フレームの記録。帯の中のものは位置と大きさの四つ、流れている画面は
     transform の横ずれ。 */
  const startRec = () => page.evaluate(() => {
    const box = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height];
    };
    const tx = (e) => (e ? new DOMMatrix(getComputedStyle(e).transform).m41 : 0);
    window.__rec = [];
    window.__on = true;
    const loop = () => {
      if (!window.__on) return;
      window.__rec.push({
        head: box("#head"), bar: box("#head .topbar"), title: box("#head .js-day-title"),
        cal: box("#head .cal"), wds: box("#head .cal-wds"), grid: box("#head .cal-clip"),
        slide: Math.max(...[...document.querySelectorAll(".panes > .screen")].map((s) => Math.abs(tx(s)))),
        deck: tx(document.getElementById("deck")),
      });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const stopRec = () => page.evaluate(() => { window.__on = false; return window.__rec; });
  /** 記録の中で、帯の中のものが最初のフレームから動いた最大量（px）。 */
  const drift = (rec, keys = ["head", "bar", "title", "cal", "wds", "grid"]) => {
    let worst = 0, what = "";
    const f0 = rec[0];
    rec.forEach((f, i) => keys.forEach((k) => {
      if (!f0[k] || !f[k]) { if (f0[k] !== f[k]) { worst = Infinity; what = `${k} が frame ${i} で消えた`; } return; }
      f[k].forEach((v, j) => {
        const d = Math.abs(v - f0[k][j]);
        if (d > worst) { worst = d; what = `${k}[${j}] frame ${i}: ${f0[k][j]} → ${v}`; }
      });
    }));
    return { worst, what };
  };

  /* 用事を一件。やることが空の日は紙が「ありません」の一枚になり、掴み手が
     暦に結ばれない（前からの作り）ので、時間割の紙を出しておく。 */
  await page.evaluate(() => {
    KN.store.addTodo({ title: "試験の用事", due: KN.util.todayKey(), time: "11:00" });
    /* 買うものに三件、価格に二十品（価格の地が送れる長さ）。 */
    for (let i = 0; i < 20; i++) {
      const p = KN.store.addProduct({ name: `試験の品${i + 1}` });
      if (i < 3) KN.store.addItem(p.id);
    }
    KN.store.setCalPref(null, { shown: true, open: false });
  });
  await go("todo");

  /* ---- タブを移っても、帯と暦は 1px も動かない（週・月） ---- */
  const hops = [["todo", "archive"], ["archive", "diet"], ["diet", "todo"],
                ["todo", "diet"], ["diet", "archive"], ["archive", "todo"],
                ["todo", "list"], ["list", "diet"], ["diet", "list"],
                ["list", "archive"], ["archive", "list"], ["list", "todo"]];
  for (const open of [false, true]) {
    await page.evaluate((o) => KN.store.setCalPref(null, { shown: true, open: o }), open);
    await page.waitForTimeout(500);
    const mode = open ? "月" : "週";
    for (const [a, b] of hops) {
      if ((await owner()) !== a) await go(a);
      await startRec();
      await page.waitForTimeout(60);
      await tapSel(`.tab[data-tab="${b}"]`);
      await page.waitForTimeout(650);
      const rec = await stopRec();
      const d = drift(rec);
      const slid = Math.max(...rec.map((f) => f.slide));
      c.check(`${mode}：${a} → ${b} で帯と暦が動かない（${rec.length}フレーム）`,
        d.worst === 0 && rec.length > 10 && (await owner()) === b, `${d.worst}px ${d.what}`);
      c.check(`${mode}：${a} → ${b} で紙の画面は流れている`, slid > 50, `最大 ${slid}px`);
    }
  }
  await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: false }));
  await page.waitForTimeout(500);

  /* ---- 掴み手を本物のタッチで引く → 帯の暦が月へ。題は動かない ---- */
  await go("todo");
  const grip = await center(".panes > .screen.is-active .tl-grip");
  await startRec();
  await drag(grip.x, grip.y, 260);
  await page.waitForTimeout(700);
  const pull = await stopRec();
  const pd = drift(pull, ["bar", "title"]);
  c.check("掴み手を引くと暦が月へ（本物のタッチ）",
    await page.evaluate(() => KN.store.calPrefs("todo").open === true));
  c.check("引いているあいだ、帯の題は動かない", pd.worst === 0, `${pd.worst}px ${pd.what}`);
  const calTopMoved = Math.max(...pull.map((f) => Math.abs(f.cal[1] - pull[0].cal[1])));
  c.check("引いているあいだ、暦の上端は動かない", calTopMoved === 0, `${calTopMoved}px`);
  const seam = await page.evaluate(() => {
    const cal = document.querySelector("#head .cal").getBoundingClientRect();
    const sheet = document.querySelector(".panes > .screen.is-active .tl-sheet").getBoundingClientRect();
    return Math.abs(sheet.top - cal.bottom);
  });
  c.check("紙の上端が暦の下端に来る（±1px）", seam <= 1, `${seam}px`);
  // 月のまま daily へ：帯は動かない（月の暦の厚みがタブで違わない）。
  await startRec();
  await page.waitForTimeout(60);
  await tapSel('.tab[data-tab="archive"]');
  await page.waitForTimeout(650);
  const md = drift(await stopRec());
  c.check("月に開いたまま daily へ移っても帯と暦が動かない", md.worst === 0, `${md.worst}px ${md.what}`);
  await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: false }));
  await go("todo");
  await page.waitForTimeout(300);

  /* 当たり判定：掴み手ではないところ（紙の本体）を上端で下へ引くと、送る器に
     transform が付く。付かないなら、この試験は端の give を動かせていない。 */
  const body = await page.evaluate(() => {
    const g = document.querySelector(".panes > .screen.is-active .tl-grip").getBoundingClientRect();
    return { x: g.left + g.width / 2, y: g.bottom + 90 };
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(body.x, body.y) });
  let gave = false;
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(body.x, body.y + i * 14) });
    await page.waitForTimeout(16);
    gave = gave || await page.evaluate(() => {
      const sc = KN.app.scrollerOf(document.querySelector(".panes > .screen.is-active"));
      return !!sc.style.transform && sc.style.transform !== "none";
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(600);
  c.check("当たり判定：紙の本体を上端で引くと送る器に transform が付く", gave);
  c.check("紙の本体を引いても暦は開かない",
    await page.evaluate(() => KN.store.calPrefs("todo").open === false));

  /* ---- 暦のマスの印はタブごと ---- */
  await page.evaluate(() => KN.store.addWeight({ day: "2026-09-14", kg: 60 }));
  await go("diet");
  const dietBars = await page.$$eval("#head .cal .cal-bar", (x) => x.length);
  c.check("ダイエットの暦には飲酒の帯が出る", dietBars > 0, `${dietBars}`);
  /* 帯の色は淡く（ほかのタブの丸と同じ、地へ 55% 混ぜた色）。元の色のままでは
     暦の中でここだけ濃く浮いた（実機）。明るさで、元の色より地に寄っていること。 */
  const pale = await page.evaluate(() => {
    const i = document.querySelector("#head .cal .cal-bar i");
    const lum = (c) => { const p = document.createElement("i"); p.style.color = c; document.body.append(p);
      const t = getComputedStyle(p).color; p.remove();
      const m = t.replace(/^color\(srgb/, "").match(/[\d.]+/g).map(Number);
      const k = t.startsWith("color(") ? 255 : 1;          // color-mix は color(srgb 0..1)
      return (m[0] + m[1] + m[2]) * k / 3; };
    const raw = getComputedStyle(i).getPropertyValue("--bar").trim();
    const bg = getComputedStyle(document.body).getPropertyValue("--c-bg").trim();
    const now = lum(getComputedStyle(i).backgroundColor);
    return { raw: lum(raw), now, bg: lum(bg) };
  });
  c.check("飲酒の帯は淡い色（元の色と地のあいだ）",
    Math.abs(pale.now - pale.bg) < Math.abs(pale.raw - pale.bg) * 0.6, JSON.stringify(pale));
  await go("archive");
  c.check("daily の暦にダイエットの帯を出さない",
    await page.$$eval("#head .cal .cal-bar", (x) => x.length) === 0);
  await go("todo");
  c.check("やることの暦にもダイエットの帯を出さない",
    await page.$$eval("#head .cal .cal-bar", (x) => x.length) === 0);
  c.check("帯の暦は一枚だけ", await page.$$eval("#head .cal", (x) => x.length) === 1);

  /* ---- 席を移るとき、印は重ねて替わる（段4） ----
     やること（今日に用事の丸）→ ダイエット。移った直後、出ていく印の写しが
     帯の直下に同じ位置で重なり、入ってきた暦の印は浮かび上がる途中。
     写しは `.cal` の外なので、そのあいだも「暦は一枚・daily の約束」は崩れない。
     流れ終われば写しは消える。 */
  const before = await page.evaluate(() => {
    const d = document.querySelector(`#head .cal .cal-day[data-day="${KN.util.todayKey()}"] .cal-dots`);
    const r = d.getBoundingClientRect();
    return { n: d.querySelectorAll(".cal-mark").length, x: r.left, y: r.top };
  });
  await tapSel('.tab[data-tab="diet"]');
  const mid = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    const g = document.querySelector("#head > .head-ghost");
    const m = g && g.querySelector(".cal-dots");
    const r = m && m.getBoundingClientRect();
    const cal = document.querySelector("#head .cal");
    res({ ghost: !!g, marks: g ? g.querySelectorAll(".cal-mark").length : 0,
      x: r ? r.left : null, y: r ? r.top : null, op: g ? Number(getComputedStyle(g).opacity) : null,
      fadingIn: cal.classList.contains("is-marks-in"), cals: document.querySelectorAll("#head .cal").length,
      inert: g ? g.getAttribute("aria-hidden") === "true" && getComputedStyle(g).pointerEvents === "none" : false });
  })));
  c.check("移った直後：出ていく印の写しが重なる", mid.ghost && mid.marks === before.n && before.n > 0,
    JSON.stringify({ mid, before }));
  c.check("写しは元の印と同じ位置", Math.abs(mid.x - before.x) < 0.6 && Math.abs(mid.y - before.y) < 0.6,
    JSON.stringify({ mid, before }));
  c.check("入ってきた暦の印は浮かび上がる途中・暦は一枚のまま", mid.fadingIn && mid.cals === 1);
  c.check("写しは押せず、読み上げにも出ない", mid.inert);
  /* 消える→出る は順に。毎フレーム、写しと入ってきた印の不透明度を測り、
     両方が同時に見えている一拍が無いこと（実機で重なって見えた）。 */
  const seq = await page.evaluate(() => new Promise((res) => {
    const out = [];
    const t0 = performance.now();
    const tick = () => {
      const g = document.querySelector("#head > .head-ghost");
      const d = document.querySelector("#head .cal .cal-dots:not(:empty)");
      out.push([g ? Number(getComputedStyle(g).opacity) : 0, d ? Number(getComputedStyle(d).opacity) : 1]);
      if (performance.now() - t0 < 600) requestAnimationFrame(tick); else res(out);
    };
    tick();
  }));
  const both = seq.filter(([g, d]) => g > 0.02 && d > 0.02);
  c.check("写しと入ってきた印は、同時には見えない", both.length === 0 && seq.some(([g]) => g > 0.02),
    JSON.stringify(both.slice(0, 4)));
  await page.waitForTimeout(300);
  c.check("流れ終わると写しは消え、印は出きっている", await page.evaluate(() =>
    !document.querySelector("#head .head-ghost")
    && !document.querySelector("#head .cal").classList.contains("is-marks-in")));

  /* ---- 買うものの暦：その日に買ったものの丸（段4） ----
     やることの暦と同じ `.cal-mark`。同じ品物は一つ、三つまで。買っていない
     （チェックの無い）ものは出さない。 */
  await page.evaluate(() => {
    const s = KN.store.get();
    const ps = s.products.slice(0, 5);
    const at = (h) => new Date(2026, 8, 14, h, 0).toISOString();
    const when = new Map();
    ps.forEach((p, i) => when.set(KN.store.addItem(p.id).id, at(9 + i)));
    /* 同じ品物をもう一度（丸は一つのまま）。 */
    when.set(KN.store.addItem(ps[0].id).id, at(16));
    KN.store.update((st) => st.items.forEach((i) => {
      if (when.has(i.id)) { i.checked = true; i.checkedAt = when.get(i.id); }
    }));
  });
  await go("list");
  const shopMarks = await page.evaluate(() => {
    const cell = (k) => document.querySelector(`#head .cal .cal-day[data-day="${k}"]`);
    const m14 = cell("2026-09-14").querySelectorAll(".cal-mark");
    return { n14: m14.length, n15: cell("2026-09-15").querySelectorAll(".cal-mark").length,
      drawn: [...m14].every((m) => !!m.querySelector(".todo-mark svg, .todo-mark .todo-dot")),
      tinted: [...m14].every((m) => !!m.style.getPropertyValue("--cat")) };
  });
  c.check("買うものの暦：買った日に丸が出る（三つまで）", shopMarks.n14 === 3, JSON.stringify(shopMarks));
  c.check("買っていない日には出ない", shopMarks.n15 === 0, JSON.stringify(shopMarks));
  c.check("丸の中に絵（当たらなければ小さな丸）・カテゴリの色", shopMarks.drawn && shopMarks.tinted);
  /* 片づけ（この先の試験は、買うものの暦を印なしの前提で見ている）。 */
  await page.evaluate(() => KN.store.update((s) => { s.items = s.items.filter((i) => !i.checked); }));
  await go("todo");

  /* ---- 虫めがね：共通のボタン、窓はタブ側（暦の下）に開く ---- */
  await startRec();
  await tapSel("#head .js-search-btn");
  await page.waitForTimeout(500);
  const sr = drift(await stopRec());
  const win = await page.evaluate(() => {
    const w = document.querySelector("#screen-todo .search-wrap");
    const cal = document.querySelector("#head .cal").getBoundingClientRect();
    return { shown: !w.hidden, top: w.getBoundingClientRect().top, calBottom: cal.bottom,
      other: document.querySelector("#screen-archive .search-wrap")
        ? document.querySelector("#screen-archive .search-wrap").hidden : true };
  });
  c.check("虫めがねでやることの窓が開く（暦の下）", win.shown && win.top >= win.calBottom - 1,
    JSON.stringify(win));
  c.check("よそのタブの窓は開かない", win.other);
  c.check("窓を開いても帯と暦は動かない", sr.worst === 0, `${sr.worst}px ${sr.what}`);
  await page.keyboard.type("zz");
  await page.waitForTimeout(300);
  c.check("探しているあいだも帯の暦は出たまま",
    await page.$$eval("#head .cal", (x) => x.length === 1 && !x[0].classList.contains("is-hidden")));
  c.check("絞っているあいだ虫めがねが光る",
    await page.$eval("#head .js-search-btn", (e) => e.classList.contains("is-on")));
  await go("archive");
  c.check("daily へ移ると虫めがねは光らない（daily は絞っていない）",
    await page.$eval("#head .js-search-btn", (e) => !e.classList.contains("is-on")));
  await go("todo");
  await page.evaluate(() => {
    const i = document.querySelector("#screen-todo .js-search");
    i.value = ""; i.dispatchEvent(new Event("input"));
    i.blur();
  });
  await page.waitForTimeout(300);

  /* ---- 題を押したときの応えは、タブごと ---- */
  await tapSel("#head .js-day-title");
  await page.waitForTimeout(600);
  c.check("やることの題：週⇄月", await page.evaluate(() => KN.store.calPrefs(null).open === true));
  await tapSel("#head .js-day-title");
  await page.waitForTimeout(600);
  await go("archive");
  await tapSel("#head .js-day-title");
  await page.waitForTimeout(600);
  c.check("daily の題：月を選ぶ紙が開き、暦の段は変えない",
    await page.evaluate(() => !!document.querySelector(".sheet") && KN.store.calPrefs(null).open === false));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  /* ---- 設定は帯ごと押しのける ---- */
  await go("todo");
  await startRec();
  await tapSel("#head .js-settings");
  await page.waitForTimeout(700);
  const push = await stopRec();
  const deckMin = Math.min(...push.map((f) => f.deck));
  const together = push.every((f) => !f.head || Math.abs(f.head[0] - f.deck) < 0.6);
  c.check("設定へ：deck（帯ごと）が押しのけられる", deckMin < -50, `${deckMin}`);
  c.check("設定へ：帯は deck と一緒に動く", together);
  const covered = await page.evaluate(() => {
    const t = document.querySelector("#head .js-day-title").getBoundingClientRect();
    const hit = document.elementFromPoint(t.left + 10, t.top + t.height / 2);
    return !!hit && !!hit.closest("#screen-settings");
  });
  c.check("設定の一枚が帯の上に重なる", covered);
  await page.evaluate(() => KN.app.backScreen());
  await page.waitForTimeout(700);
  c.check("設定から戻ると帯はやることのまま・位置も元どおり", (await owner()) === "todo"
    && await page.evaluate(() => document.getElementById("head").getBoundingClientRect().left === 0
      && !document.getElementById("deck").style.transform));

  /* ---- 買うもの・価格（段3）：帯は動かない ---- */
  const calEl = () => page.evaluate(() => {
    const c = document.querySelector("#head .cal");
    if (c && !c.__id) c.__id = Math.random();
    return c ? c.__id : null;
  });
  const title = () => page.$eval("#head .js-day-title", (e) => e.textContent.replace(/\s+/g, ""));
  /** 掴み手を本物のタッチで下へ引いて、価格へ。帯の記録つき。 */
  const toPrices = async () => {
    if ((await owner()) !== "list") await go("list");
    const g = await center("#screen-list .tl-grip");
    await startRec();
    await drag(g.x, g.y, 300);
    await page.waitForTimeout(800);
    return stopRec();
  };
  for (const open of [false, true]) {
    const mode = open ? "月" : "週";
    await page.evaluate((o) => KN.store.setCalPref(null, { shown: true, open: o }), open);
    await go("list");
    await page.waitForTimeout(300);
    const id0 = await calEl();
    const t0 = await title();
    const fp = await toPrices();
    const dp = drift(fp);
    c.check(`${mode}：掴み手を引いて価格へ（本物のタッチ）`, (await owner()) === "prices",
      String(await owner()));
    c.check(`${mode}：買うもの → 価格 で帯と暦が動かない（${fp.length}フレーム）`,
      dp.worst === 0 && fp.length > 10, `${dp.worst}px ${dp.what}`);
    c.check(`${mode}：価格へ移っても暦は同じ一枚・題も同じ`,
      (await calEl()) === id0 && (await title()) === t0, `${t0} → ${await title()}`);
    c.check(`${mode}：買っていなければ、買うもの・価格の暦に印は無い`,
      await page.$$eval("#head .cal .cal-dots", (x) => x.length > 0 && x.every((d) => !d.childElementCount)));

    /* 価格の地：帯の下から始まり、いちばん下の行まで送れる。紙の頭は下の帯の上。 */
    const ground = await page.evaluate(async () => {
      const head = document.getElementById("head").getBoundingClientRect();
      const scr = document.getElementById("screen-prices");
      const bar = document.getElementById("tabbar").getBoundingClientRect();
      const grip = document.querySelector("#screen-list .tl-grip").getBoundingClientRect();
      scr.scrollTop = scr.scrollHeight;
      await new Promise((r) => setTimeout(r, 200));
      const rows = [...scr.querySelectorAll(".prices-ground .product")];
      const last = rows.length ? rows[rows.length - 1].getBoundingClientRect() : null;
      const first = scr.getBoundingClientRect();
      scr.scrollTop = 0;
      return { headBottom: head.bottom, scrTop: first.top, barTop: bar.top,
        gripTop: grip.top, gripBottom: grip.bottom, rows: rows.length,
        lastBottom: last && last.bottom, canScroll: scr.scrollHeight > scr.clientHeight };
    });
    c.check(`${mode}：価格の地は帯と暦の下から始まる`,
      Math.abs(ground.scrTop - ground.headBottom) <= 1, JSON.stringify(ground));
    c.check(`${mode}：価格のいちばん下の行まで送れる（下の帯より上に出る）`,
      ground.rows >= 20 && ground.canScroll && ground.lastBottom <= ground.barTop + 1, JSON.stringify(ground));
    c.check(`${mode}：留まった紙の頭は下の帯のすぐ上`,
      ground.gripBottom <= ground.barTop + 1 && ground.gripTop > ground.headBottom, JSON.stringify(ground));

    // 価格 → 帯の「買うもの」で戻る
    await startRec();
    await page.waitForTimeout(60);
    await tapSel('.tab[data-tab="list"]');
    await page.waitForTimeout(800);
    const db = drift(await stopRec());
    c.check(`${mode}：価格 → 買うもの（帯を押して）で帯と暦が動かない`,
      db.worst === 0 && (await owner()) === "list", `${db.worst}px ${db.what}`);
    // 価格 → よそのタブ
    for (const b of ["todo", "diet"]) {
      await toPrices();
      await startRec();
      await page.waitForTimeout(60);
      await tapSel(`.tab[data-tab="${b}"]`);
      await page.waitForTimeout(700);
      const rec = await stopRec();
      const d = drift(rec);
      c.check(`${mode}：価格 → ${b} で帯と暦が動かない`,
        d.worst === 0 && (await owner()) === b, `${d.worst}px ${d.what}`);
      c.check(`${mode}：価格 → ${b} で留まった紙が片づく`,
        await page.evaluate(() => !document.querySelector(".screen.is-face-parked")));
    }
  }
  await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: false }));

  /* 題を押すと週⇄月（買うもの・価格の応え） */
  await go("list");
  await tapSel("#head .js-day-title");
  await page.waitForTimeout(600);
  c.check("買うものの題：週⇄月", await page.evaluate(() => KN.store.calPrefs(null).open === true
    && !document.querySelector("#head .cal").classList.contains("is-week")));
  await tapSel("#head .js-day-title");
  await page.waitForTimeout(600);
  c.check("もう一度押すと週へ", await page.evaluate(() => KN.store.calPrefs(null).open === false));

  /* 日を押す：題と共通の日だけが動き、紙は組み直さない */
  await page.evaluate(() => { document.querySelector("#screen-list .js-body").firstElementChild.__keep = 1; });
  await tapSel('#head .cal .cal-day[data-day="2026-09-17"]');
  await page.waitForTimeout(400);
  c.check("暦の日を押すと題がその日に", (await title()).includes("9月17日"), await title());
  c.check("日を押しても買うものの紙は組み直さない", await page.evaluate(() =>
    document.querySelector("#screen-list .js-body").firstElementChild.__keep === 1));
  c.check("輪がその日に", await page.evaluate(() =>
    !!document.querySelector('#head .cal .cal-day.is-here[data-day="2026-09-17"]')));
  await tapSel('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);
  c.check("やることへ移ると、その日（共通の日）", (await title()).includes("9月17日")
    && await page.evaluate(() => KN.screens.todo.day() === "2026-09-17"), await title());
  await tapSel("#head .js-go-today");
  await page.waitForTimeout(500);
  await tapSel('.tab[data-tab="list"]');
  await page.waitForTimeout(700);
  c.check("やることで今日へ戻ってから買うものへ：買うものも今日", (await title()).includes("9月15日"),
    await title());

  /* 紙を横に払っても、日は動かない（day-swipe は付けない） */
  const sheet = await page.evaluate(() => {
    const r = document.querySelector("#screen-list .tl-sheet").getBoundingClientRect();
    return { x: r.left + r.width * 0.75, y: r.top + 120 };
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(sheet.x, sheet.y) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(sheet.x - i * 18, sheet.y) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(600);
  c.check("買うものの紙を横に払っても日は動かない", (await title()).includes("9月15日")
    && (await owner()) === "list", await title());

  /* 虫めがね：買うものの窓が開き、よそは開かない */
  await tapSel("#head .js-search-btn");
  await page.waitForTimeout(500);
  c.check("虫めがねで買うものの窓が開く（暦の下）", await page.evaluate(() => {
    const w = document.querySelector("#screen-list .search-wrap");
    return !w.hidden && w.getBoundingClientRect().top >= document.querySelector("#head .cal").getBoundingClientRect().bottom - 1
      && document.querySelector("#screen-todo .search-wrap").hidden;
  }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  c.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  c.done();
})();
