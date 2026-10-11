/* ノート（五つめの席）の段1「書けて、残る」。決めごとは docs/notes.md。

   書く→読み直しても残る／題なしでも残る／閉じずに残る（打ち終わりの少しあと）／
   隠れる瞬間に書き切る／★／消す→最近削除→戻す（30日で消える）／空のまま閉じた
   新しいノートは残らない／書き出しに noteBook が入る／importJSON は noteBook を
   記録に入れない／ノートを書いても localStorage の大きさが変わらない／
   五つめの席（帯・暦なし・題 Notes・設定は notes の見出しだけ・暦の出入りは横の流れと同じ一拍）／
   ほかのタブへ移って戻る／#notes で起動するとノート。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes.js */
const fs = require("fs");
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes");
  const { browser, ctx, page, errors } = await open();

  const active = () => page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  /* 紙が滑り終わった（前の印が外れた）まで待ちます。 */
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  const tab = (id) => page.click(`.tab[data-tab="${id}"]`);
  const label = () => page.$eval('.tab[data-tab="archive"] .tab-label', (e) => e.textContent);
  const parked = () => page.$eval("#screen-archive", (e) => e.classList.contains("is-face-parked"));
  const toNotes = async () => {
    if ((await active()) === "notes") return;
    await tab("notes");
    await settled("notes");
  };
  const sheetOpen = () => page.$(".sheet.is-note.is-open");
  const closeSheet = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-note.is-open"), null, { timeout: 3000 });
  };
  const plus = async () => {
    await page.click("#dock .add-fab");
    await page.waitForSelector(".sheet.is-note.is-open");
  };
  /* 読み直す前に、入れ物を一度読みます。閉じた拍に始まった書き込みは、
     読みの前に終わる（IndexedDB は先に始まった書き込みのあとに読みを並べる）。
     待たずに読み直すと、書き込みの途中でページが捨てられる（tests/README.md の
     「試験の罠」）。人が開き直すまでの間の代わり。 */
  const reload = async () => {
    await idb();
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.notes);
    await page.waitForTimeout(300);
    await page.evaluate(() => KN.notes.ready());
  };
  const notes = () => page.evaluate(() => KN.notes.list().map((n) => ({ id: n.id, title: n.title, body: n.body, fav: n.fav, updatedAt: n.updatedAt })));
  /* 入れ物そのものを読みます（記憶ではなく）。同じ版で開くので、アプリ側の
     つなぎとは取り合いません。 */
  const idb = () => page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open("kaimono-note-notes", 1);
    r.onsuccess = () => {
      const d = r.result;
      const tx = d.transaction(["notes"], "readonly");
      const q = tx.objectStore("notes").getAll();
      tx.oncomplete = () => { d.close(); res(q.result); };
      tx.onerror = () => { d.close(); rej(tx.error); };
    };
    r.onerror = () => rej(r.error);
  }));
  const lsSize = () => page.evaluate(() => {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      n += k.length + (localStorage.getItem(k) || "").length;
    }
    return n;
  });

  /* ---- 五つめの席（2026年10月11日まで daily の裏） ---- */
  t.check("帯は daily / notes / tasks / shopping / health の五席",
    (await page.$$eval("#tabbar .tab", (bs) => bs.map((b) => b.dataset.tab + ":" + b.querySelector(".tab-label").textContent).join(",")))
      === "archive:daily,notes:notes,todo:tasks,list:shopping,diet:health");
  await page.evaluate(() => KN.app.showScreen("archive"));
  await settled("archive");
  await tab("notes");
  await settled("notes");
  t.check("notes の席を押すとノートが出る（daily の紙は留まらない）", (await active()) === "notes" && !(await parked()));
  t.check("daily の席は daily のまま", (await label()) === "daily", await label());
  t.check("ノートの＋が出ている", !!(await page.$("#dock .add-fab")));
  /* 二週間の絵は既定で畳んである（3.1 の S4）。ノートで消えるのを見るために出す。 */
  await page.evaluate(() => KN.store.update((s) => { s.settings.showUpcoming = true; }));
  const headLook = () => page.evaluate(() => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).opacity !== "0";
    const top = document.querySelector(".topbar").getBoundingClientRect().bottom;
    const cal = document.querySelector("#head .head-cal");
    return {
      gap: document.getElementById("panes").getBoundingClientRect().top - top,
      cal: vis(cal) && cal.getBoundingClientRect().height > 0,
      name: vis(document.querySelector(".head-name")),
      date: vis(document.querySelector(".topbar-day")),
      upcoming: vis(document.querySelector(".js-upcoming")),
      search: vis(document.querySelector("#head .js-search-btn")),
      gear: vis(document.querySelector("#head .js-settings")),
    };
  });
  const calGone = () => page.waitForFunction(() => !document.querySelector(".is-cal-out, .is-cal-in"), null, { timeout: 3000 });
  await calGone();
  const inNotes = await headLook();
  t.check("ノートに暦は無く、中身が帯のすぐ下から", !inNotes.cal && Math.abs(inNotes.gap) <= 2, JSON.stringify(inNotes));
  t.check("ノートの帯は題 Notes・さがす・設定だけ",
    inNotes.name && !inNotes.date && !inNotes.upcoming && inNotes.search && inNotes.gear, JSON.stringify(inNotes));
  await page.click("#head .js-settings");
  await settled("settings");
  await page.waitForTimeout(700);
  t.check("ノートの設定は notes の見出しだけ（daily の行は出ない）", await page.evaluate(() => {
    const t = document.getElementById("screen-settings").innerText;
    return /notes/.test(t) && /並び/.test(t) && /ロック/.test(t) && !/「あの日」を出す/.test(t);
  }));
  await page.evaluate(() => KN.app.backScreen());
  await settled("notes");
  await page.waitForTimeout(700);
  const fromSet = await headLook();
  t.check("設定から戻っても、暦は無く題は Notes", (await active()) === "notes" && !fromSet.cal && fromSet.name && !fromSet.date
    && Math.abs(fromSet.gap) <= 2, JSON.stringify(fromSet));

  /* 暦の出入りは横の流れと同じ一拍で（毎フレーム並べ直さない。js/head.js の moveCal） */
  await tab("todo");
  const moving = await page.evaluate(() => ({
    cal: document.querySelector("#head .head-cal").className,
    panes: document.getElementById("panes").className,
    slide: document.querySelector("#screen-todo").classList.contains("is-in-r"),
    names: document.getAnimations().map((a) => a.animationName).filter(Boolean),
  }));
  t.check("ノート → やること：暦は入ってくる・画面は流れる・同じ一拍",
    /is-cal-in/.test(moving.cal) && /is-cal-in/.test(moving.panes) && moving.slide
    && moving.names.includes("cal-in") && moving.names.includes("panes-drop") && moving.names.includes("scr-in-r"), JSON.stringify(moving));
  await settled("todo");
  await calGone();
  const back = await headLook();
  t.check("やることへ移ると暦・日付が戻る", back.cal && back.date && !back.name, JSON.stringify(back));
  await tab("notes");
  const leaving = await page.evaluate(() => {
    const c = document.querySelector("#head .head-cal");
    return { cls: c.className, kids: c.childElementCount, pos: getComputedStyle(c).position,
      names: document.getAnimations().map((a) => a.animationName).filter(Boolean) };
  });
  t.check("やること → ノート：暦は流れの外で上へしまわれる",
    /is-cal-out/.test(leaving.cls) && leaving.kids === 1 && leaving.pos === "absolute"
    && leaving.names.includes("cal-out") && leaving.names.includes("panes-rise") && leaving.names.includes("scr-in-l"), JSON.stringify(leaving));
  await settled("notes");
  await calGone();
  t.check("しまい終えた暦は外れる", await page.evaluate(() => !document.querySelector("#head .head-cal").childElementCount));
  /* 途中で戻っても、暦は一枚・行き着いた先は元どおり */
  await tab("todo");
  await page.waitForTimeout(60);
  await tab("notes");
  await page.waitForTimeout(60);
  await tab("todo");
  await settled("todo");
  await calGone();
  const again = await headLook();
  t.check("行き来の途中で押し直しても、暦は一枚で帯のすぐ下", again.cal && await page.evaluate(() =>
    document.querySelectorAll("#head .head-cal > .cal").length === 1
    && Math.abs(document.getElementById("panes").getBoundingClientRect().top - document.querySelector("#head .head-cal").getBoundingClientRect().bottom) <= 1),
    JSON.stringify(again));

  /* ---- ほかのタブへ移って戻る・買うもの⇄価格の裏はそのまま ---- */
  await tab("archive");
  await settled("archive");
  t.check("daily の席を押しても daily のまま（裏へ回らない）", await (async () => {
    await tab("archive");
    await page.waitForTimeout(500);
    return (await active()) === "archive" && !(await parked());
  })());
  await tab("list");
  await settled("list");
  await tab("list");
  await settled("prices");
  t.check("買うもの⇄価格の裏はそのまま（帯で価格へ）", (await active()) === "prices"
    && await page.$eval("#screen-list", (e) => e.classList.contains("is-face-parked")));
  await tab("notes");
  await settled("notes");
  t.check("価格からノートへ移ると、買うものの紙も片づく",
    !(await page.$eval("#screen-list", (e) => e.classList.contains("is-face-parked"))));
  await page.evaluate(() => { KN.app.showScreen("todo"); history.replaceState(null, "", "#notes"); });
  await page.reload();
  await page.waitForFunction(() => window.KN && KN.app && document.querySelector(".screen.is-active"));
  await settled("notes");
  t.check("#notes で開くとノートのまま（daily へ降ろさない）", (await active()) === "notes"
    && (await page.$eval('.tab[data-tab="notes"]', (e) => e.getAttribute("aria-selected"))) === "true");

  /* ---- 書く → 読み直しても残る ---- */
  await toNotes();
  await plus();
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("note-body-in"));
  t.check("＋で開いた紙は、本文の欄にカーソルが入っている", focused);
  const body1 = "  一行目（頭の空白も残す）\n- [ ] 箇条\n# 見出し";
  await page.keyboard.insertText(body1);
  await page.click(".sheet.is-note .note-title-in");
  await page.keyboard.insertText("試験の題");
  await closeSheet();
  await reload();
  let all = await notes();
  const n1 = all.find((n) => n.title === "試験の題");
  t.check("書いて閉じたノートが、読み直しても残る", !!n1);
  t.check("本文は打ったまま（行頭の空白・印を削らない）", n1 && n1.body === body1, n1 && JSON.stringify(n1.body));

  /* ---- 題なしでも残る ---- */
  await toNotes();
  await plus();
  await page.keyboard.insertText("題なしの本文\n二行目の冒頭");
  await closeSheet();
  await reload();
  all = await notes();
  const n2 = all.find((n) => n.body === "題なしの本文\n二行目の冒頭");
  t.check("題なしでも残る", !!n2 && n2.title === "");
  await toNotes();
  const row2 = await page.$eval(`.note-row[data-id="${n2 && n2.id}"]`, (e) => ({
    t: e.querySelector(".note-t").textContent, x: (e.querySelector(".note-x") || {}).textContent }));
  t.check("題が無ければ一覧は本文の一行目を題に、冒頭はその次から", row2.t === "題なしの本文" && row2.x === "二行目の冒頭",
    JSON.stringify(row2));
  const order = await page.$$eval("#screen-notes .note-row", (rs) => rs.map((r) => r.dataset.id));
  t.check("一覧は新しく直した順", order[0] === (n2 && n2.id) && order[1] === (n1 && n1.id), order.join(","));

  /* ---- 閉じずに残る（保存を押さない・打ち終わりの少しあと） ---- */
  await plus();
  await page.keyboard.insertText("閉じずに残る");
  await page.waitForTimeout(1300);
  t.check("閉じなくても、打ち終わりの少しあとに入れ物へ書かれる",
    (await idb()).some((n) => n.body === "閉じずに残る"));
  await reload();
  t.check("閉じずに読み直しても残る", (await notes()).some((n) => n.body === "閉じずに残る"));

  /* ---- 隠れる瞬間に書き切る ---- */
  await toNotes();
  await plus();
  await page.keyboard.insertText("隠れる瞬間");
  const hid = await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    return true;
  });
  const atHide = await idb();
  await page.evaluate(() => { delete document.visibilityState; });
  t.check("隠れた拍に、待たずに書き切る（打ち終わりの待ちより前）",
    hid && atHide.some((n) => n.body === "隠れる瞬間"));
  await closeSheet();

  /* ---- 空のまま閉じた新しいノートは残らない ---- */
  const before = (await idb()).length;
  await plus();
  await closeSheet();
  await plus();
  await page.keyboard.insertText("消す字");
  await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
  await closeSheet();
  await page.waitForTimeout(400);
  const afterEmpty = await idb();
  t.check("何も書かずに閉じた新しいノートは残らない（書いて消したものも）",
    afterEmpty.length === before && (await notes()).length === before, `${before} → ${afterEmpty.length}`);

  /* ---- ★ ---- */
  const firstBefore = await notes();
  const target = firstBefore[1];
  await page.click(`.note-row[data-id="${target.id}"] .fav`);
  await page.waitForTimeout(800);
  const favState = await page.evaluate((id) => {
    const r = document.querySelector(`.note-row[data-id="${id}"] .fav`);
    return { on: r.classList.contains("is-on"), pressed: r.getAttribute("aria-pressed") };
  }, target.id);
  const afterFav = await notes();
  t.check("★を押すと付く", favState.on && favState.pressed === "true");
  t.check("★では並びも更新日も動かない",
    afterFav.map((n) => n.id).join() === firstBefore.map((n) => n.id).join()
    && afterFav[1].updatedAt === target.updatedAt);
  await reload();
  t.check("★は読み直しても残る", (await notes()).find((n) => n.id === target.id).fav === true);
  await toNotes();
  await page.click(`.note-row[data-id="${target.id}"] .fav`);
  await page.waitForTimeout(300);
  t.check("もう一度押すと外れる", (await notes()).find((n) => n.id === target.id).fav === false);

  /* ---- 消す → 最近削除した項目 → 戻す ---- */
  await page.click(`.note-row[data-id="${n1.id}"] .js-open`);
  await page.waitForSelector(".sheet.is-note.is-open");
  t.check("開いたノートにはカーソルを入れない（キーボードを出さない）",
    await page.evaluate(() => !document.activeElement || !document.activeElement.closest(".sheet")));
  await page.click(".sheet.is-note .js-note-more");
  await page.click(".note-pop-item.is-danger");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-note.is-open"), null, { timeout: 3000 });
  await page.waitForTimeout(400);
  t.check("消したノートは一覧から外れる", !(await page.$(`.note-row[data-id="${n1.id}"]`)));
  t.check("入れ物では deletedAt が付いて残る",
    (await idb()).some((n) => n.id === n1.id && n.deletedAt));
  await page.click(".js-trash");
  await page.waitForSelector(".notes-trash .js-back");
  t.check("最近削除した項目に出る", (await page.$$(".notes-trash .note-row")).length === 1);
  await page.click(".notes-trash .js-back");
  await page.waitForTimeout(500);
  t.check("戻すと一覧へ帰る", !!(await page.$(`#screen-notes .note-row[data-id="${n1.id}"]`))
    && (await idb()).some((n) => n.id === n1.id && !n.deletedAt));
  t.check("最近削除した項目が空になったら、その一行も消える", !(await page.$(".js-trash")));

  /* 30日を過ぎた最近削除は、開いたときに本当に消える。 */
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("kaimono-note-notes", 1);
    r.onsuccess = () => {
      const d = r.result;
      const tx = d.transaction(["notes"], "readwrite");
      const old = new Date(Date.now() - 31 * 864e5).toISOString();
      const mid = new Date(Date.now() - 5 * 864e5).toISOString();
      tx.objectStore("notes").put({ id: "n-old", title: "古い", body: "", notebook: "", tags: [], fav: false,
        createdAt: old, updatedAt: old, deletedAt: old });
      tx.objectStore("notes").put({ id: "n-mid", title: "新しめ", body: "", notebook: "", tags: [], fav: false,
        createdAt: mid, updatedAt: mid, deletedAt: mid });
      tx.oncomplete = () => { d.close(); res(); };
    };
  }));
  await reload();
  await page.waitForTimeout(400);
  const kept = await idb();
  t.check("30日を過ぎた最近削除は、開いたときに消える（29日以内は残る）",
    !kept.some((n) => n.id === "n-old") && kept.some((n) => n.id === "n-mid"));

  /* ---- 書き出しに noteBook が入る（「バックアップを保存」そのもの） ---- */
  await page.evaluate(() => KN.app.showScreen("settings"));
  await page.waitForTimeout(500);
  await page.click(".set-row:has-text('バックアップ')");
  await page.waitForTimeout(500);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }),
    page.click(".set-row:has-text('バックアップを保存')"),
  ]);
  const file = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  const live = await page.evaluate(() => KN.notes.list().length + KN.notes.trash().length);
  t.check("書き出しの一番上に noteBook {v:1, notes}（最近削除も含む）",
    file.noteBook && file.noteBook.v === 1 && file.noteBook.notes.length === live
    && file.noteBook.notes.some((n) => n.id === "n-mid" && n.deletedAt),
    file.noteBook ? `${file.noteBook.notes.length} / ${live}` : "noteBook が無い");
  t.check("記録の中に notes の鍵は作らない", !("notes" in file) && Array.isArray(file.todos));
  /* 確かめの「保存できましたか？」が出ていれば閉じます。 */
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);

  /* ---- importJSON は noteBook を記録（localStorage）に入れない ---- */
  const imp = await page.evaluate(() => {
    const count = KN.notes.list().length;
    const text = KN.store.exportJSON(null, KN.notes.forExport());
    KN.store.importJSON(text);
    KN.store.flush();
    const raw = localStorage.getItem("kaimono-note-v2") || "";
    return { inState: "noteBook" in KN.store.get(), inLs: raw.includes("noteBook"), hadIt: text.includes("noteBook"),
      still: KN.notes.list().length === count };
  });
  t.check("importJSON は noteBook を無視する（記録にも localStorage にも入らない）",
    imp.hadIt && !imp.inState && !imp.inLs, JSON.stringify(imp));
  t.check("importJSON だけではノートに触れない（合わせるのは復元の口。段2）", imp.still);

  /* ---- ノートを書いても localStorage の大きさは変わらない ---- */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await settled("archive");
  await toNotes();
  await plus();
  const ls0 = await lsSize();
  await page.keyboard.insertText("大きな本文。".repeat(400));
  await page.waitForTimeout(900);
  await closeSheet();
  await page.waitForTimeout(600);
  const ls1 = await lsSize();
  t.check("ノートを書いても localStorage の大きさが変わらない", ls0 === ls1, `${ls0} → ${ls1}`);

  /* ---- 探す（かな畳み） ---- */
  await page.click(".js-search-btn");
  await page.fill("#screen-notes .js-search", "ナシノ");
  await page.waitForTimeout(300);
  const found = await page.$$eval("#screen-notes .note-row", (rs) => rs.map((r) => r.querySelector(".note-t").textContent));
  t.check("虫めがねで題と本文を絞る（かたかなでも）", found.length === 1 && found[0] === "題なしの本文", found.join(","));

  /* ---- 一覧に件数・説明・絵文字を出さない ---- */
  await page.fill("#screen-notes .js-search", "");
  await page.waitForTimeout(200);
  const text = await page.$eval("#screen-notes", (e) => e.innerText);
  t.check("一覧に件数を出さない", !/\d+\s*件/.test(text));
  t.check("絵文字を出さない", !/\p{Extended_Pictographic}/u.test(text.replace(/★/g, "")));

  /* ---- 読んで戻っても、一覧の送り位置はそのまま ---- */
  await page.evaluate(() => {
    for (let i = 0; i < 30; i++) KN.notes.put({ ...KN.notes.draft(), id: `n-sc${i}`, title: `送り${i}`, body: "本文" });
    KN.screens.notes.render();
  });
  await page.waitForTimeout(400);
  const y0 = await page.evaluate(() => {
    const sc = KN.app.scrollerOf(document.getElementById("screen-notes"));
    sc.scrollTop = 900;
    return sc.scrollTop;
  });
  const mid = await page.evaluateHandle(() => [...document.querySelectorAll("#screen-notes .note-row .js-open")]
    .find((b) => { const r = b.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 150; }));
  await mid.click();
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.waitForTimeout(500);
  await closeSheet();
  await page.waitForTimeout(600);
  const y1 = await page.evaluate(() => KN.app.scrollerOf(document.getElementById("screen-notes")).scrollTop);
  t.check("読んで戻っても、一覧は頭へ飛ばない", y0 > 300 && Math.abs(y1 - y0) <= 2, `${y0} → ${y1}`);

  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
