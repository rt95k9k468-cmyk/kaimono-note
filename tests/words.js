/* 言葉の札（roadmap-unify の U10、docs/look.md の「言葉の札」）。表に無い言い方がソースに戻らない。
   - 「削除」は無い（「消す」。iPhone と同じ「最近削除した項目」と、控えの名前「削除前」は別）
   - 直す紙の題は「〜を直す」（「〜の編集」・「編集」の札が無い）
   - 確かめの紙の題は「〜を消しますか？」（「〜を消す」「〜を消しますか」で終わる題が無い）
   - 足す紙の題・主ボタンに「足す」を使わない（「書く」「記録」「追加」）
   - 見つからないは「見つかりませんでした」だけ（「見つかりません」で止めない・句点を付けない）
   - 写したは「コピーしました」、写せなかったは「コピーできませんでした」の二つだけ
   - AI の入口は「AIに〜」（「AIと〜」「AI用〜」が無い）
   画面は開かない。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/words.js */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const t = checker("words");
const dir = path.join(__dirname, "..", "js");
const src = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "relay-code.js")
  .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")]);

const hits = (re, skip = () => false) => src.flatMap(([f, s]) =>
  [...s.matchAll(re)].filter((m) => !skip(f, m[0])).map((m) => `${f}:${m[0]}`));

/* 絵の引き当ての言葉（icons-*.js）は、利用者が打つ言葉なので「削除」も引く。 */
const del = hits(/[^\n"`]{0,8}削除[^\n"`]{0,4}/g,
  (f, m) => f.startsWith("icons-") || /最近削除/.test(m) || (f === "backup.js" && m === "削除前"));
t.check("「削除」が無い（「消す」）", !del.length, del.join(" / "));

const edit = hits(/の編集|"編集"/g);
t.check("直す紙の題は「〜を直す」", !edit.length, edit.join(" / "));

const ask = hits(/title: [^\n]*?を消(す|しますか)["`]/g);
t.check("確かめの紙の題は「〜を消しますか？」", !ask.length, ask.join(" / "));

const add = hits(/title: [^\n]*を足す["`]|btn-primary[^>\n]*>[^<\n]*足す</g);
t.check("足す紙の題とボタンに「足す」を使わない", !add.length, add.join(" / "));

const none = hits(/見つかりません(?!でした)|見つかりませんでした。/g,
  (f, m) => (f === "screen-archive.js" || f === "backup.js") && m === "見つかりません");   // 日記の本文が無い状態（MISSING）・控えの内側の例外
t.check("見つからないは「見つかりませんでした」", !none.length, none.join(" / "));

const copy = hits(/"[^"\n]*コピー(?:しました|できませんでした|できません)[^"\n]*"/g,
  (f, m) => m === '"コピーしました"' || m === '"コピーできませんでした"');
t.check("写した・写せなかったは二つだけ", !copy.length, copy.join(" / "));

const ai = hits(/AI(?:と|用)[^\n"`<]{0,6}/g);
t.check("AI の入口は「AIに〜」", !ai.length, ai.join(" / "));

t.done();
