/* 道の人が歩く（2026年9月29日、docs/todo-timeline.md の「一日の道」の「歩く」）。
   時計を 7:43 に止め、道に人が立つ今日で：
   - 起動してやることが出たら歩き、止まった形（ME_PARTS の字のまま）で止まる
   - 別のタブからやることへ入ると、また歩く：脚も腕も動き、縁（halo）は絵と同じ形で動く
   - 足は地面より下へ行かない・膝は前へ曲がる・体は浮くだけ（沈まない）
   - 最初と最後の一歩は腕を止める（止まった形は「手前の脚と手前の腕が両方前」）
   - 腕はちゃんと振れる（奥の手が前へ 150 以上）
   - 長さは --m-walk から（四歩と速さの台形で 2.0s）
   - 歩いている途中にもう一度タブを押しても、頭からやり直さない（止まった形へ跳ばない）
   - 戻ってきたら（visibilitychange）歩く
   - 動きを減らす設定では歩かない */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";
/* 止まった形。利用者が選んだ絵（day-road.js の ME_PARTS）。 */
const STILL = {
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
  const handX = Math.max(...F.map((r) => pts(r.armB)[2].x));
  c.check("腕はちゃんと振れる：奥の手が前へ 150 以上", handX - 338 > 150, String(handX));
  c.check("最初の一歩は腕を振らない（脚が動き出してから 250ms は、肩から手への向きがそのまま）",
    legs && arms && arms.from - legs.from >= 250, JSON.stringify({ legs, arms }));
  c.check("最後の一歩も腕を振らない（腕の向きが止まった形へ戻ってから 250ms 脚が歩く）",
    legs && arms && legs.last - arms.last >= 250, JSON.stringify({ legs, arms }));
  const k = await page.evaluate(() => KN.motion.ms("--m-walk"));
  const took = sp && sp.back != null ? sp.back - click : null;
  c.check("長さは --m-walk から：四歩と速さの台形で 2.0s（1.8〜2.4s で止まった形へ）",
    k === 400 && took != null && took >= 1800 && took <= 2400, JSON.stringify({ k, took }));
  c.check("止まった形とぴったり同じで止まる", isStill(F[F.length - 1]), JSON.stringify(F[F.length - 1]));

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
