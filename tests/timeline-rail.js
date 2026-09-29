/* 時間割の線と丸薬（2026年9月27日）。
   - 線の色の境目は「いま」の一か所だけ：いまの行より上の線は色、下は灰色。
     済ませたもの・重なった用事の丸薬の上下から、色の付いた短い線が灰色の中へ
     突き出ない（「丸薬に線が刺さっている」）。
   - 長さを決めた用事の時間の中で起きた用事は、すぐ上の丸薬とぶつかる（is-clash）。
     長さを決めていない用事どうし（仮の30分）は、ぶつけない。
   - ぶつかった上の丸薬は、下の用事が始まるまでを受け持つ（2026年9月29日）。
     ルーティンの途中で済ませた用事の上で、ルーティンが途中まで・下が色、と
     時間が戻って見えない。うすい地（いま進んでいる）はルーティンに残る。
   `SHOTS=<置き場>` で時間割を撮る。 */
const { open, checker } = require("./lib");

const DAY = "2026-09-27";

(async () => {
  const c = checker("timeline-rail");
  const { browser, page, errors } = await open({
    before: async (ctx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 27, 9, 4)); },
  });

  /* 画面と同じ場面：8:00〜12:00 のルーティン（手順つき）の途中の 9:03 に、
     長さを決めていない用事を済ませた。夕方に時刻を決めた用事が二つ、
     そのうち一つは朝のうちに済ませた。さらに、続けて二つ済ませた長さなしの用事。 */
  await page.evaluate((day) => {
    const s = KN.store;
    const at = (h, m) => new Date(2026, 8, 27, h, m).toISOString();
    const done = (t, h, m) => s.update((st) => {
      const x = st.todos.find((y) => y.id === t.id);
      x.done = true; x.doneAt = at(h, m);
    });
    s.addTodo({ title: "朝のBaby", due: day, time: "08:00", minutes: 240,
                subs: ["a", "b", "c", "d"].map((x) => ({ title: x })) });
    done(s.addTodo({ title: "誕生日の準備", due: day }), 9, 3);
    s.addTodo({ title: "燃えるゴミ", due: day, time: "20:30", minutes: 30 });
    done(s.addTodo({ title: "夜のルーティン", due: day, time: "21:00", minutes: 30 }), 8, 50);
    done(s.addTodo({ title: "洗濯", due: day }), 7, 10);
    done(s.addTodo({ title: "皿洗い", due: day }), 7, 15);
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(600);

  const rows = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const list = scr.querySelector(".tl-list");
    return [...list.children].map((li) => {
      const cs = getComputedStyle(li);
      return {
        kind: li.classList.contains("tl-row") ? "item" : "free",
        title: (li.querySelector(".tl-open, .tl-title") || {}).textContent || "",
        clash: li.classList.contains("is-clash"),
        above: li.classList.contains("is-clash-above"),
        pass: parseFloat(cs.getPropertyValue("--pass")),
        top: li.style.getPropertyValue("--rail-top-c"),
        bot: li.style.getPropertyValue("--rail-bot-c"),
        live: li.classList.contains("is-live"),
      };
    });
  });
  /* いまの札が、ルーティンの途中で済ませた用事の丸薬より下にいるか。 */
  const nowBelow = await page.evaluate(() => {
    const scr = document.querySelector("#screen-todo");
    const row = [...scr.querySelectorAll(".tl-row")].find((li) => li.textContent.includes("誕生日"));
    const now = scr.querySelector(".tl-now");
    return !!row && !!now
      && now.getBoundingClientRect().top >= row.querySelector(".tl-node").getBoundingClientRect().bottom - 1;
  });
  const find = (w) => rows.find((r) => r.title.includes(w)) || {};
  const idx = (w) => rows.findIndex((r) => r.title.includes(w));
  const FILL = "var(--tl-fill)", WAIT = "var(--tl-wait)";

  const baby = find("朝のBaby");
  const bday = find("誕生日");
  c.check("ルーティンの途中で済ませた用事は、ルーティンの丸薬とぶつかる",
    bday.clash && baby.above, JSON.stringify({ bday, baby }));
  c.check("ぶつかったルーティンの丸薬は、下の用事が始まるところまで塗り切る",
    baby.pass === 1, JSON.stringify(baby));
  c.check("…でもルーティンはまだ続いているので、うすい地（いま）は残る", baby.live, JSON.stringify(baby));
  c.check("その用事の丸薬は色（済んだ）", bday.pass === 1);
  c.check("時間が戻らない：ルーティンと、その途中で済ませた用事の線は色",
    baby.top === FILL && baby.bot === FILL && bday.top === FILL && bday.bot === FILL,
    JSON.stringify({ baby, bday }));
  c.check("いまの時刻の札は、その用事より下", nowBelow, String(nowBelow));

  const later = rows.slice(idx("誕生日") + 1);
  c.check("いまより下の線は、一本も色を持たない",
    later.every((r) => r.kind === "free" ? r.pass === 0 || r.title === "" : r.top === WAIT && r.bot === WAIT),
    JSON.stringify(later));

  const night = find("夜のルーティン");
  c.check("夕方の用事を朝に済ませた：丸薬は色、線は灰色",
    night.pass === 1 && night.top === WAIT && night.bot === WAIT, JSON.stringify(night));

  const early = rows.slice(0, idx("朝のBaby")).filter((r) => r.kind === "item");
  c.check("いまより上（過ぎた行）の線は色", early.length > 0 && early.every((r) => r.top === FILL && r.bot === FILL),
    JSON.stringify(early));
  c.check("長さを決めていない用事を続けて済ませても、丸薬をぶつけない",
    !find("洗濯").clash && !find("皿洗い").clash && !find("洗濯").above, JSON.stringify([find("洗濯"), find("皿洗い")]));
  c.check("時刻を決めていない済ませた用事に「前と重なっています」を出さない",
    await page.evaluate(() => ![...document.querySelectorAll("#screen-todo .tl-clash")].length));

  if (process.env.SHOTS) {
    const el = await page.$("#screen-todo .tl");
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: `${process.env.SHOTS}/timeline.png` });
  }
  c.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
