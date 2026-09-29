/* 開いたとき満ちる・押した席の絵が応える（2026年9月29日、docs/motion.md の
   「開いたとき、満ちる」、docs/tabbar.md の「押した席の絵が応える」）。
   時計を 21:00 に止め、今日のからだと体重を入れて：
   - health の席を押すと、画面に is-m-arrive が付き、席の絵（heart）が二拍打つ
   - 輪は 0 から満ちていく（毎フレーム記録して、減らない）→ 終われば本当の値
   - **超えた日の輪は 100% で止まらない**（1 をまたぐ前後のフレームで速さが落ちない）
   - **真ん中の数は輪の位置どおり**（どのフレームでも round(数 × 進み具合)）で、
     途中の数がいくつも出る（最後に「パン」と出ない）。字（textContent）はずっと本当の数
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
    S.setHealth(day, "steps", 6750);           // 超える日（目標 5,000 なら 135%）
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

/* 輪のいま（周）と、本当の値（周）。 */
const readRings = (page) => page.evaluate(() => [...document.querySelectorAll("#screen-diet .diet-ring")].map((r) => {
  const mid = r.querySelector(".diet-ring-mid");
  return {
    cls: r.className, p: parseFloat(r.style.getPropertyValue("--ring-p")) || 0,
    target: parseFloat(r.dataset.p || r.style.getPropertyValue("--ring-p")) || 0,
    text: mid ? mid.textContent : "", show: mid ? mid.dataset.show : undefined,
  };
}));

(async () => {
  {
    const { browser, page, errors } = await open({
      before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 21, 0)); },
    });
    await seed(page);

    /* まず別の席へ（health から始まっていても、入り直すため）。 */
    await page.click('.tab[data-tab="todo"]');
    await page.waitForFunction(() => KN.app.activeScreen() === "todo");
    await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });

    /* 押した一拍から、毎フレーム記録する（ページの中の rAF で。外から覗くと間が飛ぶ）。 */
    const stamp = await page.evaluate(() => performance.now());
    await page.evaluate(() => {
      window.__rec = [];
      const t0 = performance.now();
      const tick = () => {
        const rows = [...document.querySelectorAll("#screen-diet .diet-ring")].map((r) => {
          const mid = r.querySelector(".diet-ring-mid");
          return { cls: r.className, p: parseFloat(r.style.getPropertyValue("--ring-p")) || 0,
                   target: parseFloat(r.dataset.p || "NaN"),
                   n: mid && mid.dataset.n != null ? Number(mid.dataset.n) : null,
                   show: mid ? mid.dataset.show : undefined, text: mid ? mid.textContent : "" };
        });
        window.__rec.push({ at: performance.now() - t0, rows });
        if (performance.now() - t0 < 2200) requestAnimationFrame(tick);
      };
      tick();
    });
    /* 押すのは本物の指で（帯は pointer を見ているので、el.click() では席を移らない）。 */
    await page.click('.tab[data-tab="diet"]');
    const early = await page.evaluate(() => {
      const scr = document.getElementById("screen-diet");
      const face = document.querySelector('.tab[data-tab="diet"] .tab-ico-face');
      return {
        arrive: scr.classList.contains("is-m-arrive"),
        poke: face.classList.contains("is-poke"),
        pokeName: getComputedStyle(face).animationName,
      };
    });
    t.check("health を押すと画面に is-m-arrive", early.arrive);
    t.check("health の絵（heart）は二拍打つ（poke-beat）", early.poke && early.pokeName === "poke-beat",
      JSON.stringify(early));

    /* 体重の線（途中）。 */
    await page.waitForTimeout(150);
    const line = await page.evaluate(() => {
      const p = document.querySelector("#screen-diet .diet-ma7");
      const now = document.querySelector("#screen-diet .diet-dot.is-now");
      if (!p) return null;
      const cs = getComputedStyle(p);
      return { len: p.getAttribute("pathLength"), off: parseFloat(cs.strokeDashoffset),
               nowAnim: now ? getComputedStyle(now).animationName : "" };
    });
    t.check("体重の線は引かれている途中（dashoffset が 0 と 1 のあいだ）",
      line && line.len === "1" && line.off > 0 && line.off < 1, JSON.stringify(line));
    t.check("今日の点は弾んで出る（arrive-pop）", line && line.nowAnim === "arrive-pop", JSON.stringify(line));

    await page.waitForFunction(() => !document.getElementById("screen-diet").classList.contains("is-m-arrive"),
      null, { timeout: 5000 });
    const took = (await page.evaluate(() => performance.now())) - stamp;
    const rec = await page.evaluate(() => window.__rec);
    const [fill, draw, stag] = await page.evaluate(() => ["--m-fill", "--m-draw", "--m-stagger"].map((k) => KN.motion.ms(k)));

    /* 輪ごとの道のり。 */
    const kinds = ["steps", "burned", "sleep", "drink"];
    const series = kinds.map((k) => rec.map((f) => f.rows.find((r) => r.cls.includes(`is-${k}`))).filter(Boolean));
    const live = series.filter((s) => s.length && !/is-none/.test(s[0].cls) && s[s.length - 1].target > 0.05);
    t.check("数の出る輪が三つ以上・十分なフレーム", live.length >= 3 && rec.length > 30,
      `${live.length}本・${rec.length}フレーム`);
    t.check("はじめは 0 のあたり（満ちた輪が先に見えない）",
      live.every((s) => s[0].p <= s[s.length - 1].target * 0.05), JSON.stringify(live.map((s) => [s[0].p, s[s.length - 1].target])));
    t.check("輪は減らない（満ちていくだけ）",
      live.every((s) => s.every((f, i) => !i || f.p >= s[i - 1].p - 1e-4)));
    const last = live.map((s) => s[s.length - 1]);
    t.check("終われば本当の値・数の重ねは消える",
      last.every((f) => Math.abs(f.p - f.target) < 1e-3 && f.show == null), JSON.stringify(last));

    /* 超えた日：1 をまたぐ前後で速さが落ちない。 */
    const steps = series[0];
    t.check("歩数は超えた日（is-over、1 周より先まで）", steps.length && /is-over/.test(steps[0].cls)
      && steps[steps.length - 1].target > 1.1, JSON.stringify(steps[steps.length - 1]));
    const k = steps.findIndex((f) => f.p >= 1);
    const vBefore = k > 1 ? (steps[k - 1].p - steps[k - 2].p) : 0;
    const vAfter = k > 0 && k + 1 < steps.length ? (steps[k + 1].p - steps[k].p) : 0;
    t.check("超えた日の輪は 100% で止まらない（またぐ前後で速さが続く）",
      k > 1 && vBefore > 0 && vAfter > vBefore * 0.6,
      `k=${k} 前 ${vBefore.toFixed(4)} 後 ${vAfter.toFixed(4)}`);
    const stall = steps.some((f, i) => i > 0 && f.p < f.target - 1e-3 && f.p > 0.9 && f.p < 1.1
      && Math.abs(f.p - steps[i - 1].p) < 1e-5);
    t.check("100% のあたりで同じ値に留まるフレームが無い", !stall);

    /* 数は輪の位置どおり・途中の数がいくつも出る・字は本当の数のまま。 */
    let off = 0, worst = "";
    live.forEach((s) => s.forEach((f) => {
      if (f.show == null || f.n == null) return;
      const want = Math.round(f.n * (f.p / f.target));
      if (Math.abs(parseInt(f.show, 10) - want) > 1) { off++; worst = `${f.cls}: ${f.show} / ${want}`; }
    }));
    t.check("真ん中の数は、どのフレームでも輪の位置どおり", off === 0, `${off}フレーム ${worst}`);
    /* 数が 20 以上の輪で見る（飲酒 0g の輪は、数えるものが無い）。 */
    const distinct = live.filter((s) => (s[s.length - 1].n || 0) >= 20)
      .map((s) => new Set(s.map((f) => f.show).filter((v) => v != null)).size);
    t.check("途中の数がいくつも出る（最後にパンと出ない）", distinct.length >= 2 && distinct.every((n) => n >= 8),
      JSON.stringify(distinct));
    const textOk = live.every((s) => s.every((f) => f.text === s[s.length - 1].text));
    t.check("数えているあいだも textContent は本当の数", textOk);

    /* 左から順に：半分まで来たのが、左の輪ほど早い。 */
    const halfAt = live.map((s) => {
      const i = s.findIndex((x) => x.p >= x.target * 0.5);
      return i < 0 ? Infinity : rec[i].at;
    });
    t.check("左から順に始まる（二つめ・三つめは一つめより遅れて半分に着く）",
      halfAt[1] >= halfAt[0] && halfAt[2] >= halfAt[1] - 20, JSON.stringify(halfAt.map(Math.round)));

    t.check("is-m-arrive は満ち終わると外れる（長さは --m-* から）",
      took >= Math.max(fill * 1.4, draw) && took < Math.max(fill * 1.4, draw) + stag * 4 + 1500, `${Math.round(took)}ms`);
    const offLine = await page.evaluate(() => getComputedStyle(document.querySelector("#screen-diet .diet-ma7")).strokeDasharray);
    t.check("終われば線はふつうの実線（破線の指定なし）", offLine === "none", offLine);

    /* そのあと組み直しても動かない。 */
    await page.evaluate(() => KN.screens.diet.render());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const again = await readRings(page);
    t.check("開いたあとの組み直しでは輪は動かない（すぐ本当の値・数の重ね無し）",
      again.every((r) => Math.abs(r.p - r.target) < 1e-3 && r.show == null), JSON.stringify(again));

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

  /* 画面の中の出来事に、帯の席が応える（★・買った → カート、済ませた → チェックリスト）。
     ✓は左から描かれる。空の絵は開いたとき咲く。 */
  {
    const { browser, page, errors } = await open({
      before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 10, 0)); },
    });
    const faceOf = (tab) => page.evaluate((tab) => {
      const f = document.querySelector(`.tab[data-tab="${tab}"] .tab-ico-face`);
      return { on: f.classList.contains("is-poke"), name: getComputedStyle(f).animationName };
    }, tab);
    const settle = () => page.waitForFunction(() => !document.querySelector(".tab-ico-face.is-poke, .screen.is-m-arrive"),
      null, { timeout: 5000 });

    /* 空の買うもの。 */
    await page.click('.tab[data-tab="todo"]');
    await settle();
    await page.click('.tab[data-tab="list"]');
    const empty = await page.evaluate(() => {
      const a = document.querySelector("#screen-list .empty-art");
      return a ? getComputedStyle(a).animationName : null;
    });
    t.check("空の絵は開いたとき咲く（empty-bloom）", empty === "empty-bloom", String(empty));
    await settle();

    await page.evaluate(() => {
      const p = KN.store.addProduct({ name: "牛乳" });
      KN.store.addItem(p.id || p);
    });
    await page.waitForSelector("#screen-list .item .fav");
    await page.click("#screen-list .item .fav");
    const favPoke = await faceOf("list");
    t.check("★を付けると、帯のカートが応える", favPoke.on && favPoke.name === "poke-roll", JSON.stringify(favPoke));
    await settle();
    await page.click("#screen-list .item .fav");
    t.check("★を外したときは黙る", !(await faceOf("list")).on);

    await page.click('#screen-list .item .check[aria-checked="false"]');
    const tick = await page.evaluate(() => {
      const c = document.querySelector("#screen-list .item .check");
      const svg = c && c.querySelector(":scope > svg");
      return { checked: c && c.getAttribute("aria-checked"),
               clipAnim: svg ? svg.getAnimations().some((a) => a.transitionProperty === "clip-path") : false };
    });
    t.check("買うと、丸はすぐ満ちて✓が左から描かれる（clip-path が動く）",
      tick.checked === "true" && tick.clipAnim, JSON.stringify(tick));
    await page.waitForFunction(() => document.querySelector('.tab[data-tab="list"] .tab-ico-face.is-poke'),
      null, { timeout: 3000 }).catch(() => {});
    const dropPoke = await faceOf("list");
    t.check("落ちていく行を、帯のカートが受け止める", dropPoke.on && dropPoke.name === "poke-roll", JSON.stringify(dropPoke));

    /* やること。 */
    await settle();
    await page.evaluate(() => KN.store.addTodo({ title: "手紙を出す", due: KN.util.todayKey() }));
    await page.click('.tab[data-tab="todo"]');
    await settle();
    const sel = '#screen-todo .check[aria-label^="手紙を出す"][aria-checked="false"]';
    await page.waitForSelector(sel);
    await page.click(sel);
    const todoPoke = await faceOf("todo");
    t.check("やることを済ませると、帯のチェックリストが跳ねる", todoPoke.on && todoPoke.name === "poke-hop",
      JSON.stringify(todoPoke));
    t.check("エラーなし（席が応える）", errors.length === 0, errors.join("\n"));
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
    t.check("動きを減らす設定でも輪は本当の値（数の重ね無し）", rings.every((x) => (Math.abs(x.p - x.target) < 1e-3 && x.show == null) || /is-none/.test(x.cls)),
      JSON.stringify(rings));
    t.check("エラーなし（動きを減らす）", errors.length === 0, errors.join("\n"));
    await browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
