/* =========================================================
   くらしノート — ダイエット
   =========================================================

   一枚の画面に、上から順に

     今日     … 体重と、その一歩ぶんの動き
     グラフ   … 実測と7日平均、そして目標線
     からだ   … 歩数・距離・消費・睡眠・運動（ヘルスケアから）
     食事     … 今日の合計と、朝昼夕間食
     気づき   … 溜まった記録から読める「関連」
     目標     … 身長・目標・見込み

   ぜんぶを毎日読むためではありません。上の二つで「いまどうなっているか」
   が終わり、下は用があるときだけ降りていくところです。 */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, icon, haptic } = KN.util;
  const U = KN.util;
  const store = KN.store;
  const D = KN.diet;

  let root = null;
  let els = {};
  let range = 30;             // グラフの期間（日）。0 は全期間。
  let analysisWindow = 30;

  const SLOTS = [
    { id: "breakfast", label: "朝食" },
    { id: "lunch",     label: "昼食" },
    { id: "dinner",    label: "夕食" },
    { id: "snack",     label: "間食" },
  ];
  const slotLabel = (id) => (SLOTS.find((s) => s.id === id) || {}).label || "間食";

  /** いま時刻なら、たぶんこの食事。夜遅くに開いたら間食です。 */
  function guessSlot() {
    const h = new Date().getHours();
    if (h < 10) return "breakfast";
    if (h < 15) return "lunch";
    if (h < 21) return "dinner";
    return "snack";
  }

  const kg = (v) => (v == null ? "—" : v.toFixed(1));
  const n0 = (v) => (v == null ? "—" : Math.round(v).toLocaleString());
  /* 0 は「±0.0」と書きます。「0.0」だけだと、増減の欄なのか実測の欄なのかが
     ぱっと読めません。 */
  const signed = (v, d) => {
    if (v == null) return "—";
    const s = v.toFixed(d == null ? 1 : d);
    return /^-?0(\.0+)?$/.test(s) ? "±" + s.replace("-", "") : (v > 0 ? "+" + s : s);
  };
  const hhmm = (min) => (min == null ? "—" : `${Math.floor(min / 60)}時間${String(Math.round(min % 60)).padStart(2, "0")}分`);

  /* ---------------- 組み立て ---------------- */

  function mount(el) {
    root = el;
    root.innerHTML = "";

    const chrome = node(html`
      <div class="stack">
        <header class="topbar">
          <div class="topbar-row">
            <div style="flex:1;min-width:0">
              <h1 class="topbar-title">ダイエット</h1>
              <div class="topbar-sub js-sub"></div>
            </div>
            ${/* 右端から 設定・取り込み。ほかの画面と同じ並べ方で、
                 いちばん右がいつも設定です。 */""}
            <button class="icon-btn js-sync" aria-label="ヘルスケアから取り込む" title="ヘルスケアから取り込む">
              ${icon("download")}
            </button>
            <button class="icon-btn js-settings" aria-label="設定" title="設定">${icon("gear")}</button>
          </div>
        </header>
        <div class="js-body"></div>
      </div>
    `);
    root.append(chrome);

    els = {
      sub: chrome.querySelector(".js-sub"),
      body: chrome.querySelector(".js-body"),
      sync: chrome.querySelector(".js-sync"),
      settings: chrome.querySelector(".js-settings"),
      topbar: chrome.querySelector(".topbar"),
    };

    els.sync.addEventListener("click", openSyncSheet);
    els.settings.addEventListener("click", () => KN.showScreen("settings"));
    root.addEventListener("scroll", () => {
      els.topbar.classList.toggle("is-stuck", root.scrollTop > 4);
    });
  }

  function render() {
    const today = U.todayKey();
    const card = D.dayCard(today);
    const sum = D.weightSummary(Math.max(range || 365, 30));

    els.sub.textContent = U.formatDate(new Date());

    els.body.innerHTML = "";
    els.body.append(node(html`
      <div class="diet">
        <div class="js-today"></div>
        <div class="js-graph"></div>
        <div class="js-body-stats"></div>
        <div class="js-meals"></div>
        <div class="js-insight"></div>
        <div class="js-goal"></div>
      </div>
    `));

    renderToday(els.body.querySelector(".js-today"), card, sum);
    renderGraph(els.body.querySelector(".js-graph"));
    renderBodyStats(els.body.querySelector(".js-body-stats"), card);
    renderMeals(els.body.querySelector(".js-meals"), card);
    renderInsight(els.body.querySelector(".js-insight"));
    renderGoal(els.body.querySelector(".js-goal"), sum);
  }

  /* ---------------- 今日 ---------------- */

  function renderToday(host, card, sum) {
    const w = card.weight;
    const g = sum.goal;
    const pace = D.neededPace();

    const sec = node(html`
      <section class="card diet-hero">
        <button class="diet-hero-main js-weight">
          <span class="diet-hero-label">${w ? (w.source === "health" ? "今日の体重（ヘルスケア）" : "今日の体重") : "今日はまだ量っていません"}</span>
          <span class="diet-hero-value">
            <b class="mono-num">${w ? kg(w.kg) : "—"}</b><small>kg</small>
            ${w && w.fat != null ? html`<span class="diet-hero-fat mono-num">体脂肪 ${w.fat.toFixed(1)}%</span>` : ""}
          </span>
          <span class="diet-hero-cta">${w && condText(w) ? condText(w) + "　" : ""}${w ? "タップして直す" : "タップして記録する"}</span>
        </button>
        <div class="diet-hero-side">
          <div class="diet-stat">
            <span class="diet-stat-label">前回比</span>
            <b class="diet-stat-value mono-num ${sum.delta == null ? "" : sum.delta < 0 ? "is-good" : sum.delta > 0 ? "is-warn" : ""}">${signed(sum.delta)}</b>
            <span class="diet-stat-unit">kg${sum.deltaDays > 1 ? `・${sum.deltaDays}日ぶり` : ""}</span>
          </div>
          <div class="diet-stat">
            <span class="diet-stat-label">7日平均</span>
            <b class="diet-stat-value mono-num">${sum.ma7Now == null ? "—" : sum.ma7Now.toFixed(2)}</b>
            <span class="diet-stat-unit">kg</span>
          </div>
          <div class="diet-stat">
            <span class="diet-stat-label">${g.targetKg == null ? "目標" : "目標まで"}</span>
            <b class="diet-stat-value mono-num">${g.targetKg == null ? "—" : (sum.toGoal == null ? "—" : Math.abs(sum.toGoal).toFixed(1))}</b>
            <span class="diet-stat-unit">${g.targetKg == null ? "未設定" : (sum.toGoal != null && sum.toGoal <= 0 ? "kg 超過達成" : "kg")}</span>
          </div>
        </div>
        ${pace != null ? html`
          <p class="diet-hero-note">目標日まで、週 ${signed(pace, 2)}kg のペースが要ります。</p>` : ""}
      </section>
    `);
    sec.querySelector(".js-weight").addEventListener("click", () => openWeightSheet(card.weight));
    host.append(sec);
  }

  /* ---------------- グラフ ---------------- */

  const RANGES = [
    { id: 7, label: "7日" }, { id: 30, label: "30日" }, { id: 90, label: "90日" },
    { id: 365, label: "1年" }, { id: 0, label: "全部" },
  ];

  function renderGraph(host) {
    const sec = node(html`
      <section class="card section diet-graph-card">
        <div class="section-title">${icon("chart")}体重の推移</div>
        <div class="js-range"></div>
        <div class="js-chart"></div>
        <div class="diet-legend">
          <span class="diet-legend-item"><i class="dot-actual"></i>実測</span>
          <span class="diet-legend-item"><i class="dot-ma7"></i>7日平均</span>
          ${range === 0 || range >= 30 ? html`<span class="diet-legend-item"><i class="dot-ma14"></i>14日平均</span>` : ""}
          ${store.get().diet.goal.targetKg != null ? html`<span class="diet-legend-item"><i class="dot-goal"></i>目標</span>` : ""}
        </div>
      </section>
    `);

    KN.ui.chipRow(sec.querySelector(".js-range"), RANGES.map((r) => ({ id: r.id, label: r.label })), {
      activeId: range,
      onPick: (id) => { range = Number(id); render(); },
    });

    sec.querySelector(".js-chart").append(chart());
    host.append(sec);
  }

  /**
   * SVGのおりがみ。ライブラリは入れません——線が2本と点が並ぶだけのものに
   * 数十KBを積むと、電波の無いところで開くのが遅くなります。
   */
  function chart() {
    const today = U.todayKey();
    const all = D.weightPoints(null, today);
    const from = range === 0
      ? (all.length ? all[0].day : today)
      : U.shiftDay(today, -(range - 1));
    const pts = all.filter((p) => p.day >= from);

    if (pts.length < 2) {
      return node(html`
        <div class="empty diet-empty">
          <div class="empty-text">${pts.length ? "まだ1日ぶんです。" : "この期間の記録がありません。"}
            線が引けるのは2日ぶんからです。</div>
        </div>
      `);
    }

    const W = 320, H = 132, padL = 34, padR = 8, padT = 10, padB = 18;
    const ma7 = D.movingAverage(pts, 7).filter((m) => m.value != null);
    const ma14 = (range === 0 || range >= 30) ? D.movingAverage(pts, 14).filter((m) => m.value != null) : [];
    const goal = store.get().diet.goal.targetKg;

    const t0 = U.dayDate(pts[0].day).getTime();
    const t1 = U.dayDate(pts[pts.length - 1].day).getTime();
    const span = Math.max(1, t1 - t0);

    const values = pts.map((p) => p.kg)
      .concat(ma7.map((m) => m.value), ma14.map((m) => m.value));
    let lo = Math.min(...values), hi = Math.max(...values);
    /* 目標線は、近ければ枠に入れます。20kg先の目標まで無理に収めると、
       実測の線が一本の水平線に潰れて、何も読めなくなります。 */
    if (goal != null && goal >= lo - 6 && goal <= hi + 6) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
    if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.6; hi = mid + 0.6; }
    const padY = (hi - lo) * 0.12;
    lo -= padY; hi += padY;

    const x = (day) => padL + ((U.dayDate(day).getTime() - t0) / span) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    const path = (rows, get) => rows.map((r, i) => `${i ? "L" : "M"}${x(r.day).toFixed(1)} ${y(get(r)).toFixed(1)}`).join(" ");

    const gridVals = [hi - padY, (hi + lo) / 2, lo + padY];
    const svg = node(html`
      <svg class="diet-chart" viewBox="0 0 ${W} ${H}" role="img"
           aria-label="体重の推移のグラフ">
        ${KN.util.raw(gridVals.map((v) =>
          `<line class="diet-gridline" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}"/>`
          + `<text class="diet-axis" x="${padL - 5}" y="${(y(v) + 3.4).toFixed(1)}" text-anchor="end">${v.toFixed(1)}</text>`
        ).join(""))}
        ${goal != null && goal >= lo && goal <= hi
          ? KN.util.raw(`<line class="diet-goal-line" x1="${padL}" y1="${y(goal).toFixed(1)}" x2="${W - padR}" y2="${y(goal).toFixed(1)}"/>`)
          : ""}
        ${ma14.length > 1 ? KN.util.raw(`<path class="diet-ma14" d="${path(ma14, (m) => m.value)}"/>`) : ""}
        ${ma7.length > 1 ? KN.util.raw(`<path class="diet-ma7" d="${path(ma7, (m) => m.value)}"/>`) : ""}
        ${KN.util.raw(pts.map((p) =>
          `<circle class="diet-dot ${p.source === "health" ? "is-health" : ""}" cx="${x(p.day).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="1.9"/>`
        ).join(""))}
        <text class="diet-axis" x="${padL}" y="${H - 5}">${U.formatDay(pts[0].day).replace("今日", "")}</text>
        <text class="diet-axis" x="${W - padR}" y="${H - 5}" text-anchor="end">${U.formatDay(pts[pts.length - 1].day)}</text>
      </svg>
    `);
    return svg;
  }

  /* ---------------- からだ ---------------- */

  /* 数の並びは、見るためだけのものにしません。取り込んだ値を直せず消せず、
     今日より前の日にも触れないと、一度入った間違いがそのまま残ります。
     どの枠を押しても、その日の記録の画面が開きます。 */
  const BODY_ROWS = [
    { type: "steps",         label: "歩数",       unit: "歩",   hint: "8432" },
    { type: "distance",      label: "歩行距離",   unit: "km",   hint: "6.1" },
    { type: "activeEnergy",  label: "アクティブ", unit: "kcal", hint: "430" },
    { type: "restingEnergy", label: "安静時",     unit: "kcal", hint: "1520" },
    { type: "sleep",         label: "睡眠",       unit: "",     hint: "7:12" },
    { type: "heartRate",     label: "心拍数",     unit: "bpm",  hint: "62" },
  ];

  const showValue = (type, v) => {
    if (v == null) return "—";
    if (type === "sleep") return hhmm(v);
    if (type === "distance") return v.toFixed(1);
    return n0(v);
  };

  /** その日のその種目が手で書かれたものか。 */
  const isManual = (day, type) =>
    store.healthOfDay(day, type).some((h) => h.source === "manual");

  function renderBodyStats(host, card) {
    const sync = store.get().diet.sync;
    /* カードに出す四つ。安静時エネルギーは記録の画面にはありますが、ここには
       出しません——毎日ほとんど同じ数で、見て何かが変わるものではないので。
       そのぶんを睡眠に譲ります。 */
    const CARD = ["steps", "distance", "activeEnergy", "sleep"];
    const rows = CARD.map((t) => BODY_ROWS.find((r) => r.type === t)).map((r) => ({
      ...r,
      value: showValue(r.type, card[r.type]),
      manual: isManual(card.day, r.type),
    }));
    const nothing = rows.every((r) => r.value === "—") && !card.workouts.length;

    const sec = node(html`
      <section class="card section">
        <div class="section-title">${icon("heart")}今日のからだ</div>
        <div class="diet-grid">
          ${KN.util.raw(rows.map((r) => `
            <button class="diet-cell js-cell" data-type="${r.type}">
              <span class="diet-cell-label">${r.label}${r.manual ? '<i class="diet-hand" title="手入力">✎</i>' : ""}</span>
              <b class="diet-cell-value mono-num">${r.value}</b>
              ${r.unit ? `<span class="diet-cell-unit">${r.unit}</span>` : ""}
            </button>`).join(""))}
        </div>
        ${card.workouts.length ? html`
          <div class="diet-workouts">
            ${KN.util.raw(card.workouts.map((w) =>
              `<span class="badge">${KN.util.escapeHtml(w.label || "ワークアウト")} ${Math.round(w.value)}分`
              + `${w.kcal != null ? ` ・ ${Math.round(w.kcal)}kcal` : ""}</span>`).join(""))}
          </div>` : ""}
        ${nothing ? html`
          <button class="btn btn-soft btn-block js-import">
            ${icon("download")}ヘルスケアから取り込む
          </button>
          <p class="diet-note">歩数や睡眠は、iPhoneの「ショートカット」で書き出したものを読み込みます。
            やり方は取り込み画面に書いてあります。枠を押せば手で書くこともできます。</p>` : html`
          <div class="diet-foot">
            <button class="btn btn-ghost btn-sm js-log">${icon("edit")}記録を見る・直す</button>
            <span class="diet-note">${sync.lastAt ? `最後の取り込み：${U.formatStamp(sync.lastAt)}` : ""}</span>
          </div>`}
      </section>
    `);
    const btn = sec.querySelector(".js-import");
    if (btn) btn.addEventListener("click", openSyncSheet);
    const log = sec.querySelector(".js-log");
    if (log) log.addEventListener("click", () => openBodySheet(card.day));
    sec.querySelectorAll(".js-cell").forEach((c) => {
      c.addEventListener("click", () => openBodySheet(card.day, c.dataset.type));
    });
    host.append(sec);
  }

  /* ---------------- からだの記録を直す ----------------

     一枚で、見る・直す・消す・別の日へ移る、を全部やります。別々の画面に
     割ると「昨日の歩数を直したい」がどこにあるのか分からなくなるので。 */
  function openBodySheet(day0, focusType) {
    let day = day0 || U.todayKey();

    const body = node(html`<div class="stack"><div class="js-inner"></div></div>`);
    const h = KN.ui.sheet({ title: "からだの記録", content: body });

    function paint() {
      const inner = body.querySelector(".js-inner");
      inner.innerHTML = "";
      const workouts = store.healthOfDay(day, "workout");
      const isToday = day === U.todayKey();

      const el = node(html`
        <div class="stack">
          <div class="diet-daynav">
            <button class="icon-btn js-prev" aria-label="前の日">${icon("chevron", "flip-x")}</button>
            <b>${U.formatDay(day)}</b>
            <button class="icon-btn js-next" aria-label="次の日" ${isToday ? "disabled" : ""}>${icon("chevron")}</button>
            ${isToday ? "" : html`<button class="btn btn-soft btn-sm js-today">今日へ</button>`}
          </div>

          <div class="diet-edit">
            ${KN.util.raw(BODY_ROWS.map((r) => {
              const v = store.healthValue(day, r.type);
              const mine = isManual(day, r.type);
              const rec = store.healthOfDay(day, r.type)[0];
              const shown = v == null ? ""
                : r.type === "sleep" ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`
                : String(v);
              return `
                <label class="diet-edit-row">
                  <span class="diet-edit-name">${r.label}</span>
                  <input class="input js-v" data-type="${r.type}" inputmode="${r.type === "sleep" ? "text" : "decimal"}"
                         value="${shown}" placeholder="${r.hint}">
                  <span class="diet-edit-unit">${r.unit}</span>
                  <span class="diet-edit-src">${v == null ? ""
                    : mine ? "手入力"
                    : rec && rec.importedAt ? "ヘルスケア" : "ヘルスケア"}</span>
                </label>`;
            }).join(""))}
          </div>
          <p class="diet-note">
            欄を<b>空にして保存すると、その値は消えます</b>。消せば、次の取り込みで
            またヘルスケアの値が入ります。<br>
            手で書いた値には「手入力」と付き、<b>取り込みでは上書きされません</b>。
          </p>

          <div class="section-title">ワークアウト</div>
          ${workouts.length ? html`
            <div class="rows">
              ${KN.util.raw(workouts.map((w) => `
                <div class="row">
                  <span class="row-main">
                    <span class="row-title">${KN.util.escapeHtml(w.label || "ワークアウト")}</span>
                    <span class="row-sub">${Math.round(w.value)}分${w.kcal != null ? ` ・ ${Math.round(w.kcal)}kcal` : ""}${w.time ? ` ・ ${w.time}` : ""}</span>
                  </span>
                  <button class="icon-btn js-wdel" data-id="${w.id}" aria-label="消す">${icon("trash")}</button>
                </div>`).join(""))}
            </div>` : html`<p class="diet-note">この日のワークアウトはありません。</p>`}
          <button class="btn btn-soft btn-sm js-wadd">${icon("plus")}ワークアウトを足す</button>

          <button class="btn btn-primary btn-block js-save">保存</button>
        </div>
      `);
      inner.append(el);

      el.querySelector(".js-prev").addEventListener("click", () => { day = U.shiftDay(day, -1); paint(); });
      const next = el.querySelector(".js-next");
      if (!isToday) next.addEventListener("click", () => { day = U.shiftDay(day, 1); paint(); });
      const todayBtn = el.querySelector(".js-today");
      if (todayBtn) todayBtn.addEventListener("click", () => { day = U.todayKey(); paint(); });

      el.querySelectorAll(".js-wdel").forEach((b) => b.addEventListener("click", () => {
        store.removeHealth(b.dataset.id);
        paint();
        render();
      }));
      el.querySelector(".js-wadd").addEventListener("click", () => addWorkout(day, paint));

      el.querySelector(".js-save").addEventListener("click", () => {
        let changed = 0;
        el.querySelectorAll(".js-v").forEach((inp) => {
          const type = inp.dataset.type;
          const raw = inp.value.trim();
          const before = store.healthValue(day, type);
          if (!raw) {
            if (before != null) { store.clearHealth(day, type); changed++; }
            return;
          }
          const v = type === "sleep" ? KN.healthSync.toMinutes(raw)
            : type === "distance" ? KN.healthSync.toKm(raw)
            : parseFloat(raw.replace(/[^\d.]/g, ""));
          if (v == null || !Number.isFinite(v)) return;
          if (before != null && Math.abs(before - v) < 0.0001) return;
          store.setHealth(day, type, v, { unit: KN.healthSync.UNITS[type] || "" });
          changed++;
        });
        h.close();
        render();
        KN.ui.toast(changed ? `${changed}件を直しました` : "変わりはありません");
      });

      if (focusType) {
        const target = el.querySelector(`.js-v[data-type="${focusType}"]`);
        if (target) KN.ui.focusNow(target);
        focusType = null;
      }
    }

    paint();
  }

  function addWorkout(day, after) {
    const b = node(html`
      <div class="stack">
        <label class="field"><span class="field-label">種目</span>
          <input class="input js-n" placeholder="例：ウォーキング"></label>
        <div class="field-row">
          <label class="field" style="flex:1"><span class="field-label">時間（分）</span>
            <input class="input js-m" inputmode="numeric" placeholder="42"></label>
          <label class="field" style="flex:1"><span class="field-label">kcal</span>
            <input class="input js-k" inputmode="numeric" placeholder="任意"></label>
          <label class="field" style="flex:1"><span class="field-label">時刻</span>
            <input type="time" class="input js-t2" value="${U.nowTime()}"></label>
        </div>
      </div>
    `);
    const f = node(html`<button class="btn btn-primary btn-block">足す</button>`);
    const hh = KN.ui.sheet({ title: "ワークアウトを足す", content: b, footer: f });
    KN.ui.focusNow(b.querySelector(".js-n"));
    f.addEventListener("click", () => {
      const min = parseFloat(String(b.querySelector(".js-m").value).replace(/[^\d.]/g, ""));
      if (!(min > 0)) { KN.ui.toast("時間を入れてください"); return; }
      const kcal = parseFloat(String(b.querySelector(".js-k").value).replace(/[^\d.]/g, ""));
      const time = b.querySelector(".js-t2").value || null;
      store.putHealth({
        type: "workout", day, time, value: min, unit: "分",
        label: b.querySelector(".js-n").value.trim() || "ワークアウト",
        kcal: Number.isFinite(kcal) ? kcal : null,
        source: "manual",
        externalId: `manual:${day}:${time || "?"}:${min}`,
      });
      hh.close();
      after();
      render();
    });
  }

  /* ---------------- 食事 ---------------- */

  function renderMeals(host, card) {
    const t = card.totals;
    const rem = card.remaining;
    const pfc = card.pfc;
    const meals = store.mealsOfDay(card.day);

    const sec = node(html`
      <section class="card section">
        <div class="section-title">${icon("meal")}今日の食事</div>

        <div class="diet-kcal">
          <div class="diet-kcal-main">
            <b class="mono-num">${t ? t.kcal.toLocaleString() : "—"}</b><small>kcal</small>
            ${t && t.estimated ? html`<span class="badge badge-muted">推定を含む</span>` : ""}
          </div>
          ${rem ? html`
            <div class="diet-kcal-rem ${rem.kcal < 0 ? "is-over" : ""}">
              ${rem.kcal >= 0 ? html`残り <b class="mono-num">${rem.kcal.toLocaleString()}</b> kcal`
                              : html`<b class="mono-num">${Math.abs(rem.kcal).toLocaleString()}</b> kcal 超過`}
              <span class="diet-kcal-target">/ 目標 ${rem.target.toLocaleString()}</span>
            </div>` : ""}
        </div>

        ${t ? html`
          <div class="diet-pfc">
            ${/* 棒が何を言っているかは一つに決めます。目標があるならその進み具合、
                 無いなら熱量の内わけ。同じ棒に二つの意味を持たせると、
                 「Pの棒が短いのは足りないから? それとも脂質が多いから?」
                 が毎回わからなくなります。 */""}
            ${KN.util.raw(["p", "f", "c"].map((k) => {
              const name = { p: "P たんぱく質", f: "F 脂質", c: "C 炭水化物" }[k];
              const goalV = store.get().diet.goal[k + "Target"];
              const pct = goalV ? Math.min(100, Math.round(t[k] / goalV * 100))
                                : (pfc ? pfc[k] : 0);
              const over = goalV && t[k] > goalV;
              return `
                <div class="diet-pfc-row">
                  <span class="diet-pfc-name">${name}</span>
                  <span class="diet-pfc-bar ${over ? "is-over" : ""}"><i class="is-${k}" style="width:${pct}%"></i></span>
                  <span class="diet-pfc-num mono-num">${t[k]}g${goalV ? ` / ${goalV}` : ""}</span>
                </div>`;
            }).join(""))}
            <p class="diet-note">${store.get().diet.goal.pTarget
              ? "棒は一日の目安に対する進み具合です。"
              : "棒は熱量の内わけです（目安を決めると、進み具合に変わります）。"}
              ${pfc ? `熱量比 P${pfc.p}% F${pfc.f}% C${pfc.c}%` : ""}</p>
          </div>` : ""}

        <div class="diet-slots">
          ${KN.util.raw(SLOTS.map((s) => {
            const mine = meals.filter((m) => m.slot === s.id);
            const kcal = mine.reduce((a, m) => a + m.items.reduce((x, i) => x + i.kcal, 0), 0);
            const names = mine.flatMap((m) => m.items.map((i) => i.name)).join("・");
            return `
              <button class="diet-slot js-slot" data-slot="${s.id}">
                <span class="diet-slot-head">
                  <b>${s.label}</b>
                  <span class="diet-slot-kcal mono-num">${mine.length ? kcal.toLocaleString() + " kcal" : ""}</span>
                </span>
                <span class="diet-slot-body">${mine.length ? KN.util.escapeHtml(names) : "＋ 記録する"}</span>
              </button>`;
          }).join(""))}
        </div>
      </section>
    `);

    sec.querySelectorAll(".js-slot").forEach((b) => {
      b.addEventListener("click", () => {
        const slot = b.dataset.slot;
        const mine = meals.filter((m) => m.slot === slot);
        if (mine.length === 1) openMealSheet(mine[0]);
        else if (mine.length > 1) pickMeal(mine, slot);
        else openMealSheet(null, slot);
      });
    });
    host.append(sec);
  }

  function pickMeal(list, slot) {
    const body = node(html`<div class="rows"></div>`);
    list.forEach((m) => {
      const kcal = m.items.reduce((a, i) => a + i.kcal, 0);
      const row = node(html`
        <button class="row">
          <span class="row-main">
            <span class="row-title">${m.items.map((i) => i.name).join("・") || "（メモだけ）"}</span>
            <span class="row-sub">${m.time || ""}</span>
          </span>
          <span class="row-value mono-num">${kcal.toLocaleString()} kcal</span>
        </button>
      `);
      row.addEventListener("click", () => { h.close(); openMealSheet(m); });
      body.append(row);
    });
    const add = node(html`<button class="btn btn-primary btn-block">${icon("plus")}この時間にもう一つ</button>`);
    add.addEventListener("click", () => { h.close(); openMealSheet(null, slot); });
    body.append(add);
    const h = KN.ui.sheet({ title: slotLabel(slot), content: body });
  }

  /* ---------------- 気づいたこと ---------------- */

  function renderInsight(host) {
    const found = D.analyze(analysisWindow);
    const cov = D.coverage(analysisWindow);
    const aiOn = KN.dietAI.configured();

    const sec = node(html`
      <section class="card section">
        <div class="section-title">${icon("sparkles")}気づいたこと</div>
        <div class="js-win"></div>
        ${found.length ? html`
          <div class="diet-findings">
            ${KN.util.raw(found.map((f) => `
              <div class="diet-finding is-${f.tone || "info"}">
                <b>${KN.util.escapeHtml(f.title)}</b>
                <p>${KN.util.escapeHtml(f.text)}</p>
              </div>`).join(""))}
          </div>
          <p class="diet-note">ここに出るのは、並んだ数どうしの<b>関連</b>です。
            どちらがどちらを動かしたのかは、この計算では分かりません。</p>
        ` : html`
          <div class="empty diet-empty">
            <div class="empty-text">まだ言えることがありません。<br>
              直近${cov.days}日のうち、体重 ${cov.weight}日・食事 ${cov.meals}日・歩数 ${cov.steps}日ぶんの記録です。</div>
          </div>`}
        ${aiOn ? html`
          <button class="btn btn-soft btn-block js-ai">${icon("sparkles")}AIに相談する</button>
        ` : html`
          <p class="diet-note">AIの分析を使うには、設定で<b>窓口のURL</b>を決めます。
            APIキーはこのアプリには置きません（このページの中身は誰でも読めるので）。</p>`}
      </section>
    `);

    KN.ui.chipRow(sec.querySelector(".js-win"),
      [{ id: 14, label: "14日" }, { id: 30, label: "30日" }, { id: 90, label: "90日" }],
      { activeId: analysisWindow, onPick: (id) => { analysisWindow = Number(id); render(); } });

    const ai = sec.querySelector(".js-ai");
    if (ai) ai.addEventListener("click", askAI);
    host.append(sec);
  }

  function askAI() {
    const body = node(html`
      <div class="stack">
        <label class="field">
          <span class="field-label">聞きたいこと</span>
          <input class="input js-q" value="ここ2週間の傾向と、来週やるといいことを教えて">
        </label>
        <p class="diet-note">直近30日ぶんの体重・食事・歩数・睡眠を窓口へ送ります。
          買い物リストとやることは送りません。</p>
        <div class="js-out"></div>
      </div>
    `);
    const foot = node(html`<button class="btn btn-primary btn-block js-go">相談する</button>`);
    const h = KN.ui.sheet({ title: "AIに相談", content: body, footer: foot });
    foot.querySelector(".js-go").addEventListener("click", () => {
      const out = body.querySelector(".js-out");
      out.innerHTML = "";
      out.append(node(html`<p class="diet-note">考えています…</p>`));
      KN.dietAI.coach(body.querySelector(".js-q").value, 30)
        .then((text) => {
          out.innerHTML = "";
          out.append(node(html`<div class="diet-ai-out">${text}</div>`));
        })
        .catch((err) => {
          out.innerHTML = "";
          out.append(node(html`<p class="diet-note is-warn">うまくいきませんでした：${err.message}</p>`));
        });
    });
  }

  /* ---------------- 目標 ---------------- */

  function renderGoal(host, sum) {
    const g = sum.goal;
    const proj = D.projection();
    const sec = node(html`
      <section class="card section">
        <div class="section-title">${icon("flag")}目標</div>
        <div class="rows">
          <button class="row js-goal">
            <span class="row-main">
              <span class="row-title">目標体重</span>
              <span class="row-sub">${g.targetKg == null ? "決めていません"
                : `${g.targetKg.toFixed(1)}kg${g.targetDay ? ` ・ ${U.formatDay(g.targetDay)}まで` : ""}`}</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
          <div class="row">
            <span class="row-main">
              <span class="row-title">BMI</span>
              <span class="row-sub">${g.heightCm ? `身長 ${g.heightCm}cm` : "身長を入れると出ます"}</span>
            </span>
            <span class="row-value mono-num">${sum.bmi == null ? "—" : sum.bmi.toFixed(1)}</span>
          </div>
          <div class="row">
            <span class="row-main">
              <span class="row-title">いまの傾き</span>
              <span class="row-sub">7日平均の直線あてはめ</span>
            </span>
            <span class="row-value mono-num">${sum.trendPerWeek == null ? "—" : `${signed(sum.trendPerWeek, 2)} kg/週`}</span>
          </div>
        </div>
        ${proj ? html`<p class="diet-note">${projText(proj)}</p>` : ""}
      </section>
    `);
    sec.querySelector(".js-goal").addEventListener("click", openGoalSheet);
    host.append(sec);
  }

  function projText(p) {
    if (p.reached) return "目標の重さに届いています。";
    if (p.stalled) return "いまの傾きのままだと、目標には近づきません（傾きが目標と逆か、ほぼ横ばいです）。";
    if (p.far) return "いまの傾きだと、目標まで数年かかる計算になります。ペースか目標を見直す頃かもしれません。";
    return `いまの傾き（週 ${signed(p.rate, 2)}kg）が続いた場合、${U.formatDay(p.day)}ごろに目標の重さになる計算です。`
      + "これは予測ではなく、いまの傾きをそのまま伸ばした線です。";
  }

  /* ---------------- 体重を書く ---------------- */

  /* 量る条件。体重は、食前か食後かで1kg近く、着ているかいないかで0.5kg
     以上ふつうに動きます。同じ人の同じ日でも、条件が違えば別の数です。
     ここを書き留めておくと、あとで「増えた」と「着替えなかった」を
     分けて読めます。 */
  const MEAL_CHIPS = [
    { id: "before", label: "食前" },
    { id: "after", label: "食後" },
    { id: "", label: "未記入" },
  ];
  const WEAR_CHIPS = [
    { id: "no", label: "着衣なし" },
    { id: "yes", label: "着衣あり" },
    { id: "", label: "未記入" },
  ];
  const mealLabel = (v) => (v === "before" ? "食前" : v === "after" ? "食後" : "");
  const wearLabel = (v) => (v === true ? "着衣あり" : v === false ? "着衣なし" : "");
  /** 行に添える一言。書いていない条件は言いません。 */
  const condText = (w) => [mealLabel(w && w.meal), wearLabel(w && w.clothed)].filter(Boolean).join("・");

  function openWeightSheet(existing) {
    const w = existing || null;
    /* 新しく書くときは、前回と同じ条件を出しておきます。量る条件は
       ふつう毎日おなじなので、毎回二つ選ばせるのは手数の無駄。
       一度も選んでいなければ、どちらも未記入のままです。 */
    const seed = w || store.lastWeightCondition();
    let meal = seed.meal || null;
    let clothed = seed.clothed == null ? null : seed.clothed;

    const body = node(html`
      <div class="stack">
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">日付</span>
            <input type="date" class="input js-day" value="${w ? w.day : U.todayKey()}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">時刻</span>
            <input type="time" class="input js-time" value="${w && w.time ? w.time : U.nowTime()}">
          </label>
        </div>
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">体重 (kg)</span>
            <input class="input js-kg" inputmode="decimal" placeholder="例：68.4"
                   value="${w ? String(w.kg) : ""}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">体脂肪率 (%)</span>
            <input class="input js-fat" inputmode="decimal" placeholder="任意"
                   value="${w && w.fat != null ? String(w.fat) : ""}">
          </label>
        </div>
        <div class="field">
          <span class="field-label">量ったとき</span>
          <div class="js-meal"></div>
        </div>
        <div class="field">
          <span class="field-label">服装</span>
          <div class="js-wear"></div>
        </div>
        <p class="diet-note">
          食前か食後かで1kg近く、着ているかどうかで0.5kg以上動きます。
          書いておくと、その差を分けて読めます（<b>次からは前回と同じものが
          選ばれます</b>）。
        </p>

        <label class="field">
          <span class="field-label">メモ</span>
          <input class="input js-memo" placeholder="例：飲んだ翌日" value="${w ? w.memo : ""}">
        </label>
        ${w && w.source === "health" ? html`
          <p class="diet-note">これはヘルスケアから入った記録です。ここで直すと、
            手で書いた値として扱われます（次の取り込みで上書きされません）。</p>` : ""}
      </div>
    `);

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        ${w ? html`<button class="btn btn-soft js-del" aria-label="削除">${icon("trash")}</button>` : ""}
        <button class="btn btn-primary js-save" style="flex:1">${w ? "保存" : "記録する"}</button>
      </div>
    `);

    const h = KN.ui.sheet({ title: w ? "体重を直す" : "体重を記録", content: body, footer: foot });
    const kgEl = body.querySelector(".js-kg");
    if (!w) KN.ui.focusNow(kgEl);

    const paintMeal = () => KN.ui.chipRow(body.querySelector(".js-meal"), MEAL_CHIPS, {
      activeId: meal || "",
      onPick: (id) => { meal = id || null; paintMeal(); },
    });
    const paintWear = () => KN.ui.chipRow(body.querySelector(".js-wear"), WEAR_CHIPS, {
      activeId: clothed == null ? "" : (clothed ? "yes" : "no"),
      onPick: (id) => { clothed = id === "yes" ? true : (id === "no" ? false : null); paintWear(); },
    });
    paintMeal();
    paintWear();

    foot.querySelector(".js-save").addEventListener("click", () => {
      const val = parseFloat(String(kgEl.value).replace(/[^\d.]/g, ""));
      if (!(val > 0)) { KN.ui.toast("体重を入れてください"); return; }
      const fatRaw = parseFloat(String(body.querySelector(".js-fat").value).replace(/[^\d.]/g, ""));
      const patch = {
        day: body.querySelector(".js-day").value || U.todayKey(),
        time: body.querySelector(".js-time").value || null,
        kg: val,
        fat: Number.isFinite(fatRaw) && fatRaw > 0 ? fatRaw : null,
        memo: body.querySelector(".js-memo").value.trim(),
        meal, clothed,
        // 手が入ったものは手が入ったものです。次の取り込みで機械の値に
        // 戻されないよう、出どころを書き換えます。
        source: "manual",
      };
      if (w) store.updateWeight(w.id, patch);
      else store.addWeight(patch);
      haptic(10);
      h.close();
      render();
      KN.ui.toast(w ? "直しました" : "記録しました");
    });

    const del = foot.querySelector(".js-del");
    if (del) del.addEventListener("click", async () => {
      const ok = await KN.ui.confirm({ title: "この記録を消す", message: "元に戻せません。", okLabel: "消す", danger: true });
      if (!ok) return;
      store.removeWeight(w.id);
      h.close();
      render();
    });
  }

  /* ---------------- 食事を書く ---------------- */

  function openMealSheet(existing, slotHint) {
    const meal = existing || null;
    let items = meal ? meal.items.map((i) => ({ ...i })) : [];
    let slot = meal ? meal.slot : (slotHint || guessSlot());

    const body = node(html`
      <div class="stack">
        <div class="js-slots"></div>
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">日付</span>
            <input type="date" class="input js-day" value="${meal ? meal.day : U.todayKey()}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">時刻</span>
            <input type="time" class="input js-time" value="${meal && meal.time ? meal.time : U.nowTime()}">
          </label>
        </div>

        <label class="field">
          <span class="field-label">食べたもの</span>
          <div class="input-group">
            <input class="input js-food" placeholder="例：ご飯150g / 卵2個 / 鶏むね肉100g"
                   autocomplete="off" spellcheck="false" enterkeyhint="done">
            <button class="btn btn-primary btn-sm js-add">${icon("plus")}</button>
          </div>
        </label>
        <div class="js-suggest"></div>
        <p class="diet-note">量を書かないと、一食ぶんの目安で入ります。あとから数字は直せます。
          値の出どころは${KN.foodData.SOURCE}です。</p>

        <div class="js-items"></div>
        <div class="js-total"></div>

        ${KN.dietAI.configured() ? html`
          <button class="btn btn-soft btn-block js-photo">${icon("camera")}写真から推定する</button>
        ` : ""}

        <label class="field">
          <span class="field-label">メモ</span>
          <input class="input js-memo" placeholder="任意" value="${meal ? meal.memo : ""}">
        </label>
      </div>
    `);

    const foot = node(html`
      <div style="display:flex;gap:8px;width:100%">
        ${meal ? html`<button class="btn btn-soft js-del" aria-label="削除">${icon("trash")}</button>` : ""}
        <button class="btn btn-primary js-save" style="flex:1">${meal ? "保存" : "記録する"}</button>
      </div>
    `);

    const h = KN.ui.sheet({ title: meal ? "食事を直す" : "食事を記録", content: body, footer: foot });

    KN.ui.chipRow(body.querySelector(".js-slots"), SLOTS, {
      activeId: slot,
      onPick: (id) => { slot = id; KN.ui.chipRow(body.querySelector(".js-slots"), SLOTS, { activeId: slot, onPick: () => {} }); },
    });

    const foodEl = body.querySelector(".js-food");
    const itemsEl = body.querySelector(".js-items");
    const totalEl = body.querySelector(".js-total");
    const sugEl = body.querySelector(".js-suggest");

    if (!meal) KN.ui.focusNow(foodEl);

    function paint() {
      itemsEl.innerHTML = "";
      if (!items.length) {
        itemsEl.append(node(html`<p class="diet-note">まだ何も入っていません。</p>`));
      } else {
        const rows = node(html`<div class="rows diet-items"></div>`);
        items.forEach((it, i) => {
          const row = node(html`
            <div class="row">
              <button class="row-main js-edit">
                <span class="row-title">${it.name}${it.estimated ? html`<span class="badge badge-muted">推定</span>` : ""}</span>
                <span class="row-sub">${it.grams != null ? `${Math.round(it.grams)}g ・ ` : ""}P${it.p} F${it.f} C${it.c}</span>
              </button>
              <span class="row-value mono-num">${it.estimated ? "約" : ""}${it.kcal.toLocaleString()}</span>
              <button class="icon-btn js-drop" aria-label="外す">${icon("close")}</button>
            </div>
          `);
          row.querySelector(".js-drop").addEventListener("click", () => { items.splice(i, 1); paint(); });
          row.querySelector(".js-edit").addEventListener("click", () => editItem(i));
          rows.append(row);
        });
        itemsEl.append(rows);
      }

      const sum = items.reduce((a, i) => ({
        kcal: a.kcal + i.kcal, p: a.p + i.p, f: a.f + i.f, c: a.c + i.c,
      }), { kcal: 0, p: 0, f: 0, c: 0 });
      totalEl.innerHTML = "";
      totalEl.append(node(html`
        <div class="diet-total">
          <b class="mono-num">${Math.round(sum.kcal).toLocaleString()}</b><small>kcal</small>
          <span class="mono-num">P ${sum.p.toFixed(1)} ・ F ${sum.f.toFixed(1)} ・ C ${sum.c.toFixed(1)}</span>
        </div>
      `));
    }

    function editItem(i) {
      const it = items[i];
      const b = node(html`
        <div class="stack">
          <label class="field"><span class="field-label">名前</span>
            <input class="input js-n" value="${it.name}"></label>
          <div class="field-row">
            <label class="field" style="flex:1"><span class="field-label">量 (g)</span>
              <input class="input js-g" inputmode="decimal" value="${it.grams == null ? "" : it.grams}"></label>
            <label class="field" style="flex:1"><span class="field-label">kcal</span>
              <input class="input js-k" inputmode="numeric" value="${it.kcal}"></label>
          </div>
          <div class="field-row">
            <label class="field" style="flex:1"><span class="field-label">P (g)</span>
              <input class="input js-p" inputmode="decimal" value="${it.p}"></label>
            <label class="field" style="flex:1"><span class="field-label">F (g)</span>
              <input class="input js-f" inputmode="decimal" value="${it.f}"></label>
            <label class="field" style="flex:1"><span class="field-label">C (g)</span>
              <input class="input js-c" inputmode="decimal" value="${it.c}"></label>
          </div>
          ${it.estimated ? html`<p class="diet-note">この数は推定です。直すと推定の印は外れます。</p>` : ""}
        </div>
      `);
      const f = node(html`<button class="btn btn-primary btn-block">直す</button>`);
      const hh = KN.ui.sheet({ title: "数を直す", content: b, footer: f });
      f.addEventListener("click", () => {
        const num = (sel, d) => {
          const v = parseFloat(String(b.querySelector(sel).value).replace(/[^\d.]/g, ""));
          return Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0;
        };
        const before = { kcal: it.kcal, p: it.p, f: it.f, c: it.c };
        it.name = b.querySelector(".js-n").value.trim() || it.name;
        const gv = parseFloat(String(b.querySelector(".js-g").value).replace(/[^\d.]/g, ""));
        it.grams = Number.isFinite(gv) && gv > 0 ? gv : null;
        it.kcal = num(".js-k", 0); it.p = num(".js-p", 1); it.f = num(".js-f", 1); it.c = num(".js-c", 1);
        // 数に手が入ったのなら、それはもう推定ではなくその人の申告です。
        if (it.estimated && (before.kcal !== it.kcal || before.p !== it.p || before.f !== it.f || before.c !== it.c)) {
          it.estimated = false;
          it.from = "user";
        }
        hh.close();
        paint();
      });
    }

    /** 一行を食品に当てて、明細に足します。 */
    function addLine(text) {
      const parsed = KN.foodData.parseLine(text);
      if (!parsed || !parsed.name) return false;
      const food = store.findFood(parsed.name);
      if (!food) {
        // 引けなかったものも捨てません。名前だけ入れて、数は本人に任せます。
        items.push({ name: parsed.name, grams: null, kcal: 0, p: 0, f: 0, c: 0, from: "manual", estimated: false, foodId: null });
        paint();
        KN.ui.toast(`「${parsed.name}」は表にありません。数を入れてください`);
        editItem(items.length - 1);
        return true;
      }
      const per100 = food.per !== "unit";
      let grams = KN.foodData.gramsOf(food, parsed.qty, parsed.unit);
      if (grams == null) {
        grams = KN.foodData.defaultServing(food);
        KN.ui.toast(`「${parsed.unit}」では数えられないので、${Math.round(grams)}gにしました`);
      }
      const nut = per100
        ? KN.foodData.nutrientsOf(food, grams)
        // 市販品などで「1個あたり」で登録されているものは、個数ぶん掛けます。
        : (() => {
            const q = parsed.qty == null ? 1 : parsed.qty;
            return { kcal: Math.round(food.kcal * q), p: Math.round(food.p * q * 10) / 10,
                     f: Math.round(food.f * q * 10) / 10, c: Math.round(food.c * q * 10) / 10 };
          })();
      items.push({
        name: food.name, grams: per100 ? Math.round(grams) : (food.unitGrams || null),
        kcal: nut.kcal, p: nut.p, f: nut.f, c: nut.c,
        from: food.kind === "base" ? "base" : food.kind,
        foodId: food.id, estimated: false,
      });
      paint();
      return true;
    }

    function commitInput() {
      const raw = foodEl.value;
      if (!raw.trim()) return;
      // 何行かまとめて貼られたら、行ごとに読みます。
      const lines = raw.split(/[\n,、]/).map((x) => x.trim()).filter(Boolean);
      lines.forEach(addLine);
      foodEl.value = "";
      sugEl.innerHTML = "";
      foodEl.focus();
    }

    body.querySelector(".js-add").addEventListener("click", commitInput);
    foodEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commitInput(); }
    });

    /* 打っているそばから候補を出します。名前の部分だけで探すので、
       「ご飯150」まで打っても候補は消えません。 */
    foodEl.addEventListener("input", () => {
      const parsed = KN.foodData.parseLine(foodEl.value);
      const q = parsed ? parsed.name : "";
      sugEl.innerHTML = "";
      if (q.length < 1) return;
      const mine = store.get().diet.foods
        .filter((f) => U.foldKana(f.name).includes(U.foldKana(q))).slice(0, 3);
      const found = mine.concat(KN.foodData.search(q, 8)).slice(0, 8);
      if (!found.length) return;
      const row = node(html`<div class="chip-row diet-suggest"></div>`);
      found.forEach((f) => {
        const b = node(html`<button type="button" class="chip">${f.name}<span class="chip-count">${Math.round(f.kcal)}</span></button>`);
        b.addEventListener("click", () => {
          // 打った量はそのまま活かします——「とりむね200g」の「200g」は、
          // 候補を押した瞬間に消えていい情報ではありません。
          const tail = parsed && parsed.qty != null ? `${parsed.qty}${parsed.unit || "g"}` : "";
          foodEl.value = f.name + tail;
          commitInput();
        });
        row.append(b);
      });
      sugEl.append(row);
    });

    const photo = body.querySelector(".js-photo");
    if (photo) photo.addEventListener("click", () => pickPhoto((res) => {
      res.items.forEach((it) => items.push(it));
      paint();
      if (res.note) KN.ui.toast(res.note);
    }));

    foot.querySelector(".js-save").addEventListener("click", () => {
      const memo = body.querySelector(".js-memo").value.trim();
      if (!items.length && !memo) { KN.ui.toast("食べたものを入れてください"); return; }
      const patch = {
        day: body.querySelector(".js-day").value || U.todayKey(),
        time: body.querySelector(".js-time").value || null,
        slot, items, memo,
      };
      if (meal) store.updateMeal(meal.id, patch);
      else store.addMeal(patch);
      haptic(10);
      h.close();
      render();
      KN.ui.toast(meal ? "直しました" : "記録しました");
    });

    const del = foot.querySelector(".js-del");
    if (del) del.addEventListener("click", async () => {
      const ok = await KN.ui.confirm({ title: "この食事を消す", message: "元に戻せません。", okLabel: "消す", danger: true });
      if (!ok) return;
      store.removeMeal(meal.id);
      h.close();
      render();
    });

    paint();
  }

  /** 写真を選んで、窓口に投げて、推定を受け取る。 */
  function pickPhoto(onDone) {
    const input = node(html`<input type="file" accept="image/*" capture="environment" hidden>`);
    document.body.append(input);
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const t = KN.ui.toast("写真を見ています…", { duration: 60000 });
      KN.dietAI.shrink(file)
        .then((dataUrl) => KN.dietAI.analyzePhoto(dataUrl))
        .then((res) => {
          t.dismiss();
          if (!res.items.length) { KN.ui.toast("何も読み取れませんでした"); return; }
          onDone(res);
        })
        .catch((err) => { t.dismiss(); KN.ui.toast(`うまくいきませんでした：${err.message}`); });
    });
    input.click();
  }

  /* ---------------- 目標を決める ---------------- */

  function openGoalSheet() {
    const g = store.get().diet.goal;
    const body = node(html`
      <div class="stack">
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">身長 (cm)</span>
            <input class="input js-h" inputmode="decimal" placeholder="例：170"
                   value="${g.heightCm == null ? "" : String(g.heightCm)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">目標体重 (kg)</span>
            <input class="input js-tw" inputmode="decimal" placeholder="例：65"
                   value="${g.targetKg == null ? "" : String(g.targetKg)}">
          </label>
        </div>
        <label class="field">
          <span class="field-label">目標日</span>
          <input type="date" class="input js-td" value="${g.targetDay || ""}">
        </label>

        <div class="divider"></div>
        <div class="section-title">一日の目安</div>
        <div class="field-row">
          <label class="field" style="flex:1">
            <span class="field-label">kcal</span>
            <input class="input js-kcal" inputmode="numeric" value="${g.kcalTarget == null ? "" : String(g.kcalTarget)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">P (g)</span>
            <input class="input js-p" inputmode="numeric" value="${g.pTarget == null ? "" : String(g.pTarget)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">F (g)</span>
            <input class="input js-f" inputmode="numeric" value="${g.fTarget == null ? "" : String(g.fTarget)}">
          </label>
          <label class="field" style="flex:1">
            <span class="field-label">C (g)</span>
            <input class="input js-c" inputmode="numeric" value="${g.cTarget == null ? "" : String(g.cTarget)}">
          </label>
        </div>
        <div class="js-suggest-box"></div>
      </div>
    `);

    const foot = node(html`<button class="btn btn-primary btn-block js-save">保存</button>`);
    const h = KN.ui.sheet({ title: "目標", content: body, footer: foot });

    renderKcalSuggestion(body.querySelector(".js-suggest-box"), body);

    foot.addEventListener("click", () => {
      const num = (sel) => {
        const v = parseFloat(String(body.querySelector(sel).value).replace(/[^\d.]/g, ""));
        return Number.isFinite(v) && v > 0 ? v : null;
      };
      store.setGoal({
        heightCm: num(".js-h"),
        targetKg: num(".js-tw"),
        targetDay: body.querySelector(".js-td").value || null,
        kcalTarget: num(".js-kcal"),
        pTarget: num(".js-p"),
        fTarget: num(".js-f"),
        cTarget: num(".js-c"),
      });
      h.close();
      render();
      KN.ui.toast("保存しました");
    });
  }

  /**
   * kcalの目安。年齢も性別も持っていないので、式では出しません——
   * 代わりに、この人のヘルスケアが実際に記録した消費から出します。
   * 実測が無ければ、この案内自体を出しません。
   */
  function renderKcalSuggestion(host, body) {
    const today = U.todayKey();
    const days = D.daysBetween(U.shiftDay(today, -13), today);
    const burn = days.map((d) => {
      const a = store.healthValue(d, "activeEnergy");
      const r = store.healthValue(d, "restingEnergy");
      return a != null && r != null ? a + r : null;
    }).filter((v) => v != null);
    if (burn.length < 3) return;

    const avg = Math.round(burn.reduce((a, b) => a + b, 0) / burn.length);
    const pace = D.neededPace();
    // 体脂肪1kgぶんの熱量はおよそ7,200〜7,700kcal。真ん中を採ります。
    const perKg = 7450;
    const deficit = pace != null ? Math.round((-pace * perKg) / 7) : null;
    const suggest = deficit != null ? Math.max(1200, avg - deficit) : null;

    const el = node(html`
      <div class="diet-suggest-box">
        <p class="diet-note">直近${burn.length}日の消費は、1日あたり平均 <b>${avg.toLocaleString()}kcal</b> でした
          （ヘルスケアのアクティブ＋安静時）。
          ${suggest != null ? html`目標日までのペースから逆算すると、摂取の目安は
            <b>${Math.round(suggest).toLocaleString()}kcal</b> あたりです。` : ""}
          あくまで目安で、体調や測り方で動きます。</p>
        ${suggest != null ? html`<button class="btn btn-soft btn-sm js-use">この目安を入れる</button>` : ""}
      </div>
    `);
    const use = el.querySelector(".js-use");
    if (use) use.addEventListener("click", () => {
      const k = Math.round(suggest);
      body.querySelector(".js-kcal").value = String(k);
      // PFCは、たんぱく質を体重×1.6g、脂質を熱量の25%、残りを炭水化物に。
      // 減量中のよくある置き方で、そう決めたことは画面にも書いてあります。
      const last = store.latestWeight();
      if (last) {
        const p = Math.round(last.kg * 1.6);
        const f = Math.round((k * 0.25) / 9);
        const c = Math.max(0, Math.round((k - p * 4 - f * 9) / 4));
        body.querySelector(".js-p").value = String(p);
        body.querySelector(".js-f").value = String(f);
        body.querySelector(".js-c").value = String(c);
        KN.ui.toast("P=体重×1.6g、F=熱量の25%、残りをCにしました");
      }
    });
    host.append(el);
  }

  /* ---------------- ヘルスケアの取り込み ----------------

     ここは説明の画面でもあります。iPhoneのヘルスケアはWebアプリからは
     読めないので、あいだにショートカットを一つ挟むことになる——その
     「なぜ」と「どうやって」を、外のどこかではなくここに置きます。

     並べる順は、作る順です。まず手で一行打って動くのを見て、それから
     その一行を機械に書かせる。16個のアクションを先に並べてから動かない
     理由を探すのは、いちばん心の折れる順番なので。 */

  const SAMPLE_MIN = ["day=" + U.todayKey(), "steps=8432", "sleep=7:12"].join("\n");

  const SHORTCUT_SAMPLE = [
    "くらしノート健康データ v1",
    "day=" + U.todayKey(),
    "steps=8432",
    "distance=6.1km",
    "activeEnergy=430",
    "restingEnergy=1520",
    "sleep=7:12",
    "weight=68.4",
    "bodyFat=21.3",
    "heartRate=62",
    "workout=ウォーキング,42,210",
  ].join("\n");

  const KEY_HELP = [
    ["steps", "歩数", "8432"],
    ["distance", "歩行距離", "6.1km / 6100m"],
    ["activeEnergy", "アクティブエネルギー", "430"],
    ["restingEnergy", "安静時エネルギー", "1520"],
    ["sleep", "睡眠", "7:12 / 432 / 7時間12分"],
    ["weight", "体重", "68.4"],
    ["bodyFat", "体脂肪率", "21.3"],
    ["heartRate", "心拍数", "62"],
    ["workout", "ワークアウト", "ウォーキング,42,210"],
    ["day", "どの日のぶんか", U.todayKey()],
  ];

  function openSyncSheet() {
    const sync = store.get().diet.sync;
    const body = node(html`
      <div class="stack">
        <p class="diet-note">
          iPhoneのヘルスケアは、Webアプリから直接は読めません（Safariにその窓口が
          無いためで、設定の問題ではありません）。かわりに<b>ショートカット</b>に
          読み出させて、その結果をここへ渡します。
        </p>

        <div class="divider"></div>
        <div class="section-title">① まず、手で試す</div>
        <p class="diet-note">
          ショートカットを作る前に、<b>入る形</b>を先に見ておくのがいちばん近道です。
          下の欄に打つと、読めたものがその場に出ます。
        </p>
        <textarea class="textarea js-t" rows="4" spellcheck="false"
                  autocapitalize="off" autocorrect="off">${SAMPLE_MIN}</textarea>
        <div class="js-preview"></div>
        <button class="btn btn-primary btn-block js-take">これを取り込む</button>

        <div class="divider"></div>
        <div class="section-title">② 毎日を楽にする（ショートカット）</div>
        <p class="diet-note">
          ①と同じ文字を、ショートカットに書かせます。<b>まず「歩数」だけで作って、
          動いたら残りを足す</b>——先に全部並べると、動かないときにどこが悪いのか
          分からなくなります。
        </p>
        <ol class="diet-steps">
          <li>「ショートカット」アプリ →「＋」で新規作成</li>
          <li><b>「ヘルスサンプルを検索」</b>を追加。
            <b>種類</b>を「歩数」、<b>フィルタ</b>を「開始日」が「今日」に</li>
          <li><b>「統計を計算」</b>を追加。<b>合計</b>を選び、対象は上の結果</li>
          <li><b>「テキスト」</b>を追加して、こう打つ：<br>
            <code>steps=</code> と打ち、その右に一つ前の結果の変数を差し込む</li>
          <li><b>「クリップボードにコピー」</b>を追加</li>
          <li>実行 → このアプリに戻って、下の<b>「コピーしたものを取り込む」</b></li>
        </ol>
        <p class="diet-note">
          動いたら、2〜4をもう一度ずつ足していけば種類が増えます。「テキスト」は
          <b>一つにまとめて</b>、行ごとに <code>distance=</code> <code>sleep=</code> …と
          並べてください。全部そろうとこうなります。
        </p>
        <pre class="diet-code">${SHORTCUT_SAMPLE}</pre>
        <button class="btn btn-soft btn-sm js-copy">この形をコピー</button>
        <p class="diet-note">
          最後に<b>オートメーション</b>（毎朝7時など）に登録しておけば、あとは
          このアプリで一度押すだけになります。
        </p>

        <div class="divider"></div>
        <div class="section-title">③ コピーもやめる（中継所）</div>
        <p class="diet-note">
          ②まで来ると、残る手間は「アプリに戻って一度押す」だけです。それも
          消したいときは、<b>中継所</b>を一つ立てます。ショートカットの最後を
          「クリップボードにコピー」から<b>「URLの内容を取得」（POST）</b>に変えると、
          データはいったん自分の中継所に置かれ、次にこのタブを開いた時に
          くらしノートが自分で受け取ります。受け取ったら中継所からは消えます。
        </p>
        <p class="diet-note">
          ${KN.healthRelay.configured()
            ? html`いまの中継所：<b>${KN.healthRelay.host()}</b>（設定 → ダイエット → 中継所で変えられます）`
            : html`まだ設定していません。<b>iPhoneだけで建てられます</b>——パソコンは
                   要りません。手順はぜんぶ<b>設定 → ダイエット → 中継所</b>の中に
                   書いてあります（コードのコピーも、合言葉づくりも、動くかの確認も、
                   その画面のボタンで済みます）。`}
        </p>

        <div class="divider"></div>
        <div class="section-title">取り込む</div>
        <div class="rows">
          <button class="row js-relay">
            <span class="row-main">
              <span class="row-title">中継所から取り込む</span>
              <span class="row-sub">${KN.healthRelay.configured()
                ? "ショートカットが置いたデータを受け取ります"
                : "未設定（設定 → ダイエット → 中継所）"}</span>
            </span>
            <span class="row-chevron">${icon("download")}</span>
          </button>
          <button class="row js-paste">
            <span class="row-main">
              <span class="row-title">コピーしたものを取り込む</span>
              <span class="row-sub">${store.get().settings.clipboardBlocked
                ? "この端末では自動で読めないので、貼り付けの欄を開きます"
                : "ショートカットがコピーした中身を読みます"}</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
          <button class="row js-file">
            <span class="row-main">
              <span class="row-title">ファイルから取り込む</span>
              <span class="row-sub">「ファイルに保存」したテキストやJSON</span>
            </span>
            <span class="row-chevron">${icon("chevron")}</span>
          </button>
        </div>
        <div class="js-got"></div>
        ${sync.lastAt ? html`<p class="diet-note">最後の取り込み：${U.formatStamp(sync.lastAt)}</p>` : ""}

        <div class="divider"></div>
        <div class="section-title">書ける言葉</div>
        <div class="diet-keys">
          ${KN.util.raw(KEY_HELP.map(([k, name, ex]) => `
            <div class="diet-key">
              <code>${k}</code>
              <span class="diet-key-name">${name}</span>
              <span class="diet-key-ex">${KN.util.escapeHtml(ex)}</span>
            </div>`).join(""))}
        </div>
        <p class="diet-note">
          値が取れなかった行は<b>空のままで大丈夫</b>です（空は「無かった」として扱い、
          0にはしません）。同じ日の同じ種類を何行も書いた場合は、歩数や距離のように
          足せるものは<b>合計</b>されます。JSON形式でも読めます。
        </p>
      </div>
    `);

    const h = KN.ui.sheet({ title: "ヘルスケアから取り込む", content: body });

    const done = (res) => {
      KN.ui.toast(KN.healthSync.describe(res));
      if (res && res.ok) { h.close(); render(); }
    };

    /* ① 打つそばから「何が読めたか」を出します。ショートカットを直すのは
       だいたいここで、返ってくるのが「取り込めませんでした」の一言だけだと、
       どの行が悪いのか永久に分かりません。 */
    const ta = body.querySelector(".js-t");
    const pv = body.querySelector(".js-preview");
    function paintPreview() {
      const res = KN.healthSync.preview(ta.value);
      pv.innerHTML = "";
      if (!res.ok) {
        pv.append(node(html`<p class="diet-note is-warn">${res.error}</p>`));
        return;
      }
      pv.append(node(html`
        <div class="diet-read">
          ${KN.util.raw(res.rows.map((r) => `
            <div class="diet-read-row">
              <span class="diet-read-name">${r.label}</span>
              <b class="mono-num">${KN.util.escapeHtml(r.value)}</b>
              <span class="diet-read-day">${KN.util.escapeHtml(U.formatDay(r.day))}
                ${r.extra ? "・" + KN.util.escapeHtml(r.extra) : ""}</span>
            </div>`).join(""))}
          ${res.unknown ? `<p class="diet-note">読めなかった行が ${res.unknown} 行あります。</p>` : ""}
        </div>
      `));
    }
    ta.addEventListener("input", paintPreview);
    paintPreview();

    body.querySelector(".js-take").addEventListener("click", () => {
      done(KN.healthSync.importText(ta.value));
    });
    /* 「中継所から取り込む」。自動のときと違って、ここでは黙りません——
       押したのに何も言われないのが、いちばん困ります。 */
    body.querySelector(".js-relay").addEventListener("click", () => {
      if (!KN.healthRelay.configured()) {
        KN.ui.toast("設定 → ダイエット → 中継所 でURLを入れてください");
        return;
      }
      const btn = body.querySelector(".js-relay");
      btn.disabled = true;
      KN.healthRelay.pullAndImport().then((res) => {
        if (res.text != null) showGot(res.text);
        if (res.ok) { done(res); return; }
        if (res.text != null) {          // 受け取れたが、中身が読めなかった
          ta.value = res.text;
          paintPreview();
        }
        KN.ui.toast(res.error || "取り込めませんでした");
      }).catch((err) => {
        KN.ui.toast("中継所につなげませんでした（" + (err && err.message || err) + "）");
      }).finally(() => { btn.disabled = false; });
    });

    /* 「コピーしたものを取り込む」。
       読めればそのまま、読めなければ **貼り付けの欄** に切り替えます。
       クリップボードのAPIは環境しだいで断られる道なので、断られたときに
       行き止まりを出すのではなく、必ず通る道へ案内します。 */
    body.querySelector(".js-paste").addEventListener("click", () => {
      /* 一度断られた端末で、毎日おなじ失敗を踏ませません。断られたことを
         覚えて、次からは貼り付けの欄をまっすぐ開きます（欄の中に、また
         自動で読めるか試す口を残してあります——iOSは変わるので）。 */
      if (store.get().settings.clipboardBlocked) {
        openPasteSheet({ why: "この端末では前に断られています" }, done);
        return;
      }
      KN.healthSync.importFromClipboard().then((res) => {
        // 読めた文字列は、うまくいってもいかなくても、そのまま見せます。
        if (res.text != null) showGot(res.text);
        if (res.ok) { done(res); return; }
        if (res.text != null) {
          // 読めたが、中身が取り込めなかった。①の欄に落として、どこが
          // 悪いのかを読み下しで見せます。
          ta.value = res.text;
          paintPreview();
          KN.ui.toast(res.error);
          return;
        }
        // そもそも読めなかった。覚えておいて、理由を添えて貼り付けの道へ。
        store.update((st) => { st.settings.clipboardBlocked = true; });
        openPasteSheet(res, done);
      });
    });

    /* 読めた文字列そのもの。加工しません——「取れているつもりで取れていない」
       を切り分けられるのは、生の中身だけです。 */
    function showGot(text) {
      const host = body.querySelector(".js-got");
      host.innerHTML = "";
      host.append(node(html`
        <div class="diet-got">
          <span class="diet-got-head">クリップボードから取得した文字列（${text.length}文字）</span>
          <pre>${text || "（空）"}</pre>
        </div>
      `));
    }
    body.querySelector(".js-file").addEventListener("click", () => {
      const input = node(html`<input type="file" accept=".txt,.json,text/plain,application/json" hidden>`);
      document.body.append(input);
      input.addEventListener("change", () => {
        const f = input.files && input.files[0];
        input.remove();
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          const text = String(r.result || "");
          const res = KN.healthSync.importText(text);
          if (!res.ok) { ta.value = text.slice(0, 4000); paintPreview(); }
          done(res);
        };
        r.onerror = () => KN.ui.toast("ファイルを読めませんでした");
        r.readAsText(f);
      });
      input.click();
    });
    body.querySelector(".js-copy").addEventListener("click", () => {
      if (navigator.clipboard) navigator.clipboard.writeText(SHORTCUT_SAMPLE);
      KN.ui.toast("コピーしました");
    });
  }

  /* 貼り付けの欄。iOSの「ペースト」はブラウザの権限を通らないので、
     APIが断られても必ず通ります。開いた瞬間に欄へ入れておき、
     長押しから一手で貼れるようにします。 */
  function openPasteSheet(diag, done) {
    const b = node(html`
      <div class="stack">
        <p class="diet-note">
          この端末では、アプリからクリップボードを読み取れませんでした。
          かわりに<b>下の欄を長押しして「ペースト」</b>を押してください。
          貼り付けた時点で読み取ります。
        </p>
        <textarea class="textarea js-p" rows="4" spellcheck="false"
                  autocapitalize="off" autocorrect="off"
                  placeholder="ここに長押し →「ペースト」"></textarea>
        <div class="js-got2"></div>
        <div class="js-pv"></div>
        <button class="btn btn-primary btn-block js-take2">取り込む</button>
        <button class="btn btn-ghost btn-sm js-retry">自動で読めるか、もう一度試す</button>
        ${diag && diag.why ? html`
          <details class="diet-why">
            <summary>読み取れなかった理由</summary>
            <p class="diet-note">${diag.why}</p>
          </details>` : ""}
      </div>
    `);
    const h2 = KN.ui.sheet({ title: "貼り付けて取り込む", content: b });
    const ta2 = b.querySelector(".js-p");
    KN.ui.focusNow(ta2);

    function refresh() {
      const text = ta2.value;
      const got = b.querySelector(".js-got2");
      const pv = b.querySelector(".js-pv");
      got.innerHTML = "";
      pv.innerHTML = "";
      if (!text.trim()) return;
      got.append(node(html`
        <div class="diet-got">
          <span class="diet-got-head">貼り付けられた文字列（${text.length}文字）</span>
          <pre>${text}</pre>
        </div>
      `));
      const res = KN.healthSync.preview(text);
      if (!res.ok) {
        pv.append(node(html`<p class="diet-note is-warn">${res.error}</p>`));
        return;
      }
      pv.append(node(html`
        <div class="diet-read">
          ${KN.util.raw(res.rows.map((r) => `
            <div class="diet-read-row">
              <span class="diet-read-name">${r.label}</span>
              <b class="mono-num">${KN.util.escapeHtml(r.value)}</b>
              <span class="diet-read-day">${KN.util.escapeHtml(U.formatDay(r.day))}</span>
            </div>`).join(""))}
        </div>
      `));
    }

    // paste でも、キーボードで打っても、同じように読み直します。
    ta2.addEventListener("paste", () => setTimeout(refresh, 0));
    ta2.addEventListener("input", refresh);

    b.querySelector(".js-retry").addEventListener("click", () => {
      KN.healthSync.importFromClipboard().then((res) => {
        if (res.text != null) {
          // 読めた。次からはまた自動で読みにいきます。
          store.update((st) => { st.settings.clipboardBlocked = false; });
          ta2.value = res.text;
          refresh();
          if (res.ok) { h2.close(); done(res); return; }
          KN.ui.toast(res.error);
          return;
        }
        KN.ui.toast(res.why || res.error);
      });
    });

    b.querySelector(".js-take2").addEventListener("click", () => {
      // 手入力とまったく同じ道。
      const res = KN.healthSync.importText(ta2.value);
      if (res.ok) h2.close();
      done(res);
    });
  }

  /* ---------------- タブを押したら、そのまま読む ----------------

     ダイエットを開くのは、たいてい「ショートカットを走らせた直後」です。
     だったら開いた時点で一度読みにいけば、押すボタンが一つ減ります。

     三つだけ気をつけます。

       1. **黙って失敗する。** クリップボードに買い物のURLが入っている日の
          ほうが多いので、読めなかった・健康データでなかったときは何も
          言いません。知らせるのは入ったときだけ。
       2. **同じものを何度も知らせない。** 一度読んだ中身は覚えておいて、
          変わっていなければ触りません（タブを行き来するたびに
          「1件を更新」と出るのは、報告ではなく騒音です）。
       3. **切れる。** クリップボードを覗く動きなので、設定で止められます。

     読み取りそのものはタブを押した一拍のうちに始めます——そこを外すと、
     ブラウザは「操作のない読み取り」として断ります。

     中継所を設定してあれば、まずそちらを覗きます。クリップボードと違って
     こちらは操作の一拍を必要としないので、非同期でも構いません。中継所に
     届いていなければ、これまでどおりクリップボードを見にいきます——
     どちらか一方に寄せると、片方しか使っていない日に取りこぼします。 */

  let lastAuto = "";

  /** タブを押した一拍のうちに呼ばれます（app.js の show から）。 */
  function onEnter() {
    const st = store.get().settings;
    if (st.dietAutoSync === false) return;
    // 中継所は「操作のうち」に縛られないので、先に走らせて構いません。
    // ただしクリップボードの読み取りは一拍のうちに始める必要があるので、
    // 中継所の返事を待たずに、同じ拍で並べて始めます。
    if (KN.healthRelay.configured()) pullRelay();
    if (st.clipboardBlocked) return;
    const state = KN.healthSync.clipboardState();
    if (!state.api) return;

    KN.healthSync.readClipboard().then((text) => {
      if (text == null) return;                 // 読めなかった：黙って引く
      if (text === lastAuto) return;            // さっきと同じ中身
      // 健康データの形をしていなければ、触りません。
      const look = KN.healthSync.preview(text);
      if (!look.ok) return;
      lastAuto = text;
      const res = KN.healthSync.importText(text);
      if (!res.ok) return;
      if (!res.added && !res.updated) return;   // 何も変わらなかった
      render();
      KN.ui.toast("ヘルスケア：" + KN.healthSync.describe(res));
    }).catch(() => { /* 黙って引く */ });
  }

  /* 中継所からの自動取り込み。ここも「黙って失敗する」を守ります——
     電波の悪いところでタブを開くたびに赤い字が出るのは、報告ではなく
     邪魔です。中継所の不調を確かめたいときは、設定の「つないでみる」か
     取り込みシートの「中継所から取り込む」を押します。そこでは黙りません。 */
  function pullRelay() {
    KN.healthRelay.pullAndImport().then((res) => {
      if (!res.ok) return;                      // 空も、繋がらないも、黙って引く
      if (!res.added && !res.updated) return;
      lastAuto = res.text || lastAuto;          // 同じ中身を貼り付けからも読まない
      render();
      KN.ui.toast("中継所：" + KN.healthSync.describe(res));
    }).catch(() => { /* 黙って引く */ });
  }

  /* ---------------- ＋ ---------------- */

  function dockButton() {
    const fab = node(html`
      <div class="quick-add">
        <button class="add-fab js-open-add" aria-label="食事を記録">${icon("plus")}</button>
      </div>
    `);
    // いちばん多い操作は食事です。体重は日に一度で、画面の一番上にあります。
    fab.querySelector(".js-open-add").addEventListener("click", () => openMealSheet(null));
    return fab;
  }

  KN.screens = KN.screens || {};
  KN.screens.diet = { mount, render, dockButton, onEnter,
    // 設定やテストから開けるように
    openWeightSheet, openMealSheet, openGoalSheet, openSyncSheet };
})();
