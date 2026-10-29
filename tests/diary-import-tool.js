/* 日記の取り込み道具（tools/diary-import.html）の読む口。docs/storage.md「日記を取り込む」。

   - .txt（簡単日記の形：その行が「2021年7月31日 土曜日」だけ）を日に切る。Shift_JIS も読む
   - ジャーナルの書き出しの zip（Entries/*.html。縮めたもの・そのまま両方）と .html を一日ぶんずつ。
     日付はファイル名、写真・地図（.assetGrid）の字と見出し（.pageHeader）は入れない、index.html は読まない
   - 同じ日がテキストとジャーナルの両方にあれば繋ぐ
   - 合言葉を入れると控えができる
   字はすべて作り物。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-import-tool.js */
const zlib = require("zlib");
const { chromium } = require("playwright");
const { checker, ensureServer } = require("./lib");

/** zip を組む（中央の目録つき）。deflate なら method 8。 */
function zipOf(files) {
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const loc = [], cen = [];
  let at = 0;
  files.forEach(([name, text, deflate]) => {
    const raw = Buffer.from(text, "utf8");
    const data = deflate ? zlib.deflateRawSync(raw) : raw;
    const nm = Buffer.from(name, "utf8");
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc(raw), 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc(raw), 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28);
    c.writeUInt32LE(at, 42);
    loc.push(h, nm, data);
    cen.push(c, nm);
    at += 30 + nm.length + data.length;
  });
  const cd = Buffer.concat(cen);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(at, 16);
  return Buffer.concat([...loc, cd, e]);
}

const entry = (date, paras, extra = "") => `<!DOCTYPE html><html><head><style>.p2{}</style></head><body>
<div class="pageHeader">${date}</div>${extra}
${paras.map((p) => `<p class="p2"><span class="s1">${p}</span></p>`).join("\n<p class=\"p2\"><br></p>\n")}
</body></html>`;
const GRID = `<div class="assetGrid"><div class="gridItem assetType_genericMap"><img src="../Resources/a.jpg"><div class="gridItemOverlayFooter">場所のなまえ</div></div></div>`;

const TXT = "2021年7月31日 土曜日\nテキストの一日め。\n\n二段落め。\n\n\n2021年8月1日 日曜日\nテキストの二日め。\n2021年8月1日は晴れ、と本文に書いた行。\n\n2023年12月15日 金曜日\nテキストの最後の日。\n";

(async () => {
  await ensureServer();
  const t = checker("diary-import-tool");
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ serviceWorkers: "block" })).newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:8765/tools/diary-import.html");
  await page.waitForTimeout(300);

  const zip = zipOf([
    ["AppleJournalEntries/index.html", "<html><body><a>2023年12月15日</a></body></html>", true],
    ["AppleJournalEntries/Entries/2023-12-15.html", entry("2023年12月15日 金曜日", ["ジャーナルの同じ日。"]), true],
    ["AppleJournalEntries/Entries/2023-12-16.html", entry("2023年12月16日 土曜日", ["ジャーナルの一日め。", "二段落め。"], GRID), false],
    ["AppleJournalEntries/Resources/a.jpg", "xx", false],
  ]);
  await page.setInputFiles("#file", [
    { name: "簡単日記.txt", mimeType: "text/plain", buffer: Buffer.from(TXT, "utf8") },
    { name: "AppleJournalEntries.zip", mimeType: "application/zip", buffer: zip },
    { name: "2023-12-17.html", mimeType: "text/html", buffer: Buffer.from(entry("2023年12月17日 日曜日", ["一つだけ選んだ html。"])) },
  ]);
  await page.waitForSelector("#s-result:not([hidden])", { timeout: 15000 });
  const msg = await page.textContent("#pmsg");
  t.check("読み取り：ジャーナル3件・テキスト1個・読めないもの無し", /ジャーナル 3 件/.test(msg) && /テキスト 1 個/.test(msg) && !/読めなかった/.test(msg), msg);
  const stats = await page.textContent("#stats");
  t.check("日数：テキスト3日＋ジャーナル3日、重なり1日で5日", /日数\s*5 日/.test(stats.replace(/\s+/g, " ")), stats);
  t.check("期間", /2021-07-31 〜 2023-12-17/.test(stats), stats);
  const on = await page.textContent("#pats tr.on");
  t.check("選んだ書式は「その行が日付だけ」", /その行が日付だけ/.test(on) && /曜日/.test(on), on);

  /* 中身は控えを作ってから開き直して見る（見本は3日ぶんだけなので）。 */
  await page.fill("#pw1", "test pass 123");
  await page.fill("#pw2", "test pass 123");
  await page.click("#go");
  await page.waitForSelector("#s-done:not([hidden])", { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl")]);
  const sealed = JSON.parse(require("fs").readFileSync(await dl.path(), "utf8"));
  const opened = await page.evaluate(async (s) => {
    const X = window.KN.diaryCrypto;
    const key = await X.openLock(s.lock, "test pass 123");
    const out = {};
    for (const d of s.days) out[d.date] = await X.open(key, d);
    return out;
  }, sealed);
  t.check("控え：5日", Object.keys(opened).sort().join() === "2021-07-31,2021-08-01,2023-12-15,2023-12-16,2023-12-17", Object.keys(opened).join());
  t.check("テキスト：段落の空行は残る", opened["2021-07-31"] === "テキストの一日め。\n\n二段落め。", JSON.stringify(opened["2021-07-31"]));
  t.check("テキスト：本文の中の日付の行で割れない", /本文に書いた行/.test(opened["2021-08-01"] || ""), JSON.stringify(opened["2021-08-01"]));
  t.check("同じ日は繋ぐ（テキストとジャーナル）", /テキストの最後の日/.test(opened["2023-12-15"] || "") && /ジャーナルの同じ日/.test(opened["2023-12-15"] || ""), JSON.stringify(opened["2023-12-15"]));
  const j = opened["2023-12-16"] || "";
  t.check("ジャーナル：段落、見出しと写真・地図の字は入れない", j === "ジャーナルの一日め。\n\n二段落め。", JSON.stringify(j));
  t.check("一つだけ選んだ html も読む", opened["2023-12-17"] === "一つだけ選んだ html。", JSON.stringify(opened["2023-12-17"]));

  /* Shift_JIS のテキスト */
  await page.reload();
  await page.waitForTimeout(300);
  const sjis = Buffer.from([0x32, 0x30, 0x32, 0x32, 0x94, 0x4e, 0x31, 0x8c, 0x8e, 0x32, 0x93, 0xfa, 0x0a, 0x82, 0xa0, 0x0a]); // 2022年1月2日\nあ
  await page.setInputFiles("#file", [{ name: "old.txt", mimeType: "text/plain", buffer: sjis }]);
  await page.waitForSelector("#s-result:not([hidden])", { timeout: 15000 });
  const s2 = await page.textContent("#sample");
  t.check("Shift_JIS のテキストも読む", /2022-01-02/.test(s2) && /あ/.test(s2), s2);
  t.check("頁のエラーなし", !errs.length, errs.join(" / "));

  await browser.close();
  t.done();
})();
