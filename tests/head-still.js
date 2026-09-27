/* 上の帯と暦は、全タブで一つ（docs/shared-header.md の段2、2026年9月27日）。

   時計を 2026年9月15日(火) 10:00 に止めて開く。
   - タブを移っているあいだ、帯・題・暦・曜日の行・日のマスの位置と大きさを
     **毎フレーム**測り、動いた量が 0px であること（週・月の両方、六通りの移り方）。
     入ってくる画面のほうは本当に流れていること（流れていなければ試験にならない）。
     下の帯のボタンは CDP の本物のタッチで押す。
   - 掴み手を本物のタッチで下へ引くと、帯の暦が月へ開き（帯の題は動かない）、
     紙の上端が暦の下端に来る。月のまま daily へ移っても帯は動かない。
     当たり判定：紙の本体を上端で下へ引くと送る器に transform が付く。
   - 暦のマスの印はタブごと（ダイエットの飲酒の帯が daily・やることに出ない）。
   - 虫めがねは共通・窓はタブ側（暦の下）に開き、開いても帯は動かない。
   - 題を押したときの応えはタブごと（やること：週⇄月、daily：月を選ぶ紙）。
   - 設定は帯ごと押しのける（deck が動き、設定の一枚が帯の上に重なる）。
   - 買うものへ移ると帯は隠れ（段2の暫定）、戻ると出る。 */
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
    KN.store.setCalPref(null, { shown: true, open: false });
  });
  await go("todo");

  /* ---- タブを移っても、帯と暦は 1px も動かない（週・月） ---- */
  const hops = [["todo", "archive"], ["archive", "diet"], ["diet", "todo"],
                ["todo", "diet"], ["diet", "archive"], ["archive", "todo"]];
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
  await go("archive");
  c.check("daily の暦にダイエットの帯を出さない",
    await page.$$eval("#head .cal .cal-bar", (x) => x.length) === 0);
  await go("todo");
  c.check("やることの暦にもダイエットの帯を出さない",
    await page.$$eval("#head .cal .cal-bar", (x) => x.length) === 0);
  c.check("帯の暦は一枚だけ", await page.$$eval("#head .cal", (x) => x.length) === 1);

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

  /* ---- 買うもの（段2の暫定）：帯は隠れ、戻ると出る ---- */
  await tapSel('.tab[data-tab="list"]');
  await page.waitForTimeout(700);
  c.check("買うものでは帯が隠れる", await page.evaluate(() => document.getElementById("head").hidden));
  c.check("買うものの題はそのまま出ている",
    await page.evaluate(() => !!document.querySelector("#screen-list .topbar").getBoundingClientRect().height));
  await tapSel('.tab[data-tab="diet"]');
  await page.waitForTimeout(700);
  c.check("ダイエットへ戻ると帯が出る", await page.evaluate(() => !document.getElementById("head").hidden
    && KN.head.mine("diet") && !!document.querySelector("#head .cal .cal-bar")));

  c.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  c.done();
})();
