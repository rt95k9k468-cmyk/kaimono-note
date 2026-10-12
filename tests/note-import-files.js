/* ノートの取り込み：原本・PDF の字・imports/（js/note-import.js・note-notion.js・note-file.js・
   docs/notes-unify.md「取り込みで決めたこと」）。

   画像は縮めた行のすぐ下に原本の行（files/<SHA>.png・中身はそのまま）／読む姿では原本の行を畳み、画像を押すと
   原本に差しかえる／冒頭は空・検索に名前／PDF の字を pdf.js で一度だけ（meta `ft:<id>`・検索に当たる）／
   控えの道で files/<id>.txt も送る・取る側は PDF と一緒に取る／Notion の表は CSV の原本（BOM のまま）を files/ へ／
   元のファイルを imports/<日>/ へ（大きいものは分けて送る）。

   本物の Dropbox には繋がない（page.route）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-import-files.js */
const crypto = require("crypto");
const zlib = require("zlib");
const { open, checker } = require("./lib");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const md5 = (buf) => crypto.createHash("md5").update(buf).digest("hex");

/** 字の入った一枚の PDF（Helvetica。xref の位置も正しく）。 */
function pdfWith(text) {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at = [];
  objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** 縮めない zip（名前は UTF-8 の印つき）。 */
function zip(entries) {
  const parts = [];
  const cen = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x800, 6);
    l.writeUInt32LE(zlib.crc32(raw), 14); l.writeUInt32LE(raw.length, 18); l.writeUInt32LE(raw.length, 22); l.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8);
    c.writeUInt32LE(zlib.crc32(raw), 16); c.writeUInt32LE(raw.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(off, 42);
    parts.push(l, name, raw);
    cen.push(c, name);
    off += 30 + name.length + raw.length;
  }
  const cd = Buffer.concat(cen);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

const PDF = pdfWith("Kurashi sample words");
const PDF_ID = `${sha(PDF)}.pdf`;
const PNG_ID = `${sha(PNG)}.png`;
const ENEX = `<?xml version="1.0" encoding="UTF-8"?>
<en-export export-date="20261012T000000Z" application="Evernote" version="10">
<note><title>原本の試験</title>
<content><![CDATA[<en-note><div>上</div><en-media type="image/png" hash="${md5(PNG)}"/><div>間</div><en-media type="application/pdf" hash="${md5(PDF)}"/></en-note>]]></content>
<created>20220101T000000Z</created>
<resource><data encoding="base64">${PNG.toString("base64")}</data><mime>image/png</mime><resource-attributes><file-name>写真.png</file-name></resource-attributes></resource>
<resource><data encoding="base64">${PDF.toString("base64")}</data><mime>application/pdf</mime><resource-attributes><file-name>説明.pdf</file-name></resource-attributes></resource>
</note>
</en-export>`;
const DBID = "5".repeat(32);
const CSV = Buffer.from("﻿名前,値\r\nりんご,3\r\n", "utf8");
const NOTION = zip([
  { name: `家計 ${DBID}.md`, data: "# 家計\n" },
  { name: `家計 ${DBID}_all.csv`, data: CSV },
]);

(async () => {
  const t = checker("note-import-files");
  const { browser, page, errors } = await open();

  /* ---- Dropbox のふり（分けて送る口も） ---- */
  const files = new Map();
  const calls = [];
  const sessions = new Map();
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (route, status, obj) =>
    route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) });
  await page.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const u = new URL(req.url());
    const h = req.headers();
    if (u.pathname === "/oauth2/token") return json(route, 200, { access_token: "acc", refresh_token: "ref", expires_in: 14400 });
    const arg = h["dropbox-api-arg"] ? JSON.parse(h["dropbox-api-arg"]) : null;
    calls.push({ path: u.pathname, arg });
    const body = () => req.postDataBuffer() || Buffer.alloc(0);
    const put = (a, buf) => {
      if (a.mode === "add" && files.has(a.path) && Buffer.compare(files.get(a.path), buf) !== 0) {
        if (!a.autorename) return false;
        a = { ...a, path: a.path.replace(/(\.[^./]+)?$/, " (1)$1") };
      }
      files.set(a.path, buf);
      return true;
    };
    if (u.pathname === "/2/files/upload") {
      if (!put(arg, body())) return json(route, 409, { error_summary: "path/conflict/file/.." });
      return json(route, 200, { name: arg.path.split("/").pop() });
    }
    if (u.pathname === "/2/files/upload_session/start") {
      const id = `s${sessions.size + 1}`;
      sessions.set(id, [body()]);
      return json(route, 200, { session_id: id });
    }
    if (u.pathname === "/2/files/upload_session/append_v2") {
      const s = sessions.get(arg.cursor.session_id);
      if (Buffer.concat(s).length !== arg.cursor.offset) return json(route, 409, { error_summary: "incorrect_offset/.." });
      s.push(body());
      return json(route, 200, null);
    }
    if (u.pathname === "/2/files/upload_session/finish") {
      const s = sessions.get(arg.cursor.session_id);
      if (Buffer.concat(s).length !== arg.cursor.offset) return json(route, 409, { error_summary: "incorrect_offset/.." });
      s.push(body());
      put(arg.commit, Buffer.concat(s));
      return json(route, 200, { name: arg.commit.path.split("/").pop() });
    }
    if (u.pathname === "/2/files/list_folder") return json(route, 200, { entries: [], has_more: false, cursor: "c" });
    if (u.pathname === "/2/files/get_metadata") {
      const { path } = JSON.parse(req.postData());
      if (!files.has(path)) return json(route, 409, { error_summary: "path/not_found/.." });
      return json(route, 200, { ".tag": "file", name: path.slice(1) });
    }
    if (u.pathname === "/2/files/download") {
      if (!files.has(arg.path)) return json(route, 409, { error_summary: "path/not_found/.." });
      return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "application/octet-stream" }, body: files.get(arg.path) });
    }
    return json(route, 200, {});
  });

  await page.evaluate(() => Promise.all([KN.notes.ready(), KN.noteFile.ready()]));

  /* ---- 1. Evernote：画像の原本・PDF の字 ---- */
  const res = await page.evaluate(async (text) => {
    const b = KN.noteImport.parse(text, "原本.enex");
    await KN.noteImport.keysOf(b);
    const r = await KN.noteImport.run([b]);
    await KN.notes.flush();
    return r;
  }, ENEX);
  const note = await page.evaluate(() => KN.notes.list().find((n) => n.title === "原本の試験"));
  t.check("取り込めた（読めない添付なし）", res.done === 1 && !res.fails.length, JSON.stringify(res));
  t.check("画像の行のすぐ下に原本の行（files/<SHA>.png）・PDF の行",
    new RegExp(`^上\\n!\\[\\]\\(img:[0-9a-f]{16}\\)\\n\\[写真\\.png\\]\\(file:${PNG_ID}\\)\\n間\\n\\[説明\\.pdf\\]\\(file:${PDF_ID}\\)$`).test(note && note.body),
    JSON.stringify(note && note.body));
  const orig = await page.evaluate(async (id) => {
    const r = await KN.noteFile.get(id);
    return r && { type: r.type, b64: btoa(String.fromCharCode(...new Uint8Array(r.bytes))) };
  }, PNG_ID);
  t.check("原本は中身のまま・種類は image/png", orig && orig.type === "image/png" && orig.b64 === PNG.toString("base64"), JSON.stringify(orig));

  const ft = await page.evaluate((id) => KN.noteFile.textOf(id), PDF_ID);
  t.check("PDF の字を取り出した", /Kurashi sample words/.test(ft), JSON.stringify(ft));
  const metaFt = await page.evaluate((id) => new Promise((ok) => {
    const r = indexedDB.open("kaimono-note-files");
    r.onsuccess = () => { const g = r.result.transaction("meta").objectStore("meta").get(`ft:${id}`); g.onsuccess = () => { ok(g.result && g.result.text); r.result.close(); }; };
  }), PDF_ID);
  t.check("字は meta の ft:<id> に", metaFt === ft);
  const look = await page.evaluate((b) => {
    const box = KN.noteFormat.render(b, document.createElement("div"));
    const img = box.querySelector(".nv-img");
    return {
      search: KN.noteFormat.searchable(b),
      plain: KN.noteFormat.plain(b.split("\n")[2]),
      orig: img && img.dataset.orig,
      hidden: box.querySelectorAll(".nv-orig").length,
      fileRows: [...box.querySelectorAll(".nv-file")].map((x) => x.dataset.file),
      lines: box.children.length,
    };
  }, note.body);
  t.check("検索に PDF の字と原本の名前", /Kurashi sample words/.test(look.search) && look.search.includes("写真.png"), JSON.stringify(look.search));
  t.check("冒頭に原本の名前を出さない", look.plain === "", JSON.stringify(look.plain));
  t.check("読む姿：原本の行は畳み、画像に預ける（行の数えは同じ）",
    look.orig === PNG_ID && look.hidden === 1 && look.fileRows.join() === PDF_ID && look.lines === 5, JSON.stringify(look));
  t.check("原本の行が画像のすぐ下でなければファイルの行", await page.evaluate((id) =>
    !!KN.noteFormat.render(`前\n[写真.png](file:${id})`, document.createElement("div")).querySelector(`.nv-file[data-file="${id}"]`), PNG_ID));
  t.check("ノートの検索で PDF の字に当たる", await page.evaluate(() => KN.notes.list().some((n) => KN.util.foldKana(KN.noteFormat.searchable(n.body)).includes(KN.util.foldKana("sample words")))));

  /* 画像を押すと、原本に差しかえる。 */
  await page.click('.tab[data-tab="notes"]');
  await page.waitForFunction(() => document.querySelector(".screen.is-active").dataset.screen === "notes"
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), null, { timeout: 4000 });
  await page.evaluate((i) => KN.screens.notes.open(i), note.id);
  await page.waitForSelector(".sheet.is-note.is-open .nv-img.is-on");
  t.check("読む姿に原本の行は見えない", await page.evaluate(() => {
    const el = document.querySelector(".sheet.is-note.is-open .nv-orig");
    return !!el && el.getBoundingClientRect().height === 0;
  }));
  await page.click(".sheet.is-note.is-open .nv-img.is-on");
  t.check("画像を押すと原本", await page.waitForFunction((id) => {
    const im = document.querySelector(".sheet.is-pic .note-pic img");
    return im && im.src === KN.noteFile.known(id);
  }, PNG_ID, { timeout: 4000 }).then(() => true, () => false));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 }).catch(() => {});

  /* ---- 2. Notion の表：CSV の原本を files/ へ ---- */
  const nres = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const book = await KN.noteNotion.read([new File([bytes], "Export.zip")]);
    const r = await KN.noteImport.run([book]);
    await KN.notes.flush();
    return r;
  }, NOTION.toString("base64"));
  const db = await page.evaluate(() => KN.notes.list().find((n) => n.title === "家計"));
  const CSV_ID = `${sha(CSV)}.csv`;
  t.check("表のノート：CSV の参照の行と表の行", nres.done === 1 && db && db.body === `[家計.csv](file:${CSV_ID})\n| 名前 | 値 |\n| --- | --- |\n| りんご | 3 |`,
    JSON.stringify(db && db.body));
  const csv = await page.evaluate(async (id) => {
    const r = await KN.noteFile.get(id);
    return r && { type: r.type, b64: btoa(String.fromCharCode(...new Uint8Array(r.bytes))) };
  }, CSV_ID);
  t.check("CSV は BOM ごと原本のまま・text/csv", csv && csv.type === "text/csv" && csv.b64 === CSV.toString("base64"), JSON.stringify(csv));

  /* ---- 3. Dropbox：files/ と字を送る・取る ---- */
  await page.evaluate(() => KN.dropbox.setAppKey("testkey"));
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.store.addTodo({ title: "原本の試験のやること" }));
  await page.evaluate(() => KN.dropbox.finish("code"));
  t.check("控えの道：原本・PDF・字・CSV を files/ へ",
    files.has(`/files/${PNG_ID}`) && files.has(`/files/${PDF_ID}`) && files.has(`/files/${CSV_ID}`)
      && String(files.get(`/files/${PDF_ID}.txt`) || "") === ft,
    JSON.stringify([...files.keys()].filter((k) => k.startsWith("/files/"))));
  const P2 = pdfWith("Second device");
  const ID2 = `${sha(P2)}.pdf`;
  files.set(`/files/${ID2}`, P2);
  files.set(`/files/${ID2}.txt`, Buffer.from("二台めの 字"));
  const pulled = await page.evaluate(async (id) => [await KN.noteFile.pull(id, "来た.pdf"), KN.noteFile.textOf(id)], ID2);
  t.check("取る側：PDF と一緒に字も", pulled[0] === true && pulled[1] === "二台めの 字", JSON.stringify(pulled));
  t.check("字の .txt でない名前は読まない", (await page.evaluate(() => KN.dropbox.download("/files/abc.txt").then(() => "ok", (e) => e.message))) !== "ok");

  /* ---- 4. 元のファイルを imports/<日>/ へ ---- */
  const BIG = 33 * 1024 * 1024 + 5;
  const day = await page.evaluate(async (n) => {
    const big = new Uint8Array(n);
    for (let i = 0; i < n; i += 4096) big[i] = (i / 4096) & 255;
    await KN.dropbox.putImport("2026-10-12", new File([big], "Export-大きい.zip"));
    await KN.dropbox.putImport("2026-10-12", new File(["a"], "メモ:1.enex"));
    await KN.dropbox.putImport("2026-10-12", new File(["b"], "メモ:1.enex"));
    return KN.util.dayKey(new Date());
  }, BIG);
  const big = files.get("/imports/2026-10-12/Export-大きい.zip");
  t.check("大きいものは分けて送る（start・append・finish）・中身は同じ",
    big && big.length === BIG && big[4096] === 1 && big[BIG - 5 - ((BIG - 5) % 4096)] === (((BIG - 5) / 4096) | 0) % 256
      && calls.some((c) => c.path === "/2/files/upload_session/finish" && c.arg.commit.path === "/imports/2026-10-12/Export-大きい.zip"),
    String(big && big.length));
  t.check("使えない字は置きかえ・同じ名前で中身が違えば番号",
    String(files.get("/imports/2026-10-12/メモ_1.enex")) === "a" && String(files.get("/imports/2026-10-12/メモ_1 (1).enex")) === "b",
    JSON.stringify([...files.keys()].filter((k) => k.startsWith("/imports/"))));
  await page.evaluate((text) => KN.noteImport.keepOriginals([new File([text], "原本.enex")], new Date().toISOString()), ENEX);
  t.check("取り込み終えたら imports/<その日>/ へ", await page.waitForFunction(() => true).then(async () => {
    for (let i = 0; i < 40 && !files.has(`/imports/${day}/原本.enex`); i++) await page.waitForTimeout(100);
    return String(files.get(`/imports/${day}/原本.enex`) || "") === ENEX;
  }));

  t.check("頁の誤りなし", !errors.length, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
