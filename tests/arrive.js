/* 開いたとき満ちる・押した席の絵が応える（2026年9月29日、docs/motion.md の
   「開いたとき、満ちる」、docs/tabbar.md の「押した席の絵が応える」。R4・11月11日に輪を7日の棒へ）。
   時計を 21:00 に止め、今日のからだと体重を入れて：
   - health の席を押すと、画面に is-m-arrive が付き、席の絵（heart）が二拍打つ
   - 四つの札のその日の棒は下から伸びる（scale。0 から、縮まず、終われば本当の背）
   - 体重の線は、被せた紙色の幕が右へ退いて描かれる（scale 1 → 0）。今日の点は弾んで出る
   - 終われば is-m-arrive は外れ、そのあと組み直しても棒も幕も動かない
   - 食事の帯は入れものごと左から伸び、区分はいつも最後の比率のまま
   - 買うもの（cart。価格を出す一押しでも）・歯車にも、それぞれの応え
   - 動きを減らす設定では、どちらも付けない */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";
const AT = new Date(2026, 8, 29, 21, 0);
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

/* ほかのタブへ出て、もう一度からだに入る。rec は入る直前に。 */
const enterWith = async (page, rec) => {
  if (await page.evaluate(() => KN.app.activeScreen() !== "diet")) {
    await page.click('.tab[data-tab="diet"]');
    await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });
  }
  await page.click('.tab[data-tab="todo"]');
  await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });
  if (rec) await page.evaluate(rec);
  await page.click('.tab[data-tab="diet"]');
};

/* 四つの札のその日の棒（いまの背・本当の背）と、推移の幕（残っている幅の割合）。 */
const readBars = (page) => page.evaluate(() => {
  const d = document.querySelector("#screen-diet .js-day-card");
  const wipe = d && d.querySelector(".diet-plot-chart .hl-wipe");
  return {
    bars: d ? [...d.querySelectorAll(".hl-met .hl-bars i.is-now")].map((b) => ({ h: b.getBoundingClientRect().height,
      full: b.offsetHeight * parseFloat(getComputedStyle(b).getPropertyValue("--h")), anim: b.getAnimations().length })) : [],
    wipe: wipe ? wipe.getBoundingClientRect().width / wipe.offsetWidth : null,
  };
});

(async () => {
  {
    const { browser, page, errors } = await open({
      before: async (cx, p) => { await p.clock.setFixedTime(AT); },
    });
    await seed(page);

    /* まず別の席へ（health から始まっていても、入り直すため）。 */
    await page.click('.tab[data-tab="todo"]');
    await page.waitForFunction(() => KN.app.activeScreen() === "todo");
    await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });

    /* 押した一拍から、毎フレーム記録する（ページの中の rAF で。外から覗くと間が飛ぶ）。 */
    await page.clock.pauseAt(AT);
    const stamp = await page.evaluate(() => performance.now());
    await page.evaluate(() => {
      window.__rec = [];
      /* is-m-arrive が外れた時刻（同じページの時計で）。 */
      window.__off = null;
      const scr = document.getElementById("screen-diet");
      let seen = false;
      new MutationObserver((ms, mo) => {
        if (scr.classList.contains("is-m-arrive")) seen = true;
        else if (seen) { window.__off = performance.now(); mo.disconnect(); }
      }).observe(scr, { attributes: true, attributeFilter: ["class"] });
      const t0 = performance.now();
      const tick = () => {
        const d = document.querySelector("#screen-diet .js-day-card");
        const wipe = d && d.querySelector(".diet-plot-chart .hl-wipe");
        window.__rec.push({ at: performance.now() - t0,
          bars: d ? [...d.querySelectorAll(".hl-met .hl-bars i.is-now")].map((b) => ({ h: b.getBoundingClientRect().height,
            full: b.offsetHeight * parseFloat(getComputedStyle(b).getPropertyValue("--h")) })) : [],
          wipe: wipe ? wipe.getBoundingClientRect().width / wipe.offsetWidth : null });
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
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

    await page.clock.runFor(3100);
    await page.clock.resume();
    await page.waitForFunction(() => !document.getElementById("screen-diet").classList.contains("is-m-arrive"),
      null, { timeout: 5000 });
    const took = (await page.evaluate(() => window.__off)) - stamp;
    const rec = await page.evaluate(() => window.__rec);
    const [fill, draw, stag] = await page.evaluate(() => ["--m-fill", "--m-draw", "--m-stagger"].map((k) => KN.motion.ms(k)));

    /* 棒ごとの道のり（歩数・総消費・睡眠。飲酒は夕方の記録が無ければ「—」で棒が無い）。 */
    const n = Math.min(...rec.filter((f) => f.bars.length).map((f) => f.bars.length));
    const series = Array.from({ length: n }, (_, i) => rec.filter((f) => f.bars[i]).map((f) => f.bars[i]));
    t.check("伸びる棒が三本以上・十分なフレーム", n >= 3 && rec.length > 30, `${n}本・${rec.length}フレーム`);
    /* 棒は CSS の動き（ページの時計では止まらない）。混んだ機械では最初のコマがもう少し進んでいる（全部回しで 8%）。 */
    t.check("はじめは 0 のあたり（伸びきった棒が先に見えない）",
      series.every((s) => s[0].h <= s[s.length - 1].full * 0.2 + 0.5), JSON.stringify(series.map((s) => [s[0].h, s[s.length - 1].full])));
    t.check("棒は縮まない（伸びていくだけ）", series.every((s) => s.every((f, i) => !i || f.h >= s[i - 1].h - 0.01)));
    t.check("終われば本当の背", series.every((s) => Math.abs(s[s.length - 1].h - s[s.length - 1].full) < 0.5),
      JSON.stringify(series.map((s) => s[s.length - 1])));
    const wipes = rec.map((f) => f.wipe).filter((x) => x != null);
    t.check("推移の幕は被ったところから右へ退き、終われば消える（scale 1 → 0）",
      wipes.length > 10 && wipes[0] > 0.9 && wipes.every((x, i) => !i || x <= wipes[i - 1] + 1e-3) && wipes[wipes.length - 1] < 0.01,
      JSON.stringify([wipes[0], wipes[wipes.length - 1]]));

    t.check("is-m-arrive は満ち終わると外れる（長さは --m-* から）",
      took >= Math.max(fill * 1.4, draw) && took < Math.max(fill * 1.4, draw) + stag * 4 + 1500, `${Math.round(took)}ms`);

    /* そのあと組み直しても動かない。 */
    await page.evaluate(() => KN.screens.diet.render());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const again = await readBars(page);
    t.check("開いたあとの組み直しでは棒も幕も動かない（すぐ本当の背・幕は無い）",
      again.bars.length >= 3 && again.bars.every((b) => !b.anim && Math.abs(b.h - b.full) < 0.5) && again.wipe < 0.01, JSON.stringify(again));

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
    await enterWith(page);
    /* 体重の線（途中）：幕が退いている途中・今日の点は弾んで出る。 */
    await page.waitForTimeout(150);
    const line = await page.evaluate(() => {
      const w = document.querySelector("#screen-diet .js-day-card .diet-plot-chart .hl-wipe");
      const now = document.querySelector("#screen-diet .diet-dot.is-now");
      if (!w) return null;
      return { left: w.getBoundingClientRect().width / w.offsetWidth, nowAnim: now ? getComputedStyle(now).animationName : "" };
    });
    t.check("体重の線は描かれている途中（幕が 0 と 1 のあいだ）", line && line.left > 0 && line.left < 1, JSON.stringify(line));
    t.check("今日の点は弾んで出る（arrive-pop）", line && line.nowAnim === "arrive-pop", JSON.stringify(line));

    await page.waitForFunction(() => !document.getElementById("screen-diet").classList.contains("is-m-arrive"),
      null, { timeout: 5000 });

    await browser.close();
  }

  /* 飲みすぎた日と、総消費を超えた日の食事の帯。 */
  {
    const { browser, page, errors } = await open({
      before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 21, 0)); },
    });
    await page.evaluate((day) => {
      KN.store.addDrink({ day, time: "19:00", kind: "beer", name: "ビール", ml: 500, count: 2, abv: 5, volumeMl: 1000, alcoholG: 40 });
      /* 今日の食事の帯（朝・昼・夜）。総消費が分かる日にする。 */
      KN.store.setHealth(day, "activeEnergy", 400);
      KN.store.setHealth(day, "restingEnergy", 1500);
      KN.store.addMeal({ day, time: "07:30", slot: "breakfast", items: [{ name: "パン", kcal: 400 }] });
      KN.store.addMeal({ day, time: "12:30", slot: "lunch", items: [{ name: "定食", kcal: 600 }] });
      KN.store.addMeal({ day, time: "19:30", slot: "dinner", items: [{ name: "煮物", kcal: 1200 }] });   // 総消費 1,900 を超える
    }, DAY);
    const over = await page.evaluate(() => { KN.app.showScreen("diet");
      const v = document.querySelector("#screen-diet .js-day-card .hl-met.js-drink .hl-met-v");
      return v ? { text: v.textContent, over: v.classList.contains("is-over") } : null; });
    t.check("目安を超えた日の飲酒は赤い字（g も出す）", over && over.over && /40g/.test(over.text), JSON.stringify(over));

    await enterWith(page, () => {
      window.__bar = [];
      const t0 = performance.now();
      const tick = () => {
        const segs = [...document.querySelectorAll("#screen-diet .js-day-card .hl-stack-fill > i")];
        const stack = document.querySelector("#screen-diet .js-day-card .hl-stack");
        if (segs.length) window.__bar.push({ at: performance.now() - t0,
          w: segs.map((e) => e.getBoundingClientRect().width), full: segs.map((e) => e.offsetWidth),
          ids: segs.map((e) => e.className), over: stack.classList.contains("is-over"),
          rim: getComputedStyle(stack).boxShadow });
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      };
      tick();
    });
    await page.waitForFunction(() => !document.getElementById("screen-diet").classList.contains("is-m-arrive"),
      null, { timeout: 6000 });
    await page.waitForTimeout(300);

    /* 今日の食事の帯：入れものごと左から伸び、朝・昼・夜はいつも最後の比率のまま一緒に伸びる。
       超えた日の赤い縁は、帯が端に着いてから。 */
    const bar = await page.evaluate(() => window.__bar || []);
    const lastBar = bar[bar.length - 1] || { ids: [], w: [], full: [] };
    t.check("帯は朝・昼・夜（と飲酒）", lastBar.ids.length >= 3 && /is-breakfast/.test(lastBar.ids[0])
      && /is-lunch/.test(lastBar.ids[1]) && /is-dinner/.test(lastBar.ids[2]), JSON.stringify(lastBar.ids));
    t.check("はじめは空（伸びる前）", bar.length > 10 && bar[0].w.every((w, i) => w <= bar[0].full[i] * 0.05),
      JSON.stringify(bar[0] && bar[0].w));
    const fullSum = lastBar.full.reduce((a, b) => a + b, 0);
    const growing = bar.filter((f) => { const x = f.w.reduce((a, b) => a + b, 0); return x > fullSum * 0.1 && x < fullSum * 0.9; });
    let ratioOff = 0, ratioAt = "";
    growing.forEach((f) => {
      const x = f.w.reduce((a, b) => a + b, 0);
      f.w.forEach((w, i) => {
        const want = lastBar.full[i] * x / fullSum;
        if (Math.abs(w - want) > 1) { ratioOff++; ratioAt = `${Math.round(f.at)}ms 区分${i}: ${w.toFixed(1)} / ${want.toFixed(1)}`; }
      });
    });
    t.check("伸びている途中も、区分はいつも最後の比率のまま（全部が一緒に伸びる）",
      growing.length >= 3 && ratioOff === 0, `${growing.length}フレーム中 ${ratioOff} ${ratioAt}`);
    const front = bar.map((f) => f.w.reduce((a, b) => a + b, 0));
    t.check("帯は減らない（伸びていくだけ）", front.every((x, i) => !i || x >= front[i - 1] - 0.01));
    const endAt = bar.find((f) => f.w.reduce((a, b) => a + b, 0) >= fullSum - 0.5);
    const fillMs = await page.evaluate(() => KN.motion.ms("--m-fill"));
    t.check("長さは棒と同じ --m-fill（それより長く伸び続けない）",
      endAt && endAt.at <= fillMs + 400, `${endAt && Math.round(endAt.at)}ms / ${fillMs}ms`);
    t.check("伸び終われば本当の幅", lastBar.w.every((w, i) => Math.abs(w - lastBar.full[i]) < 0.5),
      JSON.stringify([lastBar.w, lastBar.full]));
    /* 超えた日も、帯に縁は付けない（利用者が選んだ。超えたことは食事のカードの赤い「超過」が言う）。 */
    t.check("超えた日の帯（is-over）", lastBar.over, JSON.stringify(lastBar));
    t.check("超えた日も帯に縁は無い（伸びているあいだも、止まってからも）",
      bar.every((f) => !f.rim || f.rim === "none"), JSON.stringify(bar.map((f) => f.rim).filter((r) => r !== "none").slice(0, 2)));
    t.check("エラーなし（飲みすぎた日）", errors.length === 0, errors.join("\n"));
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
    /* ★の付け外しは長押し（持ち上げて、その場で離す。R5——行の左の★は外した）。 */
    const holdStill = async () => {
      const b = await page.locator("#screen-list .item .item-name").first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(await page.evaluate(() => KN.gesture.HOLD) + 120);
      await page.mouse.up();
    };
    await page.waitForSelector("#screen-list .item .item-name");
    await holdStill();
    await page.waitForFunction(() => document.querySelector('.tab[data-tab="list"] .tab-ico-face.is-poke'), null, { timeout: 1500 }).catch(() => {});
    const favPoke = await faceOf("list");
    t.check("★を付けると、帯のカートが応える", favPoke.on && favPoke.name === "poke-roll", JSON.stringify(favPoke));
    await settle();
    await holdStill();
    await page.waitForFunction(() => !KN.store.get().items[0].fav, null, { timeout: 1500 }).catch(() => {});
    t.check("★を外したときは黙る", !(await faceOf("list")).on && !(await page.evaluate(() => KN.store.get().items[0].fav)));

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
    const still = await readBars(page);
    t.check("動きを減らす設定でも棒は本当の背・幕は無い", still.bars.length >= 3 && still.bars.every((x) => Math.abs(x.h - x.full) < 0.5) && !(still.wipe > 0.01),
      JSON.stringify(still));
    t.check("エラーなし（動きを減らす）", errors.length === 0, errors.join("\n"));
    await browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
