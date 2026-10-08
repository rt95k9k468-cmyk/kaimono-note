/* 道の寝床と、5:30 からの道（2026年9月30日、docs/todo-timeline.md の「寝床」）。
   利用者の声「5:00 じゃなく 5:30 スタートに。1行目の道が短くなってもいい」
   「5:30 以前と 22:30 以後に就寝アイコンを。朝は左右反転。道を外れた時間に開いて
   いたら z Z をいびきのように」。起きる時刻 5:30・寝る時刻 22:30 で、
   - 道は 5:30 から（角はちょうどの時。10月2日から角も時間を持ち、角のまん中がちょうどの時）。一段目は短い
   - 寝床は道の両端の外に二つ。朝も夜も同じ向き（10月1日、夜に揃えた）。道の端から離す
   - 寝ている時間でなければ薄く（10月1日）
   - 道の端の時刻は寝床の下。寝床と札・時刻・連れは DOM の箱で重ならない
   - 4:50 と 23:10：人は出ず、その側の寝床だけ z Z がのぼる（is-snore・animation）、
     いまの時刻は寝床の上。12:00：人が立ち、どちらも止まっている
   - いびきは三回で止まり、置いたまま（z Z は見えている）。道に触ると、また三回（10月8日・inspection.md の 2）
   - 評価の言葉と絵文字なし */
const { open, checker } = require("./lib");

const DAY = "2026-10-06";
const SNORE = "road-snore, road-snore-rest";   // 三回のぼって、最後に出てきて止まる

async function at(h, m, run) {
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, h, m)); },
  });
  await page.evaluate((d) => {
    const s = KN.store;
    s.update((st) => { st.settings.dayStart = "05:30"; st.settings.dayEnd = "22:30"; });
    s.addTodo({ title: "朝のルーティン", due: d, time: "05:30", minutes: 60 });
    s.addTodo({ title: "病院", due: d, time: "13:00", minutes: 90 });
    s.addTodo({ title: "夜のルーティン", due: d, time: "21:30", minutes: 60 });
    s.addTodo({ title: "メール", due: d });
    s.addTodo({ title: "片付け", due: d });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(800);
  await run(page);
  await browser.close();
  return errors;
}

/* 箱はいびきの動きを止めた置き場所で測る（のぼるぶんは BED_TOP が見込む）。 */
const read = (page) => page.evaluate(() => {
  const road = document.querySelector("#screen-todo .day-road");
  const snoring = [...road.querySelectorAll(".road-bed")].map((b) => getComputedStyle(b.querySelector(".road-z")).animationName);
  road.querySelectorAll(".road-z").forEach((z) => { z.style.animation = "none"; });
  return snoring;
}).then((anim) => page.evaluate((anim) => {
  const road = document.querySelector("#screen-todo .day-road");
  const st = road.__road, g = st.g;
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const beds = [...road.querySelectorAll(".road-bed")].map((b) => ({
    tf: b.querySelector(".road-bed-body").getAttribute("transform"), snore: b.classList.contains("is-snore"),
    op: Number(getComputedStyle(b).opacity),
    anim: anim[[...road.querySelectorAll(".road-bed")].indexOf(b)],
    ink: box(b.querySelector(".road-bed-ink")), z: box(b.querySelector(".road-z.is-big")),
  }));
  const texts = [...road.querySelectorAll(".road-label, .road-now, .road-edge, .road-turn, .road-bead")]
    .map((e) => ({ cls: e.className, txt: e.textContent.trim(), ...box(e) }));
  const inner = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return { l: r.left, r: r.right, t: r.top + parseFloat(s.paddingTop || 0), b: r.bottom - parseFloat(s.paddingBottom || 0) }; };
  return {
    start: g.start, begin: g.begin, end: g.end, d0: g.d0,
    first: g.point(g.d0), last: g.point(g.total), bedHi: st.beds[0].hi,
    base: road.querySelector(".road-base").getAttribute("d"),
    edges: [...road.querySelectorAll(".road-edge")].map((e) => ({ txt: e.textContent.trim(), ...box(e) })),
    turns: [...road.querySelectorAll(".road-hours:not(.is-over):not(.is-ink) text")].map((e) => e.textContent.trim()),
    labels: [...road.querySelectorAll(".road-label")].map((e) => ({ txt: e.textContent.replace(/\s+/g, " ").trim(), ...inner(e) })),
    beds, texts,
    meShown: road.querySelector(".road-me").style.display !== "none",
    now: (road.querySelector(".road-now") || { textContent: "" }).textContent.trim(),
    nowBox: road.querySelector(".road-now") ? box(road.querySelector(".road-now")) : null,
    text: road.textContent,
  };
}, anim));
const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
const cx = (b) => (b.l + b.r) / 2;

(async () => {
  const c = checker("road-bed");
  const errs = [];

  errs.push(...await at(12, 0, async (page) => {
    const r = await read(page);
    c.check("道は 5:30 から（一段目は短い）",
      r.begin === 330 && r.d0 > 30 && r.first.row === 0 && !r.first.arc && r.first.x > 80, JSON.stringify([r.begin, r.start, r.d0, r.first]));
    c.check("道筋も 5:30 の点から引く", r.base.startsWith(`M${Math.round(r.first.x * 10) / 10} `), r.base.slice(0, 30));
    c.check("時の数字はちょうどの時だけ（6 から）", r.turns[0] === "6" && r.turns.every((t) => /^\d{1,2}$/.test(t)), JSON.stringify(r.turns));
    c.check("終わりは 22:30", r.end === 1350);
    c.check("寝床は二つ", r.beds.length === 2, String(r.beds.length));
    /* 5:30〜22:30 は五段（10月2日から）で、最後の段は右へ進むので返す（足もとが道の側）。 */
    const want = r.last.ltr ? /scale\(-1 1\)/ : /scale\(1 1\)/;
    c.check("朝も夜も同じ向き（夜に揃える。歩く人の逆で、足もとが道の側）",
      want.test(r.beds[0].tf) && want.test(r.beds[1].tf), JSON.stringify([r.last.ltr, r.beds.map((b) => b.tf)]));
    c.check("朝の寝床は道の始まりの手前（左）、夜の寝床は終わりの先",
      r.beds[0].ink.r < r.texts.find((t) => /5:30/.test(t.txt) && /road-label/.test(t.cls)).l + 1
        && r.beds[1].ink.l > 0, JSON.stringify(r.beds.map((b) => b.ink)));
    c.check("道の端の時刻は寝床の下（5:30・22:30）",
      r.edges.length === 2 && r.edges[0].txt === "5:30" && r.edges[1].txt === "22:30"
        && r.edges.every((e, k) => e.t >= r.beds[k].ink.b - 2 && Math.abs(cx(e) - cx(r.beds[k].ink)) < 3),
      JSON.stringify(r.edges));
    const clash = [];
    r.beds.forEach((b, k) => [b.ink, b.z].forEach((bx) => r.texts.forEach((t) => { if (hit(bx, t)) clash.push([k, t.txt]); })));
    c.check("寝床（z Z も）と札・時刻・連れは重ならない", !clash.length, JSON.stringify(clash));
    c.check("道の上（12:00）：どちらの寝床も薄い（寝ている時間ではない）", r.beds.every((b) => b.op < 0.5),
      JSON.stringify(r.beds.map((b) => b.op)));
    c.check("道の上（12:00）：寝床は道の端から離れている（くっつかない）",
      r.first.x - r.bedHi >= 10, JSON.stringify([r.first.x, r.bedHi]));
    c.check("道の上（12:00）：人が立ち、どちらの寝床も止まっている",
      r.meShown && r.beds.every((b) => !b.snore && b.anim === "none"), JSON.stringify(r.beds.map((b) => [b.snore, b.anim])));
    c.check("評価の言葉と絵文字なし",
      !/遅れ|超過|達成|予定通り|%|[\u{1F300}-\u{1FAFF}☀-➿]/u.test(r.text), r.text);
  }));

  errs.push(...await at(4, 50, async (page) => {
    const r = await read(page);
    c.check("4:50：人は道に居ない", !r.meShown);
    c.check("4:50：朝の寝床は濃く、夜の寝床は薄い", r.beds[0].op === 1 && r.beds[1].op < 0.5,
      JSON.stringify(r.beds.map((b) => b.op)));
    c.check("4:50：朝の寝床だけ z Z がのぼる", r.beds[0].snore && r.beds[0].anim === SNORE
      && !r.beds[1].snore, JSON.stringify(r.beds.map((b) => [b.snore, b.anim])));
    c.check("4:50：いまの時刻は朝の寝床の上", r.now === "4:50" && r.nowBox.b <= r.beds[0].z.t - 4
      && Math.abs(cx(r.nowBox) - cx(r.beds[0].ink)) < 3, JSON.stringify([r.nowBox, r.beds[0]]));
    const clash = [];
    r.beds.forEach((b, k) => [b.ink, b.z].forEach((bx) => r.texts.forEach((t) => { if (hit(bx, t)) clash.push([k, t.txt]); })));
    c.check("4:50：寝床と連れ・札は重ならない（連れは道の側）", !clash.length, JSON.stringify(clash));
  }));

  errs.push(...await at(23, 10, async (page) => {
    /* 三回で止める（待たずに終わりまで送る）。止んだら z Z は置いたまま見えている。触ると、また三回。 */
    const snore = () => page.evaluate(() => {
      const b = document.querySelector("#screen-todo .day-road .road-bed.is-snore");
      const an = b.getAnimations({ subtree: true }).filter((a) => a.animationName);
      const z = getComputedStyle(b.querySelector(".road-z.is-big"));
      return { n: an.length, its: an.filter((a) => a.animationName === "road-snore").map((a) => a.effect.getComputedTiming().iterations),
               op: Number(z.opacity), tr: z.translate, sc: z.scale };
    });
    const finish = () => page.evaluate(() => document.querySelector("#screen-todo .day-road .road-bed.is-snore")
      .getAnimations({ subtree: true }).forEach((a) => a.finish()));
    const s0 = await snore();
    c.check("23:10：いびきは三回（z と Z）", s0.n === 4 && s0.its.join() === "3,3", JSON.stringify(s0));
    await finish();
    const s1 = await snore();
    c.check("23:10：三回で止まり、z Z は置いたまま見えている", s1.n === 0 && s1.op === 1 && s1.tr === "none" && s1.sc === "none",
      JSON.stringify(s1));
    await page.evaluate(() => document.querySelector("#screen-todo .day-road")
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    const s2 = await snore();
    c.check("23:10：道に触ると、またのぼる", s2.n === 4, JSON.stringify(s2));
    const t3 = await page.evaluate(() => {
      const road = document.querySelector("#screen-todo .day-road");
      const an = road.querySelector(".road-bed.is-snore").getAnimations({ subtree: true }).filter((a) => a.animationName);
      an.forEach((a) => { a.currentTime = 3000; });
      road.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      return an.map((a) => a.currentTime);
    });
    c.check("23:10：のぼっている最中に触っても、頭からにしない", t3.length === 4 && t3.every((t) => t >= 3000), JSON.stringify(t3));
    const r = await read(page);
    c.check("23:10：人は道に居ない", !r.meShown);
    c.check("23:10：夜の寝床は濃く、朝の寝床は薄い", r.beds[1].op === 1 && r.beds[0].op < 0.5,
      JSON.stringify(r.beds.map((b) => b.op)));
    c.check("23:10：夜の寝床だけ z Z がのぼる", r.beds[1].snore && r.beds[1].anim === SNORE && !r.beds[0].snore,
      JSON.stringify(r.beds.map((b) => [b.snore, b.anim])));
    const edge = r.edges[1];
    c.check("23:10：いまの時刻は夜の寝床の下（寝床の時刻のさらに下）", r.now === "23:10" && r.nowBox.t >= edge.b - 1
      && r.nowBox.t >= r.beds[1].ink.b && Math.abs(cx(r.nowBox) - cx(r.beds[1].ink)) < 3,
      JSON.stringify([r.nowBox, edge, r.beds[1].ink]));
  }));

  c.check("エラーなし", !errs.length, errs.join("\n"));
  c.done();
})();
