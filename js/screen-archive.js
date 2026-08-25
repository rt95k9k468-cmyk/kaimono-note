/* =========================================================
   くらしノート — daily

   買い物は「何を買う」、やることは「いつまでに何をする」を答えます。
   ここが答えるのは **「あの月は、どんな月だったか」** です。過去にしか
   向いていない画面で、締切も、次にやることも出てきません。

   だから、この画面には **測るものが一つもありません**。目標も、達成率も、
   何日続いたかも、先月より多いか少ないかも出しません。積み上がったものを
   置いておくと、後から読み返せる——それだけの場所です。数を出すところは
   ありますが、それは内訳であって、成績ではありません。地の文（daily log）の
   すぐ下にしか置かないのは、数だけが単独で目に入らないようにするためです。

   画面は三段です。

     こよみ      … どの月を見ているか。日を押すとその日に絞ります
     daily log   … その月の、日ごとの一、二行。起きた時刻と寝た時刻も
     積み上がり  … 読んだ・学んだ・考えた・した・変わった

   並びは **最後に触った順** です。日付順ではありません——去年の本に一行
   足したなら、いまのあなたはその本を考えているので、上に来ます。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const U = KN.util;
  const { html, node, icon, haptic } = U;
  const store = KN.store;

  let root = null;
  let els = {};

  /* 見ている月。null は「今月」。 */
  let viewMonth = null;
  /* 日で絞っているとき、その日。null は「月ぜんぶ」。 */
  let viewDay = null;
  /* 面。"month" か "seed"。 */
  let face = "month";
  /* さがしている文字。空なら通常の一覧。 */
  let query = "";

  const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const curYm = () => viewMonth || ymOf(new Date());
  const ymParts = (ym) => ({ year: +ym.slice(0, 4), month: +ym.slice(5, 7) - 1 });
  const isThisMonth = () => curYm() === ymOf(new Date());

  /* ---------------- こよみ ----------------

     ダイエットのこよみと同じ形にしてあります。押した日に絞り、もう一度
     押すと解けます。**記録の無い日に色は付けません**——空白を目立たせると、
     埋めなかったことを咎める画面になります。ここは咎める場所ではないので、
     書いた日にだけ、その種類の色の粒が出ます。 */
  function calendar() {
    const sec = node(html`
      <section class="cal arc-cal">
        <h2 class="cal-head">
          <span class="cal-month"></span>
          <span class="cal-year"></span>
          <button type="button" class="cal-now js-now" hidden>今月へ</button>
          <span class="cal-nav">
            <button type="button" class="cal-arrow js-prev" aria-label="前の月">${icon("chevron")}</button>
            <button type="button" class="cal-arrow js-next" aria-label="次の月">${icon("chevron")}</button>
          </span>
        </h2>
        <div class="cal-grid"></div>
      </section>
    `);
    sec.querySelector(".js-prev").addEventListener("click", () => goMonth(-1));
    sec.querySelector(".js-next").addEventListener("click", () => goMonth(1));
    sec.querySelector(".js-now").addEventListener("click", () => {
      haptic(); viewMonth = null; viewDay = null; render();
    });
    return sec;
  }

  function goMonth(delta) {
    haptic();
    const { year, month } = ymParts(curYm());
    const d = new Date(year, month + delta, 1);
    // 先の月には行きません（記録は過去にしかないので）。
    if (ymOf(d) > ymOf(new Date())) return;
    viewMonth = ymOf(d);
    viewDay = null;
    render();
  }

  function fillCalendar(sec) {
    const ym = curYm();
    const { year, month } = ymParts(ym);
    const today = U.todayKey();
    const total = new Date(year, month + 1, 0).getDate();
    const lead = new Date(year, month, 1).getDay();

    sec.setAttribute("aria-label", `${year}年${month + 1}月`);
    sec.querySelector(".cal-month").textContent = `${month + 1}月`;
    sec.querySelector(".cal-year").textContent = String(year);
    sec.querySelector(".js-now").hidden = isThisMonth() && !viewDay;

    /* その月ぶんを一度だけ引いて表にします。日ごとに store を引くと、
       31日ぶんで31回なめることになります。 */
    const byDay = {};
    store.entriesOfMonth(ym).forEach((e) => {
      (byDay[e.date] = byDay[e.date] || []).push(e.type);
    });
    const logged = {};
    store.daysOfMonth(ym).forEach((d) => { logged[d.date] = true; });

    const grid = sec.querySelector(".cal-grid");
    grid.innerHTML = "";
    U.WEEKDAYS.forEach((w, i) => grid.append(node(html`
      <span class="cal-wd ${i === 0 ? "is-sun" : (i === 6 ? "is-sat" : "")}">${w}</span>
    `)));
    for (let i = 0; i < lead; i++) grid.append(node(html`<span class="cal-pad"></span>`));

    for (let d = 1; d <= total; d++) {
      const key = U.dayKey(new Date(year, month, d));
      const wd = (lead + d - 1) % 7;
      const isToday = key === today;
      /* 粒は、その日に書いた種類ぶん。四つまでにしてあります——五つ以上を
         並べると 34px の枠では粒が潰れて、ただの帯になります。 */
      const kinds = [...new Set(byDay[key] || [])].slice(0, 4);
      const dots = kinds.map((t) =>
        `<i style="background:${store.archiveType(t).color}"></i>`).join("");
      const cell = node(html`
        <button class="cal-day ${isToday ? "is-today" : ""} ${key === viewDay ? "is-here" : ""}
                       ${wd === 0 ? "is-sun" : (wd === 6 ? "is-sat" : "")}"
                data-day="${key}" ${isToday ? U.raw('aria-current="date"') : ""}
                aria-label="${month + 1}月${d}日${isToday ? "（今日）" : ""}${
                  kinds.length ? ` 記録${kinds.length}種` : ""}${logged[key] ? " log あり" : ""}">
          <span class="cal-n">${String(d)}</span>
          <span class="cal-dots">${U.raw(dots)}${logged[key] && !kinds.length
            ? U.raw('<i class="is-log"></i>') : ""}</span>
        </button>
      `);
      cell.addEventListener("click", () => {
        haptic();
        // 同じ日をもう一度押したら、絞りを解きます。
        viewDay = (viewDay === key) ? null : key;
        render();
      });
      grid.append(cell);
    }
  }

  /* ---------------- daily log ----------------

     「2026年8月 daily log」。その月の、日ごとの一、二行です。

     長い文章は書かせません。中身は別のところ（Notion など）に書く前提で、
     ここに残すのは **「そういう日だった」と後から思い出せるだけの手がかり**
     です。起床と就寝の時刻も持ちますが、これは健康の記録ではなく、
     その日の輪郭を思い出すための瑣末な目印として置いています。 */
  function dailyLog() {
    const ym = curYm();
    const { year, month } = ymParts(ym);
    const days = store.daysOfMonth(ym);
    const sec = node(html`
      <section class="card arc-log">
        <header class="arc-log-head">
          <h2>${year}年${month + 1}月 daily log</h2>
          <button type="button" class="btn btn-soft btn-sm js-write">
            ${icon("edit", "is-sub")}<span>今日を書く</span>
          </button>
        </header>
        <div class="arc-log-body"></div>
      </section>
    `);
    const body = sec.querySelector(".arc-log-body");

    if (!days.length) {
      body.append(node(html`
        <p class="arc-log-empty">まだ何も書いていません。<br>
          その日あったこと・したことを、一、二行で。</p>
      `));
    }
    days.forEach((d) => {
      const dt = U.dayDate(d.date);
      const times = [
        d.wake ? `起 ${d.wake}` : "",
        d.sleep ? `寝 ${d.sleep}` : "",
      ].filter(Boolean).join(" ・ ");
      const row = node(html`
        <button type="button" class="arc-log-row ${d.date === U.todayKey() ? "is-today" : ""}"
                data-day="${d.date}">
          <span class="arc-log-day">
            <b>${String(dt ? dt.getDate() : "")}</b>
            <i>${dt ? U.weekdayJa(d.date) : ""}</i>
          </span>
          <span class="arc-log-text">
            <span class="arc-log-memo">${d.memo || ""}</span>
            ${times ? html`<span class="arc-log-times">${times}</span>` : ""}
          </span>
        </button>
      `);
      row.addEventListener("click", () => openLogSheet(d.date));
      body.append(row);
    });

    sec.querySelector(".js-write").addEventListener("click", () => {
      openLogSheet(viewDay || (isThisMonth() ? U.todayKey() : `${ym}-01`));
    });
    return sec;
  }

  /**
   * 一日ぶんを書くシート。
   *
   * 必須はありません。時刻だけ書いて閉じても、一行だけ書いて閉じても
   * 成立します。**三つとも空にすると、その日の行ごと消えます**——空の行が
   * 溜まると、月を眺めたときに「書いていない日」と見分けられなくなるので。
   */
  function openLogSheet(day) {
    const cur = store.dayLog(day) || {};
    const dt = U.dayDate(day);
    const label = dt ? `${dt.getMonth() + 1}月${dt.getDate()}日（${U.weekdayJa(day)}）` : day;

    const body = node(html`
      <div class="stack" style="gap:14px">
        <label class="field">
          <span class="field-label">その日あったこと・したこと</span>
          <textarea class="input js-memo" rows="3" maxlength="200"
                    placeholder="一、二行で。くわしくは別のところに。">${cur.memo || ""}</textarea>
          <span class="field-hint js-count"></span>
        </label>
        <div class="arc-times">
          <label class="field">
            <span class="field-label">起きた</span>
            <input type="time" class="input js-wake" value="${cur.wake || ""}">
          </label>
          <label class="field">
            <span class="field-label">寝た</span>
            <input type="time" class="input js-sleep" value="${cur.sleep || ""}">
          </label>
        </div>
      </div>
    `);

    /* 二百字で止めます。ここを長く書けるようにすると、日記になります——
       日記はもっと向いた道具があるので、この欄は「手がかり」に留めます。 */
    const memo = body.querySelector(".js-memo");
    const count = body.querySelector(".js-count");
    const paint = () => { count.textContent = `${memo.value.length} / 200`; };
    memo.addEventListener("input", paint);
    paint();

    KN.ui.sheet({
      title: `${label} の log`,
      content: body,
      footer: node(html`<button class="btn btn-primary btn-block js-ok">保存</button>`),
      onClose: null,
    });

    const sheet = document.querySelector(".sheet");
    sheet.querySelector(".js-ok").addEventListener("click", () => {
      store.setDayLog(day, {
        memo: memo.value,
        wake: body.querySelector(".js-wake").value || null,
        sleep: body.querySelector(".js-sleep").value || null,
      });
      haptic();
      KN.ui.toast("書きました");
      document.querySelector(".sheet-backdrop") && document.querySelector(".sheet-backdrop").click();
      render();
    });
  }

  /* ---------------- 積み上がり ----------------

     一覧の主役は **タイトル** です。何を読んだか、何を考えたか。数（ページ数・
     分）は持っていれば添えますが、行の主語にはしません——「120ページ」だけ
     並んだ一覧からは、何も思い出せないからです。 */
  function entryRow(e) {
    const t = store.archiveType(e.type);
    const amount = (e.amount != null && isFinite(e.amount))
      ? `${e.amount}${e.unit || t.unit || ""}` : "";
    const dt = U.dayDate(e.date);
    const when = dt ? `${dt.getMonth() + 1}/${dt.getDate()}` : "";
    /* 直した時刻。書いたときと違うときだけ「直した」と言います——同じなら
       ただの重複で、行が長くなるだけです。 */
    const edited = e.updatedAt && e.createdAt
      && String(e.updatedAt).slice(0, 16) !== String(e.createdAt).slice(0, 16);

    const row = node(html`
      <button type="button" class="arc-row" data-id="${e.id}"
              style="--arc-c:${t.color}">
        <span class="arc-ico">${icon(t.icon, "is-sub")}</span>
        <span class="arc-main">
          <span class="arc-title">${e.title || t.label}</span>
          <span class="arc-sub">
            <span class="arc-kind">${t.label}</span>
            <span>${when}</span>
            ${amount ? html`<span>${amount}</span>` : ""}
            ${edited ? html`<span class="arc-edited">直: ${U.formatStamp(e.updatedAt)}</span>` : ""}
          </span>
          ${e.memo ? html`<span class="arc-memo">${e.memo}</span>` : ""}
        </span>
      </button>
    `);
    row.addEventListener("click", () => openEntrySheet(e));
    return row;
  }

  /** 内訳。**地の文のすぐ下にしか置きません**（数が単独で目に入らないように）。 */
  function counts(ym) {
    const c = store.monthCounts(ym);
    const kinds = store.ARCHIVE_TYPES.filter((t) => c[t.id]);
    if (!kinds.length) return null;
    return node(html`
      <div class="arc-counts">
        ${U.raw(kinds.map((t) => `<span class="arc-count" style="--arc-c:${t.color}">`
          + `<i></i>${t.label} ${c[t.id]}</span>`).join(""))}
      </div>
    `);
  }

  /**
   * 一つ書く／直すシート。
   *
   * **必須はタイトルだけ**です。数も単位もメモも、折りたたみの中に置いて
   * あります——開かなければ見えないので、「何ページ読んだか思い出せないから
   * 書かない」が起きません。入力のハードルを上げる必須項目は作りません。
   */
  function openEntrySheet(existing) {
    const e = existing || null;
    let type = e ? e.type : "reading";

    const body = node(html`
      <div class="stack" style="gap:14px">
        <div class="arc-pick js-pick"></div>
        <label class="field">
          <span class="field-label">タイトル</span>
          <input type="text" class="input js-title" value="${e ? e.title : ""}"
                 placeholder="何を読んだか・考えたか" enterkeyhint="done">
        </label>
        <label class="field">
          <span class="field-label">日付</span>
          <input type="date" class="input js-date" value="${e ? e.date : (viewDay || U.todayKey())}">
        </label>
        <details class="arc-more">
          <summary>くわしく（任意）</summary>
          <div class="stack" style="gap:12px;padding-top:12px">
            <div class="arc-times">
              <label class="field">
                <span class="field-label">数</span>
                <input type="number" class="input js-amount" inputmode="numeric"
                       value="${e && e.amount != null ? e.amount : ""}" placeholder="任意">
              </label>
              <label class="field">
                <span class="field-label">単位</span>
                <input type="text" class="input js-unit" value="${e && e.unit ? e.unit : ""}"
                       placeholder="ページ / 分">
              </label>
            </div>
            <label class="field">
              <span class="field-label">メモ</span>
              <textarea class="input js-memo" rows="2" maxlength="300"
                        placeholder="ひとこと。長い話は別のところに。">${e ? e.memo : ""}</textarea>
            </label>
          </div>
        </details>
      </div>
    `);

    /* 種類を選ぶ札。色はここで初めて出ます——選んだものが、一覧でどの色に
       なるかが、選ぶ時点で分かるように。 */
    const pick = body.querySelector(".js-pick");
    const paintPick = () => {
      pick.innerHTML = "";
      store.ARCHIVE_TYPES.forEach((t) => {
        const b = node(html`
          <button type="button" class="arc-pick-b ${t.id === type ? "is-on" : ""}"
                  style="--arc-c:${t.color}" data-t="${t.id}">
            ${icon(t.icon, "is-sub")}<span>${t.label}</span>
          </button>
        `);
        b.addEventListener("click", () => { type = t.id; haptic(); paintPick(); });
        pick.append(b);
      });
    };
    paintPick();

    const footer = node(html`
      <div style="display:flex;gap:8px">
        ${e ? html`<button class="btn btn-soft js-del">${icon("trash", "is-sub")}</button>` : ""}
        ${e && e.type === "seed"
          ? html`<button class="btn btn-soft js-promote">達成にする</button>` : ""}
        <button class="btn btn-primary js-ok" style="flex:1">${e ? "保存" : "書く"}</button>
      </div>
    `);

    KN.ui.sheet({ title: e ? "記録を直す" : "記録を書く", content: body, footer });
    const close = () => {
      const b = document.querySelector(".sheet-backdrop");
      if (b) b.click();
    };

    footer.querySelector(".js-ok").addEventListener("click", () => {
      const title = body.querySelector(".js-title").value.trim();
      if (!title) { KN.ui.toast("タイトルを入れてください"); return; }
      const patch = {
        type,
        title,
        date: body.querySelector(".js-date").value || U.todayKey(),
        amount: body.querySelector(".js-amount").value,
        unit: body.querySelector(".js-unit").value.trim() || null,
        memo: body.querySelector(".js-memo").value,
      };
      if (e) store.updateEntry(e.id, patch);
      else store.addEntry(patch);
      haptic();
      close();
      render();
    });

    const del = footer.querySelector(".js-del");
    if (del) del.addEventListener("click", async () => {
      const ok = await KN.ui.confirm({
        title: "この記録を消しますか", message: e.title, okLabel: "消す", danger: true,
      });
      if (!ok) return;
      store.removeEntry(e.id);
      close();
      render();
    });

    const pro = footer.querySelector(".js-promote");
    if (pro) pro.addEventListener("click", () => {
      store.promoteSeed(e.id);
      haptic();
      KN.ui.toast("達成にしました");
      close();
      render();
    });
  }

  /* ---------------- 未消化の種 ----------------

     seed だけ、月をまたいで一覧できる動線を持たせています。溜めておく箱
     として使えないと、種は書いた月に埋もれて二度と見つかりません。
     消化したら「達成にする」で done に変わり、この箱から消えます。 */
  function seedList() {
    const seeds = store.openSeeds();
    const wrap = node(html`<div class="stack" style="gap:10px"></div>`);
    if (!seeds.length) {
      wrap.append(node(html`
        <div class="empty">
          ${U.raw(KN.emptyArt.donePad)}
          <p class="empty-title">まだ種はありません</p>
          <p class="empty-sub">思いついたことを置いておくと、ここに溜まります。</p>
        </div>
      `));
      return wrap;
    }
    wrap.append(node(html`
      <p class="arc-seed-note">消化したら「達成にする」で畳めます。</p>
    `));
    const card = node(html`<div class="card arc-list"></div>`);
    seeds.forEach((e) => card.append(entryRow(e)));
    wrap.append(card);
    return wrap;
  }

  /* ---------------- 画面 ---------------- */

  function mount(el) {
    root = el;
    root.innerHTML = "";
    /* 三つ（見出し・さがす欄・本体）を一つの器に入れます——node() は
       いちばん外側の一つしか返さないので、並べて置くと後ろが消えます。 */
    root.append(node(html`
      <div class="stack">
      <header class="topbar">
        <div class="topbar-row">
          <div style="flex:1;min-width:0">
            <h1 class="topbar-title">daily</h1>
            <p class="topbar-sub js-sub"></p>
          </div>
          <button class="icon-btn js-export" aria-label="この月を書き出す">${icon("download")}</button>
        </div>
        <div class="arc-seg js-face">
          <button type="button" class="arc-seg-b is-on" data-f="month">月</button>
          <button type="button" class="arc-seg-b" data-f="seed">種</button>
        </div>
      </header>

      <div class="search-wrap">
        <div class="search-bar">
          ${icon("search")}
          <input class="search-input js-q" placeholder="文字でさがす" aria-label="文字でさがす"
                 autocomplete="off" spellcheck="false">
          <button class="icon-btn js-clear" aria-label="検索をクリア"
                  style="width:28px;height:28px" hidden>${icon("close")}</button>
        </div>
      </div>

      <div class="js-body arc-body"></div>
      </div>
    `));

    els = {
      sub: root.querySelector(".js-sub"),
      body: root.querySelector(".js-body"),
      q: root.querySelector(".js-q"),
      clear: root.querySelector(".js-clear"),
    };

    root.querySelectorAll(".js-face .arc-seg-b").forEach((b) => {
      b.addEventListener("click", () => {
        face = b.dataset.f;
        haptic();
        render();
      });
    });

    /* さがすのは打つたびに。件数が数百のうちは、待たせるほうが目立ちます。 */
    els.q.addEventListener("input", () => { query = els.q.value; render(); });
    els.clear.addEventListener("click", () => {
      query = ""; els.q.value = ""; els.q.focus(); render();
    });

    root.querySelector(".js-export").addEventListener("click", exportThisMonth);

    els.cal = calendar();
    store.subscribe(() => { if (root && !root.hidden) render(); });
  }

  function render() {
    if (!root) return;
    const ym = curYm();
    const { year, month } = ymParts(ym);

    root.querySelectorAll(".js-face .arc-seg-b").forEach((b) => {
      b.classList.toggle("is-on", b.dataset.f === face);
    });
    els.clear.hidden = !query;
    els.body.innerHTML = "";

    /* さがしているあいだは、こよみも log も出しません——探しているのは
       「どの月か」ではなく「どれか」なので、結果だけが要ります。 */
    if (query.trim()) {
      const hits = store.searchEntries(query);
      els.sub.textContent = `「${query.trim()}」`;
      if (!hits.length) {
        els.body.append(node(html`
          <div class="empty">
            <p class="empty-title">見つかりませんでした</p>
            <p class="empty-sub">タイトル・メモ・タグからさがします。</p>
          </div>
        `));
        return;
      }
      els.body.append(node(html`<p class="arc-seed-note">${hits.length}件</p>`));
      const card = node(html`<div class="card arc-list"></div>`);
      hits.forEach((e) => card.append(entryRow(e)));
      els.body.append(card);
      return;
    }

    if (face === "seed") {
      els.sub.textContent = "溜めておいた、まだ形にしていないもの";
      els.body.append(seedList());
      return;
    }

    els.sub.textContent = viewDay
      ? U.formatDate(viewDay)
      : `${year}年${month + 1}月`;

    els.body.append(els.cal);
    fillCalendar(els.cal);

    /* 地の文が先、数はそのすぐ下。この順番は入れ替えません——数が上に来ると、
       数を見に来る画面になります。 */
    els.body.append(dailyLog());
    const c = counts(ym);
    if (c) els.body.append(c);

    const list = viewDay ? store.entriesOfDay(viewDay) : store.entriesOfMonth(ym);
    if (!list.length) {
      els.body.append(node(html`
        <div class="empty">
          ${U.raw(KN.emptyArt.donePad)}
          <p class="empty-title">${viewDay ? "この日の記録はありません" : "この月の記録はありません"}</p>
          <p class="empty-sub">読んだ本・学んだこと・思いついたことを、軽く。</p>
        </div>
      `));
      return;
    }
    const card = node(html`<div class="card arc-list"></div>`);
    list.forEach((e) => card.append(entryRow(e)));
    els.body.append(card);
  }

  /**
   * その月ぶんを JSON で書き出します。
   *
   * いまは控えを取るためのものですが、**後でこの月がどんな時間だったかを
   * 言葉にしてもらう**ときに、そのまま渡せる形にしてあります。数だけ渡すと
   * 数の話しか返ってこないので、地の文（daily log）も一緒に入っています。
   */
  function exportThisMonth() {
    const ym = curYm();
    const data = store.exportMonth(ym);
    const text = JSON.stringify(data, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `daily-${ym}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    haptic();
    KN.ui.toast(`${ym} を書き出しました`);
  }

  function dockButton() {
    const fab = node(html`
      <button class="add-fab js-open-add" aria-label="記録を書く">${icon("plus")}</button>
    `);
    fab.addEventListener("click", () => openEntrySheet(null));
    return fab;
  }

  KN.screens = KN.screens || {};
  KN.screens.archive = { mount, render, dockButton };
})();
