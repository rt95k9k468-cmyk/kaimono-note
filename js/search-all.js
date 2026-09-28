/* =========================================================
   ぜんぶをさがす（R8、2026年9月28日。docs/screens-nav.md の
   「ぜんぶをさがす」）

   虫めがねの役目は**今のまま**：そのタブの中を絞り込む。そこへ一つだけ
   足します——打った字が、**ほかの場所**にもあれば、窓のすぐ下に
   「ほかの場所に ◯件」の一行。押すと、場所ごとにまとめた紙が開き、
   行を押せばその日・その品へ。

   - 一行を窓の下に置くのは、タブの一覧の「終わり」だと長い一覧では
     指が届かないから（そして、タブの中に一件も無いときほど要る）。
   - ほかの場所：やること（済んだものも）・買うもの（品物と価格）・daily
     （日記の本文・積み上げ）・からだ（食べたもの・メモ・お酒）。いまの
     タブの場所は数えません（もう絞り込んで見えているので）。
   - 「2025年9月」「去年の夏」「先月」のような**過去の**日付の言葉は、
     daily のその月へ飛ぶ口として出します。`when-parse` は先の日しか
     読まない決めごとなので、ここに過去だけを読む別の読み方（`pastWhen`）
     を持ちます。先の日になる言葉は出しません。
   - **記録は増やさない。** 数えて並べるだけ（Daily Log の「写さず引く」）。
   - 日記の本文は照合にだけ使い、行には当たった前後を少しだけ出します
     （利用者が自分の端末で自分の日記を探すための表示）。本文を読めない
     とき（`KN.diaryIdb.body()` が "ok" でない）は本文を探さず、紙に
     そう一言（docs/storage.md の「読み込み中と、読めない日」）。
   - 意味で探す（埋め込み）はしない。言葉と日付で足りる（roadmap の R8）。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});
  const U = KN.util;
  const { html, node, icon } = U;

  /** 一つの場所に並べる行の上限（それより多ければ「ほか◯件」）。 */
  const LIMIT = 30;

  /* 畳み（かな・全角半角・大小）は安くないので、同じ字は一度だけ。日記の
     本文は3000日ぶんになりうる——打つたびに畳み直すと重い。 */
  const folded = new Map();
  function fold(s) {
    const k = String(s || "");
    if (!k) return "";
    let v = folded.get(k);
    if (v === undefined) {
      if (folded.size > 20000) folded.clear();
      v = U.foldKana(k);
      folded.set(k, v);
    }
    return v;
  }

  /* ---------------- 過去の日付の言葉 ---------------- */

  const SEASON = { 春: 3, 夏: 6, 秋: 9, 冬: 12 };
  const YEAR_WORD = { 今年: 0, ことし: 0, 去年: -1, 昨年: -1, きょねん: -1, おととし: -2, 一昨年: -2 };

  /**
   * 「2025年9月」「2025/9」「去年の夏」「去年の9月」「先月」「9月」を、
   * いまより前（今月まで）の月として読みます。読めない・先の月なら null。
   * @returns {{ym: string, label: string} | null}
   */
  function pastWhen(q, now) {
    const s = String(q || "").normalize("NFKC").replace(/\s+/g, "");
    if (!s) return null;
    const d = now || new Date();
    const cy = d.getFullYear(), cm = d.getMonth() + 1;
    let y = null, m = null;
    let r;
    if ((r = s.match(/^(\d{4})年(\d{1,2})月?$/)) || (r = s.match(/^(\d{4})[/.-](\d{1,2})$/))) {
      y = +r[1]; m = +r[2];
    } else if ((r = s.match(/^(\d{4})年$/))) {
      y = +r[1]; m = 1;
    } else if (s === "先月") {
      y = cy; m = cm - 1;
    } else if (s === "先々月") {
      y = cy; m = cm - 2;
    } else if ((r = s.match(/^(今年|ことし|去年|昨年|きょねん|おととし|一昨年)の?(?:(春|夏|秋|冬)|(\d{1,2})月)?$/))) {
      y = cy + YEAR_WORD[r[1]];
      if (r[2]) m = SEASON[r[2]];
      else if (r[3]) m = +r[3];
      else m = 1;
      /* 今年の冬は、まだ12月が来ていなければ年の初めの冬（1月）。 */
      if (r[2] === "冬" && y === cy && cm < 12) m = 1;
    } else if ((r = s.match(/^(\d{1,2})月$/))) {
      /* 年の無い「9月」は、いちばん近い過去の9月（今月なら今月）。 */
      m = +r[1];
      y = m <= cm ? cy : cy - 1;
    } else {
      return null;
    }
    while (m < 1) { m += 12; y -= 1; }
    if (!(m >= 1 && m <= 12) || y < 1900) return null;
    if (y > cy || (y === cy && m > cm)) return null;   // 先の月は when-parse の持ち場
    return { ym: `${y}-${String(m).padStart(2, "0")}`, label: `${y}年${m}月` };
  }

  /* ---------------- 探す ---------------- */

  /** いまのタブが受け持つ場所（そこは数えない）。 */
  const PLACE_OF = { todo: "todo", list: "shop", prices: "shop", archive: "daily", diet: "body" };

  /** 当たった前後を少しだけ（本文・メモの行に）。 */
  function around(text, q) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    const f = fold(t);
    const at = f.indexOf(q);
    if (at < 0) return t.slice(0, 40);
    /* 畳みで字数がずれることがある（ﾏ→マは同じ、㍑→リットルは増える）。
       ずれても前後が少し動くだけなので、そのまま使います。 */
    const from = Math.max(0, at - 12);
    return (from > 0 ? "…" : "") + t.slice(from, from + 40) + (from + 40 < t.length ? "…" : "");
  }

  function dayLabel(day) {
    const d = U.dayDate(day);
    if (!d) return "";
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${U.WEEKDAYS[d.getDay()]})`;
  }

  const byDayDesc = (a, b) => (a.day || "") < (b.day || "") ? 1 : (a.day || "") > (b.day || "") ? -1 : 0;

  function findTodo(s, q) {
    const out = [];
    (s.todos || []).forEach((t) => {
      if (!t || t.trace) return;
      if (!fold(t.title).includes(q) && !fold(t.memo).includes(q)) return;
      const day = t.done ? (t.doneAt ? U.dayKey(t.doneAt) : null) : (t.due || null);
      out.push({
        title: t.title || "（題なし）",
        sub: [day ? dayLabel(day) : "日付なし", t.done ? "済" : ""].filter(Boolean).join("・"),
        day, go: day ? { screen: "todo", day } : { screen: "todo", query: true },
      });
    });
    /* 日付のあるものを新しい順に。日付の無い長期タスクは終わりへ。 */
    return out.sort((a, b) => (!a.day) - (!b.day) || byDayDesc(a, b));
  }

  function findShop(s, q) {
    const onList = new Set((s.items || []).map((i) => i.productId));
    return (s.products || [])
      .filter((p) => p && fold(p.name).includes(q))
      .map((p) => {
        const has = onList.has(p.id);
        const n = (p.prices || []).length;
        return {
          title: p.name,
          sub: has ? "リストにある" : n ? `価格の記録 ${n}件` : "品物",
          go: { screen: has ? "list" : "prices", query: true },
          rank: has ? 0 : 1,
        };
      })
      .sort((a, b) => a.rank - b.rank);
  }

  function findDaily(s, q, bodyOk) {
    const out = [];
    const arc = s.archive || {};
    if (bodyOk) {
      (arc.days || []).forEach((d) => {
        if (d && d.memo && fold(d.memo).includes(q)) {
          out.push({ title: around(d.memo, q), sub: `${dayLabel(d.date)}・日記`, day: d.date,
            go: { screen: "archive", day: d.date } });
        }
      });
    }
    (arc.entries || []).forEach((e) => {
      if (!e) return;
      const inTitle = fold(e.title).includes(q);
      if (!inTitle && !fold(e.memo).includes(q)) return;
      out.push({ title: inTitle ? e.title : around(e.memo, q), sub: dayLabel(e.date), day: e.date,
        go: { screen: "archive", day: e.date } });
    });
    return out.sort(byDayDesc);
  }

  function findBody(s, q) {
    const out = [];
    const diet = s.diet || {};
    (diet.meals || []).forEach((m) => {
      if (!m) return;
      const names = (m.items || []).map((i) => i.name).filter((n) => fold(n).includes(q));
      const memo = fold(m.memo).includes(q);
      if (!names.length && !memo) return;
      out.push({ title: names.length ? names.join("・") : around(m.memo, q), sub: `${dayLabel(m.day)}・食事`,
        day: m.day, go: { screen: "diet", day: m.day } });
    });
    (diet.drinks || []).forEach((d) => {
      if (!d || !(fold(d.name).includes(q) || fold(d.kindLabel).includes(q))) return;
      out.push({ title: d.name || d.kindLabel, sub: `${dayLabel(d.day)}・お酒`, day: d.day,
        go: { screen: "diet", day: d.day } });
    });
    return out.sort(byDayDesc);
  }

  const PLACES = [
    { id: "todo", label: "やること", find: findTodo },
    { id: "shop", label: "買うもの・価格", find: findShop },
    { id: "daily", label: "daily", find: findDaily },
    { id: "body", label: "からだ", find: findBody },
  ];

  /**
   * 打った字で、ほかの場所を探します。
   * @param {string} raw 打ったままの字
   * @param {string} from いまのタブ（その場所は数えない）
   */
  function find(raw, from) {
    const q = fold(String(raw || "").trim());
    const s = KN.store.get();
    const bodyState = KN.diaryIdb ? KN.diaryIdb.body() : "ok";
    const skip = PLACE_OF[from];
    const groups = [];
    let total = 0;
    if (q) {
      PLACES.forEach((p) => {
        if (p.id === skip) return;
        const rows = p.find(s, q, bodyState === "ok");
        if (!rows.length) return;
        total += rows.length;
        groups.push({ id: p.id, label: p.label, rows: rows.slice(0, LIMIT), more: Math.max(0, rows.length - LIMIT) });
      });
    }
    return {
      groups, total,
      when: pastWhen(raw),
      /* daily を探したのに、本文だけは探せなかった */
      bodyNote: q && skip !== "daily" && bodyState !== "ok" ? bodyState : null,
    };
  }

  /* ---------------- 窓の下の一行 ---------------- */

  /** wireSearch（ui.js）が打つたびに呼びます。 */
  const timers = new WeakMap();
  function hint(els) {
    const wrap = els.searchWrap;
    if (!wrap) return;
    clearTimeout(timers.get(wrap));
    const raw = els.search.value;
    if (!raw.trim()) { paintHint(wrap, null); return; }
    /* 打ち終わるまで少し待つ（一字ごとに日記ぜんぶを見ないように）。 */
    timers.set(wrap, setTimeout(() => {
      const scr = wrap.closest(".screen");
      const from = scr ? scr.dataset.screen : "";
      paintHint(wrap, find(raw, from), raw, from);
    }, 180));
  }

  function paintHint(wrap, r, raw, from) {
    let row = wrap.querySelector(".sa-hint");
    if (!r || (!r.total && !r.when)) { if (row) row.remove(); return; }
    if (!row) {
      row = node(html`<div class="sa-hint"></div>`);
      wrap.append(row);
    }
    row.innerHTML = "";
    if (r.when) {
      const b = node(html`<button type="button" class="sa-link sa-when">${r.when.label}の daily へ${icon("chevron")}</button>`);
      b.addEventListener("click", () => go({ screen: "archive", day: monthDay(r.when.ym) }, raw));
      row.append(b);
    }
    if (r.total) {
      const b = node(html`<button type="button" class="sa-link sa-more">ほかの場所に ${r.total}件${icon("chevron")}</button>`);
      b.addEventListener("click", () => { U.haptic(); open(raw, from); });
      row.append(b);
    }
  }

  /** その月の daily で開く日：今月なら今日、過ぎた月なら1日。 */
  function monthDay(ym) {
    const today = U.todayKey();
    return today.slice(0, 7) === ym ? today : `${ym}-01`;
  }

  /* ---------------- 紙 ---------------- */

  let handle = null;

  function open(raw, from) {
    const r = find(raw, from);
    const body = node(html`<div class="sa"></div>`);
    if (r.when) {
      const b = node(html`
        <button type="button" class="sa-row sa-jump">
          <span class="sa-title">${r.when.label}</span>
          <span class="sa-sub">daily のその月へ</span>
        </button>`);
      b.addEventListener("click", () => go({ screen: "archive", day: monthDay(r.when.ym) }, raw));
      body.append(b);
    }
    r.groups.forEach((g) => {
      const sec = node(html`
        <section class="sa-group" data-place="${g.id}">
          <h3 class="sa-head">${g.label}</h3>
          <div class="sa-rows"></div>
          ${g.more ? html`<p class="sa-more-note">ほか ${g.more}件</p>` : ""}
        </section>`);
      const box = sec.querySelector(".sa-rows");
      g.rows.forEach((x) => {
        const b = node(html`
          <button type="button" class="sa-row">
            <span class="sa-title">${x.title}</span>
            <span class="sa-sub">${x.sub}</span>
          </button>`);
        b.addEventListener("click", () => go(x.go, raw));
        box.append(b);
      });
      body.append(sec);
    });
    if (r.bodyNote) {
      body.append(node(html`<p class="sa-note">${r.bodyNote === "loading"
        ? "日記の本文は読み込み中なので、まだ探していません"
        : "日記の本文は、いま読めないので探していません"}</p>`));
    }
    if (!r.groups.length && !r.when) {
      body.append(node(html`<p class="sa-note">ほかの場所には見つかりませんでした</p>`));
    }
    handle = KN.ui.sheet({ title: `「${raw.trim()}」をぜんぶから`, content: body });
    return handle;
  }

  /**
   * その日・その品へ。日のあるものは共通の日（dayShare）を置いてその
   * タブを組み直し、日の無いもの（品物・長期タスク）はそのタブの窓に
   * 同じ字を入れて絞り込みます。
   */
  function go(to, raw) {
    U.haptic();
    if (handle) { handle.close(); handle = null; }
    const scr = to.screen;
    /* 先に移ってから日を置く——移るとき app.js の show() が、出ていく
       画面の日で共通の日を上書きするので。 */
    if (KN.app.activeScreen() !== scr) KN.app.showScreen(scr);
    const S = KN.screens[scr];
    if (to.day) {
      if (scr === "todo" && S.goDay) S.goDay(to.day);
      else { U.dayShare.set(to.day); if (S && S.render) S.render(); }
      return;
    }
    if (to.query) {
      const el = document.querySelector(`#screen-${scr} .js-search`);
      if (!el) return;
      const wrap = el.closest(".js-search-wrap");
      if (wrap) wrap.hidden = false;
      el.value = raw;
      el.dispatchEvent(new Event("input"));
    }
  }

  KN.searchAll = { find, pastWhen, hint, open, go, LIMIT };
})();
