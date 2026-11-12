/* 装いと基調色（設定 → 外観。base.css の「モダン」「基調色」・docs/redesign.md 4節）。2026年11月10日に五つから二つへ。
   - 装いは二つ：手帳（既定・札なし）とモダン（data-attire="modern"）。替わるのは札の組だけ——
     `[data-attire]` の規則はカスタムプロパティしか書かない（形を変える規則を装いごとに作らない。表紙 .nt-cv・.nt-lb だけは別。redesign.md 4節）
   - 手帳は生成りの地・墨の字・朱の一色（字も塗りも同じ値）・見出しは明朝。モダンは墨の主色・赤の「いま」・見出しはゴシック
   - 押したその場で変わる・読み直しても残る・知らない値は手帳へ（reconcile）。モダンのあいだ基調色と見出しの書体は出さない
   - 前の値（washi-shu・washi-enji・season・polish）は消さずに読み替える（朱・臙脂・季節は手帳の基調色へ、磨きは既定へ）
   - 基調色は九つ（八つ＋季節）。どれも明暗とも、地の上の字 4.5 以上・塗りの上の字 4.5 以上。季節は今日の節気を data-sekki に
   - 見出しの書体（settings.headFont）は「本文と同じ」で data-head="same"
   走らせ方：NODE_PATH=/opt/node22/lib/node_modules node tests/attire.js */
const fs = require("fs");
const path = require("path");
const { open, checker } = require("./lib");

(async () => {
  const t = checker("attire");

  /* 画面を開かない見張り：装いの規則は札（カスタムプロパティ）だけを書く。 */
  {
    const bad = [];
    for (const f of ["base.css", "components.css", "screens.css"]) {
      const css = fs.readFileSync(path.join(__dirname, "..", "css", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/\[data-attire/.test(m[1]) || /\.nt-(cv|lb)\b/.test(m[1])) continue;
        const loose = m[2].split(";").map((d) => d.trim()).filter((d) => d && !d.startsWith("--") && !/^color-scheme\s*:/.test(d));
        if (loose.length) bad.push(`${f} ${m[1].trim().replace(/\s+/g, " ").slice(0, 60)} { ${loose[0]} }`);
      }
    }
    t.check("装いの規則は札だけを書く（形を変える規則を作らない）", !bad.length, bad.slice(0, 3).join(" | "));
    const gone = ["css/attire.css"].filter((f) => fs.existsSync(path.join(__dirname, "..", f)));
    const refs = ["index.html", "sw.js", "build-standalone.js"].filter((f) => /attire\.css/.test(fs.readFileSync(path.join(__dirname, "..", f), "utf8")));
    t.check("css/attire.css は外した（三つの登録からも）", !gone.length && !refs.length, [...gone, ...refs].join(" "));
  }

  const { browser, page, errors } = await open();

  const attr = (n = "data-attire") => page.evaluate((n) => document.documentElement.getAttribute(n), n);
  const v = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const set = () => page.evaluate(() => { const s = KN.store.get().settings; return { attire: s.attire, accent: s.accent, headFont: s.headFont }; });
  /* 札を色に解いて、比を出す（color-mix でも読めるよう、要素の color を通す）。 */
  const ratios = () => page.evaluate(() => {
    const probe = document.createElement("i");
    document.body.append(probe);
    const rgb = (name) => {
      probe.style.color = `var(${name})`;
      const c = getComputedStyle(probe).color, n = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      return /^color\(/.test(c) ? n.map((x) => x * 255) : n;
    };
    const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const k = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const out = { onBg: k("--c-primary", "--c-bg"), onFill: k("--c-text-on", "--c-primary-fill"), ink: k("--c-primary-ink", "--c-primary-soft"),
      text3: k("--c-text-3", "--c-bg"), now: k("--c-now", "--c-bg") };
    probe.remove();
    return out;
  });
  const headFont = () => page.evaluate(() => getComputedStyle(document.querySelector(".topbar-title")).fontFamily.split(",")[0].replace(/"/g, "").trim());
  const bodyFont = () => page.evaluate(() => getComputedStyle(document.body).fontFamily.split(",")[0].trim());
  const pick = (id) => page.locator(`.set-layer:last-child .attire-pick[data-pick="${id}"]`);
  const dot = (id) => page.locator(`.set-layer:last-child .js-accents .accent-dot[data-accent="${id}"]`);
  const count = (sel) => page.locator(`.set-layer:last-child ${sel}`).count();
  const toSettings = async () => {
    await page.evaluate(() => KN.app.showScreen("settings"));
    await page.waitForTimeout(500);
    await page.locator(".set-layer:last-child .set-row", { hasText: "表示・操作" }).first().click();
    await page.waitForTimeout(600);
  };
  const reload = async () => {
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => window.KN && KN.store && KN.app);
    await page.waitForTimeout(300);
  };
  const theme = (v) => page.evaluate((v) => { const r = document.documentElement; if (v) r.setAttribute("data-theme", v); else r.removeAttribute("data-theme"); }, v);

  /* ---- 手帳（既定） ---- */
  t.check("既定は手帳（settings.attire は \"now\"・見出しは明朝）", JSON.stringify(await set()) === JSON.stringify({ attire: "now", accent: "orange", headFont: "mincho" }), JSON.stringify(await set()));
  t.check("手帳では札を付けない", (await attr()) === null && (await attr("data-accent")) === null && (await attr("data-sekki")) === null && (await attr("data-head")) === null);
  t.check("地は生成り・主色は朱", (await v("--c-bg")) === "#f4efe5" && (await v("--c-primary")) === "#bf4128", `${await v("--c-bg")} ${await v("--c-primary")}`);
  t.check("塗りの朱は字の朱と同じ一色・いまの線と日曜も朱", (await v("--c-primary-fill")) === "#bf4128" && (await v("--c-now")) === "#bf4128" && (await v("--c-sun")) === "#bf4128",
    `${await v("--c-primary-fill")} ${await v("--c-now")} ${await v("--c-sun")}`);
  let r = await ratios();
  t.check("朱は地の上で 4.5 以上・朱の上の白字も 4.5 以上・薄い朱の上の -ink も", r.onBg >= 4.5 && r.onFill >= 4.5 && r.ink >= 4.5, JSON.stringify(r));
  t.check("見出しは明朝、本文は今のまま", (await headFont()) === "Hiragino Mincho ProN" && (await bodyFont()) === "-apple-system", `${await headFont()} / ${await bodyFont()}`);
  await theme("dark");
  r = await ratios();
  t.check("暗い面は墨の地・明るい朱・塗りの上は地の黒", (await v("--c-bg")) === "#1b1916" && (await v("--c-primary")) === "#ee8468" && (await v("--c-text-on")) === "#1b1916"
    && r.onBg >= 4.5 && r.onFill >= 4.5 && r.ink >= 4.5, JSON.stringify(r));
  await theme(null);

  /* ---- 設定で選ぶ ---- */
  await toSettings();
  t.check("装いのボタンは二つ（手帳・モダン）で、手帳が選ばれている", (await count(".attire-pick[data-pick]")) === 2 && (await pick("techo").getAttribute("aria-pressed")) === "true");
  t.check("手帳では基調色（九つ）と見出しの書体が出る", (await count(".js-accents .accent-dot")) === 9 && (await count('.seg-btn[data-head]')) === 2);

  await pick("modern").click();
  await page.waitForTimeout(300);
  t.check("モダンで札が付き、記録に残る", (await attr()) === "modern" && (await set()).attire === "modern", JSON.stringify(await set()));
  t.check("モダンの地・主色（墨）・いまの線（赤）", (await v("--c-bg")) === "#f3f2ee" && (await v("--c-primary")) === "#1c1d21" && (await v("--c-now")) === "#c93636",
    `${await v("--c-bg")} ${await v("--c-primary")} ${await v("--c-now")}`);
  r = await ratios();
  t.check("モダンも：主色は地の上 4.5 以上・塗りの上の字 4.5 以上・赤は地の上 4.5 以上", r.onBg >= 4.5 && r.onFill >= 4.5 && r.now >= 4.5 && r.text3 >= 4.5, JSON.stringify(r));
  t.check("モダンの見出しは本文と同じ書体", (await headFont()) === (await bodyFont()), await headFont());
  t.check("モダンのあいだ、基調色と見出しの書体は出さない", (await count(".js-accents")) === 0 && (await count('.seg-btn[data-head]')) === 0 && (await attr("data-accent")) === null);
  const shots = await page.evaluate(() => {
    const bg = (id) => { const el = document.querySelector(`.set-layer:last-child .attire-pick[data-pick="${id}"] .attire-shot`); return el ? getComputedStyle(el).backgroundColor : ""; };
    return { techo: bg("techo"), modern: bg("modern"), n: document.querySelectorAll(".set-layer:last-child .attire-shot").length };
  });
  t.check("どちらを着ていても、絵は自分の装いの地で描く", shots.n === 2 && shots.techo === "rgb(244, 239, 229)" && shots.modern === "rgb(243, 242, 238)", JSON.stringify(shots));
  await theme("dark");
  r = await ratios();
  t.check("モダンの暗い面：地・主色（白に近い墨の裏返し）・塗りの上は地の黒", (await v("--c-bg")) === "#131416" && (await v("--c-primary")) === "#f2f2f3" && (await v("--c-text-on")) === "#131416"
    && r.onBg >= 4.5 && r.onFill >= 4.5 && r.now >= 4.5 && r.text3 >= 4.5, JSON.stringify(r));
  await theme(null);

  await reload();
  t.check("読み直してもモダンのまま", (await attr()) === "modern" && (await v("--c-primary")) === "#1c1d21");

  await toSettings();
  await pick("techo").click();
  await page.waitForTimeout(300);
  t.check("手帳へ戻すと札が外れ、朱に戻る", (await attr()) === null && (await v("--c-primary")) === "#bf4128" && (await set()).attire === "now");

  /* ---- 基調色 ---- */
  await dot("blue").click();
  await page.waitForTimeout(300);
  t.check("藍を押すと主色が藍に、予定の藍は朱へ入れ替わる", (await attr("data-accent")) === "blue" && (await v("--c-primary")) === "#2b5a8c" && (await v("--c-ai")) === "#bf4128",
    `${await v("--c-primary")} ${await v("--c-ai")}`);
  t.check("塗りも同じ藍（-fill は同じ値）", (await v("--c-primary-fill")) === "#2b5a8c", await v("--c-primary-fill"));
  const low = await page.evaluate(() => {
    const root = document.documentElement, was = { a: root.getAttribute("data-accent"), s: root.getAttribute("data-sekki") }, out = [];
    const probe = document.createElement("i");
    document.body.append(probe);
    const rgb = (name) => { probe.style.color = `var(${name})`; const c = getComputedStyle(probe).color, n = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number); return /^color\(/.test(c) ? n.map((x) => x * 255) : n; };
    const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const k = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const ids = KN.store.ACCENTS.map((a) => a.id);
    let n = 0;
    for (const th of [null, "dark"]) {
      if (th) root.setAttribute("data-theme", th); else root.removeAttribute("data-theme");
      for (const id of ids) for (let s = 0; s < (id === "season" ? 24 : 1); s++) {
        if (id === "orange") root.removeAttribute("data-accent"); else root.setAttribute("data-accent", id);
        if (id === "season") root.setAttribute("data-sekki", String(s)); else root.removeAttribute("data-sekki");
        const a = k("--c-primary", "--c-bg"), b = k("--c-text-on", "--c-primary-fill"), c = k("--c-primary-ink", "--c-primary-soft");
        n++;
        if (a < 4.5 || b < 4.5 || c < 4.5) out.push(`${th || "light"} ${id}${id === "season" ? s : ""}: ${a.toFixed(2)}/${b.toFixed(2)}/${c.toFixed(2)}`);
      }
    }
    root.removeAttribute("data-theme");
    if (was.a) root.setAttribute("data-accent", was.a); else root.removeAttribute("data-accent");
    if (was.s) root.setAttribute("data-sekki", was.s); else root.removeAttribute("data-sekki");
    probe.remove();
    return { out, n };
  });
  t.check("九つの基調色（季節は24の節気）どれも明暗とも：地の上の字・塗りの上の字・薄い地の上の -ink が 4.5 以上", low.n === 64 && !low.out.length, `${low.n} 通り ${low.out.slice(0, 6).join(" | ")}`);

  await dot("season").click();
  await page.waitForTimeout(300);
  const sekki = await page.evaluate(() => String(Math.floor(KN.season.of(KN.util.todayKey()).k / 3)));
  t.check("季節で札と今日の節気が付く", (await attr("data-accent")) === "season" && (await attr("data-sekki")) === sekki && (await v("--c-primary")) !== "#bf4128",
    `${await attr("data-sekki")} / ${sekki} ${await v("--c-primary")}`);
  await dot("orange").click();
  await page.waitForTimeout(300);
  t.check("朱へ戻すと札も節気も外れる", (await attr("data-accent")) === null && (await attr("data-sekki")) === null && (await v("--c-primary")) === "#bf4128");

  /* ---- 前の値は消さずに読み替える ---- */
  const wear = async (attire, accent) => {
    await page.evaluate(([a, c]) => { KN.store.update((s) => { s.settings.attire = a; if (c) s.settings.accent = c; }); KN.app.applyLook(); }, [attire, accent]);
    await page.waitForTimeout(150);
  };
  await wear("washi-enji");
  t.check("臙脂（washi-enji）は手帳の基調色・臙脂へ読み替える（値は書き換えない）",
    (await attr()) === null && (await attr("data-accent")) === "rose" && (await v("--c-primary")) === "#9e3443" && (await set()).attire === "washi-enji" && (await set()).accent === "orange",
    `${await attr("data-accent")} ${await v("--c-primary")} ${JSON.stringify(await set())}`);
  await wear("season");
  t.check("季節（season）は基調色の季節へ", (await attr()) === null && (await attr("data-accent")) === "season" && (await attr("data-sekki")) === sekki);
  await wear("washi-shu", "blue");
  t.check("朱（washi-shu）は手帳の朱へ（選んであった基調色より先）", (await attr()) === null && (await attr("data-accent")) === null && (await v("--c-primary")) === "#bf4128");
  await wear("polish");
  t.check("磨き（polish）は手帳の既定へ（基調色は選んであったもの）", (await attr()) === null && (await attr("data-accent")) === "blue" && (await v("--c-primary")) === "#2b5a8c");
  await reload();
  t.check("読み直しても前の値は残り、同じ読み替え", (await set()).attire === "polish" && (await attr("data-accent")) === "blue");

  await wear("washi-enji");
  await toSettings();
  t.check("読み替えた色が、基調色の選んでいる丸になる", (await dot("rose").getAttribute("aria-pressed")) === "true" && (await pick("techo").getAttribute("aria-pressed")) === "true");
  await pick("modern").click();
  await page.waitForTimeout(300);
  await pick("techo").click();
  await page.waitForTimeout(300);
  t.check("モダンへ行って戻っても、読み替えていた色のまま（基調色に写す）", (await attr("data-accent")) === "rose" && JSON.stringify(await set()) === JSON.stringify({ attire: "now", accent: "rose", headFont: "mincho" }), JSON.stringify(await set()));
  await wear("washi-enji", "orange");
  await toSettings();
  await dot("green").click();
  await page.waitForTimeout(300);
  t.check("色を選び直したら、装いは手帳（\"now\"）に据える", (await set()).attire === "now" && (await set()).accent === "green" && (await v("--c-primary")) === "#3f6b2f", JSON.stringify(await set()));
  await dot("orange").click();
  await page.waitForTimeout(300);

  /* ---- 見出しの書体 ---- */
  await page.locator('.set-layer:last-child .seg-btn[data-head="same"]').click();
  await page.waitForTimeout(300);
  t.check("「本文と同じ」で見出しが本文の書体になる・記録に残る", (await attr("data-head")) === "same" && (await headFont()) === (await bodyFont()) && (await set()).headFont === "same", await headFont());
  await reload();
  t.check("読み直しても見出しは本文と同じ", (await attr("data-head")) === "same");
  await page.evaluate(() => { KN.store.update((s) => { s.settings.headFont = "mincho"; }); KN.app.applyLook(); });
  t.check("明朝へ戻すと札が外れる", (await attr("data-head")) === null && (await headFont()) === "Hiragino Mincho ProN");

  /* ---- 知らない値 ---- */
  await page.evaluate(() => KN.store.update((s) => { s.settings.attire = "fancy"; s.settings.headFont = "fancy"; }));
  await reload();
  t.check("知らない値は手帳・明朝へ戻る", JSON.stringify(await set()) === JSON.stringify({ attire: "now", accent: "orange", headFont: "mincho" }) && (await attr()) === null, JSON.stringify(await set()));

  t.check("エラーが出ない", !errors.length, errors.join(" / "));
  await browser.close();
  t.done();
})();
