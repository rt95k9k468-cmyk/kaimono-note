/* 写しの端末から足す道と、主の一台の取り込み（docs/desk.md「段15 の設計」の③。js/desk-inbox.js）。Dropbox は台本が偽の返事をする。
   写しの端末：
   - ＋（やること・買うもの・daily）と日記の紙は、受け箱 inbox/<端末>/<時刻>-<乱数>.json へ add で一件一ファイル置く
   - 置いたものは写しの上に重ねて見え、記録（kaimono-note-v2）は一字も変わらない。控えは送らない
   主の一台（iPhone）：
   - 書く紙が開いているあいだは当てない。先に自動の控え「受け箱の取り込み前」、at の順に当てる
   - iPhone の記録は消えない（前からのやること・品・日記の一件はそのまま。元が変わっていた直しは両方残る・外さない）
   - 日記はその日の時刻の順の位置へ。同じ品がリストにあれば寄せる
   - 済んだ id は記録の inboxSeen に。ファイルは inbox/.done/ へ。もう一度取りこんでも・同じファイルが戻っても二度当てない
   - 読めない・知らない kind・大きすぎるものは当てず・消さず・動かさない。職場の受け箱（inbox 直下）にも触れない
   - ノートへ移すは、そのノートが手元に届いてから外す
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-inbox.js */
const { open, checker, URL } = require("./lib");

(async () => {
  const t = checker("desk-inbox");

  /* ---- 偽の Dropbox（二つの端末で分け合う） ---- */
  const files = new Map();      // path → text
  const sizes = new Map();      // path → 見せかけの大きさ
  const puts = [];
  let hideBox = false;
  let revN = 1;
  const route = async (ctx) => ctx.route(/https:\/\/(api|content)\.dropboxapi\.com\/.*/, async (r) => {
    const req = r.request();
    const path = new (require("url").URL)(req.url()).pathname;
    const head = req.headers()["dropbox-api-arg"];
    const arg = head ? JSON.parse(head) : null;
    const body = !arg && req.postData() ? JSON.parse(req.postData()) : null;
    const json = (status, v) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(v) });
    const where = String((arg && arg.path) || (body && body.path) || "").toLowerCase();
    const meta = (p) => ({ ".tag": "file", name: p.split("/").pop(), path_lower: p, path_display: p, rev: `r${revN}`,
      server_modified: "2026-10-31T09:00:00Z", size: sizes.get(p) || files.get(p).length });
    if (path === "/2/files/upload") {
      if (arg.mode === "add" && files.has(where)) return json(409, { error_summary: "path/conflict/file/.." });
      files.set(where, req.postDataBuffer().toString("utf8"));
      puts.push(where);
      if (where === "/kurashi-latest.json") revN++;
      return json(200, { rev: `r${revN}`, name: where });
    }
    if (path === "/2/files/get_metadata") return files.has(where) ? json(200, meta(where)) : json(409, { error_summary: "path/not_found/" });
    if (path === "/2/files/download") return files.has(where) ? r.fulfill({ status: 200, body: files.get(where) }) : json(409, { error_summary: "path/not_found/" });
    if (path === "/2/files/list_folder") {
      const entries = [...files.keys()].filter((p) => p.startsWith(`${where}/`) && (body.recursive || !p.slice(where.length + 1).includes("/")))
        .filter((p) => !(hideBox && p.startsWith("/inbox/"))).map(meta);
      return json(200, { entries, cursor: "c", has_more: false });
    }
    if (path === "/2/files/list_folder/continue") return json(200, { entries: [], cursor: "c", has_more: false });
    if (path === "/2/files/move_v2") {
      const from = body.from_path.toLowerCase();
      let to = body.to_path.toLowerCase();
      if (!files.has(from)) return json(409, { error_summary: "from_lookup/not_found/" });
      if (files.has(to)) to = to.replace(/\.json$/, " (1).json");
      files.set(to, files.get(from));
      files.delete(from);
      return json(200, { metadata: meta(to) });
    }
    if (path === "/2/files/delete_v2") { files.delete(where); return json(200, {}); }
    return json(409, { error_summary: "path/not_found/" });
  });
  const booted = async (p) => {
    await p.waitForFunction(() => window.KN && KN.app && KN.app.activeScreen && document.querySelector(".screen.is-active"), null, { timeout: 15000 });
    await p.waitForTimeout(500);
  };
  const box = () => [...files.keys()].filter((p) => /^\/inbox\/desk-/.test(p)).sort();
  const done = () => [...files.keys()].filter((p) => p.startsWith("/inbox/.done/")).sort();

  /* iPhone の控え（写しの出どころ）。10/21・10/22 は iPhone があとで直す。 */
  const T = "⁠";
  const DAYS = {
    "2026-10-20": `10/20 頭の行\n\n08:00${T}\n朝のこと\n\n20:00${T}\n夜のこと`,
    "2026-10-21": `09:00${T}\n元の字`,
    "2026-10-22": `09:00${T}\n残す字`,
    "2026-10-23": `07:00${T}\nノートへ移す字`,
  };
  const latest = (extra) => JSON.stringify({
    schema: 2, app: "kaimono-note", exportedAt: "2026-10-31T00:00:00Z",
    todos: [{ id: "t-ip1", title: "iPhoneの用事", due: "2026-10-31", createdAt: "2026-10-30" }],
    products: [{ id: "p-egg", name: "たまご", categoryId: "other", prices: [] }],
    items: [{ id: "i-egg", productId: "p-egg", qty: 1, memo: "", checked: false, fav: false, addedAt: "2026-10-30" }],
    archive: { days: Object.entries(DAYS).map(([date, memo]) => ({ date, memo })), entries: [] },
    ...(extra || {}),
  });
  files.set("/kurashi-latest.json", latest());

  /* ================= 写しの端末 ================= */
  const R = await open({ viewport: { width: 1440, height: 900 }, before: route });
  const A = R.page;
  await A.evaluate(() => {
    localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "k", refresh: "r", access: "a", expires: Date.now() + 864e5, sender: false }));
    localStorage.setItem("kn-replica", JSON.stringify({ on: true }));
  });
  await A.reload();
  await booted(A);
  await A.waitForFunction(() => KN.store.get().todos.some((x) => x.title === "iPhoneの用事"), null, { timeout: 8000 }).catch(() => {});
  const own0 = await A.evaluate(() => localStorage.getItem("kaimono-note-v2"));

  const viaFab = async (tab, text) => {
    await A.click(`.tab-${tab}`);
    await A.waitForTimeout(600);
    await A.click("#dock .add-fab");
    await A.waitForSelector(".js-input", { timeout: 4000 });
    await A.fill(".js-input", text);
    await A.press(".js-input", "Enter");
    await A.waitForTimeout(900);
  };
  await viaFab("todo", "写しで足したやること");
  await viaFab("list", "たまご");
  await viaFab("list", "写しの品");
  /* daily の＋：今日の一件。 */
  await A.click(".tab-archive");
  await A.waitForTimeout(600);
  await A.click("#dock .add-fab");
  await A.waitForSelector(".sheet .js-memo", { timeout: 4000 });
  await A.fill(".sheet .js-memo", "写しで書いた日記");
  await A.click(".sheet .js-ok");
  await A.waitForTimeout(900);
  /* 日記の紙で 10/20 08:00 を直す。 */
  await A.evaluate(() => {
    const m = KN.store.dayLog("2026-10-20").memo;
    const it = KN.diaryPosts.parse(m).find((x) => x.at === "08:00");
    KN.deskInbox.post("2026-10-20", it, "", "10/20");
  });
  await A.waitForSelector(".sheet .js-memo", { timeout: 4000 });
  await A.fill(".sheet .js-memo", "朝のこと（直した）");
  await A.click(".sheet .js-ok");
  await A.waitForTimeout(900);
  /* 残りは口から：時刻の順に入る一件・外す（当たる／元が変わっていた）・直す（元が変わっていた）・ノートへ移す。 */
  await A.evaluate(() => {
    const P = KN.diaryPosts, I = KN.deskInbox;
    const ref = (day, at) => {
      const m = KN.store.dayLog(day).memo;
      const it = P.parse(m).find((x) => x.at === at);
      return { day, pos: P.chunkAt(it), was: P.chunkOf(m, it) };
    };
    I.put("diary", { day: "2026-10-20", mark: `12:00${P.TAG}`, text: "昼のこと" });
    I.put("drop", ref("2026-10-20", "20:00"));
    I.put("fix", { ...ref("2026-10-21", "09:00"), text: "写しで直した字" });
    I.put("drop", ref("2026-10-22", "09:00"));
    I.put("toNote", { ...ref("2026-10-23", "07:00"), note: "n-later" });
  });
  await A.waitForTimeout(1500);
  const rep = await A.evaluate(() => {
    const s = KN.store.get();
    const held = JSON.parse(localStorage.getItem("kn-desk-held") || "[]");
    return {
      titles: s.todos.map((x) => x.title), names: s.items.map((i) => (s.products.find((p) => p.id === i.productId) || {}).name),
      d20: KN.store.dayLog("2026-10-20").memo, d23: (KN.store.dayLog("2026-10-23") || {}).memo || "",
      today: (KN.store.dayLog(KN.util.todayKey()) || {}).memo || "",
      held: held.length, sent: held.filter((h) => h.sent).length, kinds: held.map((h) => h.o.kind).join(),
    };
  });
  t.check("写し：足したものは写しの上に重ねて見える", rep.titles.includes("写しで足したやること") && rep.names.includes("写しの品")
    && rep.names.filter((n) => n === "たまご").length === 1 && rep.today.includes("写しで書いた日記") && rep.d20.includes("朝のこと（直した）")
    && !rep.d20.includes("夜のこと") && !rep.d23.includes("ノートへ移す字"), JSON.stringify(rep));
  t.check("写し：依頼は一件一ファイル、端末の入れ物へ add で置く", box().length === 10 && rep.held === 10 && rep.sent === 10
    && box().every((p) => /^\/inbox\/desk-[0-9a-f]{8}\/\d{13}-[0-9a-f]{6}\.json$/.test(p)), box().join(" ") + " " + JSON.stringify(rep));
  const own1 = await A.evaluate(() => localStorage.getItem("kaimono-note-v2"));
  t.check("写し：記録（kaimono-note-v2）は一字も変わらない", own1 === own0);
  t.check("写し：控え・小窓は送らない", !puts.some((p) => /^\/(kurashi-latest\.json|daily\/|glance\.json)/.test(p)), puts.join(" "));
  await A.reload();
  await booted(A);
  const again = await A.evaluate(() => KN.store.get().todos.map((x) => x.title).join());
  t.check("写し：開き直しても重ねて見える", again.includes("写しで足したやること"), again);
  await R.browser.close();

  /* ================= 主の一台（iPhone） ================= */
  hideBox = true;
  const M = await open({ before: route });
  const B = M.page;
  /* iPhone の記録：控えのあと 10/21・10/22 を直した。前からの一件も足す。 */
  await B.evaluate(([days]) => {
    days["2026-10-21"] = `09:00⁠\n元の字（iPhoneで直した）`;
    days["2026-10-22"] = `09:00⁠\n残す字（iPhoneで直した）`;
    KN.store.update((s) => {
      s.todos.push({ id: "t-ip1", title: "iPhoneの用事", due: "2026-10-31", createdAt: "2026-10-30" });
      s.products.push({ id: "p-egg", name: "たまご", categoryId: "other", prices: [] });
      s.items.push({ id: "i-egg", productId: "p-egg", qty: 1, memo: "", checked: false, fav: false, addedAt: "2026-10-30" });
      Object.entries(days).forEach(([date, memo]) => s.archive.days.push({ date, memo, createdAt: "2026-10-30T00:00:00Z" }));
    });
    KN.store.addTodo({ title: "iPhoneだけの用事", due: "2026-11-02" });
    KN.store.saveNow();
    localStorage.setItem("kaimono-note-dropbox", JSON.stringify({
      appKey: "k", refresh: "r", access: "a", expires: Date.now() + 864e5, sender: true, lastAt: "2026-10-31T00:00:00Z",
    }));
  }, [DAYS]);
  await B.waitForTimeout(800);
  await B.reload();
  await booted(B);
  await B.evaluate(() => KN.diaryIdb.ready());

  /* 読めない・知らない・大きすぎる・古い形・職場の受け箱。どれも動かさない。 */
  const odd = {
    "/inbox/desk-0000aaaa/1700000000000-aaaaaa.json": "{broken",
    "/inbox/desk-0000aaaa/1700000000001-bbbbbb.json": JSON.stringify({ v: 1, id: "qzap", at: "2026-10-31T00:00:00Z", kind: "zap" }),
    "/inbox/desk-0000aaaa/1700000000002-cccccc.json": JSON.stringify({ v: 1, id: "qbig", at: "2026-10-31T00:00:00Z", kind: "todo", todo: { id: "t-big", title: "大きい" } }),
    "/inbox/desk-0000aaaa/1700000000003-dddddd.json": JSON.stringify({ v: 2, id: "qv2", at: "2026-10-31T00:00:00Z", kind: "todo", todo: { id: "t-v2", title: "新しい形" } }),
    "/inbox/memo.txt": "職場の受け箱のそば",
  };
  Object.entries(odd).forEach(([p, v]) => files.set(p, v));
  sizes.set("/inbox/desk-0000aaaa/1700000000002-cccccc.json", 70000);
  const snap = (p) => p.evaluate(() => {
    const s = KN.store.get();
    return JSON.stringify({ todos: s.todos.map((x) => [x.id, x.title]), products: s.products.map((x) => [x.id, x.name]),
      items: s.items.map((x) => [x.id, x.productId]), days: s.archive.days.map((d) => [d.date, d.memo]) });
  });
  const pre = JSON.parse(await snap(B));
  const sent = puts.length;

  /* 紙が開いているあいだは当てない。 */
  hideBox = false;
  const held = await B.evaluate(async () => {
    KN.ui.prompt({ title: "開いた紙" });
    await new Promise((ok) => setTimeout(ok, 300));
    const n = await KN.deskInbox.take();
    return { n, open: KN.ui.sheetsOpen() };
  });
  t.check("主：紙が開いているあいだは当てない", held.n === 0 && held.open > 0 && box().length === 14 && (await snap(B)) === JSON.stringify(pre), JSON.stringify(held));
  await B.keyboard.press("Escape");
  await B.waitForTimeout(600);

  const n1 = await B.evaluate(() => KN.deskInbox.take());
  await B.waitForTimeout(500);
  const got = await B.evaluate(() => {
    const s = KN.store.get();
    return {
      snaps: KN.backup.list().map((x) => x.reason), seen: Object.keys(s.inboxSeen || {}).length,
      todos: s.todos.map((x) => [x.id, x.title]), items: s.items.map((i) => (s.products.find((p) => p.id === i.productId) || {}).name),
      d: Object.fromEntries(s.archive.days.map((x) => [x.date, x.memo])),
    };
  });
  t.check("主：先に自動の控え「受け箱の取り込み前」", got.snaps.includes("受け箱の取り込み前"), got.snaps.join());
  t.check("主：iPhone の記録は消えない（前からのやること・品・日記）",
    pre.todos.every(([id, title]) => got.todos.some((x) => x[0] === id && x[1] === title))
    && pre.items.length + 1 === got.items.length
    && got.d["2026-10-21"].includes("元の字（iPhoneで直した）") && got.d["2026-10-22"].includes("残す字（iPhoneで直した）")
    && got.d["2026-10-20"].includes("10/20 頭の行"), JSON.stringify(got));
  t.check("主：やること・品・今日の日記を足す（同じ品は寄せる）", n1 === 7
    && got.todos.some((x) => x[1] === "写しで足したやること") && got.items.filter((x) => x === "たまご").length === 1 && got.items.includes("写しの品")
    && Object.values(got.d).some((m) => m.includes("写しで書いた日記")), JSON.stringify({ n1, todos: got.todos, items: got.items }));
  const d20 = got.d["2026-10-20"];
  t.check("主：直す・時刻の順に入れる・外す（10/20）", d20.includes("朝のこと（直した）") && !d20.includes("\n朝のこと\n")
    && d20.indexOf("朝のこと（直した）") < d20.indexOf("昼のこと") && !d20.includes("夜のこと"), JSON.stringify(d20));
  t.check("主：元が変わっていた直しは両方残る・外さない", got.d["2026-10-21"].includes("写しで直した字")
    && got.d["2026-10-22"] === `09:00⁠\n残す字（iPhoneで直した）`, JSON.stringify([got.d["2026-10-21"], got.d["2026-10-22"]]));
  t.check("主：ノートが届くまでは移さない（ファイルはそのまま）", got.d["2026-10-23"].includes("ノートへ移す字") && got.seen === 9, String(got.seen));
  const inBox = box();
  t.check("主：済んだものは .done へ。読めない・知らない・大きい・古い形は動かさない・消さない",
    done().length === 9 && inBox.length === 5 && Object.keys(odd).every((p) => files.has(p)), JSON.stringify({ inBox, done: done().length }));
  t.check("主：取りこんだら控えを早めに送る", puts.slice(sent).includes("/kurashi-latest.json"), puts.slice(sent).join(" "));

  /* 二度当てない：もう一度・同じファイルが戻っても。 */
  const mid = await snap(B);
  const back = done().slice(0, 3);
  back.forEach((p) => { files.set(p.replace("/inbox/.done/", "/inbox/"), files.get(p)); files.delete(p); });
  const n2 = await B.evaluate(() => KN.deskInbox.take());
  t.check("主：戻ってきた済みのファイルは移すだけ（二度当てない）", n2 === 0 && (await snap(B)) === mid && done().length === 9 && box().length === 5,
    JSON.stringify({ n2, box: box().length }));

  /* ノートが届いたら外す。 */
  const n3 = await B.evaluate(async () => {
    const g = KN.notes.get;
    KN.notes.get = (id) => (id === "n-later" ? { id } : g(id));
    return KN.deskInbox.take();
  });
  const d23 = await B.evaluate(() => (KN.store.dayLog("2026-10-23") || {}).memo || "");
  t.check("主：ノートが届いたら外して .done へ", n3 === 1 && !d23.includes("ノートへ移す字") && done().length === 10 && box().length === 4, JSON.stringify({ n3, d23 }));

  /* 開き直しても済んだ id は残る（reconcile）。 */
  const end = await snap(B);
  await B.reload();
  await booted(B);
  const after = await B.evaluate(() => ({ seen: Object.keys(KN.store.get().inboxSeen || {}).length }));
  t.check("主：開き直しても inboxSeen と記録はそのまま", after.seen === 10 && (await snap(B)) === end, JSON.stringify(after));
  const n4 = await B.evaluate(() => KN.deskInbox.take());
  t.check("主：開き直してもう一度取りこんでも何も当てない", n4 === 0 && (await snap(B)) === end, String(n4));

  t.check("エラーなし", !R.errors.length && !M.errors.length, [...R.errors, ...M.errors].join(" | "));
  t.done();
  await M.browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
