/* 年の本（R10・2026年9月29日、docs/daily.md の「年の本」）。

   前半は中身（KN.yearbook）：記録のある年だけ・積み上げは種類ごとに日付の順・
   「達成」は「やったこと」・初めて買ったものは前の年に買ったものを入れない・
   よく買ったものは二回から回数つき・日記は日付の順で本文そのまま・ほかの年が
   混ざらない・禁止語と割合が無い・記録は増えない（書き出しても state が同じ）。
   後半は画面：設定 → バックアップと書き出し → 年の本・年の札・Markdown が
   中身と同じ・印刷のあいだだけ本が出てほかが隠れる・印刷が済めば消える・
   日記を読めない日は断る。

   日記の本文は試験用の無難な字だけ。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/yearbook.js */
const { open, checker } = require("./lib");

const FORBIDDEN = [
  "目標", "連続", "達成", "割合", "先月", "前月", "平均", "記録更新", "ストリーク",
  "サボ", "がんば", "頑張", "未記入", "書いていない", "空白", "できなかった",
  "去年", "前年", "比べ", "増え", "減っ",
];

(async () => {
  const t = checker("yearbook");
  const { browser, page, errors } = await open({
    before: (ctx) => ctx.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; }),
  });
  await page.waitForFunction(() => !KN.diaryIdb || KN.diaryIdb.settled());

  await page.evaluate(() => {
    const S = KN.store;
    const at = (day, h = 3) => new Date(`${day}T0${h}:00:00Z`).toISOString();
    S.update((s) => {
      s.products.push(
        { id: "p-yb-milk", name: "試験の牛乳", categoryId: null, prices: [] },
        { id: "p-yb-bread", name: "試験のパン", categoryId: null, prices: [] },
      );
      const it = (id, productId, day) => ({ id, productId, qty: 1, memo: "", checked: true, fav: false, addedAt: at(day), checkedAt: at(day) });
      s.items.push(
        it("i-yb-1", "p-yb-milk", "2024-12-01"),
        it("i-yb-2", "p-yb-milk", "2025-03-01"),
        it("i-yb-3", "p-yb-milk", "2025-05-01"),
        it("i-yb-4", "p-yb-bread", "2025-02-01"),
      );
      const en = (id, type, date, title, memo, author) => ({ id, type, date, title, memo: memo || "", author: author || "",
        createdAt: `${date}T01:00:00.000Z`, updatedAt: `${date}T01:00:00.000Z`, tags: [] });
      s.archive.entries.push(
        en("e-yb-1", "reading", "2025-04-10", "試験の本", "", "試験の著者"),
        en("e-yb-2", "reading", "2025-01-20", "試験の古い本", ""),
        en("e-yb-3", "done", "2025-06-01", "試験の用事", "試験のひとこと"),
        en("e-yb-4", "reading", "2024-08-01", "前の年の本", ""),
      );
    });
    S.setDayLog("2025-07-02", { memo: "晴れの試験の一行\n二行目" });
    S.setDayLog("2025-01-05", { memo: "試験の一行" });
    S.setDayLog("2024-05-05", { memo: "前の年の試験の一行" });
  });
  await page.waitForTimeout(400);

  /* ================= 中身 ================= */
  const before = await page.evaluate(() => JSON.stringify(KN.store.get()));
  const r = await page.evaluate(() => ({
    years: KN.yearbook.years(),
    b: KN.yearbook.build("2025"),
    md: KN.yearbook.markdown("2025"),
    html: KN.yearbook.printHtml("2025"),
    arc: Object.keys(KN.store.get().archive).sort(),
  }));
  const after = await page.evaluate(() => JSON.stringify(KN.store.get()));

  t.check("記録のある年だけ、新しい順", JSON.stringify(r.years.filter((y) => y === "2025" || y === "2024")) === '["2025","2024"]'
    && r.years.every((y, i) => i === 0 || r.years[i - 1] > y), r.years.join(","));
  const reading = r.b.stacks.find((g) => g.id === "reading");
  t.check("積み上げは種類ごと・日付の順（1月の本が先）",
    reading && reading.items.map((e) => e.title).join("|") === "試験の古い本|試験の本");
  t.check("読書は著者も", reading && reading.items[1].author === "試験の著者");
  const done = r.b.stacks.find((g) => g.id === "done");
  t.check("「達成」は「やったこと」", done && done.label === "やったこと" && r.md.includes("### やったこと"));
  t.check("積み上げのメモは本人の字のまま", r.md.includes("  試験のひとこと"));
  t.check("初めて買ったもの：前の年に買った牛乳は入らず、パンだけ",
    JSON.stringify(r.b.firsts.map((f) => f.name)) === '["試験のパン"]', JSON.stringify(r.b.firsts));
  t.check("よく買ったもの：二回からで回数つき（一回のパンは出ない）",
    JSON.stringify(r.b.often) === '[{"name":"試験の牛乳","times":2}]', JSON.stringify(r.b.often));
  t.check("日記は日付の順で本文そのまま",
    r.b.diary.map((d) => d.day).join(",") === "2025-01-05,2025-07-02"
    && r.md.includes("### 7月2日（水）\n\n晴れの試験の一行\n二行目"), r.b.diary.map((d) => d.day).join(","));
  t.check("ほかの年が混ざらない", !/前の年/.test(r.md) && !/前の年/.test(r.html));
  t.check("章の並び：積み上げ → 初めて買った → よく買った → 日記",
    ["## 積み上げ", "## 初めて買ったもの", "## よく買ったもの", "## 日記"].map((h) => r.md.indexOf(h))
      .every((v, i, a) => v >= 0 && (i === 0 || a[i - 1] < v)));
  const hits = FORBIDDEN.filter((w) => r.md.includes(w) || r.html.includes(w));
  t.check("禁止語が無い（Markdown・印刷とも）", !hits.length, hits.join(","));
  t.check("割合（%）が無い", !/\d\s*[%％]/.test(r.md + r.html));
  t.check("日記の日の数・積み上げの件数を言わない", !/\d+\s*(日ぶん|日分|件|冊)/.test(r.md));
  t.check("書き出しても記録は変わらない", before === after);
  t.check("archive の器は entries・days・quiet のまま", JSON.stringify(r.arc) === '["days","entries","quiet"]', r.arc.join(","));

  const empty = await page.evaluate(() => KN.yearbook.markdown("1999"));
  t.check("記録の無い年は章を出さない（「ありません」の一覧にしない）",
    !empty.includes("## ") && !/ありません|なし/.test(empty), empty);

  /* ================= 画面 ================= */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.locator(".set-layer:last-child .set-row", { hasText: "バックアップと書き出し" }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".set-layer:last-child .set-row", { hasText: "年の本" }).first().click();
  await page.waitForTimeout(500);
  const ui = await page.evaluate(() => {
    const chips = [...document.querySelectorAll(".js-years button, .js-years [role=tab], .js-years .chip")]
      .map((c) => ({ text: c.textContent.trim(), on: c.classList.contains("is-active") || c.getAttribute("aria-selected") === "true" || c.getAttribute("aria-pressed") === "true" }));
    return { chips, text: document.body.innerText };
  });
  t.check("年の札に 2025年・2024年", ui.chips.some((c) => c.text === "2025年") && ui.chips.some((c) => c.text === "2024年"),
    ui.chips.map((c) => c.text).join(","));
  t.check("今年に記録が無ければ、いちばん新しい年を選んでいる",
    (ui.chips.find((c) => c.on) || {}).text === ui.chips[0].text, JSON.stringify(ui.chips));

  // いちばん新しい年が 2025 でないこともある（今年に記録があれば今年）。2025 を押す。
  await page.locator(".js-years", { hasText: "2025年" }).getByText("2025年", { exact: true }).click();
  await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".js-md").click()]);
  const fs = require("fs");
  const got = fs.readFileSync(await dl.path(), "utf8");
  t.check("Markdown のファイル名は kurashi-2025.md", dl.suggestedFilename() === "kurashi-2025.md", dl.suggestedFilename());
  t.check("Markdown の中身は組んだものと同じ", got === r.md);

  await page.locator(".js-print").click();
  await page.waitForTimeout(200);
  await page.emulateMedia({ media: "print" });
  const pr = await page.evaluate(() => {
    const book = document.getElementById("yearbook-print");
    const others = [...document.body.children].filter((c) => c !== book && c.tagName !== "SCRIPT");
    return {
      printed: window.__printed,
      shown: !!book && getComputedStyle(book).display !== "none",
      text: book ? book.innerText : "",
      hidden: others.every((c) => getComputedStyle(c).display === "none"),
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
  t.check("印刷を押すと print が呼ばれる", pr.printed === 1);
  t.check("印刷のあいだは本だけが出る", pr.shown && pr.hidden);
  t.check("印刷の本に 2025 年の中身", pr.text.includes("くらしノート 2025年") && pr.text.includes("晴れの試験の一行"));
  t.check("紙は白地", pr.bg === "rgb(255, 255, 255)", pr.bg);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  const gone = await page.evaluate(() => !document.getElementById("yearbook-print")
    && !document.documentElement.classList.contains("is-printing-book"));
  t.check("印刷が済めば本は消える", gone);

  // 日記を読めない日は断る
  await page.evaluate(() => { KN.diaryIdb.body = () => "off"; KN.diaryIdb.retry = () => {}; });
  let dl2 = false;
  page.on("download", () => { dl2 = true; });
  await page.locator(".js-md").click();
  await page.waitForTimeout(400);
  const toast = await page.evaluate(() => document.body.innerText);
  t.check("日記を読めない日は書き出さず、そう言う", !dl2 && toast.includes("年の本は書き出せません"));

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
