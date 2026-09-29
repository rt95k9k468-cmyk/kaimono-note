/* 道の人が歩く（2026年9月29日、docs/todo-timeline.md の「一日の道」の「歩く」）。
   時計を 7:43 に止め、道に人が立つ今日で：
   - 起動してやることが出たら歩き、止まった形（ME_PARTS の字のまま）で止まる
   - 別のタブからやることへ入ると、また歩く：脚も腕も動き、縁（halo）は絵と同じ形で動く
   - 足は地面より下へ行かない・膝は前へ曲がる・体は浮くだけ（沈まない）
   - 腕は最初から最後まで脚と同じ拍・同じ大きさで振り、半ばでは脚と逆
   - 止まった形は元の絵と同じ位置（前に出ている脚が奥の脚になるだけ）
   - 腕はちゃんと振れる（奥の手が前へ 150 以上）
   - 長さは --m-walk から（四歩と速さの台形で 2.0s）
   - 腕と脚は同じ拍・腕ははじめ・おわりで急がない（形を τ で引いて見る）
   - 歩いている途中にもう一度タブを押しても、頭からやり直さない（止まった形へ跳ばない）
   - 戻ってきたら（visibilitychange）歩く
   - 動きを減らす設定では歩かない */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";
/* 止まった形（day-road.js の REST。9月29日に利用者が選んだ）。元の絵と同じ位置で、前に
   出ている脚を奥の脚として描いたもの——脚の字は元の絵の前後が入れ替わるだけ、腕は元の絵に
   ほぼ同じ。 */
const STILL = {
  armB: "M472.1 442.1L381.4 496.3L348.5 693.6", sleeveB: "M555 356L447.4 454.7",
  legB: "M540 690L690 890L775 1050", legF: "M478 690L425 878L325 1050",
  armF: "M701.3 550.6L694.8 612.4L854.8 669.2", sleeveF: "M680 400L708.2 555.7",
};
/* 利用者が選んだ元の絵（day-road.js の ME_PARTS）。 */
const DRAWN = {
  armB: "M470 440L378 492L338 688", sleeveB: "M555 356L445 452",
  legB: "M478 690L425 878L325 1050", legF: "M540 690L690 890L775 1050",
  armF: "M705 550L700 612L862 663", sleeveF: "M680 400L712 555",
};
const KEYS = Object.keys(STILL);
const LEGS = ["legB", "legF"];

const pts = (d) => {
  const v = String(d).match(/-?\d+(?:\.\d+)?/g).map(Number);
  const out = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push({ x: v[i], y: v[i + 1] });
  return out;
};
const isStill = (r) => KEYS.every((k) => r[k] === STILL[k]) && r.body == null && r.head == null;

(async () => {
  const c = checker("road-walk");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 7, 43)); },
  });

  /* 毎フレーム、人の形を写す。t は写し始めからの ms。押した時刻も同じ物差しで
     （やることの席を押した時刻は、読み直したあとに仕込む見張りが控える）。 */
  async function sample(ms, act) {
    await page.evaluate((KEYS) => {
      const log = window.__walkLog = { t0: performance.now(), frames: [], stop: false };
      const f = () => {
        const m = document.querySelector('.screen[data-screen="todo"] .day-road .road-me');
        if (m && m.style.display !== "none") {
          const g = (layer, k, a) => {
            const el = m.querySelector(`.road-me-${layer} [data-w="${k}"]`);
            return el ? el.getAttribute(a) : "(無い)";
          };
          const r = { t: performance.now() - log.t0 };
          KEYS.forEach((k) => { r[k] = g("ink", k, "d"); r["h" + k] = g("halo", k, "d"); });
          r.body = g("ink", "body", "transform"); r.hbody = g("halo", "body", "transform");
          r.head = g("ink", "head", "transform"); r.hhead = g("halo", "head", "transform");
          log.frames.push(r);
        }
        if (!log.stop) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }, KEYS);
    if (act) await act();
    await page.waitForTimeout(ms);
    /* 決め打ちの ms だけだと、ページの時計が遅れた回に歩き終わる前に撮り終える
       （3回に1回、最後のフレームが歩きの途中だった）。歩き終わるまで待つ。 */
    await page.waitForFunction(() => {
      const m = document.querySelector('.screen[data-screen="todo"] .day-road .road-me');
      return !m || !m.__walk;
    }, null, { polling: 50, timeout: 4000 });
    await page.waitForTimeout(80);
    return page.evaluate(() => {
      const log = window.__walkLog;
      log.stop = true;
      return { frames: log.frames, clicks: window.__clicks.map((t) => t - log.t0) };
    });
  }
  /* 腕を振っているか。腕は体の浮きと一緒に上下するので、字ではなく**肩から手への
     向き**で見る（浮いただけなら同じ）。 */
  const rel = (sleeve, arm) => { const s = pts(sleeve)[0], h = pts(arm)[2]; return { x: h.x - s.x, y: h.y - s.y }; };
  const RB = rel(STILL.sleeveB, STILL.armB), RF = rel(STILL.sleeveF, STILL.armF);
  const swung = (r) => {
    const b = rel(r.sleeveB, r.armB), f = rel(r.sleeveF, r.armF);
    return Math.hypot(b.x - RB.x, b.y - RB.y) > 0.5 || Math.hypot(f.x - RF.x, f.y - RF.y) > 0.5;
  };
  /* 動き出し（最初に止まった形でなくなったフレーム）と、止まった形へ戻ったフレーム。
     keys が "swing" なら腕の振りだけを見る。 */
  function span(F, keys) {
    const moved = (r) => (keys === "swing" ? swung(r)
      : keys ? keys.some((k) => r[k] !== STILL[k]) : !isStill(r));
    const a = F.findIndex(moved);
    if (a < 0) return null;
    let b = -1;
    for (let i = a; i < F.length; i++) if (!moved(F[i])) { b = i; break; }
    let last = a;
    for (let i = a; i < F.length; i++) if (moved(F[i])) last = i;
    return { from: F[a].t, back: b >= 0 ? F[b].t : null, last: F[last].t, a, b };
  }

  /* 道に人を立たせる日（day-road.js の試験と同じ一日の、一部）。 */
  await page.evaluate((day) => {
    const s = KN.store;
    s.addTodo({ title: "朝のルーティン", due: day, time: "05:30", minutes: 60, repeat: "daily" });
    s.addTodo({ title: "病院", due: day, time: "13:00", minutes: 90 });
    s.addTodo({ title: "メール", due: day });
  }, DAY);

  /* ---- 起動したときも歩く ----
     起動の席は daily（HOME）。やることへ移ると印が #todo になるので、読み直せば
     やることで立ち上がる。 */
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(2300);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app);
  await page.evaluate(() => {
    window.__clicks = [];
    document.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest('.tab[data-tab="todo"]')) window.__clicks.push(performance.now());
    }, true);
  });
  let log = await sample(2600);
  let F = log.frames;
  let sp = span(F);
  c.check("起動してやることが出たら、道の人が歩く", F.length > 20 && sp != null, `${F.length} フレーム`);
  c.check("そして止まった形で止まる（d がもとの字のまま・transform が残らない）",
    F.length > 0 && isStill(F[F.length - 1]), JSON.stringify(F[F.length - 1]));
  /* 止まった形は、利用者が選んだ元の絵と同じ位置（9月29日「①で足も同時に」）。脚は前後の
     字が入れ替わるだけ（前の脚が奥の脚になる）、腕は手の位置で元の絵から 15 以内（約 0.5px）。 */
  const handOff = ["armB", "armF"].map((k) => { const a = pts(STILL[k])[2], b = pts(DRAWN[k])[2]; return Math.hypot(a.x - b.x, a.y - b.y); });
  c.check("止まった形は元の絵と同じ位置：脚は前後が入れ替わるだけ、腕は手の位置で 15 以内",
    STILL.legB === DRAWN.legF && STILL.legF === DRAWN.legB && handOff.every((d) => d < 15), JSON.stringify(handOff));

  /* ---- 別のタブから入ると、また歩く ---- */
  await page.click('.tab[data-tab="archive"]');
  await page.waitForTimeout(500);
  log = await sample(2700, () => page.click('.tab[data-tab="todo"]'));
  F = log.frames;
  const click = log.clicks[log.clicks.length - 1];
  sp = span(F);
  c.check("別のタブからやることへ入ると、歩き出す", sp != null && click != null && sp.from - click < 120,
    JSON.stringify({ sp, click }));
  const legs = span(F, LEGS), arms = span(F, "swing");
  c.check("脚も動き、腕も振る", legs != null && arms != null, JSON.stringify({ legs, arms }));
  c.check("縁（halo）は、どのフレームでも絵と同じ形",
    F.every((r) => KEYS.every((k) => r[k] === r["h" + k]) && r.body === r.hbody && r.head === r.hhead));
  let under = 0, kneeBack = 0, sink = 0, maxRise = 0;
  F.forEach((r) => {
    LEGS.forEach((k) => {
      const [h, kn, f] = pts(r[k]);
      if (f.y > 1050.05) under++;
      const cross = (f.x - h.x) * (kn.y - h.y) - (f.y - h.y) * (kn.x - h.x);
      if (cross > 0.5) kneeBack++;
    });
    if (r.body) {
      const y = Number((r.body.match(/translate\(0 (-?[\d.]+)\)/) || [])[1]);
      if (!(y <= 0)) sink++;
      maxRise = Math.max(maxRise, -y);
    }
  });
  c.check("足は地面（y 1050）より下へ行かない", under === 0, `${under} 本`);
  c.check("膝は前へ曲がる（後ろへ折れない）", kneeBack === 0, `${kneeBack} 本`);
  c.check("体は浮くだけで沈まない（元の絵の単位で 0〜18）", sink === 0 && maxRise > 5 && maxRise <= 18.05,
    JSON.stringify({ sink, maxRise }));
  const handXs = F.map((r) => pts(r.armB)[2].x);
  const handRange = Math.max(...handXs) - Math.min(...handXs);
  c.check("腕はちゃんと振れる：奥の手が前後に 150 以上動く", handRange > 150, String(handRange));
  c.check("腕は最初から振る（脚が動き出してから 150ms 以内に、肩から手への向きが変わる）",
    legs && arms && arms.from - legs.from < 150, JSON.stringify({ legs, arms }));
  c.check("腕は最後まで振る（脚が止まる 150ms 前より後まで、腕も動いている）",
    legs && arms && legs.last - arms.last < 150, JSON.stringify({ legs, arms }));
  /* 半ばでは脚と逆：手前の足が前（x が大きい）のとき、奥の手が前。 */
  let with_ = 0, against = 0;
  F.filter((r) => r.t > legs.from + 800 && r.t < legs.last - 800).forEach((r) => {
    const dFoot = pts(r.legF)[2].x - pts(r.legB)[2].x, dHand = pts(r.armB)[2].x - pts(r.armF)[2].x;
    if (Math.abs(dFoot) < 60 || Math.abs(dHand) < 60) return;
    if (dFoot * dHand > 0) against++; else with_++;
  });
  c.check("半ばの腕は脚と逆に振る", against > 5 && with_ === 0, JSON.stringify({ against, with_ }));
  let jump = 0;
  for (let i = 1; i < F.length; i++) {
    const a = pts(F[i - 1].armB)[2], b = pts(F[i].armB)[2];
    jump = Math.max(jump, Math.hypot(b.x - a.x, b.y - a.y));
  }
  c.check("腕は一フレームで跳ばない（奥の手の動きが 1 フレーム 80 以内）", jump < 80, String(jump));
  const k = await page.evaluate(() => KN.motion.ms("--m-walk"));
  const took = sp && sp.back != null ? sp.back - click : null;
  c.check("長さは --m-walk から：四歩と速さの台形で 2.0s（1.8〜2.4s で止まった形へ）",
    k === 400 && took != null && took >= 1800 && took <= 2400, JSON.stringify({ k, took }));
  c.check("止まった形とぴったり同じで止まる", isStill(F[F.length - 1]), JSON.stringify(F[F.length - 1]));

  /* 腕は終わりで急がない（9月29日・利用者の声「人のアイコンも最後だけ動きが速く
     なっておかしい」）。前は後半で腕のずれを先へ送って一周させていて、その送りが
     後半で急ぐ曲線だったので、脚が止まりはじめる 70〜85% で腕がいちばん速く振れた。
     フレームの揺れを避けて、形を経った割合 τ で引き（KN.dayRoad.pose）、肩から手の
     向きが変わる速さを比べる。 */
  const pace = await page.evaluate(() => {
    const armA = (q) => Math.atan2(q.armB[2].y - q.sleeveB[0].y, q.armB[2].x - q.sleeveB[0].x);
    const legA = (q) => Math.atan2(q.legF[2].y - q.legF[0].y, q.legF[2].x - q.legF[0].x);
    const N = 400, arm = [], leg = [];
    for (let i = 0; i < N; i++) {
      const a = KN.dayRoad.pose(i / N), b = KN.dayRoad.pose((i + 1) / N);
      arm.push(Math.abs(armA(b) - armA(a)) * N);
      leg.push(Math.abs(legA(b) - legA(a)) * N);
    }
    const max = (xs, lo, hi) => Math.round(Math.max(...xs.slice(lo * N, hi * N)) * 100) / 100;
    return { armStart: max(arm, 0, 0.25), armMid: max(arm, 0.3, 0.6), armEnd: max(arm, 0.7, 1),
             legMid: max(leg, 0.3, 0.6), legEnd: max(leg, 0.7, 1) };
  });
  c.check("腕は終わりで急がない：止まりぎわ（70%〜）の腕の振りは、半ば（30〜60%）より速くならない",
    pace.armEnd <= pace.armMid * 1.02, JSON.stringify(pace));
  c.check("腕は歩き出しでも急がない：はじめ（〜25%）の腕の振りは、半ばより速くならない",
    pace.armStart <= pace.armMid * 1.02, JSON.stringify(pace));

  /* 腕と脚は同じ拍、はじめからおわりまで（9月29日・利用者の声「まだ腕と足の速さが
     合ってない」「終わり方が不自然。そのままの動きで遅くしてほしい」）。
     - ずれを途中で動かした二つの作りは、ずれが動くあいだ腕の拍が脚と違った。
     - 振りの大きさでつないだ作りは、止まりぎわで腕だけ引き返した。
     止まった形を元の絵と同じ位置の「歩きの一瞬」にしたので（前の脚が奥の脚）、はじめから
     おわりまで、ずれも大きさも変えない。
     どれも「脚が同じ形なのに腕が違う形」になる。半ばと同じ動きが速く・遅くなるだけなら、
     脚が一周して同じ形に戻ったとき、腕も同じ形。歩きの頭から尻まで（2〜98%）、脚が
     同じ形になる一周となり（探す）と比べる。 */
  const lock = await page.evaluate(() => {
    const P = KN.dayRoad.pose;
    const foot = (a, b) => ["legF", "legB"].reduce((s, k) => s + Math.hypot(a[k][2].x - b[k][2].x, a[k][2].y - b[k][2].y), 0);
    const hand = (a, b) => ["armF", "armB"].reduce((s, k) => s + Math.hypot(a[k][2].x - b[k][2].x, a[k][2].y - b[k][2].y), 0);
    let legWorst = 0, armWorst = 0, worstAt = null;
    /* 一周あと（前半）か一周まえ（後半）。0.46〜0.5 は一周あとが歩きの外に出るので飛ばす。 */
    const t1s = [];
    for (let t = 0.02; t <= 0.46; t += 0.04) t1s.push(t);
    for (let t = 0.5; t <= 0.98; t += 0.04) t1s.push(t);
    t1s.forEach((t1) => {
      const a = P(t1);
      const [lo, hi] = t1 <= 0.46 ? [t1 + 0.2, 1] : [0, t1 - 0.2];
      let at = null, bd = Infinity;
      for (let t2 = lo; t2 <= hi; t2 += 0.0003) {
        const d = foot(a, P(t2));
        if (d < bd) { bd = d; at = t2; }
      }
      legWorst = Math.max(legWorst, bd);
      const h = hand(a, P(at));
      if (h > armWorst) { armWorst = h; worstAt = Math.round(t1 * 100); }
    });
    return { leg: Math.round(legWorst * 10) / 10, arm: Math.round(armWorst * 10) / 10, worstAt };
  });
  c.check("腕と脚は同じ拍、はじめからおわりまで：脚が一周して同じ形に戻ると、腕も同じ形（手の違いが元の絵の単位で 6 以内）",
    lock.leg < 3 && lock.arm < 6, JSON.stringify(lock));

  /* ---- 歩いている途中にもう一度押しても、頭からやり直さない ---- */
  await page.click('.tab[data-tab="archive"]');
  await page.waitForTimeout(500);
  log = await sample(2900, async () => {
    await page.click('.tab[data-tab="todo"]');
    await page.waitForTimeout(700);
    await page.click('.tab[data-tab="todo"]');
  });
  F = log.frames;
  const first = log.clicks[log.clicks.length - 2];
  sp = span(F);
  const tookAgain = sp && sp.back != null ? sp.back - first : null;
  c.check("途中でもう一度押しても、止まった形へ跳ばずに、はじめの押しから 2.0s で止まる",
    sp != null && tookAgain != null && tookAgain >= 1800 && tookAgain <= 2400 && isStill(F[F.length - 1]),
    JSON.stringify({ sp, first, tookAgain }));

  /* ---- 戻ってきたら歩く ---- */
  log = await sample(2600, () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))));
  F = log.frames;
  sp = span(F);
  c.check("戻ってきたら（visibilitychange）歩いて、止まった形で止まる",
    sp != null && isStill(F[F.length - 1]), JSON.stringify(sp));

  /* ---- 動きを減らす設定では歩かない ---- */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.click('.tab[data-tab="archive"]');
  await page.waitForTimeout(500);
  log = await sample(1200, () => page.click('.tab[data-tab="todo"]'));
  F = log.frames;
  c.check("動きを減らす設定では歩かない（どのフレームも止まった形）",
    F.length > 10 && F.every(isStill), `${F.filter((r) => !isStill(r)).length} / ${F.length}`);
  log = await sample(800, () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))));
  c.check("動きを減らす設定では、戻ってきても歩かない", log.frames.every(isStill));

  c.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
