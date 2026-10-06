/* 季節の絵（3.0 の E1、docs/roadmap-3.0.md・docs/season-art.md。2026年10月6日）。
   絵はまだ無い（E0 が開いていない）ので、いまは候ごとの色だけ。見るのは：
   - 72候のどれも色（か絵）を持つ。隣の候と同じ色ではない（候ごとに変わる）
   - daily の画面に、選んでいる日の候の色が敷かれる。過去の日を開けばその日の候
   - 絵の無い候・読めない絵では色だけ（data-season-img なし）
   - 敷くのは daily の画面だけ（ほかのタブには無い）・紙の後ろ（z-index -1、押す邪魔をしない）
   - 設定で外せる（既定は入）
   - 字の濃さの比：本文の字と、背景のいちばん濃い所で 4.5:1 以上（明るい面・暗い面）
   - 大きさ：img/season/*.webp は1枚25KB・合計2MBまで（門で見張る）
   - sw.js は絵を別の名前のキャッシュ（kaimono-note- で始めない）に覚える
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/season-art.js */
const fs = require("fs");
const path = require("path");
const { open, checker } = require("./lib");

const ROOT = path.resolve(__dirname, "..");

(async () => {
  const c = checker("season-art");

  /* ---- 大きさ（ファイルだけ。門） ---- */
  const dir = path.join(ROOT, "img", "season");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.webp$/.test(f)) : [];
  const sizes = files.map((f) => fs.statSync(path.join(dir, f)).size);
  c.check("絵は1枚25KBまで", sizes.every((n) => n <= 25 * 1024), JSON.stringify(files.filter((f, i) => sizes[i] > 25 * 1024)));
  c.check("絵は合計2MBまで", sizes.reduce((a, b) => a + b, 0) <= 2 * 1024 * 1024);
  c.check("絵の名前は k00〜k71", files.every((f) => /^k([0-6]\d|7[01])\.webp$/.test(f)), JSON.stringify(files));
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const m = /const SEASON_CACHE = "([^"]+)"/.exec(sw);
  c.check("sw.js：絵は別の名前のキャッシュ（kaimono-note- で始めない）", !!m && !m[1].startsWith("kaimono-note-") && /\/img\/season\//.test(sw));
  c.check("sw.js：絵は ASSETS に入れない", !/"img\/season/.test(sw.split("];")[0]));

  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 9, 0)); },
  });
  const wait = (ms) => page.waitForTimeout(ms);

  const pal = await page.evaluate(() => {
    const A = KN.seasonArt;
    const cs = Array.from({ length: 72 }, (_, k) => A.colorOf(k));
    return { cs, ok: cs.every((x) => /^#[0-9a-f]{6}$/.test(x)), same: cs.filter((x, k) => x === cs[(k + 1) % 72]).length,
             art: Object.keys(A.ART).length };
  });
  c.check("72候のどれも色を持つ", pal.ok && pal.cs.length === 72, JSON.stringify(pal.cs.slice(0, 4)));
  c.check("候ごとに色が変わる（隣と同じ色が無い）", pal.same === 0, String(pal.same));

  await page.click('.tab[data-tab="archive"]');
  await wait(700);
  const read = () => page.evaluate(() => {
    const el = document.querySelector("#screen-archive");
    const sheet = el.querySelector(".tl-sheet.is-daily");
    return {
      k: el.getAttribute("data-season"), img: el.hasAttribute("data-season-img"),
      c: el.style.getPropertyValue("--season-c"),
      bg: sheet ? getComputedStyle(sheet).backgroundImage : "",
      want: KN.season.of(KN.screens.archive.day()).k,
      color: KN.seasonArt.colorOf(KN.season.of(KN.screens.archive.day()).k),
    };
  });
  let r = await read();
  c.check("daily に今日の候の色（10/6 は秋分の末候）", r.k === String(r.want) && r.c === r.color && /gradient/.test(r.bg), JSON.stringify(r));
  c.check("絵の無い候は色だけ", !r.img);
  c.check("紙の地に敷く（中身の後ろ。押す的は増えない）", (r.bg.match(/linear-gradient/g) || []).length === 2, r.bg.slice(0, 120));
  c.check("ほかのタブには敷かない", await page.evaluate(() =>
    ["todo", "list", "diet"].every((s) => !document.querySelector(`#screen-${s}`).hasAttribute("data-season"))));

  /* 過去の日（夏至のころ）を開けばその日の候 */
  await page.evaluate(() => KN.app.showScreen("archive"));
  const past = "2026-06-25";
  await page.evaluate((d) => { const S = KN.screens.archive; if (S.goDay) S.goDay(d); }, past);
  const goDayOk = await page.evaluate(() => !!KN.screens.archive.goDay);
  if (goDayOk) {
    await wait(800);
    r = await read();
    c.check("過去の日を開けば、その日の候の色", r.k === String(r.want) && r.want === (await page.evaluate((d) => KN.season.of(d).k, past)), JSON.stringify(r));
  } else {
    c.check("過去の日を開けば、その日の候の色", false, "KN.screens.archive.goDay がない");
  }

  /* 絵があれば重ねる（試験のあいだだけ表に一つ足す。無い絵は読めず、色だけのまま） */
  const withImg = await page.evaluate(async () => {
    const A = KN.seasonArt;
    const k = Number(document.querySelector("#screen-archive").getAttribute("data-season"));
    A.ART[k] = { file: "img/season/__no_such__.webp", title: "t", author: "a", holder: "h", url: "u" };
    A.apply(document.querySelector("#screen-archive"), KN.screens.archive.day());
    await new Promise((res) => setTimeout(res, 600));
    const img = document.querySelector("#screen-archive").hasAttribute("data-season-img");
    delete A.ART[k];
    return img;
  });
  c.check("読めない絵（オフライン・まだ無い）は重ねず、色だけ", withImg === false);

  /* 設定で外せる */
  await page.evaluate(() => { KN.store.update((s) => { s.settings.seasonArt = false; }); });
  await page.evaluate(() => KN.app.showScreen("todo"));
  await wait(300);
  await page.evaluate(() => KN.app.showScreen("archive"));
  await wait(600);
  c.check("設定で外せば敷かない", await page.evaluate(() => !document.querySelector("#screen-archive").hasAttribute("data-season")));
  await page.evaluate(() => { KN.store.update((s) => { delete s.settings.seasonArt; }); });
  await page.evaluate(() => KN.app.showScreen("todo"));
  await wait(300);
  await page.evaluate(() => KN.app.showScreen("archive"));
  await wait(600);
  c.check("既定は入", await page.evaluate(() => document.querySelector("#screen-archive").hasAttribute("data-season")));

  /* 字の濃さの比（背景のいちばん濃い所＝上の端。72候すべて） */
  const contrast = async () => page.evaluate(() => {
    const el = document.querySelector("#screen-archive");
    const css = getComputedStyle(el);
    const probe = document.createElement("div");
    document.body.append(probe);
    const rgbOf = (v) => { probe.style.color = ""; probe.style.color = v; const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
    const bg = rgbOf(getComputedStyle(document.documentElement).getPropertyValue("--c-sheet").trim());
    const text = rgbOf(getComputedStyle(document.documentElement).getPropertyValue("--c-text").trim());
    const prim = rgbOf(getComputedStyle(document.documentElement).getPropertyValue("--c-primary").trim());
    const tint = parseFloat(css.getPropertyValue("--season-tint")) || 38;
    probe.remove();
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    let worst = 99, at = -1, head = 99;
    for (let k = 0; k < 72; k++) {
      const sc = KN.seasonArt.colorOf(k).match(/[0-9a-f]{2}/g).map((h) => parseInt(h, 16));
      const mix = sc.map((v, i) => v * tint / 100 + bg[i] * (1 - tint / 100));
      const r = ratio(mix, text);                  // 本文の字
      if (r < worst) { worst = r; at = k; }
      head = Math.min(head, ratio(mix, prim));     // 見出しの主色の字（大きな太字なので 3:1）
    }
    return { worst: Math.round(worst * 100) / 100, at, tint, head: Math.round(head * 100) / 100 };
  });
  let ct = await contrast();
  c.check("明るい面：本文の字と背景のいちばん濃い所で 4.5:1 以上", ct.worst >= 4.5, JSON.stringify(ct));
  c.check("明るい面：見出し（主色の大きな太字）は 3:1 以上", ct.head >= 3, JSON.stringify(ct));
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await wait(200);
  ct = await contrast();
  c.check("暗い面：本文の字と背景のいちばん濃い所で 4.5:1 以上（さらに薄く）", ct.worst >= 4.5 && ct.tint < 38 && ct.head >= 3, JSON.stringify(ct));
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

  c.check("daily に評価の言葉を出さない", await page.evaluate(() => !/目標|連続|平均|先月/.test(document.querySelector("#screen-archive").textContent)));
  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
