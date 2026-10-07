/* 帯の空（docs/sky.md・js/sky.js。2026年10月7日）。見るのは：
   - 日の出・日の入り（東京）が暦の表と数分で合う（夏至・10/7・冬至）
   - 時間帯の区切り：朝＝日の出30分前〜10時・昼＝〜日の入り1時間前・夕方＝〜日の入り30分後・ほかは夜。
     夏の18時半は夕方（まだ明るい）・冬の17時半は夜（もう暗い）——決まった時刻では言えないもの
   - 次に替わる時刻は、その区切りちょうど（夜なら翌朝）
   - 端末の時間帯が日本でなければ、その時間帯の経度で測る（UTC の昼は昼・夜中は夜）
   - #head に札（data-sky）だけ。:root にも #head にもカスタムプロパティを書かない
   - 帯と暦は地を透かす。札の無いとき（設定で外した）は塗る（いままでどおり）
   - 戻ってきたとき（visibilitychange）に測り直す
   - 設定で外せる（既定は入）
   - 字の濃さの比（画面の画素で）：題の段の字と絵は 3:1 以上。暦の字は 4.5:1 以上（もともとそれ未満の
     字は、空の無いときの比より下げない）。四つの時間帯 × 明るい面・暗い面 × 週・月
   - ノートへ移るとき、帯の裏へ上がった暦は帯の中に見えない（帯が透けても）
   - 紙の丸角の外は空。タブを流す途中も、二枚は並んで流れ、あいだの角に空（角は画面が持つ）
   - いちばん上で引いて紙が下がっても、すき間は空（週・月）。空を下へ伸ばしても帯の中の写真は動かない
   - 写真（段2）：4枚が img/sky/ にあり1枚25KBまで・出典（作者・ライセンス・URL）がそろう・sw.js は別の名前の
     キャッシュへ（ASSETS に入れない）。読めてから data-sky-img が付き、写真が敷かれる。読めない写真は付かず、
     描いた空のまま。設定で外せば両方の札が外れる。字の濃さの比は、写真を敷いた状態でも同じ決まり
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/sky.js */
const fs = require("fs");
const path = require("path");
const { open, checker, ROOT } = require("./lib");

const JST = (s) => new Date(`${s}+09:00`);
const hm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;

const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/* 計算された色（rgb(…) か color(srgb …)）を 0〜255 の三つに */
function rgbOf(s) {
  const n = (s.match(/[\d.]+/g) || []).map(Number);
  return /^color\(srgb/.test(s) ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
}

(async () => {
  const c = checker("sky");

  /* ---- 読むだけ ---- */
  const js = fs.readFileSync(path.join(ROOT, "js/sky.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  c.check("js は札だけ書く（カスタムプロパティを書かない）", !/setProperty|setVar|\.style\b/.test(js));
  const SLOTS4 = ["morning", "day", "evening", "night"];
  const sizes = SLOTS4.map((s) => { const f = path.join(ROOT, "img/sky", `${s}.webp`); return fs.existsSync(f) ? fs.statSync(f).size : 0; });
  c.check("写真：img/sky/ に4枚、1枚25KBまで", sizes.every((n) => n > 0 && n <= 25 * 1024), sizes.join(" / "));
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const assets = (sw.match(/const ASSETS = \[([\s\S]*?)\];/) || [])[1] || "";
  c.check("写真：sw.js は別の名前のキャッシュへ（ASSETS に入れない）", /\/img\/sky\//.test(sw) && !/img\/sky/.test(assets));

  const { browser, page, errors } = await open({
    timezoneId: "Asia/Tokyo",
    before: async (cx, p) => {
      await p.clock.setFixedTime(JST("2026-10-07T12:00:00"));
      await p.emulateMedia({ reducedMotion: "reduce" });   // 色の移りを待たない
    },
  });
  const wait = (ms) => page.waitForTimeout(ms);

  /* ---- 日の出・日の入り（東京。国立天文台の暦の値） ---- */
  const REF = [["2026-06-21", 4 * 60 + 25, 19 * 60], ["2026-10-07", 5 * 60 + 39, 17 * 60 + 17], ["2026-12-22", 6 * 60 + 47, 16 * 60 + 32]];
  for (const [d, rise, set] of REF) {
    const s = await page.evaluate((iso) => KN.sky.sunOf(new Date(iso)), `${d}T12:00:00+09:00`);
    c.check(`${d} の日の出・日の入り（東京）が表と4分以内`, Math.abs(s.rise - rise) <= 4 && Math.abs(s.set - set) <= 4, `${hm(s.rise)} / ${hm(s.set)}`);
  }

  /* ---- 区切り ---- */
  const SLOT = [
    ["2026-10-07T00:00", "night"], ["2026-10-07T05:05", "night"], ["2026-10-07T05:15", "morning"], ["2026-10-07T09:59", "morning"],
    ["2026-10-07T10:00", "day"], ["2026-10-07T16:10", "day"], ["2026-10-07T16:25", "evening"], ["2026-10-07T17:40", "evening"],
    ["2026-10-07T17:55", "night"], ["2026-10-07T23:59", "night"],
    ["2026-06-21T04:00", "morning"], ["2026-06-21T18:30", "evening"], ["2026-06-21T19:20", "evening"],
    ["2026-12-22T06:30", "morning"], ["2026-12-22T16:00", "evening"], ["2026-12-22T17:30", "night"],
  ];
  const got = await page.evaluate((xs) => xs.map(([t]) => KN.sky.slotOf(new Date(`${t}:00+09:00`))), SLOT);
  SLOT.forEach(([t, want], i) => c.check(`${t.replace("T", " ")} は ${want}`, got[i] === want, got[i]));

  const nx = await page.evaluate(() => {
    const S = KN.sky, noon = S.nextChange(new Date("2026-10-07T12:00:00+09:00"));
    return { before: S.slotOf(new Date(noon - 1000)), after: S.slotOf(new Date(+noon + 1000)),
             night: S.nextChange(new Date("2026-10-07T20:00:00+09:00")).toISOString() };
  });
  c.check("昼の次は、夕方の始まりちょうど", nx.before === "day" && nx.after === "evening", JSON.stringify(nx));
  const nightNext = new Date(nx.night);
  c.check("夜の次は翌朝（日の出の30分前）", nightNext > JST("2026-10-08T04:50:00") && nightNext < JST("2026-10-08T05:30:00"), nx.night);

  /* ---- 札 ---- */
  await page.evaluate(() => KN.app.showScreen("todo"));
  await wait(400);
  const attr = () => page.evaluate(() => document.getElementById("head").getAttribute("data-sky"));
  const bgs = () => page.evaluate(() => {
    const cal = document.querySelector("#head .cal");
    return { top: getComputedStyle(document.querySelector("#head > .topbar")).backgroundColor,
             cal: cal ? getComputedStyle(cal).backgroundColor : "",
             head: getComputedStyle(document.getElementById("head"), "::before").backgroundImage };
  });
  c.check("#head に札（12時は昼）", await attr() === "day", String(await attr()));
  const cr = await page.evaluate(() => KN.sky.credits());
  c.check("写真の出典：4枚とも作者・ライセンス・Commons の URL・ファイルが札どおり", cr.length === 4 && cr.every((x) =>
    x.author && /^(CC0|Public domain|CC BY(-SA)? [\d.]+)$/.test(x.license) && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(x.url)
    && x.file === `img/sky/${x.slot}.webp`), JSON.stringify(cr.map((x) => [x.slot, x.license])));
  const imgAttr = () => page.evaluate(() => document.getElementById("head").getAttribute("data-sky-img"));
  await page.waitForFunction(() => document.getElementById("head").getAttribute("data-sky-img") === "day", null, { timeout: 5000 }).catch(() => {});
  c.check("写真が読めたら data-sky-img に同じ札、写真が敷かれる", await imgAttr() === "day"
    && /img\/sky\/day\.webp/.test((await bgs()).head), JSON.stringify(await bgs()));
  let b = await bgs();
  c.check("帯と暦は地を透かし、#head に空", b.top === "rgba(0, 0, 0, 0)" && b.cal === "rgba(0, 0, 0, 0)" && /linear-gradient/.test(b.head), JSON.stringify(b));
  c.check(":root にも #head にもカスタムプロパティを書かない", await page.evaluate(() =>
    !/--sky/.test(document.documentElement.getAttribute("style") || "") && !/--sky/.test(document.getElementById("head").getAttribute("style") || "")));

  await page.clock.setFixedTime(JST("2026-10-07T17:00:00"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  c.check("戻ってきたら測り直す（17時は夕方）", await attr() === "evening", String(await attr()));

  await page.evaluate(() => KN.store.update((s) => { s.settings.sky = false; }));
  await wait(150);
  b = await bgs();
  c.check("設定で外せば札が無く、帯と暦は地を塗る（いままでどおり）", await attr() === null && await imgAttr() === null && b.top !== "rgba(0, 0, 0, 0)"
    && b.cal !== "rgba(0, 0, 0, 0)" && !/gradient/.test(b.head), JSON.stringify(b));
  await page.evaluate(() => KN.store.update((s) => { delete s.settings.sky; }));
  await wait(150);
  c.check("既定は入", await attr() === "evening", String(await attr()));

  /* 朝の写真は読めないことにする（オフラインで持っていない。昼・夕方のあとに先読みされるのは次の時間帯だけ） */
  await page.route("**/img/sky/morning.webp", (r) => r.abort());
  await page.clock.setFixedTime(JST("2026-10-08T06:00:00"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await wait(400);
  b = await bgs();
  c.check("読めない写真は札が付かず、描いた空のまま（6時は朝）", await attr() === "morning" && await imgAttr() !== "morning"
    && !/url\(/.test(b.head) && /linear-gradient/.test(b.head), JSON.stringify(b));
  await page.unroute("**/img/sky/morning.webp");

  /* ---- 画素 ---- */
  async function pixels(buf, pts) {
    return page.evaluate(async ({ b64, pts }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const at = (v, max) => Math.min(max - 1, Math.max(0, Math.round(v)));
      return pts.map(([x, y]) => Array.from(g.getImageData(at(x, img.width), at(y, img.height), 1, 1).data.slice(0, 3)));
    }, { b64: buf.toString("base64"), pts });
  }
  async function hide(css) {
    await page.evaluate((t) => {
      let s = document.getElementById("sky-test-hide");
      if (!s) { s = document.createElement("style"); s.id = "sky-test-hide"; document.head.append(s); }
      s.textContent = t;
    }, css);
    await wait(60);
  }

  /* 字の箱（題の段：題の字と絵／暦の段：曜日と日の数字。今日を塗った丸の中の字は除く） */
  async function measure() {
    const m = await page.evaluate(() => {
      const head = document.getElementById("head");
      const hr = head.getBoundingClientRect();
      const probe = document.createElement("i");
      document.body.append(probe);
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim();
      const bg = getComputedStyle(probe).color;
      probe.remove();
      const pick = (sel, zone) => Array.from(head.querySelectorAll(sel)).filter((e) => {
        const cs = getComputedStyle(e);
        return e.getClientRects().length && cs.visibility !== "hidden" && Number(cs.opacity) > 0;
      }).map((e) => {
        const r = e.getBoundingClientRect();
        return { sel, zone, color: getComputedStyle(e).color, x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
      }).filter((x) => x.w > 0 && x.h > 0 && x.y >= 0 && x.y + x.h <= hr.height);
      return { bg, w: hr.width, h: hr.height, top: hr.top, list: [
        ...pick('.topbar [class^="day-"]', "title"), ...pick(".topbar svg", "title"),
        ...pick(".cal-wd", "cal"), ...pick(".cal-day:not(.is-here.is-today) .cal-n", "cal")] };
    });
    await hide("#head * { visibility: hidden !important; }");
    const buf = await page.screenshot({ clip: { x: 0, y: m.top, width: m.w, height: m.h } });
    const F = [[0.2, 0.25], [0.8, 0.25], [0.5, 0.5], [0.2, 0.75], [0.8, 0.75]];
    const pts = m.list.flatMap((x) => F.map(([fx, fy]) => [x.x + x.w * fx, x.y + x.h * fy]));
    pts.push([m.w / 2, m.h - 1]);
    const px = await pixels(buf, pts);
    await hide("");
    const bg = rgbOf(m.bg);
    let worst = null;
    m.list.forEach((x, i) => {
      const col = rgbOf(x.color);
      const r = Math.min(...px.slice(i * F.length, (i + 1) * F.length).map((p) => ratio(col, p)));
      const need = x.zone === "title" ? 3 : Math.min(4.5, ratio(col, bg)) - 0.01;
      const margin = r - need;
      if (!worst || margin < worst.margin) worst = { margin: Math.round(margin * 100) / 100, r: Math.round(r * 100) / 100, need: Math.round(need * 100) / 100, sel: x.sel, color: x.color };
    });
    const edge = px[px.length - 1];
    return { worst, n: m.list.length, edge, edgeOk: edge.every((v, i) => Math.abs(v - bg[i]) <= 3) };
  }

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => { if (t === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme"); }, theme);
    for (const month of [false, true]) {
      await page.evaluate((o) => KN.store.setCalPref(null, { open: o }), month);
      await page.evaluate(() => KN.app.showScreen("list"));
      await wait(250);
      await page.evaluate(() => KN.app.showScreen("todo"));
      await wait(500);
      for (const slot of SLOTS4) for (const photo of [false, true]) {
        await page.evaluate(async ([s, photo]) => {
          const h = document.getElementById("head");
          h.setAttribute("data-sky", s);
          if (!photo) { h.removeAttribute("data-sky-img"); return; }
          const img = new Image();
          img.src = `img/sky/${s}.webp`;
          await img.decode();
          h.setAttribute("data-sky-img", s);
        }, [slot, photo]);
        await wait(photo ? 150 : 80);
        if (photo) {
          const bg = await page.evaluate(() => getComputedStyle(document.getElementById("head"), "::before").backgroundImage);
          c.check(`${theme}・${month ? "月" : "週"}・${slot}：写真が敷かれている`, bg.includes(`img/sky/${slot}.webp`), bg.slice(0, 120));
        }
        const r = await measure();
        if (process.env.KN_VERBOSE) console.log(`      ${theme} ${month ? "月" : "週"} ${slot}${photo ? " 写真" : ""} ${JSON.stringify(r.worst)}`);
        const name = `${theme === "dark" ? "暗い面" : "明るい面"}・${month ? "月" : "週"}・${slot}${photo ? "・写真" : ""}`;
        c.check(`${name}：字の濃さの比（題 3:1・暦は空の無いときより下げない）`, r.n >= 10 && r.worst && r.worst.margin >= 0, JSON.stringify(r));
      }
    }
  }
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await page.evaluate(() => KN.store.setCalPref(null, { open: false }));
  await page.evaluate(() => KN.app.showScreen("list"));
  await wait(250);
  await page.evaluate(() => KN.app.showScreen("todo"));
  await wait(500);

  /* ---- ノートへ移る途中：上がった暦は帯の中に見えない ---- */
  await page.evaluate(() => document.getElementById("head").setAttribute("data-sky", "night"));
  await page.evaluate(() => {
    const s = document.getElementById("screens");
    s.style.setProperty("--face-lift", document.querySelector("#head .head-cal").getBoundingClientRect().height + "px");
    s.style.setProperty("--face-p", "0.5");
    s.classList.add("is-notes-lift");
  });
  await wait(100);
  const tb = await page.evaluate(() => { const r = document.querySelector("#head > .topbar").getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  await hide("#head > .topbar * { visibility: hidden !important; }");
  const shotA = await page.screenshot({ clip: tb });
  await hide("#head > .topbar * { visibility: hidden !important; } #head > .head-cal { visibility: hidden !important; }");
  const shotB = await page.screenshot({ clip: tb });
  await hide("");
  const grid = [];
  for (let y = 1; y < tb.height; y += 3) for (let x = 2; x < tb.width; x += 6) grid.push([x, y]);
  const pa = await pixels(shotA, grid), pb = await pixels(shotB, grid);
  const diff = Math.max(...pa.map((p, i) => Math.max(...p.map((v, k) => Math.abs(v - pb[i][k])))));
  c.check("ノートへ移る途中、上がった暦は帯の中に見えない", diff <= 3, `最大の差 ${diff}`);
  await page.evaluate(() => {
    const s = document.getElementById("screens");
    s.classList.remove("is-notes-lift");
    ["--face-lift", "--face-p"].forEach((k) => s.style.removeProperty(k));
  });

  /* ---- 紙の丸角の外にも空（帯の後ろの一枚が紙の角の半径だけ下へはみ出す。地の色の白い角を作らない） ---- */
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => { if (t === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme"); }, theme);
    await page.evaluate(async () => {
      const h = document.getElementById("head");
      h.setAttribute("data-sky", "evening");
      const img = new Image(); img.src = "img/sky/evening.webp"; await img.decode();
      h.setAttribute("data-sky-img", "evening");
    });
    await wait(150);
    const k = await page.evaluate(() => {
      const probe = document.createElement("i");
      document.body.append(probe);
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim();
      const bg = getComputedStyle(probe).color;
      probe.remove();
      return { hb: document.getElementById("head").getBoundingClientRect().bottom, bg };
    });
    const px = await pixels(await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: Math.ceil(k.hb) + 30 } }),
      [[1, k.hb + 1.5], [388, k.hb + 1.5], [1, k.hb - 3], [388, k.hb - 3]]);
    const bgc = rgbOf(k.bg);
    const far = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    c.check(`${theme === "dark" ? "暗い面" : "明るい面"}：紙の丸角の外は空（地の色でない・すぐ上の空に近い）`,
      far(px[0], bgc) > 6 && far(px[1], bgc) > 6 && far(px[0], px[2]) < 40 && far(px[1], px[3]) < 40, JSON.stringify({ px, bg: bgc }));
  }
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

  /* ---- タブを流す途中も丸角（角は画面が持ち、空は画面の後ろ。二枚は同じ曲線で並んで流れる） ---- */
  await page.emulateMedia({ reducedMotion: "no-preference" });   // ここだけは流す
  await page.evaluate(() => { KN.app.showScreen("todo"); document.getAnimations().forEach((a) => a.finish()); });
  await wait(400);
  const sl = await page.evaluate(() => {
    KN.app.showScreen("list");
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 70; });
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const probe = document.createElement("i");
    document.body.append(probe);
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--c-sheet").trim();
    const sheet = getComputedStyle(probe).color;
    probe.remove();
    return { out: r("screen-todo").right, in: r("screen-list").left, sheet };
  });
  c.check("タブを流す途中、二枚は並んで流れる（重ならない）", sl.in > 20 && sl.in < 370 && Math.abs(sl.out - sl.in) < 1, JSON.stringify(sl));
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
  await wait(400);
  /* 角の画素は、二枚を手で並べて止めて測る（合成側で走る動きは、止めた時刻と撮った画がずれることがある）。
     二つの角（左の紙の右上・右の紙の左上）の外、紙の上端から 3px。 */
  const sj = await page.evaluate(() => {
    const [a, b] = ["screen-todo", "screen-list"].map((id) => document.getElementById(id));
    a.hidden = false; a.style.display = "flex"; a.style.transform = "translateX(-200px)"; b.style.transform = "translateX(190px)";
    const top = (el) => el.querySelector(".tl-sheet").getBoundingClientRect().top;
    return { hb: document.getElementById("head").getBoundingClientRect().bottom, ta: top(a), tb: top(b) };
  });
  await wait(80);
  const spx = await pixels(await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: Math.ceil(sj.hb) + 30 } }),
    [[192, sj.tb + 3], [190, sj.hb - 3], [188, sj.ta + 3]]);
  await page.evaluate(() => {
    const [a, b] = ["screen-todo", "screen-list"].map((id) => document.getElementById(id));
    a.style.display = ""; a.style.transform = ""; a.hidden = true; b.style.transform = "";
  });
  const sfar = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  c.check("タブを流す途中、あいだの角は空（紙の色でない・すぐ上の空に近い）",
    sfar(spx[0], rgbOf(sl.sheet)) > 6 && sfar(spx[2], rgbOf(sl.sheet)) > 6 && sfar(spx[0], spx[1]) < 40 && sfar(spx[2], spx[1]) < 40, JSON.stringify(spx));
  await page.emulateMedia({ reducedMotion: "reduce" });

  /* ---- いちばん上でさらに引いて紙が下がっても（pull-refresh の give、最大 76px）、すき間は空（地の白を出さない）。
     月に開いていても（写真の下端より下は写真の地面の色 --sky-g で続く）。空を下へ伸ばしても写真の位置は据え置き ---- */
  const bgc = await page.evaluate(() => {
    const probe = document.createElement("i");
    document.body.append(probe);
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim();
    const v = getComputedStyle(probe).color;
    probe.remove();
    return v;
  });
  for (const month of [false, true]) {
    await page.evaluate((o) => KN.store.setCalPref(null, { open: o }), month);
    for (const id of month ? ["todo"] : ["archive", "todo", "list"]) {
      await page.evaluate((i) => KN.app.showScreen(i), id);
      await wait(300);
      const hb = await page.evaluate((i) => {
        KN.app.scrollerOf(document.getElementById("screen-" + i)).style.transform = "translate3d(0, 76px, 0)";
        return document.getElementById("head").getBoundingClientRect().bottom;
      }, id);
      await wait(80);
      const gp = await pixels(await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: Math.ceil(hb) + 90 } }),
        [[195, hb + 40], [20, hb + 72], [370, hb + 72]]);
      await page.evaluate((i) => { KN.app.scrollerOf(document.getElementById("screen-" + i)).style.transform = ""; }, id);
      const far = (a, b) => Math.max(...a.map((v, k) => Math.abs(v - b[k])));
      c.check(`${month ? "月" : "週"}・${id}：上で引いて紙が下がっても、すき間は空（地の色でない）`,
        gp.every((p) => far(p, rgbOf(bgc)) > 12 && far(p, rgbOf(sl.sheet)) > 12), JSON.stringify(gp));
    }
  }
  await page.evaluate(() => KN.store.setCalPref(null, { open: false }));
  await wait(300);
  const hbs = await page.evaluate(() => Math.floor(document.getElementById("head").getBoundingClientRect().bottom) - 2);
  const shot1 = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: hbs } });
  await page.evaluate(() => document.getElementById("deck").style.setProperty("--sky-more", "0px"));
  await wait(80);
  const shot0 = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: hbs } });
  await page.evaluate(() => document.getElementById("deck").style.removeProperty("--sky-more"));
  const pgrid = [];
  for (let y = 1; y < hbs; y += 4) for (let x = 2; x < 390; x += 8) pgrid.push([x, y]);
  const q1 = await pixels(shot1, pgrid), q0 = await pixels(shot0, pgrid);
  const pdiff = Math.max(...q1.map((p, i) => Math.max(...p.map((v, k) => Math.abs(v - q0[i][k])))));
  c.check("空を下へ伸ばしても、帯の中の写真は動かない", pdiff <= 4, `最大の差 ${pdiff}`);

  /* ---- 時計の帯は default（black-translucent は iOS 26 で画面の下に塗れない空白を残す。docs/sky.md） ---- */
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  c.check("時計の帯は default（black-translucent に戻さない）", /apple-mobile-web-app-status-bar-style" content="default"/.test(html));

  c.check("ページのエラーが無い", errors.length === 0, errors.join(" / "));
  await browser.close();

  /* ---- 日本の外 ---- */
  const utc = await open({ timezoneId: "UTC", before: async (cx, p) => { await p.clock.setFixedTime(new Date("2026-10-07T12:00:00Z")); } });
  const u = await utc.page.evaluate(() => ({
    noon: KN.sky.slotOf(new Date("2026-10-07T12:00:00Z")), late: KN.sky.slotOf(new Date("2026-10-07T23:00:00Z")),
    rise: KN.sky.sunOf(new Date("2026-10-07T12:00:00Z")).rise }));
  c.check("日本の外（UTC）では、その時間帯の経度で測る（昼は昼・夜中は夜）", u.noon === "day" && u.late === "night"
    && u.rise > 5 * 60 && u.rise < 7 * 60, JSON.stringify(u));
  await utc.browser.close();
  c.done();
})();
