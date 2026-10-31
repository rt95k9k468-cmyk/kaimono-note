/* 余白の物差し（docs/log/design-review.md 10節の P7）。席ごと・幅ごとに、窓の端からカードまで・段の間・カードの中を測る。
   - 電話（393）：今の値をそのまま見張る（一画素も変えない）。カードは窓の端から 16px（買うものの棚は 12px、設定は 20px）。
   - 段を並べる席（840px〜：からだの段組み・ノートの札・設定の二段）：中身は --desk-wide 1180px まで。
     窓の端からカードまで＝ max(16, (席の幅 − 1180) / 2 + 16)、段の間 16px、札の行の間 16px。
   - カードの中は電話と同じ（からだ・ノートの札 16px）。角は札の5段のまま（ここでは見ない。look-tokens・shape-tokens）。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/gutters.js */
const { open, checker } = require("./lib");

/** 席（.screen.is-active）か設定の層の左右の端から、見えているカードまで。 */
function measure(sel, rootSel) {
  const root = document.querySelector(rootSel);
  if (!root) return null;
  const rr = root.getBoundingClientRect();
  return [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && e.getBoundingClientRect().top < innerHeight)
    .map((e) => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { l: Math.round(r.left - rr.left), r: Math.round(rr.right - r.right), t: Math.round(r.top), b: Math.round(r.bottom),
        x0: Math.round(r.left), x1: Math.round(r.right), pad: parseFloat(cs.paddingLeft), seat: Math.round(rr.width) };
    });
}
/** 並んだカードの、横の段の間と縦の行の間（隣り合うものだけ）。 */
function gaps(cs) {
  const h = new Set(), v = new Set();
  for (const a of cs) for (const b of cs) {
    if (b.x0 > a.x1 && b.t < a.b && b.b > a.t && !cs.some((c) => c !== a && c !== b && c.x0 >= a.x1 && c.x1 <= b.x0)) h.add(b.x0 - a.x1);
    if (b.t > a.b && a.x0 === b.x0 && !cs.some((c) => c !== a && c !== b && c.x0 === a.x0 && c.t >= a.b && c.b <= b.t)) v.add(b.t - a.b);
  }
  return { h: [...h], v: [...v] };
}
const edgeOf = (seat) => Math.max(16, (seat - 1180) / 2 + 16);
const near = (a, b) => Math.abs(a - b) <= 1;

(async () => {
  const t = checker("gutters");
  const { browser, page, errors } = await open({ viewport: { width: 393, height: 852 } });
  await page.evaluate(async () => {
    const S = KN.store, a = S.addStore("スーパー");
    ["牛乳", "卵"].forEach((name) => { const p = S.addProduct({ name }); if (p) { S.addItem(p.id); S.addPrice(p.id, { storeId: a.id, price: 100, amount: 1, date: KN.util.todayKey() }); } });
    S.addWeight({ day: KN.util.todayKey(), time: "07:00", kg: 60 });
    const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
    await KN.notes.addMany(["一", "二", "三", "四", "五", "六", "七"].map((title, i) => ({ id: `n-g${i}`, title, body: "本文", notebook: "private",
      tags: [], fav: false, createdAt: at(i), updatedAt: at(i), deletedAt: null })));
  });
  const seat = async (s) => { await page.click(`.tab-${s}`); await page.waitForTimeout(500); };
  const M = (sel, root = ".screen.is-active") => page.evaluate(([f, s, r]) => (0, eval)(`(${f})`)(s, r), [measure.toString(), sel, root]);

  /* 1. 電話：今の値のまま。 */
  await seat("diet");
  const pd = await M("#screen-diet .diet-card.diet-block");
  t.check("393 からだ：カードは窓の端から 16px・中も 16px", pd.length > 0 && pd.every((c) => c.l === 16 && c.r === 16 && c.pad === 16), JSON.stringify(pd.slice(0, 3)));
  await seat("list");
  const pl = await M("#screen-list .cat-group");
  t.check("393 買うもの：棚は窓の端から 12px", pl.length > 0 && pl.every((c) => c.l === 12 && c.r === 12), JSON.stringify(pl.slice(0, 2)));
  await seat("notes");
  const pn = await M("#screen-notes .notes-books");
  t.check("393 ノート：本棚は窓の端から 16px", pn.length > 0 && pn.every((c) => c.l === 16 && c.r === 16), JSON.stringify(pn));

  /* 2. 段を並べる席。1032（二段）・1440（三段・上限の手前）・1920（上限）。 */
  for (const w of [1032, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    await seat("diet");
    const d = await M("#screen-diet .diet-card");
    const de = d.length ? edgeOf(d[0].seat) : 0, dl = Math.min(...d.map((c) => c.l)), dr = Math.min(...d.map((c) => c.r));
    const dg = gaps(d), db = await M("#screen-diet .diet-card.diet-block");
    t.check(`${w} からだ：窓の端からカードまで ${de}px（中身 1180px まで）・段の間 16px・中 16px`,
      d.length > 1 && near(dl, de) && near(dr, de) && dg.h.length > 0 && dg.h.every((g) => near(g, 16)) && db.length > 0 && db.every((c) => c.pad === 16),
      JSON.stringify({ dl, dr, de, h: dg.h }));
    t.check(`${w} からだ：カードの行の間 16px`, dg.v.every((g) => near(g, 16)), JSON.stringify(dg.v));

    await seat("notes");
    const n = await M("#screen-notes .nt-card");
    const ne = n.length ? edgeOf(n[0].seat) : 0, ng = gaps(n);
    t.check(`${w} ノートの札：窓の端から ${ne}px・札の間 16px・中 16px`,
      n.length > 1 && near(Math.min(...n.map((c) => c.l)), ne) && ng.h.every((g) => near(g, 16)) && ng.v.every((g) => near(g, 16)) && n.every((c) => c.pad === 16),
      JSON.stringify({ l: Math.min(...n.map((c) => c.l)), ne, ...ng }));

    if (w >= 1280) {
      await page.keyboard.press(",");
      await page.waitForTimeout(900);
      const s = await M(".set-layer.is-duo .js-body .set-card", ".set-layer");
      const se = s.length ? edgeOf(s[0].seat) : 0, sg = gaps(s);
      t.check(`${w} 設定の二段：窓の端から ${se}px・段の間 16px`,
        s.length > 1 && near(Math.min(...s.map((c) => c.l)), se) && near(Math.min(...s.map((c) => c.r)), se) && sg.h.length > 0 && sg.h.every((g) => near(g, 16)),
        JSON.stringify({ l: Math.min(...s.map((c) => c.l)), r: Math.min(...s.map((c) => c.r)), se, h: sg.h }));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    }
  }
  t.check("エラーなし", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
