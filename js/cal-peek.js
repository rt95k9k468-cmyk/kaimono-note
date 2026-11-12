/* =========================================================
   くらしノート — 暦の三段（暦なし・週・月）を滑らせる

   段は題を押して替える（取っ手は置かない。docs/shared-header.md の頭）。ここは、段が替わるときの
   滑り（glide）と暦の三層（mount）だけを持つ。

   ■ 並びは先に行き着く先。滑らせるのは見かけだけ（docs/redesign.md 7節の 1）

   押した一拍で画面は行き先を書いて組み直す（盆の背も下の画面の所も、もう行き着いた先）。そのあと
   見かけだけを元の姿から滑らせる——暦は `.cal-slide` と升の translate・opacity、下の画面（#panes）は
   translate。暦の背を毎コマ書くと、そのたびに下の画面ぜんぶが並べ直された（CPU 4倍で週→月 50コマ中
   20ms 超 5・並べ直し 27）。

   - 元の姿は「最初の段の上のきわ」と「段の刻み」の二つで覚える（`read`）。滑っている途中で押されても、
     そのとき見えている所から続く。段は日付で突き合わせる（月が替われば段の番号がずれる）。
   - 暦は盆の外（送る器の外）に居るので、下の画面が暦を覆ってよい——伸びるあいだ下の段は下の画面の
     裏から現れ、畳むあいだは盆の下へはみ出して覆われる（css の `.cal.is-peek`）。
   - 伸びるときは下の画面を上へずらして始めるので、そのぶん底が空く。出ている画面を下へ同じだけ延ばし、
     紙には同じだけ送りしろを足す（延ばすだけだと送れる先が縮み、書いた送りが削られる）。

   ■ 三層

     .cal-wds    曜日の行
     .cal-clip   窓
       .cal-slide   その中のずらし（縦の translate ＝ どの週を上に出すか）
         .cal-grid    日のマス（横の transform ＝ 月めくり）

   縦と横で層を分けているのは、月めくりの横ずれを .cal-grid がすでに
   持っているからです——同じ要素に二つの transform は書けません。
   曜日を .cal-grid の外に出したのは、暦が伸びても曜日が上に留まるように。

   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node } = KN.util;


  /**
   * 暦の三層を組んで、節に足します。中身（曜日・日のマス）を書くのは
   * それぞれの画面の仕事です——日ごとに何を出すかが違うので。
   */
  function mount(sec) {
    const wds = node(html`<div class="cal-wds"></div>`);
    const clip = node(html`
      <div class="cal-clip"><div class="cal-slide"><div class="cal-grid"></div></div></div>
    `);
    sec.append(wds, clip);
    return {
      wds,
      clip,
      slide: clip.querySelector(".cal-slide"),
      grid: clip.querySelector(".cal-grid"),
    };
  }

  const CELLS = ":scope > .cal-day, :scope > .cal-pad";
  const panes = () => document.getElementById("panes");

  /** いまの段。-1＝暦なし、0＝週、1＝月。 */
  const at = (o) => (!o.isShown() ? -1 : (o.isOpen() ? 1 : 0));

  /** 暦の升の並びを読みます。`top`＝最初の段の上のきわ、`pitch`＝段の刻み——**見かけ**で（滑っている途中なら
      その位置。週の姿なら、隠れている段が居るはずの所）。`all`＝ぜんぶの段が出ているか（月の姿・滑らせる姿）。
      暦が無い・しまってあるなら null。測るだけで、何も書きません（週の印を除く）。 */
  function read(o, cal) {
    if (!cal || !cal.isConnected || cal.classList.contains("is-hidden")) return null;
    const clip = cal.querySelector(".cal-clip");
    const slide = cal.querySelector(".cal-slide");
    const grid = cal.querySelector(".cal-grid");
    const kids = grid ? [].slice.call(grid.querySelectorAll(CELLS)) : [];
    if (!clip || !slide || kids.length < 14) return null;
    /* 月の姿は週の印を持たない（画面が外す）。いま見ている日の週を、ここで付け直す。 */
    o.tagOffWeek(cal, o.here());
    const week = Math.floor(Math.max(0, kids.findIndex((c) => !c.classList.contains("is-off-week"))) / 7);
    const cell = kids[week * 7];
    const r = cell.getBoundingClientRect();
    const next = (kids[week * 7 + 7] || kids[week * 7 - 7]).getBoundingClientRect();   // 隣の段（隠れていれば 0）
    const all = next.height > 0;
    const pitch = all ? Math.abs(next.top - r.top) : r.height + (parseFloat(window.getComputedStyle(grid).rowGap) || 0);
    /* 隣の週の濃さ（滑っている途中なら、その濃さから続ける）。 */
    const off = all && cal.classList.contains("is-peek")
      ? kids.find((c) => c.classList.contains("is-off-week") && !c.classList.contains("is-out") && c.classList.contains("cal-day")) : null;
    return {
      cal, clip, slide, grid, kids, week, pitch, all,
      top: r.top - week * pitch,
      clipH: clip.offsetHeight,
      days: kids.map((c) => c.dataset.day || ""),
      fade: !all ? 0 : (off ? parseFloat(window.getComputedStyle(off).opacity) || 0 : 1),
    };
  }

  /* 走っている（または最初の一コマを留めている）滑り。暦は帯に一つなので、一度に一つ。 */
  let live = null;

  /** 滑りを片づけます（終わった・次の一押しが来た・席を移る）。書いたものをぜんぶ剥がすと、行き着いた並びが
      そのまま見える。`quiet` は、すぐあとで画面が組み直すとき（置き直しを頼まない）。 */
  function finish(me, quiet) {
    if (live === me) live = null;
    cancelAnimationFrame(me.raf);
    clearTimeout(me.tm);
    me.anims.forEach((an) => { an.onfinish = null; an.cancel(); });
    if (me.panes) me.panes.style.translate = "";
    if (me.room) {
      me.room.root.style.bottom = "";
      me.room.sc.style.paddingBottom = "";
    }
    const b = me.b;
    if (b) {
      b.cal.classList.remove("is-peek", "is-settling", "is-rows");
      ["--cal-ms", "--cal-ease", "--cal-o0", "--cal-o1"].forEach((k) => b.cal.style.removeProperty(k));
      b.grid.style.removeProperty("--cal-ds");
      b.clip.style.height = "";
      b.slide.style.translate = "";
      /* 月の姿は週の印を持たない（`read` が付けたぶんを返す）。 */
      if (b.all) b.kids.forEach((c) => c.classList.remove("is-off-week"));
    }
    if (quiet) return;
    /* 滑るあいだに組み直されていたら、画面は黙っていたぶん（背の高い月の背・輪・床）を置き直す。そうでなければ
       輪だけ——px で置いてあるので、段を隠した（週へ畳んだ）・段の刻みが変わったあとは所がずれている。 */
    const o = me.o;
    if (b && (o.cal() !== b.cal || !b.kids[0].isConnected)) o.commit({ shown: at(o) >= 0, open: at(o) > 0 });
    else if (b && (!b.all || me.rows) && o.ring) o.ring();
  }

  /** 走っている滑りを止めます（席を移るとき head.js が呼ぶ。並びはもう行き着いた先なので、剥がすだけ）。 */
  function stop() { if (live) finish(live); }

  /**
   * 押して段を替えます（題を押す・面の札・月の段の日）。`write()` が行き先を書いて組み直します（その場で済むこと）。
   *
   * **先に書きます。** 押した札も紙の中身も盆の背もその場で替わり、見かけだけが元の姿から滑ります。前は書くだけで、
   * 暦が一拍で行き先へ跳んでいました（やることの「月」で 93px→506px、紙が 413px 跳ぶ。2026年10月25日）。
   *
   * 動きを減らす設定・暦が見つからないときは、書くだけ。`o` は画面が渡す口（`cal`・`here`・`root`・`isOpen`・
   * `isShown`・`tagOffWeek`・`commit`・`ring`）。`o.root` は書いたあとに読む（組み直すと替わることがある）。
   */
  function glide(o, write) {
    const p = panes();
    if (!o.cal() || !p || KN.motion.still()) { stop(); write(); return; }
    /* 見かけを先に測る。片づけるのは測ったあと・書く前（留めたままだと、画面の組み直しが背の高い月を測らない）。 */
    const a = read(o, o.cal());
    const p0 = p.getBoundingClientRect().top;
    const was = live;
    if (was) finish(was, true);
    write();
    const cal = o.cal();
    const b = read(o, cal);
    const d = p0 - p.getBoundingClientRect().top;      // 下の画面のずれ（負＝上から下りてくる＝暦が伸びた）
    const sc = o.root ? KN.app.scrollerOf(o.root) : null;
    const pad = sc && d < -1 ? parseFloat(window.getComputedStyle(sc).paddingBottom) || 0 : 0;

    /* 暦の中身：滑らせる姿（隠れていた段も出す）での並びと、元の見かけの差。 */
    let from = 0, to = 0, ds = 0, o0 = 1, o1 = 1;
    if (b) {
      const top = b.all ? b.top : b.top + b.week * b.pitch;
      to = b.all ? 0 : -b.week * b.pitch;
      o0 = o1 = b.all ? 1 : 0;
      from = to;
      if (a) {
        const key = b.days.slice(b.week * 7, b.week * 7 + 7).find(Boolean);
        const i = a.days.indexOf(key);
        const shift = i < 0 ? a.week - b.week : Math.floor(i / 7) - b.week;
        from = a.top + shift * a.pitch - top;
        ds = a.pitch - b.pitch;
        o0 = a.fade;
      }
    }
    const rows = Math.abs(ds) >= 0.5;
    const moves = Math.abs(d) >= 1 || Math.abs(from - to) >= 1 || rows;
    if (!moves) {
      if (b && b.all) b.kids.forEach((c) => c.classList.remove("is-off-week"));
      if (was && o.ring) o.ring();
      return;
    }

    /* ---- 最初の一コマは、元の姿のまま留める ----
       重い組み直しの一拍（やることで約40ms）のうちに滑りを始めると、時計は描く前から進み、最初に描かれる一コマで
       もう半分近く開いていた（実測 44%）。 */
    const dist = Math.max(Math.abs(d), Math.abs(from - to), 1);
    const me = live = {
      o, b, rows, anims: [], raf: 0, tm: 0, panes: null, room: null,
      /* 勢い 0 の滑り（止まったところから動き出して、静かに着く）。長さは `--m-grow`。`--ease-out`（出だしが最速）だと
         最初の一コマで 220px 跳び、押したところが「パッと」開いて見えた。 */
      g: KN.motion.glide(dist, 0, { span: dist, base: KN.motion.ms("--m-grow") }),
    };
    if (b) {
      b.cal.classList.add("is-peek");
      b.cal.classList.toggle("is-rows", rows);
      b.cal.style.setProperty("--cal-ms", me.g.ms + "ms");
      b.cal.style.setProperty("--cal-ease", me.g.ease);
      b.cal.style.setProperty("--cal-o0", o0.toFixed(3));
      b.cal.style.setProperty("--cal-o1", String(o1));
      if (rows) b.grid.style.setProperty("--cal-ds", ds.toFixed(1) + "px");
      /* 週へ畳むとき、窓は行き着いた背（一段）を取ったまま、ほかの段は下へはみ出す。 */
      if (!b.all) b.clip.style.height = b.clipH + "px";
      b.slide.style.translate = `0 ${from.toFixed(1)}px`;
      /* 輪は盤の中の px で置いてある。段が出入りすると見ている日の升は盤の中で所を替えるので、滑らせずに置き直す
         （前は輪だけが一拍遅れて、帯の裏から升を追ってきた）。 */
      if (o.ring) o.ring();
    }
    if (Math.abs(d) >= 1) {
      me.panes = p;
      p.style.translate = `0 ${d.toFixed(1)}px`;
      if (d < -1 && sc) {
        me.room = { root: o.root, sc };
        o.root.style.bottom = d.toFixed(1) + "px";
        sc.style.paddingBottom = (pad - d).toFixed(1) + "px";
      }
    }
    me.raf = requestAnimationFrame(() => {
      me.raf = 0;
      if (live !== me) return;
      /* その一コマのうちに暦が差し替わっていたら、滑らせずに放す。 */
      if (b && o.cal() !== b.cal) { finish(me); return; }
      const opt = { duration: me.g.ms, easing: me.g.ease };
      /* 走り出したら留めを行き先に書き替える（終われば、そのまま行き着いた姿）。 */
      if (b) {
        b.cal.classList.add("is-settling");
        me.anims.push(b.slide.animate({ translate: [`0 ${from.toFixed(1)}px`, `0 ${to.toFixed(1)}px`] }, opt));
        b.slide.style.translate = `0 ${to.toFixed(1)}px`;
      }
      if (me.panes) {
        me.anims.push(p.animate({ translate: [`0 ${d.toFixed(1)}px`, "0 0"] }, opt));
        p.style.translate = "";
      }
      me.anims[0].onfinish = () => finish(me);
      /* 保険の時計（暦が帯から外れると、終わりの知らせは来ない）。 */
      me.tm = setTimeout(() => finish(me), me.g.ms + 120);
    });
  }

  KN.calPeek = { mount, glide, stop };
})();
