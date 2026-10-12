/* ノートの段5「画像」（docs/image-design.md の「試験」の13項目）。

   貼る（4000×3000 → 長辺1600・入れ物に一件・本文に参照の一行・読むときに画像）／順序（書き込みを
   落とすと参照が入らない・一言だけ）／同じ画像は一件・ノートの形と noteBook の v は変わらない／
   行を消して前の版に戻すと画像が出る／掃除（印 → 30日進めて開き直すと消える・参照が戻れば印が外れる）／
   掃除をしない日（ノートの入れ物が off・前の版が読めない・ノート0件・doubt）／見つからない画像は枠・
   本文は同じ／容量（estimate が小さいと断る・put が投げても本文は書ける）／画像の入れ物が開かない日は
   道具の絵が無い・ノートは書ける／書き出し（zip に images/<id>.jpg と相対の参照・まとめる md は打ったまま）／
   Dropbox（JSON に画像が入らない・画像は一度だけ・戻すと手元に無い画像を読む・名前とハッシュが違えば
   書かない）／plain・検索・カードの冒頭が参照を出さない・http の画像は画像にならず fetch もしない／
   段5より前のノートは読み込みの前後で同じ・入れ物の版は1のまま。

   画像は台本の中で canvas から作る。本物の Dropbox には繋がない（page.route）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/note-images.js */
const { open, checker } = require("./lib");

const IMG_DB = "kaimono-note-images";

(async () => {
  const t = checker("note-images");
  const { browser, ctx, page, errors } = await open();

  /* ---- Dropbox のふり（11） ---- */
  const files = new Map();
  const calls = [];
  let outside = 0;
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
    /* 送る役を決める（js/dropbox.js の role）。無ければ本物と同じく not_found——{} を返すと「二台め」と読む。 */
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
  /* 打った http の画像を読みに行かないこと（12）。 */
  await page.route("https://example.com/**", (route) => { outside++; route.fulfill({ status: 404, body: "" }); });

  /* ---- 道具 ---- */
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  const toNotes = async () => {
    if ((await page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen)) === "notes") return;
    await page.click('.tab[data-tab="notes"]');
    await settled("notes");
  };
  const closeSheet = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-note"), null, { timeout: 3000 });
  };
  const openNote = async (id) => {
    await toNotes();
    await page.evaluate((i) => KN.screens.notes.open(i), id);
    await page.waitForSelector(".sheet.is-note.is-open .js-view:not([hidden])");
  };
  /* 試験の画像（JPEG）。seed で中身を変える。中身は node へ base64 で。 */
  const picture = (w, h, seed) => page.evaluate(([w2, h2, s]) => {
    const cv = document.createElement("canvas");
    cv.width = w2; cv.height = h2;
    const g = cv.getContext("2d");
    const gr = g.createLinearGradient(0, 0, w2, h2);
    gr.addColorStop(0, `hsl(${s * 47 % 360} 70% 50%)`);
    gr.addColorStop(1, `hsl(${(s * 47 + 120) % 360} 70% 40%)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w2, h2);
    g.fillStyle = "#fff";
    g.font = `${Math.round(h2 / 6)}px sans-serif`;
    g.fillText(`試験 ${s}`, w2 / 10, h2 / 2);
    return cv.toDataURL("image/jpeg", 0.9).split(",")[1];
  }, [w, h, seed]);
  const asFile = async (w, h, seed) => ({ name: `p${seed}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(await picture(w, h, seed), "base64") });
  /* 書く欄で、その行の終わりにカーソルを置いて画像を選ぶ。 */
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
  const imgKeys = () => page.evaluate((name) => new Promise((res) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => {
      const d = r.result;
      const q = d.transaction("img").objectStore("img").getAll();
      q.onsuccess = () => { res(q.result.map((x) => ({ id: x.id, w: x.w, h: x.h, n: x.bytes.byteLength, blob: x.bytes instanceof ArrayBuffer }))); d.close(); };
    };
  }), IMG_DB);
  const metaOf = (k) => page.evaluate(([name, key]) => new Promise((res) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => {
      const d = r.result;
      const q = d.transaction("meta").objectStore("meta").get(key);
      q.onsuccess = () => { res(q.result || null); d.close(); };
    };
  }), [IMG_DB, k]);
  const setOrphan = (at) => page.evaluate(([name, a]) => new Promise((res) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => {
      const d = r.result;
      const tx = d.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ k: "orphan", at: a });
      tx.oncomplete = () => { d.close(); res(); };
    };
  }), [IMG_DB, at]);
  const dropImg = (id) => page.evaluate(([name, i]) => new Promise((res) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => {
      const d = r.result;
      const tx = d.transaction("img", "readwrite");
      tx.objectStore("img").delete(i);
      tx.oncomplete = () => { d.close(); res(); };
    };
  }), [IMG_DB, id]);
  const addLoose = (b64) => page.evaluate((b) => {
    const bin = atob(b);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return KN.noteImg.add(new File([u], "x.jpg", { type: "image/jpeg" }));
  }, b64);
  /* 読み直し。ノートを書いた直後に捨てないよう、入れ物を一度読んでから（tests/README.md の罠）。 */
  const reload = async () => {
    await page.evaluate(() => KN.notes.flush());
    await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open("kaimono-note-notes");
      r.onsuccess = () => { const q = r.result.transaction("notes").objectStore("notes").getAll(); q.onsuccess = () => { r.result.close(); res(); }; };
    }));
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.noteImg);
    await page.evaluate(() => Promise.all([KN.notes.ready(), KN.noteImg.ready()]));
    await page.waitForTimeout(300);
  };

  await page.evaluate(() => Promise.all([KN.notes.ready(), KN.noteImg.ready()]));
  t.check("画像の入れ物が開く", (await page.evaluate(() => KN.noteImg.state())) === "on");

  /* 段5より前のノート（13）と、試験のノート。 */
  const OLD = "# 古いノート\n- 箇条\n![](http://example.com/a.png)\n![](img:0123456789ABCDEF)\n  ![](img:0123456789abcdef)\n本文";
  const ids = await page.evaluate((old) => {
    const N = KN.notes;
    const a = { ...N.draft(), title: "画像の試験", body: "一行目\n二行目", notebook: "旅" };
    const b = { ...N.draft(), title: "古い", body: old };
    N.put(a); N.put(b);
    return N.flush().then(() => ({ a: a.id, b: b.id }));
  }, OLD);

  /* ---- 1. 貼る ---- */
  await openNote(ids.a);
  await page.click(".sheet.is-note.is-open .js-view [data-line='0']");
  await paste(3, await asFile(4000, 3000, 1));
  const v1 = await field();
  const m1 = /^一行目\n!\[\]\(img:([0-9a-f]{16})\)\n二行目$/.exec(v1);
  const A = m1 ? m1[1] : "";
  t.check("貼ると、カーソルの行の下に参照の一行", !!m1, JSON.stringify(v1));
  const k1 = await imgKeys();
  t.check("入れ物に一件・長辺1600・ArrayBuffer", k1.length === 1 && k1[0].id === A && k1[0].w === 1600 && k1[0].h === 1200 && k1[0].blob,
    JSON.stringify(k1));
  t.check("縮めた中身は 1MB より小さい", k1[0] && k1[0].n < 1e6, k1[0] && k1[0].n);
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForFunction(() => {
    const im = document.querySelector(".sheet.is-note.is-open .js-view .nv-img.is-on img");
    return im && im.complete && im.naturalWidth > 0;
  }, null, { timeout: 4000 }).catch(() => {});
  const shown = await page.evaluate(() => {
    const el = document.querySelector(".sheet.is-note.is-open .js-view .nv-img.is-on");
    const im = el && el.querySelector("img");
    const r = el && el.getBoundingClientRect();
    const box = document.querySelector(".sheet.is-note.is-open .js-view").getBoundingClientRect();
    return { w: im ? im.naturalWidth : 0, full: r ? Math.abs(r.width - box.width) < 2 : false, ratio: r ? r.width / r.height : 0 };
  });
  t.check("読むときは幅いっぱいの画像（中身は1600幅）", shown.w === 1600 && shown.full && Math.abs(shown.ratio - 4 / 3) < 0.02, JSON.stringify(shown));
  t.check("本文は参照の一行のまま保存される", (await page.evaluate((i) => KN.notes.get(i).body, ids.a)) === v1);
  /* 押すと黒地の一枚で全体。 */
  await page.click(".sheet.is-note.is-open .js-view .nv-img.is-on");
  await page.waitForSelector(".sheet.is-pic.is-open .note-pic img", { timeout: 3000 }).catch(() => {});
  const pic = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-pic.is-open");
    return s ? getComputedStyle(s).backgroundColor : "";
  });
  t.check("画像を押すと黒地の一枚", pic === "rgb(0, 0, 0)", pic);
  t.check("画像を押しても書く欄へは入らない", await page.$eval(".sheet.is-note.is-open .js-text", (e) => e.hidden));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-pic"), null, { timeout: 3000 }).catch(() => {});

  /* ---- 2・8. 順序と容量：書けなければ参照を入れない・一言・本文は書ける ---- */
  await page.click(".sheet.is-note.is-open .js-view [data-line='2']");
  await page.evaluate((name) => {
    const put = IDBObjectStore.prototype.put;
    window.__realPut = put;
    IDBObjectStore.prototype.put = function (...a) {
      if (this.transaction.db.name === name && this.name === "img") throw new DOMException("試験", "QuotaExceededError");
      return put.apply(this, a);
    };
  }, IMG_DB);
  const before2 = await field();
  await paste(before2.length, await asFile(800, 600, 2));
  const toast2 = await page.evaluate(() => [...document.querySelectorAll(".toast")].map((x) => x.textContent).join("|"));
  t.check("画像の書き込みが落ちると、参照が入らない", (await field()) === before2);
  t.check("落ちたら「画像を保存できませんでした」", toast2.includes("画像を保存できませんでした"), toast2);
  t.check("落ちた画像は入れ物に無い", (await imgKeys()).length === 1);
  await page.keyboard.type("\n打てる");
  await page.evaluate(() => KN.notes.flush());
  const raw2 = await page.evaluate((i) => new Promise((res) => {
    const r = indexedDB.open("kaimono-note-notes");
    r.onsuccess = () => { const q = r.result.transaction("notes").objectStore("notes").get(i); q.onsuccess = () => { res(q.result); r.result.close(); }; };
  }), ids.a);
  t.check("画像の put が投げても、本文は入れ物に書ける", raw2 && raw2.body.endsWith("打てる"), raw2 && raw2.body);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.__realPut; });
  /* estimate が残りを小さく言う → 書く前に断る。 */
  await page.evaluate(() => {
    window.__est = navigator.storage.estimate;
    navigator.storage.estimate = () => Promise.resolve({ quota: 50e6, usage: 49e6 });
  });
  const before8 = await field();
  await paste(before8.length, await asFile(800, 600, 8));
  t.check("枠が残り少ないと断る（参照なし・入れ物は一件のまま）", (await field()) === before8 && (await imgKeys()).length === 1);
  await page.evaluate(() => { navigator.storage.estimate = window.__est; });

  /* ---- 3. 同じ画像を二度 → 一件・ノートの形と noteBook の v は同じ ---- */
  const before3 = await field();
  await paste(before3.length, await asFile(4000, 3000, 1));
  const v3 = await field();
  t.check("同じ画像を二度貼ると、参照は二つ・入れ物は一件",
    (v3.match(new RegExp(`!\\[\\]\\(img:${A}\\)`, "g")) || []).length === 2 && (await imgKeys()).length === 1, v3);
  await closeSheet();
  await page.evaluate(() => KN.notes.flush());
  const shape = await page.evaluate((i) => new Promise((res) => {
    const r = indexedDB.open("kaimono-note-notes");
    r.onsuccess = () => {
      const d = r.result;
      const q = d.transaction("notes").objectStore("notes").get(i);
      q.onsuccess = () => { res({ keys: Object.keys(q.result).sort().join(","), v: d.version, stores: [...d.objectStoreNames].join(","), bookV: KN.notes.forExport().noteBook.v }); d.close(); };
    };
  }), ids.a);
  t.check("ノートの形・入れ物の版・noteBook の v は変わらない",
    shape.keys === "body,createdAt,deletedAt,fav,id,notebook,tags,title,updatedAt" && shape.v === 1 && shape.stores === "meta,notes" && shape.bookV === 1,
    JSON.stringify(shape));

  /* ---- 4. 行を消す → 前の版に戻す → 画像が出る ---- */
  await page.evaluate((i) => {
    const N = KN.notes;
    N.begin(i);
    N.edit(i, { body: "一行目\n二行目" });
    return N.flush();
  }, ids.a);
  const swept4 = await page.evaluate(() => KN.noteImg.sweep());
  const orphan4 = await metaOf("orphan");
  t.check("本文から消しても、前の版が参照を持つあいだは印が付かない", swept4 && swept4.gone === 0 && !(orphan4 && orphan4.at && A in orphan4.at),
    JSON.stringify(orphan4));
  const back = await page.evaluate((i) => KN.notes.versions(i).then((vs) => {
    const v = vs.find((x) => x.body.includes("![](img:"));
    return v ? KN.notes.revert(i, v) : false;
  }), ids.a);
  await openNote(ids.a);
  await page.waitForSelector(".sheet.is-note.is-open .js-view .nv-img.is-on img", { timeout: 4000 }).catch(() => {});
  t.check("前の版に戻すと画像が出る", back && (await page.$$(".sheet.is-note.is-open .js-view .nv-img.is-on")).length === 2);
  await closeSheet();

  /* ---- 5. 掃除 ---- */
  const O = await addLoose(await picture(600, 400, 5));
  const P = await addLoose(await picture(600, 400, 6));
  await page.evaluate(() => KN.noteImg.sweep());
  const o5 = await metaOf("orphan");
  t.check("参照の無い画像に印", o5 && O in o5.at && P in o5.at && !(A in o5.at), JSON.stringify(o5));
  await page.evaluate(([i, p]) => { KN.notes.edit(i, { body: `${KN.notes.get(i).body}\n![](img:${p})` }); return KN.notes.flush(); }, [ids.a, P]);
  await page.evaluate(() => KN.noteImg.sweep());
  const o5b = await metaOf("orphan");
  t.check("参照が戻れば印が外れる", o5b && O in o5b.at && !(P in o5b.at), JSON.stringify(o5b));
  t.check("印を付けただけでは消えない", (await imgKeys()).some((x) => x.id === O));
  await page.clock.install({ time: Date.now() + 31 * 864e5 });
  await reload();
  await page.waitForFunction(() => KN.noteImg.swept(), null, { timeout: 15000 }).catch(() => {});
  const r5 = await page.evaluate(() => (KN.noteImg.swept() ? KN.noteImg.swept() : null));
  const k5 = (await imgKeys()).map((x) => x.id);
  t.check("30日たって開き直すと、参照の無い画像は消える（参照のあるものは残る）",
    r5 && r5.gone === 1 && !k5.includes(O) && k5.includes(P) && k5.includes(A), JSON.stringify([r5, k5]));

  /* ---- 6. 掃除をしない日 ---- */
  const Q = await addLoose(await picture(600, 400, 7));
  await setOrphan({ [Q]: 1 });
  const skipWhen = async (label, stub, undo) => {
    await page.evaluate(stub);
    const r = await page.evaluate(() => KN.noteImg.sweep());
    await page.evaluate(undo);
    t.check(`掃除をしない日：${label}`, r === "skip" && (await imgKeys()).some((x) => x.id === Q), JSON.stringify(r));
  };
  await skipWhen("ノートの入れ物が on でない",
    () => { window.__st = KN.notes.state; KN.notes.state = () => "off"; }, () => { KN.notes.state = window.__st; });
  await skipWhen("前の版を読めない",
    () => { window.__vb = KN.notes.versionBodies; KN.notes.versionBodies = () => Promise.reject(new Error("x")); },
    () => { KN.notes.versionBodies = window.__vb; });
  await skipWhen("ノートが0件",
    () => { window.__l = [KN.notes.list, KN.notes.trash]; KN.notes.list = () => []; KN.notes.trash = () => []; },
    () => { [KN.notes.list, KN.notes.trash] = window.__l; });
  await skipWhen("doubt がノートの減りを言っている",
    () => { window.__d = KN.backup.doubt; KN.backup.doubt = () => ({ record: null, notes: { at: "", total: 9 } }); },
    () => { KN.backup.doubt = window.__d; });
  const r6 = await page.evaluate(() => KN.noteImg.sweep());
  t.check("ふだんの日なら同じ画像は消える（止めていたのは条件）", r6 && r6.gone === 1 && !(await imgKeys()).some((x) => x.id === Q));

  /* ---- 7. 見つからない ---- */
  const body7 = await page.evaluate((i) => KN.notes.get(i).body, ids.a);
  await dropImg(P);
  await reload();
  await openNote(ids.a);
  await page.waitForSelector(".sheet.is-note.is-open .js-view .nv-img.is-gone svg", { timeout: 4000 }).catch(() => {});
  const gone7 = await page.evaluate(() => {
    const g = document.querySelector(".sheet.is-note.is-open .js-view .nv-img.is-gone");
    return g ? { text: g.textContent.trim(), svg: !!g.querySelector("svg") } : null;
  });
  t.check("見つからない画像は枠に絵だけ（字は出さない）", gone7 && gone7.svg && !gone7.text, JSON.stringify(gone7));
  t.check("見つからなくても本文の文字は同じ", (await page.evaluate((i) => KN.notes.get(i).body, ids.a)) === body7);
  await closeSheet();

  /* ---- 10. 書き出し ---- */
  const zipped = await page.evaluate(async (old) => {
    const N = KN.notes;
    const root = { ...N.draft(), title: "根のノート", body: `前\n![](img:${N.list().map((n) => KN.noteImg.idsIn(n.body)).flat()[0]})\n後` };
    N.put(root);
    const list = N.list().filter((n) => n.title !== "古い");
    const pics = await KN.noteImg.readMany(list.flatMap((n) => KN.noteImg.idsIn(n.body)));
    const blob = KN.notesExport.zipNotes(list, pics);
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
    const one = KN.notesExport.oneFile(list);
    N.drop(root.id);
    return { out, one };
  }, OLD);
  const zn = Object.keys(zipped.out);
  t.check("zip に images/<id>.jpg", typeof zipped.out[`images/${A}.jpg`] === "number" && zipped.out[`images/${A}.jpg`] > 1000, zn.join(" "));
  t.check("ノートブックのフォルダの md は ../images/ へ", (zipped.out["旅/画像の試験.md"] || "").includes(`![](../images/${A}.jpg)`)
    && !(zipped.out["旅/画像の試験.md"] || "").includes(`img:${A}`), zipped.out["旅/画像の試験.md"]);
  t.check("根の md は images/ へ", (zipped.out["根のノート.md"] || "").includes(`![](images/${A}.jpg)`), zipped.out["根のノート.md"]);
  t.check("手元に無い画像の行は打ったまま・zip にも入れない",
    (zipped.out["旅/画像の試験.md"] || "").includes(`![](img:${P})`) && !zn.includes(`images/${P}.jpg`));
  t.check("1つにまとめる md は参照の行のまま", zipped.one.includes(`![](img:${A})`) && !zipped.one.includes("images/"));

  /* ---- 10b. 印刷・PDF（複数のノートを一枚に。画像は描けてから print） ---- */
  const pr = await page.evaluate(async () => {
    window.__printed = 0;
    window.__print0 = window.print;
    window.print = () => { window.__printed++; };
    const extra = { ...KN.notes.draft(), title: "字だけのノート", body: "一行目\n- 二行目" };
    KN.notes.put(extra);
    window.__extra = extra.id;
    const list = KN.notes.list().filter((n) => n.title !== "古い");
    const pics = await KN.noteImg.readMany(list.flatMap((n) => KN.noteImg.idsIn(n.body)));
    KN.notesExport.printNotes(list, pics);
    const t0 = Date.now();
    while (!window.__printed && Date.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 50));
    const el = document.getElementById("notes-print");
    const ims = [...el.querySelectorAll("img")];
    return {
      printed: window.__printed,
      notes: el.querySelectorAll(".np-note").length,
      count: list.length,
      drawn: ims.length > 0 && ims.every((i) => i.complete && i.naturalWidth > 0),
      gone: el.querySelectorAll(".nv-img.is-gone").length,
      screenHidden: getComputedStyle(el).display === "none",
      marked: document.documentElement.classList.contains("is-printing-notes"),
    };
  });
  t.check("印刷：print は一度・ノートは全部が一枚に", pr.printed === 1 && pr.notes === pr.count && pr.count > 1, JSON.stringify(pr));
  t.check("印刷：画像は描けてから", pr.drawn, JSON.stringify(pr));
  t.check("印刷：手元に無い画像は枠", pr.gone >= 1, JSON.stringify(pr));
  t.check("印刷：画面には出ない", pr.screenHidden && pr.marked);
  await page.emulateMedia({ media: "print" });
  const pm = await page.evaluate(() => ({
    book: getComputedStyle(document.getElementById("notes-print")).display,
    app: [...document.body.children].filter((c) => c.id !== "notes-print" && getComputedStyle(c).display !== "none").length,
  }));
  t.check("印刷のあいだは一枚だけ", pm.book === "block" && pm.app === 0, JSON.stringify(pm));
  await page.emulateMedia({ media: "screen" });
  const cleaned = await page.evaluate(() => {
    window.dispatchEvent(new Event("afterprint"));
    window.print = window.__print0;
    KN.notes.drop(window.__extra);
    return !document.getElementById("notes-print") && !document.documentElement.classList.contains("is-printing-notes");
  });
  t.check("印刷が済めば一枚は消える", cleaned);

  /* ---- 11. Dropbox ---- */
  await page.evaluate(() => KN.dropbox.setAppKey("testkey"));
  await page.waitForFunction(() => !!KN.dropbox.authUrl());
  await page.evaluate(() => KN.store.addTodo({ title: "画像の試験のやること" }));
  const r11 = await page.evaluate(() => KN.dropbox.finish("code"));
  const ups = () => calls.filter((c) => c.path === "/2/files/upload");
  const imgUps = () => ups().filter((c) => c.arg.path.startsWith("/images/"));
  const latest = JSON.parse(files.get("/kurashi-latest.json") || "{}");
  const notesIn = (latest.noteBook && latest.noteBook.notes) || [];
  t.check("Dropbox：JSON はノートの本文に参照の文字だけ（画像の中身は入らない）",
    r11 === "sent" && notesIn.some((n) => n.body.includes(`![](img:${A})`)) && files.get("/kurashi-latest.json").length < 60000,
    `${r11} ${files.get("/kurashi-latest.json") && files.get("/kurashi-latest.json").length}`);
  const sent = await page.evaluate(() => KN.noteImg.unsent());
  const localA = await page.evaluate((i) => KN.noteImg.get(i).then((r) => r.bytes.byteLength), A);
  t.check("画像は images/<id>.jpg に add で一枚ずつ・中身はそのまま",
    imgUps().length === 1 && imgUps()[0].arg.path === `/images/${A}.jpg` && imgUps()[0].arg.mode === "add"
      && files.get(`/images/${A}.jpg`).length === localA && sent.length === 0, JSON.stringify(imgUps().map((c) => c.arg)));
  await page.evaluate(() => KN.store.addTodo({ title: "もう一つ" }));
  const r11b = await page.evaluate(() => KN.dropbox.sync());
  t.check("二回目は画像を送らない", r11b === "sent" && imgUps().length === 1, `${r11b} ${imgUps().length}`);
  /* 戻す：手元から消した画像を読み直す。名前とハッシュが違うものは書かない。 */
  const fake = "fedcba9876543210";
  files.set(`/images/${fake}.jpg`, files.get(`/images/${A}.jpg`));
  await page.evaluate(([i, f]) => { KN.notes.edit(i, { body: `${KN.notes.get(i).body}\n![](img:${f})` }); return KN.notes.flush(); }, [ids.a, fake]);
  await dropImg(A);
  const pulled = await page.evaluate(() => KN.noteImg.pullMissing());
  const k11 = (await imgKeys()).map((x) => x.id);
  t.check("Dropbox の控えから戻すと、手元に無い画像を読む", pulled === 1 && k11.includes(A), `${pulled} ${k11.join(",")}`);
  t.check("名前とハッシュが違う画像は書かない", !k11.includes(fake));
  const dl = calls.filter((c) => c.path === "/2/files/download").map((c) => c.arg.path);
  /* P は 7 で手元から消してあり、Dropbox にも無い（読みに行って無いと言われる）。 */
  t.check("読むのは手元に無いものだけ", dl.length === 3 && dl.includes(`/images/${A}.jpg`) && dl.includes(`/images/${fake}.jpg`)
    && dl.includes(`/images/${P}.jpg`), dl.join(" "));
  t.check("images/ でない名前は読まない（形の門）", (await page.evaluate(() => KN.dropbox.download("/images/../x.jpg").then(() => "ok", (e) => e.message))) !== "ok");

  /* ---- 12. plain・検索・カードの冒頭 ---- */
  const u12 = await page.evaluate((a) => {
    const F = KN.noteFormat;
    const N = KN.notes;
    const n = { ...N.draft(), body: `![](img:${a})\n本文の頭` };
    N.put(n);
    const res = {
      plain: F.plain(`![](img:${a})`),
      head: N.headOf(n),
      http: F.parse("![](http://example.com/a.png)").kind,
      search: KN.searchAll.find(`img:${a}`).groups.filter((g) => g.id === "notes").length,
      search2: KN.searchAll.find(a.slice(0, 8)).groups.filter((g) => g.id === "notes").length,
    };
    N.drop(n.id);
    return res;
  }, A);
  t.check("plain は画像の行を空にする・題の代わりは次の行", u12.plain === "" && u12.head === "本文の頭", JSON.stringify(u12));
  t.check("ぜんぶをさがすが参照の字を拾わない", u12.search === 0 && u12.search2 === 0, JSON.stringify(u12));
  t.check("http の画像は画像の行にならない", u12.http === "para");
  await toNotes();
  /* 「古い」は参照でない形の「img」を素の文字で持つ（効いた印）。「画像の試験」は参照の行だけ。 */
  await page.click(".js-search-btn");
  await page.fill("#screen-notes .js-search", "img");
  await page.waitForFunction((b) => {
    const rows = [...document.querySelectorAll("#screen-notes .note-row")];
    return rows.length && rows.every((r) => r.dataset.id === b);
  }, ids.b, { timeout: 3000 }).catch(() => {});
  const cards = await page.evaluate(() => [...document.querySelectorAll("#screen-notes .note-row")].map((r) => r.dataset.id));
  t.check("ノートの検索が参照の字を拾わない", cards.length === 1 && cards[0] === ids.b, cards.join(" "));
  await page.fill("#screen-notes .js-search", "");
  await page.waitForSelector(`#screen-notes .note-row[data-id="${ids.a}"]`, { timeout: 3000 }).catch(() => {});
  const cardA = await page.$eval(`#screen-notes .note-row[data-id="${ids.a}"]`, (r) => r.textContent).catch(() => "");
  t.check("カードの冒頭に参照の字が出ない", cardA.includes("一行目") && !cardA.includes("img:"), cardA);

  /* ---- 13. 古い形 ---- */
  await openNote(ids.b);
  const view13 = await page.evaluate(() => ({
    imgs: document.querySelectorAll(".sheet.is-note.is-open .js-view .nv-img, .sheet.is-note.is-open .js-view img").length,
  }));
  await closeSheet();
  await reload();
  const after13 = await page.evaluate((i) => KN.notes.get(i).body, ids.b);
  t.check("ほかの形の画像（http・大文字・字下げ）は画像にならない", view13.imgs === 0, JSON.stringify(view13));
  t.check("段5より前のノートは読み込みの前後で同じ文字列", after13 === OLD, JSON.stringify(after13));
  t.check("打った http の画像を読みに行かない", outside === 0, outside);
  const vers = await page.evaluate(() => Promise.all(["kaimono-note-notes", "kaimono-note-images"].map((n) => new Promise((res) => {
    const r = indexedDB.open(n);
    r.onsuccess = () => { res(r.result.version); r.result.close(); };
  }))));
  t.check("入れ物の版は1のまま", vers[0] === 1 && vers[1] === 1, vers.join(","));
  t.check("頁のエラーなし", errors.length === 0, errors.join(" / "));
  await browser.close();

  /* ---- 9. 画像の入れ物が開かない日 ---- */
  const o9 = await open({
    before: (c) => c.addInitScript(() => {
      const real = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, ...a) {
        if (name === "kaimono-note-images") throw new DOMException("試験", "UnknownError");
        return real.call(this, name, ...a);
      };
    }),
  });
  const p9 = o9.page;
  await p9.evaluate(() => Promise.all([KN.notes.ready(), KN.noteImg.ready()]));
  const id9 = await p9.evaluate(() => {
    const n = { ...KN.notes.draft(), title: "開かない日", body: "はじめ\n![](img:0123456789abcdef)" };
    KN.notes.put(n);
    return KN.notes.flush().then(() => n.id);
  });
  await p9.evaluate(() => KN.app.showScreen("archive"));
  await p9.waitForTimeout(500);
  await p9.evaluate((i) => KN.screens.notes.open(i), id9);
  await p9.waitForSelector(".sheet.is-note.is-open .js-view .nv-img.is-gone svg", { timeout: 4000 }).catch(() => {});
  t.check("入れ物が開かない日：state は off・参照の行は枠", (await p9.evaluate(() => KN.noteImg.state())) === "off"
    && (await p9.$$(".sheet.is-note.is-open .js-view .nv-img.is-gone")).length === 1);
  await p9.click(".sheet.is-note.is-open .js-view [data-line='0']");
  await p9.waitForSelector(".sheet.is-note.is-open .note-tools", { state: "visible" });
  t.check("入れ物が開かない日：道具の帯に画像の絵が無い",
    await p9.$eval(".sheet.is-note.is-open .note-tool[data-k=image]", (b) => b.hidden && getComputedStyle(b).display === "none"));
  await p9.keyboard.type("書ける");
  await p9.evaluate(() => KN.notes.flush());
  t.check("入れ物が開かない日：ノートは書ける", (await p9.evaluate((i) => KN.notes.get(i).body, id9)).startsWith("はじめ書ける"));
  t.check("頁のエラーなし（開かない日）", o9.errors.length === 0, o9.errors.join(" / "));
  await o9.browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
