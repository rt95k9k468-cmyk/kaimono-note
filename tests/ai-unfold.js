/* AI とほどく（3.0 の C1、docs/roadmap-3.0.md・docs/todo-items.md の「AI とほどく」。2026年10月6日）。
   アプリは AI を呼ばない：文を作り、本人が運び、本人が選んで取り込む。
   - 文に入るのは選んだ欄だけ（札で外せる）。日記・ノート・からだ・買うものの字は混ざらない。困っていることは一行
   - コピーして開く：文をクリップボードへ・選んだ AI を開く（覚える）
   - 答えの読み：ChatGPT 風（```・**）・Claude 風（| と 1)）・枠の崩れた答え（箇条の行を候補に）
   - 読んだだけでは何も変わらない。選んだものだけ取り込む（手順・メモ・次の一歩を今日に）。元に戻す一回で戻る
   - 別の用事としてこれからへ
   - ほかの AI にも相談する：同じ文に「ここまでの結果」を足してコピー
   - すすめの札は当てはまる用事だけ（置き直し3回以上・60分以上で手順なし・これからで21日）。×で二度と出さない
   - 見直しの紙の「小さく分ける」・置き直しの紙の「小さくする」から開く

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/ai-unfold.js */
const { open, checker } = require("./lib");

const TODAY = "2026-10-06";

const CHATGPT = [
  "了解です。まとめると次の通りです。",
  "",
  "```",
  "<<くらしノート>>",
  "**完了条件**：押し入れの中身が3つの箱に分かれている",
  "**前提**：週末に2時間使える",
  "次の一歩：箱を3つ用意する｜15分",
  "1. 中身を全部出す｜30分",
  "2. 残す・捨てる・譲るに分ける｜45分｜1のあと",
  "3. 譲るものの行き先を決める｜1時間30分｜2のあと",
  "さらに分ける：3",
  "<</くらしノート>>",
  "```",
].join("\n");
const CLAUDE = [
  "<<くらしノート>>",
  "完了条件：申込書を出し終えている",
  "前提：必要書類はそろっている",
  "次の一歩：申込書を印刷する | 10分",
  "1) 記入する | 20分",
  "2) 写しをとる | 5分 | 1のあと",
  "<</くらしノート>>",
].join("\n");
const BROKEN = [
  "いいですね！こんな感じで分けてみました。",
  "- 棚の寸法を測る（15分）",
  "- 材料を買いに行く（1時間）",
  "- 組み立てる",
  "何かあれば聞いてください。",
].join("\n");

(async () => {
  const c = checker("ai-unfold");
  const { browser, page, errors } = await open({
    before: async (cx, p) => {
      await p.clock.setFixedTime(new Date(2026, 9, 6, 10, 0));
      await cx.addInitScript(() => {
        window.__copied = [];
        window.__opened = [];
        const cb = { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } };
        try { Object.defineProperty(navigator, "clipboard", { value: cb, configurable: true }); } catch (_) {}
        window.open = (u) => { window.__opened.push(u); return null; };
      });
    },
  });
  const wait = (ms) => page.waitForTimeout(ms);
  const id = await page.evaluate((d) => {
    const S = KN.store;
    S.setDayLog(d, { memo: "秘密の日記の一行" });
    const t = S.addTodo({ title: "押し入れの整理", memo: "冬物が多い", minutes: 120, deadline: "2026-10-31",
      subs: [{ title: "写真を撮る" }] });
    S.update((s) => { s.todos.find((x) => x.id === t.id).slips = ["2026-09-20", "2026-09-27", "2026-10-03"]
      .map((x) => ({ on: x, from: x, time: null, how: "hand" })); });
    return t.id;
  }, TODAY);

  /* ---------------- 文 ---------------- */
  await page.click('.tab[data-tab="todo"]');
  await wait(500);
  await page.evaluate((i) => KN.unfold.open(i), id);
  await wait(600);
  const preview = () => page.evaluate(() => [...document.querySelectorAll(".sheet.is-open .unf-prompt")].pop().textContent);
  let p = await preview();
  c.check("文に題・メモ・手順・期限・長さ・置き直した回数",
    /題：押し入れの整理/.test(p) && /メモ：冬物が多い/.test(p) && /すでにある手順：写真を撮る/.test(p)
    && /期限：10月31日/.test(p) && /見込みの長さ：2時間/.test(p) && /置き直した回数：3回/.test(p), p);
  c.check("文に日記の字が混ざらない", !/秘密の日記/.test(p));
  c.check("文は進め方と枠を持つ", /まず質問だけ/.test(p) && /<<くらしノート>>/.test(p) && /<<\/くらしノート>>/.test(p));
  await page.locator('.sheet.is-open .unf-picks .chip[data-f="memo"]').click();
  await page.locator(".sheet.is-open .js-trouble").fill("どこから手を付けるか決められない");
  await wait(200);
  p = await preview();
  c.check("札を外した欄は入らない・困っていることは入る", !/メモ：/.test(p) && /困っていること：どこから手を付けるか決められない/.test(p), p);
  c.check("渡す中身を選ぶ紙に日記・ノート・からだ・買うものの札は無い", await page.evaluate(() =>
    ![...document.querySelectorAll(".sheet.is-open .unf-picks .chip")].some((b) => /日記|ノート|からだ|買う/.test(b.textContent))));

  await page.locator(".sheet.is-open .js-copy").click();
  await wait(300);
  let got = await page.evaluate(() => ({ copied: window.__copied.slice(), opened: window.__opened.slice() }));
  c.check("コピーして開く：文をそのまま・ChatGPT を開く", got.copied[0] === p && got.opened[0] === "https://chatgpt.com/", JSON.stringify(got.opened));
  await page.locator(".sheet.is-open .js-ai .chip", { hasText: "Claude" }).click();
  await page.locator(".sheet.is-open .js-copy").click();
  await wait(300);
  got = await page.evaluate(() => ({ opened: window.__opened.slice(), ai: KN.store.get().settings.aiChat }));
  c.check("Claude を選ぶと覚えて開く", got.opened[1] === "https://claude.ai/new" && got.ai === "claude", JSON.stringify(got));

  /* ---------------- 読む ---------------- */
  const parsed = await page.evaluate(([a, b, x]) => [KN.unfold.parse(a), KN.unfold.parse(b), KN.unfold.parse(x)], [CHATGPT, CLAUDE, BROKEN]);
  const [g, cl, br] = parsed;
  c.check("ChatGPT 風：枠・完了条件・前提・次の一歩・手順・長さ・あと・さらに分ける",
    g.framed && g.done === "押し入れの中身が3つの箱に分かれている" && g.premise === "週末に2時間使える"
    && g.next.title === "箱を3つ用意する" && g.next.minutes === 15 && g.steps.length === 3
    && g.steps[1].minutes === 45 && g.steps[1].after === 1 && g.steps[2].minutes === 90 && g.steps[2].split, JSON.stringify(g));
  c.check("Claude 風（| と 1)）", cl.framed && cl.next.minutes === 10 && cl.steps.length === 2 && cl.steps[1].after === 1
    && cl.steps[0].title === "記入する", JSON.stringify(cl));
  c.check("枠の崩れた答えは、箇条の行を候補に（長さも読む）", !br.framed && br.steps.length === 3
    && br.steps[0].title === "棚の寸法を測る" && br.steps[0].minutes === 15 && br.steps[1].minutes === 60, JSON.stringify(br));

  const snap = () => page.evaluate(() => JSON.stringify(KN.store.get().todos));
  const before = await snap();
  await page.locator(".sheet.is-open .js-answer").fill(CHATGPT);
  await wait(500);   // 貼ったら読む（読むボタンは無い）
  c.check("読んだだけでは何も変わらない", (await snap()) === before);
  const cands = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open .unf-pick .unf-pt")].map((x) => x.textContent.trim()));
  c.check("候補：メモに残す・次の一歩・今日の道に置く・手順3つ",
    cands.includes("メモに残す") && cands.includes("次の一歩：箱を3つ用意する") && cands.includes("今日の道に置く")
    && cands.filter((x) => /^\d\. /.test(x)).length === 3, JSON.stringify(cands));
  /* 3番目の手順は外す・次の一歩は今日の道へ */
  await page.locator('.sheet.is-open .js-step[data-i="2"]').uncheck();
  await page.locator(".sheet.is-open .js-next-today").check();
  await page.locator(".sheet.is-open .js-take").click();
  await wait(500);
  let t = await page.evaluate((i) => KN.store.getTodo(i), id);
  c.check("手順に足す（次の一歩と選んだ手順。長さは題に）",
    JSON.stringify(t.subs.map((x) => x.title)) === JSON.stringify(["写真を撮る", "箱を3つ用意する（15分）", "中身を全部出す（30分）", "残す・捨てる・譲るに分ける（45分）"]),
    JSON.stringify(t.subs.map((x) => x.title)));
  c.check("完了条件と前提をメモに残す", /冬物が多い\n\n完了条件：押し入れの中身が3つの箱に分かれている\n前提：週末に2時間使える/.test(t.memo), t.memo);
  const todayOne = await page.evaluate((d) => KN.store.get().todos.find((x) => x.title === "箱を3つ用意する" && x.due === d), TODAY);
  c.check("次の一歩だけ今日に（時刻なし・15分）", !!todayOne && !todayOne.time && todayOne.minutes === 15, JSON.stringify(todayOne));
  const toast = await page.evaluate(() => (document.querySelector(".toast") || {}).textContent || "");
  c.check("知らせに「元に戻す」", /取り込みました/.test(toast) && /元に戻す/.test(toast), toast);
  await page.locator(".toast-action", { hasText: "元に戻す" }).click();
  await wait(400);
  c.check("元に戻す一回で全部戻る", (await snap()) === before);

  /* 別の用事としてこれからへ・ほかの AI にも */
  await page.evaluate((i) => KN.unfold.open(i), id);
  await wait(600);
  await page.locator(".sheet.is-open .js-answer").fill(CLAUDE);
  await wait(500);   // 貼ったら読む（読むボタンは無い）
  await page.locator(".sheet.is-open .js-again").click();
  await wait(300);
  got = await page.evaluate(() => window.__copied.slice(-1)[0]);
  c.check("ほかの AI にも相談する：文に「ここまでの結果」を足す", /## ここまでの結果/.test(got) && /申込書を印刷する/.test(got)
    && /<<くらしノート>>/.test(got.split("## ここまでの結果")[1] || ""), got.slice(-200));
  await page.locator(".sheet.is-open .js-dest .chip", { hasText: "別の用事としてこれからへ" }).click();
  await page.locator(".sheet.is-open .js-take").click();
  await wait(500);
  const made = await page.evaluate(() => KN.store.get().todos.filter((x) => ["申込書を印刷する", "記入する", "写しをとる"].includes(x.title))
    .map((x) => ({ title: x.title, due: x.due, minutes: x.minutes, review: x.review })));
  c.check("別の用事としてこれからへ（日なし・長さ・見直す日）", made.length === 3 && made.every((x) => !x.due && x.review === "2026-10-20")
    && made.find((x) => x.title === "記入する").minutes === 20, JSON.stringify(made));

  /* ---------------- すすめの札 ---------------- */
  const hint = (tid) => page.evaluate(async (i) => {
    KN.screens.todo.open(i);
    await new Promise((r) => setTimeout(r, 600));
    const h = [...document.querySelectorAll(".sheet.is-open .js-unfold-hint")].pop();
    return !!h && !h.hidden;
  }, tid);
  c.check("置き直し3回以上の用事に「AIとほどく」の札", await hint(id));
  await page.locator(".sheet.is-open .js-unfold-hush").last().click();
  await wait(200);
  await page.keyboard.press("Escape");
  await wait(500);
  c.check("×を押すと二度と出さない", !(await hint(id)));
  await page.keyboard.press("Escape");
  await wait(500);
  const others = await page.evaluate((d) => {
    const S = KN.store;
    const long = S.addTodo({ title: "長い用事", due: d, minutes: 60 }).id;
    const plain = S.addTodo({ title: "ふつうの用事", due: d, minutes: 30 }).id;
    const old = S.addTodo({ title: "古いこれから" }).id;
    S.update((s) => { const x = s.todos.find((y) => y.id === old); x.createdAt = "2026-09-01"; x.editedAt = "2026-09-10T00:00:00.000Z"; delete x.review; });
    return { long, plain, old };
  }, TODAY);
  c.check("60分以上で手順なしにも札", await hint(others.long));
  await page.keyboard.press("Escape");
  await wait(500);
  c.check("これからで21日以上手が入っていないものにも札", await hint(others.old));
  await page.keyboard.press("Escape");
  await wait(500);
  c.check("当てはまらない用事には出さない", !(await hint(others.plain)));
  await page.keyboard.press("Escape");
  await wait(500);

  /* 見直しの紙の「小さく分ける」から */
  await page.click('.tab[data-tab="archive"]');
  await wait(300);
  await page.click('.tab[data-tab="todo"]');
  await wait(700);
  const hasReview = await page.evaluate(() => !!document.querySelector("#screen-todo .tl-review"));
  if (hasReview) {
    await page.locator("#screen-todo .tl-review").click();
    await wait(600);
    await page.locator(".sheet.is-open .rv-go", { hasText: "小さく分ける" }).first().click();
    await page.waitForTimeout(300);
    await page.locator(".sheet.is-open .rv-chips .chip", { hasText: "AIと分ける" }).first().click();
    await wait(700);
  }
  const title = await page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    return s ? s.querySelector(".sheet-title").textContent.trim() : null;
  });
  c.check("見直しの紙の「小さく分ける」→「AIと分ける」で AIとほどく が開く", hasReview && title === "AIとほどく", JSON.stringify([hasReview, title]));

  /* 「自分で分ける」：詳細の紙が、手順を一つ足した形で開く */
  await page.keyboard.press("Escape");
  await wait(600);
  let hand = null;
  if (await page.evaluate(() => !!document.querySelector("#screen-todo .tl-review"))) {
    await page.locator("#screen-todo .tl-review").click();
    await wait(600);
    await page.locator(".sheet.is-open .rv-go", { hasText: "小さく分ける" }).first().click();
    await wait(300);
    await page.locator(".sheet.is-open .rv-chips .chip", { hasText: "自分で分ける" }).first().click();
    await wait(900);
    hand = await page.evaluate(() => {
      const s = [...document.querySelectorAll(".sheet.is-open")].pop();
      return s ? { title: s.querySelector(".sheet-title").textContent.trim(), subs: s.querySelectorAll(".sub-line").length } : null;
    });
  }
  c.check("「自分で分ける」で詳細の紙が手順を一つ足して開く", !!hand && hand.title === "やることを直す" && hand.subs >= 1, JSON.stringify(hand));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
