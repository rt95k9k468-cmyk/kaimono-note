/* 同期の部屋（docs/sync.md 段1）。門に入れる。ブラウザは使わない。

   sync/room.test.mjs（node:sqlite の上の偽の部屋で、本物の worker.mjs と room.mjs を動かす：二度当てない・
   元の版が違えば断って今の中身・消しすぎを断る・古い約束の書き込みを断る・続きだけ取る・知らせは番号だけ・
   鍵はハッシュで・合言葉は一回だけ・素の字を預からない・本文を書き出さない）を門から回す。 */
const path = require("path");
const { spawnSync } = require("child_process");
const { checker } = require("./lib");

const t = checker("同期の部屋");
const r = spawnSync(process.execPath, ["--no-warnings", path.join(__dirname, "..", "sync", "room.test.mjs")], { encoding: "utf8" });
const lines = (r.stdout || "").split("\n");
const ran = lines.filter((l) => /^(PASS|FAIL) {2}/.test(l));
ran.forEach((l) => {
  const m = /^(PASS|FAIL) {2}(.*?)(?: {2}→ (.*))?$/.exec(l);
  t.check(m[2], m[1] === "PASS", m[3]);
});
t.check("台本が最後まで走った", r.status === 0 && ran.length > 100, (r.stderr || "").split("\n").slice(0, 3).join(" / "));
t.done();
