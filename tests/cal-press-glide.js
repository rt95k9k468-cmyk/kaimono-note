/* 押して暦を開く・畳むときも滑る（2026年10月25日、利用者「パッとカレンダーが月表示になる」）。
   docs/calendar-swipe.md の「押しても滑る」、docs/todo-items.md の「月の面と暦の名前」。

   - 今日｜週｜月 の「月」・「週」・題を押す：**盆の背は押した一拍で行き着く先**（毎コマ並べ直さない。docs/redesign.md 7節の 1）。
     下の画面と暦の升は見かけ（translate）で、一コマで跳ばず途中を何コマも通る。最初の一コマは元の所のまま
     （重い組み直しの一拍のうちに滑りを始めると、最初の一コマで半分近く開いていた）。滑り終えたら何も残さない。
   - 月の面を開くと、紙は今日の行が「今日｜週｜月」の帯のすぐ下（過ぎた日は上へ隠れる）。題と輪は今日のまま（滑るあいだに
     送りが縮んで、題が過ぎた日へ跳ばない）。
   - 月の面は全タブの暦の札を書かない：買うものへ移っても暦は週。移るあいだ暦の置き場の背も滑る。
   - 週の面：頭から（今週の見出しが帯のすぐ下・過ぎた日は畳んで今日の行が最初）・時刻の列と点の列がそろう・今日の日付は塗り
     （日曜の赤い字と見分ける）・「仕事だけ」に青い点が無い。
   - からだ・買うものの題も同じ滑り（前は一拍で跳んでいた。2026年11月12日）。
   - 動きを減らす設定では滑らせない（一拍で行き先へ）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/cal-press-glide.js */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("cal-press-glide");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.install({ time: new Date(2026, 9, 21, 10, 0) }); },   // 水曜
  });
  await page.evaluate(() => {
    const S = KN.store;
    S.addTodo({ title: "打ち合わせ", due: "2026-10-19", time: "15:00", minutes: 60, kind: "event", side: "work" });
    S.addTodo({ title: "企画書の下書き", due: "2026-10-21", time: "13:00", minutes: 90, side: "work" });
    S.addTodo({ title: "歯医者", due: "2026-10-21", time: "18:30", kind: "event" });
    S.addTodo({ title: "電球を替える", due: "2026-10-22" });
    S.addTodo({ title: "出張（大阪）", due: "2026-10-22", endDay: "2026-10-23", kind: "event", side: "work" });
    S.addTodo({ title: "友だちと夕食", due: "2026-10-24", time: "19:00", kind: "event" });
    S.addTodo({ title: "健康診断", due: "2026-10-29", time: "9:00", kind: "event" });
  });
  await page.waitForTimeout(400);

  /* 押してから 600ms のあいだ、毎コマ：暦の置き場の背・題・紙の送り・下の画面の上のきわ（p）・今日の升の上のきわ（c）。
     p と c は見かけ（translate こみ）。 */
  const watch = () => page.evaluate(() => {
    window.__w = [];
    const t0 = performance.now();
    const tick = () => {
      const hc = document.querySelector("#head .head-cal");
      const sc = KN.app.scrollerOf(document.querySelector("#screen-todo"));
      window.__w.push({ ms: performance.now(), h: Math.round(hc.getBoundingClientRect().height), t: (document.querySelector("#head .js-day-title") || {}).textContent || "",
        peek: !!document.querySelector("#head .cal.is-peek"), top: Math.round(sc.scrollTop),
        p: Math.round(document.getElementById("panes").getBoundingClientRect().top),
        c: Math.round((document.querySelector('#head .cal-day[data-day="2026-10-21"]') || hc).getBoundingClientRect().top) });
      if (performance.now() - t0 < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const seen = async () => { await page.waitForTimeout(750); return page.evaluate(() => window.__w); };
  /** 始まりと終わりのあいだに、何コマ違う背を通ったか。 */
  const between = (w) => {
    const a = w[0].h, z = w[w.length - 1].h, lo = Math.min(a, z) + 3, hi = Math.max(a, z) - 3;
    return new Set(w.map((f) => f.h).filter((h) => h > lo && h < hi)).size;
  };
  /** 一コマで動いた背のいちばん大きいもの。**一コマ（16.7ms）あたりに直して**測る——滑りは時刻で進むので、
      混んだ CI でコマが落ちると次のコマにまとめて動く（6本ずつ並べた回に 229px で落ちた。2026年11月8日）。 */
  const leap = (w) => Math.max(0, ...w.slice(1).map((f, i) => Math.abs(f.h - w[i].h) * 16.7 / Math.max(16.7, f.ms - w[i].ms)));
  /** 下の画面の上のきわ（p）・今日の升の上のきわ（c）を、between / leap に掛ける形へ。 */
  const of = (w, k) => w.map((f) => ({ ms: f.ms, h: f[k] }));
  /** 盆は先に行き着く背を取る：置き場の背は「前」と「あと」の二つだけ（途中の背を通らない）。 */
  const snaps = (w) => new Set(w.map((f) => f.h)).size <= 2;
  /** 滑り終えたら、書いたものを残さない（暦の印・窓の背・ずらし・下の画面の translate・延ばした画面・送りしろ）。 */
  const clean = (id = "todo") => page.evaluate((id) => {
    const cal = document.querySelector("#head .cal"), scr = document.querySelector("#screen-" + id), sc = KN.app.scrollerOf(scr);
    const left = [];
    if (/is-peek|is-settling|is-rows/.test(cal.className)) left.push("cal:" + cal.className);
    if (/--cal-(ms|ease|o0|o1)/.test(cal.style.cssText)) left.push("cal.style:" + cal.style.cssText);   // --cal-row は画面のもの（fitTall）
    if (cal.querySelector(".cal-clip").style.cssText) left.push("clip:" + cal.querySelector(".cal-clip").style.cssText);
    if (cal.querySelector(".cal-slide").style.cssText) left.push("slide:" + cal.querySelector(".cal-slide").style.cssText);
    if (document.getElementById("panes").style.translate) left.push("panes");
    if (scr.style.bottom) left.push("bottom:" + scr.style.bottom);
    if (sc.style.paddingBottom) left.push("pad:" + sc.style.paddingBottom);
    if (document.getAnimations().some((a) => a.effect && a.effect.target && (a.effect.target.id === "panes" || a.effect.target.closest(".cal")))) left.push("anim");
    return left;
  }, id);

  // 週の面：頭から（今週の見出しが帯のすぐ下・過ぎた日は畳んで今日の行が最初）、時刻の列と点の列がそろう、今日の日付は塗り、「仕事だけ」に青い点が無い
  await page.click('#screen-todo .wk-faces [data-face="week"]');
  await page.waitForTimeout(700);
  const wk = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const bar = scr.querySelector(".wk-faces").getBoundingClientRect().bottom;
    const head = scr.querySelector(".wk > .wk-h");
    const first = scr.querySelector(".wk-week .wk-day");
    const xs = [...scr.querySelectorAll(".wk-week .wk-ev .wk-t")].filter((t) => t.textContent.trim()).map((t) => Math.round(t.getBoundingClientRect().left));
    const dots = [...scr.querySelectorAll(".wk-week .wk-ev .chip-dot")].map((t) => Math.round(t.getBoundingClientRect().left));
    const dn = (k) => getComputedStyle(scr.querySelector(`.wk-week .wk-day[data-day="${k}"] .wk-dn`));
    const work = scr.querySelector(".wk-work");
    return { gap: Math.round(head.getBoundingClientRect().top - bar), head: head.firstChild.textContent.trim(), first: first.dataset.day,
      fold: (scr.querySelector(".wk-past") || {}).textContent || "", top: Math.round(KN.app.scrollerOf(scr).scrollTop),
      xs: [...new Set(xs)], dots: [...new Set(dots)], todayBg: dn("2026-10-21").backgroundColor, sunBg: dn("2026-10-25").backgroundColor,
      dot: !!work.querySelector(".chip-dot"), cat: work.style.getPropertyValue("--cat") };
  });
  c.check("週の面は頭から：今週の見出しが帯のすぐ下・過ぎた日は畳んで今日の行が最初", Math.abs(wk.gap) <= 2 && wk.head === "今週"
    && wk.first === "2026-10-21" && /過ぎた日/.test(wk.fold) && wk.top === 0, JSON.stringify(wk));
  c.check("週の面の時刻の列と点の列がそろう", wk.xs.length === 1 && wk.dots.length === 1 && wk.dots[0] > wk.xs[0], JSON.stringify([wk.xs, wk.dots]));
  c.check("今日の日付は塗り・日曜は塗らない", !/rgba\(0, 0, 0, 0\)|transparent/.test(wk.todayBg) && /rgba\(0, 0, 0, 0\)|transparent/.test(wk.sunBg), JSON.stringify([wk.todayBg, wk.sunBg]));
  c.check("「仕事だけ」に青い点も色も無い", !wk.dot && !wk.cat, JSON.stringify([wk.dot, wk.cat]));

  // 週 → 月：滑る（最初の一コマは週の背のまま）
  await page.evaluate(() => { KN.app.scrollerOf(document.querySelector("#screen-todo")).scrollTop = 0; });
  await watch();
  await page.click('#screen-todo .wk-faces [data-face="month"]');
  let w = await seen();
  const first = w.find((f) => f.peek);
  c.check("「月」で下の画面が滑って下りる（一コマで跳ばない）", between(of(w, "p")) >= 4 && leap(of(w, "p")) < 200, JSON.stringify(w.map((f) => f.p)));
  c.check("盆は押した一拍で月の背を取る（毎コマ並べ直さない）", snaps(w) && w[w.length - 1].h - w[0].h > 300, JSON.stringify(w.map((f) => f.h)));
  c.check("滑りの最初の一コマは元の所のまま（下の画面・今日の升）", !!first && Math.abs(first.p - w[0].p) <= 2 && Math.abs(first.c - w[0].c) <= 2,
    JSON.stringify([w[0].p, first && first.p, w[0].c, first && first.c]));
  c.check("今日の升は跳ばずに月の中の段へ下りる", between(of(w, "c")) >= 4 && leap(of(w, "c")) < 120, JSON.stringify(w.map((f) => f.c)));
  c.check("滑るあいだ題は今日のまま", w.every((f) => /21日/.test(f.t)), JSON.stringify([...new Set(w.map((f) => f.t))]));
  c.check("滑るあいだ紙の送りは書いた所のまま（削られない）", w.filter((f) => f.peek).every((f) => f.top === w[w.length - 1].top) && w[w.length - 1].top > 0,
    JSON.stringify(w.map((f) => f.top)));
  let left = await clean();
  c.check("滑り終えたら何も残さない（月）", !left.length, left.join(" / "));
  const mo = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const bar = scr.querySelector(".wk-faces").getBoundingClientRect().bottom;
    const today = scr.querySelector('.mo-day[data-day="2026-10-21"]').getBoundingClientRect().top;
    return { gap: Math.round(today - bar), here: (document.querySelector("#head .cal-day.is-here") || {}).dataset?.day || null,
      tall: document.querySelector("#head .cal").classList.contains("is-tall"), open: KN.store.calPrefs("todo").open };
  });
  c.check("月の面は今日の行が帯のすぐ下・輪は今日", Math.abs(mo.gap) <= 2 && mo.here === "2026-10-21", JSON.stringify(mo));
  c.check("月の面は背の高い月・全タブの札は書かない", mo.tall && !mo.open, JSON.stringify(mo));

  // 月の面から買うものへ：買うものの暦は週。盆は先に行き着く背を取り、下の画面が見かけ（translate）で滑る（docs/redesign.md 7節の 1）
  await watch();
  await page.click("#tabbar .tab-list");
  w = await seen();
  const shop = await page.evaluate(() => document.querySelector("#head .cal").classList.contains("is-week"));
  const pw = w.map((f) => ({ ms: f.ms, h: f.p }));
  c.check("買うものへ移ると暦は週・下の画面は滑って上がる（一コマで跳ばない）", shop && between(pw) >= 3 && leap(pw) < 250, JSON.stringify([shop, pw.map((f) => f.h)]));
  c.check("盆は先に行き着く背を取る（置き場の背を毎コマ並べ直さない）", new Set(w.slice(1).map((f) => f.h)).size <= 2, JSON.stringify(w.map((f) => f.h)));
  await page.click("#tabbar .tab-todo");
  await page.waitForTimeout(700);

  // 月 → 週：滑って畳む
  await watch();
  await page.click('#screen-todo .wk-faces [data-face="week"]');
  w = await seen();
  c.check("「週」で下の画面が滑って上がる", between(of(w, "p")) >= 4 && leap(of(w, "p")) < 200 && snaps(w), JSON.stringify([w.map((f) => f.p), w.map((f) => f.h)]));
  c.check("今日の升は跳ばずに週の一段へ上がる", between(of(w, "c")) >= 4 && leap(of(w, "c")) < 120, JSON.stringify(w.map((f) => f.c)));
  left = await clean();
  c.check("滑り終えたら何も残さない（週）", !left.length, left.join(" / "));
  const ring = await page.evaluate(() => {
    const r = document.querySelector("#head .cal-ring").getBoundingClientRect(), n = document.querySelector("#head .cal-day.is-here .cal-n").getBoundingClientRect();
    return { dx: Math.round(r.left - n.left), dy: Math.round(r.top - n.top), on: document.querySelector("#head .cal-ring").classList.contains("is-on") };
  });
  c.check("畳んだあと輪は見ている日の上", ring.on && Math.abs(ring.dx) <= 2 && Math.abs(ring.dy) <= 2, JSON.stringify(ring));

  // 今日の面で題を押す：週 → 月（ふつうの月）も滑る
  await page.click('#screen-todo .wk-faces [data-face="today"]');
  await page.waitForTimeout(700);
  await watch();
  await page.click("#head .js-day-title");
  w = await seen();
  const opened = await page.evaluate(() => KN.store.calPrefs("todo").open);
  c.check("題を押すと下の画面が滑って下りる（札は月・盆は先に月の背）", opened && between(of(w, "p")) >= 3 && leap(of(w, "p")) < 200 && snaps(w),
    JSON.stringify([opened, w.map((f) => f.p), w.map((f) => f.h)]));
  await watch();
  await page.click("#head .js-day-title");
  w = await seen();
  c.check("もう一度押すと滑って畳む", between(of(w, "p")) >= 3 && leap(of(w, "p")) < 200 && snaps(w), JSON.stringify([w.map((f) => f.p), w.map((f) => f.h)]));

  // 続けて押す（滑っている途中で「週」）：古い行き先を札に書かず、週の面・週の暦で止まる
  await page.click('#screen-todo .wk-faces [data-face="week"]');
  await page.waitForTimeout(700);
  for (const wait of [0, 120]) {
    await page.click('#screen-todo .wk-faces [data-face="month"]');
    if (wait) await page.waitForTimeout(wait);
    await page.click('#screen-todo .wk-faces [data-face="week"]');
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const c = document.querySelector("#head .cal");
      return { face: (document.querySelector('#screen-todo .wk-faces .seg-btn[aria-pressed="true"]') || {}).textContent, week: c.classList.contains("is-week"),
        tall: c.classList.contains("is-tall"), busy: c.classList.contains("is-peek") || c.classList.contains("is-settling"), open: KN.store.calPrefs("todo").open,
        h: Math.round(c.getBoundingClientRect().height) };
    });
    c.check(`月を押して${wait}ms で週：週の面・週の暦で止まる（札は書かない）`, r.face === "週" && r.week && !r.tall && !r.busy && !r.open && r.h < 120, JSON.stringify(r));
  }

  // からだ・買うものの題も同じ滑り（盆は押した一拍で背を取り、下の画面が見かけで寄る。輪は見ている日の上のまま）
  for (const [tab, id, name] of [["diet", "diet", "からだ"], ["list", "list", "買うもの"]]) {
    await page.click(`#tabbar .tab-${tab}`);
    await page.waitForTimeout(800);
    for (const step of ["開く", "畳む"]) {
      await watch();
      await page.click("#head .js-day-title");
      w = await seen();
      const at = await page.evaluate(() => {
        const cal = document.querySelector("#head .cal"), r = cal.querySelector(".cal-ring").getBoundingClientRect(), n = cal.querySelector(".cal-day.is-here .cal-n").getBoundingClientRect();
        return { week: cal.classList.contains("is-week"), ring: Math.round(Math.abs(r.top - n.top) + Math.abs(r.left - n.left)) };
      });
      left = await clean(id);
      c.check(`${name}の題で${step}：下の画面が滑る・盆は先に背を取る・輪は見ている日の上・何も残さない`,
        at.week === (step === "畳む") && between(of(w, "p")) >= 3 && leap(of(w, "p")) < 200 && snaps(w) && at.ring <= 3 && !left.length,
        JSON.stringify([at, left, w.map((f) => f.p), w.map((f) => f.h)]));
    }
  }
  await page.click("#tabbar .tab-todo");
  await page.waitForTimeout(800);

  // 動きを減らす設定では滑らせない
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click('#screen-todo .wk-faces [data-face="month"]');
  const still = await page.evaluate(() => {
    const c = document.querySelector("#head .cal");
    return { settling: c.classList.contains("is-settling") || c.classList.contains("is-peek"), tall: c.classList.contains("is-tall") };
  });
  c.check("動きを減らす設定では一拍で月へ", !still.settling && still.tall, JSON.stringify(still));

  c.check("エラーなし", !errors.length, errors.join(" / "));
  await browser.close();
  c.done();
})();
