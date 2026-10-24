/* 外との口の守り（セキュリティ S3、2026年10月23日。docs/dev.md「外との口の守り」）。門に入れる。ブラウザは使わない。

   relay/worker.test.mjs（中継所のふるまい・押し先を押しの窓口に限る・大きさを読む前に断る・nosniff・
   アプリに埋めた写し js/relay-code.js が worker.js とずれていない）を門から回す。
   ai/worker.test.mjs は SDK を入れないと動かないので、ここでは回さない（tests-daily.yml が毎日回す）。 */
const path = require("path");
const { spawnSync } = require("child_process");
const { checker } = require("./lib");

const t = checker("中継所のふるまい");
const r = spawnSync(process.execPath, [path.join(__dirname, "..", "relay", "worker.test.mjs")], { encoding: "utf8" });
const lines = (r.stdout || "").split("\n");
const ran = lines.filter((l) => /^(PASS|FAIL) {2}/.test(l));
ran.forEach((l) => {
  const m = /^(PASS|FAIL) {2}(.*?)(?: {2}→ (.*))?$/.exec(l);
  t.check(m[2], m[1] === "PASS", m[3]);
});
t.check("台本が最後まで走った", r.status === 0 && ran.length > 100, (r.stderr || "").split("\n").slice(0, 3).join(" / "));
t.done();
