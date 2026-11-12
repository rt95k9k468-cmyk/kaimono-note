/* 開いたときの一拍を四つのタブへ（roadmap-unify の U16、docs/motion.md の「開いたとき、満ちる」）。
   時計を 14:00 に止めて：
   - やること：過ぎたぶんの色（--pass）が開いた拍は頭の色で、上から流れて減らずに本当の値へ着く。
     いま進んでいる一件（is-live）と「いま」の札は流れているあいだも動かない
   - からだ：体重の大きな数が前の記録（63.0）から数えて 62.0 へ。途中の数がいくつも出て減る向きだけ、
     字（textContent）はずっと本当の数、終われば data-show は外れる。前の記録が無ければ data-from も無い
   - 帯：暦の今日の丸は、その日はじめて開いたときだけ脈打つ（席を移っても二度は打たない）。
     設定では帯を迎えない（見たことにしない）
   - 動きを減らす設定では、どれも動かない */
const { open, checker } = require("./lib");

const t = checker("arrive-tabs");
const AT = new Date(2026, 9, 7, 14, 0);

/* 押す前から rAF で記録し、ページの時計で ms ぶん集めて返す。read は毎フレーム呼ぶ関数の本文。 */
const record = async (page, read, click, ms = 2400) => {
  await page.evaluate((src) => {
    const fn = new Function(src);
    const rec = window.__rec = [];
    /* page.clock の performance.now は、混むと遅れたタイマーの時刻へ巻き戻る（本物は戻らない）。
       流れはその時計で進むので、巻き戻った拍に色が減って見えた（2026年10月20日、6本並べて4本）。 */
    if (!window.__pnMono) {
      window.__pnMono = true;
      const f = performance.now.bind(performance);
      let mx = 0;
      performance.now = () => (mx = Math.max(mx, f()));
    }
    const tick = () => { if (window.__rec !== rec) return; rec.push(fn()); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, read);
  /* 記録するあいだはページの時計を止め、runFor で進める（rAF は 16ms ごとに必ず一コマ）。本物の時間で待つと、
     混んだ機械では拾えるコマが減り「途中の色がいくつも」が落ちた（2026年10月24日、全部回しの3本並べ）。 */
  await page.clock.pauseAt(AT);
  await page.click(click);
  await page.clock.runFor(ms);
  await page.clock.resume();
  return page.evaluate(() => { const r = window.__rec; window.__rec = null; return r; });
};
const away = async (page, tab) => {
  await page.click(`.tab[data-tab="${tab}"]`);
  await page.waitForFunction(() => !document.querySelector(".is-m-arrive"), null, { timeout: 5000 });
};

(async () => {
  {
    const { browser, page, errors } = await open({ before: async (cx, p) => { await p.clock.setFixedTime(AT); } });

    /* ---- 帯：起動で一度打って、今日の日付を覚える ---- */
    const key0 = await page.evaluate(() => [localStorage.getItem("kn-cal-beat"), KN.util.todayKey()]);
    t.check("起動の一拍で、今日を見たと覚える", key0[0] === key0[1], key0.join(" / "));

    /* ---- 下ごしらえ ---- */
    const ids = await page.evaluate(() => {
      const S = KN.store, d = KN.util.todayKey();
      const a = S.addTodo({ title: "朝の用事", due: d, time: "08:00", minutes: 60 }).id;
      const b = S.addTodo({ title: "昼の用事", due: d, time: "11:00", minutes: 60 }).id;
      const c = S.addTodo({ title: "いまの用事", due: d, time: "13:00", minutes: 120 }).id;
      S.addTodo({ title: "夕方の用事", due: d, time: "17:00", minutes: 30 });
      S.addWeight({ day: d, kg: 62 });
      return { a, b, c };
    });
    await away(page, "diet");
    t.check("前の記録が無ければ data-from は無い", await page.evaluate(() => {
      const b = document.querySelector("#screen-diet .js-day-card .diet-hero-value b");
      return !!b && b.dataset.from == null;
    }));
    await page.evaluate(() => KN.store.addWeight({ day: KN.util.shiftDay(KN.util.todayKey(), -1), kg: 63 }));
    await away(page, "todo");
    await away(page, "list");

    /* ---- やること ---- */
    const tl = await record(page, `
      const q = (id) => document.querySelector('#screen-todo .tl-row[data-todo-id="' + id + '"]');
      const v = (id) => { const li = q(id); return li ? parseFloat(li.style.getPropertyValue("--pass")) : null; };
      const live = q(${JSON.stringify(ids.c)});
      if (!document.querySelector("#screen-todo.is-m-arrive")) return { a: null };
      return { a: v(${JSON.stringify(ids.a)}), b: v(${JSON.stringify(ids.b)}), c: v(${JSON.stringify(ids.c)}),
        live: !!(live && live.classList.contains("is-live")),
        now: !!document.querySelector("#screen-todo .tl-axis .tl-now, #screen-todo .tl-axis > *") };
    `, '.tab[data-tab="todo"]');
    const tlf = tl.filter((f) => f.a != null);
    t.check("やること：記録できた", tlf.length > 20, String(tlf.length));
    const first = tlf[0] || {};
    t.check("開いた拍は頭の色（朝の用事がまだ満ちていない）", first.a != null && first.a < 0.5, JSON.stringify(first));
    const mono = (k) => tlf.every((f, i) => i === 0 || f[k] >= tlf[i - 1][k] - 1e-6);
    const drop = tlf.findIndex((f, i) => i > 0 && ["a", "b", "c"].some((k) => !(f[k] >= tlf[i - 1][k] - 1e-6)));
    t.check("朝・昼・いまの用事の色は減らない", mono("a") && mono("b") && mono("c"),
      JSON.stringify(tlf.slice(Math.max(0, drop - 1), drop + 1)));
    t.check("上から順に着く（朝が満ちるのは昼より先）",
      tlf.findIndex((f) => f.a >= 1) <= tlf.findIndex((f) => f.b >= 1) && tlf.findIndex((f) => f.b >= 1) > 0);
    const end = tlf[tlf.length - 1] || {};
    t.check("着いた先は本当の値（朝 1・昼 1・いま 0.5）", end.a === 1 && end.b === 1 && Math.abs(end.c - 0.5) < 0.01, JSON.stringify(end));
    t.check("途中の色がいくつも出る（パンと出ない）", new Set(tlf.map((f) => f.b)).size > 5);
    t.check("いま進んでいる一件は流れているあいだも is-live", tlf.every((f) => f.live));

    /* ---- からだ ---- */
    const dt = await record(page, `
      const b = document.querySelector("#screen-diet .js-day-card .diet-hero-value b");
      return b ? { text: b.textContent, show: b.dataset.show, from: b.dataset.from } : null;
    `, '.tab[data-tab="diet"]');
    const df = dt.filter(Boolean);
    const shows = df.map((f) => f.show).filter((s) => s != null).map(Number);
    t.check("からだ：前の記録を覚えている（data-from 63）", df.length && df[0].from === "63", JSON.stringify(df[0]));
    t.check("数えはじめは前の記録の近く", shows.length && shows[0] >= 62.8, String(shows[0]));
    t.check("減る向きだけ・途中の数がいくつも", shows.every((s, i) => i === 0 || s <= shows[i - 1]) && new Set(shows).size >= 5, shows.join(","));
    t.check("字はずっと本当の数", df.every((f) => f.text === "62.0"));
    t.check("終われば data-show は外れる", df.length && df[df.length - 1].show == null);

    /* ---- 帯：その日のうちは二度打たない ---- */
    await away(page, "todo");
    const beat = () => page.evaluate(() => {
      const n = document.querySelector("#head .cal-day.is-today .cal-n");
      return { first: document.getElementById("head").classList.contains("is-day-first"),
        anim: n ? getComputedStyle(n).animationName : "(なし)" };
    });
    const again = await beat();
    t.check("席を移っても、今日の丸は二度打たない", !again.first && again.anim === "none", JSON.stringify(again));
    await page.evaluate(() => localStorage.removeItem("kn-cal-beat"));
    await page.click('.tab[data-tab="diet"]');
    const fresh = await beat();
    t.check("その日はじめての拍で、今日の丸が脈打つ", fresh.first && fresh.anim === "poke-beat", JSON.stringify(fresh));
    await away(page, "archive");
    await page.evaluate(() => localStorage.removeItem("kn-cal-beat"));
    await page.click("#head .js-settings");
    await page.waitForTimeout(300);
    t.check("設定では帯を迎えない（見たことにしない）",
      await page.evaluate(() => localStorage.getItem("kn-cal-beat") == null));

    t.check("エラーなし", errors.length === 0, errors.join(" | "));
    await browser.close();
  }

  /* ---- RM：棒は左の札から順に・日を替えたら描き直す・入りは上から順に（docs/motion.md「入りと順送り」） ---- */
  {
    const { browser, page, errors } = await open({ before: async (cx, p) => { await p.clock.setFixedTime(AT); } });
    await page.evaluate(() => {
      const S = KN.store, d = KN.util.todayKey();
      for (let i = 0; i < 7; i++) S.setHealth(KN.util.shiftDay(d, -i), "steps", 3000 + i * 400);
      S.addWeight({ day: KN.util.shiftDay(d, -1), kg: 63 });
      S.addTodo({ title: "夕方の用事", due: d, time: "16:00", minutes: 60 });
    });
    await page.click('.tab[data-tab="diet"]');
    await page.waitForTimeout(80);
    const delay = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).animationDelay) : null; }, sel);
    const a = await delay("#screen-diet .hl-met:nth-child(1) .hl-bars i:nth-child(1)");
    const b = await delay("#screen-diet .hl-met:nth-child(1) .hl-bars i:nth-child(7)");
    const c = await delay("#screen-diet .hl-met:nth-child(2) .hl-bars i:nth-child(1)");
    t.check("棒：同じ札は左から順に", a === 0 && b > a, `${a} ${b}`);
    t.check("棒：次の札は遅れて始まる", c > a, `${a} ${c}`);
    await page.waitForTimeout(2600);
    const y = await page.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), -1));
    await page.click(`#head .cal-day[data-day="${y}"]`);
    await page.waitForTimeout(60);
    t.check("日を替えたら棒が描き直される", await page.evaluate(() => {
      const s = document.querySelector("#screen-diet .js-track > .is-m-arrive");
      return !!s && document.getAnimations().some((x) => x.animationName === "bar-grow");
    }));
    await page.waitForTimeout(2600);
    await page.evaluate(() => KN.store.addWeight({ day: KN.util.shiftDay(KN.util.todayKey(), -1), kg: 62.5 }));
    await page.waitForTimeout(60);
    t.check("保存の組み直しでは描き直さない", await page.evaluate(() => !document.querySelector("#screen-diet .js-track > .is-m-arrive")));
    await page.click('.tab[data-tab="archive"]');
    await page.waitForTimeout(60);
    const d2 = await delay("#screen-archive .day-slide.m-in > :nth-child(2)");
    t.check("daily の入り：二つめは遅れて浮かぶ", d2 > 0, String(d2));
    /* 額の絵を押すと、額から膨らむ一枚（黒地の紙） */
    const art = page.locator("#screen-archive .arc-season-art").first();
    if (await art.count()) {
      await page.waitForTimeout(1500);
      await art.click();
      await page.waitForTimeout(700);
      t.check("候の絵を押すと大きな一枚", await page.evaluate(() => !!document.querySelector(".sheet.is-pic.is-open .note-pic img")));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    } else t.check("候の絵がある", false);
    /* 道がひらく・畳む：帯に is-m-arrive（幕が退く／中身が浮かぶ） */
    await page.click('.tab[data-tab="todo"]');
    await page.waitForTimeout(400);
    await page.click("#screen-todo .strip-open");
    t.check("道がひらく拍に幕", await page.evaluate(() => {
      const s = document.querySelector("#screen-todo .day-strip.is-open.is-m-arrive");
      return !!s && getComputedStyle(s, "::after").animationName === "wipe-off";
    }));
    await page.click("#screen-todo .strip-fold");
    t.check("畳むと帯の中身が浮かぶ", await page.evaluate(() => !!document.querySelector("#screen-todo .day-strip.is-m-arrive:not(.is-open)")));
    /* 本棚の冊（頭の無い冊）を押すと、表紙が冊の行の絵へ飛ぶ */
    await page.evaluate(async () => { await KN.notes.addMany([{ id: "n-rm", title: "棚の一冊", body: "", notebook: "private", tags: [], fav: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }]); });
    await page.click('.tab[data-tab="notes"]');
    await page.waitForTimeout(600);
    const bk = page.locator('#screen-notes .nt-bk[data-nb="private"]:not([data-id])').first();
    if (await bk.count()) {
      await bk.click({ noWaitAfter: true });
      t.check("本棚の表紙が飛ぶ", await page.evaluate(() => !!document.querySelector(".nt-fly")));
    } else t.check("頭の無い冊がある", false);
    t.check("RM：エラーなし", errors.length === 0, errors.join(" | "));
    await browser.close();
  }

  /* ---- RM：広い幅で月の面へ——今週の段が帯から紙の左のカードへ伸び縮みして移る ---- */
  {
    const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 }, before: async (cx, p) => { await p.clock.setFixedTime(AT); } });
    await page.evaluate(() => { KN.store.addTodo({ title: "夕方の用事", due: KN.util.todayKey(), time: "16:00", minutes: 60 }); KN.app.showScreen("todo"); });
    await page.waitForTimeout(900);
    await page.locator('[data-face="month"]').first().click({ noWaitAfter: true });
    const hop = await page.evaluate(() => {
      const cal = document.querySelector("#screen-todo .mo-cal .cal");
      const a = cal && cal.getAnimations().find((x) => !x.animationName);
      const k = a && a.effect.getKeyframes()[0];
      return { inCard: !!cal, from: k ? k.transform : null, head: document.querySelector("#head .head-cal.is-cal-out") !== null };
    });
    t.check("月の面：暦は紙のカードへ、帯の前の段の箱から伸び縮みして移る", hop.inCard && /scale/.test(hop.from || ""), JSON.stringify(hop));
    t.check("月の面：帯の暦は出入りの一拍でしまわれる", hop.head);
    t.check("月の面：エラーなし", errors.length === 0, errors.join(" | "));
    await browser.close();
  }

  /* ---- 動きを減らす設定 ---- */
  {
    const { browser, page, errors } = await open({
      before: async (cx, p) => { await p.emulateMedia({ reducedMotion: "reduce" }); await p.clock.setFixedTime(AT); },
    });
    const id = await page.evaluate(() => {
      const S = KN.store, d = KN.util.todayKey();
      S.addWeight({ day: KN.util.shiftDay(d, -1), kg: 63 });
      S.addWeight({ day: d, kg: 62 });
      return S.addTodo({ title: "朝の用事", due: d, time: "08:00", minutes: 60 }).id;
    });
    t.check("減らす設定：起動で今日の丸を打たない", await page.evaluate(() => !document.getElementById("head").classList.contains("is-day-first")));
    const tl = await record(page, `
      const li = document.querySelector('#screen-todo .tl-row[data-todo-id="${id}"]');
      return li ? parseFloat(li.style.getPropertyValue("--pass")) : null;
    `, '.tab[data-tab="todo"]', 500);
    t.check("減らす設定：色は流れない", tl.filter((v) => v != null).every((v) => v === 1), tl.join(","));
    const dt = await record(page, `
      const b = document.querySelector("#screen-diet .js-day-card .diet-hero-value b");
      return b ? b.dataset.show || null : null;
    `, '.tab[data-tab="diet"]', 500);
    t.check("減らす設定：体重は数えない", dt.every((v) => v == null), dt.join(","));
    t.check("減らす設定：エラーなし", errors.length === 0, errors.join(" | "));
    await browser.close();
  }
  t.done();
})();
