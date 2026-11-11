/* 今日の面の物差し（js/tl-layout.js・docs/timeline-scale-design.md）。画面は開かない。
   重なり0〜4件・短い札（R3：60px・時間を持たない継ぎ目）・長さ未定・長い空きの畳み・y(分)・範囲外・畳んだ「一日の帯」と T2。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/tl-layout.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const t = checker("tl-layout");
const win = { KN: {} };
new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "tl-layout.js"), "utf8"))(win);
const L = win.KN.tlLayout.layout;
const H = (h, m = 0) => h * 60 + m;
const it = (id, a, u, known = true) => ({ id, atMin: a, untilMin: u, known });
const O = { start: H(9), end: H(18) };   // 畳みが邪魔をしない範囲で測る
const near = (a, b) => Math.abs(a - b) < 0.01;

let r = L([it("a", H(9), H(10))], O);
t.check("一件：1時間は72px・列は1", near(r.cards[0].height, 72) && r.cards[0].lanes === 1 && r.cards[0].lane === 0, JSON.stringify(r.cards));
t.check("一件：頭が0（9時＝一日の始まり）", near(r.cards[0].top, 0));

r = L([it("a", H(9), H(10)), it("b", H(10), H(11))], O);
t.check("続く二件は別の連なり（列1・1）", r.cards.every((c) => c.lanes === 1 && c.lane === 0) && near(r.cards[1].top, 72));

r = L([it("a", H(9), H(11)), it("b", H(10), H(10, 30))], O);
t.check("重なった二件は2列", r.cards.map((c) => c.lane).join() === "0,1" && r.cards.every((c) => c.lanes === 2), JSON.stringify(r.cards));
t.check("重なりの高さ：2時間＝144px＋短い札の継ぎ目・30分は60px", near(r.cards[0].height, 144 + 24) && near(r.cards[1].height, 60), JSON.stringify(r.cards));

r = L([it("a", H(9), H(12)), it("b", H(9, 30), H(10)), it("c", H(9, 45), H(10, 30))], O);
t.check("三件が重なると3列", r.cards.map((c) => c.lane).join() === "0,1,2" && r.cards.every((c) => c.lanes === 3), JSON.stringify(r.cards));

r = L([it("a", H(9), H(12)), it("b", H(9), H(12)), it("c", H(9), H(12)), it("d", H(9, 30), H(10, 30))], O);
t.check("四件目は札にせず、3列目の札の more へ", r.cards.length === 3 && r.cards[2].more.join() === "d", JSON.stringify(r.cards));

r = L([it("a", H(9), H(9, 15)), it("b", H(9, 20), H(10))], O);
t.check("短い札は最低60px（15分＝18px＋時間を持たない継ぎ目42px）", near(r.cards[0].height, 60));
t.check("短い札は列に割らず、次の札を押し下げる（9:20 の札の頭＝60＋6）", r.cards.every((c) => c.lanes === 1) && near(r.cards[1].top, 66), JSON.stringify(r.cards));

r = L([it("a", H(9), H(9, 30), false)], O);
t.check("長さ未定も最低60px（長さは言わない）", near(r.cards[0].height, 60));
r = L([it("a", H(9), H(9, 30), false), it("b", H(9, 30), H(10), false), it("c", H(10), H(11))], O);
t.check("続けて置いた長さ未定は60pxずつ積む・列に割れない", near(r.cards[0].height, 60) && near(r.cards[1].height, 60) && near(r.cards[1].top, 60)
  && r.cards.every((c) => c.lanes === 1 && c.lane === 0), JSON.stringify(r.cards));
r = L([it("a", H(9), H(9, 30), false), it("b", H(9, 45), H(10))], O);
t.check("次まで空いていれば長さ未定は60px（9:45の札はその下）", near(r.cards[0].height, 60) && near(r.cards[1].top, 78) && r.cards.every((c) => c.lanes === 1), JSON.stringify(r.cards));
r = L([it("a", H(9), H(9, 30), false), it("b", H(9, 20), H(10))], O);
t.check("次の用事が近い長さ未定も60pxで、次を押し下げる（列に割れない）", near(r.cards[0].height, 60) && near(r.cards[1].top, 60) && r.cards.every((c) => c.lanes === 1), JSON.stringify(r.cards));
r = L([it("a", H(9), H(11, 5), false), it("b", H(11), H(12))], O);
t.check("見込みの長さが次の予定にかかっても、次の頭で止めて列に割れない", near(r.cards[0].height, 144)
  && r.cards.every((c) => c.lanes === 1 && c.lane === 0), JSON.stringify(r.cards));

// 畳み：9時の用事と17時の用事のあいだ（10時〜17時）は畳む。
r = L([it("a", H(9), H(10)), it("b", H(17), H(18))], O);
t.check("90分以上の空きは一つに畳む", r.folds.length === 1 && r.folds[0].fromMin === H(10) && r.folds[0].untilMin === H(17), JSON.stringify(r.folds));
t.check("畳んだ区間の高さは一定（44px）", near(r.folds[0].height, 44) && near(r.cards[1].top, 72 + 44), JSON.stringify([r.folds, r.cards]));
t.check("全体の高さ＝札＋畳み＋札", near(r.height, 72 + 44 + 72), String(r.height));
t.check("y：畳んだ区間の中は区間の高さへ比例（真ん中＝22px）", near(r.y(H(13, 30)), 72 + 22));
t.check("y：畳みのあとは積み上がる", near(r.y(H(17)), 72 + 44));

r = L([it("a", H(9), H(10)), it("b", H(11), H(12))], { start: H(9), end: H(13) });
t.check("90分未満の空きは畳まず物差しのまま", r.folds.length === 0 && near(r.cards[1].top, 144), JSON.stringify([r.folds, r.cards[1]]));

r = L([], { start: H(5), end: H(23) });
t.check("用事が無い日は一日ぶんが一つの畳み", r.folds.length === 1 && near(r.height, 44));

r = L([it("a", H(22), H(24, 30))], { start: H(5), end: H(23) });
t.check("寝る時刻をすぎる札は範囲を広げて描く", r.to >= H(24, 30) && near(r.cards[0].height, 150 * 1.2), JSON.stringify([r.to, r.cards]));

r = L([it("a", H(9), H(10)), it("b", H(10), H(11)), it("c", H(10, 30), H(11, 30))], O);
t.check("連なりごとに列数が違ってよい（aは1列・b/cは2列）", r.cards[0].lanes === 1 && r.cards[1].lanes === 2 && r.cards[2].lanes === 2, JSON.stringify(r.cards));

// 手順をひらいた札（§6-3 の (a)）：下端に継ぎ目を入れ、下を押し下げる。
r = L([it("a", H(9), H(10)), it("b", H(10), H(11)), it("c", H(9, 10), H(10))], Object.assign({ open: { a: 60 } }, O));
const ca = r.cards.find((c) => c.id === "a"), cb = r.cards.find((c) => c.id === "b");
t.check("ひらいた札は足したぶん高い（72＋60）", near(ca.height, 132), JSON.stringify(r.cards));
t.check("下の札は押し下がる（10時の札の頭＝72＋60・全体も60伸びる）", near(cb.top, 132) && near(r.height, 72 * 2 + 60 + 44), JSON.stringify(r.cards));
t.check("継ぎ目ちょうどで終わる隣の列の札は伸ばさない（50分＝60px）", near(r.cards.find((c) => c.id === "c").height, 60), JSON.stringify(r.cards));
t.check("押し下げは時間を持たない：y(10:00)＝132・y(9:59)＜72", near(r.y(H(10)), 132) && r.y(H(9, 59)) < 72);
t.check("minAt：継ぎ目の中は10:00、その下は物差しどおり", near(r.minAt(100), H(10)) && near(r.minAt(132 + 36), H(10, 30)));

// minAt は y の逆（畳みも込み）。
r = L([it("a", H(9), H(10)), it("b", H(17), H(18))], O);
t.check("minAt：y の逆（9:30・13:30・17:15）", [H(9, 30), H(13, 30), H(17, 15)].every((m) => near(r.minAt(r.y(m)), m)),
  [H(9, 30), H(13, 30), H(17, 15)].map((m) => r.minAt(r.y(m))).join());
t.check("minAt：端の外は一日の端へ（上は始まり）", near(r.minAt(0), H(9)) && r.minAt(r.height + 12) >= H(18));

// 畳んだ「一日の帯」（R3）：同じ一日を横一本に。合計と空き（T2）。
let st = win.KN.tlLayout.strip([it("a", H(10), H(10, 30)), it("b", H(14), H(15)), it("c", H(14, 30), H(15, 30)), it("d", H(17), H(17, 30), false)], { now: H(10, 30) });
t.check("帯：5〜23時の一本（x(5時)＝0・x(14時)＝0.5・x(23時)＝1）", st.from === H(5) && st.to === H(23) && near(st.x(H(14)), 0.5) && near(st.x(H(23)), 1), JSON.stringify([st.from, st.to]));
t.check("帯：長さ未定は幅0（見込みを長さに描かない）", near(st.bars[3].width, 0) && near(st.bars[1].width, 1 / 18), JSON.stringify(st.bars));
t.check("帯：目盛りは3時間ごと（5・8・11…23）", st.ticks.join() === [5, 8, 11, 14, 17, 20, 23].map((h) => H(h)).join(), st.ticks.join());
t.check("T2：予定はいまから先の長さを決めた分（重なりは一度・過ぎた分と長さ未定は数えない）＝90分", st.planned === 90, String(st.planned));
t.check("T2：空き＝いまから終わりまで − 予定（12時間30分 − 90分）", st.free === 12 * 60 + 30 - 90, String(st.free));
st = win.KN.tlLayout.strip([it("a", H(22), H(24))], {});
t.check("帯：はみ出す用事のぶん広げる・いまが無ければ一日ぶん", st.to === H(24) && st.planned === 120 && st.free === 19 * 60 - 120, JSON.stringify([st.to, st.planned, st.free]));

t.done();
