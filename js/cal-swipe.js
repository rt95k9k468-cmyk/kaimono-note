/* =========================================================
   くらしノート — 暦を横に払う（月めくりと、週送り）

   やること・daily・ダイエットの三つが、同じ一つを分け合います
   ——書き写すと、片方だけを直した日に三つの暦が違う動きをします
   （cal-peek.js・day-swipe.js と同じ扱い）。

   ■ 月と週で、動くものが違う

   **月ぜんぶを出しているとき**は、これまでどおり日のマスの盤ごと横へ
   ずらして、薄くします。月は「一枚の紙」なので、押して送るのが素直です。
   隣の月を先に組んでも、ほとんどは目に入らないまま捨てることになります。

   **週だけ出しているとき**は違います。動くのは一行で、その行の中身は
   「先週の日にち」という、はっきりした行き先です。だから**本物を先に
   並べます**——指のぶんだけ、隣の週が連続して入ってくる。どこまで行けば
   送られるのかが、絵に出ます（day-swipe と同じ考えかた）。

   ■ 隣の週は、横だと決まってから組む

   決まった瞬間（5px）に、前後の週を組んで左右へ置きます。指を離して
   戻ってきたら片づけます——**ふだんの DOM には、いまの週しか居ません**。
   居残ると、`.cal-day[data-day=…]` を探している側が隣の週のほうを掴みます。

   ■ 真ん中は、本物をそのまま使う

   いまの週は組み直しません。`.cal-slide`（生きている盤）をそのまま
   真ん中の一枚として運びます。組み直すと、選んでいる日の輪
   （`.cal-ring`。枠ごとに描かず一つだけ置いて滑らせるもの）が、払って
   いるあいだだけ消えます。左右の二枚は clone なので押せません
   ——押す相手は、着いてから本物に戻ります。

   ■ 隣の週のマスは、**行き先の月**から抜く

   週は月をまたぎます。着いた先の暦は「その日を含む月」で組まれるので、
   その月から見て隣の月の日は薄い字（`.is-out`）になります。先に見せる
   ぶんも同じ月から抜かないと、**払っているあいだだけ濃くて、指を離すと
   薄くなる**、という食い違いが出ます。
   ========================================================= */
(function () {
  "use strict";

  const KN = (window.KN = window.KN || {});

  const AXIS_LOCK = 8;    // これだけ動けば、向きを決めます
  const COMMIT    = 52;   // これだけ動けば、指を離したときに隣へ
  const SETTLE    = 200;  // 離したあと、行き先まで滑る時間
  /* 月をめくるほうの「重くなる」境目。ここから先は、めくることがもう
     決まっていて、残りは指が進んでいるだけです。 */
  const STIFF     = 52;

  /* いま、どこかの暦が指を持っているか。cal-peek（紙を引いて暦を開く）が
     見ます——同じ指を二つが取ると、盤を運んでいる最中に高さまで動きます。 */
  let active = false;

  function wire(o) {
    const sec = o.sec, grid = o.grid;
    if (!sec || !grid) return;

    let id = null, x0 = 0, y0 = 0, dx = 0, axis = null, frame = 0;
    /* 週のときだけ組む三枚。track が null なら、月めくりのほうです。 */
    let track = null, home = null, pageW = 0;

    /* ---- 描く ---- */

    const paint = () => {
      frame = 0;
      if (track) {
        track.style.transform = `translate3d(${-pageW + dx}px,0,0)`;
        return;
      }
      grid.style.transform = dx ? `translateX(${dx}px)` : "";
      grid.style.opacity = dx ? String(Math.max(.35, 1 - Math.abs(dx) / 260)) : "";
    };

    /* ---- 週：三枚を並べる ---- */

    /** 行き先の月の盤。いまの月なら、生きている盤をそのまま見ます。 */
    const gridFor = (ym, cache) => {
      let g = cache.get(ym);
      if (g === undefined) {
        g = o.monthGrid(+ym.slice(0, 4), +ym.slice(5, 7) - 1) || null;
        cache.set(ym, g);
      }
      return g;
    };

    /** その週の一枚。行けない側は、中身の無い一枚で場所だけ取ります
        （真ん中を -100% に置くための足場なので、無いと位置がずれます）。 */
    const pageFor = (day, cache) => {
      const page = document.createElement("div");
      page.className = "cal-wk-page";
      if (!day) { page.classList.add("is-void"); return page; }
      const g = gridFor(String(day).slice(0, 7), cache);
      const from = KN.util.weekOf(day).from;
      for (let i = 0; i < 7; i++) {
        const key = KN.util.shiftDay(from, i);
        const src = g && g.querySelector(`.cal-day[data-day="${key}"]`);
        if (!src) continue;
        /* clone にするのは、生きている盤から抜き取らないためです。押せなく
           なりますが、この二枚は着くまでのあいだしか居ません。 */
        const cell = src.cloneNode(true);
        cell.classList.remove("is-off-week");
        cell.setAttribute("tabindex", "-1");
        /* **`data-day` は外します。** この二枚は `.cal` の中に居るので、
           付けたままだと `cal.querySelector('.cal-day[data-day=…]')` で
           探している側（輪を置く paintHere、週の外に印を付ける tagOffWeek）
           が、生きている盤より先にこちらを掴みます——輪が別の週のマスへ
           飛んだり、先に見せている週が「週の外」と判定されて消えたりします。
           絵として要るのは見た目だけなので、名前は別に持たせます。 */
        cell.removeAttribute("data-day");
        cell.dataset.wkDay = key;
        page.append(cell);
      }
      return page;
    };

    function mount() {
      if (track || !o.monthGrid) return false;
      const slide = sec.querySelector(".cal-slide");
      const clip = sec.querySelector(".cal-clip");
      if (!slide || !clip) return false;
      pageW = clip.getBoundingClientRect().width;
      if (!pageW) return false;

      /* 月の盤は、月ごとに一度だけ組みます（週は月をまたぐので、二つ
         必要になることがあります）。指を離すまでの使い捨てです。 */
      const cache = new Map();
      const back = pageFor(o.step(-1), cache);
      const fwd = pageFor(o.step(1), cache);

      track = document.createElement("div");
      track.className = "cal-wk-track";
      /* 真ん中は、生きている盤そのものを運びます（輪ごと）。片づけるとき
         元へ戻すので、いた場所を覚えておきます。 */
      home = { parent: slide.parentNode, next: slide.nextSibling };
      clip.append(track);
      track.append(back, slide, fwd);
      back.inert = true;
      fwd.inert = true;
      sec.classList.add("is-wk-swipe");
      active = true;
      // 並べた直後に、同じ拍で位置を書きます（一拍も見せません）。
      paint();
      return true;
    }

    function unmount() {
      if (!track) return;
      const slide = sec.querySelector(".cal-slide");
      /* 組み直しで暦ごと入れ替わっていることがあります。そのときは、戻す
         先も戻すものも、もうここには居ません。 */
      if (slide && home && home.parent && home.parent.isConnected) {
        home.parent.insertBefore(slide, home.next);
      }
      track.remove();
      track = null; home = null;
      sec.classList.remove("is-wk-swipe");
      active = false;
    }

    /** 三枚のうち、どれを見せて止まるか。0=前 1=いま 2=次 */
    const settle = (index) => new Promise((resolve) => {
      if (!track) { resolve(); return; }
      const ms = KN.motion && KN.motion.still() ? 0 : SETTLE;
      track.style.transition = ms ? `transform ${ms}ms var(--ease-out)` : "";
      track.style.transform = `translate3d(${-pageW * index}px,0,0)`;
      setTimeout(resolve, ms);
    });

    /* ---- 月：盤ごとずらして、薄くする ---- */

    const resetMonth = () => {
      grid.style.transition = "transform .22s var(--ease-out), opacity .22s";
      dx = 0;
      paint();
      setTimeout(() => { grid.style.transition = ""; }, 240);
    };

    /* ---- 指 ---- */

    sec.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (o.busy && o.busy()) return;
      // 矢印はボタンです。押せるままにします。
      if (e.target.closest && e.target.closest("button.cal-arrow, button.cal-more")) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null;
      grid.style.transition = "";
    });

    sec.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!axis) {
        if (Math.abs(mx) < AXIS_LOCK && Math.abs(my) < AXIS_LOCK) return;
        /* 縦が勝ったら、下のリストのスクロールの番です。向きは最初の
           数ピクセルで決めて、そのまま最後まで持ちます。 */
        axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
        if (axis !== "x") return;
        try { sec.setPointerCapture(id); } catch (err) { /* 取れなくても続けます */ }
        // 週のときだけ、隣の二枚をその場で組みます。
        if (o.isWeek()) mount();
      }
      if (axis !== "x") return;
      if (e.cancelable) e.preventDefault();
      if (track) {
        /* 行けない向きだけ重くします。それ以外は指と1:1で追わせます。 */
        const blocked = mx < 0 ? !o.step(1) : !o.step(-1);
        dx = blocked ? mx * 0.3 : mx;
      } else {
        // 境目から先は、めくることがもう決まっていて、残りは指の進みです。
        dx = Math.abs(mx) <= STIFF ? mx : Math.sign(mx) * (STIFF + (Math.abs(mx) - STIFF) * .3);
      }
      if (!frame) frame = requestAnimationFrame(paint);
    }, { passive: false });

    const end = async (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      const moved = dx;
      id = null; axis = null;
      if (!wasX) { if (track) unmount(); return; }

      const delta = moved < 0 ? 1 : -1;

      if (track) {
        if (Math.abs(moved) < COMMIT || !o.step(delta)) {
          await settle(1);
          unmount();
          return;
        }
        if (KN.motion) KN.motion.fire("nav");
        /* 滑りきってから渡します。着いた位置に見えているのは、これから
           組み直される週と同じ中身なので、継ぎ目が見えません。 */
        await settle(delta > 0 ? 2 : 0);
        o.go(delta);
        // 組み直しで暦ごと入れ替わるのがふつうですが、残っていたら片づけます。
        unmount();
        return;
      }

      if (Math.abs(moved) < COMMIT) { resetMonth(); return; }
      grid.style.transition = "";
      dx = 0;
      paint();
      o.go(delta);
    };

    sec.addEventListener("pointerup", end);
    sec.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== id) return;
      const wasX = axis === "x";
      id = null; axis = null;
      if (!wasX) return;
      if (track) { settle(1).then(unmount); return; }
      resetMonth();
    });
  }

  KN.calSwipe = { wire, isActive: () => active };
})();
