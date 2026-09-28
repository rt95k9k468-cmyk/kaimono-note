/* 日記の本文の写し（js/diary-idb.js）——段1「写しが正しい」（2026年9月28日）。

   docs/storage.md の「日記の本文：いまは二重に持つ時期」「次の段」。
   - 開くたびの突き合わせで、写しの行を消さない（写しにだけある日は元へ戻す）
   - 元の番号が写しより大きいときだけ、違う本文は元が勝つ（控えを取ってから）
   - 写しの番号が大きい・元に番号が無い → 写しが勝つ（控えを取ってから）
   - 元が空 → 写しから戻る
   - 利用者が消す・すべて削除・復元は、書くたびに写しからも消える
   - 読み込み中は本文を書かせない・写させない・控えを取らない
   - 大きな保存場所を読めない日は、本文だけ「読めません」、書かせない、
     時刻は書ける、ほかのタブは通常どおり、前に出てきたら読み直す

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-idb.js */
const { open, checker } = require("./lib");

const KEY = "kaimono-note-v2";
const A = "2026-01-05", B = "2026-01-06", C = "2026-01-07";

/* 写しの中身。{ rows: {日付: 本文}, seq } */
const box = (page) => page.evaluate(() => KN.idb.run(["diary", "meta"], "readonly", (t) => {
  const rows = t.objectStore("diary").getAll();
  const seq = t.objectStore("meta").get("diarySeq");
  return () => ({
    rows: Object.fromEntries((rows.result || []).map((r) => [r.date, r.memo])),
    seq: seq.result ? Number(seq.result.v) || 0 : 0,
  });
}));

/* 元（localStorage）の中身。{ seq, days: {日付: 本文} } */
const live = (page) => page.evaluate((K) => {
  const p = JSON.parse(localStorage.getItem(K) || "null");
  if (!p) return { seq: 0, days: {} };
  return {
    seq: p.lsSeq || 0,
    days: Object.fromEntries(((p.archive && p.archive.days) || []).filter((d) => d.memo).map((d) => [d.date, d.memo])),
  };
}, KEY);

const settled = async (page) => {
  await page.waitForFunction(() => window.KN && KN.store && KN.diaryIdb && KN.diaryIdb.settled());
  await page.waitForTimeout(400);
};

/* 元を直に書き換えて読み直す。書きかけの保存を先に出してから（CLAUDE.md の
   「localStorage に直に書いてから reload() するなら」）。 */
async function editLive(page, fn, arg) {
  await page.waitForTimeout(400);
  await page.evaluate(({ K, src, arg }) => {
    KN.store.flush();
    const p = JSON.parse(localStorage.getItem(K));
    // eslint-disable-next-line no-new-func
    const out = new Function("p", "arg", src)(p, arg);
    if (out === "remove") localStorage.removeItem(K);
    else localStorage.setItem(K, JSON.stringify(p));
  }, { K: KEY, src: fn, arg });
  await page.reload();
  await settled(page);
}

/* 控えの中身のどれかに、その字があるか。 */
const snapHas = (page, text) => page.evaluate((text) => KN.idb.run(["snapBodies"], "readonly", (t) => {
  const r = t.objectStore("snapBodies").getAll();
  return () => (r.result || []).some((x) => JSON.stringify(x).includes(text));
}), text);
/* 見出しは大きな保存場所から直に数える（KN.backup.list() は、読み直した直後は
   まだ見出しを読み終えていないことがある）。 */
const snapCount = (page) => page.evaluate(() => KN.idb.run(["snaps"], "readonly", (t) => {
  const r = t.objectStore("snaps").getAll();
  return () => (r.result || []).filter((s) => s.reason === "日記の突き合わせ前").length;
}));

const toastText = (page) => page.evaluate(() => [...document.querySelectorAll(".toast-msg")].map((e) => e.textContent).join(" / "));

(async () => {
  const t = checker("diary-idb");

  /* ================= 突き合わせ：写しが正しい ================= */
  {
    const { browser, page, errors } = await open();
    await settled(page);
    await page.evaluate(({ A, B }) => {
      KN.store.setDayLog(A, { memo: "一日目の試験の一行" });
      KN.store.setDayLog(B, { memo: "二日目の試験の一行" });
    }, { A, B });
    await page.waitForTimeout(600);
    let bx = await box(page);
    let lv = await live(page);
    t.check("書くたびに写しへ（二日とも）", bx.rows[A] === "一日目の試験の一行" && bx.rows[B] === "二日目の試験の一行", JSON.stringify(bx.rows));
    t.check("写しの番号は元に合う", bx.seq === lv.seq, `box ${bx.seq} live ${lv.seq}`);

    /* 元が新しい（番号が大きい）のに、元から B が消えている → B は写しにも元にも残る。
       直す前（元が正しい）は、ここで写しの B を消していた。 */
    await editLive(page, `
      p.archive.days = p.archive.days.filter((d) => d.date !== arg.B);
      p.lsSeq = arg.seq + 5;`, { B, seq: bx.seq });
    bx = await box(page);
    lv = await live(page);
    t.check("元にだけ無い日（元が新しくても）：写しの行を消さない", bx.rows[B] === "二日目の試験の一行", JSON.stringify(bx.rows));
    t.check("元にだけ無い日：写しから元へ戻る", lv.days[B] === "二日目の試験の一行", JSON.stringify(lv.days));
    t.check("元へ戻した日が画面の記録にもある", await page.evaluate((B) => (KN.store.dayLog(B) || {}).memo, B) === "二日目の試験の一行");

    /* 元が新しくて本文が違う → 元が勝つ。置き換わる写しの本文は控えへ。
       写しの本文は、写しにしか入れたことのない字にしておく——ほかの控え
       （開くたび・隠れるたびの「自動」）には入りようがないので、控えに
       あれば、突き合わせが取ったもの。 */
    const snaps0 = await snapCount(page);
    await page.evaluate((A) => KN.idb.run(["diary"], "readwrite", (t) => {
      t.objectStore("diary").put({ date: A, memo: "写しにだけ届いた一日目", at: null });
    }), A);
    await editLive(page, `
      p.archive.days.find((d) => d.date === arg.A).memo = "書き換えた一日目";
      p.lsSeq = arg.seq + 5;`, { A, seq: (await box(page)).seq });
    bx = await box(page);
    lv = await live(page);
    t.check("元が新しい（番号が大きい）：違う本文は元が勝ち、写しへ", bx.rows[A] === "書き換えた一日目" && lv.days[A] === "書き換えた一日目", `${bx.rows[A]} / ${lv.days[A]}`);
    t.check("置き換わった写しの本文は控えにある", await snapHas(page, "写しにだけ届いた一日目"));
    t.check("「日記の突き合わせ前」の控えが一つ増えた", (await snapCount(page)) === snaps0 + 1, `${snaps0} → ${await snapCount(page)}`);
    t.check("写しの番号は元に追いつく", (await box(page)).seq >= lv.seq - 1, `box ${(await box(page)).seq} live ${lv.seq}`);

    /* 写しが新しい（番号が大きい）→ 写しが勝つ。置き換わる元の本文は控えへ。 */
    const liveSeq = (await live(page)).seq;
    await page.waitForTimeout(400);
    await page.evaluate(({ A, seq }) => KN.idb.run(["diary", "meta"], "readwrite", (t) => {
      t.objectStore("diary").put({ date: A, memo: "写しで直した一日目", at: null });
      t.objectStore("meta").put({ k: "diarySeq", v: seq });
    }), { A, seq: liveSeq + 20 });
    await page.reload();
    await settled(page);
    lv = await live(page);
    t.check("写しが新しい：写しの本文が元へ", lv.days[A] === "写しで直した一日目", lv.days[A]);
    t.check("置き換わった元の本文は控えにある", await snapHas(page, "書き換えた一日目"));
    t.check("次に元を書く番号は写しの続きから", lv.seq > liveSeq + 20, `live ${lv.seq}`);

    /* 元に番号が無い（直に書いた・古い版）→ 新しいとは言えないので写しが勝つ。
       元にだけある日は写しへ足す。 */
    await editLive(page, `
      delete p.lsSeq;
      p.archive.days.find((d) => d.date === arg.A).memo = "番号の無い元の一日目";
      p.archive.days.push({ date: arg.C, memo: "元にだけある三日目", wake: null, sleep: null,
        wakeSource: "manual", sleepSource: "manual", createdAt: null, updatedAt: null });`, { A, C });
    bx = await box(page);
    lv = await live(page);
    t.check("元に番号が無い：違う本文は写しが勝つ", lv.days[A] === "写しで直した一日目" && bx.rows[A] === "写しで直した一日目", `${lv.days[A]} / ${bx.rows[A]}`);
    t.check("元に番号が無い：置き換わった元の本文は控えにある", await snapHas(page, "番号の無い元の一日目"));
    t.check("元にだけある日は写しへ足す", bx.rows[C] === "元にだけある三日目", JSON.stringify(bx.rows));

    /* 元が丸ごと無い → 写しから全部戻る。 */
    await editLive(page, `return "remove";`);
    lv = await live(page);
    t.check("元が空：写しから全部戻る",
      lv.days[A] === "写しで直した一日目" && lv.days[B] === "二日目の試験の一行" && lv.days[C] === "元にだけある三日目",
      JSON.stringify(lv.days));
    bx = await box(page);
    t.check("元が空：写しは一行も減らない", Object.keys(bx.rows).length === 3, JSON.stringify(bx.rows));

    /* 利用者が消す → 写しからも消える（書くたびの道）。 */
    await page.evaluate((C) => KN.store.setDayLog(C, { memo: "" }), C);
    await page.waitForTimeout(600);
    bx = await box(page);
    t.check("利用者が日記を消すと、写しからも消える", !(C in bx.rows) && bx.rows[A] && bx.rows[B], JSON.stringify(bx.rows));
    await page.reload();
    await settled(page);
    t.check("消した日は、開き直しても戻ってこない", !((await live(page)).days[C]) && !((await box(page)).rows[C]));

    /* 復元（importJSON）→ 写しも同じに。 */
    const saved = await page.evaluate(() => KN.store.exportJSON());
    await page.evaluate((B) => KN.store.setDayLog(B, { memo: "" }), B);
    await page.evaluate((A) => KN.store.setDayLog(A, { memo: "復元の前に書いた一日目" }), A);
    await page.waitForTimeout(600);
    await page.evaluate((text) => KN.store.importJSON(text), saved);
    await page.waitForTimeout(600);
    bx = await box(page);
    t.check("復元すると、写しも復元したものと同じ",
      bx.rows[A] === "写しで直した一日目" && bx.rows[B] === "二日目の試験の一行" && Object.keys(bx.rows).length === 2,
      JSON.stringify(bx.rows));

    /* すべて削除 → 写しも空。開き直しても戻らない。 */
    await page.evaluate(() => KN.store.reset());
    await page.waitForTimeout(600);
    t.check("すべて削除すると、写しも空", Object.keys((await box(page)).rows).length === 0);
    await page.reload();
    await settled(page);
    t.check("すべて削除のあと開き直しても、日記は戻らない", Object.keys((await live(page)).days).length === 0);

    t.check("ページのエラーが無い（突き合わせ）", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* ================= 読み込み中：書かせない・写させない・控えを取らない ================= */
  {
    const { browser, page, errors } = await open({
      before: async (ctx) => {
        await ctx.addInitScript(() => {
          // 大きな保存場所の返事を 2.5 秒遅らせる（開いた直後の「読み込み中」を長くする）
          const orig = IDBFactory.prototype.open;
          IDBFactory.prototype.open = function (...a) {
            const req = orig.apply(this, a);
            let h = null;
            Object.defineProperty(req, "onsuccess", {
              configurable: true,
              get() { return h; },
              set(fn) { h = fn; req.addEventListener("success", (e) => setTimeout(() => fn.call(req, e), 2500)); },
            });
            return req;
          };
        });
      },
    });
    t.check("開いた直後は「読み込み中」", await page.evaluate(() => KN.diaryIdb.body()) === "loading");
    await page.evaluate(() => KN.app.showScreen("archive"));
    await page.waitForTimeout(200);
    const today = await page.evaluate(() => KN.util.todayKey());
    await page.click(`.arc-log-row[data-day="${today}"]`);
    await page.waitForTimeout(200);
    t.check("読み込み中は日記の紙を開かない", await page.evaluate(() => !document.querySelector(".sheet .js-memo")));
    t.check("読み込み中と知らせる", (await toastText(page)).includes("読み込んでいる"), await toastText(page));
    await page.evaluate(() => { window.__took = null; KN.backup.take("試験").then((r) => { window.__took = r; }); });
    await page.waitForTimeout(300);
    t.check("読み込み中は控えを取らない（済むのを待つ）", await page.evaluate(() => window.__took === null));
    await page.waitForFunction(() => KN.diaryIdb.body() === "ok", null, { timeout: 8000 });
    await page.waitForTimeout(400);
    t.check("済んだら控えが取れる", await page.evaluate(() => window.__took !== null), await page.evaluate(() => String(window.__took)));
    await page.click(`.arc-log-row[data-day="${today}"]`);
    await page.waitForTimeout(400);
    t.check("済んだら日記の紙が開く", await page.evaluate(() => !!document.querySelector(".sheet .js-memo")));
    t.check("ページのエラーが無い（読み込み中）", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* ================= 読めない日：本文だけ「読めません」 ================= */
  {
    const { browser, page, errors } = await open({
      before: async (ctx) => {
        await ctx.addInitScript(() => {
          // 印があるあいだ、大きな保存場所を開けない（window.__idbFix で直る）
          const orig = IDBFactory.prototype.open;
          IDBFactory.prototype.open = function (...a) {
            if (localStorage.getItem("__test_idb_broken") && !window.__idbFix) {
              throw new DOMException("試験で開けなくした", "UnknownError");
            }
            return orig.apply(this, a);
          };
        });
      },
    });
    await settled(page);
    const today = await page.evaluate(() => KN.util.todayKey());
    const MEMO = "読めない日の試験の一行";
    await page.evaluate(({ today, MEMO }) => KN.store.setDayLog(today, { memo: MEMO, wake: "06:30" }), { today, MEMO });
    await page.waitForTimeout(600);
    /* 写しのほうを一つ新しくしておく（元の保存が落ちたあいだに写しにだけ届いた形）。
       読めなかったあいだに、やることなどで元の番号がそれを追い越しても、読み直し
       では写しが勝つこと——比べるのは読んだときの元の番号なので。 */
    const NEWER = "写しのほうが新しい一行";
    const seq0 = (await live(page)).seq;
    await page.evaluate(({ today, NEWER, seq }) => KN.idb.run(["diary", "meta"], "readwrite", (t) => {
      t.objectStore("diary").put({ date: today, memo: NEWER, at: null });
      t.objectStore("meta").put({ k: "diarySeq", v: seq });
    }), { today, NEWER, seq: seq0 + 1 });
    await page.evaluate(() => localStorage.setItem("__test_idb_broken", "1"));
    await page.reload();
    await settled(page);

    t.check("大きな保存場所を開けない日は「読めない」", await page.evaluate(() => KN.diaryIdb.body()) === "off");
    await page.evaluate(() => KN.app.showScreen("archive"));
    await page.waitForTimeout(300);
    const row = await page.evaluate((today) => {
      const r = document.querySelector(`.arc-log-row[data-day="${today}"]`);
      return r ? { memo: r.querySelector(".arc-log-memo").textContent.trim(), text: r.textContent } : null;
    }, today);
    t.check("本文の欄は「読めません」", row && row.memo === "読めません", row && row.memo);
    t.check("起きた時刻は出る（本文だけが読めない）", row && row.text.includes("06:30"), row && row.text);
    t.check("本文はどこにも描かれていない", await page.evaluate((M) => !document.body.textContent.includes(M), MEMO));

    await page.click(`.arc-log-row[data-day="${today}"]`);
    await page.waitForTimeout(400);
    const sheet = await page.evaluate(() => ({
      memo: !!document.querySelector(".sheet .js-memo"),
      note: !!document.querySelector(".sheet .js-memo-unread"),
      wake: !!document.querySelector(".sheet .js-wake"),
    }));
    t.check("紙は本文の欄なしで開く（時刻は書ける）", !sheet.memo && sheet.note && sheet.wake, JSON.stringify(sheet));
    await page.fill(".sheet .js-wake", "07:10");
    await page.evaluate(() => document.querySelector(".sheet .js-ok").click());
    await page.waitForTimeout(600);
    const after = await page.evaluate(({ K, today }) => {
      const p = JSON.parse(localStorage.getItem(K));
      const d = p.archive.days.find((x) => x.date === today);
      return { memo: d && d.memo, wake: d && d.wake };
    }, { K: KEY, today });
    t.check("時刻は書け、本文はそのまま", after.wake === "07:10" && after.memo === MEMO, JSON.stringify(after));

    /* ほかのタブは通常どおり。 */
    await page.evaluate(() => { KN.app.showScreen("todo"); KN.store.addTodo({ title: "試験のやること", due: KN.util.todayKey() }); });
    await page.waitForTimeout(600);
    t.check("ほかのタブは書ける（やること）", await page.evaluate((K) => JSON.parse(localStorage.getItem(K)).todos.some((x) => x.title === "試験のやること"), KEY));
    t.check("やることの画面に出る", await page.evaluate(() => document.body.textContent.includes("試験のやること")));

    /* 直ったら、前に出てきたときに読み直す。 */
    await page.evaluate(() => KN.app.showScreen("archive"));
    await page.evaluate(() => { window.__idbFix = true; });
    await page.waitForTimeout(5200);   // 前に試してから5秒は読み直さない
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForFunction(() => KN.diaryIdb.body() === "ok", null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const back = await page.evaluate((today) => {
      const r = document.querySelector(`.arc-log-row[data-day="${today}"] .arc-log-memo`);
      return r ? r.textContent.trim() : null;
    }, today);
    t.check("読めないあいだに元の番号が進んでいても、読み直しでは新しい写しが勝つ",
      (await live(page)).seq > seq0 + 1 && back === NEWER, `${back}（元の番号 ${(await live(page)).seq}）`);
    /* Service Worker を止めて開いているので register() が undefined で返り、
       手で投げた visibilitychange が app.js の reg.update() で落ちる。試験の
       環境だけのことなので数えない。 */
    const real = errors.filter((e) => !e.includes("reading 'update'"));
    t.check("ページのエラーが無い（読めない日）", !real.length, real.join(" | "));
    await browser.close();
  }

  t.done();
})().catch((err) => { console.error(err); process.exitCode = 1; });
