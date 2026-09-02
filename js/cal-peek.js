/* =========================================================
   くらしノート — 暦を、紙を引いて開く

   暦は既定では今週の一行だけです。月ぜんぶを見たいときは題を押せば
   開きますが、押して開くのは「切り替え」であって、**引き出す**のとは
   手つきが違います。下の紙をつまんで下げると、その下から月が出てきます
   ——指が止まればそこで止まり、離せば近いほう（週か月か）へ収まります。

   ここは、その仕掛けだけを持ちます。やること（screen-todo）と daily
   （screen-archive）が、同じものを二枚書き写して持たないために。書き写す
   と、片方だけを直した日に二つの暦が違う動きをします。

   ■ 三層

     .cal-wds    曜日の行。ここは動きません
     .cal-clip   伸び縮みする窓（overflow: hidden）
       .cal-slide   その中のずらし（縦の transform）
         .cal-grid    日のマス（横の transform ＝ 月めくり）

   縦と横で層を分けているのは、月めくりの横ずれを .cal-grid がすでに
   持っているからです——同じ要素に二つの transform は書けません。
   曜日を .cal-grid の外に出したのは、暦が伸びても曜日が上に留まるように。

   ■ 数はひとつ

   開き具合は --cal-p だけ（0＝週、1＝月）。窓の高さ、ずらし、隣の週の
   濃さ、題の右の「›」の傾きが、すべてこれから出ます。途中で指を離しても
   全部が同じところにいる、というのがこの作りの理由です。

   ■ 取る向きは片道ずつ

   閉じているときは**下**へ引くぶんだけ、開いているときは**上**へ押す
   ぶんだけ。逆向きは縦のスクロールに渡します——開いている月をさらに
   引き下げられても、出てくるものがありません。そして上へ戻すのは
   **掴み手（.tl-grip）からだけ**です：紙の本体で上へ引けば、それは下の
   リストを送るスクロールなので。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const { html, node, haptic } = KN.util;

  /* これだけ動いてから、引く手つきだと決めます。10 だと、決まるまでに
     ブラウザのほうが先に画面を送りはじめて、そのとき指の追跡ごと取り
     上げられます（pointercancel）——「掴み手からしか動かない」ように
     感じていたのはこれで、掴み手だけは touch-action: none なので
     ブラウザが手を出さなかったからです。 */
  const SLOP = 5;
  const DONE = 0.34;    // ここまで来ていたら、行った先へ収めます

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

  /** 伸びしろを測ります。**開いた姿**で測るので、呼ぶ前に窓を開けること。 */
  function metrics(cal, here) {
    const clip = cal.querySelector(".cal-clip");
    const slide = cal.querySelector(".cal-slide");
    const grid = cal.querySelector(".cal-grid");
    if (!clip || !slide || !grid) return null;
    const cells = [].slice.call(grid.querySelectorAll(".cal-day"));
    if (cells.length < 8) return null;
    const rowH = cells[7].offsetTop - cells[0].offsetTop;
    const cellH = cells[0].offsetHeight;
    const full = grid.offsetHeight;
    if (!(rowH > 0) || !(cellH > 0) || full <= cellH) return null;
    /* いま見ている日の週が、窓に来る週です。月をめくった先など、その日が
       この月に無いときは先頭の週にします。 */
    let idx = -1;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].dataset.day === here) { idx = i; break; }
    }
    return { clip, slide, grid, cellH, rowH, full, week: idx < 0 ? 0 : Math.floor(idx / 7) };
  }

  /** 0（週）〜1（月）のあいだの、途中の姿を描きます。 */
  function paint(o, m, p) {
    const h = m.cellH + (m.full - m.cellH) * p;
    m.clip.style.height = h.toFixed(1) + "px";
    m.slide.style.transform = `translateY(${(-m.week * m.rowH * (1 - p)).toFixed(1)}px)`;
    if (o.root) o.root.style.setProperty("--cal-p", p.toFixed(3));
  }

  function end(o) {
    const cal = o.cal();
    if (cal) cal.classList.remove("is-peek", "is-settling");
    if (o.root) o.root.classList.remove("is-cal-peek");
  }

  /** 引きはじめ。隠していた週をぜんぶ出してから測ります。 */
  function begin(o) {
    const cal = o.cal();
    if (!cal) return null;
    cal.classList.remove("is-settling");
    cal.classList.add("is-peek");
    if (o.root) o.root.classList.add("is-cal-peek");
    /* 選ばれている字を放します。マウスで引くと紙の上の字が選ばれ、次に
       その上から引いたときブラウザが「選んだ字を運ぶ」ほうの手つきだと
       判断して、こちらの指を取り上げます（pointercancel）。 */
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
    /* 月から週へ戻すときも、いまの週の外に印を付けておきます。同じ CSS が
       濃さと隣の月の日を見ているので、行き（週→月）と帰り（月→週）で
       見え方が違わないように。 */
    o.tagOffWeek(cal, o.here());
    const m = metrics(cal, o.here());
    if (!m) { end(o); return null; }
    paint(o, m, o.isOpen() ? 1 : 0);
    return m;
  }

  /** 指を離したあと。行き先まで滑らせて**から**、はじめて設定に書きます。
      先に書くと暦が組み直されて、途中の姿から跳んでしまいます。 */
  function settle(o, m, open) {
    const cal = o.cal();
    if (!cal || !m) return;
    const done = () => {
      end(o);
      m.clip.style.height = "";
      m.slide.style.transform = "";
      o.commit(open);
    };
    if (KN.motion.still()) { done(); return; }
    cal.classList.add("is-settling");
    if (o.root) o.root.classList.remove("is-cal-peek");   // ここからは滑らせます
    paint(o, m, open ? 1 : 0);
    let over = false;
    const fin = () => {
      if (over) return;
      over = true;
      clearTimeout(tm);
      m.clip.removeEventListener("transitionend", fin);
      done();
    };
    m.clip.addEventListener("transitionend", fin);
    const tm = setTimeout(fin, 420);
  }

  /**
   * 紙に、引く手つきを結びます。
   *
   * o.sheet      引く紙（.tl-sheet）
   * o.root       その画面（スクロールする器）
   * o.cal()      いまの .cal
   * o.isOpen()   月ぜんぶを出しているか
   * o.enabled()  いま引いてよいか（探している最中・暦をしまっているときは false）
   * o.busy()     ほかの手つきが指を持っているか（用事を運んでいる最中など）
   * o.here()     いま見ている日（どの週を窓に出すか）
   * o.tagOffWeek(sec, here)  いまの週の外に印を付ける
   * o.commit(open)           行き先が決まった。設定に書く／塗り直す
   */
  function wire(o) {
    const el = o.sheet;
    let pid = null, x0 = 0, y0 = 0, p0 = 0, p = 0, m = null, live = false, on = false;
    /* 掴み手から始めたかどうか。上へ押し戻すのは、ここからだけです。 */
    let byGrip = false;
    const drop = () => { live = false; on = false; pid = null; m = null; };

    el.addEventListener("pointerdown", (e) => {
      if (!o.cal() || (o.busy && o.busy())) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // 上まで来ているときだけ。途中で引くのは、ただのスクロールです。
      if (!o.root || o.root.scrollTop > 0) return;
      if (o.enabled && !o.enabled()) return;
      pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
      p0 = o.isOpen() ? 1 : 0; p = p0;
      byGrip = !!(e.target.closest && e.target.closest(".tl-grip"));
      live = true; on = false;
      /* 掴み手からのぶんは、この場で指を預かります。上へ押すと紙のほうが
         縮んで指の下から逃げるので、預けておかないと、途中から動きが
         暦のほうへ流れてしまいます（掴み手には押すものが無いので、
         ここで預かって困るものもありません）。 */
      if (byGrip) { try { el.setPointerCapture(pid); } catch (_) { /* だめでも続けます */ } }
    }, { passive: true });

    el.addEventListener("pointermove", (e) => {
      if (!live || e.pointerId !== pid) return;
      if (o.busy && o.busy()) { if (on) settle(o, m, p0 === 1); drop(); return; }
      const dy = e.clientY - y0, dx = e.clientX - x0;
      if (!on) {
        // 横が勝ったら、日送り（wireDaySwipe）の番です。
        if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) { drop(); return; }
        if (Math.abs(dy) < SLOP || Math.abs(dy) <= Math.abs(dx)) return;
        // 閉じているなら下へ、開いているなら上へ。逆向きは渡します。
        if ((dy > 0) === (p0 === 1)) { drop(); return; }
        // 上へ戻すのは掴み手からだけ（下のリストのスクロールを取らない）。
        if (dy < 0 && !byGrip) { drop(); return; }
        m = begin(o);
        if (!m) { drop(); return; }
        on = true;
        try { el.setPointerCapture(pid); } catch (_) { /* 取れなくても続けます */ }
      }
      // 取ったからには、スクロールには渡しません。
      if (e.cancelable) e.preventDefault();
      const span = m.full - m.cellH;
      const moved = dy - Math.sign(dy) * SLOP;
      p = Math.min(1, Math.max(0, p0 + moved / span));
      paint(o, m, p);
    }, { passive: false });

    const up = (e) => {
      if (!live || e.pointerId !== pid) return;
      const was = on, mm = m, pp = p, from = p0;
      drop();
      if (!was) return;
      const open = from === 1 ? pp > 1 - DONE : pp > DONE;
      if (open !== (from === 1)) haptic();
      settle(o, mm, open);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    /* **これは pointermove では止まりません。**

       上まで来ているところから下へ引くと、ブラウザは先に「画面を送る」
       ほうを始めます。始まってしまえば指の追跡は取り上げられ（pointercancel）、
       暦は出てきません。pointermove で preventDefault しても、送るのを
       止めるのは touchmove のほうなので間に合いません。

       だから、こちらが取ると決める前でも——上端にいて、閉じていて、下へ
       向かっているあいだは——ここで渡さないでおきます。紙のどこを持っても
       下へ引けば暦が出るのは、これがあるからです。上へ向かうぶんは
       そのまま渡します（それは下のリストを送るスクロールなので）。 */
    el.addEventListener("touchmove", (e) => {
      if (!live || !e.cancelable) return;
      if (on) { e.preventDefault(); return; }
      const t = e.touches && e.touches[0];
      if (!t) return;
      const dy = t.clientY - y0, dx = t.clientX - x0;
      if (Math.abs(dx) > Math.abs(dy)) return;      // 横は日送りの番
      // 閉じているなら下へ、開いているなら上（掴み手から）だけ。
      if (p0 === 1 ? dy < 0 && byGrip : dy > 0) e.preventDefault();
    }, { passive: false });
  }

  KN.calPeek = { mount, wire };
})();
