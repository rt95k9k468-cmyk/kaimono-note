/* =========================================================
   くらしノート — 季節の絵（3.0 の E1。docs/roadmap-3.0.md・docs/daily.md の「季節の絵」）

   daily の紙の後ろに一枚。**色と光の層が、いつも土台**：
   1. 候ごとの色（下地）。絵が無い・読めない・オフラインでまだ持っていない日でも、色だけは候ごとに変わる。
   2. 絵（パブリックドメインの浮世絵をごく薄く）。`img/season/kNN.webp`（NN は春分の初候から数えた候の番号
      00〜71。js/season.js の `k`）。読めてから重ねる。

   **絵はまだ一枚も無い**（2026年10月6日。取り込み口 E0 が開いていない——この作業の環境から NDL・ColBase・
   Wikimedia に届かない）。絵を置いたら、`ART` に候の番号ごとの出どころを書き足すだけで、敷く・読む・覚える・
   出典の一覧が効く。出どころの分からない絵は置かない。直リンクはしない（同じ配信元の img/season/ から）。

   色は今は**仮の色**：二十四節気ごとの淡い色を、候ごとに次の節気へ三分の一ずつ寄せたもの。絵が来たら、
   その絵の平均の色に置き換える（tools/season-art.js が測って表に書く）。

   通信：絵は前もって72枚を読まない。今の候と次の候だけ、手の空いたとき（requestIdleCallback）に。
   sw.js が img/season/ を別の名前のキャッシュ（kurashi-season-…）に覚える（版のキャッシュに入れると、
   出すたびに消える）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;

  /* 二十四節気の下地の色（春分から）。仮。字の読みやすさは tests/season-art.js が見張る。 */
  const SEKKI_C = [
    "#f3c6d3", "#e9d4e6", "#cfe3c5", "#bfe0c9", "#d9e7b0", "#b9d8d0",   // 春分 清明 穀雨 立夏 小満 芒種
    "#b7d3e8", "#a9d6e0", "#f2d7a7", "#e9dcae", "#e7cf9f", "#d6dfe6",   // 夏至 小暑 大暑 立秋 処暑 白露
    "#e8c9a8", "#e3b9a0", "#d9c2b0", "#cfcbc0", "#d5d9de", "#cdd6e3",   // 秋分 寒露 霜降 立冬 小雪 大雪
    "#c9cfdc", "#d7d3cf", "#dcdde6", "#ead5d9", "#d3e0d8", "#dbe5c7",   // 冬至 小寒 大寒 立春 雨水 啓蟄
  ];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

  /** 候 k（0〜71）の下地の色。絵の平均の色が表にあればそちら。 */
  function colorOf(k) {
    const a = ART[k];
    if (a && a.color) return a.color;
    const s = Math.floor(k / 3), part = k % 3;
    const c0 = hex(SEKKI_C[s]), c1 = hex(SEKKI_C[(s + 1) % 24]);
    return toHex(c0.map((v, i) => v + (c1[i] - v) * (part / 3)));
  }

  /* 候の番号 → { file, title, author, holder, url, why, color }。絵を置いたら足す（docs/season-art.md の表と同じ中身）。
     いまは空——どの候も色だけ。 */
  const ART = {};

  const fileOf = (k) => `img/season/k${String(k).padStart(2, "0")}.webp`;
  const on = () => KN.store.get().settings.seasonArt !== false;
  const kOf = (day) => { const s = KN.season && KN.season.of(day); return s ? s.k : null; };

  /* 読めた絵（URL）。同じ絵を何度も読みに行かない。 */
  const loaded = new Set();
  const failed = new Set();
  function preload(k, done) {
    const a = ART[k];
    if (!a || !a.file) return;
    const url = a.file;
    if (loaded.has(url)) { if (done) done(url); return; }
    if (failed.has(url)) return;
    const img = new Image();
    img.onload = () => { loaded.add(url); if (done) done(url); };
    img.onerror = () => { failed.add(url); };
    img.src = url;
  }

  /**
   * 画面（daily の `#screen-archive`）に、その日の候の色と絵を敷く。カスタムプロパティは :root ではなく
   * この画面に書く（docs/traps.md）。設定で切ってあれば外す。
   */
  function apply(el, day) {
    if (!el) return;
    if (!on()) {
      el.removeAttribute("data-season");
      el.removeAttribute("data-season-img");
      return;
    }
    const k = kOf(day);
    if (k == null) return;
    el.setAttribute("data-season", String(k));
    KN.util.setVar(el, "--season-c", colorOf(k));
    const a = ART[k];
    if (!a || !a.file) { el.removeAttribute("data-season-img"); el.style.removeProperty("--season-img"); }
    else {
      preload(k, (url) => {
        if (el.getAttribute("data-season") !== String(k)) return;   // 読んでいるあいだに日が移った
        el.style.setProperty("--season-img", `url("${url}")`);
        el.setAttribute("data-season-img", "");
      });
    }
    /* 次の候も、手の空いたときに覚えておく（オフラインで日をまたいでも、絵が待っている）。 */
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    idle(() => preload((k + 1) % 72));
  }

  /** 出典の一覧（設定の奥）。絵のある候だけ。 */
  function credits() {
    return Object.keys(ART).map(Number).sort((a, b) => a - b).map((k) => ({ k, kou: KN.season.KOU[k][0], ...ART[k] }));
  }

  KN.seasonArt = { apply, colorOf, credits, fileOf, ART, SEKKI_C };
})();
