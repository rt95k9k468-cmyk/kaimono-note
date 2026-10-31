/* 幅の物差し（docs/log/design-review.md 10節の P1）。iPhone・iPad・パソコン（Windows）の幅で、五つの席を見る：
   - はみ出し：頁が横に伸びない。窓の外へ出た字・押すところが無い（中で送る列・切る箱の中は数えない）
   - 灰の帯：アプリの地は窓いっぱい（640〜839px は前は 620px の一列＋左右に灰の帯だった＝W1）
   - 読む幅：640px から中身は真ん中の一列（640〜839 は 680px、840〜 は 760px）
   - 帯と＋：下の帯（〜839px）のカプセルは窓の中、640px から 600px で真ん中、＋はカプセルの上でその右端にそろう。
     左の列（840px〜）は窓の背いっぱい、＋は列にかぶらない
   - 11px 未満の字が無い（WAIT は段を待っているもの。数えて出すが落とさない）
   送り棒が場所を取る道（Windows。試験の Chromium は既定で棒を隠すので `open({ scrollbars: true })`）：
   中で送る器が棒のぶん狭くなっても、横に送れる器にならない・頁も伸びない。
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/widths.js */
const { open, checker } = require("./lib");

/* [幅, 背, 名前]。200% に拡大した 1440×900 は 720×450。 */
const SIZES = [[393, 852, "iPhone"], [430, 932, "iPhone Pro Max"], [720, 450, "1440×900 を 200%"], [744, 1133, "iPad mini 縦"],
  [820, 1180, "iPad 縦"], [900, 800, "並べた窓"], [1024, 768, "小さい PC"], [1032, 1376, "iPad 13 縦"], [1180, 820, "iPad 横"],
  [1366, 1024, "iPad 13 横"], [1440, 900, "PC"], [1920, 1080, "大きい PC"]];
const SEATS = ["archive", "notes", "todo", "list", "diet"];
/* 段を待っているもの。直したらここから消す。 */
const WAIT = [
  [/road-hours/, "道の時の数字（W5。P4 で、道の絵ごと一回り大きくできるときだけ）"],
  [/cal-name/, "帯の暦の用事の札 10px（W5。P4）"],
];

/* 頁の中で：出ている字・押すところを一つずつ見る。 */
function scan() {
  const vw = document.documentElement.clientWidth;
  const seen = (e) => {
    if (!e.getClientRects().length) return false;
    const cs = getComputedStyle(e);
    return cs.visibility !== "hidden" && +cs.opacity > 0.05;
  };
  /* 中で送る列・切る箱の中にいるものは、その箱が窓の中なら数えない。 */
  const clipped = (e) => {
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox !== "visible") { const r = a.getBoundingClientRect(); return r.left >= -1 && r.right <= vw + 1; }
    }
    return false;
  };
  const name = (e) => { const c = (e.getAttribute("class") || "").trim(); return `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${c ? "." + c.split(/\s+/).join(".") : ""}`; };
  /* SVG の字は絵（svg）の名前から。 */
  const path = (e) => [e.closest("svg"), e.parentElement && e.parentElement.parentElement, e.parentElement, e]
    .filter((x, i, a) => x && a.indexOf(x) === i).map(name).join(" > ");
  const out = [], small = [];
  const active = document.querySelector(".screen.is-active") || document.body;
  const roots = [active, document.querySelector("#head, .head"), document.getElementById("tabbar"), document.querySelector(".dock")].filter(Boolean);
  for (const root of roots) {
    for (const e of [root, ...root.querySelectorAll("*")]) {
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const hit = e.matches("button, a, input, textarea, select, [role=button]");
      if (!own && !hit) continue;
      if (!seen(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.bottom < 0 || r.top > innerHeight) continue;
      if ((r.left < -1 || r.right > vw + 1) && !clipped(e)) out.push(`${path(e)} ${Math.round(r.left)}〜${Math.round(r.right)}`);
      if (own) {
        let fs = parseFloat(getComputedStyle(e).fontSize);
        const svg = e.closest("svg");
        if (svg && svg.getScreenCTM()) { const m = svg.getScreenCTM(); fs *= Math.hypot(m.a, m.b); }
        if (fs < 10.95) small.push({ name: path(e), px: Math.round(fs * 10) / 10 });
      }
    }
  }
  return { out, small };
}

/** 頁が横に伸びていない。 */
const flatFn = () => {
  const w = document.documentElement.clientWidth;
  return { ok: document.scrollingElement.scrollWidth <= w + 1 && document.body.scrollWidth <= w + 1, sw: document.scrollingElement.scrollWidth, w };
};

/** 地・読む幅・帯・＋。 */
const frameFn = () => {
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const R = (e) => { if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width) }; };
  const app = R(document.querySelector(".app"));
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const appBg = getComputedStyle(document.querySelector(".app")).backgroundColor;
  const cap = R(document.querySelector("#tabbar .tab-edge"));
  const bar = R(document.getElementById("tabbar"));
  const fab = R(document.querySelector(".has-fab .dock .quick-add > button, .has-fab .dock button"));
  /* 読む幅：daily の日の一枚の中身の幅（padding を除いた箱）。 */
  const slide = document.querySelector("#screen-archive .day-slide");
  let read = null;
  if (slide && slide.getClientRects().length) {
    const cs = getComputedStyle(slide);
    read = Math.round(slide.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  }
  return { vw, vh, app, bodyBg, appBg, cap, bar, fab, read };
};

/** 中で送る器が、棒のぶん狭くなって横に送れるようになっていない。 */
const sideScrollFn = () => {
  const bad = [];
  for (const e of document.querySelectorAll(".screen.is-active *, .set-scroll")) {
    if (!e.getClientRects().length) continue;
    const cs = getComputedStyle(e);
    if (!/(auto|scroll)/.test(cs.overflowY) || e.scrollHeight <= e.clientHeight + 1) continue;
    if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.offsetWidth - e.clientWidth > 2)
      bad.push(`${e.className} ${e.scrollWidth}>${e.clientWidth}（棒 ${e.offsetWidth - e.clientWidth}px）`);
  }
  return bad;
};

async function seed(page) {
  await page.evaluate(async () => {
    const S = KN.store;
    const a = S.addStore("スーパー");
    ["牛乳", "卵", "食パン", "とても長い名前の品物をここに置いて折り返しを見る"].forEach((name) => {
      const p = S.addProduct({ name }); if (p) { S.addItem(p.id); S.addPrice(p.id, { storeId: a.id, price: 100, amount: 1, date: KN.util.todayKey() }); } });
    S.addTodo({ title: "試しの予定", due: KN.util.todayKey(), time: "10:00", minutes: 30 });
    S.addTodo({ title: "とても長い題のやることを置いて、行が窓の外へはみ出さないかを見る", due: KN.util.todayKey() });
    S.addWeight({ day: KN.util.todayKey(), time: "07:00", kg: 60 });
    const at = (n) => new Date(Date.now() - n * 3600e3).toISOString();
    await KN.notes.addMany(["一つめ", "二つめ"].map((title, i) => ({ id: `n-w${i}`, title, body: "試しの本文",
      notebook: "private", tags: [], fav: false, createdAt: at(i), updatedAt: at(i), deletedAt: null })));
  });
}

(async () => {
  const t = checker("widths");
  const waits = new Map();

  /* 1. 幅の一覧 × 五つの席（棒は隠したまま＝iPhone・iPad・Mac の形）。 */
  {
    const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
    await seed(page);
    for (const [w, h, label] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      const at = `${w}×${h}（${label}）`;
      const wide = [], out = [], small = [];
      let frame = null;
      for (const s of SEATS) {
        await page.click(`.tab-${s}`);
        await page.waitForTimeout(450);
        const f = await page.evaluate(flatFn);
        if (!f.ok) wide.push(`${s} ${f.sw}>${f.w}`);
        const sc = await page.evaluate(scan);
        sc.out.forEach((x) => out.push(`${s}: ${x}`));
        for (const x of sc.small) {
          const wt = WAIT.find(([re]) => re.test(x.name));
          if (wt) waits.set(wt[1], (waits.get(wt[1]) || 0) + 1);
          else small.push(`${s}: ${x.name} ${x.px}px`);
        }
        if (s === "archive") frame = await page.evaluate(frameFn);
      }
      t.check(`${at}：どの席も頁が横に伸びない`, !wide.length, wide.join(" | "));
      t.check(`${at}：窓の外へ出た字・押すところが無い`, !out.length, out.slice(0, 6).join(" | "));
      t.check(`${at}：11px 未満の字が無い`, !small.length, [...new Set(small)].slice(0, 6).join(" | "));

      const fr = frame;
      t.check(`${at}：アプリの地は窓いっぱい（灰の帯が無い）`,
        !!fr && fr.app.l === 0 && fr.app.r === fr.vw && fr.bodyBg === fr.appBg, JSON.stringify(fr && { app: fr.app, body: fr.bodyBg, bg: fr.appBg }));
      if (w >= 640) {
        const want = w >= 840 ? 760 : 680;
        t.check(`${at}：中身は読む幅 ${want}px に寄る`, !!fr && fr.read != null && fr.read <= want + 1 && fr.read >= Math.min(want, fr.vw - (w >= 840 ? 300 : 0)) - 1,
          JSON.stringify(fr && fr.read));
      }
      if (w < 840) {
        const c = fr && fr.cap, p = fr && fr.fab;
        const capOk = !!c && c.l >= 0 && c.r <= fr.vw && c.b <= fr.vh && (w < 640 || (c.w <= 600 && Math.abs(c.l - (fr.vw - c.r)) <= 1));
        t.check(`${at}：下の帯は窓の中${w >= 640 ? "・600px で真ん中" : ""}`, capOk, JSON.stringify(c));
        t.check(`${at}：＋は帯の上、カプセルの右端にそろう`, !!c && !!p && p.b <= c.t && p.r <= c.r + 1 && p.r >= c.r - 24,
          JSON.stringify({ cap: c, fab: p }));
      } else {
        const b = fr && fr.bar, p = fr && fr.fab;
        t.check(`${at}：左の列は窓の背いっぱい、＋は列にかぶらず窓の中`,
          !!b && !!p && b.l === 0 && b.t === 0 && b.b === fr.vh && p.l >= b.r && p.r <= fr.vw && p.b <= fr.vh, JSON.stringify({ bar: b, fab: p }));
      }
    }
    t.check("エラーなし（棒を隠した形）", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* 2. 送り棒が場所を取る道（Windows）。WebKit では棒を出せないので Chromium だけ。 */
  if (process.env.KN_BROWSER !== "webkit") {
    const { browser, page, errors } = await open({ viewport: { width: 1440, height: 900 }, scrollbars: true });
    await seed(page);
    const bar = await page.evaluate(() => {
      const d = document.createElement("div");
      d.style.cssText = "position:absolute;top:-999px;width:100px;height:100px;overflow:scroll";
      document.body.appendChild(d);
      const w = d.offsetWidth - d.clientWidth; d.remove(); return w;
    });
    t.check("送り棒が場所を取る形で開けた", bar > 0, `${bar}px`);
    for (const [w, h, label] of SIZES.filter(([w]) => [393, 820, 1032, 1440].includes(w))) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      const at = `棒あり ${w}×${h}（${label}）`;
      const wide = [], side = [], out = [];
      for (const s of SEATS) {
        await page.click(`.tab-${s}`);
        await page.waitForTimeout(450);
        const f = await page.evaluate(flatFn);
        if (!f.ok) wide.push(`${s} ${f.sw}>${f.w}`);
        (await page.evaluate(sideScrollFn)).forEach((x) => side.push(`${s}: ${x}`));
        (await page.evaluate(scan)).out.forEach((x) => out.push(`${s}: ${x}`));
      }
      t.check(`${at}：頁が横に伸びない`, !wide.length, wide.join(" | "));
      t.check(`${at}：送る器が棒のぶん横に送れるようにならない`, !side.length, side.slice(0, 6).join(" | "));
      t.check(`${at}：窓の外へ出た字・押すところが無い`, !out.length, out.slice(0, 6).join(" | "));
    }
    t.check("エラーなし（棒あり）", !errors.length, errors.join(" | "));
    await browser.close();
  }

  /* 3. 電話を横にした案内は指の端末だけ（マウスの 720×450 は 1. で席を押せている）。 */
  {
    const { browser, page } = await open({ viewport: { width: 852, height: 393 }, touch: true });
    const shown = await page.evaluate(() => getComputedStyle(document.querySelector(".rotate-note")).display !== "none"
      && getComputedStyle(document.querySelector(".app")).visibility === "hidden");
    t.check("電話を横にすると案内が出る（指の端末）", shown);
    await browser.close();
  }

  for (const [why, n] of waits) console.log(`  待ち：${why}（${n}か所）`);
  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
