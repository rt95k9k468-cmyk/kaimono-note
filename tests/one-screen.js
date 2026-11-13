/* 一度だけ描く——決まり三つ（docs/log/design-review.md 12節「手を離せる一冊」の柱2・M1。2026年11月7日）。
   393×852・標準の字で、開いたところ（最初の一画面）を見る。
   ① 一つのものは一画面に一度：daily の月のまとめは数える行のあるときだけ（Z5。見出しだけの空のカードを出さない）・
      買うものの品は一画面に一度（帯は品を描かない）・からだの見出しは一度ずつ。
      やることの今日の面（暦の札・道・時間割）は利用者が「今のまま」と決めた例外（11月7日。札を点にする案は出さない）。
   ② 席ごとに、いちばん多い一手を最初の一画面に：daily は今日の行・やることは今日の面の頭（帯のすぐ下）・
      買うものは最初の品の済ませる丸・からだは「今日のからだ」と「今日の食事」（利用者 3b＝今のまま）。
   ③ 帯は中身にかぶらない：開いたとき、どの席も中身は頭の帯の下から、下の帯の上で終わる。
      ＋は、末尾まで送ったとき最後の中身より下（送る途中に止まったときのかぶりは利用者が今のままと決めた。Z4）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/one-screen.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("one-screen");
  const { browser, page, errors } = await open({ viewport: { width: 393, height: 852 } });

  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    ["牛乳", "卵", "食パン"].forEach((name) => { const p = S.addProduct({ name }); if (p) S.addItem(p.id); });
    S.addTodo({ title: "試しの予定", due: U.todayKey(), time: "10:00", minutes: 30 });
    S.addTodo({ title: "試しのやること", due: U.todayKey() });
    const done = S.addTodo({ title: "試しの済み", due: U.todayKey() });   // まとめが数えるのは済ませたもの
    if (done) S.toggleTodo(done.id);
  });

  const show = async (id) => {
    await page.evaluate((i) => KN.app.showScreen(i), id);
    await page.waitForTimeout(900);
  };
  /* 開いた画面の中の、字がちょうどその言葉の要素（いちばん内側）。 */
  const read = (id) => page.evaluate((id) => {
    const scr = document.querySelector(".screen.is-active");
    const sc = KN.app.scrollerOf(scr);
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    const exact = (txt) => [...scr.querySelectorAll("*")].filter((e) => e.textContent.trim() === txt
      && ![...e.children].some((c) => c.textContent.trim() === txt) && e.getBoundingClientRect().height);
    const head = document.querySelector(".head").getBoundingClientRect();
    const bar = document.getElementById("tabbar").getBoundingClientRect();
    /* 掴み手の下の、最初の中身 */
    const first = [...sc.children].find((e) => !e.matches("i") && e.getBoundingClientRect().height);
    const out = { id, active: scr.id, headBottom: head.bottom, barTop: bar.top, first: box(first),
      scTop: sc.getBoundingClientRect().top };
    if (id === "archive") {
      out.today = box(scr.querySelector(".arc-log-row.is-today"));
      out.digests = scr.querySelectorAll(".arc-counts").length;
    }
    if (id === "todo") out.face = scr.querySelector('.wk-faces .seg-btn[aria-pressed="true"], .wk-faces .seg-btn.is-on')?.textContent.trim() || null;
    if (id === "list") {
      const row = scr.querySelector(".item");
      out.check = box(row && row.querySelector('input[type="checkbox"], .check, [role="checkbox"]'));
      out.names = ["牛乳", "卵", "食パン"].map((n) => exact(n).filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).length
        + [...document.querySelectorAll(".head *")].filter((e) => e.children.length === 0 && e.textContent.trim() === n).length);
    }
    if (id === "diet") {
      /* R4：四つの札と体重のカード、「今日の食事」の小見出し。 */
      out.body = [...scr.querySelectorAll(".js-day-card .hl-met, .js-day-card .hl-hero.is-kg")].map(box);
      out.meal = [...scr.querySelectorAll(".js-day-card .hl-meals .hl-list")].map(box);   // 見出しは外した（隙間）
    }
    return out;
  }, id);

  for (const id of ["archive", "todo", "list", "diet"]) {
    await show(id);
    const r = await read(id);
    t.check(`${id}：開いている`, r.active === `screen-${id}`, r.active);
    /* ③ 帯は中身にかぶらない */
    /* daily は暦なし：中身の面は盆（26px）に重なって角を持つ（base.css の is-bare）ので、帯の下は盆の上端。 */
    const under = r.headBottom - (id === "archive" ? 26 : 0) - 1;
    t.check(`③ ${id}：中身は頭の帯の下から始まる`, r.first && r.first.top >= under && r.scTop >= under, JSON.stringify(r));

    /* ② 最初の一画面 */
    if (id === "archive") t.check("② daily：今日の行が最初の一画面に（下の帯より上）", r.today && r.today.top >= r.headBottom && r.today.bottom <= r.barTop, JSON.stringify(r.today));
    if (id === "todo") {
      t.check("② やること：開くと今日の面", r.face === "今日", r.face);
      t.check("② やること：今日の面の頭は帯のすぐ下", r.first && r.first.top - r.headBottom < 80, JSON.stringify(r.first));
    }
    if (id === "list") {
      t.check("② 買うもの：最初の品の済ませる丸が最初の一画面に", r.check && r.check.top >= r.headBottom && r.check.bottom <= r.barTop, JSON.stringify(r.check));
      t.check("① 買うもの：品は一画面に一度ずつ（帯は品を描かない）", r.names.every((n) => n === 1), r.names.join(","));
    }
    if (id === "diet") {
      t.check("① からだ：四つの札と体重は一度ずつ、「今日の食事」も一度", r.body.length === 5 && r.meal.length === 1, `${r.body.length} ${r.meal.length}`);
      t.check("② からだ：四つの札・体重と「今日の食事」が最初の一画面に",
        [...r.body, ...r.meal].every((b) => b.top >= r.headBottom && b.bottom <= r.barTop), JSON.stringify([r.body, r.meal]));
    }

    /* ③ ＋は、末尾まで送ったとき最後の中身より下 */
    const end = await page.evaluate(() => {
      const sc = KN.app.scrollerOf(document.querySelector(".screen.is-active"));
      sc.scrollTop = sc.scrollHeight;
      return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const last = [...sc.querySelectorAll("*")].filter((e) => e.children.length === 0 && e.getBoundingClientRect().height > 4
          && getComputedStyle(e).visibility !== "hidden").reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
        const fab = document.querySelector("#dock .add-fab").getBoundingClientRect();
        sc.scrollTop = 0;
        res({ last, fabTop: fab.top });
      })));
    });
    t.check(`③ ${id}：末尾まで送ると、最後の中身は＋より上`, end.last <= end.fabTop + 1, JSON.stringify(end));
  }

  /* ① daily の月のまとめ：数える行のある月だけ（Z5） */
  await show("archive");
  let n = (await read("archive")).digests;
  t.check("① daily：やることのある月はまとめが一つ", n === 1, n);
  await page.evaluate(() => {   // 日記だけ書いた月（やること・買うものは0件）
    KN.store.update((s) => { s.todos = []; s.items = []; });
    KN.store.setDayLog(KN.util.todayKey(), { memo: "試しの一行" });
  });
  await page.waitForTimeout(400);
  n = (await read("archive")).digests;
  t.check("① daily：やること・買うものが0件の月は、まとめを出さない（見出しだけのカードを出さない）", n === 0, n);

  t.check("エラーが出ない", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
