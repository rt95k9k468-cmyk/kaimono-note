/* 罠を試験で止める（2026年10月22日、CLAUDE.md「コードの罠」）。読むだけ・ブラウザは使わない。

   覚えておく前提だった罠を、足したときに落ちる形にする。
   1. TDZ：store.js の `let state = load()` はモジュールの途中で走る。load の道が、その行より
      下の const/let を使うと TDZ で落ちる（過去のデータ消失事故の原因）。下に新しい const/let を
      足したら、ここが赤になる——load の道（loadFrom・reconcile ほか）から使わないことを確かめて
      BELOW に足す。使うなら function 宣言にするか、load より上へ。
   2. UTC の日付：`toISOString()`／`KN.util.today()` の頭10字は UTC の日（日本の朝0〜9時は前の日）。
      日の鍵は `dayKey()`／`todayKey()`（ローカル）で作る。いまは0か所——一つも許さない。 */
const fs = require("fs");
const path = require("path");
const { checker } = require("./lib");

const ROOT = path.join(__dirname, "..");
const t = checker("罠を試験で止める");

/* 1. store.js：load より下の const/let（2026年10月22日にあった分。足すときは一つずつ確かめる）。 */
const BELOW = ["listeners", "version", "saveError", "isBlank", "saveTimer", "saveDue", "saveByHand", "STILL_MAX", "HAND_MS",
  "handAt", "ON_COMPOSITOR", "META_KEYS", "get", "getProduct", "getStore", "getCategory", "CATEGORY_HINTS", "DIET_RANGES",
  "actLabel", "USUAL_MIN", "usualIx", "usualKey", "PART_ORDER", "NO_PART_ORDER", "todoPart", "openTodos", "REVIEW_DEFAULT",
  "SHELF_KEYS", "PARTS", "LENS_D1", "closedTodos", "todoClosedAt", "occurrenceOf", "kanaOrder", "diet", "dietIndexVersion",
  "dietIndex", "dayKeyOf", "archive", "stamp", "PLACES", "GONE_KEY", "entriesOfNote", "byRecent",
  "entriesOfMonth", "entriesOfDay", "openSeeds", "dayLog", "daysOfMonth", "NOT_BACKUP"];

const store = fs.readFileSync(path.join(ROOT, "js/store.js"), "utf8").split("\n");
const at = store.findIndex((l) => /^\s*let state = load\(\);/.test(l));
t.check("store.js に `let state = load();` が一つある", at > 0 && store.filter((l) => /^\s*let state = load\(\);/.test(l)).length === 1);
const below = store.slice(at + 1).map((l) => (l.match(/^ {2}(?:const|let) ([A-Za-z_$][\w$]*)/) || [])[1]).filter(Boolean);
const fresh = below.filter((n) => !BELOW.includes(n));
t.check("load より下に、新しい const/let が無い（TDZ。足すなら load の道で使わないと確かめて BELOW へ）",
  fresh.length === 0, fresh.join(", "));
const gone = BELOW.filter((n) => !below.includes(n));
t.check("BELOW の名前が、どれもまだ下にある（消えた・上へ移ったものは BELOW から消す）", gone.length === 0, gone.join(", "));

/* 2. js/ のどこにも UTC の日の切り出しが無い。 */
const UTC_DAY = /(?:toISOString|util\.today|\btoday)\(\)\s*\.\s*(?:slice\(0,\s*10\)|substring\(0,\s*10\)|substr\(0,\s*10\)|split\(["']T["']\))/;
const hits = [];
for (const f of fs.readdirSync(path.join(ROOT, "js")).filter((n) => n.endsWith(".js"))) {
  fs.readFileSync(path.join(ROOT, "js", f), "utf8").split("\n").forEach((l, i) => { if (UTC_DAY.test(l)) hits.push(`${f}:${i + 1}`); });
}
t.check("UTC の日の切り出し（toISOString().slice(0, 10) ほか）が無い（日の鍵は dayKey()・todayKey()）", hits.length === 0, hits.join(", "));

t.done();
