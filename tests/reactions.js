/* 反応を足す（docs/motion.md の「反応を足す」・2026年10月8日）。
   - 引くと、空が近づく：いちばん上で紙を下へ引くと（本物のタッチ）、帯に --sky-pull と
     is-sky-pull が付き、空（.head::before）が 1 より大きくなる。離して戻れば、どちらも外れる。
     下の端で上へ引いたときは付かない
   - 送ると、紙の頭がやわらかく：いちばん上では縁が出ない（最初の行を薄めない）。送ると出る。
     health の紙（is-bare）には置かない
   - 済ませた輪に、波を一つ：burst の中に波（m-success）がある。行ごと渡されても丸の大きさに収まる
   - スイッチのつまみは --spring で収まる・考えている字は光が渡り続ける
   - 動きを減らす設定：考えている字は渡らない */
const { open, checker } = require("./lib");

const t = checker("reactions");

const touch = async (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent",
  { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] });

(async () => {
  {
    const { browser, ctx, page, errors } = await open({ touch: true });
    await page.evaluate(() => {
      const S = KN.store;
      for (let i = 0; i < 24; i++) { const p = S.addProduct({ name: `品物${i}` }); S.addItem(p.id); }
    });
    await page.click('.tab[data-tab="list"]');
    await page.waitForFunction(() => !document.querySelector(".is-m-arrive"), null, { timeout: 5000 });
    const sc = '#screen-list .tl-sheet';
    await page.waitForSelector(sc);

    /* ---- 引くと、空が近づく ---- */
    const cdp = await ctx.newCDPSession(page);
    const box = await page.$eval(sc, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 120 }; });
    let y = box.y;
    await touch(cdp, "touchStart", box.x, y);
    for (let i = 0; i < 16; i++) { y += 12; await touch(cdp, "touchMove", box.x, y); await page.waitForTimeout(16); }
    await page.waitForTimeout(200);
    const mid = await page.evaluate(() => {
      const h = document.getElementById("head");
      return { p: parseFloat(h.style.getPropertyValue("--sky-pull")) || 0, on: h.classList.contains("is-sky-pull"),
        scale: getComputedStyle(h, "::before").scale };
    });
    t.check("引いているあいだ、帯に --sky-pull が付く", mid.p > 0.3 && mid.p <= 1, JSON.stringify(mid));
    t.check("引いているあいだ、空を一枚にする（is-sky-pull）", mid.on);
    t.check("空が 1 より大きい", parseFloat(mid.scale) > 1.02 && parseFloat(mid.scale) <= 1.1, String(mid.scale));
    await touch(cdp, "touchEnd");
    await page.waitForFunction(() => !document.getElementById("head").classList.contains("is-sky-pull"), null, { timeout: 4000 })
      .catch(() => {});
    const after = await page.evaluate(() => {
      const h = document.getElementById("head");
      return { v: h.style.getPropertyValue("--sky-pull"), on: h.classList.contains("is-sky-pull") };
    });
    t.check("離して戻れば、--sky-pull も is-sky-pull も外れる", after.v === "" && !after.on, JSON.stringify(after));

    /* ---- 送ると、紙の頭がやわらかく ---- */
    const edge = () => page.$eval(sc, (el) => getComputedStyle(el.querySelector(":scope > .tl-grip"), "::after").opacity);
    t.check("いちばん上では縁が出ない", parseFloat(await edge()) === 0, await edge());
    await page.$eval(sc, (el) => { el.scrollTop = 60; });
    await page.waitForTimeout(120);
    t.check("送ると縁が出る", parseFloat(await edge()) > 0.9, await edge());

    /* 下の端で上へ引いても、空は動かない */
    await page.$eval(sc, (el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(150);
    y = box.y + 200;
    await touch(cdp, "touchStart", box.x, y);
    for (let i = 0; i < 12; i++) { y -= 12; await touch(cdp, "touchMove", box.x, y); await page.waitForTimeout(16); }
    await page.waitForTimeout(150);
    const bottom = await page.evaluate(() => ({
      moved: !!(KN.app.scrollerOf(document.querySelector(".screen.is-active")) || {}).style?.transform,
      v: document.getElementById("head").style.getPropertyValue("--sky-pull"),
    }));
    t.check("下の端の give では空は動かない", bottom.v === "", JSON.stringify(bottom));
    await touch(cdp, "touchEnd");

    /* health の紙には置かない */
    await page.click('.tab[data-tab="diet"]');
    await page.waitForFunction(() => !document.querySelector(".is-m-arrive"), null, { timeout: 5000 });
    const bare = await page.evaluate(() => {
      const g = document.querySelector("#screen-diet .tl-sheet.is-bare > .tl-grip");
      return g ? getComputedStyle(g, "::after").animationName : "none";
    });
    t.check("health の紙（is-bare）には縁を付けない", bare === "none", bare);

    /* ---- 済ませた輪に、波を一つ ---- */
    const wave = await page.evaluate(() => {
      const row = document.createElement("div");
      row.style.cssText = "position:fixed;left:0;top:300px;width:360px;height:56px";
      document.body.append(row);
      KN.ui.burst(row);
      const b = document.querySelector(".kn-burst b");
      const cs = b && getComputedStyle(b);
      const out = b ? { name: cs.animationName, w: parseFloat(cs.width), dots: b.parentNode.querySelectorAll("i").length } : null;
      row.remove();
      return out;
    });
    t.check("火花に波がある（m-success）", !!wave && wave.name === "m-success", JSON.stringify(wave));
    t.check("行ごと渡されても、波は丸の大きさ", !!wave && wave.w <= 36, JSON.stringify(wave));
    t.check("火花の点の輪はそのまま", !!wave && wave.dots === 12, JSON.stringify(wave));

    /* ---- スイッチ・考えている字 ---- */
    const look = await page.evaluate(() => {
      const box = document.createElement("div");
      box.innerHTML = '<span class="toggle"><span class="toggle-knob"></span></span><p class="diet-note is-thinking">考えています…</p>';
      document.body.append(box);
      const k = getComputedStyle(box.querySelector(".toggle-knob"));
      const p = getComputedStyle(box.querySelector(".is-thinking"));
      const spring = getComputedStyle(document.documentElement).getPropertyValue("--spring").trim();
      const out = { ease: k.transitionTimingFunction, spring, name: p.animationName, n: p.animationIterationCount, clip: p.backgroundClip || p.webkitBackgroundClip };
      box.remove();
      return out;
    });
    const nums = (s) => (s.match(/-?[\d.]+/g) || []).map(Number).join(",");
    t.check("スイッチのつまみは --spring で収まる", !!look.spring && nums(look.ease) === nums(look.spring), JSON.stringify(look));
    t.check("考えている字は光が渡り続ける", look.name === "think-sweep" && look.n === "infinite", JSON.stringify(look));
    t.check("エラーなし", errors.length === 0, errors.join(" | "));
    await browser.close();
  }
  {
    /* 送るほど中身の無い紙（scroll() が働かない）でも、縁は最初の行に掛からない */
    const { browser, page, errors } = await open({ before: async (cx, p) => { await p.emulateMedia({ reducedMotion: "reduce" }); } });
    await page.evaluate(() => { const p = KN.store.addProduct({ name: "牛乳" }); KN.store.addItem(p.id); });
    await page.click('.tab[data-tab="list"]');
    await page.waitForTimeout(400);
    const short = await page.$eval("#screen-list .tl-sheet", (el) => ({ fits: el.scrollHeight <= el.clientHeight,
      op: getComputedStyle(el.querySelector(":scope > .tl-grip"), "::after").opacity }));
    t.check("送れない紙では縁が出ない", short.fits && parseFloat(short.op) === 0, JSON.stringify(short));
    const n = await page.evaluate(() => {
      const p = document.createElement("p");
      p.className = "is-thinking";
      p.textContent = "考えています…";
      document.body.append(p);
      const cs = getComputedStyle(p);
      const out = { n: cs.animationIterationCount, d: cs.animationDuration };
      p.remove();
      return out;
    });
    t.check("減らす設定：考えている字は渡らない", n.n === "1" && parseFloat(n.d) < 0.01, JSON.stringify(n));
    t.check("減らす設定：エラーなし", errors.length === 0, errors.join(" | "));
    await browser.close();
  }
  t.done();
})();
