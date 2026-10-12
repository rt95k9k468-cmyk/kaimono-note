/* ノートの取り込み（Evernote の .enex。js/note-import.js・docs/notes-unify.md 段3「取り込み」）。

   MD5（en-media の hash）／ENML → Markdown（見出し・箇条・番号・入れ子・チェック二通り・太字・リンク・表・
   コード・引用・暗号化・空の行・`<en-media/>` の後ろの字）／設定のノートの「取り込む」でファイルを選ぶ →
   先に見せる紙（件数・画像・PDF・落ちるもの・読めないもの。ノートブックの名前を変えられる）→ 控え
   （「取り込む前」）→ 取り込む（src の from・key・batch、日付、タグ、画像と PDF の参照、ほかの添付は名前の行）
   ／二度目は飛ばす／取り消す（直したノートは残る・最近削除へ）→ 取り消した分はもう一度取り込める。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-import.js */
const crypto = require("crypto");
const { open, checker } = require("./lib");

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PDF = Buffer.from("%PDF-1.4\n%試験\n%%EOF\n").toString("base64");
const WAV = Buffer.from("RIFF0000WAVEfmt ").toString("base64");
const md5 = (b64) => crypto.createHash("md5").update(Buffer.from(b64, "base64")).digest("hex");

const note = ({ title, created, updated, tags = [], content, res = [], extra = "" }) => `<note><title>${title}</title>
<content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${content}</en-note>]]></content>
<created>${created}</created>${updated ? `<updated>${updated}</updated>` : ""}
${tags.map((t) => `<tag>${t}</tag>`).join("")}<note-attributes>${extra}</note-attributes>
${res.map((r) => `<resource><data encoding="base64">\n${r.data}\n</data><mime>${r.mime}</mime><resource-attributes><file-name>${r.name}</file-name></resource-attributes></resource>`).join("\n")}
</note>`;

const ENEX = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20261012T000000Z" application="Evernote" version="10">
${note({ title: "旅の支度 &amp; 地図", created: "20190501T112000Z", updated: "20190502T010000Z", tags: ["旅", "準備"],
    content: `<div>持ち物</div><div><en-media type="image/png" hash="${md5(PNG)}"/>写真の下</div><div><br/></div><div><en-todo checked="true"/>切符</div>`,
    res: [{ data: PNG, mime: "image/png", name: "map.png" }] })}
${note({ title: "書類", created: "20200101T000000Z", content: `<div>控え</div><en-media type="application/pdf" hash="${md5(PDF)}"/>`,
    res: [{ data: PDF, mime: "application/pdf", name: "契約.pdf" }, { data: WAV, mime: "audio/wav", name: "声.wav" }],
    extra: "<reminder-time>20200201T000000Z</reminder-time>" })}
<note><title>壊れたノート</title><content>&bogus;</content></note>
${note({ title: "", created: "20210101T000000Z", content: "<div>題の無いノート</div><en-crypt>abc</en-crypt>" })}
</en-export>`;

(async () => {
  const t = checker("note-import");
  const { browser, page, errors } = await open();
  await page.evaluate(() => KN.notes.ready());

  /* ---- MD5 ---- */
  const sums = await page.evaluate(() => {
    const big = new Uint8Array(1000).map((_, i) => (i * 7) & 255);
    const enc = (s) => new TextEncoder().encode(s);
    return [KN.noteImport.md5(enc("")), KN.noteImport.md5(enc("abc")), KN.noteImport.md5(big)];
  });
  const big = Buffer.from(Array.from({ length: 1000 }, (_, i) => (i * 7) & 255));
  t.check("MD5（空・abc・1000字）", sums[0] === "d41d8cd98f00b204e9800998ecf8427e" && sums[1] === "900150983cd24fb0d6963f7d28e17f72"
    && sums[2] === crypto.createHash("md5").update(big).digest("hex"), JSON.stringify(sums));

  /* ---- ENML → Markdown ---- */
  const cases = [
    ["見出し", "<h1>大</h1><h2>中</h2><h4>小</h4>", "# 大\n## 中\n### 小"],
    ["箇条・入れ子・番号", "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul><ol><li>一</li><li>二</li></ol>", "- a\n  - b\n- c\n1. 一\n2. 二"],
    ["チェック（en-todo）", '<div><en-todo checked="true"/>済み</div><div><en-todo/>まだ</div>', "- [x] 済み\n- [ ] まだ"],
    ["チェック（v10 の箇条）", '<ul style="--en-todo:true;"><li style="--en-checked:true;">x</li><li style="--en-checked:false;">y</li></ul>', "- [x] x\n- [ ] y"],
    ["太字・リンク", '<div>と<b>太い</b>と<span style="font-weight: bold;">も</span>、<a href="https://example.com/a b">例</a>・<a href="evernote:///view/1">内</a></div>',
      "と**太い**と**も**、[例](https://example.com/a%20b)・内"],
    ["空の行・nbsp", "<div>一</div><div><br/></div><div>二&nbsp;三</div>", "一\n\n二 三"],
    ["表", "<table><tr><td>名</td><td>値</td></tr><tr><td>a|b</td><td>1</td></tr></table>", "| 名 | 値 |\n| --- | --- |\n| a\\|b | 1 |"],
    ["コード", '<div style="-en-codeblock:true;"><div>let a = 1;</div><div>  a++;</div></div>', "```\nlet a = 1;\n  a++;\n```"],
    ["引用・線", "<blockquote><div>引く</div></blockquote><hr/><div>後</div>", "> 引く\n---\n後"],
    ["添付の後ろの字", '<div><en-media hash="AB12"/>下</div>', "\u0001ab12\u0001\n下"],
  ];
  const outs = await page.evaluate((cs) => cs.map(([, x]) => { const got = { table: 0, crypt: 0 }; return KN.noteImport.enml(`<en-note>${x}</en-note>`, got); }), cases);
  cases.forEach(([name, , want], i) => t.check(`ENML：${name}`, outs[i] === want, JSON.stringify(outs[i])));

  /* ---- 設定から選ぶ → 先に見せる紙 ---- */
  await page.click('.tab[data-tab="notes"]');
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForFunction(() => KN.app.activeScreen() === "settings" && document.querySelector(".set-layer .set-row"));
  await page.waitForTimeout(300);
  const takes = [];
  await page.exposeFunction("tookSnap", (r) => takes.push(r));
  await page.evaluate(() => { const was = KN.backup.take; KN.backup.take = (r, o) => { window.tookSnap(r); return was(r, o); }; });
  const chooseFile = async () => {
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator(".set-layer:last-child .set-row", { hasText: "取り込む" }).first().click(),
    ]);
    await fc.setFiles({ name: "旅のノート.enex", mimeType: "application/xml", buffer: Buffer.from(ENEX) });
    await page.waitForSelector(".js-go");
    await page.waitForTimeout(300);
  };
  await chooseFile();
  const rows = () => page.evaluate(() => [...document.querySelectorAll(".set-layer:last-child .set-row, .sheet.is-open .set-row")]
    .map((r) => r.textContent.replace(/\s+/g, "")));
  const first = await rows();
  const has = (list, s) => list.includes(s.replace(/\s+/g, ""));
  t.check("先に見せる：ノート3・画像1・PDF1", has(first, "ノート 3") && has(first, "画像 1") && has(first, "PDF 1"), JSON.stringify(first));
  t.check("先に見せる：落ちるもの（添付・暗号化・リマインダー）",
    has(first, "落ちる：ほかの添付 1") && has(first, "落ちる：暗号化した文 1") && has(first, "落ちる：リマインダー 1"), JSON.stringify(first));
  t.check("先に見せる：読めないもの1", has(first, "読めないもの 1"), JSON.stringify(first));
  t.check("ノートブックはファイルの名前", (await page.inputValue(".field .input")) === "旅のノート");
  await page.fill(".field .input", "Evernote 旅");
  await page.click(".js-go");
  await page.waitForFunction(() => KN.notes.list().filter((n) => n.src).length === 3, null, { timeout: 15000 });
  await page.evaluate(() => KN.notes.flush());

  t.check("控え（取り込む前）を先に", takes.includes("取り込む前"), JSON.stringify(takes));
  const got = await page.evaluate(() => KN.notes.list().filter((n) => n.src).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  const [a, b, c] = got;
  t.check("src：from・key・batch", got.every((n) => n.src.from === "evernote" && /^en:[0-9a-f]{32}$/.test(n.src.key) && n.src.batch === got[0].src.batch)
    && new Set(got.map((n) => n.src.key)).size === 3, JSON.stringify(got.map((n) => n.src)));
  t.check("ノートブック・題・タグ", got.every((n) => n.notebook === "Evernote 旅") && a.title === "旅の支度 & 地図" && a.tags.join() === "旅,準備" && c.title === "");
  t.check("日付は元の作った日・直した日", a.createdAt === "2019-05-01T11:20:00.000Z" && a.updatedAt === "2019-05-02T01:00:00.000Z"
    && b.updatedAt === "2020-01-01T00:00:00.000Z");
  t.check("画像は参照の行（本文の場所に）・後ろの字も", /^持ち物\n!\[\]\(img:[0-9a-f]{16}\)\n写真の下\n\n- \[x\] 切符$/.test(a.body), JSON.stringify(a.body));
  t.check("PDF は files の参照・ほかの添付は名前の行", /^控え\n\[契約\.pdf\]\(file:[0-9a-f]{64}\.pdf\)\n\[声\.wav\]$/.test(b.body), JSON.stringify(b.body));
  t.check("暗号化した文は一行の印", c.body === "題の無いノート\n[暗号化した文]", JSON.stringify(c.body));
  const stored = await page.evaluate(async (body) => {
    const id = KN.noteImg.idsIn(body)[0];
    return !!(await KN.noteImg.get(id));
  }, a.body);
  t.check("画像は入れ物に", stored);
  t.check("紙は閉じる", await page.waitForFunction(() => !document.querySelector(".js-go"), null, { timeout: 4000 }).then(() => true, () => false));

  /* ---- 二度目は飛ばす ---- */
  const [fc2] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.evaluate(() => KN.noteImport.open()).then(() => page.locator(".set-row", { hasText: "ファイルを選ぶ" }).last().click()),
  ]);
  await fc2.setFiles({ name: "旅のノート.enex", mimeType: "application/xml", buffer: Buffer.from(ENEX) });
  await page.waitForSelector(".js-go");
  await page.waitForTimeout(300);
  const second = await rows();
  t.check("二度目：取り込み済み3・押せない", has(second, "ノート 0") && has(second, "取り込み済み 3")
    && (await page.evaluate(() => document.querySelector(".js-go").disabled)), JSON.stringify(second));
  t.check("二度目：増えない", (await page.evaluate(() => KN.notes.list().filter((n) => n.src).length)) === 3);

  /* ---- 取り消す ---- */
  await page.evaluate(() => KN.ui.closeAll && KN.ui.closeAll());
  await page.evaluate((id) => KN.notes.edit(id, { body: "直した" }), a.id);
  const batches = await page.evaluate(() => KN.noteImport.batches());
  t.check("取り込みの一覧に一つ", batches.length === 1 && batches[0].books.join() === "Evernote 旅", JSON.stringify(batches));
  const n = await page.evaluate((bt) => KN.notes.unimport(bt), batches[0].batch);
  const after = await page.evaluate(() => ({ live: KN.notes.list().filter((x) => x.src).map((x) => x.title), trash: KN.notes.trash().filter((x) => x.src).length }));
  t.check("取り消す：直したノートは残る・ほかは最近削除へ", n === 2 && after.live.join() === "旅の支度 & 地図" && after.trash === 2, JSON.stringify(after));
  t.check("取り消すものが無ければ一覧に出ない", (await page.evaluate(() => KN.noteImport.batches().length)) === 0);
  const again = await page.evaluate(async (text) => {
    const b = KN.noteImport.parse(text, "旅のノート.enex");
    await KN.noteImport.keysOf(b);
    return KN.noteImport.run([b]);
  }, ENEX);
  t.check("取り消した分は、もう一度取り込める（直したものは飛ばす）", again.done === 2, JSON.stringify(again));

  t.check("頁の誤りなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
