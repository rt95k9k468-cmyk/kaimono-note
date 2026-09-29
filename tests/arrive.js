/* 開いたとき満ちる・押した席の絵が応える（2026年9月29日、docs/motion.md の
   「開いたとき、満ちる」、docs/tabbar.md の「押した席の絵が応える」）。
   時計を 21:00 に止め、今日のからだと体重を入れて：
   - health の席を押すと、画面に is-m-arrive が付き、席の絵（heart）が二拍打つ
   - 輪は 0 から満ちていく（途中の角度が本当の角度より小さい）→ 終われば本当の角度
   - 超えた日の輪は一周ぶん（--lap）から満ちる
   - 真ん中の数は counter が数え上げ、字（textContent）は途中もずっと本当の数
   - 四つは左から順に始まる（--m-stagger ずつの遅れ）
   - 体重の線は左から引かれ（stroke-dashoffset 1 → 0）、今日の点は弾んで出る
   - 終われば is-m-arrive は外れ、そのあと組み直しても輪は動かない
   - 買うもの（cart。価格を出す一押しでも）・歯車にも、それぞれの応え
   - 動きを減らす設定では、どちらも付けない */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";
const t = checker("arrive");

const seed = async (page) => {
  await page.evaluate((day) => {
    const S = KN.store;
    S.setHealth(day, "steps", 50000);          // 超える日
    S.setHealth(day, "sleep", 240);            // 満ちきらない日
    S.setHealth(day, "activeEnergy", 300);
    S.setHealth(day, "restingEnergy", 1400);
    for (let i = 20; i >= 0; i--) {
      const d = new Date(2026, 8, 29 - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      S.addWeight({ day: key, kg: 62 + Math.sin(i / 3) * 0.6 });
    }
  }, DAY);
};

/* 輪の角度（登録してあるので、計算済みの値は "123.4deg" の形で返る）。 */
const readRings = (page) => page.evaluate(() => [...document.querySelectorAll("#screen-diet .diet-ring")].map((r) => {
  const cs = getComputedStyle(r);
  const mid = r.querySelector(".diet-ring-mid");
  return {
    cls: r.className, deg: parseFloat(cs.getPropertyValue("--deg")) || 0,
    lap: parseFloat(cs.getPropertyValue("--lap")),
    target: parseFloat(r.style.getPropertyValue("--deg")) || 0,
    text: mid ? mid.textContent : "", unit: mid ? mid.dataset.u || "" : "",
    after: mid ? getComputedStyle(mid, "::after").content : "",
    anims: r.getAnimations().length,
  };
}));

(async () => {
  {
    const { browser, page, errors } = await open({
      before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 21, 0)); },
    });
    await seed(page);
    t.check("@property が使える（試験のブラウザ）", await page.evaluate(() => !!(CSS && CSS.registerProperty)));

    /* まず別の席へ（health から始まっていても、入り直すため）。 */
    await page.click('.tab[data-tab="todo"]');
    await page.waitForFunction(() => KN.app.activeScreen() === "todo");
    await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });

    const stamp = await page.evaluate(() => performance.now());
    await page.click('.tab[data-tab="diet"]');
    const early = await page.evaluate(() => {
      const scr = document.getElementById("screen-diet");
      const face = document.querySelector('.tab[data-tab="diet"] .tab-ico-face');
      return {
        arrive: scr.classList.contains("is-m-arrive"),
        poke: face.classList.contains("is-poke"),
        pokeName: getComputedStyle(face).animationName,
        sig: face.dataset.sig,
      };
    });
    t.check("health を押すと画面に is-m-arrive", early.arrive);
    t.check("health の絵（heart）は二拍打つ（poke-beat）", early.poke && early.pokeName === "poke-beat",
      JSON.stringify(early));

    /* 途中を見る：輪は本当の角度より小さく、字は本当の数のまま。 */
    await page.waitForTimeout(120);
    const mid = await readRings(page);
    const texts0 = mid.map((r) => r.text);
    const withTarget = mid.filter((r) => !/is-none/.test(r.cls) && r.target > 20);
    t.check("輪が四つ・数の出る輪がある", mid.length === 4 && withTarget.length >= 2, JSON.stringify(mid));
    t.check("途中の輪は本当の角度より小さい（0 から満ちていく）",
      withTarget.every((r) => r.deg < r.target - 1 || (/is-over/.test(r.cls) && r.lap < 359)),
      JSON.stringify(withTarget.map((r) => [r.cls, r.deg, r.target, r.lap])));
    const over = mid.find((r) => /is-steps/.test(r.cls));
    t.check("超えた日の輪は一周ぶん（--lap）から満ちる", over && /is-over/.test(over.cls) && over.lap < 359,
      JSON.stringify(over));
    t.check("数は counter が数え上げる（::after に counter）",
      mid.filter((r) => r.unit).every((r) => /counter/.test(r.after) || /^"\d+[%g]"$/.test(r.after)),
      JSON.stringify(mid.map((r) => r.after)));
    const sleep = mid.find((r) => /is-sleep/.test(r.cls));
    const burn = mid.find((r) => /is-burned/.test(r.cls));
    t.check("左から順に始まる（二つめは三つめより先に進んでいる）",
      burn && sleep && burn.deg / burn.target >= sleep.deg / sleep.target,
      JSON.stringify([burn, sleep].map((r) => r && [r.deg, r.target])));

    /* 体重の線。 */
    const line = await page.evaluate(() => {
      const p = document.querySelector("#screen-diet .diet-ma7");
      const now = document.querySelector("#screen-diet .diet-dot.is-now");
      if (!p) return null;
      const cs = getComputedStyle(p);
      return { len: p.getAttribute("pathLength"), dash: cs.strokeDasharray,
               off: parseFloat(cs.strokeDashoffset), nowAnim: now ? getComputedStyle(now).animationName : "" };
    });
    t.check("体重の線は引かれている途中（dashoffset が 0 と 1 のあいだ）",
      line && line.len === "1" && line.off > 0 && line.off < 1, JSON.stringify(line));
    t.check("今日の点は弾んで出る（arrive-pop）", line && line.nowAnim === "arrive-pop", JSON.stringify(line));

    /* 字はずっと本当の数（途中を何度か見る）。終わりを待つのは印（class が外れる）で。 */
    let textsStable = true;
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(90);
      const r = await readRings(page);
      if (r.map((x) => x.text).join("|") !== texts0.join("|")) textsStable = false;
    }
    t.check("数えているあいだも textContent は本当の数", textsStable);
    await page.waitForFunction(() => !document.getElementById("screen-diet").classList.contains("is-m-arrive"),
      null, { timeout: 5000 });
    const took = (await page.evaluate(() => performance.now())) - stamp;
    const [fill, draw, stag] = await page.evaluate(() => ["--m-fill", "--m-draw", "--m-stagger"].map((k) => KN.motion.ms(k)));
    t.check("is-m-arrive は満ち終わると外れる（長さは --m-* から）",
      took >= Math.max(fill * 1.4, draw) && took < Math.max(fill * 1.4, draw) + stag * 4 + 1500, `${Math.round(took)}ms`);
    const after = await readRings(page);
    t.check("終われば本当の角度", after.every((r) => Math.abs(r.deg - r.target) < 0.5 || /is-none/.test(r.cls)),
      JSON.stringify(after.map((r) => [r.deg, r.target])));
    t.check("終われば数の重ねは消える", after.every((r) => r.after === "none" || r.after === "normal"),
      JSON.stringify(after.map((r) => r.after)));
    const off = await page.evaluate(() => getComputedStyle(document.querySelector("#screen-diet .diet-ma7")).strokeDasharray);
    t.check("終われば線はふつうの実線（破線の指定なし）", off === "none", off);

    /* そのあと組み直しても動かない。 */
    await page.evaluate(() => KN.screens.diet.render());
    const again = await readRings(page);
    t.check("開いたあとの組み直しでは輪は動かない", again.every((r) => r.anims === 0),
      JSON.stringify(again.map((r) => r.anims)));

    /* 買うもの → cart、もう一度で価格 → tag。 */
    await page.click('.tab[data-tab="list"]');
    const cart = await page.evaluate(() => {
      const f = document.querySelector('.tab[data-tab="list"] .tab-ico-face');
      return { on: f.classList.contains("is-poke"), name: getComputedStyle(f).animationName, sig: f.dataset.sig };
    });
    t.check("買うものの絵（cart）は押し出される（poke-roll）", cart.on && cart.name === "poke-roll", JSON.stringify(cart));
    await page.waitForFunction(() => KN.app.activeScreen() === "list");
    await page.waitForFunction(() => !document.querySelector(".tab-ico-face.is-poke"), null, { timeout: 3000 });
    await page.click('.tab[data-tab="list"]');
    const again2 = await page.evaluate(() => {
      const f = document.querySelector('.tab[data-tab="list"] .tab-ico-face');
      return { on: f.classList.contains("is-poke"), name: getComputedStyle(f).animationName, sig: f.dataset.sig };
    });
    t.check("価格を出す一押しでも、席の絵（cart のまま）が応える",
      again2.sig === "cart" && again2.on && again2.name === "poke-roll", JSON.stringify(again2));

    /* 数の札：出てきたときだけ膨らむ。数が変わった持ち上げ（is-m-number）を外しても、
       膨らみ直さない。 */
    const badge = await page.evaluate(async () => {
      const tab = document.querySelector('.tab[data-tab="archive"]');
      const b = document.createElement("span");
      b.className = "tab-badge";
      b.textContent = "3";
      tab.append(b);
      const born = b.getAnimations().map((a) => a.animationName);
      await Promise.all(b.getAnimations().map((a) => a.finished));
      await KN.motion.fire("number", b);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const running = b.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName);
      b.remove();
      return { born, running };
    });
    t.check("数の札は、出てきたとき膨らむ（badge-in）", badge.born.includes("badge-in"), JSON.stringify(badge));
    t.check("数が変わったあと、札は膨らみ直さない", badge.running.length === 0, JSON.stringify(badge));

    /* 歯車。 */
    await page.click('.tab[data-tab="todo"]');
    await page.waitForFunction(() => KN.app.activeScreen() === "todo");
    const gear = await page.evaluate(() => {
      const b = document.querySelector(".head-gear:not([hidden])");
      if (!b || !b.offsetParent) return null;
      b.click();
      return { on: b.classList.contains("is-poke"), name: getComputedStyle(b.querySelector("svg")).animationName };
    });
    t.check("歯車は半周まわる（poke-spin）", gear && gear.on && gear.name === "poke-spin", JSON.stringify(gear));
    await page.waitForFunction(() => KN.app.activeScreen() === "settings");
    t.check("歯車で設定が開く", true);

    t.check("エラーなし", errors.length === 0, errors.join("\n"));
    await browser.close();
  }

  /* 動きを減らす設定。 */
  {
    const { browser, page, errors } = await open({
      before: async (cx, p) => {
        await p.emulateMedia({ reducedMotion: "reduce" });
        await p.clock.setFixedTime(new Date(2026, 8, 29, 21, 0));
      },
    });
    await seed(page);
    await page.click('.tab[data-tab="todo"]');
    await page.waitForFunction(() => KN.app.activeScreen() === "todo");
    await page.click('.tab[data-tab="diet"]');
    const r = await page.evaluate(() => ({
      arrive: document.getElementById("screen-diet").classList.contains("is-m-arrive"),
      poke: document.querySelector('.tab[data-tab="diet"] .tab-ico-face').classList.contains("is-poke"),
    }));
    t.check("動きを減らす設定では満ちない・応えない", !r.arrive && !r.poke, JSON.stringify(r));
    const rings = await readRings(page);
    t.check("動きを減らす設定でも輪は本当の角度", rings.every((x) => Math.abs(x.deg - x.target) < 0.5 || /is-none/.test(x.cls)));
    t.check("エラーなし（動きを減らす）", errors.length === 0, errors.join("\n"));
    await browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
