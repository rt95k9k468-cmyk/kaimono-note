/* 思考のホーム・時刻ごとの日記（docs/thinking.md）。
   - 本文は一つの文字のまま：一件は「このアプリが書いた時刻の行」（見えない印 U+2060 つき）から。
     印の無い時刻の行（前からの本文・取り込んだ本文・10月12〜13日の版の一件）は分けず、一字も変わらない
   - 一件は吹き出し。長い一件は頭と終わりの三行ずつで畳み、押すと伸び縮み（書く紙は開かない）。直す・コピーは左の余白のボタン
     （日付と育休の行だけの頭には出さない）
   - 印は書き出し→取り込み・写し（diary-idb）にそのまま乗る
   - daily の冒頭に書く口と問いの札。＋も書く口も、種類を選ばずに書く紙（新しい一件）
   - 今日の問いは開くたびにでたらめに引き、最近出た問い（askSeen）を避ける（読み込み直すと替わる）
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
const { open, checker, ASKS } = require("./lib");

global.window = global;
require(path.join(__dirname, "..", "js", "diary-posts.js"));
const P = global.KN.diaryPosts;

const t = checker("diary-chat");
/* 印。tag は、字の中の「時刻だけの行」に印を付ける（このアプリが書いた形）。 */
const W = P.TAG;
const tag = (s) => s.replace(/^((?:\d{1,2}\/\d{1,2} )?\d{1,2}:\d\d)$/gm, `$1${W}`);
const AT = new Date(2026, 9, 6, 12, 34);

/* ---- 文字だけ（純粋） ---- */
{
  const legacy = "2026.10.06（火）\n\n前からの地の文。\n\n6:30\n起きた時刻の行も地の文のうち";
  const items = P.parse("前からの地の文。");
  t.check("時刻の行の無い本文は、頭の一件だけ", items.length === 1 && items[0].mark === null && items[0].text === "前からの地の文。");
  const a = P.add("前からの地の文。\n\n", "  一件目\n二行目\n\n", tag("12:34"));
  t.check("足すと空の行一つをはさんで終わりに", a.memo === tag("前からの地の文。\n\n12:34\n  一件目\n二行目"), JSON.stringify(a.memo));
  t.check("本文の無い日は頭の字を置いてから", P.add("", "はじめて", tag("08:00"), "2026.10.06（火）\n\n").memo === tag("2026.10.06（火）\n\n08:00\nはじめて"));
  t.check("空は足さない", P.add("x", " \n ", tag("08:00")) === null);
  const two = P.add(a.memo, "二件目", tag("13:00")).memo;
  const it = P.parse(two)[1];
  const ed = P.swap(two, P.chunkAt(it), P.chunkOf(two, it), P.chunk(it, "一件目を直した"));
  t.check("直すのはその一件だけ（時刻の行・ほかはそのまま）", ed === tag("前からの地の文。\n\n12:34\n一件目を直した\n\n13:00\n二件目"), JSON.stringify(ed));
  t.check("開いたときの字が無ければ書かない", P.swap(two, P.chunkAt(it), "ちがう字", "x") === null);
  const mid = P.parse(ed)[1];
  t.check("まん中を外すと継ぎ目は空の行一つ", P.take(ed, P.chunkAt(mid), P.chunkOf(ed, mid)) === tag("前からの地の文。\n\n13:00\n二件目"));
  const last = P.parse(ed)[2];
  t.check("終わりを外すと空白を残さない", P.take(ed, P.chunkAt(last), P.chunkOf(ed, last)) === tag("前からの地の文。\n\n12:34\n一件目を直した"));
  const head = P.parse(ed)[0];
  t.check("頭を外すと一件目から", P.take(ed, P.chunkAt(head), P.chunkOf(ed, head)) === tag("12:34\n一件目を直した\n\n13:00\n二件目"));
  const wide = P.parse(`１０/７ ０７：０５${W}\n次の日に書いた`);
  t.check("全角・ほかの日の時刻の行も読む", wide.length === 1 && wide[0].at === "07:05" && wide[0].date === "10/7");
  t.check("書いた日が違えば日付も（印つき）", P.mark(new Date(2026, 9, 7, 7, 5), "2026-10-06") === `10/7 07:05${W}`
    && P.mark(new Date(2026, 9, 6, 7, 5), "2026-10-06") === `07:05${W}`);
  const lg = P.parse(legacy);
  t.check("印の無い「6:30」だけの行は分けない（地の文のまま）", lg.length === 1 && lg[0].text === legacy.trim(), JSON.stringify(lg));
}

/* ---- 前からの本文・取り込んだ本文は分けない（印の無い時刻の行） ---- */
{
  const old = "2025.03.02（日）\n\n\n08:30\n起きた。\n\n１２：００\n昼。\n\n10/12 08:52\n前の版の一件\n\n\n\n"
    + "長い段落".repeat(200) + "\n  字下げの行\n21:30";
  const it = P.parse(old);
  t.check("時刻らしい行・全角・日付つき・空行・長文があっても一件（頭）のまま", it.length === 1 && it[0].mark === null
    && it[0].text === old.replace(/^\s+|\s+$/g, ""), JSON.stringify(it.map((x) => x.mark)));
  t.check("印の無い時刻の行は時刻の行として読まない", P.markOf("08:30") === null && P.markOf("10/12 08:52") === null
    && P.markOf(`08:30${W}`).at === "08:30" && P.markOf(`０８：３０${W}  `).at === "08:30");
  t.check("行のなかの印は時刻の行にしない", P.markOf(`08:30${W}あと`) === null && P.markOf(`${W}08:30`) === null);
  const r = P.add(old, "新しい一件", P.mark(new Date(2026, 9, 13, 9, 5), "2026-10-13"));
  t.check("前からの本文に足しても、前の字は一字も変わらない", r.memo.startsWith(old.replace(/\s+$/, "")), "");
  const two = P.parse(r.memo);
  t.check("足した一件だけが分かれる", two.length === 2 && two[1].at === "09:05" && two[1].text === "新しい一件");
  t.check("足した一件を外すと前の本文に戻る（終わりの空白だけ落ちる）",
    P.take(r.memo, P.chunkAt(two[1]), P.chunkOf(r.memo, two[1])) === old.replace(/\s+$/, ""));
  t.check("JSON を通っても印は残る", P.parse(JSON.parse(JSON.stringify(r.memo))).length === 2);
}

(async () => {
  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(AT); },
  });
  await page.evaluate((a) => KN.store.setAsks(a), ASKS);   // 問いの元は端末の記録にだけある
  const day = await page.evaluate(() => KN.util.todayKey());
  const memo = () => page.evaluate((d) => (KN.store.dayLog(d) || {}).memo || "", day);
  const setMemo = (m) => page.evaluate(([d, v]) => KN.store.setDayLog(d, { memo: v }), [day, m]);
  const sheetOpen = () => page.waitForSelector(".sheet.is-open.is-card .js-memo", { timeout: 4000 });
  const closeSheet = async () => {
    await page.click(".sheet.is-open .js-ok");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 }).catch(() => {});
    /* 閉じかけの紙は片づくまで押すものを受け止める（重いときは 150ms では残っていた）。 */
    await page.waitForFunction(() => !document.querySelector("#sheet-root .sheet"), null, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(150);
  };
  const posts = () => page.evaluate(() => [...document.querySelectorAll("#screen-archive .arc-log-row.is-chat .arc-post")]
    .map((p) => ({ at: (p.querySelector(".arc-post-at") || {}).textContent || null, text: p.querySelector(".arc-post-text").textContent })));

  await page.evaluate(() => KN.app.showScreen("archive"));
  await page.waitForTimeout(500);

  /* ---- 冒頭：書く口と問いの札。空の日の一行は前のまま ---- */
  /* 札の絵は読み終わるまで待つ（混んだ機械では 500ms で読み終わらず揺れた。2026年10月31日、-j 6）。 */
  await page.waitForFunction(() => { const h = document.querySelector("#screen-archive .think-home");
    return !h || [...h.querySelectorAll("img")].every((im) => im.complete); }, null, { timeout: 8000 }).catch(() => {});
  const home = await page.evaluate(() => {
    const root = document.getElementById("screen-archive");
    const h = root.querySelector(".think-home");
    const slide = root.querySelector(".day-slide");
    const blank = root.querySelector(".arc-log-row.is-today .arc-log-memo");
    return { home: !!h, first: !!(h && slide && slide.firstElementChild === h), write: h ? h.querySelector(".js-think-write").textContent.trim() : "",
      ask: !!(h && h.querySelector(".js-think-ask")), blank: blank ? blank.textContent.trim() : null,
      cards: h ? [...h.querySelectorAll(".think-card-t")].map((x) => x.textContent.trim()) : [],
      cardIcons: h ? h.querySelectorAll(".think-card svg").length : -1,
      q: h ? (h.querySelector(".js-think-q") || {}).textContent : "",
      arts: h ? [...h.querySelectorAll("img")].map((im) => im.complete && im.naturalWidth > 0) : [],
      emoji: /\p{Extended_Pictographic}/u.test(root.innerText) };
  });
  t.check("daily の冒頭に三枚の札（日記に書く・ノートを書く・問い一覧）", home.home && home.first
    && home.write === "日記に書く" && home.cards.join("|") === "日記に書く|ノートを書く|問い一覧", JSON.stringify(home));
  t.check("札に「＞」は付けない", home.cardIcons === 0, String(home.cardIcons));
  t.check("問いの札がある", home.ask);
  t.check("今日の問いがあり、絵が読めた", /[？。]$/.test(home.q || "") && home.arts.length === 4 && home.arts.every(Boolean), JSON.stringify(home));
  t.check("空の日の一行は「この日のことを書く」のまま", home.blank === "この日のことを書く", String(home.blank));
  t.check("絵文字なし", !home.emoji);

  /* ---- 書く口：種類を選ばずに書く紙。打った先から残る ---- */
  /* ---- 今日の問い：「別の問い」で替わる。この問いから考える＝答える紙（問いは欄の外）。打つまで書かない ---- */
  {
    const q0 = await page.textContent("#screen-archive .js-think-q");
    await page.click("#screen-archive .js-think-other");
    const q1 = await page.textContent("#screen-archive .js-think-q");
    t.check("別の問いで替わる", q0 && q1 && q0 !== q1, `${q0} → ${q1}`);
    const before0 = await memo();
    await page.waitForFunction(() => KN.notes && KN.notes.state() === "on", null, { timeout: 5000 });
    const notes0 = await page.evaluate(() => KN.notes.list().length);
    await page.click("#screen-archive .js-think-today");
    await page.waitForSelector(".sheet.is-open .ask-sheet-q", { timeout: 4000 });
    const v = await page.evaluate(() => { const s = document.querySelector(".sheet.is-open"), a = s.querySelector(".js-a");
      return { q: s.querySelector(".ask-sheet-q").textContent.trim(), v: a.value, focus: document.activeElement === a }; });
    t.check("答える紙：問いは欄の外・欄は空・カーソルは欄", v.q === q1 && v.v === "" && v.focus, JSON.stringify(v));
    await closeSheet();
    t.check("打たずに閉じれば書かない", (await memo()) === before0
      && (await page.evaluate(() => KN.notes.list().length)) === notes0);
  }

  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  const s1 = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    return { focused: document.activeElement === s.querySelector(".js-good"), pick: !!s.querySelector(".js-pick, .arc-pick-b"),
      ok: s.querySelector(".js-ok").textContent.trim(), title: s.querySelector(".sheet-title").textContent.trim(),
      ph: s.querySelector(".js-memo").placeholder };
  });
  t.check("書く紙はよかったことの欄にカーソル・種類の札なし", s1.focused && !s1.pick, JSON.stringify(s1));
  t.check("ボタンは「保存する」・空の欄に短い案内・題はその日", s1.ok === "保存する" && !!s1.ph && /10月6日/.test(s1.title), JSON.stringify(s1));
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.insertText("一件目の字");
  await page.waitForTimeout(800);
  const m1 = await memo();
  const said = () => page.evaluate(() => [...document.querySelectorAll(".toast-msg")].map((x) => x.textContent).join("|"));
  t.check("打った先から残る（頭に日付の行・時刻の行）", /^2026\.10\.06（火）\n/.test(m1) && m1.endsWith(tag("\n\n12:34\n一件目の字")), JSON.stringify(m1));
  await closeSheet();
  t.check("新しい一件を閉じたら「保存しました」", /保存しました/.test(await said()), await said());
  const p1 = await posts();
  t.check("一件が時刻つきで出る", p1.length === 2 && p1[1].at === "12:34" && p1[1].text === "一件目の字" && p1[0].at === null, JSON.stringify(p1));

  /* ---- ＋も同じ書く紙。二件目 ---- */
  await page.evaluate(() => document.querySelector('#dock button[aria-label="書く"]').click());
  await sheetOpen();
  const plus = await page.evaluate(() => !!document.querySelector(".sheet.is-open .arc-pick-b") || /記録を書く/.test(document.querySelector(".sheet.is-open").textContent));
  t.check("＋で記録の紙（種類の札）は出ない", !plus);
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.insertText("二件目の字");
  await closeSheet();
  const m2 = await memo();
  t.check("二件目は終わりに", m2.endsWith(tag("\n\n12:34\n一件目の字\n\n12:34\n二件目の字")), JSON.stringify(m2));

  /* ---- 一件を直す：時刻の行もほかの一件も変わらない ---- */
  /* カーソルは開いた瞬間に見る。紙の作り（ui.js）は指の無い端末でだけ 320ms 後に最初の欄へカーソルを置くので、
     混んだ機械で測るのが遅れると、そちらを拾って揺れた（2026年10月31日、-j 6）。 */
  await page.evaluate(() => {
    window.__openFocus = null;
    const mo = new MutationObserver(() => {
      const m = document.querySelector("#sheet-root .sheet.is-card .js-memo");
      if (!m) return;
      window.__openFocus = document.activeElement === m;
      mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
  await page.click("#screen-archive .arc-post:nth-child(2) .js-post-edit");
  await sheetOpen();
  const s2 = await page.evaluate(() => {
    const s = document.querySelector(".sheet.is-open");
    return { v: s.querySelector(".js-memo").value, title: s.querySelector(".sheet-title").textContent.trim(),
      ok: s.querySelector(".js-ok").textContent.trim(), focused: window.__openFocus !== false };
  });
  t.check("その一件の字で開く（題に時刻・キーボードは出さない）", s2.v === "一件目の字" && /12:34/.test(s2.title) && s2.ok === "閉じる" && !s2.focused, JSON.stringify(s2));
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.press("End");
  await page.keyboard.insertText("を直した");
  await closeSheet();
  t.check("直して閉じたら「更新しました」", /更新しました/.test(await said()), await said());
  const m3 = await memo();
  t.check("直したのはその一件だけ", m3 === m2.replace(tag("12:34\n一件目の字"), tag("12:34\n一件目の字を直した")), JSON.stringify(m3));

  /* ---- 開いて閉じただけでは形を変えない（空行の多い一件） ---- */
  const odd = tag("前からの地の文。\n\n\n12:00\n\n空行のある一件\n\n\n13:00\nもう一件");
  await setMemo(odd);
  await page.waitForTimeout(300);
  await page.click("#screen-archive .arc-post:nth-child(2) .js-post-edit");
  await sheetOpen();
  await closeSheet();
  t.check("開いて閉じただけなら一字も変わらない", (await memo()) === odd, JSON.stringify(await memo()));

  /* ---- 空にして閉じると外れる → 元に戻す ---- */
  await page.click("#screen-archive .arc-post:nth-child(2) .js-post-edit");
  await sheetOpen();
  await page.fill(".sheet.is-open .js-memo", "");
  await page.dispatchEvent(".sheet.is-open .js-memo", "input");
  await closeSheet();
  const m4 = await memo();
  t.check("空にすると、その一件だけ外れる", m4 === tag("前からの地の文。\n\n13:00\nもう一件"), JSON.stringify(m4));
  const undo = await page.evaluate(() => { const b = [...document.querySelectorAll(".toast-action")].find((x) => x.textContent === "元に戻す"); if (b) b.click(); return !!b; });
  await page.waitForTimeout(200);
  t.check("元に戻すで戻る", undo && (await memo()) === odd, JSON.stringify(await memo()));

  /* ---- 「消す」（⋯） ---- */
  await page.click("#screen-archive .arc-post:nth-child(3) .js-post-edit");
  await sheetOpen();
  await page.click(".sheet.is-open .js-menu");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "消す" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(150);
  t.check("⋯ の「消す」で外れる", (await memo()) === tag("前からの地の文。\n\n\n12:00\n\n空行のある一件"), JSON.stringify(await memo()));

  /* ---- コピーは前のまま（本文はそのまま、済んだやること） ---- */
  await setMemo(tag("2026.10.06（火）\n\n08:00\n朝の一件\n\n12:34\n昼の一件"));
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
    && copied.startsWith(tag("2026.10.06（火）\n\n08:00\n朝の一件\n\n12:34\n昼の一件\n\n"))
    && /完了したこと（この日にやり終えたもの）\n・試験のやること/.test(copied), JSON.stringify(copied));

  /* ---- ノートへ移す：新しいノート ---- */
  await page.waitForFunction(() => KN.notes && KN.notes.state() === "on", null, { timeout: 5000 });
  await page.click("#screen-archive .arc-post:nth-child(2) .js-post-edit");
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
  t.check("日記からは外れる", moved.memo === tag("2026.10.06（火）\n\n12:34\n昼の一件"), JSON.stringify(moved.memo));
  const idb = await page.evaluate((id) => new Promise((res) => {
    const r = indexedDB.open("kaimono-note-notes");
    r.onsuccess = () => { const g = r.result.transaction("notes").objectStore("notes").get(id); g.onsuccess = () => res(g.result ? g.result.body : null); };
    r.onerror = () => res(null);
  }), moved.id);
  t.check("ノートは入れ物に書けている", idb === "朝の一件", String(idb));
  await page.evaluate(() => { const b = [...document.querySelectorAll(".toast-action")].find((x) => x.textContent === "元に戻す"); if (b) b.click(); });
  await page.waitForTimeout(300);
  const back = await page.evaluate(([d, id]) => ({ memo: (KN.store.dayLog(d) || {}).memo, note: !!KN.notes.get(id) }), [day, moved.id]);
  t.check("元に戻すで、日記に戻りノートは消える", back.memo === tag("2026.10.06（火）\n\n08:00\n朝の一件\n\n12:34\n昼の一件") && !back.note, JSON.stringify(back));

  /* ---- ノートへ移す：前からのノートの終わりへ ---- */
  const nid = await page.evaluate(() => {
    const n = KN.notes.draft();
    n.title = "試験のノート"; n.body = "前からの本文";
    KN.notes.put(n);
    return n.id;
  });
  await page.evaluate(() => KN.notes.flush());
  await page.click("#screen-archive .arc-post:nth-child(3) .js-post-edit");
  await sheetOpen();
  await page.click(".sheet.is-open .js-menu");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "ノートへ移す" }).click();
  await page.waitForSelector(`.sheet.is-open .note-ver[data-id="${nid}"]`, { timeout: 4000 });
  await page.click(`.sheet.is-open .note-ver[data-id="${nid}"]`);
  await page.waitForFunction(() => [...document.querySelectorAll(".toast-msg")].some((x) => x.textContent === "ノートへ移しました"), null, { timeout: 4000 }).catch(() => {});
  const app = await page.evaluate(([d, id]) => ({ body: KN.notes.get(id).body, memo: (KN.store.dayLog(d) || {}).memo }), [day, nid]);
  t.check("前からのノートの終わりに日付と時刻の行と字", app.body === "前からの本文\n\n10月6日(火) 12:34\n昼の一件", JSON.stringify(app.body));
  t.check("日記からは外れる（頭と一件目は残る）", app.memo === tag("2026.10.06（火）\n\n08:00\n朝の一件"), JSON.stringify(app.memo));

  /* ---- 起床・就寝の行・「一枚で開く」は一枚の紙へ（時刻の欄と本文ぜんぶ） ---- */
  const base = await memo();
  await page.click("#screen-archive .arc-log-row.is-chat .js-times");
  await sheetOpen();
  const viaTimes = await page.evaluate(() => ({ t: document.querySelector(".sheet.is-open .sheet-title").textContent,
    wake: !!document.querySelector(".sheet.is-open .js-wake"), v: document.querySelector(".sheet.is-open .js-memo").value }));
  t.check("起床・就寝の行を押すと一枚の紙（時刻の欄・本文ぜんぶ）", / の log/.test(viaTimes.t) && viaTimes.wake && viaTimes.v === base, JSON.stringify(viaTimes));
  await closeSheet();
  await page.click("#screen-archive .arc-post:nth-child(2) .js-post-edit");
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
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.insertText("すぐ消す一件");
  await page.waitForTimeout(800);
  const withNew = await memo();
  await page.click(".sheet.is-open .js-menu");
  await page.locator(".note-pop.is-open .note-pop-item", { hasText: "消す" }).click();
  await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(150);
  t.check("書いたばかりの一件を消す", withNew.endsWith(tag("\n\n12:34\nすぐ消す一件")) && (await memo()) === base, JSON.stringify(await memo()));
  await page.evaluate(() => { const b = [...document.querySelectorAll(".toast-action")].find((x) => x.textContent === "元に戻す"); if (b) b.click(); });
  await page.waitForTimeout(200);
  t.check("…元に戻せる", (await memo()) === withNew, JSON.stringify(await memo()));
  await setMemo(base);
  await page.waitForTimeout(200);

  /* ---- 吹き出し：長い一件は頭と終わりの三行ずつで畳み、押すと伸び縮み。直す・コピーは左の余白のボタン ---- */
  const long = "長い一件の字です。".repeat(80);
  await setMemo(tag(`2026.10.06（火）\n\n08:00\n短い一件\n\n12:34\n${long}`));
  await page.waitForTimeout(400);
  const fold = await page.evaluate(() => [...document.querySelectorAll("#screen-archive .arc-log-row.is-chat .arc-post")].map((p) => {
    const tx = p.querySelector(".arc-post-text"), mo = p.querySelector(".arc-post-more");
    return { folded: p.classList.contains("is-folded"), more: !!mo && getComputedStyle(mo).display !== "none",
      clamp: tx.scrollHeight > tx.clientHeight + 1, lines: Math.round(tx.clientHeight / parseFloat(getComputedStyle(tx).lineHeight)),
      tail: (() => { const tl = p.querySelector(".arc-post-tail"); if (getComputedStyle(tl).display === "none") return 0;
        const r = tl.getBoundingClientRect(), mr = mo.getBoundingClientRect();
        const rg = document.createRange(), tn = tl.firstChild; rg.setStart(tn, tn.length - 1); rg.setEnd(tn, tn.length);
        const lr = rg.getBoundingClientRect();
        return mr.bottom <= r.top + 1 && tx.scrollHeight > tl.clientHeight * 2 && lr.bottom <= r.bottom + 1 && lr.top >= r.top - 1 ? Math.round(tl.clientHeight / parseFloat(getComputedStyle(tl).lineHeight)) : -1; })(),
      bg: getComputedStyle(p.querySelector(".arc-post-body")).backgroundColor };
  }));
  t.check("短い一件に「全文を読む」は出ない", fold.length === 3 && !fold[1].more, JSON.stringify(fold));
  t.check("長い一件は畳まれ「全文を読む」", fold[2] && fold[2].folded && fold[2].clamp && fold[2].more, JSON.stringify(fold[2]));
  t.check("畳むと頭の三行・ボタン・終わりの三行", fold[2] && fold[2].lines === 3 && fold[2].tail === 3 && fold[1].tail === 0, JSON.stringify(fold));
  t.check("吹き出しの地は透ける", /rgba?\(.*,\s*0?\.\d+\)$|color\(.*\/\s*0?\.\d+\)$/.test(fold[2].bg), fold[2].bg);
  await page.click("#screen-archive .arc-post:nth-child(3) .arc-post-more");
  await page.waitForTimeout(200);
  const opened = await page.evaluate(() => {
    const p = document.querySelector("#screen-archive .arc-post:nth-child(3)"), tx = p.querySelector(".arc-post-text");
    return { sheet: !!document.querySelector(".sheet.is-open"), folded: p.classList.contains("is-folded"), full: tx.scrollHeight <= tx.clientHeight + 1 };
  });
  t.check("「全文を読む」はその場で開く（書く紙は開かない）", !opened.sheet && !opened.folded && opened.full, JSON.stringify(opened));
  await page.evaluate((d) => KN.store.setDayLog(d, { wake: "06:10" }), day);
  await page.waitForTimeout(300);
  t.check("組み直しても開いたまま", await page.evaluate(() => !document.querySelector("#screen-archive .arc-post:nth-child(3)").classList.contains("is-folded")));
  const tapState = () => page.evaluate(() => ({ sheet: !!document.querySelector(".sheet.is-open"),
    folded: [...document.querySelectorAll("#screen-archive .arc-log-row.is-chat .arc-post")].map((p) => p.classList.contains("is-folded")) }));
  await page.click("#screen-archive .arc-post:nth-child(3) .arc-post-text");
  await page.waitForTimeout(200);
  const tap1 = await tapState();
  t.check("長い吹き出しを押すと縮む（書く紙は開かない）", !tap1.sheet && tap1.folded[2] === true, JSON.stringify(tap1));
  await page.click("#screen-archive .arc-post:nth-child(3) .arc-post-text");
  await page.waitForTimeout(200);
  const tap2 = await tapState();
  t.check("もう一度押すと伸びる", !tap2.sheet && tap2.folded[2] === false, JSON.stringify(tap2));
  await page.click("#screen-archive .arc-post:nth-child(2) .arc-post-text");
  await page.waitForTimeout(200);
  const tap3 = await tapState();
  t.check("短い吹き出しは押しても何も起きない", !tap3.sheet && tap3.folded[1] === false, JSON.stringify(tap3));
  const acts = await page.evaluate(() => {
    const ps = [...document.querySelectorAll("#screen-archive .arc-log-row.is-chat .arc-post")];
    const posts = document.querySelector("#screen-archive .arc-log-row.is-chat .arc-posts").getBoundingClientRect();
    const day = document.querySelector("#screen-archive .arc-log-row.is-chat .arc-log-day").getBoundingClientRect();
    return ps.map((p) => {
      const a = p.querySelector(".arc-post-acts"), b = p.querySelector(".arc-post-body").getBoundingClientRect();
      const r = a && a.getBoundingClientRect();
      return { has: !!a, wide: Math.abs(b.width - posts.width) < 1, gutter: !r || (r.right <= b.left && r.left >= day.left - 1 && r.top >= day.bottom - 1) };
    });
  });
  t.check("日付と育休の行だけの頭には、直す・コピーのボタンが無い", !acts[0].has && acts[1].has && acts[2].has, JSON.stringify(acts));
  t.check("ボタンは左の余白に（吹き出しの幅は変えない・日付の字の下）", acts.every((a) => a.wide && a.gutter), JSON.stringify(acts));
  const one = await page.evaluate(async () => {
    let got = null;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (s) => { got = s; return Promise.resolve(); } } });
    document.querySelector("#screen-archive .arc-post:nth-child(2) .js-post-copy").click();
    await new Promise((r) => setTimeout(r, 200));
    return got;
  });
  t.check("コピーはその一件の字だけ", one === "短い一件", JSON.stringify(one));

  /* ---- 前からの本文・取り込んだ本文は分けない ---- */
  const imported = "2025.03.02（日）\n\n08:30\n起きた。\n\n\n１２：００\n昼。\n\n10/12 08:52\n前の版の一件\n" + "長い段落".repeat(60);
  await setMemo(imported);
  await page.waitForTimeout(300);
  const ip = await posts();
  t.check("印の無い時刻の行は分けず、時刻なしの吹き出し一つ", ip.length === 1 && ip[0].at === null && ip[0].text === imported, JSON.stringify(ip.map((x) => x.at)));
  await page.click("#screen-archive .arc-post:nth-child(1) .js-post-edit");
  await sheetOpen();
  await closeSheet();
  t.check("開いて閉じても一字も変わらない", (await memo()) === imported);
  await page.click("#screen-archive .js-think-write");
  await sheetOpen();
  await page.focus(".sheet.is-open .js-memo");
  await page.keyboard.insertText("取り込んだ日に足す");
  await closeSheet();
  const im2 = await memo();
  t.check("足しても前の字はそのまま・足した一件だけ分かれる", im2 === `${imported}\n\n${tag("12:34")}\n取り込んだ日に足す`
    && (await posts()).length === 2, JSON.stringify(im2.slice(-40)));

  /* ---- 印は写し（diary-idb）と書き出し→取り込みに乗る ---- */
  const inBox = await page.waitForFunction(([d, m]) => KN.diaryIdb.delivered(d, m), [day, im2], { timeout: 6000 }).then(() => true, () => false);
  t.check("写しに印ごと届く", inBox);
  const round = await page.evaluate(([d, m]) => {
    const j = KN.store.exportJSON();
    KN.store.setDayLog(d, { memo: "上書き" });
    KN.store.importJSON(j);
    const got = (KN.store.dayLog(d) || {}).memo;
    return { same: got === m, n: KN.diaryPosts.parse(got).length };
  }, [day, im2]);
  t.check("書き出し→取り込みで本文は同じ（印も）・一件のまま", round.same && round.n === 2, JSON.stringify(round));
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
  t.check("一枚：冒頭の口は出さず、本文は一枚のまま（時刻の行も字のまま）", !pg.home && !pg.chat && pg.memo === tag("2026.10.06（火）\n\n08:00\n朝の一件"), JSON.stringify(pg));
  await page.evaluate(() => document.querySelector('#dock button[aria-label="書く"]').click());
  await sheetOpen();
  const pgSheet = await page.evaluate(() => ({ v: document.querySelector(".sheet.is-open .js-memo").value, t: document.querySelector(".sheet.is-open .sheet-title").textContent }));
  t.check("一枚：＋はその日の日記の紙（本文ぜんぶ）", pgSheet.v === tag("2026.10.06（火）\n\n08:00\n朝の一件") && / の log/.test(pgSheet.t), JSON.stringify(pgSheet));
  await closeSheet();
  t.check("一枚の紙を開いて閉じても本文は同じ", (await memo()) === tag("2026.10.06（火）\n\n08:00\n朝の一件"));

  /* ---- 設定の行 ---- */
  await page.evaluate(() => KN.store.update((s) => { delete s.settings.diaryView; }));
  const row = await page.evaluate(() => {
    const box = document.createElement("div");
    KN.settingsParts.dailyViewRows().filter(Boolean).forEach((r) => box.append(r));
    return box.textContent.replace(/\s+/g, " ");
  });
  t.check("設定がなければ時刻ごと（設定の行にも）", /日記\s*時刻ごと/.test(row), row.slice(0, 80));
  await page.waitForTimeout(400);
  const backChat = await posts();
  t.check("一枚から時刻ごとへ戻すと吹き出しに・本文は同じ", backChat.length === 2 && backChat[1].at === "08:00"
    && (await memo()) === tag("2026.10.06（火）\n\n08:00\n朝の一件"), JSON.stringify(backChat));

  /* ---- 積み上げはやめた：記録の紙を開く口は無い ---- */
  const gone = await page.evaluate(() => ({ open: typeof KN.screens.archive.openEntry, seed: typeof KN.screens.archive.seedFromNote }));
  t.check("記録の紙を開く口は無い", gone.open === "undefined" && gone.seed === "undefined", JSON.stringify(gone));

  /* ---- 今日の問い：読み込み直すと、出た問いを避けて替わる ---- */
  {
    await page.evaluate(() => KN.app.showScreen("archive"));
    await page.waitForSelector("#screen-archive .js-think-q", { timeout: 5000 });
    const before = await page.textContent("#screen-archive .js-think-q");
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => (KN.store.get().settings.askSeen || []).slice());
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.app, null, { timeout: 5000 });
    await page.evaluate(() => KN.app.showScreen("archive"));
    await page.waitForSelector("#screen-archive .js-think-q", { timeout: 5000 });
    const after = await page.textContent("#screen-archive .js-think-q");
    t.check("読み込み直すと今日の問いが替わる（出た問いは避ける）", before && after && before !== after
      && seen.length >= 2 && !seen.includes(after.normalize("NFKC").replace(/\s+/g, "").replace(/\?+$/, "")), JSON.stringify([before, after, seen.length]));
  }

  t.check("ページのエラーなし", errors.length === 0, errors.join(" | "));
  await browser.close();
  t.done();
})();
