/* 一年の一冊・月の頁・小口（構5・shots/vision/README.md 9・docs/daily.md「一年の一冊」）。

   棚の背表紙（screen-archive.js の shelfOf）から開く二つの紙。記録は読むだけ——新しい入れ物も索引も持たず、
   開くたびに日の鍵から引く（Daily Log の「写さず引く」と同じ）。

   - 一冊は暦年。升は、その年の中の候の続き（2025年は73・2026年は72）。年をまたぐ候は両方の年に出て、
     それぞれ自分の年の日だけを持つ。月の列は暦の月で、その月に始まる候を置く。
   - 升の一行は日記の最初の一行だけ（無ければ写真と名だけ・まだ来ていない候は名だけ）。鍵のあいだは出さない。
   - 月の頁は暦の月どおり。候ごとの見出しと、頁の小さな写しの並び。何も無い日は並べない。
   - 小口は頁の束の縁に節気の色。なぞると日へ飛ぶ。
   写真の写しは img/season-thumb/kNN.webp（tools/season-art.js thumb）。出典は daily の写真と同じ。 */
(function () {
  "use strict";
  const KN = (window.KN = window.KN || {});
  const U = KN.util;
  const { html, node, icon } = U;
  const pad = (n) => String(n).padStart(2, "0");
  const shut = () => !!(KN.lock && KN.lock.hides("diary"));
  const arc = () => KN.screens.archive;

  /* その日から n 日ずらした日。暦の足し引きなので UTC で（夏時間に揺れない。season.js の shift と同じ）。 */
  const shift = (day, n) => {
    const [y, m, d] = day.split("-").map(Number), t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  };

  /* ---- 升：その年の中の候の続き ---- */
  const kept = {};
  function masu(year) {
    year = String(year);
    if (kept[year]) return kept[year];
    const out = [];
    for (let day = `${year}-01-01`; day && day.slice(0, 4) === year; day = shift(day, 1)) {
      const r = KN.season.of(day), last = out[out.length - 1];
      if (last && last.k === r.k) { last.to = day; last.days++; continue; }
      out.push({ k: r.k, kou: r.kou, sekki: r.sekki, from: day, to: day, days: 1, month: +day.slice(5, 7) });
    }
    return (kept[year] = out);
  }

  const md = (day) => `${+day.slice(5, 7)}/${+day.slice(8, 10)}`;
  const spanOf = (m) => (m.from === m.to ? md(m.from) : `${md(m.from)}–${md(m.to)}`);
  const thumb = (k) => `img/season-thumb/k${pad(k)}.webp`;

  /* 開いている紙。日へ飛ぶときは全部閉じる。鍵が閉じたら（lock.diarySheet）自分で閉じる。 */
  const open = [];
  function track(h) {
    let unwatch = null;
    if (KN.lock) unwatch = KN.lock.diarySheet(() => h.close());
    open.push(h);
    return () => { if (unwatch) unwatch(); const i = open.indexOf(h); if (i >= 0) open.splice(i, 1); };
  }
  function jump(day) {
    KN.motion.fire("select");
    open.slice().reverse().forEach((h) => h.close());
    /* 頁は席1。ほかの席（G の一冊・見開きの小口）からはまず席1 へ。 */
    if (KN.app.activeScreen && KN.app.activeScreen() !== "archive") KN.app.showScreen("archive");
    arc().goDay(day);
  }

  /** その年の日記のある日（日の鍵 → 行）。鍵のあいだは空。 */
  function diaryRows(year) {
    const map = new Map();
    if (shut()) return map;
    ((KN.store.get().archive || {}).days || []).forEach((d) => { if (String(d.date).startsWith(year) && arc().lead(d)) map.set(d.date, d); });
    return map;
  }

  /** 小口：頁の束の縁に節気の色。高さは日の数に比例。なぞると日へ（離したところの候の、日記のある最初の日。無ければ候の初日）。
      一冊の右の縁と、広い幅の見開きの右の縁（構6・screen-todo の facingPage）。 */
  function edgeOf(year, rows) {
    year = String(year);
    const list = masu(year), today = U.todayKey(), total = list.reduce((n, m) => n + m.days, 0);
    rows = rows || diaryRows(year);
    const target = (m) => { for (let d = m.from; d <= m.to && d <= today; d = shift(d, 1)) if (rows.has(d)) return d; return m.from; };
    const edge = node(html`<div class="sb-edge" aria-hidden="true"></div>`);
    const tip = node(html`<span class="sb-tip" hidden></span>`);
    list.forEach((m) => {
      const seg = document.createElement("i");
      seg.style.flex = String(m.days);
      seg.style.background = KN.seasonArt ? KN.seasonArt.SEKKI_C[Math.floor(m.k / 3)] : "";
      edge.append(seg);
    });
    edge.append(tip);
    let hit = null;
    const at = (e) => {
      const r = edge.getBoundingClientRect();
      let n = Math.max(0, Math.min(total - 1, Math.floor((e.clientY - r.top) / r.height * total)));
      const m = list.find((x) => (n -= x.days) < 0) || list[list.length - 1];
      tip.hidden = false;
      tip.textContent = `${m.kou}　${spanOf(m)}`;
      tip.style.top = `${Math.max(0, Math.min(r.height - 28, e.clientY - r.top - 14))}px`;
      return m;
    };
    edge.addEventListener("pointerdown", (e) => { edge.setPointerCapture(e.pointerId); hit = at(e); });
    edge.addEventListener("pointermove", (e) => { if (hit) hit = at(e); });
    edge.addEventListener("pointerup", () => { tip.hidden = true; const m = hit; hit = null; if (m) jump(target(m)); });
    edge.addEventListener("pointercancel", () => { tip.hidden = true; hit = null; });
    return edge;
  }

  /* ---- 一年の一冊 ---- */
  function openBook(year, o) {
    year = String(year);
    const list = masu(year), today = U.todayKey();
    const rows = diaryRows(year);
    const ml = new Map();
    list.forEach((m) => { if (!ml.has(m.month)) ml.set(m.month, []); ml.get(m.month).push(m); });

    const cardOf = (m) => {
      const ahead = m.from > today;
      let day = null, line = "";
      for (let d = m.from; d <= m.to && !ahead; d = shift(d, 1)) {
        const r = rows.get(d);
        if (!r) continue;
        if (!day) day = d;
        const l = arc().lead(r);
        if (l && l.text) { line = l.text; break; }
      }
      const now = today >= m.from && today <= m.to;
      const body = html`
        ${ahead ? "" : html`<img class="sb-pic" src="${thumb(m.k)}" alt="" width="120" height="80" loading="lazy" decoding="async">`}
        <span class="sb-name">${m.kou}<small>${spanOf(m)}</small></span>
        ${line ? html`<span class="ima-text">${line}</span>` : ""}`;
      const el = node(day
        ? html`<button type="button" class="ima-page sb-masu${now ? " is-now" : ""}" data-k="${m.k}">${body}</button>`
        : html`<div class="ima-page sb-masu is-still${now ? " is-now" : ""}" data-k="${m.k}">${body}</div>`);
      if (day) el.addEventListener("click", () => jump(day));
      return el;
    };

    const body = node(html`<div class="sb"><div class="sb-pages"></div><i class="sb-edge"></i></div>`);
    const pages = body.querySelector(".sb-pages");
    ml.forEach((ms, mo) => {
      const sec = node(html`<section class="sb-month">
        <button type="button" class="sb-mh" aria-label="${mo}月の頁">${mo}月${icon("chevron")}</button>
        <div class="ima-pages sb-grid"></div></section>`);
      sec.querySelector(".sb-mh").addEventListener("click", () => { KN.motion.fire("select"); openMonth(year, mo); });
      const grid = sec.querySelector(".sb-grid");
      ms.forEach((m) => grid.append(cardOf(m)));
      pages.append(sec);
    });

    body.querySelector(".sb-edge").replaceWith(edgeOf(year, rows));

    const foot = node(html`<button type="button" class="btn btn-soft btn-sm sb-out">${icon("download")}書き出し</button>`);
    foot.addEventListener("click", () => { if (KN.settingsParts) KN.settingsParts.yearbook(year); });
    let untrack = () => {};
    const h = KN.ui.sheet({ title: `${year}年`, content: body, footer: foot, cls: "sb-sheet", onClose: () => untrack() });
    untrack = track(h);
    return h;
  }

  /* ---- 月の頁 ---- */
  function openMonth(year, month) {
    year = +year; month = +month;
    const today = U.todayKey();
    const wrap = node(html`<div class="sb-mpage"></div>`);
    const nav = node(html`<div class="sb-nav">
      <button type="button" class="icon-btn flip-x js-prev" aria-label="前の月">${icon("chevron")}</button>
      <button type="button" class="btn btn-soft btn-sm js-book">${icon("book")}一冊</button>
      <button type="button" class="icon-btn js-next" aria-label="次の月">${icon("chevron")}</button></div>`);
    let h = null;

    function paint() {
      const ym = `${year}-${pad(month)}`, first = `${ym}-01`;
      const last = `${ym}-${pad(new Date(year, month, 0).getDate())}`;
      const rows = diaryRows(String(year));
      const secs = [];
      masu(year).forEach((m) => {
        if (m.to < first || m.from > last) return;
        const a = m.from < first ? first : m.from, b = m.to > last ? last : m.to;
        const pageList = [];
        for (let d = a; d <= b && d <= today && !shut(); d = shift(d, 1)) {
          const r = rows.get(d);
          const feed = r ? [] : KN.store.dayFeed(d).map((f) => f.title).filter(Boolean);
          if (!r && !feed.length) continue;
          const l = r ? arc().lead(r) : null;
          pageList.push({ d, text: l ? l.text : [...new Set(feed)].join("・"), blank: !l || l.blank });
        }
        const sec = node(html`<section class="sb-kou">
          <h3 class="sb-kh">${m.from > today ? "" : html`<img class="sb-pic is-s" src="${thumb(m.k)}" alt="" width="60" height="40" decoding="async">`}
            <b>${m.kou}</b><small>${spanOf({ from: a, to: b })}</small></h3>
          ${pageList.length ? html`<div class="ima-pages"></div>` : ""}</section>`);
        const grid = sec.querySelector(".ima-pages");
        pageList.forEach((p) => {
          const dt = U.dayDate(p.d);
          const b2 = node(html`<button type="button" class="ima-page" data-day="${p.d}">
            <span class="ima-d">${dt.getMonth() + 1}月${dt.getDate()}日<small>${U.weekdayJa(p.d)}</small></span>
            <span class="ima-text${p.blank ? " is-blank" : ""}">${p.text}</span></button>`);
          b2.addEventListener("click", () => jump(p.d));
          grid.append(b2);
        });
        secs.push(sec);
      });
      wrap.replaceChildren(...secs);
      if (h && h.el) { const t = h.el.querySelector(".sheet-title"); if (t) t.textContent = `${year}年${month}月`; }
    }
    const step = (d) => { KN.motion.fire("select"); const t = new Date(year, month - 1 + d, 1); year = t.getFullYear(); month = t.getMonth() + 1; paint(); };
    nav.querySelector(".js-prev").addEventListener("click", () => step(-1));
    nav.querySelector(".js-next").addEventListener("click", () => step(1));
    nav.querySelector(".js-book").addEventListener("click", () => { const y = year; if (h) h.close(); openBook(y); });
    const holder = node(html`<div></div>`);
    holder.append(wrap);
    let untrack = () => {};
    h = KN.ui.sheet({ title: `${year}年${month}月`, content: holder, footer: nav, cls: "sb-sheet", onClose: () => untrack() });
    untrack = track(h);
    paint();
    return h;
  }

  /** 棚の「月ぜんぶ」の行き先の月：今の年は今月、ほかの年は日記のある最後の月（無ければ1月）。 */
  function monthFor(year) {
    year = String(year);
    const today = U.todayKey();
    if (today.startsWith(year)) return +today.slice(5, 7);
    let m = 1;
    ((KN.store.get().archive || {}).days || []).forEach((d) => { if (String(d.date).startsWith(year) && +d.date.slice(5, 7) > m) m = +d.date.slice(5, 7); });
    return m;
  }

  KN.seasonBook = { masu, openBook, openMonth, monthFor, edgeOf };
})();
