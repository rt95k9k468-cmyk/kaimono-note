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
   買うものの直し（kind shop。写しの端末で 買った・★・数・メモ・消す・しまう・戻す を直すと依頼になる）：
   - 写しの上に重なって見え、記録は一字も変わらない。並べ替え・値段などの対応外は依頼にせず今までどおり戻る
   - 主：前の値がそのままの欄だけ当てる。iPhone が変えていた欄・もう無い品は動かさない・戻さない。二度当てない
   - iPhone が控えを送れば、写しの重ねは外れて iPhone の中身が見える
   からだ（体重・食事・お酒・飲みたくなったとき）の足す・直す・消すも同じ依頼。目標・ヘルスケアは依頼にしない
   やることの直しも同じ依頼（済ませる・題・メモ・旗・やる日・しまう）。くり返し・時刻・手順・消す・並べ替えは依頼にしない
   覚えた分類・絵の言い換え・問いの元も同じ依頼（鍵ごと。前のままの鍵だけ当てる。多い直しは分ける）
   店・分類も同じ依頼（からだと同じ形。値段の残る店は iPhone で消さない）
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-inbox.js */
const { open, checker, URL, pen } = require("./lib");

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
    /* 居る席は押さない（買うもので席をもう一度押すと価格へめくる。R5 で広い幅の左右並びを外した）。 */
    if (await A.evaluate((id) => document.documentElement.dataset.screen !== id, tab)) await A.click(`.tab-${tab}`);
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
  /* 今日の一件：席3 の「いま」の筆（構4b。席1 に＋は無い）。 */
  await pen(A);
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

  /* ================= 買うものの直し（写し → 受け箱 → 主 → 写し） ================= */
  await M.browser.close();   // 前の主の一台が残っていると、ここの依頼を勝手に取りこむ
  files.clear(); sizes.clear(); puts.length = 0; hideBox = false;
  const PRODS = [["p-egg", "たまご"], ["p-milk", "牛乳"], ["p-bread", "パン"], ["p-tea", "お茶"], ["p-salt", "塩"], ["p-oil", "油"]];
  const mk = (id, pid, extra) => ({ id, productId: pid, qty: 1, memo: "", checked: false, fav: false, addedAt: "2026-11-20", ...(extra || {}) });
  const TODAY = new Date().toLocaleDateString("sv");
  const td = (id, title, extra) => ({ id, title, due: TODAY, createdAt: "2026-11-20", ...(extra || {}) });
  const shopBase = () => ({
    products: PRODS.map(([id, name]) => ({ id, name, categoryId: "other", prices: [] })),
    items: [mk("i-egg", "p-egg"), mk("i-milk", "p-milk"), mk("i-bread", "p-bread"), mk("i-tea", "p-tea"), mk("i-salt", "p-salt")],
    todos: [td("t-a", "済ませる用事"), td("t-b", "毎朝の用事", { repeat: "daily" }), td("t-c", "直す用事"), td("t-d", "しまう用事", { due: null }),
      td("t-e", "時刻の用事", { time: "21:00" })],
    diet: { weights: [["w-a", 60], ["w-b", 61], ["w-c", 62]].map(([id, kg]) => ({ id, day: TODAY, time: "07:00", kg, createdAt: "2026-11-20T00:00:00.000Z" })) },
    learned: { 牛乳: { category: "c-cold", label: "牛乳" }, 塩: { category: "c-food", label: "塩" } },
    asks: ["試験の問い一", "試験の問い二"].map((q) => ({ g: "", w: 2, from: "", hint: "", q })),
    stores: ["s-a", "s-b", "s-c"].map((id, order) => ({ id, name: "店" + id[2], color: "#888888", order })),
  });
  files.set("/kurashi-latest.json", latest(shopBase()));
  const R2 = await open({ viewport: { width: 1440, height: 900 }, before: route });
  const C = R2.page;
  await C.evaluate(() => {
    localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "k", refresh: "r", access: "a", expires: Date.now() + 864e5, sender: false }));
    localStorage.setItem("kn-replica", JSON.stringify({ on: true }));
  });
  await C.reload();
  await booted(C);
  await C.waitForFunction(() => KN.store.get().items.length === 5, null, { timeout: 8000 }).catch(() => {});
  const ownS0 = await C.evaluate(() => localStorage.getItem("kaimono-note-v2"));
  const rowOf = (id) => `.screen.is-active .item-wrap[data-item-id="${id}"]`;
  await C.click(".tab-list");
  await C.waitForSelector(rowOf("i-egg"), { timeout: 8000 });
  const thin = await C.evaluate((sel) => getComputedStyle(document.querySelector(sel + " .check")).opacity, rowOf("i-egg"));
  t.check("写し・買うもの：済みの丸は薄くしない（直せる）", Number(thin) === 1, thin);

  /* 丸を押す（買った）。 */
  await C.click(rowOf("i-egg") + " .check");
  await C.waitForTimeout(2200);
  const heldN = () => C.evaluate(() => JSON.parse(localStorage.getItem("kn-desk-held") || "[]").filter((h) => h.o.kind === "shop").length);
  const stateOf = (id) => C.evaluate((i) => (KN.store.get().items.find((x) => x.id === i) || null), id);
  const egg = await stateOf("i-egg");
  t.check("写し・買うもの：丸を押すと買った印が重なり、依頼が一件置かれる", egg && egg.checked === true && !!egg.checkedAt && (await heldN()) === 1, JSON.stringify(egg));
  /* 右クリックの小窓から ★。 */
  await C.click(rowOf("i-milk") + " .item-body", { button: "right" });
  await C.waitForSelector("text=今回買う", { timeout: 4000 });
  await C.click("text=今回買う");
  await C.waitForTimeout(900);
  t.check("写し・買うもの：右クリックの小窓から★（依頼二件目）", (await stateOf("i-milk")).fav === true && (await heldN()) === 2);
  /* 口から：数・メモ・消す・しまう（元に戻す）・戻す・名前・棚。 */
  await C.evaluate(() => {
    const S = KN.store;
    S.update((s) => { const r = s.items.find((i) => i.id === "i-bread"); r.qty = 3; r.memo = "薄切り"; });
    S.update((s) => { s.items = s.items.filter((i) => i.id !== "i-tea"); });
    S.update((s) => { const p = s.products.find((x) => x.id === "p-salt"); p.name = "天然塩"; p.categoryId = "c-other"; p.catManual = true; });
    S.setArchived("p-salt", true);
    S.addItem("p-oil");
  });
  await C.waitForTimeout(900);
  const view = await C.evaluate(() => {
    const s = KN.store.get();
    const byId = (id) => s.items.find((i) => i.id === id) || null;
    return { bread: byId("i-bread"), tea: byId("i-tea"), salt: byId("i-salt"), prod: s.products.find((p) => p.id === "p-salt"),
      oil: s.items.filter((i) => i.productId === "p-oil").length };
  });
  t.check("写し・買うもの：数・メモ・消す・しまう（品が外れる）・名前・足すも重なって見える", view.bread.qty === 3 && view.bread.memo === "薄切り" && !view.tea
    && !view.salt && view.prod.archived === true && view.prod.name === "天然塩" && view.oil === 1, JSON.stringify(view));
  t.check("写し・買うもの：操作ごとに一件（一回の操作は一件）", (await heldN()) === 7, String(await heldN()));
  /* 対応外：並べ替え・値段・新しい品物は依頼にしない（今までどおり戻る）。 */
  const before = await heldN();
  const order0 = await C.evaluate(() => KN.store.get().items.map((i) => i.id).join());
  await C.evaluate(() => {
    KN.store.update((s) => { s.items.reverse(); });
    KN.store.update((s) => { s.products.find((p) => p.id === "p-egg").prices.push({ id: "pr1", storeId: null, price: 100, amount: null, date: "2026-11-27" }); });
    KN.store.update((s) => { s.products.push({ id: "p-new", name: "新しい品", categoryId: "other", prices: [] }); });
    KN.store.update((s) => { s.todos.push({ id: "t-x", title: "やること", due: null }); });
  });
  await C.waitForTimeout(500);
  const order1 = await C.evaluate(() => KN.store.get().items.map((i) => i.id).join());
  t.check("写し・買うもの：並べ替え・値段・新しい品物・ほかの欄は依頼にしない（戻る）", (await heldN()) === before && order1 === order0
    && (await C.evaluate(() => KN.store.get().products.every((p) => p.id !== "p-new" && !p.prices.length) && KN.store.get().todos.every((x) => x.id !== "t-x"))));
  const ownS1 = await C.evaluate(() => localStorage.getItem("kaimono-note-v2"));
  t.check("写し・買うもの：記録（kaimono-note-v2）は一字も変わらない", ownS1 === ownS0);
  t.check("写し・買うもの：依頼は端末の入れ物へ一件一ファイル", box().length === 7 && (await C.evaluate(() => JSON.parse(localStorage.getItem("kn-desk-held") || "[]").every((h) => h.sent))), String(box().length));
  await C.reload();
  await booted(C);
  const again2 = await stateOf("i-egg");
  t.check("写し・買うもの：開き直しても重ねて見える", again2 && again2.checked === true, JSON.stringify(again2));

  /* iPad の縦（640〜839px）：丸を押せば同じ。 */
  await C.setViewportSize({ width: 820, height: 1180 });
  await C.waitForTimeout(700);
  if (await C.evaluate(() => document.documentElement.dataset.screen !== "list")) await C.click(".tab-list");   // 居る席をもう一度押すと価格へめくる
  await C.waitForSelector(rowOf("i-milk"), { timeout: 8000 });
  await C.click(rowOf("i-milk") + " .check");
  await C.waitForTimeout(2200);
  t.check("写し・買うもの：iPad の縦の幅でも丸を押せる", (await stateOf("i-milk")).checked === true && (await heldN()) === 8, String(await heldN()));
  await C.setViewportSize({ width: 1440, height: 900 });

  /* ---- やることの直し（同じ道。済ませる・題・メモ・旗・やる日・しまう。くり返し・時刻・手順・消す・並べ替えは依頼にしない） ---- */
  const heldT = () => C.evaluate(() => JSON.parse(localStorage.getItem("kn-desk-held") || "[]").filter((h) => h.o.kind === "shop" && h.o.shop.ops.some((op) => op.s === "todos")).length);
  const todoOf = (id) => C.evaluate((i) => (KN.store.get().todos.find((x) => x.id === i) || null), id);
  await C.click(".tab-todo");
  await C.waitForSelector('.tl-row[data-todo-id="t-a"] button.check', { timeout: 8000 });
  const fadeT = await C.evaluate(() => ["t-a", "t-b"].map((id) => Number(getComputedStyle([...document.querySelectorAll(`.tl-row[data-todo-id="${id}"] button.check`)].find((e) => e.getClientRects().length)).opacity)));
  t.check("写し・やること：丸は薄くしない（くり返しの丸は薄い）", fadeT[0] === 1 && fadeT[1] < 0.5, fadeT.join());
  await C.locator('.tl-row[data-todo-id="t-a"] button.check:visible').first().click();
  await C.waitForTimeout(2200);
  const ta = await todoOf("t-a");
  t.check("写し・やること：丸を押すと済みが重なり、依頼が一件置かれる（言われない）", ta && ta.done === true && (await heldT()) === 1
    && !(await C.evaluate(() => document.body.textContent.includes("iPhoneで操作できます"))), JSON.stringify(ta));
  const LATER = await C.evaluate(() => KN.util.shiftDay(KN.util.todayKey(), 5));
  await C.evaluate((later) => {
    const S = KN.store;
    S.updateTodo("t-c", { title: "直した用事", memo: "写しのメモ", flagged: true });
    S.updateTodo("t-c", { due: later });
    S.archiveTodo("t-d", true);
  }, LATER);
  await C.waitForTimeout(600);
  const nT = await heldT();
  await C.evaluate(() => {
    const S = KN.store;
    S.toggleTodo("t-b");
    S.updateTodo("t-e", { time: "22:00" });
    S.update((s) => { s.todos.find((x) => x.id === "t-c").subs.push({ id: "s-x", title: "手順", done: false }); });
    S.removeTodo("t-a");
    S.update((s) => { s.todos.reverse(); });
  });
  await C.waitForTimeout(600);
  const vT = await C.evaluate(() => Object.fromEntries(KN.store.get().todos.map((x) => [x.id, x])));
  t.check("写し・やること：題・メモ・旗・やる日・しまうが重なって見える（操作ごとに一件）", nT === 4 && vT["t-c"].title === "直した用事" && vT["t-c"].memo === "写しのメモ"
    && vT["t-c"].flagged === true && vT["t-c"].due === LATER && vT["t-d"].archived === true, JSON.stringify({ nT, c: vT["t-c"] }));
  t.check("写し・やること：くり返し・時刻・手順・消す・並べ替えは依頼にしない（戻る）", (await heldT()) === 4 && !vT["t-b"].done && vT["t-b"].due === TODAY
    && vT["t-e"].time === "21:00" && !vT["t-c"].subs.length && !!vT["t-a"] && (await C.evaluate(() => KN.store.get().todos[0].id)) !== "t-e");
  t.check("写し・やること：記録（kaimono-note-v2）は一字も変わらない", (await C.evaluate(() => localStorage.getItem("kaimono-note-v2"))) === ownS0);

  /* ---- からだの直し（同じ道。体重・食事・お酒・飲みたくなったときの 足す・直す・消す。目標・ヘルスケアは依頼にしない） ---- */
  const heldD = () => C.evaluate(() => JSON.parse(localStorage.getItem("kn-desk-held") || "[]").filter((h) => h.o.shop && h.o.shop.ops.some((op) => op.s === "weights")).length);
  await C.click(".tab-diet");
  await C.waitForTimeout(600);
  const fabD = await C.evaluate(() => Number(getComputedStyle(document.querySelector("#dock .add-fab")).opacity));
  await C.evaluate(() => {
    const S = KN.store;
    S.addWeight({ kg: 59.5 });
    S.updateWeight("w-a", { memo: "写しのメモ" });
    S.removeWeight("w-b");
    S.removeWeight("w-c");
    S.update((s) => { s.diet.goal.targetKg = 55; });
    S.update((s) => { s.diet.health.push({ id: "h-x", day: "2026-11-20", type: "steps", value: 100 }); });
  });
  await C.waitForTimeout(600);
  const vD = await C.evaluate(() => { const d = KN.store.get().diet; return { kg: d.weights.map((w) => w.kg).sort().join(), memo: d.weights.find((w) => w.id === "w-a").memo, goal: d.goal.targetKg, h: d.health.length }; });
  t.check("写し・からだ：＋は薄くせず、足す・直す・消すが重なって見える（操作ごとに一件）", fabD === 1 && (await heldD()) === 4 && vD.kg === "59.5,60"
    && vD.memo === "写しのメモ", JSON.stringify({ fabD, n: await heldD(), vD }));
  t.check("写し・からだ：目標・ヘルスケアは依頼にしない（戻る）", !vD.goal && !vD.h && (await C.evaluate(() => localStorage.getItem("kaimono-note-v2"))) === ownS0, JSON.stringify(vD));

  /* ---- 覚えた分類・絵の言い換え・問いの元（同じ道。鍵ごとに一件。多い依頼は分ける） ---- */
  const heldK = () => C.evaluate(() => JSON.parse(localStorage.getItem("kn-desk-held") || "[]").filter((h) => h.o.shop && h.o.shop.ops.some((op) => op.t === "key")).length);
  await C.evaluate(() => {
    const S = KN.store;
    S.learnCategory("たまご", "c-cold");
    S.forgetCategory("牛乳");
    S.forgetCategory("塩");
    S.setIconOverride("お茶", "apple");
    S.setAsks([{ q: "試験の問い一", hint: "直した" }, { q: "試験の問い三" }, ...Array.from({ length: 60 }, (_, i) => ({ q: `足す問い${i}` }))]);
  });
  await C.waitForTimeout(600);
  const vK = await C.evaluate(() => { const s = KN.store.get(); return { l: Object.keys(s.learned).join(), egg: s.learned.たまご, ic: s.iconOverrides.お茶,
    a: s.asks.length, one: s.asks.find((x) => x.q === "試験の問い一").hint, two: s.asks.some((x) => x.q === "試験の問い二") }; });
  t.check("写し・分類・絵・問い：覚える・忘れる・絵・問いの入れ替えが重なって見える（63の直しは二件に分ける）", (await heldK()) === 6 && vK.l === "たまご"
    && vK.egg.category === "c-cold" && vK.ic === "apple" && vK.a === 62 && vK.one === "直した" && !vK.two
    && (await C.evaluate(() => localStorage.getItem("kaimono-note-v2"))) === ownS0, JSON.stringify({ n: await heldK(), vK }));

  /* ---- 店・分類（同じ道。からだと同じ形：欄を問わず直す・足す・そのままなら消す。並べ替えも） ---- */
  const heldR = () => C.evaluate(() => JSON.parse(localStorage.getItem("kn-desk-held") || "[]").filter((h) => h.o.shop && h.o.shop.ops.some((op) => ["stores", "categories"].includes(op.s))).length);
  await C.evaluate(() => {
    const S = KN.store;
    S.update((s) => { s.stores.find((x) => x.id === "s-a").name = "店あ"; });
    S.addStore("店D");
    S.update((s) => { s.stores = s.stores.filter((x) => x.id !== "s-b"); });
    S.update((s) => { s.stores = s.stores.filter((x) => x.id !== "s-c"); });   // iPhone ではこの店に値段がある
    S.update((s) => { s.categories.find((c) => c.id === "c-veg").name = "やさい"; });
    S.update((s) => { s.categories.push({ id: "c-new", name: "おやつ", emoji: "", color: "#888888", order: 99 }); });
    S.update((s) => { s.categories = s.categories.filter((c) => c.id !== "c-meat"); });
    KN.reorder.applyOrder(S.sortedCategories(), 0, 2, (s) => s.categories);
  });
  await C.waitForTimeout(600);
  const catsOf = (P) => P.evaluate(() => { const s = KN.store.get(); return { st: s.stores.map((x) => x.name).join(), a: (s.stores.find((x) => x.id === "s-a") || {}).color,
    c: KN.store.sortedCategories().map((c) => c.id).join(), veg: s.categories.find((c) => c.id === "c-veg").name }; });
  const vR = await catsOf(C);
  t.check("写し・店・分類：名前・足す・消す・並べ替えが重なって見える（操作ごとに一件）", (await heldR()) === 8 && vR.st === "店あ,店D" && vR.veg === "やさい"
    && /^c-food,[\w-]+,c-veg,/.test(vR.c) && vR.c.endsWith("c-new") && !vR.c.includes("c-meat")
    && (await C.evaluate(() => localStorage.getItem("kaimono-note-v2"))) === ownS0, JSON.stringify({ n: await heldR(), vR }));

  /* ---- 主の一台：iPhone が先に変えていた欄は動かさない。もう無い品は戻さない ---- */
  hideBox = true;   // 記録を用意するあいだ、勝手な取り込みを走らせない
  const M2 = await open({ before: route });
  const D = M2.page;
  await D.evaluate(([base]) => {
    KN.store.update((s) => {
      s.products = base.products.map((p) => ({ ...p }));
      s.items = base.items.map((i) => ({ ...i }));
      s.items.find((i) => i.id === "i-bread").memo = "iPhoneのメモ";   // 写しの「メモ」依頼は当てない（前の値が違う）
      s.items = s.items.filter((i) => i.id !== "i-milk");              // もう無い品に★・丸が来ても戻さない
      s.todos = base.todos.map((x) => ({ ...x }));
      s.todos.find((x) => x.id === "t-c").memo = "iPhoneのメモ";       // やることも同じ：変えていた欄は動かさない
      s.diet.weights = base.diet.weights.map((w) => ({ ...w, memo: "", kg: w.id === "w-c" ? 63 : w.kg }));   // 変えていた体重は消さない
      s.learned = { ...base.learned, 牛乳: { category: "c-drink", label: "牛乳" } };   // 変えていた分類は忘れない
      s.asks = base.asks.map((a) => ({ ...a, hint: a.q === "試験の問い二" ? "iPhone" : "" }));   // 変えていた問いは外さない
      s.stores = base.stores.map((x) => ({ ...x, color: x.id === "s-a" ? "#123456" : x.color }));   // 変えていた色は動かさない
      s.products.find((p) => p.id === "p-egg").prices = [{ id: "pr-c", storeId: "s-c", price: 100, amount: null, date: "2026-11-27" }];   // 値段のある店は消さない
    });
    KN.store.saveNow();
    localStorage.setItem("kaimono-note-dropbox", JSON.stringify({ appKey: "k", refresh: "r", access: "a", expires: Date.now() + 864e5, sender: true, lastAt: "2026-11-27T00:00:00Z" }));
  }, [shopBase()]);
  await D.waitForTimeout(800);
  await D.reload();
  await booted(D);
  await D.evaluate(() => KN.diaryIdb.ready());
  const sentS = puts.length;
  hideBox = false;
  const nS = await D.evaluate(() => KN.deskInbox.take());
  await D.waitForTimeout(600);
  const gotS = await D.evaluate(() => {
    const s = KN.store.get();
    const it = (id) => s.items.find((i) => i.id === id) || null;
    return { egg: it("i-egg"), milk: it("i-milk"), bread: it("i-bread"), tea: it("i-tea"), salt: it("i-salt"),
      salt0: s.products.find((p) => p.id === "p-salt"), oil: s.items.filter((i) => i.productId === "p-oil").length,
      seen: Object.keys(s.inboxSeen || {}).length, snaps: KN.backup.list().map((x) => x.reason),
      t: Object.fromEntries(s.todos.map((x) => [x.id, x])), w: s.diet.weights.map((w) => `${w.id === "w-a" ? w.memo : ""}${w.kg}`).sort().join(),
      l: Object.entries(s.learned).map(([k, v]) => k + v.category).sort().join(), ic: s.iconOverrides.お茶, a: s.asks.length, hint: s.asks.map((x) => x.hint).join("") };
  });
  t.check("主・分類・絵・問い：前のままの鍵だけ当てる（iPhone が変えていた分類・問いは残す）", gotS.l === "たまごc-cold,牛乳c-drink" && gotS.ic === "apple"
    && gotS.a === 63 && gotS.hint === "直したiPhone" && gotS.salt0.catManual === true, JSON.stringify({ l: gotS.l, ic: gotS.ic, a: gotS.a, hint: gotS.hint }));
  const gR = await catsOf(D);
  t.check("主・店・分類：名前・足す・消す・並べ替えを当て、iPhone が変えていた色・値段のある店は残す", gR.st === "店あ,店c,店D" && gR.a === "#123456"
    && gR.veg === "やさい" && gR.c === vR.c, JSON.stringify({ gR, vR }));
  t.check("主・買うもの：買った印・数・消す・しまう・名前・足すを当てる", gotS.egg.checked === true && !!gotS.egg.checkedAt && gotS.bread.qty === 3 && !gotS.tea
    && !gotS.salt && gotS.salt0.archived === true && gotS.salt0.name === "天然塩" && gotS.oil === 1, JSON.stringify(gotS));
  t.check("主・買うもの：iPhone が変えていた欄は動かさない（メモ）・もう無い品は戻さない", gotS.bread.memo === "iPhoneのメモ" && !gotS.milk, JSON.stringify(gotS.bread));
  const gT = gotS.t;
  t.check("主・やること：済み・題・旗・やる日・しまうを当て、iPhone が変えていたメモは動かさない", gT["t-a"].done === true && gT["t-c"].title === "直した用事"
    && gT["t-c"].flagged === true && gT["t-c"].due === LATER && gT["t-c"].memo === "iPhoneのメモ" && gT["t-d"].archived === true
    && !gT["t-b"].done && gT["t-e"].time === "21:00", JSON.stringify(gT["t-c"]));
  t.check("主・買うもの：先に自動の控え・済んだ依頼は inboxSeen へ・ファイルは .done へ", gotS.snaps.includes("受け箱の取り込み前") && gotS.seen === 30
    && box().length === 0 && done().length === 30 && nS >= 5, JSON.stringify({ nS, seen: gotS.seen, box: box().length, done: done().length }));
  t.check("主・からだ：足す・直す・消すを当て、iPhone が変えていた一件は消さない", gotS.w === "59.5,63,写しのメモ60", gotS.w);
  const snapS = await D.evaluate(() => JSON.stringify(KN.store.get().items));
  const nS2 = await D.evaluate(() => KN.deskInbox.take());
  t.check("主・買うもの：二度当てない", nS2 === 0 && (await D.evaluate(() => JSON.stringify(KN.store.get().items))) === snapS);
  t.check("主・買うもの：取りこんだら控えを早めに送る", puts.slice(sentS).includes("/kurashi-latest.json"), puts.slice(sentS).join(" "));

  /* ---- 写しへ戻る：iPhone の控えが届けば、重ねは外れて iPhone の中身が見える ---- */
  await C.evaluate(() => KN.replica.refresh());
  await C.waitForTimeout(1200);
  const backS = await C.evaluate(() => {
    const s = KN.store.get();
    return { held: JSON.parse(localStorage.getItem("kn-desk-held") || "[]").length, bread: s.items.find((i) => i.id === "i-bread"), milk: s.items.find((i) => i.id === "i-milk") || null,
      memo: s.todos.find((x) => x.id === "t-c").memo };
  });
  t.check("写し・買うもの：iPhone の控えが届けば重ねは外れ、iPhone の中身（メモ・無い品）が見える", backS.held === 0 && backS.bread.memo === "iPhoneのメモ" && !backS.milk
    && backS.memo === "iPhoneのメモ", JSON.stringify(backS));
  t.check("エラーなし（買うものの直し）", !R2.errors.length && !M2.errors.length, [...R2.errors, ...M2.errors].join(" | "));
  await R2.browser.close();
  await M2.browser.close();

  t.check("エラーなし", !R.errors.length && !M.errors.length, [...R.errors, ...M.errors].join(" | "));
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
