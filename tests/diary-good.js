/* よかったこと（docs/thinking.md）。
   - 新しい一件の書く紙の頭に「よかったこと」の一行（いまのことの欄の上・カーソルはいまのことのまま）
   - 打てば別の一件（時刻つき）。中身の頭に見えない印 U+2063 だけ——本文に「よかった」の字は書かない
   - 吹き出しは is-good（温かい地・時刻の前に陽の絵）。印は見せない
   - 同じ紙で二つ書いても、前の一件を直したあとに後ろの一件が重ならない。空にすれば黙って外れる
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
  const posts = () => page.evaluate(() => [...document.querySelectorAll("#screen-archive .arc-log-row.is-chat .arc-post")]
    .map((p) => ({ good: p.classList.contains("is-good"), sun: !!p.querySelector(".arc-post-at svg"),
      text: p.querySelector(".arc-post-text").textContent })));

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);

  /* ---- 書く紙：よかったことの一行が上に。カーソルはいまのこと ---- */
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  const s1 = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    const g = s.querySelector(".js-good"), m = s.querySelector(".js-memo");
    return { g: !!g, above: !!(g && (g.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING)), ph: g && g.placeholder,
      icon: !!s.querySelector(".arc-good-field svg"), focus: document.activeElement === g,
      emoji: /\p{Extended_Pictographic}/u.test(s.innerText) };
  });
  t.check("よかったことの一行が、いまのことの欄の上に（絵つき・字は「よかったこと」）", s1.g && s1.above && s1.ph === "よかったこと" && s1.icon, JSON.stringify(s1));
  t.check("カーソルはよかったことの欄・絵文字なし", s1.focus && !s1.emoji, JSON.stringify(s1));

  /* よかったことだけ書く */
  await page.focus(".sheet.is-open .js-good");
  await page.keyboard.insertText("よい字");
  await page.waitForTimeout(800);
  const m1 = await memo();
  t.check("打った先から別の一件（中身の頭に見えない印だけ）", m1.endsWith(`\n\n12:34${W}\n${G}よい字`) && !/よかった/.test(m1), JSON.stringify(m1));
  await closeSheet();
  t.check("閉じたら「保存しました」", /保存しました/.test(await said()), await said());
  const p1 = await posts();
  t.check("吹き出しは温かい地・陽の絵、印は見せない", p1.length === 2 && p1[1].good && p1[1].sun && p1[1].text === "よい字" && !p1[0].good, JSON.stringify(p1));

  /* ---- 同じ紙で二つ：前の一件を直しても、後ろが重ならない ---- */
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  await page.focus(".sheet.is-open .js-good");
  await page.keyboard.insertText("二つめ");
  await page.waitForTimeout(700);
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.insertText("いまのこと");
  await page.waitForTimeout(700);
  await page.focus(".sheet.is-open .js-good");
  await page.keyboard.press("End");
  await page.keyboard.insertText("のよいこと");
  await page.waitForTimeout(700);
  await closeSheet();
  const m2 = await memo();
  t.check("二件に分かれ、直した前の一件と後ろの一件が一度ずつ",
    m2.endsWith(`12:34${W}\n${G}よい字\n\n12:34${W}\n${G}二つめのよいこと\n\n12:34${W}\nいまのこと`)
    && m2.split("いまのこと").length === 2, JSON.stringify(m2));

  /* ---- 同じ紙で書いたよかったことを空にすれば、黙って外れる（いまのことは残る） ---- */
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  await page.focus(".sheet.is-open .js-good");
  await page.keyboard.insertText("消すつもり");
  await page.waitForTimeout(700);
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.insertText("のこす");
  await page.waitForTimeout(700);
  await page.focus(".sheet.is-open .js-good");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await closeSheet();
  const m3 = await memo();
  t.check("空にした一件だけ外れる", !/消すつもり/.test(m3) && m3.endsWith(`\n\n12:34${W}\nのこす`) && m3.startsWith(m2), JSON.stringify(m3));

  /* ---- 直す紙：印は欄に見せず、直しても残る ---- */
  await page.click("#screen-archive .arc-post:nth-child(2) .js-post-edit");
  await sheetOpen();
  const s2 = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    return { v: s.querySelector(".js-memo").value, ph: s.querySelector(".js-memo").placeholder, g: !!s.querySelector(".js-good") };
  });
  t.check("直す紙はその一件の字だけ（印なし・よかったことの欄は足さない）", s2.v === "よい字" && s2.ph === "よかったこと" && !s2.g, JSON.stringify(s2));
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.press("End");
  await page.keyboard.insertText("を直した");
  await closeSheet();
  const m4 = await memo();
  t.check("直しても印は残る", m4 === m3.replace(`${G}よい字\n`, `${G}よい字を直した\n`), JSON.stringify(m4));

  /* ---- コピー・書き出しの字にだけ「よかった：」 ---- */
  await page.evaluate(() => { KN.util.copy = (s) => { window.__copied = s; return Promise.resolve(true); }; });
  await page.click("#screen-archive .arc-post:nth-child(2) .js-post-copy");
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
