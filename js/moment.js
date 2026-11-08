/* =========================================================
   くらしノート — 暦の日の一度きり（docs/motion.md の「暦の日の一度きり」・design-review 13節の動きの 2）

   節気の初日（年24回）は、その日いちばん最初に帯（#head）が見えたとき一度だけ、窓に季節の粒が
   流れる（春は花びら・夏は青葉・秋は紅葉・冬は雪）。元日と祝日は、窓に一度だけ光が渡る。
   - 一日一度。見たことは記録の外の鍵（`kn-moment-seen`＝その日）に置く。書き出し・控えに乗らない。
   - 帯が見えていないとき（設定の上・裏にいる）は見せず、印も付けない——次に見えたときに。
   - 動きを減らす設定では出さない。動かすのは transform と opacity だけ（WAAPI）。
   - 試験はふだん止めてある（tests/lib.js の open。確かめる台本だけ `moment: true`）。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;
  const KEY = "kn-moment-seen";

  const seen = () => { try { return localStorage.getItem(KEY) || ""; } catch (_) { return ""; } };
  const mark = (day) => { try { localStorage.setItem(KEY, day); } catch (_) { /* 書けなければ、この回だけ */ } };

  /** 今日は何の日か："light"（元日・祝日）／"fall"（節気の初日）／null。 */
  function kindOf(day) {
    if (KN.holiday && KN.holiday.of(day)) return { kind: "light" };
    const s = KN.season && KN.season.of(day);
    if (s && s.part === 0 && s.first) return { kind: "fall", sekki: Math.floor(s.k / 3) };
    return null;
  }

  /* 節気（春分から 0〜23）→ 粒。立春(21)〜穀雨(2) 花びら・立夏(3)〜大暑(8) 青葉・立秋(9)〜霜降(14) 紅葉・立冬(15)〜大寒(20) 雪。 */
  function grainOf(sekki) {
    if (sekki >= 21 || sekki <= 2) return "petal";
    if (sekki <= 8) return "leaf";
    if (sekki <= 14) return "maple";
    return "snow";
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  function fall(layer, grain, w, h) {
    const total = KN.motion.ms("--m-moment");
    const n = grain === "snow" ? 18 : 12;
    for (let i = 0; i < n; i++) {
      const g = document.createElement("i");
      g.className = "moment-grain";
      const size = grain === "snow" ? rnd(4, 7) : rnd(7, 11);
      g.style.width = `${size}px`;
      g.style.height = `${grain === "snow" ? size : size * .7}px`;
      g.style.left = `${rnd(-4, 100)}%`;
      layer.append(g);
      const drift = rnd(-1, 1) * w * .12;
      const turn = grain === "snow" ? 0 : rnd(-1, 1) * 240;
      const dur = total * rnd(.55, .8);
      const delay = (total - dur) * (i / n);
      g.animate([
        { transform: `translate(0, -16px) rotate(0deg)`, opacity: 0 },
        { opacity: 1, offset: .12 },
        { opacity: 1, offset: .75 },
        { transform: `translate(${drift}px, ${h + 8}px) rotate(${turn}deg)`, opacity: 0 },
      ], { duration: dur, delay, easing: "linear", fill: "both" });
    }
    return total;
  }

  function light(layer) {
    const band = document.createElement("i");
    band.className = "moment-light";
    layer.append(band);
    const dur = KN.motion.ms("--m-flash");
    band.animate([
      { transform: "translateX(-100%)", opacity: 0 },
      { opacity: 1, offset: .3 },
      { opacity: 1, offset: .7 },
      { transform: "translateX(260%)", opacity: 0 },
    ], { duration: dur, easing: KN.motion.ease("--ease"), fill: "both" });
    return dur;
  }

  let playing = false;
  /** 今日が暦の日で、まだ見ていなくて、帯が見えていれば、一度だけ流す。 */
  function maybe() {
    if (playing) return false;
    const day = KN.util.todayKey();
    if (seen() >= day) return false;
    const what = kindOf(day);
    if (!what) return false;
    if (document.visibilityState !== "visible") return false;
    const head = document.getElementById("head");
    if (!head || head.hidden || document.documentElement.dataset.screen === "settings") return false;
    const box = head.getBoundingClientRect();
    if (box.height < 1 || box.width < 1) return false;
    mark(day);
    if (KN.motion.still()) return false;
    playing = true;
    const layer = document.createElement("div");
    layer.className = `moment is-${what.kind === "light" ? "light" : grainOf(what.sekki)}`;
    layer.setAttribute("aria-hidden", "true");
    head.append(layer);
    const ms = what.kind === "light" ? light(layer) : fall(layer, grainOf(what.sekki), box.width, box.height);
    setTimeout(() => { layer.remove(); playing = false; }, ms + 100);
    return true;
  }

  window.addEventListener("load", () => setTimeout(maybe, KN.motion.ms("--m-flash")));

  KN.moment = { maybe, kindOf, grainOf };
})();
