/* 思考のホーム・時刻ごとの日記（docs/thinking.md）。
   - 本文は一つの文字のまま：一件は「時刻だけの行」から。前からの本文（時刻の行なし）は一字も変わらない
   - daily の冒頭に書く口と問いの札。＋も書く口も、種類を選ばずに書く紙（新しい一件）
   - 打った先から残る（時刻は打ち始めた時）。直しても時刻の行は変わらない。空にすると外れ、元に戻せる
   - 開いて閉じただけでは本文の形を変えない（空行の多い一件でも）
   - ノートへ移す：新しいノート（作った日＝その一件の時刻）・前からのノートの終わり（日付と時刻の行）。
     書けたと確かめてから日記から外し、元に戻すで両方戻る
   - コピーは前のまま（本文はそのまま・完了したことなど）
   - 設定「一枚」で前の紙（行を押すと日記の紙、＋も日記の紙）
   - 本文を読めない日は書く紙を開かない。達成・変化の札は新しくは出ない
   日記の本文は試験用の無難な字だけ。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/diary-chat.js */
const path = require("path");
const { open, checker } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "diary-posts.js"));
const P = global.KN.diaryPosts;

const t = checker("diary-chat");
const AT = new Date(2026, 9, 6, 12, 34);

/* ---- 文字だけ（純粋） ---- */
{
  const legacy = "2026.10.06（火）\n\n前からの地の文。\n\n6:30\n起きた時刻の行も地の文のうち";
  const items = P.parse("前からの地の文。");
  t.check("時刻の行の無い本文は、頭の一件だけ", items.length === 1 && items[0].mark === null && items[0].text === "前からの地の文。");
  const a = P.add("前からの地の文。\n\n", "  一件目\n二行目\n\n", "12:34");
  t.check("足すと空の行一つをはさんで終わりに", a.memo === "前からの地の文。\n\n12:34\n  一件目\n二行目", JSON.stringify(a.memo));
  t.check("本文の無い日は頭の字を置いてから", P.add("", "はじめて", "08:00", "2026.10.06（火）\n\n").memo === "2026.10.06（火）\n\n08:00\nはじめて");
  t.check("空は足さない", P.add("x", " \n ", "08:00") === null);
  const two = P.add(a.memo, "二件目", "13:00").memo;
  const it = P.parse(two)[1];
  const ed = P.swap(two, P.chunkAt(it), P.chunkOf(two, it), P.chunk(it, "一件目を直した"));
  t.check("直すのはその一件だけ（時刻の行・ほかはそのまま）", ed === "前からの地の文。\n\n12:34\n一件目を直した\n\n13:00\n二件目", JSON.stringify(ed));
  t.check("開いたときの字が無ければ書かない", P.swap(two, P.chunkAt(it), "ちがう字", "x") === null);
  const mid = P.parse(ed)[1];
  t.check("まん中を外すと継ぎ目は空の行一つ", P.take(ed, P.chunkAt(mid), P.chunkOf(ed, mid)) === "前からの地の文。\n\n13:00\n二件目");
  const last = P.parse(ed)[2];
  t.check("終わりを外すと空白を残さない", P.take(ed, P.chunkAt(last), P.chunkOf(ed, last)) === "前からの地の文。\n\n12:34\n一件目を直した");
  const head = P.parse(ed)[0];
  t.check("頭を外すと一件目から", P.take(ed, P.chunkAt(head), P.chunkOf(ed, head)) === "12:34\n一件目を直した\n\n13:00\n二件目");
  const wide = P.parse("１０/７ ０７：０５\n次の日に書いた");
  t.check("全角・ほかの日の時刻の行も読む", wide.length === 1 && wide[0].at === "07:05" && wide[0].date === "10/7");
  t.check("書いた日が違えば日付も", P.mark(new Date(2026, 9, 7, 7, 5), "2026-10-06") === "10/7 07:05"
    && P.mark(new Date(2026, 9, 6, 7, 5), "2026-10-06") === "07:05");
  const lg = P.parse(legacy);
  t.check("「6:30」だけの行は時刻の行として読む（見せ方だけ。本文は変えない）", lg.length === 2 && lg[1].at === "06:30");
}

(async () => {
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(AT); },
  });
  const day = await page.evaluate(() => KN.util.todayKey());
  const memo = () => page.evaluate((d) => (KN.store.dayLog(d) || {}).memo || "", day);
  const setMemo = (m) => page.evaluate(([d, v]) => KN.store.setDayLog(d, { memo: v }), [day, m]);
  const sheetOpen = () => page.waitForSelector(".sheet.is-open.is-card .js-memo", { timeout: 4000 });
  const closeSheet = async () => {
    await page.click(".sheet.is-open .js-ok");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(150);
  };
  const posts = () => page.evaluate(() => [...document.querySelectorAll("#screen-archive .arc-log-row.is-chat .arc-post")]
    .map((p) => ({ at: (p.querySelector(".arc-post-at") || {}).textContent || null, text: p.querySelector(".arc-post-text").textContent })));

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);

  /* ---- 冒頭：書く口と問いの札。空の日の一行は前のまま ---- */
  const home = await page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const h = root.querySelector(".think-home");
    const slide = root.querySelector(".day-slide");
    const blank = root.querySelector(".arc-log-row.is-today .arc-log-memo");
    return { home: !!h, first: !!(h && slide && slide.firstElementChild === h), write: h ? h.querySelector(".js-think-write").textContent.trim() : "",
      ask: !!(h && h.querySelector(".js-think-ask")), blank: blank ? blank.textContent.trim() : null,
      emoji: /\p{Extended_Pictographic}/u.test(root.innerText) };
  });
  t.check("daily の冒頭に書く口", home.home && home.first && home.write === "書く", JSON.stringify(home));
  t.check("問いの札がある", home.ask);
  t.check("空の日の一行は「この日のことを書く」のまま", home.blank === "この日のことを書く", String(home.blank));
  t.check("絵文字なし", !home.emoji);

  /* ---- 書く口：種類を選ばずに書く紙。打った先から残る ---- */
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  const s1 = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    return { focused: document.activeElement === s.querySelector(".js-memo"), pick: !!s.querySelector(".js-pick, .arc-pick-b"),
      ok: s.querySelector(".js-ok").textContent.trim(), title: s.querySelector(".sheet-title").textContent.trim() };
  });
  t.check("書く紙は欄にカーソル・種類の札なし", s1.focused && !s1.pick, JSON.stringify(s1));
  t.check("ボタンは「送る」・題はその日", s1.ok === "送る" && /10月6日/.test(s1.title), JSON.stringify(s1));
  await page.keyboard.insertText("一件目の字");
  await page.waitForTimeout(800);
  const m1 = await memo();
  const said = () => page.evaluate(() => [...document.querySelectorAll(".toast-msg")].map((x) => x.textContent).join("|"));
  t.check("打った先から残る（頭に日付の行・時刻の行）", /^2026\.10\.06（火）\n/.test(m1) && m1.endsWith("\n\n12:34\n一件目の字"), JSON.stringify(m1));
  await closeSheet();
  t.check("新しい一件を閉じたら「保存しました」", /保存しました/.test(await said()), await said());
  const p1 = await posts();
  t.check("一件が時刻つきで出る", p1.length === 2 && p1[1].at === "12:34" && p1[1].text === "一件目の字" && p1[0].at === null, JSON.stringify(p1));

  /* ---- ＋も同じ書く紙。二件目 ---- */
  await page.evaluate(() => document.querySelector('#dock button[aria-label="書く"]').click());
  await sheetOpen();
  const plus = await page.evaluate(() => !!document.querySelector(".sheet.is-open .arc-pick-b") || /記録を書く/.test(document.querySelector(".sheet.is-open").textContent));
  t.check("＋で記録の紙（種類の札）は出ない", !plus);
  await page.keyboard.insertText("二件目の字");
  await closeSheet();
  const m2 = await memo();
  t.check("二件目は終わりに", m2.endsWith("\n\n12:34\n一件目の字\n\n12:34\n二件目の字"), JSON.stringify(m2));

  /* ---- 一件を直す：時刻の行もほかの一件も変わらない ---- */
  await page.click("#screen-archive .arc-post:nth-child(2)");
  await sheetOpen();
  const s2 = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    return { v: s.querySelector(".js-memo").value, title: s.querySelector(".sheet-title").textContent.trim(),
      ok: s.querySelector(".js-ok").textContent.trim(), focused: document.activeElement === s.querySelector(".js-memo") };
  });
  t.check("その一件の字で開く（題に時刻・キーボードは出さない）", s2.v === "一件目の字" && /12:34/.test(s2.title) && s2.ok === "閉じる" && !s2.focused, JSON.stringify(s2));
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.press("End");
  await page.keyboard.insertText("を直した");
  await closeSheet();
  t.check("直して閉じたら「更新しました」", /更新しました/.test(await said()), await said());
  const m3 = await memo();
  t.check("直したのはその一件だけ", m3 === m2.replace("12:34\n一件目の字", "12:34\n一件目の字を直した"), JSON.stringify(m3));

  /* ---- 開いて閉じただけでは形を変えない（空行の多い一件） ---- */
  const odd = "前からの地の文。\n\n\n12:00\n\n空行のある一件\n\n\n13:00\nもう一件";
  await setMemo(odd);
  await page.waitForTimeout(300);
  await page.click("#screen-archive .arc-post:nth-child(2)");
  await sheetOpen();
  await closeSheet();
  t.check("開いて閉じただけなら一字も変わらない", (await memo()) === odd, JSON.stringify(await memo()));

  /* ---- 空にして閉じると外れる → 元に戻す ---- */
  await page.click("#screen-archive .arc-post:nth-child(2)");
  await sheetOpen();
  await page.fill(".sheet.is-open .js-memo", "");
  await page.dispatchEvent(".sheet.is-open .js-memo", "input");
  await closeSheet();
  const m4 = await memo();
  t.check("空にすると、その一件だけ外れる", m4 === "前からの地の文。\n\n13:00\nもう一件", JSON.stringify(m4));
  const undo = await page.evaluate(() => { const b = [...document.querySelectorAll(".toast-action")].find((x) => x.textContent === "元に戻す"); if (b) b.click(); return !!b; });
  await page.waitForTimeout(200);
  t.check("元に戻すで戻る", undo && (await memo()) === odd, JSON.stringify(await memo()));

  /* ---- 「消す」（⋯） ---- */
  await page.click("#screen-archive .arc-post:nth-child(3)");
  await sheetOpen();
  await page.click(".sheet.is-open .js-menu");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "消す" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(150);
  t.check("⋯ の「消す」で外れる", (await memo()) === "前からの地の文。\n\n\n12:00\n\n空行のある一件", JSON.stringify(await memo()));

  /* ---- コピーは前のまま（本文はそのまま、済んだやること） ---- */
  await setMemo("2026.10.06（火）\n\n08:00\n朝の一件\n\n12:34\n昼の一件");
  const copied = await page.evaluate(async () => {
    const S = KN.store;
    const todo = S.addTodo({ title: "試験のやること", due: KN.util.todayKey() });
    if (todo) S.toggleTodo(todo.id);
    await new Promise((r) => setTimeout(r, 400));
    let got = null;
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: (s) => { got = s; return Promise.resolve(); } } });
    document.querySelector("#screen-archive .js-log-copy").click();
    await new Promise((r) => setTimeout(r, 200));
    return got;
  });
  t.check("コピーは本文そのまま＋完了したこと", copied != null
    && copied.startsWith("2026.10.06（火）\n\n08:00\n朝の一件\n\n12:34\n昼の一件\n\n")
    && /完了したこと（この日にやり終えたもの）\n・試験のやること/.test(copied), JSON.stringify(copied));

  /* ---- ノートへ移す：新しいノート ---- */
  await page.waitForFunction(() => KN.notes && KN.notes.state() === "on", null, { timeout: 5000 });
  await page.click("#screen-archive .arc-post:nth-child(2)");
  await sheetOpen();
  await page.click(".sheet.is-open .js-menu");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "ノートへ移す" }).click();
  await page.waitForSelector(".sheet.is-open .js-fresh", { timeout: 4000 });
  const picker = await page.evaluate(() => document.querySelector(".sheet.is-open .sheet-title").textContent.trim());
  t.check("移す先の紙（新しいノートが頭）", picker === "ノートへ移す", picker);
  await page.click(".sheet.is-open .js-fresh");
  await page.waitForFunction(() => [...document.querySelectorAll(".toast-msg")].some((x) => x.textContent === "ノートへ移しました"), null, { timeout: 4000 }).catch(() => {});
  const moved = await page.evaluate((d) => {
    const n = KN.notes.list().find((x) => x.body === "朝の一件");
    return { n: !!n, created: n ? n.createdAt : null, local: n ? new Date(n.createdAt).getHours() * 100 + new Date(n.createdAt).getMinutes() : null,
      memo: (KN.store.dayLog(d) || {}).memo, id: n ? n.id : null };
  }, day);
  t.check("新しいノートに、その一件の字", moved.n, JSON.stringify(moved));
  t.check("作った日はその一件の時刻（8:00）", moved.local === 800, JSON.stringify(moved));
  t.check("日記からは外れる", moved.memo === "2026.10.06（火）\n\n12:34\n昼の一件", JSON.stringify(moved.memo));
  const idb = await page.evaluate((id) => new Promise((res) => {
    const r = indexedDB.open("kaimono-note-notes");
    r.onsuccess = () => { const g = r.result.transaction("notes").objectStore("notes").get(id); g.onsuccess = () => res(g.result ? g.result.body : null); };
    r.onerror = () => res(null);
  }), moved.id);
  t.check("ノートは入れ物に書けている", idb === "朝の一件", String(idb));
  await page.evaluate(() => { const b = [...document.querySelectorAll(".toast-action")].find((x) => x.textContent === "元に戻す"); if (b) b.click(); });
  await page.waitForTimeout(300);
  const back = await page.evaluate(([d, id]) => ({ memo: (KN.store.dayLog(d) || {}).memo, note: !!KN.notes.get(id) }), [day, moved.id]);
  t.check("元に戻すで、日記に戻りノートは消える", back.memo === "2026.10.06（火）\n\n08:00\n朝の一件\n\n12:34\n昼の一件" && !back.note, JSON.stringify(back));

  /* ---- ノートへ移す：前からのノートの終わりへ ---- */
  const nid = await page.evaluate(() => {
    const n = KN.notes.draft();
    n.title = "試験のノート"; n.body = "前からの本文";
    KN.notes.put(n);
    return n.id;
  });
  await page.evaluate(() => KN.notes.flush());
  await page.click("#screen-archive .arc-post:nth-child(3)");
  await sheetOpen();
  await page.click(".sheet.is-open .js-menu");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "ノートへ移す" }).click();
  await page.waitForSelector(`.sheet.is-open .note-ver[data-id="${nid}"]`, { timeout: 4000 });
  await page.click(`.sheet.is-open .note-ver[data-id="${nid}"]`);
  await page.waitForFunction(() => [...document.querySelectorAll(".toast-msg")].some((x) => x.textContent === "ノートへ移しました"), null, { timeout: 4000 }).catch(() => {});
  const app = await page.evaluate(([d, id]) => ({ body: KN.notes.get(id).body, memo: (KN.store.dayLog(d) || {}).memo }), [day, nid]);
  t.check("前からのノートの終わりに日付と時刻の行と字", app.body === "前からの本文\n\n10月6日(火) 12:34\n昼の一件", JSON.stringify(app.body));
  t.check("日記からは外れる（頭と一件目は残る）", app.memo === "2026.10.06（火）\n\n08:00\n朝の一件", JSON.stringify(app.memo));

  /* ---- 起床・就寝の行・「一枚で開く」は一枚の紙へ（時刻の欄と本文ぜんぶ） ---- */
  const base = await memo();
  await page.click("#screen-archive .arc-log-row.is-chat .js-times");
  await sheetOpen();
  const viaTimes = await page.evaluate(() => ({ t: document.querySelector(".sheet.is-open .sheet-title").textContent,
    wake: !!document.querySelector(".sheet.is-open .js-wake"), v: document.querySelector(".sheet.is-open .js-memo").value }));
  t.check("起床・就寝の行を押すと一枚の紙（時刻の欄・本文ぜんぶ）", / の log/.test(viaTimes.t) && viaTimes.wake && viaTimes.v === base, JSON.stringify(viaTimes));
  await closeSheet();
  await page.click("#screen-archive .arc-post:nth-child(2)");
  await sheetOpen();
  await page.click(".sheet.is-open .js-menu");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "一枚で開く" }).click();
  await page.waitForFunction(() => { const x = document.querySelector(".sheet.is-open .sheet-title"); return !!x && / の log/.test(x.textContent); }, null, { timeout: 4000 }).catch(() => {});
  const viaMenu = await page.evaluate(() => document.querySelector(".sheet.is-open .js-memo").value);
  t.check("「⋯」の「一枚で開く」で本文ぜんぶの紙", viaMenu === base, JSON.stringify(viaMenu));
  await closeSheet();
  t.check("開いて閉じただけなら本文は同じ", (await memo()) === base);

  /* ---- 書いたばかりの一件も「消す」で外れ、元に戻せる ---- */
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  await page.keyboard.insertText("すぐ消す一件");
  await page.waitForTimeout(800);
  const withNew = await memo();
  await page.click(".sheet.is-open .js-menu");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "消す" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(150);
  t.check("書いたばかりの一件を消す", withNew.endsWith("\n\n12:34\nすぐ消す一件") && (await memo()) === base, JSON.stringify(await memo()));
  await page.evaluate(() => { const b = [...document.querySelectorAll(".toast-action")].find((x) => x.textContent === "元に戻す"); if (b) b.click(); });
  await page.waitForTimeout(200);
  t.check("…元に戻せる", (await memo()) === withNew, JSON.stringify(await memo()));
  await setMemo(base);
  await page.waitForTimeout(200);

  /* ---- 本文を読めない日：書く紙を開かない ---- */
  const before = await memo();
  await page.evaluate(() => { window.__body = KN.diaryIdb.body; KN.diaryIdb.body = () => "loading"; });
  await page.click("#screen-archive .js-think-write").catch(() => {});
  await page.waitForTimeout(300);
  const blocked = await page.evaluate(() => !document.querySelector(".sheet.is-open"));
  await page.evaluate(() => { KN.diaryIdb.body = window.__body; });
  t.check("読み込み中は書く紙を開かない・本文はそのまま", blocked && (await memo()) === before);

  /* ---- 設定「一枚」：前の紙 ---- */
  await page.evaluate(() => KN.store.update((s) => { s.settings.diaryView = "page"; }));
  await page.waitForTimeout(400);
  const pg = await page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const m = root.querySelector(".arc-log-row .arc-log-memo");
    return { home: !!root.querySelector(".think-home"), chat: !!root.querySelector(".arc-log-row.is-chat"), memo: m ? m.textContent : null };
  });
  t.check("一枚：冒頭の口は出さず、本文は一枚のまま（時刻の行も字のまま）", !pg.home && !pg.chat && pg.memo === "2026.10.06（火）\n\n08:00\n朝の一件", JSON.stringify(pg));
  await page.evaluate(() => document.querySelector('#dock button[aria-label="書く"]').click());
  await sheetOpen();
  const pgSheet = await page.evaluate(() => ({ v: document.querySelector(".sheet.is-open .js-memo").value, t: document.querySelector(".sheet.is-open .sheet-title").textContent }));
  t.check("一枚：＋はその日の日記の紙（本文ぜんぶ）", pgSheet.v === "2026.10.06（火）\n\n08:00\n朝の一件" && / の log/.test(pgSheet.t), JSON.stringify(pgSheet));
  await closeSheet();
  t.check("一枚の紙を開いて閉じても本文は同じ", (await memo()) === "2026.10.06（火）\n\n08:00\n朝の一件");

  /* ---- 設定の行 ---- */
  await page.evaluate(() => KN.store.update((s) => { delete s.settings.diaryView; }));
  const row = await page.evaluate(() => {
    const box = document.createElement("div");
    KN.settingsParts.dailyViewRows().filter(Boolean).forEach((r) => box.append(r));
    return box.textContent.replace(/\s+/g, " ");
  });
  t.check("設定がなければ時刻ごと（設定の行にも）", /日記\s*時刻ごと/.test(row), row.slice(0, 80));

  /* ---- 積み上げはやめた：記録の紙を開く口は無い ---- */
  const gone = await page.evaluate(() => ({ open: typeof KN.screens.archive.openEntry, seed: typeof KN.screens.archive.seedFromNote }));
  t.check("記録の紙を開く口は無い", gone.open === "undefined" && gone.seed === "undefined", JSON.stringify(gone));

  t.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
