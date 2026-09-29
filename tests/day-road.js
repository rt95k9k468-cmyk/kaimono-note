/* 一日の道（2026年9月29日、docs/todo-timeline.md の「一日の道」）。
   前半は道の寸法（geom）：時刻→長さが単調・折り返しは時間を持たない・区間の終わりは
   曲がり角を回り込まない・道筋は曲がり角を四分の一ずつ描く。
   後半は画面：時計を 7:43 に止め、手描きと同じ一日（朝のルーティン・朝のBaby・病院・
   夜のルーティン）に、時刻なしの三件・済ませた一件・毎晩の時刻なしを置く。
   - 時刻を決めたものは停留所（札に「ごろ」なし）、毎晩の時刻なしは点線のふちと「ごろ」
   - 時刻なしは連れ：人の頭の高さ（道の上ではない）、人の後ろに並ぶ
   - 人は 7:43 の点に立ち、歩いたぶんの道はそこまで・済ませた一件は 6:50 に足あと
   - 次の一行「次は 8:00 朝のBaby · あと17分」
   - 札・連れを押すと、その用事の紙が開く
   - 戻ってきたら（visibilitychange）すぐ「いま」が動く：道の人も、時間割の「いま」も
   - 空いた道を押すと 15分きざみの時刻と前後の空き、時刻なしから選ぶと停留所になる（段2）。
     元に戻せる・入力欄なし・歩いたぶんと過ぎた日は押せない
   - 時刻と長さを変えると、停留所が動き、長さが倍になる
   - 過ぎた日：人・連れ・次の一行なし、道ぜんぶが歩いたあと。先の日：歩いたぶんなし
   - 設定で外せる。紙の上で本物の指で横に払えば、日が動く
   - 評価の言葉・割合・絵文字を出さない
   `SHOTS=<置き場>` で道を撮る。 */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";

(async () => {
  const c = checker("day-road");
  const { browser, ctx, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 7, 43)); },
  });

  /* ---------------- 前半：寸法 ---------------- */
  const g = await page.evaluate(() => {
    const G = KN.dayRoad.geom(300, 1380);          // 5:00〜23:00
    const ts = [];
    for (let t = 300; t <= 1380; t += 5) ts.push(G.dist(t));
    const d = G.path(0, G.total);
    return {
      rows: G.rows, rowSpan: G.rowSpan,
      mono: ts.every((v, i) => i === 0 || v >= ts[i - 1]),
      head10: G.dist(600), tail10: G.dist(600, true),
      p10: G.point(G.dist(600)), e10: G.point(G.dist(600, true)),
      arcs: (d.match(/A/g) || []).length,
      total: G.total, end: G.point(G.total),
      p1300: G.point(G.dist(780)),
    };
  });
  c.check("5:00〜23:00 は一段5時間の四段", g.rows === 4 && g.rowSpan === 300, JSON.stringify(g));
  c.check("時刻が進めば、道の上も進む（戻らない）", g.mono);
  c.check("折り返しは時間を持たない：10:00 は段の尻と次の段の頭の両方",
    g.head10 > g.tail10 && Math.abs(g.p10.y - g.e10.y) > 60 && Math.abs(g.p10.x - g.e10.x) < 0.5,
    JSON.stringify([g.p10, g.e10]));
  c.check("道筋は曲がり角を四分の一ずつ（三つの角で6つ）", g.arcs === 6, String(g.arcs));
  c.check("最後の段は余ったぶんだけで、道はそこで終わる", g.end.row === 3 && g.end.x > 60, JSON.stringify(g.end));
  c.check("二段目は右から左へ（13:00 は段の左寄り）", g.p1300.row === 1 && !g.p1300.ltr && g.p1300.x < 180,
    JSON.stringify(g.p1300));

  /* ---------------- 後半：画面 ---------------- */
  const ids = await page.evaluate((day) => {
    const s = KN.store;
    const at = (h, m) => new Date(2026, 8, 29, h, m).toISOString();
    const o = {};
    o.routine = s.addTodo({ title: "朝のルーティン", due: day, time: "05:30", minutes: 60, repeat: "daily",
      subs: ["顔", "歯", "水", "薬"].map((x) => ({ title: x })) }).id;
    o.baby = s.addTodo({ title: "朝のBaby", due: day, time: "08:00", minutes: 240, repeat: "daily" }).id;
    o.clinic = s.addTodo({ title: "病院", due: day, time: "13:00", minutes: 90 }).id;
    o.night = s.addTodo({ title: "夜のルーティン", due: day, time: "21:00", minutes: 60, repeat: "daily" }).id;
    o.mail = s.addTodo({ title: "メール", due: day }).id;
    o.tidy = s.addTodo({ title: "片付け", due: day }).id;
    o.shop = s.addTodo({ title: "買い物", due: day, minutes: 30 }).id;
    o.wash = s.addTodo({ title: "洗濯", due: day }).id;
    o.stretch = s.addTodo({ title: "ストレッチ", due: day, part: "dusk" }).id;
    s.update((st) => { const x = st.todos.find((y) => y.id === o.wash); x.done = true; x.doneAt = at(6, 50); });
    return o;
  }, DAY);
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);

  const read = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    if (!road) return null;
    const st = road.__road;
    const map = road.querySelector(".road-map").getBoundingClientRect();
    const k = map.width / KN.dayRoad.W;
    const me = road.querySelector(".road-me");
    const tf = (me.getAttribute("transform") || "").match(/translate\(([-\d.]+) ([-\d.]+)\)/);
    const beads = [...road.querySelectorAll(".road-bead")].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute("aria-label"), x: (r.left + r.width / 2 - map.left) / k,
               y: (r.top + r.height / 2 - map.top) / k };
    });
    return {
      cls: road.className,
      labels: [...road.querySelectorAll(".road-label")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
      later: road.querySelectorAll(".road-stop.is-later").length,
      stops: road.querySelectorAll(".road-stop[data-s]").length,
      live: [...road.querySelectorAll(".road-stop[data-s]")].map((s) => s.classList.contains("is-live")),
      stopWent: [...road.querySelectorAll(".road-stop[data-s] .road-stop-went")].map((p) => !!p.getAttribute("d")),
      went: road.querySelector(".road-went").getAttribute("d") || "",
      base: road.querySelector(".road-base").getAttribute("d"),
      meShown: me.style.display !== "none",
      me: tf ? { x: Number(tf[1]), y: Number(tf[2]) } : null,
      beads,
      steps: [...road.querySelectorAll(".road-step")].map((s) => ({ x: +s.getAttribute("cx"), y: +s.getAttribute("cy") })),
      next: (road.querySelector(".road-next") || { textContent: null }).textContent,
      text: road.textContent,
      nowTl: ((document.querySelector("#screen-todo .tl-now") || {}).textContent || "").trim(),
      H: st.g.H,
    };
  });
  const pointOf = (min) => page.evaluate((m) => {
    const st = document.querySelector("#screen-todo .day-road").__road;
    return st.g.point(st.g.dist(m));
  }, min);

  let r = await read();
  c.check("やることの紙の頭に、一日の道がある", !!r && /is-today/.test(r.cls), r && r.cls);
  c.check("時刻を決めた四つが停留所", r.stops === 4, String(r.stops));
  c.check("停留所の札は「時刻 題」で「ごろ」なし",
    ["5:30", "8:00", "13:00", "21:00"].every((t) => r.labels.some((l) => l.includes(t) && !l.includes("ごろ")))
    && r.labels.some((l) => l.includes("朝のBaby")) && r.labels.some((l) => l.includes("病院")),
    JSON.stringify(r.labels));
  c.check("毎晩の時刻なしは、点線のふちと「ごろ」", r.later === 1 && r.labels.some((l) => /ごろ/.test(l) && l.includes("ストレッチ")),
    JSON.stringify(r.labels));

  const p743 = await pointOf(7 * 60 + 43);
  c.check("人は 7:43 の点に立つ", r.meShown && r.me && Math.abs(r.me.x - p743.x) < 0.3 && r.me.y < p743.y,
    JSON.stringify([r.me, p743]));
  c.check("連れは三件（時刻なしの、まだのもの）",
    r.beads.length === 3 && ["メール", "片付け", "買い物"].every((w) => r.beads.some((b) => b.label.includes(w))),
    JSON.stringify(r.beads));
  c.check("連れは道の上ではなく、人の頭の高さ", r.beads.every((b) => b.y < p743.y - 12 && b.y > p743.y - 30),
    JSON.stringify(r.beads.map((b) => b.y)) + " / " + p743.y);
  c.check("連れは人の後ろ（一段目は右へ進むので、左）", r.beads.every((b) => b.x < p743.x - 8),
    JSON.stringify(r.beads.map((b) => b.x)) + " / " + p743.x);
  const p650 = await pointOf(6 * 60 + 50);
  c.check("済ませた洗濯は 6:50 の道の上に足あと",
    r.steps.length === 1 && Math.abs(r.steps[0].x - p650.x) < 0.3 && Math.abs(r.steps[0].y - p650.y) < 0.3,
    JSON.stringify([r.steps, p650]));
  c.check("歩いたぶんの道は、人の足もとまで", /L([-\d.]+) ([-\d.]+)$/.test(r.went)
    && Math.abs(Number(r.went.match(/L([-\d.]+) [-\d.]+$/)[1]) - p743.x) < 0.3, r.went);
  c.check("過ぎたルーティンは塗り、先の三つは白いまま", JSON.stringify(r.stopWent) === "[true,false,false,false]",
    JSON.stringify(r.stopWent));
  c.check("次の一行「次は 8:00 朝のBaby · あと17分」",
    /次は\s*8:00 朝のBaby/.test(r.next) && /あと17分/.test(r.next), r.next);

  if (process.env.SHOTS) {
    const box = await page.locator("#screen-todo .day-road").boundingBox();
    await page.screenshot({ path: `${process.env.SHOTS}/day-road-0743.png`, clip: box });
  }

  /* 押すと、その用事の紙が開く（札・連れ） */
  const sheetTitle = async () => {
    await page.waitForTimeout(700);
    const t = await page.evaluate(() => {
      const sh = document.querySelector(".sheet.is-open");
      if (!sh) return null;
      const f = sh.querySelector("textarea, input[type=text]");
      return f ? f.value : sh.textContent;
    });
    await page.evaluate(() => KN.ui.closeAll && KN.ui.closeAll());
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    return t;
  };
  await page.locator("#screen-todo .road-label", { hasText: "病院" }).click();
  const t1 = await sheetTitle();
  c.check("停留所の札を押すと、その用事の紙が開く", !!t1 && t1.includes("病院"), String(t1).slice(0, 60));
  await page.locator('#screen-todo .road-bead[aria-label^="片付け"]').click();
  const t2 = await sheetTitle();
  c.check("連れを押すと、その用事の紙が開く", !!t2 && t2.includes("片付け"), String(t2).slice(0, 60));

  /* 道の上で決める（段2）：空いた道を押すと、その時刻（15分きざみ）と前後の空き。
     時刻を決めていないものから一つ選ぶと、その時刻が付いて停留所になる。 */
  const tapAt = async (min, tail) => {
    const xy = await page.evaluate(([m, tl]) => {
      const road = document.querySelector("#screen-todo .day-road");
      const G = road.__road.g, p = G.point(G.dist(m, tl));
      const r = road.querySelector(".road-map").getBoundingClientRect();
      const k = r.width / KN.dayRoad.W;
      return { x: r.left + p.x * k, y: r.top + p.y * k };
    }, [min, !!tail]);
    await page.mouse.click(xy.x, xy.y);
    await page.waitForTimeout(700);
  };
  const decideSheet = () => page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    if (!sh || !sh.querySelector(".road-decide")) return null;
    return {
      title: sh.querySelector(".sheet-title").textContent.trim(),
      gap: (sh.querySelector(".road-gap") || { textContent: "" }).textContent.replace(/\s+/g, " ").trim(),
      picks: [...sh.querySelectorAll(".road-pick .act-label")].map((x) => x.textContent.trim()),
      inputs: sh.querySelectorAll("input, textarea, [contenteditable]").length,
      text: sh.textContent,
    };
  });
  await tapAt(15 * 60 + 52);
  let ds = await decideSheet();
  c.check("空いた道（15:52）を押すと、15分きざみの 15:45 の紙", !!ds && ds.title === "15:45", JSON.stringify(ds));
  c.check("前後の空き「14:30〜21:00 空き6時間30分」", !!ds && /14:30〜21:00/.test(ds.gap) && /空き6時間30分/.test(ds.gap),
    ds && ds.gap);
  c.check("選べるのは時刻を決めていないもの（連れ三件と、毎晩の一件）",
    !!ds && ds.picks.length === 4 && ["メール", "片付け", "買い物", "ストレッチ"].every((w) => ds.picks.includes(w)),
    ds && JSON.stringify(ds.picks));
  c.check("決める紙に入力欄は無い", !!ds && ds.inputs === 0, ds && String(ds.inputs));
  c.check("決める紙も評価しない・絵文字なし",
    !!ds && !/遅れ|予定通り|達成|未達|埋め|もったいない|%|％/.test(ds.text) && !/\p{Extended_Pictographic}/u.test(ds.text),
    ds && ds.text);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/day-road-decide.png` });
  await page.locator(".sheet.is-open .road-pick", { hasText: "片付け" }).click();
  await page.waitForTimeout(800);
  const tidy = await page.evaluate((id) => KN.store.get().todos.find((x) => x.id === id), ids.tidy);
  r = await read();
  c.check("選ぶと 15:45 が付き、やる日はその日", tidy.time === "15:45" && tidy.due === DAY, JSON.stringify([tidy.time, tidy.due]));
  c.check("道の上に停留所「15:45 片付け」が立ち、連れは二件に",
    r.stops === 5 && r.labels.some((l) => l.includes("15:45") && l.includes("片付け")) && r.beads.length === 2,
    JSON.stringify([r.stops, r.labels, r.beads.length]));
  await page.locator(".toast button", { hasText: "元に戻す" }).click();
  await page.waitForTimeout(600);
  const tidy2 = await page.evaluate((id) => KN.store.get().todos.find((x) => x.id === id), ids.tidy);
  r = await read();
  c.check("「元に戻す」で時刻が外れ、連れに戻る", !tidy2.time && r.stops === 4 && r.beads.length === 3,
    JSON.stringify([tidy2.time, r.stops, r.beads.length]));

  /* 停留所と停留所のあいだ：12:40 → 12:45（12:00〜13:00 の空き） */
  await tapAt(12 * 60 + 40);
  ds = await decideSheet();
  c.check("あいだの空き（12:40 → 12:45、12:00〜13:00 空き1時間）",
    !!ds && ds.title === "12:45" && /12:00〜13:00/.test(ds.gap) && /空き1時間$/.test(ds.gap), JSON.stringify(ds));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const sn = await page.evaluate(() => [KN.dayRoad.snap(775, 720, 780), KN.dayRoad.snap(725, 720, 780),
    KN.dayRoad.snap(470, 463, 480), KN.dayRoad.snap(1375, 1290, 1380)]);
  c.check("15分に丸める。空きの尻（次の停留所の頭・一日の終わり）へは丸めず、頭は空きの中へ",
    JSON.stringify(sn) === "[765,720,465,1365]", JSON.stringify(sn));
  /* 歩いたぶんの道（7:00）は押しても何も開かない */
  await tapAt(7 * 60);
  c.check("歩いたぶんの道は、押しても決める紙を出さない",
    await page.evaluate(() => !document.querySelector(".sheet.is-open")));
  const freeD = () => page.evaluate(() => document.querySelector("#screen-todo .day-road .road-free").getAttribute("d"));
  c.check("決められる道は、人の足もとから", /^M([-\d.]+) /.test(await freeD())
    && Math.abs(Number((await freeD()).match(/^M([-\d.]+) /)[1]) - p743.x) < 0.3, await freeD());

  /* 戻ってきたら、すぐ「いま」が動く（30秒の見回りを待たない） */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 13, 40));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(400);
  r = await read();
  const p1340 = await pointOf(13 * 60 + 40);
  c.check("戻ってきたら、道の人がすぐ 13:40 へ", r.me && Math.abs(r.me.x - p1340.x) < 0.3, JSON.stringify([r.me, p1340]));
  c.check("戻ってきたら、時間割の「いま」もすぐ 13:40", r.nowTl === "13:40", String(r.nowTl));
  c.check("病院の途中：停留所は is-live、次の一行は「いまは 病院（14:30まで）」",
    r.live[2] === true && /いまは\s*病院（14:30まで）/.test(r.next), JSON.stringify([r.live, r.next]));
  c.check("二段目は左へ進むので、連れは人の右", r.beads.every((b) => b.x > p1340.x + 8),
    JSON.stringify(r.beads.map((b) => b.x)) + " / " + p1340.x);
  if (process.env.SHOTS) {
    const box = await page.locator("#screen-todo .day-road").boundingBox();
    await page.screenshot({ path: `${process.env.SHOTS}/day-road-1340.png`, clip: box });
  }

  /* 今日の空きは、いまから：16:10 に 17:02 を押す → 17:00（16:10〜21:00 空き4時間50分） */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 16, 10));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(400);
  await tapAt(17 * 60 + 2);
  ds = await decideSheet();
  c.check("今日の空きは、いまから次の停留所まで（16:10〜21:00 空き4時間50分）",
    !!ds && ds.title === "17:00" && /16:10〜21:00/.test(ds.gap) && /空き4時間50分/.test(ds.gap), JSON.stringify(ds));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.clock.setFixedTime(new Date(2026, 8, 29, 13, 40));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(400);

  /* 時刻と長さを変えると、停留所が動き、長さが倍になる */
  const len = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const i = road.__road.stops.findIndex((s) => s.t.title === "病院");
    const p = road.querySelectorAll(".road-stop[data-s] .road-stop-edge")[i];
    return { len: p.getTotalLength(), at: road.__road.stops[i].at };
  });
  const before = await len();
  await page.evaluate((id) => KN.store.update((st) => {
    const x = st.todos.find((y) => y.id === id); x.time = "11:00"; x.minutes = 180;
  }), ids.clinic);
  await page.waitForTimeout(400);
  const after = await len();
  r = await read();
  c.check("時刻を 13:00→11:00 に変えると、停留所の札も 11:00", after.at === 660 && r.labels.some((l) => l.includes("11:00") && l.includes("病院")),
    JSON.stringify([after, r.labels]));
  c.check("長さを 90→180分にすると、区間の長さが倍", Math.abs(after.len / before.len - 2) < 0.02,
    `${before.len.toFixed(1)} → ${after.len.toFixed(1)}`);

  /* 過ぎた日・先の日 */
  const goDay = async (d) => {
    await page.evaluate((x) => KN.screens.todo.goDay(x), d);
    await page.waitForTimeout(900);
  };
  await page.evaluate((day) => KN.store.addTodo({ title: "歯医者", due: "2026-09-28", time: "10:00", minutes: 30 }), DAY);
  await goDay("2026-09-28");
  r = await read();
  c.check("過ぎた日：人も連れも次の一行も無い", r && /is-past/.test(r.cls) && !r.meShown && !r.beads.length && r.next === null,
    r && JSON.stringify([r.cls, r.meShown, r.beads.length, r.next]));
  c.check("過ぎた日：道ぜんぶが歩いたあと", r.went === r.base, r.went.slice(0, 40));
  c.check("過ぎた日：停留所は塗りきり", r.stopWent.every(Boolean), JSON.stringify(r.stopWent));
  c.check("過ぎた日：道の上で決めることはできない", await freeD() === null, String(await freeD()));
  await goDay("2026-09-30");
  r = await read();
  c.check("先の日：人は立たず、歩いたぶんも無い", /is-ahead/.test(r.cls) && !r.meShown && r.went === "",
    JSON.stringify([r.cls, r.meShown, r.went]));
  c.check("先の日：くり返しのルーティンも停留所で立つ", r.labels.some((l) => l.includes("朝のルーティン")),
    JSON.stringify(r.labels));
  c.check("先の日：道ぜんぶで決められる", await freeD() === r.base, String(await freeD()).slice(0, 40));
  await goDay(DAY);

  /* 本物の指で、道の上を横に払うと日が動く */
  const title = () => page.evaluate(() => document.querySelector("#head .js-day-title").textContent.replace(/\s+/g, ""));
  const cdp = await ctx.newCDPSession(page);
  const pts = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  const box = await page.locator("#screen-todo .road-map").boundingBox();
  const sx = box.x + box.width * 0.75, sy = box.y + box.height * 0.62;
  const t0 = await title();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(sx, sy) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(sx - i * 16, sy + i) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(900);
  const t9 = await title();
  c.check("道の上を左へ払うと、次の日へ", t0.includes("29日") && t9.includes("30日"), `${t0} → ${t9}`);
  await goDay(DAY);

  /* 設定で外せる */
  await page.evaluate(() => KN.store.update((s) => { s.settings.todoRoad = false; }));
  await page.waitForTimeout(400);
  c.check("設定で外すと、道は出ない（時間割は残る）",
    await page.evaluate(() => !document.querySelector("#screen-todo .day-road")
      && !!document.querySelector("#screen-todo .tl-list")));
  await page.evaluate(() => KN.store.update((s) => { delete s.settings.todoRoad; }));
  await page.waitForTimeout(400);
  c.check("設定を持たない保存では、出る", await page.evaluate(() => !!document.querySelector("#screen-todo .day-road")));

  /* 評価しない・絵文字なし */
  r = await read();
  c.check("評価の言葉・割合を出さない", !/遅れ|予定通り|達成|未達|できなかった|%|％/.test(r.text + r.next), r.text + r.next);
  c.check("絵文字を出さない", !/\p{Extended_Pictographic}/u.test(r.text + r.next));

  c.check("ページのエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
