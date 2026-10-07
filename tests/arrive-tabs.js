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

/* 押す前から rAF で記録し、ms ぶん集めて返す。read は毎フレーム呼ぶ関数の本文。 */
const record = async (page, read, click, ms = 2400) => {
  await page.evaluate((src) => {
    const fn = new Function(src);
    const rec = window.__rec = [];
    const tick = () => { if (window.__rec !== rec) return; rec.push(fn()); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, read);
  await page.click(click);
  await page.waitForTimeout(ms);
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
    t.check("朝・昼・いまの用事の色は減らない", mono("a") && mono("b") && mono("c"));
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
