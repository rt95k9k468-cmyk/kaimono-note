/* V24 からだ：一枚を「今日・記録・推移」に分ける（docs/roadmap-2.0.md の V24・docs/health.md の末の節）。
   2026年10月4日。V26（10月5日）で既定に。

   - 頭に「今日・記録・推移」（.seg）。字は区画それぞれの中央
   - 今日＝からだの輪と体重の数／記録＝食事／推移＝グラフ（と気づいたこと）
   - 区画を替えても組み直さない。ほかのタブへ行って戻っても、選んだ区画のまま
   - 評価の言葉を足さない。V27：三つの区画に名札の色（選んだ区画はその色で塗り、白い字が読める）

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diet-panes.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("diet-panes");
  const { browser, page, errors } = await open();

  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const today = U.todayKey();
    [6, 4, 2, 0].forEach((n, i) => S.addWeight({ day: U.shiftDay(today, -n), kg: 68 - i * 0.3 }));
    KN.app.showScreen("diet");
  });
  await page.waitForTimeout(500);

  /* 出ているか：画面に幅と高さを持つか */
  const seen = () => page.evaluate(() => {
    const vis = (sel) => {
      const e = document.querySelector(`#screen-diet .js-day-card ${sel}, #screen-diet ${sel}`);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return {
      seg: vis(".diet-panes"),
      body: vis(".diet-block.is-body"),
      meal: vis(".diet-block.is-meal"),
      weight: vis(".diet-hero-top"),
      graph: vis(".diet-graph"),
    };
  });

  const seg = await page.evaluate(() => [...document.querySelectorAll("#screen-diet .diet-panes .seg-btn")].map((b) => {
    const r = b.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(b);
    const tr = range.getBoundingClientRect();
    return { label: b.textContent.trim(), on: b.getAttribute("aria-pressed"), off: Math.abs((tr.left + tr.right) / 2 - (r.left + r.right) / 2), w: r.width };
  }));
  t.check("オン：「今日・記録・推移」", JSON.stringify(seg.map((x) => x.label)) === JSON.stringify(["今日", "記録", "推移"]), JSON.stringify(seg));
  t.check("字は区画それぞれの中央・区画は同じ幅", seg.every((x) => x.off < 1.5) && Math.abs(seg[0].w - seg[2].w) < 1, JSON.stringify(seg));
  t.check("最初は「今日」", seg[0].on === "true" && seg[1].on === "false" && seg[2].on === "false");
  const s0 = await seen();
  t.check("今日：からだの輪と体重の数だけ", s0.body && s0.weight && !s0.meal && !s0.graph, JSON.stringify(s0));

  const pick = async (label) => {
    await page.locator("#screen-diet .diet-panes .seg-btn", { hasText: label }).click();
    await page.waitForTimeout(300);
  };
  const before = await page.evaluate(() => { const e = document.querySelector("#screen-diet .js-day-card"); e.dataset.probe = "1"; return true; });
  await pick("記録");
  const s1 = await seen();
  t.check("記録：食事だけ", s1.meal && !s1.body && !s1.weight && !s1.graph, JSON.stringify(s1));
  await pick("推移");
  const s2 = await seen();
  t.check("推移：グラフだけ", s2.graph && !s2.body && !s2.meal && !s2.weight, JSON.stringify(s2));
  const kept = await page.evaluate(() => (document.querySelector("#screen-diet .js-day-card") || {}).dataset?.probe === "1");
  t.check("区画を替えても組み直さない", before && kept);
  const chartW = await page.evaluate(() => { const c = document.querySelector("#screen-diet .diet-chart"); return c ? c.getBoundingClientRect().width : 0; });
  t.check("隠れていたグラフも幅いっぱいに描ける", chartW > 200, String(chartW));

  await page.evaluate(() => KN.app.showScreen("todo"));
  await page.waitForTimeout(300);
  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForTimeout(500);
  const back = await page.evaluate(() => [...document.querySelectorAll("#screen-diet .diet-panes .seg-btn")].map((b) => b.getAttribute("aria-pressed")));
  t.check("ほかのタブから戻っても「推移」のまま", JSON.stringify(back) === JSON.stringify(["false", "false", "true"]), JSON.stringify(back));

  /* V27：区画の色。三つとも違う色で塗られ、白い字が 4.5:1 以上 */
  const tones = [];
  for (const id of ["today", "log", "trend"]) {
    await page.click(`#screen-diet .diet-panes .js-pane[data-pane="${id}"]`);
    await page.waitForTimeout(350);
    tones.push(await page.evaluate((id) => {
      const b = document.querySelector(`#screen-diet .diet-panes .js-pane[data-pane="${id}"]`);
      const c = document.createElement("canvas").getContext("2d");
      c.fillStyle = getComputedStyle(b).backgroundColor;
      c.fillRect(0, 0, 1, 1);
      const [r, g, bl] = c.getImageData(0, 0, 1, 1).data;
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
      return { rgb: `${r},${g},${bl}`, ratio: 1.05 / (L + 0.05) };
    }, id));
  }
  t.check("三つの区画はそれぞれ別の色", new Set(tones.map((x) => x.rgb)).size === 3, JSON.stringify(tones));
  t.check("選んだ区画の白い字が読める（4.5:1 以上）", tones.every((x) => x.ratio >= 4.5), JSON.stringify(tones));

  const text = await page.evaluate(() => document.querySelector("#screen-diet .diet-panes").textContent);
  t.check("帯に評価の言葉・絵文字なし", !/達成|連続|目標|\p{Extended_Pictographic}/u.test(text), text);

  t.check("ページのエラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})();
