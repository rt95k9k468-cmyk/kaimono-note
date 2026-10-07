/* 消すときの決まり（roadmap-unify の U11、docs/look.md の「消すとき」）。
   - 一件の記録（daily の記録・体重・食事・お酒・飲みたくなった・価格の一件）は、紙の頭の ⋯ から
     KN.ui.delMenu で消す（store の remove* を呼ぶのは delMenu の中だけ）
   - 紙の足もと・中身に「消す」のボタン（class="btn … js-del"）が戻ってこない
   - 一件の記録に確かめの紙を出さない（「この記録を消しますか？」「この食事を消しますか？」が無い）
   - delMenu は確かめずに消し、「消しました」と「元に戻す」だけ付ける
   - 確かめの紙が残るのは、まとめて消す・設定の奥（商品ごと・店・カテゴリ）
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/del-rule.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const t = checker("del-rule");
const dir = path.join(__dirname, "..", "js");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "relay-code.js" && f !== "store.js")
  .map((f) => [f, read(f)]);
const hits = (re) => src.flatMap(([f, s]) => s.split("\n").filter((l) => re.test(l)).map((l) => `${f}:${l.trim()}`));

const RM = /store\.remove(Entry|Weight|Meal|Drink|Urge)\(/;
const calls = hits(RM);
const loose = calls.filter((l) => !/KN\.ui\.delMenu\(/.test(l));
t.check("一件の記録の remove* は ⋯ の delMenu から", calls.length >= 5 && !loose.length, loose.join(" / ") || String(calls.length));

const ps = read("product-sheet.js");
t.check("価格の一件も ⋯ の delMenu から", /KN\.ui\.delMenu\(removePrice,/.test(ps));

const foot = hits(/class="btn [^"]*js-del/);
t.check("紙に「消す」のボタンが無い", !foot.length, foot.join(" / "));

const ask = hits(/この(記録|食事)を消しますか/);
t.check("一件の記録に確かめの紙を出さない", !ask.length, ask.join(" / "));

const ui = read("ui.js");
const body = (ui.match(/function delMenu\([\s\S]*?\n  \}/) || [""])[0];
t.check("delMenu は確かめずに消し、「消しました」「元に戻す」",
  !!body && !/confirm/.test(body) && /消しました/.test(body) && /元に戻す/.test(body), body.slice(0, 80));

t.check("まとめて消す・設定の奥は確かめの紙のまま",
  /この商品を消しますか？/.test(ps) && /confirm\(/.test(read("settings-list.js")));
t.done();
