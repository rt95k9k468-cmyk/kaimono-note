/* 一日の道（2026年9月29日、docs/todo-timeline.md の「一日の道」）。
   前半は道の寸法（geom）：時刻→長さが単調・曲がり角も時間を持つ（どこでも同じ長さが
   同じ時間、角のまん中がちょうどの時。2026年10月2日）・道の端はまっすぐの上・道筋は
   曲がり角を四分の一ずつ描く。
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
   - 停留所の上にも目盛り。道の端はちょうどの時・はみ出す停留所まで伸びる（利用者の 6:30）
   - 時刻の重なった停留所は車線に割る・入りきらない札は「ほか n」
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
    /* 同じ一時間の長さ：まっすぐの上（9:00〜10:00）と、角をまたぐところ（7:30〜8:30）。 */
    const on = G.dist(600) - G.dist(540), across = G.dist(510) - G.dist(450);
    return {
      rows: G.rows, rowSpan: G.rowSpan, start: G.start,
      mono: ts.every((v, i) => i === 0 || v >= ts[i - 1]),
      on, across, p8: G.point(G.dist(480)), p750: G.point(G.dist(470)), p810: G.point(G.dist(490)),
      arcs: (d.match(/A/g) || []).length,
      first: G.point(G.d0), end: G.point(G.total),
      p900: G.point(G.dist(540)), p1100: G.point(G.dist(660)),
    };
  });
  c.check("5:00〜23:00 は一段4時間の五段（角も時間を持つので、六段に入るいちばん短い一段）",
    g.rows === 5 && g.rowSpan === 240, JSON.stringify(g));
  c.check("時刻が進めば、道の上も進む（戻らない）", g.mono);
  c.check("曲がり角も時間を持つ：角をまたぐ一時間も、まっすぐの一時間と同じ長さ",
    Math.abs(g.on - g.across) < 0.01 && g.on > 90, JSON.stringify([g.on, g.across]));
  c.check("角のまん中（いちばん外）がちょうどの時（8:00）、その前後は角の上",
    !!g.p8.arc && Math.abs(g.p8.x - 350) < 0.01 && Math.abs(g.p8.y - (46 + 47)) < 0.01
      && !!g.p750.arc && !!g.p810.arc && g.p750.y < g.p8.y && g.p810.y > g.p8.y,
    JSON.stringify([g.p750, g.p8, g.p810]));
  c.check("道筋は曲がり角を四分の一ずつ（四つの角で8）", g.arcs === 8, String(g.arcs));
  c.check("道の始まりと終わりはまっすぐの上（寝床がその延長に入る）",
    !g.first.arc && g.first.row === 0 && !g.end.arc && g.end.row === 4, JSON.stringify([g.first, g.end]));
  const r7 = await page.evaluate(() => { const G = KN.dayRoad.geom(420, 1320); return [G.rows, G.rowSpan, G.start, G.point(G.total)]; });
  c.check("7:00〜22:00 は一段3時間の六段（角は 9・12・15・18・21時）、最後の段は途中で終わる",
    r7[0] === 6 && r7[1] === 180 && r7[2] === 360 && r7[3].row === 5 && !r7[3].arc && r7[3].x > 60, JSON.stringify(r7));
  c.check("二段目は右から左へ（9:00 は段の右寄り、11:00 は左寄り）",
    g.p900.row === 1 && !g.p900.ltr && !g.p900.arc && g.p900.x > 180 && g.p1100.row === 1 && g.p1100.x < 180,
    JSON.stringify([g.p900, g.p1100]));

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
  /* 7:43 は一つ目の角の上（角も時間を持つ）なので、道筋の尻は L でも A でもよい。 */
  c.check("歩いたぶんの道は、人の足もとまで", /([-\d.]+) ([-\d.]+)$/.test(r.went)
    && Math.abs(Number(r.went.match(/([-\d.]+) [-\d.]+$/)[1]) - p743.x) < 0.3, r.went);
  c.check("過ぎたルーティンは塗り、先の三つは白いまま", JSON.stringify(r.stopWent) === "[true,false,false,false]",
    JSON.stringify(r.stopWent));
  c.check("次の一行「次は 8:00 朝のBaby · あと17分」",
    /次は\s*8:00 朝のBaby/.test(r.next) && /あと17分/.test(r.next), r.next);

  /* 停留所の上の目盛り（9月29日・利用者の声「1時間ごとの切れ目がわかりにくい」）。
     道の目盛りは停留所の太い線の下に隠れていた。角は 8・12・16・20 時（10月2日から角の
     まん中にも目盛り）。ルーティン（5:30〜6:30、まだなので 9月30日から人の足もと 7:43 まで
     延びる）の 6:00・7:00 は塗りの上の白、朝のBaby（8:00〜12:00、まだ）の 9:00・10:00・
     11:00 と病院（13:00〜14:30）の 14:00 は白い中の塗りの色。 */
  const ticksOn = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const n = (sel) => road.querySelectorAll(sel + " text").length;
    return { over: n(".road-hours.is-over"), ink: n(".road-hours.is-ink") };
  });
  /* 端ちょうどの時（8:00・12:00・13:00 ほか）は、位置を動かさず縁取りの層（is-rim）に
     （10月2日・「線上の時刻の数値は絶対に動かさないで」）。 */
  c.check("停留所の上にも時の数字（10月2日から目盛りの代わり）：塗った上に白が二つ（6:00・延びた 7:00）、まだの白い中に塗りの色が四つ（9:00・10:00・11:00・14:00）",
    ticksOn.over === 2 && ticksOn.ink === 4, JSON.stringify(ticksOn));
  /* 停留所の上の数字は、道の上の数字と同じ位置（ずらさない）。 */
  const moved = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const G = road.__road.g;
    return [...road.querySelectorAll(".road-hours text")].filter((x) => {
      const p = G.point(G.dist(Number(x.getAttribute("data-t"))), 0);
      return Math.abs(Number(x.getAttribute("x")) - p.x) > 0.11 || Math.abs(Number(x.getAttribute("y")) - p.y) > 0.11;
    }).map((x) => x.getAttribute("data-t"));
  });
  c.check("時の数字はどの層でも道の上の位置から動かさない", moved.length === 0, JSON.stringify(moved));
  const sizes = await page.evaluate(() => [...new Set([...document.querySelectorAll("#screen-todo .day-road .road-hours text")]
    .map((x) => x.getAttribute("font-size")))]);
  c.check("時の数字は全部同じ大きさ（角の二桁だけ小さくしない）", sizes.length === 1, JSON.stringify(sizes));
  /* 停留所の端ちょうどの数字は、下の道のぶんを隠している（二重に出ない）。 */
  const dup = await page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const shown = (sel) => [...road.querySelectorAll(sel + " text")].filter((x) => getComputedStyle(x).display !== "none")
      .map((x) => x.getAttribute("data-t"));
    const base = shown(".road-hours:not(.is-over):not(.is-ink):not(.is-rim)");
    const top = shown(".road-hours.is-over").concat(shown(".road-hours.is-ink"), shown(".road-hours.is-rim"));
    return base.filter((t) => top.includes(t));
  });
  c.check("同じ時の数字が二重に出ない", dup.length === 0, JSON.stringify(dup));

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
  /* 歩いたぶんの道（5:10）は押しても何も開かない。5:30〜7:43 は、まだの朝のルーティンが
     人の足もとまで延びて（9月30日）停留所になっているので、その手前で押す。 */
  await tapAt(5 * 60 + 10);
  c.check("歩いたぶんの道は、押しても決める紙を出さない",
    await page.evaluate(() => !document.querySelector(".sheet.is-open")));
  const freeD = () => page.evaluate(() => document.querySelector("#screen-todo .day-road .road-free").getAttribute("d"));
  c.check("決められる道は、人の足もとから", /^M([-\d.]+) /.test(await freeD())
    && Math.abs(Number((await freeD()).match(/^M([-\d.]+) /)[1]) - p743.x) < 0.3, await freeD());

  /* 戻ってきたら、すぐ「いま」が動く（30秒の見回りを待たない） */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 14, 20));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(400);
  r = await read();
  const p1420 = await pointOf(14 * 60 + 20);
  c.check("戻ってきたら、道の人がすぐ 14:20 へ", r.me && Math.abs(r.me.x - p1420.x) < 0.3, JSON.stringify([r.me, p1420]));
  c.check("戻ってきたら、時間割の「いま」もすぐ 14:20", r.nowTl === "14:20", String(r.nowTl));
  c.check("病院の途中：停留所は is-live、次の一行は「いまは 病院（14:30まで）」",
    r.live[2] === true && /いまは\s*病院（14:30まで）/.test(r.next), JSON.stringify([r.live, r.next]));
  c.check("三段目は右へ進むので、連れは人の左", r.beads.every((b) => b.x < p1420.x - 8),
    JSON.stringify(r.beads.map((b) => b.x)) + " / " + p1420.x);
  if (process.env.SHOTS) {
    const box = await page.locator("#screen-todo .day-road").boundingBox();
    await page.screenshot({ path: `${process.env.SHOTS}/day-road-1420.png`, clip: box });
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
  await page.clock.setFixedTime(new Date(2026, 8, 29, 14, 20));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(400);

  /* 時刻と長さを変えると、停留所が動き、長さが倍になる */
  const len = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const i = road.__road.stops.findIndex((s) => s.t.title === "病院");
    const p = road.querySelectorAll(".road-stop[data-s] .road-stop-edge")[i];
    /* 道筋は両端で太さの半分ずつ内へ詰めてある（丸い端の外がちょうど始まりと
       終わり。9月30日）ので、見える長さは道筋 + 太さ（16）。 */
    return { len: p.getTotalLength() + 16, at: road.__road.stops[i].at };
  });
  /* 角も時間を持つので（10月2日）、角をまたいでも長さは時間に比例する——ただし車線に
     割れると角の内回り・外回りで長さが変わるので、朝のBaby（8:00〜12:00）と重ならない
     12:00（左の角のまん中）へ動かして比べる。14:20 のままだと 12:00〜 は過ぎていて
     人の足もとまで延びる（9月30日）ので、時計を 9:00 にして比べる。 */
  await page.clock.setFixedTime(new Date(2026, 8, 29, 9, 0));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(400);
  await page.evaluate((id) => KN.store.update((st) => {
    const x = st.todos.find((y) => y.id === id); x.time = "12:00";
  }), ids.clinic);
  await page.waitForTimeout(400);
  const before = await len();
  await page.evaluate((id) => KN.store.update((st) => {
    const x = st.todos.find((y) => y.id === id); x.minutes = 180;
  }), ids.clinic);
  await page.waitForTimeout(400);
  const after = await len();
  r = await read();
  c.check("時刻を 13:00→12:00 に変えると、停留所の札も 12:00", after.at === 720 && r.labels.some((l) => l.includes("12:00") && l.includes("病院")),
    JSON.stringify([after, r.labels]));
  const capAt = await page.evaluate(() => {
    const road = [...document.querySelectorAll(".day-road")].find((x) => x.offsetParent);
    const st = road.__road, i = st.stops.findIndex((s) => s.t.title === "病院");
    const s = st.stops[i], p = road.querySelectorAll(".road-stop[data-s] .road-stop-edge")[i];
    const a = p.getPointAtLength(0), b = p.getPointAtLength(p.getTotalLength());
    const q0 = st.g.point(s.d0, s.off), q1 = st.g.point(s.d1, s.off);
    return [Math.hypot(a.x - q0.x, a.y - q0.y), Math.hypot(b.x - q1.x, b.y - q1.y)];
  });
  c.check("停留所の丸い端の外が、ちょうど始まりと終わり（道筋は太さの半分ずつ内）",
    capAt.every((v) => Math.abs(v - 8) < 0.2), JSON.stringify(capAt));
  c.check("長さを 90→180分にすると、区間の長さが倍（角をまたいでも）", Math.abs(after.len / before.len - 2) < 0.02,
    `${before.len.toFixed(1)} → ${after.len.toFixed(1)}`);
  await page.clock.setFixedTime(new Date(2026, 8, 29, 14, 20));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(400);

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
  c.check("過ぎた日：道は塗らず「これから」の薄い色のまま（9月29日）", r.went === "", String(r.went).slice(0, 40));
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

  /* 角ちょうどで終わる区間（R17）：7:00〜8:00 が段の終わりで曲がると、角の「8:00」と
     区間の終わりの「8:00」が上下に二つ並んでいた。先の日（人が居ない）に、最初の角で
     終わる1時間の用事を置いて、その時刻の札が一つだけかを見る。 */
  const FAR = "2026-10-02";
  await goDay(FAR);
  const corner = await page.evaluate(() => {
    const g = document.querySelector("#screen-todo .day-road").__road.g;
    return g.start + g.rowSpan;
  });
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  await page.evaluate(([d, t]) => KN.store.addTodo({ title: "角で終わる用事", due: d, time: t, minutes: 60 }),
    [FAR, hm(corner - 60)]);
  await page.waitForTimeout(500);
  const turnSaid = await page.evaluate((cm) => {
    const road = document.querySelector("#screen-todo .day-road");
    const g = road.__road.g;
    const txt = `${Math.floor(cm / 60)}:${String(cm % 60).padStart(2, "0")}`;
    const said = [...road.querySelectorAll(".road-turn, .road-until, .road-edge, .road-label b")].map((e) => e.textContent.trim());
    return { still: g.start + g.rowSpan === cm, txt, n: said.filter((x) => x === txt).length,
      until: [...road.querySelectorAll(".road-until")].map((e) => e.textContent.trim()), said };
  }, corner);
  /* 10月2日から角の「8:00」の札は無く、道の上の時の数字（24時間表記の時だけ）が言う。 */
  const hrs = await page.evaluate(() => { const road = document.querySelector("#screen-todo .day-road");
    return { hours: [...road.querySelectorAll(".road-hours:not(.is-over):not(.is-ink):not(.is-rim) text")].map((e) => e.textContent.trim()), turns: road.querySelectorAll(".road-turn").length }; });
  c.check("角ちょうどで終わる区間：角のまん中にも時の数字、角の札は無い",
    turnSaid.still && hrs.hours.includes(String(corner / 60)) && hrs.turns === 0 && !turnSaid.until.includes(turnSaid.txt),
    JSON.stringify([turnSaid, hrs]));
  c.check("時の数字は24時間表記の時だけ（毎時、道の始まりから終わりまで）",
    hrs.hours.every((h) => /^\d{1,2}$/.test(h)) && hrs.hours.some((h) => Number(h) >= 13)
      && hrs.hours.every((h, i) => i === 0 || Number(h) === Number(hrs.hours[i - 1]) + 1), JSON.stringify(hrs.hours));
  /* 9月30日・利用者の声「時刻が書かれ過ぎていて読みにくい」：区間の終わりの時刻は出さない。 */
  c.check("区間の終わりの時刻は出さない", turnSaid.until.length === 0, JSON.stringify(turnSaid.until));

  /* 角ちょうどで始まる停留所（2026年9月29日、iPhone で「8:00」「朝のBaby 8:00」が上下に
     二つ）。同じ先の日に、二つ目の角で始まる用事を置いて、その時刻の字が札の一つだけか。 */
  const corner2 = await page.evaluate(() => { const g = document.querySelector("#screen-todo .day-road").__road.g; return g.start + 2 * g.rowSpan; });
  await page.evaluate(([d, t]) => KN.store.addTodo({ title: "角で始まる用事", due: d, time: t, minutes: 60 }), [FAR, hm(corner2)]);
  await page.waitForTimeout(500);
  const startSaid = await page.evaluate((cm) => {
    const road = document.querySelector("#screen-todo .day-road");
    const txt = `${Math.floor(cm / 60)}:${String(cm % 60).padStart(2, "0")}`;
    const turns = [...road.querySelectorAll(".road-turn")].map((e) => e.textContent.trim());
    const labels = [...road.querySelectorAll(".road-label b")].map((e) => e.textContent.trim());
    return { txt, turns, labels, other: turns.filter((x) => x !== txt).length };
  }, corner2);
  /* 角の上で始まる停留所の札は、角の内側の、丸薬の始まりの高さに（10月2日）。 */
  const arcLbl = await page.evaluate((cm) => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road, g = st.g, k = st.stops.findIndex((s) => s.t.title === "角で始まる用事");
    const b = road.querySelector(`.road-label[data-k="${k}"]`);
    const p = g.point(g.dist(cm));
    return { y: b ? parseFloat(b.style.top) / 100 * g.H : null, py: p.y, arc: !!p.arc, row: p.row,
             top: g.rowY(p.row), bot: g.rowY(p.row + 1), lo: b ? parseFloat(b.style.left) / 100 * KN.dayRoad.W : null, px: p.x };
  }, corner2);
  c.check("角ちょうどで始まる停留所：札は時刻を言い、角の札は出さない",
    startSaid.labels.includes(startSaid.txt) && startSaid.turns.length === 0, JSON.stringify(startSaid));
  c.check("角の上で始まる停留所の札は、角の内側で、丸薬の始まりの高さ",
    arcLbl.arc && Math.abs(arcLbl.y - arcLbl.py) < 1 && arcLbl.y > arcLbl.top + 10 && arcLbl.y < arcLbl.bot - 10
      && (arcLbl.row % 2 === 0 ? arcLbl.lo < arcLbl.px : arcLbl.lo > arcLbl.px), JSON.stringify(arcLbl));

  /* 道の端（9月29日・利用者の声「5:30 スタートなのに最初に 6:30 とあって、しかも
     二つ」）。起きる時刻を 6:30 にした人の 5:30 の用事が、道の頭（6:30）に点で押し
     つぶされていた。道ははみ出す停留所まで伸び、段の割りはちょうどの時へ切り下げる
     （角と目盛りが同じ「ちょうどの時」にそろう）。道そのものは 5:30 から（9月30日・
     利用者の声「5:00 じゃなく 5:30 スタートに。1行目の道が短くなってもいい」）。 */
  const EDGE = "2026-10-03";
  await page.evaluate(() => KN.store.update((s) => { s.settings.dayStart = "06:30"; s.settings.dayEnd = "22:30"; }));
  await goDay(EDGE);
  const edgeRead = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road, g = st.g;
    const early = st.stops.find((s) => s.t.title === "朝のルーティン");
    return { start: g.start, begin: g.begin, road0: g.d0, end: g.end, d0: early ? early.d0 : null, d1: early ? early.d1 : null,
             first: road.querySelector(".road-edge").textContent.trim(),
             turns: [...road.querySelectorAll(".road-hours:not(.is-over):not(.is-ink) text")].map((e) => e.textContent.trim()),
             said: [...road.querySelectorAll(".road-edge, .road-turn, .road-until")].map((e) => e.textContent.trim()) };
  });
  let edge = await edgeRead();
  c.check("起きる時刻 6:30 でも、毎日 5:30 のルーティンがあれば道は 5:30 から：点に押しつぶされず 5:30〜6:30 の区間",
    edge.begin === 330 && edge.first === "5:30" && edge.road0 > 30
      && Math.abs(edge.d0 - edge.road0) < 0.01 && edge.d1 - edge.d0 > 40, JSON.stringify(edge));
  c.check("時の数字はちょうどの時だけ（「〜:30」が混ざらない。5:30 の道は 6 から）",
    edge.turns.length > 0 && edge.turns[0] === "6" && edge.turns.every((t) => /^\d{1,2}$/.test(t)), JSON.stringify(edge.turns));
  c.check("「6:30」を二度言わない", edge.said.filter((t) => t === "6:30").length <= 1, JSON.stringify(edge.said));
  /* 早い用事の無い一日は、組み立てに直に渡して見る（この試験の日には毎日のルーティンがある）。 */
  const bare = await page.evaluate(() => {
    const el = KN.dayRoad.build({ plan: { day: "2026-10-03", startMin: 390, endMin: 1350, items: [] }, today: false });
    return { start: el.__road.g.start, begin: el.__road.g.begin, end: el.__road.g.end,
             first: el.querySelector(".road-edge").textContent.trim(),
             turns: [...el.querySelectorAll(".road-hours text")].map((e) => e.textContent.trim()) };
  });
  c.check("早い用事の無い日：起きる時刻 6:30 の道は 6:30 から、終わりは 22:30 のまま",
    bare.begin === 390 && bare.first === "6:30" && bare.end === 1350 && bare.turns[0] === "7" && bare.turns.every((t) => /^\d{1,2}$/.test(t)), JSON.stringify(bare));
  await page.evaluate((d) => KN.store.addTodo({ title: "夜ふけの用事", due: d, time: "23:00", minutes: 30 }), EDGE);
  await page.waitForTimeout(500);
  edge = await edgeRead();
  c.check("23:00〜23:30 の用事があれば、道は 23:30 まで伸びる", edge.end === 1410, JSON.stringify(edge));
  await page.evaluate(() => KN.store.update((s) => { delete s.settings.dayStart; delete s.settings.dayEnd; }));

  /* 時刻の重なった停留所は車線に（9月29日・利用者の声「今後時間が被る予定が出たら
     どうする？」）。前は同じところに重ねて描いていて、一本に見えた。
     毎日の朝のBaby（8:00〜12:00）と重ならず、角（12:00・16:00）にかからない 13:00 から
     （三段目のまっすぐ。角の上だと道筋の頭が段の高さに無いので、車線の位置を比べにくい）。 */
  const LANES = "2026-10-05";
  await goDay(LANES);
  await page.evaluate((d) => {
    KN.store.addTodo({ title: "会議", due: d, time: "13:00", minutes: 90 });
    KN.store.addTodo({ title: "電話", due: d, time: "13:30", minutes: 60 });
    KN.store.addTodo({ title: "散歩", due: d, time: "16:00", minutes: 60 });
  }, LANES);
  await page.waitForTimeout(500);
  const laneRead = () => page.evaluate(() => {
    const road = document.querySelector("#screen-todo .day-road");
    const st = road.__road, g = st.g;
    const grp = (k) => road.querySelector(`.road-stop[data-s="${k}"]`);
    const y0 = (k) => Number((grp(k).querySelector(".road-stop-edge").getAttribute("d").match(/^M[-\d.]+ ([-\d.]+)/) || [])[1]);
    return {
      stops: st.stops.map((s, k) => ({ title: s.t.title, lanes: s.lanes, y: y0(k),
        cls: grp(k).getAttribute("class"), style: grp(k).getAttribute("style") || "",
        w: getComputedStyle(grp(k).querySelector(".road-stop-edge")).strokeWidth })),
      labels: [...road.querySelectorAll(".road-label")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
      more: [...road.querySelectorAll(".road-label em")].map((e) => e.textContent.trim()),
      /* 「ほか n」を添えた札の題が、幅に収まっているか（切れていれば「…」）。 */
      moreCut: [...road.querySelectorAll(".road-label")].filter((b) => b.querySelector("em"))
        .map((b) => { const sp = b.querySelector("span"); return !sp || sp.scrollWidth > sp.clientWidth + 1; }),
      row: g.rowY(g.point(g.dist(840)).row),
    };
  });
  let ln = await laneRead();
  const by = (t) => ln.stops.find((s) => s.title === t);
  c.check("重なった二つは二車線、重ならない一つはそのまま",
    by("会議").lanes === 2 && by("電話").lanes === 2 && by("散歩").lanes === 1
      && /is-lanes/.test(by("会議").cls) && /--lanes:\s*2/.test(by("会議").style) && !/is-lanes/.test(by("散歩").cls),
    JSON.stringify(ln.stops));
  /* 9月30日・利用者の声「2つ以上重なったときも、太さを変えなくていいように」。 */
  c.check("車線に割っても太さは変えない（会議・電話・散歩が同じ太さ）",
    by("会議").w === by("散歩").w && by("電話").w === by("散歩").w, JSON.stringify(ln.stops.map((s) => [s.title, s.w])));
  /* 9月30日：長いほうが道の中心、短いほうはそれにくっついて外（進む向きの右）へ。 */
  c.check("二車線は長いほう（会議）が道の中心、短いほう（電話）がその外にくっつく（右へ進む段：下）",
    Math.abs(by("会議").y - ln.row) < 0.2 && Math.abs(by("電話").y - (ln.row + 13.5)) < 0.2,
    JSON.stringify([ln.row, by("会議").y, by("電話").y]));
  c.check("重なった二つとも札が出る", ln.labels.some((l) => l.includes("会議")) && ln.labels.some((l) => l.includes("電話")),
    JSON.stringify(ln.labels));
  const tapLane = async (min, off) => {
    const xy = await page.evaluate(([m, o]) => {
      const road = document.querySelector("#screen-todo .day-road");
      const g = road.__road.g;
      const map = road.querySelector(".road-map").getBoundingClientRect();
      const k = map.width / KN.dayRoad.W;
      const p = g.point(g.dist(m), o);
      return { x: map.left + p.x * k, y: map.top + p.y * k };
    }, [min, off]);
    await page.mouse.click(xy.x, xy.y);
    return sheetTitle();
  };
  /* 札の指の的（上下の余白）が上の車線にかかるので、札の無い 14:28 で押す。 */
  const tA = await tapLane(868, 0), tB = await tapLane(868, -13.5);
  c.check("車線を押すと、その車線の用事が開く（14:28 の中心は会議、下は電話）",
    !!tA && tA.includes("会議") && !!tB && tB.includes("電話"), JSON.stringify([tA, tB]).slice(0, 120));
  await page.evaluate((d) => {
    ["来客", "宅配", "修理"].forEach((t) => KN.store.addTodo({ title: t, due: d, time: "13:30", minutes: 30 }));
  }, LANES);
  await page.waitForTimeout(500);
  ln = await laneRead();
  const GROUP = ["会議", "電話", "来客", "宅配", "修理"];
  const inGroup = ln.labels.filter((l) => GROUP.some((t) => l.includes(t))).length;
  const moreN = ln.more.reduce((n, m) => n + Number(m.replace(/\D/g, "")), 0);
  c.check("五つ重なれば五車線", GROUP.every((t) => by(t).lanes === 5),
    JSON.stringify(ln.stops.map((s) => [s.title, s.lanes])));
  c.check("五車線でも太さは変えない", GROUP.every((t) => by(t).w === by("散歩").w),
    JSON.stringify(ln.stops.map((s) => [s.title, s.w])));
  c.check("五車線でも、いちばん長い会議が道の中心", Math.abs(by("会議").y - ln.row) < 0.2,
    JSON.stringify([ln.row, by("会議").y]));
  c.check("入りきらない札は黙って消えず、同じ群の札に「ほか n」（出た札＋ほか＝五つ）",
    ln.more.length === 1 && moreN > 0 && inGroup + moreN === 5, JSON.stringify([ln.labels, ln.more]));
  c.check("「ほか n」は込み合いのそば（13:30 の札）に付く",
    ln.labels.filter((l) => /ほか/.test(l)).every((l) => l.startsWith("13:30")), JSON.stringify(ln.labels));
  c.check("「ほか n」を添えた札も題が読める（「…」につぶれない）",
    ln.moreCut.length === 1 && !ln.moreCut[0], JSON.stringify([ln.labels, ln.moreCut]));
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
