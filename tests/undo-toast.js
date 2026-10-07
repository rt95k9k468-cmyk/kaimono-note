/* 「戻す」を揃える（docs/roadmap-2.0.md の V18・docs/look.md の「元に戻す」）。
   - 押せるものが付くトーストは既定で 5 秒（無いものは 3.6 秒のまま）
   - 戻すボタンの言葉は「元に戻す」だけ（js の中に label: "戻す" が無い）
   - 消す言葉は「消しました」（「削除しました」のトーストが無い）
   - daily の記録・体重・食事・お酒・衝動・運動を消すと、同じものが同じ場所へ戻る関数が返る
     （二度押しても増えない）
   - daily の記録を画面から消す → 「消しました」と「元に戻す」→ 押すと戻る
   - 記録はもとどおり（試しに足して消したものだけ）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/undo-toast.js */
const fs = require("fs");
const path = require("path");
const { open, checker } = require("./lib");

(async () => {
  const t = checker("undo-toast");

  /* ---- 言葉（ソースを読む） ---- */
  const dir = path.join(__dirname, "..", "js");
  const src = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "relay-code.js")
    .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]);
  const bare = src.filter(([, s]) => /label: "戻す"/.test(s)).map(([f]) => f);
  t.check("戻すボタンの言葉は「元に戻す」", !bare.length, bare.join(","));
  const del = src.filter(([, s]) => /toast\([^)]*削除しました/.test(s)).map(([f]) => f);
  t.check("消したトーストは「消しました」", !del.length, del.join(","));

  const { browser, page, errors } = await open();

  /* ---- 長さ ---- */
  const life = (withAct) => page.evaluate(async (w) => {
    KN.ui.toast("試し", w ? { action: { label: "元に戻す", onClick() {} } } : {});
    const at = (ms) => new Promise((r) => setTimeout(() => r(!!document.querySelector(".toast:not(.is-out)")), ms));
    return [await at(3300), await at(1400)];   // 3.3 秒・4.7 秒
  }, withAct);
  const plain = await life(false);
  const act = await life(true);
  t.check("押せるものが無いトーストは 3.6 秒", plain[0] && !plain[1], JSON.stringify(plain));
  t.check("「元に戻す」が付くトーストは 5 秒", act[0] && act[1], JSON.stringify(act));

  /* ---- 消して戻す（store） ---- */
  const before = await page.evaluate(() => JSON.stringify(KN.store.get()));
  const back = await page.evaluate(() => {
    const S = KN.store;
    const day = KN.util.todayKey();
    const pick = {
      entries: (s) => s.archive.entries, weights: (s) => s.diet.weights, meals: (s) => s.diet.meals,
      drinks: (s) => s.diet.drinks, urges: (s) => s.diet.urges, health: (s) => s.diet.health,
    };
    S.addEntry({ type: "done", day, title: "V18 記録" });
    S.addWeight({ day, time: "07:00", kg: 60 });
    S.addMeal({ day, slot: "lunch", memo: "V18 食事" });
    S.addDrink({ day, time: "20:00", kind: "beer", volumeMl: 350 });
    S.addUrge({ day, time: "15:00", before: 3 });
    S.update((s) => { s.diet.health.push({ id: "v18-h", day, type: "workout", value: 30 }); });
    const rm = { entries: "removeEntry", weights: "removeWeight", meals: "removeMeal",
      drinks: "removeDrink", urges: "removeUrge", health: "removeHealth" };
    const out = {};
    for (const k of Object.keys(rm)) {
      const list = pick[k](S.get());
      if (!list.length) { out[k] = "空"; continue; }
      const at = list.length - 1;
      const was = JSON.stringify(list[at]);
      const id = list[at].id;
      const undo = S[rm[k]](id);
      const goneNow = !pick[k](S.get()).some((x) => x.id === id);
      undo(); undo();
      const now = pick[k](S.get());
      out[k] = goneNow && now.filter((x) => x.id === id).length === 1 && JSON.stringify(now[at]) === was;
      S[rm[k]](id);   // 後片づけ
    }
    return out;
  });
  t.check("消すと戻す関数が返り、同じものが同じ場所へ一つだけ戻る", Object.values(back).every((v) => v === true), JSON.stringify(back));

  /* ---- daily の記録を画面から消して戻す ---- */
  const id = await page.evaluate(() => {
    KN.store.addEntry({ type: "done", day: KN.util.todayKey(), title: "V18 画面" });
    const l = KN.store.get().archive.entries;
    return l[l.length - 1].id;
  });
  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(800);
  const row = page.locator(`[data-id="${id}"]`).first();
  if (await row.count()) {
    await row.click();
    await page.waitForSelector(".sheet.is-open .js-del", { timeout: 3000 });
    await page.click(".sheet.is-open .js-del");
    await page.waitForTimeout(400);
    await page.click(`[aria-label="この記録を消しますか？"] .js-ok`);
    await page.waitForSelector(".toast .toast-action");
    const msg = await page.$eval(".toast", (e) => e.textContent.replace(/\s+/g, ""));
    const goneUi = await page.evaluate((i) => !KN.store.get().archive.entries.some((x) => x.id === i), id);
    t.check("daily の記録を消すと「消しました」「元に戻す」", goneUi && /消しました/.test(msg) && /元に戻す/.test(msg), msg);
    await page.click(".toast .toast-action");
    await page.waitForTimeout(300);
    t.check("「元に戻す」で記録が戻る", await page.evaluate((i) => KN.store.get().archive.entries.some((x) => x.id === i), id));
  } else {
    t.check("daily の記録の行が見つかる", false, id);
  }
  await page.evaluate((i) => KN.store.removeEntry(i), id);

  const after = await page.evaluate(() => JSON.stringify(KN.store.get()));
  const strip = (x) => { const o = JSON.parse(x || "{}"); delete o.savedAt; return o; };
  const a = strip(before), b = strip(after);
  t.check("記録はもとどおり（足して消したものだけ）",
    ["entries"].every((k) => JSON.stringify(a.archive && a.archive[k]) === JSON.stringify(b.archive && b.archive[k]))
    && ["weights", "meals", "drinks", "urges", "health"].every((k) => JSON.stringify(a.diet && a.diet[k]) === JSON.stringify(b.diet && b.diet[k])));
  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
