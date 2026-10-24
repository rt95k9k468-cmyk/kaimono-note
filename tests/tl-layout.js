/* 今日の面の物差し（js/tl-layout.js・docs/timeline-scale-design.md）。画面は開かない。
   重なり0〜4件・短い札・長さ未定・長い空きの畳み・y(分)・範囲外。
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
t.check("重なりの高さは時間どおり（2時間＝144px・30分＝36px）", near(r.cards[0].height, 144) && near(r.cards[1].height, 36));

r = L([it("a", H(9), H(12)), it("b", H(9, 30), H(10)), it("c", H(9, 45), H(10, 30))], O);
t.check("三件が重なると3列", r.cards.map((c) => c.lane).join() === "0,1,2" && r.cards.every((c) => c.lanes === 3), JSON.stringify(r.cards));

r = L([it("a", H(9), H(12)), it("b", H(9), H(12)), it("c", H(9), H(12)), it("d", H(9, 30), H(10, 30))], O);
t.check("四件目は札にせず、3列目の札の more へ", r.cards.length === 3 && r.cards[2].more.join() === "d", JSON.stringify(r.cards));

r = L([it("a", H(9), H(9, 15)), it("b", H(9, 20), H(10))], O);
t.check("短い札は最低高36px（15分＝18px→36px）", near(r.cards[0].height, 36));
t.check("最低高で見た目が重なれば2列（15分の札の下端は9:30、次は9:20）", r.cards.map((c) => c.lane).join() === "0,1", JSON.stringify(r.cards));

r = L([it("a", H(9), H(9, 30), false)], O);
t.check("長さ未定は最低高44px（30分＝36pxより高い・長さは言わない）", near(r.cards[0].height, 44));
r = L([it("a", H(9), H(9, 30), false), it("b", H(9, 30), H(10), false), it("c", H(10), H(11))], O);
t.check("続けて置いた長さ未定は次の札の頭まで（36px）・列に割れない", near(r.cards[0].height, 36) && near(r.cards[1].height, 36)
  && r.cards.every((c) => c.lanes === 1 && c.lane === 0), JSON.stringify(r.cards));
r = L([it("a", H(9), H(9, 30), false), it("b", H(9, 45), H(10))], O);
t.check("次まで空いていれば長さ未定は44px（9:45まで＝54px）", near(r.cards[0].height, 44) && r.cards.every((c) => c.lanes === 1), JSON.stringify(r.cards));
r = L([it("a", H(9), H(9, 30), false), it("b", H(9, 20), H(10))], O);
t.check("時間が重なる長さ未定は44pxのまま2列", near(r.cards[0].height, 44) && r.cards.map((c) => c.lane).join() === "0,1", JSON.stringify(r.cards));

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
r = L([it("a", H(9), H(10)), it("b", H(10), H(11)), it("c", H(9, 30), H(10))], Object.assign({ open: { a: 60 } }, O));
const ca = r.cards.find((c) => c.id === "a"), cb = r.cards.find((c) => c.id === "b");
t.check("ひらいた札は足したぶん高い（72＋60）", near(ca.height, 132), JSON.stringify(r.cards));
t.check("下の札は押し下がる（10時の札の頭＝72＋60・全体も60伸びる）", near(cb.top, 132) && near(r.height, 72 * 2 + 60 + 44), JSON.stringify(r.cards));
t.check("継ぎ目ちょうどで終わる隣の列の札は伸ばさない（30分＝36px）", near(r.cards.find((c) => c.id === "c").height, 36), JSON.stringify(r.cards));
t.check("押し下げは時間を持たない：y(10:00)＝132・y(9:59)＜72", near(r.y(H(10)), 132) && r.y(H(9, 59)) < 72);
t.check("minAt：継ぎ目の中は10:00、その下は物差しどおり", near(r.minAt(100), H(10)) && near(r.minAt(132 + 36), H(10, 30)));

// minAt は y の逆（畳みも込み）。
r = L([it("a", H(9), H(10)), it("b", H(17), H(18))], O);
t.check("minAt：y の逆（9:30・13:30・17:15）", [H(9, 30), H(13, 30), H(17, 15)].every((m) => near(r.minAt(r.y(m)), m)),
  [H(9, 30), H(13, 30), H(17, 15)].map((m) => r.minAt(r.y(m))).join());
t.check("minAt：端の外は一日の端へ（上は始まり）", near(r.minAt(0), H(9)) && r.minAt(r.height + 12) >= H(18));

t.done();
