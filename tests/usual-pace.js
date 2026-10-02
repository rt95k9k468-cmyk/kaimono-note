/* 段4：自分の速さ（docs/todo-timeline.md の「自分の速さ」）。2026年9月29日。

   - store：くり返しの用事の「いつもの長さ」を、済ませた記録（写し）から引く。記録は
     増やさない。時刻を決めてあった回の「済ませた時刻 − 決めていた時刻」を、1〜240分
     だけ・新しい8回の中央値・5分に丸める。別の日に済ませた回は数えない。3回に満たな
     ければ言わない。くり返しでない用事・写しそのものには言わない。記録が増えれば変わる。
   - plan：長さを決めていないくり返しの用事は、30分の代わりにいつもの長さで並べる。
     人が決めた長さがあれば、そちら。
   - 画面：編集の紙の長さに「いつもの25分」の札（押すまで決めない）と「いつもの長さで」。
     道の上で決める紙に「いつもは15分くらい」。道には描かない（停留所は点のまま）。
     評価の言葉・絵文字なし。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/usual-pace.js */
const { open, checker } = require("./lib");

const DAY = "2026-09-29";
const BAN = /遅れ|予定通り|達成|未達|速い|遅い|前より|短くなった|長くなった|できなかった|%|％/;

(async () => {
  const c = checker("usual-pace");
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 8, 29, 7, 43)); },
  });

  /* ---- store と plan ---- */
  const st = await page.evaluate((day) => {
    const S = KN.store, U = KN.util;
    const at = (d, h, m) => new Date(2026, 8, d, h, m).toISOString();
    const trace = (title, d, time, doneAt, part) => ({
      id: U.uid("t"), title, due: `2026-09-${String(d).padStart(2, "0")}`, time, minutes: null, part: part || null,
      repeat: null, repeatDays: [], repeatNth: null, repeatEvery: null, done: true, doneAt,
      archived: false, archivedAt: null, trace: true, subs: [], subState: {}, order: 0,
    });
    S.update((s) => { s.todos = []; });
    const med = S.addTodo({ title: "薬", due: day, time: "09:00", repeat: "daily" });
    const gym = S.addTodo({ title: "体操", due: day, repeat: "daily" });
    const one = S.addTodo({ title: "薬", due: day, time: "11:00" });   // くり返しでない同じ題
    const two = S.addTodo({ title: "掃除", due: day, repeat: "daily" });
    S.update((s) => {
      s.todos.push(
        trace("薬", 20, "09:00", at(20, 9, 20)),
        trace("薬", 21, "09:00", at(21, 9, 25)),
        trace("薬", 22, "09:00", at(22, 9, 30)),
        trace("薬", 23, "09:00", at(23, 9, 25)),
        trace("薬", 24, "09:00", at(24, 12, 0)),    // 180分：あとでまとめて。中央値が吸う
        trace("薬", 25, "09:00", at(25, 14, 30)),   // 330分：範囲の外
        trace("薬", 26, "09:00", at(27, 9, 10)),    // 別の日に済ませた
        trace("薬", 27, "09:00", at(27, 8, 50)),    // 決めた時刻より前
        trace("体操", 20, "18:00", at(20, 18, 10)),
        trace("体操", 21, "18:00", at(21, 18, 15)),
        trace("体操", 22, "18:00", at(22, 18, 17)),
        trace("掃除", 21, "10:00", at(21, 10, 40)),
        trace("掃除", 22, "10:00", at(22, 10, 45)),
      );
    });
    const g = (id) => S.getTodo(id);
    const out = {
      med: S.usualMinutes(g(med.id)), gym: S.usualMinutes(g(gym.id)),
      one: S.usualMinutes(g(one.id)), two: S.usualMinutes(g(two.id)),
      trace: S.usualMinutes(S.get().todos.find((t) => t.trace)),
      planMed: KN.plan.minutesOf(g(med.id)), planOne: KN.plan.minutesOf(g(one.id)),
    };
    const plan = KN.plan.buildDay(day, S.get().todos.filter((t) => t.due === day && !t.trace), { now: null });
    const it = plan.items.find((x) => x.todo && x.todo.id === med.id);
    out.until = it ? KN.plan.toTime(it.untilMin) : null;
    // 三回目がたまると、言えるようになる
    S.update((s) => { s.todos.push(trace("掃除", 23, "10:00", at(23, 10, 35))); });
    out.two3 = S.usualMinutes(g(two.id));
    // 人が決めた長さがあれば、そちら
    S.updateTodo(med.id, { minutes: 45 });
    out.planDecided = KN.plan.minutesOf(g(med.id));
    S.updateTodo(med.id, { minutes: null });
    out.saved = JSON.stringify(g(med.id)).includes("usual");
    return { ...out, ids: { med: med.id, gym: gym.id } };
  }, DAY);
  c.check("いつもの長さ：中央値25分（範囲の外・別の日・前に済ませた回は数えない）", st.med === 25, JSON.stringify(st));
  c.check("三回ぶんで言える（10・15・17分 → 15分）", st.gym === 15, String(st.gym));
  c.check("くり返しでない同じ題には言わない", st.one === null, String(st.one));
  c.check("二回だけでは言わない", st.two === null, String(st.two));
  c.check("記録が増えれば言える（40・45・35分 → 40分）", st.two3 === 40, String(st.two3));
  c.check("写しそのものには言わない", st.trace === null);
  c.check("plan：決めていない長さはいつもの長さ／くり返しでなければ30分", st.planMed === 25 && st.planOne === 30,
    `${st.planMed} ${st.planOne}`);
  c.check("plan：9:00 の薬は 9:25 まで", st.until === "09:25", String(st.until));
  c.check("plan：人が決めた長さが先", st.planDecided === 45, String(st.planDecided));
  c.check("記録を増やさない（用事に新しい欄を書かない）", !st.saved);

  /* ---- 画面 ---- */
  await page.click('.tab[data-tab="todo"]');
  await page.waitForTimeout(700);

  const road = await page.evaluate((id) => {
    const r = document.querySelector("#screen-todo .day-road");
    if (!r || !r.__road) return null;
    return { text: r.textContent };
  }, st.ids.med);
  c.check("道が出ている", !!road);
  c.check("道には長さを描かない（いつもの、は道に出ない）", !!road && !/いつも/.test(road.text), road && road.text);

  /* 編集の紙 */
  await page.locator("#screen-todo .road-label", { hasText: "薬" }).first().click();
  await page.waitForTimeout(700);
  /* 時間の札も終わりの時刻も「時刻」の紙（2026年10月2日に一枚へ） */
  const durRow = await page.evaluate(() => {
    const r = [...document.querySelectorAll(".sheet.is-open .js-row-time")].pop();
    return r ? r.textContent : "";
  });
  await page.locator(".sheet.is-open .js-row-time").last().click();
  await page.waitForTimeout(700);
  const ed = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].reverse().find((x) => x.querySelector(".js-mins"));
    if (!sh) return null;
    const chips = [...sh.querySelectorAll(".js-mins button")].map((b) => ({
      label: b.textContent.trim(), on: b.classList.contains("is-active") || b.getAttribute("aria-pressed") === "true",
    }));
    const n = sh.querySelector(".js-span-note");
    return { chips, text: sh.textContent, note: n ? n.textContent : "" };
  });
  c.check("「時間」の札に「25分（いつもの長さ）」", /25分（いつもの長さ）/.test(durRow), durRow);
  const labels = ed ? ed.chips.map((x) => x.label) : [];
  c.check("長さの札に「いつもの25分」が「決めない」の次", labels[0] === "決めない" && labels[1] === "いつもの25分",
    JSON.stringify(labels.slice(0, 4)));
  c.check("決めないが選ばれたまま（黙って決めない）", !!ed && ed.chips[0].on && !ed.chips[1].on, ed && JSON.stringify(ed.chips.slice(0, 2)));
  c.check("時刻の下に「9:00 〜 9:25」と「いつもの長さ」", !!ed && /9:00 〜 9:25/.test(ed.note) && /いつもの長さ/.test(ed.note),
    ed && ed.note);
  c.check("編集の紙も評価しない・絵文字なし", !!ed && !BAN.test(ed.text) && !/\p{Extended_Pictographic}/u.test(ed.text));
  for (let i = 0; i < 3 && await page.locator(".sheet.is-open").count(); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  /* 道の上で決める紙 */
  const xy = await page.evaluate(() => {
    const r = document.querySelector("#screen-todo .day-road");
    const G = r.__road.g, p = G.point(G.dist(15 * 60 + 30));
    const m = r.querySelector(".road-map").getBoundingClientRect();
    const k = m.width / KN.dayRoad.W;
    return { x: m.left + p.x * k, y: m.top + p.y * k };
  });
  await page.mouse.click(xy.x, xy.y);
  await page.waitForTimeout(700);
  const ds = await page.evaluate(() => {
    const sh = [...document.querySelectorAll(".sheet.is-open")].pop();
    if (!sh || !sh.querySelector(".road-decide")) return null;
    return {
      rows: [...sh.querySelectorAll(".road-pick")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
      text: sh.textContent,
    };
  });
  c.check("決める紙：体操に「いつもは15分くらい」", !!ds && ds.rows.some((r) => /体操/.test(r) && /いつもは15分くらい/.test(r)),
    ds && JSON.stringify(ds.rows));
  c.check("決める紙：三回目がたまった掃除に「いつもは40分くらい」", !!ds && ds.rows.some((r) => /掃除/.test(r) && /いつもは40分くらい/.test(r)),
    ds && JSON.stringify(ds.rows));
  c.check("決める紙も評価しない・絵文字なし", !!ds && !BAN.test(ds.text) && !/\p{Extended_Pictographic}/u.test(ds.text));

  c.check("ページの例外なし", errors.length === 0, errors.join("\n"));
  await browser.close();
  c.done();
})();
