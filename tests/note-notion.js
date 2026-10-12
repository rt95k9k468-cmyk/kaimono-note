/* ノートの取り込み：Notion の書き出し（zip。js/note-notion.js・docs/notes-unify.md 段3「取り込み」）。

   zip の中の zip（分かれた書き出し）・縮めた（deflate）ものと縮めないもの・壊れた zip／`<題> <id>.md` と
   同じ名前のフォルダ → 親子（key は32字）／CSV → 表のノート（`_all.csv` を選ぶ・引用符・改行・カンマ）、
   行のページはその子／中のリンク（相対・notion.so）→ `[題](note:<id>)`、外は字のまま、見つからないものは字だけ
   ／画像・PDF は入れ物へ、ほかの添付は名前の行／字下げ4→2・`<aside>` を外す／先に見せる紙（件数・落ちる・
   読めない）→ 控え → 取り込む（ノートブック「Notion」・日付は取り込んだ時刻より前・親が先）／二度目は飛ばす／取り消す。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-notion.js */
const zlib = require("zlib");
const { open, checker } = require("./lib");

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** 素朴な zip（名前は UTF-8 の印つき）。store なら縮めない。 */
function zip(entries) {
  const parts = [];
  const cen = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const body = e.store ? raw : zlib.deflateRawSync(raw);
    const head = (sig, size) => { const h = Buffer.alloc(size); h.writeUInt32LE(sig, 0); return h; };
    const l = head(0x04034b50, 30);
    l.writeUInt16LE(20, 4); l.writeUInt16LE(0x800, 6); l.writeUInt16LE(e.store ? 0 : 8, 8);
    l.writeUInt32LE(crc32(raw), 14); l.writeUInt32LE(body.length, 18); l.writeUInt32LE(raw.length, 22); l.writeUInt16LE(name.length, 26);
    const c = head(0x02014b50, 46);
    c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(e.store ? 0 : 8, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(off, 42);
    parts.push(l, name, body);
    cen.push(c, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(cen);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const A = "1".repeat(32), B = "2".repeat(32), DB = "3".repeat(32), ROW = "4".repeat(32);
const TRIP = `旅 (下書き) ${A}`;
const enc = (s) => encodeURI(s);

const PART1 = zip([
  { name: `${TRIP}.md`, data: `# 旅 (下書き)

本文

- 一
    - 二

![地図](${enc(TRIP)}/map.png)

[子のページ](${enc(`${TRIP}/子 ${B}.md`)}) と [外](https://example.com)

<aside>
メモ
</aside>

[契約.pdf](${enc(TRIP)}/${enc("契約.pdf")})

[声.wav](${enc(TRIP)}/${enc("声.wav")})

[無い](${enc("なくした.png")})
` },
  { name: `${TRIP}/子 ${B}.md`, data: `# 子\n\n[親へ](https://www.notion.so/xx-${A}?pvs=21)\n\n[表へ](../${enc(`蔵書 ${DB}.csv`)})\n` },
  { name: `${TRIP}/map.png`, data: PNG, store: true },
  { name: `${TRIP}/契約.pdf`, data: Buffer.from("%PDF-1.4\n%試験\n%%EOF\n") },
  { name: `${TRIP}/声.wav`, data: Buffer.from("RIFF0000WAVEfmt ") },
]);
const PART2 = zip([
  { name: `蔵書 ${DB}.csv`, data: "﻿名前,著者,メモ\n" },
  { name: `蔵書 ${DB}_all.csv`, data: "﻿名前,著者,メモ\r\n本A,某,\"一行め\n二行め\"\r\n\"本B, 上\",誰,\"引用 \"\"と\"\" |\"\r\n" },
  { name: `蔵書 ${DB}/本A ${ROW}.md`, data: "# 本A\n\n著者: 某\n\n感想\n" },
]);
const ZIP = zip([
  { name: "Export-x-Part-1.zip", data: PART1 },
  { name: "Export-x-Part-2.zip", data: PART2, store: true },
  { name: "壊れ.zip", data: Buffer.from("not a zip"), store: true },
]);

(async () => {
  const t = checker("note-notion");
  const { browser, page, errors } = await open();
  await page.evaluate(() => KN.notes.ready());

  /* ---- 部品 ---- */
  const parts = await page.evaluate(() => ({
    tidy: KN.noteNotion.tidy("﻿\n# 題\n\n- a\n    - b\n        - c\n```\n    code\n```\n<details>\n<summary>開く</summary>\n中\n</details>\n"),
    csv: KN.noteNotion.csvRows('a,"b,c"\r\n"x""y","1\n2"\n\n'),
  }));
  t.check("頭の題・字下げ4→2・コードはそのまま・トグルの印を外す", parts.tidy.title === "題"
    && parts.tidy.body === "- a\n  - b\n    - c\n```\n    code\n```\n開く\n中", JSON.stringify(parts.tidy));
  t.check("CSV（引用符・カンマ・改行・空の行）", JSON.stringify(parts.csv) === JSON.stringify([["a", "b,c"], ['x"y', "1\n2"]]), JSON.stringify(parts.csv));

  /* ---- 設定から選ぶ → 先に見せる紙 ---- */
  await page.click('.tab[data-tab="notes"]');
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await page.waitForTimeout(300);
  const takes = [];
  await page.exposeFunction("tookSnap", (r) => takes.push(r));
  await page.evaluate(() => { const was = KN.backup.take; KN.backup.take = (r, o) => { window.tookSnap(r); return was(r, o); }; });
  const [fc] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.locator(".set-layer:last-child .set-row", { hasText: "取り込む" }).first().click(),
  ]);
  await fc.setFiles({ name: "Export-x.zip", mimeType: "application/zip", buffer: ZIP });
  await page.waitForSelector(".js-go");
  await page.waitForTimeout(300);
  const rows = () => page.evaluate(() => [...document.querySelectorAll(".set-layer:last-child .set-row, .sheet.is-open .set-row")].map((r) => r.textContent.replace(/\s+/g, "")));
  const has = (list, s) => list.includes(s.replace(/\s+/g, ""));
  const first = await rows();
  t.check("先に見せる：ノート4・画像1・PDF1・表1", has(first, "ノート 4") && has(first, "画像 1") && has(first, "PDF 1") && has(first, "表 1"), JSON.stringify(first));
  t.check("先に見せる：落ちる添付1・読めないもの1（壊れた zip）", has(first, "落ちる：ほかの添付 1") && has(first, "読めないもの 1"), JSON.stringify(first));
  t.check("ノートブックは「Notion」", (await page.inputValue(".field .input")) === "Notion");
  await page.click(".js-go");
  await page.waitForFunction(() => KN.notes.list().filter((n) => n.src).length === 4, null, { timeout: 15000 });
  await page.evaluate(() => KN.notes.flush());
  t.check("控え（取り込む前）を先に", takes.includes("取り込む前"), JSON.stringify(takes));

  const got = await page.evaluate(() => Object.fromEntries(KN.notes.list().filter((n) => n.src).map((n) => [n.title, n])));
  const trip = got["旅 (下書き)"], kid = got["子"], db = got["蔵書"], row = got["本A"];
  t.check("題は頭の `# `（無ければファイルの名前）", !!(trip && kid && db && row), JSON.stringify(Object.keys(got)));
  const all = [trip, kid, db, row];
  t.check("src：from・key（32字）・batch", all.every((n) => n.src.from === "notion" && n.src.batch === trip.src.batch)
    && trip.src.key === "1".repeat(32) && db.src.key === "3".repeat(32), JSON.stringify(all.map((n) => n.src)));
  t.check("親子：フォルダ → 親・行のページは表の子", kid.parent === trip.id && row.parent === db.id && !trip.parent && !db.parent);
  t.check("ノートブック・日付（取り込んだ時刻より前・親が先）", all.every((n) => n.notebook === "Notion" && n.updatedAt === n.createdAt && n.updatedAt < n.src.batch)
    && trip.createdAt < kid.createdAt && db.createdAt < row.createdAt);
  const want = new RegExp(`^本文\\n\\n- 一\\n  - 二\\n\\n!\\[\\]\\(img:[0-9a-f]{16}\\)\\n\\[[^\\]]*\\]\\(file:[0-9a-f]{64}\\.png\\)\\n\\n\\[子のページ\\]\\(note:${kid.id}\\) と \\[外\\]\\(https://example\\.com\\)\\n\\nメモ\\n\\n`
    + "\\[契約\\.pdf\\]\\(file:[0-9a-f]{64}\\.pdf\\)\\n\\n\\[声\\.wav\\]\\n\\n無い$");
  t.check("本文：画像・PDF は入れ物へ・中のリンク・外は字のまま・aside・ほかの添付は名前・無いものは字だけ", want.test(trip.body), JSON.stringify(trip.body));
  t.check("中のリンク（notion.so・CSV への相対）→ note:", kid.body === `[親へ](note:${trip.id})\n\n[表へ](note:${db.id})`, JSON.stringify(kid.body));
  t.check("表のノート：CSV の原本（files/）の行と _all.csv の行", /^\[蔵書\.csv\]\(file:[0-9a-f]{64}\.csv\)\n/.test(db.body)
    && db.body.replace(/^.*\n/, "") === "| 名前 | 著者 | メモ |\n| --- | --- | --- |\n| 本A | 某 | 一行め 二行め |\n| 本B, 上 | 誰 | 引用 \"と\" \\| |", JSON.stringify(db.body));
  t.check("行のページ：属性の行も本文に", row.body === "著者: 某\n\n感想", JSON.stringify(row.body));
  t.check("画像は入れ物に", await page.evaluate(async (body) => !!(await KN.noteImg.get(KN.noteImg.idsIn(body)[0])), trip.body));
  const after = await rows();
  t.check("読めない添付があれば紙に残す", has(after, "読めない添付 1"), JSON.stringify(after));

  /* ---- 二度目は飛ばす ---- */
  await page.evaluate(() => KN.ui.closeAll && KN.ui.closeAll());
  const again = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const book = await KN.noteNotion.read([new File([bytes], "Export-x.zip")]);
    return KN.noteImport.run([book]);
  }, ZIP.toString("base64"));
  t.check("二度目：増えない", again.total === 0 && (await page.evaluate(() => KN.notes.list().filter((n) => n.src).length)) === 4, JSON.stringify(again));

  /* ---- 取り消す ---- */
  const bs = await page.evaluate(() => KN.noteImport.batches());
  t.check("取り込みの一覧に一つ（Notion）", bs.length === 1 && bs[0].books.join() === "Notion", JSON.stringify(bs));
  const n = await page.evaluate((bt) => KN.notes.unimport(bt), bs[0].batch);
  t.check("取り消す：4件とも最近削除へ", n === 4 && (await page.evaluate(() => KN.notes.list().filter((x) => x.src).length)) === 0);

  t.check("頁の誤りなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
