/* 電話を横にして使う（docs/desk.md の「電話を横に」）。852×393（iPhone 15 など）・956×440（Pro Max）を指の端末で。
   島とその向かいは --safe-l/--safe-r を 59px、ホームの棒は --safe-b を 21px にして見る（試験のブラウザに env() は無い）。
   - 案内で隠さない。左の列は畳んだ形に据わる（settings.railFolded は書き換えない・‹ は出さない）
   - どの席も、島の下（左右 59px）に押せるものが無い。月の暦は窓に収まる（最後の週まで）
   - ＋の紙・据えたノート・設定（外観の一枚）を開いたまま縦へ回して戻す：開いたまま・島の下に押せるもの無し
   - 背の低い窓を使い切る：題と週の暦は一段（帯の背 90px まで）・からだと買うものは二段・設定は見出しごとに二段
   - ＋は列の底・今日は道｜時間割・月は右に立てて紙は題の下の左・棚のカードは段で割れない
   - ＋の紙は頭が左・中身が右（窓に収まる）・ノートのホームは二段（左に最近直した、右に木）・日記の「保存する」は開いてすぐ見える
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/sideways.js */
const { open, checker } = require("./lib");

const SAFE = 59, HOME = 21;
const SIZES = [[852, 393], [956, 440]];

/* 頁の中で：島の下（左右 SAFE px）に見えている押せるもの。切る箱（overflow）の外へ出たぶんは数えない。 */
function under(safe) {
  const W = innerWidth, H = innerHeight;
  const hits = [];
  const sel = "button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=tab], [contenteditable=true], [tabindex]:not([tabindex='-1'])";
  for (const e of document.querySelectorAll(sel)) {
    if (!e.getClientRects().length || e.closest("[inert], [aria-hidden=true]")) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || cs.pointerEvents === "none" || +cs.opacity < 0.05) continue;
    let r = e.getBoundingClientRect();
    let l = r.left, t = r.top, ri = r.right, b = r.bottom;
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (+s.opacity < 0.05 || s.visibility === "hidden") { l = ri; break; }
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const q = a.getBoundingClientRect();
        l = Math.max(l, q.left); ri = Math.min(ri, q.right); t = Math.max(t, q.top); b = Math.min(b, q.bottom);
      }
    }
    l = Math.max(l, 0); ri = Math.min(ri, W); t = Math.max(t, 0); b = Math.min(b, H);
    if (ri - l < 1 || b - t < 1) continue;
    if (l < safe - 0.5 || ri > W - safe + 0.5) {
      const name = (e.getAttribute("aria-label") || e.textContent || e.className || e.tagName).trim().slice(0, 20);
      hits.push(`${name}@${Math.round(l)}-${Math.round(ri)}`);
    }
  }
  return hits;
}

(async () => {
  const t = checker("sideways");
  for (const [w, h] of SIZES) {
    const at = `${w}×${h}`;
    const { browser, page, errors } = await open({ viewport: { width: w, height: h }, touch: true,
      before: (ctx) => ctx.addInitScript(([s, b]) => {
        const sh = new CSSStyleSheet();
        sh.replaceSync(`:root { --safe-l: ${s}px !important; --safe-r: ${s}px !important; --safe-b: ${b}px !important; }`);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
      }, [SAFE, HOME]) });
    const wait = (ms) => page.waitForTimeout(ms);
    const scan = () => page.evaluate(under, SAFE);
    await page.evaluate(async () => {
      const S = KN.store, d = KN.util.todayKey();
      S.addTodo({ title: "試しの予定", due: d, time: "10:00", minutes: 30 });
      S.addTodo({ title: "二つめの予定", due: d });
      await KN.notes.addMany(["一つめ", "二つめ"].map((title, i) => ({ id: `n-s${i}`, title, body: "本文", notebook: "private",
        tags: [], fav: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null })));
    });

    /* 1. 案内で隠さない・列は畳んだ形に据わる。 */
    const look = await page.evaluate(() => ({
      note: getComputedStyle(document.querySelector(".rotate-note")).display,
      app: getComputedStyle(document.querySelector(".app")).visibility,
      fold: document.documentElement.classList.contains("rail-fold"),
      saved: KN.store.get().settings.railFolded,
      btn: (() => { const b = document.getElementById("rail-fold"); return !!b && b.getClientRects().length > 0; })(),
    }));
    t.check(`${at}：横でも使える（案内で隠さない）`, look.note === "none" && look.app === "visible", JSON.stringify(look));
    t.check(`${at}：左の列は畳んだ形・設定は書き換えない・‹ を出さない`, look.fold && look.saved === false && !look.btn, JSON.stringify(look));
    await page.keyboard.press("Meta+Backslash");
    await wait(200);
    t.check(`${at}：⌘\\ でも設定は変わらない`, await page.evaluate(() => KN.store.get().settings.railFolded === false
      && document.documentElement.classList.contains("rail-fold")));

    /* 1b. 題と週の暦は一段。からだ・買うものは二段（引き伸ばさない）。 */
    await page.click(".tab-todo");
    await wait(600);
    const row = await page.evaluate(() => {
      const t = document.querySelector(".topbar-dayrow").getBoundingClientRect();
      const c = document.querySelector(".head-cal .cal").getBoundingClientRect();
      return { head: Math.round(document.getElementById("head").getBoundingClientRect().height), side: c.left >= t.right - 1 && c.top < t.bottom };
    });
    t.check(`${at}：題の右に週の暦（帯は一段）`, row.side && row.head <= 90, JSON.stringify(row));
    await page.click(".tab-diet");
    await wait(600);
    t.check(`${at}：からだのカードは二段`, await page.evaluate(() => getComputedStyle(document.querySelector(".diet-day")).columnCount === "2"));
    await page.click(".tab-list");
    await wait(600);
    t.check(`${at}：買うもののまとまりは二段`, await page.evaluate(() =>
      getComputedStyle(document.querySelector("#screen-list .tl-sheet > .js-body")).columnCount === "2"));
    t.check(`${at}：棚のカードは段で割れない（右の段に影の切れ端を出さない）`, await page.evaluate(() =>
      [...document.querySelectorAll("#screen-list .tl-sheet > .js-body > .cat-group")].every((e) => e.getClientRects().length === 1
        && getComputedStyle(e).display === "inline-block")));
    /* 1c. ＋は列の底（行の右端の丸に重ならない）。やることの今日は道（左）と時間割（右）。 */
    const fab = await page.evaluate(() => {
      const f = document.querySelector("#dock .add-fab").getBoundingClientRect(), r = document.querySelector(".tabbar").getBoundingClientRect();
      return { l: Math.round(f.left), r: Math.round(f.right), rail: Math.round(r.right), b: Math.round(f.bottom), H: innerHeight };
    });
    t.check(`${at}：＋は列の底（島の手前・列の中）`, fab.l >= SAFE && fab.r <= fab.rail && fab.b <= fab.H - HOME, JSON.stringify(fab));
    await page.click(".tab-todo");
    await wait(600);
    const road = await page.evaluate(() => {
      const r = document.querySelector("#screen-todo .todo-day.is-tl > .day-road"), l = document.querySelector("#screen-todo .todo-day.is-tl > .tl");
      if (!r || !l) return null;
      const a = r.getBoundingClientRect(), b = l.getBoundingClientRect();
      return { side: a.right <= b.left + 1 && b.top < a.bottom, road: Math.round(a.width) };
    });
    t.check(`${at}：今日は道の右に時間割`, road && road.side && road.road >= 340, JSON.stringify(road));

    /* 2. どの席も島の下に押せるもの無し。 */
    for (const seat of ["archive", "notes", "todo", "list", "diet"]) {
      await page.click(`.tab-${seat}`);
      await wait(700);
      const hits = await scan();
      t.check(`${at} ${seat}：島の下に押せるもの無し`, !hits.length, hits.slice(0, 6).join(" | "));
    }

    /* 3. 月の暦は窓に収まる（最後の週まで）。 */
    await page.click(".tab-todo");
    await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: true }));
    await wait(700);
    const cal = await page.evaluate(() => {
      const days = [...document.querySelectorAll(".head-cal .cal-grid > .cal-day")].filter((e) => e.getClientRects().length);
      const last = days[days.length - 1];
      return { n: days.length, b: last ? Math.round(last.getBoundingClientRect().bottom) : null, H: innerHeight };
    });
    t.check(`${at}：月の暦は窓に収まる`, cal.n >= 28 && cal.b != null && cal.b <= cal.H, JSON.stringify(cal));
    /* 3b. 月は右に立ち、紙は題の下の左（題の下を空けない）。紙が細いあいだ、今日の道は一列。 */
    const side = await page.evaluate(() => {
      const p = document.getElementById("panes").getBoundingClientRect(), c = document.querySelector(".head-cal").getBoundingClientRect();
      const t = document.querySelector(".topbar-dayrow").getBoundingClientRect();
      return { month: document.getElementById("head").classList.contains("is-month"), left: p.right <= c.left, under: p.top >= t.bottom && p.top - t.bottom < 24,
        road: getComputedStyle(document.querySelector("#screen-todo .todo-day.is-tl")).display };
    });
    t.check(`${at}：月は右・紙は題の下の左（道は一列）`, side.month && side.left && side.under && side.road === "block", JSON.stringify(side));
    const calHits = await scan();
    t.check(`${at}：月の暦でも島の下に押せるもの無し`, !calHits.length, calHits.slice(0, 6).join(" | "));
    await page.evaluate(() => KN.store.setCalPref(null, { shown: true, open: false }));
    await wait(400);
    t.check(`${at}：週に戻せば紙は窓の幅へ`, await page.evaluate(() => !document.getElementById("head").classList.contains("is-month")
      && document.getElementById("panes").getBoundingClientRect().top >= document.querySelector(".head-cal").getBoundingClientRect().bottom - 1));

    /** 縦へ回して戻す。 */
    const turn = async () => {
      await page.setViewportSize({ width: h, height: w });
      await wait(500);
      await page.setViewportSize({ width: w, height: h });
      await wait(600);
    };

    /* 4. ＋の紙を開いたまま回す。 */
    await page.click("#dock .add-fab");
    await page.waitForSelector(".sheet.is-open", { timeout: 3000 }).catch(() => {});
    await wait(400);
    const s0 = await scan();
    const hero = await page.evaluate(() => {
      const e = document.querySelector(".sheet.is-open"), h = e.querySelector(".sheet-hero"), b = e.querySelector(".sheet-body");
      const r = e.getBoundingClientRect(), hr = h.getBoundingClientRect(), br = b.getBoundingClientRect();
      return { side: hr.right <= br.left + 1 && Math.abs(hr.top - br.top) < 2, top: Math.round(r.top), bot: Math.round(r.bottom), H: innerHeight };
    });
    t.check(`${at}：＋の紙は頭が左・中身が右、窓に収まる`, hero.side && hero.top >= 0 && hero.bot <= hero.H, JSON.stringify(hero));
    /* 4b. 右の段が窓より背が高くても、ボタンの帯（追加）は段の底に留まり、開いてすぐ押せる（送らない。11月1日）。 */
    const foot = await page.evaluate(() => {
      const e = document.querySelector(".sheet.is-open"), b = e.querySelector(".sheet-foot .btn-primary"), body = e.querySelector(".sheet-body");
      const at = () => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
      const r0 = at();
      body.scrollTop = body.scrollHeight;
      const r1 = at();
      body.scrollTop = 0;
      return { long: body.scrollHeight > body.clientHeight + 1, r0, r1, sb: Math.round(e.getBoundingClientRect().bottom), H: innerHeight };
    });
    t.check(`${at}：＋の紙の「追加」は開いてすぐ見え、段を送っても同じ所`,
      foot.r0[1] <= foot.sb && foot.sb <= foot.H && foot.r0[0] === foot.r1[0], JSON.stringify(foot));
    await turn();
    const s1 = await page.evaluate(() => document.querySelectorAll(".sheet.is-open").length);
    const s2 = await scan();
    t.check(`${at}：＋の紙は島の下に出ない（回して戻しても開いたまま）`, !s0.length && s1 > 0 && !s2.length,
      JSON.stringify({ s0: s0.slice(0, 4), open: s1, s2: s2.slice(0, 4) }));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
    await wait(300);

    /* 5. ノートの席で開いたノート（右の段に据わる）を開いたまま回す。 */
    await page.click(".tab-notes");
    await wait(600);
    const home = await page.evaluate(() => {
      const two = document.querySelector("#screen-notes .nt-home-two");
      const l = two && two.querySelector(".nt-home-l"), tr = two && two.querySelector('.notes-books[role="tree"]');
      return { two: !!two, side: !!(l && tr) && tr.getBoundingClientRect().left >= l.getBoundingClientRect().right };
    });
    t.check(`${at}：ノートのホームは二段（左に最近直した、右に木）`, home.two && home.side, JSON.stringify(home));
    await page.locator("#screen-notes .nt-row", { hasText: "一つめ" }).first().click();
    await page.waitForSelector(".sheet.is-note.is-open.is-docked", { timeout: 3000 }).catch(() => {});
    await wait(500);
    const dock = async () => page.evaluate(() => {
      const e = document.querySelector(".sheet.is-note.is-open");
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { docked: e.classList.contains("is-docked"), r: Math.round(r.right), l: Math.round(r.left) };
    });
    const d0 = await dock(), n0 = await scan();
    await turn();
    const d1 = await dock(), n1 = await scan();
    t.check(`${at}：据えたノートは島の手前まで（回して戻しても開いたまま）`,
      d0 && d0.docked && d0.r <= w - SAFE && !n0.length && d1 && d1.r <= w - SAFE && !n1.length,
      JSON.stringify({ d0, d1, n0: n0.slice(0, 4), n1: n1.slice(0, 4) }));

    /* 6. 設定の一枚（外観）を開いたまま回す。 */
    await page.evaluate(() => KN.app.showScreen("settings"));
    await wait(600);
    await page.locator("#screen-settings .set-row", { hasText: "外観" }).first().click();
    await wait(700);
    const layers = () => page.evaluate(() => document.querySelectorAll("#screen-settings .set-layer").length);
    const l0 = await layers(), e0 = await scan();
    t.check(`${at}：設定は見出しごとに二段`, await page.evaluate(() => !!document.querySelector("#screen-settings .set-layer.is-duo")));
    await turn();
    const l1 = await layers(), e1 = await scan();
    const still = await page.evaluate(() => document.documentElement.dataset.screen === "settings");
    t.check(`${at}：設定の一枚は回して戻しても同じ所・島の下に押せるもの無し`, l0 >= 2 && l1 === l0 && still && !e0.length && !e1.length,
      JSON.stringify({ l0, l1, still, e0: e0.slice(0, 4), e1: e1.slice(0, 4) }));

    /* 7. 日記の書く紙：「保存する」は開いてすぐ見える（送らない）。 */
    await page.evaluate(() => KN.app.showScreen("archive"));
    await wait(600);
    await page.locator(".think-card").first().click();
    await page.waitForSelector(".sheet.is-card.is-open", { timeout: 3000 }).catch(() => {});
    await wait(600);
    const ok = await page.evaluate(() => {
      const e = document.querySelector(".sheet.is-card.is-open"), b = e && e.querySelector(".js-ok");
      return b ? { b: Math.round(b.getBoundingClientRect().bottom), s: Math.round(e.getBoundingClientRect().bottom), H: innerHeight } : null;
    });
    t.check(`${at}：日記の「保存する」は開いてすぐ見える`, ok && ok.b <= ok.s && ok.s <= ok.H, JSON.stringify(ok));
    await page.keyboard.press("Escape");
    await wait(500);

    t.check(`${at}：エラーなし`, !errors.length, errors.join(" | "));
    await browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
