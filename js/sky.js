/* =========================================================
   くらしノート — 帯の空（docs/sky.md）

   上の帯と暦（`#head`）の後ろに、いまの時間帯の空を敷きます。時間帯は
   朝・昼・夕方・夜の四つ。区切りは時計の決まった時刻ではなく、**その日の
   日の出・日の入り**から測ります——夏の18時半はまだ明るく、冬の17時半は
   もう暗いので。

   ■ 書くのは札だけ

   `#head` に `data-sky="morning|day|evening|night"` を付けるだけです。色は
   CSS（base.css の「帯の空」）が明るい面・暗い面ごとに持ち、札が替わると
   ゆっくり移ります。カスタムプロパティは書きません（docs/traps.md）。

   ■ いつも「いま」

   見ている日がどこでも、空はいまの時刻のもの。日を払うたびに空が替わると、
   「帯は微動だにしない」（docs/shared-header.md）に反するので。

   ■ 場所

   位置情報は訊きません。端末の時間帯が日本（+9時間）なら東京、それ以外は
   その時間帯の真ん中の経度で測ります（旅先で、昼に夜空が出ないように）。
   緯度は東京のまま。

   ■ 写真（段2）

   時間帯ごとに一枚（`img/sky/<札>.webp`。出どころは `PHOTO` と docs/sky.md の表）。
   読めてから `data-sky-img` に同じ札を付けます。CSS は二つの札がそろったときだけ
   写真を敷くので、読めないあいだ・オフラインで持っていないあいだは描いた空のまま。
   次の時間帯の一枚も、手の空いたときに読んでおきます。
   ========================================================= */
(function () {
  "use strict";

  const KN = window.KN;

  const LAT = 35.68;
  const TOKYO_LNG = 139.77;
  const SLOTS = ["morning", "day", "evening", "night"];

  /* 区切り（分）。朝は日の出の30分前から10時まで、夕方は日の入りの1時間前から30分後まで。 */
  const DAWN = 30, NOON = 10 * 60, DUSK_BEFORE = 60, DUSK_AFTER = 30;

  /** その日の日の出・日の入り（その日の0時からの分。端末の時刻で）。NOAA の近似式（数分の誤差）。 */
  function sunOf(day) {
    const y = day.getFullYear(), m = day.getMonth(), d = day.getDate();
    const g = 2 * Math.PI / 365 * Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 864e5);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
      + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const rad = Math.PI / 180;
    const cosH = Math.cos(90.833 * rad) / (Math.cos(LAT * rad) * Math.cos(decl)) - Math.tan(LAT * rad) * Math.tan(decl);
    const h = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
    const tz = -new Date(y, m, d, 12).getTimezoneOffset();
    const lng = tz === 540 ? TOKYO_LNG : tz / 4;
    const noon = 720 - 4 * lng - eqt + tz;
    return { rise: noon - 4 * h, set: noon + 4 * h };
  }

  /** その日の区切り（朝・昼・夕方・夜の始まり。分）。 */
  function edgesOf(day) {
    const { rise, set } = sunOf(day);
    return [rise - DAWN, NOON, set - DUSK_BEFORE, set + DUSK_AFTER];
  }

  /** その時刻の時間帯（"morning" | "day" | "evening" | "night"）。 */
  function slotOf(now) {
    const t = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const e = edgesOf(now);
    if (t < e[0] || t >= e[3]) return "night";
    return t < e[1] ? "morning" : t < e[2] ? "day" : "evening";
  }

  /** 次に時間帯が替わる時刻。 */
  function nextChange(now) {
    /* 分は端数のまま（分で切り捨てると、区切りの直前に起きて、次の区切りまで替わらない） */
    const at = (day, min) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, Math.round(min * 6e4));
    const next = edgesOf(now).map((min) => at(now, min)).find((d) => d > now);
    if (next) return next;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return at(tomorrow, edgesOf(tomorrow)[0]);
  }

  /* 札 → 写真（docs/sky.md の「写真の表」と同じ中身。Wikimedia Commons）。CC BY／BY-SA は
     作者・ライセンス・URL の表示が要る（設定 → 外観 →「空の写真の出典」）。sw.js は写真を一度覚えたら
     取り直さないので、**描き直したら `?v=` を上げる**（base.css の --sky-photo も同じ値に）。 */
  const PHOTO = {
    morning: { file: "img/sky/morning.webp?v=2", name: "朝", title: "Mount Fuji early morning from Lake Motosu - Nov 2, 2008", author: "[puamelia]", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Mount_Fuji_early_morning_from_Lake_Motosu_-_Nov_2,_2008.jpg", why: "本栖湖から見た明け方の富士" },
    day: { file: "img/sky/day.webp?v=2", name: "昼", title: "Shirane 3 mountains from Mount Shiomi", author: "Alpsdake", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Shirane_3_mountains_from_Mount_Shiomi.JPG", why: "塩見岳から見た白根三山と青空" },
    evening: { file: "img/sky/evening.webp?v=2", name: "夕方", title: "Shiroyone-Senmaida sunset", author: "MaedaAkihiko", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Shiroyone-Senmaida_sunset.jpg", why: "白米千枚田と海に沈む夕日" },
    night: { file: "img/sky/night.webp?v=2", name: "夜", title: "Niigata-Snowy mountain and spring Milky Way - Flickr - Japanese beauty", author: "Koichi Hayakawa", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Niigata-Snowy_mountain_and_spring_Milky_Way_-_Flickr_-_Japanese_beauty.jpg", why: "雪の山と春の天の川（新潟）" },
  };

  /* 読めた写真・読めなかった写真（同じものを何度も読みに行かない） */
  const loaded = new Set();
  const failed = new Set();
  function preload(slot, done) {
    const p = PHOTO[slot];
    if (!p || failed.has(p.file)) return;
    if (loaded.has(p.file)) { if (done) done(); return; }
    const img = new Image();
    img.onload = () => { loaded.add(p.file); if (done) done(); };
    img.onerror = () => { failed.add(p.file); };
    img.src = p.file;
  }

  const on = () => KN.store.get().settings.sky !== false;
  let timer = 0;
  let wasOn = null;

  /** `#head` に、いまの時間帯の札を付ける（設定で切ってあれば外す）。同じ札なら触らない。 */
  function apply() {
    const head = document.getElementById("head");
    if (!head) return;
    wasOn = on();
    const want = wasOn ? slotOf(new Date()) : null;
    if (!want) { head.removeAttribute("data-sky"); head.removeAttribute("data-sky-img"); }
    else if (head.getAttribute("data-sky") !== want) head.setAttribute("data-sky", want);
    if (want && head.getAttribute("data-sky-img") !== want) {
      preload(want, () => { if (head.getAttribute("data-sky") === want) head.setAttribute("data-sky-img", want); });
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
      idle(() => preload(SLOTS[(SLOTS.indexOf(want) + 1) % 4]));
    }
    clearTimeout(timer);
    /* 隠れているあいだの時計は止まることがある（iPhone）。戻ってきたときにも測り直す（下）。 */
    if (want) timer = setTimeout(apply, Math.max(1000, nextChange(new Date()) - Date.now() + 1000));
  }

  apply();
  KN.store.subscribe(() => { if (on() !== wasOn) apply(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") apply();
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) apply(); });

  /** 出典の一覧（設定の奥）。朝・昼・夕方・夜の順。 */
  const credits = () => SLOTS.map((slot) => ({ slot, ...PHOTO[slot] }));

  KN.sky = { apply, slotOf, sunOf, nextChange, credits, SLOTS, PHOTO };
})();
