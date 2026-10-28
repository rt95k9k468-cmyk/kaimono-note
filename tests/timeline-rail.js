/* 時間割の背骨と札の色（2026年9月27日、物差しに合わせて書き直し 2026年10月20日。
   docs/timeline-scale-design.md）。
   - 背骨の色の境目は「いま」の一か所だけ：背骨の区間（.tl-seg）と畳んだ空き（.tl-fold）は、
     いまより前が色、あとが灰色、いまを含む一本だけがその割合。済ませたものの色が線へ漏れない。
   - 今日の済ませたものは物差しに居ない：上の一覧（.tl-done）に一行ずつ、済ませた順・済ませた時刻（2026年10月28日）。
     物差しはいまの時（正時）か、まだの用事の頭の早いほうから。
   - 札の色（--pass）は自分の時間の進み具合。うすい地（いま）は続いている用事に残る。
   - 「いま」の札は y(いま) の高さ（行の中を測らない）。
   済ませた札どうしの列は、ほかの日の物差しの話（tests/tl-layout.js が表で見る）。
   `SHOTS=<置き場>` で時間割を撮る。 */
const { open, checker } = require("./lib");

const DAY = "2026-09-27";
const NOW = 9 * 60 + 4;
const PX_MIN = 1.2;

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
  await page.waitForFunction(() => !document.querySelector(".screen.is-m-arrive"), null, { timeout: 5000 });

  /* 位置は一覧の頭から（送られても揺れない）。 */
  const read = () => page.evaluate(() => {
    const list = document.querySelector("#screen-todo .tl-list");
    const o = list.getBoundingClientRect().top;
    const num = (li, k) => parseFloat(li.style.getPropertyValue(k));
    const rows = [...list.children].filter((li) => li.classList.contains("tl-row")).map((li) => {
      const r = li.getBoundingClientRect();
      return {
        title: (li.querySelector(".item-name") || {}).textContent || "",
        at: Number(li.dataset.at), until: Number(li.dataset.until),
        lane: num(li, "--lane"), lanes: num(li, "--lanes"), pass: num(li, "--pass"),
        live: li.classList.contains("is-live"), shown: r.height > 0,
        top: r.top - o, bottom: r.bottom - o, left: r.left, right: r.right,
      };
    });
    const line = [...list.children].filter((li) => li.matches(".tl-seg, .tl-fold")).map((li) => ({
      kind: li.className, at: Number(li.dataset.at), until: Number(li.dataset.until), pass: num(li, "--pass"),
    })).sort((a, b) => a.at - b.at);
    const now = document.querySelector("#screen-todo .tl-now");
    return { rows, line, now: now ? now.getBoundingClientRect().top - o : null,
      clash: document.querySelectorAll("#screen-todo .is-clash, #screen-todo .is-clash-above, #screen-todo .tl-clash").length };
  });
  let r = await read();
  const find = (w) => r.rows.find((x) => x.title.includes(w)) || {};
  const baby = find("朝のBaby");

  /* 今日の済ませたものは物差しに居ない：上の一覧に一行ずつ、済ませた順（2026年10月28日、利用者）。
     夜の用事は 8:50 に済ませたので、その時刻の行。 */
  const doneRows = await page.evaluate(() => [...document.querySelectorAll("#screen-todo .tl-done-row")].map((li) =>
    `${li.querySelector(".tl-doneat").textContent.trim()} ${li.querySelector(".item-name").textContent.trim()}`));
  c.check("済ませた四件は上の一覧に、済ませた順（時刻は済ませた時刻）",
    doneRows.join("/") === "7:10 洗濯/7:15 皿洗い/8:50 夜のルーティン/9:03 誕生日の準備", JSON.stringify(doneRows));
  c.check("物差しにはまだのものだけ（ルーティンは一列）",
    r.rows.length === 2 && baby.lanes === 1 && !!find("燃えるゴミ").title, JSON.stringify(r.rows.map((x) => x.title)));
  c.check("ルーティンの色は自分の時間の進み具合（64分/240分）",
    Math.abs(baby.pass - (NOW - 480) / 240) < 0.002, JSON.stringify(baby));
  c.check("ルーティンはまだ続いているので、うすい地（いま）は残る", baby.live, JSON.stringify(baby));
  c.check("ぶつかりの印（is-clash・白い抜き・「前と重なっています」）は無い", r.clash === 0, String(r.clash));

  c.check("「いま」の札は y(9:04) の高さ（ルーティンの頭から 64分ぶん）",
    r.now != null && Math.abs(r.now - (baby.top + (NOW - 480) * PX_MIN)) < 1.5, JSON.stringify([r.now, baby.top]));

  /* 背骨の色：いまより前は 1、あとは 0、いまを含む一本だけがその割合。 */
  const want = (s) => (NOW >= s.until ? 1 : NOW <= s.at ? 0 : (NOW - s.at) / (s.until - s.at));
  c.check("背骨と畳んだ空きは、いまで一度だけ色が切れる",
    r.line.length > 2 && r.line.every((s) => Math.abs(s.pass - want(s)) < 0.002)
      && r.line.filter((s) => s.pass > 0 && s.pass < 1).length === 1,
    JSON.stringify(r.line));
  const eve = r.line.find((s) => s.at <= 21 * 60 && s.until >= 21 * 60 + 30) || {};
  c.check("夕方の用事を朝に済ませても、夕方の背骨は灰色（済ませたものの色が線へ漏れない）", eve.pass === 0, JSON.stringify(eve));
  c.check("物差しは、いまの時（9:00）か、まだの用事の頭（8:00）の早いほうから",
    r.line.length && r.line[0].at === 8 * 60, JSON.stringify(r.line[0]));

  if (process.env.SHOTS) {
    const el = await page.$("#screen-todo .tl");
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: `${process.env.SHOTS}/timeline.png` });
  }
  c.check("エラーなし", !errors.length, errors.join("\n"));
  await browser.close();
  c.done();
})();
