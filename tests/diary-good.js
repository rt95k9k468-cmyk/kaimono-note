/* よかったこと（docs/thinking.md）。
   - 書く紙の帯に「よかったこと」の札（構3）。押すとその一件に印、押し直せば外れる（書く前でも後でも。カーソルは欄のまま）
   - 中身の頭に見えない印 U+2063 だけ——本文に「よかった」の字は書かない
   - 頁の行は is-good（温かい地・時刻の前に陽の絵）。印は見せない
   - 一件ずつ重ならない。札を押して書いた字を空にすれば黙って外れる
   - 直す紙は印を欄に見せず、直しても印は残る
   - コピー・書き出し（月・期間）・ノートへ移すの字にだけ「よかった：」。記録は変わらない
   日記の本文は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-good.js */
const path = require("path");
const { open, checker } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "diary-posts.js"));
const P = global.KN.diaryPosts;

const t = checker("diary-good");
const W = P.TAG, G = P.GOOD;
const AT = new Date(2026, 9, 6, 12, 34);

/* ---- 文字だけ ---- */
{
  t.check("印は見えない字・NFKC でも trim でも落ちない", G === "⁣" && `${G}字`.normalize("NFKC") === `${G}字` && `${G}字 `.trim() === `${G}字`);
  t.check("見分け・印を外す", P.isGood(`${G}よい`) && !P.isGood("よい") && P.bare(`${G}よい`) === "よい" && P.bare("ふつう") === "ふつう");
  const memo = `頭の行\n\n08:00${W}\n${G}よい一件\n\n09:00${W}\nふつうの一件`;
  t.check("外へ出す字は印の行の頭だけ「よかった：」", P.outText(memo) === `頭の行\n\n08:00${W}\nよかった：よい一件\n\n09:00${W}\nふつうの一件`, JSON.stringify(P.outText(memo)));
  const r = P.add(memo, `${G}あとの一件`, P.mark(AT, "2026-10-06"));
  const items = P.parse(r.memo);
  t.check("足した一件も印つきのまま分かれる", items.length === 4 && P.isGood(items[3].text) && P.bare(items[3].text) === "あとの一件");
}

(async () => {
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(AT); },
  });
  const day = await page.evaluate(() => KN.util.todayKey());
  const memo = () => page.evaluate((d) => (KN.store.dayLog(d) || {}).memo || "", day);
  const sheetOpen = () => page.waitForSelector(".sheet.is-open.is-card .js-memo", { timeout: 4000 });
  const closeSheet = async () => {
    await page.click(".sheet.is-open .js-ok");
    await page.waitForFunction(() => !document.querySelector("#sheet-root .sheet"), null, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(150);
  };
  const said = () => page.evaluate(() => [...document.querySelectorAll(".toast-msg")].map((x) => x.textContent).join("|"));
  /* 直す・写す・ノートへ移すは、言葉の行を押すと出る道具（構1）。開いていれば押し直さない。 */
  const tool = async (k, name) => {
    const p = `#screen-archive .arc-post[data-k="${k}"]`;
    if (!(await page.$(`${p}.is-tools`))) await page.click(`${p} .arc-post-text`);
    await page.click(`${p} .js-post-${name}`);
  };
  const posts = () => page.evaluate(() => [...document.querySelectorAll("#screen-archive .arc-log-row.is-chat .arc-post")]
    .map((p) => ({ good: p.classList.contains("is-good"), sun: !!p.querySelector(".arc-post-at svg"),
      text: p.querySelector(".arc-post-text").textContent })));

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);

  /* ---- 書く紙：よかったことは帯の札（構3・README 6.5）。カーソルはいまのことの欄 ---- */
  const chipOn = () => page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    return { on: s.querySelector(".wr-good").getAttribute("aria-pressed") === "true", row: s.querySelector(".wr-cur").classList.contains("is-good"),
      ph: s.querySelector(".js-memo").placeholder, focus: document.activeElement === s.querySelector(".js-memo") };
  });
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  const s1 = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open"), c = s.querySelector(".sheet-foot .wr-good");
    return { chip: !!c && c.textContent.trim() === "よかったこと" && !!c.querySelector("svg"), off: !!c && c.getAttribute("aria-pressed") === "false",
      field: !!s.querySelector(".js-good, .arc-good-field"), focus: document.activeElement === s.querySelector(".js-memo"),
      emoji: /\p{Extended_Pictographic}/u.test(s.innerText) };
  });
  t.check("よかったことは帯の札（絵つき・押していない）・欄は一つ", s1.chip && s1.off && !s1.field, JSON.stringify(s1));
  /* RS 2回目：題の前に書く口「日記に書く」と同じ絵。 */
  t.check("日記の紙の題に書く口と同じ絵", await page.evaluate(() => /think\/diary\.webp$/.test((document.querySelector(".sheet.is-open .sheet-mark-art") || {}).src || "")));
  t.check("カーソルはいまのことの欄・絵文字なし", s1.focus && !s1.emoji, JSON.stringify(s1));

  /* 先に札を押してから書く */
  await page.click(".sheet.is-open .wr-good");
  const c1 = await chipOn();
  t.check("札を押すと行が温かい地・案内は「よかったこと」・カーソルは欄のまま", c1.on && c1.row && c1.ph === "よかったこと" && c1.focus, JSON.stringify(c1));
  await page.keyboard.insertText("よい字");
  await page.waitForTimeout(800);
  const m1 = await memo();
  t.check("打った先から一件（中身の頭に見えない印だけ）", m1.endsWith(`\n\n12:34${W}\n${G}よい字`) && !/よかった/.test(m1), JSON.stringify(m1));
  await closeSheet();
  t.check("閉じたら「保存しました」", /保存しました/.test(await said()), await said());
  const p1 = await posts();
  t.check("頁の行は温かい地・陽の絵、印は見せない", p1.length === 2 && p1[1].good && p1[1].sun && p1[1].text === "よい字" && !p1[0].good, JSON.stringify(p1));

  /* ---- 書いてから札を押しても、その一件に印。押し直せば外れる ---- */
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  await page.keyboard.insertText("二つめ");
  await page.waitForTimeout(700);
  await page.click(".sheet.is-open .wr-good");
  await page.waitForTimeout(100);
  t.check("書いたあとに札：その一件に印", (await memo()).endsWith(`12:34${W}\n${G}二つめ`), JSON.stringify((await memo()).slice(-20)));
  await page.keyboard.insertText("のよいこと");
  await page.waitForTimeout(700);
  await closeSheet();
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  await page.keyboard.insertText("いまのこと");
  await page.waitForTimeout(700);
  await page.click(".sheet.is-open .wr-good");
  await page.waitForTimeout(100);
  await page.click(".sheet.is-open .wr-good");
  const c2 = await chipOn();
  await closeSheet();
  const m2 = await memo();
  t.check("押し直すと印が外れる（一件ずつ・重ならない）", !c2.on && !c2.row && c2.focus
    && m2.endsWith(`12:34${W}\n${G}よい字\n\n12:34${W}\n${G}二つめのよいこと\n\n12:34${W}\nいまのこと`)
    && m2.split("いまのこと").length === 2, JSON.stringify([c2, m2]));

  /* ---- 札を押して書いた字を空にすれば、黙って外れる ---- */
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  await page.click(".sheet.is-open .wr-good");
  await page.keyboard.insertText("消すつもり");
  await page.waitForTimeout(700);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await closeSheet();
  const m3 = await memo();
  t.check("空にした一件は外れ、前の本文のまま", m3 === m2, JSON.stringify(m3));

  /* ---- 直す紙：印は欄に見せず、札は押してある。直しても印は残る ---- */
  await tool(1, "edit");
  await sheetOpen();
  const s2 = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    return { v: s.querySelector(".js-memo").value, ph: s.querySelector(".js-memo").placeholder,
      on: s.querySelector(".wr-good").getAttribute("aria-pressed") === "true", sun: !!s.querySelector(".wr-cur.is-good .wr-at svg") };
  });
  t.check("直す紙はその一件の字だけ（印なし・札は押してある）", s2.v === "よい字" && s2.ph === "よかったこと" && s2.on && s2.sun, JSON.stringify(s2));
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.press("End");
  await page.keyboard.insertText("を直した");
  await closeSheet();
  const m4 = await memo();
  t.check("直しても印は残る", m4 === m3.replace(`${G}よい字\n`, `${G}よい字を直した\n`), JSON.stringify(m4));

  /* ---- コピー・書き出しの字にだけ「よかった：」 ---- */
  await page.evaluate(() => { KN.util.copy = (s) => { window.__copied = s; return Promise.resolve(true); }; });
  await tool(1, "copy");
  await page.waitForTimeout(200);
  t.check("一件のコピーは「よかった：」つき", (await page.evaluate(() => window.__copied)) === "よかった：よい字を直した", await page.evaluate(() => window.__copied));
  const ex = await page.evaluate((d) => ({
    month: KN.store.exportMonth(d.slice(0, 7)).days.find((x) => x.date === d).memo,
    range: KN.store.exportRange(d, d).days[0].memo,
  }), day);
  t.check("月・期間の書き出しも「よかった：」つき・印は残さない",
    [ex.month, ex.range].every((s) => s.includes(`\nよかった：よい字を直した`) && s.includes(`\nよかった：二つめのよいこと`) && !s.includes(G)), JSON.stringify(ex));
  t.check("記録そのものは変わらない（印のまま）", (await memo()) === m4);

  t.check("ページのエラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
