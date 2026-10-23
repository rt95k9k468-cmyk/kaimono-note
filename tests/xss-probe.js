/* 画面の中の守り（セキュリティ S2、2026年10月23日）。docs/dev.md「画面の中の守り」。門に入れる。

   控えや Dropbox から戻した記録は、どの欄にどんな字が入っていてもおかしくない。記録を一通り作って、
   字の欄（id・日付・時刻の印を除く）の後ろに「罠の字」（引用符で属性を閉じ、要素を差しこむ字）を足して
   読み直し、五つのタブと価格を描かせる。罠が要素や属性として化けていたら NG（どの画面のどこかを出す）。
   CSP（script-src 'self'）が書かれた字の実行は止めるが、1ファイル版には CSP が無く、要素の差しこみ自体も
   止めない。だから字はいつも escapeHtml を通す（html`` の差し込み・textContent）。 */
const { open, checker } = require("./lib");

const t = checker("xss-probe");
const MARK = "data-xss";
const BAIT = `"'><i ${MARK}="1"></i>&lt;`;
/* 罠を足さない欄：つながり（id）・日付・時刻・印の種類。ここが化けると画面が描けず、試験にならない。 */
const KEEP = /^(id|day|date|time|at|type|kind|slot|source|unit|tab|key|ver|version|v)$|Id$|At$|Ids$|Key$/;

let browser;
(async () => {
  const o = await open();
  browser = o.browser;
  const { page, errors } = o;

  await page.evaluate(() => {
    const S = KN.store, U = KN.util;
    const day = U.todayKey();
    const st = S.addStore("店", "#e6a23c");
    const p = S.addProduct({ name: "牛乳", amount: 1, unit: "本", note: "メモ" });
    S.addItem(p.id, { qty: 2, memo: "メモ" });
    if (st) S.addPrice(p.id, { storeId: st.id, price: 200, amount: 1, date: day });
    S.addTodo({ title: "用事", day });
    S.addWeight({ day, time: "07:00", kg: 60, memo: "メモ" });
    S.addMeal({ day, time: "12:00", slot: "lunch", items: [{ name: "定食", kcal: 600 }], memo: "メモ" });
    S.addDrink({ day, time: "19:00", kind: "beer", name: "ビール", ml: 350, count: 1, abv: 5, volumeMl: 350, alcoholG: 14 });
    S.addUrge({ day, kind: "snack", note: "メモ" });
    S.setDayMemo(day, "メモ");
    if (KN.healthSync) KN.healthSync.importText(`day: ${day}\nsteps: 5000\nworkout: 散歩,30,120`);
    S.saveNow();
  });
  await page.waitForTimeout(300);

  /* 字の欄に罠を足して書き戻し、読み直す（立ち上げを待ってから。tests/README.md の罠）。 */
  const baited = await page.evaluate(({ BAIT, KEEP }) => {
    const re = new RegExp(KEEP);
    let n = 0;
    const walk = (v, k) => {
      if (typeof v === "string") { if (k != null && !re.test(k) && v) { n++; return v + BAIT; } return v; }
      if (Array.isArray(v)) return v.map((x) => walk(x, k));
      if (v && typeof v === "object") { for (const key of Object.keys(v)) v[key] = walk(v[key], key); }
      return v;
    };
    const s = JSON.parse(localStorage.getItem("kaimono-note-v2"));
    ["categories", "stores", "products", "items", "sets", "todos", "diet", "archive"]
      .forEach((k) => { if (s[k]) s[k] = walk(s[k], null); });
    localStorage.setItem("kaimono-note-v2", JSON.stringify(s));
    return n;
  }, { BAIT, KEEP: KEEP.source });
  t.check("罠を足した欄がある", baited >= 10, `数：${baited}`);
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && document.querySelector(".tab"));
  await page.waitForTimeout(300);

  const leaks = () => page.evaluate((MARK) => [...document.querySelectorAll(`[${MARK}]`)].map((el) => {
    const host = el.closest("[class]");
    return host ? `${host.tagName.toLowerCase()}.${String(host.className.baseVal ?? host.className).trim().split(/\s+/).slice(0, 2).join(".")}` : el.parentNode?.nodeName;
  }), MARK);

  for (const tab of ["archive", "notes", "todo", "list", "diet"]) {
    await page.click(`.tab[data-tab="${tab}"]`);
    await page.waitForTimeout(500);
    const got = await leaks();
    t.check(`${tab}：罠の字が要素にならない`, !got.length, [...new Set(got)].join(" / "));
  }
  /* 価格の紙（買うものの紙の後ろ）。 */
  await page.evaluate(() => KN.app.showScreen("prices"));
  await page.waitForTimeout(500);
  let got = await leaks();
  t.check("prices：罠の字が要素にならない", !got.length, [...new Set(got)].join(" / "));
  /* 紙も一枚ずつ（品物の紙・からだの一日の紙）。 */
  for (const [name, tab, sel] of [["品物の紙", "list", ".item .item-name:visible"], ["からだの紙", "diet", ".diet-cell.js-cell:visible"]]) {
    await page.click(`.tab[data-tab="${tab}"]`);
    await page.waitForTimeout(500);
    await page.click(sel, { timeout: 5000 });
    const opened = await page.waitForSelector(".sheet", { timeout: 3000 }).then(() => true, () => false);
    await page.waitForTimeout(400);
    got = await leaks();
    t.check(`${name}：開いて、罠の字が要素にならない`, opened && !got.length, opened ? [...new Set(got)].join(" / ") : "紙が開かない");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet"), null, { timeout: 3000 }).catch(() => {});
  }
  /* 字はそのまま字として見える（消して守ったのではない）。 */
  t.check("罠の字が字として出ている", await page.evaluate(() => document.body.textContent.includes(`<i data-xss="1"></i>`)));
  t.check("頁の例外が無い", !errors.length, errors.slice(0, 3).join(" / "));

  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exitCode = 1; if (browser) browser.close(); });
