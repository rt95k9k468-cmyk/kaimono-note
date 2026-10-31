/* JS の動きも「動きを減らす」に従う（docs/log/design-review.md 10節の P7。docs/motion.md）。
   一、JS に `behavior: "smooth"` を直に書かない——ブラウザは「動きを減らす」でも JS の smooth を止めない。
       `KN.motion.smooth()`（動きを減らすなら "auto"）を通す。毎コマ書いて滑らせる送り（`KN.app.glideTo`）も止める。
   二、「動きを減らす」で開くと：smooth() は "auto"・指を離したあとの滑り（glide）は 0（CSS の transition・animation は base.css が止める）。
       席を移る・紙を開いて閉じる・ノートの段を開いて閉じるあいだ、JS から長さのある animate() も smooth の送りも出ない。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/still-js.js */
const fs = require("fs");
const path = require("path");
const { open, checker } = require("./lib");

(async () => {
  const t = checker("still-js");
  const dir = path.join(__dirname, "..", "js");
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js") && x !== "motion.js")) {
    const s = fs.readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of s.matchAll(/behavior:\s*["']smooth["']/g)) bad.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
  }
  t.check("JS に behavior: \"smooth\" を直に書いていない（KN.motion.smooth() を通す）", !bad.length, bad.join(" | "));

  const probe = () => {
    window.__mv = [];
    const nm = (e) => (e && e.nodeType === 1 ? `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join(".")}` : String(e));
    const A = Element.prototype.animate;
    Element.prototype.animate = function (k, o) {
      const d = typeof o === "number" ? o : o && o.duration;
      if (d > 0) window.__mv.push(`animate ${nm(this)} ${d}ms`);
      return A.call(this, k, o);
    };
    for (const n of ["scrollTo", "scrollBy", "scrollIntoView"]) {
      const orig = Element.prototype[n];
      Element.prototype[n] = function (...a) {
        if (a[0] && typeof a[0] === "object" && a[0].behavior === "smooth") window.__mv.push(`${n} smooth ${nm(this)}`);
        return orig.apply(this, a);
      };
    }
  };
  for (const w of [393, 1180]) {
    const { browser, page, errors } = await open({ viewport: { width: w, height: 852 }, touch: w < 840, before: (ctx) => ctx.addInitScript(probe) });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForTimeout(1000);
    const v = await page.evaluate(() => ({ still: KN.motion.still(), smooth: KN.motion.smooth(), glide: KN.motion.glide(800, 300).ms }));
    const g = await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;left:0;top:0;width:100px;height:100px;overflow:auto";
      d.innerHTML = '<div style="height:2000px"></div>';
      document.body.append(d);
      KN.app.glideTo(d, 600);
      const y = d.scrollTop; d.remove(); return y;
    });
    t.check(`${w}：動きを減らすと KN.app.glideTo は滑らせずに着く（毎コマ書く送り）`, g === 600, String(g));
    t.check(`${w}：動きを減らすと smooth() は auto・指を離したあとの滑りは 0`, v.still && v.smooth === "auto" && v.glide === 0, JSON.stringify(v));
    await page.evaluate(async () => {
      const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
      KN.store.addTodo({ title: "予定", due: KN.util.todayKey(), time: "10:00", minutes: 30 });
      await KN.notes.addMany([{ id: "n-s0", title: "一つめ", body: "本文", notebook: "private", tags: [], fav: false, createdAt: at(1), updatedAt: at(1), deletedAt: null }]);
      window.__mv = [];
    });
    for (const s of ["todo", "list", "diet", "notes", "archive", "todo"]) { await page.click(`.tab-${s}`); await page.waitForTimeout(350); }
    await page.locator(".dock .add-fab, .dock button").first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    if (w >= 840) {
      await page.click(".tab-notes");
      await page.waitForTimeout(400);
      await page.locator(".nt-card").first().click();
      await page.waitForTimeout(500);
      await page.keyboard.press("3");
      await page.waitForTimeout(500);
    }
    const mv = await page.evaluate(() => [...new Set(window.__mv)]);
    t.check(`${w}：席・紙・ノートの段のあいだ、JS から動き（animate・smooth の送り）が出ない`, !mv.length, mv.slice(0, 6).join(" | "));
    t.check(`${w}：エラーなし`, !errors.length, errors.join(" | "));
    await browser.close();
  }
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
