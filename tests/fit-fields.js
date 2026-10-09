/* 伸びる欄を CSS で（docs/roadmap-3.1.md の S2、2026年10月9日）。

   field-sizing の効く頁（試験の Chromium）と、効かない端末の道（lib の noFit で CSS.supports を偽に）を
   一枚ずつ開き、同じ欄が同じ高さになるかを比べる。欄は四つ：やることのメモ・食事の枠・ノートの題と本文。
   - 効く頁では html に fit-fields、欄に高さを書かない（JS は測らない）。効かない頁はその逆。
   - 空のとき・打って伸びたとき・保存して開き直したときの高さが、二つの道で同じ（今までの JS は
     scrollHeight を border-box に書くので枠線ぶん短い。その差だけ許す）。
   - 効く頁では、長いメモの一番下で打っても紙の送りが戻されない（traps の「伸びる欄を測るために縮めない」）。
   ノートの写し（色付け）が揃うかは tests/note-typing.js（KN_NO_FIT=1 でも回す）。

   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/fit-fields.js */
const { open, checker, noFit } = require("./lib");

const LINES = (n, w) => Array.from({ length: n }, (_, i) => `${w}${i + 1}`).join("\n");

async function measure(fit) {
  const { browser, ctx, page, errors } = await open(fit ? {} : { before: (c) => c.addInitScript(noFit) });
  const wait = (ms) => page.waitForTimeout(ms);
  /* edge：上下の枠線。今までの JS は scrollHeight（枠線を含まない）を border-box の高さに書くので、
     枠線ぶん短い（字の下が切れる）。CSS の道はそのぶん高い——比べるときに足す。 */
  const box = (sel) => page.$eval(sel, (el) => {
    const cs = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, inline: el.style.height,
      edge: parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) };
  });
  const out = { errors };
  out.flag = await page.evaluate(() => ({ util: KN.util.fitFields, cls: document.documentElement.classList.contains("fit-fields") }));

  /* ---- やることのメモ ---- */
  const ids = await page.evaluate(() => ({
    empty: KN.store.addTodo({ title: "空のメモ", due: KN.util.todayKey() }).id,
    long: KN.store.addTodo({ title: "長いメモ", due: KN.util.todayKey(), memo: Array.from({ length: 60 }, (_, i) => `持ちもの${i + 1}`).join("\n") }).id,
  }));
  const memo = ".sheet.is-open .js-memo";
  await page.evaluate((i) => KN.screens.todo.open(i), ids.empty);
  await page.waitForSelector(memo);
  await wait(600);
  out.memoEmpty = await box(memo);
  await page.focus(memo);
  await page.keyboard.insertText(LINES(6, "メモ"));
  await wait(150);
  out.memoTyped = await box(memo);
  await page.keyboard.press("Escape");
  await wait(700);

  await page.evaluate((i) => KN.screens.todo.open(i), ids.long);
  await page.waitForSelector(memo);
  await wait(600);
  out.memoLong = await box(memo);
  /* メモの終わりに入り（入ってすぐ、紙が欄を見せに送るので落ち着くまで待つ）、紙を一番下まで送って打つ。 */
  out.jump = await page.$eval(".sheet.is-open", async (s) => {
    const sc = s.querySelector(".sheet-body");
    const ta = s.querySelector(".js-memo");
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    await new Promise((r) => setTimeout(r, 800));
    sc.scrollTop = sc.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const before = sc.scrollTop;
    ta.setRangeText("あ", ta.value.length, ta.value.length, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { before, after: sc.scrollTop };
  });
  await page.keyboard.press("Escape");
  await wait(700);

  /* ---- 食事の枠（その場で書く欄になる） ---- */
  await page.evaluate(() => KN.app.showScreen("diet"));
  await wait(700);
  const slot = ".diet-slot-edit textarea";
  await page.click('#screen-diet .diet-slot-view[data-slot="breakfast"]');
  await page.waitForSelector(slot);
  await wait(300);
  out.slotEmpty = await box(slot);
  await page.keyboard.insertText(LINES(4, "ごはん"));
  await wait(150);
  out.slotTyped = await box(slot);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await wait(500);
  await page.click('#screen-diet .diet-slot-view[data-slot="breakfast"]');
  await page.waitForSelector(slot);
  await wait(300);
  out.slotReopen = await box(slot);
  out.slotSaved = await page.evaluate(() => KN.store.slotMemo(KN.util.todayKey(), "breakfast"));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await wait(400);

  /* ---- ノートの題と本文 ---- */
  await page.evaluate(() => KN.app.showScreen("archive"));
  await wait(500);
  await page.click('.tab[data-tab="archive"]');
  await page.waitForFunction(() => document.querySelector(".screen.is-active").dataset.screen === "notes", null, { timeout: 4000 });
  await wait(300);
  await page.click("#dock .add-fab");
  await page.waitForSelector(".sheet.is-note.is-open");
  await wait(600);
  const title = ".sheet.is-note .js-title";
  const text = ".sheet.is-note .js-text";
  out.titleEmpty = await box(title);
  out.bodyEmpty = await box(text);
  /* 開けば本文に入っている。題へ移ると本文は整えた姿に替わるので、本文を先に。 */
  await page.keyboard.insertText(LINES(80, "行"));
  await wait(200);
  out.bodyTyped = await box(text);
  out.plain = await page.$eval(".sheet.is-note .js-ink", (el) => el.classList.contains("is-plain"));
  await page.focus(title);
  await page.keyboard.insertText("とても長い題で、一行には収まらずに折り返して二行目まで伸びていく本の名前");
  await wait(150);
  out.titleTyped = await box(title);

  await browser.close();
  return out;
}

(async () => {
  const t = checker("fit-fields");
  const a = await measure(true);
  const b = await measure(false);

  t.check("効く頁：KN.util.fitFields と html の fit-fields", a.flag.util === true && a.flag.cls === true, JSON.stringify(a.flag));
  t.check("効かない頁：どちらも付かない", b.flag.util === false && b.flag.cls === false, JSON.stringify(b.flag));

  const keys = ["memoEmpty", "memoTyped", "memoLong", "slotEmpty", "slotTyped", "slotReopen", "titleEmpty", "titleTyped", "bodyEmpty", "bodyTyped"];
  t.check("効く頁では、欄に高さを書かない（JS は測らない）", keys.every((k) => a[k].inline === ""),
    keys.filter((k) => a[k].inline !== "").map((k) => `${k}=${a[k].inline}`).join(" "));
  t.check("効かない頁では、今までどおり JS が高さを書く", ["memoTyped", "slotTyped", "titleTyped", "bodyTyped"].every((k) => b[k].inline !== ""),
    keys.map((k) => `${k}=${b[k].inline}`).join(" "));
  for (const k of keys) {
    t.check(`${k}：二つの道で同じ高さ（JS の道は枠線ぶん短い）`, Math.abs(a[k].h - b[k].h - a[k].edge) <= 1,
      `CSS ${a[k].h} / JS ${b[k].h} / 枠線 ${a[k].edge}`);
  }
  t.check("打てば伸びる（メモ・枠・題・本文）",
    a.memoTyped.h > a.memoEmpty.h + 40 && a.slotTyped.h > a.slotEmpty.h + 40
    && a.titleTyped.h > a.titleEmpty.h + 10 && a.bodyTyped.h > a.bodyEmpty.h + 400,
    JSON.stringify(keys.map((k) => Math.round(a[k].h))));
  t.check("食事の枠は、保存して開き直しても全部の行が見える", a.slotReopen.h >= a.slotTyped.h - 1 && /ごはん4/.test(a.slotSaved),
    `${a.slotTyped.h} → ${a.slotReopen.h}`);
  t.check("長いメモの一番下で打っても、紙の送りが戻されない", a.jump.after >= a.jump.before - 2 && a.jump.before > 300, JSON.stringify(a.jump));
  t.check("ノートの色付けは、どちらの道でも素の字に落ちない", !a.plain && !b.plain, `${a.plain} / ${b.plain}`);
  t.check("頁のエラーなし", a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors].join(" | "));
  console.log(`（参考）効かない道で長いメモの下を打ったとき：${JSON.stringify(b.jump)}`);
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
