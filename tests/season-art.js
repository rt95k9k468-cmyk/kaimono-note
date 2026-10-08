/* 季節の絵（3.0 の E1、docs/roadmap-3.0.md・docs/season-art.md。2026年10月6日）。
   daily は写真（Wikimedia Commons・img/season-photo/）、ノートは広重『名所江戸百景』（NDL・img/season/）。
   どちらも72候すべてに一枚ずつ（2026年10月7日、利用者が見比べて選んだ）。見るのは：
   - 72候のどれも絵と出どころ（題・作者・所蔵・URL・理由）を持ち、絵のファイルが揃っている
   - 72候のどれも色を持つ。隣の候と同じ色ではない（候ごとに変わる）
   - daily の画面に、選んでいる日の候の色と写真が敷かれる。過去の日を開けばその日の候
   - ノートの地に、今日の候の色と広重が敷かれる。ノートの設定で外せる
   - 読めない絵（オフラインでまだ持っていない）では色だけ（data-season-img なし）
   - 出典の頭に NDL の求める一行
   - 敷くのは daily の画面だけ（ほかのタブには無い）・紙の後ろ（z-index -1、押す邪魔をしない）
   - 設定で外せる（既定は入）
   - 字の濃さの比：本文の字と、背景のいちばん濃い所で 4.5:1 以上（明るい面・暗い面）
   - 大きさ：img/season/ は1枚25KB・合計2MB、img/season-photo/ は1枚120KB・合計9MBまで。img/ 全体は .webp だけ・
     1枚180KB・合計12MBまで（門で見張る）
   - sw.js は絵を別の名前のキャッシュ（kaimono-note- で始めない）に覚え、activate で前の名前の置き場を消す
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/season-art.js */
const fs = require("fs");
const path = require("path");
const { open, checker } = require("./lib");

const ROOT = path.resolve(__dirname, "..");

(async () => {
  const c = checker("season-art");

  /* ---- 大きさ（ファイルだけ。門） ---- */
  const filesOf = (name, oneKB, allMB) => {
    const dir = path.join(ROOT, "img", name);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.webp$/.test(f)) : [];
    const sizes = files.map((f) => fs.statSync(path.join(dir, f)).size);
    c.check(`${name}：1枚${oneKB}KBまで`, sizes.every((n) => n <= oneKB * 1024), JSON.stringify(files.filter((f, i) => sizes[i] > oneKB * 1024)));
    c.check(`${name}：合計${allMB}MBまで`, sizes.reduce((a, b) => a + b, 0) <= allMB * 1024 * 1024);
    c.check(`${name}：名前は k00〜k71`, files.every((f) => /^k([0-6]\d|7[01])\.webp$/.test(f)), JSON.stringify(files));
    return files;
  };
  const files = filesOf("season", 25, 2);
  const photos = filesOf("season-photo", 120, 9);
  /* img/ 全体：新しい置き場を足しても、うっかり大きな PNG/JPG を置いても門で止まる（空は tests/sky.js も見る） */
  const all = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.join(d, e.name)));
  walk(path.join(ROOT, "img"));
  c.check("img/：置くのは .webp だけ", all.every((f) => /\.webp$/.test(f)), JSON.stringify(all.filter((f) => !/\.webp$/.test(f)).map((f) => path.relative(ROOT, f))));
  c.check("img/：1枚180KBまで・合計12MBまで", all.every((f) => fs.statSync(f).size <= 180 * 1024)
    && all.reduce((a, f) => a + fs.statSync(f).size, 0) <= 12 * 1024 * 1024, `${(all.reduce((a, f) => a + fs.statSync(f).size, 0) / 1048576).toFixed(2)}MB`);
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const m = /const SEASON_CACHE = "([^"]+)"/.exec(sw);
  c.check("sw.js：絵と写真は別の名前のキャッシュ（kaimono-note- で始めない）", !!m && !m[1].startsWith("kaimono-note-")
    && /\/img\/season\//.test(sw) && /\/img\/season-photo\//.test(sw));
  /* 絵を同じ名前で描き直したら SEASON_CACHE の数を上げる。activate が前の置き場を消さないと、端末は古い絵を出し続ける */
  c.check("sw.js：activate が前の絵の置き場（kurashi-season- の別の名前）を消す", !!m && m[1].startsWith("kurashi-season-")
    && /k\.startsWith\("kurashi-season-"\) && k !== SEASON_CACHE/.test(sw));
  c.check("sw.js：絵は ASSETS に入れない", !/"img\/season/.test(sw.split("];")[0]));

  const { browser, page, errors } = await open({
    before: async (cx, p) => { await p.clock.setFixedTime(new Date(2026, 9, 6, 9, 0)); },
  });
  const wait = (ms) => page.waitForTimeout(ms);

  const pal = await page.evaluate(() => {
    const A = KN.seasonArt;
    const cs = Array.from({ length: 72 }, (_, k) => A.colorOf(k));
    return { cs, ok: cs.every((x) => /^#[0-9a-f]{6}$/.test(x)), same: cs.filter((x, k) => x === cs[(k + 1) % 72]).length,
             art: Object.keys(A.ART).length,
             bad: Object.entries(A.ART).filter(([k, a]) => !(a.file === A.fileOf(Number(k)) && a.title && a.author && a.holder
               && /^https:\/\/dl\.ndl\.go\.jp\/pid\/\d+$/.test(a.url) && a.why)).map(([k]) => k),
             photo: Object.keys(A.PHOTO).length,
             badPhoto: Object.entries(A.PHOTO).filter(([k, a]) => !(a.file === `img/season-photo/k${String(k).padStart(2, "0")}.webp`
               && a.title && a.author && a.why && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(a.url)
               && /^(CC0|Public domain|CC BY(-SA)? [\d.]+)$/.test(a.license))).map(([k]) => k),
             src: A.SOURCE };
  });
  c.check("72候すべてに絵と出どころ（題・作者・所蔵・URL・理由）", pal.art === 72 && pal.bad.length === 0, JSON.stringify(pal.bad));
  c.check("絵のファイルが72枚そろう", files.length === 72, String(files.length));
  c.check("72候すべてに写真と出どころ（題・作者・ライセンス・Commons の URL・理由）", pal.photo === 72 && pal.badPhoto.length === 0, JSON.stringify(pal.badPhoto));
  c.check("写真のファイルが72枚そろう", photos.length === 72, String(photos.length));
  c.check("出典の頭に NDL の求める一行", /^出典：国立国会図書館「NDLイメージバンク」\(https:\/\/www\.ndl\.go\.jp\/imagebank\)$/.test(pal.src || ""), pal.src);
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
  await page.waitForFunction(() => document.querySelector("#screen-archive").hasAttribute("data-season-img"), null, { timeout: 5000 }).catch(() => {});
  r = await read();
  c.check("今日の候の写真が読めて重なる（daily は写真）", r.img && r.bg.includes(`season-photo/k${String(r.want).padStart(2, "0")}.webp`), r.bg.slice(0, 200));
  /* 相対 URL は var() を使う css/screens.css から解決され css/img/season/… の 404 になる（10/6 まで絵が出ていなかった） */
  const imgUrl = (/url\("([^"]+)"\)/.exec(r.bg) || [])[1] || "";
  c.check("写真の URL は配信元の img/season-photo/（css/ の下ではない）・読める", !/\/css\/img\//.test(imgUrl)
    && await page.evaluate((u) => fetch(u).then((x) => x.ok, () => false), imgUrl), imgUrl);
  c.check("紙の地に敷く（中身の後ろ。押す的は増えない）", (r.bg.match(/linear-gradient/g) || []).length === 2, r.bg.slice(0, 120));
  c.check("月のまとめ・Daily Log の段は白く抜けない（地を透かす）", await page.evaluate(() =>
    [".card.arc-log", ".card.arc-counts", ".card.arc-list"].every((q) => { const e = document.querySelector(`#screen-archive ${q}`);
      return !e || getComputedStyle(e).backgroundColor === "rgba(0, 0, 0, 0)"; })));
  c.check("ほかのタブには敷かない", await page.evaluate(() =>
    ["todo", "list", "diet"].every((s) => !document.querySelector(`#screen-${s}`).hasAttribute("data-season"))));

  /* ノート（daily の席をもう一度押す）には、今日の候の色と広重 */
  await page.click('.tab[data-tab="archive"]');
  await page.waitForFunction(() => document.querySelector("#screen-notes").hasAttribute("data-season-img"), null, { timeout: 5000 }).catch(() => {});
  const readNotes = () => page.evaluate(() => {
    const el = document.querySelector("#screen-notes");
    return { k: el.getAttribute("data-season"), img: el.hasAttribute("data-season-img"), bg: getComputedStyle(el).backgroundImage,
             want: KN.season.of(KN.util.todayKey()).k, c: el.style.getPropertyValue("--season-c") };
  });
  let rn = await readNotes();
  c.check("ノートの地に今日の候の色と広重", rn.k === String(rn.want) && rn.img && rn.c === await page.evaluate((k) => KN.seasonArt.colorOf(k), rn.want)
    && rn.bg.includes(`/img/season/k${String(rn.want).padStart(2, "0")}.webp`) && (rn.bg.match(/linear-gradient/g) || []).length === 2, JSON.stringify(rn).slice(0, 240));
  await page.evaluate(() => { KN.store.update((s) => { s.settings.notesSeasonArt = false; }); KN.screens.notes.render(); });
  c.check("ノートの設定で外せば敷かない（daily はそのまま）", await page.evaluate(() => !document.querySelector("#screen-notes").hasAttribute("data-season")
    && document.querySelector("#screen-archive").hasAttribute("data-season")));
  await page.evaluate(() => { KN.store.update((s) => { delete s.settings.notesSeasonArt; }); KN.screens.notes.render(); });
  c.check("ノートも既定は入", await page.evaluate(() => document.querySelector("#screen-notes").hasAttribute("data-season")));
  await page.click('.tab[data-tab="archive"]');
  await wait(900);

  /* 過去の日（夏至のころ）を開けばその日の候 */
  await page.evaluate(() => KN.app.showScreen("archive"));
  const past = "2026-06-25";
  await page.evaluate((d) => { const S = KN.screens.archive; if (S.goDay) S.goDay(d); }, past);
  const goDayOk = await page.evaluate(() => !!KN.screens.archive.goDay);
  if (goDayOk) {
    /* 候の色は --m-season でゆっくり移る。移すのは紙の --season-k（受け継がない）だけで、画面（受け継ぐ）は移さない
       （画面ごと毎フレーム当てはめ直さない。inspection.md の 1）。移る途中で紙を組み直しても、続きから移る。 */
    const fade = await page.evaluate(async () => {
      const el = document.querySelector("#screen-archive");
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 200)));
      const on = (x) => x.getAnimations().filter((a) => a.effect && a.effect.getKeyframes().some((f) => "--season-k" in f));
      const sheet = el.querySelector(".tl-sheet.is-daily");
      const a = on(sheet)[0];
      const mid = getComputedStyle(sheet).getPropertyValue("--season-k").trim();
      const t1 = a ? a.currentTime : -1;
      KN.screens.archive.render();
      await Promise.resolve();
      const sheet2 = el.querySelector(".tl-sheet.is-daily");
      const b = on(sheet2)[0];
      return { sheet: !!a, mid, end: el.style.getPropertyValue("--season-c"), screen: getComputedStyle(el).transitionProperty,
               screenAnims: el.getAnimations().map((x) => x.animationName || x.transitionProperty).filter((n) => /season/.test(n)), fresh: sheet2 !== sheet, t1, t2: b ? b.currentTime : -1 };
    });
    c.check("候が変わると、紙の色だけゆっくり移る（画面は移さない）", fade.sheet && fade.t1 > 0 && fade.mid
      && !/season/.test(fade.screen) && fade.screenAnims.length === 0, JSON.stringify(fade));
    c.check("移る途中で紙を組み直しても、続きから移る", fade.fresh && fade.t2 >= fade.t1, JSON.stringify(fade));
    await wait(1400);
    r = await read();
    c.check("過去の日を開けば、その日の候の色", r.k === String(r.want) && r.want === (await page.evaluate((d) => KN.season.of(d).k, past)), JSON.stringify(r));
  } else {
    c.check("過去の日を開けば、その日の候の色", false, "KN.screens.archive.goDay がない");
  }

  /* 絵があれば重ねる（試験のあいだだけ表に一つ足す。無い絵は読めず、色だけのまま） */
  const withImg = await page.evaluate(async () => {
    const A = KN.seasonArt;
    const el = document.querySelector("#screen-archive");
    const k = Number(el.getAttribute("data-season"));
    const keep = A.PHOTO[k];
    A.PHOTO[k] = { file: "img/season-photo/__no_such__.webp", title: "t", author: "a", license: "CC0", url: "u" };
    A.apply(el, KN.screens.archive.day(), "daily");
    await new Promise((res) => setTimeout(res, 600));
    const img = el.hasAttribute("data-season-img");
    A.PHOTO[k] = keep;
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
  const contrast = async (sel = "#screen-archive", ground = "--c-sheet") => page.evaluate(([sel, ground]) => {
    const el = document.querySelector(sel);
    const css = getComputedStyle(el);
    const probe = document.createElement("div");
    document.body.append(probe);
    const rgbOf = (v) => { probe.style.color = ""; probe.style.color = v; const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
    const bg = rgbOf(getComputedStyle(document.documentElement).getPropertyValue(ground).trim());
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
  }, [sel, ground]);
  let ct = await contrast();
  c.check("明るい面：本文の字と背景のいちばん濃い所で 4.5:1 以上", ct.worst >= 4.5, JSON.stringify(ct));
  c.check("明るい面：見出し（主色の大きな太字）は 3:1 以上", ct.head >= 3, JSON.stringify(ct));
  const cn = await contrast("#screen-notes", "--c-bg");
  c.check("ノートの地（明るい面）：本文の字 4.5:1・主色 3:1 以上", cn.worst >= 4.5 && cn.head >= 3, JSON.stringify(cn));
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await wait(200);
  ct = await contrast();
  c.check("暗い面：本文の字と背景のいちばん濃い所で 4.5:1 以上（さらに薄く）", ct.worst >= 4.5 && ct.tint < 38 && ct.head >= 3, JSON.stringify(ct));
  const cnd = await contrast("#screen-notes", "--c-bg");
  c.check("ノートの地（暗い面）：4.5:1 以上（さらに薄く）", cnd.worst >= 4.5 && cnd.tint < 38 && cnd.head >= 3, JSON.stringify(cnd));
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

  c.check("daily に評価の言葉を出さない", await page.evaluate(() => !/目標|連続|平均|先月/.test(document.querySelector("#screen-archive").textContent)));
  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();
  c.done();
})();
