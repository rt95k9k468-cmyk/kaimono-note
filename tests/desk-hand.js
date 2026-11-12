/* パソコン（Windows）の手ざわり（docs/log/design-review.md 10節の P4。点検して穴だった所）：
   - 紙を閉じたら、カーソルは押したものへ戻る（組み直しで入れ替わった行は同じ印の行の同じ口へ）。探す窓の Esc は虫めがねへ
   - 設定の画面は Esc で一枚ずつ戻り、出たら歯車へ
   - 強制配色（ハイコントラスト）で ＋・今日｜週｜月 に縁、選んでいる席と札は Highlight
   - 丸ゴの無い端末はゴシックの顔（sans-serif 任せにしない）・游ゴシックは 400＝Medium／700＝Bold の面を束ねる
   - 右クリックは買うもの・やること・ノートの行で行の小窓／やることの紙と小窓（⋯）も閉じたら押したものへ／Tab は 帯→中身→＋→列
   - Windows（Win32）で近道の一覧は Ctrl／強制配色で形の無い押せるものが無い／時刻・値段・目方は等幅の数字
   - 指の端末（電話）：開いた紙そのものがカーソルを持つ（打つ欄へは入れない）・閉じても打つ欄へは置き直さない
   - B3：丸を Space で済ませるとカーソルは同じ場所の次の行へ（マウスなら輪なし）・知らせは読み上げにだけ「済ませました」・
     行から膨らむ紙にもカーソルが入り、Esc で行へ戻る・小窓（日付）はカーソルが入って Tab が中を回る・下の帯に隠れて止まらない・
     設定の下の一枚と上の帯は inert・ノートの木は ← → で畳む
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/desk-hand.js */
const { open, checker } = require("./lib");

async function seed(page) {
  await page.evaluate(async () => {
    const S = KN.store;
    const a = S.addStore("スーパー");
    ["牛乳", "卵"].forEach((name) => { const p = S.addProduct({ name }); S.addItem(p.id); S.addPrice(p.id, { storeId: a.id, price: 100, amount: 1, date: KN.util.todayKey() }); });
    S.addTodo({ title: "試しの予定", due: KN.util.todayKey(), time: "10:00", minutes: 30 });
    S.addWeight({ day: KN.util.todayKey(), time: "07:00", kg: 60 });
    const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
    await KN.notes.addMany(["一つめ", "二つめ"].map((title, i) => ({ id: `n-hand${i}`, title, body: "試しの本文",
      notebook: "private", tags: [], fav: false, createdAt: at(i), updatedAt: at(i), deletedAt: null })));
  });
}

/* 開いて Esc で閉じ、カーソルがどこに居るか（押したものと同じ口か）。 */
async function roundTrip(page, sel, same) {
  const ok = await page.evaluate((sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.getClientRects().length); if (!e) return false; e.focus(); return document.activeElement === e; }, sel);
  if (!ok) return { ok: false };
  await page.keyboard.press("Enter");
  await page.waitForSelector(".sheet.is-open", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => !!document.querySelector(".sheet.is-open"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  const back = await page.evaluate(same);
  return { ok: true, opened, back };
}

(async () => {
  const t = checker("desk-hand");
  {
    const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
    await seed(page);
    await page.click(".tab-list");
    await page.waitForTimeout(600);

    let r = await roundTrip(page, "#screen-list .item-wrap .item-body",
      () => !!document.activeElement.closest("#screen-list .item-wrap") && document.activeElement.matches(".item-body"));
    t.check("品物の紙を Esc で閉じると、カーソルは押した行へ", r.ok && r.opened && r.back, JSON.stringify(r));
    r = await roundTrip(page, "#dock .add-fab", () => document.activeElement.matches("#dock .add-fab"));
    t.check("＋の紙を閉じると、カーソルは＋へ", r.ok && r.opened && r.back, JSON.stringify(r));

    await page.click(".tab-notes");
    await page.waitForTimeout(700);
    r = await roundTrip(page, "#screen-notes .note-row .js-open", () => document.activeElement.matches("#screen-notes .note-row .js-open"));
    t.check("ノートを閉じると、カーソルは組み直した一覧の同じ札へ", r.ok && r.opened && r.back, JSON.stringify(r));

    /* ノートの木：← → で畳む・ひらく（B3。カーソルは同じ行に残る）。 */
    {
      const row = '#screen-notes .nt-row[aria-expanded], .notes-tree .nt-row[aria-expanded]';
      const st = () => page.evaluate((row) => { const a = document.activeElement; return a && a.matches(row) ? a.getAttribute("aria-expanded") : "外"; }, row);
      const had = await page.evaluate((row) => { const r = [...document.querySelectorAll(row)].find((x) => x.getClientRects().length); if (r) r.focus(); return r ? r.getAttribute("aria-expanded") : null; }, row);
      const key = had === "true" ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
      const seen = [];
      for (const k of key) {
        await page.keyboard.press(k);
        await page.waitForFunction(({ row, was }) => { const a = document.activeElement; return !!a && a.matches(row) && a.getAttribute("aria-expanded") !== was; }, { row, was: seen.length ? seen[seen.length - 1] : had }, { timeout: 3000 }).catch(() => {});
        seen.push(await st());
      }
      t.check("ノートの木：← → で畳む・ひらく（カーソルは行に残る）", had !== null && seen[0] === String(had !== "true") && seen[1] === had, JSON.stringify({ had, seen }));
    }

    /* 探す窓：Esc で閉じたら虫めがねへ。 */
    await page.click(".tab-list");
    await page.waitForTimeout(500);
    await page.keyboard.press("/");
    await page.waitForTimeout(400);
    const inSearch = await page.evaluate(() => document.activeElement.matches(".js-search"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    /* 広い幅では帯の虫めがねは隠れ、左の列の「さがす」が同じ口（docs/redesign.md 5節）。 */
    t.check("探す窓の Esc は虫めがね（広い幅は左の列のさがす）へ", inSearch && await page.evaluate(() => document.activeElement.matches("#head .js-search-btn, #tabbar .rail-find")));

    /* 設定：Esc で一枚ずつ戻り、出たら歯車へ。 */
    await page.keyboard.press(",");
    await page.waitForTimeout(700);
    await page.locator("#screen-settings .set-row.is-nav").first().click();
    await page.waitForTimeout(800);
    const layers = () => page.evaluate(() => [...document.querySelectorAll("#screen-settings .set-layer")].filter((e) => e.getClientRects().length).length);
    const deep = await layers();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const one = await layers();
    const still = await page.evaluate(() => document.documentElement.dataset.screen);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const out = await page.evaluate(() => ({ screen: document.documentElement.dataset.screen, gear: document.activeElement.matches("#head .js-settings") }));
    t.check("設定は Esc で一枚もどる", deep === 2 && one === 1 && still === "settings", JSON.stringify({ deep, one, still }));
    t.check("設定の根で Esc：前の席へ戻り、カーソルは歯車", out.screen === "list" && out.gear, JSON.stringify(out));

    /* 書体：丸ゴの無い端末はゴシックの顔へ。游ゴシックは面を束ねて呼ぶ。 */
    const fonts = await page.evaluate(() => {
      const f = (v) => { document.documentElement.toggleAttribute("data-font", !!v); if (v) document.documentElement.setAttribute("data-font", v);
        return getComputedStyle(document.documentElement).getPropertyValue("--font"); };
      const maru = f("maru"), goth = f("");
      const faces = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (_) { return []; } })
        .filter((r) => r instanceof CSSFontFaceRule && /KN Yu Gothic/.test(r.style.getPropertyValue("font-family")))
        .map((r) => `${r.style.getPropertyValue("font-weight")} ${r.style.getPropertyValue("src")}`);
      return { maru, goth, faces };
    });
    t.check("丸ゴの次はゴシック（sans-serif 任せにしない）", /Maru[^,]*,\s*"KN Yu Gothic"/.test(fonts.maru) && !/Maru Gothic ProN",\s*sans-serif/.test(fonts.maru), fonts.maru);
    t.check("游ゴシックは 400＝Medium・700＝Bold の面", fonts.faces.length === 2 && fonts.faces.some((x) => /^(400|normal) .*Medium/.test(x)) && fonts.faces.some((x) => /^(700|bold) .*Bold/.test(x))
      && /"KN Yu Gothic"/.test(fonts.goth), JSON.stringify(fonts));

    /* 席の帯：選んでいる印は true／false だけ（holds の無い席が "undefined"＝「選べない」と読まれていた）。
       マウスで席を押したあとの → は今までどおり日を送る（押してから ← で前の日、の手つき。tests/desk.js も）。
       キーボード（Tab）で帯へ来たら ←→・↑↓・Home・End で席を移る（日は送らない）。帯の外の → は日を送る。 */
    const seats = () => page.evaluate(() => ({ scr: KN.app.activeScreen(), day: document.querySelector("#head .topbar-day").textContent.trim(),
      focus: document.activeElement.dataset.tab || "", sel: [...document.querySelectorAll("#tabbar [role=tab]")].map((b) => b.getAttribute("aria-selected")) }));
    await page.click(".tab-archive");
    await page.waitForTimeout(600);
    const m0 = await seats();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    const m1 = await seats();
    t.check("マウスで席を押したあとの → は次の日（席は移らない）", m1.scr === "archive" && m1.day !== m0.day, JSON.stringify({ m0, m1 }));
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(800);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const k0 = await seats();
    t.check("席の帯：選んでいる印は true か false だけ", k0.sel.every((v) => v === "true" || v === "false") && k0.sel.filter((v) => v === "true").length === 1, JSON.stringify(k0.sel));
    const walk = [];
    for (const k of ["ArrowRight", "ArrowDown", "End", "ArrowRight", "ArrowLeft", "Home", "ArrowUp"]) {
      await page.keyboard.press(k);
      await page.waitForTimeout(450);
      const s = await seats();
      walk.push(`${s.scr}/${s.focus}/${s.day === k0.day ? "同じ日" : s.day}`);
    }
    t.check("席の帯：←→・↑↓・Home・End で席を移り、カーソルも付いてくる（日は送らない）",
      walk.join(" ") === "notes/notes/同じ日 todo/todo/同じ日 diet/diet/同じ日 archive/archive/同じ日 diet/diet/同じ日 archive/archive/同じ日 diet/diet/同じ日", walk.join(" "));
    await page.click(".tab-archive");
    await page.waitForTimeout(600);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    const k1 = await seats();
    t.check("帯の外の → は今までどおり次の日", k1.scr === "archive" && k1.day !== k0.day, JSON.stringify(k1));
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(800);

    /* 強制配色。 */
    await page.emulateMedia({ forcedColors: "active" });
    await page.click(".tab-todo");
    await page.waitForTimeout(700);
    const fc = await page.evaluate(() => {
      const cs = (s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); return e && getComputedStyle(e); };
      const fab = cs("#dock .add-fab"), seg = cs("#screen-todo .seg-btn:not([aria-pressed='true'])"), on = cs("#screen-todo .seg-btn[aria-pressed='true']"), tab = cs(".tab[aria-selected='true']");
      const plain = cs(".tab:not([aria-selected='true'])");
      return { fab: fab && fab.outlineStyle, seg: seg && seg.outlineStyle, on: on && on.backgroundColor, tab: tab && tab.backgroundColor, plain: plain && plain.backgroundColor };
    });
    await page.emulateMedia({ forcedColors: "none" });
    t.check("強制配色：＋と今日｜週｜月 に縁", fc.fab === "solid" && fc.seg === "solid", JSON.stringify(fc));
    t.check("強制配色：選んでいる札と席は Highlight（ほかと違う地）", !!fc.on && !!fc.tab && fc.on === fc.tab && fc.tab !== fc.plain, JSON.stringify(fc));

    t.check("エラーなし", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* 点検の続き（Windows の端末のつもりで：navigator.platform を Win32 に）。 */
  {
    const win = (ctx) => ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "platform", { get: () => "Win32" }));
    const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 }, before: win });
    await seed(page);
    const shownMenu = () => page.evaluate(() => !!document.querySelector(".note-pop.is-open"));
    const escMenu = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(400); };

    /* 1 右クリック：買うもの・やること・ノートの行で、ブラウザの小窓でなく行の小窓。 */
    const rightClick = async (sel) => {
      const box = await page.evaluate((sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.getClientRects().length); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height / 2 }; }, sel);
      if (!box) return { found: false };
      await page.mouse.click(box.x, box.y, { button: "right" });
      await page.waitForTimeout(400);
      const r = { found: true, menu: await shownMenu(), items: await page.evaluate(() => [...document.querySelectorAll(".note-pop.is-open [role=menuitem], .note-pop.is-open button")].map((b) => b.textContent.trim()).filter(Boolean)) };
      if (r.menu) await escMenu();
      return r;
    };
    await page.click(".tab-list");
    await page.waitForTimeout(600);
    let rc = await rightClick("#screen-list .item-wrap");
    t.check("右クリック：買うものの行は行の小窓", rc.menu, JSON.stringify(rc));
    await page.click(".tab-todo");
    await page.waitForTimeout(700);
    rc = await rightClick("#screen-todo .tl-open");
    t.check("右クリック：やることの行も行の小窓（しまう・消す）", rc.menu && rc.items.some((x) => /アーカイブする/.test(x)) && rc.items.some((x) => /消す/.test(x)), JSON.stringify(rc));
    await page.click(".tab-notes");
    await page.waitForTimeout(700);
    rc = await rightClick("#screen-notes .note-row .js-open");
    t.check("右クリック：ノートの行も行の小窓（★・移す・消す）", rc.menu && ["★を付ける", "移す", "消す"].every((w) => rc.items.some((x) => x.includes(w))), JSON.stringify(rc));

    /* 2 閉じたら押したものへ：やることの行・小窓（⋯）。 */
    await page.click(".tab-todo");
    await page.waitForTimeout(700);
    const r = await roundTrip(page, "#screen-todo .tl-open", () => document.activeElement.matches("#screen-todo .tl-open"));
    t.check("やることの紙を Esc で閉じると、カーソルは押した行へ", r.ok && r.opened && r.back, JSON.stringify(r));
    /* 3 Tab の順：帯 → 中身 → ＋ → 左の列（電話と同じ DOM の順）。 */
    const seq = [];
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press("Tab");
      seq.push(await page.evaluate(() => { const e = document.activeElement;
        return e.closest("#head") ? "帯" : e.closest("#dock .add-fab") ? "＋" : e.closest("#tabbar") ? "列" : e.closest(".screen") ? "中身" : null; }));
    }
    const order = seq.filter(Boolean).filter((x, i, a) => x !== a[i - 1]).join("→");
    t.check("Tab は 帯→中身→＋→列 の順で回る", /帯→中身→＋→列→帯/.test(order) && !/中身→帯|＋→中身|列→＋/.test(order), order);

    await page.click(".tab-notes");
    await page.waitForTimeout(700);
    await page.locator("#screen-notes .note-row .js-open").first().click();
    await page.waitForSelector(".js-note-more", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    let popBack = null;
    if (await page.evaluate(() => { const e = document.querySelector(".js-note-more"); if (e) e.focus(); return !!e && document.activeElement === e; })) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const opened = await shownMenu();
      await escMenu();
      popBack = { opened, back: await page.evaluate(() => document.activeElement.matches(".js-note-more")), sheet: await page.evaluate(() => !!document.querySelector(".sheet.is-open")) };
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
    t.check("小窓（⋯）を Esc で閉じると、カーソルは ⋯ へ", !!popBack && popBack.opened && popBack.back, JSON.stringify(popBack));

    /* 4 近道の一覧：Windows では Ctrl（⌘ を出さない）。 */
    await page.keyboard.press("?");
    await page.waitForTimeout(500);
    const keys = await page.evaluate(() => [...document.querySelectorAll(".sheet.is-open .keys-list kbd")].map((k) => k.textContent));
    t.check("近道の一覧は Ctrl（⌘ は出さない）", keys.includes("Ctrl") && !keys.includes("⌘"), keys.join(" "));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    /* 5 強制配色：見えている押せるものはどれも、字・絵・縁のどれかで形がある（地だけで言わない）。 */
    await page.emulateMedia({ forcedColors: "active" });
    const blind = [];
    for (const tab of ["archive", "notes", "todo", "list", "diet"]) {
      await page.click(`.tab-${tab}`);
      await page.waitForTimeout(700);
      blind.push(...await page.evaluate(() => [...document.querySelectorAll("button, [role=button], [role=switch], [role=tab], a[href], input[type=checkbox], input[type=radio]")]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== "hidden"; })
        .filter((e) => { const cs = getComputedStyle(e);
          if ((e.innerText || e.value || "").trim()) return false;
          if (e.querySelector("svg, img, canvas") || /input/i.test(e.tagName)) return false;
          if (cs.borderStyle !== "none" && parseFloat(cs.borderWidth) > 0) return false;
          if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) return false;
          return !["::before", "::after"].some((p) => { const s = getComputedStyle(e, p); return s.content !== "none" && s.content !== "normal" && (s.borderStyle !== "none" || /url|"[^"]+"/.test(s.content + s.maskImage + s.backgroundImage)); });
        }).map((e) => `${e.closest(".screen, #head, #tabbar, #dock")?.id || "?"} ${e.tagName}.${[...e.classList].join(".")}`)));
    }
    await page.emulateMedia({ forcedColors: "none" });
    t.check("強制配色：形の無い押せるものが無い", !blind.length, [...new Set(blind)].join(" | "));

    /* 6 数字の揃え：時刻・値段・目方の並ぶ所は等幅の数字（Windows の游ゴシックは数字の幅がまちまち）。 */
    const loose = [];
    for (const tab of ["todo", "list", "diet"]) {
      await page.click(`.tab-${tab}`);
      await page.waitForTimeout(700);
      loose.push(...await page.evaluate(() => [...document.querySelectorAll(`.screen[data-screen="${document.documentElement.dataset.screen}"] *`)]
        .filter((e) => e.children.length === 0 && e.getClientRects().length && /^[¥￥]?\s?\d{1,3}(,\d{3})*([.:]\d{1,2})?\s?(kg|円)?$/.test(e.textContent.trim()) && /\d.*\d/.test(e.textContent))
        .filter((e) => !/tabular-nums/.test(getComputedStyle(e).fontVariantNumeric))
        .map((e) => `${e.tagName}.${[...e.classList].join(".") || (e.parentElement && "^" + [...e.parentElement.classList].join("."))}「${e.textContent.trim()}」`)));
    }
    t.check("数字の並ぶ所は等幅の数字", !loose.length, [...new Set(loose)].join(" | "));

    t.check("Windows のつもり：エラーなし", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* B3：押したものが組み直しで入れ替わっても、カーソルはその場に（ui.js の hold／rehold）。 */
  {
    const { browser, page, errors } = await open({ viewport: { width: 393, height: 852 } });
    await page.evaluate(() => {
      const S = KN.store, d = KN.util.todayKey();
      ["あ", "い", "う", "え"].forEach((x, i) => S.addTodo({ title: `用事${x}`, due: d, time: `1${i}:00`, minutes: 30 }));
      ["牛乳", "卵", "食パン"].forEach((name) => { const p = S.addProduct({ name }); S.addItem(p.id); });
      KN.app.showScreen("todo");
    });
    await page.waitForTimeout(600);
    const cur = () => page.evaluate(() => { const a = document.activeElement;
      return { label: (a && a.getAttribute("aria-label")) || "", cls: a ? String(a.className).split(" ")[0] : "", ring: !!a && a.matches(":focus-visible") }; });
    const landed = (sel) => page.waitForFunction((sel) => { const a = document.activeElement; return !!a && a.matches(sel); }, sel, { timeout: 3000 }).then(() => true, () => false);

    await page.evaluate(() => document.querySelectorAll('#screen-todo .check[aria-checked="false"]')[1].focus());
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");   // 鍵盤で来た（輪が出る）
    const before = await cur();
    await page.keyboard.press("Space");
    const moved = await landed('#screen-todo .check[aria-label^="用事う"]');
    const c1 = await cur();
    t.check("丸を Space で済ませると、カーソルは同じ場所へ来た次の行の丸に（輪つき）", before.label.startsWith("用事い") && moved && c1.ring, JSON.stringify({ before, c1 }));
    const said = await page.evaluate(() => { const m = document.querySelector("#toast-root .toast-msg"); if (!m) return null;
      const seen = m.querySelector('[aria-hidden="true"]'), say = m.querySelector(".sr-only");
      return { seen: seen && seen.textContent.trim(), say: say && say.textContent.trim(), live: document.getElementById("toast-root").getAttribute("aria-live") }; });
    t.check("済ませた知らせ：見える字は短いまま、読み上げには「済ませました」",
      !!said && /^「用事い」/.test(said.seen || "") && !/済ませ/.test(said.seen) && /「用事い」を済ませました/.test(said.say || "") && said.live === "polite", JSON.stringify(said));

    await page.click('#screen-todo .check[aria-checked="false"]');
    await page.waitForFunction(() => document.querySelectorAll('#screen-todo .check[aria-checked="true"]').length === 2
      && !!document.activeElement && document.activeElement.isConnected && document.activeElement !== document.body, null, { timeout: 3000 }).catch(() => {});
    const c2 = await cur();
    t.check("マウスで押した丸：カーソルは残るが輪は出ない", c2.cls === "check" && !c2.ring, JSON.stringify(c2));

    await page.evaluate(() => document.querySelector("#screen-todo .tl-open").focus());
    await page.keyboard.press("Enter");
    const into = await page.waitForFunction(() => { const sh = document.querySelector(".sheet.is-open"); return !!sh && sh.contains(document.activeElement); }, null, { timeout: 3000 }).then(() => true, () => false);
    await page.keyboard.press("Escape");
    const home = await landed("#screen-todo .tl-open");
    t.check("行から膨らむ紙：飛び終えてからカーソルが紙の中へ入り、Esc で行へ戻る", into && home, JSON.stringify({ into, home }));

    await page.evaluate(() => KN.app.showScreen("list"));
    await page.waitForTimeout(600);
    const first = await page.evaluate(() => { const c = document.querySelector("#screen-list .check"); c.focus(); return c.getAttribute("aria-label"); });
    await page.keyboard.press("Space");
    const next = await page.waitForFunction((first) => { const a = document.activeElement;
      return !!a && a.matches("#screen-list .check") && a.getAttribute("aria-label") !== first && a.getAttribute("aria-checked") !== "true"; }, first, { timeout: 4000 }).then(() => true, () => false);
    t.check("買った行のあと、カーソルは隣の行の丸へ", next, JSON.stringify(await cur()));
    /* 小窓（日付）：カーソルが小窓へ入り、Tab は小窓の中を回り、Esc で押した行へ。読み上げの覆いは小窓が持つ。 */
    await page.evaluate(() => KN.app.showScreen("todo"));
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector("#screen-todo .tl-open").focus());
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => { const sh = document.querySelector(".sheet.is-open"); return !!sh && sh.contains(document.activeElement); }, null, { timeout: 3000 }).catch(() => {});
    await page.evaluate(() => document.querySelector(".sheet.is-open .js-row-due").focus());
    await page.keyboard.press("Enter");
    const inPop = await page.waitForFunction(() => { const p = document.querySelector(".note-pop.is-open"); return !!p && p.contains(document.activeElement) && document.activeElement !== p; }, null, { timeout: 3000 }).then(() => true, () => false);
    const modal = await page.evaluate(() => [document.querySelector(".note-pop.is-open").getAttribute("aria-modal"), document.querySelector(".sheet.is-open").getAttribute("aria-modal")]);
    let stays = true;
    for (let i = 0; i < 45; i++) { await page.keyboard.press("Tab"); stays = stays && await page.evaluate(() => !!document.activeElement.closest(".note-pop.is-open")); }
    await page.keyboard.press("Escape");
    const toRow = await landed(".sheet.is-open .js-row-due");
    const modalBack = await page.evaluate(() => document.querySelector(".sheet.is-open").getAttribute("aria-modal"));
    t.check("小窓：カーソルが入り、Tab は中を回り、Esc で押した行へ（覆いは小窓 → 紙へ戻る）",
      inPop && stays && toRow && modal[0] === "true" && modal[1] === "false" && modalBack === "true", JSON.stringify({ inPop, stays, toRow, modal, modalBack }));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});

    /* 帯の下に隠れたまま止まらない（送る器の scroll-padding）。 */
    await page.evaluate(() => { for (let i = 0; i < 8; i++) KN.store.addTodo({ title: `時刻なし${i}`, due: null }); });
    await page.waitForTimeout(500);
    const clear = await page.evaluate(() => {
      const bar = document.getElementById("tabbar").getBoundingClientRect().top;
      return [...document.querySelectorAll("#screen-todo .tl-open, #screen-todo .tl-someday-add")].filter((b) => b.getClientRects().length)
        .map((b) => { b.focus(); const r = b.getBoundingClientRect(); return r.bottom <= bar + 0.5 ? "" : `${b.textContent.trim().slice(0, 8)} ${Math.round(r.bottom)}>${Math.round(bar)}`; }).filter(Boolean);
    });
    t.check("Tab で来たものが下の帯に隠れない", !clear.length, clear.join(" / "));

    /* ノートの席：薄れた日付に止まらない。設定：上の帯と下に敷かれた一枚は通さず、奥へ入ったカーソルは戻ると押した行へ。 */
    await page.evaluate(() => KN.app.showScreen("notes"));
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#head .topbar-day")).visibility === "hidden", null, { timeout: 3000 }).catch(() => {});
    const dayGone = await page.evaluate(() => getComputedStyle(document.querySelector("#head .topbar-day")).visibility);
    await page.evaluate(() => KN.app.showScreen("todo"));
    await page.waitForTimeout(700);
    const dayBack = await page.evaluate(() => getComputedStyle(document.querySelector("#head .topbar-day")).visibility);
    t.check("ノートの席：薄れた日付は Tab・読み上げから外れ、ほかの席で戻る", dayGone === "hidden" && dayBack === "visible", `${dayGone} / ${dayBack}`);

    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelector("#screen-settings .set-row.is-nav").focus());
    await page.keyboard.press("Enter");
    const deep = await page.waitForFunction(() => { const l = document.querySelectorAll("#screen-settings .set-layer"); return l.length === 2 && l[1].contains(document.activeElement); }, null, { timeout: 3000 }).then(() => true, () => false);
    const lay = await page.evaluate(() => ({ under: document.querySelector("#screen-settings .set-layer").inert, head: document.getElementById("head").inert }));
    await page.waitForTimeout(700);
    await page.keyboard.press("Tab");
    const onBack = await page.evaluate(() => document.activeElement.matches(".set-layer:last-child .js-back"));
    await page.keyboard.press("Escape");
    const onRow = await landed("#screen-settings .set-row.is-nav");
    const free = await page.evaluate(() => !document.querySelector("#screen-settings .set-layer").inert);
    /* 戻る動きのあいだの Esc は受けない（screen-settings.js の moving）。奥の一枚が外れてから。 */
    await page.waitForFunction(() => document.querySelectorAll("#screen-settings .set-layer").length === 1, null, { timeout: 3000 }).catch(() => {});
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => KN.app.activeScreen() !== "settings", null, { timeout: 3000 }).catch(() => {});
    const headBack = await page.evaluate(() => !document.getElementById("head").inert);
    t.check("設定：下の一枚と上の帯は通さず、奥のカーソルは「もどる」から、戻ると押した行へ",
      deep && lay.under && lay.head && onBack && onRow && free && headBack, JSON.stringify({ deep, lay, onBack, onRow, free, headBack }));
    t.check("B3 のカーソル：エラーなし", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* 指の端末（電話）：開いた紙そのものがカーソルを持つ（読み上げの入口。打つ欄へは入れない＝キーボードを上げない）。
     閉じても、打つ欄へは置き直さない（押したボタンへは戻す——読み上げ・つないだ鍵盤）。 */
  {
    const { browser, page, errors } = await open({ viewport: { width: 393, height: 852 }, touch: true });
    await seed(page);
    const typing = () => page.evaluate(() => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); });
    await page.tap(".tab-list");
    await page.waitForTimeout(600);
    await page.tap("#screen-list .item-wrap .item-body");
    const onSheet = await page.waitForFunction(() => !!document.activeElement && document.activeElement.matches(".sheet.is-open"), null, { timeout: 3000 }).then(() => true, () => false);
    t.check("電話：開いた紙そのものがカーソルを持つ（欄へは入れない）", onSheet && !(await typing()));
    await page.tap(".sheet.is-open .js-close");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.tap("#dock .add-fab");
    await page.waitForSelector(".sheet.is-open", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    const inSheet = await page.evaluate(() => !!document.activeElement.closest(".sheet"));
    await page.tap(".sheet.is-open .js-close");
    await page.waitForFunction(() => !document.querySelector(".sheet.is-open"), null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
    const after = !(await typing());
    t.check("電話：閉じても打つ欄へは置き直さない", inSheet && after, JSON.stringify({ inSheet, after }));
    t.check("電話：エラーなし", !errors.length, errors.join(" | "));
    await browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
