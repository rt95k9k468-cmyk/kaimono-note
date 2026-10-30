/* ノートの同期（docs/notes-unify.md「同期」、段2。js/notes-sync.js）。

   本物の Dropbox には繋がない。二つの頁（二台の端末）が、node の中の一つの偽の Dropbox を分け合う
   （page.route。rev・ファイルの id・list_folder の cursor・move_v2・delete_v2 の parent_rev・429）。

   - 形：.md の行き来で一字も変わらない・id の無いものは読まない・`# 題` を足さない。
   - 色はノートの入れ物へ写す（settings.noteColors は残す）。
   - はじめての端末は足し合わせる（どちらも消さない）。
   - 片方ずつの欄は両方の変更を取る。両方が本文を直したら新しいほう、もう片方は前の版（二つの版）。
   - 題を変えるとファイルが動く（同じファイルの id のまま）。消した印は .trash へ。
   - 本当に消した端末のファイルは消え、ほかの端末は最近削除に残したまま送り返さない。
   - 一度にたくさん無くなったら止まる → 合わせ直すと足し合わせで戻る。
   - 開いて書いているノートには、閉じてから。id の無い .md に触れない。429 を待つ。送り返さない。
   - 新しい端末は写し（pack.json）から、rev の違うものだけ取る。写しは1日1回まで。
   - はじめて来たノートは取りながら書く（終わる前に手元にある）。取る数を設定の行に。
   - 取れなかったファイルは数を覚え、次の回で全部を見直して取り直す。
   - 見えているあいだは longpoll で、向こうの直しが黙って来る。
   - 合わせられないまま3日で、歯車に点と設定の頭に一行。 */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-sync");

  /* ---------- 偽の Dropbox ---------- */
  const files = new Map();       // 小文字の道 → { path, id, rev, text }
  const hist = new Map();        // rev → 中身
  const log = [];                // 変わった道（小文字）。cursor はここの長さ
  let revN = 0, idN = 0, busy = 0, notify = false;   // notify … longpoll が変わったと言う（ほかの節を乱さないよう、その節だけ）
  const calls = [];
  let dlFail = 0;                // これだけの download（rev:）を 500 で断る（取れなかったの節だけ）
  let hold = null;               // { after, n, p } … この数の download（rev:）のあとは、開けるまで待たせる（取りながら書くの節だけ）
  const blobs = new Map();       // images/・files/ の中身（字にしない）
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (route, status, obj) => route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(obj) });
  const meta = (f) => ({ ".tag": "file", id: f.id, rev: f.rev, name: f.path.split("/").pop(), path_display: f.path,
    path_lower: f.path.toLowerCase(), server_modified: f.at, size: Buffer.byteLength(f.text) });
  const write = (path, text) => {
    const low = path.toLowerCase();
    const old = files.get(low);
    const f = { path, id: old ? old.id : `id:${++idN}`, rev: `r${++revN}`, text, at: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
    files.set(low, f); hist.set(f.rev, text); log.push(low);
    return f;
  };
  const under = (low, dir) => low.startsWith(`${dir.toLowerCase()}/`);

  const handler = async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
    const u = new URL(req.url());
    const h = req.headers();
    if (u.pathname === "/oauth2/token") return json(route, 200, { access_token: "acc", expires_in: 14400, token_type: "bearer" });
    const arg = h["dropbox-api-arg"] ? JSON.parse(h["dropbox-api-arg"]) : null;
    const body = arg ? null : (req.postData() ? JSON.parse(req.postData()) : null);
    calls.push({ path: u.pathname, arg, body });
    switch (u.pathname) {
      case "/2/users/get_current_account": return json(route, 200, { account_id: "dbid:A" });
      case "/2/files/upload": {
        if (busy > 0) { busy--; return json(route, 429, { error_summary: "too_many_write_operations/", error: { reason: { ".tag": "too_many_write_operations" }, retry_after: 1 } }); }
        const low = arg.path.toLowerCase();
        if (/^\/(files|images)\//.test(low)) {
          if (arg.mode === "add" && blobs.has(low)) return json(route, 409, { error_summary: "path/conflict/file/" });
          blobs.set(low, req.postDataBuffer());
          return json(route, 200, { ".tag": "file", name: low.split("/").pop(), path_display: arg.path });
        }
        const has = files.get(low);
        if (arg.mode === "add" && has) return json(route, 409, { error_summary: "path/conflict/file/" });
        if (arg.mode && arg.mode[".tag"] === "update" && (!has || has.rev !== arg.mode.update)) return json(route, 409, { error_summary: "path/conflict/file/" });
        return json(route, 200, meta(write(has ? has.path : arg.path, req.postDataBuffer().toString("utf8"))));
      }
      case "/2/files/download": {
        const p = arg.path;
        if (hold && p.startsWith("rev:") && ++hold.n > hold.after) await hold.p;
        if (dlFail > 0 && p.startsWith("rev:")) { dlFail--; return json(route, 500, { error_summary: "internal/" }); }
        if (blobs.has(p.toLowerCase())) return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "application/octet-stream" }, body: blobs.get(p.toLowerCase()) });
        const text = p.startsWith("rev:") ? hist.get(p.slice(4)) : (files.get(p.toLowerCase()) || {}).text;
        if (text == null) return json(route, 409, { error_summary: "path/not_found/" });
        return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "application/octet-stream" }, body: Buffer.from(text, "utf8") });
      }
      case "/2/files/list_folder": {
        const all = [...files.entries()].filter(([low]) => under(low, body.path));
        if (!all.length && body.path === "/notes") return json(route, 409, { error_summary: "path/not_found/" });
        return json(route, 200, { entries: all.map(([, f]) => meta(f)), cursor: `${body.path}|${log.length}`, has_more: false });
      }
      case "/2/files/list_folder/continue": {
        const [dir, at] = body.cursor.split("|");
        const touched = [...new Set(log.slice(Number(at)))].filter((low) => low === dir.toLowerCase() || under(low, dir));
        const entries = touched.map((low) => (files.has(low) ? meta(files.get(low))
          : { ".tag": "deleted", name: low.split("/").pop(), path_lower: low }));
        return json(route, 200, { entries, cursor: `${dir}|${log.length}`, has_more: false });
      }
      case "/2/files/get_metadata": {
        const f = files.get(body.path.toLowerCase());
        return f ? json(route, 200, meta(f)) : json(route, 409, { error_summary: "path/not_found/" });
      }
      case "/2/files/move_v2": {
        const from = files.get(body.from_path.toLowerCase());
        if (!from) return json(route, 409, { error_summary: "from_lookup/not_found/" });
        const to = body.to_path.toLowerCase();
        if (files.has(to) && to !== body.from_path.toLowerCase()) return json(route, 409, { error_summary: "to/conflict/file/" });
        files.delete(body.from_path.toLowerCase()); log.push(body.from_path.toLowerCase());
        const f = { ...from, path: body.to_path };
        files.set(to, f); log.push(to);
        return json(route, 200, { metadata: meta(f) });
      }
      case "/2/files/delete_v2": {
        const f = files.get(body.path.toLowerCase());
        if (!f) return json(route, 409, { error_summary: "path_lookup/not_found/" });
        if (body.parent_rev && body.parent_rev !== f.rev) return json(route, 409, { error_summary: "path_write/conflict/" });
        files.delete(body.path.toLowerCase()); log.push(body.path.toLowerCase());
        return json(route, 200, { metadata: meta(f) });
      }
      case "/2/files/list_folder/longpoll": {
        const [dir, at] = body.cursor.split("|");
        const moved = () => log.slice(Number(at)).some((low) => low === dir.toLowerCase() || under(low, dir));
        const end = Date.now() + 1500;
        while (Date.now() < end && !(notify && moved())) await new Promise((r) => setTimeout(r, 100));
        return json(route, 200, { changes: notify && moved() });
      }
      default: return json(route, 404, { error_summary: "unknown" });
    }
  };
  const device = async () => {
    const d = await open({
      before: async (ctx, page) => {
        await page.route(/https:\/\/(api|content|notify)\.dropboxapi\.com\/.*/, handler);
        await ctx.addInitScript(() => {
          if (!localStorage.getItem("kaimono-note-dropbox")) localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "k", refresh: "ref" }));
        });
      },
    });
    await d.page.evaluate(() => KN.notes.ready());
    return d;
  };
  const notesFiles = () => [...files.values()].filter((f) => f.path.startsWith("/notes/") && f.path.endsWith(".md"));
  const fileOfId = (id) => notesFiles().find((f) => f.text.includes(`id: ${JSON.stringify(id)}`));
  const uploads = () => calls.filter((c) => c.path === "/2/files/upload").length;

  const A = await device();
  const a = A.page;

  /* ---------- 形 ---------- */
  const form = await a.evaluate(() => {
    const S = KN.notesSync._;
    const n = { id: "n-abc123xyz", title: "題 \"引用\"", body: "\n# 見出し\n本文\n\n- [ ] やる", notebook: "仕事", tags: ["a", "b c"],
      fav: true, parent: "n-p", createdAt: "2026-10-01T00:05:00.123Z", updatedAt: "2026-10-02T10:00:00.000Z", deletedAt: null,
      noTime: true, emoji: "x", src: { from: "notion", key: "k1", batch: "b" } };
    const text = S.fileOf(n);
    const back = S.parse(text);
    const same = ["id", "title", "body", "notebook", "fav", "parent", "createdAt", "updatedAt", "noTime", "emoji"].every((k) => back[k] === n[k])
      && JSON.stringify(back.tags) === JSON.stringify(n.tags) && JSON.stringify(back.src) === JSON.stringify(n.src) && back.deletedAt === null;
    return { text, same,
      noId: S.parse("---\ntitle: \"x\"\n---\n\n本文"),
      broken: S.parse("---\nid: \"n-1\"\n  : ???\n---\n\n本文"),
      foreign: S.parse("---\r\nid: n-9\r\ntags:\r\n  - 旅\r\n  - 食\r\nfavorite: true\r\n---\r\n本文\r\n"),
      names: S.namesFor({ ...n, title: "a/b:c?" }) };
  });
  t.check(".md を読み戻すと一字も変わらない", form.same, form.text);
  t.check("`# 題` を足さない・format: 1・id は YAML の中", !/^# 題/m.test(form.text) && /\nformat: 1\n/.test(form.text) && /\nid: "n-abc123xyz"\n/.test(form.text));
  t.check("id の無い .md・読めない YAML は読まない", form.noId === null && form.broken === null);
  t.check("外で書いた YAML（引用なし・箇条のタグ・CRLF）も読める",
    !!form.foreign && form.foreign.id === "n-9" && form.foreign.tags.join() === "旅,食" && form.foreign.fav && form.foreign.body === "本文\n", JSON.stringify(form.foreign));
  t.check("名前は使えない字を置きかえ、id の尻6字", form.names[0] === "/notes/a_b_c_ 123xyz.md" && form.names[1].endsWith(" n-abc123xyz.md"), form.names.join());

  /* ---------- 色はノートの入れ物へ写す ---------- */
  await a.evaluate(() => KN.store.update((s) => { s.settings.noteColors = { nb: { "仕事": "#5b9bd5" }, tag: {} }; }));
  await a.waitForTimeout(300);
  await a.evaluate(() => new Promise((r) => {
    const q = indexedDB.open("kaimono-note-notes", 1);
    q.onsuccess = () => { const tx = q.result.transaction(["meta"], "readwrite"); tx.objectStore("meta").delete("labels"); tx.oncomplete = () => { q.result.close(); r(); }; };
  }));
  await a.reload();
  await a.waitForFunction(() => window.KN && KN.notes && KN.notes.state() === "on");
  await a.waitForTimeout(300);
  const col = await a.evaluate(() => ({ now: KN.notes.colors().nb["仕事"], kept: KN.store.get().settings.noteColors.nb["仕事"] }));
  t.check("はじめて開くと色を入れ物へ写す（元も残す）", col.now === "#5b9bd5" && col.kept === "#5b9bd5", JSON.stringify(col));

  /* ---------- 一台め：入れると送る ---------- */
  const ids = await a.evaluate(() => {
    const N = KN.notes;
    const p = { ...N.draft(), title: "買い物", body: "牛乳\n卵", notebook: "仕事" };
    N.put(p);
    const c = { ...N.draft(), title: "買い物", body: "同じ題", notebook: "仕事", parent: p.id, fav: true };
    N.put(c);
    N.put({ ...N.draft() });                                  // 題も本文も空 → 送らない
    return { p: p.id, c: c.id };
  });
  t.check("既定は切り（入れるまで合わせない）", (await a.evaluate(() => KN.notesSync.now())) === "off" && notesFiles().length === 0);
  const r1 = await a.evaluate(() => KN.notesSync.setOn(true));
  t.check("入れると合わせる", r1 === "done", `${r1} ${await a.evaluate(() => KN.notesSync.status().error)}`);
  t.check("1件1ファイル。空のノートは送らない・同じ題でもぶつからない", notesFiles().length === 2
    && notesFiles().every((f) => /^\/notes\/買い物 [\w-]{6}\.md$/.test(f.path)), notesFiles().map((f) => f.path).join());
  t.check("色は labels.json", JSON.parse((files.get("/notes-sync/labels.json") || { text: "{}" }).text).nb["仕事"] === "#5b9bd5");
  t.check("中の子は親と★を YAML に", /parent: /.test(fileOfId(ids.c).text) && /favorite: true/.test(fileOfId(ids.c).text));

  /* ---------- 二台め：足し合わせる ---------- */
  const B = await device();
  const b = B.page;
  const own = await b.evaluate(() => { const n = { ...KN.notes.draft(), title: "iPad のメモ", body: "こちらだけ" }; KN.notes.put(n); return n.id; });
  const r2 = await b.evaluate(() => KN.notesSync.setOn(true));
  const bHas = await b.evaluate((x) => ({ p: KN.notes.get(x.p), c: KN.notes.get(x.c), own: KN.notes.get(x.own), color: KN.notes.colors().nb["仕事"] }), { ...ids, own });
  t.check("はじめての端末：向こうのノートが入り、手元のも残る", r2 === "done" && !!bHas.p && bHas.p.body === "牛乳\n卵" && bHas.c.parent === ids.p && bHas.c.fav && !!bHas.own, r2);
  t.check("はじめての端末：色も来る", bHas.color === "#5b9bd5");
  t.check("はじめての端末：手元にだけのノートは送る", !!fileOfId(own));
  await a.evaluate(() => KN.notesSync.now());
  t.check("一台めにも二台めのノートが来る", !!(await a.evaluate((id) => KN.notes.get(id), own)));

  /* ---------- 片方ずつの欄は両方取る ---------- */
  await a.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { body: "牛乳\n卵\nパン" }); KN.notes.end(id); }, ids.p);
  await b.evaluate((id) => KN.notes.setFav(id, true), ids.p);
  await a.evaluate(() => KN.notesSync.now());
  await b.evaluate(() => KN.notesSync.now());
  await a.evaluate(() => KN.notesSync.now());
  const both = await Promise.all([a, b].map((pg) => pg.evaluate((id) => { const n = KN.notes.get(id); return [n.body, n.fav]; }, ids.p)));
  t.check("本文（一台め）と★（二台め）の両方が、両方に", both.every(([body, fav]) => body === "牛乳\n卵\nパン" && fav), JSON.stringify(both));

  /* ---------- 両方が本文を直した ---------- */
  await a.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { body: "一台めの字" }); KN.notes.end(id); }, ids.p);
  /* KN_CLOCK では頁ごとに時計を差し込むので、二台の時計が数十ms ずれる（20ms では揺れた。10月17日、T1）。 */
  await a.waitForTimeout(300);
  await b.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { body: "二台めの字（あと）" }); KN.notes.end(id); }, ids.p);
  await a.evaluate(() => KN.notesSync.now());
  await b.evaluate(() => KN.notesSync.now());
  await a.evaluate(() => KN.notesSync.now());
  const two = await b.evaluate(async (id) => ({ body: KN.notes.get(id).body, vers: await KN.notes.versions(id) }), ids.p);
  const twoA = await a.evaluate(async (id) => ({ body: KN.notes.get(id).body }), ids.p);
  t.check("両方が本文を直したら、新しいほうが本文に（両方の端末とファイル）",
    two.body === "二台めの字（あと）" && twoA.body === two.body && fileOfId(ids.p).text.endsWith("二台めの字（あと）"), JSON.stringify([two.body, twoA.body]));
  t.check("もう片方は前の版に「二つの版」で残る", two.vers.some((v) => v.body === "一台めの字" && v.two), JSON.stringify(two.vers.map((v) => [v.body, v.two])));

  /* ---------- 題を変えるとファイルが動く ---------- */
  const fid = fileOfId(ids.c).id;
  await a.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { title: "新しい題" }); KN.notes.end(id); }, ids.c);
  await a.evaluate(() => KN.notesSync.now());
  await b.evaluate(() => KN.notesSync.now());
  const moved = fileOfId(ids.c);
  t.check("題を変えるとファイルが動く（同じファイルのまま・一つだけ）", moved.id === fid && /^\/notes\/新しい題 /.test(moved.path)
    && notesFiles().filter((f) => f.text.includes(ids.c)).length === 1, moved.path);
  t.check("二台めにも新しい題", (await b.evaluate((id) => KN.notes.get(id).title, ids.c)) === "新しい題");

  /* ---------- 消した印 → .trash ---------- */
  await a.evaluate((id) => KN.notes.remove(id), own);
  await a.evaluate(() => KN.notesSync.now());
  t.check("消した印のノートは notes/.trash/ へ", /^\/notes\/\.trash\//.test(fileOfId(own).path), fileOfId(own).path);
  await b.evaluate(() => KN.notesSync.now());
  t.check("二台めでも最近削除に", !!(await b.evaluate((id) => KN.notes.get(id).deletedAt, own)));

  /* ---------- 本当に消す（30日） ---------- */
  await a.evaluate((id) => KN.notes.drop(id), own);
  await a.evaluate(() => KN.notesSync.now());
  t.check("本当に消すとファイルも消える", !fileOfId(own));
  await b.evaluate(() => KN.notesSync.now());
  await b.evaluate(() => KN.notesSync.now());
  t.check("ほかの端末は最近削除に残したまま、送り返さない", !!(await b.evaluate((id) => KN.notes.get(id), own)) && !fileOfId(own));

  /* ---------- id の無い .md には触れない ---------- */
  write("/notes/外で書いた.md", "# 手で書いたメモ\n\nid の無いもの\n");
  const before = (await a.evaluate(() => KN.notes.list().length));
  await a.evaluate(() => KN.notesSync.now());
  t.check("id の無い .md は読まず・消さず・上書きせず", files.get("/notes/外で書いた.md").text === "# 手で書いたメモ\n\nid の無いもの\n"
    && (await a.evaluate(() => KN.notes.list().length)) === before);

  /* ---------- 開いて書いているノートは、閉じてから ---------- */
  await b.evaluate((id) => KN.notes.begin(id), ids.c);
  await a.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { body: "開いているあいだの直し" }); KN.notes.end(id); }, ids.c);
  await a.evaluate(() => KN.notesSync.now());
  await b.evaluate(() => KN.notesSync.now());
  const whileOpen = await b.evaluate((id) => KN.notes.get(id).body, ids.c);
  await b.evaluate((id) => KN.notes.end(id), ids.c);
  await b.evaluate(() => KN.notesSync.now());
  const afterClose = await b.evaluate((id) => KN.notes.get(id).body, ids.c);
  t.check("開いているあいだは中身を替えず、閉じたら合わせる", whileOpen === "同じ題" && afterClose === "開いているあいだの直し", JSON.stringify([whileOpen, afterClose]));

  /* ---------- 429 ---------- */
  busy = 1;
  await b.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { body: "429 のあと" }); KN.notes.end(id); }, ids.c);
  const r429 = await b.evaluate(() => KN.notesSync.now());
  t.check("429 は待ってから送る", r429 === "done" && fileOfId(ids.c).text.endsWith("429 のあと"), r429);

  /* ---------- 送り返さない ---------- */
  await a.evaluate(() => KN.notesSync.now());
  const u0 = uploads();
  await a.evaluate(() => KN.notesSync.now());
  await b.evaluate(() => KN.notesSync.now());
  t.check("変わっていなければ送らない（送り返し合わない）", uploads() === u0, `${uploads()} / ${u0}`);

  /* ---------- ファイル（PDF）：中身を先に files/ へ、ほかの端末は開いたときに取る ---------- */
  const pdf = await a.evaluate(async () => {
    const u = new TextEncoder().encode("%PDF-1.4\n%\u00e2\u00e3\n試験の中身\n%%EOF\n");
    const bin = new Uint8Array(u.length + 4); bin.set(u); bin.set([0, 255, 128, 7], u.length);
    const got = await KN.noteFile.add(new File([bin], "見積.pdf", { type: "application/pdf" }));
    const n = { ...KN.notes.draft(), title: "PDF のノート", body: `前\n${KN.noteFile.refLine(got.id, got.name)}\n後` };
    KN.notes.put(n);
    await KN.notes.flush();
    return { id: got.id, note: n.id, size: bin.length };
  });
  const cf = calls.length;
  const rp = await a.evaluate(() => KN.notesSync.now());
  const after = calls.slice(cf).filter((c) => c.path === "/2/files/upload").map((c) => c.arg.path);
  const fAt = after.indexOf(`/files/${pdf.id}`);
  const mAt = after.findIndex((p) => /^\/notes\/PDF のノート /.test(p));
  t.check("ファイルは .md より先に files/<SHA-256>.pdf へ（add・中身はそのまま）",
    rp === "done" && fAt >= 0 && mAt > fAt && (blobs.get(`/files/${pdf.id}`) || []).length === pdf.size
      && calls.slice(cf).find((c) => c.arg && c.arg.path === `/files/${pdf.id}`).arg.mode === "add", JSON.stringify([rp, after]));
  await a.evaluate(() => KN.notesSync.now());
  t.check("送ったファイルは二度送らない", calls.filter((c) => c.arg && c.arg.path === `/files/${pdf.id}`).length === 1);
  await b.evaluate(() => KN.notesSync.now());
  const bp = await b.evaluate(async ([id, nid]) => {
    const had = !!(await KN.noteFile.get(id));
    const ok = await KN.noteFile.pull(id, "見積.pdf");
    const r = await KN.noteFile.get(id);
    return { had, ok, n: r ? r.bytes.byteLength : 0, body: (KN.notes.get(nid) || {}).body || "" };
  }, [pdf.id, pdf.note]);
  t.check("ほかの端末：参照は来て、中身は取ってから同じ", !bp.had && bp.ok && bp.n === pdf.size && bp.body.includes(`(file:${pdf.id})`), JSON.stringify(bp));

  /* ---------- 色を直すと、ほかの端末へ ---------- */
  await b.evaluate(() => KN.notes.setColors((all) => { all.tag["料理"] = "#d4695f"; }));
  await b.evaluate(() => KN.notesSync.now());
  await a.evaluate(() => KN.notesSync.now());
  t.check("色を直すとほかの端末へ（前の色も残る）", (await a.evaluate(() => [KN.notes.colors().tag["料理"], KN.notes.colors().nb["仕事"]].join())) === "#d4695f,#5b9bd5");

  /* ---------- 一度にたくさん無くなったら止まる ---------- */
  const more = await a.evaluate(() => [1, 2, 3].map((i) => { const n = { ...KN.notes.draft(), title: `増やす${i}`, body: "x" }; KN.notes.put(n); return n.id; }));
  await a.evaluate(() => KN.notesSync.now());
  const keep = await a.evaluate(() => KN.notes.list().length);
  [...files.keys()].filter((low) => low.startsWith("/notes/")).forEach((low) => files.delete(low));
  log.push("/notes");
  const rh = await a.evaluate(() => KN.notesSync.now());
  const halted = await a.evaluate(() => ({ s: KN.notesSync.status(), n: KN.notes.list().length }));
  t.check("notes/ ごと消えたら、手元は消さずに止まる", rh === "halt" && halted.s.halt === "many" && halted.n === keep, JSON.stringify([rh, halted]));
  const rr = await a.evaluate(() => KN.notesSync.restart());
  t.check("合わせ直すと足し合わせで戻す", rr === "done" && more.every((id) => !!fileOfId(id)) && !!fileOfId(ids.p) && !(await a.evaluate(() => KN.notesSync.status().halt)), rr);

  /* ---------- 写し（pack.json）：新しい端末は rev の違うものだけ取る ---------- */
  await a.evaluate(() => { for (let i = 0; i < 8; i++) KN.notes.put({ ...KN.notes.draft(), title: `束${i}`, body: `束の本文${i}` }); });
  await a.evaluate(() => KN.notesSync.now());
  const pk = files.get("/notes-sync/pack.json");
  const pkN = pk ? JSON.parse(pk.text).notes.length : 0;
  t.check("合わせ終えた端末が写しを書く（ファイルのぶんだけ）", !!pk && pkN === notesFiles().filter((f) => /id: /.test(f.text)).length, `${pkN} / ${notesFiles().length}`);
  await a.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { body: "写しのあとの直し" }); KN.notes.end(id); }, ids.p);
  await a.evaluate(() => KN.notesSync.now());
  t.check("写しは1日1回まで（すぐには書き直さない）", files.get("/notes-sync/pack.json").rev === pk.rev);
  const noteRevs = new Set(notesFiles().map((f) => f.rev));
  const c0 = calls.length;
  const C = await device();
  const r3 = await C.page.evaluate(() => KN.notesSync.setOn(true));
  const pulled = calls.slice(c0).filter((c) => c.path === "/2/files/download" && /^rev:/.test(c.arg.path) && noteRevs.has(c.arg.path.slice(4)));
  const cGot = await C.page.evaluate((id) => ({ n: KN.notes.list().length + KN.notes.trash().length, p: (KN.notes.get(id) || {}).body }), ids.p);
  t.check("新しい端末は写しから入り、rev の違うものだけ取る（写しよりファイルが正）",
    r3 === "done" && pulled.length === 1 && cGot.p === "写しのあとの直し" && cGot.n >= pkN, JSON.stringify([r3, pulled.length, cGot]));
  const errsC = C.errors.slice();
  await C.browser.close();

  /* ---------- はじめて来たノートは取りながら書く・取る数を設定の行に ---------- */
  await a.evaluate(() => { for (let i = 0; i < 50; i++) KN.notes.put({ ...KN.notes.draft(), title: `大束${i}`, body: `大束の本文${i}` }); });
  await a.evaluate(() => KN.notesSync.now());
  let release;
  hold = { after: 44, n: 0, p: new Promise((r) => (release = r)) };
  const E = await device();
  const e = E.page;
  const c1 = calls.length;
  await e.click('.tab[data-tab="notes"]');
  await e.waitForFunction(() => KN.app.activeScreen() === "notes");
  await e.evaluate(() => { KN.notesSync.setOn(true); KN.app.showScreen("settings"); });
  const early = await e.waitForFunction(() => KN.notes.list().length >= 40, null, { timeout: 15000 }).then(() => true, () => false);
  const mid = await e.evaluate(() => ({ busy: KN.notesSync.status().busy, step: KN.notesSync.status().step }));
  t.check("はじめて来たノートは、取り終える前に手元にある（途中で閉じても続きから）",
    early && mid.busy && mid.step && mid.step.kind === "pull" && mid.step.done < mid.step.all, JSON.stringify(mid));
  const shown = await e.waitForFunction(() => [...document.querySelectorAll(".set-row")].some((r) => /今すぐ合わせる[\s\S]*取っています \d+／\d+/.test(r.textContent)),
    null, { timeout: 5000 }).then(() => true, () => false);
  t.check("合わせている最中は、取る数を「今すぐ合わせる」の値に", shown);
  release();
  hold = null;
  await e.waitForFunction(() => !KN.notesSync.status().busy, null, { timeout: 15000 }).catch(() => {});
  const eGot = await e.evaluate(() => ({ big: KN.notes.list().filter((n) => /^大束/.test(n.title)).length, step: KN.notesSync.status().step,
    row: [...document.querySelectorAll(".set-row")].map((r) => r.textContent).find((x) => x.includes("今すぐ合わせる")) || "" }));
  const eSent = calls.slice(c1).filter((c) => c.path === "/2/files/upload" && /^\/notes\//.test(c.arg.path)).length;
  t.check("取り終えたら全部そろい、数は消える。取ったノートは送り返さない",
    eGot.big === 50 && eGot.step === null && !/取っています/.test(eGot.row) && eSent === 0, JSON.stringify([eGot, eSent]));
  const errsE = E.errors.slice();
  await E.browser.close();

  /* ---------- 取れなかったファイルは数を覚え、次の回で取り直す ---------- */
  await b.evaluate(() => KN.notesSync.now());              // 大束を先に（ここで見たいのは一件だけ）
  const lostId = await a.evaluate(() => { const n = { ...KN.notes.draft(), title: "取り損ね", body: "電波が切れた" }; KN.notes.put(n); return n.id; });
  await a.evaluate(() => KN.notesSync.now());
  dlFail = 99;
  const rMiss = await b.evaluate(() => KN.notesSync.now());
  const bMiss = await b.evaluate((id) => ({ miss: KN.notesSync.status().miss, has: !!KN.notes.get(id) }), lostId);
  dlFail = 0;
  t.check("取れなかったら、済んだことにせず数を覚える", rMiss === "done" && bMiss.miss === 1 && !bMiss.has, JSON.stringify([rMiss, bMiss]));
  await b.evaluate(() => KN.notesSync.now());
  const bGot = await b.evaluate((id) => ({ miss: KN.notesSync.status().miss, has: !!KN.notes.get(id) }), lostId);
  t.check("次の回で取り直す（cursor の先へ進めていない）", bGot.miss === 0 && bGot.has, JSON.stringify(bGot));

  /* ---------- 見えているあいだは longpoll ---------- */
  notify = true;
  await a.evaluate((id) => { KN.notes.begin(id); KN.notes.edit(id, { body: "longpoll で来る" }); KN.notes.end(id); }, ids.p);
  await a.evaluate(() => KN.notesSync.now());
  const came = await b.waitForFunction((id) => KN.notes.get(id).body === "longpoll で来る", ids.p, { timeout: 15000 }).then(() => true, () => false);
  notify = false;
  t.check("見えているあいだは、合わせを押さなくても向こうの直しが来る", came);

  /* ---------- 合わせられないまま3日で歯車に点 ---------- */
  const dotOf = () => a.evaluate(() => { const el = document.querySelector(".js-settings"); return !!el && el.classList.contains("has-dot"); });
  await a.evaluate(() => KN.notesSync.now());              // 書いたあとの一回（soon）を先に済ませる。あとで走ると時刻が今に戻る
  const fresh = await a.evaluate(() => { const s = KN.notesSync._.st(); s.err = "x"; s.at = new Date(Date.now() - 86400000).toISOString(); return KN.notesSync.stale(); });
  t.check("1日ではまだ点を出さない", fresh === null && !(await dotOf()));
  await a.evaluate(() => { KN.notesSync._.st().at = new Date(Date.now() - 4 * 86400000).toISOString(); KN.store.update(() => {}); });
  await a.waitForFunction(() => document.querySelector(".js-settings.has-dot"), null, { timeout: 3000 }).catch(() => {});
  t.check("合わせられないまま3日で歯車に点", await dotOf());

  /* ---------- 設定の行 ---------- */
  await a.click('.tab[data-tab="notes"]');
  await a.waitForFunction(() => KN.app.activeScreen() === "notes");
  await a.evaluate(() => KN.app.showScreen("settings"));
  /* 頭の一行は組んだあとに差しこまれるので、その一行が出るまで待つ（上限だけ。出なければ下の check が落とす）。 */
  await a.waitForFunction(() => KN.app.activeScreen() === "settings"
    && [...document.querySelectorAll(".set-layer .set-row")].some((r) => r.textContent.includes("合わせられていません"))
    && [...document.querySelectorAll(".set-row")].some((r) => r.textContent.includes("今すぐ合わせる")), null, { timeout: 5000 }).catch(() => {});
  const rowText = await a.evaluate(() => [...document.querySelectorAll(".set-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()));
  t.check("点の中身を設定の頭に一行", rowText[0] === "ノートを4日合わせられていません", rowText[0]);
  t.check("設定のノートに「同期」と「今すぐ合わせる」", rowText.some((x) => x.startsWith("同期")) && rowText.some((x) => x.startsWith("今すぐ合わせる")), rowText.filter((x) => /同期|合わせ/.test(x)).join(" / "));

  await a.evaluate(() => KN.notesSync.now());
  await a.waitForTimeout(100);
  t.check("合わせられたら点は消える", !(await a.evaluate(() => KN.notesSync.stale())) && !(await dotOf()));

  const errs = A.errors.concat(B.errors, errsC, errsE);
  t.check("エラーが無い", !errs.length, errs.join(" | "));
  await A.browser.close();
  await B.browser.close();
  t.done();
})();
