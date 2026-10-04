/* 5方向の人（2.0 の V7、docs/todo-timeline.md の「歩く人と寝床」「曲がり角も時間を持つ」「歩く」）。
   時計を 8:00（一つ目の角のまん中。5:30〜22:30 の五段で、角は 7:18〜8:42）に止めて：
   - 角の上の時刻で向きが変わる：右 → 右下 → 下 → 左下 → 左（左下・左は右下・右を返す）。体は立てたまま
   - 出ているのは人の向き（data-face）の形だけ。止まった形は選んだ字のまま（脚と胴）、腕は手の位置で 15 以内
   - 向きごとに pose(τ, 向き) で形を測る（フレームの揺れなしに）：
     右下：膝は前へ・足は自分の通り道より下へ行かない・半ばの腕は脚と逆
     下：脚は列を離れない（腰を入れ替えない）・膝は横へ折れない・足は手前と奥へ動く・半ばの腕は脚と逆
     どれも：脚が一周して同じ形に戻ると腕も同じ形（同じ拍）・体は浮くだけ
   - 前に見た点（7:13）から角を回って追いつくと、右 → 右下 → 下 と順に替わり、下の止まった形で
     止まる。縁は絵と同じ形、隠れた向きはいつも止まった形のまま
   - 動きを減らす設定では、下の止まった形のまま */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";
/* 利用者が選んだ止まった形（10月4日、docs/roadmap-2.0.md の V7）。 */
const CHOSEN = {
  rd: { legB: "M562 690L652 885L705 1068", legF: "M498 690L462 880L398 1036",
        body: "M462 660L476 455Q486 342 552 330L612 328Q686 334 694 416L664 684Z",
        armB: "M468 440L408 505L392 652", armF: "M690 548L694 614L800 668", head: "632" },
  d: { legF: "M612 690L620 868L626 1018", legB: "M514 690L508 892L502 1072",
       body: "M465 665L455 430Q458 340 525 330L600 330Q667 340 670 430L660 665Z",
       armB: "M446 458L438 540L446 612", armF: "M680 460L696 556L664 650", head: "562" },
};
const pts = (d) => {
  const v = String(d).match(/-?\d+(?:\.\d+)?/g).map(Number);
  const out = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push({ x: v[i], y: v[i + 1] });
  return out;
};
const hand = (d) => pts(d)[pts(d).length - 1];

(async () => {
  const c = checker("road-face");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 8, 0)); },
  });
  await page.evaluate((day) => {
    const s = KN.store;
    s.addTodo({ title: "朝のルーティン", due: day, time: "05:30", minutes: 60, repeat: "daily" });
    s.addTodo({ title: "病院", due: day, time: "13:00", minutes: 90 });
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  const settle = () => page.waitForFunction(() => {
    const m = document.querySelector('.screen[data-screen="todo"] .day-road .road-me');
    return m && m.__at && !m.__walk;
  }, null, { polling: 50, timeout: 4000 });
  await settle();

  /* 人の中の、向きごとの形（縁と絵）。 */
  const shapes = () => page.evaluate(() => {
    const m = document.querySelector('.screen[data-screen="todo"] .day-road .road-me');
    const out = { face: m.dataset.face, at: m.getAttribute("transform"), shown: {}, ink: {}, halo: {} };
    ["ink", "halo"].forEach((layer) => m.querySelectorAll(`.road-me-${layer} [data-face]`).forEach((g) => {
      const o = {};
      g.querySelectorAll("[data-w]").forEach((e) => {
        o[e.dataset.w] = (e.getAttribute("d") || e.getAttribute("cx")) + "|" + (e.getAttribute("transform") || "");
      });
      out[layer][g.dataset.face] = o;
      if (layer === "ink") out.shown[g.dataset.face] = getComputedStyle(g).display !== "none";
    }));
    return out;
  });
  const dOf = (o, k) => o[k].split("|")[0];

  /* ---- 角の上の時刻で向きが変わる ---- */
  const faces = await page.evaluate(() => {
    const m = document.querySelector('.screen[data-screen="todo"] .day-road .road-me');
    const at = (h, mm) => { const a = m.__stand(m.__dist(h * 60 + mm), 9); return a.face + (a.sx > 0 ? "+" : "-"); };
    const seq = [];
    for (let t = 6 * 60; t <= 10 * 60; t++) {
      const f = at(Math.floor(t / 60), t % 60);
      if (seq[seq.length - 1] !== f) seq.push(f);
    }
    return { seq, at7: at(7, 0), at740: at(7, 40), at8: at(8, 0), at820: at(8, 20), at9: at(9, 0) };
  });
  c.check("角の上で向きが変わる：右 → 右下 → 下 → 左下 → 左（左下・左は右下・右を返す）",
    faces.seq.join(" ") === "r+ rd+ d+ rd- r-", faces.seq.join(" "));
  c.check("まっすぐは右か左、角の半ばは右下・下・左下（7:00 右・7:40 右下・8:00 下・8:20 左下・9:00 左）",
    faces.at7 === "r+" && faces.at740 === "rd+" && faces.at8 === "d+" && faces.at820 === "rd-" && faces.at9 === "r-",
    JSON.stringify(faces));

  /* ---- 出ているのは人の向きの形だけ・止まった形は選んだ字 ---- */
  let s = await shapes();
  c.check("8:00（角のまん中）では下を向き、出ているのは下の形だけ",
    s.face === "d" && s.shown.d && !s.shown.r && !s.shown.rd, JSON.stringify({ face: s.face, shown: s.shown }));
  c.check("下を向いても体は立てたまま（回さない・上下を返さない）",
    !/rotate|skew|matrix/.test(s.at) && /scale\(1\.45 1\.45\)/.test(s.at), s.at);
  ["rd", "d"].forEach((f) => {
    const o = s.ink[f], want = CHOSEN[f];
    const legsOk = ["legF", "legB", "body"].every((k) => dOf(o, k) === want[k]) && dOf(o, "head") === want.head;
    const off = ["armB", "armF"].map((k) => { const a = hand(dOf(o, k)), b = hand(want[k]); return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10; });
    c.check(`${f === "d" ? "下" : "右下"}の止まった形は選んだ字：脚と胴と頭はそのまま、腕は手の位置で 15 以内`,
      legsOk && off.every((v) => v < 15), JSON.stringify({ o, off }));
  });
  const REST = { r: s.ink.r, rd: s.ink.rd, d: s.ink.d };

  /* ---- 向きごとの歩き（pose(τ, 向き)） ---- */
  const walk = await page.evaluate(() => {
    const P = KN.dayRoad.pose, N = 400;
    const cross = (h, k, f) => (f.x - h.x) * (k.y - h.y) - (f.y - h.y) * (k.x - h.x);
    const r = { rd: { kneeBack: 0, under: 0, against: 0, with_: 0 },
                d: { hipMoved: 0, footOut: 0, kneeSide: 0, footYmin: 1e9, footYmax: -1e9, under: 0, against: 0, with_: 0, handYmin: 1e9, handYmax: -1e9 },
                bob: { min: 0, max: -1e9 } };
    /* 右下の足の通り道（選んだ形の、前の足と後ろの足を通る線。二本は腰の差だけずれる）。 */
    const groundRd = (x, hipX) => { const x0 = 705 + hipX - 562; return 1068 + (x - x0) * (1036 - 1068) / (462 - 705); };
    for (let i = 0; i <= N; i++) {
      const tau = i / N;
      const a = P(tau, "rd");
      [["legB", 562], ["legF", 498]].forEach(([k, hx]) => {
        const [h, kn, f] = a[k];
        if (cross(h, kn, f) > 0.5) r.rd.kneeBack++;
        if (f.y > groundRd(f.x, hx) + 0.05) r.rd.under++;
      });
      const b = P(tau, "d");
      [["legB", 514, 502], ["legF", 612, 626]].forEach(([k, hx, fx]) => {
        const [h, kn, f] = b[k];
        if (Math.abs(h.x - hx) > 0.05) r.d.hipMoved++;
        if (Math.abs(f.x - fx) > 3) r.d.footOut++;
        /* 膝が腰と足を結ぶ線からどれだけ横へ出たか（描いた脚は 1 未満）。 */
        if (Math.abs(cross(h, kn, f)) / Math.hypot(f.x - h.x, f.y - h.y) > 2) r.d.kneeSide++;
        if (f.y > 1072.05) r.d.under++;
        r.d.footYmin = Math.min(r.d.footYmin, f.y); r.d.footYmax = Math.max(r.d.footYmax, f.y);
      });
      [b.armB, b.armF].forEach((arm) => { const y = arm[arm.length - 1].y - b.bob; r.d.handYmin = Math.min(r.d.handYmin, y); r.d.handYmax = Math.max(r.d.handYmax, y); });
      [a, b].forEach((q) => { r.bob.min = Math.min(r.bob.min, q.bob); r.bob.max = Math.max(r.bob.max, q.bob); });
      if (tau > 0.3 && tau < 0.7) {
        /* 半ばの腕は脚と逆。右下は横（x）で、手前の足が前なら奥の手が前。下は手前（画面の下、y）で、
           濃い脚（左）が手前なら右の手が手前。 */
        const dF = a.legF[2].x - a.legB[2].x, dH = a.armB[2].x - a.armF[2].x;
        if (Math.abs(dF) >= 60 && Math.abs(dH) >= 60) { if (dF * dH > 0) r.rd.against++; else r.rd.with_++; }
        const eF = b.legB[2].y - b.legF[2].y, eH = b.armF[2].y - b.armB[2].y;
        if (Math.abs(eF) >= 15 && Math.abs(eH) >= 15) { if (eF * eH > 0) r.d.against++; else r.d.with_++; }
      }
    }
    /* 同じ拍：脚が一周して同じ形に戻ると、腕も同じ形（road-walk.js と同じ見方を、向きごとに）。 */
    const lock = (face) => {
      const Q = (t) => P(t, face);
      const sum = (a, b, ks) => ks.reduce((s, k) => s + Math.hypot(a[k][a[k].length - 1].x - b[k][b[k].length - 1].x, a[k][a[k].length - 1].y - b[k][b[k].length - 1].y), 0);
      let legW = 0, armW = 0;
      const t1s = [];
      for (let t = 0.02; t <= 0.46; t += 0.04) t1s.push(t);
      for (let t = 0.5; t <= 0.98; t += 0.04) t1s.push(t);
      t1s.forEach((t1) => {
        const a = Q(t1);
        const [lo, hi] = t1 <= 0.46 ? [t1 + 0.2, 1] : [0, t1 - 0.2];
        let at = null, bd = Infinity;
        for (let t2 = lo; t2 <= hi; t2 += 0.0003) { const d = sum(a, Q(t2), ["legF", "legB"]); if (d < bd) { bd = d; at = t2; } }
        legW = Math.max(legW, bd);
        armW = Math.max(armW, sum(a, Q(at), ["armF", "armB"]));
      });
      return { leg: Math.round(legW * 10) / 10, arm: Math.round(armW * 10) / 10 };
    };
    r.lock = { rd: lock("rd"), d: lock("d") };
    return r;
  });
  c.check("右下：膝は前へ曲がる（後ろへ折れない）", walk.rd.kneeBack === 0, JSON.stringify(walk.rd));
  c.check("右下：足は自分の通り道（前の足と後ろの足を通る線）より下へ行かない", walk.rd.under === 0, JSON.stringify(walk.rd));
  c.check("右下：半ばの腕は脚と逆に振る", walk.rd.against > 20 && walk.rd.with_ === 0, JSON.stringify(walk.rd));
  c.check("下：脚はそれぞれの列を離れない（腰を入れ替えない・足は横へ 3 以内）",
    walk.d.hipMoved === 0 && walk.d.footOut === 0, JSON.stringify(walk.d));
  c.check("下：縮んだ脚の膝が横へ折れない（腰と足を結ぶ線から 2 以内）", walk.d.kneeSide === 0, JSON.stringify(walk.d));
  c.check("下：足は手前と奥へ動き（40 以上）、手前の地面（y 1072）より下へ行かない",
    walk.d.footYmax - walk.d.footYmin >= 40 && walk.d.under === 0, JSON.stringify(walk.d));
  c.check("下：腕も手前と奥へ振る（手の高さが 30 以上動く）", walk.d.handYmax - walk.d.handYmin >= 30, JSON.stringify(walk.d));
  c.check("下：半ばの腕は脚と逆に振る（濃い脚が手前なら右の手が手前）", walk.d.against > 20 && walk.d.with_ === 0, JSON.stringify(walk.d));
  c.check("どの向きも体は浮くだけで沈まない（0〜18）", walk.bob.max <= 0 && walk.bob.min >= -18.05 && walk.bob.min < -5, JSON.stringify(walk.bob));
  c.check("右下も下も、腕と脚は同じ拍（脚が一周して同じ形に戻ると、手の違いが 6 以内）",
    ["rd", "d"].every((f) => walk.lock[f].leg < 3 && walk.lock[f].arm < 6), JSON.stringify(walk.lock));

  /* ---- 前に見た点から角を回って追いつく ---- */
  await page.click('.tab[data-tab="archive"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    localStorage.setItem("kn-road-seen", "2026-09-29 433");   // 7:13（まだまっすぐの上）
    const log = window.__faceLog = { t0: performance.now(), frames: [], stop: false };
    const f = () => {
      const m = document.querySelector('.screen[data-screen="todo"] .day-road .road-me');
      if (m && m.style.display !== "none") {
        const r = { t: performance.now() - log.t0, face: m.dataset.face, at: m.getAttribute("transform"), g: {}, walk: !!m.__walk };
        ["ink", "halo"].forEach((layer) => m.querySelectorAll(`.road-me-${layer} [data-face]`).forEach((g) => {
          const o = {};
          g.querySelectorAll("[data-w]").forEach((e) => {
            o[e.dataset.w] = (e.getAttribute("d") || e.getAttribute("cx")) + "|" + (e.getAttribute("transform") || "");
          });
          r.g[layer + ":" + g.dataset.face] = o;
          if (layer === "ink") r["shown:" + g.dataset.face] = getComputedStyle(g).display !== "none";
        }));
        log.frames.push(r);
      }
      if (!log.stop) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(300);
  await settle();
  await page.waitForTimeout(80);
  /* 押す前（裏のやることの紙）は、もう「いま」（下向き）に立っている。前に見た点へ下がって
     歩き出してからを見る（写しの rAF は歩きの一コマ目より先に回るので、__walk だけでは
     描かれない一コマを拾う）。 */
  const all = await page.evaluate(() => { window.__faceLog.stop = true; return window.__faceLog.frames; });
  const F = all.slice(Math.max(0, all.findIndex((r) => r.walk && r.at !== all[all.length - 1].at)));
  const same = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);
  const order = [];
  F.forEach((r) => { if (order[order.length - 1] !== r.face) order.push(r.face); });
  c.check("7:13 に見ていたら、角を回りながら 右 → 右下 → 下 と順に向きが替わる", order.join(" ") === "r rd d", order.join(" "));
  c.check("どのフレームも、出ているのは人の向きの形だけ",
    F.length > 20 && F.every((r) => ["r", "rd", "d"].every((f) => r["shown:" + f] === (f === r.face))),
    String(F.length));
  c.check("縁（halo）は、どのフレームでも絵と同じ形", F.every((r) => same(r.g["halo:" + r.face], r.g["ink:" + r.face])));
  const hiddenOff = F.filter((r) => ["r", "rd", "d"].some((f) => f !== r.face && !same(r.g["ink:" + f], REST[f])));
  c.check("隠れた向きは、いつも止まった形のまま（向きが替わるとき止まった形へ戻す）", hiddenOff.length === 0,
    hiddenOff.length ? JSON.stringify(hiddenOff[0]) : "");
  const moving = F.filter((r) => !same(r.g["ink:" + r.face], REST[r.face]));
  c.check("向きが替わっても歩きは続く（右下・下の形でも脚と腕が動く）",
    ["rd", "d"].every((f) => moving.some((r) => r.face === f)), JSON.stringify(moving.map((r) => r.face).filter((f, i, a) => a.indexOf(f) === i)));
  const last = F[F.length - 1];
  c.check("下の止まった形で止まる", last && last.face === "d" && same(last.g["ink:d"], REST.d), last && last.face);
  c.check("回っているあいだも体は立てたまま", F.every((r) => !/rotate|skew|matrix/.test(r.at) && /1\.45\)$/.test(r.at)));

  /* ---- 動きを減らす設定 ---- */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click('.tab[data-tab="archive"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => localStorage.setItem("kn-road-seen", "2026-09-29 433"));
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(600);
  s = await shapes();
  c.check("動きを減らす設定では、下の止まった形のまま", s.face === "d" && same(s.ink.d, REST.d), s.face);

  c.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
