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

   季節×時間帯の16枚（`img/sky/<季節>-<札>.webp`。出どころは `PHOTO` と docs/sky.md の表）。
   季節は立春・立夏・立秋・立冬で区切ります（js/season.js）。読めてから `data-sky-img` に
   写真の札（`autumn-day` など）を付けます。CSS は時間帯の札とそろったときだけ写真を敷くので、
   読めないあいだ・オフラインで持っていないあいだは描いた空のまま。次の時間帯の一枚も、
   手の空いたときに読んでおきます。
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

  /* 季節（立春・立夏・立秋・立冬で区切る）。js/season.js の候の番号 k は春分の初候から数えるので、
     節気の番号（k / 3）で 立夏 3・立秋 9・立冬 15・立春 21。季節は日で替わる（その日の節気）。 */
  const SEASONS = ["spring", "summer", "autumn", "winter"];
  function seasonOf(now) {
    const r = KN.season.of(KN.util.dayKey(now));
    const s = r ? Math.floor(r.k / 3) : 12;
    return s >= 21 || s < 3 ? "spring" : s < 9 ? "summer" : s < 15 ? "autumn" : "winter";
  }
  /** その時刻の写真の札（"autumn-day" など）。 */
  const photoOf = (now) => `${seasonOf(now)}-${slotOf(now)}`;

  /* 写真の札 → 写真（docs/sky.md の「写真の表」と同じ中身。Wikimedia Commons）。CC BY／BY-SA は
     作者・ライセンス・URL の表示が要る（設定 → 外観 →「空の写真の出典」）。sw.js は写真を一度覚えたら
     取り直さないので、**描き直したら `?v=` を上げる**（base.css の --sky-photo も同じ値に）。 */
  const PHOTO = {
    "spring-morning": { file: "img/sky/spring-morning.webp", name: "春の朝", title: "2010-4-18 日の出(The sunrise) - panoramio", author: "ys1979", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:2010-4-18_日の出(The_sunrise)_-_panoramio.jpg", why: "霞む山並みに昇る春の日" },
    "spring-day": { file: "img/sky/spring-day.webp", name: "春の昼", title: "Aomori-Hirosaki Cherry Blossom Festival and Mt. Iwaki-xl", author: "mko294", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Aomori-Hirosaki_Cherry_Blossom_Festival_and_Mt._Iwaki-xl.jpg", why: "弘前城の堀の桜と岩木山" },
    "spring-evening": { file: "img/sky/spring-evening.webp", name: "春の夕方", title: "Shiroyone-Senmaida sunset", author: "MaedaAkihiko", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Shiroyone-Senmaida_sunset.jpg", why: "白米千枚田と海に沈む夕日" },
    "spring-night": { file: "img/sky/spring-night.webp", name: "春の夜", title: "Niigata-Snowy mountain and spring Milky Way - Flickr - Japanese beauty", author: "Koichi Hayakawa", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Niigata-Snowy_mountain_and_spring_Milky_Way_-_Flickr_-_Japanese_beauty.jpg", why: "雪の山と春の天の川（新潟）" },
    "summer-morning": { file: "img/sky/summer-morning.webp", name: "夏の朝", title: "Find47 Niigata-Early summer awakening (Yamakoshi's rice terraces and ponds)-m", author: "Koichi Hayakawa", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Find47_Niigata-Early_summer_awakening_(Yamakoshi's_rice_terraces_and_ponds)-m.jpg", why: "山古志の棚田に昇る初夏の朝日" },
    "summer-day": { file: "img/sky/summer-day.webp", name: "夏の昼", title: "Find47 Niigata-Vitamin color (Yamamotoyama Kogen sunflower field, Ojiya City)-m", author: "Koichi Hayakawa", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Find47_Niigata-Vitamin_color_(Yamamotoyama_Kogen_sunflower_field,_Ojiya_City)-m.jpg", why: "山本山高原のひまわり畑と夏の雲" },
    "summer-evening": { file: "img/sky/summer-evening.webp", name: "夏の夕方", title: "Niigata-Sunset on the Echigo Plain-m - Flickr - Japanese beauty", author: "Koichi Hayakawa", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Niigata-Sunset_on_the_Echigo_Plain-m_-_Flickr_-_Japanese_beauty.jpg", why: "水を張った越後平野に沈む夕日" },
    "summer-night": { file: "img/sky/summer-night.webp", name: "夏の夜", title: "Find47 Niigata-Dance of firefly (Takigashira marshland・Aga-town)-m", author: "Koichi Hayakawa", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Find47_Niigata-Dance_of_firefly_(Takigashira_marshland繝ｻAga-town)-m.jpg", why: "滝頭湿原の蛍（阿賀町）" },
    "autumn-morning": { file: "img/sky/autumn-morning.webp", name: "秋の朝", title: "Mount Fuji early morning from Lake Motosu - Nov 2, 2008", author: "[puamelia]", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Mount_Fuji_early_morning_from_Lake_Motosu_-_Nov_2,_2008.jpg", why: "本栖湖から見た明け方の富士" },
    "autumn-day": { file: "img/sky/autumn-day.webp", name: "秋の昼", title: "Nagano-Togakushi Kagamiike Autumn leaves-xl", author: "Koichi Hayakawa", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Nagano-Togakushi_Kagamiike_Autumn_leaves-xl.jpg", why: "戸隠・鏡池に映る紅葉と戸隠連峰" },
    "autumn-evening": { file: "img/sky/autumn-evening.webp", name: "秋の夕方", title: "Landscape of Hazaki (Niigata City, a row of Hazaki trees in Manganji) (51556156427)", author: "Koichi Hayakawa", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Landscape_of_Hazaki_(Niigata_City,_a_row_of_Hazaki_trees_in_Manganji)_(51556156427).jpg", why: "満願寺のはさ木並木に沈む夕日" },
    "autumn-night": { file: "img/sky/autumn-night.webp", name: "秋の夜", title: "Niigata-Echigo Plain is illuminated by the moonlight.-m - Flickr - Japanese beauty", author: "Koichi Hayakawa", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Niigata-Echigo_Plain_is_illuminated_by_the_moonlight.-m_-_Flickr_-_Japanese_beauty.jpg", why: "月明かりの雲と越後平野の灯" },
    "winter-morning": { file: "img/sky/winter-morning.webp", name: "冬の朝", title: "Find47 Niigata-River (Shinano River, Ojiya City)-m", author: "Koichi Hayakawa", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Find47_Niigata-River_(Shinano_River,_Ojiya_City)-m.jpg", why: "雪の信濃川の夜明け（小千谷市）" },
    "winter-day": { file: "img/sky/winter-day.webp", name: "冬の昼", title: "Mount Yoko from Tsuboniwa", author: "Naganojmmmm", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Mount_Yoko_from_Tsuboniwa.jpg", why: "霧氷の坪庭と青空（八ヶ岳）" },
    "winter-evening": { file: "img/sky/winter-evening.webp", name: "冬の夕方", title: "Sunset, Hokkaido", author: "Kaibak", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Sunset,_Hokkaido.jpg", why: "雪の林に沈む夕日（北海道）" },
    "winter-night": { file: "img/sky/winter-night.webp", name: "冬の夜", title: "Shirakawa-go 001", author: "tsuda", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Shirakawa-go_001.jpg", why: "雪の白川郷の灯" },
  };

  /* 読めた写真・読めなかった写真（同じものを何度も読みに行かない） */
  const loaded = new Set();
  const failed = new Set();
  function preload(key, done) {
    const p = PHOTO[key];
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
  let pic = null;

  /** `#head` に、いまの時間帯の札を付ける（設定で切ってあれば外す）。同じ札なら触らない。 */
  function apply() {
    const head = document.getElementById("head");
    if (!head) return;
    wasOn = on();
    const now = new Date();
    const want = wasOn ? slotOf(now) : null;
    pic = want ? photoOf(now) : null;
    const key = pic;
    if (!want) { head.removeAttribute("data-sky"); head.removeAttribute("data-sky-img"); }
    else if (head.getAttribute("data-sky") !== want) head.setAttribute("data-sky", want);
    if (want && head.getAttribute("data-sky-img") !== key) {
      preload(key, () => { if (pic === key && head.getAttribute("data-sky") === want) head.setAttribute("data-sky-img", key); });
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
      idle(() => preload(photoOf(new Date(+nextChange(now) + 1000))));
    }
    clearTimeout(timer);
    /* 隠れているあいだの時計は止まることがある（iPhone）。戻ってきたときにも測り直す（下）。
       季節は日で替わるので、夜中の0時にも測り直す。 */
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (want) timer = setTimeout(apply, Math.max(1000, Math.min(nextChange(now), midnight) - Date.now() + 1000));
  }

  apply();
  KN.store.subscribe(() => { if (on() !== wasOn) apply(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") apply();
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) apply(); });

  /** 出典の一覧（設定の奥）。春・夏・秋・冬、それぞれ朝・昼・夕方・夜の順。 */
  const credits = () => SEASONS.flatMap((season) => SLOTS.map((slot) => ({ key: `${season}-${slot}`, season, slot, ...PHOTO[`${season}-${slot}`] })));

  KN.sky = { apply, slotOf, sunOf, nextChange, seasonOf, photoOf, credits, SLOTS, SEASONS, PHOTO };
})();
