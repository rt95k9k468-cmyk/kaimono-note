/* ノートの段3「ノートブック・タグ・絞り込み・ぜんぶをさがす」。決めごとは docs/notes.md。

   一覧は白いカード（下の段に更新日・ノートブック・タグの色の丸）／上のチップで
   すべて・★・ノートブック・タグに絞る（一度に一つ・もう一度押すとすべて・件数なし）／
   虫めがねはタグとノートブックの名前にも当たる／書く紙の日時の下に「＋タグ」→
   選ぶ紙で新しいタグ（打って閉じても付く）・使われているタグを押して付け外し／
   「⋯」→ノートブック／付けても並びと更新日は動かない／置く前の新しいノートにも
   付けられる／読み直しても残る・書き出しに入る／localStorage が変わらない／
   ほかのタブの虫めがねから「ノート」に出て、押すと daily の裏でそのノートが開く。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/notes-labels.js */
const { open, checker } = require("./lib");

(async () => {
  const t = checker("notes-labels");
  const { browser, page, errors } = await open();

  const active = () => page.evaluate(() => document.querySelector(".screen.is-active").dataset.screen);
  const settled = (id) => page.waitForFunction((i) =>
    document.querySelector(".screen.is-active").dataset.screen === i
    && !document.querySelector(".screen.is-face-front, .screen.is-face-settle"), id, { timeout: 4000 });
  const tab = (id) => page.click(`.tab[data-tab="${id}"]`);
  const toNotes = async () => {
    if ((await active()) === "notes") return;
    if ((await active()) !== "archive") { await tab("archive"); await settled("archive"); }
    await tab("archive");
    await settled("notes");
  };
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app && KN.notes);
    await page.waitForTimeout(300);
    await page.evaluate(() => KN.notes.ready());
  };
  const lsSize = () => page.evaluate(() => {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      n += k.length + (localStorage.getItem(k) || "").length;
    }
    return n;
  });
  const titles = () => page.$$eval("#screen-notes .notes-list .note-row .note-t", (rs) => rs.map((r) => r.textContent));
  /* すべて・★は列から、ノートブック・タグの名前は札を押して出る小窓から（V20）。 */
  const pickChip = async (text, kind) => {
    if (kind) {
      await page.click(`#screen-notes .notes-chips .js-pick[data-k="${kind}"]`);
      await page.waitForSelector(".note-pop.is-pick.is-open .js-filter-pick");
      const ok = await page.evaluate((x) => {
        const b = [...document.querySelectorAll(".note-pop.is-pick.is-open .js-filter-pick")].find((c) => c.textContent.trim() === x);
        if (b) b.click();
        return !!b;
      }, text);
      // 閉じかけの小窓を次の一押しで掴まないよう、閉じきるのを待つ
      await page.waitForFunction(() => !document.querySelector(".note-pop-cover, .note-pop"), null, { timeout: 3000 });
      return ok;
    }
    return page.evaluate((x) => {
      const b = [...document.querySelectorAll("#screen-notes .notes-chips .chip")]
        .find((c) => (c.getAttribute("aria-label") || c.textContent.trim()) === x);
      if (b) b.click();
      return !!b;
    }, text);
  };
  const topSheet = () => page.evaluate(() => {
    const s = [...document.querySelectorAll(".sheet.is-open")].pop();
    return s ? (s.querySelector(".sheet-title") || {}).textContent || s.getAttribute("aria-label") || "" : null;
  });
  /* ノートブック・タグは押した口のすぐ下の小窓（段4.1）。 */
  const popOpen = () => page.waitForSelector(".note-pop.is-pick");
  const popEsc = async () => {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".note-pop-cover"), null, { timeout: 3000 });
    await page.waitForTimeout(150);
  };
  const escTop = async () => {
    const n = await page.$$eval(".sheet.is-open", (s) => s.length);
    await page.keyboard.press("Escape");
    await page.waitForFunction((k) => document.querySelectorAll(".sheet.is-open").length < k, n, { timeout: 3000 });
    await page.waitForTimeout(150);
  };

  await page.evaluate(() => KN.notes.ready());
  await toNotes();
  const ls0 = await lsSize();

  /* ---- 三つのノートを置く（入れ物の口から） ---- */
  const ids = await page.evaluate(() => {
    const mk = (title, body) => { const n = KN.notes.draft(); KN.notes.put(n); KN.notes.edit(n.id, { title, body }); return n.id; };
    const a = mk("旅の計画", "京都で寺をまわる");
    const b = mk("買い置き", "米と味噌");
    const c = mk("読書メモ", "長い本の感想");
    return { a, b, c };
  });
  const before = await page.evaluate((i) => KN.notes.get(i.a).updatedAt, ids);
  const order0 = await page.evaluate(() => KN.notes.list().map((n) => n.id).join(","));
  await page.evaluate((i) => {
    KN.notes.setLabels(i.a, { notebook: " 旅 ", tags: ["京都", " 予定", "京都", ""] });
    KN.notes.setLabels(i.c, { tags: ["本"] });
    KN.notes.setFav(i.b, true);
  }, ids);
  await page.waitForTimeout(200);
  const a1 = await page.evaluate((i) => KN.notes.get(i.a), ids);
  t.check("名前は前後の空白を落とし、空と重なりを捨てる",
    a1.notebook === "旅" && JSON.stringify(a1.tags) === JSON.stringify(["京都", "予定"]), JSON.stringify(a1));
  t.check("付けても更新日は動かない", a1.updatedAt === before);
  t.check("付けても並びは動かない", (await page.evaluate(() => KN.notes.list().map((n) => n.id).join(","))) === order0);
  t.check("前の版を取らない", (await page.evaluate((i) => KN.notes.versions(i.a).then((v) => v.length), ids)) === 0);

  /* ---- カード ---- */
  const card = await page.$eval(`#screen-notes .note-row[data-id="${ids.a}"]`, (e) => {
    const cs = getComputedStyle(e);
    const dot = e.querySelector(".note-tag .chip-dot");
    return {
      card: e.classList.contains("is-card"),
      bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius),
      nb: (e.querySelector(".note-nb") || {}).textContent,
      tags: [...e.querySelectorAll(".note-tag")].map((x) => x.textContent.trim()),
      dot: dot ? getComputedStyle(dot).backgroundColor : "",
      left: e.getBoundingClientRect().left,
    };
  });
  t.check("一覧はカード（地と違う面・丸角・端から離れる）",
    card.card && card.bg !== "rgba(0, 0, 0, 0)" && card.radius >= 8 && card.left >= 12, JSON.stringify(card));
  t.check("カードの下にノートブックとタグ", (card.nb || "").trim() === "旅" && card.tags.join(",") === "京都,予定", JSON.stringify(card));
  t.check("タグは色の丸", /^rgb/.test(card.dot) && card.dot !== "rgba(0, 0, 0, 0)", card.dot);
  const dotSame = await page.evaluate(() => {
    const c = (x) => getComputedStyle(x).backgroundColor;
    const all = [...document.querySelectorAll("#screen-notes .note-tag")].filter((x) => x.textContent.trim() === "京都");
    return all.length ? c(all[0].querySelector(".chip-dot")) : "";
  });
  await page.click('#screen-notes .notes-chips .js-pick[data-k="tag"]');
  await page.waitForSelector(".note-pop.is-pick .js-filter-pick");
  const popDot = await page.evaluate(() => {
    const chip = [...document.querySelectorAll(".note-pop.is-pick .js-filter-pick")].find((x) => x.textContent.trim() === "京都");
    const tags = [...document.querySelectorAll(".note-pop.is-pick .js-filter-pick")].map((x) => x.textContent.trim());
    const wrap = getComputedStyle(document.querySelector(".note-pop.is-pick .chip-row")).flexWrap;
    return { dot: chip ? getComputedStyle(chip.querySelector(".chip-dot")).backgroundColor : "", tags, wrap };
  });
  await popEsc();
  t.check("同じタグはどこでも同じ色", !!dotSame && dotSame === popDot.dot, JSON.stringify([dotSame, popDot.dot]));
  t.check("絞り込みの小窓にタグが折り返して並ぶ（V20）", popDot.wrap === "wrap"
    && popDot.tags.slice().sort().join("|") === ["京都", "予定", "本"].sort().join("|"), JSON.stringify(popDot));

  /* ---- 絞り込みのチップ ---- */
  const chips = await page.$$eval("#screen-notes .notes-chips .chip", (cs) => cs.map((c) => c.getAttribute("aria-label") || c.textContent.trim()));
  /* 名前の並びは端末の照合順（漢字は読みの順ではない）なので、順番は問いません。 */
  t.check("チップは すべて・★・ノートブック・タグ の四つだけ（名前は小窓へ・V20）",
    chips.join("|") === "すべて|★|ノートブック|タグ", chips.join("|"));
  t.check("チップに数を出さない", !chips.some((c) => /\d/.test(c)));
  await pickChip("本", "tag");
  await page.waitForTimeout(100);
  t.check("タグで絞る", (await titles()).join(",") === "読書メモ", (await titles()).join(","));
  t.check("選んだチップが押されている", await page.evaluate(() =>
    [...document.querySelectorAll("#screen-notes .notes-chips .chip[aria-pressed=true]")].map((c) => c.textContent.trim()).join() === "本"));
  await pickChip("本", "tag");
  await page.waitForTimeout(100);
  t.check("もう一度押すとすべて", (await titles()).length === 3);
  await pickChip("★");
  await page.waitForTimeout(100);
  t.check("★で絞る", (await titles()).join(",") === "買い置き");
  await pickChip("旅", "nb");
  await page.waitForTimeout(100);
  t.check("ノートブックで絞る（一度に一つ）", (await titles()).join(",") === "旅の計画");
  await pickChip("すべて");
  await page.waitForTimeout(100);

  /* ---- 虫めがねはタグ・ノートブックの名前にも ---- */
  await page.click(".js-search-btn");
  await page.fill("#screen-notes .js-search", "予定");
  await page.waitForTimeout(300);
  t.check("虫めがねがタグの名前に当たる", (await titles()).join(",") === "旅の計画", (await titles()).join(","));
  await page.fill("#screen-notes .js-search", "");
  await page.waitForTimeout(250);

  /* ---- 書く紙：日時の下の「＋タグ」 ---- */
  const bUpd = await page.evaluate((i) => KN.notes.get(i.b).updatedAt, ids);
  await page.click(`#screen-notes .note-row[data-id="${ids.b}"] .js-open`);
  await page.waitForSelector(".sheet.is-note.is-open");
  /* 段4.2から、ノートブックは頭の行（‹ の隣）、タグは題の下の日時の行。 */
  const lab = await page.$eval(".sheet.is-note .note-labels", (e) => {
    const title = e.closest(".note-edit").querySelector(".note-title-in").getBoundingClientRect();
    const nb = document.querySelector(".sheet.is-note .sheet-head .js-nb").getBoundingClientRect();
    const r = e.getBoundingClientRect();
    return { below: r.top >= title.bottom - 1, nbAbove: nb.bottom <= title.top + 1, text: e.textContent.trim() };
  });
  t.check("ノートブックは頭の行、タグの口は題の下", lab.below && lab.nbAbove && lab.text === "タグ", JSON.stringify(lab));
  await page.click(".sheet.is-note .note-tag-add");
  await popOpen();
  const tp = await page.evaluate(() => {
    const p = document.querySelector(".note-pop.is-pick").getBoundingClientRect();
    const a = document.querySelector(".sheet.is-note .note-tag-add").getBoundingClientRect();
    return { sheets: document.querySelectorAll(".sheet.is-open").length, below: p.top >= a.bottom && p.top - a.bottom < 12,
      /* 右そろえ。収まらなければ画面の中へ寄せる（左へはみ出していた。2026年10月1日）。 */
      right: (Math.abs(p.right - a.right) < 2 || p.left >= 8 - 0.5) && p.left >= 0 && p.right <= document.documentElement.clientWidth, label: document.querySelector(".note-pop.is-pick").getAttribute("aria-label") };
  });
  t.check("タグは紙でなく、口のすぐ下の小窓（右そろえ・画面の中）", tp.sheets === 1 && tp.below && tp.right && tp.label === "タグ", JSON.stringify(tp));
  t.check("使われているタグが並ぶ", (await page.evaluate(() =>
    [...document.querySelectorAll(".note-pick .chip")].map((c) => c.textContent.trim()).sort().join(","))) === ["京都", "予定", "本"].sort().join(","));
  await page.fill(".note-pick .js-new", "家");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  t.check("打って改行で付く", JSON.stringify(await page.evaluate((i) => KN.notes.get(i.b).tags, ids)) === '["家"]');
  await page.evaluate(() => [...document.querySelectorAll(".note-pick .chip")].find((c) => c.textContent.trim() === "本").click());
  await page.waitForTimeout(100);
  t.check("押して付ける", JSON.stringify(await page.evaluate((i) => KN.notes.get(i.b).tags, ids)) === '["家","本"]');
  await page.evaluate(() => [...document.querySelectorAll(".note-pick .chip")].find((c) => c.textContent.trim() === "家").click());
  await page.waitForTimeout(100);
  t.check("もう一度押して外す", JSON.stringify(await page.evaluate((i) => KN.notes.get(i.b).tags, ids)) === '["本"]');
  await page.fill(".note-pick .js-new", "台所");
  await popEsc();
  t.check("打ったまま閉じても付く", JSON.stringify(await page.evaluate((i) => KN.notes.get(i.b).tags, ids)) === '["本","台所"]');
  t.check("書く紙の口にタグが出る", (await page.$$eval(".sheet.is-note .note-labels .chip", (cs) => cs.map((c) => c.textContent.trim()))).join(",") === "本,台所,");

  /* 左上のノートブック（段4で「⋯」から頭の行へ出した） */
  t.check("「⋯」にノートブックは無い", await (async () => {
    await page.click(".sheet.is-note .js-note-more");
    await page.waitForSelector(".note-pop-item");
    const has = await page.$$eval(".note-pop-item", (bs) => bs.some((b) => b.textContent.includes("ノートブック")));
    await page.click(".note-pop-cover");
    return !has;
  })());
  await page.click(".sheet.is-note .js-nb");
  await popOpen();
  await page.waitForTimeout(400);
  const np = await page.evaluate(() => {
    const p = document.querySelector(".note-pop.is-pick").getBoundingClientRect();
    const a = document.querySelector(".sheet.is-note .js-nb").getBoundingClientRect();
    return { sheets: document.querySelectorAll(".sheet.is-open").length, below: p.top >= a.bottom && p.top - a.bottom < 12,
      /* 左そろえ。ただし画面の右からはみ出すなら、右端を画面の 8px 内に（ノートの紙は左右に 8px
         空けたカードなので、口が右へ寄った。V26）。 */
      left: Math.abs(p.left - Math.min(a.left, innerWidth - 8 - p.width)) < 2, pl: p.left, al: a.left, pw: p.width, label: document.querySelector(".note-pop.is-pick").getAttribute("aria-label") };
  });
  t.check("ノートブックも口のすぐ下の小窓（左そろえ・画面の内）", np.sheets === 1 && np.below && np.left && np.label === "ノートブック", JSON.stringify(np));
  t.check("ノートブックの紙に、なし・使われている名前", (await page.evaluate(() =>
    [...document.querySelectorAll(".note-pick .chip")].map((c) => c.textContent.trim()).join(","))) === "なし,旅");
  await page.fill(".note-pick .js-new", "家のこと");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector(".note-pop-cover"));
  t.check("新しいノートブックに入る", (await page.evaluate((i) => KN.notes.get(i.b).notebook, ids)) === "家のこと");
  t.check("書く紙の口にノートブックが出る", (await page.$eval(".sheet.is-note .sheet-head .js-nb", (e) => e.textContent.trim())) === "家のこと");
  await escTop();
  t.check("タグ・ノートブックでは更新日が動かない", (await page.evaluate((i) => KN.notes.get(i.b).updatedAt, ids)) === bUpd);

  /* ---- 置く前の新しいノート ---- */
  await page.click("#dock .add-fab");
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.click(".sheet.is-note .note-tag-add");
  await popOpen();
  await page.evaluate(() => [...document.querySelectorAll(".note-pick .chip")].find((c) => c.textContent.trim() === "予定").click());
  await popEsc();
  /* 本文から出たので整えた姿（段4）。本文の場所を押すと書く欄へ戻る。 */
  await page.click(".sheet.is-note .note-view");
  await page.keyboard.insertText("あとで書く中身");
  await page.waitForTimeout(100);
  await escTop();
  const fresh = await page.evaluate(() => KN.notes.list().find((n) => n.body === "あとで書く中身"));
  t.check("置く前に付けたタグも入る", fresh && JSON.stringify(fresh.tags) === '["予定"]', JSON.stringify(fresh));
  await page.click("#dock .add-fab");
  await page.waitForSelector(".sheet.is-note.is-open");
  await page.click(".sheet.is-note .note-tag-add");
  await popOpen();
  await page.evaluate(() => [...document.querySelectorAll(".note-pick .chip")].find((c) => c.textContent.trim() === "本").click());
  await popEsc();
  await escTop();
  t.check("タグだけ付けて何も書かずに閉じたノートは残らない", (await page.evaluate(() => KN.notes.list().length)) === 4);
  t.check("閉じたら上の帯（theme-color）は元の灰へ", (await page.$$eval('meta[name="theme-color"]', (ms) => ms.map((m) => m.content))).join() === "#f0eff3,#121216");

  /* ---- 残る・書き出し・localStorage ---- */
  await page.evaluate(() => KN.notes.flush());
  await page.waitForTimeout(300);
  t.check("localStorage の大きさが変わらない", (await lsSize()) === ls0);
  await reload();
  const back = await page.evaluate((i) => ({ a: KN.notes.get(i.a), b: KN.notes.get(i.b) }), ids);
  t.check("読み直しても残る", back.a.notebook === "旅" && back.a.tags.join() === "京都,予定"
    && back.b.notebook === "家のこと" && back.b.tags.join() === "本,台所", JSON.stringify(back));
  const ex = await page.evaluate((i) => KN.notes.forExport().noteBook.notes.find((n) => n.id === i.a), ids);
  t.check("書き出しに入る", ex && ex.notebook === "旅" && ex.tags.join() === "京都,予定");

  /* ---- ぜんぶをさがす ---- */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await settled("todo");
  await page.click(".js-search-btn");
  await page.fill("#screen-todo .js-search", "読書");
  await page.waitForSelector("#screen-todo .sa-more", { timeout: 3000 });
  await page.click("#screen-todo .sa-more");
  await page.waitForSelector('.sa-group[data-place="notes"]', { timeout: 3000 });
  const saRow = await page.$eval('.sa-group[data-place="notes"]', (g) => ({
    head: g.querySelector(".sa-head").textContent, title: g.querySelector(".sa-title").textContent }));
  t.check("ほかのタブの虫めがねで、ノートに出る", saRow.head === "ノート" && saRow.title === "読書メモ", JSON.stringify(saRow));
  await page.click('.sa-group[data-place="notes"] .sa-row');
  await settled("notes");
  await page.waitForSelector(".sheet.is-note.is-open", { timeout: 3000 });
  t.check("押すと daily の裏でそのノートが開く",
    (await active()) === "notes" && (await page.$eval(".sheet.is-note .note-title-in", (e) => e.value)) === "読書メモ");
  await escTop();
  await page.fill("#screen-todo .js-search", "").catch(() => {});
  const fromNotes = await page.evaluate(() => KN.searchAll.find("読書", "notes").groups.map((g) => g.id));
  t.check("ノートの面からはノートを数えない", !fromNotes.includes("notes"), fromNotes.join());
  const byTag = await page.evaluate(() => (KN.searchAll.find("台所", "todo").groups.find((g) => g.id === "notes") || { rows: [] }).rows.map((r) => r.title));
  t.check("ぜんぶをさがすもタグに当たる", byTag.join() === "買い置き", byTag.join());

  t.check("絵文字を出さない", !/\p{Extended_Pictographic}/u.test((await page.$eval("#screen-notes", (e) => e.innerText)).replace(/★/g, "")));
  t.check("ページのエラーが無い", !errors.length, errors.join(" | "));
  await browser.close();
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
