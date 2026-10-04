/* お酒の紙の「よく飲むもの」の札と −/＋（2026年9月30日、docs/health.md の「よく飲むもの」）。

   - 札は固定の6つ（ビール・糖質ゼロ・焼酎・焼酎半分・ワイン・ワイン半分）。記録があっても増えない。
   - 並びは縦に同じ種類（ビール/糖質ゼロ、焼酎/焼酎半分、ワイン/ワイン半分）。札に絵がある。
   - 札を押すと一本、もう一度押すか ＋ で二本。− で 0 になれば行ごと消える。
   - 保存は今までと同じ一件の形。純アルコールは ml × 度数 ÷ 100 × 0.8。
   - raw を読み直すと同じ中身になる（「直す」の紙は raw を読み直すので）。
   - 糖質ゼロ・焼酎・ワインの量と純アルコール、raw の読み直し。既存の記録は変わらない。
   - 札も −/＋ も指の的は44px以上。横にはみ出さない。絵文字なし・例外なし。 */
const { open, checker } = require("./lib");

(async () => {
  const c = checker("drink-quick");
  const { browser, page, errors } = await open();

  const favs = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    const w = sh.getBoundingClientRect().right;
    return [...sh.querySelectorAll(".js-fav .chip")].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.textContent.trim().replace(/\s+/g, " "), on: b.getAttribute("aria-pressed") === "true", h: r.height, out: r.right > w,
        x: Math.round(r.left), y: Math.round(r.top), ico: !!b.querySelector("svg") };
    });
  });
  const tap = (label) => page.evaluate((l) => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    [...sh.querySelectorAll(".js-fav .chip")].find((b) => b.textContent.trim().replace(/\s+/g, " ") === l).click();
  }, label);
  const step = (i, cls) => page.evaluate(([i, cls]) => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    sh.querySelectorAll(".drink-pick")[i].querySelector(cls).click();
  }, [i, cls]);
  const picks = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return [...sh.querySelectorAll(".drink-pick")].map((r) => ({
      name: r.querySelector(".drink-pick-name").textContent.trim(),
      n: r.querySelector(".stepper-value").textContent.trim(),
      h: Math.min(...[...r.querySelectorAll(".stepper-btn")].map((b) => b.getBoundingClientRect().height)),
    }));
  });

  /* 既存の記録（書いて入れたもの）を一つ。中身が変わらないことを後で見る。 */
  const before = await page.evaluate(() => {
    const it = KN.drinks.parse("日本酒1合").items[0];
    const rec = KN.store.addDrink({ ...it, day: KN.util.shiftDay(KN.util.todayKey(), -3), raw: "日本酒1合" });
    return JSON.stringify(rec);
  });

  await page.evaluate(() => KN.app.showScreen("diet"));
  await page.waitForFunction(() => KN.app.activeScreen() === "diet" && document.querySelector("#screen-diet .diet-hero-value"));
  await page.evaluate(() => { KN.screens.diet.openDrinkSheet(KN.util.todayKey()); });
  await page.waitForTimeout(800);

  let f = await favs();
  c.check("札は6つ", f.length === 6, JSON.stringify(f.map((x) => x.label)));
  c.check("記録が一つあっても、固定の6つ（字は名前だけ）",
    JSON.stringify(f.map((x) => x.label)) === JSON.stringify(
      ["ビール", "糖質ゼロ", "焼酎", "焼酎 半分", "ワイン", "ワイン 半分"]),
    JSON.stringify(f.map((x) => x.label)));
  const at = (l) => f.find((x) => x.label === l);
  c.check("縦に同じ種類（同じ列に並び、上がふつう・下が別）",
    at("ビール").x === at("糖質ゼロ").x && at("ビール").y < at("糖質ゼロ").y
    && at("焼酎").x === at("焼酎 半分").x && at("焼酎").y < at("焼酎 半分").y
    && at("ワイン").x === at("ワイン 半分").x && at("ワイン").y < at("ワイン 半分").y
    && at("ビール").x < at("焼酎").x && at("焼酎").x < at("ワイン").x
    && at("ビール").y === at("焼酎").y && at("焼酎").y === at("ワイン").y, JSON.stringify(f));
  c.check("どの札にも絵がある", f.every((x) => x.ico), JSON.stringify(f));
  c.check("札の的は44px以上・はみ出さない", f.every((x) => x.h >= 44 && !x.out), JSON.stringify(f));

  await tap("ビール");
  await page.waitForTimeout(150);
  let p = await picks();
  c.check("押すと一本の行が出る", p.length === 1 && p[0].n === "1本", JSON.stringify(p));
  c.check("−/＋の的は44px以上", p.every((x) => x.h >= 44), JSON.stringify(p));
  await tap("ビール");
  await step(0, ".js-plus");
  await page.waitForTimeout(150);
  p = await picks();
  c.check("もう一度押す・＋ で三本", p[0].n === "3本", JSON.stringify(p));
  await step(0, ".js-minus");
  await tap("ワイン");
  await page.waitForTimeout(150);
  p = await picks();
  c.check("− で二本、ワインが増える", p.length === 2 && p[0].n === "2本" && p[1].n === "1本", JSON.stringify(p));
  f = await favs();
  c.check("選んだ札が点く", f.filter((x) => x.on).map((x) => x.label).join() === "ビール,ワイン", JSON.stringify(f));
  await step(1, ".js-minus");
  await page.waitForTimeout(150);
  p = await picks();
  c.check("0本で行ごと消える", p.length === 1, JSON.stringify(p));

  const read = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return sh.querySelector(".js-read").textContent.replace(/\s+/g, " ");
  });
  c.check("合計の行が字のまま出ない（タグが見えない）", !/<div|<span/.test(read), read);
  await tap("ワイン");
  await page.waitForTimeout(150);
  const read2 = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open")].pop()
    .querySelector(".js-read").textContent.replace(/\s+/g, " "));
  c.check("二種類なら合計の行（タグが見えない）", /合計 2種類/.test(read2) && !/<div|<span/.test(read2), read2);
  await step(1, ".js-minus");
  await page.waitForTimeout(150);
  c.check("読み下しが出る（350ml × 2本・約28g）", /350ml × 2本/.test(read) && /約28g/.test(read), read);

  await page.locator(".sheet.is-open .js-save").last().click();
  await page.waitForTimeout(700);
  const saved = await page.evaluate(() => KN.store.drinksOfDay(KN.util.todayKey()));
  const s0 = saved[0] || {};
  c.check("一件で保存・形は今までと同じ",
    saved.length === 1 && s0.kind === "beer" && s0.ml === 350 && s0.count === 2 && s0.unit === "本"
      && s0.volumeMl === 700 && s0.abv === 5 && s0.alcoholG === 28 && s0.kcal === 280 && s0.estimated === true,
    JSON.stringify(s0));
  const again = await page.evaluate((raw) => KN.drinks.parseOne(raw), s0.raw);
  c.check("raw を読み直すと同じ中身", !!again && again.alcoholG === s0.alcoholG && again.volumeMl === s0.volumeMl
    && again.kind === s0.kind && again.estimated === s0.estimated, `${s0.raw} → ${JSON.stringify(again)}`);

  /* 糖質ゼロ・焼酎・ワイン。書き直すと同じ量になる */
  const six = await page.evaluate(() => {
    const fv = KN.drinks.favorites(KN.store.get().diet.drinks);
    return fv.map((t) => {
      const one = KN.drinks.fromFavorite(t, 1);
      const back = KN.drinks.parseOne(one.raw);
      return { label: t.label, g: one.alcoholG, raw: one.raw, backG: back && back.alcoholG, backMl: back && back.volumeMl,
        backName: back && back.name, ml: one.volumeMl };
    });
  });
  const g = (l) => six.find((x) => x.label === l);
  c.check("純アルコール：ビール14g・糖質ゼロ14g・焼酎70ml 14g・半分7g・ワイン700ml 67.2g・半分33.6g",
    g("ビール").g === 14 && g("糖質ゼロ").g === 14 && g("焼酎").g === 14 && g("焼酎 半分").g === 7
    && g("ワイン").g === 67.2 && g("ワイン 半分").g === 33.6, JSON.stringify(six));
  c.check("どの札も raw を読み直して同じ量・同じ純アルコール",
    six.every((x) => x.backG === x.g && x.backMl === x.ml), JSON.stringify(six));
  c.check("糖質ゼロは名前が残る", g("糖質ゼロ").backName === "糖質ゼロ", JSON.stringify(g("糖質ゼロ")));

  const after = await page.evaluate((id) => JSON.stringify(KN.store.get().diet.drinks.find((d) => d.id === id)), JSON.parse(before).id);
  c.check("既存の記録は変わらない", after === before, `${before}\n${after}`);

  /* 直す紙は一件の話なので、札は出ない */
  await page.evaluate((id) => KN.screens.diet.openDrinkSheet(KN.util.todayKey(), id), s0.id);
  await page.waitForTimeout(700);
  const edit = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    return { fav: sh.querySelectorAll(".js-fav").length, q: sh.querySelector(".js-q").value };
  });
  c.check("直す紙には札が無く、欄に raw", edit.fav === 0 && edit.q === s0.raw, JSON.stringify(edit));

  c.check("絵文字なし", await page.evaluate(() => !/\p{Extended_Pictographic}/u.test(document.body.innerText)));
  c.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
