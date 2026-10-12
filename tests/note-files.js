/* ノートのファイル（PDF。js/note-file.js・docs/notes-unify.md「files/ で決めたこと」）。

   画像の道具から PDF を選ぶ → 入れ物に原本のまま一件（id は SHA-256 の64字.pdf）・本文に参照の一行・
   読むときは名前の行・押すと開く／同じ PDF は一件／カードの冒頭・検索は名前だけ／手元に無いと薄く、
   Dropbox の files/ から取ると濃く（名前とハッシュが違えば書かない）／Dropbox の控えの道でも files/ へ add で
   一度だけ／書き出しの zip に files/<id> と相対の参照／掃除（印から30日で消える・参照があれば消えない）。
   同期の道（.md より先に送る・ほかの端末が取る）は tests/notes-sync.js。

   本物の Dropbox には繋がない（page.route）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-files.js */
const crypto = require("crypto");
const { open, checker } = require("./lib");

const DB = "kaimono-note-files";

(async () => {
  const t = checker("note-files");
  const { browser, page, errors } = await open();

  /* ---- Dropbox のふり ---- */
  const files = new Map();
  const calls = [];
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
    if (u.pathname === "/2/files/upload") {
      if (arg.mode === "add" && files.has(arg.path)) return json(route, 409, { error_summary: "path/conflict/file/.." });
      files.set(arg.path, req.postDataBuffer());
      return json(route, 200, { name: arg.path.split("/").pop() });
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

  /* ---- 道具 ---- */
  const pdf = (seed) => Buffer.concat([Buffer.from(`%PDF-1.4\n%試験 ${seed}\n`), Buffer.from([0, 255, 128, seed]), Buffer.from("\n%%EOF\n")]);
  const idOf = (buf) => `${crypto.createHash("sha256").update(buf).digest("hex")}.pdf`;
  const P1 = pdf(1);
  const ID1 = idOf(P1);
  const toNotes = async () => {
    if ((await page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen)) === "notes") return;
    await page.click('.tab[data-tab="notes"]');
    await page.waitForFunction(() => document.querySelector(".screen.is-active").dataset.screen === "notes"
      && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), null, { timeout: 4000 });
  };
  const openNote = async (id) => {
    await toNotes();
    await page.evaluate((i) => KN.screens.notes.open(i), id);
    await page.waitForSelector(".sheet.is-note.is-open .js-view:not([hidden])");
  };
  const closeSheet = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });
  };
  const paste = async (lineEnd, file) => {
    await page.evaluate((at) => {
      const ta = document.querySelector(".sheet.is-note.is-open .js-text");
      ta.focus();
      ta.setSelectionRange(at, at);
    }, lineEnd);
    await page.waitForSelector(".sheet.is-note.is-open .note-tool[data-k=image]:not([hidden])", { timeout: 3000 });
    const [fc] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.click(".sheet.is-note.is-open .note-tool[data-k=image]"),
    ]);
    await fc.setFiles(file);
    await page.waitForFunction(() => {
      const b = document.querySelector(".sheet.is-note.is-open .note-tool[data-k=image]");
      return b && b.getAttribute("aria-disabled") === "false";
    }, null, { timeout: 10000 });
  };
  const field = () => page.$eval(".sheet.is-note.is-open .js-text", (e) => e.value);
  const keys = () => page.evaluate((name) => new Promise((res) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => {
      const d = r.result;
      const q = d.transaction("file").objectStore("file").getAll();
      q.onsuccess = () => { res(q.result.map((x) => ({ id: x.id, name: x.name, n: x.bytes.byteLength, buf: x.bytes instanceof ArrayBuffer }))); d.close(); };
    };
  }), DB);
  const drop = (id) => page.evaluate(([name, i]) => new Promise((res) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => {
      const d = r.result;
      const tx = d.transaction("file", "readwrite");
      tx.objectStore("file").delete(i);
      tx.oncomplete = () => { d.close(); res(); };
    };
  }), [DB, id]);
  const setOrphan = (at) => page.evaluate(([name, a]) => new Promise((res) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => {
      const d = r.result;
      const tx = d.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ k: "orphan", at: a });
      tx.oncomplete = () => { d.close(); res(); };
    };
  }), [DB, at]);

  await page.evaluate(() => Promise.all([KN.notes.ready(), KN.noteFile.ready()]));
  t.check("ファイルの入れ物が開く", (await page.evaluate(() => KN.noteFile.state())) === "on");
  const nid = await page.evaluate(() => {
    const n = { ...KN.notes.draft(), title: "PDF の試験", body: "一行目\n二行目", notebook: "仕事" };
    KN.notes.put(n);
    return KN.notes.flush().then(() => n.id);
  });

  /* ---- 1. 貼る ---- */
  await openNote(nid);
  await page.click(".sheet.is-note.is-open .js-view [data-line='0']");
  await paste(3, { name: "見積[1].pdf", mimeType: "application/pdf", buffer: P1 });
  const v1 = await field();
  t.check("PDF を選ぶと、カーソルの行の下に参照の一行（名前の角かっこは抜く）",
    v1 === `一行目\n[見積 1 .pdf](file:${ID1})\n二行目`, JSON.stringify(v1));
  const k1 = await keys();
  t.check("入れ物に原本のまま一件（id は SHA-256 の64字.pdf・ArrayBuffer）",
    k1.length === 1 && k1[0].id === ID1 && k1[0].n === P1.length && k1[0].buf, JSON.stringify(k1));
  t.check("画像の入れ物には入れない", (await page.evaluate(() => KN.noteImg.unsent())).length === 0);

  /* ---- 2. 読むとき ---- */
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForSelector(".sheet.is-note.is-open .js-view .nv-file:not(.is-away)", { timeout: 4000 }).catch(() => {});
  const row = await page.evaluate(() => {
    const el = document.querySelector(".sheet.is-note.is-open .js-view .nv-file");
    return el ? { text: el.textContent, away: el.classList.contains("is-away"), svg: !!el.querySelector("svg") } : null;
  });
  t.check("読むときは絵と名前の行", row && row.text === "見積 1 .pdf" && row.svg && !row.away, JSON.stringify(row));
  await page.evaluate(() => {
    window.__opened = [];
    window.__click0 = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { window.__opened.push({ href: this.href, target: this.target }); };
  });
  await page.click(".sheet.is-note.is-open .js-view .nv-file");
  const opened = await page.evaluate(() => {
    HTMLAnchorElement.prototype.click = window.__click0;
    return { o: window.__opened, writing: !document.querySelector(".sheet.is-note.is-open .js-text").hidden };
  });
  t.check("押すと開く（blob を新しい窓へ・書く欄へは入らない）",
    opened.o.length === 1 && opened.o[0].href.startsWith("blob:") && opened.o[0].target === "_blank" && !opened.writing, JSON.stringify(opened));
  await closeSheet();

  /* ---- 3. 同じ PDF は一件・カードの冒頭・検索 ---- */
  const again = await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return KN.noteFile.add(new File([bin], "別の名前.pdf", { type: "application/pdf" }));
  }, P1.toString("base64"));
  t.check("同じ PDF は一件（名前が違っても）", again.id === ID1 && (await keys()).length === 1);
  const u3 = await page.evaluate((id) => {
    const F = KN.noteFormat;
    const body = `[見積.pdf](file:${id})\n後`;
    return { plain: F.plain(body.split("\n")[0]), search: F.searchable(body), other: F.parse(`[x](file:${id.slice(0, 10)}.pdf)`).kind };
  }, ID1);
  t.check("カードの冒頭・検索は名前だけ（file: の字を拾わない）", u3.plain === "見積.pdf" && u3.search === "見積.pdf\n後", JSON.stringify(u3));
  t.check("形の違うリンクはファイルの行にしない", u3.other === "para", u3.other);
  t.check("PDF でないものは断る", (await page.evaluate(() => KN.noteFile.add(new File(["x"], "a.txt", { type: "text/plain" })).then(() => "ok", (e) => e.code))) === "file");

  /* ---- 4. Dropbox の控えの道：files/ へ add で一度だけ ---- */
  await page.evaluate(() => KN.dropbox.setAppKey("testkey"));
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.store.addTodo({ title: "ファイルの試験のやること" }));
  const r4 = await page.evaluate(() => KN.dropbox.finish("code"));
  const fileUps = () => calls.filter((c) => c.path === "/2/files/upload" && c.arg.path.startsWith("/files/"));
  t.check("控えの道でも files/<id> に add で・中身はそのまま",
    r4 === "sent" && fileUps().length === 1 && fileUps()[0].arg.path === `/files/${ID1}` && fileUps()[0].arg.mode === "add"
      && Buffer.compare(files.get(`/files/${ID1}`), P1) === 0, JSON.stringify([r4, fileUps().map((c) => c.arg)]));
  t.check("JSON に中身は入らない", !String(files.get("/kurashi-latest.json")).includes("%PDF"));
  await page.evaluate(() => KN.store.addTodo({ title: "もう一つ" }));
  await page.evaluate(() => KN.dropbox.sync());
  t.check("二回目は送らない", fileUps().length === 1);

  /* ---- 5. 手元に無い → 薄く、開くと files/ から取る ---- */
  const P2 = pdf(2);
  const ID2 = idOf(P2);
  const FAKE = `${"0".repeat(64)}.pdf`;
  files.set(`/files/${ID2}`, P2);
  files.set(`/files/${FAKE}`, P2);
  await drop(ID1);
  await page.evaluate(([i, a, b]) => {
    KN.notes.edit(i, { body: `${KN.notes.get(i).body}\n[来たもの.pdf](file:${a})\n[偽もの.pdf](file:${b})` });
    return KN.notes.flush();
  }, [nid, ID2, FAKE]);
  /* 読み直す（読んだ口を覚えていない端末として）。入れ物を一度読んでから（tests/README.md の罠）。 */
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("kaimono-note-notes");
    r.onsuccess = () => { const q = r.result.transaction("notes").objectStore("notes").getAll(); q.onsuccess = () => { r.result.close(); res(); }; };
  }));
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.noteFile);
  await page.evaluate(() => Promise.all([KN.notes.ready(), KN.noteFile.ready()]));
  await openNote(nid);
  await page.waitForFunction(([a]) => {
    const el = document.querySelector(`.sheet.is-note.is-open .nv-file[data-file="${a}"]`);
    return el && !el.classList.contains("is-away");
  }, [ID2], { timeout: 5000 }).catch(() => {});
  const r5 = await page.evaluate(([a, b, c]) => {
    const st = (id) => { const el = document.querySelector(`.sheet.is-note.is-open .nv-file[data-file="${id}"]`); return el ? el.classList.contains("is-away") : null; };
    return { got: st(a), fake: st(b), back: st(c) };
  }, [ID2, FAKE, ID1]);
  const k5 = (await keys()).map((x) => x.id);
  t.check("手元に無いファイルは開いたときに files/ から取る", r5.got === false && k5.includes(ID2), JSON.stringify([r5, k5]));
  t.check("消した手元のファイルも files/ から戻る", r5.back === false && k5.includes(ID1), JSON.stringify(r5));
  t.check("名前とハッシュが違うものは書かず、薄いまま", r5.fake === true && !k5.includes(FAKE), JSON.stringify(r5));
  await page.evaluate(() => { window.__opened = []; window.__click0 = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__opened.push(this.href); }; });
  await page.click(`.sheet.is-note.is-open .nv-file[data-file="${FAKE}"]`);
  const r5b = await page.evaluate(() => { HTMLAnchorElement.prototype.click = window.__click0; return { n: window.__opened.length, toast: (document.querySelector(".toast") || {}).textContent || "" }; });
  t.check("届いていないものは開かず一言", r5b.n === 0 && r5b.toast.includes("まだ届いていません"), JSON.stringify(r5b));
  t.check("files/ でない名前は読まない（形の門）",
    (await page.evaluate(() => KN.dropbox.download("/files/../x.pdf").then(() => "ok", (e) => e.message))) !== "ok");
  await closeSheet();

  /* ---- 6. 書き出し（zip） ---- */
  const zipped = await page.evaluate(async () => {
    const N = KN.notes;
    const list = N.list().filter((n) => n.title === "PDF の試験");
    const docs = await KN.noteFile.readMany(list.flatMap((n) => KN.noteFile.idsIn(n.body)));
    const blob = KN.notesExport.zipNotes(list, new Map(), docs);
    const u = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(u.buffer);
    const out = {};
    let p = 0;
    while (dv.getUint32(p, true) === 0x04034b50) {
      const size = dv.getUint32(p + 18, true);
      const nl = dv.getUint16(p + 26, true);
      const name = new TextDecoder().decode(u.subarray(p + 30, p + 30 + nl));
      const data = u.subarray(p + 30 + nl, p + 30 + nl + size);
      out[name] = name.endsWith(".md") ? new TextDecoder().decode(data) : data.length;
      p += 30 + nl + size;
    }
    return out;
  });
  const md = zipped["仕事/PDF の試験.md"] || "";
  t.check("zip に files/<id>（原本の大きさ）", zipped[`files/${ID1}`] === P1.length && zipped[`files/${ID2}`] === P2.length, Object.keys(zipped).join(" "));
  t.check("md の参照は ../files/ へ・手元に無いものは打ったまま",
    md.includes(`[見積 1 .pdf](../files/${ID1})`) && md.includes(`[偽もの.pdf](file:${FAKE})`) && !zipped[`files/${FAKE}`], md);

  /* ---- 7. 掃除（前の版の本文が参照するものは残す。画像と同じ） ---- */
  const P3 = pdf(3);
  const ID3 = idOf(P3);
  await page.evaluate((b64) => KN.noteFile.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "どこにも無い.pdf", { type: "application/pdf" })), P3.toString("base64"));
  const s1 = await page.evaluate(() => KN.noteFile.sweep());
  t.check("参照が無いと印だけ（まだ消さない）", s1 && s1.gone === 0 && (await keys()).some((x) => x.id === ID3), JSON.stringify(s1));
  const old = Date.now() - 31 * 864e5;
  await setOrphan({ [ID3]: old, [ID2]: old });
  const s2 = await page.evaluate(() => KN.noteFile.sweep());
  const k7 = (await keys()).map((x) => x.id);
  t.check("印から30日で消える・参照があるもの（前の版を含む）は残る",
    s2 && s2.gone === 1 && !k7.includes(ID3) && k7.includes(ID2) && k7.includes(ID1), JSON.stringify([s2, k7]));

  t.check("エラーなし", errors.length === 0, errors.join("\n"));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
